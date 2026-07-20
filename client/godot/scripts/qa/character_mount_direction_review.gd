extends Node2D

const CharacterActionAssetCatalog := preload("res://scripts/player/character_action_asset_catalog.gd")
const MountedCharacter2D := preload("res://scripts/player/mounted_character_2d.gd")
const MountedCharacterAssetCatalog := preload("res://scripts/player/mounted_character_asset_catalog.gd")
const MountVisualProfileCatalog := preload("res://scripts/player/mount_visual_profile_catalog.gd")
const PetActionAssetCatalog := preload("res://scripts/pet/pet_action_asset_catalog.gd")
const PetTemplateCatalog := preload("res://scripts/battle/pet_template_catalog.gd")
const WorldReviewFrameParity := preload("res://scripts/qa/world_review_frame_parity.gd")

const FORM_ID := "bui_novice_sprout_earth5_wind5"
const DIRECTIONS: Array[String] = [
	"south",
	"southwest",
	"west",
	"northwest",
	"north",
	"northeast",
	"east",
	"southeast",
]
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
	"southwest": Vector2(-0.707, 0.707),
	"west": Vector2(-1, 0),
	"northwest": Vector2(-0.707, -0.707),
	"north": Vector2(0, -1),
	"northeast": Vector2(0.707, -0.707),
	"east": Vector2(1, 0),
	"southeast": Vector2(0.707, 0.707),
}
const DIRECTION_SECONDS := 1.8
const IDLE_SECONDS := 0.6
const GRID_CAPTURE_SECONDS := 0.75
const ACTION_NAMES := {
	"idle": "待机",
	"walk": "行走",
}

var elapsed: float = 0.0
var form_id: String = FORM_ID
var grid_mode: bool = true
var recording_mode: bool = false
var timing_check_mode: bool = false
var parity_only_mode: bool = false
var parity_report_path: String = ""
var parity_run_id: String = ""
var capture_path: String = ""
var capture_complete: bool = false
var active_direction_index: int = -1
var active_action: String = ""
var active_character: Sprite2D
var active_pet: Sprite2D
var active_mount: Node2D
var active_title: Label
var active_mapping: Label
var qa_pet_preview_owned: bool = false
var qa_mounted_preview_owned: bool = false
var qa_mount_profile_preview_owned: bool = false
var grid_idle_characters: Array[Sprite2D] = []
var grid_idle_pets: Array[Sprite2D] = []
var grid_idle_mounts: Array[Node2D] = []
var grid_walk_characters: Array[Sprite2D] = []
var grid_walk_pets: Array[Sprite2D] = []
var grid_walk_mounts: Array[Node2D] = []
var parity_records: Array[Dictionary] = []


func _ready() -> void:
	get_window().size = Vector2i(1280, 720)
	get_window().content_scale_size = Vector2i(1280, 720)
	var startup_errors: Array[String] = []
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--mount-review-form="):
			var requested_form_id := arg.trim_prefix("--mount-review-form=").strip_edges()
			if not PetTemplateCatalog.form_by_id(requested_form_id).is_empty():
				form_id = requested_form_id
			else:
				startup_errors.append("未知宠物形态：%s" % requested_form_id)
		elif arg == "--record-mount-directions":
			recording_mode = true
			grid_mode = false
		elif arg.begins_with("--capture-mount-directions="):
			capture_path = arg.trim_prefix("--capture-mount-directions=").strip_edges()
			grid_mode = true
		elif arg == "--mount-review-timing-check":
			timing_check_mode = true
		elif arg == "--mount-review-parity-only":
			parity_only_mode = true
		elif arg.begins_with("--mount-review-parity-report="):
			parity_report_path = arg.trim_prefix("--mount-review-parity-report=").strip_edges()
		elif arg.begins_with("--mount-review-run-id="):
			parity_run_id = arg.trim_prefix("--mount-review-run-id=").strip_edges()
	if timing_check_mode:
		set_process(false)
		_run_timing_check()
		return
	if not startup_errors.is_empty():
		_fail_startup(startup_errors)
		return
	startup_errors = _prepare_review_assets()
	var report_error := _write_parity_report(startup_errors)
	if report_error != "":
		startup_errors.append(report_error)
	if not startup_errors.is_empty():
		_fail_startup(startup_errors)
		return
	if parity_only_mode:
		set_process(false)
		_cleanup_owned_qa_preview()
		print("mount direction review parity passed: form=%s frames=%d" % [form_id, parity_records.size()])
		get_tree().quit(0)
		return
	if grid_mode:
		_build_grid()
	else:
		_build_cycle()
	queue_redraw()


func _exit_tree() -> void:
	_cleanup_owned_qa_preview()


func _process(delta: float) -> void:
	elapsed += delta
	if grid_mode:
		_update_grid()
		if capture_path != "" and not capture_complete and elapsed >= GRID_CAPTURE_SECONDS:
			capture_complete = true
			var error := get_viewport().get_texture().get_image().save_png(capture_path)
			print("true eight direction grid capture: path=%s error=%d" % [capture_path, error])
			get_tree().quit(0 if error == OK else 1)
		return
	_update_cycle()
	if recording_mode and elapsed >= DIRECTION_SECONDS * float(DIRECTIONS.size()):
		get_tree().quit(0)


func _draw() -> void:
	var size := get_viewport_rect().size
	draw_rect(Rect2(Vector2.ZERO, size), Color("203a36"), true)
	_draw_isometric_ground(size)
	draw_rect(Rect2(0, 0, size.x, 92), Color(0.035, 0.09, 0.085, 0.92), true)
	if grid_mode:
		_draw_grid_panels()
	else:
		_draw_cycle_panels()


func _build_grid() -> void:
	_add_label("人物 / %s / 人骑宠 · 真八方向视觉验收" % _form_display_name(), Vector2(42, 20), 29, Color("f4de94"))
	_add_label("每格同时展示固定待机与动态行走；独立八向源图，不做水平镜像", Vector2(43, 58), 16, Color("c8d8cf"))
	for index in range(DIRECTIONS.size()):
		var direction := DIRECTIONS[index]
		var rect := _grid_rect(index)
		_add_label(
			"%d  %s · 独立源图" % [index + 1, DIRECTION_NAMES[direction]],
			rect.position + Vector2(15, 10),
			15,
			Color("edd689")
		)
		_add_label("人物", rect.position + Vector2(43, 40), 13, Color("b9cbc1"))
		_add_label("宠物", rect.position + Vector2(131, 40), 13, Color("b9cbc1"))
		_add_label("人骑宠", rect.position + Vector2(216, 40), 13, Color("b9cbc1"))
		_add_label("待", rect.position + Vector2(10, 90), 12, Color("edd689"))
		_add_label("走", rect.position + Vector2(10, 201), 12, Color("8fdcc2"))
		# 地图中徒步人物和整体骑乘图使用同一展示比例；战斗比例由战斗配置独立决定。
		grid_idle_characters.append(_character_sprite(rect.position + Vector2(58, 151), 0.19))
		grid_idle_pets.append(_pet_sprite(rect.position + Vector2(145, 149), 0.19))
		grid_idle_mounts.append(_mounted_character(rect.position + Vector2(238, 154), direction, 0.19, "idle"))
		grid_walk_characters.append(_character_sprite(rect.position + Vector2(58, 248), 0.19))
		grid_walk_pets.append(_pet_sprite(rect.position + Vector2(145, 246), 0.19))
		grid_walk_mounts.append(_mounted_character(rect.position + Vector2(238, 251), direction, 0.19, "walk"))


func _build_cycle() -> void:
	_add_label("人物 / %s / 人骑宠 · 真八方向逐项录像" % _form_display_name(), Vector2(42, 20), 29, Color("f4de94"))
	_add_label("独立八向源图 · 无运行时镜像 · 骑手、坐骑与运动轴必须一致", Vector2(43, 58), 16, Color("c8d8cf"))
	_add_label("人物", Vector2(190, 126), 23, Color("e8d58f"))
	_add_label("宠物", Vector2(596, 126), 23, Color("e8d58f"))
	_add_label("人骑宠", Vector2(994, 126), 23, Color("e8d58f"))
	active_title = _add_label("", Vector2(520, 98), 26, Color("fff0b2"))
	active_mapping = _add_label("", Vector2(519, 158), 15, Color("b9cbc1"))
	active_character = _character_sprite(Vector2(214, 475), 0.72)
	active_pet = _pet_sprite(Vector2(624, 477), 0.72)
	active_mount = _mounted_character(Vector2(1031, 489), DIRECTIONS[0], 0.72, "idle")
	for index in range(DIRECTIONS.size()):
		var x := 34.0 + float(index) * 153.0
		_add_label("%d %s" % [index + 1, DIRECTION_NAMES[DIRECTIONS[index]]], Vector2(x + 37, 655), 15, Color("cfdcd4"))


func _update_grid() -> void:
	for index in range(DIRECTIONS.size()):
		var direction := DIRECTIONS[index]
		_update_character(grid_idle_characters[index], direction, "idle", 0.0)
		_update_pet(grid_idle_pets[index], direction, "idle", 0.0)
		grid_idle_mounts[index].call("set_visual_state", direction, "idle", 0.0)
		_update_character(grid_walk_characters[index], direction, "walk", elapsed)
		_update_pet(grid_walk_pets[index], direction, "walk", elapsed)
		grid_walk_mounts[index].call("set_visual_state", direction, "walk", elapsed)


func _update_cycle() -> void:
	var next_index := mini(DIRECTIONS.size() - 1, int(floor(elapsed / DIRECTION_SECONDS)))
	var direction := DIRECTIONS[next_index]
	var local_elapsed := fmod(elapsed, DIRECTION_SECONDS)
	var next_action := _action_for_local_elapsed(local_elapsed)
	if next_index != active_direction_index or next_action != active_action:
		active_direction_index = next_index
		active_action = next_action
		active_title.text = "第 %d / 8 方向：%s · %s" % [
			next_index + 1,
			DIRECTION_NAMES[direction],
			ACTION_NAMES[next_action],
		]
		active_mapping.text = "人物、宠物、骑乘均为 %s 独立 %s 源图（当前：%s）" % [
			DIRECTION_NAMES[direction],
			next_action,
			ACTION_NAMES[next_action],
		]
		queue_redraw()
	var action_elapsed := _action_elapsed(local_elapsed)
	_update_character(active_character, direction, next_action, action_elapsed)
	_update_pet(active_pet, direction, next_action, action_elapsed)
	active_mount.call("set_visual_state", direction, next_action, action_elapsed)


func _update_character(sprite: Sprite2D, direction: String, action: String, animation_elapsed: float) -> void:
	sprite.flip_h = false
	sprite.texture = CharacterActionAssetCatalog.world_texture_for_elapsed(direction, action, animation_elapsed)


func _update_pet(sprite: Sprite2D, direction: String, action: String, animation_elapsed: float) -> void:
	sprite.flip_h = false
	sprite.texture = PetActionAssetCatalog.world_texture_for_elapsed(form_id, direction, action, animation_elapsed)


func _character_sprite(position_value: Vector2, scale_value: float) -> Sprite2D:
	var sprite := Sprite2D.new()
	sprite.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	sprite.position = position_value
	sprite.scale = Vector2(scale_value, scale_value)
	add_child(sprite)
	return sprite


func _pet_sprite(position_value: Vector2, scale_value: float) -> Sprite2D:
	return _character_sprite(position_value, scale_value)


func _mounted_character(
	position_value: Vector2,
	direction: String,
	scale_value: float,
	initial_action: String = "idle"
) -> Node2D:
	var mounted := Node2D.new()
	mounted.set_script(MountedCharacter2D)
	mounted.position = position_value
	add_child(mounted)
	mounted.call("set_mount_form", form_id)
	mounted.call("set_presentation_scale", scale_value)
	mounted.call("set_visual_state", direction, initial_action, 0.0)
	return mounted


func _action_for_local_elapsed(local_elapsed: float) -> String:
	return "idle" if local_elapsed < IDLE_SECONDS else "walk"


func _action_elapsed(local_elapsed: float) -> float:
	return 0.0 if local_elapsed < IDLE_SECONDS else local_elapsed - IDLE_SECONDS


func _run_timing_check() -> void:
	var errors: Array[String] = []
	if not is_equal_approx(DIRECTION_SECONDS, 1.8):
		errors.append("每方向时长必须保持 1.8 秒")
	if IDLE_SECONDS < 0.55 or IDLE_SECONDS > 0.65:
		errors.append("待机展示必须保持在 0.55 到 0.65 秒")
	if _action_for_local_elapsed(0.0) != "idle" or _action_for_local_elapsed(IDLE_SECONDS - 0.001) != "idle":
		errors.append("方向开头没有完整进入待机段")
	if _action_for_local_elapsed(IDLE_SECONDS) != "walk" or _action_for_local_elapsed(DIRECTION_SECONDS - 0.001) != "walk":
		errors.append("待机段结束后没有持续进入行走段")
	if not is_zero_approx(_action_elapsed(IDLE_SECONDS)):
		errors.append("行走动画没有在切换点从首帧开始")
	var walk_seconds := DIRECTION_SECONDS - IDLE_SECONDS
	var minimum_full_walk_cycle_seconds := 4.0 / 10.0
	if walk_seconds < minimum_full_walk_cycle_seconds:
		errors.append("行走展示时长不足一个四帧完整循环")
	if not is_equal_approx(DIRECTION_SECONDS * float(DIRECTIONS.size()), 14.4):
		errors.append("八方向录像总时长不再是 14.4 秒")
	if GRID_CAPTURE_SECONDS <= IDLE_SECONDS or GRID_CAPTURE_SECONDS >= DIRECTION_SECONDS:
		errors.append("网格截图时机必须落在动态行走段")
	if errors.is_empty():
		print("mount direction review timing check passed: idle=%.2fs walk=%.2fs total=%.2fs" % [
			IDLE_SECONDS,
			walk_seconds,
			DIRECTION_SECONDS * float(DIRECTIONS.size()),
		])
		get_tree().quit(0)
		return
	for error in errors:
		push_error(error)
	get_tree().quit(1)


func _draw_grid_panels() -> void:
	for index in range(DIRECTIONS.size()):
		var rect := _grid_rect(index)
		draw_style_box(_panel_style(), rect)
		_draw_direction_arrow(rect.position + Vector2(274, 27), DIRECTIONS[index], 17.0)


func _draw_cycle_panels() -> void:
	draw_style_box(_panel_style(), Rect2(34, 177, 365, 430))
	draw_style_box(_panel_style(), Rect2(457, 177, 365, 430))
	draw_style_box(_panel_style(), Rect2(880, 177, 365, 430))
	var direction := DIRECTIONS[maxi(0, active_direction_index)]
	_draw_direction_arrow(Vector2(640, 203), direction, 42.0)
	for index in range(DIRECTIONS.size()):
		var rect := Rect2(34.0 + float(index) * 153.0, 641, 142, 54)
		var active := index == active_direction_index
		draw_rect(rect, Color("8c6a28") if active else Color(0.04, 0.10, 0.09, 0.72), true)
		draw_rect(rect, Color("efce70") if active else Color(0.47, 0.38, 0.18, 0.85), false, 2.0)


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
		draw_line(Vector2(offset, 92), Vector2(offset + 720, size.y), line_color, 1.0)
		draw_line(Vector2(offset, size.y), Vector2(offset + 720, 92), line_color, 1.0)


func _grid_rect(index: int) -> Rect2:
	var column := index % 4
	var row := index / 4
	return Rect2(20 + column * 315, 105 + row * 294, 295, 274)


func _panel_style() -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.035, 0.085, 0.08, 0.54)
	style.border_color = Color(0.70, 0.51, 0.19, 0.78)
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


func _prepare_review_assets() -> Array[String]:
	var errors: Array[String] = []
	if not CharacterActionAssetCatalog.warm():
		errors.append("人物世界八向资产预热失败")
	if not PetActionAssetCatalog.supports_world_form(form_id):
		qa_pet_preview_owned = PetActionAssetCatalog.enable_qa_preview_form(form_id)
		if not qa_pet_preview_owned:
			errors.append("宠物 owner-pending QA 预览授权失败：%s" % form_id)
	var character_id := MountedCharacterAssetCatalog.DEFAULT_CHARACTER_ID
	if not MountedCharacterAssetCatalog.supports_combination(character_id, form_id):
		qa_mounted_preview_owned = MountedCharacterAssetCatalog.enable_qa_preview_combination(character_id, form_id)
		if not qa_mounted_preview_owned:
			errors.append("人骑宠 owner-pending QA 预览授权失败：%s/%s" % [character_id, form_id])
	if not MountVisualProfileCatalog.supports_form(form_id):
		qa_mount_profile_preview_owned = MountVisualProfileCatalog.enable_qa_preview_form(form_id)
		if not qa_mount_profile_preview_owned:
			errors.append("骑乘展示档案 QA 预览授权失败：%s" % form_id)
	if not errors.is_empty():
		return errors
	if not PetActionAssetCatalog.warm_world_form(form_id):
		errors.append("宠物世界八向资产预热失败：%s" % form_id)
	if not MountedCharacterAssetCatalog.warm_world_form(form_id, character_id):
		errors.append("人骑宠世界八向资产预热失败：%s/%s" % [character_id, form_id])
	_validate_review_frames(character_id, errors)
	if qa_pet_preview_owned or qa_mounted_preview_owned or qa_mount_profile_preview_owned:
		print(
			"mount direction review QA owner-pending preview enabled: form=%s pet=%s mounted=%s profile=%s" % [
				form_id,
				qa_pet_preview_owned,
				qa_mounted_preview_owned,
				qa_mount_profile_preview_owned,
			]
		)
	return errors


func _validate_review_frames(character_id: String, errors: Array[String]) -> void:
	var frame_errors := {
		"人物": [],
		"宠物": [],
		"人骑宠": [],
	}
	for direction in DIRECTIONS:
		for action in ["idle", "walk"]:
			var frame_count := 1 if action == "idle" else 4
			for frame_index in range(1, frame_count + 1):
				var character_path := CharacterActionAssetCatalog.world_frame_path(
					direction,
					action,
					frame_index
				)
				_validate_review_texture(
					CharacterActionAssetCatalog.world_texture_for_frame(direction, action, frame_index),
					character_path,
					"人物",
					"character",
					direction,
					action,
					frame_index,
					frame_errors
				)
				var pet_path := PetActionAssetCatalog.world_frame_path_for_form(
					form_id,
					direction,
					action,
					frame_index
				)
				_validate_review_texture(
					PetActionAssetCatalog.world_texture_for_frame(form_id, direction, action, frame_index),
					pet_path,
					"宠物",
					"pet",
					direction,
					action,
					frame_index,
					frame_errors
				)
				var mounted_path := MountedCharacterAssetCatalog.world_frame_path(
					character_id,
					form_id,
					direction,
					action,
					frame_index
				)
				_validate_review_texture(
					MountedCharacterAssetCatalog.world_texture_for_frame(
						character_id,
						form_id,
						direction,
						action,
						frame_index
					),
					mounted_path,
					"人骑宠",
					"mounted",
					direction,
					action,
					frame_index,
					frame_errors
				)
	for column_name_value in frame_errors.keys():
		var column_name := str(column_name_value)
		var issues = frame_errors.get(column_name, [])
		if not (issues is Array) or (issues as Array).is_empty():
			continue
		var typed_issues := issues as Array
		var samples: Array[String] = []
		for index in range(mini(3, typed_issues.size())):
			samples.append(str(typed_issues[index]))
		errors.append(
			"%s世界帧校验失败 %d 项：%s" % [
				column_name,
				typed_issues.size(),
				"；".join(samples),
			]
		)


func _validate_review_texture(
	texture,
	source_path: String,
	column_name: String,
	kind: String,
	direction: String,
	action: String,
	frame_index: int,
	frame_errors: Dictionary
) -> void:
	var frame_label := "%s/%s/%d" % [direction, action, frame_index]
	var record := {
		"kind": kind,
		"path": source_path,
		"direction": direction,
		"action": action,
		"index": frame_index,
		"status": "failed",
	}
	if not (texture is Texture2D):
		_append_frame_error(frame_errors, column_name, "%s 不可读" % frame_label)
		record["errors"] = ["ResourceLoader 纹理不可读"]
		parity_records.append(record)
		return
	var typed_texture := texture as Texture2D
	if typed_texture.get_width() != 256 or typed_texture.get_height() != 256:
		_append_frame_error(
			frame_errors,
			column_name,
			"%s 是 %dx%d" % [
				frame_label,
				typed_texture.get_width(),
				typed_texture.get_height(),
			]
		)
	var parity := WorldReviewFrameParity.compare_source_and_loaded(source_path, typed_texture)
	for key_value in parity.keys():
		record[key_value] = parity[key_value]
	parity_records.append(record)
	if str(parity.get("status", "failed")) != "passed":
		var parity_errors: Array[String] = []
		for value in parity.get("errors", []):
			parity_errors.append(str(value))
		_append_frame_error(
			frame_errors,
			column_name,
			"%s 像素/导入不一致：%s" % [frame_label, "；".join(parity_errors)]
		)


func _write_parity_report(startup_errors: Array[String]) -> String:
	if parity_report_path == "":
		return ""
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
		"runId": parity_run_id,
		"formId": form_id,
		"status": "passed" if startup_errors.is_empty() and parity_records.size() == 120 else "failed",
		"checkedFrames": parity_records.size(),
		"passedFrames": passed_frames,
		"canonicalPartialRgb": "rgb_zeroed_where_alpha_below_255_before_rgba_hash",
		"sourceSetSha256": WorldReviewFrameParity.source_set_sha256(parity_records),
		"errors": startup_errors,
		"frames": parity_records,
	}
	var file := FileAccess.open(parity_report_path, FileAccess.WRITE)
	if file == null:
		return "无法写入像素一致性报告：%s error=%d" % [parity_report_path, FileAccess.get_open_error()]
	file.store_string(JSON.stringify(report, "\t") + "\n")
	file.close()
	print(
		"mount direction review parity report: form=%s status=%s frames=%d path=%s" % [
			form_id,
			report["status"],
			parity_records.size(),
			parity_report_path,
		]
	)
	return ""


func _append_frame_error(frame_errors: Dictionary, column_name: String, detail: String) -> void:
	var issues = frame_errors.get(column_name, [])
	if not (issues is Array):
		issues = []
	(issues as Array).append(detail)
	frame_errors[column_name] = issues


func _fail_startup(errors: Array[String]) -> void:
	set_process(false)
	for error in errors:
		push_error("mount direction review fail closed: %s" % error)
	_cleanup_owned_qa_preview()
	get_tree().quit(1)


func _cleanup_owned_qa_preview() -> void:
	var cleaned := qa_mount_profile_preview_owned or qa_mounted_preview_owned or qa_pet_preview_owned
	if qa_mount_profile_preview_owned:
		MountVisualProfileCatalog.disable_qa_preview_form(form_id)
		qa_mount_profile_preview_owned = false
	if qa_mounted_preview_owned:
		MountedCharacterAssetCatalog.disable_qa_preview_combination(
			MountedCharacterAssetCatalog.DEFAULT_CHARACTER_ID,
			form_id
		)
		qa_mounted_preview_owned = false
	if qa_pet_preview_owned:
		PetActionAssetCatalog.disable_qa_preview_form(form_id)
		qa_pet_preview_owned = false
	if cleaned:
		print("mount direction review QA owner-pending preview cleaned: form=%s" % form_id)


func _form_display_name() -> String:
	var form := PetTemplateCatalog.form_by_id(form_id)
	return str(form.get("formName", form_id))
