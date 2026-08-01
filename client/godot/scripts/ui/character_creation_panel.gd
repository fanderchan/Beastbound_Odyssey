extends Control
class_name CharacterCreationPanel

const CharacterCreationModel := preload(
	"res://scripts/progression/character_creation_model.gd"
)
const CharacterRosterModel := preload(
	"res://scripts/progression/character_roster_model.gd"
)
const CharacterEntryVisualSkin := preload(
	"res://scripts/ui/character_entry_visual_skin.gd"
)
const PlayerAppearanceCatalog := preload(
	"res://scripts/player/player_appearance_catalog.gd"
)

signal submitted(payload: Dictionary)
signal cancelled()

const MODE_CREATE := "create"
const MODE_LEGACY_ALLOCATION := "legacy_allocation"

const ELEMENT_COLORS := {
	"earth": Color(0.34, 0.78, 0.32, 1.0),
	"water": Color(0.32, 0.76, 0.98, 1.0),
	"fire": Color(0.96, 0.30, 0.18, 1.0),
	"wind": Color(0.91, 0.73, 0.22, 1.0),
}

var _mode := MODE_CREATE
var _slot_index := -1
var _legacy_character: Dictionary = {}
var _visual_sources: Dictionary = {}
var _appearance_entries: Array[Dictionary] = []
var _appearance_ids: Array[String] = []
var _appearance_id := ""
var _available_appearance_ids: Array[String] = []
var _elements: Dictionary = {}
var _loading := false
var _error_message := ""
var _random_name_rng := RandomNumberGenerator.new()

var _background: TextureRect
var _return_button: Button
var _appearance_buttons: Dictionary = {}
var _appearance_unavailable_labels: Dictionary = {}
var _showcase: TextureRect
var _showcase_notice: Label
var _appearance_name_label: Label
var _board: Panel
var _mode_label: Label
var _element_value_labels: Dictionary = {}
var _element_segments: Dictionary = {}
var _minus_buttons: Dictionary = {}
var _plus_buttons: Dictionary = {}
var _remaining_label: Label
var _name_input: LineEdit
var _random_name_button: Button
var _error_label: Label
var _submit_button: Button


func _init() -> void:
	name = "CharacterCreationPanel"
	custom_minimum_size = CharacterEntryVisualSkin.VIEWPORT_SIZE
	size = CharacterEntryVisualSkin.VIEWPORT_SIZE
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	focus_mode = Control.FOCUS_ALL
	z_index = 45
	_visual_sources = CharacterEntryVisualSkin.default_visual_sources()
	_appearance_entries = PlayerAppearanceCatalog.creation_entries()
	_appearance_ids = PlayerAppearanceCatalog.appearance_ids()
	_elements = CharacterCreationModel.empty_elements()
	_random_name_rng.randomize()
	_build_ui()
	visible = false


func configure_visual_sources(value: Dictionary) -> void:
	_visual_sources = CharacterEntryVisualSkin.merge_visual_sources(value)
	_refresh_background()
	_refresh_appearance_assets()
	_refresh_appearance_selection()


func open_for_creation(slot_index: int) -> void:
	_mode = MODE_CREATE
	_slot_index = slot_index
	_legacy_character.clear()
	_elements = CharacterCreationModel.empty_elements()
	_name_input.editable = true
	_name_input.text = ""
	_random_name_button.disabled = false
	_error_message = ""
	_loading = false
	_refresh_appearance_assets()
	_appearance_id = (
		_available_appearance_ids[0]
		if not _available_appearance_ids.is_empty()
		else ""
	)
	visible = true
	_refresh_all()
	if _appearance_id == "":
		show_error("人物美术资源尚未准备完成，暂时不能创建")
	else:
		_name_input.grab_focus()


func open_for_legacy_allocation(character_value: Dictionary) -> void:
	_mode = MODE_LEGACY_ALLOCATION
	_slot_index = int(character_value.get("slotIndex", -1))
	_legacy_character = character_value.duplicate(true)
	_elements = CharacterCreationModel.empty_elements()
	_appearance_id = str(
		character_value.get("appearanceId", "novice_hunter_v1")
	).strip_edges()
	_name_input.text = str(character_value.get("name", "旧角色"))
	_name_input.editable = false
	_random_name_button.disabled = true
	_error_message = ""
	_loading = false
	_refresh_appearance_assets()
	visible = true
	_refresh_all()
	_submit_button.grab_focus()


func close_panel() -> void:
	if _loading:
		return
	visible = false
	_error_message = ""
	cancelled.emit()


func set_loading(active: bool) -> void:
	_loading = active
	_refresh_interaction_state()


func show_error(message: String) -> void:
	_loading = false
	_error_message = message.strip_edges()
	if _error_message == "":
		_error_message = "暂时无法完成，请稍后再试"
	_refresh_error()
	_refresh_interaction_state()


func clear_error() -> void:
	_error_message = ""
	_refresh_error()


func mode() -> String:
	return _mode


func current_elements() -> Dictionary:
	return _elements.duplicate(true)


func selected_appearance_id() -> String:
	return _appearance_id


func available_appearance_ids() -> Array[String]:
	return _available_appearance_ids.duplicate()


func appearance_button(appearance_id: String) -> Button:
	return _appearance_buttons.get(appearance_id, null) as Button


func element_button(element_key: String, increase: bool) -> Button:
	return (
		_plus_buttons.get(element_key, null) as Button
		if increase
		else _minus_buttons.get(element_key, null) as Button
	)


func snapshot() -> Dictionary:
	var appearance_states: Dictionary = {}
	for appearance_id in _appearance_ids:
		var button := _appearance_buttons.get(appearance_id, null) as Button
		appearance_states[appearance_id] = {
			"available": _available_appearance_ids.has(appearance_id),
			"disabled": button == null or button.disabled,
			"selected": appearance_id == _appearance_id,
		}
	return {
		"visible": visible,
		"mode": _mode,
		"slotIndex": _slot_index,
		"appearanceId": _appearance_id,
		"availableAppearanceIds": _available_appearance_ids.duplicate(),
		"appearanceStates": appearance_states,
		"elements": _elements.duplicate(true),
		"remainingPoints": CharacterCreationModel.remaining_points(_elements),
		"name": _name_input.text,
		"nameEditable": _name_input.editable,
		"loading": _loading,
		"errorText": _error_message,
		"submitDisabled": _submit_button.disabled,
		"showcaseVisible": _showcase.visible,
		"layoutRects": {
			"returnButton": _rect_snapshot(_return_button),
			"showcase": _rect_snapshot(_showcase),
			"board": _rect_snapshot(_board),
			"submitButton": _rect_snapshot(_submit_button),
			"nameInput": _rect_snapshot(_name_input),
			"randomNameButton": _rect_snapshot(_random_name_button),
		},
	}


func _build_ui() -> void:
	_background = TextureRect.new()
	_background.name = "CreationBackground"
	_background.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_background.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_background.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	_background.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	_background.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_background)

	var atmosphere := ColorRect.new()
	atmosphere.name = "CreationAtmosphere"
	atmosphere.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	atmosphere.color = Color(0.015, 0.025, 0.018, 0.12)
	atmosphere.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(atmosphere)

	_return_button = Button.new()
	_return_button.name = "CreationReturnButton"
	CharacterEntryVisualSkin.apply_back_button(_return_button)
	_return_button.pressed.connect(close_panel)
	add_child(_return_button)
	_place(_return_button, Rect2(34.0, 18.0, 178.0, 66.0))

	_build_appearance_column()
	_build_showcase()
	_build_configuration_board()
	_refresh_background()


func _build_appearance_column() -> void:
	var heading := Label.new()
	heading.name = "AppearanceHeading"
	heading.text = "选择形象"
	heading.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	heading.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	heading.mouse_filter = Control.MOUSE_FILTER_IGNORE
	CharacterEntryVisualSkin.apply_body(
		heading,
		18,
		CharacterEntryVisualSkin.CREAM_TEXT
	)
	add_child(heading)
	_place(heading, Rect2(82.0, 80.0, 150.0, 34.0))

	for index in range(_appearance_entries.size()):
		var entry := _appearance_entries[index]
		var appearance_id := str(entry.get("appearanceId", ""))
		var button := Button.new()
		button.name = "Appearance%d" % index
		button.tooltip_text = str(entry.get("displayName", "未知形象"))
		button.expand_icon = true
		button.action_mode = BaseButton.ACTION_MODE_BUTTON_RELEASE
		button.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
		button.focus_mode = Control.FOCUS_ALL
		button.pressed.connect(func() -> void:
			_select_appearance(appearance_id)
		)
		add_child(button)
		_place(button, Rect2(105.0, 120.0 + index * 132.0, 104.0, 104.0))
		_appearance_buttons[appearance_id] = button

		var label := Label.new()
		label.name = "Appearance%dName" % index
		label.text = str(entry.get("displayName", "未知形象"))
		label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		label.mouse_filter = Control.MOUSE_FILTER_IGNORE
		CharacterEntryVisualSkin.apply_body(
			label,
			14,
			CharacterEntryVisualSkin.CREAM_TEXT
		)
		add_child(label)
		_place(label, Rect2(73.0, 224.0 + index * 132.0, 168.0, 26.0))

		var unavailable := Label.new()
		unavailable.name = "Appearance%dUnavailable" % index
		unavailable.text = "美术准备中"
		unavailable.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		unavailable.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		unavailable.mouse_filter = Control.MOUSE_FILTER_IGNORE
		CharacterEntryVisualSkin.apply_body(
			unavailable,
			13,
			CharacterEntryVisualSkin.MUTED_TEXT
		)
		add_child(unavailable)
		_place(unavailable, Rect2(76.0, 157.0 + index * 132.0, 162.0, 32.0))
		_appearance_unavailable_labels[appearance_id] = unavailable


func _build_showcase() -> void:
	_showcase = TextureRect.new()
	_showcase.name = "CreationShowcase"
	_showcase.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_showcase.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	_showcase.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	_showcase.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_showcase)
	_place(_showcase, Rect2(216.0, 48.0, 570.0, 628.0))

	_showcase_notice = Label.new()
	_showcase_notice.name = "ShowcaseNotice"
	_showcase_notice.text = "人物美术尚未准备完成"
	_showcase_notice.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_showcase_notice.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_showcase_notice.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_showcase_notice.mouse_filter = Control.MOUSE_FILTER_IGNORE
	CharacterEntryVisualSkin.apply_title(_showcase_notice, 22)
	add_child(_showcase_notice)
	_place(_showcase_notice, Rect2(316.0, 286.0, 360.0, 92.0))

	_appearance_name_label = Label.new()
	_appearance_name_label.name = "SelectedAppearanceName"
	_appearance_name_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_appearance_name_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_appearance_name_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	CharacterEntryVisualSkin.apply_title(_appearance_name_label, 25)
	add_child(_appearance_name_label)
	_place(_appearance_name_label, Rect2(300.0, 642.0, 400.0, 50.0))


func _build_configuration_board() -> void:
	_board = Panel.new()
	_board.name = "CreationBoard"
	_board.add_theme_stylebox_override(
		"panel",
		CharacterEntryVisualSkin.creation_board_style()
	)
	add_child(_board)
	_place(_board, Rect2(790.0, 42.0, 450.0, 636.0))

	var title := Label.new()
	title.name = "CreationTitle"
	title.text = "元素属性分配"
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	title.mouse_filter = Control.MOUSE_FILTER_IGNORE
	CharacterEntryVisualSkin.apply_title(title, 28)
	_board.add_child(title)
	_place(title, Rect2(42.0, 22.0, 366.0, 46.0))

	_mode_label = Label.new()
	_mode_label.name = "CreationModeHint"
	_mode_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_mode_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_mode_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	CharacterEntryVisualSkin.apply_body(
		_mode_label,
		14,
		CharacterEntryVisualSkin.MUTED_TEXT
	)
	_board.add_child(_mode_label)
	_place(_mode_label, Rect2(34.0, 65.0, 382.0, 28.0))

	for index in range(CharacterCreationModel.ELEMENT_KEYS.size()):
		_build_element_row(
			str(CharacterCreationModel.ELEMENT_KEYS[index]),
			index,
			104.0 + index * 72.0
		)

	_remaining_label = Label.new()
	_remaining_label.name = "RemainingPoints"
	_remaining_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_remaining_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_remaining_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	CharacterEntryVisualSkin.apply_title(_remaining_label, 18)
	_board.add_child(_remaining_label)
	_place(_remaining_label, Rect2(42.0, 392.0, 366.0, 34.0))

	var name_heading := Label.new()
	name_heading.name = "NameHeading"
	name_heading.text = "角色名字"
	name_heading.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	name_heading.mouse_filter = Control.MOUSE_FILTER_IGNORE
	CharacterEntryVisualSkin.apply_body(
		name_heading,
		16,
		CharacterEntryVisualSkin.GOLD_TEXT
	)
	_board.add_child(name_heading)
	_place(name_heading, Rect2(44.0, 434.0, 116.0, 30.0))

	_name_input = LineEdit.new()
	_name_input.name = "NameInput"
	_name_input.placeholder_text = "输入角色名"
	_name_input.max_length = CharacterRosterModel.NAME_MAX_LENGTH
	CharacterEntryVisualSkin.apply_line_edit(_name_input)
	_name_input.text_changed.connect(func(value: String) -> void:
		_error_message = ""
		if value.strip_edges() != "":
			var name_errors := CharacterRosterModel.character_name_errors(value)
			if not name_errors.is_empty():
				_error_message = name_errors[0]
		_refresh_error()
		_refresh_interaction_state()
	)
	_name_input.text_submitted.connect(func(_value: String) -> void:
		_submit()
	)
	_board.add_child(_name_input)
	_place(_name_input, Rect2(42.0, 466.0, 262.0, 50.0))

	_random_name_button = Button.new()
	_random_name_button.name = "RandomNameButton"
	_random_name_button.text = "换一个"
	CharacterEntryVisualSkin.apply_secondary_button(_random_name_button)
	_random_name_button.custom_minimum_size = Vector2(94.0, 50.0)
	_random_name_button.pressed.connect(_choose_random_name)
	_board.add_child(_random_name_button)
	_place(_random_name_button, Rect2(314.0, 466.0, 94.0, 50.0))

	_error_label = Label.new()
	_error_label.name = "CreationError"
	_error_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_error_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_error_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	_error_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	CharacterEntryVisualSkin.apply_body(
		_error_label,
		14,
		CharacterEntryVisualSkin.ERROR_TEXT
	)
	_board.add_child(_error_label)
	_place(_error_label, Rect2(30.0, 522.0, 390.0, 30.0))

	_submit_button = Button.new()
	_submit_button.name = "ConfirmCreationButton"
	_submit_button.text = "创建角色"
	CharacterEntryVisualSkin.apply_primary_button(_submit_button)
	_submit_button.pressed.connect(_submit)
	_board.add_child(_submit_button)
	_place(_submit_button, Rect2(96.0, 554.0, 258.0, 58.0))


func _build_element_row(key: String, _index: int, y: float) -> void:
	var label := Label.new()
	label.name = "Element%sLabel" % key.capitalize()
	label.text = str(CharacterCreationModel.ELEMENT_NAMES.get(key, key))
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	CharacterEntryVisualSkin.apply_title(label, 21)
	label.add_theme_color_override(
		"font_color",
		ELEMENT_COLORS.get(key, CharacterEntryVisualSkin.CREAM_TEXT) as Color
	)
	_board.add_child(label)
	_place(label, Rect2(32.0, y, 42.0, 44.0))

	var minus := Button.new()
	minus.name = "Element%sMinus" % key.capitalize()
	minus.text = "－"
	CharacterEntryVisualSkin.compact_action_button(minus)
	minus.pressed.connect(func() -> void:
		_adjust_element(key, -1)
	)
	_board.add_child(minus)
	_place(minus, Rect2(78.0, y, 42.0, 42.0))
	_minus_buttons[key] = minus

	var segment_values: Array[Panel] = []
	for segment_index in range(CharacterCreationModel.TOTAL_ELEMENT_POINTS):
		var segment := Panel.new()
		segment.name = "Element%sSegment%d" % [key.capitalize(), segment_index]
		segment.mouse_filter = Control.MOUSE_FILTER_IGNORE
		_board.add_child(segment)
		_place(segment, Rect2(132.0 + segment_index * 22.0, y + 9.0, 16.0, 25.0))
		segment_values.append(segment)
	_element_segments[key] = segment_values

	var plus := Button.new()
	plus.name = "Element%sPlus" % key.capitalize()
	plus.text = "＋"
	CharacterEntryVisualSkin.compact_action_button(plus)
	plus.pressed.connect(func() -> void:
		_adjust_element(key, 1)
	)
	_board.add_child(plus)
	_place(plus, Rect2(360.0, y, 42.0, 42.0))
	_plus_buttons[key] = plus

	var value_label := Label.new()
	value_label.name = "Element%sValue" % key.capitalize()
	value_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	value_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	value_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	CharacterEntryVisualSkin.apply_body(
		value_label,
		14,
		CharacterEntryVisualSkin.CREAM_TEXT
	)
	_board.add_child(value_label)
	_place(value_label, Rect2(402.0, y + 5.0, 32.0, 32.0))
	_element_value_labels[key] = value_label


func _refresh_all() -> void:
	_refresh_background()
	_refresh_appearance_assets()
	_refresh_appearance_selection()
	_refresh_elements()
	_refresh_mode()
	_refresh_error()
	_refresh_interaction_state()


func _refresh_background() -> void:
	var texture = CharacterEntryVisualSkin.texture_from(
		_visual_sources.get("backgroundTexture", null),
		str(_visual_sources.get("backgroundTexturePath", ""))
	)
	_background.texture = texture


func _refresh_appearance_assets() -> void:
	_available_appearance_ids.clear()
	var appearances = _visual_sources.get("appearances", {})
	for appearance_id_value in _appearance_ids:
		var appearance_id := str(appearance_id_value)
		var visual := (
			(appearances as Dictionary).get(appearance_id, {}) as Dictionary
			if appearances is Dictionary
			and (appearances as Dictionary).get(appearance_id, {}) is Dictionary
			else {}
		)
		var portrait = CharacterEntryVisualSkin.texture_from(
			visual.get("portraitTexture", null),
			str(visual.get("portraitTexturePath", ""))
		)
		var showcase = CharacterEntryVisualSkin.texture_from(
			visual.get("showcaseTexture", null),
			str(visual.get("showcaseTexturePath", ""))
		)
		var available := portrait != null and showcase != null
		if available:
			_available_appearance_ids.append(appearance_id)
		var button := _appearance_buttons.get(appearance_id, null) as Button
		if button != null:
			button.icon = portrait
		var unavailable := (
			_appearance_unavailable_labels.get(appearance_id, null) as Label
		)
		if unavailable != null:
			unavailable.visible = not available


func _refresh_appearance_selection() -> void:
	for appearance_id_value in _appearance_ids:
		var appearance_id := str(appearance_id_value)
		var button := _appearance_buttons.get(appearance_id, null) as Button
		if button == null:
			continue
		var available := _available_appearance_ids.has(appearance_id)
		var locked_out := _mode == MODE_LEGACY_ALLOCATION
		button.disabled = _loading or not available or locked_out
		var selected := appearance_id == _appearance_id
		var normal := CharacterEntryVisualSkin.appearance_button_style(
			selected,
			available
		)
		var hover := CharacterEntryVisualSkin.appearance_button_style(true, available)
		button.add_theme_stylebox_override("normal", normal)
		button.add_theme_stylebox_override("hover", hover)
		button.add_theme_stylebox_override("pressed", hover)
		button.add_theme_stylebox_override("focus", hover)
		button.add_theme_stylebox_override(
			"disabled",
			CharacterEntryVisualSkin.appearance_button_style(selected, false)
		)

	var visual := _appearance_visual(_appearance_id)
	var showcase = CharacterEntryVisualSkin.texture_from(
		visual.get("showcaseTexture", null),
		str(visual.get("showcaseTexturePath", ""))
	)
	_showcase.texture = showcase
	_showcase.visible = showcase != null
	_showcase_notice.visible = showcase == null
	_appearance_name_label.text = (
		CharacterCreationModel.appearance_name(_appearance_id)
		if _appearance_id != ""
		else "请选择可用形象"
	)


func _refresh_elements() -> void:
	for key_value in CharacterCreationModel.ELEMENT_KEYS:
		var key := str(key_value)
		var value := int(_elements.get(key, 0))
		var value_label := _element_value_labels.get(key, null) as Label
		if value_label != null:
			value_label.text = str(value)
		var segments = _element_segments.get(key, [])
		if segments is Array:
			for index in range((segments as Array).size()):
				var segment = (segments as Array)[index]
				if segment is Panel:
					var color: Color = ELEMENT_COLORS.get(
						key,
						Color(0.60, 0.60, 0.60, 1.0)
					)
					if index >= value:
						color = Color(0.075, 0.060, 0.048, 0.90)
					(segment as Panel).add_theme_stylebox_override(
						"panel",
						CharacterEntryVisualSkin.element_track_style(color)
					)
	_remaining_label.text = "剩余加点数值 %d" % CharacterCreationModel.remaining_points(
		_elements
	)


func _refresh_mode() -> void:
	if _mode == MODE_LEGACY_ALLOCATION:
		_mode_label.text = "旧角色首次补选元素 · 人物与名字已锁定"
		_submit_button.text = "保存元素"
	else:
		_mode_label.text = "共10点 · 最多两种 · 地火、水风不可共存"
		_submit_button.text = "创建角色"


func _refresh_error() -> void:
	_error_label.text = _error_message
	_error_label.visible = _error_message != ""


func _refresh_interaction_state() -> void:
	var complete := CharacterCreationModel.element_errors(_elements).is_empty()
	var name_valid := (
		_mode == MODE_LEGACY_ALLOCATION
		or CharacterRosterModel.character_name_errors(_name_input.text).is_empty()
	)
	var appearance_valid := (
		_appearance_id != ""
		and (
			_mode == MODE_LEGACY_ALLOCATION
			or _available_appearance_ids.has(_appearance_id)
		)
	)
	_submit_button.disabled = (
		_loading
		or not complete
		or not name_valid
		or not appearance_valid
	)
	_return_button.disabled = _loading
	_name_input.editable = _mode == MODE_CREATE and not _loading
	_random_name_button.disabled = _mode != MODE_CREATE or _loading
	for key_value in CharacterCreationModel.ELEMENT_KEYS:
		var key := str(key_value)
		var minus := _minus_buttons.get(key, null) as Button
		var plus := _plus_buttons.get(key, null) as Button
		if minus != null:
			minus.disabled = _loading or int(_elements.get(key, 0)) <= 0
		if plus != null:
			var adjusted := CharacterCreationModel.adjust_element(_elements, key, 1)
			plus.disabled = (
				_loading
				or adjusted == _elements
			)
	_refresh_appearance_selection()


func _select_appearance(value: String) -> void:
	if _loading or _mode == MODE_LEGACY_ALLOCATION:
		return
	if not _available_appearance_ids.has(value):
		show_error("这个人物形象的美术资源尚未准备完成")
		return
	_appearance_id = value
	_error_message = ""
	_refresh_appearance_selection()
	_refresh_error()
	_refresh_interaction_state()


func _adjust_element(key: String, delta: int) -> void:
	if _loading:
		return
	var before := _elements.duplicate(true)
	var adjusted := CharacterCreationModel.adjust_element(_elements, key, delta)
	if adjusted == before and delta > 0:
		var direct := before.duplicate(true)
		direct[key] = int(direct.get(key, 0)) + 1
		var errors := CharacterCreationModel.element_errors(direct, false)
		_error_message = (
			errors[0]
			if not errors.is_empty()
			else "元素点已经分配完毕"
		)
	else:
		_elements = adjusted
		_error_message = ""
	_refresh_elements()
	_refresh_error()
	_refresh_interaction_state()


func _choose_random_name() -> void:
	if _loading or _mode != MODE_CREATE:
		return
	_name_input.text = CharacterCreationModel.random_name(
		_random_name_rng,
		_name_input.text
	)
	_name_input.caret_column = _name_input.text.length()
	_error_message = ""
	_refresh_error()
	_refresh_interaction_state()


func _submit() -> void:
	if _loading:
		return
	var request := (
		CharacterCreationModel.build_legacy_allocation_request(
			_legacy_character,
			_elements
		)
		if _mode == MODE_LEGACY_ALLOCATION
		else CharacterCreationModel.build_create_request(
			_slot_index,
			_name_input.text,
			_appearance_id,
			_elements,
			_available_appearance_ids
		)
	)
	var errors = request.get("errors", [])
	if not bool(request.get("valid", false)):
		show_error(
			str((errors as Array)[0])
			if errors is Array and not (errors as Array).is_empty()
			else "请检查角色创建信息"
		)
		return
	_error_message = ""
	_loading = true
	_refresh_error()
	_refresh_interaction_state()
	submitted.emit(
		(request.get("payload", {}) as Dictionary).duplicate(true)
	)


func _appearance_visual(appearance_id: String) -> Dictionary:
	var appearances = _visual_sources.get("appearances", {})
	if not (appearances is Dictionary):
		return {}
	var value = (appearances as Dictionary).get(appearance_id, {})
	return (
		(value as Dictionary).duplicate(true)
		if value is Dictionary
		else {}
	)


func _rect_snapshot(control: Control) -> Dictionary:
	if control == null:
		return {}
	return {
		"x": control.position.x,
		"y": control.position.y,
		"width": control.size.x,
		"height": control.size.y,
	}


func _place(control: Control, rect: Rect2) -> void:
	control.set_anchors_preset(Control.PRESET_TOP_LEFT)
	control.position = rect.position
	control.size = rect.size
