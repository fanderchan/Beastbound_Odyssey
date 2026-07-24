extends RefCounted

## Focused contract and catalog check for the formal BGM owner-review movie.
##
## It does not create AudioStreamPlayers. Runtime switching and playback remain
## covered by GameAudioManager and by the normal-client review preview.

const AudioMusicReviewModel := preload(
	"res://scripts/audio/audio_music_review_model.gd"
)


static func run() -> Dictionary:
	var errors := AudioMusicReviewModel.validation_errors()
	var catalog := _load_catalog(errors)
	var contexts = catalog.get("contexts", {})
	var cues = catalog.get("cues", {})
	var expected_contexts := AudioMusicReviewModel.context_cues()

	if contexts is Dictionary:
		for context_value in expected_contexts.keys():
			var context := str(context_value)
			_expect(
				str((contexts as Dictionary).get(context, ""))
				== str(expected_contexts.get(context, "")),
				"正式 catalog 的音乐语境映射错误：%s" % context,
				errors
			)
	else:
		errors.append("正式 catalog 缺少 contexts")

	var checked_cue_ids: Array[String] = []
	if cues is Dictionary:
		for cue_id in AudioMusicReviewModel.all_required_cue_ids():
			var info_value = (cues as Dictionary).get(cue_id, {})
			if not info_value is Dictionary or (info_value as Dictionary).is_empty():
				errors.append("正式 catalog 缺少试听 cue：%s" % cue_id)
				continue
			var info := info_value as Dictionary
			checked_cue_ids.append(cue_id)
			var path := str(info.get("path", "")).strip_edges()
			_expect(path != "", "正式 catalog cue 缺少路径：%s" % cue_id, errors)
			if path != "":
				var resource_exists := ResourceLoader.exists(path)
				_expect(
					resource_exists,
					"正式 catalog cue 未被 Godot 导入：%s" % cue_id,
					errors
				)
				if resource_exists:
					var loaded := ResourceLoader.load(path)
					_expect(
						loaded is AudioStream,
						"正式 catalog cue 不能加载为 AudioStream：%s" % cue_id,
						errors
					)
			var role := str(info.get("role", "")).strip_edges().to_lower()
			if cue_id.begins_with("music."):
				_expect(role == "music", "音乐 cue 的 role 不是 music：%s" % cue_id, errors)
				_expect(bool(info.get("loop", false)), "音乐 cue 未启用循环：%s" % cue_id, errors)
			else:
				_expect(role != "" and role != "music", "音效 cue 的 role 无效：%s" % cue_id, errors)
	else:
		errors.append("正式 catalog 缺少 cues")

	return {
		"schemaVersion": 1,
		"reportType": "beastbound.audio_music_review_model_check",
		"result": "PASS" if errors.is_empty() else "FAIL",
		"independentStepCount": AudioMusicReviewModel.independent_steps().size(),
		"transitionStepCount": AudioMusicReviewModel.transition_steps().size(),
		"maskingCueCount": (
			AudioMusicReviewModel.masking_step().get("cues", []) as Array
		).size(),
		"defaultMusicVolume": AudioMusicReviewModel.DEFAULT_MUSIC_VOLUME,
		"defaultSfxVolume": AudioMusicReviewModel.DEFAULT_SFX_VOLUME,
		"ownerReviewState": AudioMusicReviewModel.OWNER_REVIEW_STATE,
		"checkedCueIds": checked_cue_ids,
		"errors": errors,
	}


static func _load_catalog(errors: Array[String]) -> Dictionary:
	if not FileAccess.file_exists(AudioMusicReviewModel.CATALOG_PATH):
		errors.append("正式音频 catalog 不存在")
		return {}
	var file := FileAccess.open(AudioMusicReviewModel.CATALOG_PATH, FileAccess.READ)
	if file == null:
		errors.append("正式音频 catalog 无法读取")
		return {}
	var parsed = JSON.parse_string(file.get_as_text())
	if not parsed is Dictionary:
		errors.append("正式音频 catalog 不是有效 JSON 对象")
		return {}
	return (parsed as Dictionary).duplicate(true)


static func _expect(
	condition: bool,
	message: String,
	errors: Array[String]
) -> void:
	if not condition:
		errors.append(message)
