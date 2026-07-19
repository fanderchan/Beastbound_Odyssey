#!/usr/bin/env python3
"""Read-only completeness audit for every standalone pet battle-art bundle.

The catalog is the source of truth for formal form IDs and asset roots.  This
tool never imports, generates, repairs, or installs art; it only reports whether
the checked-in runtime bundle satisfies the shared two-view/12-action contract.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from PIL import Image, UnidentifiedImageError

from install_pet_battle_bundle import (
    ACTION_SPECS,
    BattleBundleError,
    CANONICAL_BATTLE_VIEW_MAPPING,
    FORMAL_VIEWS,
    RUNTIME_FRAME_SIZE,
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
