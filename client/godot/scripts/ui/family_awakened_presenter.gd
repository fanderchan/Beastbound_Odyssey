extends RefCounted
class_name FamilyAwakenedPresenter

const TAB_LOBBY := "lobby"
const TAB_INFO := "info"
const TAB_MEMBERS := "members"
const TAB_ACTIVITIES := "activities"
const TAB_MANORS := "manors"
const JOINED_TABS := [TAB_INFO, TAB_MEMBERS, TAB_ACTIVITIES, TAB_MANORS]


static func build_view_state(
	family_value,
	raw_families,
	raw_manors,
	current_account_id: String,
	request_pending: bool,
	has_server_session: bool,
	status_text: String,
	preferred_tab: String = "",
	focused_manor_id: String = ""
) -> Dictionary:
	var family := (
		(family_value as Dictionary).duplicate(true)
		if family_value is Dictionary
		else {}
	)
	var families := _dictionary_array(raw_families)
	var manors := _dictionary_array(raw_manors)
	var has_family := not family.is_empty()
	var manor_visitor_mode := (
		not has_family and focused_manor_id.strip_edges() != ""
	)
	var active_tab := preferred_tab.strip_edges().to_lower()
	if manor_visitor_mode:
		active_tab = TAB_MANORS
	elif not has_family:
		active_tab = TAB_LOBBY
	elif focused_manor_id.strip_edges() != "":
		active_tab = TAB_MANORS
	elif not active_tab in JOINED_TABS:
		active_tab = TAB_INFO

	var member_rows := _member_rows(family)
	var activity_rows := _activity_rows(manors, request_pending)
	var manor_rows := _manor_rows(
		manors,
		family,
		current_account_id,
		request_pending,
		focused_manor_id
	)
	return {
		"hasFamily": has_family,
		"manorVisitorMode": manor_visitor_mode,
		"hasServerSession": has_server_session,
		"requestPending": request_pending,
		"statusText": _status_text(
			status_text,
			has_server_session,
			request_pending,
			has_family
		),
		"activeTab": active_tab,
		"focusedManorId": focused_manor_id.strip_edges(),
		"currentFamily": _family_presentation(family),
		"families": _family_list_rows(families),
		"members": member_rows,
		"activities": activity_rows,
		"manors": manor_rows,
		"activeWarCount": activity_rows.size(),
		"ownedManorCount": _owned_manor_count(manors),
	}


static func _family_presentation(family: Dictionary) -> Dictionary:
	if family.is_empty():
		return {}
	var result := family.duplicate(true)
	var leader_name := _display_name(family, "leaderDisplayName", "leaderUsername")
	var manor_ids_value = family.get("manorIds", [])
	var manor_ids := manor_ids_value as Array if manor_ids_value is Array else []
	var notice := str(family.get("notice", "")).strip_edges()
	result["leaderLabel"] = leader_name if leader_name != "" else "尚未同步"
	result["memberLabel"] = "%d/%d" % [
		int(family.get("memberCount", 0)),
		int(family.get("maxMembers", 100)),
	]
	result["manorCount"] = manor_ids.size()
	result["noticeText"] = (
		notice if notice != "" else "族长尚未发布家族公告。"
	)
	return result


static func _family_list_rows(families: Array[Dictionary]) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	for family in families:
		var family_id := str(family.get("familyId", "")).strip_edges()
		if family_id == "":
			continue
		var manor_ids_value = family.get("manorIds", [])
		var manor_ids := manor_ids_value as Array if manor_ids_value is Array else []
		var row := family.duplicate(true)
		row["leaderLabel"] = _display_name(
			family,
			"leaderDisplayName",
			"leaderUsername"
		)
		row["memberLabel"] = "%d/%d" % [
			int(family.get("memberCount", 0)),
			int(family.get("maxMembers", 100)),
		]
		row["manorCount"] = manor_ids.size()
		result.append(row)
	result.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		var fame_a := int(a.get("fame", 0))
		var fame_b := int(b.get("fame", 0))
		if fame_a != fame_b:
			return fame_a > fame_b
		return str(a.get("name", "")) < str(b.get("name", ""))
	)
	return result


static func _member_rows(family: Dictionary) -> Array[Dictionary]:
	var members_value = family.get("members", [])
	var members := _dictionary_array(members_value)
	var result: Array[Dictionary] = []
	for member in members:
		var display_name := _display_name(member, "displayName", "username")
		if display_name == "":
			display_name = "家族成员"
		var is_leader := str(member.get("role", "")) == "leader"
		var online := bool(member.get("online", false)) and str(
			member.get("connectionState", "online")
		) != "offline"
		var row := member.duplicate(true)
		row["displayLabel"] = display_name
		row["roleLabel"] = "族长" if is_leader else "族员"
		row["onlineLabel"] = "在线" if online else "离线"
		row["onlineResolved"] = online
		result.append(row)
	result.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		var a_leader := str(a.get("role", "")) == "leader"
		var b_leader := str(b.get("role", "")) == "leader"
		if a_leader != b_leader:
			return a_leader
		var a_online := bool(a.get("onlineResolved", false))
		var b_online := bool(b.get("onlineResolved", false))
		if a_online != b_online:
			return a_online
		return str(a.get("displayLabel", "")) < str(b.get("displayLabel", ""))
	)
	return result


static func _activity_rows(
	manors: Array[Dictionary],
	request_pending: bool
) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	for manor in manors:
		var war_value = manor.get("activeWar", null)
		if not (war_value is Dictionary) or (war_value as Dictionary).is_empty():
			continue
		var war := (war_value as Dictionary).duplicate(true)
		var row := _war_presentation(manor, war, request_pending)
		result.append(row)
	result.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		var a_ready := bool(a.get("warReady", false))
		var b_ready := bool(b.get("warReady", false))
		if a_ready != b_ready:
			return a_ready
		return str(a.get("manorName", "")) < str(b.get("manorName", ""))
	)
	return result


static func _manor_rows(
	manors: Array[Dictionary],
	family: Dictionary,
	current_account_id: String,
	request_pending: bool,
	focused_manor_id: String
) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	var is_leader := (
		current_account_id.strip_edges() != ""
		and str(family.get("leaderAccountId", "")).strip_edges()
			== current_account_id.strip_edges()
	)
	for manor in manors:
		var row := manor.duplicate(true)
		var manor_id := str(manor.get("manorId", "")).strip_edges()
		var owner_name := str(manor.get("ownerFamilyName", "")).strip_edges()
		var war_value = manor.get("activeWar", null)
		var war := (
			(war_value as Dictionary).duplicate(true)
			if war_value is Dictionary
			else {}
		)
		var peace_active := _iso_after_now(str(manor.get("peaceEndsAt", "")))
		row["ownerLabel"] = owner_name if owner_name != "" else "尚未占领"
		row["focused"] = (
			focused_manor_id.strip_edges() != ""
			and manor_id == focused_manor_id.strip_edges()
		)
		row["peaceActive"] = peace_active
		row["peaceLabel"] = (
			"休战至 %s" % _display_iso_time(str(manor.get("peaceEndsAt", "")))
			if peace_active
			else ""
		)
		row["canChallenge"] = (
			not request_pending
			and not family.is_empty()
			and is_leader
			and not bool(manor.get("isOwnedByViewerFamily", false))
			and war.is_empty()
			and not peace_active
		)
		row["canOpenShop"] = (
			not request_pending
			and bool(manor.get("isOwnedByViewerFamily", false))
			and str(manor.get("shopId", "")).strip_edges() != ""
		)
		row["war"] = (
			_war_presentation(manor, war, request_pending)
			if not war.is_empty()
			else {}
		)
		result.append(row)
	result.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		var a_focus := bool(a.get("focused", false))
		var b_focus := bool(b.get("focused", false))
		if a_focus != b_focus:
			return a_focus
		var a_owned := bool(a.get("isOwnedByViewerFamily", false))
		var b_owned := bool(b.get("isOwnedByViewerFamily", false))
		if a_owned != b_owned:
			return a_owned
		return str(a.get("name", "")) < str(b.get("name", ""))
	)
	return result


static func _war_presentation(
	manor: Dictionary,
	war: Dictionary,
	request_pending: bool
) -> Dictionary:
	var row := war.duplicate(true)
	var ready := not _iso_after_now(str(war.get("startsAt", "")))
	var battle_room_id := str(war.get("battleRoomId", "")).strip_edges()
	row["manorId"] = str(manor.get("manorId", ""))
	row["manorName"] = str(manor.get("name", "庄园"))
	row["village"] = str(manor.get("village", ""))
	row["warReady"] = ready
	row["phaseLabel"] = (
		"交战中"
		if ready
		else "备战至 %s" % _display_iso_time(str(war.get("startsAt", "")))
	)
	row["rosterLabel"] = "%d/%d  对  %d/%d" % [
		int(war.get("challengerParticipantCount", 0)),
		int(war.get("maxParticipantsPerSide", 5)),
		int(war.get("defenderParticipantCount", 0)),
		int(war.get("maxParticipantsPerSide", 5)),
	]
	row["canEnter"] = (
		not request_pending and bool(war.get("canEnterByViewerFamily", false))
	)
	row["canLeave"] = (
		not request_pending and bool(war.get("canLeaveByViewerFamily", false))
	)
	row["canOpenBattle"] = (
		not request_pending
		and ready
		and (
			battle_room_id != ""
			or bool(war.get("canStartBattleRoomByViewerFamily", false))
		)
	)
	row["canResolve"] = (
		not request_pending
		and ready
		and battle_room_id == ""
		and bool(war.get("canResolveByViewerFamily", false))
	)
	return row


static func _owned_manor_count(manors: Array[Dictionary]) -> int:
	var count := 0
	for manor in manors:
		if bool(manor.get("isOwnedByViewerFamily", false)):
			count += 1
	return count


static func _status_text(
	current: String,
	has_server_session: bool,
	request_pending: bool,
	has_family: bool
) -> String:
	var normalized := current.strip_edges()
	if normalized != "":
		return normalized
	if not has_server_session:
		return "登录服务器账号后可使用家族功能。"
	if request_pending:
		return "正在同步家族资料……"
	return "家族资料已同步。" if has_family else "选择一个家族加入，或创建自己的家族。"


static func _display_name(
	value: Dictionary,
	primary_key: String,
	fallback_key: String
) -> String:
	var name := str(value.get(primary_key, "")).strip_edges()
	if name == "":
		name = str(value.get(fallback_key, "")).strip_edges()
	return name


static func _iso_after_now(iso_text: String) -> bool:
	var normalized := iso_text.strip_edges()
	if normalized == "":
		return false
	return normalized > "%sZ" % Time.get_datetime_string_from_system(true)


static func _display_iso_time(iso_text: String) -> String:
	var normalized := iso_text.strip_edges()
	if normalized == "":
		return "待定"
	return normalized.replace("T", " ").replace(".000Z", "").replace("Z", "")


static func _dictionary_array(value) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	if not (value is Array):
		return result
	for entry in value:
		if entry is Dictionary:
			result.append((entry as Dictionary).duplicate(true))
	return result
