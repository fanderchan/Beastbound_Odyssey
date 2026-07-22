#!/usr/bin/env python3
"""Capture immutable real-Main NPC world + dialogue portrait evidence.

The recorder launches the normal ``res://scenes/Main.tscn`` path once for each
appearance in the selected frozen target batch.  The original eight-role batch
remains the default; ``remaining7`` selects the second Firebud production batch.
The Godot helper opens the mapped NPC's real interaction dialog, captures a
1280x720 viewport, and freezes both source-file and actually-loaded RGBA hashes.
A failed or partial run deliberately receives no ``evidence-index.json``.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shlex
import shutil
import subprocess
import sys
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Sequence

from PIL import Image, UnidentifiedImageError
import PIL


REPO_ROOT = Path(__file__).resolve().parents[1]
GODOT_PROJECT = REPO_ROOT / "client" / "godot"
MAIN_SCENE = "res://scenes/Main.tscn"
DEFAULT_OUTPUT_ROOT = Path(
    ".run/evidence/phase327_npc_archetype_art/main-review-candidate"
)

INDEX_SCHEMA_VERSION = 1
INDEX_TYPE = "beastbound_npc_main_review_evidence"
REPORT_SCHEMA_VERSION = 1
REPORT_TYPE = "beastbound_npc_main_review_capture"
EXPECTED_WIDTH = 1280
EXPECTED_HEIGHT = 720
WORLD_DIRECTIONS: tuple[str, ...] = (
    "south",
    "southwest",
    "west",
    "northwest",
    "north",
    "northeast",
    "east",
    "southeast",
)
PORTRAIT_STATES: tuple[str, ...] = (
    "neutral",
    "speaking",
    "smile",
    "concerned",
)
EXPECTED_FRAME_COUNT = len(WORLD_DIRECTIONS) + len(PORTRAIT_STATES)
FRAME_FIELDS = frozenset(
    {
        "kind",
        "slot",
        "path",
        "fileSha256",
        "sourceFullDecodedRgbaSha256",
        "sourceDecodedRgbaSha256",
        "loadedDecodedRgbaSha256",
        "sourceLoadedRgbaMatch",
        "importFresh",
        "loadMode",
        "canonicalRgbaMatch",
        "status",
        "errors",
    }
)
SAFE_ID = re.compile(r"^[a-z0-9][a-z0-9_]{0,127}$")
SAFE_RUN_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")
LOWER_SHA256 = re.compile(r"^[0-9a-f]{64}$")

DEFAULT_TARGET_BATCH = "first8"
REMAINING_TARGET_BATCH = "remaining7"

TARGETS: tuple[dict[str, str], ...] = (
    {
        "roleId": "stable_keeper",
        "appearanceId": "npc_stable_keeper_m_v1",
        "mapId": "firebud_village_gate",
        "spawnName": "doctor_record",
        "npcId": "firebud_stable_keeper",
        "facing": "southeast",
        "portraitState": "speaking",
    },
    {
        "roleId": "bank_keeper",
        "appearanceId": "npc_bank_keeper_f_v1",
        "mapId": "firebud_village_gate",
        "spawnName": "doctor_record",
        "npcId": "firebud_bank_keeper",
        "facing": "northwest",
        "portraitState": "speaking",
    },
    {
        "roleId": "item_shopkeeper",
        "appearanceId": "npc_item_shopkeeper_f_v1",
        "mapId": "firebud_village_gate",
        "spawnName": "doctor_record",
        "npcId": "firebud_shopkeeper",
        "facing": "south",
        "portraitState": "speaking",
    },
    {
        "roleId": "manor_steward",
        "appearanceId": "npc_manor_steward_m_v1",
        "mapId": "firebud_manor",
        "spawnName": "default",
        "npcId": "firebud_manor_steward",
        "facing": "northwest",
        "portraitState": "speaking",
    },
    {
        "roleId": "village_guard",
        "appearanceId": "npc_village_guard_m_v1",
        "mapId": "firebud_village_gate",
        "spawnName": "doctor_record",
        "npcId": "village_guard",
        "facing": "southwest",
        "portraitState": "speaking",
    },
    {
        "roleId": "village_healer",
        "appearanceId": "npc_village_healer_f_v1",
        "mapId": "firebud_village_gate",
        "spawnName": "doctor_record",
        "npcId": "firebud_doctor",
        "facing": "south",
        "portraitState": "speaking",
    },
    {
        "roleId": "equipment_artisan",
        "appearanceId": "npc_equipment_artisan_m_v1",
        "mapId": "firebud_village_gate",
        "spawnName": "doctor_record",
        "npcId": "firebud_equipment_keeper",
        "facing": "southeast",
        "portraitState": "speaking",
    },
    {
        "roleId": "riding_trainer",
        "appearanceId": "npc_riding_trainer_f_v1",
        "mapId": "firebud_village_gate",
        "spawnName": "doctor_record",
        "npcId": "firebud_riding_trainer",
        "facing": "southeast",
        "portraitState": "speaking",
    },
)

REMAINING7_TARGETS: tuple[dict[str, str], ...] = (
    {
        "roleId": "player_rebirth_mentor",
        "appearanceId": "npc_player_rebirth_mentor_f_v1",
        "mapId": "firebud_village_gate",
        "spawnName": "doctor_record",
        "npcId": "firebud_rebirth_mentor",
        "facing": "southwest",
        "portraitState": "speaking",
    },
    {
        "roleId": "pet_mm_trial_mentor",
        "appearanceId": "npc_pet_mm_trial_mentor_m_v1",
        "mapId": "firebud_village_gate",
        "spawnName": "doctor_record",
        "npcId": "firebud_pet_mm_trial_mentor",
        "facing": "southwest",
        "portraitState": "speaking",
    },
    {
        "roleId": "pet_mm_stage2_keeper",
        "appearanceId": "npc_pet_mm_stage2_keeper_f_v1",
        "mapId": "firebud_village_gate",
        "spawnName": "doctor_record",
        "npcId": "firebud_pet_mm_stage2_keeper",
        "facing": "northwest",
        "portraitState": "speaking",
    },
    {
        "roleId": "diamond_merchant",
        "appearanceId": "npc_diamond_merchant_m_v1",
        "mapId": "firebud_village_gate",
        "spawnName": "doctor_record",
        "npcId": "firebud_diamond_keeper",
        "facing": "southeast",
        "portraitState": "speaking",
    },
    {
        "roleId": "pet_skill_trainer",
        "appearanceId": "npc_pet_skill_trainer_m_v1",
        "mapId": "firebud_village_gate",
        "spawnName": "doctor_record",
        "npcId": "firebud_pet_skill_trainer",
        "facing": "southeast",
        "portraitState": "speaking",
    },
    {
        "roleId": "welfare_clerk",
        "appearanceId": "npc_welfare_clerk_f_v1",
        "mapId": "firebud_village_gate",
        "spawnName": "doctor_record",
        "npcId": "firebud_welfare_clerk",
        "facing": "southeast",
        "portraitState": "speaking",
    },
    {
        "roleId": "storyteller",
        "appearanceId": "npc_storyteller_m_v1",
        "mapId": "firebud_village_gate",
        "spawnName": "doctor_record",
        "npcId": "firebud_storyteller",
        "facing": "northwest",
        "portraitState": "speaking",
    },
)

TARGET_BATCHES: dict[str, tuple[dict[str, str], ...]] = {
    DEFAULT_TARGET_BATCH: TARGETS,
    REMAINING_TARGET_BATCH: REMAINING7_TARGETS,
}
EXPECTED_TARGET_BATCH_COUNTS: dict[str, int] = {
    DEFAULT_TARGET_BATCH: 8,
    REMAINING_TARGET_BATCH: 7,
}
TARGET_BATCH_CAPTURE_MODES: dict[str, dict[str, bool]] = {
    DEFAULT_TARGET_BATCH: {
        "qaPreview": False,
        "normalPlayerRuntimeEnabled": True,
    },
    REMAINING_TARGET_BATCH: {
        "qaPreview": True,
        "normalPlayerRuntimeEnabled": False,
    },
}


class NpcMainReviewError(RuntimeError):
    """A fail-closed capture or evidence-contract failure."""


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _new_run_id() -> str:
    timestamp = _utc_now().strftime("%Y%m%dT%H%M%S.%fZ")
    return f"phase327-main-{timestamp}-{uuid.uuid4().hex[:8]}"


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _decoded_rgba_sha256(path: Path) -> str:
    try:
        with Image.open(path) as source:
            rgba = source.convert("RGBA")
            header = f"{rgba.width}x{rgba.height}:RGBA\n".encode("utf-8")
            return hashlib.sha256(header + rgba.tobytes()).hexdigest()
    except (OSError, UnidentifiedImageError) as error:
        raise NpcMainReviewError(f"PNG 无法解码：{path}: {error}") from error


def _canonical_source_rgba_sha256(path: Path) -> str:
    """Match WorldReviewFrameParity's import-safe canonical RGBA hash."""
    try:
        with Image.open(path) as source:
            rgba = source.convert("RGBA")
            pixels = bytearray(rgba.tobytes())
            for offset in range(0, len(pixels), 4):
                if pixels[offset + 3] < 255:
                    pixels[offset] = 0
                    pixels[offset + 1] = 0
                    pixels[offset + 2] = 0
            header = f"{rgba.width}x{rgba.height}:RGBA\n".encode("utf-8")
            return hashlib.sha256(header + pixels).hexdigest()
    except (OSError, UnidentifiedImageError) as error:
        raise NpcMainReviewError(f"PNG 无法解码：{path}: {error}") from error


def _repo_relative(path: Path) -> str:
    resolved = path.resolve(strict=False)
    try:
        return resolved.relative_to(REPO_ROOT).as_posix()
    except ValueError as error:
        raise NpcMainReviewError(f"证据路径越出仓库根目录：{path}") from error


def _resolve_repo_output(path: Path) -> Path:
    resolved = (
        path.resolve(strict=False)
        if path.is_absolute()
        else (REPO_ROOT / path).resolve(strict=False)
    )
    _repo_relative(resolved)
    return resolved


def _artifact_record(path: Path) -> dict[str, Any]:
    if not path.is_file():
        raise NpcMainReviewError(f"证据文件不存在：{_repo_relative(path)}")
    size = path.stat().st_size
    if size <= 0:
        raise NpcMainReviewError(f"证据文件为空：{_repo_relative(path)}")
    return {
        "path": _repo_relative(path),
        "absolutePath": str(path.resolve()),
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
        raise NpcMainReviewError(f"无法读取 {label}：{path}: {error}") from error
    if not isinstance(value, dict):
        raise NpcMainReviewError(f"{label} 根节点必须是对象：{path}")
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
            raise NpcMainReviewError(
                f"命令超时（{timeout_seconds:.1f}s），详见 {_repo_relative(log_path)}"
            ) from error
    if completed.returncode != 0:
        raise NpcMainReviewError(
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
        raise NpcMainReviewError(
            f"无法读取工具版本：{executable} {' '.join(arguments)}"
        )
    output = (completed.stdout or completed.stderr).strip()
    return output.splitlines()[0] if output else "unknown"


def _source_set_sha256(sources: Sequence[dict[str, Any]]) -> str:
    lines = (
        f"{source.get('kind', '')}\t{source.get('slot', '')}\t"
        f"{source.get('path', '')}\t{source.get('fileSha256', '')}\t"
        f"{source.get('sourceFullDecodedRgbaSha256', '')}\t"
        f"{source.get('sourceDecodedRgbaSha256', '')}\n"
        for source in sources
    )
    return hashlib.sha256("".join(lines).encode("utf-8")).hexdigest()


def _expected_frame_specs(target: dict[str, str]) -> tuple[tuple[str, str, str], ...]:
    appearance_id = target["appearanceId"]
    world = tuple(
        (
            "world",
            direction,
            f"res://assets/npcs/{appearance_id}/world/directions/"
            f"{direction}/idle/idle-1.png",
        )
        for direction in WORLD_DIRECTIONS
    )
    portraits = tuple(
        (
            "portrait",
            state,
            f"res://assets/npcs/{appearance_id}/portrait/{state}.png",
        )
        for state in PORTRAIT_STATES
    )
    return world + portraits


def _res_path_to_file(value: str) -> Path:
    if not value.startswith("res://"):
        raise NpcMainReviewError(f"不是 res:// 路径：{value!r}")
    relative = value.removeprefix("res://")
    if not relative or "\\" in relative:
        raise NpcMainReviewError(f"不安全的 res:// 路径：{value!r}")
    parts = Path(relative).parts
    if any(part in ("", ".", "..") for part in parts):
        raise NpcMainReviewError(f"不安全的 res:// 路径：{value!r}")
    result = (GODOT_PROJECT / relative).resolve(strict=False)
    try:
        result.relative_to(GODOT_PROJECT.resolve())
    except ValueError as error:
        raise NpcMainReviewError(f"res:// 路径越出 Godot 项目：{value!r}") from error
    return result


def _validate_screenshot(path: Path) -> tuple[int, int, str]:
    try:
        with Image.open(path) as source:
            rgba = source.convert("RGBA")
            width, height = rgba.size
            if (width, height) != (EXPECTED_WIDTH, EXPECTED_HEIGHT):
                raise NpcMainReviewError(
                    f"Main 截图必须为 1280x720，实际 {width}x{height}"
                )
            extrema = rgba.getextrema()
            rgb_range = sum(high - low for low, high in extrema[:3])
            if rgb_range < 96:
                raise NpcMainReviewError("Main 截图近似单色，不能作为视觉证据")
    except (OSError, UnidentifiedImageError) as error:
        raise NpcMainReviewError(f"Main 截图无法解码：{path}: {error}") from error
    return width, height, _decoded_rgba_sha256(path)


def _validate_capture_report(
    report_path: Path,
    *,
    target: dict[str, str],
    screenshot_path: Path,
    run_id: str,
    qa_preview: bool,
    normal_player_runtime_enabled: bool,
) -> dict[str, Any]:
    report = _read_json(report_path, label="NPC Main capture report")
    errors: list[str] = []
    exact_fields: dict[str, Any] = {
        "schemaVersion": REPORT_SCHEMA_VERSION,
        "reportType": REPORT_TYPE,
        "processKind": "main_capture",
        "runId": run_id,
        "status": "passed",
        "ok": True,
        "scene": MAIN_SCENE,
        "qaPreview": qa_preview,
        "normalPlayerRuntimeEnabled": normal_player_runtime_enabled,
        "debugBuild": True,
        "runtimeMirroring": False,
        "defaultProfileIsolation": True,
        "profileIsolation": "default_profile_ephemeral_no_save",
        "authAutoBypass": False,
        "accountAuthenticated": False,
        "profileSaveEnabled": False,
        "serverAccountSession": False,
        "appearanceId": target["appearanceId"],
        "mapId": target["mapId"],
        "spawnName": target["spawnName"],
        "npcId": target["npcId"],
        "facing": target["facing"],
        "portraitState": target["portraitState"],
        "worldVisible": True,
        "portraitVisible": True,
        "dialogVisible": True,
        "dialogButtonsInBounds": True,
        "debugUiVisible": False,
        "normalPlayerUi": True,
        "qaDebugControlsVisible": False,
        "qaPanelVisible": False,
        "authPanelVisible": False,
        "viewportSize": [EXPECTED_WIDTH, EXPECTED_HEIGHT],
        "checkedFrames": EXPECTED_FRAME_COUNT,
        "passedFrames": EXPECTED_FRAME_COUNT,
        "screenshotPath": str(screenshot_path.resolve()),
        "errors": [],
    }
    for field, expected in exact_fields.items():
        if report.get(field) != expected:
            errors.append(f"{field}={report.get(field)!r}，期望 {expected!r}")
    display_server = report.get("displayServer")
    if not isinstance(display_server, str) or not display_server or display_server.lower() == "headless":
        errors.append(f"displayServer={display_server!r} 不是可见 Main 渲染")
    visual_observation = report.get("visualObservation")
    if not isinstance(visual_observation, str) or not visual_observation.strip():
        errors.append("visualObservation 不能为空")
    visible_button_count = report.get("dialogVisibleButtonCount")
    if type(visible_button_count) is not int or visible_button_count < 2:
        errors.append(
            f"dialogVisibleButtonCount={visible_button_count!r}，期望至少 2"
        )

    frames = report.get("frames")
    typed_frames: list[dict[str, Any]] = []
    if not isinstance(frames, list) or len(frames) != EXPECTED_FRAME_COUNT:
        errors.append("frames 必须恰好包含规范 world8 + portrait4 共 12 项")
    else:
        typed_frames = [value for value in frames if isinstance(value, dict)]
        if len(typed_frames) != EXPECTED_FRAME_COUNT:
            errors.append("frames 存在非对象项")
    if report.get("sources") != frames:
        errors.append("sources 必须是完整 frames 的同值兼容别名")

    expected_frames = _expected_frame_specs(target)
    frame_by_key: dict[tuple[str, str], dict[str, Any]] = {}
    if len(typed_frames) == EXPECTED_FRAME_COUNT:
        for index, (kind, slot, expected_path) in enumerate(expected_frames):
            frame = typed_frames[index]
            label = f"frames[{index}]"
            if set(frame) != FRAME_FIELDS:
                errors.append(
                    f"{label} 字段集合不符合冻结合同："
                    f"{sorted(set(frame) ^ FRAME_FIELDS)!r}"
                )
            if frame.get("kind") != kind:
                errors.append(f"{label}.kind={frame.get('kind')!r}")
            if frame.get("slot") != slot:
                errors.append(f"{label}.slot={frame.get('slot')!r}")
            if frame.get("path") != expected_path:
                errors.append(f"{label}.path={frame.get('path')!r}")
                continue
            frame_by_key[(kind, slot)] = frame
            try:
                source_file = _res_path_to_file(expected_path)
                if not source_file.is_file():
                    errors.append(f"{label} 当前源 PNG 不存在")
                    continue
                actual_file_sha = _sha256(source_file)
                actual_full_rgba_sha = _decoded_rgba_sha256(source_file)
                actual_canonical_rgba_sha = _canonical_source_rgba_sha256(
                    source_file
                )
            except NpcMainReviewError as error:
                errors.append(f"{label}: {error}")
                continue
            if frame.get("fileSha256") != actual_file_sha:
                errors.append(f"{label}.fileSha256 与当前 PNG 不一致")
            if frame.get("sourceFullDecodedRgbaSha256") != actual_full_rgba_sha:
                errors.append(
                    f"{label}.sourceFullDecodedRgbaSha256 与当前完整 PNG 不一致"
                )
            if frame.get("sourceDecodedRgbaSha256") != actual_canonical_rgba_sha:
                errors.append(f"{label}.sourceDecodedRgbaSha256 与当前 canonical PNG 不一致")
            if frame.get("loadedDecodedRgbaSha256") != actual_canonical_rgba_sha:
                errors.append(f"{label}.loadedDecodedRgbaSha256 未证明 Godot parity")
            if frame.get("sourceLoadedRgbaMatch") is not True:
                errors.append(f"{label}.sourceLoadedRgbaMatch 不是 true")
            if frame.get("importFresh") is not True:
                errors.append(f"{label}.importFresh 不是 true")
            if frame.get("loadMode") != "godot_import":
                errors.append(f"{label}.loadMode 不是 godot_import")
            if frame.get("canonicalRgbaMatch") is not True:
                errors.append(f"{label}.canonicalRgbaMatch 不是 true")
            if frame.get("status") != "passed":
                errors.append(f"{label}.status 不是 passed")
            if frame.get("errors") != []:
                errors.append(f"{label}.errors 不是空数组")
            for field in (
                "fileSha256",
                "sourceFullDecodedRgbaSha256",
                "sourceDecodedRgbaSha256",
                "loadedDecodedRgbaSha256",
            ):
                value = frame.get(field)
                if not isinstance(value, str) or LOWER_SHA256.fullmatch(value) is None:
                    errors.append(f"{label}.{field} 不是小写 SHA-256")
        recomputed_source_set = _source_set_sha256(typed_frames)
        if report.get("sourceSetSha256") != recomputed_source_set:
            errors.append("sourceSetSha256 不能由当前 12 项 frames 重算")
        elif LOWER_SHA256.fullmatch(recomputed_source_set) is None:
            errors.append("sourceSetSha256 不是小写 SHA-256")

    world = report.get("world")
    portrait = report.get("portrait")
    selected_world = frame_by_key.get(("world", target["facing"]), {})
    selected_portrait = frame_by_key.get(("portrait", target["portraitState"]), {})
    if not isinstance(world, dict) or not selected_world or any(
        world.get(field) != selected_world.get(field)
        for field in (
            "path",
            "fileSha256",
            "sourceFullDecodedRgbaSha256",
            "sourceDecodedRgbaSha256",
            "loadedDecodedRgbaSha256",
        )
    ):
        errors.append("world 摘要没有绑定 frozen world source")
    if not isinstance(portrait, dict) or not selected_portrait or any(
        portrait.get(field) != selected_portrait.get(field)
        for field in (
            "path",
            "fileSha256",
            "sourceFullDecodedRgbaSha256",
            "sourceDecodedRgbaSha256",
            "loadedDecodedRgbaSha256",
        )
    ):
        errors.append("portrait 摘要没有绑定 frozen portrait source")
    elif portrait.get("state") != target["portraitState"]:
        errors.append("portrait.state 与请求状态不一致")

    dialog = report.get("dialog")
    if (
        not isinstance(dialog, dict)
        or dialog.get("npcId") != target["npcId"]
        or dialog.get("visible") is not True
        or not isinstance(dialog.get("name"), str)
        or not dialog.get("name")
    ):
        errors.append("dialog 没有绑定目标真实 NPC")

    screenshot = report.get("screenshot")
    expected_screenshot_path = str(screenshot_path.resolve())
    if not isinstance(screenshot, dict):
        errors.append("screenshot 不是对象")
    else:
        if screenshot.get("path") != expected_screenshot_path:
            errors.append("screenshot.path 与请求输出不一致")
        if not screenshot_path.is_file():
            errors.append("截图文件不存在")
        else:
            try:
                width, height, decoded_sha = _validate_screenshot(screenshot_path)
                file_sha = _sha256(screenshot_path)
            except NpcMainReviewError as error:
                errors.append(str(error))
            else:
                if screenshot.get("width") != width or screenshot.get("height") != height:
                    errors.append("screenshot 尺寸摘要不一致")
                if screenshot.get("fileSha256") != file_sha:
                    errors.append("screenshot.fileSha256 与当前 PNG 不一致")
                if report.get("screenshotSha256") != file_sha:
                    errors.append("screenshotSha256 与当前 PNG 不一致")
                if screenshot.get("decodedRgbaSha256") != decoded_sha:
                    errors.append("screenshot.decodedRgbaSha256 与当前 PNG 不一致")
    if errors:
        raise NpcMainReviewError(
            "NPC Main capture report 未通过：" + "；".join(errors)
        )
    return report


def _require_executable(value: str, *, label: str) -> str:
    resolved = shutil.which(value)
    if resolved is None:
        raise NpcMainReviewError(f"找不到 {label} 可执行文件：{value}")
    return resolved


def _targets_for_batch(batch: str) -> tuple[dict[str, str], ...]:
    targets = TARGET_BATCHES.get(batch)
    if targets is None:
        raise NpcMainReviewError(f"未知 Main NPC 取证批次：{batch!r}")
    return targets


def _capture_mode_for_batch(batch: str) -> dict[str, bool]:
    mode = TARGET_BATCH_CAPTURE_MODES.get(batch)
    if mode is None:
        raise NpcMainReviewError(f"未知 Main NPC 取证批次：{batch!r}")
    return dict(mode)


def _validate_target_batch(
    batch: str, targets: tuple[dict[str, str], ...]
) -> None:
    expected_count = EXPECTED_TARGET_BATCH_COUNTS.get(batch)
    if expected_count is None:
        raise NpcMainReviewError(f"未知 Main NPC 取证批次：{batch!r}")
    if len(targets) != expected_count:
        raise NpcMainReviewError(
            f"Main NPC {batch} 取证必须固定覆盖 {expected_count} 个岗位"
        )
    appearance_ids = [target["appearanceId"] for target in targets]
    npc_keys = [(target["mapId"], target["npcId"]) for target in targets]
    if (
        len(set(appearance_ids)) != expected_count
        or len(set(npc_keys)) != expected_count
    ):
        raise NpcMainReviewError(
            f"Main NPC {batch} 取证目标存在重复 appearance/npc 映射"
        )
    for target in targets:
        for field in (
            "roleId",
            "appearanceId",
            "mapId",
            "spawnName",
            "npcId",
            "facing",
            "portraitState",
        ):
            value = target.get(field)
            if not isinstance(value, str) or SAFE_ID.fullmatch(value) is None:
                raise NpcMainReviewError(f"固定目标 {field} 不安全：{value!r}")
        if target["facing"] not in WORLD_DIRECTIONS:
            raise NpcMainReviewError(
                f"固定目标 facing 不是规范八向：{target['facing']!r}"
            )
        if target["portraitState"] != "speaking":
            raise NpcMainReviewError("Main 真实 interaction 取证必须固定 speaking")


def _validate_fixed_targets() -> None:
    """Retain the original first-eight validation entry point for callers."""
    _validate_target_batch(DEFAULT_TARGET_BATCH, TARGETS)


def _validate_all_target_batches() -> None:
    for batch, targets in TARGET_BATCHES.items():
        _validate_target_batch(batch, targets)
    all_targets = tuple(
        target for targets in TARGET_BATCHES.values() for target in targets
    )
    appearance_ids = [target["appearanceId"] for target in all_targets]
    npc_keys = [(target["mapId"], target["npcId"]) for target in all_targets]
    if len(set(appearance_ids)) != len(all_targets) or len(set(npc_keys)) != len(
        all_targets
    ):
        raise NpcMainReviewError(
            "Main NPC 各取证批次之间存在重复 appearance/npc 映射"
        )
    if set(TARGET_BATCH_CAPTURE_MODES) != set(TARGET_BATCHES):
        raise NpcMainReviewError("Main NPC 取证批次缺少冻结 capture mode")
    for batch in TARGET_BATCHES:
        mode = _capture_mode_for_batch(batch)
        if set(mode) != {"qaPreview", "normalPlayerRuntimeEnabled"}:
            raise NpcMainReviewError(f"Main NPC {batch} capture mode 字段不完整")
        if mode["qaPreview"] == mode["normalPlayerRuntimeEnabled"]:
            raise NpcMainReviewError(
                f"Main NPC {batch} 必须且只能选择 QA preview 或正常运行资源"
            )


def _capture_target(
    *,
    target: dict[str, str],
    target_dir: Path,
    godot: str,
    timeout_seconds: float,
    run_id: str,
    qa_preview: bool,
    normal_player_runtime_enabled: bool,
) -> dict[str, Any]:
    target_dir.mkdir(parents=False, exist_ok=False)
    screenshot_path = (target_dir / "main-dialog-1280x720.png").resolve()
    report_path = (target_dir / "main-dialog-report.json").resolve()
    log_path = target_dir / "godot-main.log"
    with tempfile.TemporaryDirectory(
        prefix=f"beastbound-npc-main-{target['roleId']}-"
    ) as user_data_dir:
        command = _build_capture_command(
            godot=godot,
            user_data_dir=user_data_dir,
            target=target,
            run_id=run_id,
            screenshot_path=screenshot_path,
            report_path=report_path,
            qa_preview=qa_preview,
        )
        _run_logged(command, log_path=log_path, timeout_seconds=timeout_seconds)
    report = _validate_capture_report(
        report_path,
        target=target,
        screenshot_path=screenshot_path,
        run_id=run_id,
        qa_preview=qa_preview,
        normal_player_runtime_enabled=normal_player_runtime_enabled,
    )
    screenshot_record = _artifact_record(screenshot_path)
    return {
        "roleId": target["roleId"],
        "appearanceId": target["appearanceId"],
        "mapId": target["mapId"],
        "spawnName": target["spawnName"],
        "npcId": target["npcId"],
        "facing": target["facing"],
        "portraitState": target["portraitState"],
        "scene": MAIN_SCENE,
        "qaPreview": qa_preview,
        "normalPlayerRuntimeEnabled": normal_player_runtime_enabled,
        "defaultProfileIsolation": True,
        "profileIsolation": "default_profile_ephemeral_no_save",
        "debugUiVisible": False,
        "normalPlayerUi": True,
        "worldVisible": True,
        "portraitVisible": True,
        "screenshotPath": str(screenshot_path),
        "screenshotSha256": screenshot_record["sha256"],
        "checkedFrames": report["checkedFrames"],
        "passedFrames": report["passedFrames"],
        "sourceSetSha256": report["sourceSetSha256"],
        "world": report["world"],
        "portrait": report["portrait"],
        "screenshot": screenshot_record,
        "report": _artifact_record(report_path),
        "log": _artifact_record(log_path),
    }


def _build_capture_command(
    *,
    godot: str,
    user_data_dir: str,
    target: dict[str, str],
    run_id: str,
    screenshot_path: Path,
    report_path: Path,
    qa_preview: bool,
) -> list[str]:
    engine_args = [
        godot,
        "--path",
        str(GODOT_PROJECT),
        "--user-data-dir",
        user_data_dir,
        "--scene",
        MAIN_SCENE,
        "--",
    ]
    user_args = [
        "--qa-viewport=1280x720",
        "--npc-main-review-capture",
        f"--npc-main-review-appearance-id={target['appearanceId']}",
        f"--npc-main-review-map-id={target['mapId']}",
        f"--npc-main-review-spawn={target['spawnName']}",
        f"--npc-main-review-npc-id={target['npcId']}",
        f"--npc-main-review-portrait-state={target['portraitState']}",
        f"--npc-main-review-run-id={run_id}",
        f"--npc-main-review-output={screenshot_path}",
        f"--npc-main-review-report={report_path}",
    ]
    if qa_preview:
        user_args.insert(1, "--npc-art-review-preview")
    return engine_args + user_args


def _record(args: argparse.Namespace) -> Path:
    if Path.cwd().resolve() != REPO_ROOT:
        raise NpcMainReviewError(f"必须从仓库根执行：cd {REPO_ROOT}")
    if not GODOT_PROJECT.is_dir():
        raise NpcMainReviewError(f"Godot 项目不存在：{GODOT_PROJECT}")
    _validate_all_target_batches()
    target_batch = getattr(args, "batch", DEFAULT_TARGET_BATCH)
    targets = _targets_for_batch(target_batch)
    capture_mode = _capture_mode_for_batch(target_batch)
    run_id = args.run_id or _new_run_id()
    if SAFE_RUN_ID.fullmatch(run_id) is None:
        raise NpcMainReviewError(f"不安全的 runId：{run_id!r}")
    output_root = _resolve_repo_output(args.output_root)
    output_root.mkdir(parents=True, exist_ok=True)
    run_dir = output_root / run_id
    run_dir.mkdir(parents=False, exist_ok=False)
    godot = _require_executable(args.godot, label="Godot")
    timeout_seconds = float(args.timeout_seconds)
    if timeout_seconds <= 0:
        raise NpcMainReviewError("--timeout-seconds 必须大于 0")

    import_log = run_dir / "godot-import.log"
    _run_logged(
        [godot, "--headless", "--path", str(GODOT_PROJECT), "--import"],
        log_path=import_log,
        timeout_seconds=timeout_seconds,
    )
    captures: list[dict[str, Any]] = []
    for target in targets:
        print(
            f"[npc-main:{target_batch}] {target['mapId']}/{target['npcId']} -> "
            f"{target['appearanceId']}"
        )
        captures.append(
            _capture_target(
                target=target,
                target_dir=run_dir / target["appearanceId"],
                godot=godot,
                timeout_seconds=timeout_seconds,
                run_id=run_id,
                qa_preview=capture_mode["qaPreview"],
                normal_player_runtime_enabled=capture_mode[
                    "normalPlayerRuntimeEnabled"
                ],
            )
        )

    files = [
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
        "scene": MAIN_SCENE,
        "qaPreview": capture_mode["qaPreview"],
        "targetBatch": target_batch,
        "appearanceIds": [target["appearanceId"] for target in targets],
        "npcIds": [target["npcId"] for target in targets],
        "expected": {
            "captureCount": len(targets),
            "width": EXPECTED_WIDTH,
            "height": EXPECTED_HEIGHT,
            "framesPerCapture": EXPECTED_FRAME_COUNT,
            "worldVisible": True,
            "portraitVisible": True,
            "defaultProfileIsolation": True,
            "profileIsolation": "default_profile_ephemeral_no_save",
            "debugUiVisible": False,
            "normalPlayerUi": True,
            "normalPlayerRuntimeEnabled": capture_mode[
                "normalPlayerRuntimeEnabled"
            ],
        },
        "tools": {
            "godot": _capture_version(godot, ["--version"]),
            "pillow": PIL.__version__,
            "python": sys.version.splitlines()[0],
        },
        "importLog": _artifact_record(import_log),
        "captures": captures,
        "files": files,
        "indexedFileCount": len(files),
        "indexSelfHashExcluded": True,
        "ownerReviewStatus": "pending",
    }
    index_path = run_dir / "evidence-index.json"
    _write_json(index_path, index)
    print(
        json.dumps(
            {
                "status": "passed",
                "runId": run_id,
                "scene": MAIN_SCENE,
                "captures": len(captures),
                "evidenceIndex": _repo_relative(index_path),
            },
            ensure_ascii=False,
        )
    )
    return index_path


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="在真实 Main.tscn 中录制所选固定批次的 NPC 世界像和对话人像。"
    )
    parser.add_argument(
        "--batch",
        choices=tuple(TARGET_BATCHES),
        default=DEFAULT_TARGET_BATCH,
        help="固定目标批次；默认 first8 保留原首批 8 类行为。",
    )
    parser.add_argument(
        "--output-root",
        type=Path,
        default=DEFAULT_OUTPUT_ROOT,
        help="仓库内 immutable 候选证据根目录。",
    )
    parser.add_argument("--run-id", help="可选的安全唯一运行 ID。")
    parser.add_argument("--godot", default="godot", help="Godot 可执行文件。")
    parser.add_argument(
        "--timeout-seconds",
        type=float,
        default=180.0,
        help="每个 Godot 进程的超时秒数。",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    try:
        _record(_parser().parse_args(argv))
    except (NpcMainReviewError, FileExistsError, OSError) as error:
        print(f"npc Main review capture failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
