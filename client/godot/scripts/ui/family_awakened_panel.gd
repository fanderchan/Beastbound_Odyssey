extends PanelContainer
class_name FamilyAwakenedPanel

const PetManagementVisualSkin := preload(
	"res://scripts/ui/pet_management_visual_skin.gd"
)
const BACKDROP_TEXTURE := preload(
	"res://assets/ui/pet_codex_awakened_v1/runtime/pet_codex_backdrop_1280x720.png"
)
const FAMILY_ICON_TEXTURE := preload(
	"res://assets/ui/world_hud_awakened_v1/runtime/icons/family.png"
)

signal close_requested
signal refresh_requested
signal leave_requested
signal join_requested(family_id: String)
signal tab_selected(tab_id: String)
signal challenge_requested(manor_id: String)
signal war_enter_requested(war_id: String)
signal war_leave_requested(war_id: String)
signal war_battle_requested(war_id: String)
signal war_resolve_requested(war_id: String)
signal shop_requested(shop_id: String)

const TAB_LOBBY := "lobby"
const TAB_INFO := "info"
const TAB_MEMBERS := "members"
const TAB_ACTIVITIES := "activities"
const TAB_MANORS := "manors"
const JOINED_TABS := [TAB_INFO, TAB_MEMBERS, TAB_ACTIVITIES, TAB_MANORS]
const CANVAS_SIZE := Vector2(1280.0, 720.0)

const COLOR_CREAM := Color(0.96, 0.91, 0.78, 1.0)
const COLOR_MUTED := Color(0.72, 0.68, 0.58, 1.0)
const COLOR_GOLD := Color(1.0, 0.72, 0.24, 1.0)
const COLOR_GREEN := Color(0.62, 0.86, 0.38, 1.0)
const COLOR_RED := Color(0.96, 0.48, 0.31, 1.0)
const COLOR_BROWN := Color(0.26, 0.16, 0.09, 1.0)

# Stable semantic controls used by the host coordinator and focused checks.
var close_button: Button
var refresh_button: Button
var leave_button: Button
var status_label: Label
var name_input: LineEdit
var create_button: Button
var family_summary_container: VBoxContainer
var family_list_container: VBoxContainer
var manor_list_container: VBoxContainer

var _built := false
var _canvas: Control
var _view_state: Dictionary = {}
var _active_tab := TAB_LOBBY
var _selected_lobby_family_id := ""
var _tab_buttons: Dictionary = {}
var _page_container: Control
var _main_title_label: Label
var _main_subtitle_label: Label
var _crest_texture: TextureRect
var _family_name_label: Label
var _family_id_label: Label
var _left_notice_label: Label
var _open_create_button: Button
var _create_overlay: Control
var _create_popup: PanelContainer
var _lobby_join_button: Button
var _dynamic_action_buttons: Array[Button] = []


func _ready() -> void:
	_ensure_built()


func apply_view_state(state: Dictionary) -> void:
	_ensure_built()
	_view_state = state.duplicate(true)
	var has_family := bool(_view_state.get("hasFamily", false))
	var manor_visitor_mode := bool(_view_state.get("manorVisitorMode", false))
	var has_server_session := bool(_view_state.get("hasServerSession", false))
	var request_pending := bool(_view_state.get("requestPending", false))
	var requested_tab := str(_view_state.get("activeTab", _active_tab)).strip_edges()
	if manor_visitor_mode:
		_active_tab = TAB_MANORS
	elif not has_family:
		_active_tab = TAB_LOBBY
	elif requested_tab in JOINED_TABS:
		_active_tab = requested_tab
	elif not _active_tab in JOINED_TABS:
		_active_tab = TAB_INFO

	status_label.text = str(_view_state.get("statusText", ""))
	status_label.tooltip_text = status_label.text
	refresh_button.disabled = request_pending or not has_server_session
	leave_button.visible = has_family
	leave_button.disabled = request_pending or not has_server_session
	_open_create_button.visible = not has_family
	_open_create_button.disabled = request_pending or not has_server_session
	_open_create_button.tooltip_text = (
		"登录服务器账号后可创建家族"
		if not has_server_session
		else "创建一个新家族"
	)
	create_button.disabled = request_pending or not has_server_session or has_family
	name_input.editable = has_server_session and not request_pending and not has_family
	name_input.placeholder_text = (
		"已加入家族"
		if has_family
		else "输入家族名（最多12个字）"
	)
	if has_family:
		hide_create_popup()
	_refresh_left_rail()
	_refresh_tab_rail()
	_refresh_page()


func active_tab() -> String:
	return _active_tab


func set_active_tab(tab_id: String, notify: bool = false) -> void:
	_ensure_built()
	var normalized := tab_id.strip_edges().to_lower()
	var has_family := bool(_view_state.get("hasFamily", false))
	var manor_visitor_mode := bool(_view_state.get("manorVisitorMode", false))
	if manor_visitor_mode:
		if normalized != TAB_MANORS:
			return
	elif not has_family:
		normalized = TAB_LOBBY
	elif not normalized in JOINED_TABS:
		return
	if normalized == _active_tab:
		return
	_active_tab = normalized
	_refresh_tab_rail()
	_refresh_page()
	if notify:
		tab_selected.emit(_active_tab)


func show_create_popup() -> void:
	_ensure_built()
	if bool(_view_state.get("hasFamily", false)):
		return
	_create_overlay.visible = true
	_create_overlay.move_to_front()
	name_input.grab_focus()


func hide_create_popup() -> void:
	if _create_overlay != null:
		_create_overlay.visible = false


func create_popup_visible() -> bool:
	return _create_overlay != null and _create_overlay.visible


func selected_lobby_family_id() -> String:
	return _selected_lobby_family_id


func dynamic_action_button_count() -> int:
	return _dynamic_action_buttons.size()


func is_within_viewport() -> bool:
	_ensure_built()
	var viewport_size := CANVAS_SIZE
	if is_inside_tree() and get_viewport() != null:
		viewport_size = get_viewport_rect().size
	var canvas_rect := Rect2(_canvas.position, _canvas.size)
	return Rect2(Vector2.ZERO, viewport_size).encloses(canvas_rect)


func _ensure_built() -> void:
	if _built:
		return
	_built = true
	name = "FamilyAwakenedPanel"
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	custom_minimum_size = CANVAS_SIZE
	mouse_filter = Control.MOUSE_FILTER_STOP
	focus_mode = Control.FOCUS_ALL
	add_theme_stylebox_override(
		"panel",
		PetManagementVisualSkin.transparent_panel_style()
	)

	_canvas = Control.new()
	_canvas.name = "FamilyCanvas"
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
	_add_backdrop()
	_build_header()
	_build_left_rail()
	_build_main_surface()
	_build_create_overlay()


func _add_backdrop() -> void:
	var backdrop := TextureRect.new()
	backdrop.name = "FamilyBackdrop"
	backdrop.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	backdrop.texture = BACKDROP_TEXTURE
	backdrop.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	backdrop.stretch_mode = TextureRect.STRETCH_SCALE
	backdrop.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	backdrop.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_canvas.add_child(backdrop)


func _build_header() -> void:
	var icon := TextureRect.new()
	icon.name = "FamilyHeaderIcon"
	icon.position = Vector2(25.0, 8.0)
	icon.size = Vector2(48.0, 48.0)
	icon.texture = FAMILY_ICON_TEXTURE
	icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	icon.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_canvas.add_child(icon)

	var title := _make_label("家族", 30, COLOR_CREAM)
	title.name = "PanelTitle"
	title.position = Vector2(74.0, 3.0)
	title.size = Vector2(170.0, 58.0)
	title.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	PetManagementVisualSkin.apply_title(title, 30)
	_canvas.add_child(title)

	status_label = _make_label("", 14, COLOR_GOLD)
	status_label.name = "FamilyStatus"
	status_label.position = Vector2(400.0, 55.0)
	status_label.size = Vector2(650.0, 34.0)
	status_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	status_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	status_label.tooltip_text = status_label.text
	_canvas.add_child(status_label)

	refresh_button = Button.new()
	refresh_button.name = "FamilyRefreshButton"
	refresh_button.text = "刷新"
	refresh_button.position = Vector2(1075.0, 10.0)
	refresh_button.size = Vector2(92.0, 42.0)
	PetManagementVisualSkin.apply_action_button(refresh_button, true)
	refresh_button.pressed.connect(func() -> void: refresh_requested.emit())
	_canvas.add_child(refresh_button)

	close_button = Button.new()
	close_button.name = "FamilyCloseButton"
	close_button.position = Vector2(1192.0, 7.0)
	close_button.size = Vector2(58.0, 50.0)
	close_button.tooltip_text = "关闭家族页"
	PetManagementVisualSkin.apply_close_button(close_button)
	close_button.pressed.connect(func() -> void: close_requested.emit())
	_canvas.add_child(close_button)


func _build_left_rail() -> void:
	_crest_texture = TextureRect.new()
	_crest_texture.name = "FamilyCrest"
	_crest_texture.position = Vector2(130.0, 106.0)
	_crest_texture.size = Vector2(165.0, 165.0)
	_crest_texture.texture = FAMILY_ICON_TEXTURE
	_crest_texture.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_crest_texture.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	_crest_texture.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	_crest_texture.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_canvas.add_child(_crest_texture)

	_family_name_label = _make_label("家族大厅", 24, COLOR_CREAM)
	_family_name_label.position = Vector2(92.0, 265.0)
	_family_name_label.size = Vector2(240.0, 42.0)
	_family_name_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_family_name_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_canvas.add_child(_family_name_label)

	_family_id_label = _make_label("", 13, COLOR_MUTED)
	_family_id_label.position = Vector2(92.0, 302.0)
	_family_id_label.size = Vector2(240.0, 24.0)
	_family_id_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_canvas.add_child(_family_id_label)

	family_summary_container = VBoxContainer.new()
	family_summary_container.name = "FamilySummaryContainer"
	family_summary_container.position = Vector2(98.0, 337.0)
	family_summary_container.size = Vector2(228.0, 180.0)
	family_summary_container.add_theme_constant_override("separation", 7)
	_canvas.add_child(family_summary_container)

	_left_notice_label = _make_label("", 13, COLOR_MUTED)
	_left_notice_label.position = Vector2(100.0, 526.0)
	_left_notice_label.size = Vector2(224.0, 58.0)
	_left_notice_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_left_notice_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_left_notice_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_canvas.add_child(_left_notice_label)

	_open_create_button = Button.new()
	_open_create_button.name = "OpenFamilyCreateButton"
	_open_create_button.text = "创建家族"
	_open_create_button.position = Vector2(126.0, 603.0)
	_open_create_button.size = Vector2(172.0, 46.0)
	PetManagementVisualSkin.apply_action_button(_open_create_button)
	_open_create_button.pressed.connect(show_create_popup)
	_canvas.add_child(_open_create_button)

	leave_button = Button.new()
	leave_button.name = "FamilyLeaveButton"
	leave_button.text = "退出家族"
	leave_button.position = Vector2(126.0, 603.0)
	leave_button.size = Vector2(172.0, 46.0)
	leave_button.tooltip_text = "退出当前家族"
	PetManagementVisualSkin.apply_action_button(leave_button)
	leave_button.pressed.connect(func() -> void: leave_requested.emit())
	_canvas.add_child(leave_button)


func _build_main_surface() -> void:
	_main_title_label = _make_label("家族大厅", 24, COLOR_CREAM)
	_main_title_label.name = "FamilyPageTitle"
	_main_title_label.position = Vector2(415.0, 100.0)
	_main_title_label.size = Vector2(420.0, 42.0)
	PetManagementVisualSkin.apply_title(_main_title_label, 24)
	_canvas.add_child(_main_title_label)

	_main_subtitle_label = _make_label("", 13, COLOR_MUTED)
	_main_subtitle_label.position = Vector2(735.0, 109.0)
	_main_subtitle_label.size = Vector2(310.0, 28.0)
	_main_subtitle_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_canvas.add_child(_main_subtitle_label)

	_page_container = Control.new()
	_page_container.name = "FamilyPageContent"
	_page_container.position = Vector2(405.0, 145.0)
	_page_container.size = Vector2(752.0, 520.0)
	_page_container.clip_contents = true
	_canvas.add_child(_page_container)

	var tabs := [
		[TAB_INFO, "信息"],
		[TAB_MEMBERS, "成员"],
		[TAB_ACTIVITIES, "活动"],
		[TAB_MANORS, "庄园"],
	]
	for index in range(tabs.size()):
		var entry: Array = tabs[index]
		var tab_id := str(entry[0])
		var button := Button.new()
		button.name = "FamilyTab%s" % tab_id.capitalize()
		button.text = str(entry[1])
		button.position = Vector2(1060.0, 154.0 + float(index) * 66.0)
		button.size = Vector2(110.0, 54.0)
		button.toggle_mode = true
		PetManagementVisualSkin.apply_tab_button(button)
		button.pressed.connect(func() -> void: set_active_tab(tab_id, true))
		_tab_buttons[tab_id] = button
		_canvas.add_child(button)


func _build_create_overlay() -> void:
	_create_overlay = Control.new()
	_create_overlay.name = "FamilyCreateOverlay"
	_create_overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_create_overlay.mouse_filter = Control.MOUSE_FILTER_STOP
	_create_overlay.visible = false
	_canvas.add_child(_create_overlay)

	var dimmer := ColorRect.new()
	dimmer.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	dimmer.color = Color(0.015, 0.012, 0.009, 0.74)
	dimmer.mouse_filter = Control.MOUSE_FILTER_STOP
	_create_overlay.add_child(dimmer)

	_create_popup = PanelContainer.new()
	_create_popup.name = "FamilyCreatePopup"
	_create_popup.position = Vector2(380.0, 195.0)
	_create_popup.size = Vector2(520.0, 310.0)
	_create_popup.add_theme_stylebox_override("panel", _parchment_style())
	_create_overlay.add_child(_create_popup)

	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 14)
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_create_popup.add_child(column)

	var title := _make_label("创建家族", 26, COLOR_BROWN)
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.custom_minimum_size.y = 48.0
	title.add_theme_font_override("font", PetManagementVisualSkin.display_font())
	column.add_child(title)

	var rule := HSeparator.new()
	rule.add_theme_constant_override("separation", 8)
	column.add_child(rule)

	var prompt := _make_label("为新的家族取一个名字", 16, COLOR_BROWN)
	prompt.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	column.add_child(prompt)

	name_input = LineEdit.new()
	name_input.name = "FamilyNameInput"
	name_input.placeholder_text = "输入家族名（最多12个字）"
	name_input.max_length = 12
	name_input.custom_minimum_size = Vector2(0.0, 48.0)
	name_input.add_theme_font_override("font", PetManagementVisualSkin.body_font())
	name_input.add_theme_font_size_override("font_size", 16)
	name_input.add_theme_color_override("font_color", COLOR_CREAM)
	name_input.add_theme_color_override("font_placeholder_color", COLOR_MUTED)
	name_input.add_theme_stylebox_override("normal", _input_style(false))
	name_input.add_theme_stylebox_override("focus", _input_style(true))
	column.add_child(name_input)

	var hint := _make_label("创建后你将成为族长，可参与九大庄园争夺。", 13, Color(0.43, 0.31, 0.20, 1.0))
	hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	column.add_child(hint)

	var actions := HBoxContainer.new()
	actions.add_theme_constant_override("separation", 14)
	actions.alignment = BoxContainer.ALIGNMENT_CENTER
	column.add_child(actions)

	var cancel_button := Button.new()
	cancel_button.text = "取消"
	PetManagementVisualSkin.apply_action_button(cancel_button)
	cancel_button.custom_minimum_size = Vector2(150.0, 46.0)
	cancel_button.pressed.connect(hide_create_popup)
	actions.add_child(cancel_button)

	create_button = Button.new()
	create_button.name = "FamilyCreateConfirmButton"
	create_button.text = "创建"
	PetManagementVisualSkin.apply_action_button(create_button)
	create_button.custom_minimum_size = Vector2(150.0, 46.0)
	actions.add_child(create_button)


func _refresh_left_rail() -> void:
	_clear_children(family_summary_container)
	var has_family := bool(_view_state.get("hasFamily", false))
	if not has_family:
		_family_name_label.text = "家族大厅"
		_family_id_label.text = "寻找同行的伙伴"
		_left_notice_label.text = "加入家族后，可查看成员、参加庄园战并进入家族专属道具场。"
		_add_summary_line("当前状态", "尚未加入")
		_add_summary_line("可加入家族", str(_families().size()))
		_add_summary_line("可争夺庄园", str(_manors().size()))
		return
	var family := _current_family()
	_family_name_label.text = str(family.get("name", "我的家族"))
	_family_id_label.text = "并肩冒险 · 共守庄园"
	_left_notice_label.text = str(family.get("noticeText", "族长尚未发布家族公告。"))
	_add_summary_line("族长", str(family.get("leaderLabel", "尚未同步")))
	_add_summary_line("成员", str(family.get("memberLabel", "0/100")))
	_add_summary_line("声望", str(int(family.get("fame", 0))))
	_add_summary_line("占领庄园", str(int(_view_state.get("ownedManorCount", 0))))


func _add_summary_line(label_text: String, value_text: String) -> void:
	var row := HBoxContainer.new()
	row.custom_minimum_size.y = 31.0
	var label := _make_label(label_text, 14, COLOR_MUTED)
	label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(label)
	var value := _make_label(value_text, 15, COLOR_GOLD)
	value.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	value.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	value.custom_minimum_size.x = 118.0
	row.add_child(value)
	family_summary_container.add_child(row)


func _refresh_tab_rail() -> void:
	var has_family := bool(_view_state.get("hasFamily", false))
	var manor_visitor_mode := bool(_view_state.get("manorVisitorMode", false))
	for tab_id in _tab_buttons:
		var button := _tab_buttons.get(tab_id) as Button
		if button == null:
			continue
		button.visible = has_family or (
			manor_visitor_mode and str(tab_id) == TAB_MANORS
		)
		button.button_pressed = str(tab_id) == _active_tab
		button.add_theme_color_override(
			"font_color",
			COLOR_BROWN if button.button_pressed else COLOR_CREAM
		)


func _refresh_page() -> void:
	_clear_children(_page_container)
	_dynamic_action_buttons.clear()
	var has_family := bool(_view_state.get("hasFamily", false))
	var manor_visitor_mode := bool(_view_state.get("manorVisitorMode", false))
	if not has_family and not manor_visitor_mode:
		_main_title_label.text = "家族大厅"
		_main_subtitle_label.text = "可加入家族  %d" % _families().size()
		_build_lobby_page()
		return
	match _active_tab:
		TAB_MEMBERS:
			_main_title_label.text = "家族成员"
			_main_subtitle_label.text = "成员  %d/%d" % [
				_members().size(),
				int(_current_family().get("maxMembers", 100)),
			]
			_build_members_page()
		TAB_ACTIVITIES:
			_main_title_label.text = "家族活动"
			_main_subtitle_label.text = "进行中的庄园战  %d" % int(
				_view_state.get("activeWarCount", 0)
			)
			_build_activities_page()
		TAB_MANORS:
			_main_title_label.text = "九大庄园"
			_main_subtitle_label.text = "我方占领  %d/%d" % [
				int(_view_state.get("ownedManorCount", 0)),
				_manors().size(),
			]
			_build_manors_page()
		_:
			_active_tab = TAB_INFO
			_main_title_label.text = "家族信息"
			_main_subtitle_label.text = str(_current_family().get("name", "我的家族"))
			_build_info_page()


func _build_lobby_page() -> void:
	var list_shell := PanelContainer.new()
	list_shell.position = Vector2(0.0, 0.0)
	list_shell.size = Vector2(462.0, 510.0)
	list_shell.add_theme_stylebox_override("panel", _dark_card_style(false))
	_page_container.add_child(list_shell)

	var list_column := VBoxContainer.new()
	list_column.add_theme_constant_override("separation", 8)
	list_shell.add_child(list_column)
	var heading := _make_label("家族列表", 18, COLOR_CREAM)
	heading.custom_minimum_size.y = 32.0
	list_column.add_child(heading)
	var list_hint := _make_label("点击家族可查看详情", 12, COLOR_MUTED)
	list_column.add_child(list_hint)
	var list_scroll := ScrollContainer.new()
	list_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	list_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	list_column.add_child(list_scroll)
	family_list_container = VBoxContainer.new()
	family_list_container.name = "FamilyListContainer"
	family_list_container.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	family_list_container.add_theme_constant_override("separation", 8)
	list_scroll.add_child(family_list_container)

	var families := _families()
	if _selected_lobby_family_id == "" or _family_for_id(
		_selected_lobby_family_id
	).is_empty():
		_selected_lobby_family_id = (
			str(families[0].get("familyId", "")) if not families.is_empty() else ""
		)
	if families.is_empty():
		family_list_container.add_child(
			_empty_state("暂无可加入家族", "可以从左侧创建一个新家族。", 338.0)
		)
	else:
		for family in families:
			family_list_container.add_child(_family_lobby_row(family))

	var detail_shell := PanelContainer.new()
	detail_shell.position = Vector2(480.0, 0.0)
	detail_shell.size = Vector2(272.0, 510.0)
	detail_shell.add_theme_stylebox_override("panel", _dark_card_style(true))
	_page_container.add_child(detail_shell)
	_build_lobby_detail(detail_shell, _family_for_id(_selected_lobby_family_id))


func _family_lobby_row(family: Dictionary) -> Control:
	var family_id := str(family.get("familyId", ""))
	var selected := family_id == _selected_lobby_family_id
	var button := Button.new()
	button.name = "FamilyRow%s" % family_id
	button.custom_minimum_size = Vector2(0.0, 74.0)
	button.text = "%s\n族长 %s    成员 %s    声望 %d" % [
		str(family.get("name", "家族")),
		str(family.get("leaderLabel", "尚未同步")),
		str(family.get("memberLabel", "0/100")),
		int(family.get("fame", 0)),
	]
	button.alignment = HORIZONTAL_ALIGNMENT_LEFT
	button.add_theme_font_override("font", PetManagementVisualSkin.body_font())
	button.add_theme_font_size_override("font_size", 14)
	button.add_theme_color_override("font_color", COLOR_CREAM)
	button.add_theme_color_override("font_hover_color", COLOR_GOLD)
	button.add_theme_color_override("font_pressed_color", COLOR_GOLD)
	button.add_theme_stylebox_override("normal", _lobby_row_style(selected, false))
	button.add_theme_stylebox_override("hover", _lobby_row_style(true, true))
	button.add_theme_stylebox_override("pressed", _lobby_row_style(true, false))
	button.pressed.connect(func() -> void:
		_selected_lobby_family_id = family_id
		_refresh_page()
	)
	return button


func _build_lobby_detail(parent: PanelContainer, family: Dictionary) -> void:
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 10)
	parent.add_child(column)
	if family.is_empty():
		column.add_child(_empty_state("尚未选择家族", "从左侧列表选择一个家族。", 448.0))
		return
	var crest := TextureRect.new()
	crest.custom_minimum_size = Vector2(0.0, 116.0)
	crest.texture = FAMILY_ICON_TEXTURE
	crest.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	crest.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	crest.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	crest.mouse_filter = Control.MOUSE_FILTER_IGNORE
	column.add_child(crest)
	var family_name := _make_label(str(family.get("name", "家族")), 21, COLOR_CREAM)
	family_name.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	column.add_child(family_name)
	column.add_child(_detail_pair("族长", str(family.get("leaderLabel", "尚未同步"))))
	column.add_child(_detail_pair("成员", str(family.get("memberLabel", "0/100"))))
	column.add_child(_detail_pair("声望", str(int(family.get("fame", 0)))))
	column.add_child(_detail_pair("庄园", "%d 座" % int(family.get("manorCount", 0))))
	var spacer := Control.new()
	spacer.size_flags_vertical = Control.SIZE_EXPAND_FILL
	column.add_child(spacer)
	_lobby_join_button = Button.new()
	_lobby_join_button.name = "FamilyJoinButton"
	_lobby_join_button.text = "加入家族"
	_lobby_join_button.disabled = (
		bool(_view_state.get("requestPending", false))
		or not bool(_view_state.get("hasServerSession", false))
	)
	_lobby_join_button.tooltip_text = "加入 %s" % str(family.get("name", "该家族"))
	PetManagementVisualSkin.apply_action_button(_lobby_join_button)
	_lobby_join_button.custom_minimum_size = Vector2(0.0, 48.0)
	var family_id := str(family.get("familyId", ""))
	_lobby_join_button.pressed.connect(func() -> void: join_requested.emit(family_id))
	column.add_child(_lobby_join_button)
	_dynamic_action_buttons.append(_lobby_join_button)


func _build_info_page() -> void:
	var notice := PanelContainer.new()
	notice.position = Vector2(0.0, 0.0)
	notice.size = Vector2(642.0, 98.0)
	notice.add_theme_stylebox_override("panel", _dark_card_style(true))
	_page_container.add_child(notice)
	var notice_column := VBoxContainer.new()
	notice_column.add_theme_constant_override("separation", 4)
	notice.add_child(notice_column)
	var notice_title := _make_label("家族公告", 17, COLOR_GOLD)
	notice_column.add_child(notice_title)
	var notice_body := _make_label(
		str(_current_family().get("noticeText", "族长尚未发布家族公告。")),
		14,
		COLOR_CREAM
	)
	notice_body.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	notice_body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	notice_column.add_child(notice_body)

	var stage_title := _make_label("家族核心成员", 16, COLOR_CREAM)
	stage_title.position = Vector2(0.0, 111.0)
	stage_title.size = Vector2(640.0, 28.0)
	stage_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_page_container.add_child(stage_title)

	var members := _members()
	var stage_entries: Array[Dictionary] = []
	for index in range(mini(members.size(), 3)):
		stage_entries.append(members[index])
	if stage_entries.is_empty():
		stage_entries.append({
			"displayLabel": str(_current_family().get("leaderLabel", "族长")),
			"roleLabel": "族长",
			"onlineLabel": "资料同步中",
			"onlineResolved": false,
		})
	for index in range(3):
		var member := stage_entries[index] if index < stage_entries.size() else {}
		var card := _core_member_card(member, index)
		card.position = Vector2(8.0 + float(index) * 211.0, 148.0)
		card.size = Vector2(196.0, 228.0)
		_page_container.add_child(card)

	var facts := PanelContainer.new()
	facts.position = Vector2(0.0, 390.0)
	facts.size = Vector2(642.0, 54.0)
	facts.add_theme_stylebox_override("panel", _dark_card_style(false))
	_page_container.add_child(facts)
	var facts_row := HBoxContainer.new()
	facts_row.alignment = BoxContainer.ALIGNMENT_CENTER
	facts_row.add_theme_constant_override("separation", 42)
	facts.add_child(facts_row)
	for fact in [
		"成员 %s" % str(_current_family().get("memberLabel", "0/100")),
		"声望 %d" % int(_current_family().get("fame", 0)),
		"庄园 %d" % int(_view_state.get("ownedManorCount", 0)),
	]:
		facts_row.add_child(_make_label(str(fact), 15, COLOR_GOLD))

	var manor_button := Button.new()
	manor_button.name = "FamilyViewManorsButton"
	manor_button.text = "查看家族庄园"
	manor_button.position = Vector2(210.0, 458.0)
	manor_button.size = Vector2(220.0, 48.0)
	PetManagementVisualSkin.apply_action_button(manor_button)
	manor_button.pressed.connect(func() -> void: set_active_tab(TAB_MANORS, true))
	_page_container.add_child(manor_button)
	_dynamic_action_buttons.append(manor_button)


func _core_member_card(member: Dictionary, index: int) -> PanelContainer:
	var card := PanelContainer.new()
	card.add_theme_stylebox_override("panel", _member_stage_style(index == 0))
	var column := VBoxContainer.new()
	column.alignment = BoxContainer.ALIGNMENT_CENTER
	column.add_theme_constant_override("separation", 6)
	card.add_child(column)
	var icon := TextureRect.new()
	icon.custom_minimum_size = Vector2(0.0, 94.0)
	icon.texture = FAMILY_ICON_TEXTURE
	icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	icon.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	icon.modulate = Color(1.0, 0.91, 0.67, 1.0) if index == 0 else Color(0.78, 0.82, 0.72, 0.94)
	column.add_child(icon)
	var role := str(member.get("roleLabel", "空缺")) if not member.is_empty() else "空缺"
	var role_label := _make_label(role, 14, COLOR_GOLD if index == 0 else COLOR_MUTED)
	role_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	column.add_child(role_label)
	var name_label := _make_label(
		str(member.get("displayLabel", "等待新成员")) if not member.is_empty() else "等待新成员",
		16,
		COLOR_CREAM
	)
	name_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	name_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	column.add_child(name_label)
	var online := bool(member.get("onlineResolved", false))
	var state_label := _make_label(
		str(member.get("onlineLabel", "")),
		13,
		COLOR_GREEN if online else COLOR_MUTED
	)
	state_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	column.add_child(state_label)
	return card


func _build_members_page() -> void:
	var shell := PanelContainer.new()
	shell.position = Vector2(0.0, 0.0)
	shell.size = Vector2(642.0, 510.0)
	shell.add_theme_stylebox_override("panel", _dark_card_style(false))
	_page_container.add_child(shell)
	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	shell.add_child(scroll)
	var rows := VBoxContainer.new()
	rows.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	rows.add_theme_constant_override("separation", 8)
	scroll.add_child(rows)
	var members := _members()
	if members.is_empty():
		rows.add_child(_empty_state("暂无成员资料", "刷新后可查看家族成员状态。", 440.0))
		return
	for member in members:
		rows.add_child(_member_row(member))


func _member_row(member: Dictionary) -> Control:
	var row := PanelContainer.new()
	row.custom_minimum_size = Vector2(0.0, 68.0)
	row.add_theme_stylebox_override("panel", _dark_card_style(false))
	var content := HBoxContainer.new()
	content.add_theme_constant_override("separation", 14)
	row.add_child(content)
	var crest := TextureRect.new()
	crest.custom_minimum_size = Vector2(52.0, 52.0)
	crest.texture = FAMILY_ICON_TEXTURE
	crest.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	crest.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	crest.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	content.add_child(crest)
	var names := VBoxContainer.new()
	names.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	content.add_child(names)
	var name_label := _make_label(str(member.get("displayLabel", "家族成员")), 16, COLOR_CREAM)
	names.add_child(name_label)
	var role_label := _make_label(str(member.get("roleLabel", "族员")), 13, COLOR_MUTED)
	names.add_child(role_label)
	var online := bool(member.get("onlineResolved", false))
	var status := _make_label(
		str(member.get("onlineLabel", "离线")),
		14,
		COLOR_GREEN if online else COLOR_MUTED
	)
	status.custom_minimum_size.x = 76.0
	status.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	status.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	content.add_child(status)
	return row


func _build_activities_page() -> void:
	var intro := PanelContainer.new()
	intro.position = Vector2(0.0, 0.0)
	intro.size = Vector2(642.0, 74.0)
	intro.add_theme_stylebox_override("panel", _dark_card_style(true))
	_page_container.add_child(intro)
	var intro_row := HBoxContainer.new()
	intro_row.add_theme_constant_override("separation", 12)
	intro.add_child(intro_row)
	var intro_text := VBoxContainer.new()
	intro_text.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	intro_row.add_child(intro_text)
	intro_text.add_child(_make_label("庄园争霸", 17, COLOR_GOLD))
	intro_text.add_child(_make_label("族长宣战，家族成员共同参战。", 13, COLOR_MUTED))
	var view_button := Button.new()
	view_button.text = "查看庄园"
	view_button.custom_minimum_size = Vector2(128.0, 42.0)
	PetManagementVisualSkin.apply_action_button(view_button, true)
	view_button.pressed.connect(func() -> void: set_active_tab(TAB_MANORS, true))
	intro_row.add_child(view_button)
	_dynamic_action_buttons.append(view_button)

	var scroll := ScrollContainer.new()
	scroll.position = Vector2(0.0, 88.0)
	scroll.size = Vector2(642.0, 422.0)
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_page_container.add_child(scroll)
	var rows := VBoxContainer.new()
	rows.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	rows.add_theme_constant_override("separation", 10)
	scroll.add_child(rows)
	var activities := _activities()
	if activities.is_empty():
		rows.add_child(_empty_state("目前没有进行中的庄园战", "族长可在庄园页选择目标发起挑战。", 360.0))
		return
	for activity in activities:
		rows.add_child(_war_activity_row(activity))


func _war_activity_row(war: Dictionary) -> Control:
	var row := PanelContainer.new()
	row.custom_minimum_size = Vector2(0.0, 116.0)
	row.add_theme_stylebox_override("panel", _dark_card_style(bool(war.get("warReady", false))))
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 6)
	row.add_child(column)
	var header := HBoxContainer.new()
	header.add_theme_constant_override("separation", 10)
	column.add_child(header)
	var title := _make_label(str(war.get("manorName", "庄园战")), 17, COLOR_CREAM)
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_child(title)
	header.add_child(_make_label(str(war.get("phaseLabel", "备战中")), 14, COLOR_GOLD))
	var matchup := _make_label("%s  VS  %s" % [
		str(war.get("challengerFamilyName", "挑战方")),
		str(war.get("defenderFamilyName", "守方")),
	], 14, COLOR_MUTED)
	column.add_child(matchup)
	var action_row := HBoxContainer.new()
	action_row.add_theme_constant_override("separation", 8)
	column.add_child(action_row)
	var roster := _make_label("参战 %s" % str(war.get("rosterLabel", "0/5 对 0/5")), 13, COLOR_MUTED)
	roster.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	action_row.add_child(roster)
	_add_war_action_buttons(action_row, war)
	return row


func _build_manors_page() -> void:
	var scroll := ScrollContainer.new()
	scroll.position = Vector2(0.0, 0.0)
	scroll.size = Vector2(642.0, 510.0)
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_page_container.add_child(scroll)
	manor_list_container = VBoxContainer.new()
	manor_list_container.name = "ManorListContainer"
	manor_list_container.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	manor_list_container.add_theme_constant_override("separation", 10)
	scroll.add_child(manor_list_container)
	var manors := _manors()
	if manors.is_empty():
		manor_list_container.add_child(_empty_state("暂无庄园资料", "刷新后可查看九大庄园状态。", 440.0))
		return
	for manor in manors:
		manor_list_container.add_child(_manor_row(manor))


func _manor_row(manor: Dictionary) -> Control:
	var war_value = manor.get("war", {})
	var war := war_value as Dictionary if war_value is Dictionary else {}
	var highlighted := bool(manor.get("focused", false)) or bool(
		manor.get("isOwnedByViewerFamily", false)
	)
	var row := PanelContainer.new()
	row.custom_minimum_size = Vector2(0.0, 128.0 if not war.is_empty() else 102.0)
	row.add_theme_stylebox_override("panel", _dark_card_style(highlighted))
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 6)
	row.add_child(column)
	var title_row := HBoxContainer.new()
	title_row.add_theme_constant_override("separation", 10)
	column.add_child(title_row)
	var title_prefix := "当前 · " if bool(manor.get("focused", false)) else ""
	var title := _make_label("%s%s" % [title_prefix, str(manor.get("name", "庄园"))], 17, COLOR_CREAM)
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title_row.add_child(title)
	var owner_color := COLOR_GREEN if bool(manor.get("isOwnedByViewerFamily", false)) else COLOR_GOLD
	var owner := _make_label("占领：%s" % str(manor.get("ownerLabel", "尚未占领")), 14, owner_color)
	title_row.add_child(owner)
	var meta_parts := [
		str(manor.get("village", "")),
		"守备 %d" % int(manor.get("neutralPower", 0)),
	]
	var peace_label := str(manor.get("peaceLabel", "")).strip_edges()
	if peace_label != "":
		meta_parts.append(peace_label)
	column.add_child(_make_label("  ·  ".join(meta_parts), 13, COLOR_MUTED))
	if not war.is_empty():
		column.add_child(_make_label("%s：%s VS %s（%s）" % [
			str(war.get("phaseLabel", "庄园战")),
			str(war.get("challengerFamilyName", "挑战方")),
			str(war.get("defenderFamilyName", "守方")),
			str(war.get("rosterLabel", "0/5 对 0/5")),
		], 13, COLOR_GOLD))
	var actions := HBoxContainer.new()
	actions.add_theme_constant_override("separation", 8)
	column.add_child(actions)
	var filler := Control.new()
	filler.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	actions.add_child(filler)
	if war.is_empty() and not bool(manor.get("isOwnedByViewerFamily", false)):
		var challenge := _small_action_button("宣战")
		challenge.disabled = not bool(manor.get("canChallenge", false))
		challenge.tooltip_text = (
			"仅族长可在休战期外宣战"
			if challenge.disabled
			else "向该庄园发起挑战"
		)
		var manor_id := str(manor.get("manorId", ""))
		challenge.pressed.connect(func() -> void: challenge_requested.emit(manor_id))
		actions.add_child(challenge)
		_dynamic_action_buttons.append(challenge)
	else:
		_add_war_action_buttons(actions, war)
	if bool(manor.get("canOpenShop", false)):
		var shop := _small_action_button("道具场")
		var shop_id := str(manor.get("shopId", ""))
		shop.pressed.connect(func() -> void: shop_requested.emit(shop_id))
		actions.add_child(shop)
		_dynamic_action_buttons.append(shop)
	return row


func _add_war_action_buttons(parent: HBoxContainer, war: Dictionary) -> void:
	var war_id := str(war.get("warId", ""))
	if bool(war.get("canEnter", false)):
		var enter := _small_action_button("参战")
		enter.pressed.connect(func() -> void: war_enter_requested.emit(war_id))
		parent.add_child(enter)
		_dynamic_action_buttons.append(enter)
	if bool(war.get("canLeave", false)):
		var leave := _small_action_button("退出")
		leave.pressed.connect(func() -> void: war_leave_requested.emit(war_id))
		parent.add_child(leave)
		_dynamic_action_buttons.append(leave)
	if bool(war.get("canOpenBattle", false)):
		var battle := _small_action_button("入场")
		battle.pressed.connect(func() -> void: war_battle_requested.emit(war_id))
		parent.add_child(battle)
		_dynamic_action_buttons.append(battle)
	if bool(war.get("canResolve", false)):
		var resolve := _small_action_button("结算")
		resolve.pressed.connect(func() -> void: war_resolve_requested.emit(war_id))
		parent.add_child(resolve)
		_dynamic_action_buttons.append(resolve)


func _small_action_button(text_value: String) -> Button:
	var button := Button.new()
	button.text = text_value
	PetManagementVisualSkin.apply_action_button(button, true)
	button.custom_minimum_size = Vector2(78.0, 36.0)
	return button


func _detail_pair(label_text: String, value_text: String) -> Control:
	var row := HBoxContainer.new()
	row.custom_minimum_size.y = 28.0
	var label := _make_label(label_text, 14, COLOR_MUTED)
	label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(label)
	var value := _make_label(value_text, 14, COLOR_GOLD)
	value.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	value.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	value.custom_minimum_size.x = 150.0
	row.add_child(value)
	return row


func _empty_state(title_text: String, detail_text: String, height: float) -> Control:
	var box := VBoxContainer.new()
	box.custom_minimum_size = Vector2(0.0, height)
	box.alignment = BoxContainer.ALIGNMENT_CENTER
	box.add_theme_constant_override("separation", 8)
	var icon := TextureRect.new()
	icon.custom_minimum_size = Vector2(0.0, 90.0)
	icon.texture = FAMILY_ICON_TEXTURE
	icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	icon.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	icon.modulate = Color(0.63, 0.57, 0.46, 0.58)
	box.add_child(icon)
	var title := _make_label(title_text, 17, COLOR_CREAM)
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	box.add_child(title)
	var detail := _make_label(detail_text, 13, COLOR_MUTED)
	detail.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	detail.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	box.add_child(detail)
	return box


func _make_label(text_value: String, font_size: int, color: Color) -> Label:
	var label := Label.new()
	label.text = text_value
	label.add_theme_font_override("font", PetManagementVisualSkin.body_font())
	label.add_theme_font_size_override("font_size", font_size)
	label.add_theme_color_override("font_color", color)
	label.add_theme_color_override("font_outline_color", Color(0.05, 0.025, 0.012, 0.88))
	label.add_theme_constant_override("outline_size", 1)
	return label


func _dark_card_style(highlight: bool) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.045, 0.034, 0.024, 0.82)
	style.border_color = Color(0.43, 0.31, 0.18, 0.84)
	if highlight:
		style.bg_color = Color(0.085, 0.060, 0.035, 0.90)
		style.border_color = Color(0.83, 0.58, 0.22, 0.95)
	style.set_border_width_all(1)
	style.set_corner_radius_all(8)
	style.content_margin_left = 12.0
	style.content_margin_right = 12.0
	style.content_margin_top = 10.0
	style.content_margin_bottom = 10.0
	return style


func _member_stage_style(leader: bool) -> StyleBoxFlat:
	var style := _dark_card_style(leader)
	style.bg_color = (
		Color(0.12, 0.082, 0.042, 0.88)
		if leader
		else Color(0.052, 0.042, 0.032, 0.84)
	)
	style.corner_radius_top_left = 22
	style.corner_radius_top_right = 22
	return style


func _lobby_row_style(selected: bool, hover: bool) -> StyleBoxFlat:
	var style := _dark_card_style(selected)
	if hover:
		style.bg_color = Color(0.12, 0.085, 0.045, 0.94)
	return style


func _parchment_style() -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.78, 0.71, 0.59, 1.0)
	style.border_color = Color(0.39, 0.27, 0.16, 1.0)
	style.set_border_width_all(4)
	style.set_corner_radius_all(10)
	style.content_margin_left = 32.0
	style.content_margin_right = 32.0
	style.content_margin_top = 22.0
	style.content_margin_bottom = 22.0
	return style


func _input_style(focused: bool) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.10, 0.074, 0.052, 0.94)
	style.border_color = Color(0.92, 0.66, 0.27, 1.0) if focused else Color(0.43, 0.31, 0.18, 0.9)
	style.set_border_width_all(2 if focused else 1)
	style.set_corner_radius_all(7)
	style.content_margin_left = 12.0
	style.content_margin_right = 12.0
	style.content_margin_top = 8.0
	style.content_margin_bottom = 8.0
	return style


func _clear_children(container: Node) -> void:
	if container == null:
		return
	for child in container.get_children():
		container.remove_child(child)
		child.queue_free()


func _current_family() -> Dictionary:
	var value = _view_state.get("currentFamily", {})
	return value as Dictionary if value is Dictionary else {}


func _families() -> Array[Dictionary]:
	return _dictionary_array(_view_state.get("families", []))


func _members() -> Array[Dictionary]:
	return _dictionary_array(_view_state.get("members", []))


func _activities() -> Array[Dictionary]:
	return _dictionary_array(_view_state.get("activities", []))


func _manors() -> Array[Dictionary]:
	return _dictionary_array(_view_state.get("manors", []))


func _family_for_id(family_id: String) -> Dictionary:
	for family in _families():
		if str(family.get("familyId", "")) == family_id:
			return family
	return {}


func _dictionary_array(value) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	if not (value is Array):
		return result
	for entry in value:
		if entry is Dictionary:
			result.append((entry as Dictionary).duplicate(true))
	return result
