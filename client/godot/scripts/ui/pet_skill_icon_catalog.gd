extends RefCounted

const BattleActionCatalog := preload("res://scripts/battle/battle_action_catalog.gd")
const BattlePassiveCatalog := preload("res://scripts/battle/battle_passive_catalog.gd")

const KIND_ACTIVE := "active"
const KIND_PASSIVE := "passive"

static var _texture_cache: Dictionary = {}


static func texture_for(
	ability_id: String,
	kind: String = "",
	declared_path: String = ""
) -> Texture2D:
	var path := resource_path_for(ability_id, kind, declared_path)
	if path == "":
		return null
	if _texture_cache.has(path):
		return _texture_cache.get(path) as Texture2D
	var loaded = ResourceLoader.load(path)
	var texture := loaded as Texture2D if loaded is Texture2D else null
	_texture_cache[path] = texture
	return texture


static func texture_for_view(view: Dictionary) -> Texture2D:
	return texture_for(
		str(view.get("abilityId", "")),
		str(view.get("kind", "")),
		str(view.get("iconPath", ""))
	)


static func resource_path_for(
	ability_id: String,
	kind: String = "",
	declared_path: String = ""
) -> String:
	var path := declared_resource_path_for(ability_id, kind, declared_path)
	if path == "" or not path.begins_with("res://"):
		return ""
	return path if ResourceLoader.exists(path, "Texture2D") else ""


static func declared_resource_path_for(
	ability_id: String,
	kind: String = "",
	declared_path: String = ""
) -> String:
	var explicit_path := declared_path.strip_edges()
	if explicit_path != "":
		return explicit_path
	var entry := _entry_for(ability_id, kind)
	if entry.is_empty():
		return ""
	var raw_presentation = entry.get("presentation", {})
	if not (raw_presentation is Dictionary):
		return ""
	return str((raw_presentation as Dictionary).get("iconPath", "")).strip_edges()


static func uses_formal_icon(
	ability_id: String,
	kind: String = "",
	declared_path: String = ""
) -> bool:
	return resource_path_for(ability_id, kind, declared_path) != ""


static func validation_errors_for_views(views: Array[Dictionary]) -> Array[String]:
	var errors: Array[String] = []
	for view in views:
		if bool(view.get("isEmpty", false)):
			continue
		var ability_id := str(view.get("abilityId", ""))
		var kind := str(view.get("kind", ""))
		if ability_id == "":
			errors.append("非空技能卡缺少 abilityId")
			continue
		var declared_path := declared_resource_path_for(
			ability_id,
			kind,
			str(view.get("iconPath", ""))
		)
		if declared_path == "":
			errors.append("%s 缺少 canonical presentation.iconPath" % ability_id)
		elif not declared_path.begins_with("res://"):
			errors.append("%s 图标路径必须以 res:// 开头" % ability_id)
		elif not ResourceLoader.exists(declared_path, "Texture2D"):
			errors.append("%s 图标不存在: %s" % [ability_id, declared_path])
	return errors


static func reset_cache() -> void:
	_texture_cache.clear()


static func _entry_for(ability_id: String, kind: String) -> Dictionary:
	var normalized_id := ability_id.strip_edges()
	if normalized_id == "":
		return {}
	var normalized_kind := kind.strip_edges().to_lower()
	if normalized_kind == KIND_PASSIVE:
		return BattlePassiveCatalog.passive_by_id(normalized_id)
	if normalized_kind == KIND_ACTIVE:
		return BattleActionCatalog.action_by_id(normalized_id)
	var action := BattleActionCatalog.action_by_id(normalized_id)
	if not action.is_empty():
		return action
	return BattlePassiveCatalog.passive_by_id(normalized_id)
