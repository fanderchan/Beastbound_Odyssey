extends RefCounted

const CharacterManagementPanel := preload(
	"res://scripts/ui/character_management_panel.gd"
)
const CharacterManagementPresenter := preload(
	"res://scripts/ui/character_management_presenter.gd"
)
const EquipmentModel := preload(
	"res://scripts/progression/equipment_model.gd"
)
const PetTemplateCatalog := preload(
	"res://scripts/battle/pet_template_catalog.gd"
)
const PlayerProgressModel := preload(
	"res://scripts/progression/player_progress_model.gd"
)

const EXPECTED_VIEWPORT_SIZE := Vector2(1280.0, 720.0)
const EXPECTED_RIDEABLE_FORMS: Array[String] = [
	"bui_novice_sprout_earth5_wind5",
	"novice_tiger_mount",
	"thunder_dragon_mount",
]
const STAT_KEYS: Array[String] = ["maxHp", "attack", "defense", "quick"]


static func run(host: Node) -> Dictionary:
	var errors: Array[String] = []
	var evidence := {
		"inputDelivery": "Input.parse_input_event",
		"levelGainBattleCount": 0,
		"equipmentSlotCount": 0,
		"rideableForms": [],
		"filteredRideForms": [],
		"statPointsBefore": 0,
		"statPointsAfter": 0,
	}
	if host == null or not is_instance_valid(host):
		errors.append("Main host 不可用")
		return _report(errors, evidence)
	if not host.has_method("_panel_flow"):
		errors.append("Main 缺少角色页接线入口")
		return _report(errors, evidence)
	if host.has_method("_is_server_account_session") and host._is_server_account_session():
		errors.append("角色 Main 流程检查不能连接共享或真实账号会话")
		return _report(errors, evidence)

	host.profile_save_enabled = false
	host._apply_preview_window_size(Vector2i(EXPECTED_VIEWPORT_SIZE))
	await _settle_frames(host, 2)
	var progression := _profile_after_real_level_gain(host)
	var profile := progression.get("profile", {}) as Dictionary
	evidence["levelGainBattleCount"] = int(progression.get("battleCount", 0))
	if profile.is_empty() or PlayerProgressModel.player_stat_points(profile) < 2:
		errors.append("通过真实战斗结算仍未获得至少 2 点人物属性点")
		return _report(errors, evidence)
	host.player_profile = PlayerProgressModel.normalize_profile(profile)

	var map_loaded := bool(host._load_map("firebud_village_gate", "from_training_yard"))
	_expect(map_loaded, "Main 无法加载火芽村世界用于角色入口检查", errors)
	await _settle_frames(host, 2)
	host._layout_hud()
	await _settle_frames(host, 2)

	var flow = host._panel_flow()
	var menu_button := host.player_status_menu_button as Button
	_expect(
		menu_button != null
			and menu_button.text == "角色"
			and menu_button.is_visible_in_tree(),
		"右下角缺少可见的“角色”入口",
		errors
	)
	var movement_before_open := _world_movement_snapshot(host)
	var open_click := await _left_click(host, menu_button, "右下角角色入口", errors)
	await _settle_frames(host, 2)
	var opened_by_real_left_click: bool = (
		bool(open_click.get("ok", false))
		and host.player_status_panel != null
		and host.player_status_panel.visible
		and _world_movement_snapshot(host) == movement_before_open
	)
	_expect(opened_by_real_left_click, "真实左键没有打开角色页，或点击穿透到世界移动", errors)

	var view = flow.character_management_panel
	_expect(view != null and is_instance_valid(view), "角色页没有接入 Main.tscn", errors)
	if view == null or not is_instance_valid(view):
		return _report(errors, evidence)

	var layout_size: Vector2 = host._layout_size()
	var panel_rect: Rect2 = host.player_status_panel.get_global_rect()
	var view_rect: Rect2 = view.get_global_rect()
	var full_screen_ok: bool = (
		_close_vec(layout_size, EXPECTED_VIEWPORT_SIZE)
		and _close_vec(panel_rect.position, Vector2.ZERO)
		and _close_vec(panel_rect.size, EXPECTED_VIEWPORT_SIZE)
		and _close_vec(view_rect.position, Vector2.ZERO)
		and _close_vec(view_rect.size, EXPECTED_VIEWPORT_SIZE)
		and view.mouse_filter == Control.MOUSE_FILTER_STOP
		and host._world_menu_is_open()
		and not host.action_bar.visible
	)
	var point_hits := {}
	for point in [Vector2(8.0, 8.0), Vector2(640.0, 360.0), Vector2(1272.0, 712.0)]:
		var hit := bool(host._is_ui_point(point))
		point_hits["%d,%d" % [int(point.x), int(point.y)]] = hit
		full_screen_ok = full_screen_ok and hit
	evidence["fullScreenDiagnostics"] = {
		"layout": [layout_size.x, layout_size.y],
		"panelRect": [panel_rect.position.x, panel_rect.position.y, panel_rect.size.x, panel_rect.size.y],
		"viewRect": [view_rect.position.x, view_rect.position.y, view_rect.size.x, view_rect.size.y],
		"mouseStop": view.mouse_filter == Control.MOUSE_FILTER_STOP,
		"worldMenuOpen": host._world_menu_is_open(),
		"actionBarHidden": not host.action_bar.visible,
		"pointHits": point_hits,
	}
	_expect(full_screen_ok, "角色页没有完整覆盖并阻断 1280×720 世界输入", errors)

	var movement_before_blocked_click := _world_movement_snapshot(host)
	var blocked_click := await _screen_click(host, Vector2(1160.0, 650.0))
	await _settle_frames(host, 2)
	var blocked_click_ok: bool = (
		bool(blocked_click.get("frameSeparated", false))
		and host.player_status_panel.visible
		and _world_movement_snapshot(host) == movement_before_blocked_click
	)
	_expect(blocked_click_ok, "角色页空白处真实左键仍穿透到世界移动", errors)

	var presented_state := CharacterManagementPresenter.view_state(host.player_profile)
	var equipment_slots := _dictionary_array(presented_state.get("equipmentSlots", []))
	var equipment_grid := view.get_named_control("EquipmentGrid") as GridContainer
	evidence["equipmentSlotCount"] = equipment_slots.size()
	var equipment_ok: bool = (
		equipment_slots.size() == 9
		and EquipmentModel.slot_ids().size() == 9
		and equipment_grid != null
		and equipment_grid.get_child_count() == 9
	)
	for slot_id in EquipmentModel.slot_ids():
		equipment_ok = equipment_ok and view.get_named_control(
			"EquipmentSlot_%s" % _node_safe_id(str(slot_id))
		) != null
	_expect(equipment_ok, "属性页没有从真实装备模型显示完整 9 个装备槽", errors)

	var attributes_page := view.get_named_control("AttributesPage") as Control
	var stat_page := view.get_named_control("StatPointsPage") as Control
	var ride_page := view.get_named_control("RidePermitsPage") as Control
	var tabs_ok: bool = (
		view.active_tab() == CharacterManagementPanel.TAB_ATTRIBUTES
		and attributes_page != null and attributes_page.visible
		and stat_page != null and not stat_page.visible
		and ride_page != null and not ride_page.visible
	)

	var stat_tab := view.get_tab_button(CharacterManagementPanel.TAB_STAT_POINTS) as Button
	await _left_click(host, stat_tab, "加点页签", errors)
	await _settle_frames(host, 2)
	tabs_ok = (
		tabs_ok
		and view.active_tab() == CharacterManagementPanel.TAB_STAT_POINTS
		and stat_page.visible
		and not attributes_page.visible
		and not ride_page.visible
	)
	_expect(tabs_ok, "属性/加点页签没有通过真实左键正确切换", errors)

	var profile_before_draft: Dictionary = host.player_profile.duplicate(true)
	var base_before := PlayerProgressModel.player_base_stats(profile_before_draft)
	var points_before := PlayerProgressModel.player_stat_points(profile_before_draft)
	evidence["statPointsBefore"] = points_before
	var attack_plus := view.get_stat_adjust_button("attack", 1) as Button
	await _left_click(host, attack_plus, "攻击加点", errors)
	await _settle_frames(host, 1)
	var hp_plus := view.get_stat_adjust_button("maxHp", 1) as Button
	await _left_click(host, hp_plus, "生命加点", errors)
	await _settle_frames(host, 2)
	var pending := flow.character_management_pending_allocation as Dictionary
	var draft_ok: bool = (
		host.player_profile == profile_before_draft
		and int(pending.get("attack", 0)) == 1
		and int(pending.get("maxHp", 0)) == 1
		and _pending_total(pending) == 2
	)
	_expect(draft_ok, "加点 +/- 没有保持为未确认草稿，或提前改写人物档案", errors)

	var confirm_button := view.get_named_control("ConfirmStatsButton") as Button
	await _left_click(host, confirm_button, "确认加点", errors)
	await _settle_frames(host, 3)
	var base_after := PlayerProgressModel.player_base_stats(host.player_profile)
	var points_after := PlayerProgressModel.player_stat_points(host.player_profile)
	evidence["statPointsAfter"] = points_after
	var confirmed_pending := flow.character_management_pending_allocation as Dictionary
	var allocation_ok: bool = (
		points_after == points_before - 2
		and int(base_after.get("attack", 0))
			== int(base_before.get("attack", 0))
				+ PlayerProgressModel.player_stat_point_gain_for("attack")
		and int(base_after.get("maxHp", 0))
			== int(base_before.get("maxHp", 0))
				+ PlayerProgressModel.player_stat_point_gain_for("maxHp")
		and _pending_total(confirmed_pending) == 0
	)
	_expect(allocation_ok, "确认加点没有一次提交两项真实四维并清空草稿", errors)

	flow.character_management_allocation_pending = true
	host._close_player_status_panel()
	host._open_player_status_panel()
	await _settle_frames(host, 2)
	view.switch_tab(CharacterManagementPanel.TAB_STAT_POINTS)
	await _settle_frames(host, 1)
	var guarded_plus := view.get_stat_adjust_button("attack", 1) as Button
	var in_flight_close_reopen_guarded: bool = (
		flow.character_management_allocation_pending
		and guarded_plus != null
		and guarded_plus.disabled
	)
	_expect(
		in_flight_close_reopen_guarded,
		"关闭并重开角色页错误清除了进行中的加点请求或重新开放了草稿",
		errors
	)
	flow.character_management_allocation_pending = false
	host._refresh_player_status_panel()
	await _settle_frames(host, 1)

	var ride_tab := view.get_tab_button(CharacterManagementPanel.TAB_RIDE_PERMITS) as Button
	await _left_click(host, ride_tab, "骑证页签", errors)
	await _settle_frames(host, 2)
	tabs_ok = (
		view.active_tab() == CharacterManagementPanel.TAB_RIDE_PERMITS
		and ride_page.visible
		and not attributes_page.visible
		and not stat_page.visible
	)
	_expect(tabs_ok, "骑证页签没有通过真实左键正确切换", errors)

	presented_state = CharacterManagementPresenter.view_state(host.player_profile)
	var ride_entries := _dictionary_array(presented_state.get("rideEntries", []))
	var actual_form_ids := _ride_form_ids(ride_entries)
	var expected_form_ids := EXPECTED_RIDEABLE_FORMS.duplicate()
	expected_form_ids.sort()
	evidence["rideableForms"] = actual_form_ids
	var ride_grid := view.get_named_control("RidePermitGrid") as GridContainer
	var ride_truth_ok: bool = (
		actual_form_ids == expected_form_ids
		and ride_entries.size() == 3
		and ride_grid != null
		and ride_grid.get_child_count() == 3
	)
	for form_id in EXPECTED_RIDEABLE_FORMS:
		ride_truth_ok = (
			ride_truth_ok
			and not PetTemplateCatalog.runtime_template_for_form(form_id).is_empty()
			and _catalog_marks_rideable(form_id)
			and view.get_ride_entry_button(form_id) != null
		)
	_expect(ride_truth_ok, "骑证页不是当前目录中的严格 3 个真实可骑形态", errors)

	var species_button := view.get_named_control("RideFilter_species") as Button
	await _left_click(host, species_button, "骑证种族筛选", errors)
	await _settle_frames(host, 2)
	var dynamic_filters := view.get_named_control("RideDynamicFilters") as VBoxContainer
	var species_ok: bool = (
		flow.character_management_ride_filter_id == CharacterManagementPresenter.FILTER_SPECIES
		and dynamic_filters != null
		and dynamic_filters.visible
		and ride_grid.get_child_count() == 3
	)
	_expect(species_ok, "点击种族后没有展开真实族系列表并保留全部骑宠", errors)

	var tiger_entry := _entry_for_form(ride_entries, "novice_tiger_mount")
	var tiger_filter_id := "%s%s" % [
		CharacterManagementPresenter.FILTER_LINE_PREFIX,
		str(tiger_entry.get("lineId", "")),
	]
	var tiger_filter := view.get_named_control(
		"RideFilter_%s" % _node_safe_id(tiger_filter_id)
	) as Button
	await _left_click(host, tiger_filter, "真实骑宠族系筛选", errors)
	await _settle_frames(host, 2)
	var filtered_state := CharacterManagementPresenter.view_state(
		host.player_profile,
		{},
		tiger_filter_id
	)
	var filtered_entries := _dictionary_array(filtered_state.get("visibleRideEntries", []))
	var filtered_ids := _ride_form_ids(filtered_entries)
	evidence["filteredRideForms"] = filtered_ids
	ride_grid = view.get_named_control("RidePermitGrid") as GridContainer
	var line_filter_ok: bool = (
		flow.character_management_ride_filter_id == tiger_filter_id
		and not filtered_entries.is_empty()
		and filtered_entries.size() == ride_grid.get_child_count()
		and filtered_ids.has("novice_tiger_mount")
	)
	for entry in filtered_entries:
		line_filter_ok = line_filter_ok and str(entry.get("lineId", "")) == str(tiger_entry.get("lineId", ""))
	_expect(line_filter_ok, "种族子筛选没有按真实 lineId 缩小骑宠卡片", errors)

	var all_button := view.get_named_control("RideFilter_all") as Button
	await _left_click(host, all_button, "骑证全部筛选", errors)
	await _settle_frames(host, 2)
	ride_grid = view.get_named_control("RidePermitGrid") as GridContainer
	_expect(
		flow.character_management_ride_filter_id == CharacterManagementPresenter.FILTER_ALL
			and ride_grid.get_child_count() == 3,
		"返回全部筛选后没有恢复 3 个真实骑宠形态",
		errors
	)

	var attributes_tab := view.get_tab_button(CharacterManagementPanel.TAB_ATTRIBUTES) as Button
	await _left_click(host, attributes_tab, "属性页签返回", errors)
	await _settle_frames(host, 2)
	var third_tab_ok: bool = (
		view.active_tab() == CharacterManagementPanel.TAB_ATTRIBUTES
		and attributes_page.visible
		and not stat_page.visible
		and not ride_page.visible
	)
	_expect(third_tab_ok, "三页签循环切换后没有回到属性页", errors)

	var close_button := view.get_named_control("CloseButton") as Button
	await _left_click(host, close_button, "角色页关闭", errors)
	await _settle_frames(host, 3)
	var closed_to_world_ok: bool = (
		not host.player_status_panel.visible
		and not host._world_menu_is_open()
		and host.action_bar.visible
		and host.player != null
		and host.player.visible
		and not host._is_ui_point(Vector2(640.0, 360.0))
	)
	_expect(closed_to_world_ok, "关闭角色页后没有恢复可操作世界与右下角入口", errors)

	evidence["openedByRealLeftClick"] = opened_by_real_left_click
	evidence["fullScreenWorldBlocked"] = full_screen_ok and blocked_click_ok
	evidence["tabsWorking"] = tabs_ok and third_tab_ok
	evidence["statDraftConfirmed"] = draft_ok and allocation_ok
	evidence["inFlightCloseReopenGuarded"] = in_flight_close_reopen_guarded
	evidence["rideFiltersWorking"] = species_ok and line_filter_ok
	evidence["closedToWorld"] = closed_to_world_ok
	return _report(errors, evidence)


static func _profile_after_real_level_gain(host: Node) -> Dictionary:
	var profile := PlayerProgressModel.default_profile()
	var battle_count := 0
	if not host.has_method("_battle_reward_test_state"):
		return {"profile": {}, "battleCount": 0}
	while PlayerProgressModel.player_stat_points(profile) < 2 and battle_count < 80:
		var state: Dictionary = host._battle_reward_test_state(
			"phase381_character_main_flow_%02d" % battle_count,
			profile
		)
		var result := PlayerProgressModel.apply_battle_result(profile, state, "victory")
		profile = result.get("profile", profile) as Dictionary
		battle_count += 1
	return {
		"profile": PlayerProgressModel.normalize_profile(profile),
		"battleCount": battle_count,
	}


static func _left_click(
	host: Node,
	control: Control,
	label: String,
	errors: Array[String]
) -> Dictionary:
	if (
		control == null
		or not is_instance_valid(control)
		or not control.is_inside_tree()
		or not control.is_visible_in_tree()
		or (control is BaseButton and (control as BaseButton).disabled)
	):
		errors.append("%s不可见或不可用，无法执行真实左键" % label)
		return {"ok": false, "label": label}
	var viewport_point := control.get_global_rect().get_center()
	var result := await _screen_click(host, viewport_point)
	result["ok"] = bool(result.get("frameSeparated", false))
	result["label"] = label
	return result


static func _screen_click(host: Node, viewport_point: Vector2) -> Dictionary:
	var input_position: Vector2 = host.get_viewport().get_screen_transform() * viewport_point
	var motion := InputEventMouseMotion.new()
	motion.position = input_position
	motion.global_position = input_position
	Input.parse_input_event(motion)
	await host.get_tree().process_frame
	var press := InputEventMouseButton.new()
	press.button_index = MOUSE_BUTTON_LEFT
	press.pressed = true
	press.position = input_position
	press.global_position = input_position
	var press_frame := Engine.get_process_frames()
	Input.parse_input_event(press)
	await host.get_tree().process_frame
	var release := InputEventMouseButton.new()
	release.button_index = MOUSE_BUTTON_LEFT
	release.pressed = false
	release.position = input_position
	release.global_position = input_position
	var release_frame := Engine.get_process_frames()
	Input.parse_input_event(release)
	await host.get_tree().process_frame
	return {
		"frameSeparated": release_frame > press_frame,
		"pressProcessFrame": press_frame,
		"releaseProcessFrame": release_frame,
		"viewportPoint": [viewport_point.x, viewport_point.y],
	}


static func _settle_frames(host: Node, frame_count: int) -> void:
	for _index in range(maxi(0, frame_count)):
		await host.get_tree().process_frame


static func _world_movement_snapshot(host: Node) -> Dictionary:
	return {
		"pendingScreenPoint": bool(host.has_pending_click_screen_point),
		"pendingMoveTarget": bool(host.has_pending_click_move_target),
		"screenResolveCount": int(host.click_move_screen_resolve_count),
		"repathApplyCount": int(host.click_move_repath_apply_count),
	}


static func _catalog_marks_rideable(form_id: String) -> bool:
	for value in PetTemplateCatalog.forms():
		if not (value is Dictionary):
			continue
		var form := value as Dictionary
		if str(form.get("formId", "")) != form_id:
			continue
		var riding_value = form.get("riding", {})
		var riding := riding_value as Dictionary if riding_value is Dictionary else {}
		return bool(riding.get("rideable", false))
	return false


static func _entry_for_form(entries: Array[Dictionary], form_id: String) -> Dictionary:
	for entry in entries:
		if str(entry.get("formId", "")) == form_id:
			return entry
	return {}


static func _ride_form_ids(entries: Array[Dictionary]) -> Array[String]:
	var result: Array[String] = []
	for entry in entries:
		result.append(str(entry.get("formId", "")))
	result.sort()
	return result


static func _dictionary_array(value) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	if value is Array:
		for item in value:
			if item is Dictionary:
				result.append(item as Dictionary)
	return result


static func _pending_total(value: Dictionary) -> int:
	var total := 0
	for stat_key in STAT_KEYS:
		total += maxi(0, int(value.get(stat_key, 0)))
	return total


static func _node_safe_id(value: String) -> String:
	var result := value.strip_edges()
	for token in ["/", "\\", ":", ".", " ", "-", "|"]:
		result = result.replace(token, "_")
	return result


static func _close_vec(left: Vector2, right: Vector2, epsilon: float = 0.6) -> bool:
	return left.distance_to(right) <= epsilon


static func _expect(condition: bool, message: String, errors: Array[String]) -> void:
	if not condition:
		errors.append(message)


static func _report(errors: Array[String], evidence: Dictionary) -> Dictionary:
	var report := {
		"schemaVersion": 1,
		"reportType": "beastbound.player_character_main_flow_check",
		"result": "PASS" if errors.is_empty() else "FAIL",
		"errors": errors,
	}
	for key in evidence:
		report[key] = evidence.get(key)
	return report
