extends RefCounted

const SETTINGS_KEY := "hangSettings"

const LOW_HP_STOP_PERCENT_KEY := "lowHpStopPercent"
const STOP_NEVER := -1
const STOP_ON_DEATH := 0
const STOP_PERCENT_OPTIONS: Array[int] = [STOP_NEVER, STOP_ON_DEATH, 10, 20, 30, 50]


static func default_settings() -> Dictionary:
	return {
		LOW_HP_STOP_PERCENT_KEY: STOP_ON_DEATH,
	}


static func normalize_settings(value) -> Dictionary:
	var raw := value as Dictionary if value is Dictionary else {}
	return {
		LOW_HP_STOP_PERCENT_KEY: normalized_low_hp_stop_percent(raw.get(LOW_HP_STOP_PERCENT_KEY, STOP_ON_DEATH)),
	}


static func normalized_low_hp_stop_percent(value) -> int:
	var percent := int(value)
	if STOP_PERCENT_OPTIONS.has(percent):
		return percent
	return STOP_ON_DEATH


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
