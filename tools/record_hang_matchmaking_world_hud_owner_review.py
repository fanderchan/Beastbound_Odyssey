#!/usr/bin/env python3
"""Record the Phase395 formal party slice through the real Main scene.

The tool intentionally refuses to run until the focused capture flag is wired
into ``Main.tscn``'s host script.  This prevents an isolated SceneTree script
from recreating the old HUD and producing misleading owner-review evidence.
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
    "_beastbound_phase395_world_party_media_core",
    CORE_PATH,
)
if CORE_SPEC is None or CORE_SPEC.loader is None:
    raise RuntimeError(f"无法加载媒体录制核心：{CORE_PATH}")
CORE = importlib.util.module_from_spec(CORE_SPEC)
CORE_SPEC.loader.exec_module(CORE)

GODOT_PROJECT = REPO_ROOT / "client" / "godot"
MAIN_SCENE = "res://scenes/Main.tscn"
MAIN_SCRIPT_PATH = GODOT_PROJECT / "scripts" / "main.gd"
CAPTURE_SCRIPT = (
    "res://scripts/qa/hang_matchmaking_world_hud_owner_review_capture.gd"
)
DEFAULT_CAPTURE_FLAG = "--hang-matchmaking-world-hud-owner-review-capture"
DEFAULT_OUTPUT_ROOT = Path(
    ".run/evidence/phase395_hang_matchmaking_world_hud_owner_review"
)
REPORT_SCHEMA_VERSION = 1
REPORT_TYPE = "beastbound_phase395_world_party_main_owner_review_video"
EXPECTED_WIDTH = 1280
EXPECTED_HEIGHT = 720
EXPECTED_FPS = 30
EXPECTED_VIDEO_CODEC = "h264"
EXPECTED_PIXEL_FORMAT = "yuv420p"
EXPECTED_AUDIO_CODEC = "aac"
EXPECTED_AUDIO_SAMPLE_RATE = 48000
EXPECTED_AUDIO_CHANNELS = 2
MIN_DURATION_SECONDS = 17.0
MAX_DURATION_SECONDS = 35.0
DEFAULT_SAMPLE_COUNT = 10
MAX_SAMPLE_COUNT = 12
SAFE_RUN_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")
START_MARKER = "PHASE395_WORLD_PARTY_OWNER_REVIEW_START"
CHAPTER_MARKER = "PHASE395_WORLD_PARTY_OWNER_REVIEW_CHAPTER"
END_MARKER = "PHASE395_WORLD_PARTY_OWNER_REVIEW_END"
FAILURE_MARKER = "PHASE395_WORLD_PARTY_OWNER_REVIEW_FAILED"
EXPECTED_CHAPTERS = (
    ("route_selection_fullscreen", 2.0),
    ("start_choice", 1.8),
    ("world_one_human_four_empty", 2.2),
    ("world_one_human_four_npc", 2.2),
    ("world_two_human_three_npc_next_match", 2.4),
    ("task_tab_real_click", 1.3),
    ("party_tab_real_click", 1.5),
    ("cancelled_match_hang_continues", 2.2),
    ("stop_hang_fullscreen", 1.5),
    ("stopped_hang_world", 1.5),
)


class Phase395WorldPartyRecordingError(RuntimeError):
    """The formal Main-scene world-party recording contract failed."""


SUMMARY_TRUTH_CONTRACT: dict[str, object] = {
    "idleEmptyPartyNoFakeHuman": True,
    "activeEmptyPartyAuthoritative": True,
    "activeEmptyPartyIgnoresStaleOrdinary": True,
    "fullEmptyPartyAuthoritative": True,
    "fullEmptyPartyIgnoresStaleOrdinary": True,
    "fullEmptyPartySyncingHumans": 5,
    "productionOfflineHumansFiltered": True,
    "productionPendingHumanNeutral": True,
    "productionTeamSnapshotLevelAuthoritative": True,
    "fullscreenProductionTruth": True,
}

SUMMARY_GODOT_TRUTH_CONTRACT: dict[str, object] = {
    "idleEmptyNoFakeHuman": True,
    "activeEmptyAuthoritative": True,
    "activeEmptyStaleOrdinaryIgnored": True,
    "fullEmptyAuthoritative": True,
    "fullEmptyStaleOrdinaryIgnored": True,
    "fullEmptySyncingHumans": 5,
    "productionOfflineFiltered": True,
    "productionPendingNeutral": True,
    "productionTeamSnapshotLevel": True,
    "fullscreenProductionTruth": True,
}


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _new_run_id() -> str:
    timestamp = _utc_now().strftime("%Y%m%dT%H%M%S.%fZ")
    return f"phase395-{timestamp}-{uuid.uuid4().hex[:8]}"


def _build_godot_command(
    *,
    godot: str,
    avi_path: Path,
    capture_flag: str = DEFAULT_CAPTURE_FLAG,
    review_args: Sequence[str] = (),
) -> list[str]:
    if review_args:
        raise Phase395WorldPartyRecordingError(
            "Phase395正式HUD验收不接受附加Godot参数，避免登录、联网或旧HUD旁路"
        )
    try:
        return CORE._build_godot_command(
            godot=godot,
            avi_path=avi_path,
            capture_flag=capture_flag,
            review_args=review_args,
        )
    except CORE.PetManagementRecordingError as error:
        raise Phase395WorldPartyRecordingError(str(error)) from error


def _build_native_godot_command(
    *,
    godot: str,
    capture_flag: str = DEFAULT_CAPTURE_FLAG,
    review_args: Sequence[str] = (),
) -> list[str]:
    if review_args:
        raise Phase395WorldPartyRecordingError(
            "Phase395正式HUD验收不接受附加Godot参数，避免登录、联网或旧HUD旁路"
        )
    try:
        return CORE._build_native_godot_command(
            godot=godot,
            capture_flag=capture_flag,
            review_args=review_args,
        )
    except CORE.PetManagementRecordingError as error:
        raise Phase395WorldPartyRecordingError(str(error)) from error


def _require_main_flag_wiring() -> None:
    try:
        source = MAIN_SCRIPT_PATH.read_text(encoding="utf-8")
    except OSError as error:
        raise Phase395WorldPartyRecordingError(
            f"无法读取真实Main脚本：{MAIN_SCRIPT_PATH}"
        ) from error
    capture_name = Path(CAPTURE_SCRIPT).name
    if DEFAULT_CAPTURE_FLAG not in source or capture_name not in source:
        raise Phase395WorldPartyRecordingError(
            "Phase395录像切片尚未接入Main-scene flag；拒绝退回SceneTree或隔离旧HUD录制"
        )


def _validate_probe(probe: dict[str, Any]) -> dict[str, Any]:
    try:
        metadata = CORE._validate_probe(probe)
    except CORE.PetManagementRecordingError as error:
        raise Phase395WorldPartyRecordingError(str(error)) from error
    duration = float(metadata.get("durationSeconds", -1.0))
    if (
        not math.isfinite(duration)
        or duration < MIN_DURATION_SECONDS
        or duration > MAX_DURATION_SECONDS
    ):
        raise Phase395WorldPartyRecordingError(
            "Phase395正式HUD验收视频时长必须在"
            f"{MIN_DURATION_SECONDS:.0f}-{MAX_DURATION_SECONDS:.0f}秒，"
            f"实际{duration:.3f}秒"
        )
    if int(metadata.get("frameCount", -1)) < int(
        math.floor(duration * EXPECTED_FPS) - 2
    ):
        raise Phase395WorldPartyRecordingError(
            "Phase395正式HUD验收视频帧数与30fps时长不一致"
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
        raise Phase395WorldPartyRecordingError("Phase395验收视频缺少音频流")
    try:
        audio_duration = float(audio.get("duration", -1.0))
        sample_rate = int(audio.get("sample_rate", 0))
        channels = int(audio.get("channels", 0))
    except (TypeError, ValueError) as error:
        raise Phase395WorldPartyRecordingError(
            "Phase395验收音频元数据无法解析"
        ) from error
    if (
        str(audio.get("codec_name", "")) != EXPECTED_AUDIO_CODEC
        or sample_rate != EXPECTED_AUDIO_SAMPLE_RATE
        or channels != EXPECTED_AUDIO_CHANNELS
    ):
        raise Phase395WorldPartyRecordingError(
            "Phase395验收音频必须为AAC 48kHz双声道"
        )
    if not math.isfinite(audio_duration) or abs(audio_duration - duration) > 0.25:
        raise Phase395WorldPartyRecordingError(
            "Phase395验收音频时长与视频不一致"
        )
    return metadata


def _validate_godot_log(path: Path) -> dict[str, Any]:
    text = path.read_text(encoding="utf-8")
    if FAILURE_MARKER in text:
        raise Phase395WorldPartyRecordingError(
            "Godot Phase395正式HUD验收报告失败，详见录制日志"
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
            raise Phase395WorldPartyRecordingError(
                f"Godot Phase395正式HUD日志包含禁止内容：{forbidden}"
            )
    required_fragments = (
        START_MARKER,
        "scene=Main.tscn entry=MainSceneFlag viewport=1280x720 "
        "fps=30 speed=1.00x",
        "profile=isolated backend=false profile_save=false "
        "state_source=deterministic_injected_controller http=false",
        "PHASE395_WORLD_PARTY_OWNER_REVIEW_HUD awakened_mounted=true "
        "action_bar=true dock=true fixed_entries=true",
        "PHASE395_WORLD_PARTY_OWNER_REVIEW_ROUTE fullscreen=true "
        "route_cards=true selected_current=true real_click=true",
        "PHASE395_WORLD_PARTY_OWNER_REVIEW_CHOICE immediate=true "
        "matchmaking=true fullscreen=true",
        "PHASE395_WORLD_PARTY_OWNER_REVIEW_IDLE_EMPTY_PARTY "
        "idle_empty_no_fake_human=true",
        "PHASE395_WORLD_PARTY_OWNER_REVIEW_ACTIVE_EMPTY_PARTY "
        "active_empty_authoritative=true stale_ordinary_ignored=true "
        "human=1 npc=4",
        "PHASE395_WORLD_PARTY_OWNER_REVIEW_FULL_EMPTY_PARTY "
        "full_empty_authoritative=true stale_ordinary_ignored=true "
        "syncing_humans=5",
        "PHASE395_WORLD_PARTY_OWNER_REVIEW_PRODUCTION_PARTY "
        "offline_filtered=true pending_neutral=true "
        "team_snapshot_level=true",
        "PHASE395_WORLD_PARTY_OWNER_REVIEW_TRUTH_GATES "
        "idleEmptyTruth=true activeEmptyTruth=true fullEmptyTruth=true "
        "productionPartyTruth=true fullscreenProductionTruth=true",
        "PHASE395_WORLD_PARTY_OWNER_REVIEW_MATCH panel_closed=true "
        "world_visible=true human=1 npc=0 empty=4 hang_active=true",
        "PHASE395_WORLD_PARTY_OWNER_REVIEW_NPC_FILL human=1 npc=4 "
        "empty=0 explicit_npc_names=true server_ai=true "
        "neutral_npc_portraits=true authority_shape=true",
        "PHASE395_WORLD_PARTY_OWNER_REVIEW_REPLACEMENT human=2 npc=3 "
        "next_match_replacement_visible=true",
        "PHASE395_WORLD_PARTY_OWNER_REVIEW_TABS task_real_click=true "
        "party_real_click=true roster_instance_stable=true",
        "PHASE395_WORLD_PARTY_OWNER_REVIEW_CANCEL match_active=false "
        "hang_active=true full_bottom_hud=true",
        "PHASE395_WORLD_PARTY_OWNER_REVIEW_STOP_ENTRY fullscreen=true "
        "visible_stop=true real_entry_click=true",
        "PHASE395_WORLD_PARTY_OWNER_REVIEW_STOPPED hang_active=false "
        "panel_closed=true full_bottom_hud=true",
        END_MARKER,
        "completed=true awakened_hud_mounted=true "
        "bottom_hud_persistent=true route_choice=true "
        "one_human_four_empty=true one_human_four_npc=true "
        "two_human_three_npc=true next_match_replacement=true "
        "idle_empty_no_fake_human=true active_empty_authoritative=true "
        "full_empty_authoritative=true production_party_authority=true "
        "fullscreen_production_truth=true "
        "task_party_real_click=true cancel_kept_hang=true "
        "stopped_hang=true right_party_tab=true five_slots=true "
        "legacy_ui_hidden=true backend=false profile_save=false "
        "server_writes=0",
    )
    for fragment in required_fragments:
        if fragment not in text:
            raise Phase395WorldPartyRecordingError(
                f"Godot Phase395正式HUD日志缺少契约：{fragment}"
            )
    chapter_pattern = re.compile(
        rf"{CHAPTER_MARKER}\s+chapter=([A-Za-z0-9_.-]+)\s+"
        r"frame=(\d+)\s+seconds=([0-9.]+)\s+speed=1\.00x"
    )
    chapters = [
        {
            "id": match.group(1),
            "frameCount": int(match.group(2)),
            "durationSeconds": float(match.group(3)),
        }
        for match in chapter_pattern.finditer(text)
    ]
    expected_ids = tuple(chapter[0] for chapter in EXPECTED_CHAPTERS)
    if tuple(chapter["id"] for chapter in chapters) != expected_ids:
        raise Phase395WorldPartyRecordingError(
            "Godot Phase395正式HUD章节不完整或顺序错误："
            + ",".join(str(chapter["id"]) for chapter in chapters)
        )
    for chapter, expected in zip(chapters, EXPECTED_CHAPTERS, strict=True):
        expected_seconds = float(expected[1])
        if not math.isclose(
            float(chapter["durationSeconds"]),
            expected_seconds,
            abs_tol=0.001,
        ):
            raise Phase395WorldPartyRecordingError(
                f"章节{chapter['id']}时长不是冻结值{expected_seconds:.3f}秒"
            )
        if int(chapter["frameCount"]) != round(expected_seconds * EXPECTED_FPS):
            raise Phase395WorldPartyRecordingError(
                f"章节{chapter['id']}帧数与30fps不一致"
            )
    end_match = re.search(
        rf"{END_MARKER}[^\n]*actual_left_clicks=(\d+)\s+"
        r"cross_frame_presses=(\d+)",
        text,
    )
    if end_match is None:
        raise Phase395WorldPartyRecordingError(
            "Godot Phase395正式HUD日志缺少真实跨帧左键计数"
        )
    actual_clicks = int(end_match.group(1))
    cross_frame_presses = int(end_match.group(2))
    if actual_clicks < 9 or cross_frame_presses != actual_clicks:
        raise Phase395WorldPartyRecordingError(
            "Phase395完整挂机匹配流程必须由至少9次真实跨帧左键完成"
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
        "awakenedHudMounted": True,
        "bottomHudPersistent": True,
        "rightPartyTab": True,
        "fiveSlots": True,
        "legacyUiHidden": True,
        "routeChoice": True,
        "idleEmptyNoFakeHuman": True,
        "activeEmptyAuthoritative": True,
        "activeEmptyStaleOrdinaryIgnored": True,
        "fullEmptyAuthoritative": True,
        "fullEmptyStaleOrdinaryIgnored": True,
        "fullEmptySyncingHumans": 5,
        "productionOfflineFiltered": True,
        "productionPendingNeutral": True,
        "productionTeamSnapshotLevel": True,
        "fullscreenProductionTruth": True,
        "oneHumanFourEmpty": True,
        "oneHumanFourNpc": True,
        "neutralNpcPortraits": True,
        "twoHumanThreeNpc": True,
        "nextMatchReplacement": True,
        "taskPartyRealClicks": True,
        "cancelKeptHang": True,
        "stoppedHang": True,
        "deterministicController": True,
        "serverWrites": 0,
    }


def _validate_summary_contract(summary: dict[str, Any]) -> dict[str, Any]:
    capture_contract = summary.get("captureContract")
    godot_sequence = summary.get("godotSequence")
    if not isinstance(capture_contract, dict):
        raise Phase395WorldPartyRecordingError(
            "Phase395 summary缺少captureContract"
        )
    if not isinstance(godot_sequence, dict):
        raise Phase395WorldPartyRecordingError(
            "Phase395 summary缺少godotSequence"
        )
    for key, expected in SUMMARY_TRUTH_CONTRACT.items():
        if capture_contract.get(key) != expected:
            raise Phase395WorldPartyRecordingError(
                f"Phase395 summary truth contract缺失或错误：{key}"
            )
    for key, expected in SUMMARY_GODOT_TRUTH_CONTRACT.items():
        if godot_sequence.get(key) != expected:
            raise Phase395WorldPartyRecordingError(
                f"Phase395 summary Godot truth gate缺失或错误：{key}"
            )
    return summary


def _record_into(
    *, args: argparse.Namespace, run_id: str, run_dir: Path
) -> Path:
    timeout_seconds = float(args.timeout_seconds)
    if not math.isfinite(timeout_seconds) or timeout_seconds <= 0:
        raise Phase395WorldPartyRecordingError("--timeout-seconds必须大于0")
    godot = CORE._require_executable(args.godot, label="Godot")
    ffmpeg = CORE._require_executable(args.ffmpeg, label="ffmpeg")
    ffprobe = CORE._require_executable(args.ffprobe, label="ffprobe")
    temporary_dir = run_dir / "tmp"
    temporary_dir.mkdir(parents=False, exist_ok=False)
    base_environment = CORE._isolated_environment(temporary_dir)

    avi_path = run_dir / "hang-matchmaking-world-hud-owner-review-1x.avi"
    video_path = run_dir / "hang-matchmaking-world-hud-owner-review-1x.mp4"
    native_log = run_dir / "godot-native.log"
    movie_log = run_dir / "godot-movie.log"
    native_command = _build_native_godot_command(
        godot=godot,
        capture_flag=str(args.capture_flag),
        review_args=tuple(args.review_args or ()),
    )
    movie_command = _build_godot_command(
        godot=godot,
        avi_path=avi_path,
        capture_flag=str(args.capture_flag),
        review_args=tuple(args.review_args or ()),
    )
    lane_evidence = CORE._run_official_lane_godot_sequence(
        run_dir=run_dir,
        godot=godot,
        base_environment=base_environment,
        native_command=native_command,
        movie_command=movie_command,
        native_log=native_log,
        movie_log=movie_log,
        timeout_seconds=timeout_seconds,
        native_log_validator=_validate_godot_log,
        movie_log_validator=_validate_godot_log,
    )
    environment = lane_evidence["environment"]
    native_sequence = lane_evidence["native"]["logValidation"]
    movie_sequence = lane_evidence["movie"]["logValidation"]
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

    metadata_path = run_dir / "metadata.json"
    metadata = {
        "schemaVersion": REPORT_SCHEMA_VERSION,
        "reportType": REPORT_TYPE,
        "scene": MAIN_SCENE,
        "captureScript": CAPTURE_SCRIPT,
        "captureFlag": str(args.capture_flag),
        "entryMode": "MainSceneFlag",
        "viewport": {"width": EXPECTED_WIDTH, "height": EXPECTED_HEIGHT},
        "fps": EXPECTED_FPS,
        "playbackSpeed": 1.0,
        "videoCodec": EXPECTED_VIDEO_CODEC,
        "pixelFormat": EXPECTED_PIXEL_FORMAT,
        "audioCodec": EXPECTED_AUDIO_CODEC,
        "durationSeconds": media["durationSeconds"],
        "frameCount": media["frameCount"],
        "fullDecodeStatus": "passed",
        "godotSequence": movie_sequence,
        "nativeGodotSequence": native_sequence,
        "isolation": {
            "officialQaLane": True,
            "lane": CORE.QA_LANE,
            "laneFeature": CORE.QA_LANE_FEATURE,
            "laneFreshAtRecorderStart": True,
            "laneAbsentAfterCleanup": True,
            "realPlayerInventoryUnchanged": True,
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
        run_dir / "contact-sheet.png",
        native_log,
        movie_log,
        lane_evidence["lifecyclePath"],
        lane_evidence["ownerEvidencePath"],
        run_dir / "godot-version.log",
        run_dir / "godot-help.log",
        transcode_log,
        decode_log,
        REPO_ROOT / contact["log"]["path"],
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
        "captureFlag": str(args.capture_flag),
        "captureContract": {
            "normalMainScene": True,
            "entryMode": "MainSceneFlag",
            "awakenedWorldHudMounted": True,
            "bottomRightActionBarPersistent": True,
            "formalRightPartyTab": True,
            "fixedFivePartySlots": True,
            "legacyPartyUiHidden": True,
            "realCrossFrameLeftClicks": True,
            "fullScreenRouteAndChoice": True,
            "worldReturnAfterMatch": True,
            "idleEmptyPartyNoFakeHuman": True,
            "activeEmptyPartyAuthoritative": True,
            "activeEmptyPartyIgnoresStaleOrdinary": True,
            "fullEmptyPartyAuthoritative": True,
            "fullEmptyPartyIgnoresStaleOrdinary": True,
            "fullEmptyPartySyncingHumans": 5,
            "productionOfflineHumansFiltered": True,
            "productionPendingHumanNeutral": True,
            "productionTeamSnapshotLevelAuthoritative": True,
            "fullscreenProductionTruth": True,
            "oneHumanFourEmpty": True,
            "oneHumanFourNpc": True,
            "neutralNpcPortraits": True,
            "twoHumanThreeNpc": True,
            "nextMatchReplacementVisible": True,
            "taskPartyTabsRealClick": True,
            "cancelMatchKeepsHang": True,
            "formalStopButton": "HangMatchStopButton",
            "stopReturnsToFullWorldHud": True,
            "deterministicInjectedController": True,
            "httpRequests": False,
            "serverWrites": 0,
            "width": EXPECTED_WIDTH,
            "height": EXPECTED_HEIGHT,
            "fps": EXPECTED_FPS,
            "playbackSpeed": 1.0,
            "durationRangeSeconds": [
                MIN_DURATION_SECONDS,
                MAX_DURATION_SECONDS,
            ],
            "audioRequired": True,
        },
        "isolation": {
            "officialQaLane": {
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
                "ownerEvidence": CORE._artifact_record(
                    lane_evidence["ownerEvidencePath"]
                ),
            },
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
        "commands": {
            "native": CORE._redacted_command(native_command),
            "movie30": CORE._redacted_command(movie_command),
        },
        "godotSequence": movie_sequence,
        "nativeGodotSequence": native_sequence,
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
        "sha256Manifest": CORE._artifact_record(hash_manifest_path),
        "logs": {
            "nativeGodot": CORE._artifact_record(native_log),
            "movieGodot": CORE._artifact_record(movie_log),
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
                "metadata": CORE._repo_relative(metadata_path),
                "summary": CORE._repo_relative(summary_path),
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
            },
        )
    except OSError:
        pass


def _record(args: argparse.Namespace) -> Path:
    if Path.cwd().resolve() != REPO_ROOT:
        raise Phase395WorldPartyRecordingError(
            f"必须从仓库根执行：cd {REPO_ROOT}"
        )
    if not GODOT_PROJECT.is_dir():
        raise Phase395WorldPartyRecordingError(
            f"Godot项目不存在：{GODOT_PROJECT}"
        )
    _require_main_flag_wiring()
    run_id = args.run_id or _new_run_id()
    if SAFE_RUN_ID.fullmatch(run_id) is None:
        raise Phase395WorldPartyRecordingError(f"不安全的runId：{run_id!r}")
    try:
        output_root = CORE._resolve_output_root(args.output_root)
    except CORE.PetManagementRecordingError as error:
        raise Phase395WorldPartyRecordingError(str(error)) from error
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
            "通过真实Main.tscn flag录制Phase395完整挂机匹配世界流程，硬验收"
            "全屏路线二选一、正式五席真人/NPC替换、任务组队页签、取消仍挂机、"
            "正式停止入口、右下完整功能栏和旧组队UI隐藏，并生成"
            "有声MP4、联系表、元数据、完整解码和SHA256证据。"
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
        "--capture-flag",
        default=DEFAULT_CAPTURE_FLAG,
        help="Godot端Phase395正式世界组队验收参数。",
    )
    parser.add_argument(
        "--review-arg",
        action="append",
        dest="review_args",
        help="附加Godot用户参数；为保持隔离将拒绝执行。",
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
        "--godot", default=os.environ.get("GODOT_BIN", "godot")
    )
    parser.add_argument(
        "--ffmpeg", default=os.environ.get("FFMPEG_BIN", "ffmpeg")
    )
    parser.add_argument(
        "--ffprobe", default=os.environ.get("FFPROBE_BIN", "ffprobe")
    )
    parser.add_argument(
        "--timeout-seconds",
        type=float,
        default=600.0,
        help="每个外部步骤超时秒数（默认：600）。",
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
        print("phase395 world party owner review interrupted", file=sys.stderr)
        return 130
    except (
        Phase395WorldPartyRecordingError,
        CORE.PetManagementRecordingError,
        FileExistsError,
        OSError,
        ValueError,
    ) as error:
        print(
            f"phase395 world party owner review recording failed: {error}",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
