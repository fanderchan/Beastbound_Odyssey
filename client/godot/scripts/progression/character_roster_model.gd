extends RefCounted

const CharacterNamePolicyModel := preload(
	"res://scripts/progression/character_name_policy_model.gd"
)

const SCHEMA_VERSION := 1
const SLOT_COUNT := 4
const NAME_MIN_LENGTH := 1
const NAME_MAX_LENGTH := 24
const NAME_MAX_UTF8_BYTES := 96
const DEFAULT_APPEARANCE_ID := "novice_hunter_v1"


static func empty_roster() -> Dictionary:
	var slots: Array[Dictionary] = []
	for slot_index in range(SLOT_COUNT):
		slots.append(empty_slot(slot_index))
	return {
		"schemaVersion": SCHEMA_VERSION,
		"slots": slots,
		"characters": [],
		"selectedPlayerId": "",
		"selectedCharacterId": "",
		"occupiedCount": 0,
		"availableSlotIndices": [0, 1, 2, 3],
		"canCreate": true,
		"contractErrors": [],
	}


static func normalize_roster(value) -> Dictionary:
	var root := _response_root(value)
	var raw_characters := _character_values(root)
	var slots: Array[Dictionary] = []
	for slot_index in range(SLOT_COUNT):
		slots.append(empty_slot(slot_index))

	var characters: Array[Dictionary] = []
	var contract_errors: Array[String] = []
	var seen_player_ids: Dictionary = {}
	for raw_value in raw_characters:
		if not (raw_value is Dictionary):
			contract_errors.append("角色摘要必须是对象")
			continue
		var raw := raw_value as Dictionary
		var preferred_slot := _declared_slot_index(raw)
		if raw.has("occupied") and not bool(raw.get("occupied", false)):
			if preferred_slot < 0 or preferred_slot >= SLOT_COUNT:
				contract_errors.append("空角色槽索引无效")
			elif _first_non_empty_string(
				raw,
				["playerId", "characterId", "id"]
			) != "":
				contract_errors.append(
					"第%d个空角色槽不应包含playerId"
					% (preferred_slot + 1)
				)
			continue
		var slot_index := preferred_slot
		if not _slot_available(slots, slot_index):
			slot_index = _first_empty_slot_index(slots)
		if slot_index < 0:
			contract_errors.append("角色数量超过%d个" % SLOT_COUNT)
			continue
		var character := normalize_character_summary(raw, slot_index)
		var player_id := str(character.get("playerId", ""))
		if player_id == "":
			contract_errors.append("第%d个角色缺少playerId" % (slot_index + 1))
			continue
		if seen_player_ids.has(player_id):
			contract_errors.append("playerId重复：%s" % player_id)
			continue
		seen_player_ids[player_id] = true
		character["slotIndex"] = slot_index
		slots[slot_index] = character
		characters.append(character.duplicate(true))

	characters.sort_custom(func(left: Dictionary, right: Dictionary) -> bool:
		return int(left.get("slotIndex", 0)) < int(right.get("slotIndex", 0))
	)
	var selected_player_id := _selected_player_id(root)
	if not seen_player_ids.has(selected_player_id):
		selected_player_id = (
			str(characters[0].get("playerId", ""))
			if not characters.is_empty()
			else ""
		)
	var available_slot_indices: Array[int] = []
	for slot_index in range(SLOT_COUNT):
		if not bool(slots[slot_index].get("occupied", false)):
			available_slot_indices.append(slot_index)
	var result := {
		"schemaVersion": SCHEMA_VERSION,
		"slots": slots,
		"characters": characters,
		"selectedPlayerId": selected_player_id,
		"selectedCharacterId": selected_player_id,
		"occupiedCount": characters.size(),
		"availableSlotIndices": available_slot_indices,
		"canCreate": not available_slot_indices.is_empty(),
		"contractErrors": contract_errors,
	}
	for error in roster_contract_errors(result):
		if not contract_errors.has(error):
			contract_errors.append(error)
	return result


static func normalize_character_summary(
	value,
	fallback_slot_index: int = 0
) -> Dictionary:
	var raw := value as Dictionary if value is Dictionary else {}
	var player_id := _first_non_empty_string(
		raw,
		["playerId", "characterId", "id"]
	)
	var name := _first_non_empty_string(
		raw,
		["name", "displayName", "playerName"]
	)
	var map_id := _first_non_empty_string(
		raw,
		["mapId", "currentMapId", "lastMapId"]
	)
	var map_name := _first_non_empty_string(
		raw,
		["mapName", "mapLabel", "currentMapName", "lastMapName"]
	)
	if map_name == "" and map_id != "":
		map_name = map_id
	var portrait_path := _first_non_empty_string(
		raw,
		[
			"portraitTexturePath",
			"portraitPath",
			"portraitAssetPath",
		]
	)
	var showcase_path := _first_non_empty_string(
		raw,
		[
			"showcaseTexturePath",
			"showcasePath",
			"characterTexturePath",
			"fullBodyTexturePath",
		]
	)
	var appearance_id := _first_non_empty_string(
		raw,
		["appearanceId", "characterAppearanceId", "avatarId"]
	)
	if appearance_id == "":
		appearance_id = DEFAULT_APPEARANCE_ID
	var elements_value = raw.get("elements", null)
	var elements = _normalize_elements_or_null(elements_value)
	var needs_element_allocation := bool(
		raw.get(
			"needsElementAllocation",
			not (elements_value is Dictionary)
		)
	)
	var slot_index := _declared_slot_index(raw)
	if slot_index < 0 or slot_index >= SLOT_COUNT:
		slot_index = clampi(fallback_slot_index, 0, SLOT_COUNT - 1)
	return {
		"occupied": player_id != "",
		"playerId": player_id,
		"characterId": player_id,
		"slotIndex": slot_index,
		"name": name if name != "" else "未命名角色",
		"level": maxi(1, int(raw.get("level", raw.get("playerLevel", 1)))),
		"rebirthCount": maxi(0, int(raw.get("rebirthCount", 0))),
		"mapId": map_id,
		"mapName": map_name,
		"appearanceId": appearance_id,
		"elements": elements,
		"needsElementAllocation": needs_element_allocation,
		"portraitTexturePath": portrait_path,
		"showcaseTexturePath": showcase_path,
		"portraitTexture": raw.get("portraitTexture", null),
		"showcaseTexture": raw.get("showcaseTexture", null),
		"lastPlayedAt": _first_non_empty_string(
			raw,
			["lastPlayedAt", "lastLoginAt", "updatedAt"]
		),
		"createdAt": _first_non_empty_string(raw, ["createdAt"]),
	}


static func empty_slot(slot_index: int) -> Dictionary:
	return {
		"occupied": false,
		"playerId": "",
		"characterId": "",
		"slotIndex": clampi(slot_index, 0, SLOT_COUNT - 1),
		"name": "创建角色",
		"level": 0,
		"rebirthCount": 0,
		"mapId": "",
		"mapName": "",
		"appearanceId": "",
		"elements": null,
		"needsElementAllocation": false,
		"portraitTexturePath": "",
		"showcaseTexturePath": "",
		"portraitTexture": null,
		"showcaseTexture": null,
		"lastPlayedAt": "",
		"createdAt": "",
	}


static func selected_character(roster_value) -> Dictionary:
	var roster := (
		normalize_roster(roster_value)
		if not _looks_normalized(roster_value)
		else (roster_value as Dictionary)
	)
	return character_by_id(
		roster,
		str(
			roster.get(
				"selectedPlayerId",
				roster.get("selectedCharacterId", "")
			)
		)
	)


static func character_by_id(
	roster_value,
	character_id: String
) -> Dictionary:
	return character_by_player_id(roster_value, character_id)


static func character_by_player_id(
	roster_value,
	player_id: String
) -> Dictionary:
	var normalized_id := player_id.strip_edges()
	if normalized_id == "":
		return {}
	var roster := (
		normalize_roster(roster_value)
		if not _looks_normalized(roster_value)
		else (roster_value as Dictionary)
	)
	var values = roster.get("characters", [])
	if not (values is Array):
		return {}
	for value in values as Array:
		if value is Dictionary:
			var character := value as Dictionary
			if str(
				character.get(
					"playerId",
					character.get("characterId", "")
				)
			) == normalized_id:
				return character.duplicate(true)
	return {}


static func with_selected_character(
	roster_value,
	player_id: String
) -> Dictionary:
	var roster := (
		normalize_roster(roster_value)
		if not _looks_normalized(roster_value)
		else (roster_value as Dictionary).duplicate(true)
	)
	if character_by_player_id(roster, player_id).is_empty():
		return roster
	roster["selectedPlayerId"] = player_id.strip_edges()
	roster["selectedCharacterId"] = player_id.strip_edges()
	return roster


static func first_empty_slot_index(roster_value) -> int:
	var roster := (
		normalize_roster(roster_value)
		if not _looks_normalized(roster_value)
		else (roster_value as Dictionary)
	)
	var values = roster.get("slots", [])
	if not (values is Array):
		return -1
	return _first_empty_slot_index(values as Array)


static func character_name_errors(value: String) -> Array[String]:
	var name := value.strip_edges()
	var errors: Array[String] = []
	if name.length() < NAME_MIN_LENGTH:
		errors.append("角色名不能为空")
	if name.length() > NAME_MAX_LENGTH:
		errors.append("角色名最多%d个字" % NAME_MAX_LENGTH)
	if name.to_utf8_buffer().size() > NAME_MAX_UTF8_BYTES:
		errors.append("角色名内容过长")
	if _contains_control_character(name):
		errors.append("角色名包含不能使用的字符")
	elif not CharacterNamePolicyModel.is_allowed(name):
		errors.append(CharacterNamePolicyModel.player_message())
	return errors


static func build_create_request(
	slot_index: int,
	raw_name: String
) -> Dictionary:
	var normalized_name := raw_name.strip_edges()
	var errors := character_name_errors(normalized_name)
	if slot_index < 0 or slot_index >= SLOT_COUNT:
		errors.append("请选择可用的角色位置")
	return {
		"valid": errors.is_empty(),
		"payload": {
			"slotIndex": slot_index,
			"displayName": normalized_name,
		},
		"errors": errors,
	}


static func build_select_request(
	roster_value,
	player_id: String
) -> Dictionary:
	var normalized_id := player_id.strip_edges()
	var character := character_by_player_id(roster_value, normalized_id)
	var errors: Array[String] = []
	if normalized_id == "" or character.is_empty():
		errors.append("请选择要进入游戏的角色")
	return {
		"valid": errors.is_empty(),
		"payload": {"playerId": normalized_id},
		"errors": errors,
	}


static func roster_contract_errors(roster_value) -> Array[String]:
	var errors: Array[String] = []
	if not (roster_value is Dictionary):
		return ["角色列表必须是对象"]
	var roster := roster_value as Dictionary
	var slots_value = roster.get("slots", [])
	if not (slots_value is Array):
		return ["角色槽必须是数组"]
	var slots := slots_value as Array
	if slots.size() != SLOT_COUNT:
		errors.append("角色槽必须固定为%d个" % SLOT_COUNT)
	var seen_ids: Dictionary = {}
	for slot_index in range(slots.size()):
		var value = slots[slot_index]
		if not (value is Dictionary):
			errors.append("第%d个角色槽必须是对象" % (slot_index + 1))
			continue
		var slot := value as Dictionary
		if int(slot.get("slotIndex", -1)) != slot_index:
			errors.append("第%d个角色槽索引不一致" % (slot_index + 1))
		if not bool(slot.get("occupied", false)):
			continue
		var player_id := str(
			slot.get("playerId", slot.get("characterId", ""))
		).strip_edges()
		if player_id == "":
			errors.append("第%d个已占用角色槽缺少playerId" % (slot_index + 1))
		elif seen_ids.has(player_id):
			errors.append("playerId重复：%s" % player_id)
		else:
			seen_ids[player_id] = true
	var occupied_count := seen_ids.size()
	if int(roster.get("occupiedCount", -1)) != occupied_count:
		errors.append("角色数量与已占用槽不一致")
	var selected_id := str(
		roster.get(
			"selectedPlayerId",
			roster.get("selectedCharacterId", "")
		)
	).strip_edges()
	if selected_id != "" and not seen_ids.has(selected_id):
		errors.append("选中的角色不在角色列表中")
	return errors


static func _response_root(value) -> Dictionary:
	if not (value is Dictionary):
		return {}
	var root := value as Dictionary
	var data_value = root.get("data", null)
	if data_value is Dictionary:
		var data := data_value as Dictionary
		for key in [
			"characters",
			"roster",
			"characterSummaries",
			"selectedCharacterId",
			"selectedPlayerId",
			"activeCharacterId",
		]:
			if data.has(key):
				return data
	return root


static func _character_values(root: Dictionary) -> Array:
	for key in ["characters", "roster", "characterSummaries", "items"]:
		var value = root.get(key, null)
		if value is Array:
			return value as Array
	return []


static func _selected_player_id(root: Dictionary) -> String:
	var selected_id := _first_non_empty_string(
		root,
		[
			"selectedPlayerId",
			"selectedCharacterId",
			"activePlayerId",
			"activeCharacterId",
			"currentCharacterId",
		]
	)
	if selected_id != "":
		return selected_id
	var selected_value = root.get("selectedCharacter", null)
	if selected_value is Dictionary:
		selected_id = _first_non_empty_string(
			selected_value as Dictionary,
			["playerId", "characterId", "id"]
		)
		if selected_id != "":
			return selected_id
	for character_value in _character_values(root):
		if (
			character_value is Dictionary
			and bool((character_value as Dictionary).get("selected", false))
		):
			selected_id = _first_non_empty_string(
				character_value as Dictionary,
				["playerId", "characterId", "id"]
			)
			if selected_id != "":
				return selected_id
	return ""


static func _declared_slot_index(value: Dictionary) -> int:
	for key in ["slotIndex", "characterSlotIndex", "slot"]:
		if value.has(key):
			return int(value.get(key, -1))
	return -1


static func _slot_available(slots: Array[Dictionary], slot_index: int) -> bool:
	return (
		slot_index >= 0
		and slot_index < slots.size()
		and not bool(slots[slot_index].get("occupied", false))
	)


static func _first_empty_slot_index(slots: Array) -> int:
	for slot_index in range(mini(slots.size(), SLOT_COUNT)):
		var value = slots[slot_index]
		if value is Dictionary and not bool(
			(value as Dictionary).get("occupied", false)
		):
			return slot_index
	return -1


static func _first_non_empty_string(
	value: Dictionary,
	keys: Array
) -> String:
	for key_value in keys:
		var result := str(value.get(str(key_value), "")).strip_edges()
		if result != "":
			return result
	return ""


static func _contains_control_character(value: String) -> bool:
	for index in range(value.length()):
		var codepoint := value.unicode_at(index)
		if codepoint < 32 or codepoint == 127:
			return true
	return false


static func _normalize_elements_or_null(value):
	if not (value is Dictionary):
		return null
	var raw := value as Dictionary
	return {
		"earth": clampi(int(raw.get("earth", 0)), 0, 10),
		"water": clampi(int(raw.get("water", 0)), 0, 10),
		"fire": clampi(int(raw.get("fire", 0)), 0, 10),
		"wind": clampi(int(raw.get("wind", 0)), 0, 10),
	}


static func _looks_normalized(value) -> bool:
	return (
		value is Dictionary
		and int((value as Dictionary).get("schemaVersion", 0))
			== SCHEMA_VERSION
		and (value as Dictionary).get("slots", null) is Array
	)
