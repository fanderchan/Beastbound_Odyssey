extends RefCounted

const NpcArtCatalog := preload("res://scripts/world/npc_art_catalog.gd")


static func portrait_state_for(
	item: Dictionary,
	is_speaking: bool = false,
	requested_state: String = ""
) -> String:
	var explicit_state := requested_state.strip_edges()
	if explicit_state == "":
		explicit_state = str(item.get("portraitState", "")).strip_edges()
	if explicit_state != "":
		return NpcArtCatalog.normalize_portrait_state(explicit_state)
	return NpcArtCatalog.PORTRAIT_SPEAKING if is_speaking else NpcArtCatalog.PORTRAIT_NEUTRAL


static func presentation_for(
	item: Dictionary,
	is_speaking: bool = false,
	requested_state: String = ""
) -> Dictionary:
	var appearance_id := NpcArtCatalog.appearance_id_for_instance(item)
	var state := portrait_state_for(item, is_speaking, requested_state)
	var texture := NpcArtCatalog.portrait_texture(appearance_id, state)
	return {
		"appearanceId": appearance_id,
		"state": state,
		"texture": texture,
		"visible": texture != null,
	}


static func apply_to_texture_rect(
	portrait_rect: TextureRect,
	item: Dictionary,
	is_speaking: bool = false,
	requested_state: String = ""
) -> bool:
	if portrait_rect == null:
		return false
	var presentation := presentation_for(item, is_speaking, requested_state)
	var texture_value = presentation.get("texture")
	portrait_rect.texture = texture_value as Texture2D if texture_value is Texture2D else null
	portrait_rect.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	portrait_rect.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	portrait_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	portrait_rect.visible = portrait_rect.texture != null
	return portrait_rect.visible


static func clear_texture_rect(portrait_rect: TextureRect) -> void:
	if portrait_rect == null:
		return
	portrait_rect.texture = null
	portrait_rect.visible = false
