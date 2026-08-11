extends RefCounted

const PetArtCatalog := preload("res://scripts/pet/pet_art_catalog.gd")

const DATA_PATH := "res://data/pet_battle_release_registry_v1.json"
const RUNTIME_CACHE_PATH := "res://data/pet_battle_release_runtime_cache_v1.json"
const REGISTRY_ID := "pet_battle_exact_form_release_v1"
const RUNTIME_CACHE_ID := "pet_battle_release_runtime_cache_v1"
const RUNTIME_CACHE_CONTRACT_ID := "beastbound_pet_battle_runtime_cache_v1"
const CANONICAL_JSON_CONTRACT_ID := "beastbound_sorted_compact_safe_integer_json_utf8_v2"
const MAX_SAFE_JSON_INTEGER := 9007199254740991

const STATE_UNINITIALIZED := "UNINITIALIZED"
const STATE_READY := "READY"
const STATE_FAILED := "FAILED"

const RELEASE_MODE_FORMAL := "formal_exact_asset"
const RELEASE_MODE_LEGACY := "legacy_exact_asset"
const RELEASE_MODE_PLACEHOLDER := "procedural_placeholder"
const LEGACY_EXCEPTION_ID := "legacy_bui_novice_battle_canary_v1"
const LEGACY_FORM_ID := "bui_novice_sprout_earth5_wind5"
const EXPECTED_RUNTIME_FRAME_COUNT := 180
const FORMAL_BATTLE_ACTIONS: Array[String] = [
	"idle", "walk", "attack", "skill", "hurt", "defend",
	"dodge", "counter", "stagger", "knockaway", "down", "revive",
]
const LEGACY_BATTLE_ACTIONS: Array[String] = [
	"idle", "walk", "attack", "hurt", "defend", "stagger", "down",
]
const FORMAL_BATTLE_VIEWS: Array[String] = [
	"front_3quarter_sw", "back_3quarter_ne",
]
const FORMAL_BATTLE_FRAME_COUNTS := {
	"idle": 6,
	"walk": 8,
	"attack": 8,
	"skill": 8,
	"hurt": 6,
	"defend": 6,
	"dodge": 8,
	"counter": 8,
	"stagger": 8,
	"knockaway": 8,
	"down": 8,
	"revive": 8,
}

const CACHE_TOP_LEVEL_KEYS: Array[String] = [
	"schemaVersion", "cacheId", "registryId", "canonicalJsonContractId",
	"releaseSubjectSha256", "sourceRuntimeFrameContract",
	"canonicalParityVectors", "entries",
]
const REGISTRY_TOP_LEVEL_KEYS: Array[String] = [
	"schemaVersion", "registryId", "scope", "policy", "coverageContract",
	"formalReleaseEntries", "legacyCompatibilityExceptions", "runtimeCache",
]
const COVERAGE_CONTRACT_KEYS: Array[String] = [
	"source", "formalWildTrainingExpectedCount", "formalWildTrainingDerivedSetSha256",
]
const FORMAL_ENTRY_KEYS: Array[String] = [
	"formId", "artSkeletonId", "petRoot", "metadataPath", "metadataSha256",
	"battleRuntimeRoot", "battleBundleDigest", "battleRuntimeDigest",
	"battleRuntimeTreeSha256", "battleInstallManifestSha256", "releaseAuthority",
]
const LEGACY_ENTRY_KEYS: Array[String] = [
	"exceptionId", "formId", "formalRelease", "compatibilityOnly", "artSkeletonId",
	"petRoot", "metadataPath", "metadataSha256", "battleRuntimeRoot",
	"battleBundleDigest", "battleRuntimeTreeSha256", "battleInstallManifestSha256",
	"legacyBattleActionIds", "reason",
]
const RELEASE_AUTHORITY_REFERENCE_KEYS: Array[String] = [
	"kind", "path", "sha256",
]
const CACHE_ENTRY_KEYS: Array[String] = [
	"formId", "releaseMode", "formalRelease", "compatibilityException",
	"assetFormId", "catalogStatus", "catalogRuntimeEnabled", "artSkeletonId",
	"petRoot", "battleRuntimeRoot", "battleRuntimeTreeSha256",
	"sourceRuntimeFrameCount", "normalBattleActionIds", "releaseEntrySha256",
]

static var _state: String = STATE_UNINITIALIZED
static var _registry: Dictionary = {}
static var _runtime_cache: Dictionary = {}
static var _registry_raw_sha256: String = ""
static var _runtime_cache_raw_sha256: String = ""
static var _initialization_errors: Array[String] = []
static var _decisions_by_form: Dictionary = {}
static var _cache_entries_by_form: Dictionary = {}
static var _summary: Dictionary = {
	"ok": false,
	"state": STATE_UNINITIALIZED,
	"registryId": "",
	"runtimeCacheId": "",
	"formalFormIds": [],
	"legacyCompatibilityFormIds": [],
	"errors": ["standalone 宠物战斗发布门尚未初始化"],
}


static func initialize() -> bool:
	if _state == STATE_READY:
		return true
	if _state == STATE_FAILED:
		return false

	# Fail closed before performing any startup reads. A failed initialization is
	# sticky for this process and never falls back to lazy battle-path I/O.
	_state = STATE_FAILED
	_registry = {}
	_runtime_cache = {}
	_registry_raw_sha256 = ""
	_runtime_cache_raw_sha256 = ""
	_initialization_errors = []
	_decisions_by_form = {}
	_cache_entries_by_form = {}

	var registry_snapshot := _read_json_snapshot(DATA_PATH, "release registry")
	var cache_snapshot := _read_json_snapshot(RUNTIME_CACHE_PATH, "runtime cache")
	_registry_raw_sha256 = str(registry_snapshot.get("sha256", "")).to_lower()
	_runtime_cache_raw_sha256 = str(cache_snapshot.get("sha256", "")).to_lower()
	_initialization_errors.append_array(_string_array(registry_snapshot.get("errors", [])))
	_initialization_errors.append_array(_string_array(cache_snapshot.get("errors", [])))
	_registry = _dict(registry_snapshot.get("document", {}))
	_runtime_cache = _dict(cache_snapshot.get("document", {}))
	if not _registry.is_empty():
		_initialization_errors.append_array(_registry_structure_errors(_registry))
	if not _runtime_cache.is_empty():
		_initialization_errors.append_array(
			_runtime_cache_errors(
				_runtime_cache,
				str(cache_snapshot.get("sha256", "")).to_lower()
			)
		)
	if _initialization_errors.is_empty():
		_initialization_errors.append_array(_catalog_binding_errors())
	if _initialization_errors.is_empty():
		_build_ready_decisions()
		_state = STATE_READY
	_update_summary()
	return _state == STATE_READY


static func initialization_state() -> String:
	return _state


static func is_battle_runtime_allowed(form_id: String) -> bool:
	# This is the hot-path contract: no FileAccess, ResourceLoader, hashing,
	# metadata parsing, catalog scan, placeholder allocation, or lazy retry.
	if _state != STATE_READY:
		return false
	var normalized := form_id.strip_edges()
	if normalized == "":
		return false
	var decision = _decisions_by_form.get(normalized, null)
	return (
		decision is Dictionary
		and _is_true_bool((decision as Dictionary).get("allowed", null))
	)


static func is_formal_battle_release(form_id: String) -> bool:
	if _state != STATE_READY:
		return false
	var decision = _decisions_by_form.get(form_id.strip_edges(), null)
	return (
		decision is Dictionary
		and _is_true_bool((decision as Dictionary).get("formalRelease", null))
	)


static func battle_visual_resolution(form_id: String) -> Dictionary:
	return battle_access_decision(form_id)


static func battle_access_decision(form_id: String) -> Dictionary:
	var normalized := form_id.strip_edges()
	if _state == STATE_READY:
		var decision = _decisions_by_form.get(normalized, null)
		if decision is Dictionary:
			return (decision as Dictionary).duplicate(true)
	var reason := "release_gate_uninitialized"
	if _state == STATE_FAILED:
		reason = "release_gate_failed"
	elif normalized == "":
		reason = "empty_form_id"
	elif _state == STATE_READY:
		reason = "no_exact_form_release"
	return _placeholder_decision(normalized, reason, _initialization_errors)


static func release_cache_entry(form_id: String) -> Dictionary:
	if _state != STATE_READY:
		return {}
	var value = _cache_entries_by_form.get(form_id.strip_edges(), null)
	return (value as Dictionary).duplicate(true) if value is Dictionary else {}


static func validation_errors() -> Array[String]:
	if _state == STATE_UNINITIALIZED:
		return ["standalone 宠物战斗发布门尚未初始化"]
	var errors: Array[String] = _initialization_errors.duplicate()
	if _state == STATE_READY:
		errors.append_array(contract_self_test_errors())
	return errors


static func release_summary() -> Dictionary:
	return _summary.duplicate(true)


static func contract_self_test_errors() -> Array[String]:
	var errors: Array[String] = []
	if _state != STATE_READY:
		return errors
	var unknown_id := "tampered_unknown_form"
	var unknown := battle_access_decision(unknown_id)
	if (
		bool(unknown.get("allowed", true))
		or str(unknown.get("releaseMode", "")) != RELEASE_MODE_PLACEHOLDER
		or str(unknown.get("assetFormId", "")) != ""
		or str(unknown.get("placeholderFormId", "")) != unknown_id
	):
		errors.append("未知 form 篡改没有回到自身 procedural placeholder")

	var records := PetArtCatalog.all_form_records()
	for released_value in _cache_entries_by_form.values():
		if not (released_value is Dictionary):
			continue
		var released := released_value as Dictionary
		for sibling in records:
			if (
				str(sibling.get("formId", "")) != str(released.get("formId", ""))
				and str(sibling.get("artSkeletonId", ""))
					== str(released.get("artSkeletonId", ""))
			):
				var sibling_id := str(sibling.get("formId", ""))
				var sibling_decision := battle_access_decision(sibling_id)
				if (
					bool(sibling_decision.get("allowed", true))
					or str(sibling_decision.get("assetFormId", "")) != ""
					or str(sibling_decision.get("placeholderFormId", "")) != sibling_id
				):
					errors.append("共享 artSkeletonId 的兄弟 form 错借了另一形态的发布证明")
				return errors
	return errors


static func _runtime_cache_errors(cache: Dictionary, cache_raw_sha256: String) -> Array[String]:
	var errors: Array[String] = []
	_expect_keys(errors, cache, CACHE_TOP_LEVEL_KEYS, "runtime cache")
	_expect_equal(errors, cache.get("schemaVersion", null), 1, "runtime cache schemaVersion")
	_expect_equal(errors, str(cache.get("cacheId", "")), RUNTIME_CACHE_ID, "runtime cacheId")
	_expect_equal(errors, str(cache.get("registryId", "")), REGISTRY_ID, "runtime cache registryId")
	_expect_equal(
		errors,
		str(cache.get("canonicalJsonContractId", "")),
		CANONICAL_JSON_CONTRACT_ID,
		"runtime cache canonical JSON contract"
	)

	var cache_reference := _dict(_registry.get("runtimeCache", {}))
	_expect_keys(errors, cache_reference, ["contractId", "path", "sha256"], "registry runtimeCache")
	_expect_equal(
		errors,
		str(cache_reference.get("contractId", "")),
		RUNTIME_CACHE_CONTRACT_ID,
		"registry runtimeCache contractId"
	)
	_expect_equal(
		errors,
		str(cache_reference.get("path", "")),
		"client/godot/data/pet_battle_release_runtime_cache_v1.json",
		"registry runtimeCache path"
	)
	_expect_equal(
		errors,
		str(cache_reference.get("sha256", "")).to_lower(),
		cache_raw_sha256,
		"registry runtimeCache raw SHA-256"
	)
	if not _is_sha256(cache_raw_sha256):
		errors.append("runtime cache raw SHA-256 无效")

	var subject := _registry.duplicate(true)
	subject.erase("runtimeCache")
	var subject_sha := canonical_json_sha256(subject)
	_expect_equal(
		errors,
		str(cache.get("releaseSubjectSha256", "")).to_lower(),
		subject_sha,
		"runtime cache release-subject SHA-256"
	)
	if not _is_sha256(subject_sha):
		errors.append("runtime cache release-subject SHA-256 无效")

	var frame_contract := _dict(cache.get("sourceRuntimeFrameContract", {}))
	_expect_keys(
		errors,
		frame_contract,
		["views", "actions", "frameCounts", "expectedFrameCount"],
		"source runtime frame contract"
	)
	_append_string_array_structure_errors(errors, frame_contract.get("views", null), "source runtime views")
	_append_string_array_structure_errors(errors, frame_contract.get("actions", null), "source runtime actions")
	_expect_equal(errors, _string_array(frame_contract.get("views", [])), FORMAL_BATTLE_VIEWS, "source runtime views")
	_expect_equal(errors, _string_array(frame_contract.get("actions", [])), FORMAL_BATTLE_ACTIONS, "source runtime actions")
	_expect_equal(errors, _dict(frame_contract.get("frameCounts", {})), FORMAL_BATTLE_FRAME_COUNTS, "source runtime frame counts")
	_expect_equal(errors, int(frame_contract.get("expectedFrameCount", 0)), EXPECTED_RUNTIME_FRAME_COUNT, "source runtime total frame count")

	var expected_vectors := _expected_canonical_parity_vectors()
	_append_dictionary_array_structure_errors(
		errors,
		cache.get("canonicalParityVectors", null),
		"canonical parity vectors"
	)
	_expect_equal(errors, cache.get("canonicalParityVectors", []), expected_vectors, "canonical parity vectors")
	for vector in _dictionary_array(cache.get("canonicalParityVectors", [])):
		_expect_equal(
			errors,
			canonical_json_sha256(vector.get("value", null)),
			str(vector.get("sha256", "")).to_lower(),
			"canonical parity vector %s" % str(vector.get("id", ""))
		)

	var expected_entry_count := _dictionary_array(_registry.get("formalReleaseEntries", [])).size()
	expected_entry_count += _dictionary_array(_registry.get("legacyCompatibilityExceptions", [])).size()
	var entries := _dictionary_array(cache.get("entries", []))
	_append_dictionary_array_structure_errors(errors, cache.get("entries", null), "runtime cache entries")
	_expect_equal(errors, entries.size(), expected_entry_count, "runtime cache entry count")
	var seen_ids: Dictionary = {}
	for entry in entries:
		_expect_keys(errors, entry, CACHE_ENTRY_KEYS, "runtime cache entry")
		var form_id := str(entry.get("formId", "")).strip_edges()
		_append_string_array_structure_errors(
			errors,
			entry.get("normalBattleActionIds", null),
			"runtime cache normalBattleActionIds %s" % form_id
		)
		if form_id == "" or seen_ids.has(form_id):
			errors.append("runtime cache formId 为空或重复：%s" % form_id)
			continue
		seen_ids[form_id] = true
		var formal_matches := _entries_for_form(_registry.get("formalReleaseEntries", []), form_id)
		var legacy_matches := _entries_for_form(
			_registry.get("legacyCompatibilityExceptions", []),
			form_id
		)
		if formal_matches.size() + legacy_matches.size() != 1:
			errors.append("runtime cache entry 没有唯一 exact-form registry 来源：%s" % form_id)
			continue
		if formal_matches.size() == 1:
			errors.append_array(_cache_entry_binding_errors(entry, formal_matches[0], true))
		else:
			errors.append_array(_cache_entry_binding_errors(entry, legacy_matches[0], false))
	return errors


static func _cache_entry_binding_errors(
	cache_entry: Dictionary,
	release_entry: Dictionary,
	formal_release: bool
) -> Array[String]:
	var errors: Array[String] = []
	var form_id := str(release_entry.get("formId", ""))
	var expected_actions := (
		FORMAL_BATTLE_ACTIONS
		if formal_release
		else _string_array(release_entry.get("legacyBattleActionIds", []))
	)
	_expect_equal(errors, str(cache_entry.get("formId", "")), form_id, "cache formId")
	_expect_equal(errors, str(cache_entry.get("assetFormId", "")), form_id, "cache assetFormId")
	_expect_equal(errors, cache_entry.get("formalRelease", null), formal_release, "cache formalRelease")
	_expect_equal(errors, cache_entry.get("compatibilityException", null), not formal_release, "cache compatibilityException")
	_expect_equal(errors, str(cache_entry.get("releaseMode", "")), RELEASE_MODE_FORMAL if formal_release else RELEASE_MODE_LEGACY, "cache releaseMode")
	_expect_equal(errors, str(cache_entry.get("catalogStatus", "")), PetArtCatalog.STATUS_APPROVED if formal_release else PetArtCatalog.STATUS_IN_PRODUCTION, "cache catalogStatus")
	_expect_equal(errors, cache_entry.get("catalogRuntimeEnabled", null), true, "cache catalogRuntimeEnabled")
	_expect_equal(errors, str(cache_entry.get("artSkeletonId", "")), str(release_entry.get("artSkeletonId", "")), "cache artSkeletonId")
	_expect_equal(errors, str(cache_entry.get("petRoot", "")), str(release_entry.get("petRoot", "")), "cache petRoot")
	_expect_equal(errors, str(cache_entry.get("battleRuntimeRoot", "")), "views", "cache battle runtime root")
	_expect_equal(errors, str(cache_entry.get("battleRuntimeRoot", "")), str(release_entry.get("battleRuntimeRoot", "")), "cache registry battle runtime root")
	_expect_equal(errors, str(cache_entry.get("battleRuntimeTreeSha256", "")).to_lower(), str(release_entry.get("battleRuntimeTreeSha256", "")).to_lower(), "cache runtime tree SHA-256")
	_expect_equal(errors, int(cache_entry.get("sourceRuntimeFrameCount", 0)), EXPECTED_RUNTIME_FRAME_COUNT, "cache source runtime frame count")
	_expect_equal(errors, _string_array(cache_entry.get("normalBattleActionIds", [])), expected_actions, "cache normal battle actions")
	_expect_equal(errors, str(cache_entry.get("releaseEntrySha256", "")).to_lower(), canonical_json_sha256(release_entry), "cache release-entry SHA-256")
	return errors


static func _catalog_binding_errors() -> Array[String]:
	var errors: Array[String] = []
	var entries := _dictionary_array(_runtime_cache.get("entries", []))
	var cached_ids: Dictionary = {}
	for entry in entries:
		var form_id := str(entry.get("formId", "")).strip_edges()
		cached_ids[form_id] = true
		var record := PetArtCatalog.form_record(form_id)
		var pet_record := _dict(record.get("pet", {}))
		_expect_equal(errors, str(record.get("formId", "")), form_id, "catalog formId")
		_expect_equal(errors, str(record.get("status", "")), str(entry.get("catalogStatus", "")), "catalog status")
		_expect_equal(errors, record.get("runtimeEnabled", null), true, "catalog runtimeEnabled")
		_expect_equal(errors, str(record.get("artSkeletonId", "")), str(entry.get("artSkeletonId", "")), "catalog artSkeletonId")
		_expect_equal(errors, str(pet_record.get("root", "")), str(entry.get("petRoot", "")), "catalog pet.root")
	for record in PetArtCatalog.all_form_records():
		if bool(record.get("runtimeEnabled", false)):
			var runtime_form_id := str(record.get("formId", "")).strip_edges()
			if not cached_ids.has(runtime_form_id):
				errors.append("catalog runtimeEnabled 形态没有 startup cache exact-form 证明：%s" % runtime_form_id)
	return errors


static func _build_ready_decisions() -> void:
	for entry in _dictionary_array(_runtime_cache.get("entries", [])):
		var form_id := str(entry.get("formId", "")).strip_edges()
		var formal_release: bool = entry.get("formalRelease", false)
		var compatibility_exception: bool = entry.get("compatibilityException", false)
		_cache_entries_by_form[form_id] = entry.duplicate(true)
		_decisions_by_form[form_id] = {
			"allowed": true,
			"formalRelease": formal_release,
			"compatibilityException": compatibility_exception,
			"releaseMode": str(entry.get("releaseMode", "")),
			"requestedFormId": form_id,
			"assetFormId": form_id,
			"placeholderFormId": "",
			"reason": (
				"exact_form_release_cache_ready"
				if formal_release
				else "legacy_compatibility_cache_ready"
			),
			"runtimeTreeFrameCount": int(entry.get("sourceRuntimeFrameCount", 0)),
			"runtimeTreeSha256": str(entry.get("battleRuntimeTreeSha256", "")),
			"runtimeTreeVerificationUsec": 0,
			"cacheBacked": true,
			"errors": [],
		}


static func _update_summary() -> void:
	var formal_ids: Array[String] = []
	var legacy_ids: Array[String] = []
	if _state == STATE_READY:
		for decision_value in _decisions_by_form.values():
			if not (decision_value is Dictionary):
				continue
			var decision := decision_value as Dictionary
			if _is_true_bool(decision.get("formalRelease", null)):
				formal_ids.append(str(decision.get("requestedFormId", "")))
			else:
				legacy_ids.append(str(decision.get("requestedFormId", "")))
	formal_ids.sort()
	legacy_ids.sort()
	_summary = {
		"ok": _state == STATE_READY,
		"state": _state,
		"registryId": str(_registry.get("registryId", "")),
		"runtimeCacheId": str(_runtime_cache.get("cacheId", "")),
		"registryRawSha256": _registry_raw_sha256,
		"runtimeCacheRawSha256": _runtime_cache_raw_sha256,
		"releaseSubjectSha256": str(_runtime_cache.get("releaseSubjectSha256", "")),
		"formalFormIds": formal_ids,
		"legacyCompatibilityFormIds": legacy_ids,
		"errors": _initialization_errors.duplicate(),
	}


static func _registry_structure_errors(document: Dictionary) -> Array[String]:
	var errors: Array[String] = []
	_expect_keys(errors, document, REGISTRY_TOP_LEVEL_KEYS, "release registry")
	_expect_equal(errors, document.get("schemaVersion", null), 1, "registry schemaVersion")
	_expect_equal(errors, str(document.get("registryId", "")), REGISTRY_ID, "registryId")
	_expect_equal(errors, str(document.get("scope", "")), "standalone_pet_battle", "registry scope")
	_expect_equal(
		errors,
		_dict(document.get("policy", {})),
		{
			"exactFormOnly": true,
			"skeletonFallbackAllowed": false,
			"unknownFormFallback": "same_actor_procedural_placeholder",
			"inProductionRuntimeSwitchAllowed": false,
		},
		"registry fail-closed policy"
	)
	_expect_keys(
		errors,
		_dict(document.get("coverageContract", {})),
		COVERAGE_CONTRACT_KEYS,
		"registry coverageContract"
	)
	var formal_entries := _dictionary_array(document.get("formalReleaseEntries", []))
	var legacy_entries := _dictionary_array(document.get("legacyCompatibilityExceptions", []))
	_append_dictionary_array_structure_errors(
		errors,
		document.get("formalReleaseEntries", null),
		"formalReleaseEntries"
	)
	_append_dictionary_array_structure_errors(
		errors,
		document.get("legacyCompatibilityExceptions", null),
		"legacyCompatibilityExceptions"
	)
	for entry in formal_entries:
		_expect_keys(errors, entry, FORMAL_ENTRY_KEYS, "formal release entry")
		_expect_keys(
			errors,
			_dict(entry.get("releaseAuthority", {})),
			RELEASE_AUTHORITY_REFERENCE_KEYS,
			"formal release authority"
		)
	for entry in legacy_entries:
		_expect_keys(errors, entry, LEGACY_ENTRY_KEYS, "legacy compatibility entry")
	_expect_equal(errors, legacy_entries.size(), 1, "legacy compatibility exception count")
	if legacy_entries.size() == 1:
		_expect_equal(errors, str(legacy_entries[0].get("exceptionId", "")), LEGACY_EXCEPTION_ID, "legacy exceptionId")
		_expect_equal(errors, str(legacy_entries[0].get("formId", "")), LEGACY_FORM_ID, "legacy formId")
		_expect_equal(errors, _string_array(legacy_entries[0].get("legacyBattleActionIds", [])), LEGACY_BATTLE_ACTIONS, "legacy battle actions")
		_append_string_array_structure_errors(
			errors,
			legacy_entries[0].get("legacyBattleActionIds", null),
			"legacyBattleActionIds"
		)
	var seen: Dictionary = {}
	for entry in formal_entries + legacy_entries:
		var form_id := str(entry.get("formId", "")).strip_edges()
		if form_id == "" or seen.has(form_id):
			errors.append("registry exact-form ID 为空或重复：%s" % form_id)
		seen[form_id] = true
	return errors


static func _expected_canonical_parity_vectors() -> Array:
	return [
		{
			"id": "nested_unicode_v1",
			"value": {
				"array": [3, true, null, "月岚风狐"],
				"object": {"z": "末", "a": "首"},
			},
			"sha256": "d038c9f0bad87d2a6b7e8065d2a1505be286544746d6ff6ebec59d8e51b8453c",
		},
		{
			"id": "release_shape_v1",
			"value": {
				"formId": "wuli_evolved_crystal_earth8_water2",
				"formalRelease": true,
				"frameCount": 180,
				"views": FORMAL_BATTLE_VIEWS,
			},
			"sha256": "75019f51e2ee5d5745095a55613a9dda524f02229bb0a05dcaeafab594d7c6e2",
		},
		{
			"id": "safe_integer_normalization_v2",
			"value": {
				"negativeZero": 0,
				"positiveIntegral": 6,
				"nested": {
					"array": [
						180,
						-MAX_SAFE_JSON_INTEGER,
						MAX_SAFE_JSON_INTEGER,
						false,
					]
				},
			},
			"sha256": "9fcd4265dcff9c1b185150fdf1ed041a384375139506d747b276787487687d71",
		},
	]


static func _read_json_snapshot(path: String, label: String) -> Dictionary:
	var errors: Array[String] = []
	if not FileAccess.file_exists(path):
		return {"document": {}, "sha256": "", "errors": ["%s 不存在：%s" % [label, path]]}
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		return {"document": {}, "sha256": "", "errors": ["%s 无法读取：%s" % [label, path]]}
	var content := file.get_buffer(file.get_length())
	file.close()
	var parsed = JSON.parse_string(content.get_string_from_utf8())
	if not (parsed is Dictionary):
		errors.append("%s 不是 JSON 对象：%s" % [label, path])
	var normalized := normalize_canonical_json(parsed)
	if not bool(normalized.get("ok", false)):
		errors.append(
			"%s 不符合 %s：%s" % [
				label,
				CANONICAL_JSON_CONTRACT_ID,
				str(normalized.get("error", "unknown canonical JSON error")),
			]
		)
	var document = normalized.get("value", {}) if bool(normalized.get("ok", false)) else {}
	if not (document is Dictionary):
		document = {}
	return {
		"document": document,
		"sha256": _sha256_bytes(content),
		"errors": errors,
	}


static func _entries_for_form(value, form_id: String) -> Array[Dictionary]:
	var matches: Array[Dictionary] = []
	for entry in _dictionary_array(value):
		if str(entry.get("formId", "")).strip_edges() == form_id:
			matches.append(entry)
	return matches


static func _placeholder_decision(form_id: String, reason: String, errors: Array[String]) -> Dictionary:
	return {
		"allowed": false,
		"formalRelease": false,
		"compatibilityException": false,
		"releaseMode": RELEASE_MODE_PLACEHOLDER,
		"requestedFormId": form_id,
		"assetFormId": "",
		"placeholderFormId": form_id,
		"reason": reason,
		"errors": errors.duplicate(),
	}


static func normalize_canonical_json(value) -> Dictionary:
	return _normalize_canonical_json_at(value, "$")


static func canonical_json_sha256(value) -> String:
	var normalized := normalize_canonical_json(value)
	if not bool(normalized.get("ok", false)):
		return ""
	return JSON.stringify(normalized.get("value"), "", true, false).sha256_text()


static func canonical_json_equal(actual, expected) -> bool:
	var actual_sha := canonical_json_sha256(actual)
	var expected_sha := canonical_json_sha256(expected)
	return actual_sha != "" and expected_sha != "" and actual_sha == expected_sha


static func _sha256_bytes(value: PackedByteArray) -> String:
	var context := HashingContext.new()
	context.start(HashingContext.HASH_SHA256)
	context.update(value)
	return context.finish().hex_encode()


static func _normalize_canonical_json_at(value, path: String) -> Dictionary:
	match typeof(value):
		TYPE_NIL, TYPE_BOOL, TYPE_STRING:
			return {"ok": true, "value": value, "error": ""}
		TYPE_INT:
			var integer_value := int(value)
			if integer_value < -MAX_SAFE_JSON_INTEGER or integer_value > MAX_SAFE_JSON_INTEGER:
				return {"ok": false, "value": null, "error": "unsafe integer at %s" % path}
			return {"ok": true, "value": integer_value, "error": ""}
		TYPE_FLOAT:
			var float_value := float(value)
			if not is_finite(float_value):
				return {"ok": false, "value": null, "error": "non-finite number at %s" % path}
			if floor(float_value) != float_value:
				return {"ok": false, "value": null, "error": "non-integral number at %s" % path}
			if float_value < -MAX_SAFE_JSON_INTEGER or float_value > MAX_SAFE_JSON_INTEGER:
				return {"ok": false, "value": null, "error": "unsafe integral float at %s" % path}
			return {"ok": true, "value": int(float_value), "error": ""}
		TYPE_ARRAY:
			var normalized_array: Array = []
			var source_array := value as Array
			for index in range(source_array.size()):
				var normalized_item := _normalize_canonical_json_at(
					source_array[index],
					"%s[%d]" % [path, index]
				)
				if not bool(normalized_item.get("ok", false)):
					return normalized_item
				normalized_array.append(normalized_item.get("value"))
			return {"ok": true, "value": normalized_array, "error": ""}
		TYPE_DICTIONARY:
			var normalized_dictionary: Dictionary = {}
			var source_dictionary := value as Dictionary
			for key_value in source_dictionary.keys():
				if typeof(key_value) != TYPE_STRING:
					return {
						"ok": false,
						"value": null,
						"error": "non-string object key at %s" % path,
					}
				var key := str(key_value)
				var normalized_item := _normalize_canonical_json_at(
					source_dictionary[key_value],
					"%s.%s" % [path, key]
				)
				if not bool(normalized_item.get("ok", false)):
					return normalized_item
				normalized_dictionary[key] = normalized_item.get("value")
			return {"ok": true, "value": normalized_dictionary, "error": ""}
		_:
			return {
				"ok": false,
				"value": null,
				"error": "unsupported JSON value type at %s" % path,
			}


static func _expect_equal(errors: Array[String], actual, expected, label: String) -> void:
	if not canonical_json_equal(actual, expected):
		errors.append("%s 不一致：%s != %s" % [label, str(actual), str(expected)])


static func _is_true_bool(value) -> bool:
	return typeof(value) == TYPE_BOOL and value == true


static func _expect_keys(
	errors: Array[String],
	document: Dictionary,
	expected_keys: Array[String],
	label: String
) -> void:
	var actual: Array[String] = []
	for value in document.keys():
		actual.append(str(value))
	var expected := expected_keys.duplicate()
	actual.sort()
	expected.sort()
	_expect_equal(errors, actual, expected, "%s keys" % label)


static func _is_sha256(value: String) -> bool:
	var normalized := value.strip_edges().to_lower()
	if normalized.length() != 64:
		return false
	for character in normalized:
		if not "0123456789abcdef".contains(character):
			return false
	return true


static func _string_array(value) -> Array[String]:
	var result: Array[String] = []
	if value is Array:
		for item in value:
			result.append(str(item))
	return result


static func _dictionary_array(value) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	if value is Array:
		for item in value:
			if item is Dictionary:
				result.append(item as Dictionary)
	return result


static func _append_dictionary_array_structure_errors(
	errors: Array[String],
	value,
	label: String
) -> void:
	if not (value is Array):
		errors.append("%s 必须是数组" % label)
		return
	var values := value as Array
	var dictionary_count := 0
	for item in values:
		if item is Dictionary:
			dictionary_count += 1
	if dictionary_count != values.size():
		errors.append("%s 只能包含 Dictionary，禁止 null/junk" % label)


static func _append_string_array_structure_errors(
	errors: Array[String],
	value,
	label: String
) -> void:
	if not (value is Array):
		errors.append("%s 必须是数组" % label)
		return
	var values := value as Array
	var string_count := 0
	for item in values:
		if item is String:
			string_count += 1
	if string_count != values.size():
		errors.append("%s 只能包含 String，禁止 null/junk" % label)


static func _dict(value) -> Dictionary:
	return value as Dictionary if value is Dictionary else {}
