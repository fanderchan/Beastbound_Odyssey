extends SceneTree

const BalanceCatalogModel := preload(
	"res://scripts/progression/balance_catalog_model.gd"
)
const PetFusionPanel := preload(
	"res://scripts/ui/pet_fusion_panel.gd"
)
const PetFusionPanelCheck := preload(
	"res://scripts/qa/pet_fusion_panel_check.gd"
)
const PetFusionRecipeCatalogModel := preload(
	"res://scripts/progression/pet_fusion_recipe_catalog_model.gd"
)
const PetFusionSelectionModel := preload(
	"res://scripts/progression/pet_fusion_selection_model.gd"
)

const VIEWPORT_SIZE := Vector2i(1280, 720)
const VALID_STATES: Array[String] = ["closed", "preview", "armed"]
const VALID_ROUTES: Array[String] = ["solar", "moss"]
const DEFAULT_OUTPUT := "user://pet-fusion-closed-review.png"


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var errors: Array[String] = []
	var options := _options_from_args(OS.get_cmdline_user_args(), errors)
	root.size = VIEWPORT_SIZE
	root.content_scale_size = VIEWPORT_SIZE
	root.content_scale_mode = Window.CONTENT_SCALE_MODE_CANVAS_ITEMS
	BalanceCatalogModel.reload()
	var production_catalog := BalanceCatalogModel.pet_fusion_recipes()
	if PetFusionRecipeCatalogModel.runtime_available(production_catalog):
		errors.append("生产融合目录必须保持关闭")
	if str(production_catalog.get("disabledMessage", "")) != (
		PetFusionSelectionModel.CLOSED_MESSAGE
	):
		errors.append("生产融合目录关闭文案不精确")

	var route_key := str(options.get("route", "solar"))
	var state := str(options.get("state", "closed"))
	var fixture := PetFusionPanelCheck.preview_fixture(route_key)
	var candidates: Array[Dictionary] = fixture.get("candidates", [])
	var panel := PetFusionPanel.new()
	root.add_child(panel)
	if state == "closed":
		panel.configure_closed(production_catalog, candidates)
	else:
		var configured := panel.configure_qa_preview(
			PetFusionPanel.QA_PREVIEW_TOKEN,
			fixture.get("catalog", {}),
			fixture.get("selections", {}),
			fixture.get("quote", {}),
			candidates
		)
		if not configured:
			errors.append("隔离融合预览装载失败")
		if state == "armed":
			panel.call("_confirm_pressed")

	for _frame_index in range(6):
		await process_frame
	if DisplayServer.get_name().to_lower() != "headless":
		await RenderingServer.frame_post_draw

	var snapshot := panel.snapshot()
	_append_state_errors(state, panel, snapshot, candidates.size(), errors)
	_append_player_text_errors(
		str(snapshot.get("visibleText", "")),
		fixture.get("rawTokens", []),
		errors
	)
	var output_path := _absolute_path(str(options.get("output", DEFAULT_OUTPUT)))
	var headless := DisplayServer.get_name().to_lower() == "headless"
	var image: Image = null
	if headless:
		errors.append("截图入口需要可见渲染器；headless 只用于合同检查")
	else:
		image = await _capture_complete_image(panel)
	if not headless and (image == null or image.is_empty()):
		errors.append("真实视口没有得到可保存画面")
	elif not headless and (
		image.get_width() != VIEWPORT_SIZE.x
		or image.get_height() != VIEWPORT_SIZE.y
	):
		errors.append(
			"截图必须为1280x720，实际%d×%d"
			% [image.get_width(), image.get_height()]
		)
	elif not headless:
		var make_dir_error := DirAccess.make_dir_recursive_absolute(
			output_path.get_base_dir()
		)
		if make_dir_error != OK:
			errors.append(
				"无法创建截图目录：%s" % error_string(make_dir_error)
			)
		else:
			var save_error := image.save_png(output_path)
			if save_error != OK:
				errors.append("无法保存截图：%s" % error_string(save_error))

	var screenshot_hash := (
		FileAccess.get_sha256(output_path)
		if errors.is_empty() and FileAccess.file_exists(output_path)
		else ""
	)
	var portrait_ready := (
		state == "closed"
		or str(snapshot.get("targetPortraitStatus", "")) == "formal"
	)
	var report := {
		"schemaVersion": 1,
		"reportType": "beastbound.pet_fusion_closed_review_capture",
		"result": (
			"FAIL"
			if not errors.is_empty()
			else "PASS" if portrait_ready else "PENDING_PORTRAIT"
		),
		"state": state,
		"route": route_key,
		"viewport": {
			"width": VIEWPORT_SIZE.x,
			"height": VIEWPORT_SIZE.y,
		},
		"outputPath": output_path,
		"screenshotSha256": screenshot_hash,
		"productionRuntimeEnabled": PetFusionRecipeCatalogModel.runtime_available(
			production_catalog
		),
		"networkRequestCount": int(
			snapshot.get("networkRequestCount", -1)
		),
		"targetName": str(snapshot.get("targetNameText", "")),
		"targetPortraitStatus": str(
			snapshot.get("targetPortraitStatus", "")
		),
		"ownerReviewReady": portrait_ready and errors.is_empty(),
		"errors": errors,
	}
	print("pet fusion closed review capture: %s" % JSON.stringify(report))
	panel.queue_free()
	await process_frame
	quit(0 if errors.is_empty() else 1)


func _capture_complete_image(panel: Control) -> Image:
	for _attempt in range(8):
		panel.queue_redraw()
		await process_frame
		await RenderingServer.frame_post_draw
		var image: Image = root.get_texture().get_image()
		if (
			image == null
			or image.get_width() != VIEWPORT_SIZE.x
			or image.get_height() != VIEWPORT_SIZE.y
		):
			continue
		var sample_points: Array[Vector2i] = [
			Vector2i(image.get_width() / 10, image.get_height() / 7),
			Vector2i(image.get_width() / 2, image.get_height() / 7),
			Vector2i(image.get_width() * 9 / 10, image.get_height() / 7),
			Vector2i(image.get_width() / 10, image.get_height() * 6 / 7),
			Vector2i(image.get_width() / 2, image.get_height() / 2),
			Vector2i(image.get_width() * 9 / 10, image.get_height() * 6 / 7),
		]
		var complete_samples := 0
		for point in sample_points:
			var sample := image.get_pixel(point.x, point.y)
			if sample.r + sample.g + sample.b > 0.05:
				complete_samples += 1
		if complete_samples >= 5:
			return image
	return null


func _append_state_errors(
	state: String,
	panel: Control,
	snapshot: Dictionary,
	candidate_count: int,
	errors: Array[String]
) -> void:
	for layout_error in PetFusionPanelCheck.layout_errors(panel):
		errors.append("1280x720布局：%s" % layout_error)
	if int(snapshot.get("networkRequestCount", -1)) != 0:
		errors.append("融合取证发生了网络请求")
	if state == "closed":
		if str(snapshot.get("messageText", "")) != (
			PetFusionSelectionModel.CLOSED_MESSAGE
		):
			errors.append("关闭态没有显示精确文案")
		if (
			int(snapshot.get("materialDisabledCount", 0)) != 3
			or int(snapshot.get("candidateDisabledCount", 0))
				!= candidate_count
			or not bool(snapshot.get("confirmDisabled", false))
		):
			errors.append("关闭态材料、候选或确认没有全部禁用")
		return
	if (
		bool(snapshot.get("closed", true))
		or not bool(snapshot.get("quoteValid", false))
	):
		errors.append("隔离预览没有呈现有效融合报价")
	if str(snapshot.get("targetPortraitStatus", "")) not in [
		"formal",
		"qa_placeholder",
	]:
		errors.append("目标画像既非正式目录画像，也非明确隔离占位")
	var authority_text := str(snapshot.get("authorityText", ""))
	if (
		not authority_text.contains("服务器")
		or not authority_text.contains("最终结果")
		or not str(snapshot.get("visibleText", "")).contains(authority_text)
	):
		errors.append("隔离预览画面没有说明服务器最终权威")
	if state == "preview" and bool(
		snapshot.get("confirmationArmed", true)
	):
		errors.append("预览态不应提前进入二次确认")
	if state == "armed" and not bool(
		snapshot.get("confirmationArmed", false)
	):
		errors.append("确认取证没有停在第二次点击前")


func _append_player_text_errors(
	visible_text: String,
	raw_tokens,
	errors: Array[String]
) -> void:
	if visible_text.contains("QA") or visible_text.to_lower().contains("debug"):
		errors.append("玩家画面泄露测试术语")
	if raw_tokens is Array:
		for raw_token_value in raw_tokens as Array:
			var raw_token := str(raw_token_value)
			if raw_token != "" and visible_text.contains(raw_token):
				errors.append("玩家画面泄露内部标识")
				return


func _options_from_args(
	args: PackedStringArray,
	errors: Array[String]
) -> Dictionary:
	var options := {
		"state": "closed",
		"route": "solar",
		"output": DEFAULT_OUTPUT,
	}
	for raw_arg in args:
		var arg := str(raw_arg).strip_edges()
		if arg.begins_with("--state="):
			options["state"] = arg.trim_prefix("--state=").strip_edges()
		elif arg.begins_with("--route="):
			options["route"] = arg.trim_prefix("--route=").strip_edges()
		elif arg.begins_with("--output="):
			options["output"] = arg.trim_prefix("--output=").strip_edges()
		elif arg != "":
			errors.append("不支持的融合取证参数：%s" % arg)
	if str(options.get("state", "")) not in VALID_STATES:
		errors.append("--state 仅允许 closed、preview 或 armed")
	if str(options.get("route", "")) not in VALID_ROUTES:
		errors.append("--route 仅允许 solar 或 moss")
	if str(options.get("output", "")).strip_edges() == "":
		errors.append("--output 不能为空")
	return options


func _absolute_path(path: String) -> String:
	if path.is_absolute_path():
		return path.simplify_path()
	return ProjectSettings.globalize_path(path).simplify_path()
