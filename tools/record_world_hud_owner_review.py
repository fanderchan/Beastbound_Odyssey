#!/usr/bin/env python3
"""Record and validate the real Phase382 in-world HUD review flow.

The recorder launches production ``Main.tscn`` through the owner-attested
``automation`` QA lane, with a fixed 1280x720 viewport, 30 fps, and a 1.00x
time scale.  The Godot controller uses real cross-frame left-clicks to review
the complete HUD, its normal player entry points, the more drawer, the
restore-only collapsed state, and a final world move.  No backend is started
and the real player user-data inventory must remain byte-for-byte unchanged.
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
    "_beastbound_world_hud_media_core",
    CORE_PATH,
)
if CORE_SPEC is None or CORE_SPEC.loader is None:
    raise RuntimeError(f"无法加载媒体录制核心：{CORE_PATH}")
CORE = importlib.util.module_from_spec(CORE_SPEC)
CORE_SPEC.loader.exec_module(CORE)

GODOT_PROJECT = REPO_ROOT / "client" / "godot"
MAIN_SCENE = "res://scenes/Main.tscn"
DEFAULT_CAPTURE_FLAG = "--world-hud-owner-review-capture"
DEFAULT_OUTPUT_ROOT = Path(".run/evidence/phase382_world_hud_owner_review")
REPORT_SCHEMA_VERSION = 1
REPORT_TYPE = "beastbound_world_hud_main_owner_review_video"
EXPECTED_WIDTH = 1280
EXPECTED_HEIGHT = 720
EXPECTED_FPS = 30
EXPECTED_VIDEO_CODEC = "h264"
EXPECTED_PIXEL_FORMAT = "yuv420p"
EXPECTED_AUDIO_CODEC = "aac"
MIN_DURATION_SECONDS = 38.0
MAX_DURATION_SECONDS = 60.0
DEFAULT_SAMPLE_COUNT = 12
MAX_SAMPLE_COUNT = 16
SAFE_RUN_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")
END_MARKER = "WORLD_HUD_OWNER_REVIEW_END"
CHAPTER_MARKER = "WORLD_HUD_OWNER_REVIEW_CHAPTER"
EXPECTED_CHAPTERS = (
    "world_hud_complete",
    "top_map_hud",
    "map_panel",
    "character_entry",
    "backpack_entry",
    "pet_entry",
    "task_tab",
    "party_tab",
    "chat_open",
    "chat_closed",
    "more_drawer",
    "hud_collapsed_restore_only",
    "hud_expanded",
    "world_move",
)


class WorldHudRecordingError(RuntimeError):
    """The in-world HUD recording contract failed."""


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _new_run_id() -> str:
    timestamp = _utc_now().strftime("%Y%m%dT%H%M%S.%fZ")
    return f"phase382-{timestamp}-{uuid.uuid4().hex[:8]}"


def _build_godot_command(
    *,
    godot: str,
    avi_path: Path,
    capture_flag: str = DEFAULT_CAPTURE_FLAG,
    review_args: Sequence[str] = (),
) -> list[str]:
    if review_args:
        raise WorldHudRecordingError(
            "世界HUD验收不接受附加Godot参数，避免启动登录或联网检查"
        )
    if capture_flag != DEFAULT_CAPTURE_FLAG:
        raise WorldHudRecordingError(
            "世界HUD正式验收只接受固定 capture flag"
        )
    try:
        return CORE._build_godot_command(
            godot=godot,
            avi_path=avi_path,
            capture_flag=capture_flag,
            review_args=(),
        )
    except CORE.PetManagementRecordingError as error:
        raise WorldHudRecordingError(str(error)) from error


def _build_native_godot_command(
    *,
    godot: str,
    capture_flag: str = DEFAULT_CAPTURE_FLAG,
    review_args: Sequence[str] = (),
) -> list[str]:
    if review_args:
        raise WorldHudRecordingError(
            "世界HUD验收不接受附加Godot参数，避免启动登录或联网检查"
        )
    if capture_flag != DEFAULT_CAPTURE_FLAG:
        raise WorldHudRecordingError(
            "世界HUD正式验收只接受固定 capture flag"
        )
    try:
        return CORE._build_native_godot_command(
            godot=godot,
            capture_flag=capture_flag,
            review_args=(),
        )
    except CORE.PetManagementRecordingError as error:
        raise WorldHudRecordingError(str(error)) from error


def _validate_probe(probe: dict[str, Any]) -> dict[str, Any]:
    try:
        metadata = CORE._validate_probe(probe)
    except CORE.PetManagementRecordingError as error:
        raise WorldHudRecordingError(str(error)) from error
    duration = float(metadata.get("durationSeconds", -1.0))
    if (
        not math.isfinite(duration)
        or duration < MIN_DURATION_SECONDS
        or duration > MAX_DURATION_SECONDS
    ):
        raise WorldHudRecordingError(
            "世界HUD验收视频时长必须在 "
            f"{MIN_DURATION_SECONDS:.0f}-{MAX_DURATION_SECONDS:.0f} 秒，"
            f"实际 {duration:.3f} 秒"
        )
    minimum_frames = int(math.floor(duration * EXPECTED_FPS) - 2)
    if int(metadata.get("frameCount", -1)) < minimum_frames:
        raise WorldHudRecordingError("世界HUD验收视频帧数与30fps时长不一致")
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
        raise WorldHudRecordingError("世界HUD验收视频缺少音频流")
    try:
        audio_duration = float(audio.get("duration", -1.0))
        sample_rate = int(audio.get("sample_rate", 0))
        channels = int(audio.get("channels", 0))
    except (TypeError, ValueError) as error:
        raise WorldHudRecordingError("世界HUD验收音频元数据无法解析") from error
    if sample_rate != 48000 or channels != 2:
        raise WorldHudRecordingError("世界HUD验收音频必须为48kHz双声道")
    if (
        not math.isfinite(audio_duration)
        or abs(audio_duration - duration) > 0.25
    ):
        raise WorldHudRecordingError("世界HUD验收音频时长与视频不一致")
    return metadata


def _validate_godot_log(path: Path) -> dict[str, Any]:
    text = path.read_text(encoding="utf-8")
    if "WORLD_HUD_OWNER_REVIEW_FAILED" in text:
        raise WorldHudRecordingError("Godot世界HUD验收序列报告失败，详见录制日志")
    required_fragments = (
        END_MARKER,
        "scene=Main.tscn viewport=1280x720 fps=30 speed=1.00x",
        "profile=isolated backend=false profile_save=false",
        "WORLD_HUD_OWNER_REVIEW_ISOLATION scene=Main.tscn "
        "profile=isolated backend=false profile_save=false",
        "WORLD_HUD_OWNER_REVIEW_LAYERS complete=true top=true "
        "map=true action=true",
        "WORLD_HUD_OWNER_REVIEW_ENTRIES character=true backpack=true "
        "pet=true real_clicks=true",
        "WORLD_HUD_OWNER_REVIEW_TASK_PARTY reviewed=true task=true "
        "party=true",
        "WORLD_HUD_OWNER_REVIEW_CHAT opened=true closed=true offline=true",
        "WORLD_HUD_OWNER_REVIEW_MORE opened=true drawer_visible=true",
        "WORLD_HUD_OWNER_REVIEW_COLLAPSE restore_only=true expanded=true",
        "WORLD_HUD_OWNER_REVIEW_MOVE real_click=true moved=true "
        "frame_separated=true",
        "complete_hud=true map=true entries=true task_party=true chat=true "
        "more=true restore_only=true expanded=true moved=true",
    )
    for fragment in required_fragments:
        if fragment not in text:
            raise WorldHudRecordingError(
                f"Godot世界HUD验收日志缺少契约：{fragment}"
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
    chapter_ids = tuple(chapter["id"] for chapter in chapters)
    if chapter_ids != EXPECTED_CHAPTERS:
        raise WorldHudRecordingError(
            "Godot世界HUD验收章节不完整或顺序错误："
            + ",".join(chapter_ids)
        )
    for chapter in chapters:
        expected_frames = round(
            float(chapter["durationSeconds"]) * EXPECTED_FPS
        )
        if int(chapter["frameCount"]) != expected_frames:
            raise WorldHudRecordingError(
                f"章节{chapter['id']}的帧数与30fps不一致"
            )
    return {
        "status": "passed",
        "chapterCount": len(chapters),
        "chapters": chapters,
        "endMarker": END_MARKER,
        "scene": MAIN_SCENE,
        "playbackSpeed": 1.0,
        "profileIsolated": True,
        "backendConnected": False,
        "profileSaveEnabled": False,
        "completeHudReviewed": True,
        "mapReviewed": True,
        "realEntryClicks": True,
        "taskPartyReviewed": True,
        "chatReviewedOffline": True,
        "moreDrawerReviewed": True,
        "restoreOnlyCollapsedState": True,
        "expandedAgain": True,
        "realWorldMove": True,
    }


def _record_into(
    *, args: argparse.Namespace, run_id: str, run_dir: Path
) -> Path:
    timeout_seconds = float(args.timeout_seconds)
    if not math.isfinite(timeout_seconds) or timeout_seconds <= 0:
        raise WorldHudRecordingError("--timeout-seconds必须大于0")
    godot = CORE._require_executable(args.godot, label="Godot")
    ffmpeg = CORE._require_executable(args.ffmpeg, label="ffmpeg")
    ffprobe = CORE._require_executable(args.ffprobe, label="ffprobe")
    temporary_dir = run_dir / "tmp"
    temporary_dir.mkdir(parents=False, exist_ok=False)
    base_environment = CORE._isolated_environment(temporary_dir)

    avi_path = run_dir / "world-hud-owner-review-1x.avi"
    video_path = run_dir / "world-hud-owner-review-1x.mp4"
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
        "captureFlag": str(args.capture_flag),
        "viewport": {"width": EXPECTED_WIDTH, "height": EXPECTED_HEIGHT},
        "fps": EXPECTED_FPS,
        "playbackSpeed": 1.0,
        "videoCodec": EXPECTED_VIDEO_CODEC,
        "pixelFormat": EXPECTED_PIXEL_FORMAT,
        "audioCodec": EXPECTED_AUDIO_CODEC,
        "durationSeconds": media["durationSeconds"],
        "frameCount": media["frameCount"],
        "fullDecodeStatus": "passed",
        "godotSequence": {
            "native": native_sequence,
            "movie": movie_sequence,
        },
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
        "captureFlag": str(args.capture_flag),
        "captureContract": {
            "normalMainScene": True,
            "completeWorldHud": True,
            "width": EXPECTED_WIDTH,
            "height": EXPECTED_HEIGHT,
            "fps": EXPECTED_FPS,
            "playbackSpeed": 1.0,
            "durationRangeSeconds": [
                MIN_DURATION_SECONDS,
                MAX_DURATION_SECONDS,
            ],
            "audioRequired": True,
            "realCrossFrameLeftClicks": True,
            "topAndMapReviewed": True,
            "realCharacterBackpackPetEntries": True,
            "taskAndPartyTabsReviewed": True,
            "chatReviewedOffline": True,
            "moreDrawerReviewed": True,
            "collapsedStateHasRestoreOnly": True,
            "expandedAgain": True,
            "realWorldMovement": True,
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
        "godotSequence": {
            "native": native_sequence,
            "movie": movie_sequence,
        },
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
        raise WorldHudRecordingError(f"必须从仓库根执行：cd {REPO_ROOT}")
    if not GODOT_PROJECT.is_dir():
        raise WorldHudRecordingError(f"Godot项目不存在：{GODOT_PROJECT}")
    run_id = args.run_id or _new_run_id()
    if SAFE_RUN_ID.fullmatch(run_id) is None:
        raise WorldHudRecordingError(f"不安全的runId：{run_id!r}")
    try:
        output_root = CORE._resolve_output_root(args.output_root)
    except CORE.PetManagementRecordingError as error:
        raise WorldHudRecordingError(str(error)) from error
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
            "用真实Main.tscn录制1280x720、30fps、1×、有声的世界HUD验收视频，"
            "覆盖完整HUD、顶部/地图、角色/背包/宠物真实入口、任务/队伍页签、"
            "聊天、更多抽屉、仅恢复钮收起态、再次展开与跨帧左键移动，并生成"
            "MP4、联系表、元数据、全流解码与SHA256证据。"
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
        help="Godot端世界HUD验收参数。",
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
        print("world hud owner review interrupted", file=sys.stderr)
        return 130
    except (
        WorldHudRecordingError,
        CORE.PetManagementRecordingError,
        FileExistsError,
        OSError,
        ValueError,
    ) as error:
        print(
            f"world hud owner review recording failed: {error}",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
