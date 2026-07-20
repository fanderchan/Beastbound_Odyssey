#!/usr/bin/env python3
"""Record fail-closed, hash-frozen true-eight world-direction review evidence.

The review scene validates the exact character, pet, and mounted textures that it
loads.  This wrapper makes that validation inseparable from a candidate movie:

1. import the Godot project once;
2. run a 120-frame parity-only preflight for every requested form;
3. record each form while asking the recording process to write its own parity
   report with the same run ID;
4. capture the eight-direction grid and its parity report;
5. transcode, decode-check, probe, and build a two-sample-per-direction contact
   sheet; and
6. freeze every generated artifact (except the self-referential index itself)
   by repo-relative path, SHA-256, and byte size.

Run this script from the repository root.  A failed or partial run deliberately
does not receive an ``evidence-index.json`` and therefore cannot be approved as
a complete candidate.
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
REVIEW_SCENE = "res://scenes/qa/CharacterMountDirectionReview.tscn"
DEFAULT_OUTPUT_ROOT = Path(
    ".run/evidence/phase325_world_direction_runtime_parity/candidate"
)
DEFAULT_FORM_IDS = (
    "bui_novice_sprout_earth5_wind5",
    "wuli_normal_orange_fire10",
    "mossback_marsh_earth7_water3",
    "emberhorn_red_fire8_earth2",
    "blue_man_dragon_water10",
    "rebirth_beast_earth_lv50",
    "novice_tiger_mount",
)

INDEX_SCHEMA_VERSION = 1
INDEX_TYPE = "beastbound_world_direction_review_evidence"
PARITY_SCHEMA_VERSION = 1
PARITY_KINDS = ("character", "pet", "mounted")
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
PARITY_ACTION_FRAMES = (
    ("idle", 1),
    ("walk", 1),
    ("walk", 2),
    ("walk", 3),
    ("walk", 4),
)
EXPECTED_PARITY_COVERAGE = frozenset(
    (kind, direction, action, frame_index)
    for kind in PARITY_KINDS
    for direction in PARITY_DIRECTIONS
    for action, frame_index in PARITY_ACTION_FRAMES
)
EXPECTED_PARITY_FRAMES = 120
EXPECTED_WIDTH = 1280
EXPECTED_HEIGHT = 720
EXPECTED_FPS = Fraction(30, 1)
EXPECTED_FRAME_COUNT = 433
EXPECTED_SCENE_DURATION_SECONDS = 14.4
EXPECTED_VIDEO_DURATION_SECONDS = Fraction(EXPECTED_FRAME_COUNT, 1) / EXPECTED_FPS
MAX_DURATION_ERROR_SECONDS = 1.0 / float(EXPECTED_FPS)
DIRECTION_FRAME_STRIDE = 54  # 1.8 seconds at 30 FPS.
CONTACT_SAMPLE_FRAME_INDICES = tuple(
    frame
    for direction_index in range(8)
    for frame in (
        direction_index * DIRECTION_FRAME_STRIDE + 9,   # 0.30 s: idle
        direction_index * DIRECTION_FRAME_STRIDE + 36,  # 1.20 s: walk
    )
)
SAFE_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")
SAFE_RES_PNG_PATH = re.compile(
    r"^res://[A-Za-z0-9._-]+(?:/[A-Za-z0-9._-]+)*\.png$"
)
LOWER_SHA256 = re.compile(r"^[0-9a-f]{64}$")
FRAME_SHA256_FIELDS = (
    "sourceFileSha256",
    "sourceDecodedRgbaSha256",
    "loadedDecodedRgbaSha256",
)
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


class ReviewRecordingError(RuntimeError):
    """A user-facing, fail-closed recording-contract failure."""


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _new_run_id() -> str:
    timestamp = _utc_now().strftime("%Y%m%dT%H%M%S.%fZ")
    return f"phase325-{timestamp}-{uuid.uuid4().hex[:8]}"


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
        raise ReviewRecordingError(f"证据路径越出仓库根目录：{path}") from error


def _resolve_repo_output(path: Path) -> Path:
    if path.is_absolute():
        resolved = path.resolve(strict=False)
    else:
        resolved = (REPO_ROOT / path).resolve(strict=False)
    _repo_relative(resolved)
    return resolved


def _artifact_record(path: Path) -> dict[str, Any]:
    if not path.is_file():
        raise ReviewRecordingError(f"证据文件不存在：{_repo_relative(path)}")
    size = path.stat().st_size
    if size <= 0:
        raise ReviewRecordingError(f"证据文件为空：{_repo_relative(path)}")
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
        raise ReviewRecordingError(f"无法读取 {label}：{path}: {error}") from error
    if not isinstance(value, dict):
        raise ReviewRecordingError(f"{label} 根节点必须是对象：{path}")
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
            raise ReviewRecordingError(
                f"命令超时（{timeout_seconds:.1f}s），详见 {_repo_relative(log_path)}"
            ) from error
    if completed.returncode != 0:
        raise ReviewRecordingError(
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
        raise ReviewRecordingError(
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
    """Match WorldReviewFrameParity.source_set_sha256 without reordering rows."""
    lines = (
        f"{frame.get('kind', '')}\t{frame.get('path', '')}\t"
        f"{frame.get('sourceFileSha256', '')}\t"
        f"{frame.get('sourceDecodedRgbaSha256', '')}\t"
        f"{frame.get('loadedDecodedRgbaSha256', '')}\n"
        for frame in frames
    )
    return hashlib.sha256("".join(lines).encode("utf-8")).hexdigest()


def _validate_parity_report(
    path: Path,
    *,
    form_id: str,
    run_id: str,
    label: str,
    expected_source_set_sha256: str | None = None,
) -> dict[str, Any]:
    report = _read_json(path, label=label)
    errors: list[str] = []
    if type(report.get("schemaVersion")) is not int or report.get(
        "schemaVersion"
    ) != PARITY_SCHEMA_VERSION:
        errors.append(f"schemaVersion={report.get('schemaVersion')!r}")
    if report.get("status") != "passed":
        errors.append(f"status={report.get('status')!r}")
    if report.get("formId") != form_id:
        errors.append(f"formId={report.get('formId')!r}")
    if report.get("runId") != run_id:
        errors.append(f"runId={report.get('runId')!r}")
    if report.get("checkedFrames") != EXPECTED_PARITY_FRAMES:
        errors.append(f"checkedFrames={report.get('checkedFrames')!r}")
    if report.get("passedFrames") != EXPECTED_PARITY_FRAMES:
        errors.append(f"passedFrames={report.get('passedFrames')!r}")
    report_errors = report.get("errors")
    if report_errors != []:
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
        errors.append("sourceSetSha256 在录制步骤之间发生漂移")
    frames = report.get("frames")
    if not isinstance(frames, list) or len(frames) != EXPECTED_PARITY_FRAMES:
        errors.append("frames 数量不是 120")
    else:
        coverage: set[tuple[str, str, str, int]] = set()
        duplicate_coverage: set[tuple[str, str, str, int]] = set()
        seen_paths: set[str] = set()
        duplicate_paths: set[str] = set()
        typed_frames: list[dict[str, Any]] = []
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

            kind = frame.get("kind")
            direction = frame.get("direction")
            action = frame.get("action")
            frame_index = frame.get("index")
            coverage_key: tuple[str, str, str, int] | None = None
            if (
                isinstance(kind, str)
                and isinstance(direction, str)
                and isinstance(action, str)
                and type(frame_index) is int
            ):
                coverage_key = (kind, direction, action, frame_index)
            if coverage_key not in EXPECTED_PARITY_COVERAGE:
                errors.append(
                    f"{frame_label} 不是规范 kind/direction/action/index 覆盖"
                )
            elif coverage_key in coverage:
                duplicate_coverage.add(coverage_key)
            else:
                coverage.add(coverage_key)

            source_path = frame.get("path")
            if not _is_safe_res_png_path(source_path):
                errors.append(f"{frame_label}.path 不是安全的 res:// PNG 路径")
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
                errors.append(
                    "sourceSetSha256 与按报告顺序重算的 GDScript 哈希不一致"
                )
    if errors:
        raise ReviewRecordingError(f"{label} 未通过：{'；'.join(errors)}")
    return report


def _parity_artifact(path: Path, report: dict[str, Any]) -> dict[str, Any]:
    return {
        **_artifact_record(path),
        "status": "passed",
        "checkedFrames": report["checkedFrames"],
        "passedFrames": report["passedFrames"],
        "expectedFrames": EXPECTED_PARITY_FRAMES,
        "sourceSetSha256": report["sourceSetSha256"],
    }


def _parse_fraction(value: Any, *, label: str) -> Fraction:
    try:
        parsed = Fraction(str(value))
    except (ValueError, ZeroDivisionError) as error:
        raise ReviewRecordingError(f"ffprobe {label} 无法解析：{value!r}") from error
    return parsed


def _validate_probe(probe: dict[str, Any]) -> dict[str, Any]:
    streams = probe.get("streams")
    if not isinstance(streams, list):
        raise ReviewRecordingError("ffprobe streams 不是数组")
    video_stream = next(
        (
            stream
            for stream in streams
            if isinstance(stream, dict) and stream.get("codec_type") == "video"
        ),
        None,
    )
    if video_stream is None:
        raise ReviewRecordingError("ffprobe 未发现视频流")

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
    raw_frame_count = video_stream.get("nb_read_frames") or video_stream.get("nb_frames")
    try:
        frame_count = int(raw_frame_count)
    except (TypeError, ValueError):
        frame_count = -1
    if frame_count != EXPECTED_FRAME_COUNT:
        errors.append(f"frameCount={raw_frame_count!r}")

    raw_duration = video_stream.get("duration")
    if raw_duration in (None, "N/A"):
        format_value = probe.get("format")
        raw_duration = format_value.get("duration") if isinstance(format_value, dict) else None
    try:
        duration = float(raw_duration)
    except (TypeError, ValueError):
        duration = -1.0
    if abs(duration - float(EXPECTED_VIDEO_DURATION_SECONDS)) > MAX_DURATION_ERROR_SECONDS:
        errors.append(f"duration={raw_duration!r}")
    if errors:
        raise ReviewRecordingError(f"视频元数据不符合固定评审契约：{'；'.join(errors)}")
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
        raise ReviewRecordingError(f"无法读取 PNG：{path}: {error}") from error
    if len(header) < 24 or header[:8] != PNG_SIGNATURE or header[12:16] != b"IHDR":
        raise ReviewRecordingError(f"不是有效 PNG 头：{_repo_relative(path)}")
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
        raise ReviewRecordingError(
            f"ffprobe 失败 exit={completed.returncode}: {completed.stderr.strip()}"
        )
    try:
        probe = json.loads(completed.stdout)
    except json.JSONDecodeError as error:
        raise ReviewRecordingError("ffprobe 没有返回有效 JSON") from error
    if not isinstance(probe, dict):
        raise ReviewRecordingError("ffprobe JSON 根节点不是对象")
    _write_json(output_path, probe)
    return probe


def _godot_base(godot: str) -> list[str]:
    return [godot, "--path", str(GODOT_PROJECT), "--scene", REVIEW_SCENE]


def _review_arguments(
    *,
    form_id: str,
    run_id: str,
    parity_report_path: Path,
) -> list[str]:
    return [
        f"--mount-review-form={form_id}",
        f"--mount-review-run-id={run_id}",
        f"--mount-review-parity-report={parity_report_path}",
    ]


def _record_form(
    *,
    form_id: str,
    run_id: str,
    form_dir: Path,
    godot: str,
    ffmpeg: str,
    ffprobe: str,
    timeout_seconds: float,
) -> dict[str, Any]:
    form_dir.mkdir(parents=False, exist_ok=False)

    preflight_report_path = form_dir / "preflight-parity.json"
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
                form_id=form_id,
                run_id=run_id,
                parity_report_path=preflight_report_path,
            ),
            "--mount-review-parity-only",
        ],
        log_path=form_dir / "preflight-parity.log",
        timeout_seconds=timeout_seconds,
    )
    preflight_report = _validate_parity_report(
        preflight_report_path,
        form_id=form_id,
        run_id=run_id,
        label=f"{form_id} parity-only 报告",
    )
    source_set_sha256 = preflight_report["sourceSetSha256"]

    avi_path = form_dir / "review.avi"
    recording_report_path = form_dir / "recording-parity.json"
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
                form_id=form_id,
                run_id=run_id,
                parity_report_path=recording_report_path,
            ),
            "--record-mount-directions",
        ],
        log_path=form_dir / "recording.log",
        timeout_seconds=timeout_seconds,
    )
    recording_report = _validate_parity_report(
        recording_report_path,
        form_id=form_id,
        run_id=run_id,
        label=f"{form_id} 录制进程 parity 报告",
        expected_source_set_sha256=source_set_sha256,
    )
    _artifact_record(avi_path)

    video_path = form_dir / "review.mp4"
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
        log_path=form_dir / "transcode.log",
        timeout_seconds=timeout_seconds,
    )

    probe_path = form_dir / "ffprobe.json"
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
        log_path=form_dir / "video-decode.log",
        timeout_seconds=timeout_seconds,
    )

    grid_path = form_dir / "grid.png"
    grid_report_path = form_dir / "grid-parity.json"
    _run_logged(
        [
            *_godot_base(godot),
            "--",
            *_review_arguments(
                form_id=form_id,
                run_id=run_id,
                parity_report_path=grid_report_path,
            ),
            f"--capture-mount-directions={grid_path}",
        ],
        log_path=form_dir / "grid.log",
        timeout_seconds=timeout_seconds,
    )
    grid_report = _validate_parity_report(
        grid_report_path,
        form_id=form_id,
        run_id=run_id,
        label=f"{form_id} 网格进程 parity 报告",
        expected_source_set_sha256=source_set_sha256,
    )
    grid_width, grid_height = _png_dimensions(grid_path)
    if (grid_width, grid_height) != (EXPECTED_WIDTH, EXPECTED_HEIGHT):
        raise ReviewRecordingError(
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
        log_path=form_dir / "grid-decode.log",
        timeout_seconds=timeout_seconds,
    )

    contact_path = form_dir / "review-contact-sheet.png"
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
            (
                f"select={select_expression},"
                "scale=640:360:flags=lanczos,tile=2x8"
            ),
            "-fps_mode",
            "vfr",
            "-frames:v",
            "1",
            str(contact_path),
        ],
        log_path=form_dir / "contact.log",
        timeout_seconds=timeout_seconds,
    )
    contact_width, contact_height = _png_dimensions(contact_path)
    if (contact_width, contact_height) != (1280, 2880):
        raise ReviewRecordingError(
            f"联系表尺寸错误：{contact_width}x{contact_height}，期望 1280x2880"
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
        log_path=form_dir / "contact-decode.log",
        timeout_seconds=timeout_seconds,
    )

    files = [
        _artifact_record(path)
        for path in sorted(form_dir.iterdir(), key=lambda value: value.name)
        if path.is_file()
    ]
    parity = _parity_artifact(recording_report_path, recording_report)
    return {
        "formId": form_id,
        "runId": run_id,
        "status": "passed",
        "parity": parity,
        "preflightParity": _parity_artifact(preflight_report_path, preflight_report),
        "gridParity": _parity_artifact(grid_report_path, grid_report),
        "video": {
            **_artifact_record(video_path),
            **video_metadata,
            "expectedDurationSeconds": EXPECTED_SCENE_DURATION_SECONDS,
            "expectedEncodedDurationSeconds": float(EXPECTED_VIDEO_DURATION_SECONDS),
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
            "sampleContract": "per_direction_idle_at_0.30s_then_walk_at_1.20s",
            "decodeStatus": "passed",
        },
        "probe": _artifact_record(probe_path),
        "files": files,
    }


def _selected_forms(values: Iterable[str] | None) -> tuple[str, ...]:
    forms = tuple(values or DEFAULT_FORM_IDS)
    if not forms:
        raise ReviewRecordingError("至少需要一个 --form-id")
    if len(set(forms)) != len(forms):
        raise ReviewRecordingError("--form-id 不能重复")
    for form_id in forms:
        if not SAFE_ID.fullmatch(form_id):
            raise ReviewRecordingError(f"不安全的 formId：{form_id!r}")
    return forms


def _require_executable(value: str, *, label: str) -> str:
    resolved = shutil.which(value)
    if resolved is None:
        raise ReviewRecordingError(f"找不到 {label} 可执行文件：{value}")
    return resolved


def _record(args: argparse.Namespace) -> Path:
    if Path.cwd().resolve() != REPO_ROOT:
        raise ReviewRecordingError(f"必须从仓库根执行：cd {REPO_ROOT}")
    if not GODOT_PROJECT.is_dir():
        raise ReviewRecordingError(f"Godot 项目不存在：{GODOT_PROJECT}")

    forms = _selected_forms(args.form_ids)
    run_id = args.run_id or _new_run_id()
    if not SAFE_ID.fullmatch(run_id):
        raise ReviewRecordingError(f"不安全的 runId：{run_id!r}")
    output_root = _resolve_repo_output(args.output_root)
    output_root.mkdir(parents=True, exist_ok=True)
    run_dir = output_root / run_id
    run_dir.mkdir(parents=False, exist_ok=False)

    godot = _require_executable(args.godot, label="Godot")
    ffmpeg = _require_executable(args.ffmpeg, label="ffmpeg")
    ffprobe = _require_executable(args.ffprobe, label="ffprobe")
    timeout_seconds = float(args.timeout_seconds)
    if timeout_seconds <= 0:
        raise ReviewRecordingError("--timeout-seconds 必须大于 0")

    import_log = run_dir / "godot-import.log"
    _run_logged(
        [godot, "--headless", "--path", str(GODOT_PROJECT), "--import"],
        log_path=import_log,
        timeout_seconds=timeout_seconds,
    )

    form_records: list[dict[str, Any]] = []
    for form_id in forms:
        print(f"[phase325] recording {form_id} in {_repo_relative(run_dir / form_id)}")
        form_records.append(
            _record_form(
                form_id=form_id,
                run_id=run_id,
                form_dir=run_dir / form_id,
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
        "formIds": list(forms),
        "expected": {
            "parityFramesPerForm": EXPECTED_PARITY_FRAMES,
            "width": EXPECTED_WIDTH,
            "height": EXPECTED_HEIGHT,
            "fps": float(EXPECTED_FPS),
            "sceneDurationSeconds": EXPECTED_SCENE_DURATION_SECONDS,
            "encodedDurationSeconds": float(EXPECTED_VIDEO_DURATION_SECONDS),
            "encodedFrameCount": EXPECTED_FRAME_COUNT,
        },
        "tools": {
            "godot": _capture_version(godot, ["--version"]),
            "ffmpeg": _capture_version(ffmpeg, ["-version"]),
            "ffprobe": _capture_version(ffprobe, ["-version"]),
            "python": sys.version.splitlines()[0],
        },
        "importLog": _artifact_record(import_log),
        "forms": form_records,
        "files": all_indexed_files,
        "indexedFileCount": len(all_indexed_files),
        "indexSelfHashExcluded": True,
    }
    index_path = run_dir / "evidence-index.json"
    _write_json(index_path, index)
    print(
        json.dumps(
            {
                "status": "passed",
                "runId": run_id,
                "forms": len(form_records),
                "indexedFiles": len(all_indexed_files),
                "evidenceIndex": _repo_relative(index_path),
            },
            ensure_ascii=False,
        )
    )
    return index_path


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="录制并冻结 Godot 人物/宠物/整体骑乘真八方向候选证据。"
    )
    parser.add_argument(
        "--form-id",
        action="append",
        dest="form_ids",
        help="要录制的 formId；可重复。省略时录制当前 7 套完整世界包。",
    )
    parser.add_argument("--run-id", help="可选的唯一安全 runId；省略时自动生成。")
    parser.add_argument(
        "--output-root",
        type=Path,
        default=DEFAULT_OUTPUT_ROOT,
        help=f"repo-relative 候选根目录（默认：{DEFAULT_OUTPUT_ROOT.as_posix()}）。",
    )
    parser.add_argument("--godot", default=os.environ.get("GODOT_BIN", "godot"))
    parser.add_argument("--ffmpeg", default=os.environ.get("FFMPEG_BIN", "ffmpeg"))
    parser.add_argument("--ffprobe", default=os.environ.get("FFPROBE_BIN", "ffprobe"))
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
    except (ReviewRecordingError, FileExistsError, OSError) as error:
        print(f"world direction review recording failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
