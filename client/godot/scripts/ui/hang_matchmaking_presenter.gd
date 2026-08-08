extends RefCounted
class_name HangMatchmakingPresenter

const HangMatchmakingRouteCatalog := preload(
	"res://scripts/ui/hang_matchmaking_route_catalog.gd"
)

const VIEW_BROWSE := "browse"
const VIEW_PARTY := "party"
const VIEW_MATCHING := "matching"
const PARTY_MAX_MEMBERS := 5


static func routes_for_player(current_map_id: String, player_level: int) -> Array[Dictionary]:
	return HangMatchmakingRouteCatalog.routes_for_player(current_map_id, player_level)


static func normalize_state(source: Dictionary) -> Dictionary:
	var match_value = source.get("match", source.get("matchmaking", {}))
	var match_state := match_value as Dictionary if match_value is Dictionary else {}
	var party_value = match_state.get("party", source.get("party", {}))
	var party := party_value as Dictionary if party_value is Dictionary else {}
	var active := bool(match_state.get("active", source.get("matching", false)))
	var match_status := str(
		match_state.get("status", "searching" if active else "idle")
	).strip_edges().to_lower()
	var matching_context := active or match_status == "full"
	var npc_members := _dictionary_array(
		match_state.get("npcMembers", source.get("npcMembers", []))
	)
	var has_authoritative_rows := (
		party.get("members", null) is Array
		or match_state.has("npcMembers")
		or source.has("npcMembers")
	)
	var members := _authoritative_member_rows(party, npc_members, matching_context)
	if members.is_empty() and not has_authoritative_rows:
		members = _dictionary_array(match_state.get("members", []))
	var max_members := clampi(
		int(match_state.get("maxMembers", PARTY_MAX_MEMBERS)),
		1,
		PARTY_MAX_MEMBERS
	)
	var human_default := _count_kind(members, "human")
	var npc_default := _count_kind(members, "npc")
	var human_count_value = (
		match_state.get("humanCount", human_default)
		if matching_context
		else party.get("memberCount", human_default)
	)
	var human_count := clampi(
		int(human_count_value),
		0,
		max_members
	)
	var npc_count := clampi(
		int(match_state.get("npcCount", npc_default)),
		0,
		max_members - human_count
	)
	var empty_count := max_members - human_count - npc_count
	var raw_view := str(source.get("viewMode", "")).strip_edges().to_lower()
	var view_mode := raw_view if raw_view in [VIEW_BROWSE, VIEW_PARTY, VIEW_MATCHING] else VIEW_BROWSE
	if matching_context:
		view_mode = VIEW_MATCHING
	elif view_mode == VIEW_MATCHING:
		# A cancelled/idle response can arrive while the panel still remembers its
		# previous matching page. Never let that stale local view impersonate an
		# active queue; only an active or full authoritative match may own it.
		view_mode = VIEW_BROWSE
	return {
		"viewMode": view_mode,
		"pending": bool(source.get("pending", source.get("requestPending", false))),
		"statusText": str(source.get("statusText", "")).strip_edges(),
		"selectedRouteId": str(source.get("selectedRouteId", "")).strip_edges(),
		"match": {
			"active": active,
			"status": match_status,
			"humanCount": human_count,
			"npcCount": npc_count,
			"emptyCount": empty_count,
			"maxMembers": max_members,
			"waitingPlayerCount": maxi(0, int(match_state.get("waitingPlayerCount", 0))),
			"waitingPartyCount": maxi(0, int(match_state.get("waitingPartyCount", 0))),
			"npcFillInMs": maxi(0, int(match_state.get("npcFillInMs", 0))),
			"npcFillInSec": ceili(maxf(0.0, float(match_state.get("npcFillInMs", 0))) / 1000.0),
			"party": party.duplicate(true),
			"npcMembers": npc_members,
			"members": members,
		},
		"partyListings": _dictionary_array(
			source.get("partyListings", source.get("listings", []))
		),
	}


static func route_by_id(routes: Array[Dictionary], route_id: String) -> Dictionary:
	var normalized := route_id.strip_edges()
	for route in routes:
		if str(route.get("routeId", "")) == normalized:
			return route
	return {}


static func preferred_route_id(routes: Array[Dictionary]) -> String:
	for route in routes:
		if bool(route.get("current", false)) and bool(route.get("recommended", false)):
			return str(route.get("routeId", ""))
	for route in routes:
		if bool(route.get("current", false)):
			return str(route.get("routeId", ""))
	for route in routes:
		if bool(route.get("recommended", false)) and not bool(route.get("locked", false)):
			return str(route.get("routeId", ""))
	for route in routes:
		if not bool(route.get("locked", false)):
			return str(route.get("routeId", ""))
	return str(routes[0].get("routeId", "")) if not routes.is_empty() else ""


static func member_rows(match_state: Dictionary) -> Array[Dictionary]:
	var max_members := clampi(int(match_state.get("maxMembers", PARTY_MAX_MEMBERS)), 1, PARTY_MAX_MEMBERS)
	var rows: Array[Dictionary] = []
	for raw_member in match_state.get("members", []):
		if not (raw_member is Dictionary) or rows.size() >= max_members:
			continue
		var member := raw_member as Dictionary
		var kind := str(member.get("kind", "human")).strip_edges().to_lower()
		if kind not in ["human", "npc"]:
			kind = "human"
		var details_pending := bool(member.get("detailsPending", false))
		var display_name := str(member.get("name", "")).strip_edges()
		var level := int(member.get("level", 0))
		if kind == "human":
			if display_name == "":
				display_name = "队友信息同步中"
				details_pending = true
			if level <= 0:
				level = 0
				details_pending = true
		else:
			if display_name == "":
				display_name = "陪练NPC"
			level = maxi(1, level)
		rows.append({
			"kind": kind,
			"name": display_name,
			"level": level,
			"leader": bool(member.get("leader", false)),
			"detailsPending": details_pending,
		})
	var expected_humans := clampi(int(match_state.get("humanCount", 0)), 0, max_members)
	var expected_npcs := clampi(int(match_state.get("npcCount", 0)), 0, max_members - expected_humans)
	var actual_humans := 0
	var actual_npcs := 0
	for row in rows:
		if str(row.get("kind", "")) == "npc":
			actual_npcs += 1
		else:
			actual_humans += 1
	while actual_humans < expected_humans and rows.size() < max_members:
		rows.append({
			"kind": "human",
			"name": "队友信息同步中",
			"level": 0,
			"leader": rows.is_empty(),
			"detailsPending": true,
		})
		actual_humans += 1
	while actual_npcs < expected_npcs and rows.size() < max_members:
		rows.append({
			"kind": "npc",
			"name": "陪练NPC",
			"level": 1,
			"leader": false,
			"detailsPending": false,
		})
		actual_npcs += 1
	while rows.size() < max_members:
		rows.append({
			"kind": "empty",
			"name": "等待加入",
			"level": 0,
			"leader": false,
			"detailsPending": false,
		})
	return rows


static func _dictionary_array(value) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	if value is Array:
		for raw_value in value as Array:
			if raw_value is Dictionary:
				result.append((raw_value as Dictionary).duplicate(true))
	return result


static func _authoritative_member_rows(
	party: Dictionary,
	npc_members: Array[Dictionary],
	online_only: bool
) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	var leader_account_id := str(party.get("leaderAccountId", "")).strip_edges()
	for raw_member in party.get("members", []):
		if not (raw_member is Dictionary):
			continue
		var member := raw_member as Dictionary
		if online_only and member.has("online") and not bool(member.get("online", false)):
			continue
		var account_id := str(member.get("accountId", "")).strip_edges()
		var snapshot_value = member.get("teamSnapshot", {})
		var snapshot := snapshot_value as Dictionary if snapshot_value is Dictionary else {}
		var player_value = snapshot.get("player", {})
		var player := player_value as Dictionary if player_value is Dictionary else {}
		var display_name := str(member.get("displayName", "")).strip_edges()
		if display_name == "":
			display_name = str(member.get("username", "")).strip_edges()
		var level := int(
			player.get(
				"level",
				snapshot.get("playerLevel", member.get("level", 0))
			)
		)
		var details_pending := display_name == "" or level <= 0
		result.append({
			"kind": "human",
			"name": display_name if display_name != "" else "队友信息同步中",
			"level": maxi(0, level),
			"leader": str(member.get("role", "")) == "leader" or (account_id != "" and account_id == leader_account_id),
			"detailsPending": details_pending,
		})
	for npc in npc_members:
		result.append({
			"kind": "npc",
			"name": str(npc.get("displayName", "陪练NPC")).strip_edges(),
			"level": maxi(1, int(npc.get("level", 1))),
			"leader": false,
			"detailsPending": false,
		})
	return result


static func _count_kind(rows: Array[Dictionary], kind: String) -> int:
	var count := 0
	for row in rows:
		if str(row.get("kind", "")) == kind:
			count += 1
	return count
