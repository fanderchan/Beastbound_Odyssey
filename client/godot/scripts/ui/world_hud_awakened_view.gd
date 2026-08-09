extends Control
class_name WorldHudAwakenedView

signal task_entry_requested(quest_id: String)

const WorldHudAwakenedVisualSkin := preload(
	"res://scripts/ui/world_hud_awakened_visual_skin.gd"
)
const WorldHudMinimapRenderCanvas := preload(
	"res://scripts/ui/world_hud_minimap_render_canvas.gd"
)

signal collapsed_change_requested(collapsed: bool)

const REFERENCE_SIZE := Vector2(1280.0, 720.0)
const SIDE_TAB_TASK := "task"
const SIDE_TAB_PARTY := "party"
const REQUIRED_ENTRY_IDS := [
	"hang",
	"character",
	"backpack",
	"equipment",
	"pet",
	"codex",
	"quest",
	"map",
	"chat",
	"party",
	"family",
	"market",
	"mailbox",
	"auto",
	"account",
	"gm",
]
const BUTTON_ALIASES := {
	"hang": ["hang", "hangButton", "hang_button", "stopButton", "stop_button"],
	"character": [
		"character",
		"player",
		"characterButton",
		"character_button",
		"playerStatusMenuButton",
		"player_status_menu_button",
	],
	"backpack": [
		"backpack",
		"backpackButton",
		"backpack_button",
		"bagMenuButton",
		"bag_menu_button",
	],
	"equipment": [
		"equipment",
		"equipmentButton",
		"equipment_button",
		"equipmentMenuButton",
		"equipment_menu_button",
	],
	"pet": ["pet", "petButton", "pet_button", "petMenuButton", "pet_menu_button"],
	"codex": [
		"codex",
		"codexButton",
		"codex_button",
		"codexMenuButton",
		"codex_menu_button",
	],
	"quest": [
		"quest",
		"task",
		"questButton",
		"quest_button",
		"questMenuButton",
		"quest_menu_button",
	],
	"map": ["map", "mapButton", "map_button", "mapMenuButton", "map_menu_button"],
	"chat": [
		"chat",
		"chatButton",
		"chat_button",
		"chatMenuButton",
		"chat_menu_button",
	],
	"party": [
		"party",
		"partyButton",
		"party_button",
		"partyMenuButton",
		"party_menu_button",
	],
	"family": [
		"family",
		"familyButton",
		"family_button",
		"familyMenuButton",
		"family_menu_button",
	],
	"market": [
		"market",
		"marketButton",
		"market_button",
		"marketMenuButton",
		"market_menu_button",
	],
	"mailbox": [
		"mailbox",
		"mailboxButton",
		"mailbox_button",
		"mailboxMenuButton",
		"mailbox_menu_button",
	],
	"auto": [
		"auto",
		"autoButton",
		"auto_button",
		"autoSettingsMenuButton",
		"auto_settings_menu_button",
	],
	"account": [
		"account",
		"accountButton",
		"account_button",
		"accountMenuButton",
		"account_menu_button",
	],
	"gm": ["gm", "gmButton", "gm_button", "qaMenuButton", "qa_menu_button"],
}

var _built := false
var _mounted := false
var _collapsed := false
var _more_drawer_open := false
var _active_side_tab := SIDE_TAB_TASK
var _viewport_size := REFERENCE_SIZE
var _layout_state: Dictionary = {}

var _top_panel: Control
var _side_panel: Control
var _message_panel: Control
var _action_bar: Control
var _status_label: Label
var _version_label: Label
var _detail_label: Label
var _task_route_button: Button
var _battle_log_label: RichTextLabel
var _collapse_button: Button
var _restore_button: Button
var _more_button: Button
var _more_drawer: Panel

var _top_surface: Control
var _side_surface: Control
var _dock_surface: Control
var _top_shortcut_row: HBoxContainer
var _top_secondary_row: HBoxContainer
var _left_shortcut_column: VBoxContainer
var _drawer_grid: HBoxContainer
var _bottom_row: HBoxContainer
var _message_surface: Control
var _chat_surface: Panel
var _message_action_row: HBoxContainer
var _message_expand_button: Button
var _message_clear_button: Button
var _task_body_panel: Panel
var _task_entries_scroll: ScrollContainer
var _task_entries_container: VBoxContainer
var _task_entries_signature := ""
var _floating_mailbox_slot: Control
var _more_caption_label: Label
var _map_name_label: Label
var _map_cell_label: Label
var _player_name_label: Label
var _pet_name_label: Label
var _player_portrait_button: Button
var _pet_portrait_button: Button
var _side_title_label: Label
var _clock_label: Label
var _experience_label: Label
var _entries: Dictionary = {}
var _entry_slots: Dictionary = {}
var _proxy_buttons: Dictionary = {}
var _proxy_slots: Dictionary = {}
var _minimap_viewport: SubViewport
var _minimap_canvas: WorldHudMinimapRenderCanvas
var _minimap_grid_size := Vector2i.ZERO
var _minimap_configure_revision := 0
var _last_apply_minimap_configure_revision := -1
var _mount_snapshot: Array[Dictionary] = []
var _mount_root_child_ids: Dictionary = {}


func _ready() -> void:
	_ensure_built()


func mount_existing_controls(controls: Dictionary) -> Dictionary:
	_ensure_built()
	if _mounted:
		return {
			"ok": true,
			"alreadyMounted": true,
			"missingIds": [],
		}
	_entries.clear()
	_mount_snapshot.clear()
	_mount_root_child_ids.clear()

	_top_panel = _control_from(controls, ["topPanel", "top_panel"]) as Control
	_side_panel = _control_from(controls, ["sidePanel", "side_panel"]) as Control
	_message_panel = _control_from(
		controls,
		["battleMessagePanel", "battle_message_panel", "messagePanel", "message_panel"]
	) as Control
	_action_bar = _control_from(controls, ["actionBar", "action_bar"]) as Control
	_status_label = _control_from(controls, ["statusLabel", "status_label"]) as Label
	_version_label = _control_from(controls, ["versionLabel", "version_label"]) as Label
	_detail_label = _control_from(controls, ["detailLabel", "detail_label"]) as Label
	_task_route_button = _control_from(
		controls,
		["taskRouteButton", "task_route_button"]
	) as Button
	_battle_log_label = _control_from(
		controls,
		["battleLogLabel", "battle_log_label", "battleLog", "battle_log"]
	) as RichTextLabel
	_message_expand_button = _control_from(
		controls,
		[
			"battleMessageExpandButton",
			"battle_message_expand_button",
			"messageExpandButton",
			"message_expand_button",
		]
	) as Button
	_message_clear_button = _control_from(
		controls,
		[
			"battleMessageClearButton",
			"battle_message_clear_button",
			"messageClearButton",
			"message_clear_button",
		]
	) as Button
	_collapse_button = _control_from(
		controls,
		[
			"actionBarCollapseButton",
			"action_bar_collapse_button",
			"collapseButton",
			"collapse_button",
		]
	) as Button

	var button_source_value = controls.get("buttons", {})
	var button_source := (
		button_source_value as Dictionary
		if button_source_value is Dictionary
		else {}
	)
	for entry_id in REQUIRED_ENTRY_IDS:
		var button := _button_for_entry(controls, button_source, entry_id)
		if button != null:
			_entries[entry_id] = button

	var missing_ids: Array[String] = []
	if _top_panel == null:
		missing_ids.append("topPanel")
	if _side_panel == null:
		missing_ids.append("sidePanel")
	if _message_panel == null:
		missing_ids.append("battleMessagePanel")
	if _action_bar == null:
		missing_ids.append("actionBar")
	if _message_expand_button == null:
		missing_ids.append("battleMessageExpandButton")
	if _message_clear_button == null:
		missing_ids.append("battleMessageClearButton")
	if _collapse_button == null:
		missing_ids.append("actionBarCollapseButton")
	for entry_id in REQUIRED_ENTRY_IDS:
		if not _entries.has(entry_id):
			missing_ids.append("button:%s" % entry_id)
	if not missing_ids.is_empty():
		return {
			"ok": false,
			"alreadyMounted": false,
			"missingIds": missing_ids,
		}

	_capture_mount_snapshot()
	_mount_blocker_roots()
	_build_top_panel()
	_build_side_panel()
	_build_message_panel()
	_build_action_bar()
	_mounted = true
	apply_location("当前区域", Vector2i.ZERO)
	apply_task_text(_detail_label.text if _detail_label != null else "暂无追踪任务")
	apply_layout(_viewport_size, {})
	return {
		"ok": true,
		"alreadyMounted": false,
		"missingIds": [],
	}


func rollback_mount() -> Dictionary:
	if _mount_snapshot.is_empty():
		return {
			"ok": not _mounted,
			"alreadyRolledBack": not _mounted,
			"restoredCount": 0,
			"errors": [] if not _mounted else ["mount snapshot is unavailable"],
		}
	var errors: Array[String] = []
	var ordered: Array[Dictionary] = _mount_snapshot.duplicate()
	ordered.sort_custom(func(left: Dictionary, right: Dictionary) -> bool:
		return int(left.get("depth", 0)) < int(right.get("depth", 0))
	)
	for record in ordered:
		var item = record.get("node")
		if not (item is CanvasItem) or not is_instance_valid(item):
			errors.append("mounted control is no longer valid")
			continue
		var canvas_item := item as CanvasItem
		var original_parent = record.get("parent")
		if original_parent != null and not is_instance_valid(original_parent):
			errors.append("original parent is no longer valid: %s" % str(record.get("name", "")))
			continue
		if canvas_item.get_parent() == original_parent:
			continue
		if original_parent == null:
			var current_parent := canvas_item.get_parent()
			if current_parent != null:
				current_parent.remove_child(canvas_item)
		elif canvas_item.get_parent() == null:
			(original_parent as Node).add_child(canvas_item)
		else:
			canvas_item.reparent(original_parent as Node, false)
	_restore_mount_child_indices(ordered, errors)
	var restored_count := 0
	for record in ordered:
		var item = record.get("node")
		if not (item is CanvasItem) or not is_instance_valid(item):
			continue
		_restore_mount_item_semantics(item as CanvasItem, record, errors)
		restored_count += 1
	for record in ordered:
		var item = record.get("node")
		if not (item is CanvasItem) or not is_instance_valid(item):
			continue
		_restore_mount_item_geometry(item as CanvasItem, record)
	if errors.is_empty():
		_remove_mount_artifacts()
		_mounted = false
		_mount_snapshot.clear()
		_mount_root_child_ids.clear()
	return {
		"ok": errors.is_empty(),
		"alreadyRolledBack": false,
		"restoredCount": restored_count,
		"errors": errors,
	}


func apply_layout(viewport_size: Vector2, state: Dictionary) -> void:
	_ensure_built()
	_viewport_size = Vector2(
		maxf(1.0, viewport_size.x),
		maxf(1.0, viewport_size.y)
	)
	_layout_state = state.duplicate(true)
	if state.has("collapsed"):
		_collapsed = bool(state.get("collapsed", false))
		if _collapsed:
			_more_drawer_open = false
	position = Vector2.ZERO
	size = _viewport_size

	if not _mounted:
		return
	var scale_x := _viewport_size.x / REFERENCE_SIZE.x
	var scale_y := _viewport_size.y / REFERENCE_SIZE.y
	var top_rect := Rect2(
		Vector2(80.0 * scale_x, 0.0),
		Vector2(752.0 * scale_x, 170.0 * scale_y)
	)
	var side_rect := Rect2(
		Vector2(999.0 * scale_x, 13.0 * scale_y),
		Vector2(206.0 * scale_x, 465.0 * scale_y)
	)
	var message_rect := Rect2(
		Vector2(57.0 * scale_x, 469.0 * scale_y),
		Vector2(348.0 * scale_x, 233.0 * scale_y)
	)
	var action_rect := Rect2(
		Vector2(599.0 * scale_x, 530.0 * scale_y),
		Vector2(597.0 * scale_x, 181.0 * scale_y)
	)
	var message_expanded := _state_bool(
		state,
		["messageExpanded", "message_expanded"],
		false
	)
	if message_expanded:
		message_rect = Rect2(
			Vector2(24.0 * scale_x, 350.0 * scale_y),
			Vector2(560.0 * scale_x, 352.0 * scale_y)
		)
	_top_panel.position = top_rect.position
	_top_panel.size = top_rect.size
	_side_panel.position = side_rect.position
	_side_panel.size = side_rect.size
	_message_panel.position = message_rect.position
	_message_panel.size = message_rect.size
	if _collapsed:
		_action_bar.position = Vector2(1127.0 * scale_x, 616.0 * scale_y)
		_action_bar.size = Vector2(69.0 * scale_x, 95.0 * scale_y)
	else:
		_action_bar.position = action_rect.position
		_action_bar.size = action_rect.size
	_layout_top_contents(top_rect.size.x, top_rect.size.y)
	_layout_side_contents(side_rect.size.x, side_rect.size.y)
	_layout_message_contents(message_rect.size, message_expanded)
	_layout_action_contents(_action_bar.size)
	_apply_visibility_contract()


func apply_view_state(state: Dictionary) -> void:
	_ensure_built()
	if not _mounted:
		return
	_last_apply_minimap_configure_revision = _minimap_configure_revision
	state = _flatten_presenter_state(state)
	var player_value = state.get("player", state.get("character", {}))
	var player := player_value as Dictionary if player_value is Dictionary else {}
	var pet_value = state.get(
		"battlePet",
		state.get(
			"battle_pet",
			state.get(
				"activeBattlePet",
				state.get(
					"active_battle_pet",
					state.get("activePet", state.get("pet", {}))
				)
			)
		)
	)
	var pet := pet_value as Dictionary if pet_value is Dictionary else {}
	var player_name := str(
		state.get(
			"playerName",
			state.get("player_name", player.get("name", player.get("displayName", "角色")))
		)
	).strip_edges()
	var pet_name := str(
		state.get(
			"petName",
			state.get("pet_name", pet.get("name", pet.get("displayName", "战宠")))
		)
	).strip_edges()
	if player_name == "":
		player_name = "角色"
	if pet_name == "":
		pet_name = "战宠"
	var player_level := maxi(0, int(player.get("level", 0)))
	var pet_level := maxi(0, int(pet.get("level", 0)))
	_player_name_label.text = (
		"%s  Lv%d" % [player_name, player_level]
		if player_level > 0
		else player_name
	)
	_pet_name_label.text = (
		"%s  Lv%d" % [pet_name, pet_level]
		if pet_level > 0
		else pet_name
	)
	if _clock_label != null:
		var now := Time.get_time_dict_from_system()
		_clock_label.text = "%02d:%02d" % [int(now.get("hour", 0)), int(now.get("minute", 0))]
	if _experience_label != null:
		var current_exp := maxi(0, int(player.get("exp", 0)))
		var next_exp := maxi(0, int(player.get("nextExp", player.get("next_exp", 0))))
		_experience_label.text = (
			"经验 %.2f%%" % (float(current_exp) * 100.0 / float(next_exp))
			if next_exp > 0
			else ""
		)

	var player_texture = state.get(
		"playerPortraitTexture",
		state.get(
			"playerPortraitTexturePath",
			state.get(
				"player_portrait_texture_path",
				player.get("portraitTexture", player.get("portraitTexturePath", null))
			)
		)
	)
	var pet_texture = state.get(
		"petPortraitTexture",
		state.get(
			"petPortraitTexturePath",
			state.get(
				"pet_portrait_texture_path",
				pet.get("portraitTexture", pet.get("portraitTexturePath", null))
			)
		)
	)
	_apply_portrait("character", player_texture, player_name)
	_apply_portrait("pet", pet_texture, pet_name)
	var minimap_state_value = state.get("minimap", {})
	var minimap_state := (
		minimap_state_value as Dictionary
		if minimap_state_value is Dictionary
		else {}
	)
	var minimap_value = minimap_state.get(
		"texture",
		state.get(
			"minimapTexture",
			state.get("minimap_texture", state.get("minimapTexturePath", null))
		)
	)
	var minimap_texture_rect := find_child(
		"WorldHudMinimapTexture",
		true,
		false
	) as TextureRect
	var minimap_texture := WorldHudAwakenedVisualSkin.texture_from_path(minimap_value)
	var prepared_minimap_available := (
		_minimap_canvas != null and _minimap_canvas.has_visual()
	)
	if minimap_texture_rect != null and minimap_texture != null:
		minimap_texture_rect.texture = minimap_texture
	var minimap_available := prepared_minimap_available or minimap_texture != null
	var map_hotspot := entry_button("map")
	if map_hotspot != null:
		map_hotspot.icon = (
			null
			if minimap_available
			else WorldHudAwakenedVisualSkin.texture_for_entry("map")
		)
	var minimap_marker := find_child(
		"WorldHudMinimapPlayerMarker",
		true,
		false
	) as Label
	if minimap_marker != null:
		var world_position_value = state.get(
			"playerWorldPosition",
			state.get("player_world_position", {})
		)
		var world_position_state := (
			world_position_value as Dictionary
			if world_position_value is Dictionary
			else {}
		)
		var grid := _cell_coordinates(minimap_state.get("grid", _minimap_grid_size))
		var cell_value = state.get(
			"playerCell",
			state.get("player_cell", state.get("cell", Vector2i.ZERO))
		)
		var marker_cell := _cell_coordinates(cell_value)
		var marker_available := bool(
			minimap_state.get("available", minimap_available)
		) and minimap_available and (
			bool(world_position_state.get("available", false))
			or (grid.x > 1 and grid.y > 1)
		)
		minimap_marker.visible = marker_available
		if marker_available:
			minimap_marker.size = Vector2(18.0, 18.0)
			if (
				bool(world_position_state.get("available", false))
				and _minimap_canvas != null
			):
				var projected := _minimap_canvas.project_world_position(Vector2(
					float(world_position_state.get("x", 0.0)),
					float(world_position_state.get("y", 0.0))
				))
				minimap_marker.position = (
					Vector2(4.0, 4.0)
					+ projected * (99.0 / 256.0)
					- minimap_marker.size * 0.5
				)
			else:
				var normalized_x := clampf(
					float(marker_cell.x) / float(grid.x - 1),
					0.0,
					1.0
				)
				var normalized_y := clampf(
					float(marker_cell.y) / float(grid.y - 1),
					0.0,
					1.0
				)
				minimap_marker.position = Vector2(
					4.0 + normalized_x * 82.0,
					4.0 + normalized_y * 82.0
				)

	if state.has("statusText") or state.has("status_text"):
		_status_label.text = str(state.get("statusText", state.get("status_text", "")))
	if state.has("versionText") or state.has("version_text"):
		_version_label.text = str(state.get("versionText", state.get("version_text", "")))
	if state.has("taskText") or state.has("task_text"):
		apply_task_text(str(state.get("taskText", state.get("task_text", ""))))
	if state.has("locationName") or state.has("location_name") or state.has("mapName"):
		var location_name := str(
			state.get(
				"locationName",
				state.get("location_name", state.get("mapName", state.get("map_name", "")))
			)
		)
		var location_cell = state.get(
			"cell",
			state.get(
				"playerCell",
				state.get(
					"player_cell",
					{
						"x": int(state.get("cellX", state.get("cell_x", 0))),
						"y": int(state.get("cellY", state.get("cell_y", 0))),
					}
				)
			)
		)
		apply_location(location_name, location_cell)
	if state.has("activeSideTab") or state.has("active_side_tab"):
		var requested_tab := str(
			state.get("activeSideTab", state.get("active_side_tab", SIDE_TAB_TASK))
		).strip_edges().to_lower()
		if requested_tab in [SIDE_TAB_TASK, SIDE_TAB_PARTY]:
			_active_side_tab = requested_tab
			_refresh_side_tabs()
	if state.has("collapsed"):
		set_collapsed(bool(state.get("collapsed", false)))
	if state.has("moreDrawerOpen") or state.has("more_drawer_open"):
		_set_more_drawer_open(bool(
			state.get("moreDrawerOpen", state.get("more_drawer_open", false))
		))
	_apply_menu_gates(state)
	if state.has("layout") and state.get("layout") is Dictionary:
		apply_layout(_viewport_size, state.get("layout") as Dictionary)


func apply_location(location_name: String, cell) -> void:
	_ensure_built()
	if not _mounted:
		return
	var clean_name := location_name.strip_edges()
	if clean_name == "":
		clean_name = "当前区域"
	var coordinates := _cell_coordinates(cell)
	_map_name_label.text = clean_name
	_map_cell_label.text = "(%d,%d)" % [coordinates.x, coordinates.y]
	var map_button := entry_button("map")
	if map_button != null:
		map_button.tooltip_text = "%s  %d，%d" % [
			clean_name,
			coordinates.x,
			coordinates.y,
		]


func configure_minimap(
	prepared_visual: Dictionary,
	world_bounds: Rect2,
	grid_size: Vector2i
) -> void:
	_ensure_built()
	_minimap_grid_size = grid_size
	if _minimap_viewport == null or _minimap_canvas == null:
		return
	_minimap_canvas.configure(prepared_visual, world_bounds, Vector2(256.0, 256.0))
	_minimap_configure_revision += 1
	var minimap_texture_rect := find_child(
		"WorldHudMinimapTexture",
		true,
		false
	) as TextureRect
	if minimap_texture_rect != null:
		minimap_texture_rect.texture = _minimap_viewport.get_texture()
	_minimap_viewport.render_target_update_mode = SubViewport.UPDATE_ONCE
	var map_hotspot := entry_button("map")
	if map_hotspot != null:
		map_hotspot.icon = null


func debug_minimap_snapshot() -> Dictionary:
	return {
		"configureRevision": _minimap_configure_revision,
		"lastApplyConfigureRevision": _last_apply_minimap_configure_revision,
		"gridSize": _minimap_grid_size,
		"hasVisual": _minimap_canvas != null and _minimap_canvas.has_visual(),
	}


func apply_task_text(text: String) -> void:
	_ensure_built()
	if not _mounted or _detail_label == null:
		return
	var clean_text := text.strip_edges()
	_detail_label.text = clean_text if clean_text != "" else "暂无追踪任务"


func apply_task_entries(entries: Array[Dictionary]) -> void:
	_ensure_built()
	if not _mounted or _task_entries_container == null:
		return
	var signature_parts: Array[String] = []
	for entry in entries:
		signature_parts.append("%s:%s:%s:%s" % [
			str(entry.get("questId", "")),
			str(entry.get("categoryId", "")),
			str(entry.get("statusText", "")),
			str(entry.get("objectiveText", "")),
		])
	var signature := "|".join(signature_parts)
	if signature == _task_entries_signature:
		return
	_task_entries_signature = signature
	for child in _task_entries_container.get_children():
		_task_entries_container.remove_child(child)
		child.queue_free()
	if entries.is_empty():
		_task_entries_scroll.visible = false
		if _detail_label != null:
			_detail_label.visible = true
		return
	_task_entries_scroll.visible = true
	if _detail_label != null:
		_detail_label.visible = false
	for entry in entries:
		_task_entries_container.add_child(_task_entry_button(entry))


func task_entry_count() -> int:
	return (
		_task_entries_container.get_child_count()
		if _task_entries_container != null
		else 0
	)


func _task_entry_button(entry: Dictionary) -> Button:
	var quest_id := str(entry.get("questId", ""))
	var accent := _task_category_color(str(entry.get("categoryId", "main")))
	var active := bool(entry.get("active", false))
	var button := Button.new()
	button.name = "WorldHudTask_%s" % quest_id
	button.text = ""
	button.custom_minimum_size = Vector2(0.0, 48.0)
	button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	button.action_mode = BaseButton.ACTION_MODE_BUTTON_RELEASE
	button.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	button.add_theme_stylebox_override(
		"normal",
		_task_entry_style(accent, active, false)
	)
	button.add_theme_stylebox_override(
		"hover",
		_task_entry_style(accent, true, true)
	)
	button.add_theme_stylebox_override(
		"pressed",
		_task_entry_style(accent, true, true)
	)
	button.add_theme_stylebox_override(
		"focus",
		_task_entry_style(accent, active, true)
	)
	button.tooltip_text = "%s：%s" % [
		str(entry.get("title", "任务")),
		str(entry.get("objectiveText", "")),
	]
	button.pressed.connect(func() -> void:
		task_entry_requested.emit(quest_id)
	)

	var title := Label.new()
	title.anchor_right = 1.0
	title.offset_left = 8.0
	title.offset_top = 2.0
	title.offset_right = -8.0
	title.offset_bottom = 24.0
	title.text = "[%s] %s" % [
		str(entry.get("categoryLabel", "主线")),
		str(entry.get("title", "任务")),
	]
	title.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	title.mouse_filter = Control.MOUSE_FILTER_IGNORE
	WorldHudAwakenedVisualSkin.apply_heading(title, 14)
	title.add_theme_color_override("font_color", accent)
	button.add_child(title)

	var objective := Label.new()
	objective.anchor_right = 1.0
	objective.offset_left = 8.0
	objective.offset_top = 24.0
	objective.offset_right = -8.0
	objective.offset_bottom = 43.0
	objective.text = str(entry.get("objectiveText", ""))
	objective.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	objective.mouse_filter = Control.MOUSE_FILTER_IGNORE
	WorldHudAwakenedVisualSkin.apply_label(objective, 12, true)
	button.add_child(objective)
	return button


func _task_category_color(category_id: String) -> Color:
	match category_id:
		"classic":
			return Color(0.48, 0.91, 0.34, 1.0)
		"experience":
			return Color(0.23, 0.83, 0.95, 1.0)
		"side":
			return Color(0.77, 0.56, 0.94, 1.0)
	return Color(1.0, 0.83, 0.30, 1.0)


func _task_entry_style(accent: Color, active: bool, hover: bool) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = (
		Color(0.13, 0.11, 0.075, 0.93)
		if active
		else Color(0.075, 0.064, 0.049, 0.88)
	)
	if hover:
		style.bg_color = Color(0.17, 0.13, 0.075, 0.97)
	style.border_color = accent.darkened(0.22)
	style.border_width_left = 3
	style.border_width_top = 1
	style.border_width_right = 1
	style.border_width_bottom = 1
	style.set_corner_radius_all(5)
	return style


func set_collapsed(collapsed: bool) -> void:
	_ensure_built()
	_layout_state["collapsed"] = collapsed
	if _collapsed == collapsed:
		return
	_collapsed = collapsed
	if _collapsed:
		_more_drawer_open = false
	if _mounted:
		apply_layout(_viewport_size, _layout_state)


func is_collapsed() -> bool:
	return _collapsed


func entry_button(entry_id: String) -> Button:
	var normalized := _normalized_entry_id(entry_id)
	return _entries.get(normalized) as Button


func layout_contract() -> Dictionary:
	var entry_rects: Dictionary = {}
	for entry_id in _entries:
		var button := _entries.get(entry_id) as Button
		if button != null:
			entry_rects[entry_id] = _rect_in_view(button)
	return {
		"referenceSize": REFERENCE_SIZE,
		"viewportSize": _viewport_size,
		"mounted": _mounted,
		"collapsed": _collapsed,
		"moreDrawerOpen": _more_drawer_open,
		"activeSideTab": _active_side_tab,
		"topPanelRect": _rect_in_view(_top_panel),
		"sidePanelRect": _rect_in_view(_side_panel),
		"messagePanelRect": _rect_in_view(_message_panel),
		"actionBarRect": _rect_in_view(_action_bar),
		"moreDrawerRect": _rect_in_view(_more_drawer),
		"entryRects": entry_rects,
		"stableNodes": {
			"moreButton": "WorldHudMoreButton",
			"moreDrawer": "WorldHudMoreDrawer",
			"collapseButton": "WorldHudCollapseButton",
			"restoreButton": "WorldHudRestoreButton",
			"taskTab": "WorldHudTaskTab",
			"partyTab": "WorldHudPartyTab",
			"messageActions": "WorldHudMessageActions",
			"messageExpandButton": "WorldHudMessageExpandButton",
			"messageClearButton": "WorldHudMessageClearButton",
		},
	}


func _ensure_built() -> void:
	if _built:
		return
	_built = true
	name = "WorldHudAwakenedView"
	anchor_left = 0.0
	anchor_top = 0.0
	anchor_right = 0.0
	anchor_bottom = 0.0
	custom_minimum_size = REFERENCE_SIZE
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	clip_contents = false


func _mount_blocker_roots() -> void:
	for blocker in [_top_panel, _side_panel, _message_panel, _action_bar]:
		_reparent_control(blocker, self)
		blocker.mouse_filter = Control.MOUSE_FILTER_STOP
		blocker.clip_contents = false
	_top_panel.add_theme_stylebox_override(
		"panel",
		WorldHudAwakenedVisualSkin.blocker_panel_style("top")
	)
	_side_panel.add_theme_stylebox_override(
		"panel",
		WorldHudAwakenedVisualSkin.blocker_panel_style("side")
	)
	_message_panel.add_theme_stylebox_override(
		"panel",
		WorldHudAwakenedVisualSkin.blocker_panel_style("message")
	)
	_action_bar.add_theme_stylebox_override(
		"panel",
		WorldHudAwakenedVisualSkin.blocker_panel_style("dock")
	)


func _build_top_panel() -> void:
	_hide_existing_children(_top_panel)
	_top_surface = Control.new()
	_top_surface.name = "WorldHudTopSurface"
	_top_surface.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_top_surface.clip_contents = false
	_top_panel.add_child(_top_surface)

	var minimap_card := Panel.new()
	minimap_card.name = "WorldHudMinimapCard"
	minimap_card.mouse_filter = Control.MOUSE_FILTER_PASS
	minimap_card.clip_contents = true
	minimap_card.add_theme_stylebox_override(
		"panel",
		WorldHudAwakenedVisualSkin.minimap_card_style()
	)
	_top_surface.add_child(minimap_card)
	minimap_card.set_meta("world_hud_layout_role", "minimap")
	var minimap_texture := TextureRect.new()
	minimap_texture.name = "WorldHudMinimapTexture"
	minimap_texture.mouse_filter = Control.MOUSE_FILTER_IGNORE
	minimap_texture.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	minimap_texture.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	var circle_shader := Shader.new()
	circle_shader.code = (
		"shader_type canvas_item;\n"
		+ "void fragment(){\n"
		+ "  vec2 p = UV - vec2(0.5);\n"
		+ "  vec4 c = texture(TEXTURE, UV);\n"
		+ "  float edge = 1.0 - smoothstep(0.47, 0.5, length(p));\n"
		+ "  COLOR = vec4(c.rgb, c.a * edge);\n"
		+ "}\n"
	)
	var circle_material := ShaderMaterial.new()
	circle_material.shader = circle_shader
	minimap_texture.material = circle_material
	minimap_card.add_child(minimap_texture)
	_minimap_viewport = SubViewport.new()
	_minimap_viewport.name = "WorldHudMinimapViewport"
	_minimap_viewport.size = Vector2i(256, 256)
	_minimap_viewport.transparent_bg = true
	_minimap_viewport.render_target_update_mode = SubViewport.UPDATE_DISABLED
	_top_surface.add_child(_minimap_viewport)
	_minimap_canvas = WorldHudMinimapRenderCanvas.new()
	_minimap_canvas.name = "WorldHudMinimapCanvas"
	_minimap_viewport.add_child(_minimap_canvas)
	minimap_texture.texture = _minimap_viewport.get_texture()
	var minimap_marker := Label.new()
	minimap_marker.name = "WorldHudMinimapPlayerMarker"
	minimap_marker.text = "◆"
	minimap_marker.mouse_filter = Control.MOUSE_FILTER_IGNORE
	minimap_marker.visible = false
	WorldHudAwakenedVisualSkin.apply_heading(minimap_marker, 18)
	minimap_marker.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	minimap_marker.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	minimap_card.add_child(minimap_marker)

	var map_button := entry_button("map")
	_reparent_control(map_button, minimap_card)
	map_button.name = "WorldHudEntryMap"
	map_button.text = ""
	map_button.tooltip_text = "地图"
	WorldHudAwakenedVisualSkin.apply_icon_button(map_button, "map", 70, false)
	_register_entry_slot("map", minimap_card)

	_map_name_label = Label.new()
	_map_name_label.name = "WorldHudMapName"
	_map_name_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	WorldHudAwakenedVisualSkin.apply_heading(_map_name_label, 15)
	_map_name_label.add_theme_stylebox_override(
		"normal",
		WorldHudAwakenedVisualSkin.caption_plate_style()
	)
	_top_surface.add_child(_map_name_label)
	_map_cell_label = Label.new()
	_map_cell_label.name = "WorldHudMapCell"
	WorldHudAwakenedVisualSkin.apply_label(_map_cell_label, 13, false, true)
	_top_surface.add_child(_map_cell_label)

	_reparent_control(_status_label, _top_surface)
	if _status_label != null:
		_status_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		WorldHudAwakenedVisualSkin.apply_heading(_status_label, 16)
	_reparent_control(_version_label, _top_surface)
	if _version_label != null:
		_version_label.visible = false
		WorldHudAwakenedVisualSkin.apply_label(_version_label, 12, true)
		_version_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT

	_top_shortcut_row = HBoxContainer.new()
	_top_shortcut_row.name = "WorldHudTopPrimaryShortcuts"
	_top_shortcut_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_top_shortcut_row.add_theme_constant_override("separation", 2)
	_top_surface.add_child(_top_shortcut_row)
	_add_proxy_icon_slot(_top_shortcut_row, "hang", "挂机", Vector2(56.0, 80.0), 52)
	_add_proxy_icon_slot(
		_top_shortcut_row,
		"pet",
		"抓宠",
		Vector2(56.0, 80.0),
		52,
		false,
		"capture"
	)
	_add_proxy_icon_slot(
		_top_shortcut_row,
		"quest",
		"活动",
		Vector2(56.0, 80.0),
		52,
		false,
		"activity"
	)
	_add_entry_icon_slot(_top_shortcut_row, "codex", "攻略", Vector2(56.0, 80.0), 52)
	_add_entry_icon_slot(_top_shortcut_row, "equipment", "变强", Vector2(56.0, 80.0), 52)
	_add_proxy_icon_slot(
		_top_shortcut_row,
		"quest",
		"经典任务",
		Vector2(64.0, 80.0),
		52,
		false,
		"classic"
	)

	_more_button = Button.new()
	_more_button.name = "WorldHudMoreButton"
	_more_button.tooltip_text = "展开更多真实入口"
	_more_button.pressed.connect(_on_more_button_pressed)
	var more_slot := _make_icon_slot(
		_top_shortcut_row,
		_more_button,
		"more",
		"",
		Vector2(48.0, 80.0),
		36,
		false
	)
	_more_caption_label = more_slot.get_meta("caption_label") as Label

	_top_secondary_row = HBoxContainer.new()
	_top_secondary_row.name = "WorldHudTopSecondaryShortcuts"
	_top_secondary_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_top_secondary_row.add_theme_constant_override("separation", 3)
	_top_surface.add_child(_top_secondary_row)
	for secondary in [
		["backpack", "背包"],
		["pet", "育宠"],
		["character", "形象"],
		["auto", "内挂"],
		["family", "家族"],
		["codex", "图鉴"],
		["party", "队伍"],
		["quest", "任务"],
		["account", "账号"],
		["map", "世界"],
	]:
		_add_proxy_icon_slot(
			_top_secondary_row,
			str(secondary[0]),
			str(secondary[1]),
			Vector2(56.0, 80.0),
			50
		)

	_left_shortcut_column = VBoxContainer.new()
	_left_shortcut_column.name = "WorldHudLeftQuickColumn"
	_left_shortcut_column.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_left_shortcut_column.add_theme_constant_override("separation", 5)
	_top_surface.add_child(_left_shortcut_column)
	for vertical_entry in [
		["map", "世界"],
		["mailbox", "福利"],
		["market", "交易所"],
		["market", "商城"],
	]:
		_add_proxy_icon_slot(
			_left_shortcut_column,
			str(vertical_entry[0]),
			str(vertical_entry[1]),
			Vector2(66.0, 76.0),
			52
		)

	_more_drawer = Panel.new()
	_more_drawer.name = "WorldHudMoreDrawer"
	_more_drawer.mouse_filter = Control.MOUSE_FILTER_STOP
	_more_drawer.clip_contents = true
	_more_drawer.add_theme_stylebox_override(
		"panel",
		WorldHudAwakenedVisualSkin.drawer_style()
	)
	_top_surface.add_child(_more_drawer)
	_drawer_grid = HBoxContainer.new()
	_drawer_grid.name = "WorldHudMoreGrid"
	_drawer_grid.add_theme_constant_override("separation", 5)
	_drawer_grid.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_more_drawer.add_child(_drawer_grid)
	for entry_id in ["family", "market", "mailbox", "auto", "account", "gm"]:
		_add_entry_icon_slot(
			_drawer_grid,
			entry_id,
			_entry_caption(entry_id),
			Vector2(62.0, 66.0),
			38,
			true
		)


func _build_side_panel() -> void:
	_hide_existing_children(_side_panel)
	_side_surface = Control.new()
	_side_surface.name = "WorldHudSideSurface"
	_side_surface.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_side_panel.add_child(_side_surface)

	_player_portrait_button = _new_proxy_button("character", "角色")
	_player_portrait_button.name = "WorldHudCharacterPortraitProxy"
	_player_portrait_button.text = ""
	WorldHudAwakenedVisualSkin.apply_portrait_frame(_player_portrait_button, false)
	_side_surface.add_child(_player_portrait_button)
	_register_entry_slot("character", _player_portrait_button)
	_pet_portrait_button = _new_proxy_button("pet", "宠物")
	_pet_portrait_button.name = "WorldHudPetPortraitProxy"
	_pet_portrait_button.text = ""
	WorldHudAwakenedVisualSkin.apply_portrait_frame(_pet_portrait_button, true)
	_side_surface.add_child(_pet_portrait_button)
	_register_entry_slot("pet", _pet_portrait_button)

	_player_name_label = Label.new()
	_player_name_label.name = "WorldHudPlayerName"
	_player_name_label.text = "角色"
	_player_name_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	WorldHudAwakenedVisualSkin.apply_label(_player_name_label, 13, false, true)
	_side_surface.add_child(_player_name_label)
	_pet_name_label = Label.new()
	_pet_name_label.name = "WorldHudBattlePetName"
	_pet_name_label.text = "战宠"
	_pet_name_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	WorldHudAwakenedVisualSkin.apply_label(_pet_name_label, 13, false, true)
	_side_surface.add_child(_pet_name_label)

	var task_tab := entry_button("quest")
	_reparent_control(task_tab, _side_surface)
	task_tab.name = "WorldHudTaskTab"
	task_tab.text = "任务"
	var party_tab := entry_button("party")
	_reparent_control(party_tab, _side_surface)
	party_tab.name = "WorldHudPartyTab"
	party_tab.text = "队伍"
	_register_entry_slot("quest", task_tab)
	_register_entry_slot("party", party_tab)

	_task_body_panel = Panel.new()
	_task_body_panel.name = "WorldHudTaskBody"
	_task_body_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_task_body_panel.add_theme_stylebox_override(
		"panel",
		WorldHudAwakenedVisualSkin.task_panel_style()
	)
	_side_surface.add_child(_task_body_panel)

	_side_title_label = Label.new()
	_side_title_label.name = "WorldHudSideTitle"
	_side_title_label.text = "任务追踪"
	WorldHudAwakenedVisualSkin.apply_heading(_side_title_label, 15)
	_task_body_panel.add_child(_side_title_label)

	_reparent_control(_detail_label, _task_body_panel)
	if _detail_label != null:
		_detail_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		_detail_label.clip_text = true
		_detail_label.max_lines_visible = 4
		_detail_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		WorldHudAwakenedVisualSkin.apply_label(_detail_label, 18)
		_detail_label.add_theme_font_override(
			"font",
			WorldHudAwakenedVisualSkin.display_font()
		)
	_task_entries_scroll = ScrollContainer.new()
	_task_entries_scroll.name = "WorldHudTaskEntriesScroll"
	_task_entries_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_task_entries_scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_AUTO
	_task_entries_scroll.mouse_filter = Control.MOUSE_FILTER_PASS
	_task_body_panel.add_child(_task_entries_scroll)
	_task_entries_container = VBoxContainer.new()
	_task_entries_container.name = "WorldHudTaskEntries"
	_task_entries_container.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_task_entries_container.add_theme_constant_override("separation", 4)
	_task_entries_scroll.add_child(_task_entries_container)
	_reparent_control(_task_route_button, _task_body_panel)
	if _task_route_button != null:
		WorldHudAwakenedVisualSkin.apply_route_button(_task_route_button)
	_refresh_side_tabs()


func _build_message_panel() -> void:
	_hide_existing_children(_message_panel)
	_message_surface = Control.new()
	_message_surface.name = "WorldHudMessageSurface"
	_message_surface.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_message_panel.add_child(_message_surface)

	var social_row := HBoxContainer.new()
	social_row.name = "WorldHudSocialShortcuts"
	social_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	social_row.add_theme_constant_override("separation", 5)
	_message_surface.add_child(social_row)
	var chat_button := entry_button("chat")
	_name_entry_button(chat_button, "chat")
	_reparent_control(chat_button, social_row)
	_make_icon_slot(
		social_row,
		chat_button,
		"chat",
		"聊天",
		Vector2(52.0, 66.0),
		40,
		true
	)
	_register_entry_slot("chat", chat_button.get_parent() as Control)
	for social_entry in [
		["family", "家族"],
		["party", "队伍"],
		["character", "外观"],
		["codex", "百科"],
	]:
		_add_proxy_icon_slot(
			social_row,
			str(social_entry[0]),
			str(social_entry[1]),
			Vector2(52.0, 66.0),
			40,
			true
		)

	_chat_surface = Panel.new()
	_chat_surface.name = "WorldHudChatSurface"
	_chat_surface.mouse_filter = Control.MOUSE_FILTER_PASS
	_chat_surface.add_theme_stylebox_override(
		"panel",
		WorldHudAwakenedVisualSkin.chat_panel_style()
	)
	_message_surface.add_child(_chat_surface)
	var message_title := Label.new()
	message_title.name = "WorldHudMessageTitle"
	message_title.text = "消息"
	WorldHudAwakenedVisualSkin.apply_label(message_title, 16)
	_chat_surface.add_child(message_title)
	var channel_chip := Label.new()
	channel_chip.name = "WorldHudMessageChannel"
	channel_chip.text = "世界"
	WorldHudAwakenedVisualSkin.apply_heading(channel_chip, 14)
	channel_chip.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	channel_chip.add_theme_stylebox_override(
		"normal",
		WorldHudAwakenedVisualSkin.caption_plate_style()
	)
	_chat_surface.add_child(channel_chip)
	_message_action_row = HBoxContainer.new()
	_message_action_row.name = "WorldHudMessageActions"
	_message_action_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_message_action_row.add_theme_constant_override("separation", 4)
	_chat_surface.add_child(_message_action_row)
	_message_expand_button.name = "WorldHudMessageExpandButton"
	_message_clear_button.name = "WorldHudMessageClearButton"
	var message_buttons: Array[Button] = [
		_message_expand_button,
		_message_clear_button,
	]
	for message_button in message_buttons:
		_reparent_control(message_button, _message_action_row)
		WorldHudAwakenedVisualSkin.apply_entry_button(
			message_button,
			"message_action",
			true
		)
		message_button.custom_minimum_size = Vector2(54.0, 28.0)
		message_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		message_button.mouse_filter = Control.MOUSE_FILTER_STOP
	if _battle_log_label == null:
		_battle_log_label = _message_panel.find_child("BattleLog", true, false) as RichTextLabel
	if _battle_log_label != null:
		_reparent_control(_battle_log_label, _chat_surface)
		_battle_log_label.visible = true
		_battle_log_label.fit_content = false
		_battle_log_label.scroll_active = true
		_battle_log_label.add_theme_font_override(
			"normal_font",
			WorldHudAwakenedVisualSkin.body_font()
		)
		_battle_log_label.add_theme_font_size_override("normal_font_size", 18)
		_battle_log_label.add_theme_color_override(
			"default_color",
			WorldHudAwakenedVisualSkin.TEXT_PRIMARY
		)
	_chat_surface.set_meta("message_title", message_title)
	_chat_surface.set_meta("message_channel", channel_chip)
	_clock_label = Label.new()
	_clock_label.name = "WorldHudClock"
	WorldHudAwakenedVisualSkin.apply_label(_clock_label, 13, true)
	_message_surface.add_child(_clock_label)
	_experience_label = Label.new()
	_experience_label.name = "WorldHudExperience"
	WorldHudAwakenedVisualSkin.apply_label(_experience_label, 13, true)
	_message_surface.add_child(_experience_label)


func _build_action_bar() -> void:
	_hide_existing_children(_action_bar)
	_dock_surface = Control.new()
	_dock_surface.name = "WorldHudDockSurface"
	_dock_surface.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_dock_surface.clip_contents = false
	_action_bar.add_child(_dock_surface)

	_floating_mailbox_slot = _add_proxy_icon_slot(
		_dock_surface,
		"mailbox",
		"邮箱",
		Vector2(80.0, 96.0),
		58,
		true
	)

	var backpack_button := entry_button("backpack")
	_name_entry_button(backpack_button, "backpack")
	var backpack_slot := _make_icon_slot(
		_dock_surface,
		backpack_button,
		"backpack",
		"背包",
		Vector2(60.0, 77.0),
		50,
		true
	)
	backpack_slot.name = "WorldHudBackpackFloating"
	_register_entry_slot("backpack", backpack_slot)

	_bottom_row = HBoxContainer.new()
	_bottom_row.name = "WorldHudFixedEntries"
	_bottom_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_bottom_row.add_theme_constant_override("separation", 1)
	_dock_surface.add_child(_bottom_row)
	_bottom_row.set_meta("world_hud_layout_role", "fixed_row")
	for bottom_entry in [
		["auto", "设置"],
		["family", "家族"],
		["market", "买卖"],
		["equipment", "打造"],
		["codex", "图鉴"],
	]:
		_add_proxy_icon_slot(
			_bottom_row,
			str(bottom_entry[0]),
			str(bottom_entry[1]),
			Vector2(62.0, 91.0),
			52
		)
	_add_entry_icon_slot(_bottom_row, "pet", "宠物", Vector2(62.0, 91.0), 52)
	_add_entry_icon_slot(_bottom_row, "character", "角色", Vector2(62.0, 91.0), 52)
	var hang_button := entry_button("hang")
	_name_entry_button(hang_button, "hang")
	var hang_slot := _make_icon_slot(
		_bottom_row,
		hang_button,
		"hang",
		"挂机",
		Vector2(62.0, 91.0),
		52,
		false
	)
	_register_entry_slot("hang", hang_slot)

	_reparent_control(_collapse_button, _dock_surface)
	_collapse_button.name = "WorldHudCollapseButton"
	_collapse_button.tooltip_text = "收起全部界面"
	var collapse_slot := _make_icon_slot(
		_dock_surface,
		_collapse_button,
		"collapse",
		"收起",
		Vector2(69.0, 95.0),
		48,
		true
	)
	collapse_slot.name = "WorldHudCollapseSlot"

	_restore_button = Button.new()
	_restore_button.name = "WorldHudRestoreButton"
	_restore_button.text = "展开"
	_restore_button.tooltip_text = "恢复完整界面"
	_restore_button.visible = false
	_restore_button.pressed.connect(_on_restore_button_pressed)
	WorldHudAwakenedVisualSkin.apply_icon_button(_restore_button, "collapse", 48, true)
	_action_bar.add_child(_restore_button)


func _layout_top_contents(panel_width: float, panel_height: float) -> void:
	if _top_surface == null:
		return
	_top_surface.position = Vector2.ZERO
	_top_surface.size = Vector2(panel_width, panel_height)
	var minimap_card := _top_surface.find_child("WorldHudMinimapCard", false, false) as Control
	if minimap_card != null:
		minimap_card.position = Vector2(19.0, 35.0)
		minimap_card.size = Vector2(107.0, 107.0)
		var minimap_texture := minimap_card.find_child(
			"WorldHudMinimapTexture",
			false,
			false
		) as TextureRect
		if minimap_texture != null:
			minimap_texture.position = Vector2(4.0, 4.0)
			minimap_texture.size = Vector2(99.0, 99.0)
		var map_button := entry_button("map")
		map_button.position = Vector2(4.0, 4.0)
		map_button.size = Vector2(99.0, 99.0)
	_map_name_label.position = Vector2(12.0, 6.0)
	_map_name_label.size = Vector2(116.0, 30.0)
	_map_name_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_map_cell_label.position = Vector2(31.0, 38.0)
	_map_cell_label.size = Vector2(94.0, 22.0)
	if _status_label != null:
		_status_label.visible = false
	if _version_label != null:
		_version_label.visible = false
	_top_shortcut_row.position = Vector2(130.0, 0.0)
	_top_shortcut_row.size = Vector2(407.0, 82.0)
	_top_secondary_row.position = Vector2(131.0, 84.0)
	_top_secondary_row.size = Vector2(621.0, 82.0)
	_left_shortcut_column.position = Vector2(0.0, 106.0)
	_left_shortcut_column.size = Vector2(72.0, 319.0)
	if _more_drawer != null:
		_more_drawer.position = Vector2(130.0, 170.0)
		_more_drawer.size = Vector2(407.0, 72.0)
		_drawer_grid.position = Vector2(5.0, 3.0)
		_drawer_grid.size = Vector2(397.0, 66.0)


func _layout_side_contents(panel_width: float, panel_height: float) -> void:
	if _side_surface == null:
		return
	_side_surface.position = Vector2.ZERO
	_side_surface.size = Vector2(panel_width, panel_height)
	var inner_width := maxf(120.0, panel_width)
	var portrait_gap := 6.0
	var portrait_width := 77.0
	var player_button := _player_portrait_button
	var pet_button := _pet_portrait_button
	player_button.position = Vector2(35.0, 0.0)
	player_button.size = Vector2(portrait_width, 70.0)
	pet_button.position = Vector2(35.0 + portrait_width + portrait_gap, 0.0)
	pet_button.size = Vector2(portrait_width, 70.0)
	_player_name_label.position = Vector2(35.0, 69.0)
	_player_name_label.size = Vector2(portrait_width, 23.0)
	_pet_name_label.position = Vector2(35.0 + portrait_width + portrait_gap, 69.0)
	_pet_name_label.size = Vector2(portrait_width, 23.0)
	var task_tab := entry_button("quest")
	var party_tab := entry_button("party")
	task_tab.position = Vector2(45.0, 113.0)
	task_tab.size = Vector2(80.0, 44.0)
	party_tab.position = Vector2(126.0, 113.0)
	party_tab.size = Vector2(80.0, 44.0)
	_task_body_panel.position = Vector2(0.0, 158.0)
	_task_body_panel.size = Vector2(inner_width, 307.0)
	_side_title_label.position = Vector2(10.0, 8.0)
	_side_title_label.size = Vector2(inner_width - 20.0, 30.0)
	var route_height := 38.0
	var route_y := 259.0
	if _task_route_button != null:
		_task_route_button.position = Vector2(8.0, route_y)
		_task_route_button.size = Vector2(inner_width - 16.0, route_height)
	if _detail_label != null:
		_detail_label.position = Vector2(10.0, 40.0)
		_detail_label.size = Vector2(inner_width - 20.0, 211.0)
	if _task_entries_scroll != null:
		_task_entries_scroll.position = Vector2(7.0, 39.0)
		_task_entries_scroll.size = Vector2(inner_width - 14.0, 213.0)


func _layout_message_contents(message_size: Vector2, expanded: bool) -> void:
	if _message_surface == null:
		return
	_message_surface.position = Vector2.ZERO
	_message_surface.size = message_size
	var social_row := _message_surface.find_child(
		"WorldHudSocialShortcuts",
		false,
		false
	) as HBoxContainer
	if social_row != null:
		social_row.position = Vector2(23.0, 0.0)
		social_row.size = Vector2(message_size.x - 46.0, 70.0)
	if _chat_surface != null:
		_chat_surface.position = Vector2(0.0, 78.0)
		_chat_surface.size = Vector2(
			message_size.x,
			maxf(80.0, message_size.y - 78.0)
		)
		var title := _chat_surface.get_meta("message_title") as Label
		var channel := _chat_surface.get_meta("message_channel") as Label
		if title != null:
			title.position = Vector2(10.0, 5.0)
			title.size = Vector2(80.0, 28.0)
		if channel != null:
			channel.position = Vector2(9.0, 37.0)
			channel.size = Vector2(54.0, 26.0)
		if _message_action_row != null:
			_message_action_row.position = Vector2(
				maxf(96.0, _chat_surface.size.x - 122.0),
				5.0
			)
			_message_action_row.size = Vector2(112.0, 28.0)
		if _battle_log_label != null:
			_battle_log_label.position = Vector2(70.0, 36.0)
			_battle_log_label.size = Vector2(
				maxf(120.0, _chat_surface.size.x - 80.0),
				maxf(44.0, _chat_surface.size.y - 44.0)
			)
	if _clock_label != null:
		_clock_label.position = Vector2(0.0, message_size.y + 1.0)
		_clock_label.size = Vector2(68.0, 17.0)
	if _experience_label != null:
		_experience_label.position = Vector2(72.0, message_size.y + 1.0)
		_experience_label.size = Vector2(132.0, 17.0)


func _layout_action_contents(action_size: Vector2) -> void:
	if _dock_surface == null:
		return
	_dock_surface.position = Vector2.ZERO
	_dock_surface.size = action_size
	if _floating_mailbox_slot != null:
		_floating_mailbox_slot.position = Vector2(0.0, 0.0)
		_floating_mailbox_slot.size = Vector2(80.0, 96.0)
	var backpack_slot := _dock_surface.find_child(
		"WorldHudBackpackFloating",
		false,
		false
	) as Control
	if backpack_slot != null:
		backpack_slot.position = Vector2(534.0, 15.0)
		backpack_slot.size = Vector2(60.0, 77.0)
	if _bottom_row != null:
		_bottom_row.position = Vector2(17.0, 85.0)
		_bottom_row.size = Vector2(510.0, 96.0)
	var collapse_slot := _dock_surface.find_child(
		"WorldHudCollapseSlot",
		false,
		false
	) as Control
	if collapse_slot != null:
		collapse_slot.position = Vector2(528.0, 85.0)
		collapse_slot.size = Vector2(69.0, 95.0)
	if _restore_button != null:
		_restore_button.position = Vector2.ZERO
		_restore_button.size = action_size


func _apply_visibility_contract() -> void:
	if not _mounted:
		return
	var world_menu_open := _state_bool(
		_layout_state,
		["worldMenuOpen", "world_menu_open"],
		false
	)
	var battle_active := _state_bool(
		_layout_state,
		["battleActive", "battle_active"],
		false
	)
	var show_top := _state_bool(_layout_state, ["showTop", "show_top"], true)
	var show_side := _state_bool(_layout_state, ["showSide", "show_side"], true)
	var show_message := _state_bool(
		_layout_state,
		["showMessage", "show_message", "messageVisible", "message_visible"],
		true
	)
	var show_action := _state_bool(
		_layout_state,
		["showAction", "show_action", "actionVisible", "action_visible"],
		true
	)
	# Battle owns its own command HUD.  Never let the world navigation header or
	# world action dock reappear over it, even if a legacy host still reports
	# those controls as visible while laying out the battle scene.
	show_top = show_top and not battle_active
	show_action = show_action and not battle_active
	if world_menu_open:
		_top_panel.visible = false
		_side_panel.visible = false
		_message_panel.visible = false
		_action_bar.visible = false
		return
	_action_bar.visible = show_action
	if _collapsed:
		_top_panel.visible = false
		_side_panel.visible = false
		_message_panel.visible = false
		_dock_surface.visible = false
		_restore_button.visible = show_action
		_more_drawer.visible = false
	else:
		_top_panel.visible = show_top
		_side_panel.visible = show_side and not battle_active
		_message_panel.visible = show_message
		_dock_surface.visible = show_action
		_restore_button.visible = false
		_more_drawer.visible = show_action and _more_drawer_open


func _refresh_side_tabs() -> void:
	var task_tab := entry_button("quest")
	var party_tab := entry_button("party")
	if task_tab != null:
		WorldHudAwakenedVisualSkin.apply_tab_button(
			task_tab,
			_active_side_tab == SIDE_TAB_TASK,
			"quest"
		)
	if party_tab != null:
		WorldHudAwakenedVisualSkin.apply_tab_button(
			party_tab,
			_active_side_tab == SIDE_TAB_PARTY,
			"party"
		)
	if _side_title_label != null:
		_side_title_label.text = "队伍入口" if _active_side_tab == SIDE_TAB_PARTY else "任务追踪"


func _apply_portrait(entry_id: String, texture_value, display_name: String) -> void:
	var button := entry_button(entry_id)
	if button == null:
		return
	var texture := WorldHudAwakenedVisualSkin.texture_from_path(texture_value)
	# Some established pet forms do not yet have a dedicated portrait contract.
	# Keep their real identity/level visible while using this HUD package's formal
	# entry art, instead of leaving a blank frame or inventing another portrait.
	if texture == null:
		var fallback_entry_id: String = str({
			"character": "event_character",
			"pet": "event_pet",
		}.get(entry_id, ""))
		if fallback_entry_id != "":
			texture = WorldHudAwakenedVisualSkin.texture_for_entry(
				fallback_entry_id
			)
	button.icon = texture
	button.expand_icon = texture != null
	button.tooltip_text = display_name
	var portrait_proxy := (
		_player_portrait_button
		if entry_id == "character"
		else _pet_portrait_button if entry_id == "pet" else null
	)
	if portrait_proxy != null:
		portrait_proxy.icon = texture
		portrait_proxy.expand_icon = texture != null
		portrait_proxy.tooltip_text = display_name
	for proxy_value in _array_from(_proxy_buttons.get(entry_id, [])):
		if proxy_value is Button:
			var proxy := proxy_value as Button
			if proxy.icon == null:
				proxy.icon = texture
				proxy.expand_icon = texture != null


func _apply_menu_gates(state: Dictionary) -> void:
	var menu_value = state.get("menu", null)
	if not (menu_value is Dictionary):
		return
	var gates_value = (menu_value as Dictionary).get("gates", null)
	if not (gates_value is Dictionary):
		return
	var gates := gates_value as Dictionary
	for entry_id in REQUIRED_ENTRY_IDS:
		var gate_value = gates.get(entry_id, gates.get(_normalized_entry_id(entry_id), null))
		if not (gate_value is Dictionary):
			continue
		var gate := gate_value as Dictionary
		var button := entry_button(entry_id)
		if button == null:
			continue
		var entry_visible := bool(gate.get("visible", true))
		var entry_disabled := bool(gate.get("disabled", false))
		button.visible = entry_visible
		button.disabled = entry_disabled
		for slot_value in _array_from(_entry_slots.get(entry_id, [])):
			if slot_value is Control and slot_value != button:
				(slot_value as Control).visible = entry_visible
		for proxy_value in _array_from(_proxy_buttons.get(entry_id, [])):
			if proxy_value is Button:
				(proxy_value as Button).disabled = entry_disabled
				(proxy_value as Button).visible = entry_visible
		for proxy_slot_value in _array_from(_proxy_slots.get(entry_id, [])):
			if proxy_slot_value is Control:
				(proxy_slot_value as Control).visible = entry_visible


func _set_more_drawer_open(open: bool) -> void:
	_more_drawer_open = open and not _collapsed
	if _more_button != null:
		_more_button.tooltip_text = "关闭更多功能" if _more_drawer_open else "更多功能"
	if _more_caption_label != null:
		_more_caption_label.text = "收回" if _more_drawer_open else "更多"
	if _more_drawer != null:
		_more_drawer.visible = _more_drawer_open and not _collapsed


func _on_more_button_pressed() -> void:
	_set_more_drawer_open(not _more_drawer_open)


func _on_restore_button_pressed() -> void:
	set_collapsed(false)
	if _collapse_button != null and not _collapse_button.pressed.get_connections().is_empty():
		_collapse_button.pressed.emit()
	else:
		collapsed_change_requested.emit(false)


func _add_entry_icon_slot(
	parent: Node,
	entry_id: String,
	caption: String,
	slot_size: Vector2,
	icon_width: int,
	framed: bool = false
) -> Control:
	var button := entry_button(entry_id)
	if button == null:
		return Control.new()
	_name_entry_button(button, entry_id)
	var slot := _make_icon_slot(
		parent,
		button,
		entry_id,
		caption,
		slot_size,
		icon_width,
		framed
	)
	_register_entry_slot(entry_id, slot)
	return slot


func _add_proxy_icon_slot(
	parent: Node,
	entry_id: String,
	caption: String,
	slot_size: Vector2,
	icon_width: int,
	framed: bool = false,
	visual_entry_id: String = ""
) -> Control:
	var proxy := _new_proxy_button(entry_id, caption)
	var slot := _make_icon_slot(
		parent,
		proxy,
		visual_entry_id if visual_entry_id != "" else entry_id,
		caption,
		slot_size,
		icon_width,
		framed
	)
	var slots := _array_from(_proxy_slots.get(entry_id, []))
	slots.append(slot)
	_proxy_slots[entry_id] = slots
	return slot


func _new_proxy_button(entry_id: String, tooltip: String) -> Button:
	var proxy := Button.new()
	proxy.name = "WorldHudProxy%s%d" % [
		entry_id.capitalize().replace(" ", ""),
		_array_from(_proxy_buttons.get(entry_id, [])).size() + 1,
	]
	proxy.tooltip_text = tooltip
	proxy.pressed.connect(_on_proxy_entry_pressed.bind(entry_id))
	var proxies := _array_from(_proxy_buttons.get(entry_id, []))
	proxies.append(proxy)
	_proxy_buttons[entry_id] = proxies
	return proxy


func _make_icon_slot(
	parent: Node,
	button: Button,
	visual_entry_id: String,
	caption: String,
	slot_size: Vector2,
	icon_width: int,
	framed: bool
) -> Control:
	var slot := VBoxContainer.new()
	slot.name = "WorldHudIconSlot%s" % visual_entry_id.capitalize().replace(" ", "")
	slot.custom_minimum_size = slot_size
	slot.mouse_filter = Control.MOUSE_FILTER_IGNORE
	slot.add_theme_constant_override("separation", -2)
	parent.add_child(slot)
	_reparent_control(button, slot)
	button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	button.size_flags_vertical = Control.SIZE_EXPAND_FILL
	button.custom_minimum_size = Vector2(slot_size.x, maxf(32.0, slot_size.y - 23.0))
	var icon_variant := _visual_icon_variant(parent, visual_entry_id)
	WorldHudAwakenedVisualSkin.apply_icon_button(
		button,
		icon_variant,
		icon_width,
		framed,
		visual_entry_id
	)
	var caption_label := Label.new()
	caption_label.name = "WorldHudIconCaption"
	caption_label.text = caption
	caption_label.custom_minimum_size = Vector2(slot_size.x, 22.0)
	var caption_size := 18 if caption.length() <= 2 else 16 if caption.length() == 3 else 15
	WorldHudAwakenedVisualSkin.apply_caption(caption_label, caption_size)
	slot.add_child(caption_label)
	slot.set_meta("caption_label", caption_label)
	return slot


func _register_entry_slot(entry_id: String, slot: Control) -> void:
	if slot == null:
		return
	var slots := _array_from(_entry_slots.get(entry_id, []))
	if not slots.has(slot):
		slots.append(slot)
	_entry_slots[entry_id] = slots


func _on_proxy_entry_pressed(entry_id: String) -> void:
	var button := entry_button(entry_id)
	if button == null or button.disabled or not button.visible:
		return
	button.pressed.emit()


func _entry_caption(entry_id: String) -> String:
	return {
		"family": "家族",
		"market": "买卖",
		"mailbox": "信箱",
		"auto": "内挂",
		"gm": "GM",
	}.get(entry_id, entry_id)


func _visual_icon_variant(parent: Node, entry_id: String) -> String:
	if parent != null and parent.name == "WorldHudTopPrimaryShortcuts":
		return {
			"hang": "top_hang",
			"capture": "top_pet",
			"activity": "top_quest",
			"codex": "top_guide",
			"equipment": "top_strengthen",
			"classic": "top_classic",
			"more": "top_more",
		}.get(entry_id, entry_id)
	if parent != null and parent.name == "WorldHudTopSecondaryShortcuts":
		return {
			"backpack": "event_backpack",
			"pet": "event_pet",
			"character": "event_character",
			"auto": "event_auto",
			"family": "event_family",
			"codex": "event_codex",
			"party": "event_party",
			"quest": "event_quest",
			"account": "event_account",
		}.get(entry_id, entry_id)
	return entry_id


func _array_from(value) -> Array:
	return value as Array if value is Array else []


func _message_header() -> HBoxContainer:
	if _battle_log_label == null and _message_panel != null:
		_battle_log_label = _message_panel.find_child("BattleLog", true, false) as RichTextLabel
	if _battle_log_label == null:
		return null
	var message_box := _battle_log_label.get_parent()
	if message_box == null:
		return null
	for child in message_box.get_children():
		if child is HBoxContainer:
			return child as HBoxContainer
	return null


func _capture_mount_snapshot() -> void:
	_mount_snapshot.clear()
	_mount_root_child_ids.clear()
	var candidates: Array = []
	for root_control in [_top_panel, _side_panel, _message_panel, _action_bar]:
		if root_control != null:
			var child_ids: Array[int] = []
			for child in root_control.get_children():
				child_ids.append(child.get_instance_id())
			_mount_root_child_ids[root_control.get_instance_id()] = child_ids
		_append_mount_snapshot_candidates(root_control, candidates)
	for control in [
		_status_label,
		_version_label,
		_detail_label,
		_task_route_button,
		_battle_log_label,
		_collapse_button,
	]:
		if control is CanvasItem:
			candidates.append(control)
	for entry_id in REQUIRED_ENTRY_IDS:
		var button := _entries.get(entry_id) as Button
		if button != null:
			candidates.append(button)
	var seen: Dictionary = {}
	for value in candidates:
		if not (value is CanvasItem) or not is_instance_valid(value):
			continue
		var item := value as CanvasItem
		var instance_id := item.get_instance_id()
		if seen.has(instance_id):
			continue
		seen[instance_id] = true
		_mount_snapshot.append(_mount_item_snapshot(item))


func _remove_mount_artifacts() -> void:
	for root_control in [_top_panel, _side_panel, _message_panel, _action_bar]:
		if root_control == null or not is_instance_valid(root_control):
			continue
		var original_ids_value = _mount_root_child_ids.get(
			root_control.get_instance_id(),
			[]
		)
		var original_ids := (
			original_ids_value as Array
			if original_ids_value is Array
			else []
		)
		for child in root_control.get_children():
			if child.get_instance_id() in original_ids:
				continue
			root_control.remove_child(child)
			child.queue_free()


func _append_mount_snapshot_candidates(node: Node, candidates: Array) -> void:
	if node == null:
		return
	if node is CanvasItem:
		candidates.append(node)
	for child in node.get_children():
		_append_mount_snapshot_candidates(child, candidates)


func _mount_item_snapshot(item: CanvasItem) -> Dictionary:
	var metadata: Dictionary = {}
	for meta_name in item.get_meta_list():
		metadata[meta_name] = item.get_meta(meta_name)
	var result := {
		"node": item,
		"parent": item.get_parent(),
		"index": item.get_index(),
		"depth": _mount_item_depth(item),
		"name": item.name,
		"visible": item.visible,
		"modulate": item.modulate,
		"selfModulate": item.self_modulate,
		"zIndex": item.z_index,
		"zAsRelative": item.z_as_relative,
		"showBehindParent": item.show_behind_parent,
		"metadata": metadata,
	}
	if item is Control:
		var control := item as Control
		result["control"] = {
			"anchorLeft": control.anchor_left,
			"anchorTop": control.anchor_top,
			"anchorRight": control.anchor_right,
			"anchorBottom": control.anchor_bottom,
			"offsetLeft": control.offset_left,
			"offsetTop": control.offset_top,
			"offsetRight": control.offset_right,
			"offsetBottom": control.offset_bottom,
			"position": control.position,
			"size": control.size,
			"rotation": control.rotation,
			"scale": control.scale,
			"pivotOffset": control.pivot_offset,
			"customMinimumSize": control.custom_minimum_size,
			"sizeFlagsHorizontal": control.size_flags_horizontal,
			"sizeFlagsVertical": control.size_flags_vertical,
			"mouseFilter": control.mouse_filter,
			"mouseDefaultCursorShape": control.mouse_default_cursor_shape,
			"focusMode": control.focus_mode,
			"clipContents": control.clip_contents,
			"tooltipText": control.tooltip_text,
			"themeOverrides": _theme_override_snapshot(control),
		}
	if item is Label:
		var label := item as Label
		result["label"] = {
			"text": label.text,
			"horizontalAlignment": label.horizontal_alignment,
			"verticalAlignment": label.vertical_alignment,
			"autowrapMode": label.autowrap_mode,
			"clipText": label.clip_text,
			"textOverrunBehavior": label.text_overrun_behavior,
			"maxLinesVisible": label.max_lines_visible,
		}
	elif item is RichTextLabel:
		var rich_text := item as RichTextLabel
		result["richText"] = {
			"text": rich_text.text,
			"fitContent": rich_text.fit_content,
			"scrollActive": rich_text.scroll_active,
			"autowrapMode": rich_text.autowrap_mode,
		}
	if item is BaseButton:
		var base_button := item as BaseButton
		result["baseButton"] = {
			"disabled": base_button.disabled,
			"toggleMode": base_button.toggle_mode,
			"buttonPressed": base_button.button_pressed,
			"actionMode": base_button.action_mode,
		}
	if item is Button:
		var button := item as Button
		result["button"] = {
			"text": button.text,
			"icon": button.icon,
			"flat": button.flat,
			"clipText": button.clip_text,
			"textOverrunBehavior": button.text_overrun_behavior,
			"alignment": button.alignment,
			"iconAlignment": button.icon_alignment,
			"expandIcon": button.expand_icon,
		}
	return result


func _mount_item_depth(item: Node) -> int:
	var depth := 0
	var current := item.get_parent()
	while current != null:
		depth += 1
		current = current.get_parent()
	return depth


func _restore_mount_child_indices(
	ordered: Array[Dictionary],
	errors: Array[String]
) -> void:
	var indexed: Array[Dictionary] = ordered.duplicate()
	indexed.sort_custom(func(left: Dictionary, right: Dictionary) -> bool:
		var left_parent = left.get("parent")
		var right_parent = right.get("parent")
		var left_parent_id := (
			int((left_parent as Node).get_instance_id())
			if left_parent is Node and is_instance_valid(left_parent)
			else -1
		)
		var right_parent_id := (
			int((right_parent as Node).get_instance_id())
			if right_parent is Node and is_instance_valid(right_parent)
			else -1
		)
		if left_parent_id == right_parent_id:
			return int(left.get("index", 0)) < int(right.get("index", 0))
		return left_parent_id < right_parent_id
	)
	for record in indexed:
		var item = record.get("node")
		var original_parent = record.get("parent")
		if (
			not (item is CanvasItem)
			or not is_instance_valid(item)
			or not (original_parent is Node)
			or not is_instance_valid(original_parent)
		):
			continue
		var canvas_item := item as CanvasItem
		var parent := original_parent as Node
		if canvas_item.get_parent() != parent:
			errors.append("parent restore failed: %s" % str(record.get("name", "")))
			continue
		parent.move_child(
			canvas_item,
			clampi(int(record.get("index", 0)), 0, parent.get_child_count() - 1)
		)


func _restore_mount_item_semantics(
	item: CanvasItem,
	record: Dictionary,
	errors: Array[String]
) -> void:
	_restore_mount_item_name(item, record, errors)
	item.visible = bool(record.get("visible", true))
	item.modulate = record.get("modulate", item.modulate)
	item.self_modulate = record.get("selfModulate", item.self_modulate)
	item.z_index = int(record.get("zIndex", item.z_index))
	item.z_as_relative = bool(record.get("zAsRelative", item.z_as_relative))
	item.show_behind_parent = bool(record.get("showBehindParent", item.show_behind_parent))
	_restore_metadata(item, record.get("metadata", {}))
	if item is Control:
		_restore_control_mount_semantics(item as Control, record.get("control", {}))
	if item is Label:
		var label := item as Label
		var state = record.get("label", {}) as Dictionary
		label.text = str(state.get("text", label.text))
		label.horizontal_alignment = state.get("horizontalAlignment", label.horizontal_alignment)
		label.vertical_alignment = state.get("verticalAlignment", label.vertical_alignment)
		label.autowrap_mode = state.get("autowrapMode", label.autowrap_mode)
		label.clip_text = bool(state.get("clipText", label.clip_text))
		label.text_overrun_behavior = state.get("textOverrunBehavior", label.text_overrun_behavior)
		label.max_lines_visible = int(state.get("maxLinesVisible", label.max_lines_visible))
	elif item is RichTextLabel:
		var rich_text := item as RichTextLabel
		var state = record.get("richText", {}) as Dictionary
		rich_text.text = str(state.get("text", rich_text.text))
		rich_text.fit_content = bool(state.get("fitContent", rich_text.fit_content))
		rich_text.scroll_active = bool(state.get("scrollActive", rich_text.scroll_active))
		rich_text.autowrap_mode = state.get("autowrapMode", rich_text.autowrap_mode)
	if item is BaseButton:
		var base_button := item as BaseButton
		var state = record.get("baseButton", {}) as Dictionary
		base_button.disabled = bool(state.get("disabled", base_button.disabled))
		base_button.toggle_mode = bool(state.get("toggleMode", base_button.toggle_mode))
		base_button.button_pressed = bool(state.get("buttonPressed", base_button.button_pressed))
		base_button.action_mode = state.get("actionMode", base_button.action_mode)
	if item is Button:
		var button := item as Button
		var state = record.get("button", {}) as Dictionary
		button.text = str(state.get("text", button.text))
		button.icon = state.get("icon", button.icon)
		button.flat = bool(state.get("flat", button.flat))
		button.clip_text = bool(state.get("clipText", button.clip_text))
		button.text_overrun_behavior = state.get("textOverrunBehavior", button.text_overrun_behavior)
		button.alignment = state.get("alignment", button.alignment)
		button.icon_alignment = state.get("iconAlignment", button.icon_alignment)
		button.expand_icon = bool(state.get("expandIcon", button.expand_icon))


func _restore_mount_item_name(
	item: CanvasItem,
	record: Dictionary,
	errors: Array[String]
) -> void:
	if not record.has("name"):
		errors.append("mount snapshot name is missing")
		return
	var saved_name: StringName = StringName(record.get("name"))
	if saved_name == StringName():
		errors.append("mount snapshot name is empty")
		return
	if item.name == saved_name:
		return
	if str(saved_name).begins_with("@"):
		errors.append("internal mount name changed: %s" % str(saved_name))
		return
	item.name = saved_name
	if item.name != saved_name:
		errors.append("mount name restore failed: %s" % str(saved_name))


func _restore_control_mount_semantics(control: Control, state: Dictionary) -> void:
	control.custom_minimum_size = state.get("customMinimumSize", control.custom_minimum_size)
	control.size_flags_horizontal = int(state.get("sizeFlagsHorizontal", control.size_flags_horizontal))
	control.size_flags_vertical = int(state.get("sizeFlagsVertical", control.size_flags_vertical))
	control.mouse_filter = state.get("mouseFilter", control.mouse_filter)
	control.mouse_default_cursor_shape = state.get(
		"mouseDefaultCursorShape",
		control.mouse_default_cursor_shape
	)
	control.focus_mode = state.get("focusMode", control.focus_mode)
	control.clip_contents = bool(state.get("clipContents", control.clip_contents))
	control.tooltip_text = str(state.get("tooltipText", control.tooltip_text))
	_restore_theme_overrides(control, state.get("themeOverrides", {}))


func _restore_mount_item_geometry(item: CanvasItem, record: Dictionary) -> void:
	if not (item is Control):
		return
	_restore_control_mount_geometry(item as Control, record.get("control", {}))


func _restore_control_mount_geometry(control: Control, state: Dictionary) -> void:
	control.anchor_left = float(state.get("anchorLeft", control.anchor_left))
	control.anchor_top = float(state.get("anchorTop", control.anchor_top))
	control.anchor_right = float(state.get("anchorRight", control.anchor_right))
	control.anchor_bottom = float(state.get("anchorBottom", control.anchor_bottom))
	control.position = state.get("position", control.position)
	control.size = state.get("size", control.size)
	control.rotation = float(state.get("rotation", control.rotation))
	control.scale = state.get("scale", control.scale)
	control.pivot_offset = state.get("pivotOffset", control.pivot_offset)
	control.offset_left = float(state.get("offsetLeft", control.offset_left))
	control.offset_top = float(state.get("offsetTop", control.offset_top))
	control.offset_right = float(state.get("offsetRight", control.offset_right))
	control.offset_bottom = float(state.get("offsetBottom", control.offset_bottom))


func _restore_metadata(item: CanvasItem, value) -> void:
	var metadata := value as Dictionary if value is Dictionary else {}
	for meta_name in item.get_meta_list():
		if not metadata.has(meta_name):
			item.remove_meta(meta_name)
	for meta_name in metadata:
		item.set_meta(meta_name, metadata.get(meta_name))


func _theme_override_snapshot(control: Control) -> Dictionary:
	var result: Dictionary = {}
	for property in control.get_property_list():
		var property_name := str((property as Dictionary).get("name", ""))
		var parsed := _theme_override_property(property_name)
		if not parsed.is_empty() and _has_theme_override(
			control,
			str(parsed.get("group", "")),
			str(parsed.get("item", ""))
		):
			result[property_name] = control.get(property_name)
	return result


func _restore_theme_overrides(control: Control, value) -> void:
	var saved := value as Dictionary if value is Dictionary else {}
	for property in control.get_property_list():
		var property_name := str((property as Dictionary).get("name", ""))
		var parsed := _theme_override_property(property_name)
		if parsed.is_empty() or saved.has(property_name):
			continue
		var group := str(parsed.get("group", ""))
		var item_name := str(parsed.get("item", ""))
		if _has_theme_override(control, group, item_name):
			_remove_theme_override(control, group, item_name)
	for property_name in saved:
		control.set(property_name, saved.get(property_name))


func _theme_override_property(property_name: String) -> Dictionary:
	if not property_name.begins_with("theme_override_"):
		return {}
	var slash_index := property_name.find("/")
	if slash_index < 0 or slash_index >= property_name.length() - 1:
		return {}
	return {
		"group": property_name.substr(15, slash_index - 15),
		"item": property_name.substr(slash_index + 1),
	}


func _has_theme_override(control: Control, group: String, item_name: String) -> bool:
	match group:
		"colors":
			return control.has_theme_color_override(item_name)
		"constants":
			return control.has_theme_constant_override(item_name)
		"fonts":
			return control.has_theme_font_override(item_name)
		"font_sizes":
			return control.has_theme_font_size_override(item_name)
		"icons":
			return control.has_theme_icon_override(item_name)
		"styles":
			return control.has_theme_stylebox_override(item_name)
	return false


func _remove_theme_override(control: Control, group: String, item_name: String) -> void:
	match group:
		"colors":
			control.remove_theme_color_override(item_name)
		"constants":
			control.remove_theme_constant_override(item_name)
		"fonts":
			control.remove_theme_font_override(item_name)
		"font_sizes":
			control.remove_theme_font_size_override(item_name)
		"icons":
			control.remove_theme_icon_override(item_name)
		"styles":
			control.remove_theme_stylebox_override(item_name)


func _hide_existing_children(parent: Control) -> void:
	if parent == null:
		return
	for child in parent.get_children():
		if child is CanvasItem:
			(child as CanvasItem).visible = false


func _reparent_control(control: Control, parent: Node) -> void:
	if control == null or parent == null or control.get_parent() == parent:
		return
	if control.get_parent() == null:
		parent.add_child(control)
	else:
		control.reparent(parent)
	control.visible = true


func _name_entry_button(button: Button, entry_id: String) -> void:
	if button == null:
		return
	button.set_meta("world_hud_entry_id", entry_id)
	button.name = "WorldHudEntry%s" % entry_id.capitalize().replace(" ", "")


func _button_for_entry(
	controls: Dictionary,
	button_source: Dictionary,
	entry_id: String
) -> Button:
	var aliases_value = BUTTON_ALIASES.get(entry_id, [entry_id])
	var aliases := aliases_value as Array
	var nested := _control_from(button_source, aliases) as Button
	if nested != null:
		return nested
	return _control_from(controls, aliases) as Button


func _control_from(source: Dictionary, aliases: Array) -> Control:
	for alias_value in aliases:
		var alias := str(alias_value)
		if source.has(alias) and source.get(alias) is Control:
			return source.get(alias) as Control
	return null


func _flatten_presenter_state(state: Dictionary) -> Dictionary:
	if not state.has("identity") and not state.has("runtime"):
		return state
	var flattened: Dictionary = {}
	var identity_value = state.get("identity", {})
	if identity_value is Dictionary:
		flattened.merge(identity_value as Dictionary, true)
	var runtime_value = state.get("runtime", {})
	if runtime_value is Dictionary:
		flattened.merge(runtime_value as Dictionary, true)
	for key in state:
		if key not in ["identity", "runtime"]:
			flattened[key] = state.get(key)
	return flattened


func _normalized_entry_id(entry_id: String) -> String:
	var normalized := entry_id.strip_edges().to_lower()
	match normalized:
		"stop", "挂机":
			return "hang"
		"bag", "背包":
			return "backpack"
		"player", "player_status", "角色":
			return "character"
		"task", "任务":
			return "quest"
		"auto_settings", "内挂":
			return "auto"
		"qa", "gm工具":
			return "gm"
	return normalized


func _cell_coordinates(cell) -> Vector2i:
	if cell is Vector2i:
		return cell as Vector2i
	if cell is Vector2:
		var vector := cell as Vector2
		return Vector2i(roundi(vector.x), roundi(vector.y))
	if cell is Dictionary:
		var dictionary := cell as Dictionary
		return Vector2i(
			int(dictionary.get("x", dictionary.get("cellX", dictionary.get("cell_x", 0)))),
			int(dictionary.get("y", dictionary.get("cellY", dictionary.get("cell_y", 0))))
		)
	if cell is Array:
		var values := cell as Array
		if values.size() >= 2:
			return Vector2i(int(values[0]), int(values[1]))
	return Vector2i.ZERO


func _state_bool(
	state: Dictionary,
	aliases: Array,
	default_value: bool
) -> bool:
	for alias_value in aliases:
		var alias := str(alias_value)
		if state.has(alias):
			return bool(state.get(alias, default_value))
	return default_value


func _rect_in_view(control: Control) -> Rect2:
	if control == null or not is_instance_valid(control):
		return Rect2()
	var root_rect := get_global_rect()
	var control_rect := control.get_global_rect()
	return Rect2(control_rect.position - root_rect.position, control_rect.size)
