extends SceneTree

const WorldHudAwakenedPresenter := preload(
	"res://scripts/ui/world_hud_awakened_presenter.gd"
)
const WorldHudAwakenedView := preload(
	"res://scripts/ui/world_hud_awakened_view.gd"
)
const WorldHudAwakenedVisualSkin := preload(
	"res://scripts/ui/world_hud_awakened_visual_skin.gd"
)

const VIEWPORT_SIZE := Vector2i(1280, 720)
const SPECTATOR_POINT := Vector2(640.0, 360.0)
const ENTRY_IDS: Array[String] = [
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
const BATTLE_LOCKED_ENTRY_IDS: Array[String] = [
	"character",
	"backpack",
	"equipment",
	"pet",
	"map",
	"chat",
	"party",
	"family",
	"gm",
]
const BATTLE_AVAILABLE_ENTRY_IDS: Array[String] = [
	"hang",
	"codex",
	"quest",
	"market",
	"mailbox",
	"auto",
	"account",
]
const TECHNICAL_TEXT_TOKENS: Array[String] = [
	"pc",
	"手机",
	"版本",
	"qa",
]
const PHANTOM_FIELD_KEYS: Array[String] = [
	"activity",
	"vip",
	"currency",
]
const ROLLBACK_NONCANONICAL_INTRINSIC_MINIMUM_NAMES: Array[String] = [
	"LegacyStatusLabel",
	"LegacyVersionLabel",
	"LegacyDetailLabel",
	"LegacyTaskRouteButton",
	"LegacyMessageBox",
	"LegacyCollapseButton",
]

var _errors: Array[String] = []
var _view: Control
var _legacy_controls: Dictionary = {}
var _original_entries: Dictionary = {}
var _collapsed_restore_only_verified := false
var _rollback_expectations: Array[Dictionary] = []
var _rollback_result: Dictionary = {}
var _fixture_message_expanded := false
var _fixture_message_history: Array[String] = ["欢迎来到火芽训练场"]
var _fixture_message_clear_count := 0


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	root.size = VIEWPORT_SIZE
	root.content_scale_size = VIEWPORT_SIZE
	root.content_scale_mode = Window.CONTENT_SCALE_MODE_CANVAS_ITEMS

	var legacy_host := Control.new()
	legacy_host.name = "LegacyWorldHudHost"
	legacy_host.position = Vector2.ZERO
	legacy_host.size = Vector2(VIEWPORT_SIZE)
	root.add_child(legacy_host)
	_legacy_controls = _build_legacy_controls(legacy_host)
	_configure_rollback_fixture()
	var rollback_message_panel: Control = (
		_legacy_controls.get("battleMessagePanel") as Control
	)
	_expect(
		rollback_message_panel != null and not rollback_message_panel.visible,
		"rollback fixture 消息根在基线排版前应保持隐藏"
	)
	rollback_message_panel.visible = true
	await process_frame
	await process_frame
	rollback_message_panel.visible = false
	_rollback_expectations = _capture_rollback_expectations()
	_append_internal_auto_name_fixture_errors()
	_append_noncanonical_intrinsic_minimum_fixture_errors()

	_view = WorldHudAwakenedView.new()
	_view.name = "WorldHudAwakenedViewCheckSubject"
	_view.position = Vector2.ZERO
	_view.size = Vector2(VIEWPORT_SIZE)
	legacy_host.add_child(_view)
	var mount_result = _view.call(
		"mount_existing_controls",
		_legacy_controls
	)
	_expect(
		mount_result is Dictionary
			and bool((mount_result as Dictionary).get("ok", false)),
		"世界 HUD 无法挂载完整旧控件集合：%s" % str(mount_result)
	)
	_expect(
		mount_result is Dictionary
			and not bool((mount_result as Dictionary).get("alreadyMounted", true))
			and (mount_result as Dictionary).get("missingIds", []).is_empty(),
		"首次挂载不应被识别为重复挂载或遗漏入口：%s" % str(mount_result)
	)
	_append_entry_identity_errors()

	var combined := WorldHudAwakenedPresenter.combined_state(
		_fixture_profile(),
		_fixture_runtime(false)
	)
	var flattened := _flatten_presenter_state(combined)
	_append_presenter_projection_errors(combined, flattened)
	_view.call("apply_view_state", flattened)
	_view.call("apply_layout", Vector2(VIEWPORT_SIZE), {})
	await process_frame
	await process_frame

	_append_version_and_text_errors()
	_append_portrait_errors()
	_append_portrait_fallback_errors(flattened)
	_append_player_gate_errors()
	_append_message_action_errors()
	await _append_task_entry_bounds_errors()

	var more_button := _named_button("WorldHudMoreButton")
	_expect(more_button != null, "世界 HUD 缺少更多按钮")
	if more_button != null:
		more_button.pressed.emit()
	await process_frame
	await process_frame
	_append_expanded_layout_errors()
	_append_spectator_point_errors()

	_view.call("set_collapsed", true)
	await process_frame
	await process_frame
	_append_collapsed_errors()

	var restore_button := _named_button("WorldHudRestoreButton")
	if restore_button != null:
		restore_button.pressed.emit()
	await process_frame
	await process_frame
	_append_restored_errors()
	await _append_battle_visibility_errors()
	_append_battle_gate_errors()
	_mutate_mounted_controls_for_rollback_check()
	_append_mount_mutation_errors()
	var player_portrait_loaded := _entry_has_icon("character")
	var battle_pet_portrait_loaded := _entry_has_icon("pet")
	_rollback_result = _view.call("rollback_mount") as Dictionary
	_append_mount_rollback_structure_errors()
	_append_mount_write_set_errors("rollback 同调用")
	_expect(
		rollback_message_panel != null and not rollback_message_panel.visible,
		"rollback 同调用没有恢复隐藏的消息根"
	)
	rollback_message_panel.visible = true
	await process_frame
	await process_frame
	rollback_message_panel.visible = false
	_append_mount_rollback_errors()
	_append_mount_write_set_errors("rollback settled")
	_append_mount_name_helper_contract_errors(legacy_host)

	var report := {
		"schemaVersion": 1,
		"reportType": "beastbound.world_hud_awakened_view_check",
		"result": "PASS" if _errors.is_empty() else "FAIL",
		"viewport": {
			"width": VIEWPORT_SIZE.x,
			"height": VIEWPORT_SIZE.y,
		},
		"entryButtonCount": _original_entries.size(),
		"entryIdentityPreserved": _entry_identity_preserved(),
		"spectatorPoint": {
			"x": SPECTATOR_POINT.x,
			"y": SPECTATOR_POINT.y,
		},
		"playerPortraitLoaded": player_portrait_loaded,
		"battlePetPortraitLoaded": battle_pet_portrait_loaded,
		"collapsedRestoreOnly": _collapsed_restore_only_verified,
		"rollbackRestored": bool(_rollback_result.get("ok", false)),
		"rollbackRestoredCount": int(_rollback_result.get("restoredCount", 0)),
		"errors": _errors,
	}
	print(
		"WORLD_HUD_AWAKENED_VIEW_CHECK: %s"
		% JSON.stringify(report)
	)
	legacy_host.queue_free()
	await process_frame
	quit(0 if _errors.is_empty() else 1)


func _build_legacy_controls(host: Control) -> Dictionary:
	var top_panel := _legacy_panel(host, "LegacyTopPanel")
	var side_panel := _legacy_panel(host, "LegacySidePanel")
	var message_panel := _legacy_panel(host, "LegacyBattleMessagePanel")
	var action_bar := _legacy_panel(host, "LegacyActionBar")

	var status_label := Label.new()
	status_label.name = "LegacyStatusLabel"
	status_label.text = "万兽纪元"
	top_panel.add_child(status_label)
	var version_label := Label.new()
	version_label.name = "LegacyVersionLabel"
	version_label.text = "版本 0.1.0 | PC | QA | 手机"
	top_panel.add_child(version_label)

	var detail_label := Label.new()
	detail_label.name = "LegacyDetailLabel"
	detail_label.text = "前往训练场拜访导师"
	side_panel.add_child(detail_label)
	var task_route_button := Button.new()
	task_route_button.name = "LegacyTaskRouteButton"
	task_route_button.text = "前往"
	side_panel.add_child(task_route_button)

	var message_box := VBoxContainer.new()
	message_box.name = "LegacyMessageBox"
	message_panel.add_child(message_box)
	var message_header := HBoxContainer.new()
	message_header.name = "LegacyMessageHeader"
	message_box.add_child(message_header)
	var message_title := Label.new()
	message_title.text = "消息"
	message_header.add_child(message_title)
	var message_expand_button := Button.new()
	message_expand_button.name = "LegacyMessageExpandButton"
	message_expand_button.text = "展开"
	message_expand_button.pressed.connect(_fixture_toggle_message_expanded)
	message_header.add_child(message_expand_button)
	var message_clear_button := Button.new()
	message_clear_button.name = "LegacyMessageClearButton"
	message_clear_button.text = "清空"
	message_clear_button.pressed.connect(_fixture_clear_message)
	message_header.add_child(message_clear_button)
	var battle_log := RichTextLabel.new()
	battle_log.name = "BattleLog"
	battle_log.text = "欢迎来到火芽训练场"
	message_box.add_child(battle_log)

	var collapse_button := Button.new()
	collapse_button.name = "LegacyCollapseButton"
	collapse_button.text = "收起"
	action_bar.add_child(collapse_button)

	var entry_labels := {
		"hang": "挂机",
		"character": "角色",
		"backpack": "背包",
		"equipment": "装备",
		"pet": "战宠",
		"codex": "图鉴",
		"quest": "任务",
		"map": "地图",
		"chat": "聊天",
		"party": "队伍",
		"family": "家族",
		"market": "买卖",
		"mailbox": "信箱",
		"auto": "内挂",
		"account": "账号",
		"gm": "GM",
	}
	var buttons: Dictionary = {}
	for entry_id in ENTRY_IDS:
		var button := Button.new()
		button.name = "LegacyEntry%s" % entry_id.capitalize()
		button.text = str(entry_labels.get(entry_id, entry_id))
		host.add_child(button)
		buttons[entry_id] = button
		_original_entries[entry_id] = button

	return {
		"topPanel": top_panel,
		"sidePanel": side_panel,
		"battleMessagePanel": message_panel,
		"actionBar": action_bar,
		"statusLabel": status_label,
		"versionLabel": version_label,
		"detailLabel": detail_label,
		"taskRouteButton": task_route_button,
		"battleLogLabel": battle_log,
		"battleMessageExpandButton": message_expand_button,
		"battleMessageClearButton": message_clear_button,
		"actionBarCollapseButton": collapse_button,
		"buttons": buttons,
	}


func _legacy_panel(host: Control, node_name: String) -> Panel:
	var panel := Panel.new()
	panel.name = node_name
	host.add_child(panel)
	return panel


func _configure_rollback_fixture() -> void:
	var roots := [
		_legacy_controls.get("topPanel") as Control,
		_legacy_controls.get("sidePanel") as Control,
		_legacy_controls.get("battleMessagePanel") as Control,
		_legacy_controls.get("actionBar") as Control,
	]
	for index in range(roots.size()):
		var control := roots[index] as Control
		if control == null:
			continue
		control.position = Vector2(17.0 + 29.0 * index, 23.0 + 31.0 * index)
		control.size = Vector2(210.0 + 13.0 * index, 120.0 + 17.0 * index)
		control.custom_minimum_size = Vector2(41.0 + index, 37.0 + index)
		control.visible = index != 2
	var original_panel_style := StyleBoxFlat.new()
	original_panel_style.bg_color = Color(0.19, 0.31, 0.47, 0.73)
	(roots[0] as Control).add_theme_stylebox_override("panel", original_panel_style)
	for index in range(ENTRY_IDS.size()):
		var button := _original_entries.get(ENTRY_IDS[index]) as Button
		if button == null:
			continue
		button.position = Vector2(5.0 + 3.0 * index, 7.0 + 2.0 * index)
		button.size = Vector2(48.0 + index, 34.0 + index)
		button.visible = index % 4 != 1
	var hang_button := _original_entries.get("hang") as Button
	if hang_button != null:
		hang_button.text = "旧挂机入口"
		hang_button.anchor_left = 0.0
		hang_button.anchor_top = 0.0
		hang_button.anchor_right = 0.0
		hang_button.anchor_bottom = 0.0
		hang_button.offset_left = 37.0
		hang_button.offset_top = 41.0
		hang_button.offset_right = 257.0
		hang_button.offset_bottom = 121.0
		hang_button.disabled = true
		hang_button.mouse_filter = Control.MOUSE_FILTER_PASS
		hang_button.set_meta("rollback_fixture_meta", "原始挂机控件")
		hang_button.add_theme_color_override("font_color", Color(0.22, 0.81, 0.63, 1.0))
	var status_label := _legacy_controls.get("statusLabel") as Label
	if status_label != null:
		status_label.text = "旧世界状态"


func _append_internal_auto_name_fixture_errors() -> void:
	var internal_label_expectations: Array[Dictionary] = []
	for expected in _rollback_expectations:
		var saved_name := str(expected.get("name", ""))
		if saved_name.begins_with("@Label@"):
			internal_label_expectations.append(expected)
	_expect(
		internal_label_expectations.size() == 1,
		"rollback fixture 必须恰有一个内部自动命名 Label"
	)
	if internal_label_expectations.size() != 1:
		return
	var expected := internal_label_expectations[0]
	var control := expected.get("control") as Control
	_expect(control is Label, "rollback 内部自动命名控件必须是 Label")
	if not (control is Label):
		return
	_expect((control as Label).text == "消息", "rollback 内部自动命名 Label 角色错误")
	_expect(
		control.get_parent() != null
			and control.get_parent().name == "LegacyMessageHeader",
		"rollback 内部自动命名 Label 父级错误"
	)


func _append_noncanonical_intrinsic_minimum_fixture_errors() -> void:
	var noncanonical_count := 0
	for node_name in ROLLBACK_NONCANONICAL_INTRINSIC_MINIMUM_NAMES:
		var control := legacy_host_find(node_name) as Control
		_expect(control != null, "rollback 非 canonical fixture 缺少控件：%s" % node_name)
		if control == null:
			continue
		var expected := _rollback_expectation_for(control)
		_expect(not expected.is_empty(), "rollback 非 canonical fixture 缺少快照：%s" % node_name)
		if expected.is_empty():
			continue
		var intrinsic_minimum := control.get_combined_minimum_size()
		_expect(
			intrinsic_minimum.x > 0.0 or intrinsic_minimum.y > 0.0,
			"rollback 非 canonical fixture 没有 intrinsic minimum：%s" % node_name
		)
		var parent_area_size := control.get_parent_area_size()
		var expected_position: Vector2 = expected.get("position", control.position)
		var expected_size: Vector2 = expected.get("size", control.size)
		var canonical_x := expected_position.x
		if control.is_layout_rtl():
			canonical_x = parent_area_size.x - canonical_x - expected_size.x
		var canonical_right := (
			canonical_x
			+ expected_size.x
			- float(expected.get("anchorRight", control.anchor_right)) * parent_area_size.x
		)
		var canonical_bottom := (
			expected_position.y
			+ expected_size.y
			- float(expected.get("anchorBottom", control.anchor_bottom)) * parent_area_size.y
		)
		var raw_right := float(expected.get("offsetRight", control.offset_right))
		var raw_bottom := float(expected.get("offsetBottom", control.offset_bottom))
		var right_is_noncanonical := not is_equal_approx(raw_right, canonical_right)
		var bottom_is_noncanonical := not is_equal_approx(raw_bottom, canonical_bottom)
		_expect(
			right_is_noncanonical and bottom_is_noncanonical,
			"rollback fixture 没有锁住 raw R/B 非 canonical 状态：%s" % node_name
		)
		if right_is_noncanonical and bottom_is_noncanonical:
			noncanonical_count += 1
	_expect(
		noncanonical_count == ROLLBACK_NONCANONICAL_INTRINSIC_MINIMUM_NAMES.size(),
		"rollback fixture 非 canonical intrinsic-min 控件数量错误：%d" % noncanonical_count
	)


func _control_mount_write_set_snapshot(control: Control) -> Dictionary:
	var result := {
		"name": control.name,
		"visible": control.visible,
		"modulate": control.modulate,
		"selfModulate": control.self_modulate,
		"zIndex": control.z_index,
		"zAsRelative": control.z_as_relative,
		"showBehindParent": control.show_behind_parent,
		"metadata": _control_metadata_snapshot(control),
		"control": {
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
			"themeOverrides": _control_theme_override_snapshot(control),
		},
	}
	if control is Label:
		var label := control as Label
		result["label"] = {
			"text": label.text,
			"horizontalAlignment": label.horizontal_alignment,
			"verticalAlignment": label.vertical_alignment,
			"autowrapMode": label.autowrap_mode,
			"clipText": label.clip_text,
			"textOverrunBehavior": label.text_overrun_behavior,
			"maxLinesVisible": label.max_lines_visible,
		}
	elif control is RichTextLabel:
		var rich_text := control as RichTextLabel
		result["richText"] = {
			"text": rich_text.text,
			"fitContent": rich_text.fit_content,
			"scrollActive": rich_text.scroll_active,
			"autowrapMode": rich_text.autowrap_mode,
		}
	if control is BaseButton:
		var base_button := control as BaseButton
		result["baseButton"] = {
			"disabled": base_button.disabled,
			"toggleMode": base_button.toggle_mode,
			"buttonPressed": base_button.button_pressed,
			"actionMode": base_button.action_mode,
		}
	if control is Button:
		var button := control as Button
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


func _control_theme_override_snapshot(control: Control) -> Dictionary:
	var result: Dictionary = {}
	for property in control.get_property_list():
		var property_name := str((property as Dictionary).get("name", ""))
		if not property_name.begins_with("theme_override_"):
			continue
		var slash_index := property_name.find("/")
		if slash_index < 0 or slash_index >= property_name.length() - 1:
			continue
		var group := property_name.substr(15, slash_index - 15)
		var item_name := property_name.substr(slash_index + 1)
		if _control_has_theme_override(control, group, item_name):
			result[property_name] = control.get(property_name)
	return result


func _control_has_theme_override(
	control: Control,
	group: String,
	item_name: String
) -> bool:
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


func _append_mount_write_set_errors(phase_label: String) -> void:
	for expected in _rollback_expectations:
		var control := expected.get("control") as Control
		_expect(
			control != null and is_instance_valid(control),
			"%s mount write-set 丢失真实控件：%s"
				% [phase_label, str(expected.get("name", "unknown"))]
		)
		if control == null or not is_instance_valid(control):
			continue
		var expected_write_set = expected.get("mountWriteSet", {}) as Dictionary
		var actual_write_set := _control_mount_write_set_snapshot(control)
		_expect(
			not expected_write_set.is_empty(),
			"%s mount write-set 缺少独立基线：%s" % [phase_label, control.name]
		)
		_expect(
			actual_write_set.recursive_equal(expected_write_set, 0),
			"%s mount write-set 不一致：%s" % [phase_label, control.name]
		)


func _append_mount_name_helper_contract_errors(host: Control) -> void:
	var internal_same := Label.new()
	host.add_child(internal_same)
	var internal_same_name: StringName = internal_same.name
	var internal_same_errors: Array[String] = []
	_view.call(
		"_restore_mount_item_name",
		internal_same,
		{"name": internal_same_name},
		internal_same_errors
	)
	_expect(
		str(internal_same_name).begins_with("@Label@"),
		"name helper internal-same fixture 不是内部自动名"
	)
	_expect(
		internal_same.name == internal_same_name and internal_same_errors.is_empty(),
		"name helper internal-same 不应写名或报错"
	)

	var internal_changed := Label.new()
	host.add_child(internal_changed)
	var internal_changed_saved_name: StringName = internal_changed.name
	internal_changed.name = "ChangedInternalReadable"
	var internal_changed_errors: Array[String] = []
	_view.call(
		"_restore_mount_item_name",
		internal_changed,
		{"name": internal_changed_saved_name},
		internal_changed_errors
	)
	_expect(
		str(internal_changed_saved_name).begins_with("@Label@"),
		"name helper internal-changed fixture 不是内部自动名"
	)
	_expect(
		internal_changed.name == "ChangedInternalReadable"
			and not str(internal_changed.name).begins_with("_Label_")
			and not internal_changed_errors.is_empty(),
		"name helper internal-changed 必须 fail-closed 且禁止规范化写回"
	)

	var ordinary_changed := Label.new()
	ordinary_changed.name = "ReadableMountOriginal"
	host.add_child(ordinary_changed)
	var ordinary_saved_name: StringName = ordinary_changed.name
	ordinary_changed.name = "ReadableMountChanged"
	var ordinary_errors: Array[String] = []
	_view.call(
		"_restore_mount_item_name",
		ordinary_changed,
		{"name": ordinary_saved_name},
		ordinary_errors
	)
	_expect(
		ordinary_changed.name == ordinary_saved_name and ordinary_errors.is_empty(),
		"name helper ordinary-changed 必须精确恢复可读名"
	)

	internal_same.free()
	internal_changed.free()
	ordinary_changed.free()


func _capture_rollback_expectations() -> Array[Dictionary]:
	var candidates: Array[Control] = []
	for key in ["topPanel", "sidePanel", "battleMessagePanel", "actionBar"]:
		_append_rollback_candidates(_legacy_controls.get(key) as Node, candidates)
	for entry_id in ENTRY_IDS:
		var button := _original_entries.get(entry_id) as Button
		if button != null:
			candidates.append(button)
	var result: Array[Dictionary] = []
	var seen: Dictionary = {}
	for control in candidates:
		if control == null or seen.has(control.get_instance_id()):
			continue
		seen[control.get_instance_id()] = true
		result.append({
			"control": control,
			"mountWriteSet": _control_mount_write_set_snapshot(control),
			"parent": control.get_parent(),
			"index": control.get_index(),
			"name": control.name,
			"visible": control.visible,
			"position": control.position,
			"size": control.size,
			"rotation": control.rotation,
			"scale": control.scale,
			"pivotOffset": control.pivot_offset,
			"anchorLeft": control.anchor_left,
			"anchorTop": control.anchor_top,
			"anchorRight": control.anchor_right,
			"anchorBottom": control.anchor_bottom,
			"offsetLeft": control.offset_left,
			"offsetTop": control.offset_top,
			"offsetRight": control.offset_right,
			"offsetBottom": control.offset_bottom,
			"customMinimumSize": control.custom_minimum_size,
			"mouseFilter": control.mouse_filter,
			"metadata": _control_metadata_snapshot(control),
			"buttonText": (control as Button).text if control is Button else null,
			"buttonDisabled": (control as Button).disabled if control is Button else null,
			"buttonIcon": (control as Button).icon if control is Button else null,
			"labelText": (control as Label).text if control is Label else null,
			"panelStyleOverride": control.has_theme_stylebox_override("panel"),
			"panelStyle": (
				control.get_theme_stylebox("panel")
				if control.has_theme_stylebox_override("panel")
				else null
			),
			"fontColorOverride": control.has_theme_color_override("font_color"),
			"fontColor": (
				control.get_theme_color("font_color")
				if control.has_theme_color_override("font_color")
				else Color.TRANSPARENT
			),
		})
	return result


func _control_metadata_snapshot(control: Control) -> Dictionary:
	var result: Dictionary = {}
	for meta_name in control.get_meta_list():
		result[meta_name] = control.get_meta(meta_name)
	return result


func _append_rollback_candidates(node: Node, result: Array[Control]) -> void:
	if node == null:
		return
	if node is Control:
		result.append(node as Control)
	for child in node.get_children():
		_append_rollback_candidates(child, result)


func _mutate_mounted_controls_for_rollback_check() -> void:
	var hang_button := _original_entries.get("hang") as Button
	var expected := _rollback_expectation_for(hang_button)
	if hang_button != null and not expected.is_empty():
		hang_button.name = "MountedReadableNameMutation"
		hang_button.offset_left = float(expected.get("offsetLeft", 0.0)) + 11.0
		hang_button.offset_top = float(expected.get("offsetTop", 0.0)) + 13.0
		hang_button.offset_right = float(expected.get("offsetRight", 0.0)) + 17.0
		hang_button.offset_bottom = float(expected.get("offsetBottom", 0.0)) + 19.0
		hang_button.text = "挂载态改写"
		hang_button.disabled = not bool(expected.get("buttonDisabled", false))
		hang_button.mouse_filter = (
			Control.MOUSE_FILTER_STOP
			if expected.get("mouseFilter") != Control.MOUSE_FILTER_STOP
			else Control.MOUSE_FILTER_IGNORE
		)
		hang_button.set_meta("rollback_fixture_meta", "挂载态改写")
		hang_button.set_meta("mount_only_meta", true)
	var status_label := _legacy_controls.get("statusLabel") as Label
	if status_label != null:
		status_label.text = "挂载态状态文案"


func _append_mount_mutation_errors() -> void:
	var hang_button := _original_entries.get("hang") as Button
	var expected := _rollback_expectation_for(hang_button)
	_expect(hang_button != null and not expected.is_empty(), "rollback 变异 fixture 缺少挂机按钮")
	if hang_button != null and not expected.is_empty():
		_expect(
			hang_button.name != expected.get("name"),
			"rollback fixture 未真实改写可读 Button.name"
		)
		_expect(not is_equal_approx(hang_button.offset_left, float(expected.get("offsetLeft", 0.0))), "rollback fixture 未真实改写左 offset")
		_expect(not is_equal_approx(hang_button.offset_top, float(expected.get("offsetTop", 0.0))), "rollback fixture 未真实改写上 offset")
		_expect(not is_equal_approx(hang_button.offset_right, float(expected.get("offsetRight", 0.0))), "rollback fixture 未真实改写右 offset")
		_expect(not is_equal_approx(hang_button.offset_bottom, float(expected.get("offsetBottom", 0.0))), "rollback fixture 未真实改写下 offset")
		_expect(hang_button.text != str(expected.get("buttonText", "")), "rollback fixture 未真实改写 Button.text")
		_expect(hang_button.disabled != bool(expected.get("buttonDisabled", false)), "rollback fixture 未真实改写 Button.disabled")
		_expect(hang_button.mouse_filter != expected.get("mouseFilter"), "rollback fixture 未真实改写 Button.mouse_filter")
		_expect(hang_button.get_meta("rollback_fixture_meta", "") == "挂载态改写", "rollback fixture 未真实改写 Button meta")
		_expect(hang_button.has_meta("mount_only_meta"), "rollback fixture 未写入 mount-only meta")
	var status_label := _legacy_controls.get("statusLabel") as Label
	var status_expected := _rollback_expectation_for(status_label)
	_expect(
		status_label != null
			and not status_expected.is_empty()
			and status_label.text != str(status_expected.get("labelText", "")),
		"rollback fixture 未真实改写 Label.text"
	)


func _rollback_expectation_for(control: Control) -> Dictionary:
	if control == null:
		return {}
	for expected in _rollback_expectations:
		if expected.get("control") == control:
			return expected
	return {}


func _append_mount_rollback_structure_errors() -> void:
	_expect(
		bool(_rollback_result.get("ok", false)),
		"正式 HUD rollback 同调用结构失败：%s" % str(_rollback_result)
	)
	_expect(
		int(_rollback_result.get("restoredCount", 0))
			== _rollback_expectations.size(),
		"正式 HUD rollback 同调用恢复数量不完整：%s" % str(_rollback_result)
	)
	for expected in _rollback_expectations:
		var control := expected.get("control") as Control
		var label := str(expected.get("name", "unknown"))
		_expect(
			control != null and is_instance_valid(control),
			"rollback 同调用丢失真实控件：%s" % label
		)
		if control == null or not is_instance_valid(control):
			continue
		_expect(
			control.get_parent() == expected.get("parent"),
			"rollback 同调用父级错误：%s" % label
		)
		_expect(
			control.get_index() == int(expected.get("index", -1)),
			"rollback 同调用索引错误：%s" % label
		)
		_expect(
			control.position.is_equal_approx(
				expected.get("position", Vector2.ZERO)
			),
			"rollback 同调用位置错误：%s" % label
		)
		_expect(
			control.size.is_equal_approx(expected.get("size", Vector2.ZERO)),
			"rollback 同调用尺寸错误：%s" % label
		)
		for anchor_pair in [
			[control.anchor_left, expected.get("anchorLeft", 0.0), "左"],
			[control.anchor_top, expected.get("anchorTop", 0.0), "上"],
			[control.anchor_right, expected.get("anchorRight", 0.0), "右"],
			[control.anchor_bottom, expected.get("anchorBottom", 0.0), "下"],
		]:
			_expect(
				is_equal_approx(float(anchor_pair[0]), float(anchor_pair[1])),
				"rollback 同调用%s锚点错误：%s" % [str(anchor_pair[2]), label]
			)
		for offset_pair in [
			[control.offset_left, expected.get("offsetLeft", 0.0), "左"],
			[control.offset_top, expected.get("offsetTop", 0.0), "上"],
			[control.offset_right, expected.get("offsetRight", 0.0), "右"],
			[control.offset_bottom, expected.get("offsetBottom", 0.0), "下"],
		]:
			_expect(
				is_equal_approx(float(offset_pair[0]), float(offset_pair[1])),
				"rollback 同调用%s offset 错误：%s" % [str(offset_pair[2]), label]
			)
		_expect(
			is_equal_approx(control.rotation, float(expected.get("rotation", 0.0))),
			"rollback 同调用旋转错误：%s" % label
		)
		_expect(
			control.scale.is_equal_approx(expected.get("scale", Vector2.ONE)),
			"rollback 同调用缩放错误：%s" % label
		)
		_expect(
			control.pivot_offset.is_equal_approx(
				expected.get("pivotOffset", Vector2.ZERO)
			),
			"rollback 同调用轴心错误：%s" % label
		)
	var expand_button := (
		_legacy_controls.get("battleMessageExpandButton") as Button
	)
	var clear_button := (
		_legacy_controls.get("battleMessageClearButton") as Button
	)
	_expect(
		expand_button != null
			and expand_button.pressed.is_connected(
				_fixture_toggle_message_expanded
			),
		"rollback 同调用丢失原展开按钮权威连接"
	)
	_expect(
		clear_button != null
			and clear_button.pressed.is_connected(_fixture_clear_message),
		"rollback 同调用丢失原清空按钮权威连接"
	)
	for artifact_name in [
		"WorldHudTopSurface",
		"WorldHudSideSurface",
		"WorldHudMessageSurface",
		"WorldHudDockSurface",
	]:
		_expect(
			legacy_host_find(artifact_name) == null,
			"rollback 同调用遗留正式 HUD 节点：%s" % artifact_name
		)


func _append_mount_rollback_errors() -> void:
	_expect(
		bool(_rollback_result.get("ok", false)),
		"正式 HUD rollback 失败：%s" % str(_rollback_result)
	)
	_expect(
		int(_rollback_result.get("restoredCount", 0)) == _rollback_expectations.size(),
		"正式 HUD rollback 恢复数量不完整：%s" % str(_rollback_result)
	)
	for expected in _rollback_expectations:
		var control := expected.get("control") as Control
		var label := str(expected.get("name", "unknown"))
		_expect(control != null and is_instance_valid(control), "rollback 丢失真实控件：%s" % label)
		if control == null or not is_instance_valid(control):
			continue
		_expect(control.get_parent() == expected.get("parent"), "rollback 父级错误：%s" % label)
		_expect(control.get_index() == int(expected.get("index", -1)), "rollback 索引错误：%s" % label)
		if not label.begins_with("@"):
			_expect(control.name == expected.get("name"), "rollback 名称错误：%s" % label)
		_expect(control.visible == bool(expected.get("visible", true)), "rollback 可见性错误：%s" % label)
		_expect(control.position.is_equal_approx(expected.get("position", Vector2.ZERO)), "rollback 位置错误：%s" % label)
		_expect(control.size.is_equal_approx(expected.get("size", Vector2.ZERO)), "rollback 尺寸错误：%s" % label)
		_expect(is_equal_approx(control.rotation, float(expected.get("rotation", 0.0))), "rollback 旋转错误：%s" % label)
		_expect(control.scale.is_equal_approx(expected.get("scale", Vector2.ONE)), "rollback 缩放错误：%s" % label)
		_expect(control.pivot_offset.is_equal_approx(expected.get("pivotOffset", Vector2.ZERO)), "rollback 轴心错误：%s" % label)
		_expect(is_equal_approx(control.anchor_left, float(expected.get("anchorLeft", 0.0))), "rollback 左锚点错误：%s" % label)
		_expect(is_equal_approx(control.anchor_top, float(expected.get("anchorTop", 0.0))), "rollback 上锚点错误：%s" % label)
		_expect(is_equal_approx(control.anchor_right, float(expected.get("anchorRight", 0.0))), "rollback 右锚点错误：%s" % label)
		_expect(is_equal_approx(control.anchor_bottom, float(expected.get("anchorBottom", 0.0))), "rollback 下锚点错误：%s" % label)
		_expect(is_equal_approx(control.offset_left, float(expected.get("offsetLeft", 0.0))), "rollback 左 offset 错误：%s" % label)
		_expect(is_equal_approx(control.offset_top, float(expected.get("offsetTop", 0.0))), "rollback 上 offset 错误：%s" % label)
		_expect(is_equal_approx(control.offset_right, float(expected.get("offsetRight", 0.0))), "rollback 右 offset 错误：%s" % label)
		_expect(is_equal_approx(control.offset_bottom, float(expected.get("offsetBottom", 0.0))), "rollback 下 offset 错误：%s" % label)
		_expect(control.custom_minimum_size.is_equal_approx(expected.get("customMinimumSize", Vector2.ZERO)), "rollback 最小尺寸错误：%s" % label)
		_expect(control.mouse_filter == expected.get("mouseFilter"), "rollback mouse_filter 错误：%s" % label)
		_expect(_control_metadata_snapshot(control) == expected.get("metadata"), "rollback metadata 错误：%s" % label)
		if control is Button:
			var button := control as Button
			_expect(button.text == str(expected.get("buttonText", "")), "rollback Button.text 错误：%s" % label)
			_expect(button.disabled == bool(expected.get("buttonDisabled", false)), "rollback Button.disabled 错误：%s" % label)
			_expect(button.icon == expected.get("buttonIcon"), "rollback Button.icon 错误：%s" % label)
		if control is Label:
			_expect((control as Label).text == str(expected.get("labelText", "")), "rollback Label.text 错误：%s" % label)
		var panel_override_expected := bool(expected.get("panelStyleOverride", false))
		_expect(control.has_theme_stylebox_override("panel") == panel_override_expected, "rollback panel 主题覆盖状态错误：%s" % label)
		if panel_override_expected:
			_expect(control.get_theme_stylebox("panel") == expected.get("panelStyle"), "rollback panel 主题资源错误：%s" % label)
		var font_color_expected := bool(expected.get("fontColorOverride", false))
		_expect(control.has_theme_color_override("font_color") == font_color_expected, "rollback 字色覆盖状态错误：%s" % label)
		if font_color_expected:
			_expect(control.get_theme_color("font_color").is_equal_approx(expected.get("fontColor", Color.TRANSPARENT)), "rollback 字色错误：%s" % label)
	for artifact_name in [
		"WorldHudTopSurface",
		"WorldHudSideSurface",
		"WorldHudMessageSurface",
		"WorldHudDockSurface",
	]:
		var artifact := legacy_host_find(artifact_name)
		_expect(artifact == null, "rollback 遗留正式 HUD 节点：%s" % artifact_name)


func legacy_host_find(node_name: String) -> Node:
	if _rollback_expectations.is_empty():
		return null
	var first := _rollback_expectations[0].get("control") as Control
	if first == null:
		return null
	var host_node := first.get_parent()
	return host_node.find_child(node_name, true, false) if host_node != null else null


func _append_entry_identity_errors() -> void:
	_expect(
		_original_entries.size() == ENTRY_IDS.size(),
		"检查 fixture 没有构造恰好 16 个真实 Button"
	)
	for entry_id in ENTRY_IDS:
		var mounted = _view.call("entry_button", entry_id)
		var original := _original_entries.get(entry_id) as Button
		_expect(
			mounted is Button,
			"挂载后入口不是 Button：%s" % entry_id
		)
		if mounted is Button and original != null:
			_expect(
				(mounted as Button).get_instance_id()
					== original.get_instance_id(),
				"挂载过程替换了旧按钮实例：%s" % entry_id
			)
	var player_alias = _view.call("entry_button", "player")
	_expect(
		player_alias is Button
			and (player_alias as Button).get_instance_id()
				== (_original_entries.get("character") as Button).get_instance_id(),
		"player 别名没有解析到原 character 按钮"
	)


func _append_presenter_projection_errors(
	combined: Dictionary,
	flattened: Dictionary
) -> void:
	_expect(
		combined.has("identity") and combined.has("runtime"),
		"真实 presenter fixture 没有 identity/runtime 投影"
	)
	var player := _dictionary(flattened.get("player", {}))
	var pet := _dictionary(flattened.get("activeBattlePet", {}))
	var player_path := str(player.get("portraitTexturePath", ""))
	var pet_path := str(pet.get("portraitTexturePath", ""))
	_expect(
		bool(player.get("available", false))
			and player_path.ends_with("/ui/portrait.png")
			and ResourceLoader.exists(player_path, "Texture2D"),
		"presenter 扁平投影没有真实人物头像：%s" % player_path
	)
	_expect(
		bool(pet.get("available", false))
			and pet_path.ends_with("/portrait/default.png")
			and ResourceLoader.exists(pet_path, "Texture2D"),
		"presenter 扁平投影没有真实战宠头像：%s" % pet_path
	)
	for key in PHANTOM_FIELD_KEYS:
		_expect(not combined.has(key), "presenter 伪造顶层字段：%s" % key)
		_expect(
			not _dictionary(combined.get("identity", {})).has(key),
			"presenter 身份态伪造字段：%s" % key
		)
		_expect(
			not _dictionary(combined.get("runtime", {})).has(key),
			"presenter 运行态伪造字段：%s" % key
		)
	var line := _dictionary(
		_dictionary(combined.get("runtime", {})).get("line", {})
	)
	_expect(
		line.size() == 1 and not bool(line.get("available", true)),
		"无线路事实时 presenter 不得伪造 line 内容：%s" % str(line)
	)


func _append_version_and_text_errors() -> void:
	var version_label := _legacy_controls.get("versionLabel") as Label
	_expect(
		version_label != null
			and not version_label.visible
			and not version_label.is_visible_in_tree(),
		"旧版本标签没有从玩家 HUD 隐藏"
	)
	var visible_text := _visible_player_text(_view).to_lower()
	for token in TECHNICAL_TEXT_TOKENS:
		_expect(
			not visible_text.contains(token.to_lower()),
			"玩家可见 HUD 暴露技术文案：%s；全文=%s"
				% [token, visible_text]
		)
	for token in ["vip", "currency", "line", "货币", "线路"]:
		_expect(
			not visible_text.contains(str(token).to_lower()),
			"玩家可见 HUD 暴露虚构字段：%s" % str(token)
		)


func _append_task_entry_bounds_errors() -> void:
	var task_body := _named_control("WorldHudTaskBody")
	var task_scroll := _named_control("WorldHudTaskEntriesScroll")
	var task_entries := _named_control("WorldHudTaskEntries")
	_expect(task_body != null, "任务追踪缺少内容边界")
	_expect(task_scroll != null, "任务追踪缺少滚动边界")
	_expect(task_entries != null, "任务追踪缺少任务条目容器")
	if task_body == null or task_scroll == null or task_entries == null:
		return
	var long_entries: Array[Dictionary] = [
		{
			"questId": "layout_long_main",
			"categoryId": "main",
			"categoryLabel": "主线",
			"title": "这是一条需要安全截断的超长中文任务名称",
			"objectiveText": "前往火芽训练场尽头与训练师阿土完成一段很长的对话",
			"active": true,
		},
		{
			"questId": "layout_long_side",
			"categoryId": "side",
			"categoryLabel": "支线",
			"title": "另一条超长中文任务名称",
			"objectiveText": "收集足够多的素材并返回村口交付",
			"active": false,
		},
	]
	_view.call("apply_task_entries", long_entries)
	# The formal party shell embeds this legacy task body in a narrower content
	# box. Reproduce that resize directly so fixed-width children cannot regress.
	task_body.size = Vector2(188.0, 307.0)
	await process_frame
	await process_frame
	_expect(task_body.clip_contents, "任务内容面板没有裁剪越界内容")
	_expect(task_scroll.clip_contents, "任务滚动区没有裁剪越界内容")
	var scroll_rect := task_scroll.get_global_rect()
	for child in task_entries.get_children():
		if not (child is Button):
			continue
		var button := child as Button
		var button_rect := button.get_global_rect()
		_expect(
			_rect_contains_rect(scroll_rect, button_rect),
			"任务卡越过滚动区边界：%s %s / %s"
				% [button.name, str(button_rect), str(scroll_rect)]
		)
		_expect(button.clip_contents, "任务卡没有裁剪子文本：%s" % button.name)
		for label_value in button.get_children():
			if not (label_value is Label):
				continue
			var label := label_value as Label
			_expect(label.clip_text, "任务文字没有启用裁剪：%s" % label.name)
			_expect(
				label.text_overrun_behavior == TextServer.OVERRUN_TRIM_ELLIPSIS,
				"任务文字没有省略号保护：%s" % label.name
			)
	_view.call("apply_layout", Vector2(VIEWPORT_SIZE), {})
	await process_frame
	await process_frame


func _append_portrait_errors() -> void:
	var player_button := _view.call("entry_button", "character") as Button
	var pet_button := _view.call("entry_button", "pet") as Button
	_expect(
		player_button != null
			and player_button.icon != null
			and player_button.tooltip_text == "焰芽斗士",
		"人物入口没有应用 presenter 的真实人物头像与名称"
	)
	_expect(
		pet_button != null
			and pet_button.icon != null
			and pet_button.tooltip_text == "芽耳布伊",
		"战宠入口没有应用 presenter 的真实战宠头像与名称"
	)


func _append_portrait_fallback_errors(real_state: Dictionary) -> void:
	var fallback_state := real_state.duplicate(true)
	fallback_state["activeBattlePet"] = {
		"available": true,
		"instanceId": "pet_without_portrait",
		"name": "未登记头像战宠",
		"level": 12,
		"hp": 88,
		"maxHp": 100,
		"formId": "form_without_portrait",
		"portraitTexturePath": "",
	}
	_view.call("apply_view_state", fallback_state)
	var pet_button := _view.call("entry_button", "pet") as Button
	var pet_portrait := _view.find_child(
		"WorldHudPetPortraitProxy",
		true,
		false
	) as Button
	var fallback_texture := WorldHudAwakenedVisualSkin.texture_for_entry(
		"event_pet"
	)
	_expect(fallback_texture != null, "正式 HUD 宠物兜底图标未加载")
	_expect(
		pet_button != null
			and pet_button.icon == fallback_texture
			and pet_button.tooltip_text == "未登记头像战宠",
		"未登记专属头像时宠物入口没有使用正式 HUD 兜底图标"
	)
	_expect(
		pet_portrait != null
			and pet_portrait.icon == fallback_texture
			and pet_portrait.tooltip_text == "未登记头像战宠",
		"未登记专属头像时右上宠物头像仍为空白"
	)
	_view.call("apply_view_state", real_state)


func _append_expanded_layout_errors() -> void:
	var contract := _layout_contract()
	_expect(
		bool(contract.get("mounted", false)),
		"layout_contract 没有确认挂载完成"
	)
	_expect(
		bool(contract.get("moreDrawerOpen", false)),
		"点击更多后 layout_contract 未标记抽屉展开"
	)
	for rect_key in [
		"topPanelRect",
		"sidePanelRect",
		"messagePanelRect",
		"actionBarRect",
		"moreDrawerRect",
	]:
		var rect_value = contract.get(rect_key, Rect2())
		_expect(
			rect_value is Rect2
				and _rect_within_viewport(rect_value as Rect2),
			"1280×720 HUD 控件越界或尺寸无效：%s=%s"
				% [rect_key, str(rect_value)]
		)
	var drawer := _named_control("WorldHudMoreDrawer")
	_expect(
		drawer != null and drawer.is_visible_in_tree(),
		"更多抽屉展开后不可见"
	)


func _append_message_action_errors() -> void:
	var message_panel := _legacy_controls.get("battleMessagePanel") as Control
	var battle_log := _legacy_controls.get("battleLogLabel") as RichTextLabel
	var expand_button := (
		_legacy_controls.get("battleMessageExpandButton") as Button
	)
	var clear_button := (
		_legacy_controls.get("battleMessageClearButton") as Button
	)
	var message_surface := _named_control("WorldHudMessageSurface")
	var chat_surface := _named_control("WorldHudChatSurface")
	var action_row := _named_control("WorldHudMessageActions")
	_expect(
		message_surface != null
			and chat_surface != null
			and action_row != null
			and action_row.get_parent() == chat_surface,
		"正式世界消息面缺少 ChatSurface 操作栏"
	)
	for pair in [
		["展开", expand_button, "WorldHudMessageExpandButton"],
		["清空", clear_button, "WorldHudMessageClearButton"],
	]:
		var label := str(pair[0])
		var button := pair[1] as Button
		_expect(
			button != null
				and str(button.name) == str(pair[2])
				and button.get_parent() == action_row
				and button.is_visible_in_tree()
				and not button.disabled
				and button.mouse_filter == Control.MOUSE_FILTER_STOP,
			"正式世界消息%s按钮没有复用原权威 Button 并挂入操作栏" % label
		)
	var collapsed_rect := (
		message_panel.get_global_rect() if message_panel != null else Rect2()
	)
	if expand_button != null:
		expand_button.pressed.emit()
	_expect(
		_fixture_message_expanded
			and expand_button != null
			and expand_button.text == "收起"
			and message_panel != null
			and message_panel.get_global_rect().size.y > collapsed_rect.size.y,
		"真实展开按钮没有同步切换权威状态、文案与正式消息布局"
	)
	if clear_button != null:
		clear_button.pressed.emit()
	_expect(
		_fixture_message_clear_count == 1
			and _fixture_message_history.is_empty()
			and battle_log != null
			and battle_log.text == ""
			and clear_button != null
			and clear_button.disabled
			and message_panel != null
			and not message_panel.visible,
		"真实清空按钮没有清空权威历史／日志并按世界态隐藏消息面"
	)
	_fixture_message_history = ["欢迎来到火芽训练场"]
	if battle_log != null:
		battle_log.text = _fixture_message_history[0]
	if clear_button != null:
		clear_button.disabled = false
	if message_panel != null:
		message_panel.visible = true
	if expand_button != null:
		expand_button.pressed.emit()
	_expect(
		not _fixture_message_expanded
			and expand_button != null
			and expand_button.text == "展开"
			and message_panel != null
			and message_panel.is_visible_in_tree(),
		"消息操作验收后没有恢复折叠的正式世界消息面"
	)


func _fixture_toggle_message_expanded() -> void:
	_fixture_message_expanded = not _fixture_message_expanded
	var expand_button := (
		_legacy_controls.get("battleMessageExpandButton") as Button
	)
	if expand_button != null:
		expand_button.text = "收起" if _fixture_message_expanded else "展开"
	if _view != null:
		_view.call("apply_layout", Vector2(VIEWPORT_SIZE), {
			"messageExpanded": _fixture_message_expanded,
			"showMessage": true,
		})


func _fixture_clear_message() -> void:
	_fixture_message_history.clear()
	_fixture_message_clear_count += 1
	var battle_log := _legacy_controls.get("battleLogLabel") as RichTextLabel
	var message_panel := _legacy_controls.get("battleMessagePanel") as Control
	var clear_button := (
		_legacy_controls.get("battleMessageClearButton") as Button
	)
	if battle_log != null:
		battle_log.text = ""
	if clear_button != null:
		clear_button.disabled = true
	if message_panel != null:
		message_panel.visible = false


func _append_spectator_point_errors() -> void:
	var contract := _layout_contract()
	for rect_key in [
		"topPanelRect",
		"sidePanelRect",
		"messagePanelRect",
		"actionBarRect",
		"moreDrawerRect",
	]:
		var rect_value = contract.get(rect_key, Rect2())
		if rect_value is Rect2:
			_expect(
				not (rect_value as Rect2).has_point(SPECTATOR_POINT),
				"中心观战点被 HUD blocker 遮挡：%s=%s"
					% [rect_key, str(rect_value)]
			)


func _append_collapsed_errors() -> void:
	var top_panel := _legacy_controls.get("topPanel") as Control
	var side_panel := _legacy_controls.get("sidePanel") as Control
	var message_panel := _legacy_controls.get("battleMessagePanel") as Control
	var action_bar := _legacy_controls.get("actionBar") as Control
	var restore_button := _named_button("WorldHudRestoreButton")
	var dock_surface := _named_control("WorldHudDockSurface")
	var drawer := _named_control("WorldHudMoreDrawer")
	_expect(bool(_view.call("is_collapsed")), "set_collapsed(true) 未进入收起态")
	_expect(
		top_panel != null and not top_panel.is_visible_in_tree(),
		"HUD 收起后 topPanel 仍可见"
	)
	_expect(
		side_panel != null and not side_panel.is_visible_in_tree(),
		"HUD 收起后 sidePanel 仍可见"
	)
	_expect(
		message_panel != null and not message_panel.is_visible_in_tree(),
		"HUD 收起后 messagePanel 仍可见"
	)
	_expect(
		action_bar != null and action_bar.is_visible_in_tree(),
		"HUD 收起后承载恢复按钮的 actionBar 不可见"
	)
	_expect(
		restore_button != null and restore_button.is_visible_in_tree(),
		"HUD 收起后唯一恢复按钮不可见"
	)
	_expect(
		dock_surface != null and not dock_surface.is_visible_in_tree(),
		"HUD 收起后 actionBar 主操作面仍可见"
	)
	_expect(
		drawer != null and not drawer.is_visible_in_tree(),
		"HUD 收起后更多抽屉仍可见"
	)
	for entry_id in ENTRY_IDS:
		var entry := _view.call("entry_button", entry_id) as Button
		_expect(
			entry != null and not entry.is_visible_in_tree(),
			"HUD 收起后仍显示入口：%s" % entry_id
		)
	_collapsed_restore_only_verified = _collapsed_restore_only()


func _append_restored_errors() -> void:
	var top_panel := _legacy_controls.get("topPanel") as Control
	var side_panel := _legacy_controls.get("sidePanel") as Control
	var message_panel := _legacy_controls.get("battleMessagePanel") as Control
	var action_bar := _legacy_controls.get("actionBar") as Control
	var restore_button := _named_button("WorldHudRestoreButton")
	var dock_surface := _named_control("WorldHudDockSurface")
	_expect(not bool(_view.call("is_collapsed")), "点击恢复后 HUD 仍处于收起态")
	for pair in [
		["topPanel", top_panel],
		["sidePanel", side_panel],
		["messagePanel", message_panel],
		["actionBar", action_bar],
	]:
		var control := pair[1] as Control
		_expect(
			control != null and control.is_visible_in_tree(),
			"HUD 恢复后 %s 没有复原" % str(pair[0])
		)
	_expect(
		restore_button != null and not restore_button.is_visible_in_tree(),
		"HUD 恢复后恢复按钮没有隐藏"
	)
	_expect(
		dock_surface != null and dock_surface.is_visible_in_tree(),
		"HUD 恢复后主操作面没有复原"
	)


func _append_battle_visibility_errors() -> void:
	var top_panel := _legacy_controls.get("topPanel") as Control
	var side_panel := _legacy_controls.get("sidePanel") as Control
	var message_panel := _legacy_controls.get("battleMessagePanel") as Control
	var action_bar := _legacy_controls.get("actionBar") as Control
	var dock_surface := _named_control("WorldHudDockSurface")
	_view.call("apply_layout", Vector2(VIEWPORT_SIZE), {
		"battleActive": true,
		"showTop": true,
		"showSide": true,
		"showMessage": true,
		"showAction": true,
	})
	await process_frame
	await process_frame
	_expect(
		top_panel != null and not top_panel.is_visible_in_tree(),
		"战斗中世界顶部栏仍可见"
	)
	_expect(
		side_panel != null and not side_panel.is_visible_in_tree(),
		"战斗中世界任务/组队栏仍可见"
	)
	_expect(
		action_bar != null and not action_bar.is_visible_in_tree(),
		"战斗中世界操作栏仍可见"
	)
	_expect(
		dock_surface != null and not dock_surface.is_visible_in_tree(),
		"战斗中地图等世界入口仍可见"
	)
	_expect(
		message_panel != null and message_panel.is_visible_in_tree(),
		"战斗中既有消息区被错误隐藏"
	)
	_view.call("apply_layout", Vector2(VIEWPORT_SIZE), {
		"battleActive": false,
		"showTop": true,
		"showSide": true,
		"showMessage": true,
		"showAction": true,
	})
	await process_frame
	await process_frame
	_expect(
		top_panel != null and top_panel.is_visible_in_tree(),
		"退出战斗后世界顶部栏没有恢复"
	)
	_expect(
		action_bar != null and action_bar.is_visible_in_tree(),
		"退出战斗后世界操作栏没有恢复"
	)


func _append_battle_gate_errors() -> void:
	var battle_state := WorldHudAwakenedPresenter.runtime_state(
		_fixture_runtime(true)
	)
	var menu := _dictionary(battle_state.get("menu", {}))
	var gates := _dictionary(menu.get("gates", {}))
	_expect(bool(menu.get("battleActive", false)), "战斗 fixture 未进入 presenter 战斗态")
	for entry_id in BATTLE_LOCKED_ENTRY_IDS:
		var gate := _dictionary(gates.get(entry_id, {}))
		_expect(
			bool(gate.get("disabled", false)),
			"战斗中 presenter 未禁用入口：%s" % entry_id
		)
	for entry_id in BATTLE_AVAILABLE_ENTRY_IDS:
		var gate := _dictionary(gates.get(entry_id, {}))
		_expect(
			not bool(gate.get("disabled", true)),
			"战斗中 presenter 错误禁用入口：%s" % entry_id
		)
	_view.call("apply_view_state", battle_state)
	var character_button := _view.call("entry_button", "character") as Button
	_expect(
		character_button != null and character_button.disabled,
		"战斗中 view 未消费 character 门禁并禁用角色入口"
	)


func _append_player_gate_errors() -> void:
	var gm_button := _view.call("entry_button", "gm") as Button
	var account_button := _view.call("entry_button", "account") as Button
	_expect(
		gm_button != null and not gm_button.is_visible_in_tree(),
		"普通玩家更多抽屉仍暴露 GM 入口"
	)
	_expect(
		account_button != null and account_button.visible and not account_button.disabled,
		"已登录玩家账号入口未保持可用"
	)


func _fixture_profile() -> Dictionary:
	return {
		"player": {
			"name": "焰芽斗士",
			"level": 80,
			"hp": 515,
			"maxHp": 515,
			"exp": 91703,
			"nextExp": 119635,
			"appearanceId": "ember_spark_v1",
		},
		"activePetInstanceId": "pet_active",
		"petInstances": [
			{
				"instanceId": "pet_inactive",
				"formId": "bui_normal_yellow_wind10",
				"name": "不应出现的宠物",
				"state": "standby",
				"level": 140,
				"hp": 999,
				"maxHp": 999,
			},
			{
				"instanceId": "pet_active",
				"formId": "bui_novice_sprout_earth5_wind5",
				"name": "芽耳布伊",
				"state": "battle",
				"level": 77,
				"hp": 286,
				"maxHp": 310,
			},
		],
	}


func _fixture_runtime(battle_active: bool) -> Dictionary:
	return {
		"mapName": "火芽训练场",
		"playerCell": Vector2i(17, 23),
		"taskText": "前往导师处学习战斗",
		"party": {
			"members": [
				{
					"displayName": "山岚",
					"role": "leader",
					"online": true,
				},
			],
		},
		"chatMessages": [
			{
				"channel": "nearby",
				"author": "山岚",
				"text": "训练场见",
				"messageId": "hud_fixture_message",
			},
		],
		"mailbox": {
			"synced": true,
			"state": {"unreadCount": 2},
		},
		"menu": {
			"authenticated": true,
			"gmAccess": false,
			"battleActive": battle_active,
		},
	}


func _flatten_presenter_state(state: Dictionary) -> Dictionary:
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


func _layout_contract() -> Dictionary:
	var value = _view.call("layout_contract")
	return value as Dictionary if value is Dictionary else {}


func _entry_identity_preserved() -> bool:
	for entry_id in ENTRY_IDS:
		var mounted = _view.call("entry_button", entry_id)
		var original := _original_entries.get(entry_id) as Button
		if not (mounted is Button) or original == null:
			return false
		if (mounted as Button).get_instance_id() != original.get_instance_id():
			return false
	return true


func _entry_has_icon(entry_id: String) -> bool:
	var entry = _view.call("entry_button", entry_id)
	return entry is Button and (entry as Button).icon != null


func _collapsed_restore_only() -> bool:
	var action_bar := _legacy_controls.get("actionBar") as Control
	var restore := _named_button("WorldHudRestoreButton")
	var dock := _named_control("WorldHudDockSurface")
	return (
		bool(_view.call("is_collapsed"))
		and action_bar != null
		and action_bar.is_visible_in_tree()
		and restore != null
		and restore.is_visible_in_tree()
		and dock != null
		and not dock.is_visible_in_tree()
	)


func _rect_within_viewport(rect: Rect2) -> bool:
	var end := rect.position + rect.size
	return (
		rect.size.x > 0.0
		and rect.size.y > 0.0
		and rect.position.x >= -0.5
		and rect.position.y >= -0.5
		and end.x <= float(VIEWPORT_SIZE.x) + 0.5
		and end.y <= float(VIEWPORT_SIZE.y) + 0.5
	)


func _rect_contains_rect(outer: Rect2, inner: Rect2) -> bool:
	var inner_end := inner.position + inner.size
	var outer_end := outer.position + outer.size
	return (
		inner.size.x > 0.0
		and inner.size.y > 0.0
		and inner.position.x >= outer.position.x - 0.5
		and inner.position.y >= outer.position.y - 0.5
		and inner_end.x <= outer_end.x + 0.5
		and inner_end.y <= outer_end.y + 0.5
	)


func _visible_player_text(node: Node) -> String:
	if node is CanvasItem and not (node as CanvasItem).is_visible_in_tree():
		return ""
	var values: Array[String] = []
	if node is Label:
		values.append((node as Label).text)
	elif node is Button:
		values.append((node as Button).text)
	elif node is RichTextLabel:
		values.append((node as RichTextLabel).get_parsed_text())
	for child in node.get_children():
		values.append(_visible_player_text(child))
	return " ".join(values)


func _named_control(node_name: String) -> Control:
	if _view == null:
		return null
	var value := _view.find_child(node_name, true, false)
	return value as Control if value is Control else null


func _named_button(node_name: String) -> Button:
	var value := _named_control(node_name)
	return value as Button if value is Button else null


func _dictionary(value) -> Dictionary:
	return value as Dictionary if value is Dictionary else {}


func _expect(condition: bool, message: String) -> void:
	if not condition:
		_errors.append(message)
