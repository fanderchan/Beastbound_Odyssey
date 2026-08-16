extends RefCounted

const DATA_PATH := "res://data/pet_fusion_runtime_release_attestation_v1.json"
const REPO_DATA_PATH := (
	"client/godot/data/pet_fusion_runtime_release_attestation_v1.json"
)
const CATALOG_REPO_PATH := "client/godot/data/pet_fusion_recipes.json"
const PRIOR_BODY_VISUAL_DECISION_REPO_PATH := (
	"client/godot/data/pet_fusion_visual_owner_decision_v1.json"
)
const OWNER_DECISION_REPO_PATH := (
	"client/godot/data/pet_fusion_runtime_release_owner_decision_v1.json"
)
const ATTESTATION_TYPE := "beastbound_pet_fusion_runtime_release_attestation"
const ATTESTATION_ID := "pet_fusion_p1_4_runtime_release_v1"
const OWNER_DECISION_TYPE := "beastbound_pet_fusion_runtime_release_owner_decision"
const OWNER_DECISION_ID := "pet_fusion_p1_4_runtime_release_v1"
const PORTRAIT_OWNER_DECISION_TYPE := "beastbound_pet_portrait_owner_approval"
const TRUSTED_PROJECT_OWNER_ID := "project-owner:fander"
const CATALOG_ID := "pet_fusion_recipes_v2"
const RECIPE_IDS: Array[String] = [
	"emberhorn_solar_crown_fusion_v1",
	"emberhorn_moss_rampart_fusion_v1",
]
const FORM_IDS: Array[String] = [
	"emberhorn_fusion_solar_crown_fire7_wind3",
	"emberhorn_fusion_moss_rampart_fire4_earth6",
]
const FORM_CONTRACTS := [
	{
		"formId": "emberhorn_fusion_solar_crown_fire7_wind3",
		"petRoot": (
			"client/godot/assets/pets/"
			+ "emberhorn_fusion_solar_crown_fire7_wind3"
		),
		"petMetadataPath": (
			"client/godot/assets/pets/"
			+ "emberhorn_fusion_solar_crown_fire7_wind3/action-bundle-meta.json"
		),
		"portraitMetadataPath": (
			"client/godot/assets/pets/"
			+ "emberhorn_fusion_solar_crown_fire7_wind3/portrait/portrait-meta.json"
		),
		"portraitRuntimePath": (
			"client/godot/assets/pets/"
			+ "emberhorn_fusion_solar_crown_fire7_wind3/portrait/default.png"
		),
		"portraitMasterPath": (
			"client/godot/assets/pets/"
			+ "emberhorn_fusion_solar_crown_fire7_wind3/"
			+ "source/portrait/headshot-master-1024.png"
		),
		"portraitOwnershipPath": (
			"client/godot/assets/pets/"
			+ "emberhorn_fusion_solar_crown_fire7_wind3/"
			+ "portrait/source-and-ownership.md"
		),
		"portraitDecisionPath": (
			"client/godot/assets/pets/"
			+ "emberhorn_fusion_solar_crown_fire7_wind3/"
			+ "portrait/owner-decision.json"
		),
		"battleBundleDigest": (
			"5a4896f64614b4eceaad220071fdd80fe85909bfa78d67ffb0637090a71da2fc"
		),
	},
	{
		"formId": "emberhorn_fusion_moss_rampart_fire4_earth6",
		"petRoot": (
			"client/godot/assets/pets/"
			+ "emberhorn_fusion_moss_rampart_fire4_earth6"
		),
		"petMetadataPath": (
			"client/godot/assets/pets/"
			+ "emberhorn_fusion_moss_rampart_fire4_earth6/action-bundle-meta.json"
		),
		"portraitMetadataPath": (
			"client/godot/assets/pets/"
			+ "emberhorn_fusion_moss_rampart_fire4_earth6/portrait/portrait-meta.json"
		),
		"portraitRuntimePath": (
			"client/godot/assets/pets/"
			+ "emberhorn_fusion_moss_rampart_fire4_earth6/portrait/default.png"
		),
		"portraitMasterPath": (
			"client/godot/assets/pets/"
			+ "emberhorn_fusion_moss_rampart_fire4_earth6/"
			+ "source/portrait/headshot-master-1024.png"
		),
		"portraitOwnershipPath": (
			"client/godot/assets/pets/"
			+ "emberhorn_fusion_moss_rampart_fire4_earth6/"
			+ "portrait/source-and-ownership.md"
		),
		"portraitDecisionPath": (
			"client/godot/assets/pets/"
			+ "emberhorn_fusion_moss_rampart_fire4_earth6/"
			+ "portrait/owner-decision.json"
		),
		"battleBundleDigest": (
			"27c3a0784ab6a2e55a3f3acc6624a722a8b4240bbb04bcd0ffbc53a52d524107"
		),
	},
]
const APPROVED_SCOPES: Array[String] = [
	"dedicated_pet_portrait",
	"fusion_information_layout",
	"player_fusion_entry",
	"fusion_runtime_release",
]
const VALIDATION_KINDS: Array[String] = [
	"closed_asset_replay",
	"authoritative_three_pet_atomic_transaction",
	"idempotency_disconnect_conflict_rollback",
	"real_main_entry_and_performance",
]
const WORLD_DIRECTIONS: Array[String] = [
	"south",
	"southwest",
	"west",
	"northwest",
	"north",
	"northeast",
	"east",
	"southeast",
]
const BATTLE_VIEWS: Array[String] = [
	"front_3quarter_sw",
	"back_3quarter_ne",
]
const BATTLE_ACTIONS: Array[String] = [
	"idle",
	"walk",
	"attack",
	"skill",
	"hurt",
	"defend",
	"dodge",
	"counter",
	"stagger",
	"knockaway",
	"down",
	"revive",
]
const BATTLE_VIEW_MAPPING := {
	"enemy": {
		"view": "front_3quarter_sw",
		"flipH": true,
		"facing": "southeast",
	},
	"ally": {
		"view": "back_3quarter_ne",
		"flipH": true,
		"facing": "northwest",
	},
}
const RELEASE_PRODUCTION_SCOPE := "formal_nonrideable_runtime_release"
const RELEASE_NOTES := (
	"Identity, true-eight-direction world art, dedicated portrait, and the "
	+ "complete two-view battle matrix are owner-approved for the first "
	+ "non-rideable fusion runtime release."
)
const PRIOR_APPROVED_SCOPES: Array[String] = [
	"standalone_pet_identity_visual_only",
	"standalone_pet_world_true8_visual_only",
	"standalone_pet_battle_two_view_visual_only",
	"revive_sequence_visual_only",
]
const PRIOR_EXCLUDED_SCOPES: Array[String] = [
	"dedicated_pet_portrait",
	"player_fusion_entry",
	"fusion_runtime_release",
	"mounted_pet_art",
]


static func validation_errors(catalog_document) -> Array[String]:
	if not FileAccess.file_exists(DATA_PATH):
		return ["融合目录已请求开放，但缺少固定路径发布证明"]
	var content := FileAccess.get_file_as_string(DATA_PATH)
	var parsed = JSON.parse_string(content)
	if not (parsed is Dictionary):
		return ["融合运行发布证明不是JSON对象"]
	var attestation_sha := FileAccess.get_sha256(DATA_PATH).to_lower()
	return _document_validation_errors(
		parsed as Dictionary,
		attestation_sha,
		catalog_document,
		{},
		false
	)


static func fixture_validation_errors(
	attestation_content: String,
	catalog_document,
	fixture_files: Dictionary
) -> Array[String]:
	var parsed = JSON.parse_string(attestation_content)
	if not (parsed is Dictionary):
		return ["融合运行发布证明测试夹具不是JSON对象"]
	return _document_validation_errors(
		parsed as Dictionary,
		attestation_content.sha256_text(),
		catalog_document,
		fixture_files,
		true
	)


static func release_summary(catalog_document) -> Dictionary:
	var errors := validation_errors(catalog_document)
	return {
		"ok": errors.is_empty(),
		"attestationId": ATTESTATION_ID,
		"catalogId": CATALOG_ID,
		"recipeIds": RECIPE_IDS.duplicate(),
		"targetFormIds": FORM_IDS.duplicate(),
		"releaseApproved": errors.is_empty(),
		"runtimeEnabled": errors.is_empty(),
		"playerEntryOpened": errors.is_empty(),
		"sha256": (
			FileAccess.get_sha256(DATA_PATH).to_lower()
			if FileAccess.file_exists(DATA_PATH)
			else ""
		),
		"errors": errors,
	}


static func _document_validation_errors(
	document: Dictionary,
	attestation_sha: String,
	catalog_document,
	fixture_files: Dictionary,
	fixture_mode: bool
) -> Array[String]:
	var errors: Array[String] = []
	_validate_exact_keys(
		document,
		[
			"schemaVersion",
			"attestationType",
			"attestationId",
			"status",
			"ownerReviewStatus",
			"releaseApproved",
			"runtimeEnabled",
			"playerEntryOpened",
			"approvedAtUtc",
			"ownerDecision",
			"priorBodyVisualDecision",
			"catalog",
			"recipeIds",
			"targetFormIds",
			"forms",
			"validationEvidence",
			"expectedLifecycle",
		],
		"融合发布证明",
		errors
	)
	if int(document.get("schemaVersion", 0)) != 1:
		errors.append("融合发布证明 schemaVersion 必须为1")
	if (
		str(document.get("attestationType", "")) != ATTESTATION_TYPE
		or str(document.get("attestationId", "")) != ATTESTATION_ID
	):
		errors.append("融合发布证明类型或ID无效")
	if (
		str(document.get("status", "")) != "approved"
		or str(document.get("ownerReviewStatus", "")) != "approved"
		or document.get("releaseApproved", null) != true
		or document.get("runtimeEnabled", null) != true
		or document.get("playerEntryOpened", null) != true
	):
		errors.append("融合发布证明必须已由项目所有者批准并开放玩家入口")
	if not _is_iso_utc(str(document.get("approvedAtUtc", ""))):
		errors.append("融合发布证明 approvedAtUtc 必须是有效UTC时间")
	if not _is_sha256(attestation_sha):
		errors.append("融合发布证明 SHA-256 无效")
	if not _same_string_array(document.get("recipeIds", []), RECIPE_IDS):
		errors.append("融合发布证明必须精确覆盖两条正式配方")
	if not _same_string_array(document.get("targetFormIds", []), FORM_IDS):
		errors.append("融合发布证明必须精确覆盖两只不可骑乘成品")
	_validate_expected_lifecycle(
		_dict(document.get("expectedLifecycle", {})),
		errors
	)

	var catalog_reference := _validated_reference(
		document.get("catalog", {}),
		"融合配方目录",
		fixture_files,
		fixture_mode,
		errors
	)
	if str(catalog_reference.get("path", "")) != CATALOG_REPO_PATH:
		errors.append("融合发布证明必须绑定固定生产目录路径")
	_validate_catalog(
		_dict(catalog_reference.get("document", {})),
		catalog_document,
		errors
	)

	var prior_reference := _validated_reference(
		document.get("priorBodyVisualDecision", {}),
		"融合历史整包视觉决定",
		fixture_files,
		fixture_mode,
		errors
	)
	if (
		str(prior_reference.get("path", ""))
		!= PRIOR_BODY_VISUAL_DECISION_REPO_PATH
	):
		errors.append("融合历史视觉决定路径不是冻结的Phase 372文件")
	_validate_prior_body_visual_decision(
		_dict(prior_reference.get("document", {})),
		errors
	)

	var owner_reference := _validated_reference(
		document.get("ownerDecision", {}),
		"融合运行发布 owner decision",
		fixture_files,
		fixture_mode,
		errors
	)
	var owner_decision_path := str(owner_reference.get("path", ""))
	if owner_decision_path != OWNER_DECISION_REPO_PATH:
		errors.append("融合运行发布 owner decision 路径未冻结")
	_validate_owner_decision(
		_dict(owner_reference.get("document", {})),
		errors
	)

	var forms_value = document.get("forms", [])
	if not (forms_value is Array) or (forms_value as Array).size() != FORM_CONTRACTS.size():
		errors.append("融合发布证明必须精确登记两只成品")
	else:
		var seen_forms := {}
		for index in range(FORM_CONTRACTS.size()):
			var raw := _dict((forms_value as Array)[index])
			var contract := FORM_CONTRACTS[index] as Dictionary
			var label := "融合发布证明.forms[%d]" % index
			_validate_exact_keys(
				raw,
				[
					"formId",
					"petMetadataPath",
					"portraitMetadata",
					"battleBundleDigest",
				],
				label,
				errors
			)
			var form_id := str(raw.get("formId", ""))
			if (
				form_id != str(contract.get("formId", ""))
				or str(raw.get("petMetadataPath", ""))
					!= str(contract.get("petMetadataPath", ""))
				or str(raw.get("battleBundleDigest", ""))
					!= str(contract.get("battleBundleDigest", ""))
			):
				errors.append("%s 未匹配冻结的融合成品合同" % label)
				continue
			if seen_forms.has(form_id):
				errors.append("融合发布证明重复登记成品：%s" % form_id)
			seen_forms[form_id] = true
			var portrait_reference := _validated_reference(
				raw.get("portraitMetadata", {}),
				"%s 专用画像元数据" % form_id,
				fixture_files,
				fixture_mode,
				errors
			)
			if (
				str(portrait_reference.get("path", ""))
				!= str(contract.get("portraitMetadataPath", ""))
			):
				errors.append("%s 专用画像元数据路径未冻结" % form_id)
			_validate_portrait_metadata(
				contract,
				_dict(portrait_reference.get("document", {})),
				fixture_files,
				fixture_mode,
				errors
			)
			_validate_pet_metadata(
				contract,
				attestation_sha,
				fixture_files,
				fixture_mode,
				errors
			)

	_validate_validation_evidence(
		document.get("validationEvidence", []),
		errors
	)
	return errors


static func _validate_catalog(
	document: Dictionary,
	expected_document,
	errors: Array[String]
) -> void:
	var recipes_value = document.get("recipes", [])
	var actual_recipe_ids: Array[String] = []
	var actual_target_form_ids: Array[String] = []
	if recipes_value is Array:
		for raw_recipe in recipes_value as Array:
			var recipe := _dict(raw_recipe)
			actual_recipe_ids.append(str(recipe.get("recipeId", "")))
			actual_target_form_ids.append(str(recipe.get("targetFormId", "")))
			if (
				str(_dict(recipe.get("assetGate", {})).get("status", ""))
					!= "formal"
				or _dict(recipe.get("result", {})).get("rideable", null) != false
			):
				errors.append("融合正式配方必须绑定 formal 且不可骑乘的成品资源")
	if (
		int(document.get("schemaVersion", 0)) != 2
		or str(document.get("catalogId", "")) != CATALOG_ID
		or document.get("runtimeEnabled", null) != true
		or actual_recipe_ids != RECIPE_IDS
		or actual_target_form_ids != FORM_IDS
	):
		errors.append("发布证明目录未精确开放首批两条生产融合配方")
	if not _deep_equal(document, expected_document):
		errors.append("发布证明目录与客户端实际运行目录不一致")


static func _validate_prior_body_visual_decision(
	document: Dictionary,
	errors: Array[String]
) -> void:
	if (
		int(document.get("schemaVersion", 0)) != 1
		or str(document.get("decisionType", ""))
			!= "beastbound_pet_fusion_full_nonrideable_visual_owner_decision"
		or str(document.get("decisionId", ""))
			!= "pet_fusion_p1_4e_full_nonrideable_visual_20260730"
		or str(document.get("decision", "")) != "approved"
		or not _same_string_array(
			document.get("approvedScopes", []), PRIOR_APPROVED_SCOPES
		)
		or document.get("releaseApproved", null) != false
		or document.get("runtimeEnabled", null) != false
	):
		errors.append("Phase 372 历史决定不是冻结的视觉范围批准")
	var excluded = document.get("excludedScopes", [])
	for scope in PRIOR_EXCLUDED_SCOPES:
		if not (excluded is Array) or not (excluded as Array).has(scope):
			errors.append("Phase 372 历史决定必须排除范围：%s" % scope)
	var forms_value = _dict(document.get("evidence", {})).get("forms", [])
	if not (forms_value is Array) or (forms_value as Array).size() != FORM_CONTRACTS.size():
		errors.append("Phase 372 历史决定没有覆盖两只冻结战斗整包")
		return
	for index in range(FORM_CONTRACTS.size()):
		var evidence := _dict((forms_value as Array)[index])
		var contract := FORM_CONTRACTS[index] as Dictionary
		if (
			str(evidence.get("formId", "")) != str(contract.get("formId", ""))
			or str(evidence.get("battleBundleDigest", ""))
				!= str(contract.get("battleBundleDigest", ""))
		):
			errors.append("Phase 372 历史决定的成品整包摘要发生漂移")


static func _validate_owner_decision(
	document: Dictionary,
	errors: Array[String]
) -> void:
	_validate_exact_keys(
		document,
		[
			"schemaVersion",
			"decisionType",
			"decisionId",
			"roadmapItem",
			"decision",
			"reviewer",
			"recordedDecisionText",
			"ownerReviewStatus",
			"releaseApproved",
			"runtimeEnabled",
			"playerEntryOpened",
			"approvedAtUtc",
			"catalogId",
			"recipeIds",
			"targetFormIds",
			"nonRideableTargetFormIds",
			"approvedScopes",
			"evidence",
		],
		"融合运行发布 owner decision",
		errors
	)
	if (
		int(document.get("schemaVersion", 0)) != 1
		or str(document.get("decisionType", "")) != OWNER_DECISION_TYPE
		or str(document.get("decisionId", "")) != OWNER_DECISION_ID
		or str(document.get("roadmapItem", "")) != "P1.4"
		or str(document.get("decision", "")) != "approved"
		or str(document.get("reviewer", "")) != TRUSTED_PROJECT_OWNER_ID
		or str(document.get("recordedDecisionText", "")).strip_edges() == ""
		or str(document.get("ownerReviewStatus", "")) != "approved"
		or document.get("releaseApproved", null) != true
		or document.get("runtimeEnabled", null) != true
		or document.get("playerEntryOpened", null) != true
		or not _is_iso_utc(str(document.get("approvedAtUtc", "")))
		or str(document.get("catalogId", "")) != CATALOG_ID
		or not _same_string_array(document.get("recipeIds", []), RECIPE_IDS)
		or not _same_string_array(document.get("targetFormIds", []), FORM_IDS)
		or not _same_string_array(
			document.get("nonRideableTargetFormIds", []), FORM_IDS
		)
		or not _same_string_array(document.get("approvedScopes", []), APPROVED_SCOPES)
	):
		errors.append("owner decision 未精确批准 P1.4 正式运行范围")
	var evidence := _dict(document.get("evidence", {}))
	_validate_exact_keys(
		evidence,
		["mainOwnerReview", "phaseRecord"],
		"融合运行发布 owner decision.evidence",
		errors
	)
	_validate_evidence_reference(
		evidence.get("mainOwnerReview", {}),
		"融合 Main owner review",
		errors
	)
	_validate_evidence_reference(
		evidence.get("phaseRecord", {}),
		"融合发布阶段记录",
		errors
	)


static func _validate_portrait_metadata(
	contract: Dictionary,
	document: Dictionary,
	fixture_files: Dictionary,
	fixture_mode: bool,
	errors: Array[String]
) -> void:
	var form_id := str(contract.get("formId", ""))
	var owner_review := _dict(document.get("ownerReview", {}))
	var despill := _dict(
		_dict(_dict(document.get("processing", {})).get("alphaMatte", {})).get(
			"despill", {}
		)
	)
	var assets := _dict(document.get("assets", {}))
	var master_asset := _dict(assets.get("master", {}))
	var runtime_asset := _dict(assets.get("runtime", {}))
	var eligibility_mask := _dict(assets.get("eligibilityMask", {}))
	var ownership_asset := _dict(document.get("ownership", {}))
	_validate_exact_keys(
		owner_review,
		["required", "status", "evidence", "decision"],
		"%s 专用画像 ownerReview" % form_id,
		errors
	)
	if (
		int(document.get("schemaVersion", 0)) != 1
		or str(document.get("formId", "")) != form_id
		or str(document.get("capability", "")) != "shared_dedicated_headshot_v1"
		or document.get("independentlyAuthoredClaim", null) != true
		or str(document.get("independentAuthorshipClaimTrust", ""))
			!= "owner_verified"
		or document.get("semanticIndependenceVerified", null) != true
		or document.get("releaseGate", null) != true
		or document.get("fullBodyCropAllowed", null) != false
		or owner_review.get("required", null) != true
		or str(owner_review.get("status", "")) != "approved"
	):
		errors.append("%s 专用画像未通过独立创作与项目所有者发布门禁" % form_id)
	var accepted_evidence: Array[Dictionary] = []
	var evidence_value = owner_review.get("evidence", [])
	if evidence_value is Array:
		for index in range((evidence_value as Array).size()):
			var reference := _dict((evidence_value as Array)[index])
			_validate_evidence_reference(
				reference,
				"%s 专用画像 owner 证据[%d]" % [form_id, index],
				errors
			)
			accepted_evidence.append({
				"path": _safe_repo_path(str(reference.get("path", ""))),
				"sha256": str(reference.get("sha256", "")).strip_edges().to_lower(),
			})
	if accepted_evidence.is_empty():
		errors.append("%s 专用画像 owner 批准必须绑定非空证据" % form_id)
	var portrait_decision_reference := _validated_reference(
		owner_review.get("decision", {}),
		"%s 专用画像 owner decision" % form_id,
		fixture_files,
		fixture_mode,
		errors
	)
	if (
		str(portrait_decision_reference.get("path", ""))
		!= str(contract.get("portraitDecisionPath", ""))
	):
		errors.append("%s 专用画像 owner decision 路径未冻结" % form_id)
	var master_reference := {
		"path": master_asset.get("path", ""),
		"sha256": master_asset.get("sha256", ""),
	}
	var runtime_reference := {
		"path": runtime_asset.get("path", ""),
		"sha256": runtime_asset.get("sha256", ""),
	}
	var ownership_reference := {
		"path": ownership_asset.get("path", ""),
		"sha256": ownership_asset.get("sha256", ""),
	}
	_validate_portrait_owner_decision(
		contract,
		_dict(portrait_decision_reference.get("document", {})),
		accepted_evidence,
		master_reference,
		runtime_reference,
		ownership_reference,
		fixture_files,
		fixture_mode,
		errors
	)
	if (
		str(despill.get("scope", ""))
			!= "same_operation_exact_eligibility_mask_only"
		or despill.get("globalColorAdjustmentApplied", null) != false
		or int(despill.get("changedOutsideEligibilityPixels", -1)) != 0
		or int(despill.get("alphaPixelsChanged", -1)) != 0
	):
		errors.append("%s 专用画像越过精确蒙版去色边界" % form_id)
	if str(runtime_asset.get("path", "")) != str(contract.get("portraitRuntimePath", "")):
		errors.append("%s 专用画像运行资源路径未冻结" % form_id)
	_validate_evidence_reference(
		master_reference,
		"%s 专用画像 master 证据" % form_id,
		errors
	)
	if str(master_reference.get("path", "")) != str(contract.get("portraitMasterPath", "")):
		errors.append("%s 专用画像 master 路径未冻结" % form_id)
	_validated_reference(
		runtime_reference,
		"%s 专用画像运行资源" % form_id,
		fixture_files,
		fixture_mode,
		errors,
		false
	)
	if (
		str(eligibility_mask.get("path", "")).strip_edges() == ""
		or not _is_sha256(str(eligibility_mask.get("sha256", "")))
		or int(eligibility_mask.get("nonzeroPixels", 0)) <= 0
	):
		errors.append("%s 专用画像资格蒙版引用无效" % form_id)
	_validate_evidence_reference(
		{
			"path": eligibility_mask.get("path", ""),
			"sha256": eligibility_mask.get("sha256", ""),
		},
		"%s 专用画像资格蒙版" % form_id,
		errors
	)
	_validate_evidence_reference(
		ownership_reference,
		"%s 专用画像 ownership 证据" % form_id,
		errors
	)
	if (
		str(ownership_reference.get("path", ""))
		!= str(contract.get("portraitOwnershipPath", ""))
	):
		errors.append("%s 专用画像 ownership 路径未冻结" % form_id)


static func _validate_portrait_owner_decision(
	contract: Dictionary,
	document: Dictionary,
	accepted_evidence: Array[Dictionary],
	expected_master_reference: Dictionary,
	expected_runtime_reference: Dictionary,
	expected_ownership_reference: Dictionary,
	fixture_files: Dictionary,
	fixture_mode: bool,
	errors: Array[String]
) -> void:
	var form_id := str(contract.get("formId", ""))
	_validate_exact_keys(
		document,
		[
			"schemaVersion",
			"decisionType",
			"ownerId",
			"decision",
			"subject",
			"acceptedEvidence",
			"reviewedAt",
		],
		"%s 专用画像 owner decision" % form_id,
		errors
	)
	if (
		int(document.get("schemaVersion", 0)) != 2
		or str(document.get("decisionType", "")) != PORTRAIT_OWNER_DECISION_TYPE
		or str(document.get("ownerId", "")) != TRUSTED_PROJECT_OWNER_ID
		or str(document.get("decision", "")) != "approved"
		or not _is_iso_utc(str(document.get("reviewedAt", "")))
		or not _deep_equal(document.get("acceptedEvidence", []), accepted_evidence)
	):
		errors.append("%s 专用画像 owner decision 不是精确可信批准" % form_id)
	var subject := _dict(document.get("subject", {}))
	_validate_exact_keys(
		subject,
		["kind", "formId", "petRoot", "master", "runtime", "ownership"],
		"%s 专用画像 owner decision.subject" % form_id,
		errors
	)
	var master_reference := _dict(subject.get("master", {}))
	_validate_evidence_reference(
		master_reference,
		"%s 专用画像 owner decision.master" % form_id,
		errors
	)
	var runtime_reference := _validated_reference(
		subject.get("runtime", {}),
		"%s 专用画像 owner decision.runtime" % form_id,
		fixture_files,
		fixture_mode,
		errors,
		false
	)
	var ownership_reference := _dict(subject.get("ownership", {}))
	_validate_evidence_reference(
		ownership_reference,
		"%s 专用画像 owner decision.ownership" % form_id,
		errors
	)
	if (
		str(subject.get("kind", "")) != "shared_dedicated_headshot_v1"
		or str(subject.get("formId", "")) != form_id
		or str(subject.get("petRoot", "")) != str(contract.get("petRoot", ""))
		or str(master_reference.get("path", ""))
			!= str(contract.get("portraitMasterPath", ""))
		or str(runtime_reference.get("path", ""))
			!= str(contract.get("portraitRuntimePath", ""))
		or str(ownership_reference.get("path", ""))
			!= str(contract.get("portraitOwnershipPath", ""))
		or not _deep_equal(master_reference, expected_master_reference)
		or not _deep_equal(
			{
				"path": runtime_reference.get("path", ""),
				"sha256": runtime_reference.get("sha256", ""),
			},
			expected_runtime_reference
		)
		or not _deep_equal(ownership_reference, expected_ownership_reference)
	):
		errors.append("%s 专用画像 owner decision subject 漂移" % form_id)


static func _validate_pet_metadata(
	contract: Dictionary,
	attestation_sha: String,
	fixture_files: Dictionary,
	fixture_mode: bool,
	errors: Array[String]
) -> void:
	var form_id := str(contract.get("formId", ""))
	var metadata := _read_repo_json(
		str(contract.get("petMetadataPath", "")),
		"%s 宠物整包元数据" % form_id,
		fixture_files,
		fixture_mode,
		errors
	)
	var expected_reference := {
		"path": REPO_DATA_PATH,
		"sha256": attestation_sha,
	}
	var world := _dict(metadata.get("worldVisual", {}))
	var world_actions := _dict(world.get("actions", {}))
	var battle := _dict(metadata.get("battleVisual", {}))
	var identity := _dict(metadata.get("identity", {}))
	var actions := _dict(metadata.get("actions", {}))
	var runtime_frame_size_value = metadata.get("runtimeFrameSize", [])
	var runtime_frame_size_valid := (
		runtime_frame_size_value is Array
		and (runtime_frame_size_value as Array).size() == 2
		and int((runtime_frame_size_value as Array)[0]) == 256
		and int((runtime_frame_size_value as Array)[1]) == 256
	)
	var actions_approved := actions.size() == BATTLE_ACTIONS.size()
	for action_id in BATTLE_ACTIONS:
		actions_approved = (
			actions_approved
			and str(_dict(actions.get(action_id, {})).get("status", ""))
				== "approved"
		)
	if (
		str(metadata.get("formId", "")) != form_id
		or str(metadata.get("artStatus", "")) != "approved"
		or str(metadata.get("productionScope", ""))
			!= RELEASE_PRODUCTION_SCOPE
		or str(metadata.get("ownerReviewStatus", "")) != "approved"
		or str(metadata.get("keyPoseReviewStatus", "")) != "approved"
		or metadata.get("runtimeEnabled", null) != true
		or not _deep_equal(metadata.get("releaseAttestation", {}), expected_reference)
		or metadata.get("riding", "missing") != null
		or metadata.get("rideableTarget", null) != false
		or not _same_string_array(metadata.get("views", []), BATTLE_VIEWS)
		or not runtime_frame_size_valid
		or not _deep_equal(
			metadata.get("battleViewMapping", {}),
			BATTLE_VIEW_MAPPING
		)
		or str(identity.get("status", "")) != "approved"
		or str(metadata.get("notes", "")) != RELEASE_NOTES
		or not actions_approved
	):
		errors.append("%s 宠物整包未完整批准、开放或保持不可骑乘" % form_id)
	if (
		str(world.get("status", "")) != "approved"
		or world.get("runtimeEnabled", null) != true
		or str(world.get("strategy", "")) != "independent_8"
		or world.get("runtimeMirroring", null) != false
		or world.get("runtimeMountedComposition", null) != false
		or int(world.get("totalFrameCount", 0)) != 40
		or not _same_string_array(world.get("directions", []), WORLD_DIRECTIONS)
		or int(_dict(world_actions.get("idle", {})).get("frameCount", 0)) != 1
		or str(_dict(world_actions.get("idle", {})).get("status", ""))
			!= "approved"
		or int(_dict(world_actions.get("walk", {})).get("frameCount", 0)) != 4
		or int(_dict(world_actions.get("walk", {})).get("fps", 0)) != 10
		or str(_dict(world_actions.get("walk", {})).get("status", ""))
			!= "approved"
	):
		errors.append("%s 世界整包不是批准的真八向四帧步行资源" % form_id)
	if (
		str(battle.get("status", "")) != "approved"
		or battle.get("runtimeEnabled", null) != true
		or str(battle.get("kind", "")) != "pet"
		or not _same_string_array(battle.get("views", []), BATTLE_VIEWS)
		or not _same_string_array(battle.get("actions", []), BATTLE_ACTIONS)
		or not _deep_equal(
			battle.get("battleViewMapping", {}),
			BATTLE_VIEW_MAPPING
		)
		or int(battle.get("totalFrameCount", 0)) != 180
		or battle.get("runtimeMirroring", null) != false
		or battle.get("integratedWholeFrame", null) != false
		or battle.get("runtimeLayeredComposition", null) != false
		or str(battle.get("bundleDigest", ""))
			!= str(contract.get("battleBundleDigest", ""))
		or str(battle.get("archiveMode", "")) != "full"
		or battle.get("sourceFramesTracked", null) != true
	):
		errors.append("%s 战斗整包未完整源封存并批准运行" % form_id)


static func _validate_validation_evidence(value, errors: Array[String]) -> void:
	if not (value is Array) or (value as Array).size() != VALIDATION_KINDS.size():
		errors.append("融合发布证明缺少四项发布验证证据")
		return
	for index in range(VALIDATION_KINDS.size()):
		var evidence := _dict((value as Array)[index])
		var label := "融合发布证明.validationEvidence[%d]" % index
		_validate_exact_keys(
			evidence,
			["kind", "status", "path", "sha256"],
			label,
			errors
		)
		if (
			str(evidence.get("kind", "")) != VALIDATION_KINDS[index]
			or str(evidence.get("status", "")) != "passed"
		):
			errors.append("%s 未匹配冻结的P1.4验证范围" % label)
		_validate_evidence_reference(
			{
				"path": evidence.get("path", ""),
				"sha256": evidence.get("sha256", ""),
			},
			label,
			errors
		)


static func _validate_expected_lifecycle(
	value: Dictionary,
	errors: Array[String]
) -> void:
	_validate_exact_keys(
		value,
		[
			"artStatus",
			"ownerReviewStatus",
			"releaseApproved",
			"runtimeEnabled",
			"playerEntryOpened",
			"resultRideable",
			"petWorldRuntimeEnabled",
			"petBattleRuntimeEnabled",
			"portraitSemanticIndependenceVerified",
			"portraitReleaseGate",
		],
		"融合发布证明.expectedLifecycle",
		errors
	)
	if (
		str(value.get("artStatus", "")) != "approved"
		or str(value.get("ownerReviewStatus", "")) != "approved"
		or value.get("releaseApproved", null) != true
		or value.get("runtimeEnabled", null) != true
		or value.get("playerEntryOpened", null) != true
		or value.get("resultRideable", null) != false
		or value.get("petWorldRuntimeEnabled", null) != true
		or value.get("petBattleRuntimeEnabled", null) != true
		or value.get("portraitSemanticIndependenceVerified", null) != true
		or value.get("portraitReleaseGate", null) != true
	):
		errors.append("融合发布证明的预期整包生命周期不完整")


static func _validated_reference(
	reference_value,
	label: String,
	fixture_files: Dictionary,
	fixture_mode: bool,
	errors: Array[String],
	parse_json: bool = true
) -> Dictionary:
	var reference := _dict(reference_value)
	_validate_exact_keys(reference, ["path", "sha256"], label, errors)
	var repo_path := _safe_repo_path(str(reference.get("path", "")))
	var expected_sha := str(reference.get("sha256", "")).strip_edges().to_lower()
	if repo_path == "" or not repo_path.begins_with("client/godot/"):
		errors.append("%s 路径必须是安全的客户端仓库相对路径" % label)
		return {"path": repo_path, "sha256": expected_sha, "document": {}}
	if not _is_sha256(expected_sha):
		errors.append("%s SHA-256无效" % label)
	var content := ""
	var actual_sha := ""
	if fixture_mode:
		if not fixture_files.has(repo_path):
			errors.append("%s 路径缺失" % label)
		else:
			var fixture_value = fixture_files.get(repo_path)
			content = _fixture_text(fixture_value)
			actual_sha = _fixture_sha256(fixture_value)
	else:
		var resource_path := _resource_path(repo_path)
		if resource_path == "" or not FileAccess.file_exists(resource_path):
			errors.append("%s 路径缺失" % label)
		else:
			actual_sha = FileAccess.get_sha256(resource_path).to_lower()
			if parse_json:
				content = FileAccess.get_file_as_string(resource_path)
	if actual_sha != "" and actual_sha != expected_sha:
		errors.append("%s SHA-256与冻结引用不一致" % label)
	var document := {}
	if parse_json and content != "":
		var parsed = JSON.parse_string(content)
		if parsed is Dictionary:
			document = parsed as Dictionary
		else:
			errors.append("%s 不是JSON对象" % label)
	return {
		"path": repo_path,
		"sha256": expected_sha,
		"document": document,
	}


static func _read_repo_json(
	repo_path_value: String,
	label: String,
	fixture_files: Dictionary,
	fixture_mode: bool,
	errors: Array[String]
) -> Dictionary:
	var repo_path := _safe_repo_path(repo_path_value)
	if repo_path == "" or not repo_path.begins_with("client/godot/"):
		errors.append("%s 路径不安全" % label)
		return {}
	var content := ""
	if fixture_mode:
		if fixture_files.has(repo_path):
			content = _fixture_text(fixture_files.get(repo_path))
		else:
			errors.append("%s 路径缺失" % label)
			return {}
	else:
		var resource_path := _resource_path(repo_path)
		if resource_path == "" or not FileAccess.file_exists(resource_path):
			errors.append("%s 路径缺失" % label)
			return {}
		content = FileAccess.get_file_as_string(resource_path)
	var parsed = JSON.parse_string(content)
	if not (parsed is Dictionary):
		errors.append("%s 不是JSON对象" % label)
		return {}
	return parsed as Dictionary


static func _validate_evidence_reference(
	value,
	label: String,
	errors: Array[String]
) -> void:
	var reference := _dict(value)
	_validate_exact_keys(reference, ["path", "sha256"], label, errors)
	if _safe_repo_path(str(reference.get("path", ""))) == "":
		errors.append("%s 证据路径不安全" % label)
	if not _is_sha256(str(reference.get("sha256", ""))):
		errors.append("%s 证据 SHA-256 无效" % label)


static func _validate_exact_keys(
	value: Dictionary,
	expected_keys_value: Array,
	label: String,
	errors: Array[String]
) -> void:
	var actual_keys: Array[String] = []
	for raw_key in value.keys():
		actual_keys.append(str(raw_key))
	actual_keys.sort()
	var expected_keys: Array[String] = []
	for raw_key in expected_keys_value:
		expected_keys.append(str(raw_key))
	expected_keys.sort()
	if actual_keys != expected_keys:
		errors.append("%s 字段集合不精确" % label)


static func _same_string_array(value, expected: Array[String]) -> bool:
	if not (value is Array) or (value as Array).size() != expected.size():
		return false
	for index in range(expected.size()):
		if str((value as Array)[index]) != expected[index]:
			return false
	return true


static func _deep_equal(left, right) -> bool:
	if typeof(left) != typeof(right):
		return false
	if left is Dictionary:
		var left_dict := left as Dictionary
		var right_dict := right as Dictionary
		if left_dict.size() != right_dict.size():
			return false
		for key in left_dict.keys():
			if not right_dict.has(key) or not _deep_equal(left_dict.get(key), right_dict.get(key)):
				return false
		return true
	if left is Array:
		var left_array := left as Array
		var right_array := right as Array
		if left_array.size() != right_array.size():
			return false
		for index in range(left_array.size()):
			if not _deep_equal(left_array[index], right_array[index]):
				return false
		return true
	return left == right


static func _safe_repo_path(value: String) -> String:
	var normalized := value.strip_edges().replace("\\", "/")
	if (
		normalized == ""
		or normalized.begins_with("/")
		or normalized.find("..") >= 0
		or normalized.find(":") >= 0
	):
		return ""
	return normalized


static func _resource_path(repo_path: String) -> String:
	var prefix := "client/godot/"
	if repo_path.begins_with(prefix):
		return "res://%s" % repo_path.substr(prefix.length())
	return ""


static func _is_iso_utc(value: String) -> bool:
	var regex := RegEx.new()
	if regex.compile("^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z$") != OK:
		return false
	if regex.search(value) == null:
		return false
	return not Time.get_datetime_dict_from_datetime_string(value, false).is_empty()


static func _is_sha256(value: String) -> bool:
	var normalized := value.strip_edges().to_lower()
	if normalized.length() != 64:
		return false
	for index in range(normalized.length()):
		var code := normalized.unicode_at(index)
		if not (
			(code >= 48 and code <= 57)
			or (code >= 97 and code <= 102)
		):
			return false
	return true


static func _fixture_text(value) -> String:
	if value is PackedByteArray:
		return (value as PackedByteArray).get_string_from_utf8()
	return str(value)


static func _fixture_sha256(value) -> String:
	var bytes := (
		value as PackedByteArray
		if value is PackedByteArray
		else str(value).to_utf8_buffer()
	)
	var context := HashingContext.new()
	if context.start(HashingContext.HASH_SHA256) != OK:
		return ""
	if context.update(bytes) != OK:
		return ""
	return context.finish().hex_encode()


static func _dict(value) -> Dictionary:
	return value as Dictionary if value is Dictionary else {}
