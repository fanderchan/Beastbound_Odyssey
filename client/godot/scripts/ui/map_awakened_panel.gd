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
var _world_atlas_texture_rect: TextureRect
var _world_detail_title: Label
var _world_detail_meta: Label
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


func apply_view_state(
	state: Dictionary,
	prepared_visual: Dictionary,
	world_bounds: Rect2,
	fallback_texture: Texture2D
) -> void:
	_view_state = state.duplicate(true)
	_map_grid_size = state.get("mapGrid", Vector2i.ZERO) as Vector2i
	var player_cell := state.get("playerCell", Vector2i.ZERO) as Vector2i
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
	_populate_local_sidebar()
	_configure_local_map(prepared_visual, world_bounds, fallback_texture)
	_populate_world_regions()
	if _selected_world_region_id == "":
		_selected_world_region_id = str(current_region.get("id", ""))
	_render_selected_world_region()
	show_mode(MapAwakenedPresenter.MODE_LOCAL)
	call_deferred("_refresh_map_marker_positions")


func reset_to_local_view() -> void:
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


func _build_ui() -> void:
	var outer_margin := MarginContainer.new()
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
	var detail_column := VBoxContainer.new()
	detail_column.add_theme_constant_override("separation", 8)
	detail_panel.add_child(detail_column)
	_world_detail_title = Label.new()
	_world_detail_title.custom_minimum_size = Vector2(0.0, 44.0)
	MapAwakenedVisualSkin.apply_heading(_world_detail_title, 22)
	detail_column.add_child(_world_detail_title)
	_world_detail_meta = Label.new()
	_world_detail_meta.custom_minimum_size = Vector2(0.0, 54.0)
	_world_detail_meta.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	MapAwakenedVisualSkin.apply_label(_world_detail_meta, 15, true)
	detail_column.add_child(_world_detail_meta)
	var point_scroll := ScrollContainer.new()
	point_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	point_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	point_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	detail_column.add_child(point_scroll)
	_world_detail_points = VBoxContainer.new()
	_world_detail_points.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_world_detail_points.add_theme_constant_override("separation", 7)
	point_scroll.add_child(_world_detail_points)
	_world_entry_route_button = Button.new()
	_world_entry_route_button.text = "前往区域入口"
	MapAwakenedVisualSkin.apply_list_button(_world_entry_route_button, "map", true)
	_world_entry_route_button.pressed.connect(_on_world_entry_route_pressed)
	detail_column.add_child(_world_entry_route_button)


func _populate_local_sidebar() -> void:
	_clear_children(marker_container)
	marker_buttons.clear()
	var nearby_heading := Label.new()
	nearby_heading.text = "附近目标"
	nearby_heading.custom_minimum_size = Vector2(0.0, 34.0)
	MapAwakenedVisualSkin.apply_heading(nearby_heading, 16)
	marker_container.add_child(nearby_heading)
	var local_targets_value = _view_state.get("localTargets", [])
	if local_targets_value is Array:
		for value in local_targets_value as Array:
			if not (value is Dictionary):
				continue
			var target := (value as Dictionary).duplicate(true)
			var button := Button.new()
			button.text = str(target.get("displayText", target.get("label", "目标")))
			button.clip_text = true
			button.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
			MapAwakenedVisualSkin.apply_list_button(
				button,
				MapAwakenedVisualSkin.icon_for_target(target)
			)
			button.tooltip_text = "%s · 点击自动寻路" % str(target.get("label", "目标"))
			button.pressed.connect(func() -> void:
				route_target_requested.emit(target)
			)
			marker_container.add_child(button)
			marker_buttons[str(target.get("id", target.get("label", "")))] = button
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
	for value in points_value as Array:
		if not (value is Dictionary):
			continue
		var point := value as Dictionary
		var map_id := str(point.get("mapId", ""))
		if map_id == "":
			continue
		var button := Button.new()
		button.text = "%s  %s" % [str(point.get("label", map_id)), str(point.get("meta", ""))]
		button.disabled = bool(point.get("current", false))
		MapAwakenedVisualSkin.apply_list_button(button, "map", bool(point.get("current", false)))
		button.pressed.connect(func() -> void:
			map_destination_requested.emit(map_id, str(point.get("label", map_id)))
		)
		marker_container.add_child(button)


func _configure_local_map(
	prepared_visual: Dictionary,
	world_bounds: Rect2,
	fallback_texture: Texture2D
) -> void:
	_using_prepared_visual = (
		bool(prepared_visual.get("active", false))
		and world_bounds.size.x > 0.0
		and world_bounds.size.y > 0.0
	)
	if _using_prepared_visual:
		_map_canvas.configure(prepared_visual, world_bounds, Vector2(MAP_VIEWPORT_SIZE))
		legacy_texture_rect.texture = _map_viewport.get_texture()
		_map_viewport.render_target_update_mode = SubViewport.UPDATE_ONCE
	else:
		legacy_texture_rect.texture = fallback_texture
	_empty_local_label.visible = legacy_texture_rect.texture == null
	_build_map_markers()


func _build_map_markers() -> void:
	_clear_children(_map_marker_overlay)
	_marker_specs.clear()
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
		for value in local_targets_value as Array:
			if not (value is Dictionary):
				continue
			var target := (value as Dictionary).duplicate(true)
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
				route_target_requested.emit(target)
			)
			_map_marker_overlay.add_child(marker_button)
			_marker_specs.append({"button": marker_button, "target": target})
			visible_target_count += 1


func _refresh_map_marker_positions() -> void:
	if legacy_texture_rect == null or legacy_texture_rect.size.x <= 1.0 or legacy_texture_rect.size.y <= 1.0:
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
			_selected_world_region_id = region_id
			_render_selected_world_region()
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
	for value in points_value as Array:
		if not (value is Dictionary):
			continue
		var point := value as Dictionary
		var map_id := str(point.get("mapId", ""))
		var button := Button.new()
		button.text = "%s\n%s" % [str(point.get("label", map_id)), str(point.get("meta", "自动寻路"))]
		button.disabled = bool(point.get("current", false))
		MapAwakenedVisualSkin.apply_list_button(button, "map", bool(point.get("current", false)))
		button.pressed.connect(func() -> void:
			map_destination_requested.emit(map_id, str(point.get("label", map_id)))
		)
		_world_detail_points.add_child(button)
		_world_route_buttons[map_id] = button
	for region_id_value in _world_region_buttons.keys():
		var region_button := _world_region_buttons.get(region_id_value) as Button
		if region_button != null:
			region_button.set_pressed_no_signal(str(region_id_value) == _selected_world_region_id)


func _on_world_entry_route_pressed() -> void:
	var region := _world_region_state(_selected_world_region_id)
	if region.is_empty():
		return
	var map_id := str(region.get("entryMapId", ""))
	if map_id != "":
		map_destination_requested.emit(map_id, str(region.get("entryMapName", region.get("label", map_id))))


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
		child.queue_free()
