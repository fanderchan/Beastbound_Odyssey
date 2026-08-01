extends Control
class_name CharacterManagementPanel

const CharacterManagementVisualSkin := preload(
	"res://scripts/ui/character_management_visual_skin.gd"
)

signal close_requested
signal equipment_requested
signal rebirth_requested
signal stat_adjust_requested(stat_key: String, delta: int)
signal stat_confirm_requested
signal stat_pending_reset_requested
signal ride_filter_requested(filter_id: String)
signal ride_entry_selected(form_id: String)
signal tab_requested(tab_id: String)

const TAB_ATTRIBUTES := "attributes"
const TAB_STAT_POINTS := "stat_points"
const TAB_RIDE_PERMITS := "ride_permits"
const VALID_TABS := [TAB_ATTRIBUTES, TAB_STAT_POINTS, TAB_RIDE_PERMITS]
const STAT_KEYS := ["maxHp", "attack", "defense", "quick"]
const STAT_LABELS := {
	"maxHp": "生命",
	"attack": "攻击",
	"defense": "防御",
	"quick": "敏捷",
}
const ELEMENT_KEYS := ["earth", "water", "fire", "wind"]
const ELEMENT_LABELS := {
	"earth": "地",
	"water": "水",
	"fire": "火",
	"wind": "风",
}

var _built := false
var _active_tab_id := TAB_ATTRIBUTES
var _view_state: Dictionary = {}
var _canvas: Control
var _pages: Dictionary = {}
var _tab_buttons: Dictionary = {}

var _player_name_labels: Array[Label] = []
var _player_subtitle_labels: Array[Label] = []
var _player_showcases: Array[TextureRect] = []
var _player_fallbacks: Array[Label] = []

var _equipment_grid: GridContainer
var _companion_row: HBoxContainer
var _level_label: Label
var _title_family_label: Label
var _exp_bar: ProgressBar
var _exp_value_label: Label
var _hp_bar: ProgressBar
var _hp_value_label: Label
var _element_rows: Dictionary = {}
var _attribute_stat_grid: GridContainer

var _stat_summary_grid: GridContainer
var _stat_remaining_label: Label
var _stat_rows: Dictionary = {}
var _stat_reset_button: Button
var _stat_confirm_button: Button

var _ride_all_button: Button
var _ride_species_button: Button
var _ride_dynamic_filters: VBoxContainer
var _ride_filter_buttons: Dictionary = {}
var _ride_grid: GridContainer
var _ride_count_label: Label
var _ride_detail_name: Label
var _ride_detail_text: Label
var _selected_ride_form_id := ""
var _active_ride_filter := "all"


func _ready() -> void:
	_ensure_built()


func apply_view_state(state: Dictionary) -> void:
	_ensure_built()
	_view_state = state.duplicate(true)
	var requested_tab := str(state.get("activeTab", state.get("active_tab", "")))
	if requested_tab in VALID_TABS:
		_active_tab_id = requested_tab
	_refresh_player_showcase(state)
	_refresh_attributes(state)
	_refresh_stat_points(state)
	_refresh_ride_permits(state)
	_apply_tab_visibility()


func active_tab() -> String:
	return _active_tab_id


func switch_tab(tab_id: String) -> void:
	_ensure_built()
	if not tab_id in VALID_TABS:
		return
	_active_tab_id = tab_id
	_apply_tab_visibility()


func get_named_control(control_name: String) -> Control:
	_ensure_built()
	return find_child(control_name, true, false) as Control


func get_tab_button(tab_id: String) -> Button:
	_ensure_built()
	return _tab_buttons.get(tab_id) as Button


func get_stat_adjust_button(stat_key: String, delta: int) -> Button:
	_ensure_built()
	var row_value = _stat_rows.get(stat_key, {})
	var row := row_value as Dictionary if row_value is Dictionary else {}
	return row.get("plus" if delta > 0 else "minus") as Button


func get_ride_entry_button(form_id: String) -> Button:
	_ensure_built()
	return get_named_control("RideEntry_%s" % _node_safe_id(form_id)) as Button


func _ensure_built() -> void:
	if _built:
		return
	_built = true
	name = "CharacterManagementPanel"
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	custom_minimum_size = Vector2(1280.0, 720.0)
	mouse_filter = Control.MOUSE_FILTER_STOP
	focus_mode = Control.FOCUS_ALL

	_canvas = Control.new()
	_canvas.name = "CharacterManagementCanvas"
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
	CharacterManagementVisualSkin.add_backdrop(_canvas)
	_build_header()
	_build_attributes_page()
	_build_stat_points_page()
	_build_ride_permits_page()
	_apply_tab_visibility()


func _build_header() -> void:
	var title := Label.new()
	title.name = "PanelTitle"
	title.text = "角色"
	title.position = Vector2(29.0, 6.0)
	title.size = Vector2(220.0, 52.0)
	title.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	CharacterManagementVisualSkin.apply_title(title, 30)
	_canvas.add_child(title)

	var close_button := Button.new()
	close_button.name = "CloseButton"
	close_button.position = Vector2(1202.0, 5.0)
	close_button.size = Vector2(58.0, 50.0)
	close_button.focus_mode = Control.FOCUS_ALL
	CharacterManagementVisualSkin.apply_close_button(close_button)
	close_button.pressed.connect(_on_close_pressed)
	_canvas.add_child(close_button)

	var tab_specs := [
		{"id": TAB_ATTRIBUTES, "label": "属性"},
		{"id": TAB_STAT_POINTS, "label": "加点"},
		{"id": TAB_RIDE_PERMITS, "label": "骑证"},
	]
	for index in tab_specs.size():
		var spec: Dictionary = tab_specs[index]
		var tab_id := str(spec.get("id", ""))
		var button := Button.new()
		button.name = "Tab_%s" % tab_id
		button.text = str(spec.get("label", ""))
		button.position = Vector2(1092.0, 103.0 + float(index) * 68.0)
		button.size = Vector2(132.0, 54.0)
		button.focus_mode = Control.FOCUS_ALL
		button.pressed.connect(_on_tab_pressed.bind(tab_id))
		_canvas.add_child(button)
		_tab_buttons[tab_id] = button


func _build_attributes_page() -> void:
	var page := _new_page("AttributesPage")
	_pages[TAB_ATTRIBUTES] = page

	var equipment_panel := PanelContainer.new()
	equipment_panel.name = "EquipmentPanel"
	equipment_panel.position = Vector2(28.0, 79.0)
	equipment_panel.size = Vector2(218.0, 392.0)
	equipment_panel.add_theme_stylebox_override(
		"panel",
		CharacterManagementVisualSkin.panel_style()
	)
	page.add_child(equipment_panel)
	var equipment_margin := _margin_container(14, 13, 14, 14)
	equipment_panel.add_child(equipment_margin)
	var equipment_column := VBoxContainer.new()
	equipment_column.add_theme_constant_override("separation", 10)
	equipment_margin.add_child(equipment_column)
	var equipment_title := _new_label("装备", 20, false)
	equipment_title.name = "EquipmentTitle"
	equipment_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	equipment_column.add_child(equipment_title)
	var equipment_action := Button.new()
	equipment_action.name = "EquipmentDetailsButton"
	equipment_action.text = "查看装备详情"
	equipment_action.focus_mode = Control.FOCUS_ALL
	equipment_action.pressed.connect(_on_equipment_pressed)
	CharacterManagementVisualSkin.apply_action_button(equipment_action, false, false, true)
	equipment_column.add_child(equipment_action)
	_equipment_grid = GridContainer.new()
	_equipment_grid.name = "EquipmentGrid"
	_equipment_grid.columns = 3
	_equipment_grid.add_theme_constant_override("h_separation", 5)
	_equipment_grid.add_theme_constant_override("v_separation", 7)
	equipment_column.add_child(_equipment_grid)
	var rebirth_button := Button.new()
	rebirth_button.name = "RebirthPreviewButton"
	rebirth_button.text = "转生预览"
	rebirth_button.position = Vector2(67.0, 493.0)
	rebirth_button.size = Vector2(140.0, 42.0)
	rebirth_button.focus_mode = Control.FOCUS_ALL
	rebirth_button.pressed.connect(_on_rebirth_pressed)
	CharacterManagementVisualSkin.apply_action_button(rebirth_button, false)
	page.add_child(rebirth_button)

	_build_player_stage(page, Vector2(260.0, 72.0), Vector2(334.0, 590.0), true)

	var detail_panel := PanelContainer.new()
	detail_panel.name = "AttributeDetailPanel"
	detail_panel.position = Vector2(620.0, 72.0)
	detail_panel.size = Vector2(448.0, 592.0)
	detail_panel.add_theme_stylebox_override(
		"panel",
		CharacterManagementVisualSkin.large_framed_panel_style()
	)
	page.add_child(detail_panel)
	var detail_margin := _margin_container(23, 21, 23, 20)
	detail_panel.add_child(detail_margin)
	var detail_column := VBoxContainer.new()
	detail_column.add_theme_constant_override("separation", 8)
	detail_margin.add_child(detail_column)
	_level_label = _new_label("等级 --", 25, false)
	_level_label.name = "LevelLabel"
	detail_column.add_child(_level_label)
	_title_family_label = _new_label("称号 暂无    家族 暂无", 14, true)
	_title_family_label.name = "TitleFamilyLabel"
	_title_family_label.visible = false
	detail_column.add_child(_title_family_label)
	_exp_bar = _build_labeled_progress(
		detail_column,
		"经验",
		"ExperienceBar",
		Color(0.14, 0.67, 0.94, 1.0)
	)
	_exp_value_label = _bar_value_label(_exp_bar)
	_hp_bar = _build_labeled_progress(
		detail_column,
		"生命",
		"HealthBar",
		Color(0.34, 0.78, 0.22, 1.0)
	)
	_hp_value_label = _bar_value_label(_hp_bar)

	var element_panel := PanelContainer.new()
	element_panel.name = "ElementPanel"
	element_panel.custom_minimum_size = Vector2(0.0, 104.0)
	element_panel.add_theme_stylebox_override(
		"panel",
		CharacterManagementVisualSkin.inset_style(0.72, 8)
	)
	detail_column.add_child(element_panel)
	var element_margin := _margin_container(13, 8, 13, 7)
	element_panel.add_child(element_margin)
	var element_column := VBoxContainer.new()
	element_column.add_theme_constant_override("separation", 4)
	element_margin.add_child(element_column)
	var element_title := _new_label("元素属性", 17, false)
	element_column.add_child(element_title)
	for element_key in ELEMENT_KEYS:
		var row := HBoxContainer.new()
		row.name = "Element_%s" % element_key
		row.add_theme_constant_override("separation", 7)
		element_column.add_child(row)
		var label := _new_label(str(ELEMENT_LABELS.get(element_key, element_key)), 13, false)
		label.custom_minimum_size.x = 24.0
		label.add_theme_color_override(
			"font_color",
			CharacterManagementVisualSkin.element_color(element_key)
		)
		row.add_child(label)
		var segments := HBoxContainer.new()
		segments.name = "Segments"
		segments.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		segments.add_theme_constant_override("separation", 3)
		row.add_child(segments)
		var value_label := _new_label("0", 13, true)
		value_label.name = "Value"
		value_label.custom_minimum_size.x = 24.0
		value_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		row.add_child(value_label)
		_element_rows[element_key] = {
			"segments": segments,
			"value": value_label,
		}

	var stats_title := _new_label("人物属性", 18, false)
	detail_column.add_child(stats_title)
	_attribute_stat_grid = GridContainer.new()
	_attribute_stat_grid.name = "AttributeStatGrid"
	_attribute_stat_grid.columns = 2
	_attribute_stat_grid.add_theme_constant_override("h_separation", 10)
	_attribute_stat_grid.add_theme_constant_override("v_separation", 7)
	detail_column.add_child(_attribute_stat_grid)


func _build_stat_points_page() -> void:
	var page := _new_page("StatPointsPage")
	_pages[TAB_STAT_POINTS] = page
	_build_player_stage(page, Vector2(90.0, 72.0), Vector2(492.0, 592.0), false)

	var panel := PanelContainer.new()
	panel.name = "StatAllocationPanel"
	panel.position = Vector2(620.0, 72.0)
	panel.size = Vector2(448.0, 592.0)
	panel.add_theme_stylebox_override(
		"panel",
		CharacterManagementVisualSkin.large_framed_panel_style()
	)
	page.add_child(panel)
	var margin := _margin_container(24, 20, 24, 18)
	panel.add_child(margin)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 12)
	margin.add_child(column)
	var title := _new_label("属性加点", 26, false)
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	column.add_child(title)
	var description := _new_label("先调整本次分配，确认后一次生效", 13, true)
	description.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	column.add_child(description)
	_stat_summary_grid = GridContainer.new()
	_stat_summary_grid.name = "StatSummaryGrid"
	_stat_summary_grid.columns = 2
	_stat_summary_grid.add_theme_constant_override("h_separation", 14)
	_stat_summary_grid.add_theme_constant_override("v_separation", 5)
	column.add_child(_stat_summary_grid)
	_stat_remaining_label = _new_label("剩余属性点  0", 18, false)
	_stat_remaining_label.name = "RemainingStatPointsLabel"
	_stat_remaining_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_stat_remaining_label.add_theme_color_override(
		"font_color",
		CharacterManagementVisualSkin.GOLD_TEXT
	)
	column.add_child(_stat_remaining_label)

	var rows_panel := PanelContainer.new()
	rows_panel.name = "StatDraftRowsPanel"
	rows_panel.size_flags_vertical = Control.SIZE_EXPAND_FILL
	rows_panel.add_theme_stylebox_override(
		"panel",
		CharacterManagementVisualSkin.inset_style(0.78, 8)
	)
	column.add_child(rows_panel)
	var rows_margin := _margin_container(14, 12, 14, 12)
	rows_panel.add_child(rows_margin)
	var rows_column := VBoxContainer.new()
	rows_column.add_theme_constant_override("separation", 9)
	rows_margin.add_child(rows_column)
	for stat_key in STAT_KEYS:
		var row := _build_stat_adjust_row(stat_key)
		rows_column.add_child(row)

	var actions := HBoxContainer.new()
	actions.name = "StatActions"
	actions.alignment = BoxContainer.ALIGNMENT_CENTER
	actions.add_theme_constant_override("separation", 20)
	column.add_child(actions)
	_stat_reset_button = Button.new()
	_stat_reset_button.name = "ResetPendingStatsButton"
	_stat_reset_button.text = "清空本次"
	_stat_reset_button.custom_minimum_size = Vector2(142.0, 44.0)
	_stat_reset_button.focus_mode = Control.FOCUS_ALL
	_stat_reset_button.pressed.connect(_on_stat_pending_reset_pressed)
	CharacterManagementVisualSkin.apply_action_button(_stat_reset_button, false)
	actions.add_child(_stat_reset_button)
	_stat_confirm_button = Button.new()
	_stat_confirm_button.name = "ConfirmStatsButton"
	_stat_confirm_button.text = "确认加点"
	_stat_confirm_button.custom_minimum_size = Vector2(142.0, 44.0)
	_stat_confirm_button.focus_mode = Control.FOCUS_ALL
	_stat_confirm_button.pressed.connect(_on_stat_confirm_pressed)
	CharacterManagementVisualSkin.apply_action_button(_stat_confirm_button, true)
	actions.add_child(_stat_confirm_button)


func _build_ride_permits_page() -> void:
	var page := _new_page("RidePermitsPage")
	_pages[TAB_RIDE_PERMITS] = page

	var filter_panel := PanelContainer.new()
	filter_panel.name = "RideFilterPanel"
	filter_panel.position = Vector2(30.0, 82.0)
	filter_panel.size = Vector2(252.0, 584.0)
	filter_panel.add_theme_stylebox_override(
		"panel",
		CharacterManagementVisualSkin.panel_style()
	)
	page.add_child(filter_panel)
	var filter_margin := _margin_container(14, 14, 14, 14)
	filter_panel.add_child(filter_margin)
	var filter_column := VBoxContainer.new()
	filter_column.add_theme_constant_override("separation", 8)
	filter_margin.add_child(filter_column)
	var filter_title := _new_label("骑宠分类", 22, false)
	filter_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	filter_column.add_child(filter_title)
	_ride_all_button = _new_filter_button("全部", "all")
	_ride_all_button.name = "RideFilter_all"
	filter_column.add_child(_ride_all_button)
	_ride_species_button = _new_filter_button("种族", "species")
	_ride_species_button.name = "RideFilter_species"
	filter_column.add_child(_ride_species_button)
	var separator := HSeparator.new()
	separator.custom_minimum_size.y = 8.0
	filter_column.add_child(separator)
	_ride_dynamic_filters = VBoxContainer.new()
	_ride_dynamic_filters.name = "RideDynamicFilters"
	_ride_dynamic_filters.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_ride_dynamic_filters.add_theme_constant_override("separation", 7)
	filter_column.add_child(_ride_dynamic_filters)

	# A fixed Panel is intentional here. PanelContainer propagates the grid's
	# minimum size upward and can push the full-screen catalog past 720 px when
	# card content grows; this outer frame must remain a hard 1280x720 boundary.
	var permits_panel := Panel.new()
	permits_panel.name = "RidePermitCatalogPanel"
	permits_panel.position = Vector2(316.0, 72.0)
	permits_panel.size = Vector2(752.0, 604.0)
	permits_panel.clip_contents = true
	permits_panel.add_theme_stylebox_override(
		"panel",
		CharacterManagementVisualSkin.large_framed_panel_style()
	)
	page.add_child(permits_panel)
	var permits_margin := _margin_container(18, 17, 18, 17)
	permits_margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	permits_panel.add_child(permits_margin)
	var permits_column := VBoxContainer.new()
	permits_column.add_theme_constant_override("separation", 8)
	permits_margin.add_child(permits_column)
	var heading_row := HBoxContainer.new()
	permits_column.add_child(heading_row)
	var title := _new_label("骑宠资格", 25, false)
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	heading_row.add_child(title)
	_ride_count_label = _new_label("0 个", 14, true)
	_ride_count_label.name = "RideCountLabel"
	_ride_count_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	heading_row.add_child(_ride_count_label)
	var scroll := ScrollContainer.new()
	scroll.name = "RidePermitScroll"
	scroll.custom_minimum_size = Vector2(0.0, 390.0)
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	permits_column.add_child(scroll)
	_ride_grid = GridContainer.new()
	_ride_grid.name = "RidePermitGrid"
	_ride_grid.columns = 3
	_ride_grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_ride_grid.add_theme_constant_override("h_separation", 9)
	_ride_grid.add_theme_constant_override("v_separation", 9)
	scroll.add_child(_ride_grid)
	var detail_panel := PanelContainer.new()
	detail_panel.name = "RidePermitDetail"
	detail_panel.custom_minimum_size = Vector2(0.0, 104.0)
	detail_panel.add_theme_stylebox_override(
		"panel",
		CharacterManagementVisualSkin.inset_style(0.78, 8)
	)
	permits_column.add_child(detail_panel)
	var detail_margin := _margin_container(13, 9, 13, 9)
	detail_panel.add_child(detail_margin)
	var detail_column := VBoxContainer.new()
	detail_column.add_theme_constant_override("separation", 3)
	detail_margin.add_child(detail_column)
	_ride_detail_name = _new_label("请选择骑宠资格", 18, false)
	_ride_detail_name.name = "RideDetailName"
	detail_column.add_child(_ride_detail_name)
	_ride_detail_text = _new_label("", 13, true)
	_ride_detail_text.name = "RideDetailText"
	_ride_detail_text.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_ride_detail_text.size_flags_vertical = Control.SIZE_EXPAND_FILL
	detail_column.add_child(_ride_detail_text)


func _build_player_stage(
	parent: Control,
	position_value: Vector2,
	size_value: Vector2,
	include_companions: bool
) -> void:
	var stage := Control.new()
	stage.name = "PlayerStage_%s" % parent.name
	stage.position = position_value
	stage.size = size_value
	stage.mouse_filter = Control.MOUSE_FILTER_IGNORE
	parent.add_child(stage)
	var name_label := _new_label("冒险者", 25, false)
	name_label.name = "PlayerName"
	name_label.position = Vector2(0.0, 0.0)
	name_label.size = Vector2(size_value.x, 38.0)
	name_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	stage.add_child(name_label)
	_player_name_labels.append(name_label)
	var subtitle_label := _new_label("", 13, true)
	subtitle_label.name = "PlayerSubtitle"
	subtitle_label.position = Vector2(0.0, 36.0)
	subtitle_label.size = Vector2(size_value.x, 26.0)
	subtitle_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	stage.add_child(subtitle_label)
	_player_subtitle_labels.append(subtitle_label)
	var artwork := TextureRect.new()
	artwork.name = "PlayerArtwork"
	artwork.position = Vector2(6.0, 62.0)
	artwork.size = Vector2(size_value.x - 12.0, 414.0 if include_companions else 448.0)
	artwork.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	artwork.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	artwork.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	artwork.mouse_filter = Control.MOUSE_FILTER_IGNORE
	stage.add_child(artwork)
	_player_showcases.append(artwork)
	var fallback := _new_label("人物形象尚未载入", 15, true)
	fallback.name = "PlayerArtworkFallback"
	fallback.position = artwork.position
	fallback.size = artwork.size
	fallback.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	fallback.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	fallback.mouse_filter = Control.MOUSE_FILTER_IGNORE
	stage.add_child(fallback)
	_player_fallbacks.append(fallback)
	if include_companions:
		_companion_row = HBoxContainer.new()
		_companion_row.name = "CompanionRow"
		_companion_row.position = Vector2(17.0, 486.0)
		_companion_row.size = Vector2(size_value.x - 34.0, 88.0)
		_companion_row.alignment = BoxContainer.ALIGNMENT_CENTER
		_companion_row.add_theme_constant_override("separation", 12)
		stage.add_child(_companion_row)


func _build_labeled_progress(
	parent: VBoxContainer,
	label_text: String,
	control_name: String,
	fill_color: Color
) -> ProgressBar:
	var block := VBoxContainer.new()
	block.add_theme_constant_override("separation", 2)
	parent.add_child(block)
	var label := _new_label(label_text, 14, false)
	block.add_child(label)
	var bar := ProgressBar.new()
	bar.name = control_name
	bar.custom_minimum_size = Vector2(0.0, 24.0)
	bar.show_percentage = false
	bar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	CharacterManagementVisualSkin.apply_progress_bar(bar, fill_color)
	block.add_child(bar)
	var value_label := _new_label("0 / 0", 12, false)
	value_label.name = "ValueLabel"
	value_label.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	value_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	value_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	value_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	bar.add_child(value_label)
	return bar


func _bar_value_label(bar: ProgressBar) -> Label:
	return bar.get_node("ValueLabel") as Label


func _build_stat_adjust_row(stat_key: String) -> Control:
	var row := Control.new()
	row.name = "StatRow_%s" % stat_key
	row.custom_minimum_size = Vector2(0.0, 56.0)
	var label := _new_label(str(STAT_LABELS.get(stat_key, stat_key)), 17, false)
	label.position = Vector2(0.0, 10.0)
	label.size = Vector2(55.0, 38.0)
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	row.add_child(label)
	var minus_button := Button.new()
	minus_button.name = "Minus_%s" % stat_key
	minus_button.text = ""
	minus_button.icon = CharacterManagementVisualSkin.STAT_MINUS_ICON_TEXTURE
	minus_button.expand_icon = true
	minus_button.position = Vector2(64.0, 8.0)
	minus_button.size = Vector2(42.0, 40.0)
	minus_button.focus_mode = Control.FOCUS_ALL
	minus_button.pressed.connect(_on_stat_adjust_pressed.bind(stat_key, -1))
	CharacterManagementVisualSkin.apply_action_button(minus_button, false, false, true)
	row.add_child(minus_button)
	var track := ProgressBar.new()
	track.name = "DraftTrack_%s" % stat_key
	track.position = Vector2(114.0, 13.0)
	track.size = Vector2(148.0, 30.0)
	track.min_value = 0.0
	track.max_value = 1.0
	track.show_percentage = false
	track.mouse_filter = Control.MOUSE_FILTER_IGNORE
	CharacterManagementVisualSkin.apply_progress_bar(
		track,
		CharacterManagementVisualSkin.GOLD_TEXT
	)
	row.add_child(track)
	var pending_label := _new_label("+0", 14, false)
	pending_label.name = "Pending_%s" % stat_key
	pending_label.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	pending_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	pending_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	pending_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	track.add_child(pending_label)
	var plus_button := Button.new()
	plus_button.name = "Plus_%s" % stat_key
	plus_button.text = ""
	plus_button.icon = CharacterManagementVisualSkin.STAT_PLUS_ICON_TEXTURE
	plus_button.expand_icon = true
	plus_button.position = Vector2(270.0, 8.0)
	plus_button.size = Vector2(42.0, 40.0)
	plus_button.focus_mode = Control.FOCUS_ALL
	plus_button.pressed.connect(_on_stat_adjust_pressed.bind(stat_key, 1))
	CharacterManagementVisualSkin.apply_action_button(plus_button, false, false, true)
	row.add_child(plus_button)
	var value_label := _new_label("0", 17, false)
	value_label.name = "Projected_%s" % stat_key
	value_label.position = Vector2(318.0, 10.0)
	value_label.size = Vector2(50.0, 38.0)
	value_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	value_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	row.add_child(value_label)
	_stat_rows[stat_key] = {
		"minus": minus_button,
		"plus": plus_button,
		"track": track,
		"pending": pending_label,
		"projected": value_label,
	}
	return row


func _refresh_player_showcase(state: Dictionary) -> void:
	var player := _player_state(state)
	var player_name := str(player.get("name", state.get("playerName", "冒险者"))).strip_edges()
	if player_name == "":
		player_name = "冒险者"
	var subtitle := str(player.get("subtitle", state.get("playerSubtitle", ""))).strip_edges()
	if subtitle == "":
		var appearance_name := str(player.get("appearanceName", "")).strip_edges()
		var rebirth_count := maxi(0, int(player.get("rebirthCount", 0)))
		if appearance_name != "":
			subtitle = "%s｜%d转" % [appearance_name, rebirth_count]
	var showcase_texture := _texture_from(
		player.get(
			"showcaseTexture",
			player.get(
				"showcaseTexturePath",
				player.get(
					"appearanceTexturePath",
					state.get("showcaseTexture", null)
				)
			)
		)
	)
	for label in _player_name_labels:
		label.text = player_name
	for label in _player_subtitle_labels:
		label.text = subtitle
	for artwork in _player_showcases:
		artwork.texture = CharacterManagementVisualSkin.content_trimmed_texture(
			showcase_texture
		)
		artwork.visible = showcase_texture != null
	for fallback in _player_fallbacks:
		fallback.visible = showcase_texture == null


func _refresh_attributes(state: Dictionary) -> void:
	_refresh_equipment(_dictionary_array(state.get("equipmentSlots", [])))
	_refresh_companions(_dictionary_array(state.get(
		"companions",
		state.get("battlePets", [])
	)))
	var player := _player_state(state)
	var level := maxi(1, int(player.get("level", state.get("level", 1))))
	_level_label.text = "等级  %d" % level
	var title_text := str(player.get("title", state.get("title", "暂无"))).strip_edges()
	var family_text := str(player.get("family", state.get("family", "暂无"))).strip_edges()
	if title_text == "":
		title_text = "暂无"
	if family_text == "":
		family_text = "暂无"
	_title_family_label.text = "称号  %s    家族  %s" % [title_text, family_text]
	var exp_value := maxi(0, int(player.get("exp", state.get("exp", 0))))
	var next_exp := int(player.get("nextExp", state.get("nextExp", 1)))
	if next_exp <= 0:
		_set_progress(_exp_bar, _exp_value_label, 1, 1)
		_exp_value_label.text = "已满级"
	else:
		_set_progress(_exp_bar, _exp_value_label, exp_value, next_exp)
	var hp_value := maxi(0, int(player.get("hp", state.get("hp", 0))))
	var max_hp := maxi(1, int(player.get("maxHp", state.get("maxHp", 1))))
	_set_progress(_hp_bar, _hp_value_label, hp_value, max_hp)
	_refresh_elements(_dictionary_value(player.get(
		"elements",
		state.get("elements", {})
	)))
	_refresh_attribute_stats(_stat_row_array(state))


func _refresh_equipment(slots: Array[Dictionary]) -> void:
	_clear_children(_equipment_grid)
	if slots.is_empty():
		var empty_label := _new_label("暂无装备", 14, true)
		empty_label.custom_minimum_size = Vector2(176.0, 150.0)
		empty_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		empty_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		_equipment_grid.add_child(empty_label)
		return
	for index in mini(9, slots.size()):
		var slot: Dictionary = slots[index]
		var button := Button.new()
		var slot_id := str(slot.get("slotId", slot.get("id", index)))
		button.name = "EquipmentSlot_%s" % _node_safe_id(slot_id)
		button.custom_minimum_size = Vector2(56.0, 76.0)
		button.focus_mode = Control.FOCUS_ALL
		button.tooltip_text = str(slot.get(
			"tooltip",
			slot.get("itemName", slot.get("itemLabel", slot.get("slotLabel", "")))
		))
		var occupied := bool(slot.get("occupied", slot.get("filled", false)))
		button.add_theme_stylebox_override(
			"normal",
			CharacterManagementVisualSkin.equipment_slot_style(occupied)
		)
		button.add_theme_stylebox_override(
			"hover",
			CharacterManagementVisualSkin.equipment_slot_style(occupied, true)
		)
		button.add_theme_stylebox_override(
			"pressed",
			CharacterManagementVisualSkin.equipment_slot_style(occupied, true)
		)
		button.pressed.connect(_on_equipment_pressed)
		_equipment_grid.add_child(button)
		var icon := TextureRect.new()
		icon.name = "Icon"
		icon.position = Vector2(6.0, 5.0)
		icon.size = Vector2(44.0, 48.0)
		icon.texture = CharacterManagementVisualSkin.content_trimmed_texture(
			_texture_from(slot.get("iconTexture", slot.get("iconTexturePath", null)))
		)
		icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		icon.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
		icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
		button.add_child(icon)
		var label := _new_label(str(slot.get(
			"shortLabel",
			slot.get("slotLabel", slot.get("label", ""))
		)), 9, true)
		label.name = "Label"
		label.position = Vector2(3.0, 54.0)
		label.size = Vector2(50.0, 18.0)
		label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		label.mouse_filter = Control.MOUSE_FILTER_IGNORE
		button.add_child(label)


func _refresh_companions(companions: Array[Dictionary]) -> void:
	if _companion_row == null:
		return
	_clear_children(_companion_row)
	for index in mini(2, companions.size()):
		var entry: Dictionary = companions[index]
		var card := PanelContainer.new()
		card.name = "Companion_%d" % index
		card.custom_minimum_size = Vector2(135.0, 84.0)
		card.add_theme_stylebox_override(
			"panel",
			CharacterManagementVisualSkin.card_style(false, false)
		)
		_companion_row.add_child(card)
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 6)
		card.add_child(row)
		var portrait := TextureRect.new()
		portrait.custom_minimum_size = Vector2(58.0, 72.0)
		portrait.texture = CharacterManagementVisualSkin.content_trimmed_texture(
			_texture_from(entry.get("portraitTexture", entry.get("portraitTexturePath", null)))
		)
		portrait.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		portrait.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		portrait.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
		portrait.mouse_filter = Control.MOUSE_FILTER_IGNORE
		row.add_child(portrait)
		var labels := VBoxContainer.new()
		labels.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(labels)
		var role_id := str(entry.get("role", ""))
		var role_text := str(entry.get(
			"roleLabel",
			"战宠" if role_id == "battle" else ("骑宠" if role_id == "ride" else "伙伴")
		))
		var role := _new_label(role_text, 11, true)
		labels.add_child(role)
		var occupied := bool(entry.get("occupied", true))
		var name_label := _new_label(
			str(entry.get("name", "未设置")) if occupied else "未设置",
			13,
			false
		)
		name_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		labels.add_child(name_label)
		var level_label := _new_label(
			"Lv.%d" % maxi(1, int(entry.get("level", 1))) if occupied else "",
			11,
			true
		)
		labels.add_child(level_label)
	if companions.is_empty():
		var empty := _new_label("未设置战宠或骑宠", 13, true)
		empty.custom_minimum_size = Vector2(290.0, 84.0)
		empty.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		empty.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		_companion_row.add_child(empty)


func _refresh_elements(elements: Dictionary) -> void:
	for element_key in ELEMENT_KEYS:
		var value := clampi(int(elements.get(element_key, 0)), 0, 10)
		var row_value = _element_rows.get(element_key, {})
		var row := row_value as Dictionary if row_value is Dictionary else {}
		var segments := row.get("segments") as HBoxContainer
		var value_label := row.get("value") as Label
		if segments == null or value_label == null:
			continue
		_clear_children(segments)
		for index in 10:
			var segment := Panel.new()
			segment.custom_minimum_size = Vector2(22.0, 8.0)
			segment.mouse_filter = Control.MOUSE_FILTER_IGNORE
			segment.add_theme_stylebox_override(
				"panel",
				CharacterManagementVisualSkin.element_segment_style(
					element_key,
					index < value
				)
			)
			segments.add_child(segment)
		value_label.text = str(value)


func _refresh_attribute_stats(rows: Array[Dictionary]) -> void:
	_clear_children(_attribute_stat_grid)
	for row in rows:
		var stat_key := str(row.get("key", row.get("id", row.get("statKey", ""))))
		if not stat_key in STAT_KEYS:
			continue
		var card := PanelContainer.new()
		card.custom_minimum_size = Vector2(188.0, 52.0)
		card.add_theme_stylebox_override(
			"panel",
			CharacterManagementVisualSkin.inset_style(0.62, 6)
		)
		_attribute_stat_grid.add_child(card)
		var margin := _margin_container(8, 5, 8, 5)
		card.add_child(margin)
		var column := VBoxContainer.new()
		column.add_theme_constant_override("separation", 0)
		margin.add_child(column)
		var headline := HBoxContainer.new()
		column.add_child(headline)
		var label := _new_label(str(row.get("label", STAT_LABELS.get(stat_key, stat_key))), 14, false)
		label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		headline.add_child(label)
		var value_label := _new_label(str(int(row.get("current", row.get("value", 0)))), 16, false)
		value_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		headline.add_child(value_label)
		var bonus := int(row.get(
			"bonus",
			int(row.get("equipmentBonus", 0)) + int(row.get("ridingBonus", 0))
		))
		var bonus_text := "基础 %d" % int(row.get("base", row.get("value", 0)))
		if bonus > 0:
			bonus_text += "  加成 +%d" % bonus
		var bonus_label := _new_label(bonus_text, 11, true)
		if bonus > 0:
			bonus_label.add_theme_color_override("font_color", CharacterManagementVisualSkin.GAIN_TEXT)
		column.add_child(bonus_label)
	if _attribute_stat_grid.get_child_count() == 0:
		var empty := _new_label("属性数据尚未载入", 13, true)
		empty.custom_minimum_size = Vector2(390.0, 70.0)
		empty.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		empty.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		_attribute_stat_grid.add_child(empty)


func _refresh_stat_points(state: Dictionary) -> void:
	var allocation_pending := bool(state.get("allocationPending", false))
	var rows := _stat_row_array(state)
	_clear_children(_stat_summary_grid)
	for row in rows:
		var stat_key := str(row.get("key", row.get("id", row.get("statKey", ""))))
		if not stat_key in STAT_KEYS:
			continue
		var summary := _new_label(
			"%s  %d" % [
				str(row.get("label", STAT_LABELS.get(stat_key, stat_key))),
				int(row.get("current", row.get("value", 0))),
			],
			14,
			false
		)
		summary.custom_minimum_size = Vector2(185.0, 24.0)
		_stat_summary_grid.add_child(summary)
	var allocation := _dictionary_value(state.get(
		"statAllocation",
		state.get("statPoints", {})
	))
	var pending := _dictionary_value(allocation.get(
		"pending",
		state.get("pendingAllocation", state.get("pendingStats", {}))
	))
	var player := _player_state(state)
	var remaining_before_pending := maxi(0, int(allocation.get(
		"remainingBeforePending",
		state.get(
			"remainingBeforePending",
			state.get("availableStatPoints", player.get("statPoints", 0))
		)
	)))
	var pending_total := 0
	for stat_key in STAT_KEYS:
		pending_total += maxi(0, int(pending.get(stat_key, 0)))
	var remaining_after_pending := maxi(0, int(allocation.get(
		"remainingAfterPending",
		state.get(
			"remainingAfterPending",
			state.get(
				"remainingStatPoints",
				remaining_before_pending - pending_total
			)
		)
	)))
	_stat_remaining_label.text = "剩余属性点  %d" % remaining_after_pending
	for stat_key in STAT_KEYS:
		var row_value = _stat_rows.get(stat_key, {})
		var controls := row_value as Dictionary if row_value is Dictionary else {}
		var source := _find_stat_row(rows, stat_key)
		var current := int(source.get("current", source.get("value", 0)))
		var pending_value := maxi(0, int(pending.get(
			stat_key,
			source.get("pendingPoints", source.get("pending", 0))
		)))
		var gain_per_point := maxi(1, int(source.get("gain", source.get("gainPerPoint", 1))))
		var projected := int(source.get(
			"projectedCurrent",
			current + pending_value * gain_per_point
		))
		var minus_button := controls.get("minus") as Button
		var plus_button := controls.get("plus") as Button
		var track := controls.get("track") as ProgressBar
		var pending_label := controls.get("pending") as Label
		var projected_label := controls.get("projected") as Label
		if minus_button != null:
			minus_button.disabled = allocation_pending or pending_value <= 0 or not bool(source.get("canDecrement", true))
		if plus_button != null:
			plus_button.disabled = allocation_pending or remaining_after_pending <= 0 or not bool(source.get("canIncrement", true))
		if track != null:
			track.max_value = float(maxi(1, remaining_before_pending))
			track.value = float(pending_value)
		if pending_label != null:
			pending_label.text = "+%d" % pending_value
		if projected_label != null:
			projected_label.text = str(projected)
	_stat_reset_button.disabled = allocation_pending or pending_total <= 0
	_stat_confirm_button.disabled = allocation_pending or pending_total <= 0 or not bool(allocation.get(
		"canConfirm",
		state.get("canConfirmAllocation", true)
	))
	_stat_confirm_button.text = "提交中" if allocation_pending else "确认加点"
	CharacterManagementVisualSkin.apply_action_button(
		_stat_reset_button,
		false,
		_stat_reset_button.disabled
	)
	CharacterManagementVisualSkin.apply_action_button(
		_stat_confirm_button,
		true,
		_stat_confirm_button.disabled
	)


func _refresh_ride_permits(state: Dictionary) -> void:
	var ride_state := _dictionary_value(state.get("ridePermits", state.get("ride", {})))
	var filters := _dictionary_array(ride_state.get(
		"filters",
		state.get("rideFilters", [])
	))
	_active_ride_filter = str(ride_state.get(
		"activeFilter",
		state.get("activeRideFilter", _active_ride_filter)
	))
	if _active_ride_filter == "":
		_active_ride_filter = "all"
	_refresh_ride_filters(filters)
	var entries := _dictionary_array(ride_state.get(
		"visibleEntries",
		state.get("visibleRideEntries", ride_state.get(
			"entries",
			state.get("rideEntries", [])
		))
	))
	_refresh_ride_entries(entries)
	_refresh_ride_filter_styles()


func _refresh_ride_filters(filters: Array[Dictionary]) -> void:
	_clear_children(_ride_dynamic_filters)
	_ride_filter_buttons.clear()
	_ride_filter_buttons["all"] = _ride_all_button
	_ride_filter_buttons["species"] = _ride_species_button
	for entry in filters:
		var filter_id := str(entry.get("id", "")).strip_edges()
		if filter_id == "" or filter_id in ["all", "species"]:
			continue
		var label := str(entry.get("label", filter_id)).strip_edges()
		var count := int(entry.get("count", -1))
		if count >= 0:
			label = "%s  %d" % [label, count]
		var button := _new_filter_button(label, filter_id)
		button.name = "RideFilter_%s" % _node_safe_id(filter_id)
		button.custom_minimum_size.y = 46.0
		_ride_dynamic_filters.add_child(button)
		_ride_filter_buttons[filter_id] = button


func _refresh_ride_filter_styles() -> void:
	_ride_dynamic_filters.visible = _active_ride_filter != "all"
	for filter_id in _ride_filter_buttons:
		var button := _ride_filter_buttons.get(filter_id) as Button
		if button == null:
			continue
		var selected := str(filter_id) == _active_ride_filter
		if str(filter_id) == "species" and _active_ride_filter != "all":
			selected = true
		CharacterManagementVisualSkin.apply_tab_button(
			button,
			selected
		)


func _refresh_ride_entries(entries: Array[Dictionary]) -> void:
	_clear_children(_ride_grid)
	var visible_entries: Array[Dictionary] = []
	for entry in entries:
		if bool(entry.get("visible", true)):
			visible_entries.append(entry)
	_ride_count_label.text = "%d 个" % visible_entries.size()
	if visible_entries.is_empty():
		var empty := _new_label("该分类暂无可骑乘形态", 16, true)
		empty.custom_minimum_size = Vector2(690.0, 250.0)
		empty.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		empty.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		_ride_grid.add_child(empty)
		_selected_ride_form_id = ""
		_refresh_ride_detail({})
		return
	var selected_entry: Dictionary = {}
	for entry in visible_entries:
		var form_id := str(entry.get("formId", entry.get("id", "")))
		if bool(entry.get("selected", false)) or form_id == _selected_ride_form_id:
			selected_entry = entry
			_selected_ride_form_id = form_id
			break
	if selected_entry.is_empty():
		selected_entry = visible_entries[0]
		_selected_ride_form_id = str(selected_entry.get("formId", selected_entry.get("id", "")))
	for entry in visible_entries:
		_build_ride_entry(entry)
	_refresh_ride_detail(selected_entry)


func _build_ride_entry(entry: Dictionary) -> void:
	var form_id := str(entry.get("formId", entry.get("id", ""))).strip_edges()
	if form_id == "":
		return
	var selected := form_id == _selected_ride_form_id or bool(entry.get("selected", false))
	var locked := bool(entry.get("locked", false))
	var button := Button.new()
	button.name = "RideEntry_%s" % _node_safe_id(form_id)
	button.custom_minimum_size = Vector2(224.0, 178.0)
	button.focus_mode = Control.FOCUS_ALL
	button.tooltip_text = str(entry.get(
		"tooltip",
		entry.get("formName", entry.get("name", ""))
	))
	button.add_theme_stylebox_override(
		"normal",
		CharacterManagementVisualSkin.card_style(selected, locked)
	)
	button.add_theme_stylebox_override(
		"hover",
		CharacterManagementVisualSkin.card_style(true, locked)
	)
	button.add_theme_stylebox_override(
		"pressed",
		CharacterManagementVisualSkin.card_style(true, locked)
	)
	button.add_theme_stylebox_override(
		"focus",
		CharacterManagementVisualSkin.card_style(true, locked)
	)
	button.pressed.connect(_on_ride_entry_pressed.bind(form_id))
	_ride_grid.add_child(button)
	var portrait := TextureRect.new()
	portrait.name = "Portrait"
	portrait.position = Vector2(48.0, 12.0)
	portrait.size = Vector2(128.0, 104.0)
	portrait.texture = CharacterManagementVisualSkin.content_trimmed_texture(
		_texture_from(entry.get("portraitTexture", entry.get("portraitTexturePath", null)))
	)
	portrait.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	portrait.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	portrait.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	portrait.mouse_filter = Control.MOUSE_FILTER_IGNORE
	button.add_child(portrait)
	var name_label := _new_label(str(entry.get("formName", entry.get("name", "骑宠"))), 16, false)
	name_label.name = "Name"
	name_label.position = Vector2(10.0, 118.0)
	name_label.size = Vector2(204.0, 25.0)
	name_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	name_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	name_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	button.add_child(name_label)
	var status_text := str(entry.get("statusLabel", entry.get("status", ""))).strip_edges()
	var status_label := _new_label(status_text, 12, true)
	status_label.name = "Status"
	status_label.position = Vector2(10.0, 144.0)
	status_label.size = Vector2(204.0, 22.0)
	status_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	status_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	status_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	if bool(entry.get("currentRiding", entry.get("currentRide", entry.get("riding", false)))):
		status_label.add_theme_color_override("font_color", CharacterManagementVisualSkin.GAIN_TEXT)
	button.add_child(status_label)
	if locked:
		var overlay := ColorRect.new()
		overlay.name = "AvailabilityOverlay"
		overlay.position = Vector2(4.0, 4.0)
		overlay.size = Vector2(216.0, 170.0)
		overlay.color = Color(0.018, 0.014, 0.011, 0.68)
		overlay.mouse_filter = Control.MOUSE_FILTER_IGNORE
		button.add_child(overlay)
		var lock_icon := TextureRect.new()
		lock_icon.name = "LockIcon"
		lock_icon.position = Vector2(78.0, 28.0)
		lock_icon.size = Vector2(60.0, 60.0)
		lock_icon.texture = CharacterManagementVisualSkin.RIDE_LOCKED_ICON_TEXTURE
		lock_icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		lock_icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		lock_icon.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
		lock_icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
		overlay.add_child(lock_icon)
		var overlay_label := _new_label(str(entry.get("overlayText", "未激活")), 16, false)
		overlay_label.name = "OverlayText"
		overlay_label.position = Vector2(14.0, 92.0)
		overlay_label.size = Vector2(188.0, 28.0)
		overlay_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		overlay_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
		overlay.add_child(overlay_label)
	else:
		var owned_icon := TextureRect.new()
		owned_icon.name = "OwnedBadgeIcon"
		owned_icon.position = Vector2(7.0, 7.0)
		owned_icon.size = Vector2(42.0, 42.0)
		owned_icon.texture = CharacterManagementVisualSkin.RIDE_OWNED_ICON_TEXTURE
		owned_icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		owned_icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		owned_icon.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
		owned_icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
		button.add_child(owned_icon)
		var corner_text := str(entry.get("cornerBadgeText", "可骑乘")).strip_edges()
		if corner_text != "":
			var corner_badge := PanelContainer.new()
			corner_badge.name = "AvailabilityBadge"
			corner_badge.position = Vector2(139.0, 8.0)
			corner_badge.size = Vector2(75.0, 27.0)
			corner_badge.mouse_filter = Control.MOUSE_FILTER_IGNORE
			corner_badge.add_theme_stylebox_override(
				"panel",
				CharacterManagementVisualSkin.inset_style(0.88, 6)
			)
			button.add_child(corner_badge)
			var corner_label := _new_label(corner_text, 11, false)
			corner_label.name = "AvailabilityBadgeText"
			corner_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
			corner_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
			corner_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
			corner_label.add_theme_color_override(
				"font_color",
				CharacterManagementVisualSkin.GAIN_TEXT
			)
			corner_badge.add_child(corner_label)


func _refresh_ride_detail(entry: Dictionary) -> void:
	if entry.is_empty():
		_ride_detail_name.text = "请选择骑宠资格"
		_ride_detail_text.text = ""
		return
	_ride_detail_name.text = str(entry.get("formName", entry.get("name", "骑宠资格")))
	var lines: PackedStringArray = []
	var permit_label := str(entry.get("permitLabel", entry.get("permitStatus", ""))).strip_edges()
	var codex_label := str(entry.get("codexLabel", entry.get("codexStatus", ""))).strip_edges()
	var ownership_label := str(entry.get("ownershipLabel", entry.get("ownershipStatus", ""))).strip_edges()
	for text_value in [permit_label, codex_label, ownership_label]:
		if str(text_value) != "":
			lines.append(str(text_value))
	if bool(entry.get("currentRiding", entry.get("currentRide", entry.get("riding", false)))):
		lines.append("当前正在骑乘")
	if permit_label == "":
		if bool(entry.get("permitFree", false)):
			lines.append("无需专属骑宠证")
		elif bool(entry.get("permitRequired", false)):
			lines.append("骑宠证已获得" if bool(entry.get("permitOwned", false)) else "尚未获得骑宠证")
	var owned_count := maxi(0, int(entry.get("ownedCount", 0)))
	if ownership_label == "":
		lines.append("拥有 %d 只" % owned_count if owned_count > 0 else "尚未拥有该宠物")
	var detail := str(entry.get("detail", entry.get("description", ""))).strip_edges()
	if detail != "":
		lines.append(detail)
	_ride_detail_text.text = " · ".join(lines)


func _apply_tab_visibility() -> void:
	for tab_id in _pages:
		var page := _pages.get(tab_id) as Control
		if page != null:
			page.visible = str(tab_id) == _active_tab_id
	for tab_id in _tab_buttons:
		var button := _tab_buttons.get(tab_id) as Button
		if button != null:
			CharacterManagementVisualSkin.apply_tab_button(
				button,
				str(tab_id) == _active_tab_id
			)


func _new_page(page_name: String) -> Control:
	var page := Control.new()
	page.name = page_name
	page.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	page.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_canvas.add_child(page)
	return page


func _new_filter_button(label: String, filter_id: String) -> Button:
	var button := Button.new()
	button.text = label
	button.custom_minimum_size = Vector2(0.0, 54.0)
	button.focus_mode = Control.FOCUS_ALL
	button.pressed.connect(_on_ride_filter_pressed.bind(filter_id))
	CharacterManagementVisualSkin.apply_tab_button(button, filter_id == _active_ride_filter)
	return button


func _new_label(text_value: String, font_size: int, muted: bool) -> Label:
	var label := Label.new()
	label.text = text_value
	CharacterManagementVisualSkin.apply_body(label, font_size, muted)
	return label


func _margin_container(left: int, top: int, right: int, bottom: int) -> MarginContainer:
	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", left)
	margin.add_theme_constant_override("margin_top", top)
	margin.add_theme_constant_override("margin_right", right)
	margin.add_theme_constant_override("margin_bottom", bottom)
	return margin


func _set_progress(bar: ProgressBar, label: Label, value: int, maximum: int) -> void:
	bar.max_value = float(maxi(1, maximum))
	bar.value = float(clampi(value, 0, maximum))
	label.text = "%d / %d" % [value, maximum]


func _player_state(state: Dictionary) -> Dictionary:
	return _dictionary_value(state.get("player", state.get("playerSummary", {})))


func _stat_row_array(state: Dictionary) -> Array[Dictionary]:
	var rows := _dictionary_array(state.get("statRows", state.get("stats", [])))
	if not rows.is_empty():
		return rows
	var summary := _dictionary_value(state.get("statSummary", {}))
	var fallback: Array[Dictionary] = []
	for stat_key in STAT_KEYS:
		var row_value = summary.get(stat_key, {})
		if row_value is Dictionary:
			var row := (row_value as Dictionary).duplicate(true)
			row["id"] = stat_key
			fallback.append(row)
	return fallback


func _find_stat_row(rows: Array[Dictionary], stat_key: String) -> Dictionary:
	for row in rows:
		if str(row.get("key", row.get("id", row.get("statKey", "")))) == stat_key:
			return row
	return {"id": stat_key, "label": STAT_LABELS.get(stat_key, stat_key)}


func _dictionary_array(value) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	if value is Array:
		for item in value:
			if item is Dictionary:
				result.append(item as Dictionary)
	return result


func _dictionary_value(value) -> Dictionary:
	return value as Dictionary if value is Dictionary else {}


func _texture_from(value) -> Texture2D:
	if value is Texture2D:
		return value as Texture2D
	var path := str(value).strip_edges()
	if path == "" or not ResourceLoader.exists(path, "Texture2D"):
		return null
	return load(path) as Texture2D


func _clear_children(parent: Node) -> void:
	if parent == null:
		return
	for child in parent.get_children():
		parent.remove_child(child)
		child.queue_free()


func _node_safe_id(value: String) -> String:
	var result := value.strip_edges()
	for token in ["/", "\\", ":", ".", " ", "-", "|"]:
		result = result.replace(token, "_")
	return result


func _on_close_pressed() -> void:
	close_requested.emit()


func _on_equipment_pressed() -> void:
	equipment_requested.emit()


func _on_rebirth_pressed() -> void:
	rebirth_requested.emit()


func _on_tab_pressed(tab_id: String) -> void:
	switch_tab(tab_id)
	tab_requested.emit(tab_id)


func _on_stat_adjust_pressed(stat_key: String, delta: int) -> void:
	stat_adjust_requested.emit(stat_key, delta)


func _on_stat_confirm_pressed() -> void:
	stat_confirm_requested.emit()


func _on_stat_pending_reset_pressed() -> void:
	stat_pending_reset_requested.emit()


func _on_ride_filter_pressed(filter_id: String) -> void:
	_active_ride_filter = filter_id
	_refresh_ride_filter_styles()
	ride_filter_requested.emit(filter_id)


func _on_ride_entry_pressed(form_id: String) -> void:
	_selected_ride_form_id = form_id
	var ride_state := _dictionary_value(_view_state.get(
		"ridePermits",
		_view_state.get("ride", {})
	))
	var entries := _dictionary_array(ride_state.get(
		"visibleEntries",
		_view_state.get("visibleRideEntries", ride_state.get(
			"entries",
			_view_state.get("rideEntries", [])
		))
	))
	for entry in entries:
		var entry_id := str(entry.get("formId", entry.get("id", "")))
		if entry_id == form_id:
			break
	_refresh_ride_entries(entries)
	ride_entry_selected.emit(form_id)
