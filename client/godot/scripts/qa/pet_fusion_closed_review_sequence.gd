extends SceneTree

## Visible, QA-only owner-review sequence for the first two formal fusion routes.
##
## This script is intentionally a standalone `--script` entry.  It never wires
## the fusion panel into Main, never opens the production runtime switch, and
## never owns a network client.  The companion Python recorder launches it with
## a fresh process-local user-data root, Metal, 1280x720, fixed 30 fps and time
## scale 1.0.

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
const PetPortraitArtCatalog := preload(
	"res://scripts/ui/pet_portrait_art_catalog.gd"
)

const VIEWPORT_SIZE := Vector2i(1280, 720)
const CAPTURE_FPS := 30
const PLAYBACK_SPEED := 1.0
const REPORT_TYPE := "beastbound.pet_fusion_closed_owner_review_sequence"
const REPORT_SCHEMA_VERSION := 1
const DEFAULT_REPORT := "user://pet-fusion-closed-review-sequence.json"
const ROUTE_TARGETS := {
	"solar": {
		"formId": "emberhorn_fusion_solar_crown_fire7_wind3",
		"name": "曜冠角兽",
	},
	"moss": {
		"formId": "emberhorn_fusion_moss_rampart_fire4_earth6",
		"name": "苔垒角兽",
	},
}

# Deliberately spacious 1x holds: the reviewer can read each route and the
# changed double-confirmation button without the accelerated-cut problem.
const CHAPTER_SPECS: Array[Dictionary] = [
	{
		"id": "closed_open",
		"state": "closed",
		"route": "solar",
		"frames": 120,
	},
	{
		"id": "solar_preview",
		"state": "preview",
		"route": "solar",
		"frames": 180,
	},
	{
		"id": "solar_armed",
		"state": "armed",
		"route": "solar",
		"frames": 150,
	},
	{
		"id": "moss_preview",
		"state": "preview",
		"route": "moss",
		"frames": 180,
	},
	{
		"id": "moss_armed",
		"state": "armed",
		"route": "moss",
		"frames": 150,
	},
	{
		"id": "closed_final",
		"state": "closed",
		"route": "solar",
		"frames": 120,
	},
]

var _errors: Array[String] = []
var _chapters: Array[Dictionary] = []
var _panel: Control
var _production_catalog: Dictionary = {}
var _current_frame := 0
var _report_path := DEFAULT_REPORT
var _expected_user_data_root := ""


func _initialize() -> void:
	# `_run` reaches its first frame wait only after the first closed chapter is
	# fully configured, so MovieWriter cannot capture a route-preflight frame.
	_run()


func _run() -> void:
	var options := _options_from_args(
		OS.get_cmdline_user_args(),
		_errors
	)
	_report_path = str(options.get("report", DEFAULT_REPORT))
	_expected_user_data_root = str(
		options.get("expectedUserDataRoot", "")
	)
	_configure_viewport()
	BalanceCatalogModel.reload()
	_production_catalog = BalanceCatalogModel.pet_fusion_recipes()
	_append_production_boundary_errors()

	_panel = PetFusionPanel.new()
	root.add_child(_panel)
	_append_formal_portrait_preflight_errors()
	if not _errors.is_empty():
		_finish(false)
		return

	for chapter_spec in CHAPTER_SPECS:
		var snapshot := _configure_chapter(chapter_spec)
		var chapter_errors: Array[String] = []
		_append_snapshot_errors(chapter_spec, snapshot, chapter_errors)
		_errors.append_array(chapter_errors)
		var frame_count := int(chapter_spec.get("frames", 0))
		var start_frame := _current_frame
		var end_frame := start_frame + frame_count
		var terminal_movie_frame_count := (
			1
			if str(chapter_spec.get("id", "")) == "closed_final"
			else 0
		)
		# Godot MovieWriter emits one shutdown frame after SceneTree.quit().
		# The recorder does not trust this declaration alone: it decodes all
		# 900 raw frames and requires frames 780..899 to share the exact
		# closed-final RGBA SHA-256 signature.
		var post_draw_frame_count := (
			frame_count - terminal_movie_frame_count
		)
		_chapters.append({
			"id": str(chapter_spec.get("id", "")),
			"state": str(chapter_spec.get("state", "")),
			"route": str(chapter_spec.get("route", "")),
			"startFrame": start_frame,
			"endFrameExclusive": end_frame,
			"frameCount": frame_count,
			"postDrawFrameCount": post_draw_frame_count,
			"movieWriterTerminalFrameCount": (
				terminal_movie_frame_count
			),
			"startTimeSeconds": float(start_frame) / float(CAPTURE_FPS),
			"centerTimeSeconds": (
				float(start_frame + frame_count / 2) / float(CAPTURE_FPS)
			),
			"endTimeSeconds": float(end_frame) / float(CAPTURE_FPS),
			"snapshot": _report_snapshot(snapshot),
			"errors": chapter_errors,
		})
		for _frame_index in range(post_draw_frame_count):
			await process_frame
			# `process_frame` resumes before this frame is drawn.  Count the
			# chapter frame only after the visible Metal viewport completed its
			# draw, otherwise the next chapter could steal the boundary frame.
			await RenderingServer.frame_post_draw
			_current_frame += 1

	_finish(_errors.is_empty())


func _configure_viewport() -> void:
	root.size = VIEWPORT_SIZE
	root.content_scale_size = VIEWPORT_SIZE
	root.content_scale_mode = Window.CONTENT_SCALE_MODE_CANVAS_ITEMS
	root.content_scale_aspect = Window.CONTENT_SCALE_ASPECT_IGNORE


func _append_production_boundary_errors() -> void:
	if PetFusionRecipeCatalogModel.runtime_available(_production_catalog):
		_errors.append("生产融合目录必须保持关闭")
	if str(_production_catalog.get("disabledMessage", "")) != (
		PetFusionSelectionModel.CLOSED_MESSAGE
	):
		_errors.append("生产融合目录关闭文案不精确")
	if DisplayServer.get_name().to_lower() != "macos":
		_errors.append("正式录像必须使用可见 macOS DisplayServer")
	if root.mode != Window.MODE_WINDOWED:
		_errors.append("正式录像主窗口不是 windowed 模式")
	if not root.visible:
		_errors.append("正式录像主窗口没有处于可见状态")
	if root.size != VIEWPORT_SIZE:
		_errors.append("正式录像主窗口不是1280x720")
	if absf(Engine.time_scale - PLAYBACK_SPEED) > 0.0001:
		_errors.append("正式录像 Engine.time_scale 必须为1.0")
	var actual_user_data_dir := OS.get_user_data_dir().simplify_path()
	if (
		_expected_user_data_root == ""
		or not actual_user_data_dir.begins_with(
			_expected_user_data_root + "/"
		)
	):
		_errors.append("Godot user:// 没有绑定本次独立取证目录")
	var panel_source := _read_text("res://scripts/ui/pet_fusion_panel.gd")
	for marker in [
		"ServerAuthClientModel",
		"HTTPClient",
		"HTTPRequest",
		"pet_fusion_quote_request",
		"pet_fusion_request",
	]:
		if panel_source.find(marker) >= 0:
			_errors.append("融合面板意外依赖网络实现：%s" % marker)
	var main_source := _read_text("res://scripts/main.gd")
	var coordinator_source := _read_text(
		"res://scripts/ui/panel_flow_coordinator.gd"
	)
	if (
		main_source.find("pet_fusion_panel.gd") >= 0
		or coordinator_source.find("pet_fusion_panel.gd") >= 0
	):
		_errors.append("融合关闭态取证不允许打开正常玩家入口")


func _append_formal_portrait_preflight_errors() -> void:
	for route_key in ["solar", "moss"]:
		var fixture := PetFusionPanelCheck.preview_fixture(route_key)
		var candidates: Array[Dictionary] = fixture.get("candidates", [])
		var configured := bool(_panel.call(
			"configure_qa_preview",
			PetFusionPanel.QA_PREVIEW_TOKEN,
			fixture.get("catalog", {}),
			fixture.get("selections", {}),
			fixture.get("quote", {}),
			candidates
		))
		var snapshot := _panel.call("snapshot") as Dictionary
		if not configured:
			_errors.append("%s 路线隔离预览装载失败" % route_key)
		if str(snapshot.get("targetPortraitStatus", "")) != "formal":
			_errors.append("%s 路线正式目标大头照尚未落盘" % route_key)
		if int(snapshot.get("candidatePlaceholderCount", -1)) != 0:
			_errors.append("%s 路线仍有候选宠大头照占位" % route_key)
		if int(snapshot.get("candidateFormalPortraitCount", -1)) != (
			candidates.size()
		):
			_errors.append("%s 路线候选宠未全部使用正式大头照" % route_key)
		if int(snapshot.get("networkRequestCount", -1)) != 0:
			_errors.append("%s 路线画像预检发生网络请求" % route_key)
	_panel.call(
		"configure_closed",
		_production_catalog,
		(PetFusionPanelCheck.preview_fixture("solar")).get(
			"candidates",
			[]
		)
	)


func _configure_chapter(chapter_spec: Dictionary) -> Dictionary:
	var state := str(chapter_spec.get("state", ""))
	var route_key := str(chapter_spec.get("route", ""))
	var fixture := PetFusionPanelCheck.preview_fixture(route_key)
	var candidates: Array[Dictionary] = fixture.get("candidates", [])
	if state == "closed":
		_panel.call(
			"configure_closed",
			_production_catalog,
			candidates
		)
	else:
		var configured := bool(_panel.call(
			"configure_qa_preview",
			PetFusionPanel.QA_PREVIEW_TOKEN,
			fixture.get("catalog", {}),
			fixture.get("selections", {}),
			fixture.get("quote", {}),
			candidates
		))
		if not configured:
			_errors.append(
				"%s 章节隔离路线装载失败"
				% str(chapter_spec.get("id", ""))
			)
		if state == "armed":
			# Exactly one local click.  Never invoke the second confirmation.
			_panel.call("_confirm_pressed")
	_panel.queue_redraw()
	var snapshot := _panel.call("snapshot") as Dictionary
	if state == "closed":
		# "目标待开放" is generic closed-state copy, not a target identity.
		# Keep the evidence field empty just like formId and portrait path so
		# the report cannot imply that either frozen route is selected.
		snapshot["targetNameText"] = ""
		snapshot["targetFormId"] = ""
		snapshot["targetPortraitResourcePath"] = ""
	else:
		var quote := fixture.get("quote", {}) as Dictionary
		var result := quote.get("result", {}) as Dictionary
		snapshot["targetFormId"] = str(
			result.get("targetFormId", "")
		)
		snapshot["targetPortraitResourcePath"] = (
			_target_portrait_resource_path()
		)
	return snapshot


func _append_snapshot_errors(
	chapter_spec: Dictionary,
	snapshot: Dictionary,
	errors: Array[String]
) -> void:
	var state := str(chapter_spec.get("state", ""))
	var fixture := PetFusionPanelCheck.preview_fixture(
		str(chapter_spec.get("route", ""))
	)
	var route_key := str(chapter_spec.get("route", ""))
	var route_target := ROUTE_TARGETS.get(route_key, {}) as Dictionary
	var candidates: Array[Dictionary] = fixture.get("candidates", [])
	if int(snapshot.get("networkRequestCount", -1)) != 0:
		errors.append("章节发生网络请求")
	if int(snapshot.get("secondConfirmationCount", -1)) != 0:
		errors.append("章节越过了第二次确认边界")
	if state == "closed":
		if not bool(snapshot.get("closed", false)):
			errors.append("关闭章节没有保持关闭态")
		if str(snapshot.get("messageText", "")) != (
			PetFusionSelectionModel.CLOSED_MESSAGE
		):
			errors.append("关闭章节文案不精确")
		if (
			int(snapshot.get("materialDisabledCount", -1)) != 3
			or int(snapshot.get("candidateDisabledCount", -1))
				!= candidates.size()
			or not bool(snapshot.get("confirmDisabled", false))
		):
			errors.append("关闭章节仍存在可操作控件")
		return

	if (
		bool(snapshot.get("closed", true))
		or not bool(snapshot.get("quoteValid", false))
	):
		errors.append("路线章节没有形成有效本地预览")
	if str(snapshot.get("targetPortraitStatus", "")) != "formal":
		errors.append("路线章节没有使用正式目标大头照")
	var quote := fixture.get("quote", {}) as Dictionary
	var result := quote.get("result", {}) as Dictionary
	var expected_form_id := str(route_target.get("formId", ""))
	var expected_name := str(route_target.get("name", ""))
	var expected_portrait_path := (
		PetPortraitArtCatalog.resource_path_for_form(expected_form_id)
	)
	if (
		expected_form_id == ""
		or str(result.get("targetFormId", "")) != expected_form_id
		or str(snapshot.get("targetFormId", "")) != expected_form_id
	):
		errors.append("路线章节目标形态不是冻结目标")
	if (
		expected_name == ""
		or str(result.get("targetFormName", "")) != expected_name
		or str(snapshot.get("targetNameText", "")) != expected_name
	):
		errors.append("路线章节目标名称不是冻结目标")
	if (
		expected_portrait_path == ""
		or str(snapshot.get("targetPortraitResourcePath", ""))
			!= expected_portrait_path
	):
		errors.append("路线章节正式画像没有绑定冻结目标形态")
	if int(snapshot.get("candidatePlaceholderCount", -1)) != 0:
		errors.append("路线章节仍显示候选宠占位图")
	if state == "preview":
		if bool(snapshot.get("confirmationArmed", true)):
			errors.append("路线预览章节提前进入二次确认")
		if bool(snapshot.get("confirmDisabled", true)):
			errors.append("路线预览章节首次确认不可用")
	elif state == "armed":
		if not bool(snapshot.get("confirmationArmed", false)):
			errors.append("第一次确认后没有停在二次确认前")
		if bool(snapshot.get("confirmDisabled", true)):
			errors.append("二次确认按钮不应在取证停点被禁用")

	var visible_text := str(snapshot.get("visibleText", ""))
	if (
		visible_text.contains("QA")
		or visible_text.to_lower().contains("debug")
	):
		errors.append("玩家画面泄露测试术语")
	var raw_tokens = fixture.get("rawTokens", [])
	if raw_tokens is Array:
		for raw_token_value in raw_tokens as Array:
			var raw_token := str(raw_token_value)
			if raw_token != "" and visible_text.contains(raw_token):
				errors.append("玩家画面泄露内部标识")
				break


func _report_snapshot(snapshot: Dictionary) -> Dictionary:
	return {
		"closed": bool(snapshot.get("closed", true)),
		"messageText": str(snapshot.get("messageText", "")),
		"targetName": str(snapshot.get("targetNameText", "")),
		"targetFormId": str(snapshot.get("targetFormId", "")),
		"targetPortraitResourcePath": str(
			snapshot.get("targetPortraitResourcePath", "")
		),
		"targetPortraitStatus": str(
			snapshot.get("targetPortraitStatus", "")
		),
		"candidateCount": int(snapshot.get("candidateCount", 0)),
		"candidateFormalPortraitCount": int(
			snapshot.get("candidateFormalPortraitCount", 0)
		),
		"candidatePlaceholderCount": int(
			snapshot.get("candidatePlaceholderCount", 0)
		),
		"quoteValid": bool(snapshot.get("quoteValid", false)),
		"confirmationArmed": bool(
			snapshot.get("confirmationArmed", false)
		),
		"confirmDisabled": bool(snapshot.get("confirmDisabled", true)),
		"buttonText": str(snapshot.get("buttonText", "")),
		"secondConfirmationCount": int(
			snapshot.get("secondConfirmationCount", -1)
		),
		"networkRequestCount": int(
			snapshot.get("networkRequestCount", -1)
		),
	}


func _target_portrait_resource_path() -> String:
	if _panel == null:
		return ""
	var portrait := _panel.get_node_or_null(
		"TargetPortraitFrame/TargetPortrait"
	) as TextureRect
	if portrait == null or portrait.texture == null:
		return ""
	return portrait.texture.resource_path


func _finish(success: bool) -> void:
	var expected_frames := 0
	for chapter_spec in CHAPTER_SPECS:
		expected_frames += int(chapter_spec.get("frames", 0))
	var terminal_movie_frame_count := (
		1
		if success and _current_frame == expected_frames - 1
		else 0
	)
	var actual_user_data_dir := OS.get_user_data_dir().simplify_path()
	var user_data_isolated := (
		_expected_user_data_root != ""
		and actual_user_data_dir.begins_with(
			_expected_user_data_root + "/"
		)
	)
	var report := {
		"schemaVersion": REPORT_SCHEMA_VERSION,
		"reportType": REPORT_TYPE,
		"result": "PASS" if success else "FAIL",
		"viewport": {
			"width": VIEWPORT_SIZE.x,
			"height": VIEWPORT_SIZE.y,
		},
		"displayServer": DisplayServer.get_name(),
		"renderingDriverRequiredByRecorder": "metal",
		"window": {
			"mode": int(root.mode),
			"modeName": (
				"windowed"
				if root.mode == Window.MODE_WINDOWED
				else "other"
			),
			"visible": root.visible,
			"width": root.size.x,
			"height": root.size.y,
		},
		"captureFps": CAPTURE_FPS,
		"playbackSpeed": PLAYBACK_SPEED,
		"expectedFrameCount": expected_frames,
		"postDrawSequenceFrameCount": _current_frame,
		"movieWriterTerminalFrameCount": terminal_movie_frame_count,
		"renderedSequenceFrameCount": (
			_current_frame + terminal_movie_frame_count
		),
		"expectedDurationSeconds": (
			float(expected_frames) / float(CAPTURE_FPS)
		),
		"productionRuntimeEnabled": (
			PetFusionRecipeCatalogModel.runtime_available(
				_production_catalog
			)
		),
		"playerEntryOpened": false,
		"formalPortraitsRequired": true,
		"secondConfirmationExecuted": (
			_second_confirmation_total() > 0
		),
		"networkRequestCount": _network_request_total(),
		"expectedUserDataRoot": _expected_user_data_root,
		"actualUserDataDir": actual_user_data_dir,
		"userDataIsolationVerified": user_data_isolated,
		"normalPlayerUserDataUsed": not user_data_isolated,
		"chapters": _chapters,
		"ownerReviewStatus": "pending",
		"errors": _errors,
	}
	var write_error := _write_report(_report_path, report)
	if write_error != OK:
		push_error(
			"无法写入融合录像序列报告：%s"
			% error_string(write_error)
		)
		success = false
	print(
		"pet fusion closed review sequence: %s"
		% JSON.stringify(report)
	)
	# Do not queue_free the panel before quitting.  MovieWriter emits one
	# shutdown frame, and freeing here would turn frame 899 into the default
	# gray clear color instead of the declared closed-final frame.  This is a
	# disposable standalone QA process, so process exit owns cleanup.
	quit(0 if success else 1)


func _network_request_total() -> int:
	var total := 0
	for chapter in _chapters:
		var snapshot := chapter.get("snapshot", {}) as Dictionary
		total += int(snapshot.get("networkRequestCount", 0))
	return total


func _second_confirmation_total() -> int:
	var total := 0
	for chapter in _chapters:
		var snapshot := chapter.get("snapshot", {}) as Dictionary
		total += int(snapshot.get("secondConfirmationCount", 0))
	return total


func _options_from_args(
	args: PackedStringArray,
	errors: Array[String]
) -> Dictionary:
	var options := {
		"report": DEFAULT_REPORT,
		"expectedUserDataRoot": "",
	}
	for raw_arg in args:
		var arg := str(raw_arg).strip_edges()
		if arg.begins_with("--report="):
			options["report"] = arg.trim_prefix(
				"--report="
			).strip_edges()
		elif arg.begins_with("--expected-user-data-root="):
			options["expectedUserDataRoot"] = arg.trim_prefix(
				"--expected-user-data-root="
			).strip_edges()
		elif arg != "":
			errors.append("不支持的融合录像序列参数：%s" % arg)
	var report_path := str(options.get("report", ""))
	if not report_path.is_absolute_path():
		errors.append("--report 必须是绝对路径")
	else:
		var normalized_report := report_path.simplify_path()
		var evidence_root := ProjectSettings.globalize_path(
			"res://../../.run/evidence"
		).simplify_path()
		if not normalized_report.begins_with(evidence_root + "/"):
			errors.append("--report 必须位于仓库 .run/evidence/ 下")
		options["report"] = normalized_report
	var expected_user_data := str(
		options.get("expectedUserDataRoot", "")
	)
	if not expected_user_data.is_absolute_path():
		errors.append("--expected-user-data-root 必须是绝对路径")
	else:
		var normalized_user_data := expected_user_data.simplify_path()
		var evidence_root := ProjectSettings.globalize_path(
			"res://../../.run/evidence"
		).simplify_path()
		if not normalized_user_data.begins_with(evidence_root + "/"):
			errors.append(
				"--expected-user-data-root 必须位于仓库 "
				+ ".run/evidence/ 下"
			)
		options["expectedUserDataRoot"] = normalized_user_data
	return options


func _write_report(path: String, report: Dictionary) -> Error:
	var make_dir_error := DirAccess.make_dir_recursive_absolute(
		path.get_base_dir()
	)
	if make_dir_error != OK:
		return make_dir_error
	var file := FileAccess.open(path, FileAccess.WRITE)
	if file == null:
		return FileAccess.get_open_error()
	file.store_string(JSON.stringify(report, "\t", false) + "\n")
	file.close()
	return OK


static func _read_text(path: String) -> String:
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		return ""
	return file.get_as_text()
