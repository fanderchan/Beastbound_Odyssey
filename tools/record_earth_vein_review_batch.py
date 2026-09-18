#!/usr/bin/env python3
"""Record all Earth Vein owner-review media with only two visible Godot runs.

The first persistent process captures native 1280x720 PNG/JSON evidence for all
four floors plus the F4 dual-landmark subject.  The second persistent process
replays the same fixed plan through one MovieWriter AVI.  Frame ranges frozen by
the in-engine controller are split and transcoded offline, so no per-segment
Godot window is opened or closed.

This is an owner-review evidence producer, not an approval or release tool.
Every output remains ``ownerReviewStatus=pending``.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import math
import os
import re
import shlex
import signal
import stat
import subprocess
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping, Sequence


REPO_ROOT = Path(__file__).resolve().parents[1]
GODOT_PROJECT = REPO_ROOT / "client" / "godot"
BATCH_CONTROLLER_PATH = (
    GODOT_PROJECT / "scripts" / "qa" / "earth_vein_review_batch_capture.gd"
)
MAP_RECORDER_PATH = REPO_ROOT / "tools" / "record_firebud_v2_owner_review.py"
MEDIA_CORE_PATH = REPO_ROOT / "tools" / "record_pet_management_owner_review.py"
LANDMARK_RECORDER_PATH = REPO_ROOT / "tools" / "record_earth_vein_landmark_review.py"
MAP_BUILDER_PATH = REPO_ROOT / "tools" / "map_visual_evidence_builder.py"
QA_LANE_HELPER_PATH = REPO_ROOT / "tools" / "godot_qa_user_data_lane.py"
HUD_GLYPH_HELPER_PATH = REPO_ROOT / "tools" / "audit_firebud_hud_glyph_stability.py"
PET_CODEX_RECORDER_PATH = (
    REPO_ROOT / "tools" / "record_pet_codex_awakened_owner_review.py"
)
BATTLE_LAYOUT_RECORDER_PATH = (
    REPO_ROOT / "tools" / "record_battle_layout_owner_review.py"
)
BATTLE_LAYOUT_PERF_PATH = REPO_ROOT / "tools" / "capture_battle_layout_perf.py"
AUTO_CHECK_RUNNER_PATH = REPO_ROOT / "tools" / "run_godot_auto_checks.mjs"
BATCH_CONTROLLER = "res://scripts/qa/earth_vein_review_batch_capture.gd"
REVIEW_AUTH_ENV = "BEASTBOUND_EARTH_REVIEW_BATCH_AUTH"
REVIEW_AUTH_SHA_ENV = "BEASTBOUND_EARTH_REVIEW_BATCH_AUTH_SHA256"
REVIEW_AUTH_REPORT_TYPE = (
    "beastbound_earth_vein_low_disturbance_review_authorization"
)
MAIN_SCENE = "res://scenes/Main.tscn"
BUNDLE_ID = "earth_vein_cave_visual_v1"
MAP_IDS = (
    "earth_vein_cave",
    "earth_vein_cave_f2",
    "earth_vein_cave_f3",
    "earth_vein_cave_f4",
)
MODES = ("idle", "moving")
EXPECTED_WIDTH = 1280
EXPECTED_HEIGHT = 720
EXPECTED_FPS = 30
EXPECTED_AUDIO_DRIVER = "Dummy"
EXPECTED_FLOOR_SEGMENTS = 8
EXPECTED_LANDMARK_SEGMENTS = 1
POST_CAPTURE_HOLD_FRAMES = 120
POST_CAPTURE_HOLD_SECONDS = POST_CAPTURE_HOLD_FRAMES / EXPECTED_FPS
DEFAULT_OUTPUT_ROOT = Path(
    ".run/evidence/earth_vein_cave_visual_v1_owner_review"
)
SAFE_RUN_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")


def _load_module(name: str, path: Path) -> Any:
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"无法加载模块：{path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


MAP_RECORDER = _load_module(
    "_earth_batch_map_recorder",
    MAP_RECORDER_PATH,
)
MAP_RECORDER._activate_bundle(BUNDLE_ID)
CORE = MAP_RECORDER.CORE
LANDMARK_RECORDER = _load_module(
    "_earth_batch_landmark_recorder",
    LANDMARK_RECORDER_PATH,
)
MAP_BUILDER = _load_module(
    "_earth_batch_map_evidence_builder",
    MAP_BUILDER_PATH,
)

HARNESS_PATHS: dict[str, Path] = {
    "pythonRecorder": Path(__file__).resolve(),
    "godotBatchController": BATCH_CONTROLLER_PATH,
    "mapCaptureController": GODOT_PROJECT
    / "scripts"
    / "qa"
    / "map_visual_review_capture.gd",
    "runtimeExitCleanup": GODOT_PROJECT
    / "scripts"
    / "qa"
    / "runtime_exit_cleanup.gd",
    "gameAudioManager": GODOT_PROJECT
    / "scripts"
    / "audio"
    / "game_audio_manager.gd",
    "battleAudioTimelineController": GODOT_PROJECT
    / "scripts"
    / "audio"
    / "battle_audio_timeline_controller.gd",
    "battleAudioCueModel": GODOT_PROJECT
    / "scripts"
    / "audio"
    / "battle_audio_cue_model.gd",
    "audioCueCatalog": GODOT_PROJECT
    / "assets"
    / "audio"
    / "beastbound_audio_v2"
    / "audio-cues.json",
    "audioAmbienceReleaseGate": GODOT_PROJECT
    / "data"
    / "audio_ambience_release_gate_v1.json",
    "isometricMapModel": GODOT_PROJECT
    / "scripts"
    / "world"
    / "isometric_map_model.gd",
    "playerProgressModel": GODOT_PROJECT
    / "scripts"
    / "progression"
    / "player_progress_model.gd",
    "mapVisualRenderer": GODOT_PROJECT
    / "scripts"
    / "world"
    / "map_visual_renderer.gd",
    "interactionModel": GODOT_PROJECT
    / "scripts"
    / "world"
    / "interaction_model.gd",
    "mapVisualCatalog": GODOT_PROJECT
    / "scripts"
    / "world"
    / "map_visual_catalog.gd",
    "worldCameraSafeAreaModel": GODOT_PROJECT
    / "scripts"
    / "world"
    / "world_camera_safe_area_model.gd",
    "mapVisualReviewShowcaseProfile": GODOT_PROJECT
    / "scripts"
    / "qa"
    / "map_visual_review_showcase_profile.gd",
    "mainScene": GODOT_PROJECT / "scenes" / "Main.tscn",
    "mainScript": GODOT_PROJECT / "scripts" / "main.gd",
    "autoCheckCoordinator": GODOT_PROJECT
    / "scripts"
    / "qa"
    / "auto_check_coordinator.gd",
    "godotProjectSettings": GODOT_PROJECT / "project.godot",
    "mapRecorderHelper": MAP_RECORDER_PATH,
    "mediaCoreHelper": MEDIA_CORE_PATH,
    "landmarkRecorderHelper": LANDMARK_RECORDER_PATH,
    "mapEvidenceBuilder": MAP_BUILDER_PATH,
    "qaLaneHelper": QA_LANE_HELPER_PATH,
    "hudGlyphHelper": HUD_GLYPH_HELPER_PATH,
    "petCodexRecorder": PET_CODEX_RECORDER_PATH,
    "battleLayoutRecorder": BATTLE_LAYOUT_RECORDER_PATH,
    "battleLayoutPerf": BATTLE_LAYOUT_PERF_PATH,
    "autoCheckRunner": AUTO_CHECK_RUNNER_PATH,
}

GODOT_REVIEW_AUTH_RESOURCES: dict[str, Path] = {
    "res://scripts/qa/earth_vein_review_batch_capture.gd": BATCH_CONTROLLER_PATH,
    "res://scripts/qa/map_visual_review_capture.gd": HARNESS_PATHS[
        "mapCaptureController"
    ],
    "res://scripts/qa/runtime_exit_cleanup.gd": HARNESS_PATHS[
        "runtimeExitCleanup"
    ],
    "res://scripts/audio/game_audio_manager.gd": HARNESS_PATHS[
        "gameAudioManager"
    ],
    "res://scripts/audio/battle_audio_timeline_controller.gd": HARNESS_PATHS[
        "battleAudioTimelineController"
    ],
    "res://scripts/audio/battle_audio_cue_model.gd": HARNESS_PATHS[
        "battleAudioCueModel"
    ],
    "res://assets/audio/beastbound_audio_v2/audio-cues.json": HARNESS_PATHS[
        "audioCueCatalog"
    ],
    "res://data/audio_ambience_release_gate_v1.json": HARNESS_PATHS[
        "audioAmbienceReleaseGate"
    ],
    "res://scripts/world/isometric_map_model.gd": HARNESS_PATHS[
        "isometricMapModel"
    ],
    "res://scripts/world/interaction_model.gd": HARNESS_PATHS[
        "interactionModel"
    ],
    "res://scripts/progression/player_progress_model.gd": HARNESS_PATHS[
        "playerProgressModel"
    ],
    "res://scripts/world/map_visual_catalog.gd": HARNESS_PATHS[
        "mapVisualCatalog"
    ],
    "res://scripts/world/map_visual_renderer.gd": HARNESS_PATHS[
        "mapVisualRenderer"
    ],
    "res://scripts/world/world_camera_safe_area_model.gd": HARNESS_PATHS[
        "worldCameraSafeAreaModel"
    ],
    "res://scripts/qa/map_visual_review_showcase_profile.gd": HARNESS_PATHS[
        "mapVisualReviewShowcaseProfile"
    ],
    "res://scenes/Main.tscn": HARNESS_PATHS["mainScene"],
    "res://scripts/main.gd": HARNESS_PATHS["mainScript"],
}


class EarthVeinBatchRecordingError(RuntimeError):
    """The fail-closed low-disturbance batch contract failed."""


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _new_run_id() -> str:
    stamp = _utc_now().strftime("%Y%m%dT%H%M%S.%fZ")
    return f"earth-vein-low-disturbance-{stamp}-{uuid.uuid4().hex[:8]}"


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _lexical_absolute(path: Path) -> Path:
    return Path(os.path.abspath(os.fspath(path)))


def _assert_contained_without_symlinks(
    path: Path,
    *,
    root: Path,
    require_regular_file: bool = False,
) -> Path:
    target = _lexical_absolute(path)
    authority_root = _lexical_absolute(root)
    repository = _lexical_absolute(REPO_ROOT)
    try:
        authority_root.relative_to(repository)
        target.relative_to(authority_root)
    except ValueError as error:
        raise EarthVeinBatchRecordingError(
            f"证据路径越出 fresh authorized root：{path}"
        ) from error
    relative = target.relative_to(repository)
    current = repository
    candidates = [repository]
    for component in relative.parts:
        current = current / component
        candidates.append(current)
    for candidate in candidates:
        if not os.path.lexists(candidate):
            continue
        try:
            mode = os.lstat(candidate).st_mode
        except OSError as error:
            raise EarthVeinBatchRecordingError(
                f"无法 lstat 证据路径：{candidate}"
            ) from error
        if stat.S_ISLNK(mode):
            raise EarthVeinBatchRecordingError(
                f"证据路径不得包含 symlink：{candidate}"
            )
    if require_regular_file:
        try:
            mode = os.lstat(target).st_mode
        except OSError as error:
            raise EarthVeinBatchRecordingError(
                f"证据文件不存在：{target}"
            ) from error
        if not stat.S_ISREG(mode):
            raise EarthVeinBatchRecordingError(
                f"证据目标不是普通文件：{target}"
            )
    return target


def _claim_fresh_run_directory(
    *,
    evidence_root: Path,
    output_root: Path,
    run_id: str,
) -> tuple[Path, tuple[int, int]]:
    """Atomically claim a fresh 0700 run directory through no-follow dir fds."""
    repository = _lexical_absolute(REPO_ROOT)
    authority_root = _lexical_absolute(evidence_root)
    destination_root = _lexical_absolute(output_root)
    try:
        authority_root.relative_to(repository)
        destination_root.relative_to(authority_root)
    except ValueError as error:
        raise EarthVeinBatchRecordingError(
            "fresh run directory 越出仓库 .run/evidence authority"
        ) from error
    directory_flags = (
        os.O_RDONLY
        | getattr(os, "O_DIRECTORY", 0)
        | getattr(os, "O_NOFOLLOW", 0)
    )
    descriptors: list[int] = []
    try:
        current_fd = os.open(repository, directory_flags)
        descriptors.append(current_fd)
        for component in destination_root.relative_to(repository).parts:
            if component in {"", ".", ".."}:
                raise EarthVeinBatchRecordingError(
                    "fresh run directory 包含不安全路径组件"
                )
            try:
                os.mkdir(component, mode=0o700, dir_fd=current_fd)
            except FileExistsError:
                pass
            try:
                child_fd = os.open(
                    component,
                    directory_flags,
                    dir_fd=current_fd,
                )
            except OSError as error:
                raise EarthVeinBatchRecordingError(
                    f"fresh run authority 目录不是无链接目录：{component}"
                ) from error
            if not stat.S_ISDIR(os.fstat(child_fd).st_mode):
                os.close(child_fd)
                raise EarthVeinBatchRecordingError(
                    f"fresh run authority 路径不是目录：{component}"
                )
            descriptors.append(child_fd)
            current_fd = child_fd
        try:
            os.mkdir(run_id, mode=0o700, dir_fd=current_fd)
        except FileExistsError as error:
            raise EarthVeinBatchRecordingError(
                f"runId 已存在，证据目录不可覆盖：{run_id}"
            ) from error
        try:
            run_fd = os.open(run_id, directory_flags, dir_fd=current_fd)
        except OSError as error:
            raise EarthVeinBatchRecordingError(
                "无法 no-follow 打开刚 claim 的 run directory"
            ) from error
        descriptors.append(run_fd)
        os.fchmod(run_fd, 0o700)
        descriptor_stat = os.fstat(run_fd)
        run_dir = destination_root / run_id
        path_stat = os.lstat(run_dir)
        if (
            stat.S_ISLNK(path_stat.st_mode)
            or not stat.S_ISDIR(path_stat.st_mode)
            or (path_stat.st_dev, path_stat.st_ino)
            != (descriptor_stat.st_dev, descriptor_stat.st_ino)
        ):
            raise EarthVeinBatchRecordingError(
                "fresh run directory claim 后路径身份发生漂移"
            )
        return run_dir, (descriptor_stat.st_dev, descriptor_stat.st_ino)
    finally:
        for descriptor in reversed(descriptors):
            try:
                os.close(descriptor)
            except OSError:
                pass


def _assert_run_directory_identity(
    run_dir: Path,
    expected: tuple[int, int],
) -> None:
    _assert_contained_without_symlinks(
        run_dir,
        root=REPO_ROOT / ".run" / "evidence",
    )
    try:
        current = os.lstat(run_dir)
    except OSError as error:
        raise EarthVeinBatchRecordingError(
            "fresh run directory 在写入期间消失"
        ) from error
    if (
        not stat.S_ISDIR(current.st_mode)
        or stat.S_ISLNK(current.st_mode)
        or (current.st_dev, current.st_ino) != expected
        or stat.S_IMODE(current.st_mode) != 0o700
    ):
        raise EarthVeinBatchRecordingError(
            "fresh run directory 在写入期间身份或权限漂移"
        )


def _assert_fresh_output_target(path: Path) -> None:
    evidence_root = REPO_ROOT / ".run" / "evidence"
    target = _assert_contained_without_symlinks(path, root=evidence_root)
    parent = _assert_contained_without_symlinks(target.parent, root=evidence_root)
    try:
        parent_mode = os.lstat(parent).st_mode
    except OSError as error:
        raise EarthVeinBatchRecordingError(
            f"输出父目录不存在：{parent}"
        ) from error
    if not stat.S_ISDIR(parent_mode) or os.path.lexists(target):
        raise EarthVeinBatchRecordingError(
            f"输出目标必须是 fresh 普通路径：{target}"
        )


def _assert_regular_output(path: Path) -> None:
    _assert_contained_without_symlinks(
        path,
        root=REPO_ROOT / ".run" / "evidence",
        require_regular_file=True,
    )


def _artifact(path: Path) -> dict[str, Any]:
    _assert_contained_without_symlinks(
        path,
        root=REPO_ROOT,
        require_regular_file=True,
    )
    return CORE._artifact_record(path)


def _harness_snapshot() -> dict[str, dict[str, Any]]:
    return {name: _artifact(path) for name, path in HARNESS_PATHS.items()}


def _review_authorization_payload() -> dict[str, Any]:
    return {
        "schemaVersion": 1,
        "reportType": REVIEW_AUTH_REPORT_TYPE,
        "bundleId": BUNDLE_ID,
        "maps": list(MAP_IDS),
        "modes": list(MODES),
        "scene": MAIN_SCENE,
        "viewport": [EXPECTED_WIDTH, EXPECTED_HEIGHT],
        "launchContract": {
            "entrypoint": "standalone_scene_tree_script",
            "genericPreviewCliFlag": False,
            "authorizationValidatedBeforeMain": True,
            "rootMinimizedUntilIsolationComplete": True,
        },
        "sourceIdentity": {
            resource_path: {
                "sha256": _sha256(local_path),
                "sizeBytes": local_path.stat().st_size,
            }
            for resource_path, local_path in GODOT_REVIEW_AUTH_RESOURCES.items()
        },
    }


def _build_identity_snapshot() -> str:
    try:
        identity = str(MAP_BUILDER.build_identity())
    except BaseException as error:
        raise EarthVeinBatchRecordingError(
            f"map builder build_identity 失败：{error}"
        ) from error
    if not re.fullmatch(
        r"git:[0-9a-f]{40}\+beastbound-map-runtime-surface-v2:[0-9a-f]{64}",
        identity,
    ):
        raise EarthVeinBatchRecordingError("map builder build_identity 格式漂移")
    return identity


def _validate_phase_identity_snapshots(
    snapshots: Mapping[str, Any],
) -> dict[str, Any]:
    required = ("beforeNative", "afterNative", "afterMovie")
    if set(snapshots) != set(required):
        raise EarthVeinBatchRecordingError("build identity phase 快照不完整")
    identities = [snapshots[name].get("buildIdentity") for name in required]
    harnesses = [snapshots[name].get("harness") for name in required]
    if any(not isinstance(value, str) or not value for value in identities):
        raise EarthVeinBatchRecordingError("build identity phase 值无效")
    if len(set(identities)) != 1:
        raise EarthVeinBatchRecordingError("native/movie 期间 runtime build identity 漂移")
    if any(not isinstance(value, dict) for value in harnesses):
        raise EarthVeinBatchRecordingError("harness phase 快照无效")
    if harnesses[0] != harnesses[1] or harnesses[0] != harnesses[2]:
        raise EarthVeinBatchRecordingError("native/movie 期间 recorder/helper/lane hash 漂移")
    return {
        name: {
            "buildIdentity": snapshots[name]["buildIdentity"],
            "harness": snapshots[name]["harness"],
        }
        for name in required
    }


def _phase_identity_snapshot(phase: str) -> dict[str, Any]:
    if phase not in {"beforeNative", "afterNative", "afterMovie"}:
        raise EarthVeinBatchRecordingError("未知 execution identity phase")
    return {
        "phase": phase,
        "buildIdentity": _build_identity_snapshot(),
        "harness": _harness_snapshot(),
    }


def _assert_phase_identity_matches(
    reference: Mapping[str, Any],
    candidate: Mapping[str, Any],
) -> None:
    if reference.get("buildIdentity") != candidate.get("buildIdentity"):
        raise EarthVeinBatchRecordingError(
            f"{candidate.get('phase')} runtime build identity 漂移"
        )
    if reference.get("harness") != candidate.get("harness"):
        raise EarthVeinBatchRecordingError(
            f"{candidate.get('phase')} recorder/helper/lane hash 漂移"
        )


def _write_sha256_manifest_exclusive(
    run_dir: Path,
    paths: Sequence[Path],
) -> Path:
    manifest_path = run_dir / "SHA256SUMS"
    unique: dict[str, Path] = {}
    for candidate in paths:
        path = _assert_contained_without_symlinks(
            candidate,
            root=run_dir,
            require_regular_file=True,
        )
        relative = path.relative_to(_lexical_absolute(run_dir)).as_posix()
        unique[relative] = path
    lines = [
        f"{_sha256(unique[relative])}  {relative}"
        for relative in sorted(unique)
    ]
    payload = ("\n".join(lines) + "\n").encode("utf-8")
    temporary = manifest_path.with_name(
        f".{manifest_path.name}.{uuid.uuid4().hex}.tmp"
    )
    descriptor: int | None = None
    committed = False
    try:
        descriptor = os.open(
            temporary,
            os.O_CREAT | os.O_EXCL | os.O_WRONLY,
            0o600,
        )
        offset = 0
        while offset < len(payload):
            written = os.write(descriptor, payload[offset:])
            if written <= 0:
                raise EarthVeinBatchRecordingError("SHA256 清单发生短写")
            offset += written
        os.fsync(descriptor)
        os.close(descriptor)
        descriptor = None
        os.link(temporary, manifest_path, follow_symlinks=False)
        committed = True
        try:
            CORE._fsync_parent_directory(manifest_path)
        except BaseException:
            pass
        return manifest_path
    except FileExistsError as error:
        raise EarthVeinBatchRecordingError(
            "SHA256 清单 final path 已存在，拒绝覆盖"
        ) from error
    finally:
        if descriptor is not None:
            os.close(descriptor)
        try:
            temporary.unlink()
        except FileNotFoundError:
            pass
        if committed and manifest_path.read_bytes() != payload:
            raise EarthVeinBatchRecordingError("SHA256 清单提交后 bytes 漂移")


def _write_bytes_exclusive(path: Path, payload: bytes) -> Path:
    _assert_fresh_output_target(path)
    temporary = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
    descriptor: int | None = None
    committed = False
    try:
        descriptor = os.open(
            temporary,
            os.O_CREAT
            | os.O_EXCL
            | os.O_WRONLY
            | getattr(os, "O_NOFOLLOW", 0),
            0o600,
        )
        offset = 0
        while offset < len(payload):
            written = os.write(descriptor, payload[offset:])
            if written <= 0:
                raise EarthVeinBatchRecordingError("exclusive artifact 短写")
            offset += written
        os.fsync(descriptor)
        os.close(descriptor)
        descriptor = None
        os.link(temporary, path, follow_symlinks=False)
        committed = True
        _assert_regular_output(path)
        if path.read_bytes() != payload:
            raise EarthVeinBatchRecordingError("exclusive artifact bytes 漂移")
        return path
    except FileExistsError as error:
        raise EarthVeinBatchRecordingError(
            f"exclusive artifact 已存在，拒绝覆盖：{path}"
        ) from error
    finally:
        if descriptor is not None:
            os.close(descriptor)
        try:
            temporary.unlink()
        except FileNotFoundError:
            pass
        if committed:
            _assert_regular_output(path)


def _run_logged_exclusive(
    command: Sequence[str],
    *,
    log_path: Path,
    timeout_seconds: float,
    environment: Mapping[str, str],
) -> None:
    _assert_fresh_output_target(log_path)
    descriptor = os.open(
        log_path,
        os.O_CREAT
        | os.O_EXCL
        | os.O_WRONLY
        | getattr(os, "O_NOFOLLOW", 0),
        0o600,
    )
    descriptor_identity = os.fstat(descriptor)
    process: subprocess.Popen[str] | None = None
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as log:
            descriptor = -1
            log.write(f"$ {shlex.join(CORE._redacted_command(command))}\n")
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
            try:
                return_code = process.wait(timeout=timeout_seconds)
            except subprocess.TimeoutExpired as error:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait(timeout=5)
                raise EarthVeinBatchRecordingError(
                    f"exclusive concat 超时：{timeout_seconds:.1f}s"
                ) from error
        if return_code != 0:
            raise EarthVeinBatchRecordingError(
                f"exclusive concat 失败 exit={return_code}"
            )
    finally:
        if descriptor >= 0:
            os.close(descriptor)
        current = os.lstat(log_path)
        if (
            not stat.S_ISREG(current.st_mode)
            or (current.st_dev, current.st_ino)
            != (descriptor_identity.st_dev, descriptor_identity.st_ino)
        ):
            raise EarthVeinBatchRecordingError("exclusive concat log identity 漂移")


def _validate_concat_temp_media(
    ffmpeg: str,
    ffprobe: str,
    video_path: Path,
) -> dict[str, Any]:
    decoded = CORE._run_capture(
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
        timeout_seconds=180.0,
    )
    if decoded.returncode != 0:
        raise EarthVeinBatchRecordingError(
            f"concat temp 完整音视频 decode 失败 exit={decoded.returncode}"
        )
    completed = CORE._run_capture(
        [
            ffprobe,
            "-v",
            "error",
            "-count_frames",
            "-show_entries",
            (
                "stream=index,codec_type,codec_name,pix_fmt,width,height,"
                "r_frame_rate,avg_frame_rate,nb_frames,nb_read_frames,duration,"
                "sample_rate,channels:format=format_name,duration,size"
            ),
            "-of",
            "json",
            str(video_path),
        ],
        timeout_seconds=180.0,
    )
    if completed.returncode != 0:
        raise EarthVeinBatchRecordingError(
            f"concat temp ffprobe 失败 exit={completed.returncode}"
        )
    try:
        probe = json.loads(completed.stdout)
    except json.JSONDecodeError as error:
        raise EarthVeinBatchRecordingError(
            "concat temp ffprobe JSON 无效"
        ) from error
    if not isinstance(probe, dict):
        raise EarthVeinBatchRecordingError("concat temp ffprobe 根节点无效")
    return {
        **MAP_RECORDER._validate_probe(probe),
        "fullAudioVideoDecode": "passed",
    }


def _concat_segments_secure(
    *,
    ffmpeg: str,
    ffprobe: str,
    videos: Sequence[Path],
    list_path: Path,
    output_path: Path,
    log_path: Path,
    timeout_seconds: float,
    environment: Mapping[str, str],
) -> dict[str, Any]:
    if len(videos) != EXPECTED_FLOOR_SEGMENTS:
        raise EarthVeinBatchRecordingError("concat 必须精确包含 8 个片段")
    for video in videos:
        _assert_regular_output(video)
    _assert_fresh_output_target(list_path)
    _assert_fresh_output_target(log_path)
    _assert_fresh_output_target(output_path)
    temporary_output = output_path.with_name(
        f".{output_path.stem}.{uuid.uuid4().hex}.tmp{output_path.suffix}"
    )
    _assert_fresh_output_target(temporary_output)
    payload = "".join(
        "file '%s'\n" % video.as_posix().replace("'", "'\\''")
        for video in videos
    ).encode("utf-8")
    _write_bytes_exclusive(list_path, payload)
    command = [
        ffmpeg,
        "-n",
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
        str(temporary_output),
    ]
    committed = False
    try:
        _run_logged_exclusive(
            command,
            log_path=log_path,
            timeout_seconds=timeout_seconds,
            environment=environment,
        )
        _assert_regular_output(temporary_output)
        media = _validate_concat_temp_media(ffmpeg, ffprobe, temporary_output)
        _assert_fresh_output_target(output_path)
        os.link(temporary_output, output_path, follow_symlinks=False)
        committed = True
        _assert_regular_output(output_path)
        temporary_stat = os.lstat(temporary_output)
        final_stat = os.lstat(output_path)
        if (
            (temporary_stat.st_dev, temporary_stat.st_ino)
            != (final_stat.st_dev, final_stat.st_ino)
            or _sha256(temporary_output) != _sha256(output_path)
        ):
            raise EarthVeinBatchRecordingError(
                "concat atomic publish inode/hash 漂移"
            )
        return {
            "command": command,
            "temporaryOutputPublishedAtomically": True,
            "mediaValidation": media,
            "list": _artifact(list_path),
            "log": _artifact(log_path),
            "output": _artifact(output_path),
        }
    except FileExistsError as error:
        raise EarthVeinBatchRecordingError(
            "concat final MP4 已存在或竞态插入，拒绝覆盖"
        ) from error
    finally:
        try:
            temporary_output.unlink()
        except FileNotFoundError:
            pass
        if committed:
            _assert_regular_output(output_path)


def _retained_evidence_files(run_dir: Path) -> list[Path]:
    retained: list[Path] = []
    for path in run_dir.rglob("*"):
        mode = os.lstat(path).st_mode
        if stat.S_ISLNK(mode):
            raise EarthVeinBatchRecordingError(
                f"retained evidence 不得包含 symlink：{path}"
            )
        if not stat.S_ISREG(mode):
            continue
        relative = path.relative_to(run_dir)
        if path.name == "SHA256SUMS" or relative.parts[0] == "tmp":
            continue
        _assert_contained_without_symlinks(
            path,
            root=run_dir,
            require_regular_file=True,
        )
        retained.append(path)
    return sorted(retained, key=lambda path: path.relative_to(run_dir).as_posix())


def _expected_sequence() -> list[str]:
    return [
        *(f"{map_id}:{mode}" for map_id in MAP_IDS for mode in MODES),
        "earth_vein_cave_f4:landmark",
    ]


def _command(
    *,
    godot: str,
    capture_pass: str,
    output_root: Path,
    report_path: Path,
    avi_path: Path | None,
) -> list[str]:
    if capture_pass not in {"native", "movie"}:
        raise EarthVeinBatchRecordingError("batch pass 只能是 native 或 movie")
    if (capture_pass == "native") != (avi_path is None):
        raise EarthVeinBatchRecordingError("batch pass 与 MovieWriter 参数不一致")
    if not output_root.is_absolute() or not report_path.is_absolute():
        raise EarthVeinBatchRecordingError("batch 输出必须使用绝对路径")
    command = [
        godot,
        "--audio-driver",
        "Dummy",
        "--path",
        str(GODOT_PROJECT),
        "--script",
        BATCH_CONTROLLER,
        "--windowed",
        "--resolution",
        f"{EXPECTED_WIDTH}x{EXPECTED_HEIGHT}",
        "--single-window",
        "--time-scale",
        "1.0",
        "--fixed-fps",
        str(EXPECTED_FPS),
        "--disable-vsync",
    ]
    if avi_path is not None:
        command.extend(
            [
                "--write-movie",
                str(avi_path),
            ]
        )
    command.extend(
        [
            "--",
            f"--earth-vein-review-batch-output-root={output_root}",
            f"--earth-vein-review-batch-report={report_path}",
            f"--earth-vein-review-batch-pass={capture_pass}",
            CORE.QA_LANE_ARGUMENT,
        ]
    )
    if (
        command.count("--script") != 1
        or command.count(BATCH_CONTROLLER) != 1
        or "--map-art-review-preview" in command
        or command.count(CORE.QA_LANE_ARGUMENT) != 1
        or command.count("--write-movie") != (1 if avi_path else 0)
        or command.count("--audio-driver") != 1
        or command[command.index("--audio-driver") + 1] != "Dummy"
        or command.count("--fixed-fps") != 1
        or command[command.index("--fixed-fps") + 1] != str(EXPECTED_FPS)
        or command.count("--disable-vsync") != 1
        or "--scene" in command
        or "--login" in command
        or "--server-url" in command
        or "--user-data-dir" in command
    ):
        raise EarthVeinBatchRecordingError("低打扰 Godot 命令边界不精确")
    return command


def launch_contract(
    *,
    godot: str = "godot",
    root: Path | None = None,
) -> dict[str, Any]:
    """Return the exact visible-window budget without executing anything."""
    base = (root or (REPO_ROOT / ".run" / "evidence" / "contract")).resolve()
    native_root = base / "batch" / "native"
    movie_root = base / "batch" / "movie"
    native = _command(
        godot=godot,
        capture_pass="native",
        output_root=native_root,
        report_path=native_root / "batch-report.json",
        avi_path=None,
    )
    movie = _command(
        godot=godot,
        capture_pass="movie",
        output_root=movie_root,
        report_path=movie_root / "batch-report.json",
        avi_path=base / "earth-vein-review-batch.avi",
    )
    return _launch_contract_from_commands(native, movie)


def _launch_contract_from_commands(
    native: Sequence[str],
    movie: Sequence[str],
) -> dict[str, Any]:
    if (
        native.count("--write-movie") != 0
        or movie.count("--write-movie") != 1
        or native.count("--audio-driver") != 1
        or movie.count("--audio-driver") != 1
        or native[native.index("--audio-driver") + 1] != "Dummy"
        or movie[movie.index("--audio-driver") + 1] != "Dummy"
        or native.count(BATCH_CONTROLLER) != 1
        or movie.count(BATCH_CONTROLLER) != 1
        or "--map-art-review-preview" in native
        or "--map-art-review-preview" in movie
    ):
        raise EarthVeinBatchRecordingError("可见进程预算命令不精确")
    return {
        "contract": "persistent_main_two_pass_v1",
        "nativeProcessCount": 1,
        "movieWriterProcessCount": 1,
        "visibleWindowOpenCloseCycles": 2,
        "mainSceneInstancesPerProcess": 1,
        "fourFloorSegments": EXPECTED_FLOOR_SEGMENTS,
        "landmarkSegments": EXPECTED_LANDMARK_SEGMENTS,
        "legacyVisibleCaptureProcessesAvoided": 16,
        "commands": {
            "native": CORE._redacted_command(native),
            "movie": CORE._redacted_command(movie),
        },
    }


def _payload_from_log(path: Path, *, movie_mode: bool) -> dict[str, Any]:
    text = path.read_text(encoding="utf-8", errors="replace")
    forbidden = (
        "SCRIPT ERROR:",
        "Parse Error:",
        "ERROR:",
        "WARNING:",
        "ObjectDB instances were leaked",
        "resources still in use at exit",
        "Orphan StringName",
    )
    found = [token for token in forbidden if token in text]
    if found:
        raise EarthVeinBatchRecordingError(
            "Earth batch Godot 日志存在错误或泄漏：" + ", ".join(found)
        )
    if "Metal 4.0 - Forward Mobile" not in text:
        raise EarthVeinBatchRecordingError("Earth batch 没有使用 Metal Forward Mobile")
    movie_marker = "Movie Maker mode enabled, recording movie in 1280×720 @ 30 FPS"
    if movie_mode and movie_marker not in text:
        raise EarthVeinBatchRecordingError("Earth batch MovieWriter 合同缺失")
    if not movie_mode and movie_marker in text:
        raise EarthVeinBatchRecordingError("Earth batch native 误启 MovieWriter")
    prefix = "earth vein review batch capture: "
    payloads = [
        line[len(prefix) :]
        for line in text.splitlines()
        if line.startswith(prefix)
    ]
    if len(payloads) != 1:
        raise EarthVeinBatchRecordingError("Earth batch 必须只有一条最终回执")
    try:
        payload = json.loads(payloads[0])
    except json.JSONDecodeError as error:
        raise EarthVeinBatchRecordingError("Earth batch 最终回执无法解析") from error
    expected_pass = "movie" if movie_mode else "native"
    startup_isolation = payload.get("startupIsolation") if isinstance(payload, dict) else None
    review_authorization = (
        payload.get("reviewAuthorization") if isinstance(payload, dict) else None
    )
    if (
        not isinstance(payload, dict)
        or payload.get("result") != "PASS"
        or payload.get("capturePass") != expected_pass
        or payload.get("mainSceneLoadCount") != 1
        or payload.get("mainSceneInstanceCount") != 1
        or payload.get("godotProcessInstanceCount") != 1
        or payload.get("windowLifecycle") != "persistent_single_window"
        or payload.get("windowOpenCloseCycles") != 1
        or payload.get("fourFloorSegmentCount") != EXPECTED_FLOOR_SEGMENTS
        or payload.get("landmarkSegmentCount") != EXPECTED_LANDMARK_SEGMENTS
        or payload.get("captureSequence") != _expected_sequence()
        or payload.get("processFrameOrigin") != 0
        or payload.get("movieWriterFrameOrigin") != 0
        or payload.get("frameIndexContract")
        != "zero_based_start_inclusive_end_exclusive_v1"
        or type(payload.get("processFrameEndExclusive")) is not int
        or payload.get("processFrameEndExclusive", 0) <= 0
        or payload.get("movieWriterTerminalFrameCount") != 1
        or payload.get("movieWriterExpectedFrameCount")
        != payload.get("processFrameEndExclusive", 0) + 1
        or type(payload.get("captureFrameStartInclusive")) is not int
        or payload.get("captureFrameStartInclusive", 0) <= 0
        or payload.get("preRollFrameCount")
        != payload.get("captureFrameStartInclusive")
        or payload.get("lastSegmentEndExclusive")
        != payload.get("processFrameEndExclusive")
        or payload.get("movieWriterExportFrameRange") != {
            "indexBasis": "movie_writer_zero_based_v1",
            "startFrameInclusive": payload.get("captureFrameStartInclusive"),
            "endFrameExclusive": payload.get("processFrameEndExclusive"),
            "frameCount": payload.get("processFrameEndExclusive", 0)
            - payload.get("captureFrameStartInclusive", 0),
        }
        or not isinstance(startup_isolation, dict)
        or startup_isolation.get("status") != "passed"
        or startup_isolation.get("accountSessionCleared") is not True
        or startup_isolation.get("defaultProfileRestored") is not True
        or startup_isolation.get("accountAuthenticated") is not False
        or startup_isolation.get("authAutoBypass") is not False
        or startup_isolation.get("profileSaveEnabled") is not False
        or startup_isolation.get("gmVisibilityRefreshed") is not True
        or startup_isolation.get("authPanelHidden") is not True
        or startup_isolation.get("qaMenuHidden") is not True
        or startup_isolation.get("qaPanelHidden") is not True
        or startup_isolation.get("numericWorkbenchHidden") is not True
        or startup_isolation.get("rootMinimizedUntilIsolationComplete") is not True
        or not isinstance(startup_isolation.get("audioIsolation"), dict)
        or startup_isolation["audioIsolation"].get("status") != "passed"
        or not isinstance(review_authorization, dict)
        or review_authorization.get("status") != "passed"
        or review_authorization.get("validatedBeforeMain") is not True
        or review_authorization.get("genericPreviewCliFlagPresent") is not False
    ):
        raise EarthVeinBatchRecordingError("Earth batch 最终回执不满足单窗口完整计划")
    stages = payload.get("stages")
    if not isinstance(stages, list) or len(stages) != 9:
        raise EarthVeinBatchRecordingError("Earth batch 日志 stages 不完整")
    _validate_frame_ranges(
        stages,
        process_frame_end_exclusive=payload["processFrameEndExclusive"],
    )
    _validate_runtime_identity_contract(payload, stages)
    return payload


def _read_json(path: Path, *, label: str) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise EarthVeinBatchRecordingError(f"{label} 无法解析：{path}") from error
    if not isinstance(value, dict):
        raise EarthVeinBatchRecordingError(f"{label} 根节点必须是 object")
    return value


def _require_godot_artifact(
    record: Any,
    *,
    expected_path: Path,
    label: str,
) -> dict[str, Any]:
    if not isinstance(record, dict):
        raise EarthVeinBatchRecordingError(f"{label} artifact 缺失")
    declared_text = record.get("path")
    if not isinstance(declared_text, str) or not declared_text:
        raise EarthVeinBatchRecordingError(f"{label} artifact 路径无效")
    declared = Path(declared_text)
    expected = _lexical_absolute(expected_path)
    if not declared.is_absolute() or declared != expected:
        raise EarthVeinBatchRecordingError(f"{label} artifact 路径漂移")
    path = declared
    _assert_contained_without_symlinks(
        path,
        root=expected_path.parent.parent,
        require_regular_file=True,
    )
    if (
        record.get("sha256") != _sha256(path)
        or type(record.get("sizeBytes")) is not int
        or record.get("sizeBytes") != path.stat().st_size
        or path.stat().st_size <= 0
    ):
        raise EarthVeinBatchRecordingError(f"{label} artifact hash/size 漂移")
    return record


def _validate_harness_hashes(records: Any) -> list[dict[str, Any]]:
    expected = GODOT_REVIEW_AUTH_RESOURCES
    if not isinstance(records, list) or len(records) != len(expected):
        raise EarthVeinBatchRecordingError("Godot harness hash 集不完整")
    by_path = {
        str(record.get("path", "")): record
        for record in records
        if isinstance(record, dict)
    }
    if set(by_path) != set(expected):
        raise EarthVeinBatchRecordingError("Godot harness path 集漂移")
    validated: list[dict[str, Any]] = []
    for resource_path, local_path in expected.items():
        record = by_path[resource_path]
        if (
            record.get("sha256") != _sha256(local_path)
            or record.get("sizeBytes") != local_path.stat().st_size
        ):
            raise EarthVeinBatchRecordingError(
                f"Godot harness hash 漂移：{resource_path}"
            )
        validated.append(dict(record))
    return validated


def _validate_frame_ranges(
    stages: Sequence[Mapping[str, Any]],
    *,
    process_frame_end_exclusive: int,
) -> None:
    if type(process_frame_end_exclusive) is not int or process_frame_end_exclusive <= 0:
        raise EarthVeinBatchRecordingError("batch process frame end 无效")
    previous_end = -1
    for index, stage in enumerate(stages):
        frame_range = stage.get("processFrameRange")
        if not isinstance(frame_range, dict):
            raise EarthVeinBatchRecordingError(f"stage[{index}] 缺少 frame range")
        expected_range_keys = {
            "indexBasis",
            "origin",
            "start",
            "startFrameInclusive",
            "endExclusive",
            "endFrameExclusive",
            "frameCount",
            "inProcessReviewHoldFrameCount",
        }
        if set(frame_range) != expected_range_keys:
            raise EarthVeinBatchRecordingError(f"stage[{index}] frame range schema 漂移")
        start = frame_range.get("start")
        end = frame_range.get("endExclusive")
        count = frame_range.get("frameCount")
        hold_count = frame_range.get("inProcessReviewHoldFrameCount")
        expected_hold_count = 120 if stage.get("kind") == "landmark" else 0
        if (
            type(start) is not int
            or type(end) is not int
            or type(count) is not int
            or type(hold_count) is not int
            or frame_range.get("indexBasis") != "movie_writer_zero_based_v1"
            or frame_range.get("origin") != 0
            or frame_range.get("startFrameInclusive") != start
            or frame_range.get("endFrameExclusive") != end
            or start < 0
            or end <= start
            or count != end - start
            or hold_count != expected_hold_count
            or hold_count > count
            or start < previous_end
            or end > process_frame_end_exclusive
        ):
            raise EarthVeinBatchRecordingError(f"stage[{index}] frame range 不精确")
        previous_end = end
    if not stages or previous_end != process_frame_end_exclusive:
        raise EarthVeinBatchRecordingError(
            "最后 stage endExclusive 必须精确等于 process frame end"
        )


DETERMINISTIC_CAPTURE_FIELDS = (
    "startCell",
    "targetCell",
    "endCell",
    "captureVariant",
    "groundDrawCount",
    "objectCount",
    "tileCounts",
    "bundleId",
    "mapStyleId",
    "mapArtStatus",
)


def _deterministic_capture_contract(stage: Mapping[str, Any]) -> dict[str, Any]:
    capture_record = stage.get("captureReport")
    if not isinstance(capture_record, dict):
        raise EarthVeinBatchRecordingError("stage capture report artifact 缺失")
    path_text = capture_record.get("path")
    if not isinstance(path_text, str) or not path_text:
        raise EarthVeinBatchRecordingError("stage capture report path 缺失")
    capture = _read_json(Path(path_text), label="stage deterministic capture")
    projection = {key: capture.get(key) for key in DETERMINISTIC_CAPTURE_FIELDS}
    for cell_key in ("startCell", "targetCell", "endCell"):
        cell = projection[cell_key]
        if (
            not isinstance(cell, list)
            or len(cell) != 2
            or any(type(value) is not int for value in cell)
        ):
            raise EarthVeinBatchRecordingError(f"stage {cell_key} 不是精确 cell")
    if projection["captureVariant"] != stage.get("captureVariant"):
        raise EarthVeinBatchRecordingError("stage captureVariant 与报告不一致")
    if (
        type(projection["groundDrawCount"]) is not int
        or projection["groundDrawCount"] <= 0
        or type(projection["objectCount"]) is not int
        or projection["objectCount"] <= 0
        or not isinstance(projection["tileCounts"], dict)
        or not projection["tileCounts"]
        or any(
            type(value) is not int or value < 0
            for value in projection["tileCounts"].values()
        )
        or projection["bundleId"] != BUNDLE_ID
        or not isinstance(projection["mapStyleId"], str)
        or not projection["mapStyleId"]
        or projection["mapArtStatus"] != "owner_review_pending"
    ):
        raise EarthVeinBatchRecordingError("stage tile/object/bundle/style/status 合同失败")
    return projection


def _validate_native_movie_stage_parity(
    native_stages: Sequence[Mapping[str, Any]],
    movie_stages: Sequence[Mapping[str, Any]],
) -> list[dict[str, Any]]:
    if len(native_stages) != 9 or len(movie_stages) != 9:
        raise EarthVeinBatchRecordingError("native/movie parity 必须覆盖 8+1 stages")
    for stages in (native_stages, movie_stages):
        _validate_frame_ranges(
            stages,
            process_frame_end_exclusive=stages[-1].get(
                "processFrameRange", {}
            ).get("endExclusive"),
        )
    parity: list[dict[str, Any]] = []
    for index, (native_stage, movie_stage) in enumerate(
        zip(native_stages, movie_stages)
    ):
        stage_identity_fields = ("kind", "mapId", "mode", "captureVariant")
        native_identity = {
            key: native_stage.get(key) for key in stage_identity_fields
        }
        movie_identity = {
            key: movie_stage.get(key) for key in stage_identity_fields
        }
        if native_identity != movie_identity:
            raise EarthVeinBatchRecordingError(
                f"native/movie stage[{index}] identity 漂移"
            )
        native_range = native_stage["processFrameRange"]
        movie_range = movie_stage["processFrameRange"]
        # These are separate native processes. Window transitions and render
        # preparation can consume different numbers of frames before a stage.
        # Compare the captured duration/hold, retaining each process's exact
        # absolute range for validation and trimming the MovieWriter source.
        relative_frame_fields = (
            "indexBasis", "origin", "frameCount", "inProcessReviewHoldFrameCount"
        )
        if any(
            native_range[key] != movie_range[key] for key in relative_frame_fields
        ):
            raise EarthVeinBatchRecordingError(
                f"native/movie stage[{index}] capture frame duration/basis 漂移"
            )
        native_contract = _deterministic_capture_contract(native_stage)
        movie_contract = _deterministic_capture_contract(movie_stage)
        if native_contract != movie_contract:
            changed = [
                key
                for key in DETERMINISTIC_CAPTURE_FIELDS
                if native_contract.get(key) != movie_contract.get(key)
            ]
            raise EarthVeinBatchRecordingError(
                f"native/movie stage[{index}] deterministic fields 漂移："
                + ",".join(changed)
            )
        parity.append(
            {
                "index": index,
                **native_identity,
                "nativeProcessFrameRange": native_range,
                "movieProcessFrameRange": movie_range,
                "relativeFrameContract": {
                    key: native_range[key] for key in relative_frame_fields
                },
                "deterministicCapture": native_contract,
                "status": "passed",
            }
        )
    return parity


def _validate_native_movie_frame_basis(
    native_report: Mapping[str, Any], movie_report: Mapping[str, Any]
) -> None:
    # Absolute totals include each process's own asynchronous setup. They are
    # checked against its final stage and (for movie) the actual raw AVI below.
    for key in (
        "processFrameOrigin",
        "movieWriterFrameOrigin",
        "frameIndexContract",
        "movieWriterTerminalFrameCount",
    ):
        if native_report.get(key) != movie_report.get(key):
            raise EarthVeinBatchRecordingError(
                f"native/movie batch frame contract 漂移：{key}"
            )


def _validate_runtime_identity_contract(
    report: Mapping[str, Any],
    stages: Sequence[Mapping[str, Any]],
) -> dict[str, Any]:
    runtime = report.get("runtimeIdentity")
    if not isinstance(runtime, dict) or set(runtime) != {
        "preMain",
        "initial",
        "final",
    }:
        raise EarthVeinBatchRecordingError("batch runtime identity 结构漂移")
    pre_main = runtime.get("preMain")
    initial = runtime.get("initial")
    final = runtime.get("final")
    if not all(isinstance(value, dict) for value in (pre_main, initial, final)):
        raise EarthVeinBatchRecordingError("batch runtime identity checkpoint 缺失")
    root_window_id = report.get("rootWindowId")
    process_id = initial.get("processId")
    if (
        type(root_window_id) is not int
        or root_window_id < 0
        or type(process_id) is not int
        or process_id <= 0
        or pre_main.get("rootWindowId") != root_window_id
        or pre_main.get("displayServerWindowCount") != 1
        or pre_main.get("displayServerWindowIds") != [root_window_id]
        or type(pre_main.get("rootWindowMode")) is not int
        or pre_main.get("rootWindowMode") != 1
        or pre_main.get("mainSceneInstanceCount") != 0
        or pre_main.get("audioDriver") != EXPECTED_AUDIO_DRIVER
    ):
        raise EarthVeinBatchRecordingError(
            "batch pre-Main minimized/Main/Dummy-audio identity 失败"
        )

    checkpoints: list[Mapping[str, Any]] = [initial, final]
    for index, stage in enumerate(stages):
        stage_runtime = stage.get("runtimeIdentity")
        if not isinstance(stage_runtime, dict) or set(stage_runtime) != {
            "before",
            "after",
        }:
            raise EarthVeinBatchRecordingError(
                f"stage[{index}] runtime identity 缺失"
            )
        before = stage_runtime.get("before")
        after = stage_runtime.get("after")
        if not isinstance(before, dict) or not isinstance(after, dict):
            raise EarthVeinBatchRecordingError(
                f"stage[{index}] runtime checkpoints 无效"
            )
        checkpoints.extend((before, after))
    for checkpoint in checkpoints:
        if (
            checkpoint.get("processId") != process_id
            or checkpoint.get("displayServerWindowCount") != 1
            or checkpoint.get("displayServerWindowIds") != [root_window_id]
            or checkpoint.get("rootWindowId") != root_window_id
            or checkpoint.get("rootWindowVisible") is not True
            or type(checkpoint.get("rootWindowMode")) is not int
            or checkpoint.get("rootWindowMode") != 0
            or checkpoint.get("mainSceneInstanceCount") != 1
            or checkpoint.get("audioDriver") != EXPECTED_AUDIO_DRIVER
        ):
            raise EarthVeinBatchRecordingError(
                "batch window/Main/Dummy-audio runtime identity checkpoint 漂移"
            )
    if (
        report.get("mainSceneInstanceCount")
        != final.get("mainSceneInstanceCount")
        or report.get("windowOpenCloseCycles")
        != final.get("displayServerWindowCount")
        or report.get("mainSceneLoadCount") != 1
    ):
        raise EarthVeinBatchRecordingError("batch 顶层 Main/window 不是实测值")
    return {
        "processId": process_id,
        "rootWindowId": root_window_id,
        "checkpointCount": len(checkpoints) + 1,
        "mainSceneInstanceCount": 1,
        "displayServerWindowCount": 1,
        "audioDriver": EXPECTED_AUDIO_DRIVER,
    }


def _runtime_audio_driver_sequence(
    report: Mapping[str, Any],
    stages: Sequence[Mapping[str, Any]],
) -> list[dict[str, str]]:
    runtime = report.get("runtimeIdentity")
    if not isinstance(runtime, dict):
        raise EarthVeinBatchRecordingError("batch runtime identity 缺失")
    if len(stages) != EXPECTED_FLOOR_SEGMENTS + EXPECTED_LANDMARK_SEGMENTS:
        raise EarthVeinBatchRecordingError(
            "batch runtime audio identity 必须精确覆盖 8+1 stages"
        )
    checkpoints: list[tuple[str, Any]] = [
        ("preMain", runtime.get("preMain")),
        ("initial", runtime.get("initial")),
    ]
    for index, stage in enumerate(stages):
        if not isinstance(stage, dict):
            raise EarthVeinBatchRecordingError(
                f"stage[{index}] runtime audio identity 结构无效"
            )
        stage_runtime = stage.get("runtimeIdentity")
        if not isinstance(stage_runtime, dict):
            raise EarthVeinBatchRecordingError(
                f"stage[{index}] runtime audio identity 缺失"
            )
        checkpoints.extend(
            (
                (f"stage[{index}].before", stage_runtime.get("before")),
                (f"stage[{index}].after", stage_runtime.get("after")),
            )
        )
    checkpoints.append(("final", runtime.get("final")))

    sequence: list[dict[str, str]] = []
    for label, checkpoint in checkpoints:
        if not isinstance(checkpoint, dict) or "audioDriver" not in checkpoint:
            raise EarthVeinBatchRecordingError(
                f"{label} runtime audioDriver 字段缺失"
            )
        driver = checkpoint.get("audioDriver")
        if driver != EXPECTED_AUDIO_DRIVER:
            raise EarthVeinBatchRecordingError(
                f"{label} runtime audioDriver 必须精确为 "
                f"{EXPECTED_AUDIO_DRIVER!r}，实际为 {driver!r}"
            )
        sequence.append({"checkpoint": label, "audioDriver": driver})
    return sequence


def _validate_native_movie_runtime_identity_parity(
    native_report: Mapping[str, Any],
    movie_report: Mapping[str, Any],
) -> dict[str, Any]:
    native_stages = native_report.get("stages")
    movie_stages = movie_report.get("stages")
    if (
        not isinstance(native_stages, list)
        or not isinstance(movie_stages, list)
        or len(native_stages)
        != EXPECTED_FLOOR_SEGMENTS + EXPECTED_LANDMARK_SEGMENTS
        or len(movie_stages)
        != EXPECTED_FLOOR_SEGMENTS + EXPECTED_LANDMARK_SEGMENTS
    ):
        raise EarthVeinBatchRecordingError(
            "native/movie runtime audio parity stages 缺失"
        )
    native_sequence = _runtime_audio_driver_sequence(native_report, native_stages)
    movie_sequence = _runtime_audio_driver_sequence(movie_report, movie_stages)
    if native_sequence != movie_sequence:
        raise EarthVeinBatchRecordingError(
            "native/movie runtime audioDriver checkpoint parity 漂移"
        )
    return {
        "status": "passed",
        "audioDriver": EXPECTED_AUDIO_DRIVER,
        "checkpointCountPerPass": len(native_sequence),
    }


def _read_batch_report(
    path: Path,
    *,
    pass_root: Path,
    capture_pass: str,
    review_authorization_path: Path,
    review_authorization_sha: str,
) -> dict[str, Any]:
    _assert_contained_without_symlinks(
        review_authorization_path,
        root=REPO_ROOT / ".run" / "evidence",
        require_regular_file=True,
    )
    if (
        _sha256(review_authorization_path) != review_authorization_sha
        or _read_json(
            review_authorization_path,
            label="review authorization",
        )
        != _review_authorization_payload()
    ):
        raise EarthVeinBatchRecordingError("review authorization bytes/source 漂移")
    expected_report_path = _lexical_absolute(pass_root / "batch-report.json")
    if _lexical_absolute(path) != expected_report_path:
        raise EarthVeinBatchRecordingError("batch report path 漂移")
    _assert_contained_without_symlinks(
        expected_report_path,
        root=pass_root,
        require_regular_file=True,
    )
    report = _read_json(path, label=f"{capture_pass} batch report")
    expected_fields = {
        "result": "PASS",
        "ok": True,
        "bundleId": BUNDLE_ID,
        "ownerReviewStatus": "pending",
        "capturePass": capture_pass,
        "scene": MAIN_SCENE,
        "viewport": [EXPECTED_WIDTH, EXPECTED_HEIGHT],
        "fps": EXPECTED_FPS,
        "playbackSpeed": 1.0,
        "mainSceneLoadCount": 1,
        "mainSceneInstanceCount": 1,
        "godotProcessInstanceCount": 1,
        "windowLifecycle": "persistent_single_window",
        "windowOpenCloseCycles": 1,
        "processFrameOrigin": 0,
        "movieWriterFrameOrigin": 0,
        "frameIndexContract": "zero_based_start_inclusive_end_exclusive_v1",
        "movieWriterTerminalFrameCount": 1,
        "fourFloorSegmentCount": EXPECTED_FLOOR_SEGMENTS,
        "landmarkSegmentCount": EXPECTED_LANDMARK_SEGMENTS,
        "captureSequence": _expected_sequence(),
        "errors": [],
    }
    mismatches = [
        f"{key}={report.get(key)!r}"
        for key, expected in expected_fields.items()
        if report.get(key) != expected
    ]
    if mismatches:
        raise EarthVeinBatchRecordingError(
            f"{capture_pass} batch report 合同失败：" + ", ".join(mismatches)
        )
    if str(report.get("displayServer", "")).lower() == "headless":
        raise EarthVeinBatchRecordingError("batch report 禁止 headless DisplayServer")
    startup_isolation = report.get("startupIsolation")
    if (
        not isinstance(startup_isolation, dict)
        or startup_isolation.get("status") != "passed"
        or startup_isolation.get("accountSessionCleared") is not True
        or startup_isolation.get("defaultProfileRestored") is not True
        or startup_isolation.get("accountAuthenticated") is not False
        or startup_isolation.get("authAutoBypass") is not False
        or startup_isolation.get("profileSaveEnabled") is not False
        or startup_isolation.get("gmVisibilityRefreshed") is not True
        or startup_isolation.get("authPanelHidden") is not True
        or startup_isolation.get("qaMenuHidden") is not True
        or startup_isolation.get("qaPanelHidden") is not True
        or startup_isolation.get("numericWorkbenchHidden") is not True
        or startup_isolation.get("rootMinimizedUntilIsolationComplete") is not True
        or not isinstance(startup_isolation.get("audioIsolation"), dict)
        or startup_isolation["audioIsolation"].get("status") != "passed"
    ):
        raise EarthVeinBatchRecordingError("batch startup isolation 合同失败")
    review_authorization = report.get("reviewAuthorization")
    if (
        not isinstance(review_authorization, dict)
        or review_authorization.get("status") != "passed"
        or review_authorization.get("path")
        != str(_lexical_absolute(review_authorization_path))
        or review_authorization.get("sha256") != review_authorization_sha
        or review_authorization.get("validatedBeforeMain") is not True
        or review_authorization.get("genericPreviewCliFlagPresent") is not False
        or review_authorization.get("sourceIdentityCount")
        != len(GODOT_REVIEW_AUTH_RESOURCES)
    ):
        raise EarthVeinBatchRecordingError("batch pre-Main authorization 合同失败")
    _validate_harness_hashes(report.get("harnessHashes"))
    stages = report.get("stages")
    if not isinstance(stages, list) or len(stages) != 9:
        raise EarthVeinBatchRecordingError("batch stages 必须精确覆盖 8+1")
    process_end = report.get("processFrameEndExclusive")
    if (
        type(process_end) is not int
        or report.get("movieWriterExpectedFrameCount") != process_end + 1
    ):
        raise EarthVeinBatchRecordingError("batch MovieWriter terminal frame 合同失败")
    _validate_frame_ranges(
        stages,
        process_frame_end_exclusive=process_end,
    )
    capture_start = report.get("captureFrameStartInclusive")
    if (
        type(capture_start) is not int
        or capture_start <= 0
        or report.get("preRollFrameCount") != capture_start
        or report.get("lastSegmentEndExclusive") != process_end
        or stages[0].get("processFrameRange", {}).get("start", -1)
        < capture_start
        or report.get("movieWriterExportFrameRange") != {
            "indexBasis": "movie_writer_zero_based_v1",
            "startFrameInclusive": capture_start,
            "endFrameExclusive": process_end,
            "frameCount": process_end - capture_start,
        }
    ):
        raise EarthVeinBatchRecordingError("batch pre-roll/export frame 合同失败")
    _validate_runtime_identity_contract(report, stages)

    expected_stage_keys = [
        *(('four_floor', map_id, mode) for map_id in MAP_IDS for mode in MODES),
        ("landmark", "earth_vein_cave_f4", "moving"),
    ]
    for index, (stage, expected) in enumerate(zip(stages, expected_stage_keys)):
        kind, map_id, mode = expected
        if (
            not isinstance(stage, dict)
            or stage.get("kind") != kind
            or stage.get("mapId") != map_id
            or stage.get("mode") != mode
            or stage.get("captureVariant")
            != (
                "f4_dual_resonance_landmark"
                if kind == "landmark"
                else "default"
            )
            or stage.get("capturePass") != capture_pass
            or stage.get("result") != "PASS"
            or stage.get("errors") != []
        ):
            raise EarthVeinBatchRecordingError(f"stage[{index}] 身份/结果漂移")
        if kind == "four_floor":
            prefix = f"{map_id}-{mode}"
            screenshot_path = pass_root / "segments" / f"{prefix}.png"
            capture_path = pass_root / "segments" / f"{prefix}.json"
            _require_godot_artifact(
                stage.get("screenshot"),
                expected_path=screenshot_path,
                label=f"{capture_pass}:{prefix}:screenshot",
            )
            _require_godot_artifact(
                stage.get("captureReport"),
                expected_path=capture_path,
                label=f"{capture_pass}:{prefix}:report",
            )
            MAP_RECORDER._read_capture_report(
                capture_path,
                map_id=map_id,
                mode=mode,
            )
        else:
            screenshot_path = pass_root / "landmark" / "earth-vein-f4-landmarks.png"
            capture_path = pass_root / "landmark" / "earth-vein-f4-landmarks.json"
            _require_godot_artifact(
                stage.get("screenshot"),
                expected_path=screenshot_path,
                label=f"{capture_pass}:landmark:screenshot",
            )
            _require_godot_artifact(
                stage.get("captureReport"),
                expected_path=capture_path,
                label=f"{capture_pass}:landmark:report",
            )
            LANDMARK_RECORDER._read_report(capture_path)
        cleanup = stage.get("runtimeCleanup")
        if not isinstance(cleanup, dict) or cleanup.get("status") != "passed":
            raise EarthVeinBatchRecordingError(f"stage[{index}] 音频未收口")
    if report.get("finalCleanup") != {
        "status": "not_required",
        "reason": "last_stage_already_drained",
    }:
        raise EarthVeinBatchRecordingError("batch 最终 cleanup authority 漂移")
    return report


def _range_transcode_command(
    *,
    ffmpeg: str,
    raw_movie: Path,
    output_path: Path,
    start_frame: int,
    end_frame: int,
    hold_frames: int,
) -> list[str]:
    if start_frame < 0 or end_frame <= start_frame:
        raise EarthVeinBatchRecordingError("媒体切片 frame range 无效")
    if type(hold_frames) is not int or hold_frames < 0:
        raise EarthVeinBatchRecordingError("媒体切片 hold frames 无效")
    start_seconds = start_frame / EXPECTED_FPS
    end_seconds = end_frame / EXPECTED_FPS
    video_filters = [
        f"trim=start_frame={start_frame}:end_frame={end_frame}",
        "setpts=PTS-STARTPTS",
    ]
    audio_filters = [
        f"atrim=start={start_seconds:.9f}:end={end_seconds:.9f}",
        "asetpts=PTS-STARTPTS",
    ]
    if hold_frames > 0:
        video_filters.append(
            f"tpad=stop_mode=clone:stop={hold_frames}"
        )
        audio_filters.append(
            f"apad=pad_dur={hold_frames / EXPECTED_FPS:.9f}"
        )
    video_filters.extend(["scale=in_range=pc:out_range=tv", "format=yuv420p"])
    return [
        ffmpeg,
        "-n",
        "-v",
        "warning",
        "-i",
        str(raw_movie),
        "-map",
        "0:v:0",
        "-map",
        "0:a:0",
        "-vf",
        ",".join(video_filters),
        "-af",
        ",".join(audio_filters),
        "-c:v",
        "libx264",
        "-preset",
        "slow",
        "-crf",
        "18",
        "-pix_fmt",
        "yuv420p",
        "-color_range",
        "tv",
        "-c:a",
        "aac",
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
        str(output_path),
    ]


def _transcode_range(
    *,
    ffmpeg: str,
    raw_movie: Path,
    output_path: Path,
    log_path: Path,
    frame_range: Mapping[str, Any],
    hold_frames: int,
    timeout_seconds: float,
    environment: Mapping[str, str],
) -> dict[str, Any]:
    _assert_fresh_output_target(output_path)
    command = _range_transcode_command(
        ffmpeg=ffmpeg,
        raw_movie=raw_movie,
        output_path=output_path,
        start_frame=int(frame_range["start"]),
        end_frame=int(frame_range["endExclusive"]),
        hold_frames=hold_frames,
    )
    CORE._run_logged(
        command,
        log_path=log_path,
        timeout_seconds=timeout_seconds,
        environment=dict(environment),
    )
    _assert_regular_output(output_path)
    return {"command": command, "log": _artifact(log_path)}


def _validate_raw_movie_frame_count(
    raw_frame_count: int,
    movie_report: Mapping[str, Any],
) -> dict[str, int]:
    expected = movie_report.get("movieWriterExpectedFrameCount")
    process_end = movie_report.get("processFrameEndExclusive")
    if (
        type(raw_frame_count) is not int
        or type(expected) is not int
        or type(process_end) is not int
        or movie_report.get("processFrameOrigin") != 0
        or movie_report.get("movieWriterFrameOrigin") != 0
        or movie_report.get("movieWriterTerminalFrameCount") != 1
        or expected != process_end + 1
        or raw_frame_count != expected
    ):
        raise EarthVeinBatchRecordingError(
            "batch raw frame count 与零基 process/terminal frame 合同不一致"
        )
    return {
        "processFrameEndExclusive": process_end,
        "terminalFrameCount": 1,
        "expectedRawFrameCount": expected,
        "actualRawFrameCount": raw_frame_count,
    }


def _validate_segment_frame_count(
    media: Mapping[str, Any],
    *,
    frame_range: Mapping[str, Any],
    appended_hold_frames: int,
    label: str,
) -> dict[str, int]:
    source = frame_range.get("frameCount")
    embedded = frame_range.get("inProcessReviewHoldFrameCount")
    actual = media.get("frameCount")
    if (
        type(source) is not int
        or source <= 0
        or type(embedded) is not int
        or embedded < 0
        or embedded > source
        or type(appended_hold_frames) is not int
        or appended_hold_frames < 0
        or type(actual) is not int
    ):
        raise EarthVeinBatchRecordingError(f"{label} frame count 字段无效")
    expected = source + appended_hold_frames
    if actual != expected:
        raise EarthVeinBatchRecordingError(
            f"{label} frame count={actual}, expected={expected}"
        )
    return {
        "sourceFrameCount": source,
        "inProcessReviewHoldFrameCount": embedded,
        "appendedHoldFrameCount": appended_hold_frames,
        "expectedFrameCount": expected,
        "actualFrameCount": actual,
    }


def _validate_concat_frame_count(
    media: Mapping[str, Any],
    segment_frame_contracts: Sequence[Mapping[str, Any]],
) -> dict[str, int]:
    expected = sum(
        int(contract.get("expectedFrameCount", -1))
        for contract in segment_frame_contracts
    )
    appended = sum(
        int(contract.get("appendedHoldFrameCount", -1))
        for contract in segment_frame_contracts
    )
    actual = media.get("frameCount")
    if (
        len(segment_frame_contracts) != EXPECTED_FLOOR_SEGMENTS
        or expected <= 0
        or appended != EXPECTED_FLOOR_SEGMENTS * POST_CAPTURE_HOLD_FRAMES
        or type(actual) is not int
        or actual != expected
    ):
        raise EarthVeinBatchRecordingError(
            f"four-floor concat frame count={actual}, expected={expected}"
        )
    return {
        "segmentCount": len(segment_frame_contracts),
        "sourceFrameCount": expected - appended,
        "appendedHoldFrameCount": appended,
        "expectedFrameCount": expected,
        "actualFrameCount": actual,
    }


def _qa_lane_summary(lane: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "lane": CORE.QA_LANE,
        "feature": CORE.QA_LANE_FEATURE,
        "sourceCheck": lane["sourceCheck"],
        "nativeAttestation": lane["native"]["attestation"],
        "movieAttestation": lane["movie"]["attestation"],
        "cleanup": lane["cleanup"],
        "postCleanupInspect": lane["postCleanupInspect"],
        "lifecycle": _artifact(lane["lifecyclePath"]),
    }


def _record_into(
    args: argparse.Namespace,
    *,
    run_id: str,
    run_dir: Path,
    run_directory_identity: tuple[int, int],
) -> Path:
    _assert_run_directory_identity(run_dir, run_directory_identity)
    timeout_seconds = float(args.timeout_seconds)
    if not math.isfinite(timeout_seconds) or timeout_seconds <= 0:
        raise EarthVeinBatchRecordingError("--timeout-seconds 必须大于 0")
    sample_count = int(args.sample_count)
    if sample_count < 2 or sample_count > 16:
        raise EarthVeinBatchRecordingError("--sample-count 必须介于 2 和 16")
    godot = CORE._require_executable(str(args.godot), label="Godot")
    ffmpeg = CORE._require_executable(str(args.ffmpeg), label="ffmpeg")
    ffprobe = CORE._require_executable(str(args.ffprobe), label="ffprobe")
    temporary_dir = run_dir / "tmp"
    temporary_dir.mkdir()
    base_environment = CORE._isolated_environment(temporary_dir)
    review_authorization_path = run_dir / "review-authorization.json"
    CORE._write_secure_json(
        review_authorization_path,
        _review_authorization_payload(),
        exclusive=True,
    )
    review_authorization_sha = _sha256(review_authorization_path)
    base_environment[REVIEW_AUTH_ENV] = str(review_authorization_path)
    base_environment[REVIEW_AUTH_SHA_ENV] = review_authorization_sha

    batch_dir = run_dir / "batch"
    batch_dir.mkdir()
    native_root = batch_dir / "native"
    movie_root = batch_dir / "movie"
    native_report_path = native_root / "batch-report.json"
    movie_report_path = movie_root / "batch-report.json"
    raw_movie = run_dir / "earth-vein-review-batch.avi"
    lane_dir = run_dir / "qa-lane"
    lane_dir.mkdir(parents=True)
    native_log = run_dir / "earth-vein-review-batch-native-godot.log"
    movie_log = run_dir / "earth-vein-review-batch-movie-godot.log"
    native_command = _command(
        godot=godot,
        capture_pass="native",
        output_root=native_root.resolve(),
        report_path=native_report_path.resolve(),
        avi_path=None,
    )
    movie_command = _command(
        godot=godot,
        capture_pass="movie",
        output_root=movie_root.resolve(),
        report_path=movie_report_path.resolve(),
        avi_path=raw_movie.resolve(),
    )

    _assert_run_directory_identity(run_dir, run_directory_identity)
    _assert_fresh_output_target(raw_movie)

    identity_snapshots: dict[str, dict[str, Any]] = {}
    identity_paths = {
        phase: run_dir / f"execution-identity-{phase}.json"
        for phase in ("beforeNative", "afterNative", "afterMovie")
    }
    identity_snapshots["beforeNative"] = _phase_identity_snapshot(
        "beforeNative"
    )
    CORE._write_secure_json(
        identity_paths["beforeNative"],
        identity_snapshots["beforeNative"],
        exclusive=True,
    )

    def validate_native_log(path: Path) -> dict[str, Any]:
        payload = _payload_from_log(path, movie_mode=False)
        snapshot = _phase_identity_snapshot("afterNative")
        CORE._write_secure_json(
            identity_paths["afterNative"],
            snapshot,
            exclusive=True,
        )
        identity_snapshots["afterNative"] = snapshot
        _assert_phase_identity_matches(
            identity_snapshots["beforeNative"], snapshot
        )
        return payload

    def validate_movie_log(path: Path) -> dict[str, Any]:
        payload = _payload_from_log(path, movie_mode=True)
        snapshot = _phase_identity_snapshot("afterMovie")
        CORE._write_secure_json(
            identity_paths["afterMovie"],
            snapshot,
            exclusive=True,
        )
        identity_snapshots["afterMovie"] = snapshot
        _assert_phase_identity_matches(
            identity_snapshots["beforeNative"], snapshot
        )
        return payload

    lane = CORE._run_official_lane_godot_sequence(
        run_dir=lane_dir,
        godot=godot,
        base_environment=base_environment,
        native_command=native_command,
        movie_command=movie_command,
        native_log=native_log,
        movie_log=movie_log,
        timeout_seconds=timeout_seconds,
        native_log_validator=validate_native_log,
        movie_log_validator=validate_movie_log,
    )
    _assert_run_directory_identity(run_dir, run_directory_identity)
    _assert_regular_output(raw_movie)
    stable_execution_identity = _validate_phase_identity_snapshots(
        identity_snapshots
    )
    native_report = _read_batch_report(
        native_report_path,
        pass_root=native_root,
        capture_pass="native",
        review_authorization_path=review_authorization_path,
        review_authorization_sha=review_authorization_sha,
    )
    movie_report = _read_batch_report(
        movie_report_path,
        pass_root=movie_root,
        capture_pass="movie",
        review_authorization_path=review_authorization_path,
        review_authorization_sha=review_authorization_sha,
    )
    _validate_native_movie_frame_basis(native_report, movie_report)
    _validate_native_movie_runtime_identity_parity(
        native_report,
        movie_report,
    )
    stage_parity = _validate_native_movie_stage_parity(
        native_report["stages"],
        movie_report["stages"],
    )
    qa_lane = _qa_lane_summary(lane)

    raw_probe_path = run_dir / "earth-vein-review-batch-raw-ffprobe.json"
    raw_probe = CORE._write_probe(ffprobe, raw_movie, raw_probe_path)
    streams = raw_probe.get("streams", [])
    raw_video = next(
        (
            value
            for value in streams
            if isinstance(value, dict) and value.get("codec_type") == "video"
        ),
        None,
    )
    raw_audio = next(
        (
            value
            for value in streams
            if isinstance(value, dict) and value.get("codec_type") == "audio"
        ),
        None,
    )
    if (
        not isinstance(raw_video, dict)
        or not isinstance(raw_audio, dict)
        or raw_video.get("width") != EXPECTED_WIDTH
        or raw_video.get("height") != EXPECTED_HEIGHT
        or float(
            CORE._parse_fraction(
                raw_video.get("avg_frame_rate") or raw_video.get("r_frame_rate"),
                label="batch raw fps",
            )
        )
        != EXPECTED_FPS
    ):
        raise EarthVeinBatchRecordingError("batch raw MovieWriter 媒体合同失败")
    raw_frame_count = int(
        raw_video.get("nb_read_frames") or raw_video.get("nb_frames") or 0
    )
    raw_frame_contract = _validate_raw_movie_frame_count(
        raw_frame_count,
        movie_report,
    )
    raw_movie_record = _artifact(raw_movie)

    four_floor_dir = run_dir / "four-floor"
    four_floor_segments_dir = four_floor_dir / "segments"
    four_floor_segments_dir.mkdir(parents=True)
    segment_videos: list[Path] = []
    segment_records: list[dict[str, Any]] = []
    segment_frame_contracts: list[dict[str, int]] = []
    for index, (native_stage, movie_stage) in enumerate(
        zip(native_report["stages"][:8], movie_report["stages"][:8])
    ):
        map_id = str(movie_stage["mapId"])
        mode = str(movie_stage["mode"])
        prefix = f"{map_id}-{mode}"
        video_path = four_floor_segments_dir / f"{prefix}.mp4"
        log_path = four_floor_segments_dir / f"{prefix}-transcode.log"
        transcode = _transcode_range(
            ffmpeg=ffmpeg,
            raw_movie=raw_movie,
            output_path=video_path,
            log_path=log_path,
            frame_range=movie_stage["processFrameRange"],
            hold_frames=POST_CAPTURE_HOLD_FRAMES,
            timeout_seconds=timeout_seconds,
            environment=lane["environment"],
        )
        probe_path = four_floor_segments_dir / f"{prefix}-ffprobe.json"
        media = MAP_RECORDER._validate_segment_probe(
            CORE._write_probe(ffprobe, video_path, probe_path)
        )
        frame_contract = _validate_segment_frame_count(
            media,
            frame_range=movie_stage["processFrameRange"],
            appended_hold_frames=POST_CAPTURE_HOLD_FRAMES,
            label=prefix,
        )
        segment_frame_contracts.append(frame_contract)
        segment_videos.append(video_path)
        native_capture = _read_json(
            Path(native_stage["captureReport"]["path"]),
            label=f"native {prefix} capture",
        )
        movie_capture = _read_json(
            Path(movie_stage["captureReport"]["path"]),
            label=f"movie {prefix} capture",
        )
        segment_records.append(
            {
                "index": index,
                "mapId": map_id,
                "mode": mode,
                "commands": {
                    "nativeBatch": CORE._redacted_command(native_command),
                    "movieBatch": CORE._redacted_command(movie_command),
                },
                "nativeCaptureReport": native_stage["captureReport"],
                "nativeCapture": native_capture,
                "nativeScreenshot": native_stage["screenshot"],
                "captureReport": movie_stage["captureReport"],
                "capture": movie_capture,
                "screenshot": movie_stage["screenshot"],
                "rawMovie": {
                    **raw_movie_record,
                    "sharedBatchSource": True,
                },
                "rawMovieFrameRange": movie_stage["processFrameRange"],
                "frameCountContract": frame_contract,
                "video": {**_artifact(video_path), **media, "playbackSpeed": 1.0},
                "probe": _artifact(probe_path),
                "transcode": transcode,
                "qaLane": {
                    **qa_lane,
                    "sharedAcrossBatch": True,
                },
                "ownerReviewStatus": "pending",
            }
        )

    concat_list = four_floor_dir / "concat-inputs.txt"
    final_four_floor = four_floor_dir / "earth-vein-cave-v1-owner-review-1x.mp4"
    concat_log = four_floor_dir / "ffmpeg-concat.log"
    concat_evidence = _concat_segments_secure(
        ffmpeg=ffmpeg,
        ffprobe=ffprobe,
        videos=segment_videos,
        list_path=concat_list,
        output_path=final_four_floor,
        log_path=concat_log,
        timeout_seconds=timeout_seconds,
        environment=lane["environment"],
    )
    four_floor_probe_path = four_floor_dir / "ffprobe.json"
    four_floor_media = MAP_RECORDER._validate_probe(
        CORE._write_probe(ffprobe, final_four_floor, four_floor_probe_path)
    )
    concat_frame_contract = _validate_concat_frame_count(
        four_floor_media,
        segment_frame_contracts,
    )
    four_floor_decode_log = four_floor_dir / "full-audio-video-decode.log"
    CORE._run_logged(
        [
            ffmpeg,
            "-v",
            "error",
            "-xerror",
            "-i",
            str(final_four_floor),
            "-map",
            "0:v:0",
            "-map",
            "0:a:0",
            "-f",
            "null",
            "-",
        ],
        log_path=four_floor_decode_log,
        timeout_seconds=timeout_seconds,
        environment=lane["environment"],
    )
    sample_times = CORE._selected_sample_times(
        float(four_floor_media["durationSeconds"]),
        requested=(),
        sample_count=sample_count,
    )
    screenshots = CORE._extract_review_frames(
        ffmpeg=ffmpeg,
        video_path=final_four_floor,
        screenshots_dir=four_floor_dir / "screenshots",
        sample_times=sample_times,
        timeout_seconds=timeout_seconds,
    )
    contact = CORE._build_contact_sheet(
        ffmpeg=ffmpeg,
        screenshots_dir=four_floor_dir / "screenshots",
        output_path=four_floor_dir / "contact-sheet.png",
        sample_count=len(screenshots),
        timeout_seconds=timeout_seconds,
    )

    landmark_dir = run_dir / "landmark"
    landmark_dir.mkdir()
    landmark_video = landmark_dir / "earth-vein-f4-landmarks-1x.mp4"
    landmark_transcode_log = landmark_dir / "earth-vein-f4-landmarks-transcode.log"
    landmark_stage = movie_report["stages"][8]
    landmark_transcode = _transcode_range(
        ffmpeg=ffmpeg,
        raw_movie=raw_movie,
        output_path=landmark_video,
        log_path=landmark_transcode_log,
        frame_range=landmark_stage["processFrameRange"],
        hold_frames=0,
        timeout_seconds=timeout_seconds,
        environment=lane["environment"],
    )
    landmark_probe_path = landmark_dir / "earth-vein-f4-landmarks-ffprobe.json"
    landmark_media = MAP_RECORDER._validate_segment_probe(
        CORE._write_probe(ffprobe, landmark_video, landmark_probe_path)
    )
    landmark_frame_contract = _validate_segment_frame_count(
        landmark_media,
        frame_range=landmark_stage["processFrameRange"],
        appended_hold_frames=0,
        label="earth_vein_cave_f4:landmark",
    )
    landmark_decode_log = landmark_dir / "earth-vein-f4-landmarks-decode.log"
    CORE._run_logged(
        [
            ffmpeg,
            "-v",
            "error",
            "-xerror",
            "-i",
            str(landmark_video),
            "-map",
            "0:v:0",
            "-map",
            "0:a:0",
            "-f",
            "null",
            "-",
        ],
        log_path=landmark_decode_log,
        timeout_seconds=timeout_seconds,
        environment=lane["environment"],
    )

    harness = _harness_snapshot()
    _assert_phase_identity_matches(
        identity_snapshots["beforeNative"],
        {
            "phase": "beforeSummary",
            "buildIdentity": _build_identity_snapshot(),
            "harness": harness,
        },
    )
    execution_identity = {
        "status": "passed",
        "stableAcrossPhases": True,
        "buildIdentity": stable_execution_identity["beforeNative"][
            "buildIdentity"
        ],
        "phaseEvidence": {
            phase: _artifact(path) for phase, path in identity_paths.items()
        },
        "snapshots": stable_execution_identity,
    }
    window_budget = _launch_contract_from_commands(native_command, movie_command)
    four_floor_summary = {
        "schemaVersion": 1,
        "reportType": "beastbound_map_visual_main_owner_review_video",
        "status": "passed",
        "runId": run_id,
        "generatedAtUtc": _utc_now().isoformat().replace("+00:00", "Z"),
        "scene": MAIN_SCENE,
        "bundleId": BUNDLE_ID,
        "captureContract": {
            "scene": MAIN_SCENE,
            "viewport": {"width": EXPECTED_WIDTH, "height": EXPECTED_HEIGHT},
            "fps": EXPECTED_FPS,
            "playbackSpeed": 1.0,
            "motionPlaybackSpeed": 1.0,
            "postCaptureHoldSecondsPerSegment": POST_CAPTURE_HOLD_SECONDS,
            "postCaptureHoldFramesPerSegment": POST_CAPTURE_HOLD_FRAMES,
            "candidateBundleId": BUNDLE_ID,
            "maps": list(MAP_IDS),
            "modes": list(MODES),
            "captureSequence": _expected_sequence()[:8],
            "isolation": {
                "officialAutomationQaLanePerDeliverable": True,
                "qaLaneCleanedAfterWholeBatch": True,
                "persistentMainScenePerPass": True,
                "normalPlayerSavePathUsed": False,
                "profileSaveEnabled": False,
                "backendProcessStartedByTool": False,
                "mysqlAccessByTool": False,
                "loginOrServerArgumentsAccepted": False,
            },
        },
        "maps": list(MAP_IDS),
        "modes": list(MODES),
        "captureSequence": _expected_sequence()[:8],
        "segments": segment_records,
        "frameCountContract": concat_frame_contract,
        "concat": concat_evidence,
        "video": {
            **_artifact(final_four_floor),
            **four_floor_media,
            "playbackSpeed": 1.0,
            "decodeStatus": "passed",
        },
        "probe": _artifact(four_floor_probe_path),
        "fullDecode": {
            "status": "passed",
            "videoStreamDecoded": True,
            "audioStreamDecoded": True,
            "log": _artifact(four_floor_decode_log),
        },
        "screenshots": screenshots,
        "contactSheet": contact,
        "lowDisturbance": window_budget,
        "qaLane": qa_lane,
        "harness": harness,
        "executionIdentity": execution_identity,
        "nativeMovieDeterministicParity": stage_parity[:8],
        "ownerReviewStatus": "pending",
        "sha256Manifest": {
            "path": CORE._repo_relative(run_dir / "SHA256SUMS"),
            "coversAllRetainedEvidenceFiles": True,
            "coversThisSummary": True,
            "writtenAfterSummary": True,
        },
    }
    four_floor_summary_path = four_floor_dir / "summary.json"
    CORE._write_secure_json(
        four_floor_summary_path,
        four_floor_summary,
        exclusive=True,
    )

    native_landmark_stage = native_report["stages"][8]
    native_landmark_report = _read_json(
        Path(native_landmark_stage["captureReport"]["path"]),
        label="native landmark report",
    )
    movie_landmark_report = _read_json(
        Path(landmark_stage["captureReport"]["path"]),
        label="movie landmark report",
    )
    landmark_summary = {
        "schemaVersion": 1,
        "reportType": "beastbound_earth_vein_f4_landmark_owner_review_video",
        "generatedAtUtc": _utc_now().isoformat(timespec="seconds").replace(
            "+00:00", "Z"
        ),
        "result": "PASS",
        "bundleId": BUNDLE_ID,
        "mapId": "earth_vein_cave_f4",
        "playbackSpeed": 1.0,
        "reviewOnlyViewpointReposition": True,
        "requiredLandmarkInstanceIds": list(
            LANDMARK_RECORDER.EXPECTED_LANDMARKS
        ),
        "nativeScreenshot": native_landmark_stage["screenshot"],
        "nativeReport": native_landmark_stage["captureReport"],
        "nativeCapture": native_landmark_report,
        "movieScreenshot": landmark_stage["screenshot"],
        "movieReport": landmark_stage["captureReport"],
        "movieCapture": movie_landmark_report,
        "rawMovieFrameRange": landmark_stage["processFrameRange"],
        "frameCountContract": landmark_frame_contract,
        "video": {**_artifact(landmark_video), **landmark_media},
        "probe": _artifact(landmark_probe_path),
        "logs": {
            "native": _artifact(native_log),
            "movie": _artifact(movie_log),
            "transcode": _artifact(landmark_transcode_log),
            "decode": _artifact(landmark_decode_log),
        },
        "lowDisturbance": window_budget,
        "qaLane": qa_lane,
        "qaLanes": {
            "native": {
                "sourceCheck": lane["sourceCheck"],
                "attestation": lane["native"]["attestation"],
                "cleanup": "deferred_until_shared_movie_pass_completed",
                "sharedLifecycle": _artifact(lane["lifecyclePath"]),
            },
            "movie": {
                "attestation": lane["movie"]["attestation"],
                "cleanup": lane["cleanup"],
                "postCleanupInspect": lane["postCleanupInspect"],
                "sharedLifecycle": _artifact(lane["lifecyclePath"]),
            },
        },
        "harness": harness,
        "executionIdentity": execution_identity,
        "nativeMovieDeterministicParity": stage_parity[8],
        "ownerReviewStatus": "pending",
        "sha256Manifest": {
            "path": CORE._repo_relative(run_dir / "SHA256SUMS"),
            "coversAllRetainedEvidenceFiles": True,
            "coversThisSummary": True,
            "writtenAfterSummary": True,
        },
    }
    landmark_summary_path = landmark_dir / "earth-vein-f4-landmarks-report.json"
    CORE._write_secure_json(
        landmark_summary_path,
        landmark_summary,
        exclusive=True,
    )

    summary = {
        "schemaVersion": 1,
        "reportType": "beastbound_earth_vein_low_disturbance_owner_review_batch",
        "generatedAtUtc": _utc_now().isoformat().replace("+00:00", "Z"),
        "result": "PASS",
        "runId": run_id,
        "bundleId": BUNDLE_ID,
        "ownerReviewStatus": "pending",
        "releaseApproved": False,
        "runtimeEnabled": False,
        "launchContract": window_budget,
        "reviewAuthorization": {
            **_artifact(review_authorization_path),
            "validatedBeforeMain": True,
            "genericPreviewCliFlag": False,
        },
        "nativeBatchReport": _artifact(native_report_path),
        "movieBatchReport": _artifact(movie_report_path),
        "rawMovie": raw_movie_record,
        "rawMovieProbe": _artifact(raw_probe_path),
        "rawMovieFrameContract": raw_frame_contract,
        "fourFloorSummary": _artifact(four_floor_summary_path),
        "landmarkSummary": _artifact(landmark_summary_path),
        "qaLane": qa_lane,
        "harness": harness,
        "executionIdentity": execution_identity,
        "nativeMovieDeterministicParity": stage_parity,
        "migration": {
            "supersedesForEarth": [
                "record_firebud_v2_owner_review.py --bundle-id earth_vein_cave_visual_v1",
                "record_earth_vein_landmark_review.py",
            ],
            "legacyToolsRetainedForHistoricalReplay": True,
            "recommendedCommand": (
                "python3 tools/record_earth_vein_review_batch.py "
                f"--run-id {run_id}"
            ),
        },
        "sha256Manifest": {
            "path": CORE._repo_relative(run_dir / "SHA256SUMS"),
            "coversAllRetainedEvidenceFiles": True,
            "coversThisSummary": True,
            "writtenAfterSummary": True,
        },
    }
    summary_path = run_dir / "summary.json"
    _assert_run_directory_identity(run_dir, run_directory_identity)
    CORE._write_secure_json(summary_path, summary, exclusive=True)
    retained = _retained_evidence_files(run_dir)
    _write_sha256_manifest_exclusive(run_dir, retained)
    _assert_run_directory_identity(run_dir, run_directory_identity)
    print(
        json.dumps(
            {
                "status": "passed",
                "runId": run_id,
                "visibleWindowOpenCloseCycles": 2,
                "fourFloorSummary": CORE._repo_relative(four_floor_summary_path),
                "landmarkSummary": CORE._repo_relative(landmark_summary_path),
                "summary": CORE._repo_relative(summary_path),
            },
            ensure_ascii=False,
        )
    )
    return summary_path


def _record(args: argparse.Namespace) -> Path:
    if Path.cwd().resolve() != REPO_ROOT:
        raise EarthVeinBatchRecordingError(f"必须从仓库根执行：cd {REPO_ROOT}")
    run_id = str(args.run_id or _new_run_id()).strip()
    if SAFE_RUN_ID.fullmatch(run_id) is None:
        raise EarthVeinBatchRecordingError(f"不安全的 runId：{run_id!r}")
    evidence_root = REPO_ROOT / ".run" / "evidence"
    raw_output_root = Path(args.output_root)
    lexical_output_root = _lexical_absolute(
        raw_output_root
        if raw_output_root.is_absolute()
        else REPO_ROOT / raw_output_root
    )
    if lexical_output_root == _lexical_absolute(evidence_root):
        raise EarthVeinBatchRecordingError(
            "--output-root 必须是仓库 .run/evidence 的子目录"
        )
    _assert_contained_without_symlinks(
        lexical_output_root,
        root=evidence_root,
    )
    try:
        resolved_output_root = CORE._resolve_output_root(Path(args.output_root))
    except CORE.PetManagementRecordingError as error:
        raise EarthVeinBatchRecordingError(str(error)) from error
    if _lexical_absolute(resolved_output_root) != lexical_output_root:
        raise EarthVeinBatchRecordingError(
            "--output-root resolve 结果与无链接 lexical authority 不一致"
        )
    run_dir, run_directory_identity = _claim_fresh_run_directory(
        evidence_root=evidence_root,
        output_root=lexical_output_root,
        run_id=run_id,
    )
    _assert_run_directory_identity(run_dir, run_directory_identity)
    try:
        return _record_into(
            args,
            run_id=run_id,
            run_dir=run_dir,
            run_directory_identity=run_directory_identity,
        )
    except BaseException as error:
        failure = {
            "schemaVersion": 1,
            "reportType": "beastbound_earth_vein_low_disturbance_owner_review_batch",
            "result": "FAIL",
            "runId": run_id,
            "generatedAtUtc": _utc_now().isoformat().replace("+00:00", "Z"),
            "ownerReviewStatus": "pending",
            "releaseApproved": False,
            "runtimeEnabled": False,
            "launchContract": launch_contract(root=run_dir / "contract"),
            "errorType": type(error).__name__,
            "error": str(error),
            "evidenceDirectoryPreserved": True,
        }
        try:
            _assert_run_directory_identity(run_dir, run_directory_identity)
            CORE._write_secure_json(
                run_dir / "failure-summary.json",
                failure,
                exclusive=True,
            )
        except BaseException:
            pass
        raise


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run-id", default="")
    parser.add_argument("--output-root", type=Path, default=DEFAULT_OUTPUT_ROOT)
    parser.add_argument("--sample-count", type=int, default=8)
    parser.add_argument("--godot", default=os.environ.get("GODOT_BIN", "godot"))
    parser.add_argument("--ffmpeg", default=os.environ.get("FFMPEG_BIN", "ffmpeg"))
    parser.add_argument("--ffprobe", default=os.environ.get("FFPROBE_BIN", "ffprobe"))
    parser.add_argument("--timeout-seconds", type=float, default=600.0)
    parser.add_argument(
        "--print-launch-contract",
        action="store_true",
        help="只打印两次可见窗口的精确命令与预算，不启动 Godot。",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    if args.print_launch_contract:
        output_root = (
            Path(args.output_root)
            if Path(args.output_root).is_absolute()
            else REPO_ROOT / Path(args.output_root)
        ).resolve()
        dry_run_id = str(args.run_id).strip() or "dry-run"
        print(
            json.dumps(
                launch_contract(
                    godot=str(args.godot),
                    root=output_root / dry_run_id,
                ),
                ensure_ascii=False,
                indent=2,
            )
        )
        return 0
    try:
        _record(args)
    except KeyboardInterrupt:
        print("earth vein low-disturbance review interrupted", file=sys.stderr)
        return 130
    except (
        EarthVeinBatchRecordingError,
        MAP_RECORDER.FirebudV2RecordingError,
        LANDMARK_RECORDER.EarthLandmarkRecordingError,
        CORE.PetManagementRecordingError,
        FileExistsError,
        OSError,
        ValueError,
    ) as error:
        print(f"earth vein low-disturbance review failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
