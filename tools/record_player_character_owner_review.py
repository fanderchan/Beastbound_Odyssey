#!/usr/bin/env python3
"""Record and validate the real Phase381 in-world character-management UI.

The tool launches production ``Main.tscn`` with a fresh Godot user-data
directory, a fixed 1280x720 viewport, 30 fps, and a 1.00x time scale.  It does
not start a backend or access the normal player save.  The Godot controller
drives real cross-frame left-clicks from the world HUD through attributes,
draft stat allocation, ride permits, and back to the world.
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
    "_beastbound_player_character_media_core",
    CORE_PATH,
)
if CORE_SPEC is None or CORE_SPEC.loader is None:
    raise RuntimeError(f"无法加载媒体录制核心：{CORE_PATH}")
CORE = importlib.util.module_from_spec(CORE_SPEC)
CORE_SPEC.loader.exec_module(CORE)

GODOT_PROJECT = REPO_ROOT / "client" / "godot"
MAIN_SCENE = "res://scenes/Main.tscn"
DEFAULT_CAPTURE_FLAG = "--player-character-owner-review-capture"
DEFAULT_OUTPUT_ROOT = Path(
    ".run/evidence/phase381_player_character_owner_review"
)
REPORT_SCHEMA_VERSION = 1
REPORT_TYPE = "beastbound_player_character_main_owner_review_video"
EXPECTED_WIDTH = 1280
EXPECTED_HEIGHT = 720
EXPECTED_FPS = 30
EXPECTED_VIDEO_CODEC = "h264"
EXPECTED_PIXEL_FORMAT = "yuv420p"
EXPECTED_AUDIO_CODEC = "aac"
MIN_DURATION_SECONDS = 25.0
MAX_DURATION_SECONDS = 45.0
DEFAULT_SAMPLE_COUNT = 10
MAX_SAMPLE_COUNT = 14
SAFE_RUN_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")
END_MARKER = "PLAYER_CHARACTER_OWNER_REVIEW_END"
CHAPTER_MARKER = "PLAYER_CHARACTER_OWNER_REVIEW_CHAPTER"
EXPECTED_CHAPTERS = (
    "world",
    "attributes",
    "stat_page",
    "stat_draft",
    "stat_undo",
    "stat_reset",
    "stat_final_draft",
    "stat_confirmed",
    "ride_all",
    "ride_species_menu",
    "ride_species_filtered",
    "return_world",
)


class PlayerCharacterRecordingError(RuntimeError):
    """The in-world character-management recording contract failed."""


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _new_run_id() -> str:
    timestamp = _utc_now().strftime("%Y%m%dT%H%M%S.%fZ")
    return f"phase381-{timestamp}-{uuid.uuid4().hex[:8]}"


def _build_godot_command(
    *,
    godot: str,
    user_data_dir: Path,
    avi_path: Path,
    capture_flag: str = DEFAULT_CAPTURE_FLAG,
    review_args: Sequence[str] = (),
) -> list[str]:
    if review_args:
        raise PlayerCharacterRecordingError(
            "角色管理验收不接受附加Godot参数，避免启动登录或联网检查"
        )
    return CORE._build_godot_command(
        godot=godot,
        user_data_dir=user_data_dir,
        avi_path=avi_path,
        capture_flag=capture_flag,
        review_args=review_args,
    )


def _validate_probe(probe: dict[str, Any]) -> dict[str, Any]:
    try:
        metadata = CORE._validate_probe(probe)
    except CORE.PetManagementRecordingError as error:
        raise PlayerCharacterRecordingError(str(error)) from error
    duration = float(metadata.get("durationSeconds", -1.0))
    if (
        not math.isfinite(duration)
        or duration < MIN_DURATION_SECONDS
        or duration > MAX_DURATION_SECONDS
    ):
        raise PlayerCharacterRecordingError(
            "角色管理验收视频时长必须在 "
            f"{MIN_DURATION_SECONDS:.0f}-{MAX_DURATION_SECONDS:.0f} 秒，"
            f"实际 {duration:.3f} 秒"
        )
    minimum_frames = int(math.floor(duration * EXPECTED_FPS) - 2)
    if int(metadata.get("frameCount", -1)) < minimum_frames:
        raise PlayerCharacterRecordingError(
            "角色管理验收视频帧数与30fps时长不一致"
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
        raise PlayerCharacterRecordingError("角色管理验收视频缺少音频流")
    try:
        audio_duration = float(audio.get("duration", -1.0))
        sample_rate = int(audio.get("sample_rate", 0))
        channels = int(audio.get("channels", 0))
    except (TypeError, ValueError) as error:
        raise PlayerCharacterRecordingError(
            "角色管理验收音频元数据无法解析"
        ) from error
    if sample_rate != 48000 or channels != 2:
        raise PlayerCharacterRecordingError(
            "角色管理验收音频必须为48kHz双声道"
        )
    if (
        not math.isfinite(audio_duration)
        or abs(audio_duration - duration) > 0.25
    ):
        raise PlayerCharacterRecordingError(
            "角色管理验收音频时长与视频不一致"
        )
    return metadata


def _validate_godot_log(path: Path) -> dict[str, Any]:
    text = path.read_text(encoding="utf-8")
    if "PLAYER_CHARACTER_OWNER_REVIEW_FAILED" in text:
        raise PlayerCharacterRecordingError(
            "Godot角色管理验收序列报告失败，详见录制日志"
        )
    required_fragments = (
        END_MARKER,
        "scene=Main.tscn viewport=1280x720 fps=30 speed=1.00x",
        "profile=isolated backend=false profile_save=false",
        "entry=right_bottom stats_confirmed=true",
        "real_ride_forms=3 species_filter=true return_world=true",
        "PLAYER_CHARACTER_OWNER_REVIEW_ISOLATION scene=Main.tscn",
        "PLAYER_CHARACTER_OWNER_REVIEW_ATTRIBUTES "
        "opened=true equipment_slots=9 player=焰芽斗士",
        "PLAYER_CHARACTER_OWNER_REVIEW_STATS draft=true undo=true "
        "reset=true confirmed=true points_before=4 points_after=1 "
        "hp_gain=4 attack_gain=1 defense_gain=1 profile_save=false",
        "PLAYER_CHARACTER_OWNER_REVIEW_RIDES "
        "filter=all real_forms=3 fake_forms=0",
        "PLAYER_CHARACTER_OWNER_REVIEW_RIDES "
        "filter=line:tiger species_menu=true visible_forms=1",
    )
    for fragment in required_fragments:
        if fragment not in text:
            raise PlayerCharacterRecordingError(
                f"Godot角色管理验收日志缺少契约：{fragment}"
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
        raise PlayerCharacterRecordingError(
            "Godot角色管理验收章节不完整或顺序错误："
            + ",".join(chapter_ids)
        )
    for chapter in chapters:
        expected_frames = round(
            float(chapter["durationSeconds"]) * EXPECTED_FPS
        )
        if int(chapter["frameCount"]) != expected_frames:
            raise PlayerCharacterRecordingError(
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
        "realWorldEntryClicked": True,
        "equipmentSlotCount": 9,
        "draftUndoResetConfirmed": True,
        "remainingStatPoints": 1,
        "realRideFormCount": 3,
        "fakeRideFormCount": 0,
        "speciesFilterReviewed": True,
        "returnedToWorld": True,
    }


def _record_into(
    *, args: argparse.Namespace, run_id: str, run_dir: Path
) -> Path:
    timeout_seconds = float(args.timeout_seconds)
    if not math.isfinite(timeout_seconds) or timeout_seconds <= 0:
        raise PlayerCharacterRecordingError("--timeout-seconds必须大于0")
    godot = CORE._require_executable(args.godot, label="Godot")
    ffmpeg = CORE._require_executable(args.ffmpeg, label="ffmpeg")
    ffprobe = CORE._require_executable(args.ffprobe, label="ffprobe")
    user_data_dir = run_dir / "user-data"
    temporary_dir = run_dir / "tmp"
    user_data_dir.mkdir(parents=False, exist_ok=False)
    temporary_dir.mkdir(parents=False, exist_ok=False)
    environment = CORE._isolated_environment(temporary_dir)

    avi_path = run_dir / "player-character-owner-review-1x.avi"
    video_path = run_dir / "player-character-owner-review-1x.mp4"
    godot_log = run_dir / "godot-recording.log"
    command = _build_godot_command(
        godot=godot,
        user_data_dir=user_data_dir,
        avi_path=avi_path,
        capture_flag=str(args.capture_flag),
        review_args=tuple(args.review_args or ()),
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
        "godotSequence": godot_sequence,
        "isolation": {
            "freshUserDataDirectory": True,
            "normalPlayerSavePathUsed": False,
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
        godot_log,
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
            "worldRightBottomEntry": True,
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
            "attributesReviewed": True,
            "nineEquipmentSlots": True,
            "statDraftUndoResetConfirm": True,
            "realRideFormsOnly": 3,
            "speciesFilterReviewed": True,
            "returnedToWorld": True,
        },
        "isolation": {
            "userData": CORE._user_data_inventory(user_data_dir),
            "temporaryDirectory": CORE._repo_relative(temporary_dir),
            "normalPlayerSavePathUsed": False,
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
        "sha256Manifest": CORE._artifact_record(hash_manifest_path),
        "logs": {
            "godot": CORE._artifact_record(godot_log),
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
        raise PlayerCharacterRecordingError(
            f"必须从仓库根执行：cd {REPO_ROOT}"
        )
    if not GODOT_PROJECT.is_dir():
        raise PlayerCharacterRecordingError(
            f"Godot项目不存在：{GODOT_PROJECT}"
        )
    run_id = args.run_id or _new_run_id()
    if SAFE_RUN_ID.fullmatch(run_id) is None:
        raise PlayerCharacterRecordingError(f"不安全的runId：{run_id!r}")
    try:
        output_root = CORE._resolve_output_root(args.output_root)
    except CORE.PetManagementRecordingError as error:
        raise PlayerCharacterRecordingError(str(error)) from error
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
            "用真实Main.tscn录制1280x720、30fps、1×、有声的角色管理页"
            "验收视频，覆盖世界右下角入口、属性、加点草稿/撤销/确认、"
            "骑证全部/种族筛选和返回世界，并生成MP4、联系表、元数据、"
            "全流解码与SHA256证据。"
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
        help="Godot端角色管理验收参数。",
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
        print("player character owner review interrupted", file=sys.stderr)
        return 130
    except (
        PlayerCharacterRecordingError,
        CORE.PetManagementRecordingError,
        FileExistsError,
        OSError,
        ValueError,
    ) as error:
        print(
            f"player character owner review recording failed: {error}",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
