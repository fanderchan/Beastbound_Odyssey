extends RefCounted

const BattleActionCatalog := preload("res://scripts/battle/battle_action_catalog.gd")
const EquipmentModel := preload("res://scripts/progression/equipment_model.gd")

const PROFILE_KEY := "playerGrowth"
const SCHEMA_VERSION := 1
const STAT_POINT_SOURCES_KEY := "statPointSources"
const SKILL_SOURCES_KEY := "skillSources"
const REBIRTH_GROWTH_KEY := "rebirthGrowth"

const SOURCE_LEVEL_UP := "level_up"
const SOURCE_REBIRTH := "rebirth"
const SOURCE_QUEST := "quest"
const SOURCE_ITEM := "item"
const SOURCE_GM := "gm"


static func default_growth() -> Dictionary:
	return {
		"schemaVersion": SCHEMA_VERSION,
		STAT_POINT_SOURCES_KEY: {
			SOURCE_LEVEL_UP: 0,
			SOURCE_REBIRTH: 0,
			SOURCE_QUEST: 0,
			SOURCE_ITEM: 0,
			SOURCE_GM: 0,
		},
		SKILL_SOURCES_KEY: [],
		REBIRTH_GROWTH_KEY: {
			"rebirthCount": 0,
			"statBonusPerRebirth": {},
			"notes": [],
		},
	}


static func normalize_growth(value, player: Dictionary = {}, rebirth_count: int = 0, equipment_slots: Dictionary = {}, equipment_durability: Dictionary = {}) -> Dictionary:
	var raw := value as Dictionary if value is Dictionary else {}
	var result := default_growth()
	result[STAT_POINT_SOURCES_KEY] = _normalize_stat_point_sources(raw.get(STAT_POINT_SOURCES_KEY, {}), player)
	result[SKILL_SOURCES_KEY] = _normalize_skill_sources(raw.get(SKILL_SOURCES_KEY, []), equipment_slots, equipment_durability)
	result[REBIRTH_GROWTH_KEY] = _normalize_rebirth_growth(raw.get(REBIRTH_GROWTH_KEY, {}), rebirth_count)
	return result


static func stat_point_sources(growth: Dictionary) -> Dictionary:
	return _normalize_stat_point_sources(growth.get(STAT_POINT_SOURCES_KEY, {}), {})


static func skill_sources(growth: Dictionary) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	var raw_sources = growth.get(SKILL_SOURCES_KEY, [])
	if raw_sources is Array:
		for value in raw_sources:
			if value is Dictionary:
				var source := value as Dictionary
				var skill_id := str(source.get("skillId", "")).strip_edges()
				if skill_id != "":
					result.append(source.duplicate(true))
	return result


static func summary_lines(growth: Dictionary) -> Array[String]:
	var normalized := normalize_growth(growth)
	var lines: Array[String] = []
	lines.append("[color=#d7c36a]成长来源[/color]")
	var source_parts: Array[String] = []
	var sources := stat_point_sources(normalized)
	for source_id in [SOURCE_LEVEL_UP, SOURCE_REBIRTH, SOURCE_QUEST, SOURCE_ITEM, SOURCE_GM]:
		var amount := int(sources.get(source_id, 0))
		if amount <= 0:
			continue
		source_parts.append("%s +%d" % [_source_label(source_id), amount])
	lines.append("属性点：%s" % ("、".join(source_parts) if not source_parts.is_empty() else "暂无记录"))
	var skill_parts: Array[String] = []
	for source in skill_sources(normalized):
		var skill_id := str(source.get("skillId", ""))
		var label := BattleActionCatalog.label_for(skill_id, skill_id)
		var source_label := str(source.get("sourceLabel", source.get("sourceType", "来源")))
		skill_parts.append("%s（%s）" % [label, source_label])
	lines.append("人物技能：%s" % ("、".join(skill_parts) if not skill_parts.is_empty() else "由装备/任务/转生提供"))
	var rebirth := normalized.get(REBIRTH_GROWTH_KEY, {}) as Dictionary
	lines.append("转生成长：%d转记录" % maxi(0, int(rebirth.get("rebirthCount", 0))))
	return lines


static func with_stat_point_source(growth: Dictionary, source_id: String, amount: int) -> Dictionary:
	var normalized := normalize_growth(growth)
	var sources := stat_point_sources(normalized)
	var normalized_source := source_id if [SOURCE_LEVEL_UP, SOURCE_REBIRTH, SOURCE_QUEST, SOURCE_ITEM, SOURCE_GM].has(source_id) else SOURCE_GM
	sources[normalized_source] = maxi(0, int(sources.get(normalized_source, 0)) + amount)
	normalized[STAT_POINT_SOURCES_KEY] = sources
	return normalize_growth(normalized)


static func _normalize_stat_point_sources(value, player: Dictionary) -> Dictionary:
	var result: Dictionary = (default_growth().get(STAT_POINT_SOURCES_KEY, {}) as Dictionary).duplicate(true)
	if value is Dictionary:
		for key in result.keys():
			result[key] = maxi(0, int((value as Dictionary).get(key, result.get(key, 0))))
	var level := maxi(1, int(player.get("level", 1)))
	if int(result.get(SOURCE_LEVEL_UP, 0)) == 0 and level > 1:
		result[SOURCE_LEVEL_UP] = (level - 1) * 3
	return result


static func _normalize_skill_sources(value, equipment_slots: Dictionary, equipment_durability: Dictionary) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	var seen := {}
	if value is Array:
		for raw_source in value:
			if not (raw_source is Dictionary):
				continue
			var source := raw_source as Dictionary
			var skill_id := str(source.get("skillId", "")).strip_edges()
			if skill_id == "" or seen.has(skill_id):
				continue
			seen[skill_id] = true
			result.append({
				"skillId": skill_id,
				"sourceType": str(source.get("sourceType", "profile")),
				"sourceId": str(source.get("sourceId", "")),
				"sourceLabel": str(source.get("sourceLabel", "角色成长")),
			})
	for slot_id in equipment_slots.keys():
		var item_id := str(equipment_slots.get(slot_id, ""))
		if item_id == "":
			continue
		if int(equipment_durability.get(slot_id, EquipmentModel.max_durability_for(item_id))) <= 0:
			continue
		for spirit_id in EquipmentModel.spirit_ids_for(item_id):
			if seen.has(spirit_id):
				continue
			seen[spirit_id] = true
			result.append({
				"skillId": spirit_id,
				"sourceType": "equipment",
				"sourceId": item_id,
				"sourceLabel": EquipmentModel.label_for(item_id, item_id),
			})
	return result


static func _normalize_rebirth_growth(value, rebirth_count: int) -> Dictionary:
	var raw := value as Dictionary if value is Dictionary else {}
	var notes: Array[String] = []
	var raw_notes = raw.get("notes", [])
	if raw_notes is Array:
		for note in raw_notes:
			var text := str(note).strip_edges()
			if text != "":
				notes.append(text)
	return {
		"rebirthCount": maxi(0, int(raw.get("rebirthCount", rebirth_count))),
		"statBonusPerRebirth": (raw.get("statBonusPerRebirth", {}) as Dictionary).duplicate(true) if raw.get("statBonusPerRebirth", {}) is Dictionary else {},
		"notes": notes,
	}


static func _source_label(source_id: String) -> String:
	match source_id:
		SOURCE_LEVEL_UP:
			return "升级"
		SOURCE_REBIRTH:
			return "转生"
		SOURCE_QUEST:
			return "任务"
		SOURCE_ITEM:
			return "道具"
		SOURCE_GM:
			return "GM"
		_:
			return source_id
