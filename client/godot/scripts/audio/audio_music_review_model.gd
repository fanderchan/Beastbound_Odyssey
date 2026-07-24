extends RefCounted

## Pure contract for the owner-facing formal background-music review.
##
## The model names the listening order, expected catalog routes, restoration
## contracts and default-volume masking cues. It never creates players, loads
## streams or writes settings; the preview must execute every step through the
## real GameAudioManager.

const CATALOG_PATH := "res://assets/audio/beastbound_audio_v2/audio-cues.json"
const OWNER_REVIEW_STATE := "owner_listening_pending"
const DEFAULT_MUSIC_VOLUME := 0.72
const DEFAULT_SFX_VOLUME := 0.86

const SECTION_INDEPENDENT := "independent"
const SECTION_TRANSITION := "transition"
const SECTION_MASKING := "masking"

const OP_WORLD := "world"
const OP_BATTLE := "battle"

const INDEPENDENT_STEP_COUNT := 4
const TRANSITION_STEP_COUNT := 2
const MASKING_CUE_COUNT := 4
const TOTAL_REVIEW_STEP_COUNT := 7


static func context_cues() -> Dictionary:
	return {
		"town": "music.town",
		"wilderness": "music.wilderness",
		"cave": "music.cave",
		"battle_normal": "music.battle_normal",
	}


static func independent_steps() -> Array[Dictionary]:
	return [
		{
			"id": "01_town",
			"number": "01 / 07",
			"section": SECTION_INDEPENDENT,
			"label": "城镇 · 炉火与归途",
			"context": "town",
			"cueId": "music.town",
			"operation": OP_WORLD,
			"listenSeconds": 6.8,
			"note": "平静、温暖，适合作为村庄与长期停留区域的音乐底色。",
		},
		{
			"id": "02_wilderness",
			"number": "02 / 07",
			"section": SECTION_INDEPENDENT,
			"label": "野外 · 远行与发现",
			"context": "wilderness",
			"cueId": "music.wilderness",
			"operation": OP_WORLD,
			"listenSeconds": 6.8,
			"note": "保持探索感与前进感，同时为遭遇提示和战斗音效留出空间。",
		},
		{
			"id": "03_cave",
			"number": "03 / 07",
			"section": SECTION_INDEPENDENT,
			"label": "洞窟 · 幽深与未知",
			"context": "cave",
			"cueId": "music.cave",
			"operation": OP_WORLD,
			"listenSeconds": 6.8,
			"note": "更封闭、更神秘，但不靠突兀高频制造紧张。",
		},
		{
			"id": "04_battle",
			"number": "04 / 07",
			"section": SECTION_INDEPENDENT,
			"label": "普通战斗 · 交锋",
			"context": "battle_normal",
			"cueId": "music.battle_normal",
			"operation": OP_BATTLE,
			"listenSeconds": 7.2,
			"note": "节奏应明显抬升，仍须服从命中、击飞、击倒与胜负反馈。",
		},
	]


static func transition_steps() -> Array[Dictionary]:
	return [
		{
			"id": "05_wilderness_battle_restore",
			"number": "05 / 07",
			"section": SECTION_TRANSITION,
			"label": "野外 → 战斗 → 恢复野外",
			"worldContext": "wilderness",
			"worldCueId": "music.wilderness",
			"battleContext": "battle_normal",
			"battleCueId": "music.battle_normal",
			"restoredContext": "wilderness",
			"restoredCueId": "music.wilderness",
			"phaseSeconds": [3.4, 4.2, 3.6],
			"note": "战斗临时覆盖地图音乐；结束后必须准确恢复同一野外语境且只恢复一次。",
		},
		{
			"id": "06_cave_battle_restore",
			"number": "06 / 07",
			"section": SECTION_TRANSITION,
			"label": "洞窟 → 战斗 → 恢复洞窟",
			"worldContext": "cave",
			"worldCueId": "music.cave",
			"battleContext": "battle_normal",
			"battleCueId": "music.battle_normal",
			"restoredContext": "cave",
			"restoredCueId": "music.cave",
			"phaseSeconds": [3.4, 4.2, 3.6],
			"note": "返回时不能错切城镇或野外，也不能重新叠出第二路洞窟音乐。",
		},
	]


static func masking_step() -> Dictionary:
	return {
		"id": "07_default_mix",
		"number": "07 / 07",
		"section": SECTION_MASKING,
		"label": "默认音量 · 战斗关键反馈遮蔽检查",
		"worldContext": "wilderness",
		"battleContext": "battle_normal",
		"battleCueId": "music.battle_normal",
		"musicVolume": DEFAULT_MUSIC_VOLUME,
		"sfxVolume": DEFAULT_SFX_VOLUME,
		"leadSeconds": 2.4,
		"note": "音乐 72%、音效 86%；四个关键反馈应清楚浮在普通战斗音乐之上。",
		"cues": [
			{
				"cueId": "combat.hit_heavy",
				"label": "重击命中",
				"waitAfterSeconds": 1.55,
				"priority": 88,
			},
			{
				"cueId": "combat.launch",
				"label": "击飞破空",
				"waitAfterSeconds": 1.65,
				"priority": 92,
			},
			{
				"cueId": "combat.down",
				"label": "击倒与晕眩尾音",
				"waitAfterSeconds": 1.85,
				"priority": 94,
			},
			{
				"cueId": "outcome.victory",
				"label": "战斗胜利",
				"waitAfterSeconds": 2.35,
				"priority": 100,
			},
		],
	}


static func all_required_cue_ids() -> Array[String]:
	var result: Array[String] = []
	for cue_id_value in context_cues().values():
		var cue_id := str(cue_id_value)
		if not result.has(cue_id):
			result.append(cue_id)
	for cue in masking_step().get("cues", []):
		if not cue is Dictionary:
			continue
		var cue_id := str((cue as Dictionary).get("cueId", ""))
		if cue_id != "" and not result.has(cue_id):
			result.append(cue_id)
	return result


static func validation_errors() -> Array[String]:
	var errors: Array[String] = []
	var independent := independent_steps()
	var transitions := transition_steps()
	var mix := masking_step()
	var mappings := context_cues()

	_expect(
		independent.size() == INDEPENDENT_STEP_COUNT,
		"独立试听必须且只能包含城镇、野外、洞窟、普通战斗四段",
		errors
	)
	_expect(
		transitions.size() == TRANSITION_STEP_COUNT,
		"往返试听必须且只能包含野外与洞窟两组",
		errors
	)
	var numbers: Array[String] = []
	var independent_contexts: Array[String] = []
	for step in independent:
		var step_id := str(step.get("id", ""))
		var context := str(step.get("context", ""))
		var cue_id := str(step.get("cueId", ""))
		numbers.append(str(step.get("number", "")))
		independent_contexts.append(context)
		_expect(
			str(mappings.get(context, "")) == cue_id,
			"独立试听 context/cue 映射错误：%s" % step_id,
			errors
		)
		_expect(
			[OP_WORLD, OP_BATTLE].has(str(step.get("operation", ""))),
			"独立试听操作类型无效：%s" % step_id,
			errors
		)
		_expect(
			float(step.get("listenSeconds", 0.0)) >= 5.0,
			"独立试听时间不足 5 秒：%s" % step_id,
			errors
		)
		_expect_chinese_text(step, step_id, errors)
	_expect(
		independent_contexts == ["town", "wilderness", "cave", "battle_normal"],
		"独立试听顺序不是城镇、野外、洞窟、普通战斗",
		errors
	)

	for step in transitions:
		var step_id := str(step.get("id", ""))
		numbers.append(str(step.get("number", "")))
		var world_context := str(step.get("worldContext", ""))
		var restored_context := str(step.get("restoredContext", ""))
		var phase_seconds = step.get("phaseSeconds", [])
		_expect(
			world_context == restored_context,
			"战斗结束未声明恢复同一地图语境：%s" % step_id,
			errors
		)
		_expect(
			str(step.get("worldCueId", "")) == str(mappings.get(world_context, "")),
			"往返试听地图 cue 错误：%s" % step_id,
			errors
		)
		_expect(
			str(step.get("battleContext", "")) == "battle_normal"
			and str(step.get("battleCueId", "")) == str(mappings.get("battle_normal", "")),
			"往返试听没有进入普通战斗音乐：%s" % step_id,
			errors
		)
		_expect(
			str(step.get("restoredCueId", "")) == str(mappings.get(restored_context, "")),
			"往返试听恢复 cue 错误：%s" % step_id,
			errors
		)
		_expect(
			phase_seconds is Array and (phase_seconds as Array).size() == 3,
			"往返试听必须声明地图、战斗、恢复三段时长：%s" % step_id,
			errors
		)
		_expect_chinese_text(step, step_id, errors)

	numbers.append(str(mix.get("number", "")))
	var mix_cues = mix.get("cues", [])
	_expect(
		mix_cues is Array and (mix_cues as Array).size() == MASKING_CUE_COUNT,
		"默认音量遮蔽检查不是四个关键反馈",
		errors
	)
	var actual_mix_ids: Array[String] = []
	if mix_cues is Array:
		for cue_value in mix_cues as Array:
			if not cue_value is Dictionary:
				errors.append("默认音量遮蔽检查含非字典 cue")
				continue
			var cue := cue_value as Dictionary
			actual_mix_ids.append(str(cue.get("cueId", "")))
			_expect(
				str(cue.get("label", "")).strip_edges() != "",
				"默认音量 cue 缺少中文名称：%s" % str(cue.get("cueId", "")),
				errors
			)
			_expect(
				float(cue.get("waitAfterSeconds", 0.0)) >= 1.0,
				"默认音量 cue 留听时间不足：%s" % str(cue.get("cueId", "")),
				errors
			)
	_expect(
		actual_mix_ids == [
			"combat.hit_heavy",
			"combat.launch",
			"combat.down",
			"outcome.victory",
		],
		"默认音量遮蔽检查 cue 顺序错误",
		errors
	)
	_expect(
		is_equal_approx(float(mix.get("musicVolume", -1.0)), DEFAULT_MUSIC_VOLUME),
		"遮蔽检查没有锁定默认音乐音量 0.72",
		errors
	)
	_expect(
		is_equal_approx(float(mix.get("sfxVolume", -1.0)), DEFAULT_SFX_VOLUME),
		"遮蔽检查没有锁定默认音效音量 0.86",
		errors
	)
	_expect(
		numbers == [
			"01 / 07",
			"02 / 07",
			"03 / 07",
			"04 / 07",
			"05 / 07",
			"06 / 07",
			"07 / 07",
		],
		"试听编号不是连续 01—07",
		errors
	)
	_expect(
		OWNER_REVIEW_STATE == "owner_listening_pending",
		"正式背景音乐在所有者试听前不得标记为通过",
		errors
	)
	_expect_chinese_text(mix, str(mix.get("id", "07_default_mix")), errors)
	return errors


static func _expect_chinese_text(
	step: Dictionary,
	step_id: String,
	errors: Array[String]
) -> void:
	_expect(
		str(step.get("label", "")).strip_edges() != "",
		"试听段落缺少中文名称：%s" % step_id,
		errors
	)
	_expect(
		str(step.get("note", "")).strip_edges() != "",
		"试听段落缺少中文说明：%s" % step_id,
		errors
	)


static func _expect(
	condition: bool,
	message: String,
	errors: Array[String]
) -> void:
	if not condition:
		errors.append(message)
