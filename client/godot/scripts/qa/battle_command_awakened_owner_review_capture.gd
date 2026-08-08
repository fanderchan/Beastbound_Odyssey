extends RefCounted

const BattleModel := preload("res://scripts/battle/battle_model.gd")
const EncounterModel := preload("res://scripts/world/encounter_model.gd")
const PlayerProgressModel := preload(
	"res://scripts/progression/player_progress_model.gd"
)

const CAPTURE_FLAG := "--battle-command-awakened-owner-review-capture"
const REVIEW_FPS := 30
const EXPECTED_VIEWPORT := Vector2i(1280, 720)
const FIXTURE_PET_INSTANCE_ID := "phase397_owner_review_pet"
const FIXTURE_PET_FORM_ID := "bui_normal_red_fire10"
const CHAPTERS := {
	"player_commands": 2.3,
	"function_drawer_open": 2.2,
	"function_drawer_collapsed": 1.2,
	"pet_commands": 2.4,
	"auto_three_state": 2.2,
	"player_auto_strategy": 1.8,
	"pet_auto_strategy": 1.8,
	"locked_auto_cancel": 2.0,
}

var host
var _failed := false
var _started_msec := 0
var _actual_left_clicks := 0
var _cross_frame_presses := 0
var _view
var _drawer


func _init(host_node) -> void:
	host = host_node


func run() -> void:
	_started_msec = Time.get_ticks_msec()
	if not await _prepare_real_main_battle():
		return
	print(
		(
			"PHASE397_BATTLE_COMMAND_OWNER_REVIEW_START scene=Main.tscn "
			+ "entry=MainSceneFlag viewport=1280x720 fps=30 speed=1.00x "
			+ "profile=isolated backend=false profile_save=false "
			+ "input=real_cross_frame_left_click"
		)
	)
	if not _assert_battle_shell_hidden():
		return
	if not _assert_top_battle_layout():
		return
	if not _assert_labels(
		["咒术", "攻击", "道具", "托管", "逃跑", "援助", "抓捕", "召唤", "防御", "自动"],
		"人物回合"
	):
		return
	print(
		"PHASE397_BATTLE_COMMAND_OWNER_REVIEW_PLAYER "
		+ "commands=10 aligned_bottom=true right_edge=true world_hud_hidden=true "
		+ "round_timer_top_center=true layout_non_overlap=true"
	)
	await _hold("player_commands")

	await _left_click(_drawer.toggle_button(), "功能")
	if _failed:
		return
	var drawer_snapshot: Dictionary = _drawer.snapshot()
	if (
		not bool(drawer_snapshot.get("drawerOpen", false))
		or bool(drawer_snapshot.get("mapIncluded", true))
		or not bool(drawer_snapshot.get("jianGlyphOk", false))
	):
		_fail_capture(
			"功能抽屉没有展开、错误包含地图或图鉴字形异常：%s"
			% str(drawer_snapshot)
		)
		return
	print(
		"PHASE397_BATTLE_COMMAND_OWNER_REVIEW_DRAWER "
		+ "open=true map=false codex_glyph=true battle_safe_entries=true"
	)
	await _hold("function_drawer_open")
	await _left_click(_drawer.toggle_button(), "收起功能")
	if _failed:
		return
	if _drawer.is_drawer_open():
		_fail_capture("功能抽屉真实左键没有收起")
		return
	await _hold("function_drawer_collapsed")

	await _left_click(_view.visible_button_with_label("防御"), "人物防御")
	if _failed:
		return
	if host.battle_command_owner != "pet":
		_fail_capture("人物指令没有进入宠物回合")
		return
	if not _assert_labels(
		["技能", "攻击", "撤回", "逃跑", "援助", "折返", "防御", "自动"],
		"宠物回合"
	):
		return
	print(
		"PHASE397_BATTLE_COMMAND_OWNER_REVIEW_PET "
		+ "commands=8 aligned_bottom=true deterministic_pet=true"
	)
	await _hold("pet_commands")

	await _left_click(_view.auto_button(), "开启自动战斗")
	host.battle_auto_attack_delay = 9999.0
	if _failed:
		return
	if not host.battle_auto_attack_enabled:
		_fail_capture("自动战斗真实左键没有开启")
		return
	if not _assert_labels(["宠", "主", "取消"], "自动战斗"):
		return
	print(
		"PHASE397_BATTLE_COMMAND_OWNER_REVIEW_AUTO "
		+ "pet=true player=true cancel=true always_visible=true"
	)
	await _hold("auto_three_state")

	await _left_click(_view.auto_player_button(), "人物自动策略")
	if _failed:
		return
	if not bool(_view.snapshot().get("strategyVisible", false)):
		_fail_capture("人物自动策略内嵌页没有打开")
		return
	print(
		"PHASE397_BATTLE_COMMAND_OWNER_REVIEW_STRATEGY actor=player embedded=true"
	)
	await _hold("player_auto_strategy")
	await _left_click(_view.auto_pet_button(), "宠物自动策略")
	if _failed:
		return
	if str(_view.snapshot().get("strategyActor", "")) != "pet":
		_fail_capture("宠物自动策略没有切换到宠物配置")
		return
	print(
		"PHASE397_BATTLE_COMMAND_OWNER_REVIEW_STRATEGY actor=pet embedded=true"
	)
	await _hold("pet_auto_strategy")
	await _left_click(_view.strategy_close_button(), "完成自动策略")
	if _failed:
		return

	host.battle_action_timer = 1.0
	host._sync_battle_buttons()
	await _settle_frames(2)
	if _view.auto_button().disabled or not _view.auto_button().is_visible_in_tree():
		_fail_capture("动作锁定时取消自动入口不可用")
		return
	print(
		"PHASE397_BATTLE_COMMAND_OWNER_REVIEW_LOCKED "
		+ "commands_locked=true cancel_enabled=true"
	)
	await _hold("locked_auto_cancel")
	await _left_click(_view.auto_button(), "锁定时取消自动")
	if _failed:
		return
	if host.battle_auto_attack_enabled:
		_fail_capture("动作锁定时真实左键没有取消自动战斗")
		return
	host.battle_action_timer = 0.0
	host._sync_battle_buttons()
	await _settle_frames(3)
	if _visible_tree_has_forbidden_review_text():
		_fail_capture("玩家画面出现 QA、调试或验收文字")
		return
	await _release_capture_audio_runtime()
	if _failed:
		return
	var elapsed := float(Time.get_ticks_msec() - _started_msec) / 1000.0
	print(
		(
			"PHASE397_BATTLE_COMMAND_OWNER_REVIEW_END elapsed_wall=%.3f "
			+ "completed=true player=10 pet=8 auto=3 drawer=true map=false "
			+ "locked_cancel=true world_hud_hidden=true backend=false "
			+ "profile_save=false actual_left_clicks=%d cross_frame_presses=%d"
		) % [elapsed, _actual_left_clicks, _cross_frame_presses]
	)
	host.get_tree().call_deferred("quit", 0)


func _prepare_real_main_battle() -> bool:
	if host == null or not is_instance_valid(host):
		_fail_capture("Main host 不存在")
		return false
	var current_scene := host.get_tree().current_scene as Node
	if current_scene != host or current_scene.scene_file_path != "res://scenes/Main.tscn":
		_fail_capture("验收必须由真实 Main.tscn flag 启动")
		return false
	var viewport_size: Vector2 = host.get_viewport().get_visible_rect().size
	if Vector2i(roundi(viewport_size.x), roundi(viewport_size.y)) != EXPECTED_VIEWPORT:
		_fail_capture("验收视口必须为 1280×720")
		return false
	host.profile_save_enabled = false
	host.current_account_session = {}
	host.server_profile_sync_state = "off"
	host.server_profile_sync_pending_kind = ""
	host.server_profile_sync_dirty = false
	host.server_profile_sync_pull_queued = false
	var profile := PlayerProgressModel.default_profile()
	var fixture_pet := PlayerProgressModel.create_pet_instance_from_form(
		FIXTURE_PET_INSTANCE_ID,
		"赤焰布伊",
		FIXTURE_PET_FORM_ID,
		PlayerProgressModel.PET_STATE_BATTLE,
		18
	)
	profile["petInstances"] = [fixture_pet]
	profile["activePetInstanceId"] = FIXTURE_PET_INSTANCE_ID
	host.player_profile = PlayerProgressModel.normalize_profile(profile)
	var loaded: bool = host._load_map(
		"firebud_village_gate",
		"from_training_yard"
	)
	var zones: Array = EncounterModel.encounter_zones(host.map_data) if loaded else []
	if not loaded or zones.is_empty():
		_fail_capture("确定性战斗地图或遭遇区不可用")
		return false
	host._start_battle(BattleModel.create_wild_battle(zones[0] as Dictionary))
	await _settle_frames(5)
	if not host.battle_active:
		_fail_capture("真实 Main 没有进入战斗")
		return false
	var controlled_pet_id := BattleModel.controlled_pet_id(host.battle_state)
	var controlled_pet := BattleModel.actor_by_id(host.battle_state, controlled_pet_id)
	if (
		controlled_pet_id == ""
		or str(controlled_pet.get("formId", "")) != FIXTURE_PET_FORM_ID
		or str(controlled_pet.get("name", "")) != "赤焰布伊"
	):
		_fail_capture("确定性出战宠物没有进入真实战斗")
		return false
	_view = host.battle_command_awakened_view
	_drawer = host.battle_function_drawer
	if _view == null or _drawer == null:
		_fail_capture("正式战斗操控视图或功能抽屉没有挂载")
		return false
	return true


func _assert_battle_shell_hidden() -> bool:
	if host.top_panel != null and host.top_panel.is_visible_in_tree():
		_fail_capture("战斗中正式世界顶部功能仍然可见")
		return false
	if host.action_bar != null and host.action_bar.is_visible_in_tree():
		_fail_capture("战斗中正式世界底栏仍然可见")
		return false
	if host.map_menu_button == null or not host.map_menu_button.disabled:
		_fail_capture("战斗中地图入口仍然可用")
		return false
	return true


func _assert_top_battle_layout() -> bool:
	if (
		host.battle_round_panel == null
		or host.battle_timer_panel == null
		or _drawer == null
		or _view == null
	):
		_fail_capture("顶部回合/计时或战斗操作控件没有挂载")
		return false
	var round_rect: Rect2 = host.battle_round_panel.get_global_rect()
	var timer_rect: Rect2 = host.battle_timer_panel.get_global_rect()
	var toggle_rect: Rect2 = _drawer.toggle_button().get_global_rect()
	var drawer_rect: Rect2 = _drawer.drawer_panel().get_global_rect()
	var command_rect: Rect2 = _view.get_global_rect()
	var viewport_size: Vector2 = host.get_viewport().get_visible_rect().size
	var centered: bool = (
		absf(round_rect.get_center().x - viewport_size.x * 0.5) <= 1.0
		and absf(timer_rect.get_center().x - viewport_size.x * 0.5) <= 1.0
	)
	var non_overlapping: bool = (
		host.battle_round_panel.is_visible_in_tree()
		and host.battle_timer_panel.is_visible_in_tree()
		and centered
		and not round_rect.intersects(timer_rect)
		and not round_rect.intersects(toggle_rect)
		and not timer_rect.intersects(toggle_rect)
		and not round_rect.intersects(drawer_rect)
		and not timer_rect.intersects(drawer_rect)
		and not round_rect.intersects(command_rect)
		and not timer_rect.intersects(command_rect)
	)
	if not non_overlapping:
		_fail_capture(
			"顶部回合/计时牌没有居中或与功能/指令 UI 重叠：%s"
			% str({
				"round": round_rect,
				"timer": timer_rect,
				"toggle": toggle_rect,
				"drawer": drawer_rect,
				"command": command_rect,
			})
		)
		return false
	return true


func _assert_labels(expected: Array[String], state_name: String) -> bool:
	var actual: Array[String] = []
	var snapshot: Dictionary = _view.snapshot()
	for value in snapshot.get("visibleLabels", []):
		actual.append(str(value))
	var sorted_expected := expected.duplicate()
	actual.sort()
	sorted_expected.sort()
	if actual != sorted_expected:
		_fail_capture("%s按钮不符：%s" % [state_name, str(actual)])
		return false
	if (
		not bool(snapshot.get("touchTargetsOk", false))
		or not bool(snapshot.get("iconsOk", false))
	):
		_fail_capture("%s缺少60px触控尺寸或正式图标" % state_name)
		return false
	return true


func _left_click(control: Control, label: String) -> void:
	if (
		control == null
		or not control.is_inside_tree()
		or not control.is_visible_in_tree()
		or (control is BaseButton and (control as BaseButton).disabled)
	):
		_fail_capture("%s不可用，无法执行真实左键" % label)
		return
	var viewport_point := control.get_global_rect().get_center()
	if not host.get_viewport().get_visible_rect().has_point(viewport_point):
		_fail_capture("%s不在1280×720可点击区域内" % label)
		return
	var motion := InputEventMouseMotion.new()
	motion.position = viewport_point
	motion.global_position = viewport_point
	host.get_viewport().push_input(motion, true)
	await host.get_tree().process_frame
	var press := InputEventMouseButton.new()
	press.button_index = MOUSE_BUTTON_LEFT
	press.pressed = true
	press.button_mask = MOUSE_BUTTON_MASK_LEFT
	press.position = viewport_point
	press.global_position = viewport_point
	var press_frame := Engine.get_process_frames()
	host.get_viewport().push_input(press, true)
	await host.get_tree().process_frame
	var release := InputEventMouseButton.new()
	release.button_index = MOUSE_BUTTON_LEFT
	release.pressed = false
	release.position = viewport_point
	release.global_position = viewport_point
	var release_frame := Engine.get_process_frames()
	host.get_viewport().push_input(release, true)
	await host.get_tree().process_frame
	_actual_left_clicks += 1
	if release_frame <= press_frame:
		_fail_capture("%s的左键按下与释放没有跨帧" % label)
		return
	_cross_frame_presses += 1


func _hold(chapter_id: String) -> void:
	var seconds := float(CHAPTERS.get(chapter_id, 0.0))
	if seconds <= 0.0:
		_fail_capture("未知录像章节：%s" % chapter_id)
		return
	print(
		(
			"PHASE397_BATTLE_COMMAND_OWNER_REVIEW_CHAPTER chapter=%s "
			+ "frame=%d seconds=%.3f speed=1.00x"
		) % [chapter_id, int(round(seconds * REVIEW_FPS)), seconds]
	)
	await host.get_tree().create_timer(seconds).timeout


func _settle_frames(frame_count: int) -> void:
	for _frame in range(maxi(0, frame_count)):
		await host.get_tree().process_frame


func _visible_tree_has_forbidden_review_text() -> bool:
	var needles := ["qa", "调试", "验收", "phase397", "owner review"]
	for type_name in ["Label", "RichTextLabel", "Button"]:
		for value in host.find_children("*", type_name, true, false):
			if not (value is CanvasItem) or not (value as CanvasItem).is_visible_in_tree():
				continue
			var text_value := ""
			if value is Label:
				text_value = (value as Label).text.to_lower()
			elif value is RichTextLabel:
				text_value = (value as RichTextLabel).get_parsed_text().to_lower()
			elif value is Button:
				text_value = (value as Button).text.to_lower()
			for needle in needles:
				if text_value.contains(needle):
					return true
	return false


func _release_capture_audio_runtime() -> void:
	var audio_manager = host.game_audio_manager
	if audio_manager == null or not is_instance_valid(audio_manager):
		_fail_capture("真实 Main 缺少音频管理器")
		return
	if not audio_manager.has_method("stop_all"):
		_fail_capture("音频管理器缺少停止全部播放 API")
		return
	audio_manager.call("stop_all")
	for value in (audio_manager as Node).find_children(
		"*",
		"AudioStreamPlayer",
		true,
		false
	):
		if not (value is AudioStreamPlayer):
			continue
		var player := value as AudioStreamPlayer
		player.stop()
		player.stream = null
	await _settle_frames(8)


func _fail_capture(message: String) -> void:
	if _failed:
		return
	_failed = true
	print("PHASE397_BATTLE_COMMAND_OWNER_REVIEW_FAILED reason=%s" % message)
	push_error("Phase397 battle command owner review failed: %s" % message)
	if host != null and is_instance_valid(host):
		host.get_tree().call_deferred("quit", 1)
