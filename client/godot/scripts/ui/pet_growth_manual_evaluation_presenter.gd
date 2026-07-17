extends RefCounted


static func guidance_text() -> String:
	return "参考线只比较已经发生的成长分位。Lv1没有成长样本；Lv2起可看趋势，Lv5、Lv10、Lv20是复核节点。仅供人工判断，不会自动训练、移动或删除宠物。"


static func evaluation_text(value) -> String:
	var result := value as Dictionary if value is Dictionary else {}
	var level := int(result.get("level", 0))
	var status := str(result.get("status", "unavailable"))
	var suffix := "\n仅供人工判断；宠物不会被自动训练、移动或删除。"
	if status == "unavailable":
		return "人工判断：成长资料不足，请结合当前属性人工确认。" + suffix
	if status == "unobserved":
		return "人工判断：Lv1尚无升级样本，先练到Lv5再看预测140、成长/级和评级。" + suffix
	if not bool(result.get("configured", false)):
		return "人工判断：尚未设置参考线。当前趋势仍显示在上方表格；可按自己的培养目标设置综合或单项分位。" + suffix

	var checks := _checks_text(result)
	var passed := bool(result.get("meetsReferences", false))
	var evidence_stage := str(result.get("evidenceStage", ""))
	var message := ""
	match evidence_stage:
		"very_early":
			message = "人工判断：Lv%d样本很少，当前%s参考线；建议继续练到Lv%d再判断。" % [
				level,
				"达到" if passed else "未达到",
				int(result.get("nextCheckpointLevel", 5)),
			]
		"early":
			message = (
				"人工判断：早期趋势达到参考线，建议继续练到Lv10复核。"
				if passed
				else "人工判断：早期趋势未达到参考线，可考虑放弃；若只差一点，建议练到Lv10复核。"
			)
		"forming":
			message = (
				"人工判断：成长趋势已形成并达到参考线，建议继续练到Lv20复核。"
				if passed
				else "人工判断：成长趋势未达到参考线，可考虑放弃；若培养成本可接受，可练到Lv20复核。"
			)
		_:
			message = (
				"人工判断：已达到全部参考线，建议继续培养。"
				if passed
				else "人工判断：未达到全部参考线，可考虑放弃或按宠物定位继续观察。"
			)
	if checks != "":
		message += "\n依据：%s" % checks
	return message + suffix


static func contract_check() -> Dictionary:
	var below := {
		"configured": true,
		"status": "mature",
		"level": 20,
		"evidenceStage": "mature",
		"meetsReferences": false,
		"checks": [
			{"label": "综合", "actualPercentile": 90.0, "minimumPercentile": 91, "passed": false},
			{"label": "攻击", "actualPercentile": 91.9, "minimumPercentile": 90, "passed": true},
		],
	}
	var early := below.duplicate(true)
	early["level"] = 5
	early["evidenceStage"] = "early"
	var mature_text := evaluation_text(below)
	var early_text := evaluation_text(early)
	var unobserved_text := evaluation_text({"status": "unobserved", "level": 1})
	var guidance := guidance_text()
	return {
		"ok": (
			mature_text.find("可考虑放弃") >= 0
			and mature_text.find("综合 90%＜91%") >= 0
			and mature_text.find("攻击 91.9%≥90%") >= 0
			and mature_text.find("不会被自动训练、移动或删除") >= 0
			and early_text.find("早期趋势") >= 0
			and early_text.find("Lv10复核") >= 0
			and unobserved_text.find("Lv1尚无升级样本") >= 0
			and unobserved_text.find("预测140") >= 0
			and guidance.find("Lv5、Lv10、Lv20") >= 0
			and guidance.find("不会自动训练、移动或删除宠物") >= 0
		),
		"matureText": mature_text,
		"earlyText": early_text,
		"unobservedText": unobserved_text,
		"guidance": guidance,
	}


static func _checks_text(result: Dictionary) -> String:
	var parts: PackedStringArray = []
	var checks_value = result.get("checks", [])
	if checks_value is Array:
		for entry in checks_value as Array:
			if not (entry is Dictionary):
				continue
			var check := entry as Dictionary
			parts.append("%s %s%%%s%d%%" % [
				str(check.get("label", "成长")),
				_percentile_text(check.get("actualPercentile", 0.0)),
				"≥" if bool(check.get("passed", false)) else "＜",
				int(check.get("minimumPercentile", 0)),
			])
	return "；".join(parts) + ("。" if not parts.is_empty() else "")


static func _percentile_text(value) -> String:
	var number := float(value)
	if is_equal_approx(number, round(number)):
		return str(int(round(number)))
	return "%.1f" % number
