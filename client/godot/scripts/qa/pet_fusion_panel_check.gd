extends SceneTree

const BalanceCatalogModel := preload(
	"res://scripts/progression/balance_catalog_model.gd"
)
const PetFusionClientModel := preload(
	"res://scripts/progression/pet_fusion_client_model.gd"
)
const PetFusionPanel := preload(
	"res://scripts/ui/pet_fusion_panel.gd"
)
const PetFusionRecipeCatalogModel := preload(
	"res://scripts/progression/pet_fusion_recipe_catalog_model.gd"
)
const PetFusionSelectionModel := preload(
	"res://scripts/progression/pet_fusion_selection_model.gd"
)

const CLOSED_MESSAGE := PetFusionSelectionModel.CLOSED_MESSAGE
const VIEWPORT_SIZE := Vector2i(1280, 720)
const ROUTE_SOLAR := "solar"
const ROUTE_MOSS := "moss"

var _errors: Array[String] = []
var _route_reports: Array[Dictionary] = []
var _runtime_report: Dictionary = {}


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	root.size = VIEWPORT_SIZE
	root.content_scale_size = VIEWPORT_SIZE
	root.content_scale_mode = Window.CONTENT_SCALE_MODE_CANVAS_ITEMS
	BalanceCatalogModel.reload()
	var production_catalog := BalanceCatalogModel.pet_fusion_recipes()
	_expect(
		not PetFusionRecipeCatalogModel.runtime_available(production_catalog)
			and str(production_catalog.get("disabledMessage", ""))
				== CLOSED_MESSAGE,
		"生产融合目录没有保持精确关闭态",
		_errors
	)

	var closed_fixture := preview_fixture(ROUTE_SOLAR)
	var closed_candidates: Array[Dictionary] = closed_fixture.get(
		"candidates",
		[]
	)
	var closed_panel := PetFusionPanel.new()
	root.add_child(closed_panel)
	closed_panel.configure_closed(production_catalog, closed_candidates)
	await process_frame
	await process_frame
	_append_closed_state_errors(closed_panel, closed_candidates.size())
	for layout_error in layout_errors(closed_panel):
		_errors.append("关闭态布局：%s" % layout_error)
	closed_panel.call("_confirm_pressed")
	closed_panel.call("_confirm_pressed")
	var closed_after_press := closed_panel.snapshot()
	_expect(
		int(closed_after_press.get("secondConfirmationCount", -1)) == 0
			and int(closed_after_press.get("networkRequestCount", -1)) == 0,
		"关闭态确认按钮仍产生了确认或请求副作用",
		_errors
	)
	closed_panel.queue_free()
	await process_frame

	var invalid_fixture := preview_fixture(ROUTE_SOLAR)
	var invalid_panel := PetFusionPanel.new()
	root.add_child(invalid_panel)
	var invalid_candidates: Array[Dictionary] = invalid_fixture.get(
		"candidates",
		[]
	)
	var invalid_preview_ok := invalid_panel.configure_qa_preview(
		"invalid_preview_token",
		invalid_fixture.get("catalog", {}),
		invalid_fixture.get("selections", {}),
		invalid_fixture.get("quote", {}),
		invalid_candidates
	)
	await process_frame
	var invalid_snapshot := invalid_panel.snapshot()
	_expect(
		not invalid_preview_ok
			and bool(invalid_snapshot.get("closed", false))
			and str(invalid_snapshot.get("messageText", ""))
				== CLOSED_MESSAGE
			and int(invalid_snapshot.get("networkRequestCount", -1)) == 0,
		"非隔离预览令牌没有失败关闭",
		_errors
	)
	for layout_error in layout_errors(invalid_panel):
		_errors.append("无效令牌关闭态布局：%s" % layout_error)
	invalid_panel.queue_free()
	await process_frame

	for route_key in [ROUTE_SOLAR, ROUTE_MOSS]:
		await _append_preview_route_errors(route_key)
	await _append_runtime_interaction_errors()

	_append_source_boundary_errors()
	var report := {
		"schemaVersion": 1,
		"reportType": "beastbound.pet_fusion_panel_check",
		"result": "PASS" if _errors.is_empty() else "FAIL",
		"viewport": {
			"width": VIEWPORT_SIZE.x,
			"height": VIEWPORT_SIZE.y,
		},
		"productionRuntimeEnabled": PetFusionRecipeCatalogModel.runtime_available(
			production_catalog
		),
		"productionClosedExact": (
			str(production_catalog.get("disabledMessage", ""))
				== CLOSED_MESSAGE
		),
		"routes": _route_reports,
		"runtimeInteraction": _runtime_report,
		"errors": _errors,
	}
	print("pet fusion panel check: %s" % JSON.stringify(report))
	quit(0 if _errors.is_empty() else 1)


func _append_closed_state_errors(
	panel: Control,
	candidate_count: int
) -> void:
	var snapshot := panel.call("snapshot") as Dictionary
	var text := str(snapshot.get("visibleText", ""))
	_expect(bool(snapshot.get("closed", false)), "关闭态标记错误", _errors)
	_expect(
		str(snapshot.get("messageText", "")) == CLOSED_MESSAGE,
		"关闭态没有显示精确产品文案",
		_errors
	)
	_expect(
		int(snapshot.get("materialSlotCount", 0)) == 3
			and int(snapshot.get("materialDisabledCount", 0)) == 3,
		"关闭态三材料位没有全部禁用",
		_errors
	)
	_expect(
		int(snapshot.get("candidateCount", -1)) == candidate_count
			and int(snapshot.get("candidateDisabledCount", -1))
				== candidate_count,
		"关闭态候选宠底栏没有全部禁用",
		_errors
	)
	_expect(
		bool(snapshot.get("confirmDisabled", false))
			and not bool(snapshot.get("quoteValid", true))
			and not bool(snapshot.get("confirmationArmed", true))
			and int(snapshot.get("networkRequestCount", -1)) == 0,
		"关闭态仍可报价、确认或请求",
		_errors
	)
	_expect(
		text.contains(CLOSED_MESSAGE)
			and not text.contains("QA")
			and not text.to_lower().contains("debug"),
		"关闭态玩家文案不干净",
		_errors
	)


func _append_preview_route_errors(route_key: String) -> void:
	var fixture := preview_fixture(route_key)
	var candidates: Array[Dictionary] = fixture.get("candidates", [])
	var panel := PetFusionPanel.new()
	root.add_child(panel)
	var configured := panel.configure_qa_preview(
		PetFusionPanel.QA_PREVIEW_TOKEN,
		fixture.get("catalog", {}),
		fixture.get("selections", {}),
		fixture.get("quote", {}),
		candidates
	)
	await process_frame
	await process_frame
	var snapshot := panel.snapshot()
	var visible_text := str(snapshot.get("visibleText", ""))
	var raw_tokens: Array[String] = fixture.get("rawTokens", [])
	var raw_text_clean := true
	for raw_token in raw_tokens:
		if raw_token != "" and visible_text.contains(raw_token):
			raw_text_clean = false
			break
	var portrait_status := str(snapshot.get("targetPortraitStatus", ""))
	var chance_texts = snapshot.get("specialChanceTexts", [])
	var route_layout_errors := layout_errors(panel)
	for layout_error in route_layout_errors:
		_errors.append("%s 路线布局：%s" % [route_key, layout_error])
	_expect(configured, "%s 路线不能装载隔离预览" % route_key, _errors)
	_expect(
		not bool(snapshot.get("closed", true))
			and bool(snapshot.get("previewFixtureValid", false))
			and bool(snapshot.get("quoteValid", false)),
		"%s 路线预览没有形成有效报价" % route_key,
		_errors
	)
	_expect(
		str(snapshot.get("targetNameText", ""))
			== str(fixture.get("targetName", "")),
		"%s 路线目标名称错误" % route_key,
		_errors
	)
	_expect(
		portrait_status in ["formal", "qa_placeholder"],
		"%s 路线目标画像既非正式画像也非明确预览占位" % route_key,
		_errors
	)
	_expect(
		int(snapshot.get("candidateFormalPortraitCount", 0))
			+ int(snapshot.get("candidatePlaceholderCount", 0))
			== candidates.size(),
		"%s 路线候选画像未通过正式目录或明确占位逐个处理" % route_key,
		_errors
	)
	_expect(
		snapshot.get("baseSkillTexts", []) == ["攻击", "防御"],
		"%s 路线固定技能不是攻击和防御" % route_key,
		_errors
	)
	_expect(
		visible_text.contains("普通/训练主动不遗传")
			and visible_text.contains("遗忘也可遗传"),
		"%s 路线没有展示普通技能不遗传或遗忘特殊技仍可遗传"
			% route_key,
		_errors
	)
	_expect(
		chance_texts is Array
			and (chance_texts as Array).size() == 3
			and (chance_texts as Array).count("50%") == 3,
		"%s 路线没有逐只展示三次50%%主动遗传" % route_key,
		_errors
	)
	_expect(
		str(snapshot.get("passiveRuleText", "")).contains("主宠")
			and str(snapshot.get("passiveRuleText", "")).contains("40%")
			and str(snapshot.get("passiveRuleText", "")).contains("共鸣宠Ⅰ")
			and str(snapshot.get("passiveRuleText", "")).contains("共鸣宠Ⅱ")
			and str(snapshot.get("passiveRuleText", "")).count("30%") == 2
			and str(snapshot.get("passiveRuleText", "")).contains(
				"最终只保留1个"
			),
		"%s 路线没有展示唯一被动40/30/30" % route_key,
		_errors
	)
	_expect(
		str(snapshot.get("numericRuleText", "")).contains("不会继承")
			or str(snapshot.get("numericRuleText", "")).contains("不继承"),
		"%s 路线没有展示数值不继承" % route_key,
		_errors
	)
	_expect(
		str(snapshot.get("bindingRuleText", "")).contains(
			str(fixture.get("bindingNeedle", ""))
		),
		"%s 路线绑定规则展示错误" % route_key,
		_errors
	)
	_expect(
		str(snapshot.get("costRuleText", "")).contains(
			"不额外消耗石币、钻石或道具"
		),
		"%s 路线没有展示无额外费用" % route_key,
		_errors
	)
	_expect(
		str(snapshot.get("terminalRuleText", "")).contains("不可骑乘")
			and str(snapshot.get("terminalRuleText", "")).contains("终局")
			and str(snapshot.get("terminalRuleText", "")).contains(
				"不能付费重置"
			),
		"%s 路线没有完整展示不可骑、终局和禁止重置" % route_key,
		_errors
	)
	_expect(
		str(snapshot.get("authorityText", "")).contains("服务器")
			and str(snapshot.get("authorityText", "")).contains("最终结果")
			and visible_text.contains(str(snapshot.get("authorityText", ""))),
		"%s 路线没有在实际画面说明服务器最终权威" % route_key,
		_errors
	)
	_expect(
		raw_text_clean
			and not visible_text.contains("QA")
			and not visible_text.to_lower().contains("debug"),
		"%s 路线玩家界面泄露 raw ID 或测试术语" % route_key,
		_errors
	)
	_expect(
		not bool(snapshot.get("confirmationArmed", true))
			and not bool(snapshot.get("confirmDisabled", true))
			and int(snapshot.get("networkRequestCount", -1)) == 0,
		"%s 路线首次确认态或零请求边界错误" % route_key,
		_errors
	)
	panel.call("_confirm_pressed")
	var armed_snapshot := panel.snapshot()
	_expect(
		bool(armed_snapshot.get("confirmationArmed", false))
			and int(armed_snapshot.get("secondConfirmationCount", -1)) == 0
			and int(armed_snapshot.get("networkRequestCount", -1)) == 0,
		"%s 路线第一次点击没有只进入本地二次确认" % route_key,
		_errors
	)
	panel.call("_confirm_pressed")
	var completed_snapshot := panel.snapshot()
	_expect(
		int(completed_snapshot.get("secondConfirmationCount", -1)) == 1
			and bool(completed_snapshot.get("confirmDisabled", false))
			and int(completed_snapshot.get("networkRequestCount", -1)) == 0,
		"%s 路线第二次点击没有停留在零请求体验完成态" % route_key,
		_errors
	)
	_route_reports.append({
		"route": route_key,
		"targetName": str(snapshot.get("targetNameText", "")),
		"targetPortraitStatus": portrait_status,
		"candidateFormalPortraitCount": int(
			snapshot.get("candidateFormalPortraitCount", 0)
		),
		"candidatePlaceholderCount": int(
			snapshot.get("candidatePlaceholderCount", 0)
		),
		"doubleConfirmationLocalOnly": (
			int(completed_snapshot.get("secondConfirmationCount", 0)) == 1
				and int(completed_snapshot.get("networkRequestCount", -1))
					== 0
		),
		"layoutWithinViewport": route_layout_errors.is_empty(),
	})
	panel.queue_free()
	await process_frame


func _append_runtime_interaction_errors() -> void:
	var fixture := preview_fixture(ROUTE_SOLAR)
	var catalog := fixture.get("catalog", {}) as Dictionary
	var candidates: Array[Dictionary] = fixture.get("candidates", [])
	var panel := PetFusionPanel.new()
	root.add_child(panel)
	var quote_requests: Array[Dictionary] = []
	var fusion_requests: Array[Dictionary] = []
	panel.quote_requested.connect(func(state: Dictionary) -> void:
		quote_requests.append(state.duplicate(true))
	)
	panel.fusion_requested.connect(func(quote: Dictionary) -> void:
		fusion_requests.append(quote.duplicate(true))
	)
	var configured := panel.configure_runtime(
		catalog,
		{},
		{},
		candidates,
		false,
		false,
		"",
		true
	)
	await process_frame
	panel.call("_candidate_pressed", candidates[0])
	panel.call("_candidate_pressed", candidates[2])
	panel.call("_candidate_pressed", candidates[1])
	await process_frame
	var pending_snapshot := panel.snapshot()
	var selected := panel.current_selection()
	_expect(configured, "真实运行态不能装载已开放目录", _errors)
	_expect(
		bool(pending_snapshot.get("runtime", false))
			and bool(pending_snapshot.get("quotePending", false))
			and int(pending_snapshot.get("quoteRequestCount", 0)) == 1
			and int(pending_snapshot.get("fusionRequestCount", -1)) == 0
			and quote_requests.size() == 1,
		"三只材料选择没有精确触发一次报价请求",
		_errors
	)
	_expect(
		int(pending_snapshot.get("candidateDisabledCount", -1))
			== candidates.size(),
		"报价请求期间没有锁定材料选择",
		_errors
	)
	panel.configure_runtime(
		catalog,
		selected,
		fixture.get("quote", {}),
		candidates,
		false,
		false,
		"报价已由服务器确认，请核对后进行两次确认。",
		true
	)
	await process_frame
	var quoted_snapshot := panel.snapshot()
	_expect(
		bool(quoted_snapshot.get("quoteValid", false))
			and not bool(quoted_snapshot.get("confirmDisabled", true))
			and int(quoted_snapshot.get("networkRequestCount", 0)) == 1,
		"服务器报价没有恢复真实确认控件",
		_errors
	)
	panel.call("_confirm_pressed")
	var armed_snapshot := panel.snapshot()
	var first_confirm_local_only := (
		bool(armed_snapshot.get("confirmationArmed", false))
			and fusion_requests.is_empty()
			and int(armed_snapshot.get("networkRequestCount", 0)) == 1
	)
	_expect(
		first_confirm_local_only,
		"真实运行态第一次点击越过了本地确认锁",
		_errors
	)
	panel.call("_confirm_pressed")
	var mutation_snapshot := panel.snapshot()
	_expect(
		bool(mutation_snapshot.get("mutationPending", false))
			and bool(mutation_snapshot.get("confirmDisabled", false))
			and int(mutation_snapshot.get("fusionRequestCount", 0)) == 1
			and int(mutation_snapshot.get("networkRequestCount", 0)) == 2
			and fusion_requests.size() == 1,
		"真实运行态第二次点击没有精确触发一次融合请求并立即锁定",
		_errors
	)
	var changed_selection := selected.duplicate(true)
	changed_selection.erase("resonance_two")
	panel.configure_runtime(
		catalog,
		changed_selection,
		fixture.get("quote", {}),
		candidates,
		false,
		false,
		"",
		true
	)
	var stale_snapshot := panel.snapshot()
	_expect(
		not bool(stale_snapshot.get("quoteValid", true)),
		"材料变化后仍接受旧融合报价",
		_errors
	)
	var visible_text := str(mutation_snapshot.get("visibleText", ""))
	_expect(
		not visible_text.contains("QA")
			and not visible_text.to_lower().contains("debug")
			and visible_text.contains("服务器"),
		"真实运行态玩家文案泄露测试术语或缺少服务器权威说明",
		_errors
	)
	_runtime_report = {
		"configured": configured,
		"quoteRequestCount": quote_requests.size(),
		"firstConfirmLocalOnly": first_confirm_local_only,
		"fusionRequestCount": fusion_requests.size(),
		"staleQuoteRejected": not bool(stale_snapshot.get("quoteValid", true)),
		"layoutWithinViewport": layout_errors(panel).is_empty(),
	}
	for layout_error in layout_errors(panel):
		_errors.append("真实运行态布局：%s" % layout_error)
	panel.queue_free()
	await process_frame


func _append_source_boundary_errors() -> void:
	var panel_source := _read_text("res://scripts/ui/pet_fusion_panel.gd")
	for marker in [
		"ServerAuthClientModel",
		"HTTPClient",
		"HTTPRequest",
		"pet_fusion_quote_request",
		"pet_fusion_request",
	]:
		_expect(
			panel_source.find(marker) < 0,
			"融合面板切片意外依赖网络实现：%s" % marker,
			_errors
		)
	var main_source := _read_text("res://scripts/main.gd")
	var coordinator_source := _read_text(
		"res://scripts/ui/panel_flow_coordinator.gd"
	)
	_expect(
		main_source.find("pet_fusion_panel.gd") < 0,
		"融合面板不应直接进入 Main 宿主",
		_errors
	)
	for marker in [
		"const PetFusionPanel := preload(\"res://scripts/ui/pet_fusion_panel.gd\")",
		"_pet_fusion_open_button.text = \"融合\"",
		"_pet_fusion_panel.quote_requested.connect(_on_pet_fusion_quote_requested)",
		"_pet_fusion_panel.fusion_requested.connect(_on_pet_fusion_confirm_requested)",
		"ServerAuthClientModel.pet_fusion_quote_request(",
		"ServerAuthClientModel.pet_fusion_request(",
	]:
		_expect(
			coordinator_source.find(marker) >= 0,
			"正常玩家融合入口缺少接线：%s" % marker,
			_errors
		)


static func layout_errors(panel: Control) -> Array[String]:
	var errors: Array[String] = []
	if panel == null:
		return ["融合面板为空"]
	var viewport_rect := Rect2(Vector2.ZERO, Vector2(VIEWPORT_SIZE))
	_append_visible_control_bounds(panel, viewport_rect, false, errors)

	var candidate_scroll := panel.get_node_or_null("CandidateScroll") as ScrollContainer
	if candidate_scroll == null:
		errors.append("缺少候选宠 ScrollContainer")
	elif not candidate_scroll.clip_contents:
		errors.append("候选宠 ScrollContainer 必须裁切滚动内容")

	var rules_panel := panel.get_node_or_null("RulesPanel") as Control
	if rules_panel == null:
		errors.append("缺少遗传规则主面板")
	elif not rules_panel.clip_contents:
		errors.append("遗传规则主面板必须裁切自身内容")
	else:
		var rules_rect := rules_panel.get_global_rect()
		for child in rules_panel.get_children():
			if not (child is Control) or not (child as Control).visible:
				continue
			var child_rect := (child as Control).get_global_rect()
			if child_rect.end.y > rules_rect.end.y + 0.75:
				errors.append(
					"遗传规则内容被底部裁切：%s" % str((child as Node).name)
				)

	if candidate_scroll != null:
		var main_bottom := 0.0
		for node_name in [
			"RulesPanel",
			"TargetName",
			"TargetRoute",
			"ConfirmButton",
			"AuthorityText",
		]:
			var main_control := panel.get_node_or_null(node_name) as Control
			if main_control != null and main_control.visible:
				main_bottom = maxf(
					main_bottom,
					main_control.get_global_rect().end.y
				)
		if candidate_scroll.get_global_rect().position.y < main_bottom + 4.0:
			errors.append("候选宠底栏与主面板发生纵向重叠")
	return errors


static func _append_visible_control_bounds(
	node: Node,
	viewport_rect: Rect2,
	inside_scroll_contents: bool,
	errors: Array[String]
) -> void:
	if node is CanvasItem and not (node as CanvasItem).visible:
		return
	var child_inside_scroll := inside_scroll_contents
	if node is Control:
		var control := node as Control
		var rect := control.get_global_rect()
		if not inside_scroll_contents and (
			rect.position.x < viewport_rect.position.x - 0.75
			or rect.position.y < viewport_rect.position.y - 0.75
			or rect.end.x > viewport_rect.end.x + 0.75
			or rect.end.y > viewport_rect.end.y + 0.75
		):
			errors.append(
				"可见控件越出1280x720：%s %s"
				% [str(control.get_path()), str(rect)]
			)
		if control is ScrollContainer:
			child_inside_scroll = true
	for child in node.get_children():
		_append_visible_control_bounds(
			child,
			viewport_rect,
			child_inside_scroll,
			errors
		)


static func preview_fixture(route_key: String) -> Dictionary:
	BalanceCatalogModel.reload()
	var production_catalog := BalanceCatalogModel.pet_fusion_recipes()
	var enabled_catalog := production_catalog.duplicate(true)
	enabled_catalog["runtimeEnabled"] = true
	var candidates: Array[Dictionary] = [
		_material_instance(
			enabled_catalog,
			"preview_core_red",
			"emberhorn_red_fire8_earth2",
			"赤角兽",
			131
		),
		_material_instance(
			enabled_catalog,
			"preview_emberhorn_ash",
			"emberhorn_ash_fire6_wind4",
			"灰烬角兽",
			137
		),
		_material_instance(
			enabled_catalog,
			"preview_emberhorn_gale",
			"emberhorn_gale_fire5_wind5",
			"岚角兽",
			139
		),
		_material_instance(
			enabled_catalog,
			"preview_mossback_marsh",
			"mossback_marsh_earth7_water3",
			"湿地苔背兽",
			140
		),
		_material_instance(
			enabled_catalog,
			"preview_mossback_sunbaked",
			"mossback_sunbaked_earth6_fire4",
			"晒甲苔背兽",
			136
		),
	]
	var selections := {}
	var recipe_id := ""
	var target_form_id := ""
	var target_name := ""
	var result_binding := ""
	var trade_eligibility := ""
	var binding_needle := ""
	if route_key == ROUTE_SOLAR:
		selections = {
			"core": candidates[0],
			"resonance_one": candidates[2],
			"resonance_two": candidates[1],
		}
		recipe_id = "emberhorn_solar_crown_fusion_v1"
		target_form_id = "emberhorn_fusion_solar_crown_fire7_wind3"
		target_name = "曜冠角兽"
		result_binding = PetFusionClientModel.RESULT_BINDING_UNBOUND
		trade_eligibility = (
			PetFusionRecipeCatalogModel.UNBOUND_RESULT_TRADE_POLICY
		)
		binding_needle = "保持未绑定"
	else:
		selections = {
			"core": candidates[0],
			"resonance_one": candidates[3],
			"resonance_two": candidates[4],
		}
		recipe_id = "emberhorn_moss_rampart_fusion_v1"
		target_form_id = "emberhorn_fusion_moss_rampart_fire4_earth6"
		target_name = "苔垒角兽"
		result_binding = PetFusionClientModel.RESULT_BINDING_BOUND
		trade_eligibility = PetFusionClientModel.TRADE_ELIGIBILITY_NOT_ELIGIBLE
		binding_needle = "成品将绑定"
	var quote := _quote_fixture(
		enabled_catalog,
		recipe_id,
		target_form_id,
		target_name,
		selections,
		result_binding,
		trade_eligibility
	)
	var raw_tokens: Array[String] = [
		recipe_id,
		target_form_id,
	]
	for instance in candidates:
		raw_tokens.append(str(instance.get("instanceId", "")))
		raw_tokens.append(str(instance.get("formId", "")))
		var gene := PetFusionRecipeCatalogModel.gene_profile_by_form_id(
			enabled_catalog,
			str(instance.get("formId", ""))
		)
		raw_tokens.append(str(gene.get("specialActiveSkillId", "")))
		raw_tokens.append(str(gene.get("passiveSkillId", "")))
	return {
		"catalog": enabled_catalog,
		"candidates": candidates,
		"selections": selections,
		"quote": quote,
		"targetName": target_name,
		"bindingNeedle": binding_needle,
		"rawTokens": raw_tokens,
	}


static func _material_instance(
	catalog_document,
	instance_id: String,
	form_id: String,
	form_name: String,
	level: int
) -> Dictionary:
	var gene := PetFusionRecipeCatalogModel.gene_profile_by_form_id(
		catalog_document,
		form_id
	)
	var growth_profile_id := str(gene.get("growthProfileId", ""))
	return {
		"instanceId": instance_id,
		"formId": form_id,
		"name": form_name,
		"level": level,
		"growthModelVersion": PetFusionRecipeCatalogModel.AUTHORITY_MODEL,
		"growthSpeciesProfileId": growth_profile_id,
		"petCultivation": {"rebirthCount": 1},
		"petGrowth": {
			"schemaVersion": 1,
			"modelVersion": PetFusionRecipeCatalogModel.AUTHORITY_MODEL,
			"profileId": growth_profile_id,
			"settledLevel": level,
			"public": {
				"schemaVersion": 1,
				"growthModelVersion": PetFusionRecipeCatalogModel.AUTHORITY_MODEL,
				"growthSpeciesProfileId": growth_profile_id,
				"level": level,
			},
		},
	}


static func _quote_fixture(
	catalog_document,
	recipe_id: String,
	target_form_id: String,
	target_name: String,
	selections: Dictionary,
	result_binding: String,
	trade_eligibility: String
) -> Dictionary:
	var materials: Array[Dictionary] = []
	for role_id in PetFusionRecipeCatalogModel.ROLE_IDS:
		var instance := selections.get(role_id, {}) as Dictionary
		var form_id := str(instance.get("formId", ""))
		var gene := PetFusionRecipeCatalogModel.gene_profile_by_form_id(
			catalog_document,
			form_id
		)
		materials.append({
			"roleId": role_id,
			"instanceId": str(instance.get("instanceId", "")),
			"formId": form_id,
			"formName": str(instance.get("name", "宠物")),
			"level": int(instance.get("level", 0)),
			"rebirthCount": 1,
			"specialActiveSkillId": str(
				gene.get("specialActiveSkillId", "")
			),
			"passiveSkillId": str(gene.get("passiveSkillId", "")),
		})
	return {
		"schemaVersion": 1,
		"catalogId": PetFusionRecipeCatalogModel.CATALOG_ID,
		"recipeId": recipe_id,
		"profileRevision": 37,
		"materials": materials,
		"inheritance": {
			"baseActiveSkillIds": ["pet_attack", "pet_defend"],
			"specialActiveInheritanceChance": 0.5,
			"activeRollsIndependent": true,
			"ordinaryOrTrainingActiveInheritance": false,
			"duplicateActiveSkillPolicy": "deduplicate_after_roll_no_reroll",
			"passiveSourceWeights": {
				"core": 0.4,
				"resonance_one": 0.3,
				"resonance_two": 0.3,
			},
			"resultPassiveSkillCount": 1,
		},
		"result": {
			"targetFormId": target_form_id,
			"targetFormName": target_name,
			"level": 1,
			"rebirthCount": 1,
			"terminalStage": 2,
			"terminalStageLabel": "2转/进化/融合",
			"numericSource": "target_profile_only_v1",
			"materialNumericInheritance": false,
			"rideable": false,
			"additionalCostPolicy": "materials_only",
			"resultBinding": result_binding,
			"tradeEligibility": trade_eligibility,
		},
	}


static func _read_text(path: String) -> String:
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		return ""
	return file.get_as_text()


static func _expect(
	condition: bool,
	message: String,
	errors: Array[String]
) -> void:
	if not condition:
		errors.append(message)
