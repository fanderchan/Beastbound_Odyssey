extends RefCounted

const SHOWCASE_ROOT := "res://assets/ui/pet_management_awakened_v2/runtime/showcase"

static var _texture_cache: Dictionary = {}


static func texture_for_form(form_id: String) -> Texture2D:
	var normalized_id := form_id.strip_edges()
	if normalized_id == "" or not normalized_id.is_valid_identifier():
		return null
	if _texture_cache.has(normalized_id):
		return _texture_cache.get(normalized_id) as Texture2D
	var resource_path := "%s/%s.png" % [SHOWCASE_ROOT, normalized_id]
	if not ResourceLoader.exists(resource_path, "Texture2D"):
		_texture_cache[normalized_id] = null
		return null
	var texture := ResourceLoader.load(resource_path, "Texture2D") as Texture2D
	_texture_cache[normalized_id] = texture
	return texture


static func supports_form(form_id: String) -> bool:
	return texture_for_form(form_id) != null


static func asset_path_for_form(form_id: String) -> String:
	var normalized_id := form_id.strip_edges()
	if normalized_id == "" or not normalized_id.is_valid_identifier():
		return ""
	var resource_path := "%s/%s.png" % [SHOWCASE_ROOT, normalized_id]
	return resource_path if ResourceLoader.exists(resource_path, "Texture2D") else ""
