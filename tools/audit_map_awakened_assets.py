#!/usr/bin/env python3
"""Fail-closed audit for the Phase399 map_awakened_v1 asset bundle."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import struct
import subprocess
import sys
import zlib
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PACKAGE_ROOT = REPO_ROOT / "client/godot/assets/ui/map_awakened_v1"
DEFAULT_MANIFEST_PATH = DEFAULT_PACKAGE_ROOT / "asset-manifest.json"
DEFAULT_PROMPT_PATH = (
    DEFAULT_PACKAGE_ROOT / "source/prompts/world-atlas-background-v1.txt"
)
DEFAULT_RUNTIME_PATH = (
    DEFAULT_PACKAGE_ROOT / "runtime/world_atlas_background_v1.png"
)
DEFAULT_OWNERSHIP_PATH = DEFAULT_PACKAGE_ROOT / "source-and-ownership.md"
DEFAULT_IGNORE_PATH = DEFAULT_PACKAGE_ROOT / ".gitignore"
DEFAULT_REGION_CATALOG_PATH = REPO_ROOT / "client/godot/data/map_regions.json"
DEFAULT_REPORT_PATH = DEFAULT_PACKAGE_ROOT / "audit-report.json"

EXPECTED_PACKAGE_ID = "map_awakened_v1"
EXPECTED_RUNTIME_RELATIVE_PATH = "runtime/world_atlas_background_v1.png"
EXPECTED_PROMPT_RELATIVE_PATH = "source/prompts/world-atlas-background-v1.txt"
EXPECTED_ASSET_ID = "world_atlas_background_v1"
EXPECTED_WIDTH = 1568
EXPECTED_HEIGHT = 1003
EXPECTED_BYTES = 2_777_702
EXPECTED_SHA256 = "ebae9a0e3fe14f104062080f39788278c53b87b38e1932be25b49724ca3e3470"
EXPECTED_IGNORE_TEXT = "*.import\n*.uid\n"
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
LOWER_SHA256 = re.compile(r"[0-9a-f]{64}")


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


def _read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _repo_relative(path: Path) -> str:
    resolved = path.resolve()
    try:
        return resolved.relative_to(REPO_ROOT.resolve()).as_posix()
    except ValueError:
        return str(resolved)


def _record_error(errors: list[str], condition: bool, message: str) -> None:
    if not condition:
        errors.append(message)


def _read_png_header(path: Path) -> PngMetadata:
    with path.open("rb") as handle:
        signature = handle.read(8)
        length_bytes = handle.read(4)
        chunk_type = handle.read(4)
        ihdr = handle.read(13)
        crc_bytes = handle.read(4)
    if signature != PNG_SIGNATURE:
        raise ValueError("missing PNG signature")
    if len(length_bytes) != 4 or struct.unpack(">I", length_bytes)[0] != 13:
        raise ValueError("invalid IHDR length")
    if chunk_type != b"IHDR" or len(ihdr) != 13 or len(crc_bytes) != 4:
        raise ValueError("IHDR is not the first complete chunk")
    expected_crc = zlib.crc32(chunk_type + ihdr) & 0xFFFFFFFF
    if struct.unpack(">I", crc_bytes)[0] != expected_crc:
        raise ValueError("invalid IHDR CRC")
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


def _tracked_generated_sidecars(package_root: Path) -> tuple[str, ...]:
    try:
        package_relative = package_root.resolve().relative_to(REPO_ROOT.resolve())
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


def _authority_region_ids(region_catalog: Any, errors: list[str]) -> tuple[str, ...]:
    if not isinstance(region_catalog, dict):
        errors.append("map region catalog must be an object")
        return ()
    _record_error(
        errors,
        region_catalog.get("schemaVersion") == 1,
        "map region catalog schemaVersion must be 1",
    )
    regions = region_catalog.get("regions")
    if not isinstance(regions, list):
        errors.append("map region catalog regions must be an array")
        return ()
    ids: list[str] = []
    all_ids: set[str] = set()
    for index, raw in enumerate(regions):
        if not isinstance(raw, dict):
            errors.append(f"map region catalog regions[{index}] must be an object")
            continue
        region_id = raw.get("id")
        if not isinstance(region_id, str) or not region_id.strip():
            errors.append(f"map region catalog regions[{index}] has invalid id")
            continue
        if region_id in all_ids:
            errors.append(f"duplicate map region id: {region_id}")
            continue
        all_ids.add(region_id)
        if raw.get("type") != "gm":
            ids.append(region_id)
    _record_error(
        errors,
        len(ids) == 9,
        f"authority map catalog must expose exactly 9 non-GM regions, got {len(ids)}",
    )
    return tuple(ids)


def _validate_hotspots(
    raw_hotspots: Any,
    authority_ids: tuple[str, ...],
    errors: list[str],
) -> tuple[str, ...]:
    if not isinstance(raw_hotspots, dict):
        errors.append("normalizedHotspots must be an object")
        return ()
    hotspot_ids = tuple(sorted(str(key) for key in raw_hotspots.keys()))
    authority_set = set(authority_ids)
    hotspot_set = set(hotspot_ids)
    if hotspot_set != authority_set:
        missing = sorted(authority_set - hotspot_set)
        extra = sorted(hotspot_set - authority_set)
        errors.append(
            "normalizedHotspots must exactly match non-GM authority region IDs "
            f"(missing={missing}, extra={extra})"
        )
    _record_error(
        errors,
        len(raw_hotspots) == 9,
        f"normalizedHotspots must contain exactly 9 entries, got {len(raw_hotspots)}",
    )
    for region_id, raw_point in raw_hotspots.items():
        label = f"normalizedHotspots.{region_id}"
        if not isinstance(raw_point, list) or len(raw_point) != 2:
            errors.append(f"{label} must be a two-number array")
            continue
        if any(isinstance(value, bool) or not isinstance(value, (int, float)) for value in raw_point):
            errors.append(f"{label} must contain only numbers")
            continue
        if any(float(value) < 0.0 or float(value) > 1.0 for value in raw_point):
            errors.append(f"{label} coordinates must stay normalized in [0,1]")
    return hotspot_ids


def audit_bundle(
    package_root: Path = DEFAULT_PACKAGE_ROOT,
    *,
    manifest_path: Path | None = None,
    prompt_path: Path | None = None,
    ownership_path: Path | None = None,
    ignore_path: Path | None = None,
    region_catalog_path: Path = DEFAULT_REGION_CATALOG_PATH,
) -> dict[str, Any]:
    package_root = package_root.resolve()
    manifest_path = (manifest_path or package_root / "asset-manifest.json").resolve()
    prompt_path = (
        prompt_path
        or package_root / "source/prompts/world-atlas-background-v1.txt"
    ).resolve()
    ownership_path = (
        ownership_path or package_root / "source-and-ownership.md"
    ).resolve()
    ignore_path = (ignore_path or package_root / ".gitignore").resolve()
    region_catalog_path = region_catalog_path.resolve()
    runtime_path = (package_root / EXPECTED_RUNTIME_RELATIVE_PATH).resolve()
    errors: list[str] = []

    for required in (
        manifest_path,
        prompt_path,
        ownership_path,
        ignore_path,
        region_catalog_path,
        runtime_path,
    ):
        if not required.is_file():
            errors.append(f"missing required audit input: {required}")
        elif required.is_symlink():
            errors.append(f"audit input must not be a symlink: {required}")
    if errors:
        raise AuditFailure(errors)

    try:
        manifest = _read_json(manifest_path)
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise AuditFailure((f"invalid asset manifest: {exc}",)) from exc
    try:
        region_catalog = _read_json(region_catalog_path)
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise AuditFailure((f"invalid map region catalog: {exc}",)) from exc
    if not isinstance(manifest, dict):
        raise AuditFailure(("asset manifest must be an object",))

    _record_error(errors, manifest.get("schemaVersion") == 1, "manifest schemaVersion must be 1")
    _record_error(errors, manifest.get("packageId") == EXPECTED_PACKAGE_ID, "manifest packageId mismatch")
    _record_error(errors, manifest.get("runtimeEnabled") is True, "manifest runtimeEnabled must be true")
    _record_error(
        errors,
        manifest.get("ownerReviewStatus") == "owner_review_pending",
        "manifest ownerReviewStatus must remain owner_review_pending",
    )

    authorization = manifest.get("authorization")
    _record_error(errors, isinstance(authorization, dict), "manifest authorization must be an object")
    if isinstance(authorization, dict):
        _record_error(
            errors,
            authorization.get("sourceType") == "project_original_openai_imagegen",
            "manifest authorization sourceType mismatch",
        )
        _record_error(
            errors,
            authorization.get("externalThirdPartyAssetEmbedded") is False,
            "manifest must declare no embedded third-party asset",
        )
    reference_policy = manifest.get("referencePolicy")
    _record_error(errors, isinstance(reference_policy, dict), "manifest referencePolicy must be an object")
    if isinstance(reference_policy, dict):
        for field in ("externalPixelsEmbedded", "externalMapCopied", "externalTrademarkCopied"):
            _record_error(errors, reference_policy.get(field) is False, f"referencePolicy.{field} must be false")

    target = manifest.get("target")
    _record_error(errors, isinstance(target, dict), "manifest target must be an object")
    if isinstance(target, dict):
        _record_error(errors, target.get("platform") == "PC", "manifest target platform must be PC")
        _record_error(errors, target.get("viewport") == "1280x720", "manifest target viewport mismatch")
        _record_error(errors, target.get("runtimeDirectory") == "runtime", "manifest runtimeDirectory mismatch")

    generation = manifest.get("generation")
    _record_error(errors, isinstance(generation, dict), "manifest generation must be an object")
    if isinstance(generation, dict):
        _record_error(
            errors,
            generation.get("promptRecord") == EXPECTED_PROMPT_RELATIVE_PATH,
            "manifest promptRecord path mismatch",
        )
        _record_error(errors, generation.get("promptProvenance") == "verbatim", "manifest prompt provenance mismatch")
        _record_error(errors, generation.get("sourceCanvas") == "1568x1003 RGB8", "manifest sourceCanvas mismatch")

    prompt_text = prompt_path.read_text(encoding="utf-8")
    _record_error(errors, len(prompt_text.strip()) >= 256, "generation prompt is missing or too short")
    for required_phrase in (
        "Do not copy any island silhouette",
        "Exactly nine major selectable land regions",
        "No readable text",
    ):
        _record_error(errors, required_phrase in prompt_text, f"generation prompt missing constraint: {required_phrase}")

    ownership_text = ownership_path.read_text(encoding="utf-8")
    for required_phrase in (
        "runtimeEnabled=true",
        "ownerReviewStatus=owner_review_pending",
        EXPECTED_RUNTIME_RELATIVE_PATH,
        EXPECTED_PROMPT_RELATIVE_PATH,
        str(EXPECTED_BYTES),
        EXPECTED_SHA256,
        "外部第三方像素：无",
    ):
        _record_error(errors, required_phrase in ownership_text, f"ownership record missing: {required_phrase}")
    for forbidden_claim in ("owner_review_accepted", "截图验收通过", "视觉验收通过"):
        _record_error(errors, forbidden_claim not in ownership_text, f"ownership record contains unapproved acceptance claim: {forbidden_claim}")

    ignore_text = ignore_path.read_text(encoding="utf-8")
    _record_error(
        errors,
        ignore_text == EXPECTED_IGNORE_TEXT,
        "package .gitignore must contain only *.import and *.uid",
    )
    tracked_sidecars = _tracked_generated_sidecars(package_root)
    _record_error(
        errors,
        not tracked_sidecars,
        f"generated sidecars must not be tracked: {list(tracked_sidecars)}",
    )

    authority_ids = _authority_region_ids(region_catalog, errors)
    hotspot_ids = _validate_hotspots(manifest.get("normalizedHotspots"), authority_ids, errors)

    assets = manifest.get("assets")
    if not isinstance(assets, list):
        errors.append("manifest assets must be an array")
        assets = []
    _record_error(errors, len(assets) == 1, f"manifest must contain exactly one asset, got {len(assets)}")
    asset = assets[0] if len(assets) == 1 and isinstance(assets[0], dict) else {}
    if len(assets) == 1 and not isinstance(assets[0], dict):
        errors.append("manifest assets[0] must be an object")

    expected_asset_fields = {
        "assetId": EXPECTED_ASSET_ID,
        "role": "runtime_background",
        "relativePath": EXPECTED_RUNTIME_RELATIVE_PATH,
        "mediaType": "image/png",
        "dimensions": {"width": EXPECTED_WIDTH, "height": EXPECTED_HEIGHT},
        "bytes": EXPECTED_BYTES,
        "pixelFormat": "RGB8",
        "hasAlpha": False,
        "sha256": EXPECTED_SHA256,
        "authorization": "project_original_openai_imagegen_under_applicable_terms",
        "generationPromptId": "world-atlas-background-v1",
        "runtimeEnabled": True,
        "ownerReviewStatus": "owner_review_pending",
    }
    for field, expected in expected_asset_fields.items():
        _record_error(errors, asset.get(field) == expected, f"asset {field} mismatch")
    _record_error(
        errors,
        isinstance(asset.get("responsibility"), str) and bool(asset["responsibility"].strip()),
        "asset responsibility is missing",
    )
    manifest_sha = asset.get("sha256")
    _record_error(
        errors,
        isinstance(manifest_sha, str) and LOWER_SHA256.fullmatch(manifest_sha) is not None,
        "asset sha256 must be lowercase hexadecimal",
    )

    try:
        png = _read_png_header(runtime_path)
    except (OSError, ValueError) as exc:
        errors.append(f"invalid runtime PNG: {exc}")
        png = None
    actual_bytes = runtime_path.stat().st_size
    actual_sha = _sha256_file(runtime_path)
    _record_error(errors, actual_bytes == EXPECTED_BYTES, f"runtime PNG expected {EXPECTED_BYTES} bytes, got {actual_bytes}")
    _record_error(errors, actual_bytes == asset.get("bytes"), "runtime PNG byte count differs from manifest")
    _record_error(errors, actual_sha == EXPECTED_SHA256, "runtime PNG immutable SHA-256 mismatch")
    _record_error(errors, actual_sha == asset.get("sha256"), "runtime PNG SHA-256 differs from manifest")
    if png is not None:
        _record_error(errors, png.width == EXPECTED_WIDTH and png.height == EXPECTED_HEIGHT, f"runtime PNG expected {EXPECTED_WIDTH}x{EXPECTED_HEIGHT}, got {png.width}x{png.height}")
        _record_error(errors, png.pixel_format == "RGB8", f"runtime PNG expected RGB8, got {png.pixel_format}")
        _record_error(errors, png.has_alpha is False, "runtime PNG must not contain alpha")
        _record_error(errors, png.compression == 0, "runtime PNG compression method must be 0")
        _record_error(errors, png.filter_method == 0, "runtime PNG filter method must be 0")
        _record_error(errors, png.interlace == 0, "runtime PNG must be non-interlaced")

    if errors:
        raise AuditFailure(errors)

    assert png is not None
    return {
        "schemaVersion": 1,
        "packageId": EXPECTED_PACKAGE_ID,
        "status": "passed",
        "auditedAt": manifest.get("auditedAt"),
        "contract": {
            "runtimeEnabled": True,
            "ownerReviewStatus": "owner_review_pending",
            "assetCount": 1,
            "hotspotCount": len(hotspot_ids),
            "authorityNonGmRegionCount": len(authority_ids),
            "trackedForbiddenSidecarCount": len(tracked_sidecars),
        },
        "asset": {
            "path": _repo_relative(runtime_path),
            "bytes": actual_bytes,
            "width": png.width,
            "height": png.height,
            "bitDepth": png.bit_depth,
            "pixelFormat": png.pixel_format,
            "hasAlpha": png.has_alpha,
            "compression": png.compression,
            "filterMethod": png.filter_method,
            "interlace": png.interlace,
            "sha256": actual_sha,
        },
        "hotspots": {
            "authoritySource": _repo_relative(region_catalog_path),
            "authorityRegionIds": list(authority_ids),
            "manifestHotspotIds": list(hotspot_ids),
            "exactMatch": True,
        },
        "documents": {
            "manifest": {"path": _repo_relative(manifest_path), "sha256": _sha256_file(manifest_path)},
            "prompt": {"path": _repo_relative(prompt_path), "sha256": _sha256_file(prompt_path)},
            "ownership": {"path": _repo_relative(ownership_path), "sha256": _sha256_file(ownership_path)},
            "ignore": {"path": _repo_relative(ignore_path), "sha256": _sha256_file(ignore_path)},
            "regionCatalog": {"path": _repo_relative(region_catalog_path), "sha256": _sha256_file(region_catalog_path)},
        },
        "visualAcceptance": {
            "status": "owner_review_pending",
            "screenshotAccepted": False,
            "statement": "结构与来源审计通过；截图和视频仍待项目所有者验收。",
        },
    }


def audit_repository_bundle() -> dict[str, Any]:
    report = audit_bundle()
    if not DEFAULT_REPORT_PATH.is_file():
        raise AuditFailure((f"missing frozen audit report: {DEFAULT_REPORT_PATH}",))
    try:
        frozen = _read_json(DEFAULT_REPORT_PATH)
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise AuditFailure((f"invalid frozen audit report: {exc}",)) from exc
    if frozen != report:
        raise AuditFailure(("frozen audit report differs from computed audit result",))
    return report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--computed-only",
        action="store_true",
        help="print the computed report without comparing the frozen audit-report.json",
    )
    args = parser.parse_args(argv)
    try:
        report = audit_bundle() if args.computed_only else audit_repository_bundle()
    except AuditFailure as exc:
        for error in exc.errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
