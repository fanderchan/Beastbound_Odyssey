extends PanelContainer
class_name HangMatchmakingAwakenedPanel

const HangMatchmakingPresenter := preload(
	"res://scripts/ui/hang_matchmaking_presenter.gd"
)
const HangMatchmakingAwakenedVisualSkin := preload(
	"res://scripts/ui/hang_matchmaking_awakened_visual_skin.gd"
)

signal route_selected(route_id: String)
signal immediate_requested(route_id: String)
signal match_requested(route_id: String)
signal travel_requested(route_id: String)
signal cancel_requested
signal stop_requested
signal close_requested

const CANVAS_SIZE := Vector2(1280.0, 720.0)
const VIEW_BROWSE := HangMatchmakingPresenter.VIEW_BROWSE
const VIEW_PARTY := HangMatchmakingPresenter.VIEW_PARTY
const VIEW_MATCHING := HangMatchmakingPresenter.VIEW_MATCHING

var close_button: Button
var browse_tab_button: Button
var party_tab_button: Button
var primary_button: Button
var cancel_button: Button
var stop_button: Button

var route_buttons: Dictionary = {}
var party_route_buttons: Dictionary = {}
var listing_reference_labels: Dictionary = {}

var _built := false
var _canvas: Control
var _routes: Array[Dictionary] = []
var _current_map_id := ""
var _player_level := 1
var _selected_route_id := ""
var _view_mode := VIEW_BROWSE
var _pending := false
var _hang_active := false
var _state: Dictionary = HangMatchmakingPresenter.normalize_state({})

var _browse_group: Control
var _route_strip: HBoxContainer
var _selected_title: Label
var _selected_context: Label
var _selected_drop: Label
var _selected_rule: Label

var _party_group: Control
var _party_route_list: VBoxContainer
var _party_heading: Label
var _party_summary: Label
var _party_list: VBoxContainer
var _party_empty: Label
var _party_match_button: Button

var _matching_group: Control
var _matching_route: Label
var _matching_status: Label
var _matching_counts: Label
var _matching_waiting: Label
var _matching_rule: Label
var _member_row: HBoxContainer

var _status_label: Label
var _choice_scrim: ColorRect
var _choice_panel: PanelContainer
var _choice_title: Label
var _choice_route: Label
var _choice_immediate_button: Button
var _choice_match_button: Button


func _ready() -> void:
	_ensure_built()


func prepare() -> void:
	_ensure_built()


func configure_from_catalog(current_map_id: String, player_level: int) -> void:
	configure_routes(
		HangMatchmakingPresenter.routes_for_player(current_map_id, player_level),
		current_map_id,
		player_level
	)


func configure_routes(
	routes: Array[Dictionary],
	current_map_id: String = "",
	player_level: int = 1
) -> void:
	_ensure_built()
	_routes = []
	for route in routes:
		if str(route.get("routeId", "")).strip_edges() != "":
			_routes.append(route.duplicate(true))
	_current_map_id = current_map_id.strip_edges()
	_player_level = maxi(1, player_level)
	if HangMatchmakingPresenter.route_by_id(_routes, _selected_route_id).is_empty():
		_selected_route_id = HangMatchmakingPresenter.preferred_route_id(_routes)
	_rebuild_route_strip()
	_rebuild_party_route_list()
	_render_selected_route()
	_render_party_listings()


func apply_state(state: Dictionary) -> void:
	_ensure_built()
	_hang_active = bool(state.get("hangActive", false))
	_state = HangMatchmakingPresenter.normalize_state(state)
	_pending = bool(_state.get("pending", false))
	var state_route_id := str(_state.get("selectedRouteId", "")).strip_edges()
	if not HangMatchmakingPresenter.route_by_id(_routes, state_route_id).is_empty():
		_selected_route_id = state_route_id
	_view_mode = str(_state.get("viewMode", VIEW_BROWSE))
	if _view_mode not in [VIEW_BROWSE, VIEW_PARTY, VIEW_MATCHING]:
		_view_mode = VIEW_BROWSE
	if bool((_state.get("match", {}) as Dictionary).get("active", false)):
		_view_mode = VIEW_MATCHING
	_status_label.text = str(_state.get("statusText", ""))
	if _status_label.text == "":
		_status_label.text = (
			"真人队友优先；空位可由陪练NPC临时补足。"
			if _view_mode != VIEW_MATCHING
			else "正在寻找真人队友，挂机战斗不会中断。"
		)
	_rebuild_route_strip()
	_rebuild_party_route_list()
	_render_selected_route()
	_render_party_listings()
	_render_matching()
	_render_view_mode()
	if _pending:
		hide_start_choice()


func set_view_mode(mode: String) -> void:
	_ensure_built()
	var normalized := mode.strip_edges().to_lower()
	if normalized not in [VIEW_BROWSE, VIEW_PARTY, VIEW_MATCHING]:
		return
	if bool((_state.get("match", {}) as Dictionary).get("active", false)) and normalized != VIEW_MATCHING:
		return
	_view_mode = normalized
	_render_view_mode()


func selected_route_id() -> String:
	return _selected_route_id


func selected_route() -> Dictionary:
	return HangMatchmakingPresenter.route_by_id(_routes, _selected_route_id)


func show_start_choice() -> void:
	_ensure_built()
	var route := selected_route()
	if (
		route.is_empty()
		or bool(route.get("locked", false))
		or not bool(route.get("current", false))
		or _pending
	):
		return
	_choice_title.text = "选择挂机方式"
	_choice_route.text = "%s\n当前就在该区域，可直接开始。" % str(route.get("label", "练级区域"))
	_choice_scrim.visible = true
	_choice_immediate_button.grab_focus()


func hide_start_choice() -> void:
	if _choice_scrim != null:
		_choice_scrim.visible = false


func debug_snapshot() -> Dictionary:
	var match_state := _state.get("match", {}) as Dictionary
	return {
		"viewMode": _view_mode,
		"routeCount": _routes.size(),
		"routeButtonCount": route_buttons.size(),
		"partyRouteButtonCount": party_route_buttons.size(),
		"listingReferenceCount": listing_reference_labels.size(),
		"selectedRouteId": _selected_route_id,
		"pending": _pending,
		"hangActive": _hang_active,
		"stopVisible": stop_button != null and stop_button.visible,
		"choiceVisible": _choice_scrim != null and _choice_scrim.visible,
		"matching": bool(match_state.get("active", false)),
		"matchStatus": str(match_state.get("status", "idle")),
		"humanCount": int(match_state.get("humanCount", 0)),
		"npcCount": int(match_state.get("npcCount", 0)),
		"emptyCount": int(match_state.get("emptyCount", 0)),
	}


func self_check() -> Dictionary:
	_ensure_built()
	var errors: Array[String] = []
	if custom_minimum_size != CANVAS_SIZE:
		errors.append("挂机匹配画布不是 1280×720")
	if _canvas == null or _canvas.custom_minimum_size != CANVAS_SIZE:
		errors.append("挂机匹配缺少固定主画布")
	if close_button == null or primary_button == null or browse_tab_button == null or party_tab_button == null or stop_button == null:
		errors.append("挂机匹配缺少主交互按钮")
	if _routes.size() != route_buttons.size():
		errors.append("挂机区域卡片没有完整投影")
	if _selected_route_id != "" and selected_route().is_empty():
		errors.append("挂机区域选择已失效")
	return {
		"schemaVersion": 1,
		"reportType": "beastbound.hang_matchmaking_panel_self_check",
		"result": "PASS" if errors.is_empty() else "FAIL",
		"errors": errors,
		"snapshot": debug_snapshot(),
	}


func _ensure_built() -> void:
	if _built:
		return
	_built = true
	name = "HangMatchmakingAwakenedPanel"
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	custom_minimum_size = CANVAS_SIZE
	mouse_filter = Control.MOUSE_FILTER_STOP
	focus_mode = Control.FOCUS_ALL
	add_theme_stylebox_override("panel", HangMatchmakingAwakenedVisualSkin.transparent_style())

	_canvas = Control.new()
	_canvas.name = "HangMatchmakingCanvas"
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
	HangMatchmakingAwakenedVisualSkin.add_backdrop(_canvas)
	_build_header()
	_build_main_frame()
	_build_browse_group()
	_build_party_group()
	_build_matching_group()
	_build_status_bar()
	_build_choice_dialog()
	_render_view_mode()


func _build_header() -> void:
	var title := Label.new()
	title.name = "HangMatchmakingTitle"
	title.text = "挂机匹配"
	title.position = Vector2(68.0, 9.0)
	title.size = Vector2(300.0, 52.0)
	title.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	HangMatchmakingAwakenedVisualSkin.apply_title(title, 29)
	_canvas.add_child(title)

	var subtitle := Label.new()
	subtitle.name = "HangMatchmakingSubtitle"
	subtitle.text = "边练级，边寻找真人队友"
	subtitle.position = Vector2(265.0, 17.0)
	subtitle.size = Vector2(330.0, 38.0)
	subtitle.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	HangMatchmakingAwakenedVisualSkin.apply_body(subtitle, 15, true)
	_canvas.add_child(subtitle)

	stop_button = Button.new()
	stop_button.name = "HangMatchStopButton"
	stop_button.text = "停止挂机"
	stop_button.position = Vector2(625.0, 10.0)
	stop_button.size = Vector2(160.0, 50.0)
	stop_button.visible = false
	stop_button.pressed.connect(func() -> void:
		if _hang_active and not _pending:
			stop_requested.emit()
	)
	_canvas.add_child(stop_button)

	browse_tab_button = Button.new()
	browse_tab_button.name = "HangMatchBrowseTab"
	browse_tab_button.text = "练级区域"
	browse_tab_button.position = Vector2(813.0, 10.0)
	browse_tab_button.size = Vector2(158.0, 50.0)
	browse_tab_button.pressed.connect(func() -> void: set_view_mode(VIEW_BROWSE))
	_canvas.add_child(browse_tab_button)

	party_tab_button = Button.new()
	party_tab_button.name = "HangMatchPartyTab"
	party_tab_button.text = "便捷组队"
	party_tab_button.position = Vector2(971.0, 10.0)
	party_tab_button.size = Vector2(158.0, 50.0)
	party_tab_button.pressed.connect(func() -> void: set_view_mode(VIEW_PARTY))
	_canvas.add_child(party_tab_button)

	close_button = Button.new()
	close_button.name = "HangMatchCloseButton"
	close_button.position = Vector2(1188.0, 7.0)
	close_button.size = Vector2(60.0, 54.0)
	HangMatchmakingAwakenedVisualSkin.apply_close_button(close_button)
	close_button.pressed.connect(func() -> void:
		if not _pending:
			close_requested.emit()
	)
	_canvas.add_child(close_button)


func _build_main_frame() -> void:
	var frame := PanelContainer.new()
	frame.name = "HangMatchmakingFrame"
	frame.position = Vector2(45.0, 72.0)
	frame.size = Vector2(1190.0, 607.0)
	frame.mouse_filter = Control.MOUSE_FILTER_IGNORE
	frame.add_theme_stylebox_override("panel", HangMatchmakingAwakenedVisualSkin.main_panel_style())
	_canvas.add_child(frame)


func _build_browse_group() -> void:
	_browse_group = Control.new()
	_browse_group.name = "HangMatchmakingBrowseGroup"
	_browse_group.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_browse_group.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_canvas.add_child(_browse_group)

	var heading := Label.new()
	heading.text = "选择练级区域"
	heading.position = Vector2(76.0, 89.0)
	heading.size = Vector2(320.0, 32.0)
	HangMatchmakingAwakenedVisualSkin.apply_title(heading, 21)
	_browse_group.add_child(heading)

	var card_hint := Label.new()
	card_hint.text = "当前区域可直接挂机；其他区域只提供路线引导，不会传送。"
	card_hint.position = Vector2(590.0, 92.0)
	card_hint.size = Vector2(610.0, 28.0)
	card_hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	HangMatchmakingAwakenedVisualSkin.apply_body(card_hint, 14, true)
	_browse_group.add_child(card_hint)

	var route_scroll := ScrollContainer.new()
	route_scroll.name = "HangMatchRouteScroll"
	route_scroll.position = Vector2(72.0, 126.0)
	route_scroll.size = Vector2(1136.0, 385.0)
	route_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_AUTO
	route_scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	route_scroll.mouse_filter = Control.MOUSE_FILTER_STOP
	_browse_group.add_child(route_scroll)
	_route_strip = HBoxContainer.new()
	_route_strip.name = "HangMatchRouteStrip"
	_route_strip.custom_minimum_size = Vector2(1120.0, 370.0)
	_route_strip.add_theme_constant_override("separation", 14)
	route_scroll.add_child(_route_strip)

	var detail := PanelContainer.new()
	detail.name = "HangMatchSelectedRouteDetail"
	detail.position = Vector2(72.0, 525.0)
	detail.size = Vector2(1136.0, 116.0)
	detail.mouse_filter = Control.MOUSE_FILTER_IGNORE
	detail.add_theme_stylebox_override("panel", HangMatchmakingAwakenedVisualSkin.inset_style(0.94, 10))
	_browse_group.add_child(detail)

	_selected_title = Label.new()
	_selected_title.position = Vector2(92.0, 538.0)
	_selected_title.size = Vector2(390.0, 34.0)
	_selected_title.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	HangMatchmakingAwakenedVisualSkin.apply_title(_selected_title, 20)
	_browse_group.add_child(_selected_title)

	_selected_context = Label.new()
	_selected_context.position = Vector2(92.0, 573.0)
	_selected_context.size = Vector2(420.0, 28.0)
	HangMatchmakingAwakenedVisualSkin.apply_body(_selected_context, 15)
	_browse_group.add_child(_selected_context)

	_selected_drop = Label.new()
	_selected_drop.position = Vector2(515.0, 540.0)
	_selected_drop.size = Vector2(425.0, 28.0)
	_selected_drop.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	HangMatchmakingAwakenedVisualSkin.apply_emphasis(
		_selected_drop,
		HangMatchmakingAwakenedVisualSkin.GOLD_TEXT,
		15
	)
	_browse_group.add_child(_selected_drop)

	_selected_rule = Label.new()
	_selected_rule.position = Vector2(515.0, 574.0)
	_selected_rule.size = Vector2(425.0, 44.0)
	_selected_rule.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	HangMatchmakingAwakenedVisualSkin.apply_body(_selected_rule, 14, true)
	_browse_group.add_child(_selected_rule)

	primary_button = Button.new()
	primary_button.name = "HangMatchPrimaryButton"
	primary_button.position = Vector2(980.0, 552.0)
	primary_button.size = Vector2(190.0, 60.0)
	primary_button.pressed.connect(_on_primary_pressed)
	_browse_group.add_child(primary_button)


func _build_party_group() -> void:
	_party_group = Control.new()
	_party_group.name = "HangMatchmakingPartyGroup"
	_party_group.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_party_group.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_canvas.add_child(_party_group)

	var route_shell := PanelContainer.new()
	route_shell.position = Vector2(72.0, 104.0)
	route_shell.size = Vector2(282.0, 526.0)
	route_shell.mouse_filter = Control.MOUSE_FILTER_IGNORE
	route_shell.add_theme_stylebox_override("panel", HangMatchmakingAwakenedVisualSkin.inset_style(0.94, 10))
	_party_group.add_child(route_shell)

	var route_title := Label.new()
	route_title.text = "匹配区域"
	route_title.position = Vector2(94.0, 118.0)
	route_title.size = Vector2(236.0, 36.0)
	route_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	HangMatchmakingAwakenedVisualSkin.apply_title(route_title, 20)
	_party_group.add_child(route_title)

	var route_scroll := ScrollContainer.new()
	route_scroll.name = "HangMatchPartyRouteScroll"
	route_scroll.position = Vector2(89.0, 164.0)
	route_scroll.size = Vector2(248.0, 445.0)
	route_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	route_scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_AUTO
	route_scroll.mouse_filter = Control.MOUSE_FILTER_STOP
	_party_group.add_child(route_scroll)
	_party_route_list = VBoxContainer.new()
	_party_route_list.name = "HangMatchPartyRouteList"
	_party_route_list.custom_minimum_size = Vector2(231.0, 0.0)
	_party_route_list.add_theme_constant_override("separation", 8)
	route_scroll.add_child(_party_route_list)

	var list_shell := PanelContainer.new()
	list_shell.position = Vector2(370.0, 104.0)
	list_shell.size = Vector2(838.0, 526.0)
	list_shell.mouse_filter = Control.MOUSE_FILTER_IGNORE
	list_shell.add_theme_stylebox_override("panel", HangMatchmakingAwakenedVisualSkin.inset_style(0.94, 10))
	_party_group.add_child(list_shell)

	_party_heading = Label.new()
	_party_heading.position = Vector2(394.0, 117.0)
	_party_heading.size = Vector2(460.0, 36.0)
	HangMatchmakingAwakenedVisualSkin.apply_title(_party_heading, 21)
	_party_group.add_child(_party_heading)

	_party_summary = Label.new()
	_party_summary.position = Vector2(842.0, 120.0)
	_party_summary.size = Vector2(335.0, 32.0)
	_party_summary.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	HangMatchmakingAwakenedVisualSkin.apply_body(_party_summary, 14, true)
	_party_group.add_child(_party_summary)

	var list_scroll := ScrollContainer.new()
	list_scroll.name = "HangMatchTeamScroll"
	list_scroll.position = Vector2(390.0, 164.0)
	list_scroll.size = Vector2(796.0, 358.0)
	list_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	list_scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_AUTO
	list_scroll.mouse_filter = Control.MOUSE_FILTER_STOP
	_party_group.add_child(list_scroll)
	_party_list = VBoxContainer.new()
	_party_list.name = "HangMatchTeamList"
	_party_list.custom_minimum_size = Vector2(778.0, 0.0)
	_party_list.add_theme_constant_override("separation", 10)
	list_scroll.add_child(_party_list)

	_party_empty = Label.new()
	_party_empty.text = "暂时没有真人队伍\n你可以发起匹配，系统会先找真人，再用陪练NPC补足空位。"
	_party_empty.position = Vector2(470.0, 310.0)
	_party_empty.size = Vector2(630.0, 100.0)
	_party_empty.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_party_empty.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_party_empty.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	HangMatchmakingAwakenedVisualSkin.apply_body(_party_empty, 16, true)
	_party_group.add_child(_party_empty)

	var party_hint := Label.new()
	party_hint.text = "队伍列表仅展示当前匹配池；系统会按同一区域、最早等待顺序自动合并。"
	party_hint.position = Vector2(395.0, 540.0)
	party_hint.size = Vector2(560.0, 58.0)
	party_hint.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	party_hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	HangMatchmakingAwakenedVisualSkin.apply_body(party_hint, 14, true)
	_party_group.add_child(party_hint)

	_party_match_button = Button.new()
	_party_match_button.name = "HangMatchPartyAutoMatchButton"
	_party_match_button.position = Vector2(980.0, 548.0)
	_party_match_button.size = Vector2(190.0, 58.0)
	_party_match_button.pressed.connect(_on_party_action_pressed)
	_party_group.add_child(_party_match_button)


func _build_matching_group() -> void:
	_matching_group = Control.new()
	_matching_group.name = "HangMatchmakingActiveGroup"
	_matching_group.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_matching_group.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_canvas.add_child(_matching_group)

	var shell := PanelContainer.new()
	shell.position = Vector2(72.0, 104.0)
	shell.size = Vector2(1136.0, 526.0)
	shell.mouse_filter = Control.MOUSE_FILTER_IGNORE
	shell.add_theme_stylebox_override("panel", HangMatchmakingAwakenedVisualSkin.inset_style(0.96, 12))
	_matching_group.add_child(shell)

	var title := Label.new()
	title.text = "挂机匹配中"
	title.position = Vector2(104.0, 124.0)
	title.size = Vector2(360.0, 44.0)
	HangMatchmakingAwakenedVisualSkin.apply_title(title, 27)
	_matching_group.add_child(title)

	_matching_status = Label.new()
	_matching_status.position = Vector2(844.0, 126.0)
	_matching_status.size = Vector2(330.0, 36.0)
	_matching_status.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	HangMatchmakingAwakenedVisualSkin.apply_emphasis(
		_matching_status,
		HangMatchmakingAwakenedVisualSkin.POSITIVE_TEXT,
		17
	)
	_matching_group.add_child(_matching_status)

	_matching_route = Label.new()
	_matching_route.position = Vector2(104.0, 182.0)
	_matching_route.size = Vector2(540.0, 34.0)
	HangMatchmakingAwakenedVisualSkin.apply_title(_matching_route, 20)
	_matching_group.add_child(_matching_route)

	_matching_counts = Label.new()
	_matching_counts.position = Vector2(675.0, 182.0)
	_matching_counts.size = Vector2(499.0, 34.0)
	_matching_counts.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	HangMatchmakingAwakenedVisualSkin.apply_body(_matching_counts, 17)
	_matching_group.add_child(_matching_counts)

	var divider := ColorRect.new()
	divider.position = Vector2(104.0, 230.0)
	divider.size = Vector2(1070.0, 2.0)
	divider.color = Color(0.42, 0.29, 0.17, 0.80)
	divider.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_matching_group.add_child(divider)

	_member_row = HBoxContainer.new()
	_member_row.name = "HangMatchMemberRow"
	_member_row.position = Vector2(104.0, 254.0)
	_member_row.size = Vector2(1070.0, 152.0)
	_member_row.add_theme_constant_override("separation", 12)
	_matching_group.add_child(_member_row)

	_matching_waiting = Label.new()
	_matching_waiting.position = Vector2(105.0, 432.0)
	_matching_waiting.size = Vector2(1068.0, 34.0)
	_matching_waiting.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	HangMatchmakingAwakenedVisualSkin.apply_body(_matching_waiting, 16)
	_matching_group.add_child(_matching_waiting)

	_matching_rule = Label.new()
	_matching_rule.text = "真人始终优先。陪练NPC只占临时战斗位；真人加入后会在下一场战斗前自动让位，不计在线人数，也不参与社交与交易。"
	_matching_rule.position = Vector2(166.0, 476.0)
	_matching_rule.size = Vector2(946.0, 58.0)
	_matching_rule.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_matching_rule.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_matching_rule.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	HangMatchmakingAwakenedVisualSkin.apply_body(_matching_rule, 14, true)
	_matching_group.add_child(_matching_rule)

	cancel_button = Button.new()
	cancel_button.name = "HangMatchCancelButton"
	cancel_button.text = "取消匹配"
	cancel_button.position = Vector2(535.0, 550.0)
	cancel_button.size = Vector2(210.0, 58.0)
	cancel_button.pressed.connect(func() -> void:
		if not _pending:
			cancel_requested.emit()
	)
	_matching_group.add_child(cancel_button)


func _build_status_bar() -> void:
	_status_label = Label.new()
	_status_label.name = "HangMatchStatusLabel"
	_status_label.position = Vector2(76.0, 646.0)
	_status_label.size = Vector2(1128.0, 26.0)
	_status_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_status_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	HangMatchmakingAwakenedVisualSkin.apply_body(_status_label, 13, true)
	_canvas.add_child(_status_label)


func _build_choice_dialog() -> void:
	_choice_scrim = ColorRect.new()
	_choice_scrim.name = "HangMatchChoiceScrim"
	_choice_scrim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_choice_scrim.color = Color(0.015, 0.010, 0.007, 0.78)
	_choice_scrim.mouse_filter = Control.MOUSE_FILTER_STOP
	_choice_scrim.visible = false
	_canvas.add_child(_choice_scrim)

	_choice_panel = PanelContainer.new()
	_choice_panel.name = "HangMatchChoicePanel"
	_choice_panel.position = Vector2(365.0, 180.0)
	_choice_panel.size = Vector2(550.0, 342.0)
	_choice_panel.mouse_filter = Control.MOUSE_FILTER_STOP
	_choice_panel.add_theme_stylebox_override("panel", HangMatchmakingAwakenedVisualSkin.parchment_style())
	_choice_scrim.add_child(_choice_panel)

	_choice_title = Label.new()
	_choice_title.position = Vector2(410.0, 210.0)
	_choice_title.size = Vector2(460.0, 46.0)
	_choice_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	HangMatchmakingAwakenedVisualSkin.apply_title(_choice_title, 25)
	_choice_title.add_theme_color_override("font_color", HangMatchmakingAwakenedVisualSkin.BROWN_TEXT)
	_choice_scrim.add_child(_choice_title)

	_choice_route = Label.new()
	_choice_route.position = Vector2(423.0, 278.0)
	_choice_route.size = Vector2(434.0, 76.0)
	_choice_route.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_choice_route.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_choice_route.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	HangMatchmakingAwakenedVisualSkin.apply_body(_choice_route, 16)
	_choice_route.add_theme_color_override("font_color", HangMatchmakingAwakenedVisualSkin.BROWN_TEXT)
	_choice_route.add_theme_constant_override("outline_size", 0)
	_choice_scrim.add_child(_choice_route)

	var immediate_hint := Label.new()
	immediate_hint.text = "立刻开始\n不加入匹配队列"
	immediate_hint.position = Vector2(402.0, 356.0)
	immediate_hint.size = Vector2(220.0, 48.0)
	immediate_hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	immediate_hint.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	HangMatchmakingAwakenedVisualSkin.apply_body(immediate_hint, 13)
	immediate_hint.add_theme_color_override("font_color", HangMatchmakingAwakenedVisualSkin.BROWN_TEXT)
	immediate_hint.add_theme_constant_override("outline_size", 0)
	_choice_scrim.add_child(immediate_hint)

	var match_hint := Label.new()
	match_hint.text = "边挂机边找真人\n空位由陪练NPC补足"
	match_hint.position = Vector2(657.0, 356.0)
	match_hint.size = Vector2(220.0, 48.0)
	match_hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	match_hint.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	match_hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	HangMatchmakingAwakenedVisualSkin.apply_body(match_hint, 13)
	match_hint.add_theme_color_override("font_color", HangMatchmakingAwakenedVisualSkin.BROWN_TEXT)
	match_hint.add_theme_constant_override("outline_size", 0)
	_choice_scrim.add_child(match_hint)

	_choice_immediate_button = Button.new()
	_choice_immediate_button.name = "HangMatchImmediateButton"
	_choice_immediate_button.text = "立即挂机"
	_choice_immediate_button.position = Vector2(430.0, 414.0)
	_choice_immediate_button.size = Vector2(170.0, 58.0)
	HangMatchmakingAwakenedVisualSkin.apply_action_button(_choice_immediate_button)
	_choice_immediate_button.pressed.connect(func() -> void:
		if not _pending and _selected_route_id != "":
			hide_start_choice()
			immediate_requested.emit(_selected_route_id)
	)
	_choice_scrim.add_child(_choice_immediate_button)

	_choice_match_button = Button.new()
	_choice_match_button.name = "HangMatchMatchedButton"
	_choice_match_button.text = "匹配挂机"
	_choice_match_button.position = Vector2(680.0, 414.0)
	_choice_match_button.size = Vector2(170.0, 58.0)
	HangMatchmakingAwakenedVisualSkin.apply_action_button(_choice_match_button, true)
	_choice_match_button.pressed.connect(func() -> void:
		if not _pending and _selected_route_id != "":
			hide_start_choice()
			match_requested.emit(_selected_route_id)
	)
	_choice_scrim.add_child(_choice_match_button)

	var dialog_close := Button.new()
	dialog_close.name = "HangMatchChoiceCloseButton"
	dialog_close.position = Vector2(842.0, 192.0)
	dialog_close.size = Vector2(52.0, 48.0)
	HangMatchmakingAwakenedVisualSkin.apply_close_button(dialog_close)
	dialog_close.pressed.connect(hide_start_choice)
	_choice_scrim.add_child(dialog_close)


func _rebuild_route_strip() -> void:
	if _route_strip == null:
		return
	_clear_children(_route_strip)
	route_buttons.clear()
	for route in _routes:
		var route_id := str(route.get("routeId", ""))
		var button := _route_card(route)
		button.pressed.connect(func() -> void: _select_route(route_id, true))
		_route_strip.add_child(button)
		route_buttons[route_id] = button
	_route_strip.custom_minimum_size.x = maxf(1120.0, _routes.size() * 246.0)


func _route_card(route: Dictionary) -> Button:
	var route_id := str(route.get("routeId", ""))
	var selected := route_id == _selected_route_id
	var locked := bool(route.get("locked", false))
	var button := Button.new()
	button.name = "HangMatchRoute_%s" % _safe_node_name(route_id)
	button.custom_minimum_size = Vector2(232.0, 366.0)
	button.size = Vector2(232.0, 366.0)
	button.text = ""
	button.clip_contents = true
	HangMatchmakingAwakenedVisualSkin.apply_route_card(button, selected, locked)

	_add_isometric_route_preview(button, route, locked)

	var image_shade := ColorRect.new()
	image_shade.position = Vector2(8.0, 8.0)
	image_shade.size = Vector2(216.0, 176.0)
	image_shade.color = Color(0.025, 0.020, 0.015, 0.30 if not locked else 0.62)
	image_shade.mouse_filter = Control.MOUSE_FILTER_IGNORE
	button.add_child(image_shade)

	var route_name := Label.new()
	route_name.text = str(route.get("label", "练级区域"))
	route_name.position = Vector2(18.0, 18.0)
	route_name.size = Vector2(196.0, 60.0)
	route_name.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	HangMatchmakingAwakenedVisualSkin.apply_title(route_name, 18)
	route_name.mouse_filter = Control.MOUSE_FILTER_IGNORE
	button.add_child(route_name)

	var level := Label.new()
	level.text = str(route.get("levelText", "Lv1"))
	level.position = Vector2(18.0, 80.0)
	level.size = Vector2(196.0, 30.0)
	HangMatchmakingAwakenedVisualSkin.apply_body(level, 15)
	level.mouse_filter = Control.MOUSE_FILTER_IGNORE
	button.add_child(level)

	var location := Label.new()
	location.text = str(route.get("mapLabel", "未知区域"))
	location.position = Vector2(18.0, 144.0)
	location.size = Vector2(196.0, 28.0)
	location.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	HangMatchmakingAwakenedVisualSkin.apply_body(location, 13, true)
	location.mouse_filter = Control.MOUSE_FILTER_IGNORE
	button.add_child(location)

	var badge_text := ""
	var badge_kind := ""
	if bool(route.get("current", false)):
		badge_text = "当前"
		badge_kind = "current"
	elif bool(route.get("recommended", false)):
		badge_text = "推荐"
		badge_kind = "recommended"
	if badge_text != "":
		var badge := Label.new()
		badge.text = badge_text
		badge.position = Vector2(150.0, 14.0)
		badge.size = Vector2(64.0, 30.0)
		badge.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		badge.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		badge.add_theme_stylebox_override("normal", HangMatchmakingAwakenedVisualSkin.badge_style(badge_kind))
		HangMatchmakingAwakenedVisualSkin.apply_body(badge, 13)
		badge.mouse_filter = Control.MOUSE_FILTER_IGNORE
		button.add_child(badge)

	var drop_heading := Label.new()
	drop_heading.text = "可能掉落"
	drop_heading.position = Vector2(18.0, 201.0)
	drop_heading.size = Vector2(196.0, 30.0)
	HangMatchmakingAwakenedVisualSkin.apply_title(drop_heading, 16)
	drop_heading.mouse_filter = Control.MOUSE_FILTER_IGNORE
	button.add_child(drop_heading)

	var drop_text := Label.new()
	drop_text.text = str(
		route.get("dropText", "掉落奖励以战斗结算为准")
	).replace(" · ", "\n")
	drop_text.position = Vector2(18.0, 238.0)
	drop_text.size = Vector2(196.0, 64.0)
	drop_text.autowrap_mode = TextServer.AUTOWRAP_ARBITRARY
	drop_text.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	HangMatchmakingAwakenedVisualSkin.apply_emphasis(
		drop_text,
		HangMatchmakingAwakenedVisualSkin.GOLD_TEXT,
		14
	)
	drop_text.mouse_filter = Control.MOUSE_FILTER_IGNORE
	button.add_child(drop_text)

	var state := Label.new()
	state.position = Vector2(18.0, 316.0)
	state.size = Vector2(196.0, 34.0)
	state.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	state.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	if locked:
		state.text = "等级未达到"
		HangMatchmakingAwakenedVisualSkin.apply_emphasis(
			state,
			HangMatchmakingAwakenedVisualSkin.LOCKED_TEXT,
			14
		)
	elif bool(route.get("belowRecommended", false)):
		state.text = "低于推荐等级"
		HangMatchmakingAwakenedVisualSkin.apply_emphasis(
			state,
			HangMatchmakingAwakenedVisualSkin.LOCKED_TEXT,
			14
		)
	elif bool(route.get("current", false)):
		state.text = "可立即挂机"
		HangMatchmakingAwakenedVisualSkin.apply_emphasis(
			state,
			HangMatchmakingAwakenedVisualSkin.POSITIVE_TEXT,
			14
		)
	else:
		state.text = "需先前往该区域"
		HangMatchmakingAwakenedVisualSkin.apply_body(state, 14, true)
	state.mouse_filter = Control.MOUSE_FILTER_IGNORE
	button.add_child(state)
	return button


func _add_isometric_route_preview(
	button: Button,
	route: Dictionary,
	locked: bool
) -> void:
	var visual_key := str(route.get("visualKey", "grass"))
	var preview := Control.new()
	preview.name = "HangMatchRoutePreview"
	preview.position = Vector2(8.0, 8.0)
	preview.size = Vector2(216.0, 176.0)
	preview.clip_contents = true
	preview.mouse_filter = Control.MOUSE_FILTER_IGNORE
	button.add_child(preview)

	var base := ColorRect.new()
	base.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	base.color = HangMatchmakingAwakenedVisualSkin.route_preview_base_color(visual_key, locked)
	base.mouse_filter = Control.MOUSE_FILTER_IGNORE
	preview.add_child(base)

	# Each formal 160×80 ground atlas contains four transparent 80×40
	# isometric tiles. Compose those tiles at half-width/half-height offsets so
	# the card shows a real, seamless map ground preview instead of stretching
	# the atlas (which would expose its transparent cross-shaped gutters).
	for row in range(8):
		for column in range(-1, 3):
			var tile := TextureRect.new()
			tile.position = Vector2(
				float(column * 112 + (row % 2) * 56),
				float(-18 + row * 28)
			)
			tile.size = Vector2(112.0, 56.0)
			tile.texture = HangMatchmakingAwakenedVisualSkin.route_tile_texture(
				visual_key,
				row + column * 3
			)
			tile.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
			tile.stretch_mode = TextureRect.STRETCH_SCALE
			tile.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
			tile.modulate = HangMatchmakingAwakenedVisualSkin.route_texture_modulate(
				visual_key,
				locked
			)
			tile.mouse_filter = Control.MOUSE_FILTER_IGNORE
			preview.add_child(tile)


func _rebuild_party_route_list() -> void:
	if _party_route_list == null:
		return
	_clear_children(_party_route_list)
	party_route_buttons.clear()
	for route in _routes:
		var route_id := str(route.get("routeId", ""))
		var button := Button.new()
		button.name = "HangMatchPartyRoute_%s" % _safe_node_name(route_id)
		button.text = "%s\n%s" % [str(route.get("label", "练级区域")), str(route.get("levelText", ""))]
		button.custom_minimum_size = Vector2(228.0, 62.0)
		button.alignment = HORIZONTAL_ALIGNMENT_CENTER
		button.disabled = bool(route.get("locked", false))
		HangMatchmakingAwakenedVisualSkin.apply_tab_button(button, route_id == _selected_route_id)
		button.pressed.connect(func() -> void: _select_route(route_id, true))
		_party_route_list.add_child(button)
		party_route_buttons[route_id] = button


func _render_selected_route() -> void:
	if _selected_title == null:
		return
	var route := selected_route()
	if route.is_empty():
		_selected_title.text = "暂无可用练级区域"
		_selected_context.text = ""
		_selected_drop.text = ""
		_selected_rule.text = ""
		primary_button.text = "暂无区域"
		HangMatchmakingAwakenedVisualSkin.apply_action_button(primary_button, false, false, true)
		return
	var locked := bool(route.get("locked", false))
	var current := bool(route.get("current", false))
	_selected_title.text = str(route.get("label", "练级区域"))
	_selected_context.text = "%s　%s　角色 Lv%d" % [
		str(route.get("mapLabel", "未知区域")),
		str(route.get("levelText", "")),
		_player_level,
	]
	_selected_drop.text = "可能掉落：%s" % str(route.get("dropText", "掉落奖励以战斗结算为准"))
	if locked:
		_selected_rule.text = "等级未达到，无法前往或发起匹配。"
		primary_button.text = "等级未达到"
	elif current:
		_selected_rule.text = "开始后可选择立即挂机，或保持战斗并持续匹配真人队友。"
		primary_button.text = "开始挂机"
	else:
		_selected_rule.text = "该区域不在当前位置，只能先按正常地图路线前往，不会直接传送。"
		primary_button.text = "前往该区域"
	HangMatchmakingAwakenedVisualSkin.apply_action_button(primary_button, current, false, locked or _pending)


func _render_party_listings() -> void:
	if _party_list == null:
		return
	_clear_children(_party_list)
	listing_reference_labels.clear()
	var route := selected_route()
	_party_heading.text = "%s · 等待中的队伍" % str(route.get("label", "便捷组队"))
	var listings: Array = _state.get("partyListings", [])
	var matching_listings: Array[Dictionary] = []
	for raw_listing in listings:
		if not (raw_listing is Dictionary):
			continue
		var listing := raw_listing as Dictionary
		var listing_route_id := str(listing.get("routeId", "")).strip_edges()
		if listing_route_id == "" or listing_route_id == _selected_route_id:
			matching_listings.append(listing)
	_party_summary.text = "真人队伍 %d　等待真人 %d" % [
		matching_listings.size(),
		int((_state.get("match", {}) as Dictionary).get("waitingPlayerCount", 0)),
	]
	var current := bool(route.get("current", false))
	var locked := bool(route.get("locked", false))
	_party_match_button.text = "自动匹配" if current else "前往该区域"
	if locked:
		_party_match_button.text = "等级未达到"
	HangMatchmakingAwakenedVisualSkin.apply_action_button(
		_party_match_button,
		current,
		false,
		locked or _pending
	)
	_party_empty.visible = matching_listings.is_empty()
	for listing in matching_listings:
		var row := _team_row(listing)
		_party_list.add_child(row)


func _team_row(listing: Dictionary) -> Control:
	var queue_id := str(listing.get("queueId", listing.get("id", ""))).strip_edges()
	var human_count := clampi(int(listing.get("humanCount", 1)), 0, 5)
	var npc_count := clampi(int(listing.get("npcCount", 0)), 0, 5 - human_count)
	var empty_count := clampi(int(listing.get("emptyCount", 5 - human_count - npc_count)), 0, 5)
	var row := PanelContainer.new()
	row.custom_minimum_size = Vector2(772.0, 96.0)
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_theme_stylebox_override("panel", HangMatchmakingAwakenedVisualSkin.inset_style(0.92, 9))
	var content := Control.new()
	content.name = "HangMatchTeamRowContent"
	content.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_child(content)

	var leader := Label.new()
	leader.text = str(listing.get("leaderName", "冒险队长"))
	leader.position = Vector2(18.0, 13.0)
	leader.size = Vector2(250.0, 30.0)
	HangMatchmakingAwakenedVisualSkin.apply_title(leader, 18)
	content.add_child(leader)

	var route_label := Label.new()
	route_label.text = str(listing.get("routeLabel", selected_route().get("label", "练级区域")))
	route_label.position = Vector2(18.0, 50.0)
	route_label.size = Vector2(300.0, 28.0)
	HangMatchmakingAwakenedVisualSkin.apply_body(route_label, 14, true)
	content.add_child(route_label)

	var counts := Label.new()
	counts.text = "真人 %d　陪练NPC %d　空位 %d" % [human_count, npc_count, empty_count]
	counts.position = Vector2(320.0, 21.0)
	counts.size = Vector2(294.0, 46.0)
	counts.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	counts.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	HangMatchmakingAwakenedVisualSkin.apply_body(counts, 15)
	content.add_child(counts)

	var reference_badge := Label.new()
	reference_badge.name = "HangMatchListingReference_%s" % _safe_node_name(queue_id)
	reference_badge.text = "自动匹配参考"
	reference_badge.position = Vector2(630.0, 25.0)
	reference_badge.size = Vector2(120.0, 44.0)
	reference_badge.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	reference_badge.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	reference_badge.add_theme_stylebox_override(
		"normal",
		HangMatchmakingAwakenedVisualSkin.badge_style("empty")
	)
	HangMatchmakingAwakenedVisualSkin.apply_body(reference_badge, 13, true)
	content.add_child(reference_badge)
	listing_reference_labels[queue_id] = reference_badge
	return row


func _render_matching() -> void:
	if _matching_group == null:
		return
	var match_state := _state.get("match", {}) as Dictionary
	var route := selected_route()
	_matching_route.text = str(route.get("label", "当前练级区域"))
	var human_count := int(match_state.get("humanCount", 0))
	var npc_count := int(match_state.get("npcCount", 0))
	var empty_count := int(match_state.get("emptyCount", 0))
	var match_status := str(match_state.get("status", "searching"))
	_matching_counts.text = "真人 %d　陪练NPC %d　空位 %d" % [human_count, npc_count, empty_count]
	if match_status == "full":
		_matching_status.text = "真人队伍已满 · 离队后自动补位"
	elif match_status == "npc_filled" or (empty_count <= 0 and npc_count > 0):
		_matching_status.text = "陪练已补齐 · 继续寻找真人"
	else:
		_matching_status.text = "持续匹配真人中"
	var npc_fill_in_sec := int(match_state.get("npcFillInSec", 0))
	_matching_waiting.text = "匹配池另有 %d 名真人、%d 支队伍正在等待" % [
		int(match_state.get("waitingPlayerCount", 0)),
		int(match_state.get("waitingPartyCount", 0)),
	]
	if npc_fill_in_sec > 0 and empty_count > 0:
		_matching_waiting.text += "　·　服务端提示：约 %d 秒后由陪练NPC补位" % npc_fill_in_sec
	_clear_children(_member_row)
	for member in HangMatchmakingPresenter.member_rows(match_state):
		_member_row.add_child(_member_slot(member))
	HangMatchmakingAwakenedVisualSkin.apply_action_button(
		cancel_button,
		false,
		true,
		_pending
	)


func _member_slot(member: Dictionary) -> PanelContainer:
	var kind := str(member.get("kind", "empty"))
	var slot := PanelContainer.new()
	slot.custom_minimum_size = Vector2(204.0, 142.0)
	slot.mouse_filter = Control.MOUSE_FILTER_IGNORE
	slot.add_theme_stylebox_override("panel", HangMatchmakingAwakenedVisualSkin.member_slot_style(kind))
	var content := Control.new()
	content.name = "HangMatchMemberSlotContent"
	content.mouse_filter = Control.MOUSE_FILTER_IGNORE
	slot.add_child(content)

	var badge := Label.new()
	badge.position = Vector2(14.0, 12.0)
	badge.size = Vector2(86.0, 30.0)
	badge.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	badge.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	match kind:
		"human":
			badge.text = "真人"
			badge.add_theme_stylebox_override("normal", HangMatchmakingAwakenedVisualSkin.badge_style("human"))
		"npc":
			badge.text = "陪练NPC"
			badge.add_theme_stylebox_override("normal", HangMatchmakingAwakenedVisualSkin.badge_style("npc"))
		_:
			badge.text = "空位"
			badge.add_theme_stylebox_override("normal", HangMatchmakingAwakenedVisualSkin.badge_style("empty"))
	HangMatchmakingAwakenedVisualSkin.apply_body(badge, 13)
	content.add_child(badge)

	var member_name := Label.new()
	member_name.text = str(member.get("name", "等待加入"))
	member_name.position = Vector2(14.0, 55.0)
	member_name.size = Vector2(176.0, 36.0)
	member_name.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	member_name.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	member_name.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	HangMatchmakingAwakenedVisualSkin.apply_title(member_name, 17)
	if kind == "empty":
		member_name.add_theme_color_override("font_color", HangMatchmakingAwakenedVisualSkin.OPEN_TEXT)
	content.add_child(member_name)

	var detail := Label.new()
	detail.position = Vector2(14.0, 96.0)
	detail.size = Vector2(176.0, 30.0)
	detail.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	if kind == "empty":
		detail.text = "寻找真人中"
	elif kind == "npc":
		detail.text = "临时补位 · 真人优先"
	elif bool(member.get("detailsPending", false)) or int(member.get("level", 0)) <= 0:
		detail.text = "资料同步中"
	else:
		detail.text = "Lv%d%s" % [int(member.get("level", 1)), " · 队长" if bool(member.get("leader", false)) else ""]
	HangMatchmakingAwakenedVisualSkin.apply_body(detail, 13, true)
	content.add_child(detail)
	return slot


func _render_view_mode() -> void:
	if _browse_group == null:
		return
	stop_button.visible = _hang_active
	HangMatchmakingAwakenedVisualSkin.apply_action_button(
		stop_button,
		false,
		true,
		_pending or not _hang_active
	)
	_browse_group.visible = _view_mode == VIEW_BROWSE
	_party_group.visible = _view_mode == VIEW_PARTY
	_matching_group.visible = _view_mode == VIEW_MATCHING
	browse_tab_button.disabled = _view_mode == VIEW_MATCHING
	party_tab_button.disabled = _view_mode == VIEW_MATCHING
	HangMatchmakingAwakenedVisualSkin.apply_tab_button(
		browse_tab_button,
		_view_mode == VIEW_BROWSE
	)
	HangMatchmakingAwakenedVisualSkin.apply_tab_button(
		party_tab_button,
		_view_mode == VIEW_PARTY or _view_mode == VIEW_MATCHING
	)


func _select_route(route_id: String, emit_signal: bool) -> void:
	var route := HangMatchmakingPresenter.route_by_id(_routes, route_id)
	if route.is_empty() or bool(route.get("locked", false)) or _pending:
		return
	_selected_route_id = route_id
	_rebuild_route_strip()
	_rebuild_party_route_list()
	_render_selected_route()
	_render_party_listings()
	if emit_signal:
		route_selected.emit(route_id)


func _on_primary_pressed() -> void:
	var route := selected_route()
	if route.is_empty() or bool(route.get("locked", false)) or _pending:
		return
	if bool(route.get("current", false)):
		show_start_choice()
	else:
		travel_requested.emit(_selected_route_id)


func _on_party_action_pressed() -> void:
	var route := selected_route()
	if route.is_empty() or bool(route.get("locked", false)) or _pending:
		return
	if bool(route.get("current", false)):
		match_requested.emit(_selected_route_id)
	else:
		travel_requested.emit(_selected_route_id)


func _clear_children(parent: Node) -> void:
	for child in parent.get_children():
		parent.remove_child(child)
		child.queue_free()


func _safe_node_name(value: String) -> String:
	var result := value.strip_edges()
	for token in ["/", "\\", " ", ".", ":"]:
		result = result.replace(token, "_")
	return result if result != "" else "unknown"
