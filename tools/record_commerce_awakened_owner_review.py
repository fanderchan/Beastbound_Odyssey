#!/usr/bin/env python3
"""Record the real awakened commerce flow from production ``Main.tscn``.

Every run claims and cleans the owner-attested ``automation`` QA user-data
lane.  The recorder never starts a backend and delegates the player-facing
sequence to the fixed ``--commerce-awakened-owner-review-capture`` Godot
entrypoint once natively and once through MovieWriter.
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
    "_beastbound_commerce_awakened_media_core",
    CORE_PATH,
)
if CORE_SPEC is None or CORE_SPEC.loader is None:
    raise RuntimeError(f"无法加载媒体录制核心：{CORE_PATH}")
CORE = importlib.util.module_from_spec(CORE_SPEC)
CORE_SPEC.loader.exec_module(CORE)

GODOT_PROJECT = REPO_ROOT / "client" / "godot"
MAIN_SCENE = "res://scenes/Main.tscn"
DEFAULT_CAPTURE_FLAG = "--commerce-awakened-owner-review-capture"
DEFAULT_OUTPUT_ROOT = Path(
    ".run/evidence/phase391_commerce_identity_owner_review"
)
REPORT_SCHEMA_VERSION = 1
REPORT_TYPE = "beastbound_commerce_awakened_owner_review_video"
EXPECTED_WIDTH = 1280
EXPECTED_HEIGHT = 720
EXPECTED_FPS = 30
EXPECTED_VIDEO_CODEC = "h264"
EXPECTED_PIXEL_FORMAT = "yuv420p"
EXPECTED_AUDIO_CODEC = "aac"
EXPECTED_AUDIO_SAMPLE_RATE = 48000
EXPECTED_AUDIO_CHANNELS = 2
MIN_DURATION_SECONDS = 20.0
MAX_DURATION_SECONDS = 30.0
DEFAULT_SAMPLE_COUNT = 12
MAX_SAMPLE_COUNT = 16
SAFE_RUN_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")
CHAPTER_MARKER = "COMMERCE_AWAKENED_OWNER_REVIEW_CHAPTER"
END_MARKER = "COMMERCE_AWAKENED_OWNER_REVIEW_END"
FAILURE_MARKER = "COMMERCE_AWAKENED_OWNER_REVIEW_FAILED"
EXPECTED_CHAPTERS = (
    "world_context",
    "item_shop_identity",
    "item_shop_sell",
    "equipment_shop_identity",
    "bank_identity",
    "bank_drag_split",
    "synthesis_recipe",
    "synthesis_confirm",
    "return_world",
)


class CommerceAwakenedRecordingError(RuntimeError):
    """The commerce owner-review recording contract was not satisfied."""


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _new_run_id() -> str:
    timestamp = _utc_now().strftime("%Y%m%dT%H%M%S.%fZ")
    return f"phase391-{timestamp}-{uuid.uuid4().hex[:8]}"


def _build_godot_command(
    *,
    godot: str,
    avi_path: Path | None,
    review_args: Sequence[str] = (),
) -> list[str]:
    """Build the fixed production-scene capture command."""

    if review_args:
        raise CommerceAwakenedRecordingError(
            "商业页正式验收不接受附加 Godot 参数，避免启动登录或联网检查"
        )
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
    command.extend(
        [
            "--",
            f"--qa-viewport={EXPECTED_WIDTH}x{EXPECTED_HEIGHT}",
            DEFAULT_CAPTURE_FLAG,
            CORE.QA_LANE_ARGUMENT,
        ]
    )
    if (
        command.count(DEFAULT_CAPTURE_FLAG) != 1
        or command.count(CORE.QA_LANE_ARGUMENT) != 1
        or "--user-data-dir" in command
        or (avi_path is None and "--write-movie" in command)
        or (avi_path is not None and command.count("--write-movie") != 1)
    ):
        raise CommerceAwakenedRecordingError(
            "Godot 商业页验收命令的 QA lane 边界不精确"
        )
    return command


def _validate_probe(probe: dict[str, Any]) -> dict[str, Any]:
    try:
        metadata = CORE._validate_probe(probe)
    except CORE.PetManagementRecordingError as error:
        raise CommerceAwakenedRecordingError(str(error)) from error
    duration = float(metadata.get("durationSeconds", -1.0))
    if (
        not math.isfinite(duration)
        or duration < MIN_DURATION_SECONDS
        or duration > MAX_DURATION_SECONDS
    ):
        raise CommerceAwakenedRecordingError(
            "商业页验收视频时长必须在 "
            f"{MIN_DURATION_SECONDS:.0f}-{MAX_DURATION_SECONDS:.0f} 秒，"
            f"实际 {duration:.3f} 秒"
        )
    minimum_frames = int(math.floor(duration * EXPECTED_FPS) - 2)
    if int(metadata.get("frameCount", -1)) < minimum_frames:
        raise CommerceAwakenedRecordingError(
            "商业页验收视频帧数和 30fps 时长不一致"
        )
    streams = probe.get("streams", [])
    audio = next(
        (
            value
            for value in streams
            if isinstance(value, dict)
            and value.get("codec_type") == "audio"
        ),
        {},
    )
    if (
        str(audio.get("sample_rate", ""))
        != str(EXPECTED_AUDIO_SAMPLE_RATE)
        or int(audio.get("channels", -1)) != EXPECTED_AUDIO_CHANNELS
    ):
        raise CommerceAwakenedRecordingError(
            "商业页验收音频必须为 48kHz 双声道"
        )
    metadata["audioSampleRate"] = EXPECTED_AUDIO_SAMPLE_RATE
    metadata["audioChannels"] = EXPECTED_AUDIO_CHANNELS
    return metadata


def _validate_audible_audio(path: Path) -> dict[str, Any]:
    text = path.read_text(encoding="utf-8", errors="replace")
    mean_match = re.search(r"mean_volume:\s*([^\s]+)\s*dB", text)
    max_match = re.search(r"max_volume:\s*([^\s]+)\s*dB", text)
    if mean_match is None or max_match is None:
        raise CommerceAwakenedRecordingError(
            "商业页验收音轨缺少 volumedetect 回执"
        )
    mean_text = mean_match.group(1)
    max_text = max_match.group(1)
    if "inf" in mean_text.lower() or "inf" in max_text.lower():
        raise CommerceAwakenedRecordingError("商业页验收音轨为静音")
    mean_db = float(mean_text)
    max_db = float(max_text)
    if not math.isfinite(mean_db) or not math.isfinite(max_db) or max_db < -55.0:
        raise CommerceAwakenedRecordingError("商业页验收音轨不可听")
    return {
        "status": "passed",
        "meanVolumeDb": mean_db,
        "maxVolumeDb": max_db,
    }


def _validate_godot_log(
    path: Path,
    *,
    movie_mode: bool,
) -> dict[str, Any]:
    text = path.read_text(encoding="utf-8")
    if "SCRIPT ERROR:" in text or "Parse Error:" in text:
        raise CommerceAwakenedRecordingError(
            "Godot 商业页验收日志包含脚本错误"
        )
    if "Metal 4.0 - Forward Mobile" not in text:
        raise CommerceAwakenedRecordingError(
            "Godot 商业页验收没有使用 Metal Forward Mobile"
        )
    movie_marker_present = (
        "Movie Maker mode enabled, recording movie in "
        "1280×720 @ 30 FPS"
        in text
    )
    if movie_mode and not movie_marker_present:
        raise CommerceAwakenedRecordingError(
            "Godot 商业页验收没有确认 1280×720 30fps Movie Maker"
        )
    if not movie_mode and movie_marker_present:
        raise CommerceAwakenedRecordingError(
            "Godot 商业页原生预检意外进入 Movie Maker"
        )
    if FAILURE_MARKER in text:
        raise CommerceAwakenedRecordingError(
            "Godot 商业页验收序列报告失败，详见录制日志"
        )
    forbidden = (
        "ERROR:",
        "ObjectDB instances were leaked",
        "resources still in use at exit",
        "Orphan StringName",
    )
    found = [token for token in forbidden if token in text]
    if found:
        raise CommerceAwakenedRecordingError(
            "Godot 商业页验收日志存在错误或泄漏：" + ", ".join(found)
        )
    if END_MARKER not in text:
        raise CommerceAwakenedRecordingError(
            "Godot 商业页验收序列缺少完成标记"
        )
    if "speed=1.00x" not in text:
        raise CommerceAwakenedRecordingError(
            "Godot 商业页验收序列没有声明 1× 时间"
        )
    if "profile=isolated backend=false" not in text:
        raise CommerceAwakenedRecordingError(
            "Godot 商业页验收序列没有确认隔离档案和离线后端"
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
        raise CommerceAwakenedRecordingError(
            "Godot 商业页验收章节不完整或顺序错误："
            + ",".join(chapter_ids)
        )
    for chapter in chapters:
        expected_frames = round(
            float(chapter["durationSeconds"]) * EXPECTED_FPS
        )
        if int(chapter["frameCount"]) != expected_frames:
            raise CommerceAwakenedRecordingError(
                f"章节 {chapter['id']} 的帧数与 30fps 不一致"
            )
    return {
        "status": "passed",
        "chapterCount": len(chapters),
        "chapters": chapters,
        "endMarker": END_MARKER,
        "playbackSpeed": 1.0,
        "profileIsolated": True,
        "backendConnected": False,
        "renderer": "Metal 4.0 - Forward Mobile",
        "movieWriter": "1280x720@30fps" if movie_mode else "disabled",
    }


def _record_into(
    *,
    args: argparse.Namespace,
    run_id: str,
    run_dir: Path,
) -> Path:
    timeout_seconds = float(args.timeout_seconds)
    if not math.isfinite(timeout_seconds) or timeout_seconds <= 0:
        raise CommerceAwakenedRecordingError(
            "--timeout-seconds 必须大于 0"
        )

    godot = CORE._require_executable(args.godot, label="Godot")
    ffmpeg = CORE._require_executable(args.ffmpeg, label="ffmpeg")
    ffprobe = CORE._require_executable(args.ffprobe, label="ffprobe")
    temporary_dir = run_dir / "tmp"
    temporary_dir.mkdir(parents=False, exist_ok=False)
    base_environment = CORE._isolated_environment(temporary_dir)

    avi_path = run_dir / "commerce-awakened-owner-review-1x.avi"
    video_path = run_dir / "commerce-awakened-owner-review-1x.mp4"
    native_log = run_dir / "godot-native.log"
    movie_log = run_dir / "godot-recording.log"
    native_command = _build_godot_command(
        godot=godot,
        avi_path=None,
        review_args=tuple(args.review_args or ()),
    )
    movie_command = _build_godot_command(
        godot=godot,
        avi_path=avi_path,
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
        native_log_validator=lambda path: _validate_godot_log(
            path,
            movie_mode=False,
        ),
        movie_log_validator=lambda path: _validate_godot_log(
            path,
            movie_mode=True,
        ),
    )
    environment = lane_evidence["environment"]
    native_sequence = lane_evidence["native"]["logValidation"]
    godot_sequence = lane_evidence["movie"]["logValidation"]
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
    audio_loudness_log = run_dir / "audio-loudness.log"
    CORE._run_logged(
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
        log_path=audio_loudness_log,
        timeout_seconds=timeout_seconds,
        environment=environment,
    )
    audible_audio = _validate_audible_audio(audio_loudness_log)

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
        "captureFlag": DEFAULT_CAPTURE_FLAG,
        "viewport": {
            "width": EXPECTED_WIDTH,
            "height": EXPECTED_HEIGHT,
        },
        "fps": EXPECTED_FPS,
        "playbackSpeed": 1.0,
        "videoCodec": EXPECTED_VIDEO_CODEC,
        "pixelFormat": EXPECTED_PIXEL_FORMAT,
        "audioCodec": EXPECTED_AUDIO_CODEC,
        "audioSampleRate": media["audioSampleRate"],
        "audioChannels": media["audioChannels"],
        "durationSeconds": media["durationSeconds"],
        "frameCount": media["frameCount"],
        "fullDecodeStatus": "passed",
        "audibleAudio": audible_audio,
        "nativeSequence": native_sequence,
        "godotSequence": godot_sequence,
        "isolation": {
            "officialAutomationQaLane": True,
            "qaLaneCleaned": True,
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
        lane_evidence["lifecyclePath"],
        audio_loudness_log,
        *(
            REPO_ROOT / screenshot["path"]
            for screenshot in screenshots
        ),
    ]
    hash_manifest_path = CORE._write_sha256_manifest(
        run_dir,
        hash_paths,
    )
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
        "captureFlag": DEFAULT_CAPTURE_FLAG,
        "captureContract": {
            "normalMainScene": True,
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
        },
        "isolation": {
            "qaLane": {
                "lane": CORE.QA_LANE,
                "feature": CORE.QA_LANE_FEATURE,
                "customUserDirName": CORE.QA_LANE_CUSTOM_USER_DIR_NAME,
                "owner": lane_evidence["session"]["owner"],
                "laneRoot": lane_evidence["session"]["godotLaneRoot"],
                "realRoot": lane_evidence["session"]["godotRealRoot"],
                "realBeforeSha256": lane_evidence["session"][
                    "realInventorySha256"
                ],
            },
            "laneFreshAtRecorderStart": True,
            "qaLaneCleaned": True,
            "temporaryDirectory": CORE._repo_relative(temporary_dir),
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
        "qaLaneSourceCheck": lane_evidence["sourceCheck"],
        "qaLaneInitialVerification": lane_evidence["initialVerification"],
        "qaLaneNativeAttestation": lane_evidence["native"]["attestation"],
        "qaLaneMovieAttestation": lane_evidence["movie"]["attestation"],
        "qaLaneCleanup": lane_evidence["cleanup"],
        "qaLanePostCleanupInspect": lane_evidence["postCleanupInspect"],
        "qaLaneLifecycle": CORE._artifact_record(
            lane_evidence["lifecyclePath"]
        ),
        "nativeSequence": native_sequence,
        "godotSequence": godot_sequence,
        "rawMovie": raw_movie,
        "video": video,
        "audibleAudio": audible_audio,
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
            "native": CORE._artifact_record(native_log),
            "movie": CORE._artifact_record(movie_log),
            "transcode": CORE._artifact_record(transcode_log),
            "audioLoudness": CORE._artifact_record(audio_loudness_log),
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
    run_dir: Path,
    *,
    run_id: str,
    error: BaseException,
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
        raise CommerceAwakenedRecordingError(
            f"必须从仓库根执行：cd {REPO_ROOT}"
        )
    if not GODOT_PROJECT.is_dir():
        raise CommerceAwakenedRecordingError(
            f"Godot 项目不存在：{GODOT_PROJECT}"
        )
    run_id = args.run_id or _new_run_id()
    if SAFE_RUN_ID.fullmatch(run_id) is None:
        raise CommerceAwakenedRecordingError(
            f"不安全的 runId：{run_id!r}"
        )
    try:
        output_root = CORE._resolve_output_root(args.output_root)
    except CORE.PetManagementRecordingError as error:
        raise CommerceAwakenedRecordingError(str(error)) from error
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
            "从真实 Main.tscn 录制 1280x720、30fps、1×、有声的觉醒风"
            "商业页验收视频，并生成 MP4、联系表、元数据与完整解码证据。"
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
        "--review-arg",
        action="append",
        dest="review_args",
        help="附加 Godot 用户参数；可重复。",
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
        print(
            "commerce awakened owner review recording interrupted",
            file=sys.stderr,
        )
        return 130
    except (
        CommerceAwakenedRecordingError,
        CORE.PetManagementRecordingError,
        FileExistsError,
        OSError,
        ValueError,
    ) as error:
        print(
            f"commerce awakened owner review recording failed: {error}",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
