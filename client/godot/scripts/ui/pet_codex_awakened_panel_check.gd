extends SceneTree

const PetCodexAwakenedPanel := preload(
	"res://scripts/ui/pet_codex_awakened_panel.gd"
)
const PetCodexPresenter := preload(
	"res://scripts/ui/pet_codex_presenter.gd"
)
const PetCodexAcquisitionRouteCatalog := preload(
	"res://scripts/ui/pet_codex_acquisition_route_catalog.gd"
)
const PetPortraitArtCatalog := preload(
	"res://scripts/ui/pet_portrait_art_catalog.gd"
)
const PlayerProgressModel := preload(
	"res://scripts/progression/player_progress_model.gd"
)

const VIEWPORT_SIZE := Vector2i(1280, 720)
const SEEN_FORM_ID := "wuli_normal_fast_wind10"
const PORTRAIT_FORM_ID := "bui_novice_sprout_earth5_wind5"
const PANEL_SCRIPT_PATH := "res://scripts/ui/pet_codex_awakened_panel.gd"
const SKIN_SCRIPT_PATH := "res://scripts/ui/pet_codex_visual_skin.gd"

var _errors: Array[String] = []
var _detail_tab_events: Array[String] = []
var _family_events: Array[String] = []
var _form_events: Array[String] = []
var _close_count := 0
var _route_cache_report: Dictionary = {}
var _open_projection_usec := 0


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	root.size = VIEWPORT_SIZE
	root.content_scale_size = VIEWPORT_SIZE
	root.content_scale_mode = Window.CONTENT_SCALE_MODE_CANVAS_ITEMS

	PetCodexAcquisitionRouteCatalog.clear_cache_for_qa()
	var static_catalog := PetCodexPresenter.prepare_static_catalog()
	_expect(
		int(static_catalog.get("templateCount", 0)) > 0
			and bool(static_catalog.get("presentationsPrepared", false)),
		"图鉴静态形态目录没有在交互前准备"
	)
	var prepared := PetCodexPresenter.prepare_acquisition_routes()
	_expect(
		bool(prepared.get("prepared", false))
			and int(prepared.get("prepareCount", 0)) == 1
			and int(prepared.get("mapSourceLoadCount", -1))
				== int(prepared.get("knownMapCount", -2))
			and int(prepared.get("evolutionSourceLoadCount", -1)) == 1,
		"获取途径权威索引没有一次性读取全部地图与进化源"
	)
	var profile := PlayerProgressModel.default_profile()
	profile = PlayerProgressModel.record_codex_seen(profile, SEEN_FORM_ID)
	var open_projection_started_usec := Time.get_ticks_usec()
	var state := PetCodexPresenter.build_view_state(profile, SEEN_FORM_ID)
	_open_projection_usec = Time.get_ticks_usec() - open_projection_started_usec
	var panel := PetCodexAwakenedPanel.new()
	panel.name = "PetCodexAwakenedPanelCheckSubject"
	panel.position = Vector2.ZERO
	panel.size = Vector2(VIEWPORT_SIZE)
	panel.detail_tab_selected.connect(func(tab_id: String) -> void:
		_detail_tab_events.append(tab_id)
	)
	panel.family_selected.connect(func(line_id: String) -> void:
		_family_events.append(line_id)
	)
	panel.form_selected.connect(func(form_id: String) -> void:
		_form_events.append(form_id)
	)
	panel.close_requested.connect(func() -> void: _close_count += 1)
	root.add_child(panel)
	panel.apply_view_state(state)
	await process_frame
	await process_frame

	_append_dependency_errors()
	_append_layout_errors(panel, state)
	await _append_hidden_identity_errors(panel, state)
	await _check_pending_portrait_blocked(panel)
	panel.apply_view_state(state)
	await process_frame
	await process_frame
	_expect(
		_find_label_with_text(panel, "成长倾向") != null
			and _find_label_with_text(panel, "总成长") == null,
		"成长倾向被误标为已公开总成长"
	)
	_append_route_cache_stress_errors(panel, state)

	await _real_left_click(panel.attribute_tab_button)
	_expect(
		panel.active_detail_tab() == PetCodexAwakenedPanel.TAB_ATTRIBUTES,
		"属性页签真实左键后没有切换"
	)
	await _real_left_click(panel.growth_tab_button)
	_expect(
		panel.active_detail_tab() == PetCodexAwakenedPanel.TAB_GROWTH,
		"成长页签真实左键后没有切回"
	)
	_expect(
		_detail_tab_events == [
			PetCodexAwakenedPanel.TAB_ATTRIBUTES,
			PetCodexAwakenedPanel.TAB_GROWTH,
		],
		"详情页签事件不完整：%s" % str(_detail_tab_events)
	)

	await _real_left_click(panel.acquisition_button)
	_expect(panel.acquisition_is_visible(), "获取途径按钮没有打开内嵌页")
	_expect(panel.route_card_count() > 0, "已遇见宠物没有权威获取途径")
	var acquisition_title := panel.find_child(
		"AcquisitionTitle",
		true,
		false
	) as Label
	_expect(
		acquisition_title != null and acquisition_title.text == "获取途径",
		"获取途径内嵌页标题不正确"
	)
	_expect(
		_close_vec(panel.acquisition_overlay.size, Vector2(VIEWPORT_SIZE)),
		"获取途径没有覆盖整页形成模态阻断"
	)
	var acquisition_sheet := panel.find_child(
		"AcquisitionSheet",
		true,
		false
	) as PanelContainer
	_expect(
		acquisition_sheet != null
			and _close_vec(acquisition_sheet.position, Vector2(418.0, 148.0))
			and _close_vec(acquisition_sheet.size, Vector2(365.0, 402.0)),
		"获取途径纸张被容器错误拉伸或偏移"
	)
	var family_button := _first_button(panel.visible_family_buttons())
	var form_button := _first_button(panel.visible_form_buttons())
	var family_event_count_before := _family_events.size()
	var form_event_count_before := _form_events.size()
	var tab_event_count_before := _detail_tab_events.size()
	await _real_left_click(family_button)
	await _real_left_click(form_button)
	await _real_left_click(panel.attribute_tab_button)
	_expect(
		_family_events.size() == family_event_count_before
			and _form_events.size() == form_event_count_before
			and _detail_tab_events.size() == tab_event_count_before
			and panel.active_detail_tab() == PetCodexAwakenedPanel.TAB_GROWTH,
		"获取途径打开时底层种族、形态或页签仍可点击"
	)
	await _real_left_click(panel.close_button)
	_expect(not panel.acquisition_is_visible(), "顶层关闭没有先折叠获取途径")
	_expect(_close_count == 0, "折叠获取途径时错误关闭了整个图鉴")

	await _real_left_click(panel.acquisition_button)
	_expect(panel.acquisition_is_visible(), "获取途径无法再次打开")
	var dismiss := panel.find_child(
		"DismissAcquisitionButton",
		true,
		false
	) as Button
	await _real_left_click(dismiss)
	_expect(not panel.acquisition_is_visible(), "获取途径内嵌页无法关闭")

	await _real_left_click(family_button)
	await _real_left_click(form_button)
	_expect(_family_events.size() == 1, "种族条目没有发出一次选择事件")
	_expect(_form_events.size() == 1, "形态条目没有发出一次选择事件")
	await _real_left_click(panel.close_button)
	_expect(_close_count == 1, "关闭按钮没有发出一次关闭事件")

	var report := {
		"schemaVersion": 1,
		"reportType": "beastbound.pet_codex_awakened_panel_check",
		"result": "PASS" if _errors.is_empty() else "FAIL",
		"viewport": {
			"width": VIEWPORT_SIZE.x,
			"height": VIEWPORT_SIZE.y,
		},
		"selectedFormId": panel.selected_form_id(),
		"familyCount": panel.visible_family_buttons().size(),
		"formCount": panel.visible_form_buttons().size(),
		"routeCardCount": panel.route_card_count(),
		"routeCache": _route_cache_report,
		"openProjectionUsec": _open_projection_usec,
		"detailTabEvents": _detail_tab_events,
		"familyEvents": _family_events,
		"formEvents": _form_events,
		"closeCount": _close_count,
		"errors": _errors,
	}
	print("pet codex awakened panel check: %s" % JSON.stringify(report))
	panel.queue_free()
	await process_frame
	quit(0 if _errors.is_empty() else 1)


func _append_dependency_errors() -> void:
	var panel_source := FileAccess.get_file_as_string(PANEL_SCRIPT_PATH)
	var skin_source := FileAccess.get_file_as_string(SKIN_SCRIPT_PATH)
	_expect(
		panel_source.find("pet_management") < 0
			and panel_source.find("PetManagementVisualSkin") < 0,
		"图鉴面板仍依赖未发布宠物管理皮肤"
	)
	_expect(
		skin_source.find("backpack_awakened_visual_skin.gd") >= 0
			and skin_source.find("pet_management") < 0,
		"图鉴专用皮肤没有只复用已发布背包皮肤"
	)


func _append_layout_errors(
	panel: PetCodexAwakenedPanel,
	state: Dictionary
) -> void:
	_expect(
		_close_vec(panel.size, Vector2(VIEWPORT_SIZE)),
		"图鉴面板没有覆盖 1280×720 PC 画布"
	)
	_expect(panel.is_within_viewport(), "图鉴固定画布越出视口")
	_expect(panel.title_font_has_jian_glyph(), "标题字体缺少“鉴”字字形")
	var backdrop := panel.find_child("PetCodexBackdrop", true, false) as TextureRect
	_expect(
		backdrop != null and backdrop.texture != null,
		"图鉴没有加载独立原创底板"
	)
	var header_icon := panel.find_child("HeaderCodexIcon", true, false) as TextureRect
	_expect(
		header_icon != null and header_icon.texture != null,
		"图鉴没有复用已发布正式爪印图标"
	)
	var help_decoration := panel.find_child(
		"HelpDecoration",
		true,
		false
	) as Label
	_expect(
		help_decoration != null
			and help_decoration.mouse_filter == Control.MOUSE_FILTER_IGNORE
			and panel.find_child("HelpButton", true, false) == null,
		"页眉问号仍是一个无反馈的可交互死按钮"
	)
	_expect(
		panel.selected_form_id() == SEEN_FORM_ID
			and bool(state.get("selectedSeen", false)),
		"Presenter 没有选择已遇见形态"
	)
	_expect(
		panel.visible_family_buttons().size() > 0,
		"图鉴没有生成种族列表"
	)
	_expect(
		panel.visible_form_buttons().has(SEEN_FORM_ID),
		"图鉴没有生成所选同族形态"
	)
	_expect(
		panel.acquisition_button != null
			and panel.acquisition_button.visible
			and not panel.acquisition_button.disabled,
		"已遇见形态没有可用获取途径按钮"
	)
func _append_hidden_identity_errors(
	panel: PetCodexAwakenedPanel,
	state: Dictionary
) -> void:
	var hidden_state := state.duplicate(true)
	var forms := hidden_state.get("forms", []) as Array
	forms.append({
		"formId": "hidden_form",
		"name": "不应泄露的宠物名",
		"seen": false,
		"portraitTexture": PetPortraitArtCatalog.texture_for_form(PORTRAIT_FORM_ID),
	})
	hidden_state["forms"] = forms
	panel.apply_view_state(hidden_state)
	await process_frame
	var hidden := panel.visible_form_buttons().get("hidden_form", null) as Button
	_expect(
		hidden != null
			and hidden.text == "未遇见"
			and hidden.tooltip_text == "尚未遇见",
		"正式形态按钮没有隐藏未遇见身份"
	)
	_expect(
		hidden != null
			and hidden.text.find("不应泄露的宠物名") < 0
			and hidden.tooltip_text.find("不应泄露的宠物名") < 0,
		"正式形态按钮泄露未遇见真实名称"
	)
	_expect(hidden != null and hidden.icon == null, "未遇见形态泄露真实画像")
	panel.apply_view_state(state)
	await process_frame


func _append_route_cache_stress_errors(
	panel: PetCodexAwakenedPanel,
	original_state: Dictionary
) -> void:
	var stress_profile := PlayerProgressModel.default_profile()
	var stress_form_ids: Array[String] = []
	for entry in PlayerProgressModel.codex_entries(stress_profile):
		var form_id := str(entry.get("formId", "")).strip_edges()
		if form_id == "":
			continue
		stress_profile = PlayerProgressModel.record_codex_seen(
			stress_profile,
			form_id
		)
		stress_form_ids.append(form_id)
	var before := PetCodexAcquisitionRouteCatalog.stats_for_qa()
	var stress_entries := (
		PlayerProgressModel.codex_entries_from_normalized_profile(stress_profile)
	)
	var stress_projection := PetCodexPresenter.prepare_profile_projection(
		stress_entries
	)
	var max_refresh_usec := 0
	var max_build_usec := 0
	var max_apply_usec := 0
	var refresh_count := 0
	for iteration in range(2):
		for form_id in stress_form_ids:
			var started_usec := Time.get_ticks_usec()
			var stress_state := PetCodexPresenter.build_view_state_from_projection(
				stress_projection,
				form_id
			)
			var built_usec := Time.get_ticks_usec()
			panel.apply_view_state(stress_state)
			var applied_usec := Time.get_ticks_usec()
			max_build_usec = maxi(
				max_build_usec,
				built_usec - started_usec
			)
			max_apply_usec = maxi(
				max_apply_usec,
				applied_usec - built_usec
			)
			max_refresh_usec = maxi(
				max_refresh_usec,
				applied_usec - started_usec
			)
			refresh_count += 1
	var after := PetCodexAcquisitionRouteCatalog.stats_for_qa()
	_route_cache_report = {
		"refreshCount": refresh_count,
		"maxRefreshUsec": max_refresh_usec,
		"maxBuildUsec": max_build_usec,
		"maxApplyUsec": max_apply_usec,
		"sourceLoadsBefore": int(before.get("sourceLoadCount", -1)),
		"sourceLoadsAfter": int(after.get("sourceLoadCount", -2)),
		"prepareCount": int(after.get("prepareCount", 0)),
		"routeCount": int(after.get("routeCount", 0)),
	}
	_expect(
		refresh_count == stress_form_ids.size() * 2
			and int(after.get("sourceLoadCount", -1))
				== int(before.get("sourceLoadCount", -2))
			and int(after.get("prepareCount", 0)) == 1,
		"准备完成后的形态快速切换仍触发文件 I/O 或重复构建索引"
	)
	_expect(
		max_refresh_usec < 8000,
		"准备完成后的纯内存形态刷新超过 8ms"
	)
	panel.apply_view_state(original_state)


func _check_pending_portrait_blocked(panel: PetCodexAwakenedPanel) -> void:
	PetPortraitArtCatalog.clear_caches_for_qa()
	var profile := PlayerProgressModel.record_codex_seen(
		PlayerProgressModel.default_profile(),
		PORTRAIT_FORM_ID
	)
	var pending_texture := PetPortraitArtCatalog.texture_for_form(PORTRAIT_FORM_ID)
	var pending_state := PetCodexPresenter.build_view_state(
		profile,
		PORTRAIT_FORM_ID
	)
	var selected := pending_state.get("selectedPet", {}) as Dictionary
	selected["showcaseTexture"] = pending_texture
	selected["portraitTexture"] = pending_texture
	pending_state["selectedPet"] = selected
	var families := pending_state.get("families", []) as Array
	for index in range(families.size()):
		if not (families[index] is Dictionary):
			continue
		var family := families[index] as Dictionary
		if str(family.get("lineId", "")) == "bui":
			family["portraitTexture"] = pending_texture
			families[index] = family
	pending_state["families"] = families
	var forms := pending_state.get("forms", []) as Array
	for index in range(forms.size()):
		if not (forms[index] is Dictionary):
			continue
		var form := forms[index] as Dictionary
		if str(form.get("formId", "")) == PORTRAIT_FORM_ID:
			form["portraitTexture"] = pending_texture
			forms[index] = form
	pending_state["forms"] = forms
	pending_state["acquisitionRoutes"] = [{
		"title": "注入画像探针",
		"detail": "不应显示未批准画像",
		"iconTexture": pending_texture,
	}]
	var pending_attributes := pending_state.get("attributes", {}) as Dictionary
	pending_attributes["skills"] = [{
		"abilityId": "forged_pending_portrait",
		"name": "画像注入技能",
		"description": "技能卡不得信任未批准画像",
		"iconTexture": pending_texture,
		"iconPath": PetPortraitArtCatalog.resource_path_for_form(PORTRAIT_FORM_ID),
	}]
	pending_state["attributes"] = pending_attributes
	panel.set_detail_tab(PetCodexAwakenedPanel.TAB_ATTRIBUTES)
	panel.apply_view_state(pending_state)
	await process_frame
	await process_frame
	var showcase := panel.find_child(
		"SelectedPetShowcase",
		true,
		false
	) as TextureRect
	var locked_label := panel.find_child(
		"LockedStageLabel",
		true,
		false
	) as Label
	_expect(
		showcase != null and not showcase.visible and showcase.texture == null,
		"selectedPet 注入的 owner review 未通过画像被越权显示"
	)
	var family_button := panel.visible_family_buttons().get("bui", null) as Button
	var form_button := panel.visible_form_buttons().get(PORTRAIT_FORM_ID, null) as Button
	_expect(
		pending_texture != null
			and family_button != null
			and family_button.icon == null
			and form_button != null
			and form_button.icon == null,
		"family/form view-state 注入绕过了 owner-approved 画像门禁"
	)
	_expect(
		not PetPortraitArtCatalog.is_owner_approved_portrait(PORTRAIT_FORM_ID)
			and PetPortraitArtCatalog.approved_texture_for_form(PORTRAIT_FORM_ID) == null
			and PetPortraitArtCatalog.approved_resource_path_for_form(PORTRAIT_FORM_ID) == ""
			and PetPortraitArtCatalog.resource_path_for_form(PORTRAIT_FORM_ID) != "",
		"owner review 未通过的实际画像没有被正式发布门禁拒绝"
	)
	_expect(
		locked_label != null
			and locked_label.visible
			and locked_label.text == "形象尚未收录"
			and locked_label.text.find("素材") < 0,
		"无批准画像的玩家占位话术不自然"
	)
	panel.show_acquisition_routes()
	await process_frame
	var route_icons := panel.acquisition_route_container.find_children(
		"*",
		"TextureRect",
		true,
		false
	)
	_expect(route_icons.is_empty(), "获取途径 iconTexture 绕过了正式资源目录")
	panel.hide_acquisition_routes()
	var forged_skill := panel.find_child(
		"Skill_forged_pending_portrait",
		true,
		false
	) as Control
	var forged_skill_icons: Array[Node] = []
	if forged_skill != null:
		forged_skill_icons = forged_skill.find_children(
			"*",
			"TextureRect",
			true,
			false
		)
	_expect(
		forged_skill != null and forged_skill_icons.is_empty(),
		"技能 iconTexture/iconPath 绕过了正式资源目录"
	)
	panel.set_detail_tab(PetCodexAwakenedPanel.TAB_GROWTH)


func _first_button(buttons: Dictionary) -> Button:
	for value in buttons.values():
		if value is Button:
			return value as Button
	return null


func _find_label_with_text(root_control: Node, expected: String) -> Label:
	if root_control is Label and (root_control as Label).text == expected:
		return root_control as Label
	for child in root_control.get_children():
		var found := _find_label_with_text(child, expected)
		if found != null:
			return found
	return null


func _real_left_click(control: Control) -> void:
	if control == null:
		_errors.append("真实左键目标不存在")
		return
	var point := control.global_position + control.size * 0.5
	var motion := InputEventMouseMotion.new()
	motion.position = point
	motion.global_position = point
	root.push_input(motion, true)
	await process_frame
	var press := InputEventMouseButton.new()
	press.button_index = MOUSE_BUTTON_LEFT
	press.pressed = true
	press.position = point
	press.global_position = point
	root.push_input(press, true)
	await process_frame
	var release := InputEventMouseButton.new()
	release.button_index = MOUSE_BUTTON_LEFT
	release.pressed = false
	release.position = point
	release.global_position = point
	root.push_input(release, true)
	await process_frame


func _expect(condition: bool, message: String) -> void:
	if not condition:
		_errors.append(message)


func _close_vec(left: Vector2, right: Vector2) -> bool:
	return left.distance_to(right) <= 0.5
