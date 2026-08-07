extends RefCounted
class_name HangMatchmakingRouteCatalog

const BalanceCatalogModel := preload(
	"res://scripts/progression/balance_catalog_model.gd"
)
const BATTLE_REWARDS_PATH := "res://data/battle_rewards.json"
const BAG_ITEMS_PATH := "res://data/bag_items.json"

const DEFAULT_MAP_LABELS := {
	"firebud_village_gate": "火芽村入口",
	"mistcap_marsh": "雾帽湿地",
	"suncrack_badlands": "裂日荒原",
	"windglass_highlands": "风镜高地",
	"earth_vein_cave": "地脉洞窟",
	"tide_echo_cave": "潮鸣洞窟",
	"ember_core_cave": "炽心洞窟",
	"gale_breath_cave": "风息洞窟",
	"earth_vein_cave_f2": "地脉洞窟二层",
	"tide_echo_cave_f2": "潮鸣洞窟二层",
	"ember_core_cave_f2": "炽心洞窟二层",
	"gale_breath_cave_f2": "风息洞窟二层",
	"earth_vein_cave_f3": "地脉洞窟深层",
	"tide_echo_cave_f3": "潮鸣洞窟深层",
	"ember_core_cave_f3": "炽心洞窟深层",
	"gale_breath_cave_f3": "风息洞窟深层",
	"shadow_oath_cavern_f4": "玄影洞窟四层",
	"shadow_oath_cavern_f5": "玄影洞窟五层",
}

static var _reward_table_cache: Dictionary = {}
static var _item_label_cache: Dictionary = {}


static func routes_for_player(current_map_id: String, player_level: int) -> Array[Dictionary]:
	var catalog := BalanceCatalogModel.progression_zones()
	var active_id := str(catalog.get("activeProgressionId", "")).strip_edges()
	var source_zones: Array = []
	for raw_progression in catalog.get("progressions", []):
		if not (raw_progression is Dictionary):
			continue
		var progression := raw_progression as Dictionary
		if active_id == "" or str(progression.get("id", "")) == active_id:
			source_zones = progression.get("zones", []) as Array
			break
	var result: Array[Dictionary] = []
	for raw_zone in source_zones:
		if not (raw_zone is Dictionary):
			continue
		var zone := raw_zone as Dictionary
		if not bool(zone.get("repeatable", false)):
			continue
		var row := route_from_zone(zone, current_map_id, player_level)
		if not row.is_empty():
			result.append(row)
	return result


static func route_from_zone(
	zone: Dictionary,
	current_map_id: String,
	player_level: int
) -> Dictionary:
	var route_id := str(zone.get("id", "")).strip_edges()
	var encounter_group_id := str(zone.get("encounterGroupId", "")).strip_edges()
	var map_ids := _string_array(zone.get("mapIds", []))
	if route_id == "" or encounter_group_id == "" or map_ids.is_empty():
		return {}
	var level_range := _level_range(zone.get("levelRange", []))
	var min_level := level_range.x
	var max_level := level_range.y
	var required_level := maxi(
		0,
		int(zone.get("requiredLevel", zone.get("minimumRequiredLevel", 0)))
	)
	var map_id := current_map_id if map_ids.has(current_map_id) else map_ids[0]
	var is_current := current_map_id != "" and map_ids.has(current_map_id)
	var is_recommended := player_level >= min_level and player_level <= max_level
	return {
		"routeId": route_id,
		"label": str(zone.get("label", map_label(map_id))).strip_edges(),
		"mapId": map_id,
		"mapIds": map_ids,
		"mapLabel": map_label(map_id),
		"encounterGroupId": encounter_group_id,
		"rewardTableId": str(zone.get("rewardTableId", "")).strip_edges(),
		"minLevel": min_level,
		"maxLevel": max_level,
		"levelText": "推荐 Lv%d—%d" % [min_level, max_level],
		"requiredLevel": required_level,
		"locked": required_level > 0 and player_level < required_level,
		"belowRecommended": player_level < min_level,
		"current": is_current,
		"recommended": is_recommended,
		"dropText": _drop_text(zone),
		"visualKey": _visual_key(map_id, route_id),
		"travelOnly": not is_current,
	}


static func map_label(map_id: String) -> String:
	var normalized := map_id.strip_edges()
	return str(DEFAULT_MAP_LABELS.get(normalized, "未知区域"))


static func _drop_text(zone: Dictionary) -> String:
	_ensure_reward_catalogs()
	var table_id := str(zone.get("rewardTableId", "")).strip_edges()
	if table_id == "":
		table_id = str(zone.get("encounterGroupId", "")).strip_edges()
	var reward_table_value = _reward_table_cache.get(table_id, {})
	if not (reward_table_value is Dictionary) or (reward_table_value as Dictionary).is_empty():
		return "掉落奖励以战斗结算为准"
	var reward_table := reward_table_value as Dictionary
	var labels: Array[String] = []
	if reward_table.get("stoneCoins", {}) is Dictionary:
		labels.append("石币")
	for raw_reward in reward_table.get("rewards", []):
		if not (raw_reward is Dictionary) or labels.size() >= 3:
			continue
		var item_id := str((raw_reward as Dictionary).get("itemId", "")).strip_edges()
		var item_label := str(_item_label_cache.get(item_id, "")).strip_edges()
		if item_label != "" and not labels.has(item_label):
			labels.append(item_label)
	return " · ".join(labels) if not labels.is_empty() else "掉落奖励以战斗结算为准"


static func _ensure_reward_catalogs() -> void:
	if not _reward_table_cache.is_empty() or not _item_label_cache.is_empty():
		return
	var reward_data := _read_json_dictionary(BATTLE_REWARDS_PATH)
	for raw_table in reward_data.get("rewardTables", []):
		if not (raw_table is Dictionary):
			continue
		var table := raw_table as Dictionary
		var table_id := str(table.get("id", "")).strip_edges()
		if table_id != "":
			_reward_table_cache[table_id] = table.duplicate(true)
	var item_data := _read_json_dictionary(BAG_ITEMS_PATH)
	for raw_item in item_data.get("items", []):
		if not (raw_item is Dictionary):
			continue
		var item := raw_item as Dictionary
		var item_id := str(item.get("id", "")).strip_edges()
		var label := str(item.get("label", item.get("menuLabel", ""))).strip_edges()
		if item_id != "" and label != "":
			_item_label_cache[item_id] = label


static func _read_json_dictionary(path: String) -> Dictionary:
	if not FileAccess.file_exists(path):
		return {}
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		return {}
	var parsed = JSON.parse_string(file.get_as_text())
	file.close()
	return parsed as Dictionary if parsed is Dictionary else {}


static func _visual_key(map_id: String, route_id: String) -> String:
	var joined := "%s %s" % [map_id.to_lower(), route_id.to_lower()]
	if "mistcap" in joined or "tide" in joined:
		return "marsh"
	if "firebud" in joined or "windglass" in joined:
		return "grass"
	if "suncrack" in joined or "ember" in joined:
		return "ember"
	return "cave"


static func _string_array(value) -> Array[String]:
	var result: Array[String] = []
	if value is Array:
		for raw_value in value as Array:
			var text := str(raw_value).strip_edges()
			if text != "" and not result.has(text):
				result.append(text)
	return result


static func _level_range(value) -> Vector2i:
	if value is Array and (value as Array).size() >= 2:
		return Vector2i(
			maxi(1, int((value as Array)[0])),
			maxi(1, int((value as Array)[1]))
		)
	return Vector2i(1, 1)
