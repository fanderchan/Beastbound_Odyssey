extends RefCounted

const SCHEMA_VERSION := 1
const MODE_ENHANCE := "enhance"
const MODE_REBIRTH := "rebirth"
const REBIRTH_REQUIRED_LEVEL := 140
const MAX_ENHANCE_LEVEL := 10
const MAX_HISTORY_RECORDS := 20


static func normalized_record(value) -> Dictionary:
	var source := value as Dictionary if value is Dictionary else {}
	var history: Array[Dictionary] = []
	var raw_history = source.get("history", [])
	if raw_history is Array:
		for entry_value in raw_history:
			if not (entry_value is Dictionary):
				continue
			history.append((entry_value as Dictionary).duplicate(true))
	while history.size() > MAX_HISTORY_RECORDS:
		history.pop_front()
	var last_preview = source.get("lastPreview", {})
	var last_result = source.get("lastResult", {})
	return {
		"schemaVersion": SCHEMA_VERSION,
		"rebirthCount": maxi(0, int(source.get("rebirthCount", 0))),
		"enhanceLevel": clampi(int(source.get("enhanceLevel", 0)), 0, MAX_ENHANCE_LEVEL),
		"history": history,
		"lastPreview": last_preview.duplicate(true) if last_preview is Dictionary else {},
		"lastResult": last_result.duplicate(true) if last_result is Dictionary else {},
	}


static func preview_for_pet(pet: Dictionary, mode: String = "") -> Dictionary:
	if pet.is_empty():
		return _preview(false, MODE_ENHANCE, "请选择宠物。", [], normalized_record({}))
	var record := normalized_record(pet.get("petCultivation", {}))
	var resolved_mode := _resolved_mode(pet, mode)
	if resolved_mode == MODE_REBIRTH:
		return _rebirth_preview(pet, record)
	return _enhance_preview(pet, record)


static func apply_to_pet(pet: Dictionary, mode: String = "", now_sec: int = -1) -> Dictionary:
	var preview := preview_for_pet(pet, mode)
	if not bool(preview.get("ok", false)):
		return {
			"ok": false,
			"pet": pet.duplicate(true),
			"preview": preview,
			"message": str(preview.get("message", "不能培养这只宠物。")),
		}
	var now := now_sec if now_sec >= 0 else int(Time.get_unix_time_from_system())
	var next_pet := pet.duplicate(true)
	var next_record := normalized_record(preview.get("nextCultivation", {}))
	var event := _result_event(pet, next_pet, preview, now)
	var history: Array = next_record.get("history", [])
	history.append(event)
	while history.size() > MAX_HISTORY_RECORDS:
		history.pop_front()
	next_record["history"] = history
	next_record["lastPreview"] = preview.duplicate(true)
	next_record["lastResult"] = event.duplicate(true)
	next_pet["petCultivation"] = next_record
	next_pet["lastCultivationResult"] = event.duplicate(true)
	if str(preview.get("mode", "")) == MODE_REBIRTH:
		next_pet["level"] = 1
		next_pet["exp"] = 0
		next_pet["hp"] = 1
		next_pet["maxHp"] = 1
	return {
		"ok": true,
		"pet": next_pet,
		"preview": preview,
		"result": event,
		"message": str(event.get("message", "宠物培养完成。")),
	}


static func detail_lines_for_pet(pet: Dictionary) -> Array[String]:
	var record := normalized_record(pet.get("petCultivation", {}))
	var lines: Array[String] = []
	lines.append("培养：转生 %d 次    强化 +%d" % [
		int(record.get("rebirthCount", 0)),
		int(record.get("enhanceLevel", 0)),
	])
	var last_result = record.get("lastResult", {})
	if last_result is Dictionary and not (last_result as Dictionary).is_empty():
		var result := last_result as Dictionary
		lines.append("最近培养：%s" % str(result.get("summary", "已记录")))
	return lines


static func _resolved_mode(pet: Dictionary, mode: String) -> String:
	var normalized := mode.strip_edges().to_lower()
	if normalized == MODE_ENHANCE or normalized == MODE_REBIRTH:
		return normalized
	return MODE_REBIRTH if int(pet.get("level", 1)) >= REBIRTH_REQUIRED_LEVEL else MODE_ENHANCE


static func _enhance_preview(pet: Dictionary, record: Dictionary) -> Dictionary:
	var current := clampi(int(record.get("enhanceLevel", 0)), 0, MAX_ENHANCE_LEVEL)
	if current >= MAX_ENHANCE_LEVEL:
		return _preview(false, MODE_ENHANCE, "强化等级已到当前原型上限。", [
			"强化等级：+%d / +%d" % [current, MAX_ENHANCE_LEVEL],
			"当前阶段只保留强化记录，正式公式后续补。",
		], record)
	var next_record := record.duplicate(true)
	next_record["enhanceLevel"] = current + 1
	return _preview(true, MODE_ENHANCE, "%s 强化记录 +1。" % str(pet.get("name", "宠物")), [
		"强化预览：+%d -> +%d" % [current, current + 1],
		"数值影响：暂不改四维，只写入培养记录。",
		"用途：为后续强化公式、材料、失败率预留字段。",
	], next_record)


static func _rebirth_preview(pet: Dictionary, record: Dictionary) -> Dictionary:
	var level := int(pet.get("level", 1))
	var current_rebirth := maxi(0, int(record.get("rebirthCount", 0)))
	if level < REBIRTH_REQUIRED_LEVEL:
		return _preview(false, MODE_REBIRTH, "宠物需要 Lv%d 才能转生。" % REBIRTH_REQUIRED_LEVEL, [
			"当前等级：Lv%d" % level,
			"转生要求：Lv%d" % REBIRTH_REQUIRED_LEVEL,
		], record)
	var next_record := record.duplicate(true)
	next_record["rebirthCount"] = current_rebirth + 1
	return _preview(true, MODE_REBIRTH, "%s 完成宠物转生。" % str(pet.get("name", "宠物")), [
		"转生预览：%d转 -> %d转" % [current_rebirth, current_rebirth + 1],
		"等级变化：Lv%d -> Lv1，经验清零。" % level,
		"保留：形态、个体种子、技能槽、强化等级。",
		"数值影响：第一版只重算 Lv1 基础，不加复杂继承公式。",
	], next_record)


static func _preview(ok: bool, mode: String, message: String, lines: Array[String], next_record: Dictionary) -> Dictionary:
	return {
		"ok": ok,
		"mode": mode,
		"title": "宠物转生" if mode == MODE_REBIRTH else "宠物强化",
		"message": message,
		"lines": lines,
		"nextCultivation": normalized_record(next_record),
		"schemaVersion": SCHEMA_VERSION,
	}


static func _result_event(before_pet: Dictionary, next_pet: Dictionary, preview: Dictionary, now_sec: int) -> Dictionary:
	var mode := str(preview.get("mode", MODE_ENHANCE))
	var before_record := normalized_record(before_pet.get("petCultivation", {}))
	var next_record := normalized_record(preview.get("nextCultivation", {}))
	var summary := ""
	if mode == MODE_REBIRTH:
		summary = "%d转 -> %d转，Lv%d -> Lv1" % [
			int(before_record.get("rebirthCount", 0)),
			int(next_record.get("rebirthCount", 0)),
			int(before_pet.get("level", 1)),
		]
	else:
		summary = "强化 +%d -> +%d" % [
			int(before_record.get("enhanceLevel", 0)),
			int(next_record.get("enhanceLevel", 0)),
		]
	return {
		"schemaVersion": SCHEMA_VERSION,
		"mode": mode,
		"timestamp": now_sec,
		"petInstanceId": str(before_pet.get("instanceId", before_pet.get("petId", ""))),
		"petName": str(before_pet.get("name", "宠物")),
		"formId": str(before_pet.get("formId", before_pet.get("templateId", ""))),
		"beforeLevel": int(before_pet.get("level", 1)),
		"afterLevel": 1 if mode == MODE_REBIRTH else int(next_pet.get("level", before_pet.get("level", 1))),
		"beforeRebirthCount": int(before_record.get("rebirthCount", 0)),
		"afterRebirthCount": int(next_record.get("rebirthCount", 0)),
		"beforeEnhanceLevel": int(before_record.get("enhanceLevel", 0)),
		"afterEnhanceLevel": int(next_record.get("enhanceLevel", 0)),
		"individualSeed": str(before_pet.get("individualSeed", "")),
		"summary": summary,
		"message": "%s：%s。" % [str(before_pet.get("name", "宠物")), summary],
	}
