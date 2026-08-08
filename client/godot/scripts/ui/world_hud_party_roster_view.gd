extends Control
class_name WorldHudPartyRosterView

signal tab_changed(tab_id: String)
signal match_detail_requested
signal cancel_match_requested

const WorldHudPartyRosterPresenter := preload(
	"res://scripts/ui/world_hud_party_roster_presenter.gd"
)
const WorldHudPartyRosterVisualSkin := preload(
	"res://scripts/ui/world_hud_party_roster_visual_skin.gd"
)

const TAB_TASK := "task"
const TAB_PARTY := "party"
const PARTY_MAX_MEMBERS := 5
const DEFAULT_SIZE := Vector2(206.0, 402.0)

var task_tab_button: Button
var party_tab_button: Button
var detail_button: Button
var cancel_button: Button

var _built := false
var _active_tab := TAB_PARTY
var _state: Dictionary = WorldHudPartyRosterPresenter.present({})
var _root_panel: PanelContainer
var _task_body: PanelContainer
var _task_content_host: Control
var _task_label: Label
var _party_body: Control
var _roster: VBoxContainer
var _footer: PanelContainer
var _status_label: Label
var _row_nodes: Array[Control] = []


func _ready() -> void:
	prepare()


func prepare() -> void:
	if _built:
		return
	_built = true
	custom_minimum_size = DEFAULT_SIZE
	mouse_filter = Control.MOUSE_FILTER_STOP
	_build()
	apply_state(_state)


func apply_state(state: Dictionary) -> void:
	prepare()
	_state = (
		state.duplicate(true)
		if state.has("rows")
		else WorldHudPartyRosterPresenter.present(state)
	)
	_active_tab = str(_state.get("activeTab", _active_tab)).strip_edges().to_lower()
	if _active_tab not in [TAB_TASK, TAB_PARTY]:
		_active_tab = TAB_PARTY
	_task_label.text = str(_state.get("taskText", "暂无追踪任务")).strip_edges()
	if _task_label.text == "":
		_task_label.text = "暂无追踪任务"
	_status_label.text = str(_state.get("statusText", "暂未组队"))
	detail_button.visible = bool(_state.get("canViewDetail", false))
	detail_button.disabled = not detail_button.visible
	cancel_button.visible = bool(_state.get("canCancel", false))
	cancel_button.disabled = not cancel_button.visible
	_rebuild_roster()
	_refresh_tabs()


func set_active_tab(tab_id: String, emit_event: bool = false) -> void:
	prepare()
	var normalized := tab_id.strip_edges().to_lower()
	if normalized not in [TAB_TASK, TAB_PARTY]:
		return
	if _active_tab == normalized:
		return
	_active_tab = normalized
	_refresh_tabs()
	if emit_event:
		tab_changed.emit(_active_tab)


func active_tab() -> String:
	return _active_tab


func slot_count() -> int:
	return _row_nodes.size()


func task_content_parent() -> Control:
	prepare()
	return _task_content_host


func set_task_content(content: Control) -> void:
	prepare()
	if content == null:
		_task_label.visible = true
		return
	var current_parent := content.get_parent()
	if current_parent != null:
		current_parent.remove_child(content)
	_task_content_host.add_child(content)
	content.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	content.position = Vector2.ZERO
	_task_label.visible = false


func debug_snapshot() -> Dictionary:
	var kinds: Array[String] = []
	var names: Array[String] = []
	var statuses: Array[String] = []
	for raw_row in _state.get("rows", []):
		if raw_row is Dictionary:
			var row := raw_row as Dictionary
			kinds.append(str(row.get("kind", "")))
			names.append(str(row.get("name", "")))
			statuses.append(str(row.get("statusText", "")))
	return {
		"activeTab": _active_tab,
		"rowCount": _row_nodes.size(),
		"rowKinds": kinds,
		"rowNames": names,
		"rowStatuses": statuses,
		"statusText": _status_label.text if _status_label != null else "",
		"detailVisible": detail_button != null and detail_button.visible,
		"cancelVisible": cancel_button != null and cancel_button.visible,
		"taskVisible": _task_body != null and _task_body.visible,
		"partyVisible": _party_body != null and _party_body.visible,
	}


func _build() -> void:
	_root_panel = PanelContainer.new()
	_root_panel.name = "WorldHudPartyRosterShell"
	_root_panel.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_root_panel.add_theme_stylebox_override(
		"panel",
		WorldHudPartyRosterVisualSkin.panel_style()
	)
	add_child(_root_panel)

	var column := VBoxContainer.new()
	column.name = "WorldHudPartyRosterColumn"
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	column.add_theme_constant_override("separation", 5)
	_root_panel.add_child(column)

	var tabs := HBoxContainer.new()
	tabs.name = "WorldHudPartyTabs"
	tabs.custom_minimum_size = Vector2(0.0, 42.0)
	tabs.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	tabs.add_theme_constant_override("separation", 4)
	column.add_child(tabs)

	task_tab_button = Button.new()
	task_tab_button.name = "WorldHudPartyTaskTab"
	task_tab_button.text = "任务"
	task_tab_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	task_tab_button.pressed.connect(func() -> void:
		set_active_tab(TAB_TASK, true)
	)
	tabs.add_child(task_tab_button)
	party_tab_button = Button.new()
	party_tab_button.name = "WorldHudPartyTeamTab"
	party_tab_button.text = "组队"
	party_tab_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	party_tab_button.pressed.connect(func() -> void:
		set_active_tab(TAB_PARTY, true)
	)
	tabs.add_child(party_tab_button)

	_task_body = PanelContainer.new()
	_task_body.name = "WorldHudPartyTaskBody"
	_task_body.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_task_body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_task_body.add_theme_stylebox_override(
		"panel",
		WorldHudPartyRosterVisualSkin.task_body_style()
	)
	column.add_child(_task_body)
	_task_content_host = Control.new()
	_task_content_host.name = "WorldHudPartyTaskContentHost"
	_task_content_host.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_task_body.add_child(_task_content_host)
	_task_label = Label.new()
	_task_label.name = "WorldHudPartyTaskText"
	_task_label.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_task_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_task_label.vertical_alignment = VERTICAL_ALIGNMENT_TOP
	WorldHudPartyRosterVisualSkin.apply_body(_task_label, 16)
	_task_content_host.add_child(_task_label)

	_party_body = Control.new()
	_party_body.name = "WorldHudPartyMembersBody"
	_party_body.custom_minimum_size = Vector2(0.0, 286.0)
	_party_body.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_party_body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	column.add_child(_party_body)
	_roster = VBoxContainer.new()
	_roster.name = "WorldHudPartyMemberList"
	_roster.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_roster.add_theme_constant_override("separation", 4)
	_party_body.add_child(_roster)

	_footer = PanelContainer.new()
	_footer.name = "WorldHudPartyFooter"
	_footer.custom_minimum_size = Vector2(0.0, 50.0)
	_footer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_footer.add_theme_stylebox_override(
		"panel",
		WorldHudPartyRosterVisualSkin.footer_style()
	)
	column.add_child(_footer)
	var footer_column := VBoxContainer.new()
	footer_column.add_theme_constant_override("separation", 2)
	footer_column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_footer.add_child(footer_column)
	_status_label = Label.new()
	_status_label.name = "WorldHudPartyStatus"
	_status_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_status_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	_status_label.custom_minimum_size = Vector2(0.0, 20.0)
	WorldHudPartyRosterVisualSkin.apply_body(_status_label, 12)
	footer_column.add_child(_status_label)
	var action_row := HBoxContainer.new()
	action_row.add_theme_constant_override("separation", 4)
	action_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	footer_column.add_child(action_row)
	detail_button = Button.new()
	detail_button.name = "WorldHudPartyDetailButton"
	detail_button.text = "查看匹配"
	detail_button.custom_minimum_size = Vector2(0.0, 28.0)
	detail_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	detail_button.pressed.connect(func() -> void: match_detail_requested.emit())
	WorldHudPartyRosterVisualSkin.apply_action(detail_button, true)
	action_row.add_child(detail_button)
	cancel_button = Button.new()
	cancel_button.name = "WorldHudPartyCancelButton"
	cancel_button.text = "取消匹配"
	cancel_button.custom_minimum_size = Vector2(0.0, 28.0)
	cancel_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	cancel_button.pressed.connect(func() -> void: cancel_match_requested.emit())
	WorldHudPartyRosterVisualSkin.apply_action(cancel_button, false)
	action_row.add_child(cancel_button)


func _rebuild_roster() -> void:
	for child in _roster.get_children():
		_roster.remove_child(child)
		child.queue_free()
	_row_nodes.clear()
	var rows = _state.get("rows", [])
	if not (rows is Array):
		rows = []
	for index in range(PARTY_MAX_MEMBERS):
		var row := (
			(rows as Array)[index] as Dictionary
			if index < (rows as Array).size() and (rows as Array)[index] is Dictionary
			else {"kind": "empty", "name": "等待队友", "levelText": "可加入"}
		)
		var card := _member_card(row, index)
		_roster.add_child(card)
		_row_nodes.append(card)


func _member_card(row: Dictionary, index: int) -> Control:
	var kind := str(row.get("kind", "empty")).strip_edges().to_lower()
	if kind not in ["human", "npc", "empty"]:
		kind = "empty"
	var leader := bool(row.get("leader", false))
	var card := PanelContainer.new()
	card.name = "WorldHudPartyMember%d" % (index + 1)
	card.custom_minimum_size = Vector2(0.0, 54.0)
	card.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	card.add_theme_stylebox_override(
		"panel",
		WorldHudPartyRosterVisualSkin.member_card_style(kind, leader)
	)
	var row_layout := HBoxContainer.new()
	row_layout.add_theme_constant_override("separation", 6)
	row_layout.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	card.add_child(row_layout)

	var portrait_frame := PanelContainer.new()
	portrait_frame.name = "PortraitFrame"
	portrait_frame.custom_minimum_size = Vector2(44.0, 44.0)
	portrait_frame.add_theme_stylebox_override(
		"panel",
		WorldHudPartyRosterVisualSkin.portrait_frame_style(kind)
	)
	row_layout.add_child(portrait_frame)
	var portrait := TextureRect.new()
	portrait.name = "Portrait"
	portrait.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	portrait.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	portrait.texture = WorldHudPartyRosterVisualSkin.texture_from_path(
		row.get("portraitTexturePath", "")
	)
	if kind == "empty":
		portrait.modulate = Color(1.0, 1.0, 1.0, 0.34)
	portrait_frame.add_child(portrait)

	var info := VBoxContainer.new()
	info.name = "MemberInfo"
	info.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	info.add_theme_constant_override("separation", 1)
	row_layout.add_child(info)
	var name_row := HBoxContainer.new()
	name_row.add_theme_constant_override("separation", 3)
	name_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	info.add_child(name_row)
	var name_label := Label.new()
	name_label.name = "MemberName"
	name_label.text = str(row.get("name", "等待队友"))
	name_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	name_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	WorldHudPartyRosterVisualSkin.apply_name(name_label, leader)
	name_row.add_child(name_label)
	if leader:
		var leader_label := Label.new()
		leader_label.name = "LeaderBadge"
		leader_label.text = "队长"
		leader_label.custom_minimum_size = Vector2(35.0, 18.0)
		WorldHudPartyRosterVisualSkin.apply_badge(leader_label, "human")
		name_row.add_child(leader_label)

	var facts := HBoxContainer.new()
	facts.add_theme_constant_override("separation", 4)
	facts.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	info.add_child(facts)
	var element_id := str(row.get("elementId", ""))
	if element_id != "":
		var element_label := Label.new()
		element_label.name = "ElementBadge"
		element_label.text = str(row.get("elementLabel", ""))
		element_label.custom_minimum_size = Vector2(21.0, 20.0)
		WorldHudPartyRosterVisualSkin.apply_element(element_label, element_id)
		facts.add_child(element_label)
	var level_label := Label.new()
	level_label.name = "LevelText"
	level_label.text = str(row.get("levelText", "可加入"))
	level_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	WorldHudPartyRosterVisualSkin.apply_body(level_label, 13, kind == "empty")
	facts.add_child(level_label)
	var kind_label := Label.new()
	var offline_human := kind == "human" and not bool(row.get("online", true))
	kind_label.name = "StatusText" if offline_human else "KindBadge"
	kind_label.text = (
		str(row.get("statusText", "离线"))
		if offline_human
		else str(row.get("kindLabel", "空位"))
	)
	kind_label.custom_minimum_size = Vector2(50.0 if kind == "npc" else 38.0, 20.0)
	WorldHudPartyRosterVisualSkin.apply_badge(kind_label, kind)
	facts.add_child(kind_label)
	return card


func _refresh_tabs() -> void:
	WorldHudPartyRosterVisualSkin.apply_tab(task_tab_button, _active_tab == TAB_TASK)
	WorldHudPartyRosterVisualSkin.apply_tab(party_tab_button, _active_tab == TAB_PARTY)
	_task_body.visible = _active_tab == TAB_TASK
	_party_body.visible = _active_tab == TAB_PARTY
	_footer.visible = _active_tab == TAB_PARTY
