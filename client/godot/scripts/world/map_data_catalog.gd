extends RefCounted

const MAP_DATA_PATHS := {
	"firebud_training_yard": "res://data/firebud_training_map.json",
	"firebud_village_gate": "res://data/firebud_village_gate_map.json",
	"earth_vein_cave": "res://data/earth_vein_cave_map.json",
	"earth_vein_cave_f2": "res://data/earth_vein_cave_f2_map.json",
	"earth_vein_cave_f3": "res://data/earth_vein_cave_f3_map.json",
	"earth_vein_cave_f4": "res://data/earth_vein_cave_f4_map.json",
	"tide_echo_cave": "res://data/tide_echo_cave_map.json",
	"tide_echo_cave_f2": "res://data/tide_echo_cave_f2_map.json",
	"tide_echo_cave_f3": "res://data/tide_echo_cave_f3_map.json",
	"tide_echo_cave_f4": "res://data/tide_echo_cave_f4_map.json",
	"ember_core_cave": "res://data/ember_core_cave_map.json",
	"ember_core_cave_f2": "res://data/ember_core_cave_f2_map.json",
	"ember_core_cave_f3": "res://data/ember_core_cave_f3_map.json",
	"ember_core_cave_f4": "res://data/ember_core_cave_f4_map.json",
	"gale_breath_cave": "res://data/gale_breath_cave_map.json",
	"gale_breath_cave_f2": "res://data/gale_breath_cave_f2_map.json",
	"gale_breath_cave_f3": "res://data/gale_breath_cave_f3_map.json",
	"gale_breath_cave_f4": "res://data/gale_breath_cave_f4_map.json",
	"shadow_oath_cavern": "res://data/shadow_oath_cavern_map.json",
	"shadow_oath_cavern_f2": "res://data/shadow_oath_cavern_f2_map.json",
	"shadow_oath_cavern_f3": "res://data/shadow_oath_cavern_f3_map.json",
	"shadow_oath_cavern_f4": "res://data/shadow_oath_cavern_f4_map.json",
	"shadow_oath_cavern_f5": "res://data/shadow_oath_cavern_f5_map.json",
	"level_grass_trial_ground": "res://data/level_grass_trial_ground_map.json",
	"mistcap_marsh": "res://data/mistcap_marsh_map.json",
	"suncrack_badlands": "res://data/suncrack_badlands_map.json",
	"windglass_highlands": "res://data/windglass_highlands_map.json",
	"firebud_manor": "res://data/firebud_manor_map.json",
	"earth_vein_manor": "res://data/earth_vein_manor_map.json",
	"tide_echo_manor": "res://data/tide_echo_manor_map.json",
	"ember_core_manor": "res://data/ember_core_manor_map.json",
	"gale_breath_manor": "res://data/gale_breath_manor_map.json",
	"shadow_oath_manor": "res://data/shadow_oath_manor_map.json",
	"beast_pen_manor": "res://data/beast_pen_manor_map.json",
	"artisan_manor": "res://data/artisan_manor_map.json",
	"training_manor": "res://data/training_manor_map.json",
	"gm_10v10_training_ground": "res://data/gm_10v10_training_ground_map.json",
}


static func path_for(map_id: String) -> String:
	return str(MAP_DATA_PATHS.get(map_id, ""))


static func has_map(map_id: String) -> bool:
	return MAP_DATA_PATHS.has(map_id)
