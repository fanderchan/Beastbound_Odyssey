#!/usr/bin/env python3
"""Read-only audit for canonical Beastbound pet headshot portraits.

Combined mode is the strict default: it requires all 36 formal
``pet_art_catalog.json`` forms.  The first two fusion forms are now registered
in that same catalog, so the authoritative isolated-root set is empty.
``--catalog-only`` and ``--isolated-only`` remain explicit narrower modes for
focused tooling and regression fixtures.

The audit never generates, repairs, or installs art.  It verifies the 512 RGBA
runtime image, transparent corners/coverage, durable source and exact prompt,
identity reference, ownership, hashes, same-operation chroma masks and replay,
compact-size contact-sheet replay, owner-review truth, generator attestation,
and exact/scaled-copy independence from all existing pet-root art and every
other audited portrait.  Automated duplicate checks remain misuse guards, not
semantic proof of independent authorship.  Every mode is an owner-review
candidate integrity audit: even a successful combined 36+0 result has
``releaseGate=false`` and cannot replace a trusted owner visual decision.
"""

from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable, Sequence

import numpy as np
from PIL import Image, UnidentifiedImageError

import build_pet_portrait as builder
from build_pet_art_bundle import PREMULTIPLIED_LANCZOS, resize_rgba_premultiplied, rgba_hash


DEFAULT_CATALOG = Path("client/godot/data/pet_art_catalog.json")
AUTHORITATIVE_CATALOG_FORM_ROOTS: tuple[tuple[str, Path], ...] = (
    (
        "bui_normal_red_fire10",
        Path("client/godot/assets/pets/bui_normal_red_fire10"),
    ),
    (
        "bui_normal_yellow_wind10",
        Path("client/godot/assets/pets/bui_normal_yellow_wind10"),
    ),
    (
        "bui_normal_thick_earth10",
        Path("client/godot/assets/pets/bui_normal_thick_earth10"),
    ),
    (
        "bui_novice_sprout_earth5_wind5",
        Path("client/godot/assets/pets/novice_sprout_bui"),
    ),
    (
        "wuli_normal_orange_fire10",
        Path("client/godot/assets/pets/wuli_normal_orange_fire10"),
    ),
    (
        "wuli_normal_fast_wind10",
        Path("client/godot/assets/pets/wuli_normal_fast_wind10"),
    ),
    (
        "wuli_normal_tough_earth10",
        Path("client/godot/assets/pets/wuli_normal_tough_earth10"),
    ),
    (
        "wuli_evolved_crystal_earth8_water2",
        Path("client/godot/assets/pets/wuli_evolved_crystal_earth8_water2"),
    ),
    (
        "mossback_marsh_earth7_water3",
        Path("client/godot/assets/pets/mossback_marsh_earth7_water3"),
    ),
    (
        "mossback_sunbaked_earth6_fire4",
        Path("client/godot/assets/pets/mossback_sunbaked_earth6_fire4"),
    ),
    (
        "driftfox_mist_wind7_water3",
        Path("client/godot/assets/pets/driftfox_mist_wind7_water3"),
    ),
    (
        "driftfox_highland_wind9_earth1",
        Path("client/godot/assets/pets/driftfox_highland_wind9_earth1"),
    ),
    (
        "driftfox_evolved_moon_gale_wind7_water3",
        Path(
            "client/godot/assets/pets/"
            "driftfox_evolved_moon_gale_wind7_water3"
        ),
    ),
    (
        "emberhorn_red_fire8_earth2",
        Path("client/godot/assets/pets/emberhorn_red_fire8_earth2"),
    ),
    (
        "emberhorn_ash_fire6_wind4",
        Path("client/godot/assets/pets/emberhorn_ash_fire6_wind4"),
    ),
    (
        "emberhorn_gale_fire5_wind5",
        Path("client/godot/assets/pets/emberhorn_gale_fire5_wind5"),
    ),
    (
        "tidefin_mist_water8_wind2",
        Path("client/godot/assets/pets/tidefin_mist_water8_wind2"),
    ),
    (
        "tidefin_sky_water5_wind5",
        Path("client/godot/assets/pets/tidefin_sky_water5_wind5"),
    ),
    (
        "tidefin_reed_water6_earth4",
        Path("client/godot/assets/pets/tidefin_reed_water6_earth4"),
    ),
    (
        "blue_man_dragon_water10",
        Path("client/godot/assets/pets/blue_man_dragon_water10"),
    ),
    (
        "pet_rebirth_mm_stage1",
        Path("client/godot/assets/pets/pet_rebirth_mm_stage1"),
    ),
    (
        "pet_rebirth_mm_stage2",
        Path("client/godot/assets/pets/pet_rebirth_mm_stage2"),
    ),
    (
        "rebirth_beast_earth_lv50",
        Path("client/godot/assets/pets/rebirth_beast_earth_lv50"),
    ),
    (
        "rebirth_beast_water_lv50",
        Path("client/godot/assets/pets/rebirth_beast_water_lv50"),
    ),
    (
        "rebirth_beast_fire_lv50",
        Path("client/godot/assets/pets/rebirth_beast_fire_lv50"),
    ),
    (
        "rebirth_beast_wind_lv50",
        Path("client/godot/assets/pets/rebirth_beast_wind_lv50"),
    ),
    (
        "rebirth_starter_earth_cub",
        Path("client/godot/assets/pets/rebirth_starter_earth_cub"),
    ),
    (
        "rebirth_starter_water_cub",
        Path("client/godot/assets/pets/rebirth_starter_water_cub"),
    ),
    (
        "rebirth_starter_fire_cub",
        Path("client/godot/assets/pets/rebirth_starter_fire_cub"),
    ),
    (
        "rebirth_starter_wind_cub",
        Path("client/godot/assets/pets/rebirth_starter_wind_cub"),
    ),
    (
        "rebirth_starter_four_spirit_cub",
        Path("client/godot/assets/pets/rebirth_starter_four_spirit_cub"),
    ),
    (
        "rebirth_starter_shadow_cub",
        Path("client/godot/assets/pets/rebirth_starter_shadow_cub"),
    ),
    (
        "novice_tiger_mount",
        Path("client/godot/assets/pets/novice_tiger_mount"),
    ),
    (
        "thunder_dragon_mount",
        Path("client/godot/assets/pets/thunder_dragon_mount"),
    ),
    (
        "emberhorn_fusion_solar_crown_fire7_wind3",
        Path(
            "client/godot/assets/pets/"
            "emberhorn_fusion_solar_crown_fire7_wind3"
        ),
    ),
    (
        "emberhorn_fusion_moss_rampart_fire4_earth6",
        Path(
            "client/godot/assets/pets/"
            "emberhorn_fusion_moss_rampart_fire4_earth6"
        ),
    ),
)
AUTHORITATIVE_ISOLATED_FORM_ROOTS: tuple[tuple[str, Path], ...] = ()
DEFAULT_EXPECTED_CATALOG_COUNT = len(AUTHORITATIVE_CATALOG_FORM_ROOTS)
DEFAULT_EXPECTED_ISOLATED_COUNT = len(AUTHORITATIVE_ISOLATED_FORM_ROOTS)
PORTRAIT_RELEASE_GATE_REQUIRED_FORM_IDS = frozenset(
    {
        "emberhorn_fusion_solar_crown_fire7_wind3",
        "emberhorn_fusion_moss_rampart_fire4_earth6",
    }
)
FORMAL_IDENTITY_RELOCATION_ROOTS = {
    form_id: root
    for form_id, root in AUTHORITATIVE_CATALOG_FORM_ROOTS
    if form_id in PORTRAIT_RELEASE_GATE_REQUIRED_FORM_IDS
}
TRUSTED_PROJECT_OWNER_ID = "project-owner:fander"
# Owner approval is a separate, explicit project-owner act.  Keep this trust
# anchor empty while the portrait batch is under owner review.  A future
# explicit acceptance records the exact immutable decision-file SHA here;
# merely creating a plausible JSON file can therefore never self-approve art.
TRUSTED_OWNER_DECISION_SHA256_BY_FORM: dict[str, frozenset[str]] = {}
PENDING_PORTRAIT_CLAIM_LIMIT = (
    "project-directed generated candidate; automated checks do not prove "
    "semantic independence, copyright provenance, or owner approval"
)
OWNER_APPROVED_PORTRAIT_CLAIM_LIMIT = (
    "project-directed generated portrait; deterministic checks prove source "
    "and processing integrity, while semantic independence and release "
    "approval are bound only to the trusted project-owner decision"
)
# The 8% framing gate has one independent visibility definition.  Chroma
# processing may record another alpha cutoff for replay diagnostics, but it
# cannot redefine which portrait pixels count when the audit measures margins.
COMPOSITION_AUDIT_ALPHA_THRESHOLD = 8
IMAGE_SUFFIXES = {".png", ".webp"}
SHA256_PATTERN = re.compile(r"^[0-9a-f]{64}$")
DIRECT_REQUEST_CLAIM_LIMIT = (
    "binds the recorded direct ImageGen JSON arguments and the currently "
    "readable bytes of explicit reference paths; path records do not prove "
    "those bytes were unchanged since request time, conversation-history "
    "image content is not recoverable, and this does not prove semantic "
    "independence, copyright provenance, or owner approval"
)
PREDECESSOR_LINEAGE_CLAIM_LIMIT = (
    "binds one same-form predecessor output to its canonical cache, "
    "completion event, direct request, and currently readable declared "
    "identity reference; reference path bytes are not proven unchanged "
    "since request time and owner approval remains required"
)
REQUEST_ARGUMENT_COMPATIBILITY_BY_FORM = {
    "driftfox_highland_wind9_earth1": (
        "historical_conversation_image_request_owner_pending_v1"
    ),
}
PORTRAIT_METADATA_EXACT_KEYS: dict[tuple[str, ...], frozenset[str]] = {
    (): frozenset(
        {
            "schemaVersion",
            "tool",
            "formId",
            "capability",
            "independentlyAuthoredClaim",
            "independentAuthorshipClaimTrust",
            "semanticIndependenceVerified",
            "fullBodyCropAllowed",
            "claimLimit",
            "sharedUses",
            "catalogBinding",
            "source",
            "independentCompositionEvidence",
            "identityReference",
            "prompt",
            "ownership",
            "processing",
            "assets",
            "composition",
            "evidence",
            "ownerReview",
        }
    ),
    ("catalogBinding",): frozenset(
        {"mode", "catalogPath", "petRoot"}
    ),
    ("source",): frozenset(
        {
            "method",
            "generator",
            "generationId",
            "originalInput",
            "originalGeneratedPngPath",
            "rawLosslessPath",
            "generationAttestation",
        }
    ),
    ("source", "originalInput"): frozenset(
        {
            "path",
            "sha256",
            "rgbaSha256",
            "width",
            "height",
            "mode",
            "format",
        }
    ),
    ("source", "generationAttestation"): frozenset(
        {"path", "sha256", "schemaVersion", "generationId"}
    ),
    ("independentCompositionEvidence",): frozenset(
        {
            "generatorAttestation",
            "promptContract",
            "identityReferenceSha256",
            "duplicateGuard",
            "ownerVisualReviewRequired",
            "claimLimit",
        }
    ),
    ("independentCompositionEvidence", "duplicateGuard"): frozenset(
        {
            "method",
            "checkedExistingImages",
            "normalizedSize",
            "coarseNormalizedSize",
            "alphaIouThreshold",
            "meanAbsoluteErrorThreshold",
            "semanticProof",
        }
    ),
    ("identityReference",): frozenset(
        {
            "path",
            "sha256",
            "rgbaSha256",
            "width",
            "height",
            "mode",
            "format",
        }
    ),
    ("prompt",): frozenset(
        {
            "path",
            "sha256",
            "sourceSha256",
            "encoding",
            "sourceKind",
            "actualRequestPromptVerified",
            "selectionDocumentationPath",
            "selectionDocumentationSha256",
        }
    ),
    ("ownership",): frozenset({"path", "sha256"}),
    ("processing",): frozenset(
        {
            "edgeContractVersion",
            "safeMarginContract",
            "alphaMatte",
            "masterCanvas",
            "runtimeDerivation",
            "duplicateGuard",
        }
    ),
    ("processing", "safeMarginContract"): frozenset(
        {
            "version",
            "minimumRatio",
            "rounding",
            "visibleAlphaThreshold",
            "masterPixels",
            "runtimePixels",
        }
    ),
    ("processing", "alphaMatte"): frozenset(
        {
            "method",
            "key",
            "transparentDistance",
            "opaqueDistance",
            "alphaThreshold",
            "cornerDistances",
            "candidatePixels",
            "eligiblePixels",
            "transparentPixels",
            "partialAlphaPixels",
            "despill",
        }
    ),
    ("processing", "alphaMatte", "despill"): frozenset(
        {
            "helper",
            "scope",
            "despillApplied",
            "globalColorAdjustmentApplied",
            "changedPixelCount",
            "changedOutsideEligibilityPixels",
            "alphaPixelsChanged",
            "beforeRgbaSha256",
            "afterRgbaSha256",
            "helperMetrics",
        }
    ),
    (
        "processing",
        "alphaMatte",
        "despill",
        "helperMetrics",
    ): frozenset(
        {
            "edgePixelCount",
            "strongMagentaEdgePixelsBefore",
            "strongMagentaEdgePixelsAfter",
            "strongMagentaEdgeRatioAfter",
            "despilledPixels",
            "alphaPixelsChanged",
        }
    ),
    ("processing", "masterCanvas"): frozenset(
        {"width", "height", "cropApplied", "fitRule", "resampleMode"}
    ),
    ("processing", "runtimeDerivation"): frozenset(
        {
            "source",
            "width",
            "height",
            "function",
            "resampleMode",
            "postResizeColorPassApplied",
            "postResizeDespillApplied",
        }
    ),
    ("processing", "duplicateGuard"): frozenset(
        {
            "method",
            "checkedExistingImages",
            "normalizedSize",
            "coarseNormalizedSize",
            "alphaIouThreshold",
            "meanAbsoluteErrorThreshold",
            "semanticProof",
        }
    ),
    ("assets",): frozenset(
        {
            "originalGeneratedPng",
            "rawLossless",
            "master",
            "runtime",
            "eligibilityMask",
            "alphaMask",
        }
    ),
    ("assets", "originalGeneratedPng"): frozenset(
        {"path", "sha256", "rgbaSha256", "width", "height", "mode", "format"}
    ),
    ("assets", "rawLossless"): frozenset(
        {"path", "sha256", "rgbaSha256", "width", "height", "mode", "format"}
    ),
    ("assets", "master"): frozenset(
        {"path", "sha256", "rgbaSha256", "width", "height", "mode", "format"}
    ),
    ("assets", "runtime"): frozenset(
        {"path", "sha256", "rgbaSha256", "width", "height", "mode", "format"}
    ),
    ("assets", "eligibilityMask"): frozenset(
        {"path", "sha256", "width", "height", "mode", "format", "nonzeroPixels"}
    ),
    ("assets", "alphaMask"): frozenset(
        {"path", "sha256", "width", "height", "mode", "format", "nonzeroPixels"}
    ),
    ("composition",): frozenset({"master", "runtime"}),
    ("composition", "master"): frozenset(
        {
            "visibleCoverage",
            "transparentCoverage",
            "visiblePixelCount",
            "visibleBbox",
            "minimumEdgeMargin",
            "edgeMargins",
            "cornerPatchSize",
            "cornerMaxAlpha",
        }
    ),
    ("composition", "master", "edgeMargins"): frozenset(
        {"left", "top", "right", "bottom"}
    ),
    ("composition", "master", "cornerMaxAlpha"): frozenset(
        {"topLeft", "topRight", "bottomLeft", "bottomRight"}
    ),
    ("composition", "runtime"): frozenset(
        {
            "visibleCoverage",
            "transparentCoverage",
            "visiblePixelCount",
            "visibleBbox",
            "minimumEdgeMargin",
            "edgeMargins",
            "cornerPatchSize",
            "cornerMaxAlpha",
        }
    ),
    ("composition", "runtime", "edgeMargins"): frozenset(
        {"left", "top", "right", "bottom"}
    ),
    ("composition", "runtime", "cornerMaxAlpha"): frozenset(
        {"topLeft", "topRight", "bottomLeft", "bottomRight"}
    ),
    ("evidence",): frozenset(
        {"contactSheet", "compactSizes", "nativeSize"}
    ),
    ("evidence", "contactSheet"): frozenset(
        {"path", "sha256", "rgbaSha256", "width", "height", "mode", "format"}
    ),
}


@dataclass(frozen=True)
class PortraitTarget:
    form_id: str
    pet_root: Path
    portrait_path: Path
    source: str
    catalog_path: Path | None = None


@dataclass
class PortraitFingerprint:
    form_id: str
    generation_id: str | None
    raw_rgba_sha256: str | None
    master_rgba_sha256: str | None
    runtime_rgba_sha256: str | None
    master_image: Image.Image | None
    runtime_image: Image.Image | None


def _read_json(path: Path, errors: list[str], label: str) -> dict[str, Any] | None:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        errors.append(f"{label}不可读取：{path}: {exc}")
        return None
    if not isinstance(value, dict):
        errors.append(f"{label}顶层必须是对象：{path}")
        return None
    return value


def _inside_repo(repo_root: Path, path: Path, label: str, errors: list[str]) -> Path | None:
    supplied_root = repo_root.absolute()
    root = repo_root.resolve()
    lexical = path if path.is_absolute() else supplied_root / path
    lexical = lexical.absolute()
    if lexical.is_symlink():
        errors.append(f"{label}路径不得包含符号链接：{lexical}")
        return None
    try:
        supplied_relative = lexical.relative_to(supplied_root)
    except ValueError:
        supplied_relative = None
    if supplied_relative is not None:
        current = supplied_root
        for part in supplied_relative.parts:
            current = current / part
            if current.is_symlink():
                errors.append(f"{label}路径不得包含符号链接：{current}")
                return None
    candidate = lexical.resolve()
    try:
        relative = candidate.relative_to(root)
    except ValueError:
        errors.append(f"{label}解析后逃出仓库：{candidate}")
        return None
    current = root
    for part in relative.parts:
        current = current / part
        if current.is_symlink():
            errors.append(f"{label}路径不得包含符号链接：{current}")
            return None
    return candidate


def _repo_relative(repo_root: Path, path: Path) -> str:
    try:
        return path.resolve().relative_to(repo_root.resolve()).as_posix()
    except ValueError:
        return str(path)


def _safe_record_path(
    repo_root: Path,
    value: Any,
    label: str,
    errors: list[str],
) -> Path | None:
    if not isinstance(value, str) or not value.strip():
        errors.append(f"{label}.path 缺失")
        return None
    relative = Path(value)
    if relative.is_absolute() or ".." in relative.parts:
        errors.append(f"{label}.path 必须是安全的仓库相对路径：{value!r}")
        return None
    return _inside_repo(repo_root, relative, f"{label}.path", errors)


def _valid_sha(value: Any) -> bool:
    return isinstance(value, str) and SHA256_PATTERN.fullmatch(value) is not None


def _check_portrait_metadata_exact_schema(
    metadata: dict[str, Any],
    *,
    form_id: str,
    errors: list[str],
) -> None:
    """Reject claim injection anywhere in the fixed builder metadata tree."""

    invalid_objects: set[tuple[str, ...]] = set()
    for path, expected_keys in sorted(
        PORTRAIT_METADATA_EXACT_KEYS.items(),
        key=lambda item: (len(item[0]), item[0]),
    ):
        if any(
            path[: len(invalid)] == invalid
            for invalid in invalid_objects
        ):
            continue
        value: Any = metadata
        for part in path:
            if not isinstance(value, dict):
                break
            value = value.get(part)
        label = (
            "portrait-meta"
            if not path
            else "portrait-meta." + ".".join(path)
        )
        if not isinstance(value, dict):
            errors.append(f"{form_id} {label} 必须是固定 schema 对象")
            invalid_objects.add(path)
            continue
        actual_keys = set(value)
        accepted_key_sets = {expected_keys}
        if not path:
            accepted_key_sets.add(expected_keys | {"releaseGate"})
        if actual_keys not in accepted_key_sets:
            missing = sorted(expected_keys - actual_keys)
            allowed_keys = (
                expected_keys | {"releaseGate"}
                if not path
                else expected_keys
            )
            extra = sorted(actual_keys - allowed_keys)
            errors.append(
                f"{form_id} {label} 字段集合不符合固定 schema："
                f"missing={missing}, extra={extra}"
            )


def _portable_relative_path(
    value: Any,
    *,
    first_part: str | None = None,
    suffix: str | None = None,
) -> bool:
    if not isinstance(value, str) or not value:
        return False
    path = Path(value)
    if path.is_absolute() or ".." in path.parts:
        return False
    if first_part is not None and (
        not path.parts or path.parts[0] != first_part
    ):
        return False
    return suffix is None or path.suffix.casefold() == suffix


def _strict_snapshot_object(
    value: Any,
    *,
    expected_keys: set[str],
    label: str,
    errors: list[str],
) -> dict[str, Any] | None:
    if not isinstance(value, dict):
        errors.append(f"{label} 必须是对象")
        return None
    if set(value) != expected_keys:
        missing = sorted(expected_keys - set(value))
        extra = sorted(set(value) - expected_keys)
        errors.append(
            f"{label} 字段集合不符合严格 schema："
            f"missing={missing}, extra={extra}"
        )
    return value


def _valid_nonnegative_int(value: Any) -> bool:
    return (
        isinstance(value, int)
        and not isinstance(value, bool)
        and value >= 0
    )


def _valid_positive_int(value: Any) -> bool:
    return (
        isinstance(value, int)
        and not isinstance(value, bool)
        and value > 0
    )


def _valid_snapshot_path_label(value: Any) -> bool:
    if not isinstance(value, str) or not value:
        return False
    if value.startswith("repository:"):
        return _portable_relative_path(value.removeprefix("repository:"))
    parts = Path(value).parts
    return (
        len(parts) == 4
        and parts[:2] == (".codex", "generated_images")
        and builder.SESSION_ID_PATTERN.fullmatch(parts[2]) is not None
        and (
            builder.CALL_GENERATION_ID_PATTERN.fullmatch(
                Path(parts[3]).stem
            )
            is not None
            or builder.EXEC_GENERATION_ID_PATTERN.fullmatch(
                Path(parts[3]).stem
            )
            is not None
        )
        and Path(parts[3]).suffix.casefold() == ".png"
    )


def _replay_formal_identity_relocation(
    *,
    value: Any,
    form_id: str,
    repo_root: Path,
    identity_reference: dict[str, Any],
    errors: list[str],
    label: str,
) -> bool:
    """Replay the frozen fusion relocation without trusting its snapshot.

    The portrait is built only after closed registration, so the formal root
    now legitimately contains the eleven portrait artifacts that the frozen
    registration manifest records as excluded.  Replaying the builder's
    original whole-tree check verbatim would therefore reject the completed
    portrait.  This audit instead binds every registered/excluded record and
    the complete three-step engineering dependency chain to current bytes,
    while the surrounding portrait audit validates those eleven new files.
    """

    expected_root = FORMAL_IDENTITY_RELOCATION_ROOTS.get(form_id)
    if expected_root is None:
        errors.append(f"{label} formal relocation 只允许两只正式融合形态")
        return False
    record = _strict_snapshot_object(
        value,
        expected_keys={
            "contract",
            "formId",
            "manifestPath",
            "manifestSha256",
            "sourceRoot",
            "destinationRoot",
            "identityRelativePath",
            "identitySha256",
            "identityByteLength",
            "ownerDecisionPath",
            "ownerDecisionSha256",
            "pipelineMetadataSha256",
            "sourceMetadataSha256",
            "actionMetadataSha256",
            "sourceSnapshotSha256",
            "isolatedSourceSnapshotSha256",
            "engineeringTransformCount",
            "runtimeEnabled",
            "playerEntryOpened",
            "portraitOwnerApprovalExcluded",
        },
        label=label,
        errors=errors,
    )
    if record is None:
        return False

    try:
        repo_root = repo_root.resolve()
        pet_root = builder._resolve_inside(
            repo_root,
            expected_root,
            f"{label} formal pet root",
        )
        expected_manifest = (
            pet_root / builder.CLOSED_REGISTRATION_MANIFEST_PATH
        )
        manifest_value = record.get("manifestPath")
        if (
            not isinstance(manifest_value, str)
            or Path(manifest_value).is_absolute()
            or "\\" in manifest_value
            or ".." in Path(manifest_value).parts
        ):
            raise builder.PortraitBuildError(
                "formal relocation manifestPath 非法"
            )
        manifest_path = builder._resolve_inside(
            repo_root,
            Path(manifest_value),
            f"{label} manifest",
        )
        if manifest_path != expected_manifest:
            raise builder.PortraitBuildError(
                "formal relocation manifestPath 未绑定正式 pet root"
            )
        manifest_bytes = builder._read_regular_file_snapshot(
            manifest_path,
            f"{label} manifest",
        )
        manifest_sha = builder.sha256_bytes(manifest_bytes)
        if record.get("manifestSha256") != manifest_sha:
            raise builder.PortraitBuildError(
                "formal relocation manifestSha256 与当前 manifest 不一致"
            )
        try:
            manifest_text = manifest_bytes.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise builder.PortraitBuildError(
                f"formal relocation manifest 必须是 UTF-8：{exc}"
            ) from exc
        manifest = builder._strict_json_object_text(
            manifest_text,
            f"{label} manifest",
        )
        expected_manifest_keys = (
            "schemaVersion",
            "manifestType",
            "tool",
            "formId",
            "displayName",
            "sourceRoot",
            "destinationRoot",
            "lifecycle",
            "frozenOwnerApproval",
            "validatedMatrices",
            "portrait",
            "sourceSnapshotSha256",
            "copiedFiles",
            "ownerApprovedVisualFiles",
            "engineeringSupportFiles",
            "engineeringRelocations",
            "engineeringIntegrityUpdates",
            "isolatedSourceSnapshotSha256",
        )
        if tuple(manifest) != expected_manifest_keys:
            raise builder.PortraitBuildError(
                "formal relocation manifest 顶层字段顺序或集合漂移"
            )
        expected_scalars = {
            "schemaVersion": 1,
            "manifestType": "fusion_pet_closed_asset_copy_registration",
            "tool": "register_fusion_pet_closed_assets.py",
            "formId": form_id,
        }
        for key, expected in expected_scalars.items():
            if manifest.get(key) != expected:
                raise builder.PortraitBuildError(
                    f"formal relocation manifest.{key} 漂移"
                )

        source_root = builder._resolve_inside(
            repo_root,
            Path(manifest.get("sourceRoot", "")),
            f"{label} sourceRoot",
        )
        destination_root = builder._resolve_inside(
            repo_root,
            Path(manifest.get("destinationRoot", "")),
            f"{label} destinationRoot",
        )
        try:
            source_root.relative_to((repo_root / ".run").resolve())
        except ValueError as exc:
            raise builder.PortraitBuildError(
                "formal relocation sourceRoot 必须位于 .run"
            ) from exc
        if (
            destination_root != pet_root
            or record.get("sourceRoot")
            != builder.repo_relative(source_root, repo_root)
            or record.get("destinationRoot")
            != builder.repo_relative(destination_root, repo_root)
        ):
            raise builder.PortraitBuildError(
                "formal relocation source/destination root 漂移"
            )

        expected_lifecycle = {
            "registrationStatus": "engineering_closed_asset_copy",
            "runtimeEnabled": False,
            "rideable": False,
            "petArtCatalogEdited": False,
            "fusionRecipeCatalogEdited": False,
            "playerEntryOpened": False,
            "ownerVisualDecisionApprovesThisEngineeringRegistration": False,
        }
        if manifest.get("lifecycle") != expected_lifecycle:
            raise builder.PortraitBuildError(
                "formal relocation lifecycle 未保持 runtime/entry 关闭"
            )
        if manifest.get("validatedMatrices") != {
            "identityVisualFiles": 5,
            "worldRuntimeFrames": 40,
            "worldSourceFrames": 40,
            "battleRuntimeFrames": 180,
            "battleSourceFrames": 180,
            "mountedFiles": 0,
        }:
            raise builder.PortraitBuildError(
                "formal relocation validatedMatrices 漂移"
            )

        frozen = manifest.get("frozenOwnerApproval")
        if not isinstance(frozen, dict) or set(frozen) != {
            "ownerDecision",
            "ownerReviewVideo",
            "scope",
            "excludedScope",
            "phase371BattleBundleDigest",
        }:
            raise builder.PortraitBuildError(
                "formal relocation frozenOwnerApproval schema 漂移"
            )
        if (
            frozen.get("scope")
            != list(builder.CLOSED_REGISTRATION_APPROVED_SCOPES)
            or frozen.get("excludedScope")
            != list(builder.CLOSED_REGISTRATION_EXCLUDED_SCOPES)
        ):
            raise builder.PortraitBuildError(
                "formal relocation owner scope/portrait exclusion 漂移"
            )
        owner_record = frozen.get("ownerDecision")
        video_record = frozen.get("ownerReviewVideo")
        if (
            not isinstance(owner_record, dict)
            or tuple(owner_record) != ("path", "sha256")
            or not isinstance(video_record, dict)
            or tuple(video_record)
            != ("path", "sha256", "playbackSpeed")
            or video_record.get("playbackSpeed") != "1.00x"
        ):
            raise builder.PortraitBuildError(
                "formal relocation owner evidence schema 漂移"
            )
        owner_path = builder._resolve_inside(
            repo_root,
            Path(owner_record.get("path", "")),
            f"{label} owner decision",
        )
        video_path = builder._resolve_inside(
            repo_root,
            Path(video_record.get("path", "")),
            f"{label} owner video",
        )
        owner_bytes = builder._read_regular_file_snapshot(
            owner_path,
            f"{label} owner decision",
        )
        video_bytes = builder._read_regular_file_snapshot(
            video_path,
            f"{label} owner video",
        )
        owner_sha = builder.sha256_bytes(owner_bytes)
        if (
            owner_record.get("sha256") != owner_sha
            or video_record.get("sha256")
            != builder.sha256_bytes(video_bytes)
            or record.get("ownerDecisionPath")
            != builder.repo_relative(owner_path, repo_root)
            or record.get("ownerDecisionSha256") != owner_sha
        ):
            raise builder.PortraitBuildError(
                "formal relocation owner evidence SHA/path 漂移"
            )
        owner_decision = builder._strict_json_object_text(
            owner_bytes.decode("utf-8"),
            f"{label} owner decision",
        )
        for key, expected in {
            "schemaVersion": 1,
            "decisionType": (
                "beastbound_pet_fusion_full_nonrideable_visual_owner_decision"
            ),
            "decision": "approved",
            "reviewer": "project-owner:fander",
            "approvedScopes": list(
                builder.CLOSED_REGISTRATION_APPROVED_SCOPES
            ),
            "excludedScopes": list(
                builder.CLOSED_REGISTRATION_EXCLUDED_SCOPES
            ),
            "releaseApproved": False,
            "runtimeEnabled": False,
        }.items():
            if owner_decision.get(key) != expected:
                raise builder.PortraitBuildError(
                    f"formal relocation owner decision {key} 漂移"
                )
        owner_forms = (
            owner_decision.get("evidence", {}).get("forms")
            if isinstance(owner_decision.get("evidence"), dict)
            else None
        )
        form_matches = [
            item
            for item in owner_forms or []
            if isinstance(item, dict) and item.get("formId") == form_id
        ]
        if (
            len(form_matches) != 1
            or form_matches[0].get("battleBundleDigest")
            != frozen.get("phase371BattleBundleDigest")
        ):
            raise builder.PortraitBuildError(
                "formal relocation owner decision 未唯一绑定当前 form"
            )

        portrait_record = manifest.get("portrait")
        if (
            not isinstance(portrait_record, dict)
            or tuple(portrait_record)
            != ("status", "builder", "copied", "excludedFiles")
            or portrait_record.get("status")
            != "pending_formal_rebuild_and_owner_review"
            or portrait_record.get("builder") != "build_pet_portrait"
            or portrait_record.get("copied") is not False
        ):
            raise builder.PortraitBuildError(
                "formal relocation portrait exclusion 状态漂移"
            )
        excluded_files = builder._closed_registration_file_index(
            portrait_record.get("excludedFiles"),
            label=f"{label} portrait.excludedFiles",
        )
        if set(excluded_files) != set(
            builder.CLOSED_REGISTRATION_PORTRAIT_EXCLUDED_PATHS
        ):
            raise builder.PortraitBuildError(
                "formal relocation portrait 11 文件排除集合漂移"
            )
        copied_files = builder._closed_registration_file_index(
            manifest.get("copiedFiles"),
            label=f"{label} copiedFiles",
        )
        approved_files = builder._closed_registration_file_index(
            manifest.get("ownerApprovedVisualFiles"),
            label=f"{label} ownerApprovedVisualFiles",
        )
        engineering_files = builder._closed_registration_file_index(
            manifest.get("engineeringSupportFiles"),
            label=f"{label} engineeringSupportFiles",
        )
        if (
            len(copied_files) != 675
            or len(approved_files) != 445
            or len(engineering_files) != 230
            or set(approved_files) & set(engineering_files)
            or set(copied_files)
            != set(approved_files) | set(engineering_files)
            or set(approved_files)
            != set(builder._closed_registration_expected_owner_visual_paths())
        ):
            raise builder.PortraitBuildError(
                "formal relocation 675/445/230 精确分区漂移"
            )
        for path_value, file_record in copied_files.items():
            if (
                approved_files.get(path_value) != file_record
                and engineering_files.get(path_value) != file_record
            ):
                raise builder.PortraitBuildError(
                    "formal relocation copied 分区记录未逐字段复用"
                )

        relocation_values = manifest.get("engineeringRelocations")
        integrity_values = manifest.get("engineeringIntegrityUpdates")
        if (
            not isinstance(relocation_values, list)
            or len(relocation_values) != 1
            or not isinstance(integrity_values, list)
            or len(integrity_values) != 2
        ):
            raise builder.PortraitBuildError(
                "formal relocation 必须精确包含 3 个 engineering transforms"
            )
        relocation = relocation_values[0]
        if (
            not isinstance(relocation, dict)
            or tuple(relocation)
            != (
                "path",
                "field",
                "from",
                "to",
                "sourceMetadataSha256",
                "sourceMetadataSize",
                "candidateMetadataSha256",
                "candidateMetadataSize",
                "inputAsset",
            )
            or relocation.get("path")
            != builder.CLOSED_REGISTRATION_PIPELINE_PATH
            or relocation.get("field") != "input"
        ):
            raise builder.PortraitBuildError(
                "formal relocation pipeline transform schema 漂移"
            )
        expected_integrity_paths = (
            builder.CLOSED_REGISTRATION_SOURCE_META_PATH,
            builder.CLOSED_REGISTRATION_ACTION_META_PATH,
        )
        expected_integrity_fields = (
            "pipelineMetadataSha256",
            "evidence.identityGateAudit.pipelineMetadata.sha256",
        )
        for index, update in enumerate(integrity_values):
            if (
                not isinstance(update, dict)
                or tuple(update)
                != (
                    "path",
                    "field",
                    "from",
                    "to",
                    "fieldUpdates",
                    "sourceMetadataSha256",
                    "sourceMetadataSize",
                    "candidateMetadataSha256",
                    "candidateMetadataSize",
                    "boundFile",
                )
                or update.get("path") != expected_integrity_paths[index]
                or update.get("field") != expected_integrity_fields[index]
            ):
                raise builder.PortraitBuildError(
                    f"formal relocation integrity transform {index} 漂移"
                )
        transforms = (relocation, *integrity_values)
        if {item["path"] for item in transforms} - set(engineering_files):
            raise builder.PortraitBuildError(
                "formal relocation transforms 未全部属于 engineering files"
            )

        source_copied_files = {
            path_value: dict(file_record)
            for path_value, file_record in copied_files.items()
        }
        source_payloads: dict[str, bytes] = {}
        candidate_payloads: dict[str, bytes] = {}
        for path_value, file_record in copied_files.items():
            candidate = builder._read_regular_file_snapshot(
                destination_root / path_value,
                f"{label} formal:{path_value}",
            )
            if (
                builder.sha256_bytes(candidate) != file_record["sha256"]
                or len(candidate) != file_record["size"]
            ):
                raise builder.PortraitBuildError(
                    f"formal relocation registered destination 漂移：{path_value}"
                )
        for item in transforms:
            path_value = item["path"]
            for digest_key in (
                "sourceMetadataSha256",
                "candidateMetadataSha256",
            ):
                digest = item.get(digest_key)
                if not isinstance(digest, str) or not SHA256_PATTERN.fullmatch(
                    digest
                ):
                    raise builder.PortraitBuildError(
                        f"formal relocation {path_value}.{digest_key} 非法"
                    )
            for size_key in ("sourceMetadataSize", "candidateMetadataSize"):
                size = item.get(size_key)
                if (
                    not isinstance(size, int)
                    or isinstance(size, bool)
                    or size <= 0
                ):
                    raise builder.PortraitBuildError(
                        f"formal relocation {path_value}.{size_key} 非法"
                    )
            final_record = copied_files.get(path_value)
            if final_record != {
                "path": path_value,
                "sha256": item["candidateMetadataSha256"],
                "size": item["candidateMetadataSize"],
            }:
                raise builder.PortraitBuildError(
                    f"formal relocation transform candidate 未绑定 copied：{path_value}"
                )
            source_payload = builder._read_regular_file_snapshot(
                source_root / path_value,
                f"{label} isolated:{path_value}",
            )
            candidate_payload = builder._read_regular_file_snapshot(
                destination_root / path_value,
                f"{label} formal:{path_value}",
            )
            if (
                builder.sha256_bytes(source_payload)
                != item["sourceMetadataSha256"]
                or len(source_payload) != item["sourceMetadataSize"]
                or builder.sha256_bytes(candidate_payload)
                != item["candidateMetadataSha256"]
                or len(candidate_payload) != item["candidateMetadataSize"]
            ):
                raise builder.PortraitBuildError(
                    f"formal relocation transform 当前字节漂移：{path_value}"
                )
            source_copied_files[path_value] = {
                "path": path_value,
                "sha256": item["sourceMetadataSha256"],
                "size": item["sourceMetadataSize"],
            }
            source_payloads[path_value] = source_payload
            candidate_payloads[path_value] = candidate_payload

        for path_value, file_record in source_copied_files.items():
            source_payload = builder._read_regular_file_snapshot(
                source_root / path_value,
                f"{label} isolated:{path_value}",
            )
            if (
                builder.sha256_bytes(source_payload) != file_record["sha256"]
                or len(source_payload) != file_record["size"]
            ):
                raise builder.PortraitBuildError(
                    f"formal relocation registered source 漂移：{path_value}"
                )
        for path_value, file_record in excluded_files.items():
            excluded_payload = builder._read_regular_file_snapshot(
                source_root / path_value,
                f"{label} isolated excluded:{path_value}",
            )
            if (
                builder.sha256_bytes(excluded_payload)
                != file_record["sha256"]
                or len(excluded_payload) != file_record["size"]
            ):
                raise builder.PortraitBuildError(
                    f"formal relocation isolated portrait exclusion 漂移：{path_value}"
                )

        final_snapshot = manifest.get("sourceSnapshotSha256")
        isolated_snapshot = manifest.get("isolatedSourceSnapshotSha256")
        expected_final_snapshot = builder.sha256_bytes(
            builder._closed_registration_json_bytes(
                [
                    *manifest["copiedFiles"],
                    *portrait_record["excludedFiles"],
                ]
            )
        )
        isolated_records = [
            dict(file_record) for file_record in manifest["copiedFiles"]
        ]
        isolated_by_path = {
            file_record["path"]: file_record
            for file_record in isolated_records
        }
        for item in transforms:
            isolated_by_path[item["path"]]["sha256"] = item[
                "sourceMetadataSha256"
            ]
            isolated_by_path[item["path"]]["size"] = item[
                "sourceMetadataSize"
            ]
        expected_isolated_snapshot = builder.sha256_bytes(
            builder._closed_registration_json_bytes(
                [
                    *isolated_records,
                    *portrait_record["excludedFiles"],
                ]
            )
        )
        if (
            final_snapshot != expected_final_snapshot
            or isolated_snapshot != expected_isolated_snapshot
        ):
            raise builder.PortraitBuildError(
                "formal relocation 双快照重放失败"
            )

        source_raw = (
            source_root / builder.CLOSED_REGISTRATION_IDENTITY_RAW_PATH
        )
        candidate_raw = (
            destination_root / builder.CLOSED_REGISTRATION_IDENTITY_RAW_PATH
        )
        source_raw_bytes = builder._read_regular_file_snapshot(
            source_raw,
            f"{label} isolated identity raw",
        )
        candidate_raw_bytes = builder._read_regular_file_snapshot(
            candidate_raw,
            f"{label} formal identity raw",
        )
        if source_raw_bytes != candidate_raw_bytes:
            raise builder.PortraitBuildError(
                "formal relocation identity raw 字节漂移"
            )
        old_input = builder.repo_relative(source_raw, repo_root)
        new_input = builder.repo_relative(candidate_raw, repo_root)
        input_asset = relocation.get("inputAsset")
        if (
            relocation.get("from") != old_input
            or relocation.get("to") != new_input
            or not isinstance(input_asset, dict)
            or tuple(input_asset) != ("path", "sha256")
            or input_asset.get("path") != new_input
            or input_asset.get("sha256")
            != builder.sha256_bytes(candidate_raw_bytes)
        ):
            raise builder.PortraitBuildError(
                "formal relocation pipeline input 映射漂移"
            )
        builder._closed_registration_replay_json_transform(
            source_payload=source_payloads[
                builder.CLOSED_REGISTRATION_PIPELINE_PATH
            ],
            candidate_payload=candidate_payloads[
                builder.CLOSED_REGISTRATION_PIPELINE_PATH
            ],
            updates=((("input",), old_input, new_input),),
            label=f"{label} pipeline transform",
        )
        pipeline_source_sha = relocation["sourceMetadataSha256"]
        pipeline_candidate_sha = relocation["candidateMetadataSha256"]
        source_replay_sha = (
            builder._closed_registration_pipeline_replay_sha256(
                source_payloads[
                    builder.CLOSED_REGISTRATION_PIPELINE_PATH
                ],
                raw_source=source_raw,
                label=f"{label} isolated pipeline replay",
            )
        )
        candidate_replay_sha = (
            builder._closed_registration_pipeline_replay_sha256(
                candidate_payloads[
                    builder.CLOSED_REGISTRATION_PIPELINE_PATH
                ],
                raw_source=candidate_raw,
                label=f"{label} formal pipeline replay",
            )
        )
        integrity_specs = (
            (
                integrity_values[0],
                (
                    (
                        ("pipelineMetadataSha256",),
                        "pipelineMetadataSha256",
                        "file_sha256",
                        pipeline_source_sha,
                        pipeline_candidate_sha,
                    ),
                ),
            ),
            (
                integrity_values[1],
                (
                    (
                        (
                            "evidence",
                            "identityGateAudit",
                            "pipelineMetadata",
                            "sha256",
                        ),
                        (
                            "evidence.identityGateAudit."
                            "pipelineMetadata.sha256"
                        ),
                        "file_sha256",
                        pipeline_source_sha,
                        pipeline_candidate_sha,
                    ),
                    (
                        (
                            "evidence",
                            "identityGateAudit",
                            "pipelineMetadata",
                            "metadataReplaySha256",
                        ),
                        (
                            "evidence.identityGateAudit.pipelineMetadata."
                            "metadataReplaySha256"
                        ),
                        "pipeline_metadata_replay_sha256",
                        source_replay_sha,
                        candidate_replay_sha,
                    ),
                ),
            ),
        )
        for update, field_specs in integrity_specs:
            expected_updates = [
                {
                    "field": field_name,
                    "digestKind": digest_kind,
                    "from": source_digest,
                    "to": candidate_digest,
                }
                for (
                    _field_path,
                    field_name,
                    digest_kind,
                    source_digest,
                    candidate_digest,
                ) in field_specs
            ]
            bound_file = update.get("boundFile")
            if (
                update.get("fieldUpdates") != expected_updates
                or update.get("from") != expected_updates[0]["from"]
                or update.get("to") != expected_updates[0]["to"]
                or not isinstance(bound_file, dict)
                or tuple(bound_file) != ("path", "sha256")
                or bound_file.get("path")
                != builder.repo_relative(
                    destination_root
                    / builder.CLOSED_REGISTRATION_PIPELINE_PATH,
                    repo_root,
                )
                or bound_file.get("sha256") != pipeline_candidate_sha
            ):
                raise builder.PortraitBuildError(
                    f"formal relocation integrity updates 漂移：{update['path']}"
                )
            builder._closed_registration_replay_json_transform(
                source_payload=source_payloads[update["path"]],
                candidate_payload=candidate_payloads[update["path"]],
                updates=tuple(
                    (field_path, source_digest, candidate_digest)
                    for (
                        field_path,
                        _field_name,
                        _digest_kind,
                        source_digest,
                        candidate_digest,
                    ) in field_specs
                ),
                label=f"{label} integrity:{update['path']}",
            )

        source_expected_references = {
            pipeline_source_sha: frozenset(
                {
                    (
                        builder.CLOSED_REGISTRATION_SOURCE_META_PATH,
                        ("pipelineMetadataSha256",),
                    ),
                    (
                        builder.CLOSED_REGISTRATION_ACTION_META_PATH,
                        (
                            "evidence",
                            "identityGateAudit",
                            "pipelineMetadata",
                            "sha256",
                        ),
                    ),
                }
            ),
            source_replay_sha: frozenset(
                {
                    (
                        builder.CLOSED_REGISTRATION_ACTION_META_PATH,
                        (
                            "evidence",
                            "identityGateAudit",
                            "pipelineMetadata",
                            "metadataReplaySha256",
                        ),
                    )
                }
            ),
            integrity_values[0]["sourceMetadataSha256"]: frozenset(),
            integrity_values[1]["sourceMetadataSha256"]: frozenset(),
        }
        candidate_expected_references = {
            pipeline_source_sha: frozenset(),
            source_replay_sha: frozenset(),
            pipeline_candidate_sha: frozenset(
                {
                    (
                        builder.CLOSED_REGISTRATION_SOURCE_META_PATH,
                        ("pipelineMetadataSha256",),
                    ),
                    (
                        builder.CLOSED_REGISTRATION_ACTION_META_PATH,
                        (
                            "evidence",
                            "identityGateAudit",
                            "pipelineMetadata",
                            "sha256",
                        ),
                    ),
                }
            ),
            candidate_replay_sha: frozenset(
                {
                    (
                        builder.CLOSED_REGISTRATION_ACTION_META_PATH,
                        (
                            "evidence",
                            "identityGateAudit",
                            "pipelineMetadata",
                            "metadataReplaySha256",
                        ),
                    )
                }
            ),
            integrity_values[0]["candidateMetadataSha256"]: frozenset(),
            integrity_values[1]["candidateMetadataSha256"]: frozenset(),
        }
        for digest, expected_references in source_expected_references.items():
            if (
                builder._closed_registration_hash_references(
                    root=source_root,
                    records=source_copied_files,
                    expected_hash=digest,
                    label=f"{label} isolated dependency graph",
                )
                != expected_references
            ):
                raise builder.PortraitBuildError(
                    f"formal relocation isolated dependency graph 漂移：{digest}"
                )
        for (
            digest,
            expected_references,
        ) in candidate_expected_references.items():
            if (
                builder._closed_registration_hash_references(
                    root=destination_root,
                    records=copied_files,
                    expected_hash=digest,
                    label=f"{label} formal dependency graph",
                )
                != expected_references
            ):
                raise builder.PortraitBuildError(
                    f"formal relocation formal dependency graph 漂移：{digest}"
                )

        for path_value in copied_files:
            if Path(path_value).suffix.casefold() != ".json":
                continue
            payload = builder._read_regular_file_snapshot(
                destination_root / path_value,
                f"{label} closed JSON:{path_value}",
            )
            value_to_check = builder._strict_json_object_text(
                payload.decode("utf-8"),
                f"{label} closed JSON:{path_value}",
            )
            builder._closed_registration_assert_json_closed(
                value_to_check,
                label=f"{label} closed JSON:{path_value}",
            )
        action_meta = builder._strict_json_object_text(
            candidate_payloads[
                builder.CLOSED_REGISTRATION_ACTION_META_PATH
            ].decode("utf-8"),
            f"{label} action metadata",
        )
        for key, expected in {
            "formId": form_id,
            "displayName": manifest.get("displayName"),
            "runtimeEnabled": False,
            "rideableTarget": False,
            "ownerReviewStatus": "pending",
            "supportedMountedCharacterIds": [],
        }.items():
            if action_meta.get(key) != expected:
                raise builder.PortraitBuildError(
                    f"formal relocation action metadata.{key} 未保持关闭"
                )

        identity_relative = record.get("identityRelativePath")
        if identity_relative != "identity/front_3quarter_sw.png":
            raise builder.PortraitBuildError(
                "formal relocation identityRelativePath 漂移"
            )
        historical_identity = source_root / identity_relative
        formal_identity = destination_root / identity_relative
        source_identity_bytes = builder._read_regular_file_snapshot(
            historical_identity,
            f"{label} historical identity",
        )
        formal_identity_bytes = builder._read_regular_file_snapshot(
            formal_identity,
            f"{label} formal identity",
        )
        if source_identity_bytes != formal_identity_bytes:
            raise builder.PortraitBuildError(
                "formal relocation historical/formal identity 字节漂移"
            )
        identity_sha = builder.sha256_bytes(formal_identity_bytes)
        identity_size = len(formal_identity_bytes)
        identity_file_record = copied_files.get(identity_relative)
        if (
            approved_files.get(identity_relative) != identity_file_record
            or identity_file_record
            != {
                "path": identity_relative,
                "sha256": identity_sha,
                "size": identity_size,
            }
            or identity_reference.get("path")
            != builder.repo_relative(formal_identity, repo_root)
            or identity_reference.get("sha256") != identity_sha
        ):
            raise builder.PortraitBuildError(
                "formal relocation identity 未绑定 copied/approved/current metadata"
            )

        expected_evidence = {
            "contract": "fusion_pet_formal_identity_relocation_v1",
            "formId": form_id,
            "manifestPath": builder.repo_relative(manifest_path, repo_root),
            "manifestSha256": manifest_sha,
            "sourceRoot": builder.repo_relative(source_root, repo_root),
            "destinationRoot": builder.repo_relative(
                destination_root,
                repo_root,
            ),
            "identityRelativePath": identity_relative,
            "identitySha256": identity_sha,
            "identityByteLength": identity_size,
            "ownerDecisionPath": builder.repo_relative(
                owner_path,
                repo_root,
            ),
            "ownerDecisionSha256": owner_sha,
            "pipelineMetadataSha256": pipeline_candidate_sha,
            "sourceMetadataSha256": integrity_values[0][
                "candidateMetadataSha256"
            ],
            "actionMetadataSha256": integrity_values[1][
                "candidateMetadataSha256"
            ],
            "sourceSnapshotSha256": final_snapshot,
            "isolatedSourceSnapshotSha256": isolated_snapshot,
            "engineeringTransformCount": 3,
            "runtimeEnabled": False,
            "playerEntryOpened": False,
            "portraitOwnerApprovalExcluded": True,
        }
        if record != expected_evidence:
            raise builder.PortraitBuildError(
                "formal relocation attestation snapshot 与当前完整重放不一致"
            )
    except (
        builder.PortraitBuildError,
        OSError,
        UnicodeError,
        ValueError,
        TypeError,
    ) as exc:
        errors.append(f"{label} 无法严格重放：{exc}")
        return False
    return True


def _check_request_reference_snapshot(
    *,
    value: Any,
    expected_index: int,
    form_id: str | None,
    repo_root: Path,
    identity_reference: dict[str, Any],
    errors: list[str],
    label: str,
) -> bool:
    base_keys = {
        "index",
        "pathLabel",
        "role",
        "matchesDeclaredIdentityReference",
        "currentFileSha256",
        "currentFileByteLength",
        "currentFileWidth",
        "currentFileHeight",
        "currentFileFormat",
        "currentFileMode",
        "historicalRequestBytesVerified",
    }
    has_formal_relocation = (
        isinstance(value, dict)
        and "formalIdentityRelocation" in value
    )
    record = _strict_snapshot_object(
        value,
        expected_keys=(
            base_keys | {"formalIdentityRelocation"}
            if has_formal_relocation
            else base_keys
        ),
        label=label,
        errors=errors,
    )
    if record is None:
        return False
    if record.get("index") != expected_index:
        errors.append(f"{label}.index 必须连续且从 0 开始")
    if not _valid_snapshot_path_label(record.get("pathLabel")):
        errors.append(f"{label}.pathLabel 非法")
    role = record.get("role")
    allowed_roles = {
        "declared_identity_reference",
        "pet_identity_supporting_reference",
        "workspace_iteration_reference",
        "codex_generated_iteration_reference",
        "repository_reference",
    }
    if has_formal_relocation:
        allowed_roles.add("relocated_declared_identity_reference")
    if role not in allowed_roles:
        errors.append(f"{label}.role 非法")
    matches_identity = record.get(
        "matchesDeclaredIdentityReference"
    )
    if not isinstance(matches_identity, bool):
        errors.append(
            f"{label}.matchesDeclaredIdentityReference 必须是布尔值"
        )
        matches_identity = False
    if not _valid_sha(record.get("currentFileSha256")):
        errors.append(f"{label}.currentFileSha256 非法")
    for field in (
        "currentFileByteLength",
        "currentFileWidth",
        "currentFileHeight",
    ):
        if not _valid_positive_int(record.get(field)):
            errors.append(f"{label}.{field} 必须是正整数")
    if not isinstance(record.get("currentFileFormat"), str) or not record.get(
        "currentFileFormat"
    ):
        errors.append(f"{label}.currentFileFormat 缺失")
    if not isinstance(record.get("currentFileMode"), str) or not record.get(
        "currentFileMode"
    ):
        errors.append(f"{label}.currentFileMode 缺失")
    if record.get("historicalRequestBytesVerified") is not False:
        errors.append(
            f"{label}.historicalRequestBytesVerified 必须诚实标为 false"
        )

    if matches_identity:
        expected_path = identity_reference.get("path")
        expected_label = (
            f"repository:{expected_path}"
            if isinstance(expected_path, str)
            else None
        )
        if record.get("pathLabel") != expected_label:
            errors.append(
                f"{label} declared identity pathLabel "
                "未绑定 metadata.identityReference"
            )
        if role != "declared_identity_reference":
            errors.append(
                f"{label} declared identity role 不一致"
            )
        expected_fields = {
            "currentFileSha256": identity_reference.get("sha256"),
            "currentFileWidth": identity_reference.get("width"),
            "currentFileHeight": identity_reference.get("height"),
            "currentFileFormat": identity_reference.get("format"),
            "currentFileMode": identity_reference.get("mode"),
        }
        for field, expected in expected_fields.items():
            if record.get(field) != expected:
                errors.append(
                    f"{label}.{field} 未绑定 metadata.identityReference"
                )
        if isinstance(expected_path, str):
            identity_path = _safe_record_path(
                repo_root,
                expected_path,
                f"{label} declared identity",
                errors,
            )
            if (
                identity_path is not None
                and identity_path.is_file()
                and record.get("currentFileByteLength")
                != identity_path.stat().st_size
            ):
                errors.append(
                    f"{label}.currentFileByteLength "
                    "与 declared identity 文件不一致"
                )
    elif role == "declared_identity_reference":
        errors.append(
            f"{label} 非 identity reference 不得使用 declared role"
        )
    formal_matches = False
    if has_formal_relocation:
        if form_id not in FORMAL_IDENTITY_RELOCATION_ROOTS:
            errors.append(
                f"{label} legacy/non-fusion form 不得声明 formal relocation"
            )
        elif (
            role != "relocated_declared_identity_reference"
            or matches_identity is not False
        ):
            errors.append(
                f"{label} formal relocation role/matchesDeclaredIdentityReference "
                "状态不一致"
            )
        else:
            formal_matches = _replay_formal_identity_relocation(
                value=record.get("formalIdentityRelocation"),
                form_id=form_id,
                repo_root=repo_root,
                identity_reference=identity_reference,
                errors=errors,
                label=f"{label}.formalIdentityRelocation",
            )
            path_label = record.get("pathLabel")
            if (
                not isinstance(path_label, str)
                or not path_label.startswith("repository:.run/")
            ):
                errors.append(
                    f"{label} relocated identity pathLabel 必须指向 .run"
                )
                formal_matches = False
            else:
                historical_path = _safe_record_path(
                    repo_root,
                    path_label.removeprefix("repository:"),
                    f"{label} relocated identity",
                    errors,
                )
                if historical_path is not None and historical_path.is_file():
                    try:
                        with Image.open(historical_path) as opened:
                            expected_snapshot = {
                                "currentFileSha256": builder.sha256_file(
                                    historical_path
                                ),
                                "currentFileByteLength": (
                                    historical_path.stat().st_size
                                ),
                                "currentFileWidth": opened.width,
                                "currentFileHeight": opened.height,
                                "currentFileFormat": opened.format,
                                "currentFileMode": opened.mode,
                            }
                    except (OSError, UnidentifiedImageError) as exc:
                        errors.append(
                            f"{label} relocated identity 无法读取：{exc}"
                        )
                        formal_matches = False
                    else:
                        for field, expected in expected_snapshot.items():
                            if record.get(field) != expected:
                                errors.append(
                                    f"{label}.{field} 未绑定 relocated identity"
                                )
                                formal_matches = False
    elif role == "relocated_declared_identity_reference":
        errors.append(
            f"{label} relocated role 必须同时携带 formalIdentityRelocation"
        )
    return bool(matches_identity or formal_matches)


def _check_predecessor_lineage_snapshot(
    *,
    value: Any,
    repo_root: Path,
    identity_reference: dict[str, Any],
    errors: list[str],
    label: str,
) -> None:
    record = _strict_snapshot_object(
        value,
        expected_keys={
            "contract",
            "outputPathLabel",
            "outputSha256",
            "resultEvidencePath",
            "resultEvidenceSha256",
            "generationId",
            "generatorSource",
            "generatorSourceSha256",
            "transcriptPath",
            "requestByteOffset",
            "requestRecordSha256",
            "requestArgumentsUtf8Sha256",
            "requestPromptUtf8Sha256",
            "requestPromptHeuristicPassed",
            "requestReferencedImages",
            "declaredIdentityReferenceIncluded",
            "eventByteOffset",
            "eventRecordSha256",
            "eventOutputSha256",
            "eventOutputByteLength",
            "historicalReferencedImageBytesVerified",
            "claimLimit",
        },
        label=label,
        errors=errors,
    )
    if record is None:
        return
    if (
        record.get("contract")
        != "imagegen_same_form_predecessor_lineage_v1"
    ):
        errors.append(f"{label}.contract 错误")
    output_label = record.get("outputPathLabel")
    if (
        not isinstance(output_label, str)
        or not output_label.startswith("repository:")
        or not _portable_relative_path(
            output_label.removeprefix("repository:"),
            first_part=".run",
            suffix=".png",
        )
    ):
        errors.append(f"{label}.outputPathLabel 必须是 .run PNG 标签")
    output_sha = record.get("outputSha256")
    if not _valid_sha(output_sha):
        errors.append(f"{label}.outputSha256 非法")
    if not _portable_relative_path(
        record.get("resultEvidencePath"),
        first_part=".run",
        suffix=".txt",
    ):
        errors.append(f"{label}.resultEvidencePath 非法")
    for field in (
        "resultEvidenceSha256",
        "generatorSourceSha256",
        "requestRecordSha256",
        "requestArgumentsUtf8Sha256",
        "requestPromptUtf8Sha256",
        "eventRecordSha256",
        "eventOutputSha256",
    ):
        if not _valid_sha(record.get(field)):
            errors.append(f"{label}.{field} 非法")
    generation_id = record.get("generationId")
    if (
        not isinstance(generation_id, str)
        or builder.CALL_GENERATION_ID_PATTERN.fullmatch(generation_id)
        is None
    ):
        errors.append(f"{label}.generationId 不是 direct ImageGen call")
    generator_source = record.get("generatorSource")
    source_parts = (
        Path(generator_source).parts
        if isinstance(generator_source, str)
        else ()
    )
    if not (
        len(source_parts) == 4
        and source_parts[:2] == (".codex", "generated_images")
        and builder.SESSION_ID_PATTERN.fullmatch(source_parts[2])
        is not None
        and source_parts[3] == f"{generation_id}.png"
    ):
        errors.append(f"{label}.generatorSource 非 canonical 标签")
    if (
        _valid_sha(output_sha)
        and record.get("generatorSourceSha256") != output_sha
    ):
        errors.append(
            f"{label}.generatorSourceSha256 未绑定 predecessor output"
        )
    transcript_path = record.get("transcriptPath")
    if (
        not isinstance(transcript_path, str)
        or (
            not transcript_path.startswith("sessions/")
            and not transcript_path.startswith("archived_sessions/")
        )
        or not transcript_path.endswith(".jsonl")
        or ".." in Path(transcript_path).parts
    ):
        errors.append(f"{label}.transcriptPath 非法")
    elif (
        len(source_parts) == 4
        and source_parts[2] not in Path(transcript_path).name
    ):
        errors.append(
            f"{label}.transcriptPath 未绑定 generatorSource session"
        )
    for field in ("requestByteOffset", "eventByteOffset"):
        if not _valid_nonnegative_int(record.get(field)):
            errors.append(f"{label}.{field} 非法")
    if record.get("requestPromptHeuristicPassed") is not True:
        errors.append(
            f"{label}.requestPromptHeuristicPassed 必须为 true"
        )
    references = record.get("requestReferencedImages")
    matched_identity = False
    if not isinstance(references, list) or not references:
        errors.append(
            f"{label}.requestReferencedImages 必须是非空数组"
        )
    else:
        for index, reference in enumerate(references):
            matched_identity = (
                _check_request_reference_snapshot(
                    value=reference,
                    expected_index=index,
                    form_id=None,
                    repo_root=repo_root,
                    identity_reference=identity_reference,
                    errors=errors,
                    label=f"{label}.requestReferencedImages[{index}]",
                )
                or matched_identity
            )
    if record.get("declaredIdentityReferenceIncluded") is not True:
        errors.append(
            f"{label}.declaredIdentityReferenceIncluded 必须为 true"
        )
    if not matched_identity:
        errors.append(
            f"{label} predecessor request 未绑定 declared identity"
        )
    if (
        _valid_sha(output_sha)
        and record.get("eventOutputSha256") != output_sha
    ):
        errors.append(
            f"{label}.eventOutputSha256 未绑定 predecessor output"
        )
    if not _valid_positive_int(record.get("eventOutputByteLength")):
        errors.append(f"{label}.eventOutputByteLength 非法")
    if record.get("historicalReferencedImageBytesVerified") is not False:
        errors.append(
            f"{label}.historicalReferencedImageBytesVerified "
            "必须诚实标为 false"
        )
    if record.get("claimLimit") != PREDECESSOR_LINEAGE_CLAIM_LIMIT:
        errors.append(f"{label}.claimLimit 错误")


def _check_request_prompt_snapshot(
    *,
    value: Any,
    repo_root: Path,
    prompt_record: dict[str, Any],
    errors: list[str],
    label: str,
) -> None:
    record = _strict_snapshot_object(
        value,
        expected_keys={
            "contract",
            "requestPromptUtf8Sha256",
            "requestPromptUtf8ByteLength",
            "requestPromptHeuristicPassed",
            "selectedPromptPath",
            "selectedPromptFileSha256",
            "selectedPromptRelation",
            "requestPromptSourcePath",
            "requestPromptSourceFileSha256",
        },
        label=label,
        errors=errors,
    )
    if record is None:
        return
    if record.get("contract") != "imagegen_request_prompt_binding_v1":
        errors.append(f"{label}.contract 错误")
    for field in (
        "requestPromptUtf8Sha256",
        "selectedPromptFileSha256",
        "requestPromptSourceFileSha256",
    ):
        if not _valid_sha(record.get(field)):
            errors.append(f"{label}.{field} 非法")
    if not _valid_positive_int(record.get("requestPromptUtf8ByteLength")):
        errors.append(f"{label}.requestPromptUtf8ByteLength 非法")
    if record.get("requestPromptHeuristicPassed") is not True:
        errors.append(
            f"{label}.requestPromptHeuristicPassed 必须为 true"
        )
    for field in ("selectedPromptPath", "requestPromptSourcePath"):
        if not _portable_relative_path(
            record.get(field),
            first_part=".run",
            suffix=".txt",
        ):
            errors.append(f"{label}.{field} 必须是 .run 内相对 txt")
    relation = record.get("selectedPromptRelation")
    if relation not in {
        "selected_prompt_exact_ignoring_terminal_newlines_v1",
        "explicit_actual_request_prompt_file_v1",
    }:
        errors.append(f"{label}.selectedPromptRelation 非法")
    expected_pairs = {
        "selectedPromptPath": prompt_record.get(
            "selectionDocumentationPath"
        ),
        "selectedPromptFileSha256": prompt_record.get(
            "selectionDocumentationSha256"
        ),
        "requestPromptUtf8Sha256": prompt_record.get("sourceSha256"),
    }
    for field, expected in expected_pairs.items():
        if record.get(field) != expected:
            errors.append(
                f"{label}.{field} 未绑定 portrait prompt metadata"
            )
    installed_prompt_path = _safe_record_path(
        repo_root,
        prompt_record.get("path"),
        f"{label} installed prompt",
        errors,
    )
    if (
        installed_prompt_path is not None
        and installed_prompt_path.is_file()
        and record.get("requestPromptUtf8ByteLength")
        != installed_prompt_path.stat().st_size
    ):
        errors.append(
            f"{label}.requestPromptUtf8ByteLength "
            "与 installed prompt bytes 不一致"
        )
    selected_path = record.get("selectedPromptPath")
    source_path = record.get("requestPromptSourcePath")
    if relation == "selected_prompt_exact_ignoring_terminal_newlines_v1":
        if (
            source_path != selected_path
            or record.get("requestPromptSourceFileSha256")
            != record.get("selectedPromptFileSha256")
        ):
            errors.append(
                f"{label} selected-exact relation 的 source path/hash "
                "必须等于 selected prompt"
            )
    elif relation == "explicit_actual_request_prompt_file_v1":
        if source_path == selected_path:
            errors.append(
                f"{label} explicit actual request prompt 必须是独立文件"
            )

    for path_field, sha_field in (
        ("selectedPromptPath", "selectedPromptFileSha256"),
        ("requestPromptSourcePath", "requestPromptSourceFileSha256"),
    ):
        path_value = record.get(path_field)
        if not isinstance(path_value, str):
            continue
        candidate = (repo_root / path_value).resolve()
        try:
            candidate.relative_to((repo_root / ".run").resolve())
        except ValueError:
            continue
        if candidate.is_file() and (
            builder.sha256_file(candidate) != record.get(sha_field)
        ):
            errors.append(
                f"{label}.{sha_field} 与仍存在的 {path_field} 文件不一致"
            )
    if (
        installed_prompt_path is not None
        and installed_prompt_path.is_file()
        and isinstance(source_path, str)
    ):
        request_source = (repo_root / source_path).resolve()
        try:
            request_source.relative_to((repo_root / ".run").resolve())
        except ValueError:
            request_source = Path()
        if request_source.is_file():
            try:
                installed_text = installed_prompt_path.read_text(
                    encoding="utf-8"
                ).rstrip("\r\n")
                source_text = request_source.read_text(
                    encoding="utf-8"
                ).rstrip("\r\n")
            except (OSError, UnicodeError) as exc:
                errors.append(
                    f"{label} prompt snapshot 无法按 UTF-8 复核：{exc}"
                )
            else:
                if installed_text != source_text:
                    errors.append(
                        f"{label} request prompt source "
                        "与 installed prompt 文本不一致"
                    )
    if (
        prompt_record.get("sourceKind") != "actual_imagegen_request"
        or prompt_record.get("actualRequestPromptVerified") is not True
    ):
        errors.append(
            f"{label} direct request 与 portrait prompt sourceKind 不一致"
        )


def _check_identity_lineage_snapshot(
    *,
    value: Any,
    form_id: str,
    reference_mode: Any,
    declared_identity_included: Any,
    formal_relocations: list[dict[str, Any]],
    repo_root: Path,
    identity_reference: dict[str, Any],
    errors: list[str],
    label: str,
) -> None:
    formal_required = form_id in FORMAL_IDENTITY_RELOCATION_ROOTS
    relocation_mode = bool(
        isinstance(value, dict)
        and value.get("mode")
        == "relocated_direct_declared_identity_reference"
    )
    lineage = _strict_snapshot_object(
        value,
        expected_keys=(
            {
                "contract",
                "verified",
                "mode",
                "predecessors",
                "formalRelocations",
            }
            if formal_required and relocation_mode
            else {"contract", "verified", "mode", "predecessors"}
        ),
        label=label,
        errors=errors,
    )
    if lineage is None:
        return
    if lineage.get("contract") != "imagegen_request_identity_lineage_v1":
        errors.append(f"{label}.contract 错误")
    predecessors = lineage.get("predecessors")
    if not isinstance(predecessors, list):
        errors.append(f"{label}.predecessors 必须是数组")
        predecessors = []
    mode = lineage.get("mode")
    if reference_mode == "conversation_history":
        if (
            lineage.get("verified") is not False
            or mode
            != "unrecoverable_conversation_history_compatibility"
            or predecessors
            or declared_identity_included is not None
        ):
            errors.append(
                f"{label} conversation-history lineage 必须诚实未验证"
            )
        return
    if reference_mode == "unknown":
        if (
            lineage.get("verified") is not False
            or mode != "unavailable_exec_request_compatibility"
            or predecessors
            or declared_identity_included is not None
        ):
            errors.append(
                f"{label} exec lineage 必须诚实标为 unavailable"
            )
        return
    if reference_mode != "explicit_paths":
        errors.append(f"{label} 无法绑定未知 referenceMode")
        return
    if lineage.get("verified") is not True:
        errors.append(f"{label}.verified 必须为 true")
    if formal_required:
        if mode == "relocated_direct_declared_identity_reference":
            if (
                declared_identity_included is not True
                or predecessors
                or len(formal_relocations) != 1
                or lineage.get("formalRelocations")
                != formal_relocations
            ):
                errors.append(
                    f"{label} formal relocation lineage 内容/role/mode 不一致"
                )
        elif mode == "direct_declared_identity_reference":
            if (
                declared_identity_included is not True
                or predecessors
                or formal_relocations
            ):
                errors.append(
                    f"{label} formal direct identity lineage 内容不一致"
                )
        else:
            errors.append(
                f"{label} formal identity lineage mode 非法"
            )
    elif mode == "direct_declared_identity_reference":
        if declared_identity_included is not True or predecessors:
            errors.append(
                f"{label} direct identity lineage 内容不一致"
            )
    elif mode == "same_form_predecessor_generation":
        if declared_identity_included is not False or not predecessors:
            errors.append(
                f"{label} predecessor lineage 内容不一致"
            )
        for index, predecessor in enumerate(predecessors):
            _check_predecessor_lineage_snapshot(
                value=predecessor,
                repo_root=repo_root,
                identity_reference=identity_reference,
                errors=errors,
                label=f"{label}.predecessors[{index}]",
            )
    else:
        errors.append(f"{label}.mode 非法")


def _check_request_argument_snapshot(
    *,
    value: Any,
    generation_id: Any,
    form_id: str,
    repo_root: Path,
    identity_reference: dict[str, Any],
    prompt_record: dict[str, Any],
    errors: list[str],
    prefix: str,
) -> None:
    label = f"{prefix} requestArgumentBinding"
    binding = _strict_snapshot_object(
        value,
        expected_keys={
            "contract",
            "requestArgumentBindingVerified",
            "unverifiedReason",
            "argumentsUtf8Sha256",
            "argumentsUtf8ByteLength",
            "argumentsCanonicalJsonSha256",
            "argumentKeys",
            "prompt",
            "documentedPrompt",
            "referenceMode",
            "numLastImagesToInclude",
            "referencedImages",
            "identityLineage",
            "compatibilityMode",
            "automaticApprovalEligible",
            "currentReferencedImageContentBound",
            "historicalReferencedImageBytesVerified",
            "declaredIdentityReferenceIncluded",
            "claimLimit",
        },
        label=label,
        errors=errors,
    )
    if binding is None:
        return
    if binding.get("contract") != "imagegen_request_arguments_binding_v1":
        errors.append(f"{label}.contract 错误")
    if binding.get("automaticApprovalEligible") is not False:
        errors.append(
            f"{label}.automaticApprovalEligible 必须为 false"
        )
    if binding.get("historicalReferencedImageBytesVerified") is not False:
        errors.append(
            f"{label}.historicalReferencedImageBytesVerified "
            "必须诚实标为 false"
        )

    verified_request = (
        binding.get("requestArgumentBindingVerified") is True
    )
    valid_generation_id = bool(
        isinstance(generation_id, str)
        and (
            builder.CALL_GENERATION_ID_PATTERN.fullmatch(generation_id)
            is not None
            or builder.EXEC_GENERATION_ID_PATTERN.fullmatch(generation_id)
            is not None
        )
    )
    if verified_request:
        if not valid_generation_id:
            errors.append(
                f"{label} verified request generationId 格式非法"
            )
        if binding.get("requestArgumentBindingVerified") is not True:
            errors.append(
                f"{label} verified request import attestation "
                "必须记录 verified=true"
            )
        if binding.get("unverifiedReason") is not None:
            errors.append(f"{label}.unverifiedReason 必须为 null")
        for field in (
            "argumentsUtf8Sha256",
            "argumentsCanonicalJsonSha256",
        ):
            if not _valid_sha(binding.get(field)):
                errors.append(f"{label}.{field} 非法")
        if not _valid_positive_int(binding.get("argumentsUtf8ByteLength")):
            errors.append(f"{label}.argumentsUtf8ByteLength 非法")
        _check_request_prompt_snapshot(
            value=binding.get("prompt"),
            repo_root=repo_root,
            prompt_record=prompt_record,
            errors=errors,
            label=f"{label}.prompt",
        )
        if binding.get("documentedPrompt") is not None:
            errors.append(
                f"{label}.documentedPrompt verified request 必须为 null"
            )
        if binding.get("claimLimit") != DIRECT_REQUEST_CLAIM_LIMIT:
            errors.append(f"{label}.claimLimit 错误")

        reference_mode = binding.get("referenceMode")
        references = binding.get("referencedImages")
        if not isinstance(references, list):
            errors.append(f"{label}.referencedImages 必须是数组")
            references = []
        matched_identity = False
        direct_identity_reference_count = 0
        formal_relocations: list[dict[str, Any]] = []
        for index, reference in enumerate(references):
            if (
                isinstance(reference, dict)
                and reference.get("matchesDeclaredIdentityReference")
                is True
                and reference.get("role")
                == "declared_identity_reference"
            ):
                direct_identity_reference_count += 1
            if (
                isinstance(reference, dict)
                and isinstance(
                    reference.get("formalIdentityRelocation"),
                    dict,
                )
            ):
                formal_relocations.append(
                    reference["formalIdentityRelocation"]
                )
            matched_identity = (
                _check_request_reference_snapshot(
                    value=reference,
                    expected_index=index,
                    form_id=form_id,
                    repo_root=repo_root,
                    identity_reference=identity_reference,
                    errors=errors,
                    label=f"{label}.referencedImages[{index}]",
                )
                or matched_identity
            )
        declared_identity = binding.get(
            "declaredIdentityReferenceIncluded"
        )
        if reference_mode == "explicit_paths":
            if binding.get("argumentKeys") != [
                "prompt",
                "referenced_image_paths",
            ]:
                errors.append(
                    f"{label}.argumentKeys 与 explicit_paths 不一致"
                )
            if binding.get("numLastImagesToInclude") is not None:
                errors.append(
                    f"{label}.numLastImagesToInclude 必须为 null"
                )
            if not references:
                errors.append(
                    f"{label}.referencedImages explicit_paths 不得为空"
                )
            if binding.get("currentReferencedImageContentBound") is not True:
                errors.append(
                    f"{label}.currentReferencedImageContentBound "
                    "必须为 true"
                )
            if declared_identity is not matched_identity:
                errors.append(
                    f"{label}.declaredIdentityReferenceIncluded "
                    "与引用快照不一致"
                )
            if form_id in FORMAL_IDENTITY_RELOCATION_ROOTS:
                valid_direct = bool(
                    direct_identity_reference_count == 1
                    and not formal_relocations
                )
                valid_relocation = bool(
                    direct_identity_reference_count == 0
                    and len(formal_relocations) == 1
                )
                if not (valid_direct or valid_relocation):
                    errors.append(
                        f"{label} 正式融合形态必须精确使用一份当前正式身份"
                        "引用或一份 formal relocation"
                    )
            if (
                form_id not in FORMAL_IDENTITY_RELOCATION_ROOTS
                and formal_relocations
            ):
                errors.append(
                    f"{label} legacy 形态不得携带 formal relocation"
                )
            if binding.get("compatibilityMode") is not None:
                errors.append(
                    f"{label}.compatibilityMode "
                    "不得用于可验证 explicit_paths"
                )
        elif reference_mode == "conversation_history":
            expected_compatibility = (
                REQUEST_ARGUMENT_COMPATIBILITY_BY_FORM.get(form_id)
            )
            if (
                expected_compatibility
                != "historical_conversation_image_request_owner_pending_v1"
                or binding.get("compatibilityMode")
                != expected_compatibility
            ):
                errors.append(
                    f"{label} conversation-history 兼容只允许 "
                    "driftfox_highland_wind9_earth1"
                )
            if binding.get("argumentKeys") != [
                "num_last_images_to_include",
                "prompt",
            ]:
                errors.append(
                    f"{label}.argumentKeys 与 conversation_history 不一致"
                )
            history_count = binding.get("numLastImagesToInclude")
            if (
                not isinstance(history_count, int)
                or isinstance(history_count, bool)
                or not 1 <= history_count <= 5
            ):
                errors.append(
                    f"{label}.numLastImagesToInclude 必须是 1..5"
                )
            if references:
                errors.append(
                    f"{label}.referencedImages conversation_history 必须为空"
                )
            if (
                binding.get("currentReferencedImageContentBound")
                is not False
                or declared_identity is not None
            ):
                errors.append(
                    f"{label} conversation-history "
                    "不得虚报当前引用内容已绑定"
                )
        else:
            errors.append(f"{label}.referenceMode 非法")
        _check_identity_lineage_snapshot(
            value=binding.get("identityLineage"),
            form_id=form_id,
            reference_mode=reference_mode,
            declared_identity_included=declared_identity,
            formal_relocations=formal_relocations,
            repo_root=repo_root,
            identity_reference=identity_reference,
            errors=errors,
            label=f"{label}.identityLineage",
        )
        return

    if (
        not isinstance(generation_id, str)
        or builder.EXEC_GENERATION_ID_PATTERN.fullmatch(generation_id)
        is None
    ):
        errors.append(
            f"{label} unverified request 只允许历史 exec generationId"
        )
    errors.append(
        f"{label} exec request snapshot 没有可验证 direct ImageGen "
        "request，任何 form 都不得进入 production candidate"
    )


def _check_generation_attestation_snapshot(
    *,
    evidence: Any,
    generation_id: Any,
    form_id: str,
    repo_root: Path,
    identity_reference: dict[str, Any],
    prompt_record: dict[str, Any],
    original_generated_path: Path,
    original_input: dict[str, Any],
    errors: list[str],
    prefix: str,
) -> dict[str, Any] | None:
    """Validate the installed import snapshot without overstating its proof."""

    if not isinstance(evidence, dict):
        errors.append(f"{prefix} generationResultEvidence metadata 缺失")
        return None
    expected_keys = {
        "contract",
        "path",
        "sha256",
        "selectedGenerationId",
        "selectedOutputPath",
        "selectedOutputSha256",
        "declaredOutputSha256",
        "generatorSource",
        "generatorSourceSha256",
        "byteParityVerified",
        "selectionEvidence",
        "transcriptEvidence",
        "claimLimit",
    }
    if set(evidence) != expected_keys:
        errors.append(
            f"{prefix} generationResultEvidence 字段集合不符合严格 v3 schema"
        )
    expected_claim_limit = (
        "operational cache, rollout event, byte parity, and auxiliary "
        "C2PA marker binding; does not prove semantic independence, "
        "copyright provenance, or owner approval"
    )
    if (
        evidence.get("contract")
        != "built_in_imagegen_operational_binding_v2"
    ):
        errors.append(f"{prefix} generationResultEvidence.contract 错误")
    if not _portable_relative_path(
        evidence.get("path"),
        first_part=".run",
        suffix=".txt",
    ):
        errors.append(
            f"{prefix} generationResultEvidence.path 必须是 .run 内相对 txt"
        )
    if not _valid_sha(evidence.get("sha256")):
        errors.append(f"{prefix} generationResultEvidence.sha256 非法")
    if (
        not isinstance(generation_id, str)
        or not builder._valid_generation_id(generation_id)
        or evidence.get("selectedGenerationId") != generation_id
    ):
        errors.append(
            f"{prefix} generationResultEvidence selectedGenerationId 错误"
        )
    if (
        not _portable_relative_path(
            evidence.get("selectedOutputPath"),
            first_part=".run",
            suffix=".png",
        )
        or evidence.get("selectedOutputPath") != original_input.get("path")
    ):
        errors.append(
            f"{prefix} generationResultEvidence selectedOutputPath "
            "未绑定 originalInput"
        )

    original_sha = (
        builder.sha256_file(original_generated_path)
        if original_generated_path.is_file()
        else None
    )
    original_size = (
        original_generated_path.stat().st_size
        if original_generated_path.is_file()
        else None
    )
    for field in (
        "selectedOutputSha256",
        "generatorSourceSha256",
    ):
        if original_sha is None or evidence.get(field) != original_sha:
            errors.append(
                f"{prefix} generationResultEvidence.{field} "
                "未绑定归档原始 PNG bytes"
            )
    declared_sha = evidence.get("declaredOutputSha256")
    if declared_sha is not None and declared_sha != original_sha:
        errors.append(
            f"{prefix} generationResultEvidence.declaredOutputSha256 "
            "与归档原始 PNG 不一致"
        )
    if evidence.get("byteParityVerified") is not True:
        errors.append(
            f"{prefix} generationResultEvidence.byteParityVerified "
            "必须为 true"
        )
    if evidence.get("claimLimit") != expected_claim_limit:
        errors.append(
            f"{prefix} generationResultEvidence.claimLimit 错误"
        )

    generator_source = evidence.get("generatorSource")
    source_parts = (
        Path(generator_source).parts
        if isinstance(generator_source, str)
        else ()
    )
    source_session: str | None = None
    if (
        len(source_parts) == 4
        and source_parts[:2] == (".codex", "generated_images")
        and builder.SESSION_ID_PATTERN.fullmatch(source_parts[2])
        and source_parts[3] == f"{generation_id}.png"
    ):
        source_session = source_parts[2]
    else:
        errors.append(
            f"{prefix} generationResultEvidence.generatorSource "
            "不是 canonical Codex cache 标签"
        )

    selection = evidence.get("selectionEvidence")
    expected_selection_keys = {
        "contract",
        "path",
        "sha256",
        "entrySha256",
    }
    if (
        not isinstance(selection, dict)
        or set(selection) != expected_selection_keys
    ):
        errors.append(
            f"{prefix} selectionEvidence 字段集合不符合严格 schema"
        )
    else:
        if (
            selection.get("contract")
            != "portrait_selected_sources_entry_v1"
        ):
            errors.append(f"{prefix} selectionEvidence.contract 错误")
        if (
            selection.get("path")
            != builder.SELECTED_SOURCES_PATH.as_posix()
        ):
            errors.append(f"{prefix} selectionEvidence.path 错误")
        for field in ("sha256", "entrySha256"):
            if not _valid_sha(selection.get(field)):
                errors.append(
                    f"{prefix} selectionEvidence.{field} 非法"
                )

    transcript = evidence.get("transcriptEvidence")
    expected_transcript_keys = {
        "contract",
        "sessionId",
        "transcriptPath",
        "sessionMetaRecordSha256",
        "requestByteOffset",
        "requestRecordSha256",
        "requestArgumentBinding",
        "eventByteOffset",
        "eventRecordSha256",
        "eventOutputSha256",
        "eventOutputByteLength",
        "importGateOnly",
        "portableReleaseAuditRequiresPrivateTranscript",
        "c2paOpenAiClaimMarkerPresent",
        "c2paSignatureCryptographicallyVerified",
    }
    if (
        not isinstance(transcript, dict)
        or set(transcript) != expected_transcript_keys
    ):
        errors.append(
            f"{prefix} transcriptEvidence 字段集合不符合严格 schema"
        )
    else:
        if (
            transcript.get("contract")
            != "codex_imagegen_rollout_event_binding_v2"
        ):
            errors.append(f"{prefix} transcriptEvidence.contract 错误")
        session_id = transcript.get("sessionId")
        if (
            not isinstance(session_id, str)
            or not builder.SESSION_ID_PATTERN.fullmatch(session_id)
            or source_session != session_id
        ):
            errors.append(
                f"{prefix} transcriptEvidence.sessionId "
                "与 generatorSource 不一致"
            )
        transcript_path = transcript.get("transcriptPath")
        if (
            not isinstance(transcript_path, str)
            or (
                not transcript_path.startswith("sessions/")
                and not transcript_path.startswith("archived_sessions/")
            )
            or not transcript_path.endswith(".jsonl")
            or ".." in Path(transcript_path).parts
        ):
            errors.append(
                f"{prefix} transcriptEvidence.transcriptPath 非法"
            )
        elif (
            isinstance(session_id, str)
            and session_id not in Path(transcript_path).name
        ):
            errors.append(
                f"{prefix} transcriptEvidence.transcriptPath "
                "未绑定 sessionId"
            )
        for field in (
            "sessionMetaRecordSha256",
            "eventRecordSha256",
        ):
            if not _valid_sha(transcript.get(field)):
                errors.append(
                    f"{prefix} transcriptEvidence.{field} 非法"
                )
        event_offset = transcript.get("eventByteOffset")
        if (
            not isinstance(event_offset, int)
            or isinstance(event_offset, bool)
            or event_offset < 0
        ):
            errors.append(
                f"{prefix} transcriptEvidence.eventByteOffset 非法"
            )
        request_offset = transcript.get("requestByteOffset")
        request_sha = transcript.get("requestRecordSha256")
        request_binding = transcript.get("requestArgumentBinding")
        request_verified = bool(
            isinstance(request_binding, dict)
            and request_binding.get("requestArgumentBindingVerified")
            is True
        )
        if request_verified:
            generation_id_valid = bool(
                isinstance(generation_id, str)
                and (
                    builder.CALL_GENERATION_ID_PATTERN.fullmatch(
                        generation_id
                    )
                    is not None
                    or builder.EXEC_GENERATION_ID_PATTERN.fullmatch(
                        generation_id
                    )
                    is not None
                )
            )
            if not generation_id_valid:
                errors.append(
                    f"{prefix} verified ImageGen generationId 格式非法"
                )
            if (
                not isinstance(request_offset, int)
                or isinstance(request_offset, bool)
                or request_offset < 0
                or not _valid_sha(request_sha)
            ):
                errors.append(
                    f"{prefix} verified ImageGen request transcript 绑定非法"
                )
        else:
            if (
                not isinstance(generation_id, str)
                or builder.EXEC_GENERATION_ID_PATTERN.fullmatch(
                    generation_id
                )
                is None
            ):
                errors.append(
                    f"{prefix} generationId 不是允许的 call/exec 格式"
                )
            if request_offset is not None or request_sha is not None:
                errors.append(
                    f"{prefix} unverified exec ImageGen 不得伪造 request 绑定"
                )
        _check_request_argument_snapshot(
            value=request_binding,
            generation_id=generation_id,
            form_id=form_id,
            repo_root=repo_root,
            identity_reference=identity_reference,
            prompt_record=prompt_record,
            errors=errors,
            prefix=prefix,
        )
        if (
            original_sha is None
            or transcript.get("eventOutputSha256") != original_sha
            or transcript.get("eventOutputByteLength") != original_size
        ):
            errors.append(
                f"{prefix} transcriptEvidence event output "
                "未绑定归档原始 PNG bytes"
            )
        if transcript.get("importGateOnly") is not True:
            errors.append(
                f"{prefix} transcriptEvidence.importGateOnly 必须为 true"
            )
        if (
            transcript.get(
                "portableReleaseAuditRequiresPrivateTranscript"
            )
            is not False
        ):
            errors.append(
                f"{prefix} installed attestation snapshot "
                "不得要求完整性审计现场读取私有 transcript"
            )
        if transcript.get("c2paOpenAiClaimMarkerPresent") is not True:
            errors.append(
                f"{prefix} transcriptEvidence 缺少 C2PA marker 记录"
            )
        if (
            transcript.get("c2paSignatureCryptographicallyVerified")
            is not False
        ):
            errors.append(
                f"{prefix} transcriptEvidence 不得虚报 C2PA 签名已验证"
            )
    if (
        original_generated_path.is_file()
        and builder.OPENAI_C2PA_MARKER
        not in original_generated_path.read_bytes()
    ):
        errors.append(
            f"{prefix} 归档原始 PNG 缺少 import gate 记录的 OpenAI "
            "C2PA claim marker"
        )
    return evidence


def _load_image(
    path: Path,
    label: str,
    errors: list[str],
) -> tuple[Image.Image, str, str] | None:
    if path.is_symlink():
        errors.append(f"{label}不得是符号链接：{path}")
        return None
    if not path.is_file():
        errors.append(f"缺少{label}：{path}")
        return None
    try:
        with Image.open(path) as opened:
            opened.load()
            return opened.copy(), opened.format or "", opened.mode
    except (OSError, UnidentifiedImageError) as exc:
        errors.append(f"{label}不可解码：{path}: {exc}")
        return None


def _check_image_record(
    *,
    repo_root: Path,
    record: Any,
    expected_path: Path,
    label: str,
    errors: list[str],
    expected_size: tuple[int, int] | None = None,
    expected_mode: str | None = None,
    expected_format: str | None = None,
) -> Image.Image | None:
    if not isinstance(record, dict):
        errors.append(f"{label} metadata 缺失")
        return None
    record_path = _safe_record_path(repo_root, record.get("path"), label, errors)
    if record_path is None:
        return None
    if record_path != expected_path.resolve():
        errors.append(
            f"{label}.path 不等于固定路径："
            f"{record.get('path')!r} != {_repo_relative(repo_root, expected_path)!r}"
        )
        return None
    loaded = _load_image(expected_path, label, errors)
    if loaded is None:
        return None
    image, image_format, image_mode = loaded
    if expected_size is not None and image.size != expected_size:
        errors.append(
            f"{label}尺寸错误：{image.width}x{image.height}，"
            f"应为 {expected_size[0]}x{expected_size[1]}"
        )
    if expected_mode is not None and image_mode != expected_mode:
        errors.append(f"{label}模式错误：{image_mode}，应为 {expected_mode}")
    if expected_format is not None and image_format != expected_format:
        errors.append(f"{label}格式错误：{image_format}，应为 {expected_format}")
    actual_sha = builder.sha256_file(expected_path)
    actual_rgba_sha = rgba_hash(image.convert("RGBA"))
    if not _valid_sha(record.get("sha256")) or record.get("sha256") != actual_sha:
        errors.append(f"{label}.sha256 与文件不一致")
    if not _valid_sha(record.get("rgbaSha256")) or record.get("rgbaSha256") != actual_rgba_sha:
        errors.append(f"{label}.rgbaSha256 与 decoded RGBA 不一致")
    if record.get("width") != image.width or record.get("height") != image.height:
        errors.append(f"{label} metadata 尺寸与文件不一致")
    if record.get("mode") != image_mode or record.get("format") != image_format:
        errors.append(f"{label} metadata mode/format 与文件不一致")
    return image


def _check_mask_record(
    *,
    repo_root: Path,
    record: Any,
    expected_path: Path,
    label: str,
    errors: list[str],
) -> np.ndarray | None:
    if not isinstance(record, dict):
        errors.append(f"{label} metadata 缺失")
        return None
    record_path = _safe_record_path(repo_root, record.get("path"), label, errors)
    if record_path is None:
        return None
    if record_path != expected_path.resolve():
        errors.append(f"{label}.path 不等于固定路径")
        return None
    loaded = _load_image(expected_path, label, errors)
    if loaded is None:
        return None
    image, image_format, image_mode = loaded
    if image_format != "PNG" or image_mode != "L":
        errors.append(f"{label}必须是 L 模式 PNG")
        return None
    values = np.asarray(image, dtype=np.uint8)
    if not _valid_sha(record.get("sha256")) or record.get("sha256") != builder.sha256_file(expected_path):
        errors.append(f"{label}.sha256 与文件不一致")
    if record.get("width") != image.width or record.get("height") != image.height:
        errors.append(f"{label} metadata 尺寸与文件不一致")
    if record.get("mode") != "L" or record.get("format") != "PNG":
        errors.append(f"{label} metadata mode/format 错误")
    if record.get("nonzeroPixels") != int(np.count_nonzero(values)):
        errors.append(f"{label}.nonzeroPixels 与文件不一致")
    return values


def _catalog_targets(
    repo_root: Path,
    catalog_path: Path,
    expected_count: int,
    errors: list[str],
) -> list[PortraitTarget]:
    catalog = _read_json(catalog_path, errors, "pet_art_catalog")
    if catalog is None:
        return []
    forms = catalog.get("forms")
    if not isinstance(forms, list):
        errors.append("pet_art_catalog.forms 必须是数组")
        return []
    if len(forms) != expected_count:
        errors.append(
            f"正式宠物目录数量错误：{len(forms)}，应为 {expected_count}"
        )
    targets: list[PortraitTarget] = []
    seen_forms: set[str] = set()
    seen_roots: set[Path] = set()
    for index, form in enumerate(forms):
        if not isinstance(form, dict):
            errors.append(f"forms[{index}] 必须是对象")
            continue
        form_id = form.get("formId")
        if not isinstance(form_id, str) or not form_id:
            errors.append(f"forms[{index}].formId 缺失")
            continue
        if form_id in seen_forms:
            errors.append(f"重复 formId：{form_id}")
            continue
        seen_forms.add(form_id)
        pet = form.get("pet")
        if not isinstance(pet, dict):
            errors.append(f"{form_id}.pet 缺失")
            continue
        root_value = pet.get("root")
        portrait_value = pet.get("portraitPath")
        if not isinstance(root_value, str) or not root_value:
            errors.append(f"{form_id}.pet.root 缺失")
            continue
        if not isinstance(portrait_value, str) or not portrait_value:
            errors.append(
                f"{form_id}.pet.portraitPath 必须显式声明，禁止裁全身图 fallback"
            )
            continue
        root_relative = Path(root_value)
        portrait_relative = Path(portrait_value)
        if root_relative.is_absolute() or ".." in root_relative.parts:
            errors.append(f"{form_id}.pet.root 必须是安全的仓库相对路径")
            continue
        if portrait_relative.is_absolute() or ".." in portrait_relative.parts:
            errors.append(
                f"{form_id}.pet.portraitPath 必须是安全的仓库相对路径"
            )
            continue
        pet_root = _inside_repo(repo_root, Path(root_value), f"{form_id}.pet.root", errors)
        portrait_path = _inside_repo(
            repo_root,
            Path(portrait_value),
            f"{form_id}.pet.portraitPath",
            errors,
        )
        if pet_root is None or portrait_path is None:
            continue
        expected_portrait = pet_root / builder.RUNTIME_PATH
        if portrait_path != expected_portrait.resolve():
            errors.append(
                f"{form_id}.pet.portraitPath 必须指向 "
                f"{_repo_relative(repo_root, expected_portrait)}"
            )
            continue
        if pet_root in seen_roots:
            errors.append(f"重复宠物资源根目录：{root_value}")
            continue
        seen_roots.add(pet_root)
        targets.append(
            PortraitTarget(
                form_id=form_id,
                pet_root=pet_root,
                portrait_path=portrait_path,
                source="catalog",
                catalog_path=catalog_path,
            )
        )
    return targets


def parse_isolated_root(value: str) -> tuple[str, Path]:
    form_id, separator, path_text = value.partition("=")
    if not separator or not form_id or not path_text:
        raise argparse.ArgumentTypeError(
            "--isolated-root 格式必须是 FORM_ID=PATH"
        )
    if not builder.FORM_ID_PATTERN.fullmatch(form_id):
        raise argparse.ArgumentTypeError(
            "--isolated-root 的 FORM_ID 格式非法"
        )
    return form_id, Path(path_text)


def _isolated_targets(
    repo_root: Path,
    roots: Sequence[tuple[str, Path]],
    expected_count: int,
    errors: list[str],
) -> list[PortraitTarget]:
    if len(roots) != expected_count:
        errors.append(
            f"isolated portrait 根目录数量错误：{len(roots)}，应为 {expected_count}"
        )
    targets: list[PortraitTarget] = []
    seen: set[str] = set()
    for form_id, root_value in roots:
        if form_id in seen:
            errors.append(f"重复 isolated formId：{form_id}")
            continue
        seen.add(form_id)
        pet_root = _inside_repo(
            repo_root,
            root_value,
            f"isolated {form_id}",
            errors,
        )
        if pet_root is None:
            continue
        targets.append(
            PortraitTarget(
                form_id=form_id,
                pet_root=pet_root,
                portrait_path=(pet_root / builder.RUNTIME_PATH).resolve(),
                source="isolated",
                catalog_path=None,
            )
        )
    return targets


def _single_catalog_target(
    *,
    repo_root: Path,
    catalog_path: Path,
    form_id: str,
    pet_root: Path,
    errors: list[str],
) -> PortraitTarget | None:
    """Resolve one exact catalog binding without claiming a release audit."""

    catalog = _read_json(catalog_path, errors, "pet_art_catalog")
    if catalog is None:
        return None
    forms = catalog.get("forms")
    if not isinstance(forms, list):
        errors.append("pet_art_catalog.forms 必须是数组")
        return None
    matches = [
        (index, form)
        for index, form in enumerate(forms)
        if isinstance(form, dict) and form.get("formId") == form_id
    ]
    if len(matches) != 1:
        errors.append(
            f"single-target catalog 必须恰好声明一个 formId={form_id}，"
            f"实际 {len(matches)}"
        )
        return None
    index, form = matches[0]
    pet = form.get("pet")
    if not isinstance(pet, dict):
        errors.append(f"forms[{index}].pet 缺失")
        return None
    root_value = pet.get("root")
    portrait_value = pet.get("portraitPath")
    if not isinstance(root_value, str) or not root_value:
        errors.append(f"{form_id}.pet.root 缺失")
        return None
    if not isinstance(portrait_value, str) or not portrait_value:
        errors.append(
            f"{form_id}.pet.portraitPath 必须显式声明，"
            "禁止裁全身图 fallback"
        )
        return None
    if Path(root_value).is_absolute() or ".." in Path(root_value).parts:
        errors.append(f"{form_id}.pet.root 必须是安全的仓库相对路径")
        return None
    if (
        Path(portrait_value).is_absolute()
        or ".." in Path(portrait_value).parts
    ):
        errors.append(
            f"{form_id}.pet.portraitPath 必须是安全的仓库相对路径"
        )
        return None
    declared_root = _inside_repo(
        repo_root,
        Path(root_value),
        f"{form_id}.pet.root",
        errors,
    )
    declared_portrait = _inside_repo(
        repo_root,
        Path(portrait_value),
        f"{form_id}.pet.portraitPath",
        errors,
    )
    if declared_root is None or declared_portrait is None:
        return None
    if declared_root != pet_root:
        errors.append(
            f"{form_id} single-target petRoot 与 catalog 映射不一致："
            f"{_repo_relative(repo_root, pet_root)} != "
            f"{_repo_relative(repo_root, declared_root)}"
        )
    expected_portrait = pet_root / builder.RUNTIME_PATH
    if declared_portrait != expected_portrait.resolve():
        errors.append(
            f"{form_id}.pet.portraitPath 必须指向 "
            f"{_repo_relative(repo_root, expected_portrait)}"
        )

    root_owners: list[str] = []
    for other in forms:
        if not isinstance(other, dict):
            continue
        other_form_id = other.get("formId")
        other_pet = other.get("pet")
        if (
            not isinstance(other_form_id, str)
            or not isinstance(other_pet, dict)
            or not isinstance(other_pet.get("root"), str)
        ):
            continue
        other_root_value = Path(other_pet["root"])
        if (
            other_root_value.is_absolute()
            or ".." in other_root_value.parts
        ):
            continue
        other_root = _inside_repo(
            repo_root,
            other_root_value,
            f"{other_form_id}.pet.root",
            errors,
        )
        if other_root == pet_root:
            root_owners.append(other_form_id)
    if root_owners != [form_id]:
        errors.append(
            f"{form_id} single-target petRoot 在 catalog 中必须唯一绑定，"
            f"实际 owners={root_owners}"
        )
    return PortraitTarget(
        form_id=form_id,
        pet_root=pet_root,
        portrait_path=expected_portrait.resolve(),
        source="catalog",
        catalog_path=catalog_path,
    )


def _check_authoritative_target_mapping(
    *,
    repo_root: Path,
    targets: Sequence[PortraitTarget],
    expected: Sequence[tuple[str, Path]],
    label: str,
    errors: list[str],
) -> None:
    expected_mapping = {
        form_id: root.as_posix()
        for form_id, root in expected
    }
    actual_mapping = {
        target.form_id: _repo_relative(repo_root, target.pet_root)
        for target in targets
    }
    missing = sorted(set(expected_mapping) - set(actual_mapping))
    unexpected = sorted(set(actual_mapping) - set(expected_mapping))
    mismatched = sorted(
        form_id
        for form_id in set(expected_mapping) & set(actual_mapping)
        if actual_mapping[form_id] != expected_mapping[form_id]
    )
    if not missing and not unexpected and not mismatched:
        return
    errors.append(
        f"combined {label} formId/root 必须严格等于内置权威映射"
    )
    if missing:
        errors.append(
            f"combined {label} 缺少权威 formId：{missing}"
        )
    if unexpected:
        errors.append(
            f"combined {label} 出现非权威 formId：{unexpected}"
        )
    for form_id in mismatched:
        errors.append(
            f"combined {label} root 错误：{form_id}: "
            f"{actual_mapping[form_id]!r} != {expected_mapping[form_id]!r}"
        )


def _check_text_record(
    *,
    repo_root: Path,
    record: Any,
    expected_path: Path,
    label: str,
    errors: list[str],
    require_nonempty: bool = True,
) -> str | None:
    if not isinstance(record, dict):
        errors.append(f"{label} metadata 缺失")
        return None
    record_path = _safe_record_path(repo_root, record.get("path"), label, errors)
    if record_path is None:
        return None
    if record_path != expected_path.resolve():
        errors.append(f"{label}.path 不等于固定路径")
        return None
    if not expected_path.is_file():
        errors.append(f"缺少{label}：{expected_path}")
        return None
    try:
        raw = expected_path.read_bytes()
        text = raw.decode("utf-8")
    except (OSError, UnicodeDecodeError) as exc:
        errors.append(f"{label}必须是 UTF-8：{exc}")
        return None
    if require_nonempty and not text.strip():
        errors.append(f"{label}不能为空")
    if not _valid_sha(record.get("sha256")) or record.get("sha256") != builder.sha256_file(expected_path):
        errors.append(f"{label}.sha256 与文件不一致")
    return text


def _check_json_record(
    *,
    repo_root: Path,
    record: Any,
    expected_path: Path,
    label: str,
    errors: list[str],
) -> dict[str, Any] | None:
    if not isinstance(record, dict):
        errors.append(f"{label} metadata 缺失")
        return None
    record_path = _safe_record_path(
        repo_root,
        record.get("path"),
        label,
        errors,
    )
    if record_path is None:
        return None
    if record_path != expected_path.resolve():
        errors.append(f"{label}.path 不等于固定路径")
        return None
    value = _read_json(expected_path, errors, label)
    if value is None:
        return None
    if (
        not _valid_sha(record.get("sha256"))
        or record.get("sha256") != builder.sha256_file(expected_path)
    ):
        errors.append(f"{label}.sha256 与文件不一致")
    return value


def _check_identity_reference(
    repo_root: Path,
    pet_root: Path,
    record: Any,
    errors: list[str],
) -> Image.Image | None:
    if not isinstance(record, dict):
        errors.append("identityReference metadata 缺失")
        return None
    path = _safe_record_path(repo_root, record.get("path"), "identityReference", errors)
    if path is None:
        return None
    try:
        path.relative_to((pet_root / "identity").resolve())
    except ValueError:
        errors.append(
            "identityReference 必须指向当前宠物 identity 目录内的锁定参考"
        )
    loaded = _load_image(path, "identityReference", errors)
    if loaded is None:
        return None
    image, image_format, image_mode = loaded
    if not _valid_sha(record.get("sha256")) or record.get("sha256") != builder.sha256_file(path):
        errors.append("identityReference.sha256 与文件不一致")
    actual_rgba = rgba_hash(image.convert("RGBA"))
    if not _valid_sha(record.get("rgbaSha256")) or record.get("rgbaSha256") != actual_rgba:
        errors.append("identityReference.rgbaSha256 与 decoded RGBA 不一致")
    expected = (image.width, image.height, image_mode, image_format)
    recorded = (
        record.get("width"),
        record.get("height"),
        record.get("mode"),
        record.get("format"),
    )
    if expected != recorded:
        errors.append("identityReference 尺寸/mode/format metadata 不一致")
    return image


def _check_owner_evidence_records(
    *,
    repo_root: Path,
    form_id: str,
    records: Any,
    errors: list[str],
) -> list[dict[str, str]]:
    if not isinstance(records, list) or not records:
        errors.append(
            f"{form_id} approved 必须声明非空 evidence path/sha256 记录"
        )
        return []
    canonical: list[dict[str, str]] = []
    seen_paths: set[str] = set()
    for index, record in enumerate(records):
        label = f"{form_id} ownerReview.evidence[{index}]"
        if not isinstance(record, dict) or set(record) != {"path", "sha256"}:
            errors.append(
                f"{label} 必须严格只包含 path 与 sha256"
            )
            continue
        evidence_path = _safe_record_path(
            repo_root,
            record.get("path"),
            label,
            errors,
        )
        if evidence_path is None:
            continue
        relative = _repo_relative(repo_root, evidence_path)
        if relative in seen_paths:
            errors.append(f"{form_id} owner evidence 路径重复：{relative}")
            continue
        seen_paths.add(relative)
        if not evidence_path.is_file():
            errors.append(
                f"{form_id} owner review evidence 不存在：{evidence_path}"
            )
            continue
        actual_sha = builder.sha256_file(evidence_path)
        if (
            not _valid_sha(record.get("sha256"))
            or record.get("sha256") != actual_sha
        ):
            errors.append(f"{label}.sha256 与 evidence 内容不一致")
        canonical.append({"path": relative, "sha256": actual_sha})
    return canonical


def _reviewed_at_has_timezone(value: Any) -> bool:
    if not isinstance(value, str) or not value.strip():
        return False
    normalized = value.strip()
    if normalized.endswith("Z"):
        normalized = normalized[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return False
    return parsed.tzinfo is not None and parsed.utcoffset() is not None


def _check_owner_review(
    *,
    repo_root: Path,
    target: PortraitTarget,
    owner_review: Any,
    ownership_text: str | None,
    master_path: Path,
    runtime_path: Path,
    errors: list[str],
) -> str | None:
    prefix = target.form_id
    if not isinstance(owner_review, dict):
        errors.append(f"{prefix} ownerReview metadata 缺失")
        return None
    if owner_review.get("required") is not True:
        errors.append(f"{prefix} ownerReview.required 必须为 true")
    status = owner_review.get("status")
    if status not in {"owner_review_pending", "approved"}:
        errors.append(f"{prefix} ownerReview.status 非法")
        return status if isinstance(status, str) else None

    lowered = ownership_text.casefold() if ownership_text is not None else ""
    pending_marker = "owner review status: `owner_review_pending`"
    approved_marker = "owner review status: `approved`"
    if status == "owner_review_pending":
        expected_pending_fields = {"required", "status", "evidencePaths"}
        if set(owner_review) != expected_pending_fields:
            errors.append(
                f"{prefix} pending ownerReview 字段集合不符合严格 schema"
            )
        if pending_marker not in lowered or approved_marker in lowered:
            errors.append(
                f"{prefix} pending metadata 与 ownership owner-review 状态不一致"
            )
        evidence_paths = owner_review.get("evidencePaths")
        if evidence_paths != []:
            errors.append(
                f"{prefix} owner_review_pending evidencePaths 必须为空"
            )
        if owner_review.get("decision") is not None:
            errors.append(
                f"{prefix} owner_review_pending 不得声明 owner decision"
            )
        pending_decision_path = target.pet_root / builder.OWNER_DECISION_PATH
        if pending_decision_path.exists():
            errors.append(
                f"{prefix} owner_review_pending 不得遗留 owner-decision.json"
            )
        return status

    expected_approved_fields = {
        "required",
        "status",
        "evidence",
        "decision",
    }
    if set(owner_review) != expected_approved_fields:
        errors.append(
            f"{prefix} approved ownerReview 字段集合不符合严格 schema"
        )
    if approved_marker not in lowered or pending_marker in lowered:
        errors.append(
            f"{prefix} approved metadata 与 ownership owner-review 状态不一致"
        )
    evidence = _check_owner_evidence_records(
        repo_root=repo_root,
        form_id=prefix,
        records=owner_review.get("evidence"),
        errors=errors,
    )

    decision_record = owner_review.get("decision")
    decision = _check_json_record(
        repo_root=repo_root,
        record=decision_record,
        expected_path=target.pet_root / builder.OWNER_DECISION_PATH,
        label=f"{prefix} ownerDecision",
        errors=errors,
    )
    if decision is None:
        return status
    expected_decision_fields = {
        "schemaVersion",
        "decisionType",
        "ownerId",
        "decision",
        "subject",
        "acceptedEvidence",
        "reviewedAt",
    }
    if set(decision) != expected_decision_fields:
        errors.append(
            f"{prefix} ownerDecision 字段集合不符合严格 schema"
        )
    expected_top_level = {
        "schemaVersion": 2,
        "decisionType": "beastbound_pet_portrait_owner_approval",
        "ownerId": TRUSTED_PROJECT_OWNER_ID,
        "decision": "approved",
        "acceptedEvidence": evidence,
    }
    for key, value in expected_top_level.items():
        if decision.get(key) != value:
            errors.append(f"{prefix} ownerDecision.{key} 与批准证据不一致")

    ownership_path = target.pet_root / builder.OWNERSHIP_PATH
    expected_subject = {
        "kind": "shared_dedicated_headshot_v1",
        "formId": prefix,
        "petRoot": _repo_relative(repo_root, target.pet_root),
        "master": {
            "path": _repo_relative(repo_root, master_path),
            "sha256": builder.sha256_file(master_path)
            if master_path.is_file()
            else None,
        },
        "runtime": {
            "path": _repo_relative(repo_root, runtime_path),
            "sha256": builder.sha256_file(runtime_path)
            if runtime_path.is_file()
            else None,
        },
        "ownership": {
            "path": _repo_relative(repo_root, ownership_path),
            "sha256": builder.sha256_file(ownership_path)
            if ownership_path.is_file()
            else None,
        },
    }
    subject = decision.get("subject")
    if not isinstance(subject, dict) or subject != expected_subject:
        errors.append(
            f"{prefix} ownerDecision.subject 未绑定当前 form/root/portrait"
        )
    if not _reviewed_at_has_timezone(decision.get("reviewedAt")):
        errors.append(
            f"{prefix} ownerDecision.reviewedAt 必须是带时区 ISO-8601"
        )

    decision_sha = (
        decision_record.get("sha256")
        if isinstance(decision_record, dict)
        else None
    )
    trusted_shas = TRUSTED_OWNER_DECISION_SHA256_BY_FORM.get(
        prefix,
        frozenset(),
    )
    if decision_sha not in trusted_shas:
        errors.append(
            f"{prefix} ownerDecision SHA 未登记为项目 owner 显式接受的可信摘要"
        )
    return status


def _check_independent_hashes(
    repo_root: Path,
    target: PortraitTarget,
    portrait_images: Sequence[Image.Image],
    excluded: set[Path],
    errors: list[str],
) -> int:
    checked = 0
    if not target.pet_root.is_dir():
        return checked
    for path in sorted(target.pet_root.rglob("*")):
        if path.is_symlink():
            errors.append(
                f"{target.form_id} pet-root 路径不得包含符号链接：{path}"
            )
            continue
        if not path.is_file() or path.suffix.lower() not in IMAGE_SUFFIXES:
            continue
        logical = path.absolute()
        if logical in excluded:
            continue
        try:
            path.resolve().relative_to(target.pet_root.resolve())
        except ValueError:
            errors.append(
                f"{target.form_id} 对比资源解析后逃出 pet root：{path}"
            )
            continue
        loaded = _load_image(path, "对比资源", errors)
        if loaded is None:
            continue
        image, _, _ = loaded
        checked += 1
        for portrait_image in portrait_images:
            metrics = builder.scaled_copy_metrics(
                portrait_image,
                image,
            )
            if metrics["duplicate"]:
                errors.append(
                    f"{target.form_id} portrait 与既有 pet-root 美术是同图或"
                    f"缩放拷贝：{_repo_relative(repo_root, path)} "
                    f"metrics={metrics}"
                )
                break
    return checked


def _audit_target(
    repo_root: Path,
    target: PortraitTarget,
) -> tuple[dict[str, Any], list[str], PortraitFingerprint]:
    errors: list[str] = []
    identity_transition_record: dict[str, Any] | None = None
    prefix = target.form_id
    empty_fingerprint = PortraitFingerprint(
        form_id=prefix,
        generation_id=None,
        raw_rgba_sha256=None,
        master_rgba_sha256=None,
        runtime_rgba_sha256=None,
        master_image=None,
        runtime_image=None,
    )
    if not target.pet_root.is_dir():
        errors.append(f"{prefix} 宠物资源根目录不存在：{target.pet_root}")
        return {"formId": prefix, "source": target.source}, errors, empty_fingerprint
    metadata_path = target.pet_root / builder.METADATA_PATH
    if _inside_repo(
        repo_root,
        metadata_path,
        f"{prefix} portrait-meta",
        errors,
    ) is None:
        return {"formId": prefix, "source": target.source}, errors, empty_fingerprint
    metadata = _read_json(metadata_path, errors, f"{prefix} portrait-meta")
    if metadata is None:
        return {"formId": prefix, "source": target.source}, errors, empty_fingerprint

    _check_portrait_metadata_exact_schema(
        metadata,
        form_id=prefix,
        errors=errors,
    )
    if metadata.get("schemaVersion") != builder.SCHEMA_VERSION:
        errors.append(f"{prefix} schemaVersion 错误")
    if metadata.get("tool") != builder.TOOL_NAME:
        errors.append(f"{prefix} tool 不是 {builder.TOOL_NAME}")
    if metadata.get("formId") != prefix:
        errors.append(f"{prefix} metadata formId 不一致")
    if metadata.get("capability") != "shared_dedicated_headshot_v1":
        errors.append(f"{prefix} capability 错误")
    if metadata.get("independentlyAuthoredClaim") is not True:
        errors.append(f"{prefix} independentlyAuthoredClaim 必须为 true")
    owner_review_value = metadata.get("ownerReview")
    declared_owner_status = (
        owner_review_value.get("status")
        if isinstance(owner_review_value, dict)
        else None
    )
    owner_approved = declared_owner_status == "approved"
    expected_authorship_trust = (
        "owner_verified" if owner_approved else "untrusted_claim"
    )
    if (
        metadata.get("independentAuthorshipClaimTrust")
        != expected_authorship_trust
    ):
        errors.append(
            f"{prefix} independentAuthorshipClaimTrust "
            f"必须诚实标记为 {expected_authorship_trust}"
        )
    if metadata.get("semanticIndependenceVerified") is not owner_approved:
        errors.append(
            f"{prefix} semanticIndependenceVerified 与 owner 状态不一致"
        )
    if "releaseGate" in metadata and metadata.get("releaseGate") is not owner_approved:
        errors.append(f"{prefix} releaseGate 与 owner 状态不一致")
    if (
        prefix in PORTRAIT_RELEASE_GATE_REQUIRED_FORM_IDS
        and metadata.get("releaseGate") is not owner_approved
    ):
        errors.append(
            f"{prefix} 正式融合画像 releaseGate 与 owner 状态不一致"
        )
    if "independentlyAuthored" in metadata:
        errors.append(
            f"{prefix} 不得使用会被误解为机器认证的 "
            "independentlyAuthored 旧字段"
        )
    if metadata.get("fullBodyCropAllowed") is not False:
        errors.append(f"{prefix} fullBodyCropAllowed 必须为 false")
    expected_claim_limit = (
        OWNER_APPROVED_PORTRAIT_CLAIM_LIMIT
        if owner_approved
        else PENDING_PORTRAIT_CLAIM_LIMIT
    )
    if metadata.get("claimLimit") != expected_claim_limit:
        errors.append(f"{prefix} claimLimit 缺失或扩大了自动证明边界")
    shared_uses = metadata.get("sharedUses")
    if (
        not isinstance(shared_uses, list)
        or not all(isinstance(value, str) and value for value in shared_uses)
        or len(shared_uses) != len(set(shared_uses))
        or not set(builder.SHARED_USES).issubset(set(shared_uses))
    ):
        errors.append(
            f"{prefix} sharedUses 必须无重复并覆盖四个基线消费者"
        )

    catalog_binding = metadata.get("catalogBinding")
    if not isinstance(catalog_binding, dict):
        errors.append(f"{prefix} catalogBinding metadata 缺失")
    else:
        expected_mode = (
            "pet_art_catalog_explicit"
            if target.source == "catalog"
            else "isolated_explicit"
        )
        if catalog_binding.get("mode") != expected_mode:
            errors.append(f"{prefix} catalogBinding.mode 与审计来源不一致")
        expected_root = _repo_relative(repo_root, target.pet_root)
        if catalog_binding.get("petRoot") != expected_root:
            errors.append(f"{prefix} catalogBinding.petRoot 不一致")
        if target.catalog_path is None:
            if catalog_binding.get("catalogPath") is not None:
                errors.append(
                    f"{prefix} isolated catalogBinding.catalogPath 必须为 null"
                )
        elif catalog_binding.get("catalogPath") != _repo_relative(
            repo_root,
            target.catalog_path,
        ):
            errors.append(f"{prefix} catalogBinding.catalogPath 不一致")

    source = metadata.get("source")
    if not isinstance(source, dict):
        errors.append(f"{prefix} source metadata 缺失")
        source = {}
    if source.get("method") != "built_in_imagegen_chroma_headshot_v1":
        errors.append(f"{prefix} source.method 错误")
    if source.get("generator") != "built_in_imagegen":
        errors.append(f"{prefix} source.generator 必须是 built_in_imagegen")
    if not isinstance(source.get("generationId"), str) or not source.get("generationId"):
        errors.append(f"{prefix} source.generationId 缺失")
    attestation_value = _check_json_record(
        repo_root=repo_root,
        record=source.get("generationAttestation"),
        expected_path=target.pet_root / builder.ATTESTATION_PATH,
        label=f"{prefix} generationAttestation",
        errors=errors,
    )
    attestation_record = source.get("generationAttestation")
    if isinstance(attestation_record, dict):
        if (
            attestation_record.get("schemaVersion")
            != builder.GENERATION_ATTESTATION_SCHEMA_VERSION
        ):
            errors.append(
                f"{prefix} generationAttestation record schemaVersion 错误"
            )
        if attestation_record.get("generationId") != source.get(
            "generationId"
        ):
            errors.append(
                f"{prefix} generationAttestation record generationId 不一致"
            )
    original_input = source.get("originalInput")
    if (
        not isinstance(original_input, dict)
        or not _valid_sha(original_input.get("sha256"))
        or not _valid_sha(original_input.get("rgbaSha256"))
    ):
        errors.append(f"{prefix} originalInput 记录缺失或 SHA 非法")

    assets = metadata.get("assets")
    if not isinstance(assets, dict):
        errors.append(f"{prefix} assets metadata 缺失")
        assets = {}
    original_generated_path = (
        target.pet_root / builder.ORIGINAL_GENERATED_PNG_PATH
    )
    raw_path = target.pet_root / builder.RAW_SOURCE_PATH
    master_path = target.pet_root / builder.MASTER_PATH
    runtime_path = target.pet_root / builder.RUNTIME_PATH
    eligibility_path = target.pet_root / builder.ELIGIBILITY_MASK_PATH
    alpha_path = target.pet_root / builder.ALPHA_MASK_PATH
    original_generated_image = _check_image_record(
        repo_root=repo_root,
        record=assets.get("originalGeneratedPng"),
        expected_path=original_generated_path,
        label=f"{prefix} originalGeneratedPng",
        errors=errors,
        expected_format="PNG",
    )
    if original_generated_image is not None and (
        original_generated_image.width < builder.MIN_SOURCE_SIZE
        or original_generated_image.height < builder.MIN_SOURCE_SIZE
    ):
        errors.append(
            f"{prefix} originalGeneratedPng 每边必须至少 "
            f"{builder.MIN_SOURCE_SIZE}px"
        )
    expected_original_relative = _repo_relative(
        repo_root,
        original_generated_path,
    )
    if (
        source.get("originalGeneratedPngPath")
        != expected_original_relative
    ):
        errors.append(
            f"{prefix} source.originalGeneratedPngPath 不等于固定路径"
        )
    raw_image = _check_image_record(
        repo_root=repo_root,
        record=assets.get("rawLossless"),
        expected_path=raw_path,
        label=f"{prefix} rawLossless",
        errors=errors,
        expected_format="WEBP",
    )
    if raw_image is not None and (
        raw_image.width < builder.MIN_SOURCE_SIZE
        or raw_image.height < builder.MIN_SOURCE_SIZE
    ):
        errors.append(
            f"{prefix} rawLossless 每边必须至少 {builder.MIN_SOURCE_SIZE}px"
        )
    expected_raw_relative = _repo_relative(repo_root, raw_path)
    if source.get("rawLosslessPath") != expected_raw_relative:
        errors.append(f"{prefix} source.rawLosslessPath 不等于固定路径")
    if (
        original_generated_image is not None
        and isinstance(original_input, dict)
    ):
        original_record = assets.get("originalGeneratedPng")
        expected_original_input = {
            "sha256": builder.sha256_file(original_generated_path),
            "rgbaSha256": rgba_hash(
                original_generated_image.convert("RGBA")
            ),
            "width": original_generated_image.width,
            "height": original_generated_image.height,
            "mode": original_generated_image.mode,
            "format": "PNG",
        }
        for key, expected in expected_original_input.items():
            if original_input.get(key) != expected:
                errors.append(
                    f"{prefix} originalInput.{key} "
                    "未绑定逐字节保存的原始生成 PNG"
                )
        if (
            not isinstance(original_record, dict)
            or original_record.get("sha256")
            != original_input.get("sha256")
            or original_record.get("rgbaSha256")
            != original_input.get("rgbaSha256")
        ):
            errors.append(
                f"{prefix} originalGeneratedPng metadata "
                "与 originalInput 绑定不一致"
            )
    if (
        raw_image is not None
        and original_generated_image is not None
        and rgba_hash(raw_image.convert("RGBA"))
        != rgba_hash(original_generated_image.convert("RGBA"))
    ):
        errors.append(
            f"{prefix} rawLossless decoded RGBA "
            "与原始生成 PNG 不一致"
        )
    if raw_image is not None and isinstance(original_input, dict):
        if (
            original_input.get("width") != raw_image.width
            or original_input.get("height") != raw_image.height
        ):
            errors.append(f"{prefix} originalInput 尺寸与 rawLossless 不一致")
        if original_input.get("rgbaSha256") != rgba_hash(
            raw_image.convert("RGBA")
        ):
            errors.append(
                f"{prefix} rawLossless decoded RGBA 与 originalInput 不一致"
            )
    master_image = _check_image_record(
        repo_root=repo_root,
        record=assets.get("master"),
        expected_path=master_path,
        label=f"{prefix} master",
        errors=errors,
        expected_size=(builder.MASTER_SIZE, builder.MASTER_SIZE),
        expected_mode="RGBA",
        expected_format="PNG",
    )
    runtime_image = _check_image_record(
        repo_root=repo_root,
        record=assets.get("runtime"),
        expected_path=runtime_path,
        label=f"{prefix} runtime",
        errors=errors,
        expected_size=(builder.RUNTIME_SIZE, builder.RUNTIME_SIZE),
        expected_mode="RGBA",
        expected_format="PNG",
    )
    if target.portrait_path != runtime_path.resolve():
        errors.append(f"{prefix} audit portraitPath 不等于固定 runtime 路径")
    eligibility = _check_mask_record(
        repo_root=repo_root,
        record=assets.get("eligibilityMask"),
        expected_path=eligibility_path,
        label=f"{prefix} eligibilityMask",
        errors=errors,
    )
    alpha_mask = _check_mask_record(
        repo_root=repo_root,
        record=assets.get("alphaMask"),
        expected_path=alpha_path,
        label=f"{prefix} alphaMask",
        errors=errors,
    )

    identity_image = _check_identity_reference(
        repo_root,
        target.pet_root,
        metadata.get("identityReference"),
        errors,
    )
    prompt_text = _check_text_record(
        repo_root=repo_root,
        record=metadata.get("prompt"),
        expected_path=target.pet_root / builder.PROMPT_PATH,
        label=f"{prefix} prompt",
        errors=errors,
    )
    if prompt_text is not None:
        prompt_record = metadata.get("prompt")
        if isinstance(prompt_record, dict):
            if prompt_record.get("sourceSha256") != builder.sha256_bytes(
                (target.pet_root / builder.PROMPT_PATH).read_bytes()
            ):
                errors.append(
                    f"{prefix} prompt.sourceSha256 与保存 prompt 不一致"
                )
            if prompt_record.get("encoding") != "utf-8":
                errors.append(f"{prefix} prompt.encoding 必须为 utf-8")
            source_kind = prompt_record.get("sourceKind")
            prompt_verified = prompt_record.get(
                "actualRequestPromptVerified"
            )
            if (
                source_kind == "actual_imagegen_request"
                and prompt_verified is not True
            ) or (
                source_kind
                == "documented_prompt_request_unverified"
                and prompt_verified is not False
            ) or source_kind not in {
                "actual_imagegen_request",
                "documented_prompt_request_unverified",
            }:
                errors.append(
                    f"{prefix} prompt sourceKind/verified 状态不一致"
                )
            if not _portable_relative_path(
                prompt_record.get("selectionDocumentationPath"),
                first_part=".run",
                suffix=".txt",
            ):
                errors.append(
                    f"{prefix} prompt.selectionDocumentationPath "
                    "必须是 .run 内相对 txt"
                )
            if not _valid_sha(
                prompt_record.get("selectionDocumentationSha256")
            ):
                errors.append(
                    f"{prefix} prompt.selectionDocumentationSha256 非法"
                )
        if not builder._prompt_declares_dedicated_no_crop(prompt_text):
            errors.append(
                f"{prefix} prompt 未同时声明 dedicated headshot 与禁止裁图"
            )
    if (
        attestation_value is not None
        and isinstance(original_input, dict)
        and isinstance(metadata.get("identityReference"), dict)
        and isinstance(metadata.get("prompt"), dict)
    ):
        identity_record_for_attestation = metadata["identityReference"]
        prompt_record_for_attestation = metadata["prompt"]
        validated_generation_result = (
            _check_generation_attestation_snapshot(
                evidence=attestation_value.get(
                    "generationResultEvidence"
                ),
                generation_id=source.get("generationId"),
                form_id=prefix,
                repo_root=repo_root,
                identity_reference=identity_record_for_attestation,
                prompt_record=prompt_record_for_attestation,
                original_generated_path=original_generated_path,
                original_input=original_input,
                errors=errors,
                prefix=prefix,
            )
        )

        replayed_identity_evidence: dict[str, Any] | None = None
        identity_reference_path = _safe_record_path(
            repo_root,
            identity_record_for_attestation.get("path"),
            f"{prefix} identityReference",
            errors,
        )
        if identity_reference_path is not None:
            catalog_for_identity = (
                target.catalog_path
                if target.catalog_path is not None
                else (repo_root / DEFAULT_CATALOG).resolve()
            )
            try:
                replayed_identity_evidence = (
                    builder._validate_identity_evidence(
                        repo_root=repo_root,
                        pet_root=target.pet_root,
                        form_id=prefix,
                        identity_reference=identity_reference_path,
                        catalog_path=catalog_for_identity,
                        isolated=target.source == "isolated",
                    )
                )
            except builder.PortraitBuildError as exc:
                errors.append(
                    f"{prefix} identityEvidence "
                    f"无法从权威 identity bundle 重放：{exc}"
                )
        expected_identity_evidence = replayed_identity_evidence
        if replayed_identity_evidence is not None:
            try:
                identity_transition_record = (
                    builder._validate_identity_evidence_transition(
                        repo_root=repo_root,
                        pet_root=target.pet_root,
                        form_id=prefix,
                        attested_identity_evidence=(
                            attestation_value.get("identityEvidence")
                        ),
                        replayed_identity_evidence=(
                            replayed_identity_evidence
                        ),
                    )
                )
            except builder.PortraitBuildError as exc:
                errors.append(
                    f"{prefix} identityEvidence "
                    "与权威 identity bundle 重放不一致："
                    f"{exc}"
                )
            else:
                if identity_transition_record is not None:
                    expected_identity_evidence = (
                        attestation_value.get("identityEvidence")
                    )

        expected_attestation = {
            "schemaVersion": builder.GENERATION_ATTESTATION_SCHEMA_VERSION,
            "generator": "built_in_imagegen",
            "generationId": source.get("generationId"),
            "compositionClaim": "dedicated_headshot",
            "independentlyAuthoredClaim": True,
            "semanticIndependenceVerified": False,
            "ownerReviewStatus": "owner_review_pending",
            "releaseGate": False,
            "fullBodyCropAllowed": False,
            "claimLimit": (
                "project-directed generated candidate; automated checks do "
                "not prove semantic independence, copyright provenance, or "
                "owner approval"
            ),
            "sourceInputSha256": builder.sha256_file(
                original_generated_path
            )
            if original_generated_path.is_file()
            else None,
            "sourceInputRgbaSha256": rgba_hash(
                original_generated_image.convert("RGBA")
            )
            if original_generated_image is not None
            else None,
            "identityReferencePath": identity_record_for_attestation.get(
                "path"
            ),
            "identityReferenceSha256": identity_record_for_attestation.get(
                "sha256"
            ),
            "promptSha256": prompt_record_for_attestation.get(
                "selectionDocumentationSha256"
            ),
            "promptContract": "dedicated_headshot_not_full_body_crop_v1",
            "generationResultEvidence": validated_generation_result,
            "identityEvidence": expected_identity_evidence,
        }
        expected_attestation_keys = set(expected_attestation)
        legacy_attestation_keys = expected_attestation_keys - {
            "releaseGate"
        }
        actual_attestation_keys = set(attestation_value)
        accepted_attestation_keys = [expected_attestation_keys]
        if prefix not in PORTRAIT_RELEASE_GATE_REQUIRED_FORM_IDS:
            accepted_attestation_keys.append(legacy_attestation_keys)
        if actual_attestation_keys not in accepted_attestation_keys:
            errors.append(
                f"{prefix} generationAttestation 字段集合不符合严格 schema"
            )
        for key, expected in expected_attestation.items():
            if (
                key == "releaseGate"
                and key not in attestation_value
                and prefix not in PORTRAIT_RELEASE_GATE_REQUIRED_FORM_IDS
            ):
                continue
            if attestation_value.get(key) != expected:
                errors.append(
                    f"{prefix} generationAttestation.{key} 绑定不一致"
                )
    ownership_text = _check_text_record(
        repo_root=repo_root,
        record=metadata.get("ownership"),
        expected_path=target.pet_root / builder.OWNERSHIP_PATH,
        label=f"{prefix} ownership",
        errors=errors,
    )
    if ownership_text is not None:
        for needle in (
            "independently authored claim: `true` (`untrusted_claim`)",
            "semantic independence verified by automation: `false`",
            "full-body crop allowed: `false`",
            "claim limit:",
        ):
            if needle not in ownership_text:
                errors.append(f"{prefix} ownership 缺少声明：{needle}")
        prompt_record = metadata.get("prompt")
        if isinstance(prompt_record, dict):
            ownership_lower = ownership_text.casefold()
            source_kind = prompt_record.get("sourceKind")
            expected_kind_line = (
                f"- prompt source kind: `{source_kind}`"
            )
            expected_selection_line = (
                "- selected prompt documentation: "
                f"`{prompt_record.get('selectionDocumentationPath')}`"
            )
            if expected_kind_line.casefold() not in ownership_lower:
                errors.append(
                    f"{prefix} ownership prompt source kind 不一致"
                )
            if expected_selection_line.casefold() not in ownership_lower:
                errors.append(
                    f"{prefix} ownership selected prompt documentation "
                    "不一致"
                )
            has_exact_request = (
                "- exact imagegen request prompt:" in ownership_lower
            )
            has_unverified_documented = (
                "- documented prompt (actual exec request unavailable):"
                in ownership_lower
            )
            if source_kind == "actual_imagegen_request":
                if not has_exact_request or has_unverified_documented:
                    errors.append(
                        f"{prefix} ownership 未诚实声明 verified request prompt"
                    )
            elif (
                source_kind
                == "documented_prompt_request_unverified"
            ) and (
                has_exact_request or not has_unverified_documented
            ):
                errors.append(
                    f"{prefix} ownership 未诚实声明 exec prompt unverified"
                )

    evidence = metadata.get("evidence")
    if not isinstance(evidence, dict):
        errors.append(f"{prefix} evidence metadata 缺失")
        evidence = {}
    contact_image = _check_image_record(
        repo_root=repo_root,
        record=evidence.get("contactSheet"),
        expected_path=target.pet_root / builder.CONTACT_SHEET_PATH,
        label=f"{prefix} contactSheet",
        errors=errors,
        expected_size=(1600, 1180),
        expected_mode="RGBA",
        expected_format="PNG",
    )
    if evidence.get("compactSizes") != [48, 64, 96, 128]:
        errors.append(f"{prefix} compactSizes 必须为 48/64/96/128")
    if evidence.get("nativeSize") != builder.MASTER_SIZE:
        errors.append(f"{prefix} nativeSize 必须为 {builder.MASTER_SIZE}")
    if master_image is not None and contact_image is not None:
        replay_contact = builder._build_contact_sheet(master_image)
        if rgba_hash(replay_contact) != rgba_hash(contact_image.convert("RGBA")):
            errors.append(f"{prefix} contactSheet 无法从 1024 master 精确重放")

    owner_review = metadata.get("ownerReview")
    owner_review_status = _check_owner_review(
        repo_root=repo_root,
        target=target,
        owner_review=owner_review,
        ownership_text=ownership_text,
        master_path=master_path,
        runtime_path=runtime_path,
        errors=errors,
    )

    processing = metadata.get("processing")
    if not isinstance(processing, dict):
        errors.append(f"{prefix} processing metadata 缺失")
        processing = {}
    if processing.get("edgeContractVersion") != builder.EDGE_CONTRACT_VERSION:
        errors.append(f"{prefix} edgeContractVersion 错误")
    expected_safe_margin = {
        "version": 1,
        "minimumRatio": builder.MIN_EDGE_MARGIN_RATIO,
        "rounding": "ceil",
        "visibleAlphaThreshold": COMPOSITION_AUDIT_ALPHA_THRESHOLD,
        "masterPixels": builder.MIN_MASTER_EDGE_MARGIN,
        "runtimePixels": builder.MIN_RUNTIME_EDGE_MARGIN,
    }
    if processing.get("safeMarginContract") != expected_safe_margin:
        errors.append(f"{prefix} safeMarginContract 必须严格为 8% ceil 门槛")
    duplicate_guard = processing.get("duplicateGuard")
    if not isinstance(duplicate_guard, dict):
        errors.append(f"{prefix} processing.duplicateGuard 缺失")
        duplicate_guard = {}
    expected_duplicate_guard = {
        "method": "normalized_rgba_scaled_copy_guard_v1",
        "normalizedSize": 128,
        "coarseNormalizedSize": 64,
        "alphaIouThreshold": 0.995,
        "meanAbsoluteErrorThreshold": 2.0,
        "semanticProof": False,
    }
    for key, expected in expected_duplicate_guard.items():
        if duplicate_guard.get(key) != expected:
            errors.append(f"{prefix} duplicateGuard.{key} 错误")
    if (
        not isinstance(duplicate_guard.get("checkedExistingImages"), int)
        or duplicate_guard.get("checkedExistingImages") < 1
    ):
        errors.append(
            f"{prefix} duplicateGuard.checkedExistingImages 必须至少覆盖 identity"
        )
    independent_evidence = metadata.get("independentCompositionEvidence")
    if not isinstance(independent_evidence, dict):
        errors.append(f"{prefix} independentCompositionEvidence 缺失")
    else:
        expected_attestation_path = _repo_relative(
            repo_root,
            target.pet_root / builder.ATTESTATION_PATH,
        )
        if (
            independent_evidence.get("generatorAttestation")
            != expected_attestation_path
        ):
            errors.append(
                f"{prefix} independentCompositionEvidence attestation 路径错误"
            )
        if (
            independent_evidence.get("promptContract")
            != "dedicated_headshot_not_full_body_crop_v1"
        ):
            errors.append(
                f"{prefix} independentCompositionEvidence prompt contract 错误"
            )
        if independent_evidence.get("ownerVisualReviewRequired") is not True:
            errors.append(
                f"{prefix} independent composition 必须保留 owner review"
            )
        if independent_evidence.get("claimLimit") != (
            "hash and normalized-copy checks reject exact/scaled reuse "
            "but do not prove semantic independent authorship"
        ):
            errors.append(
                f"{prefix} independent composition claimLimit "
                "必须精确保留自动证明边界"
            )
        if independent_evidence.get("duplicateGuard") != duplicate_guard:
            errors.append(
                f"{prefix} independentCompositionEvidence.duplicateGuard "
                "与 processing 不一致"
            )
        identity_record = metadata.get("identityReference")
        if (
            not isinstance(identity_record, dict)
            or independent_evidence.get("identityReferenceSha256")
            != identity_record.get("sha256")
        ):
            errors.append(
                f"{prefix} independent composition identity hash 绑定不一致"
            )
    alpha_meta = processing.get("alphaMatte")
    if not isinstance(alpha_meta, dict):
        errors.append(f"{prefix} alphaMatte metadata 缺失")
        alpha_meta = {}
    despill = alpha_meta.get("despill")
    if not isinstance(despill, dict):
        errors.append(f"{prefix} despill metadata 缺失")
        despill = {}
    expected_despill = {
        "helper": "sprite_alpha_despill.despill_transparent_alpha",
        "scope": "same_operation_exact_eligibility_mask_only",
        "despillApplied": True,
        "globalColorAdjustmentApplied": False,
        "changedOutsideEligibilityPixels": 0,
        "alphaPixelsChanged": 0,
    }
    for key, expected in expected_despill.items():
        if despill.get(key) != expected:
            errors.append(f"{prefix} despill.{key} 不符合 edge-contract 1")
    for hash_key in ("beforeRgbaSha256", "afterRgbaSha256"):
        if not _valid_sha(despill.get(hash_key)):
            errors.append(f"{prefix} despill.{hash_key} 缺失或非法")
    if not isinstance(despill.get("changedPixelCount"), int) or despill.get("changedPixelCount") < 0:
        errors.append(f"{prefix} despill.changedPixelCount 非法")

    runtime_derivation = processing.get("runtimeDerivation")
    if not isinstance(runtime_derivation, dict):
        errors.append(f"{prefix} runtimeDerivation metadata 缺失")
    else:
        if runtime_derivation.get("function") != "build_pet_art_bundle.resize_rgba_premultiplied":
            errors.append(f"{prefix} runtimeDerivation.function 错误")
        if runtime_derivation.get("resampleMode") != PREMULTIPLIED_LANCZOS:
            errors.append(f"{prefix} runtimeDerivation.resampleMode 错误")
        if runtime_derivation.get("postResizeColorPassApplied") is not False:
            errors.append(f"{prefix} runtime 不得追加全局色彩处理")
        if runtime_derivation.get("postResizeDespillApplied") is not False:
            errors.append(f"{prefix} runtime 不得追加 despill")

    if raw_image is not None and eligibility is not None and alpha_mask is not None:
        try:
            key = builder.parse_hex_color(str(alpha_meta.get("key", "")))
            replay_cleaned, replay_eligibility, replay_alpha, replay_meta = builder._matte_chroma(
                raw_image,
                key=key,
                transparent_distance=float(alpha_meta.get("transparentDistance")),
                opaque_distance=float(alpha_meta.get("opaqueDistance")),
                alpha_threshold=int(alpha_meta.get("alphaThreshold")),
            )
            if not np.array_equal(
                replay_eligibility.astype(np.uint8) * 255,
                eligibility,
            ):
                errors.append(f"{prefix} eligibility mask 无法从 raw source 重放")
            if not np.array_equal(replay_alpha, alpha_mask):
                errors.append(f"{prefix} alpha mask 无法从 raw source 重放")
            if replay_meta != alpha_meta:
                errors.append(f"{prefix} alphaMatte metadata 无法精确重放")
            replay_master = builder._fit_complete_composition(
                replay_cleaned,
                builder.MASTER_SIZE,
            )
            if master_image is not None and rgba_hash(replay_master) != rgba_hash(master_image.convert("RGBA")):
                errors.append(f"{prefix} master 无法从 raw/mask pipeline 重放")
            replay_runtime = resize_rgba_premultiplied(
                replay_master,
                (builder.RUNTIME_SIZE, builder.RUNTIME_SIZE),
                resample_mode=PREMULTIPLIED_LANCZOS,
            )
            if runtime_image is not None and rgba_hash(replay_runtime) != rgba_hash(runtime_image.convert("RGBA")):
                errors.append(f"{prefix} runtime 无法从 1024 master 重放")
        except (ValueError, TypeError, argparse.ArgumentTypeError, builder.PortraitBuildError) as exc:
            errors.append(f"{prefix} chroma pipeline 重放失败：{exc}")

    recorded_alpha_threshold = alpha_meta.get("alphaThreshold")
    if (
        not isinstance(recorded_alpha_threshold, int)
        or not 1 <= recorded_alpha_threshold <= 127
    ):
        errors.append(f"{prefix} alphaMatte.alphaThreshold 非法")
        recorded_alpha_threshold = builder.DEFAULT_ALPHA_THRESHOLD
    for label, image, minimum_margin in (
        ("master", master_image, builder.MIN_MASTER_EDGE_MARGIN),
        ("runtime", runtime_image, builder.MIN_RUNTIME_EDGE_MARGIN),
    ):
        if image is None:
            continue
        try:
            actual_metrics = builder.image_composition_metrics(
                image,
                alpha_threshold=COMPOSITION_AUDIT_ALPHA_THRESHOLD,
                minimum_edge_margin=minimum_margin,
            )
        except builder.PortraitBuildError as exc:
            errors.append(
                f"{prefix} {label} composition 按固定 alpha>=8 审计失败："
                f"{exc}"
            )
            continue
        composition = metadata.get("composition")
        recorded = composition.get(label) if isinstance(composition, dict) else None
        if recorded != actual_metrics:
            errors.append(f"{prefix} {label} composition metadata 与文件不一致")

    portrait_images = [
        image
        for image in (master_image, runtime_image)
        if image is not None
    ]
    if identity_image is not None:
        for image in portrait_images:
            metrics = builder.scaled_copy_metrics(image, identity_image)
            if metrics["duplicate"]:
                errors.append(
                    f"{prefix} portrait 与声明的 identityReference 是同图或"
                    f"缩放拷贝：metrics={metrics}"
                )
                break
    excluded = {
        original_generated_path.absolute(),
        raw_path.absolute(),
        master_path.absolute(),
        runtime_path.absolute(),
        eligibility_path.absolute(),
        alpha_path.absolute(),
        (target.pet_root / builder.CONTACT_SHEET_PATH).absolute(),
    }
    compared = _check_independent_hashes(
        repo_root,
        target,
        portrait_images,
        excluded,
        errors,
    )
    raw_rgba_sha = (
        rgba_hash(raw_image.convert("RGBA")) if raw_image is not None else None
    )
    master_rgba_sha = (
        rgba_hash(master_image.convert("RGBA"))
        if master_image is not None
        else None
    )
    runtime_rgba_sha = (
        rgba_hash(runtime_image.convert("RGBA"))
        if runtime_image is not None
        else None
    )
    result = {
        "formId": prefix,
        "source": target.source,
        "petRoot": _repo_relative(repo_root, target.pet_root),
        "portraitPath": _repo_relative(repo_root, runtime_path),
        "generationId": source.get("generationId"),
        "rawRgbaSha256": raw_rgba_sha,
        "masterRgbaSha256": master_rgba_sha,
        "runtimeRgbaSha256": runtime_rgba_sha,
        "masterNormalizedSha256": builder.normalized_visual_sha256(
            master_image,
            alpha_threshold=COMPOSITION_AUDIT_ALPHA_THRESHOLD,
        )
        if master_image is not None
        else None,
        "runtimeNormalizedSha256": builder.normalized_visual_sha256(
            runtime_image,
            alpha_threshold=COMPOSITION_AUDIT_ALPHA_THRESHOLD,
        )
        if runtime_image is not None
        else None,
        "comparedPetRootImages": compared,
        # Compatibility field retained for callers while the audit now scans
        # every PNG/WebP under the pet root, not only three named directories.
        "comparedIdentityWorldBattleImages": compared,
        "ownerReviewStatus": owner_review_status,
    }
    if identity_transition_record is not None:
        result["identityEvidenceTransition"] = (
            identity_transition_record
        )
    fingerprint = PortraitFingerprint(
        form_id=prefix,
        generation_id=source.get("generationId")
        if isinstance(source.get("generationId"), str)
        else None,
        raw_rgba_sha256=raw_rgba_sha,
        master_rgba_sha256=master_rgba_sha,
        runtime_rgba_sha256=runtime_rgba_sha,
        master_image=master_image,
        runtime_image=runtime_image,
    )
    return result, errors, fingerprint


def _candidate_review_boundary(
    entries: Sequence[dict[str, Any]] = (),
) -> dict[str, Any]:
    """Describe the invariant boundary of every portrait integrity audit."""

    all_owner_approved = bool(entries) and all(
        entry.get("ownerReviewStatus") == "approved"
        for entry in entries
    )
    return {
        "releaseGate": False,
        "semanticIndependenceVerified": False,
        "ownerDecisionRequired": not all_owner_approved,
        "ownerDecisionStatus": (
            "approved"
            if all_owner_approved
            else "owner_review_pending"
        ),
        "releaseGateReason": (
            (
                "导入时 attestation snapshot 与仓库完整性审计不构成完整 "
                "provenance、语义独立证明或发布批准；可信项目 owner "
                "视觉决定已记录，但本工具仍不授予发布资格"
            )
            if all_owner_approved
            else (
                "导入时 attestation snapshot 与仓库完整性审计不构成完整 "
                "provenance、语义独立证明或发布批准；必须另取可信项目 "
                "owner 的视觉验收决定"
            )
        ),
    }


def audit_portrait_target(
    *,
    repo_root: Path,
    form_id: str,
    pet_root: Path,
    source: str,
    catalog_path: Path = DEFAULT_CATALOG,
) -> dict[str, Any]:
    """Audit one candidate bundle without claiming release approval."""

    repo_root = repo_root.absolute()
    errors: list[str] = []
    if not repo_root.is_dir():
        return {
            "status": "failed",
            "mode": "single-target",
            **_candidate_review_boundary(),
            "audited": 0,
            "entries": [],
            "errors": [f"仓库目录不存在：{repo_root}"],
        }
    if not builder.FORM_ID_PATTERN.fullmatch(form_id):
        errors.append("single-target formId 格式非法")
    if source not in {"catalog", "isolated"}:
        errors.append(
            "single-target source 必须是 catalog 或 isolated"
        )
    resolved_root = _inside_repo(
        repo_root,
        pet_root,
        f"single-target {form_id}.petRoot",
        errors,
    )
    resolved_catalog = _inside_repo(
        repo_root,
        catalog_path,
        "single-target pet_art_catalog",
        errors,
    )
    target: PortraitTarget | None = None
    if (
        not errors
        and resolved_root is not None
        and resolved_catalog is not None
    ):
        if source == "catalog":
            target = _single_catalog_target(
                repo_root=repo_root,
                catalog_path=resolved_catalog,
                form_id=form_id,
                pet_root=resolved_root,
                errors=errors,
            )
        else:
            try:
                builder._validate_isolated_not_catalogued(
                    repo_root=repo_root.resolve(),
                    catalog_path=resolved_catalog,
                    form_id=form_id,
                    pet_root=resolved_root,
                )
            except builder.PortraitBuildError as exc:
                errors.append(f"{form_id} isolated 绑定失败：{exc}")
            target = PortraitTarget(
                form_id=form_id,
                pet_root=resolved_root,
                portrait_path=(
                    resolved_root / builder.RUNTIME_PATH
                ).resolve(),
                source="isolated",
                catalog_path=None,
            )

    entries: list[dict[str, Any]] = []
    if target is not None:
        entry, target_errors, _ = _audit_target(repo_root, target)
        entries.append(entry)
        errors.extend(target_errors)
    return {
        "status": "ok" if not errors else "failed",
        "mode": "single-target",
        **_candidate_review_boundary(entries),
        "formId": form_id,
        "source": source,
        "petRoot": (
            _repo_relative(repo_root, resolved_root)
            if resolved_root is not None
            else str(pet_root)
        ),
        "audited": len(entries),
        "entries": entries,
        "errors": errors,
    }


def audit_portraits(
    *,
    repo_root: Path,
    catalog_path: Path = DEFAULT_CATALOG,
    expected_catalog_count: int = DEFAULT_EXPECTED_CATALOG_COUNT,
    isolated_roots: Sequence[tuple[str, Path]] = (),
    mode: str = "combined",
    expected_isolated_count: int = DEFAULT_EXPECTED_ISOLATED_COUNT,
) -> dict[str, Any]:
    repo_root = repo_root.absolute()
    errors: list[str] = []
    if not repo_root.is_dir():
        return {
            "status": "failed",
            "mode": mode,
            **_candidate_review_boundary(),
            "errors": [f"仓库目录不存在：{repo_root}"],
            "entries": [],
        }
    if mode not in {"combined", "catalog-only", "isolated-only"}:
        return {
            "status": "failed",
            "mode": mode,
            **_candidate_review_boundary(),
            "errors": [f"未知审计模式：{mode}"],
            "entries": [],
        }
    if expected_catalog_count < 0 or expected_isolated_count < 0:
        return {
            "status": "failed",
            "mode": mode,
            **_candidate_review_boundary(),
            "errors": ["expected count 不能为负数"],
            "entries": [],
        }
    # The public/default combined integrity scope is intentionally
    # non-configurable: callers cannot weaken the 36 + 0 production audit.
    # Passing it still does not confer provenance, semantic independence,
    # owner approval, or release eligibility.
    if mode == "combined":
        expected_catalog_count = DEFAULT_EXPECTED_CATALOG_COUNT
        expected_isolated_count = DEFAULT_EXPECTED_ISOLATED_COUNT

    targets: list[PortraitTarget] = []
    include_catalog = mode in {"combined", "catalog-only"}
    include_isolated = mode in {"combined", "isolated-only"}
    catalog_targets: list[PortraitTarget] = []
    isolated_targets: list[PortraitTarget] = []
    if include_catalog:
        resolved_catalog = _inside_repo(
            repo_root,
            catalog_path,
            "pet_art_catalog",
            errors,
        )
        if resolved_catalog is not None:
            if mode == "combined":
                authoritative_catalog = (
                    repo_root / DEFAULT_CATALOG
                ).resolve()
                if resolved_catalog != authoritative_catalog:
                    errors.append(
                        "combined 完整性审计必须读取固定 runtime catalog："
                        f"{DEFAULT_CATALOG.as_posix()}"
                    )
            catalog_targets = _catalog_targets(
                repo_root,
                resolved_catalog,
                expected_catalog_count,
                errors,
            )
            targets.extend(catalog_targets)
    if include_isolated:
        isolated_targets = _isolated_targets(
            repo_root,
            isolated_roots,
            expected_isolated_count,
            errors,
        )
        targets.extend(isolated_targets)
    elif isolated_roots:
        errors.append("catalog-only 模式不得传入 isolated roots")

    if mode == "combined":
        _check_authoritative_target_mapping(
            repo_root=repo_root,
            targets=catalog_targets,
            expected=AUTHORITATIVE_CATALOG_FORM_ROOTS,
            label="正式 catalog",
            errors=errors,
        )
        _check_authoritative_target_mapping(
            repo_root=repo_root,
            targets=isolated_targets,
            expected=AUTHORITATIVE_ISOLATED_FORM_ROOTS,
            label="isolated 融合宠",
            errors=errors,
        )

    seen_forms: set[str] = set()
    seen_roots: set[Path] = set()
    entries: list[dict[str, Any]] = []
    fingerprints: list[PortraitFingerprint] = []
    for target in targets:
        if target.form_id in seen_forms:
            errors.append(
                f"跨来源重复 portrait formId：{target.form_id}"
            )
            continue
        if target.pet_root in seen_roots:
            errors.append(
                "跨来源重复 portrait petRoot："
                f"{_repo_relative(repo_root, target.pet_root)}"
            )
            continue
        seen_forms.add(target.form_id)
        seen_roots.add(target.pet_root)
        entry, target_errors, fingerprint = _audit_target(repo_root, target)
        entries.append(entry)
        fingerprints.append(fingerprint)
        errors.extend(target_errors)

    for left_index, left in enumerate(fingerprints):
        for right in fingerprints[left_index + 1 :]:
            pair = f"{left.form_id} / {right.form_id}"
            if (
                left.generation_id
                and right.generation_id
                and left.generation_id == right.generation_id
            ):
                errors.append(f"跨宠 generationId 重复：{pair}")
            for label, left_hash, right_hash in (
                (
                    "raw",
                    left.raw_rgba_sha256,
                    right.raw_rgba_sha256,
                ),
                (
                    "master",
                    left.master_rgba_sha256,
                    right.master_rgba_sha256,
                ),
                (
                    "runtime",
                    left.runtime_rgba_sha256,
                    right.runtime_rgba_sha256,
                ),
            ):
                if left_hash and left_hash == right_hash:
                    errors.append(f"跨宠 {label} decoded RGBA 完全相同：{pair}")
            left_images = [
                image
                for image in (left.master_image, left.runtime_image)
                if image is not None
            ]
            right_images = [
                image
                for image in (right.master_image, right.runtime_image)
                if image is not None
            ]
            duplicate_metrics: dict[str, Any] | None = None
            for left_image in left_images:
                for right_image in right_images:
                    metrics = builder.scaled_copy_metrics(
                        left_image,
                        right_image,
                    )
                    if metrics["duplicate"]:
                        duplicate_metrics = metrics
                        break
                if duplicate_metrics is not None:
                    break
            if duplicate_metrics is not None:
                errors.append(
                    f"跨宠 portrait 是同图或跨分辨率缩放拷贝：{pair} "
                    f"metrics={duplicate_metrics}"
                )
    return {
        "status": "ok" if not errors else "failed",
        "mode": mode,
        **_candidate_review_boundary(entries),
        "catalogExpected": expected_catalog_count if include_catalog else 0,
        "isolatedExpected": expected_isolated_count if include_isolated else 0,
        "audited": len(entries),
        "entries": entries,
        "errors": errors,
    }


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-root", type=Path, default=Path.cwd())
    parser.add_argument("--catalog", type=Path, default=DEFAULT_CATALOG)
    parser.add_argument(
        "--isolated-root",
        action="append",
        type=parse_isolated_root,
        default=[],
        metavar="FORM_ID=PATH",
    )
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument(
        "--catalog-only",
        action="store_true",
        help="只审计正式 36-form catalog，不接受 isolated roots",
    )
    mode.add_argument(
        "--isolated-only",
        action="store_true",
        help="只审计显式 isolated roots，不读取正式 catalog",
    )
    mode.add_argument(
        "--single-target",
        type=parse_isolated_root,
        metavar="FORM_ID=PATH",
        help=(
            "只验证一个候选 bundle；不能替代 combined 36+0 完整性审计，"
            "两者都不授予发布资格"
        ),
    )
    parser.add_argument(
        "--single-source",
        choices=("catalog", "isolated"),
        help="--single-target 的来源类型；使用 single-target 时必须显式提供",
    )
    return parser


def main(argv: Iterable[str] | None = None) -> int:
    parser = _parser()
    args = parser.parse_args(argv)
    if args.single_target is not None:
        if args.single_source is None:
            parser.error("--single-target 必须同时提供 --single-source")
        if args.isolated_root:
            parser.error("--single-target 不得同时提供 --isolated-root")
        form_id, pet_root = args.single_target
        result = audit_portrait_target(
            repo_root=args.repo_root,
            form_id=form_id,
            pet_root=pet_root,
            source=args.single_source,
            catalog_path=args.catalog,
        )
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0 if result["status"] == "ok" else 1
    if args.single_source is not None:
        parser.error("--single-source 只能与 --single-target 一起使用")
    mode = (
        "catalog-only"
        if args.catalog_only
        else "isolated-only"
        if args.isolated_only
        else "combined"
    )
    result = audit_portraits(
        repo_root=args.repo_root,
        catalog_path=args.catalog,
        isolated_roots=args.isolated_root,
        mode=mode,
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["status"] == "ok" else 1


if __name__ == "__main__":
    raise SystemExit(main())
