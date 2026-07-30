extends SceneTree

const BackpackAwakenedItemCard := preload(
	"res://scripts/ui/backpack_awakened_item_card.gd"
)
const BackpackAwakenedPanel := preload(
	"res://scripts/ui/backpack_awakened_panel.gd"
)
const BackpackAwakenedPresenter := preload(
	"res://scripts/ui/backpack_awakened_presenter.gd"
)
const BackpackItemIconCatalog := preload(
	"res://scripts/ui/backpack_item_icon_catalog.gd"
)
const BackpackModel := preload(
	"res://scripts/progression/backpack_model.gd"
)
const BackpackPanelPresenter := preload(
	"res://scripts/ui/backpack_panel_presenter.gd"
)
const EquipmentModel := preload(
	"res://scripts/progression/equipment_model.gd"
)
const PlayerProgressModel := preload(
	"res://scripts/progression/player_progress_model.gd"
)

const VIEWPORT_SIZE := Vector2i(1280, 720)
const CLUB_ID := "weapon_wooden_club"
const MATERIAL_ID := "equip_frag_wood_basic"
const USABLE_ID := "item_meat_small"
const EXPECTED_FILTER_IDS: Array[String] = [
	"all",
	"world",
	"battle",
	"capture",
	"equipment",
]
const EXPECTED_FILTER_LABELS: Array[String] = [
	"全部",
	"世界",
	"战斗",
	"捕捉",
	"装备",
]

var _errors: Array[String] = []
var _filter_events: Array[String] = []
var _equip_events: Array[Dictionary] = []
var _unlock_events: Array[int] = []
var _split_events: Array[Dictionary] = []
var _use_target_events: Array[Dictionary] = []
var _drop_events: Array[Dictionary] = []
var _use_target_cancel_count: int = 0
var _cancel_path_reports: Array[Dictionary] = []
var _cancel_refresh_panel: BackpackAwakenedPanel
var _cancel_refresh_state: Dictionary = {}
var _pet_target_anchor_verified: bool = false


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	root.size = VIEWPORT_SIZE
	root.content_scale_size = VIEWPORT_SIZE
	root.content_scale_mode = Window.CONTENT_SCALE_MODE_CANVAS_ITEMS

	BackpackItemIconCatalog.clear_caches_for_qa()
	var fixture := _fixture_profile()
	var profile_value = fixture.get("profile", {})
	var profile := (
		profile_value as Dictionary
		if profile_value is Dictionary
		else {}
	)
	var candidate_instance_id := str(
		fixture.get("candidateInstanceId", "")
	)
	var state := _decorated_view_state(profile)

	var panel := BackpackAwakenedPanel.new()
	panel.name = "BackpackAwakenedPanelCheckSubject"
	panel.position = Vector2.ZERO
	panel.size = Vector2(VIEWPORT_SIZE)
	panel.filter_requested.connect(_on_filter_requested)
	panel.equip_requested.connect(_on_equip_requested)
	panel.unlock_requested.connect(_on_unlock_requested)
	panel.split_requested.connect(_on_split_requested)
	panel.use_target_requested.connect(_on_use_target_requested)
	panel.use_target_cancel_requested.connect(
		_on_use_target_cancel_requested
	)
	panel.slot_dropped.connect(_on_slot_dropped)
	root.add_child(panel)
	panel.apply_view_state(state)
	await process_frame
	await process_frame

	var canvas := panel.get_node_or_null("BackpackCanvas") as Control
	var equipment_layer := (
		panel.get_node_or_null("BackpackCanvas/EquipmentSlots")
		as Control
	)
	var filters := (
		panel.get_node_or_null("BackpackCanvas/InventoryFilters")
		as HBoxContainer
	)
	var inventory_grid := (
		panel.get_node_or_null(
			"BackpackCanvas/InventoryScroll/InventoryGrid"
		)
		as GridContainer
	)
	var overlay := (
		panel.get_node_or_null("BackpackCanvas/ItemDetailOverlay")
		as Control
	)
	var detail_window := (
		panel.get_node_or_null(
			"BackpackCanvas/ItemDetailOverlay/DetailWindow"
		)
		as PanelContainer
	)

	_append_base_layout_errors(
		panel,
		canvas,
		equipment_layer,
		filters,
		inventory_grid,
		state
	)
	_append_real_icon_errors(equipment_layer, inventory_grid)
	_append_footer_action_errors(panel)
	await _append_capacity_lock_errors(
		panel,
		state,
		inventory_grid
	)
	await _append_empty_slot_drop_errors(
		panel,
		state,
		inventory_grid
	)
	await _append_material_detail_errors(
		panel,
		state,
		overlay,
		detail_window
	)
	await _append_pet_target_errors(
		panel,
		state,
		overlay,
		detail_window
	)
	await _append_exact_instance_errors(
		panel,
		profile,
		candidate_instance_id,
		overlay,
		detail_window
	)
	_append_filter_interaction_errors(filters)

	var report := {
		"schemaVersion": 1,
		"reportType": "beastbound.backpack_awakened_panel_check",
		"result": "PASS" if _errors.is_empty() else "FAIL",
		"viewport": {
			"width": VIEWPORT_SIZE.x,
			"height": VIEWPORT_SIZE.y,
		},
		"equipmentSlotCount": (
			equipment_layer.get_child_count()
			if equipment_layer != null
			else 0
		),
		"inventoryCardCount": (
			inventory_grid.get_child_count()
			if inventory_grid != null
			else 0
		),
		"filterCount": (
			filters.get_child_count()
			if filters != null
			else 0
		),
		"filterEvents": _filter_events,
		"unlockedCapacity": int(state.get("capacityTotal", 0)),
		"lockedSlotCount": _rows_of_kind(
			state.get("backpackRows", []),
			"locked"
		).size(),
		"unlockEvents": _unlock_events,
		"splitEvents": _split_events,
		"useTargetEvents": _use_target_events,
		"petTargetAnchorVerified": _pet_target_anchor_verified,
		"pendingUseCancelPaths": _cancel_path_reports,
		"dropPayload": _drop_payload_summary(),
		"exactInstancePayload": (
			_equip_events[0]
			if _equip_events.size() == 1
			else {}
		),
		"realIconCatalogOk": (
			BackpackItemIconCatalog.validation_errors().is_empty()
		),
		"errors": _errors,
	}
	print(
		"backpack awakened panel check: %s"
		% JSON.stringify(report)
	)
	panel.queue_free()
	await process_frame
	quit(0 if _errors.is_empty() else 1)


func _append_base_layout_errors(
	panel: Control,
	canvas: Control,
	equipment_layer: Control,
	filters: HBoxContainer,
	inventory_grid: GridContainer,
	state: Dictionary
) -> void:
	_expect(
		root.size == VIEWPORT_SIZE
			and _close_vec(panel.size, Vector2(VIEWPORT_SIZE)),
		"背包检查没有运行在 1280×720 PC 画布",
		_errors
	)
	_expect(canvas != null, "背包缺少 1280×720 主画布", _errors)
	if canvas != null:
		_expect(
			_close_vec(canvas.size, Vector2(VIEWPORT_SIZE))
				and _close_vec(canvas.global_position, Vector2.ZERO),
			"背包主画布没有完整覆盖 1280×720",
			_errors
		)
	_expect(
		equipment_layer != null
			and equipment_layer.get_child_count() == 9,
		"左侧装备栏没有恰好 9 个装备槽",
		_errors
	)
	_expect(
		inventory_grid != null
			and inventory_grid.columns == 5
			and inventory_grid.get_child_count() == 20,
		"右侧背包没有形成 5×4 的 20 格布局",
		_errors
	)
	var unlocked_rows := _rows_not_of_kind(
		state.get("backpackRows", []),
		"locked"
	)
	var locked_rows := _rows_of_kind(
		state.get("backpackRows", []),
		"locked"
	)
	_expect(
		int(state.get("capacityTotal", 0)) == 15
			and int(state.get("slotLimit", 0)) == 20
			and unlocked_rows.size() == 15
			and locked_rows.size() == 5,
		"背包没有保持实际容量 15 格 + 5 个锁格：%d+%d"
			% [unlocked_rows.size(), locked_rows.size()],
		_errors
	)
	var expected_capacity_text := "%d/15" % int(
		state.get("capacityUsed", -1)
	)
	_expect(
		_find_label(panel, expected_capacity_text) != null,
		"背包容量文案没有显示实际已用/15：%s"
			% expected_capacity_text,
		_errors
	)
	_expect(
		filters != null and filters.get_child_count() == 5,
		"背包没有展示恰好 5 个筛选页签",
		_errors
	)
	if filters == null:
		return
	var actual_labels: Array[String] = []
	for child in filters.get_children():
		if child is Button:
			actual_labels.append((child as Button).text)
	_expect(
		actual_labels == EXPECTED_FILTER_LABELS,
		"背包筛选页签顺序或中文文案错误：%s"
			% str(actual_labels),
		_errors
	)


func _append_real_icon_errors(
	equipment_layer: Control,
	inventory_grid: GridContainer
) -> void:
	var catalog_errors := BackpackItemIconCatalog.validation_errors()
	_expect(
		catalog_errors.is_empty(),
		"背包正式图标目录校验失败：%s" % "；".join(catalog_errors),
		_errors
	)
	var nonempty_card_count := 0
	var runtime_icon_count := 0
	for layer in [equipment_layer, inventory_grid]:
		if layer == null:
			continue
		for child in (layer as Control).get_children():
			if not (child is BackpackAwakenedItemCard):
				continue
			var card := child as BackpackAwakenedItemCard
			var row_value = card.get("entry")
			var row := (
				row_value as Dictionary
				if row_value is Dictionary
				else {}
			)
			var item_id := str(row.get("itemId", "")).strip_edges()
			if item_id == "":
				continue
			nonempty_card_count += 1
			_expect(
				BackpackItemIconCatalog.has_real_texture(item_id),
				"物品没有正式图标来源：%s" % item_id,
				_errors
			)
			var icon := card.get_node_or_null("ItemIcon") as TextureRect
			if (
				icon != null
				and icon.texture != null
				and icon.texture.get_width() > 0
				and icon.texture.get_height() > 0
			):
				runtime_icon_count += 1
			else:
				_errors.append("物品卡没有装载真实 Texture2D：%s" % item_id)
	_expect(
		nonempty_card_count >= 6
			and runtime_icon_count == nonempty_card_count,
		"真实物品卡/图标数量不完整：%d/%d"
			% [runtime_icon_count, nonempty_card_count],
		_errors
	)


func _append_footer_action_errors(panel: Control) -> void:
	var synthesis := _find_button(panel, "装备合成")
	var repair := _find_button(panel, "修理全部")
	_expect(
		synthesis != null and synthesis.is_visible_in_tree(),
		"背包底部缺少可见的装备合成入口",
		_errors
	)
	_expect(
		repair != null and not repair.is_visible_in_tree(),
		"尚未开放的远程修理入口没有保持隐藏",
		_errors
	)


func _append_capacity_lock_errors(
	panel: Control,
	state: Dictionary,
	inventory_grid: GridContainer
) -> void:
	var locked_rows := _rows_of_kind(
		state.get("backpackRows", []),
		"locked"
	)
	var locked_indices: Array[int] = []
	for row in locked_rows:
		locked_indices.append(int(row.get("slotIndex", -1)))
	_expect(
		locked_indices == [15, 16, 17, 18, 19],
		"5 个锁格没有精确占据槽位 15-19：%s"
			% str(locked_indices),
		_errors
	)
	var first_locked := _card_for_slot(inventory_grid, 15)
	_expect(
		first_locked != null
			and not first_locked.disabled
			and bool(first_locked.entry.get("locked", false))
			and not bool(
				first_locked.entry.get("dropEnabled", true)
			),
		"第一个锁格不是可点击、不可拖放的真实锁格",
		_errors
	)
	_unlock_events.clear()
	if first_locked != null and not first_locked.disabled:
		first_locked.pressed.emit()
	await process_frame
	_expect(
		_unlock_events == [15],
		"点击第一个锁格没有只发出 unlock slot=15：%s"
			% str(_unlock_events),
		_errors
	)
	panel.call("_hide_overlay")


func _append_empty_slot_drop_errors(
	panel: Control,
	state: Dictionary,
	inventory_grid: GridContainer
) -> void:
	panel.apply_view_state(state)
	await process_frame
	await process_frame
	var source_card := _card_for_item(inventory_grid, MATERIAL_ID)
	var target_card := _first_unlocked_empty_card(inventory_grid)
	_expect(
		source_card != null
			and bool(source_card.entry.get("dragEnabled", false))
			and str(source_card.entry.get("context", "")) == "backpack",
		"真实材料格没有成为背包拖动源",
		_errors
	)
	_expect(
		target_card != null
			and str(target_card.entry.get("kind", "")) == "empty"
			and int(target_card.entry.get("slotIndex", -1)) < 15
			and bool(target_card.entry.get("dropEnabled", false)),
		"15 个已解锁槽中没有真实可接收拖放的空闲槽",
		_errors
	)
	if source_card == null or target_card == null:
		return
	var source_value = source_card.call("_slot_data")
	var source_data := (
		source_value as Dictionary
		if source_value is Dictionary
		else {}
	)
	source_data["dragKind"] = "item_slot"
	var accepts_drop := bool(
		target_card.call(
			"_can_drop_data",
			Vector2(24.0, 24.0),
			source_data
		)
	)
	_expect(
		accepts_drop,
		"真实空闲槽拒绝了背包物品拖放",
		_errors
	)
	_drop_events.clear()
	if accepts_drop:
		target_card.call(
			"_drop_data",
			Vector2(24.0, 24.0),
			source_data
		)
	await process_frame
	var target_index := int(target_card.entry.get("slotIndex", -1))
	_expect(
		_drop_events.size() == 1
			and str(
				(_drop_events[0].get("source", {}) as Dictionary)
					.get("itemId", "")
			) == MATERIAL_ID
			and int(
				(_drop_events[0].get("target", {}) as Dictionary)
					.get("slotIndex", -1)
			) == target_index,
		"真实空闲槽拖放没有保留来源物品和目标槽：%s"
			% str(_drop_events),
		_errors
	)


func _append_material_detail_errors(
	panel: Control,
	state: Dictionary,
	overlay: Control,
	detail_window: PanelContainer
) -> void:
	panel.apply_view_state(state)
	await process_frame
	var material_row := _row_for_item(
		state.get("backpackRows", []),
		MATERIAL_ID
	)
	_expect(
		not material_row.is_empty()
			and not bool(material_row.get("canUse", true)),
		"真实材料数据没有保持不可直接使用",
		_errors
	)
	if material_row.is_empty():
		return
	panel.call("_on_inventory_entry_pressed", material_row)
	await process_frame
	_expect(
		overlay != null and overlay.is_visible_in_tree(),
		"点击材料后没有打开详情浮层",
		_errors
	)
	_append_overlay_bounds_errors(
		detail_window,
		"材料详情"
	)
	var use_button := _find_button(detail_window, "使用")
	_expect(
		use_button != null and not use_button.is_visible_in_tree(),
		"材料详情错误展示了“使用”按钮",
		_errors
	)
	var split_button := _find_button(detail_window, "拆分")
	var material_slot_index := int(
		material_row.get("slotIndex", -1)
	)
	_expect(
		split_button != null
			and split_button.is_visible_in_tree()
			and not split_button.disabled,
		"可堆叠材料详情没有展示可用的“拆分”按钮",
		_errors
	)
	_split_events.clear()
	if split_button != null and not split_button.disabled:
		split_button.pressed.emit()
	await process_frame
	_expect(
		_split_events.size() == 1
			and int(_split_events[0].get("slotIndex", -1))
				== material_slot_index
			and str(_split_events[0].get("itemId", ""))
				== MATERIAL_ID
			and int(_split_events[0].get("count", 0)) == 6,
		"拆分按钮没有发出真实材料堆叠负载：%s"
			% str(_split_events),
		_errors
	)


func _append_pet_target_errors(
	panel: Control,
	state: Dictionary,
	overlay: Control,
	detail_window: PanelContainer
) -> void:
	_expect(
		BackpackModel.item_can_world_pet_heal(USABLE_ID),
		"宠物目标层夹具没有使用真实宠物治疗道具",
		_errors
	)
	var target_state := state.duplicate(true)
	target_state["comparison"] = {}
	target_state["closeOverlay"] = false
	target_state["pendingUse"] = {
		"visible": true,
		"itemId": USABLE_ID,
		"itemLabel": BackpackModel.label_for(
			USABLE_ID,
			"宠物药"
		),
		"summary": "请选择本次使用目标",
		"targets": [
			{
				"targetType": "pet",
				"targetId": "pet_check_0001",
				"label": "芽耳布伊",
				"summary": "生命 42/120",
				"disabled": false,
			},
		],
	}
	panel.apply_view_state(target_state)
	await process_frame
	_expect(
		overlay != null
			and overlay.is_visible_in_tree()
			and _find_label(panel, "选择使用目标") != null,
		"宠物道具没有打开目标选择层",
		_errors
	)
	_append_overlay_bounds_errors(
		detail_window,
		"宠物目标选择"
	)
	var pet_button := _find_button_containing(
		detail_window,
		"芽耳布伊"
	)
	var target_anchor = panel.call(
		"target_button_for_pet",
		"pet_check_0001"
	)
	_expect(
		pet_button != null
			and pet_button.is_visible_in_tree()
			and not pet_button.disabled,
		"宠物目标选择层没有可点击的宠物目标",
		_errors
	)
	_pet_target_anchor_verified = (
		target_anchor is Button
		and target_anchor == pet_button
		and (target_anchor as Button).is_visible_in_tree()
		and str(
			(target_anchor as Button).get_meta(
				"backpack_target_type",
				""
			)
		) == "pet"
		and str(
			(target_anchor as Button).get_meta(
				"backpack_target_id",
				""
			)
		) == "pet_check_0001"
	)
	_expect(
		_pet_target_anchor_verified,
		"target_button_for_pet 没有返回当前可见真实宠物按钮",
		_errors
	)
	_use_target_events.clear()
	if pet_button != null and not pet_button.disabled:
		pet_button.pressed.emit()
	await process_frame
	_expect(
		_use_target_events.size() == 1
			and str(_use_target_events[0].get("itemId", ""))
				== USABLE_ID
			and str(_use_target_events[0].get("targetType", ""))
				== "pet"
			and str(_use_target_events[0].get("targetId", ""))
				== "pet_check_0001",
		"宠物目标按钮没有发出 item/pet/targetId：%s"
			% str(_use_target_events),
		_errors
	)
	await _append_pending_use_close_path_errors(
		panel,
		target_state,
		state,
		overlay
	)


func _append_pending_use_close_path_errors(
	panel: Control,
	target_state: Dictionary,
	cleared_state: Dictionary,
	overlay: Control
) -> void:
	_cancel_path_reports.clear()
	_cancel_refresh_panel = panel as BackpackAwakenedPanel
	_cancel_refresh_state = cleared_state.duplicate(true)
	for path in ["shade", "escape", "close_button"]:
		_use_target_cancel_count = 0
		panel.apply_view_state(target_state)
		await process_frame
		var visible_anchor = panel.call(
			"target_button_for_pet",
			"pet_check_0001"
		)
		_expect(
			overlay != null
				and overlay.is_visible_in_tree()
				and visible_anchor is Button
				and (visible_anchor as Button).is_visible_in_tree(),
			"%s 关闭路径开始前目标层或宠物锚点不可见"
				% path,
			_errors
		)
		match path:
			"shade":
				var mouse_event := InputEventMouseButton.new()
				mouse_event.button_index = MOUSE_BUTTON_LEFT
				mouse_event.pressed = true
				panel.call(
					"_on_overlay_shade_input",
					mouse_event
				)
			"escape":
				var key_event := InputEventKey.new()
				key_event.keycode = KEY_ESCAPE
				key_event.pressed = true
				key_event.echo = false
				panel.call("_unhandled_key_input", key_event)
			"close_button":
				var close_button := panel.get_node_or_null(
					"BackpackCanvas/CloseButton"
				) as Button
				_expect(
					close_button != null,
					"pendingUse 关闭回归找不到右上 X",
					_errors
				)
				if close_button != null:
					close_button.pressed.emit()
		await process_frame
		await process_frame
		var anchor_after_close = panel.call(
			"target_button_for_pet",
			"pet_check_0001"
		)
		var stayed_closed := (
			overlay != null
			and not overlay.is_visible_in_tree()
			and anchor_after_close == null
		)
		_cancel_path_reports.append({
			"path": path,
			"cancelCount": _use_target_cancel_count,
			"stayedClosed": stayed_closed,
		})
		_expect(
			_use_target_cancel_count == 1
				and stayed_closed,
			"%s 关闭 pendingUse 没有只取消一次并保持关闭：%s"
				% [path, str(_cancel_path_reports[-1])],
			_errors
		)
	_cancel_refresh_panel = null
	_cancel_refresh_state.clear()


func _append_exact_instance_errors(
	panel: Control,
	profile: Dictionary,
	candidate_instance_id: String,
	overlay: Control,
	detail_window: PanelContainer
) -> void:
	var selection_key := "instance:%s" % candidate_instance_id
	var state := _decorated_view_state(
		profile,
		selection_key
	)
	var expected_comparison := (
		BackpackAwakenedPresenter.comparison_for_selection(
			profile,
			selection_key
		)
	)
	var comparison_value = state.get("comparison", {})
	var comparison := (
		comparison_value as Dictionary
		if comparison_value is Dictionary
		else {}
	)
	_expect(
		not expected_comparison.is_empty()
			and comparison == expected_comparison
			and bool(comparison.get("visible", false))
			and str(comparison.get("candidateInstanceId", ""))
				== candidate_instance_id,
		"装备对比没有由 BackpackAwakenedPresenter 生成权威结果",
		_errors
	)
	var candidate_row := _row_for_instance(
		state.get("backpackRows", []),
		candidate_instance_id
	)
	_expect(
		not candidate_row.is_empty(),
		"真实背包状态缺少同模板候选装备实例",
		_errors
	)
	if candidate_row.is_empty():
		return
	var action_value = candidate_row.get("actionRef", {})
	var action_ref := (
		action_value as Dictionary
		if action_value is Dictionary
		else {}
	)
	_expect(
		str(action_ref.get("itemId", "")) == CLUB_ID
			and str(action_ref.get("instanceId", ""))
				== candidate_instance_id,
		"候选装备行没有保留 exact-instance actionRef",
			_errors
	)

	panel.apply_view_state(state)
	await process_frame
	var provided_value = panel.call(
		"_comparison_for_row",
		candidate_row
	)
	var provided := (
		provided_value as Dictionary
		if provided_value is Dictionary
		else {}
	)
	_expect(
		provided == expected_comparison,
		"视图没有原样采用 presenter comparison",
		_errors
	)
	panel.call("_hide_overlay")
	panel.call("_on_inventory_entry_pressed", candidate_row)
	await process_frame
	_expect(
		overlay != null and overlay.is_visible_in_tree(),
		"点击候选装备后没有打开装备对比浮层",
		_errors
	)
	_append_overlay_bounds_errors(
		detail_window,
		"装备对比"
	)
	var equip_button := _find_button(detail_window, "装备")
	_expect(
		equip_button != null
			and equip_button.is_visible_in_tree()
			and not equip_button.disabled,
		"装备对比浮层没有可用的“装备”按钮",
		_errors
	)
	if equip_button != null and not equip_button.disabled:
		equip_button.pressed.emit()
	await process_frame
	_expect(
		_equip_events.size() == 1
			and str(_equip_events[0].get("itemId", "")) == CLUB_ID
			and str(_equip_events[0].get("instanceId", ""))
				== candidate_instance_id,
		"装备按钮没有发送精确候选实例：%s"
			% str(_equip_events),
		_errors
	)


func _append_overlay_bounds_errors(
	detail_window: PanelContainer,
	label: String
) -> void:
	_expect(
		detail_window != null,
		"%s缺少 DetailWindow" % label,
		_errors
	)
	if detail_window == null:
		return
	var viewport_rect := Rect2(Vector2.ZERO, Vector2(VIEWPORT_SIZE))
	var detail_rect := detail_window.get_global_rect()
	_expect(
		_rect_contains(viewport_rect, detail_rect),
		"%s浮层越出 1280×720：%s" % [label, str(detail_rect)],
		_errors
	)


func _append_filter_interaction_errors(filters: HBoxContainer) -> void:
	if filters == null:
		return
	_filter_events.clear()
	for child in filters.get_children():
		if child is Button:
			(child as Button).pressed.emit()
	_expect(
		_filter_events == EXPECTED_FILTER_IDS,
		"5 个真实筛选按钮没有按顺序发出筛选请求：%s"
			% str(_filter_events),
		_errors
	)


func _decorated_view_state(
	profile: Dictionary,
	candidate_selection_key: String = ""
) -> Dictionary:
	var state := BackpackAwakenedPresenter.view_state(
		profile,
		BackpackPanelPresenter.FILTER_ALL,
		candidate_selection_key
	)
	var slots := PlayerProgressModel.backpack_slots(profile)
	var decorated_rows: Array[Dictionary] = []
	for row_value in state.get("backpackRows", []):
		if not (row_value is Dictionary):
			continue
		var row := (row_value as Dictionary).duplicate(true)
		var item_id := str(row.get("itemId", ""))
		var slot_index := int(row.get("slotIndex", -1))
		var is_equipment_instance := EquipmentModel.is_equipment(
			item_id
		)
		row["context"] = "backpack"
		row["label"] = BackpackModel.label_for(
			item_id,
			str(row.get("itemLabel", "物品"))
		)
		row["dragEnabled"] = (
			item_id != ""
			and not is_equipment_instance
		)
		row["dropEnabled"] = true
		row["accepts"] = [
			"backpack",
			"shop_buy",
			"bank_storage",
		]
		if str(row.get("kind", "")) == (
			BackpackAwakenedPresenter.KIND_EMPTY
		):
			row["canSelect"] = true
		row["canUse"] = false
		row["useLabel"] = "使用"
		if (
			not is_equipment_instance
			and slot_index >= 0
			and slot_index < slots.size()
		):
			var slot := slots[slot_index]
			var action_state := (
				BackpackPanelPresenter.selected_item_actions(
					slot,
					slots,
					{}
				)
			)
			row["canUse"] = (
				bool(action_state.get("useButtonVisible", false))
				and not bool(
					action_state.get("useButtonDisabled", true)
				)
			)
			row["useLabel"] = str(
				action_state.get("useButtonText", "使用")
			)
		decorated_rows.append(row)
	var unlocked_count := BackpackModel.unlocked_slot_count(
		int(profile.get("backpackExtraSlots", 0))
	)
	for slot_index in range(
		unlocked_count,
		BackpackModel.SLOT_LIMIT
	):
		decorated_rows.append({
			"kind": "locked",
			"locked": true,
			"slotIndex": slot_index,
			"itemId": "",
			"itemLabel": "扩展格",
			"stateSummary": "未解锁",
			"count": 0,
			"canSelect": true,
			"context": "backpack",
			"dragEnabled": false,
			"dropEnabled": false,
			"accepts": [],
		})
	state["backpackRows"] = decorated_rows
	var used_slots := 0
	for slot in slots:
		if (
			str(slot.get("itemId", "")) != ""
			and int(slot.get("count", 0)) > 0
		):
			used_slots += 1
	var player_value = profile.get("player", {})
	var player := (
		player_value as Dictionary
		if player_value is Dictionary
		else {}
	)
	state["currencies"] = {
		"stoneCoins": int(profile.get("stoneCoins", 0)),
		"diamonds": int(profile.get("diamonds", 0)),
	}
	state["playerName"] = str(player.get("name", "见习猎人"))
	state["playerLevel"] = int(player.get("level", 1))
	state["rebirthCount"] = int(profile.get("rebirthCount", 0))
	state["capacityUsed"] = used_slots
	state["capacityTotal"] = unlocked_count
	state["slotLimit"] = BackpackModel.SLOT_LIMIT
	state["closeOverlay"] = candidate_selection_key == ""
	state["synthesisAvailable"] = true
	state["repairAvailable"] = false
	state["pendingUse"] = {}
	return state


func _fixture_profile() -> Dictionary:
	var profile := PlayerProgressModel.without_equipment(
		PlayerProgressModel.default_profile()
	)
	profile["backpackExtraSlots"] = 0
	var player := (profile.get("player", {}) as Dictionary).duplicate(true)
	player["name"] = "岩岚猎手"
	player["level"] = 140
	profile["player"] = player
	profile["rebirthCount"] = 2
	var slots: Array[Dictionary] = [
		{"itemId": CLUB_ID, "count": 2},
		{"itemId": USABLE_ID, "count": 8},
		{"itemId": MATERIAL_ID, "count": 6},
		{"itemId": "capture_net", "count": 3},
		{"itemId": "encounter_stone_mid", "count": 2},
		{"itemId": "novice_tiger_egg", "count": 1},
	]
	while slots.size() < BackpackModel.BASE_SLOT_LIMIT:
		slots.append({})
	profile = PlayerProgressModel.with_backpack_slots(profile, slots)
	var club_instance_ids := (
		PlayerProgressModel.backpack_equipment_instance_ids(
			profile,
			CLUB_ID
		)
	)
	_expect(
		club_instance_ids.size() == 2,
		"夹具没有从真实背包合同生成两个木棒实例",
		_errors
	)
	if club_instance_ids.size() != 2:
		return {
			"profile": profile,
			"candidateInstanceId": "",
		}
	profile = _with_enhancement(
		profile,
		club_instance_ids[0],
		1
	)
	profile = _with_enhancement(
		profile,
		club_instance_ids[1],
		4
	)
	var equip_result := PlayerProgressModel.equip_item(
		profile,
		CLUB_ID,
		club_instance_ids[0]
	)
	_expect(
		bool(equip_result.get("ok", false)),
		"夹具无法精确装备当前 +1 木棒",
		_errors
	)
	profile = (
		equip_result.get("profile", profile) as Dictionary
	)
	return {
		"profile": profile,
		"candidateInstanceId": club_instance_ids[1],
	}


func _with_enhancement(
	profile: Dictionary,
	instance_id: String,
	level: int
) -> Dictionary:
	var next_profile := profile.duplicate(true)
	var instances := PlayerProgressModel.equipment_instances(next_profile)
	var record_value = instances.get(instance_id, {})
	var record := (
		(record_value as Dictionary).duplicate(true)
		if record_value is Dictionary
		else {}
	)
	record["enhancement"] = {
		"itemId": str(record.get("itemId", "")),
		"level": level,
		"history": [],
	}
	instances[instance_id] = record
	next_profile["equipmentInstances"] = instances
	return PlayerProgressModel.normalize_profile(next_profile)


func _row_for_item(value, item_id: String) -> Dictionary:
	if not (value is Array):
		return {}
	for row_value in value as Array:
		if (
			row_value is Dictionary
			and str((row_value as Dictionary).get("itemId", ""))
				== item_id
		):
			return (row_value as Dictionary).duplicate(true)
	return {}


func _row_for_instance(value, instance_id: String) -> Dictionary:
	if not (value is Array):
		return {}
	for row_value in value as Array:
		if (
			row_value is Dictionary
			and str(
				(row_value as Dictionary).get("instanceId", "")
			) == instance_id
		):
			return (row_value as Dictionary).duplicate(true)
	return {}


func _rows_of_kind(value, kind: String) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	if not (value is Array):
		return result
	for row_value in value as Array:
		if (
			row_value is Dictionary
			and str((row_value as Dictionary).get("kind", ""))
				== kind
		):
			result.append(
				(row_value as Dictionary).duplicate(true)
			)
	return result


func _rows_not_of_kind(value, kind: String) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	if not (value is Array):
		return result
	for row_value in value as Array:
		if (
			row_value is Dictionary
			and str((row_value as Dictionary).get("kind", ""))
				!= kind
		):
			result.append(
				(row_value as Dictionary).duplicate(true)
			)
	return result


func _card_for_slot(
	grid: GridContainer,
	slot_index: int
) -> BackpackAwakenedItemCard:
	if grid == null:
		return null
	for child in grid.get_children():
		if not (child is BackpackAwakenedItemCard):
			continue
		var card := child as BackpackAwakenedItemCard
		if int(card.entry.get("slotIndex", -1)) == slot_index:
			return card
	return null


func _card_for_item(
	grid: GridContainer,
	item_id: String
) -> BackpackAwakenedItemCard:
	if grid == null:
		return null
	for child in grid.get_children():
		if not (child is BackpackAwakenedItemCard):
			continue
		var card := child as BackpackAwakenedItemCard
		if str(card.entry.get("itemId", "")) == item_id:
			return card
	return null


func _first_unlocked_empty_card(
	grid: GridContainer
) -> BackpackAwakenedItemCard:
	if grid == null:
		return null
	for child in grid.get_children():
		if not (child is BackpackAwakenedItemCard):
			continue
		var card := child as BackpackAwakenedItemCard
		if (
			str(card.entry.get("kind", "")) == "empty"
			and not bool(card.entry.get("locked", false))
			and int(card.entry.get("slotIndex", -1)) < 15
		):
			return card
	return null


func _find_button(node: Node, text: String) -> Button:
	if node == null:
		return null
	if node is Button and (node as Button).text == text:
		return node as Button
	for child in node.get_children():
		var found := _find_button(child, text)
		if found != null:
			return found
	return null


func _find_button_containing(
	node: Node,
	fragment: String
) -> Button:
	if node == null:
		return null
	if (
		node is Button
		and (node as Button).text.contains(fragment)
	):
		return node as Button
	for child in node.get_children():
		var found := _find_button_containing(child, fragment)
		if found != null:
			return found
	return null


func _find_label(node: Node, text: String) -> Label:
	if node == null:
		return null
	if node is Label and (node as Label).text == text:
		return node as Label
	for child in node.get_children():
		var found := _find_label(child, text)
		if found != null:
			return found
	return null


func _on_filter_requested(filter_id: String) -> void:
	_filter_events.append(filter_id)


func _on_equip_requested(
	item_id: String,
	instance_id: String
) -> void:
	_equip_events.append({
		"itemId": item_id,
		"instanceId": instance_id,
	})


func _on_unlock_requested(slot_index: int) -> void:
	_unlock_events.append(slot_index)


func _on_split_requested(
	slot_index: int,
	item_id: String,
	count: int
) -> void:
	_split_events.append({
		"slotIndex": slot_index,
		"itemId": item_id,
		"count": count,
	})


func _on_use_target_requested(
	item_id: String,
	target_type: String,
	target_id: String
) -> void:
	_use_target_events.append({
		"itemId": item_id,
		"targetType": target_type,
		"targetId": target_id,
	})


func _on_use_target_cancel_requested() -> void:
	_use_target_cancel_count += 1
	if (
		_cancel_refresh_panel != null
		and is_instance_valid(_cancel_refresh_panel)
		and not _cancel_refresh_state.is_empty()
	):
		_cancel_refresh_panel.apply_view_state(
			_cancel_refresh_state
		)


func _on_slot_dropped(
	source_data: Dictionary,
	target_data: Dictionary
) -> void:
	_drop_events.append({
		"source": source_data.duplicate(true),
		"target": target_data.duplicate(true),
	})


func _drop_payload_summary() -> Dictionary:
	if _drop_events.size() != 1:
		return {}
	var source_value = _drop_events[0].get("source", {})
	var target_value = _drop_events[0].get("target", {})
	var source := (
		source_value as Dictionary
		if source_value is Dictionary
		else {}
	)
	var target := (
		target_value as Dictionary
		if target_value is Dictionary
		else {}
	)
	return {
		"sourceSlot": int(source.get("slotIndex", -1)),
		"sourceItemId": str(source.get("itemId", "")),
		"targetSlot": int(target.get("slotIndex", -1)),
	}


func _rect_contains(outer: Rect2, inner: Rect2) -> bool:
	const EPSILON := 0.75
	return (
		inner.position.x >= outer.position.x - EPSILON
		and inner.position.y >= outer.position.y - EPSILON
		and inner.end.x <= outer.end.x + EPSILON
		and inner.end.y <= outer.end.y + EPSILON
	)


func _close_vec(left: Vector2, right: Vector2) -> bool:
	return left.distance_to(right) <= 0.75


func _expect(
	condition: bool,
	message: String,
	errors: Array[String]
) -> void:
	if not condition:
		errors.append(message)
