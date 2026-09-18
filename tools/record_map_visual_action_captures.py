#!/usr/bin/env python3
"""Freeze one real-Main capture pair for every formal map-review action.

Computer Use receipts prove the operator action.  This companion recorder
creates the distinct 1280x720 PNG/capture-report pair that the map bundle
contract requires for pointer, movement, warp, collision and occlusion on every
map.  One persistent visible Godot process/window now records the whole pending
matrix, while every action still resets the real Main map and retains a unique
pair.  The recorder deliberately reuses the existing closed
MapVisualReviewCapture and official owner-attested QA user-data lane; it never
accepts login, server or arbitrary Godot arguments.
"""

from __future__ import annotations

import argparse
from contextlib import contextmanager
import hashlib
import importlib.util
import json
import math
import os
import re
import shutil
import stat
import subprocess
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping, Sequence


REPO_ROOT = Path(__file__).resolve().parents[1]
RECORDER_PATH = REPO_ROOT / "tools" / "record_firebud_v2_owner_review.py"
RECORDER_SPEC = importlib.util.spec_from_file_location(
    "_beastbound_map_action_capture_core", RECORDER_PATH
)
if RECORDER_SPEC is None or RECORDER_SPEC.loader is None:
    raise RuntimeError(f"无法加载地图 Main 取证核心：{RECORDER_PATH}")
RECORDER = importlib.util.module_from_spec(RECORDER_SPEC)
RECORDER_SPEC.loader.exec_module(RECORDER)
CORE = RECORDER.CORE

EVIDENCE_BUILDER_PATH = REPO_ROOT / "tools" / "map_visual_evidence_builder.py"
EVIDENCE_BUILDER_SPEC = importlib.util.spec_from_file_location(
    "_beastbound_map_action_evidence_builder",
    EVIDENCE_BUILDER_PATH,
)
if EVIDENCE_BUILDER_SPEC is None or EVIDENCE_BUILDER_SPEC.loader is None:
    raise RuntimeError(f"无法加载地图 runtime build identity：{EVIDENCE_BUILDER_PATH}")
EVIDENCE_BUILDER = importlib.util.module_from_spec(EVIDENCE_BUILDER_SPEC)
EVIDENCE_BUILDER_SPEC.loader.exec_module(EVIDENCE_BUILDER)

ACTION_KINDS = (
    "pointer",
    "movement_path",
    "warp",
    "collision",
    "occlusion",
)
ACTION_MODES = {
    "pointer": "idle",
    "movement_path": "moving",
    "warp": "moving",
    "collision": "moving",
    "occlusion": "moving",
}
DEFAULT_RUN_ROOT = Path(".run/evidence/map_visual_action_captures")
BATCH_CAPTURE_SCRIPT = (
    "res://scripts/qa/map_visual_action_capture_batch.gd"
)
BATCH_CAPTURE_SCRIPT_PATH = (
    REPO_ROOT
    / "client"
    / "godot"
    / "scripts"
    / "qa"
    / "map_visual_action_capture_batch.gd"
)
BATCH_PLAN_ENV = "BEASTBOUND_MAP_ACTION_BATCH_PLAN"
BATCH_PLAN_SHA_ENV = "BEASTBOUND_MAP_ACTION_BATCH_PLAN_SHA256"
BATCH_REPORT_TYPE = "beastbound_map_visual_action_capture_batch_plan"
BATCH_LOG_PREFIX = "map visual action capture batch: "
BATCH_PROGRESS_PREFIX = "map visual action capture progress: "
BATCH_TRANSACTION_REPORT_TYPE = (
    "beastbound_map_visual_action_formal_install_transaction"
)
BATCH_TRANSACTION_SCHEMA_VERSION = 2
BATCH_TRANSACTION_SUMMARY_REPORT_TYPE = (
    "beastbound_map_visual_action_capture_matrix"
)
FORMAL_SUMMARY_ROOT_KEYS = frozenset({
    "schemaVersion",
    "reportType",
    "generatedAtUtc",
    "result",
    "bundleId",
    "maps",
    "actionKinds",
    "captureCount",
    "launchStrategy",
    "godotProcessCount",
    "userVisibleWindowOpenCount",
    "userVisibleWindowCloseCount",
    "singlePersistentWindow",
    "windowCountEvidence",
    "actionsRecordedInSingleProcess",
    "batchEntrypoint",
    "batchCaptureController",
    "batchPlan",
    "batchPlanSha256",
    "batchRuntimeReceipt",
    "scratchOnly",
    "resumed",
    "replacedPendingEvidence",
    "supersededEvidence",
    "hudGlyphStability",
    "records",
})
FORMAL_SUMMARY_RECORD_KEYS = frozenset({
    "mapId",
    "actionKind",
    "mode",
    "captureVariant",
    "resumed",
    "screenshot",
    "captureReport",
    "captureResult",
    "targetClearance",
    "hudGlyphStability",
    "qaLane",
    "godotLog",
    "batchBinding",
})
FORMAL_SUMMARY_ARTIFACT_KEYS = frozenset({
    "path",
    "sizeBytes",
    "sha256",
})
FORMAL_SUMMARY_BOARD_ARTIFACT_KEYS = frozenset({
    "path",
    "sha256",
    "bytes",
    "width",
    "height",
    "itemCount",
    "presentationMode",
})
BATCH_BUNDLE_LOCK_NAME = ".bundle-recorder.lock.json"
BATCH_BUNDLE_LOCK_TYPE = "beastbound_map_visual_action_bundle_lock"
BATCH_SOURCE_PATHS = {
    "orchestrator": Path(__file__).resolve(),
    "evidenceBuilder": EVIDENCE_BUILDER_PATH,
    "ownerReviewRecorder": RECORDER_PATH,
    "processContainment": (
        REPO_ROOT / "tools" / "record_pet_management_owner_review.py"
    ),
    "qaUserDataLane": REPO_ROOT / "tools" / "godot_qa_user_data_lane.py",
    "hudGlyphAuditor": (
        REPO_ROOT / "tools" / "audit_firebud_hud_glyph_stability.py"
    ),
    "entrypoint": BATCH_CAPTURE_SCRIPT_PATH,
    "captureController": (
        REPO_ROOT
        / "client"
        / "godot"
        / "scripts"
        / "qa"
        / "map_visual_review_capture.gd"
    ),
    "interactionModel": (
        REPO_ROOT / "client" / "godot" / "scripts" / "world"
        / "interaction_model.gd"
    ),
    "playerProgressModel": (
        REPO_ROOT / "client" / "godot" / "scripts" / "progression"
        / "player_progress_model.gd"
    ),
    "showcaseProfile": (
        REPO_ROOT / "client" / "godot" / "scripts" / "qa"
        / "map_visual_review_showcase_profile.gd"
    ),
    "mainScene": REPO_ROOT / "client" / "godot" / "scenes" / "Main.tscn",
    "mainHost": REPO_ROOT / "client" / "godot" / "scripts" / "main.gd",
}
BATCH_SOURCE_RES_PATHS = {
    "orchestrator": "repo://tools/record_map_visual_action_captures.py",
    "evidenceBuilder": "repo://tools/map_visual_evidence_builder.py",
    "ownerReviewRecorder": "repo://tools/record_firebud_v2_owner_review.py",
    "processContainment": "repo://tools/record_pet_management_owner_review.py",
    "qaUserDataLane": "repo://tools/godot_qa_user_data_lane.py",
    "hudGlyphAuditor": "repo://tools/audit_firebud_hud_glyph_stability.py",
    "entrypoint": BATCH_CAPTURE_SCRIPT,
    "captureController": "res://scripts/qa/map_visual_review_capture.gd",
    "interactionModel": "res://scripts/world/interaction_model.gd",
    "playerProgressModel": "res://scripts/progression/player_progress_model.gd",
    "showcaseProfile": "res://scripts/qa/map_visual_review_showcase_profile.gd",
    "mainScene": "res://scenes/Main.tscn",
    "mainHost": "res://scripts/main.gd",
}
PENDING_LIFECYCLE = {
    "status": "owner_review_pending",
    "ownerReviewStatus": "pending",
    "releaseApproved": False,
    "runtimeEnabled": False,
}
LAUNCH_CONTRACT = {
    "entrypoint": "standalone_scene_tree_script",
    "mainSceneLoadCount": 1,
    "audioDriver": "Dummy",
    "perMapPreviewCliFlags": False,
    "previewAuthorization": "sha256_bound_batch_plan",
}
MANIFEST_RUNTIME_SUBJECT_KEYS = (
    "schemaVersion",
    "bundleId",
    "mapStyleId",
    "mapIds",
    "tileSize",
    "groundAtlas",
    "tiles",
    "objects",
    "mapBindings",
)


class MapActionCaptureError(RuntimeError):
    """The closed formal action-capture contract failed."""


def _process_start_identity(process_id: int) -> str:
    try:
        identity = CORE.LANE_HELPER._runner_process_identity(process_id)
    except Exception as error:
        raise MapActionCaptureError(
            f"无法核验动作 recorder 进程启动身份：{error}"
        ) from error
    if identity and not _is_sha256(identity):
        raise MapActionCaptureError("动作 recorder 进程启动身份无效")
    return str(identity)


def _bundle_lock_bytes(
    *,
    bundle_id: str,
    owner: str,
    process_id: int,
    start_identity: str,
) -> bytes:
    if (
        bundle_id not in RECORDER.RECORDER_CONFIGS
        or re.fullmatch(r"[0-9a-f]{32}", owner) is None
        or type(process_id) is not int
        or process_id <= 0
        or not _is_sha256(start_identity)
    ):
        raise MapActionCaptureError("动作 recorder bundle lock identity 无效")
    return json.dumps(
        {
            "schemaVersion": 1,
            "lockType": BATCH_BUNDLE_LOCK_TYPE,
            "bundleId": bundle_id,
            "owner": owner,
            "runner": {
                "pid": process_id,
                "startIdentitySha256": start_identity,
            },
        },
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")


def _parse_bundle_lock(payload: bytes, *, bundle_id: str) -> dict[str, Any]:
    try:
        record = json.loads(payload.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise MapActionCaptureError("动作 recorder bundle lock 无法解析") from error
    if not isinstance(record, dict):
        raise MapActionCaptureError("动作 recorder bundle lock 根节点无效")
    runner = record.get("runner")
    if (
        set(record)
        != {"schemaVersion", "lockType", "bundleId", "owner", "runner"}
        or record.get("schemaVersion") != 1
        or record.get("lockType") != BATCH_BUNDLE_LOCK_TYPE
        or record.get("bundleId") != bundle_id
        or not isinstance(record.get("owner"), str)
        or re.fullmatch(r"[0-9a-f]{32}", record["owner"]) is None
        or not isinstance(runner, dict)
        or set(runner) != {"pid", "startIdentitySha256"}
        or type(runner.get("pid")) is not int
        or runner.get("pid", 0) <= 0
        or not _is_sha256(runner.get("startIdentitySha256"))
    ):
        raise MapActionCaptureError("动作 recorder bundle lock 字段不精确")
    expected = _bundle_lock_bytes(
        bundle_id=bundle_id,
        owner=record["owner"],
        process_id=runner["pid"],
        start_identity=runner["startIdentitySha256"],
    )
    if payload != expected:
        raise MapActionCaptureError("动作 recorder bundle lock 不是 canonical JSON")
    return record


def _read_bundle_lock(
    lock_path: Path,
    *,
    bundle_id: str,
) -> tuple[bytes, os.stat_result]:
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
    try:
        descriptor = os.open(lock_path, flags)
    except OSError as error:
        raise MapActionCaptureError(
            "动作 recorder bundle lock 不是可安全读取的普通文件"
        ) from error
    try:
        identity = os.fstat(descriptor)
        if (
            not stat.S_ISREG(identity.st_mode)
            or identity.st_nlink != 1
            or (hasattr(os, "getuid") and identity.st_uid != os.getuid())
            or identity.st_size <= 0
            or identity.st_size > 16384
        ):
            raise MapActionCaptureError("动作 recorder bundle lock inode 不安全")
        payload = bytearray()
        while len(payload) <= 16384:
            chunk = os.read(descriptor, min(4096, 16385 - len(payload)))
            if not chunk:
                break
            payload.extend(chunk)
        if len(payload) != identity.st_size or len(payload) > 16384:
            raise MapActionCaptureError("动作 recorder bundle lock 读取长度异常")
    finally:
        os.close(descriptor)
    payload_bytes = bytes(payload)
    _parse_bundle_lock(payload_bytes, bundle_id=bundle_id)
    return payload_bytes, identity


def _remove_exact_bundle_lock(
    lock_path: Path,
    *,
    bundle_id: str,
    expected_payload: bytes,
    expected_identity: os.stat_result,
) -> None:
    payload, identity = _read_bundle_lock(lock_path, bundle_id=bundle_id)
    if (
        payload != expected_payload
        or identity.st_dev != expected_identity.st_dev
        or identity.st_ino != expected_identity.st_ino
        or identity.st_nlink != expected_identity.st_nlink
    ):
        raise MapActionCaptureError("动作 recorder bundle lock 在移除前发生漂移")
    lock_path.unlink()
    _fsync_directory(lock_path.parent)


def _acquire_bundle_recorder_lock(
    run_base: Path,
    *,
    bundle_id: str,
) -> tuple[Path, bytes, os.stat_result]:
    safe_run_base = _guard_repo_path(
        run_base,
        allowed_root=REPO_ROOT / DEFAULT_RUN_ROOT,
        label="动作 recorder bundle lock 根",
        expected="dir",
    )
    lock_path = safe_run_base / BATCH_BUNDLE_LOCK_NAME
    owner = uuid.uuid4().hex
    process_id = os.getpid()
    start_identity = _process_start_identity(process_id)
    payload = _bundle_lock_bytes(
        bundle_id=bundle_id,
        owner=owner,
        process_id=process_id,
        start_identity=start_identity,
    )
    flags = (
        os.O_CREAT
        | os.O_EXCL
        | os.O_WRONLY
        | getattr(os, "O_NOFOLLOW", 0)
    )
    for attempt in range(2):
        try:
            descriptor = os.open(lock_path, flags, 0o600)
        except FileExistsError:
            existing_payload, existing_identity = _read_bundle_lock(
                lock_path,
                bundle_id=bundle_id,
            )
            existing = _parse_bundle_lock(
                existing_payload,
                bundle_id=bundle_id,
            )
            runner = existing["runner"]
            current_identity = _process_start_identity(runner["pid"])
            if current_identity == runner["startIdentitySha256"]:
                raise MapActionCaptureError(
                    "同一地图 bundle 已有活跃动作 recorder，拒绝并发及事务恢复"
                )
            if attempt != 0:
                raise MapActionCaptureError("动作 recorder bundle lock 并发漂移")
            _remove_exact_bundle_lock(
                lock_path,
                bundle_id=bundle_id,
                expected_payload=existing_payload,
                expected_identity=existing_identity,
            )
            continue
        except OSError as error:
            raise MapActionCaptureError("动作 recorder bundle lock 创建失败") from error
        try:
            remaining = memoryview(payload)
            while remaining:
                written = os.write(descriptor, remaining)
                if written <= 0:
                    raise OSError("bundle lock short write")
                remaining = remaining[written:]
            os.fsync(descriptor)
            identity = os.fstat(descriptor)
        except BaseException:
            os.close(descriptor)
            lock_path.unlink(missing_ok=True)
            raise
        os.close(descriptor)
        _fsync_directory(safe_run_base)
        written_payload, written_identity = _read_bundle_lock(
            lock_path,
            bundle_id=bundle_id,
        )
        if (
            written_payload != payload
            or written_identity.st_dev != identity.st_dev
            or written_identity.st_ino != identity.st_ino
        ):
            raise MapActionCaptureError("动作 recorder bundle lock 发布后漂移")
        return lock_path, payload, written_identity
    raise MapActionCaptureError("动作 recorder bundle lock 获取失败")


@contextmanager
def _bundle_recorder_lock(run_base: Path, *, bundle_id: str):
    lock_path, payload, identity = _acquire_bundle_recorder_lock(
        run_base,
        bundle_id=bundle_id,
    )
    try:
        yield (lock_path, payload, identity)
    finally:
        _remove_exact_bundle_lock(
            lock_path,
            bundle_id=bundle_id,
            expected_payload=payload,
            expected_identity=identity,
        )


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace(
        "+00:00", "Z"
    )


def _default_run_id() -> str:
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")
    return f"map-actions-{timestamp}-{uuid.uuid4().hex[:8]}"


def _parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--bundle-id",
        required=True,
        choices=tuple(sorted(RECORDER.RECORDER_CONFIGS)),
    )
    parser.add_argument("--godot", default="godot")
    parser.add_argument("--timeout-seconds", type=float, default=90.0)
    parser.add_argument("--run-id", default="")
    parser.add_argument(
        "--resume",
        action="store_true",
        help=(
            "只续跑同一 runId 中缺失的动作；完整 PASS 对保持 immutable，"
            "仅允许归档没有截图的明确 FAIL 报告"
        ),
    )
    parser.add_argument(
        "--replace-pending-evidence",
        action="store_true",
        help=(
            "仅为仍处于 owner_review_pending 的 bundle 事务式替换完整正式动作对；"
            "旧字节归档到本次 .run，任一步失败恢复全部旧字节"
        ),
    )
    parser.add_argument(
        "--scratch-only",
        action="store_true",
        help=(
            "只写入本次 .run 的 scratch-actions，不读取、覆盖或刷新正式动作证据；"
            "用于提交前验证完整动作矩阵"
        ),
    )
    return parser.parse_args(argv)


def _portable(path: Path) -> str:
    try:
        return path.resolve().relative_to(REPO_ROOT).as_posix()
    except ValueError:
        return str(path.resolve())


def _absolute_lexical(path: Path) -> Path:
    return Path(os.path.abspath(os.fspath(path)))


def _path_exists_or_link(path: Path) -> bool:
    return path.exists() or path.is_symlink()


def _guard_repo_path(
    path: Path,
    *,
    allowed_root: Path,
    label: str,
    expected: str = "any",
    anchor: Path = REPO_ROOT,
) -> Path:
    """Reject escapes, prefix collisions, and every traversed symlink.

    This is an eager preflight rather than a race-free filesystem capability.
    It keeps pre-existing symlinks, evidence escapes, staging, backup, and
    rollback paths fail-closed; a concurrent local filesystem attacker is
    outside this recorder's threat model.
    """

    lexical = _absolute_lexical(path)
    lexical_anchor = _absolute_lexical(anchor)
    lexical_root = _absolute_lexical(allowed_root)
    try:
        lexical_root.relative_to(lexical_anchor)
        lexical.relative_to(lexical_root)
    except ValueError as error:
        raise MapActionCaptureError(
            f"{label} 越出固定目录或命中前缀碰撞：{lexical}"
        ) from error

    current = lexical_anchor
    relative = lexical.relative_to(lexical_anchor)
    for index, component in enumerate(relative.parts):
        current /= component
        is_final = index == len(relative.parts) - 1
        if current.is_symlink():
            raise MapActionCaptureError(
                f"{label} 不得穿过符号链接：{current}"
            )
        if current.exists() and not is_final and not current.is_dir():
            raise MapActionCaptureError(
                f"{label} 的父级不是目录：{current}"
            )

    resolved_root = lexical_root.resolve(strict=False)
    resolved = lexical.resolve(strict=False)
    try:
        resolved.relative_to(resolved_root)
    except ValueError as error:
        raise MapActionCaptureError(
            f"{label} 解析后越出固定目录：{resolved}"
        ) from error

    exists = lexical.exists()
    if expected == "missing":
        if exists or lexical.is_symlink():
            raise MapActionCaptureError(f"{label} 必须尚不存在：{lexical}")
    elif expected == "file":
        if (
            not exists
            or lexical.is_symlink()
            or not stat.S_ISREG(lexical.lstat().st_mode)
        ):
            raise MapActionCaptureError(
                f"{label} 必须是普通非符号链接文件：{lexical}"
            )
    elif expected == "file_or_missing":
        if exists and not stat.S_ISREG(lexical.lstat().st_mode):
            raise MapActionCaptureError(
                f"{label} 若存在必须是普通文件：{lexical}"
            )
    elif expected == "dir":
        if (
            not exists
            or lexical.is_symlink()
            or not stat.S_ISDIR(lexical.lstat().st_mode)
        ):
            raise MapActionCaptureError(
                f"{label} 必须是普通非符号链接目录：{lexical}"
            )
    elif expected == "dir_or_missing":
        if exists and not stat.S_ISDIR(lexical.lstat().st_mode):
            raise MapActionCaptureError(
                f"{label} 若存在必须是目录：{lexical}"
            )
    elif expected != "any":
        raise AssertionError(f"unknown path expectation: {expected}")
    return lexical


def _capture_path(path: Path) -> str:
    godot_project = _absolute_lexical(RECORDER.GODOT_PROJECT)
    lexical = _absolute_lexical(path)
    try:
        relative = lexical.relative_to(godot_project)
    except ValueError:
        return str(lexical)
    return f"res://{relative.as_posix()}"


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _canonical_sha256(value: Any) -> str:
    return hashlib.sha256(
        json.dumps(
            value,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")
    ).hexdigest()


def _manifest_runtime_subject_identity(path: Path) -> dict[str, str]:
    manifest = _read_json_object(path, label="bundle manifest runtime subject")
    subject = {
        key: manifest.get(key) for key in MANIFEST_RUNTIME_SUBJECT_KEYS
    }
    return {
        "path": path.relative_to(REPO_ROOT).as_posix(),
        "canonicalization": "map_runtime_subject_v1",
        "sha256": _canonical_sha256(subject),
    }


def _capture_surface_identity(bundle_id: str) -> dict[str, str]:
    config = RECORDER.RECORDER_CONFIGS.get(bundle_id)
    if not isinstance(config, dict):
        raise MapActionCaptureError(f"未知地图 bundle：{bundle_id}")
    bundle_root = (
        REPO_ROOT / "client" / "godot" / "assets" / "maps" / bundle_id
    )
    paths: set[Path] = {
        REPO_ROOT / "client/godot/data/map_visual_review_catalog.json",
        REPO_ROOT / "client/godot/scripts/world/map_data_catalog.gd",
        REPO_ROOT / "client/godot/scripts/world/map_visual_catalog.gd",
        REPO_ROOT / "client/godot/scripts/world/map_visual_renderer.gd",
        bundle_root / "map-visual-bundle.json",
    }
    map_catalog_source = (
        REPO_ROOT / "client/godot/scripts/world/map_data_catalog.gd"
    ).read_text(encoding="utf-8")
    map_paths = dict(re.findall(
        r'"([a-z0-9][a-z0-9_-]*)"\s*:\s*"res://([^"\r\n]+\.json)"',
        map_catalog_source,
    ))
    for map_id in config.get("maps", ()):
        relative_path = map_paths.get(str(map_id))
        if relative_path is None:
            raise MapActionCaptureError(f"MapDataCatalog 缺少地图：{map_id}")
        paths.add(REPO_ROOT / "client" / "godot" / relative_path)
    for relative_directory in ("bindings", "runtime"):
        directory = _guard_repo_path(
            bundle_root / relative_directory,
            allowed_root=bundle_root,
            label=f"批量动作候选关键来源 {relative_directory}",
            expected="dir",
        )
        for candidate in directory.rglob("*"):
            if candidate.is_symlink():
                raise MapActionCaptureError(
                    f"候选关键来源不得包含符号链接：{candidate}"
                )
            if candidate.is_file():
                paths.add(candidate)
    identity: dict[str, str] = {}
    for path in sorted(paths):
        safe_path = _guard_repo_path(
            path,
            allowed_root=REPO_ROOT,
            label="批量动作候选关键来源",
            expected="file",
        )
        portable_path = safe_path.relative_to(REPO_ROOT).as_posix()
        identity[portable_path] = (
            _manifest_runtime_subject_identity(safe_path)["sha256"]
            if safe_path == bundle_root / "map-visual-bundle.json"
            else _sha256(safe_path)
        )
    return identity


def _batch_freeze(bundle_id: str) -> dict[str, Any]:
    manifest_path = (
        REPO_ROOT
        / "client"
        / "godot"
        / "assets"
        / "maps"
        / bundle_id
        / "map-visual-bundle.json"
    )
    safe_manifest = _guard_repo_path(
        manifest_path,
        allowed_root=manifest_path.parent,
        label="批量动作 bundle manifest freeze",
        expected="file",
    )
    surface_identity = _capture_surface_identity(bundle_id)
    return {
        "bundleManifestIdentity": _manifest_runtime_subject_identity(
            safe_manifest
        ),
        "buildIdentity": EVIDENCE_BUILDER.build_identity(),
        "captureSurfaceIdentity": surface_identity,
        "captureSurfaceIdentitySha256": _canonical_sha256(surface_identity),
        "sourceIdentity": _batch_source_identity(),
    }


def _batch_source_identity() -> dict[str, dict[str, str]]:
    identity: dict[str, dict[str, str]] = {}
    for key, path in BATCH_SOURCE_PATHS.items():
        safe_path = _guard_repo_path(
            path,
            allowed_root=REPO_ROOT,
            label=f"批量动作取证源文件 {key}",
            expected="file",
        )
        identity[key] = {
            "path": BATCH_SOURCE_RES_PATHS[key],
            "sha256": _sha256(safe_path),
        }
    return identity


def _batch_plan(
    *,
    bundle_id: str,
    targets: Sequence[tuple[str, str, str, Path, Path, str]],
    output_mode: str = "",
    install_targets: Mapping[tuple[str, str], tuple[Path, Path]] | None = None,
) -> dict[str, Any]:
    freeze = _batch_freeze(bundle_id)
    record_targets = [target for target in targets if target[5] != "reuse"]
    if not record_targets:
        raise MapActionCaptureError("批量动作计划不能是空矩阵")
    if install_targets is None:
        install_targets = {
            (map_id, action_kind): (screenshot, report)
            for map_id, action_kind, _mode, screenshot, report, _state
            in record_targets
        }
    output_roots = {
        _absolute_lexical(screenshot).parent.parent
        for _map_id, _action_kind, _mode, screenshot, _report, _state
        in record_targets
    }
    install_roots = {
        _absolute_lexical(paths[0]).parent.parent
        for paths in install_targets.values()
    }
    if len(output_roots) != 1 or len(install_roots) != 1:
        raise MapActionCaptureError("批量动作计划必须只有一个写入根和安装根")
    output_root = next(iter(output_roots))
    install_root = next(iter(install_roots))
    selected_output_mode = output_mode or (
        "scratch" if output_root.name == "scratch-actions" else "formal_staging"
    )
    if selected_output_mode not in {"scratch", "formal_staging"}:
        raise MapActionCaptureError("批量动作计划 outputMode 不受支持")
    if selected_output_mode == "scratch" and output_root != install_root:
        raise MapActionCaptureError("scratch 批量动作的写入根与安装根必须相同")

    actions: list[dict[str, Any]] = []
    for map_id, action_kind, mode, screenshot, report, _target_state in record_targets:
        install_pair = install_targets.get((map_id, action_kind))
        if install_pair is None:
            raise MapActionCaptureError(
                f"批量动作缺少安装目标：{map_id}/{action_kind}"
            )
        install_screenshot, install_report = install_pair
        actions.append({
            "bundleId": bundle_id,
            "mapId": map_id,
            "actionKind": action_kind,
            "mode": mode,
            "captureVariant": action_kind,
            "outputPath": str(_absolute_lexical(screenshot)),
            "reportPath": str(_absolute_lexical(report)),
            "installOutputPath": str(_absolute_lexical(install_screenshot)),
            "installReportPath": str(_absolute_lexical(install_report)),
        })
    return {
        "schemaVersion": 1,
        "reportType": BATCH_REPORT_TYPE,
        "bundleId": bundle_id,
        "mapIds": list(RECORDER.REVIEW_MAPS),
        "outputMode": selected_output_mode,
        "outputRoot": str(output_root),
        "installRoot": str(install_root),
        "lifecycle": dict(PENDING_LIFECYCLE),
        "launchContract": dict(LAUNCH_CONTRACT),
        "windowContract": {
            "godotProcessCount": 1,
            "userVisibleWindowOpenCount": 1,
            "userVisibleWindowCloseCount": 1,
            "singlePersistentWindow": True,
            "viewport": [1280, 720],
        },
        **freeze,
        "actions": actions,
    }


def _write_batch_plan(
    run_root: Path,
    *,
    bundle_id: str,
    targets: Sequence[tuple[str, str, str, Path, Path, str]],
    output_mode: str = "",
    install_targets: Mapping[tuple[str, str], tuple[Path, Path]] | None = None,
) -> tuple[Path, str, dict[str, Any]]:
    plan = _batch_plan(
        bundle_id=bundle_id,
        targets=targets,
        output_mode=output_mode,
        install_targets=install_targets,
    )
    plan_path = run_root / "single-window-action-plan.json"
    _guard_repo_path(
        plan_path,
        allowed_root=run_root,
        label="批量动作计划",
        expected="missing",
    )
    plan_path.write_text(
        json.dumps(plan, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return plan_path, _sha256(plan_path), plan


def _build_batch_godot_command(
    *,
    godot: str,
) -> list[str]:
    command = [
        godot,
        "--path",
        str(RECORDER.GODOT_PROJECT),
        "--audio-driver",
        "Dummy",
        "--script",
        BATCH_CAPTURE_SCRIPT,
        "--windowed",
        "--resolution",
        "1280x720",
        "--single-window",
        "--time-scale",
        "1.0",
        "--",
        CORE.QA_LANE_ARGUMENT,
    ]
    if (
        command.count("--script") != 1
        or command.count(BATCH_CAPTURE_SCRIPT) != 1
        or command.count("--single-window") != 1
        or command.count("1280x720") != 1
        or command.count("--audio-driver") != 1
        or command.count("Dummy") != 1
        or command.count(CORE.QA_LANE_ARGUMENT) != 1
        or any(value.startswith("--map-art-review-preview") for value in command)
        or "--scene" in command
        or "--headless" in command
        or "--write-movie" in command
        or "--user-data-dir" in command
    ):
        raise MapActionCaptureError("批量动作 Godot 单窗口命令边界不精确")
    return command


def _batch_environment(
    base_environment: dict[str, str],
    *,
    plan_path: Path,
    plan_sha256: str,
) -> dict[str, str]:
    environment = dict(base_environment)
    if BATCH_PLAN_ENV in environment or BATCH_PLAN_SHA_ENV in environment:
        raise MapActionCaptureError("批量动作环境已含保留计划变量")
    environment[BATCH_PLAN_ENV] = str(plan_path.resolve())
    environment[BATCH_PLAN_SHA_ENV] = plan_sha256
    return environment


class _ProgressWatchdogProcess:
    def __init__(
        self,
        process: subprocess.Popen[Any],
        *,
        log_path: Path,
        no_progress_timeout: float,
        bundle_id: str,
        plan_sha256: str,
        action_count: int,
    ) -> None:
        self._process = process
        self._log_path = log_path
        self._no_progress_timeout = no_progress_timeout
        self._bundle_id = bundle_id
        self._plan_sha256 = plan_sha256
        self._action_count = action_count
        self._last_progress_at = time.monotonic()
        self._observed_progress_count = 0
        self._watchdog_triggered = False

    def __getattr__(self, name: str) -> Any:
        return getattr(self._process, name)

    def _refresh_progress(self) -> None:
        try:
            lines = self._log_path.read_text(
                encoding="utf-8", errors="replace"
            ).splitlines()
        except OSError:
            return
        expected: list[tuple[int, str]] = [
            (index, stage)
            for index in range(self._action_count)
            for stage in ("before_prepare", "after_capture")
        ]
        observed: list[tuple[int, str]] = []
        for line in lines:
            if not line.startswith(BATCH_PROGRESS_PREFIX):
                continue
            try:
                payload = json.loads(line[len(BATCH_PROGRESS_PREFIX):])
            except json.JSONDecodeError:
                continue
            if (
                not isinstance(payload, dict)
                or payload.get("bundleId") != self._bundle_id
                or payload.get("planSha256") != self._plan_sha256
            ):
                continue
            observed.append((payload.get("actionIndex"), payload.get("stage")))
        sequential_count = 0
        for expected_item, observed_item in zip(expected, observed):
            if observed_item != expected_item:
                break
            sequential_count += 1
        if sequential_count > self._observed_progress_count:
            self._observed_progress_count = sequential_count
            self._last_progress_at = time.monotonic()

    def wait(self, timeout: float | None = None) -> int:
        if self._watchdog_triggered:
            return int(self._process.wait(timeout=timeout))
        started = time.monotonic()
        overall_deadline = (
            started + timeout if timeout is not None else float("inf")
        )
        while True:
            remaining = overall_deadline - time.monotonic()
            if remaining <= 0:
                self._watchdog_triggered = True
                raise subprocess.TimeoutExpired(self._process.args, timeout)
            try:
                return int(self._process.wait(timeout=min(0.25, remaining)))
            except subprocess.TimeoutExpired:
                self._refresh_progress()
                if (
                    time.monotonic() - self._last_progress_at
                    >= self._no_progress_timeout
                ):
                    self._watchdog_triggered = True
                    raise subprocess.TimeoutExpired(
                        self._process.args,
                        self._no_progress_timeout,
                    )


def _batch_progress_godot_runner(
    *,
    bundle_id: str,
    plan_sha256: str,
    action_count: int,
    no_progress_timeout: float,
):
    def runner(
        command: Sequence[str],
        *,
        phase: str,
        log_path: Path,
        timeout_seconds: float,
        environment: Mapping[str, str],
        dependencies: Mapping[str, Any] | None = None,
    ) -> dict[str, Any]:
        if phase != "native":
            return CORE._run_godot_with_settlement(
                command,
                phase=phase,
                log_path=log_path,
                timeout_seconds=timeout_seconds,
                environment=environment,
                dependencies=dependencies,
            )
        dependency_values = dict(dependencies or {})

        def popen(*args: Any, **kwargs: Any) -> _ProgressWatchdogProcess:
            process = subprocess.Popen(*args, **kwargs)
            return _ProgressWatchdogProcess(
                process,
                log_path=log_path,
                no_progress_timeout=no_progress_timeout,
                bundle_id=bundle_id,
                plan_sha256=plan_sha256,
                action_count=action_count,
            )

        dependency_values["popen"] = popen
        return CORE._run_godot_with_settlement(
            command,
            phase=phase,
            log_path=log_path,
            timeout_seconds=timeout_seconds,
            environment=environment,
            dependencies=dependency_values,
        )

    return runner


def _window_checkpoint_valid(value: Any, root_window_id: Any) -> bool:
    return (
        isinstance(value, dict)
        and value.get("windowCount") == 1
        and value.get("windowIds") == [root_window_id]
        and value.get("rootWindowId") == root_window_id
        and type(value.get("processFrame")) is int
        and value.get("processFrame", -1) >= 0
    )


def _window_identity_pair_valid(value: Any, root_window_id: Any) -> bool:
    return (
        type(root_window_id) is int
        and isinstance(value, dict)
        and value.get("rootWindowId") == root_window_id
        and _window_checkpoint_valid(value.get("before"), root_window_id)
        and _window_checkpoint_valid(value.get("after"), root_window_id)
    )


def _batch_receipt_from_log(
    path: Path,
    *,
    expected_action_count: int,
    expected_plan_sha256: str,
    expected_bundle_id: str,
) -> dict[str, Any]:
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
        raise MapActionCaptureError(
            "批量动作 Godot 日志存在错误或泄漏：" + ", ".join(found)
        )
    if "Metal 4.0 - Forward Mobile" not in text:
        raise MapActionCaptureError("批量动作取证没有使用 Metal Forward Mobile")
    if "Movie Maker mode enabled" in text:
        raise MapActionCaptureError("批量动作取证意外进入 MovieWriter")
    action_receipts = [
        line
        for line in text.splitlines()
        if line.startswith("map visual review capture: ")
    ]
    if len(action_receipts) != expected_action_count:
        raise MapActionCaptureError(
            "批量动作逐项回执数量不精确："
            f"expected={expected_action_count} actual={len(action_receipts)}"
        )
    progress_receipts = [
        line
        for line in text.splitlines()
        if line.startswith(BATCH_PROGRESS_PREFIX)
    ]
    if len(progress_receipts) != expected_action_count * 2:
        raise MapActionCaptureError(
            "批量动作 progress heartbeat 数量不精确："
            f"expected={expected_action_count * 2} actual={len(progress_receipts)}"
        )
    payload_texts = [
        line[len(BATCH_LOG_PREFIX):]
        for line in text.splitlines()
        if line.startswith(BATCH_LOG_PREFIX)
    ]
    if len(payload_texts) != 1:
        raise MapActionCaptureError("批量动作日志必须只有一个最终 batch 回执")
    try:
        payload = json.loads(payload_texts[0])
    except json.JSONDecodeError as error:
        raise MapActionCaptureError("批量动作最终回执无法解析") from error
    required = {
        "status": "passed",
        "result": "PASS",
        "scene": "res://scenes/Main.tscn",
        "bundleId": expected_bundle_id,
        "planSha256": expected_plan_sha256,
        "actionCount": expected_action_count,
        "completedActionCount": expected_action_count,
        "godotProcessCount": 1,
        "userVisibleWindowOpenCount": 1,
        "singlePersistentWindow": True,
        "viewport": [1280, 720],
        "lifecycle": PENDING_LIFECYCLE,
        "errors": [],
    }
    # Godot emits this receipt before quit(), so it cannot attest its own
    # window closure. _derive_window_evidence proves that after the parent
    # has reaped the process group and cleaned/inspected the official lane.
    mismatches = [
        f"{key}={payload.get(key)!r}"
        for key, expected in required.items()
        if payload.get(key) != expected
    ]
    freeze = _batch_freeze(expected_bundle_id)
    if payload.get("sourceIdentity") != freeze["sourceIdentity"]:
        mismatches.append("sourceIdentity")
    for key in (
        "buildIdentity",
        "bundleManifestIdentity",
        "captureSurfaceIdentity",
        "captureSurfaceIdentitySha256",
    ):
        if payload.get(key) != freeze[key]:
            mismatches.append(key)
    runtime_identity = payload.get("runtimeIdentity")
    if not isinstance(runtime_identity, dict):
        mismatches.append("runtimeIdentity")
    else:
        for key, expected in {
            "displayServerWindowCount": 1,
            "audioDriver": "Dummy",
            "mainSceneLoadCount": 1,
            "mainSceneInstanceCount": 1,
            "viewport": [1280, 720],
        }.items():
            if runtime_identity.get(key) != expected:
                mismatches.append(
                    f"runtimeIdentity.{key}={runtime_identity.get(key)!r}"
                )
        process_id = runtime_identity.get("processId")
        if type(process_id) is not int or process_id <= 0:
            mismatches.append(f"runtimeIdentity.processId={process_id!r}")
        display_server = runtime_identity.get("displayServer")
        if not isinstance(display_server, str) or not display_server:
            mismatches.append(
                f"runtimeIdentity.displayServer={display_server!r}"
            )
        root_window_id = runtime_identity.get("rootWindowId")
        if (
            type(root_window_id) is not int
            or runtime_identity.get("displayServerWindowIds")
            != [root_window_id]
        ):
            mismatches.append("runtimeIdentity.rootWindowId")
    window_count_evidence = payload.get("windowCountEvidence")
    window_lifecycle = (
        window_count_evidence.get("windowLifecycle")
        if isinstance(window_count_evidence, dict)
        else None
    )
    if (
        not isinstance(window_count_evidence, dict)
        or window_count_evidence.get("displayServerWindowCountDuringCapture") != 1
        or window_count_evidence.get("singleWindowEngineFlagRequiredByPlan") is not True
        or not isinstance(window_lifecycle, dict)
        or not isinstance(runtime_identity, dict)
        or window_lifecycle.get("rootWindowId") != runtime_identity.get("rootWindowId")
    ):
        mismatches.append("windowCountEvidence")
    elif not (
        _window_checkpoint_valid(
            window_lifecycle.get("initial"),
            window_lifecycle.get("rootWindowId"),
        )
        and _window_checkpoint_valid(
            window_lifecycle.get("final"),
            window_lifecycle.get("rootWindowId"),
        )
    ):
        mismatches.append("windowCountEvidence.windowLifecycle")
    final_cleanup = payload.get("finalCleanup")
    if (
        not isinstance(final_cleanup, dict)
        or final_cleanup.get("status") not in {"passed", "not_required"}
    ):
        mismatches.append(f"finalCleanup={final_cleanup!r}")
    process_frame_count = payload.get("processFrameCount")
    if type(process_frame_count) is not int or process_frame_count <= 0:
        mismatches.append(f"processFrameCount={process_frame_count!r}")
    completed_actions = payload.get("actions")
    if not isinstance(completed_actions, list):
        mismatches.append("actions")
    else:
        action_keys: set[tuple[str, str]] = set()
        for action in completed_actions:
            if not isinstance(action, dict):
                mismatches.append("actions.nonObject")
                continue
            action_key = (
                str(action.get("mapId", "")),
                str(action.get("actionKind", "")),
            )
            action_keys.add(action_key)
            if action.get("result") != "PASS":
                mismatches.append(f"actions.{action_key}.result")
            action_window = action.get("windowIdentity")
            root_window_id = (
                runtime_identity.get("rootWindowId")
                if isinstance(runtime_identity, dict)
                else None
            )
            if not _window_identity_pair_valid(action_window, root_window_id):
                mismatches.append(f"actions.{action_key}.windowIdentity")
            for sha_key in ("screenshotSha256", "captureReportSha256"):
                value = action.get(sha_key)
                if (
                    not isinstance(value, str)
                    or len(value) != 64
                    or any(character not in "0123456789abcdef" for character in value)
                ):
                    mismatches.append(f"actions.{action_key}.{sha_key}")
        if len(action_keys) != expected_action_count:
            mismatches.append(f"actions.uniqueCount={len(action_keys)}")
    if mismatches:
        raise MapActionCaptureError(
            "批量动作最终回执合同失败：" + ", ".join(mismatches)
        )
    return payload


def _read_json_object(path: Path, *, label: str) -> dict[str, Any]:
    if path.is_symlink() or not path.is_file():
        raise MapActionCaptureError(
            f"{label} 必须是普通非符号链接文件：{_portable(path)}"
        )
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise MapActionCaptureError(f"{label} 无法解析：{_portable(path)}") from error
    if not isinstance(value, dict):
        raise MapActionCaptureError(f"{label} 根节点必须是对象：{_portable(path)}")
    return value


def _target_state(
    screenshot: Path,
    report: Path,
    *,
    resume: bool,
    replace_pending: bool = False,
) -> str:
    for path, label in ((screenshot, "动作截图"), (report, "动作报告")):
        if path.is_symlink():
            raise MapActionCaptureError(
                f"{label} 不得是符号链接（含 dangling link）：{_portable(path)}"
            )
    screenshot_exists = screenshot.is_file()
    report_exists = report.is_file()
    if replace_pending:
        if resume:
            raise MapActionCaptureError("替换 pending 证据不能与 --resume 同用")
        if screenshot_exists and report_exists:
            return "replace"
        raise MapActionCaptureError(
            "pending 证据替换要求每个旧正式动作对都完整存在："
            f"{_portable(screenshot)} / {_portable(report)}"
        )
    if screenshot_exists and report_exists:
        if not resume:
            raise MapActionCaptureError(
                "拒绝覆盖已有正式动作取证："
                f"{_portable(screenshot)} / {_portable(report)}"
            )
        return "reuse"
    if not screenshot_exists and not report_exists:
        return "record"
    if not resume:
        raise MapActionCaptureError(
            "拒绝覆盖不完整的正式动作取证："
            f"{_portable(screenshot)} / {_portable(report)}"
        )
    if screenshot_exists:
        raise MapActionCaptureError(
            "续跑拒绝处理没有 capture 报告的孤立截图："
            f"{_portable(screenshot)}"
        )
    failed = _read_json_object(report, label="孤立 capture 报告")
    errors = failed.get("errors")
    if (
        failed.get("result") != "FAIL"
        or failed.get("ok") is not False
        or not isinstance(errors, list)
        or not errors
        or failed.get("screenshotPath") not in ("", None)
        or failed.get("screenshot") not in ({}, None)
    ):
        raise MapActionCaptureError(
            "续跑只允许归档没有截图的明确 FAIL 报告："
            f"{_portable(report)}"
        )
    return "archive_failed_report"


def _validate_pending_replacement(manifest_path: Path, bundle_id: str) -> None:
    manifest = _read_json_object(manifest_path, label="地图 bundle manifest")
    if manifest.get("bundleId") != bundle_id:
        raise MapActionCaptureError("pending 证据替换 bundleId 不一致")
    lifecycle = {key: manifest.get(key) for key in PENDING_LIFECYCLE}
    if lifecycle != PENDING_LIFECYCLE:
        raise MapActionCaptureError(
            f"拒绝替换非 pending bundle 的正式动作证据：{lifecycle}"
        )


def _validate_preinstall_freeze(
    manifest_path: Path,
    *,
    bundle_id: str,
    plan: Mapping[str, Any],
    receipt: Mapping[str, Any],
) -> None:
    _validate_pending_replacement(manifest_path, bundle_id)
    current = _batch_freeze(bundle_id)
    mismatches = [
        key
        for key in (
            "bundleManifestIdentity",
            "buildIdentity",
            "captureSurfaceIdentity",
            "captureSurfaceIdentitySha256",
            "sourceIdentity",
        )
        if plan.get(key) != current[key] or receipt.get(key) != current[key]
    ]
    if mismatches:
        raise MapActionCaptureError(
            "安装前 manifest/runtime/build freeze 漂移，拒绝触碰正式证据："
            + ", ".join(mismatches)
        )


def _validate_same_map_action_png_uniqueness(
    action_paths: Mapping[tuple[str, str], Path],
    *,
    map_ids: Sequence[str],
) -> None:
    expected_kinds = set(ACTION_KINDS)
    for map_id in map_ids:
        selected = {
            action_kind: action_paths.get((map_id, action_kind))
            for action_kind in ACTION_KINDS
        }
        if set(selected) != expected_kinds or any(
            path is None for path in selected.values()
        ):
            raise MapActionCaptureError(f"地图动作 PNG 矩阵不完整：{map_id}")
        hashes: dict[str, str] = {}
        for action_kind, path_value in selected.items():
            assert path_value is not None
            path = _guard_repo_path(
                path_value,
                allowed_root=REPO_ROOT,
                label=f"安装前动作 PNG {map_id}/{action_kind}",
                expected="file",
            )
            digest = _sha256(path)
            if digest in hashes:
                raise MapActionCaptureError(
                    f"同图五张动作 PNG 字节重复：{map_id}/"
                    f"{hashes[digest]}={action_kind}"
                )
            hashes[digest] = action_kind


def _validate_final_action_png_uniqueness(
    targets: Sequence[tuple[str, str, str, Path, Path, str]],
    *,
    map_ids: Sequence[str],
    staged_action_paths: Mapping[tuple[str, str], Path] | None = None,
) -> None:
    staged = staged_action_paths or {}
    action_paths: dict[tuple[str, str], Path] = {}
    for map_id, action_kind, _mode, screenshot, _report, target_state in targets:
        key = (map_id, action_kind)
        if target_state == "reuse":
            action_paths[key] = screenshot
            continue
        staged_path = staged.get(key)
        if staged_path is None:
            raise MapActionCaptureError(
                f"待录动作缺少安装前 staging PNG：{map_id}/{action_kind}"
            )
        action_paths[key] = staged_path
    _validate_same_map_action_png_uniqueness(action_paths, map_ids=map_ids)


def _backup_formal_pairs(
    targets: list[tuple[str, str, str, Path, Path, str]],
    backup_root: Path,
    *,
    formal_root: Path,
    safety_anchor: Path = REPO_ROOT,
) -> list[tuple[Path, Path]]:
    safe_formal_root = _guard_repo_path(
        formal_root,
        allowed_root=formal_root,
        anchor=safety_anchor,
        label="正式动作根",
        expected="dir",
    )
    safe_backup_root = _guard_repo_path(
        backup_root,
        allowed_root=backup_root,
        anchor=safety_anchor,
        label="旧动作证据归档根",
        expected="dir_or_missing",
    )
    moves: list[tuple[Path, Path]] = []
    try:
        for map_id, action_kind, _mode, screenshot, report, target_state in targets:
            if target_state != "replace":
                continue
            for source in (screenshot, report):
                expected_source = (
                    safe_formal_root / map_id / source.name
                )
                if _absolute_lexical(source) != expected_source:
                    raise MapActionCaptureError(
                        "正式动作证据不是精确固定目标："
                        f"{_portable(source)}"
                    )
                _guard_repo_path(
                    source,
                    allowed_root=safe_formal_root,
                    anchor=safety_anchor,
                    label=f"正式动作证据 {map_id}/{action_kind}",
                    expected="file",
                )
                relative = Path(map_id) / action_kind / source.name
                backup = safe_backup_root / relative
                _guard_repo_path(
                    backup,
                    allowed_root=safe_backup_root,
                    anchor=safety_anchor,
                    label=f"旧动作证据归档 {map_id}/{action_kind}",
                    expected="missing",
                )
                backup.parent.mkdir(parents=True, exist_ok=True)
                _guard_repo_path(
                    backup.parent,
                    allowed_root=safe_backup_root,
                    anchor=safety_anchor,
                    label=f"旧动作证据归档目录 {map_id}/{action_kind}",
                    expected="dir",
                )
                source.replace(backup)
                _guard_repo_path(
                    backup,
                    allowed_root=safe_backup_root,
                    anchor=safety_anchor,
                    label=f"已归档旧动作证据 {map_id}/{action_kind}",
                    expected="file",
                )
                moves.append((source, backup))
    except BaseException:
        _restore_formal_pairs(
            moves,
            formal_root=safe_formal_root,
            backup_root=safe_backup_root,
            safety_anchor=safety_anchor,
        )
        raise
    return moves


def _restore_formal_pairs(
    backups: list[tuple[Path, Path]],
    *,
    formal_root: Path,
    backup_root: Path,
    safety_anchor: Path = REPO_ROOT,
) -> None:
    errors: list[str] = []
    for destination, backup in reversed(backups):
        try:
            safe_destination = _guard_repo_path(
                destination,
                allowed_root=formal_root,
                anchor=safety_anchor,
                label="正式动作回滚目标",
                expected="file_or_missing",
            )
            safe_backup = _guard_repo_path(
                backup,
                allowed_root=backup_root,
                anchor=safety_anchor,
                label="正式动作回滚源",
                expected="file",
            )
            if safe_destination.exists():
                safe_destination.unlink()
            safe_destination.parent.mkdir(parents=True, exist_ok=True)
            safe_backup.replace(safe_destination)
            _guard_repo_path(
                safe_destination,
                allowed_root=formal_root,
                anchor=safety_anchor,
                label="已恢复正式动作证据",
                expected="file",
            )
        except (OSError, MapActionCaptureError) as error:
            errors.append(f"{_portable(destination)}: {error}")
    if errors:
        raise MapActionCaptureError(
            "正式动作证据回滚不完整：" + "; ".join(errors)
        )


def _install_staged_pairs(
    staged_targets: Sequence[tuple[str, str, str, Path, Path, str]],
    install_targets: Mapping[tuple[str, str], tuple[Path, Path]],
    *,
    staging_root: Path,
    install_root: Path,
    safety_anchor: Path = REPO_ROOT,
) -> list[tuple[Path, Path]]:
    moves: list[tuple[Path, Path]] = []
    try:
        for (
            map_id,
            action_kind,
            _mode,
            staged_screenshot,
            staged_report,
            _target_state_value,
        ) in staged_targets:
            install_pair = install_targets.get((map_id, action_kind))
            if install_pair is None:
                raise MapActionCaptureError(
                    f"动作安装缺少固定目标：{map_id}/{action_kind}"
                )
            for staged, destination in zip(
                (staged_screenshot, staged_report),
                install_pair,
                strict=True,
            ):
                safe_staged = _guard_repo_path(
                    staged,
                    allowed_root=staging_root,
                    anchor=safety_anchor,
                    label=f"动作 staging 文件 {map_id}/{action_kind}",
                    expected="file",
                )
                safe_destination = _guard_repo_path(
                    destination,
                    allowed_root=install_root,
                    anchor=safety_anchor,
                    label=f"动作正式安装目标 {map_id}/{action_kind}",
                    expected="missing",
                )
                safe_destination.parent.mkdir(parents=True, exist_ok=True)
                _guard_repo_path(
                    safe_destination.parent,
                    allowed_root=install_root,
                    anchor=safety_anchor,
                    label=f"动作正式安装目录 {map_id}/{action_kind}",
                    expected="dir",
                )
                safe_staged.replace(safe_destination)
                _guard_repo_path(
                    safe_destination,
                    allowed_root=install_root,
                    anchor=safety_anchor,
                    label=f"已安装动作证据 {map_id}/{action_kind}",
                    expected="file",
                )
                moves.append((safe_staged, safe_destination))
    except BaseException as error:
        rollback_errors: list[str] = []
        for staged, destination in reversed(moves):
            try:
                safe_destination = _guard_repo_path(
                    destination,
                    allowed_root=install_root,
                    anchor=safety_anchor,
                    label="部分动作安装回滚源",
                    expected="file",
                )
                safe_staged = _guard_repo_path(
                    staged,
                    allowed_root=staging_root,
                    anchor=safety_anchor,
                    label="部分动作安装回滚目标",
                    expected="missing",
                )
                safe_staged.parent.mkdir(parents=True, exist_ok=True)
                safe_destination.replace(safe_staged)
            except (OSError, MapActionCaptureError) as rollback_error:
                rollback_errors.append(
                    f"{_portable(destination)}: {rollback_error}"
                )
        if rollback_errors:
            raise MapActionCaptureError(
                "动作正式安装失败且部分安装回滚不完整："
                + "; ".join(rollback_errors)
            ) from error
        raise
    return moves


def _rollback_installed_pairs(
    moves: Sequence[tuple[Path, Path]],
    *,
    staging_root: Path,
    install_root: Path,
    safety_anchor: Path = REPO_ROOT,
) -> None:
    errors: list[str] = []
    for staged, destination in reversed(moves):
        try:
            safe_destination = _guard_repo_path(
                destination,
                allowed_root=install_root,
                anchor=safety_anchor,
                label="动作安装事务回滚源",
                expected="file",
            )
            safe_staged = _guard_repo_path(
                staged,
                allowed_root=staging_root,
                anchor=safety_anchor,
                label="动作安装事务回滚目标",
                expected="missing",
            )
            safe_staged.parent.mkdir(parents=True, exist_ok=True)
            safe_destination.replace(safe_staged)
        except (OSError, MapActionCaptureError) as error:
            errors.append(f"{_portable(destination)}: {error}")
    if errors:
        raise MapActionCaptureError(
            "动作正式安装事务回滚不完整：" + "; ".join(errors)
        )


def _fsync_directory(path: Path) -> None:
    descriptor = os.open(
        path,
        os.O_RDONLY | getattr(os, "O_DIRECTORY", 0),
    )
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def _fsync_file(path: Path) -> None:
    descriptor = os.open(
        path,
        os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0),
    )
    try:
        identity = os.fstat(descriptor)
        if not stat.S_ISREG(identity.st_mode) or identity.st_nlink != 1:
            raise MapActionCaptureError(
                f"durable transaction 文件 inode 不安全：{_portable(path)}"
            )
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def _fsync_directory_chain(path: Path, *, stop: Path) -> None:
    current = _absolute_lexical(path)
    fixed_stop = _absolute_lexical(stop)
    try:
        current.relative_to(fixed_stop)
    except ValueError as error:
        raise MapActionCaptureError("durable transaction 目录同步越界") from error
    while True:
        _fsync_directory(current)
        if current == fixed_stop:
            return
        current = current.parent


def _durable_replace(source: Path, destination: Path) -> None:
    _fsync_file(source)
    os.replace(source, destination)
    synced: set[Path] = set()
    for directory in (source.parent, destination.parent):
        fixed = _absolute_lexical(directory)
        if fixed not in synced:
            _fsync_directory(fixed)
            synced.add(fixed)


def _durable_unlink(path: Path) -> None:
    path.unlink()
    _fsync_directory(path.parent)
    if _path_exists_or_link(path):
        raise MapActionCaptureError(
            f"durable transaction 删除后路径仍存在：{_portable(path)}"
        )


def _backup_temporary_name(backup: Path) -> str:
    return f".{backup.name}.{uuid.uuid4().hex}.backup.tmp"


def _backup_temporary_paths(
    backup: Path,
    *,
    backup_root: Path,
) -> list[Path]:
    parent = _guard_repo_path(
        backup.parent,
        allowed_root=backup_root,
        label="formal transaction backup 临时目录",
        expected="dir_or_missing",
    )
    if not parent.is_dir():
        return []
    pattern = re.compile(
        rf"\.{re.escape(backup.name)}\.[0-9a-f]{{32}}\.backup\.tmp"
    )
    temporary_paths: list[Path] = []
    for candidate in sorted(parent.iterdir(), key=lambda item: item.name):
        if pattern.fullmatch(candidate.name) is None:
            continue
        temporary_paths.append(
            _guard_repo_path(
                candidate,
                allowed_root=backup_root,
                label="formal transaction backup 中断临时文件",
                expected="file",
            )
        )
    return temporary_paths


def _publish_backup_temporary_no_replace(
    temporary: Path,
    backup: Path,
    *,
    expected_sha256: str,
) -> None:
    if not _is_sha256(expected_sha256):
        raise MapActionCaptureError("formal transaction backup 预期哈希无效")
    _fsync_file(temporary)
    if _sha256(temporary) != expected_sha256:
        raise MapActionCaptureError("formal transaction backup 临时文件哈希不一致")
    try:
        os.link(temporary, backup, follow_symlinks=False)
    except FileExistsError as error:
        raise MapActionCaptureError(
            "formal transaction backup 原子发布拒绝覆盖已有目标"
        ) from error
    except OSError as error:
        raise MapActionCaptureError(
            "formal transaction backup 原子发布失败"
        ) from error
    _fsync_directory(backup.parent)
    if not backup.is_file() or _sha256(backup) != expected_sha256:
        raise MapActionCaptureError(
            "formal transaction backup 原子发布后置条件失败"
        )


def _copy_backup_atomic_no_replace(
    source: Path,
    backup: Path,
    *,
    expected_sha256: str,
    backup_root: Path,
) -> None:
    _guard_repo_path(
        backup,
        allowed_root=backup_root,
        label="formal transaction backup",
        expected="missing",
    )
    backup.parent.mkdir(parents=True, exist_ok=True)
    _guard_repo_path(
        backup.parent,
        allowed_root=backup_root,
        label="formal transaction backup 目录",
        expected="dir",
    )
    temporary = backup.parent / _backup_temporary_name(backup)
    _guard_repo_path(
        temporary,
        allowed_root=backup_root,
        label="formal transaction backup 临时文件",
        expected="missing",
    )
    try:
        shutil.copy2(source, temporary)
        _guard_repo_path(
            temporary,
            allowed_root=backup_root,
            label="formal transaction backup 临时文件",
            expected="file",
        )
        _publish_backup_temporary_no_replace(
            temporary,
            backup,
            expected_sha256=expected_sha256,
        )
    finally:
        if _path_exists_or_link(temporary):
            _guard_repo_path(
                temporary,
                allowed_root=backup_root,
                label="formal transaction backup 临时文件清理",
                expected="file",
            )
            _durable_unlink(temporary)
    _guard_repo_path(
        backup,
        allowed_root=backup_root,
        label="formal transaction 已发布 backup",
        expected="file",
    )
    if _sha256(backup) != expected_sha256:
        raise MapActionCaptureError("formal transaction 旧证据备份哈希不一致")


def _write_durable_json(path: Path, payload: Mapping[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.parent / f".{path.name}.{uuid.uuid4().hex}.tmp"
    _guard_repo_path(
        temporary,
        allowed_root=path.parent,
        anchor=path.parent,
        label="formal transaction journal 临时文件",
        expected="missing",
    )
    descriptor = os.open(
        temporary,
        os.O_CREAT | os.O_EXCL | os.O_WRONLY,
        0o600,
    )
    try:
        data = (
            json.dumps(payload, ensure_ascii=False, indent=2) + "\n"
        ).encode("utf-8")
        remaining = memoryview(data)
        while remaining:
            written = os.write(descriptor, remaining)
            if written <= 0:
                raise OSError("formal transaction journal short write")
            remaining = remaining[written:]
        os.fsync(descriptor)
    finally:
        os.close(descriptor)
    os.replace(temporary, path)
    _fsync_directory(path.parent)


def _transaction_maps(bundle_id: str) -> tuple[str, ...]:
    config = RECORDER.RECORDER_CONFIGS.get(bundle_id)
    maps = config.get("maps") if isinstance(config, dict) else None
    if (
        not isinstance(maps, tuple)
        or not maps
        or len(set(maps)) != len(maps)
        or any(
            not isinstance(map_id, str)
            or RECORDER.SAFE_MAP_ID.fullmatch(map_id) is None
            for map_id in maps
        )
    ):
        raise MapActionCaptureError("formal transaction bundle 地图集无效")
    return maps


def _transaction_artifact_specs(
    bundle_id: str,
) -> list[tuple[str, str, str, str]]:
    return [
        (map_id, action_kind, artifact_type, file_name)
        for map_id in _transaction_maps(bundle_id)
        for action_kind in ACTION_KINDS
        for artifact_type, file_name in (
            ("screenshot_png", f"{action_kind}.png"),
            ("capture_report_json", f"{action_kind}-capture.json"),
        )
    ]


def _validate_transaction_staging_root(run_root: Path, staging_root: Path) -> None:
    try:
        parts = staging_root.relative_to(run_root).parts
    except ValueError as error:
        raise MapActionCaptureError(
            "formal transaction journal stagingRoot 越界"
        ) from error
    direct = parts == ("single-window-batch", "staged-actions")
    resumed = (
        len(parts) == 3
        and parts[0] == "single-window-batch"
        and re.fullmatch(r"resume-(?:0[1-9]|[1-9][0-9])", parts[1])
        is not None
        and parts[2] == "staged-actions"
    )
    if not (direct or resumed):
        raise MapActionCaptureError(
            "formal transaction journal stagingRoot 不是固定 batch staging 路径"
        )


def _formal_entry_set(journal: Mapping[str, Any]) -> list[dict[str, str]]:
    return [
        {
            "mapId": str(entry["mapId"]),
            "actionKind": str(entry["actionKind"]),
            "type": str(entry["type"]),
            "destination": str(entry["destination"]),
            "sha256": str(entry["stagedSha256"]),
        }
        for entry in journal["entries"]
    ]


def _validate_formal_transaction_journal(
    journal_path: Path,
    journal: Mapping[str, Any],
) -> dict[str, Any]:
    root_keys = {
        "schemaVersion",
        "reportType",
        "bundleId",
        "status",
        "runRoot",
        "stagingRoot",
        "installRoot",
        "backupRoot",
        "entries",
        "summaryBinding",
    }
    if set(journal) != root_keys:
        raise MapActionCaptureError("formal transaction journal 根字段不精确")
    if (
        type(journal.get("schemaVersion")) is not int
        or journal.get("schemaVersion") != BATCH_TRANSACTION_SCHEMA_VERSION
        or journal.get("reportType") != BATCH_TRANSACTION_REPORT_TYPE
    ):
        raise MapActionCaptureError("formal transaction journal schema 无效")
    bundle_id = journal.get("bundleId")
    if not isinstance(bundle_id, str) or bundle_id not in RECORDER.RECORDER_CONFIGS:
        raise MapActionCaptureError("formal transaction journal bundleId 无效")
    status_value = journal.get("status")
    statuses = {
        "preparing_backups",
        "prepared",
        "installing",
        "installed_uncommitted",
        "committed",
        "rolled_back",
    }
    if status_value not in statuses:
        raise MapActionCaptureError("formal transaction journal status 无效")

    run_root = _absolute_lexical(journal_path.parent)
    install_root = _absolute_lexical(
        REPO_ROOT
        / "client"
        / "godot"
        / "assets"
        / "maps"
        / bundle_id
        / "evidence"
        / "runtime-actions"
    )
    backup_root = run_root / "superseded"
    staging_root = _absolute_lexical(Path(str(journal.get("stagingRoot", ""))))
    if (
        journal_path.name != "formal-install-transaction.json"
        or journal.get("runRoot") != str(run_root)
        or journal.get("installRoot") != str(install_root)
        or journal.get("backupRoot") != str(backup_root)
        or journal.get("stagingRoot") != str(staging_root)
    ):
        raise MapActionCaptureError("formal transaction journal 固定根路径不匹配")
    _validate_transaction_staging_root(run_root, staging_root)

    entries = journal.get("entries")
    expected_specs = _transaction_artifact_specs(bundle_id)
    if not isinstance(entries, list) or len(entries) != len(expected_specs):
        raise MapActionCaptureError(
            "formal transaction journal 必须覆盖精确完整动作文件矩阵："
            f"expected={len(expected_specs)}"
        )
    entry_keys = {
        "mapId",
        "actionKind",
        "type",
        "operation",
        "staged",
        "stagedSha256",
        "destination",
        "hadOld",
        "oldSha256",
        "backup",
        "state",
    }
    seen_paths: set[str] = set()
    for entry, (map_id, action_kind, artifact_type, file_name) in zip(
        entries,
        expected_specs,
        strict=True,
    ):
        if not isinstance(entry, dict) or set(entry) != entry_keys:
            raise MapActionCaptureError(
                "formal transaction journal entry 字段不精确"
            )
        destination = install_root / map_id / file_name
        if (
            entry.get("mapId") != map_id
            or entry.get("actionKind") != action_kind
            or entry.get("type") != artifact_type
            or entry.get("destination") != str(destination)
            or not _is_sha256(entry.get("stagedSha256"))
            or type(entry.get("hadOld")) is not bool
        ):
            raise MapActionCaptureError(
                "formal transaction journal entry map/action/type/path/hash 无效"
            )
        operation = entry.get("operation")
        if operation == "install":
            staged = staging_root / map_id / file_name
            expected_backup = backup_root / map_id / action_kind / file_name
            had_old = entry["hadOld"]
            if (
                entry.get("staged") != str(staged)
                or (had_old and entry.get("backup") != str(expected_backup))
                or (not had_old and entry.get("backup") is not None)
                or (had_old and not _is_sha256(entry.get("oldSha256")))
                or (not had_old and entry.get("oldSha256") is not None)
            ):
                raise MapActionCaptureError(
                    "formal transaction journal install entry old/backup 无效"
                )
            state = entry.get("state")
            allowed_states = {
                "planned",
                "backed_up",
                "installing",
                "installed",
                "rolled_back",
            }
            if state not in allowed_states:
                raise MapActionCaptureError(
                    "formal transaction journal install entry state 无效"
                )
            if status_value == "prepared" and state != (
                "backed_up" if had_old else "planned"
            ):
                raise MapActionCaptureError(
                    "formal transaction prepared entry state 不一致"
                )
            if status_value in {"installed_uncommitted", "committed"} and state != "installed":
                raise MapActionCaptureError(
                    "formal transaction installed entry state 不一致"
                )
            if status_value == "rolled_back" and state != "rolled_back":
                raise MapActionCaptureError(
                    "formal transaction rolled_back entry state 不一致"
                )
        elif operation == "retain":
            if (
                entry.get("staged") is not None
                or entry.get("hadOld") is not True
                or entry.get("oldSha256") != entry.get("stagedSha256")
                or entry.get("backup") is not None
                or entry.get("state") != "retained"
            ):
                raise MapActionCaptureError(
                    "formal transaction journal retain entry 无效"
                )
        else:
            raise MapActionCaptureError(
                "formal transaction journal entry operation 无效"
            )
        for key in ("staged", "destination", "backup"):
            value = entry.get(key)
            if value is None:
                continue
            if value in seen_paths:
                raise MapActionCaptureError(
                    "formal transaction journal 路径重复"
                )
            seen_paths.add(value)

    binding = journal.get("summaryBinding")
    if status_value != "committed":
        if binding is not None:
            raise MapActionCaptureError(
                "formal transaction 未提交时不得绑定 summary"
            )
    else:
        binding_keys = {
            "pendingPath",
            "finalPath",
            "sha256",
            "bundleId",
            "result",
            "reportType",
            "entrySet",
            "entrySetSha256",
        }
        entry_set = _formal_entry_set(journal)
        if (
            not isinstance(binding, dict)
            or set(binding) != binding_keys
            or binding.get("pendingPath")
            != str(run_root / "capture-matrix.pending.json")
            or binding.get("finalPath") != str(run_root / "capture-matrix.json")
            or not _is_sha256(binding.get("sha256"))
            or binding.get("bundleId") != bundle_id
            or binding.get("result") != "PASS"
            or binding.get("reportType")
            != BATCH_TRANSACTION_SUMMARY_REPORT_TYPE
            or binding.get("entrySet") != entry_set
            or binding.get("entrySetSha256") != _canonical_sha256(entry_set)
        ):
            raise MapActionCaptureError(
                "formal transaction committed summary binding 无效"
            )
    return {
        "bundleId": bundle_id,
        "status": status_value,
        "runRoot": run_root,
        "stagingRoot": staging_root,
        "installRoot": install_root,
        "backupRoot": backup_root,
        "entries": entries,
    }


def _validate_formal_destination_set(journal: Mapping[str, Any]) -> None:
    install_root = Path(str(journal["installRoot"]))
    for entry in journal["entries"]:
        destination = _guard_repo_path(
            Path(str(entry["destination"])),
            allowed_root=install_root,
            label="formal transaction committed destination",
            expected="file",
        )
        if _sha256(destination) != entry["stagedSha256"]:
            raise MapActionCaptureError(
                "formal transaction 当前正式动作 SHA 与 journal 不一致"
            )


def _validate_summary_artifact(
    artifact: Any,
    *,
    label: str,
    expected_path: Path | None = None,
    expected_sha256: str | None = None,
    expected_size: int | None = None,
) -> dict[str, Any]:
    if not isinstance(artifact, dict) or set(artifact) != FORMAL_SUMMARY_ARTIFACT_KEYS:
        raise MapActionCaptureError(f"{label} artifact 字段不精确")
    path_value = artifact.get("path")
    size_value = artifact.get("sizeBytes")
    sha_value = artifact.get("sha256")
    if (
        not isinstance(path_value, str)
        or not path_value
        or type(size_value) is not int
        or size_value <= 0
        or not _is_sha256(sha_value)
    ):
        raise MapActionCaptureError(f"{label} artifact 类型/schema 无效")
    if expected_path is not None and path_value != _portable(expected_path):
        raise MapActionCaptureError(f"{label} artifact 路径不一致")
    if expected_sha256 is not None and sha_value != expected_sha256:
        raise MapActionCaptureError(f"{label} artifact SHA 不一致")
    if expected_size is not None and size_value != expected_size:
        raise MapActionCaptureError(f"{label} artifact 字节数不一致")
    return artifact


def _validate_summary_window_evidence(
    evidence: Any,
    *,
    capture_count: int,
    expected_root_counts: Mapping[str, Any],
) -> dict[str, Any]:
    root_keys = {
        "godotProcessCount",
        "userVisibleWindowOpenCount",
        "userVisibleWindowCloseCount",
        "singlePersistentWindow",
        "batchCount",
        "batches",
        "derivation",
    }
    if not isinstance(evidence, dict) or set(evidence) != root_keys:
        raise MapActionCaptureError(
            "formal transaction committed summary windowCountEvidence 字段不精确"
        )
    batches = evidence.get("batches")
    batch_count = evidence.get("batchCount")
    if (
        type(batch_count) is not int
        or batch_count <= 0
        or not isinstance(batches, list)
        or len(batches) != batch_count
        or not isinstance(evidence.get("derivation"), str)
        or not evidence["derivation"]
    ):
        raise MapActionCaptureError(
            "formal transaction committed summary windowCountEvidence schema 无效"
        )
    batch_keys = {
        "planSha256",
        "processId",
        "rootWindowId",
        "godotProcessCount",
        "userVisibleWindowOpenCount",
        "userVisibleWindowCloseCount",
        "singlePersistentWindow",
        "displayServerWindowCountDuringCapture",
        "processReturnedBeforeLaneCleanup",
        "laneCleanupStatus",
        "postCleanupInspectStatus",
        "processExitCode",
        "leaderReaped",
        "processGroupClosed",
        "processGroupResidualObserved",
        "derivation",
        "actionCount",
    }
    action_total = 0
    identities: set[tuple[str, int, int]] = set()
    for batch in batches:
        if not isinstance(batch, dict) or set(batch) != batch_keys:
            raise MapActionCaptureError(
                "formal transaction committed summary window batch 字段不精确"
            )
        identity = (
            batch.get("planSha256"),
            batch.get("processId"),
            batch.get("rootWindowId"),
        )
        if (
            not _is_sha256(identity[0])
            or type(identity[1]) is not int
            or identity[1] <= 0
            or type(identity[2]) is not int
            or type(batch.get("actionCount")) is not int
            or batch["actionCount"] <= 0
            or batch.get("godotProcessCount") != 1
            or batch.get("userVisibleWindowOpenCount") != 1
            or batch.get("userVisibleWindowCloseCount") != 1
            or batch.get("singlePersistentWindow") is not True
            or batch.get("displayServerWindowCountDuringCapture") != 1
            or batch.get("processReturnedBeforeLaneCleanup") is not True
            or batch.get("laneCleanupStatus") != "cleaned"
            or batch.get("postCleanupInspectStatus") != "inspected"
            or batch.get("processExitCode") != 0
            or batch.get("leaderReaped") is not True
            or batch.get("processGroupClosed") is not True
            or batch.get("processGroupResidualObserved") is not False
            or not isinstance(batch.get("derivation"), str)
            or not batch["derivation"]
            or identity in identities
        ):
            raise MapActionCaptureError(
                "formal transaction committed summary window batch schema 无效"
            )
        identities.add(identity)
        action_total += batch["actionCount"]
    if action_total != capture_count:
        raise MapActionCaptureError(
            "formal transaction committed summary window batch 动作数不精确"
        )
    expected = {
        "godotProcessCount": batch_count,
        "userVisibleWindowOpenCount": batch_count,
        "userVisibleWindowCloseCount": batch_count,
        "singlePersistentWindow": batch_count == 1,
    }
    if any(
        evidence.get(key) != value
        or expected_root_counts.get(key) != value
        for key, value in expected.items()
    ):
        raise MapActionCaptureError(
            "formal transaction committed summary window 计数结论不一致"
        )
    return evidence


def _validate_summary_record_shape(
    record: Any,
    *,
    action_key: tuple[str, str],
    mode: str,
    operation: str,
    resumed: bool,
) -> dict[str, Any]:
    expected_keys = set(FORMAL_SUMMARY_RECORD_KEYS)
    if operation == "install":
        expected_keys.add("singleWindowBatch")
    allowed_key_sets = [expected_keys]
    if operation == "install" and resumed:
        allowed_key_sets.append(expected_keys | {"archivedFailedCaptureReport"})
    if not isinstance(record, dict) or set(record) not in allowed_key_sets:
        raise MapActionCaptureError(
            "formal transaction committed summary record 字段不精确"
        )
    map_id, action_kind = action_key
    if (
        record.get("mapId") != map_id
        or record.get("actionKind") != action_kind
        or record.get("mode") != mode
        or record.get("captureVariant") != action_kind
        or type(record.get("resumed")) is not bool
        or record.get("resumed") is not resumed
        or record.get("captureResult") != "PASS"
        or not isinstance(record.get("targetClearance"), str)
        or not isinstance(record.get("hudGlyphStability"), dict)
        or not record["hudGlyphStability"]
    ):
        raise MapActionCaptureError(
            "formal transaction committed summary record 类型/schema 无效"
        )
    qa_lane = record.get("qaLane")
    qa_lane_keys = {
        "sourceCheck",
        "nativeAttestation",
        "nativeProcess",
        "cleanup",
        "postCleanupInspect",
        "lifecycle",
    }
    if (
        not isinstance(qa_lane, dict)
        or set(qa_lane) != qa_lane_keys
        or any(
            not isinstance(qa_lane.get(key), dict)
            for key in qa_lane_keys - {"lifecycle"}
        )
    ):
        raise MapActionCaptureError(
            "formal transaction committed summary record qaLane schema 无效"
        )
    _validate_summary_artifact(
        qa_lane.get("lifecycle"),
        label="formal transaction committed summary qaLane lifecycle",
    )
    binding = record.get("batchBinding")
    binding_keys = {
        "planSha256",
        "sourceIdentity",
        "runtimeIdentity",
        "buildIdentity",
        "windowIdentity",
        "batchResult",
        "actionReceipt",
    }
    if (
        not isinstance(binding, dict)
        or set(binding) != binding_keys
        or not _is_sha256(binding.get("planSha256"))
        or not isinstance(binding.get("sourceIdentity"), dict)
        or not isinstance(binding.get("runtimeIdentity"), dict)
        or not isinstance(binding.get("buildIdentity"), str)
        or not binding["buildIdentity"]
        or not isinstance(binding.get("windowIdentity"), dict)
        or binding.get("batchResult") != "PASS"
        or not isinstance(binding.get("actionReceipt"), dict)
    ):
        raise MapActionCaptureError(
            "formal transaction committed summary record batchBinding schema 无效"
        )
    if operation == "install":
        batch = record.get("singleWindowBatch")
        batch_keys = {
            "planSha256",
            "godotProcessCount",
            "userVisibleWindowOpenCount",
            "userVisibleWindowCloseCount",
            "singlePersistentWindow",
            "processId",
            "displayServerWindowCountDuringCapture",
            "processReturnedBeforeLaneCleanup",
            "laneCleanupStatus",
            "postCleanupInspectStatus",
            "processExitCode",
            "leaderReaped",
            "processGroupClosed",
            "processGroupResidualObserved",
            "derivation",
            "sourceIdentity",
        }
        if (
            not isinstance(batch, dict)
            or set(batch) != batch_keys
            or batch.get("planSha256") != binding["planSha256"]
            or batch.get("sourceIdentity") != binding["sourceIdentity"]
            or batch.get("godotProcessCount") != 1
            or batch.get("userVisibleWindowOpenCount") != 1
            or batch.get("userVisibleWindowCloseCount") != 1
            or batch.get("singlePersistentWindow") is not True
            or type(batch.get("processId")) is not int
            or batch.get("processId", 0) <= 0
            or batch.get("displayServerWindowCountDuringCapture") != 1
            or batch.get("processReturnedBeforeLaneCleanup") is not True
            or batch.get("laneCleanupStatus") != "cleaned"
            or batch.get("postCleanupInspectStatus") != "inspected"
            or batch.get("processExitCode") != 0
            or batch.get("leaderReaped") is not True
            or batch.get("processGroupClosed") is not True
            or batch.get("processGroupResidualObserved") is not False
            or not isinstance(batch.get("derivation"), str)
            or not batch["derivation"]
        ):
            raise MapActionCaptureError(
                "formal transaction committed summary record singleWindowBatch schema 无效"
            )
    if "archivedFailedCaptureReport" in record:
        _validate_summary_artifact(
            record["archivedFailedCaptureReport"],
            label="formal transaction committed summary archived report",
        )
    return record


def _validate_summary_against_transaction(
    summary_path: Path,
    journal: Mapping[str, Any],
    *,
    expected_sha256: str | None = None,
) -> dict[str, Any]:
    run_root = Path(str(journal["runRoot"]))
    _guard_repo_path(
        summary_path,
        allowed_root=run_root,
        label="formal transaction committed summary",
        expected="file",
    )
    summary_sha = _sha256(summary_path)
    if expected_sha256 is not None and summary_sha != expected_sha256:
        raise MapActionCaptureError(
            "formal transaction committed summary SHA 漂移"
        )
    summary = _read_json_object(
        summary_path,
        label="formal transaction committed summary",
    )
    bundle_id = str(journal["bundleId"])
    maps = _transaction_maps(bundle_id)
    expected_actions = [
        (map_id, action_kind)
        for map_id in maps
        for action_kind in ACTION_KINDS
    ]
    if set(summary) != FORMAL_SUMMARY_ROOT_KEYS:
        raise MapActionCaptureError(
            "formal transaction committed summary 根字段不精确"
        )
    if (
        type(summary.get("schemaVersion")) is not int
        or summary.get("schemaVersion") != 1
        or summary.get("reportType") != BATCH_TRANSACTION_SUMMARY_REPORT_TYPE
        or not isinstance(summary.get("generatedAtUtc"), str)
        or re.fullmatch(
            r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z",
            summary["generatedAtUtc"],
        )
        is None
        or summary.get("bundleId") != bundle_id
        or summary.get("result") != "PASS"
        or summary.get("maps") != list(maps)
        or summary.get("actionKinds") != list(ACTION_KINDS)
        or type(summary.get("captureCount")) is not int
        or summary.get("captureCount") != len(expected_actions)
        or summary.get("launchStrategy") != "single_persistent_window"
        or any(
            type(summary.get(key)) is not int or summary[key] <= 0
            for key in (
                "godotProcessCount",
                "userVisibleWindowOpenCount",
                "userVisibleWindowCloseCount",
                "actionsRecordedInSingleProcess",
            )
        )
        or summary["actionsRecordedInSingleProcess"] > len(expected_actions)
        or type(summary.get("singlePersistentWindow")) is not bool
        or not _is_sha256(summary.get("batchPlanSha256"))
        or not isinstance(summary.get("batchRuntimeReceipt"), dict)
        or not summary["batchRuntimeReceipt"]
        or type(summary.get("scratchOnly")) is not bool
        or summary.get("scratchOnly") is not False
        or type(summary.get("resumed")) is not bool
        or type(summary.get("replacedPendingEvidence")) is not bool
    ):
        raise MapActionCaptureError(
            "formal transaction committed summary 顶层类型/schema 不匹配"
        )
    _validate_summary_window_evidence(
        summary.get("windowCountEvidence"),
        capture_count=len(expected_actions),
        expected_root_counts=summary,
    )
    for field in ("batchEntrypoint", "batchCaptureController", "batchPlan"):
        artifact = _validate_summary_artifact(
            summary.get(field),
            label=f"formal transaction committed summary {field}",
        )
        if field == "batchPlan" and artifact["sha256"] != summary["batchPlanSha256"]:
            raise MapActionCaptureError(
                "formal transaction committed summary batchPlan SHA 绑定不一致"
            )
    hud = summary.get("hudGlyphStability")
    if (
        not isinstance(hud, dict)
        or set(hud)
        != {
            "status",
            "selfContainedImageCount",
            "incrementalPreviewAcceptedAsPixelAuthority",
            "board",
        }
        or hud.get("status") != "passed"
        or type(hud.get("selfContainedImageCount")) is not int
        or hud.get("selfContainedImageCount") != len(expected_actions)
        or hud.get("incrementalPreviewAcceptedAsPixelAuthority") is not False
    ):
        raise MapActionCaptureError(
            "formal transaction committed summary HUD schema 无效"
        )
    board = hud.get("board")
    if (
        not isinstance(board, dict)
        or set(board) != FORMAL_SUMMARY_BOARD_ARTIFACT_KEYS
        or not isinstance(board.get("path"), str)
        or not board["path"]
        or not _is_sha256(board.get("sha256"))
        or any(
            type(board.get(key)) is not int or board[key] <= 0
            for key in ("bytes", "width", "height", "itemCount")
        )
        or board.get("itemCount") != len(expected_actions)
        or board.get("presentationMode")
        != "single_precomposed_bitmap_no_incremental_frames"
    ):
        raise MapActionCaptureError(
            "formal transaction committed summary HUD board artifact 无效"
        )
    records = summary.get("records")
    if not isinstance(records, list) or len(records) != len(expected_actions):
        raise MapActionCaptureError(
            "formal transaction committed summary records 数量不精确"
        )
    entries_by_key = {
        (entry["mapId"], entry["actionKind"], entry["type"]): entry
        for entry in journal["entries"]
    }
    if len(entries_by_key) != len(expected_actions) * 2 or len(entries_by_key) != 40:
        raise MapActionCaptureError(
            "formal transaction committed summary 必须绑定 40 个正式 artifact"
        )
    expected_superseded = [
        entry
        for entry in journal["entries"]
        if entry["operation"] == "install" and entry["hadOld"]
    ]
    superseded = summary.get("supersededEvidence")
    if not isinstance(superseded, list) or len(superseded) != len(expected_superseded):
        raise MapActionCaptureError(
            "formal transaction committed summary superseded artifact 数量不精确"
        )
    for artifact, entry in zip(superseded, expected_superseded, strict=True):
        backup = Path(str(entry["backup"]))
        _validate_summary_artifact(
            artifact,
            label="formal transaction committed summary superseded",
            expected_path=backup,
            expected_sha256=str(entry["oldSha256"]),
            expected_size=backup.stat().st_size if backup.is_file() else None,
        )
    seen: set[tuple[str, str]] = set()
    for record, expected_action in zip(records, expected_actions, strict=True):
        if not isinstance(record, dict):
            raise MapActionCaptureError(
                "formal transaction committed summary record 无效"
            )
        action_key = (record.get("mapId"), record.get("actionKind"))
        if action_key != expected_action or action_key in seen:
            raise MapActionCaptureError(
                "formal transaction committed summary action 集合不精确"
            )
        seen.add(action_key)
        action_entries = [
            entries_by_key[(*action_key, artifact_type)]
            for artifact_type in ("screenshot_png", "capture_report_json")
        ]
        operations = {entry["operation"] for entry in action_entries}
        if len(operations) != 1:
            raise MapActionCaptureError(
                "formal transaction committed summary action operation 不一致"
            )
        _validate_summary_record_shape(
            record,
            action_key=action_key,
            mode=ACTION_MODES[action_key[1]],
            operation=next(iter(operations)),
            resumed=bool(summary["resumed"]),
        )
        for field, artifact_type in (
            ("screenshot", "screenshot_png"),
            ("captureReport", "capture_report_json"),
        ):
            artifact = record.get(field)
            entry = entries_by_key.get((*action_key, artifact_type))
            if entry is None:
                raise MapActionCaptureError(
                    "formal transaction committed summary artifact entry 缺失"
                )
            destination = Path(str(entry["destination"]))
            _validate_summary_artifact(
                artifact,
                label="formal transaction committed summary formal",
                expected_path=destination,
                expected_sha256=str(entry["stagedSha256"]),
                expected_size=(
                    destination.stat().st_size
                    if destination.is_file()
                    else None
                ),
            )
        _validate_summary_artifact(
            record.get("godotLog"),
            label="formal transaction committed summary godotLog",
        )
    if seen != set(expected_actions):
        raise MapActionCaptureError(
            "formal transaction committed summary action 缺失"
        )
    _validate_formal_destination_set(journal)
    return summary


def _begin_formal_transaction(
    *,
    bundle_id: str,
    run_root: Path,
    staging_root: Path,
    install_root: Path,
    staged_targets: Sequence[tuple[str, str, str, Path, Path, str]],
    install_targets: Mapping[tuple[str, str], tuple[Path, Path]],
    formal_targets: Sequence[tuple[str, str, str, Path, Path, str]],
) -> tuple[Path, dict[str, Any], list[tuple[Path, Path]]]:
    run_root = _absolute_lexical(run_root)
    staging_root = _absolute_lexical(staging_root)
    install_root = _absolute_lexical(install_root)
    journal_path = run_root / "formal-install-transaction.json"
    _guard_repo_path(
        journal_path,
        allowed_root=run_root,
        label="formal transaction journal",
        expected="missing",
    )
    _validate_transaction_staging_root(run_root, staging_root)
    backup_root = run_root / "superseded"
    formal_by_action = {
        (map_id, action_kind): (screenshot, report, state)
        for map_id, action_kind, _mode, screenshot, report, state in formal_targets
    }
    staged_by_action = {
        (map_id, action_kind): (screenshot, report)
        for map_id, action_kind, _mode, screenshot, report, _state in staged_targets
    }
    expected_actions = {
        (map_id, action_kind)
        for map_id in _transaction_maps(bundle_id)
        for action_kind in ACTION_KINDS
    }
    if set(formal_by_action) != expected_actions:
        raise MapActionCaptureError(
            "formal transaction 必须绑定完整最终动作矩阵"
        )
    entries: list[dict[str, Any]] = []
    backups: list[tuple[Path, Path]] = []
    for map_id, action_kind, artifact_type, file_name in (
        _transaction_artifact_specs(bundle_id)
    ):
        formal_png, formal_report, target_state = formal_by_action[
            (map_id, action_kind)
        ]
        destination = formal_png if artifact_type == "screenshot_png" else formal_report
        expected_destination = install_root / map_id / file_name
        if _absolute_lexical(destination) != expected_destination:
            raise MapActionCaptureError(
                "formal transaction destination 不是固定动作文件名"
            )
        safe_destination = _guard_repo_path(
            destination,
            allowed_root=install_root,
            label="formal transaction destination",
            expected="file_or_missing",
        )
        if target_state == "reuse":
            if not safe_destination.is_file():
                raise MapActionCaptureError(
                    "formal transaction retain destination 缺失"
                )
            desired_sha = _sha256(safe_destination)
            entries.append({
                "mapId": map_id,
                "actionKind": action_kind,
                "type": artifact_type,
                "operation": "retain",
                "staged": None,
                "stagedSha256": desired_sha,
                "destination": str(safe_destination),
                "hadOld": True,
                "oldSha256": desired_sha,
                "backup": None,
                "state": "retained",
            })
            continue
        staged_pair = staged_by_action.get((map_id, action_kind))
        install_pair = install_targets.get((map_id, action_kind))
        if staged_pair is None or install_pair is None:
            raise MapActionCaptureError(
                "formal transaction install action 缺少 staging/固定目标"
            )
        staged = staged_pair[0] if artifact_type == "screenshot_png" else staged_pair[1]
        if _absolute_lexical(install_pair[0 if artifact_type == "screenshot_png" else 1]) != safe_destination:
            raise MapActionCaptureError(
                "formal transaction install target 映射漂移"
            )
        safe_staged = _guard_repo_path(
            staged,
            allowed_root=staging_root,
            label="formal transaction staged source",
            expected="file",
        )
        expected_staged = staging_root / map_id / file_name
        if safe_staged != expected_staged:
            raise MapActionCaptureError(
                "formal transaction staged source 不是固定动作文件名"
            )
        _fsync_file(safe_staged)
        _fsync_directory_chain(safe_staged.parent, stop=run_root)
        had_old = safe_destination.is_file()
        backup = backup_root / map_id / action_kind / file_name
        entries.append({
            "mapId": map_id,
            "actionKind": action_kind,
            "type": artifact_type,
            "operation": "install",
            "staged": str(safe_staged),
            "stagedSha256": _sha256(safe_staged),
            "destination": str(safe_destination),
            "hadOld": had_old,
            "oldSha256": _sha256(safe_destination) if had_old else None,
            "backup": str(backup) if had_old else None,
            "state": "planned",
        })
        if had_old:
            backups.append((safe_destination, backup))
    journal: dict[str, Any] = {
        "schemaVersion": BATCH_TRANSACTION_SCHEMA_VERSION,
        "reportType": BATCH_TRANSACTION_REPORT_TYPE,
        "bundleId": bundle_id,
        "status": "preparing_backups",
        "runRoot": str(run_root),
        "stagingRoot": str(staging_root),
        "installRoot": str(install_root),
        "backupRoot": str(backup_root),
        "entries": entries,
        "summaryBinding": None,
    }
    _validate_formal_transaction_journal(journal_path, journal)
    _fsync_directory(run_root.parent)
    _write_durable_json(journal_path, journal)
    for entry in entries:
        if entry["operation"] != "install" or not entry["hadOld"]:
            continue
        source = Path(entry["destination"])
        backup = Path(entry["backup"])
        _guard_repo_path(
            backup,
            allowed_root=backup_root,
            label="formal transaction backup",
            expected="missing",
        )
        _copy_backup_atomic_no_replace(
            source,
            backup,
            expected_sha256=str(entry["oldSha256"]),
            backup_root=backup_root,
        )
        _fsync_directory_chain(backup.parent, stop=run_root)
        entry["state"] = "backed_up"
    journal["status"] = "prepared"
    _validate_formal_transaction_journal(journal_path, journal)
    _write_durable_json(journal_path, journal)
    return journal_path, journal, backups


def _install_formal_transaction(
    journal_path: Path,
    journal: dict[str, Any],
) -> None:
    context = _validate_formal_transaction_journal(journal_path, journal)
    if context["status"] != "prepared":
        raise MapActionCaptureError("formal transaction 不在 prepared 状态")
    install_root = context["installRoot"]
    staging_root = context["stagingRoot"]
    for entry in journal["entries"]:
        destination = _guard_repo_path(
            Path(entry["destination"]),
            allowed_root=install_root,
            label="formal transaction install preflight destination",
            expected="file_or_missing",
        )
        if entry["operation"] == "retain":
            if not destination.is_file() or _sha256(destination) != entry["stagedSha256"]:
                raise MapActionCaptureError(
                    "formal transaction retain destination 在安装前漂移"
                )
            continue
        staged = _guard_repo_path(
            Path(entry["staged"]),
            allowed_root=staging_root,
            label="formal transaction install preflight staging",
            expected="file",
        )
        if _sha256(staged) != entry["stagedSha256"]:
            raise MapActionCaptureError(
                "formal transaction staging 在安装前漂移"
            )
        if entry["hadOld"]:
            if not destination.is_file() or _sha256(destination) != entry["oldSha256"]:
                raise MapActionCaptureError(
                    "formal transaction 旧正式字节在安装前漂移"
                )
        elif destination.is_file():
            raise MapActionCaptureError(
                "formal transaction 新目标在安装前意外出现"
            )
    journal["status"] = "installing"
    _write_durable_json(journal_path, journal)
    for entry in journal["entries"]:
        if entry["operation"] == "retain":
            continue
        staged = _guard_repo_path(
            Path(entry["staged"]),
            allowed_root=staging_root,
            label="formal transaction atomic source",
            expected="file",
        )
        destination = _guard_repo_path(
            Path(entry["destination"]),
            allowed_root=install_root,
            label="formal transaction atomic destination",
            expected="file_or_missing",
        )
        destination.parent.mkdir(parents=True, exist_ok=True)
        _fsync_directory_chain(destination.parent, stop=install_root)
        entry["state"] = "installing"
        _write_durable_json(journal_path, journal)
        _durable_replace(staged, destination)
        if _sha256(destination) != entry["stagedSha256"]:
            raise MapActionCaptureError("formal transaction 原子安装哈希不一致")
        entry["state"] = "installed"
        _write_durable_json(journal_path, journal)
    _validate_formal_destination_set(journal)
    journal["status"] = "installed_uncommitted"
    _validate_formal_transaction_journal(journal_path, journal)
    _write_durable_json(journal_path, journal)


def _recover_backup_copy_state(
    entry: Mapping[str, Any],
    *,
    destination_sha256: str | None,
    backup_root: Path,
) -> tuple[Path, str | None]:
    backup = _guard_repo_path(
        Path(str(entry["backup"])),
        allowed_root=backup_root,
        label="formal transaction recovery backup",
        expected="file_or_missing",
    )
    expected_sha256 = str(entry["oldSha256"])
    backup_sha256 = _sha256(backup) if backup.is_file() else None
    temporary_paths = _backup_temporary_paths(
        backup,
        backup_root=backup_root,
    )
    temporary_hashes = {
        temporary: _sha256(temporary)
        for temporary in temporary_paths
    }

    # Older interrupted recorders could copy directly into the final backup
    # name.  Such a partial file is distinguishable only while the original
    # formal destination still has the exact old bytes.  In that safe state it
    # is disposable; after installation began, an invalid backup remains a
    # hard failure because it may be the only copy of the old evidence.
    if backup_sha256 not in {None, expected_sha256}:
        if destination_sha256 != expected_sha256:
            raise MapActionCaptureError(
                "formal transaction recovery 备份哈希漂移且旧字节不在正式目标"
            )
        _durable_unlink(backup)
        backup_sha256 = None

    valid_temporaries = [
        temporary
        for temporary, digest in temporary_hashes.items()
        if digest == expected_sha256
    ]
    if backup_sha256 is None and valid_temporaries:
        selected = valid_temporaries[0]
        _publish_backup_temporary_no_replace(
            selected,
            backup,
            expected_sha256=expected_sha256,
        )
        backup_sha256 = expected_sha256

    # A published backup is authoritative.  Every same-name temporary is now
    # either a redundant hard link or an interrupted partial copy and is safe
    # to remove.  Without a published backup, cleanup is only safe while the
    # untouched old destination still exists.
    if temporary_paths and (
        backup_sha256 == expected_sha256
        or destination_sha256 == expected_sha256
    ):
        for temporary in temporary_paths:
            if _path_exists_or_link(temporary):
                _guard_repo_path(
                    temporary,
                    allowed_root=backup_root,
                    label="formal transaction recovery backup 临时文件",
                    expected="file",
                )
                _durable_unlink(temporary)
    elif temporary_paths:
        raise MapActionCaptureError(
            "formal transaction recovery backup 临时文件无法安全判定"
        )

    final_sha256 = _sha256(backup) if backup.is_file() else None
    if final_sha256 not in {None, expected_sha256}:
        raise MapActionCaptureError(
            "formal transaction recovery backup 原子发布后哈希漂移"
        )
    return backup, final_sha256


def _preflight_formal_transaction_recovery(
    journal: Mapping[str, Any],
) -> list[dict[str, Any]]:
    install_root = Path(str(journal["installRoot"]))
    staging_root = Path(str(journal["stagingRoot"]))
    backup_root = Path(str(journal["backupRoot"]))
    snapshots: list[dict[str, Any]] = []

    # Validate every formal destination and staged source before cleaning any
    # interrupted backup-copy artifact.  An unrelated destination drift must
    # therefore fail before recovery mutates even transaction-private files.
    for entry in journal["entries"]:
        destination = _guard_repo_path(
            Path(str(entry["destination"])),
            allowed_root=install_root,
            label="formal transaction recovery destination",
            expected="file_or_missing",
        )
        destination_sha = _sha256(destination) if destination.is_file() else None
        if entry["operation"] == "retain":
            if destination_sha != entry["stagedSha256"]:
                raise MapActionCaptureError(
                    "formal transaction recovery retain 正式字节漂移"
                )
            snapshots.append({
                "entry": entry,
                "destination": destination,
                "destinationSha256": destination_sha,
                "staged": None,
                "stagedSha256": None,
                "backup": None,
                "backupSha256": None,
            })
            continue
        staged = _guard_repo_path(
            Path(str(entry["staged"])),
            allowed_root=staging_root,
            label="formal transaction recovery staging",
            expected="file_or_missing",
        )
        staged_sha = _sha256(staged) if staged.is_file() else None
        if staged_sha not in {None, entry["stagedSha256"]}:
            raise MapActionCaptureError(
                "formal transaction recovery staging 哈希漂移"
            )
        if entry["hadOld"]:
            if destination_sha not in {
                None,
                entry["oldSha256"],
                entry["stagedSha256"],
            }:
                raise MapActionCaptureError(
                    "formal transaction recovery 遇到未知正式字节"
                )
        else:
            if destination_sha not in {None, entry["stagedSha256"]}:
                raise MapActionCaptureError(
                    "formal transaction recovery 遇到未知正式字节"
                )
            if destination_sha is None and staged_sha is None:
                raise MapActionCaptureError(
                    "formal transaction recovery 新 staged/正式字节同时缺失"
                )
        snapshots.append({
            "entry": entry,
            "destination": destination,
            "destinationSha256": destination_sha,
            "staged": staged,
            "stagedSha256": staged_sha,
            "backup": None,
            "backupSha256": None,
        })

    for snapshot in snapshots:
        entry = snapshot["entry"]
        if entry["operation"] != "install" or not entry["hadOld"]:
            continue
        backup, backup_sha = _recover_backup_copy_state(
            entry,
            destination_sha256=snapshot["destinationSha256"],
            backup_root=backup_root,
        )
        snapshot["backup"] = backup
        snapshot["backupSha256"] = backup_sha
        if (
            backup_sha is None
            and snapshot["destinationSha256"] != entry["oldSha256"]
        ):
            raise MapActionCaptureError(
                "formal transaction recovery 旧字节不可恢复"
            )
    return snapshots


def _validate_rolled_back_transaction(journal: Mapping[str, Any]) -> None:
    for snapshot in _preflight_formal_transaction_recovery(journal):
        entry = snapshot["entry"]
        if entry["operation"] == "retain":
            continue
        if entry["hadOld"]:
            if snapshot["destinationSha256"] != entry["oldSha256"]:
                raise MapActionCaptureError(
                    "formal transaction rolled_back 旧正式字节缺失"
                )
        elif (
            snapshot["destinationSha256"] is not None
            or snapshot["stagedSha256"] != entry["stagedSha256"]
        ):
            raise MapActionCaptureError(
                "formal transaction rolled_back 新目标后置条件失败"
            )


def _publish_committed_summary(
    journal_path: Path,
    journal: Mapping[str, Any] | None = None,
) -> Path:
    current = (
        dict(journal)
        if journal is not None
        else _read_json_object(journal_path, label="formal transaction journal")
    )
    context = _validate_formal_transaction_journal(journal_path, current)
    if context["status"] != "committed":
        raise MapActionCaptureError("formal transaction 尚未 committed")
    binding = current["summaryBinding"]
    pending = Path(str(binding["pendingPath"]))
    final = Path(str(binding["finalPath"]))
    pending_exists = _path_exists_or_link(pending)
    final_exists = _path_exists_or_link(final)
    if pending_exists == final_exists:
        raise MapActionCaptureError(
            "formal transaction committed summary 必须仅有 pending/final 之一"
        )
    candidate = pending if pending_exists else final
    _validate_summary_against_transaction(
        candidate,
        current,
        expected_sha256=str(binding["sha256"]),
    )
    if pending_exists:
        _durable_replace(pending, final)
        if _path_exists_or_link(pending) or not final.is_file():
            raise MapActionCaptureError(
                "formal transaction committed summary 发布后置条件失败"
            )
        _validate_summary_against_transaction(
            final,
            current,
            expected_sha256=str(binding["sha256"]),
        )
    return final


def _recover_formal_transaction(journal_path: Path) -> None:
    journal = _read_json_object(journal_path, label="formal transaction journal")
    context = _validate_formal_transaction_journal(journal_path, journal)
    if context["status"] == "committed":
        _publish_committed_summary(journal_path, journal)
        return
    if context["status"] == "rolled_back":
        _validate_rolled_back_transaction(journal)
        return
    snapshots = _preflight_formal_transaction_recovery(journal)
    install_root = context["installRoot"]
    staging_root = context["stagingRoot"]
    for snapshot in reversed(snapshots):
        entry = snapshot["entry"]
        if entry["operation"] == "retain":
            continue
        destination = snapshot["destination"]
        staged = snapshot["staged"]
        assert isinstance(staged, Path)
        if entry["hadOld"]:
            backup = snapshot["backup"]
            if snapshot["backupSha256"] == entry["oldSha256"]:
                assert isinstance(backup, Path)
                current_destination_sha = (
                    _sha256(destination) if destination.is_file() else None
                )
                if current_destination_sha not in {
                    None,
                    entry["oldSha256"],
                    entry["stagedSha256"],
                }:
                    raise MapActionCaptureError(
                        "formal transaction recovery 正式字节在回滚前漂移"
                    )
                if current_destination_sha != entry["oldSha256"]:
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    _fsync_directory_chain(destination.parent, stop=install_root)
                    _durable_replace(backup, destination)
            if not destination.is_file() or _sha256(destination) != entry["oldSha256"]:
                raise MapActionCaptureError(
                    "formal transaction recovery 旧正式字节恢复失败"
                )
        else:
            destination_exists = destination.is_file()
            staged_exists = staged.is_file()
            if destination_exists and _sha256(destination) != entry["stagedSha256"]:
                raise MapActionCaptureError(
                    "formal transaction recovery 正式字节在回滚前漂移"
                )
            if staged_exists and _sha256(staged) != entry["stagedSha256"]:
                raise MapActionCaptureError(
                    "formal transaction recovery staging 在回滚前漂移"
                )
            if destination_exists and staged_exists:
                _durable_unlink(destination)
            elif destination_exists:
                staged.parent.mkdir(parents=True, exist_ok=True)
                _fsync_directory_chain(staged.parent, stop=staging_root)
                _durable_replace(destination, staged)
            elif not staged_exists:
                raise MapActionCaptureError(
                    "formal transaction recovery 新 staged/正式字节同时缺失"
                )
            if (
                _path_exists_or_link(destination)
                or not staged.is_file()
                or _sha256(staged) != entry["stagedSha256"]
            ):
                raise MapActionCaptureError(
                    "formal transaction recovery 新目标回滚后置条件失败"
                )
        entry["state"] = "rolled_back"
    journal["status"] = "rolled_back"
    _validate_formal_transaction_journal(journal_path, journal)
    _write_durable_json(journal_path, journal)


def _commit_formal_transaction(
    journal_path: Path,
    pending_summary: Path,
) -> None:
    journal = _read_json_object(journal_path, label="formal transaction journal")
    context = _validate_formal_transaction_journal(journal_path, journal)
    if context["status"] != "installed_uncommitted":
        raise MapActionCaptureError("formal transaction 不在可提交状态")
    expected_pending = context["runRoot"] / "capture-matrix.pending.json"
    if _absolute_lexical(pending_summary) != expected_pending:
        raise MapActionCaptureError("formal transaction pending summary 路径漂移")
    _validate_summary_against_transaction(pending_summary, journal)
    entry_set = _formal_entry_set(journal)
    journal["summaryBinding"] = {
        "pendingPath": str(expected_pending),
        "finalPath": str(context["runRoot"] / "capture-matrix.json"),
        "sha256": _sha256(expected_pending),
        "bundleId": context["bundleId"],
        "result": "PASS",
        "reportType": BATCH_TRANSACTION_SUMMARY_REPORT_TYPE,
        "entrySet": entry_set,
        "entrySetSha256": _canonical_sha256(entry_set),
    }
    journal["status"] = "committed"
    _validate_formal_transaction_journal(journal_path, journal)
    _write_durable_json(journal_path, journal)


def _recover_incomplete_formal_transactions(
    run_base: Path,
    *,
    bundle_lock: tuple[Path, bytes, os.stat_result],
) -> None:
    lock_path, expected_payload, expected_identity = bundle_lock
    if _absolute_lexical(lock_path) != _absolute_lexical(
        run_base / BATCH_BUNDLE_LOCK_NAME
    ):
        raise MapActionCaptureError("formal transaction recovery 缺少 bundle lock")
    actual_payload, actual_identity = _read_bundle_lock(
        lock_path,
        bundle_id=run_base.name,
    )
    if (
        actual_payload != expected_payload
        or actual_identity.st_dev != expected_identity.st_dev
        or actual_identity.st_ino != expected_identity.st_ino
    ):
        raise MapActionCaptureError("formal transaction recovery 的 bundle lock 漂移")
    if not run_base.is_dir():
        return
    for journal_path in sorted(run_base.glob("*/formal-install-transaction.json")):
        if journal_path.is_symlink():
            raise MapActionCaptureError("formal transaction journal 不得是符号链接")
        _recover_formal_transaction(journal_path)


def _next_archive_path(action_root: Path) -> Path:
    for index in range(1, 100):
        candidate = action_root / f"failed-capture-report-{index:02d}.json"
        if not candidate.exists():
            return candidate
    raise MapActionCaptureError(
        f"失败报告归档槽位已耗尽：{_portable(action_root)}"
    )


def _archive_failed_report(report: Path, action_root: Path) -> Path:
    if report.is_symlink() or action_root.is_symlink():
        raise MapActionCaptureError("失败报告归档不得使用符号链接路径")
    action_root.mkdir(parents=True, exist_ok=True)
    destination = _next_archive_path(action_root)
    if destination.is_symlink():
        raise MapActionCaptureError("失败报告归档目标不得是符号链接")
    report.replace(destination)
    return destination


def _next_action_run(action_root: Path) -> Path:
    if action_root.is_symlink():
        raise MapActionCaptureError(
            f"动作运行目录不得是符号链接：{_portable(action_root)}"
        )
    if not action_root.exists():
        action_root.mkdir(parents=True, exist_ok=False)
        return action_root
    if not action_root.is_dir():
        raise MapActionCaptureError(
            f"动作运行根不是目录：{_portable(action_root)}"
        )
    for index in range(1, 100):
        candidate = action_root / f"resume-{index:02d}"
        if candidate.is_symlink():
            raise MapActionCaptureError(
                f"动作续跑槽位不得是符号链接：{_portable(candidate)}"
            )
        if not candidate.exists():
            candidate.mkdir(parents=False, exist_ok=False)
            return candidate
    raise MapActionCaptureError(
        f"动作续跑槽位已耗尽：{_portable(action_root)}"
    )


def _is_sha256(value: Any) -> bool:
    return (
        isinstance(value, str)
        and len(value) == 64
        and all(character in "0123456789abcdef" for character in value)
    )


def _read_batch_bound_capture_report(
    report: Path,
    *,
    screenshot: Path,
    install_screenshot: Path | None = None,
    install_report: Path | None = None,
    evidence_root: Path,
    map_id: str,
    action_kind: str,
    mode: str,
) -> dict[str, Any]:
    expected_install_screenshot = install_screenshot or screenshot
    expected_install_report = install_report or report
    _guard_repo_path(
        report,
        allowed_root=evidence_root,
        label=f"动作 capture report {map_id}/{action_kind}",
        expected="file",
    )
    capture = _read_json_object(report, label="batch-bound capture report")
    plan_sha = capture.get("batchPlanSha256")
    source_identity = capture.get("batchSourceIdentity")
    runtime_identity = capture.get("batchRuntimeIdentity")
    authorization = capture.get("qaPreviewAuthorization")
    freeze = _batch_freeze(RECORDER.EXPECTED_BUNDLE_ID)
    mismatches: list[str] = []
    if capture.get("qaPreviewFlagPresent") is not False:
        mismatches.append(
            f"qaPreviewFlagPresent={capture.get('qaPreviewFlagPresent')!r}"
        )
    if capture.get("qaPreviewMapId") != "":
        mismatches.append(f"qaPreviewMapId={capture.get('qaPreviewMapId')!r}")
    if not _is_sha256(plan_sha):
        mismatches.append(f"batchPlanSha256={plan_sha!r}")
    if source_identity != _batch_source_identity():
        mismatches.append("batchSourceIdentity")
    expected_authorization = {
        "kind": "sha256_bound_batch_plan",
        "authorized": True,
        "cliPreviewFlagPresent": False,
        "controllerActivatedCandidatePreview": True,
        "planSha256": plan_sha,
        "bundleId": RECORDER.EXPECTED_BUNDLE_ID,
        "mapId": map_id,
        "actionKind": action_kind,
        "buildIdentity": freeze["buildIdentity"],
        "bundleManifestSha256": freeze["bundleManifestIdentity"]["sha256"],
        "captureSurfaceIdentitySha256": freeze[
            "captureSurfaceIdentitySha256"
        ],
    }
    if authorization != expected_authorization:
        mismatches.append(f"qaPreviewAuthorization={authorization!r}")
    if capture.get("batchReportSealed") is not True:
        mismatches.append("batchReportSealed")
    for capture_key, freeze_key in (
        ("batchSourceIdentity", "sourceIdentity"),
        ("batchBuildIdentity", "buildIdentity"),
        ("batchBundleManifestIdentity", "bundleManifestIdentity"),
        ("batchCaptureSurfaceIdentity", "captureSurfaceIdentity"),
        (
            "batchCaptureSurfaceIdentitySha256",
            "captureSurfaceIdentitySha256",
        ),
    ):
        if capture.get(capture_key) != freeze[freeze_key]:
            mismatches.append(capture_key)
    if capture.get("screenshotPath") != _capture_path(expected_install_screenshot):
        mismatches.append(f"screenshotPath={capture.get('screenshotPath')!r}")
    if capture.get("reportInstallPath") != _capture_path(expected_install_report):
        mismatches.append(
            f"reportInstallPath={capture.get('reportInstallPath')!r}"
        )
    if not isinstance(capture.get("captureWritePath"), str) or not capture.get(
        "captureWritePath"
    ):
        mismatches.append("captureWritePath")
    if not isinstance(
        capture.get("captureReportWritePath"), str
    ) or not capture.get("captureReportWritePath"):
        mismatches.append("captureReportWritePath")
    screenshot_record = capture.get("screenshot")
    if (
        not isinstance(screenshot_record, dict)
        or screenshot_record.get("path") != _capture_path(
            expected_install_screenshot
        )
    ):
        mismatches.append("screenshot.path")
    if not isinstance(runtime_identity, dict):
        mismatches.append("batchRuntimeIdentity")
    else:
        for key, expected in {
            "displayServerWindowCount": 1,
            "audioDriver": "Dummy",
            "mainSceneLoadCount": 1,
            "mainSceneInstanceCount": 1,
            "viewport": [1280, 720],
        }.items():
            if runtime_identity.get(key) != expected:
                mismatches.append(
                    f"batchRuntimeIdentity.{key}="
                    f"{runtime_identity.get(key)!r}"
                )
        process_id = runtime_identity.get("processId")
        if type(process_id) is not int or process_id <= 0:
            mismatches.append(
                f"batchRuntimeIdentity.processId={process_id!r}"
            )
        root_window_id = runtime_identity.get("rootWindowId")
        if (
            type(root_window_id) is not int
            or runtime_identity.get("displayServerWindowIds")
            != [root_window_id]
        ):
            mismatches.append("batchRuntimeIdentity.rootWindowId")
        if not _window_identity_pair_valid(
            capture.get("batchWindowIdentity"),
            root_window_id,
        ):
            mismatches.append("batchWindowIdentity")
    if mismatches:
        raise MapActionCaptureError(
            "动作 capture 的 batch 授权/身份合同失败（"
            f"{map_id}/{action_kind}）：" + "; ".join(mismatches)
        )

    # Reuse the complete established visual/gameplay validator through a
    # short-lived compatibility view.  Only its two legacy CLI-preview facts
    # are adapted; the persisted report above remains truthful and immutable.
    compatibility = dict(capture)
    compatibility["qaPreviewFlagPresent"] = True
    compatibility["qaPreviewMapId"] = map_id
    compatibility_path = report.parent / (
        f".{report.name}.{uuid.uuid4().hex}.legacy-validation.json"
    )
    _guard_repo_path(
        compatibility_path,
        allowed_root=report.parent,
        anchor=report.parent,
        label="capture 兼容验证临时文件",
        expected="missing",
    )
    try:
        with compatibility_path.open("x", encoding="utf-8") as target:
            json.dump(compatibility, target, ensure_ascii=False)
            target.write("\n")
        RECORDER._read_capture_report(
            compatibility_path,
            map_id=map_id,
            mode=mode,
            capture_variant=action_kind,
        )
    finally:
        if compatibility_path.is_symlink():
            raise MapActionCaptureError(
                "capture 兼容验证临时文件被替换为符号链接"
            )
        compatibility_path.unlink(missing_ok=True)
    return capture


def _capture_pair(
    screenshot: Path,
    report: Path,
    *,
    evidence_root: Path,
    install_screenshot: Path | None = None,
    install_report: Path | None = None,
    map_id: str,
    action_kind: str,
    mode: str,
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any], dict[str, Any]]:
    _guard_repo_path(
        screenshot,
        allowed_root=evidence_root,
        label=f"动作截图 {map_id}/{action_kind}",
        expected="file",
    )
    capture = _read_batch_bound_capture_report(
        report,
        screenshot=screenshot,
        install_screenshot=install_screenshot,
        install_report=install_report,
        evidence_root=evidence_root,
        map_id=map_id,
        action_kind=action_kind,
        mode=mode,
    )
    screenshot_artifact = CORE._artifact_record(screenshot)
    report_artifact = CORE._artifact_record(report)
    screenshot_hash = str(screenshot_artifact.get("sha256", ""))
    screenshot_record = capture.get("screenshot")
    if (
        capture.get("screenshotSha256") != screenshot_hash
        or not isinstance(screenshot_record, dict)
        or screenshot_record.get("sha256") != screenshot_hash
        or screenshot_record.get("width") != 1280
        or screenshot_record.get("height") != 720
    ):
        raise MapActionCaptureError(
            "动作截图与 capture 报告哈希/尺寸不一致："
            f"{map_id}/{action_kind}"
        )
    try:
        hud_glyph_stability = RECORDER.HUD_GLYPH.analyze_image(
            screenshot,
            label=f"runtime-action:{map_id}:{action_kind}",
        )
    except RECORDER.HUD_GLYPH.HudGlyphAuditError as error:
        raise MapActionCaptureError(
            f"动作截图 HUD 字形不完整：{map_id}/{action_kind}: {error}"
        ) from error
    return capture, screenshot_artifact, report_artifact, hud_glyph_stability


def _batch_payload_from_log(path: Path) -> dict[str, Any]:
    text = path.read_text(encoding="utf-8", errors="replace")
    payload_texts = [
        line[len(BATCH_LOG_PREFIX):]
        for line in text.splitlines()
        if line.startswith(BATCH_LOG_PREFIX)
    ]
    if len(payload_texts) != 1:
        raise MapActionCaptureError(
            "动作 batch provenance 必须只有一个最终回执"
        )
    try:
        payload = json.loads(payload_texts[0])
    except json.JSONDecodeError as error:
        raise MapActionCaptureError("动作 batch provenance 无法解析") from error
    if not isinstance(payload, dict):
        raise MapActionCaptureError("动作 batch provenance 根节点必须是对象")
    return payload


def _validate_action_run_binding(
    action_run: Path,
    *,
    map_id: str,
    action_kind: str,
    screenshot: Path,
    report: Path,
    install_screenshot: Path | None = None,
    install_report: Path | None = None,
    capture: Mapping[str, Any],
) -> dict[str, Any]:
    expected_install_screenshot = _absolute_lexical(
        install_screenshot or screenshot
    )
    expected_install_report = _absolute_lexical(install_report or report)
    plan_path = action_run / "single-window-action-plan.json"
    log_path = action_run / "godot.log"
    _guard_repo_path(
        plan_path,
        allowed_root=action_run,
        label="动作 batch plan provenance",
        expected="file",
    )
    _guard_repo_path(
        log_path,
        allowed_root=action_run,
        label="动作 batch log provenance",
        expected="file",
    )
    plan = _read_json_object(plan_path, label="动作 batch plan provenance")
    receipt = _batch_payload_from_log(log_path)
    plan_sha = _sha256(plan_path)
    freeze = _batch_freeze(RECORDER.EXPECTED_BUNDLE_ID)
    source_identity = freeze["sourceIdentity"]
    if (
        plan.get("reportType") != BATCH_REPORT_TYPE
        or plan.get("bundleId") != RECORDER.EXPECTED_BUNDLE_ID
        or plan.get("lifecycle") != PENDING_LIFECYCLE
        or plan.get("launchContract") != LAUNCH_CONTRACT
        or receipt.get("scene") != "res://scenes/Main.tscn"
        or receipt.get("bundleId") != RECORDER.EXPECTED_BUNDLE_ID
        or receipt.get("planSha256") != plan_sha
        or capture.get("batchPlanSha256") != plan_sha
        or plan.get("sourceIdentity") != source_identity
        or receipt.get("sourceIdentity") != source_identity
        or capture.get("batchSourceIdentity") != source_identity
        or receipt.get("runtimeIdentity")
        != capture.get("batchRuntimeIdentity")
        or any(
            plan.get(key) != freeze[key]
            or receipt.get(key) != freeze[key]
            for key in (
                "buildIdentity",
                "bundleManifestIdentity",
                "captureSurfaceIdentity",
                "captureSurfaceIdentitySha256",
            )
        )
        or capture.get("batchBuildIdentity") != freeze["buildIdentity"]
        or capture.get("batchBundleManifestIdentity")
        != freeze["bundleManifestIdentity"]
        or capture.get("batchCaptureSurfaceIdentity")
        != freeze["captureSurfaceIdentity"]
        or capture.get("batchCaptureSurfaceIdentitySha256")
        != freeze["captureSurfaceIdentitySha256"]
    ):
        raise MapActionCaptureError(
            f"动作 batch plan/source/runtime identity 不一致："
            f"{map_id}/{action_kind}"
        )

    plan_actions = [
        action
        for action in plan.get("actions", [])
        if isinstance(action, dict)
        and action.get("mapId") == map_id
        and action.get("actionKind") == action_kind
    ]
    receipt_actions = [
        action
        for action in receipt.get("actions", [])
        if isinstance(action, dict)
        and action.get("mapId") == map_id
        and action.get("actionKind") == action_kind
    ]
    if len(plan_actions) != 1 or len(receipt_actions) != 1:
        raise MapActionCaptureError(
            f"动作不属于该 batch 的唯一计划/回执：{map_id}/{action_kind}"
        )
    planned = plan_actions[0]
    recorded = receipt_actions[0]
    expected_write_screenshot = _absolute_lexical(
        Path(str(planned.get("outputPath", "")))
    )
    expected_write_report = _absolute_lexical(
        Path(str(planned.get("reportPath", "")))
    )
    if (
        _absolute_lexical(
            Path(str(planned.get("installOutputPath", "")))
        )
        != expected_install_screenshot
        or _absolute_lexical(
            Path(str(planned.get("installReportPath", "")))
        )
        != expected_install_report
        or capture.get("captureWritePath")
        != _capture_path(expected_write_screenshot)
        or capture.get("captureReportWritePath")
        != _capture_path(expected_write_report)
        or recorded.get("result") != "PASS"
        or recorded.get("screenshotSha256") != _sha256(screenshot)
        or recorded.get("captureReportSha256") != _sha256(report)
    ):
        raise MapActionCaptureError(
            f"动作 batch 输出/哈希绑定不一致：{map_id}/{action_kind}"
        )
    return {
        "planSha256": plan_sha,
        "sourceIdentity": source_identity,
        "runtimeIdentity": receipt.get("runtimeIdentity", {}),
        "buildIdentity": freeze["buildIdentity"],
        "windowIdentity": recorded.get("windowIdentity", {}),
        "batchResult": receipt.get("result"),
        "actionReceipt": recorded,
    }


def _find_successful_action_run(
    action_root: Path,
    *,
    map_id: str,
    action_kind: str,
    screenshot: Path,
    report: Path,
) -> Path:
    if action_root.is_symlink():
        raise MapActionCaptureError("动作 provenance 根不得是符号链接")
    run_root = action_root.parent.parent
    batch_root = run_root / "single-window-batch"
    candidates: list[Path] = []
    if batch_root.is_symlink():
        raise MapActionCaptureError("single-window-batch provenance 不得是符号链接")
    if batch_root.is_dir():
        candidates.extend(
            sorted(
                (
                    path
                    for path in batch_root.glob("resume-*")
                    if path.is_dir()
                ),
                reverse=True,
            )
        )
        candidates.append(batch_root)
    capture = _read_json_object(report, label="复用动作 capture report")
    for candidate in candidates:
        if candidate.is_symlink():
            continue
        log_path = candidate / "godot.log"
        plan_path = candidate / "single-window-action-plan.json"
        lifecycle_path = candidate / "qa-lane-lifecycle.json"
        if (
            not log_path.is_file()
            or not plan_path.is_file()
            or not lifecycle_path.is_file()
        ):
            continue
        try:
            RECORDER._validate_godot_log(log_path, movie_mode=False)
            plan = _read_json_object(
                plan_path,
                label="复用动作 batch plan",
            )
            planned_actions = plan.get("actions")
            if not isinstance(planned_actions, list) or not planned_actions:
                raise MapActionCaptureError("复用动作 batch plan 没有精确动作集")
            _batch_receipt_from_log(
                log_path,
                expected_action_count=len(planned_actions),
                expected_plan_sha256=_sha256(plan_path),
                expected_bundle_id=RECORDER.EXPECTED_BUNDLE_ID,
            )
            lifecycle = _read_json_object(
                lifecycle_path,
                label="QA lane lifecycle",
            )
            _validate_reusable_qa_lane_lifecycle(lifecycle)
            _validate_action_run_binding(
                candidate,
                map_id=map_id,
                action_kind=action_kind,
                screenshot=screenshot,
                report=report,
                capture=capture,
            )
        except (MapActionCaptureError, RECORDER.FirebudV2RecordingError):
            continue
        return candidate
    raise MapActionCaptureError(
        f"找不到与既有 PASS 动作对应的完整 QA lane：{_portable(action_root)}"
    )


def _validate_reusable_qa_lane_lifecycle(lifecycle: Mapping[str, Any]) -> None:
    phases = lifecycle.get("phases")
    native = phases.get("native") if isinstance(phases, dict) else None
    attestation = native.get("attestation") if isinstance(native, dict) else None
    native_process = native.get("process") if isinstance(native, dict) else None
    native_verify = native.get("postVerify") if isinstance(native, dict) else None
    cleanup = lifecycle.get("cleanup")
    post_cleanup = lifecycle.get("postCleanupInspect")
    real_sha = lifecycle.get("realBeforeSha256")
    expected_attestation = {
        "customUserDirName": CORE.QA_LANE_CUSTOM_USER_DIR_NAME,
        "feature": CORE.QA_LANE_FEATURE,
        "lane": CORE.QA_LANE,
        "status": "passed",
        "userDataRoot": lifecycle.get("laneRoot"),
    }
    if (
        lifecycle.get("sourceCheck") != {"status": "source_contract_passed"}
        or lifecycle.get("status") != "cleaned_before_media"
        or lifecycle.get("lane") != CORE.QA_LANE
        or lifecycle.get("feature") != CORE.QA_LANE_FEATURE
        or lifecycle.get("customUserDirName")
        != CORE.QA_LANE_CUSTOM_USER_DIR_NAME
        or lifecycle.get("qaLanePreserved") is not False
        or lifecycle.get("lanePreservationReason") is not None
        or not _is_sha256(real_sha)
        or attestation != expected_attestation
        or not isinstance(native_process, dict)
        or native_process.get("exitCode") != 0
        or native_process.get("leaderReaped") is not True
        or native_process.get("processGroupClosed") is not True
        or native_process.get("processGroupResidualObserved") is not False
        or not isinstance(native_verify, dict)
        or native_verify.get("status") != "verified"
        or native_verify.get("realUnchanged") is not True
        or native_verify.get("realInventorySha256") != real_sha
        or not isinstance(cleanup, dict)
        or cleanup.get("status") != "cleaned"
        or cleanup.get("realUnchanged") is not True
        or cleanup.get("laneAbsent") is not True
        or cleanup.get("realInventorySha256") != real_sha
        or not isinstance(post_cleanup, dict)
        or post_cleanup.get("status") != "inspected"
        or post_cleanup.get("laneRootState") != "absent"
        or post_cleanup.get("publishedLockState") != "absent"
        or post_cleanup.get("pendingLockState") != "absent"
        or post_cleanup.get("realInventorySha256") != real_sha
    ):
        raise MapActionCaptureError(
            "复用动作的官方 QA lane source/attestation/cleanup 合同不完整"
        )


def _qa_lane_record(action_run: Path) -> dict[str, Any]:
    lifecycle_path = action_run / "qa-lane-lifecycle.json"
    lifecycle = _read_json_object(lifecycle_path, label="QA lane lifecycle")
    phases = lifecycle.get("phases", {})
    native = phases.get("native", {}) if isinstance(phases, dict) else {}
    return {
        "sourceCheck": lifecycle.get("sourceCheck", {}),
        "nativeAttestation": (
            native.get("attestation", {}) if isinstance(native, dict) else {}
        ),
        "nativeProcess": (
            native.get("process", {}) if isinstance(native, dict) else {}
        ),
        "cleanup": lifecycle.get("cleanup", {}),
        "postCleanupInspect": lifecycle.get("postCleanupInspect", {}),
        "lifecycle": CORE._artifact_record(lifecycle_path),
    }


def _derive_window_evidence(
    receipt: Mapping[str, Any],
    qa_lane: Mapping[str, Any],
    *,
    native_invocation_count: int,
) -> dict[str, Any]:
    runtime = receipt.get("runtimeIdentity")
    cleanup = qa_lane.get("cleanup")
    post_cleanup = qa_lane.get("postCleanupInspect")
    native_process = qa_lane.get("nativeProcess")
    if (
        native_invocation_count != 1
        or not isinstance(runtime, dict)
        or runtime.get("displayServerWindowCount") != 1
        or type(runtime.get("processId")) is not int
        or int(runtime.get("processId", 0)) <= 0
        or not isinstance(cleanup, dict)
        or cleanup.get("status") != "cleaned"
        or not isinstance(post_cleanup, dict)
        or post_cleanup.get("status") != "inspected"
        or not isinstance(native_process, dict)
        or native_process.get("exitCode") != 0
        or native_process.get("leaderReaped") is not True
        or native_process.get("processGroupClosed") is not True
        or native_process.get("processGroupResidualObserved") is not False
    ):
        raise MapActionCaptureError(
            "单窗口计数无法由 process/runtime/lane cleanup 实证推出"
        )
    return {
        "godotProcessCount": native_invocation_count,
        "userVisibleWindowOpenCount": int(
            runtime["displayServerWindowCount"]
        ),
        "userVisibleWindowCloseCount": 1,
        "singlePersistentWindow": True,
        "processId": runtime["processId"],
        "displayServerWindowCountDuringCapture": runtime[
            "displayServerWindowCount"
        ],
        "processReturnedBeforeLaneCleanup": True,
        "laneCleanupStatus": cleanup["status"],
        "postCleanupInspectStatus": post_cleanup["status"],
        "processExitCode": native_process["exitCode"],
        "leaderReaped": native_process["leaderReaped"],
        "processGroupClosed": native_process["processGroupClosed"],
        "processGroupResidualObserved": native_process[
            "processGroupResidualObserved"
        ],
        "derivation": (
            "one native invocation + one runtime DisplayServer window + "
            "returned process + cleaned/inspected QA lane"
        ),
    }


def _aggregate_window_evidence(
    records: Sequence[Mapping[str, Any]],
) -> dict[str, Any]:
    batches: dict[tuple[str, int, int], dict[str, Any]] = {}
    for record in records:
        binding = record.get("batchBinding")
        qa_lane = record.get("qaLane")
        if not isinstance(binding, Mapping) or not isinstance(qa_lane, Mapping):
            raise MapActionCaptureError("动作记录缺少 batch/lane 窗口证明")
        runtime = binding.get("runtimeIdentity")
        if not isinstance(runtime, Mapping):
            raise MapActionCaptureError("动作记录缺少 runtime identity")
        plan_sha = binding.get("planSha256")
        process_id = runtime.get("processId")
        root_window_id = runtime.get("rootWindowId")
        if (
            not _is_sha256(plan_sha)
            or type(process_id) is not int
            or type(root_window_id) is not int
            or not _window_identity_pair_valid(
                binding.get("windowIdentity"), root_window_id
            )
        ):
            raise MapActionCaptureError("动作记录 batch window identity 无效")
        key = (str(plan_sha), process_id, root_window_id)
        evidence = _derive_window_evidence(
            {"runtimeIdentity": dict(runtime)},
            qa_lane,
            native_invocation_count=1,
        )
        previous = batches.get(key)
        if previous is not None:
            previous_evidence = {
                item_key: item_value
                for item_key, item_value in previous.items()
                if item_key != "actionCount"
            }
            if previous_evidence != evidence:
                raise MapActionCaptureError("同一 batch 的 lane/window lifecycle 不一致")
            previous["actionCount"] = int(previous["actionCount"]) + 1
        else:
            batches[key] = {**evidence, "actionCount": 1}
    if not batches:
        raise MapActionCaptureError("动作矩阵没有 batch window 证明")
    return {
        "godotProcessCount": len(batches),
        "userVisibleWindowOpenCount": len(batches),
        "userVisibleWindowCloseCount": len(batches),
        "singlePersistentWindow": len(batches) == 1,
        "batchCount": len(batches),
        "batches": [
            {
                "planSha256": key[0],
                "processId": key[1],
                "rootWindowId": key[2],
                **evidence,
            }
            for key, evidence in sorted(batches.items())
        ],
        "derivation": (
            "unique planSha/processId/rootWindowId batches with exact "
            "runtime window and process-group/lane cleanup evidence"
        ),
    }


def _record_entry(
    *,
    map_id: str,
    action_kind: str,
    mode: str,
    screenshot: Path,
    report: Path,
    evidence_root: Path,
    action_run: Path,
    resumed: bool,
    archived_failed_report: Path | None = None,
) -> dict[str, Any]:
    (
        capture,
        screenshot_artifact,
        report_artifact,
        hud_glyph_stability,
    ) = _capture_pair(
        screenshot,
        report,
        evidence_root=evidence_root,
        map_id=map_id,
        action_kind=action_kind,
        mode=mode,
    )
    batch_binding = _validate_action_run_binding(
        action_run,
        map_id=map_id,
        action_kind=action_kind,
        screenshot=screenshot,
        report=report,
        capture=capture,
    )
    record: dict[str, Any] = {
        "mapId": map_id,
        "actionKind": action_kind,
        "mode": mode,
        "captureVariant": action_kind,
        "resumed": resumed,
        "screenshot": screenshot_artifact,
        "captureReport": report_artifact,
        "captureResult": capture.get("result"),
        "targetClearance": capture.get("targetClearance", ""),
        "hudGlyphStability": hud_glyph_stability,
        "qaLane": _qa_lane_record(action_run),
        "godotLog": CORE._artifact_record(action_run / "godot.log"),
        "batchBinding": batch_binding,
    }
    if archived_failed_report is not None:
        record["archivedFailedCaptureReport"] = CORE._artifact_record(
            archived_failed_report
        )
    return record


def _record(args: argparse.Namespace) -> Path:
    bundle_id = str(args.bundle_id)
    RECORDER._activate_bundle(bundle_id)
    run_base = _absolute_lexical(
        REPO_ROOT / DEFAULT_RUN_ROOT / bundle_id
    )
    _guard_repo_path(
        run_base,
        allowed_root=REPO_ROOT / DEFAULT_RUN_ROOT,
        label="动作取证 bundle 运行根",
        expected="dir_or_missing",
    )
    run_base.mkdir(parents=True, exist_ok=True)
    _fsync_directory(run_base.parent)
    _guard_repo_path(
        run_base,
        allowed_root=REPO_ROOT / DEFAULT_RUN_ROOT,
        label="已创建动作取证 bundle 运行根",
        expected="dir",
    )
    with _bundle_recorder_lock(run_base, bundle_id=bundle_id) as bundle_lock:
        return _record_under_bundle_lock(args, bundle_lock=bundle_lock)


def _record_under_bundle_lock(
    args: argparse.Namespace,
    *,
    bundle_lock: tuple[Path, bytes, os.stat_result],
) -> Path:
    timeout_seconds = float(args.timeout_seconds)
    if not math.isfinite(timeout_seconds) or timeout_seconds <= 0:
        raise MapActionCaptureError("--timeout-seconds 必须大于 0")
    run_id = str(args.run_id).strip() or _default_run_id()
    if not RECORDER.SAFE_RUN_ID.fullmatch(run_id):
        raise MapActionCaptureError("--run-id 含不安全字符")

    resume = bool(args.resume)
    replace_pending = bool(args.replace_pending_evidence)
    scratch_only = bool(args.scratch_only)
    if resume and replace_pending:
        raise MapActionCaptureError(
            "--resume 与 --replace-pending-evidence 不能同用"
        )
    if scratch_only and (resume or replace_pending):
        raise MapActionCaptureError(
            "--scratch-only 不能与 --resume 或 --replace-pending-evidence 同用"
        )
    RECORDER._activate_bundle(str(args.bundle_id))
    godot = CORE._require_executable(str(args.godot), label="Godot")
    run_base = _absolute_lexical(
        REPO_ROOT / DEFAULT_RUN_ROOT / args.bundle_id
    )
    _guard_repo_path(
        run_base,
        allowed_root=REPO_ROOT / DEFAULT_RUN_ROOT,
        label="动作取证 bundle 运行根",
        expected="dir_or_missing",
    )
    _recover_incomplete_formal_transactions(
        run_base,
        bundle_lock=bundle_lock,
    )
    run_root = _absolute_lexical(run_base / run_id)
    _guard_repo_path(
        run_root,
        allowed_root=run_base,
        label="动作取证 runId 根",
        expected="dir" if resume else "missing",
    )
    if resume:
        superseded_root = run_root / "superseded"
        if _path_exists_or_link(superseded_root):
            if superseded_root.is_symlink():
                raise MapActionCaptureError(
                    "替换 pending 证据归档根不得是符号链接"
                )
            raise MapActionCaptureError(
                "替换 pending 证据的失败 run 已回滚旧字节，不能用 --resume "
                "把旧动作对误记为新批次；请使用新 runId 重新替换"
            )
        summary_candidate = run_root / "capture-matrix.json"
        if summary_candidate.is_symlink():
            raise MapActionCaptureError("capture matrix 不得是符号链接")
        if summary_candidate.exists():
            raise MapActionCaptureError("已完成的 capture matrix 不允许续跑")
        temporary_dir = run_root / f"tmp-resume-{uuid.uuid4().hex[:8]}"
        _guard_repo_path(
            temporary_dir,
            allowed_root=run_root,
            label="续跑临时目录",
            expected="missing",
        )
        temporary_dir.mkdir(parents=False, exist_ok=False)
        _fsync_directory(run_root)
    else:
        run_root.mkdir(parents=True, exist_ok=False)
        _fsync_directory(run_base)
        _guard_repo_path(
            run_root,
            allowed_root=run_base,
            label="已创建动作取证 runId 根",
            expected="dir",
        )
        temporary_dir = run_root / "tmp"
        _guard_repo_path(
            temporary_dir,
            allowed_root=run_root,
            label="动作取证临时目录",
            expected="missing",
        )
        temporary_dir.mkdir(parents=False, exist_ok=False)
        _fsync_directory(run_root)
    _guard_repo_path(
        temporary_dir,
        allowed_root=run_root,
        label="已创建动作取证临时目录",
        expected="dir",
    )
    base_environment = CORE._isolated_environment(temporary_dir)

    bundle_root = _absolute_lexical(
        REPO_ROOT / "client" / "godot" / "assets" / "maps" / args.bundle_id
    )
    _guard_repo_path(
        bundle_root,
        allowed_root=REPO_ROOT / "client" / "godot" / "assets" / "maps",
        label="地图 bundle 根",
        expected="dir",
    )
    manifest_path = bundle_root / "map-visual-bundle.json"
    _guard_repo_path(
        manifest_path,
        allowed_root=bundle_root,
        label="地图 bundle manifest",
        expected="file",
    )
    if not scratch_only:
        _validate_pending_replacement(manifest_path, str(args.bundle_id))
    install_root = _absolute_lexical(
        run_root / "scratch-actions"
        if scratch_only
        else bundle_root / "evidence" / "runtime-actions"
    )
    _guard_repo_path(
        install_root,
        allowed_root=run_root if scratch_only else bundle_root,
        label="动作证据安装根",
        expected="dir_or_missing",
    )
    install_root.mkdir(parents=True, exist_ok=True)
    _guard_repo_path(
        install_root,
        allowed_root=run_root if scratch_only else bundle_root,
        label="已创建动作证据安装根",
        expected="dir",
    )

    targets: list[tuple[str, str, str, Path, Path, str]] = []
    for map_id in RECORDER.REVIEW_MAPS:
        for action_kind in ACTION_KINDS:
            mode = ACTION_MODES[action_kind]
            map_output = install_root / map_id
            screenshot = map_output / f"{action_kind}.png"
            report = map_output / f"{action_kind}-capture.json"
            for path, label in (
                (screenshot, "动作截图目标"),
                (report, "动作报告目标"),
            ):
                _guard_repo_path(
                    path,
                    allowed_root=install_root,
                    label=f"{label} {map_id}/{action_kind}",
                    expected="file_or_missing",
                )
            target_state = (
                "record"
                if scratch_only
                else _target_state(
                    screenshot,
                    report,
                    resume=resume,
                    replace_pending=replace_pending,
                )
            )
            targets.append(
                (map_id, action_kind, mode, screenshot, report, target_state)
            )

    # Resolve every reused pair before opening a window. This rejects legacy or
    # unrelated PASS pairs without wasting a new batch run, and ensures resume
    # can only reuse source/runtime/plan-bound evidence from this exact runId.
    reused_action_runs: dict[tuple[str, str], Path] = {}
    for map_id, action_kind, _mode, screenshot, report, target_state in targets:
        if target_state != "reuse":
            continue
        try:
            reused_action_runs[(map_id, action_kind)] = (
                _find_successful_action_run(
                    run_root / map_id / action_kind,
                    map_id=map_id,
                    action_kind=action_kind,
                    screenshot=screenshot,
                    report=report,
                )
            )
        except MapActionCaptureError as error:
            raise MapActionCaptureError(
                "--resume 只能复用同一 runId 中已经由 SHA-bound "
                "single-window batch 生成的 PASS 动作对；旧式或无关证据"
                "请改用新 runId + --replace-pending-evidence 整组重录"
            ) from error

    backups: list[tuple[Path, Path]] = []

    records: list[dict[str, Any]] = []
    installed_moves: list[tuple[Path, Path]] = []
    transaction_staging_root: Path | None = None
    formal_transaction_path: Path | None = None
    formal_transaction: dict[str, Any] | None = None
    try:
        archived_failed_reports: dict[tuple[str, str], Path] = {}
        record_targets = [
            target for target in targets if target[5] != "reuse"
        ]
        for (
            map_id,
            action_kind,
            _mode,
            screenshot,
            report,
            target_state,
        ) in record_targets:
            action_root = run_root / map_id / action_kind
            _guard_repo_path(
                action_root,
                allowed_root=run_root,
                label=f"动作运行 provenance 根 {map_id}/{action_kind}",
                expected="dir_or_missing",
            )
            if target_state == "archive_failed_report":
                archived_failed_reports[(map_id, action_kind)] = (
                    _archive_failed_report(report, action_root)
                )

        batch_run: Path | None = None
        batch_plan_path: Path | None = None
        batch_plan_sha256 = ""
        batch_receipt: dict[str, Any] = {}
        batch_window_evidence: dict[str, Any] = {}
        if record_targets:
            batch_run = _next_action_run(run_root / "single-window-batch")
            _guard_repo_path(
                batch_run,
                allowed_root=run_root,
                label="single-window batch 运行目录",
                expected="dir",
            )
            install_targets = {
                (map_id, action_kind): (screenshot, report)
                for (
                    map_id,
                    action_kind,
                    _mode,
                    screenshot,
                    report,
                    _target_state_value,
                ) in record_targets
            }
            if scratch_only:
                batch_targets = record_targets
                batch_output_root = install_root
                output_mode = "scratch"
            else:
                batch_output_root = batch_run / "staged-actions"
                transaction_staging_root = batch_output_root
                _guard_repo_path(
                    batch_output_root,
                    allowed_root=batch_run,
                    label="formal 动作 staging 根",
                    expected="dir_or_missing",
                )
                batch_targets = [
                    (
                        map_id,
                        action_kind,
                        mode,
                        batch_output_root / map_id / f"{action_kind}.png",
                        batch_output_root
                        / map_id
                        / f"{action_kind}-capture.json",
                        target_state,
                    )
                    for (
                        map_id,
                        action_kind,
                        mode,
                        _screenshot,
                        _report,
                        target_state,
                    ) in record_targets
                ]
                output_mode = "formal_staging"
            (
                batch_plan_path,
                batch_plan_sha256,
                _batch_plan_payload,
            ) = _write_batch_plan(
                batch_run,
                bundle_id=str(args.bundle_id),
                targets=batch_targets,
                output_mode=output_mode,
                install_targets=install_targets,
            )
            command = _build_batch_godot_command(godot=godot)
            batch_environment = _batch_environment(
                base_environment,
                plan_path=batch_plan_path,
                plan_sha256=batch_plan_sha256,
            )
            log_path = batch_run / "godot.log"
            expected_action_count = len(record_targets)

            def validate_batch_log(path: Path) -> dict[str, Any]:
                return _batch_receipt_from_log(
                    path,
                    expected_action_count=expected_action_count,
                    expected_plan_sha256=batch_plan_sha256,
                    expected_bundle_id=str(args.bundle_id),
                )

            batch_timeout_seconds = min(
                600.0,
                max(
                    timeout_seconds * 2.0,
                    timeout_seconds + expected_action_count * 5.0,
                ),
            )

            CORE._run_official_lane_godot_sequence(
                run_dir=batch_run,
                godot=godot,
                base_environment=batch_environment,
                native_command=command,
                native_log=log_path,
                timeout_seconds=batch_timeout_seconds,
                native_log_validator=validate_batch_log,
                dependencies={
                    "godot_runner": _batch_progress_godot_runner(
                        bundle_id=str(args.bundle_id),
                        plan_sha256=batch_plan_sha256,
                        action_count=expected_action_count,
                        no_progress_timeout=timeout_seconds,
                    ),
                },
            )
            batch_receipt = validate_batch_log(log_path)
            batch_qa_lane = _qa_lane_record(batch_run)
            batch_window_evidence = _derive_window_evidence(
                batch_receipt,
                batch_qa_lane,
                native_invocation_count=1,
            )

            # Validate every sealed staging pair and its exact batch receipt
            # before one byte can move into the canonical formal evidence root.
            for (
                map_id,
                action_kind,
                mode,
                staged_screenshot,
                staged_report,
                _target_state_value,
            ) in batch_targets:
                install_screenshot, install_report = install_targets[
                    (map_id, action_kind)
                ]
                capture, _shot, _report, _glyph = _capture_pair(
                    staged_screenshot,
                    staged_report,
                    evidence_root=batch_output_root,
                    install_screenshot=install_screenshot,
                    install_report=install_report,
                    map_id=map_id,
                    action_kind=action_kind,
                    mode=mode,
                )
                _validate_action_run_binding(
                    batch_run,
                    map_id=map_id,
                    action_kind=action_kind,
                    screenshot=staged_screenshot,
                    report=staged_report,
                    install_screenshot=install_screenshot,
                    install_report=install_report,
                    capture=capture,
                )
            staged_screenshot_paths = {
                (map_id, action_kind): staged_screenshot
                for (
                    map_id,
                    action_kind,
                    _mode,
                    staged_screenshot,
                    _staged_report,
                    _target_state_value,
                ) in batch_targets
            }
            _validate_final_action_png_uniqueness(
                targets,
                map_ids=RECORDER.REVIEW_MAPS,
                staged_action_paths=staged_screenshot_paths,
            )
            if not scratch_only:
                # Keep the complete old formal set installed throughout the
                # expensive capture/validation phase. Only after all 20 staged
                # pairs and their shared receipt pass do we open the narrow
                # backup/install transaction window.
                _validate_preinstall_freeze(
                    manifest_path,
                    bundle_id=str(args.bundle_id),
                    plan=_batch_plan_payload,
                    receipt=batch_receipt,
                )
                formal_transaction_path = (
                    run_root / "formal-install-transaction.json"
                )
                (
                    formal_transaction_path,
                    formal_transaction,
                    backups,
                ) = _begin_formal_transaction(
                    bundle_id=str(args.bundle_id),
                    run_root=run_root,
                    staging_root=batch_output_root,
                    install_root=install_root,
                    staged_targets=batch_targets,
                    install_targets=install_targets,
                    formal_targets=targets,
                )
                _install_formal_transaction(
                    formal_transaction_path,
                    formal_transaction,
                )
        else:
            # A fully resumed run still has to prove the final 4x5 matrix is
            # byte-distinct per map; no new staging branch exists to do it.
            _validate_final_action_png_uniqueness(
                targets,
                map_ids=RECORDER.REVIEW_MAPS,
            )

        for map_id, action_kind, mode, screenshot, report, target_state in targets:
            action_root = run_root / map_id / action_kind
            if target_state == "reuse":
                action_run = reused_action_runs[(map_id, action_kind)]
            else:
                if batch_run is None:
                    raise MapActionCaptureError(
                        "批量动作运行目录没有为待录动作建立"
                    )
                action_run = batch_run
            record = _record_entry(
                map_id=map_id,
                action_kind=action_kind,
                mode=mode,
                screenshot=screenshot,
                report=report,
                evidence_root=install_root,
                action_run=action_run,
                resumed=resume or target_state == "reuse",
                archived_failed_report=archived_failed_reports.get(
                    (map_id, action_kind)
                ),
            )
            if target_state != "reuse":
                record["singleWindowBatch"] = {
                    "planSha256": batch_plan_sha256,
                    **batch_window_evidence,
                    "sourceIdentity": batch_receipt.get(
                        "sourceIdentity", {}
                    ),
                }
            records.append(record)

        aggregate_window_evidence = _aggregate_window_evidence(records)
        board_path = run_root / "runtime-action-hud-glyph-board.png"
        _guard_repo_path(
            board_path,
            allowed_root=run_root,
            label="动作 HUD 审片板",
            expected="missing",
        )
        try:
            board = RECORDER.HUD_GLYPH.build_task_hud_board(
                [
                    {
                        "label": f"{record['mapId']} {record['actionKind']}",
                        "source": REPO_ROOT / record["screenshot"]["path"],
                    }
                    for record in records
                ],
                board_path,
            )
        except RECORDER.HUD_GLYPH.HudGlyphAuditError as error:
            raise MapActionCaptureError(
                f"动作 HUD 单图审片板生成失败：{error}"
            ) from error
        summary = {
            "schemaVersion": 1,
            "reportType": "beastbound_map_visual_action_capture_matrix",
            "generatedAtUtc": _utc_now(),
            "result": "PASS",
            "bundleId": args.bundle_id,
            "maps": list(RECORDER.REVIEW_MAPS),
            "actionKinds": list(ACTION_KINDS),
            "captureCount": len(records),
            "launchStrategy": "single_persistent_window",
            "godotProcessCount": aggregate_window_evidence.get(
                "godotProcessCount", 0
            ),
            "userVisibleWindowOpenCount": aggregate_window_evidence.get(
                "userVisibleWindowOpenCount", 0
            ),
            "userVisibleWindowCloseCount": aggregate_window_evidence.get(
                "userVisibleWindowCloseCount", 0
            ),
            "singlePersistentWindow": aggregate_window_evidence.get(
                "singlePersistentWindow", False
            ),
            "windowCountEvidence": aggregate_window_evidence,
            "actionsRecordedInSingleProcess": max(
                batch.get("actionCount", 0)
                for batch in aggregate_window_evidence["batches"]
            ),
            "batchEntrypoint": (
                CORE._artifact_record(BATCH_CAPTURE_SCRIPT_PATH)
                if record_targets
                else None
            ),
            "batchCaptureController": (
                CORE._artifact_record(
                    BATCH_SOURCE_PATHS["captureController"]
                )
                if record_targets
                else None
            ),
            "batchPlan": (
                CORE._artifact_record(batch_plan_path)
                if batch_plan_path is not None
                else None
            ),
            "batchPlanSha256": batch_plan_sha256,
            "batchRuntimeReceipt": batch_receipt,
            "scratchOnly": scratch_only,
            "resumed": resume,
            "replacedPendingEvidence": replace_pending,
            "supersededEvidence": [
                CORE._artifact_record(backup) for _destination, backup in backups
            ],
            "hudGlyphStability": {
                "status": "passed",
                "selfContainedImageCount": len(records),
                "incrementalPreviewAcceptedAsPixelAuthority": False,
                "board": board,
            },
            "records": records,
        }
        summary_path = run_root / "capture-matrix.json"
        _guard_repo_path(
            summary_path,
            allowed_root=run_root,
            label="动作 capture matrix",
            expected="missing",
        )
        if (
            formal_transaction_path is not None
            and formal_transaction_path.is_file()
        ):
            pending_summary = run_root / "capture-matrix.pending.json"
            _write_durable_json(pending_summary, summary)
            _commit_formal_transaction(
                formal_transaction_path,
                pending_summary,
            )
            published_summary = _publish_committed_summary(
                formal_transaction_path,
            )
            if published_summary != summary_path:
                raise MapActionCaptureError(
                    "formal transaction summary 发布路径漂移"
                )
        else:
            _write_durable_json(summary_path, summary)
        return summary_path
    except BaseException as error:
        if (
            formal_transaction_path is not None
            and formal_transaction_path.is_file()
        ):
            try:
                _recover_formal_transaction(formal_transaction_path)
            except MapActionCaptureError as rollback_error:
                raise MapActionCaptureError(
                    f"动作录制失败且 durable formal transaction 恢复失败："
                    f"{rollback_error}"
                ) from error
        raise


def main() -> int:
    args = _parse_args()
    try:
        summary_path = _record(args)
    except (MapActionCaptureError, RECORDER.FirebudV2RecordingError) as error:
        print(f"map visual action capture failed: {error}", file=sys.stderr)
        return 1
    print(f"map visual action capture: PASS summary={_portable(summary_path)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
