#!/usr/bin/env python3
"""Record fail-closed Godot evidence for static NPC true-eight appearances.

Each selected appearance is reviewed through ``NpcArtCatalog`` in three
separate Godot processes: parity-only preflight, movie recording, and grid
capture.  All three processes freeze the same eight installed world frames and
four installed portraits by file SHA-256 plus decoded RGBA SHA-256.  A partial
or drifting run deliberately receives no ``evidence-index.json``.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shlex
import shutil
import struct
import subprocess
import sys
import uuid
from datetime import datetime, timezone
from fractions import Fraction
from pathlib import Path
from typing import Any, Iterable, Sequence


REPO_ROOT = Path(__file__).resolve().parents[1]
GODOT_PROJECT = REPO_ROOT / "client" / "godot"
NPC_CATALOG = GODOT_PROJECT / "data" / "npc_appearances.json"
REVIEW_SCENE = "res://scenes/qa/NpcDirectionReview.tscn"
DEFAULT_OUTPUT_ROOT = Path(
    ".run/evidence/phase327_npc_archetype_art/candidate"
)

INDEX_SCHEMA_VERSION = 1
INDEX_TYPE = "beastbound_npc_direction_review_evidence"
PARITY_SCHEMA_VERSION = 1
PARITY_TYPE = "beastbound_npc_direction_review_parity"
PARITY_DIRECTIONS = (
    "south",
    "southwest",
    "west",
    "northwest",
    "north",
    "northeast",
    "east",
    "southeast",
)
PORTRAIT_STATES = ("neutral", "speaking", "smile", "concerned")
EXPECTED_PARITY_COVERAGE = frozenset(
    [("world", direction) for direction in PARITY_DIRECTIONS]
    + [("portrait", state) for state in PORTRAIT_STATES]
)
EXPECTED_PARITY_FRAMES = 12
EXPECTED_WIDTH = 1280
EXPECTED_HEIGHT = 720
EXPECTED_FPS = Fraction(30, 1)
EXPECTED_SCENE_DURATION_SECONDS = 12.0
EXPECTED_FRAME_COUNT = 361
EXPECTED_VIDEO_DURATION_SECONDS = Fraction(EXPECTED_FRAME_COUNT, 1) / EXPECTED_FPS
MAX_DURATION_ERROR_SECONDS = 1.0 / float(EXPECTED_FPS)
DIRECTION_FRAME_STRIDE = 45
CONTACT_SAMPLE_FRAME_INDICES = tuple(
    direction_index * DIRECTION_FRAME_STRIDE + 22
    for direction_index in range(8)
)
SAFE_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")
SAFE_RES_PNG_PATH = re.compile(
    r"^res://[A-Za-z0-9._-]+(?:/[A-Za-z0-9._-]+)*\.png$"
)
LOWER_SHA256 = re.compile(r"^[0-9a-f]{64}$")
FRAME_SHA256_FIELDS = (
    "fileSha256",
    "sourceFullDecodedRgbaSha256",
    "sourceDecodedRgbaSha256",
    "loadedDecodedRgbaSha256",
)
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


class NpcReviewRecordingError(RuntimeError):
    """A fail-closed NPC recording contract failure."""


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _new_run_id() -> str:
    timestamp = _utc_now().strftime("%Y%m%dT%H%M%S.%fZ")
    return f"phase327-{timestamp}-{uuid.uuid4().hex[:8]}"


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _repo_relative(path: Path) -> str:
    resolved = path.resolve(strict=False)
    try:
        return resolved.relative_to(REPO_ROOT).as_posix()
    except ValueError as error:
        raise NpcReviewRecordingError(
            f"证据路径越出仓库根目录：{path}"
        ) from error


def _resolve_repo_output(path: Path) -> Path:
    resolved = (
        path.resolve(strict=False)
        if path.is_absolute()
        else (REPO_ROOT / path).resolve(strict=False)
    )
    _repo_relative(resolved)
    return resolved


def _artifact_record(path: Path) -> dict[str, Any]:
    if not path.is_file():
        raise NpcReviewRecordingError(
            f"证据文件不存在：{_repo_relative(path)}"
        )
    size = path.stat().st_size
    if size <= 0:
        raise NpcReviewRecordingError(f"证据文件为空：{_repo_relative(path)}")
    return {
        "path": _repo_relative(path),
        "sha256": _sha256(path),
        "sizeBytes": size,
    }


def _write_json(path: Path, value: Any) -> None:
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def _read_json(path: Path, *, label: str) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise NpcReviewRecordingError(
            f"无法读取 {label}：{path}: {error}"
        ) from error
    if not isinstance(value, dict):
        raise NpcReviewRecordingError(f"{label} 根节点必须是对象：{path}")
    return value


def _run_logged(
    command: Sequence[str],
    *,
    log_path: Path,
    timeout_seconds: float,
) -> None:
    with log_path.open("w", encoding="utf-8") as log:
        log.write(f"$ {shlex.join(command)}\n")
        log.flush()
        try:
            completed = subprocess.run(
                list(command),
                cwd=REPO_ROOT,
                stdin=subprocess.DEVNULL,
                stdout=log,
                stderr=subprocess.STDOUT,
                check=False,
                timeout=timeout_seconds,
            )
        except subprocess.TimeoutExpired as error:
            log.write(f"\nTIMEOUT after {timeout_seconds:.1f}s\n")
            raise NpcReviewRecordingError(
                f"命令超时（{timeout_seconds:.1f}s），详见 {_repo_relative(log_path)}"
            ) from error
    if completed.returncode != 0:
        raise NpcReviewRecordingError(
            f"命令失败 exit={completed.returncode}，详见 {_repo_relative(log_path)}"
        )


def _capture_version(executable: str, arguments: Sequence[str]) -> str:
    completed = subprocess.run(
        [executable, *arguments],
        cwd=REPO_ROOT,
        stdin=subprocess.DEVNULL,
        capture_output=True,
        text=True,
        check=False,
        timeout=30,
    )
    if completed.returncode != 0:
        raise NpcReviewRecordingError(
            f"无法读取工具版本：{executable} {' '.join(arguments)}"
        )
    output = (completed.stdout or completed.stderr).strip()
    return output.splitlines()[0] if output else "unknown"


def _is_safe_res_png_path(value: Any) -> bool:
    if not isinstance(value, str) or not value:
        return False
    if SAFE_RES_PNG_PATH.fullmatch(value) is None:
        return False
    return all(
        segment not in (".", "..")
        for segment in value.removeprefix("res://").split("/")
    )


def _parity_source_set_sha256(frames: Sequence[dict[str, Any]]) -> str:
    lines = (
        f"{frame.get('kind', '')}\t{frame.get('slot', '')}\t"
        f"{frame.get('path', '')}\t{frame.get('fileSha256', '')}\t"
        f"{frame.get('sourceFullDecodedRgbaSha256', '')}\t"
        f"{frame.get('sourceDecodedRgbaSha256', '')}\n"
        for frame in frames
    )
    return hashlib.sha256("".join(lines).encode("utf-8")).hexdigest()


def _validate_parity_report(
    path: Path,
    *,
    appearance_id: str,
    run_id: str,
    process_kind: str,
    label: str,
    expected_source_set_sha256: str | None = None,
) -> dict[str, Any]:
    report = _read_json(path, label=label)
    errors: list[str] = []
    if type(report.get("schemaVersion")) is not int or report.get(
        "schemaVersion"
    ) != PARITY_SCHEMA_VERSION:
        errors.append(f"schemaVersion={report.get('schemaVersion')!r}")
    if report.get("reportType") != PARITY_TYPE:
        errors.append(f"reportType={report.get('reportType')!r}")
    if report.get("status") != "passed":
        errors.append(f"status={report.get('status')!r}")
    if report.get("appearanceId") != appearance_id:
        errors.append(f"appearanceId={report.get('appearanceId')!r}")
    if report.get("runId") != run_id:
        errors.append(f"runId={report.get('runId')!r}")
    if report.get("processKind") != process_kind:
        errors.append(f"processKind={report.get('processKind')!r}")
    if report.get("checkedFrames") != EXPECTED_PARITY_FRAMES:
        errors.append(f"checkedFrames={report.get('checkedFrames')!r}")
    if report.get("passedFrames") != EXPECTED_PARITY_FRAMES:
        errors.append(f"passedFrames={report.get('passedFrames')!r}")
    if report.get("runtimeMirroring") is not False:
        errors.append("runtimeMirroring 不是 false")
    if report.get("errors") != []:
        errors.append("errors 不是空数组")
    source_set_sha256 = report.get("sourceSetSha256")
    if not isinstance(source_set_sha256, str) or LOWER_SHA256.fullmatch(
        source_set_sha256
    ) is None:
        errors.append("sourceSetSha256 不是 64 位小写 SHA-256")
    if (
        expected_source_set_sha256 is not None
        and source_set_sha256 != expected_source_set_sha256
    ):
        errors.append("sourceSetSha256 在 preflight/录制/网格进程之间发生漂移")

    frames = report.get("frames")
    if not isinstance(frames, list) or len(frames) != EXPECTED_PARITY_FRAMES:
        errors.append("frames 数量不是 12")
    else:
        coverage: set[tuple[str, str]] = set()
        duplicate_coverage: set[tuple[str, str]] = set()
        seen_paths: set[str] = set()
        duplicate_paths: set[str] = set()
        typed_frames: list[dict[str, Any]] = []
        expected_root = f"res://assets/npcs/{appearance_id}/"
        for row_index, frame_value in enumerate(frames):
            frame_label = f"frames[{row_index}]"
            if not isinstance(frame_value, dict):
                errors.append(f"{frame_label} 不是对象")
                continue
            frame = frame_value
            typed_frames.append(frame)
            if frame.get("status") != "passed":
                errors.append(f"{frame_label}.status={frame.get('status')!r}")
            if frame.get("errors") != []:
                errors.append(f"{frame_label}.errors 不是空数组")
            if frame.get("importFresh") is not True:
                errors.append(f"{frame_label}.importFresh 不是 true")
            if frame.get("loadMode") != "godot_import":
                errors.append(f"{frame_label}.loadMode={frame.get('loadMode')!r}")
            if frame.get("canonicalRgbaMatch") is not True:
                errors.append(f"{frame_label}.canonicalRgbaMatch 不是 true")
            if frame.get("sourceLoadedRgbaMatch") is not True:
                errors.append(f"{frame_label}.sourceLoadedRgbaMatch 不是 true")
            if frame.get("sourceDecodedRgbaSha256") != frame.get(
                "loadedDecodedRgbaSha256"
            ):
                errors.append(f"{frame_label} Godot canonical RGBA 不一致")

            kind = frame.get("kind")
            slot = frame.get("slot")
            coverage_key = (
                (kind, slot)
                if isinstance(kind, str) and isinstance(slot, str)
                else None
            )
            if coverage_key not in EXPECTED_PARITY_COVERAGE:
                errors.append(f"{frame_label} 不是规范 world8/portrait4 覆盖")
            elif coverage_key in coverage:
                duplicate_coverage.add(coverage_key)
            else:
                coverage.add(coverage_key)

            source_path = frame.get("path")
            if not _is_safe_res_png_path(source_path):
                errors.append(f"{frame_label}.path 不是安全的 res:// PNG 路径")
            elif not source_path.startswith(expected_root):
                errors.append(f"{frame_label}.path 不属于当前 appearanceId")
            elif source_path in seen_paths:
                duplicate_paths.add(source_path)
            else:
                seen_paths.add(source_path)

            for field in FRAME_SHA256_FIELDS:
                value = frame.get(field)
                if not isinstance(value, str) or LOWER_SHA256.fullmatch(value) is None:
                    errors.append(f"{frame_label}.{field} 不是 64 位小写 SHA-256")

        if duplicate_coverage:
            errors.append(f"frames 存在重复逻辑帧：{len(duplicate_coverage)} 项")
        if duplicate_paths:
            errors.append(f"frames 存在重复 PNG 路径：{len(duplicate_paths)} 项")
        missing_coverage = EXPECTED_PARITY_COVERAGE - coverage
        if missing_coverage:
            errors.append(f"frames 缺少规范逻辑帧：{len(missing_coverage)} 项")
        if len(typed_frames) == EXPECTED_PARITY_FRAMES:
            recomputed_sha256 = _parity_source_set_sha256(typed_frames)
            if source_set_sha256 != recomputed_sha256:
                errors.append("sourceSetSha256 与按报告顺序重算的哈希不一致")
    if errors:
        raise NpcReviewRecordingError(f"{label} 未通过：{'；'.join(errors)}")
    return report


def _parity_artifact(path: Path, report: dict[str, Any]) -> dict[str, Any]:
    return {
        **_artifact_record(path),
        "status": "passed",
        "processKind": report["processKind"],
        "checkedFrames": report["checkedFrames"],
        "passedFrames": report["passedFrames"],
        "expectedFrames": EXPECTED_PARITY_FRAMES,
        "sourceSetSha256": report["sourceSetSha256"],
    }


def _parse_fraction(value: Any, *, label: str) -> Fraction:
    try:
        return Fraction(str(value))
    except (ValueError, ZeroDivisionError) as error:
        raise NpcReviewRecordingError(
            f"ffprobe {label} 无法解析：{value!r}"
        ) from error


def _validate_probe(probe: dict[str, Any]) -> dict[str, Any]:
    streams = probe.get("streams")
    if not isinstance(streams, list):
        raise NpcReviewRecordingError("ffprobe streams 不是数组")
    video_stream = next(
        (
            stream
            for stream in streams
            if isinstance(stream, dict) and stream.get("codec_type") == "video"
        ),
        None,
    )
    if video_stream is None:
        raise NpcReviewRecordingError("ffprobe 未发现视频流")

    errors: list[str] = []
    codec = video_stream.get("codec_name")
    if codec != "h264":
        errors.append(f"codec={codec!r}")
    width = video_stream.get("width")
    height = video_stream.get("height")
    if width != EXPECTED_WIDTH or height != EXPECTED_HEIGHT:
        errors.append(f"size={width}x{height}")
    fps = _parse_fraction(
        video_stream.get("avg_frame_rate") or video_stream.get("r_frame_rate"),
        label="fps",
    )
    if fps != EXPECTED_FPS:
        errors.append(f"fps={fps}")
    raw_frame_count = video_stream.get("nb_read_frames") or video_stream.get(
        "nb_frames"
    )
    try:
        frame_count = int(raw_frame_count)
    except (TypeError, ValueError):
        frame_count = -1
    if frame_count != EXPECTED_FRAME_COUNT:
        errors.append(f"frameCount={raw_frame_count!r}")
    raw_duration = video_stream.get("duration")
    if raw_duration in (None, "N/A"):
        format_value = probe.get("format")
        raw_duration = (
            format_value.get("duration")
            if isinstance(format_value, dict)
            else None
        )
    try:
        duration = float(raw_duration)
    except (TypeError, ValueError):
        duration = -1.0
    if abs(duration - float(EXPECTED_VIDEO_DURATION_SECONDS)) > MAX_DURATION_ERROR_SECONDS:
        errors.append(f"duration={raw_duration!r}")
    if errors:
        raise NpcReviewRecordingError(
            f"视频元数据不符合固定 NPC 评审契约：{'；'.join(errors)}"
        )
    return {
        "codec": codec,
        "width": width,
        "height": height,
        "fps": float(fps),
        "durationSeconds": duration,
        "frameCount": frame_count,
    }


def _png_dimensions(path: Path) -> tuple[int, int]:
    try:
        header = path.read_bytes()[:24]
    except OSError as error:
        raise NpcReviewRecordingError(f"无法读取 PNG：{path}: {error}") from error
    if len(header) < 24 or header[:8] != PNG_SIGNATURE or header[12:16] != b"IHDR":
        raise NpcReviewRecordingError(f"不是有效 PNG 头：{_repo_relative(path)}")
    return struct.unpack(">II", header[16:24])


def _write_probe(ffprobe: str, video_path: Path, output_path: Path) -> dict[str, Any]:
    command = [
        ffprobe,
        "-v",
        "error",
        "-count_frames",
        "-show_entries",
        (
            "stream=index,codec_type,codec_name,width,height,r_frame_rate,"
            "avg_frame_rate,nb_frames,nb_read_frames,duration:"
            "format=format_name,duration,size"
        ),
        "-of",
        "json",
        str(video_path),
    ]
    completed = subprocess.run(
        command,
        cwd=REPO_ROOT,
        stdin=subprocess.DEVNULL,
        capture_output=True,
        text=True,
        check=False,
        timeout=120,
    )
    if completed.returncode != 0:
        raise NpcReviewRecordingError(
            f"ffprobe 失败 exit={completed.returncode}: {completed.stderr.strip()}"
        )
    try:
        probe = json.loads(completed.stdout)
    except json.JSONDecodeError as error:
        raise NpcReviewRecordingError("ffprobe 没有返回有效 JSON") from error
    if not isinstance(probe, dict):
        raise NpcReviewRecordingError("ffprobe JSON 根节点不是对象")
    _write_json(output_path, probe)
    return probe


def _godot_base(godot: str) -> list[str]:
    return [godot, "--path", str(GODOT_PROJECT), "--scene", REVIEW_SCENE]


def _review_arguments(
    *,
    appearance_id: str,
    run_id: str,
    parity_report_path: Path,
) -> list[str]:
    return [
        f"--npc-review-appearance={appearance_id}",
        f"--npc-review-run-id={run_id}",
        f"--npc-review-parity-report={parity_report_path}",
        "--npc-review-enable-candidate",
    ]


def _record_appearance(
    *,
    appearance_id: str,
    run_id: str,
    appearance_dir: Path,
    godot: str,
    ffmpeg: str,
    ffprobe: str,
    timeout_seconds: float,
) -> dict[str, Any]:
    appearance_dir.mkdir(parents=False, exist_ok=False)

    preflight_path = appearance_dir / "preflight-parity.json"
    _run_logged(
        [
            godot,
            "--headless",
            "--path",
            str(GODOT_PROJECT),
            "--scene",
            REVIEW_SCENE,
            "--",
            *_review_arguments(
                appearance_id=appearance_id,
                run_id=run_id,
                parity_report_path=preflight_path,
            ),
            "--npc-review-parity-only",
        ],
        log_path=appearance_dir / "preflight-parity.log",
        timeout_seconds=timeout_seconds,
    )
    preflight = _validate_parity_report(
        preflight_path,
        appearance_id=appearance_id,
        run_id=run_id,
        process_kind="preflight",
        label=f"{appearance_id} parity-only 报告",
    )
    source_set_sha256 = preflight["sourceSetSha256"]

    avi_path = appearance_dir / "review.avi"
    recording_path = appearance_dir / "recording-parity.json"
    _run_logged(
        [
            *_godot_base(godot),
            "--write-movie",
            str(avi_path),
            "--fixed-fps",
            str(EXPECTED_FPS.numerator),
            "--disable-vsync",
            "--",
            *_review_arguments(
                appearance_id=appearance_id,
                run_id=run_id,
                parity_report_path=recording_path,
            ),
            "--record-npc-directions",
        ],
        log_path=appearance_dir / "recording.log",
        timeout_seconds=timeout_seconds,
    )
    recording = _validate_parity_report(
        recording_path,
        appearance_id=appearance_id,
        run_id=run_id,
        process_kind="recording",
        label=f"{appearance_id} 录制进程 parity 报告",
        expected_source_set_sha256=source_set_sha256,
    )
    _artifact_record(avi_path)

    video_path = appearance_dir / "review.mp4"
    _run_logged(
        [
            ffmpeg,
            "-y",
            "-v",
            "warning",
            "-i",
            str(avi_path),
            "-map",
            "0:v:0",
            "-map",
            "0:a?",
            "-c:v",
            "libx264",
            "-preset",
            "slow",
            "-crf",
            "18",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-b:a",
            "128k",
            "-map_metadata",
            "-1",
            "-movflags",
            "+faststart",
            str(video_path),
        ],
        log_path=appearance_dir / "transcode.log",
        timeout_seconds=timeout_seconds,
    )

    probe_path = appearance_dir / "ffprobe.json"
    probe = _write_probe(ffprobe, video_path, probe_path)
    video_metadata = _validate_probe(probe)
    _run_logged(
        [
            ffmpeg,
            "-v",
            "error",
            "-xerror",
            "-i",
            str(video_path),
            "-map",
            "0:v:0",
            "-f",
            "null",
            "-",
        ],
        log_path=appearance_dir / "video-decode.log",
        timeout_seconds=timeout_seconds,
    )

    grid_path = appearance_dir / "grid.png"
    grid_parity_path = appearance_dir / "grid-parity.json"
    _run_logged(
        [
            *_godot_base(godot),
            "--",
            *_review_arguments(
                appearance_id=appearance_id,
                run_id=run_id,
                parity_report_path=grid_parity_path,
            ),
            f"--capture-npc-directions={grid_path}",
        ],
        log_path=appearance_dir / "grid.log",
        timeout_seconds=timeout_seconds,
    )
    grid_parity = _validate_parity_report(
        grid_parity_path,
        appearance_id=appearance_id,
        run_id=run_id,
        process_kind="grid",
        label=f"{appearance_id} 网格进程 parity 报告",
        expected_source_set_sha256=source_set_sha256,
    )
    grid_width, grid_height = _png_dimensions(grid_path)
    if (grid_width, grid_height) != (EXPECTED_WIDTH, EXPECTED_HEIGHT):
        raise NpcReviewRecordingError(
            f"网格尺寸错误：{grid_width}x{grid_height}，期望 1280x720"
        )
    _run_logged(
        [
            ffmpeg,
            "-v",
            "error",
            "-xerror",
            "-i",
            str(grid_path),
            "-frames:v",
            "1",
            "-f",
            "null",
            "-",
        ],
        log_path=appearance_dir / "grid-decode.log",
        timeout_seconds=timeout_seconds,
    )

    contact_path = appearance_dir / "contact.png"
    select_expression = "+".join(
        f"eq(n\\,{frame_index})" for frame_index in CONTACT_SAMPLE_FRAME_INDICES
    )
    _run_logged(
        [
            ffmpeg,
            "-y",
            "-v",
            "warning",
            "-i",
            str(video_path),
            "-vf",
            f"select={select_expression},scale=640:360:flags=lanczos,tile=2x4",
            "-fps_mode",
            "vfr",
            "-frames:v",
            "1",
            str(contact_path),
        ],
        log_path=appearance_dir / "contact.log",
        timeout_seconds=timeout_seconds,
    )
    contact_width, contact_height = _png_dimensions(contact_path)
    if (contact_width, contact_height) != (1280, 1440):
        raise NpcReviewRecordingError(
            f"联系表尺寸错误：{contact_width}x{contact_height}，期望 1280x1440"
        )
    _run_logged(
        [
            ffmpeg,
            "-v",
            "error",
            "-xerror",
            "-i",
            str(contact_path),
            "-frames:v",
            "1",
            "-f",
            "null",
            "-",
        ],
        log_path=appearance_dir / "contact-decode.log",
        timeout_seconds=timeout_seconds,
    )

    parity_summary_path = appearance_dir / "parity-summary.json"
    _write_json(
        parity_summary_path,
        {
            "schemaVersion": 1,
            "appearanceId": appearance_id,
            "runId": run_id,
            "status": "passed",
            "expectedFrames": EXPECTED_PARITY_FRAMES,
            "sourceSetSha256": source_set_sha256,
            "processes": [
                _parity_artifact(preflight_path, preflight),
                _parity_artifact(recording_path, recording),
                _parity_artifact(grid_parity_path, grid_parity),
            ],
        },
    )

    files = [
        _artifact_record(path)
        for path in sorted(appearance_dir.iterdir(), key=lambda value: value.name)
        if path.is_file()
    ]
    return {
        "appearanceId": appearance_id,
        "runId": run_id,
        "status": "passed",
        "sourceSetSha256": source_set_sha256,
        "preflightParity": _parity_artifact(preflight_path, preflight),
        "recordingParity": _parity_artifact(recording_path, recording),
        "gridParity": _parity_artifact(grid_parity_path, grid_parity),
        "paritySummary": _artifact_record(parity_summary_path),
        "video": {
            **_artifact_record(video_path),
            **video_metadata,
            "expectedSceneDurationSeconds": EXPECTED_SCENE_DURATION_SECONDS,
            "expectedEncodedDurationSeconds": float(
                EXPECTED_VIDEO_DURATION_SECONDS
            ),
            "expectedFrameCount": EXPECTED_FRAME_COUNT,
            "decodeStatus": "passed",
        },
        "movieArchive": _artifact_record(avi_path),
        "grid": {
            **_artifact_record(grid_path),
            "width": grid_width,
            "height": grid_height,
            "decodeStatus": "passed",
        },
        "contact": {
            **_artifact_record(contact_path),
            "width": contact_width,
            "height": contact_height,
            "sampleFrameIndices": list(CONTACT_SAMPLE_FRAME_INDICES),
            "sampleContract": "one_mid_hold_frame_per_canonical_direction",
            "decodeStatus": "passed",
        },
        "probe": _artifact_record(probe_path),
        "files": files,
    }


def _catalog_candidate_ids() -> tuple[str, ...]:
    catalog = _read_json(NPC_CATALOG, label="NPC appearance catalog")
    appearances = catalog.get("appearances")
    if not isinstance(appearances, list):
        raise NpcReviewRecordingError("NPC appearance catalog.appearances 不是数组")
    values: list[str] = []
    for record in appearances:
        if not isinstance(record, dict):
            continue
        if record.get("mobility") != "static" or record.get("status") == "planned":
            continue
        appearance_id = record.get("appearanceId")
        if isinstance(appearance_id, str):
            values.append(appearance_id)
    return tuple(values)


def _selected_appearances(
    values: Iterable[str] | None,
    *,
    all_candidates: bool = False,
) -> tuple[str, ...]:
    explicit = tuple(values or ())
    if all_candidates and explicit:
        raise NpcReviewRecordingError(
            "--all-candidates 与 --appearance-id 不能同时使用"
        )
    appearances = _catalog_candidate_ids() if all_candidates else explicit
    if not appearances:
        raise NpcReviewRecordingError(
            "至少需要一个 --appearance-id，或使用 --all-candidates"
        )
    if len(set(appearances)) != len(appearances):
        raise NpcReviewRecordingError("--appearance-id 不能重复")
    for appearance_id in appearances:
        if SAFE_ID.fullmatch(appearance_id) is None:
            raise NpcReviewRecordingError(
                f"不安全的 appearanceId：{appearance_id!r}"
            )
    return appearances


def _require_executable(value: str, *, label: str) -> str:
    resolved = shutil.which(value)
    if resolved is None:
        raise NpcReviewRecordingError(f"找不到 {label} 可执行文件：{value}")
    return resolved


def _record(args: argparse.Namespace) -> Path:
    if Path.cwd().resolve() != REPO_ROOT:
        raise NpcReviewRecordingError(f"必须从仓库根执行：cd {REPO_ROOT}")
    if not GODOT_PROJECT.is_dir():
        raise NpcReviewRecordingError(f"Godot 项目不存在：{GODOT_PROJECT}")

    appearances = _selected_appearances(
        args.appearance_ids,
        all_candidates=bool(args.all_candidates),
    )
    run_id = args.run_id or _new_run_id()
    if SAFE_ID.fullmatch(run_id) is None:
        raise NpcReviewRecordingError(f"不安全的 runId：{run_id!r}")
    output_root = _resolve_repo_output(args.output_root)
    output_root.mkdir(parents=True, exist_ok=True)
    run_dir = output_root / run_id
    run_dir.mkdir(parents=False, exist_ok=False)

    godot = _require_executable(args.godot, label="Godot")
    ffmpeg = _require_executable(args.ffmpeg, label="ffmpeg")
    ffprobe = _require_executable(args.ffprobe, label="ffprobe")
    timeout_seconds = float(args.timeout_seconds)
    if timeout_seconds <= 0:
        raise NpcReviewRecordingError("--timeout-seconds 必须大于 0")

    import_log = run_dir / "godot-import.log"
    _run_logged(
        [godot, "--headless", "--path", str(GODOT_PROJECT), "--import"],
        log_path=import_log,
        timeout_seconds=timeout_seconds,
    )

    appearance_records: list[dict[str, Any]] = []
    for appearance_id in appearances:
        print(
            f"[phase327] recording {appearance_id} in "
            f"{_repo_relative(run_dir / appearance_id)}"
        )
        appearance_records.append(
            _record_appearance(
                appearance_id=appearance_id,
                run_id=run_id,
                appearance_dir=run_dir / appearance_id,
                godot=godot,
                ffmpeg=ffmpeg,
                ffprobe=ffprobe,
                timeout_seconds=timeout_seconds,
            )
        )

    all_indexed_files = [
        _artifact_record(path)
        for path in sorted(run_dir.rglob("*"), key=lambda value: value.as_posix())
        if path.is_file() and path.name != "evidence-index.json"
    ]
    index = {
        "schemaVersion": INDEX_SCHEMA_VERSION,
        "indexType": INDEX_TYPE,
        "runId": run_id,
        "status": "passed",
        "generatedAtUtc": _utc_now().isoformat().replace("+00:00", "Z"),
        "scene": REVIEW_SCENE,
        "appearanceIds": list(appearances),
        "expected": {
            "parityFramesPerAppearance": EXPECTED_PARITY_FRAMES,
            "worldFramesPerAppearance": 8,
            "portraitFramesPerAppearance": 4,
            "width": EXPECTED_WIDTH,
            "height": EXPECTED_HEIGHT,
            "fps": float(EXPECTED_FPS),
            "directionHoldSeconds": 1.5,
            "sceneDurationSeconds": EXPECTED_SCENE_DURATION_SECONDS,
            "encodedDurationSeconds": float(EXPECTED_VIDEO_DURATION_SECONDS),
            "encodedFrameCount": EXPECTED_FRAME_COUNT,
            "runtimeMirroring": False,
        },
        "tools": {
            "godot": _capture_version(godot, ["--version"]),
            "ffmpeg": _capture_version(ffmpeg, ["-version"]),
            "ffprobe": _capture_version(ffprobe, ["-version"]),
            "python": sys.version.splitlines()[0],
        },
        "importLog": _artifact_record(import_log),
        "appearances": appearance_records,
        "files": all_indexed_files,
        "indexedFileCount": len(all_indexed_files),
        "indexSelfHashExcluded": True,
        "blindAuditStatus": "not_performed",
    }
    index_path = run_dir / "evidence-index.json"
    _write_json(index_path, index)
    print(
        json.dumps(
            {
                "status": "passed",
                "runId": run_id,
                "appearances": len(appearance_records),
                "indexedFiles": len(all_indexed_files),
                "evidenceIndex": _repo_relative(index_path),
            },
            ensure_ascii=False,
        )
    )
    return index_path


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="录制并冻结 Godot 静态 NPC 真八方向候选证据。"
    )
    parser.add_argument(
        "--appearance-id",
        action="append",
        dest="appearance_ids",
        help="要录制的 appearanceId；可重复。",
    )
    parser.add_argument(
        "--all-candidates",
        action="store_true",
        help="按 npc_appearances.json 顺序录制所有非 planned 静态候选。",
    )
    parser.add_argument("--run-id", help="可选的唯一安全 runId。")
    parser.add_argument(
        "--output-root",
        type=Path,
        default=DEFAULT_OUTPUT_ROOT,
        help=f"repo-relative 候选根目录（默认：{DEFAULT_OUTPUT_ROOT.as_posix()}）。",
    )
    parser.add_argument("--godot", default=os.environ.get("GODOT_BIN", "godot"))
    parser.add_argument(
        "--ffmpeg", default=os.environ.get("FFMPEG_BIN", "ffmpeg")
    )
    parser.add_argument(
        "--ffprobe", default=os.environ.get("FFPROBE_BIN", "ffprobe")
    )
    parser.add_argument(
        "--timeout-seconds",
        type=float,
        default=300.0,
        help="每个外部步骤的超时秒数（默认：300）。",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        _record(args)
    except (NpcReviewRecordingError, FileExistsError, OSError) as error:
        print(f"npc direction review recording failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
