extends RefCounted

const COMMAND_ID := "gm_pet_evolution_qa"
const MANIFEST_ID := "pet_evolution_qa_v1"


static func request_payload() -> Dictionary:
	return {"manifestId": MANIFEST_ID}


static func status_state_from_parsed(parsed: Dictionary) -> Dictionary:
	if not bool(parsed.get("ok", false)):
		return {"ok": false, "message": str(parsed.get("message", "宠物进化验收档准备失败。"))}
	var result := parsed.get("result", {}) as Dictionary if parsed.get("result", {}) is Dictionary else {}
	var summary := result.get("summary", {}) as Dictionary if result.get("summary", {}) is Dictionary else {}
	var samples := result.get("samples", []) as Array if result.get("samples", []) is Array else []
	var materials := result.get("materials", []) as Array if result.get("materials", []) is Array else []
	var asset_gate := result.get("assetGate", {}) as Dictionary if result.get("assetGate", {}) is Dictionary else {}
	if (
		not bool(parsed.get("profileApplied", false))
		or not _valid_summary(summary)
		or samples.size() != 4
		or samples.any(func(sample) -> bool: return not _valid_sample(sample))
		or materials.size() != 3
		or materials.any(func(material) -> bool: return not _valid_material(material))
		or not _valid_asset_gate(asset_gate)
	):
		return {"ok": false, "message": "宠物进化验收档同步尚未确认，请勿重复操作，正在重新拉取。"}
	return {
		"ok": true,
		"summary": summary.duplicate(true),
		"samples": samples.duplicate(true),
		"materials": materials.duplicate(true),
		"assetGate": asset_gate.duplicate(true),
	}


static func primary_instance_id(state: Dictionary) -> String:
	if not bool(state.get("ok", false)):
		return ""
	var summary := state.get("summary", {}) as Dictionary if state.get("summary", {}) is Dictionary else {}
	return str(summary.get("primaryInstanceId", "")).strip_edges()


static func status_text(state: Dictionary) -> String:
	var lines: Array[String] = [
		"[color=#79d8db]宠物进化验收档[/color]",
		"首次准备乌力/风狐各1只未达P90与1只已达P90样本，并补齐两次进化所需资格、材料和绑定石币。",
		"再次执行只补足验收下限并刷新判断；不会重抽、覆盖或补发已经删除的样本。",
	]
	if state.is_empty():
		lines.append("准备后自动选中达标乌力；正式美术完成前玩家进化入口仍保持关闭。")
		return "\n".join(lines)
	if bool(state.get("pending", false)):
		lines.append("正在由服务器生成并持久化4只代表样本，请稍候……")
		return "\n".join(lines)
	if not bool(state.get("ok", false)):
		lines.append("[color=#f0a4a4]%s[/color]" % str(state.get("message", "宠物进化验收档准备失败。")))
		return "\n".join(lines)
	var summary := state.get("summary", {}) as Dictionary
	for sample_value in state.get("samples", []) as Array:
		var sample := sample_value as Dictionary
		var expected := "应达标" if bool(sample.get("expectedEligible", false)) else "应拒绝"
		var actual := "可进化" if bool(sample.get("eligible", false)) else "未达门槛"
		var color := "#9fe6b1" if bool(sample.get("matchesExpectation", false)) else "#f0a4a4"
		lines.append("[color=%s]%s｜%s %d / %d｜%s，%s[/color]" % [
			color,
			str(sample.get("name", sample.get("sourceFormName", "样本"))),
			"成长战力",
			int(sample.get("intrinsicCombatPower", 0)),
			int(sample.get("minimumIntrinsicCombatPower", 0)),
			expected,
			actual,
		])
	var material_parts: Array[String] = []
	for material_value in state.get("materials", []) as Array:
		var material := material_value as Dictionary
		material_parts.append("%s %d/%d" % [
			str(material.get("label", "材料")),
			int(material.get("available", 0)),
			int(material.get("required", 0)),
		])
	lines.append("材料：%s；绑定石币 %s。" % [
		" / ".join(material_parts),
		_grouped_number(int(summary.get("boundStoneCoins", 0))),
	])
	var asset_gate := state.get("assetGate", {}) as Dictionary
	var route_states: Array[String] = []
	for route_value in asset_gate.get("routes", []) as Array:
		var route := route_value as Dictionary
		route_states.append("%s %s" % [
			str(route.get("targetFormName", "进化形态")),
			"正式" if str(route.get("status", "")) == "formal" else "待正式资源",
		])
	lines.append("生产门禁：%s；当前%s。" % [
		" / ".join(route_states),
		"已开放" if bool(asset_gate.get("productionOpen", false)) else "未开放，不会消耗玩家资产",
	])
	lines.append("档案：r%d → r%d；本次新增 %d 只，代表判断 %d/4 符合预期。" % [
		int(summary.get("profileRevisionBefore", 0)),
		int(summary.get("profileRevisionAfter", 0)),
		int(summary.get("samplesCreated", 0)),
		int(summary.get("expectationMatchedCount", 0)),
	])
	return "\n".join(lines)


static func contract_check() -> Dictionary:
	var samples: Array[Dictionary] = []
	for fixture in [
		["wuli_low", "进化验收·乌力未达标", "高防乌力", "晶甲乌力", 1298, 1345, false],
		["wuli_high", "进化验收·乌力达标", "高防乌力", "晶甲乌力", 1410, 1345, true],
		["fox_low", "进化验收·风狐未达标", "高地风狐", "月岚风狐", 1389, 1437, false],
		["fox_high", "进化验收·风狐达标", "高地风狐", "月岚风狐", 1492, 1437, true],
	]:
		var expected := bool(fixture[6])
		samples.append({
			"schemaVersion": 1,
			"slotId": str(fixture[0]),
			"instanceId": "pet_%s" % str(fixture[0]),
			"routeId": "wuli_crystal_evolution_v1" if str(fixture[0]).begins_with("wuli") else "driftfox_moon_gale_evolution_v1",
			"sourceFormName": str(fixture[2]),
			"targetFormName": str(fixture[3]),
			"present": true,
			"name": str(fixture[1]),
			"level": 140,
			"rebirthCount": 1,
			"expectedEligible": expected,
			"eligible": expected,
			"matchesExpectation": true,
			"eligibilityCode": "ok" if expected else "pet_evolution_power_below_p90",
			"eligibilityMessage": "已达到同形态P90进化门槛。" if expected else "成长战力未达到门槛。",
			"intrinsicCombatPower": int(fixture[4]),
			"minimumIntrinsicCombatPower": int(fixture[5]),
			"requiredPercentile": 90,
		})
	var parsed := {
		"ok": true,
		"profileApplied": true,
		"result": {
			"summary": {
				"schemaVersion": 1,
				"manifestId": MANIFEST_ID,
				"changed": true,
				"alreadyPrepared": false,
				"samplesCreated": 4,
				"sampleCount": 4,
				"presentCount": 4,
				"expectationMatchedCount": 4,
				"partyAdded": 4,
				"storageAdded": 0,
				"abilitiesAdded": 2,
				"materialItemsAdded": 40,
				"primaryInstanceId": "pet_wuli_high",
				"profileRevisionBefore": 9,
				"profileRevisionAfter": 10,
				"boundStoneCoins": 600000,
			},
			"samples": samples,
			"materials": [
				{"itemId": "pet_evolution_resonance_core", "label": "共鸣兽核", "binding": "bound", "required": 16, "available": 16},
				{"itemId": "pet_evolution_wuli_crystal_scale", "label": "岩晶甲片", "binding": "unbound", "required": 12, "available": 12},
				{"itemId": "pet_evolution_driftfox_moon_plume", "label": "月岚尾羽", "binding": "unbound", "required": 12, "available": 12},
			],
			"assetGate": {
				"schemaVersion": 1,
				"runtimeEnabled": false,
				"productionOpen": false,
				"routes": [
					{"routeId": "wuli_crystal_evolution_v1", "targetFormName": "晶甲乌力", "status": "deferred"},
					{"routeId": "driftfox_moon_gale_evolution_v1", "targetFormName": "月岚风狐", "status": "deferred"},
				],
			},
		},
	}
	var state := status_state_from_parsed(parsed)
	var text := status_text(state)
	return {
		"ok": (
			bool(state.get("ok", false))
			and primary_instance_id(state) == "pet_wuli_high"
			and text.find("成长战力 1410 / 1345") >= 0
			and text.find("晶甲乌力 待正式资源") >= 0
			and text.find("未开放，不会消耗玩家资产") >= 0
			and text.find("privateSeed") < 0
			and text.find("operationId") < 0
		),
		"state": state,
	}


static func _valid_summary(summary: Dictionary) -> bool:
	if (
		int(summary.get("schemaVersion", 0)) != 1
		or str(summary.get("manifestId", "")) != MANIFEST_ID
		or not (summary.get("changed", null) is bool)
		or not (summary.get("alreadyPrepared", null) is bool)
		or str(summary.get("primaryInstanceId", "")).strip_edges() == ""
	):
		return false
	for key in ["samplesCreated", "sampleCount", "presentCount", "expectationMatchedCount", "partyAdded", "storageAdded", "abilitiesAdded", "materialItemsAdded", "profileRevisionBefore", "profileRevisionAfter", "boundStoneCoins"]:
		if not _is_nonnegative_integer(summary.get(key, null)):
			return false
	return (
		int(summary.get("sampleCount", 0)) == 4
		and int(summary.get("presentCount", 0)) <= 4
		and int(summary.get("expectationMatchedCount", 0)) <= 4
	)


static func _valid_sample(value) -> bool:
	if not (value is Dictionary):
		return false
	var sample := value as Dictionary
	if (
		int(sample.get("schemaVersion", 0)) != 1
		or str(sample.get("slotId", "")).strip_edges() == ""
		or str(sample.get("instanceId", "")).strip_edges() == ""
		or str(sample.get("routeId", "")).strip_edges() == ""
		or str(sample.get("sourceFormName", "")).strip_edges() == ""
		or str(sample.get("targetFormName", "")).strip_edges() == ""
		or not (sample.get("present", null) is bool)
		or not (sample.get("expectedEligible", null) is bool)
		or not (sample.get("eligible", null) is bool)
		or not (sample.get("matchesExpectation", null) is bool)
		or not _is_nonnegative_integer(sample.get("intrinsicCombatPower", null))
		or not _is_positive_integer(sample.get("minimumIntrinsicCombatPower", null))
		or int(sample.get("requiredPercentile", 0)) != 90
	):
		return false
	if bool(sample.get("present", false)):
		return (
			str(sample.get("name", "")).strip_edges() != ""
			and int(sample.get("level", 0)) == 140
			and int(sample.get("rebirthCount", 0)) == 1
		)
	return str(sample.get("eligibilityCode", "")) == "sample_missing"


static func _valid_material(value) -> bool:
	if not (value is Dictionary):
		return false
	var material := value as Dictionary
	return (
		str(material.get("itemId", "")).strip_edges() != ""
		and str(material.get("label", "")).strip_edges() != ""
		and ["bound", "unbound"].has(str(material.get("binding", "")))
		and _is_positive_integer(material.get("required", null))
		and _is_nonnegative_integer(material.get("available", null))
	)


static func _valid_asset_gate(value: Dictionary) -> bool:
	if (
		int(value.get("schemaVersion", 0)) != 1
		or not (value.get("runtimeEnabled", null) is bool)
		or not (value.get("productionOpen", null) is bool)
		or not (value.get("routes", null) is Array)
		or (value.get("routes", []) as Array).size() != 2
	):
		return false
	if bool(value.get("productionOpen", false)) and not bool(value.get("runtimeEnabled", false)):
		return false
	for raw_route in value.get("routes", []) as Array:
		if not (raw_route is Dictionary):
			return false
		var route := raw_route as Dictionary
		if (
			str(route.get("routeId", "")).strip_edges() == ""
			or str(route.get("targetFormName", "")).strip_edges() == ""
			or not ["deferred", "formal"].has(str(route.get("status", "")))
		):
			return false
	return true


static func _is_nonnegative_integer(value) -> bool:
	return (value is int and int(value) >= 0) or (value is float and is_finite(float(value)) and float(value) >= 0 and floorf(float(value)) == float(value))


static func _is_positive_integer(value) -> bool:
	return _is_nonnegative_integer(value) and int(value) >= 1


static func _grouped_number(value: int) -> String:
	var text := str(maxi(0, value))
	var parts: Array[String] = []
	while text.length() > 3:
		parts.push_front(text.substr(text.length() - 3))
		text = text.substr(0, text.length() - 3)
	parts.push_front(text)
	return ",".join(parts)
