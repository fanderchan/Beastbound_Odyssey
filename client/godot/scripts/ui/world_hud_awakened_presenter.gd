extends RefCounted

const PlayerAppearanceCatalog := preload(
	"res://scripts/player/player_appearance_catalog.gd"
)
const PlayerProgressModel := preload(
	"res://scripts/progression/player_progress_model.gd"
)
const PetPortraitArtCatalog := preload(
	"res://scripts/ui/pet_portrait_art_catalog.gd"
)
const MailboxPageModel := preload(
	"res://scripts/progression/mailbox_page_model.gd"
)

const MAX_MAP_NAME_CHARS := 48
const MAX_TASK_TEXT_CHARS := 180
const MAX_PARTY_MEMBERS := 5
const MAX_MEMBER_NAME_CHARS := 24
const MAX_CHAT_AUTHOR_CHARS := 24
const MAX_CHAT_TEXT_CHARS := 120
const MAX_CHAT_META_CHARS := 64

const MENU_ENTRY_IDS: Array[String] = [
	"hang",
	"character",
	"backpack",
	"equipment",
	"pet",
	"codex",
	"quest",
	"map",
	"chat",
	"party",
	"family",
	"market",
	"mailbox",
	"auto",
	"account",
	"gm",
]
const BATTLE_LOCKED_MENU_IDS: Array[String] = [
	"character",
	"backpack",
	"equipment",
	"pet",
	"map",
	"chat",
	"party",
	"family",
]


static func identity_state(normalized_profile: Dictionary) -> Dictionary:
	return {
		"player": _player_identity(normalized_profile),
		"activeBattlePet": _active_battle_pet_identity(normalized_profile),
	}


static func runtime_state(runtime: Dictionary) -> Dictionary:
	var map_name = runtime.get("mapName", "")
	if str(map_name).strip_edges() == "":
		map_name = _dictionary(runtime.get("mapData", null)).get("name", "")
	var party_value = runtime.get("party", null)
	if not (party_value is Dictionary):
		party_value = _dictionary(runtime.get("partyState", null)).get("party", null)
	var mailbox_value = runtime.get("mailbox", null)
	if not (mailbox_value is Dictionary):
		mailbox_value = {
			"synced": bool(runtime.get("mailboxSynced", false)),
			"state": runtime.get("mailboxPageState", null),
		}
	return {
		"mapName": _bounded_text(map_name, MAX_MAP_NAME_CHARS),
		"playerCell": _player_cell_state(runtime.get("playerCell", null)),
		"playerWorldPosition": _world_position_state(
			runtime.get("playerWorldPosition", null)
		),
		"taskText": _bounded_text(runtime.get("taskText", ""), MAX_TASK_TEXT_CHARS),
		"party": _party_state(party_value),
		"latestChat": _latest_chat_state(runtime.get("chatMessages", null)),
		"mailbox": _mailbox_state(mailbox_value),
		"line": _line_state(runtime.get("line", null)),
		"menu": _menu_state(runtime),
	}


static func combined_state(normalized_profile: Dictionary, runtime: Dictionary) -> Dictionary:
	var identity := identity_state(normalized_profile)
	var projected_runtime := runtime_state(runtime)
	var result := projected_runtime.duplicate(true)
	result["identity"] = identity
	result["runtime"] = projected_runtime
	result["player"] = _dictionary(identity.get("player", null))
	result["activeBattlePet"] = _dictionary(identity.get("activeBattlePet", null))
	return result


static func _player_identity(normalized_profile: Dictionary) -> Dictionary:
	var player := _dictionary(normalized_profile.get("player", null))
	if player.is_empty():
		return {"available": false}
	var max_hp := maxi(0, int(player.get("maxHp", 0)))
	var hp := maxi(0, int(player.get("hp", 0)))
	if max_hp > 0:
		hp = mini(hp, max_hp)
	var appearance_id := str(player.get("appearanceId", "")).strip_edges()
	var appearance := PlayerAppearanceCatalog.entry(appearance_id)
	return {
		"available": true,
		"name": str(player.get("name", "")).strip_edges(),
		"level": maxi(0, int(player.get("level", 0))),
		"hp": hp,
		"maxHp": max_hp,
		"exp": maxi(0, int(player.get("exp", 0))),
		"nextExp": maxi(0, int(player.get("nextExp", 0))),
		"appearanceId": appearance_id,
		"portraitTexturePath": str(
			appearance.get("portraitTexturePath", "")
		).strip_edges(),
	}


static func _active_battle_pet_identity(normalized_profile: Dictionary) -> Dictionary:
	var active_instance_id := str(
		normalized_profile.get("activePetInstanceId", "")
	).strip_edges()
	if active_instance_id == "":
		return {"available": false}
	var values = normalized_profile.get("petInstances", null)
	if not (values is Array):
		return {"available": false}
	for value in values as Array:
		if not (value is Dictionary):
			continue
		var instance := value as Dictionary
		if str(instance.get("instanceId", "")).strip_edges() != active_instance_id:
			continue
		if str(instance.get("state", "")).strip_edges() != PlayerProgressModel.PET_STATE_BATTLE:
			return {"available": false}
		var max_hp := maxi(0, int(instance.get("maxHp", 0)))
		var hp := maxi(0, int(instance.get("hp", 0)))
		if max_hp > 0:
			hp = mini(hp, max_hp)
		var form_id := str(
			instance.get("formId", instance.get("templateId", ""))
		).strip_edges()
		return {
			"available": true,
			"instanceId": active_instance_id,
			"name": str(instance.get("name", "")).strip_edges(),
			"level": maxi(0, int(instance.get("level", 0))),
			"hp": hp,
			"maxHp": max_hp,
			"formId": form_id,
			"portraitTexturePath": PetPortraitArtCatalog.resource_path_for_form(form_id),
		}
	return {"available": false}


static func _player_cell_state(value) -> Dictionary:
	if value is Vector2i:
		return {
			"available": true,
			"x": (value as Vector2i).x,
			"y": (value as Vector2i).y,
		}
	if value is Vector2:
		return {
			"available": true,
			"x": int((value as Vector2).x),
			"y": int((value as Vector2).y),
		}
	if value is Dictionary:
		var source := value as Dictionary
		if _is_number(source.get("x", null)) and _is_number(source.get("y", null)):
			return {
				"available": true,
				"x": int(source.get("x")),
				"y": int(source.get("y")),
			}
	return {"available": false}


static func _world_position_state(value) -> Dictionary:
	if value is Vector2:
		return {
			"available": true,
			"x": (value as Vector2).x,
			"y": (value as Vector2).y,
		}
	if value is Vector2i:
		return {
			"available": true,
			"x": float((value as Vector2i).x),
			"y": float((value as Vector2i).y),
		}
	if value is Dictionary:
		var source := value as Dictionary
		if _is_number(source.get("x", null)) and _is_number(source.get("y", null)):
			return {
				"available": true,
				"x": float(source.get("x")),
				"y": float(source.get("y")),
			}
	return {"available": false}


static func _party_state(value) -> Dictionary:
	var party := _dictionary(value)
	var raw_members = party.get("members", null)
	if not (raw_members is Array):
		return {
			"members": [],
			"count": 0,
			"truncated": false,
		}
	var members: Array[Dictionary] = []
	var values := raw_members as Array
	for index in range(mini(values.size(), MAX_PARTY_MEMBERS)):
		if values[index] is Dictionary:
			members.append(_party_member_state(values[index] as Dictionary))
	return {
		"members": members,
		"count": members.size(),
		"truncated": values.size() > MAX_PARTY_MEMBERS,
	}


static func _party_member_state(member: Dictionary) -> Dictionary:
	var result := {
		"accountId": _bounded_text(member.get("accountId", ""), MAX_CHAT_META_CHARS),
		"username": _bounded_text(member.get("username", ""), MAX_MEMBER_NAME_CHARS),
		"displayName": _bounded_text(member.get("displayName", ""), MAX_MEMBER_NAME_CHARS),
		"role": _bounded_text(member.get("role", ""), 16),
		"connectionState": _bounded_text(member.get("connectionState", ""), 16),
		"onlineAvailable": member.has("online"),
		"hpAvailable": false,
	}
	if member.has("online"):
		result["online"] = bool(member.get("online"))
	var team := _dictionary(member.get("teamSnapshot", null))
	var player := _dictionary(team.get("player", null))
	if _is_number(player.get("hp", null)) and _is_number(player.get("maxHp", null)):
		var max_hp := maxi(0, int(player.get("maxHp")))
		if max_hp > 0:
			result["hpAvailable"] = true
			result["hp"] = clampi(int(player.get("hp")), 0, max_hp)
			result["maxHp"] = max_hp
	return result


static func _latest_chat_state(value) -> Dictionary:
	if not (value is Array):
		return {"available": false}
	var messages := value as Array
	if messages.is_empty() or not (messages[-1] is Dictionary):
		return {"available": false}
	var message := messages[-1] as Dictionary
	var raw_text := str(message.get("text", "")).strip_edges()
	if raw_text == "":
		return {"available": false}
	return {
		"available": true,
		"channel": _bounded_text(message.get("channel", ""), 16),
		"author": _bounded_text(message.get("author", ""), MAX_CHAT_AUTHOR_CHARS),
		"text": _bounded_text(raw_text, MAX_CHAT_TEXT_CHARS),
		"textTruncated": raw_text.length() > MAX_CHAT_TEXT_CHARS,
		"createdAt": _bounded_text(message.get("createdAt", ""), MAX_CHAT_META_CHARS),
		"messageId": _bounded_text(message.get("messageId", ""), MAX_CHAT_META_CHARS),
	}


static func _mailbox_state(value) -> Dictionary:
	var mailbox := _dictionary(value)
	var synced := bool(mailbox.get("synced", false))
	var result := {
		"synced": synced,
		"unreadAvailable": false,
	}
	if not synced:
		return result
	var state := _dictionary(mailbox.get("state", mailbox))
	if not state.has("unreadCount") or not _is_number(state.get("unreadCount")):
		return result
	result["unreadAvailable"] = true
	result["unreadCount"] = MailboxPageModel.unread_count(state)
	return result


static func _line_state(value) -> Dictionary:
	var line := _dictionary(value)
	if line.is_empty() or not bool(line.get("available", false)):
		return {"available": false}
	var result := {"available": true}
	for key in ["lineId", "name", "label"]:
		if line.has(key):
			result[key] = _bounded_text(line.get(key), MAX_CHAT_META_CHARS)
	for key in ["playerCount", "capacity", "latencyMs"]:
		if line.has(key) and _is_number(line.get(key)):
			result[key] = maxi(0, int(line.get(key)))
	return result


static func _menu_state(runtime: Dictionary) -> Dictionary:
	var menu_source := _dictionary(runtime.get("menu", null))
	var authenticated := bool(
		menu_source.get(
			"authenticated",
			runtime.get("accountAuthenticated", false)
		)
	)
	var gm_access := bool(
		menu_source.get(
			"gmAccess",
			runtime.get("gmAccess", runtime.get("gmToolsVisible", false))
		)
	)
	var battle_active := bool(
		menu_source.get("battleActive", runtime.get("battleActive", false))
	)
	var gates: Dictionary = {}
	for entry_id in MENU_ENTRY_IDS:
		gates[entry_id] = {
			"visible": true,
			"disabled": battle_active and BATTLE_LOCKED_MENU_IDS.has(entry_id),
		}
	gates["account"] = {
		"visible": authenticated,
		"disabled": not authenticated,
	}
	gates["gm"] = {
		"visible": gm_access,
		"disabled": battle_active or not gm_access,
	}
	return {
		"authenticated": authenticated,
		"gmAccess": gm_access,
		"battleActive": battle_active,
		"gates": gates,
	}


static func _dictionary(value) -> Dictionary:
	return value as Dictionary if value is Dictionary else {}


static func _bounded_text(value, max_chars: int) -> String:
	var text := str(value).strip_edges()
	if max_chars <= 0 or text.length() <= max_chars:
		return text
	return text.substr(0, max_chars)


static func _is_number(value) -> bool:
	return value is int or value is float
