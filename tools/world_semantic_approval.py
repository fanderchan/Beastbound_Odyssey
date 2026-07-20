#!/usr/bin/env python3
"""Freeze and verify human-reviewed Beastbound true-eight world frames.

This tool deliberately does *not* infer what direction a sprite is facing.  A
manifest may only be created after an explicit visual-audit acknowledgement.
The resulting SHA-256 inventory then prevents the reviewed character, pet and
integrated-mounted frames from changing without another visual review.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path, PurePosixPath
from typing import Any


SCHEMA_VERSION = 1
MANIFEST_TYPE = "beastbound_world_semantic_direction_approval"
SEMANTIC_REVIEW_STATUS = "passed_by_visual_audit"
OWNER_REVIEW_STATUS = "pending"
CANONICAL_DIRECTIONS = (
    "south",
    "southwest",
    "west",
    "northwest",
    "north",
    "northeast",
    "east",
    "southeast",
)
WORLD_ACTIONS = {"idle": 1, "walk": 4}
CURRENT_COMPLETE_FORM_IDS = (
    "bui_novice_sprout_earth5_wind5",
    "wuli_normal_orange_fire10",
    "mossback_marsh_earth7_water3",
    "emberhorn_red_fire8_earth2",
    "blue_man_dragon_water10",
    "rebirth_beast_earth_lv50",
    "novice_tiger_mount",
)
DEFAULT_CATALOG = Path("client/godot/data/pet_art_catalog.json")
DEFAULT_CHARACTER_ROOT = Path("client/godot/assets/characters/novice_hunter")
DEFAULT_MANIFEST = Path("client/godot/data/world_semantic_direction_approval_v1.json")
REVIEW_STATEMENT = (
    "Direction semantics were judged by visual audit; automation only freezes "
    "the reviewed paths and file hashes."
)


class ApprovalError(ValueError):
    """A user-facing approval-contract failure."""


def _repo_path(value: Path | str, repo_root: Path, *, label: str) -> tuple[Path, str]:
    raw = Path(value).as_posix()
    pure = PurePosixPath(raw)
    if raw.startswith(("/", "\\")) or pure.is_absolute() or ".." in pure.parts:
        raise ApprovalError(f"{label} 必须是安全的 repo-relative 路径：{raw}")
    relative = Path(*pure.parts)
    resolved = (repo_root / relative).resolve(strict=False)
    try:
        resolved.relative_to(repo_root)
    except ValueError as error:
        raise ApprovalError(f"{label} 越出仓库根目录：{raw}") from error
    return resolved, relative.as_posix()


def _load_json(path: Path, *, label: str) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ApprovalError(f"无法读取 {label}：{path}: {error}") from error
    if not isinstance(value, dict):
        raise ApprovalError(f"{label} 根节点必须是对象：{path}")
    return value


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _selected_form_ids(values: list[str] | None) -> tuple[str, ...]:
    selected = tuple(values or CURRENT_COMPLETE_FORM_IDS)
    if not selected or any(not value.strip() for value in selected):
        raise ApprovalError("至少需要一个非空 --form-id")
    if len(set(selected)) != len(selected):
        raise ApprovalError("--form-id 不能重复")
    return selected


def _catalog_bundles(
    catalog: dict[str, Any],
    form_ids: tuple[str, ...],
    *,
    character_root: str,
) -> tuple[str, list[dict[str, str]]]:
    default_character_id = catalog.get("defaultCharacterId")
    if not isinstance(default_character_id, str) or not default_character_id.strip():
        raise ApprovalError("catalog.defaultCharacterId 必须是非空字符串")
    forms = catalog.get("forms")
    if not isinstance(forms, list):
        raise ApprovalError("catalog.forms 必须是数组")
    by_id: dict[str, dict[str, Any]] = {}
    for value in forms:
        if not isinstance(value, dict):
            continue
        form_id = value.get("formId")
        if isinstance(form_id, str) and form_id:
            if form_id in by_id:
                raise ApprovalError(f"catalog formId 重复：{form_id}")
            by_id[form_id] = value

    bundles = [
        {
            "bundleKey": f"character:{default_character_id}",
            "kind": "character",
            "formId": "",
            "root": character_root,
        }
    ]
    for form_id in form_ids:
        form = by_id.get(form_id)
        if form is None:
            raise ApprovalError(f"catalog 缺少目标 form：{form_id}")
        for kind in ("pet", "mounted"):
            bundle = form.get(kind)
            root = bundle.get("root") if isinstance(bundle, dict) else None
            if not isinstance(root, str) or not root.strip():
                raise ApprovalError(f"{form_id}.{kind}.root 必须是非空字符串")
            bundles.append(
                {
                    "bundleKey": f"{kind}:{form_id}",
                    "kind": kind,
                    "formId": form_id,
                    "root": root,
                }
            )
    return default_character_id, bundles


def _expected_frame_records(
    bundle: dict[str, str],
    *,
    repo_root: Path,
) -> list[dict[str, Any]]:
    root_path, root_relative = _repo_path(bundle["root"], repo_root, label=f"{bundle['bundleKey']}.root")
    records: list[dict[str, Any]] = []
    for direction in CANONICAL_DIRECTIONS:
        for action, count in WORLD_ACTIONS.items():
            for index in range(1, count + 1):
                relative = Path("world") / "directions" / direction / action / f"{action}-{index}.png"
                frame_path = root_path / relative
                path = (Path(root_relative) / relative).as_posix()
                records.append(
                    {
                        "path": path,
                        "direction": direction,
                        "action": action,
                        "index": index,
                        "absolutePath": frame_path,
                    }
                )
    return records


def _scan_world_pngs(bundle_root: Path) -> set[Path]:
    directions_root = bundle_root / "world" / "directions"
    if not directions_root.is_dir():
        return set()
    return {path.resolve() for path in directions_root.rglob("*.png") if path.is_file()}


def _build_manifest(
    *,
    repo_root: Path,
    catalog_path: Path,
    catalog_relative: str,
    character_root: str,
    form_ids: tuple[str, ...],
    reviewer: str,
    evidence: list[str],
) -> dict[str, Any]:
    catalog = _load_json(catalog_path, label="catalog")
    default_character_id, bundle_specs = _catalog_bundles(
        catalog,
        form_ids,
        character_root=character_root,
    )
    bundles: list[dict[str, Any]] = []
    for bundle in bundle_specs:
        root_path, root_relative = _repo_path(bundle["root"], repo_root, label=f"{bundle['bundleKey']}.root")
        frame_records = _expected_frame_records(bundle, repo_root=repo_root)
        missing = [entry["path"] for entry in frame_records if not entry["absolutePath"].is_file()]
        if missing:
            raise ApprovalError(
                f"{bundle['bundleKey']} 不是完整 40 帧 world pack；缺少：{', '.join(missing[:3])}"
            )
        expected_paths = {entry["absolutePath"].resolve() for entry in frame_records}
        extras = sorted(_scan_world_pngs(root_path) - expected_paths)
        if extras:
            raise ApprovalError(
                f"{bundle['bundleKey']} 含规范外 world PNG：{extras[0].relative_to(repo_root)}"
            )
        frames = [
            {
                "path": entry["path"],
                "direction": entry["direction"],
                "action": entry["action"],
                "index": entry["index"],
                "sha256": _sha256(entry["absolutePath"]),
                "sizeBytes": entry["absolutePath"].stat().st_size,
            }
            for entry in frame_records
        ]
        bundles.append(
            {
                "bundleKey": bundle["bundleKey"],
                "kind": bundle["kind"],
                "formId": bundle["formId"] or None,
                "root": root_relative,
                "frameCount": len(frames),
                "frames": frames,
            }
        )
    return {
        "schemaVersion": SCHEMA_VERSION,
        "manifestType": MANIFEST_TYPE,
        "semanticDirectionReview": SEMANTIC_REVIEW_STATUS,
        "ownerReview": OWNER_REVIEW_STATUS,
        "automaticDirectionRecognition": False,
        "reviewStatement": REVIEW_STATEMENT,
        "catalogPath": catalog_relative,
        "defaultCharacterId": default_character_id,
        "characterRoot": character_root,
        "formIds": list(form_ids),
        "canonicalDirections": list(CANONICAL_DIRECTIONS),
        "requiredWorldActions": WORLD_ACTIONS,
        "visualAudit": {
            "reviewer": reviewer,
            "evidence": evidence,
        },
        "bundleCount": len(bundles),
        "frameCount": sum(bundle["frameCount"] for bundle in bundles),
        "bundles": bundles,
    }


def _validate_manifest_header(
    manifest: dict[str, Any],
    *,
    form_ids: tuple[str, ...],
) -> list[str]:
    errors: list[str] = []
    exact_fields = {
        "schemaVersion": SCHEMA_VERSION,
        "manifestType": MANIFEST_TYPE,
        "semanticDirectionReview": SEMANTIC_REVIEW_STATUS,
        "ownerReview": OWNER_REVIEW_STATUS,
        "automaticDirectionRecognition": False,
        "reviewStatement": REVIEW_STATEMENT,
        "canonicalDirections": list(CANONICAL_DIRECTIONS),
        "requiredWorldActions": WORLD_ACTIONS,
        "formIds": list(form_ids),
    }
    for field, expected in exact_fields.items():
        if manifest.get(field) != expected:
            errors.append(f"manifest.{field} 必须为 {expected!r}")
    visual_audit = manifest.get("visualAudit")
    if not isinstance(visual_audit, dict):
        errors.append("manifest.visualAudit 必须是对象")
    else:
        if not isinstance(visual_audit.get("reviewer"), str) or not visual_audit["reviewer"].strip():
            errors.append("manifest.visualAudit.reviewer 必须是非空字符串")
        evidence = visual_audit.get("evidence")
        if not isinstance(evidence, list) or not evidence or any(
            not isinstance(value, str) or not value.strip() for value in evidence
        ):
            errors.append("manifest.visualAudit.evidence 必须是非空字符串数组")
    return errors


def _verify_manifest(
    *,
    repo_root: Path,
    manifest: dict[str, Any],
    form_ids: tuple[str, ...],
    catalog_override: Path | None,
    character_root_override: str | None,
) -> dict[str, Any]:
    errors = _validate_manifest_header(manifest, form_ids=form_ids)
    catalog_value = catalog_override or Path(str(manifest.get("catalogPath", "")))
    try:
        catalog_path, catalog_relative = _relative_arg(catalog_value, repo_root, label="catalogPath")
        catalog = _load_json(catalog_path, label="catalog")
    except ApprovalError as error:
        return {"status": "failed", "errors": errors + [str(error)], "checkedFrames": 0}

    character_root = character_root_override or manifest.get("characterRoot")
    if not isinstance(character_root, str) or not character_root.strip():
        errors.append("manifest.characterRoot 必须是非空 repo-relative 路径")
        return {"status": "failed", "errors": errors, "checkedFrames": 0}
    try:
        default_character_id, expected_bundles = _catalog_bundles(
            catalog,
            form_ids,
            character_root=character_root,
        )
    except ApprovalError as error:
        return {"status": "failed", "errors": errors + [str(error)], "checkedFrames": 0}
    if manifest.get("catalogPath") != catalog_relative and catalog_override is None:
        errors.append(f"manifest.catalogPath 非规范路径：{manifest.get('catalogPath')!r}")
    if manifest.get("defaultCharacterId") != default_character_id:
        errors.append("manifest.defaultCharacterId 与 catalog 不一致")
    expected_bundle_count = 1 + 2 * len(form_ids)
    if manifest.get("bundleCount") != expected_bundle_count:
        errors.append(f"manifest.bundleCount 必须为 {expected_bundle_count}")
    if manifest.get("frameCount") != expected_bundle_count * 40:
        errors.append(f"manifest.frameCount 必须为 {expected_bundle_count * 40}")

    bundle_values = manifest.get("bundles")
    if not isinstance(bundle_values, list):
        errors.append("manifest.bundles 必须是数组")
        return {"status": "failed", "errors": errors, "checkedFrames": 0}
    by_key: dict[str, dict[str, Any]] = {}
    for value in bundle_values:
        if not isinstance(value, dict) or not isinstance(value.get("bundleKey"), str):
            errors.append("manifest.bundles[] 必须包含字符串 bundleKey")
            continue
        key = value["bundleKey"]
        if key in by_key:
            errors.append(f"manifest bundleKey 重复：{key}")
            continue
        by_key[key] = value
    expected_keys = [bundle["bundleKey"] for bundle in expected_bundles]
    if set(by_key) != set(expected_keys):
        errors.append("manifest bundle 集合与 catalog/目标 form 不一致")

    checked_frames = 0
    for expected_bundle in expected_bundles:
        key = expected_bundle["bundleKey"]
        bundle = by_key.get(key)
        if bundle is None:
            continue
        try:
            root_path, root_relative = _repo_path(expected_bundle["root"], repo_root, label=f"{key}.root")
        except ApprovalError as error:
            errors.append(str(error))
            continue
        expected_form_id: str | None = expected_bundle["formId"] or None
        for field, expected in (
            ("kind", expected_bundle["kind"]),
            ("formId", expected_form_id),
            ("root", root_relative),
            ("frameCount", 40),
        ):
            if bundle.get(field) != expected:
                errors.append(f"{key}.{field} 必须为 {expected!r}")
        expected_records = _expected_frame_records(expected_bundle, repo_root=repo_root)
        expected_by_path = {entry["path"]: entry for entry in expected_records}
        frames = bundle.get("frames")
        if not isinstance(frames, list):
            errors.append(f"{key}.frames 必须是数组")
            continue
        by_path: dict[str, dict[str, Any]] = {}
        for value in frames:
            if not isinstance(value, dict) or not isinstance(value.get("path"), str):
                errors.append(f"{key}.frames[] 必须包含字符串 path")
                continue
            path = value["path"]
            if path in by_path:
                errors.append(f"{key} 帧路径重复：{path}")
                continue
            by_path[path] = value
        if set(by_path) != set(expected_by_path):
            errors.append(f"{key} 40 帧路径集合不完整或含规范外路径")
        expected_paths = {entry["absolutePath"].resolve() for entry in expected_records}
        extras = sorted(_scan_world_pngs(root_path) - expected_paths)
        if extras:
            errors.append(f"{key} 含规范外 world PNG：{extras[0].relative_to(repo_root)}")
        for path, expected in expected_by_path.items():
            value = by_path.get(path)
            if value is None:
                continue
            for field in ("direction", "action", "index"):
                if value.get(field) != expected[field]:
                    errors.append(f"{key} {path} 的 {field} 与规范路径不一致")
            absolute_path = expected["absolutePath"]
            if not absolute_path.is_file():
                errors.append(f"{key} 缺少批准帧：{path}")
                continue
            checked_frames += 1
            current_hash = _sha256(absolute_path)
            if value.get("sha256") != current_hash:
                errors.append(f"{key} 帧哈希漂移：{path}")
            if value.get("sizeBytes") != absolute_path.stat().st_size:
                errors.append(f"{key} 帧大小漂移：{path}")
    return {
        "status": "ok" if not errors else "failed",
        "errors": errors,
        "checkedFrames": checked_frames,
        "expectedFrames": expected_bundle_count * 40,
        "semanticDirectionReview": manifest.get("semanticDirectionReview"),
        "ownerReview": manifest.get("ownerReview"),
    }


def _relative_arg(path: Path, repo_root: Path, *, label: str) -> tuple[Path, str]:
    if path.is_absolute():
        resolved = path.resolve(strict=False)
        try:
            relative = resolved.relative_to(repo_root).as_posix()
        except ValueError as error:
            raise ApprovalError(f"{label} 必须位于仓库内：{path}") from error
        return resolved, relative
    return _repo_path(path, repo_root, label=label)


def _add_common_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--repo-root",
        type=Path,
        default=Path(__file__).resolve().parents[1],
        help="repository root",
    )
    parser.add_argument(
        "--form-id",
        action="append",
        help="approved form id; repeat as needed (default: current seven complete packs)",
    )


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    create = subparsers.add_parser("create", help="freeze frames after a completed visual direction audit")
    _add_common_arguments(create)
    create.add_argument("--catalog", type=Path, default=DEFAULT_CATALOG)
    create.add_argument("--character-root", type=Path, default=DEFAULT_CHARACTER_ROOT)
    create.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    create.add_argument("--reviewer", required=True)
    create.add_argument("--evidence", action="append", required=True)
    create.add_argument(
        "--confirm-visual-direction-review",
        action="store_true",
        help="required acknowledgement that all directions were manually inspected",
    )

    verify = subparsers.add_parser("verify", help="verify paths and SHA-256 hashes against an approval manifest")
    _add_common_arguments(verify)
    verify.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    verify.add_argument("--catalog", type=Path, help="optional catalog override for isolated tests")
    verify.add_argument("--character-root", type=Path, help="optional character root override")
    return parser.parse_args()


def _create(args: argparse.Namespace) -> int:
    if not args.confirm_visual_direction_review:
        raise ApprovalError(
            "拒绝生成批准清单：必须先逐方向人工复审，再传入 --confirm-visual-direction-review"
        )
    reviewer = args.reviewer.strip()
    if not reviewer:
        raise ApprovalError("--reviewer 不能为空")
    repo_root = args.repo_root.resolve()
    catalog_path, catalog_relative = _relative_arg(args.catalog, repo_root, label="catalog")
    _, character_root = _relative_arg(args.character_root, repo_root, label="character-root")
    manifest_path, _ = _relative_arg(args.manifest, repo_root, label="manifest")
    evidence: list[str] = []
    for index, value in enumerate(args.evidence):
        _, relative = _relative_arg(Path(value), repo_root, label=f"evidence[{index}]")
        evidence.append(relative)
    manifest = _build_manifest(
        repo_root=repo_root,
        catalog_path=catalog_path,
        catalog_relative=catalog_relative,
        character_root=character_root,
        form_ids=_selected_form_ids(args.form_id),
        reviewer=reviewer,
        evidence=evidence,
    )
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        f"world semantic approval created: bundles={manifest['bundleCount']} frames={manifest['frameCount']} "
        f"ownerReview={manifest['ownerReview']} path={manifest_path}"
    )
    return 0


def _verify(args: argparse.Namespace) -> int:
    repo_root = args.repo_root.resolve()
    manifest_path, _ = _relative_arg(args.manifest, repo_root, label="manifest")
    manifest = _load_json(manifest_path, label="manifest")
    catalog_override = None
    if args.catalog is not None:
        catalog_override, _ = _relative_arg(args.catalog, repo_root, label="catalog")
    character_root_override = None
    if args.character_root is not None:
        _, character_root_override = _relative_arg(args.character_root, repo_root, label="character-root")
    report = _verify_manifest(
        repo_root=repo_root,
        manifest=manifest,
        form_ids=_selected_form_ids(args.form_id),
        catalog_override=catalog_override,
        character_root_override=character_root_override,
    )
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["status"] == "ok" else 1


def main() -> int:
    args = _parse_args()
    try:
        return _create(args) if args.command == "create" else _verify(args)
    except ApprovalError as error:
        print(f"world semantic approval: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
