extends RefCounted

const DATA_PATH := "res://data/pet_evolution_release_attestation_v1.json"
const REPO_DATA_PATH := "client/godot/data/pet_evolution_release_attestation_v1.json"
const ATTESTATION_TYPE := "beastbound_pet_evolution_runtime_release_attestation"
const ATTESTATION_ID := "pet_evolution_p1_3e_runtime_release_v1"
const OWNER_DECISION_TYPE := "beastbound_pet_evolution_runtime_release_owner_decision"
const OWNER_DECISION_ID := "pet_evolution_p1_3e_runtime_release_20260726"
const ROUTE_CATALOG_ID := "pet_evolution_routes_v2"
const ROUTE_IDS: Array[String] = [
	"wuli_crystal_evolution_v1",
	"driftfox_moon_gale_evolution_v1",
]
const FORM_IDS: Array[String] = [
	"wuli_evolved_crystal_earth8_water2",
	"driftfox_evolved_moon_gale_wind7_water3",
]
const VISUAL_SCOPES: Array[String] = [
	"standalone_pet_world_true8_visual_only",
	"standalone_pet_battle_visual_only",
	"evolution_visual_only",
	"integrated_mounted_world_true8_visual_only",
	"integrated_mounted_battle_visual_only",
]
const VALIDATION_KINDS: Array[String] = [
	"two_reject_two_allow_authoritative_transaction",
	"full_512_source_and_runtime_derivation_closure",
	"all_remaining_visual_owner_approvals",
]

static var _loaded := false
static var _document: Dictionary = {}
static var _load_error := ""


static func validation_errors(expected_sha256: String = "") -> Array[String]:
	_ensure_loaded()
	var errors: Array[String] = []
	if _load_error != "":
		errors.append(_load_error)
		return errors
	var expected_sha := expected_sha256.strip_edges().to_lower()
	var actual_sha := FileAccess.get_file_as_string(DATA_PATH).sha256_text()
	if expected_sha != "" and expected_sha != actual_sha:
		errors.append("进化发布证明 SHA-256 与路线目录不一致")
	if int(_document.get("schemaVersion", 0)) != 1:
		errors.append("进化发布证明 schemaVersion 必须为1")
	if (
		str(_document.get("attestationType", "")) != ATTESTATION_TYPE
		or str(_document.get("attestationId", "")) != ATTESTATION_ID
		or str(_document.get("status", "")) != "approved"
		or str(_document.get("ownerReviewStatus", "")) != "approved"
		or _document.get("releaseApproved", null) != true
		or _document.get("runtimeEnabled", null) != true
	):
		errors.append("进化发布证明必须是项目所有者批准且可运行的P1.3e证明")
	if str(_document.get("routeCatalogId", "")) != ROUTE_CATALOG_ID:
		errors.append("进化发布证明路线目录ID不匹配")
	if _string_array(_document.get("routeIds", [])) != ROUTE_IDS:
		errors.append("进化发布证明必须精确覆盖两条正式路线")
	_validate_expected_lifecycle(_dict(_document.get("expectedBundleLifecycle", {})), errors)
	_validate_owner_decision(_dict(_document.get("ownerDecision", {})), errors)
	_validate_forms(actual_sha, errors)
	_validate_validation_evidence(errors)
	return errors


static func release_summary(expected_sha256: String = "") -> Dictionary:
	var errors := validation_errors(expected_sha256)
	return {
		"ok": errors.is_empty(),
		"attestationId": str(_document.get("attestationId", "")),
		"routeCatalogId": str(_document.get("routeCatalogId", "")),
		"routeIds": _string_array(_document.get("routeIds", [])),
		"formIds": FORM_IDS.duplicate(),
		"releaseApproved": bool(_document.get("releaseApproved", false)),
		"runtimeEnabled": bool(_document.get("runtimeEnabled", false)),
		"sha256": (
			FileAccess.get_file_as_string(DATA_PATH).sha256_text()
			if FileAccess.file_exists(DATA_PATH)
			else ""
		),
		"errors": errors,
	}


static func _validate_owner_decision(reference: Dictionary, errors: Array[String]) -> void:
	var document := _validated_json_reference(reference, "进化整包 owner decision", errors)
	if document.is_empty():
		return
	if (
		int(document.get("schemaVersion", 0)) != 1
		or str(document.get("decisionType", "")) != OWNER_DECISION_TYPE
		or str(document.get("decisionId", "")) != OWNER_DECISION_ID
		or str(document.get("decision", "")) != "approved"
		or str(document.get("ownerReviewStatus", "")) != "approved"
		or document.get("releaseApproved", null) != true
		or document.get("runtimeEnabled", null) != true
		or str(document.get("roadmapItem", "")) != "P1.3e"
		or str(document.get("routeCatalogId", "")) != ROUTE_CATALOG_ID
		or _string_array(document.get("routeIds", [])) != ROUTE_IDS
		or _string_array(document.get("targetFormIds", [])) != FORM_IDS
		or not _string_array(document.get("excludedScope", [])).has("pet_fusion_runtime")
	):
		errors.append("进化整包 owner decision 未精确批准P1.3e或错误包含融合运行时")


static func _validate_forms(attestation_sha256: String, errors: Array[String]) -> void:
	var forms_value = _document.get("forms", [])
	if not (forms_value is Array) or (forms_value as Array).size() != FORM_IDS.size():
		errors.append("进化发布证明必须精确覆盖两只进化宠")
		return
	for index in range(FORM_IDS.size()):
		var form := _dict((forms_value as Array)[index])
		var form_id := FORM_IDS[index]
		if str(form.get("formId", "")) != form_id:
			errors.append("进化发布证明形态顺序或ID无效：%s" % form_id)
			continue
		var pet_metadata_path := str(form.get("petMetadataPath", ""))
		var mounted_metadata_path := str(form.get("mountedMetadataPath", ""))
		_validate_visual_evidence(form_id, form.get("visualEvidence", []), errors)
		_validate_bundle_metadata(
			form_id,
			pet_metadata_path,
			mounted_metadata_path,
			attestation_sha256,
			errors
		)


static func _validate_visual_evidence(form_id: String, value, errors: Array[String]) -> void:
	if not (value is Array) or (value as Array).size() != VISUAL_SCOPES.size():
		errors.append("%s 必须绑定五项视觉批准" % form_id)
		return
	for index in range(VISUAL_SCOPES.size()):
		var reference := _dict((value as Array)[index])
		var scope := VISUAL_SCOPES[index]
		if str(reference.get("scope", "")) != scope:
			errors.append("%s 视觉批准范围顺序无效：%s" % [form_id, scope])
			continue
		var decision := _validated_json_reference(reference, "%s/%s" % [form_id, scope], errors)
		var decision_form_id := str(decision.get("formId", decision.get("mountFormId", "")))
		if (
			str(decision.get("scope", "")) != scope
			or str(decision.get("decision", "")) != "approved"
			or str(decision.get("ownerReviewStatus", "")) != "approved"
			or decision_form_id != form_id
		):
			errors.append("%s 的视觉批准文件范围或结论无效" % scope)
		if scope.begins_with("integrated_mounted_") and str(decision.get("characterId", "")) != "novice_hunter_v1":
			errors.append("%s 没有批准成年见习猎人整图组合" % scope)
		if scope == "evolution_visual_only":
			if decision.get("routeRuntimeEnabled", null) != false:
				errors.append("%s 必须保持历史 visual-only 范围" % scope)
		elif decision.get("runtimeEnabled", null) != false:
			errors.append("%s 必须保持历史 visual-only 范围" % scope)


static func _validate_bundle_metadata(
	form_id: String,
	pet_metadata_repo_path: String,
	mounted_metadata_repo_path: String,
	attestation_sha256: String,
	errors: Array[String]
) -> void:
	var pet_metadata := _read_repo_json(pet_metadata_repo_path, "%s 独立宠物元数据" % form_id, errors)
	var mounted_metadata := _read_repo_json(mounted_metadata_repo_path, "%s 骑乘元数据" % form_id, errors)
	var expected_reference := {
		"path": REPO_DATA_PATH,
		"sha256": attestation_sha256,
	}
	var pet_world := _dict(pet_metadata.get("worldVisual", {}))
	var pet_battle := _dict(pet_metadata.get("battleVisual", {}))
	var evolution := _dict(pet_metadata.get("evolutionVisual", {}))
	if (
		str(pet_metadata.get("formId", "")) != form_id
		or str(pet_metadata.get("artStatus", "")) != "approved"
		or str(pet_metadata.get("ownerReviewStatus", "")) != "approved"
		or pet_metadata.get("runtimeEnabled", null) != true
		or _dict(pet_metadata.get("releaseAttestation", {})) != expected_reference
		or pet_world.get("runtimeEnabled", null) != true
		or pet_battle.get("runtimeEnabled", null) != true
		or str(evolution.get("status", "")) != "approved"
		or str(evolution.get("ownerReview", "")) != "approved"
		or evolution.get("runtimeEnabled", null) != true
	):
		errors.append("%s 独立宠物整包未完整开放" % form_id)
	var mounted_world := _dict(mounted_metadata.get("worldVisual", {}))
	var mounted_battle := _dict(mounted_metadata.get("battleVisual", {}))
	if (
		str(mounted_metadata.get("mountFormId", "")) != form_id
		or str(mounted_metadata.get("characterId", "")) != "novice_hunter_v1"
		or str(mounted_metadata.get("artStatus", "")) != "approved"
		or str(mounted_metadata.get("ownerReviewStatus", "")) != "approved"
		or mounted_metadata.get("runtimeEnabled", null) != true
		or _dict(mounted_metadata.get("releaseAttestation", {})) != expected_reference
		or mounted_world.get("runtimeEnabled", null) != true
		or mounted_battle.get("runtimeEnabled", null) != true
	):
		errors.append("%s 人骑宠整包未完整开放" % form_id)


static func _validate_validation_evidence(errors: Array[String]) -> void:
	var value = _document.get("validationEvidence", [])
	if not (value is Array) or (value as Array).size() != VALIDATION_KINDS.size():
		errors.append("进化发布证明缺少技术验收证据")
		return
	for index in range(VALIDATION_KINDS.size()):
		var evidence := _dict((value as Array)[index])
		if (
			str(evidence.get("kind", "")) != VALIDATION_KINDS[index]
			or str(evidence.get("status", "")) != "passed"
			or not _is_sha256(str(evidence.get("sha256", "")))
		):
			errors.append("进化发布技术证据无效：%s" % VALIDATION_KINDS[index])


static func _validate_expected_lifecycle(value: Dictionary, errors: Array[String]) -> void:
	if (
		str(value.get("artStatus", "")) != "approved"
		or str(value.get("ownerReviewStatus", "")) != "approved"
		or value.get("runtimeEnabled", null) != true
		or value.get("petWorldRuntimeEnabled", null) != true
		or value.get("petBattleRuntimeEnabled", null) != true
		or value.get("evolutionVisualRuntimeEnabled", null) != true
		or value.get("mountedWorldRuntimeEnabled", null) != true
		or value.get("mountedBattleRuntimeEnabled", null) != true
	):
		errors.append("进化发布证明的整包运行生命周期不完整")


static func _validated_json_reference(
	reference: Dictionary,
	label: String,
	errors: Array[String]
) -> Dictionary:
	var repo_path := str(reference.get("path", "")).strip_edges().replace("\\", "/")
	var expected_sha := str(reference.get("sha256", "")).strip_edges().to_lower()
	if not _is_sha256(expected_sha):
		errors.append("%s SHA-256无效" % label)
		return {}
	var resource_path := _resource_path(repo_path)
	if resource_path == "" or not FileAccess.file_exists(resource_path):
		errors.append("%s 路径缺失或不安全" % label)
		return {}
	var content := FileAccess.get_file_as_string(resource_path)
	if content.sha256_text() != expected_sha:
		errors.append("%s SHA-256漂移" % label)
		return {}
	var parsed = JSON.parse_string(content)
	if not (parsed is Dictionary):
		errors.append("%s 不是JSON对象" % label)
		return {}
	return parsed as Dictionary


static func _read_repo_json(repo_path: String, label: String, errors: Array[String]) -> Dictionary:
	var resource_path := _resource_path(repo_path)
	if resource_path == "" or not FileAccess.file_exists(resource_path):
		errors.append("%s 路径缺失或不安全" % label)
		return {}
	var parsed = JSON.parse_string(FileAccess.get_file_as_string(resource_path))
	if not (parsed is Dictionary):
		errors.append("%s 不是JSON对象" % label)
		return {}
	return parsed as Dictionary


static func _ensure_loaded() -> void:
	if _loaded:
		return
	_loaded = true
	if not FileAccess.file_exists(DATA_PATH):
		_load_error = "缺少进化发布证明：%s" % DATA_PATH
		return
	var parsed = JSON.parse_string(FileAccess.get_file_as_string(DATA_PATH))
	if not (parsed is Dictionary):
		_load_error = "进化发布证明不是JSON对象"
		return
	_document = parsed as Dictionary


static func _resource_path(repo_path: String) -> String:
	var normalized := repo_path.strip_edges().replace("\\", "/")
	var prefix := "client/godot/"
	if normalized.begins_with(prefix) and normalized.find("..") < 0:
		return "res://%s" % normalized.substr(prefix.length())
	return ""


static func _is_sha256(value: String) -> bool:
	var normalized := value.strip_edges().to_lower()
	if normalized.length() != 64:
		return false
	for index in range(normalized.length()):
		var code := normalized.unicode_at(index)
		if not (
			(code >= "0".unicode_at(0) and code <= "9".unicode_at(0))
			or (code >= "a".unicode_at(0) and code <= "f".unicode_at(0))
		):
			return false
	return true


static func _string_array(value) -> Array[String]:
	var result: Array[String] = []
	if value is Array:
		for item in value as Array:
			result.append(str(item))
	return result


static func _dict(value) -> Dictionary:
	return value as Dictionary if value is Dictionary else {}
