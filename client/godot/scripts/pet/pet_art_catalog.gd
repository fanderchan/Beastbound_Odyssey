extends RefCounted

const WorldVisualDirectionContract := preload("res://scripts/world/world_visual_direction_contract.gd")
const PetEvolutionReleaseAttestationModel := preload(
	"res://scripts/progression/pet_evolution_release_attestation_model.gd"
)
const PetFusionRecipeCatalogModel := preload(
	"res://scripts/progression/pet_fusion_recipe_catalog_model.gd"
)

const DATA_PATH := "res://data/pet_art_catalog.json"
const PET_TEMPLATE_PATH := "res://data/pet_templates.json"
const PET_FUSION_RECIPE_PATH := "res://data/pet_fusion_recipes.json"
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
	var fusion_document := _read_json_dictionary(PET_FUSION_RECIPE_PATH)
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
		if record.has("releaseAttestation"):
			var release_reference := (
				record.get("releaseAttestation", {}) as Dictionary
				if record.get("releaseAttestation", {}) is Dictionary
				else {}
			)
			var release_sha := str(release_reference.get("sha256", "")).strip_edges().to_lower()
			if (
				str(release_reference.get("path", ""))
				!= PetEvolutionReleaseAttestationModel.REPO_DATA_PATH
				or status != STATUS_APPROVED
				or not bool(record.get("runtimeEnabled", false))
			):
				errors.append("进化宠美术目录未绑定已开放的正式发布证明：%s" % form_id)
			else:
				var release_summary := (
					PetEvolutionReleaseAttestationModel.release_summary(release_sha)
				)
				if (
					not bool(release_summary.get("ok", false))
					or not (release_summary.get("formIds", []) as Array).has(form_id)
				):
					errors.append("进化宠正式发布证明无效：%s" % form_id)
		errors.append_array(
			capability_validation_errors(record, default_character, fusion_document)
		)
		var rideable_target := _rideable_target_for_validation(record)
		for key in ["displayName", "lineId", "subtypeId", "productionGroup", "artSkeletonId", "identityBrief"]:
			if str(record.get(key, "")).strip_edges() == "":
				errors.append("宠物美术目录缺少 %s：%s" % [key, form_id])
		_validate_bundle_record(record.get("pet", {}), "pet", form_id, errors)
		if rideable_target:
			_validate_bundle_record(record.get("mounted", {}), "mounted", form_id, errors)
	for template_form_id in template_form_ids.keys():
		if not seen_ids.has(template_form_id):
			errors.append("宠物美术目录漏登记模板形态：%s" % str(template_form_id))
	return errors


static func capability_validation_errors(
	record: Dictionary,
	default_character: String,
	fusion_document
) -> Array[String]:
	var errors: Array[String] = []
	var form_id := str(record.get("formId", "")).strip_edges()
	var rideable_target := _rideable_target_for_validation(record)
	if not record.has("rideableTarget"):
		errors.append("宠物美术目录必须显式登记 rideableTarget：%s" % form_id)
	elif typeof(record.get("rideableTarget")) != TYPE_BOOL:
		errors.append("宠物美术目录 rideableTarget 必须是布尔值：%s" % form_id)

	var supported_characters: Array[String] = []
	if not record.has("supportedCharacterIds"):
		errors.append("宠物美术目录必须显式登记 supportedCharacterIds：%s" % form_id)
	elif not (record.get("supportedCharacterIds") is Array):
		errors.append("宠物美术目录 supportedCharacterIds 必须是数组：%s" % form_id)
	else:
		var seen_characters: Dictionary = {}
		for value in record.get("supportedCharacterIds") as Array:
			if typeof(value) != TYPE_STRING or str(value).strip_edges() == "":
				errors.append(
					"宠物美术目录 supportedCharacterIds 只能包含非空字符串：%s" % form_id
				)
				continue
			var character_id := str(value).strip_edges()
			if seen_characters.has(character_id):
				errors.append(
					"宠物美术目录 supportedCharacterIds 不能重复：%s=%s"
					% [form_id, character_id]
				)
				continue
			seen_characters[character_id] = true
			supported_characters.append(character_id)

	if rideable_target:
		if not supported_characters.has(default_character):
			errors.append("可骑宠物未登记默认人物整图骑乘组合：%s" % form_id)
		if not record.has("mounted"):
			errors.append("可骑宠物必须登记 mounted 资产包：%s" % form_id)
	else:
		if not supported_characters.is_empty():
			errors.append("不可骑宠物不能登记整图骑乘人物：%s" % form_id)
		if record.has("mounted"):
			errors.append("不可骑宠物不能登记 mounted 资产包：%s" % form_id)
		if not _declared_fusion_target_form_ids(fusion_document).has(form_id):
			errors.append(
				"不可骑宠物必须是共享融合配方明确登记的 targetFormId：%s" % form_id
			)
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


static func _read_json_dictionary(path: String) -> Dictionary:
	if not FileAccess.file_exists(path):
		return {}
	var parsed = JSON.parse_string(FileAccess.get_file_as_string(path))
	return (parsed as Dictionary).duplicate(true) if parsed is Dictionary else {}


static func _declared_fusion_target_form_ids(document) -> Dictionary:
	var ids: Dictionary = {}
	if not (document is Dictionary):
		return ids
	var fusion_document := document as Dictionary
	if (
		int(fusion_document.get("schemaVersion", 0))
			!= PetFusionRecipeCatalogModel.CATALOG_SCHEMA_VERSION
		or str(fusion_document.get("catalogId", ""))
			!= PetFusionRecipeCatalogModel.CATALOG_ID
		or typeof(fusion_document.get("runtimeEnabled", null)) != TYPE_BOOL
	):
		return ids
	var recipes = fusion_document.get("recipes", null)
	if not (recipes is Array):
		return ids
	for value in recipes as Array:
		if not (value is Dictionary):
			continue
		var recipe := value as Dictionary
		var result = recipe.get("result", null)
		var asset_gate = recipe.get("assetGate", null)
		var recipe_id := str(recipe.get("recipeId", "")).strip_edges()
		var target_form_id := str(recipe.get("targetFormId", "")).strip_edges()
		if (
			recipe_id == ""
			or target_form_id == ""
			or str(recipe.get("targetGrowthProfileId", "")).strip_edges() == ""
			or not (recipe.get("roleGeneRules", null) is Dictionary)
			or not (result is Dictionary)
			or typeof((result as Dictionary).get("rideable", null)) != TYPE_BOOL
			or bool((result as Dictionary).get("rideable", true))
			or str((result as Dictionary).get("terminalPathId", ""))
				!= "fusion_terminal_v1"
			or not (asset_gate is Dictionary)
			or str((asset_gate as Dictionary).get("status", "")) != "formal"
			or str((asset_gate as Dictionary).get("replacementPath", "")).strip_edges() == ""
		):
			continue
		ids[target_form_id] = true
	return ids


static func _rideable_target_for_validation(record: Dictionary) -> bool:
	var value = record.get("rideableTarget", null)
	return value if typeof(value) == TYPE_BOOL else true


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
