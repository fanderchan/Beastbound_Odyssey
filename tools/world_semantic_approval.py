#!/usr/bin/env python3
"""Freeze and verify human-reviewed Beastbound true-eight world frames.

This tool deliberately does *not* infer what direction a sprite is facing.  A
schema-v2 manifest may only be created after an explicit visual-audit
acknowledgement and a complete atomic-recorder evidence index.  Its SHA-256
inventory prevents either the reviewed character/pet/integrated-mounted frames
or the exact runtime parity/video/grid/contact/probe evidence from changing
without another review.  Legacy schema-v1 manifests remain auditable, but can
never produce a current passing result because they did not bind runtime
evidence.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from fractions import Fraction
from pathlib import Path, PurePosixPath
from typing import Any


SCHEMA_VERSION = 2
LEGACY_SCHEMA_VERSION = 1
MANIFEST_TYPE = "beastbound_world_semantic_direction_approval"
EVIDENCE_INDEX_SCHEMA_VERSION = 1
EVIDENCE_INDEX_TYPE = "beastbound_world_direction_review_evidence"
SEMANTIC_REVIEW_STATUS = "passed_by_visual_audit"
OWNER_REVIEW_STATUS = "pending"
CANONICAL_DIRECTIONS = (
    "south",
    "southwest",
    "west",
    "northwest",
    "north",
    "northeast",
    "east",
    "southeast",
)
WORLD_ACTIONS = {"idle": 1, "walk": 4}
CURRENT_COMPLETE_FORM_IDS = (
    "bui_novice_sprout_earth5_wind5",
    "wuli_normal_orange_fire10",
    "mossback_marsh_earth7_water3",
    "emberhorn_red_fire8_earth2",
    "blue_man_dragon_water10",
    "rebirth_beast_earth_lv50",
    "novice_tiger_mount",
)
DEFAULT_CATALOG = Path("client/godot/data/pet_art_catalog.json")
DEFAULT_CHARACTER_ROOT = Path("client/godot/assets/characters/novice_hunter")
DEFAULT_MANIFEST = Path("client/godot/data/world_semantic_direction_approval_v2.json")
REVIEW_STATEMENT = (
    "Direction semantics were judged by visual audit; automation freezes the current source "
    "frames and the exact runtime parity, video, grid, contact and probe evidence by SHA-256."
)
LEGACY_REVIEW_STATEMENT = (
    "Direction semantics were judged by visual audit; automation only freezes "
    "the reviewed paths and file hashes."
)
LEGACY_NOT_CURRENT_ERROR = (
    "schemaVersion 1 只绑定源图，未绑定实际加载纹理与录像证据；可审计但不能作为当前通过结论"
)
HASH_PATTERN = re.compile(r"^[0-9a-f]{64}$")
MD5_PATTERN = re.compile(r"^[0-9a-f]{32}$")
SAFE_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")
PARITY_EVIDENCE_KEYS = ("preflightParity", "parity", "gridParity")
PARITY_EVIDENCE_FILENAMES = {
    "preflightParity": "preflight-parity.json",
    "parity": "recording-parity.json",
    "gridParity": "grid-parity.json",
}
ARTIFACT_EVIDENCE_KEYS = ("video", "grid", "contact", "probe")
REVIEW_SCENE = "res://scenes/qa/CharacterMountDirectionReview.tscn"
EXPECTED_PARITY_FRAMES = 120
EXPECTED_WIDTH = 1280
EXPECTED_HEIGHT = 720
EXPECTED_FPS = 30.0
EXPECTED_FRAME_COUNT = 433
EXPECTED_SCENE_DURATION_SECONDS = 14.4
EXPECTED_ENCODED_DURATION_SECONDS = EXPECTED_FRAME_COUNT / EXPECTED_FPS
MAX_DURATION_ERROR_SECONDS = 1.0 / EXPECTED_FPS
EXPECTED_CONTACT_HEIGHT = 2880
EXPECTED_CONTACT_SAMPLE_INDICES = tuple(
    frame
    for direction_index in range(8)
    for frame in (direction_index * 54 + 9, direction_index * 54 + 36)
)
EXPECTED_CONTACT_SAMPLE_CONTRACT = "per_direction_idle_at_0.30s_then_walk_at_1.20s"
EXPECTED_FORM_EVIDENCE_FILES = {
    "contact-decode.log",
    "contact.log",
    "ffprobe.json",
    "grid-decode.log",
    "grid-parity.json",
    "grid.log",
    "grid.png",
    "preflight-parity.json",
    "preflight-parity.log",
    "recording-parity.json",
    "recording.log",
    "review-contact-sheet.png",
    "review.avi",
    "review.mp4",
    "transcode.log",
    "video-decode.log",
}
CANONICAL_PARTIAL_RGB = "rgb_zeroed_where_alpha_below_255_before_rgba_hash"


class ApprovalError(ValueError):
    """A user-facing approval-contract failure."""


def _repo_path(value: Path | str, repo_root: Path, *, label: str) -> tuple[Path, str]:
    raw = Path(value).as_posix()
    pure = PurePosixPath(raw)
    if raw.startswith(("/", "\\")) or pure.is_absolute() or ".." in pure.parts:
        raise ApprovalError(f"{label} 必须是安全的 repo-relative 路径：{raw}")
    relative = Path(*pure.parts)
    resolved = (repo_root / relative).resolve(strict=False)
    try:
        resolved.relative_to(repo_root)
    except ValueError as error:
        raise ApprovalError(f"{label} 越出仓库根目录：{raw}") from error
    return resolved, relative.as_posix()


def _load_json(path: Path, *, label: str) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ApprovalError(f"无法读取 {label}：{path}: {error}") from error
    if not isinstance(value, dict):
        raise ApprovalError(f"{label} 根节点必须是对象：{path}")
    return value


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _md5(path: Path) -> str:
    digest = hashlib.md5(usedforsecurity=False)
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _duration_matches(value: Any, expected: float) -> bool:
    if isinstance(value, bool):
        return False
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return False
    return abs(parsed - expected) <= MAX_DURATION_ERROR_SECONDS


def _parse_fraction(value: Any, *, label: str) -> Fraction:
    try:
        return Fraction(str(value))
    except (ValueError, ZeroDivisionError) as error:
        raise ApprovalError(f"{label} 不是有效分数：{value!r}") from error


def _file_record(path: Path, relative: str) -> dict[str, Any]:
    return {
        "path": relative,
        "sha256": _sha256(path),
        "sizeBytes": path.stat().st_size,
    }


def _validate_file_record(
    value: Any,
    *,
    repo_root: Path,
    label: str,
    required_parent: Path | None = None,
) -> tuple[Path, str]:
    if not isinstance(value, dict):
        raise ApprovalError(f"{label} 必须是文件记录对象")
    raw_path = value.get("path")
    if not isinstance(raw_path, str) or not raw_path.strip():
        raise ApprovalError(f"{label}.path 必须是非空 repo-relative 路径")
    absolute_path, relative = _repo_path(raw_path, repo_root, label=f"{label}.path")
    if raw_path != relative:
        raise ApprovalError(f"{label}.path 必须是规范 POSIX 路径：{relative}")
    if required_parent is not None:
        try:
            absolute_path.relative_to(required_parent)
        except ValueError as error:
            raise ApprovalError(f"{label}.path 必须位于 {required_parent.relative_to(repo_root)} 内") from error
    if not absolute_path.is_file():
        raise ApprovalError(f"{label} 证据文件不存在：{relative}")
    expected_hash = value.get("sha256")
    if not isinstance(expected_hash, str) or HASH_PATTERN.fullmatch(expected_hash) is None:
        raise ApprovalError(f"{label}.sha256 必须是小写 SHA-256")
    current_hash = _sha256(absolute_path)
    if current_hash != expected_hash:
        raise ApprovalError(f"{label} 证据哈希漂移：{relative}")
    expected_size = value.get("sizeBytes")
    if not isinstance(expected_size, int) or isinstance(expected_size, bool) or expected_size <= 0:
        raise ApprovalError(f"{label}.sizeBytes 必须是正整数")
    if absolute_path.stat().st_size != expected_size:
        raise ApprovalError(f"{label} 证据大小漂移：{relative}")
    return absolute_path, relative


def _validate_parity_evidence(
    value: Any,
    *,
    repo_root: Path,
    form_id: str,
    run_id: str,
    label: str,
    required_parent: Path,
    expected_frames: dict[tuple[str, str, str, int], dict[str, str]],
) -> str:
    parity_path, relative = _validate_file_record(
        value,
        repo_root=repo_root,
        label=label,
        required_parent=required_parent,
    )
    assert isinstance(value, dict)
    exact_index_fields = {
        "status": "passed",
        "checkedFrames": EXPECTED_PARITY_FRAMES,
        "passedFrames": EXPECTED_PARITY_FRAMES,
        "expectedFrames": EXPECTED_PARITY_FRAMES,
    }
    for field, expected in exact_index_fields.items():
        if value.get(field) != expected:
            raise ApprovalError(f"{label}.{field} 必须为 {expected!r}")
    index_source_set = value.get("sourceSetSha256")
    if not isinstance(index_source_set, str) or HASH_PATTERN.fullmatch(index_source_set) is None:
        raise ApprovalError(f"{label}.sourceSetSha256 必须是小写 SHA-256")

    report = _load_json(parity_path, label=label)
    exact_report_fields = {
        "schemaVersion": 1,
        "formId": form_id,
        "runId": run_id,
        "status": "passed",
        "checkedFrames": EXPECTED_PARITY_FRAMES,
        "passedFrames": EXPECTED_PARITY_FRAMES,
        "sourceSetSha256": index_source_set,
        "canonicalPartialRgb": CANONICAL_PARTIAL_RGB,
    }
    for field, expected in exact_report_fields.items():
        if report.get(field) != expected:
            raise ApprovalError(f"{label} 文件内 {field} 必须为 {expected!r}")
    if report.get("errors") != []:
        raise ApprovalError(f"{label} 文件内 errors 必须为空数组")
    frames = report.get("frames")
    if not isinstance(frames, list) or len(frames) != EXPECTED_PARITY_FRAMES:
        raise ApprovalError(f"{label} 文件内 frames 必须恰好包含 {EXPECTED_PARITY_FRAMES} 帧")
    actual_keys: list[tuple[str, str, str, int]] = []
    source_set_lines: list[str] = []
    for frame_index, frame in enumerate(frames):
        frame_label = f"{label}.frames[{frame_index}]"
        if not isinstance(frame, dict):
            raise ApprovalError(f"{frame_label} 必须是对象")
        kind = frame.get("kind")
        direction = frame.get("direction")
        action = frame.get("action")
        index = frame.get("index")
        if not isinstance(kind, str) or not isinstance(direction, str) or not isinstance(action, str):
            raise ApprovalError(f"{frame_label} 缺少 kind/direction/action")
        if not isinstance(index, int) or isinstance(index, bool):
            raise ApprovalError(f"{frame_label}.index 必须是整数")
        key = (kind, direction, action, index)
        expected = expected_frames.get(key)
        if expected is None:
            raise ApprovalError(f"{frame_label} 不是规范的 character/pet/mounted 世界帧：{key}")
        actual_keys.append(key)
        exact_fields = {
            "status": "passed",
            "errors": [],
            "path": expected["path"],
            "sourceFileSha256": expected["sha256"],
            "sourceFileMd5": expected["md5"],
            "importSourceMd5": expected["md5"],
            "importFresh": True,
            "loadMode": "godot_import",
            "canonicalRgbaMatch": True,
        }
        for field, expected_value in exact_fields.items():
            if frame.get(field) != expected_value:
                raise ApprovalError(f"{frame_label}.{field} 必须为 {expected_value!r}")
        source_decoded = frame.get("sourceDecodedRgbaSha256")
        loaded_decoded = frame.get("loadedDecodedRgbaSha256")
        if (
            not isinstance(source_decoded, str)
            or HASH_PATTERN.fullmatch(source_decoded) is None
            or loaded_decoded != source_decoded
        ):
            raise ApprovalError(f"{frame_label} 解码 RGBA 哈希必须是相同的小写 SHA-256")
        source_set_lines.append(
            "%s\t%s\t%s\t%s\t%s\n"
            % (kind, expected["path"], expected["sha256"], source_decoded, loaded_decoded)
        )
    expected_keys = list(expected_frames)
    if actual_keys != expected_keys:
        if len(set(actual_keys)) != len(actual_keys):
            raise ApprovalError(f"{label} 文件内 frames 含重复规范键")
        raise ApprovalError(f"{label} 文件内 frames 顺序或覆盖与 3x40 规范集合不一致")
    recomputed_source_set = hashlib.sha256("".join(source_set_lines).encode("utf-8")).hexdigest()
    if report.get("sourceSetSha256") != recomputed_source_set:
        raise ApprovalError(f"{label} 文件内 sourceSetSha256 不能由逐帧记录重算得到")
    return relative


def _expect_file_at(path: Path, expected: Path, *, label: str) -> None:
    if path.resolve() != expected.resolve():
        raise ApprovalError(f"{label}.path 必须为 {expected}")


def _validate_probe_contract(
    probe_path: Path,
    *,
    video_record: dict[str, Any],
    label: str,
) -> None:
    probe = _load_json(probe_path, label=label)
    streams = probe.get("streams")
    if not isinstance(streams, list):
        raise ApprovalError(f"{label}.streams 必须是数组")
    video_streams = [
        stream
        for stream in streams
        if isinstance(stream, dict) and stream.get("codec_type") == "video"
    ]
    if len(video_streams) != 1:
        raise ApprovalError(f"{label} 必须恰好包含一个视频流")
    stream = video_streams[0]
    exact = {
        "codec_name": "h264",
        "width": EXPECTED_WIDTH,
        "height": EXPECTED_HEIGHT,
        "nb_frames": str(EXPECTED_FRAME_COUNT),
        "nb_read_frames": str(EXPECTED_FRAME_COUNT),
    }
    for field, expected in exact.items():
        if stream.get(field) != expected:
            raise ApprovalError(f"{label} 视频流 {field} 必须为 {expected!r}")
    for field in ("avg_frame_rate", "r_frame_rate"):
        if _parse_fraction(stream.get(field), label=f"{label}.{field}") != Fraction(30, 1):
            raise ApprovalError(f"{label}.{field} 必须为 30/1")
    if not _duration_matches(stream.get("duration"), EXPECTED_ENCODED_DURATION_SECONDS):
        raise ApprovalError(f"{label} 视频流 duration 不符合 433/30 秒")
    format_value = probe.get("format")
    if not isinstance(format_value, dict):
        raise ApprovalError(f"{label}.format 必须是对象")
    format_name = format_value.get("format_name")
    if not isinstance(format_name, str) or "mp4" not in format_name.split(","):
        raise ApprovalError(f"{label}.format.format_name 必须包含 mp4")
    if not _duration_matches(format_value.get("duration"), EXPECTED_ENCODED_DURATION_SECONDS):
        raise ApprovalError(f"{label}.format.duration 不符合 433/30 秒")
    try:
        probed_size = int(format_value.get("size"))
    except (TypeError, ValueError) as error:
        raise ApprovalError(f"{label}.format.size 必须是整数") from error
    if probed_size != video_record["sizeBytes"]:
        raise ApprovalError(f"{label}.format.size 与 review.mp4 大小不一致")


def _validate_media_contract(
    *,
    form_value: dict[str, Any],
    form_parent: Path,
    repo_root: Path,
    label: str,
) -> dict[str, dict[str, Any]]:
    validated: dict[str, dict[str, Any]] = {}
    for key, filename in (
        ("video", "review.mp4"),
        ("grid", "grid.png"),
        ("contact", "review-contact-sheet.png"),
        ("probe", "ffprobe.json"),
        ("movieArchive", "review.avi"),
    ):
        record = form_value.get(key)
        path, relative = _validate_file_record(
            record,
            repo_root=repo_root,
            label=f"{label}.{key}",
            required_parent=form_parent,
        )
        _expect_file_at(path, form_parent / filename, label=f"{label}.{key}")
        assert isinstance(record, dict)
        validated[relative] = record

    video = form_value["video"]
    exact_video = {
        "codec": "h264",
        "width": EXPECTED_WIDTH,
        "height": EXPECTED_HEIGHT,
        "fps": EXPECTED_FPS,
        "frameCount": EXPECTED_FRAME_COUNT,
        "expectedDurationSeconds": EXPECTED_SCENE_DURATION_SECONDS,
        "expectedEncodedDurationSeconds": EXPECTED_ENCODED_DURATION_SECONDS,
        "expectedFrameCount": EXPECTED_FRAME_COUNT,
        "decodeStatus": "passed",
    }
    for field, expected in exact_video.items():
        if video.get(field) != expected:
            raise ApprovalError(f"{label}.video.{field} 必须为 {expected!r}")
    if not _duration_matches(video.get("durationSeconds"), EXPECTED_ENCODED_DURATION_SECONDS):
        raise ApprovalError(f"{label}.video.durationSeconds 不符合 433/30 秒")

    grid = form_value["grid"]
    for field, expected in (
        ("width", EXPECTED_WIDTH),
        ("height", EXPECTED_HEIGHT),
        ("decodeStatus", "passed"),
    ):
        if grid.get(field) != expected:
            raise ApprovalError(f"{label}.grid.{field} 必须为 {expected!r}")

    contact = form_value["contact"]
    for field, expected in (
        ("width", EXPECTED_WIDTH),
        ("height", EXPECTED_CONTACT_HEIGHT),
        ("decodeStatus", "passed"),
        ("sampleContract", EXPECTED_CONTACT_SAMPLE_CONTRACT),
        ("sampleFrameIndices", list(EXPECTED_CONTACT_SAMPLE_INDICES)),
    ):
        if contact.get(field) != expected:
            raise ApprovalError(f"{label}.contact.{field} 必须为 {expected!r}")

    probe_record = form_value["probe"]
    probe_path, _ = _repo_path(probe_record["path"], repo_root, label=f"{label}.probe.path")
    _validate_probe_contract(
        probe_path,
        video_record=video,
        label=f"{label}.probe",
    )
    return validated


def _validate_evidence_index(
    *,
    repo_root: Path,
    index_path: Path,
    index_relative: str,
    form_ids: tuple[str, ...],
    expected_frames_by_form: dict[str, dict[tuple[str, str, str, int], dict[str, str]]],
) -> dict[str, Any]:
    evidence_index = _load_json(index_path, label="evidence-index")
    if evidence_index.get("schemaVersion") != EVIDENCE_INDEX_SCHEMA_VERSION:
        raise ApprovalError(
            f"evidence-index.schemaVersion 必须为 {EVIDENCE_INDEX_SCHEMA_VERSION}"
        )
    if evidence_index.get("indexType") != EVIDENCE_INDEX_TYPE:
        raise ApprovalError(f"evidence-index.indexType 必须为 {EVIDENCE_INDEX_TYPE!r}")
    if evidence_index.get("status") != "passed":
        raise ApprovalError("evidence-index.status 必须为 'passed'")
    run_id = evidence_index.get("runId")
    if not isinstance(run_id, str) or SAFE_ID_PATTERN.fullmatch(run_id) is None:
        raise ApprovalError("evidence-index.runId 必须是安全的非空标识")
    if evidence_index.get("scene") != REVIEW_SCENE:
        raise ApprovalError(f"evidence-index.scene 必须为 {REVIEW_SCENE!r}")
    if evidence_index.get("formIds") != list(form_ids):
        raise ApprovalError("evidence-index.formIds 必须与批准目标顺序完全一致")
    expected_contract = {
        "parityFramesPerForm": EXPECTED_PARITY_FRAMES,
        "width": EXPECTED_WIDTH,
        "height": EXPECTED_HEIGHT,
        "fps": EXPECTED_FPS,
        "sceneDurationSeconds": EXPECTED_SCENE_DURATION_SECONDS,
        "encodedDurationSeconds": EXPECTED_ENCODED_DURATION_SECONDS,
        "encodedFrameCount": EXPECTED_FRAME_COUNT,
    }
    if evidence_index.get("expected") != expected_contract:
        raise ApprovalError("evidence-index.expected 与固定录制契约不一致")
    tools = evidence_index.get("tools")
    if not isinstance(tools, dict) or any(
        not isinstance(tools.get(key), str) or not tools[key].strip()
        for key in ("godot", "ffmpeg", "ffprobe", "python")
    ):
        raise ApprovalError("evidence-index.tools 必须完整记录 godot/ffmpeg/ffprobe/python 版本")
    if evidence_index.get("indexSelfHashExcluded") is not True:
        raise ApprovalError("evidence-index.indexSelfHashExcluded 必须为 true")
    forms = evidence_index.get("forms")
    if not isinstance(forms, list):
        raise ApprovalError("evidence-index.forms 必须是数组")
    by_id: dict[str, dict[str, Any]] = {}
    for index, value in enumerate(forms):
        if not isinstance(value, dict):
            raise ApprovalError(f"evidence-index.forms[{index}] 必须是对象")
        form_id = value.get("formId")
        if not isinstance(form_id, str) or not form_id:
            raise ApprovalError(f"evidence-index.forms[{index}].formId 必须是非空字符串")
        if form_id in by_id:
            raise ApprovalError(f"evidence-index formId 重复：{form_id}")
        by_id[form_id] = value
    if list(by_id) != list(form_ids) or len(forms) != len(form_ids):
        raise ApprovalError("evidence-index form 集合和顺序必须与本次批准目标完全一致")

    index_parent = index_path.parent.resolve()
    all_evidence_records: dict[str, dict[str, Any]] = {}
    for form_id in form_ids:
        value = by_id[form_id]
        label = f"evidence-index.forms[{form_id}]"
        if value.get("runId") != run_id:
            raise ApprovalError(f"{label}.runId 必须与顶层 runId 一致")
        if value.get("status") != "passed":
            raise ApprovalError(f"{label}.status 必须为 'passed'")
        form_parent = (index_parent / form_id).resolve(strict=False)
        try:
            form_parent.relative_to(index_parent)
        except ValueError as error:
            raise ApprovalError(f"非法 formId 路径：{form_id}") from error

        required_records: dict[str, dict[str, Any]] = {}
        parity_records: dict[str, tuple[str, dict[str, Any]]] = {}
        source_set_hashes: set[str] = set()
        for key in PARITY_EVIDENCE_KEYS:
            record = value.get(key)
            relative = _validate_parity_evidence(
                record,
                repo_root=repo_root,
                form_id=form_id,
                run_id=run_id,
                label=f"{label}.{key}",
                required_parent=form_parent,
                expected_frames=expected_frames_by_form[form_id],
            )
            assert isinstance(record, dict)
            parity_records[key] = (relative, record)
            source_set_hashes.add(str(record["sourceSetSha256"]))
        parity_paths = [relative for relative, _ in parity_records.values()]
        if len(set(parity_paths)) != len(PARITY_EVIDENCE_KEYS):
            raise ApprovalError(f"{label} 三份 parity 必须使用互不重复的证据路径")
        for key, (relative, record) in parity_records.items():
            expected_relative = (form_parent / PARITY_EVIDENCE_FILENAMES[key]).relative_to(
                repo_root
            ).as_posix()
            if relative != expected_relative:
                raise ApprovalError(
                    f"{label}.{key}.path 必须为 {expected_relative}"
                )
            required_records[relative] = record
        if len(source_set_hashes) != 1:
            raise ApprovalError(f"{label} 三份 parity 的 sourceSetSha256 必须一致")

        required_records.update(
            _validate_media_contract(
                form_value=value,
                form_parent=form_parent,
                repo_root=repo_root,
                label=label,
            )
        )

        files = value.get("files")
        if not isinstance(files, list) or not files:
            raise ApprovalError(f"{label}.files 必须是非空文件记录数组")
        indexed_files: dict[str, dict[str, Any]] = {}
        for file_index, record in enumerate(files):
            absolute, relative = _validate_file_record(
                record,
                repo_root=repo_root,
                label=f"{label}.files[{file_index}]",
                required_parent=form_parent,
            )
            if absolute.parent != form_parent:
                raise ApprovalError(f"{label}.files 只能包含 form 根目录直属文件：{relative}")
            if relative in indexed_files:
                raise ApprovalError(f"{label}.files 路径重复：{relative}")
            assert isinstance(record, dict)
            indexed_files[relative] = record
            if relative in all_evidence_records:
                raise ApprovalError(f"多个 form 共用同一证据文件：{relative}")
            all_evidence_records[relative] = record
        actual_filenames = {Path(relative).name for relative in indexed_files}
        if len(indexed_files) != len(EXPECTED_FORM_EVIDENCE_FILES) or actual_filenames != EXPECTED_FORM_EVIDENCE_FILES:
            missing = sorted(EXPECTED_FORM_EVIDENCE_FILES - actual_filenames)
            extra = sorted(actual_filenames - EXPECTED_FORM_EVIDENCE_FILES)
            raise ApprovalError(f"{label}.files 必须是原子录制器 16 文件集合：missing={missing} extra={extra}")
        if set(required_records) - set(indexed_files):
            missing = sorted(set(required_records) - set(indexed_files))
            raise ApprovalError(f"{label}.files 缺少必需证据：{missing[0]}")
        for relative, required_record in required_records.items():
            indexed_record = indexed_files[relative]
            for field in ("path", "sha256", "sizeBytes"):
                if indexed_record.get(field) != required_record.get(field):
                    raise ApprovalError(f"{label}.files 与 {relative} 的 {field} 不一致")

    if index_relative in all_evidence_records:
        raise ApprovalError("evidence-index 不能把自己列入 form files")
    import_record = evidence_index.get("importLog")
    import_path, import_relative = _validate_file_record(
        import_record,
        repo_root=repo_root,
        label="evidence-index.importLog",
        required_parent=index_parent,
    )
    _expect_file_at(import_path, index_parent / "godot-import.log", label="evidence-index.importLog")
    assert isinstance(import_record, dict)
    if import_relative in all_evidence_records:
        raise ApprovalError("evidence-index.importLog 不能与 form 证据复用路径")
    all_evidence_records[import_relative] = import_record

    top_files = evidence_index.get("files")
    if not isinstance(top_files, list) or not top_files:
        raise ApprovalError("evidence-index.files 必须是完整非空文件记录数组")
    top_by_path: dict[str, dict[str, Any]] = {}
    for file_index, record in enumerate(top_files):
        _, relative = _validate_file_record(
            record,
            repo_root=repo_root,
            label=f"evidence-index.files[{file_index}]",
            required_parent=index_parent,
        )
        if relative in top_by_path:
            raise ApprovalError(f"evidence-index.files 路径重复：{relative}")
        assert isinstance(record, dict)
        top_by_path[relative] = record
    if set(top_by_path) != set(all_evidence_records):
        missing = sorted(set(all_evidence_records) - set(top_by_path))
        extra = sorted(set(top_by_path) - set(all_evidence_records))
        raise ApprovalError(f"evidence-index.files 必须精确等于 form 文件并集加 importLog：missing={missing} extra={extra}")
    for relative, expected_record in all_evidence_records.items():
        for field in ("path", "sha256", "sizeBytes"):
            if top_by_path[relative].get(field) != expected_record.get(field):
                raise ApprovalError(f"evidence-index.files 与 {relative} 的 {field} 不一致")
    if evidence_index.get("indexedFileCount") != len(top_files):
        raise ApprovalError(f"evidence-index.indexedFileCount 必须为 {len(top_files)}")
    return evidence_index


def _require_pass_marker(value: dict[str, Any], *, label: str) -> None:
    markers: list[bool] = []
    if "result" in value:
        markers.append(value.get("result") == "pass")
    if "pass" in value:
        markers.append(value.get("pass") is True)
    if not markers or not all(markers):
        raise ApprovalError(f"{label} 必须有且仅有通过结论")


def _audit_report_forms(report: dict[str, Any], *, label: str) -> dict[str, dict[str, Any]]:
    forms = report.get("forms")
    parsed: dict[str, dict[str, Any]] = {}
    if isinstance(forms, list):
        for index, value in enumerate(forms):
            if not isinstance(value, dict):
                raise ApprovalError(f"{label}.forms[{index}] 必须是对象")
            form_id = value.get("formId")
            if not isinstance(form_id, str) or SAFE_ID_PATTERN.fullmatch(form_id) is None:
                raise ApprovalError(f"{label}.forms[{index}].formId 不是安全标识")
            if form_id in parsed:
                raise ApprovalError(f"{label}.forms formId 重复：{form_id}")
            parsed[form_id] = value
    elif isinstance(forms, dict):
        for form_id, value in forms.items():
            if (
                not isinstance(form_id, str)
                or SAFE_ID_PATTERN.fullmatch(form_id) is None
                or not isinstance(value, dict)
            ):
                raise ApprovalError(f"{label}.forms 必须按安全 formId 映射到对象")
            parsed[form_id] = value
    else:
        raise ApprovalError(f"{label}.forms 必须是数组或对象")
    if not parsed:
        raise ApprovalError(f"{label} 没有 form 审片结果")
    scope = report.get("scope")
    if scope is not None and scope != list(parsed):
        raise ApprovalError(f"{label}.scope 必须与 forms 顺序完全一致")
    return parsed


def _audit_evidence_path_matches(
    raw: Any,
    *,
    expected_relative: str,
    repo_root: Path,
    run_parent: Path,
) -> bool:
    if not isinstance(raw, str) or not raw:
        return False
    run_relative = run_parent.relative_to(repo_root)
    try:
        local_expected = Path(expected_relative).relative_to(run_relative).as_posix()
    except ValueError:
        return False
    return raw in (expected_relative, local_expected)


def _validate_audit_form(
    form_id: str,
    value: dict[str, Any],
    *,
    label: str,
    repo_root: Path,
    run_parent: Path,
    evidence_form: dict[str, Any],
) -> None:
    _require_pass_marker(value, label=label)
    if value.get("flags") != []:
        raise ApprovalError(f"{label}.flags 必须为空数组")
    directions = value.get("directions")
    if not isinstance(directions, list) or len(directions) != len(CANONICAL_DIRECTIONS):
        raise ApprovalError(f"{label}.directions 必须恰好包含八方向")
    seen_directions: list[str] = []
    for index, direction_value in enumerate(directions):
        direction_label = f"{label}.directions[{index}]"
        if not isinstance(direction_value, dict):
            raise ApprovalError(f"{direction_label} 必须是对象")
        direction = direction_value.get("expectedDirection", direction_value.get("direction"))
        if direction != CANONICAL_DIRECTIONS[index]:
            raise ApprovalError(f"{direction_label} 必须按规范顺序记录 {CANONICAL_DIRECTIONS[index]}")
        if "expectedDirection" in direction_value and "direction" in direction_value:
            if direction_value["expectedDirection"] != direction_value["direction"]:
                raise ApprovalError(f"{direction_label} 方向字段互相矛盾")
        seen_directions.append(str(direction))
        _require_pass_marker(direction_value, label=direction_label)
        if direction_value.get("flags", []) != []:
            raise ApprovalError(f"{direction_label}.flags 必须为空数组")
        columns = direction_value.get("columns")
        if not isinstance(columns, dict) or set(columns) != {"character", "pet", "mounted"}:
            raise ApprovalError(f"{direction_label}.columns 必须精确包含 character/pet/mounted")
        for kind in ("character", "pet", "mounted"):
            column = columns[kind]
            column_label = f"{direction_label}.columns.{kind}"
            if not isinstance(column, dict):
                raise ApprovalError(f"{column_label} 必须是对象")
            _require_pass_marker(column, label=column_label)
            if column.get("actualDirection") != direction:
                raise ApprovalError(f"{column_label}.actualDirection 必须为 {direction!r}")
            for field in ("idleActualDirection", "walkActualDirection"):
                if field in column and column.get(field) != direction:
                    raise ApprovalError(f"{column_label}.{field} 必须为 {direction!r}")
            axis_markers = [
                column[field] is True
                for field in ("idleWalkAxisStable", "idleWalkAxisPass")
                if field in column
            ]
            if not axis_markers or not all(axis_markers):
                raise ApprovalError(f"{column_label} 必须明确通过 idle/walk 守轴检查")
            if kind == "mounted":
                co_axis_markers = [
                    column[field] is True
                    for field in ("riderMountCoAxis", "riderMountAxisPass")
                    if field in column
                ]
                if not co_axis_markers or not all(co_axis_markers):
                    raise ApprovalError(f"{column_label} 必须明确通过骑手/坐骑共轴检查")
    if seen_directions != list(CANONICAL_DIRECTIONS):
        raise ApprovalError(f"{label}.directions 方向覆盖不完整")

    evidence = value.get("evidence")
    if not isinstance(evidence, dict):
        raise ApprovalError(f"{label}.evidence 必须是对象")
    video_record = evidence_form.get("video")
    contact_record = evidence_form.get("contact")
    if not isinstance(video_record, dict) or not isinstance(contact_record, dict):
        raise ApprovalError(f"{label} 缺少 evidence-index 视频/联系表记录")
    if not _audit_evidence_path_matches(
        evidence.get("video"),
        expected_relative=str(video_record["path"]),
        repo_root=repo_root,
        run_parent=run_parent,
    ):
        raise ApprovalError(f"{label}.evidence.video 未绑定当前 evidence-index 视频")
    if not _audit_evidence_path_matches(
        evidence.get("contactSheet"),
        expected_relative=str(contact_record["path"]),
        repo_root=repo_root,
        run_parent=run_parent,
    ):
        raise ApprovalError(f"{label}.evidence.contactSheet 未绑定当前 evidence-index 联系表")
    audit_video_hash = evidence.get("videoSha256")
    audit_contact_hash = evidence.get("contactSheetSha256")
    if (audit_video_hash is None) != (audit_contact_hash is None):
        raise ApprovalError(f"{label}.evidence 必须同时提供或同时省略视频/联系表哈希")
    if audit_video_hash is not None:
        if audit_video_hash != video_record.get("sha256"):
            raise ApprovalError(f"{label}.evidence.videoSha256 与 evidence-index 不一致")
        if audit_contact_hash != contact_record.get("sha256"):
            raise ApprovalError(f"{label}.evidence.contactSheetSha256 与 evidence-index 不一致")

    integrity = value.get("videoIntegrity")
    metadata = evidence.get("videoMetadata")
    if isinstance(integrity, dict):
        exact_integrity = {
            "decodedCompletely": True,
            "frameCount": EXPECTED_FRAME_COUNT,
            "fps": EXPECTED_FPS,
            "decodeErrors": 0,
        }
        for field, expected in exact_integrity.items():
            if integrity.get(field) != expected:
                raise ApprovalError(f"{label}.videoIntegrity.{field} 必须为 {expected!r}")
        if not _duration_matches(integrity.get("durationSeconds"), EXPECTED_ENCODED_DURATION_SECONDS):
            raise ApprovalError(f"{label}.videoIntegrity.durationSeconds 不符合 433/30 秒")
    elif isinstance(metadata, dict):
        exact_metadata = {
            "width": EXPECTED_WIDTH,
            "height": EXPECTED_HEIGHT,
            "fps": EXPECTED_FPS,
            "frames": EXPECTED_FRAME_COUNT,
            "fullDecodePass": True,
        }
        for field, expected in exact_metadata.items():
            if metadata.get(field) != expected:
                raise ApprovalError(f"{label}.evidence.videoMetadata.{field} 必须为 {expected!r}")
        if not _duration_matches(metadata.get("durationSeconds"), EXPECTED_ENCODED_DURATION_SECONDS):
            raise ApprovalError(f"{label}.evidence.videoMetadata.durationSeconds 不符合 433/30 秒")
    else:
        raise ApprovalError(f"{label} 必须含完整视频解码结果")


def _validate_audit_report_records(
    records: Any,
    *,
    repo_root: Path,
    required_parent: Path,
    run_id: str,
    form_ids: tuple[str, ...],
    evidence_index: dict[str, Any],
) -> int:
    if not isinstance(records, list) or not records:
        raise ApprovalError("visualAudit.reports 必须是非空文件记录数组")
    covered: set[str] = set()
    seen_paths: set[str] = set()
    for index, record in enumerate(records):
        report_path, relative = _validate_file_record(
            record,
            repo_root=repo_root,
            label=f"visualAudit.reports[{index}]",
            required_parent=required_parent,
        )
        if relative in seen_paths:
            raise ApprovalError(f"visualAudit.reports 路径重复：{relative}")
        seen_paths.add(relative)
        report = _load_json(report_path, label=f"visualAudit.reports[{index}]")
        if report.get("schemaVersion") != 1:
            raise ApprovalError(f"visualAudit.reports[{index}].schemaVersion 必须为 1")
        if report.get("runId") != run_id:
            raise ApprovalError(f"visualAudit.reports[{index}].runId 必须与 evidence-index 一致")
        top_markers: list[bool] = []
        if "result" in report:
            top_markers.append(report.get("result") == "pass")
        for container_name in ("summary", "total"):
            container = report.get(container_name)
            if isinstance(container, dict):
                if "pass" in container:
                    top_markers.append(container.get("pass") is True)
                if "flags" in container and container.get("flags") != []:
                    raise ApprovalError(f"visualAudit.reports[{index}].{container_name}.flags 必须为空数组")
        if not top_markers or not all(top_markers):
            raise ApprovalError(f"visualAudit.reports[{index}] 顶层结果必须明确为 pass")
        report_forms = _audit_report_forms(report, label=f"visualAudit.reports[{index}]")
        evidence_forms = {
            value["formId"]: value
            for value in evidence_index["forms"]
            if isinstance(value, dict) and isinstance(value.get("formId"), str)
        }
        for form_id, form_value in report_forms.items():
            if form_id in covered:
                raise ApprovalError(f"多个审片报告重复覆盖 form：{form_id}")
            evidence_form = evidence_forms.get(form_id)
            if evidence_form is None:
                raise ApprovalError(f"审片报告包含 evidence-index 外 form：{form_id}")
            _validate_audit_form(
                form_id,
                form_value,
                label=f"visualAudit.reports[{index}].forms[{form_id}]",
                repo_root=repo_root,
                run_parent=required_parent,
                evidence_form=evidence_form,
            )
            covered.add(form_id)
    if covered != set(form_ids):
        missing = sorted(set(form_ids) - covered)
        extra = sorted(covered - set(form_ids))
        raise ApprovalError(f"审片报告 form 覆盖必须精确匹配批准目标：missing={missing} extra={extra}")
    return len(records)


def _selected_form_ids(values: list[str] | None) -> tuple[str, ...]:
    selected = tuple(values or CURRENT_COMPLETE_FORM_IDS)
    if not selected or any(SAFE_ID_PATTERN.fullmatch(value) is None for value in selected):
        raise ApprovalError("至少需要一个安全的非空 --form-id")
    if len(set(selected)) != len(selected):
        raise ApprovalError("--form-id 不能重复")
    return selected


def _catalog_bundles(
    catalog: dict[str, Any],
    form_ids: tuple[str, ...],
    *,
    character_root: str,
) -> tuple[str, list[dict[str, str]]]:
    default_character_id = catalog.get("defaultCharacterId")
    if not isinstance(default_character_id, str) or not default_character_id.strip():
        raise ApprovalError("catalog.defaultCharacterId 必须是非空字符串")
    forms = catalog.get("forms")
    if not isinstance(forms, list):
        raise ApprovalError("catalog.forms 必须是数组")
    by_id: dict[str, dict[str, Any]] = {}
    for value in forms:
        if not isinstance(value, dict):
            continue
        form_id = value.get("formId")
        if isinstance(form_id, str) and form_id:
            if form_id in by_id:
                raise ApprovalError(f"catalog formId 重复：{form_id}")
            by_id[form_id] = value

    bundles = [
        {
            "bundleKey": f"character:{default_character_id}",
            "kind": "character",
            "formId": "",
            "root": character_root,
        }
    ]
    for form_id in form_ids:
        form = by_id.get(form_id)
        if form is None:
            raise ApprovalError(f"catalog 缺少目标 form：{form_id}")
        for kind in ("pet", "mounted"):
            bundle = form.get(kind)
            root = bundle.get("root") if isinstance(bundle, dict) else None
            if not isinstance(root, str) or not root.strip():
                raise ApprovalError(f"{form_id}.{kind}.root 必须是非空字符串")
            bundles.append(
                {
                    "bundleKey": f"{kind}:{form_id}",
                    "kind": kind,
                    "formId": form_id,
                    "root": root,
                }
            )
    return default_character_id, bundles


def _runtime_res_path(repo_relative: str) -> str:
    pure = PurePosixPath(repo_relative)
    parts = pure.parts
    if len(parts) >= 2 and parts[:2] == ("client", "godot"):
        parts = parts[2:]
    return "res://" + PurePosixPath(*parts).as_posix()


def _expected_parity_frames_by_form(
    bundle_specs: list[dict[str, str]],
    form_ids: tuple[str, ...],
    *,
    repo_root: Path,
) -> dict[str, dict[tuple[str, str, str, int], dict[str, str]]]:
    by_kind_and_form = {
        (bundle["kind"], bundle["formId"]): bundle
        for bundle in bundle_specs
    }
    character = by_kind_and_form.get(("character", ""))
    if character is None:
        raise ApprovalError("缺少人物 parity bundle")
    result: dict[str, dict[tuple[str, str, str, int], dict[str, str]]] = {}
    for form_id in form_ids:
        kind_bundles = {
            "character": character,
            "pet": by_kind_and_form.get(("pet", form_id)),
            "mounted": by_kind_and_form.get(("mounted", form_id)),
        }
        if any(bundle is None for bundle in kind_bundles.values()):
            raise ApprovalError(f"{form_id} 缺少 character/pet/mounted parity bundle")
        expected: dict[tuple[str, str, str, int], dict[str, str]] = {}
        for direction in CANONICAL_DIRECTIONS:
            for action, count in WORLD_ACTIONS.items():
                for index in range(1, count + 1):
                    for kind in ("character", "pet", "mounted"):
                        bundle = kind_bundles[kind]
                        assert bundle is not None
                        root_path, root_relative = _repo_path(
                            bundle["root"],
                            repo_root,
                            label=f"{kind}:{form_id}.root",
                        )
                        suffix = Path("world") / "directions" / direction / action / f"{action}-{index}.png"
                        source_path = root_path / suffix
                        if not source_path.is_file():
                            raise ApprovalError(f"parity 当前源帧不存在：{source_path.relative_to(repo_root)}")
                        repo_relative = (Path(root_relative) / suffix).as_posix()
                        expected[(kind, direction, action, index)] = {
                            "path": _runtime_res_path(repo_relative),
                            "sha256": _sha256(source_path),
                            "md5": _md5(source_path),
                        }
        if len(expected) != EXPECTED_PARITY_FRAMES:
            raise ApprovalError(f"{form_id} parity 规范应为 {EXPECTED_PARITY_FRAMES} 帧")
        result[form_id] = expected
    return result


def _expected_frame_records(
    bundle: dict[str, str],
    *,
    repo_root: Path,
) -> list[dict[str, Any]]:
    root_path, root_relative = _repo_path(bundle["root"], repo_root, label=f"{bundle['bundleKey']}.root")
    records: list[dict[str, Any]] = []
    for direction in CANONICAL_DIRECTIONS:
        for action, count in WORLD_ACTIONS.items():
            for index in range(1, count + 1):
                relative = Path("world") / "directions" / direction / action / f"{action}-{index}.png"
                frame_path = root_path / relative
                path = (Path(root_relative) / relative).as_posix()
                records.append(
                    {
                        "path": path,
                        "direction": direction,
                        "action": action,
                        "index": index,
                        "absolutePath": frame_path,
                    }
                )
    return records


def _scan_world_pngs(bundle_root: Path) -> set[Path]:
    directions_root = bundle_root / "world" / "directions"
    if not directions_root.is_dir():
        return set()
    return {path.resolve() for path in directions_root.rglob("*.png") if path.is_file()}


def _build_manifest(
    *,
    repo_root: Path,
    catalog_path: Path,
    catalog_relative: str,
    character_root: str,
    form_ids: tuple[str, ...],
    reviewer: str,
    evidence_index_path: Path,
    evidence_index_relative: str,
    evidence_index: dict[str, Any],
    audit_report_records: list[dict[str, Any]],
) -> dict[str, Any]:
    catalog = _load_json(catalog_path, label="catalog")
    default_character_id, bundle_specs = _catalog_bundles(
        catalog,
        form_ids,
        character_root=character_root,
    )
    bundles: list[dict[str, Any]] = []
    for bundle in bundle_specs:
        root_path, root_relative = _repo_path(bundle["root"], repo_root, label=f"{bundle['bundleKey']}.root")
        frame_records = _expected_frame_records(bundle, repo_root=repo_root)
        missing = [entry["path"] for entry in frame_records if not entry["absolutePath"].is_file()]
        if missing:
            raise ApprovalError(
                f"{bundle['bundleKey']} 不是完整 40 帧 world pack；缺少：{', '.join(missing[:3])}"
            )
        expected_paths = {entry["absolutePath"].resolve() for entry in frame_records}
        extras = sorted(_scan_world_pngs(root_path) - expected_paths)
        if extras:
            raise ApprovalError(
                f"{bundle['bundleKey']} 含规范外 world PNG：{extras[0].relative_to(repo_root)}"
            )
        frames = [
            {
                "path": entry["path"],
                "direction": entry["direction"],
                "action": entry["action"],
                "index": entry["index"],
                "sha256": _sha256(entry["absolutePath"]),
                "sizeBytes": entry["absolutePath"].stat().st_size,
            }
            for entry in frame_records
        ]
        bundles.append(
            {
                "bundleKey": bundle["bundleKey"],
                "kind": bundle["kind"],
                "formId": bundle["formId"] or None,
                "root": root_relative,
                "frameCount": len(frames),
                "frames": frames,
            }
        )
    return {
        "schemaVersion": SCHEMA_VERSION,
        "manifestType": MANIFEST_TYPE,
        "semanticDirectionReview": SEMANTIC_REVIEW_STATUS,
        "ownerReview": OWNER_REVIEW_STATUS,
        "automaticDirectionRecognition": False,
        "reviewStatement": REVIEW_STATEMENT,
        "catalogPath": catalog_relative,
        "defaultCharacterId": default_character_id,
        "characterRoot": character_root,
        "formIds": list(form_ids),
        "canonicalDirections": list(CANONICAL_DIRECTIONS),
        "requiredWorldActions": WORLD_ACTIONS,
        "visualAudit": {
            "reviewer": reviewer,
            "evidenceIndex": evidence_index_relative,
            "reports": audit_report_records,
        },
        "evidenceAudit": {
            "index": _file_record(evidence_index_path, evidence_index_relative),
            "snapshot": evidence_index,
        },
        "evidenceFileCount": 1
        + sum(len(value.get("files", [])) for value in evidence_index["forms"])
        + len(audit_report_records),
        "bundleCount": len(bundles),
        "frameCount": sum(bundle["frameCount"] for bundle in bundles),
        "bundles": bundles,
    }


def _validate_manifest_header(
    manifest: dict[str, Any],
    *,
    form_ids: tuple[str, ...],
    schema_version: int,
) -> list[str]:
    errors: list[str] = []
    review_statement = REVIEW_STATEMENT if schema_version == SCHEMA_VERSION else LEGACY_REVIEW_STATEMENT
    exact_fields = {
        "schemaVersion": schema_version,
        "manifestType": MANIFEST_TYPE,
        "semanticDirectionReview": SEMANTIC_REVIEW_STATUS,
        "ownerReview": OWNER_REVIEW_STATUS,
        "automaticDirectionRecognition": False,
        "reviewStatement": review_statement,
        "canonicalDirections": list(CANONICAL_DIRECTIONS),
        "requiredWorldActions": WORLD_ACTIONS,
        "formIds": list(form_ids),
    }
    for field, expected in exact_fields.items():
        if manifest.get(field) != expected:
            errors.append(f"manifest.{field} 必须为 {expected!r}")
    visual_audit = manifest.get("visualAudit")
    if not isinstance(visual_audit, dict):
        errors.append("manifest.visualAudit 必须是对象")
    else:
        if not isinstance(visual_audit.get("reviewer"), str) or not visual_audit["reviewer"].strip():
            errors.append("manifest.visualAudit.reviewer 必须是非空字符串")
        if schema_version == SCHEMA_VERSION:
            evidence_index = visual_audit.get("evidenceIndex")
            if not isinstance(evidence_index, str) or not evidence_index.strip():
                errors.append("manifest.visualAudit.evidenceIndex 必须是非空字符串")
            reports = visual_audit.get("reports")
            if not isinstance(reports, list) or not reports:
                errors.append("manifest.visualAudit.reports 必须是非空文件记录数组")
        else:
            evidence = visual_audit.get("evidence")
            if not isinstance(evidence, list) or not evidence or any(
                not isinstance(value, str) or not value.strip() for value in evidence
            ):
                errors.append("manifest.visualAudit.evidence 必须是非空字符串数组")
    return errors


def _verify_evidence_audit(
    *,
    repo_root: Path,
    manifest: dict[str, Any],
    form_ids: tuple[str, ...],
    expected_frames_by_form: dict[str, dict[tuple[str, str, str, int], dict[str, str]]],
) -> tuple[list[str], int]:
    errors: list[str] = []
    evidence_audit = manifest.get("evidenceAudit")
    if not isinstance(evidence_audit, dict):
        return ["manifest.evidenceAudit 必须是对象"], 0
    index_record = evidence_audit.get("index")
    snapshot = evidence_audit.get("snapshot")
    if not isinstance(snapshot, dict):
        errors.append("manifest.evidenceAudit.snapshot 必须是对象")
        return errors, 0
    try:
        index_path, index_relative = _validate_file_record(
            index_record,
            repo_root=repo_root,
            label="manifest.evidenceAudit.index",
        )
    except ApprovalError as error:
        errors.append(str(error))
        return errors, 0
    visual_audit = manifest.get("visualAudit")
    if isinstance(visual_audit, dict) and visual_audit.get("evidenceIndex") != index_relative:
        errors.append("manifest.visualAudit.evidenceIndex 与 evidenceAudit.index.path 不一致")
    try:
        current_index = _validate_evidence_index(
            repo_root=repo_root,
            index_path=index_path,
            index_relative=index_relative,
            form_ids=form_ids,
            expected_frames_by_form=expected_frames_by_form,
        )
    except ApprovalError as error:
        errors.append(str(error))
        return errors, 0
    audit_report_count = 0
    if isinstance(visual_audit, dict):
        try:
            audit_report_count = _validate_audit_report_records(
                visual_audit.get("reports"),
                repo_root=repo_root,
                required_parent=index_path.parent.resolve(),
                run_id=str(current_index.get("runId", "")),
                form_ids=form_ids,
                evidence_index=current_index,
            )
        except ApprovalError as error:
            errors.append(str(error))
    if current_index != snapshot:
        errors.append("evidence-index 内容与 manifest 冻结快照不一致")
    expected_count = 1 + sum(
        len(value.get("files", []))
        for value in current_index.get("forms", [])
        if isinstance(value, dict)
    ) + audit_report_count
    if manifest.get("evidenceFileCount") != expected_count:
        errors.append(f"manifest.evidenceFileCount 必须为 {expected_count}")
    return errors, expected_count


def _verify_manifest(
    *,
    repo_root: Path,
    manifest: dict[str, Any],
    form_ids: tuple[str, ...],
    catalog_override: Path | None,
    character_root_override: str | None,
) -> dict[str, Any]:
    schema_version = manifest.get("schemaVersion")
    if schema_version not in (LEGACY_SCHEMA_VERSION, SCHEMA_VERSION):
        return {
            "status": "failed",
            "errors": [f"不支持的 manifest.schemaVersion：{schema_version!r}"],
            "checkedFrames": 0,
            "checkedEvidenceFiles": 0,
        }
    errors = _validate_manifest_header(
        manifest,
        form_ids=form_ids,
        schema_version=int(schema_version),
    )
    catalog_value = catalog_override or Path(str(manifest.get("catalogPath", "")))
    try:
        catalog_path, catalog_relative = _relative_arg(catalog_value, repo_root, label="catalogPath")
        catalog = _load_json(catalog_path, label="catalog")
    except ApprovalError as error:
        return {"status": "failed", "errors": errors + [str(error)], "checkedFrames": 0}

    character_root = character_root_override or manifest.get("characterRoot")
    if not isinstance(character_root, str) or not character_root.strip():
        errors.append("manifest.characterRoot 必须是非空 repo-relative 路径")
        return {"status": "failed", "errors": errors, "checkedFrames": 0}
    try:
        default_character_id, expected_bundles = _catalog_bundles(
            catalog,
            form_ids,
            character_root=character_root,
        )
    except ApprovalError as error:
        return {"status": "failed", "errors": errors + [str(error)], "checkedFrames": 0}
    if manifest.get("catalogPath") != catalog_relative and catalog_override is None:
        errors.append(f"manifest.catalogPath 非规范路径：{manifest.get('catalogPath')!r}")
    if manifest.get("defaultCharacterId") != default_character_id:
        errors.append("manifest.defaultCharacterId 与 catalog 不一致")
    expected_bundle_count = 1 + 2 * len(form_ids)
    if manifest.get("bundleCount") != expected_bundle_count:
        errors.append(f"manifest.bundleCount 必须为 {expected_bundle_count}")
    if manifest.get("frameCount") != expected_bundle_count * 40:
        errors.append(f"manifest.frameCount 必须为 {expected_bundle_count * 40}")

    bundle_values = manifest.get("bundles")
    if not isinstance(bundle_values, list):
        errors.append("manifest.bundles 必须是数组")
        return {"status": "failed", "errors": errors, "checkedFrames": 0}
    by_key: dict[str, dict[str, Any]] = {}
    for value in bundle_values:
        if not isinstance(value, dict) or not isinstance(value.get("bundleKey"), str):
            errors.append("manifest.bundles[] 必须包含字符串 bundleKey")
            continue
        key = value["bundleKey"]
        if key in by_key:
            errors.append(f"manifest bundleKey 重复：{key}")
            continue
        by_key[key] = value
    expected_keys = [bundle["bundleKey"] for bundle in expected_bundles]
    if set(by_key) != set(expected_keys):
        errors.append("manifest bundle 集合与 catalog/目标 form 不一致")

    checked_frames = 0
    for expected_bundle in expected_bundles:
        key = expected_bundle["bundleKey"]
        bundle = by_key.get(key)
        if bundle is None:
            continue
        try:
            root_path, root_relative = _repo_path(expected_bundle["root"], repo_root, label=f"{key}.root")
        except ApprovalError as error:
            errors.append(str(error))
            continue
        expected_form_id: str | None = expected_bundle["formId"] or None
        for field, expected in (
            ("kind", expected_bundle["kind"]),
            ("formId", expected_form_id),
            ("root", root_relative),
            ("frameCount", 40),
        ):
            if bundle.get(field) != expected:
                errors.append(f"{key}.{field} 必须为 {expected!r}")
        expected_records = _expected_frame_records(expected_bundle, repo_root=repo_root)
        expected_by_path = {entry["path"]: entry for entry in expected_records}
        frames = bundle.get("frames")
        if not isinstance(frames, list):
            errors.append(f"{key}.frames 必须是数组")
            continue
        by_path: dict[str, dict[str, Any]] = {}
        for value in frames:
            if not isinstance(value, dict) or not isinstance(value.get("path"), str):
                errors.append(f"{key}.frames[] 必须包含字符串 path")
                continue
            path = value["path"]
            if path in by_path:
                errors.append(f"{key} 帧路径重复：{path}")
                continue
            by_path[path] = value
        if set(by_path) != set(expected_by_path):
            errors.append(f"{key} 40 帧路径集合不完整或含规范外路径")
        expected_paths = {entry["absolutePath"].resolve() for entry in expected_records}
        extras = sorted(_scan_world_pngs(root_path) - expected_paths)
        if extras:
            errors.append(f"{key} 含规范外 world PNG：{extras[0].relative_to(repo_root)}")
        for path, expected in expected_by_path.items():
            value = by_path.get(path)
            if value is None:
                continue
            for field in ("direction", "action", "index"):
                if value.get(field) != expected[field]:
                    errors.append(f"{key} {path} 的 {field} 与规范路径不一致")
            absolute_path = expected["absolutePath"]
            if not absolute_path.is_file():
                errors.append(f"{key} 缺少批准帧：{path}")
                continue
            checked_frames += 1
            current_hash = _sha256(absolute_path)
            if value.get("sha256") != current_hash:
                errors.append(f"{key} 帧哈希漂移：{path}")
            if value.get("sizeBytes") != absolute_path.stat().st_size:
                errors.append(f"{key} 帧大小漂移：{path}")
    checked_evidence_files = 0
    if schema_version == SCHEMA_VERSION:
        try:
            expected_frames_by_form = _expected_parity_frames_by_form(
                expected_bundles,
                form_ids,
                repo_root=repo_root,
            )
        except ApprovalError as error:
            errors.append(str(error))
        else:
            evidence_errors, checked_evidence_files = _verify_evidence_audit(
                repo_root=repo_root,
                manifest=manifest,
                form_ids=form_ids,
                expected_frames_by_form=expected_frames_by_form,
            )
            errors.extend(evidence_errors)
    else:
        errors.append(LEGACY_NOT_CURRENT_ERROR)
    return {
        "status": (
            "legacy_manifest_not_current"
            if schema_version == LEGACY_SCHEMA_VERSION
            else ("ok" if not errors else "failed")
        ),
        "errors": errors,
        "checkedFrames": checked_frames,
        "expectedFrames": expected_bundle_count * 40,
        "checkedEvidenceFiles": checked_evidence_files,
        "semanticDirectionReview": manifest.get("semanticDirectionReview"),
        "ownerReview": manifest.get("ownerReview"),
    }


def _relative_arg(path: Path, repo_root: Path, *, label: str) -> tuple[Path, str]:
    if path.is_absolute():
        resolved = path.resolve(strict=False)
        try:
            relative = resolved.relative_to(repo_root).as_posix()
        except ValueError as error:
            raise ApprovalError(f"{label} 必须位于仓库内：{path}") from error
        return resolved, relative
    return _repo_path(path, repo_root, label=label)


def _add_common_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--repo-root",
        type=Path,
        default=Path(__file__).resolve().parents[1],
        help="repository root",
    )
    parser.add_argument(
        "--form-id",
        action="append",
        help="approved form id; repeat as needed (default: current seven complete packs)",
    )


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    create = subparsers.add_parser("create", help="freeze frames after a completed visual direction audit")
    _add_common_arguments(create)
    create.add_argument("--catalog", type=Path, default=DEFAULT_CATALOG)
    create.add_argument("--character-root", type=Path, default=DEFAULT_CHARACTER_ROOT)
    create.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    create.add_argument("--reviewer", required=True)
    create.add_argument(
        "--evidence-index",
        type=Path,
        required=True,
        help="repo-local evidence-index.json produced by the atomic runtime review recorder",
    )
    create.add_argument(
        "--audit-report",
        type=Path,
        action="append",
        required=True,
        help="passing repo-local blind-audit JSON; repeat until every selected form is covered exactly once",
    )
    create.add_argument(
        "--confirm-visual-direction-review",
        action="store_true",
        help="required acknowledgement that all directions were manually inspected",
    )

    verify = subparsers.add_parser("verify", help="verify paths and SHA-256 hashes against an approval manifest")
    _add_common_arguments(verify)
    verify.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    verify.add_argument("--catalog", type=Path, help="optional catalog override for isolated tests")
    verify.add_argument("--character-root", type=Path, help="optional character root override")
    return parser.parse_args()


def _create(args: argparse.Namespace) -> int:
    if not args.confirm_visual_direction_review:
        raise ApprovalError(
            "拒绝生成批准清单：必须先逐方向人工复审，再传入 --confirm-visual-direction-review"
        )
    reviewer = args.reviewer.strip()
    if not reviewer:
        raise ApprovalError("--reviewer 不能为空")
    repo_root = args.repo_root.resolve()
    catalog_path, catalog_relative = _relative_arg(args.catalog, repo_root, label="catalog")
    _, character_root = _relative_arg(args.character_root, repo_root, label="character-root")
    manifest_path, _ = _relative_arg(args.manifest, repo_root, label="manifest")
    evidence_index_path, evidence_index_relative = _relative_arg(
        args.evidence_index,
        repo_root,
        label="evidence-index",
    )
    form_ids = _selected_form_ids(args.form_id)
    catalog = _load_json(catalog_path, label="catalog")
    _, bundle_specs = _catalog_bundles(catalog, form_ids, character_root=character_root)
    expected_frames_by_form = _expected_parity_frames_by_form(
        bundle_specs,
        form_ids,
        repo_root=repo_root,
    )
    evidence_index = _validate_evidence_index(
        repo_root=repo_root,
        index_path=evidence_index_path,
        index_relative=evidence_index_relative,
        form_ids=form_ids,
        expected_frames_by_form=expected_frames_by_form,
    )
    audit_report_records: list[dict[str, Any]] = []
    for index, value in enumerate(args.audit_report):
        audit_path, audit_relative = _relative_arg(
            value,
            repo_root,
            label=f"audit-report[{index}]",
        )
        if not audit_path.is_file():
            raise ApprovalError(f"audit-report[{index}] 不存在：{audit_relative}")
        audit_report_records.append(_file_record(audit_path, audit_relative))
    _validate_audit_report_records(
        audit_report_records,
        repo_root=repo_root,
        required_parent=evidence_index_path.parent.resolve(),
        run_id=str(evidence_index.get("runId", "")),
        form_ids=form_ids,
        evidence_index=evidence_index,
    )
    manifest = _build_manifest(
        repo_root=repo_root,
        catalog_path=catalog_path,
        catalog_relative=catalog_relative,
        character_root=character_root,
        form_ids=form_ids,
        reviewer=reviewer,
        evidence_index_path=evidence_index_path,
        evidence_index_relative=evidence_index_relative,
        evidence_index=evidence_index,
        audit_report_records=audit_report_records,
    )
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        f"world semantic approval created: bundles={manifest['bundleCount']} frames={manifest['frameCount']} "
        f"ownerReview={manifest['ownerReview']} path={manifest_path}"
    )
    return 0


def _verify(args: argparse.Namespace) -> int:
    repo_root = args.repo_root.resolve()
    manifest_path, _ = _relative_arg(args.manifest, repo_root, label="manifest")
    manifest = _load_json(manifest_path, label="manifest")
    catalog_override = None
    if args.catalog is not None:
        catalog_override, _ = _relative_arg(args.catalog, repo_root, label="catalog")
    character_root_override = None
    if args.character_root is not None:
        _, character_root_override = _relative_arg(args.character_root, repo_root, label="character-root")
    report = _verify_manifest(
        repo_root=repo_root,
        manifest=manifest,
        form_ids=_selected_form_ids(args.form_id),
        catalog_override=catalog_override,
        character_root_override=character_root_override,
    )
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["status"] == "ok" else 1


def main() -> int:
    args = _parse_args()
    try:
        return _create(args) if args.command == "create" else _verify(args)
    except ApprovalError as error:
        print(f"world semantic approval: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
