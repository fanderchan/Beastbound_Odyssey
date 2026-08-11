#!/usr/bin/env python3
"""Record the closed fusion presentation from the real ``Main.tscn``.

The recorder uses the owner-attested automation QA user-data lane, runs the
same Main-hosted flow once natively and once through Godot MovieWriter, and
publishes only after the closed-release verifier, formal portrait contracts,
Godot reports, video/audio streams, full decode, screenshots, and lane cleanup
all pass.  It never opens the normal player entry or executes the second
fusion confirmation.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import importlib.util
import json
import math
import os
from pathlib import Path
import re
import sys
from typing import Any, Mapping, Sequence
import uuid


REPO_ROOT = Path(__file__).resolve().parents[1]
GODOT_PROJECT = REPO_ROOT / "client" / "godot"
MAIN_SCENE = "res://scenes/Main.tscn"
MAIN_SCRIPT_PATH = GODOT_PROJECT / "scripts" / "main.gd"
CAPTURE_HELPER_PATH = (
    GODOT_PROJECT
    / "scripts"
    / "qa"
    / "pet_fusion_main_owner_review_capture.gd"
)
PANEL_FLOW_PATH = (
    GODOT_PROJECT / "scripts" / "ui" / "panel_flow_coordinator.gd"
)
MEDIA_CORE_PATH = REPO_ROOT / "tools" / "record_pet_management_owner_review.py"
FUSION_CORE_PATH = REPO_ROOT / "tools" / "record_pet_fusion_closed_review.py"
CAPTURE_FLAG = "--auto-pet-fusion-main-owner-review-capture"
REPORT_ARG_PREFIX = "--pet-fusion-main-owner-review-report="
DEFAULT_OUTPUT_ROOT = Path(
    ".run/evidence/phase407_pet_fusion_main_owner_review"
)

REPORT_SCHEMA_VERSION = 1
REPORT_TYPE = "beastbound_pet_fusion_main_owner_review_video"
GODOT_REPORT_TYPE = "beastbound.pet_fusion_main_owner_review_capture"
EXPECTED_WIDTH = 1280
EXPECTED_HEIGHT = 720
EXPECTED_FPS = 30
EXPECTED_VIDEO_CODEC = "h264"
EXPECTED_PIXEL_FORMAT = "yuv420p"
EXPECTED_AUDIO_CODEC = "aac"
EXPECTED_AUDIO_SAMPLE_RATE = 48000
EXPECTED_AUDIO_CHANNELS = 2
MIN_DURATION_SECONDS = 30.0
MAX_DURATION_SECONDS = 32.5
SAFE_RUN_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")
START_MARKER = "PET_FUSION_MAIN_OWNER_REVIEW_START"
CHAPTER_MARKER = "PET_FUSION_MAIN_OWNER_REVIEW_CHAPTER"
STATE_MARKER = "PET_FUSION_MAIN_OWNER_REVIEW_STATE"
END_MARKER = "PET_FUSION_MAIN_OWNER_REVIEW_END"
FAILURE_MARKER = "PET_FUSION_MAIN_OWNER_REVIEW_FAILED"
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
SAMPLE_TIMES = (2.0, 7.0, 12.6, 18.5, 24.1, 29.0)
KNOWN_MAIN_WARNING = (
    "WARNING: Nodes with non-equal opposite anchors will have their size "
    "overridden after _ready()."
)
class FusionMainRecordingError(RuntimeError):
    """The formal Main-hosted fusion capture contract was not met."""


def _load_module(path: Path, name: str) -> Any:
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"无法加载录制依赖：{path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


MEDIA = _load_module(MEDIA_CORE_PATH, "_beastbound_fusion_main_media_core")
FUSION = _load_module(FUSION_CORE_PATH, "_beastbound_fusion_closed_core")


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _new_run_id() -> str:
    stamp = _utc_now().strftime("%Y%m%dT%H%M%S.%fZ")
    return f"phase407-{stamp}-{uuid.uuid4().hex[:8]}"


def _read_text(path: Path, *, label: str) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except (OSError, UnicodeError) as error:
        raise FusionMainRecordingError(f"无法读取{label}：{path}") from error


def _require_main_hosted_capture_wiring(
    *,
    main_source: str | None = None,
    capture_source: str | None = None,
    panel_flow_source: str | None = None,
) -> None:
    main_text = (
        main_source
        if main_source is not None
        else _read_text(MAIN_SCRIPT_PATH, label="Main 脚本")
    )
    capture_text = (
        capture_source
        if capture_source is not None
        else _read_text(CAPTURE_HELPER_PATH, label="融合 Main 验收 helper")
    )
    coordinator_text = (
        panel_flow_source
        if panel_flow_source is not None
        else _read_text(PANEL_FLOW_PATH, label="面板协调器")
    )

    def require_count(source: str, fragment: str, count: int = 1) -> None:
        if source.count(fragment) != count:
            raise FusionMainRecordingError(
                f"融合 Main-hosted 接线不精确：{fragment}"
            )

    if not capture_text.startswith("extends RefCounted\n"):
        raise FusionMainRecordingError("融合 Main 验收 helper 必须是 RefCounted")
    for forbidden in (
        "extends SceneTree",
        'preload("res://scenes/Main.tscn")',
        "runtimeEnabled\"] = true",
        "PetFusionClientModel.pet_fusion_request",
        "const ServerAuthClientModel := preload",
    ):
        if forbidden in capture_text:
            raise FusionMainRecordingError(
                f"融合 Main 验收 helper 越过关闭边界：{forbidden}"
            )
    require_count(capture_text, f'const CAPTURE_FLAG := "{CAPTURE_FLAG}"')
    require_count(
        capture_text,
        f'const REPORT_ARG_PREFIX := "{REPORT_ARG_PREFIX}"',
    )
    require_count(capture_text, "_tree.current_scene != _host", 2)
    require_count(
        capture_text,
        'str(_host.scene_file_path) != "res://scenes/Main.tscn"',
        2,
    )
    require_count(
        capture_text,
        "PetFusionRecipeCatalogModel.runtime_available(_production_catalog)",
        3,
    )
    for fragment in (
        "_host.profile_save_enabled = false",
        "_host.current_account_session = {}",
        "request.cancel_request()",
        "Input.parse_input_event(press)",
        "Input.parse_input_event(release)",
        '"playerEntryOpened": false',
        '"ownerReviewStatus": "pending"',
        '"portraitOwnerReviewStatus": "owner_review_pending"',
        "_second_confirmation_total() > 0",
    ):
        require_count(capture_text, fragment)

    preload_block = (
        "const PetFusionMainOwnerReviewCapture := preload(\n"
        '\t"res://scripts/qa/pet_fusion_main_owner_review_capture.gd"\n'
        ")"
    )
    require_count(main_text, preload_block)
    require_count(main_text, "if pet_fusion_main_owner_review_capture:", 2)
    for fragment in (
        "var pet_fusion_main_owner_review_capture: bool = false",
        "pet_fusion_main_owner_review_capture = false",
        "elif PetFusionMainOwnerReviewCapture.is_flag(arg):",
        "pet_fusion_main_owner_review_capture = true",
        "or pet_fusion_main_owner_review_capture",
        "and not pet_fusion_main_owner_review_capture",
        "elif pet_fusion_main_owner_review_capture:",
        'call_deferred("_run_pet_fusion_main_owner_review_capture")',
        "func _run_pet_fusion_main_owner_review_capture() -> void:",
        "await PetFusionMainOwnerReviewCapture.new(self).run()",
    ):
        require_count(main_text, fragment)
    if "pet_fusion_panel.gd" in main_text or "pet_fusion_panel.gd" in coordinator_text:
        raise FusionMainRecordingError(
            "融合面板不得直接接入 Main 或正常玩家 PanelFlowCoordinator"
        )


def _build_godot_command(
    *,
    godot: str,
    report_path: Path,
    avi_path: Path | None,
) -> list[str]:
    command = [
        godot,
        "--path",
        str(GODOT_PROJECT),
        "--windowed",
        "--resolution",
        f"{EXPECTED_WIDTH}x{EXPECTED_HEIGHT}",
        "--single-window",
        "--fixed-fps",
        str(EXPECTED_FPS),
        "--time-scale",
        "1.0",
        "--disable-vsync",
    ]
    if avi_path is not None:
        command.extend(["--write-movie", str(avi_path)])
    command.extend(
        [
            "--scene",
            MAIN_SCENE,
            "--",
            f"--qa-viewport={EXPECTED_WIDTH}x{EXPECTED_HEIGHT}",
            CAPTURE_FLAG,
            f"{REPORT_ARG_PREFIX}{report_path}",
            MEDIA.QA_LANE_ARGUMENT,
        ]
    )
    report_argument = f"{REPORT_ARG_PREFIX}{report_path}"
    if (
        command.count(CAPTURE_FLAG) != 1
        or command.count(report_argument) != 1
        or command.count(MEDIA.QA_LANE_ARGUMENT) != 1
        or "--script" in command
        or "--user-data-dir" in command
        or (avi_path is None and "--write-movie" in command)
        or (avi_path is not None and command.count("--write-movie") != 1)
    ):
        raise FusionMainRecordingError("Godot 融合 Main 录像命令边界不精确")
    return command


def _validate_godot_report(value: Mapping[str, Any]) -> dict[str, Any]:
    errors: list[str] = []
    exact_values = {
        "schemaVersion": 1,
        "reportType": GODOT_REPORT_TYPE,
        "result": "PASS",
        "scene": MAIN_SCENE,
        "entryMode": "MainSceneFlag",
        "realMainSceneInstantiated": True,
        "qaOnlyMainOverlay": True,
        "captureFps": EXPECTED_FPS,
        "playbackSpeed": 1.0,
        "expectedChapterFrameCount": 900,
        "renderedChapterFrameCount": 900,
        "actualLeftClicks": 2,
        "pressFrames": 2,
        "productionRuntimeEnabled": False,
        "playerEntryOpened": False,
        "formalPortraitsRequired": True,
        "secondConfirmationExecuted": False,
        "networkRequestCount": 0,
        "profileSaveEnabled": False,
        "accountSessionPresent": False,
        "backendConnected": False,
        "qaLane": "automation",
        "qaLaneFeaturePresent": True,
        "portraitOwnerReviewStatus": "owner_review_pending",
        "ownerReviewStatus": "pending",
    }
    for key, expected in exact_values.items():
        if value.get(key) != expected:
            errors.append(key)
    if value.get("viewport") != {
        "width": EXPECTED_WIDTH,
        "height": EXPECTED_HEIGHT,
    }:
        errors.append("viewport")
    if str(value.get("displayServer", "")).lower() != "macos":
        errors.append("displayServer")
    if value.get("window") != {
        "mode": 0,
        "modeName": "windowed",
        "visible": True,
        "width": EXPECTED_WIDTH,
        "height": EXPECTED_HEIGHT,
    }:
        errors.append("window")
    transition_frames = value.get("transitionFrameCount")
    if type(transition_frames) is not int or transition_frames < 7:
        errors.append("transitionFrameCount")
    actual_root = value.get("actualUserDataRoot")
    expected_root = value.get("expectedUserDataRoot")
    if (
        not isinstance(actual_root, str)
        or not isinstance(expected_root, str)
        or actual_root == ""
        or actual_root != expected_root
    ):
        errors.append("userDataRoot")
    if value.get("errors") != []:
        errors.append("errors")

    chapters = value.get("chapters")
    if not isinstance(chapters, list) or len(chapters) != len(EXPECTED_CHAPTERS):
        errors.append("chapters")
        chapters = []
    cursor = 0
    for index, expected in enumerate(EXPECTED_CHAPTERS):
        if index >= len(chapters) or not isinstance(chapters[index], dict):
            continue
        chapter = chapters[index]
        chapter_id, state, route, frame_count = expected
        end = cursor + frame_count
        expected_fields = {
            "id": chapter_id,
            "state": state,
            "route": route,
            "startFrame": cursor,
            "endFrameExclusive": end,
            "frameCount": frame_count,
            "errors": [],
        }
        for key, expected_value in expected_fields.items():
            if chapter.get(key) != expected_value:
                errors.append(f"chapters[{index}].{key}")
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
            for key, expected_value in (
                ("closed", True),
                ("confirmDisabled", True),
                ("targetName", ""),
                ("targetFormId", ""),
                ("targetPortraitResourcePath", ""),
            ):
                if snapshot.get(key) != expected_value:
                    errors.append(f"chapters[{index}].{key}")
        else:
            target = EXPECTED_ROUTE_TARGETS[route]
            target_form = str(target["formId"])
            expected_portrait = (
                f"res://assets/pets/{target_form}/portrait/default.png"
            )
            expected_armed = state == "armed"
            for key, expected_value in (
                ("closed", False),
                ("quoteValid", True),
                ("targetName", target["name"]),
                ("targetFormId", target_form),
                ("targetPortraitResourcePath", expected_portrait),
                ("targetPortraitStatus", "formal"),
                ("candidatePlaceholderCount", 0),
                ("candidateFormalPortraitCount", 5),
                ("confirmationArmed", expected_armed),
                ("confirmDisabled", False),
            ):
                if snapshot.get(key) != expected_value:
                    errors.append(f"chapters[{index}].{key}")
        cursor = end
    if cursor != 900:
        errors.append("chapterFrameSum")
    if errors:
        raise FusionMainRecordingError(
            "Godot 融合 Main 验收报告未通过：" + "；".join(errors)
        )
    return dict(value)


def _read_godot_report(path: Path) -> dict[str, Any]:
    return _validate_godot_report(
        FUSION._read_json(path, label="Godot 融合 Main 验收报告")
    )


def _validate_godot_log(
    path: Path,
    *,
    report_path: Path,
    movie_mode: bool,
) -> dict[str, Any]:
    text = path.read_text(encoding="utf-8", errors="replace")
    if FAILURE_MARKER in text:
        failure_lines = [
            line for line in text.splitlines() if FAILURE_MARKER in line
        ]
        raise FusionMainRecordingError(
            "Godot 融合 Main 验收报告失败：" + " | ".join(failure_lines)
        )
    forbidden = (
        "SCRIPT ERROR:",
        "Parse Error:",
        "ERROR:",
        "ObjectDB instances were leaked",
        "resources still in use at exit",
        "Orphan StringName",
    )
    found = [token for token in forbidden if token in text]
    if found:
        raise FusionMainRecordingError(
            "Godot 融合 Main 日志存在错误或泄漏：" + ", ".join(found)
        )
    warning_lines = [
        line.strip()
        for line in text.splitlines()
        if line.strip().startswith("WARNING:")
    ]
    unexpected_warnings = [
        line
        for line in warning_lines
        if line != KNOWN_MAIN_WARNING
    ]
    if unexpected_warnings or warning_lines.count(KNOWN_MAIN_WARNING) > 1:
        raise FusionMainRecordingError(
            "Godot 融合 Main 日志出现非基线警告："
            + " | ".join(unexpected_warnings or warning_lines)
        )
    if "Metal 4.0 - Forward Mobile" not in text:
        raise FusionMainRecordingError("Godot 融合 Main 验收没有使用 Metal")
    movie_marker = (
        "Movie Maker mode enabled, recording movie in "
        "1280×720 @ 30 FPS"
    )
    if movie_mode and movie_marker not in text:
        raise FusionMainRecordingError("Godot 没有确认 1280x720@30 MovieWriter")
    if not movie_mode and movie_marker in text:
        raise FusionMainRecordingError("native 预检错误启用了 MovieWriter")

    lines = text.splitlines()

    def unique_marker(marker: str) -> str:
        matches = [line for line in lines if line.startswith(marker)]
        if len(matches) != 1:
            raise FusionMainRecordingError(
                f"Godot 融合 Main 标记必须列零且唯一：{marker}"
            )
        return matches[0]

    start_line = unique_marker(START_MARKER)
    expected_start = (
        START_MARKER
        + " scene=Main.tscn entry=MainSceneFlag viewport=1280x720 "
        + "fps=30 speed=1.00x profile=isolated backend=false "
        + "profile_save=false production_runtime=false player_entry=false "
        + "owner_review_status=pending"
    )
    if start_line != expected_start:
        raise FusionMainRecordingError("Godot 融合 Main START 标记不精确")
    chapter_pattern = re.compile(
        rf"{re.escape(CHAPTER_MARKER)} chapter=([A-Za-z0-9_.-]+) "
        r"frame=(\d+) seconds=([0-9.]+) speed=1\.00x "
        r"state=(closed|preview|armed) route=(solar|moss)"
    )
    chapter_lines = [line for line in lines if line.startswith(CHAPTER_MARKER)]
    matches = [chapter_pattern.fullmatch(line) for line in chapter_lines]
    if len(matches) != len(EXPECTED_CHAPTERS) or any(
        match is None for match in matches
    ):
        raise FusionMainRecordingError("Godot 融合 Main 章节标记不完整")
    chapters: list[dict[str, Any]] = []
    for match, expected in zip(matches, EXPECTED_CHAPTERS):
        assert match is not None
        chapter_id, state, route, frame_count = expected
        if (
            match.group(1) != chapter_id
            or int(match.group(2)) != frame_count
            or not math.isclose(
                float(match.group(3)),
                frame_count / EXPECTED_FPS,
                abs_tol=0.0005,
            )
            or match.group(4) != state
            or match.group(5) != route
        ):
            raise FusionMainRecordingError(
                f"Godot 融合 Main 章节标记错误：{chapter_id}"
            )
        chapters.append(
            {
                "id": chapter_id,
                "state": state,
                "route": route,
                "frameCount": frame_count,
                "durationSeconds": frame_count / EXPECTED_FPS,
            }
        )
    state_line = unique_marker(STATE_MARKER)
    state_pattern = re.compile(
        rf"{re.escape(STATE_MARKER)} main_host=true qa_lane=true "
        r"profile_isolated=true formal_portraits=true placeholders=0 "
        r"layout_valid=true no_player_qa_text=true production_runtime=false "
        r"player_entry=false network_requests=0 second_confirmations=0 "
        r"actual_left_clicks=(\d+) press_frames=(\d+) "
        r"chapter_frames=(\d+) transition_frames=(\d+)"
    )
    state_match = state_pattern.fullmatch(state_line)
    if state_match is None:
        raise FusionMainRecordingError("Godot 融合 Main STATE 标记不精确")
    clicks, press_frames, chapter_frames, transition_frames = (
        int(value) for value in state_match.groups()
    )
    if (
        clicks != 2
        or press_frames != clicks
        or chapter_frames != 900
        or transition_frames < 7
    ):
        raise FusionMainRecordingError("Godot 融合 Main 交互或帧证据不完整")
    end_line = unique_marker(END_MARKER)
    expected_end = (
        END_MARKER
        + " completed=true speed=1.00x profile=isolated backend=false "
        + "owner_review_status=pending"
    )
    if end_line != expected_end:
        raise FusionMainRecordingError("Godot 融合 Main END 标记不精确")
    report = _read_godot_report(report_path)
    return {
        "status": "passed",
        "movieMode": movie_mode,
        "renderer": "Metal 4.0 - Forward Mobile",
        "movieWriter": "1280x720@30fps" if movie_mode else None,
        "knownMainWarningCount": warning_lines.count(KNOWN_MAIN_WARNING),
        "chapters": chapters,
        "actualLeftClicks": clicks,
        "pressFrames": press_frames,
        "chapterFrameCount": chapter_frames,
        "transitionFrameCount": transition_frames,
        "godotReport": report,
    }


def _validate_probe(probe: dict[str, Any]) -> dict[str, Any]:
    try:
        metadata = MEDIA._validate_probe(probe)
    except MEDIA.PetManagementRecordingError as error:
        raise FusionMainRecordingError(str(error)) from error
    duration = float(metadata.get("durationSeconds", -1.0))
    if (
        not math.isfinite(duration)
        or duration < MIN_DURATION_SECONDS
        or duration > MAX_DURATION_SECONDS
    ):
        raise FusionMainRecordingError(
            "融合 Main 验收视频时长必须在 "
            f"{MIN_DURATION_SECONDS:.1f}-{MAX_DURATION_SECONDS:.1f} 秒，"
            f"实际 {duration:.3f} 秒"
        )
    minimum_frames = int(math.floor(duration * EXPECTED_FPS) - 2)
    maximum_frames = int(math.ceil(duration * EXPECTED_FPS) + 2)
    frame_count = int(metadata.get("frameCount", -1))
    if frame_count < minimum_frames or frame_count > maximum_frames:
        raise FusionMainRecordingError("融合 Main 视频帧数与 30fps 时长不一致")
    streams = probe.get("streams", [])
    audio = next(
        (
            value
            for value in streams
            if isinstance(value, dict) and value.get("codec_type") == "audio"
        ),
        {},
    )
    if (
        str(audio.get("sample_rate", "")) != str(EXPECTED_AUDIO_SAMPLE_RATE)
        or int(audio.get("channels", -1)) != EXPECTED_AUDIO_CHANNELS
    ):
        raise FusionMainRecordingError("融合 Main 音频必须为 48kHz 双声道")
    metadata["audioSampleRate"] = EXPECTED_AUDIO_SAMPLE_RATE
    metadata["audioChannels"] = EXPECTED_AUDIO_CHANNELS
    return metadata


def _validate_audible_audio(
    *,
    ffmpeg: str,
    video_path: Path,
    log_path: Path,
    timeout_seconds: float,
    environment: Mapping[str, str],
) -> dict[str, float | str]:
    MEDIA._run_logged(
        [
            ffmpeg,
            "-v",
            "info",
            "-i",
            str(video_path),
            "-map",
            "0:a:0",
            "-af",
            "volumedetect",
            "-f",
            "null",
            "-",
        ],
        log_path=log_path,
        timeout_seconds=timeout_seconds,
        environment=environment,
    )
    text = log_path.read_text(encoding="utf-8", errors="replace")
    mean_match = re.search(r"mean_volume:\s*(-?(?:[0-9.]+|inf))\s+dB", text)
    max_match = re.search(r"max_volume:\s*(-?(?:[0-9.]+|inf))\s+dB", text)
    if mean_match is None or max_match is None:
        raise FusionMainRecordingError("无法读取融合 Main 验收音轨响度")
    mean_text = mean_match.group(1)
    max_text = max_match.group(1)
    if "inf" in mean_text.lower() or "inf" in max_text.lower():
        raise FusionMainRecordingError("融合 Main 验收音轨为静音")
    mean_db = float(mean_text)
    max_db = float(max_text)
    if not math.isfinite(max_db) or max_db < -55.0:
        raise FusionMainRecordingError("融合 Main 验收音轨不可听")
    return {
        "status": "passed",
        "meanVolumeDb": mean_db,
        "maxVolumeDb": max_db,
    }


def _preflight(
    args: argparse.Namespace,
) -> tuple[dict[str, str], dict[str, Any], list[dict[str, Any]]]:
    timeout_seconds = float(args.timeout_seconds)
    if not math.isfinite(timeout_seconds) or timeout_seconds <= 0:
        raise FusionMainRecordingError("--timeout-seconds 必须大于 0")
    if Path.cwd().resolve() != REPO_ROOT:
        raise FusionMainRecordingError(f"必须从仓库根执行：cd {REPO_ROOT}")
    _require_main_hosted_capture_wiring()
    executables = {
        "godot": MEDIA._require_executable(args.godot, label="Godot"),
        "ffmpeg": MEDIA._require_executable(args.ffmpeg, label="ffmpeg"),
        "ffprobe": MEDIA._require_executable(args.ffprobe, label="ffprobe"),
        "python": MEDIA._require_executable(args.python, label="Python"),
    }
    release_report = FUSION._run_release_verifier(
        python=executables["python"],
        timeout_seconds=timeout_seconds,
    )
    portraits = FUSION._portrait_readiness()
    return executables, release_report, portraits


def _record_into(
    *,
    args: argparse.Namespace,
    run_id: str,
    run_dir: Path,
    executables: Mapping[str, str],
    release_before: dict[str, Any],
    portraits_before: list[dict[str, Any]],
) -> Path:
    timeout_seconds = float(args.timeout_seconds)
    temporary_dir = run_dir / "tmp"
    temporary_dir.mkdir(parents=False, exist_ok=False)
    base_environment = MEDIA._isolated_environment(temporary_dir)
    native_report_path = run_dir / "godot-native-report.json"
    movie_report_path = run_dir / "godot-movie-report.json"
    raw_avi_path = run_dir / "pet-fusion-main-owner-review-raw.avi"
    candidate_path = run_dir / ".pet-fusion-main-owner-review-candidate.mp4"
    final_video_path = run_dir / "pet-fusion-main-owner-review-1x.mp4"
    native_log = run_dir / "godot-native.log"
    movie_log = run_dir / "godot-movie.log"
    native_command = _build_godot_command(
        godot=executables["godot"],
        report_path=native_report_path,
        avi_path=None,
    )
    movie_command = _build_godot_command(
        godot=executables["godot"],
        report_path=movie_report_path,
        avi_path=raw_avi_path,
    )
    lane_evidence = MEDIA._run_official_lane_godot_sequence(
        run_dir=run_dir,
        godot=executables["godot"],
        base_environment=base_environment,
        native_command=native_command,
        movie_command=movie_command,
        native_log=native_log,
        movie_log=movie_log,
        timeout_seconds=timeout_seconds,
        native_log_validator=lambda path: _validate_godot_log(
            path,
            report_path=native_report_path,
            movie_mode=False,
        ),
        movie_log_validator=lambda path: _validate_godot_log(
            path,
            report_path=movie_report_path,
            movie_mode=True,
        ),
    )
    environment = lane_evidence["environment"]
    native_result = lane_evidence["native"]["logValidation"]
    movie_result = lane_evidence["movie"]["logValidation"]
    raw_record = MEDIA._artifact_record(raw_avi_path)

    transcode_log = run_dir / "ffmpeg-transcode.log"
    MEDIA._run_logged(
        [
            executables["ffmpeg"],
            "-y",
            "-v",
            "warning",
            "-i",
            str(raw_avi_path),
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
            str(EXPECTED_AUDIO_SAMPLE_RATE),
            "-ac",
            str(EXPECTED_AUDIO_CHANNELS),
            "-map_metadata",
            "-1",
            "-movflags",
            "+faststart",
            str(candidate_path),
        ],
        log_path=transcode_log,
        timeout_seconds=timeout_seconds,
        environment=environment,
    )
    probe_path = run_dir / "ffprobe.json"
    probe = MEDIA._write_probe(executables["ffprobe"], candidate_path, probe_path)
    media = _validate_probe(probe)
    decode_log = run_dir / "full-audio-video-decode.log"
    MEDIA._run_logged(
        [
            executables["ffmpeg"],
            "-v",
            "error",
            "-xerror",
            "-i",
            str(candidate_path),
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
    loudness_log = run_dir / "audio-loudness.log"
    audible_audio = _validate_audible_audio(
        ffmpeg=executables["ffmpeg"],
        video_path=candidate_path,
        log_path=loudness_log,
        timeout_seconds=timeout_seconds,
        environment=environment,
    )
    keyframes = MEDIA._extract_review_frames(
        ffmpeg=executables["ffmpeg"],
        video_path=candidate_path,
        screenshots_dir=run_dir / "keyframes",
        sample_times=SAMPLE_TIMES,
        timeout_seconds=timeout_seconds,
    )
    contact = MEDIA._build_contact_sheet(
        ffmpeg=executables["ffmpeg"],
        screenshots_dir=run_dir / "keyframes",
        output_path=run_dir / "contact-sheet.png",
        sample_count=len(SAMPLE_TIMES),
        timeout_seconds=timeout_seconds,
    )

    release_after = FUSION._run_release_verifier(
        python=executables["python"],
        timeout_seconds=timeout_seconds,
    )
    portraits_after = FUSION._portrait_readiness()
    if FUSION._json_sha256(release_after) != FUSION._json_sha256(release_before):
        raise FusionMainRecordingError("录像期间融合关闭发布报告发生变化")
    if FUSION._json_sha256(portraits_after) != FUSION._json_sha256(
        portraits_before
    ):
        raise FusionMainRecordingError("录像期间正式 portrait 证据发生变化")
    release_before_path = run_dir / "release-verifier-before.json"
    release_after_path = run_dir / "release-verifier-after.json"
    portrait_path = run_dir / "portrait-preflight.json"
    MEDIA._write_json(release_before_path, release_before)
    MEDIA._write_json(release_after_path, release_after)
    MEDIA._write_json(
        portrait_path,
        {
            "status": "PASS",
            "ownerApprovalGranted": False,
            "portraits": portraits_after,
        },
    )

    candidate_record = MEDIA._artifact_record(candidate_path)
    candidate_path.replace(final_video_path)
    video = {
        **candidate_record,
        "path": MEDIA._repo_relative(final_video_path),
        **media,
        "playbackSpeed": 1.0,
        "decodeStatus": "passed",
        "audibleAudio": audible_audio,
    }
    # The raw MovieWriter AVI is a multi-gigabyte transient.  Preserve its
    # size/hash in the report, but retain only the fully decoded and validated
    # H.264/AAC review artifact and its visual evidence.
    raw_avi_path.unlink()
    raw_record["retained"] = False
    raw_record["retentionPolicy"] = "validated_transient_removed"

    metadata_path = run_dir / "metadata.json"
    metadata = {
        "schemaVersion": REPORT_SCHEMA_VERSION,
        "reportType": REPORT_TYPE,
        "scene": MAIN_SCENE,
        "captureFlag": CAPTURE_FLAG,
        "entryMode": "MainSceneFlag",
        "realMainSceneInstantiated": True,
        "qaOnlyMainOverlay": True,
        "viewport": {"width": EXPECTED_WIDTH, "height": EXPECTED_HEIGHT},
        "fps": EXPECTED_FPS,
        "playbackSpeed": 1.0,
        "videoCodec": EXPECTED_VIDEO_CODEC,
        "pixelFormat": EXPECTED_PIXEL_FORMAT,
        "audioCodec": EXPECTED_AUDIO_CODEC,
        "audioSampleRate": media["audioSampleRate"],
        "audioChannels": media["audioChannels"],
        "audibleAudio": audible_audio,
        "durationSeconds": media["durationSeconds"],
        "frameCount": media["frameCount"],
        "fullDecodeStatus": "passed",
        "nativeFlow": native_result,
        "movieFlow": movie_result,
        "productionRuntimeEnabled": False,
        "playerEntryOpened": False,
        "secondConfirmationExecuted": False,
        "portraitOwnerReviewStatus": "owner_review_pending",
        "ownerReviewStatus": "pending",
    }
    MEDIA._write_json(metadata_path, metadata)

    summary = {
        "schemaVersion": REPORT_SCHEMA_VERSION,
        "reportType": REPORT_TYPE,
        "status": "passed",
        "finalStatusAuthority": True,
        "finalStatusAuthorityRequires": {
            "artifact": MEDIA._repo_relative(run_dir / "SHA256SUMS"),
            "writtenAfterSummary": True,
            "coversThisSummary": True,
            "failureSummaryAbsent": True,
        },
        "runId": run_id,
        "generatedAtUtc": _utc_now().isoformat().replace("+00:00", "Z"),
        "scene": MAIN_SCENE,
        "captureFlag": CAPTURE_FLAG,
        "captureContract": {
            "normalMainScene": True,
            "mainSceneFlagDispatch": True,
            "qaOnlyOverlay": True,
            "normalPlayerEntryUsed": False,
            "width": EXPECTED_WIDTH,
            "height": EXPECTED_HEIGHT,
            "fps": EXPECTED_FPS,
            "playbackSpeed": 1.0,
            "durationRangeSeconds": [
                MIN_DURATION_SECONDS,
                MAX_DURATION_SECONDS,
            ],
            "audioRequired": True,
            "audibleAudioRequired": True,
            "realLeftClicksRequired": 2,
            "secondConfirmationAllowed": False,
            "networkRequestsAllowed": False,
            "serverWritesAllowed": False,
            "productionRuntimeAllowed": False,
        },
        "isolation": {
            "laneFreshAtRecorderStart": True,
            "normalPlayerSavePathUsed": False,
            "containmentScope": MEDIA.CONTAINMENT_SCOPE,
            "qaLane": {
                "lane": MEDIA.QA_LANE,
                "owner": lane_evidence["session"]["owner"],
                "feature": MEDIA.QA_LANE_FEATURE,
                "customUserDirName": MEDIA.QA_LANE_CUSTOM_USER_DIR_NAME,
                "laneRoot": lane_evidence["session"]["godotLaneRoot"],
                "realRoot": lane_evidence["session"]["godotRealRoot"],
                "realBeforeSha256": lane_evidence["session"][
                    "realInventorySha256"
                ],
            },
            "temporaryDirectory": MEDIA._repo_relative(temporary_dir),
            "backendProcessStartedByTool": False,
            "mysqlAccessByTool": False,
        },
        "tools": {
            "godot": lane_evidence["preflight"]["version"]["normalizedVersion"],
            "ffmpeg": MEDIA._capture_version(executables["ffmpeg"], ["-version"]),
            "ffprobe": MEDIA._capture_version(
                executables["ffprobe"], ["-version"]
            ),
            "python": sys.version.splitlines()[0],
        },
        "commands": {
            "native": MEDIA._redacted_command(native_command),
            "movie30": MEDIA._redacted_command(movie_command),
        },
        "preflight": lane_evidence["preflight"],
        "sourceCheck": lane_evidence["sourceCheck"],
        "initialVerification": lane_evidence["initialVerification"],
        "nativeProcess": lane_evidence["native"]["process"],
        "nativeAttestation": lane_evidence["native"]["attestation"],
        "nativePostVerify": lane_evidence["native"]["postVerify"],
        "movieProcess": lane_evidence["movie"]["process"],
        "movieAttestation": lane_evidence["movie"]["attestation"],
        "moviePostVerify": lane_evidence["movie"]["postVerify"],
        "qaLaneCleanup": lane_evidence["cleanup"],
        "postCleanupInspect": lane_evidence["postCleanupInspect"],
        "laneLifecycle": MEDIA._artifact_record(lane_evidence["lifecyclePath"]),
        "nativeFlow": native_result,
        "movieFlow": movie_result,
        "releaseVerifier": {
            "status": "PASS",
            "before": MEDIA._artifact_record(release_before_path),
            "after": MEDIA._artifact_record(release_after_path),
            "stableCanonicalSha256": FUSION._json_sha256(release_after),
        },
        "portraitPreflight": MEDIA._artifact_record(portrait_path),
        "rawMovie": raw_record,
        "video": video,
        "metadata": MEDIA._artifact_record(metadata_path),
        "probe": MEDIA._artifact_record(probe_path),
        "fullDecode": {
            "status": "passed",
            "videoStreamDecoded": True,
            "audioStreamDecoded": True,
            "log": MEDIA._artifact_record(decode_log),
        },
        "keyframes": keyframes,
        "contactSheet": contact,
        "sha256Manifest": {
            "path": MEDIA._repo_relative(run_dir / "SHA256SUMS"),
            "coversAllRetainedEvidenceFiles": True,
            "writtenLast": True,
        },
        "logs": {
            "native": MEDIA._artifact_record(native_log),
            "movie": MEDIA._artifact_record(movie_log),
            "transcode": MEDIA._artifact_record(transcode_log),
            "audioLoudness": MEDIA._artifact_record(loudness_log),
        },
        "productionRuntimeEnabled": False,
        "playerEntryOpened": False,
        "portraitOwnerReviewStatus": "owner_review_pending",
        "ownerReviewStatus": "pending",
        "claimLimit": (
            "real Main-hosted closed-state presentation evidence only; owner "
            "approval, release attestation, normal player entry, and runtime "
            "opening remain separate gates"
        ),
    }
    summary_path = run_dir / "summary.json"
    MEDIA._write_json(summary_path, summary)
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
    MEDIA._write_sha256_manifest(run_dir, hash_paths)
    print(
        json.dumps(
            {
                "status": "passed",
                "runId": run_id,
                "video": video["path"],
                "contactSheet": contact["path"],
                "summary": MEDIA._repo_relative(summary_path),
                "ownerReviewStatus": "pending",
            },
            ensure_ascii=False,
        ),
        flush=True,
    )
    return summary_path


def _write_failure_summary(
    run_dir: Path,
    *,
    run_id: str,
    error: BaseException,
) -> None:
    final_path = run_dir / "pet-fusion-main-owner-review-1x.mp4"
    quarantine_path = run_dir / ".failed-pet-fusion-main-owner-review.mp4"
    if final_path.is_file() and not quarantine_path.exists():
        try:
            final_path.replace(quarantine_path)
        except OSError:
            pass
    try:
        MEDIA._write_json(
            run_dir / "failure-summary.json",
            {
                "schemaVersion": REPORT_SCHEMA_VERSION,
                "reportType": REPORT_TYPE,
                "status": "failed",
                "runId": run_id,
                "generatedAtUtc": _utc_now().isoformat().replace("+00:00", "Z"),
                "errorType": type(error).__name__,
                "error": str(error) or type(error).__name__,
                "evidenceDirectoryPreserved": True,
                "validFinalAuthorityPresent": (run_dir / "SHA256SUMS").exists(),
                "finalNamedVideoPresent": final_path.exists(),
                "quarantinedVideoPresent": quarantine_path.exists(),
            },
        )
    except OSError:
        pass


def _record(args: argparse.Namespace) -> Path:
    executables, release_before, portraits_before = _preflight(args)
    run_id = args.run_id or _new_run_id()
    if SAFE_RUN_ID.fullmatch(run_id) is None:
        raise FusionMainRecordingError(f"不安全的 runId：{run_id!r}")
    output_root = MEDIA._resolve_output_root(args.output_root)
    output_root.mkdir(parents=True, exist_ok=True)
    run_dir = output_root / run_id
    run_dir.mkdir(parents=False, exist_ok=False)
    try:
        return _record_into(
            args=args,
            run_id=run_id,
            run_dir=run_dir,
            executables=executables,
            release_before=release_before,
            portraits_before=portraits_before,
        )
    except BaseException as error:
        _write_failure_summary(run_dir, run_id=run_id, error=error)
        raise


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "从真实 Main.tscn 与官方 automation QA lane 录制融合关闭态 "
            "1280x720、30fps、1.00x、有声项目所有者验收片。"
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
    parser.add_argument("--python", default=sys.executable)
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
        print("pet fusion Main owner review recording interrupted", file=sys.stderr)
        return 130
    except (
        FusionMainRecordingError,
        MEDIA.PetManagementRecordingError,
        FUSION.FusionReviewRecordingError,
        FileExistsError,
        OSError,
        ValueError,
    ) as error:
        print(
            f"pet fusion Main owner review recording failed: {error}",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
