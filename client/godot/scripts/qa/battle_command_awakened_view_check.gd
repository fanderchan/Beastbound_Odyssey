extends RefCounted

const BattleModel := preload("res://scripts/battle/battle_model.gd")
const EncounterModel := preload("res://scripts/world/encounter_model.gd")
const AutoBattleSettingsModel := preload(
	"res://scripts/progression/auto_battle_settings_model.gd"
)
const PlayerProgressModel := preload(
	"res://scripts/progression/player_progress_model.gd"
)
const Presenter := preload("res://scripts/ui/battle_command_awakened_presenter.gd")

var host


func _init(host_node) -> void:
	host = host_node


func run() -> void:
	host.profile_save_enabled = false
	var errors: Array[String] = Presenter.selftest()
	var formal_hud = host.world_hud_awakened_view
	var formal_hud_instance_id: int = (
		formal_hud.get_instance_id()
		if formal_hud != null and is_instance_valid(formal_hud)
		else 0
	)
	var formal_hud_contract_before: Dictionary = (
		formal_hud.layout_contract()
		if formal_hud != null and formal_hud.has_method("layout_contract")
		else {}
	)
	if (
		formal_hud_instance_id == 0
		or not bool(formal_hud_contract_before.get("mounted", false))
	):
		errors.append("开战前 Phase395 正式世界 HUD 没有挂载")
	var fixture_profile := PlayerProgressModel.default_profile()
	var fixture_pet := PlayerProgressModel.create_pet_instance_from_form(
		"phase397_battle_pet",
		"验收布伊",
		"bui_normal_red_fire10",
		PlayerProgressModel.PET_STATE_BATTLE,
		18
	)
	fixture_profile["petInstances"] = [fixture_pet]
	fixture_profile["activePetInstanceId"] = "phase397_battle_pet"
	host.player_profile = PlayerProgressModel.normalize_profile(fixture_profile)
	var loaded: bool = host._load_map("firebud_village_gate", "from_training_yard")
	var zones: Array = EncounterModel.encounter_zones(host.map_data) if loaded else []
	if zones.is_empty():
		errors.append("没有可用于战斗操控验收的遭遇区")
		_finish(errors, {})
		return
	host._start_battle(BattleModel.create_wild_battle(zones[0] as Dictionary))
	await host.get_tree().process_frame
	await host.get_tree().process_frame
	var controlled_pet_id := BattleModel.controlled_pet_id(host.battle_state)
	var controlled_pet := BattleModel.actor_by_id(
		host.battle_state,
		controlled_pet_id
	)
	var controlled_pet_form_id := str(controlled_pet.get("formId", ""))
	var controlled_pet_name := str(controlled_pet.get("name", ""))
	if controlled_pet_id == "":
		errors.append("确定性出战宠物没有进入战斗状态")
	elif (
		controlled_pet_form_id != "bui_normal_red_fire10"
		or controlled_pet_name != "验收布伊"
	):
		errors.append("战斗操控验收没有使用指定的确定性出战宠物")
	var formal_hud_same_in_battle: bool = (
		formal_hud != null
		and host.world_hud_awakened_view == formal_hud
		and formal_hud.get_instance_id() == formal_hud_instance_id
	)
	var formal_hud_contract_in_battle: Dictionary = (
		formal_hud.layout_contract()
		if formal_hud_same_in_battle and formal_hud.has_method("layout_contract")
		else {}
	)
	if (
		not formal_hud_same_in_battle
		or not bool(formal_hud_contract_in_battle.get("mounted", false))
	):
		errors.append("开战后回退或替换了 Phase395 正式世界 HUD")
	for hidden_control in [host.top_panel, host.side_panel, host.action_bar]:
		if hidden_control != null and hidden_control.is_visible_in_tree():
			errors.append("战斗中正式世界 HUD 的顶部、侧栏或底栏仍然可见")
			break

	var view = host.battle_command_awakened_view
	if view == null:
		errors.append("觉醒式战斗操控视图未挂载")
		_finish(errors, {})
		return
	var top_battle_layout := _top_battle_layout_snapshot(view)
	if not bool(top_battle_layout.get("nonOverlapping", false)):
		errors.append(
			"顶部回合/计时牌与功能按钮、抽屉或指令区发生重叠：%s"
			% str(top_battle_layout)
		)
	var shortcut_contract: Dictionary = (
		host.battle_command_awakened_host.shortcut_contract_snapshot()
		if host.battle_command_awakened_host != null
		else {}
	)
	var expected_shortcut_contract := {
		"skill": "opens_existing_pet_skill_slots",
		"attack": "existing_pet_slot_with_command_attack",
		"recall": "existing_pet_help_back_to_player",
		"escape": "existing_pet_help_then_player_run",
		"assist": "unavailable_without_authoritative_assist_command",
		"return": "existing_pet_help_then_player_switch_pet",
		"defend": "existing_pet_slot_with_command_defend",
		"auto": "existing_auto_battle_state",
	}
	if shortcut_contract != expected_shortcut_contract:
		errors.append("宠物捷径没有精确复用既有指令合同")

	var hidden_ancestor := Control.new()
	hidden_ancestor.name = "Phase397HiddenAncestorFixture"
	hidden_ancestor.position = Vector2(520, 120)
	hidden_ancestor.size = Vector2(100, 100)
	var visible_child := Control.new()
	visible_child.position = Vector2.ZERO
	visible_child.size = Vector2(100, 100)
	hidden_ancestor.add_child(visible_child)
	host.hud_root.add_child(hidden_ancestor)
	host.panel_registry.add_input_blocker(visible_child)
	hidden_ancestor.visible = false
	if host.panel_registry.point_hits_visible_panel(Vector2(560, 160)):
		errors.append("隐藏祖先下的控件仍形成点击墙")
	host.panel_registry.remove_input_blocker(visible_child)
	hidden_ancestor.queue_free()

	var function_view = host.battle_function_drawer
	var function_toggle_click: Dictionary = {}
	var function_codex_click: Dictionary = {}
	var function_collapsed_snapshot: Dictionary = {}
	var function_open_snapshot: Dictionary = {}
	var function_codex_route_ok := false
	if function_view == null:
		errors.append("战斗功能抽屉未挂载")
	else:
		function_collapsed_snapshot = function_view.snapshot()
		if host.top_panel == null or host.top_panel.visible:
			errors.append("战斗中仍显示顶部世界功能或小地图")
		if bool(function_collapsed_snapshot.get("drawerOpen", false)):
			errors.append("战斗功能抽屉没有默认收起")
		if bool(function_collapsed_snapshot.get("mapIncluded", true)):
			errors.append("战斗功能抽屉错误包含地图入口")
		function_toggle_click = await _real_click(function_view.toggle_button())
		function_open_snapshot = function_view.snapshot()
		if not bool(function_open_snapshot.get("drawerOpen", false)):
			errors.append("真实点击“功能”后没有展开抽屉")
		if not bool(function_open_snapshot.get("touchTargetsOk", false)):
			errors.append("战斗功能抽屉存在小于60px的入口")
		if str(function_open_snapshot.get("codexCaption", "")) != "图鉴":
			errors.append("战斗功能抽屉的图鉴文字不正确")
		if not bool(function_open_snapshot.get("jianGlyphOk", false)):
			errors.append("战斗功能抽屉字体缺少简体“鉴”字形")
		var enabled_ids: Array = function_open_snapshot.get("enabledIds", [])
		for entry_id in ["codex", "quest", "auto"]:
			if not enabled_ids.has(entry_id):
				errors.append("战斗功能抽屉缺少可用入口：%s" % entry_id)
		var drawer_center: Vector2 = function_view.drawer_panel().get_global_rect().get_center()
		if not host._is_ui_point(drawer_center):
			errors.append("展开的功能抽屉没有阻止战场点击穿透")
		function_codex_click = await _real_click(function_view.entry_button("codex"))
		function_codex_route_ok = (
			host.codex_panel != null
			and host.codex_panel.visible
			and not function_view.visible
			and not host.battle_command_panel.visible
		)
		if not function_codex_route_ok:
			errors.append("功能抽屉的图鉴入口没有走真实内嵌页")
		host._close_codex_panel()
		await host.get_tree().process_frame
		if not function_view.visible or function_view.is_drawer_open():
			errors.append("关闭内嵌页后功能按钮没有恢复为收起态")
		if host.map_menu_button == null or not host.map_menu_button.disabled:
			errors.append("战斗中地图入口仍可用")

	var player_snapshot: Dictionary = view.snapshot()
	_expect_labels(
		errors,
		"人物回合",
		player_snapshot,
		["咒术", "攻击", "道具", "托管", "逃跑", "援助", "抓捕", "召唤", "防御", "自动"]
	)
	_expect_visual_contract(errors, "人物回合", player_snapshot)
	var player_geometry := _player_command_geometry_snapshot(view)
	if not bool(player_geometry.get("ok", false)):
		errors.append(
			"人物十指令没有严格命中Presenter缩放矩形、右/底区域或发生重叠：%s"
			% str(player_geometry)
		)
	var redundant_sync_before := int(
		player_snapshot.get("layoutApplyCount", -1)
	)
	var redundant_auto_cache_before: int = host.battle_auto_ui_cache_rebuild_count
	host._sync_battle_buttons()
	host._sync_battle_buttons()
	var redundant_sync_snapshot: Dictionary = view.snapshot()
	if (
		redundant_sync_before < 0
		or int(redundant_sync_snapshot.get("layoutApplyCount", -2))
		!= redundant_sync_before
	):
		errors.append("相同战斗状态的按钮同步仍重复重排正式指令视图")
	if int(redundant_sync_snapshot.get("medallionStyleResourceCount", 99)) > 3:
		errors.append("正式战斗指令徽章样式没有复用有限状态资源")
	if host.battle_auto_ui_cache_rebuild_count != redundant_auto_cache_before:
		errors.append("相同战斗状态的按钮同步仍重复归一化自动战斗档案")

	var auto_click: Dictionary = await _real_click(host.battle_auto_button, true)
	var auto_snapshot: Dictionary = view.snapshot()
	_expect_labels(errors, "自动战斗", auto_snapshot, ["宠", "主", "取消"])
	_expect_visual_contract(errors, "自动战斗", auto_snapshot)
	if not host.battle_auto_attack_enabled:
		errors.append("真实点击自动按钮后未开启自动战斗")

	var player_strategy_click: Dictionary = await _real_click(view.auto_player_button())
	var strategy_snapshot: Dictionary = view.snapshot()
	if not bool(strategy_snapshot.get("strategyVisible", false)):
		errors.append("真实点击“主”后没有打开人物自动策略")
	var first_option := view.strategy_first_option() as OptionButton
	if first_option == null or not first_option.is_visible_in_tree() or first_option.item_count < 2:
		errors.append("人物自动策略缺少可见可选项")
	else:
		first_option.select(1)
		first_option.item_selected.emit(1)
		await host.get_tree().process_frame
		var player_settings: Dictionary = host._battle_auto_settings()
		if str(player_settings.get(AutoBattleSettingsModel.PLAYER_FIRST_ROUND_ACTION_KEY, "")) != str(first_option.get_item_metadata(1)):
			errors.append("人物自动策略没有写回同一份权威配置")

	var pet_strategy_click: Dictionary = await _real_click(view.auto_pet_button())
	var pet_first_option := view.strategy_first_option() as OptionButton
	if pet_first_option == null or not pet_first_option.is_visible_in_tree() or pet_first_option.item_count < 2:
		errors.append("宠物自动策略缺少可见可选项")
	else:
		pet_first_option.select(1)
		pet_first_option.item_selected.emit(1)
		await host.get_tree().process_frame
		var pet_settings: Dictionary = host._battle_auto_settings()
		if int(pet_settings.get(AutoBattleSettingsModel.PET_FIRST_ROUND_SLOT_KEY, 0)) != int(pet_first_option.get_item_metadata(1)):
			errors.append("宠物自动策略没有写回同一份权威配置")

	host.battle_action_timer = 1.0
	host._sync_battle_buttons()
	var auto_visible_while_locked: bool = host.battle_command_panel.visible
	var cancel_click: Dictionary = await _real_click(host.battle_auto_button)
	var cancelled_while_locked: bool = not host.battle_auto_attack_enabled
	host.battle_action_timer = 0.0
	host._sync_battle_buttons()
	await host.get_tree().process_frame
	if not auto_visible_while_locked:
		errors.append("自动战斗执行期间没有保留宠/主/取消入口")
	if not cancelled_while_locked:
		errors.append("战斗动作锁定期间不能随时取消自动战斗")

	var restored_snapshot: Dictionary = view.snapshot()
	_expect_labels(
		errors,
		"取消自动后",
		restored_snapshot,
		["咒术", "攻击", "道具", "托管", "逃跑", "援助", "抓捕", "召唤", "防御", "自动"]
	)

	var player_to_pet_layout_before := int(
		view.snapshot().get("layoutApplyCount", -1)
	)
	var player_to_pet_auto_cache_before: int = host.battle_auto_ui_cache_rebuild_count
	var player_defend_click: Dictionary = await _real_click(
		view.visible_button_with_label("防御")
	)
	var pet_snapshot: Dictionary = view.snapshot()
	if (
		player_to_pet_layout_before < 0
		or int(pet_snapshot.get("layoutApplyCount", -2))
		- player_to_pet_layout_before != 1
	):
		errors.append("人物切换宠物回合没有保持一次正式指令重排")
	if host.battle_auto_ui_cache_rebuild_count != player_to_pet_auto_cache_before:
		errors.append("人物切换宠物回合错误重建了未变化的自动战斗档案")
	_expect_labels(
		errors,
		"宠物回合",
		pet_snapshot,
		["技能", "攻击", "撤回", "逃跑", "援助", "折返", "防御", "自动"]
	)
	_expect_visual_contract(errors, "宠物回合", pet_snapshot)
	var pet_attack_command_id: String = (
		host.battle_command_awakened_host._pet_command_id_for_action("attack")
		if host.battle_command_awakened_host != null
		else ""
	)
	var pet_defend_command_id: String = (
		host.battle_command_awakened_host._pet_command_id_for_action("defend")
		if host.battle_command_awakened_host != null
		else ""
	)
	var pet_attack_action: Dictionary = host._controlled_pet_skill_action_for_slot(
		host._pet_skill_slot_for_command(pet_attack_command_id)
	)
	var pet_defend_action: Dictionary = host._controlled_pet_skill_action_for_slot(
		host._pet_skill_slot_for_command(pet_defend_command_id)
	)
	var pet_legacy_routes_ok: bool = (
		pet_attack_command_id != ""
		and pet_defend_command_id != ""
		and str(pet_attack_action.get("command", "")) == "attack"
		and str(pet_defend_action.get("command", "")) == "defend"
		and host.has_method("_submit_server_battle_pet_command")
	)
	if not pet_legacy_routes_ok:
		errors.append("宠物攻击/防御捷径没有解析到既有技能栏与服务端提交链")
	var pet_assist_button: Button = view.synthetic_button("assist")
	if pet_assist_button == null or not pet_assist_button.disabled:
		errors.append("没有权威援助指令时，宠物援助按钮仍可提交")
	var pet_attack_click: Dictionary = await _real_click(
		view.synthetic_button("attack")
	)
	var pet_attack_route_ok: bool = (
		host.battle_command_owner == "pet"
		and host.battle_target_mode == "pet_enemy_attack"
		and host.battle_pending_pet_skill_id == str(pet_attack_action.get("id", ""))
	)
	if not pet_attack_route_ok:
		errors.append("真实点击宠物攻击没有进入既有 pet_enemy_attack 选敌流程")
	var pet_to_player_layout_before := int(
		view.snapshot().get("layoutApplyCount", -1)
	)
	var pet_to_player_auto_cache_before: int = host.battle_auto_ui_cache_rebuild_count
	var pet_recall_click: Dictionary = await _real_click(
		view.synthetic_button("recall")
	)
	var pet_recall_snapshot: Dictionary = view.snapshot()
	if (
		pet_to_player_layout_before < 0
		or int(pet_recall_snapshot.get("layoutApplyCount", -2))
		- pet_to_player_layout_before != 1
	):
		errors.append("宠物撤回人物回合没有保持一次正式指令重排")
	if host.battle_auto_ui_cache_rebuild_count != pet_to_player_auto_cache_before:
		errors.append("宠物撤回人物回合错误重建了未变化的自动战斗档案")
	var pet_recall_route_ok: bool = (
		host.battle_command_owner == "player"
		and host.battle_pending_pet_skill_id == ""
		and host.battle_target_mode == "enemy"
	)
	if not pet_recall_route_ok:
		errors.append("真实点击宠物撤回没有返回既有人物指令状态")
	var second_player_defend_click: Dictionary = await _real_click(
		view.visible_button_with_label("防御")
	)
	if host.battle_command_owner != "pet":
		errors.append("撤回后再次人物防御没有恢复宠物指令状态")
	var pet_skill_click: Dictionary = await _real_click(view.pet_skill_button())
	var skill_snapshot: Dictionary = view.snapshot()
	if not bool(skill_snapshot.get("petSkillMenuOpen", false)):
		errors.append("真实点击宠物技能后没有打开技能内嵌页")

	var active_point: Vector2 = view.pet_skill_button().get_global_rect().get_center()
	var gap_point: Vector2 = view.global_position + Vector2(18, 18)
	if not host._is_ui_point(active_point):
		errors.append("战斗指令按钮没有阻止战场点击穿透")
	if host._is_ui_point(gap_point):
		errors.append("透明指令区空白错误阻挡战场目标选择")
	if not host._battle_point_overlaps_panel(active_point):
		errors.append("真实战斗命中路径没有拦截战斗指令按钮")
	if host._battle_point_overlaps_panel(gap_point):
		errors.append("真实战斗命中路径把透明指令区空白变成点击墙")
	if (
		host.action_bar != null
		and host.action_bar.visible
		and view.active_controls_overlap_rect(host.action_bar.get_global_rect())
	):
		errors.append("世界工具栏仍与右下战斗指令区重叠")

	for click_report in [
		function_toggle_click,
		function_codex_click,
		auto_click,
		player_strategy_click,
		pet_strategy_click,
		cancel_click,
		player_defend_click,
		pet_attack_click,
		pet_recall_click,
		second_player_defend_click,
		pet_skill_click,
	]:
		if not bool((click_report as Dictionary).get("frameSeparated", false)):
			errors.append("真实鼠标按下/抬起没有跨帧送达")

	host._end_battle(true)
	await host.get_tree().process_frame
	await host.get_tree().process_frame
	var formal_hud_same_after_battle: bool = (
		formal_hud != null
		and host.world_hud_awakened_view == formal_hud
		and formal_hud.get_instance_id() == formal_hud_instance_id
	)
	var formal_hud_contract_after: Dictionary = (
		formal_hud.layout_contract()
		if formal_hud_same_after_battle and formal_hud.has_method("layout_contract")
		else {}
	)
	var formal_hud_restored: bool = (
		formal_hud_same_after_battle
		and bool(formal_hud_contract_after.get("mounted", false))
		and host.top_panel != null
		and host.top_panel.is_visible_in_tree()
		and host.action_bar != null
		and host.action_bar.is_visible_in_tree()
	)
	if not formal_hud_restored:
		errors.append("战斗结束后同一正式世界 HUD 没有恢复顶部和底栏")

	_finish(errors, {
		"player": player_snapshot,
		"playerGeometry": player_geometry,
		"auto": auto_snapshot,
		"strategy": strategy_snapshot,
		"pet": pet_snapshot,
		"skill": skill_snapshot,
		"functionCollapsed": function_collapsed_snapshot,
		"functionOpen": function_open_snapshot,
		"functionCodexRouteOk": function_codex_route_ok,
		"autoVisibleWhileLocked": auto_visible_while_locked,
		"cancelledWhileLocked": cancelled_while_locked,
		"controlledPetId": controlled_pet_id,
		"controlledPetFormId": controlled_pet_form_id,
		"controlledPetName": controlled_pet_name,
		"petShortcutContract": shortcut_contract,
		"petLegacyRoutes": {
			"attackCommandId": pet_attack_command_id,
			"attackActionCommand": str(pet_attack_action.get("command", "")),
			"defendCommandId": pet_defend_command_id,
			"defendActionCommand": str(pet_defend_action.get("command", "")),
			"serverSubmitMethod": host.has_method("_submit_server_battle_pet_command"),
			"attackRealClick": pet_attack_route_ok,
			"recallRealClick": pet_recall_route_ok,
			"assistDisabled": pet_assist_button != null and pet_assist_button.disabled,
		},
		"formalHudMountedBefore": bool(formal_hud_contract_before.get("mounted", false)),
		"formalHudSameIdentityInBattle": formal_hud_same_in_battle,
		"formalHudMountedInBattle": bool(formal_hud_contract_in_battle.get("mounted", false)),
		"formalHudSameIdentityAfterBattle": formal_hud_same_after_battle,
		"formalHudRestoredAfterBattle": formal_hud_restored,
		"topBattleLayout": top_battle_layout,
		"clickDelivery": "Viewport.push_input",
	})


func _player_command_geometry_snapshot(view: Control) -> Dictionary:
	var command_buttons_value = (view as Object).call("command_buttons")
	var host_buttons_value = host.battle_command_buttons
	if not (command_buttons_value is Dictionary) or not (host_buttons_value is Dictionary):
		return {
			"ok": false,
			"reason": "authoritative_command_buttons_missing",
			"visibleCount": 0,
			"identityCount": 0,
			"authoritativeLegacyCount": 0,
			"authoritativeLegacyExact": false,
			"legacyIdentityMismatches": [],
			"positionExact": false,
			"sizeExact": false,
			"rectExact": false,
			"inRightOrBottom": false,
			"nonOverlapping": false,
			"rects": {},
			"expectedRects": {},
		}
	var controls := (command_buttons_value as Dictionary).duplicate()
	var host_buttons := host_buttons_value as Dictionary
	var legacy_ids := [
		"spirit", "attack", "item", "run", "help", "capture", "switch_pet", "defend",
	]
	controls["managed"] = (view as Object).call("synthetic_button", "managed")
	controls["auto"] = (view as Object).call("synthetic_button", "auto")
	var right_local := Presenter.scaled_rect(
		Presenter.RIGHT_COLUMN_REGION,
		view.size
	)
	var bottom_local := Presenter.scaled_rect(
		Presenter.BOTTOM_ROW_REGION,
		view.size
	)
	var right_global := Rect2(
		view.global_position + right_local.position,
		right_local.size
	)
	var bottom_global := Rect2(
		view.global_position + bottom_local.position,
		bottom_local.size
	)
	var visible_count := 0
	var seen_instance_ids := {}
	var missing_ids: Array[String] = []
	var duplicate_ids: Array[String] = []
	var legacy_identity_mismatches: Array[String] = []
	var authoritative_legacy_count := 0
	var rects := {}
	var expected_rects := {}
	var occupied_rects: Array[Rect2] = []
	var position_exact := true
	var size_exact := true
	var in_right_or_bottom := true
	var non_overlapping := true
	for command_id in Presenter.PLAYER_LAYOUT.keys():
		var control = controls.get(command_id, null)
		if not (control is Control) or not (control as Control).is_visible_in_tree():
			missing_ids.append(str(command_id))
			continue
		var button := control as Control
		visible_count += 1
		var instance_id := button.get_instance_id()
		if seen_instance_ids.has(instance_id):
			duplicate_ids.append(str(command_id))
		else:
			seen_instance_ids[instance_id] = true
		if legacy_ids.has(command_id):
			var host_control = host_buttons.get(command_id, null)
			if (
				not (host_control is Control)
				or (host_control as Control).get_instance_id() != instance_id
			):
				legacy_identity_mismatches.append(str(command_id))
			else:
				authoritative_legacy_count += 1
		var actual_rect := button.get_global_rect()
		var expected_local := Presenter.scaled_rect(
			Presenter.PLAYER_LAYOUT.get(command_id, Rect2()) as Rect2,
			view.size
		)
		var expected_global := Rect2(
			view.global_position + expected_local.position,
			expected_local.size
		)
		if not actual_rect.position.is_equal_approx(expected_global.position):
			position_exact = false
		if (
			not expected_local.size.is_equal_approx(Presenter.TOUCH_SIZE)
			or not actual_rect.size.is_equal_approx(expected_global.size)
		):
			size_exact = false
		if not right_global.encloses(actual_rect) and not bottom_global.encloses(actual_rect):
			in_right_or_bottom = false
		for previous_rect in occupied_rects:
			if previous_rect.intersects(actual_rect):
				non_overlapping = false
		occupied_rects.append(actual_rect)
		rects[str(command_id)] = [
			actual_rect.position.x,
			actual_rect.position.y,
			actual_rect.size.x,
			actual_rect.size.y,
		]
		expected_rects[str(command_id)] = [
			expected_global.position.x,
			expected_global.position.y,
			expected_global.size.x,
			expected_global.size.y,
		]
	var ok := (
		visible_count == 10
		and seen_instance_ids.size() == 10
		and authoritative_legacy_count == 8
		and missing_ids.is_empty()
		and duplicate_ids.is_empty()
		and legacy_identity_mismatches.is_empty()
		and position_exact
		and size_exact
		and in_right_or_bottom
		and non_overlapping
	)
	return {
		"ok": ok,
		"visibleCount": visible_count,
		"identityCount": seen_instance_ids.size(),
		"authoritativeLegacyCount": authoritative_legacy_count,
		"authoritativeLegacyExact": (
			authoritative_legacy_count == 8
			and legacy_identity_mismatches.is_empty()
		),
		"legacyIdentityMismatches": legacy_identity_mismatches,
		"missingIds": missing_ids,
		"duplicateIds": duplicate_ids,
		"positionExact": position_exact,
		"sizeExact": size_exact,
		"rectExact": position_exact and size_exact,
		"inRightOrBottom": in_right_or_bottom,
		"nonOverlapping": non_overlapping,
		"rightRegion": [
			right_global.position.x,
			right_global.position.y,
			right_global.size.x,
			right_global.size.y,
		],
		"bottomRegion": [
			bottom_global.position.x,
			bottom_global.position.y,
			bottom_global.size.x,
			bottom_global.size.y,
		],
		"rects": rects,
		"expectedRects": expected_rects,
	}


func _top_battle_layout_snapshot(view: Control) -> Dictionary:
	var round_rect: Rect2 = (
		host.battle_round_panel.get_global_rect()
		if host.battle_round_panel != null
		else Rect2()
	)
	var timer_rect: Rect2 = (
		host.battle_timer_panel.get_global_rect()
		if host.battle_timer_panel != null
		else Rect2()
	)
	var toggle_rect: Rect2 = (
		host.battle_function_drawer.toggle_button().get_global_rect()
		if host.battle_function_drawer != null
		else Rect2()
	)
	var drawer_rect: Rect2 = (
		host.battle_function_drawer.drawer_panel().get_global_rect()
		if host.battle_function_drawer != null
		else Rect2()
	)
	var command_rect := view.get_global_rect()
	var visible_and_sized: bool = (
		host.battle_round_panel != null
		and host.battle_round_panel.is_visible_in_tree()
		and host.battle_timer_panel != null
		and host.battle_timer_panel.is_visible_in_tree()
		and round_rect.size.x > 0.0
		and timer_rect.size.x > 0.0
	)
	var non_overlapping: bool = (
		visible_and_sized
		and not round_rect.intersects(timer_rect)
		and not round_rect.intersects(toggle_rect)
		and not timer_rect.intersects(toggle_rect)
		and not round_rect.intersects(drawer_rect)
		and not timer_rect.intersects(drawer_rect)
		and not round_rect.intersects(command_rect)
		and not timer_rect.intersects(command_rect)
	)
	return {
		"nonOverlapping": non_overlapping,
		"roundRect": round_rect,
		"timerRect": timer_rect,
		"functionToggleRect": toggle_rect,
		"functionDrawerRect": drawer_rect,
		"commandRect": command_rect,
	}


func _expect_labels(
	errors: Array[String],
	state_name: String,
	snapshot: Dictionary,
	expected: Array[String]
) -> void:
	var actual: Array[String] = []
	for value in snapshot.get("visibleLabels", []):
		actual.append(str(value))
	actual.sort()
	var sorted_expected := expected.duplicate()
	sorted_expected.sort()
	if actual != sorted_expected:
		errors.append("%s按钮种类不符：%s" % [state_name, str(actual)])


func _expect_visual_contract(
	errors: Array[String],
	state_name: String,
	snapshot: Dictionary
) -> void:
	if not bool(snapshot.get("touchTargetsOk", false)):
		errors.append("%s存在小于60px的触控目标" % state_name)
	if not bool(snapshot.get("iconsOk", false)):
		errors.append("%s存在缺失的正式位图图标" % state_name)


func _real_click(button: Button, stabilize_auto: bool = false) -> Dictionary:
	if button == null or not button.is_visible_in_tree():
		return {"frameSeparated": false, "reason": "button_hidden"}
	var point := button.get_global_rect().get_center()
	var motion := InputEventMouseMotion.new()
	motion.position = point
	motion.global_position = point
	host.get_viewport().push_input(motion, true)
	await host.get_tree().process_frame

	var press := InputEventMouseButton.new()
	press.button_index = MOUSE_BUTTON_LEFT
	press.pressed = true
	press.position = point
	press.global_position = point
	var press_frame := Engine.get_process_frames()
	host.get_viewport().push_input(press, true)
	await host.get_tree().process_frame

	var release := InputEventMouseButton.new()
	release.button_index = MOUSE_BUTTON_LEFT
	release.pressed = false
	release.position = point
	release.global_position = point
	var release_frame := Engine.get_process_frames()
	host.get_viewport().push_input(release, true)
	if stabilize_auto:
		host.battle_auto_attack_delay = 9999.0
	await host.get_tree().process_frame
	return {
		"frameSeparated": release_frame > press_frame,
		"pressFrame": press_frame,
		"releaseFrame": release_frame,
		"screenPoint": [point.x, point.y],
	}


func _finish(errors: Array[String], evidence: Dictionary) -> void:
	var report := {
		"status": "ok" if errors.is_empty() else "failed",
		"errors": errors,
		"evidence": evidence,
	}
	print("battle command awakened ui check: %s" % JSON.stringify(report))
	host.get_tree().quit(0 if errors.is_empty() else 1)
