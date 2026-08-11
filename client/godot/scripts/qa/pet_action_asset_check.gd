extends RefCounted

const PetActionAssetCatalog := preload("res://scripts/pet/pet_action_asset_catalog.gd")
const PetArtCatalog := preload("res://scripts/pet/pet_art_catalog.gd")
const PetBattleReleaseGate := preload("res://scripts/pet/pet_battle_release_gate.gd")
const BattleVisualPresentationModel := preload("res://scripts/battle/battle_visual_presentation_model.gd")
const ASSET_MANIFEST_PATH := "res://assets/asset-manifest.json"
const BUNDLE_META_PATH := "res://assets/pets/novice_sprout_bui/action-bundle-meta.json"
const OWNERSHIP_RECORD_PATH := "res://assets/pets/novice_sprout_bui/identity/source-and-ownership.md"
const EXPORT_EXPECTATION_ENV := "BEASTBOUND_PET_BATTLE_EXPORT_EXPECTATION"
const EXPORT_EXPECTATION_SHA256_ENV := "BEASTBOUND_PET_BATTLE_EXPORT_EXPECTATION_SHA256"
const SOURCE_AUDIT_REPORT_ENV := "BEASTBOUND_PET_BATTLE_SOURCE_AUDIT_REPORT"
const SOURCE_AUDIT_REPORT_SHA256_ENV := "BEASTBOUND_PET_BATTLE_SOURCE_AUDIT_REPORT_SHA256"
const REPO_ROOT_ENV := "BEASTBOUND_PET_BATTLE_REPO_ROOT"
const REPO_ROOT_SHA256_ENV := "BEASTBOUND_PET_BATTLE_REPO_ROOT_SHA256"
const REPO_ROOT_BINDING_CONTRACT_ID := "beastbound_phase404_repo_root_path_utf8_v1"
const EXPORT_EXPECTATION_ID := "beastbound_pet_battle_export_expectation_v3"
const EXPORT_EXPECTATION_CONTRACT_ID := "beastbound_pet_battle_export_expectation_contract_v3"
const EXPORT_PIXEL_CONTRACT_ID := "beastbound_texture_godot47_fix_alpha_edges_raw_rgba8_sha256_v3"
const EXPORT_IMPORT_ORACLE_ID := "beastbound_godot47_fix_alpha_edges_import_oracle_v1"
const EXPORT_FRAME_IMPORT_BINDING_ID := "beastbound_pet_battle_frame_import_binding_v1"
const PINNED_GODOT_VERSION := "4.7.stable.official.5b4e0cb0f"
const PINNED_GODOT_SOURCE_COMMIT := "5b4e0cb0fd279832bbdd69fed5354d4e5ad26f88"
const PINNED_GODOT_EXECUTABLE_SHA256 := "445c6f95030e2ca767dd921be1e91bd99e50c3703f91d22a22cd31216c93a80f"
const GODOT_FIX_ALPHA_THRESHOLD := 20
const GODOT_FIX_ALPHA_RADIUS := 4
const EXPORT_IMPORT_ORACLE_PARITY_SHA256 := "ae5fc15c454fb0916a51dc81c4954eb9b29c5f8b94def59c7412d66669e9eb0d"
const EXPORT_PIXEL_TREE_PARITY_SHA256 := "f028642977cae90a1ba4be683988585f3b73e202252bd50dbc12917296eb1915"
const EXPORT_EXPECTATION_ROOT_KEYS := [
	"schemaVersion",
	"expectationId",
	"contractId",
	"canonicalJsonContractId",
	"pixelContractId",
	"importOracle",
	"importOracleSha256",
	"registrySha256",
	"runtimeCacheSha256",
	"releaseSubjectSha256",
	"sourceAuditReportSha256",
	"forms",
]
const EXPORT_EXPECTATION_FORM_KEYS := [
	"formId",
	"petRoot",
	"releaseMode",
	"formalRelease",
	"normalBattleActionIds",
	"sourceRuntimeTreeSha256",
	"sourceRuntimeFrameCount",
	"expectedFrameCount",
	"expectedImportedPixelTreeSha256",
	"frames",
]
const EXPORT_EXPECTATION_FRAME_KEYS := [
	"path",
	"sourceRepoPath",
	"view",
	"action",
	"frameIndex",
	"width",
	"height",
	"sourceFileSha256",
	"sourceRgba8Sha256",
	"sourceRgba8ByteCount",
	"importOracleSha256",
	"importOptions",
	"expectedImportedRgba8RawSha256",
	"expectedImportedPixelContractSha256",
	"expectedImportedRgba8ByteCount",
	"frameImportBindingSha256",
]
const SOURCE_AUDIT_REPORT_KEYS := [
	"schemaVersion",
	"reportType",
	"scope",
	"catalogPath",
	"registryPath",
	"progressionPath",
	"catalogFormCount",
	"formalWildTrainingFormCount",
	"formalWildTrainingForms",
	"formalWildTrainingDerivation",
	"formalReleaseCount",
	"legacyCompatibilityExceptionCount",
	"runtimeCandidateCount",
	"proceduralPlaceholderCount",
	"policy",
	"runtimeCache",
	"status",
	"errors",
	"runtimeCandidates",
	"forms",
]


static func run(requested_form_id: String = "") -> Dictionary:
	var form_id := requested_form_id.strip_edges()
	if form_id == "":
		form_id = PetActionAssetCatalog.FORM_ID
	var export_expectation_path := OS.get_environment(EXPORT_EXPECTATION_ENV).strip_edges()
	var export_expectation_expected_sha := OS.get_environment(
		EXPORT_EXPECTATION_SHA256_ENV
	).strip_edges().to_lower()
	if export_expectation_path != "" or export_expectation_expected_sha != "":
		return _run_export_expectation(
			form_id,
			export_expectation_path,
			export_expectation_expected_sha
		)
	var explicit_form_requested := requested_form_id.strip_edges() != ""
	var was_runtime_supported := PetArtCatalog.supports_form(form_id)
	var normal_battle_supported_before_preview := PetActionAssetCatalog.supports_form(form_id)
	var normal_release_before_preview := PetBattleReleaseGate.battle_visual_resolution(form_id)
	var preview_enabled_here := false
	if explicit_form_requested or not was_runtime_supported:
		preview_enabled_here = PetActionAssetCatalog.enable_qa_preview_form(form_id)
	var require_full_battle := explicit_form_requested or form_id != PetActionAssetCatalog.FORM_ID
	var errors := PetActionAssetCatalog.validation_errors_for_form(form_id, require_full_battle)
	if (
		normal_battle_supported_before_preview
		!= bool(normal_release_before_preview.get("allowed", false))
	):
		errors.append("普通战斗 supports_form 与 exact-form 发布门结论不一致：%s" % form_id)
	errors.append_array(PetArtCatalog.validation_errors())
	errors.append_array(PetBattleReleaseGate.validation_errors())
	errors.append_array(BattleVisualPresentationModel.validation_errors())
	if form_id == PetActionAssetCatalog.FORM_ID:
		_append_contract_errors(errors)
	var warmed_world := PetActionAssetCatalog.warm_world_form(form_id)
	var world_texture := PetActionAssetCatalog.world_texture_for_elapsed(
		form_id,
		"southwest",
		"walk",
		0.36
	)
	var warmed_battle := PetActionAssetCatalog.warm_battle_form(form_id)
	var battle_texture := PetActionAssetCatalog.texture_for_progress(
		form_id,
		PetActionAssetCatalog.battle_view_for_side("ally"),
		PetActionAssetCatalog.action_for_battle_state("attack", form_id),
		0.62
	)
	var down_texture := PetActionAssetCatalog.texture_for_progress(
		form_id,
		PetActionAssetCatalog.battle_view_for_side("enemy"),
		PetActionAssetCatalog.action_for_battle_state("down", form_id),
		1.0
	)
	var stagger_texture := PetActionAssetCatalog.texture_for_progress(
		form_id,
		PetActionAssetCatalog.battle_view_for_side("ally"),
		PetActionAssetCatalog.action_for_battle_state("wounded_return", form_id),
		0.55
	)
	var normal_runtime_warmed := not preview_enabled_here and warmed_battle
	var normal_runtime_texture_loaded := not preview_enabled_here and battle_texture != null
	if not warmed_world or world_texture == null:
		errors.append("世界跟随动作未能预热或取帧")
	if not warmed_battle or battle_texture == null:
		errors.append("战斗动作未能预热或取帧")
	if down_texture == null:
		errors.append("战斗昏迷末帧未能加载")
	if stagger_texture == null:
		errors.append("致死反击负伤退行帧未能加载")
	if require_full_battle:
		for state in ["skill", "dodge", "counter_attack", "launched", "revive"]:
			var action := PetActionAssetCatalog.action_for_battle_state(state, form_id)
			var texture := PetActionAssetCatalog.texture_for_progress(
				form_id,
				PetActionAssetCatalog.battle_view_for_side("enemy"),
				action,
				0.5
			)
			if texture == null:
				errors.append("十二动作状态未能加载：%s -> %s" % [state, action])
	var battle_actions := PetActionAssetCatalog.battle_actions_for_form(form_id)
	var release_decision := PetBattleReleaseGate.battle_visual_resolution(form_id)
	if form_id == PetActionAssetCatalog.FORM_ID:
		if (
			str(release_decision.get("releaseMode", ""))
				!= PetBattleReleaseGate.RELEASE_MODE_LEGACY
			or bool(release_decision.get("formalRelease", true))
		):
			errors.append("芽耳布伊必须保持非正式 legacy 兼容例外")
		if (
			not PetActionAssetCatalog.is_qa_preview_enabled(form_id)
			and battle_actions != PetActionAssetCatalog.BATTLE_ACTIONS
		):
			errors.append("芽耳布伊普通战斗必须保持 legacy 七动作")
	var battle_frame_count := 0
	for action in battle_actions:
		battle_frame_count += PetActionAssetCatalog.frame_count_for_action(form_id, action) * PetActionAssetCatalog.VIEWS.size()
	if preview_enabled_here:
		PetActionAssetCatalog.disable_qa_preview_form(form_id)
		var normal_battle_supported_after_preview := PetActionAssetCatalog.supports_form(form_id)
		if normal_battle_supported_after_preview != normal_battle_supported_before_preview:
			errors.append("QA preview 改变了普通战斗发布结论：%s" % form_id)
		if not was_runtime_supported and normal_battle_supported_after_preview:
			errors.append("QA 结束后 owner pending 宠物仍可进入普通运行路径：%s" % form_id)
		if (
			form_id == PetActionAssetCatalog.FORM_ID
			and PetActionAssetCatalog.battle_actions_for_form(form_id)
				!= PetActionAssetCatalog.BATTLE_ACTIONS
		):
			errors.append("QA 结束后芽耳布伊没有恢复 legacy 七动作")
		if normal_battle_supported_before_preview:
			var normal_warmed_after_preview := PetActionAssetCatalog.warm_battle_form(form_id)
			var normal_texture_after_preview := PetActionAssetCatalog.texture_for_progress(
				form_id,
				PetActionAssetCatalog.battle_view_for_side("enemy"),
				PetActionAssetCatalog.action_for_battle_state("attack", form_id),
				0.5
			)
			normal_runtime_warmed = normal_warmed_after_preview
			normal_runtime_texture_loaded = normal_texture_after_preview != null
			if not normal_warmed_after_preview or normal_texture_after_preview == null:
				errors.append("关闭 QA preview 后普通 exact-form 战斗路径无法取帧：%s" % form_id)
	return {
		"ok": errors.is_empty(),
		"formId": form_id,
		"artCatalogForms": PetArtCatalog.all_form_records().size(),
		"artCatalogRuntimeForms": PetArtCatalog.runtime_form_records().size(),
		"battleFrameCount": battle_frame_count,
		"battleViews": PetActionAssetCatalog.VIEWS.size(),
		"battleActions": battle_actions.size(),
		"battleReleaseMode": str(release_decision.get("releaseMode", "")),
		"battleReleaseFormal": bool(release_decision.get("formalRelease", false)),
		"battleNormalRuntimeSupported": normal_battle_supported_before_preview,
		"battleNormalRuntimeWarmed": normal_runtime_warmed,
		"battleNormalRuntimeTextureLoaded": normal_runtime_texture_loaded,
		"battleRuntimeTreeFrameCount": int(release_decision.get("runtimeTreeFrameCount", 0)),
		"battleRuntimeTreeSha256": str(release_decision.get("runtimeTreeSha256", "")),
		"battleRuntimeTreeVerificationUsec": int(
			release_decision.get("runtimeTreeVerificationUsec", 0)
		),
		"battleReleaseRegistry": PetBattleReleaseGate.release_summary(),
		"worldFrameCount": 40,
		"worldDirections": 8,
		"worldUsesRuntimeMirroring": false,
		"errors": errors,
	}


static func _run_export_expectation(
	form_id: String,
	expectation_path: String,
	expectation_expected_sha: String
) -> Dictionary:
	var errors: Array[String] = []
	_append_godot47_import_oracle_contract_errors(errors)
	var expectation_snapshot := _read_external_expectation(
		expectation_path,
		expectation_expected_sha,
		errors
	)
	var expectation := _dict(expectation_snapshot.get("document", {}))
	var expectation_sha := str(expectation_snapshot.get("sha256", "")).to_lower()
	var source_audit_report_path := OS.get_environment(SOURCE_AUDIT_REPORT_ENV).strip_edges()
	var source_audit_report_expected_sha := OS.get_environment(
		SOURCE_AUDIT_REPORT_SHA256_ENV
	).strip_edges().to_lower()
	var source_audit_snapshot := _read_external_expectation(
		source_audit_report_path,
		source_audit_report_expected_sha,
		errors
	)
	var source_audit_report := _dict(source_audit_snapshot.get("document", {}))
	var source_audit_report_sha := str(source_audit_snapshot.get("sha256", "")).to_lower()
	if (
		expectation_path.strip_edges().replace("\\", "/").simplify_path().get_base_dir()
		!= source_audit_report_path.strip_edges().replace("\\", "/").simplify_path().get_base_dir()
	):
		errors.append("PCK source audit report 必须与 expectation 位于同一外部目录")
	if (
		expectation_path.strip_edges().replace("\\", "/").simplify_path()
		== source_audit_report_path.strip_edges().replace("\\", "/").simplify_path()
	):
		errors.append("PCK source audit report 与 expectation 必须是两个独立文件")
	var export_working_dir := str(expectation_snapshot.get("workingDir", ""))
	var export_user_root := str(expectation_snapshot.get("userRoot", ""))
	var export_resource_root := str(expectation_snapshot.get("resourceRoot", ""))
	var export_repo_root := str(expectation_snapshot.get("repoRoot", ""))
	var export_repo_root_sha := str(expectation_snapshot.get("repoRootSha256", "")).to_lower()
	var import_oracle := _dict(expectation.get("importOracle", {}))
	var import_oracle_sha := str(expectation.get("importOracleSha256", "")).to_lower()
	var version_info := Engine.get_version_info()
	var engine_version := _runtime_godot_version_contract(version_info)
	var engine_source_commit := str(version_info.get("hash", "")).to_lower()
	if not expectation.is_empty():
		_append_exact_dictionary_key_errors(
			errors,
			expectation,
			EXPORT_EXPECTATION_ROOT_KEYS,
			"PCK export expectation root"
		)
		if not PetBattleReleaseGate.canonical_json_equal(
			expectation.get("schemaVersion", null),
			1
		):
			errors.append("PCK export expectation schemaVersion 必须为 1")
		if str(expectation.get("expectationId", "")) != EXPORT_EXPECTATION_ID:
			errors.append("PCK export expectationId 不一致")
		if str(expectation.get("contractId", "")) != EXPORT_EXPECTATION_CONTRACT_ID:
			errors.append("PCK export expectation contractId 不一致")
		if (
			str(expectation.get("canonicalJsonContractId", ""))
			!= PetBattleReleaseGate.CANONICAL_JSON_CONTRACT_ID
		):
			errors.append("PCK export expectation canonical JSON contract 不一致")
		if str(expectation.get("pixelContractId", "")) != EXPORT_PIXEL_CONTRACT_ID:
			errors.append("PCK export pixel contract 不一致")
		var expected_oracle := _godot47_import_oracle()
		if not PetBattleReleaseGate.canonical_json_equal(import_oracle, expected_oracle):
			errors.append("PCK export Godot 4.7 import oracle 不一致")
		if (
			not _is_sha256(import_oracle_sha)
			or import_oracle_sha
				!= PetBattleReleaseGate.canonical_json_sha256(import_oracle)
		):
			errors.append("PCK export import oracle SHA-256 不一致")
		if engine_version != PINNED_GODOT_VERSION:
			errors.append("PCK Godot version 不是固定 4.7 build")
		if engine_source_commit != PINNED_GODOT_SOURCE_COMMIT:
			errors.append("PCK Godot source commit 不一致")
		var startup_release_summary := PetBattleReleaseGate.release_summary()
		var registry_sha := str(
			startup_release_summary.get("registryRawSha256", "")
		).to_lower()
		var cache_sha := str(
			startup_release_summary.get("runtimeCacheRawSha256", "")
		).to_lower()
		if not _is_sha256(registry_sha):
			errors.append("startup release registry raw SHA-256 无效")
		if not _is_sha256(cache_sha):
			errors.append("startup runtime cache raw SHA-256 无效")
		if str(expectation.get("registrySha256", "")).to_lower() != registry_sha:
			errors.append("PCK export expectation registry SHA-256 不一致")
		if str(expectation.get("runtimeCacheSha256", "")).to_lower() != cache_sha:
			errors.append("PCK export expectation runtime cache SHA-256 不一致")
		if (
			not _is_canonical_sha256(source_audit_report_sha)
			or source_audit_report_sha != source_audit_report_expected_sha
			or str(expectation.get("sourceAuditReportSha256", ""))
				!= source_audit_report_sha
		):
			errors.append("PCK export expectation source audit raw snapshot SHA-256 不一致")
		_append_source_audit_report_errors(
			errors,
			source_audit_report,
			expectation,
			startup_release_summary
		)
		if (
			str(expectation.get("releaseSubjectSha256", "")).to_lower()
			!= str(startup_release_summary.get("releaseSubjectSha256", "")).to_lower()
		):
			errors.append("PCK export expectation release-subject SHA-256 不一致")

	var release_summary := PetBattleReleaseGate.release_summary()
	var release_form_ids := _string_array(release_summary.get("formalFormIds", []))
	release_form_ids.append_array(
		_string_array(release_summary.get("legacyCompatibilityFormIds", []))
	)
	release_form_ids.sort()
	_append_dictionary_array_structure_errors(
		errors,
		expectation.get("forms", null),
		"PCK export expectation forms"
	)
	var expectation_forms := _dictionary_array(expectation.get("forms", []))
	var expectation_form_ids: Array[String] = []
	var expectation_form: Dictionary = {}
	for value in expectation_forms:
		_append_exact_dictionary_key_errors(
			errors,
			value,
			EXPORT_EXPECTATION_FORM_KEYS,
			"PCK export expectation form"
		)
		var expected_form_id := str(value.get("formId", "")).strip_edges()
		expectation_form_ids.append(expected_form_id)
		if expected_form_id == form_id:
			if not expectation_form.is_empty():
				errors.append("PCK export expectation formId 重复：%s" % form_id)
			expectation_form = value
	expectation_form_ids.sort()
	if expectation_form_ids != release_form_ids:
		errors.append("PCK export expectation exact-form 集合与 startup cache 不一致")
	if expectation_form.is_empty():
		errors.append("PCK export expectation 未覆盖请求 formId：%s" % form_id)

	var cache_entry := PetBattleReleaseGate.release_cache_entry(form_id)
	var release_decision := PetBattleReleaseGate.battle_visual_resolution(form_id)
	if cache_entry.is_empty():
		errors.append("startup cache 未放行请求 formId：%s" % form_id)
	if not expectation_form.is_empty() and not cache_entry.is_empty():
		_append_export_form_binding_errors(errors, expectation_form, cache_entry)

	_append_dictionary_array_structure_errors(
		errors,
		expectation_form.get("frames", null),
		"PCK export expectation frames"
	)
	var expected_frames := _dictionary_array(expectation_form.get("frames", []))
	var frames_by_path: Dictionary = {}
	var expectation_paths_in_contract_order: Array[String] = []
	for frame in expected_frames:
		var path := str(frame.get("path", "")).strip_edges()
		expectation_paths_in_contract_order.append(path)
		if path == "" or frames_by_path.has(path):
			errors.append("PCK export expectation frame path 为空或重复：%s" % path)
		else:
			frames_by_path[path] = frame
	var canonical_paths: Array[String] = []
	for view in PetBattleReleaseGate.FORMAL_BATTLE_VIEWS:
		for action in PetBattleReleaseGate.FORMAL_BATTLE_ACTIONS:
			for frame_index in range(
				1,
				int(PetBattleReleaseGate.FORMAL_BATTLE_FRAME_COUNTS[action]) + 1
			):
				var path := PetActionAssetCatalog.battle_frame_path_for_form(
					form_id,
					view,
					action,
					frame_index
				)
				canonical_paths.append(path)
				var frame := _dict(frames_by_path.get(path, {}))
				if frame.is_empty():
					errors.append("PCK export expectation 缺少规范帧：%s" % path)
					continue
				_append_exact_dictionary_key_errors(
					errors,
					frame,
					EXPORT_EXPECTATION_FRAME_KEYS,
					"PCK export expectation frame"
				)
				if (
					str(frame.get("view", "")) != view
					or str(frame.get("action", "")) != action
					or str(frame.get("sourceRepoPath", ""))
						!= "client/godot/%s" % path.trim_prefix("res://")
					or not PetBattleReleaseGate.canonical_json_equal(
						frame.get("frameIndex", null), frame_index
					)
					or not PetBattleReleaseGate.canonical_json_equal(
						frame.get("width", null), 256
					)
					or not PetBattleReleaseGate.canonical_json_equal(
						frame.get("height", null), 256
					)
				):
					errors.append("PCK export expectation 帧身份/尺寸不一致：%s" % path)
				for digest_key in [
					"sourceFileSha256",
					"sourceRgba8Sha256",
					"importOracleSha256",
					"expectedImportedRgba8RawSha256",
					"expectedImportedPixelContractSha256",
					"frameImportBindingSha256",
				]:
					if not _is_canonical_sha256(str(frame.get(digest_key, ""))):
						errors.append("PCK export expectation 帧摘要无效：%s/%s" % [path, digest_key])
				if (
					not PetBattleReleaseGate.canonical_json_equal(
						frame.get("sourceRgba8ByteCount", null), 256 * 256 * 4
					)
					or not PetBattleReleaseGate.canonical_json_equal(
						frame.get("expectedImportedRgba8ByteCount", null), 256 * 256 * 4
					)
				):
					errors.append("PCK export expectation RGBA8 byte count 不一致：%s" % path)
				if not PetBattleReleaseGate.canonical_json_equal(
					frame.get("importOptions", null), _expected_import_options()
				):
					errors.append("PCK export expectation import options 不一致：%s" % path)
				if str(frame.get("importOracleSha256", "")) != import_oracle_sha:
					errors.append("PCK export expectation 帧 oracle 绑定不一致：%s" % path)
				var frame_binding := _frame_import_binding_document(frame)
				if (
					str(frame.get("frameImportBindingSha256", ""))
						!= PetBattleReleaseGate.canonical_json_sha256(frame_binding)
				):
					errors.append("PCK export expectation 帧 import binding 不一致：%s" % path)
	if expectation_paths_in_contract_order != canonical_paths:
		errors.append("PCK export expectation 帧顺序不是 views/actions/frameIndex 规范顺序")
	var canonical_paths_sorted := canonical_paths.duplicate()
	canonical_paths_sorted.sort()
	var expectation_paths_sorted: Array[String] = []
	for path_value in frames_by_path.keys():
		expectation_paths_sorted.append(str(path_value))
	expectation_paths_sorted.sort()
	if canonical_paths_sorted != expectation_paths_sorted:
		errors.append("PCK export expectation 路径集合不是规范 180 帧 exact-form 集合")
	if canonical_paths.size() != PetBattleReleaseGate.EXPECTED_RUNTIME_FRAME_COUNT:
		errors.append("PCK export 规范帧数不是 180")

	var verified_frames: Array = []
	var texture_frame_count := 0
	for path in canonical_paths:
		var frame := _dict(frames_by_path.get(path, {}))
		if frame.is_empty():
			continue
		if not ResourceLoader.exists(path, "Texture2D"):
			errors.append("PCK 不存在规范 Texture2D：%s" % path)
			continue
		var loaded = ResourceLoader.load(path, "Texture2D")
		if not (loaded is Texture2D):
			errors.append("PCK 规范资源不是 Texture2D：%s" % path)
			continue
		var image := (loaded as Texture2D).get_image()
		if image == null or image.is_empty():
			errors.append("PCK Texture2D 无法读取实际像素：%s" % path)
			continue
		if image.is_compressed() and image.decompress() != OK:
			errors.append("PCK Texture2D 实际像素无法解压：%s" % path)
			continue
		var rgba := image.duplicate() as Image
		if rgba.get_format() != Image.FORMAT_RGBA8:
			errors.append("PCK Texture2D 实际像素格式不是 RGBA8：%s" % path)
			continue
		if rgba.get_width() != 256 or rgba.get_height() != 256:
			errors.append("PCK Texture2D 实际像素不是 256x256：%s" % path)
			continue
		if rgba.get_data().size() != rgba.get_width() * rgba.get_height() * 4:
			errors.append("PCK Texture2D RGBA8 实际像素字节数不一致：%s" % path)
			continue
		var actual_pixels := rgba.get_data()
		var actual_raw_sha := _sha256_bytes(actual_pixels)
		var actual_contract_sha := _imported_pixel_contract_bytes_sha256(
			rgba.get_width(), rgba.get_height(), actual_pixels, import_oracle_sha
		)
		if actual_raw_sha != str(frame.get("expectedImportedRgba8RawSha256", "")):
			errors.append("PCK Texture2D exact imported RGBA8 raw SHA-256 漂移：%s" % path)
			continue
		if (
			actual_contract_sha
			!= str(frame.get("expectedImportedPixelContractSha256", ""))
		):
			errors.append("PCK Texture2D imported pixel contract SHA-256 漂移：%s" % path)
			continue
		verified_frames.append(
			{
				"path": path,
				"sourceFileSha256": str(frame.get("sourceFileSha256", "")),
				"sourceRgba8Sha256": str(frame.get("sourceRgba8Sha256", "")),
				"importOracleSha256": str(frame.get("importOracleSha256", "")),
				"importOptions": frame.get("importOptions", {}),
				"expectedImportedRgba8RawSha256": actual_raw_sha,
				"expectedImportedPixelContractSha256": actual_contract_sha,
				"frameImportBindingSha256": str(frame.get("frameImportBindingSha256", "")),
			}
		)
		texture_frame_count += 1

	var texture_tree_document := {
		"contractId": EXPORT_PIXEL_CONTRACT_ID,
		"formId": form_id,
		"petRoot": str(cache_entry.get("petRoot", "")),
		"frames": verified_frames,
	}
	var texture_tree_sha := PetBattleReleaseGate.canonical_json_sha256(
		texture_tree_document
	)
	if texture_frame_count != PetBattleReleaseGate.EXPECTED_RUNTIME_FRAME_COUNT:
		errors.append(
			"PCK Texture2D 实际像素应完整验证 180 帧，实际 %d" % texture_frame_count
		)
	if (
		not expectation_form.is_empty()
		and texture_tree_sha
				!= str(expectation_form.get("expectedImportedPixelTreeSha256", "")).to_lower()
	):
		errors.append("PCK Texture2D exact imported RGBA8 tree SHA-256 与 expectation 不一致")

	var preview_disabled_before := not PetActionAssetCatalog.is_qa_preview_enabled(form_id)
	var normal_supported := PetActionAssetCatalog.supports_form(form_id)
	var normal_warmed := PetActionAssetCatalog.warm_battle_form(form_id)
	var normal_texture := PetActionAssetCatalog.texture_for_progress(
		form_id,
		PetActionAssetCatalog.battle_view_for_side("enemy"),
		PetActionAssetCatalog.action_for_battle_state("attack", form_id),
		0.5
	)
	var preview_disabled_after := not PetActionAssetCatalog.is_qa_preview_enabled(form_id)
	if not preview_disabled_before or not preview_disabled_after:
		errors.append("PCK export QA 不得开启 QA preview")
	if not bool(release_decision.get("allowed", false)) or not normal_supported:
		errors.append("PCK 普通 exact-form gate 未放行：%s" % form_id)
	if not normal_warmed or normal_texture == null:
		errors.append("PCK 普通 exact-form warm/texture 取帧失败：%s" % form_id)
	if (
		str(release_decision.get("releaseMode", ""))
		!= str(expectation_form.get("releaseMode", ""))
		or not PetBattleReleaseGate.canonical_json_equal(
			release_decision.get("formalRelease", null),
			expectation_form.get("formalRelease", null)
		)
	):
		errors.append("PCK 普通 exact-form release mode 与 expectation 不一致")
	return {
		"ok": errors.is_empty(),
		"formId": form_id,
		"canonicalJsonContractId": PetBattleReleaseGate.CANONICAL_JSON_CONTRACT_ID,
		"exportExpectationId": EXPORT_EXPECTATION_ID,
		"exportExpectationContractId": EXPORT_EXPECTATION_CONTRACT_ID,
		"pixelContractId": EXPORT_PIXEL_CONTRACT_ID,
		"importOracleContractId": EXPORT_IMPORT_ORACLE_ID,
		"importOracleSha256": import_oracle_sha,
		"sourceAuditReportSha256": source_audit_report_sha,
		"expectedGodotVersion": PINNED_GODOT_VERSION,
		"expectedGodotSourceCommit": PINNED_GODOT_SOURCE_COMMIT,
		"expectedGodotExecutableSha256": PINNED_GODOT_EXECUTABLE_SHA256,
		"actualGodotVersion": engine_version,
		"actualGodotSourceCommit": engine_source_commit,
		"importFixAlphaBorder": true,
		"importPremultAlpha": false,
		"exportWorkingDir": export_working_dir,
		"exportUserRoot": export_user_root,
		"exportResourceRoot": export_resource_root,
		"exportRepoRoot": export_repo_root,
		"exportRepoRootSha256": export_repo_root_sha,
		"exportExpectationMode": true,
		"exportExpectationPathAbsolute": expectation_path.is_absolute_path(),
		"exportExpectationExpectedSha256": expectation_expected_sha,
		"exportExpectationSha256": expectation_sha,
		"exportTextureFrameCount": texture_frame_count,
		"exportTextureExpectedFrameCount": PetBattleReleaseGate.EXPECTED_RUNTIME_FRAME_COUNT,
		"exportTextureTreeSha256": texture_tree_sha,
		"exportExpectedImportedPixelTreeSha256": str(
			expectation_form.get("expectedImportedPixelTreeSha256", "")
		),
		"battleFrameCount": texture_frame_count,
		"battleViews": PetBattleReleaseGate.FORMAL_BATTLE_VIEWS.size(),
		"battleActions": PetBattleReleaseGate.FORMAL_BATTLE_ACTIONS.size(),
		"battleReleaseMode": str(release_decision.get("releaseMode", "")),
		"battleReleaseFormal": bool(release_decision.get("formalRelease", false)),
		"battleNormalRuntimeSupported": normal_supported,
		"battleNormalRuntimeWarmed": normal_warmed,
		"battleNormalRuntimeTextureLoaded": normal_texture != null,
		"battleQaPreviewDisabledBefore": preview_disabled_before,
		"battleQaPreviewDisabledAfter": preview_disabled_after,
		"battleRuntimeTreeFrameCount": int(release_decision.get("runtimeTreeFrameCount", 0)),
		"battleRuntimeTreeSha256": str(release_decision.get("runtimeTreeSha256", "")),
		"battleRuntimeTreeVerificationUsec": int(release_decision.get("runtimeTreeVerificationUsec", 0)),
		"battleReleaseRegistry": release_summary,
		"errors": errors,
	}


static func _append_export_form_binding_errors(
	errors: Array[String],
	expectation_form: Dictionary,
	cache_entry: Dictionary
) -> void:
	var bindings := {
		"formId": cache_entry.get("formId", ""),
		"petRoot": cache_entry.get("petRoot", ""),
		"releaseMode": cache_entry.get("releaseMode", ""),
		"formalRelease": cache_entry.get("formalRelease", false),
		"sourceRuntimeTreeSha256": cache_entry.get("battleRuntimeTreeSha256", ""),
		"sourceRuntimeFrameCount": cache_entry.get("sourceRuntimeFrameCount", 0),
	}
	for key_value in bindings.keys():
		var key := str(key_value)
		if not PetBattleReleaseGate.canonical_json_equal(
			expectation_form.get(key, null), bindings[key]
		):
			errors.append("PCK export expectation 与 startup cache 绑定不一致：%s" % key)
	if not PetBattleReleaseGate.canonical_json_equal(
		expectation_form.get("normalBattleActionIds", null),
		cache_entry.get("normalBattleActionIds", null)
	):
		errors.append("PCK export expectation 普通战斗动作集合与 startup cache 不一致")
	if not PetBattleReleaseGate.canonical_json_equal(
		expectation_form.get("expectedFrameCount", null),
		PetBattleReleaseGate.EXPECTED_RUNTIME_FRAME_COUNT
	):
		errors.append("PCK export expectation expectedFrameCount 必须为 180")


static func _append_source_audit_report_errors(
	errors: Array[String],
	report: Dictionary,
	expectation: Dictionary,
	startup_release_summary: Dictionary
) -> void:
	if report.is_empty():
		errors.append("PCK source audit report 缺失或无效")
		return
	_append_exact_dictionary_key_errors(
		errors,
		report,
		SOURCE_AUDIT_REPORT_KEYS,
		"PCK source audit report"
	)
	var expected_facts := {
		"schemaVersion": 1,
		"reportType": "beastbound_pet_battle_exact_form_release_coverage",
		"scope": "standalone_pet_battle",
		"catalogFormCount": 36,
		"formalWildTrainingFormCount": 13,
		"formalReleaseCount": 2,
		"legacyCompatibilityExceptionCount": 1,
		"runtimeCandidateCount": 3,
		"proceduralPlaceholderCount": 33,
		"status": "passed",
		"errors": [],
	}
	for key_value in expected_facts.keys():
		var key := str(key_value)
		if not PetBattleReleaseGate.canonical_json_equal(
			report.get(key, null), expected_facts[key]
		):
			errors.append("PCK source audit report 事实不一致：%s" % key)
	var formal_wild_forms = report.get("formalWildTrainingForms", null)
	if not (formal_wild_forms is Array):
		errors.append("PCK source audit formalWildTrainingForms 必须是数组")
	else:
		var formal_wild_ids: Array[String] = []
		for value in formal_wild_forms as Array:
			if typeof(value) != TYPE_STRING or str(value).strip_edges() == "":
				errors.append("PCK source audit formalWildTrainingForms 含非字符串/空 ID")
				continue
			formal_wild_ids.append(str(value))
		var unique_formal_wild_ids := {}
		for form_id in formal_wild_ids:
			unique_formal_wild_ids[form_id] = true
		if formal_wild_ids.size() != 13 or unique_formal_wild_ids.size() != 13:
			errors.append("PCK source audit formalWildTrainingForms 必须恰好 13 个唯一 ID")
	var runtime_cache := _dict(report.get("runtimeCache", {}))
	if runtime_cache.is_empty():
		errors.append("PCK source audit runtimeCache 事实缺失")
	elif (
		not PetBattleReleaseGate.canonical_json_equal(runtime_cache.get("ok", null), true)
		or str(runtime_cache.get("sha256", ""))
			!= str(expectation.get("runtimeCacheSha256", ""))
		or str(runtime_cache.get("releaseSubjectSha256", ""))
			!= str(expectation.get("releaseSubjectSha256", ""))
		or not PetBattleReleaseGate.canonical_json_equal(runtime_cache.get("entryCount", null), 3)
		or not PetBattleReleaseGate.canonical_json_equal(runtime_cache.get("errors", null), [])
		or str(runtime_cache.get("sha256", ""))
			!= str(startup_release_summary.get("runtimeCacheRawSha256", ""))
	):
		errors.append("PCK source audit runtimeCache 绑定不一致")


static func _read_external_expectation(
	path: String,
	expected_sha256: String,
	errors: Array[String]
) -> Dictionary:
	var working_directory_handle := DirAccess.open(".")
	var working_directory := ""
	if working_directory_handle != null:
		working_directory = working_directory_handle.get_current_dir().replace("\\", "/").simplify_path()
	var resource_root := ProjectSettings.globalize_path("res://").replace("\\", "/").simplify_path()
	var user_root := ProjectSettings.globalize_path("user://").replace("\\", "/").simplify_path()
	var repo_root := OS.get_environment(REPO_ROOT_ENV).strip_edges().replace("\\", "/").simplify_path()
	var repo_root_expected_sha := OS.get_environment(REPO_ROOT_SHA256_ENV).strip_edges().to_lower()
	var snapshot := {
		"document": {},
		"sha256": "",
		"workingDir": working_directory,
		"resourceRoot": resource_root,
		"userRoot": user_root,
		"repoRoot": repo_root,
		"repoRootSha256": repo_root_expected_sha,
	}
	if working_directory == "" or not working_directory.is_absolute_path():
		errors.append("PCK workingDir 必须是绝对路径")
	if resource_root != "":
		errors.append("Godot 4.7 editor --main-pack 的 resourceRoot 事实必须为空")
	if user_root == "" or not user_root.is_absolute_path():
		errors.append("PCK userRoot 必须是绝对路径")
	if repo_root == "" or not repo_root.is_absolute_path():
		errors.append("PCK repoRoot 环境绑定必须是绝对路径")
	if not _is_sha256(repo_root_expected_sha):
		errors.append("PCK repoRoot SHA-256 环境绑定缺失或无效")
	elif (
		_sha256_bytes(("%s\n%s" % [REPO_ROOT_BINDING_CONTRACT_ID, repo_root]).to_utf8_buffer())
		!= repo_root_expected_sha
	):
		errors.append("PCK repoRoot path/SHA 环境绑定不一致")
	var normalized := path.strip_edges().replace("\\", "/")
	if (
		normalized == ""
		or normalized.begins_with("res://")
		or normalized.begins_with("user://")
		or not normalized.is_absolute_path()
	):
		errors.append("PCK export expectation 必须由项目外绝对路径提供")
		return snapshot
	if not _is_sha256(expected_sha256):
		errors.append("PCK export expectation expected SHA-256 缺失或无效")
		return snapshot
	normalized = normalized.simplify_path()
	var expectation_directory := normalized.get_base_dir()
	var forbidden_roots := {
		"workingDir": working_directory,
		"userRoot": user_root,
		"repoRoot": repo_root,
	}
	for root_label_value in forbidden_roots.keys():
		var root_label := str(root_label_value)
		var root := str(forbidden_roots[root_label_value])
		if root != "" and _paths_overlap(expectation_directory, root):
			errors.append("PCK export expectation 不得与 %s 重叠" % root_label)
	if not errors.is_empty():
		return snapshot
	var file := FileAccess.open(normalized, FileAccess.READ)
	if file == null:
		errors.append("PCK export expectation 外部文件不存在")
		return snapshot
	var content := file.get_buffer(file.get_length())
	file.close()
	var actual_sha256 := _sha256_bytes(content)
	snapshot["sha256"] = actual_sha256
	if actual_sha256 != expected_sha256:
		errors.append("PCK export expectation 外部文件 SHA-256 与环境绑定不一致")
		return snapshot
	var parsed = JSON.parse_string(content.get_string_from_utf8())
	if not (parsed is Dictionary):
		errors.append("PCK export expectation 不是有效 JSON 对象")
		return snapshot
	var normalized_document_result := PetBattleReleaseGate.normalize_canonical_json(parsed)
	if not bool(normalized_document_result.get("ok", false)):
		errors.append(
			"PCK export expectation 不符合 %s：%s" % [
				PetBattleReleaseGate.CANONICAL_JSON_CONTRACT_ID,
				str(normalized_document_result.get("error", "unknown canonical JSON error")),
			]
		)
		return snapshot
	var document = normalized_document_result.get("value", {})
	if not (document is Dictionary):
		errors.append("PCK export expectation 规范化结果不是 JSON 对象")
		return snapshot
	snapshot["document"] = document
	return snapshot


static func _path_is_within(path: String, root: String) -> bool:
	var normalized_root := root.trim_suffix("/")
	return path == normalized_root or path.begins_with("%s/" % normalized_root)


static func _paths_overlap(left: String, right: String) -> bool:
	return _path_is_within(left, right) or _path_is_within(right, left)


static func _expected_import_options() -> Dictionary:
	return {
		"importer": "texture",
		"resourceType": "CompressedTexture2D",
		"metadataVramTexture": false,
		"destinationContract": "single_res_imported_ctex",
		"parameterLiterals": {
			"compress/mode": "0",
			"compress/high_quality": "false",
			"compress/lossy_quality": "0.7",
			"compress/uastc_level": "0",
			"compress/rdo_quality_loss": "0.0",
			"compress/hdr_compression": "1",
			"compress/normal_map": "0",
			"compress/channel_pack": "0",
			"mipmaps/generate": "false",
			"mipmaps/limit": "-1",
			"roughness/mode": "0",
			"roughness/src_normal": "\"\"",
			"process/channel_remap/red": "0",
			"process/channel_remap/green": "1",
			"process/channel_remap/blue": "2",
			"process/channel_remap/alpha": "3",
			"process/fix_alpha_border": "true",
			"process/premult_alpha": "false",
			"process/normal_map_invert_y": "false",
			"process/hdr_as_srgb": "false",
			"process/hdr_clamp_exposure": "false",
			"process/size_limit": "0",
			"detect_3d/compress_to": "1",
		},
	}


static func _godot47_import_oracle() -> Dictionary:
	return {
		"schemaVersion": 1,
		"contractId": EXPORT_IMPORT_ORACLE_ID,
		"pixelContractId": EXPORT_PIXEL_CONTRACT_ID,
		"godotVersion": PINNED_GODOT_VERSION,
		"godotSourceCommit": PINNED_GODOT_SOURCE_COMMIT,
		"godotExecutableSha256": PINNED_GODOT_EXECUTABLE_SHA256,
		"sourceImageFormat": "RGBA8",
		"outputImageFormat": "RGBA8",
		"fixAlphaEdges": {
			"sourceCopy": true,
			"alphaEligibleBelow": GODOT_FIX_ALPHA_THRESHOLD,
			"radius": GODOT_FIX_ALPHA_RADIUS,
			"searchShape": "clamped_square",
			"distanceMetric": "squared_euclidean",
			"targetTraversal": "row_major_y_x",
			"candidateTraversal": "row_major_y_x",
			"tieBreak": "first_row_major_candidate",
			"copiedChannels": ["red", "green", "blue"],
			"alphaPreserved": true,
		},
		"importOptions": _expected_import_options(),
		"premultiplyAfterFixAlphaEdges": false,
		"fixAlphaEdgesSourceUrl": (
			"https://github.com/godotengine/godot/blob/%s/core/io/image.cpp#L4259-L4323"
			% PINNED_GODOT_SOURCE_COMMIT
		),
		"textureImporterSourceUrl": (
			"https://github.com/godotengine/godot/blob/%s/editor/import/"
			+ "resource_importer_texture.cpp#L859-L866"
		) % PINNED_GODOT_SOURCE_COMMIT,
	}


static func _runtime_godot_version_contract(version_info: Dictionary) -> String:
	var major: int = int(version_info.get("major", -1))
	var minor: int = int(version_info.get("minor", -1))
	var patch: int = int(version_info.get("patch", -1))
	var status: String = str(version_info.get("status", "")).strip_edges()
	var build: String = str(version_info.get("build", "")).strip_edges()
	var source_hash: String = str(version_info.get("hash", "")).strip_edges().to_lower()
	var version_core := "%d.%d" % [major, minor]
	if patch != 0:
		version_core += ".%d" % patch
	var short_hash := source_hash.substr(0, mini(9, source_hash.length()))
	return "%s.%s.%s.%s" % [version_core, status, build, short_hash]


static func _frame_import_binding_document(frame: Dictionary) -> Dictionary:
	return {
		"contractId": EXPORT_FRAME_IMPORT_BINDING_ID,
		"path": frame.get("path", null),
		"sourceFileSha256": frame.get("sourceFileSha256", null),
		"sourceRgba8Sha256": frame.get("sourceRgba8Sha256", null),
		"importOracleSha256": frame.get("importOracleSha256", null),
		"importOptions": frame.get("importOptions", null),
		"expectedImportedRgba8RawSha256": frame.get(
			"expectedImportedRgba8RawSha256", null
		),
		"expectedImportedPixelContractSha256": frame.get(
			"expectedImportedPixelContractSha256", null
		),
	}


static func _imported_pixel_contract_bytes_sha256(
	width: int,
	height: int,
	pixels: PackedByteArray,
	import_oracle_sha: String
) -> String:
	if width <= 0 or height <= 0 or pixels.size() != width * height * 4:
		return ""
	if not _is_canonical_sha256(import_oracle_sha):
		return ""
	var context := HashingContext.new()
	context.start(HashingContext.HASH_SHA256)
	context.update(
		(
			"%s\n%s\n%dx%d:RGBA8\n"
			% [EXPORT_PIXEL_CONTRACT_ID, import_oracle_sha, width, height]
		).to_utf8_buffer()
	)
	context.update(pixels)
	return context.finish().hex_encode()


static func _godot47_fix_alpha_edges_rgba8(
	pixels: PackedByteArray,
	width: int,
	height: int
) -> PackedByteArray:
	if width <= 0 or height <= 0 or pixels.size() != width * height * 4:
		return PackedByteArray()
	var source_pixels: PackedByteArray = pixels.duplicate()
	var fixed_pixels: PackedByteArray = source_pixels.duplicate()
	for y in range(height):
		for x in range(width):
			var target_offset := (y * width + x) * 4
			if int(source_pixels[target_offset + 3]) >= GODOT_FIX_ALPHA_THRESHOLD:
				continue
			var closest_distance_squared := 0x7fffffff
			var closest_offset := -1
			for candidate_y in range(
				maxi(0, y - GODOT_FIX_ALPHA_RADIUS),
				mini(height, y + GODOT_FIX_ALPHA_RADIUS + 1)
			):
				for candidate_x in range(
					maxi(0, x - GODOT_FIX_ALPHA_RADIUS),
					mini(width, x + GODOT_FIX_ALPHA_RADIUS + 1)
				):
					var candidate_offset := (candidate_y * width + candidate_x) * 4
					if int(source_pixels[candidate_offset + 3]) < GODOT_FIX_ALPHA_THRESHOLD:
						continue
					var delta_y := y - candidate_y
					var delta_x := x - candidate_x
					var distance_squared := delta_y * delta_y + delta_x * delta_x
					if distance_squared >= closest_distance_squared:
						continue
					closest_distance_squared = distance_squared
					closest_offset = candidate_offset
			if closest_offset < 0:
				continue
			fixed_pixels[target_offset] = source_pixels[closest_offset]
			fixed_pixels[target_offset + 1] = source_pixels[closest_offset + 1]
			fixed_pixels[target_offset + 2] = source_pixels[closest_offset + 2]
	return fixed_pixels


static func _premultiply_godot47(pixels: PackedByteArray) -> PackedByteArray:
	var transformed: PackedByteArray = pixels.duplicate()
	for offset in range(0, transformed.size(), 4):
		var alpha := int(transformed[offset + 3])
		for channel in range(3):
			transformed[offset + channel] = (
				(int(transformed[offset + channel]) * alpha + 255) >> 8
			)
	return transformed


static func _append_godot47_import_oracle_contract_errors(errors: Array[String]) -> void:
	var import_oracle := _godot47_import_oracle()
	var import_oracle_sha := PetBattleReleaseGate.canonical_json_sha256(import_oracle)
	if import_oracle_sha != EXPORT_IMPORT_ORACLE_PARITY_SHA256:
		errors.append("PCK Godot 4.7 import oracle 跨语言摘要不一致")
	var square_source := PackedByteArray()
	var square_expected := PackedByteArray()
	for _index in range(24):
		square_source.append_array(PackedByteArray([1, 2, 3, 0]))
		square_expected.append_array(PackedByteArray([200, 201, 202, 0]))
	square_source.append_array(PackedByteArray([200, 201, 202, 20]))
	square_expected.append_array(PackedByteArray([200, 201, 202, 20]))
	var vectors := [
		{
			"id": "threshold_alpha_0_1_19_20_255",
			"width": 5,
			"height": 1,
			"source": PackedByteArray([1, 2, 3, 0, 4, 5, 6, 1, 7, 8, 9, 19, 200, 100, 50, 20, 11, 22, 33, 255]),
			"expected": PackedByteArray([200, 100, 50, 0, 200, 100, 50, 1, 200, 100, 50, 19, 200, 100, 50, 20, 11, 22, 33, 255]),
			"sourceSha256": "bb8c7772a5934465e69c7faa638ad9b883e9451613e6bcdfd6a82cc39d5ee9bc",
			"expectedRawSha256": "1fcbe4379effece9549014f3933e9c34f11a2d425d6f6d7e07d69b2a7a7b2026",
			"expectedContractSha256": "d0d0966527901cc010506047e905ac8cc00aff873a9bca2030317ea408457c46",
		},
		{
			"id": "tie_row_major_first",
			"width": 3,
			"height": 3,
			"source": PackedByteArray([1, 1, 1, 255, 10, 20, 30, 255, 2, 2, 2, 255, 40, 50, 60, 255, 201, 202, 203, 0, 70, 80, 90, 255, 3, 3, 3, 255, 100, 110, 120, 255, 4, 4, 4, 255]),
			"expected": PackedByteArray([1, 1, 1, 255, 10, 20, 30, 255, 2, 2, 2, 255, 40, 50, 60, 255, 10, 20, 30, 0, 70, 80, 90, 255, 3, 3, 3, 255, 100, 110, 120, 255, 4, 4, 4, 255]),
			"sourceSha256": "53994901c52fa899523af2be0e511d6548824894935e325c4d8a0b0eaf6b0cab",
			"expectedRawSha256": "97748f9d55db17ec91f11555c913c876d801efa7323bcf44fa672cb4e3f3814f",
			"expectedContractSha256": "9fee644af3cb292fc31644a567a0be3531f332fcac60f0a601aae9e8b8522115",
		},
		{
			"id": "radius4_square_diagonal",
			"width": 5,
			"height": 5,
			"source": square_source,
			"expected": square_expected,
			"sourceSha256": "44bc2f6e3828b7d9b198c658766eec37b9ad9b37ac239178c2a8f516b81a82a8",
			"expectedRawSha256": "7740ead9f0b6f32d98e9f9ff8831ba43e74ee6baab05935cc123db13e6b2a6eb",
			"expectedContractSha256": "f0968c149c9440c5305ab0e3a1aef288011c008a262b6b4a71bd031975a7720b",
		},
		{
			"id": "radius_bounds_no_neighbor",
			"width": 6,
			"height": 1,
			"source": PackedByteArray([210, 211, 212, 255, 1, 2, 3, 0, 4, 5, 6, 1, 7, 8, 9, 19, 10, 11, 12, 0, 51, 52, 53, 0]),
			"expected": PackedByteArray([210, 211, 212, 255, 210, 211, 212, 0, 210, 211, 212, 1, 210, 211, 212, 19, 210, 211, 212, 0, 51, 52, 53, 0]),
			"sourceSha256": "f9c9d9201949ac7575af19d483ec29a0ca5d5d029a934769e8498bd2ba4dd309",
			"expectedRawSha256": "6c120d5dc37a7c75890bb8954f17ce2e8ce43d60ed9e125db6f3d24fe3e7d0f9",
			"expectedContractSha256": "ef38e343249929e7171c0f327a0f5b76a6a94d98520d6c836e078dde58a76703",
		},
		{
			"id": "source_copy_non_cascade",
			"width": 11,
			"height": 1,
			"source": PackedByteArray([200, 10, 20, 255, 21, 41, 61, 0, 22, 42, 62, 1, 23, 43, 63, 19, 24, 44, 64, 0, 25, 45, 65, 1, 26, 46, 66, 19, 27, 47, 67, 0, 28, 48, 68, 1, 29, 49, 69, 19, 30, 50, 70, 0]),
			"expected": PackedByteArray([200, 10, 20, 255, 200, 10, 20, 0, 200, 10, 20, 1, 200, 10, 20, 19, 200, 10, 20, 0, 25, 45, 65, 1, 26, 46, 66, 19, 27, 47, 67, 0, 28, 48, 68, 1, 29, 49, 69, 19, 30, 50, 70, 0]),
			"sourceSha256": "f5ded048d3300fd1f3429f9d86229430bd5a8b22382c66b730227033379814a0",
			"expectedRawSha256": "5739cf058eeaa5665f79a7049e4bf4b0328dce1bbe6d3d541f2dbaa6ad08b3f4",
			"expectedContractSha256": "bfcb71ea35009e2c17b4c4ca6e994780c2b787ca9ee9e215e060811398fbb7dd",
		},
	]
	var tree_frames: Array = []
	for vector_value in vectors:
		var vector := vector_value as Dictionary
		var source := vector["source"] as PackedByteArray
		var expected := vector["expected"] as PackedByteArray
		var width := int(vector["width"])
		var height := int(vector["height"])
		var fixed := _godot47_fix_alpha_edges_rgba8(source, width, height)
		if _sha256_bytes(source) != str(vector["sourceSha256"]):
			errors.append("PCK import oracle 固定向量 source raw SHA 不一致：%s" % vector["id"])
		if fixed != expected or _sha256_bytes(fixed) != str(vector["expectedRawSha256"]):
			errors.append("PCK import oracle 固定向量输出不一致：%s" % vector["id"])
		if (
			_imported_pixel_contract_bytes_sha256(width, height, fixed, import_oracle_sha)
			!= str(vector["expectedContractSha256"])
		):
			errors.append("PCK import oracle 固定向量合同摘要不一致：%s" % vector["id"])
		var builtin_image := Image.create_from_data(
			width, height, false, Image.FORMAT_RGBA8, source.duplicate()
		)
		builtin_image.fix_alpha_edges()
		if builtin_image.get_data() != expected:
			errors.append("PCK 内建 Godot 4.7 fix_alpha_edges 与固定向量不一致：%s" % vector["id"])
		for alpha_offset in range(3, expected.size(), 4):
			if expected[alpha_offset] != source[alpha_offset]:
				errors.append("PCK import oracle 固定向量 alpha 被修改：%s" % vector["id"])
				break
		var tree_frame := {
			"path": "res://fixture/%s.png" % vector["id"],
			"sourceFileSha256": "0000000000000000000000000000000000000000000000000000000000000000",
			"sourceRgba8Sha256": str(vector["sourceSha256"]),
			"importOracleSha256": import_oracle_sha,
			"importOptions": _expected_import_options(),
			"expectedImportedRgba8RawSha256": str(vector["expectedRawSha256"]),
			"expectedImportedPixelContractSha256": str(
				vector["expectedContractSha256"]
			),
		}
		tree_frame["frameImportBindingSha256"] = PetBattleReleaseGate.canonical_json_sha256(
			_frame_import_binding_document(tree_frame)
		)
		tree_frames.append(tree_frame)
	var threshold_mutation := (vectors[0]["expected"] as PackedByteArray).duplicate()
	threshold_mutation[8] = 7
	if (
		_imported_pixel_contract_bytes_sha256(5, 1, threshold_mutation, import_oracle_sha)
		== str(vectors[0]["expectedContractSha256"])
	):
		errors.append("PCK import oracle 错误 threshold 变异未被拒绝")
	var tie_mutation := (vectors[1]["expected"] as PackedByteArray).duplicate()
	tie_mutation[16] = 100
	if (
		_imported_pixel_contract_bytes_sha256(3, 3, tie_mutation, import_oracle_sha)
		== str(vectors[1]["expectedContractSha256"])
	):
		errors.append("PCK import oracle 错误 tie 变异未被拒绝")
	var radius_mutation := (vectors[2]["expected"] as PackedByteArray).duplicate()
	radius_mutation[0] = 1
	if (
		_imported_pixel_contract_bytes_sha256(5, 5, radius_mutation, import_oracle_sha)
		== str(vectors[2]["expectedContractSha256"])
	):
		errors.append("PCK import oracle 错误 radius 变异未被拒绝")
	var cascade_mutation := (vectors[4]["expected"] as PackedByteArray).duplicate()
	cascade_mutation[20] = 200
	if (
		_imported_pixel_contract_bytes_sha256(11, 1, cascade_mutation, import_oracle_sha)
		== str(vectors[4]["expectedContractSha256"])
	):
		errors.append("PCK import oracle source-copy 非级联变异未被拒绝")
	var premult_mutation := _premultiply_godot47(vectors[0]["expected"] as PackedByteArray)
	if (
		_imported_pixel_contract_bytes_sha256(5, 1, premult_mutation, import_oracle_sha)
		== str(vectors[0]["expectedContractSha256"])
	):
		errors.append("PCK import oracle premult=true 变异未被拒绝")
	var alpha_mutation := (vectors[0]["expected"] as PackedByteArray).duplicate()
	alpha_mutation[3] = 1
	if (
		_imported_pixel_contract_bytes_sha256(5, 1, alpha_mutation, import_oracle_sha)
		== str(vectors[0]["expectedContractSha256"])
	):
		errors.append("PCK import oracle alpha 变异未被拒绝")
	var pixel_tree := {
		"contractId": EXPORT_PIXEL_CONTRACT_ID,
		"formId": "godot47_fix_alpha_edges_contract_fixture",
		"petRoot": "fixture",
		"frames": tree_frames,
	}
	if PetBattleReleaseGate.canonical_json_sha256(pixel_tree) != EXPORT_PIXEL_TREE_PARITY_SHA256:
		errors.append("PCK Godot 4.7 import-oracle pixel tree 跨语言固定向量不一致")


static func _sha256_bytes(value: PackedByteArray) -> String:
	var context := HashingContext.new()
	context.start(HashingContext.HASH_SHA256)
	context.update(value)
	return context.finish().hex_encode()


static func _is_sha256(value: String) -> bool:
	var normalized := value.strip_edges().to_lower()
	if normalized.length() != 64:
		return false
	for character in normalized:
		if not "0123456789abcdef".contains(character):
			return false
	return true


static func _is_canonical_sha256(value: String) -> bool:
	return value == value.to_lower() and value == value.strip_edges() and _is_sha256(value)


static func _append_exact_dictionary_key_errors(
	errors: Array[String],
	value: Dictionary,
	expected_keys: Array,
	label: String
) -> void:
	var actual: Array[String] = []
	for key_value in value.keys():
		if typeof(key_value) != TYPE_STRING:
			errors.append("%s 只允许 String key" % label)
			return
		actual.append(str(key_value))
	var expected: Array[String] = []
	for key_value in expected_keys:
		if typeof(key_value) != TYPE_STRING:
			errors.append("%s expected key contract 无效" % label)
			return
		expected.append(str(key_value))
	actual.sort()
	expected.sort()
	if actual != expected:
		errors.append("%s key set 不一致" % label)


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


static func _dict(value) -> Dictionary:
	return value as Dictionary if value is Dictionary else {}


static func _append_contract_errors(errors: Array[String]) -> void:
	var manifest := _read_json_dictionary(ASSET_MANIFEST_PATH, errors)
	var bundle := _read_json_dictionary(BUNDLE_META_PATH, errors)
	if manifest.is_empty() or bundle.is_empty():
		return
	var matching_assets: Array = []
	for value in manifest.get("assets", []):
		if (
			value is Dictionary
			and str(value.get("type", "")) == "pet_action_bundle"
			and str(value.get("formId", "")) == PetActionAssetCatalog.FORM_ID
		):
			matching_assets.append(value)
	if matching_assets.size() != 1:
		errors.append("资产 manifest 中芽耳布伊动作包应恰好一项，实际 %d" % matching_assets.size())
	else:
		var asset := matching_assets[0] as Dictionary
		if str(asset.get("path", "")) != BUNDLE_META_PATH:
			errors.append("资产 manifest 的动作合同路径不正确")
		if str(asset.get("source", "")) != "project_original_ai_assisted":
			errors.append("资产 manifest 未记录原创 AI 辅助来源")
	if str(bundle.get("formId", "")) != PetActionAssetCatalog.FORM_ID:
		errors.append("动作合同 formId 与目录不一致")
	var battle_mapping := bundle.get("battleViewMapping", {}) as Dictionary
	var ally_mapping := battle_mapping.get("ally", {}) as Dictionary
	var enemy_mapping := battle_mapping.get("enemy", {}) as Dictionary
	if (
		str(ally_mapping.get("view", "")) != PetActionAssetCatalog.VIEW_BACK
		or not bool(ally_mapping.get("flipH", false))
		or str(ally_mapping.get("facing", "")) != "northwest"
		or str(enemy_mapping.get("view", "")) != PetActionAssetCatalog.VIEW_FRONT
		or not bool(enemy_mapping.get("flipH", false))
		or str(enemy_mapping.get("facing", "")) != "southeast"
	):
		errors.append("战斗双方没有按敌左己右布局面对面")
	var runtime_frame_size := bundle.get("runtimeFrameSize", []) as Array
	if runtime_frame_size.size() != 2 or int(runtime_frame_size[0]) != 256 or int(runtime_frame_size[1]) != 256:
		errors.append("动作合同运行帧尺寸不是 256x256")
	var source := bundle.get("source", {}) as Dictionary
	if str(source.get("ownershipRecord", "")) != "identity/source-and-ownership.md":
		errors.append("动作合同未指向来源与归属记录")
	if not FileAccess.file_exists(OWNERSHIP_RECORD_PATH):
		errors.append("缺少来源与归属记录：%s" % OWNERSHIP_RECORD_PATH)
	var quality := bundle.get("quality", {}) as Dictionary
	if bool(quality.get("formalReleaseActionPackComplete", false)):
		var action_specs := bundle.get("actions", {}) as Dictionary
		for action in PetActionAssetCatalog.FULL_BATTLE_ACTIONS:
			var spec_value = action_specs.get(action, {})
			if not (spec_value is Dictionary) or int((spec_value as Dictionary).get("frameCount", 0)) <= 0:
				errors.append("正式十二动作完成标记缺少动作事实：%s" % action)
	if str(quality.get("ownerReviewStatus", "")) != "pending":
		errors.append("用户尚未评审，ownerReviewStatus 必须保持 pending")


static func _read_json_dictionary(path: String, errors: Array[String]) -> Dictionary:
	if not FileAccess.file_exists(path):
		errors.append("缺少资产合同：%s" % path)
		return {}
	var parsed = JSON.parse_string(FileAccess.get_file_as_string(path))
	if not (parsed is Dictionary):
		errors.append("资产合同不是有效 JSON 对象：%s" % path)
		return {}
	return parsed as Dictionary
