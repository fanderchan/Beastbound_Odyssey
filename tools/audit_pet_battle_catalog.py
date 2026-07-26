#!/usr/bin/env python3
"""Read-only completeness audit for every standalone pet battle-art bundle.

The catalog is the source of truth for formal form IDs and asset roots.  This
tool never imports, generates, repairs, or installs art; it only reports whether
the checked-in runtime bundle satisfies the shared two-view/12-action contract.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any

from PIL import Image, UnidentifiedImageError

from build_pet_art_bundle import (
    PREMULTIPLIED_LANCZOS,
    PREMULTIPLIED_RESAMPLE_MODES,
    derive_runtime_frame,
    rgba_hash,
)
from install_pet_battle_bundle import (
    ACTION_SPECS,
    BattleBundleError,
    CANONICAL_BATTLE_VIEW_MAPPING,
    FORMAL_VIEWS,
    RUNTIME_FRAME_SIZE,
    SOURCE_FRAME_SIZE,
    validate_down_revive_continuity,
)


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CATALOG = Path("client/godot/data/pet_art_catalog.json")


def _read_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"无法读取 JSON：{path}: {exc}") from exc
    if not isinstance(value, dict):
        raise RuntimeError(f"JSON 顶层必须是对象：{path}")
    return value


def _audit_frame(path: Path, errors: list[str]) -> bool:
    if not path.is_file():
        errors.append(f"缺少帧：{path}")
        return False
    try:
        with Image.open(path) as image:
            image.load()
            if image.size != (RUNTIME_FRAME_SIZE, RUNTIME_FRAME_SIZE):
                errors.append(
                    f"帧尺寸错误：{path}={image.width}x{image.height}，"
                    f"应为 {RUNTIME_FRAME_SIZE}x{RUNTIME_FRAME_SIZE}"
                )
                return False
            if "A" not in image.getbands() and image.mode != "P":
                errors.append(f"帧缺少透明通道：{path} mode={image.mode}")
                return False
    except (OSError, UnidentifiedImageError) as exc:
        errors.append(f"帧不可解码：{path}: {exc}")
        return False
    return True


def _audit_mapping(metadata: dict[str, Any], errors: list[str]) -> None:
    direct = metadata.get("battleViewMapping")
    nested_visual = metadata.get("battleVisual")
    nested = nested_visual.get("battleViewMapping") if isinstance(nested_visual, dict) else None
    if direct != CANONICAL_BATTLE_VIEW_MAPPING:
        errors.append("battleViewMapping 不是双方朝向战场中心的统一契约")
    if nested != CANONICAL_BATTLE_VIEW_MAPPING:
        errors.append("battleVisual.battleViewMapping 缺失或不是统一契约")


def _load_rgba_frame(
    path: Path,
    size: int,
    label: str,
    errors: list[str],
) -> Image.Image | None:
    if not path.is_file():
        errors.append(f"缺少{label}：{path}")
        return None
    try:
        with Image.open(path) as opened:
            opened.load()
            if opened.format != "PNG" or opened.mode != "RGBA":
                errors.append(
                    f"{label}必须是显式 RGBA PNG：{path} "
                    f"format={opened.format} mode={opened.mode}"
                )
                return None
            if opened.size != (size, size):
                errors.append(
                    f"{label}尺寸错误：{path}={opened.width}x{opened.height}，"
                    f"应为 {size}x{size}"
                )
                return None
            return opened.copy()
    except (OSError, UnidentifiedImageError) as exc:
        errors.append(f"{label}不可解码：{path}: {exc}")
        return None


def _parse_key(value: Any) -> tuple[int, int, int] | None:
    if not isinstance(value, str):
        return None
    text = value.strip().lstrip("#")
    if not re.fullmatch(r"[0-9A-Fa-f]{6}", text):
        return None
    return tuple(int(text[index : index + 2], 16) for index in (0, 2, 4))


def _safe_asset_path(asset_root: Path, value: Any) -> Path | None:
    if not isinstance(value, str) or not value.strip():
        return None
    relative = Path(value)
    if relative.is_absolute() or ".." in relative.parts:
        return None
    candidate = (asset_root / relative).resolve()
    try:
        candidate.relative_to(asset_root.resolve())
    except ValueError:
        return None
    return candidate


def _audit_tracked_source_derivation(
    asset_root: Path,
    metadata: dict[str, Any],
    errors: list[str],
) -> tuple[int, int]:
    battle_visual = metadata.get("battleVisual")
    if not isinstance(battle_visual, dict):
        return 0, 0
    archive_mode = battle_visual.get("archiveMode")
    tracks_source = battle_visual.get("sourceFramesTracked") is True
    if archive_mode == "full" and not tracks_source:
        errors.append("battleVisual.archiveMode=full 时 sourceFramesTracked 必须为 true")
        return 0, 0
    if tracks_source and archive_mode != "full":
        errors.append("sourceFramesTracked=true 时 battleVisual.archiveMode 必须为 full")
        return 0, 0
    if not tracks_source:
        return 0, 0

    ledger_path = _safe_asset_path(asset_root, battle_visual.get("sourceLedger"))
    if ledger_path is None:
        errors.append("完整源归档缺少安全的 battleVisual.sourceLedger 路径")
        return 0, 0
    try:
        ledger = _read_json(ledger_path)
    except RuntimeError as exc:
        errors.append(str(exc))
        return 0, 0
    if ledger.get("archiveMode") != "full":
        errors.append("完整源归档的 source ledger archiveMode 必须为 full")
    if ledger.get("formId") != metadata.get("formId"):
        errors.append("完整源归档的 source ledger formId 与 metadata 不一致")
    ledger_actions = ledger.get("actions")
    if not isinstance(ledger_actions, dict):
        errors.append("完整源归档的 source ledger actions 缺失")
        return 0, 0

    tracked_count = 0
    derived_count = 0
    source_continuity: dict[str, dict[str, list[Image.Image]]] = {
        view: {"down": [], "revive": []} for view in FORMAL_VIEWS
    }
    for view in FORMAL_VIEWS:
        view_ledger = ledger_actions.get(view)
        if not isinstance(view_ledger, dict):
            errors.append(f"完整源归档账本缺少视角：{view}")
            continue
        for action, (frame_count, _fps, _loop) in ACTION_SPECS.items():
            action_ledger = view_ledger.get(action)
            if not isinstance(action_ledger, dict):
                errors.append(f"完整源归档账本缺少动作：{view}/{action}")
                continue
            if action_ledger.get("sourceFramesTracked") is not True:
                errors.append(f"完整源归档账本未标记 512 母版受追踪：{view}/{action}")
            source_hashes = action_ledger.get("sourceFrameRgbaSha256")
            runtime_hashes = action_ledger.get("runtimeFrameRgbaSha256")
            if (
                not isinstance(source_hashes, list)
                or len(source_hashes) != frame_count
                or not isinstance(runtime_hashes, list)
                or len(runtime_hashes) != frame_count
            ):
                errors.append(f"完整源归档账本逐帧哈希数量错误：{view}/{action}")
                continue

            pipeline_path = (
                asset_root
                / "source"
                / "battle"
                / view
                / action
                / "pipeline-meta.json"
            )
            try:
                pipeline = _read_json(pipeline_path)
            except RuntimeError as exc:
                errors.append(str(exc))
                continue
            frame_metadata = pipeline.get("frames")
            key = _parse_key(pipeline.get("key"))
            residual = pipeline.get("residualMagentaDistance")
            fringe = pipeline.get("fringeCleanupAlpha")
            if (
                not isinstance(frame_metadata, list)
                or len(frame_metadata) != frame_count
                or key is None
                or not isinstance(residual, (int, float))
                or not isinstance(fringe, int)
            ):
                errors.append(f"完整源归档 pipeline 合同错误：{view}/{action}")
                continue

            for index in range(1, frame_count + 1):
                source_path = (
                    asset_root
                    / "source"
                    / "battle"
                    / view
                    / action
                    / "source-frames"
                    / f"{action}-{index}.png"
                )
                runtime_path = (
                    asset_root
                    / "views"
                    / view
                    / action
                    / f"{action}-{index}.png"
                )
                source = _load_rgba_frame(
                    source_path,
                    SOURCE_FRAME_SIZE,
                    "512 母版帧",
                    errors,
                )
                runtime = _load_rgba_frame(
                    runtime_path,
                    RUNTIME_FRAME_SIZE,
                    "256 运行帧",
                    errors,
                )
                if source is None or runtime is None:
                    continue
                tracked_count += 1
                source_digest = rgba_hash(source)
                runtime_digest = rgba_hash(runtime)
                frame_record = frame_metadata[index - 1]
                if not isinstance(frame_record, dict):
                    errors.append(f"完整源归档逐帧 pipeline 记录错误：{view}/{action}-{index}")
                    continue
                if source_hashes[index - 1] != source_digest:
                    errors.append(f"512 母版帧与 source ledger 不一致：{view}/{action}-{index}")
                if runtime_hashes[index - 1] != runtime_digest:
                    errors.append(f"256 运行帧与 source ledger 不一致：{view}/{action}-{index}")
                if frame_record.get("sourceRgbaSha256") != source_digest:
                    errors.append(f"512 母版帧与 pipeline 不一致：{view}/{action}-{index}")
                if frame_record.get("runtimeRgbaSha256") != runtime_digest:
                    errors.append(f"256 运行帧与 pipeline 不一致：{view}/{action}-{index}")

                resample_mode = frame_record.get(
                    "runtimeResampleMode",
                    PREMULTIPLIED_LANCZOS,
                )
                if resample_mode not in PREMULTIPLIED_RESAMPLE_MODES:
                    errors.append(
                        f"完整源归档运行重采样模式不受支持："
                        f"{view}/{action}-{index}={resample_mode!r}"
                    )
                    continue
                derived, _cleaned = derive_runtime_frame(
                    source,
                    key,
                    float(residual),
                    fringe,
                    resample_mode=resample_mode,
                )
                if rgba_hash(derived) != runtime_digest:
                    errors.append(
                        "正式 256 运行帧不是已归档 512 母版的规范派生："
                        f"{view}/{action}-{index}"
                    )
                    continue
                derived_count += 1
                if (action == "down" and index == frame_count) or (
                    action == "revive" and index == 1
                ):
                    source_continuity[view][action].append(source)

    if all(
        source_continuity[view][action]
        for view in FORMAL_VIEWS
        for action in ("down", "revive")
    ):
        try:
            validate_down_revive_continuity(
                source_continuity,
                frame_kind="source",
            )
        except BattleBundleError as exc:
            errors.append(str(exc))
    return tracked_count, derived_count


def audit_form(repo_root: Path, form: dict[str, Any]) -> dict[str, Any]:
    form_id = str(form.get("formId", "")).strip()
    display_name = str(form.get("displayName", form_id)).strip()
    pet = form.get("pet")
    errors: list[str] = []
    if not form_id:
        return {
            "formId": "",
            "displayName": display_name,
            "complete": False,
            "battleFrameCount": 0,
            "errors": ["catalog formId 为空"],
        }
    if not isinstance(pet, dict) or not isinstance(pet.get("root"), str):
        return {
            "formId": form_id,
            "displayName": display_name,
            "complete": False,
            "battleFrameCount": 0,
            "errors": ["catalog pet.root 缺失"],
        }

    asset_root = repo_root / pet["root"]
    metadata_path_raw = pet.get("metadataPath")
    metadata_path = (
        repo_root / metadata_path_raw
        if isinstance(metadata_path_raw, str) and metadata_path_raw
        else asset_root / "action-bundle-meta.json"
    )
    metadata: dict[str, Any] = {}
    if not metadata_path.is_file():
        errors.append(f"缺少 metadata：{metadata_path}")
    else:
        try:
            metadata = _read_json(metadata_path)
        except RuntimeError as exc:
            errors.append(str(exc))

    if metadata:
        if metadata.get("formId") != form_id:
            errors.append(
                f"metadata formId 不匹配：{metadata.get('formId')!r} != {form_id!r}"
            )
        _audit_mapping(metadata, errors)
    tracked_source_count, canonical_derived_count = _audit_tracked_source_derivation(
        asset_root,
        metadata,
        errors,
    )

    valid_frames = 0
    view_counts: dict[str, int] = {}
    action_counts: dict[str, int] = {action: 0 for action in ACTION_SPECS}
    continuity_images: dict[str, dict[str, list[Image.Image]]] = {
        view: {"down": [], "revive": []} for view in FORMAL_VIEWS
    }
    for view in FORMAL_VIEWS:
        view_count = 0
        for action, (frame_count, _fps, _loop) in ACTION_SPECS.items():
            for index in range(1, frame_count + 1):
                frame_path = asset_root / "views" / view / action / f"{action}-{index}.png"
                if _audit_frame(frame_path, errors):
                    valid_frames += 1
                    view_count += 1
                    action_counts[action] += 1
                    if (action == "down" and index == frame_count) or (
                        action == "revive" and index == 1
                    ):
                        with Image.open(frame_path) as image:
                            continuity_images[view][action].append(
                                image.convert("RGBA").copy()
                            )
        view_counts[view] = view_count

    if all(
        continuity_images[view][action]
        for view in FORMAL_VIEWS
        for action in ("down", "revive")
    ):
        try:
            validate_down_revive_continuity(
                continuity_images,
                frame_kind="runtime",
            )
        except BattleBundleError as exc:
            errors.append(str(exc))

    expected_per_view = sum(spec[0] for spec in ACTION_SPECS.values())
    expected_total = expected_per_view * len(FORMAL_VIEWS)
    if valid_frames != expected_total:
        errors.append(f"正式可读帧不足：{valid_frames}/{expected_total}")

    return {
        "formId": form_id,
        "displayName": display_name,
        "assetRoot": str(asset_root.relative_to(repo_root)),
        "complete": not errors,
        "battleFrameCount": valid_frames,
        "expectedBattleFrameCount": expected_total,
        "trackedSourceFrameCount": tracked_source_count,
        "canonicalDerivedRuntimeFrameCount": canonical_derived_count,
        "viewFrameCounts": view_counts,
        "actionFrameCounts": action_counts,
        "errors": errors,
    }


def audit_catalog(repo_root: Path, catalog_path: Path, selected: set[str]) -> dict[str, Any]:
    catalog = _read_json(catalog_path)
    forms = catalog.get("forms")
    if not isinstance(forms, list):
        raise RuntimeError(f"catalog.forms 必须是数组：{catalog_path}")
    audited = [
        audit_form(repo_root, form)
        for form in forms
        if isinstance(form, dict) and (not selected or form.get("formId") in selected)
    ]
    seen = {entry["formId"] for entry in audited}
    missing_selected = sorted(selected - seen)
    if missing_selected:
        raise RuntimeError(f"catalog 不存在所选 formId：{', '.join(missing_selected)}")
    complete_count = sum(1 for entry in audited if entry["complete"])
    return {
        "schemaVersion": 1,
        "catalog": str(catalog_path.relative_to(repo_root)),
        "formCount": len(audited),
        "completeCount": complete_count,
        "incompleteCount": len(audited) - complete_count,
        "complete": complete_count == len(audited),
        "forms": audited,
    }


def _markdown(report: dict[str, Any]) -> str:
    lines = [
        f"战宠动画完成度：{report['completeCount']}/{report['formCount']}",
        "",
        "| 形态 | 战斗帧 | 状态 | 首要缺口 |",
        "|---|---:|---|---|",
    ]
    for entry in report["forms"]:
        status = "通过" if entry["complete"] else "未完成"
        first_error = entry["errors"][0] if entry["errors"] else "-"
        lines.append(
            f"| {entry['displayName']} (`{entry['formId']}`) | "
            f"{entry['battleFrameCount']}/{entry['expectedBattleFrameCount']} | "
            f"{status} | {first_error} |"
        )
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-root", type=Path, default=REPO_ROOT)
    parser.add_argument("--catalog", type=Path, default=DEFAULT_CATALOG)
    parser.add_argument("--form", action="append", default=[])
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--require-complete", action="store_true")
    args = parser.parse_args()

    repo_root = args.repo_root.resolve()
    catalog_path = args.catalog if args.catalog.is_absolute() else repo_root / args.catalog
    try:
        report = audit_catalog(repo_root, catalog_path.resolve(), set(args.form))
    except RuntimeError as exc:
        parser.error(str(exc))
    print(json.dumps(report, ensure_ascii=False, indent=2) if args.json else _markdown(report))
    return 1 if args.require_complete and not report["complete"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
