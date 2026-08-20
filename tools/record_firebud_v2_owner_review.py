#!/usr/bin/env python3
"""Record the isolated, real-Main Phase383 Firebud v2 art review.

This recorder intentionally does *not* start a backend or offer an escape hatch
for account, server, or arbitrary Godot arguments.  It invokes the existing
``MapVisualReviewCapture`` controller once for idle and once for a real
cross-frame left-click movement on each Firebud review map.  Every native and
MovieWriter invocation is contained by the owner-attested ``automation`` QA
user-data lane; the lane is cleaned before media processing and the real
player directory is proven unchanged.  Every 30 fps clip keeps its motion at
1.00x, then holds the final frame for four seconds so the owner can actually
inspect the scene before the four clips are concatenated and frozen under
``.run/evidence``.

Each segment first proves the fresh default profile, then the capture-only
controller injects a fixed in-memory showcase identity so the normal player
HUD can render real character and battle-pet portraits.  The profile remains
unauthenticated, disconnected and non-persistent.

It is a review-only gate.  The runtime candidate must remain
``owner_review_pending`` and is accessed only through the explicit
``--map-art-review-preview=<mapId>`` argument.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import math
import os
import re
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Sequence


REPO_ROOT = Path(__file__).resolve().parents[1]
CORE_PATH = REPO_ROOT / "tools" / "record_pet_management_owner_review.py"
CORE_SPEC = importlib.util.spec_from_file_location(
    "_beastbound_firebud_v2_media_core", CORE_PATH
)
if CORE_SPEC is None or CORE_SPEC.loader is None:
    raise RuntimeError(f"无法加载媒体录制核心：{CORE_PATH}")
CORE = importlib.util.module_from_spec(CORE_SPEC)
CORE_SPEC.loader.exec_module(CORE)

GODOT_PROJECT = REPO_ROOT / "client" / "godot"
MAIN_SCENE = "res://scenes/Main.tscn"
DEFAULT_CAPTURE_FLAG = "--map-visual-review-capture"
SHOWCASE_PROFILE_FLAG = "--map-visual-review-showcase-profile"
DEFAULT_OUTPUT_ROOT = Path(".run/evidence/phase383_firebud_v2_owner_review")
REPORT_SCHEMA_VERSION = 1
REPORT_TYPE = "beastbound_firebud_v2_main_owner_review_video"
EXPECTED_WIDTH = 1280
EXPECTED_HEIGHT = 720
EXPECTED_FPS = 30
EXPECTED_BUNDLE_ID = "firebud_region_visual_v2"
EXPECTED_PIXEL_FORMAT = "yuv420p"
EXPECTED_VIDEO_CODEC = "h264"
EXPECTED_AUDIO_CODEC = "aac"
POST_CAPTURE_HOLD_SECONDS = 4.0
MIN_DURATION_SECONDS = 4.0
MAX_DURATION_SECONDS = 90.0
DEFAULT_SAMPLE_COUNT = 8
MAX_SAMPLE_COUNT = 16
SAFE_RUN_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")
SAFE_MAP_ID = re.compile(r"^[a-z0-9]+(?:_[a-z0-9]+)*$")
REVIEW_MAPS = ("firebud_village_gate", "firebud_training_yard")
REVIEW_MODES = ("idle", "moving")
CAPTURE_VARIANTS = (
    "pointer",
    "movement_path",
    "warp",
    "collision",
    "occlusion",
)
USE_SHOWCASE_PROFILE = True
FINAL_VIDEO_FILENAME = "firebud-v2-owner-review-1x.mp4"
RUN_ID_PREFIX = "phase383"

RECORDER_CONFIGS: dict[str, dict[str, Any]] = {
    "firebud_region_visual_v2": {
        "maps": ("firebud_village_gate", "firebud_training_yard"),
        "outputRoot": Path(".run/evidence/phase383_firebud_v2_owner_review"),
        "reportType": "beastbound_firebud_v2_main_owner_review_video",
        "videoFilename": "firebud-v2-owner-review-1x.mp4",
        "runIdPrefix": "phase383",
        "useShowcaseProfile": True,
    },
    "earth_vein_cave_visual_v1": {
        "maps": (
            "earth_vein_cave",
            "earth_vein_cave_f2",
            "earth_vein_cave_f3",
            "earth_vein_cave_f4",
        ),
        "outputRoot": Path(".run/evidence/earth_vein_cave_visual_v1_owner_review"),
        "reportType": "beastbound_map_visual_main_owner_review_video",
        "videoFilename": "earth-vein-cave-v1-owner-review-1x.mp4",
        "runIdPrefix": "earth-vein-v1",
        "useShowcaseProfile": False,
    },
}


class FirebudV2RecordingError(RuntimeError):
    """The isolated Phase383 review contract failed."""


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _new_run_id() -> str:
    timestamp = _utc_now().strftime("%Y%m%dT%H%M%S.%fZ")
    return f"{RUN_ID_PREFIX}-{timestamp}-{uuid.uuid4().hex[:8]}"


def _activate_bundle(bundle_id: str) -> None:
    global EXPECTED_BUNDLE_ID
    global REVIEW_MAPS
    global DEFAULT_OUTPUT_ROOT
    global REPORT_TYPE
    global USE_SHOWCASE_PROFILE
    global FINAL_VIDEO_FILENAME
    global RUN_ID_PREFIX

    config = RECORDER_CONFIGS.get(str(bundle_id).strip())
    if config is None:
        raise FirebudV2RecordingError(
            "不支持的地图审图 bundle：%s" % str(bundle_id)
        )
    EXPECTED_BUNDLE_ID = str(bundle_id).strip()
    REVIEW_MAPS = tuple(str(value) for value in config["maps"])
    DEFAULT_OUTPUT_ROOT = Path(config["outputRoot"])
    REPORT_TYPE = str(config["reportType"])
    USE_SHOWCASE_PROFILE = bool(config["useShowcaseProfile"])
    FINAL_VIDEO_FILENAME = str(config["videoFilename"])
    RUN_ID_PREFIX = str(config["runIdPrefix"])


def _safe_map_id(map_id: str) -> str:
    normalized = str(map_id).strip()
    if normalized not in REVIEW_MAPS or SAFE_MAP_ID.fullmatch(normalized) is None:
        raise FirebudV2RecordingError(
            "只允许录制当前 bundle 的固定审图地图：" + ", ".join(REVIEW_MAPS)
        )
    return normalized


def _safe_mode(mode: str) -> str:
    normalized = str(mode).strip()
    if normalized not in REVIEW_MODES:
        raise FirebudV2RecordingError("录制模式只能是 idle 或 moving")
    return normalized


def _build_godot_command(
    *,
    godot: str,
    avi_path: Path | None,
    map_id: str,
    mode: str,
    screenshot_path: Path,
    report_path: Path,
    capture_variant: str = "",
) -> list[str]:
    """Build the one intentionally closed Godot invocation for a segment."""
    safe_map = _safe_map_id(map_id)
    safe_mode = _safe_mode(mode)
    safe_capture_variant = str(capture_variant).strip()
    if safe_capture_variant and safe_capture_variant not in CAPTURE_VARIANTS:
        raise FirebudV2RecordingError("capture variant 不是固定地图动作")
    if not screenshot_path.is_absolute() or not report_path.is_absolute():
        raise FirebudV2RecordingError("截图和报告必须使用绝对路径")
    if screenshot_path.suffix.lower() != ".png" or report_path.suffix.lower() != ".json":
        raise FirebudV2RecordingError("截图必须为 PNG，报告必须为 JSON")
    command = [
        godot,
        "--path",
        str(GODOT_PROJECT),
        "--scene",
        MAIN_SCENE,
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
    command.extend([
        "--",
        f"--map-art-review-preview={safe_map}",
        DEFAULT_CAPTURE_FLAG,
        f"--map-visual-review-map-id={safe_map}",
        f"--map-visual-review-output={screenshot_path}",
        f"--map-visual-review-report={report_path}",
        f"--map-visual-review-mode={safe_mode}",
        CORE.QA_LANE_ARGUMENT,
    ])
    if safe_capture_variant:
        command.insert(
            command.index(CORE.QA_LANE_ARGUMENT),
            f"--map-visual-review-capture-variant={safe_capture_variant}",
        )
    if USE_SHOWCASE_PROFILE:
        command.insert(command.index(f"--map-visual-review-map-id={safe_map}"), SHOWCASE_PROFILE_FLAG)
    expected_showcase_count = 1 if USE_SHOWCASE_PROFILE else 0
    if (
        command.count(DEFAULT_CAPTURE_FLAG) != 1
        or command.count(SHOWCASE_PROFILE_FLAG) != expected_showcase_count
        or command.count(CORE.QA_LANE_ARGUMENT) != 1
        or "--user-data-dir" in command
        or (avi_path is None and "--write-movie" in command)
        or (avi_path is not None and command.count("--write-movie") != 1)
        or sum(
            value.startswith("--map-visual-review-capture-variant=")
            for value in command
        ) != (1 if safe_capture_variant else 0)
    ):
        raise FirebudV2RecordingError(
            "Godot 地图验收命令的 QA lane 边界不精确"
        )
    return command


def _validate_godot_log(path: Path, *, movie_mode: bool) -> dict[str, Any]:
    text = path.read_text(encoding="utf-8", errors="replace")
    if "SCRIPT ERROR:" in text or "Parse Error:" in text:
        raise FirebudV2RecordingError("Godot Firebud v2 日志包含脚本错误")
    if "Metal 4.0 - Forward Mobile" not in text:
        raise FirebudV2RecordingError("Firebud v2 验收没有使用 Metal Forward Mobile")
    movie_marker = "Movie Maker mode enabled, recording movie in 1280×720 @ 30 FPS"
    if movie_mode and movie_marker not in text:
        raise FirebudV2RecordingError("Firebud v2 MovieWriter 合同缺失")
    if not movie_mode and movie_marker in text:
        raise FirebudV2RecordingError("Firebud v2 原生预检意外进入 MovieWriter")
    forbidden = (
        "ERROR:",
        "WARNING:",
        "ObjectDB instances were leaked",
        "resources still in use at exit",
        "Orphan StringName",
    )
    found = [token for token in forbidden if token in text]
    if found:
        raise FirebudV2RecordingError(
            "Firebud v2 Godot 日志存在错误或泄漏：" + ", ".join(found)
        )
    if "map visual review capture:" not in text:
        raise FirebudV2RecordingError("Firebud v2 Godot 日志缺少 capture 回执")
    return {
        "status": "passed",
        "renderer": "Metal 4.0 - Forward Mobile",
        "movieWriter": "1280x720@30fps" if movie_mode else "disabled",
        "runtimeLeakFree": True,
    }


def _read_capture_report(
    path: Path, *, map_id: str, mode: str, capture_variant: str = ""
) -> dict[str, Any]:
    if not path.is_file():
        raise FirebudV2RecordingError(f"Godot 没有写出地图 capture 报告：{path}")
    try:
        report = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise FirebudV2RecordingError(f"地图 capture 报告无法解析：{path}") from error
    if not isinstance(report, dict):
        raise FirebudV2RecordingError("地图 capture 报告根节点必须是对象")
    errors = report.get("errors", [])
    required = {
        "result": "PASS",
        "ok": True,
        "scene": MAIN_SCENE,
        "mapId": map_id,
        "mode": mode,
        "qaPreviewFlagPresent": True,
        "qaPreviewMapId": map_id,
        "mapArtActive": True,
        "mapArtQaPreview": True,
        "mapArtStatus": "owner_review_pending",
        "bundleId": EXPECTED_BUNDLE_ID,
        "defaultProfileIsolation": True,
        "showcaseProfilePersisted": False,
        "accountAuthenticated": False,
        "profileSaveEnabled": False,
        "serverAccountSession": False,
        "networkRequestAttempted": False,
        "networkRequestsDisconnected": True,
        "normalPlayerHud": True,
    }
    if capture_variant:
        required["captureVariant"] = capture_variant
    if USE_SHOWCASE_PROFILE:
        required.update({
            "profileIsolation": "default_profile_verified_then_showcase_ephemeral_no_save",
            "showcaseProfileRequested": True,
            "showcaseProfileInMemory": True,
            "showcaseProfilePostInjectionIsDefault": False,
            "showcaseProfileId": "phase383_firebud_v2_owner_review",
            "showcasePlayerAppearanceId": "ember_spark_v1",
            "showcaseActivePetFormId": "bui_novice_sprout_earth5_wind5",
        })
    else:
        required.update({
            "profileIsolation": "default_profile_ephemeral_no_save",
            "showcaseProfileRequested": False,
            "showcaseProfileInMemory": False,
            "showcaseProfilePostInjectionIsDefault": True,
            "showcaseProfileId": "",
            "showcasePlayerAppearanceId": "",
            "showcaseActivePetFormId": "",
        })
    mismatches = [
        f"{key}={report.get(key)!r}" for key, expected in required.items()
        if report.get(key) != expected
    ]
    viewport = report.get("viewport")
    if viewport != [EXPECTED_WIDTH, EXPECTED_HEIGHT]:
        mismatches.append(f"viewport={viewport!r}")
    if not isinstance(errors, list) or errors:
        mismatches.append(f"errors={errors!r}")
    if int(report.get("groundDrawCount", 0)) <= 0:
        mismatches.append("groundDrawCount<=0")
    if int(report.get("objectCount", 0)) <= 0:
        mismatches.append("objectCount<=0")
    camera_composition = report.get("cameraComposition")
    if not isinstance(camera_composition, dict):
        mismatches.append("cameraComposition 不是对象")
    else:
        for key, expected in {
            "taskHudVisible": True,
            "playerInsideSafeRect": True,
            "playerClearOfTaskHud": True,
            "playerAtEffectiveAnchor": True,
            "taskHudOverlappingBlockingObjectIds": [],
        }.items():
            if camera_composition.get(key) != expected:
                mismatches.append(
                    f"cameraComposition.{key}={camera_composition.get(key)!r}"
                )
        if EXPECTED_BUNDLE_ID == "firebud_region_visual_v2":
            anchor = camera_composition.get("configuredAnchor")
            if (
                not isinstance(anchor, list)
                or len(anchor) != 2
                or abs(float(anchor[0]) - 390.0) > 0.5
                or abs(float(anchor[1]) - 360.0) > 0.5
            ):
                mismatches.append(
                    f"cameraComposition.configuredAnchor={anchor!r}"
                )
            if map_id == "firebud_village_gate":
                nearest_warp = camera_composition.get("nearestWarp")
                if (
                    not isinstance(nearest_warp, dict)
                    or nearest_warp.get("id") != "warp_to_training_yard"
                    or nearest_warp.get("edgeClear") is not True
                ):
                    mismatches.append(
                        f"cameraComposition.nearestWarp={nearest_warp!r}"
                    )
    cleanup = report.get("runtimeCleanup")
    if not isinstance(cleanup, dict):
        mismatches.append("runtimeCleanup 不是对象")
    else:
        for key, expected in {
            "status": "passed",
            "audioPlaybackDisabled": True,
            "audioStopped": True,
            "audioStreamsDetached": True,
            "audioManagerReleased": True,
            "drainSeconds": 1.5,
            "drainFrames": 16,
        }.items():
            if cleanup.get(key) != expected:
                mismatches.append(
                    f"runtimeCleanup.{key}={cleanup.get(key)!r}"
                )
        detached_count = cleanup.get("detachedAudioPlayerCount")
        if (
            type(detached_count) is not int
            or detached_count <= 0
        ):
            mismatches.append(
                "runtimeCleanup.detachedAudioPlayerCount="
                f"{detached_count!r}"
            )
    if mode == "moving":
        input_report = report.get("input")
        if not isinstance(input_report, dict):
            mismatches.append("input 不是对象")
        else:
            for key, expected in {
                "eventClass": "InputEventMouseButton",
                "delivery": "Input.parse_input_event",
                "frameSeparated": True,
            }.items():
                if input_report.get(key) != expected:
                    mismatches.append(f"input.{key}={input_report.get(key)!r}")
        if report.get("playerCellChanged") is not True:
            mismatches.append("playerCellChanged!=true")
    elif report.get("playerCellChanged") is not False:
        mismatches.append("idle.playerCellChanged!=false")
    if mismatches:
        raise FirebudV2RecordingError(
            "地图 capture 合同失败（%s/%s）：%s"
            % (map_id, mode, "; ".join(mismatches))
        )
    return report


def _transcode_segment(
    *,
    ffmpeg: str,
    avi_path: Path,
    video_path: Path,
    log_path: Path,
    timeout_seconds: float,
    environment: dict[str, str],
) -> None:
    CORE._run_logged(
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
            (
                "tpad=stop_mode=clone:stop_duration="
                f"{POST_CAPTURE_HOLD_SECONDS:.1f},"
                "scale=in_range=pc:out_range=tv,format=yuv420p"
            ),
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
            "-af",
            f"apad=pad_dur={POST_CAPTURE_HOLD_SECONDS:.1f}",
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
        log_path=log_path,
        timeout_seconds=timeout_seconds,
        environment=environment,
    )


def _validate_probe(probe: dict[str, Any]) -> dict[str, Any]:
    try:
        metadata = CORE._validate_probe(probe)
    except CORE.PetManagementRecordingError as error:
        raise FirebudV2RecordingError(str(error)) from error
    duration = float(metadata.get("durationSeconds", -1.0))
    if not math.isfinite(duration) or duration < MIN_DURATION_SECONDS or duration > MAX_DURATION_SECONDS:
        raise FirebudV2RecordingError(
            f"Firebud v2 录像时长必须为 {MIN_DURATION_SECONDS:.0f}-{MAX_DURATION_SECONDS:.0f} 秒，实际 {duration:.3f} 秒"
        )
    minimum_frames = int(math.floor(duration * EXPECTED_FPS) - 2)
    if int(metadata.get("frameCount", -1)) < minimum_frames:
        raise FirebudV2RecordingError("Firebud v2 录像帧数与 30fps 时长不一致")
    return metadata


def _validate_segment_probe(probe: dict[str, Any]) -> dict[str, Any]:
    """Validate a short controller clip without imposing the final-film length.

    The existing map controller deliberately finishes quickly after its stable
    screenshot.  Its idle clip can therefore be below the generic pet-video
    one-second minimum; that is safe when the final concatenated review still
    meets the Phase383 lower bound.
    """
    streams = probe.get("streams")
    if not isinstance(streams, list):
        raise FirebudV2RecordingError("片段 ffprobe streams 不是数组")
    video = next((item for item in streams if isinstance(item, dict) and item.get("codec_type") == "video"), None)
    audio = next((item for item in streams if isinstance(item, dict) and item.get("codec_type") == "audio"), None)
    if not isinstance(video, dict) or not isinstance(audio, dict):
        raise FirebudV2RecordingError("片段必须同时含视频和音频流")
    try:
        fps = CORE._parse_fraction(video.get("avg_frame_rate") or video.get("r_frame_rate"), label="片段视频 fps")
        duration = float(CORE._stream_duration(video, probe))
        audio_duration = float(CORE._stream_duration(audio, probe))
        frame_count = int(video.get("nb_read_frames") or video.get("nb_frames"))
    except (TypeError, ValueError, CORE.PetManagementRecordingError) as error:
        raise FirebudV2RecordingError("片段媒体元数据无法解析") from error
    if (
        video.get("codec_name") != EXPECTED_VIDEO_CODEC
        or video.get("pix_fmt") != EXPECTED_PIXEL_FORMAT
        or video.get("width") != EXPECTED_WIDTH
        or video.get("height") != EXPECTED_HEIGHT
        or float(fps) != float(EXPECTED_FPS)
        or audio.get("codec_name") != EXPECTED_AUDIO_CODEC
        or int(audio.get("sample_rate", 0)) != 48000
        or int(audio.get("channels", 0)) != 2
        or not math.isfinite(duration)
        or duration <= 0
        or not math.isfinite(audio_duration)
        or abs(audio_duration - duration) > 0.25
        or frame_count <= 0
    ):
        raise FirebudV2RecordingError("片段不是 1280x720/30fps/1× H.264/AAC 有声有效录像")
    return {
        "videoCodec": EXPECTED_VIDEO_CODEC,
        "pixelFormat": EXPECTED_PIXEL_FORMAT,
        "audioCodec": EXPECTED_AUDIO_CODEC,
        "width": EXPECTED_WIDTH,
        "height": EXPECTED_HEIGHT,
        "fps": float(EXPECTED_FPS),
        "durationSeconds": duration,
        "audioDurationSeconds": audio_duration,
        "frameCount": frame_count,
    }


def _concat_segments(
    *,
    ffmpeg: str,
    videos: Sequence[Path],
    list_path: Path,
    output_path: Path,
    log_path: Path,
    timeout_seconds: float,
    environment: dict[str, str],
) -> None:
    if len(videos) != len(REVIEW_MAPS) * len(REVIEW_MODES):
        raise FirebudV2RecordingError("录像片段数量必须覆盖全部地图的 idle/moving")
    # All paths are freshly created directly inside the immutable run directory;
    # ffconcat quoting is still explicit so a future safe run id cannot alter it.
    list_path.write_text(
        "".join("file '%s'\n" % path.as_posix().replace("'", "'\\\\''") for path in videos),
        encoding="utf-8",
    )
    CORE._run_logged(
        [
            ffmpeg,
            "-y",
            "-v",
            "warning",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            str(list_path),
            "-map",
            "0:v:0",
            "-map",
            "0:a:0",
            "-c",
            "copy",
            "-movflags",
            "+faststart",
            str(output_path),
        ],
        log_path=log_path,
        timeout_seconds=timeout_seconds,
        environment=environment,
    )


def _record_into(*, args: argparse.Namespace, run_id: str, run_dir: Path) -> Path:
    timeout_seconds = float(args.timeout_seconds)
    if not math.isfinite(timeout_seconds) or timeout_seconds <= 0:
        raise FirebudV2RecordingError("--timeout-seconds 必须大于 0")
    if int(args.sample_count) < 2 or int(args.sample_count) > MAX_SAMPLE_COUNT:
        raise FirebudV2RecordingError(
            f"--sample-count 必须介于 2 和 {MAX_SAMPLE_COUNT}"
        )
    godot = CORE._require_executable(args.godot, label="Godot")
    ffmpeg = CORE._require_executable(args.ffmpeg, label="ffmpeg")
    ffprobe = CORE._require_executable(args.ffprobe, label="ffprobe")
    temporary_dir = run_dir / "tmp"
    temporary_dir.mkdir(parents=False, exist_ok=False)
    base_environment = CORE._isolated_environment(temporary_dir)
    environment = base_environment
    segment_dir = run_dir / "segments"
    segment_dir.mkdir(parents=False, exist_ok=False)

    segments: list[dict[str, Any]] = []
    videos: list[Path] = []
    for map_id in REVIEW_MAPS:
        for mode in REVIEW_MODES:
            prefix = f"{map_id}-{mode}"
            lane_dir = segment_dir / f"{prefix}-qa-lane"
            lane_dir.mkdir(parents=False, exist_ok=False)
            avi_path = segment_dir / f"{prefix}.avi"
            video_path = segment_dir / f"{prefix}.mp4"
            native_screenshot_path = (
                segment_dir / f"{prefix}-native.png"
            ).resolve()
            native_report_path = (
                segment_dir / f"{prefix}-native.json"
            ).resolve()
            screenshot_path = (segment_dir / f"{prefix}.png").resolve()
            report_path = (segment_dir / f"{prefix}.json").resolve()
            native_log = segment_dir / f"{prefix}-native-godot.log"
            movie_log = segment_dir / f"{prefix}-movie-godot.log"
            transcode_log = segment_dir / f"{prefix}-transcode.log"
            native_command = _build_godot_command(
                godot=godot,
                avi_path=None,
                map_id=map_id,
                mode=mode,
                screenshot_path=native_screenshot_path,
                report_path=native_report_path,
            )
            movie_command = _build_godot_command(
                godot=godot,
                avi_path=avi_path,
                map_id=map_id,
                mode=mode,
                screenshot_path=screenshot_path,
                report_path=report_path,
            )
            lane_evidence = CORE._run_official_lane_godot_sequence(
                run_dir=lane_dir,
                godot=godot,
                base_environment=base_environment,
                native_command=native_command,
                movie_command=movie_command,
                native_log=native_log,
                movie_log=movie_log,
                timeout_seconds=timeout_seconds,
                native_log_validator=lambda path: _validate_godot_log(
                    path, movie_mode=False
                ),
                movie_log_validator=lambda path: _validate_godot_log(
                    path, movie_mode=True
                ),
            )
            environment = lane_evidence["environment"]
            native_capture_report = _read_capture_report(
                native_report_path, map_id=map_id, mode=mode
            )
            capture_report = _read_capture_report(report_path, map_id=map_id, mode=mode)
            _transcode_segment(
                ffmpeg=ffmpeg,
                avi_path=avi_path,
                video_path=video_path,
                log_path=transcode_log,
                timeout_seconds=timeout_seconds,
                environment=environment,
            )
            segment_probe_path = segment_dir / f"{prefix}-ffprobe.json"
            segment_media = _validate_segment_probe(CORE._write_probe(ffprobe, video_path, segment_probe_path))
            segments.append(
                {
                    "mapId": map_id,
                    "mode": mode,
                    "commands": {
                        "native": CORE._redacted_command(native_command),
                        "movie30": CORE._redacted_command(movie_command),
                    },
                    "nativeCaptureReport": CORE._artifact_record(
                        native_report_path
                    ),
                    "nativeCapture": native_capture_report,
                    "nativeScreenshot": CORE._artifact_record(
                        native_screenshot_path
                    ),
                    "captureReport": CORE._artifact_record(report_path),
                    "capture": capture_report,
                    "screenshot": CORE._artifact_record(screenshot_path),
                    "rawMovie": CORE._artifact_record(avi_path),
                    "video": {**CORE._artifact_record(video_path), **segment_media, "playbackSpeed": 1.0},
                    "probe": CORE._artifact_record(segment_probe_path),
                    "qaLane": {
                        "lane": CORE.QA_LANE,
                        "feature": CORE.QA_LANE_FEATURE,
                        "sourceCheck": lane_evidence["sourceCheck"],
                        "nativeAttestation": lane_evidence["native"][
                            "attestation"
                        ],
                        "movieAttestation": lane_evidence["movie"][
                            "attestation"
                        ],
                        "cleanup": lane_evidence["cleanup"],
                        "postCleanupInspect": lane_evidence[
                            "postCleanupInspect"
                        ],
                        "lifecycle": CORE._artifact_record(
                            lane_evidence["lifecyclePath"]
                        ),
                    },
                    "logs": {
                        "native": CORE._artifact_record(native_log),
                        "movie": CORE._artifact_record(movie_log),
                        "transcode": CORE._artifact_record(transcode_log),
                    },
                }
            )
            videos.append(video_path)

    concat_list = run_dir / "concat-inputs.txt"
    final_video_path = run_dir / FINAL_VIDEO_FILENAME
    concat_log = run_dir / "ffmpeg-concat.log"
    _concat_segments(
        ffmpeg=ffmpeg,
        videos=videos,
        list_path=concat_list,
        output_path=final_video_path,
        log_path=concat_log,
        timeout_seconds=timeout_seconds,
        environment=environment,
    )
    probe_path = run_dir / "ffprobe.json"
    media = _validate_probe(CORE._write_probe(ffprobe, final_video_path, probe_path))
    decode_log = run_dir / "full-audio-video-decode.log"
    CORE._run_logged(
        [ffmpeg, "-v", "error", "-xerror", "-i", str(final_video_path), "-map", "0:v:0", "-map", "0:a:0", "-f", "null", "-"],
        log_path=decode_log,
        timeout_seconds=timeout_seconds,
        environment=environment,
    )
    screenshots_dir = run_dir / "screenshots"
    sample_times = CORE._selected_sample_times(
        float(media["durationSeconds"]), requested=(), sample_count=int(args.sample_count)
    )
    screenshots = CORE._extract_review_frames(
        ffmpeg=ffmpeg,
        video_path=final_video_path,
        screenshots_dir=screenshots_dir,
        sample_times=sample_times,
        timeout_seconds=timeout_seconds,
    )
    contact = CORE._build_contact_sheet(
        ffmpeg=ffmpeg,
        screenshots_dir=screenshots_dir,
        output_path=run_dir / "contact-sheet.png",
        sample_count=len(screenshots),
        timeout_seconds=timeout_seconds,
    )
    metadata_path = run_dir / "metadata.json"
    metadata = {
        "schemaVersion": REPORT_SCHEMA_VERSION,
        "reportType": REPORT_TYPE,
        "scene": MAIN_SCENE,
        "viewport": {"width": EXPECTED_WIDTH, "height": EXPECTED_HEIGHT},
        "fps": EXPECTED_FPS,
        "playbackSpeed": 1.0,
        "motionPlaybackSpeed": 1.0,
        "postCaptureHoldSecondsPerSegment": POST_CAPTURE_HOLD_SECONDS,
        "candidateBundleId": EXPECTED_BUNDLE_ID,
        "maps": list(REVIEW_MAPS),
        "modes": list(REVIEW_MODES),
        "durationSeconds": media["durationSeconds"],
        "frameCount": media["frameCount"],
        "fullDecodeStatus": "passed",
        "captureSequence": [f"{entry['mapId']}:{entry['mode']}" for entry in segments],
        "isolation": {
            "officialAutomationQaLanePerSegment": True,
            "qaLaneCleanedAfterEverySegment": True,
            "normalPlayerSavePathUsed": False,
            "defaultProfileVerifiedBeforeInjection": USE_SHOWCASE_PROFILE,
            "showcaseProfileId": (
                "phase383_firebud_v2_owner_review"
                if USE_SHOWCASE_PROFILE
                else ""
            ),
            "showcaseProfileInMemoryOnly": USE_SHOWCASE_PROFILE,
            "showcaseProfilePersisted": False,
            "profileSaveEnabled": False,
            "backendProcessStartedByTool": False,
            "mysqlAccessByTool": False,
            "loginOrServerArgumentsAccepted": False,
        },
        "coverage": {
            "idle": True,
            "realCrossFrameMouseMovement": True,
            "explicitCandidatePreview": True,
            "normalHudVisible": True,
            "landmarkDepthVisualReview": "owner_video_frames",
            "hudCollapseRestore": "not_automated_by_existing_map_capture_controller",
        },
    }
    CORE._write_json(metadata_path, metadata)
    summary = {
        "schemaVersion": REPORT_SCHEMA_VERSION,
        "reportType": REPORT_TYPE,
        "status": "passed",
        "runId": run_id,
        "generatedAtUtc": _utc_now().isoformat().replace("+00:00", "Z"),
        "scene": MAIN_SCENE,
        "captureContract": metadata,
        "segments": segments,
        "video": {**CORE._artifact_record(final_video_path), **media, "playbackSpeed": 1.0, "decodeStatus": "passed"},
        "probe": CORE._artifact_record(probe_path),
        "fullDecode": {"status": "passed", "videoStreamDecoded": True, "audioStreamDecoded": True, "log": CORE._artifact_record(decode_log)},
        "screenshots": screenshots,
        "contactSheet": contact,
        "sha256Manifest": {
            "path": CORE._repo_relative(run_dir / "SHA256SUMS"),
            "coversAllRetainedEvidenceFiles": True,
            "coversThisSummary": True,
            "writtenAfterSummary": True,
        },
        "logs": {"concat": CORE._artifact_record(concat_log)},
        "ownerReviewStatus": "pending",
    }
    summary_path = run_dir / "summary.json"
    CORE._write_json(summary_path, summary)
    hash_paths = sorted(
        (
            path
            for path in run_dir.rglob("*")
            if path.is_file()
            and path.name != "SHA256SUMS"
            and path.relative_to(run_dir).parts[0] != "tmp"
        ),
        key=lambda path: str(path.relative_to(run_dir)),
    )
    CORE._write_sha256_manifest(run_dir, hash_paths)
    print(json.dumps({"status": "passed", "runId": run_id, "video": summary["video"]["path"], "contactSheet": contact["path"], "summary": CORE._repo_relative(summary_path)}, ensure_ascii=False))
    return summary_path


def _write_failure_summary(
    run_dir: Path,
    *,
    run_id: str,
    error: BaseException,
) -> bool:
    lane_receipts: list[dict[str, Any]] = []
    lane_receipt_read_errors: list[dict[str, Any]] = []
    for lifecycle_path in sorted(
        run_dir.glob("segments/*-qa-lane/qa-lane-lifecycle.json")
    ):
        try:
            with lifecycle_path.open("r", encoding="utf-8", newline="") as stream:
                lifecycle = json.load(stream)
            if not isinstance(lifecycle, dict):
                raise ValueError("QA lane lifecycle authority 不是 JSON object")
            lane_receipts.append(
                {
                    "artifact": CORE._artifact_record(lifecycle_path),
                    "lifecycle": lifecycle,
                }
            )
        except BaseException as read_error:
            lane_receipt_read_errors.append(
                {
                    "path": CORE._repo_relative(lifecycle_path),
                    **CORE._failure_envelope(read_error),
                }
            )
    supersedes_summary: dict[str, Any] | None = None
    summary_path = run_dir / "summary.json"
    try:
        if summary_path.is_file():
            supersedes_summary = CORE._artifact_record(summary_path)
    except BaseException as summary_error:
        supersedes_summary = {
            "path": CORE._repo_relative(summary_path),
            **CORE._failure_envelope(summary_error),
        }
    try:
        CORE._write_secure_json(
            run_dir / "failure-summary.json",
            {
                "schemaVersion": REPORT_SCHEMA_VERSION,
                "reportType": REPORT_TYPE,
                "status": "failed",
                "finalStatusAuthority": True,
                "supersedesSummary": supersedes_summary,
                "runId": run_id,
                "generatedAtUtc": _utc_now().isoformat().replace("+00:00", "Z"),
                **CORE._failure_envelope(error),
                "evidenceDirectoryPreserved": True,
                "qaLaneReceipts": lane_receipts,
                "qaLaneReceiptReadErrors": lane_receipt_read_errors,
                "sha256Manifest": {
                    "path": CORE._repo_relative(run_dir / "SHA256SUMS"),
                    "writeAttemptedAfterSummary": True,
                    "successNotClaimedByFailureSummary": True,
                },
            },
            exclusive=True,
        )
    except BaseException:
        return False
    return True


def _record(args: argparse.Namespace) -> Path:
    if Path.cwd().resolve() != REPO_ROOT:
        raise FirebudV2RecordingError(f"必须从仓库根执行：cd {REPO_ROOT}")
    if not GODOT_PROJECT.is_dir():
        raise FirebudV2RecordingError(f"Godot 项目不存在：{GODOT_PROJECT}")
    run_id = args.run_id or _new_run_id()
    if SAFE_RUN_ID.fullmatch(run_id) is None:
        raise FirebudV2RecordingError(f"不安全的 runId：{run_id!r}")
    try:
        output_root = CORE._resolve_output_root(args.output_root)
    except CORE.PetManagementRecordingError as error:
        raise FirebudV2RecordingError(str(error)) from error
    output_root.mkdir(parents=True, exist_ok=True)
    run_dir = output_root / run_id
    run_dir.mkdir(parents=False, exist_ok=False)
    try:
        return _record_into(args=args, run_id=run_id, run_dir=run_dir)
    except BaseException as error:
        failure_summary_written = _write_failure_summary(
            run_dir,
            run_id=run_id,
            error=error,
        )
        if failure_summary_written:
            try:
                retained = sorted(
                    (
                        path
                        for path in run_dir.rglob("*")
                        if path.is_file()
                        and path.name != "SHA256SUMS"
                        and path.relative_to(run_dir).parts[0] != "tmp"
                    ),
                    key=lambda path: str(path.relative_to(run_dir)),
                )
                if retained:
                    CORE._write_sha256_manifest(run_dir, retained)
            except BaseException:
                pass
        else:
            try:
                (run_dir / "SHA256SUMS").unlink()
            except FileNotFoundError:
                pass
            except BaseException:
                pass
        raise


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "录制受支持地图候选的真实 Main.tscn 1280x720、30fps、1×验收片；"
            "固定覆盖 bundle 全部地图的 idle 与真实跨帧鼠标移动。此工具拒绝登录、"
            "服务器和任意附加 Godot 参数。"
        )
    )
    parser.add_argument(
        "--bundle-id",
        choices=tuple(RECORDER_CONFIGS),
        default="firebud_region_visual_v2",
    )
    parser.add_argument("--run-id", help="可选的唯一安全 runId。")
    parser.add_argument("--output-root", type=Path)
    parser.add_argument("--sample-count", type=int, default=DEFAULT_SAMPLE_COUNT)
    parser.add_argument("--godot", default=os.environ.get("GODOT_BIN", "godot"))
    parser.add_argument("--ffmpeg", default=os.environ.get("FFMPEG_BIN", "ffmpeg"))
    parser.add_argument("--ffprobe", default=os.environ.get("FFPROBE_BIN", "ffprobe"))
    parser.add_argument("--timeout-seconds", type=float, default=600.0)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        _activate_bundle(args.bundle_id)
        if args.output_root is None:
            args.output_root = DEFAULT_OUTPUT_ROOT
        _record(args)
    except KeyboardInterrupt:
        print("map visual owner review interrupted", file=sys.stderr)
        return 130
    except (FirebudV2RecordingError, CORE.PetManagementRecordingError, FileExistsError, OSError, ValueError) as error:
        print(f"map visual owner review recording failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
