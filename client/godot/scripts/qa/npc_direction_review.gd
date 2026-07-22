extends Node2D

const NpcArtCatalog := preload("res://scripts/world/npc_art_catalog.gd")
const WorldReviewFrameParity := preload("res://scripts/qa/world_review_frame_parity.gd")
const WorldVisualDirectionContract := preload("res://scripts/world/world_visual_direction_contract.gd")

const REVIEW_WIDTH := 1280
const REVIEW_HEIGHT := 720
const DIRECTION_SECONDS := 1.5
const TOTAL_SECONDS := DIRECTION_SECONDS * 8.0
const GRID_CAPTURE_SECONDS := 0.5
const EXPECTED_FRAME_COUNT := 12
const PARITY_TYPE := "beastbound_npc_direction_review_parity"
const PORTRAIT_STATES: Array[String] = ["neutral", "speaking", "smile", "concerned"]
const DIRECTION_NAMES := {
	"south": "南",
	"southwest": "西南",
	"west": "西",
	"northwest": "西北",
	"north": "北",
	"northeast": "东北",
	"east": "东",
	"southeast": "东南",
}
const DIRECTION_VECTORS := {
	"south": Vector2(0, 1),
	"southwest": Vector2(-0.70710678, 0.70710678),
	"west": Vector2(-1, 0),
	"northwest": Vector2(-0.70710678, -0.70710678),
	"north": Vector2(0, -1),
	"northeast": Vector2(0.70710678, -0.70710678),
	"east": Vector2(1, 0),
	"southeast": Vector2(0.70710678, 0.70710678),
}

var appearance_id: String = ""
var parity_run_id: String = ""
var parity_report_path: String = ""
var capture_path: String = ""
var process_kind: String = ""
var explicit_qa_enable: bool = false
var parity_only_mode: bool = false
var recording_mode: bool = false
var grid_mode: bool = false
var contract_check_mode: bool = false
var qa_preview_owned: bool = false
var elapsed: float = 0.0
var capture_complete: bool = false
var active_direction_index: int = -1
var active_world_sprite: Sprite2D
var active_portrait_sprite: Sprite2D
var active_title: Label
var active_source_label: Label
var grid_sprites: Array[Sprite2D] = []
var parity_records: Array[Dictionary] = []
var appearance_record: Dictionary = {}


func _ready() -> void:
	get_window().size = Vector2i(REVIEW_WIDTH, REVIEW_HEIGHT)
	get_window().content_scale_size = Vector2i(REVIEW_WIDTH, REVIEW_HEIGHT)
	_parse_arguments()
	if contract_check_mode:
		set_process(false)
		_run_contract_check()
		return
	var startup_errors := _startup_argument_errors()
	if not startup_errors.is_empty():
		_fail_startup(startup_errors)
		return
	appearance_record = NpcArtCatalog.appearance_record(appearance_id)
	if appearance_record.is_empty():
		startup_errors.append("未知 NPC appearanceId：%s" % appearance_id)
	elif str(appearance_record.get("mobility", "")) != NpcArtCatalog.STATIC_MOBILITY:
		startup_errors.append("本评审场景只接受静态 NPC idle8：%s" % appearance_id)
	if startup_errors.is_empty():
		qa_preview_owned = NpcArtCatalog.enable_qa_preview_appearance(appearance_id)
		if not qa_preview_owned:
			startup_errors.append("显式 debug QA 候选授权失败：%s" % appearance_id)
	if startup_errors.is_empty():
		_validate_no_runtime_mirroring(startup_errors)
		_validate_review_frames(startup_errors)
	var report_error := _write_parity_report(startup_errors)
	if report_error != "":
		startup_errors.append(report_error)
	if not startup_errors.is_empty():
		_fail_startup(startup_errors)
		return
	if parity_only_mode:
		set_process(false)
		_cleanup_owned_qa_preview()
		print("npc direction review parity passed: appearance=%s frames=%d" % [appearance_id, parity_records.size()])
		get_tree().quit(0)
		return
	if grid_mode:
		_build_grid()
	else:
		_build_cycle()
		_update_cycle()
	queue_redraw()


func _exit_tree() -> void:
	_cleanup_owned_qa_preview()


func _process(delta: float) -> void:
	elapsed += delta
	if grid_mode:
		if capture_path != "" and not capture_complete and elapsed >= GRID_CAPTURE_SECONDS:
			capture_complete = true
			if not _all_review_sprites_safe():
				_fail_runtime("网格捕获前发现 flip_h 或非正缩放")
				return
			var error := get_viewport().get_texture().get_image().save_png(capture_path)
			print("npc direction grid capture: appearance=%s path=%s error=%d" % [appearance_id, capture_path, error])
			get_tree().quit(0 if error == OK else 1)
		return
	if recording_mode and elapsed >= TOTAL_SECONDS:
		get_tree().quit(0)
		return
	_update_cycle()


func _draw() -> void:
	var size := get_viewport_rect().size
	draw_rect(Rect2(Vector2.ZERO, size), Color("183532"), true)
	_draw_isometric_ground(size)
	draw_rect(Rect2(0, 0, size.x, 94), Color(0.02, 0.07, 0.065, 0.96), true)
	if grid_mode:
		_draw_grid_panels()
	else:
		_draw_cycle_panel()


func _parse_arguments() -> void:
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--npc-review-appearance="):
			appearance_id = arg.trim_prefix("--npc-review-appearance=").strip_edges()
		elif arg.begins_with("--npc-review-run-id="):
			parity_run_id = arg.trim_prefix("--npc-review-run-id=").strip_edges()
		elif arg.begins_with("--npc-review-parity-report="):
			parity_report_path = arg.trim_prefix("--npc-review-parity-report=").strip_edges()
		elif arg == "--npc-review-enable-candidate":
			explicit_qa_enable = true
		elif arg == "--npc-review-parity-only":
			parity_only_mode = true
			process_kind = "preflight"
		elif arg == "--record-npc-directions":
			recording_mode = true
			process_kind = "recording"
		elif arg.begins_with("--capture-npc-directions="):
			capture_path = arg.trim_prefix("--capture-npc-directions=").strip_edges()
			grid_mode = true
			process_kind = "grid"
		elif arg == "--npc-review-contract-check":
			contract_check_mode = true


func _startup_argument_errors() -> Array[String]:
	var errors: Array[String] = []
	if not OS.is_debug_build():
		errors.append("NPC 候选评审只允许 Godot debug build")
	if not explicit_qa_enable:
		errors.append("缺少显式 --npc-review-enable-candidate")
	if appearance_id == "" or appearance_id != appearance_id.strip_edges():
		errors.append("缺少 canonical --npc-review-appearance")
	if parity_run_id == "" or parity_run_id != parity_run_id.strip_edges():
		errors.append("缺少 canonical --npc-review-run-id")
	if parity_report_path == "":
		errors.append("缺少 --npc-review-parity-report，禁止生成未冻结证据")
	var mode_count := int(parity_only_mode) + int(recording_mode) + int(grid_mode)
	if mode_count != 1:
		errors.append("必须且只能选择 parity-only、recording 或 grid 一种模式")
	if grid_mode and capture_path == "":
		errors.append("grid 模式缺少捕获路径")
	return errors


func _build_cycle() -> void:
	_add_label("NPC职业原型 / %s / 真八方向静态待机" % _appearance_display_name(), Vector2(42, 20), 29, Color("f4de94"))
	_add_label("实际由 NpcArtCatalog 加载 · 显式 debug QA 候选通道 · 禁止镜像与负缩放", Vector2(43, 59), 16, Color("c8d8cf"))
	active_title = _add_label("", Vector2(443, 111), 28, Color("fff0b2"))
	active_source_label = _add_label("", Vector2(370, 151), 15, Color("b9cbc1"))
	active_world_sprite = _new_sprite(Vector2(610, 420), Vector2(1.58, 1.58))
	active_portrait_sprite = _new_sprite(Vector2(1052, 378), Vector2(0.34, 0.34))
	active_portrait_sprite.texture = NpcArtCatalog.portrait_texture(appearance_id, "neutral")
	_add_label("neutral 人像", Vector2(990, 503), 15, Color("d9c985"))
	for index in range(WorldVisualDirectionContract.DIRECTIONS.size()):
		var x := 34.0 + float(index) * 153.0
		_add_label(
			"%d %s" % [index + 1, DIRECTION_NAMES[WorldVisualDirectionContract.DIRECTIONS[index]]],
			Vector2(x + 37, 655),
			15,
			Color("cfdcd4")
		)


func _build_grid() -> void:
	_add_label("NPC职业原型 / %s / 八方向 idle-1 网格" % _appearance_display_name(), Vector2(42, 20), 29, Color("f4de94"))
	_add_label("八张独立源图均经 NpcArtCatalog 加载；此表只用于可读性与一致性检查", Vector2(43, 59), 16, Color("c8d8cf"))
	for index in range(WorldVisualDirectionContract.DIRECTIONS.size()):
		var direction := WorldVisualDirectionContract.DIRECTIONS[index]
		var rect := _grid_rect(index)
		_add_label(
			"%d  %s" % [index + 1, DIRECTION_NAMES[direction]],
			rect.position + Vector2(17, 12),
			17,
			Color("edd689")
		)
		var sprite := _new_sprite(rect.position + Vector2(rect.size.x * 0.5, 166), Vector2(0.73, 0.73))
		sprite.texture = NpcArtCatalog.world_texture_for_frame(appearance_id, direction, "idle", 1)
		grid_sprites.append(sprite)


func _update_cycle() -> void:
	var next_index := int(floor(elapsed / DIRECTION_SECONDS)) % WorldVisualDirectionContract.DIRECTIONS.size()
	if next_index == active_direction_index:
		return
	active_direction_index = next_index
	var direction := WorldVisualDirectionContract.DIRECTIONS[next_index]
	active_world_sprite.texture = NpcArtCatalog.world_texture_for_frame(appearance_id, direction, "idle", 1)
	active_world_sprite.flip_h = false
	active_title.text = "第 %d / 8 方向：%s · 静态待机" % [next_index + 1, DIRECTION_NAMES[direction]]
	active_source_label.text = "独立 %s / idle-1 源图 · 每向停留 %.1f 秒" % [DIRECTION_NAMES[direction], DIRECTION_SECONDS]
	if not _all_review_sprites_safe():
		_fail_runtime("方向切换时发现 flip_h 或非正缩放")
		return
	queue_redraw()


func _validate_no_runtime_mirroring(errors: Array[String]) -> void:
	var world_value = appearance_record.get("world", {})
	if not (world_value is Dictionary):
		errors.append("NPC world 合同缺失：%s" % appearance_id)
		return
	var mapping_value = (world_value as Dictionary).get("directionMapping", {})
	if not (mapping_value is Dictionary):
		errors.append("NPC directionMapping 缺失：%s" % appearance_id)
		return
	for direction in WorldVisualDirectionContract.DIRECTIONS:
		var entry_value = (mapping_value as Dictionary).get(direction, {})
		if (
			not (entry_value is Dictionary)
			or str((entry_value as Dictionary).get("sourceDirection", "")) != direction
			or bool((entry_value as Dictionary).get("flipH", true))
			or NpcArtCatalog.world_flip_h_for_direction(direction)
		):
			errors.append("NPC 真八向映射含复用或镜像：%s/%s" % [appearance_id, direction])


func _validate_review_frames(errors: Array[String]) -> void:
	for direction in WorldVisualDirectionContract.DIRECTIONS:
		var path := _world_frame_path(direction)
		var texture := NpcArtCatalog.world_texture_for_frame(appearance_id, direction, "idle", 1)
		_append_parity_record("world", direction, path, texture, errors)
	for state in PORTRAIT_STATES:
		var path := _portrait_frame_path(state)
		var texture := NpcArtCatalog.portrait_texture(appearance_id, state)
		_append_parity_record("portrait", state, path, texture, errors)
	if parity_records.size() != EXPECTED_FRAME_COUNT:
		errors.append("NPC 评审必须冻结 8 张世界帧 + 4 张人像，共 12 帧")


func _append_parity_record(
	kind: String,
	slot: String,
	path: String,
	texture,
	startup_errors: Array[String]
) -> void:
	var record := {
		"kind": kind,
		"slot": slot,
		"path": path,
		"status": "failed",
		"errors": [],
		"fileSha256": "",
		"sourceFullDecodedRgbaSha256": "",
		"sourceDecodedRgbaSha256": "",
		"loadedDecodedRgbaSha256": "",
		"sourceLoadedRgbaMatch": false,
		"importFresh": false,
		"loadMode": "",
		"canonicalRgbaMatch": false,
	}
	var frame_errors := record["errors"] as Array
	if not (texture is Texture2D):
		frame_errors.append("NpcArtCatalog 返回空纹理")
		parity_records.append(record)
		startup_errors.append("NPC 评审纹理不可读：%s/%s" % [kind, slot])
		return
	var typed_texture := texture as Texture2D
	var source := Image.load_from_file(ProjectSettings.globalize_path(path))
	var loaded := typed_texture.get_image()
	if source == null or source.is_empty():
		frame_errors.append("当前安装 PNG 无法解码")
	if loaded == null or loaded.is_empty():
		frame_errors.append("Godot 已加载纹理无法解码")
	if frame_errors.is_empty():
		var import_parity := WorldReviewFrameParity.compare_source_and_loaded(path, typed_texture)
		record["fileSha256"] = FileAccess.get_sha256(path)
		record["sourceFullDecodedRgbaSha256"] = _image_rgba_sha256(source)
		record["sourceDecodedRgbaSha256"] = str(import_parity.get("sourceDecodedRgbaSha256", ""))
		record["loadedDecodedRgbaSha256"] = str(import_parity.get("loadedDecodedRgbaSha256", ""))
		record["sourceLoadedRgbaMatch"] = (
			str(record["sourceDecodedRgbaSha256"]) != ""
			and record["sourceDecodedRgbaSha256"] == record["loadedDecodedRgbaSha256"]
		)
		record["importFresh"] = bool(import_parity.get("importFresh", false))
		record["loadMode"] = str(import_parity.get("loadMode", ""))
		record["canonicalRgbaMatch"] = bool(import_parity.get("canonicalRgbaMatch", false))
		for error_value in import_parity.get("errors", []):
			frame_errors.append(str(error_value))
	if frame_errors.is_empty():
		record["status"] = "passed"
	else:
		startup_errors.append("NPC 评审帧校验失败：%s/%s：%s" % [kind, slot, "；".join(frame_errors)])
	parity_records.append(record)


func _write_parity_report(startup_errors: Array[String]) -> String:
	if parity_report_path == "":
		return "缺少像素一致性报告路径"
	var report_directory := parity_report_path.get_base_dir()
	if report_directory != "":
		var directory_error := DirAccess.make_dir_recursive_absolute(report_directory)
		if directory_error != OK:
			return "无法创建像素一致性报告目录：%s error=%d" % [report_directory, directory_error]
	var passed_frames := 0
	for record in parity_records:
		if str(record.get("status", "")) == "passed":
			passed_frames += 1
	var report := {
		"schemaVersion": 1,
		"reportType": PARITY_TYPE,
		"runId": parity_run_id,
		"appearanceId": appearance_id,
		"processKind": process_kind,
		"status": "passed" if startup_errors.is_empty() and parity_records.size() == EXPECTED_FRAME_COUNT else "failed",
		"checkedFrames": parity_records.size(),
		"passedFrames": passed_frames,
		"sourceSetSha256": _source_set_sha256(parity_records),
		"runtimeMirroring": false,
		"errors": startup_errors,
		"frames": parity_records,
	}
	var file := FileAccess.open(parity_report_path, FileAccess.WRITE)
	if file == null:
		return "无法写入像素一致性报告：%s error=%d" % [parity_report_path, FileAccess.get_open_error()]
	file.store_string(JSON.stringify(report, "\t") + "\n")
	file.close()
	print(
		"npc direction parity report: appearance=%s process=%s status=%s frames=%d path=%s" % [
			appearance_id,
			process_kind,
			report["status"],
			parity_records.size(),
			parity_report_path,
		]
	)
	return ""


func _world_frame_path(direction: String) -> String:
	var root := _appearance_resource_root()
	return "%s/world/directions/%s/idle/idle-1.png" % [root, direction]


func _portrait_frame_path(state: String) -> String:
	var root := _appearance_resource_root()
	var portraits_value = appearance_record.get("portraits", {})
	if not (portraits_value is Dictionary):
		return ""
	var states_value = (portraits_value as Dictionary).get("states", {})
	if not (states_value is Dictionary):
		return ""
	return "%s/%s" % [root, str((states_value as Dictionary).get(state, ""))]


func _appearance_resource_root() -> String:
	var asset_root := str(appearance_record.get("assetRoot", ""))
	var prefix := "client/godot/"
	return "res://%s" % asset_root.trim_prefix(prefix) if asset_root.begins_with(prefix) else ""


func _source_set_sha256(records: Array[Dictionary]) -> String:
	var lines: Array[String] = []
	for record in records:
		lines.append("%s\t%s\t%s\t%s\t%s\t%s\n" % [
			str(record.get("kind", "")),
			str(record.get("slot", "")),
			str(record.get("path", "")),
			str(record.get("fileSha256", "")),
			str(record.get("sourceFullDecodedRgbaSha256", "")),
			str(record.get("sourceDecodedRgbaSha256", "")),
		])
	var context := HashingContext.new()
	context.start(HashingContext.HASH_SHA256)
	context.update("".join(lines).to_utf8_buffer())
	return context.finish().hex_encode()


func _image_rgba_sha256(image: Image) -> String:
	var rgba := image.duplicate() as Image
	if rgba.is_compressed():
		rgba.decompress()
	rgba.convert(Image.FORMAT_RGBA8)
	var context := HashingContext.new()
	context.start(HashingContext.HASH_SHA256)
	context.update(("%dx%d:RGBA\n" % [rgba.get_width(), rgba.get_height()]).to_utf8_buffer())
	context.update(rgba.get_data())
	return context.finish().hex_encode()


func _all_review_sprites_safe() -> bool:
	if active_world_sprite != null and not _sprite_is_safe(active_world_sprite):
		return false
	if active_portrait_sprite != null and not _sprite_is_safe(active_portrait_sprite):
		return false
	for sprite in grid_sprites:
		if not _sprite_is_safe(sprite):
			return false
	return true


func _sprite_is_safe(sprite: Sprite2D) -> bool:
	return not sprite.flip_h and sprite.scale.x > 0.0 and sprite.scale.y > 0.0


func _new_sprite(position_value: Vector2, scale_value: Vector2) -> Sprite2D:
	var sprite := Sprite2D.new()
	sprite.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	sprite.position = position_value
	sprite.scale = scale_value
	sprite.flip_h = false
	add_child(sprite)
	return sprite


func _draw_cycle_panel() -> void:
	draw_style_box(_panel_style(), Rect2(245, 178, 705, 430))
	draw_style_box(_panel_style(), Rect2(975, 218, 240, 330))
	var safe_index := maxi(0, active_direction_index)
	var direction := WorldVisualDirectionContract.DIRECTIONS[safe_index]
	_draw_direction_arrow(Vector2(610, 213), direction, 44.0)
	for index in range(WorldVisualDirectionContract.DIRECTIONS.size()):
		var rect := Rect2(34.0 + float(index) * 153.0, 641, 142, 54)
		var active := index == active_direction_index
		draw_rect(rect, Color("8c6a28") if active else Color(0.04, 0.10, 0.09, 0.72), true)
		draw_rect(rect, Color("efce70") if active else Color(0.47, 0.38, 0.18, 0.85), false, 2.0)


func _draw_grid_panels() -> void:
	for index in range(WorldVisualDirectionContract.DIRECTIONS.size()):
		var rect := _grid_rect(index)
		draw_style_box(_panel_style(), rect)
		_draw_direction_arrow(rect.position + Vector2(rect.size.x - 31, 30), WorldVisualDirectionContract.DIRECTIONS[index], 18.0)


func _draw_direction_arrow(center: Vector2, direction: String, length: float) -> void:
	var vector := (DIRECTION_VECTORS[direction] as Vector2).normalized()
	var start := center - vector * length * 0.45
	var finish := center + vector * length * 0.55
	var color := Color("f2d46e")
	draw_line(start, finish, color, 3.0, true)
	var perpendicular := Vector2(-vector.y, vector.x)
	draw_colored_polygon(PackedVector2Array([
		finish,
		finish - vector * 10.0 + perpendicular * 6.0,
		finish - vector * 10.0 - perpendicular * 6.0,
	]), color)


func _draw_isometric_ground(size: Vector2) -> void:
	var line_color := Color(0.55, 0.65, 0.48, 0.08)
	for offset in range(-720, 1500, 64):
		draw_line(Vector2(offset, 94), Vector2(offset + 720, size.y), line_color, 1.0)
		draw_line(Vector2(offset, size.y), Vector2(offset + 720, 94), line_color, 1.0)


func _grid_rect(index: int) -> Rect2:
	var column := index % 4
	var row := int(index / 4)
	return Rect2(20 + column * 315, 106 + row * 298, 295, 278)


func _panel_style() -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.035, 0.085, 0.08, 0.58)
	style.border_color = Color(0.70, 0.51, 0.19, 0.80)
	style.set_border_width_all(2)
	style.set_corner_radius_all(13)
	return style


func _add_label(text_value: String, position_value: Vector2, font_size: int, color: Color) -> Label:
	var label := Label.new()
	label.text = text_value
	label.position = position_value
	label.add_theme_font_size_override("font_size", font_size)
	label.add_theme_color_override("font_color", color)
	add_child(label)
	return label


func _appearance_display_name() -> String:
	return str(appearance_record.get("displayName", appearance_id))


func _run_contract_check() -> void:
	var errors: Array[String] = []
	if REVIEW_WIDTH != 1280 or REVIEW_HEIGHT != 720:
		errors.append("NPC 方向评审必须保持 1280x720")
	if not is_equal_approx(DIRECTION_SECONDS, 1.5):
		errors.append("静态 NPC 每方向必须清楚停留 1.5 秒")
	if not is_equal_approx(TOTAL_SECONDS, 12.0):
		errors.append("静态 NPC 八方向完整循环必须为 12 秒")
	if WorldVisualDirectionContract.DIRECTIONS.size() != 8:
		errors.append("NPC 方向评审必须覆盖 canonical 八向")
	if EXPECTED_FRAME_COUNT != 12:
		errors.append("NPC parity 必须冻结 8 世界帧 + 4 人像")
	if not OS.is_debug_build():
		errors.append("NPC 方向评审 contract check 只允许 debug build")
	if errors.is_empty():
		print("npc direction review contract check passed: size=1280x720 hold=1.5s total=12.0s parity=12")
		get_tree().quit(0)
		return
	for error in errors:
		push_error(error)
	get_tree().quit(1)


func _fail_startup(errors: Array[String]) -> void:
	set_process(false)
	for error in errors:
		push_error("npc direction review fail closed: %s" % error)
	_cleanup_owned_qa_preview()
	get_tree().quit(1)


func _fail_runtime(message: String) -> void:
	set_process(false)
	push_error("npc direction review runtime fail closed: %s" % message)
	_cleanup_owned_qa_preview()
	get_tree().quit(1)


func _cleanup_owned_qa_preview() -> void:
	if not qa_preview_owned:
		return
	NpcArtCatalog.disable_qa_preview_appearance(appearance_id)
	qa_preview_owned = false
	print("npc direction review QA candidate preview cleaned: appearance=%s" % appearance_id)
