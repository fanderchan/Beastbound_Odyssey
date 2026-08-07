#!/usr/bin/env python3
"""Fail-closed audit for the World HUD awakened icon bundle.

The audit is deliberately read-only unless ``--write-report`` is supplied. It
checks the byte-level manifest, source/runtime pairing, PNG header contract,
provenance documents, replacement chain, and the runtime icon literals used by
``WorldHudAwakenedVisualSkin``. It never regenerates or rewrites image assets.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import struct
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PACKAGE_ROOT = (
    REPO_ROOT / "client/godot/assets/ui/world_hud_awakened_v1"
)
DEFAULT_SKIN_PATH = (
    REPO_ROOT / "client/godot/scripts/ui/world_hud_awakened_visual_skin.gd"
)
DEFAULT_REPORT_PATH = DEFAULT_PACKAGE_ROOT / "audit-report.json"

BASE_ICON_IDS = (
    "account",
    "auto",
    "backpack",
    "chat",
    "collapse",
    "equipment",
    "family",
    "hang",
    "mailbox",
    "map",
    "market",
    "more",
    "party",
    "quest",
)
TOP_ICON_IDS = (
    "top_classic",
    "top_guide",
    "top_hang",
    "top_more",
    "top_pet",
    "top_quest",
    "top_strengthen",
)
EVENT_ICON_IDS = (
    "event_account",
    "event_auto",
    "event_backpack",
    "event_character",
    "event_codex",
    "event_equipment",
    "event_family",
    "event_mailbox",
    "event_market",
    "event_party",
    "event_pet",
    "event_quest",
)
EXPECTED_ICON_IDS = tuple(sorted(BASE_ICON_IDS + TOP_ICON_IDS + EVENT_ICON_IDS))

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
LOWER_SHA256 = re.compile(r"^[0-9a-f]{64}$")
RUNTIME_ICON_LITERAL = re.compile(r'ICON_ROOT\s*\+\s*"/([^"/]+\.png)"')


class AuditFailure(RuntimeError):
    """Raised when one or more immutable bundle checks fail."""

    def __init__(self, errors: Iterable[str]):
        self.errors = tuple(errors)
        super().__init__("; ".join(self.errors))


@dataclass(frozen=True)
class PngMetadata:
    width: int
    height: int
    bit_depth: int
    color_type: int
    compression: int
    filter_method: int
    interlace: int

    @property
    def pixel_format(self) -> str:
        if self.bit_depth == 8 and self.color_type == 2:
            return "RGB8"
        if self.bit_depth == 8 and self.color_type == 6:
            return "RGBA8"
        return f"PNG(bitDepth={self.bit_depth},colorType={self.color_type})"

    @property
    def has_alpha(self) -> bool:
        return self.color_type in (4, 6)


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _json_sha256(payload: Any) -> str:
    encoded = json.dumps(
        payload,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _read_png_header(path: Path) -> PngMetadata:
    with path.open("rb") as handle:
        signature = handle.read(8)
        length_bytes = handle.read(4)
        chunk_type = handle.read(4)
        ihdr = handle.read(13)
    if signature != PNG_SIGNATURE:
        raise ValueError("missing PNG signature")
    if len(length_bytes) != 4 or struct.unpack(">I", length_bytes)[0] != 13:
        raise ValueError("invalid IHDR length")
    if chunk_type != b"IHDR" or len(ihdr) != 13:
        raise ValueError("IHDR is not the first complete chunk")
    width, height, bit_depth, color_type, compression, filter_method, interlace = (
        struct.unpack(">IIBBBBB", ihdr)
    )
    return PngMetadata(
        width=width,
        height=height,
        bit_depth=bit_depth,
        color_type=color_type,
        compression=compression,
        filter_method=filter_method,
        interlace=interlace,
    )


def _read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _record_error(errors: list[str], condition: bool, message: str) -> None:
    if not condition:
        errors.append(message)


def _icon_id_from_source(path: Path) -> str:
    suffix = "_raw_chroma"
    return path.stem[: -len(suffix)] if path.stem.endswith(suffix) else ""


def _runtime_icon_literals(skin_path: Path) -> tuple[str, ...]:
    source = skin_path.read_text(encoding="utf-8")
    return tuple(sorted({match.group(1)[:-4] for match in RUNTIME_ICON_LITERAL.finditer(source)}))


def _tracked_generated_sidecars(package_root: Path) -> tuple[str, ...]:
    try:
        package_relative = package_root.resolve().relative_to(REPO_ROOT)
    except ValueError:
        return ()
    completed = subprocess.run(
        ["git", "-C", str(REPO_ROOT), "ls-files", "--", str(package_relative)],
        check=True,
        capture_output=True,
        text=True,
    )
    return tuple(
        sorted(
            line
            for line in completed.stdout.splitlines()
            if line.endswith(".import") or line.endswith(".uid")
        )
    )


def _asset_lookup(
    records: list[Any], errors: list[str]
) -> dict[tuple[str, str], dict[str, Any]]:
    lookup: dict[tuple[str, str], dict[str, Any]] = {}
    asset_ids: set[str] = set()
    for index, raw in enumerate(records):
        if not isinstance(raw, dict):
            errors.append(f"assets[{index}] must be an object")
            continue
        icon_id = str(raw.get("iconId", ""))
        role = str(raw.get("role", ""))
        asset_id = str(raw.get("assetId", ""))
        key = (icon_id, role)
        if asset_id in asset_ids:
            errors.append(f"duplicate assetId: {asset_id}")
        asset_ids.add(asset_id)
        if key in lookup:
            errors.append(f"duplicate icon/role record: {icon_id}/{role}")
        lookup[key] = raw
    return lookup


def _validate_record(
    *,
    package_root: Path,
    icon_id: str,
    role: str,
    record: dict[str, Any],
    errors: list[str],
) -> dict[str, Any] | None:
    expected_asset_id = f"{icon_id}_{role}"
    expected_relative = (
        f"source/generated/{icon_id}_raw_chroma.png"
        if role == "source"
        else f"runtime/icons/{icon_id}.png"
    )
    expected_source = f"source/generated/{icon_id}_raw_chroma.png"
    expected_runtime = f"runtime/icons/{icon_id}.png"
    label = f"{icon_id}/{role}"

    _record_error(errors, record.get("assetId") == expected_asset_id, f"{label}: assetId mismatch")
    _record_error(errors, record.get("relativePath") == expected_relative, f"{label}: relativePath mismatch")
    _record_error(errors, record.get("mediaType") == "image/png", f"{label}: mediaType must be image/png")
    _record_error(errors, isinstance(record.get("responsibility"), str) and bool(record["responsibility"].strip()), f"{label}: missing responsibility")
    _record_error(errors, record.get("replacementSourcePath") == expected_source, f"{label}: replacementSourcePath mismatch")
    _record_error(errors, record.get("replacementOutputPath") == expected_runtime, f"{label}: replacementOutputPath mismatch")

    if role == "source":
        generation = record.get("generation")
        _record_error(errors, record.get("authorization") == "project_original_openai_imagegen_under_applicable_terms", f"{label}: source authorization mismatch")
        _record_error(errors, isinstance(generation, dict), f"{label}: missing generation record")
        if isinstance(generation, dict):
            _record_error(errors, generation.get("promptId") == f"{icon_id}_raw_chroma_normalized", f"{label}: normalized promptId mismatch")
            _record_error(errors, generation.get("promptProvenance") == "normalized_reconstruction_not_verbatim", f"{label}: prompt provenance must stay normalized reconstruction")
    else:
        _record_error(errors, record.get("derivedFrom") == f"{icon_id}_source", f"{label}: derivedFrom mismatch")
        _record_error(errors, record.get("authorization") == f"inherits_{icon_id}_source", f"{label}: runtime authorization mismatch")
        _record_error(errors, record.get("runtimeEnabled") is True, f"{label}: runtimeEnabled must be true")
        _record_error(errors, record.get("ownerReviewStatus") == "owner_review_pending", f"{label}: owner review status changed without acceptance")

    path = package_root / expected_relative
    if not path.is_file():
        errors.append(f"{label}: missing file {expected_relative}")
        return None
    if path.is_symlink():
        errors.append(f"{label}: symlinks are not allowed")
        return None
    try:
        png = _read_png_header(path)
    except (OSError, ValueError) as exc:
        errors.append(f"{label}: invalid PNG header ({exc})")
        return None

    expected_width = 1254 if role == "source" else 128
    expected_height = 1254 if role == "source" else 128
    expected_format = "RGB8" if role == "source" else "RGBA8"
    expected_alpha = role == "runtime"
    dimensions = record.get("dimensions")
    _record_error(errors, dimensions == {"width": png.width, "height": png.height}, f"{label}: manifest dimensions do not match file")
    _record_error(errors, png.width == expected_width and png.height == expected_height, f"{label}: expected {expected_width}x{expected_height}, got {png.width}x{png.height}")
    _record_error(errors, png.pixel_format == expected_format, f"{label}: expected {expected_format}, got {png.pixel_format}")
    _record_error(errors, record.get("pixelFormat") == png.pixel_format, f"{label}: manifest pixelFormat mismatch")
    _record_error(errors, record.get("hasAlpha") is png.has_alpha and png.has_alpha is expected_alpha, f"{label}: alpha contract mismatch")
    _record_error(errors, png.compression == 0 and png.filter_method == 0 and png.interlace == 0, f"{label}: PNG compression/filter/interlace contract mismatch")

    actual_bytes = path.stat().st_size
    actual_sha256 = _sha256_file(path)
    manifest_sha256 = record.get("sha256")
    _record_error(errors, record.get("bytes") == actual_bytes, f"{label}: byte count mismatch")
    _record_error(errors, isinstance(manifest_sha256, str) and LOWER_SHA256.fullmatch(manifest_sha256) is not None, f"{label}: invalid sha256 format")
    _record_error(errors, manifest_sha256 == actual_sha256, f"{label}: sha256 mismatch")
    return {
        "relativePath": expected_relative,
        "bytes": actual_bytes,
        "width": png.width,
        "height": png.height,
        "pixelFormat": png.pixel_format,
        "sha256": actual_sha256,
    }


def audit_bundle(
    package_root: Path = DEFAULT_PACKAGE_ROOT,
    skin_path: Path = DEFAULT_SKIN_PATH,
    *,
    manifest_path: Path | None = None,
) -> dict[str, Any]:
    package_root = package_root.resolve()
    skin_path = skin_path.resolve()
    manifest_path = (manifest_path or package_root / "asset-manifest.json").resolve()
    ownership_path = package_root / "source-and-ownership.md"
    prompts_path = package_root / "generation-prompts.md"
    ignore_path = package_root / ".gitignore"
    source_godot_ignore_path = package_root / "source/.gdignore"
    errors: list[str] = []

    for required in (
        manifest_path,
        ownership_path,
        prompts_path,
        ignore_path,
        source_godot_ignore_path,
        skin_path,
    ):
        if not required.is_file():
            errors.append(f"missing required audit input: {required}")
    if errors:
        raise AuditFailure(errors)

    try:
        manifest = _read_json(manifest_path)
    except (OSError, json.JSONDecodeError) as exc:
        raise AuditFailure([f"cannot read manifest: {exc}"]) from exc
    if not isinstance(manifest, dict):
        raise AuditFailure(["manifest root must be an object"])

    _record_error(errors, manifest.get("schemaVersion") == 1, "schemaVersion must remain 1")
    _record_error(errors, manifest.get("packageId") == "world_hud_awakened_v1", "packageId mismatch")
    _record_error(errors, manifest.get("runtimeEnabled") is True, "package runtimeEnabled must be true")
    _record_error(errors, manifest.get("ownerReviewStatus") == "owner_review_pending", "package owner review status changed without acceptance")
    generation_policy = manifest.get("generationPolicy")
    _record_error(errors, isinstance(generation_policy, dict), "missing generationPolicy")
    if isinstance(generation_policy, dict):
        _record_error(errors, generation_policy.get("promptProvenance") == "normalized_reconstruction_not_verbatim", "package prompt provenance must remain normalized reconstruction")
    audit_contract = manifest.get("audit")
    _record_error(errors, isinstance(audit_contract, dict), "missing audit contract")
    if isinstance(audit_contract, dict):
        expected_audit_fields = {
            "script": "tools/audit_world_hud_awakened_assets.py",
            "report": "client/godot/assets/ui/world_hud_awakened_v1/audit-report.json",
            "iconCount": 33,
            "sourceCount": 33,
            "runtimeCount": 33,
            "manifestAssetCount": 66,
            "runtimeConsumer": "client/godot/scripts/ui/world_hud_awakened_visual_skin.gd",
            "activeRuntimeIconCount": 30,
            "reservedRuntimeIconIds": [
                "event_equipment",
                "event_mailbox",
                "event_market",
            ],
        }
        _record_error(
            errors,
            audit_contract == expected_audit_fields,
            "manifest audit contract mismatch",
        )

    source_files = sorted((package_root / "source/generated").glob("*.png"))
    runtime_files = sorted((package_root / "runtime/icons").glob("*.png"))
    tracked_forbidden_sidecars = _tracked_generated_sidecars(package_root)
    _record_error(
        errors,
        not tracked_forbidden_sidecars,
        "generated sidecars must not be tracked: "
        + ", ".join(tracked_forbidden_sidecars),
    )
    actual_source_ids = {_icon_id_from_source(path) for path in source_files}
    actual_runtime_ids = {path.stem for path in runtime_files}
    expected_ids = set(EXPECTED_ICON_IDS)
    _record_error(errors, "" not in actual_source_ids, "source file does not use *_raw_chroma.png naming")
    actual_source_ids.discard("")
    _record_error(errors, actual_source_ids == expected_ids, f"source inventory mismatch: expected={sorted(expected_ids)} actual={sorted(actual_source_ids)}")
    _record_error(errors, actual_runtime_ids == expected_ids, f"runtime inventory mismatch: expected={sorted(expected_ids)} actual={sorted(actual_runtime_ids)}")

    raw_records = manifest.get("assets")
    _record_error(errors, isinstance(raw_records, list), "assets must be an array")
    records = raw_records if isinstance(raw_records, list) else []
    lookup = _asset_lookup(records, errors)
    expected_keys = {(icon_id, role) for icon_id in EXPECTED_ICON_IDS for role in ("source", "runtime")}
    _record_error(errors, set(lookup) == expected_keys, f"manifest asset coverage mismatch: expected {len(expected_keys)} records, got {len(lookup)}")

    file_records: list[dict[str, Any]] = []
    for icon_id in EXPECTED_ICON_IDS:
        pair: dict[str, Any] = {"iconId": icon_id}
        for role in ("source", "runtime"):
            record = lookup.get((icon_id, role))
            if record is None:
                continue
            verified = _validate_record(
                package_root=package_root,
                icon_id=icon_id,
                role=role,
                record=record,
                errors=errors,
            )
            if verified is not None:
                pair[role] = verified
        file_records.append(pair)

    ownership_text = ownership_path.read_text(encoding="utf-8")
    prompts_text = prompts_path.read_text(encoding="utf-8")
    ignore_rules = {
        line.strip()
        for line in ignore_path.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    }
    _record_error(
        errors,
        {"*.import", "*.uid"} <= ignore_rules,
        "package .gitignore must exclude generated .import and .uid sidecars",
    )
    _record_error(errors, "规范化重建提示词" in prompts_text and "不是" in prompts_text, "prompt ledger must disclose normalized reconstruction")
    for icon_id in EXPECTED_ICON_IDS:
        _record_error(errors, f"`{icon_id}`" in ownership_text, f"ownership ledger missing iconId: {icon_id}")
        _record_error(errors, f"{icon_id}_raw_chroma.png" in prompts_text, f"prompt ledger missing source: {icon_id}_raw_chroma.png")

    runtime_references = _runtime_icon_literals(skin_path)
    runtime_reference_set = set(runtime_references)
    _record_error(errors, runtime_reference_set <= expected_ids, f"runtime skin references undeclared icons: {sorted(runtime_reference_set - expected_ids)}")
    _record_error(errors, set(TOP_ICON_IDS) <= runtime_reference_set, "runtime skin does not reference every top_* icon")
    _record_error(errors, {"event_account", "event_auto", "event_backpack", "event_character", "event_codex", "event_family", "event_party", "event_pet", "event_quest"} <= runtime_reference_set, "runtime skin is missing a current event_* entry contract")

    if errors:
        raise AuditFailure(errors)

    reserved_runtime_ids = tuple(sorted(expected_ids - runtime_reference_set))
    report = {
        "schemaVersion": 1,
        "packageId": manifest["packageId"],
        "status": "passed",
        "auditedAt": manifest.get("auditedAt", ""),
        "contract": {
            "iconCount": len(EXPECTED_ICON_IDS),
            "sourceCount": len(source_files),
            "runtimeCount": len(runtime_files),
            "manifestAssetCount": len(records),
            "topIconCount": len(TOP_ICON_IDS),
            "eventIconCount": len(EVENT_ICON_IDS),
            "trackedForbiddenSidecarCount": len(tracked_forbidden_sidecars),
        },
        "runtimeReferences": {
            "source": str(skin_path.relative_to(REPO_ROOT)),
            "activeIconCount": len(runtime_references),
            "activeIconIds": list(runtime_references),
            "reservedIconCount": len(reserved_runtime_ids),
            "reservedIconIds": list(reserved_runtime_ids),
        },
        "documents": {
            "manifest": {
                "path": str(manifest_path.relative_to(REPO_ROOT)) if manifest_path.is_relative_to(REPO_ROOT) else str(manifest_path),
                "sha256": _sha256_file(manifest_path),
            },
            "ownership": {
                "path": str(ownership_path.relative_to(REPO_ROOT)),
                "sha256": _sha256_file(ownership_path),
            },
            "prompts": {
                "path": str(prompts_path.relative_to(REPO_ROOT)),
                "sha256": _sha256_file(prompts_path),
            },
            "ignore": {
                "path": str(ignore_path.relative_to(REPO_ROOT)),
                "sha256": _sha256_file(ignore_path),
            },
            "sourceGodotIgnore": {
                "path": str(source_godot_ignore_path.relative_to(REPO_ROOT)),
                "sha256": _sha256_file(source_godot_ignore_path),
            },
        },
        "files": file_records,
        "inventorySha256": _json_sha256(file_records),
        "errors": [],
    }
    return report


def _write_report(path: Path, report: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--package-root", type=Path, default=DEFAULT_PACKAGE_ROOT)
    parser.add_argument("--skin", type=Path, default=DEFAULT_SKIN_PATH)
    parser.add_argument("--manifest", type=Path)
    parser.add_argument("--write-report", type=Path)
    parser.add_argument("--check-report", type=Path)
    parser.add_argument("--json", action="store_true", help="print the full deterministic report")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(list(argv if argv is not None else sys.argv[1:]))
    try:
        report = audit_bundle(
            args.package_root,
            args.skin,
            manifest_path=args.manifest,
        )
        if args.write_report is not None:
            _write_report(args.write_report, report)
        if args.check_report is not None:
            expected = _read_json(args.check_report)
            if expected != report:
                raise AuditFailure([f"frozen report drift: {args.check_report}"])
    except (AuditFailure, OSError, json.JSONDecodeError) as exc:
        errors = list(exc.errors) if isinstance(exc, AuditFailure) else [str(exc)]
        print(json.dumps({"status": "failed", "errors": errors}, ensure_ascii=False, indent=2))
        return 1

    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        contract = report["contract"]
        runtime = report["runtimeReferences"]
        print(
            "world_hud_awakened_asset_audit "
            f"status={report['status']} "
            f"icons={contract['iconCount']} "
            f"source={contract['sourceCount']} "
            f"runtime={contract['runtimeCount']} "
            f"manifest={contract['manifestAssetCount']} "
            f"active={runtime['activeIconCount']} "
            f"reserved={runtime['reservedIconCount']}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
