extends RefCounted

const MAX_VISIBLE_ITEMS := 5


static func preview_text(preview_value, server_confirmed: bool = false) -> String:
	var preview := preview_value as Dictionary if preview_value is Dictionary else {}
	var prefix := "服务器已确认预览" if server_confirmed else "即时预览"
	if not bool(preview.get("configured", false)):
		return "%s：尚未设置成长保留门槛。0 表示不限；当前仅模拟，不会移动或删除宠物。" % prefix
	var summary_value = preview.get("summary", {})
	var summary := summary_value as Dictionary if summary_value is Dictionary else {}
	var total := int(summary.get("total", 0))
	if total <= 0:
		return "%s：当前没有可预览宠物。此功能仅模拟，不会移动或删除宠物。" % prefix
	var lines: PackedStringArray = []
	lines.append("%s：共 %d 只；将保留 %d 只，待处理 %d 只，观察中 %d 只，资料不足 %d 只。" % [
		prefix,
		total,
		int(summary.get("wouldKeep", 0)),
		int(summary.get("wouldHandle", 0)),
		int(summary.get("observing", 0)),
		int(summary.get("unavailable", 0)),
	])
	var items_value = preview.get("items", [])
	if items_value is Array:
		var items := items_value as Array
		for index in range(mini(items.size(), MAX_VISIBLE_ITEMS)):
			if items[index] is Dictionary:
				lines.append(_item_text(items[index] as Dictionary))
		if items.size() > MAX_VISIBLE_ITEMS or bool(preview.get("truncated", false)):
			lines.append("其余宠物请调整队伍或兽栏后继续查看。")
	lines.append("当前只做结果预演，不会移动、丢弃或改写任何宠物。")
	return "\n".join(lines)


static func contract_check() -> Dictionary:
	var preview := {
		"configured": true,
		"summary": {"total": 2, "wouldKeep": 0, "wouldHandle": 1, "observing": 1, "unavailable": 0},
		"items": [
			{
				"status": "would_handle",
				"pet": {"name": "蓝人龙预览", "level": 20},
				"checks": [
					{"label": "综合", "actualPercentile": 90.0, "minimumPercentile": 91, "passed": false},
					{"label": "攻击", "actualPercentile": 91.9, "minimumPercentile": 90, "passed": true},
				],
			},
			{
				"status": "observing",
				"pet": {"name": "蓝人龙幼体", "level": 19},
				"growth": {"minimumLevel": 20},
			},
		],
	}
	var local_text := preview_text(preview)
	var server_text := preview_text(preview, true)
	var disabled_text := preview_text({"configured": false})
	return {
		"ok": (
			local_text.find("即时预览") >= 0
			and local_text.find("若开启，将进入待处理") >= 0
			and local_text.find("综合 90%＜91%") >= 0
			and local_text.find("攻击 91.9%≥90%") >= 0
			and local_text.find("Lv20 后判断") >= 0
			and local_text.find("不会移动、丢弃或改写任何宠物") >= 0
			and server_text.find("服务器已确认预览") >= 0
			and disabled_text.find("0 表示不限") >= 0
			and disabled_text.find("不会移动或删除宠物") >= 0
		),
		"localText": local_text,
		"serverText": server_text,
		"disabledText": disabled_text,
	}


static func _item_text(item: Dictionary) -> String:
	var pet_value = item.get("pet", {})
	var pet := pet_value as Dictionary if pet_value is Dictionary else {}
	var name := str(pet.get("name", "宠物")).strip_edges()
	if name == "":
		name = "宠物"
	var identity := "%s Lv%d" % [name, int(pet.get("level", 0))]
	match str(item.get("status", "")):
		"would_handle":
			return "%s：若开启，将进入待处理。%s" % [identity, _checks_text(item)]
		"would_keep":
			return "%s：若开启，将保留。%s" % [identity, _checks_text(item)]
		"observing":
			var growth_value = item.get("growth", {})
			var growth := growth_value as Dictionary if growth_value is Dictionary else {}
			return "%s：成长观察中，Lv%d 后判断。" % [identity, int(growth.get("minimumLevel", 20))]
		"not_configured":
			return "%s：尚未设置成长保留门槛。" % identity
		_:
			return "%s：成长资料不足，始终保留。" % identity


static func _checks_text(item: Dictionary) -> String:
	var parts: PackedStringArray = []
	var checks_value = item.get("checks", [])
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
