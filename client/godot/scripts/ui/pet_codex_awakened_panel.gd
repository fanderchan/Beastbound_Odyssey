extends PanelContainer
class_name PetCodexAwakenedPanel

const PetCodexVisualSkin := preload(
	"res://scripts/ui/pet_codex_visual_skin.gd"
)
const PetPortraitArtCatalog := preload(
	"res://scripts/ui/pet_portrait_art_catalog.gd"
)
const BackpackItemIconCatalog := preload(
	"res://scripts/ui/backpack_item_icon_catalog.gd"
)
const CODEX_BACKDROP_TEXTURE := preload(
	"res://assets/ui/pet_codex_awakened_v1/runtime/pet_codex_backdrop_1280x720.png"
)

signal close_requested
signal form_selected(form_id: String)
signal family_selected(line_id: String)
signal detail_tab_selected(tab_id: String)

const TAB_GROWTH := "growth"
const TAB_ATTRIBUTES := "attributes"
const VALID_DETAIL_TABS := [TAB_GROWTH, TAB_ATTRIBUTES]
const CANVAS_SIZE := Vector2(1280.0, 720.0)

const COLOR_CREAM := Color(0.96, 0.91, 0.78, 1.0)
const COLOR_MUTED := Color(0.73, 0.69, 0.59, 1.0)
const COLOR_GOLD := Color(1.0, 0.70, 0.20, 1.0)
const COLOR_DARK_TEXT := Color(0.24, 0.15, 0.08, 1.0)
const COLOR_PANEL := Color(0.085, 0.068, 0.050, 0.96)
const COLOR_PANEL_LIGHT := Color(0.14, 0.11, 0.075, 0.96)
const COLOR_BORDER := Color(0.55, 0.36, 0.18, 0.92)

# These controls stay public because the host coordinator and focused QA checks
# need stable, semantic access without traversing presentation-only descendants.
var close_button: Button
var family_list_container: VBoxContainer
var form_strip_container: HBoxContainer
var growth_tab_button: Button
var attribute_tab_button: Button
var acquisition_button: Button
var acquisition_overlay: PanelContainer
var acquisition_route_container: VBoxContainer
var legacy_detail_label: Label

var _built := false
var _canvas: Control
var _view_state: Dictionary = {}
var _selected_form_id := ""
var _selected_seen := false
var _active_detail_tab := TAB_GROWTH
var _selected_pet: Dictionary = {}
var _family_buttons: Dictionary = {}
var _form_buttons: Dictionary = {}
var _route_card_count := 0

var _collection_label: Label
var _pet_name_label: Label
var _pet_line_label: Label
var _pet_showcase: TextureRect
var _locked_stage_label: Label
var _form_scroll: ScrollContainer
var _growth_page: Control
var _attribute_page: Control
var _growth_content: VBoxContainer
var _attribute_content: VBoxContainer
var _acquisition_title_label: Label
var _acquisition_empty_label: Label
var _growth_render_signature := -1
var _attribute_render_signature := -1
var _detail_tab_refresh_max_usec := 0
var _growth_content_cache: Dictionary = {}
var _attribute_content_cache: Dictionary = {}
var _route_render_signature := -1


func _ready() -> void:
	_ensure_built()


func apply_view_state(state: Dictionary) -> void:
	_ensure_built()
	# Presenter states are immutable snapshots for this view. A shallow copy is
	# sufficient and avoids recursively duplicating the complete family/form
	# projection on every selection click.
	_view_state = state.duplicate(false)
	var selected_value = state.get("selectedPet", state.get("selected", {}))
	_selected_pet = (
		(selected_value as Dictionary).duplicate(false)
		if selected_value is Dictionary
		else {}
	)
	_selected_form_id = str(
		_selected_pet.get(
			"formId",
			state.get("selectedFormId", state.get("selected_form_id", ""))
		)
	).strip_edges()
	_selected_seen = bool(
		_selected_pet.get("seen", state.get("selectedSeen", false))
	)
	var requested_tab := str(
		state.get("detailTab", state.get("activeDetailTab", _active_detail_tab))
	).strip_edges().to_lower()
	if requested_tab in VALID_DETAIL_TABS:
		_active_detail_tab = requested_tab

	_refresh_collection_label()
	_refresh_families(_dictionary_array(state.get("families", [])))
	_refresh_forms(_dictionary_array(state.get("forms", state.get("formEntries", []))))
	_refresh_selected_pet()
	_refresh_detail_pages()
	_apply_detail_tab_visibility()
	_refresh_acquisition_button()
	_update_legacy_detail_label()
	if bool(state.get("showAcquisition", false)):
		show_acquisition_routes()
	else:
		hide_acquisition_routes()


func selected_form_id() -> String:
	return _selected_form_id


func set_detail_tab(tab_id: String) -> void:
	_ensure_built()
	var normalized := tab_id.strip_edges().to_lower()
	if not normalized in VALID_DETAIL_TABS:
		return
	var started_usec := Time.get_ticks_usec()
	_active_detail_tab = normalized
	_refresh_detail_pages()
	_apply_detail_tab_visibility()
	_detail_tab_refresh_max_usec = maxi(
		_detail_tab_refresh_max_usec,
		Time.get_ticks_usec() - started_usec
	)


func detail_tab_performance_for_qa() -> Dictionary:
	return {"maxRefreshUsec": _detail_tab_refresh_max_usec}


func show_acquisition_routes(routes: Array = []) -> void:
	_ensure_built()
	# The selected identity is a hard privacy boundary. A caller cannot reveal
	# routes for an unseen form by passing a forged route array.
	if not _selected_seen or _selected_form_id == "":
		hide_acquisition_routes()
		return
	var route_entries: Array[Dictionary] = []
	if not routes.is_empty():
		route_entries = _dictionary_array(routes)
	else:
		route_entries = _dictionary_array(
			_view_state.get(
				"acquisitionRoutes",
				_selected_pet.get("acquisitionRoutes", [])
			)
		)
	_refresh_acquisition_routes(route_entries)
	acquisition_overlay.visible = true
	acquisition_overlay.move_to_front()
	# Keep the page-level close affordance above the modal blocker. Its first
	# click collapses the embedded page; a second click closes the codex.
	close_button.move_to_front()


func hide_acquisition_routes() -> void:
	_ensure_built()
	acquisition_overlay.visible = false


func is_within_viewport() -> bool:
	_ensure_built()
	var viewport_size := CANVAS_SIZE
	if is_inside_tree() and get_viewport() != null:
		viewport_size = get_viewport_rect().size
	var canvas_rect := Rect2(_canvas.position, _canvas.size)
	var viewport_rect := Rect2(Vector2.ZERO, viewport_size)
	return (
		canvas_rect.position.x >= -0.5
		and canvas_rect.position.y >= -0.5
		and canvas_rect.end.x <= viewport_rect.end.x + 0.5
		and canvas_rect.end.y <= viewport_rect.end.y + 0.5
	)


func title_font_has_jian_glyph() -> bool:
	var font := PetCodexVisualSkin.display_font()
	return font != null and font.has_char("鉴".unicode_at(0))


func route_card_count() -> int:
	return _route_card_count


func visible_form_buttons() -> Dictionary:
	return _form_buttons.duplicate()


func visible_family_buttons() -> Dictionary:
	return _family_buttons.duplicate()


func active_detail_tab() -> String:
	return _active_detail_tab


func acquisition_is_visible() -> bool:
	return acquisition_overlay != null and acquisition_overlay.visible


func _ensure_built() -> void:
	if _built:
		return
	_built = true
	name = "PetCodexAwakenedPanel"
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	custom_minimum_size = CANVAS_SIZE
	mouse_filter = Control.MOUSE_FILTER_STOP
	focus_mode = Control.FOCUS_ALL
	add_theme_stylebox_override("panel", PetCodexVisualSkin.transparent_panel_style())

	_canvas = Control.new()
	_canvas.name = "CodexCanvas"
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
	_add_codex_backdrop()
	_build_header()
	_build_family_column()
	_build_main_frame()
	_build_acquisition_overlay()
	_build_legacy_compatibility_label()


func _build_header() -> void:
	var codex_icon := TextureRect.new()
	codex_icon.name = "HeaderCodexIcon"
	codex_icon.position = Vector2(26.0, 6.0)
	codex_icon.size = Vector2(46.0, 46.0)
	codex_icon.texture = PetCodexVisualSkin.HEADER_CODEX_TEXTURE
	codex_icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	codex_icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	codex_icon.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	codex_icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_canvas.add_child(codex_icon)

	var title := Label.new()
	title.name = "PanelTitle"
	title.text = "图鉴"
	title.position = Vector2(70.0, 4.0)
	title.size = Vector2(138.0, 54.0)
	title.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	PetCodexVisualSkin.apply_title(title, 30)
	_canvas.add_child(title)

	# Reference uses a small question-mark medallion in the title strip. It is
	# decorative here: there is no dead focusable button or click with no result.
	var help := Label.new()
	help.name = "HelpDecoration"
	help.position = Vector2(172.0, 15.0)
	help.size = Vector2(28.0, 28.0)
	help.tooltip_text = "查看宠物图鉴、成长范围与获取途径"
	PetCodexVisualSkin.apply_help_decoration(help)
	_canvas.add_child(help)

	close_button = Button.new()
	close_button.name = "CloseButton"
	close_button.position = Vector2(1202.0, 4.0)
	close_button.size = Vector2(58.0, 50.0)
	close_button.focus_mode = Control.FOCUS_ALL
	PetCodexVisualSkin.apply_close_button(close_button)
	close_button.pressed.connect(_on_close_pressed)
	_canvas.add_child(close_button)


func _add_codex_backdrop() -> void:
	var backdrop := TextureRect.new()
	backdrop.name = "PetCodexBackdrop"
	backdrop.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	backdrop.texture = CODEX_BACKDROP_TEXTURE
	backdrop.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	backdrop.stretch_mode = TextureRect.STRETCH_SCALE
	backdrop.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	backdrop.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_canvas.add_child(backdrop)


func _build_family_column() -> void:
	var panel := PanelContainer.new()
	panel.name = "FamilyColumn"
	panel.position = Vector2(82.0, 96.0)
	panel.size = Vector2(282.0, 576.0)
	panel.add_theme_stylebox_override(
		"panel",
		PetCodexVisualSkin.transparent_panel_style()
	)
	_canvas.add_child(panel)

	var column := VBoxContainer.new()
	column.name = "FamilyColumnContent"
	column.add_theme_constant_override("separation", 8)
	panel.add_child(_with_margin(column, 9, 8, 9, 8))

	var heading := Label.new()
	heading.text = "种族"
	heading.custom_minimum_size = Vector2(0.0, 49.0)
	heading.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	heading.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_apply_display_label(heading, 22, COLOR_DARK_TEXT)
	heading.add_theme_stylebox_override("normal", _selected_tab_style())
	column.add_child(heading)

	var scroll := ScrollContainer.new()
	scroll.name = "FamilyScroll"
	scroll.custom_minimum_size = Vector2(0.0, 472.0)
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_AUTO
	scroll.mouse_filter = Control.MOUSE_FILTER_STOP
	column.add_child(scroll)

	family_list_container = VBoxContainer.new()
	family_list_container.name = "FamilyList"
	family_list_container.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	family_list_container.add_theme_constant_override("separation", 5)
	scroll.add_child(family_list_container)

	_collection_label = Label.new()
	_collection_label.name = "CollectionLabel"
	_collection_label.text = "图鉴收集 0/0"
	_collection_label.custom_minimum_size = Vector2(0.0, 47.0)
	_collection_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_collection_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_apply_body_label(_collection_label, 16, COLOR_CREAM)
	_collection_label.add_theme_stylebox_override("normal", _footer_style())
	column.add_child(_collection_label)


func _build_main_frame() -> void:
	var frame := PanelContainer.new()
	frame.name = "CodexMainFrame"
	frame.position = Vector2(382.0, 96.0)
	frame.size = Vector2(806.0, 576.0)
	frame.add_theme_stylebox_override(
		"panel",
		PetCodexVisualSkin.transparent_panel_style()
	)
	_canvas.add_child(frame)

	var content := Control.new()
	content.name = "CodexMainContent"
	content.mouse_filter = Control.MOUSE_FILTER_PASS
	frame.add_child(content)
	_build_pet_stage(content)
	_build_detail_panel(content)


func _build_pet_stage(parent: Control) -> void:
	_pet_name_label = Label.new()
	_pet_name_label.name = "SelectedPetName"
	_pet_name_label.text = "尚未遇见"
	_pet_name_label.position = Vector2(14.0, 12.0)
	_pet_name_label.size = Vector2(392.0, 37.0)
	_pet_name_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_pet_name_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_apply_display_label(_pet_name_label, 22, COLOR_CREAM)
	parent.add_child(_pet_name_label)

	_pet_line_label = Label.new()
	_pet_line_label.name = "SelectedPetLine"
	_pet_line_label.text = ""
	_pet_line_label.position = Vector2(24.0, 48.0)
	_pet_line_label.size = Vector2(372.0, 25.0)
	_pet_line_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_pet_line_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_apply_body_label(_pet_line_label, 13, COLOR_MUTED)
	parent.add_child(_pet_line_label)

	var stage_back := PanelContainer.new()
	stage_back.name = "PetStage"
	stage_back.position = Vector2(19.0, 77.0)
	stage_back.size = Vector2(382.0, 365.0)
	stage_back.add_theme_stylebox_override("panel", _stage_style())
	stage_back.mouse_filter = Control.MOUSE_FILTER_IGNORE
	parent.add_child(stage_back)

	_pet_showcase = TextureRect.new()
	_pet_showcase.name = "SelectedPetShowcase"
	_pet_showcase.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_pet_showcase.offset_left = 20.0
	_pet_showcase.offset_top = 12.0
	_pet_showcase.offset_right = -20.0
	_pet_showcase.offset_bottom = -12.0
	_pet_showcase.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_pet_showcase.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	_pet_showcase.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	_pet_showcase.mouse_filter = Control.MOUSE_FILTER_IGNORE
	stage_back.add_child(_pet_showcase)

	_locked_stage_label = Label.new()
	_locked_stage_label.name = "LockedStageLabel"
	_locked_stage_label.text = "尚未遇见\n继续冒险后解锁图鉴资料"
	_locked_stage_label.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_locked_stage_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_locked_stage_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_apply_display_label(_locked_stage_label, 18, COLOR_MUTED)
	stage_back.add_child(_locked_stage_label)

	var strip_back := PanelContainer.new()
	strip_back.name = "FormStrip"
	strip_back.position = Vector2(14.0, 456.0)
	strip_back.size = Vector2(392.0, 120.0)
	strip_back.add_theme_stylebox_override("panel", _strip_style())
	parent.add_child(strip_back)

	_form_scroll = ScrollContainer.new()
	_form_scroll.name = "FormScroll"
	_form_scroll.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_form_scroll.offset_left = 8.0
	_form_scroll.offset_top = 9.0
	_form_scroll.offset_right = -8.0
	_form_scroll.offset_bottom = -9.0
	_form_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_AUTO
	_form_scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_form_scroll.mouse_filter = Control.MOUSE_FILTER_STOP
	strip_back.add_child(_form_scroll)

	form_strip_container = HBoxContainer.new()
	form_strip_container.name = "FormStripEntries"
	form_strip_container.add_theme_constant_override("separation", 6)
	_form_scroll.add_child(form_strip_container)


func _build_detail_panel(parent: Control) -> void:
	var detail := PanelContainer.new()
	detail.name = "DetailPanel"
	detail.position = Vector2(420.0, 10.0)
	detail.size = Vector2(306.0, 566.0)
	detail.add_theme_stylebox_override("panel", _detail_style())
	parent.add_child(detail)

	var detail_control := Control.new()
	detail_control.name = "DetailContent"
	detail.add_child(detail_control)

	growth_tab_button = Button.new()
	growth_tab_button.name = "GrowthTab"
	growth_tab_button.text = "成长"
	growth_tab_button.position = Vector2(0.0, 0.0)
	growth_tab_button.size = Vector2(153.0, 52.0)
	growth_tab_button.focus_mode = Control.FOCUS_ALL
	PetCodexVisualSkin.apply_tab_button(growth_tab_button)
	growth_tab_button.pressed.connect(_on_detail_tab_pressed.bind(TAB_GROWTH))
	detail_control.add_child(growth_tab_button)

	attribute_tab_button = Button.new()
	attribute_tab_button.name = "AttributeTab"
	attribute_tab_button.text = "属性"
	attribute_tab_button.position = Vector2(153.0, 0.0)
	attribute_tab_button.size = Vector2(153.0, 52.0)
	attribute_tab_button.focus_mode = Control.FOCUS_ALL
	PetCodexVisualSkin.apply_tab_button(attribute_tab_button)
	attribute_tab_button.pressed.connect(_on_detail_tab_pressed.bind(TAB_ATTRIBUTES))
	detail_control.add_child(attribute_tab_button)

	_growth_page = Control.new()
	_growth_page.name = "GrowthPage"
	_growth_page.position = Vector2(12.0, 62.0)
	_growth_page.size = Vector2(282.0, 429.0)
	detail_control.add_child(_growth_page)
	var growth_scroll := ScrollContainer.new()
	growth_scroll.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	growth_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	growth_scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_AUTO
	_growth_page.add_child(growth_scroll)
	_growth_content = VBoxContainer.new()
	_growth_content.name = "GrowthContent"
	_growth_content.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_growth_content.add_theme_constant_override("separation", 8)
	growth_scroll.add_child(_growth_content)

	_attribute_page = Control.new()
	_attribute_page.name = "AttributePage"
	_attribute_page.position = Vector2(12.0, 62.0)
	_attribute_page.size = Vector2(282.0, 429.0)
	detail_control.add_child(_attribute_page)
	var attribute_scroll := ScrollContainer.new()
	attribute_scroll.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	attribute_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	attribute_scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_AUTO
	_attribute_page.add_child(attribute_scroll)
	_attribute_content = VBoxContainer.new()
	_attribute_content.name = "AttributeContent"
	_attribute_content.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_attribute_content.add_theme_constant_override("separation", 8)
	attribute_scroll.add_child(_attribute_content)

	acquisition_button = Button.new()
	acquisition_button.name = "AcquisitionButton"
	acquisition_button.text = "获取途径"
	acquisition_button.position = Vector2(72.0, 507.0)
	acquisition_button.size = Vector2(162.0, 46.0)
	acquisition_button.focus_mode = Control.FOCUS_ALL
	PetCodexVisualSkin.apply_action_button(acquisition_button)
	acquisition_button.pressed.connect(_on_acquisition_pressed)
	detail_control.add_child(acquisition_button)


func _build_acquisition_overlay() -> void:
	acquisition_overlay = PanelContainer.new()
	acquisition_overlay.name = "AcquisitionOverlay"
	acquisition_overlay.position = Vector2.ZERO
	acquisition_overlay.size = CANVAS_SIZE
	acquisition_overlay.add_theme_stylebox_override(
		"panel",
		PetCodexVisualSkin.transparent_panel_style()
	)
	acquisition_overlay.mouse_filter = Control.MOUSE_FILTER_STOP
	acquisition_overlay.visible = false
	_canvas.add_child(acquisition_overlay)

	var modal_root := Control.new()
	modal_root.name = "AcquisitionModalRoot"
	modal_root.mouse_filter = Control.MOUSE_FILTER_STOP
	acquisition_overlay.add_child(modal_root)

	var dimmer := ColorRect.new()
	dimmer.name = "AcquisitionModalDimmer"
	dimmer.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	dimmer.color = Color(0.025, 0.018, 0.012, 0.52)
	dimmer.mouse_filter = Control.MOUSE_FILTER_STOP
	modal_root.add_child(dimmer)

	var sheet := PanelContainer.new()
	sheet.name = "AcquisitionSheet"
	sheet.position = Vector2(418.0, 148.0)
	sheet.size = Vector2(365.0, 402.0)
	sheet.add_theme_stylebox_override("panel", _parchment_style())
	sheet.mouse_filter = Control.MOUSE_FILTER_STOP
	modal_root.add_child(sheet)

	var overlay_content := Control.new()
	overlay_content.name = "AcquisitionContent"
	sheet.add_child(overlay_content)

	_acquisition_title_label = Label.new()
	_acquisition_title_label.name = "AcquisitionTitle"
	_acquisition_title_label.text = "获取途径"
	_acquisition_title_label.position = Vector2(25.0, 17.0)
	_acquisition_title_label.size = Vector2(315.0, 37.0)
	_acquisition_title_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_acquisition_title_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_apply_display_label(_acquisition_title_label, 24, COLOR_DARK_TEXT)
	overlay_content.add_child(_acquisition_title_label)

	var dismiss := Button.new()
	dismiss.name = "DismissAcquisitionButton"
	dismiss.text = "关闭"
	dismiss.position = Vector2(277.0, 17.0)
	dismiss.size = Vector2(66.0, 34.0)
	dismiss.focus_mode = Control.FOCUS_ALL
	_apply_text_button(dismiss, false)
	dismiss.pressed.connect(hide_acquisition_routes)
	overlay_content.add_child(dismiss)

	var route_scroll := ScrollContainer.new()
	route_scroll.name = "AcquisitionRouteScroll"
	route_scroll.position = Vector2(24.0, 68.0)
	route_scroll.size = Vector2(317.0, 307.0)
	route_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	route_scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_AUTO
	route_scroll.mouse_filter = Control.MOUSE_FILTER_STOP
	overlay_content.add_child(route_scroll)

	acquisition_route_container = VBoxContainer.new()
	acquisition_route_container.name = "AcquisitionRoutes"
	acquisition_route_container.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	acquisition_route_container.add_theme_constant_override("separation", 8)
	route_scroll.add_child(acquisition_route_container)

	_acquisition_empty_label = Label.new()
	_acquisition_empty_label.name = "NoAcquisitionRouteLabel"
	_acquisition_empty_label.text = "暂未开放获取途径"
	_acquisition_empty_label.custom_minimum_size = Vector2(300.0, 90.0)
	_acquisition_empty_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_acquisition_empty_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_apply_body_label(_acquisition_empty_label, 16, Color(0.38, 0.30, 0.22, 1.0))
	acquisition_route_container.add_child(_acquisition_empty_label)


func _build_legacy_compatibility_label() -> void:
	legacy_detail_label = Label.new()
	legacy_detail_label.name = "LegacyCodexDetailLabel"
	legacy_detail_label.visible = false
	legacy_detail_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	legacy_detail_label.add_theme_font_override(
		"font",
		PetCodexVisualSkin.body_font()
	)
	_canvas.add_child(legacy_detail_label)


func _refresh_collection_label() -> void:
	var label := str(
		_view_state.get(
			"collectionLabel",
			_view_state.get("collection_label", "")
		)
	).strip_edges()
	if label == "":
		var seen_count := int(_view_state.get("seenCount", 0))
		var total_count := int(_view_state.get("totalCount", 0))
		label = "图鉴收集 %d/%d" % [seen_count, total_count]
	_collection_label.text = label


func _refresh_families(families: Array[Dictionary]) -> void:
	if families.is_empty():
		_clear_children(family_list_container)
		_family_buttons.clear()
		var empty := Label.new()
		empty.text = "尚未发现可查阅的种族"
		empty.custom_minimum_size = Vector2(210.0, 84.0)
		empty.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		empty.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		empty.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		_apply_body_label(empty, 14, COLOR_MUTED)
		family_list_container.add_child(empty)
		return

	var selected_line_id := str(
		_view_state.get(
			"selectedLineId",
			_selected_pet.get("lineId", _selected_pet.get("line_id", ""))
		)
	).strip_edges()
	var can_reuse := _buttons_match_entries(
		_family_buttons,
		families,
		"lineId"
	)
	if not can_reuse:
		_clear_children(family_list_container)
		_family_buttons.clear()
	for family in families:
		var line_id := str(family.get("lineId", family.get("id", ""))).strip_edges()
		if line_id == "":
			continue
		var seen := bool(family.get("seen", false))
		var selected := bool(family.get("selected", line_id == selected_line_id))
		var button := _family_buttons.get(line_id, null) as Button
		if button == null:
			button = Button.new()
			button.name = "Family_%s" % _node_safe_id(line_id)
			button.custom_minimum_size = Vector2(210.0, 91.0)
			button.alignment = HORIZONTAL_ALIGNMENT_LEFT
			button.focus_mode = Control.FOCUS_ALL
			button.add_theme_font_override("font", PetCodexVisualSkin.display_font())
			button.add_theme_font_size_override("font_size", 17)
			button.add_theme_color_override("font_color", COLOR_CREAM)
			button.add_theme_color_override("font_hover_color", COLOR_CREAM)
			button.add_theme_color_override("font_pressed_color", COLOR_CREAM)
			button.add_theme_color_override("font_focus_color", COLOR_CREAM)
			button.add_theme_constant_override("icon_max_width", 67)
			button.expand_icon = true
			button.pressed.connect(_on_family_pressed.bind(line_id))
			family_list_container.add_child(button)
			_family_buttons[line_id] = button
		button.text = (
			str(family.get("label", family.get("name", "种族"))).strip_edges()
			if seen
			else "未知种族"
		)
		button.add_theme_stylebox_override("normal", _family_style(selected, false))
		button.add_theme_stylebox_override("hover", _family_style(selected, true))
		button.add_theme_stylebox_override("pressed", _family_style(true, false))
		button.add_theme_stylebox_override("focus", _family_style(true, false))
		button.icon = null
		if seen:
			# Formal codex never trusts caller-supplied textures. The formId is
			# resolved through the owner-approved portrait gate at render time.
			var portrait := PetPortraitArtCatalog.approved_texture_for_form(
				str(family.get("portraitFormId", ""))
			)
			button.icon = portrait
		button.tooltip_text = button.text


func _refresh_forms(forms: Array[Dictionary]) -> void:
	if forms.is_empty():
		_clear_children(form_strip_container)
		_form_buttons.clear()
		var empty := Label.new()
		empty.text = "该种族暂无可展示形态"
		empty.custom_minimum_size = Vector2(365.0, 92.0)
		empty.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		empty.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		_apply_body_label(empty, 14, COLOR_MUTED)
		form_strip_container.add_child(empty)
		return
	var can_reuse := _buttons_match_entries(_form_buttons, forms, "formId")
	if not can_reuse:
		_clear_children(form_strip_container)
		_form_buttons.clear()
	for form in forms:
		var form_id := str(form.get("formId", "")).strip_edges()
		if form_id == "":
			continue
		var seen := bool(form.get("seen", false))
		var selected := bool(form.get("selected", form_id == _selected_form_id))
		var button := _form_buttons.get(form_id, null) as Button
		if button == null:
			button = Button.new()
			button.name = "Form_%s" % _node_safe_id(form_id)
			button.custom_minimum_size = Vector2(92.0, 94.0)
			button.focus_mode = Control.FOCUS_ALL
			button.expand_icon = true
			button.add_theme_constant_override("icon_max_width", 78)
			button.add_theme_font_override("font", PetCodexVisualSkin.body_font())
			button.add_theme_font_size_override("font_size", 12)
			button.add_theme_color_override("font_color", COLOR_MUTED)
			button.add_theme_color_override(
				"font_outline_color",
				Color(0.04, 0.03, 0.02, 0.9)
			)
			button.add_theme_constant_override("outline_size", 2)
			button.pressed.connect(_on_form_pressed.bind(form_id))
			form_strip_container.add_child(button)
			_form_buttons[form_id] = button
		button.text = "" if seen else "未遇见"
		button.add_theme_stylebox_override("normal", _portrait_slot_style(selected, false))
		button.add_theme_stylebox_override("hover", _portrait_slot_style(selected, true))
		button.add_theme_stylebox_override("pressed", _portrait_slot_style(true, false))
		button.add_theme_stylebox_override("focus", _portrait_slot_style(true, false))
		button.icon = null
		if seen:
			var portrait := PetPortraitArtCatalog.approved_texture_for_form(form_id)
			button.icon = portrait
			# 已遇见但正式画像尚未获准发布时仍要显示形态名，不能留下
			# 一个看似损坏的空按钮；已有正式画像时则让画像占满卡槽。
			button.text = (
				""
				if portrait != null
				else str(form.get("name", form.get("formName", "宠物")))
			)
			button.tooltip_text = str(form.get("name", form.get("formName", "宠物")))
		else:
			button.tooltip_text = "尚未遇见"


func _refresh_selected_pet() -> void:
	if not _selected_seen or _selected_form_id == "":
		_pet_name_label.text = "尚未遇见"
		_pet_line_label.text = "继续冒险后解锁形态资料"
		_pet_showcase.texture = null
		_pet_showcase.visible = false
		_locked_stage_label.visible = true
		return
	var pet_name := str(
		_selected_pet.get("name", _selected_pet.get("formName", "宠物"))
	).strip_edges()
	_pet_name_label.text = pet_name if pet_name != "" else "宠物"
	_pet_line_label.text = str(
		_selected_pet.get("lineName", _selected_pet.get("subtitle", ""))
	).strip_edges()
	# View-state textures are untrusted input. Only the selected formId may
	# resolve an owner-approved portrait for this formal player surface.
	var texture := PetPortraitArtCatalog.approved_texture_for_form(
		_selected_form_id
	)
	_pet_showcase.texture = texture
	_pet_showcase.visible = texture != null
	_locked_stage_label.visible = texture == null
	_locked_stage_label.text = "形象尚未收录" if texture == null else ""


func _refresh_detail_pages() -> void:
	# Only materialize the visible tab. The hidden page is refreshed on its
	# first explicit tab click, avoiding a hidden control-tree rebuild on every
	# family/form selection.
	if _active_detail_tab == TAB_ATTRIBUTES:
		_refresh_attribute_page_if_needed()
	else:
		_refresh_growth_page_if_needed()


func _refresh_growth_page_if_needed() -> void:
	var growth_value = _view_state.get("growth", _selected_pet.get("growth", {}))
	var signature := hash([_selected_form_id, _selected_seen, growth_value])
	if signature == _growth_render_signature:
		return
	_growth_render_signature = signature
	_hide_children(_growth_content)
	var cache_key := str(signature)
	var cached := _growth_content_cache.get(cache_key, null) as VBoxContainer
	if cached != null:
		cached.visible = true
		return
	var page := _detail_cache_page("Growth_%s" % cache_key)
	_growth_content.add_child(page)
	_growth_content_cache[cache_key] = page
	if not _selected_seen:
		_add_locked_detail(page, "成长资料尚未解锁")
		return
	var growth := growth_value as Dictionary if growth_value is Dictionary else {}
	_build_growth_content(growth, page)


func _refresh_attribute_page_if_needed() -> void:
	var attribute_value = _view_state.get(
		"attributes",
		_selected_pet.get("attributes", {})
	)
	var signature := hash([_selected_form_id, _selected_seen, attribute_value])
	if signature == _attribute_render_signature:
		return
	_attribute_render_signature = signature
	_hide_children(_attribute_content)
	var cache_key := str(signature)
	var cached := _attribute_content_cache.get(cache_key, null) as VBoxContainer
	if cached != null:
		cached.visible = true
		return
	var page := _detail_cache_page("Attributes_%s" % cache_key)
	_attribute_content.add_child(page)
	_attribute_content_cache[cache_key] = page
	if not _selected_seen:
		_add_locked_detail(page, "属性与技能尚未解锁")
		return
	var attributes := (
		attribute_value as Dictionary
		if attribute_value is Dictionary
		else {}
	)
	_build_attribute_content(attributes, page)


func _detail_cache_page(page_name: String) -> VBoxContainer:
	var page := VBoxContainer.new()
	page.name = page_name
	page.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	page.add_theme_constant_override("separation", 8)
	return page


func _build_growth_content(
	growth: Dictionary,
	target: VBoxContainer
) -> void:
	var heading := Label.new()
	heading.text = str(growth.get("heading", "成长范围"))
	heading.custom_minimum_size = Vector2(0.0, 34.0)
	_apply_display_label(heading, 18, COLOR_CREAM)
	target.add_child(heading)

	var summary := str(
		growth.get("totalLabel", growth.get("totalRange", ""))
	).strip_edges()
	if summary != "":
		target.add_child(_value_card("成长倾向", summary, true))

	var rows := _dictionary_array(growth.get("rows", growth.get("stats", [])))
	if rows.is_empty() and summary == "":
		var empty := Label.new()
		empty.text = "暂无公开成长资料"
		empty.custom_minimum_size = Vector2(0.0, 80.0)
		empty.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		empty.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		_apply_body_label(empty, 14, COLOR_MUTED)
		target.add_child(empty)
		return
	for row in rows:
		var label := str(row.get("label", row.get("name", "成长"))).strip_edges()
		var value := str(
			row.get("range", row.get("value", row.get("display", "")))
		).strip_edges()
		if label == "" or value == "":
			continue
		target.add_child(_value_card(label, value, false))

	var note := str(growth.get("note", "成长与Lv1四维独立计算"))
	if note != "":
		var note_label := Label.new()
		note_label.text = note
		note_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		note_label.custom_minimum_size = Vector2(0.0, 44.0)
		_apply_body_label(note_label, 12, COLOR_MUTED)
		target.add_child(note_label)


func _build_attribute_content(
	attributes: Dictionary,
	target: VBoxContainer
) -> void:
	var heading := Label.new()
	heading.text = str(attributes.get("heading", "属性"))
	heading.custom_minimum_size = Vector2(0.0, 34.0)
	_apply_display_label(heading, 18, COLOR_CREAM)
	target.add_child(heading)

	var elements := _dictionary_array(attributes.get("elements", []))
	if not elements.is_empty():
		var element_title := Label.new()
		element_title.text = "元素"
		_apply_display_label(element_title, 15, COLOR_GOLD)
		target.add_child(element_title)
		for element in elements:
			target.add_child(_element_row(element))

	var rows := _dictionary_array(attributes.get("rows", attributes.get("stats", [])))
	if not rows.is_empty():
		var stat_title := Label.new()
		stat_title.text = "资料"
		_apply_display_label(stat_title, 15, COLOR_GOLD)
		target.add_child(stat_title)
		for row in rows:
			var label := str(row.get("label", row.get("name", ""))).strip_edges()
			var value := str(row.get("value", row.get("display", ""))).strip_edges()
			if label == "" or value == "":
				continue
			target.add_child(_compact_value_row(label, value))

	var skills := _dictionary_array(attributes.get("skills", []))
	if not skills.is_empty():
		var skill_title := Label.new()
		skill_title.text = "技能"
		_apply_display_label(skill_title, 15, COLOR_GOLD)
		target.add_child(skill_title)
		var skill_row := HBoxContainer.new()
		skill_row.name = "SkillIcons"
		skill_row.add_theme_constant_override("separation", 7)
		target.add_child(skill_row)
		for skill in skills:
			var card := _skill_card(skill)
			if card != null:
				skill_row.add_child(card)

	if elements.is_empty() and rows.is_empty() and skills.is_empty():
		var empty := Label.new()
		empty.text = "暂无公开属性资料"
		empty.custom_minimum_size = Vector2(0.0, 80.0)
		empty.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		empty.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		_apply_body_label(empty, 14, COLOR_MUTED)
		target.add_child(empty)


func _refresh_acquisition_button() -> void:
	var routes := _dictionary_array(
		_view_state.get(
			"acquisitionRoutes",
			_selected_pet.get("acquisitionRoutes", [])
		)
	)
	acquisition_button.visible = _selected_seen
	acquisition_button.disabled = not _selected_seen
	acquisition_button.tooltip_text = (
		"查看全部获取途径"
		if not routes.is_empty()
		else "当前没有已开放的获取途径"
	)


func _refresh_acquisition_routes(routes: Array[Dictionary]) -> void:
	var signature := hash([_selected_form_id, routes])
	if signature == _route_render_signature:
		return
	_route_render_signature = signature
	_clear_children(acquisition_route_container)
	_route_card_count = 0
	_acquisition_title_label.text = "获取途径"
	for route in routes:
		var title := str(route.get("title", route.get("label", ""))).strip_edges()
		var detail := str(
			route.get("detail", route.get("description", ""))
		).strip_edges()
		if title == "" or detail == "":
			continue
		acquisition_route_container.add_child(_route_card(route, title, detail))
		_route_card_count += 1
	if _route_card_count == 0:
		_acquisition_empty_label = Label.new()
		_acquisition_empty_label.name = "NoAcquisitionRouteLabel"
		_acquisition_empty_label.text = "暂未开放获取途径"
		_acquisition_empty_label.custom_minimum_size = Vector2(300.0, 90.0)
		_acquisition_empty_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		_acquisition_empty_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		_apply_body_label(_acquisition_empty_label, 16, Color(0.38, 0.30, 0.22, 1.0))
		acquisition_route_container.add_child(_acquisition_empty_label)


func _route_card(route: Dictionary, title: String, detail: String) -> Control:
	var card := PanelContainer.new()
	card.custom_minimum_size = Vector2(300.0, 78.0)
	card.add_theme_stylebox_override("panel", _route_card_style())
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	card.add_child(_with_margin(row, 8, 7, 9, 7))

	# Route payloads cannot inject arbitrary textures into the formal codex.
	# Known item ids resolve through the item catalog; otherwise the currently
	# selected pet can contribute only an owner-approved portrait.
	var texture: Texture2D = null
	var item_id := str(route.get("itemId", "")).strip_edges()
	if item_id != "":
		texture = BackpackItemIconCatalog.texture_for_item(item_id)
	if texture == null and _selected_seen:
		texture = PetPortraitArtCatalog.approved_texture_for_form(_selected_form_id)
	if texture != null:
		var icon := TextureRect.new()
		icon.custom_minimum_size = Vector2(58.0, 58.0)
		icon.texture = texture
		icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		icon.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
		icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
		row.add_child(icon)

	var copy := VBoxContainer.new()
	copy.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	copy.add_theme_constant_override("separation", 2)
	row.add_child(copy)
	var title_label := Label.new()
	title_label.text = title
	title_label.custom_minimum_size = Vector2(0.0, 23.0)
	_apply_display_label(title_label, 15, Color(0.29, 0.19, 0.11, 1.0))
	copy.add_child(title_label)
	var detail_label := Label.new()
	detail_label.text = detail
	detail_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	detail_label.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_apply_body_label(detail_label, 12, Color(0.43, 0.34, 0.24, 1.0))
	copy.add_child(detail_label)
	return card


func _update_legacy_detail_label() -> void:
	var explicit := str(
		_view_state.get("legacyDetailText", _view_state.get("detailText", ""))
	)
	if explicit != "":
		legacy_detail_label.text = explicit
	elif _selected_seen:
		legacy_detail_label.text = "%s\n%s" % [
			str(_selected_pet.get("name", _selected_pet.get("formName", "宠物"))),
			str(_selected_pet.get("lineName", "")),
		]
	else:
		legacy_detail_label.text = "尚未遇见"


func _apply_detail_tab_visibility() -> void:
	_growth_page.visible = _active_detail_tab == TAB_GROWTH
	_attribute_page.visible = _active_detail_tab == TAB_ATTRIBUTES
	_apply_tab_state(growth_tab_button, _active_detail_tab == TAB_GROWTH)
	_apply_tab_state(attribute_tab_button, _active_detail_tab == TAB_ATTRIBUTES)


func _apply_tab_state(button: Button, selected: bool) -> void:
	var texture: Texture2D = (
		PetCodexVisualSkin.TAB_SELECTED_TEXTURE
		if selected
		else PetCodexVisualSkin.TAB_NORMAL_TEXTURE
	)
	button.add_theme_stylebox_override("normal", _texture_style(texture))
	button.add_theme_color_override(
		"font_color",
		COLOR_DARK_TEXT if selected else COLOR_CREAM
	)


func _value_card(label_text: String, value_text: String, highlighted: bool) -> Control:
	var panel := PanelContainer.new()
	panel.custom_minimum_size = Vector2(0.0, 58.0 if highlighted else 52.0)
	panel.add_theme_stylebox_override(
		"panel",
		_value_card_style(highlighted)
	)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	panel.add_child(_with_margin(row, 10, 7, 10, 7))
	var label := Label.new()
	label.text = label_text
	label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_apply_body_label(label, 14, COLOR_CREAM)
	row.add_child(label)
	var value := Label.new()
	value.text = value_text
	value.custom_minimum_size.x = 132.0
	value.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	value.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_apply_display_label(value, 15, COLOR_GOLD)
	row.add_child(value)
	return panel


func _element_row(element: Dictionary) -> Control:
	var row := HBoxContainer.new()
	row.custom_minimum_size = Vector2(0.0, 29.0)
	row.add_theme_constant_override("separation", 8)
	var label := Label.new()
	label.text = str(element.get("label", element.get("name", "元素")))
	label.custom_minimum_size.x = 46.0
	_apply_body_label(label, 13, _color_from_value(element.get("color", COLOR_CREAM)))
	row.add_child(label)
	var bar := ProgressBar.new()
	bar.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	bar.custom_minimum_size.y = 16.0
	bar.min_value = 0.0
	bar.max_value = maxf(1.0, float(element.get("max", 10.0)))
	bar.value = clampf(float(element.get("value", 0.0)), 0.0, bar.max_value)
	bar.show_percentage = false
	bar.add_theme_stylebox_override("background", _element_bar_background())
	bar.add_theme_stylebox_override(
		"fill",
		_element_bar_fill(_color_from_value(element.get("color", COLOR_GOLD)))
	)
	row.add_child(bar)
	var value := Label.new()
	value.text = str(element.get("display", element.get("value", 0)))
	value.custom_minimum_size.x = 30.0
	value.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_apply_body_label(value, 13, COLOR_CREAM)
	row.add_child(value)
	return row


func _compact_value_row(label_text: String, value_text: String) -> Control:
	var row := HBoxContainer.new()
	row.custom_minimum_size = Vector2(0.0, 28.0)
	var label := Label.new()
	label.text = label_text
	label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_apply_body_label(label, 13, COLOR_MUTED)
	row.add_child(label)
	var value := Label.new()
	value.text = value_text
	value.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_apply_body_label(value, 13, COLOR_CREAM)
	row.add_child(value)
	return row


func _skill_card(skill: Dictionary) -> Control:
	var skill_name := str(skill.get("name", skill.get("label", ""))).strip_edges()
	if skill_name == "":
		return null
	var card := VBoxContainer.new()
	card.name = "Skill_%s" % _node_safe_id(
		str(skill.get("abilityId", skill_name))
	)
	card.custom_minimum_size = Vector2(94.0, 56.0)
	card.add_theme_constant_override("separation", 3)
	# Skill view-state is an untrusted presentation payload, just like portrait
	# view-state. Until the skill catalog owns an approved icon registry, the
	# formal codex renders the canonical skill name only and never loads an
	# arbitrary Texture2D or res:// path supplied by a caller.
	var label := Label.new()
	label.text = skill_name
	label.custom_minimum_size = Vector2(76.0, 20.0)
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	_apply_body_label(label, 11, COLOR_CREAM)
	card.add_child(label)
	card.tooltip_text = str(skill.get("description", skill_name))
	return card


func _add_locked_detail(parent: VBoxContainer, text: String) -> void:
	var label := Label.new()
	label.text = text
	label.custom_minimum_size = Vector2(0.0, 140.0)
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_apply_body_label(label, 15, COLOR_MUTED)
	parent.add_child(label)


func _on_close_pressed() -> void:
	if acquisition_is_visible():
		hide_acquisition_routes()
		return
	close_requested.emit()


func _on_family_pressed(line_id: String) -> void:
	hide_acquisition_routes()
	family_selected.emit(line_id)


func _on_form_pressed(form_id: String) -> void:
	hide_acquisition_routes()
	form_selected.emit(form_id)


func _on_detail_tab_pressed(tab_id: String) -> void:
	set_detail_tab(tab_id)
	detail_tab_selected.emit(tab_id)


func _on_acquisition_pressed() -> void:
	show_acquisition_routes()


func _apply_display_label(
	label: Label,
	font_size: int,
	color: Color = COLOR_CREAM
) -> void:
	label.add_theme_font_override("font", PetCodexVisualSkin.display_font())
	label.add_theme_font_size_override("font_size", font_size)
	label.add_theme_color_override("font_color", color)
	label.add_theme_color_override("font_outline_color", Color(0.04, 0.025, 0.015, 0.82))
	label.add_theme_constant_override("outline_size", 2 if color != COLOR_DARK_TEXT else 0)


func _apply_body_label(
	label: Label,
	font_size: int,
	color: Color = COLOR_CREAM
) -> void:
	label.add_theme_font_override("font", PetCodexVisualSkin.body_font())
	label.add_theme_font_size_override("font_size", font_size)
	label.add_theme_color_override("font_color", color)


func _apply_text_button(button: Button, emphasized: bool) -> void:
	button.add_theme_font_override("font", PetCodexVisualSkin.display_font())
	button.add_theme_font_size_override("font_size", 13)
	button.add_theme_color_override(
		"font_color",
		COLOR_DARK_TEXT if emphasized else COLOR_CREAM
	)
	button.add_theme_stylebox_override(
		"normal",
		_selected_tab_style() if emphasized else _dark_button_style(false)
	)
	button.add_theme_stylebox_override("hover", _dark_button_style(true))
	button.add_theme_stylebox_override("pressed", _dark_button_style(true))
	button.add_theme_stylebox_override("focus", _dark_button_style(true))


func _with_margin(
	child: Control,
	left: int,
	top: int,
	right: int,
	bottom: int
) -> MarginContainer:
	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", left)
	margin.add_theme_constant_override("margin_top", top)
	margin.add_theme_constant_override("margin_right", right)
	margin.add_theme_constant_override("margin_bottom", bottom)
	margin.add_child(child)
	return margin


func _buttons_match_entries(
	buttons: Dictionary,
	entries: Array[Dictionary],
	key: String
) -> bool:
	if buttons.size() != entries.size():
		return false
	for entry in entries:
		var entry_id := str(entry.get(key, "")).strip_edges()
		if entry_id == "" or not buttons.has(entry_id):
			return false
	return true


func _hide_children(parent: Node) -> void:
	for child in parent.get_children():
		if child is CanvasItem:
			(child as CanvasItem).visible = false


func _clear_children(parent: Node) -> void:
	for child in parent.get_children():
		parent.remove_child(child)
		child.queue_free()


func _dictionary_array(value) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	if not (value is Array):
		return result
	for entry in value:
		if entry is Dictionary:
			result.append((entry as Dictionary).duplicate(false))
	return result


func _node_safe_id(value: String) -> String:
	var safe := value.strip_edges()
	for token in ["/", "\\", ":", ".", " ", "-", "@", "#"]:
		safe = safe.replace(token, "_")
	return safe


func _color_from_value(value) -> Color:
	if value is Color:
		return value as Color
	if value is String:
		return Color.from_string(str(value), COLOR_GOLD)
	return COLOR_GOLD


func _texture_style(texture: Texture2D) -> StyleBoxTexture:
	var style := StyleBoxTexture.new()
	style.texture = texture
	style.draw_center = true
	return style


func _framed_panel_style(radius: int) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = COLOR_PANEL
	style.border_color = COLOR_BORDER
	style.set_border_width_all(3)
	style.set_corner_radius_all(radius)
	return style


func _detail_style() -> StyleBoxFlat:
	var style := _framed_panel_style(10)
	style.bg_color = Color(0.075, 0.058, 0.039, 0.98)
	style.border_color = Color(0.44, 0.29, 0.14, 0.96)
	style.set_border_width_all(2)
	return style


func _stage_style() -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.055, 0.049, 0.041, 0.46)
	style.border_color = Color(0.31, 0.24, 0.16, 0.45)
	style.set_border_width_all(1)
	style.set_corner_radius_all(12)
	return style


func _strip_style() -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.035, 0.028, 0.021, 0.72)
	style.border_color = Color(0.32, 0.23, 0.14, 0.66)
	style.set_border_width_all(1)
	style.set_corner_radius_all(8)
	return style


func _footer_style() -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.42, 0.29, 0.17, 0.92)
	style.border_color = Color(0.65, 0.44, 0.22, 0.92)
	style.set_border_width_all(1)
	style.set_corner_radius_all(6)
	return style


func _selected_tab_style() -> StyleBoxTexture:
	return _texture_style(PetCodexVisualSkin.TAB_SELECTED_TEXTURE)


func _family_style(selected: bool, hover: bool) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = (
		Color(0.43, 0.34, 0.21, 0.98)
		if selected
		else Color(0.25, 0.21, 0.16, 0.96)
	)
	if hover:
		style.bg_color = style.bg_color.lightened(0.08)
	style.border_color = COLOR_GOLD if selected else Color(0.42, 0.32, 0.22, 0.88)
	style.set_border_width_all(2 if selected else 1)
	style.set_corner_radius_all(7)
	style.content_margin_left = 10.0
	style.content_margin_right = 8.0
	return style


func _portrait_slot_style(selected: bool, hover: bool) -> StyleBoxTexture:
	var texture: Texture2D = (
		PetCodexVisualSkin.PORTRAIT_SLOT_SELECTED_TEXTURE
		if selected or hover
		else PetCodexVisualSkin.PORTRAIT_SLOT_NORMAL_TEXTURE
	)
	var style := _texture_style(texture)
	if hover and not selected:
		style.modulate_color = Color(1.0, 0.95, 0.79, 1.0)
	return style


func _value_card_style(highlighted: bool) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.025, 0.021, 0.017, 0.90)
	style.border_color = (
		Color(0.64, 0.40, 0.13, 0.92)
		if highlighted
		else Color(0.24, 0.18, 0.12, 0.78)
	)
	style.set_border_width_all(1)
	style.set_corner_radius_all(7)
	return style


func _element_bar_background() -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.025, 0.020, 0.015, 0.95)
	style.set_corner_radius_all(4)
	return style


func _element_bar_fill(color: Color) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = color
	style.set_corner_radius_all(4)
	return style


func _parchment_style() -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.79, 0.72, 0.61, 0.99)
	style.border_color = Color(0.49, 0.36, 0.23, 0.98)
	style.set_border_width_all(3)
	style.set_corner_radius_all(10)
	style.shadow_color = Color(0.0, 0.0, 0.0, 0.55)
	style.shadow_size = 10
	return style


func _route_card_style() -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.88, 0.82, 0.72, 0.98)
	style.border_color = Color(0.56, 0.42, 0.27, 0.88)
	style.set_border_width_all(1)
	style.set_corner_radius_all(7)
	return style


func _dark_button_style(hover: bool) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = (
		Color(0.27, 0.20, 0.13, 0.98)
		if hover
		else Color(0.18, 0.13, 0.09, 0.96)
	)
	style.border_color = Color(0.46, 0.33, 0.20, 0.92)
	style.set_border_width_all(1)
	style.set_corner_radius_all(6)
	return style
