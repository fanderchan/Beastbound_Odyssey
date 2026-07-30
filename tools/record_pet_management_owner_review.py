#!/usr/bin/env python3
"""Record a fail-closed owner-review video of the real pet-management UI.

The tool deliberately owns only capture and media validation.  The Godot-side
review controller is selected with a user argument (default:
``--pet-management-review-capture``) and is responsible for walking the
already-implemented player-facing flows before quitting.

Every run receives a fresh ``--user-data-dir`` below its evidence directory,
so ``user://`` can never resolve to a player's normal save location.  The
recorder does not start a backend, access MySQL, or invoke any repository ops
command.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import re
import shlex
import shutil
import signal
import struct
import subprocess
import sys
import uuid
from datetime import datetime, timezone
from fractions import Fraction
from pathlib import Path
from typing import Any, Mapping, Sequence


REPO_ROOT = Path(__file__).resolve().parents[1]
GODOT_PROJECT = REPO_ROOT / "client" / "godot"
MAIN_SCENE = "res://scenes/Main.tscn"
DEFAULT_OUTPUT_ROOT = Path(
    ".run/evidence/phase373_pet_management_owner_review"
)
DEFAULT_CAPTURE_FLAG = "--pet-management-review-capture"

REPORT_SCHEMA_VERSION = 1
REPORT_TYPE = "beastbound_pet_management_owner_review_video"
EXPECTED_WIDTH = 1280
EXPECTED_HEIGHT = 720
EXPECTED_FPS = Fraction(30, 1)
EXPECTED_VIDEO_CODEC = "h264"
EXPECTED_PIXEL_FORMAT = "yuv420p"
EXPECTED_AUDIO_CODEC = "aac"
MIN_DURATION_SECONDS = 1.0
DEFAULT_SAMPLE_COUNT = 8
MAX_SAMPLE_COUNT = 16
CONTACT_CELL_WIDTH = 320
CONTACT_CELL_HEIGHT = 180
SAFE_RUN_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")
SAFE_USER_ARGUMENT = re.compile(
    r"^--[A-Za-z0-9][A-Za-z0-9._-]*(?:=[^\x00\r\n]*)?$"
)
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
SENSITIVE_ARGUMENT = re.compile(
    r"(?:password|passwd|secret|token|credential|api[-_]?key)",
    re.IGNORECASE,
)


class PetManagementRecordingError(RuntimeError):
    """A pet-management owner-review recording contract failure."""


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _new_run_id() -> str:
    timestamp = _utc_now().strftime("%Y%m%dT%H%M%S.%fZ")
    return f"phase373-{timestamp}-{uuid.uuid4().hex[:8]}"


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
        raise PetManagementRecordingError(
            f"证据路径越出仓库根目录：{path}"
        ) from error


def _resolve_output_root(path: Path) -> Path:
    resolved = (
        path.resolve(strict=False)
        if path.is_absolute()
        else (REPO_ROOT / path).resolve(strict=False)
    )
    evidence_root = (REPO_ROOT / ".run" / "evidence").resolve(strict=False)
    try:
        resolved.relative_to(evidence_root)
    except ValueError as error:
        raise PetManagementRecordingError(
            "录像输出必须位于仓库 .run/evidence/ 下"
        ) from error
    return resolved


def _write_json(path: Path, value: Any) -> None:
    temporary = path.with_name(f".{path.name}.tmp")
    temporary.write_text(
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    temporary.replace(path)


def _artifact_record(path: Path) -> dict[str, Any]:
    if not path.is_file():
        raise PetManagementRecordingError(
            f"证据文件不存在：{_repo_relative(path)}"
        )
    size = path.stat().st_size
    if size <= 0:
        raise PetManagementRecordingError(
            f"证据文件为空：{_repo_relative(path)}"
        )
    return {
        "path": _repo_relative(path),
        "sizeBytes": size,
        "sha256": _sha256(path),
    }


def _require_executable(value: str, *, label: str) -> str:
    resolved = shutil.which(value)
    if resolved is None:
        raise PetManagementRecordingError(
            f"找不到 {label} 可执行文件：{value}"
        )
    return resolved


def _redacted_command(command: Sequence[str]) -> list[str]:
    redacted: list[str] = []
    for value in command:
        argument = str(value)
        if "=" in argument:
            name, _separator, _payload = argument.partition("=")
            if SENSITIVE_ARGUMENT.search(name):
                redacted.append(f"{name}=[REDACTED_SECRET]")
                continue
        redacted.append(argument)
    return redacted


def _terminate_process_group(process: subprocess.Popen[Any]) -> None:
    if process.poll() is not None:
        return
    if os.name != "posix":
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)
        return

    try:
        process_group = os.getpgid(process.pid)
    except ProcessLookupError:
        return
    try:
        os.killpg(process_group, signal.SIGTERM)
    except ProcessLookupError:
        return
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        pass
    # The process leader can exit while one of its children ignores SIGTERM.
    # Always follow with SIGKILL for the original, dedicated process group.
    try:
        os.killpg(process_group, signal.SIGKILL)
    except ProcessLookupError:
        return
    if process.poll() is None:
        process.wait(timeout=5)


def _run_logged(
    command: Sequence[str],
    *,
    log_path: Path,
    timeout_seconds: float,
    environment: Mapping[str, str] | None = None,
) -> None:
    redacted = _redacted_command(command)
    with log_path.open("w", encoding="utf-8") as log:
        log.write(f"$ {shlex.join(redacted)}\n")
        log.flush()
        process = subprocess.Popen(
            list(command),
            cwd=REPO_ROOT,
            env=dict(environment) if environment is not None else None,
            stdin=subprocess.DEVNULL,
            stdout=log,
            stderr=subprocess.STDOUT,
            text=True,
            start_new_session=True,
        )
        try:
            return_code = process.wait(timeout=timeout_seconds)
        except subprocess.TimeoutExpired as error:
            _terminate_process_group(process)
            log.write(f"\nTIMEOUT after {timeout_seconds:.1f}s\n")
            log.flush()
            raise PetManagementRecordingError(
                f"命令超时（{timeout_seconds:.1f}s），详见 "
                f"{_repo_relative(log_path)}"
            ) from error
        except BaseException:
            _terminate_process_group(process)
            raise
    if return_code != 0:
        raise PetManagementRecordingError(
            f"命令失败 exit={return_code}，详见 {_repo_relative(log_path)}"
        )


def _run_capture(
    command: Sequence[str],
    *,
    timeout_seconds: float,
) -> subprocess.CompletedProcess[str]:
    process = subprocess.Popen(
        list(command),
        cwd=REPO_ROOT,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        start_new_session=True,
    )
    try:
        stdout, stderr = process.communicate(timeout=timeout_seconds)
    except subprocess.TimeoutExpired as error:
        _terminate_process_group(process)
        raise PetManagementRecordingError(
            f"命令超时（{timeout_seconds:.1f}s）："
            f"{shlex.join(_redacted_command(command))}"
        ) from error
    except BaseException:
        _terminate_process_group(process)
        raise
    return subprocess.CompletedProcess(
        list(command),
        process.returncode,
        stdout,
        stderr,
    )


def _capture_version(executable: str, arguments: Sequence[str]) -> str:
    completed = _run_capture(
        [executable, *arguments],
        timeout_seconds=30.0,
    )
    if completed.returncode != 0:
        raise PetManagementRecordingError(
            f"无法读取工具版本：{executable} {' '.join(arguments)}"
        )
    output = (completed.stdout or completed.stderr).strip()
    return output.splitlines()[0] if output else "unknown"


def _validate_user_argument(value: str, *, label: str) -> str:
    if SAFE_USER_ARGUMENT.fullmatch(value) is None or value == "--":
        raise PetManagementRecordingError(
            f"{label} 必须是单个安全 Godot 用户参数：{value!r}"
        )
    return value


def _build_godot_command(
    *,
    godot: str,
    user_data_dir: Path,
    avi_path: Path,
    capture_flag: str,
    review_args: Sequence[str] = (),
) -> list[str]:
    capture = _validate_user_argument(capture_flag, label="capture flag")
    extras = [
        _validate_user_argument(value, label="review arg")
        for value in review_args
    ]
    return [
        godot,
        "--path",
        str(GODOT_PROJECT),
        "--user-data-dir",
        str(user_data_dir),
        "--scene",
        MAIN_SCENE,
        "--windowed",
        "--resolution",
        f"{EXPECTED_WIDTH}x{EXPECTED_HEIGHT}",
        "--single-window",
        "--fixed-fps",
        str(EXPECTED_FPS.numerator),
        "--time-scale",
        "1.0",
        "--disable-vsync",
        "--write-movie",
        str(avi_path),
        "--",
        f"--qa-viewport={EXPECTED_WIDTH}x{EXPECTED_HEIGHT}",
        capture,
        *extras,
    ]


def _parse_fraction(value: Any, *, label: str) -> Fraction:
    try:
        return Fraction(str(value))
    except (ValueError, ZeroDivisionError) as error:
        raise PetManagementRecordingError(
            f"ffprobe {label} 无法解析：{value!r}"
        ) from error


def _stream_duration(
    stream: Mapping[str, Any],
    probe: Mapping[str, Any],
) -> float:
    raw_duration = stream.get("duration")
    if raw_duration in (None, "N/A"):
        format_value = probe.get("format")
        raw_duration = (
            format_value.get("duration")
            if isinstance(format_value, dict)
            else None
        )
    try:
        return float(raw_duration)
    except (TypeError, ValueError):
        return -1.0


def _validate_probe(probe: dict[str, Any]) -> dict[str, Any]:
    streams = probe.get("streams")
    if not isinstance(streams, list):
        raise PetManagementRecordingError("ffprobe streams 不是数组")
    video = next(
        (
            value
            for value in streams
            if isinstance(value, dict) and value.get("codec_type") == "video"
        ),
        None,
    )
    audio = next(
        (
            value
            for value in streams
            if isinstance(value, dict) and value.get("codec_type") == "audio"
        ),
        None,
    )
    if video is None:
        raise PetManagementRecordingError("ffprobe 未发现视频流")
    if audio is None:
        raise PetManagementRecordingError("ffprobe 未发现音频流")

    errors: list[str] = []
    if video.get("codec_name") != EXPECTED_VIDEO_CODEC:
        errors.append(f"video.codec={video.get('codec_name')!r}")
    if video.get("pix_fmt") != EXPECTED_PIXEL_FORMAT:
        errors.append(f"video.pixFmt={video.get('pix_fmt')!r}")
    if (
        video.get("width") != EXPECTED_WIDTH
        or video.get("height") != EXPECTED_HEIGHT
    ):
        errors.append(
            f"video.size={video.get('width')}x{video.get('height')}"
        )
    frame_rate = _parse_fraction(
        video.get("avg_frame_rate") or video.get("r_frame_rate"),
        label="video fps",
    )
    if frame_rate != EXPECTED_FPS:
        errors.append(f"video.fps={frame_rate}")
    video_duration = _stream_duration(video, probe)
    if (
        not math.isfinite(video_duration)
        or video_duration < MIN_DURATION_SECONDS
    ):
        errors.append(f"video.duration={video_duration}")
    if audio.get("codec_name") != EXPECTED_AUDIO_CODEC:
        errors.append(f"audio.codec={audio.get('codec_name')!r}")
    audio_duration = _stream_duration(audio, probe)
    if not math.isfinite(audio_duration) or audio_duration <= 0:
        errors.append(f"audio.duration={audio_duration}")

    raw_frame_count = video.get("nb_read_frames") or video.get("nb_frames")
    try:
        frame_count = int(raw_frame_count)
    except (TypeError, ValueError):
        frame_count = -1
    if frame_count <= 0:
        errors.append(f"video.frameCount={raw_frame_count!r}")
    if errors:
        raise PetManagementRecordingError(
            "视频元数据未通过宠物栏录像契约：" + "；".join(errors)
        )
    return {
        "videoCodec": EXPECTED_VIDEO_CODEC,
        "pixelFormat": EXPECTED_PIXEL_FORMAT,
        "audioCodec": EXPECTED_AUDIO_CODEC,
        "width": EXPECTED_WIDTH,
        "height": EXPECTED_HEIGHT,
        "fps": float(frame_rate),
        "durationSeconds": video_duration,
        "audioDurationSeconds": audio_duration,
        "frameCount": frame_count,
    }


def _write_probe(
    ffprobe: str,
    video_path: Path,
    output_path: Path,
) -> dict[str, Any]:
    command = [
        ffprobe,
        "-v",
        "error",
        "-count_frames",
        "-show_entries",
        (
            "stream=index,codec_type,codec_name,pix_fmt,width,height,"
            "r_frame_rate,avg_frame_rate,nb_frames,nb_read_frames,duration,"
            "sample_rate,channels:"
            "format=format_name,duration,size"
        ),
        "-of",
        "json",
        str(video_path),
    ]
    completed = _run_capture(command, timeout_seconds=180.0)
    if completed.returncode != 0:
        raise PetManagementRecordingError(
            f"ffprobe 失败 exit={completed.returncode}: "
            f"{completed.stderr.strip()}"
        )
    try:
        probe = json.loads(completed.stdout)
    except json.JSONDecodeError as error:
        raise PetManagementRecordingError(
            "ffprobe 没有返回有效 JSON"
        ) from error
    if not isinstance(probe, dict):
        raise PetManagementRecordingError("ffprobe JSON 根节点不是对象")
    _write_json(output_path, probe)
    return probe


def _png_dimensions(path: Path) -> tuple[int, int]:
    try:
        header = path.read_bytes()[:24]
    except OSError as error:
        raise PetManagementRecordingError(
            f"无法读取 PNG：{path}: {error}"
        ) from error
    if (
        len(header) < 24
        or header[:8] != PNG_SIGNATURE
        or header[12:16] != b"IHDR"
    ):
        raise PetManagementRecordingError(
            f"不是有效 PNG 头：{_repo_relative(path)}"
        )
    return struct.unpack(">II", header[16:24])


def _default_sample_times(
    duration_seconds: float,
    *,
    sample_count: int,
) -> tuple[float, ...]:
    if (
        not math.isfinite(duration_seconds)
        or duration_seconds < MIN_DURATION_SECONDS
    ):
        raise PetManagementRecordingError("视频太短，无法生成取样帧")
    if sample_count < 2 or sample_count > MAX_SAMPLE_COUNT:
        raise PetManagementRecordingError(
            f"--sample-count 必须介于 2 和 {MAX_SAMPLE_COUNT}"
        )
    last_frame_time = max(
        0.0,
        duration_seconds - (1.0 / float(EXPECTED_FPS)),
    )
    return tuple(
        min(
            last_frame_time,
            duration_seconds * ((index + 0.5) / sample_count),
        )
        for index in range(sample_count)
    )


def _selected_sample_times(
    duration_seconds: float,
    *,
    requested: Sequence[float],
    sample_count: int,
) -> tuple[float, ...]:
    if not requested:
        return _default_sample_times(
            duration_seconds,
            sample_count=sample_count,
        )
    if len(requested) < 2 or len(requested) > MAX_SAMPLE_COUNT:
        raise PetManagementRecordingError(
            f"--sample-time 数量必须介于 2 和 {MAX_SAMPLE_COUNT}"
        )
    normalized = tuple(float(value) for value in requested)
    if not all(math.isfinite(value) for value in normalized):
        raise PetManagementRecordingError("--sample-time 必须是有限秒数")
    if tuple(sorted(normalized)) != normalized:
        raise PetManagementRecordingError("--sample-time 必须严格递增")
    if len(set(normalized)) != len(normalized):
        raise PetManagementRecordingError("--sample-time 不能重复")
    for value in normalized:
        if value < 0 or value >= duration_seconds:
            raise PetManagementRecordingError(
                f"--sample-time={value} 越出视频时长 {duration_seconds:.3f}s"
            )
    return normalized


def _extract_review_frames(
    *,
    ffmpeg: str,
    video_path: Path,
    screenshots_dir: Path,
    sample_times: Sequence[float],
    timeout_seconds: float,
) -> list[dict[str, Any]]:
    screenshots_dir.mkdir(parents=False, exist_ok=False)
    records: list[dict[str, Any]] = []
    for index, sample_time in enumerate(sample_times, start=1):
        output_path = screenshots_dir / f"frame-{index:02d}.png"
        log_path = screenshots_dir / f"frame-{index:02d}.log"
        _run_logged(
            [
                ffmpeg,
                "-y",
                "-v",
                "warning",
                "-ss",
                f"{sample_time:.6f}",
                "-i",
                str(video_path),
                "-map",
                "0:v:0",
                "-frames:v",
                "1",
                "-vf",
                (
                    f"scale={EXPECTED_WIDTH}:{EXPECTED_HEIGHT}:"
                    "flags=lanczos"
                ),
                str(output_path),
            ],
            log_path=log_path,
            timeout_seconds=timeout_seconds,
        )
        width, height = _png_dimensions(output_path)
        if (width, height) != (EXPECTED_WIDTH, EXPECTED_HEIGHT):
            raise PetManagementRecordingError(
                f"取样帧尺寸错误：{width}x{height}"
            )
        records.append(
            {
                **_artifact_record(output_path),
                "sampleTimeSeconds": round(sample_time, 6),
                "width": width,
                "height": height,
                "log": _artifact_record(log_path),
            }
        )
    return records


def _build_contact_sheet(
    *,
    ffmpeg: str,
    screenshots_dir: Path,
    output_path: Path,
    sample_count: int,
    timeout_seconds: float,
) -> dict[str, Any]:
    columns = min(4, sample_count)
    rows = math.ceil(sample_count / columns)
    expected_width = columns * CONTACT_CELL_WIDTH
    expected_height = rows * CONTACT_CELL_HEIGHT
    log_path = output_path.with_suffix(".log")
    tile_filter = (
        f"scale={CONTACT_CELL_WIDTH}:{CONTACT_CELL_HEIGHT}:flags=lanczos,"
        f"tile={columns}x{rows}:nb_frames={sample_count}:padding=0:margin=0"
    )
    _run_logged(
        [
            ffmpeg,
            "-y",
            "-v",
            "warning",
            "-framerate",
            "1",
            "-start_number",
            "1",
            "-i",
            str(screenshots_dir / "frame-%02d.png"),
            "-vf",
            tile_filter,
            "-frames:v",
            "1",
            str(output_path),
        ],
        log_path=log_path,
        timeout_seconds=timeout_seconds,
    )
    width, height = _png_dimensions(output_path)
    if (width, height) != (expected_width, expected_height):
        raise PetManagementRecordingError(
            "联系表尺寸错误："
            f"{width}x{height}，期望 {expected_width}x{expected_height}"
        )
    return {
        **_artifact_record(output_path),
        "width": width,
        "height": height,
        "columns": columns,
        "rows": rows,
        "sampleCount": sample_count,
        "log": _artifact_record(log_path),
    }


def _write_sha256_manifest(
    run_dir: Path,
    paths: Sequence[Path],
) -> Path:
    manifest_path = run_dir / "SHA256SUMS"
    unique_paths = sorted(
        {path.resolve() for path in paths},
        key=lambda value: value.as_posix(),
    )
    lines: list[str] = []
    for path in unique_paths:
        if not path.is_file() or path.stat().st_size <= 0:
            raise PetManagementRecordingError(
                f"SHA256 清单目标不存在或为空：{path}"
            )
        try:
            relative = path.relative_to(run_dir.resolve()).as_posix()
        except ValueError as error:
            raise PetManagementRecordingError(
                f"SHA256 清单目标越出本次证据目录：{path}"
            ) from error
        lines.append(f"{_sha256(path)}  {relative}")
    manifest_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return manifest_path


def _isolated_environment(temporary_dir: Path) -> dict[str, str]:
    environment = dict(os.environ)
    environment["TMPDIR"] = str(temporary_dir)
    environment["BEASTBOUND_OWNER_REVIEW_CAPTURE"] = "1"
    return environment


def _user_data_inventory(user_data_dir: Path) -> dict[str, Any]:
    files = sorted(
        (
            path
            for path in user_data_dir.rglob("*")
            if path.is_file()
        ),
        key=lambda value: value.as_posix(),
    )
    return {
        "path": _repo_relative(user_data_dir),
        "fileCount": len(files),
        "totalBytes": sum(path.stat().st_size for path in files),
        "paths": [
            path.relative_to(user_data_dir).as_posix()
            for path in files
        ],
        "isFreshPerRun": True,
        "normalPlayerSavePathUsed": False,
    }


def _record_into(
    *,
    args: argparse.Namespace,
    run_id: str,
    run_dir: Path,
) -> Path:
    timeout_seconds = float(args.timeout_seconds)
    if not math.isfinite(timeout_seconds) or timeout_seconds <= 0:
        raise PetManagementRecordingError("--timeout-seconds 必须大于 0")
    requested_sample_times = tuple(args.sample_times or ())
    if not requested_sample_times:
        if int(args.sample_count) < 2 or int(args.sample_count) > MAX_SAMPLE_COUNT:
            raise PetManagementRecordingError(
                f"--sample-count 必须介于 2 和 {MAX_SAMPLE_COUNT}"
            )
    else:
        if (
            len(requested_sample_times) < 2
            or len(requested_sample_times) > MAX_SAMPLE_COUNT
        ):
            raise PetManagementRecordingError(
                f"--sample-time 数量必须介于 2 和 {MAX_SAMPLE_COUNT}"
            )
        normalized_preflight = tuple(
            float(value) for value in requested_sample_times
        )
        if not all(math.isfinite(value) for value in normalized_preflight):
            raise PetManagementRecordingError("--sample-time 必须是有限秒数")
        if any(value < 0 for value in normalized_preflight):
            raise PetManagementRecordingError("--sample-time 不能为负数")
        if (
            tuple(sorted(normalized_preflight)) != normalized_preflight
            or len(set(normalized_preflight)) != len(normalized_preflight)
        ):
            raise PetManagementRecordingError(
                "--sample-time 必须严格递增且不能重复"
            )
    godot = _require_executable(args.godot, label="Godot")
    ffmpeg = _require_executable(args.ffmpeg, label="ffmpeg")
    ffprobe = _require_executable(args.ffprobe, label="ffprobe")

    user_data_dir = run_dir / "user-data"
    temporary_dir = run_dir / "tmp"
    user_data_dir.mkdir(parents=False, exist_ok=False)
    temporary_dir.mkdir(parents=False, exist_ok=False)
    environment = _isolated_environment(temporary_dir)

    avi_path = run_dir / "pet-management-owner-review-1x.avi"
    video_path = run_dir / "pet-management-owner-review-1x.mp4"
    godot_log = run_dir / "godot-recording.log"
    capture_flag = str(args.capture_flag)
    review_args = tuple(args.review_args or ())
    godot_command = _build_godot_command(
        godot=godot,
        user_data_dir=user_data_dir,
        avi_path=avi_path,
        capture_flag=capture_flag,
        review_args=review_args,
    )
    _run_logged(
        godot_command,
        log_path=godot_log,
        timeout_seconds=timeout_seconds,
        environment=environment,
    )
    raw_movie = _artifact_record(avi_path)

    transcode_log = run_dir / "ffmpeg-transcode.log"
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
            "0:a:0",
            "-vf",
            "scale=in_range=pc:out_range=tv,format=yuv420p",
            "-c:v",
            "libx264",
            "-preset",
            "slow",
            "-crf",
            "18",
            "-pix_fmt",
            EXPECTED_PIXEL_FORMAT,
            "-color_range",
            "tv",
            "-c:a",
            EXPECTED_AUDIO_CODEC,
            "-b:a",
            "192k",
            "-ar",
            "48000",
            "-ac",
            "2",
            "-map_metadata",
            "-1",
            "-movflags",
            "+faststart",
            str(video_path),
        ],
        log_path=transcode_log,
        timeout_seconds=timeout_seconds,
        environment=environment,
    )

    probe_path = run_dir / "ffprobe.json"
    probe = _write_probe(ffprobe, video_path, probe_path)
    media = _validate_probe(probe)

    decode_log = run_dir / "full-audio-video-decode.log"
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
            "-map",
            "0:a:0",
            "-f",
            "null",
            "-",
        ],
        log_path=decode_log,
        timeout_seconds=timeout_seconds,
        environment=environment,
    )

    sample_times = _selected_sample_times(
        float(media["durationSeconds"]),
        requested=requested_sample_times,
        sample_count=int(args.sample_count),
    )
    screenshots_dir = run_dir / "screenshots"
    screenshots = _extract_review_frames(
        ffmpeg=ffmpeg,
        video_path=video_path,
        screenshots_dir=screenshots_dir,
        sample_times=sample_times,
        timeout_seconds=timeout_seconds,
    )
    contact = _build_contact_sheet(
        ffmpeg=ffmpeg,
        screenshots_dir=screenshots_dir,
        output_path=run_dir / "contact-sheet.png",
        sample_count=len(sample_times),
        timeout_seconds=timeout_seconds,
    )

    hash_paths = [
        avi_path,
        video_path,
        probe_path,
        run_dir / "contact-sheet.png",
        *(
            REPO_ROOT / screenshot["path"]
            for screenshot in screenshots
        ),
    ]
    hash_manifest_path = _write_sha256_manifest(run_dir, hash_paths)
    video = {
        **_artifact_record(video_path),
        **media,
        "playbackSpeed": 1.0,
        "decodeStatus": "passed",
    }

    summary = {
        "schemaVersion": REPORT_SCHEMA_VERSION,
        "reportType": REPORT_TYPE,
        "status": "passed",
        "runId": run_id,
        "generatedAtUtc": _utc_now().isoformat().replace("+00:00", "Z"),
        "scene": MAIN_SCENE,
        "captureFlag": capture_flag,
        "reviewArguments": _redacted_command(review_args),
        "captureContract": {
            "normalMainScene": True,
            "width": EXPECTED_WIDTH,
            "height": EXPECTED_HEIGHT,
            "fps": float(EXPECTED_FPS),
            "playbackSpeed": 1.0,
            "movieWriterFixedFps": True,
            "transcodeChangesTiming": False,
            "audioRequired": True,
        },
        "isolation": {
            "userData": _user_data_inventory(user_data_dir),
            "temporaryDirectory": _repo_relative(temporary_dir),
            "backendProcessStartedByTool": False,
            "mysqlAccessByTool": False,
        },
        "tools": {
            "godot": _capture_version(godot, ["--version"]),
            "ffmpeg": _capture_version(ffmpeg, ["-version"]),
            "ffprobe": _capture_version(ffprobe, ["-version"]),
            "python": sys.version.splitlines()[0],
        },
        "command": _redacted_command(godot_command),
        "rawMovie": raw_movie,
        "video": video,
        "probe": _artifact_record(probe_path),
        "fullDecode": {
            "status": "passed",
            "videoStreamDecoded": True,
            "audioStreamDecoded": True,
            "log": _artifact_record(decode_log),
        },
        "screenshots": screenshots,
        "contactSheet": contact,
        "sha256Manifest": _artifact_record(hash_manifest_path),
        "logs": {
            "godot": _artifact_record(godot_log),
            "transcode": _artifact_record(transcode_log),
        },
        "ownerReviewStatus": "pending",
    }
    summary_path = run_dir / "summary.json"
    _write_json(summary_path, summary)
    print(
        json.dumps(
            {
                "status": "passed",
                "runId": run_id,
                "video": video["path"],
                "contactSheet": contact["path"],
                "summary": _repo_relative(summary_path),
            },
            ensure_ascii=False,
        )
    )
    return summary_path


def _write_failure_summary(
    run_dir: Path,
    *,
    run_id: str,
    error: BaseException,
) -> None:
    try:
        _write_json(
            run_dir / "failure-summary.json",
            {
                "schemaVersion": REPORT_SCHEMA_VERSION,
                "reportType": REPORT_TYPE,
                "status": "failed",
                "runId": run_id,
                "generatedAtUtc": _utc_now().isoformat().replace(
                    "+00:00",
                    "Z",
                ),
                "errorType": type(error).__name__,
                "error": str(error) or type(error).__name__,
                "evidenceDirectoryPreserved": True,
            },
        )
    except OSError:
        pass


def _record(args: argparse.Namespace) -> Path:
    if Path.cwd().resolve() != REPO_ROOT:
        raise PetManagementRecordingError(
            f"必须从仓库根执行：cd {REPO_ROOT}"
        )
    if not GODOT_PROJECT.is_dir():
        raise PetManagementRecordingError(
            f"Godot 项目不存在：{GODOT_PROJECT}"
        )
    run_id = args.run_id or _new_run_id()
    if SAFE_RUN_ID.fullmatch(run_id) is None:
        raise PetManagementRecordingError(f"不安全的 runId：{run_id!r}")
    output_root = _resolve_output_root(args.output_root)
    output_root.mkdir(parents=True, exist_ok=True)
    run_dir = output_root / run_id
    run_dir.mkdir(parents=False, exist_ok=False)
    try:
        return _record_into(args=args, run_id=run_id, run_dir=run_dir)
    except BaseException as error:
        _write_failure_summary(run_dir, run_id=run_id, error=error)
        raise


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "用真实 Main.tscn 录制 1280x720、30fps、1×、有声的宠物栏"
            "项目所有者验收视频，并生成可复核媒体证据。"
        )
    )
    parser.add_argument("--run-id", help="可选的唯一安全 runId。")
    parser.add_argument(
        "--output-root",
        type=Path,
        default=DEFAULT_OUTPUT_ROOT,
        help=(
            "仓库 .run/evidence/ 下的输出根目录"
            f"（默认：{DEFAULT_OUTPUT_ROOT.as_posix()}）。"
        ),
    )
    parser.add_argument(
        "--capture-flag",
        "--review-flag",
        dest="capture_flag",
        default=DEFAULT_CAPTURE_FLAG,
        help=(
            "Godot 端自动漫游用户参数；若控制器最终改名，请使用 "
            "--capture-flag=--新名字。"
        ),
    )
    parser.add_argument(
        "--review-arg",
        action="append",
        dest="review_args",
        help=(
            "附加 Godot 用户参数；可重复。参数以 -- 开头时请使用 "
            "--review-arg=--参数。"
        ),
    )
    parser.add_argument(
        "--sample-count",
        type=int,
        default=DEFAULT_SAMPLE_COUNT,
        help=f"自动等距截图数量（默认：{DEFAULT_SAMPLE_COUNT}）。",
    )
    parser.add_argument(
        "--sample-time",
        type=float,
        action="append",
        dest="sample_times",
        help="改用指定秒数截图；需递增，可重复。",
    )
    parser.add_argument(
        "--godot",
        default=os.environ.get("GODOT_BIN", "godot"),
    )
    parser.add_argument(
        "--ffmpeg",
        default=os.environ.get("FFMPEG_BIN", "ffmpeg"),
    )
    parser.add_argument(
        "--ffprobe",
        default=os.environ.get("FFPROBE_BIN", "ffprobe"),
    )
    parser.add_argument(
        "--timeout-seconds",
        type=float,
        default=900.0,
        help="每个外部步骤的超时秒数（默认：900）。",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        _record(args)
    except KeyboardInterrupt:
        print(
            "pet management owner review recording interrupted",
            file=sys.stderr,
        )
        return 130
    except (
        PetManagementRecordingError,
        FileExistsError,
        OSError,
        ValueError,
    ) as error:
        print(
            f"pet management owner review recording failed: {error}",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
