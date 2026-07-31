extends Button
class_name CharacterSlotCard

const CharacterEntryVisualSkin := preload(
	"res://scripts/ui/character_entry_visual_skin.gd"
)

signal slot_activated(
	slot_index: int,
	player_id: String,
	occupied: bool
)

var _view: Dictionary = {}
var _selected := false
var _slot_index := 0
var _portrait_frame: PanelContainer
var _portrait: TextureRect
var _portrait_fallback: Label
var _slot_label: Label
var _name_label: Label
var _detail_label: Label
var _selection_label: Label


func _init() -> void:
	custom_minimum_size = CharacterEntryVisualSkin.CARD_SIZE
	size = CharacterEntryVisualSkin.CARD_SIZE
	clip_contents = true
	mouse_filter = Control.MOUSE_FILTER_STOP
	_build_content()
	pressed.connect(_on_pressed)


func configure(
	value: Dictionary,
	selected: bool = false,
	interaction_disabled: bool = false
) -> void:
	_view = value.duplicate(true)
	_selected = selected
	_slot_index = clampi(int(_view.get("slotIndex", 0)), 0, 3)
	disabled = interaction_disabled
	_refresh()


func player_id() -> String:
	return str(
		_view.get(
			"playerId",
			_view.get("characterId", "")
		)
	).strip_edges()


func is_occupied() -> bool:
	return bool(_view.get("occupied", false)) and player_id() != ""


func slot_index() -> int:
	return _slot_index


func snapshot() -> Dictionary:
	return {
		"slotIndex": _slot_index,
		"occupied": is_occupied(),
		"playerId": player_id(),
		"selected": _selected,
		"disabled": disabled,
		"nameText": _name_label.text if _name_label != null else "",
		"detailText": _detail_label.text if _detail_label != null else "",
		"selectionText": "",
		"portraitVisible": (
			_portrait.visible
			if _portrait != null
			else false
		),
		"emptyPromptVisible": not is_occupied(),
	}


func _build_content() -> void:
	_slot_label = Label.new()
	_slot_label.name = "SlotLabel"
	_slot_label.visible = false
	add_child(_slot_label)

	_selection_label = Label.new()
	_selection_label.name = "SelectionLabel"
	_selection_label.visible = false
	add_child(_selection_label)

	_portrait_frame = PanelContainer.new()
	_portrait_frame.name = "PortraitFrame"
	_portrait_frame.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_portrait_frame)
	_place(_portrait_frame, Rect2(26.0, 17.0, 124.0, 101.0))

	var portrait_canvas := Control.new()
	portrait_canvas.name = "PortraitCanvas"
	portrait_canvas.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_portrait_frame.add_child(portrait_canvas)

	_portrait = TextureRect.new()
	_portrait.name = "Portrait"
	_portrait.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_portrait.offset_left = 7.0
	_portrait.offset_top = 5.0
	_portrait.offset_right = -7.0
	_portrait.offset_bottom = -5.0
	_portrait.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_portrait.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	_portrait.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	_portrait.mouse_filter = Control.MOUSE_FILTER_IGNORE
	portrait_canvas.add_child(_portrait)

	_portrait_fallback = Label.new()
	_portrait_fallback.name = "PortraitFallback"
	_portrait_fallback.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_portrait_fallback.text = "角色"
	_portrait_fallback.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_portrait_fallback.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_portrait_fallback.mouse_filter = Control.MOUSE_FILTER_IGNORE
	CharacterEntryVisualSkin.apply_body(
		_portrait_fallback,
		15,
		CharacterEntryVisualSkin.MUTED_TEXT
	)
	portrait_canvas.add_child(_portrait_fallback)

	_name_label = Label.new()
	_name_label.name = "CharacterName"
	_name_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	_name_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_name_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	CharacterEntryVisualSkin.apply_title(_name_label, 24)
	add_child(_name_label)
	_place(_name_label, Rect2(166.0, 22.0, 224.0, 44.0))

	_detail_label = Label.new()
	_detail_label.name = "CharacterDetail"
	_detail_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	_detail_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_detail_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	CharacterEntryVisualSkin.apply_body(
		_detail_label,
		18,
		CharacterEntryVisualSkin.MUTED_TEXT
	)
	add_child(_detail_label)
	_place(_detail_label, Rect2(166.0, 68.0, 224.0, 38.0))


func _refresh() -> void:
	var occupied := is_occupied()
	CharacterEntryVisualSkin.apply_slot_button(self, _selected, occupied)
	_portrait_frame.add_theme_stylebox_override(
		"panel",
		CharacterEntryVisualSkin.portrait_frame_style(_selected)
	)
	_slot_label.text = "角色 %d" % (_slot_index + 1)
	_selection_label.visible = false
	_portrait_frame.visible = occupied
	if not occupied:
		_name_label.text = "创建角色"
		_name_label.add_theme_color_override(
			"font_color",
			CharacterEntryVisualSkin.CREAM_TEXT
		)
		_name_label.add_theme_constant_override("outline_size", 3)
		_name_label.position = Vector2(166.0, 39.0)
		_detail_label.text = ""
		_detail_label.visible = false
		_portrait.texture = null
		_portrait.visible = false
		_portrait_fallback.visible = false
		tooltip_text = "在角色位%d创建角色" % (_slot_index + 1)
		return

	_name_label.position = Vector2(166.0, 22.0)
	_name_label.text = str(_view.get("name", "未命名角色"))
	_detail_label.visible = true
	var progress_text := "Lv.%d" % maxi(1, int(_view.get("level", 1)))
	var rebirth_count := maxi(0, int(_view.get("rebirthCount", 0)))
	if rebirth_count > 0:
		progress_text = "%s  ·  %d转" % [progress_text, rebirth_count]
	var map_name := str(_view.get("mapName", "")).strip_edges()
	_detail_label.text = (
		"%s  ·  %s" % [progress_text, map_name]
		if map_name != ""
		else progress_text
	)
	var label_color := (
		CharacterEntryVisualSkin.INK_TEXT
		if _selected
		else CharacterEntryVisualSkin.CREAM_TEXT
	)
	var detail_color := (
		Color(0.34, 0.22, 0.13, 1.0)
		if _selected
		else CharacterEntryVisualSkin.MUTED_TEXT
	)
	_name_label.add_theme_color_override("font_color", label_color)
	_detail_label.add_theme_color_override("font_color", detail_color)
	_name_label.add_theme_constant_override("outline_size", 1 if _selected else 3)
	_detail_label.add_theme_constant_override("outline_size", 0 if _selected else 2)

	var texture = CharacterEntryVisualSkin.texture_from(
		_view.get("portraitTexture", null),
		str(_view.get("portraitTexturePath", ""))
	)
	if texture == null:
		texture = CharacterEntryVisualSkin.DEFAULT_PORTRAIT_TEXTURE
	_portrait.texture = texture
	_portrait.visible = texture != null
	_portrait_fallback.visible = texture == null
	tooltip_text = "选择%s" % _name_label.text


func _on_pressed() -> void:
	if disabled:
		return
	slot_activated.emit(_slot_index, player_id(), is_occupied())


func _place(control: Control, rect: Rect2) -> void:
	control.position = rect.position
	control.size = rect.size
