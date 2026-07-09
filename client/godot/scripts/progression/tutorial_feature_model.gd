extends RefCounted

const FEATURE_STATUS := "status"
const FEATURE_EQUIPMENT := "equipment"
const FEATURE_CODEX := "codex"
const FEATURE_QUEST := "quest"
const FEATURE_MAP := "map"
const FEATURE_FAMILY := "family"
const FEATURE_AUTO_SETTINGS := "auto_settings"
const FEATURE_ACCOUNT := "account"

const FEATURE_LABELS := {
	FEATURE_STATUS: "状态",
	FEATURE_EQUIPMENT: "装备",
	FEATURE_CODEX: "图鉴",
	FEATURE_QUEST: "任务",
	FEATURE_MAP: "地图",
	FEATURE_FAMILY: "家族",
	FEATURE_AUTO_SETTINGS: "内挂",
	FEATURE_ACCOUNT: "账号",
}


static func is_valid(feature_id: String) -> bool:
	return FEATURE_LABELS.has(feature_id.strip_edges())


static func label_for(feature_id: String) -> String:
	return str(FEATURE_LABELS.get(feature_id.strip_edges(), "功能"))


static func open_event(feature_id: String) -> Dictionary:
	var normalized := feature_id.strip_edges()
	if not is_valid(normalized):
		return {}
	return {
		"type": "open_feature",
		"featureId": normalized,
		"amount": 1,
		"schemaVersion": 1,
	}


static func navigation_target(feature_id: String, label: String = "") -> Dictionary:
	var normalized := feature_id.strip_edges()
	if not is_valid(normalized):
		return {}
	return {
		"kind": "tutorial_feature",
		"featureId": normalized,
		"mapId": "",
		"label": label if label.strip_edges() != "" else "打开%s" % label_for(normalized),
	}
