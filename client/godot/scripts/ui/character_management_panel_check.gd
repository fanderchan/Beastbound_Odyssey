extends SceneTree

const CharacterManagementPanel := preload(
	"res://scripts/ui/character_management_panel.gd"
)
const CharacterManagementPresenter := preload(
	"res://scripts/ui/character_management_presenter.gd"
)
const PlayerProgressModel := preload(
	"res://scripts/progression/player_progress_model.gd"
)
const PetRidePermitModel := preload(
	"res://scripts/progression/pet_ride_permit_model.gd"
)

const VIEWPORT_SIZE := Vector2i(1280, 720)
const EXPECTED_TABS: Array[String] = [
	CharacterManagementPanel.TAB_ATTRIBUTES,
	CharacterManagementPanel.TAB_STAT_POINTS,
	CharacterManagementPanel.TAB_RIDE_PERMITS,
]
const EXPECTED_TAB_LABELS := {
	CharacterManagementPanel.TAB_ATTRIBUTES: "属性",
	CharacterManagementPanel.TAB_STAT_POINTS: "加点",
	CharacterManagementPanel.TAB_RIDE_PERMITS: "骑证",
}
const EXPECTED_STAT_KEYS: Array[String] = [
	"maxHp",
	"attack",
	"defense",
	"quick",
]
const EXPECTED_RIDEABLE_FORMS: Array[String] = [
	"bui_novice_sprout_earth5_wind5",
	"novice_tiger_mount",
	"thunder_dragon_mount",
]
const BANNED_FAKE_FIELDS: Array[String] = ["气力", "怒气", "战力"]

var _errors: Array[String] = []
var _panel: CharacterManagementPanel
var _profile: Dictionary = {}
var _pending_allocation: Dictionary = {}
var _ride_filter_id := CharacterManagementPresenter.FILTER_ALL

var _tab_events: Array[String] = []
var _stat_adjust_events: Array[Dictionary] = []
var _stat_confirm_count := 0
var _stat_reset_count := 0
var _ride_filter_events: Array[String] = []
var _ride_entry_events: Array[String] = []
var _close_count := 0


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	root.size = VIEWPORT_SIZE
	root.content_scale_size = VIEWPORT_SIZE
	root.content_scale_mode = Window.CONTENT_SCALE_MODE_CANVAS_ITEMS

	_profile = _fixture_profile()
	_panel = CharacterManagementPanel.new()
	_panel.name = "CharacterManagementPanelCheckSubject"
	_panel.position = Vector2.ZERO
	_panel.size = Vector2(VIEWPORT_SIZE)
	_panel.tab_requested.connect(_on_tab_requested)
	_panel.stat_adjust_requested.connect(_on_stat_adjust_requested)
	_panel.stat_confirm_requested.connect(_on_stat_confirm_requested)
	_panel.stat_pending_reset_requested.connect(_on_stat_pending_reset_requested)
	_panel.ride_filter_requested.connect(_on_ride_filter_requested)
	_panel.ride_entry_selected.connect(_on_ride_entry_selected)
	_panel.close_requested.connect(_on_close_requested)
	root.add_child(_panel)
	_apply_presented_state()
	await process_frame
	await process_frame

	var initial_state := CharacterManagementPresenter.view_state(
		_profile,
		_pending_allocation,
		_ride_filter_id
	)
	_append_presenter_truth_errors(initial_state)
	_append_layout_errors(initial_state)
	_append_showcase_errors(initial_state)
	_append_attribute_errors(initial_state)
	await _append_tab_interaction_errors()
	await _append_stat_interaction_errors()
	await _append_ride_interaction_errors(initial_state)
	await _append_close_interaction_errors()

	var report := {
		"schemaVersion": 1,
		"reportType": "beastbound.character_management_panel_check",
		"result": "PASS" if _errors.is_empty() else "FAIL",
		"viewport": {
			"width": VIEWPORT_SIZE.x,
			"height": VIEWPORT_SIZE.y,
		},
		"tabEvents": _tab_events,
		"equipmentSlotCount": _child_count("EquipmentGrid"),
		"formalShowcaseLoaded": _formal_showcase_loaded(initial_state),
		"statAdjustEvents": _stat_adjust_events,
		"statResetCount": _stat_reset_count,
		"statConfirmCount": _stat_confirm_count,
		"rideableForms": _sorted_ride_form_ids(initial_state),
		"rideFilterEvents": _ride_filter_events,
		"rideEntryEvents": _ride_entry_events,
		"closeCount": _close_count,
		"errors": _errors,
	}
	print("character management panel check: %s" % JSON.stringify(report))
	_panel.queue_free()
	await process_frame
	quit(0 if _errors.is_empty() else 1)


func _append_presenter_truth_errors(state: Dictionary) -> void:
	var equipment_slots := _dictionary_array(state.get("equipmentSlots", []))
	_expect(
		equipment_slots.size() == 9,
		"presenter 没有从真实装备模型投影 9 个装备槽",
		_errors
	)
	var stat_rows := _dictionary_array(state.get("statRows", []))
	_expect(stat_rows.size() == 4, "presenter 没有投影真实人物四维", _errors)
	var actual_stat_keys: Array[String] = []
	for row in stat_rows:
		actual_stat_keys.append(str(row.get("key", "")))
		_expect(
			int(row.get("current", -1))
				== int(row.get("base", 0)) + int(row.get("bonus", 0)),
			"%s 当前值不是基础值与真实装备加成之和" % str(row.get("key", "")),
			_errors
		)
	actual_stat_keys.sort()
	var expected_stat_keys := EXPECTED_STAT_KEYS.duplicate()
	expected_stat_keys.sort()
	_expect(
		actual_stat_keys == expected_stat_keys,
		"人物属性字段不是生命/攻击/防御/敏捷四维：%s" % str(actual_stat_keys),
		_errors
	)

	var ride_entries := _dictionary_array(state.get("rideEntries", []))
	_expect(
		ride_entries.size() == 3,
		"骑证 presenter 不是严格 3 个真实可骑形态：%d" % ride_entries.size(),
		_errors
	)
	_expect(
		_sorted_ride_form_ids(state) == _sorted_strings(EXPECTED_RIDEABLE_FORMS),
		"骑证 presenter 混入虚构形态或遗漏真实形态：%s"
			% str(_sorted_ride_form_ids(state)),
		_errors
	)
	var bui := _ride_entry(ride_entries, "bui_novice_sprout_earth5_wind5")
	var tiger := _ride_entry(ride_entries, "novice_tiger_mount")
	var thunder := _ride_entry(ride_entries, "thunder_dragon_mount")
	_expect(
		bool(bui.get("permitRequired", false))
			and not bool(bui.get("permitFree", true))
			and not bool(bui.get("permitOwned", true))
			and bool(bui.get("locked", false))
			and str(bui.get("availabilityState", "")) == "permit_missing",
		"芽耳布伊没有正确显示为需证且当前未持证",
		_errors
	)
	_expect(
		bool(tiger.get("permitFree", false))
			and not bool(tiger.get("permitRequired", true)),
		"新手老虎没有正确显示为免骑宠证",
		_errors
	)
	_expect(
		bool(thunder.get("permitFree", false))
			and not bool(thunder.get("permitRequired", true))
			and not bool(thunder.get("locked", true))
			and str(thunder.get("availabilityState", "")) == "available",
		"雷龙没有正确显示为免骑宠证",
		_errors
	)


func _append_layout_errors(state: Dictionary) -> void:
	var canvas := _panel.get_named_control("CharacterManagementCanvas")
	_expect(
		root.size == VIEWPORT_SIZE
			and _close_vec(_panel.size, Vector2(VIEWPORT_SIZE)),
		"角色页检查没有运行在 1280×720 PC 画布",
		_errors
	)
	_expect(canvas != null, "角色页缺少固定 1280×720 主画布", _errors)
	if canvas != null:
		_expect(
			_close_vec(canvas.global_position, Vector2.ZERO)
				and _close_vec(canvas.size, Vector2(VIEWPORT_SIZE)),
			"角色页主画布没有完整覆盖 1280×720",
			_errors
		)
	var bounded_controls := [
		"PanelTitle",
		"CloseButton",
		"Tab_attributes",
		"Tab_stat_points",
		"Tab_ride_permits",
		"EquipmentPanel",
		"AttributeDetailPanel",
		"StatAllocationPanel",
		"RideFilterPanel",
		"RidePermitCatalogPanel",
	]
	for control_name in bounded_controls:
		var control := _panel.get_named_control(control_name)
		_expect(control != null, "角色页缺少控件 %s" % control_name, _errors)
		if control != null:
			_expect(
				_rect_within_viewport(control.get_global_rect()),
				"角色页控件 %s 越过 1280×720 边界：%s"
					% [control_name, str(control.get_global_rect())],
				_errors
			)
	var equipment_grid := _panel.get_named_control("EquipmentGrid") as GridContainer
	_expect(
		equipment_grid != null
			and equipment_grid.columns == 3
			and equipment_grid.get_child_count() == 9,
		"属性页左侧没有形成 3×3 的 9 装备槽",
		_errors
	)
	for slot in _dictionary_array(state.get("equipmentSlots", [])):
		var slot_id := str(slot.get("slotId", ""))
		_expect(
			_panel.get_named_control("EquipmentSlot_%s" % _node_safe_id(slot_id)) != null,
			"属性页遗漏装备槽 %s" % slot_id,
			_errors
		)


func _append_showcase_errors(state: Dictionary) -> void:
	var player := _dictionary(state.get("player", {}))
	var showcase_path := str(player.get("appearanceTexturePath", ""))
	var artwork := _panel.get_named_control("PlayerArtwork") as TextureRect
	var fallback := _panel.get_named_control("PlayerArtworkFallback") as Label
	_expect(
		showcase_path.begins_with("res://assets/characters/")
			and showcase_path.ends_with("/ui/showcase.png")
			and ResourceLoader.exists(showcase_path, "Texture2D"),
		"角色页没有使用正式人物独立 showcase：%s" % showcase_path,
		_errors
	)
	_expect(
		artwork != null and artwork.visible and artwork.texture != null,
		"角色页没有真正加载正式人物全身图",
		_errors
	)
	_expect(
		fallback != null and not fallback.visible,
		"正式人物全身图存在时仍显示占位文案",
		_errors
	)
	var player_name := _panel.get_named_control("PlayerName") as Label
	_expect(
		player_name != null and player_name.text == "山岚",
		"角色页没有展示 fixture 中的真实人物名字",
		_errors
	)


func _append_attribute_errors(state: Dictionary) -> void:
	var attribute_grid := _panel.get_named_control("AttributeStatGrid") as GridContainer
	var stat_summary_grid := _panel.get_named_control("StatSummaryGrid") as GridContainer
	_expect(
		attribute_grid != null and attribute_grid.get_child_count() == 4,
		"属性页没有只展示真实四维",
		_errors
	)
	_expect(
		stat_summary_grid != null and stat_summary_grid.get_child_count() == 4,
		"加点页摘要没有只展示真实四维",
		_errors
	)
	var visible_text := _all_player_facing_text(_panel)
	for banned in BANNED_FAKE_FIELDS:
		_expect(
			not visible_text.contains(banned),
			"角色页伪造了不存在的字段“%s”" % banned,
			_errors
		)
	var level_label := _panel.get_named_control("LevelLabel") as Label
	var player := _dictionary(state.get("player", {}))
	_expect(
		level_label != null
			and level_label.text.contains(str(int(player.get("level", 0)))),
		"属性页等级不是 presenter 真实值",
		_errors
	)
	var earth_row := _panel.get_named_control("Element_earth") as Control
	_expect(earth_row != null, "角色页缺少绿色地元素行", _errors)
	if earth_row != null:
		var earth_value := earth_row.get_node_or_null("Value") as Label
		_expect(
			earth_value != null and earth_value.text == "6",
			"角色页地元素没有展示真实 6 点",
			_errors
		)


func _append_tab_interaction_errors() -> void:
	_expect(_panel.active_tab() == CharacterManagementPanel.TAB_ATTRIBUTES, "角色页默认页签不是属性", _errors)
	for tab_id in EXPECTED_TABS:
		var button := _panel.get_tab_button(tab_id)
		_expect(button != null, "角色页缺少页签 %s" % tab_id, _errors)
		if button == null:
			continue
		_expect(
			button.text == str(EXPECTED_TAB_LABELS.get(tab_id, "")),
			"角色页签 %s 中文文案错误：%s" % [tab_id, button.text],
			_errors
		)
		button.pressed.emit()
		await process_frame
		_expect(
			_panel.active_tab() == tab_id,
			"真实按钮点击后没有切换到页签 %s" % tab_id,
			_errors
		)
		for expected_id in EXPECTED_TABS:
			var page := _page_for_tab(expected_id)
			_expect(page != null, "角色页缺少 %s 对应页面" % expected_id, _errors)
			if page != null:
				_expect(
					page.visible == (expected_id == tab_id),
					"页签 %s 切换后页面显隐错误：%s"
						% [tab_id, expected_id],
					_errors
				)
	_expect(
		_tab_events == EXPECTED_TABS,
		"三页签没有通过真实 pressed 信号按顺序发出事件：%s" % str(_tab_events),
		_errors
	)


func _append_stat_interaction_errors() -> void:
	var tab_button := _panel.get_tab_button(CharacterManagementPanel.TAB_STAT_POINTS)
	if tab_button != null:
		tab_button.pressed.emit()
		await process_frame
	var confirm := _panel.get_named_control("ConfirmStatsButton") as Button
	var reset := _panel.get_named_control("ResetPendingStatsButton") as Button
	var plus_hp := _panel.get_stat_adjust_button("maxHp", 1)
	var minus_hp := _panel.get_stat_adjust_button("maxHp", -1)
	for stat_key in EXPECTED_STAT_KEYS:
		for delta in [-1, 1]:
			var adjust_button := _panel.get_stat_adjust_button(stat_key, delta)
			_expect(
				adjust_button != null
					and adjust_button.text == ""
					and adjust_button.icon != null
					and adjust_button.icon.resource_path.begins_with(
						"res://assets/ui/character_management_awakened_v1/"
					),
				"%s 的加减按钮仍在用文字冒充正式图标" % stat_key,
				_errors
			)
	_expect(
		confirm != null and confirm.disabled
			and reset != null and reset.disabled,
		"没有加点草稿时清空/确认按钮应禁用",
		_errors
	)
	_expect(
		plus_hp != null and not plus_hp.disabled
			and minus_hp != null and minus_hp.disabled,
		"初始加减按钮可用状态错误",
		_errors
	)
	if plus_hp != null:
		plus_hp.pressed.emit()
		await process_frame
	_expect(
		int(_pending_allocation.get("maxHp", 0)) == 1,
		"生命 + 按钮没有形成 1 点未确认草稿",
		_errors
	)
	var projected_hp := _panel.get_named_control("Projected_maxHp") as Label
	var hp_row := _stat_row(
		CharacterManagementPresenter.view_state(_profile, _pending_allocation),
		"maxHp"
	)
	_expect(
		projected_hp != null
			and projected_hp.text == str(int(hp_row.get("projectedCurrent", -1))),
		"生命加点草稿没有按真实每点 +4 投影",
		_errors
	)
	minus_hp = _panel.get_stat_adjust_button("maxHp", -1)
	if minus_hp != null:
		minus_hp.pressed.emit()
		await process_frame
	_expect(
		int(_pending_allocation.get("maxHp", 0)) == 0,
		"生命 − 按钮没有只撤销本次未确认草稿",
		_errors
	)

	var plus_attack := _panel.get_stat_adjust_button("attack", 1)
	if plus_attack != null:
		plus_attack.pressed.emit()
		await process_frame
	reset = _panel.get_named_control("ResetPendingStatsButton") as Button
	_expect(reset != null and not reset.disabled, "存在草稿时清空本次仍被禁用", _errors)
	if reset != null:
		reset.pressed.emit()
		await process_frame
	_expect(
		_pending_point_total(_pending_allocation) == 0 and _stat_reset_count == 1,
		"清空本次按钮没有清除草稿并发出信号",
		_errors
	)

	for _index in 3:
		plus_attack = _panel.get_stat_adjust_button("attack", 1)
		if plus_attack != null:
			plus_attack.pressed.emit()
			await process_frame
	_expect(
		_pending_point_total(_pending_allocation) == 3,
		"加点草稿没有恰好消耗 fixture 的 3 点",
		_errors
	)
	for stat_key in EXPECTED_STAT_KEYS:
		var plus_button := _panel.get_stat_adjust_button(stat_key, 1)
		_expect(
			plus_button != null and plus_button.disabled,
			"剩余 0 点时 %s 的 + 按钮没有禁用" % stat_key,
			_errors
		)
	var remaining_label := _panel.get_named_control("RemainingStatPointsLabel") as Label
	_expect(
		remaining_label != null and remaining_label.text.ends_with("0"),
		"草稿耗尽点数后剩余属性点没有显示 0",
		_errors
	)
	confirm = _panel.get_named_control("ConfirmStatsButton") as Button
	_expect(confirm != null and not confirm.disabled, "有效草稿时确认加点仍被禁用", _errors)
	if confirm != null:
		confirm.pressed.emit()
		await process_frame
	_expect(_stat_confirm_count == 1, "确认加点按钮没有发出确认信号", _errors)

	var zero_profile := _profile.duplicate(true)
	var zero_player := _dictionary(zero_profile.get("player", {})).duplicate(true)
	zero_player["statPoints"] = 0
	zero_profile["player"] = zero_player
	_pending_allocation.clear()
	_panel.apply_view_state(CharacterManagementPresenter.view_state(zero_profile))
	await process_frame
	for stat_key in EXPECTED_STAT_KEYS:
		var zero_plus := _panel.get_stat_adjust_button(stat_key, 1)
		_expect(
			zero_plus != null and zero_plus.disabled,
			"权威剩余点为 0 时 %s 的 + 按钮没有禁用" % stat_key,
			_errors
		)
	confirm = _panel.get_named_control("ConfirmStatsButton") as Button
	reset = _panel.get_named_control("ResetPendingStatsButton") as Button
	_expect(
		confirm != null and confirm.disabled
			and reset != null and reset.disabled,
		"权威剩余点为 0 时确认/清空按钮没有禁用",
		_errors
	)
	_pending_allocation.clear()
	_apply_presented_state()
	await process_frame


func _append_ride_interaction_errors(initial_state: Dictionary) -> void:
	var ride_tab := _panel.get_tab_button(CharacterManagementPanel.TAB_RIDE_PERMITS)
	if ride_tab != null:
		ride_tab.pressed.emit()
		await process_frame
	var ride_grid := _panel.get_named_control("RidePermitGrid") as GridContainer
	_expect(
		ride_grid != null
			and ride_grid.columns == 3
			and ride_grid.get_child_count() == 3,
		"全部筛选没有展示严格 3 个真实骑宠资格",
		_errors
	)
	for form_id in EXPECTED_RIDEABLE_FORMS:
		var entry_button := _panel.get_ride_entry_button(form_id)
		_expect(entry_button != null, "骑证页缺少真实形态 %s" % form_id, _errors)
	var bui_button := _panel.get_ride_entry_button("bui_novice_sprout_earth5_wind5")
	var tiger_button := _panel.get_ride_entry_button("novice_tiger_mount")
	var thunder_button := _panel.get_ride_entry_button("thunder_dragon_mount")
	_expect(
		_status_text(bui_button) == "未获骑证",
		"芽耳布伊卡片没有显示需证未获状态",
		_errors
	)
	_expect(
		_status_text(tiger_button) == "当前骑乘",
		"新手老虎卡片没有显示真实当前骑乘状态",
		_errors
	)
	_expect(
		_status_text(thunder_button) == "可骑乘",
		"已拥有的免证雷龙没有显示可骑乘状态",
		_errors
	)
	var bui_overlay := (
		bui_button.get_node_or_null("AvailabilityOverlay") as ColorRect
		if bui_button != null
		else null
	)
	var bui_lock_icon := (
		bui_button.get_node_or_null("AvailabilityOverlay/LockIcon") as TextureRect
		if bui_button != null
		else null
	)
	var bui_overlay_label := (
		bui_button.get_node_or_null("AvailabilityOverlay/OverlayText") as Label
		if bui_button != null
		else null
	)
	_expect(
		bui_overlay != null
			and bui_lock_icon != null
			and bui_lock_icon.texture != null
			and bui_overlay_label != null
			and bui_overlay_label.text == "缺少骑证",
		"未获骑证卡片缺少正式锁图标、遮罩或原因文案",
		_errors
	)
	_expect(
		tiger_button != null
			and tiger_button.get_node_or_null("OwnedBadgeIcon") != null
			and tiger_button.get_node_or_null("AvailabilityBadge") != null,
		"当前骑宠卡片缺少正式拥有角标或状态牌",
		_errors
	)
	if bui_button != null:
		bui_button.pressed.emit()
		await process_frame
	_expect(
		_ride_entry_events == ["bui_novice_sprout_earth5_wind5"],
		"骑宠资格卡没有通过真实 pressed 信号发出选择事件",
		_errors
	)

	var species_button := _panel.get_named_control("RideFilter_species") as Button
	_expect(species_button != null, "骑证页缺少种族筛选按钮", _errors)
	if species_button != null:
		species_button.pressed.emit()
		await process_frame
	var dynamic_filters := _panel.get_named_control("RideDynamicFilters") as VBoxContainer
	_expect(
		dynamic_filters != null and dynamic_filters.visible,
		"点击种族后没有展开真实族系列表",
		_errors
	)
	var tiger_entry := _ride_entry(
		_dictionary_array(initial_state.get("rideEntries", [])),
		"novice_tiger_mount"
	)
	var tiger_filter_id := "line:%s" % str(tiger_entry.get("lineId", ""))
	var tiger_filter_button := _panel.get_named_control(
		"RideFilter_%s" % _node_safe_id(tiger_filter_id)
	) as Button
	_expect(tiger_filter_button != null, "种族列表缺少新手老虎真实族系", _errors)
	if tiger_filter_button != null:
		tiger_filter_button.pressed.emit()
		await process_frame
	ride_grid = _panel.get_named_control("RidePermitGrid") as GridContainer
	_expect(
		ride_grid != null and ride_grid.get_child_count() == 1
			and _panel.get_ride_entry_button("novice_tiger_mount") != null,
		"选择真实种族后没有筛到新手老虎这一项",
		_errors
	)
	var all_button := _panel.get_named_control("RideFilter_all") as Button
	_expect(all_button != null, "骑证页缺少全部筛选按钮", _errors)
	if all_button != null:
		all_button.pressed.emit()
		await process_frame
	ride_grid = _panel.get_named_control("RidePermitGrid") as GridContainer
	_expect(
		ride_grid != null and ride_grid.get_child_count() == 3,
		"从种族筛选返回全部后没有恢复 3 个真实形态",
		_errors
	)
	_expect(
		_ride_filter_events.size() >= 3
			and _ride_filter_events[0] == "species"
			and _ride_filter_events.has(tiger_filter_id)
			and _ride_filter_events[-1] == "all",
		"全部/种族筛选没有通过真实 pressed 信号完整工作：%s"
			% str(_ride_filter_events),
		_errors
	)


func _append_close_interaction_errors() -> void:
	var close_button := _panel.get_named_control("CloseButton") as Button
	_expect(close_button != null, "角色页缺少关闭按钮", _errors)
	if close_button != null:
		close_button.pressed.emit()
		await process_frame
	_expect(_close_count == 1, "关闭按钮没有发出 close_requested", _errors)


func _apply_presented_state() -> void:
	if _panel == null:
		return
	_panel.apply_view_state(CharacterManagementPresenter.view_state(
		_profile,
		_pending_allocation,
		_ride_filter_id
	))


func _on_tab_requested(tab_id: String) -> void:
	_tab_events.append(tab_id)


func _on_stat_adjust_requested(stat_key: String, delta: int) -> void:
	_stat_adjust_events.append({"statKey": stat_key, "delta": delta})
	_pending_allocation = CharacterManagementPresenter.adjust_pending_allocation(
		_pending_allocation,
		stat_key,
		delta,
		PlayerProgressModel.player_stat_points(_profile)
	)
	_apply_presented_state()


func _on_stat_confirm_requested() -> void:
	_stat_confirm_count += 1


func _on_stat_pending_reset_requested() -> void:
	_stat_reset_count += 1
	_pending_allocation.clear()
	_apply_presented_state()


func _on_ride_filter_requested(filter_id: String) -> void:
	_ride_filter_events.append(filter_id)
	if filter_id == "species":
		return
	_ride_filter_id = filter_id
	_apply_presented_state()


func _on_ride_entry_selected(form_id: String) -> void:
	_ride_entry_events.append(form_id)


func _on_close_requested() -> void:
	_close_count += 1


func _fixture_profile() -> Dictionary:
	var profile := PlayerProgressModel.with_starter_equipment(
		PlayerProgressModel.default_profile()
	)
	var player := _dictionary(profile.get("player", {})).duplicate(true)
	player["name"] = "山岚"
	player["level"] = 80
	player["exp"] = 91703
	player["nextExp"] = 119635
	player["statPoints"] = 3
	player["appearanceId"] = "ember_spark_v1"
	player["elements"] = {"earth": 6, "water": 3, "fire": 0, "wind": 1}
	profile["player"] = player
	profile["rebirthCount"] = 2
	profile[PetRidePermitModel.PROFILE_KEY] = {
		"schemaVersion": PetRidePermitModel.SCHEMA_VERSION,
		"permitIds": [],
	}
	var battle_pet := PlayerProgressModel.create_pet_instance_from_form(
		"pet_battle_fixture",
		"芽耳布伊",
		"bui_novice_sprout_earth5_wind5",
		PlayerProgressModel.PET_STATE_BATTLE,
		40
	)
	var ride_pet := PlayerProgressModel.create_pet_instance_from_form(
		"pet_ride_fixture",
		"新手老虎",
		"novice_tiger_mount",
		PlayerProgressModel.PET_STATE_RIDING,
		40
	)
	var reserve_pet := PlayerProgressModel.create_pet_instance_from_form(
		"pet_reserve_fixture",
		"雷龙",
		"thunder_dragon_mount",
		PlayerProgressModel.PET_STATE_STORAGE,
		120
	)
	profile["petInstances"] = [battle_pet, ride_pet, reserve_pet]
	profile["activePetInstanceId"] = "pet_battle_fixture"
	profile["ridePetInstanceId"] = "pet_ride_fixture"
	profile["unlockedAbilities"] = [PlayerProgressModel.ABILITY_RIDING]
	return PlayerProgressModel.normalize_profile(profile)


func _page_for_tab(tab_id: String) -> Control:
	match tab_id:
		CharacterManagementPanel.TAB_ATTRIBUTES:
			return _panel.get_named_control("AttributesPage")
		CharacterManagementPanel.TAB_STAT_POINTS:
			return _panel.get_named_control("StatPointsPage")
		CharacterManagementPanel.TAB_RIDE_PERMITS:
			return _panel.get_named_control("RidePermitsPage")
		_:
			return null


func _formal_showcase_loaded(state: Dictionary) -> bool:
	var player := _dictionary(state.get("player", {}))
	var path := str(player.get("appearanceTexturePath", ""))
	var artwork := _panel.get_named_control("PlayerArtwork") as TextureRect
	return path != "" and ResourceLoader.exists(path, "Texture2D") \
		and artwork != null and artwork.texture != null


func _status_text(button: Button) -> String:
	if button == null:
		return ""
	var label := button.get_node_or_null("Status") as Label
	return label.text if label != null else ""


func _stat_row(state: Dictionary, stat_key: String) -> Dictionary:
	for row in _dictionary_array(state.get("statRows", [])):
		if str(row.get("key", "")) == stat_key:
			return row
	return {}


func _ride_entry(entries: Array[Dictionary], form_id: String) -> Dictionary:
	for entry in entries:
		if str(entry.get("formId", "")) == form_id:
			return entry
	return {}


func _sorted_ride_form_ids(state: Dictionary) -> Array[String]:
	var result: Array[String] = []
	for entry in _dictionary_array(state.get("rideEntries", [])):
		result.append(str(entry.get("formId", "")))
	result.sort()
	return result


func _sorted_strings(values: Array[String]) -> Array[String]:
	var result := values.duplicate()
	result.sort()
	return result


func _dictionary_array(value) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	if value is Array:
		for item in value:
			if item is Dictionary:
				result.append(item as Dictionary)
	return result


func _dictionary(value) -> Dictionary:
	return value as Dictionary if value is Dictionary else {}


func _pending_point_total(value: Dictionary) -> int:
	var total := 0
	for stat_key in EXPECTED_STAT_KEYS:
		total += maxi(0, int(value.get(stat_key, 0)))
	return total


func _all_player_facing_text(node: Node) -> String:
	var chunks: PackedStringArray = []
	_collect_player_facing_text(node, chunks)
	return "\n".join(chunks)


func _collect_player_facing_text(node: Node, chunks: PackedStringArray) -> void:
	if node is Label:
		chunks.append((node as Label).text)
	elif node is RichTextLabel:
		chunks.append((node as RichTextLabel).text)
	elif node is Button:
		chunks.append((node as Button).text)
	for child in node.get_children():
		_collect_player_facing_text(child, chunks)


func _rect_within_viewport(rect: Rect2) -> bool:
	const EPSILON := 0.6
	return rect.position.x >= -EPSILON \
		and rect.position.y >= -EPSILON \
		and rect.end.x <= float(VIEWPORT_SIZE.x) + EPSILON \
		and rect.end.y <= float(VIEWPORT_SIZE.y) + EPSILON


func _close_vec(left: Vector2, right: Vector2) -> bool:
	return left.distance_to(right) <= 0.6


func _node_safe_id(value: String) -> String:
	var result := value.strip_edges()
	for token in ["/", "\\", ":", ".", " ", "-", "|"]:
		result = result.replace(token, "_")
	return result


func _child_count(control_name: String) -> int:
	var control := _panel.get_named_control(control_name)
	return control.get_child_count() if control != null else 0


func _expect(condition: bool, message: String, errors: Array[String]) -> void:
	if not condition:
		errors.append(message)
