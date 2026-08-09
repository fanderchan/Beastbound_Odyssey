extends PanelContainer
class_name MapAwakenedPanel

const MapAwakenedPresenter := preload(
	"res://scripts/ui/map_awakened_presenter.gd"
)
const MapAwakenedVisualSkin := preload(
	"res://scripts/ui/map_awakened_visual_skin.gd"
)
const WorldHudAwakenedVisualSkin := preload(
	"res://scripts/ui/world_hud_awakened_visual_skin.gd"
)
const WorldHudMinimapRenderCanvas := preload(
	"res://scripts/ui/world_hud_minimap_render_canvas.gd"
)
const MapVisualRenderer := preload(
	"res://scripts/world/map_visual_renderer.gd"
)
const WORLD_ATLAS_BACKGROUND := preload(
	"res://assets/ui/map_awakened_v1/runtime/world_atlas_background_v1.png"
)

signal close_requested
signal route_target_requested(target: Dictionary)
signal map_destination_requested(map_id: String, label: String)

const MAP_VIEWPORT_SIZE := Vector2i(900, 520)
const MAP_MARKER_SIZE := Vector2(36.0, 36.0)
const MAX_PRIMARY_MAP_MARKERS := 6

var close_button: Button
var legacy_texture_rect: TextureRect
var legacy_detail_label: Label
var marker_container: VBoxContainer
var marker_buttons: Dictionary = {}

var _view_state: Dictionary = {}
var _mode := MapAwakenedPresenter.MODE_LOCAL
var _selected_world_region_id := ""
var _using_prepared_visual := false
var _map_grid_size := Vector2i.ZERO
var _marker_specs: Array[Dictionary] = []
var _prepared_cache_context: Dictionary = {}
var _prepared_sidebar_signature: Dictionary = {}
var _prepared_regions_signature: Dictionary = {}
var _prepared_detail_signature: Dictionary = {}
var _prepared_canvas_signature: Dictionary = {}
var _prepared_sidebar_child_count := -1
var _prepared_regions_child_count := -1
var _prepared_detail_child_count := -1
var _prepared_sidebar_button_keys: Array[String] = []
var _prepared_sidebar_destination_button_keys: Array[String] = []
var _prepared_region_button_keys: Array[String] = []
var _prepared_detail_button_keys: Array[String] = []
var _static_sidebar_rebuild_count := 0
var _static_regions_rebuild_count := 0
var _static_detail_rebuild_count := 0
var _prepared_canvas_configure_count := 0
var _dynamic_marker_rebuild_count := 0

var _ui_root: Control
var _header_location_label: Label
var _local_tab_button: Button
var _world_tab_button: Button
var _local_mode: Control
var _world_mode: Control
var _local_map_title_label: Label
var _local_region_label: Label
var _local_map_surface: PanelContainer
var _map_viewport: SubViewport
var _map_canvas: WorldHudMinimapRenderCanvas
var _map_marker_overlay: Control
var _world_region_list: Control
var _world_region_buttons: Dictionary = {}
var _world_route_buttons: Dictionary = {}
var _local_destination_buttons: Dictionary = {}
var _world_atlas_texture_rect: TextureRect
var _world_detail_title: Label
var _world_detail_meta: Label
var _world_detail_column: VBoxContainer
var _world_detail_points: VBoxContainer
var _world_entry_route_button: Button
var _empty_local_label: Label


func _init() -> void:
	name = "MapPanel"
	mouse_filter = Control.MOUSE_FILTER_STOP
	clip_contents = true
	add_theme_stylebox_override("panel", MapAwakenedVisualSkin.frame_style())
	_build_ui()
	resized.connect(_on_panel_resized)


func is_awakened_map_panel() -> bool:
	return true


static func can_use_prepared_visual(
	prepared_visual: Dictionary,
	world_bounds: Rect2
) -> bool:
	return (
		MapVisualRenderer.has_prepared_visual(prepared_visual)
		and world_bounds.size.x > 0.0
		and world_bounds.size.y > 0.0
	)


func apply_view_state(
	state: Dictionary,
	prepared_visual: Dictionary,
	world_bounds: Rect2,
	fallback_texture: Texture2D,
	diagnostic_timing = null
) -> void:
	var timing_enabled := diagnostic_timing is Dictionary
	var apply_started_usec := 0
	var segment_started_usec := 0
	if timing_enabled:
		apply_started_usec = Time.get_ticks_usec()
		segment_started_usec = Time.get_ticks_usec()
	if not _fixed_ui_roots_ready():
		_rebuild_fixed_ui_roots()
	_view_state = state.duplicate(true)
	_map_grid_size = state.get("mapGrid", Vector2i.ZERO) as Vector2i
	_prepared_cache_context = _build_prepared_cache_context(
		state,
		prepared_visual,
		world_bounds
	)
	if not bool(_prepared_cache_context.get("valid", false)):
		_invalidate_prepared_static_cache()
	var player_cell := state.get("playerCell", Vector2i.ZERO) as Vector2i
	if timing_enabled:
		(diagnostic_timing as Dictionary)["apply_state_copy_usec"] = int(
			Time.get_ticks_usec() - segment_started_usec
		)
		segment_started_usec = Time.get_ticks_usec()
	_header_location_label.text = "%s  ·  (%d,%d)" % [
		str(state.get("currentMapName", "未知地图")),
		player_cell.x,
		player_cell.y,
	]
	_local_map_title_label.text = str(state.get("currentMapName", "未知地图"))
	legacy_detail_label.text = MapAwakenedPresenter.player_facing_summary(state)
	var current_region_value = state.get("currentRegion", {})
	var current_region := (
		current_region_value as Dictionary
		if current_region_value is Dictionary
		else {}
	)
	_local_region_label.text = (
		"所属区域 · %s" % str(current_region.get("label", "未归档区域"))
	)
	if timing_enabled:
		(diagnostic_timing as Dictionary)["apply_header_usec"] = int(
			Time.get_ticks_usec() - segment_started_usec
		)
		segment_started_usec = Time.get_ticks_usec()
	_refresh_local_sidebar(_prepared_cache_context)
	if timing_enabled:
		(diagnostic_timing as Dictionary)["apply_sidebar_usec"] = int(
			Time.get_ticks_usec() - segment_started_usec
		)
		segment_started_usec = Time.get_ticks_usec()
	_configure_local_map(
		prepared_visual,
		world_bounds,
		fallback_texture,
		_prepared_cache_context
	)
	if timing_enabled:
		(diagnostic_timing as Dictionary)["apply_local_map_usec"] = int(
			Time.get_ticks_usec() - segment_started_usec
		)
		segment_started_usec = Time.get_ticks_usec()
	_refresh_world_regions(_prepared_cache_context)
	if timing_enabled:
		(diagnostic_timing as Dictionary)["apply_world_regions_usec"] = int(
			Time.get_ticks_usec() - segment_started_usec
		)
		segment_started_usec = Time.get_ticks_usec()
	_ensure_selected_world_region(str(current_region.get("id", "")))
	_refresh_selected_world_region(_prepared_cache_context)
	if timing_enabled:
		(diagnostic_timing as Dictionary)["apply_world_detail_usec"] = int(
			Time.get_ticks_usec() - segment_started_usec
		)
		segment_started_usec = Time.get_ticks_usec()
	show_mode(MapAwakenedPresenter.MODE_LOCAL)
	if timing_enabled:
		(diagnostic_timing as Dictionary)["apply_show_mode_usec"] = int(
			Time.get_ticks_usec() - segment_started_usec
		)
		segment_started_usec = Time.get_ticks_usec()
	call_deferred("_refresh_map_marker_positions")
	if timing_enabled:
		var timing := diagnostic_timing as Dictionary
		timing["apply_marker_schedule_usec"] = int(
			Time.get_ticks_usec() - segment_started_usec
		)
		var apply_total_usec := int(Time.get_ticks_usec() - apply_started_usec)
		var apply_child_usec := (
			int(timing.get("apply_state_copy_usec", 0))
			+ int(timing.get("apply_header_usec", 0))
			+ int(timing.get("apply_sidebar_usec", 0))
			+ int(timing.get("apply_local_map_usec", 0))
			+ int(timing.get("apply_world_regions_usec", 0))
			+ int(timing.get("apply_world_detail_usec", 0))
			+ int(timing.get("apply_show_mode_usec", 0))
			+ int(timing.get("apply_marker_schedule_usec", 0))
		)
		timing["panel_apply_total_usec"] = apply_total_usec
		timing["apply_residual_usec"] = maxi(
			0,
			apply_total_usec - apply_child_usec
		)


func reset_to_local_view() -> void:
	if not _fixed_ui_roots_ready():
		_rebuild_fixed_ui_roots()
	show_mode(MapAwakenedPresenter.MODE_LOCAL)


func show_mode(mode: String) -> void:
	_mode = mode if mode == MapAwakenedPresenter.MODE_WORLD else MapAwakenedPresenter.MODE_LOCAL
	_local_mode.visible = _mode == MapAwakenedPresenter.MODE_LOCAL
	_world_mode.visible = _mode == MapAwakenedPresenter.MODE_WORLD
	_local_tab_button.set_pressed_no_signal(_local_mode.visible)
	_world_tab_button.set_pressed_no_signal(_world_mode.visible)
	if _local_mode.visible:
		call_deferred("_refresh_map_marker_positions")


func current_mode() -> String:
	return _mode


func world_region_count() -> int:
	return _world_region_buttons.size()


func has_world_region(region_id: String) -> bool:
	return _world_region_buttons.has(region_id)


func selected_world_region_id() -> String:
	return _selected_world_region_id


func uses_prepared_visual() -> bool:
	return _using_prepared_visual


func uses_world_atlas_visual() -> bool:
	return _world_atlas_texture_rect != null and _world_atlas_texture_rect.texture != null


func local_tab_button() -> Button:
	return _local_tab_button


func world_tab_button() -> Button:
	return _world_tab_button


func world_region_button(region_id: String) -> Button:
	return _world_region_buttons.get(region_id) as Button


func world_entry_route_button() -> Button:
	return _world_entry_route_button


func world_route_button(map_id: String) -> Button:
	return _world_route_buttons.get(map_id) as Button


func reset_static_cache_counters_for_qa() -> void:
	_static_sidebar_rebuild_count = 0
	_static_regions_rebuild_count = 0
	_static_detail_rebuild_count = 0
	_prepared_canvas_configure_count = 0
	_dynamic_marker_rebuild_count = 0


func static_cache_counters_for_qa() -> Dictionary:
	return {
		"sidebarRebuilds": _static_sidebar_rebuild_count,
		"regionRebuilds": _static_regions_rebuild_count,
		"detailRebuilds": _static_detail_rebuild_count,
		"canvasConfigures": _prepared_canvas_configure_count,
		"markerRebuilds": _dynamic_marker_rebuild_count,
		"cacheActive": bool(_prepared_cache_context.get("valid", false)),
	}


func _build_ui() -> void:
	var outer_margin := MarginContainer.new()
	_ui_root = outer_margin
	outer_margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	outer_margin.add_theme_constant_override("margin_left", 12)
	outer_margin.add_theme_constant_override("margin_top", 10)
	outer_margin.add_theme_constant_override("margin_right", 12)
	outer_margin.add_theme_constant_override("margin_bottom", 10)
	add_child(outer_margin)

	var root_column := VBoxContainer.new()
	root_column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	root_column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	root_column.add_theme_constant_override("separation", 10)
	outer_margin.add_child(root_column)

	var header := PanelContainer.new()
	header.custom_minimum_size = Vector2(0.0, 58.0)
	header.add_theme_stylebox_override("panel", MapAwakenedVisualSkin.header_style())
	root_column.add_child(header)
	var header_row := HBoxContainer.new()
	header_row.add_theme_constant_override("separation", 10)
	header.add_child(header_row)

	var header_icon := TextureRect.new()
	header_icon.custom_minimum_size = Vector2(38.0, 38.0)
	header_icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	header_icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	header_icon.texture = WorldHudAwakenedVisualSkin.texture_for_entry("map")
	header_icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
	header_row.add_child(header_icon)
	var title := Label.new()
	title.text = "地图"
	title.custom_minimum_size = Vector2(86.0, 0.0)
	MapAwakenedVisualSkin.apply_heading(title, 25)
	header_row.add_child(title)

	_header_location_label = Label.new()
	_header_location_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	MapAwakenedVisualSkin.apply_label(_header_location_label, 16, true)
	header_row.add_child(_header_location_label)

	_local_tab_button = Button.new()
	_local_tab_button.name = "MapLocalTabButton"
	_local_tab_button.text = "当前地图"
	MapAwakenedVisualSkin.apply_tab_button(_local_tab_button)
	_local_tab_button.pressed.connect(func() -> void:
		show_mode(MapAwakenedPresenter.MODE_LOCAL)
	)
	header_row.add_child(_local_tab_button)
	_world_tab_button = Button.new()
	_world_tab_button.name = "MapWorldTabButton"
	_world_tab_button.text = "世界地图"
	MapAwakenedVisualSkin.apply_tab_button(_world_tab_button)
	_world_tab_button.pressed.connect(func() -> void:
		show_mode(MapAwakenedPresenter.MODE_WORLD)
	)
	header_row.add_child(_world_tab_button)

	close_button = Button.new()
	close_button.name = "MapCloseButton"
	close_button.text = "关闭"
	MapAwakenedVisualSkin.apply_close_button(close_button)
	close_button.pressed.connect(func() -> void:
		close_requested.emit()
	)
	header_row.add_child(close_button)

	var mode_stack := Control.new()
	mode_stack.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	mode_stack.size_flags_vertical = Control.SIZE_EXPAND_FILL
	root_column.add_child(mode_stack)
	_build_local_mode(mode_stack)
	_build_world_mode(mode_stack)


func _build_local_mode(parent: Control) -> void:
	_local_mode = HBoxContainer.new()
	_local_mode.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_local_mode.add_theme_constant_override("separation", 10)
	parent.add_child(_local_mode)

	var sidebar := PanelContainer.new()
	sidebar.custom_minimum_size = Vector2(292.0, 0.0)
	sidebar.add_theme_stylebox_override("panel", MapAwakenedVisualSkin.dark_surface_style())
	_local_mode.add_child(sidebar)
	var sidebar_column := VBoxContainer.new()
	sidebar_column.add_theme_constant_override("separation", 7)
	sidebar.add_child(sidebar_column)

	_local_map_title_label = Label.new()
	_local_map_title_label.custom_minimum_size = Vector2(0.0, 42.0)
	MapAwakenedVisualSkin.apply_heading(_local_map_title_label, 20)
	sidebar_column.add_child(_local_map_title_label)
	var local_hint := Label.new()
	local_hint.text = "左侧可选全部目标 · 地图标出主要地点"
	MapAwakenedVisualSkin.apply_label(local_hint, 14, true)
	sidebar_column.add_child(local_hint)

	var marker_scroll := ScrollContainer.new()
	marker_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	marker_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	marker_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	sidebar_column.add_child(marker_scroll)
	marker_container = VBoxContainer.new()
	marker_container.name = "MapMarkerContainer"
	marker_container.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	marker_container.add_theme_constant_override("separation", 6)
	marker_scroll.add_child(marker_container)

	_local_region_label = Label.new()
	_local_region_label.custom_minimum_size = Vector2(0.0, 36.0)
	MapAwakenedVisualSkin.apply_heading(_local_region_label, 17)
	sidebar_column.add_child(_local_region_label)

	var world_shortcut := Button.new()
	world_shortcut.text = "查看世界地图"
	MapAwakenedVisualSkin.apply_list_button(world_shortcut, "map", true)
	world_shortcut.pressed.connect(func() -> void:
		show_mode(MapAwakenedPresenter.MODE_WORLD)
	)
	sidebar_column.add_child(world_shortcut)

	_local_map_surface = PanelContainer.new()
	_local_map_surface.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_local_map_surface.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_local_map_surface.clip_contents = true
	_local_map_surface.add_theme_stylebox_override(
		"panel",
		MapAwakenedVisualSkin.inset_surface_style(11)
	)
	_local_mode.add_child(_local_map_surface)
	var map_stage := Control.new()
	map_stage.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	map_stage.mouse_filter = Control.MOUSE_FILTER_PASS
	_local_map_surface.add_child(map_stage)

	legacy_texture_rect = TextureRect.new()
	legacy_texture_rect.name = "MapTextureRect"
	legacy_texture_rect.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	legacy_texture_rect.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	legacy_texture_rect.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	legacy_texture_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	map_stage.add_child(legacy_texture_rect)

	_map_viewport = SubViewport.new()
	_map_viewport.name = "MapAwakenedViewport"
	_map_viewport.size = MAP_VIEWPORT_SIZE
	_map_viewport.transparent_bg = true
	_map_viewport.render_target_update_mode = SubViewport.UPDATE_DISABLED
	map_stage.add_child(_map_viewport)
	_map_canvas = WorldHudMinimapRenderCanvas.new()
	_map_canvas.name = "MapAwakenedCanvas"
	_map_viewport.add_child(_map_canvas)

	_map_marker_overlay = Control.new()
	_map_marker_overlay.name = "MapMarkerOverlay"
	_map_marker_overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_map_marker_overlay.mouse_filter = Control.MOUSE_FILTER_PASS
	map_stage.add_child(_map_marker_overlay)

	_empty_local_label = Label.new()
	_empty_local_label.text = "这张地图暂时没有可显示的地形。"
	_empty_local_label.visible = false
	_empty_local_label.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	_empty_local_label.position = Vector2(-180.0, -28.0)
	_empty_local_label.size = Vector2(360.0, 56.0)
	_empty_local_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	MapAwakenedVisualSkin.apply_label(_empty_local_label, 17, true)
	map_stage.add_child(_empty_local_label)

	var info_bar := PanelContainer.new()
	info_bar.set_anchors_preset(Control.PRESET_BOTTOM_WIDE)
	info_bar.offset_top = -58.0
	info_bar.offset_bottom = -6.0
	info_bar.offset_left = 8.0
	info_bar.offset_right = -8.0
	info_bar.add_theme_stylebox_override("panel", MapAwakenedVisualSkin.info_bar_style())
	map_stage.add_child(info_bar)
	legacy_detail_label = Label.new()
	legacy_detail_label.name = "MapDetailLabel"
	legacy_detail_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	MapAwakenedVisualSkin.apply_label(legacy_detail_label, 15)
	info_bar.add_child(legacy_detail_label)


func _build_world_mode(parent: Control) -> void:
	_world_mode = HBoxContainer.new()
	_world_mode.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_world_mode.add_theme_constant_override("separation", 10)
	parent.add_child(_world_mode)

	var world_directory := PanelContainer.new()
	world_directory.custom_minimum_size = Vector2(740.0, 0.0)
	world_directory.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	world_directory.add_theme_stylebox_override("panel", MapAwakenedVisualSkin.dark_surface_style())
	_world_mode.add_child(world_directory)
	var directory_column := VBoxContainer.new()
	directory_column.add_theme_constant_override("separation", 6)
	world_directory.add_child(directory_column)
	var world_title := Label.new()
	world_title.text = "已开放区域"
	world_title.custom_minimum_size = Vector2(0.0, 34.0)
	MapAwakenedVisualSkin.apply_heading(world_title, 22)
	directory_column.add_child(world_title)
	var world_hint := Label.new()
	world_hint.text = "按真实通路查看入口、楼层与推荐等级"
	MapAwakenedVisualSkin.apply_label(world_hint, 14, true)
	directory_column.add_child(world_hint)
	var atlas_stage := PanelContainer.new()
	atlas_stage.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	atlas_stage.size_flags_vertical = Control.SIZE_EXPAND_FILL
	atlas_stage.clip_contents = true
	atlas_stage.add_theme_stylebox_override("panel", MapAwakenedVisualSkin.inset_surface_style(8))
	directory_column.add_child(atlas_stage)
	var atlas_stack := Control.new()
	atlas_stack.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	atlas_stack.mouse_filter = Control.MOUSE_FILTER_PASS
	atlas_stage.add_child(atlas_stack)
	_world_atlas_texture_rect = TextureRect.new()
	_world_atlas_texture_rect.name = "WorldAtlasBackground"
	_world_atlas_texture_rect.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_world_atlas_texture_rect.texture = WORLD_ATLAS_BACKGROUND
	_world_atlas_texture_rect.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_world_atlas_texture_rect.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	_world_atlas_texture_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	atlas_stack.add_child(_world_atlas_texture_rect)
	_world_region_list = Control.new()
	_world_region_list.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_world_region_list.mouse_filter = Control.MOUSE_FILTER_PASS
	atlas_stack.add_child(_world_region_list)

	var detail_panel := PanelContainer.new()
	detail_panel.custom_minimum_size = Vector2(360.0, 0.0)
	detail_panel.add_theme_stylebox_override("panel", MapAwakenedVisualSkin.dark_surface_style())
	_world_mode.add_child(detail_panel)
	_world_detail_column = VBoxContainer.new()
	_world_detail_column.add_theme_constant_override("separation", 8)
	detail_panel.add_child(_world_detail_column)
	_world_detail_title = Label.new()
	_world_detail_title.custom_minimum_size = Vector2(0.0, 44.0)
	MapAwakenedVisualSkin.apply_heading(_world_detail_title, 22)
	_world_detail_column.add_child(_world_detail_title)
	_world_detail_meta = Label.new()
	_world_detail_meta.custom_minimum_size = Vector2(0.0, 54.0)
	_world_detail_meta.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	MapAwakenedVisualSkin.apply_label(_world_detail_meta, 15, true)
	_world_detail_column.add_child(_world_detail_meta)
	var point_scroll := ScrollContainer.new()
	point_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	point_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	point_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_world_detail_column.add_child(point_scroll)
	_world_detail_points = VBoxContainer.new()
	_world_detail_points.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_world_detail_points.add_theme_constant_override("separation", 7)
	point_scroll.add_child(_world_detail_points)
	_world_entry_route_button = Button.new()
	_world_entry_route_button.text = "前往区域入口"
	MapAwakenedVisualSkin.apply_list_button(_world_entry_route_button, "map", true)
	_world_entry_route_button.pressed.connect(_on_world_entry_route_pressed)
	_world_detail_column.add_child(_world_entry_route_button)


static func _node_is_live(value) -> bool:
	return (
		is_instance_valid(value)
		and value is Node
		and not (value as Node).is_queued_for_deletion()
	)


static func _node_has_live_ancestry_to(value, expected_ancestor) -> bool:
	if not _node_is_live(value) or not _node_is_live(expected_ancestor):
		return false
	var node := value as Node
	var ancestor := expected_ancestor as Node
	while node != ancestor:
		node = node.get_parent()
		if not _node_is_live(node):
			return false
	return true


static func _all_direct_children_live(container_value) -> bool:
	if not _node_is_live(container_value):
		return false
	var container := container_value as Node
	for child in container.get_children():
		if not _node_is_live(child) or child.get_parent() != container:
			return false
	return true


func _fixed_ui_root_nodes() -> Array:
	return [
		close_button,
		_header_location_label,
		_local_tab_button,
		_world_tab_button,
		_local_mode,
		_world_mode,
		_local_map_title_label,
		_local_region_label,
		_local_map_surface,
		marker_container,
		legacy_texture_rect,
		legacy_detail_label,
		_map_marker_overlay,
		_world_region_list,
		_world_atlas_texture_rect,
		_world_detail_title,
		_world_detail_meta,
		_world_detail_column,
		_world_detail_points,
		_world_entry_route_button,
		_empty_local_label,
	]


func _fixed_ui_roots_ready() -> bool:
	if (
		not _node_is_live(_ui_root)
		or _ui_root.get_parent() != self
	):
		return false
	for value in _fixed_ui_root_nodes():
		if not _node_has_live_ancestry_to(value, _ui_root):
			return false
	return _world_entry_route_button.get_parent() == _world_detail_column


func _rebuild_fixed_ui_roots() -> void:
	var old_nodes: Array[Node] = []
	for value in _fixed_ui_root_nodes():
		if is_instance_valid(value):
			old_nodes.append(value as Node)
	if is_instance_valid(_ui_root):
		_ui_root.free()
	for node in old_nodes:
		if is_instance_valid(node):
			node.free()
	for child in get_children():
		child.free()
	marker_buttons.clear()
	_local_destination_buttons.clear()
	_world_region_buttons.clear()
	_world_route_buttons.clear()
	_marker_specs.clear()
	_map_viewport = null
	_map_canvas = null
	_invalidate_prepared_static_cache()
	_build_ui()


func _build_prepared_cache_context(
	state: Dictionary,
	prepared_visual: Dictionary,
	world_bounds: Rect2
) -> Dictionary:
	var prepared_usable := can_use_prepared_visual(
		prepared_visual,
		world_bounds
	)
	var visual_revision := int(state.get("mapVisualRevision", -1))
	var catalog_revision := str(
		state.get("mapCatalogRevision", "")
	).strip_edges()
	var route_revision := str(
		state.get("mapRouteContractRevision", "")
	).strip_edges()
	var current_map_id := str(state.get("currentMapId", "")).strip_edges()
	var map_names_value = state.get("mapNames", {})
	var valid := (
		prepared_usable
		and visual_revision >= 0
		and catalog_revision != ""
		and route_revision != ""
		and current_map_id != ""
		and map_names_value is Dictionary
		and not (map_names_value as Dictionary).is_empty()
		and state.get("localTargets", null) is Array
		and state.get("currentRegion", null) is Dictionary
		and state.get("worldRegions", null) is Array
	)
	var base := {
		"prepared": prepared_usable,
		"currentMapId": current_map_id,
		"mapVisualRevision": visual_revision,
		"mapCatalogRevision": catalog_revision,
		"mapRouteContractRevision": route_revision,
		"mapNames": map_names_value,
		"worldBounds": [
			world_bounds.position.x,
			world_bounds.position.y,
			world_bounds.size.x,
			world_bounds.size.y,
		],
	}
	return {
		"valid": valid,
		"base": base,
		"canvasSignature": _static_signature({
			"prepared": prepared_usable,
			"currentMapId": current_map_id,
			"mapVisualRevision": visual_revision,
			"worldBounds": base.get("worldBounds", []),
		}),
	}


func _static_signature(value: Dictionary) -> Dictionary:
	# Keep one native deep projection per panel. Dictionary.recursive_equal()
	# preserves Vector/Rect values and cannot hide a short-hash collision.
	return value.duplicate(true)


func _signatures_equal(left: Dictionary, right: Dictionary) -> bool:
	return not left.is_empty() and left.recursive_equal(right, 0)


func _signature_with_base(
	context: Dictionary,
	payload: Dictionary
) -> Dictionary:
	var projection := (
		(context.get("base", {}) as Dictionary).duplicate(true)
		if context.get("base", {}) is Dictionary
		else {}
	)
	for key in payload.keys():
		projection[key] = payload.get(key)
	return _static_signature(projection)


func _invalidate_prepared_static_cache() -> void:
	_prepared_sidebar_signature = {}
	_prepared_regions_signature = {}
	_prepared_detail_signature = {}
	_prepared_canvas_signature = {}
	_prepared_sidebar_child_count = -1
	_prepared_regions_child_count = -1
	_prepared_detail_child_count = -1
	_prepared_sidebar_button_keys.clear()
	_prepared_sidebar_destination_button_keys.clear()
	_prepared_region_button_keys.clear()
	_prepared_detail_button_keys.clear()


func _sorted_string_keys(values: Dictionary) -> Array[String]:
	var result: Array[String] = []
	for key_value in values.keys():
		result.append(str(key_value))
	result.sort()
	return result


func _local_sidebar_cache_ready() -> bool:
	if not _all_direct_children_live(marker_container):
		return false
	if marker_container.get_child_count() != _prepared_sidebar_child_count:
		return false
	if _sorted_string_keys(marker_buttons) != _prepared_sidebar_button_keys:
		return false
	if (
		_sorted_string_keys(_local_destination_buttons)
		!= _prepared_sidebar_destination_button_keys
	):
		return false
	for button_value in marker_buttons.values():
		if not (button_value is Button):
			return false
		var button := button_value as Button
		if not _node_is_live(button) or button.get_parent() != marker_container:
			return false
	for button_value in _local_destination_buttons.values():
		if not (button_value is Button):
			return false
		var button := button_value as Button
		if not _node_is_live(button) or button.get_parent() != marker_container:
			return false
	return true


func _world_regions_cache_ready() -> bool:
	if not _all_direct_children_live(_world_region_list):
		return false
	if _world_region_list.get_child_count() != _prepared_regions_child_count:
		return false
	if _sorted_string_keys(_world_region_buttons) != _prepared_region_button_keys:
		return false
	for button_value in _world_region_buttons.values():
		if not (button_value is Button):
			return false
		var button := button_value as Button
		if not _node_is_live(button) or button.get_parent() != _world_region_list:
			return false
	return true


func _world_detail_cache_ready() -> bool:
	if (
		not _all_direct_children_live(_world_detail_points)
		or not _node_is_live(_world_entry_route_button)
		or _world_detail_points.get_child_count()
		!= _prepared_detail_child_count
	):
		return false
	if _sorted_string_keys(_world_route_buttons) != _prepared_detail_button_keys:
		return false
	for button_value in _world_route_buttons.values():
		if not (button_value is Button):
			return false
		var button := button_value as Button
		if (
			not _node_is_live(button)
			or button.get_parent() != _world_detail_points
		):
			return false
	return true


func _refresh_local_sidebar(context: Dictionary) -> void:
	var cache_enabled := bool(context.get("valid", false))
	var signature := _signature_with_base(context, {
		"localTargets": _view_state.get("localTargets", []),
		"currentRegion": _view_state.get("currentRegion", {}),
	})
	if (
		cache_enabled
		and _signatures_equal(signature, _prepared_sidebar_signature)
		and _local_sidebar_cache_ready()
	):
		return
	_populate_local_sidebar()
	_static_sidebar_rebuild_count += 1
	_prepared_sidebar_child_count = marker_container.get_child_count()
	_prepared_sidebar_button_keys = _sorted_string_keys(marker_buttons)
	_prepared_sidebar_destination_button_keys = _sorted_string_keys(
		_local_destination_buttons
	)
	_prepared_sidebar_signature = signature if cache_enabled else {}


func _refresh_world_regions(context: Dictionary) -> void:
	var cache_enabled := bool(context.get("valid", false))
	var signature := _signature_with_base(context, {
		"worldRegions": _view_state.get("worldRegions", []),
	})
	if not (
		cache_enabled
		and _signatures_equal(signature, _prepared_regions_signature)
		and _world_regions_cache_ready()
	):
		_populate_world_regions()
		_static_regions_rebuild_count += 1
		_prepared_regions_child_count = _world_region_list.get_child_count()
		_prepared_region_button_keys = _sorted_string_keys(
			_world_region_buttons
		)
		_prepared_regions_signature = signature if cache_enabled else {}
	_sync_world_region_button_state()


func _refresh_selected_world_region(context: Dictionary) -> void:
	var cache_enabled := bool(context.get("valid", false))
	var signature := _signature_with_base(context, {
		"selectedWorldRegionId": _selected_world_region_id,
		"selectedWorldRegion": _world_region_state(
			_selected_world_region_id
		),
		"currentMapId": str(_view_state.get("currentMapId", "")),
	})
	if not (
		cache_enabled
		and _signatures_equal(signature, _prepared_detail_signature)
		and _world_detail_cache_ready()
	):
		_render_selected_world_region()
		_static_detail_rebuild_count += 1
		_prepared_detail_child_count = _world_detail_points.get_child_count()
		_prepared_detail_button_keys = _sorted_string_keys(
			_world_route_buttons
		)
		_prepared_detail_signature = signature if cache_enabled else {}
	_sync_world_region_button_state()


func _ensure_selected_world_region(current_region_id: String) -> void:
	if not _world_region_state(_selected_world_region_id).is_empty():
		return
	if _selected_world_region_id == "":
		_selected_world_region_id = current_region_id
		if not _world_region_state(_selected_world_region_id).is_empty():
			return
	var regions_value = _view_state.get("worldRegions", [])
	if (
		regions_value is Array
		and not (regions_value as Array).is_empty()
		and (regions_value as Array)[0] is Dictionary
	):
		_selected_world_region_id = str(
			((regions_value as Array)[0] as Dictionary).get("id", "")
		)


func _populate_local_sidebar() -> void:
	_clear_children(marker_container)
	marker_buttons.clear()
	_local_destination_buttons.clear()
	var nearby_heading := Label.new()
	nearby_heading.text = "附近目标"
	nearby_heading.custom_minimum_size = Vector2(0.0, 34.0)
	MapAwakenedVisualSkin.apply_heading(nearby_heading, 16)
	marker_container.add_child(nearby_heading)
	var local_targets_value = _view_state.get("localTargets", [])
	if local_targets_value is Array:
		for target_index in range((local_targets_value as Array).size()):
			var value = (local_targets_value as Array)[target_index]
			if not (value is Dictionary):
				continue
			var target := (value as Dictionary).duplicate(true)
			var target_id := str(
				target.get("id", target.get("label", ""))
			)
			var captured_target_id := target_id
			var button := Button.new()
			button.text = str(
				target.get("displayText", target.get("label", "目标"))
			)
			button.clip_text = true
			button.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
			MapAwakenedVisualSkin.apply_list_button(
				button,
				MapAwakenedVisualSkin.icon_for_target(target)
			)
			button.tooltip_text = "%s · 点击自动寻路" % str(
				target.get("label", "目标")
			)
			button.pressed.connect(func() -> void:
				_emit_latest_local_target(captured_target_id)
			)
			marker_container.add_child(button)
			marker_buttons[target_id] = button
	if marker_buttons.is_empty():
		var empty := Label.new()
		empty.text = "当前地图暂无可寻路目标"
		MapAwakenedVisualSkin.apply_label(empty, 15, true)
		marker_container.add_child(empty)

	var region_value = _view_state.get("currentRegion", {})
	if not (region_value is Dictionary) or (region_value as Dictionary).is_empty():
		return
	var region := region_value as Dictionary
	var region_heading := Label.new()
	region_heading.text = "区域地点"
	region_heading.custom_minimum_size = Vector2(0.0, 34.0)
	MapAwakenedVisualSkin.apply_heading(region_heading, 16)
	marker_container.add_child(region_heading)
	var points_value = region.get("points", [])
	if not (points_value is Array):
		return
	var captured_region_id := str(region.get("id", ""))
	for value in points_value as Array:
		if not (value is Dictionary):
			continue
		var point := value as Dictionary
		var map_id := str(point.get("mapId", ""))
		if map_id == "":
			continue
		var captured_map_id := map_id
		var button := Button.new()
		button.text = "%s  %s" % [str(point.get("label", map_id)), str(point.get("meta", ""))]
		button.disabled = bool(point.get("current", false))
		MapAwakenedVisualSkin.apply_list_button(button, "map", bool(point.get("current", false)))
		button.pressed.connect(func() -> void:
			_emit_latest_map_destination(captured_region_id, captured_map_id)
		)
		marker_container.add_child(button)
		_local_destination_buttons[map_id] = button


func _configure_local_map(
	prepared_visual: Dictionary,
	world_bounds: Rect2,
	fallback_texture: Texture2D,
	cache_context: Dictionary
) -> void:
	_using_prepared_visual = can_use_prepared_visual(
		prepared_visual,
		world_bounds
	)
	if _using_prepared_visual and not _ensure_local_map_canvas_ready():
		_using_prepared_visual = false
	if _using_prepared_visual:
		var canvas_signature_value = cache_context.get("canvasSignature", {})
		var canvas_signature := (
			(canvas_signature_value as Dictionary).duplicate(true)
			if canvas_signature_value is Dictionary
			else {}
		)
		var configure_required := (
			not bool(cache_context.get("valid", false))
			or canvas_signature.is_empty()
			or not _signatures_equal(
				canvas_signature,
				_prepared_canvas_signature
			)
		)
		if configure_required:
			_map_canvas.configure(
				prepared_visual,
				world_bounds,
				Vector2(MAP_VIEWPORT_SIZE)
			)
			_prepared_canvas_configure_count += 1
			_prepared_canvas_signature = (
				canvas_signature
				if bool(cache_context.get("valid", false))
				else {}
			)
		legacy_texture_rect.texture = _map_viewport.get_texture()
		if configure_required:
			_map_viewport.render_target_update_mode = SubViewport.UPDATE_ONCE
	else:
		_prepared_canvas_signature = {}
		legacy_texture_rect.texture = fallback_texture
	_empty_local_label.visible = legacy_texture_rect.texture == null
	_build_map_markers()


func _ensure_local_map_canvas_ready() -> bool:
	if not _node_is_live(legacy_texture_rect):
		return false
	var map_stage := legacy_texture_rect.get_parent()
	if not _node_is_live(map_stage):
		return false
	if (
		_node_is_live(_map_viewport)
		and _map_viewport.get_parent() == map_stage
		and _node_is_live(_map_canvas)
		and _map_canvas.get_parent() == _map_viewport
	):
		return true
	if not _node_is_live(_map_viewport):
		if is_instance_valid(_map_viewport):
			_map_viewport.free()
		_map_viewport = SubViewport.new()
		_map_viewport.name = "MapAwakenedViewport"
		_map_viewport.size = MAP_VIEWPORT_SIZE
		_map_viewport.transparent_bg = true
		_map_viewport.render_target_update_mode = SubViewport.UPDATE_DISABLED
	elif _map_viewport.get_parent() != null:
		_map_viewport.get_parent().remove_child(_map_viewport)
	if _map_viewport.get_parent() == null:
		map_stage.add_child(_map_viewport)
	_map_viewport.size = MAP_VIEWPORT_SIZE
	_map_viewport.transparent_bg = true
	_map_viewport.render_target_update_mode = SubViewport.UPDATE_DISABLED
	if not _node_is_live(_map_canvas):
		if is_instance_valid(_map_canvas):
			_map_canvas.free()
		_map_canvas = WorldHudMinimapRenderCanvas.new()
		_map_canvas.name = "MapAwakenedCanvas"
	elif _map_canvas.get_parent() != null:
		_map_canvas.get_parent().remove_child(_map_canvas)
	_map_viewport.add_child(_map_canvas)
	_prepared_canvas_signature = {}
	return true


func _build_map_markers() -> void:
	_clear_children(_map_marker_overlay)
	_marker_specs.clear()
	_dynamic_marker_rebuild_count += 1
	var player_marker := Button.new()
	player_marker.text = ""
	player_marker.tooltip_text = "当前位置"
	player_marker.mouse_filter = Control.MOUSE_FILTER_IGNORE
	player_marker.z_index = 10
	MapAwakenedVisualSkin.apply_map_marker_button(
		player_marker,
		"event_character",
		MapAwakenedVisualSkin.MARKER_ROLE_PLAYER
	)
	_map_marker_overlay.add_child(player_marker)
	_marker_specs.append({
		"button": player_marker,
		"player": true,
		"cell": _view_state.get("playerCell", Vector2i.ZERO),
		"worldPosition": _view_state.get("playerWorldPosition", Vector2.ZERO),
	})
	var target_cell := _view_state.get("targetCell", Vector2i(-1, -1)) as Vector2i
	if target_cell.x >= 0 and target_cell.y >= 0:
		var target_marker := Button.new()
		target_marker.text = ""
		target_marker.tooltip_text = "正在前往的目标"
		target_marker.mouse_filter = Control.MOUSE_FILTER_IGNORE
		target_marker.z_index = 9
		MapAwakenedVisualSkin.apply_map_marker_button(
			target_marker,
			"quest",
			MapAwakenedVisualSkin.MARKER_ROLE_TARGET
		)
		_map_marker_overlay.add_child(target_marker)
		_marker_specs.append({
			"button": target_marker,
			"routeTarget": true,
			"cell": target_cell,
			"worldPosition": _view_state.get("targetWorldPosition", Vector2.ZERO),
		})
	var local_targets_value = _view_state.get("localTargets", [])
	var visible_target_count := 0
	if local_targets_value is Array:
		for target_index in range((local_targets_value as Array).size()):
			var value = (local_targets_value as Array)[target_index]
			if not (value is Dictionary):
				continue
			var target := (value as Dictionary).duplicate(true)
			var target_id := str(
				target.get("id", target.get("label", ""))
			)
			var captured_target_id := target_id
			if not _target_should_show_on_map(target):
				continue
			if visible_target_count >= MAX_PRIMARY_MAP_MARKERS:
				break
			var marker_button := Button.new()
			marker_button.text = ""
			marker_button.tooltip_text = "%s · 点击自动寻路" % str(target.get("label", "目标"))
			MapAwakenedVisualSkin.apply_map_marker_button(
				marker_button,
				MapAwakenedVisualSkin.icon_for_target(target)
			)
			marker_button.pressed.connect(func() -> void:
				_emit_latest_local_target(captured_target_id)
			)
			_map_marker_overlay.add_child(marker_button)
			_marker_specs.append({"button": marker_button, "target": target})
			visible_target_count += 1


func _refresh_map_marker_positions() -> void:
	if not _fixed_ui_roots_ready():
		return
	if _using_prepared_visual and not _node_is_live(_map_canvas):
		return
	if legacy_texture_rect.size.x <= 1.0 or legacy_texture_rect.size.y <= 1.0:
		return
	var source_size := Vector2(MAP_VIEWPORT_SIZE) if _using_prepared_visual else Vector2(420.0, 220.0)
	var fit_scale := minf(
		legacy_texture_rect.size.x / source_size.x,
		legacy_texture_rect.size.y / source_size.y
	)
	var content_size := source_size * fit_scale
	var content_origin := (legacy_texture_rect.size - content_size) * 0.5
	var placed_centers: Array[Vector2] = []
	for spec in _marker_specs:
		var button_value = spec.get("button")
		if not (button_value is Button):
			continue
		var button := button_value as Button
		button.size = MAP_MARKER_SIZE
		var source_point := Vector2.ZERO
		if _using_prepared_visual:
			var world_position := spec.get("worldPosition", Vector2.ZERO) as Vector2
			if spec.has("target"):
				var target := spec.get("target", {}) as Dictionary
				world_position = target.get("worldPosition", Vector2.ZERO) as Vector2
			source_point = _map_canvas.project_world_position(world_position)
		else:
			var cell := spec.get("cell", Vector2i.ZERO) as Vector2i
			if spec.has("target"):
				var target := spec.get("target", {}) as Dictionary
				cell = target.get("cell", Vector2i.ZERO) as Vector2i
			var normalized := Vector2(
				(float(cell.x) + 0.5) / maxf(1.0, float(_map_grid_size.x)),
				(float(cell.y) + 0.5) / maxf(1.0, float(_map_grid_size.y))
			)
			source_point = Vector2(10.0, 10.0) + normalized * Vector2(400.0, 200.0)
		var ideal_center := content_origin + source_point * fit_scale
		var chosen_center := _deconflicted_marker_center(
			ideal_center,
			placed_centers,
			legacy_texture_rect.size,
			bool(spec.get("player", false))
		)
		placed_centers.append(chosen_center)
		button.position = chosen_center - button.size * 0.5


func _target_should_show_on_map(target: Dictionary) -> bool:
	return str(target.get("facilityLabel", "")) != ""


func _deconflicted_marker_center(
	ideal_center: Vector2,
	placed_centers: Array[Vector2],
	bounds_size: Vector2,
	keep_exact: bool
) -> Vector2:
	if keep_exact:
		return ideal_center
	var offsets := [
		Vector2.ZERO,
		Vector2(24.0, 0.0),
		Vector2(-24.0, 0.0),
		Vector2(0.0, 24.0),
		Vector2(0.0, -24.0),
		Vector2(24.0, 24.0),
		Vector2(-24.0, 24.0),
		Vector2(24.0, -24.0),
		Vector2(-24.0, -24.0),
		Vector2(46.0, 0.0),
		Vector2(-46.0, 0.0),
	]
	for offset in offsets:
		var candidate: Vector2 = ideal_center + (offset as Vector2)
		candidate.x = clampf(candidate.x, MAP_MARKER_SIZE.x * 0.5, bounds_size.x - MAP_MARKER_SIZE.x * 0.5)
		candidate.y = clampf(candidate.y, MAP_MARKER_SIZE.y * 0.5, bounds_size.y - MAP_MARKER_SIZE.y * 0.5)
		var overlaps := false
		for placed in placed_centers:
			if placed.distance_to(candidate) < 34.0:
				overlaps = true
				break
		if not overlaps:
			return candidate
	return ideal_center


func _populate_world_regions() -> void:
	_clear_children(_world_region_list)
	_world_region_buttons.clear()
	var regions_value = _view_state.get("worldRegions", [])
	if not (regions_value is Array):
		return
	for value in regions_value as Array:
		if not (value is Dictionary):
			continue
		var region := (value as Dictionary).duplicate(true)
		var region_id := str(region.get("id", ""))
		var captured_region_id := region_id
		var button := Button.new()
		button.name = "MapRegion_%s" % region_id
		button.text = str(region.get("label", "未知区域"))
		button.tooltip_text = "%s · %s · %d张地图" % [
			button.text,
			str(region.get("levelText", "生活区域")),
			int(region.get("mapCount", 0)),
		]
		MapAwakenedVisualSkin.apply_atlas_region_button(
			button,
			MapAwakenedVisualSkin.icon_for_region(str(region.get("type", "field"))),
			bool(region.get("current", false))
		)
		var anchor := _region_atlas_anchor(region_id)
		button.anchor_left = anchor.x
		button.anchor_right = anchor.x
		button.anchor_top = anchor.y
		button.anchor_bottom = anchor.y
		button.offset_left = -76.0
		button.offset_right = 76.0
		button.offset_top = -21.0
		button.offset_bottom = 21.0
		button.pressed.connect(func() -> void:
			_selected_world_region_id = captured_region_id
			_refresh_selected_world_region(_prepared_cache_context)
		)
		_world_region_list.add_child(button)
		_world_region_buttons[region_id] = button


func _region_atlas_anchor(region_id: String) -> Vector2:
	match region_id:
		"element_trial_caves":
			return Vector2(0.22, 0.24)
		"firebud_training_field":
			return Vector2(0.50, 0.18)
		"manor_ring":
			return Vector2(0.78, 0.25)
		"firebud_village":
			return Vector2(0.50, 0.49)
		"shadow_oath_cavern":
			return Vector2(0.18, 0.49)
		"level_grass_trial_field":
			return Vector2(0.82, 0.51)
		"mistcap_marsh":
			return Vector2(0.22, 0.79)
		"suncrack_badlands":
			return Vector2(0.51, 0.82)
		"windglass_highlands":
			return Vector2(0.79, 0.80)
	return Vector2(0.5, 0.5)


func _render_selected_world_region() -> void:
	_world_route_buttons.clear()
	var region := _world_region_state(_selected_world_region_id)
	if region.is_empty():
		var regions_value = _view_state.get("worldRegions", [])
		if regions_value is Array and not (regions_value as Array).is_empty() and (regions_value as Array)[0] is Dictionary:
			region = (regions_value as Array)[0] as Dictionary
			_selected_world_region_id = str(region.get("id", ""))
	if region.is_empty():
		_world_detail_title.text = "暂无区域"
		_world_detail_meta.text = ""
		_world_entry_route_button.disabled = true
		_clear_children(_world_detail_points)
		return
	_world_detail_title.text = str(region.get("label", "未知区域"))
	_world_detail_meta.text = "%s\n入口：%s" % [
		str(region.get("levelText", "生活区域")),
		str(region.get("entryMapName", region.get("entryMapId", ""))),
	]
	var entry_map_id := str(region.get("entryMapId", ""))
	_world_entry_route_button.disabled = entry_map_id == "" or entry_map_id == str(_view_state.get("currentMapId", ""))
	_world_entry_route_button.text = (
		"已在区域入口"
		if _world_entry_route_button.disabled and entry_map_id != ""
		else "前往%s" % str(region.get("entryMapName", "区域入口"))
	)
	_clear_children(_world_detail_points)
	var points_value = region.get("points", [])
	if not (points_value is Array) or (points_value as Array).is_empty():
		var empty := Label.new()
		empty.text = "该区域暂时没有更多地点"
		MapAwakenedVisualSkin.apply_label(empty, 15, true)
		_world_detail_points.add_child(empty)
		return
	var captured_region_id := str(region.get("id", ""))
	for value in points_value as Array:
		if not (value is Dictionary):
			continue
		var point := value as Dictionary
		var map_id := str(point.get("mapId", ""))
		var captured_map_id := map_id
		var button := Button.new()
		button.text = "%s\n%s" % [str(point.get("label", map_id)), str(point.get("meta", "自动寻路"))]
		button.disabled = bool(point.get("current", false))
		MapAwakenedVisualSkin.apply_list_button(button, "map", bool(point.get("current", false)))
		button.pressed.connect(func() -> void:
			_emit_latest_map_destination(captured_region_id, captured_map_id)
		)
		_world_detail_points.add_child(button)
		_world_route_buttons[map_id] = button
	_sync_world_region_button_state()


func _sync_world_region_button_state() -> void:
	for region_id_value in _world_region_buttons.keys():
		var region_button := _world_region_buttons.get(region_id_value) as Button
		if region_button != null:
			region_button.set_pressed_no_signal(str(region_id_value) == _selected_world_region_id)


func _on_world_entry_route_pressed() -> void:
	var region := _world_region_state(_selected_world_region_id)
	if region.is_empty():
		return
	var map_id := str(region.get("entryMapId", ""))
	if map_id == "":
		return
	var label := str(
		region.get("entryMapName", region.get("label", map_id))
	)
	map_destination_requested.emit(map_id, label)


func _emit_latest_local_target(target_id: String) -> void:
	var targets_value = _view_state.get("localTargets", [])
	if not (targets_value is Array):
		return
	for value in targets_value as Array:
		if not (value is Dictionary):
			continue
		var target := value as Dictionary
		if str(target.get("id", target.get("label", ""))) == target_id:
			route_target_requested.emit(target.duplicate(true))
			return


func _emit_latest_map_destination(region_id: String, map_id: String) -> void:
	var point := _world_map_point_state(region_id, map_id)
	if point.is_empty():
		return
	var label := str(point.get("label", map_id))
	map_destination_requested.emit(map_id, label)


func _world_map_point_state(region_id: String, map_id: String) -> Dictionary:
	if region_id == "" or map_id == "":
		return {}
	var current_region_value = _view_state.get("currentRegion", {})
	if (
		current_region_value is Dictionary
		and str((current_region_value as Dictionary).get("id", ""))
			== region_id
	):
		var current_point := _region_point_for_map(
			current_region_value as Dictionary,
			map_id
		)
		if not current_point.is_empty():
			return current_point
	var regions_value = _view_state.get("worldRegions", [])
	if regions_value is Array:
		for region_value in regions_value as Array:
			if not (region_value is Dictionary):
				continue
			if str((region_value as Dictionary).get("id", "")) != region_id:
				continue
			var point := _region_point_for_map(
				region_value as Dictionary,
				map_id
			)
			if not point.is_empty():
				return point
			return {}
	return {}


func _region_point_for_map(region: Dictionary, map_id: String) -> Dictionary:
	var points_value = region.get("points", [])
	if points_value is Array:
		for value in points_value as Array:
			if (
				value is Dictionary
				and str((value as Dictionary).get("mapId", "")) == map_id
			):
				return (value as Dictionary).duplicate(true)
	return {}


func _world_region_state(region_id: String) -> Dictionary:
	var regions_value = _view_state.get("worldRegions", [])
	if regions_value is Array:
		for value in regions_value as Array:
			if value is Dictionary and str((value as Dictionary).get("id", "")) == region_id:
				return value as Dictionary
	return {}


func _on_panel_resized() -> void:
	call_deferred("_refresh_map_marker_positions")


func _clear_children(container: Node) -> void:
	if container == null:
		return
	for child in container.get_children():
		container.remove_child(child)
		if not child.is_queued_for_deletion():
			child.queue_free()
