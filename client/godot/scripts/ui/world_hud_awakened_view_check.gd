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

var _errors: Array[String] = []
var _view: Control
var _legacy_controls: Dictionary = {}
var _original_entries: Dictionary = {}
var _collapsed_restore_only_verified := false


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
		"playerPortraitLoaded": _entry_has_icon("character"),
		"battlePetPortraitLoaded": _entry_has_icon("pet"),
		"collapsedRestoreOnly": _collapsed_restore_only_verified,
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
		"actionBarCollapseButton": collapse_button,
		"buttons": buttons,
	}


func _legacy_panel(host: Control, node_name: String) -> Panel:
	var panel := Panel.new()
	panel.name = node_name
	host.add_child(panel)
	return panel


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
