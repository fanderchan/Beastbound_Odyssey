#!/usr/bin/env python3
"""Record the first two fusion routes without opening fusion to players.

The recorder launches a standalone QA sequence in a real macOS/Metal Godot
window.  It never starts Main, a backend, MySQL, or a player session.  Every
run uses a disposable self-contained Godot app clone so ``user://`` is
physically rooted under that run's evidence directory.  Godot's macOS runtime
derives ``user://`` from the process home rather than the editor's
self-contained marker, so the clone is launched with a process-local isolated
home under the same evidence directory.  This does not mutate the parent
process or system home.  The generated ``user://`` evidence is preserved and
the app clone is removed afterward.

The production closed-release verifier and both formal portrait bundles must
pass *before* a run directory is created.  They are verified again before the
validated candidate MP4 is atomically renamed to its final evidence name.
Missing or owner-approved-by-assumption portraits therefore cannot produce a
PASS video.

The final media contract is deliberately narrow: 1280x720, H.264, yuv420p,
30 fps, exactly the 30-second/900-frame 1.00x Godot sequence, and no audio
stream.  Silence is omitted rather than represented as synthetic gameplay
audio, and that fact is recorded in the machine report.  The ffmpeg transcode
is rejected if it contains any timing or speed filter.  Raw AVI frames retain
exact chapter hashes; the lossy H.264 is instead compared against every
same-index raw frame with a strict bounded PSNR floor.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
from fractions import Fraction
import hashlib
import json
import math
import os
from pathlib import Path
import re
import shlex
import shutil
import signal
import stat
import struct
import subprocess
import sys
import time
from typing import Any, Mapping, Sequence
import uuid


REPO_ROOT = Path(__file__).resolve().parents[1]
GODOT_PROJECT = REPO_ROOT / "client" / "godot"
SEQUENCE_SCRIPT = (
    "res://scripts/qa/pet_fusion_closed_review_sequence.gd"
)
SEQUENCE_SOURCE = (
    GODOT_PROJECT
    / "scripts"
    / "qa"
    / "pet_fusion_closed_review_sequence.gd"
)
RELEASE_VERIFIER = REPO_ROOT / "tools" / "verify_pet_fusion_closed_release.py"
ART_CATALOG = GODOT_PROJECT / "data" / "pet_art_catalog.json"
DEFAULT_OUTPUT_ROOT = Path(
    ".run/evidence/phase376_pet_fusion_closed_owner_review"
)

REPORT_SCHEMA_VERSION = 1
REPORT_TYPE = "beastbound_pet_fusion_closed_owner_review_video"
EXPECTED_WIDTH = 1280
EXPECTED_HEIGHT = 720
EXPECTED_FPS = Fraction(30, 1)
EXPECTED_VIDEO_CODEC = "h264"
EXPECTED_PIXEL_FORMAT = "yuv420p"
EXPECTED_FRAME_COUNT = 900
EXPECTED_DURATION_SECONDS = 30.0
EXPECTED_PLAYBACK_SPEED = 1.0
MIN_TRANSCODE_PSNR_DB = 45.0
NETWORK_SANDBOX_EXECUTABLE = "/usr/bin/sandbox-exec"
NETWORK_SANDBOX_PROFILE = (
    "(version 1) (allow default) (deny network*)"
)
EXPECTED_CHAPTERS = (
    ("closed_open", "closed", "solar", 120),
    ("solar_preview", "preview", "solar", 180),
    ("solar_armed", "armed", "solar", 150),
    ("moss_preview", "preview", "moss", 180),
    ("moss_armed", "armed", "moss", 150),
    ("closed_final", "closed", "solar", 120),
)
EXPECTED_ROUTE_TARGETS = {
    "solar": {
        "formId": "emberhorn_fusion_solar_crown_fire7_wind3",
        "name": "曜冠角兽",
    },
    "moss": {
        "formId": "emberhorn_fusion_moss_rampart_fire4_earth6",
        "name": "苔垒角兽",
    },
}
FORM_IDS = (
    "emberhorn_fusion_solar_crown_fire7_wind3",
    "emberhorn_fusion_moss_rampart_fire4_earth6",
)
PORTRAIT_PATHS = (
    "portrait/default.png",
    "portrait/portrait-meta.json",
    "portrait/source-and-ownership.md",
    "prompts/portrait-v1.txt",
    "qa/portrait/contact-sheet.png",
    "source/portrait/generation-attestation.json",
    "source/portrait/headshot-alpha-mask.png",
    "source/portrait/headshot-chroma-eligibility-mask.png",
    "source/portrait/headshot-master-1024.png",
    "source/portrait/headshot-original-generated.png",
    "source/portrait/headshot-raw-lossless.webp",
)
TRANSCODE_VIDEO_FILTER = (
    "scale=in_range=pc:out_range=tv,format=yuv420p"
)
FORBIDDEN_TIMING_TOKENS = (
    "setpts",
    "asetpts",
    "atempo",
    "minterpolate",
    "framestep",
    "tblend",
    "tmix",
    "tpad",
    "trim",
    "atrim",
    "loop",
    "aloop",
)
FORBIDDEN_TIMING_OPTIONS = frozenset(
    {
        "-r",
        "-vsync",
        "-fps_mode",
        "-ss",
        "-sseof",
        "-itsoffset",
        "-itsscale",
        "-t",
        "-to",
        "-shortest",
        "-filter_complex",
    }
)
SAFE_RUN_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
METAL_LOG_RE = re.compile(r"(?m)^Metal [^\r\n]+$")
MOVIE_LOG_RE = re.compile(
    r"(?m)^Movie Maker mode enabled, recording movie in "
    r"1280[×x]720 @ 30 FPS\.\.\.$"
)
SENSITIVE_ARGUMENT = re.compile(
    r"(?:password|passwd|secret|token|credential|api[-_]?key)",
    re.IGNORECASE,
)


class FusionReviewRecordingError(RuntimeError):
    """A strict closed-review recording contract failure."""


class _DuplicateJsonKey(ValueError):
    pass


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _new_run_id() -> str:
    timestamp = _utc_now().strftime("%Y%m%dT%H%M%S.%fZ")
    return f"phase376-{timestamp}-{uuid.uuid4().hex[:8]}"


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _json_sha256(value: Any) -> str:
    payload = json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def _reject_duplicate_pairs(
    pairs: list[tuple[str, Any]],
) -> dict[str, Any]:
    value: dict[str, Any] = {}
    for key, item in pairs:
        if key in value:
            raise _DuplicateJsonKey(f"JSON duplicate key: {key!r}")
        value[key] = item
    return value


def _read_json(path: Path, *, label: str) -> dict[str, Any]:
    try:
        value = json.loads(
            path.read_text(encoding="utf-8"),
            object_pairs_hook=_reject_duplicate_pairs,
        )
    except (OSError, UnicodeError, json.JSONDecodeError, _DuplicateJsonKey) as error:
        raise FusionReviewRecordingError(
            f"{label} 不是可用的严格 JSON：{path}: {error}"
        ) from error
    if not isinstance(value, dict):
        raise FusionReviewRecordingError(f"{label} JSON 根节点不是对象")
    return value


def _repo_relative(path: Path) -> str:
    resolved = path.resolve(strict=False)
    try:
        return resolved.relative_to(REPO_ROOT).as_posix()
    except ValueError as error:
        raise FusionReviewRecordingError(
            f"证据路径越出仓库根目录：{path}"
        ) from error


def _secure_existing_file(path: Path, *, label: str) -> Path:
    try:
        mode = path.lstat().st_mode
    except OSError as error:
        raise FusionReviewRecordingError(
            f"{label} 不存在：{path}"
        ) from error
    if stat.S_ISLNK(mode) or not stat.S_ISREG(mode):
        raise FusionReviewRecordingError(
            f"{label} 必须是非符号链接普通文件：{path}"
        )
    if path.stat().st_size <= 0:
        raise FusionReviewRecordingError(f"{label} 为空：{path}")
    return path


def _artifact_record(path: Path) -> dict[str, Any]:
    _secure_existing_file(path, label="证据文件")
    return {
        "path": _repo_relative(path),
        "sizeBytes": path.stat().st_size,
        "sha256": _sha256(path),
    }


def _resolve_output_root(path: Path) -> Path:
    resolved = (
        path.resolve(strict=False)
        if path.is_absolute()
        else (REPO_ROOT / path).resolve(strict=False)
    )
    evidence_root = (REPO_ROOT / ".run" / "evidence").resolve(strict=False)
    try:
        relative = resolved.relative_to(evidence_root)
    except ValueError as error:
        raise FusionReviewRecordingError(
            "录像输出必须位于仓库 .run/evidence/ 下"
        ) from error
    if not relative.parts:
        raise FusionReviewRecordingError(
            "录像输出不能直接使用 evidence 根目录"
        )
    current = evidence_root
    for part in relative.parts:
        current /= part
        try:
            mode = current.lstat().st_mode
        except FileNotFoundError:
            continue
        if stat.S_ISLNK(mode):
            raise FusionReviewRecordingError(
                f"录像输出路径不允许经过符号链接：{current}"
            )
        if current != resolved and not stat.S_ISDIR(mode):
            raise FusionReviewRecordingError(
                f"录像输出父路径不是目录：{current}"
            )
    return resolved


def _write_json(path: Path, value: Any) -> None:
    temporary = path.with_name(f".{path.name}.tmp")
    temporary.write_text(
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    temporary.replace(path)


def _require_executable(value: str, *, label: str) -> str:
    resolved = shutil.which(value)
    if resolved is None:
        raise FusionReviewRecordingError(
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
    try:
        os.killpg(process_group, signal.SIGKILL)
    except ProcessLookupError:
        return
    if process.poll() is None:
        process.wait(timeout=5)


def _run_capture(
    command: Sequence[str],
    *,
    timeout_seconds: float,
    environment: Mapping[str, str] | None = None,
) -> subprocess.CompletedProcess[str]:
    process = subprocess.Popen(
        list(command),
        cwd=REPO_ROOT,
        env=dict(environment) if environment is not None else None,
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
        raise FusionReviewRecordingError(
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


def _run_logged(
    command: Sequence[str],
    *,
    log_path: Path,
    timeout_seconds: float,
    environment: Mapping[str, str] | None = None,
) -> None:
    with log_path.open("w", encoding="utf-8") as log:
        log.write(f"$ {shlex.join(_redacted_command(command))}\n")
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
            raise FusionReviewRecordingError(
                f"命令超时（{timeout_seconds:.1f}s），详见 "
                f"{_repo_relative(log_path)}"
            ) from error
        except BaseException:
            _terminate_process_group(process)
            raise
    if return_code != 0:
        raise FusionReviewRecordingError(
            f"命令失败 exit={return_code}，详见 {_repo_relative(log_path)}"
        )


def _main_screen_bounds() -> dict[str, int]:
    completed = _run_capture(
        [
            "/usr/bin/osascript",
            "-e",
            (
                'tell application "Finder" to get bounds of '
                "window of desktop"
            ),
        ],
        timeout_seconds=10.0,
    )
    if completed.returncode != 0:
        raise FusionReviewRecordingError(
            "无法读取 macOS 主屏幕边界："
            + completed.stderr.strip()[-1000:]
        )
    try:
        values = [
            int(value.strip())
            for value in completed.stdout.strip().split(",")
        ]
    except ValueError as error:
        raise FusionReviewRecordingError(
            "macOS 主屏幕边界不是整数"
        ) from error
    if (
        len(values) != 4
        or values[2] <= values[0]
        or values[3] <= values[1]
    ):
        raise FusionReviewRecordingError(
            f"macOS 主屏幕边界不可用：{completed.stdout!r}"
        )
    return {
        "left": values[0],
        "top": values[1],
        "right": values[2],
        "bottom": values[3],
    }


def _window_observation(
    pid: int,
    *,
    screen_bounds: Mapping[str, int],
) -> dict[str, Any]:
    screen_left = int(screen_bounds["left"])
    screen_top = int(screen_bounds["top"])
    screen_right = int(screen_bounds["right"])
    screen_bottom = int(screen_bounds["bottom"])
    script = (
        'tell application "System Events"\n'
        f"set targets to every application process whose unix id is {pid}\n"
        'if (count of targets) is 0 then return "missing"\n'
        "set targetProcess to item 1 of targets\n"
        "set processVisible to visible of targetProcess\n"
        "set windowCount to count of windows of targetProcess\n"
        "set minimizedCount to 0\n"
        "set minimizedReadCount to 0\n"
        "set onScreenCount to 0\n"
        "set primaryBounds to {0, 0, 0, 0}\n"
        "set primaryIntersection to {0, 0, 0, 0}\n"
        "set primaryVisibleArea to 0\n"
        "set primaryWindowArea to 0\n"
        f"set screenLeft to {screen_left}\n"
        f"set screenTop to {screen_top}\n"
        f"set screenRight to {screen_right}\n"
        f"set screenBottom to {screen_bottom}\n"
        "repeat with targetWindow in windows of targetProcess\n"
        "set isMinimized to true\n"
        "set minimizedKnown to false\n"
        "try\n"
        'set isMinimized to value of attribute "AXMinimized" '
        "of targetWindow\n"
        "set minimizedKnown to true\n"
        "set minimizedReadCount to minimizedReadCount + 1\n"
        "end try\n"
        "if minimizedKnown and isMinimized then\n"
        "set minimizedCount to minimizedCount + 1\n"
        "else if minimizedKnown then\n"
        "try\n"
        "set windowPosition to position of targetWindow\n"
        "set windowSize to size of targetWindow\n"
        "set windowLeft to item 1 of windowPosition\n"
        "set windowTop to item 2 of windowPosition\n"
        "set windowWidth to item 1 of windowSize\n"
        "set windowHeight to item 2 of windowSize\n"
        "set windowRight to windowLeft + windowWidth\n"
        "set windowBottom to windowTop + windowHeight\n"
        "set intersectionLeft to windowLeft\n"
        "if intersectionLeft < screenLeft then "
        "set intersectionLeft to screenLeft\n"
        "set intersectionTop to windowTop\n"
        "if intersectionTop < screenTop then "
        "set intersectionTop to screenTop\n"
        "set intersectionRight to windowRight\n"
        "if intersectionRight > screenRight then "
        "set intersectionRight to screenRight\n"
        "set intersectionBottom to windowBottom\n"
        "if intersectionBottom > screenBottom then "
        "set intersectionBottom to screenBottom\n"
        "set intersectionWidth to intersectionRight - intersectionLeft\n"
        "set intersectionHeight to intersectionBottom - intersectionTop\n"
        "if windowWidth > 0 and windowHeight > 0 and "
        "intersectionWidth > 0 and intersectionHeight > 0 then\n"
        "set onScreenCount to onScreenCount + 1\n"
        "if item 3 of primaryBounds is 0 then\n"
        "set primaryBounds to "
        "{windowLeft, windowTop, windowWidth, windowHeight}\n"
        "set primaryIntersection to "
        "{intersectionLeft, intersectionTop, "
        "intersectionWidth, intersectionHeight}\n"
        "set primaryVisibleArea to "
        "intersectionWidth * intersectionHeight\n"
        "set primaryWindowArea to windowWidth * windowHeight\n"
        "end if\n"
        "end if\n"
        "end try\n"
        "end if\n"
        "end repeat\n"
        'return "window|" & (name of targetProcess as text) & "|" & '
        '(processVisible as text) & "|" & (windowCount as text) & "|" & '
        '(minimizedCount as text) & "|" & '
        '(minimizedReadCount as text) & "|" & '
        '(onScreenCount as text) & "|" & '
        '(item 1 of primaryBounds as text) & "|" & '
        '(item 2 of primaryBounds as text) & "|" & '
        '(item 3 of primaryBounds as text) & "|" & '
        '(item 4 of primaryBounds as text) & "|" & '
        '(screenLeft as text) & "|" & (screenTop as text) & "|" & '
        '(screenRight as text) & "|" & (screenBottom as text) & "|" & '
        '(item 1 of primaryIntersection as text) & "|" & '
        '(item 2 of primaryIntersection as text) & "|" & '
        '(item 3 of primaryIntersection as text) & "|" & '
        '(item 4 of primaryIntersection as text) & "|" & '
        '(primaryVisibleArea as text) & "|" & '
        '(primaryWindowArea as text)\n'
        "end tell"
    )
    try:
        completed = _run_capture(
            ["/usr/bin/osascript", "-e", script],
            timeout_seconds=5.0,
        )
    except FusionReviewRecordingError as error:
        # A single macOS Accessibility sample can transiently stall while
        # System Events is waking up.  Preserve that sample as evidence and
        # keep monitoring; the run still fails closed unless a later sample
        # proves a non-minimized, substantially on-screen Godot window.
        return {
            "status": "error",
            "error": str(error)[-1000:],
        }
    if completed.returncode != 0:
        return {
            "status": "error",
            "error": completed.stderr.strip()[-1000:],
        }
    text = completed.stdout.strip()
    if text == "missing":
        return {"status": "missing"}
    parts = text.split("|")
    if len(parts) == 21 and parts[0] == "window":
        try:
            window_count = int(parts[3])
            minimized_count = int(parts[4])
            minimized_read_count = int(parts[5])
            on_screen_count = int(parts[6])
            bounds_values = [int(value) for value in parts[7:11]]
            screen_values = [int(value) for value in parts[11:15]]
            intersection_values = [
                int(value) for value in parts[15:19]
            ]
            visible_area = int(parts[19])
            window_area = int(parts[20])
        except ValueError:
            return {"status": "unparsed", "raw": text[-1000:]}
        return {
            "status": (
                "window"
                if window_count > 0 or on_screen_count > 0
                else "process_without_window"
            ),
            "processName": parts[1],
            "processVisible": parts[2].lower() == "true",
            "windowCount": window_count,
            "minimizedWindowCount": minimized_count,
            "axMinimizedReadCount": minimized_read_count,
            "nonMinimizedOnScreenWindowCount": on_screen_count,
            "primaryVisibleWindowBounds": {
                "x": bounds_values[0],
                "y": bounds_values[1],
                "width": bounds_values[2],
                "height": bounds_values[3],
            },
            "mainScreenBounds": {
                "left": screen_values[0],
                "top": screen_values[1],
                "right": screen_values[2],
                "bottom": screen_values[3],
            },
            "primaryVisibleIntersection": {
                "x": intersection_values[0],
                "y": intersection_values[1],
                "width": intersection_values[2],
                "height": intersection_values[3],
            },
            "primaryVisibleArea": visible_area,
            "primaryWindowArea": window_area,
            "primaryVisibleFraction": (
                float(visible_area) / float(window_area)
                if window_area > 0
                else 0.0
            ),
        }
    return {"status": "unparsed", "raw": text[-1000:]}


def _internet_socket_lines(pid: int) -> list[str]:
    completed = _run_capture(
        ["/usr/sbin/lsof", "-nP", "-a", "-p", str(pid), "-i"],
        timeout_seconds=5.0,
    )
    if completed.returncode not in (0, 1):
        raise FusionReviewRecordingError(
            f"lsof Internet 取证失败 exit={completed.returncode}"
        )
    return [
        line.strip()
        for line in completed.stdout.splitlines()
        if line.strip() and not line.startswith("COMMAND ")
    ]


def _mysql_unix_socket_lines(pid: int) -> list[str]:
    completed = _run_capture(
        ["/usr/sbin/lsof", "-nP", "-a", "-p", str(pid), "-U"],
        timeout_seconds=5.0,
    )
    if completed.returncode not in (0, 1):
        raise FusionReviewRecordingError(
            f"lsof Unix socket 取证失败 exit={completed.returncode}"
        )
    return [
        line.strip()
        for line in completed.stdout.splitlines()
        if line.strip()
        and not line.startswith("COMMAND ")
        and ("mysql" in line.lower() or "mysqld" in line.lower())
    ]


def _descendant_processes(pid: int) -> list[dict[str, Any]]:
    completed = _run_capture(
        ["/bin/ps", "-axo", "pid=,ppid=,comm="],
        timeout_seconds=5.0,
    )
    if completed.returncode != 0:
        raise FusionReviewRecordingError("ps 子进程取证失败")
    rows: list[tuple[int, int, str]] = []
    for line in completed.stdout.splitlines():
        parts = line.strip().split(maxsplit=2)
        if len(parts) != 3:
            continue
        try:
            child_pid = int(parts[0])
            parent_pid = int(parts[1])
        except ValueError:
            continue
        rows.append((child_pid, parent_pid, parts[2]))
    descendants: set[int] = {pid}
    records: list[dict[str, Any]] = []
    changed = True
    while changed:
        changed = False
        for child_pid, parent_pid, command in rows:
            if parent_pid not in descendants or child_pid in descendants:
                continue
            descendants.add(child_pid)
            records.append(
                {
                    "pid": child_pid,
                    "parentPid": parent_pid,
                    "command": command,
                }
            )
            changed = True
    return records


def _window_observation_is_qualifying(value: Any) -> bool:
    if not isinstance(value, Mapping):
        return False
    bounds = value.get("primaryVisibleWindowBounds")
    intersection = value.get("primaryVisibleIntersection")
    return (
        value.get("status") == "window"
        and value.get("processVisible") is True
        and int(value.get("axMinimizedReadCount", 0)) >= 1
        and int(value.get("nonMinimizedOnScreenWindowCount", 0)) >= 1
        and isinstance(bounds, Mapping)
        and int(bounds.get("width", 0))
        >= math.ceil(EXPECTED_WIDTH / 2)
        and int(bounds.get("height", 0))
        >= math.ceil(EXPECTED_HEIGHT / 2)
        and isinstance(intersection, Mapping)
        and int(intersection.get("width", 0))
        >= math.ceil(int(bounds.get("width", 0)) * 0.9)
        and int(intersection.get("height", 0))
        >= math.ceil(int(bounds.get("height", 0)) * 0.9)
        and float(value.get("primaryVisibleFraction", 0.0)) >= 0.9
    )


def _validate_runtime_monitor(
    monitor: Mapping[str, Any],
) -> dict[str, Any]:
    errors: list[str] = []
    window = monitor.get("visibleWindow")
    if not _window_observation_is_qualifying(window):
        errors.append("没有合格的可见未最小化主屏窗口观察")

    observations = monitor.get("windowObservations")
    qualifying_indices: list[int] = []
    observer_error_count = 0
    if not isinstance(observations, list):
        errors.append("windowObservations")
        observations = []
    else:
        qualifying_indices = [
            index
            for index, observation in enumerate(observations)
            if _window_observation_is_qualifying(observation)
        ]
        observer_error_count = sum(
            1
            for observation in observations
            if isinstance(observation, Mapping)
            and observation.get("status") in ("error", "unparsed")
        )
        if len(qualifying_indices) < 2:
            errors.append("可见窗口有效采样少于2次")
        else:
            first_index = qualifying_indices[0]
            last_index = qualifying_indices[-1]
            invalid_middle = [
                index
                for index in range(first_index, last_index + 1)
                if not _window_observation_is_qualifying(
                    observations[index]
                )
                and not (
                    isinstance(observations[index], Mapping)
                    and observations[index].get("status")
                    in ("error", "unparsed")
                )
            ]
            if invalid_middle:
                errors.append(
                    "录像期间窗口可见状态中断："
                    f"{invalid_middle}"
                )
            invalid_terminal_windows = [
                index
                for index in range(last_index + 1, len(observations))
                if isinstance(observations[index], Mapping)
                and observations[index].get("status") == "window"
                and not _window_observation_is_qualifying(
                    observations[index]
                )
            ]
            # Godot can drop its drawable surface during the one terminal
            # sample after MovieWriter has already closed the 900th frame.
            # More than one such suffix sample means visibility was not
            # sustained through the captured run.
            if len(invalid_terminal_windows) > 1:
                errors.append(
                    "录像尾段窗口持续不可见："
                    f"{invalid_terminal_windows}"
                )
    if int(monitor.get("socketSampleCount", 0)) < 1:
        errors.append("没有完成网络 socket 取样")
    sandbox = monitor.get("networkSandbox")
    if (
        not isinstance(sandbox, Mapping)
        or sandbox.get("executable") != NETWORK_SANDBOX_EXECUTABLE
        or sandbox.get("profile") != NETWORK_SANDBOX_PROFILE
        or sandbox.get("denyNetworkSyscalls") is not True
        or sandbox.get("inheritedByDescendants") is not True
    ):
        errors.append("networkSandbox")
    socket_samples = monitor.get("socketSamples")
    if (
        not isinstance(socket_samples, list)
        or len(socket_samples)
        != int(monitor.get("socketSampleCount", 0))
        or any(
            not isinstance(sample, Mapping)
            or not isinstance(sample.get("pids"), list)
            or int(monitor.get("pid", -1)) not in sample.get("pids", [])
            for sample in socket_samples
        )
    ):
        errors.append("socketSamples")
    internet = monitor.get("internetSocketLines")
    if not isinstance(internet, list) or internet:
        errors.append(f"internetSocketLines={internet!r}")
    mysql = monitor.get("mysqlUnixSocketLines")
    if not isinstance(mysql, list) or mysql:
        errors.append(f"mysqlUnixSocketLines={mysql!r}")
    descendants = monitor.get("descendantProcesses")
    if not isinstance(descendants, list):
        errors.append("descendantProcesses")
        descendants = []
    forbidden_processes = []
    for record in descendants:
        if not isinstance(record, Mapping):
            continue
        command = str(record.get("command", "")).lower()
        if any(
            marker in command
            for marker in (
                "/node",
                "/npm",
                "mysqld",
                "mysql.server",
                "start-backend",
            )
        ):
            forbidden_processes.append(dict(record))
    if forbidden_processes:
        errors.append(f"forbiddenProcesses={forbidden_processes!r}")
    if errors:
        raise FusionReviewRecordingError(
            "Godot 可见窗口/离线运行取证未通过：" + "；".join(errors)
        )
    validated = dict(monitor)
    validated.update(
        {
            "visibleWindowProcessVerified": True,
            "visibleNonMinimizedWindowVerified": True,
            "visibleWindowContinuityVerified": True,
            "visibleWindowQualifiedSampleCount": len(
                qualifying_indices
            ),
            "windowObserverErrorSampleCount": observer_error_count,
            "internetSocketObserved": False,
            "mysqlUnixSocketObserved": False,
            "backendProcessObserved": False,
            "kernelNetworkDenyPolicyApplied": True,
        }
    )
    return validated


def _run_godot_logged_monitored(
    command: Sequence[str],
    *,
    log_path: Path,
    monitor_path: Path,
    timeout_seconds: float,
    environment: Mapping[str, str],
) -> dict[str, Any]:
    main_screen_bounds = _main_screen_bounds()
    with log_path.open("w", encoding="utf-8") as log:
        log.write(f"$ {shlex.join(_redacted_command(command))}\n")
        log.flush()
        process = subprocess.Popen(
            list(command),
            cwd=REPO_ROOT,
            env=dict(environment),
            stdin=subprocess.DEVNULL,
            stdout=log,
            stderr=subprocess.STDOUT,
            text=True,
            start_new_session=True,
        )
        started = time.monotonic()
        socket_sample_count = 0
        window_observations: list[dict[str, Any]] = []
        internet_lines: set[str] = set()
        mysql_lines: set[str] = set()
        descendant_records: dict[int, dict[str, Any]] = {}
        socket_samples: list[dict[str, Any]] = []
        last_sample = -1.0
        timed_out = False
        try:
            while process.poll() is None:
                elapsed = time.monotonic() - started
                if elapsed > timeout_seconds:
                    timed_out = True
                    _terminate_process_group(process)
                    break
                if elapsed - last_sample >= 0.15:
                    last_sample = elapsed
                    observation = dict(
                        _window_observation(
                            process.pid,
                            screen_bounds=main_screen_bounds,
                        )
                    )
                    observation["elapsedSeconds"] = round(elapsed, 6)
                    window_observations.append(observation)
                    descendants = _descendant_processes(process.pid)
                    for record in descendants:
                        descendant_records[int(record["pid"])] = record
                    sampled_pids = sorted(
                        {
                            process.pid,
                            *(
                                int(record["pid"])
                                for record in descendants
                            ),
                        }
                    )
                    sample_internet_lines: list[str] = []
                    sample_mysql_lines: list[str] = []
                    for sampled_pid in sampled_pids:
                        for line in _internet_socket_lines(sampled_pid):
                            record = f"pid={sampled_pid} {line}"
                            internet_lines.add(record)
                            sample_internet_lines.append(record)
                        for line in _mysql_unix_socket_lines(sampled_pid):
                            record = f"pid={sampled_pid} {line}"
                            mysql_lines.add(record)
                            sample_mysql_lines.append(record)
                    socket_samples.append(
                        {
                            "elapsedSeconds": round(elapsed, 6),
                            "pids": sampled_pids,
                            "internetSocketLines": sample_internet_lines,
                            "mysqlUnixSocketLines": sample_mysql_lines,
                        }
                    )
                    socket_sample_count += 1
                time.sleep(0.02)
        except BaseException:
            _terminate_process_group(process)
            raise
        return_code = process.wait(timeout=5)
    qualifying_windows = [
        value
        for value in window_observations
        if _window_observation_is_qualifying(value)
    ]
    visible_window = max(
        qualifying_windows,
        key=lambda value: float(
            value.get("primaryVisibleFraction", 0.0)
        ),
        default=None,
    )
    monitor = {
        "schemaVersion": 1,
        "pid": process.pid,
        "sampleIntervalTargetSeconds": 0.15,
        "socketSampleCount": socket_sample_count,
        "socketSamples": socket_samples,
        "windowObservationCount": len(window_observations),
        "windowObservations": window_observations,
        "visibleWindow": visible_window,
        "mainScreenBounds": main_screen_bounds,
        "internetSocketLines": sorted(internet_lines),
        "mysqlUnixSocketLines": sorted(mysql_lines),
        "descendantProcesses": sorted(
            descendant_records.values(),
            key=lambda value: int(value["pid"]),
        ),
        "godotExitCode": return_code,
        "timedOut": timed_out,
        "networkSandbox": {
            "executable": NETWORK_SANDBOX_EXECUTABLE,
            "profile": NETWORK_SANDBOX_PROFILE,
            "denyNetworkSyscalls": True,
            "inheritedByDescendants": True,
        },
    }
    _write_json(monitor_path, monitor)
    if timed_out:
        raise FusionReviewRecordingError(
            f"Godot 录像超时（{timeout_seconds:.1f}s）"
        )
    if return_code != 0:
        raise FusionReviewRecordingError(
            f"Godot 录像失败 exit={return_code}，详见 "
            f"{_repo_relative(log_path)}"
        )
    return _validate_runtime_monitor(monitor)


def _capture_version(executable: str, arguments: Sequence[str]) -> str:
    completed = _run_capture(
        [executable, *arguments],
        timeout_seconds=30.0,
    )
    if completed.returncode != 0:
        raise FusionReviewRecordingError(
            f"无法读取工具版本：{executable} {' '.join(arguments)}"
        )
    output = (completed.stdout or completed.stderr).strip()
    return output.splitlines()[0] if output else "unknown"


def _prepare_self_contained_godot(
    *,
    original_godot: str,
    temporary_dir: Path,
    clone_log: Path,
    timeout_seconds: float,
) -> tuple[str, Path]:
    original_executable = Path(original_godot).resolve(strict=True)
    try:
        app_root = original_executable.parents[2]
    except IndexError as error:
        raise FusionReviewRecordingError(
            "Godot 可执行文件不是可隔离的 macOS .app"
        ) from error
    expected_suffix = Path("Contents") / "MacOS"
    if (
        app_root.suffix != ".app"
        or original_executable.parent.relative_to(app_root)
        != expected_suffix
    ):
        raise FusionReviewRecordingError(
            "Godot 正式录像必须使用 macOS .app 内可执行文件，"
            "以便启用独立 self-contained user://"
        )
    clone_root = temporary_dir / "GodotFusionReview.app"
    if clone_root.exists() or clone_root.is_symlink():
        raise FusionReviewRecordingError("self-contained Godot clone 已存在")
    _run_logged(
        [
            "/bin/cp",
            "-cR",
            str(app_root),
            str(clone_root),
        ],
        log_path=clone_log,
        timeout_seconds=timeout_seconds,
    )
    # Godot checks beside the executable and, on macOS, beside the .app bundle.
    # Keep a Contents marker too for older packaging variants.  Every marker is
    # inside this run's disposable tmp tree and cannot affect the installed
    # editor.
    markers = (
        temporary_dir / "._sc_",
        clone_root / "Contents" / "._sc_",
        clone_root / "Contents" / "MacOS" / "._sc_",
    )
    for marker in markers:
        marker.touch(mode=0o600, exist_ok=False)
    clone_executable = (
        clone_root / "Contents" / "MacOS" / original_executable.name
    )
    _secure_existing_file(
        clone_executable,
        label="self-contained Godot 可执行文件",
    )
    return str(clone_executable), clone_root


def _preserve_isolated_user_data(
    *,
    actual_user_data_dir: Path,
    allowed_root: Path,
    destination: Path,
) -> dict[str, Any]:
    actual = actual_user_data_dir.resolve(strict=True)
    allowed = allowed_root.resolve(strict=True)
    try:
        relative = actual.relative_to(allowed)
    except ValueError as error:
        raise FusionReviewRecordingError(
            "Godot user:// 没有落在本次隔离 home 内"
        ) from error
    if not relative.parts:
        raise FusionReviewRecordingError(
            "Godot user:// 不能等于隔离 home 根"
        )
    mode = actual.lstat().st_mode
    if stat.S_ISLNK(mode) or not stat.S_ISDIR(mode):
        raise FusionReviewRecordingError(
            "self-contained Godot user:// 不是普通目录"
        )
    if destination.exists() or destination.is_symlink():
        raise FusionReviewRecordingError("user-data 证据目标已存在")
    actual.replace(destination)
    return _user_data_inventory(destination)


def _remove_generated_godot_clone(clone_root: Path) -> bool:
    if clone_root.name != "GodotFusionReview.app":
        raise FusionReviewRecordingError(
            f"拒绝清理非预期 Godot clone：{clone_root}"
        )
    external_marker = clone_root.parent / "._sc_"
    if external_marker.exists() or external_marker.is_symlink():
        marker_mode = external_marker.lstat().st_mode
        if stat.S_ISLNK(marker_mode) or not stat.S_ISREG(marker_mode):
            raise FusionReviewRecordingError(
                "拒绝清理非普通文件 self-contained marker："
                f"{external_marker}"
            )
    if clone_root.exists() or clone_root.is_symlink():
        if clone_root.is_symlink() or not clone_root.is_dir():
            raise FusionReviewRecordingError(
                f"拒绝清理非预期 Godot clone：{clone_root}"
            )
        shutil.rmtree(clone_root)
    if external_marker.exists():
        external_marker.unlink()
    return (
        not clone_root.exists()
        and not clone_root.is_symlink()
        and not external_marker.exists()
        and not external_marker.is_symlink()
    )


def _validate_release_report(report: Mapping[str, Any]) -> dict[str, Any]:
    errors: list[str] = []
    if report.get("status") != "PASS":
        errors.append(f"status={report.get('status')!r}")
    if report.get("runtimeEnabled") is not False:
        errors.append("runtimeEnabled 未保持 false")
    if report.get("playerEntryOpened") is not False:
        errors.append("playerEntryOpened 未保持 false")
    if report.get("ownerReviewStatus") not in (
        None,
        "owner_review_pending",
        "pending",
    ):
        errors.append(
            f"ownerReviewStatus={report.get('ownerReviewStatus')!r}"
        )
    if errors:
        raise FusionReviewRecordingError(
            "融合关闭发布验证未通过：" + "；".join(errors)
        )
    return dict(report)


def _run_release_verifier(
    *,
    python: str,
    timeout_seconds: float,
) -> dict[str, Any]:
    _secure_existing_file(RELEASE_VERIFIER, label="融合关闭发布验证器")
    completed = _run_capture(
        [
            python,
            str(RELEASE_VERIFIER),
            "--repo-root",
            str(REPO_ROOT),
        ],
        timeout_seconds=timeout_seconds,
    )
    if completed.returncode != 0:
        detail = (completed.stderr or completed.stdout).strip()
        raise FusionReviewRecordingError(
            "融合关闭发布验证器失败，正式录像不会启动："
            f"{detail[-2000:]}"
        )
    try:
        value = json.loads(
            completed.stdout,
            object_pairs_hook=_reject_duplicate_pairs,
        )
    except (json.JSONDecodeError, _DuplicateJsonKey) as error:
        raise FusionReviewRecordingError(
            "融合关闭发布验证器没有返回严格 JSON"
        ) from error
    if not isinstance(value, dict):
        raise FusionReviewRecordingError("融合关闭发布验证报告不是对象")
    return _validate_release_report(value)


def _dict_path(value: Mapping[str, Any], *parts: str) -> Any:
    current: Any = value
    for part in parts:
        if not isinstance(current, Mapping):
            return None
        current = current.get(part)
    return current


def _portrait_readiness() -> list[dict[str, Any]]:
    catalog = _read_json(ART_CATALOG, label="宠物美术目录")
    forms = catalog.get("forms")
    if not isinstance(forms, list):
        raise FusionReviewRecordingError("宠物美术目录 forms 不是数组")
    records: list[dict[str, Any]] = []
    for form_id in FORM_IDS:
        matches = [
            value
            for value in forms
            if isinstance(value, dict) and value.get("formId") == form_id
        ]
        if len(matches) != 1:
            raise FusionReviewRecordingError(
                f"{form_id} 在宠物美术目录中必须唯一"
            )
        form = matches[0]
        if form.get("runtimeEnabled") is not False:
            raise FusionReviewRecordingError(
                f"{form_id} runtimeEnabled 必须保持 false"
            )
        pet = form.get("pet")
        if not isinstance(pet, dict):
            raise FusionReviewRecordingError(f"{form_id}.pet 不是对象")
        expected_root_relative = (
            Path("client/godot/assets/pets") / form_id
        )
        if pet.get("root") != expected_root_relative.as_posix():
            raise FusionReviewRecordingError(f"{form_id}.pet.root 漂移")
        expected_portrait = (
            expected_root_relative / "portrait" / "default.png"
        ).as_posix()
        if pet.get("portraitPath") != expected_portrait:
            raise FusionReviewRecordingError(
                f"{form_id}.pet.portraitPath 漂移"
            )
        root = REPO_ROOT / expected_root_relative
        files: list[dict[str, Any]] = []
        for relative in PORTRAIT_PATHS:
            path = root / relative
            _secure_existing_file(
                path,
                label=f"{form_id} 正式 portrait 文件",
            )
            files.append(
                {
                    "relativePath": relative,
                    "sizeBytes": path.stat().st_size,
                    "sha256": _sha256(path),
                }
            )
        metadata = _read_json(
            root / "portrait" / "portrait-meta.json",
            label=f"{form_id} portrait-meta",
        )
        attestation = _read_json(
            root / "source" / "portrait" / "generation-attestation.json",
            label=f"{form_id} generation-attestation",
        )
        runtime_path = root / "portrait" / "default.png"
        master_path = (
            root / "source" / "portrait" / "headshot-master-1024.png"
        )
        metadata_errors: list[str] = []
        if metadata.get("formId") != form_id:
            metadata_errors.append("formId")
        if metadata.get("semanticIndependenceVerified") is not False:
            metadata_errors.append("semanticIndependenceVerified")
        if metadata.get("fullBodyCropAllowed") is not False:
            metadata_errors.append("fullBodyCropAllowed")
        if _dict_path(metadata, "ownerReview", "required") is not True:
            metadata_errors.append("ownerReview.required")
        if (
            _dict_path(metadata, "ownerReview", "status")
            != "owner_review_pending"
        ):
            metadata_errors.append("ownerReview.status")
        if (
            _dict_path(metadata, "assets", "runtime", "path")
            != expected_portrait
        ):
            metadata_errors.append("assets.runtime.path")
        if (
            _dict_path(metadata, "assets", "runtime", "sha256")
            != _sha256(runtime_path)
        ):
            metadata_errors.append("assets.runtime.sha256")
        if _dict_path(metadata, "assets", "runtime", "width") != 512:
            metadata_errors.append("assets.runtime.width")
        if _dict_path(metadata, "assets", "runtime", "height") != 512:
            metadata_errors.append("assets.runtime.height")
        expected_master = (
            expected_root_relative
            / "source"
            / "portrait"
            / "headshot-master-1024.png"
        ).as_posix()
        if (
            _dict_path(metadata, "assets", "master", "path")
            != expected_master
        ):
            metadata_errors.append("assets.master.path")
        if (
            _dict_path(metadata, "assets", "master", "sha256")
            != _sha256(master_path)
        ):
            metadata_errors.append("assets.master.sha256")
        if _dict_path(metadata, "assets", "master", "width") != 1024:
            metadata_errors.append("assets.master.width")
        if _dict_path(metadata, "assets", "master", "height") != 1024:
            metadata_errors.append("assets.master.height")
        if attestation.get("ownerReviewStatus") != "owner_review_pending":
            metadata_errors.append("attestation.ownerReviewStatus")
        if attestation.get("semanticIndependenceVerified") is not False:
            metadata_errors.append(
                "attestation.semanticIndependenceVerified"
            )
        if metadata_errors:
            raise FusionReviewRecordingError(
                f"{form_id} 正式 portrait 合同未通过："
                + "、".join(metadata_errors)
            )
        records.append(
            {
                "formId": form_id,
                "catalogRuntimeEnabled": False,
                "portraitPath": expected_portrait,
                "portraitSha256": _sha256(runtime_path),
                "masterSha256": _sha256(master_path),
                "ownerReviewStatus": "owner_review_pending",
                "semanticIndependenceVerified": False,
                "requiredFiles": files,
            }
        )
    return records


def _build_godot_command(
    *,
    godot: str,
    expected_user_data_root: Path,
    avi_path: Path,
    sequence_report: Path,
) -> list[str]:
    return [
        NETWORK_SANDBOX_EXECUTABLE,
        "-p",
        NETWORK_SANDBOX_PROFILE,
        godot,
        "--path",
        str(GODOT_PROJECT),
        "--display-driver",
        "macos",
        "--rendering-driver",
        "metal",
        "--audio-driver",
        "Dummy",
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
        "--script",
        SEQUENCE_SCRIPT,
        "--",
        f"--report={sequence_report}",
        f"--expected-user-data-root={expected_user_data_root}",
    ]


def _build_transcode_command(
    *,
    ffmpeg: str,
    avi_path: Path,
    candidate_path: Path,
) -> list[str]:
    command = [
        ffmpeg,
        "-y",
        "-v",
        "warning",
        "-i",
        str(avi_path),
        "-map",
        "0:v:0",
        "-vf",
        TRANSCODE_VIDEO_FILTER,
        "-c:v",
        "libx264",
        "-x264-params",
        "keyint=900:min-keyint=900:scenecut=0",
        "-preset",
        "slow",
        "-crf",
        "18",
        "-pix_fmt",
        EXPECTED_PIXEL_FORMAT,
        "-color_range",
        "tv",
        "-an",
        "-map_metadata",
        "-1",
        "-movflags",
        "+faststart",
        str(candidate_path),
    ]
    _assert_no_timing_transform(command)
    return command


def _assert_no_timing_transform(command: Sequence[str]) -> None:
    values = [str(value) for value in command]
    lower_values = [value.lower() for value in values]
    for option in FORBIDDEN_TIMING_OPTIONS:
        if option in lower_values:
            raise FusionReviewRecordingError(
                f"转码命令禁止改变时序：{option}"
            )
    filter_values: list[str] = []
    for index, value in enumerate(lower_values[:-1]):
        if value in ("-vf", "-filter:v"):
            filter_values.append(lower_values[index + 1])
    if filter_values != [TRANSCODE_VIDEO_FILTER]:
        raise FusionReviewRecordingError(
            "转码视频滤镜必须精确保持无时序变换合同"
        )
    joined_filters = ",".join(filter_values)
    for token in FORBIDDEN_TIMING_TOKENS:
        if token in joined_filters:
            raise FusionReviewRecordingError(
                f"转码滤镜禁止改变时序：{token}"
            )
    if "-an" not in lower_values:
        raise FusionReviewRecordingError(
            "正式融合验收视频必须明确省略静音流"
        )
    if "-map" not in lower_values or "0:v:0" not in lower_values:
        raise FusionReviewRecordingError("转码命令必须精确映射视频流")


def _parse_fraction(value: Any, *, label: str) -> Fraction:
    try:
        return Fraction(str(value))
    except (ValueError, ZeroDivisionError) as error:
        raise FusionReviewRecordingError(
            f"ffprobe {label} 无法解析：{value!r}"
        ) from error


def _stream_duration(
    stream: Mapping[str, Any],
    probe: Mapping[str, Any],
) -> float:
    raw = stream.get("duration")
    if raw in (None, "N/A"):
        format_value = probe.get("format")
        raw = (
            format_value.get("duration")
            if isinstance(format_value, Mapping)
            else None
        )
    try:
        return float(raw)
    except (TypeError, ValueError):
        return -1.0


def _validate_probe(
    probe: Mapping[str, Any],
    *,
    expected_frame_count: int = EXPECTED_FRAME_COUNT,
    expected_duration_seconds: float = EXPECTED_DURATION_SECONDS,
) -> dict[str, Any]:
    streams = probe.get("streams")
    if not isinstance(streams, list):
        raise FusionReviewRecordingError("ffprobe streams 不是数组")
    videos = [
        value
        for value in streams
        if isinstance(value, dict) and value.get("codec_type") == "video"
    ]
    audios = [
        value
        for value in streams
        if isinstance(value, dict) and value.get("codec_type") == "audio"
    ]
    errors: list[str] = []
    if len(videos) != 1:
        errors.append(f"videoStreamCount={len(videos)}")
    if audios:
        errors.append(f"audioStreamCount={len(audios)}")
    if not videos:
        raise FusionReviewRecordingError(
            "视频元数据未通过融合录像合同：" + "；".join(errors)
        )
    video = videos[0]
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
    average_fps = _parse_fraction(
        video.get("avg_frame_rate"),
        label="average fps",
    )
    real_fps = _parse_fraction(
        video.get("r_frame_rate"),
        label="real fps",
    )
    if average_fps != EXPECTED_FPS:
        errors.append(f"video.avgFps={average_fps}")
    if real_fps != EXPECTED_FPS:
        errors.append(f"video.realFps={real_fps}")
    raw_frame_count = video.get("nb_read_frames") or video.get("nb_frames")
    try:
        frame_count = int(raw_frame_count)
    except (TypeError, ValueError):
        frame_count = -1
    if frame_count != expected_frame_count:
        errors.append(
            f"video.frameCount={frame_count}, expected={expected_frame_count}"
        )
    duration = _stream_duration(video, probe)
    if not math.isfinite(duration):
        errors.append(f"video.duration={duration}")
    else:
        tolerance = 1.0 / float(EXPECTED_FPS)
        if abs(duration - expected_duration_seconds) > tolerance:
            errors.append(
                "video.duration="
                f"{duration:.6f}, expected={expected_duration_seconds:.6f}"
            )
        frame_duration = (
            float(frame_count) / float(EXPECTED_FPS)
            if frame_count > 0
            else -1.0
        )
        if abs(duration - frame_duration) > tolerance:
            errors.append(
                "video duration 与完整解码帧数不一致："
                f"{duration:.6f} vs {frame_duration:.6f}"
            )
    if errors:
        raise FusionReviewRecordingError(
            "视频元数据未通过融合录像合同：" + "；".join(errors)
        )
    return {
        "videoCodec": EXPECTED_VIDEO_CODEC,
        "pixelFormat": EXPECTED_PIXEL_FORMAT,
        "audioPresent": False,
        "audioPolicy": "omitted_silent",
        "width": EXPECTED_WIDTH,
        "height": EXPECTED_HEIGHT,
        "averageFps": float(average_fps),
        "realFps": float(real_fps),
        "durationSeconds": duration,
        "frameCount": frame_count,
    }


def _write_probe(
    *,
    ffprobe: str,
    video_path: Path,
    output_path: Path,
) -> dict[str, Any]:
    completed = _run_capture(
        [
            ffprobe,
            "-v",
            "error",
            "-count_frames",
            "-show_entries",
            (
                "stream=index,codec_type,codec_name,pix_fmt,width,height,"
                "r_frame_rate,avg_frame_rate,nb_frames,nb_read_frames,"
                "duration:format=format_name,duration,size"
            ),
            "-of",
            "json",
            str(video_path),
        ],
        timeout_seconds=180.0,
    )
    if completed.returncode != 0:
        raise FusionReviewRecordingError(
            f"ffprobe 失败 exit={completed.returncode}: "
            f"{completed.stderr.strip()}"
        )
    try:
        probe = json.loads(
            completed.stdout,
            object_pairs_hook=_reject_duplicate_pairs,
        )
    except (json.JSONDecodeError, _DuplicateJsonKey) as error:
        raise FusionReviewRecordingError(
            "ffprobe 没有返回严格 JSON"
        ) from error
    if not isinstance(probe, dict):
        raise FusionReviewRecordingError("ffprobe JSON 根节点不是对象")
    _write_json(output_path, probe)
    return probe


def _validate_frame_timeline(
    timeline: Mapping[str, Any],
    *,
    expected_frame_count: int = EXPECTED_FRAME_COUNT,
) -> dict[str, Any]:
    frames = timeline.get("frames")
    if not isinstance(frames, list):
        raise FusionReviewRecordingError("ffprobe frame timeline 不是数组")
    if len(frames) != expected_frame_count:
        raise FusionReviewRecordingError(
            "逐帧时序数量错误："
            f"{len(frames)}，期望 {expected_frame_count}"
        )
    frame_duration = 1.0 / float(EXPECTED_FPS)
    tolerance = 0.0000011
    previous_pts: float | None = None
    for index, frame in enumerate(frames):
        if not isinstance(frame, dict) or frame.get("media_type") != "video":
            raise FusionReviewRecordingError(
                f"逐帧时序第 {index} 项不是视频帧"
            )
        raw_pts = frame.get("pts_time")
        raw_best_effort = frame.get("best_effort_timestamp_time")
        raw_duration = frame.get("duration_time")
        try:
            pts = float(raw_pts)
            best_effort = float(raw_best_effort)
            duration = float(raw_duration)
        except (TypeError, ValueError) as error:
            raise FusionReviewRecordingError(
                f"逐帧时序第 {index} 项时间字段不可解析"
            ) from error
        expected_pts = index * frame_duration
        if (
            not math.isfinite(pts)
            or not math.isfinite(best_effort)
            or not math.isfinite(duration)
        ):
            raise FusionReviewRecordingError(
                f"逐帧时序第 {index} 项不是有限时间"
            )
        if abs(pts - expected_pts) > tolerance:
            raise FusionReviewRecordingError(
                f"逐帧 PTS 第 {index} 帧漂移："
                f"{pts:.6f}，期望 {expected_pts:.6f}"
            )
        if abs(best_effort - pts) > tolerance:
            raise FusionReviewRecordingError(
                f"逐帧 best-effort PTS 第 {index} 帧不等于 PTS"
            )
        if abs(duration - frame_duration) > tolerance:
            raise FusionReviewRecordingError(
                f"逐帧 duration 第 {index} 帧不是 1/30 秒"
            )
        if previous_pts is not None:
            delta = pts - previous_pts
            if abs(delta - frame_duration) > tolerance:
                raise FusionReviewRecordingError(
                    f"逐帧 PTS 间隔第 {index} 帧不是 1/30 秒"
                )
        previous_pts = pts
    last_pts = float(frames[-1]["pts_time"])
    last_duration = float(frames[-1]["duration_time"])
    total = last_pts + last_duration
    expected_total = expected_frame_count * frame_duration
    if abs(total - expected_total) > tolerance:
        raise FusionReviewRecordingError(
            "逐帧 PTS 终点与1.00x总时长不一致："
            f"{total:.6f} vs {expected_total:.6f}"
        )
    return {
        "status": "passed",
        "frameCount": expected_frame_count,
        "firstPtsSeconds": float(frames[0]["pts_time"]),
        "lastPtsSeconds": last_pts,
        "perFrameDurationSeconds": frame_duration,
        "timelineEndSeconds": total,
        "constantFrameIntervalVerified": True,
        "allPtsMatchFrameIndexAt30Fps": True,
    }


def _write_frame_timeline(
    *,
    ffprobe: str,
    video_path: Path,
    output_path: Path,
    expected_frame_count: int,
) -> dict[str, Any]:
    completed = _run_capture(
        [
            ffprobe,
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_frames",
            "-show_entries",
            (
                "frame=media_type,pts_time,best_effort_timestamp_time,"
                "duration_time"
            ),
            "-of",
            "json",
            str(video_path),
        ],
        timeout_seconds=180.0,
    )
    if completed.returncode != 0:
        raise FusionReviewRecordingError(
            f"ffprobe 逐帧时序失败 exit={completed.returncode}: "
            f"{completed.stderr.strip()}"
        )
    try:
        timeline = json.loads(
            completed.stdout,
            object_pairs_hook=_reject_duplicate_pairs,
        )
    except (json.JSONDecodeError, _DuplicateJsonKey) as error:
        raise FusionReviewRecordingError(
            "ffprobe 逐帧时序没有返回严格 JSON"
        ) from error
    if not isinstance(timeline, dict):
        raise FusionReviewRecordingError(
            "ffprobe 逐帧时序 JSON 根节点不是对象"
        )
    summary = _validate_frame_timeline(
        timeline,
        expected_frame_count=expected_frame_count,
    )
    _write_json(output_path, timeline)
    return summary


def _validate_frame_visual_signatures(
    text: str,
    *,
    expected_frame_count: int = EXPECTED_FRAME_COUNT,
    media_label: str = "raw",
) -> dict[str, Any]:
    required_headers = (
        "#hash: SHA256",
        f"#tb 0: 1/{EXPECTED_FPS.numerator}",
        f"#dimensions 0: {EXPECTED_WIDTH}x{EXPECTED_HEIGHT}",
    )
    for header in required_headers:
        if header not in text:
            raise FusionReviewRecordingError(
                f"{media_label} 逐帧画面签名缺少头：{header}"
            )
    records: list[dict[str, Any]] = []
    for line in text.splitlines():
        if not line.strip() or line.startswith("#"):
            continue
        parts = [value.strip() for value in line.split(",")]
        if len(parts) != 6:
            raise FusionReviewRecordingError(
                f"{media_label} 逐帧画面签名行字段数错误：{line!r}"
            )
        try:
            stream_index = int(parts[0])
            dts = int(parts[1])
            pts = int(parts[2])
            duration = int(parts[3])
            size = int(parts[4])
        except ValueError as error:
            raise FusionReviewRecordingError(
                f"{media_label} 逐帧画面签名行不是整数：{line!r}"
            ) from error
        signature = parts[5].lower()
        frame_index = len(records)
        if (
            stream_index != 0
            or dts != frame_index
            or pts != frame_index
            or duration != 1
            or size != EXPECTED_WIDTH * EXPECTED_HEIGHT * 4
            or SHA256_RE.fullmatch(signature) is None
        ):
            raise FusionReviewRecordingError(
                f"{media_label} 第 {frame_index} 帧画面签名合同错误"
            )
        records.append(
            {
                "frameIndex": frame_index,
                "sha256": signature,
            }
        )
    if len(records) != expected_frame_count:
        raise FusionReviewRecordingError(
            f"{media_label} 逐帧画面签名数量错误："
            f"{len(records)} != {expected_frame_count}"
        )

    chapter_records: list[dict[str, Any]] = []
    cursor = 0
    previous_signature = ""
    for chapter_id, state, route, frame_count in EXPECTED_CHAPTERS:
        end = cursor + frame_count
        chapter_signatures = {
            record["sha256"] for record in records[cursor:end]
        }
        if len(chapter_signatures) != 1:
            raise FusionReviewRecordingError(
                f"{chapter_id} 章节 {cursor}-{end - 1} "
                f"出现 {len(chapter_signatures)} 种画面，边界不可信"
            )
        signature = next(iter(chapter_signatures))
        if previous_signature and signature == previous_signature:
            raise FusionReviewRecordingError(
                f"{chapter_id} 与前一章节没有在精确边界切换画面"
            )
        chapter_records.append(
            {
                "id": chapter_id,
                "state": state,
                "route": route,
                "startFrame": cursor,
                "endFrameInclusive": end - 1,
                "sha256": signature,
                "allFramesMatchChapterState": True,
            }
        )
        previous_signature = signature
        cursor = end
    if cursor != expected_frame_count:
        raise FusionReviewRecordingError(
            f"{media_label} 章节画面签名帧数合计错误"
        )
    if chapter_records[0]["sha256"] != chapter_records[-1]["sha256"]:
        raise FusionReviewRecordingError(
            "首尾关闭章节画面不一致，第900帧没有证明回到关闭态"
        )
    visual_state_count = len(
        {record["sha256"] for record in chapter_records}
    )
    if visual_state_count != len(EXPECTED_CHAPTERS) - 1:
        raise FusionReviewRecordingError(
            "六章节应形成5个独立画面状态，实际为"
            f"{visual_state_count}"
        )
    return {
        "status": "passed",
        "mediaLabel": media_label,
        "frameCount": expected_frame_count,
        "decodedPixelFormat": "rgba",
        "signatureAlgorithm": "sha256",
        "exactChapterBoundariesVerified": True,
        "allFramesMatchDeclaredChapterRanges": True,
        "terminalFrameMatchesClosedFinalRangeSignature": True,
        "firstAndFinalClosedFramesMatch": True,
        "visualStateCount": visual_state_count,
        "chapters": chapter_records,
    }


def _write_frame_visual_signatures(
    *,
    ffmpeg: str,
    video_path: Path,
    output_path: Path,
    expected_frame_count: int,
    media_label: str = "raw",
) -> dict[str, Any]:
    completed = _run_capture(
        [
            ffmpeg,
            "-v",
            "error",
            "-i",
            str(video_path),
            "-map",
            "0:v:0",
            "-pix_fmt",
            "rgba",
            "-hash",
            "sha256",
            "-f",
            "framemd5",
            "-",
        ],
        timeout_seconds=180.0,
    )
    if completed.returncode != 0:
        raise FusionReviewRecordingError(
            f"ffmpeg {media_label} 逐帧画面签名失败 exit="
            f"{completed.returncode}: {completed.stderr.strip()}"
        )
    summary = _validate_frame_visual_signatures(
        completed.stdout,
        expected_frame_count=expected_frame_count,
        media_label=media_label,
    )
    output_path.write_text(completed.stdout, encoding="utf-8")
    return summary


def _psnr_json_value(value: float) -> float | str:
    return "infinite" if math.isinf(value) else round(value, 6)


def _validate_transcode_fidelity(
    text: str,
    *,
    expected_frame_count: int = EXPECTED_FRAME_COUNT,
    minimum_psnr_db: float = MIN_TRANSCODE_PSNR_DB,
) -> dict[str, Any]:
    records: list[float] = []
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        fields: dict[str, str] = {}
        for token in stripped.split():
            if ":" not in token:
                raise FusionReviewRecordingError(
                    f"H.264逐帧保真统计字段错误：{line!r}"
                )
            key, value = token.split(":", 1)
            if key in fields:
                raise FusionReviewRecordingError(
                    f"H.264逐帧保真统计重复字段：{key}"
                )
            fields[key] = value
        try:
            frame_number = int(fields["n"])
            psnr = float(fields["psnr_avg"])
        except (KeyError, TypeError, ValueError) as error:
            raise FusionReviewRecordingError(
                f"H.264逐帧保真统计不可解析：{line!r}"
            ) from error
        expected_number = len(records) + 1
        if frame_number != expected_number:
            raise FusionReviewRecordingError(
                "H.264逐帧保真统计序号不连续："
                f"{frame_number} != {expected_number}"
            )
        if math.isnan(psnr) or psnr < minimum_psnr_db:
            raise FusionReviewRecordingError(
                "H.264第"
                f"{frame_number - 1}帧与同索引原始帧保真度不足："
                f"{psnr} dB < {minimum_psnr_db:.1f} dB"
            )
        records.append(psnr)
    if len(records) != expected_frame_count:
        raise FusionReviewRecordingError(
            "H.264逐帧保真统计数量错误："
            f"{len(records)} != {expected_frame_count}"
        )

    chapters: list[dict[str, Any]] = []
    cursor = 0
    for chapter_id, state, route, frame_count in EXPECTED_CHAPTERS:
        end = cursor + frame_count
        values = records[cursor:end]
        chapter_minimum = min(values)
        chapter_average = (
            math.inf
            if any(math.isinf(value) for value in values)
            else sum(values) / float(len(values))
        )
        chapters.append(
            {
                "id": chapter_id,
                "state": state,
                "route": route,
                "startFrame": cursor,
                "endFrameInclusive": end - 1,
                "minimumPsnrDb": _psnr_json_value(chapter_minimum),
                "averagePsnrDb": _psnr_json_value(chapter_average),
                "allFramesComparedToSameIndexRawFrame": True,
            }
        )
        cursor = end
    overall_minimum = min(records)
    overall_average = (
        math.inf
        if any(math.isinf(value) for value in records)
        else sum(records) / float(len(records))
    )
    return {
        "status": "passed",
        "metric": "PSNR",
        "frameCount": expected_frame_count,
        "minimumRequiredPsnrDb": minimum_psnr_db,
        "minimumObservedPsnrDb": _psnr_json_value(overall_minimum),
        "averageObservedPsnrDb": _psnr_json_value(overall_average),
        "allFramesComparedToSameIndexRawFrame": True,
        "allFramesMeetFidelityThreshold": True,
        "exactTimelineAlignmentRequired": True,
        "terminalFrameMatchesRawClosedFinalAtSameIndex": True,
        "chapters": chapters,
    }


def _write_transcode_fidelity(
    *,
    ffmpeg: str,
    raw_video_path: Path,
    candidate_video_path: Path,
    output_path: Path,
    expected_frame_count: int,
) -> dict[str, Any]:
    completed = _run_capture(
        [
            ffmpeg,
            "-v",
            "error",
            "-i",
            str(raw_video_path),
            "-i",
            str(candidate_video_path),
            "-filter_complex",
            "[0:v:0][1:v:0]psnr=stats_file=-",
            "-f",
            "null",
            "-",
        ],
        timeout_seconds=180.0,
    )
    if completed.returncode != 0:
        raise FusionReviewRecordingError(
            "ffmpeg H.264逐帧保真比较失败 exit="
            f"{completed.returncode}: {completed.stderr.strip()}"
        )
    output_path.write_text(completed.stdout, encoding="utf-8")
    return _validate_transcode_fidelity(
        completed.stdout,
        expected_frame_count=expected_frame_count,
    )


def _validate_sequence_report(
    report: Mapping[str, Any],
    *,
    expected_user_data_root: Path | None = None,
) -> dict[str, Any]:
    errors: list[str] = []
    if report.get("schemaVersion") != 1:
        errors.append("schemaVersion")
    if (
        report.get("reportType")
        != "beastbound.pet_fusion_closed_owner_review_sequence"
    ):
        errors.append("reportType")
    if report.get("result") != "PASS":
        errors.append(f"result={report.get('result')!r}")
    if report.get("viewport") != {
        "width": EXPECTED_WIDTH,
        "height": EXPECTED_HEIGHT,
    }:
        errors.append("viewport")
    if str(report.get("displayServer", "")).lower() != "macos":
        errors.append("displayServer")
    if report.get("renderingDriverRequiredByRecorder") != "metal":
        errors.append("renderingDriverRequiredByRecorder")
    if report.get("window") != {
        "mode": 0,
        "modeName": "windowed",
        "visible": True,
        "width": EXPECTED_WIDTH,
        "height": EXPECTED_HEIGHT,
    }:
        errors.append("window")
    if report.get("captureFps") != EXPECTED_FPS.numerator:
        errors.append("captureFps")
    if report.get("playbackSpeed") != EXPECTED_PLAYBACK_SPEED:
        errors.append("playbackSpeed")
    if report.get("expectedFrameCount") != EXPECTED_FRAME_COUNT:
        errors.append("expectedFrameCount")
    if report.get("postDrawSequenceFrameCount") != (
        EXPECTED_FRAME_COUNT - 1
    ):
        errors.append("postDrawSequenceFrameCount")
    if report.get("movieWriterTerminalFrameCount") != 1:
        errors.append("movieWriterTerminalFrameCount")
    if report.get("renderedSequenceFrameCount") != EXPECTED_FRAME_COUNT:
        errors.append("renderedSequenceFrameCount")
    if not math.isclose(
        float(report.get("expectedDurationSeconds", -1.0)),
        EXPECTED_DURATION_SECONDS,
        rel_tol=0.0,
        abs_tol=1e-9,
    ):
        errors.append("expectedDurationSeconds")
    exact_false_fields = (
        "productionRuntimeEnabled",
        "playerEntryOpened",
        "secondConfirmationExecuted",
        "normalPlayerUserDataUsed",
    )
    for field in exact_false_fields:
        if report.get(field) is not False:
            errors.append(field)
    if report.get("formalPortraitsRequired") is not True:
        errors.append("formalPortraitsRequired")
    if report.get("userDataIsolationVerified") is not True:
        errors.append("userDataIsolationVerified")
    actual_user_data = report.get("actualUserDataDir")
    expected_user_data = report.get("expectedUserDataRoot")
    if (
        not isinstance(actual_user_data, str)
        or not isinstance(expected_user_data, str)
        or not actual_user_data.startswith(expected_user_data + "/")
    ):
        errors.append("actualUserDataDir")
    if expected_user_data_root is not None:
        expected_path = str(expected_user_data_root.resolve(strict=False))
        if expected_user_data != expected_path:
            errors.append("expectedUserDataRoot")
    if report.get("networkRequestCount") != 0:
        errors.append("networkRequestCount")
    if report.get("ownerReviewStatus") != "pending":
        errors.append("ownerReviewStatus")
    if report.get("errors") != []:
        errors.append("errors")

    chapters = report.get("chapters")
    if not isinstance(chapters, list) or len(chapters) != len(
        EXPECTED_CHAPTERS
    ):
        errors.append("chapters")
        chapters = []
    cursor = 0
    for index, expected in enumerate(EXPECTED_CHAPTERS):
        if index >= len(chapters) or not isinstance(chapters[index], dict):
            continue
        chapter = chapters[index]
        chapter_id, state, route, frame_count = expected
        end = cursor + frame_count
        expected_values = {
            "id": chapter_id,
            "state": state,
            "route": route,
            "startFrame": cursor,
            "endFrameExclusive": end,
            "frameCount": frame_count,
            "postDrawFrameCount": (
                frame_count - 1
                if chapter_id == "closed_final"
                else frame_count
            ),
            "movieWriterTerminalFrameCount": (
                1 if chapter_id == "closed_final" else 0
            ),
        }
        for key, expected_value in expected_values.items():
            if chapter.get(key) != expected_value:
                errors.append(f"chapters[{index}].{key}")
        expected_times = {
            "startTimeSeconds": cursor / 30.0,
            "centerTimeSeconds": (cursor + frame_count // 2) / 30.0,
            "endTimeSeconds": end / 30.0,
        }
        for key, expected_value in expected_times.items():
            try:
                actual = float(chapter.get(key, -1.0))
            except (TypeError, ValueError):
                actual = -1.0
            if not math.isclose(
                actual,
                expected_value,
                rel_tol=0.0,
                abs_tol=1e-9,
            ):
                errors.append(f"chapters[{index}].{key}")
        if chapter.get("errors") != []:
            errors.append(f"chapters[{index}].errors")
        snapshot = chapter.get("snapshot")
        if not isinstance(snapshot, dict):
            errors.append(f"chapters[{index}].snapshot")
            cursor = end
            continue
        if snapshot.get("networkRequestCount") != 0:
            errors.append(f"chapters[{index}].networkRequestCount")
        if snapshot.get("secondConfirmationCount") != 0:
            errors.append(f"chapters[{index}].secondConfirmationCount")
        if state == "closed":
            if snapshot.get("closed") is not True:
                errors.append(f"chapters[{index}].closed")
            if snapshot.get("confirmDisabled") is not True:
                errors.append(f"chapters[{index}].confirmDisabled")
            if snapshot.get("targetName") != "":
                errors.append(f"chapters[{index}].targetName")
            if snapshot.get("targetFormId") != "":
                errors.append(f"chapters[{index}].targetFormId")
            if snapshot.get("targetPortraitResourcePath") != "":
                errors.append(
                    f"chapters[{index}].targetPortraitResourcePath"
                )
        else:
            if snapshot.get("closed") is not False:
                errors.append(f"chapters[{index}].closed")
            if snapshot.get("quoteValid") is not True:
                errors.append(f"chapters[{index}].quoteValid")
            if snapshot.get("targetPortraitStatus") != "formal":
                errors.append(f"chapters[{index}].targetPortraitStatus")
            target = EXPECTED_ROUTE_TARGETS[route]
            expected_form_id = str(target["formId"])
            expected_portrait_path = (
                "res://assets/pets/"
                f"{expected_form_id}/portrait/default.png"
            )
            if snapshot.get("targetName") != target["name"]:
                errors.append(f"chapters[{index}].targetName")
            if snapshot.get("targetFormId") != expected_form_id:
                errors.append(f"chapters[{index}].targetFormId")
            if (
                snapshot.get("targetPortraitResourcePath")
                != expected_portrait_path
            ):
                errors.append(
                    f"chapters[{index}].targetPortraitResourcePath"
                )
            if snapshot.get("candidatePlaceholderCount") != 0:
                errors.append(
                    f"chapters[{index}].candidatePlaceholderCount"
                )
            expected_armed = state == "armed"
            if snapshot.get("confirmationArmed") is not expected_armed:
                errors.append(f"chapters[{index}].confirmationArmed")
            if snapshot.get("confirmDisabled") is not False:
                errors.append(f"chapters[{index}].confirmDisabled")
        cursor = end
    if cursor != EXPECTED_FRAME_COUNT:
        errors.append("chapterFrameSum")
    if errors:
        raise FusionReviewRecordingError(
            "Godot 融合演示序列报告未通过：" + "；".join(errors)
        )
    return dict(report)


def _validate_godot_capture_log(path: Path) -> dict[str, str]:
    text = path.read_text(encoding="utf-8", errors="replace")
    metal = METAL_LOG_RE.search(text)
    movie = MOVIE_LOG_RE.search(text)
    if metal is None:
        raise FusionReviewRecordingError(
            "Godot 日志没有证明真实 Metal 渲染"
        )
    if movie is None:
        raise FusionReviewRecordingError(
            "Godot 日志没有证明 1280x720 @ 30 FPS MovieWriter"
        )
    if "headless" in text.lower():
        raise FusionReviewRecordingError("正式融合录像不得使用 headless")
    return {
        "displayDriver": "macos",
        "renderingDriver": "metal",
        "metalEvidence": metal.group(0),
        "movieWriterEvidence": movie.group(0),
    }


def _png_dimensions(path: Path) -> tuple[int, int]:
    try:
        header = path.read_bytes()[:24]
    except OSError as error:
        raise FusionReviewRecordingError(
            f"无法读取 PNG：{path}: {error}"
        ) from error
    if (
        len(header) < 24
        or header[:8] != PNG_SIGNATURE
        or header[12:16] != b"IHDR"
    ):
        raise FusionReviewRecordingError(
            f"不是有效 PNG 头：{_repo_relative(path)}"
        )
    return struct.unpack(">II", header[16:24])


def _chapter_sample_times(
    sequence_report: Mapping[str, Any],
) -> tuple[tuple[str, float], ...]:
    chapters = sequence_report.get("chapters")
    if not isinstance(chapters, list):
        raise FusionReviewRecordingError("序列报告缺少章节")
    result: list[tuple[str, float]] = []
    for chapter in chapters:
        if not isinstance(chapter, dict):
            raise FusionReviewRecordingError("序列章节不是对象")
        chapter_id = str(chapter.get("id", ""))
        try:
            sample_time = float(chapter.get("centerTimeSeconds"))
        except (TypeError, ValueError) as error:
            raise FusionReviewRecordingError(
                f"{chapter_id} 章节中心时间不可用"
            ) from error
        if not chapter_id or not math.isfinite(sample_time):
            raise FusionReviewRecordingError("章节取样信息不完整")
        if sample_time < 0 or sample_time >= EXPECTED_DURATION_SECONDS:
            raise FusionReviewRecordingError(
                f"{chapter_id} 章节中心时间越界"
            )
        result.append((chapter_id, sample_time))
    return tuple(result)


def _extract_boundary_frames(
    *,
    ffmpeg: str,
    video_path: Path,
    output_dir: Path,
    timeout_seconds: float,
    require_exact_pixel_stasis: bool = True,
) -> dict[str, Any]:
    output_dir.mkdir(parents=False, exist_ok=False)
    samples: list[dict[str, Any]] = []
    cursor = 0
    for chapter_id, state, route, frame_count in EXPECTED_CHAPTERS:
        end = cursor + frame_count
        samples.extend(
            (
                {
                    "chapterId": chapter_id,
                    "state": state,
                    "route": route,
                    "position": "start",
                    "frameIndex": cursor,
                },
                {
                    "chapterId": chapter_id,
                    "state": state,
                    "route": route,
                    "position": "end",
                    "frameIndex": end - 1,
                },
            )
        )
        cursor = end
    select_filter = "select=" + "+".join(
        f"eq(n\\,{int(sample['frameIndex'])})" for sample in samples
    )
    output_pattern = output_dir / "frame-%02d.png"
    log_path = output_dir / "extract.log"
    _run_logged(
        [
            ffmpeg,
            "-y",
            "-v",
            "warning",
            "-i",
            str(video_path),
            "-map",
            "0:v:0",
            "-vf",
            select_filter,
            "-fps_mode",
            "passthrough",
            "-frames:v",
            str(len(samples)),
            str(output_pattern),
        ],
        log_path=log_path,
        timeout_seconds=timeout_seconds,
    )
    records: list[dict[str, Any]] = []
    for index, sample in enumerate(samples, start=1):
        path = output_dir / f"frame-{index:02d}.png"
        width, height = _png_dimensions(path)
        if (width, height) != (EXPECTED_WIDTH, EXPECTED_HEIGHT):
            raise FusionReviewRecordingError(
                "章节边界截图尺寸错误："
                f"{sample['chapterId']} {sample['position']} "
                f"{width}x{height}"
            )
        records.append(
            {
                **_artifact_record(path),
                **sample,
                "width": width,
                "height": height,
            }
        )
    for chapter_index in range(len(EXPECTED_CHAPTERS)):
        start = records[chapter_index * 2]
        end = records[chapter_index * 2 + 1]
        if (
            require_exact_pixel_stasis
            and start["sha256"] != end["sha256"]
        ):
            raise FusionReviewRecordingError(
                f"{start['chapterId']} 首尾边界截图不一致"
            )
        if chapter_index > 0:
            previous_end = records[chapter_index * 2 - 1]
            if previous_end["sha256"] == start["sha256"]:
                raise FusionReviewRecordingError(
                    f"{start['chapterId']} 边界截图没有发生章节切换"
                )
    if (
        require_exact_pixel_stasis
        and records[0]["sha256"] != records[-1]["sha256"]
    ):
        raise FusionReviewRecordingError(
            "第0帧与第899帧关闭画面不一致"
        )
    result = {
        "status": "passed",
        "exactFrameIndices": [
            int(record["frameIndex"]) for record in records
        ],
        "terminalFrameIndex": EXPECTED_FRAME_COUNT - 1,
        "withinChapterExactPixelStasisRequired": (
            require_exact_pixel_stasis
        ),
        "adjacentChapterBoundaryPixelChangeVerified": True,
        "records": records,
        "log": _artifact_record(log_path),
    }
    if require_exact_pixel_stasis:
        result.update(
            {
                "terminalFrameMatchesClosedFinalRangeScreenshot": True,
                "firstAndFinalClosedFramesMatch": True,
            }
        )
    else:
        result.update(
            {
                "lossyTranscodeSameIndexFidelityRequired": True,
                "terminalFrameStateRequiresTranscodeFidelity": True,
            }
        )
    return result


def _extract_chapter_frames(
    *,
    ffmpeg: str,
    video_path: Path,
    screenshots_dir: Path,
    sample_times: Sequence[tuple[str, float]],
    timeout_seconds: float,
) -> list[dict[str, Any]]:
    screenshots_dir.mkdir(parents=False, exist_ok=False)
    records: list[dict[str, Any]] = []
    hashes: set[str] = set()
    for index, (chapter_id, sample_time) in enumerate(
        sample_times,
        start=1,
    ):
        output_path = screenshots_dir / f"{index:02d}-{chapter_id}.png"
        log_path = screenshots_dir / f"{index:02d}-{chapter_id}.log"
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
                str(output_path),
            ],
            log_path=log_path,
            timeout_seconds=timeout_seconds,
        )
        width, height = _png_dimensions(output_path)
        if (width, height) != (EXPECTED_WIDTH, EXPECTED_HEIGHT):
            raise FusionReviewRecordingError(
                f"{chapter_id} 取样帧尺寸错误：{width}x{height}"
            )
        frame_hash = _sha256(output_path)
        hashes.add(frame_hash)
        records.append(
            {
                **_artifact_record(output_path),
                "chapterId": chapter_id,
                "sampleTimeSeconds": sample_time,
                "width": width,
                "height": height,
                "log": _artifact_record(log_path),
            }
        )
    # The first/final closed chapters may be identical.  The four route states
    # must still yield enough independently decoded visual states.
    if len(hashes) < 4:
        raise FusionReviewRecordingError(
            f"章节取样只有 {len(hashes)} 个独立画面，"
            "自动演示可能未推进"
        )
    return records


def _build_contact_sheet(
    *,
    ffmpeg: str,
    screenshots: Sequence[Mapping[str, Any]],
    output_path: Path,
    timeout_seconds: float,
) -> dict[str, Any]:
    if len(screenshots) != len(EXPECTED_CHAPTERS):
        raise FusionReviewRecordingError("联系表章节数量错误")
    input_paths = [REPO_ROOT / str(item["path"]) for item in screenshots]
    command = [ffmpeg, "-y", "-v", "warning"]
    for path in input_paths:
        command.extend(["-i", str(path)])
    filters: list[str] = []
    labels: list[str] = []
    for index in range(len(input_paths)):
        label = f"v{index}"
        filters.append(
            f"[{index}:v]scale=320:180:flags=lanczos[{label}]"
        )
        labels.append(f"[{label}]")
    filters.append(
        "".join(labels)
        + f"xstack=inputs={len(labels)}:"
        "layout=0_0|320_0|640_0|0_180|320_180|640_180[out]"
    )
    command.extend(
        [
            "-filter_complex",
            ";".join(filters),
            "-map",
            "[out]",
            "-frames:v",
            "1",
            str(output_path),
        ]
    )
    log_path = output_path.with_suffix(".log")
    _run_logged(
        command,
        log_path=log_path,
        timeout_seconds=timeout_seconds,
    )
    width, height = _png_dimensions(output_path)
    if (width, height) != (960, 360):
        raise FusionReviewRecordingError(
            f"联系表尺寸错误：{width}x{height}"
        )
    return {
        **_artifact_record(output_path),
        "width": width,
        "height": height,
        "columns": 3,
        "rows": 2,
        "chapterCount": len(screenshots),
        "log": _artifact_record(log_path),
    }


def _write_sha256_manifest(
    run_dir: Path,
    paths: Sequence[Path],
    *,
    aliases: Mapping[Path, Path] | None = None,
) -> Path:
    manifest_path = run_dir / "SHA256SUMS"
    alias_map = {
        source.resolve(): destination.resolve(strict=False)
        for source, destination in (aliases or {}).items()
    }
    actual_paths = {path.resolve() for path in paths}
    entries = sorted(
        (
            (
                actual_path,
                alias_map.get(actual_path, actual_path),
            )
            for actual_path in actual_paths
        ),
        key=lambda value: value[1].as_posix(),
    )
    lines: list[str] = []
    logical_paths: set[Path] = set()
    for actual_path, logical_path in entries:
        _secure_existing_file(actual_path, label="SHA256 清单目标")
        if logical_path in logical_paths:
            raise FusionReviewRecordingError(
                f"SHA256 清单逻辑路径重复：{logical_path}"
            )
        logical_paths.add(logical_path)
        try:
            relative = logical_path.relative_to(
                run_dir.resolve()
            ).as_posix()
        except ValueError as error:
            raise FusionReviewRecordingError(
                "SHA256 清单逻辑目标越出本次证据目录："
                f"{logical_path}"
            ) from error
        lines.append(f"{_sha256(actual_path)}  {relative}")
    manifest_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return manifest_path


def _isolated_environment(temporary_dir: Path) -> dict[str, str]:
    environment = dict(os.environ)
    isolated_home = temporary_dir / "isolated-home"
    isolated_home.mkdir(parents=False, exist_ok=False)
    environment["TMPDIR"] = str(temporary_dir)
    # macOS Godot runtime derives user:// from HOME.  Override it only in the
    # child environment; os.environ and the user's actual home remain intact.
    environment["HOME"] = str(isolated_home)
    environment["BEASTBOUND_OWNER_REVIEW_CAPTURE"] = "1"
    environment["BEASTBOUND_FUSION_CLOSED_REVIEW"] = "1"
    return environment


def _user_data_inventory(user_data_dir: Path) -> dict[str, Any]:
    files = sorted(
        (path for path in user_data_dir.rglob("*") if path.is_file()),
        key=lambda value: value.as_posix(),
    )
    return {
        "path": _repo_relative(user_data_dir),
        "fileCount": len(files),
        "totalBytes": sum(path.stat().st_size for path in files),
        "paths": [
            path.relative_to(user_data_dir).as_posix() for path in files
        ],
        "isFreshPerRun": True,
        "normalPlayerSavePathUsed": False,
    }


def _record_into(
    *,
    args: argparse.Namespace,
    run_id: str,
    run_dir: Path,
    preflight_release_report: dict[str, Any],
    preflight_portraits: list[dict[str, Any]],
    executables: Mapping[str, str],
) -> Path:
    timeout_seconds = float(args.timeout_seconds)
    preserved_user_data_dir = run_dir / "user-data"
    temporary_dir = run_dir / "tmp"
    temporary_dir.mkdir(parents=False, exist_ok=False)
    environment = _isolated_environment(temporary_dir)
    isolated_home_dir = (
        temporary_dir / "isolated-home"
    ).resolve(strict=True)
    clone_log = run_dir / "godot-self-contained-clone.log"
    isolated_godot, clone_root = _prepare_self_contained_godot(
        original_godot=executables["godot"],
        temporary_dir=temporary_dir,
        clone_log=clone_log,
        timeout_seconds=timeout_seconds,
    )

    release_before_path = run_dir / "release-verifier-before.json"
    _write_json(release_before_path, preflight_release_report)
    portrait_before_path = run_dir / "portrait-preflight.json"
    _write_json(
        portrait_before_path,
        {
            "status": "PASS",
            "ownerApprovalGranted": False,
            "portraits": preflight_portraits,
        },
    )

    raw_avi_path = run_dir / "pet-fusion-closed-review-raw.avi"
    candidate_path = run_dir / ".pet-fusion-closed-review-candidate.mp4"
    final_video_path = run_dir / "pet-fusion-closed-review-1x.mp4"
    sequence_report_path = run_dir / "godot-sequence-report.json"
    godot_log = run_dir / "godot-recording.log"
    godot_command = _build_godot_command(
        godot=isolated_godot,
        expected_user_data_root=isolated_home_dir,
        avi_path=raw_avi_path,
        sequence_report=sequence_report_path,
    )
    runtime_monitor_path = run_dir / "godot-runtime-monitor.json"
    runtime_monitor = _run_godot_logged_monitored(
        godot_command,
        log_path=godot_log,
        monitor_path=runtime_monitor_path,
        timeout_seconds=timeout_seconds,
        environment=environment,
    )
    raw_movie = _artifact_record(raw_avi_path)
    sequence_report = _validate_sequence_report(
        _read_json(sequence_report_path, label="Godot 融合演示序列报告"),
        expected_user_data_root=isolated_home_dir,
    )
    isolated_user_data = _preserve_isolated_user_data(
        actual_user_data_dir=Path(sequence_report["actualUserDataDir"]),
        allowed_root=isolated_home_dir,
        destination=preserved_user_data_dir,
    )
    clone_removed = _remove_generated_godot_clone(clone_root)
    if not clone_removed:
        raise FusionReviewRecordingError(
            "self-contained Godot clone 清理未完成"
        )
    rendering_evidence = _validate_godot_capture_log(godot_log)
    raw_timeline_path = run_dir / "raw-frame-timeline.json"
    raw_timeline = _write_frame_timeline(
        ffprobe=executables["ffprobe"],
        video_path=raw_avi_path,
        output_path=raw_timeline_path,
        expected_frame_count=int(sequence_report["expectedFrameCount"]),
    )
    raw_visual_signatures_path = (
        run_dir / "raw-frame-visual-signatures.sha256"
    )
    raw_visual_signatures = _write_frame_visual_signatures(
        ffmpeg=executables["ffmpeg"],
        video_path=raw_avi_path,
        output_path=raw_visual_signatures_path,
        expected_frame_count=int(sequence_report["expectedFrameCount"]),
    )
    boundary_frames = _extract_boundary_frames(
        ffmpeg=executables["ffmpeg"],
        video_path=raw_avi_path,
        output_dir=run_dir / "boundary-frames",
        timeout_seconds=timeout_seconds,
    )
    raw_decode_log = run_dir / "raw-full-video-decode.log"
    _run_logged(
        [
            executables["ffmpeg"],
            "-v",
            "error",
            "-xerror",
            "-i",
            str(raw_avi_path),
            "-map",
            "0:v:0",
            "-f",
            "null",
            "-",
        ],
        log_path=raw_decode_log,
        timeout_seconds=timeout_seconds,
        environment=environment,
    )

    transcode_command = _build_transcode_command(
        ffmpeg=executables["ffmpeg"],
        avi_path=raw_avi_path,
        candidate_path=candidate_path,
    )
    transcode_log = run_dir / "ffmpeg-transcode.log"
    _run_logged(
        transcode_command,
        log_path=transcode_log,
        timeout_seconds=timeout_seconds,
        environment=environment,
    )
    probe_path = run_dir / "ffprobe.json"
    probe = _write_probe(
        ffprobe=executables["ffprobe"],
        video_path=candidate_path,
        output_path=probe_path,
    )
    media = _validate_probe(
        probe,
        expected_frame_count=int(sequence_report["expectedFrameCount"]),
        expected_duration_seconds=float(
            sequence_report["expectedDurationSeconds"]
        ),
    )
    final_timeline_path = run_dir / "final-frame-timeline.json"
    final_timeline = _write_frame_timeline(
        ffprobe=executables["ffprobe"],
        video_path=candidate_path,
        output_path=final_timeline_path,
        expected_frame_count=int(sequence_report["expectedFrameCount"]),
    )
    final_fidelity_path = run_dir / "final-frame-fidelity-psnr.txt"
    final_fidelity = _write_transcode_fidelity(
        ffmpeg=executables["ffmpeg"],
        raw_video_path=raw_avi_path,
        candidate_video_path=candidate_path,
        output_path=final_fidelity_path,
        expected_frame_count=int(sequence_report["expectedFrameCount"]),
    )
    final_boundary_frames = _extract_boundary_frames(
        ffmpeg=executables["ffmpeg"],
        video_path=candidate_path,
        output_dir=run_dir / "final-boundary-frames",
        timeout_seconds=timeout_seconds,
        require_exact_pixel_stasis=False,
    )

    decode_log = run_dir / "full-video-decode.log"
    _run_logged(
        [
            executables["ffmpeg"],
            "-v",
            "error",
            "-xerror",
            "-i",
            str(candidate_path),
            "-map",
            "0:v:0",
            "-f",
            "null",
            "-",
        ],
        log_path=decode_log,
        timeout_seconds=timeout_seconds,
        environment=environment,
    )

    screenshots = _extract_chapter_frames(
        ffmpeg=executables["ffmpeg"],
        video_path=candidate_path,
        screenshots_dir=run_dir / "screenshots",
        sample_times=_chapter_sample_times(sequence_report),
        timeout_seconds=timeout_seconds,
    )
    contact = _build_contact_sheet(
        ffmpeg=executables["ffmpeg"],
        screenshots=screenshots,
        output_path=run_dir / "contact-sheet.png",
        timeout_seconds=timeout_seconds,
    )

    # Re-run all release/portrait gates immediately before promoting the
    # candidate filename.  A concurrent asset/catalog change cannot silently
    # inherit the earlier PASS.
    release_after = _run_release_verifier(
        python=executables["python"],
        timeout_seconds=timeout_seconds,
    )
    portraits_after = _portrait_readiness()
    if _json_sha256(release_after) != _json_sha256(
        preflight_release_report
    ):
        raise FusionReviewRecordingError(
            "录像期间融合关闭发布验证报告发生变化"
        )
    if _json_sha256(portraits_after) != _json_sha256(
        preflight_portraits
    ):
        raise FusionReviewRecordingError(
            "录像期间正式 portrait 证据发生变化"
        )
    release_after_path = run_dir / "release-verifier-after.json"
    _write_json(release_after_path, release_after)

    video = {
        **_artifact_record(candidate_path),
        "path": _repo_relative(final_video_path),
        **media,
        "playbackSpeed": EXPECTED_PLAYBACK_SPEED,
        "speedTransformApplied": False,
        "transcodeTimingChanged": False,
        "fullDecodeStatus": "passed",
    }

    hash_manifest_path = _write_sha256_manifest(
        run_dir,
        [
            clone_log,
            raw_avi_path,
            candidate_path,
            sequence_report_path,
            runtime_monitor_path,
            release_before_path,
            release_after_path,
            portrait_before_path,
            probe_path,
            raw_timeline_path,
            raw_visual_signatures_path,
            final_timeline_path,
            final_fidelity_path,
            run_dir / "contact-sheet.png",
            raw_decode_log,
            decode_log,
            godot_log,
            transcode_log,
            REPO_ROOT / str(boundary_frames["log"]["path"]),
            REPO_ROOT / str(final_boundary_frames["log"]["path"]),
            REPO_ROOT / str(contact["log"]["path"]),
            *(
                REPO_ROOT / str(record["path"])
                for record in boundary_frames["records"]
            ),
            *(
                REPO_ROOT / str(record["path"])
                for record in final_boundary_frames["records"]
            ),
            *(
                REPO_ROOT / str(record["path"])
                for record in screenshots
            ),
            *(
                REPO_ROOT / str(record["log"]["path"])
                for record in screenshots
            ),
        ],
        aliases={candidate_path: final_video_path},
    )
    pass_marker_path = run_dir / "PASS.json"
    summary = {
        "schemaVersion": REPORT_SCHEMA_VERSION,
        "reportType": REPORT_TYPE,
        "status": "passed",
        "runId": run_id,
        "generatedAtUtc": _utc_now().isoformat().replace("+00:00", "Z"),
        "sequenceScript": SEQUENCE_SCRIPT,
        "captureContract": {
            "normalPlayerEntryUsed": False,
            "standaloneQaSequence": True,
            "visibleMacosWindow": True,
            "renderingDriver": "metal",
            "width": EXPECTED_WIDTH,
            "height": EXPECTED_HEIGHT,
            "fps": float(EXPECTED_FPS),
            "playbackSpeed": EXPECTED_PLAYBACK_SPEED,
            "expectedFrameCount": EXPECTED_FRAME_COUNT,
            "expectedDurationSeconds": EXPECTED_DURATION_SECONDS,
            "movieWriterFixedFps": True,
            "transcodeChangesTiming": False,
            "timingFilterApplied": False,
            "audioPresent": False,
            "audioPolicy": "omitted_silent",
        },
        "closedState": {
            "runtimeEnabled": False,
            "playerEntryOpened": False,
            "networkRequestCount": 0,
            "secondConfirmationExecuted": False,
            "internetSocketObserved": bool(
                runtime_monitor["internetSocketObserved"]
            ),
            "backendProcessObserved": bool(
                runtime_monitor["backendProcessObserved"]
            ),
            "mysqlUnixSocketObserved": bool(
                runtime_monitor["mysqlUnixSocketObserved"]
            ),
            "kernelNetworkDenyPolicyApplied": bool(
                runtime_monitor["kernelNetworkDenyPolicyApplied"]
            ),
        },
        "isolation": {
            "userData": isolated_user_data,
            "captureActualUserDataPath": sequence_report[
                "actualUserDataDir"
            ],
            "captureExpectedUserDataRoot": sequence_report[
                "expectedUserDataRoot"
            ],
            "temporaryDirectory": _repo_relative(temporary_dir),
            "processLocalIsolatedHome": _repo_relative(
                isolated_home_dir
            ),
            "parentProcessHomeMutated": False,
            "normalPlayerUserDataUsed": False,
            "normalPlayerSavePathUsed": False,
            "selfContainedGodotCloneUsed": True,
            "selfContainedGodotCloneRemoved": clone_removed,
            "cloneLog": _artifact_record(clone_log),
        },
        "tools": {
            "godot": _capture_version(
                executables["godot"],
                ["--version"],
            ),
            "ffmpeg": _capture_version(
                executables["ffmpeg"],
                ["-version"],
            ),
            "ffprobe": _capture_version(
                executables["ffprobe"],
                ["-version"],
            ),
            "python": sys.version.splitlines()[0],
        },
        "command": _redacted_command(godot_command),
        "transcodeCommand": _redacted_command(transcode_command),
        "renderingEvidence": rendering_evidence,
        "runtimeMonitor": {
            **_artifact_record(runtime_monitor_path),
            "visibleWindowProcessVerified": bool(
                runtime_monitor["visibleWindowProcessVerified"]
            ),
            "windowedNonMinimizedModeReportedByGodot": (
                sequence_report["window"]["modeName"] == "windowed"
                and sequence_report["window"]["visible"] is True
            ),
            "visibleNonMinimizedWindowVerified": (
                bool(
                    runtime_monitor[
                        "visibleNonMinimizedWindowVerified"
                    ]
                )
                and sequence_report["window"]["modeName"] == "windowed"
                and sequence_report["window"]["visible"] is True
            ),
            "visibleWindowContinuityVerified": bool(
                runtime_monitor["visibleWindowContinuityVerified"]
            ),
            "visibleWindowQualifiedSampleCount": int(
                runtime_monitor["visibleWindowQualifiedSampleCount"]
            ),
            "windowObserverErrorSampleCount": int(
                runtime_monitor["windowObserverErrorSampleCount"]
            ),
            "primaryVisibleWindowBounds": runtime_monitor[
                "visibleWindow"
            ]["primaryVisibleWindowBounds"],
            "mainScreenBounds": runtime_monitor["visibleWindow"][
                "mainScreenBounds"
            ],
            "primaryVisibleIntersection": runtime_monitor[
                "visibleWindow"
            ]["primaryVisibleIntersection"],
            "primaryVisibleFraction": runtime_monitor[
                "visibleWindow"
            ]["primaryVisibleFraction"],
            "socketSampleCount": int(
                runtime_monitor["socketSampleCount"]
            ),
            "allObservedDescendantPidsSocketSampled": True,
            "kernelNetworkDenyPolicyApplied": bool(
                runtime_monitor["kernelNetworkDenyPolicyApplied"]
            ),
            "networkSandbox": runtime_monitor["networkSandbox"],
            "socketSamplingClaimLimit": (
                "lsof is interval corroboration and cannot by itself exclude "
                "between-sample short connections; the launched Godot process "
                "and descendants separately inherit the macOS deny network* "
                "sandbox policy"
            ),
            "internetSocketObserved": bool(
                runtime_monitor["internetSocketObserved"]
            ),
            "backendProcessObserved": bool(
                runtime_monitor["backendProcessObserved"]
            ),
            "mysqlUnixSocketObserved": bool(
                runtime_monitor["mysqlUnixSocketObserved"]
            ),
        },
        "releaseVerifier": {
            "status": "PASS",
            "before": _artifact_record(release_before_path),
            "after": _artifact_record(release_after_path),
            "stableCanonicalSha256": _json_sha256(release_after),
        },
        "portraitPreflight": _artifact_record(portrait_before_path),
        "rawMovie": raw_movie,
        "rawFrameTimeline": {
            **_artifact_record(raw_timeline_path),
            **raw_timeline,
        },
        "rawFrameVisualSignatures": {
            **_artifact_record(raw_visual_signatures_path),
            **raw_visual_signatures,
        },
        "boundaryFrames": boundary_frames,
        "sequenceReport": _artifact_record(sequence_report_path),
        "video": video,
        "probe": _artifact_record(probe_path),
        "finalFrameTimeline": {
            **_artifact_record(final_timeline_path),
            **final_timeline,
        },
        "finalTranscodeFidelity": {
            **_artifact_record(final_fidelity_path),
            **final_fidelity,
        },
        "finalBoundaryFrames": final_boundary_frames,
        "fullDecode": {
            "status": "passed",
            "rawVideoStreamDecoded": True,
            "videoStreamDecoded": True,
            "audioStreamPresent": False,
            "rawLog": _artifact_record(raw_decode_log),
            "log": _artifact_record(decode_log),
        },
        "chapterScreenshots": screenshots,
        "contactSheet": contact,
        "sha256Manifest": _artifact_record(hash_manifest_path),
        "publication": {
            "requiresPassMarker": True,
            "passMarkerPath": _repo_relative(pass_marker_path),
            "candidateVideoHiddenUntilFinalPromotion": True,
            "allFallibleValidationCompletedBeforePromotion": True,
        },
        "logs": {
            "godotSelfContainedClone": _artifact_record(clone_log),
            "godot": _artifact_record(godot_log),
            "transcode": _artifact_record(transcode_log),
        },
        "ownerReviewStatus": "pending",
        "portraitOwnerReviewStatus": "owner_review_pending",
        "claimLimit": (
            "closed-state engineering evidence only; this recording does not "
            "approve portrait art or open fusion runtime/player entry"
        ),
    }
    summary_path = run_dir / "summary.json"
    _write_json(summary_path, summary)
    # Publication is a two-file transaction guarded by PASS.json.  The final
    # video name is assigned only after every validation, version probe,
    # manifest, and summary write succeeded.  Consumers must require PASS.json;
    # an interruption between rename and marker creation is therefore invalid.
    candidate_path.replace(final_video_path)
    _write_json(
        pass_marker_path,
        {
            "schemaVersion": 1,
            "status": "PASS",
            "runId": run_id,
            "videoPath": _repo_relative(final_video_path),
            "videoSha256": video["sha256"],
            "summaryPath": _repo_relative(summary_path),
            "summarySha256": _sha256(summary_path),
            "sha256ManifestPath": _repo_relative(hash_manifest_path),
            "sha256ManifestSha256": _sha256(hash_manifest_path),
        },
    )
    try:
        print(
            json.dumps(
                {
                    "status": "passed",
                    "runId": run_id,
                    "video": video["path"],
                    "contactSheet": contact["path"],
                    "summary": _repo_relative(summary_path),
                    "passMarker": _repo_relative(pass_marker_path),
                    "ownerReviewStatus": "pending",
                },
                ensure_ascii=False,
            )
        )
    except BrokenPipeError:
        pass
    return summary_path


def _cleanup_failed_publication(run_dir: Path) -> dict[str, Any]:
    final_path = run_dir / "pet-fusion-closed-review-1x.mp4"
    marker_path = run_dir / "PASS.json"
    marker_temporary_path = run_dir / ".PASS.json.tmp"
    quarantined_path = run_dir / ".failed-pet-fusion-review.mp4"
    cleanup_errors: list[str] = []
    marker_removed = False
    video_quarantined = False

    for path in (marker_path, marker_temporary_path):
        if not path.exists() and not path.is_symlink():
            continue
        try:
            path.unlink()
            if path == marker_path:
                marker_removed = True
        except OSError as error:
            cleanup_errors.append(f"{path.name}: {error}")

    if final_path.exists() or final_path.is_symlink():
        try:
            mode = final_path.lstat().st_mode
            if stat.S_ISLNK(mode) or not stat.S_ISREG(mode):
                cleanup_errors.append(
                    "PASS 文件名不是普通视频文件，拒绝移动"
                )
            elif quarantined_path.exists() or quarantined_path.is_symlink():
                cleanup_errors.append("失败视频隔离目标已存在")
            else:
                final_path.replace(quarantined_path)
                video_quarantined = True
        except OSError as error:
            cleanup_errors.append(f"视频隔离失败: {error}")

    pass_named_video_present = (
        final_path.exists() or final_path.is_symlink()
    )
    pass_marker_present = marker_path.exists() or marker_path.is_symlink()
    return {
        "status": "passed" if not cleanup_errors else "incomplete",
        "passMarkerRemoved": marker_removed,
        "videoQuarantined": video_quarantined,
        "quarantinedVideoPath": (
            _repo_relative(quarantined_path)
            if quarantined_path.exists()
            else None
        ),
        "passNamedVideoPresent": pass_named_video_present,
        "passMarkerPresent": pass_marker_present,
        "validPublishedPassArtifactPresent": (
            pass_named_video_present and pass_marker_present
        ),
        "errors": cleanup_errors,
    }


def _write_failure_summary(
    run_dir: Path,
    *,
    run_id: str,
    error: BaseException,
    clone_cleanup_succeeded: bool | None = None,
    publication_cleanup: Mapping[str, Any] | None = None,
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
                "validPublishedPassArtifactPresent": bool(
                    (publication_cleanup or {}).get(
                        "validPublishedPassArtifactPresent",
                        False,
                    )
                ),
                "evidenceDirectoryPreserved": True,
                "selfContainedGodotCloneCleanupSucceeded": (
                    clone_cleanup_succeeded
                ),
                "publicationCleanup": dict(
                    publication_cleanup or {}
                ),
            },
        )
    except OSError:
        pass


def _preflight(args: argparse.Namespace) -> tuple[
    dict[str, str],
    dict[str, Any],
    list[dict[str, Any]],
]:
    timeout_seconds = float(args.timeout_seconds)
    if not math.isfinite(timeout_seconds) or timeout_seconds <= 0:
        raise FusionReviewRecordingError("--timeout-seconds 必须大于 0")
    if Path.cwd().resolve() != REPO_ROOT:
        raise FusionReviewRecordingError(
            f"必须从仓库根执行：cd {REPO_ROOT}"
        )
    _secure_existing_file(SEQUENCE_SOURCE, label="Godot 融合录像序列脚本")
    _secure_existing_file(
        Path(NETWORK_SANDBOX_EXECUTABLE),
        label="macOS 网络拒绝沙箱",
    )
    executables = {
        "godot": _require_executable(args.godot, label="Godot"),
        "ffmpeg": _require_executable(args.ffmpeg, label="ffmpeg"),
        "ffprobe": _require_executable(args.ffprobe, label="ffprobe"),
        "python": _require_executable(args.python, label="Python"),
    }
    release_report = _run_release_verifier(
        python=executables["python"],
        timeout_seconds=timeout_seconds,
    )
    portraits = _portrait_readiness()
    return executables, release_report, portraits


def _record(args: argparse.Namespace) -> Path:
    # Run every fail-closed gate before creating a candidate video or even a
    # run directory.  Missing formal portraits leave no misleading PASS path.
    executables, release_report, portraits = _preflight(args)
    run_id = args.run_id or _new_run_id()
    if SAFE_RUN_ID.fullmatch(run_id) is None:
        raise FusionReviewRecordingError(f"不安全的 runId：{run_id!r}")
    output_root = _resolve_output_root(args.output_root)
    output_root.mkdir(parents=True, exist_ok=True)
    run_dir = output_root / run_id
    run_dir.mkdir(parents=False, exist_ok=False)
    try:
        return _record_into(
            args=args,
            run_id=run_id,
            run_dir=run_dir,
            preflight_release_report=release_report,
            preflight_portraits=portraits,
            executables=executables,
        )
    except BaseException as error:
        clone_cleanup_succeeded: bool | None = None
        clone_root = (
            run_dir
            / "tmp"
            / "GodotFusionReview.app"
        )
        try:
            clone_cleanup_succeeded = _remove_generated_godot_clone(
                clone_root
            )
        except (
            FusionReviewRecordingError,
            OSError,
        ):
            clone_cleanup_succeeded = False
        try:
            publication_cleanup = _cleanup_failed_publication(run_dir)
        except BaseException as cleanup_error:
            publication_cleanup = {
                "status": "incomplete",
                "validPublishedPassArtifactPresent": (
                    (
                        run_dir
                        / "pet-fusion-closed-review-1x.mp4"
                    ).exists()
                    and (run_dir / "PASS.json").exists()
                ),
                "errors": [
                    f"publication cleanup crashed: {cleanup_error}"
                ],
            }
        _write_failure_summary(
            run_dir,
            run_id=run_id,
            error=error,
            clone_cleanup_succeeded=clone_cleanup_succeeded,
            publication_cleanup=publication_cleanup,
        )
        raise


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "在融合生产关闭态下，以真实 macOS/Metal Godot 窗口录制 "
            "1280x720、30fps、1.00x、无音频的两条融合路线验收视频。"
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
        "--python",
        default=sys.executable,
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
            "pet fusion closed owner review recording interrupted",
            file=sys.stderr,
        )
        return 130
    except (
        FusionReviewRecordingError,
        FileExistsError,
        OSError,
        ValueError,
    ) as error:
        print(
            f"pet fusion closed owner review recording failed: {error}",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
