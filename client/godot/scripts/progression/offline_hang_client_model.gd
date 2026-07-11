class_name OfflineHangClientModel
extends RefCounted


static func session_from_profile(profile: Dictionary) -> Dictionary:
	var offline_hang = profile.get("offlineHang", {})
	if not (offline_hang is Dictionary):
		return {}
	var session = (offline_hang as Dictionary).get("session", {})
	return (session as Dictionary).duplicate(true) if session is Dictionary else {}


static func active_session(profile: Dictionary) -> bool:
	return str(session_from_profile(profile).get("status", "")) == "active"


static func active_session_id(profile: Dictionary) -> String:
	var session := session_from_profile(profile)
	return str(session.get("sessionId", "")).strip_edges() if str(session.get("status", "")) == "active" else ""


static func login_notice(profile: Dictionary) -> String:
	return "离线挂机收益正在累计，打开“内挂 → 挂机”即可查看或领取。" if active_session(profile) else ""


static func view(profile: Dictionary, cached_status: Dictionary = {}) -> Dictionary:
	var session := session_from_profile(profile)
	var active := str(session.get("status", "")) == "active"
	var config = cached_status.get("config", {}) as Dictionary if cached_status.get("config", {}) is Dictionary else {}
	var offline = cached_status.get("offlineHang", {}) as Dictionary if cached_status.get("offlineHang", {}) is Dictionary else {}
	var lines: Array[String] = []
	if active:
		var credited_minutes := maxi(0, int(offline.get("creditedMinutes", 0)))
		if cached_status.is_empty():
			lines.append("离线修行正在累计，刷新后可查看有效时长。")
		else:
			lines.append("已累计 %s，可领取时按服务器规则折算。" % duration_text(credited_minutes))
		if bool(offline.get("capped", false)):
			lines.append("已达到本服离线收益封顶，继续等待不会增加收益。")
	else:
		lines.append("在适合当前等级的练级区开始；离线只获得修行经验和石币。")
	if not config.is_empty():
		lines.append("本服比例 %d%% · 最多 %s · %d 秒/场基准" % [
			int(round(float(config.get("rewardRatePercent", 50.0)))),
			duration_text(maxi(0, int(config.get("maxMinutes", 480)))),
			maxi(1, int(config.get("battleIntervalSeconds", 30))),
		])
	return {
		"active": active,
		"sessionId": str(session.get("sessionId", "")),
		"lines": lines,
		"canStart": not active,
		"canClaim": active,
		"canCancel": active,
		"schemaVersion": 1,
	}


static func duration_text(minutes: int) -> String:
	var safe := maxi(0, minutes)
	var hours := safe / 60
	var remaining := safe % 60
	if hours <= 0:
		return "%d 分钟" % remaining
	if remaining <= 0:
		return "%d 小时" % hours
	return "%d 小时 %d 分钟" % [hours, remaining]
