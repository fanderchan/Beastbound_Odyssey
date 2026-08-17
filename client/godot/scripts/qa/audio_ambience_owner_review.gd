extends Node

## Normal-Main, one-movie owner review for the three formal map ambience beds.
##
## This controller is mounted only by the dedicated QA scene. It drives the
## real GameAudioManager through public map/battle transitions, keeps all
## player state read-only, and emits a numbered listening artifact.

const REVIEW_VIEWPORT := Vector2i(1280, 720)
const READY_FRAME_LIMIT := 240
const ISOLATED_LISTEN_SECONDS := 5.0
const COMBINED_LISTEN_SECONDS := 4.0
const INTRO_SECONDS := 1.0
const FINISH_SECONDS := 1.5
const PERF_MODE_ENV := "BEASTBOUND_AUDIO_AMBIENCE_REVIEW_PERF"
const PERF_FRAME_COUNT := 480

@export var perf_mode_override := ""

var _host
var _manager
var _overlay_layer: CanvasLayer
var _number_label: Label
var _title_label: Label
var _detail_label: Label
var _cue_label: Label
var _original_settings: Dictionary = {}
var _review_settings_path := ""
var _finishing := false
var _duration_scale := 1.0
var _perf_mode := ""


func _ready() -> void:
	# Child `_ready()` runs before Main `_ready()`. Disable profile persistence
	# before Main can schedule any write, and install a preconfigured review
	# audio manager before Main can read a player's audio preferences. With no
	# QA/login arguments Main then selects `default_profile()` instead of reading
	# a player's save file.
	_host = get_parent()
	_host.profile_save_enabled = false
	_review_settings_path = (
		ProjectSettings.globalize_path("res://")
		.path_join(
			"../../.run/evidence/phase475_formal_map_ambience/"
			+ "review-audio-settings-%d.json" % OS.get_process_id()
		)
		.simplify_path()
	)
	var review_manager := GameAudioManager.new()
	review_manager.name = "GameAudioManager"
	review_manager.configure_settings_path(_review_settings_path)
	_host.game_audio_manager = review_manager
	_host.add_child.call_deferred(review_manager)
	_perf_mode = perf_mode_override.strip_edges().to_lower()
	if _perf_mode == "":
		_perf_mode = OS.get_environment(PERF_MODE_ENV).strip_edges().to_lower()
	if _perf_mode in ["idle", "moving", "spam"]:
		# These modes use the same isolated Main host as the listening review.
		# No developer CLI flag is involved, profile persistence stays disabled,
		# and the audio manager never reads or writes the player's settings.
		_host.perf_probe_enabled = true
		if _perf_mode == "moving":
			_host.movement_perf_check = true
			_report_non_idle_perf_mode.call_deferred()
		elif _perf_mode == "spam":
			_host.movement_spam_click_check = true
			_report_non_idle_perf_mode.call_deferred()
		else:
			_run_idle_perf.call_deferred()
		return
	if OS.get_environment("BEASTBOUND_AUDIO_AMBIENCE_REVIEW_FAST") == "1":
		_duration_scale = 0.02
	_run.call_deferred()


func _run_idle_perf() -> void:
	if not await _wait_for_main_audio():
		await _finish(1, "idle 性能检查未等到 Main 或 GameAudioManager")
		return
	_host._apply_preview_window_size(REVIEW_VIEWPORT)
	_host._close_auth_panel(false)
	if not _manager.sync_map_context("firebud_village_gate", "town"):
		await _finish(1, "idle 性能检查无法进入城镇音频语境")
		return
	for _frame in PERF_FRAME_COUNT:
		await get_tree().process_frame
	var snapshot: Dictionary = _manager.debug_snapshot()
	var cue_ok := (
		str(snapshot.get("activeMusicCue", "")) == "music.town"
		and str(snapshot.get("activeAmbienceCue", "")) == "ambience.town"
		and not bool(snapshot.get("ambienceDucked", true))
	)
	var report := (
		"audio ambience perf check ready: status=%s mode=idle frames=%d "
		+ "music=%s ambience=%s ducked=%s profile_save=false settings_path=%s"
	) % [
		"ok" if cue_ok else "failed",
		PERF_FRAME_COUNT,
		str(snapshot.get("activeMusicCue", "")),
		str(snapshot.get("activeAmbienceCue", "")),
		str(snapshot.get("ambienceDucked", false)),
		_review_settings_path,
	]
	print(report)
	await _finish_perf(0 if cue_ok else 1)


func _report_non_idle_perf_mode() -> void:
	if not await _wait_for_main_audio():
		push_error("%s 性能检查未等到 Main 或 GameAudioManager" % _perf_mode)
		get_tree().quit(1)
		return
	_host._apply_preview_window_size(REVIEW_VIEWPORT)
	_host._close_auth_panel(false)
	if _perf_mode == "spam":
		# Main has already selected default_profile() while unauthenticated.
		# Open only the local input gate after that read boundary; persistence
		# remains disabled and no account record or backend session is created.
		_host.account_authenticated = true
		_host.auth_auto_bypass = true
	var report := (
		"audio ambience perf lane: status=ready mode=%s profile_save=false "
		+ "settings_path=%s playback=%s"
	) % [
		_perf_mode,
		_review_settings_path,
		str(_manager.debug_snapshot().get("playbackEnabled", false)),
	]
	print(report)


func _finish_perf(exit_code: int) -> void:
	if _finishing:
		return
	_finishing = true
	if _manager != null and is_instance_valid(_manager):
		_manager.stop_all()
	for _frame in 4:
		await get_tree().process_frame
	get_tree().quit(exit_code)


func _run() -> void:
	if not await _wait_for_main_audio():
		await _finish(1, "Main 或 GameAudioManager 未在时限内就绪")
		return
	var catalog_errors := _catalog_errors()
	if not catalog_errors.is_empty():
		await _finish(1, "环境声 catalog 不完整：%s" % "；".join(catalog_errors))
		return

	_host._apply_preview_window_size(REVIEW_VIEWPORT)
	_host._close_auth_panel(false)
	_original_settings = _manager.settings_snapshot()
	_manager.set_muted(false, false)
	_manager.set_music_volume(0.0, false)
	_manager.set_sfx_volume(0.86, false)
	_manager.stop_all()
	_build_overlay()
	await get_tree().process_frame

	_show(
		"00 / 07",
		"地图环境声试听",
		"先单独听城镇、野外、洞窟，再与 BGM 合听，最后检查战斗压低与恢复。",
		"正式候选 · 所有者听感待确认"
	)
	await _wait(INTRO_SECONDS)

	if not await _play_context(
		"01 / 07",
		"城镇 · 环境声独立",
		"firebud_village_gate",
		"town",
		"鸟鸣稀疏、空气开阔；不应像连续音效，也不应抢旋律。",
		ISOLATED_LISTEN_SECONDS,
		false
	):
		return
	if not await _play_context(
		"02 / 07",
		"野外 · 环境声独立",
		"mistcap_marsh",
		"wilderness",
		"风与鸟形成更宽的空间；不应有明显循环切口。",
		ISOLATED_LISTEN_SECONDS,
		false
	):
		return
	if not await _play_context(
		"03 / 07",
		"洞窟 · 环境声独立",
		"earth_vein_cave",
		"cave",
		"低风压与水滴保持克制；不能轰头，也不能像恐怖片。",
		ISOLATED_LISTEN_SECONDS,
		false
	):
		return

	_manager.set_music_volume(0.72, false)
	if not await _play_context(
		"04 / 07",
		"城镇 · BGM 与环境层",
		"firebud_village_gate",
		"town",
		"环境声只提供地点感，旋律仍应是情绪前景。",
		COMBINED_LISTEN_SECONDS,
		true
	):
		return
	if not await _play_context(
		"05 / 07",
		"野外 · BGM 与环境层",
		"mistcap_marsh",
		"wilderness",
		"宽阔但不糊；鸟鸣不能与音乐高频互相争抢。",
		COMBINED_LISTEN_SECONDS,
		true
	):
		return
	if not await _play_context(
		"06 / 07",
		"洞窟 · BGM 与环境层",
		"earth_vein_cave",
		"cave",
		"洞窟更深，但空间层仍应低于音乐主体。",
		COMBINED_LISTEN_SECONDS,
		true
	):
		return

	if not await _play_battle_round_trip():
		return

	_show(
		"07 / 07",
		"试听完成 · 等待你的听感确认",
		"请按编号反馈过响、过弱、烦躁、像循环或与场景不贴的问题。",
		"owner_listening_pending"
	)
	await _wait(FINISH_SECONDS)
	await _finish(0, "")


func _wait_for_main_audio() -> bool:
	for _frame in READY_FRAME_LIMIT:
		if (
			_host != null
			and is_instance_valid(_host)
			and _host.game_audio_manager != null
			and is_instance_valid(_host.game_audio_manager)
			and _host.game_audio_manager.catalog_loaded()
		):
			_manager = _host.game_audio_manager
			return true
		await get_tree().process_frame
	return false


func _catalog_errors() -> Array[String]:
	var errors: Array[String] = []
	for context in ["town", "wilderness", "cave"]:
		var cue_id: String = str(_manager.ambience_context_cue(context))
		if cue_id != "ambience.%s" % context:
			errors.append("%s -> %s" % [context, cue_id])
		elif _manager.cue_info(cue_id).is_empty():
			errors.append("缺少 %s" % cue_id)
	return errors


func _play_context(
	number: String,
	title: String,
	map_id: String,
	context: String,
	detail: String,
	duration_seconds: float,
	with_music: bool
) -> bool:
	if _manager.is_battle_active() and not _manager.exit_battle():
		await _finish(1, "%s 开始前无法退出残留战斗" % number)
		return false
	if not _manager.sync_map_context(map_id, context):
		await _finish(1, "%s 无法切入 %s" % [number, context])
		return false
	var expected_music := "music.%s" % context
	var expected_ambience := "ambience.%s" % context
	if (
		_manager.current_music_cue() != expected_music
		or _manager.current_ambience_cue() != expected_ambience
	):
		await _finish(1, "%s cue 路由不一致" % number)
		return false
	_show(
		number,
		title,
		detail,
		"音乐 %s · 音效 86%% · 0.75 秒等功率转场"
		% ("72%" if with_music else "0%（环境声独立）")
	)
	print(
		"audio ambience review step: number=%s context=%s music=%s ambience=%s with_music=%s frame=%d"
		% [
			number,
			context,
			_manager.current_music_cue(),
			_manager.current_ambience_cue(),
			str(with_music),
			Engine.get_process_frames(),
		]
	)
	await _wait(duration_seconds)
	return true


func _play_battle_round_trip() -> bool:
	if not _manager.sync_map_context("mistcap_marsh", "wilderness"):
		await _finish(1, "战斗往返无法准备野外语境")
		return false
	_show(
		"07 / 07",
		"战斗往返 · 进入前",
		"先听完整野外环境层，随后战斗音乐覆盖，环境层保留但压低。",
		"ambience.wilderness · 0 dB"
	)
	await _wait(2.0)
	_host._audio_enter_battle({})
	await _wait(0.5)
	if (
		_manager.current_music_cue() != "music.battle_normal"
		or _manager.current_ambience_cue() != "ambience.wilderness"
		or not _manager.is_ambience_ducked()
	):
		await _finish(1, "进入战斗后的音乐/环境路由或 duck 错误")
		return false
	_show(
		"07 / 07",
		"战斗往返 · 战斗中",
		"环境层仍维持地图连续性，但应低到不会遮住战斗音乐与命中反馈。",
		"music.battle_normal · ambience.wilderness -12 dB"
	)
	print(
		"audio ambience review transition: phase=battle music=%s ambience=%s ducked=%s bus_db=%.2f"
		% [
			_manager.current_music_cue(),
			_manager.current_ambience_cue(),
			str(_manager.is_ambience_ducked()),
			float(_manager.debug_snapshot().get("ambienceBusGainDb", 0.0)),
		]
	)
	await _wait(3.0)
	_host._audio_exit_battle()
	await _wait(0.5)
	if (
		_manager.current_music_cue() != "music.wilderness"
		or _manager.current_ambience_cue() != "ambience.wilderness"
		or _manager.is_ambience_ducked()
	):
		await _finish(1, "退出战斗后没有准确恢复野外声音")
		return false
	_show(
		"07 / 07",
		"战斗往返 · 已恢复",
		"战斗结束后应平滑回到同一个野外环境层，没有重启感或音量跳变。",
		"music.wilderness · ambience.wilderness 0 dB"
	)
	print(
		"audio ambience review transition: phase=restore music=%s ambience=%s ducked=%s bus_db=%.2f result=exact"
		% [
			_manager.current_music_cue(),
			_manager.current_ambience_cue(),
			str(_manager.is_ambience_ducked()),
			float(_manager.debug_snapshot().get("ambienceBusGainDb", 0.0)),
		]
	)
	await _wait(2.0)
	return true


func _build_overlay() -> void:
	_overlay_layer = CanvasLayer.new()
	_overlay_layer.name = "AudioAmbienceReviewOverlay"
	_overlay_layer.layer = 220
	add_child(_overlay_layer)
	var panel := ColorRect.new()
	panel.set_anchors_and_offsets_preset(Control.PRESET_TOP_WIDE)
	panel.custom_minimum_size = Vector2(0, 138)
	panel.color = Color(0.035, 0.045, 0.035, 0.92)
	panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_overlay_layer.add_child(panel)

	_number_label = _label(panel, Vector2(26, 18), Vector2(150, 36), 20, Color("#eac773"))
	_title_label = _label(panel, Vector2(166, 14), Vector2(1080, 42), 28, Color("#fff6d8"))
	_detail_label = _label(panel, Vector2(166, 58), Vector2(1080, 30), 18, Color("#d8e1c7"))
	_cue_label = _label(panel, Vector2(166, 96), Vector2(1080, 26), 16, Color("#9fbc87"))


func _label(
	parent: Control,
	position: Vector2,
	size: Vector2,
	font_size: int,
	color: Color
) -> Label:
	var label := Label.new()
	label.position = position
	label.size = size
	label.add_theme_font_size_override("font_size", font_size)
	label.add_theme_color_override("font_color", color)
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	parent.add_child(label)
	return label


func _show(number: String, title: String, detail: String, cue: String) -> void:
	_number_label.text = number
	_title_label.text = title
	_detail_label.text = detail
	_cue_label.text = cue


func _wait(seconds: float) -> void:
	await get_tree().create_timer(maxf(0.01, seconds * _duration_scale)).timeout


func _finish(exit_code: int, error_text: String) -> void:
	if _finishing:
		return
	_finishing = true
	if error_text != "":
		push_error(error_text)
	if _manager != null and is_instance_valid(_manager):
		if not _original_settings.is_empty():
			_manager.set_music_volume(
				float(_original_settings.get("musicVolume", 0.72)),
				false
			)
			_manager.set_sfx_volume(
				float(_original_settings.get("sfxVolume", 0.86)),
				false
			)
			_manager.set_muted(
				bool(_original_settings.get("muted", false)),
				false
			)
		_manager.stop_all()
	for _frame in 4:
		await get_tree().process_frame
	print(
		"audio ambience owner review: result=%s steps=7 profile_save=false settings_path=%s errors=%s"
		% [
			"PASS" if exit_code == 0 else "FAIL",
			_review_settings_path,
			error_text,
		]
	)
	get_tree().quit(exit_code)
