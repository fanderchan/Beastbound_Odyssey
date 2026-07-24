extends RefCounted

## One-process, one-movie owner review for the formal four-context BGM set.
##
## Every music switch, battle override, restoration and masking cue is executed
## by the Main scene's real GameAudioManager and its loaded audio-cues catalog.
## The presenter owns only review pacing, readable UI and fail-closed evidence.

const AudioMusicReviewModel := preload(
	"res://scripts/audio/audio_music_review_model.gd"
)

const REVIEW_VIEWPORT := Vector2i(1280, 720)
const SECTION_LEAD_SECONDS := 1.10
const FINISH_HOLD_SECONDS := 1.55
const METER_BAR_COUNT := 22

var host
var _root: Control
var _section_label: Label
var _number_label: Label
var _title_label: Label
var _note_label: Label
var _phase_label: Label
var _status_label: Label
var _progress_bar: ProgressBar
var _meter: Control
var _meter_bars: Array[ColorRect] = []
var _context_chips: Dictionary = {}
var _original_audio_settings: Dictionary = {}
var _original_profile_save_enabled := true
var _profile_save_captured := false
var _finishing := false
var _meter_elapsed := 0.0


func _init(host_node) -> void:
	host = host_node


func run() -> void:
	var contract_errors := AudioMusicReviewModel.validation_errors()
	if not contract_errors.is_empty():
		push_error(
			"正式背景音乐试听合同无效：%s" % "；".join(contract_errors)
		)
		await _finish(1)
		return
	if (
		host == null
		or not is_instance_valid(host)
		or host.game_audio_manager == null
		or not is_instance_valid(host.game_audio_manager)
	):
		push_error("正式背景音乐试听缺少有效的 Main 或 GameAudioManager")
		await _finish(1)
		return
	if not host.game_audio_manager.catalog_loaded():
		push_error(
			"正式背景音乐试听 catalog 未加载：%s"
			% host.game_audio_manager.catalog_error()
		)
		await _finish(1)
		return
	var catalog_errors := _runtime_catalog_errors()
	if not catalog_errors.is_empty():
		push_error(
			"正式背景音乐试听 catalog 不完整：%s"
			% "；".join(catalog_errors)
		)
		await _finish(1)
		return

	host._apply_preview_window_size(REVIEW_VIEWPORT)
	_original_audio_settings = host.game_audio_manager.settings_snapshot()
	_original_profile_save_enabled = bool(host.profile_save_enabled)
	_profile_save_captured = true
	host.profile_save_enabled = false
	host.game_audio_manager.set_muted(false, false)
	host.game_audio_manager.set_music_volume(
		AudioMusicReviewModel.DEFAULT_MUSIC_VOLUME,
		false
	)
	host.game_audio_manager.set_sfx_volume(
		AudioMusicReviewModel.DEFAULT_SFX_VOLUME,
		false
	)
	host.game_audio_manager.stop_all()
	_build_overlay()
	await host.get_tree().process_frame

	_show_review_state(
		"试听说明",
		"",
		"四场景正式背景音乐连续试听",
		"先听四首独立音乐，再听两组战斗往返，最后检查默认音量下的关键战斗反馈。",
		"",
		""
	)
	await _wait(SECTION_LEAD_SECONDS)

	for step in AudioMusicReviewModel.independent_steps():
		if not await _play_independent_step(step):
			await _finish(1)
			return

	_show_review_state(
		"第二部分 · 战斗往返",
		"",
		"地图音乐与战斗音乐切换",
		"确认 0.75 秒交叉淡化自然，战斗结束后准确恢复进入战斗前的地图音乐。",
		"",
		""
	)
	await _wait(SECTION_LEAD_SECONDS)
	for step in AudioMusicReviewModel.transition_steps():
		if not await _play_transition_step(step):
			await _finish(1)
			return

	if not await _play_masking_step(AudioMusicReviewModel.masking_step()):
		await _finish(1)
		return

	_show_review_state(
		"试听完成",
		"07 / 07",
		"正式背景音乐候选 · 等待你的听感确认",
		"请按 01—07 反馈不合适的场景、切换或遮蔽问题；本次不会自动标记为美术音频验收通过。",
		"",
		"所有者试听状态：待确认"
	)
	await _wait(FINISH_HOLD_SECONDS)
	await _finish(0)


func _play_independent_step(step: Dictionary) -> bool:
	var context := str(step.get("context", ""))
	var cue_id := str(step.get("cueId", ""))
	var operation := str(step.get("operation", ""))
	if host.game_audio_manager.is_battle_active():
		if not host.game_audio_manager.exit_battle():
			return _fail("退出上一试听战斗失败：%s" % str(step.get("id", "")))
	if operation == AudioMusicReviewModel.OP_BATTLE:
		if not host.game_audio_manager.sync_music_context("wilderness"):
			return _fail("普通战斗独立试听无法准备地图音乐")
		if not host.game_audio_manager.enter_battle(false):
			return _fail("普通战斗独立试听无法进入战斗音乐")
	else:
		if not host.game_audio_manager.sync_music_context(context):
			return _fail("独立试听无法切入音乐：%s" % context)
	if not _current_music_matches(context, cue_id):
		return _fail(
			"独立试听 context/cue 不匹配：%s/%s" % [context, cue_id]
		)

	_show_review_state(
		"第一部分 · 四场景独立试听",
		str(step.get("number", "")),
		str(step.get("label", "")),
		str(step.get("note", "")),
		context,
		"音乐 72% · 独立听感"
	)
	print(
		"audio music review step: id=%s number=%s context=%s cue=%s phase=independent frame=%d"
		% [
			str(step.get("id", "")),
			str(step.get("number", "")),
			context,
			cue_id,
			Engine.get_process_frames(),
		]
	)
	await _wait(float(step.get("listenSeconds", 6.0)))
	return true


func _play_transition_step(step: Dictionary) -> bool:
	if host.game_audio_manager.is_battle_active():
		if not host.game_audio_manager.exit_battle():
			return _fail("往返试听开始前无法退出残留战斗音乐")
	var world_context := str(step.get("worldContext", ""))
	var world_cue_id := str(step.get("worldCueId", ""))
	var battle_context := str(step.get("battleContext", ""))
	var battle_cue_id := str(step.get("battleCueId", ""))
	var restored_context := str(step.get("restoredContext", ""))
	var restored_cue_id := str(step.get("restoredCueId", ""))
	var phase_seconds := step.get("phaseSeconds", []) as Array

	if not host.game_audio_manager.sync_music_context(world_context):
		return _fail("往返试听无法切入地图音乐：%s" % world_context)
	if not _current_music_matches(world_context, world_cue_id):
		return _fail("往返试听地图音乐状态错误：%s" % world_context)
	var transition_serial_before := _music_transition_serial()
	_show_transition_phase(
		step,
		"① 进入战斗前",
		world_context,
		"正在播放地图音乐，随后由普通战斗音乐临时覆盖。"
	)
	await _wait(float(phase_seconds[0]))

	if not host.game_audio_manager.enter_battle(false):
		return _fail("往返试听无法进入普通战斗音乐：%s" % str(step.get("id", "")))
	if not _current_music_matches(battle_context, battle_cue_id):
		return _fail("往返试听战斗音乐状态错误：%s" % str(step.get("id", "")))
	if _music_transition_serial() != transition_serial_before + 1:
		return _fail("进入战斗没有且仅执行一次音乐切换：%s" % str(step.get("id", "")))
	_show_transition_phase(
		step,
		"② 普通战斗覆盖",
		battle_context,
		"注意交叉淡化中间不能突然塌陷，也不能同时听到两首满音量音乐。"
	)
	print(
		"audio music review transition: id=%s phase=enter_battle context=%s cue=%s serial=%d"
		% [
			str(step.get("id", "")),
			host.game_audio_manager.current_music_context(),
			host.game_audio_manager.current_music_cue(),
			_music_transition_serial(),
		]
	)
	await _wait(float(phase_seconds[1]))

	if not host.game_audio_manager.exit_battle():
		return _fail("往返试听无法退出普通战斗音乐：%s" % str(step.get("id", "")))
	if not _current_music_matches(restored_context, restored_cue_id):
		return _fail(
			"战斗结束未准确恢复 %s/%s" % [restored_context, restored_cue_id]
		)
	if _music_transition_serial() != transition_serial_before + 2:
		return _fail("战斗往返没有严格执行一进一出两次切换：%s" % str(step.get("id", "")))
	_show_transition_phase(
		step,
		"③ 战斗结束后",
		restored_context,
		"已准确恢复进入战斗前的地图音乐；本段应听不到重复叠播。"
	)
	print(
		"audio music review transition: id=%s phase=restore context=%s cue=%s serial=%d result=exact"
		% [
			str(step.get("id", "")),
			host.game_audio_manager.current_music_context(),
			host.game_audio_manager.current_music_cue(),
			_music_transition_serial(),
		]
	)
	await _wait(float(phase_seconds[2]))
	return true


func _play_masking_step(step: Dictionary) -> bool:
	host.game_audio_manager.set_muted(false, false)
	host.game_audio_manager.set_music_volume(
		float(step.get("musicVolume", AudioMusicReviewModel.DEFAULT_MUSIC_VOLUME)),
		false
	)
	host.game_audio_manager.set_sfx_volume(
		float(step.get("sfxVolume", AudioMusicReviewModel.DEFAULT_SFX_VOLUME)),
		false
	)
	if host.game_audio_manager.is_battle_active():
		if not host.game_audio_manager.exit_battle():
			return _fail("默认音量检查开始前无法退出残留战斗")
	if not host.game_audio_manager.sync_music_context(
		str(step.get("worldContext", "wilderness"))
	):
		return _fail("默认音量检查无法准备野外音乐")
	if not host.game_audio_manager.enter_battle(false):
		return _fail("默认音量检查无法进入普通战斗音乐")
	if not _current_music_matches(
		str(step.get("battleContext", "battle_normal")),
		str(step.get("battleCueId", "music.battle_normal"))
	):
		return _fail("默认音量检查没有播放普通战斗音乐")

	_show_review_state(
		"第三部分 · 默认音量遮蔽检查",
		str(step.get("number", "")),
		str(step.get("label", "")),
		str(step.get("note", "")),
		"battle_normal",
		"战斗音乐稳定后依次播放四个关键反馈"
	)
	print(
		"audio music review step: id=%s number=%s context=battle_normal cue=music.battle_normal phase=masking frame=%d"
		% [
			str(step.get("id", "")),
			str(step.get("number", "")),
			Engine.get_process_frames(),
		]
	)
	await _wait(float(step.get("leadSeconds", 2.0)))

	var cue_index := 0
	for cue_value in step.get("cues", []):
		if not cue_value is Dictionary:
			return _fail("默认音量检查含无效 cue 配置")
		var cue := cue_value as Dictionary
		cue_index += 1
		var cue_id := str(cue.get("cueId", ""))
		_phase_label.text = "关键反馈 %d / %d · %s" % [
			cue_index,
			AudioMusicReviewModel.MASKING_CUE_COUNT,
			str(cue.get("label", "")),
		]
		_status_label.text = "音乐 72%% · 音效 86%% · 应清晰听见：%s" % str(
			cue.get("label", "")
		)
		if not host.game_audio_manager.play_cue(
			cue_id,
			{
				"priority": int(cue.get("priority", 90)),
				"cooldownKey": "audio_music_review_%02d_%s" % [cue_index, cue_id],
			}
		):
			return _fail("默认音量检查无法播放 cue：%s" % cue_id)
		print(
			"audio music review masking cue: index=%d cue=%s label=%s music_volume=0.72 sfx_volume=0.86"
			% [
				cue_index,
				cue_id,
				str(cue.get("label", "")),
			]
		)
		await _wait(float(cue.get("waitAfterSeconds", 1.5)))
	return true


func _runtime_catalog_errors() -> Array[String]:
	var errors: Array[String] = []
	for cue_id in AudioMusicReviewModel.all_required_cue_ids():
		var info: Dictionary = host.game_audio_manager.cue_info(cue_id)
		if info.is_empty():
			errors.append("缺少 cue %s" % cue_id)
			continue
		var path := str(info.get("path", "")).strip_edges()
		if path == "":
			errors.append("cue 缺少资源路径 %s" % cue_id)
	return errors


func _current_music_matches(context: String, cue_id: String) -> bool:
	return (
		host.game_audio_manager.current_music_context() == context
		and host.game_audio_manager.current_music_cue() == cue_id
	)


func _music_transition_serial() -> int:
	return int(
		host.game_audio_manager.debug_snapshot().get(
			"musicTransitionSerial",
			-1
		)
	)


func _build_overlay() -> void:
	if host.hud_root == null:
		return
	_root = Control.new()
	_root.name = "AudioMusicReviewOverlay"
	_root.z_index = 160
	_root.mouse_filter = Control.MOUSE_FILTER_STOP
	_root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_root.theme = _review_theme()
	host.hud_root.add_child(_root)

	var background := ColorRect.new()
	background.color = Color("#071b1d")
	background.mouse_filter = Control.MOUSE_FILTER_IGNORE
	background.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_root.add_child(background)

	var glow_left := ColorRect.new()
	glow_left.color = Color(0.12, 0.38, 0.33, 0.18)
	glow_left.position = Vector2(-40, 112)
	glow_left.size = Vector2(470, 520)
	glow_left.rotation = -0.12
	glow_left.mouse_filter = Control.MOUSE_FILTER_IGNORE
	background.add_child(glow_left)

	var glow_right := ColorRect.new()
	glow_right.color = Color(0.70, 0.45, 0.13, 0.11)
	glow_right.position = Vector2(910, 84)
	glow_right.size = Vector2(410, 470)
	glow_right.rotation = 0.10
	glow_right.mouse_filter = Control.MOUSE_FILTER_IGNORE
	background.add_child(glow_right)

	var header := HBoxContainer.new()
	header.set_anchors_preset(Control.PRESET_TOP_WIDE)
	header.offset_left = 54.0
	header.offset_top = 28.0
	header.offset_right = -54.0
	header.offset_bottom = 74.0
	header.add_theme_constant_override("separation", 12)
	_root.add_child(header)

	var brand := Label.new()
	brand.text = "万兽纪元 · 背景音乐集中试听"
	brand.add_theme_font_size_override("font_size", 25)
	brand.add_theme_color_override("font_color", Color("#f5e9c9"))
	brand.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_child(brand)

	var pending := Label.new()
	pending.text = "正式候选  ·  待你确认"
	pending.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	pending.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	pending.custom_minimum_size = Vector2(214, 38)
	pending.add_theme_stylebox_override(
		"normal",
		_style_box(Color("#5f4317"), Color("#dcae4c"), 1, 8, 10)
	)
	pending.add_theme_color_override("font_color", Color("#ffe7a4"))
	pending.add_theme_font_size_override("font_size", 15)
	header.add_child(pending)

	var card := PanelContainer.new()
	card.set_anchors_preset(Control.PRESET_CENTER)
	card.offset_left = -498.0
	card.offset_top = -244.0
	card.offset_right = 498.0
	card.offset_bottom = 242.0
	card.add_theme_stylebox_override(
		"panel",
		_style_box(
			Color(0.035, 0.115, 0.12, 0.97),
			Color(0.72, 0.54, 0.25, 0.80),
			2,
			16,
			28
		)
	)
	_root.add_child(card)

	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 10)
	card.add_child(column)

	var top_line := HBoxContainer.new()
	top_line.add_theme_constant_override("separation", 12)
	column.add_child(top_line)

	_section_label = Label.new()
	_section_label.text = "试听说明"
	_section_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_section_label.add_theme_color_override("font_color", Color("#8fc9b9"))
	_section_label.add_theme_font_size_override("font_size", 16)
	top_line.add_child(_section_label)

	_number_label = Label.new()
	_number_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_number_label.add_theme_color_override("font_color", Color("#e9bd64"))
	_number_label.add_theme_font_size_override("font_size", 18)
	top_line.add_child(_number_label)

	_title_label = Label.new()
	_title_label.text = "四场景正式背景音乐连续试听"
	_title_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_title_label.add_theme_color_override("font_color", Color("#fff3d6"))
	_title_label.add_theme_font_size_override("font_size", 31)
	column.add_child(_title_label)

	_note_label = Label.new()
	_note_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_note_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_note_label.custom_minimum_size = Vector2(0, 48)
	_note_label.add_theme_color_override("font_color", Color("#b8d0ca"))
	_note_label.add_theme_font_size_override("font_size", 16)
	column.add_child(_note_label)

	var chip_row := HBoxContainer.new()
	chip_row.alignment = BoxContainer.ALIGNMENT_CENTER
	chip_row.add_theme_constant_override("separation", 10)
	column.add_child(chip_row)
	for context in ["town", "wilderness", "cave", "battle_normal"]:
		var chip := Label.new()
		chip.text = {
			"town": "城镇",
			"wilderness": "野外",
			"cave": "洞窟",
			"battle_normal": "普通战斗",
		}.get(context, context)
		chip.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		chip.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		chip.custom_minimum_size = Vector2(
			126 if context == "battle_normal" else 104,
			34
		)
		chip.add_theme_font_size_override("font_size", 15)
		chip_row.add_child(chip)
		_context_chips[context] = chip
	_set_active_context_chip("")

	_meter = Control.new()
	_meter.custom_minimum_size = Vector2(0, 112)
	_meter.mouse_filter = Control.MOUSE_FILTER_IGNORE
	column.add_child(_meter)
	for index in METER_BAR_COUNT:
		var bar := ColorRect.new()
		bar.color = Color("#5fbf9c") if index % 3 != 0 else Color("#e2b65a")
		bar.mouse_filter = Control.MOUSE_FILTER_IGNORE
		_meter.add_child(bar)
		_meter_bars.append(bar)

	_phase_label = Label.new()
	_phase_label.text = ""
	_phase_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_phase_label.add_theme_color_override("font_color", Color("#e8d7aa"))
	_phase_label.add_theme_font_size_override("font_size", 17)
	column.add_child(_phase_label)

	_progress_bar = ProgressBar.new()
	_progress_bar.min_value = 0.0
	_progress_bar.max_value = 1.0
	_progress_bar.value = 0.0
	_progress_bar.show_percentage = false
	_progress_bar.custom_minimum_size = Vector2(0, 9)
	_progress_bar.add_theme_stylebox_override(
		"background",
		_style_box(Color("#173438"), Color("#173438"), 0, 5, 0)
	)
	_progress_bar.add_theme_stylebox_override(
		"fill",
		_style_box(Color("#d6a84c"), Color("#d6a84c"), 0, 5, 0)
	)
	column.add_child(_progress_bar)

	_status_label = Label.new()
	_status_label.text = "音乐 72% · 音效 86%"
	_status_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_status_label.add_theme_color_override("font_color", Color("#7da59d"))
	_status_label.add_theme_font_size_override("font_size", 14)
	column.add_child(_status_label)

	var footer := Label.new()
	footer.text = "本片使用游戏正式音乐管理器与运行 catalog；不直接播放源文件。"
	footer.set_anchors_preset(Control.PRESET_BOTTOM_WIDE)
	footer.offset_left = 54.0
	footer.offset_top = -50.0
	footer.offset_right = -54.0
	footer.offset_bottom = -20.0
	footer.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	footer.add_theme_color_override("font_color", Color("#62837d"))
	footer.add_theme_font_size_override("font_size", 13)
	_root.add_child(footer)


func _show_transition_phase(
	step: Dictionary,
	phase: String,
	context: String,
	note: String
) -> void:
	_show_review_state(
		"第二部分 · 战斗往返",
		str(step.get("number", "")),
		str(step.get("label", "")),
		str(step.get("note", "")),
		context,
		phase
	)
	_note_label.text = "%s\n%s" % [str(step.get("note", "")), note]


func _show_review_state(
	section: String,
	number: String,
	title: String,
	note: String,
	context: String,
	status: String
) -> void:
	if _section_label != null:
		_section_label.text = section
	if _number_label != null:
		_number_label.text = number
	if _title_label != null:
		_title_label.text = title
	if _note_label != null:
		_note_label.text = note
	if _phase_label != null:
		_phase_label.text = status
	if _status_label != null:
		_status_label.text = "正式运行链 · 音乐 72% · 所有者试听待确认"
	_set_active_context_chip(context)


func _set_active_context_chip(active_context: String) -> void:
	for context_value in _context_chips.keys():
		var context := str(context_value)
		var chip := _context_chips.get(context) as Label
		if chip == null:
			continue
		var active := context == active_context
		chip.add_theme_stylebox_override(
			"normal",
			_style_box(
				Color("#8b641f") if active else Color("#102d30"),
				Color("#e1b75e") if active else Color("#315358"),
				1,
				7,
				7
			)
		)
		chip.add_theme_color_override(
			"font_color",
			Color("#fff0bd") if active else Color("#789b95")
		)


func _wait(seconds: float) -> void:
	if (
		host == null
		or not is_instance_valid(host)
		or host.get_tree() == null
	):
		return
	var duration := maxf(0.0, seconds)
	if duration <= 0.0:
		return
	var elapsed := 0.0
	while elapsed < duration:
		await host.get_tree().process_frame
		var frame_delta := maxf(host.get_process_delta_time(), 1.0 / 120.0)
		elapsed += frame_delta
		_meter_elapsed += frame_delta
		_update_meter(_meter_elapsed)
		if _progress_bar != null:
			_progress_bar.value = clampf(elapsed / duration, 0.0, 1.0)


func _update_meter(elapsed: float) -> void:
	if _meter == null or not is_instance_valid(_meter):
		return
	var available_width := maxf(_meter.size.x, 840.0)
	var gap := 8.0
	var bar_width := (available_width - gap * float(METER_BAR_COUNT - 1)) / float(
		METER_BAR_COUNT
	)
	var center_y := 56.0
	for index in _meter_bars.size():
		var bar := _meter_bars[index]
		if bar == null or not is_instance_valid(bar):
			continue
		var pulse := (
			sin(elapsed * 2.15 + float(index) * 0.67) * 0.34
			+ sin(elapsed * 0.91 + float(index) * 0.29) * 0.19
			+ 0.47
		)
		var height := 16.0 + clampf(pulse, 0.0, 1.0) * 76.0
		bar.position = Vector2(float(index) * (bar_width + gap), center_y - height * 0.5)
		bar.size = Vector2(maxf(4.0, bar_width), height)


func _review_theme() -> Theme:
	var font := SystemFont.new()
	font.font_names = PackedStringArray([
		"PingFang SC",
		"STHeiti",
		"Hiragino Sans GB",
		"Microsoft YaHei",
		"Noto Sans CJK SC",
		"Noto Sans",
		"Arial Unicode MS",
	])
	var theme := Theme.new()
	theme.default_font = font
	theme.default_font_size = 16
	return theme


func _style_box(
	background: Color,
	border: Color,
	border_width: int,
	radius: int,
	padding: int
) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = background
	style.border_color = border
	style.set_border_width_all(border_width)
	style.set_corner_radius_all(radius)
	style.content_margin_left = float(padding)
	style.content_margin_right = float(padding)
	style.content_margin_top = float(padding)
	style.content_margin_bottom = float(padding)
	return style


func _restore_original_audio_settings() -> void:
	if (
		_original_audio_settings.is_empty()
		or host == null
		or not is_instance_valid(host)
		or host.game_audio_manager == null
		or not is_instance_valid(host.game_audio_manager)
	):
		return
	host.game_audio_manager.set_music_volume(
		float(_original_audio_settings.get("musicVolume", 0.72)),
		false
	)
	host.game_audio_manager.set_sfx_volume(
		float(_original_audio_settings.get("sfxVolume", 0.86)),
		false
	)
	host.game_audio_manager.set_muted(
		bool(_original_audio_settings.get("muted", false)),
		false
	)


func _fail(message: String) -> bool:
	push_error("正式背景音乐试听失败：%s" % message)
	return false


func _finish(exit_code: int) -> void:
	if _finishing:
		return
	_finishing = true
	if host != null and is_instance_valid(host):
		if (
			host.game_audio_manager != null
			and is_instance_valid(host.game_audio_manager)
		):
			host.game_audio_manager.stop_all()
			_restore_original_audio_settings()
		if _profile_save_captured:
			host.profile_save_enabled = _original_profile_save_enabled
		if host.get_tree() != null:
			# AudioServer releases playback objects asynchronously. Keep the
			# completed-review overlay alive across those drain frames so the
			# movie cannot flash the underlying game world before quitting.
			await host.get_tree().process_frame
			await host.get_tree().process_frame
			# Do not queue_free the overlay immediately before quit: MovieWriter
			# can still encode one final frame after deferred frees are flushed.
			# Scene-tree shutdown owns the overlay and releases it normally.
			host.get_tree().quit(exit_code)
