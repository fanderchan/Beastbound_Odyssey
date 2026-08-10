#!/usr/bin/env python3
"""Record fail-closed, hash-frozen true-eight world-direction review evidence.

The review scene validates the exact requested world subjects that it loads.
The legacy default remains character + pet + mounted (120 frames), while
``--subjects pet`` records a non-rideable pet-only 40-frame review.  This
wrapper makes that validation inseparable from a candidate movie:

1. import the Godot project once;
2. run a subject-bound parity-only preflight for every requested form;
3. record each form while asking the recording process to write its own parity
   report with the same run ID;
4. capture the eight-direction grid and its parity report;
5. transcode, decode-check, probe, and build a two-sample-per-direction contact
   sheet; and
6. freeze every generated artifact (except the self-referential index itself)
   by repo-relative path, SHA-256, and byte size.

Run this script from the repository root.  A failed or partial run deliberately
does not receive an ``evidence-index.json`` and therefore cannot be approved as
a complete candidate.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shlex
import shutil
import struct
import subprocess
import sys
import uuid
from datetime import datetime, timezone
from fractions import Fraction
from pathlib import Path
from typing import Any, Iterable, Sequence

from PIL import Image, UnidentifiedImageError


REPO_ROOT = Path(__file__).resolve().parents[1]
GODOT_PROJECT = REPO_ROOT / "client" / "godot"
REVIEW_SCENE = "res://scenes/qa/CharacterMountDirectionReview.tscn"
DEFAULT_OUTPUT_ROOT = Path(
    ".run/evidence/phase325_world_direction_runtime_parity/candidate"
)
DEFAULT_FORM_IDS = (
    "bui_novice_sprout_earth5_wind5",
    "wuli_normal_orange_fire10",
    "mossback_marsh_earth7_water3",
    "emberhorn_red_fire8_earth2",
    "blue_man_dragon_water10",
    "rebirth_beast_earth_lv50",
    "novice_tiger_mount",
)

INDEX_SCHEMA_VERSION = 1
INDEX_TYPE = "beastbound_world_direction_review_evidence"
PARITY_SCHEMA_VERSION = 1
PARITY_KINDS = ("character", "pet", "mounted")
PET_ONLY_SUBJECTS = ("pet",)
SUPPORTED_SUBJECTS = (PARITY_KINDS, PET_ONLY_SUBJECTS)
FRAMES_PER_SUBJECT = 40
PARITY_DIRECTIONS = (
    "south",
    "southwest",
    "west",
    "northwest",
    "north",
    "northeast",
    "east",
    "southeast",
)
PARITY_ACTION_FRAMES = (
    ("idle", 1),
    ("walk", 1),
    ("walk", 2),
    ("walk", 3),
    ("walk", 4),
)
EXPECTED_PARITY_FRAMES = FRAMES_PER_SUBJECT * len(PARITY_KINDS)
EXPECTED_WIDTH = 1280
EXPECTED_HEIGHT = 720
EXPECTED_FPS = Fraction(30, 1)
EXPECTED_FRAME_COUNT = 433
EXPECTED_SCENE_DURATION_SECONDS = 14.4
EXPECTED_VIDEO_DURATION_SECONDS = Fraction(EXPECTED_FRAME_COUNT, 1) / EXPECTED_FPS
MAX_DURATION_ERROR_SECONDS = 1.0 / float(EXPECTED_FPS)
DIRECTION_FRAME_STRIDE = 54  # 1.8 seconds at 30 FPS.
CONTACT_SAMPLE_FRAME_INDICES = tuple(
    frame
    for direction_index in range(8)
    for frame in (
        direction_index * DIRECTION_FRAME_STRIDE + 9,   # 0.30 s: idle
        direction_index * DIRECTION_FRAME_STRIDE + 36,  # 1.20 s: walk
    )
)
SAFE_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")
SAFE_RES_PNG_PATH = re.compile(
    r"^res://[A-Za-z0-9._-]+(?:/[A-Za-z0-9._-]+)*\.png$"
)
SAFE_REPO_PNG_PATH = re.compile(
    r"^repo://[A-Za-z0-9._-]+(?:/[A-Za-z0-9._-]+)*\.png$"
)
LOWER_SHA256 = re.compile(r"^[0-9a-f]{64}$")
FRAME_SHA256_FIELDS = (
    "sourceFileSha256",
    "sourceDecodedRgbaSha256",
    "loadedDecodedRgbaSha256",
)
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


class ReviewRecordingError(RuntimeError):
    """A user-facing, fail-closed recording-contract failure."""


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _new_run_id() -> str:
    timestamp = _utc_now().strftime("%Y%m%dT%H%M%S.%fZ")
    return f"phase325-{timestamp}-{uuid.uuid4().hex[:8]}"


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _repo_relative(path: Path) -> str:
    resolved = path.resolve(strict=False)
    try:
        return resolved.relative_to(REPO_ROOT).as_posix()
    except ValueError as error:
        raise ReviewRecordingError(f"证据路径越出仓库根目录：{path}") from error


def _resolve_repo_output(path: Path) -> Path:
    if path.is_absolute():
        resolved = path.resolve(strict=False)
    else:
        resolved = (REPO_ROOT / path).resolve(strict=False)
    _repo_relative(resolved)
    return resolved


def _artifact_record(path: Path) -> dict[str, Any]:
    if not path.is_file():
        raise ReviewRecordingError(f"证据文件不存在：{_repo_relative(path)}")
    size = path.stat().st_size
    if size <= 0:
        raise ReviewRecordingError(f"证据文件为空：{_repo_relative(path)}")
    return {
        "path": _repo_relative(path),
        "sha256": _sha256(path),
        "sizeBytes": size,
    }


def _write_json(path: Path, value: Any) -> None:
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def _read_json(path: Path, *, label: str) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ReviewRecordingError(f"无法读取 {label}：{path}: {error}") from error
    if not isinstance(value, dict):
        raise ReviewRecordingError(f"{label} 根节点必须是对象：{path}")
    return value


def _run_logged(
    command: Sequence[str],
    *,
    log_path: Path,
    timeout_seconds: float,
) -> None:
    with log_path.open("w", encoding="utf-8") as log:
        log.write(f"$ {shlex.join(command)}\n")
        log.flush()
        try:
            completed = subprocess.run(
                list(command),
                cwd=REPO_ROOT,
                stdin=subprocess.DEVNULL,
                stdout=log,
                stderr=subprocess.STDOUT,
                check=False,
                timeout=timeout_seconds,
            )
        except subprocess.TimeoutExpired as error:
            log.write(f"\nTIMEOUT after {timeout_seconds:.1f}s\n")
            raise ReviewRecordingError(
                f"命令超时（{timeout_seconds:.1f}s），详见 {_repo_relative(log_path)}"
            ) from error
    if completed.returncode != 0:
        raise ReviewRecordingError(
            f"命令失败 exit={completed.returncode}，详见 {_repo_relative(log_path)}"
        )


def _capture_version(executable: str, arguments: Sequence[str]) -> str:
    completed = subprocess.run(
        [executable, *arguments],
        cwd=REPO_ROOT,
        stdin=subprocess.DEVNULL,
        capture_output=True,
        text=True,
        check=False,
        timeout=30,
    )
    if completed.returncode != 0:
        raise ReviewRecordingError(
            f"无法读取工具版本：{executable} {' '.join(arguments)}"
        )
    output = (completed.stdout or completed.stderr).strip()
    return output.splitlines()[0] if output else "unknown"


def _is_safe_source_png_path(value: Any) -> bool:
    if not isinstance(value, str) or not value:
        return False
    if (
        SAFE_RES_PNG_PATH.fullmatch(value) is None
        and SAFE_REPO_PNG_PATH.fullmatch(value) is None
    ):
        return False
    prefix = "res://" if value.startswith("res://") else "repo://"
    return all(
        segment not in (".", "..")
        for segment in value.removeprefix(prefix).split("/")
    )


def _isolated_world_frame_paths(root: Path) -> list[Path]:
    return [
        root / "world" / "directions" / direction / action / f"{action}-{frame_index}.png"
        for direction in PARITY_DIRECTIONS
        for action, frame_index in PARITY_ACTION_FRAMES
    ]


def _isolated_identity_paths(root: Path) -> list[Path]:
    return [
        root / "identity" / "identity-board-transparent.png",
        root / "identity" / "front_3quarter_sw.png",
        root / "identity" / "back_3quarter_ne.png",
        root / "identity" / "south.png",
        root / "identity" / "west.png",
    ]


def _isolated_bundle_sha256(root: Path, artifact_paths: Sequence[Path]) -> str:
    paths = [root / "action-bundle-meta.json", *artifact_paths]
    lines = [
        f"{path.relative_to(root).as_posix()}\t{_sha256(path)}\n"
        for path in paths
    ]
    return hashlib.sha256("".join(lines).encode("utf-8")).hexdigest()


def _validate_png_size(path: Path, *, expected: tuple[int, int], label: str) -> None:
    if path.is_symlink() or not path.is_file():
        raise ReviewRecordingError(f"{label} 不是普通 PNG 文件：{path}")
    try:
        with Image.open(path) as image:
            image.load()
            actual = image.size
    except (OSError, UnidentifiedImageError) as error:
        raise ReviewRecordingError(f"{label} 无法解码：{path}: {error}") from error
    if actual != expected:
        raise ReviewRecordingError(
            f"{label} 尺寸为 {actual[0]}x{actual[1]}，期望 {expected[0]}x{expected[1]}"
        )


def _validate_isolated_pet_root(root_value: Path, *, form_id: str) -> dict[str, Any]:
    candidate = root_value if root_value.is_absolute() else REPO_ROOT / root_value
    try:
        lexical_relative = candidate.absolute().relative_to(REPO_ROOT)
    except ValueError as error:
        raise ReviewRecordingError("--pet-root 必须位于仓库内") from error
    cursor = REPO_ROOT
    for part in lexical_relative.parts:
        cursor = cursor / part
        if cursor.is_symlink():
            raise ReviewRecordingError(f"--pet-root 不能包含符号链接路径别名：{root_value}")
    try:
        root = candidate.resolve(strict=True)
        relative = root.relative_to(REPO_ROOT)
    except (FileNotFoundError, ValueError, OSError) as error:
        raise ReviewRecordingError(f"--pet-root 不存在或越出仓库：{root_value}") from error
    if not root.is_dir():
        raise ReviewRecordingError(f"--pet-root 不是目录：{relative.as_posix()}")
    if not relative.parts or relative.parts[0] != ".run":
        raise ReviewRecordingError("--pet-root 必须位于仓库 .run/ 隔离目录")

    meta_path = root / "action-bundle-meta.json"
    meta = _read_json(meta_path, label="isolated action-bundle-meta")
    if meta.get("formId") != form_id:
        raise ReviewRecordingError(
            f"isolated action-bundle-meta.formId={meta.get('formId')!r}，期望 {form_id!r}"
        )
    if meta.get("runtimeEnabled") is not False:
        raise ReviewRecordingError("isolated action-bundle-meta.runtimeEnabled 必须为 false")
    if meta.get("rideableTarget") is not False:
        raise ReviewRecordingError("isolated action-bundle-meta.rideableTarget 必须为 false")
    if meta.get("ownerReviewStatus") != "pending":
        raise ReviewRecordingError(
            "isolated action-bundle-meta.ownerReviewStatus 必须为 'pending'"
        )
    forbidden_fields = ("mounted", "character", "supportedCharacterIds")
    present_forbidden = [field for field in forbidden_fields if field in meta]
    if present_forbidden:
        raise ReviewRecordingError(
            "isolated action-bundle-meta 禁止骑乘/人物字段："
            + ",".join(present_forbidden)
        )
    if (
        "supportedMountedCharacterIds" in meta
        and meta.get("supportedMountedCharacterIds") != []
    ):
        raise ReviewRecordingError(
            "isolated action-bundle-meta.supportedMountedCharacterIds "
            "若存在必须为空数组"
        )
    for forbidden_directory in ("mounted", "character"):
        if (root / forbidden_directory).exists():
            raise ReviewRecordingError(
                f"isolated pet root 禁止 {forbidden_directory}/ 目录"
            )
    if meta.get("runtimeFrameSize") != [256, 256]:
        raise ReviewRecordingError(
            "isolated action-bundle-meta.runtimeFrameSize 必须为 [256, 256]"
        )

    identity = meta.get("identity")
    if not isinstance(identity, dict):
        raise ReviewRecordingError("isolated action-bundle-meta.identity 必须是对象")
    expected_identity = {
        "board": "identity/identity-board-transparent.png",
        "poses": {
            "front_3quarter_sw": "identity/front_3quarter_sw.png",
            "back_3quarter_ne": "identity/back_3quarter_ne.png",
            "south": "identity/south.png",
            "west": "identity/west.png",
        },
        "sourceFrameSize": [512, 512],
        "status": "self_review_passed_owner_pending",
    }
    for field, expected in expected_identity.items():
        if identity.get(field) != expected:
            raise ReviewRecordingError(
                f"isolated action-bundle-meta.identity.{field} 必须为 {expected!r}"
            )
    identity_paths = _isolated_identity_paths(root)
    for index, path in enumerate(identity_paths):
        _validate_png_size(
            path,
            expected=(1024, 1024) if index == 0 else (512, 512),
            label=f"isolated identity {path.name}",
        )
    actual_identity_paths = {
        path.resolve(strict=True)
        for path in (root / "identity").rglob("*.png")
        if path.is_file()
    }
    expected_identity_paths = {path.resolve(strict=True) for path in identity_paths}
    if actual_identity_paths != expected_identity_paths:
        extras = sorted(actual_identity_paths - expected_identity_paths)
        raise ReviewRecordingError(
            "isolated pet root 含规范外 identity PNG："
            + (extras[0].relative_to(root).as_posix() if extras else "unknown")
        )

    world_visual = meta.get("worldVisual")
    if not isinstance(world_visual, dict):
        raise ReviewRecordingError("isolated action-bundle-meta.worldVisual 必须是对象")
    exact_world_fields = {
        "strategy": "independent_8",
        "runtimeMirroring": False,
        "directions": list(PARITY_DIRECTIONS),
    }
    for field, expected in exact_world_fields.items():
        if world_visual.get(field) != expected:
            raise ReviewRecordingError(
                f"isolated action-bundle-meta.worldVisual.{field} 必须为 {expected!r}"
            )
    if world_visual.get("totalFrameCount") != 40:
        raise ReviewRecordingError(
            "isolated action-bundle-meta.worldVisual.totalFrameCount 必须为 40"
        )
    if world_visual.get("runtimeMountedComposition") is not False:
        raise ReviewRecordingError(
            "isolated action-bundle-meta.worldVisual.runtimeMountedComposition "
            "必须为 false"
        )
    actions = world_visual.get("actions")
    if not isinstance(actions, dict):
        raise ReviewRecordingError(
            "isolated action-bundle-meta.worldVisual.actions 必须是对象"
        )
    for action, expected_count in (("idle", 1), ("walk", 4)):
        action_value = actions.get(action)
        if not isinstance(action_value, dict) or action_value.get("frameCount") != expected_count:
            raise ReviewRecordingError(
                f"isolated action-bundle-meta.worldVisual.actions.{action}.frameCount "
                f"必须为 {expected_count}"
            )

    frame_paths = _isolated_world_frame_paths(root)
    missing = [path for path in frame_paths if not path.is_file()]
    if missing:
        raise ReviewRecordingError(
            "isolated pet root 缺少世界帧："
            + missing[0].relative_to(root).as_posix()
        )
    for path in frame_paths:
        _validate_png_size(
            path,
            expected=(256, 256),
            label=f"isolated world frame {path.relative_to(root).as_posix()}",
        )
    expected_paths = {path.resolve(strict=True) for path in frame_paths}
    world_root = root / "world" / "directions"
    actual_paths = {
        path.resolve(strict=True)
        for path in world_root.rglob("*.png")
        if path.is_file()
    }
    if actual_paths != expected_paths:
        extras = sorted(actual_paths - expected_paths)
        raise ReviewRecordingError(
            "isolated pet root 含规范外 world PNG："
            + (extras[0].relative_to(root).as_posix() if extras else "unknown")
        )
    meta_record = _artifact_record(meta_path)
    return {
        "mode": "isolated_pet_root",
        "formId": form_id,
        "root": relative.as_posix(),
        "rootAbsolute": str(root),
        "metadata": meta_record,
        "bundleSha256": _isolated_bundle_sha256(
            root,
            [*identity_paths, *frame_paths],
        ),
        "frameCount": len(frame_paths),
    }


def _selected_subjects(value: str | None) -> tuple[str, ...]:
    if value is None:
        return PARITY_KINDS
    subjects = tuple(value.split(","))
    if subjects not in SUPPORTED_SUBJECTS:
        raise ReviewRecordingError(
            "--subjects 仅允许 pet 或 character,pet,mounted，且不能重排、重复或混用"
        )
    return subjects


def _expected_parity_coverage(
    subjects: Sequence[str],
) -> frozenset[tuple[str, str, str, int]]:
    return frozenset(
        (kind, direction, action, frame_index)
        for kind in subjects
        for direction in PARITY_DIRECTIONS
        for action, frame_index in PARITY_ACTION_FRAMES
    )


def _expected_parity_frames(subjects: Sequence[str]) -> int:
    return FRAMES_PER_SUBJECT * len(subjects)


def _parity_source_set_sha256(frames: Sequence[dict[str, Any]]) -> str:
    """Match WorldReviewFrameParity.source_set_sha256 without reordering rows."""
    lines = (
        f"{frame.get('kind', '')}\t{frame.get('path', '')}\t"
        f"{frame.get('sourceFileSha256', '')}\t"
        f"{frame.get('sourceDecodedRgbaSha256', '')}\t"
        f"{frame.get('loadedDecodedRgbaSha256', '')}\n"
        for frame in frames
    )
    return hashlib.sha256("".join(lines).encode("utf-8")).hexdigest()


def _validate_parity_report(
    path: Path,
    *,
    form_id: str,
    run_id: str,
    label: str,
    subjects: Sequence[str] = PARITY_KINDS,
    isolated_bundle: dict[str, Any] | None = None,
    expected_source_set_sha256: str | None = None,
) -> dict[str, Any]:
    selected_subjects = tuple(subjects)
    if selected_subjects not in SUPPORTED_SUBJECTS:
        raise ReviewRecordingError(f"{label} 请求了不支持的主体集合：{selected_subjects!r}")
    expected_coverage = _expected_parity_coverage(selected_subjects)
    expected_frames = _expected_parity_frames(selected_subjects)
    report = _read_json(path, label=label)
    errors: list[str] = []
    if type(report.get("schemaVersion")) is not int or report.get(
        "schemaVersion"
    ) != PARITY_SCHEMA_VERSION:
        errors.append(f"schemaVersion={report.get('schemaVersion')!r}")
    if report.get("status") != "passed":
        errors.append(f"status={report.get('status')!r}")
    if report.get("formId") != form_id:
        errors.append(f"formId={report.get('formId')!r}")
    if report.get("runId") != run_id:
        errors.append(f"runId={report.get('runId')!r}")
    if report.get("subjects") != list(selected_subjects):
        errors.append(f"subjects={report.get('subjects')!r}")
    if isolated_bundle is None:
        if report.get("isolatedPetRoot", "") != "":
            errors.append("isolatedPetRoot 非空但未声明隔离宠物包")
        if report.get("overlayScope", "") != "":
            errors.append("overlayScope 非空但未声明隔离宠物包")
    else:
        if selected_subjects != PET_ONLY_SUBJECTS:
            errors.append("隔离宠物包只能用于 subjects=['pet']")
        if report.get("isolatedPetRoot") != isolated_bundle["rootAbsolute"]:
            errors.append(
                f"isolatedPetRoot={report.get('isolatedPetRoot')!r}"
            )
        if report.get("overlayScope") != "world_pet_only":
            errors.append(f"overlayScope={report.get('overlayScope')!r}")
    if report.get("expectedFrames") != expected_frames:
        errors.append(f"expectedFrames={report.get('expectedFrames')!r}")
    if report.get("checkedFrames") != expected_frames:
        errors.append(f"checkedFrames={report.get('checkedFrames')!r}")
    if report.get("passedFrames") != expected_frames:
        errors.append(f"passedFrames={report.get('passedFrames')!r}")
    report_errors = report.get("errors")
    if report_errors != []:
        errors.append("errors 不是空数组")
    source_set_sha256 = report.get("sourceSetSha256")
    if not isinstance(source_set_sha256, str) or LOWER_SHA256.fullmatch(
        source_set_sha256
    ) is None:
        errors.append("sourceSetSha256 不是 64 位小写 SHA-256")
    if (
        expected_source_set_sha256 is not None
        and source_set_sha256 != expected_source_set_sha256
    ):
        errors.append("sourceSetSha256 在录制步骤之间发生漂移")
    frames = report.get("frames")
    if not isinstance(frames, list) or len(frames) != expected_frames:
        errors.append(f"frames 数量不是 {expected_frames}")
    else:
        coverage: set[tuple[str, str, str, int]] = set()
        duplicate_coverage: set[tuple[str, str, str, int]] = set()
        seen_paths: set[str] = set()
        duplicate_paths: set[str] = set()
        typed_frames: list[dict[str, Any]] = []
        for row_index, frame_value in enumerate(frames):
            frame_label = f"frames[{row_index}]"
            if not isinstance(frame_value, dict):
                errors.append(f"{frame_label} 不是对象")
                continue
            frame = frame_value
            typed_frames.append(frame)
            if frame.get("status") != "passed":
                errors.append(f"{frame_label}.status={frame.get('status')!r}")
            if frame.get("errors") != []:
                errors.append(f"{frame_label}.errors 不是空数组")
            if isolated_bundle is None:
                if frame.get("importFresh") is not True:
                    errors.append(f"{frame_label}.importFresh 不是 true")
                if frame.get("loadMode") != "godot_import":
                    errors.append(
                        f"{frame_label}.loadMode={frame.get('loadMode')!r}"
                    )
            else:
                exact_isolated_fields = {
                    "importFresh": False,
                    "sourceFileFresh": True,
                    "resourceImportParityChecked": False,
                    "importSourceMd5": "",
                    "loadMode": "qa_isolated_file",
                }
                for field, expected in exact_isolated_fields.items():
                    if frame.get(field) != expected:
                        errors.append(
                            f"{frame_label}.{field}={frame.get(field)!r}"
                        )
            if frame.get("canonicalRgbaMatch") is not True:
                errors.append(f"{frame_label}.canonicalRgbaMatch 不是 true")

            kind = frame.get("kind")
            direction = frame.get("direction")
            action = frame.get("action")
            frame_index = frame.get("index")
            coverage_key: tuple[str, str, str, int] | None = None
            if (
                isinstance(kind, str)
                and isinstance(direction, str)
                and isinstance(action, str)
                and type(frame_index) is int
            ):
                coverage_key = (kind, direction, action, frame_index)
            if coverage_key not in expected_coverage:
                errors.append(
                    f"{frame_label} 不是规范 kind/direction/action/index 覆盖"
                )
            elif coverage_key in coverage:
                duplicate_coverage.add(coverage_key)
            else:
                coverage.add(coverage_key)

            source_path = frame.get("path")
            if not _is_safe_source_png_path(source_path):
                errors.append(f"{frame_label}.path 不是安全的 res:// 或 repo:// PNG 路径")
            elif isolated_bundle is None and not source_path.startswith("res://"):
                errors.append(f"{frame_label}.path 正式资源必须使用 res://")
            elif isolated_bundle is not None:
                expected_path = (
                    f"repo://{isolated_bundle['root']}/world/directions/"
                    f"{direction}/{action}/{action}-{frame_index}.png"
                )
                if source_path != expected_path:
                    errors.append(
                        f"{frame_label}.path={source_path!r}，期望 {expected_path!r}"
                    )
                else:
                    current_path = REPO_ROOT / source_path.removeprefix("repo://")
                    if frame.get("sourceFileSha256") != _sha256(current_path):
                        errors.append(
                            f"{frame_label}.sourceFileSha256 与隔离源 PNG 不一致"
                        )
            if isinstance(source_path, str) and source_path in seen_paths:
                duplicate_paths.add(source_path)
            elif isinstance(source_path, str):
                seen_paths.add(source_path)

            for field in FRAME_SHA256_FIELDS:
                value = frame.get(field)
                if not isinstance(value, str) or LOWER_SHA256.fullmatch(value) is None:
                    errors.append(f"{frame_label}.{field} 不是 64 位小写 SHA-256")

        if duplicate_coverage:
            errors.append(f"frames 存在重复逻辑帧：{len(duplicate_coverage)} 项")
        if duplicate_paths:
            errors.append(f"frames 存在重复 PNG 路径：{len(duplicate_paths)} 项")
        missing_coverage = expected_coverage - coverage
        if missing_coverage:
            errors.append(f"frames 缺少规范逻辑帧：{len(missing_coverage)} 项")
        if len(typed_frames) == expected_frames:
            recomputed_sha256 = _parity_source_set_sha256(typed_frames)
            if source_set_sha256 != recomputed_sha256:
                errors.append(
                    "sourceSetSha256 与按报告顺序重算的 GDScript 哈希不一致"
                )
    if errors:
        raise ReviewRecordingError(f"{label} 未通过：{'；'.join(errors)}")
    return report


def _parity_artifact(
    path: Path,
    report: dict[str, Any],
    *,
    subjects: Sequence[str],
) -> dict[str, Any]:
    expected_frames = _expected_parity_frames(subjects)
    return {
        **_artifact_record(path),
        "status": "passed",
        "subjects": list(subjects),
        "checkedFrames": report["checkedFrames"],
        "passedFrames": report["passedFrames"],
        "expectedFrames": expected_frames,
        "sourceSetSha256": report["sourceSetSha256"],
    }


def _canonical_rgba_bytes(image: Image.Image) -> bytes:
    rgba = bytearray(image.convert("RGBA").tobytes())
    for offset in range(0, len(rgba), 4):
        if rgba[offset + 3] < 255:
            rgba[offset] = 0
            rgba[offset + 1] = 0
            rgba[offset + 2] = 0
    return bytes(rgba)


def _rgba_sha256(width: int, height: int, rgba: bytes) -> str:
    digest = hashlib.sha256()
    digest.update(f"{width}x{height}:RGBA\n".encode("utf-8"))
    digest.update(rgba)
    return digest.hexdigest()


def _source_path_for_frame(source_path: str) -> Path:
    if not _is_safe_source_png_path(source_path):
        raise ReviewRecordingError(
            f"不是安全的 res:// 或 repo:// PNG 路径：{source_path!r}"
        )
    is_repo_path = source_path.startswith("repo://")
    prefix = "repo://" if is_repo_path else "res://"
    relative = Path(source_path.removeprefix(prefix))
    source_root = REPO_ROOT if is_repo_path else GODOT_PROJECT
    candidate = source_root / relative
    cursor = source_root
    for part in relative.parts:
        cursor = cursor / part
        if cursor.is_symlink():
            raise ReviewRecordingError(f"世界帧路径包含符号链接别名：{source_path}")
    try:
        resolved = candidate.resolve(strict=True)
        resolved.relative_to(source_root.resolve(strict=True))
    except (FileNotFoundError, ValueError, OSError) as error:
        raise ReviewRecordingError(f"世界帧不存在或越出声明源根：{source_path}") from error
    if not resolved.is_file():
        raise ReviewRecordingError(f"世界帧不是普通文件：{source_path}")
    return resolved


def _validate_source_frame_independence(
    frames: Sequence[dict[str, Any]],
    *,
    subjects: Sequence[str],
) -> None:
    """Reject filesystem aliases, duplicate pixels, and mirrored directions."""
    expected_frames = _expected_parity_frames(subjects)
    if len(frames) != expected_frames:
        raise ReviewRecordingError(
            f"源帧独立性检查收到 {len(frames)} 帧，期望 {expected_frames}"
        )
    seen_inodes: dict[tuple[int, int], str] = {}
    per_subject: dict[str, list[tuple[tuple[str, str, int], str, str]]] = {
        subject: [] for subject in subjects
    }
    for row_index, frame in enumerate(frames):
        source_path = str(frame.get("path", ""))
        path = _source_path_for_frame(source_path)
        stat = path.stat()
        inode = (stat.st_dev, stat.st_ino)
        previous_path = seen_inodes.get(inode)
        if previous_path is not None:
            raise ReviewRecordingError(
                f"世界帧路径存在文件系统别名：{previous_path} 与 {source_path}"
            )
        if stat.st_nlink != 1:
            raise ReviewRecordingError(
                f"世界帧存在仓库外硬链接别名：{source_path} links={stat.st_nlink}"
            )
        seen_inodes[inode] = source_path
        try:
            with Image.open(path) as image:
                image.load()
                width, height = image.size
                canonical = _canonical_rgba_bytes(image)
        except (OSError, UnidentifiedImageError) as error:
            raise ReviewRecordingError(f"世界帧无法解码：{source_path}: {error}") from error
        decoded_sha256 = _rgba_sha256(width, height, canonical)
        if frame.get("sourceDecodedRgbaSha256") != decoded_sha256:
            raise ReviewRecordingError(
                f"世界帧 canonical RGBA 与 parity 报告不一致：frames[{row_index}]"
            )
        row_width = width * 4
        mirrored = b"".join(
            b"".join(
                canonical[row_start + column : row_start + column + 4]
                for column in range(row_width - 4, -1, -4)
            )
            for row_start in range(0, len(canonical), row_width)
        )
        mirror_sha256 = _rgba_sha256(width, height, mirrored)
        subject = str(frame.get("kind", ""))
        if subject not in per_subject:
            raise ReviewRecordingError(f"世界帧混入未请求主体：{subject!r}")
        key = (
            str(frame.get("direction", "")),
            str(frame.get("action", "")),
            int(frame.get("index", 0)),
        )
        per_subject[subject].append((key, decoded_sha256, mirror_sha256))

    for subject, rows in per_subject.items():
        by_decoded: dict[str, tuple[str, str, int]] = {}
        for key, decoded_sha256, _ in rows:
            previous = by_decoded.get(decoded_sha256)
            if previous is not None:
                raise ReviewRecordingError(
                    f"{subject} 世界帧像素重复：{previous!r} 与 {key!r}"
                )
            by_decoded[decoded_sha256] = key
        for key, _, mirror_sha256 in rows:
            mirror_match = by_decoded.get(mirror_sha256)
            if mirror_match is not None and mirror_match[0] != key[0]:
                raise ReviewRecordingError(
                    f"{subject} 世界方向疑似水平镜像：{key!r} 与 {mirror_match!r}"
                )


def _parse_fraction(value: Any, *, label: str) -> Fraction:
    try:
        parsed = Fraction(str(value))
    except (ValueError, ZeroDivisionError) as error:
        raise ReviewRecordingError(f"ffprobe {label} 无法解析：{value!r}") from error
    return parsed


def _validate_probe(probe: dict[str, Any]) -> dict[str, Any]:
    streams = probe.get("streams")
    if not isinstance(streams, list):
        raise ReviewRecordingError("ffprobe streams 不是数组")
    video_stream = next(
        (
            stream
            for stream in streams
            if isinstance(stream, dict) and stream.get("codec_type") == "video"
        ),
        None,
    )
    if video_stream is None:
        raise ReviewRecordingError("ffprobe 未发现视频流")

    errors: list[str] = []
    codec = video_stream.get("codec_name")
    if codec != "h264":
        errors.append(f"codec={codec!r}")
    width = video_stream.get("width")
    height = video_stream.get("height")
    if width != EXPECTED_WIDTH or height != EXPECTED_HEIGHT:
        errors.append(f"size={width}x{height}")
    fps = _parse_fraction(
        video_stream.get("avg_frame_rate") or video_stream.get("r_frame_rate"),
        label="fps",
    )
    if fps != EXPECTED_FPS:
        errors.append(f"fps={fps}")
    raw_frame_count = video_stream.get("nb_read_frames") or video_stream.get("nb_frames")
    try:
        frame_count = int(raw_frame_count)
    except (TypeError, ValueError):
        frame_count = -1
    if frame_count != EXPECTED_FRAME_COUNT:
        errors.append(f"frameCount={raw_frame_count!r}")

    raw_duration = video_stream.get("duration")
    if raw_duration in (None, "N/A"):
        format_value = probe.get("format")
        raw_duration = format_value.get("duration") if isinstance(format_value, dict) else None
    try:
        duration = float(raw_duration)
    except (TypeError, ValueError):
        duration = -1.0
    if abs(duration - float(EXPECTED_VIDEO_DURATION_SECONDS)) > MAX_DURATION_ERROR_SECONDS:
        errors.append(f"duration={raw_duration!r}")
    if errors:
        raise ReviewRecordingError(f"视频元数据不符合固定评审契约：{'；'.join(errors)}")
    return {
        "codec": codec,
        "width": width,
        "height": height,
        "fps": float(fps),
        "durationSeconds": duration,
        "frameCount": frame_count,
    }


def _png_dimensions(path: Path) -> tuple[int, int]:
    try:
        header = path.read_bytes()[:24]
    except OSError as error:
        raise ReviewRecordingError(f"无法读取 PNG：{path}: {error}") from error
    if len(header) < 24 or header[:8] != PNG_SIGNATURE or header[12:16] != b"IHDR":
        raise ReviewRecordingError(f"不是有效 PNG 头：{_repo_relative(path)}")
    return struct.unpack(">II", header[16:24])


def _write_probe(ffprobe: str, video_path: Path, output_path: Path) -> dict[str, Any]:
    command = [
        ffprobe,
        "-v",
        "error",
        "-count_frames",
        "-show_entries",
        (
            "stream=index,codec_type,codec_name,width,height,r_frame_rate,"
            "avg_frame_rate,nb_frames,nb_read_frames,duration:"
            "format=format_name,duration,size"
        ),
        "-of",
        "json",
        str(video_path),
    ]
    completed = subprocess.run(
        command,
        cwd=REPO_ROOT,
        stdin=subprocess.DEVNULL,
        capture_output=True,
        text=True,
        check=False,
        timeout=120,
    )
    if completed.returncode != 0:
        raise ReviewRecordingError(
            f"ffprobe 失败 exit={completed.returncode}: {completed.stderr.strip()}"
        )
    try:
        probe = json.loads(completed.stdout)
    except json.JSONDecodeError as error:
        raise ReviewRecordingError("ffprobe 没有返回有效 JSON") from error
    if not isinstance(probe, dict):
        raise ReviewRecordingError("ffprobe JSON 根节点不是对象")
    _write_json(output_path, probe)
    return probe


def _godot_base(godot: str) -> list[str]:
    return [godot, "--path", str(GODOT_PROJECT), "--scene", REVIEW_SCENE]


def _review_arguments(
    *,
    form_id: str,
    run_id: str,
    parity_report_path: Path,
    subjects: Sequence[str],
    isolated_bundle: dict[str, Any] | None = None,
) -> list[str]:
    arguments = [
        f"--mount-review-form={form_id}",
        f"--mount-review-run-id={run_id}",
        f"--mount-review-parity-report={parity_report_path}",
        f"--mount-review-subjects={','.join(subjects)}",
    ]
    if isolated_bundle is not None:
        arguments.append(
            f"--mount-review-pet-root={isolated_bundle['rootAbsolute']}"
        )
    return arguments


def _record_form(
    *,
    form_id: str,
    run_id: str,
    form_dir: Path,
    godot: str,
    ffmpeg: str,
    ffprobe: str,
    timeout_seconds: float,
    subjects: Sequence[str],
    isolated_bundle: dict[str, Any] | None = None,
) -> dict[str, Any]:
    form_dir.mkdir(parents=False, exist_ok=False)

    preflight_report_path = form_dir / "preflight-parity.json"
    _run_logged(
        [
            godot,
            "--headless",
            "--path",
            str(GODOT_PROJECT),
            "--scene",
            REVIEW_SCENE,
            "--",
            *_review_arguments(
                form_id=form_id,
                run_id=run_id,
                parity_report_path=preflight_report_path,
                subjects=subjects,
                isolated_bundle=isolated_bundle,
            ),
            "--mount-review-parity-only",
        ],
        log_path=form_dir / "preflight-parity.log",
        timeout_seconds=timeout_seconds,
    )
    preflight_report = _validate_parity_report(
        preflight_report_path,
        form_id=form_id,
        run_id=run_id,
        label=f"{form_id} parity-only 报告",
        subjects=subjects,
        isolated_bundle=isolated_bundle,
    )
    _validate_source_frame_independence(
        preflight_report["frames"],
        subjects=subjects,
    )
    source_set_sha256 = preflight_report["sourceSetSha256"]

    avi_path = form_dir / "review.avi"
    recording_report_path = form_dir / "recording-parity.json"
    _run_logged(
        [
            *_godot_base(godot),
            "--write-movie",
            str(avi_path),
            "--fixed-fps",
            str(EXPECTED_FPS.numerator),
            "--disable-vsync",
            "--",
            *_review_arguments(
                form_id=form_id,
                run_id=run_id,
                parity_report_path=recording_report_path,
                subjects=subjects,
                isolated_bundle=isolated_bundle,
            ),
            "--record-mount-directions",
        ],
        log_path=form_dir / "recording.log",
        timeout_seconds=timeout_seconds,
    )
    recording_report = _validate_parity_report(
        recording_report_path,
        form_id=form_id,
        run_id=run_id,
        label=f"{form_id} 录制进程 parity 报告",
        subjects=subjects,
        isolated_bundle=isolated_bundle,
        expected_source_set_sha256=source_set_sha256,
    )
    _artifact_record(avi_path)

    video_path = form_dir / "review.mp4"
    _run_logged(
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
            "0:a?",
            "-c:v",
            "libx264",
            "-preset",
            "slow",
            "-crf",
            "18",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-b:a",
            "128k",
            "-map_metadata",
            "-1",
            "-movflags",
            "+faststart",
            str(video_path),
        ],
        log_path=form_dir / "transcode.log",
        timeout_seconds=timeout_seconds,
    )

    probe_path = form_dir / "ffprobe.json"
    probe = _write_probe(ffprobe, video_path, probe_path)
    video_metadata = _validate_probe(probe)
    _run_logged(
        [
            ffmpeg,
            "-v",
            "error",
            "-xerror",
            "-i",
            str(video_path),
            "-map",
            "0:v:0",
            "-f",
            "null",
            "-",
        ],
        log_path=form_dir / "video-decode.log",
        timeout_seconds=timeout_seconds,
    )

    grid_path = form_dir / "grid.png"
    grid_report_path = form_dir / "grid-parity.json"
    _run_logged(
        [
            *_godot_base(godot),
            "--",
            *_review_arguments(
                form_id=form_id,
                run_id=run_id,
                parity_report_path=grid_report_path,
                subjects=subjects,
                isolated_bundle=isolated_bundle,
            ),
            f"--capture-mount-directions={grid_path}",
        ],
        log_path=form_dir / "grid.log",
        timeout_seconds=timeout_seconds,
    )
    grid_report = _validate_parity_report(
        grid_report_path,
        form_id=form_id,
        run_id=run_id,
        label=f"{form_id} 网格进程 parity 报告",
        subjects=subjects,
        isolated_bundle=isolated_bundle,
        expected_source_set_sha256=source_set_sha256,
    )
    grid_width, grid_height = _png_dimensions(grid_path)
    if (grid_width, grid_height) != (EXPECTED_WIDTH, EXPECTED_HEIGHT):
        raise ReviewRecordingError(
            f"网格尺寸错误：{grid_width}x{grid_height}，期望 1280x720"
        )
    _run_logged(
        [
            ffmpeg,
            "-v",
            "error",
            "-xerror",
            "-i",
            str(grid_path),
            "-frames:v",
            "1",
            "-f",
            "null",
            "-",
        ],
        log_path=form_dir / "grid-decode.log",
        timeout_seconds=timeout_seconds,
    )

    contact_path = form_dir / "review-contact-sheet.png"
    select_expression = "+".join(
        f"eq(n\\,{frame_index})" for frame_index in CONTACT_SAMPLE_FRAME_INDICES
    )
    _run_logged(
        [
            ffmpeg,
            "-y",
            "-v",
            "warning",
            "-i",
            str(video_path),
            "-vf",
            (
                f"select={select_expression},"
                "scale=640:360:flags=lanczos,tile=2x8"
            ),
            "-fps_mode",
            "vfr",
            "-frames:v",
            "1",
            str(contact_path),
        ],
        log_path=form_dir / "contact.log",
        timeout_seconds=timeout_seconds,
    )
    contact_width, contact_height = _png_dimensions(contact_path)
    if (contact_width, contact_height) != (1280, 2880):
        raise ReviewRecordingError(
            f"联系表尺寸错误：{contact_width}x{contact_height}，期望 1280x2880"
        )
    _run_logged(
        [
            ffmpeg,
            "-v",
            "error",
            "-xerror",
            "-i",
            str(contact_path),
            "-frames:v",
            "1",
            "-f",
            "null",
            "-",
        ],
        log_path=form_dir / "contact-decode.log",
        timeout_seconds=timeout_seconds,
    )

    files = [
        _artifact_record(path)
        for path in sorted(form_dir.iterdir(), key=lambda value: value.name)
        if path.is_file()
    ]
    parity = _parity_artifact(
        recording_report_path,
        recording_report,
        subjects=subjects,
    )
    result = {
        "formId": form_id,
        "runId": run_id,
        "status": "passed",
        "subjects": list(subjects),
        "parity": parity,
        "preflightParity": _parity_artifact(
            preflight_report_path,
            preflight_report,
            subjects=subjects,
        ),
        "gridParity": _parity_artifact(
            grid_report_path,
            grid_report,
            subjects=subjects,
        ),
        "video": {
            **_artifact_record(video_path),
            **video_metadata,
            "expectedDurationSeconds": EXPECTED_SCENE_DURATION_SECONDS,
            "expectedEncodedDurationSeconds": float(EXPECTED_VIDEO_DURATION_SECONDS),
            "expectedFrameCount": EXPECTED_FRAME_COUNT,
            "decodeStatus": "passed",
        },
        "movieArchive": _artifact_record(avi_path),
        "grid": {
            **_artifact_record(grid_path),
            "width": grid_width,
            "height": grid_height,
            "decodeStatus": "passed",
        },
        "contact": {
            **_artifact_record(contact_path),
            "width": contact_width,
            "height": contact_height,
            "sampleFrameIndices": list(CONTACT_SAMPLE_FRAME_INDICES),
            "sampleContract": "per_direction_idle_at_0.30s_then_walk_at_1.20s",
            "decodeStatus": "passed",
        },
        "probe": _artifact_record(probe_path),
        "files": files,
    }
    if isolated_bundle is not None:
        result["isolatedPetBundle"] = {
            "mode": isolated_bundle["mode"],
            "formId": isolated_bundle["formId"],
            "root": isolated_bundle["root"],
            "metadata": isolated_bundle["metadata"],
            "bundleSha256": isolated_bundle["bundleSha256"],
            "frameCount": isolated_bundle["frameCount"],
        }
    return result


def _selected_forms(values: Iterable[str] | None) -> tuple[str, ...]:
    forms = tuple(values or DEFAULT_FORM_IDS)
    if not forms:
        raise ReviewRecordingError("至少需要一个 --form-id")
    if len(set(forms)) != len(forms):
        raise ReviewRecordingError("--form-id 不能重复")
    for form_id in forms:
        if not SAFE_ID.fullmatch(form_id):
            raise ReviewRecordingError(f"不安全的 formId：{form_id!r}")
    return forms


def _require_executable(value: str, *, label: str) -> str:
    resolved = shutil.which(value)
    if resolved is None:
        raise ReviewRecordingError(f"找不到 {label} 可执行文件：{value}")
    return resolved


def _record(args: argparse.Namespace) -> Path:
    if Path.cwd().resolve() != REPO_ROOT:
        raise ReviewRecordingError(f"必须从仓库根执行：cd {REPO_ROOT}")
    if not GODOT_PROJECT.is_dir():
        raise ReviewRecordingError(f"Godot 项目不存在：{GODOT_PROJECT}")

    forms = _selected_forms(args.form_ids)
    subjects = _selected_subjects(args.subjects)
    isolated_bundle: dict[str, Any] | None = None
    if args.pet_root is not None:
        if subjects != PET_ONLY_SUBJECTS:
            raise ReviewRecordingError(
                "--pet-root 只允许与 --subjects pet 同时使用"
            )
        if len(forms) != 1:
            raise ReviewRecordingError("--pet-root 每次只能录制一个 --form-id")
        isolated_bundle = _validate_isolated_pet_root(
            args.pet_root,
            form_id=forms[0],
        )
    run_id = args.run_id or _new_run_id()
    if not SAFE_ID.fullmatch(run_id):
        raise ReviewRecordingError(f"不安全的 runId：{run_id!r}")
    output_root = _resolve_repo_output(args.output_root)
    output_root.mkdir(parents=True, exist_ok=True)
    run_dir = output_root / run_id
    run_dir.mkdir(parents=False, exist_ok=False)

    godot = _require_executable(args.godot, label="Godot")
    ffmpeg = _require_executable(args.ffmpeg, label="ffmpeg")
    ffprobe = _require_executable(args.ffprobe, label="ffprobe")
    timeout_seconds = float(args.timeout_seconds)
    if timeout_seconds <= 0:
        raise ReviewRecordingError("--timeout-seconds 必须大于 0")

    import_log = run_dir / "godot-import.log"
    _run_logged(
        [godot, "--headless", "--path", str(GODOT_PROJECT), "--import"],
        log_path=import_log,
        timeout_seconds=timeout_seconds,
    )

    form_records: list[dict[str, Any]] = []
    for form_id in forms:
        print(f"[phase325] recording {form_id} in {_repo_relative(run_dir / form_id)}")
        form_records.append(
            _record_form(
                form_id=form_id,
                run_id=run_id,
                form_dir=run_dir / form_id,
                godot=godot,
                ffmpeg=ffmpeg,
                ffprobe=ffprobe,
                timeout_seconds=timeout_seconds,
                subjects=subjects,
                isolated_bundle=isolated_bundle,
            )
        )

    if isolated_bundle is not None:
        final_bundle = _validate_isolated_pet_root(
            Path(isolated_bundle["rootAbsolute"]),
            form_id=forms[0],
        )
        if final_bundle["bundleSha256"] != isolated_bundle["bundleSha256"]:
            raise ReviewRecordingError("隔离宠物包在录制期间发生漂移")

    all_indexed_files = [
        _artifact_record(path)
        for path in sorted(run_dir.rglob("*"), key=lambda value: value.as_posix())
        if path.is_file() and path.name != "evidence-index.json"
    ]
    index = {
        "schemaVersion": INDEX_SCHEMA_VERSION,
        "indexType": INDEX_TYPE,
        "runId": run_id,
        "status": "passed",
        "generatedAtUtc": _utc_now().isoformat().replace("+00:00", "Z"),
        "scene": REVIEW_SCENE,
        "formIds": list(forms),
        "subjects": list(subjects),
        "expected": {
            "subjects": list(subjects),
            "parityFramesPerForm": _expected_parity_frames(subjects),
            "width": EXPECTED_WIDTH,
            "height": EXPECTED_HEIGHT,
            "fps": float(EXPECTED_FPS),
            "sceneDurationSeconds": EXPECTED_SCENE_DURATION_SECONDS,
            "encodedDurationSeconds": float(EXPECTED_VIDEO_DURATION_SECONDS),
            "encodedFrameCount": EXPECTED_FRAME_COUNT,
        },
        "tools": {
            "godot": _capture_version(godot, ["--version"]),
            "ffmpeg": _capture_version(ffmpeg, ["-version"]),
            "ffprobe": _capture_version(ffprobe, ["-version"]),
            "python": sys.version.splitlines()[0],
        },
        "importLog": _artifact_record(import_log),
        "forms": form_records,
        "files": all_indexed_files,
        "indexedFileCount": len(all_indexed_files),
        "indexSelfHashExcluded": True,
    }
    index_path = run_dir / "evidence-index.json"
    _write_json(index_path, index)
    print(
        json.dumps(
            {
                "status": "passed",
                "runId": run_id,
                "forms": len(form_records),
                "subjects": list(subjects),
                "indexedFiles": len(all_indexed_files),
                "evidenceIndex": _repo_relative(index_path),
            },
            ensure_ascii=False,
        )
    )
    return index_path


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="录制并冻结 Godot 人物/宠物/整体骑乘真八方向候选证据。"
    )
    parser.add_argument(
        "--form-id",
        action="append",
        dest="form_ids",
        help="要录制的 formId；可重复。省略时录制当前 7 套完整世界包。",
    )
    parser.add_argument(
        "--subjects",
        help=(
            "验收主体：pet 或 character,pet,mounted。"
            "省略时保持旧版三主体 120 帧流程。"
        ),
    )
    parser.add_argument(
        "--pet-root",
        type=Path,
        help=(
            "仅用于 --subjects pet 且单一 --form-id："
            "仓库 .run/ 内的 runtimeEnabled=false 隔离非骑乘宠物包。"
        ),
    )
    parser.add_argument("--run-id", help="可选的唯一安全 runId；省略时自动生成。")
    parser.add_argument(
        "--output-root",
        type=Path,
        default=DEFAULT_OUTPUT_ROOT,
        help=f"repo-relative 候选根目录（默认：{DEFAULT_OUTPUT_ROOT.as_posix()}）。",
    )
    parser.add_argument("--godot", default=os.environ.get("GODOT_BIN", "godot"))
    parser.add_argument("--ffmpeg", default=os.environ.get("FFMPEG_BIN", "ffmpeg"))
    parser.add_argument("--ffprobe", default=os.environ.get("FFPROBE_BIN", "ffprobe"))
    parser.add_argument(
        "--timeout-seconds",
        type=float,
        default=300.0,
        help="每个外部步骤的超时秒数（默认：300）。",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        _record(args)
    except (ReviewRecordingError, FileExistsError, OSError) as error:
        print(f"world direction review recording failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
