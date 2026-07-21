extends SceneTree

const NpcArtReleaseEvidence := preload("res://scripts/world/npc_art_release_evidence.gd")
const NpcArtCatalog := preload("res://scripts/world/npc_art_catalog.gd")
const WorldVisualDirectionContract := preload("res://scripts/world/world_visual_direction_contract.gd")

const APPEARANCE_ID := "npc_evidence_fixture_m_v1"
const REPO_ROOT := "/repo/Beastbound_Odyssey"


func _initialize() -> void:
	var failures: Array[String] = []
	var fixture := _valid_fixture()
	var base_errors := _validate(fixture)
	if not base_errors.is_empty():
		failures.append("有效 fixture 被拒绝：%s" % "；".join(base_errors))

	var unrelated_video := fixture.duplicate(true)
	var unrelated_entry := ((unrelated_video["evidenceIndex"] as Dictionary)["appearances"] as Array)[0] as Dictionary
	(unrelated_entry["video"] as Dictionary)["path"] = ".run/evidence/unrelated/review.mp4"
	_expect_rejection(unrelated_video, "runtimeVideo", "无关视频 index", failures)

	var changed_appearance := fixture.duplicate(true)
	(changed_appearance["evidenceIndex"] as Dictionary)["appearanceIds"] = ["npc_other_f_v1"]
	(((changed_appearance["evidenceIndex"] as Dictionary)["appearances"] as Array)[0] as Dictionary)["appearanceId"] = "npc_other_f_v1"
	_expect_rejection(changed_appearance, "appearance", "换 appearance", failures)

	var old_frame_hash := fixture.duplicate(true)
	var recording := (old_frame_hash["parityReports"] as Dictionary)["recording"] as Dictionary
	((recording["frames"] as Array)[0] as Dictionary)["fileSha256"] = _hash("stale-world-frame")
	_expect_rejection(old_frame_hash, "installation", "旧帧 hash", failures)

	var same_reviewer := fixture.duplicate(true)
	var same_reviewer_audit := same_reviewer["blindAudit"] as Dictionary
	same_reviewer_audit["reviewerId"] = same_reviewer_audit["producerId"]
	_expect_rejection(same_reviewer, "producerId", "producer=reviewer", failures)

	var missing_portrait := fixture.duplicate(true)
	((missing_portrait["blindAudit"] as Dictionary)["portraitInspections"] as Array).pop_back()
	((missing_portrait["stageBObservation"] as Dictionary)["portraitInspections"] as Array).pop_back()
	_expect_rejection(missing_portrait, "portraitInspections", "漏人像", failures)

	var missing_main := fixture.duplicate(true)
	(missing_main["blindAudit"] as Dictionary)["mainSceneObservations"] = []
	(missing_main["stageBObservation"] as Dictionary)["mainSceneObservations"] = []
	_expect_rejection(missing_main, "Main", "漏 Main 观察", failures)

	var missing_stage_a := fixture.duplicate(true)
	missing_stage_a["stageAResult"] = {}
	_expect_rejection(missing_stage_a, "Stage A", "缺 Stage A 原始结果", failures)

	var missing_stage_b := fixture.duplicate(true)
	missing_stage_b["stageBObservation"] = {}
	_expect_rejection(missing_stage_b, "Stage B", "缺 Stage B 原始观察", failures)

	var stage_hash_drift := fixture.duplicate(true)
	(stage_hash_drift["review"] as Dictionary)["blindStageAResultSha256"] = _hash("drifted-stage-a")
	_expect_rejection(stage_hash_drift, "path+sha", "Stage A hash 漂移", failures)

	var producer_rewrite := fixture.duplicate(true)
	var rewritten_direction := (((producer_rewrite["blindAudit"] as Dictionary)["directionResults"] as Array)[0] as Dictionary)
	rewritten_direction["visualObservation"] = "producer 改写后的观察"
	_expect_rejection(producer_rewrite, "改写了 Stage A", "producer 改写 Stage A 原文", failures)

	var producer_portrait_rewrite := fixture.duplicate(true)
	var rewritten_portrait := ((((producer_portrait_rewrite["blindAudit"] as Dictionary)["portraitInspections"] as Array)[0]) as Dictionary)
	rewritten_portrait["visualObservation"] = "producer 改写人像观察"
	_expect_rejection(producer_portrait_rewrite, "改写了 Stage B portrait", "producer 改写 Stage B portrait 原文", failures)

	var producer_main_rewrite := fixture.duplicate(true)
	var rewritten_main := ((((producer_main_rewrite["blindAudit"] as Dictionary)["mainSceneObservations"] as Array)[0]) as Dictionary)
	rewritten_main["visualObservation"] = "producer 改写 Main 观察"
	_expect_rejection(producer_main_rewrite, "改写了 Stage B Main", "producer 改写 Stage B Main 原文", failures)

	var portrait_binding_drift := fixture.duplicate(true)
	var drifted_binding := ((((portrait_binding_drift["blindAudit"] as Dictionary)["portraitBindings"] as Array)[0]) as Dictionary)
	drifted_binding["fileSha256"] = _hash("drifted-portrait-binding")
	_expect_rejection(portrait_binding_drift, "portraitBinding 未绑定", "producer portrait binding hash 漂移", failures)

	var stage_b_private_leak := fixture.duplicate(true)
	(stage_b_private_leak["stageBObservation"] as Dictionary)["privateMapping"] = {"0": "north"}
	_expect_rejection(stage_b_private_leak, "泄露", "Stage B 携 private mapping", failures)

	var stage_b_direction_leak := fixture.duplicate(true)
	var leaked_stage_b_portrait := ((((stage_b_direction_leak["stageBObservation"] as Dictionary)["portraitInspections"] as Array)[0]) as Dictionary)
	leaked_stage_b_portrait["visualObservation"] = "角色明确朝向 north"
	_expect_rejection(stage_b_direction_leak, "泄露方向", "Stage B 观察泄露方向答案", failures)

	var reversed_stages := fixture.duplicate(true)
	(reversed_stages["stageBObservation"] as Dictionary)["frozenAtUtc"] = "2026-07-21T12:02:00Z"
	_expect_rejection(reversed_stages, "顺序逆转", "Stage B 早于 Stage A", failures)

	var stage_b_reviewer_drift := fixture.duplicate(true)
	(stage_b_reviewer_drift["stageBObservation"] as Dictionary)["reviewerId"] = "agent:other-reviewer"
	_expect_rejection(stage_b_reviewer_drift, "当前 Stage A/reviewer", "Stage B reviewerId 漂移", failures)

	var early_producer_merge := fixture.duplicate(true)
	(early_producer_merge["blindAudit"] as Dictionary)["producedAtUtc"] = "2026-07-21T12:04:00Z"
	_expect_rejection(early_producer_merge, "顺序逆转", "producer merge 未晚于 Stage B", failures)

	var missing_anonymous_asset := fixture.duplicate(true)
	((missing_anonymous_asset["blindPacket"] as Dictionary)["assets"] as Array).pop_back()
	_expect_rejection(missing_anonymous_asset, "八个", "漏匿名资产", failures)

	var direction_basename := fixture.duplicate(true)
	var basename_asset := (((direction_basename["blindPacket"] as Dictionary)["assets"] as Array)[0] as Dictionary)
	basename_asset["opaquePath"] = "%s/north.png" % str(basename_asset["opaquePath"]).get_base_dir()
	_expect_rejection(direction_basename, "basename", "匿名 basename 泄方向", failures)

	var packet_direction_field := fixture.duplicate(true)
	var leaked_asset := (((packet_direction_field["blindPacket"] as Dictionary)["assets"] as Array)[0] as Dictionary)
	leaked_asset["sourceRuntimePath"] = "runtime/world/north/idle-1.png"
	_expect_rejection(packet_direction_field, "暴露", "packet 携方向字段", failures)

	var mechanical_result := fixture.duplicate(true)
	var leaked_result := (((mechanical_result["blindAudit"] as Dictionary)["directionResults"] as Array)[0] as Dictionary)
	leaked_result["sourceRuntimePath"] = "runtime/world/north/idle-1.png"
	_expect_rejection(mechanical_result, "泄题", "reviewer result 携 sourcePath", failures)

	var leaked_answer_key := fixture.duplicate(true)
	(leaked_answer_key["blindAudit"] as Dictionary)["answerKey"] = {"0": "north"}
	_expect_rejection(leaked_answer_key, "未授权答案", "blind audit 顶层携 answerKey", failures)

	var stale_main_capture := fixture.duplicate(true)
	var stale_capture_frame := ((((stale_main_capture["mainCaptureReports"] as Array)[0] as Dictionary)["frames"] as Array)[0] as Dictionary)
	stale_capture_frame["fileSha256"] = _hash("stale-main-capture-frame")
	_expect_rejection(stale_main_capture, "Main capture", "Main capture 旧帧", failures)

	var partial_alpha_fixture := fixture.duplicate(true)
	var partial_canonical_sha := _hash("partial-alpha-canonical-rgba")
	for report_value in (partial_alpha_fixture["parityReports"] as Dictionary).values():
		var partial_frame := ((report_value as Dictionary)["frames"] as Array)[0] as Dictionary
		partial_frame["sourceDecodedRgbaSha256"] = partial_canonical_sha
		partial_frame["loadedDecodedRgbaSha256"] = partial_canonical_sha
	var partial_main_frame := ((((partial_alpha_fixture["mainCaptureReports"] as Array)[0] as Dictionary)["frames"] as Array)[0] as Dictionary)
	partial_main_frame["sourceDecodedRgbaSha256"] = partial_canonical_sha
	partial_main_frame["loadedDecodedRgbaSha256"] = partial_canonical_sha
	var partial_errors := _validate(partial_alpha_fixture)
	if not partial_errors.is_empty():
		failures.append("full != canonical 的 partial-alpha fixture 被误拒绝：%s" % "；".join(partial_errors))

	var wrong_full_hash := partial_alpha_fixture.duplicate(true)
	var wrong_full_frame := ((((wrong_full_hash["parityReports"] as Dictionary)["preflight"] as Dictionary)["frames"] as Array)[0] as Dictionary)
	wrong_full_frame["sourceFullDecodedRgbaSha256"] = partial_canonical_sha
	_expect_rejection(wrong_full_hash, "full RGBA", "canonical hash 冒充 full provenance", failures)

	var clipped_main_dialog := fixture.duplicate(true)
	var clipped_main_report := ((clipped_main_dialog["mainCaptureReports"] as Array)[0] as Dictionary)
	clipped_main_report["dialogButtonsInBounds"] = false
	_expect_rejection(clipped_main_dialog, "真实 Main/display", "Main 对话按钮越界", failures)

	var attestation_fixture := _valid_release_attestation_fixture()
	var attestation_base_errors := _validate_release_attestation(attestation_fixture)
	if not attestation_base_errors.is_empty():
		failures.append("有效 release attestation fixture 被拒绝：%s" % "；".join(attestation_base_errors))

	var catalog_flag_flip := attestation_fixture.duplicate(true)
	(catalog_flag_flip["record"] as Dictionary)["ownerReviewStatus"] = "pending"
	_expect_attestation_rejection(catalog_flag_flip, "catalog 状态", "只翻 catalog release 字段", failures)

	var swapped_runtime_png := attestation_fixture.duplicate(true)
	var swapped_hashes := swapped_runtime_png["currentFileHashes"] as Dictionary
	swapped_hashes["world/directions/north/idle/idle-1.png"] = _hash("swapped-runtime-png")
	_expect_attestation_rejection(swapped_runtime_png, "当前运行文件", "替换运行 PNG", failures)

	var swapped_attestation := attestation_fixture.duplicate(true)
	swapped_attestation["actualAttestationSha256"] = _hash("swapped-attestation")
	_expect_attestation_rejection(swapped_attestation, "catalog SHA-256", "替换 attestation", failures)

	var invalid_summary_hash := attestation_fixture.duplicate(true)
	(((invalid_summary_hash["attestation"] as Dictionary)["strictEvidence"] as Dictionary)["mainCaptureReportSha256s"] as Array)[0] = "not-a-sha256"
	_expect_attestation_rejection(invalid_summary_hash, "数组含无效", "attestation 数组畸形 hash", failures)

	var unexpected_strict_evidence := attestation_fixture.duplicate(true)
	var unexpected_strict_summary := (unexpected_strict_evidence["attestation"] as Dictionary)["strictEvidence"] as Dictionary
	unexpected_strict_summary["unacceptedEvidenceSha256"] = _hash("not-owner-accepted")
	_expect_attestation_rejection(unexpected_strict_evidence, "字段集合", "attestation 偷塞 owner 未接受证据", failures)

	var missing_stage_strict_evidence := attestation_fixture.duplicate(true)
	var missing_stage_summary := (missing_stage_strict_evidence["attestation"] as Dictionary)["strictEvidence"] as Dictionary
	missing_stage_summary.erase("blindStageAResultSha256")
	_expect_attestation_rejection(missing_stage_strict_evidence, "字段集合", "attestation 缺 Stage A strict hash", failures)

	var missing_owner_decision := attestation_fixture.duplicate(true)
	missing_owner_decision["ownerDecision"] = {}
	missing_owner_decision["actualOwnerDecisionSha256"] = ""
	_expect_attestation_rejection(missing_owner_decision, "owner decision", "owner decision 缺失", failures)

	var tampered_owner_decision := attestation_fixture.duplicate(true)
	tampered_owner_decision["actualOwnerDecisionSha256"] = _hash("tampered-owner-decision")
	_expect_attestation_rejection(tampered_owner_decision, "owner decision", "owner decision 被篡改", failures)

	var owner_evidence_drift := attestation_fixture.duplicate(true)
	(((owner_evidence_drift["ownerDecision"] as Dictionary)["acceptedEvidence"] as Dictionary)["mainCaptureReportSha256s"] as Array)[0] = _hash("unaccepted-main-report")
	_expect_attestation_rejection(owner_evidence_drift, "批准证据", "owner decision 未接受当前证据", failures)

	var owner_stage_evidence_drift := attestation_fixture.duplicate(true)
	var owner_stage_evidence := (owner_stage_evidence_drift["ownerDecision"] as Dictionary)["acceptedEvidence"] as Dictionary
	owner_stage_evidence["blindStageBObservationSha256"] = _hash("unaccepted-stage-b")
	_expect_attestation_rejection(owner_stage_evidence_drift, "批准证据", "owner decision Stage B hash 漂移", failures)

	var partial_source := Image.create(4, 4, false, Image.FORMAT_RGBA8)
	partial_source.fill(Color8(0, 0, 0, 0))
	partial_source.set_pixel(1, 1, Color8(219, 41, 133, 96))
	partial_source.set_pixel(2, 2, Color8(80, 170, 110, 255))
	var godot_loaded := partial_source.duplicate() as Image
	godot_loaded.set_pixel(0, 0, Color8(45, 55, 65, 0))
	godot_loaded.set_pixel(1, 1, Color8(12, 220, 40, 96))
	if _fixture_image_signature(partial_source) == _fixture_image_signature(godot_loaded):
		failures.append("partial-alpha strict fixture 没有制造 full RGBA 差异")
	var partial_catalog_errors := NpcArtCatalog.source_import_pixel_contract_errors(partial_source, godot_loaded)
	if not partial_catalog_errors.is_empty():
		failures.append("catalog strict 误拒 Godot 合法透明/半透明 RGB 改写：%s" % "；".join(partial_catalog_errors))

	var opaque_drift := godot_loaded.duplicate() as Image
	opaque_drift.set_pixel(2, 2, Color8(220, 20, 40, 255))
	if NpcArtCatalog.source_import_pixel_contract_errors(partial_source, opaque_drift).is_empty():
		failures.append("catalog strict 未拒绝 opaque RGB 漂移")
	var alpha_drift := godot_loaded.duplicate() as Image
	alpha_drift.set_pixel(1, 1, Color8(12, 220, 40, 97))
	if NpcArtCatalog.source_import_pixel_contract_errors(partial_source, alpha_drift).is_empty():
		failures.append("catalog strict 未拒绝 alpha 漂移")
	var dirty_source := partial_source.duplicate() as Image
	dirty_source.set_pixel(0, 0, Color8(45, 55, 65, 0))
	if NpcArtCatalog.source_import_pixel_contract_errors(dirty_source, godot_loaded).is_empty():
		failures.append("catalog strict 未拒绝源 PNG 透明像素脏 RGB")

	if NpcArtCatalog.normal_runtime_uses_strict_release_evidence():
		failures.append("normal runtime 误启用 strict release evidence")
	var catalog_source := FileAccess.get_file_as_string("res://scripts/world/npc_art_catalog.gd")
	var warm_start := catalog_source.find("static func warm_appearance(")
	var warm_end := catalog_source.find("static func enable_qa_preview_appearance(", warm_start)
	var warm_block := catalog_source.substr(warm_start, warm_end - warm_start) if warm_start >= 0 and warm_end > warm_start else ""
	if warm_block == "" or not warm_block.contains("NORMAL_RUNTIME_STRICT_RELEASE_EVIDENCE") or warm_block.contains("append_strict_errors"):
		failures.append("warm_appearance 源码合同未隔离 strict evidence")
	var initialize_start := catalog_source.find("static func initialize(")
	var initialize_end := catalog_source.find("static func all_appearance_records(", initialize_start)
	var initialize_block := catalog_source.substr(initialize_start, initialize_end - initialize_start) if initialize_start >= 0 and initialize_end > initialize_start else ""
	if (
		initialize_block == ""
		or initialize_block.contains("return validation_errors(")
		or not initialize_block.contains("_append_record_errors(record, errors, false, false)")
		or initialize_block.contains("Image.load_from_file")
		or initialize_block.contains("_append_metadata_errors")
	):
		failures.append("initialize 源码合同仍会触发 metadata/source/pixel audit")
	var attestation_start := catalog_source.find("static func _append_runtime_release_attestation_errors(")
	var attestation_end := catalog_source.find("static func _append_release_attestation_strict_binding_errors(", attestation_start)
	var attestation_block := catalog_source.substr(attestation_start, attestation_end - attestation_start) if attestation_start >= 0 and attestation_end > attestation_start else ""
	if (
		attestation_block == ""
		or attestation_block.contains("Image.load_from_file")
		or attestation_block.contains("OS.execute")
		or attestation_block.contains(".run/")
		or attestation_block.contains("_append_metadata_errors")
	):
		failures.append("normal runtime release attestation 误触发外部证据/像素审计")

	if failures.is_empty():
		print("npc art release evidence check passed: staged evidence, attestation, and runtime contracts")
		quit(0)
		return
	for failure in failures:
		push_error("npc art release evidence check failed: %s" % failure)
	quit(1)


func _expect_rejection(
	fixture: Dictionary,
	expected_fragment: String,
	label: String,
	failures: Array[String]
) -> void:
	var errors := _validate(fixture)
	if errors.is_empty():
		failures.append("%s 未被拒绝" % label)
		return
	for error in errors:
		if error.contains(expected_fragment):
			return
	failures.append("%s 虽被拒绝但未命中 %s：%s" % [label, expected_fragment, "；".join(errors)])


func _expect_attestation_rejection(
	fixture: Dictionary,
	expected_fragment: String,
	label: String,
	failures: Array[String]
) -> void:
	var errors := _validate_release_attestation(fixture)
	if errors.is_empty():
		failures.append("%s 未被拒绝" % label)
		return
	for error in errors:
		if error.contains(expected_fragment):
			return
	failures.append("%s 虽被拒绝但未命中 %s：%s" % [label, expected_fragment, "；".join(errors)])


func _validate_release_attestation(fixture: Dictionary) -> Array[String]:
	return NpcArtCatalog.runtime_release_attestation_document_errors(
		fixture["record"] as Dictionary,
		fixture["attestation"] as Dictionary,
		str(fixture.get("actualAttestationSha256", "")),
		fixture["currentFileHashes"] as Dictionary,
		fixture["ownerDecision"] as Dictionary,
		str(fixture.get("actualOwnerDecisionSha256", ""))
	)


func _validate(fixture: Dictionary) -> Array[String]:
	var main_capture_reports: Array[Dictionary] = []
	var reports_value = fixture.get("mainCaptureReports", [])
	if reports_value is Array:
		for report_value in reports_value as Array:
			if report_value is Dictionary:
				main_capture_reports.append(report_value as Dictionary)
	return NpcArtReleaseEvidence.validation_errors_from_documents(
		APPEARANCE_ID,
		fixture["review"] as Dictionary,
		fixture["installation"] as Dictionary,
		fixture["evidenceIndex"] as Dictionary,
		fixture["parityReports"] as Dictionary,
		fixture["blindAudit"] as Dictionary,
		fixture["blindPacket"] as Dictionary,
		fixture["producerMapping"] as Dictionary,
		fixture["stageAResult"] as Dictionary,
		fixture["stageBObservation"] as Dictionary,
		main_capture_reports,
		REPO_ROOT
	)


func _valid_fixture() -> Dictionary:
	var installation_frames: Array[Dictionary] = []
	var installation_by_key: Dictionary = {}
	for direction in WorldVisualDirectionContract.DIRECTIONS:
		var world := {
			"kind": "world",
			"slot": "%s/idle/1" % direction,
			"sourceRuntimePath": "runtime/world/%s/idle-1.png" % direction,
			"installedPath": "world/directions/%s/idle/idle-1.png" % direction,
			"fileSha256": _hash("world-file-%s" % direction),
			"rgbaSha256": _hash("world-rgba-%s" % direction),
		}
		installation_frames.append(world)
		installation_by_key["world|%s" % direction] = world
	for state in NpcArtReleaseEvidence.PORTRAIT_STATES:
		var portrait := {
			"kind": "portrait",
			"slot": state,
			"sourceRuntimePath": "runtime/portraits/%s.png" % state,
			"installedPath": "portrait/%s.png" % state,
			"fileSha256": _hash("portrait-file-%s" % state),
			"rgbaSha256": _hash("portrait-rgba-%s" % state),
		}
		installation_frames.append(portrait)
		installation_by_key["portrait|%s" % state] = portrait
	var installation := {"frames": installation_frames}

	var parity_frames: Array[Dictionary] = []
	for direction in WorldVisualDirectionContract.DIRECTIONS:
		var installed := installation_by_key["world|%s" % direction] as Dictionary
		parity_frames.append(_parity_frame("world", direction, installed))
	for state in NpcArtReleaseEvidence.PORTRAIT_STATES:
		var installed := installation_by_key["portrait|%s" % state] as Dictionary
		parity_frames.append(_parity_frame("portrait", state, installed))
	var source_set_sha := NpcArtReleaseEvidence.parity_source_set_sha256(parity_frames)
	var run_id := "phase327-evidence-self-test"
	var parity_reports := {
		"preflight": _parity_report("preflight", run_id, source_set_sha, parity_frames),
		"recording": _parity_report("recording", run_id, source_set_sha, parity_frames),
		"grid": _parity_report("grid", run_id, source_set_sha, parity_frames),
	}

	var evidence_index_sha := _hash("evidence-index")
	var video_sha := _hash("review-video")
	var screenshot_sha := _hash("main-screenshot")
	var stage_a_result_sha := _hash("stage-a-original-result")
	var stage_b_observation_sha := _hash("stage-b-original-observation")
	var run_root := ".run/evidence/phase327/self-test/%s" % run_id
	var appearance_root := "%s/%s" % [run_root, APPEARANCE_ID]
	var appearance_entry := {
		"appearanceId": APPEARANCE_ID,
		"runId": run_id,
		"status": "passed",
		"sourceSetSha256": source_set_sha,
		"preflightParity": _parity_artifact("%s/preflight-parity.json" % appearance_root, "preflight", source_set_sha),
		"recordingParity": _parity_artifact("%s/recording-parity.json" % appearance_root, "recording", source_set_sha),
		"gridParity": _parity_artifact("%s/grid-parity.json" % appearance_root, "grid", source_set_sha),
		"video": {
			"path": "%s/review.mp4" % appearance_root,
			"sha256": video_sha,
			"sizeBytes": 4096,
			"codec": "h264",
			"width": 1280,
			"height": 720,
			"fps": 30.0,
			"durationSeconds": 361.0 / 30.0,
			"frameCount": 361,
			"expectedEncodedDurationSeconds": 361.0 / 30.0,
			"expectedFrameCount": 361,
			"decodeStatus": "passed",
		},
	}
	var evidence_index := {
		"schemaVersion": 1,
		"indexType": "beastbound_npc_direction_review_evidence",
		"runId": run_id,
		"status": "passed",
		"generatedAtUtc": "2026-07-21T12:00:00Z",
		"scene": "res://scenes/qa/NpcDirectionReview.tscn",
		"appearanceIds": [APPEARANCE_ID],
		"expected": {
			"parityFramesPerAppearance": 12,
			"worldFramesPerAppearance": 8,
			"portraitFramesPerAppearance": 4,
			"width": 1280,
			"height": 720,
			"fps": 30.0,
			"directionHoldSeconds": 1.5,
			"sceneDurationSeconds": 12.0,
			"encodedDurationSeconds": 361.0 / 30.0,
			"encodedFrameCount": 361,
			"runtimeMirroring": false,
		},
		"appearances": [appearance_entry],
	}

	var review := {
		"runtimeEvidenceIndex": "%s/%s/evidence-index.json" % [REPO_ROOT, run_root],
		"runtimeEvidenceIndexSha256": evidence_index_sha,
		"runtimeVideo": "%s/%s/review.mp4" % [REPO_ROOT, appearance_root],
		"runtimeVideoSha256": video_sha,
		"runtimeScreenshots": ["%s/%s/main-dialog.png" % [REPO_ROOT, appearance_root]],
		"runtimeScreenshotSha256s": [screenshot_sha],
		"blindReviewPacket": "%s/%s/blind/reviewer-packet.json" % [REPO_ROOT, appearance_root],
		"blindReviewPacketSha256": _hash("blind-review-packet"),
		"blindProducerMapping": "%s/%s/private/producer-mapping.json" % [REPO_ROOT, appearance_root],
		"blindProducerMappingSha256": _hash("blind-producer-mapping"),
		"blindStageAResult": "%s/%s/staged-review/stage-a-result.json" % [REPO_ROOT, appearance_root],
		"blindStageAResultSha256": stage_a_result_sha,
		"blindStageBObservation": "%s/%s/staged-review/stage-b-observation.json" % [REPO_ROOT, appearance_root],
		"blindStageBObservationSha256": stage_b_observation_sha,
		"mainCaptureReports": ["%s/%s/main-capture-report.json" % [REPO_ROOT, appearance_root]],
		"mainCaptureReportSha256s": [_hash("main-capture-report")],
	}

	var producer_id := "agent:npc-evidence-producer"
	var reviewer_id := "agent:independent-npc-reviewer"
	var presentation: Array[Dictionary] = []
	var anonymous_assets: Array[Dictionary] = []
	for presentation_index in range(WorldVisualDirectionContract.DIRECTIONS.size()):
		var direction := WorldVisualDirectionContract.DIRECTIONS[(presentation_index + 1) % 8]
		var installed := installation_by_key["world|%s" % direction] as Dictionary
		var anonymous_file_sha := _hash("anonymous-file-%d" % presentation_index)
		var anonymous_rgba_sha := _hash("anonymous-rgba-%d" % presentation_index)
		anonymous_assets.append({
			"presentationIndex": presentation_index,
			"opaquePath": "%s/%s/blind/%s.png" % [REPO_ROOT, appearance_root, _hash("opaque-%d" % presentation_index).substr(0, 32)],
			"fileSha256": anonymous_file_sha,
			"rgbaSha256": anonymous_rgba_sha,
		})
		presentation.append({
			"presentationIndex": presentation_index,
			"sourceRuntimePath": installed["sourceRuntimePath"],
			"installedPath": installed["installedPath"],
			"fileSha256": installed["fileSha256"],
			"rgbaSha256": installed["rgbaSha256"],
			"anonymousFileSha256": anonymous_file_sha,
			"anonymousRgbaSha256": anonymous_rgba_sha,
			"wrapperOperation": "transparent_pad_32_to_320_v1",
		})
	var blind_packet := {
		"schemaVersion": 1,
		"packetType": "beastbound_npc_blind_review_packet",
		"status": "prepared",
		"appearanceId": APPEARANCE_ID,
		"evidenceIndexSha256": evidence_index_sha,
		"producerId": producer_id,
		"generatedAtUtc": "2026-07-21T12:01:00Z",
		"assets": anonymous_assets,
	}
	var shuffle_seed_sha := _hash("blind-shuffle-seed")
	var producer_mapping := {
		"schemaVersion": 1,
		"mappingType": "beastbound_npc_blind_producer_mapping",
		"status": "prepared",
		"appearanceId": APPEARANCE_ID,
		"evidenceIndexSha256": evidence_index_sha,
		"sourceSetSha256": source_set_sha,
		"reviewPacketSha256": review["blindReviewPacketSha256"],
		"shuffleSeedSha256": shuffle_seed_sha,
		"producerId": producer_id,
		"generatedAtUtc": "2026-07-21T12:01:30Z",
		"presentation": presentation,
	}

	var direction_results: Array[Dictionary] = []
	for presentation_index in range(presentation.size()):
		var direction := str(presentation[presentation_index]["sourceRuntimePath"]).trim_prefix("runtime/world/").trim_suffix("/idle-1.png")
		direction_results.append({
			"presentationIndex": presentation_index,
			"classifiedDirection": direction,
			"status": "pass",
			"visualObservation": "%s 轮廓朝向清楚" % direction,
		})
	var portrait_inspections: Array[Dictionary] = []
	var portrait_bindings: Array[Dictionary] = []
	for state in NpcArtReleaseEvidence.PORTRAIT_STATES:
		var installed := installation_by_key["portrait|%s" % state] as Dictionary
		var reviewer_artifact_path := "%s/%s/stage-b/portraits/%s.png" % [
			REPO_ROOT,
			appearance_root,
			_hash("stage-b-portrait-%s" % state).substr(0, 32),
		]
		portrait_inspections.append({
			"state": state,
			"reviewerArtifactPath": reviewer_artifact_path,
			"reviewerArtifactSha256": installed["fileSha256"],
			"status": "pass",
			"visualObservation": "%s 人像身份一致" % state,
		})
		portrait_bindings.append({
			"state": state,
			"reviewerArtifactPath": reviewer_artifact_path,
			"reviewerArtifactSha256": installed["fileSha256"],
			"sourceRuntimePath": installed["sourceRuntimePath"],
			"installedPath": installed["installedPath"],
			"fileSha256": installed["fileSha256"],
			"rgbaSha256": installed["rgbaSha256"],
		})
	var main_capture_report := {
		"schemaVersion": 1,
		"reportType": "beastbound_npc_main_review_capture",
		"processKind": "main_capture",
		"runId": run_id,
		"status": "passed",
		"ok": true,
		"scene": "res://scenes/Main.tscn",
		"qaPreview": true,
		"debugBuild": true,
		"displayServer": "macOS",
		"runtimeMirroring": false,
		"defaultProfileIsolation": true,
		"profileIsolation": "default_profile_ephemeral_no_save",
		"profileSaveEnabled": false,
		"serverAccountSession": false,
		"authAutoBypass": false,
		"accountAuthenticated": false,
		"debugUiVisible": false,
		"normalPlayerUi": true,
		"qaDebugControlsVisible": false,
		"qaPanelVisible": false,
		"authPanelVisible": false,
		"appearanceId": APPEARANCE_ID,
		"mapId": "firebud_village_gate",
		"npcId": "firebud_fixture_keeper",
		"worldVisible": true,
		"portraitVisible": true,
		"dialogVisible": true,
		"dialogButtonsInBounds": true,
		"dialogVisibleButtonCount": 2,
		"viewportSize": [1280, 720],
		"frames": parity_frames.duplicate(true),
		"sources": parity_frames.duplicate(true),
		"checkedFrames": 12,
		"passedFrames": 12,
		"sourceSetSha256": source_set_sha,
		"screenshotPath": review["runtimeScreenshots"][0],
		"screenshotSha256": screenshot_sha,
		"screenshot": {
			"path": review["runtimeScreenshots"][0],
			"fileSha256": screenshot_sha,
			"decodedRgbaSha256": _hash("main-screenshot-rgba"),
			"width": 1280,
			"height": 720,
		},
		"errors": [],
	}
	var main_scene_observations: Array[Dictionary] = [{
		"reviewerArtifactPath": review["runtimeScreenshots"][0],
		"reviewerArtifactSha256": screenshot_sha,
		"scene": "res://scenes/Main.tscn",
		"mapId": "firebud_village_gate",
		"npcId": "firebud_fixture_keeper",
		"appearanceId": APPEARANCE_ID,
		"worldVisible": true,
		"portraitVisible": true,
		"status": "pass",
		"visualObservation": "at least one world sprite and one portrait are clearly visible",
	}]
	var stage_a_result := {
		"schemaVersion": 1,
		"resultType": "beastbound_npc_blind_stage_a_result",
		"status": "frozen",
		"appearanceId": APPEARANCE_ID,
		"reviewerId": reviewer_id,
		"reviewPacketSha256": review["blindReviewPacketSha256"],
		"frozenAtUtc": "2026-07-21T12:03:00Z",
		"directionResults": direction_results.duplicate(true),
	}
	var stage_b_observation := {
		"schemaVersion": 1,
		"observationType": "beastbound_npc_blind_stage_b_observation",
		"status": "frozen",
		"appearanceId": APPEARANCE_ID,
		"reviewerId": reviewer_id,
		"stageAResultSha256": stage_a_result_sha,
		"frozenAtUtc": "2026-07-21T12:04:00Z",
		"portraitInspections": portrait_inspections.duplicate(true),
		"mainSceneObservations": main_scene_observations.duplicate(true),
	}
	var blind_audit := {
		"schemaVersion": 2,
		"auditType": "beastbound_npc_direction_blind_audit",
		"status": "pass",
		"appearanceId": APPEARANCE_ID,
		"runtimeScene": "res://scenes/Main.tscn",
		"evidenceIndexSha256": evidence_index_sha,
		"runtimeVideoSha256": video_sha,
		"runtimeScreenshotSha256s": [screenshot_sha],
		"canonicalDirections": WorldVisualDirectionContract.DIRECTIONS.duplicate(),
		"flags": [],
		"producerId": producer_id,
		"reviewerId": reviewer_id,
		"producedAtUtc": "2026-07-21T12:05:00Z",
		"reviewPacketSha256": review["blindReviewPacketSha256"],
		"shuffleSeedSha256": shuffle_seed_sha,
		"stageAResultPath": review["blindStageAResult"],
		"stageAResultSha256": stage_a_result_sha,
		"stageBObservationPath": review["blindStageBObservation"],
		"stageBObservationSha256": stage_b_observation_sha,
		"directionResults": direction_results.duplicate(true),
		"portraitInspections": portrait_inspections.duplicate(true),
		"portraitBindings": portrait_bindings,
		"mainSceneObservations": main_scene_observations.duplicate(true),
	}
	return {
		"review": review,
		"installation": installation,
		"evidenceIndex": evidence_index,
		"parityReports": parity_reports,
		"blindAudit": blind_audit,
		"blindPacket": blind_packet,
		"producerMapping": producer_mapping,
		"stageAResult": stage_a_result,
		"stageBObservation": stage_b_observation,
		"mainCaptureReports": [main_capture_report],
	}


func _valid_release_attestation_fixture() -> Dictionary:
	var attestation_file_sha := _hash("release-attestation-file")
	var owner_decision_file_sha := _hash("release-owner-decision-file")
	var record := {
		"appearanceId": APPEARANCE_ID,
		"status": "approved",
		"ownerReviewStatus": "approved",
		"releaseApproved": true,
		"runtimeEnabled": true,
		"assetRoot": "client/godot/assets/npcs/%s" % APPEARANCE_ID,
		"releaseAttestationPath": "client/godot/assets/npcs/%s/release-attestation.json" % APPEARANCE_ID,
		"releaseAttestationSha256": attestation_file_sha,
		"world": {
			"actions": {"idle": {"frameCount": 1}},
		},
		"portraits": {
			"states": {
				"neutral": "portrait/neutral.png",
				"speaking": "portrait/speaking.png",
				"smile": "portrait/smile.png",
				"concerned": "portrait/concerned.png",
			},
		},
	}
	var frames: Array[Dictionary] = []
	var parity_frames: Array[Dictionary] = []
	var current_file_hashes: Dictionary = {}
	for direction in WorldVisualDirectionContract.DIRECTIONS:
		var installed_path := "world/directions/%s/idle/idle-1.png" % direction
		var frame := {
			"kind": "world",
			"slot": "%s/idle/1" % direction,
			"sourceRuntimePath": "runtime/world/%s/idle-1.png" % direction,
			"installedPath": installed_path,
			"fileSha256": _hash("attestation-world-file-%s" % direction),
			"rgbaSha256": _hash("attestation-world-rgba-%s" % direction),
		}
		frames.append(frame)
		current_file_hashes[installed_path] = frame["fileSha256"]
		parity_frames.append(_parity_frame("world", direction, frame))
	for state in NpcArtReleaseEvidence.PORTRAIT_STATES:
		var installed_path := "portrait/%s.png" % state
		var frame := {
			"kind": "portrait",
			"slot": state,
			"sourceRuntimePath": "runtime/portraits/%s.png" % state,
			"installedPath": installed_path,
			"fileSha256": _hash("attestation-portrait-file-%s" % state),
			"rgbaSha256": _hash("attestation-portrait-rgba-%s" % state),
		}
		frames.append(frame)
		current_file_hashes[installed_path] = frame["fileSha256"]
		parity_frames.append(_parity_frame("portrait", state, frame))
	var source_set_sha := NpcArtReleaseEvidence.parity_source_set_sha256(parity_frames)
	var runtime_evidence_index_sha := _hash("attestation-evidence-index")
	var approved_at := "2026-07-21T13:00:00Z"
	var strict_evidence := {
		"sourceSetSha256": source_set_sha,
		"runtimeEvidenceIndexSha256": runtime_evidence_index_sha,
		"blindStageAResultSha256": _hash("attestation-stage-a-result"),
		"blindStageBObservationSha256": _hash("attestation-stage-b-observation"),
		"blindAuditSha256": _hash("attestation-blind-audit"),
		"blindReviewPacketSha256": _hash("attestation-blind-packet"),
		"blindProducerMappingSha256": _hash("attestation-private-mapping"),
		"runtimeVideoSha256": _hash("attestation-video"),
		"mainCaptureReportSha256s": [_hash("attestation-main-report")],
		"runtimeScreenshotSha256s": [_hash("attestation-main-screenshot")],
	}
	var attestation := {
		"schemaVersion": 1,
		"attestationType": "beastbound_npc_runtime_release_attestation",
		"status": "passed",
		"appearanceId": APPEARANCE_ID,
		"ownerReviewStatus": "approved",
		"releaseApproved": true,
		"runtimeEnabled": true,
		"ownerApprovedAtUtc": approved_at,
		"ownerDecisionRecord": "client/godot/assets/npcs/%s/release-owner-decision.json" % APPEARANCE_ID,
		"ownerDecisionRecordSha256": owner_decision_file_sha,
		"sourceSetSha256": source_set_sha,
		"strictEvidence": strict_evidence,
		"frames": frames,
	}
	var owner_decision := {
		"schemaVersion": 1,
		"decisionType": "beastbound_npc_owner_release_decision",
		"appearanceId": APPEARANCE_ID,
		"decision": "approved",
		"ownerReviewStatus": "approved",
		"ownerId": "project-owner:test-fixture",
		"releaseApproved": true,
		"runtimeEnabled": true,
		"approvedAtUtc": approved_at,
		"sourceSetSha256": source_set_sha,
		"runtimeEvidenceIndexSha256": runtime_evidence_index_sha,
		"acceptedEvidence": strict_evidence.duplicate(true),
	}
	return {
		"record": record,
		"attestation": attestation,
		"actualAttestationSha256": attestation_file_sha,
		"currentFileHashes": current_file_hashes,
		"ownerDecision": owner_decision,
		"actualOwnerDecisionSha256": owner_decision_file_sha,
	}


func _parity_frame(kind: String, slot: String, installed: Dictionary) -> Dictionary:
	return {
		"kind": kind,
		"slot": slot,
		"path": "res://assets/npcs/%s/%s" % [APPEARANCE_ID, installed["installedPath"]],
		"fileSha256": installed["fileSha256"],
		"sourceFullDecodedRgbaSha256": installed["rgbaSha256"],
		"sourceDecodedRgbaSha256": installed["rgbaSha256"],
		"loadedDecodedRgbaSha256": installed["rgbaSha256"],
		"importFresh": true,
		"loadMode": "godot_import",
		"canonicalRgbaMatch": true,
		"sourceLoadedRgbaMatch": true,
		"status": "passed",
		"errors": [],
	}


func _parity_report(
	process_kind: String,
	run_id: String,
	source_set_sha: String,
	frames: Array[Dictionary]
) -> Dictionary:
	return {
		"schemaVersion": 1,
		"reportType": "beastbound_npc_direction_review_parity",
		"appearanceId": APPEARANCE_ID,
		"runId": run_id,
		"processKind": process_kind,
		"status": "passed",
		"checkedFrames": 12,
		"passedFrames": 12,
		"runtimeMirroring": false,
		"sourceSetSha256": source_set_sha,
		"frames": frames.duplicate(true),
		"errors": [],
	}


func _parity_artifact(path: String, process_kind: String, source_set_sha: String) -> Dictionary:
	return {
		"path": path,
		"sha256": _hash("artifact-%s" % process_kind),
		"sizeBytes": 1024,
		"status": "passed",
		"processKind": process_kind,
		"checkedFrames": 12,
		"passedFrames": 12,
		"expectedFrames": 12,
		"sourceSetSha256": source_set_sha,
	}


func _hash(value: String) -> String:
	var context := HashingContext.new()
	context.start(HashingContext.HASH_SHA256)
	context.update(value.to_utf8_buffer())
	return context.finish().hex_encode()


func _fixture_image_signature(image: Image) -> String:
	var rgba := image.duplicate() as Image
	if rgba.get_format() != Image.FORMAT_RGBA8:
		rgba.convert(Image.FORMAT_RGBA8)
	var context := HashingContext.new()
	context.start(HashingContext.HASH_SHA256)
	context.update(("%dx%d:RGBA\n" % [rgba.get_width(), rgba.get_height()]).to_utf8_buffer())
	context.update(rgba.get_data())
	return context.finish().hex_encode()
