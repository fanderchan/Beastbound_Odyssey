extends RefCounted

const SETTINGS_KEY := "hangSettings"
const SESSION_KEY := "hangSession"

const LOW_HP_STOP_PERCENT_KEY := "lowHpStopPercent"
const LOW_HP_ACTION_KEY := "lowHpAction"
const RESUME_AFTER_HEAL_KEY := "resumeAfterHeal"
const CAPTURE_TARGET_COUNT_KEY := "captureTargetCount"
const STOP_NEVER := -1
const STOP_ON_DEATH := 0
const STOP_PERCENT_OPTIONS: Array[int] = [STOP_NEVER, STOP_ON_DEATH, 10, 20, 30, 50]
const LOW_HP_ACTION_STOP := "stop"
const LOW_HP_ACTION_TOWN_HEAL := "town_heal"
const LOW_HP_ACTIONS: Array[String] = [LOW_HP_ACTION_STOP, LOW_HP_ACTION_TOWN_HEAL]
const MAX_CAPTURE_TARGET_COUNT := 99

const SESSION_ENABLED_KEY := "enabled"
const SESSION_MODE_KEY := "mode"
const SESSION_CAPTURE_SUCCESS_COUNT_KEY := "captureSuccessCount"
const SESSION_BATTLE_COUNT_KEY := "battleCount"
const SESSION_PENDING_RESUME_KEY := "pendingResume"
const SESSION_LAST_STOP_REASON_KEY := "lastStopReason"
const SESSION_ORIGIN_MAP_ID_KEY := "originMapId"
const SESSION_ORIGIN_CELL_KEY := "originCell"


static func default_settings() -> Dictionary:
	return {
		LOW_HP_STOP_PERCENT_KEY: STOP_ON_DEATH,
		LOW_HP_ACTION_KEY: LOW_HP_ACTION_STOP,
		RESUME_AFTER_HEAL_KEY: true,
		CAPTURE_TARGET_COUNT_KEY: 0,
	}


static func normalize_settings(value) -> Dictionary:
	var raw := value as Dictionary if value is Dictionary else {}
	return {
		LOW_HP_STOP_PERCENT_KEY: normalized_low_hp_stop_percent(raw.get(LOW_HP_STOP_PERCENT_KEY, STOP_ON_DEATH)),
		LOW_HP_ACTION_KEY: normalized_low_hp_action(raw.get(LOW_HP_ACTION_KEY, LOW_HP_ACTION_STOP)),
		RESUME_AFTER_HEAL_KEY: bool(raw.get(RESUME_AFTER_HEAL_KEY, true)),
		CAPTURE_TARGET_COUNT_KEY: clampi(int(raw.get(CAPTURE_TARGET_COUNT_KEY, 0)), 0, MAX_CAPTURE_TARGET_COUNT),
	}


static func default_session() -> Dictionary:
	return {
		SESSION_ENABLED_KEY: false,
		SESSION_MODE_KEY: "",
		SESSION_CAPTURE_SUCCESS_COUNT_KEY: 0,
		SESSION_BATTLE_COUNT_KEY: 0,
		SESSION_PENDING_RESUME_KEY: false,
		SESSION_LAST_STOP_REASON_KEY: "",
		SESSION_ORIGIN_MAP_ID_KEY: "",
		SESSION_ORIGIN_CELL_KEY: [0, 0],
	}


static func normalize_session(value) -> Dictionary:
	var raw := value as Dictionary if value is Dictionary else {}
	var cell_value = raw.get(SESSION_ORIGIN_CELL_KEY, [0, 0])
	var cell := [0, 0]
	if cell_value is Array and (cell_value as Array).size() >= 2:
		cell = [int((cell_value as Array)[0]), int((cell_value as Array)[1])]
	return {
		SESSION_ENABLED_KEY: bool(raw.get(SESSION_ENABLED_KEY, false)),
		SESSION_MODE_KEY: str(raw.get(SESSION_MODE_KEY, "")),
		SESSION_CAPTURE_SUCCESS_COUNT_KEY: maxi(0, int(raw.get(SESSION_CAPTURE_SUCCESS_COUNT_KEY, 0))),
		SESSION_BATTLE_COUNT_KEY: maxi(0, int(raw.get(SESSION_BATTLE_COUNT_KEY, 0))),
		SESSION_PENDING_RESUME_KEY: bool(raw.get(SESSION_PENDING_RESUME_KEY, false)),
		SESSION_LAST_STOP_REASON_KEY: str(raw.get(SESSION_LAST_STOP_REASON_KEY, "")),
		SESSION_ORIGIN_MAP_ID_KEY: str(raw.get(SESSION_ORIGIN_MAP_ID_KEY, "")),
		SESSION_ORIGIN_CELL_KEY: cell,
	}


static func normalized_low_hp_stop_percent(value) -> int:
	var percent := int(value)
	if STOP_PERCENT_OPTIONS.has(percent):
		return percent
	return STOP_ON_DEATH


static func normalized_low_hp_action(value) -> String:
	var action := str(value)
	return action if LOW_HP_ACTIONS.has(action) else LOW_HP_ACTION_STOP


static func low_hp_stop_options() -> Array[Dictionary]:
	var options: Array[Dictionary] = []
	for percent in STOP_PERCENT_OPTIONS:
		options.append({
			"id": str(percent),
			"label": low_hp_stop_label(percent),
		})
	return options


static func low_hp_stop_label(value) -> String:
	var percent := normalized_low_hp_stop_percent(value)
	if percent == STOP_NEVER:
		return "不停止"
	return "%d%%" % percent


static func low_hp_action_options() -> Array[Dictionary]:
	return [
		{"id": LOW_HP_ACTION_STOP, "label": "停止"},
		{"id": LOW_HP_ACTION_TOWN_HEAL, "label": "回村治疗"},
	]


static func capture_target_reached(settings: Dictionary, session: Dictionary) -> bool:
	var normalized_settings := normalize_settings(settings)
	var normalized_session := normalize_session(session)
	var target_count := int(normalized_settings.get(CAPTURE_TARGET_COUNT_KEY, 0))
	return target_count > 0 and int(normalized_session.get(SESSION_CAPTURE_SUCCESS_COUNT_KEY, 0)) >= target_count


static func session_with_started(session: Dictionary, mode: String, map_id: String = "", cell: Vector2i = Vector2i.ZERO) -> Dictionary:
	var next := normalize_session(session)
	next[SESSION_ENABLED_KEY] = true
	next[SESSION_MODE_KEY] = mode
	next[SESSION_PENDING_RESUME_KEY] = false
	next[SESSION_LAST_STOP_REASON_KEY] = ""
	if map_id != "":
		next[SESSION_ORIGIN_MAP_ID_KEY] = map_id
		next[SESSION_ORIGIN_CELL_KEY] = [cell.x, cell.y]
	return next


static func session_with_stopped(session: Dictionary, reason: String = "") -> Dictionary:
	var next := normalize_session(session)
	next[SESSION_ENABLED_KEY] = false
	next[SESSION_PENDING_RESUME_KEY] = false
	next[SESSION_LAST_STOP_REASON_KEY] = reason
	return next


static func session_with_battle_finished(session: Dictionary, captured_count: int = 0) -> Dictionary:
	var next := normalize_session(session)
	next[SESSION_BATTLE_COUNT_KEY] = int(next.get(SESSION_BATTLE_COUNT_KEY, 0)) + 1
	next[SESSION_CAPTURE_SUCCESS_COUNT_KEY] = int(next.get(SESSION_CAPTURE_SUCCESS_COUNT_KEY, 0)) + maxi(0, captured_count)
	return next


static func session_with_pending_resume(session: Dictionary, enabled: bool) -> Dictionary:
	var next := normalize_session(session)
	next[SESSION_PENDING_RESUME_KEY] = enabled
	return next
