extends RefCounted


static func capacity_state(party_count: int, storage_count: int, party_limit: int, storage_limit: int) -> Dictionary:
	var safe_party_limit := maxi(0, party_limit)
	var safe_storage_limit := maxi(0, storage_limit)
	var total := safe_party_limit + safe_storage_limit
	var used := clampi(maxi(0, party_count) + maxi(0, storage_count), 0, total)
	var remaining := maxi(0, total - used)
	var suffix := "满栏时会自动停止捕捉与挂机。"
	if remaining <= 0:
		suffix = "位置已满，自动捕捉与挂机会停止。"
	elif remaining <= 2:
		suffix = "接近满栏，建议先清理位置。"
	return {
		"used": used,
		"total": total,
		"remaining": remaining,
		"warning": remaining <= 2,
		"text": "宠物位置：已用 %d/%d，剩余 %d 格。%s" % [used, total, remaining, suffix],
	}


static func growth_guidance_text(online_safe_mode: bool) -> String:
	if online_safe_mode:
		return "联网不会自动丢弃宠物。捕获时先看 Lv1 四维，建议训练到约 Lv20 再判断成长。"
	return "捕获时先看 Lv1 四维，建议训练到约 Lv20 再判断成长；低战力丢弃不会识别隐藏成长，请谨慎使用。"


static func public_filter_guidance_text() -> String:
	return "公开条件用于选择目标；元素不勾选、同形态最多或四维边界为 0 时不限。Lv1 四维只能抓回后评价。当前无论命中都保留，不会自动处理宠物。"


static func contract_check() -> Dictionary:
	var roomy := capacity_state(3, 4, 5, 20)
	var near_full := capacity_state(5, 18, 5, 20)
	var full := capacity_state(5, 20, 5, 20)
	var online_text := growth_guidance_text(true)
	var local_text := growth_guidance_text(false)
	var filter_text := public_filter_guidance_text()
	return {
		"ok": (
			int(roomy.get("used", -1)) == 7
			and int(roomy.get("remaining", -1)) == 18
			and not bool(roomy.get("warning", true))
			and str(roomy.get("text", "")).find("已用 7/25") >= 0
			and int(near_full.get("remaining", -1)) == 2
			and bool(near_full.get("warning", false))
			and str(near_full.get("text", "")).find("接近满栏") >= 0
			and int(full.get("remaining", -1)) == 0
			and bool(full.get("warning", false))
			and str(full.get("text", "")).find("位置已满") >= 0
			and online_text.find("联网不会自动丢弃宠物") >= 0
			and online_text.find("约 Lv20") >= 0
			and local_text.find("不会识别隐藏成长") >= 0
			and filter_text.find("Lv1 四维只能抓回后评价") >= 0
			and filter_text.find("无论命中都保留") >= 0
		),
		"roomy": roomy,
		"nearFull": near_full,
		"full": full,
		"onlineText": online_text,
		"localText": local_text,
		"filterText": filter_text,
	}
