extends RefCounted

const WorldVisualDirectionContract := preload("res://scripts/world/world_visual_direction_contract.gd")
const NpcArtReleaseEvidence := preload("res://scripts/world/npc_art_release_evidence.gd")

const DATA_PATH := "res://data/npc_appearances.json"
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
const PORTRAIT_NEUTRAL := "neutral"
const PORTRAIT_SPEAKING := "speaking"
const PORTRAIT_SMILE := "smile"
const PORTRAIT_CONCERNED := "concerned"
const PORTRAIT_STATES: Array[String] = [
	PORTRAIT_NEUTRAL,
	PORTRAIT_SPEAKING,
	PORTRAIT_SMILE,
	PORTRAIT_CONCERNED,
]
const WORLD_ACTION_IDLE := "idle"
const WORLD_ACTION_WALK := "walk"
const STATIC_MOBILITY := "static"
const MOBILE_MOBILITY := "mobile"
const MOBILITY_VALUES: Array[String] = [STATIC_MOBILITY, MOBILE_MOBILITY]
const NORMAL_RUNTIME_STRICT_RELEASE_EVIDENCE := false
const RELEASE_ATTESTATION_TYPE := "beastbound_npc_runtime_release_attestation"
# Eight already-approved bundles are frozen as v1 and historically bind the
# full decoded RGBA hash in both source-set pixel columns.  V2 keeps that chain
# readable while requiring the distinct Godot-canonical RGBA hash explicitly.
const RELEASE_ATTESTATION_SCHEMA_VERSION_V1 := 1
const RELEASE_ATTESTATION_SCHEMA_VERSION_V2 := 2
# V1 is a read-only compatibility window for the exact eight attestations that
# were owner-approved before canonical RGBA became a distinct source-set field.
# A new attestation, including a replacement for one of these appearances,
# must use V2 instead of inheriting the legacy full/full calculation.
const LEGACY_RELEASE_ATTESTATION_V1_SHA256_BY_APPEARANCE: Dictionary = {
	"npc_stable_keeper_m_v1": "946bd3415e1f55079271724e4af3092983468a50b19b797ea10a561ed67befec",
	"npc_bank_keeper_f_v1": "78e16394045acdb095588611d40a2a82abaa3815ce7f25c70c87b651fdec4702",
	"npc_item_shopkeeper_f_v1": "b85f53b15b633ab1f63d610df8c51455f9dd5972fdf7ce2d40b3951d8ee0e9c0",
	"npc_manor_steward_m_v1": "3f2fa07f810df06d3c95ca95eb1dbef2caaf1428bf739dc7874dcd5855abd072",
	"npc_village_guard_m_v1": "e7e8f70d4ba30a709582a719d230733e00c230003a314e2b2fe973d9236bf268",
	"npc_village_healer_f_v1": "bd55ff3c0a9d6594a4e87c72e7501a9fe8e7c63665e021c6fb235b06bf3c148c",
	"npc_equipment_artisan_m_v1": "e49715dcf59c0af1668b6f0a2f801ddfade55b7c42424fd9ff79b8b2ad0cc934",
	"npc_riding_trainer_f_v1": "a3bd73dac4faaeb3be823811b366767fb6d2d62e9820e17978244c11c97384ff",
}
const OWNER_RELEASE_DECISION_TYPE := "beastbound_npc_owner_release_decision"
const STRICT_EVIDENCE_HASH_KEYS: Array[String] = [
	"sourceSetSha256",
	"runtimeEvidenceIndexSha256",
	"blindStageAResultSha256",
	"blindStageBObservationSha256",
	"blindAuditSha256",
	"blindReviewPacketSha256",
	"blindProducerMappingSha256",
	"runtimeVideoSha256",
]
const STRICT_EVIDENCE_ARRAY_KEYS: Array[String] = [
	"mainCaptureReportSha256s",
	"runtimeScreenshotSha256s",
]

static var _loaded: bool = false
static var _catalog: Dictionary = {}
static var _appearances_by_id: Dictionary = {}
static var _load_error: String = ""
static var _texture_cache: Dictionary = {}
static var _world_ready: Dictionary = {}
static var _portrait_ready: Dictionary = {}
static var _warm_errors: Dictionary = {}
static var _qa_preview_appearances: Dictionary = {}


static func initialize() -> bool:
	_ensure_loaded()
	var errors := _top_level_validation_errors()
	if _load_error != "":
		return false
	# Normal startup validates catalog structure only. Production metadata,
	# source ledgers, decoded pixels and external evidence belong to explicit QA.
	for record in all_appearance_records():
		_append_record_errors(record, errors, false, false)
	return errors.is_empty()


static func all_appearance_records() -> Array[Dictionary]:
	_ensure_loaded()
	var records: Array[Dictionary] = []
	for value in _catalog.get("appearances", []):
		if value is Dictionary:
			records.append((value as Dictionary).duplicate(true))
	return records


static func runtime_appearance_records() -> Array[Dictionary]:
	var records: Array[Dictionary] = []
	for record in all_appearance_records():
		if _record_has_release_access(record):
			records.append(record)
	return records


static func appearance_record(appearance_id: String) -> Dictionary:
	_ensure_loaded()
	var canonical_id := appearance_id if _is_valid_appearance_id(appearance_id) else ""
	var record = _appearances_by_id.get(canonical_id, {})
	return (record as Dictionary).duplicate(true) if record is Dictionary else {}


static func appearance_id_for_instance(instance: Dictionary) -> String:
	var appearance_id_value = instance.get("appearanceId")
	if not (appearance_id_value is String):
		return ""
	var appearance_id := appearance_id_value as String
	return appearance_id if _is_valid_appearance_id(appearance_id) else ""


static func facing_for_instance(instance: Dictionary) -> String:
	var facing_value = instance.get("facing")
	if not (facing_value is String):
		return ""
	var facing := facing_value as String
	return facing if WorldVisualDirectionContract.DIRECTIONS.has(facing) else ""


static func instance_has_valid_facing(instance: Dictionary) -> bool:
	return facing_for_instance(instance) != ""


static func warm_all_runtime() -> bool:
	_ensure_loaded()
	var top_level_errors := _top_level_validation_errors()
	if not top_level_errors.is_empty():
		_warm_errors["__catalog__"] = top_level_errors
		return false
	var ok := true
	for record in runtime_appearance_records():
		ok = warm_appearance(str(record.get("appearanceId", ""))) and ok
	return ok


static func warm_appearance(appearance_id: String) -> bool:
	_ensure_loaded()
	var normalized := appearance_id if _is_valid_appearance_id(appearance_id) else ""
	if normalized == "":
		return false
	var top_level_errors := _top_level_validation_errors()
	if not top_level_errors.is_empty():
		_warm_errors[normalized] = top_level_errors
		return false
	if bool(_world_ready.get(normalized, false)) and bool(_portrait_ready.get(normalized, false)):
		return true
	var record := _appearance_record_without_loading(normalized)
	if record.is_empty() or not _record_access_allowed(record):
		_world_ready[normalized] = false
		_portrait_ready[normalized] = false
		_warm_errors[normalized] = ["NPC 外观未获运行权限：%s" % normalized]
		return false
	var errors: Array[String] = []
	# Startup/runtime warming validates the in-catalog frozen contract and fills
	# the bounded Texture2D cache only. It must never traverse absolute review
	# archives, decode images for pixel audits, or spawn media probes. Strict
	# evidence is an explicit promotion/QA operation only.
	_append_record_errors(record, errors, false, NORMAL_RUNTIME_STRICT_RELEASE_EVIDENCE)
	if _record_has_release_access(record):
		_append_runtime_release_attestation_errors(record, errors)
	_append_runtime_texture_warm_errors(record, errors)
	_warm_errors[normalized] = errors.duplicate()
	var ready := errors.is_empty()
	_world_ready[normalized] = ready
	_portrait_ready[normalized] = ready
	return ready


static func enable_qa_preview_appearance(appearance_id: String) -> bool:
	var normalized := appearance_id if _is_valid_appearance_id(appearance_id) else ""
	if not OS.is_debug_build() or normalized == "":
		return false
	_ensure_loaded()
	var record := _appearance_record_without_loading(normalized)
	if record.is_empty() or str(record.get("status", "")) == STATUS_PLANNED:
		return false
	_qa_preview_appearances[normalized] = true
	_world_ready.erase(normalized)
	_portrait_ready.erase(normalized)
	return warm_appearance(normalized)


static func disable_qa_preview_appearance(appearance_id: String) -> void:
	var normalized := appearance_id if _is_valid_appearance_id(appearance_id) else ""
	if normalized == "":
		return
	_qa_preview_appearances.erase(normalized)
	if not _record_has_release_access(_appearance_record_without_loading(normalized)):
		_world_ready.erase(normalized)
		_portrait_ready.erase(normalized)


static func is_qa_preview_enabled(appearance_id: String) -> bool:
	var canonical_id := appearance_id if _is_valid_appearance_id(appearance_id) else ""
	return (
		OS.is_debug_build()
		and canonical_id != ""
		and bool(_qa_preview_appearances.get(canonical_id, false))
	)


static func is_world_ready(appearance_id: String) -> bool:
	var normalized := appearance_id if _is_valid_appearance_id(appearance_id) else ""
	return (
		_loaded
		and bool(_world_ready.get(normalized, false))
		and _record_access_allowed(_appearance_record_without_loading(normalized))
	)


static func is_portrait_ready(appearance_id: String) -> bool:
	var normalized := appearance_id if _is_valid_appearance_id(appearance_id) else ""
	return (
		_loaded
		and bool(_portrait_ready.get(normalized, false))
		and _record_access_allowed(_appearance_record_without_loading(normalized))
	)


static func warm_errors_for(appearance_id: String) -> Array[String]:
	var errors: Array[String] = []
	var canonical_id := appearance_id if _is_valid_appearance_id(appearance_id) else ""
	for value in _warm_errors.get(canonical_id, []):
		errors.append(str(value))
	return errors


static func cached_texture_count() -> int:
	return _texture_cache.size()


static func has_world_action(appearance_id: String, action: String) -> bool:
	var canonical_id := appearance_id if _is_valid_appearance_id(appearance_id) else ""
	var record := _appearance_record_without_loading(canonical_id)
	if record.is_empty():
		return false
	var actions := _world_actions(record)
	return actions.has(action.strip_edges().to_lower())


static func world_frame_count(appearance_id: String, action: String) -> int:
	var canonical_id := appearance_id if _is_valid_appearance_id(appearance_id) else ""
	var record := _appearance_record_without_loading(canonical_id)
	if record.is_empty():
		return 0
	var normalized_action := _available_world_action(record, action)
	var spec_value = _world_actions(record).get(normalized_action, {})
	return maxi(1, int((spec_value as Dictionary).get("frameCount", 1))) if spec_value is Dictionary else 1


static func world_action_fps(appearance_id: String, action: String) -> float:
	var canonical_id := appearance_id if _is_valid_appearance_id(appearance_id) else ""
	var record := _appearance_record_without_loading(canonical_id)
	if record.is_empty():
		return 1.0
	var normalized_action := _available_world_action(record, action)
	var spec_value = _world_actions(record).get(normalized_action, {})
	return maxf(0.01, float((spec_value as Dictionary).get("fps", 1.0))) if spec_value is Dictionary else 1.0


static func world_frame_index_for_elapsed(appearance_id: String, action: String, elapsed_seconds: float) -> int:
	var count := world_frame_count(appearance_id, action)
	if count <= 0:
		return 0
	return int(floor(maxf(0.0, elapsed_seconds) * world_action_fps(appearance_id, action))) % count


static func world_texture_for_elapsed(
	appearance_id: String,
	direction: String,
	action: String,
	elapsed_seconds: float
) -> Texture2D:
	var frame_index := world_frame_index_for_elapsed(appearance_id, action, elapsed_seconds)
	return world_texture_for_frame(appearance_id, direction, action, frame_index + 1)


static func world_texture_for_frame(
	appearance_id: String,
	direction: String,
	action: String,
	frame_index: int
) -> Texture2D:
	var normalized_id := appearance_id if _is_valid_appearance_id(appearance_id) else ""
	if not is_world_ready(normalized_id) or not WorldVisualDirectionContract.DIRECTIONS.has(direction):
		return null
	var record := _appearance_record_without_loading(normalized_id)
	var normalized_action := _available_world_action(record, action)
	var count := world_frame_count(normalized_id, normalized_action)
	var path := _world_frame_resource_path(
		record,
		direction,
		normalized_action,
		clampi(frame_index, 1, maxi(1, count))
	)
	var cached = _texture_cache.get(path)
	return cached as Texture2D if cached is Texture2D else null


static func world_texture_for_instance(
	instance: Dictionary,
	action: String = WORLD_ACTION_IDLE,
	elapsed_seconds: float = 0.0
) -> Texture2D:
	if not instance_has_valid_facing(instance):
		return null
	return world_texture_for_elapsed(
		appearance_id_for_instance(instance),
		facing_for_instance(instance),
		action,
		elapsed_seconds
	)


static func world_presentation_scale(appearance_id: String) -> float:
	var canonical_id := appearance_id if _is_valid_appearance_id(appearance_id) else ""
	var record := _appearance_record_without_loading(canonical_id)
	var world_value = record.get("world", {})
	if not (world_value is Dictionary):
		return 1.0
	return maxf(0.01, float((world_value as Dictionary).get("presentationScale", 1.0)))


static func world_anchor_offset(appearance_id: String) -> Vector2:
	var canonical_id := appearance_id if _is_valid_appearance_id(appearance_id) else ""
	var record := _appearance_record_without_loading(canonical_id)
	var world_value = record.get("world", {})
	if not (world_value is Dictionary):
		return Vector2.ZERO
	var offset_value = (world_value as Dictionary).get("anchorOffset", [0, 0])
	if not (offset_value is Array) or (offset_value as Array).size() != 2:
		return Vector2.ZERO
	var offset := offset_value as Array
	return Vector2(float(offset[0]), float(offset[1]))


static func world_draw_rect_for_instance(instance: Dictionary, marker: Vector2, texture: Texture2D) -> Rect2:
	if texture == null:
		return Rect2()
	var appearance_id := appearance_id_for_instance(instance)
	var scale := world_presentation_scale(appearance_id)
	var draw_size := texture.get_size() * scale
	var ground_anchor := marker + world_anchor_offset(appearance_id)
	return Rect2(ground_anchor - Vector2(draw_size.x * 0.5, draw_size.y), draw_size)


static func world_view_for_direction(direction: String) -> String:
	return direction if WorldVisualDirectionContract.DIRECTIONS.has(direction) else ""


static func world_flip_h_for_direction(_direction: String) -> bool:
	return false


static func portrait_texture(appearance_id: String, state: String = PORTRAIT_NEUTRAL) -> Texture2D:
	var normalized_id := appearance_id if _is_valid_appearance_id(appearance_id) else ""
	if not is_portrait_ready(normalized_id):
		return null
	var record := _appearance_record_without_loading(normalized_id)
	var normalized_state := normalize_portrait_state(state)
	var path := _portrait_resource_path(record, normalized_state)
	var cached = _texture_cache.get(path)
	if cached is Texture2D:
		return cached as Texture2D
	if normalized_state != PORTRAIT_NEUTRAL:
		var fallback = _texture_cache.get(_portrait_resource_path(record, PORTRAIT_NEUTRAL))
		if fallback is Texture2D:
			return fallback as Texture2D
	return null


static func portrait_texture_for_instance(instance: Dictionary, state: String = PORTRAIT_NEUTRAL) -> Texture2D:
	return portrait_texture(appearance_id_for_instance(instance), state)


static func normalize_portrait_state(state: String) -> String:
	var normalized := state.strip_edges().to_lower()
	return normalized if PORTRAIT_STATES.has(normalized) else PORTRAIT_NEUTRAL


static func validation_errors(
	strict_source_parity: bool = false,
	inspect_candidate_assets: bool = false
) -> Array[String]:
	_ensure_loaded()
	var errors := _top_level_validation_errors()
	if _load_error != "":
		return errors
	for record in all_appearance_records():
		var appearance_id := str(record.get("appearanceId", "")).strip_edges()
		if appearance_id == "":
			continue
		var inspect_assets := (
			inspect_candidate_assets
			or _record_has_release_access(record)
			or is_qa_preview_enabled(appearance_id)
		)
		_append_record_errors(record, errors, inspect_assets, strict_source_parity)
	return errors


static func validation_errors_for_appearance(
	appearance_id: String,
	strict_source_parity: bool = false,
	inspect_assets: bool = true
) -> Array[String]:
	_ensure_loaded()
	var errors := _top_level_validation_errors()
	if not errors.is_empty():
		return errors
	var normalized := appearance_id if _is_valid_appearance_id(appearance_id) else ""
	var record := _appearance_record_without_loading(normalized)
	if record.is_empty():
		errors.append("NPC 美术目录不存在 appearanceId：%s" % normalized)
		return errors
	_append_record_errors(record, errors, inspect_assets, strict_source_parity)
	return errors


static func strict_release_evidence_errors_for_appearance(appearance_id: String) -> Array[String]:
	_ensure_loaded()
	var errors := _top_level_validation_errors()
	if not errors.is_empty():
		return errors
	var normalized := appearance_id if _is_valid_appearance_id(appearance_id) else ""
	var record := _appearance_record_without_loading(normalized)
	if record.is_empty():
		errors.append("NPC 美术目录不存在 appearanceId：%s" % normalized)
		return errors
	_append_record_errors(record, errors, true, true)
	return errors


static func normal_runtime_uses_strict_release_evidence() -> bool:
	return NORMAL_RUNTIME_STRICT_RELEASE_EVIDENCE


static func source_import_pixel_contract_errors(
	source_image: Image,
	loaded_image: Image
) -> Array[String]:
	var errors: Array[String] = []
	_append_source_loaded_pixel_contract_errors(
		source_image,
		loaded_image,
		"NPC source/import fixture",
		"fixture.png",
		errors
	)
	return errors


static func runtime_release_attestation_document_errors(
	record: Dictionary,
	attestation: Dictionary,
	actual_attestation_sha256: String,
	current_file_sha256_by_installed_path: Dictionary,
	owner_decision: Dictionary,
	actual_owner_decision_sha256: String
) -> Array[String]:
	var errors: Array[String] = []
	var appearance_id := str(record.get("appearanceId", ""))
	var expected_attestation_path := "client/godot/assets/npcs/%s/release-attestation.json" % appearance_id
	var catalog_attestation_path := str(record.get("releaseAttestationPath", ""))
	var catalog_attestation_sha := str(record.get("releaseAttestationSha256", ""))
	if not _record_has_release_access(record):
		errors.append("NPC catalog 状态未获完整 owner/release/runtime 批准：%s" % appearance_id)
	if catalog_attestation_path != expected_attestation_path or not _is_safe_repo_relative_path(catalog_attestation_path):
		errors.append("approved NPC catalog 未冻结 release attestation 路径：%s" % appearance_id)
	if (
		not _is_sha256(catalog_attestation_sha)
		or actual_attestation_sha256 != catalog_attestation_sha
	):
		errors.append("approved NPC release attestation 与 catalog SHA-256 不一致：%s" % appearance_id)

	var owner_approved_at := str(attestation.get("ownerApprovedAtUtc", ""))
	var attestation_schema_version := (
		int(attestation.get("schemaVersion", 0))
		if _is_json_integer(attestation.get("schemaVersion"))
		else 0
	)
	var expected_owner_path := "client/godot/assets/npcs/%s/release-owner-decision.json" % appearance_id
	var owner_path := str(attestation.get("ownerDecisionRecord", ""))
	var expected_owner_sha := str(attestation.get("ownerDecisionRecordSha256", ""))
	if not _dictionary_has_exact_keys(attestation, [
		"schemaVersion", "attestationType", "status", "appearanceId",
		"ownerReviewStatus", "releaseApproved", "runtimeEnabled", "ownerApprovedAtUtc",
		"ownerDecisionRecord", "ownerDecisionRecordSha256", "sourceSetSha256",
		"strictEvidence", "frames",
	]):
		errors.append("approved NPC releaseAttestation 顶层字段集合无效：%s" % appearance_id)
	if (
		attestation_schema_version != RELEASE_ATTESTATION_SCHEMA_VERSION_V1
		and attestation_schema_version != RELEASE_ATTESTATION_SCHEMA_VERSION_V2
		or str(attestation.get("attestationType", "")) != RELEASE_ATTESTATION_TYPE
		or str(attestation.get("status", "")) != "passed"
		or str(attestation.get("appearanceId", "")) != appearance_id
		or str(attestation.get("ownerReviewStatus", "")) != "approved"
		or typeof(attestation.get("releaseApproved")) != TYPE_BOOL
		or not bool(attestation.get("releaseApproved", false))
		or typeof(attestation.get("runtimeEnabled")) != TYPE_BOOL
		or not bool(attestation.get("runtimeEnabled", false))
		or not _is_utc_timestamp(owner_approved_at)
	):
		errors.append("approved NPC releaseAttestation 状态/owner approval 无效：%s" % appearance_id)
	if attestation_schema_version == RELEASE_ATTESTATION_SCHEMA_VERSION_V1:
		var frozen_legacy_sha := str(
			LEGACY_RELEASE_ATTESTATION_V1_SHA256_BY_APPEARANCE.get(appearance_id, "")
		)
		if (
			not _is_sha256(frozen_legacy_sha)
			or catalog_attestation_sha != frozen_legacy_sha
			or actual_attestation_sha256 != frozen_legacy_sha
		):
			errors.append(
				"NPC releaseAttestation v1 仅允许精确冻结的旧批次证明；新批准必须使用 v2：%s"
				% appearance_id
			)
	if owner_path != expected_owner_path or not _is_safe_repo_relative_path(owner_path):
		errors.append("NPC releaseAttestation owner decision 路径未冻结：%s" % appearance_id)
	if (
		not _is_sha256(expected_owner_sha)
		or actual_owner_decision_sha256 != expected_owner_sha
	):
		errors.append("NPC releaseAttestation owner decision 缺失或 SHA-256 漂移：%s" % appearance_id)

	var strict_value = attestation.get("strictEvidence", {})
	if not (strict_value is Dictionary):
		errors.append("approved NPC releaseAttestation 缺少严格证据摘要：%s" % appearance_id)
		return errors
	var strict_evidence := strict_value as Dictionary
	if not _dictionary_has_exact_keys(
		strict_evidence,
		STRICT_EVIDENCE_HASH_KEYS + STRICT_EVIDENCE_ARRAY_KEYS
	):
		errors.append("NPC releaseAttestation 严格证据字段集合无效：%s" % appearance_id)
	for key in STRICT_EVIDENCE_HASH_KEYS:
		if not _is_sha256(str(strict_evidence.get(key, ""))):
			errors.append("NPC releaseAttestation 严格证据摘要 hash 无效：%s/%s" % [appearance_id, key])
	for array_key in STRICT_EVIDENCE_ARRAY_KEYS:
		var hashes_value = strict_evidence.get(array_key, [])
		if not (hashes_value is Array) or (hashes_value as Array).is_empty():
			errors.append("NPC releaseAttestation 严格证据数组摘要为空：%s/%s" % [appearance_id, array_key])
			continue
		var seen_hashes: Dictionary = {}
		for hash_value in hashes_value as Array:
			var hash_text := str(hash_value)
			if not _is_sha256(hash_text) or seen_hashes.has(hash_text):
				errors.append("NPC releaseAttestation 严格证据数组含无效或重复 hash：%s/%s" % [appearance_id, array_key])
			seen_hashes[hash_text] = true

	var expected_frames := _expected_installation_frames(record)
	var frames_value = attestation.get("frames", [])
	if not (frames_value is Array) or (frames_value as Array).size() != expected_frames.size():
		errors.append("NPC releaseAttestation 必须覆盖当前完整运行矩阵：%s" % appearance_id)
		return errors
	var frames_by_source_path: Dictionary = {}
	var seen_installed_paths: Dictionary = {}
	for frame_value in frames_value as Array:
		if not (frame_value is Dictionary):
			errors.append("NPC releaseAttestation.frames 存在非对象项：%s" % appearance_id)
			continue
		var frame := frame_value as Dictionary
		var installed_path := str(frame.get("installedPath", ""))
		var source_runtime_path := str(frame.get("sourceRuntimePath", ""))
		var expected_value = expected_frames.get(installed_path, {})
		if not (expected_value is Dictionary) or seen_installed_paths.has(installed_path):
			errors.append("NPC releaseAttestation 安装帧未知或重复：%s/%s" % [appearance_id, installed_path])
			continue
		seen_installed_paths[installed_path] = true
		var expected := expected_value as Dictionary
		var file_sha := str(frame.get("fileSha256", ""))
		var rgba_sha := str(frame.get("rgbaSha256", ""))
		var source_decoded_rgba_sha := str(frame.get("sourceDecodedRgbaSha256", ""))
		if (
			attestation_schema_version == RELEASE_ATTESTATION_SCHEMA_VERSION_V2
			and not _is_sha256(source_decoded_rgba_sha)
		):
			errors.append("NPC releaseAttestation v2 帧缺少 canonical RGBA SHA-256：%s/%s" % [appearance_id, installed_path])
		if (
			str(frame.get("kind", "")) != str(expected.get("kind", ""))
			or str(frame.get("slot", "")) != str(expected.get("slot", ""))
			or source_runtime_path != str(expected.get("sourceRuntimePath", ""))
			or frames_by_source_path.has(source_runtime_path)
			or not _is_sha256(file_sha)
			or not _is_sha256(rgba_sha)
		):
			errors.append("NPC releaseAttestation 帧语义/hash 无效：%s/%s" % [appearance_id, installed_path])
			continue
		frames_by_source_path[source_runtime_path] = frame
		if str(current_file_sha256_by_installed_path.get(installed_path, "")) != file_sha:
			errors.append("NPC releaseAttestation 当前运行文件 SHA-256 漂移：%s/%s" % [appearance_id, installed_path])
	if seen_installed_paths.size() != expected_frames.size():
		errors.append("NPC releaseAttestation 漏登记运行帧：%s" % appearance_id)

	var source_set_sha := _release_attestation_source_set_sha256(
		appearance_id,
		frames_by_source_path,
		attestation_schema_version
	)
	if (
		not _is_sha256(str(attestation.get("sourceSetSha256", "")))
		or str(attestation.get("sourceSetSha256", "")) != source_set_sha
		or str(strict_evidence.get("sourceSetSha256", "")) != source_set_sha
	):
		errors.append("NPC releaseAttestation sourceSet 未绑定当前文件矩阵：%s" % appearance_id)

	var accepted_evidence_value = owner_decision.get("acceptedEvidence", {})
	var accepted_evidence_matches := accepted_evidence_value is Dictionary
	if accepted_evidence_matches:
		var accepted_evidence := accepted_evidence_value as Dictionary
		accepted_evidence_matches = _dictionary_has_exact_keys(
			accepted_evidence,
			STRICT_EVIDENCE_HASH_KEYS + STRICT_EVIDENCE_ARRAY_KEYS
		)
		for key in STRICT_EVIDENCE_HASH_KEYS:
			accepted_evidence_matches = (
				accepted_evidence_matches
				and str(accepted_evidence.get(key, "")) == str(strict_evidence.get(key, ""))
			)
		for key in STRICT_EVIDENCE_ARRAY_KEYS:
			accepted_evidence_matches = (
				accepted_evidence_matches
				and _string_array(accepted_evidence.get(key, [])) == _string_array(strict_evidence.get(key, []))
			)
	if (
		not _dictionary_has_exact_keys(owner_decision, [
			"schemaVersion", "decisionType", "appearanceId", "decision", "ownerReviewStatus",
			"ownerId", "releaseApproved", "runtimeEnabled", "approvedAtUtc",
			"sourceSetSha256", "runtimeEvidenceIndexSha256", "acceptedEvidence",
		])
		or not _is_json_integer(owner_decision.get("schemaVersion"))
		or int(owner_decision.get("schemaVersion", 0)) != 1
		or str(owner_decision.get("decisionType", "")) != OWNER_RELEASE_DECISION_TYPE
		or str(owner_decision.get("appearanceId", "")) != appearance_id
		or str(owner_decision.get("decision", "")) != "approved"
		or str(owner_decision.get("ownerReviewStatus", "")) != "approved"
		or str(owner_decision.get("ownerId", "")).strip_edges() == ""
		or typeof(owner_decision.get("releaseApproved")) != TYPE_BOOL
		or not bool(owner_decision.get("releaseApproved", false))
		or typeof(owner_decision.get("runtimeEnabled")) != TYPE_BOOL
		or not bool(owner_decision.get("runtimeEnabled", false))
		or str(owner_decision.get("approvedAtUtc", "")) != owner_approved_at
		or str(owner_decision.get("sourceSetSha256", "")) != source_set_sha
		or str(owner_decision.get("runtimeEvidenceIndexSha256", "")) != str(strict_evidence.get("runtimeEvidenceIndexSha256", ""))
		or not accepted_evidence_matches
	):
		errors.append("NPC owner release decision 内容未绑定当前批准证据：%s" % appearance_id)
	return errors


static func release_evidence_source_set_schema_version(
	record: Dictionary,
	actual_attestation_sha256: String
) -> int:
	var appearance_id := str(record.get("appearanceId", ""))
	var frozen_legacy_sha := str(
		LEGACY_RELEASE_ATTESTATION_V1_SHA256_BY_APPEARANCE.get(appearance_id, "")
	)
	if (
		_record_has_release_access(record)
		and _is_sha256(frozen_legacy_sha)
		and str(record.get("releaseAttestationSha256", "")) == frozen_legacy_sha
		and actual_attestation_sha256 == frozen_legacy_sha
	):
		return RELEASE_ATTESTATION_SCHEMA_VERSION_V1
	return RELEASE_ATTESTATION_SCHEMA_VERSION_V2


static func release_attestation_frozen_source_set_errors(
	appearance_id: String,
	attestation: Dictionary,
	frozen_runtime_source_set_sha256: String
) -> Array[String]:
	var errors: Array[String] = []
	var schema_version := (
		int(attestation.get("schemaVersion", 0))
		if _is_json_integer(attestation.get("schemaVersion"))
		else 0
	)
	if schema_version != RELEASE_ATTESTATION_SCHEMA_VERSION_V2:
		return errors
	var strict_value = attestation.get("strictEvidence", {})
	var strict_evidence := strict_value as Dictionary if strict_value is Dictionary else {}
	if (
		not _is_sha256(frozen_runtime_source_set_sha256)
		or str(attestation.get("sourceSetSha256", "")) != frozen_runtime_source_set_sha256
		or str(strict_evidence.get("sourceSetSha256", "")) != frozen_runtime_source_set_sha256
	):
		errors.append(
			"NPC releaseAttestation v2 sourceSet 未绑定 frozen runtime evidence：%s"
			% appearance_id
		)
	return errors


static func _top_level_validation_errors() -> Array[String]:
	var errors: Array[String] = []
	if _load_error != "":
		errors.append(_load_error)
		return errors
	if not _is_json_integer(_catalog.get("schemaVersion")) or int(_catalog.get("schemaVersion", 0)) != 1:
		errors.append("NPC 美术目录 schemaVersion 必须为整数 1")
	if _string_array(_catalog.get("canonicalDirections", [])) != WorldVisualDirectionContract.DIRECTIONS:
		errors.append("NPC 美术目录方向必须与真八向 canonical 完全一致")
	if _string_array(_catalog.get("portraitStates", [])) != PORTRAIT_STATES:
		errors.append("NPC 人像状态必须依次为 neutral/speaking/smile/concerned")
	if not _is_integer_pair(_catalog.get("worldFrameSize", [])) or _int_pair(_catalog.get("worldFrameSize", [])) != Vector2i(256, 256):
		errors.append("NPC 世界帧统一尺寸必须为 256x256")
	if not _is_integer_pair(_catalog.get("portraitFrameSize", [])) or _int_pair(_catalog.get("portraitFrameSize", [])) != Vector2i(512, 512):
		errors.append("NPC 人像统一尺寸必须为 512x512")
	var appearances_value = _catalog.get("appearances", [])
	if not (appearances_value is Array) or (appearances_value as Array).is_empty():
		errors.append("NPC 美术目录至少需要一个职业外观")
		return errors
	var seen_ids: Dictionary = {}
	for index in range((appearances_value as Array).size()):
		var value = (appearances_value as Array)[index]
		if not (value is Dictionary):
			errors.append("NPC 美术目录 appearances[%d] 必须为对象" % index)
			continue
		var appearance_id_value = (value as Dictionary).get("appearanceId")
		if not (appearance_id_value is String) or not _is_valid_appearance_id(appearance_id_value as String):
			errors.append("NPC 美术目录 appearances[%d] 的 appearanceId 必须为 canonical 版本化 ID" % index)
			continue
		var appearance_id := appearance_id_value as String
		if appearance_id == "":
			errors.append("NPC 美术目录 appearances[%d] 缺少 appearanceId" % index)
		elif seen_ids.has(appearance_id):
			errors.append("NPC 美术目录重复 appearanceId：%s" % appearance_id)
		else:
			seen_ids[appearance_id] = true
	return errors


static func _ensure_loaded() -> void:
	if _loaded:
		return
	_loaded = true
	if not FileAccess.file_exists(DATA_PATH):
		_load_error = "缺少 NPC 美术目录：%s" % DATA_PATH
		return
	var parsed = JSON.parse_string(FileAccess.get_file_as_string(DATA_PATH))
	if not (parsed is Dictionary):
		_load_error = "NPC 美术目录不是有效 JSON 对象：%s" % DATA_PATH
		return
	_catalog = parsed as Dictionary
	for value in _catalog.get("appearances", []):
		if not (value is Dictionary):
			continue
		var record := value as Dictionary
		var appearance_id_value = record.get("appearanceId")
		var appearance_id := appearance_id_value as String if appearance_id_value is String else ""
		if _is_valid_appearance_id(appearance_id) and not _appearances_by_id.has(appearance_id):
			_appearances_by_id[appearance_id] = record


static func _appearance_record_without_loading(appearance_id: String) -> Dictionary:
	if not _loaded:
		return {}
	var value = _appearances_by_id.get(appearance_id, {})
	return value as Dictionary if value is Dictionary else {}


static func _record_has_release_access(record: Dictionary) -> bool:
	return (
		not record.is_empty()
		and typeof(record.get("runtimeEnabled")) == TYPE_BOOL
		and bool(record.get("runtimeEnabled", false))
		and typeof(record.get("releaseApproved")) == TYPE_BOOL
		and bool(record.get("releaseApproved", false))
		and str(record.get("status", "")) == STATUS_APPROVED
		and str(record.get("ownerReviewStatus", "")) == "approved"
	)


static func _record_access_allowed(record: Dictionary) -> bool:
	if _record_has_release_access(record):
		return true
	return is_qa_preview_enabled(str(record.get("appearanceId", "")))


static func _append_record_errors(
	record: Dictionary,
	errors: Array[String],
	inspect_assets: bool,
	strict_source_parity: bool
) -> void:
	var appearance_id_value = record.get("appearanceId")
	var appearance_id := appearance_id_value as String if appearance_id_value is String else ""
	if not _is_valid_appearance_id(appearance_id):
		errors.append("NPC appearanceId 必须为 canonical 版本化 ID")
	for key in ["displayName", "roleId", "gender", "identityBrief"]:
		if str(record.get(key, "")).strip_edges() == "":
			errors.append("NPC 美术目录缺少 %s：%s" % [key, appearance_id])
	var status := str(record.get("status", ""))
	var owner_review_status := str(record.get("ownerReviewStatus", ""))
	if typeof(record.get("releaseApproved")) != TYPE_BOOL:
		errors.append("NPC releaseApproved 必须为布尔值：%s" % appearance_id)
	if typeof(record.get("runtimeEnabled")) != TYPE_BOOL:
		errors.append("NPC runtimeEnabled 必须为布尔值：%s" % appearance_id)
	var release_approved := bool(record.get("releaseApproved", false))
	var runtime_enabled := bool(record.get("runtimeEnabled", false))
	if not STATUSES.has(status):
		errors.append("NPC 美术状态无效：%s=%s" % [appearance_id, status])
	if [STATUS_PLANNED, STATUS_IN_PRODUCTION, STATUS_OWNER_REVIEW_PENDING].has(status):
		if release_approved or runtime_enabled:
			errors.append("未批准 NPC 只能通过显式 QA 候选路径访问：%s" % appearance_id)
	if status == STATUS_IN_PRODUCTION or status == STATUS_OWNER_REVIEW_PENDING:
		if owner_review_status != "pending":
			errors.append("制作中或待评审 NPC 必须保持 ownerReviewStatus=pending：%s" % appearance_id)
	if status == STATUS_APPROVED:
		if owner_review_status != "approved" or not release_approved or not runtime_enabled:
			errors.append("approved NPC 必须已获用户批准并启用运行资产：%s" % appearance_id)
		var attestation_path := str(record.get("releaseAttestationPath", ""))
		var expected_attestation_path := "client/godot/assets/npcs/%s/release-attestation.json" % appearance_id
		if attestation_path != expected_attestation_path or not _is_safe_repo_relative_path(attestation_path):
			errors.append("approved NPC releaseAttestationPath 必须位于职业外观根目录：%s" % appearance_id)
		if not _is_sha256(str(record.get("releaseAttestationSha256", ""))):
			errors.append("approved NPC releaseAttestationSha256 无效：%s" % appearance_id)
	elif release_approved:
		errors.append("未 approved 的 NPC 不得标记 releaseApproved：%s" % appearance_id)
	var mobility := str(record.get("mobility", ""))
	if not MOBILITY_VALUES.has(mobility):
		errors.append("NPC mobility 必须为 static 或 mobile：%s" % appearance_id)
	var asset_root := str(record.get("assetRoot", "")).strip_edges()
	var expected_root := "client/godot/assets/npcs/%s" % appearance_id
	if asset_root != expected_root or not _is_safe_repo_relative_path(asset_root):
		errors.append("NPC assetRoot 必须与 appearanceId 独立对应：%s" % appearance_id)
	var expected_contract_paths := {
		"metadataPath": "%s/action-bundle-meta.json" % expected_root,
		"ownershipPath": "%s/source-and-ownership.md" % expected_root,
	}
	for path_key in expected_contract_paths.keys():
		var repo_path := str(record.get(path_key, "")).strip_edges()
		if (
			repo_path != str(expected_contract_paths[path_key])
			or not _is_safe_repo_relative_path(repo_path)
		):
			errors.append("NPC %s 路径不属于职业外观根目录：%s" % [path_key, appearance_id])
		elif inspect_assets and not FileAccess.file_exists(_resource_path(repo_path)):
			errors.append("NPC 缺少生产合同文件：%s" % repo_path)
	if inspect_assets:
		_append_metadata_errors(record, errors, strict_source_parity)
		_append_ownership_errors(record, errors)
	_append_world_errors(record, errors, inspect_assets, strict_source_parity)
	_append_portrait_errors(record, errors, inspect_assets, strict_source_parity)


static func _append_metadata_errors(
	record: Dictionary,
	errors: Array[String],
	strict_external_evidence: bool
) -> void:
	var appearance_id := str(record.get("appearanceId", ""))
	var metadata_path := _resource_path(str(record.get("metadataPath", "")))
	var metadata := _read_json_dictionary(metadata_path, "NPC action-bundle-meta", errors)
	if metadata.is_empty():
		return
	if not _is_json_integer(metadata.get("schemaVersion")) or int(metadata.get("schemaVersion", 0)) != 1:
		errors.append("NPC action-bundle-meta schemaVersion 必须为整数 1：%s" % appearance_id)
	for key in ["appearanceId", "roleId", "mobility"]:
		if str(metadata.get(key, "")) != str(record.get(key, "")):
			errors.append("NPC action-bundle-meta.%s 与目录不一致：%s" % [key, appearance_id])
	if _string_array(metadata.get("directions", [])) != WorldVisualDirectionContract.DIRECTIONS:
		errors.append("NPC action-bundle-meta 必须登记 canonical 真八向：%s" % appearance_id)
	var meta_world_value = metadata.get("world", {})
	if not (meta_world_value is Dictionary):
		errors.append("NPC action-bundle-meta.world 不是对象：%s" % appearance_id)
	else:
		var meta_world := meta_world_value as Dictionary
		var expected_walk_frames := 4 if str(record.get("mobility", "")) == MOBILE_MOBILITY else 0
		if (
			not _is_integer_pair(meta_world.get("runtimeSize", []))
			or _int_pair(meta_world.get("runtimeSize", [])) != _int_pair(_catalog.get("worldFrameSize", []))
			or not _is_json_integer(meta_world.get("idleFrames"))
			or int(meta_world.get("idleFrames", 0)) != 1
			or not _is_json_integer(meta_world.get("walkFrames"))
			or int(meta_world.get("walkFrames", -1)) != expected_walk_frames
			or typeof(meta_world.get("runtimeMirroring")) != TYPE_BOOL
			or bool(meta_world.get("runtimeMirroring", true))
		):
			errors.append("NPC action-bundle-meta.world 帧矩阵或镜像合同无效：%s" % appearance_id)
	var meta_portraits_value = metadata.get("portraits", {})
	if not (meta_portraits_value is Dictionary):
		errors.append("NPC action-bundle-meta.portraits 不是对象：%s" % appearance_id)
	else:
		var meta_portraits := meta_portraits_value as Dictionary
		if (
			_string_array(meta_portraits.get("states", [])) != PORTRAIT_STATES
			or not _is_integer_pair(meta_portraits.get("runtimeSize", []))
			or _int_pair(meta_portraits.get("runtimeSize", [])) != _int_pair(_catalog.get("portraitFrameSize", []))
		):
			errors.append("NPC action-bundle-meta.portraits 与四表情合同不一致：%s" % appearance_id)
	var review_value = metadata.get("review", {})
	if not (review_value is Dictionary):
		errors.append("NPC action-bundle-meta.review 不是对象：%s" % appearance_id)
	else:
		var review := review_value as Dictionary
		if (
			str(review.get("artStatus", "")) != str(record.get("status", ""))
			or str(review.get("ownerReviewStatus", "")) != str(record.get("ownerReviewStatus", ""))
			or typeof(review.get("releaseApproved")) != TYPE_BOOL
			or bool(review.get("releaseApproved", false)) != bool(record.get("releaseApproved", false))
		):
			errors.append("NPC action-bundle-meta.review 与目录状态不一致：%s" % appearance_id)
		var status := str(record.get("status", ""))
		if strict_external_evidence or [STATUS_OWNER_REVIEW_PENDING, STATUS_APPROVED].has(status):
			var source_set_schema_version := RELEASE_ATTESTATION_SCHEMA_VERSION_V2
			if strict_external_evidence:
				var attestation_path := _resource_path(str(record.get("releaseAttestationPath", "")))
				var actual_attestation_sha := (
					FileAccess.get_sha256(attestation_path)
					if FileAccess.file_exists(attestation_path)
					else ""
				)
				source_set_schema_version = release_evidence_source_set_schema_version(
					record,
					actual_attestation_sha
				)
			_append_review_evidence_errors(
				appearance_id,
				review,
				metadata,
				errors,
				strict_external_evidence,
				source_set_schema_version
			)
	_append_installation_metadata_errors(record, metadata, errors, strict_external_evidence)
	if strict_external_evidence and _record_has_release_access(record):
		_append_release_attestation_strict_binding_errors(record, metadata, errors)


static func _append_review_evidence_errors(
	appearance_id: String,
	review: Dictionary,
	metadata: Dictionary,
	errors: Array[String],
	strict_external_evidence: bool,
	source_set_schema_version: int
) -> void:
	var installation_value = metadata.get("installation", {})
	if strict_external_evidence:
		NpcArtReleaseEvidence.append_strict_errors(
			appearance_id,
			review,
			installation_value as Dictionary if installation_value is Dictionary else {},
			errors,
			source_set_schema_version
		)
	_append_frozen_external_evidence_errors(
		str(review.get("blindAudit", "")),
		str(review.get("blindAuditSha256", "")),
		"NPC review.blindAudit",
		errors,
		strict_external_evidence
	)
	_append_frozen_external_evidence_errors(
		str(review.get("blindStageAResult", "")),
		str(review.get("blindStageAResultSha256", "")),
		"NPC review.blindStageAResult",
		errors,
		strict_external_evidence
	)
	_append_frozen_external_evidence_errors(
		str(review.get("blindStageBObservation", "")),
		str(review.get("blindStageBObservationSha256", "")),
		"NPC review.blindStageBObservation",
		errors,
		strict_external_evidence
	)
	_append_frozen_external_evidence_errors(
		str(review.get("runtimeVideo", "")),
		str(review.get("runtimeVideoSha256", "")),
		"NPC review.runtimeVideo",
		errors,
		strict_external_evidence
	)
	if strict_external_evidence:
		_append_runtime_video_errors(str(review.get("runtimeVideo", "")), errors)
	var screenshots_value = review.get("runtimeScreenshots", [])
	var screenshot_hashes_value = review.get("runtimeScreenshotSha256s", [])
	if not (screenshots_value is Array) or (screenshots_value as Array).is_empty():
		errors.append("NPC review.runtimeScreenshots 至少需要一张真实客户端截图：%s" % appearance_id)
	elif not (screenshot_hashes_value is Array) or (screenshot_hashes_value as Array).size() != (screenshots_value as Array).size():
		errors.append("NPC review.runtimeScreenshotSha256s 必须与截图逐项对应：%s" % appearance_id)
	else:
		for screenshot_index in range((screenshots_value as Array).size()):
			var screenshot_path := str((screenshots_value as Array)[screenshot_index])
			_append_frozen_external_evidence_errors(
				screenshot_path,
				str((screenshot_hashes_value as Array)[screenshot_index]),
				"NPC review.runtimeScreenshots",
				errors,
				strict_external_evidence
			)
			if strict_external_evidence:
				_append_runtime_screenshot_errors(screenshot_path, errors)


static func _append_installation_metadata_errors(
	record: Dictionary,
	metadata: Dictionary,
	errors: Array[String],
	strict_external_evidence: bool
) -> void:
	var appearance_id := str(record.get("appearanceId", ""))
	var installation_value = metadata.get("installation", {})
	if not (installation_value is Dictionary):
		errors.append("NPC action-bundle-meta.installation 不是对象：%s" % appearance_id)
		return
	var installation := installation_value as Dictionary
	var production_bundle_path := str(installation.get("productionBundlePath", ""))
	var production_manifest_sha := str(installation.get("productionManifestSha256", ""))
	_append_frozen_external_evidence_errors(
		production_bundle_path,
		production_manifest_sha,
		"NPC productionBundlePath",
		errors,
		strict_external_evidence
	)
	if strict_external_evidence and FileAccess.file_exists(production_bundle_path):
		var production_manifest := _read_json_dictionary(
			production_bundle_path,
			"NPC production bundle manifest",
			errors
		)
		if not production_manifest.is_empty():
			if str(production_manifest.get("appearanceId", "")) != appearance_id:
				errors.append("NPC production bundle appearanceId 与目录不一致：%s" % appearance_id)
			if _string_array(production_manifest.get("directions", [])) != WorldVisualDirectionContract.DIRECTIONS:
				errors.append("NPC production bundle 未冻结 canonical 真八向：%s" % appearance_id)
	var ownership_record := str(installation.get("ownershipRecord", ""))
	if ownership_record != "source-and-ownership.md":
		errors.append("NPC installation 必须指向根目录 ownership 记录：%s" % appearance_id)
	var ownership_record_sha := str(installation.get("ownershipRecordSha256", ""))
	if not _is_sha256(ownership_record_sha):
		errors.append("NPC installation.ownershipRecordSha256 无效：%s" % appearance_id)
	else:
		var ownership_path := "%s/%s" % [_resource_path(str(record.get("assetRoot", ""))), ownership_record]
		if FileAccess.file_exists(ownership_path) and FileAccess.get_sha256(ownership_path) != ownership_record_sha:
			errors.append("NPC ownership 记录 SHA-256 不一致：%s" % appearance_id)
	var source_ledger := str(installation.get("sourceLedger", ""))
	var source_ledger_sha := str(installation.get("sourceLedgerSha256", ""))
	var ledger_frames_by_runtime_path: Dictionary = {}
	if not _is_safe_relative_asset_path(source_ledger):
		errors.append("NPC installation.sourceLedger 路径无效：%s" % appearance_id)
	else:
		var ledger_path := "%s/%s" % [_resource_path(str(record.get("assetRoot", ""))), source_ledger]
		if not _is_sha256(source_ledger_sha):
			errors.append("NPC installation.sourceLedgerSha256 无效：%s" % appearance_id)
		elif FileAccess.file_exists(ledger_path) and FileAccess.get_sha256(ledger_path) != source_ledger_sha:
			errors.append("NPC source ledger SHA-256 不一致：%s" % appearance_id)
		var ledger := _read_json_dictionary(ledger_path, "NPC source ledger", errors)
		if not ledger.is_empty():
			ledger_frames_by_runtime_path = _source_ledger_frame_index(ledger, appearance_id, errors)
		if strict_external_evidence and production_bundle_path.is_absolute_path():
			var production_ledger_path := production_bundle_path.get_base_dir().path_join(source_ledger).simplify_path()
			if not FileAccess.file_exists(production_ledger_path):
				errors.append("NPC production bundle 缺少 source ledger：%s" % production_ledger_path)
			elif _is_sha256(source_ledger_sha) and FileAccess.get_sha256(production_ledger_path) != source_ledger_sha:
				errors.append("NPC production/source ledger SHA-256 不一致：%s" % appearance_id)
	var frames_value = installation.get("frames", [])
	if not (frames_value is Array):
		errors.append("NPC installation.frames 不是数组：%s" % appearance_id)
		return
	var expected_frames := _expected_installation_frames(record)
	var seen_paths: Dictionary = {}
	var seen_source_paths: Dictionary = {}
	for frame_value in frames_value as Array:
		if not (frame_value is Dictionary):
			errors.append("NPC installation.frames 存在非对象项：%s" % appearance_id)
			continue
		var frame := frame_value as Dictionary
		var installed_path := str(frame.get("installedPath", ""))
		if not expected_frames.has(installed_path) or seen_paths.has(installed_path):
			errors.append("NPC installation 帧路径未知或重复：%s/%s" % [appearance_id, installed_path])
			continue
		seen_paths[installed_path] = true
		var expected := expected_frames[installed_path] as Dictionary
		if str(frame.get("kind", "")) != str(expected.get("kind", "")) or str(frame.get("slot", "")) != str(expected.get("slot", "")):
			errors.append("NPC installation 帧 kind/slot 不匹配：%s/%s" % [appearance_id, installed_path])
		var source_runtime_path := str(frame.get("sourceRuntimePath", ""))
		if (
			not _is_safe_relative_asset_path(source_runtime_path)
			or source_runtime_path != str(expected.get("sourceRuntimePath", ""))
			or seen_source_paths.has(source_runtime_path)
		):
			errors.append("NPC installation.sourceRuntimePath 无效：%s/%s" % [appearance_id, installed_path])
		else:
			seen_source_paths[source_runtime_path] = true
		var file_sha := str(frame.get("fileSha256", ""))
		var rgba_sha := str(frame.get("rgbaSha256", ""))
		if not _is_sha256(file_sha) or not _is_sha256(rgba_sha):
			errors.append("NPC installation 帧缺少冻结 SHA-256：%s/%s" % [appearance_id, installed_path])
			continue
		var ledger_frame_value = ledger_frames_by_runtime_path.get(source_runtime_path, {})
		if not (ledger_frame_value is Dictionary) or (ledger_frame_value as Dictionary).is_empty():
			errors.append("NPC source ledger 漏登记安装源帧：%s/%s" % [appearance_id, source_runtime_path])
		else:
			var ledger_frame := ledger_frame_value as Dictionary
			if (
				str(ledger_frame.get("group", "")) != str(expected.get("kind", ""))
				or str(ledger_frame.get("slot", "")) != str(expected.get("ledgerSlot", ""))
				or str(ledger_frame.get("runtimeFileSha256", "")) != file_sha
				or str(ledger_frame.get("runtimeRgbaSha256", "")) != rgba_sha
			):
				errors.append("NPC source ledger 与安装帧语义/hash 不一致：%s/%s" % [appearance_id, source_runtime_path])
		if strict_external_evidence and production_bundle_path.is_absolute_path() and _is_safe_relative_asset_path(source_runtime_path):
			var production_source_path := production_bundle_path.get_base_dir().path_join(source_runtime_path).simplify_path()
			if not FileAccess.file_exists(production_source_path):
				errors.append("NPC production bundle 缺少运行源帧：%s" % production_source_path)
			else:
				if FileAccess.get_sha256(production_source_path) != file_sha:
					errors.append("NPC production→install 文件 SHA-256 不一致：%s/%s" % [appearance_id, source_runtime_path])
				var production_image := Image.load_from_file(production_source_path)
				if production_image == null or production_image.is_empty() or _image_signature(production_image) != rgba_sha:
					errors.append("NPC production→install RGBA SHA-256 不一致：%s/%s" % [appearance_id, source_runtime_path])
		var resource_path := "%s/%s" % [_resource_path(str(record.get("assetRoot", ""))), installed_path]
		if not FileAccess.file_exists(resource_path):
			errors.append("NPC installation 帧不存在：%s" % resource_path)
			continue
		if FileAccess.get_sha256(resource_path) != file_sha:
			errors.append("NPC installation 文件 SHA-256 不一致：%s" % resource_path)
		var image := Image.load_from_file(ProjectSettings.globalize_path(resource_path))
		if image == null or image.is_empty() or _image_signature(image) != rgba_sha:
			errors.append("NPC installation RGBA SHA-256 不一致：%s" % resource_path)
	for expected_path_value in expected_frames.keys():
		if not seen_paths.has(expected_path_value):
			errors.append("NPC installation 漏登记运行帧：%s/%s" % [appearance_id, str(expected_path_value)])
	for ledger_source_path_value in ledger_frames_by_runtime_path.keys():
		if not seen_source_paths.has(ledger_source_path_value):
			errors.append("NPC source ledger 存在未安装运行帧：%s/%s" % [appearance_id, str(ledger_source_path_value)])


static func _append_runtime_release_attestation_errors(
	record: Dictionary,
	errors: Array[String]
) -> void:
	var appearance_id := str(record.get("appearanceId", ""))
	var attestation_repo_path := str(record.get("releaseAttestationPath", ""))
	var expected_path := "client/godot/assets/npcs/%s/release-attestation.json" % appearance_id
	var expected_sha := str(record.get("releaseAttestationSha256", ""))
	if attestation_repo_path != expected_path or not _is_sha256(expected_sha):
		errors.append("approved NPC catalog 未冻结 release attestation 路径/hash：%s" % appearance_id)
		return
	var attestation_path := _resource_path(attestation_repo_path)
	if not FileAccess.file_exists(attestation_path):
		errors.append("approved NPC 缺少仓库内 release attestation：%s" % appearance_id)
		return
	if FileAccess.get_sha256(attestation_path) != expected_sha:
		errors.append("approved NPC release attestation 与 catalog SHA-256 不一致：%s" % appearance_id)
		return
	var attestation := _read_json_dictionary(attestation_path, "NPC runtime release attestation", errors)
	if attestation.is_empty():
		return
	var current_file_hashes: Dictionary = {}
	for installed_path_value in _expected_installation_frames(record).keys():
		var installed_path := str(installed_path_value)
		var resource_path := "%s/%s" % [_resource_path(str(record.get("assetRoot", ""))), installed_path]
		if FileAccess.file_exists(resource_path):
			current_file_hashes[installed_path] = FileAccess.get_sha256(resource_path)
	var owner_decision: Dictionary = {}
	var actual_owner_decision_sha := ""
	var owner_decision_repo_path := str(attestation.get("ownerDecisionRecord", ""))
	var exact_owner_decision_path := "client/godot/assets/npcs/%s/release-owner-decision.json" % appearance_id
	if owner_decision_repo_path == exact_owner_decision_path:
		var owner_decision_resource_path := _resource_path(owner_decision_repo_path)
		if FileAccess.file_exists(owner_decision_resource_path):
			actual_owner_decision_sha = FileAccess.get_sha256(owner_decision_resource_path)
			var owner_parsed = JSON.parse_string(FileAccess.get_file_as_string(owner_decision_resource_path))
			if owner_parsed is Dictionary:
				owner_decision = owner_parsed as Dictionary
	errors.append_array(runtime_release_attestation_document_errors(
		record,
		attestation,
		FileAccess.get_sha256(attestation_path),
		current_file_hashes,
		owner_decision,
		actual_owner_decision_sha
	))


static func _append_release_attestation_strict_binding_errors(
	record: Dictionary,
	metadata: Dictionary,
	errors: Array[String]
) -> void:
	# Strict promotion includes every lightweight runtime binding as a subset,
	# including the current tracked owner-decision file and installed file hashes.
	_append_runtime_release_attestation_errors(record, errors)
	var appearance_id := str(record.get("appearanceId", ""))
	var attestation_path := _resource_path(str(record.get("releaseAttestationPath", "")))
	var attestation := _read_json_dictionary(attestation_path, "NPC strict release attestation", errors)
	if attestation.is_empty():
		return
	var review_value = metadata.get("review", {})
	var strict_value = attestation.get("strictEvidence", {})
	if not (review_value is Dictionary) or not (strict_value is Dictionary):
		errors.append("NPC strict release attestation 缺少 review 绑定：%s" % appearance_id)
		return
	var review := review_value as Dictionary
	var strict_evidence := strict_value as Dictionary
	var attestation_schema_version := (
		int(attestation.get("schemaVersion", 0))
		if _is_json_integer(attestation.get("schemaVersion"))
		else 0
	)
	if attestation_schema_version == RELEASE_ATTESTATION_SCHEMA_VERSION_V2:
		var frozen_source_set_sha := NpcArtReleaseEvidence.frozen_runtime_source_set_sha256(
			appearance_id,
			review,
			errors
		)
		errors.append_array(release_attestation_frozen_source_set_errors(
			appearance_id,
			attestation,
			frozen_source_set_sha
		))
	for key in [
		"runtimeEvidenceIndexSha256", "blindStageAResultSha256",
		"blindStageBObservationSha256", "blindAuditSha256",
		"blindReviewPacketSha256", "blindProducerMappingSha256", "runtimeVideoSha256",
	]:
		if str(strict_evidence.get(key, "")) != str(review.get(key, "")):
			errors.append("NPC strict release attestation 证据摘要未绑定 action meta：%s/%s" % [appearance_id, key])
	for key in STRICT_EVIDENCE_ARRAY_KEYS:
		if _string_array(strict_evidence.get(key, [])) != _string_array(review.get(key, [])):
			errors.append("NPC strict release attestation 证据数组未绑定 action meta：%s/%s" % [appearance_id, key])
	var installation_value = metadata.get("installation", {})
	var installation_frames_value = (installation_value as Dictionary).get("frames", []) if installation_value is Dictionary else []
	var attestation_frames_value = attestation.get("frames", [])
	if not (installation_frames_value is Array) or not (attestation_frames_value is Array):
		errors.append("NPC strict release attestation/installation frames 不是数组：%s" % appearance_id)
		return
	var installed_by_path: Dictionary = {}
	for frame_value in installation_frames_value as Array:
		if frame_value is Dictionary:
			var frame := frame_value as Dictionary
			installed_by_path[str(frame.get("installedPath", ""))] = frame
	for frame_value in attestation_frames_value as Array:
		if not (frame_value is Dictionary):
			continue
		var frame := frame_value as Dictionary
		var installed_path := str(frame.get("installedPath", ""))
		var installation_frame_value = installed_by_path.get(installed_path, {})
		if not (installation_frame_value is Dictionary):
			errors.append("NPC strict release attestation 帧不在 installation：%s/%s" % [appearance_id, installed_path])
			continue
		var installation_frame := installation_frame_value as Dictionary
		if (
			str(frame.get("kind", "")) != str(installation_frame.get("kind", ""))
			or str(frame.get("slot", "")) != str(installation_frame.get("slot", ""))
			or str(frame.get("sourceRuntimePath", "")) != str(installation_frame.get("sourceRuntimePath", ""))
			or str(frame.get("fileSha256", "")) != str(installation_frame.get("fileSha256", ""))
			or str(frame.get("rgbaSha256", "")) != str(installation_frame.get("rgbaSha256", ""))
		):
			errors.append("NPC strict release attestation 帧与 installation 不一致：%s/%s" % [appearance_id, installed_path])
	if (attestation_frames_value as Array).size() != installed_by_path.size():
		errors.append("NPC strict release attestation 未完整覆盖 installation：%s" % appearance_id)


static func _source_ledger_frame_index(
	ledger: Dictionary,
	appearance_id: String,
	errors: Array[String]
) -> Dictionary:
	var result: Dictionary = {}
	if not _is_json_integer(ledger.get("schemaVersion")) or int(ledger.get("schemaVersion", 0)) != 1:
		errors.append("NPC source ledger schemaVersion 必须为整数 1：%s" % appearance_id)
	var ledger_frames_value = ledger.get("frames", [])
	if not (ledger_frames_value is Array) or (ledger_frames_value as Array).is_empty():
		errors.append("NPC source ledger 缺少逐帧 provenance：%s" % appearance_id)
		return result
	for frame_index in range((ledger_frames_value as Array).size()):
		var frame_value = (ledger_frames_value as Array)[frame_index]
		if not (frame_value is Dictionary):
			errors.append("NPC source ledger.frames[%d] 必须为对象：%s" % [frame_index, appearance_id])
			continue
		var frame := frame_value as Dictionary
		var runtime_path := str(frame.get("runtimePath", ""))
		if not _is_safe_relative_asset_path(runtime_path) or result.has(runtime_path):
			errors.append("NPC source ledger runtimePath 无效或重复：%s/%s" % [appearance_id, runtime_path])
			continue
		if not ["world", "portrait"].has(str(frame.get("group", ""))) or str(frame.get("slot", "")).strip_edges() == "":
			errors.append("NPC source ledger group/slot 无效：%s/%s" % [appearance_id, runtime_path])
		if (
			not _is_sha256(str(frame.get("runtimeFileSha256", "")))
			or not _is_sha256(str(frame.get("runtimeRgbaSha256", "")))
		):
			errors.append("NPC source ledger 运行帧缺少冻结 hash：%s/%s" % [appearance_id, runtime_path])
		result[runtime_path] = frame
	return result


static func _append_ownership_errors(record: Dictionary, errors: Array[String]) -> void:
	var path := _resource_path(str(record.get("ownershipPath", "")))
	if not FileAccess.file_exists(path):
		return
	var contents := FileAccess.get_file_as_string(path).strip_edges()
	if contents == "" or contents.length() < 80:
		errors.append("NPC ownership 记录为空或不足以追溯：%s" % path)


static func _append_external_evidence_path_error(
	path: String,
	label: String,
	errors: Array[String],
	require_exists: bool
) -> void:
	var normalized := path.strip_edges()
	if normalized == "" or not normalized.is_absolute_path():
		errors.append("%s 必须为可追溯绝对路径：%s" % [label, normalized])
		return
	if require_exists and not FileAccess.file_exists(normalized):
		errors.append("%s 不存在：%s" % [label, normalized])


static func _append_frozen_external_evidence_errors(
	path: String,
	expected_sha256: String,
	label: String,
	errors: Array[String],
	require_exists: bool
) -> void:
	_append_external_evidence_path_error(path, label, errors, require_exists)
	if not _is_sha256(expected_sha256):
		errors.append("%s SHA-256 无效" % label)
		return
	if not require_exists or not FileAccess.file_exists(path):
		return
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null or file.get_length() <= 0:
		errors.append("%s 为空或不可读：%s" % [label, path])
		return
	if FileAccess.get_sha256(path) != expected_sha256:
		errors.append("%s SHA-256 不一致：%s" % [label, path])


static func _installation_frame_index_by_source_path(installation: Dictionary) -> Dictionary:
	var result: Dictionary = {}
	var frames_value = installation.get("frames", [])
	if not (frames_value is Array):
		return result
	for frame_value in frames_value as Array:
		if not (frame_value is Dictionary):
			continue
		var frame := frame_value as Dictionary
		var source_runtime_path := str(frame.get("sourceRuntimePath", ""))
		if _is_safe_relative_asset_path(source_runtime_path) and not result.has(source_runtime_path):
			result[source_runtime_path] = frame
	return result


static func _append_blind_audit_errors(
	path: String,
	appearance_id: String,
	production_manifest_sha256: String,
	review: Dictionary,
	installation: Dictionary,
	errors: Array[String],
	require_exists: bool
) -> void:
	if not require_exists or not FileAccess.file_exists(path):
		return
	var audit := _read_json_dictionary(path, "NPC blind direction audit", errors)
	if audit.is_empty():
		return
	if str(audit.get("appearanceId", "")) != appearance_id:
		errors.append("NPC blind audit appearanceId 与目录不一致：%s" % appearance_id)
	if str(audit.get("status", "")) != "pass":
		errors.append("NPC blind audit 必须明确 status=pass：%s" % appearance_id)
	var flags_value = audit.get("flags")
	if not (flags_value is Array) or not (flags_value as Array).is_empty():
		errors.append("NPC blind audit flags 必须为空数组：%s" % appearance_id)
	if _string_array(audit.get("canonicalDirections", [])) != WorldVisualDirectionContract.DIRECTIONS:
		errors.append("NPC blind audit 未覆盖 canonical 真八向：%s" % appearance_id)
	if (
		not _is_sha256(production_manifest_sha256)
		or str(audit.get("productionManifestSha256", "")) != production_manifest_sha256
	):
		errors.append("NPC blind audit 未绑定当前 production manifest：%s" % appearance_id)
	if str(audit.get("runtimeScene", "")) != "res://scenes/Main.tscn":
		errors.append("NPC blind audit 必须绑定真实 Main.tscn 运行路径：%s" % appearance_id)
	if str(audit.get("runtimeVideoSha256", "")) != str(review.get("runtimeVideoSha256", "")):
		errors.append("NPC blind audit 未绑定当前运行录像：%s" % appearance_id)
	if _string_array(audit.get("runtimeScreenshotSha256s", [])) != _string_array(review.get("runtimeScreenshotSha256s", [])):
		errors.append("NPC blind audit 未绑定当前运行截图：%s" % appearance_id)
	if not _is_sha256(str(audit.get("shuffleSeedSha256", ""))):
		errors.append("NPC blind audit 缺少冻结的随机盲审种子：%s" % appearance_id)
	var installation_frames := _installation_frame_index_by_source_path(installation)
	var reviewed_frames_value = audit.get("reviewedFrames", [])
	var reviewed_source_paths: Dictionary = {}
	if not (reviewed_frames_value is Array) or (reviewed_frames_value as Array).size() != installation_frames.size():
		errors.append("NPC blind audit reviewedFrames 必须覆盖完整安装矩阵：%s" % appearance_id)
	else:
		for reviewed_value in reviewed_frames_value as Array:
			if not (reviewed_value is Dictionary):
				errors.append("NPC blind audit reviewedFrames 存在非对象项：%s" % appearance_id)
				continue
			var reviewed := reviewed_value as Dictionary
			var source_runtime_path := str(reviewed.get("sourceRuntimePath", ""))
			var installation_frame_value = installation_frames.get(source_runtime_path, {})
			if not (installation_frame_value is Dictionary) or reviewed_source_paths.has(source_runtime_path):
				errors.append("NPC blind audit reviewedFrame 未知或重复：%s/%s" % [appearance_id, source_runtime_path])
				continue
			reviewed_source_paths[source_runtime_path] = true
			var installation_frame := installation_frame_value as Dictionary
			if (
				str(reviewed.get("status", "")) != "pass"
				or str(reviewed.get("kind", "")) != str(installation_frame.get("kind", ""))
				or str(reviewed.get("slot", "")) != str(installation_frame.get("slot", ""))
				or str(reviewed.get("installedPath", "")) != str(installation_frame.get("installedPath", ""))
				or str(reviewed.get("fileSha256", "")) != str(installation_frame.get("fileSha256", ""))
				or str(reviewed.get("rgbaSha256", "")) != str(installation_frame.get("rgbaSha256", ""))
			):
				errors.append("NPC blind audit reviewedFrame 与安装矩阵不一致：%s/%s" % [appearance_id, source_runtime_path])
	for source_path_value in installation_frames.keys():
		if not reviewed_source_paths.has(source_path_value):
			errors.append("NPC blind audit 漏审安装帧：%s/%s" % [appearance_id, str(source_path_value)])
	_append_blind_direction_result_errors(audit, appearance_id, installation_frames, errors)


static func _append_blind_direction_result_errors(
	audit: Dictionary,
	appearance_id: String,
	installation_frames: Dictionary,
	errors: Array[String]
) -> void:
	var results_value = audit.get("directionResults", [])
	if not (results_value is Array) or (results_value as Array).size() != WorldVisualDirectionContract.DIRECTIONS.size():
		errors.append("NPC blind audit directionResults 必须恰好覆盖八向：%s" % appearance_id)
		return
	var seen_directions: Dictionary = {}
	var seen_presentation_indices: Dictionary = {}
	var observed_non_identity_shuffle := false
	for result_value in results_value as Array:
		if not (result_value is Dictionary):
			errors.append("NPC blind audit directionResults 存在非对象项：%s" % appearance_id)
			continue
		var result := result_value as Dictionary
		var direction := str(result.get("direction", ""))
		var canonical_index := WorldVisualDirectionContract.DIRECTIONS.find(direction)
		var presentation_index_value = result.get("presentationIndex")
		if canonical_index < 0 or seen_directions.has(direction):
			errors.append("NPC blind audit 方向未知或重复：%s/%s" % [appearance_id, direction])
			continue
		seen_directions[direction] = true
		if (
			not _is_json_integer(presentation_index_value)
			or int(presentation_index_value) < 0
			or int(presentation_index_value) >= WorldVisualDirectionContract.DIRECTIONS.size()
			or seen_presentation_indices.has(int(presentation_index_value))
		):
			errors.append("NPC blind audit presentationIndex 无效或重复：%s/%s" % [appearance_id, direction])
		else:
			var presentation_index := int(presentation_index_value)
			seen_presentation_indices[presentation_index] = true
			observed_non_identity_shuffle = observed_non_identity_shuffle or presentation_index != canonical_index
		var source_runtime_path := "runtime/world/%s/idle-1.png" % direction
		var installation_frame_value = installation_frames.get(source_runtime_path, {})
		if not (installation_frame_value is Dictionary):
			errors.append("NPC blind audit 方向没有对应安装帧：%s/%s" % [appearance_id, direction])
			continue
		var installation_frame := installation_frame_value as Dictionary
		if (
			str(result.get("sourceRuntimePath", "")) != source_runtime_path
			or str(result.get("classifiedDirection", "")) != direction
			or str(result.get("status", "")) != "pass"
			or str(result.get("fileSha256", "")) != str(installation_frame.get("fileSha256", ""))
			or str(result.get("rgbaSha256", "")) != str(installation_frame.get("rgbaSha256", ""))
		):
			errors.append("NPC blind audit 逐方向判定未绑定当前帧：%s/%s" % [appearance_id, direction])
	if seen_directions.size() != WorldVisualDirectionContract.DIRECTIONS.size():
		errors.append("NPC blind audit 逐方向判定不完整：%s" % appearance_id)
	if seen_presentation_indices.size() != WorldVisualDirectionContract.DIRECTIONS.size() or not observed_non_identity_shuffle:
		errors.append("NPC blind audit 未证明随机打乱展示顺序：%s" % appearance_id)


static func _append_runtime_video_errors(path: String, errors: Array[String]) -> void:
	if not FileAccess.file_exists(path):
		return
	if path.get_extension().to_lower() != "mp4":
		errors.append("NPC runtimeVideo 必须为 MP4：%s" % path)
		return
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null or file.get_length() < 1024:
		errors.append("NPC runtimeVideo 为空或过短：%s" % path)
		return
	var ffprobe := _qa_executable_path("ffprobe")
	var ffmpeg := _qa_executable_path("ffmpeg")
	if ffprobe == "" or ffmpeg == "":
		errors.append("NPC 严格录像检查需要 ffprobe 与 ffmpeg：%s" % path)
		return
	var probe_output: Array = []
	var probe_exit := OS.execute(
		ffprobe,
		PackedStringArray([
			"-v", "error", "-count_frames", "-select_streams", "v:0",
			"-show_entries", "stream=codec_type,codec_name,width,height,avg_frame_rate,nb_read_frames,duration",
			"-of", "json", path,
		]),
		probe_output,
		true
	)
	var probe = JSON.parse_string("\n".join(_string_array(probe_output))) if probe_exit == 0 else null
	if not (probe is Dictionary):
		errors.append("NPC runtimeVideo 无法由 ffprobe 解析：%s" % path)
		return
	var streams_value = (probe as Dictionary).get("streams", [])
	if not (streams_value is Array) or (streams_value as Array).size() != 1 or not ((streams_value as Array)[0] is Dictionary):
		errors.append("NPC runtimeVideo 必须恰好含可解析的首路视频流：%s" % path)
		return
	var stream := (streams_value as Array)[0] as Dictionary
	if (
		str(stream.get("codec_type", "")) != "video"
		or str(stream.get("codec_name", "")) != "h264"
		or int(stream.get("width", 0)) != 1280
		or int(stream.get("height", 0)) != 720
		or not _fraction_matches(str(stream.get("avg_frame_rate", "")), 30.0)
		or int(str(stream.get("nb_read_frames", "0"))) != 361
		or absf(float(str(stream.get("duration", "0"))) - 361.0 / 30.0) > 0.002
	):
		errors.append("NPC runtimeVideo 必须为 H.264 1280x720/30fps/361帧/12.033秒：%s" % path)
	var decode_output: Array = []
	var decode_exit := OS.execute(
		ffmpeg,
		PackedStringArray(["-v", "error", "-xerror", "-i", path, "-map", "0:v:0", "-f", "null", "-"]),
		decode_output,
		true
	)
	if decode_exit != 0:
		errors.append("NPC runtimeVideo 完整逐帧解码失败：%s" % path)


static func _append_runtime_screenshot_errors(path: String, errors: Array[String]) -> void:
	if not FileAccess.file_exists(path):
		return
	var image := Image.load_from_file(path)
	if image == null or image.is_empty():
		errors.append("NPC runtime screenshot 无法解码：%s" % path)
		return
	if image.get_width() != 1280 or image.get_height() != 720:
		errors.append("NPC runtime screenshot 必须为 1280x720：%s" % path)
		return
	var rgba := _rgba8_image_copy(image)
	var bytes := rgba.get_data()
	var visible_pixels := 0
	var minimum_rgb := Vector3i(255, 255, 255)
	var maximum_rgb := Vector3i.ZERO
	var sampled_colors: Dictionary = {}
	for offset in range(0, bytes.size(), 4):
		if int(bytes[offset + 3]) == 0:
			continue
		visible_pixels += 1
		var red := int(bytes[offset])
		var green := int(bytes[offset + 1])
		var blue := int(bytes[offset + 2])
		minimum_rgb = Vector3i(mini(minimum_rgb.x, red), mini(minimum_rgb.y, green), mini(minimum_rgb.z, blue))
		maximum_rgb = Vector3i(maxi(maximum_rgb.x, red), maxi(maximum_rgb.y, green), maxi(maximum_rgb.z, blue))
		if offset % (4 * 97) == 0 and sampled_colors.size() < 256:
			sampled_colors[red * 65536 + green * 256 + blue] = true
	var pixel_count := image.get_width() * image.get_height()
	var channel_range_sum := (
		maximum_rgb.x - minimum_rgb.x
		+ maximum_rgb.y - minimum_rgb.y
		+ maximum_rgb.z - minimum_rgb.z
	)
	if visible_pixels < pixel_count / 2 or sampled_colors.size() < 32 or channel_range_sum < 96:
		errors.append("NPC runtime screenshot 透明、单色或信息量过低：%s" % path)


static func _qa_executable_path(name: String) -> String:
	for directory_value in OS.get_environment("PATH").split(":", false):
		var candidate := str(directory_value).path_join(name)
		if FileAccess.file_exists(candidate):
			return candidate
	for prefix in ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin"]:
		var candidate := "%s/%s" % [prefix, name]
		if FileAccess.file_exists(candidate):
			return candidate
	return ""


static func _append_world_errors(
	record: Dictionary,
	errors: Array[String],
	inspect_assets: bool,
	strict_source_parity: bool
) -> void:
	var appearance_id := str(record.get("appearanceId", ""))
	var world_value = record.get("world", {})
	if not (world_value is Dictionary):
		errors.append("NPC world 不是对象：%s" % appearance_id)
		return
	var world := world_value as Dictionary
	var strategy := str(world.get("visualStrategy", ""))
	var direction_mapping_value = world.get("directionMapping", {})
	errors.append_array(WorldVisualDirectionContract.validation_errors(strategy, direction_mapping_value))
	if strategy != WorldVisualDirectionContract.STRATEGY_INDEPENDENT_8:
		errors.append("NPC 世界美术必须使用独立真八向：%s" % appearance_id)
	if not (direction_mapping_value is Dictionary):
		errors.append("NPC 世界方向映射不是对象：%s" % appearance_id)
	else:
		var direction_mapping := direction_mapping_value as Dictionary
		if direction_mapping.size() != WorldVisualDirectionContract.DIRECTIONS.size():
			errors.append("NPC 世界方向映射必须恰好登记八项：%s" % appearance_id)
		for direction in WorldVisualDirectionContract.DIRECTIONS:
			var entry_value = direction_mapping.get(direction)
			if not (entry_value is Dictionary):
				errors.append("NPC 缺少独立世界方向：%s/%s" % [appearance_id, direction])
				continue
			var entry := entry_value as Dictionary
			if not entry.has("sourceDirection") or str(entry.get("sourceDirection", "")) != direction:
				errors.append("NPC 世界方向不得复用其他源图：%s/%s" % [appearance_id, direction])
			if typeof(entry.get("flipH")) != TYPE_BOOL or bool(entry.get("flipH", true)):
				errors.append("NPC 世界方向禁止镜像：%s/%s" % [appearance_id, direction])
	if not _is_integer_pair(world.get("frameSize", [])) or _int_pair(world.get("frameSize", [])) != _int_pair(_catalog.get("worldFrameSize", [])):
		errors.append("NPC 世界帧尺寸合同与目录不一致：%s" % appearance_id)
	var presentation_scale_value = world.get("presentationScale")
	var presentation_scale := float(presentation_scale_value) if _is_number(presentation_scale_value) else 0.0
	if not _is_number(presentation_scale_value) or presentation_scale <= 0.0 or presentation_scale > 1.0:
		errors.append("NPC 世界呈现比例无效：%s" % appearance_id)
	if not _is_numeric_pair(world.get("anchorOffset", [])):
		errors.append("NPC 世界落脚锚点必须为二元数组：%s" % appearance_id)
	var actions := _world_actions(record)
	var mobility := str(record.get("mobility", ""))
	var idle_value = actions.get(WORLD_ACTION_IDLE, {})
	if (
		not (idle_value is Dictionary)
		or not _is_json_integer((idle_value as Dictionary).get("frameCount"))
		or int((idle_value as Dictionary).get("frameCount", 0)) != 1
	):
		errors.append("NPC 每个方向必须有且仅有一张 idle：%s" % appearance_id)
	if mobility == STATIC_MOBILITY and (actions.size() != 1 or actions.has(WORLD_ACTION_WALK)):
		errors.append("静态 NPC 运行矩阵只能登记 idle1：%s" % appearance_id)
	if mobility == MOBILE_MOBILITY and not actions.has(WORLD_ACTION_WALK):
		errors.append("移动 NPC 必须登记每向 walk4：%s" % appearance_id)
	if actions.has(WORLD_ACTION_WALK):
		var walk_value = actions.get(WORLD_ACTION_WALK, {})
		if (
			not (walk_value is Dictionary)
			or not _is_json_integer((walk_value as Dictionary).get("frameCount"))
			or int((walk_value as Dictionary).get("frameCount", 0)) != 4
		):
			errors.append("NPC walk 一旦生产就必须为每向四帧：%s" % appearance_id)
	var world_texture_entries: Array[Dictionary] = []
	for action_value in actions.keys():
		var action := str(action_value)
		if not [WORLD_ACTION_IDLE, WORLD_ACTION_WALK].has(action):
			errors.append("NPC 世界动作无效：%s/%s" % [appearance_id, action])
			continue
		var spec_value = actions.get(action, {})
		if not (spec_value is Dictionary):
			errors.append("NPC 世界动作合同不是对象：%s/%s" % [appearance_id, action])
			continue
		var spec := spec_value as Dictionary
		var frame_count_value = spec.get("frameCount")
		if not _is_json_integer(frame_count_value) or int(frame_count_value) <= 0:
			errors.append("NPC 世界动作 frameCount 必须为正整数：%s/%s" % [appearance_id, action])
		var fps_value = spec.get("fps")
		if not _is_number(fps_value) or float(fps_value) <= 0.0:
			errors.append("NPC 世界动作 fps 无效：%s/%s" % [appearance_id, action])
		if not inspect_assets:
			continue
		var frame_count := maxi(0, int(frame_count_value)) if _is_json_integer(frame_count_value) else 0
		for frame_index in range(1, frame_count + 1):
			for direction in WorldVisualDirectionContract.DIRECTIONS:
				var path := _world_frame_resource_path(record, direction, action, frame_index)
				var texture := _validated_texture(
					path,
					_int_pair(world.get("frameSize", [])),
					"NPC 世界帧",
					errors,
					strict_source_parity
				)
				if texture != null:
					world_texture_entries.append({
						"label": "%s/%s/%d" % [direction, action, frame_index],
						"texture": texture,
					})
	if inspect_assets:
		_append_asset_matrix_errors(appearance_id, "世界帧", world_texture_entries, errors, true)


static func _append_runtime_texture_warm_errors(record: Dictionary, errors: Array[String]) -> void:
	var world_value = record.get("world", {})
	if world_value is Dictionary:
		var world := world_value as Dictionary
		var expected_world_size := _int_pair(world.get("frameSize", []))
		for action_value in _world_actions(record).keys():
			var action := str(action_value)
			var spec_value = _world_actions(record).get(action, {})
			if not (spec_value is Dictionary):
				continue
			var frame_count := maxi(0, int((spec_value as Dictionary).get("frameCount", 0)))
			for direction in WorldVisualDirectionContract.DIRECTIONS:
				for frame_index in range(1, frame_count + 1):
					_cache_runtime_texture_lightweight(
						_world_frame_resource_path(record, direction, action, frame_index),
						expected_world_size,
						"NPC 世界帧",
						errors
					)
	var portraits_value = record.get("portraits", {})
	if portraits_value is Dictionary:
		var portraits := portraits_value as Dictionary
		var expected_portrait_size := _int_pair(portraits.get("frameSize", []))
		for state in PORTRAIT_STATES:
			_cache_runtime_texture_lightweight(
				_portrait_resource_path(record, state),
				expected_portrait_size,
				"NPC 人像",
				errors
			)


static func _cache_runtime_texture_lightweight(
	path: String,
	expected_size: Vector2i,
	label: String,
	errors: Array[String]
) -> void:
	if path == "" or not ResourceLoader.exists(path):
		errors.append("缺少%s：%s" % [label, path])
		return
	var cached = _texture_cache.get(path)
	var texture: Texture2D = cached as Texture2D if cached is Texture2D else null
	if texture == null:
		var loaded = load(path)
		if not (loaded is Texture2D):
			errors.append("%s不是 Texture2D：%s" % [label, path])
			return
		texture = loaded as Texture2D
		_texture_cache[path] = texture
	if texture.get_width() != expected_size.x or texture.get_height() != expected_size.y:
		errors.append(
			"%s尺寸必须为 %dx%d：%s"
			% [label, expected_size.x, expected_size.y, path]
		)


static func _append_portrait_errors(
	record: Dictionary,
	errors: Array[String],
	inspect_assets: bool,
	strict_source_parity: bool
) -> void:
	var appearance_id := str(record.get("appearanceId", ""))
	var portraits_value = record.get("portraits", {})
	if not (portraits_value is Dictionary):
		errors.append("NPC portraits 不是对象：%s" % appearance_id)
		return
	var portraits := portraits_value as Dictionary
	if not _is_integer_pair(portraits.get("frameSize", [])) or _int_pair(portraits.get("frameSize", [])) != _int_pair(_catalog.get("portraitFrameSize", [])):
		errors.append("NPC 人像尺寸合同与目录不一致：%s" % appearance_id)
	var states_value = portraits.get("states", {})
	if not (states_value is Dictionary):
		errors.append("NPC 人像 states 不是对象：%s" % appearance_id)
		return
	var states := states_value as Dictionary
	var portrait_texture_entries: Array[Dictionary] = []
	for state in PORTRAIT_STATES:
		var relative_path := str(states.get(state, "")).strip_edges()
		if not _is_safe_relative_asset_path(relative_path):
			errors.append("NPC 人像路径无效：%s/%s" % [appearance_id, state])
			continue
		if inspect_assets:
			var texture := _validated_texture(
				_portrait_resource_path(record, state),
				_int_pair(portraits.get("frameSize", [])),
				"NPC 人像",
				errors,
				strict_source_parity
			)
			if texture != null:
				portrait_texture_entries.append({"label": state, "texture": texture})
	for state_value in states.keys():
		if not PORTRAIT_STATES.has(str(state_value)):
			errors.append("NPC 登记了未知人像状态：%s/%s" % [appearance_id, str(state_value)])
	if inspect_assets:
		_append_asset_matrix_errors(appearance_id, "人像", portrait_texture_entries, errors, false)


static func _append_asset_matrix_errors(
	appearance_id: String,
	asset_kind: String,
	entries: Array[Dictionary],
	errors: Array[String],
	detect_mirrors: bool
) -> void:
	var original_signatures: Dictionary = {}
	var horizontal_mirror_signatures: Dictionary = {}
	var vertical_mirror_signatures: Dictionary = {}
	for entry in entries:
		var label := str(entry.get("label", ""))
		var texture_value = entry.get("texture")
		if not (texture_value is Texture2D):
			continue
		var image := (texture_value as Texture2D).get_image()
		if image == null or image.is_empty():
			errors.append("NPC %s无法读取像素：%s/%s" % [asset_kind, appearance_id, label])
			continue
		var signature := _image_signature(image)
		if original_signatures.has(signature):
			errors.append(
				"NPC %s存在完全重复帧：%s/%s 与 %s"
				% [asset_kind, appearance_id, str(original_signatures[signature]), label]
			)
		if detect_mirrors and horizontal_mirror_signatures.has(signature):
			errors.append(
				"NPC %s存在水平镜像冒充：%s/%s -> %s"
				% [asset_kind, appearance_id, str(horizontal_mirror_signatures[signature]), label]
			)
		if detect_mirrors and vertical_mirror_signatures.has(signature):
			errors.append(
				"NPC %s存在垂直镜像冒充：%s/%s -> %s"
				% [asset_kind, appearance_id, str(vertical_mirror_signatures[signature]), label]
			)
		original_signatures[signature] = label
		if detect_mirrors:
			var horizontal_mirror := _rgba8_image_copy(image)
			horizontal_mirror.flip_x()
			horizontal_mirror_signatures[_image_signature(horizontal_mirror)] = label
			var vertical_mirror := _rgba8_image_copy(image)
			vertical_mirror.flip_y()
			vertical_mirror_signatures[_image_signature(vertical_mirror)] = label


static func _validated_texture(
	path: String,
	expected_size: Vector2i,
	label: String,
	errors: Array[String],
	strict_source_parity: bool
) -> Texture2D:
	if path == "" or not ResourceLoader.exists(path):
		errors.append("缺少%s：%s" % [label, path])
		return null
	var cached = _texture_cache.get(path)
	var texture: Texture2D = cached as Texture2D if cached is Texture2D else null
	if texture == null:
		var loaded = load(path)
		if not (loaded is Texture2D):
			errors.append("%s不是 Texture2D：%s" % [label, path])
			return null
		texture = loaded as Texture2D
		_texture_cache[path] = texture
	if texture.get_width() != expected_size.x or texture.get_height() != expected_size.y:
		errors.append(
			"%s尺寸必须为 %dx%d：%s"
			% [label, expected_size.x, expected_size.y, path]
		)
	var runtime_image := texture.get_image()
	if runtime_image == null or runtime_image.is_empty():
		errors.append("%s无法读取运行像素：%s" % [label, path])
		return texture
	if strict_source_parity:
		_append_source_import_parity_errors(path, runtime_image, label, errors)
	else:
		_append_image_alpha_errors(runtime_image, label, path, errors, false)
	return texture


static func _append_image_alpha_errors(
	image: Image,
	label: String,
	path: String,
	errors: Array[String],
	require_zero_transparent_rgb: bool
) -> void:
	var rgba := _rgba8_image_copy(image)
	var bytes := rgba.get_data()
	var transparent_pixels := 0
	var visible_pixels := 0
	var dirty_transparent_pixels := 0
	for offset in range(0, bytes.size(), 4):
		var alpha := int(bytes[offset + 3])
		if alpha == 0:
			transparent_pixels += 1
			if int(bytes[offset]) != 0 or int(bytes[offset + 1]) != 0 or int(bytes[offset + 2]) != 0:
				dirty_transparent_pixels += 1
		else:
			visible_pixels += 1
	if transparent_pixels == 0 or visible_pixels == 0:
		errors.append("%s必须同时含可见像素与透明背景：%s" % [label, path])
	if require_zero_transparent_rgb and dirty_transparent_pixels > 0:
		errors.append("%s透明像素 RGB 必须归零，实际 %d：%s" % [label, dirty_transparent_pixels, path])


static func _append_source_loaded_pixel_contract_errors(
	source_image: Image,
	loaded_image: Image,
	label: String,
	path: String,
	errors: Array[String]
) -> void:
	_append_image_alpha_errors(source_image, "%s源 PNG" % label, path, errors, true)
	# Godot's fix_alpha_border may legally rewrite RGB where alpha is not fully
	# opaque. The loaded texture must retain alpha/visible coverage, while
	# canonical parity below proves shape and every opaque RGB value.
	_append_image_alpha_errors(loaded_image, "%s Godot loaded" % label, path, errors, false)
	if _canonical_image_signature(source_image) != _canonical_image_signature(loaded_image):
		errors.append("%s源 PNG 与 Godot 已加载 canonical RGBA 不一致：%s" % [label, path])


static func _append_source_import_parity_errors(
	path: String,
	runtime_image: Image,
	label: String,
	errors: Array[String]
) -> void:
	var absolute_path := ProjectSettings.globalize_path(path)
	var source_image := Image.load_from_file(absolute_path)
	if source_image == null or source_image.is_empty():
		errors.append("%s源 PNG 无法解码：%s" % [label, path])
		return
	_append_source_loaded_pixel_contract_errors(source_image, runtime_image, label, path, errors)
	var import_path := "%s.import" % path
	if not FileAccess.file_exists(import_path):
		errors.append("%s缺少 Godot import sidecar：%s" % [label, import_path])
		return
	var import_text := FileAccess.get_file_as_string(import_path)
	var source_file := _quoted_setting(import_text, "source_file")
	if source_file != path:
		errors.append("%s import source_file 未指向当前 PNG：%s" % [label, path])
	var recorded_md5 := _quoted_setting(import_text, "source_md5")
	if recorded_md5 == "":
		var imported_resource_path := _quoted_setting(import_text, "path")
		if imported_resource_path != "":
			var md5_path := "%s.md5" % imported_resource_path.get_basename()
			if FileAccess.file_exists(md5_path):
				recorded_md5 = _quoted_setting(FileAccess.get_file_as_string(md5_path), "source_md5")
	if recorded_md5 == "":
		errors.append("%s 无法读取 import source_md5：%s" % [label, import_path])
		return
	var actual_md5 := FileAccess.get_md5(path)
	if recorded_md5 != actual_md5:
		errors.append("%s import source_md5 与当前 PNG 不一致：%s" % [label, path])


static func _world_actions(record: Dictionary) -> Dictionary:
	var world_value = record.get("world", {})
	if not (world_value is Dictionary):
		return {}
	var actions_value = (world_value as Dictionary).get("actions", {})
	return actions_value as Dictionary if actions_value is Dictionary else {}


static func _available_world_action(record: Dictionary, requested_action: String) -> String:
	var normalized := requested_action.strip_edges().to_lower()
	var actions := _world_actions(record)
	return normalized if actions.has(normalized) else WORLD_ACTION_IDLE


static func _world_frame_resource_path(
	record: Dictionary,
	direction: String,
	action: String,
	frame_index: int
) -> String:
	var root := _resource_path(str(record.get("assetRoot", "")))
	if root == "":
		return ""
	return "%s/world/directions/%s/%s/%s-%d.png" % [root, direction, action, action, frame_index]


static func _portrait_resource_path(record: Dictionary, state: String) -> String:
	var root := _resource_path(str(record.get("assetRoot", "")))
	var portraits_value = record.get("portraits", {})
	if root == "" or not (portraits_value is Dictionary):
		return ""
	var states_value = (portraits_value as Dictionary).get("states", {})
	if not (states_value is Dictionary):
		return ""
	var relative_path := str((states_value as Dictionary).get(state, ""))
	return "%s/%s" % [root, relative_path] if _is_safe_relative_asset_path(relative_path) else ""


static func _expected_installation_frames(record: Dictionary) -> Dictionary:
	var result: Dictionary = {}
	var actions := _world_actions(record)
	for action_value in actions.keys():
		var action := str(action_value)
		var spec_value = actions.get(action, {})
		if not (spec_value is Dictionary):
			continue
		var frame_count := maxi(0, int((spec_value as Dictionary).get("frameCount", 0)))
		for direction in WorldVisualDirectionContract.DIRECTIONS:
			for frame_index in range(1, frame_count + 1):
				var path := "world/directions/%s/%s/%s-%d.png" % [direction, action, action, frame_index]
				result[path] = {
					"kind": "world",
					"slot": "%s/%s/%d" % [direction, action, frame_index],
					"ledgerSlot": direction,
					"sourceRuntimePath": "runtime/world/%s/%s-%d.png" % [direction, action, frame_index],
				}
	var portraits_value = record.get("portraits", {})
	if portraits_value is Dictionary:
		var states_value = (portraits_value as Dictionary).get("states", {})
		if states_value is Dictionary:
			for state in PORTRAIT_STATES:
					var path := str((states_value as Dictionary).get(state, ""))
					if _is_safe_relative_asset_path(path):
						result[path] = {
							"kind": "portrait",
							"slot": state,
							"ledgerSlot": state,
							"sourceRuntimePath": "runtime/portraits/%s.png" % state,
						}
	return result


static func _release_attestation_source_set_sha256(
	appearance_id: String,
	frames_by_source_path: Dictionary,
	schema_version: int
) -> String:
	var source_set_lines := ""
	for direction in WorldVisualDirectionContract.DIRECTIONS:
		var source_path := "runtime/world/%s/idle-1.png" % direction
		var frame_value = frames_by_source_path.get(source_path, {})
		if not (frame_value is Dictionary):
			continue
		var frame := frame_value as Dictionary
		# Never infer a V2 canonical hash from full RGBA. V1 alone retains the
		# legacy full/full calculation so existing owner approvals stay frozen.
		var canonical_rgba_sha := (
			str(frame.get("sourceDecodedRgbaSha256", ""))
			if schema_version == RELEASE_ATTESTATION_SCHEMA_VERSION_V2
			else str(frame.get("rgbaSha256", ""))
		)
		source_set_lines += "world\t%s\tres://assets/npcs/%s/%s\t%s\t%s\t%s\n" % [
			direction, appearance_id, str(frame.get("installedPath", "")),
			str(frame.get("fileSha256", "")), str(frame.get("rgbaSha256", "")), canonical_rgba_sha,
		]
	for state in PORTRAIT_STATES:
		var source_path := "runtime/portraits/%s.png" % state
		var frame_value = frames_by_source_path.get(source_path, {})
		if not (frame_value is Dictionary):
			continue
		var frame := frame_value as Dictionary
		var canonical_rgba_sha := (
			str(frame.get("sourceDecodedRgbaSha256", ""))
			if schema_version == RELEASE_ATTESTATION_SCHEMA_VERSION_V2
			else str(frame.get("rgbaSha256", ""))
		)
		source_set_lines += "portrait\t%s\tres://assets/npcs/%s/%s\t%s\t%s\t%s\n" % [
			state, appearance_id, str(frame.get("installedPath", "")),
			str(frame.get("fileSha256", "")), str(frame.get("rgbaSha256", "")), canonical_rgba_sha,
		]
	return _sha256_text(source_set_lines)


static func _read_json_dictionary(path: String, label: String, errors: Array[String]) -> Dictionary:
	if path == "" or not FileAccess.file_exists(path):
		errors.append("缺少%s：%s" % [label, path])
		return {}
	var parsed = JSON.parse_string(FileAccess.get_file_as_string(path))
	if not (parsed is Dictionary):
		errors.append("%s不是有效 JSON 对象：%s" % [label, path])
		return {}
	return parsed as Dictionary


static func _quoted_setting(contents: String, key: String) -> String:
	var marker := "%s=\"" % key
	var marker_start := contents.find(marker)
	if marker_start < 0:
		return ""
	var value_start := marker_start + marker.length()
	var value_end := contents.find("\"", value_start)
	return contents.substr(value_start, value_end - value_start) if value_end >= 0 else ""


static func _is_sha256(value: String) -> bool:
	var normalized := value.strip_edges().to_lower()
	if normalized.length() != 64:
		return false
	for index in range(normalized.length()):
		if not "0123456789abcdef".contains(normalized.substr(index, 1)):
			return false
	return true


static func _is_valid_appearance_id(value: String) -> bool:
	if (
		value == ""
		or value != value.strip_edges()
		or not value.begins_with("npc_")
		or value.ends_with("_")
		or value.contains("__")
		or value.length() > 80
	):
		return false
	for index in range(value.length()):
		if not "abcdefghijklmnopqrstuvwxyz0123456789_".contains(value.substr(index, 1)):
			return false
	var version_marker := value.rfind("_v")
	if version_marker <= "npc_".length():
		return false
	var version_text := value.substr(version_marker + 2)
	return version_text.is_valid_int() and int(version_text) >= 1


static func _resource_path(repo_relative_path: String) -> String:
	var normalized := repo_relative_path.strip_edges().replace("\\", "/")
	var prefix := "client/godot/"
	if normalized.begins_with(prefix) and _is_safe_repo_relative_path(normalized):
		return "res://%s" % normalized.substr(prefix.length())
	return ""


static func _is_safe_repo_relative_path(path: String) -> bool:
	var normalized := path.strip_edges()
	return (
		normalized.begins_with("client/godot/assets/npcs/")
		and not normalized.begins_with("/")
		and not normalized.contains("\\")
		and not normalized.contains("../")
		and not normalized.contains("//")
	)


static func _is_safe_relative_asset_path(path: String) -> bool:
	var normalized := path.strip_edges()
	return (
		normalized != ""
		and normalized != ".."
		and not normalized.begins_with("/")
		and not normalized.begins_with("res://")
		and not normalized.contains("\\")
		and not normalized.contains("../")
		and not normalized.ends_with("/..")
		and not normalized.contains("//")
	)


static func _is_safe_tracked_repo_path(path: String) -> bool:
	var normalized := path.strip_edges().replace("\\", "/")
	return (
		normalized != ""
		and not normalized.is_absolute_path()
		and not normalized.begins_with(".run/")
		and not normalized.contains("../")
		and not normalized.contains("//")
	)


static func _is_utc_timestamp(value: String) -> bool:
	var expression := RegEx.new()
	if expression.compile("^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]+)?Z$") != OK:
		return false
	return expression.search(value) != null


static func _int_pair(value) -> Vector2i:
	if not (value is Array) or (value as Array).size() != 2:
		return Vector2i(-1, -1)
	var values := value as Array
	return Vector2i(int(values[0]), int(values[1]))


static func _string_array(value) -> Array[String]:
	var result: Array[String] = []
	if value is Array:
		for item in value as Array:
			result.append(str(item))
	return result


static func _dictionary_has_exact_keys(value: Dictionary, expected_keys: Array) -> bool:
	if value.size() != expected_keys.size():
		return false
	for key_value in expected_keys:
		if not value.has(str(key_value)):
			return false
	return true


static func _image_signature(image: Image) -> String:
	var rgba := _rgba8_image_copy(image)
	var context := HashingContext.new()
	context.start(HashingContext.HASH_SHA256)
	context.update(("%dx%d:RGBA\n" % [rgba.get_width(), rgba.get_height()]).to_utf8_buffer())
	context.update(rgba.get_data())
	return context.finish().hex_encode()


static func _canonical_image_signature(image: Image) -> String:
	var rgba := _rgba8_image_copy(image)
	var bytes := rgba.get_data()
	for offset in range(0, bytes.size(), 4):
		if int(bytes[offset + 3]) < 255:
			bytes[offset] = 0
			bytes[offset + 1] = 0
			bytes[offset + 2] = 0
	var context := HashingContext.new()
	context.start(HashingContext.HASH_SHA256)
	context.update(("%dx%d:RGBA\n" % [rgba.get_width(), rgba.get_height()]).to_utf8_buffer())
	context.update(bytes)
	return context.finish().hex_encode()


static func _sha256_text(value: String) -> String:
	var context := HashingContext.new()
	context.start(HashingContext.HASH_SHA256)
	context.update(value.to_utf8_buffer())
	return context.finish().hex_encode()


static func _rgba8_image_copy(image: Image) -> Image:
	var rgba := image.duplicate() as Image
	if rgba.is_compressed():
		rgba.decompress()
	if rgba.get_format() != Image.FORMAT_RGBA8:
		rgba.convert(Image.FORMAT_RGBA8)
	return rgba


static func _is_number(value) -> bool:
	return typeof(value) == TYPE_INT or typeof(value) == TYPE_FLOAT


static func _fraction_matches(value: String, expected: float) -> bool:
	var parts := value.strip_edges().split("/", false)
	if parts.size() != 2 or not str(parts[0]).is_valid_float() or not str(parts[1]).is_valid_float():
		return false
	var denominator := float(str(parts[1]))
	return denominator != 0.0 and absf(float(str(parts[0])) / denominator - expected) <= 0.0001


static func _is_json_integer(value) -> bool:
	if not _is_number(value):
		return false
	var number := float(value)
	return is_finite(number) and number == floor(number)


static func _is_numeric_pair(value) -> bool:
	return (
		value is Array
		and (value as Array).size() == 2
		and _is_number((value as Array)[0])
		and _is_number((value as Array)[1])
	)


static func _is_integer_pair(value) -> bool:
	return (
		value is Array
		and (value as Array).size() == 2
		and _is_json_integer((value as Array)[0])
		and _is_json_integer((value as Array)[1])
	)
