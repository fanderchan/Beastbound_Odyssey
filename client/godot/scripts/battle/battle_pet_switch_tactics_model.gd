extends RefCounted

const BattleElementTacticsModel := preload(
	"res://scripts/battle/battle_element_tactics_model.gd"
)

const ROOM_MODE_DUEL := "duel"
const SIDE_ENEMY := "enemy"
const PET_KINDS: Array[String] = ["pet", "wild_pet"]
const PET_STATE_BATTLE := "battle"
const PET_STATE_STANDBY := "standby"
const PET_STATE_REST := "rest"
const COMPACT_NAME_CHARACTERS := 6


static func menu_plan(
	battle_state: Dictionary,
	party: Array,
	server_authority: bool
) -> Dictionary:
	var target := _single_living_enemy_pet(battle_state)
	var matchup := (
		battle_state.get("elementTacticsMatchup", {}) as Dictionary
		if battle_state.get("elementTacticsMatchup", {}) is Dictionary
		else {}
	)
	var forecast_allowed := (
		server_authority
		and str(battle_state.get("serverRoomMode", "")) == ROOM_MODE_DUEL
		and not target.is_empty()
	)
	var entries := {}
	for value in party:
		if not (value is Dictionary):
			continue
		var entry := value as Dictionary
		var pet_id := str(entry.get("petId", entry.get("instanceId", ""))).strip_edges()
		if pet_id == "" or entries.has(pet_id):
			continue
		entries[pet_id] = _entry_plan(
			entry,
			target,
			matchup,
			forecast_allowed
		)
	return {
		"forecastVisible": forecast_allowed,
		"targetActorId": str(target.get("id", "")),
		"targetName": str(target.get("name", "")),
		"entries": entries,
		"schemaVersion": 1,
	}


static func _entry_plan(
	entry: Dictionary,
	target: Dictionary,
	matchup: Dictionary,
	forecast_allowed: bool
) -> Dictionary:
	var full_name := str(entry.get("name", "宠物")).strip_edges()
	if full_name == "":
		full_name = "宠物"
	var state := str(entry.get("state", ""))
	var hp := maxi(0, int(entry.get("hp", 0)))
	var status_label := "待机"
	var tooltip := "%s：待机。" % full_name
	var tactics := {"visible": false, "schemaVersion": 1}
	if state == PET_STATE_BATTLE:
		status_label = "出战中"
		tooltip = "%s：正在出战。" % full_name
	elif state == PET_STATE_REST or hp <= 0:
		status_label = "休息"
		tooltip = "%s：当前不能出战。" % full_name
	elif state == PET_STATE_STANDBY and forecast_allowed:
		tactics = BattleElementTacticsModel.presentation_plan(matchup, entry, target)
		if bool(tactics.get("visible", false)):
			status_label = str(tactics.get("label", "待机"))
			tooltip = "%s：换上后对当前敌方出战宠“%s”%s。" % [
				full_name,
				str(target.get("name", "宠物")),
				status_label,
			]
	return {
		"label": "%s\n%s" % [_compact_name(full_name), status_label],
		"fullName": full_name,
		"state": state,
		"tooltip": tooltip,
		"forecastVisible": bool(tactics.get("visible", false)),
		"disposition": str(tactics.get("disposition", "")),
		"percentDelta": int(tactics.get("percentDelta", 0)),
		"schemaVersion": 1,
	}


static func _single_living_enemy_pet(battle_state: Dictionary) -> Dictionary:
	var actors: Array = (
		battle_state.get("actors", []) as Array
		if battle_state.get("actors", []) is Array
		else []
	)
	var candidates: Array[Dictionary] = []
	for value in actors:
		if not (value is Dictionary):
			continue
		var actor := value as Dictionary
		if (
			str(actor.get("side", "")) == SIDE_ENEMY
			and PET_KINDS.has(str(actor.get("kind", "")))
			and int(actor.get("hp", 0)) > 0
		):
			candidates.append(actor)
	return candidates[0] if candidates.size() == 1 else {}


static func _compact_name(value: String) -> String:
	if value.length() <= COMPACT_NAME_CHARACTERS:
		return value
	return "%s…" % value.left(COMPACT_NAME_CHARACTERS - 1)
