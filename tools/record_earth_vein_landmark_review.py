#!/usr/bin/env python3
"""Record the Earth Vein Cave top-floor resonance-platform review clip.

The normal four-floor owner movie starts every floor at its authoritative
spawn.  This focused companion uses a standalone QA SceneTree controller to
place the camera at a disclosed review-only viewpoint, then delivers a real
cross-frame mouse click in the real Main scene so both top-floor resonance
platforms enter the 1280x720 frame.  Native and MovieWriter passes each run in
their own official owner-attested automation lane; no login, server or
arbitrary Godot arguments are accepted.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import math
import re
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
MAP_RECORDER_PATH = REPO_ROOT / "tools" / "record_firebud_v2_owner_review.py"
MAP_RECORDER_SPEC = importlib.util.spec_from_file_location(
    "_beastbound_earth_landmark_media_core", MAP_RECORDER_PATH
)
if MAP_RECORDER_SPEC is None or MAP_RECORDER_SPEC.loader is None:
    raise RuntimeError(f"无法加载地图媒体核心：{MAP_RECORDER_PATH}")
RECORDER = importlib.util.module_from_spec(MAP_RECORDER_SPEC)
MAP_RECORDER_SPEC.loader.exec_module(RECORDER)
CORE = RECORDER.CORE

GODOT_PROJECT = REPO_ROOT / "client" / "godot"
CAPTURE_SCRIPT = "res://scripts/qa/earth_vein_landmark_review_capture.gd"
OUTPUT_ENV = "BEASTBOUND_EARTH_LANDMARK_OUTPUT"
REPORT_ENV = "BEASTBOUND_EARTH_LANDMARK_REPORT"
QA_PREVIEW_ARG = "--map-art-review-preview=earth_vein_cave_f4"
DEFAULT_OUTPUT_ROOT = Path(
    ".run/evidence/earth_vein_cave_visual_v1_owner_review"
)
EXPECTED_MAP_ID = "earth_vein_cave_f4"
EXPECTED_BUNDLE_ID = "earth_vein_cave_visual_v1"
EXPECTED_LANDMARKS = ["f4_guardian_plinth", "f4_lineage_plinth"]
EXPECTED_WIDTH = 1280
EXPECTED_HEIGHT = 720
EXPECTED_FPS = 30
SAFE_RUN_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")


class EarthLandmarkRecordingError(RuntimeError):
    """The closed top-floor landmark recording contract failed."""


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run-id", default="")
    parser.add_argument("--godot", default="godot")
    parser.add_argument("--ffmpeg", default="ffmpeg")
    parser.add_argument("--ffprobe", default="ffprobe")
    parser.add_argument("--timeout-seconds", type=float, default=120.0)
    return parser.parse_args()


def _default_run_id() -> str:
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")
    return f"earth-vein-f4-landmarks-{timestamp}-{uuid.uuid4().hex[:8]}"


def _portable(path: Path) -> str:
    try:
        return path.resolve().relative_to(REPO_ROOT).as_posix()
    except ValueError:
        return str(path.resolve())


def _command(
    *,
    godot: str,
    avi_path: Path | None,
) -> list[str]:
    command = [
        godot,
        "--path",
        str(GODOT_PROJECT),
        "--script",
        CAPTURE_SCRIPT,
        "--windowed",
        "--resolution",
        f"{EXPECTED_WIDTH}x{EXPECTED_HEIGHT}",
        "--single-window",
        "--time-scale",
        "1.0",
    ]
    if avi_path is not None:
        command.extend(
            [
                "--fixed-fps",
                str(EXPECTED_FPS),
                "--disable-vsync",
                "--write-movie",
                str(avi_path),
            ]
        )
    command.extend(["--", QA_PREVIEW_ARG, CORE.QA_LANE_ARGUMENT])
    if (
        command.count(QA_PREVIEW_ARG) != 1
        or command.count(CORE.QA_LANE_ARGUMENT) != 1
        or "--user-data-dir" in command
        or (avi_path is None and "--write-movie" in command)
        or (avi_path is not None and command.count("--write-movie") != 1)
    ):
        raise EarthLandmarkRecordingError("landmark Godot 命令边界不精确")
    return command


def _payload_from_log(path: Path, *, movie_mode: bool) -> dict[str, Any]:
    text = path.read_text(encoding="utf-8", errors="replace")
    forbidden = (
        "SCRIPT ERROR:",
        "Parse Error:",
        "ERROR:",
        "WARNING:",
        "ObjectDB instances were leaked",
        "resources still in use at exit",
    )
    found = [token for token in forbidden if token in text]
    if found:
        raise EarthLandmarkRecordingError(
            "landmark Godot 日志存在错误或泄漏：" + ", ".join(found)
        )
    if "Metal 4.0 - Forward Mobile" not in text:
        raise EarthLandmarkRecordingError("landmark capture 没有使用 Metal Forward Mobile")
    movie_marker = "Movie Maker mode enabled, recording movie in 1280×720 @ 30 FPS"
    if movie_mode and movie_marker not in text:
        raise EarthLandmarkRecordingError("landmark MovieWriter 合同缺失")
    if not movie_mode and movie_marker in text:
        raise EarthLandmarkRecordingError("landmark native capture 意外进入 MovieWriter")
    prefix = "earth vein landmark review capture: "
    matches = [line[len(prefix):] for line in text.splitlines() if line.startswith(prefix)]
    if len(matches) != 1:
        raise EarthLandmarkRecordingError("landmark 日志必须只有一条 capture receipt")
    try:
        payload = json.loads(matches[0])
    except json.JSONDecodeError as error:
        raise EarthLandmarkRecordingError("landmark capture receipt 无法解析") from error
    if not isinstance(payload, dict) or payload.get("result") != "PASS":
        raise EarthLandmarkRecordingError("landmark capture receipt 不是 PASS")
    return payload


def _read_report(path: Path) -> dict[str, Any]:
    try:
        report = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise EarthLandmarkRecordingError(f"landmark report 无法解析：{path}") from error
    required = {
        "result": "PASS",
        "ok": True,
        "scene": "res://scenes/Main.tscn",
        "mapId": EXPECTED_MAP_ID,
        "bundleId": EXPECTED_BUNDLE_ID,
        "mapArtStatus": "owner_review_pending",
        "mapArtActive": True,
        "mapArtQaPreview": True,
        "viewport": [EXPECTED_WIDTH, EXPECTED_HEIGHT],
        "reviewOnlyViewpointReposition": True,
        "startCell": [20, 16],
        "targetCell": [22, 11],
        "endCell": [22, 11],
        "playerCellChanged": True,
        "movementCompleted": True,
        "networkRequestsDisconnected": True,
        "requiredLandmarkInstanceIds": EXPECTED_LANDMARKS,
        "errors": [],
    }
    mismatches = [
        f"{key}={report.get(key)!r}"
        for key, expected in required.items()
        if report.get(key) != expected
    ]
    input_report = report.get("input")
    if (
        not isinstance(input_report, dict)
        or input_report.get("frameSeparated") is not True
        or input_report.get("uiBlocked") is not False
    ):
        mismatches.append("input.frameSeparated")
    screenshot = report.get("screenshot")
    if (
        not isinstance(screenshot, dict)
        or screenshot.get("width") != EXPECTED_WIDTH
        or screenshot.get("height") != EXPECTED_HEIGHT
        or screenshot.get("sha256") != report.get("screenshotSha256")
    ):
        mismatches.append("screenshot")
    cleanup = report.get("runtimeCleanup")
    if not isinstance(cleanup, dict) or cleanup.get("status") != "passed":
        mismatches.append("runtimeCleanup")
    prepared = report.get("preparedObjectInstanceIds")
    if not isinstance(prepared, list) or any(value not in prepared for value in EXPECTED_LANDMARKS):
        mismatches.append("preparedObjectInstanceIds")
    if mismatches:
        raise EarthLandmarkRecordingError(
            "landmark report 合同失败：" + ", ".join(mismatches)
        )
    return report


def _run(args: argparse.Namespace) -> Path:
    timeout_seconds = float(args.timeout_seconds)
    if not math.isfinite(timeout_seconds) or timeout_seconds <= 0:
        raise EarthLandmarkRecordingError("--timeout-seconds 必须大于 0")
    run_id = str(args.run_id).strip() or _default_run_id()
    if SAFE_RUN_ID.fullmatch(run_id) is None:
        raise EarthLandmarkRecordingError("--run-id 含不安全字符")
    run_dir = (REPO_ROOT / DEFAULT_OUTPUT_ROOT / run_id).resolve()
    run_dir.mkdir(parents=True, exist_ok=False)
    temporary_dir = run_dir / "tmp"
    temporary_dir.mkdir(parents=False, exist_ok=False)

    godot = CORE._require_executable(str(args.godot), label="Godot")
    ffmpeg = CORE._require_executable(str(args.ffmpeg), label="ffmpeg")
    ffprobe = CORE._require_executable(str(args.ffprobe), label="ffprobe")
    base_environment = CORE._isolated_environment(temporary_dir)

    native_screenshot = run_dir / "earth-vein-f4-landmarks-native.png"
    native_report_path = run_dir / "earth-vein-f4-landmarks-native.json"
    native_log = run_dir / "earth-vein-f4-landmarks-native-godot.log"
    native_lane_dir = run_dir / "native-qa-lane"
    native_lane_dir.mkdir()
    native_environment = dict(base_environment)
    native_environment[OUTPUT_ENV] = str(native_screenshot)
    native_environment[REPORT_ENV] = str(native_report_path)
    native_lane = CORE._run_official_lane_godot_sequence(
        run_dir=native_lane_dir,
        godot=godot,
        base_environment=native_environment,
        native_command=_command(godot=godot, avi_path=None),
        native_log=native_log,
        timeout_seconds=timeout_seconds,
        native_log_validator=lambda path: _payload_from_log(path, movie_mode=False),
    )
    native_report = _read_report(native_report_path)

    raw_movie = run_dir / "earth-vein-f4-landmarks.avi"
    movie_screenshot = run_dir / "earth-vein-f4-landmarks-movie.png"
    movie_report_path = run_dir / "earth-vein-f4-landmarks-movie.json"
    movie_log = run_dir / "earth-vein-f4-landmarks-movie-godot.log"
    movie_lane_dir = run_dir / "movie-qa-lane"
    movie_lane_dir.mkdir()
    movie_environment = dict(base_environment)
    movie_environment[OUTPUT_ENV] = str(movie_screenshot)
    movie_environment[REPORT_ENV] = str(movie_report_path)
    movie_lane = CORE._run_official_lane_godot_sequence(
        run_dir=movie_lane_dir,
        godot=godot,
        base_environment=movie_environment,
        native_command=_command(godot=godot, avi_path=raw_movie),
        native_log=movie_log,
        timeout_seconds=timeout_seconds,
        native_log_validator=lambda path: _payload_from_log(path, movie_mode=True),
    )
    movie_report = _read_report(movie_report_path)

    video_path = run_dir / "earth-vein-f4-landmarks-1x.mp4"
    transcode_log = run_dir / "earth-vein-f4-landmarks-transcode.log"
    RECORDER._transcode_segment(
        ffmpeg=ffmpeg,
        avi_path=raw_movie,
        video_path=video_path,
        log_path=transcode_log,
        timeout_seconds=timeout_seconds,
        environment=movie_lane["environment"],
    )
    probe_path = run_dir / "earth-vein-f4-landmarks-ffprobe.json"
    media = RECORDER._validate_segment_probe(
        CORE._write_probe(ffprobe, video_path, probe_path)
    )
    decode_log = run_dir / "earth-vein-f4-landmarks-decode.log"
    CORE._run_logged(
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
        environment=movie_lane["environment"],
    )

    summary = {
        "schemaVersion": 1,
        "reportType": "beastbound_earth_vein_f4_landmark_owner_review_video",
        "generatedAtUtc": datetime.now(timezone.utc).isoformat(timespec="seconds").replace(
            "+00:00", "Z"
        ),
        "result": "PASS",
        "bundleId": EXPECTED_BUNDLE_ID,
        "mapId": EXPECTED_MAP_ID,
        "playbackSpeed": 1.0,
        "reviewOnlyViewpointReposition": True,
        "requiredLandmarkInstanceIds": EXPECTED_LANDMARKS,
        "nativeScreenshot": CORE._artifact_record(native_screenshot),
        "nativeReport": CORE._artifact_record(native_report_path),
        "nativeCapture": native_report,
        "movieScreenshot": CORE._artifact_record(movie_screenshot),
        "movieReport": CORE._artifact_record(movie_report_path),
        "movieCapture": movie_report,
        "video": {**CORE._artifact_record(video_path), **media},
        "probe": CORE._artifact_record(probe_path),
        "logs": {
            "native": CORE._artifact_record(native_log),
            "movie": CORE._artifact_record(movie_log),
            "transcode": CORE._artifact_record(transcode_log),
            "decode": CORE._artifact_record(decode_log),
        },
        "qaLanes": {
            "native": {
                "sourceCheck": native_lane["sourceCheck"],
                "attestation": native_lane["native"]["attestation"],
                "cleanup": native_lane["cleanup"],
                "postCleanupInspect": native_lane["postCleanupInspect"],
                "lifecycle": CORE._artifact_record(native_lane["lifecyclePath"]),
            },
            "movie": {
                "sourceCheck": movie_lane["sourceCheck"],
                "attestation": movie_lane["native"]["attestation"],
                "cleanup": movie_lane["cleanup"],
                "postCleanupInspect": movie_lane["postCleanupInspect"],
                "lifecycle": CORE._artifact_record(movie_lane["lifecyclePath"]),
            },
        },
    }
    summary_path = run_dir / "earth-vein-f4-landmarks-report.json"
    CORE._write_secure_json(summary_path, summary)
    return summary_path


def main() -> int:
    args = _parse_args()
    try:
        summary = _run(args)
    except (
        EarthLandmarkRecordingError,
        RECORDER.FirebudV2RecordingError,
        CORE.PetManagementRecordingError,
        OSError,
    ) as error:
        print(f"earth vein landmark recording failed: {error}", file=sys.stderr)
        return 1
    print(f"earth vein landmark recording: PASS summary={_portable(summary)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
