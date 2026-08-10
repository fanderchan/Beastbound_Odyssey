extends SceneTree

const BankAwakenedPanel := preload("res://scripts/ui/bank_awakened_panel.gd")
const EquipmentSynthesisAwakenedPanel := preload(
	"res://scripts/ui/equipment_synthesis_awakened_panel.gd"
)
const EquipmentSynthesisAwakenedPresenter := preload(
	"res://scripts/ui/equipment_synthesis_awakened_presenter.gd"
)
const EquipmentSynthesisModel := preload(
	"res://scripts/progression/equipment_synthesis_model.gd"
)
const PlayerProgressModel := preload("res://scripts/progression/player_progress_model.gd")
const BackpackModel := preload("res://scripts/progression/backpack_model.gd")
const ShopCatalogModel := preload("res://scripts/progression/shop_catalog_model.gd")
const ShopAwakenedPanel := preload("res://scripts/ui/shop_awakened_panel.gd")
const CommerceServiceIdentityPresenter := preload(
	"res://scripts/ui/commerce_service_identity_presenter.gd"
)
const NpcArtCatalog := preload("res://scripts/world/npc_art_catalog.gd")

const VIEWPORT_SIZE := Vector2i(1280, 720)
const RECIPE_ID := "craft_hardwood_club"
const SHOP_ITEM_ID := "item_meat_small"

var _errors: Array[String] = []
var _capture_dir := ""
var _shop_mode_events: Array[String] = []
var _bank_deposit_count := 0
var _synthesis_count := 0


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	_capture_dir = _capture_directory_argument()
	root.size = VIEWPORT_SIZE
	root.content_scale_size = VIEWPORT_SIZE
	root.content_scale_mode = Window.CONTENT_SCALE_MODE_CANVAS_ITEMS
	_expect(NpcArtCatalog.initialize(), "NPC正式外观目录初始化失败")
	await _check_shop()
	await _check_bank()
	await _check_synthesis()
	var report := {
		"schemaVersion": 1,
		"reportType": "beastbound.commerce_awakened_panel_check",
		"result": "PASS" if _errors.is_empty() else "FAIL",
		"viewport": {"width": VIEWPORT_SIZE.x, "height": VIEWPORT_SIZE.y},
		"shopModeEvents": _shop_mode_events,
		"bankDepositCount": _bank_deposit_count,
		"synthesisCount": _synthesis_count,
		"captureDirectory": _capture_dir,
		"errors": _errors,
	}
	print("commerce awakened panel check: %s" % JSON.stringify(report))
	quit(0 if _errors.is_empty() else 1)


func _check_shop() -> void:
	var panel := ShopAwakenedPanel.new()
	panel.position = Vector2.ZERO
	panel.size = Vector2(VIEWPORT_SIZE)
	panel.mode_requested.connect(func(mode: String) -> void:
		_shop_mode_events.append(mode)
		panel.apply_selection(SHOP_ITEM_ID, mode)
	)
	root.add_child(panel)
	var shop_identity := CommerceServiceIdentityPresenter.shop_identity(
		"firebud_item_shop",
		{
			"interactionPoints": [{
				"id": "firebud_shopkeeper",
				"name": "杂货商阿芸",
				"roleLabel": "杂货商",
				"appearanceId": "npc_item_shopkeeper_f_v1",
				"shopId": "firebud_item_shop",
			}]
		}
	)
	var shop_appearance_id := str(shop_identity.get("appearanceId", ""))
	_expect(
		NpcArtCatalog.warm_appearance(shop_appearance_id),
		"杂货商正式人像没有通过目录加载"
	)
	panel.apply_service_identity(
		shop_identity,
		NpcArtCatalog.portrait_texture(
			shop_appearance_id,
			str(shop_identity.get("portraitState", "neutral"))
		)
	)
	var item_button := Button.new()
	item_button.text = "肉\n8石币    持有 0"
	panel.list_container.add_child(item_button)
	panel.decorate_item_buttons({SHOP_ITEM_ID: item_button}, SHOP_ITEM_ID)
	panel.apply_selection(SHOP_ITEM_ID, "buy")
	await _settle()
	_expect(panel.is_awakened_shop_panel(), "商店未启用觉醒全屏视图")
	_expect(_within_viewport(panel), "商店超出1280×720画布")
	_expect(item_button.icon != null, "商店商品未使用正式物品图标")
	var shop_identity_state := panel.service_identity_snapshot()
	_expect(
		str(shop_identity_state.get("displayName", "")) == "杂货商阿芸"
			and str(shop_identity_state.get("roleLabel", "")) == "杂货商"
			and str(shop_identity_state.get("dutyLabel", ""))
				== "药品、捕捉工具与杂货"
			and bool(shop_identity_state.get("portraitVisible", false)),
		"商店没有显示地图实例对应的正式商人身份"
	)
	var shop_portrait := panel.find_child("ShopMerchantPortrait", true, false) as Control
	_expect(shop_portrait != null and _within_viewport(shop_portrait), "商人身份卡超出1280×720画布")
	var preferred_shop_identity := CommerceServiceIdentityPresenter.shop_identity(
		"firebud_item_shop",
		{
			"interactionPoints": [{
				"id": "map_shopkeeper",
				"name": "地图商人",
				"shopId": "firebud_item_shop",
			}]
		},
		{
			"id": "dialog_shopkeeper",
			"name": "对话商人",
			"shopId": "firebud_item_shop",
		}
	)
	_expect(
		str(preferred_shop_identity.get("npcId", "")) == "dialog_shopkeeper",
		"商店没有优先保留实际对话NPC上下文"
	)
	var manor_identity := CommerceServiceIdentityPresenter.shop_identity(
		"manor_firebud_shop",
		{}
	)
	_expect(
		str(manor_identity.get("displayName", ""))
			== ShopCatalogModel.label_for("manor_firebud_shop")
			and str(manor_identity.get("appearanceId", ""))
				== "npc_item_shopkeeper_f_v1",
		"无具名柜员的庄园商店没有使用职业型安全回退"
	)
	await _real_left_click(panel.sell_button)
	_expect(_shop_mode_events == ["sell"], "商店真实左键没有切到出售")
	panel.clear_service_identity()
	_expect(
		not bool(panel.service_identity_snapshot().get("portraitVisible", true)),
		"商店身份清理后仍残留上一位商人的头像"
	)
	panel.queue_free()
	await process_frame


func _check_bank() -> void:
	var panel := BankAwakenedPanel.new()
	panel.position = Vector2.ZERO
	panel.size = Vector2(VIEWPORT_SIZE)
	panel.deposit_requested.connect(func() -> void:
		_bank_deposit_count += 1
	)
	root.add_child(panel)
	var bank_identity := CommerceServiceIdentityPresenter.bank_identity({
		"interactionPoints": [{
			"id": "firebud_bank_keeper",
			"name": "银行管理员阿衡",
			"roleLabel": "银行管理员",
			"appearanceId": "npc_bank_keeper_f_v1",
			"facilityType": "bank",
		}]
	})
	var bank_appearance_id := str(bank_identity.get("appearanceId", ""))
	_expect(
		NpcArtCatalog.warm_appearance(bank_appearance_id),
		"银行管理员正式人像没有通过目录加载"
	)
	panel.apply_service_identity(
		bank_identity,
		NpcArtCatalog.portrait_texture(
			bank_appearance_id,
			str(bank_identity.get("portraitState", "neutral"))
		)
	)
	panel.apply_selection(SHOP_ITEM_ID)
	panel.deposit_button.disabled = false
	await _settle()
	_expect(panel.is_awakened_bank_panel(), "银行未启用觉醒全屏视图")
	_expect(_within_viewport(panel), "银行超出1280×720画布")
	_expect(panel.http_request != null, "银行没有保留权威请求节点")
	var bank_identity_state := panel.service_identity_snapshot()
	_expect(
		str(bank_identity_state.get("displayName", "")) == "银行管理员阿衡"
			and str(bank_identity_state.get("roleLabel", "")) == "银行管理员"
			and str(bank_identity_state.get("dutyLabel", "")) == "石币与物品保管"
			and bool(bank_identity_state.get("portraitVisible", false)),
		"银行没有显示地图实例对应的正式管理员身份"
	)
	var bank_portrait := panel.find_child("BankerPortrait", true, false) as Control
	_expect(bank_portrait != null and _within_viewport(bank_portrait), "银行管理员身份卡超出1280×720画布")
	var fallback_bank_identity := CommerceServiceIdentityPresenter.bank_identity({})
	_expect(
		str(fallback_bank_identity.get("displayName", "")) == "银行服务"
			and str(fallback_bank_identity.get("appearanceId", "")) == "",
		"无实际银行NPC时错误冒充了具名管理员"
	)
	await _real_left_click(panel.deposit_button)
	_expect(_bank_deposit_count == 1, "银行真实左键没有发出存入事件")
	panel.clear_service_identity()
	_expect(
		not bool(panel.service_identity_snapshot().get("portraitVisible", true)),
		"银行身份清理后仍残留上一位管理员头像"
	)
	panel.queue_free()
	await process_frame


func _check_synthesis() -> void:
	var panel := EquipmentSynthesisAwakenedPanel.new()
	panel.position = Vector2.ZERO
	panel.size = Vector2(VIEWPORT_SIZE)
	panel.synthesis_confirmed.connect(func() -> void:
		_synthesis_count += 1
	)
	root.add_child(panel)
	var profile := PlayerProgressModel.default_profile()
	var slots := BackpackModel.set_item_count(
		PlayerProgressModel.backpack_slots(profile),
		"equip_frag_wood_basic",
		3
	)
	profile = PlayerProgressModel.with_backpack_slots(profile, slots)
	profile = PlayerProgressModel.with_stone_coins(profile, 80)
	var state := EquipmentSynthesisAwakenedPresenter.build_view_state(profile, RECIPE_ID)
	panel.apply_view_state(state)
	var recipe := EquipmentSynthesisModel.recipe_for_id(RECIPE_ID)
	var recipe_button := Button.new()
	recipe_button.text = "硬木棒\n初级木质碎片 x3"
	recipe_button.set_meta("output_item_id", EquipmentSynthesisModel.output_item_id(recipe))
	panel.list_container.add_child(recipe_button)
	panel.decorate_recipe_buttons({RECIPE_ID: recipe_button}, RECIPE_ID)
	panel.detail_label.text = "[color=#d7c36a]成品详情[/color]\n右手武器 · 攻击 +8 · 耐久 60"
	panel.action_button.disabled = false
	await _settle()
	_expect(
		panel.is_awakened_equipment_synthesis_panel(),
		"装备合成未启用觉醒全屏视图"
	)
	_expect(_within_viewport(panel), "装备合成超出1280×720画布")
	_expect(bool(state.get("canSynthesize", false)), "合成夹具没有通过真实资格校验")
	_expect(_find_text(panel, "宝石") == null, "合成页伪造了未实现的宝石系统")
	_expect(_find_text(panel, "宠技") == null, "合成页伪造了未实现的宠技系统")
	await _capture("equipment-synthesis-ready-1280x720.png")
	await _real_left_click(panel.action_button)
	_expect(panel.confirmation_visible(), "开始合成没有打开内嵌确认页")
	_expect(_synthesis_count == 0, "预览阶段已经错误提交合成")
	await _capture("equipment-synthesis-confirm-1280x720.png")
	var confirm := panel.find_child(
		"SynthesisConfirmationConfirmButton", true, false
	) as Button
	_expect(confirm != null, "合成确认页缺少确认按钮")
	if confirm != null:
		await _real_left_click(confirm)
	_expect(not panel.confirmation_visible(), "确认后没有关闭内嵌确认页")
	_expect(_synthesis_count == 1, "确认后没有且仅有一次合成事件")
	panel.queue_free()
	await process_frame


func _real_left_click(control: Control) -> void:
	var click_position := control.get_global_rect().get_center()
	var motion := InputEventMouseMotion.new()
	motion.position = click_position
	motion.global_position = click_position
	root.push_input(motion, true)
	await process_frame
	var press := InputEventMouseButton.new()
	press.button_index = MOUSE_BUTTON_LEFT
	press.position = click_position
	press.global_position = click_position
	press.pressed = true
	root.push_input(press, true)
	await process_frame
	var release := InputEventMouseButton.new()
	release.button_index = MOUSE_BUTTON_LEFT
	release.position = click_position
	release.global_position = click_position
	release.pressed = false
	root.push_input(release, true)
	await process_frame


func _capture(file_name: String) -> void:
	if _capture_dir == "":
		return
	await _settle()
	RenderingServer.force_draw(true)
	await process_frame
	var error := DirAccess.make_dir_recursive_absolute(_capture_dir)
	if error != OK and error != ERR_ALREADY_EXISTS:
		_errors.append("无法创建截图目录：%s" % _capture_dir)
		return
	var image := root.get_texture().get_image()
	if image == null or image.is_empty():
		_errors.append("截图画面为空：%s" % file_name)
		return
	if image.save_png(_capture_dir.path_join(file_name)) != OK:
		_errors.append("无法保存截图：%s" % file_name)


func _capture_directory_argument() -> String:
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--capture-dir="):
			return arg.trim_prefix("--capture-dir=").strip_edges()
	return ""


func _settle() -> void:
	await process_frame
	await process_frame
	await process_frame


func _within_viewport(control: Control) -> bool:
	var rect := control.get_global_rect()
	return rect.position.x >= -0.5 and rect.position.y >= -0.5 \
		and rect.end.x <= float(VIEWPORT_SIZE.x) + 0.5 \
		and rect.end.y <= float(VIEWPORT_SIZE.y) + 0.5


func _find_text(node: Node, text_fragment: String) -> Control:
	if node is Label and text_fragment in (node as Label).text:
		return node as Control
	if node is Button and text_fragment in (node as Button).text:
		return node as Control
	for child in node.get_children():
		var found := _find_text(child, text_fragment)
		if found != null:
			return found
	return null


func _expect(condition: bool, message: String) -> void:
	if not condition:
		_errors.append(message)
