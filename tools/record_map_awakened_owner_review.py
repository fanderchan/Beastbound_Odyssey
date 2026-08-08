#!/usr/bin/env python3
"""Record the Phase399 formal map flow through the real Main scene.

The recorder fails closed unless the dedicated capture is wired into
``Main.tscn``'s host.  It produces a fixed 1280x720 A/V review, sampled frames,
a contact sheet, a three-row reference-vs-implementation board, strict logs,
and a SHA256 manifest without starting a backend or touching MySQL.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import math
import os
import re
import shutil
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Sequence


REPO_ROOT = Path(__file__).resolve().parents[1]
CORE_PATH = REPO_ROOT / "tools" / "record_pet_management_owner_review.py"
CORE_SPEC = importlib.util.spec_from_file_location(
    "_beastbound_phase399_map_media_core",
    CORE_PATH,
)
if CORE_SPEC is None or CORE_SPEC.loader is None:
    raise RuntimeError(f"无法加载媒体录制核心：{CORE_PATH}")
CORE = importlib.util.module_from_spec(CORE_SPEC)
CORE_SPEC.loader.exec_module(CORE)

GODOT_PROJECT = REPO_ROOT / "client" / "godot"
MAIN_SCENE = "res://scenes/Main.tscn"
MAIN_SCRIPT_PATH = GODOT_PROJECT / "scripts" / "main.gd"
CAPTURE_SCRIPT = "res://scripts/qa/map_awakened_owner_review_capture.gd"
DEFAULT_CAPTURE_FLAG = "--map-awakened-owner-review-capture"
DEFAULT_OUTPUT_ROOT = Path(
    ".run/evidence/phase399_map_awakened_owner_review"
)
DEFAULT_REFERENCE_ROOT = (
    REPO_ROOT.parent
    / "Beastbound_Odyssey"
    / ".run"
    / "evidence"
    / "phase387_map_awakened_ui"
    / "reference"
)
REFERENCE_FILENAMES = (
    "02-local-map-overview.jpeg",
    "05-world-map-overview.jpeg",
    "06-world-map-region-zoom.jpeg",
)
COMPARISON_CHAPTERS = (
    "local_map_overview",
    "world_map_overview",
    "world_region_selected",
)
REPORT_SCHEMA_VERSION = 1
REPORT_TYPE = "beastbound_phase399_map_main_owner_review_video"
EXPECTED_WIDTH = 1280
EXPECTED_HEIGHT = 720
EXPECTED_FPS = 30
EXPECTED_VIDEO_CODEC = "h264"
EXPECTED_PIXEL_FORMAT = "yuv420p"
EXPECTED_AUDIO_CODEC = "aac"
EXPECTED_AUDIO_SAMPLE_RATE = 48000
EXPECTED_AUDIO_CHANNELS = 2
EXPECTED_WORLD_REGION_COUNT = 9
EXPECTED_LEFT_CLICKS = 6
MIN_DURATION_SECONDS = 20.0
MAX_DURATION_SECONDS = 30.0
DEFAULT_SAMPLE_COUNT = 12
MAX_SAMPLE_COUNT = 16
SAFE_RUN_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")
START_MARKER = "PHASE399_MAP_OWNER_REVIEW_START"
CHAPTER_MARKER = "PHASE399_MAP_OWNER_REVIEW_CHAPTER"
END_MARKER = "PHASE399_MAP_OWNER_REVIEW_END"
FAILURE_MARKER = "PHASE399_MAP_OWNER_REVIEW_FAILED"
EXPECTED_CHAPTERS = (
    ("world_hud_map_entry", 2.2),
    ("local_map_overview", 2.8),
    ("local_target_route_started", 2.3),
    ("world_map_overview", 2.9),
    ("world_region_selected", 2.7),
    ("cross_map_route_started", 2.5),
    ("panel_closed_hud_restored", 2.3),
    ("battle_map_entry_hidden", 3.0),
)


class Phase399MapRecordingError(RuntimeError):
    """The formal real-Main map recording contract failed."""


SUMMARY_TRUTH_CONTRACT: dict[str, object] = {
    "normalMainScene": True,
    "entryMode": "MainSceneFlag",
    "formalWorldHudMapEntry": True,
    "fullScreenLocalMap": True,
    "preparedLocalVisual": True,
    "localTargetRealClick": True,
    "worldAtlasVisual": True,
    "worldRegionCount": EXPECTED_WORLD_REGION_COUNT,
    "worldRegionRealClick": True,
    "crossMapRoutePath": True,
    "crossMapContinuation": True,
    "successfulRouteClosesPanel": True,
    "worldHudRestored": True,
    "battleMapEntryHidden": True,
    "realCrossFrameLeftClicks": True,
    "httpRequests": False,
    "serverWrites": 0,
    "audioRequired": True,
}


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _new_run_id() -> str:
    timestamp = _utc_now().strftime("%Y%m%dT%H%M%S.%fZ")
    return f"phase399-{timestamp}-{uuid.uuid4().hex[:8]}"


def _build_godot_command(
    *,
    godot: str,
    user_data_dir: Path,
    avi_path: Path,
    capture_flag: str = DEFAULT_CAPTURE_FLAG,
    review_args: Sequence[str] = (),
) -> list[str]:
    if review_args:
        raise Phase399MapRecordingError(
            "Phase399正式地图验收不接受附加Godot参数，避免联网或旁路"
        )
    try:
        return CORE._build_godot_command(
            godot=godot,
            user_data_dir=user_data_dir,
            avi_path=avi_path,
            capture_flag=capture_flag,
            review_args=review_args,
        )
    except CORE.PetManagementRecordingError as error:
        raise Phase399MapRecordingError(str(error)) from error


def _require_main_flag_wiring() -> None:
    try:
        source = MAIN_SCRIPT_PATH.read_text(encoding="utf-8")
    except OSError as error:
        raise Phase399MapRecordingError(
            f"无法读取真实Main脚本：{MAIN_SCRIPT_PATH}"
        ) from error
    required_wiring = (
        Path(CAPTURE_SCRIPT).name,
        "MapAwakenedOwnerReviewCapture.is_flag",
        "_run_map_awakened_owner_review_capture",
    )
    if any(fragment not in source for fragment in required_wiring):
        raise Phase399MapRecordingError(
            "Phase399地图录像尚未接入Main-scene flag；"
            "拒绝退回SceneTree或隔离旧UI录制"
        )


def _validate_probe(probe: dict[str, Any]) -> dict[str, Any]:
    try:
        metadata = CORE._validate_probe(probe)
    except CORE.PetManagementRecordingError as error:
        raise Phase399MapRecordingError(str(error)) from error
    duration = float(metadata.get("durationSeconds", -1.0))
    if (
        not math.isfinite(duration)
        or duration < MIN_DURATION_SECONDS
        or duration > MAX_DURATION_SECONDS
    ):
        raise Phase399MapRecordingError(
            "Phase399正式地图验收视频时长必须在"
            f"{MIN_DURATION_SECONDS:.0f}-{MAX_DURATION_SECONDS:.0f}秒，"
            f"实际{duration:.3f}秒"
        )
    minimum_frames = int(math.floor(duration * EXPECTED_FPS) - 2)
    if int(metadata.get("frameCount", -1)) < minimum_frames:
        raise Phase399MapRecordingError(
            "Phase399正式地图验收视频帧数与30fps时长不一致"
        )
    streams = probe.get("streams", [])
    audio = next(
        (
            stream
            for stream in streams
            if isinstance(stream, dict)
            and stream.get("codec_type") == "audio"
        ),
        None,
    )
    if not isinstance(audio, dict):
        raise Phase399MapRecordingError("Phase399验收视频缺少音频流")
    try:
        audio_duration = float(audio.get("duration", -1.0))
        sample_rate = int(audio.get("sample_rate", 0))
        channels = int(audio.get("channels", 0))
    except (TypeError, ValueError) as error:
        raise Phase399MapRecordingError(
            "Phase399验收音频元数据无法解析"
        ) from error
    if (
        str(audio.get("codec_name", "")) != EXPECTED_AUDIO_CODEC
        or sample_rate != EXPECTED_AUDIO_SAMPLE_RATE
        or channels != EXPECTED_AUDIO_CHANNELS
    ):
        raise Phase399MapRecordingError(
            "Phase399验收音频必须为AAC 48kHz双声道"
        )
    if not math.isfinite(audio_duration) or abs(audio_duration - duration) > 0.25:
        raise Phase399MapRecordingError(
            "Phase399验收音频时长与视频不一致"
        )
    return metadata


def _validate_godot_log(path: Path) -> dict[str, Any]:
    text = path.read_text(encoding="utf-8")
    if FAILURE_MARKER in text:
        raise Phase399MapRecordingError(
            "Godot Phase399正式地图验收报告失败，详见录制日志"
        )
    for forbidden in (
        "entry=SceneTreeScript",
        "extends SceneTree",
        "SCRIPT ERROR",
        "Parse Error",
        "WARNING:",
        "ERROR:",
        "ObjectDB instances were leaked at exit",
        "resources still in use at exit",
    ):
        if forbidden in text:
            raise Phase399MapRecordingError(
                f"Godot Phase399正式地图日志包含禁止内容：{forbidden}"
            )
    if "Metal 4.0 - Forward Mobile" not in text:
        raise Phase399MapRecordingError(
            "Godot Phase399正式地图录像没有使用Metal Forward Mobile"
        )
    if re.search(
        r"Movie Maker mode enabled, recording movie in "
        r"1280(?:x|×)720 @ 30 FPS",
        text,
    ) is None:
        raise Phase399MapRecordingError(
            "Godot Phase399正式地图录像没有确认1280x720@30fps Movie Maker"
        )
    required_fragments = (
        START_MARKER,
        "scene=Main.tscn entry=MainSceneFlag viewport=1280x720 "
        "fps=30 speed=1.00x",
        "profile=isolated backend=false profile_save=false http=false",
        "PHASE399_MAP_OWNER_REVIEW_HUD map_entry=true "
        "formal_world_hud=true battle=false",
        "PHASE399_MAP_OWNER_REVIEW_LOCAL fullscreen=true local_mode=true "
        "prepared_visual=true target_list=true",
        "PHASE399_MAP_OWNER_REVIEW_LOCAL_ROUTE real_click=true "
        "panel_closed=true pending_interaction=true target_cell=true",
        "PHASE399_MAP_OWNER_REVIEW_WORLD world_mode=true atlas=true "
        "regions=9 prepared_visual=true",
        "PHASE399_MAP_OWNER_REVIEW_REGION selected=shadow_oath_cavern "
        "entry_route=true floor_route=true",
        "PHASE399_MAP_OWNER_REVIEW_CROSS_ROUTE route_path=true "
        "continuation=true panel_closed=true "
        "destination=shadow_oath_cavern_f2",
        "PHASE399_MAP_OWNER_REVIEW_RESTORE panel_closed=true "
        "formal_world_hud=true map_entry=true action_bar=true",
        "PHASE399_MAP_OWNER_REVIEW_BATTLE battle_active=true "
        "map_entry_hidden=true panel_hidden=true audio=true",
        END_MARKER,
        "completed=true fullscreen_local=true prepared_visual=true "
        "local_route=true world_atlas=true regions=9 "
        "region_route=true route_path=true continuation=true "
        "route_closes_panel=true hud_restored=true "
        "battle_map_hidden=true audio=true backend=false "
        "profile_save=false server_writes=0",
    )
    for fragment in required_fragments:
        if fragment not in text:
            raise Phase399MapRecordingError(
                f"Godot Phase399正式地图日志缺少契约：{fragment}"
            )

    chapter_pattern = re.compile(
        rf"{CHAPTER_MARKER}\s+chapter=([A-Za-z0-9_.-]+)\s+"
        r"frame=(\d+)\s+seconds=([0-9.]+)\s+speed=1\.00x\s+"
        r"movie_frame=(\d+)"
    )
    chapters = [
        {
            "id": match.group(1),
            "frameCount": int(match.group(2)),
            "durationSeconds": float(match.group(3)),
            "movieFrame": int(match.group(4)),
        }
        for match in chapter_pattern.finditer(text)
    ]
    expected_ids = tuple(chapter[0] for chapter in EXPECTED_CHAPTERS)
    if tuple(chapter["id"] for chapter in chapters) != expected_ids:
        raise Phase399MapRecordingError(
            "Godot Phase399正式地图章节不完整或顺序错误："
            + ",".join(str(chapter["id"]) for chapter in chapters)
        )
    previous_end_frame = -1
    for chapter, expected in zip(chapters, EXPECTED_CHAPTERS):
        expected_seconds = float(expected[1])
        if not math.isclose(
            float(chapter["durationSeconds"]),
            expected_seconds,
            abs_tol=0.001,
        ):
            raise Phase399MapRecordingError(
                f"章节{chapter['id']}时长不是冻结值{expected_seconds:.3f}秒"
            )
        expected_frames = round(expected_seconds * EXPECTED_FPS)
        if int(chapter["frameCount"]) != expected_frames:
            raise Phase399MapRecordingError(
                f"章节{chapter['id']}帧数与30fps不一致"
            )
        movie_frame = int(chapter["movieFrame"])
        # Godot timers can hand the boundary frame directly to the next held
        # chapter.  Permit that one shared boundary while rejecting rollback
        # or larger overlap.
        if movie_frame < previous_end_frame:
            raise Phase399MapRecordingError(
                f"章节{chapter['id']}的Movie Maker帧时间没有严格前进"
            )
        previous_end_frame = movie_frame + expected_frames - 1

    end_match = re.search(
        rf"{END_MARKER}[^\n]*actual_left_clicks=(\d+)\s+"
        r"cross_frame_presses=(\d+)",
        text,
    )
    if end_match is None:
        raise Phase399MapRecordingError(
            "Godot Phase399正式地图日志缺少真实跨帧左键计数"
        )
    actual_clicks = int(end_match.group(1))
    cross_frame_presses = int(end_match.group(2))
    if (
        actual_clicks != EXPECTED_LEFT_CLICKS
        or cross_frame_presses != actual_clicks
    ):
        raise Phase399MapRecordingError(
            "Phase399完整地图流程必须由精确6次真实跨帧左键完成"
        )
    return {
        "status": "passed",
        "chapterCount": len(chapters),
        "chapters": chapters,
        "actualLeftClicks": actual_clicks,
        "crossFramePresses": cross_frame_presses,
        "scene": MAIN_SCENE,
        "entryMode": "MainSceneFlag",
        "profileIsolated": True,
        "backendConnected": False,
        "profileSaveEnabled": False,
        "formalWorldHudMapEntry": True,
        "fullScreenLocalMap": True,
        "preparedLocalVisual": True,
        "localTargetRealClick": True,
        "worldAtlasVisual": True,
        "worldRegionCount": EXPECTED_WORLD_REGION_COUNT,
        "worldRegionRealClick": True,
        "crossMapRoutePath": True,
        "crossMapContinuation": True,
        "successfulRouteClosesPanel": True,
        "worldHudRestored": True,
        "battleMapEntryHidden": True,
        "serverWrites": 0,
    }


def _comparison_sample_times(
    sequence: dict[str, Any],
    duration_seconds: float,
) -> tuple[float, ...]:
    chapters = sequence.get("chapters", [])
    by_id = {
        str(chapter.get("id", "")): chapter
        for chapter in chapters
        if isinstance(chapter, dict)
    }
    times: list[float] = []
    for chapter_id in COMPARISON_CHAPTERS:
        chapter = by_id.get(chapter_id)
        if not isinstance(chapter, dict):
            raise Phase399MapRecordingError(
                f"参考对照缺少录像章节：{chapter_id}"
            )
        movie_frame = int(chapter.get("movieFrame", -1))
        frame_count = int(chapter.get("frameCount", 0))
        sample_time = (movie_frame + frame_count * 0.5) / EXPECTED_FPS
        if (
            not math.isfinite(sample_time)
            or sample_time < 0.0
            or sample_time >= duration_seconds
        ):
            raise Phase399MapRecordingError(
                f"参考对照章节{chapter_id}取样时间越界：{sample_time:.3f}"
            )
        times.append(round(sample_time, 6))
    if tuple(sorted(times)) != tuple(times):
        raise Phase399MapRecordingError("参考对照取样时间没有严格递增")
    return tuple(times)


def _copy_reference_inputs(
    source_root: Path,
    comparison_dir: Path,
) -> list[Path]:
    resolved_root = source_root.expanduser().resolve()
    reference_dir = comparison_dir / "reference"
    reference_dir.mkdir(parents=False, exist_ok=False)
    copies: list[Path] = []
    for filename in REFERENCE_FILENAMES:
        source = resolved_root / filename
        if not source.is_file() or source.stat().st_size <= 0:
            raise Phase399MapRecordingError(
                f"Phase387地图参考图不存在或为空：{source}"
            )
        destination = reference_dir / filename
        shutil.copy2(source, destination)
        copies.append(destination)
    return copies


def _build_reference_comparison(
    *,
    ffmpeg: str,
    reference_paths: Sequence[Path],
    implementation_paths: Sequence[Path],
    output_path: Path,
    timeout_seconds: float,
    environment: dict[str, str],
) -> dict[str, Any]:
    if len(reference_paths) != 3 or len(implementation_paths) != 3:
        raise Phase399MapRecordingError("参考对照必须精确包含三组画面")
    command = [ffmpeg, "-y", "-v", "warning"]
    for reference, implementation in zip(
        reference_paths,
        implementation_paths,
    ):
        command.extend(("-i", str(reference), "-i", str(implementation)))
    filters: list[str] = []
    for index in range(3):
        reference_input = index * 2
        implementation_input = reference_input + 1
        filters.extend(
            (
                f"[{reference_input}:v]scale=640:360:"
                "force_original_aspect_ratio=decrease:flags=lanczos,"
                "pad=640:360:(ow-iw)/2:(oh-ih)/2:color=1a1510[r"
                f"{index}]",
                f"[{implementation_input}:v]scale=640:360:"
                "force_original_aspect_ratio=decrease:flags=lanczos,"
                "pad=640:360:(ow-iw)/2:(oh-ih)/2:color=1a1510[i"
                f"{index}]",
                f"[r{index}][i{index}]hstack=inputs=2[row{index}]",
            )
        )
    filters.append("[row0][row1][row2]vstack=inputs=3[out]")
    log_path = output_path.with_suffix(".log")
    CORE._run_logged(
        [
            *command,
            "-filter_complex",
            ";".join(filters),
            "-map",
            "[out]",
            "-frames:v",
            "1",
            str(output_path),
        ],
        log_path=log_path,
        timeout_seconds=timeout_seconds,
        environment=environment,
    )
    width, height = CORE._png_dimensions(output_path)
    if (width, height) != (1280, 1080):
        raise Phase399MapRecordingError(
            f"参考对照板尺寸错误：{width}x{height}，期望1280x1080"
        )
    return {
        **CORE._artifact_record(output_path),
        "width": width,
        "height": height,
        "rows": 3,
        "columns": 2,
        "leftColumn": "StoneAge reference",
        "rightColumn": "Beastbound implementation",
        "log": CORE._artifact_record(log_path),
    }


def _validate_summary_contract(summary: dict[str, Any]) -> dict[str, Any]:
    capture_contract = summary.get("captureContract")
    sequence = summary.get("godotSequence")
    comparison = summary.get("referenceVsImplementation")
    if not isinstance(capture_contract, dict):
        raise Phase399MapRecordingError("Phase399 summary缺少captureContract")
    if not isinstance(sequence, dict):
        raise Phase399MapRecordingError("Phase399 summary缺少godotSequence")
    if not isinstance(comparison, dict):
        raise Phase399MapRecordingError(
            "Phase399 summary缺少referenceVsImplementation"
        )
    for key, expected in SUMMARY_TRUTH_CONTRACT.items():
        if capture_contract.get(key) != expected:
            raise Phase399MapRecordingError(
                f"Phase399 summary truth contract缺失或错误：{key}"
            )
    if comparison.get("status") != "passed" or comparison.get("rowCount") != 3:
        raise Phase399MapRecordingError("Phase399参考对照合同不完整")
    return summary


def _record_into(
    *, args: argparse.Namespace, run_id: str, run_dir: Path
) -> Path:
    timeout_seconds = float(args.timeout_seconds)
    if not math.isfinite(timeout_seconds) or timeout_seconds <= 0:
        raise Phase399MapRecordingError("--timeout-seconds必须大于0")
    godot = CORE._require_executable(args.godot, label="Godot")
    ffmpeg = CORE._require_executable(args.ffmpeg, label="ffmpeg")
    ffprobe = CORE._require_executable(args.ffprobe, label="ffprobe")
    user_data_dir = run_dir / "user-data"
    temporary_dir = run_dir / "tmp"
    user_data_dir.mkdir(parents=False, exist_ok=False)
    temporary_dir.mkdir(parents=False, exist_ok=False)
    environment = CORE._isolated_environment(temporary_dir)

    avi_path = run_dir / "map-awakened-owner-review-1x.avi"
    video_path = run_dir / "map-awakened-owner-review-1x.mp4"
    godot_log = run_dir / "godot-recording.log"
    command = _build_godot_command(
        godot=godot,
        user_data_dir=user_data_dir,
        avi_path=avi_path,
        capture_flag=DEFAULT_CAPTURE_FLAG,
    )
    CORE._run_logged(
        command,
        log_path=godot_log,
        timeout_seconds=timeout_seconds,
        environment=environment,
    )
    godot_sequence = _validate_godot_log(godot_log)
    raw_movie = CORE._artifact_record(avi_path)

    transcode_log = run_dir / "ffmpeg-transcode.log"
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
            str(video_path),
        ],
        log_path=transcode_log,
        timeout_seconds=timeout_seconds,
        environment=environment,
    )

    probe_path = run_dir / "ffprobe.json"
    probe = CORE._write_probe(ffprobe, video_path, probe_path)
    media = _validate_probe(probe)
    decode_log = run_dir / "full-audio-video-decode.log"
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
        environment=environment,
    )

    sample_times = CORE._selected_sample_times(
        float(media["durationSeconds"]),
        requested=tuple(args.sample_times or ()),
        sample_count=int(args.sample_count),
    )
    screenshots_dir = run_dir / "screenshots"
    screenshots = CORE._extract_review_frames(
        ffmpeg=ffmpeg,
        video_path=video_path,
        screenshots_dir=screenshots_dir,
        sample_times=sample_times,
        timeout_seconds=timeout_seconds,
    )
    contact = CORE._build_contact_sheet(
        ffmpeg=ffmpeg,
        screenshots_dir=screenshots_dir,
        output_path=run_dir / "contact-sheet.png",
        sample_count=len(sample_times),
        timeout_seconds=timeout_seconds,
    )

    comparison_dir = run_dir / "comparison"
    comparison_dir.mkdir(parents=False, exist_ok=False)
    reference_paths = _copy_reference_inputs(
        Path(args.reference_root),
        comparison_dir,
    )
    comparison_times = _comparison_sample_times(
        godot_sequence,
        float(media["durationSeconds"]),
    )
    implementation_dir = comparison_dir / "implementation"
    implementation_records = CORE._extract_review_frames(
        ffmpeg=ffmpeg,
        video_path=video_path,
        screenshots_dir=implementation_dir,
        sample_times=comparison_times,
        timeout_seconds=timeout_seconds,
    )
    implementation_paths = [
        REPO_ROOT / record["path"] for record in implementation_records
    ]
    comparison_board = _build_reference_comparison(
        ffmpeg=ffmpeg,
        reference_paths=reference_paths,
        implementation_paths=implementation_paths,
        output_path=run_dir / "reference-vs-implementation.png",
        timeout_seconds=timeout_seconds,
        environment=environment,
    )
    comparison_rows = [
        {
            "chapter": chapter_id,
            "sampleTimeSeconds": sample_time,
            "reference": CORE._artifact_record(reference),
            "implementation": implementation,
        }
        for chapter_id, sample_time, reference, implementation in zip(
            COMPARISON_CHAPTERS,
            comparison_times,
            reference_paths,
            implementation_records,
        )
    ]
    comparison_manifest_path = comparison_dir / "comparison-manifest.json"
    CORE._write_json(
        comparison_manifest_path,
        {
            "schemaVersion": 1,
            "status": "passed",
            "layout": "three rows; reference left; implementation right",
            "rows": comparison_rows,
            "board": comparison_board,
        },
    )

    metadata_path = run_dir / "metadata.json"
    metadata = {
        "schemaVersion": REPORT_SCHEMA_VERSION,
        "reportType": REPORT_TYPE,
        "scene": MAIN_SCENE,
        "captureScript": CAPTURE_SCRIPT,
        "captureFlag": DEFAULT_CAPTURE_FLAG,
        "viewport": {"width": EXPECTED_WIDTH, "height": EXPECTED_HEIGHT},
        "fps": EXPECTED_FPS,
        "playbackSpeed": 1.0,
        "videoCodec": EXPECTED_VIDEO_CODEC,
        "pixelFormat": EXPECTED_PIXEL_FORMAT,
        "audioCodec": EXPECTED_AUDIO_CODEC,
        "audioSampleRate": EXPECTED_AUDIO_SAMPLE_RATE,
        "audioChannels": EXPECTED_AUDIO_CHANNELS,
        "durationSeconds": media["durationSeconds"],
        "frameCount": media["frameCount"],
        "fullDecodeStatus": "passed",
        "godotSequence": godot_sequence,
        "comparisonSampleTimes": comparison_times,
        "isolation": {
            "freshUserDataDirectory": True,
            "normalPlayerSavePathUsed": False,
            "profileSaveEnabled": False,
            "backendProcessStartedByTool": False,
            "mysqlAccessByTool": False,
        },
    }
    CORE._write_json(metadata_path, metadata)

    hash_paths = [
        avi_path,
        video_path,
        probe_path,
        metadata_path,
        godot_log,
        transcode_log,
        decode_log,
        run_dir / "contact-sheet.png",
        REPO_ROOT / contact["log"]["path"],
        run_dir / "reference-vs-implementation.png",
        REPO_ROOT / comparison_board["log"]["path"],
        comparison_manifest_path,
        *reference_paths,
        *implementation_paths,
        *(
            REPO_ROOT / record["log"]["path"]
            for record in implementation_records
        ),
        *(REPO_ROOT / screenshot["path"] for screenshot in screenshots),
        *(
            REPO_ROOT / screenshot["log"]["path"]
            for screenshot in screenshots
        ),
    ]
    hash_manifest_path = CORE._write_sha256_manifest(run_dir, hash_paths)
    video = {
        **CORE._artifact_record(video_path),
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
        "captureScript": CAPTURE_SCRIPT,
        "captureFlag": DEFAULT_CAPTURE_FLAG,
        "captureContract": {
            **SUMMARY_TRUTH_CONTRACT,
            "width": EXPECTED_WIDTH,
            "height": EXPECTED_HEIGHT,
            "fps": EXPECTED_FPS,
            "playbackSpeed": 1.0,
            "durationRangeSeconds": [
                MIN_DURATION_SECONDS,
                MAX_DURATION_SECONDS,
            ],
        },
        "isolation": {
            "userData": CORE._user_data_inventory(user_data_dir),
            "temporaryDirectory": CORE._repo_relative(temporary_dir),
            "normalPlayerSavePathUsed": False,
            "profileSaveEnabled": False,
            "backendProcessStartedByTool": False,
            "mysqlAccessByTool": False,
        },
        "tools": {
            "godot": CORE._capture_version(godot, ["--version"]),
            "ffmpeg": CORE._capture_version(ffmpeg, ["-version"]),
            "ffprobe": CORE._capture_version(ffprobe, ["-version"]),
            "python": sys.version.splitlines()[0],
        },
        "command": CORE._redacted_command(command),
        "godotSequence": godot_sequence,
        "rawMovie": raw_movie,
        "video": video,
        "metadata": CORE._artifact_record(metadata_path),
        "probe": CORE._artifact_record(probe_path),
        "fullDecode": {
            "status": "passed",
            "videoStreamDecoded": True,
            "audioStreamDecoded": True,
            "log": CORE._artifact_record(decode_log),
        },
        "screenshots": screenshots,
        "contactSheet": contact,
        "referenceVsImplementation": {
            "status": "passed",
            "rowCount": 3,
            "source": "Phase387 supplied StoneAge reference set",
            "rows": comparison_rows,
            "board": comparison_board,
            "manifest": CORE._artifact_record(comparison_manifest_path),
        },
        "sha256Manifest": CORE._artifact_record(hash_manifest_path),
        "logs": {
            "godot": CORE._artifact_record(godot_log),
            "transcode": CORE._artifact_record(transcode_log),
        },
        "ownerReviewStatus": "pending",
    }
    summary = _validate_summary_contract(summary)
    summary_path = run_dir / "summary.json"
    CORE._write_json(summary_path, summary)
    print(
        json.dumps(
            {
                "status": "passed",
                "runId": run_id,
                "video": video["path"],
                "contactSheet": contact["path"],
                "referenceVsImplementation": comparison_board["path"],
                "metadata": CORE._repo_relative(metadata_path),
                "summary": CORE._repo_relative(summary_path),
                "ownerReviewStatus": "pending",
            },
            ensure_ascii=False,
        )
    )
    return summary_path


def _write_failure_summary(
    run_dir: Path, *, run_id: str, error: BaseException
) -> None:
    try:
        CORE._write_json(
            run_dir / "failure-summary.json",
            {
                "schemaVersion": REPORT_SCHEMA_VERSION,
                "reportType": REPORT_TYPE,
                "status": "failed",
                "runId": run_id,
                "generatedAtUtc": _utc_now().isoformat().replace(
                    "+00:00", "Z"
                ),
                "errorType": type(error).__name__,
                "error": str(error) or type(error).__name__,
                "evidenceDirectoryPreserved": True,
                "ownerReviewStatus": "pending",
            },
        )
    except OSError:
        pass


def _record(args: argparse.Namespace) -> Path:
    if Path.cwd().resolve() != REPO_ROOT:
        raise Phase399MapRecordingError(
            f"必须从仓库根执行：cd {REPO_ROOT}"
        )
    if not GODOT_PROJECT.is_dir():
        raise Phase399MapRecordingError(
            f"Godot项目不存在：{GODOT_PROJECT}"
        )
    _require_main_flag_wiring()
    run_id = args.run_id or _new_run_id()
    if SAFE_RUN_ID.fullmatch(run_id) is None:
        raise Phase399MapRecordingError(f"不安全的runId：{run_id!r}")
    try:
        output_root = CORE._resolve_output_root(args.output_root)
    except CORE.PetManagementRecordingError as error:
        raise Phase399MapRecordingError(str(error)) from error
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
            "通过真实Main.tscn flag录制Phase399正式地图完整流程：世界HUD地图入口、"
            "当前地图目标、世界九区、玄影洞窟楼层跨图路线、成功关闭恢复HUD、"
            "战斗隐藏地图，并生成有声MP4、联系表、参考对照板、严格日志和SHA256证据。"
        )
    )
    parser.add_argument("--run-id", help="可选的唯一安全runId。")
    parser.add_argument(
        "--output-root",
        type=Path,
        default=DEFAULT_OUTPUT_ROOT,
        help=(
            "仓库.run/evidence/下的输出根目录"
            f"（默认：{DEFAULT_OUTPUT_ROOT.as_posix()}）。"
        ),
    )
    parser.add_argument(
        "--reference-root",
        type=Path,
        default=DEFAULT_REFERENCE_ROOT,
        help="包含Phase387三张StoneAge地图参考图的只读目录。",
    )
    parser.add_argument(
        "--sample-count",
        type=int,
        default=DEFAULT_SAMPLE_COUNT,
        help=f"等距截图数量（默认：{DEFAULT_SAMPLE_COUNT}）。",
    )
    parser.add_argument(
        "--sample-time",
        type=float,
        action="append",
        dest="sample_times",
        help="改用指定秒数截图；需严格递增。",
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
        help="每个外部步骤超时秒数（默认：900）。",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    if int(args.sample_count) < 2 or int(args.sample_count) > MAX_SAMPLE_COUNT:
        print(
            f"sample count must be between 2 and {MAX_SAMPLE_COUNT}",
            file=sys.stderr,
        )
        return 1
    try:
        _record(args)
    except KeyboardInterrupt:
        print("phase399 map owner review recording interrupted", file=sys.stderr)
        return 130
    except (
        Phase399MapRecordingError,
        CORE.PetManagementRecordingError,
        FileExistsError,
        OSError,
        ValueError,
    ) as error:
        print(
            f"phase399 map owner review recording failed: {error}",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
