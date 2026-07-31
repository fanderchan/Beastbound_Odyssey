extends Control
class_name CharacterEntryFlowController

const CharacterRosterModel := preload(
	"res://scripts/progression/character_roster_model.gd"
)
const CharacterEntryVisualSkin := preload(
	"res://scripts/ui/character_entry_visual_skin.gd"
)
const CharacterSlotCardScript := preload(
	"res://scripts/ui/character_slot_card.gd"
)
const CharacterCreationPanelScript := preload(
	"res://scripts/ui/character_creation_panel.gd"
)

signal create_character_requested(payload: Dictionary)
signal allocate_character_elements_requested(payload: Dictionary)
signal select_character_requested(player_id: String)
signal return_to_login_requested()
signal local_selection_changed(player_id: String)

const VIEWPORT_SIZE := CharacterEntryVisualSkin.VIEWPORT_SIZE

var _roster: Dictionary = {}
var _visual_sources: Dictionary = {}
var _selected_player_id := ""
var _creation_slot_index := -1
var _loading := false
var _pending_action := ""
var _error_message := ""
var _account_label_text := ""

var _background: TextureRect
var _background_has_injected_texture := false
var _logo: TextureRect
var _title_label: Label
var _showcase: TextureRect
var _showcase_fallback: Label
var _showcase_has_injected_texture := false
var _selected_name_label: Label
var _selected_detail_label: Label
var _right_panel: Panel
var _slot_cards: Array[Button] = []
var _status_label: Label
var _enter_button: Button
var _return_button: Button
var _account_label: Label
var _create_modal_shade: Control
var _creation_panel: Control
var _create_panel: Panel
var _loading_shade: ColorRect
var _loading_label: Label


func _init() -> void:
	name = "CharacterEntryFlowController"
	custom_minimum_size = VIEWPORT_SIZE
	size = VIEWPORT_SIZE
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	focus_mode = Control.FOCUS_ALL
	z_index = 3000
	_roster = CharacterRosterModel.empty_roster()
	_visual_sources = CharacterEntryVisualSkin.default_visual_sources()
	_build_ui()
	_refresh_all()


func open_with_roster(
	roster_value,
	preferred_player_id: String = "",
	account_label: String = ""
) -> void:
	_account_label_text = account_label.strip_edges()
	present_roster(roster_value, preferred_player_id)
	visible = true
	grab_focus()


func present_roster(
	roster_value,
	preferred_player_id: String = ""
) -> void:
	_roster = CharacterRosterModel.normalize_roster(roster_value)
	var preferred := preferred_player_id.strip_edges()
	if (
		preferred != ""
		and not CharacterRosterModel.character_by_id(
			_roster,
			preferred
		).is_empty()
	):
		_roster = CharacterRosterModel.with_selected_character(
			_roster,
			preferred
		)
	_selected_player_id = str(
		_roster.get(
			"selectedPlayerId",
			_roster.get("selectedCharacterId", "")
		)
	)
	_creation_slot_index = -1
	_create_modal_shade.visible = false
	_error_message = ""
	set_loading(false)
	_refresh_all()
	var current := selected_character()
	if bool(current.get("needsElementAllocation", false)):
		open_legacy_element_allocation(current)


func configure_visual_sources(value: Dictionary) -> void:
	_visual_sources = CharacterEntryVisualSkin.merge_visual_sources(value)
	if _creation_panel != null:
		_creation_panel.call("configure_visual_sources", _visual_sources)
	_refresh_background()
	_refresh_logo()
	_refresh_slot_cards()
	_refresh_selected_character()


func set_account_label(value: String) -> void:
	_account_label_text = value.strip_edges()
	_refresh_account_label()


func set_loading(active: bool, message: String = "") -> void:
	_loading = active
	if not active:
		_pending_action = ""
	_loading_shade.visible = active
	if _creation_panel != null:
		_creation_panel.call("set_loading", active)
	_loading_label.text = (
		_clean_player_message(message, "请稍候…")
		if active
		else ""
	)
	_refresh_interaction_state()


func show_error(player_message: String) -> void:
	set_loading(false)
	_error_message = _clean_player_message(
		player_message,
		"暂时无法完成，请稍后再试"
	)
	_status_label.text = _error_message
	_status_label.add_theme_color_override(
		"font_color",
		CharacterEntryVisualSkin.ERROR_TEXT
	)
	_status_label.add_theme_stylebox_override(
		"normal",
		CharacterEntryVisualSkin.status_style(true)
	)
	_status_label.visible = true
	if _creation_panel != null and _creation_panel.visible:
		_creation_panel.call("show_error", _error_message)
	_refresh_interaction_state()


func show_notice(player_message: String) -> void:
	_error_message = ""
	_status_label.text = _clean_player_message(
		player_message,
		"请选择一位角色"
	)
	_status_label.add_theme_color_override(
		"font_color",
		CharacterEntryVisualSkin.CREAM_TEXT
	)
	_status_label.add_theme_stylebox_override(
		"normal",
		CharacterEntryVisualSkin.status_style(false)
	)
	_status_label.visible = true


func clear_message() -> void:
	_error_message = ""
	_refresh_status()


func selected_player_id() -> String:
	return _selected_player_id


func selected_character() -> Dictionary:
	return CharacterRosterModel.character_by_id(
		_roster,
		_selected_player_id
	)


func roster_snapshot() -> Dictionary:
	return _roster.duplicate(true)


func slot_card(slot_index: int) -> Button:
	if slot_index < 0 or slot_index >= _slot_cards.size():
		return null
	return _slot_cards[slot_index]


func open_creation_form(slot_index: int) -> bool:
	if _loading or slot_index < 0 or slot_index >= CharacterRosterModel.SLOT_COUNT:
		return false
	var slots = _roster.get("slots", [])
	if not (slots is Array) or slot_index >= (slots as Array).size():
		return false
	var slot_value = (slots as Array)[slot_index]
	if (
		not (slot_value is Dictionary)
		or bool((slot_value as Dictionary).get("occupied", false))
	):
		return false
	_creation_slot_index = slot_index
	_error_message = ""
	_creation_panel.call("open_for_creation", slot_index)
	_refresh_status()
	_refresh_interaction_state()
	return true


func open_legacy_element_allocation(character: Dictionary) -> bool:
	if _loading or not bool(character.get("needsElementAllocation", false)):
		return false
	_creation_slot_index = int(character.get("slotIndex", -1))
	_error_message = ""
	_creation_panel.call("open_for_legacy_allocation", character)
	_refresh_status()
	_refresh_interaction_state()
	return true


func close_creation_form() -> void:
	if _loading:
		return
	_creation_slot_index = -1
	if _creation_panel != null and _creation_panel.visible:
		_creation_panel.call("close_panel")
	_refresh_interaction_state()
	_enter_button.grab_focus()


func snapshot() -> Dictionary:
	var card_snapshots: Array[Dictionary] = []
	for card in _slot_cards:
		card_snapshots.append(card.call("snapshot") as Dictionary)
	return {
		"visible": visible,
		"viewportSize": {
			"width": int(size.x),
			"height": int(size.y),
		},
		"slotCount": _slot_cards.size(),
		"cards": card_snapshots,
		"selectedPlayerId": _selected_player_id,
		"selectedName": (
			_selected_name_label.text
			if _selected_name_label != null
			else ""
		),
		"selectedDetail": (
			_selected_detail_label.text
			if _selected_detail_label != null
			else ""
		),
		"creationOpen": (
			_create_modal_shade.visible
			if _create_modal_shade != null
			else false
		),
		"creationSlotIndex": _creation_slot_index,
		"creation": (
			_creation_panel.call("snapshot") as Dictionary
			if _creation_panel != null
			else {}
		),
		"nameErrorText": (
			str(
				(_creation_panel.call("snapshot") as Dictionary).get(
					"errorText",
					""
				)
			)
			if _creation_panel != null
			else ""
		),
		"loading": _loading,
		"pendingAction": _pending_action,
		"loadingText": (
			_loading_label.text
			if _loading_label != null and _loading_label.visible
			else ""
		),
		"errorText": _error_message,
		"enterDisabled": (
			_enter_button.disabled
			if _enter_button != null
			else true
		),
		"returnDisabled": (
			_return_button.disabled
			if _return_button != null
			else true
		),
		"backgroundInjected": _background_has_injected_texture,
		"showcaseInjected": _showcase_has_injected_texture,
		"visibleText": visible_text(),
		"layoutRects": {
			"showcase": _rect_snapshot(_showcase),
			"rightPanel": _rect_snapshot(_right_panel),
			"enterButton": _rect_snapshot(_enter_button),
			"returnButton": _rect_snapshot(_return_button),
			"createPanel": _rect_snapshot(_create_panel),
		},
	}


func visible_text() -> String:
	var texts: Array[String] = []
	_collect_visible_text(self, texts)
	return "\n".join(texts)


func _build_ui() -> void:
	_background = TextureRect.new()
	_background.name = "Background"
	_background.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_background.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_background.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	_background.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	_background.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_background)

	var atmosphere := ColorRect.new()
	atmosphere.name = "AtmosphereShade"
	atmosphere.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	atmosphere.color = Color(0.02, 0.025, 0.01, 0.055)
	atmosphere.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(atmosphere)

	var left_vignette := ColorRect.new()
	left_vignette.name = "LeftVignette"
	left_vignette.color = Color.TRANSPARENT
	left_vignette.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(left_vignette)
	_place(left_vignette, Rect2(0.0, 0.0, 810.0, 720.0))

	_logo = TextureRect.new()
	_logo.name = "Logo"
	_logo.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_logo.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	_logo.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	_logo.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_logo.visible = false
	add_child(_logo)
	_place(_logo, Rect2(32.0, 18.0, 220.0, 66.0))

	_title_label = Label.new()
	_title_label.name = "Title"
	_title_label.text = ""
	_title_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_title_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	CharacterEntryVisualSkin.apply_title(_title_label, 34)
	add_child(_title_label)
	_place(_title_label, Rect2(42.0, 24.0, 320.0, 52.0))
	_title_label.visible = false

	var subtitle := Label.new()
	subtitle.name = "Subtitle"
	subtitle.text = ""
	subtitle.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	subtitle.mouse_filter = Control.MOUSE_FILTER_IGNORE
	CharacterEntryVisualSkin.apply_body(
		subtitle,
		16,
		CharacterEntryVisualSkin.MUTED_TEXT
	)
	add_child(subtitle)
	_place(subtitle, Rect2(44.0, 70.0, 330.0, 32.0))
	subtitle.visible = false

	_showcase = TextureRect.new()
	_showcase.name = "SelectedCharacterShowcase"
	_showcase.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_showcase.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	_showcase.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	_showcase.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_showcase)
	_place(_showcase, Rect2(150.0, 52.0, 650.0, 668.0))

	_showcase_fallback = Label.new()
	_showcase_fallback.name = "ShowcaseFallback"
	_showcase_fallback.text = "选择右侧角色\n查看冒险伙伴"
	_showcase_fallback.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_showcase_fallback.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_showcase_fallback.mouse_filter = Control.MOUSE_FILTER_IGNORE
	CharacterEntryVisualSkin.apply_title(_showcase_fallback, 25)
	add_child(_showcase_fallback)
	_place(_showcase_fallback, Rect2(246.0, 278.0, 360.0, 110.0))

	var nameplate := Panel.new()
	nameplate.name = "SelectedCharacterNameplate"
	nameplate.add_theme_stylebox_override(
		"panel",
		CharacterEntryVisualSkin.nameplate_style()
	)
	nameplate.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(nameplate)
	_place(nameplate, Rect2(172.0, 594.0, 420.0, 94.0))
	nameplate.visible = false

	_selected_name_label = Label.new()
	_selected_name_label.name = "SelectedCharacterName"
	_selected_name_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_selected_name_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_selected_name_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	_selected_name_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	CharacterEntryVisualSkin.apply_title(_selected_name_label, 27)
	nameplate.add_child(_selected_name_label)
	_place(_selected_name_label, Rect2(20.0, 9.0, 380.0, 42.0))

	_selected_detail_label = Label.new()
	_selected_detail_label.name = "SelectedCharacterDetail"
	_selected_detail_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_selected_detail_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_selected_detail_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	_selected_detail_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	CharacterEntryVisualSkin.apply_body(
		_selected_detail_label,
		15,
		CharacterEntryVisualSkin.MUTED_TEXT
	)
	nameplate.add_child(_selected_detail_label)
	_place(_selected_detail_label, Rect2(20.0, 50.0, 380.0, 32.0))

	_build_roster_panel()
	_build_return_button()
	_build_create_modal()
	_build_loading_overlay()


func _build_roster_panel() -> void:
	_right_panel = Panel.new()
	_right_panel.name = "RightPanel"
	_right_panel.add_theme_stylebox_override(
		"panel",
		CharacterEntryVisualSkin.main_panel_style()
	)
	add_child(_right_panel)
	_place(_right_panel, Rect2(820.0, 24.0, 430.0, 672.0))

	var heading := Label.new()
	heading.name = "RosterHeading"
	heading.text = "我的角色"
	heading.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	heading.mouse_filter = Control.MOUSE_FILTER_IGNORE
	CharacterEntryVisualSkin.apply_title(heading, 28)
	_right_panel.add_child(heading)
	_place(heading, Rect2(0.0, 0.0, 1.0, 1.0))
	heading.visible = false

	var capacity := Label.new()
	capacity.name = "RosterCapacity"
	capacity.text = "最多可创建 4 个角色"
	capacity.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	capacity.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	capacity.mouse_filter = Control.MOUSE_FILTER_IGNORE
	CharacterEntryVisualSkin.apply_body(
		capacity,
		14,
		CharacterEntryVisualSkin.MUTED_TEXT
	)
	_right_panel.add_child(capacity)
	_place(capacity, Rect2(0.0, 0.0, 1.0, 1.0))
	capacity.visible = false

	var slot_positions := [
		Rect2(5.0, 0.0, 420.0, 132.0),
		Rect2(5.0, 138.0, 420.0, 132.0),
		Rect2(5.0, 276.0, 420.0, 132.0),
		Rect2(5.0, 414.0, 420.0, 132.0),
	]
	for slot_index in range(CharacterRosterModel.SLOT_COUNT):
		var card := CharacterSlotCardScript.new() as Button
		card.name = "SlotCard%d" % slot_index
		card.connect(
			"slot_activated",
			_on_slot_activated
		)
		_right_panel.add_child(card)
		_place(card, slot_positions[slot_index])
		_slot_cards.append(card)

	_status_label = Label.new()
	_status_label.name = "Status"
	_status_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_status_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_status_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	_status_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	CharacterEntryVisualSkin.apply_body(_status_label, 15)
	_right_panel.add_child(_status_label)
	_place(_status_label, Rect2(20.0, 546.0, 390.0, 34.0))

	_enter_button = Button.new()
	_enter_button.name = "EnterGameButton"
	_enter_button.text = "进入游戏"
	CharacterEntryVisualSkin.apply_primary_button(_enter_button)
	_enter_button.pressed.connect(_on_enter_pressed)
	_right_panel.add_child(_enter_button)
	_place(_enter_button, Rect2(67.0, 588.0, 296.0, 68.0))

	_account_label = Label.new()
	_account_label.name = "AccountLabel"
	_account_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_account_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_account_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	_account_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	CharacterEntryVisualSkin.apply_body(
		_account_label,
		13,
		CharacterEntryVisualSkin.MUTED_TEXT
	)
	_right_panel.add_child(_account_label)
	_place(_account_label, Rect2(20.0, 654.0, 390.0, 18.0))
	_account_label.visible = false


func _build_return_button() -> void:
	_return_button = Button.new()
	_return_button.name = "ReturnToLoginButton"
	CharacterEntryVisualSkin.apply_back_button(_return_button)
	_return_button.pressed.connect(_on_return_pressed)
	add_child(_return_button)
	_place(_return_button, Rect2(38.0, 18.0, 184.0, 68.0))


func _build_create_modal() -> void:
	_creation_panel = CharacterCreationPanelScript.new()
	_creation_panel.name = "CharacterCreationPanel"
	_creation_panel.call("configure_visual_sources", _visual_sources)
	_creation_panel.connect("submitted", _on_creation_submitted)
	_creation_panel.connect("cancelled", _on_creation_cancelled)
	add_child(_creation_panel)
	_create_modal_shade = _creation_panel
	_create_panel = _creation_panel.get_node_or_null("CreationBoard") as Panel


func _build_loading_overlay() -> void:
	_loading_shade = ColorRect.new()
	_loading_shade.name = "LoadingShade"
	_loading_shade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_loading_shade.color = Color(0.0, 0.0, 0.0, 0.70)
	_loading_shade.mouse_filter = Control.MOUSE_FILTER_STOP
	_loading_shade.z_index = 60
	add_child(_loading_shade)

	var loading_panel := Panel.new()
	loading_panel.name = "LoadingPanel"
	loading_panel.add_theme_stylebox_override(
		"panel",
		CharacterEntryVisualSkin.modal_style()
	)
	_loading_shade.add_child(loading_panel)
	_place(loading_panel, Rect2(442.0, 292.0, 396.0, 136.0))

	_loading_label = Label.new()
	_loading_label.name = "LoadingLabel"
	_loading_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_loading_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_loading_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	CharacterEntryVisualSkin.apply_title(_loading_label, 22)
	loading_panel.add_child(_loading_label)
	_place(_loading_label, Rect2(26.0, 24.0, 344.0, 88.0))
	_loading_shade.visible = false


func _refresh_all() -> void:
	_refresh_background()
	_refresh_logo()
	_refresh_slot_cards()
	_refresh_selected_character()
	_refresh_status()
	_refresh_account_label()
	_refresh_interaction_state()


func _refresh_background() -> void:
	if _background == null:
		return
	var texture = CharacterEntryVisualSkin.texture_from(
		_visual_sources.get("backgroundTexture", null),
		str(
			_visual_sources.get(
				"backgroundTexturePath",
				CharacterEntryVisualSkin.DEFAULT_BACKGROUND_PATH
			)
		)
	)
	_background.texture = (
		texture
		if texture != null
		else CharacterEntryVisualSkin.fallback_backdrop_texture()
	)
	_background_has_injected_texture = _background.texture != null


func _refresh_logo() -> void:
	if _logo == null or _title_label == null:
		return
	var texture = CharacterEntryVisualSkin.texture_from(
		_visual_sources.get("logoTexture", null),
		str(_visual_sources.get("logoTexturePath", ""))
	)
	_logo.texture = texture
	_logo.visible = texture != null
	_title_label.visible = false


func _refresh_slot_cards() -> void:
	if _slot_cards.is_empty():
		return
	var slots = _roster.get("slots", [])
	for slot_index in range(_slot_cards.size()):
		var slot := CharacterRosterModel.empty_slot(slot_index)
		if slots is Array and slot_index < (slots as Array).size():
			var value = (slots as Array)[slot_index]
			if value is Dictionary:
				slot = _with_injected_character_visuals(
					value as Dictionary
				)
		_slot_cards[slot_index].call(
			"configure",
			slot,
			bool(slot.get("occupied", false))
				and str(slot.get("playerId", ""))
					== _selected_player_id,
			_loading or _create_modal_shade.visible
		)


func _refresh_selected_character() -> void:
	var character := selected_character()
	if character.is_empty():
		_showcase.texture = null
		_showcase.visible = false
		_showcase_has_injected_texture = false
		_showcase_fallback.text = "选择右侧空位\n创建你的第一位角色"
		_showcase_fallback.visible = true
		_selected_name_label.text = "等待新冒险"
		_selected_detail_label.text = "创建角色后即可进入世界"
		return
	character = _with_injected_character_visuals(character)
	var texture = CharacterEntryVisualSkin.texture_from(
		character.get("showcaseTexture", null),
		str(character.get("showcaseTexturePath", ""))
	)
	_showcase.texture = texture
	_showcase.visible = texture != null
	_showcase_has_injected_texture = texture != null
	_showcase_fallback.text = "角色全身预览"
	_showcase_fallback.visible = texture == null
	_selected_name_label.text = str(character.get("name", "未命名角色"))
	var detail_parts: Array[String] = [
		"Lv.%d" % maxi(1, int(character.get("level", 1))),
	]
	var rebirth_count := maxi(0, int(character.get("rebirthCount", 0)))
	if rebirth_count > 0:
		detail_parts.append("%d转" % rebirth_count)
	var map_name := str(character.get("mapName", "")).strip_edges()
	if map_name != "":
		detail_parts.append(map_name)
	_selected_detail_label.text = "  ·  ".join(detail_parts)


func _refresh_status() -> void:
	if _status_label == null:
		return
	if _error_message != "":
		_status_label.text = _error_message
		_status_label.add_theme_color_override(
			"font_color",
			CharacterEntryVisualSkin.ERROR_TEXT
		)
		_status_label.add_theme_stylebox_override(
			"normal",
			CharacterEntryVisualSkin.status_style(true)
		)
		_status_label.visible = true
		return
	_status_label.text = ""
	_status_label.visible = false


func _refresh_account_label() -> void:
	if _account_label == null:
		return
	_account_label.text = ""
	_account_label.visible = false


func _refresh_interaction_state() -> void:
	var modal_open := (
		_create_modal_shade != null
		and _create_modal_shade.visible
	)
	if _enter_button != null:
		_enter_button.disabled = (
			_loading
			or modal_open
			or _selected_player_id == ""
		)
	if _return_button != null:
		_return_button.disabled = _loading or modal_open
	_refresh_slot_cards()


func _on_slot_activated(
	slot_index: int,
	player_id: String,
	occupied: bool
) -> void:
	if _loading:
		return
	_error_message = ""
	if not occupied:
		open_creation_form(slot_index)
		return
	if player_id == "":
		show_error("这个角色暂时无法选择")
		return
	var character := CharacterRosterModel.character_by_player_id(
		_roster,
		player_id
	)
	if bool(character.get("needsElementAllocation", false)):
		_selected_player_id = player_id
		_roster = CharacterRosterModel.with_selected_character(
			_roster,
			player_id
		)
		open_legacy_element_allocation(character)
		return
	_selected_player_id = player_id
	_roster = CharacterRosterModel.with_selected_character(
		_roster,
		player_id
	)
	_refresh_slot_cards()
	_refresh_selected_character()
	_refresh_status()
	_refresh_interaction_state()
	local_selection_changed.emit(player_id)


func _on_creation_submitted(payload: Dictionary) -> void:
	if _loading or _creation_panel == null:
		return
	var mode_value := str(_creation_panel.call("mode"))
	if mode_value == "legacy_allocation":
		_pending_action = "allocate_elements"
		set_loading(true, "正在保存元素…")
		allocate_character_elements_requested.emit(payload.duplicate(true))
		return
	_pending_action = "create"
	set_loading(true, "正在创建角色…")
	create_character_requested.emit(payload.duplicate(true))


func _on_creation_cancelled() -> void:
	_creation_slot_index = -1
	_error_message = ""
	_refresh_status()
	_refresh_interaction_state()


func _on_enter_pressed() -> void:
	if _loading:
		return
	var request := CharacterRosterModel.build_select_request(
		_roster,
		_selected_player_id
	)
	var errors = request.get("errors", [])
	if not bool(request.get("valid", false)):
		show_error(
			str((errors as Array)[0])
			if errors is Array and not (errors as Array).is_empty()
			else "请选择要进入游戏的角色"
		)
		return
	var payload := request.get("payload", {}) as Dictionary
	var player_id := str(payload.get("playerId", ""))
	_pending_action = "select"
	set_loading(true, "正在进入世界…")
	select_character_requested.emit(player_id)


func _on_return_pressed() -> void:
	if _loading or _create_modal_shade.visible:
		return
	return_to_login_requested.emit()


func _with_injected_character_visuals(
	character_value: Dictionary
) -> Dictionary:
	var character := character_value.duplicate(true)
	var appearance_id := str(character.get("appearanceId", "")).strip_edges()
	if appearance_id == "":
		appearance_id = "novice_hunter_v1"
	var appearances_value = _visual_sources.get("appearances", {})
	if not (appearances_value is Dictionary):
		return character
	var appearances := appearances_value as Dictionary
	var visual_value = appearances.get(appearance_id, {})
	if not (visual_value is Dictionary):
		return character
	var visual := visual_value as Dictionary
	for key in [
		"portraitTexture",
		"portraitTexturePath",
		"showcaseTexture",
		"showcaseTexturePath",
	]:
		var current = character.get(key, null)
		var current_empty := current == null or str(current).strip_edges() == ""
		if current_empty and visual.has(key):
			character[key] = visual.get(key)
	return character


func _clean_player_message(
	value: String,
	fallback: String
) -> String:
	var result := value.strip_edges()
	result = result.replace("\r", " ").replace("\n", " ")
	while result.contains("  "):
		result = result.replace("  ", " ")
	if result == "":
		result = fallback
	if result.length() > 64:
		result = "%s…" % result.left(63)
	return result


func _collect_visible_text(node: Node, texts: Array[String]) -> void:
	if node is Control and not (node as Control).visible:
		return
	if node is Label:
		var label_text := (node as Label).text.strip_edges()
		if label_text != "":
			texts.append(label_text)
	elif node is Button:
		var button_text := (node as Button).text.strip_edges()
		if button_text != "":
			texts.append(button_text)
	elif node is LineEdit:
		var line_edit := node as LineEdit
		var edit_text := line_edit.text.strip_edges()
		if edit_text != "":
			texts.append(edit_text)
		elif line_edit.placeholder_text.strip_edges() != "":
			texts.append(line_edit.placeholder_text.strip_edges())
	for child in node.get_children():
		_collect_visible_text(child, texts)


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
	control.position = rect.position
	control.size = rect.size
