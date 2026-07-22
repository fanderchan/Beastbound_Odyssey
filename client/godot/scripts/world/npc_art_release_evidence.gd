extends RefCounted

const WorldVisualDirectionContract := preload("res://scripts/world/world_visual_direction_contract.gd")

const INDEX_SCHEMA_VERSION := 1
const INDEX_TYPE := "beastbound_npc_direction_review_evidence"
const INDEX_SCENE := "res://scenes/qa/NpcDirectionReview.tscn"
const PARITY_SCHEMA_VERSION := 1
const PARITY_TYPE := "beastbound_npc_direction_review_parity"
const BLIND_AUDIT_SCHEMA_VERSION := 2
const BLIND_AUDIT_TYPE := "beastbound_npc_direction_blind_audit"
const BLIND_STAGE_A_SCHEMA_VERSION := 1
const BLIND_STAGE_A_RESULT_TYPE := "beastbound_npc_blind_stage_a_result"
const BLIND_STAGE_B_SCHEMA_VERSION := 1
const BLIND_STAGE_B_OBSERVATION_TYPE := "beastbound_npc_blind_stage_b_observation"
const BLIND_PACKET_SCHEMA_VERSION := 1
const BLIND_PACKET_TYPE := "beastbound_npc_blind_review_packet"
const BLIND_MAPPING_SCHEMA_VERSION := 1
const BLIND_MAPPING_TYPE := "beastbound_npc_blind_producer_mapping"
const MAIN_CAPTURE_SCHEMA_VERSION := 1
const MAIN_CAPTURE_TYPE := "beastbound_npc_main_review_capture"
const MAIN_SCENE := "res://scenes/Main.tscn"
const SOURCE_SET_SCHEMA_VERSION_V1 := 1
const SOURCE_SET_SCHEMA_VERSION_V2 := 2

const PORTRAIT_STATES: Array[String] = ["neutral", "speaking", "smile", "concerned"]
const PARITY_PROCESS_KEYS: Dictionary = {
	"preflight": "preflightParity",
	"recording": "recordingParity",
	"grid": "gridParity",
}
const EXPECTED_PARITY_FRAMES := 12
const EXPECTED_WIDTH := 1280
const EXPECTED_HEIGHT := 720
const EXPECTED_FPS := 30.0
const EXPECTED_FRAME_COUNT := 361
const EXPECTED_DURATION_SECONDS := 361.0 / 30.0
const FLOAT_EPSILON := 0.0005


static func append_strict_errors(
	appearance_id: String,
	review: Dictionary,
	installation: Dictionary,
	errors: Array[String],
	source_set_schema_version: int = SOURCE_SET_SCHEMA_VERSION_V2
) -> void:
	var index_path := str(review.get("runtimeEvidenceIndex", ""))
	var index_sha256 := str(review.get("runtimeEvidenceIndexSha256", ""))
	var evidence_index := _read_frozen_json(
		index_path,
		index_sha256,
		"NPC review.runtimeEvidenceIndex",
		errors
	)
	var repo_root := _repository_root()
	var appearance_entry := _index_appearance_entry(evidence_index, appearance_id)
	var parity_reports: Dictionary = {}
	for process_kind_value in PARITY_PROCESS_KEYS.keys():
		var process_kind := str(process_kind_value)
		var artifact_key := str(PARITY_PROCESS_KEYS[process_kind])
		var artifact_value = appearance_entry.get(artifact_key, {})
		if not (artifact_value is Dictionary):
			errors.append("NPC evidence index 缺少 %s parity artifact：%s" % [process_kind, appearance_id])
			continue
		var report := _read_index_json_artifact(
			artifact_value as Dictionary,
			repo_root,
			"NPC %s parity" % process_kind,
			errors
		)
		if not report.is_empty():
			parity_reports[process_kind] = report

	var video_value = appearance_entry.get("video", {})
	if video_value is Dictionary:
		_validate_index_artifact_file(
			video_value as Dictionary,
			repo_root,
			"NPC evidence index review.mp4",
			errors
		)

	var blind_audit := _read_frozen_json(
		str(review.get("blindAudit", "")),
		str(review.get("blindAuditSha256", "")),
		"NPC review.blindAudit",
		errors
	)
	var blind_packet_path := str(review.get("blindReviewPacket", ""))
	var blind_packet := _read_frozen_json(
		blind_packet_path,
		str(review.get("blindReviewPacketSha256", "")),
		"NPC blind reviewer packet",
		errors
	)
	var producer_mapping := _read_frozen_json(
		str(review.get("blindProducerMapping", "")),
		str(review.get("blindProducerMappingSha256", "")),
		"NPC blind private producer mapping",
		errors
	)
	var stage_a_result := _read_frozen_json(
		str(review.get("blindStageAResult", "")),
		str(review.get("blindStageAResultSha256", "")),
		"NPC blind Stage A original result",
		errors
	)
	var stage_b_observation := _read_frozen_json(
		str(review.get("blindStageBObservation", "")),
		str(review.get("blindStageBObservationSha256", "")),
		"NPC blind Stage B original observation",
		errors
	)
	_validate_stage_b_reviewer_artifact_files(stage_b_observation, errors)
	_append_anonymous_packet_file_errors(
		appearance_id,
		blind_packet,
		producer_mapping,
		blind_packet_path,
		errors
	)
	var main_capture_reports: Array[Dictionary] = []
	var capture_paths_value = review.get("mainCaptureReports", [])
	var capture_hashes_value = review.get("mainCaptureReportSha256s", [])
	if capture_paths_value is Array and capture_hashes_value is Array:
		var capture_paths := capture_paths_value as Array
		var capture_hashes := capture_hashes_value as Array
		for index in range(mini(capture_paths.size(), capture_hashes.size())):
			var report := _read_frozen_json(
				str(capture_paths[index]),
				str(capture_hashes[index]),
				"NPC Main capture report",
				errors
			)
			if not report.is_empty():
				main_capture_reports.append(report)

	var screenshots_value = review.get("runtimeScreenshots", [])
	var screenshot_hashes_value = review.get("runtimeScreenshotSha256s", [])
	if screenshots_value is Array and screenshot_hashes_value is Array:
		var screenshots := screenshots_value as Array
		var screenshot_hashes := screenshot_hashes_value as Array
		for index in range(mini(screenshots.size(), screenshot_hashes.size())):
			_validate_frozen_file(
				str(screenshots[index]),
				str(screenshot_hashes[index]),
				"NPC Main screenshot",
				errors
			)

	for value in validation_errors_from_documents(
		appearance_id,
		review,
		installation,
		evidence_index,
		parity_reports,
		blind_audit,
		blind_packet,
		producer_mapping,
		stage_a_result,
		stage_b_observation,
		main_capture_reports,
		repo_root,
		source_set_schema_version
	):
		errors.append(value)


static func frozen_runtime_source_set_sha256(
	appearance_id: String,
	review: Dictionary,
	errors: Array[String]
) -> String:
	var evidence_index := _read_frozen_json(
		str(review.get("runtimeEvidenceIndex", "")),
		str(review.get("runtimeEvidenceIndexSha256", "")),
		"NPC review.runtimeEvidenceIndex sourceSet binding",
		errors
	)
	var appearance_entry := _index_appearance_entry(evidence_index, appearance_id)
	var source_set_sha := str(appearance_entry.get("sourceSetSha256", ""))
	if not _is_sha256(source_set_sha):
		errors.append("NPC runtime evidence index 缺少当前 appearance sourceSet：%s" % appearance_id)
		return ""
	return source_set_sha


static func validation_errors_from_documents(
	appearance_id: String,
	review: Dictionary,
	installation: Dictionary,
	evidence_index: Dictionary,
	parity_reports: Dictionary,
	blind_audit: Dictionary,
	blind_packet: Dictionary,
	producer_mapping: Dictionary,
	stage_a_result: Dictionary,
	stage_b_observation: Dictionary,
	main_capture_reports: Array[Dictionary],
	repo_root: String,
	source_set_schema_version: int = SOURCE_SET_SCHEMA_VERSION_V2
) -> Array[String]:
	var errors: Array[String] = []
	var effective_source_set_schema_version := source_set_schema_version
	if not [SOURCE_SET_SCHEMA_VERSION_V1, SOURCE_SET_SCHEMA_VERSION_V2].has(source_set_schema_version):
		errors.append("NPC evidence sourceSet schemaVersion 仅支持 1 或 2：%s" % appearance_id)
		effective_source_set_schema_version = SOURCE_SET_SCHEMA_VERSION_V2
	var installation_frames := _expected_review_installation_frames(
		appearance_id,
		installation,
		errors
	)
	var appearance_entry := _append_index_errors(
		appearance_id,
		review,
		evidence_index,
		repo_root,
		errors
	)
	_append_parity_errors(
		appearance_id,
		evidence_index,
		appearance_entry,
		parity_reports,
		installation_frames,
		effective_source_set_schema_version,
		errors
	)
	_append_blind_errors(
		appearance_id,
		review,
		installation_frames,
		appearance_entry,
		blind_audit,
		blind_packet,
		producer_mapping,
		stage_a_result,
		stage_b_observation,
		main_capture_reports,
		repo_root,
		effective_source_set_schema_version,
		errors
	)
	return errors


static func parity_source_set_sha256(
	frames: Array,
	source_set_schema_version: int = SOURCE_SET_SCHEMA_VERSION_V2
) -> String:
	var text := ""
	for frame_value in frames:
		var frame := frame_value as Dictionary if frame_value is Dictionary else {}
		var canonical_rgba_sha := (
			str(frame.get("sourceFullDecodedRgbaSha256", ""))
			if source_set_schema_version == SOURCE_SET_SCHEMA_VERSION_V1
			else str(frame.get("sourceDecodedRgbaSha256", ""))
		)
		text += "%s\t%s\t%s\t%s\t%s\t%s\n" % [
			str(frame.get("kind", "")),
			str(frame.get("slot", "")),
			str(frame.get("path", "")),
			str(frame.get("fileSha256", "")),
			str(frame.get("sourceFullDecodedRgbaSha256", "")),
			canonical_rgba_sha,
		]
	return _sha256_text(text)


static func _append_index_errors(
	appearance_id: String,
	review: Dictionary,
	index: Dictionary,
	repo_root: String,
	errors: Array[String]
) -> Dictionary:
	if not _is_json_integer(index.get("schemaVersion")) or int(index.get("schemaVersion", 0)) != INDEX_SCHEMA_VERSION:
		errors.append("NPC runtime evidence index schemaVersion 必须为整数 1：%s" % appearance_id)
	if str(index.get("indexType", "")) != INDEX_TYPE:
		errors.append("NPC runtime evidence index 类型无效：%s" % appearance_id)
	if str(index.get("status", "")) != "passed":
		errors.append("NPC runtime evidence index 必须 status=passed：%s" % appearance_id)
	if str(index.get("scene", "")) != INDEX_SCENE:
		errors.append("NPC runtime evidence index 必须来自 NpcDirectionReview：%s" % appearance_id)
	var run_id := str(index.get("runId", "")).strip_edges()
	if run_id == "":
		errors.append("NPC runtime evidence index 缺少 runId：%s" % appearance_id)
	if not _is_utc_timestamp(str(index.get("generatedAtUtc", ""))):
		errors.append("NPC runtime evidence index generatedAtUtc 不是 UTC 时间：%s" % appearance_id)

	var appearance_ids := _string_array(index.get("appearanceIds", []))
	var appearance_id_count := 0
	for indexed_id in appearance_ids:
		if indexed_id == appearance_id:
			appearance_id_count += 1
	if appearance_id_count != 1:
		errors.append("NPC runtime evidence index 未唯一登记当前 appearance：%s" % appearance_id)

	var expected_value = index.get("expected", {})
	if not (expected_value is Dictionary):
		errors.append("NPC runtime evidence index.expected 不是对象：%s" % appearance_id)
	else:
		var expected := expected_value as Dictionary
		if (
			int(expected.get("parityFramesPerAppearance", 0)) != EXPECTED_PARITY_FRAMES
			or int(expected.get("worldFramesPerAppearance", 0)) != 8
			or int(expected.get("portraitFramesPerAppearance", 0)) != 4
			or int(expected.get("width", 0)) != EXPECTED_WIDTH
			or int(expected.get("height", 0)) != EXPECTED_HEIGHT
			or not _number_equals(expected.get("fps"), EXPECTED_FPS)
			or not _number_equals(expected.get("directionHoldSeconds"), 1.5)
			or not _number_equals(expected.get("sceneDurationSeconds"), 12.0)
			or not _number_equals(expected.get("encodedDurationSeconds"), EXPECTED_DURATION_SECONDS)
			or int(expected.get("encodedFrameCount", 0)) != EXPECTED_FRAME_COUNT
			or typeof(expected.get("runtimeMirroring")) != TYPE_BOOL
			or bool(expected.get("runtimeMirroring", true))
		):
			errors.append("NPC runtime evidence index 固定录制合同无效：%s" % appearance_id)

	var appearance_entry := _index_appearance_entry(index, appearance_id)
	if appearance_entry.is_empty():
		errors.append("NPC runtime evidence index 缺少当前 appearance 记录：%s" % appearance_id)
		return {}
	if (
		str(appearance_entry.get("appearanceId", "")) != appearance_id
		or str(appearance_entry.get("runId", "")) != run_id
		or str(appearance_entry.get("status", "")) != "passed"
	):
		errors.append("NPC runtime evidence appearance 记录不匹配：%s" % appearance_id)

	var video_value = appearance_entry.get("video", {})
	if not (video_value is Dictionary):
		errors.append("NPC runtime evidence index 缺少 review.mp4：%s" % appearance_id)
	else:
		var video := video_value as Dictionary
		var indexed_video_path := str(video.get("path", ""))
		var absolute_indexed_video := _resolve_repo_artifact(repo_root, indexed_video_path)
		var reviewed_video := _normalized_absolute_path(str(review.get("runtimeVideo", "")))
		if (
			absolute_indexed_video == ""
			or not indexed_video_path.ends_with("/%s/review.mp4" % appearance_id)
			or reviewed_video != absolute_indexed_video
			or str(video.get("sha256", "")) != str(review.get("runtimeVideoSha256", ""))
		):
			errors.append("NPC review.runtimeVideo 未精确绑定 evidence index 的当前 review.mp4：%s" % appearance_id)
		if (
			str(video.get("codec", "")) != "h264"
			or int(video.get("width", 0)) != EXPECTED_WIDTH
			or int(video.get("height", 0)) != EXPECTED_HEIGHT
			or not _number_equals(video.get("fps"), EXPECTED_FPS)
			or not _number_equals(video.get("durationSeconds"), EXPECTED_DURATION_SECONDS)
			or int(video.get("frameCount", 0)) != EXPECTED_FRAME_COUNT
			or int(video.get("expectedFrameCount", 0)) != EXPECTED_FRAME_COUNT
			or not _number_equals(video.get("expectedEncodedDurationSeconds"), EXPECTED_DURATION_SECONDS)
			or str(video.get("decodeStatus", "")) != "passed"
		):
			errors.append("NPC evidence index review.mp4 不是固定 361 帧 NpcDirectionReview：%s" % appearance_id)
	return appearance_entry


static func _append_parity_errors(
	appearance_id: String,
	evidence_index: Dictionary,
	appearance_entry: Dictionary,
	parity_reports: Dictionary,
	installation_frames: Dictionary,
	source_set_schema_version: int,
	errors: Array[String]
) -> void:
	var expected_source_set := str(appearance_entry.get("sourceSetSha256", ""))
	if not _is_sha256(expected_source_set):
		errors.append("NPC evidence appearance 缺少 sourceSetSha256：%s" % appearance_id)
	var run_id := str(evidence_index.get("runId", ""))
	for process_kind_value in PARITY_PROCESS_KEYS.keys():
		var process_kind := str(process_kind_value)
		var artifact_key := str(PARITY_PROCESS_KEYS[process_kind])
		var artifact_value = appearance_entry.get(artifact_key, {})
		if not (artifact_value is Dictionary):
			errors.append("NPC evidence appearance 缺少 %s parity 索引：%s" % [process_kind, appearance_id])
			continue
		var artifact := artifact_value as Dictionary
		if (
			str(artifact.get("status", "")) != "passed"
			or str(artifact.get("processKind", "")) != process_kind
			or int(artifact.get("checkedFrames", 0)) != EXPECTED_PARITY_FRAMES
			or int(artifact.get("passedFrames", 0)) != EXPECTED_PARITY_FRAMES
			or int(artifact.get("expectedFrames", 0)) != EXPECTED_PARITY_FRAMES
			or str(artifact.get("sourceSetSha256", "")) != expected_source_set
		):
			errors.append("NPC evidence %s parity artifact 合同不匹配：%s" % [process_kind, appearance_id])
		var report_value = parity_reports.get(process_kind, {})
		if not (report_value is Dictionary):
			errors.append("NPC 缺少 %s parity 报告正文：%s" % [process_kind, appearance_id])
			continue
		var report := report_value as Dictionary
		if (
			not _is_json_integer(report.get("schemaVersion"))
			or int(report.get("schemaVersion", 0)) != PARITY_SCHEMA_VERSION
			or str(report.get("reportType", "")) != PARITY_TYPE
			or str(report.get("status", "")) != "passed"
			or str(report.get("appearanceId", "")) != appearance_id
			or str(report.get("runId", "")) != run_id
			or str(report.get("processKind", "")) != process_kind
			or int(report.get("checkedFrames", 0)) != EXPECTED_PARITY_FRAMES
			or int(report.get("passedFrames", 0)) != EXPECTED_PARITY_FRAMES
			or typeof(report.get("runtimeMirroring")) != TYPE_BOOL
			or bool(report.get("runtimeMirroring", true))
			or not _is_empty_array(report.get("errors"))
		):
			errors.append("NPC %s parity 报告头不匹配：%s" % [process_kind, appearance_id])
		var frames_value = report.get("frames", [])
		if not (frames_value is Array) or (frames_value as Array).size() != EXPECTED_PARITY_FRAMES:
			errors.append("NPC %s parity 必须恰好含 12 帧：%s" % [process_kind, appearance_id])
			continue
		var frames := frames_value as Array
		var seen_keys: Dictionary = {}
		for frame_index in range(frames.size()):
			var frame_value = frames[frame_index]
			if not (frame_value is Dictionary):
				errors.append("NPC %s parity frames[%d] 不是对象：%s" % [process_kind, frame_index, appearance_id])
				continue
			var frame := frame_value as Dictionary
			var frame_key := "%s|%s" % [str(frame.get("kind", "")), str(frame.get("slot", ""))]
			var installed_value = installation_frames.get(frame_key, {})
			if not (installed_value is Dictionary) or seen_keys.has(frame_key):
				errors.append("NPC %s parity 帧未知或重复：%s/%s" % [process_kind, appearance_id, frame_key])
				continue
			seen_keys[frame_key] = true
			var installed := installed_value as Dictionary
			var expected_res_path := "res://assets/npcs/%s/%s" % [appearance_id, str(installed.get("installedPath", ""))]
			if (
				str(frame.get("status", "")) != "passed"
				or not _is_empty_array(frame.get("errors"))
				or typeof(frame.get("importFresh")) != TYPE_BOOL
				or not bool(frame.get("importFresh", false))
				or str(frame.get("loadMode", "")) != "godot_import"
				or typeof(frame.get("canonicalRgbaMatch")) != TYPE_BOOL
				or not bool(frame.get("canonicalRgbaMatch", false))
				or typeof(frame.get("sourceLoadedRgbaMatch")) != TYPE_BOOL
				or not bool(frame.get("sourceLoadedRgbaMatch", false))
				or str(frame.get("path", "")) != expected_res_path
				or str(frame.get("fileSha256", "")) != str(installed.get("fileSha256", ""))
				or str(frame.get("sourceFullDecodedRgbaSha256", "")) != str(installed.get("rgbaSha256", ""))
				or not _is_sha256(str(frame.get("sourceDecodedRgbaSha256", "")))
				or str(frame.get("sourceDecodedRgbaSha256", "")) != str(frame.get("loadedDecodedRgbaSha256", ""))
			):
				errors.append("NPC %s parity 帧未分别绑定 installation full RGBA 与 Godot canonical RGBA：%s/%s" % [process_kind, appearance_id, frame_key])
		if seen_keys.size() != installation_frames.size():
			errors.append("NPC %s parity 未覆盖当前 8 世界帧 + 4 人像：%s" % [process_kind, appearance_id])
		var recomputed_source_set := parity_source_set_sha256(frames, source_set_schema_version)
		if (
			str(report.get("sourceSetSha256", "")) != expected_source_set
			or recomputed_source_set != expected_source_set
		):
			errors.append("NPC %s parity sourceSet 与当前 12 帧不一致：%s" % [process_kind, appearance_id])


static func _append_blind_errors(
	appearance_id: String,
	review: Dictionary,
	installation_frames: Dictionary,
	appearance_entry: Dictionary,
	audit: Dictionary,
	packet: Dictionary,
	producer_mapping: Dictionary,
	stage_a_result: Dictionary,
	stage_b_observation: Dictionary,
	main_capture_reports: Array[Dictionary],
	repo_root: String,
	source_set_schema_version: int,
	errors: Array[String]
) -> void:
	var evidence_index_sha := str(review.get("runtimeEvidenceIndexSha256", ""))
	if not _is_sha256(evidence_index_sha):
		errors.append("NPC review.runtimeEvidenceIndexSha256 无效：%s" % appearance_id)
	if not _dictionary_has_exact_keys(audit, [
		"schemaVersion", "auditType", "status", "appearanceId", "runtimeScene",
		"evidenceIndexSha256", "runtimeVideoSha256", "runtimeScreenshotSha256s",
		"canonicalDirections", "flags", "producerId", "reviewerId", "producedAtUtc",
		"reviewPacketSha256", "shuffleSeedSha256", "directionResults",
		"stageAResultPath", "stageAResultSha256", "stageBObservationPath",
		"stageBObservationSha256", "portraitInspections", "portraitBindings",
		"mainSceneObservations",
	]):
		errors.append("NPC blind audit 顶层携带未授权答案/mapping 字段：%s" % appearance_id)
	if (
		not _is_json_integer(audit.get("schemaVersion"))
		or int(audit.get("schemaVersion", 0)) != BLIND_AUDIT_SCHEMA_VERSION
		or str(audit.get("auditType", "")) != BLIND_AUDIT_TYPE
		or str(audit.get("status", "")) != "pass"
		or str(audit.get("appearanceId", "")) != appearance_id
		or str(audit.get("runtimeScene", "")) != MAIN_SCENE
		or str(audit.get("evidenceIndexSha256", "")) != evidence_index_sha
		or str(audit.get("runtimeVideoSha256", "")) != str(review.get("runtimeVideoSha256", ""))
		or str(audit.get("reviewPacketSha256", "")) != str(review.get("blindReviewPacketSha256", ""))
		or _string_array(audit.get("canonicalDirections", [])) != WorldVisualDirectionContract.DIRECTIONS
		or not _is_empty_array(audit.get("flags"))
	):
		errors.append("NPC blind audit 未绑定当前 appearance/evidence index/Main/runtime video：%s" % appearance_id)
	var producer_id := str(audit.get("producerId", "")).strip_edges()
	var reviewer_id := str(audit.get("reviewerId", "")).strip_edges()
	if producer_id == "" or reviewer_id == "" or producer_id == reviewer_id:
		errors.append("NPC blind audit 必须登记不同的 producerId 与独立 reviewerId：%s" % appearance_id)
	if not _is_utc_timestamp(str(audit.get("producedAtUtc", ""))):
		errors.append("NPC blind audit producedAtUtc 不是 UTC 时间：%s" % appearance_id)
	var reviewed_screenshot_hashes := _string_array(review.get("runtimeScreenshotSha256s", []))
	if _string_array(audit.get("runtimeScreenshotSha256s", [])) != reviewed_screenshot_hashes:
		errors.append("NPC blind audit 未绑定当前 Main 截图 hash：%s" % appearance_id)

	_append_staged_reviewer_evidence_errors(
		appearance_id,
		review,
		audit,
		stage_a_result,
		stage_b_observation,
		errors
	)

	var source_set_sha := str(appearance_entry.get("sourceSetSha256", ""))
	if (
		not _dictionary_has_exact_keys(packet, [
			"schemaVersion", "packetType", "status", "appearanceId",
			"evidenceIndexSha256", "producerId", "generatedAtUtc", "assets",
		])
		or not _is_json_integer(packet.get("schemaVersion"))
		or int(packet.get("schemaVersion", 0)) != BLIND_PACKET_SCHEMA_VERSION
		or str(packet.get("packetType", "")) != BLIND_PACKET_TYPE
		or str(packet.get("status", "")) != "prepared"
		or str(packet.get("appearanceId", "")) != appearance_id
		or str(packet.get("evidenceIndexSha256", "")) != evidence_index_sha
		or str(packet.get("producerId", "")).strip_edges() != producer_id
		or not _is_utc_timestamp(str(packet.get("generatedAtUtc", "")))
	):
		errors.append("NPC reviewer-facing blind packet schema/evidence/producer 无效：%s" % appearance_id)
	if (
		not str(review.get("blindReviewPacket", "")).is_absolute_path()
		or not _is_sha256(str(review.get("blindReviewPacketSha256", "")))
		or not str(review.get("blindProducerMapping", "")).is_absolute_path()
		or not _is_sha256(str(review.get("blindProducerMappingSha256", "")))
	):
		errors.append("NPC review 缺少冻结的匿名 packet 或私有 producer mapping：%s" % appearance_id)
	if (
		not _dictionary_has_exact_keys(producer_mapping, [
			"schemaVersion", "mappingType", "status", "appearanceId",
			"evidenceIndexSha256", "sourceSetSha256", "reviewPacketSha256",
			"shuffleSeedSha256", "producerId", "generatedAtUtc", "presentation",
		])
		or not _is_json_integer(producer_mapping.get("schemaVersion"))
		or int(producer_mapping.get("schemaVersion", 0)) != BLIND_MAPPING_SCHEMA_VERSION
		or str(producer_mapping.get("mappingType", "")) != BLIND_MAPPING_TYPE
		or str(producer_mapping.get("status", "")) != "prepared"
		or str(producer_mapping.get("appearanceId", "")) != appearance_id
		or str(producer_mapping.get("evidenceIndexSha256", "")) != evidence_index_sha
		or str(producer_mapping.get("sourceSetSha256", "")) != source_set_sha
		or str(producer_mapping.get("reviewPacketSha256", "")) != str(review.get("blindReviewPacketSha256", ""))
		or not _is_sha256(str(producer_mapping.get("shuffleSeedSha256", "")))
		or str(producer_mapping.get("shuffleSeedSha256", "")) != str(audit.get("shuffleSeedSha256", ""))
		or str(producer_mapping.get("producerId", "")).strip_edges() != producer_id
		or not _is_utc_timestamp(str(producer_mapping.get("generatedAtUtc", "")))
	):
		errors.append("NPC private producer mapping 未绑定当前 packet/evidence/source set：%s" % appearance_id)

	var mapping_by_index := _append_blind_packet_mapping_errors(
		appearance_id,
		review,
		packet,
		producer_mapping,
		installation_frames,
		errors
	)
	_append_direction_results_errors(
		appearance_id,
		audit,
		mapping_by_index,
		errors
	)
	_append_portrait_binding_errors(
		appearance_id,
		audit,
		installation_frames,
		errors
	)
	var capture_reports_by_screenshot := _append_main_capture_report_errors(
		appearance_id,
		review,
		appearance_entry,
		installation_frames,
		main_capture_reports,
		source_set_schema_version,
		errors
	)
	_append_main_observation_errors(appearance_id, review, audit, capture_reports_by_screenshot, repo_root, errors)


static func _append_staged_reviewer_evidence_errors(
	appearance_id: String,
	review: Dictionary,
	audit: Dictionary,
	stage_a: Dictionary,
	stage_b: Dictionary,
	errors: Array[String]
) -> void:
	var stage_a_path := _normalized_absolute_path(str(review.get("blindStageAResult", "")))
	var stage_a_sha := str(review.get("blindStageAResultSha256", ""))
	var stage_b_path := _normalized_absolute_path(str(review.get("blindStageBObservation", "")))
	var stage_b_sha := str(review.get("blindStageBObservationSha256", ""))
	if (
		stage_a_path == ""
		or stage_b_path == ""
		or stage_a_path == stage_b_path
		or not _is_sha256(stage_a_sha)
		or not _is_sha256(stage_b_sha)
	):
		errors.append("NPC review 必须分别冻结 Stage A/B 原始文件 path+sha：%s" % appearance_id)
	if (
		str(audit.get("stageAResultPath", "")) != stage_a_path
		or str(audit.get("stageAResultSha256", "")) != stage_a_sha
		or str(audit.get("stageBObservationPath", "")) != stage_b_path
		or str(audit.get("stageBObservationSha256", "")) != stage_b_sha
	):
		errors.append("NPC producer audit 未原样绑定 Stage A/B path+sha：%s" % appearance_id)

	if not _dictionary_has_exact_keys(stage_a, [
		"schemaVersion", "resultType", "status", "appearanceId", "reviewerId",
		"reviewPacketSha256", "frozenAtUtc", "directionResults",
	]):
		errors.append("NPC Stage A 原始结果字段集合无效：%s" % appearance_id)
	var stage_a_reviewer := str(stage_a.get("reviewerId", "")).strip_edges()
	var stage_a_frozen_at := str(stage_a.get("frozenAtUtc", ""))
	if (
		not _is_json_integer(stage_a.get("schemaVersion"))
		or int(stage_a.get("schemaVersion", 0)) != BLIND_STAGE_A_SCHEMA_VERSION
		or str(stage_a.get("resultType", "")) != BLIND_STAGE_A_RESULT_TYPE
		or str(stage_a.get("status", "")) != "frozen"
		or str(stage_a.get("appearanceId", "")) != appearance_id
		or stage_a_reviewer == ""
		or str(stage_a.get("reviewPacketSha256", "")) != str(review.get("blindReviewPacketSha256", ""))
		or not _is_utc_timestamp(stage_a_frozen_at)
	):
		errors.append("NPC Stage A 原始结果未冻结当前 packet/appearance/reviewer：%s" % appearance_id)
	var stage_a_results_value = stage_a.get("directionResults", [])
	if not (stage_a_results_value is Array) or (stage_a_results_value as Array).size() != 8:
		errors.append("NPC Stage A 原始结果必须恰好包含八项方向分类：%s" % appearance_id)
	else:
		var stage_a_indices: Dictionary = {}
		var stage_a_directions: Dictionary = {}
		for result_value in stage_a_results_value as Array:
			if not (result_value is Dictionary):
				errors.append("NPC Stage A 原始方向结果存在非对象项：%s" % appearance_id)
				continue
			var result := result_value as Dictionary
			if not _dictionary_has_exact_keys(result, [
				"presentationIndex", "classifiedDirection", "status", "visualObservation",
			]):
				errors.append("NPC Stage A 原始方向结果携带 producer binding/private 字段：%s" % appearance_id)
				continue
			var index_value = result.get("presentationIndex")
			var direction := str(result.get("classifiedDirection", ""))
			if (
				not _is_json_integer(index_value)
				or int(index_value) < 0
				or int(index_value) >= 8
				or stage_a_indices.has(int(index_value))
				or not WorldVisualDirectionContract.DIRECTIONS.has(direction)
				or stage_a_directions.has(direction)
				or str(result.get("status", "")) != "pass"
				or str(result.get("visualObservation", "")).strip_edges().length() < 4
			):
				errors.append("NPC Stage A 原始方向分类内容无效或重复：%s" % appearance_id)
				continue
			stage_a_indices[int(index_value)] = true
			stage_a_directions[direction] = true

	if not _dictionary_has_exact_keys(stage_b, [
		"schemaVersion", "observationType", "status", "appearanceId", "reviewerId",
		"stageAResultSha256", "frozenAtUtc", "portraitInspections",
		"mainSceneObservations",
	]):
		errors.append("NPC Stage B 原始观察字段集合无效或泄露 private/mapping/方向答案：%s" % appearance_id)
	var stage_b_frozen_at := str(stage_b.get("frozenAtUtc", ""))
	if (
		not _is_json_integer(stage_b.get("schemaVersion"))
		or int(stage_b.get("schemaVersion", 0)) != BLIND_STAGE_B_SCHEMA_VERSION
		or str(stage_b.get("observationType", "")) != BLIND_STAGE_B_OBSERVATION_TYPE
		or str(stage_b.get("status", "")) != "frozen"
		or str(stage_b.get("appearanceId", "")) != appearance_id
		or str(stage_b.get("reviewerId", "")).strip_edges() != stage_a_reviewer
		or str(stage_b.get("stageAResultSha256", "")) != stage_a_sha
		or not _is_utc_timestamp(stage_b_frozen_at)
	):
		errors.append("NPC Stage B 原始观察未按当前 Stage A/reviewer 冻结：%s" % appearance_id)
	_append_stage_b_portrait_shape_errors(appearance_id, stage_b, errors)
	_append_stage_b_main_shape_errors(appearance_id, stage_b, errors)

	if audit.get("directionResults", []) != stage_a.get("directionResults", []):
		errors.append("NPC producer audit 改写了 Stage A reviewer 原文：%s" % appearance_id)
	if audit.get("portraitInspections", []) != stage_b.get("portraitInspections", []):
		errors.append("NPC producer audit 改写了 Stage B portrait reviewer 原文：%s" % appearance_id)
	if audit.get("mainSceneObservations", []) != stage_b.get("mainSceneObservations", []):
		errors.append("NPC producer audit 改写了 Stage B Main reviewer 原文：%s" % appearance_id)
	var audit_reviewer := str(audit.get("reviewerId", "")).strip_edges()
	if audit_reviewer != stage_a_reviewer:
		errors.append("NPC producer audit reviewerId 与 Stage A/B 原始文件不一致：%s" % appearance_id)
	var produced_at := str(audit.get("producedAtUtc", ""))
	if (
		_is_utc_timestamp(stage_a_frozen_at)
		and _is_utc_timestamp(stage_b_frozen_at)
		and _is_utc_timestamp(produced_at)
	):
		var stage_a_unix := Time.get_unix_time_from_datetime_string(stage_a_frozen_at)
		var stage_b_unix := Time.get_unix_time_from_datetime_string(stage_b_frozen_at)
		var produced_unix := Time.get_unix_time_from_datetime_string(produced_at)
		if stage_b_unix <= stage_a_unix or produced_unix <= stage_b_unix:
			errors.append("NPC Stage A/B/producer merge 顺序逆转或未严格递增：%s" % appearance_id)


static func _append_stage_b_portrait_shape_errors(
	appearance_id: String,
	stage_b: Dictionary,
	errors: Array[String]
) -> void:
	var inspections_value = stage_b.get("portraitInspections", [])
	if not (inspections_value is Array) or (inspections_value as Array).size() != PORTRAIT_STATES.size():
		errors.append("NPC Stage B portraitInspections 必须恰好覆盖四人像：%s" % appearance_id)
		return
	var seen_states: Dictionary = {}
	var seen_artifacts: Dictionary = {}
	for value in inspections_value as Array:
		if not (value is Dictionary):
			errors.append("NPC Stage B portraitInspections 存在非对象项：%s" % appearance_id)
			continue
		var inspection := value as Dictionary
		if not _dictionary_has_exact_keys(inspection, [
			"state", "reviewerArtifactPath", "reviewerArtifactSha256", "status",
			"visualObservation",
		]):
			errors.append("NPC Stage B portrait 原文携带 source/installed/private/方向字段：%s" % appearance_id)
			continue
		var state := str(inspection.get("state", ""))
		var artifact_path := _normalized_absolute_path(str(inspection.get("reviewerArtifactPath", "")))
		var artifact_sha := str(inspection.get("reviewerArtifactSha256", ""))
		if (
			not PORTRAIT_STATES.has(state)
			or seen_states.has(state)
			or artifact_path == ""
			or seen_artifacts.has(artifact_path)
			or not _is_sha256(artifact_sha)
			or str(inspection.get("status", "")) != "pass"
			or str(inspection.get("visualObservation", "")).strip_edges().length() < 4
			or _stage_b_artifact_path_leaks_direction_or_private(artifact_path)
			or _stage_b_text_leaks_direction_or_private(str(inspection.get("visualObservation", "")))
		):
			errors.append("NPC Stage B portrait 原始观察无效、重复或泄露方向/private：%s/%s" % [appearance_id, state])
			continue
		seen_states[state] = true
		seen_artifacts[artifact_path] = true


static func _append_stage_b_main_shape_errors(
	appearance_id: String,
	stage_b: Dictionary,
	errors: Array[String]
) -> void:
	var observations_value = stage_b.get("mainSceneObservations", [])
	if not (observations_value is Array) or (observations_value as Array).is_empty():
		errors.append("NPC Stage B Main 原始观察不能为空：%s" % appearance_id)
		return
	var seen_artifacts: Dictionary = {}
	for value in observations_value as Array:
		if not (value is Dictionary):
			errors.append("NPC Stage B Main 原始观察存在非对象项：%s" % appearance_id)
			continue
		var observation := value as Dictionary
		if not _dictionary_has_exact_keys(observation, [
			"reviewerArtifactPath", "reviewerArtifactSha256", "scene", "mapId", "npcId",
			"appearanceId", "worldVisible", "portraitVisible", "status", "visualObservation",
		]):
			errors.append("NPC Stage B Main 原文携带 direction/private/mapping/source/installed 字段：%s" % appearance_id)
			continue
		var artifact_path := _normalized_absolute_path(str(observation.get("reviewerArtifactPath", "")))
		if (
			artifact_path == ""
			or seen_artifacts.has(artifact_path)
			or not _is_sha256(str(observation.get("reviewerArtifactSha256", "")))
			or str(observation.get("scene", "")) != MAIN_SCENE
			or str(observation.get("mapId", "")).strip_edges() == ""
			or str(observation.get("npcId", "")).strip_edges() == ""
			or str(observation.get("appearanceId", "")) != appearance_id
			or typeof(observation.get("worldVisible")) != TYPE_BOOL
			or not bool(observation.get("worldVisible", false))
			or typeof(observation.get("portraitVisible")) != TYPE_BOOL
			or not bool(observation.get("portraitVisible", false))
			or str(observation.get("status", "")) != "pass"
			or str(observation.get("visualObservation", "")).strip_edges().length() < 4
			or _stage_b_artifact_path_leaks_direction_or_private(artifact_path)
			or _stage_b_text_leaks_direction_or_private(str(observation.get("visualObservation", "")))
		):
			errors.append("NPC Stage B Main 原始观察无效、重复或泄露方向/private：%s" % appearance_id)
			continue
		seen_artifacts[artifact_path] = true


static func _stage_b_text_leaks_direction_or_private(value: String) -> bool:
	var normalized := value.strip_edges().to_lower()
	var direction_expression := RegEx.new()
	if direction_expression.compile(
		"(^|[^a-z])(southwest|southeast|northwest|northeast|south|north|west|east)([^a-z]|$)"
	) == OK and direction_expression.search(normalized) != null:
		return true
	for forbidden in [
		"producer-mapping", "private", "answerkey", "sourceruntimepath",
		"installedpath", "西南", "东南", "西北", "东北", "向南", "向北", "向西", "向东",
	]:
		if normalized.contains(str(forbidden)):
			return true
	return false


static func _stage_b_artifact_path_leaks_direction_or_private(path: String) -> bool:
	var parts := path.replace("\\", "/").split("/", false)
	var first_index := maxi(0, parts.size() - 4)
	for index in range(first_index, parts.size()):
		if _stage_b_text_leaks_direction_or_private(str(parts[index])):
			return true
	return false


static func _append_blind_packet_mapping_errors(
	appearance_id: String,
	review: Dictionary,
	packet: Dictionary,
	producer_mapping: Dictionary,
	installation_frames: Dictionary,
	errors: Array[String]
) -> Dictionary:
	var result: Dictionary = {}
	var assets_value = packet.get("assets", [])
	var presentation_value = producer_mapping.get("presentation", [])
	if (
		not (assets_value is Array)
		or (assets_value as Array).size() != 8
		or not (presentation_value is Array)
		or (presentation_value as Array).size() != 8
	):
		errors.append("NPC blind packet/mapping 必须各含八个展示项：%s" % appearance_id)
		return result
	var packet_by_index: Dictionary = {}
	var seen_opaque_paths: Dictionary = {}
	var packet_directory := _normalized_absolute_path(str(review.get("blindReviewPacket", ""))).get_base_dir()
	for asset_value in assets_value as Array:
		if not (asset_value is Dictionary):
			errors.append("NPC blind packet assets 存在非对象项：%s" % appearance_id)
			continue
		var asset := asset_value as Dictionary
		if not _dictionary_has_exact_keys(asset, ["presentationIndex", "opaquePath", "fileSha256", "rgbaSha256"]):
			errors.append("NPC blind packet asset 暴露了方向/源路径字段：%s" % appearance_id)
			continue
		var presentation_index_value = asset.get("presentationIndex")
		var opaque_path := _normalized_absolute_path(str(asset.get("opaquePath", "")))
		var basename := opaque_path.get_file().to_lower()
		if (
			not _is_json_integer(presentation_index_value)
			or int(presentation_index_value) < 0
			or int(presentation_index_value) >= 8
			or packet_by_index.has(int(presentation_index_value))
			or opaque_path == ""
			or opaque_path.get_base_dir() != packet_directory
			or not _is_opaque_png_basename(basename)
			or _contains_direction_word(basename)
			or seen_opaque_paths.has(opaque_path)
			or not _is_sha256(str(asset.get("fileSha256", "")))
			or not _is_sha256(str(asset.get("rgbaSha256", "")))
		):
			errors.append("NPC blind packet 匿名 PNG 路径/index/hash 无效或 basename 泄露方向：%s" % appearance_id)
			continue
		packet_by_index[int(presentation_index_value)] = asset
		seen_opaque_paths[opaque_path] = true
	var observed_non_identity_shuffle := false
	var seen_directions: Dictionary = {}
	for entry_value in presentation_value as Array:
		if not (entry_value is Dictionary):
			errors.append("NPC private producer mapping 存在非对象项：%s" % appearance_id)
			continue
		var entry := entry_value as Dictionary
		if not _dictionary_has_exact_keys(entry, [
			"presentationIndex", "sourceRuntimePath", "installedPath", "fileSha256", "rgbaSha256",
			"anonymousFileSha256", "anonymousRgbaSha256", "wrapperOperation",
		]):
			errors.append("NPC private producer mapping 项字段无效：%s" % appearance_id)
			continue
		var presentation_index_value = entry.get("presentationIndex")
		if (
			not _is_json_integer(presentation_index_value)
			or int(presentation_index_value) < 0
			or int(presentation_index_value) >= WorldVisualDirectionContract.DIRECTIONS.size()
			or result.has(int(presentation_index_value))
		):
			errors.append("NPC private producer mapping presentationIndex 无效或重复：%s" % appearance_id)
			continue
		var presentation_index := int(presentation_index_value)
		var packet_value = packet_by_index.get(presentation_index, {})
		var direction := _world_direction_from_runtime_path(str(entry.get("sourceRuntimePath", "")))
		var installed_value = installation_frames.get("world|%s" % direction, {})
		if direction == "" or not (installed_value is Dictionary) or not (packet_value is Dictionary) or seen_directions.has(direction):
			errors.append("NPC private producer mapping 方向/匿名 packet 未知或重复：%s/%s" % [appearance_id, direction])
			continue
		seen_directions[direction] = true
		var installed := installed_value as Dictionary
		var packet_asset := packet_value as Dictionary
		if (
			str(entry.get("sourceRuntimePath", "")) != str(installed.get("sourceRuntimePath", ""))
			or str(entry.get("installedPath", "")) != str(installed.get("installedPath", ""))
			or str(entry.get("fileSha256", "")) != str(installed.get("fileSha256", ""))
			or str(entry.get("rgbaSha256", "")) != str(installed.get("rgbaSha256", ""))
			or str(entry.get("anonymousFileSha256", "")) != str(packet_asset.get("fileSha256", ""))
			or str(entry.get("anonymousRgbaSha256", "")) != str(packet_asset.get("rgbaSha256", ""))
			or str(entry.get("wrapperOperation", "")) != "transparent_pad_32_to_320_v1"
			or str(packet_asset.get("fileSha256", "")) == str(installed.get("fileSha256", ""))
			or str(packet_asset.get("rgbaSha256", "")) == str(installed.get("rgbaSha256", ""))
		):
			errors.append("NPC private mapping/neutral anonymous wrapper 未绑定当前安装帧或仍可 hash 解盲：%s/%s" % [appearance_id, direction])
		result[presentation_index] = entry
		observed_non_identity_shuffle = observed_non_identity_shuffle or presentation_index != WorldVisualDirectionContract.DIRECTIONS.find(direction)
	if result.size() != WorldVisualDirectionContract.DIRECTIONS.size() or not observed_non_identity_shuffle:
		errors.append("NPC blind producer mapping 必须完整且非恒等打乱：%s" % appearance_id)
	return result


static func _append_direction_results_errors(
	appearance_id: String,
	audit: Dictionary,
	mapping_by_index: Dictionary,
	errors: Array[String]
) -> void:
	var results_value = audit.get("directionResults", [])
	if not (results_value is Array) or (results_value as Array).size() != WorldVisualDirectionContract.DIRECTIONS.size():
		errors.append("NPC blind audit directionResults 必须恰好覆盖八向：%s" % appearance_id)
		return
	var seen_indices: Dictionary = {}
	var classified_directions: Dictionary = {}
	for result_value in results_value as Array:
		if not (result_value is Dictionary):
			errors.append("NPC blind audit directionResults 存在非对象项：%s" % appearance_id)
			continue
		var result := result_value as Dictionary
		if not _dictionary_has_exact_keys(result, ["presentationIndex", "classifiedDirection", "status", "visualObservation"]):
			errors.append("NPC blind reviewer result 携带 sourcePath/hash/答案字段，已泄题：%s" % appearance_id)
			continue
		var presentation_index_value = result.get("presentationIndex")
		var classified_direction := str(result.get("classifiedDirection", ""))
		if (
			not _is_json_integer(presentation_index_value)
			or int(presentation_index_value) < 0
			or int(presentation_index_value) >= 8
			or seen_indices.has(int(presentation_index_value))
			or not WorldVisualDirectionContract.DIRECTIONS.has(classified_direction)
			or classified_directions.has(classified_direction)
		):
			errors.append("NPC blind reviewer classification/index 无效或重复：%s" % appearance_id)
			continue
		var presentation_index := int(presentation_index_value)
		seen_indices[presentation_index] = true
		classified_directions[classified_direction] = true
		var mapping_value = mapping_by_index.get(presentation_index, {})
		if not (mapping_value is Dictionary):
			errors.append("NPC blind reviewer classification 没有私有映射：%s/%d" % [appearance_id, presentation_index])
			continue
		var mapping_entry := mapping_value as Dictionary
		var actual_direction := _world_direction_from_runtime_path(str(mapping_entry.get("sourceRuntimePath", "")))
		if (
			classified_direction != actual_direction
			or str(result.get("status", "")) != "pass"
			or str(result.get("visualObservation", "")).strip_edges().length() < 4
		):
			errors.append("NPC blind reviewer 方向分类经私有 mapping 解盲后错误：%s/%d" % [appearance_id, presentation_index])
	if classified_directions.size() != 8 or seen_indices.size() != 8:
		errors.append("NPC blind audit 八向分类覆盖不完整：%s" % appearance_id)


static func _append_anonymous_packet_file_errors(
	appearance_id: String,
	packet: Dictionary,
	producer_mapping: Dictionary,
	packet_path: String,
	errors: Array[String]
) -> void:
	if packet.is_empty() or producer_mapping.is_empty() or not packet_path.is_absolute_path():
		return
	var mapping_by_index: Dictionary = {}
	var presentation_value = producer_mapping.get("presentation", [])
	if presentation_value is Array:
		for value in presentation_value as Array:
			if value is Dictionary and _is_json_integer((value as Dictionary).get("presentationIndex")):
				mapping_by_index[int((value as Dictionary).get("presentationIndex"))] = value
	var assets_value = packet.get("assets", [])
	if not (assets_value is Array):
		return
	for value in assets_value as Array:
		if not (value is Dictionary):
			continue
		var asset := value as Dictionary
		var presentation_index_value = asset.get("presentationIndex")
		if not _is_json_integer(presentation_index_value):
			continue
		var mapping_value = mapping_by_index.get(int(presentation_index_value), {})
		if not (mapping_value is Dictionary):
			continue
		var mapping := mapping_value as Dictionary
		var opaque_path := _normalized_absolute_path(str(asset.get("opaquePath", "")))
		if opaque_path == "" or not FileAccess.file_exists(opaque_path):
			errors.append("NPC blind packet 缺少匿名 PNG：%s/%s" % [appearance_id, opaque_path])
			continue
		var opaque_file_sha := FileAccess.get_sha256(opaque_path)
		var opaque_image := Image.load_from_file(opaque_path)
		if (
			opaque_file_sha != str(asset.get("fileSha256", ""))
			or opaque_image == null
			or opaque_image.is_empty()
			or opaque_image.get_width() != 320
			or opaque_image.get_height() != 320
		):
			errors.append("NPC blind packet 匿名 PNG 文件/hash/320x320 合同无效：%s/%s" % [appearance_id, opaque_path])
			continue
		var opaque_rgba := _rgba8_image_copy(opaque_image)
		if _image_signature(opaque_rgba) != str(asset.get("rgbaSha256", "")):
			errors.append("NPC blind packet 匿名 PNG RGBA hash 不一致：%s/%s" % [appearance_id, opaque_path])
		var installed_path := str(mapping.get("installedPath", ""))
		var installed_resource_path := "res://assets/npcs/%s/%s" % [appearance_id, installed_path]
		if not FileAccess.file_exists(installed_resource_path):
			errors.append("NPC blind private mapping 当前安装帧不存在：%s" % installed_resource_path)
			continue
		var installed_image := Image.load_from_file(ProjectSettings.globalize_path(installed_resource_path))
		if installed_image == null or installed_image.is_empty() or installed_image.get_width() != 256 or installed_image.get_height() != 256:
			errors.append("NPC blind private mapping 当前安装帧不是 256x256：%s" % installed_resource_path)
			continue
		var installed_rgba := _rgba8_image_copy(installed_image)
		var center := opaque_rgba.get_region(Rect2i(32, 32, 256, 256))
		if (
			_image_signature(center) != _image_signature(installed_rgba)
			or opaque_file_sha == FileAccess.get_sha256(installed_resource_path)
			or _image_signature(opaque_rgba) == _image_signature(installed_rgba)
		):
			errors.append("NPC blind packet 匿名 PNG 不是不可直接 hash 解盲的中性 wrapper：%s/%s" % [appearance_id, opaque_path])
		var bytes := opaque_rgba.get_data()
		var dirty_outer_pixels := 0
		for y in range(320):
			for x in range(320):
				if x >= 32 and x < 288 and y >= 32 and y < 288:
					continue
				var offset := (y * 320 + x) * 4
				if int(bytes[offset]) != 0 or int(bytes[offset + 1]) != 0 or int(bytes[offset + 2]) != 0 or int(bytes[offset + 3]) != 0:
					dirty_outer_pixels += 1
		if dirty_outer_pixels > 0:
			errors.append("NPC blind packet 匿名 PNG 中性透明边框被污染：%s/%s" % [appearance_id, opaque_path])


static func _append_portrait_binding_errors(
	appearance_id: String,
	audit: Dictionary,
	installation_frames: Dictionary,
	errors: Array[String]
) -> void:
	var inspections_value = audit.get("portraitInspections", [])
	var bindings_value = audit.get("portraitBindings", [])
	if (
		not (inspections_value is Array)
		or (inspections_value as Array).size() != PORTRAIT_STATES.size()
		or not (bindings_value is Array)
		or (bindings_value as Array).size() != PORTRAIT_STATES.size()
	):
		errors.append("NPC producer portraitBindings 必须逐项绑定四个 Stage B 人像观察：%s" % appearance_id)
		return
	var inspection_by_state: Dictionary = {}
	for inspection_value in inspections_value as Array:
		if inspection_value is Dictionary:
			var inspection := inspection_value as Dictionary
			inspection_by_state[str(inspection.get("state", ""))] = inspection
	var seen_states: Dictionary = {}
	for binding_value in bindings_value as Array:
		if not (binding_value is Dictionary):
			errors.append("NPC producer portraitBindings 存在非对象项：%s" % appearance_id)
			continue
		var binding := binding_value as Dictionary
		if not _dictionary_has_exact_keys(binding, [
			"state", "reviewerArtifactPath", "reviewerArtifactSha256",
			"sourceRuntimePath", "installedPath", "fileSha256", "rgbaSha256",
		]):
			errors.append("NPC producer portraitBinding 字段集合无效：%s" % appearance_id)
			continue
		var state := str(binding.get("state", ""))
		var inspection_value = inspection_by_state.get(state, {})
		var installed_value = installation_frames.get("portrait|%s" % state, {})
		if (
			not PORTRAIT_STATES.has(state)
			or seen_states.has(state)
			or not (inspection_value is Dictionary)
			or not (installed_value is Dictionary)
		):
			errors.append("NPC producer portraitBinding 状态未知或重复：%s/%s" % [appearance_id, state])
			continue
		seen_states[state] = true
		var inspection := inspection_value as Dictionary
		var installed := installed_value as Dictionary
		if (
			str(binding.get("reviewerArtifactPath", "")) != str(inspection.get("reviewerArtifactPath", ""))
			or str(binding.get("reviewerArtifactSha256", "")) != str(inspection.get("reviewerArtifactSha256", ""))
			or str(binding.get("sourceRuntimePath", "")) != str(installed.get("sourceRuntimePath", ""))
			or str(binding.get("installedPath", "")) != str(installed.get("installedPath", ""))
			or str(binding.get("fileSha256", "")) != str(installed.get("fileSha256", ""))
			or str(binding.get("rgbaSha256", "")) != str(installed.get("rgbaSha256", ""))
			or str(binding.get("reviewerArtifactSha256", "")) != str(installed.get("fileSha256", ""))
		):
			errors.append("NPC producer portraitBinding 未绑定 Stage B 原件与当前安装帧：%s/%s" % [appearance_id, state])
	if seen_states.size() != PORTRAIT_STATES.size():
		errors.append("NPC producer portraitBindings 四人像覆盖不完整：%s" % appearance_id)
static func _append_main_capture_report_errors(
	appearance_id: String,
	review: Dictionary,
	appearance_entry: Dictionary,
	installation_frames: Dictionary,
	reports: Array[Dictionary],
	source_set_schema_version: int,
	errors: Array[String]
) -> Dictionary:
	var result: Dictionary = {}
	var report_paths_value = review.get("mainCaptureReports", [])
	var report_hashes_value = review.get("mainCaptureReportSha256s", [])
	var screenshot_paths_value = review.get("runtimeScreenshots", [])
	var screenshot_hashes_value = review.get("runtimeScreenshotSha256s", [])
	if (
		not (report_paths_value is Array)
		or not (report_hashes_value is Array)
		or not (screenshot_paths_value is Array)
		or not (screenshot_hashes_value is Array)
		or (report_paths_value as Array).is_empty()
		or (report_paths_value as Array).size() != (report_hashes_value as Array).size()
		or (report_paths_value as Array).size() != reports.size()
		or (report_paths_value as Array).size() != (screenshot_paths_value as Array).size()
		or (screenshot_paths_value as Array).size() != (screenshot_hashes_value as Array).size()
	):
		errors.append("NPC review.mainCaptureReports 必须逐项绑定 runtimeScreenshots：%s" % appearance_id)
		return result
	var expected_screenshot_hashes: Dictionary = {}
	for index in range((screenshot_paths_value as Array).size()):
		var screenshot_path := _normalized_absolute_path(str((screenshot_paths_value as Array)[index]))
		var screenshot_sha := str((screenshot_hashes_value as Array)[index])
		if screenshot_path == "" or not _is_sha256(screenshot_sha) or expected_screenshot_hashes.has(screenshot_path):
			errors.append("NPC runtimeScreenshots 路径/hash 无效或重复：%s" % appearance_id)
			continue
		expected_screenshot_hashes[screenshot_path] = screenshot_sha
	var run_id := str(appearance_entry.get("runId", ""))
	var expected_source_set := str(appearance_entry.get("sourceSetSha256", ""))
	for report_index in range(reports.size()):
		var report := reports[report_index]
		var report_path := _normalized_absolute_path(str((report_paths_value as Array)[report_index]))
		if report_path == "" or not _is_sha256(str((report_hashes_value as Array)[report_index])):
			errors.append("NPC Main capture report 路径/hash 无效：%s" % appearance_id)
		var profile_isolation := str(report.get("profileIsolation", ""))
		if (
			not _is_json_integer(report.get("schemaVersion"))
			or int(report.get("schemaVersion", 0)) != MAIN_CAPTURE_SCHEMA_VERSION
			or str(report.get("reportType", "")) != MAIN_CAPTURE_TYPE
			or str(report.get("status", "")) != "passed"
			or typeof(report.get("ok")) != TYPE_BOOL
			or not bool(report.get("ok", false))
			or str(report.get("runId", "")) != run_id
			or str(report.get("processKind", "")) != "main_capture"
			or str(report.get("displayServer", "")).strip_edges() == ""
			or str(report.get("displayServer", "")).to_lower() == "headless"
			or typeof(report.get("runtimeMirroring")) != TYPE_BOOL
			or bool(report.get("runtimeMirroring", true))
			or str(report.get("scene", "")) != MAIN_SCENE
			or typeof(report.get("defaultProfileIsolation")) != TYPE_BOOL
			or not bool(report.get("defaultProfileIsolation", false))
			or profile_isolation != "default_profile_ephemeral_no_save"
			or typeof(report.get("qaPreview")) != TYPE_BOOL
			or not bool(report.get("qaPreview", false))
			or typeof(report.get("debugBuild")) != TYPE_BOOL
			or not bool(report.get("debugBuild", false))
			or typeof(report.get("profileSaveEnabled")) != TYPE_BOOL
			or bool(report.get("profileSaveEnabled", true))
			or typeof(report.get("serverAccountSession")) != TYPE_BOOL
			or bool(report.get("serverAccountSession", true))
			or typeof(report.get("authAutoBypass")) != TYPE_BOOL
			or bool(report.get("authAutoBypass", true))
			or typeof(report.get("accountAuthenticated")) != TYPE_BOOL
			or bool(report.get("accountAuthenticated", true))
			or typeof(report.get("debugUiVisible")) != TYPE_BOOL
			or bool(report.get("debugUiVisible", true))
			or typeof(report.get("normalPlayerUi")) != TYPE_BOOL
			or not bool(report.get("normalPlayerUi", false))
			or typeof(report.get("qaDebugControlsVisible")) != TYPE_BOOL
			or bool(report.get("qaDebugControlsVisible", true))
			or typeof(report.get("qaPanelVisible")) != TYPE_BOOL
			or bool(report.get("qaPanelVisible", true))
			or typeof(report.get("authPanelVisible")) != TYPE_BOOL
			or bool(report.get("authPanelVisible", true))
			or str(report.get("appearanceId", "")) != appearance_id
			or str(report.get("mapId", "")).strip_edges() == ""
			or str(report.get("npcId", "")).strip_edges() == ""
			or typeof(report.get("worldVisible")) != TYPE_BOOL
			or not bool(report.get("worldVisible", false))
			or typeof(report.get("portraitVisible")) != TYPE_BOOL
			or not bool(report.get("portraitVisible", false))
			or typeof(report.get("dialogVisible")) != TYPE_BOOL
			or not bool(report.get("dialogVisible", false))
			or typeof(report.get("dialogButtonsInBounds")) != TYPE_BOOL
			or not bool(report.get("dialogButtonsInBounds", false))
			or not _is_json_integer(report.get("dialogVisibleButtonCount"))
			or int(report.get("dialogVisibleButtonCount", 0)) < 2
			or not _is_empty_array(report.get("errors"))
		):
			errors.append("NPC Main capture report 不是隔离的真实 Main/display 通过报告：%s" % appearance_id)
		var viewport: Variant = report.get("viewportSize", [])
		if not (viewport is Array) or (viewport as Array).size() != 2 or int((viewport as Array)[0]) != 1280 or int((viewport as Array)[1]) != 720:
			errors.append("NPC Main capture report viewport 不是 1280x720：%s" % appearance_id)
		var screenshot_value = report.get("screenshot", {})
		if not (screenshot_value is Dictionary):
			errors.append("NPC Main capture report 缺少 screenshot 对象：%s" % appearance_id)
			continue
		var screenshot := screenshot_value as Dictionary
		var screenshot_path := _normalized_absolute_path(str(report.get("screenshotPath", "")))
		var screenshot_sha := str(report.get("screenshotSha256", ""))
		if (
			screenshot_path == ""
			or not expected_screenshot_hashes.has(screenshot_path)
			or screenshot_sha != str(expected_screenshot_hashes.get(screenshot_path, ""))
			or _normalized_absolute_path(str(screenshot.get("path", ""))) != screenshot_path
			or str(screenshot.get("fileSha256", "")) != screenshot_sha
			or int(screenshot.get("width", 0)) != 1280
			or int(screenshot.get("height", 0)) != 720
			or not _is_sha256(str(screenshot.get("decodedRgbaSha256", "")))
			or result.has(screenshot_path)
		):
			errors.append("NPC Main capture report 未绑定当前 runtime screenshot：%s" % appearance_id)
			continue
		result[screenshot_path] = report
		var frames_value = report.get("frames", [])
		if (
			not (frames_value is Array)
			or (frames_value as Array).size() != EXPECTED_PARITY_FRAMES
			or int(report.get("checkedFrames", 0)) != EXPECTED_PARITY_FRAMES
			or int(report.get("passedFrames", 0)) != EXPECTED_PARITY_FRAMES
		):
			errors.append("NPC Main capture report 必须冻结当前 12 帧：%s" % appearance_id)
			continue
		var frames := frames_value as Array
		var seen_keys: Dictionary = {}
		for frame_value in frames:
			if not (frame_value is Dictionary):
				errors.append("NPC Main capture report frames 存在非对象项：%s" % appearance_id)
				continue
			var frame := frame_value as Dictionary
			var key := "%s|%s" % [str(frame.get("kind", "")), str(frame.get("slot", ""))]
			var installed_value = installation_frames.get(key, {})
			if not (installed_value is Dictionary) or seen_keys.has(key):
				errors.append("NPC Main capture report 帧未知或重复：%s/%s" % [appearance_id, key])
				continue
			seen_keys[key] = true
			var installed := installed_value as Dictionary
			var expected_path := "res://assets/npcs/%s/%s" % [appearance_id, str(installed.get("installedPath", ""))]
			if (
				str(frame.get("status", "")) != "passed"
				or not _is_empty_array(frame.get("errors"))
				or str(frame.get("path", "")) != expected_path
				or str(frame.get("fileSha256", "")) != str(installed.get("fileSha256", ""))
				or str(frame.get("sourceFullDecodedRgbaSha256", "")) != str(installed.get("rgbaSha256", ""))
				or not _is_sha256(str(frame.get("sourceDecodedRgbaSha256", "")))
				or str(frame.get("sourceDecodedRgbaSha256", "")) != str(frame.get("loadedDecodedRgbaSha256", ""))
				or typeof(frame.get("sourceLoadedRgbaMatch")) != TYPE_BOOL
				or not bool(frame.get("sourceLoadedRgbaMatch", false))
				or typeof(frame.get("importFresh")) != TYPE_BOOL
				or not bool(frame.get("importFresh", false))
				or str(frame.get("loadMode", "")) != "godot_import"
				or typeof(frame.get("canonicalRgbaMatch")) != TYPE_BOOL
				or not bool(frame.get("canonicalRgbaMatch", false))
			):
				errors.append("NPC Main capture report 帧未分别绑定 installation full RGBA 与 Godot canonical RGBA：%s/%s" % [appearance_id, key])
		if seen_keys.size() != installation_frames.size():
			errors.append("NPC Main capture report 未覆盖当前 world8+portrait4：%s" % appearance_id)
		if (
			str(report.get("sourceSetSha256", "")) != expected_source_set
			or parity_source_set_sha256(frames, source_set_schema_version) != expected_source_set
		):
			errors.append("NPC Main capture report sourceSet 与 evidence index/current 12 不一致：%s" % appearance_id)
	if result.size() != expected_screenshot_hashes.size():
		errors.append("NPC Main capture reports 未逐张覆盖 runtimeScreenshots：%s" % appearance_id)
	return result


static func _append_main_observation_errors(
	appearance_id: String,
	review: Dictionary,
	audit: Dictionary,
	capture_reports_by_screenshot: Dictionary,
	_repo_root: String,
	errors: Array[String]
) -> void:
	var screenshots_value = review.get("runtimeScreenshots", [])
	var screenshot_hashes_value = review.get("runtimeScreenshotSha256s", [])
	var observations_value = audit.get("mainSceneObservations", [])
	if (
		not (screenshots_value is Array)
		or (screenshots_value as Array).is_empty()
		or not (screenshot_hashes_value is Array)
		or (screenshot_hashes_value as Array).size() != (screenshots_value as Array).size()
		or not (observations_value is Array)
		or (observations_value as Array).size() != (screenshots_value as Array).size()
	):
		errors.append("NPC blind audit Main 观察必须逐项覆盖 review.runtimeScreenshots：%s" % appearance_id)
		return
	var expected_by_path: Dictionary = {}
	for index in range((screenshots_value as Array).size()):
		var path := _normalized_absolute_path(str((screenshots_value as Array)[index]))
		var sha256 := str((screenshot_hashes_value as Array)[index])
		if path == "" or not _is_sha256(sha256) or expected_by_path.has(path):
			errors.append("NPC review.runtimeScreenshots 路径/hash 无效或重复：%s" % appearance_id)
			continue
		expected_by_path[path] = sha256
	var seen_paths: Dictionary = {}
	for observation_value in observations_value as Array:
		if not (observation_value is Dictionary):
			errors.append("NPC blind audit Main 观察存在非对象项：%s" % appearance_id)
			continue
		var observation := observation_value as Dictionary
		if not _dictionary_has_exact_keys(observation, [
			"reviewerArtifactPath", "reviewerArtifactSha256", "scene", "mapId", "npcId",
			"appearanceId", "worldVisible", "portraitVisible", "status", "visualObservation",
		]):
			errors.append("NPC blind audit Main observation 字段无效：%s" % appearance_id)
			continue
		var screenshot_path := _normalized_absolute_path(str(observation.get("reviewerArtifactPath", "")))
		if not expected_by_path.has(screenshot_path) or seen_paths.has(screenshot_path):
			errors.append("NPC blind audit Main 观察截图未知或重复：%s" % appearance_id)
			continue
		seen_paths[screenshot_path] = true
		var capture_value = capture_reports_by_screenshot.get(screenshot_path, {})
		if not (capture_value is Dictionary):
			errors.append("NPC blind audit Main 观察没有对应 NpcMainReviewCapture 报告：%s" % appearance_id)
			continue
		var capture := capture_value as Dictionary
		if (
			str(observation.get("reviewerArtifactSha256", "")) != str(expected_by_path[screenshot_path])
			or str(observation.get("scene", "")) != MAIN_SCENE
			or str(observation.get("mapId", "")) != str(capture.get("mapId", ""))
			or str(observation.get("npcId", "")) != str(capture.get("npcId", ""))
			or str(observation.get("appearanceId", "")) != appearance_id
			or str(capture.get("appearanceId", "")) != appearance_id
			or typeof(observation.get("worldVisible")) != TYPE_BOOL
			or not bool(observation.get("worldVisible", false))
			or not bool(capture.get("worldVisible", false))
			or typeof(observation.get("portraitVisible")) != TYPE_BOOL
			or not bool(observation.get("portraitVisible", false))
			or not bool(capture.get("portraitVisible", false))
			or str(observation.get("status", "")) != "pass"
			or str(observation.get("visualObservation", "")).strip_edges().length() < 4
		):
			errors.append("NPC blind audit Main 观察未证明当前 NPC 世界图+人像可见：%s/%s" % [appearance_id, screenshot_path])
	if seen_paths.size() != expected_by_path.size():
		errors.append("NPC blind audit Main 截图观察覆盖不完整：%s" % appearance_id)


static func _expected_review_installation_frames(
	appearance_id: String,
	installation: Dictionary,
	errors: Array[String]
) -> Dictionary:
	var result: Dictionary = {}
	var frames_value = installation.get("frames", [])
	if not (frames_value is Array):
		errors.append("NPC release evidence installation.frames 不是数组：%s" % appearance_id)
		return result
	for frame_value in frames_value as Array:
		if not (frame_value is Dictionary):
			continue
		var frame := frame_value as Dictionary
		var kind := str(frame.get("kind", ""))
		var source_runtime_path := str(frame.get("sourceRuntimePath", ""))
		var key := ""
		if kind == "world":
			var direction := _world_direction_from_runtime_path(source_runtime_path)
			if direction != "":
				key = "world|%s" % direction
		elif kind == "portrait":
			var state := _portrait_state_from_runtime_path(source_runtime_path)
			if state != "":
				key = "portrait|%s" % state
		if key == "":
			continue
		if result.has(key):
			errors.append("NPC release evidence installation 评审帧重复：%s/%s" % [appearance_id, key])
			continue
		if (
			not _is_sha256(str(frame.get("fileSha256", "")))
			or not _is_sha256(str(frame.get("rgbaSha256", "")))
			or str(frame.get("installedPath", "")).strip_edges() == ""
		):
			errors.append("NPC release evidence installation 帧缺少当前 path/hash：%s/%s" % [appearance_id, key])
		result[key] = frame
	if result.size() != EXPECTED_PARITY_FRAMES:
		errors.append("NPC release evidence 必须绑定当前 8 世界帧 + 4 人像：%s" % appearance_id)
	return result


static func _world_direction_from_runtime_path(path: String) -> String:
	var prefix := "runtime/world/"
	var suffix := "/idle-1.png"
	if not path.begins_with(prefix) or not path.ends_with(suffix):
		return ""
	var direction := path.substr(prefix.length(), path.length() - prefix.length() - suffix.length())
	return direction if WorldVisualDirectionContract.DIRECTIONS.has(direction) else ""


static func _portrait_state_from_runtime_path(path: String) -> String:
	var prefix := "runtime/portraits/"
	var suffix := ".png"
	if not path.begins_with(prefix) or not path.ends_with(suffix):
		return ""
	var state := path.substr(prefix.length(), path.length() - prefix.length() - suffix.length())
	return state if PORTRAIT_STATES.has(state) else ""


static func _index_appearance_entry(index: Dictionary, appearance_id: String) -> Dictionary:
	var result: Dictionary = {}
	var appearances_value = index.get("appearances", [])
	if not (appearances_value is Array):
		return result
	for value in appearances_value as Array:
		if not (value is Dictionary):
			continue
		var record := value as Dictionary
		if str(record.get("appearanceId", "")) != appearance_id:
			continue
		if not result.is_empty():
			return {}
		result = record
	return result


static func _read_frozen_json(
	path: String,
	expected_sha256: String,
	label: String,
	errors: Array[String]
) -> Dictionary:
	_validate_frozen_file(path, expected_sha256, label, errors)
	if not path.is_absolute_path() or not FileAccess.file_exists(path):
		return {}
	var parsed = JSON.parse_string(FileAccess.get_file_as_string(path))
	if not (parsed is Dictionary):
		errors.append("%s 不是有效 JSON 对象：%s" % [label, path])
		return {}
	return parsed as Dictionary


static func _read_index_json_artifact(
	artifact: Dictionary,
	repo_root: String,
	label: String,
	errors: Array[String]
) -> Dictionary:
	var path := _validate_index_artifact_file(artifact, repo_root, label, errors)
	if path == "":
		return {}
	var parsed = JSON.parse_string(FileAccess.get_file_as_string(path))
	if not (parsed is Dictionary):
		errors.append("%s 不是有效 JSON 对象：%s" % [label, path])
		return {}
	return parsed as Dictionary


static func _validate_index_artifact_file(
	artifact: Dictionary,
	repo_root: String,
	label: String,
	errors: Array[String]
) -> String:
	var path := _resolve_repo_artifact(repo_root, str(artifact.get("path", "")))
	var expected_sha := str(artifact.get("sha256", ""))
	if path == "" or not _is_sha256(expected_sha):
		errors.append("%s 路径/hash 无效" % label)
		return ""
	if not FileAccess.file_exists(path):
		errors.append("%s 不存在：%s" % [label, path])
		return ""
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null or file.get_length() <= 0 or int(artifact.get("sizeBytes", 0)) != file.get_length():
		errors.append("%s 为空或 sizeBytes 不一致：%s" % [label, path])
	if FileAccess.get_sha256(path) != expected_sha:
		errors.append("%s SHA-256 不一致：%s" % [label, path])
	return path


static func _validate_frozen_file(
	path: String,
	expected_sha256: String,
	label: String,
	errors: Array[String]
) -> void:
	if not path.is_absolute_path() or _normalized_absolute_path(path) == "":
		errors.append("%s 必须为绝对路径" % label)
		return
	if not _is_sha256(expected_sha256):
		errors.append("%s SHA-256 无效" % label)
		return
	if not FileAccess.file_exists(path):
		errors.append("%s 不存在：%s" % [label, path])
		return
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null or file.get_length() <= 0:
		errors.append("%s 为空或不可读：%s" % [label, path])
		return
	if FileAccess.get_sha256(path) != expected_sha256:
		errors.append("%s SHA-256 不一致：%s" % [label, path])


static func _validate_stage_b_reviewer_artifact_files(
	stage_b: Dictionary,
	errors: Array[String]
) -> void:
	for collection_key in ["portraitInspections", "mainSceneObservations"]:
		var values = stage_b.get(collection_key, [])
		if not (values is Array):
			continue
		for index in range((values as Array).size()):
			var value = (values as Array)[index]
			if not (value is Dictionary):
				continue
			var artifact := value as Dictionary
			_validate_frozen_file(
				str(artifact.get("reviewerArtifactPath", "")),
				str(artifact.get("reviewerArtifactSha256", "")),
				"NPC Stage B %s[%d] reviewer artifact" % [collection_key, index],
				errors
			)


static func _repository_root() -> String:
	var project_root := ProjectSettings.globalize_path("res://").trim_suffix("/").simplify_path()
	return project_root.path_join("../..").simplify_path()


static func _resolve_repo_artifact(repo_root: String, relative_path: String) -> String:
	var normalized := relative_path.strip_edges().replace("\\", "/")
	if (
		normalized == ""
		or normalized.is_absolute_path()
		or normalized.contains("../")
		or normalized.ends_with("/..")
		or normalized.contains("//")
	):
		return ""
	var normalized_root := _normalized_absolute_path(repo_root)
	var resolved := normalized_root.path_join(normalized).simplify_path()
	return resolved if resolved.begins_with("%s/" % normalized_root) else ""


static func _normalized_absolute_path(path: String) -> String:
	var normalized := path.strip_edges().replace("\\", "/")
	return normalized.simplify_path() if normalized.is_absolute_path() else ""


static func _is_utc_timestamp(value: String) -> bool:
	var expression := RegEx.new()
	if expression.compile("^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]+)?Z$") != OK:
		return false
	return expression.search(value) != null


static func _dictionary_has_exact_keys(value: Dictionary, expected_keys: Array) -> bool:
	if value.size() != expected_keys.size():
		return false
	for key_value in expected_keys:
		if not value.has(str(key_value)):
			return false
	return true


static func _contains_direction_word(basename: String) -> bool:
	var normalized := basename.strip_edges().to_lower()
	for direction in WorldVisualDirectionContract.DIRECTIONS:
		if normalized.contains(direction):
			return true
	return false


static func _is_opaque_png_basename(basename: String) -> bool:
	var normalized := basename.strip_edges().to_lower()
	if not normalized.ends_with(".png"):
		return false
	var stem := normalized.trim_suffix(".png")
	if stem.length() < 16 or stem.length() > 64:
		return false
	for index in range(stem.length()):
		if not "0123456789abcdef".contains(stem.substr(index, 1)):
			return false
	return true


static func _is_sha256(value: String) -> bool:
	var normalized := value.strip_edges().to_lower()
	if normalized.length() != 64:
		return false
	for index in range(normalized.length()):
		if not "0123456789abcdef".contains(normalized.substr(index, 1)):
			return false
	return true


static func _is_json_integer(value) -> bool:
	if typeof(value) != TYPE_INT and typeof(value) != TYPE_FLOAT:
		return false
	var number := float(value)
	return is_finite(number) and number == floor(number)


static func _number_equals(value, expected: float) -> bool:
	return (
		(typeof(value) == TYPE_INT or typeof(value) == TYPE_FLOAT)
		and is_finite(float(value))
		and absf(float(value) - expected) <= FLOAT_EPSILON
	)


static func _is_empty_array(value) -> bool:
	return value is Array and (value as Array).is_empty()


static func _string_array(value) -> Array[String]:
	var result: Array[String] = []
	if value is Array:
		for item in value as Array:
			result.append(str(item))
	return result


static func _sha256_text(value: String) -> String:
	var context := HashingContext.new()
	context.start(HashingContext.HASH_SHA256)
	context.update(value.to_utf8_buffer())
	return context.finish().hex_encode()


static func _image_signature(image: Image) -> String:
	var rgba := _rgba8_image_copy(image)
	var context := HashingContext.new()
	context.start(HashingContext.HASH_SHA256)
	context.update(("%dx%d:RGBA\n" % [rgba.get_width(), rgba.get_height()]).to_utf8_buffer())
	context.update(rgba.get_data())
	return context.finish().hex_encode()


static func _rgba8_image_copy(image: Image) -> Image:
	var rgba := image.duplicate() as Image
	if rgba.get_format() != Image.FORMAT_RGBA8:
		rgba.convert(Image.FORMAT_RGBA8)
	return rgba
