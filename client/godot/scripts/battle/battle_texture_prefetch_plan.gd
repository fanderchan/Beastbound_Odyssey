extends RefCounted

const PetArt := preload("res://scripts/pet/pet_action_asset_catalog.gd")
const CharacterArt := preload("res://scripts/player/character_action_asset_catalog.gd")
const MAX_PET_FORMS := 6
const MAX_CHARACTER_APPEARANCES := 4
const MAX_RESOURCES := 2048


static func subjects(map_data: Dictionary, profile: Dictionary, nearby_players: Array = []) -> Dictionary:
	var forms: Array[String] = []
	var active_id := str(profile.get("activePetInstanceId", ""))
	for pet in profile.get("petInstances", []):
		if pet is Dictionary and active_id != "" and str(pet.get("instanceId", "")) == active_id:
			_append_form(forms, str(pet.get("formId", pet.get("templateId", ""))))
			break
	# Only explicit encounters on this map: never enumerate the global codex,
	# roll encounters, normalize profiles, or read another player's private pets.
	for zone in map_data.get("encounterZones", []):
		if not zone is Dictionary:
			continue
		for key in ["fixedWildPets", "wildPetPool"]:
			for entry in zone.get(key, []):
				if not entry is Dictionary:
					continue
				var form := str(entry.get("formId", entry.get("templateId", "")))
				if typeof(entry.get("catchable")) == TYPE_BOOL and entry.get("catchable") == false:
					var appearance := str(entry.get("battleAppearanceFormId", "")).strip_edges()
					if appearance != "":
						form = appearance
				_append_form(forms, form)
	var player: Dictionary = profile.get("player", {})
	var own_appearance := CharacterArt.resolve_appearance_id(str(player.get("appearanceId", "")))
	var nearby_appearances: Array[String] = []
	var map_id := str(map_data.get("id", ""))
	# Only the bounded public presence cache, refreshed by network events.
	# Movement, player order and duplicate appearances must not restart loading.
	for value in nearby_players:
		if not value is Dictionary or not value.get("position") is Dictionary:
			continue
		if map_id == "" or str(value.position.get("mapId", "")) != map_id:
			continue
		var appearance := CharacterArt.resolve_appearance_id(str(value.get("appearanceId", "")))
		if appearance != own_appearance and not nearby_appearances.has(appearance):
			nearby_appearances.append(appearance)
	nearby_appearances.sort()
	var appearances: Array[String] = [own_appearance]
	for appearance in nearby_appearances:
		if appearances.size() >= MAX_CHARACTER_APPEARANCES:
			break
		appearances.append(appearance)
	return {"forms": forms, "appearances": appearances}


static func paths_for(subject: Dictionary) -> PackedStringArray:
	var paths := PackedStringArray()
	for appearance in subject.get("appearances", []):
		paths.append_array(CharacterArt.battle_texture_paths(str(appearance)))
	for form in subject.get("forms", []):
		paths.append_array(PetArt.battle_texture_paths(str(form)))
	if paths.size() > MAX_RESOURCES:
		paths.resize(MAX_RESOURCES)
	return paths


static func _append_form(forms: Array[String], value: String) -> void:
	var form := value.strip_edges()
	if form == "" or forms.has(form) or forms.size() >= MAX_PET_FORMS:
		return
	if PetArt.supports_form(form) and not PetArt.is_standalone_review_overlay_enabled(form):
		forms.append(form)
