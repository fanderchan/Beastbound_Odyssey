extends RefCounted
class_name WorldHudPartyRosterPresenter

const PlayerAppearanceCatalog := preload(
	"res://scripts/player/player_appearance_catalog.gd"
)

const TAB_TASK := "task"
const TAB_PARTY := "party"
const PARTY_MAX_MEMBERS := 5
const MAX_MEMBER_NAME_CHARS := 18
const SYNCING_MEMBER_LABEL := "队友信息同步中"
const EMPTY_SLOT_ICON_PATH := (
	"res://assets/ui/world_hud_awakened_v1/runtime/icons/party.png"
)
const ELEMENT_IDS: Array[String] = ["earth", "water", "fire", "wind"]
const ELEMENT_LABELS := {
	"earth": "地",
	"water": "水",
	"fire": "火",
	"wind": "风",
}


static func present(source: Dictionary, local_identity: Dictionary = {}) -> Dictionary:
	var match_state := _match_state(source)
	var party := _dictionary(match_state.get("party", source.get("party", {})))
	var max_members := clampi(
		int(match_state.get("maxMembers", party.get("maxMembers", PARTY_MAX_MEMBERS))),
		1,
		PARTY_MAX_MEMBERS
	)
	var active := bool(match_state.get("active", source.get("matching", false)))
	var match_status := str(
		match_state.get("status", "matching" if active else "idle")
	).strip_edges().to_lower()
	var matchmaking_context := (
		active
		or match_status == "full"
		or str(match_state.get("queueId", "")).strip_edges() != ""
	)
	var rows: Array[Dictionary] = []
	var human_detail_count := 0
	var raw_members = party.get("members", [])
	if raw_members is Array:
		for raw_member in raw_members as Array:
			if raw_member is Dictionary and rows.size() < max_members:
				human_detail_count += 1
				if matchmaking_context and not bool((raw_member as Dictionary).get("online", true)):
					continue
				rows.append(_human_row(
					raw_member as Dictionary,
					party,
					local_identity,
					rows.size()
				))

	# Some callers only retain the presenter's flat member rows.  Preserve those
	# real identities without inventing technical IDs or pretending NPCs are people.
	var flat_npcs: Array[Dictionary] = []
	if human_detail_count == 0:
		var flat_members = match_state.get("members", source.get("members", []))
		if flat_members is Array:
			for raw_member in flat_members as Array:
				if not (raw_member is Dictionary):
					continue
				var member := raw_member as Dictionary
				var kind := str(member.get("kind", "human")).strip_edges().to_lower()
				if kind == "npc":
					flat_npcs.append(member)
				elif kind == "human":
					human_detail_count += 1
					if matchmaking_context and not bool(member.get("online", true)):
						continue
					if rows.size() < max_members:
						rows.append(_flat_human_row(member, local_identity, rows.size()))

	# The idle transport state can retain humanCount=1 for the local account even
	# when there is no party.  Outside matchmaking, only real party/member rows
	# may create roster cards; otherwise the sidebar would invent a teammate.
	var authoritative_human_count := _count_kind(rows, "human")
	if matchmaking_context:
		authoritative_human_count = clampi(
			int(match_state.get("humanCount", authoritative_human_count)),
			0,
			max_members
		)
	if matchmaking_context and human_detail_count > 0:
		var missing_human_detail_count := maxi(
			0,
			authoritative_human_count - human_detail_count
		)
		authoritative_human_count = mini(
			max_members,
			_count_kind(rows, "human") + missing_human_detail_count
		)
	while _count_kind(rows, "human") < authoritative_human_count and rows.size() < max_members:
		rows.append(_syncing_human_row())

	var raw_npcs = match_state.get("npcMembers", source.get("npcMembers", []))
	var npc_members := raw_npcs as Array if raw_npcs is Array else []
	if npc_members.is_empty() and not flat_npcs.is_empty():
		npc_members = flat_npcs
	for raw_npc in npc_members:
		if raw_npc is Dictionary and rows.size() < max_members:
			rows.append(_npc_row(raw_npc as Dictionary, rows.size()))

	var authoritative_npc_count := clampi(
		int(match_state.get("npcCount", _count_kind(rows, "npc"))),
		0,
		max_members - authoritative_human_count
	)
	while _count_kind(rows, "npc") < authoritative_npc_count and rows.size() < max_members:
		rows.append(_npc_row({"displayName": "陪练NPC"}, rows.size()))
	while rows.size() < max_members:
		rows.append(_empty_row(active or match_status == "full"))

	var human_count := _count_kind(rows, "human")
	var npc_count := _count_kind(rows, "npc")
	var empty_count := _count_kind(rows, "empty")
	var active_tab := str(
		source.get("activeTab", source.get("activeSideTab", TAB_PARTY))
	).strip_edges().to_lower()
	if active_tab not in [TAB_TASK, TAB_PARTY]:
		active_tab = TAB_PARTY
	return {
		"activeTab": active_tab,
		"matching": active,
		"matchStatus": match_status,
		"statusText": _status_text(active, match_status, human_count, npc_count),
		"humanCount": human_count,
		"npcCount": npc_count,
		"emptyCount": empty_count,
		"maxMembers": max_members,
		"rows": rows,
		"canViewDetail": active or human_count > 0 or npc_count > 0,
		"canCancel": (
			str(match_state.get("queueId", "")).strip_edges() != ""
			and (active or match_status == "full")
		),
		"taskText": _bounded_text(
			source.get("taskText", source.get("task_text", "暂无追踪任务")),
			180
		),
	}


static func _match_state(source: Dictionary) -> Dictionary:
	var value = source.get("match", source.get("matchmaking", null))
	if value is Dictionary:
		return value as Dictionary
	return source


static func _human_row(
	member: Dictionary,
	party: Dictionary,
	local_identity: Dictionary,
	_index: int
) -> Dictionary:
	var account_id := str(member.get("accountId", "")).strip_edges()
	var team := _dictionary(member.get("teamSnapshot", {}))
	var player := _dictionary(team.get("player", {}))
	var raw_name := str(
		member.get(
			"displayName",
			member.get("username", player.get("name", ""))
		)
	).strip_edges()
	var appearance_id := str(
		player.get("appearanceId", member.get("appearanceId", ""))
	).strip_edges()
	var level := maxi(
		0,
		int(player.get("level", team.get("playerLevel", member.get("level", 0))))
	)
	var rebirth_count := _optional_nonnegative_int(
		player.get("rebirthCount", member.get("rebirthCount", null))
	)
	var elements := _dictionary(player.get("elements", member.get("elements", {})))
	var is_local := _is_local_identity(account_id, raw_name, local_identity)
	if is_local:
		if raw_name == "":
			raw_name = str(
				local_identity.get("displayName", local_identity.get("name", ""))
			).strip_edges()
		appearance_id = str(
			local_identity.get("appearanceId", appearance_id)
		).strip_edges()
		if rebirth_count < 0:
			rebirth_count = _optional_nonnegative_int(
				local_identity.get("rebirthCount", null)
			)
		if elements.is_empty():
			elements = _dictionary(local_identity.get("elements", {}))
	var portrait_path := str(member.get("portraitTexturePath", "")).strip_edges()
	if portrait_path == "" and is_local:
		portrait_path = str(local_identity.get("portraitTexturePath", "")).strip_edges()
	if portrait_path == "":
		portrait_path = _portrait_path_for_appearance(appearance_id)
	if portrait_path == "":
		portrait_path = (
			EMPTY_SLOT_ICON_PATH
			if FileAccess.file_exists(EMPTY_SLOT_ICON_PATH)
			else ""
		)
	var details_pending := raw_name == "" or level <= 0
	var name := _bounded_text(
		raw_name if raw_name != "" else SYNCING_MEMBER_LABEL,
		MAX_MEMBER_NAME_CHARS
	)
	var element_id := _dominant_element_id(elements)
	return {
		"kind": "human",
		"kindLabel": "真人",
		"name": name if name != "" else SYNCING_MEMBER_LABEL,
		"level": level,
		"rebirthCount": rebirth_count,
		"levelText": "资料同步中" if details_pending else _level_text(level, rebirth_count),
		"detailsPending": details_pending,
		"leader": (
			str(member.get("role", "")) == "leader"
			or (
				account_id != ""
				and account_id == str(party.get("leaderAccountId", ""))
			)
		),
		"online": bool(member.get("online", true)),
		"appearanceId": appearance_id,
		"portraitTexturePath": portrait_path,
		"elementId": element_id,
		"elementLabel": str(ELEMENT_LABELS.get(element_id, "")),
		"statusText": (
			"资料同步中"
			if details_pending
			else ("在线" if bool(member.get("online", true)) else "离线")
		),
	}


static func _flat_human_row(
	member: Dictionary,
	local_identity: Dictionary,
	_index: int
) -> Dictionary:
	var raw_name := str(
		member.get("name", member.get("displayName", ""))
	).strip_edges()
	var account_id := str(member.get("accountId", "")).strip_edges()
	var appearance_id := str(member.get("appearanceId", "")).strip_edges()
	var is_local := _is_local_identity(account_id, raw_name, local_identity)
	if raw_name == "" and is_local:
		raw_name = str(
			local_identity.get("displayName", local_identity.get("name", ""))
		).strip_edges()
	if appearance_id == "" and is_local:
		appearance_id = str(local_identity.get("appearanceId", "")).strip_edges()
	var portrait_path := str(member.get("portraitTexturePath", "")).strip_edges()
	if portrait_path == "" and is_local:
		portrait_path = str(local_identity.get("portraitTexturePath", "")).strip_edges()
	if portrait_path == "":
		portrait_path = _portrait_path_for_appearance(appearance_id)
	if portrait_path == "":
		portrait_path = (
			EMPTY_SLOT_ICON_PATH
			if FileAccess.file_exists(EMPTY_SLOT_ICON_PATH)
			else ""
		)
	var level := maxi(0, int(member.get("level", 0)))
	var rebirth_count := _optional_nonnegative_int(member.get("rebirthCount", null))
	var details_pending := raw_name == "" or level <= 0
	var name := _bounded_text(
		raw_name if raw_name != "" else SYNCING_MEMBER_LABEL,
		MAX_MEMBER_NAME_CHARS
	)
	var element_id := _dominant_element_id(_dictionary(member.get("elements", {})))
	return {
		"kind": "human",
		"kindLabel": "真人",
		"name": name if name != "" else SYNCING_MEMBER_LABEL,
		"level": level,
		"rebirthCount": rebirth_count,
		"levelText": "资料同步中" if details_pending else _level_text(level, rebirth_count),
		"detailsPending": details_pending,
		"leader": bool(member.get("leader", false)),
		"online": bool(member.get("online", true)),
		"appearanceId": appearance_id,
		"portraitTexturePath": portrait_path,
		"elementId": element_id,
		"elementLabel": str(ELEMENT_LABELS.get(element_id, "")),
		"statusText": (
			"资料同步中"
			if details_pending
			else ("在线" if bool(member.get("online", true)) else "离线")
		),
	}


static func _npc_row(member: Dictionary, _index: int) -> Dictionary:
	var appearance_id := str(member.get("appearanceId", "")).strip_edges()
	var portrait_path := str(member.get("portraitTexturePath", "")).strip_edges()
	if portrait_path == "" and appearance_id != "":
		portrait_path = _portrait_path_for_appearance(appearance_id)
	if portrait_path == "":
		portrait_path = (
			EMPTY_SLOT_ICON_PATH
			if FileAccess.file_exists(EMPTY_SLOT_ICON_PATH)
			else ""
		)
	var level := maxi(1, int(member.get("level", 1)))
	var element_id := _dominant_element_id(_dictionary(member.get("elements", {})))
	return {
		"kind": "npc",
		"matchmakingNpc": bool(member.get("matchmakingNpc", false)),
		"controller": str(member.get("controller", "")).strip_edges(),
		"kindLabel": "NPC陪练",
		"name": _bounded_text(
			member.get("displayName", member.get("name", "陪练NPC")),
			MAX_MEMBER_NAME_CHARS
		),
		"level": level,
		"rebirthCount": -1,
		"levelText": "%d级" % level,
		"leader": false,
		"online": true,
		"appearanceId": appearance_id,
		"portraitTexturePath": portrait_path,
		"elementId": element_id,
		"elementLabel": str(ELEMENT_LABELS.get(element_id, "")),
		"statusText": "临时补位",
	}


static func _syncing_human_row() -> Dictionary:
	return {
		"kind": "human",
		"kindLabel": "真人",
		"name": SYNCING_MEMBER_LABEL,
		"level": 0,
		"rebirthCount": -1,
		"levelText": "资料同步中",
		"leader": false,
		"online": true,
		"appearanceId": "",
		"portraitTexturePath": (
			EMPTY_SLOT_ICON_PATH
			if FileAccess.file_exists(EMPTY_SLOT_ICON_PATH)
			else ""
		),
		"elementId": "",
		"elementLabel": "",
		"statusText": "资料同步中",
	}


static func _empty_row(matching: bool) -> Dictionary:
	return {
		"kind": "empty",
		"kindLabel": "空位",
		"name": "等待真人" if matching else "等待队友",
		"level": 0,
		"rebirthCount": -1,
		"levelText": "匹配中" if matching else "可加入",
		"leader": false,
		"online": false,
		"appearanceId": "",
		"portraitTexturePath": (
			EMPTY_SLOT_ICON_PATH
			if FileAccess.file_exists(EMPTY_SLOT_ICON_PATH)
			else ""
		),
		"elementId": "",
		"elementLabel": "",
		"statusText": "真人优先" if matching else "空位",
	}


static func _status_text(active: bool, status: String, human_count: int, npc_count: int) -> String:
	if status == "full" and human_count >= PARTY_MAX_MEMBERS:
		return "真人队伍已满"
	if npc_count > 0:
		if active and human_count >= 2:
			return "真人已加入 · 下一场替换陪练"
		return "陪练补位中 · 继续找真人"
	if active:
		return "真人优先匹配中"
	if human_count > 0:
		return "当前队伍 %d/%d" % [human_count, PARTY_MAX_MEMBERS]
	return "暂未组队"


static func _level_text(level: int, rebirth_count: int) -> String:
	if rebirth_count >= 0:
		return "%d转%d级" % [rebirth_count, level]
	return "%d级" % level


static func _portrait_path_for_appearance(appearance_id: String) -> String:
	if appearance_id.strip_edges() == "":
		return ""
	return str(
		PlayerAppearanceCatalog.entry(appearance_id).get("portraitTexturePath", "")
	).strip_edges()


static func _dominant_element_id(elements: Dictionary) -> String:
	var best_id := ""
	var best_value := 0.0
	for element_id in ELEMENT_IDS:
		var value := maxf(0.0, float(elements.get(element_id, 0.0)))
		if value > best_value:
			best_id = element_id
			best_value = value
	return best_id


static func _is_local_identity(
	member_account_id: String,
	member_name: String,
	local_identity: Dictionary
) -> bool:
	var local_account_id := str(local_identity.get("accountId", "")).strip_edges()
	# Account identity is authoritative whenever either side has one.  Falling
	# back to a display name while one ID is present can impersonate the local
	# player when two accounts deliberately share the same visible name.
	if member_account_id != "" or local_account_id != "":
		return (
			member_account_id != ""
			and local_account_id != ""
			and member_account_id == local_account_id
		)
	var local_name := str(
		local_identity.get("displayName", local_identity.get("name", ""))
	).strip_edges()
	return local_name != "" and member_name == local_name


static func _optional_nonnegative_int(value) -> int:
	if value is int or value is float:
		return maxi(0, int(value))
	return -1


static func _count_kind(rows: Array[Dictionary], kind: String) -> int:
	var count := 0
	for row in rows:
		if str(row.get("kind", "")) == kind:
			count += 1
	return count


static func _dictionary(value) -> Dictionary:
	return value as Dictionary if value is Dictionary else {}


static func _bounded_text(value, max_chars: int) -> String:
	var text := str(value).strip_edges()
	return text if text.length() <= max_chars else text.left(max_chars)
