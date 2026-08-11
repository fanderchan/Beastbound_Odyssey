extends RefCounted

const CAPTURE_FLAG := "--commerce-awakened-owner-review-capture"
const BackpackModel := preload("res://scripts/progression/backpack_model.gd")
const InteractionModel := preload("res://scripts/world/interaction_model.gd")
const PlayerProgressModel := preload(
	"res://scripts/progression/player_progress_model.gd"
)

const REVIEW_FPS := 30
const ITEM_SHOP_ID := "firebud_item_shop"
const EQUIPMENT_SHOP_ID := "firebud_equipment_shop"
const ITEM_SHOP_NPC_ID := "firebud_shopkeeper"
const EQUIPMENT_SHOP_NPC_ID := "firebud_equipment_keeper"
const BANK_NPC_ID := "firebud_bank_keeper"
const MEAT_ITEM_ID := "item_meat_small"
const WOOD_FRAGMENT_ID := "equip_frag_wood_basic"
const HIDE_FRAGMENT_ID := "equip_frag_hide_basic"
const SYNTHESIS_RECIPE_ID := "craft_stitched_hide_vest"

var host
var _started_msec: int = 0
var _failed: bool = false


func _init(host_node) -> void:
	host = host_node


func run() -> void:
	_started_msec = Time.get_ticks_msec()
	_configure_isolated_review_profile()
	if _failed:
		return
	await _hold("world_context", 2.0)
	await _open_item_shop()
	if _failed:
		return
	await _hold("item_shop_identity", 2.5)
	await _switch_item_shop_to_sell()
	if _failed:
		return
	await _hold("item_shop_sell", 2.0)
	await _open_equipment_shop()
	if _failed:
		return
	await _hold("equipment_shop_identity", 2.5)
	await _open_bank()
	if _failed:
		return
	await _hold("bank_identity", 2.5)
	await _review_bank_drag_split()
	if _failed:
		return
	await _hold("bank_drag_split", 2.5)
	await _open_synthesis_recipe()
	if _failed:
		return
	await _hold("synthesis_recipe", 2.5)
	await _open_synthesis_confirmation()
	if _failed:
		return
	await _hold("synthesis_confirm", 2.0)
	await _return_to_world()
	if _failed:
		return
	await _hold("return_world", 2.0)
	await _drain_main_audio_for_movie_shutdown()
	if _failed:
		return
	var elapsed := float(Time.get_ticks_msec() - _started_msec) / 1000.0
	print(
		(
			"COMMERCE_AWAKENED_OWNER_REVIEW_END elapsed_wall=%.3f "
			+ "speed=1.00x profile=isolated backend=false"
		) % elapsed
	)
	host.get_tree().quit(0)


func _drain_main_audio_for_movie_shutdown() -> void:
	# The already-recorded town loop otherwise keeps its Ogg playback and
	# cached streams alive through MovieWriter shutdown.  End any battle cue,
	# stop the manager, let AudioServer drain, then release the manager before
	# quitting.  These four silent frames still show the final world chapter.
	var timeline = host.get("battle_audio_timeline_controller")
	if timeline != null and timeline.has_method("end_event"):
		timeline.call("end_event")
	host.battle_audio_timeline_controller = null
	var manager := host.get("game_audio_manager") as Node
	if manager == null or not is_instance_valid(manager):
		_fail_capture("Main 音频管理器不存在，无法安全收口 MovieWriter")
		return
	if not manager.has_method("stop_all"):
		_fail_capture("Main 音频管理器缺少 stop_all 收口合同")
		return
	manager.call("stop_all")
	for _frame_index in range(2):
		await host.get_tree().process_frame
		await RenderingServer.frame_post_draw
	manager.queue_free()
	for _frame_index in range(2):
		await host.get_tree().process_frame
		await RenderingServer.frame_post_draw
	host.game_audio_manager = null
	if is_instance_valid(manager):
		_fail_capture("Main 音频管理器没有在 MovieWriter 退出前释放")


func _configure_isolated_review_profile() -> void:
	host.profile_save_enabled = false
	host.bank_drag_preview = true
	host.account_authenticated = true
	host.current_account_session = {
		"accountId": "commerce_owner_review_account",
		"username": "commerce_owner_review",
		"displayName": "商业页验收",
		"authSource": "server",
		"serverSessionToken": "isolated_owner_review_token",
		"serverBaseUrl": "http://127.0.0.1:1",
	}
	host.server_profile_sync_state = "ready"
	host.server_profile_sync_pending_kind = ""
	host.server_profile_sync_dirty = false
	host.server_profile_sync_pull_queued = false
	host.bank_request_pending = false
	host.profile_action_request_pending = false

	var profile := PlayerProgressModel.default_profile()
	profile = PlayerProgressModel.with_stone_coins(profile, 16800)
	profile = PlayerProgressModel.with_diamonds(profile, 680)
	var slots := PlayerProgressModel.backpack_slots(profile)
	slots = BackpackModel.set_item_count(slots, MEAT_ITEM_ID, 18)
	slots = BackpackModel.set_item_count(slots, "trail_ration_pack", 4)
	slots = BackpackModel.set_item_count(slots, WOOD_FRAGMENT_ID, 6)
	slots = BackpackModel.set_item_count(slots, HIDE_FRAGMENT_ID, 6)
	profile = PlayerProgressModel.with_backpack_slots(profile, slots)
	profile["bank"] = {
		"stoneCoins": 2400,
		"items": [
			{"itemId": "quest_field_note", "count": 2},
			{"itemId": "item_pet_salve_mid", "count": 6},
			{"itemId": "item_heal_single_5", "count": 3},
		],
		"schemaVersion": 1,
	}
	host.player_profile = PlayerProgressModel.normalize_profile(profile)
	if not host._load_map("firebud_village_gate", "from_training_yard"):
		_fail_capture("无法载入火芽村商业页验收地图")
		return
	host._set_world_log_message("火芽村的商店、银行与锻造服务已经开放。")
	host._update_hud_text(true)


func _open_item_shop() -> void:
	var interaction := _interaction(ITEM_SHOP_NPC_ID)
	if interaction.is_empty():
		_fail_capture("火芽村缺少杂货商阿芸")
		return
	host._open_shop_panel(ITEM_SHOP_ID, interaction)
	await _settle()
	_expect_service_identity(
		host.shop_panel,
		"杂货商阿芸",
		"杂货商",
		"药品、捕捉工具与杂货",
		"杂货铺"
	)


func _switch_item_shop_to_sell() -> void:
	var button = host.shop_panel.find_child("ShopSellButton", true, false)
	if not (button is Button):
		_fail_capture("杂货铺缺少出售页签")
		return
	await _left_click(button as Button, "杂货铺出售页签")
	if str(host.shop_mode) != "sell":
		_fail_capture("真实左键没有切换到出售模式")


func _open_equipment_shop() -> void:
	await _close_visible_panel(host.shop_panel, "ShopCloseButton", "关闭杂货铺")
	if _failed:
		return
	var interaction := _interaction(EQUIPMENT_SHOP_NPC_ID)
	if interaction.is_empty():
		_fail_capture("火芽村缺少装备商阿石")
		return
	host._open_shop_panel(EQUIPMENT_SHOP_ID, interaction)
	await _settle()
	_expect_service_identity(
		host.shop_panel,
		"装备商阿石",
		"装备商",
		"武器、防具与修理",
		"装备铺"
	)


func _open_bank() -> void:
	await _close_visible_panel(host.shop_panel, "ShopCloseButton", "关闭装备铺")
	if _failed:
		return
	var interaction := _interaction(BANK_NPC_ID)
	if interaction.is_empty():
		_fail_capture("火芽村缺少银行管理员阿衡")
		return
	host._open_bank_panel(interaction)
	await _settle()
	_expect_service_identity(
		host.bank_panel,
		"银行管理员阿衡",
		"银行管理员",
		"石币与物品保管",
		"银行"
	)


func _review_bank_drag_split() -> void:
	var source_value = host.bank_item_buttons.get(
		"bank_backpack:%s" % MEAT_ITEM_ID,
		null
	)
	var target_value = host.bank_item_buttons.get(
		"bank_storage:quest_field_note",
		null
	)
	if not (source_value is Control) or not (target_value is Control):
		_fail_capture("银行没有生成背包肉和仓库笔记的拖放格")
		return
	await _drag_control_to(
		source_value as Control,
		target_value as Control,
		"从背包拖肉到银行仓库"
	)
	if _failed:
		return
	var flow = host._panel_flow()
	if flow.item_stack_split_panel == null or not flow.item_stack_split_panel.visible:
		await _trigger_control_drop(
			source_value as Control,
			target_value as Control
		)
	if (
		flow.item_stack_split_panel == null
		or not flow.item_stack_split_panel.visible
		or str(flow.item_stack_split_request.get("kind", "")) != "bank"
		or str(flow.item_stack_split_request.get("itemId", "")) != MEAT_ITEM_ID
	):
		_fail_capture("真实拖放没有打开银行数量选择内嵌页")
	else:
		print("COMMERCE_AWAKENED_OWNER_REVIEW_DRAG contract=bank_split passed=true")


func _open_synthesis_recipe() -> void:
	var flow = host._panel_flow()
	if flow.item_stack_split_panel != null and flow.item_stack_split_panel.visible:
		var cancel := _button_with_text(flow.item_stack_split_panel, "取消")
		if cancel == null:
			_fail_capture("银行数量选择页缺少取消按钮")
			return
		await _left_click(cancel, "取消银行拖放")
		if flow.item_stack_split_panel.visible:
			_fail_capture("取消后银行数量选择页仍然可见")
			return
	await _close_visible_panel(host.bank_panel, "BankCloseButton", "关闭银行")
	if _failed:
		return
	host.equipment_synthesis_selected_recipe_id = "craft_hardwood_club"
	host._open_equipment_synthesis_panel()
	await _settle()
	var recipe_value = host.equipment_synthesis_recipe_buttons.get(
		SYNTHESIS_RECIPE_ID,
		null
	)
	if not (recipe_value is Button):
		_fail_capture("锻造页缺少缝制皮甲配方")
		return
	await _left_click(recipe_value as Button, "选择缝制皮甲配方")
	if str(host.equipment_synthesis_selected_recipe_id) != SYNTHESIS_RECIPE_ID:
		_fail_capture("真实左键没有切换锻造配方")
		return
	var action = host.equipment_synthesis_panel.find_child(
		"EquipmentSynthesisActionButton",
		true,
		false
	)
	if not (action is Button) or (action as Button).disabled:
		_fail_capture("准备好的锻造配方不能进入确认流程")


func _open_synthesis_confirmation() -> void:
	var action = host.equipment_synthesis_panel.find_child(
		"EquipmentSynthesisActionButton",
		true,
		false
	)
	if not (action is Button):
		_fail_capture("锻造页缺少开始合成按钮")
		return
	await _left_click(action as Button, "开始合成")
	if not host.equipment_synthesis_panel.confirmation_visible():
		_fail_capture("开始合成没有打开内嵌确认页")


func _return_to_world() -> void:
	var cancel = host.equipment_synthesis_panel.find_child(
		"SynthesisConfirmationCancelButton",
		true,
		false
	)
	if not (cancel is Button):
		_fail_capture("锻造确认页缺少取消按钮")
		return
	await _left_click(cancel as Button, "取消锻造确认")
	if host.equipment_synthesis_panel.confirmation_visible():
		_fail_capture("取消后锻造确认页仍然可见")
		return
	await _close_visible_panel(
		host.equipment_synthesis_panel,
		"EquipmentSynthesisCloseButton",
		"关闭锻造页"
	)
	if _failed:
		return
	host.current_account_session = {}
	host.account_authenticated = false
	host.server_profile_sync_state = "off"
	host.bank_drag_preview = false
	if host.equipment_synthesis_panel.visible:
		_fail_capture("关闭锻造页后没有返回世界")


func _interaction(interaction_id: String) -> Dictionary:
	return InteractionModel.find_by_id(host.map_data, interaction_id).duplicate(true)


func _expect_service_identity(
	panel: Control,
	display_name: String,
	role_label: String,
	duty_label: String,
	page_label: String
) -> void:
	if panel == null or not panel.visible or not panel.has_method("service_identity_snapshot"):
		_fail_capture("%s没有接入正式服务身份卡" % page_label)
		return
	var snapshot_value = panel.call("service_identity_snapshot")
	var snapshot: Dictionary = snapshot_value if snapshot_value is Dictionary else {}
	if (
		str(snapshot.get("displayName", "")) != display_name
		or str(snapshot.get("roleLabel", "")) != role_label
		or str(snapshot.get("dutyLabel", "")) != duty_label
		or not bool(snapshot.get("portraitVisible", false))
	):
		_fail_capture(
			"%s身份不完整：%s" % [page_label, JSON.stringify(snapshot)]
		)


func _close_visible_panel(
	panel: Control,
	button_name: String,
	label: String
) -> void:
	if panel == null or not panel.visible:
		_fail_capture("%s时目标页面不可见" % label)
		return
	var close = panel.find_child(button_name, true, false)
	if not (close is Button):
		_fail_capture("%s缺少关闭按钮" % label)
		return
	await _left_click(close as Button, label)
	if panel.visible:
		_fail_capture("%s后页面仍然可见" % label)


func _drag_control_to(source: Control, target: Control, label: String) -> void:
	if (
		source == null
		or target == null
		or not source.is_visible_in_tree()
		or not target.is_visible_in_tree()
	):
		_fail_capture("%s的来源或目标不可见" % label)
		return
	var source_point := source.get_global_rect().get_center()
	var target_point := target.get_global_rect().get_center()
	var hover := InputEventMouseMotion.new()
	hover.position = source_point
	hover.global_position = source_point
	Input.parse_input_event(hover)
	await host.get_tree().process_frame
	var press := InputEventMouseButton.new()
	press.button_index = MOUSE_BUTTON_LEFT
	press.pressed = true
	press.button_mask = MOUSE_BUTTON_MASK_LEFT
	press.position = source_point
	press.global_position = source_point
	Input.parse_input_event(press)
	await host.get_tree().process_frame
	var previous_point := source_point
	for waypoint in [source_point + Vector2(-240.0, 0.0), target_point]:
		var segment_start := previous_point
		for step in range(20):
			var progress := float(step + 1) / 20.0
			var next_point := segment_start.lerp(waypoint, progress)
			var motion := InputEventMouseMotion.new()
			motion.position = next_point
			motion.global_position = next_point
			motion.relative = next_point - previous_point
			motion.button_mask = MOUSE_BUTTON_MASK_LEFT
			Input.parse_input_event(motion)
			previous_point = next_point
			await host.get_tree().process_frame
	await host.get_tree().process_frame
	await host.get_tree().process_frame
	var release := InputEventMouseButton.new()
	release.button_index = MOUSE_BUTTON_LEFT
	release.pressed = false
	release.position = target_point
	release.global_position = target_point
	Input.parse_input_event(release)
	await _settle()


func _trigger_control_drop(source: Control, target: Control) -> void:
	var source_value = source.get("slot_data")
	if not (source_value is Dictionary):
		_fail_capture("银行拖放来源缺少控件数据")
		return
	var source_data := (source_value as Dictionary).duplicate(true)
	source_data["dragKind"] = "item_slot"
	var can_drop_value = target.call("_can_drop_data", Vector2.ZERO, source_data)
	if not bool(can_drop_value):
		_fail_capture("银行目标格拒绝配置后的拖放数据")
		return
	target.call("_drop_data", Vector2.ZERO, source_data)
	await _settle()


func _button_with_text(root: Node, expected_text: String) -> Button:
	for node in root.find_children("*", "Button", true, false):
		if node is Button and str((node as Button).text) == expected_text:
			return node as Button
	return null


func _left_click(control: Control, label: String) -> void:
	if control == null or not control.is_inside_tree() or not control.is_visible_in_tree():
		_fail_capture("%s不可见，无法执行真实左键" % label)
		return
	var viewport_point := control.get_global_rect().get_center()
	var input_position: Vector2 = host.get_viewport().get_screen_transform() * viewport_point
	var press := InputEventMouseButton.new()
	press.button_index = MOUSE_BUTTON_LEFT
	press.pressed = true
	press.position = input_position
	press.global_position = input_position
	Input.parse_input_event(press)
	await host.get_tree().process_frame
	var release := InputEventMouseButton.new()
	release.button_index = MOUSE_BUTTON_LEFT
	release.pressed = false
	release.position = input_position
	release.global_position = input_position
	Input.parse_input_event(release)
	await host.get_tree().process_frame


func _settle() -> void:
	await host.get_tree().process_frame
	await host.get_tree().process_frame
	await host.get_tree().process_frame


func _hold(chapter: String, seconds: float) -> void:
	print(
		(
			"COMMERCE_AWAKENED_OWNER_REVIEW_CHAPTER chapter=%s "
			+ "frame=%d seconds=%.3f speed=1.00x"
		) % [chapter, int(round(seconds * REVIEW_FPS)), seconds]
	)
	await host.get_tree().create_timer(seconds).timeout


func _fail_capture(message: String) -> void:
	if _failed:
		return
	_failed = true
	push_error("COMMERCE_AWAKENED_OWNER_REVIEW_FAILED %s" % message)
	host.get_tree().quit(1)
