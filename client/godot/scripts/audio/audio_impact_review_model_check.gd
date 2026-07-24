extends RefCounted

## Pure contract check for the numbered combat-impact review sequence.
##
## This check does not create nodes, play audio, advance battle animation, or
## write user data. Main may call run() from a literal auto-check entry point.

const AudioImpactReviewModel := preload(
	"res://scripts/audio/audio_impact_review_model.gd"
)

const EXPECTED_ISOLATED_NUMBERS: Array[String] = [
	"01 / 18",
	"02 / 18",
	"03 / 18",
	"04 / 18",
	"05 / 18",
	"06 / 18",
	"07 / 18",
	"08 / 18",
	"09 / 18",
	"10 / 18",
	"11 / 18",
	"12 / 18",
	"13 / 18",
	"14 / 18",
	"15 / 18",
	"16 / 18",
	"17 / 18",
	"18 / 18",
]
const EXPECTED_LOW_BGM_NUMBERS: Array[String] = [
	"A / F",
	"B / F",
	"C / F",
	"D / F",
	"E / F",
	"F / F",
]
const EXPECTED_RESERVED_IDS: Array[String] = [
	"12_knockback_reserved",
	"16_revive_reserved",
]


static func run() -> Dictionary:
	var errors: Array[String] = []
	var isolated := AudioImpactReviewModel.isolated_steps()
	var low_bgm := AudioImpactReviewModel.low_bgm_steps()

	_expect(
		isolated.size() == AudioImpactReviewModel.ISOLATED_STEP_COUNT,
		"无背景音乐试听不是18段",
		errors
	)
	_expect(
		low_bgm.size() == AudioImpactReviewModel.LOW_BGM_STEP_COUNT,
		"低背景音乐复测不是6段",
		errors
	)
	_expect(
		_numbers(isolated) == EXPECTED_ISOLATED_NUMBERS,
		"01—18编号不连续或顺序错误",
		errors
	)
	_expect(
		_numbers(low_bgm) == EXPECTED_LOW_BGM_NUMBERS,
		"A—F编号不连续或顺序错误",
		errors
	)

	var reserved_ids: Array[String] = []
	for step in isolated:
		var step_id := str(step.get("id", ""))
		var execution := str(step.get("execution", ""))
		_expect(
			str(step.get("label", "")).strip_edges() != "",
			"试听段落缺少中文名称：%s" % step_id,
			errors
		)
		if bool(step.get("reserved", false)):
			reserved_ids.append(step_id)
			_expect(
				str(step.get("note", "")).contains("预留"),
				"预留段落缺少明确标注：%s" % step_id,
				errors
			)
			_expect(
				str(step.get("cueId", "")).strip_edges() != "",
				"预留段落缺少试听 cue：%s" % step_id,
				errors
			)
		elif execution == AudioImpactReviewModel.EXECUTION_BATTLE_EVENTS:
			_expect(
				not (step.get("events", []) as Array).is_empty(),
				"真实战斗段落缺少事件：%s" % step_id,
				errors
			)
		elif execution == AudioImpactReviewModel.EXECUTION_OUTCOME:
			_expect(
				["victory", "defeat"].has(str(step.get("result", ""))),
				"结果段落缺少有效结果：%s" % step_id,
				errors
			)
	_expect(
		reserved_ids == EXPECTED_RESERVED_IDS,
		"预留段落必须且只能是12击退与16复苏",
		errors
	)

	for step in low_bgm:
		var source_id := str(step.get("sourceStepId", ""))
		var source_step := AudioImpactReviewModel.source_step_for_mix(step)
		_expect(
			source_id != "" and not source_step.is_empty(),
			"低背景音乐复测引用无效：%s" % str(step.get("id", "")),
			errors
		)
		_expect(
			not (step.get("events", []) as Array).is_empty(),
			"低背景音乐复测缺少真实事件：%s" % str(step.get("id", "")),
			errors
		)

	_expect_event_field(
		"03_heavy_hit",
		"audioImpactClass",
		"heavy",
		errors
	)
	_expect_event_field(
		"13_launch_straight",
		"launchMode",
		"straight",
		errors
	)
	_expect_event_field(
		"14_launch_bounce",
		"launchMode",
		"bounce",
		errors
	)
	_expect_event_array_size(
		"10_combo",
		"participantIds",
		3,
		errors
	)
	_expect_event_array_size(
		"11_multi_mixed",
		"targetIds",
		3,
		errors
	)

	var model_errors := AudioImpactReviewModel.validation_errors()
	_expect(
		model_errors.is_empty(),
		"模型自检失败：%s" % "；".join(model_errors),
		errors
	)
	var review_state := AudioImpactReviewModel.build_review_state()
	_expect(
		(review_state.get("actors", []) as Array).size() == 8,
		"试听战场不是8个单位",
		errors
	)

	return {
		"schemaVersion": 1,
		"reportType": "beastbound.audio_impact_review_model_check",
		"result": "PASS" if errors.is_empty() else "FAIL",
		"isolatedStepCount": isolated.size(),
		"lowBgmStepCount": low_bgm.size(),
		"reservedStepIds": reserved_ids,
		"errors": errors,
	}


static func _numbers(steps: Array[Dictionary]) -> Array[String]:
	var result: Array[String] = []
	for step in steps:
		result.append(str(step.get("number", "")))
	return result


static func _expect_event_field(
	step_id: String,
	field: String,
	expected,
	errors: Array[String]
) -> void:
	var step := AudioImpactReviewModel.step_by_id(step_id)
	var events: Array = step.get("events", [])
	if events.is_empty() or not (events[0] is Dictionary):
		errors.append("试听段落缺少首个事件：%s" % step_id)
		return
	var event := events[0] as Dictionary
	_expect(
		event.get(field) == expected,
		"试听段落 %s 的 %s 不符合合同" % [step_id, field],
		errors
	)


static func _expect_event_array_size(
	step_id: String,
	field: String,
	expected_size: int,
	errors: Array[String]
) -> void:
	var step := AudioImpactReviewModel.step_by_id(step_id)
	var events: Array = step.get("events", [])
	if events.is_empty() or not (events[0] is Dictionary):
		errors.append("试听段落缺少首个事件：%s" % step_id)
		return
	var event := events[0] as Dictionary
	var values = event.get(field, [])
	_expect(
		values is Array and (values as Array).size() == expected_size,
		"试听段落 %s 的 %s 数量错误" % [step_id, field],
		errors
	)


static func _expect(
	condition: bool,
	message: String,
	errors: Array[String]
) -> void:
	if not condition:
		errors.append(message)
