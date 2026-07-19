extends RefCounted

const WorldVisualDirectionContract := preload("res://scripts/world/world_visual_direction_contract.gd")

const DATA_PATH := "res://data/pet_art_catalog.json"
const PET_TEMPLATE_PATH := "res://data/pet_templates.json"
const STATUS_PLANNED := "planned"
const STATUS_IN_PRODUCTION := "in_production"
const STATUS_OWNER_REVIEW_PENDING := "owner_review_pending"
const STATUS_APPROVED := "approved"
const STATUSES: Array[String] = [
	STATUS_PLANNED,
	STATUS_IN_PRODUCTION,
	STATUS_OWNER_REVIEW_PENDING,
	STATUS_APPROVED,
]

static var _loaded: bool = false
static var _catalog: Dictionary = {}
static var _forms_by_id: Dictionary = {}
static var _load_error: String = ""


static func form_record(form_id: String) -> Dictionary:
	_ensure_loaded()
	var value = _forms_by_id.get(form_id.strip_edges(), {})
	return (value as Dictionary).duplicate(true) if value is Dictionary else {}


static func all_form_records() -> Array[Dictionary]:
	_ensure_loaded()
	var records: Array[Dictionary] = []
	for value in _catalog.get("forms", []):
		if value is Dictionary:
			records.append((value as Dictionary).duplicate(true))
	return records


static func runtime_form_records() -> Array[Dictionary]:
	var records: Array[Dictionary] = []
	for record in all_form_records():
		if bool(record.get("runtimeEnabled", false)):
			records.append(record)
	return records


static func supports_form(form_id: String) -> bool:
	var record := form_record(form_id)
	return not record.is_empty() and bool(record.get("runtimeEnabled", false))


static func status_for_form(form_id: String) -> String:
	return str(form_record(form_id).get("status", ""))


static func pet_bundle_metadata_path(form_id: String) -> String:
	return _resource_path(str((form_record(form_id).get("pet", {}) as Dictionary).get("metadataPath", "")))


static func mounted_bundle_metadata_path(form_id: String) -> String:
	return _resource_path(str((form_record(form_id).get("mounted", {}) as Dictionary).get("metadataPath", "")))


static func default_character_id() -> String:
	_ensure_loaded()
	return str(_catalog.get("defaultCharacterId", ""))


static func canonical_directions() -> Array[String]:
	_ensure_loaded()
	return _string_array(_catalog.get("canonicalDirections", []))


static func battle_views() -> Array[String]:
	_ensure_loaded()
	return _string_array(_catalog.get("battleViews", []))


static func required_battle_actions() -> Array[String]:
	_ensure_loaded()
	return _string_array(_catalog.get("requiredBattleActions", []))


static func validation_errors() -> Array[String]:
	_ensure_loaded()
	var errors: Array[String] = []
	if _load_error != "":
		errors.append(_load_error)
		return errors
	if int(_catalog.get("schemaVersion", 0)) != 1:
		errors.append("宠物美术目录 schemaVersion 必须为 1")
	if canonical_directions() != WorldVisualDirectionContract.DIRECTIONS:
		errors.append("宠物美术目录方向必须与 Godot 真八向 canonical 完全一致")
	if battle_views() != ["front_3quarter_sw", "back_3quarter_ne"]:
		errors.append("宠物美术目录必须固定登记正背两个战斗斜向")
	var world_actions = _catalog.get("requiredWorldActions", {})
	if not (world_actions is Dictionary):
		errors.append("宠物美术目录 requiredWorldActions 不是对象")
	else:
		var typed_world_actions := world_actions as Dictionary
		if int(typed_world_actions.get("idle", 0)) != 1 or int(typed_world_actions.get("walk", 0)) != 4:
			errors.append("宠物美术目录世界最低动作必须为 idle 1 + walk 4")
	var expected_battle_actions: Array[String] = [
		"idle", "walk", "attack", "skill", "hurt", "defend",
		"dodge", "counter", "stagger", "knockaway", "down", "revive",
	]
	if required_battle_actions() != expected_battle_actions:
		errors.append("宠物美术目录必须登记完整十二行战斗身体动作")
	var default_character := default_character_id()
	if default_character == "":
		errors.append("宠物美术目录缺少默认人物 ID")
	var template_form_ids := _template_form_ids(errors)
	var seen_ids: Dictionary = {}
	for record in all_form_records():
		var form_id := str(record.get("formId", "")).strip_edges()
		if form_id == "":
			errors.append("宠物美术目录存在空 formId")
			continue
		if seen_ids.has(form_id):
			errors.append("宠物美术目录重复 formId：%s" % form_id)
		seen_ids[form_id] = true
		if not template_form_ids.has(form_id):
			errors.append("宠物美术目录登记未知 formId：%s" % form_id)
		var status := str(record.get("status", ""))
		if not STATUSES.has(status):
			errors.append("宠物美术状态无效：%s=%s" % [form_id, status])
		if bool(record.get("runtimeEnabled", false)) and status == STATUS_PLANNED:
			errors.append("planned 宠物不能直接启用运行资产：%s" % form_id)
		if status == STATUS_APPROVED and not bool(record.get("runtimeEnabled", false)):
			errors.append("approved 宠物必须启用运行资产：%s" % form_id)
		if not bool(record.get("rideableTarget", false)):
			errors.append("全宠可骑目标缺失：%s" % form_id)
		var supported_characters := _string_array(record.get("supportedCharacterIds", []))
		if not supported_characters.has(default_character):
			errors.append("宠物未登记默认人物整图骑乘组合：%s" % form_id)
		for key in ["displayName", "lineId", "subtypeId", "productionGroup", "artSkeletonId", "identityBrief"]:
			if str(record.get(key, "")).strip_edges() == "":
				errors.append("宠物美术目录缺少 %s：%s" % [key, form_id])
		_validate_bundle_record(record.get("pet", {}), "pet", form_id, errors)
		_validate_bundle_record(record.get("mounted", {}), "mounted", form_id, errors)
	for template_form_id in template_form_ids.keys():
		if not seen_ids.has(template_form_id):
			errors.append("宠物美术目录漏登记模板形态：%s" % str(template_form_id))
	return errors


static func _ensure_loaded() -> void:
	if _loaded:
		return
	_loaded = true
	if not FileAccess.file_exists(DATA_PATH):
		_load_error = "缺少宠物美术目录：%s" % DATA_PATH
		return
	var parsed = JSON.parse_string(FileAccess.get_file_as_string(DATA_PATH))
	if not (parsed is Dictionary):
		_load_error = "宠物美术目录不是有效 JSON 对象：%s" % DATA_PATH
		return
	_catalog = parsed as Dictionary
	for value in _catalog.get("forms", []):
		if not (value is Dictionary):
			continue
		var record := value as Dictionary
		var form_id := str(record.get("formId", "")).strip_edges()
		if form_id != "" and not _forms_by_id.has(form_id):
			_forms_by_id[form_id] = record


static func _template_form_ids(errors: Array[String]) -> Dictionary:
	var ids: Dictionary = {}
	if not FileAccess.file_exists(PET_TEMPLATE_PATH):
		errors.append("缺少宠物模板目录：%s" % PET_TEMPLATE_PATH)
		return ids
	var parsed = JSON.parse_string(FileAccess.get_file_as_string(PET_TEMPLATE_PATH))
	if not (parsed is Dictionary):
		errors.append("宠物模板目录不是有效 JSON 对象")
		return ids
	for value in (parsed as Dictionary).get("forms", []):
		if value is Dictionary:
			var form_id := str((value as Dictionary).get("formId", "")).strip_edges()
			if form_id != "":
				ids[form_id] = true
	return ids


static func _validate_bundle_record(value, kind: String, form_id: String, errors: Array[String]) -> void:
	if not (value is Dictionary):
		errors.append("宠物美术目录 %s 包不是对象：%s" % [kind, form_id])
		return
	var record := value as Dictionary
	for key in ["root", "metadataPath", "identityPath", "ownershipPath", "promptPath"]:
		var path := str(record.get(key, "")).strip_edges()
		if path == "":
			errors.append("宠物美术目录 %s.%s 为空：%s" % [kind, key, form_id])
		elif path.begins_with("res://") or path.begins_with("/"):
			errors.append("宠物美术目录路径必须为 repo-relative：%s" % path)


static func _resource_path(repo_relative_path: String) -> String:
	var normalized := repo_relative_path.strip_edges().replace("\\", "/")
	var prefix := "client/godot/"
	if normalized.begins_with(prefix):
		return "res://%s" % normalized.substr(prefix.length())
	return ""


static func _string_array(value) -> Array[String]:
	var result: Array[String] = []
	if value is Array:
		for item in value as Array:
			result.append(str(item))
	return result
