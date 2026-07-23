extends RefCounted

const CONTEXT_TOWN := "town"
const CONTEXT_WILDERNESS := "wilderness"
const CONTEXT_CAVE := "cave"
const VALID_CONTEXTS: Array[String] = [
	CONTEXT_TOWN,
	CONTEXT_WILDERNESS,
	CONTEXT_CAVE,
]

const TOWN_MAP_IDS: Array[String] = [
	"firebud_training_yard",
	"firebud_village_gate",
	"firebud_manor",
	"earth_vein_manor",
	"tide_echo_manor",
	"ember_core_manor",
	"gale_breath_manor",
	"shadow_oath_manor",
	"beast_pen_manor",
	"artisan_manor",
	"training_manor",
]

const WILDERNESS_MAP_IDS: Array[String] = [
	"level_grass_trial_ground",
	"mistcap_marsh",
	"suncrack_badlands",
	"windglass_highlands",
	"gm_10v10_training_ground",
]


static func context_for(map_id: String, map_data: Dictionary = {}) -> String:
	var explicit := str(
		map_data.get(
			"audioContext",
			map_data.get("musicProfileId", map_data.get("audioAreaId", ""))
		)
	).strip_edges()
	if VALID_CONTEXTS.has(explicit):
		return explicit
	if TOWN_MAP_IDS.has(map_id):
		return CONTEXT_TOWN
	if WILDERNESS_MAP_IDS.has(map_id):
		return CONTEXT_WILDERNESS
	if map_id.contains("_cave") or map_id.contains("_cavern"):
		return CONTEXT_CAVE
	return ""


static func validation_errors(map_ids: Array[String]) -> Array[String]:
	var errors: Array[String] = []
	for map_id in map_ids:
		if context_for(map_id) == "":
			errors.append("地图缺少显式音频语境：%s" % map_id)
	return errors
