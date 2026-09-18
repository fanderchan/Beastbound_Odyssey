#!/usr/bin/env python3
"""Read-only structural, provenance, PNG and release audit for map bundles.

The script intentionally uses only the Python standard library. It validates
paths and byte hashes before parsing referenced JSON, and decodes non-interlaced
8-bit PNGs so dimensions and alpha contracts are checked from pixels rather
than inferred from filenames or container metadata.
"""

from __future__ import annotations

import argparse
import binascii
from datetime import datetime, timedelta, timezone
from functools import lru_cache
import hashlib
import importlib.util
import json
import math
import re
import struct
import subprocess
import sys
import zlib
from dataclasses import dataclass, field
from pathlib import Path
from statistics import median
from typing import Any, Iterable


PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
MANIFEST_NAME = "map-visual-bundle.json"
SCHEMA_VERSION = 1
TILE_SIZE = [80, 40]
ID_RE = re.compile(r"^[a-z0-9][a-z0-9_-]*$")
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
MAP_RUNTIME_BUILD_IDENTITY_NAMESPACE = "beastbound-map-runtime-surface-v2"
MAP_RUNTIME_BUILD_IDENTITY_RE = re.compile(
    rf"^git:[0-9a-f]{{40}}\+"
    rf"{re.escape(MAP_RUNTIME_BUILD_IDENTITY_NAMESPACE)}:[0-9a-f]{{64}}$"
)
VALID_STATUSES = {
    "in_production",
    "owner_review_pending",
    "approved",
    "released",
    "rejected",
}
VALID_OWNER_REVIEW_STATUSES = {"pending", "approved", "rejected"}
VALID_ALPHA_MODES = {"opaque", "mixed"}
VALID_RENDER_LAYERS = {"ground_decal", "world", "foreground"}
VALID_COLLISION_ROLES = {"none", "decorative", "blocking", "interaction"}
VALID_SCREENSHOT_MODES = {"idle", "moving", "transition", "occlusion"}
MIN_VARIANT_SEED = -(2**31)
MAX_VARIANT_SEED = 2**31 - 1
SURFACE_TRANSITION_KEYS = {
    "nw",
    "ne",
    "nw_ne",
    "sw",
    "nw_sw",
    "ne_sw",
    "nw_ne_sw",
    "se",
    "nw_se",
    "ne_se",
    "nw_ne_se",
    "sw_se",
    "nw_sw_se",
    "ne_sw_se",
    "nw_ne_sw_se",
}
MAX_PNG_PIXELS = 64 * 1024 * 1024
MAIN_SCENE = "res://scenes/Main.tscn"
MAIN_VIEWPORT = [1280, 720]
COLLISION_REPORT_TYPE = "beastbound_map_collision_audit"
PERFORMANCE_REPORT_TYPE = "beastbound_map_performance_report"
COMPUTER_USE_REPORT_TYPE = "beastbound_map_computer_use_review"
COLLISION_COMMAND = (
    "godot --headless --path client/godot --script "
    "res://scripts/qa/map_visual_runtime_check.gd"
)
COLLISION_PREVIEW_COMMAND = (
    f"{COLLISION_COMMAND} -- --preview-map-visual-catalog-contract"
)
VALID_COLLISION_COMMANDS = {
    COLLISION_COMMAND,
    COLLISION_PREVIEW_COMMAND,
}
PERFORMANCE_LEGACY_COMPARISON_MODE = "legacy_fallback_vs_candidate"
# Retain the historical public name for legacy fixtures and callers.
PERFORMANCE_COMPARISON_MODE = PERFORMANCE_LEGACY_COMPARISON_MODE
PERFORMANCE_REPEATED_COMPARISON_MODES = {
    PERFORMANCE_LEGACY_COMPARISON_MODE,
    "released_primary_vs_same_primary_qa_preview",
}
PERFORMANCE_GATE_NAMES = {
    "candidateIdleWithinLimit",
    "candidateMovingWithinLimit",
    "idleRegressionWithinLimit",
    "movingRegressionWithinLimit",
}
PERFORMANCE_LEGACY_THRESHOLDS = {
    "candidateIdleProcessMeanMaxMs": 0.5,
    "candidateMovingProcessMeanMaxMs": 0.6,
    "idleRegressionMaxMs": 0.1,
    "movingRegressionMaxMs": 0.35,
}
PERFORMANCE_PROCESS_SCOPE_THRESHOLDS = {
    "candidateIdleProcessScopeMeanMaxMs": 0.5,
    "candidateMovingProcessScopeMeanMaxMs": 0.6,
    "idleProcessScopeRegressionMaxMs": 0.1,
    "movingProcessScopeRegressionMaxMs": 0.35,
}
# Retain the historical public name for legacy report fixtures and callers.
PERFORMANCE_THRESHOLDS = PERFORMANCE_LEGACY_THRESHOLDS
PERFORMANCE_REPEATED_AGGREGATION_MODE = (
    "median_of_independent_run_means_with_envelope_extrema"
)
PERFORMANCE_REPEATED_EXECUTION_ORDER = (
    "repetition_then_rotated_map_then_mode_then_alternating_variant_order"
)
PERFORMANCE_LEGACY_AGGREGATION_MODE = "legacy_single_run"
PERFORMANCE_LEGACY_EXECUTION_ORDER = "legacy_single_run"
PERFORMANCE_FIXED_STEP_FPS = 60
PERFORMANCE_WARMUP_FRAMES = 180
PERFORMANCE_MEASUREMENT_FRAMES = 480
PERFORMANCE_SAMPLE_FRAMES = 60
PERFORMANCE_SAMPLES_PER_REPETITION = (
    PERFORMANCE_MEASUREMENT_FRAMES // PERFORMANCE_SAMPLE_FRAMES
)
PERFORMANCE_MOVING_WORKLOAD_CONTRACT = "spawn_adjacent_pair_v1"
PERFORMANCE_RUNNER_RECORD_TYPE = "beastbound_map_performance_runner_receipt"
PERFORMANCE_RUNNER_VERSION = "4.7.stable.official.5b4e0cb0f"
PERFORMANCE_AGGREGATED_SAMPLE_METHOD = PERFORMANCE_REPEATED_AGGREGATION_MODE
PERFORMANCE_METRIC_PROVENANCE = {
    "processTotalMsMinMeanMax": "Main._process_only",
    "processScopeTotalMsMinMeanMax": (
        "QA_process_priority_boundaries_all_intervening_Node_process_callbacks"
    ),
    "drawWorldMsMinMeanMax": (
        "Main._draw_only_missing_windows_recorded_as_zero"
    ),
}
PERFORMANCE_METRIC_SCOPE = {
    **PERFORMANCE_METRIC_PROVENANCE,
    "comparisonAndGateMetric": "processScopeTotalMsMinMeanMax",
}
PERFORMANCE_LEGACY_METRIC_SCOPE = {
    **PERFORMANCE_METRIC_PROVENANCE,
    "comparisonAndGateMetric": "processTotalMsMinMeanMax",
}
PERFORMANCE_PAIRED_GATE_NAMES = {
    "idleRegressionWithinLimit",
    "movingRegressionWithinLimit",
}
PERFORMANCE_PERF_LINE_RE = re.compile(
    r"^perf probe: fps=(?P<fps>[0-9]+(?:\.[0-9]+)?) "
    r"frames=(?P<frames>[0-9]+) (?P<body>.*)$"
)
PERFORMANCE_METRIC_RE = re.compile(
    r"\b([a-z0-9_]+)=([0-9]+(?:\.[0-9]+)?)ms\b"
)
PERFORMANCE_WARMUP_PREFIX = "perf probe warmup complete: "
PERFORMANCE_RUNTIME_PREFIX = "perf probe runtime: "
PERFORMANCE_MEASUREMENT_PREFIX = "perf probe measurement complete: "
PERFORMANCE_CLEAN_EXIT_PREFIX = "perf probe clean exit: "
PERFORMANCE_MOVING_PREFIX = "movement spam click check ready: "
PERFORMANCE_QA_LANE_ATTESTATION = {
    "customUserDirName": "BeastboundOdysseyQA_Automation",
    "feature": "beastbound_qa_automation",
    "lane": "automation",
    "status": "passed",
    "userDataRoot": "<QA_USER_DATA_ROOT>",
}
PERFORMANCE_DECIMAL_TOLERANCE = 0.00049
PERFORMANCE_TOOL_PATHS = {
    "evidenceBuilderSha256": Path(__file__).resolve().parents[4]
    / "tools/map_visual_evidence_builder.py",
    "evidenceRunnerSha256": Path(__file__).resolve().parents[4]
    / "tools/run_map_visual_performance_evidence.py",
}
COMPUTER_USE_ACTION_KINDS = {
    "pointer",
    "movement_path",
    "warp",
    "collision",
    "occlusion",
}
REPOSITORY_ROOT = Path(__file__).resolve().parents[4]
MAP_VISUAL_EVIDENCE_BUILDER_PATH = (
    REPOSITORY_ROOT / "tools/map_visual_evidence_builder.py"
)
BATCH_PREVIEW_SOURCE_PATHS = {
    "orchestrator": "repo://tools/record_map_visual_action_captures.py",
    "evidenceBuilder": "repo://tools/map_visual_evidence_builder.py",
    "ownerReviewRecorder": "repo://tools/record_firebud_v2_owner_review.py",
    "processContainment": "repo://tools/record_pet_management_owner_review.py",
    "qaUserDataLane": "repo://tools/godot_qa_user_data_lane.py",
    "hudGlyphAuditor": "repo://tools/audit_firebud_hud_glyph_stability.py",
    "entrypoint": "res://scripts/qa/map_visual_action_capture_batch.gd",
    "captureController": "res://scripts/qa/map_visual_review_capture.gd",
    "interactionModel": "res://scripts/world/interaction_model.gd",
    "playerProgressModel": "res://scripts/progression/player_progress_model.gd",
    "showcaseProfile": "res://scripts/qa/map_visual_review_showcase_profile.gd",
    "mainScene": "res://scenes/Main.tscn",
    "mainHost": "res://scripts/main.gd",
}
BATCH_PREVIEW_FIELDS = {
    "qaPreviewAuthorization",
    "batchPlanSha256",
    "batchSourceIdentity",
    "batchRuntimeIdentity",
    "batchBuildIdentity",
    "batchBundleManifestIdentity",
    "batchCaptureSurfaceIdentity",
    "batchCaptureSurfaceIdentitySha256",
    "batchWindowIdentity",
    "batchReportSealed",
}
BATCH_MANIFEST_RUNTIME_SUBJECT_KEYS = (
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
CATALOG_CONTRACT_REPORT_TYPE = "beastbound.map_visual_catalog_contract"
RELEASE_ATTESTATION_NAME = "release-attestation.json"
RELEASE_ATTESTATION_TYPE = "beastbound_map_runtime_release_attestation"
RELEASE_ATTESTATION_STATUS = "passed"
CATALOG_CONTRACT_CHECKS = {
    "catalogInitialized",
    "catalogCoverageExact",
    "catalogPathsExact",
    "currentHashesComplete",
    "normalLifecycleAccessValid",
    "qaPreviewEnabled",
    "repeatPrepareIoStable",
    "unknownMapFailedClosed",
    "allIndependentChecksPassed",
    "frozenReportValidationSkippedForGeneration",
}
CATALOG_CONTRACT_KEYS = {
    "schemaVersion",
    "reportType",
    "generatedAtUtc",
    "bundleId",
    "result",
    "testedMapIds",
    "catalogSha256",
    "bindingHashes",
    "mapDataHashes",
    "maps",
    "checks",
    "errors",
}
REQUIRED_COLLISION_CHECKS = {
    "authoritativeBlockedCells",
    "objectCollisionFootprints",
    "pathLinkEndpointsAndExactReachability",
    "spawnProtection",
    "warpSourceAndDestinationProtection",
    "npcSourceAndReachableApproachProtection",
    "encounterCellsAndRectsRespectWalkability",
    "bindingAndMapDataHashes",
}


class PngError(ValueError):
    """Raised for a malformed or unsupported PNG."""


@dataclass(frozen=True)
class PngInfo:
    width: int
    height: int
    alphas: bytes

    @property
    def alpha_mode(self) -> str:
        has_visible = any(alpha > 0 for alpha in self.alphas)
        has_non_opaque = any(alpha < 255 for alpha in self.alphas)
        if has_visible and has_non_opaque:
            return "mixed"
        if has_visible:
            return "opaque"
        return "fully_transparent"


@dataclass
class Audit:
    manifest_path: Path
    root: Path
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    files_checked: set[str] = field(default_factory=set)
    pngs_checked: set[str] = field(default_factory=set)
    jsons_checked: set[str] = field(default_factory=set)
    bundle_id: str | None = None
    release_ready: bool = False
    missing_release_gates: list[str] = field(default_factory=list)
    provenance_release_gates: set[str] = field(default_factory=set)
    report_release_gates: set[str] = field(default_factory=set)
    release_attestation_valid: bool = False

    def error(self, field_name: str, message: str) -> None:
        self.errors.append(f"{field_name}: {message}")

    def warning(self, field_name: str, message: str) -> None:
        self.warnings.append(f"{field_name}: {message}")

    def resolve_file(self, value: Any, field_name: str) -> Path | None:
        if not isinstance(value, str) or not value:
            self.error(field_name, "expected a non-empty relative path")
            return None
        relative = Path(value)
        if relative.is_absolute() or ".." in relative.parts:
            self.error(field_name, "path must be relative and remain inside the bundle")
            return None
        candidate = self.root.joinpath(relative)
        try:
            resolved = candidate.resolve(strict=True)
        except (FileNotFoundError, OSError) as exc:
            self.error(field_name, f"referenced file does not exist ({exc})")
            return None
        try:
            resolved.relative_to(self.root.resolve())
        except ValueError:
            self.error(field_name, "resolved path escapes the bundle root")
            return None
        if not resolved.is_file():
            self.error(field_name, "referenced path is not a regular file")
            return None
        self.files_checked.add(value)
        return resolved

    def validate_file_ref(self, value: Any, field_name: str) -> Path | None:
        if not isinstance(value, dict):
            self.error(field_name, "expected a file-reference object")
            return None
        path = self.resolve_file(value.get("path"), f"{field_name}.path")
        digest = value.get("sha256")
        if not isinstance(digest, str) or not SHA256_RE.fullmatch(digest):
            self.error(f"{field_name}.sha256", "expected 64 lowercase hex characters")
        elif path is not None:
            actual = hashlib.sha256(path.read_bytes()).hexdigest()
            if actual != digest:
                self.error(
                    f"{field_name}.sha256",
                    f"digest mismatch; declared {digest}, actual {actual}",
                )
        return path

    def validate_json_ref(self, value: Any, field_name: str) -> Any | None:
        path = self.validate_file_ref(value, field_name)
        if path is None:
            return None
        if path.suffix.lower() != ".json":
            self.error(f"{field_name}.path", "referenced JSON must use a .json suffix")
        try:
            parsed = json.loads(path.read_text(encoding="utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError, OSError) as exc:
            self.error(field_name, f"referenced JSON cannot be parsed ({exc})")
            return None
        relative = str(path.relative_to(self.root.resolve()))
        self.jsons_checked.add(relative)
        return parsed

    def validate_png_ref(
        self,
        value: Any,
        field_name: str,
        *,
        required_alpha_mode: str | None = None,
    ) -> PngInfo | None:
        path = self.validate_file_ref(value, field_name)
        if not isinstance(value, dict):
            return None
        dimensions = value.get("dimensions")
        if (
            not isinstance(dimensions, list)
            or len(dimensions) != 2
            or not all(isinstance(part, int) and not isinstance(part, bool) and part > 0 for part in dimensions)
        ):
            self.error(f"{field_name}.dimensions", "expected [positive_width, positive_height]")
        alpha_mode = value.get("alphaMode")
        if alpha_mode not in VALID_ALPHA_MODES:
            self.error(f"{field_name}.alphaMode", "expected opaque or mixed")
        if required_alpha_mode is not None and alpha_mode != required_alpha_mode:
            self.error(
                f"{field_name}.alphaMode",
                f"must be {required_alpha_mode} for this asset type",
            )
        if path is None:
            return None
        if path.suffix.lower() != ".png":
            self.error(f"{field_name}.path", "image reference must use a .png suffix")
            return None
        try:
            info = decode_png(path)
        except (OSError, PngError) as exc:
            self.error(field_name, f"PNG cannot be decoded ({exc})")
            return None
        relative = str(path.relative_to(self.root.resolve()))
        self.pngs_checked.add(relative)
        if dimensions != [info.width, info.height]:
            self.error(
                f"{field_name}.dimensions",
                f"declared {dimensions!r}, decoded {[info.width, info.height]!r}",
            )
        if alpha_mode in VALID_ALPHA_MODES and alpha_mode != info.alpha_mode:
            self.error(
                f"{field_name}.alphaMode",
                f"declared {alpha_mode}, decoded {info.alpha_mode}",
            )
        return info


def _paeth(left: int, up: int, upper_left: int) -> int:
    predictor = left + up - upper_left
    left_distance = abs(predictor - left)
    up_distance = abs(predictor - up)
    upper_left_distance = abs(predictor - upper_left)
    if left_distance <= up_distance and left_distance <= upper_left_distance:
        return left
    if up_distance <= upper_left_distance:
        return up
    return upper_left


def _png_chunks(data: bytes) -> Iterable[tuple[bytes, bytes]]:
    offset = len(PNG_SIGNATURE)
    saw_iend = False
    while offset < len(data):
        if offset + 12 > len(data):
            raise PngError("truncated chunk header")
        length = struct.unpack(">I", data[offset : offset + 4])[0]
        chunk_type = data[offset + 4 : offset + 8]
        payload_start = offset + 8
        payload_end = payload_start + length
        crc_end = payload_end + 4
        if crc_end > len(data):
            raise PngError(f"truncated {chunk_type!r} chunk")
        payload = data[payload_start:payload_end]
        expected_crc = struct.unpack(">I", data[payload_end:crc_end])[0]
        actual_crc = binascii.crc32(chunk_type + payload) & 0xFFFFFFFF
        if actual_crc != expected_crc:
            raise PngError(f"CRC mismatch in {chunk_type!r}")
        yield chunk_type, payload
        offset = crc_end
        if chunk_type == b"IEND":
            saw_iend = True
            if offset != len(data):
                raise PngError("trailing bytes after IEND")
            break
    if not saw_iend:
        raise PngError("missing IEND")


def decode_png(path: Path) -> PngInfo:
    data = path.read_bytes()
    if not data.startswith(PNG_SIGNATURE):
        raise PngError("invalid signature")

    width = height = bit_depth = color_type = None
    compression = filter_method = interlace = None
    palette: bytes | None = None
    transparency: bytes | None = None
    compressed = bytearray()
    saw_ihdr = False
    for chunk_type, payload in _png_chunks(data):
        if chunk_type == b"IHDR":
            if saw_ihdr or len(payload) != 13:
                raise PngError("invalid or duplicate IHDR")
            saw_ihdr = True
            (
                width,
                height,
                bit_depth,
                color_type,
                compression,
                filter_method,
                interlace,
            ) = struct.unpack(">IIBBBBB", payload)
        elif chunk_type == b"PLTE":
            palette = payload
        elif chunk_type == b"tRNS":
            transparency = payload
        elif chunk_type == b"IDAT":
            compressed.extend(payload)

    if width is None or height is None:
        raise PngError("missing IHDR")
    if width <= 0 or height <= 0 or width * height > MAX_PNG_PIXELS:
        raise PngError("invalid or excessive dimensions")
    if bit_depth != 8:
        raise PngError(f"unsupported bit depth {bit_depth}; expected 8")
    if compression != 0 or filter_method != 0 or interlace != 0:
        raise PngError("only standard, non-interlaced PNGs are supported")
    channels_by_type = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}
    if color_type not in channels_by_type:
        raise PngError(f"unsupported color type {color_type}")
    channels = channels_by_type[color_type]
    row_length = width * channels
    try:
        inflated = zlib.decompress(bytes(compressed))
    except zlib.error as exc:
        raise PngError(f"invalid IDAT stream ({exc})") from exc
    expected_length = height * (row_length + 1)
    if len(inflated) != expected_length:
        raise PngError(
            f"decompressed length {len(inflated)} does not match {expected_length}"
        )

    rows: list[bytes] = []
    previous = bytes(row_length)
    cursor = 0
    for _ in range(height):
        filter_type = inflated[cursor]
        cursor += 1
        encoded = inflated[cursor : cursor + row_length]
        cursor += row_length
        decoded = bytearray(row_length)
        for index, value in enumerate(encoded):
            left = decoded[index - channels] if index >= channels else 0
            up = previous[index]
            upper_left = previous[index - channels] if index >= channels else 0
            if filter_type == 0:
                result = value
            elif filter_type == 1:
                result = value + left
            elif filter_type == 2:
                result = value + up
            elif filter_type == 3:
                result = value + ((left + up) // 2)
            elif filter_type == 4:
                result = value + _paeth(left, up, upper_left)
            else:
                raise PngError(f"unsupported row filter {filter_type}")
            decoded[index] = result & 0xFF
        rows.append(bytes(decoded))
        previous = bytes(decoded)

    transparent_gray = None
    transparent_rgb = None
    if color_type == 0 and transparency is not None:
        if len(transparency) != 2:
            raise PngError("invalid grayscale tRNS")
        transparent_gray = struct.unpack(">H", transparency)[0]
    if color_type == 2 and transparency is not None:
        if len(transparency) != 6:
            raise PngError("invalid RGB tRNS")
        transparent_rgb = struct.unpack(">HHH", transparency)

    alphas = bytearray(width * height)
    output = 0
    for row in rows:
        for x in range(width):
            source = x * channels
            if color_type == 6:
                alpha = row[source + 3]
            elif color_type == 4:
                alpha = row[source + 1]
            elif color_type == 3:
                if palette is None or len(palette) % 3 != 0:
                    raise PngError("indexed PNG is missing a valid PLTE")
                palette_index = row[source]
                if palette_index * 3 + 3 > len(palette):
                    raise PngError("palette index is out of range")
                alpha = (
                    transparency[palette_index]
                    if transparency is not None and palette_index < len(transparency)
                    else 255
                )
            elif color_type == 2:
                rgb = tuple(row[source : source + 3])
                alpha = 0 if transparent_rgb == rgb else 255
            else:
                gray = row[source]
                alpha = 0 if transparent_gray == gray else 255
            alphas[output] = alpha
            output += 1
    return PngInfo(width=width, height=height, alphas=bytes(alphas))


def is_id(value: Any) -> bool:
    return isinstance(value, str) and ID_RE.fullmatch(value) is not None


def validate_id(audit: Audit, value: Any, field_name: str) -> str | None:
    if not is_id(value):
        audit.error(field_name, "expected a lowercase stable ID")
        return None
    return value


def validate_unique_ids(
    audit: Audit,
    values: Any,
    field_name: str,
    item_key: str | None = None,
) -> list[str]:
    if not isinstance(values, list) or not values:
        audit.error(field_name, "expected a non-empty array")
        return []
    result: list[str] = []
    seen: set[str] = set()
    for index, item in enumerate(values):
        value = item.get(item_key) if item_key is not None and isinstance(item, dict) else item
        checked = validate_id(audit, value, f"{field_name}[{index}]{'.' + item_key if item_key else ''}")
        if checked is None:
            continue
        if checked in seen:
            audit.error(field_name, f"duplicate ID {checked!r}")
        else:
            seen.add(checked)
            result.append(checked)
    return result


def validate_number_pair(
    audit: Audit,
    value: Any,
    field_name: str,
    *,
    positive: bool = False,
    normalized: bool = False,
    integer: bool = False,
) -> list[int | float] | None:
    if not isinstance(value, list) or len(value) != 2:
        audit.error(field_name, "expected a two-value array")
        return None
    for part in value:
        if integer:
            valid_type = isinstance(part, int) and not isinstance(part, bool)
        else:
            valid_type = isinstance(part, (int, float)) and not isinstance(part, bool)
        if not valid_type or not math.isfinite(part):
            audit.error(
                field_name,
                "expected two finite integers" if integer else "expected two finite numbers",
            )
            return None
        if positive and part <= 0:
            audit.error(field_name, "values must be greater than zero")
            return None
        if normalized and not 0.0 <= part <= 1.0:
            audit.error(field_name, "values must be in the inclusive 0..1 range")
            return None
    return value


def validate_color_modulate(
    audit: Audit,
    value: Any,
    field_name: str,
) -> list[int | float] | None:
    if not isinstance(value, list) or len(value) != 4:
        audit.error(field_name, "expected a four-value RGBA array")
        return None
    for part in value:
        if (
            not isinstance(part, (int, float))
            or isinstance(part, bool)
            or not math.isfinite(part)
            or not 0.0 < part <= 1.0
        ):
            audit.error(field_name, "RGBA values must be finite and in (0, 1]")
            return None
    return value


def validate_grid_cell(
    audit: Audit,
    value: Any,
    field_name: str,
    map_grid_size: list[int | float] | None,
) -> tuple[int, int] | None:
    checked = validate_number_pair(audit, value, field_name, integer=True)
    if checked is None:
        return None
    x, y = checked
    if x < 0 or y < 0:
        audit.error(field_name, "grid coordinates must be non-negative")
        return None
    if map_grid_size is not None and (x >= map_grid_size[0] or y >= map_grid_size[1]):
        audit.error(field_name, f"grid coordinate lies outside mapGridSize {map_grid_size!r}")
        return None
    return int(x), int(y)


def validate_object_anchor_cell(
    audit: Audit,
    value: Any,
    field_name: str,
    map_grid_size: list[int | float] | None,
    collision_role: str | None,
    edge_padding_cells: int,
) -> tuple[int, int] | None:
    """Validate a placement anchor without turning scenery into gameplay space.

    Legacy in-grid anchors keep their original contract. Only ``none`` and
    ``decorative`` objects may use a signed grid coordinate outside the
    authoritative map, and then only when ``mapGridSize`` proves that the
    anchor is one of the visual-only cells covered by ``edgePaddingCells``.
    """
    checked = validate_number_pair(audit, value, field_name, integer=True)
    if checked is None:
        return None
    x, y = int(checked[0]), int(checked[1])
    if map_grid_size is None:
        if x < 0 or y < 0:
            audit.error(
                field_name,
                "off-grid scenery anchors require mapGridSize and edgePaddingCells",
            )
            return None
        return x, y

    width, height = int(map_grid_size[0]), int(map_grid_size[1])
    inside_authoritative_grid = 0 <= x < width and 0 <= y < height
    if inside_authoritative_grid:
        return x, y
    if collision_role not in {"none", "decorative"}:
        audit.error(
            field_name,
            "blocking and interaction anchors must stay inside mapGridSize",
        )
        return None
    if edge_padding_cells <= 0:
        audit.error(
            field_name,
            "off-grid scenery anchors require positive ground.edgePaddingCells",
        )
        return None
    if not (
        -edge_padding_cells <= x < width + edge_padding_cells
        and -edge_padding_cells <= y < height + edge_padding_cells
    ):
        audit.error(
            field_name,
            "off-grid scenery anchor lies outside the edgePaddingCells skirt",
        )
        return None
    return x, y


def file_ref_key(value: Any) -> tuple[str, str] | None:
    if not isinstance(value, dict):
        return None
    path = value.get("path")
    digest = value.get("sha256")
    if isinstance(path, str) and isinstance(digest, str):
        return path, digest
    return None


def validate_raw_file_ref(audit: Audit, value: Any, field_name: str) -> Path | None:
    path = audit.validate_file_ref(value, field_name)
    if not isinstance(value, dict) or path is None:
        return path
    dimensions = value.get("dimensions")
    checked_dimensions: list[int | float] | None = None
    if dimensions is not None:
        checked_dimensions = validate_number_pair(
            audit,
            dimensions,
            f"{field_name}.dimensions",
            positive=True,
            integer=True,
        )
    if path.suffix.lower() == ".png":
        try:
            info = decode_png(path)
        except (OSError, PngError) as exc:
            audit.error(field_name, f"raw PNG cannot be decoded ({exc})")
            return path
        audit.pngs_checked.add(str(path.relative_to(audit.root.resolve())))
        if checked_dimensions is not None and checked_dimensions != [info.width, info.height]:
            audit.error(
                f"{field_name}.dimensions",
                f"declared {dimensions!r}, decoded {[info.width, info.height]!r}",
            )
    elif dimensions is not None:
        audit.error(f"{field_name}.dimensions", "is supported only for PNG raw files")
    return path


def scan_forbidden_flags(audit: Audit, value: Any, field_name: str) -> None:
    if isinstance(value, dict):
        for key, nested in value.items():
            nested_field = f"{field_name}.{key}" if field_name else key
            if key in {"mirrored", "bakedActors"} and nested is not False:
                audit.error(nested_field, "must be explicitly false")
            scan_forbidden_flags(audit, nested, nested_field)
    elif isinstance(value, list):
        for index, nested in enumerate(value):
            scan_forbidden_flags(audit, nested, f"{field_name}[{index}]")


def manifest_review_subject_sha256(manifest: dict[str, Any]) -> str:
    """Hash the owner-reviewed manifest contract without self/lifecycle fields."""
    subject = {
        key: value
        for key, value in manifest.items()
        if key
        not in {
            "status",
            "ownerReviewStatus",
            "releaseApproved",
            "runtimeEnabled",
        }
    }
    evidence = subject.get("evidence")
    if isinstance(evidence, dict):
        frozen_evidence = dict(evidence)
        frozen_evidence.pop("ownerAcceptance", None)
        subject["evidence"] = frozen_evidence
    canonical = json.dumps(
        subject,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(canonical).hexdigest()


def _normalized_summary_value(value: Any) -> Any:
    """Normalize JSON numbers so Godot and Python hash parsed JSON identically."""
    if isinstance(value, dict):
        return {
            str(key): _normalized_summary_value(nested)
            for key, nested in value.items()
        }
    if isinstance(value, list):
        return [_normalized_summary_value(nested) for nested in value]
    if isinstance(value, float) and math.isfinite(value) and value.is_integer():
        return int(value)
    return value


def _canonical_summary_sha256(value: Any) -> str:
    canonical = json.dumps(
        _normalized_summary_value(value),
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(canonical).hexdigest()


def release_summary_hashes(manifest: dict[str, Any]) -> dict[str, str]:
    """Compute the non-circular summaries frozen by runtime release attestation."""
    evidence_value = manifest.get("evidence")
    evidence_subject = dict(evidence_value) if isinstance(evidence_value, dict) else {}
    evidence_subject.pop("ownerAcceptance", None)

    manifest_subject = {
        key: value
        for key, value in manifest.items()
        if key
        not in {
            "status",
            "ownerReviewStatus",
            "releaseApproved",
            "runtimeEnabled",
            "releaseAttestation",
        }
    }
    manifest_subject["evidence"] = evidence_subject
    asset_subject = {
        "groundAtlas": manifest.get("groundAtlas"),
        "tiles": manifest.get("tiles"),
        "objects": manifest.get("objects"),
        "mapBindings": manifest.get("mapBindings"),
    }
    frozen_evidence_subject = {
        "catalogContractCheck": manifest.get("catalogContractCheck"),
        "evidence": evidence_subject,
    }
    manifest_sha = _canonical_summary_sha256(manifest_subject)
    evidence_sha = _canonical_summary_sha256(frozen_evidence_subject)
    asset_sha = _canonical_summary_sha256(asset_subject)
    bundle_subject = {
        "schemaVersion": manifest.get("schemaVersion"),
        "bundleId": manifest.get("bundleId"),
        "mapStyleId": manifest.get("mapStyleId"),
        "mapIds": manifest.get("mapIds"),
        "tileSize": manifest.get("tileSize"),
        "manifestSha256": manifest_sha,
        "evidenceSha256": evidence_sha,
        "assetSha256": asset_sha,
    }
    return {
        "manifestSha256": manifest_sha,
        "evidenceSha256": evidence_sha,
        "assetSha256": asset_sha,
        "bundleSha256": _canonical_summary_sha256(bundle_subject),
    }


def validate_release_attestation(
    audit: Audit,
    manifest: dict[str, Any],
    *,
    required: bool,
) -> tuple[str, str] | None:
    value = manifest.get("releaseAttestation")
    if value is None:
        if required:
            audit.error(
                "releaseAttestation",
                "is required for owner-approved or released map art",
            )
        return None

    error_count_before = len(audit.errors)
    if not isinstance(value, dict) or set(value) != {"path", "sha256"}:
        audit.error(
            "releaseAttestation",
            "must contain exactly path and sha256",
        )
    if isinstance(value, dict) and value.get("path") != RELEASE_ATTESTATION_NAME:
        audit.error(
            "releaseAttestation.path",
            f"must be the bundle-root file {RELEASE_ATTESTATION_NAME!r}",
        )
    attestation = audit.validate_json_ref(value, "releaseAttestation")
    attestation_key = file_ref_key(value)
    if not isinstance(attestation, dict):
        if attestation is not None:
            audit.error("releaseAttestation", "expected a JSON object")
        return attestation_key

    expected_top_level_keys = {
        "schemaVersion",
        "attestationType",
        "status",
        "bundleId",
        "mapStyleId",
        "mapIds",
        "manifest",
        "lifecycle",
        "offlineAudit",
        "summaries",
    }
    if set(attestation) != expected_top_level_keys:
        audit.error(
            "releaseAttestation",
            "top-level fields must exactly match the runtime attestation v1 contract",
        )
    attestation_schema_version = attestation.get("schemaVersion")
    if (
        not isinstance(attestation_schema_version, int)
        or isinstance(attestation_schema_version, bool)
        or attestation_schema_version != SCHEMA_VERSION
    ):
        audit.error(
            "releaseAttestation.schemaVersion",
            f"must be the integer {SCHEMA_VERSION}",
        )
    if attestation.get("attestationType") != RELEASE_ATTESTATION_TYPE:
        audit.error(
            "releaseAttestation.attestationType",
            f"must equal {RELEASE_ATTESTATION_TYPE!r}",
        )
    if attestation.get("status") != RELEASE_ATTESTATION_STATUS:
        audit.error(
            "releaseAttestation.status",
            f"must equal {RELEASE_ATTESTATION_STATUS!r}",
        )
    if attestation.get("bundleId") != manifest.get("bundleId"):
        audit.error(
            "releaseAttestation.bundleId",
            "must match manifest bundleId",
        )
    if attestation.get("mapStyleId") != manifest.get("mapStyleId"):
        audit.error(
            "releaseAttestation.mapStyleId",
            "must match manifest mapStyleId",
        )
    if attestation.get("mapIds") != manifest.get("mapIds"):
        audit.error(
            "releaseAttestation.mapIds",
            "must exactly match manifest mapIds and order",
        )

    manifest_binding = attestation.get("manifest")
    if not isinstance(manifest_binding, dict) or set(manifest_binding) != {
        "path",
        "summarySha256",
    }:
        audit.error(
            "releaseAttestation.manifest",
            "must contain exactly path and summarySha256",
        )
        manifest_binding = {}
    if manifest_binding.get("path") != MANIFEST_NAME:
        audit.error(
            "releaseAttestation.manifest.path",
            f"must equal {MANIFEST_NAME!r}",
        )

    lifecycle = attestation.get("lifecycle")
    if (
        not isinstance(lifecycle, dict)
        or set(lifecycle)
        != {
            "status",
            "ownerReviewStatus",
            "releaseApproved",
            "runtimeEnabled",
        }
        or lifecycle.get("status") != "released"
        or lifecycle.get("ownerReviewStatus") != "approved"
        or lifecycle.get("releaseApproved") is not True
        or lifecycle.get("runtimeEnabled") is not True
    ):
        audit.error(
            "releaseAttestation.lifecycle",
            "must exactly freeze the released/approved/true/true lifecycle",
        )

    offline_audit = attestation.get("offlineAudit")
    if (
        not isinstance(offline_audit, dict)
        or set(offline_audit)
        != {"status", "releaseReady", "missingReleaseGates"}
        or offline_audit.get("status") != "PASS"
        or offline_audit.get("releaseReady") is not True
        or not isinstance(offline_audit.get("missingReleaseGates"), list)
        or offline_audit.get("missingReleaseGates") != []
    ):
        audit.error(
            "releaseAttestation.offlineAudit",
            "must exactly freeze PASS, releaseReady=true and no missing gates",
        )

    summaries = attestation.get("summaries")
    if not isinstance(summaries, dict) or set(summaries) != {
        "evidenceSha256",
        "assetSha256",
        "bundleSha256",
    }:
        audit.error(
            "releaseAttestation.summaries",
            "must contain exactly evidenceSha256, assetSha256 and bundleSha256",
        )
        summaries = {}
    expected_summaries = release_summary_hashes(manifest)
    manifest_summary = manifest_binding.get("summarySha256")
    if (
        not isinstance(manifest_summary, str)
        or not SHA256_RE.fullmatch(manifest_summary)
        or manifest_summary != expected_summaries["manifestSha256"]
    ):
        audit.error(
            "releaseAttestation.manifest.summarySha256",
            "must match the canonical non-circular manifest summary",
        )
    for key in ("evidenceSha256", "assetSha256", "bundleSha256"):
        digest = summaries.get(key)
        if (
            not isinstance(digest, str)
            or not SHA256_RE.fullmatch(digest)
            or digest != expected_summaries[key]
        ):
            audit.error(
                f"releaseAttestation.summaries.{key}",
                "must match the canonical runtime release summary",
            )

    audit.release_attestation_valid = len(audit.errors) == error_count_before
    return attestation_key


def validate_source(
    audit: Audit,
    source: Any,
    bundle_id: str | None,
    runtime_assets: dict[str, str],
) -> set[tuple[str, str]]:
    review_files: set[tuple[str, str]] = set()
    if not isinstance(source, dict):
        audit.error("source", "expected an object")
        return review_files
    for key in ("origin", "owner", "licenseBasis"):
        if not isinstance(source.get(key), str) or not source[key].strip():
            audit.error(f"source.{key}", "expected a non-empty string")
    for key in ("mirrored", "bakedActors"):
        if source.get(key) is not False:
            audit.error(f"source.{key}", "must be explicitly false")

    manifest_raw_files = source.get("rawFiles")
    manifest_raw_refs: set[tuple[str, str]] = set()
    if not isinstance(manifest_raw_files, list) or not manifest_raw_files:
        audit.error("source.rawFiles", "expected a non-empty array")
    else:
        for index, raw_ref in enumerate(manifest_raw_files):
            field_name = f"source.rawFiles[{index}]"
            validate_raw_file_ref(audit, raw_ref, field_name)
            ref_key = file_ref_key(raw_ref)
            if ref_key is not None:
                if ref_key in manifest_raw_refs:
                    audit.error(field_name, f"duplicate raw file reference {ref_key[0]!r}")
                manifest_raw_refs.add(ref_key)
                review_files.add(ref_key)
            if isinstance(raw_ref, dict) and "/history/" in str(raw_ref.get("path", "")):
                if raw_ref.get("acceptedForRuntime") is not False:
                    audit.error(
                        f"{field_name}.acceptedForRuntime",
                        "history lineage must be explicitly excluded from runtime acceptance",
                    )
                if raw_ref.get("lineageOnly") is not True:
                    audit.error(
                        f"{field_name}.lineageOnly",
                        "history lineage must be explicitly marked lineageOnly",
                    )

    manifest_build_artifacts = source.get("buildArtifacts")
    manifest_build_refs: set[tuple[str, str]] = set()
    manifest_build_paths: set[str] = set()
    if not isinstance(manifest_build_artifacts, list) or not manifest_build_artifacts:
        audit.error("source.buildArtifacts", "expected a non-empty array")
    else:
        for index, artifact_ref in enumerate(manifest_build_artifacts):
            field_name = f"source.buildArtifacts[{index}]"
            validate_raw_file_ref(audit, artifact_ref, field_name)
            ref_key = file_ref_key(artifact_ref)
            if ref_key is None:
                continue
            path, _digest = ref_key
            if path in manifest_build_paths:
                audit.error(field_name, f"duplicate build artifact path {path!r}")
            if any(raw_path == path for raw_path, _raw_digest in manifest_raw_refs):
                audit.error(field_name, "must not duplicate a source.rawFiles path")
            manifest_build_paths.add(path)
            manifest_build_refs.add(ref_key)
            review_files.add(ref_key)

    prompts = source.get("promptFiles")
    prompt_paths: set[str] = set()
    if not isinstance(prompts, list) or not prompts:
        audit.error("source.promptFiles", "expected at least one prompt file")
    else:
        for index, prompt_ref in enumerate(prompts):
            field_name = f"source.promptFiles[{index}]"
            path = audit.validate_file_ref(prompt_ref, field_name)
            ref_key = file_ref_key(prompt_ref)
            if ref_key is not None:
                review_files.add(ref_key)
            if isinstance(prompt_ref, dict) and isinstance(prompt_ref.get("path"), str):
                declared = prompt_ref["path"]
                if declared in prompt_paths:
                    audit.error("source.promptFiles", f"duplicate prompt path {declared!r}")
                prompt_paths.add(declared)
            if path is not None:
                try:
                    if not path.read_text(encoding="utf-8").strip():
                        audit.error(field_name, "prompt file is empty")
                except (UnicodeDecodeError, OSError) as exc:
                    audit.error(field_name, f"prompt file is not readable UTF-8 ({exc})")

    provenance_ref = source.get("provenance")
    provenance_ref_key = file_ref_key(provenance_ref)
    if provenance_ref_key is not None:
        review_files.add(provenance_ref_key)
    provenance = audit.validate_json_ref(provenance_ref, "source.provenance")
    if not isinstance(provenance, dict):
        if provenance is not None:
            audit.error("source.provenance", "expected a JSON object")
        return review_files
    scan_forbidden_flags(audit, provenance, "source.provenance.json")
    if provenance.get("schemaVersion") != SCHEMA_VERSION:
        audit.error("source.provenance.schemaVersion", f"must equal {SCHEMA_VERSION}")
    if bundle_id is not None and provenance.get("bundleId") != bundle_id:
        audit.error("source.provenance.bundleId", "must match manifest bundleId")
    if provenance.get("mirrored") is not False:
        audit.error("source.provenance.mirrored", "must be explicitly false")
    if provenance.get("bakedActors") is not False:
        audit.error("source.provenance.bakedActors", "must be explicitly false")
    for key in ("origin", "owner", "licenseBasis"):
        if provenance.get(key) != source.get(key):
            audit.error(
                f"source.provenance.{key}",
                f"must exactly match manifest source.{key}",
            )

    toolchain = provenance.get("toolchain")
    if not isinstance(toolchain, dict) or not toolchain:
        audit.error("source.provenance.toolchain", "expected a non-empty object")
        toolchain = {}
    external_tool = toolchain.get("externalChromaKeyTool")
    external_tool_repository_owned: bool | None = None
    if external_tool is not None:
        external_field = "source.provenance.toolchain.externalChromaKeyTool"
        if not isinstance(external_tool, dict):
            audit.error(external_field, "expected an object")
        else:
            external_path = external_tool.get("path")
            external_digest = external_tool.get("sha256")
            external_tool_repository_owned = external_tool.get("repositoryOwned")
            if not isinstance(external_path, str) or not external_path.strip():
                audit.error(f"{external_field}.path", "expected a non-empty string")
            if not isinstance(external_digest, str) or not SHA256_RE.fullmatch(external_digest):
                audit.error(
                    f"{external_field}.sha256",
                    "expected 64 lowercase hex characters",
                )
            if not isinstance(external_tool_repository_owned, bool):
                audit.error(f"{external_field}.repositoryOwned", "expected a boolean")
            elif external_tool_repository_owned is False:
                audit.provenance_release_gates.add(
                    "provenance.external_tool_repository_owned"
                )
            else:
                vendored_path = audit.validate_file_ref(external_tool, external_field)
                vendored_key = file_ref_key(external_tool)
                if vendored_key is not None:
                    review_files.add(vendored_key)
                if vendored_path is None:
                    audit.provenance_release_gates.add(
                        "provenance.external_tool_repository_owned"
                    )
    processing = provenance.get("processing")
    if not isinstance(processing, list) or not processing or not all(
        isinstance(command, str) and command.strip() for command in processing
    ):
        audit.error(
            "source.provenance.processing",
            "expected a non-empty array of complete command strings",
        )
    else:
        external_home_path = re.compile(
            r"(?:^|\s)[\"']?(?:/Users/|/home/|[A-Za-z]:[\\/])"
        )
        if any(external_home_path.search(command) for command in processing):
            audit.provenance_release_gates.add("provenance.processing_external_path")
    reproducibility = provenance.get("reproducibility")
    external_tool_vendored: bool | None = None
    if not isinstance(reproducibility, dict):
        audit.error("source.provenance.reproducibility", "expected an object")
    else:
        for key in ("rawToProcessedByteExact", "processedToRuntimeByteExact"):
            if reproducibility.get(key) is not True:
                audit.error(
                    f"source.provenance.reproducibility.{key}",
                    "must be explicitly true",
                )
        if not isinstance(reproducibility.get("outputPrecondition"), str) or not reproducibility[
            "outputPrecondition"
        ].strip():
            audit.error(
                "source.provenance.reproducibility.outputPrecondition",
                "expected a non-empty string",
            )
        external_tool_vendored = reproducibility.get("externalToolVendored")
        if not isinstance(external_tool_vendored, bool):
            audit.error(
                "source.provenance.reproducibility.externalToolVendored",
                "expected a boolean",
            )
        elif external_tool_vendored is False:
            audit.provenance_release_gates.add("provenance.external_tool_vendored")
        elif external_tool is not None and external_tool_repository_owned is not True:
            audit.error(
                "source.provenance.reproducibility.externalToolVendored",
                "cannot be true while externalChromaKeyTool is not repository-owned",
            )
            audit.provenance_release_gates.add("provenance.external_tool_repository_owned")
        release_blocker = reproducibility.get("releaseBlocker")
        if release_blocker is not None and (
            not isinstance(release_blocker, str) or not release_blocker.strip()
        ):
            audit.error(
                "source.provenance.reproducibility.releaseBlocker",
                "expected null or a non-empty string",
            )
        elif isinstance(release_blocker, str) and release_blocker.strip():
            audit.provenance_release_gates.add("provenance.release_blocker")

    raw_files = provenance.get("rawFiles")
    raw_paths: set[str] = set()
    provenance_raw_refs: set[tuple[str, str]] = set()
    if not isinstance(raw_files, list) or not raw_files:
        audit.error("source.provenance.rawFiles", "expected a non-empty array")
    else:
        for index, raw_ref in enumerate(raw_files):
            field_name = f"source.provenance.rawFiles[{index}]"
            validate_raw_file_ref(audit, raw_ref, field_name)
            ref_key = file_ref_key(raw_ref)
            if ref_key is None:
                continue
            path, _digest = ref_key
            if path in raw_paths:
                audit.error(field_name, f"duplicate raw file path {path!r}")
            raw_paths.add(path)
            provenance_raw_refs.add(ref_key)
            review_files.add(ref_key)
            if "/history/" in path:
                if raw_ref.get("acceptedForRuntime") is not False:
                    audit.error(
                        f"{field_name}.acceptedForRuntime",
                        "history lineage must be explicitly excluded from runtime acceptance",
                    )
                if raw_ref.get("lineageOnly") is not True:
                    audit.error(
                        f"{field_name}.lineageOnly",
                        "history lineage must be explicitly marked lineageOnly",
                    )

    build_artifacts = provenance.get("buildArtifacts")
    provenance_build_refs: set[tuple[str, str]] = set()
    provenance_build_paths: set[str] = set()
    if not isinstance(build_artifacts, list) or not build_artifacts:
        audit.error("source.provenance.buildArtifacts", "expected a non-empty array")
    else:
        for index, artifact_ref in enumerate(build_artifacts):
            field_name = f"source.provenance.buildArtifacts[{index}]"
            validate_raw_file_ref(audit, artifact_ref, field_name)
            ref_key = file_ref_key(artifact_ref)
            if ref_key is None:
                continue
            path, _digest = ref_key
            if path in provenance_build_paths:
                audit.error(field_name, f"duplicate build artifact path {path!r}")
            if path in raw_paths:
                audit.error(field_name, "must not duplicate a source.provenance.rawFiles path")
            provenance_build_paths.add(path)
            provenance_build_refs.add(ref_key)
            review_files.add(ref_key)

    if manifest_raw_refs != provenance_raw_refs:
        audit.error(
            "source.rawFiles",
            "must exactly match source.provenance.rawFiles paths and SHA-256 values",
        )
    if manifest_build_refs != provenance_build_refs:
        audit.error(
            "source.buildArtifacts",
            "must exactly match source.provenance.buildArtifacts paths and SHA-256 values",
        )

    assets = provenance.get("assets")
    if not isinstance(assets, list) or not assets:
        audit.error("source.provenance.assets", "expected a non-empty array")
        return review_files
    by_path: dict[str, dict[str, Any]] = {}
    for index, entry in enumerate(assets):
        field_name = f"source.provenance.assets[{index}]"
        if not isinstance(entry, dict):
            audit.error(field_name, "expected an object")
            continue
        validate_id(audit, entry.get("assetId"), f"{field_name}.assetId")
        path = entry.get("path")
        if not isinstance(path, str) or not path:
            audit.error(f"{field_name}.path", "expected a non-empty path")
        elif path in by_path:
            audit.error("source.provenance.assets", f"duplicate asset path {path!r}")
        else:
            by_path[path] = entry
        digest = entry.get("sha256")
        if not isinstance(digest, str) or not SHA256_RE.fullmatch(digest):
            audit.error(f"{field_name}.sha256", "expected 64 lowercase hex characters")
        if not isinstance(entry.get("tool"), str) or not entry["tool"].strip():
            audit.error(f"{field_name}.tool", "expected a non-empty string")
        if entry.get("promptPath") not in prompt_paths:
            audit.error(f"{field_name}.promptPath", "must reference source.promptFiles")
        if entry.get("rawPath") not in raw_paths:
            audit.error(f"{field_name}.rawPath", "must reference source.provenance.rawFiles")
        _validate_timezone_aware_timestamp(
            audit,
            entry.get("generatedAt"),
            f"{field_name}.generatedAt",
            require_utc=False,
        )
        operations = entry.get("operations")
        if not isinstance(operations, list) or not all(isinstance(item, str) for item in operations):
            audit.error(f"{field_name}.operations", "expected an array of strings")
        elif any("mirror" in item.lower() for item in operations):
            audit.error(f"{field_name}.operations", "mirroring is forbidden")

    for path, digest in runtime_assets.items():
        entry = by_path.get(path)
        if entry is None:
            audit.error("source.provenance.assets", f"missing runtime asset {path!r}")
        elif entry.get("sha256") != digest:
            audit.error(
                "source.provenance.assets",
                f"digest for {path!r} does not match the manifest",
            )
    extra_paths = sorted(set(by_path) - set(runtime_assets))
    if extra_paths:
        audit.warning(
            "source.provenance.assets",
            f"contains non-runtime asset entries: {extra_paths!r}",
        )
    return review_files


def validate_tiles(
    audit: Audit,
    tiles: Any,
    atlas_info: PngInfo | None,
) -> set[str]:
    tile_ids = set(validate_unique_ids(audit, tiles, "tiles", "tileId"))
    if not isinstance(tiles, list):
        return tile_ids
    used_rects: set[tuple[int, int, int, int]] = set()
    for index, tile in enumerate(tiles):
        field_name = f"tiles[{index}]"
        if not isinstance(tile, dict):
            audit.error(field_name, "expected an object")
            continue
        rect = tile.get("rect")
        if (
            not isinstance(rect, list)
            or len(rect) != 4
            or not all(isinstance(part, int) and not isinstance(part, bool) for part in rect)
        ):
            audit.error(f"{field_name}.rect", "expected [x, y, 80, 40] integers")
            continue
        x, y, width, height = rect
        if x < 0 or y < 0 or [width, height] != TILE_SIZE:
            audit.error(f"{field_name}.rect", "must be non-negative and exactly 80x40")
        if atlas_info is not None and (x + width > atlas_info.width or y + height > atlas_info.height):
            audit.error(f"{field_name}.rect", "extends outside the ground atlas")
        rect_tuple = (x, y, width, height)
        if rect_tuple in used_rects:
            audit.error(f"{field_name}.rect", "duplicates another tile rectangle")
        used_rects.add(rect_tuple)
        if not isinstance(tile.get("role"), str) or not tile["role"].strip():
            audit.error(f"{field_name}.role", "expected a non-empty role")
    return tile_ids


def validate_objects(
    audit: Audit,
    objects: Any,
) -> tuple[set[str], dict[str, str], dict[str, str]]:
    object_ids = set(validate_unique_ids(audit, objects, "objects", "objectId"))
    runtime_assets: dict[str, str] = {}
    collision_roles: dict[str, str] = {}
    if not isinstance(objects, list):
        return object_ids, runtime_assets, collision_roles
    used_paths: set[str] = set()
    for index, obj in enumerate(objects):
        field_name = f"objects[{index}]"
        if not isinstance(obj, dict):
            audit.error(field_name, "expected an object")
            continue
        asset_ref = obj.get("asset")
        info = audit.validate_png_ref(
            asset_ref,
            f"{field_name}.asset",
            required_alpha_mode="mixed",
        )
        path = asset_ref.get("path") if isinstance(asset_ref, dict) else None
        digest = asset_ref.get("sha256") if isinstance(asset_ref, dict) else None
        if isinstance(path, str):
            if path in used_paths:
                audit.error("objects", f"object asset path {path!r} is reused")
            used_paths.add(path)
            if isinstance(digest, str):
                runtime_assets[path] = digest

        validate_number_pair(
            audit,
            obj.get("displaySize"),
            f"{field_name}.displaySize",
            positive=True,
        )
        if "colorModulate" in obj:
            validate_color_modulate(
                audit,
                obj.get("colorModulate"),
                f"{field_name}.colorModulate",
            )
        render_layer = obj.get("renderLayer")
        if render_layer not in VALID_RENDER_LAYERS:
            audit.error(
                f"{field_name}.renderLayer",
                f"expected one of {sorted(VALID_RENDER_LAYERS)!r}",
            )
        collision_role = obj.get("collisionRole")
        if collision_role not in VALID_COLLISION_ROLES:
            audit.error(
                f"{field_name}.collisionRole",
                f"expected one of {sorted(VALID_COLLISION_ROLES)!r}",
            )
        else:
            object_id = obj.get("objectId")
            if object_id in object_ids:
                collision_roles[object_id] = collision_role
        validate_number_pair(
            audit,
            obj.get("scale"),
            f"{field_name}.scale",
            positive=True,
        )
        validate_number_pair(
            audit,
            obj.get("anchor"),
            f"{field_name}.anchor",
            normalized=True,
        )
        validate_number_pair(
            audit,
            obj.get("sortPoint"),
            f"{field_name}.sortPoint",
            normalized=True,
        )
        sort = obj.get("sort")
        if not isinstance(sort, dict):
            audit.error(f"{field_name}.sort", "expected an object")
        else:
            if sort.get("mode") != "y":
                audit.error(f"{field_name}.sort.mode", "must be y")
            if not isinstance(sort.get("offset"), int) or isinstance(sort.get("offset"), bool):
                audit.error(f"{field_name}.sort.offset", "expected an integer")

        collision = obj.get("collision")
        if not isinstance(collision, dict):
            audit.error(f"{field_name}.collision", "expected an object")
            continue
        mode = collision.get("mode")
        points = collision.get("points")
        if mode not in {"none", "polygon"}:
            audit.error(f"{field_name}.collision.mode", "expected none or polygon")
            continue
        if not isinstance(points, list):
            audit.error(f"{field_name}.collision.points", "expected an array")
            continue
        if mode == "none" and points:
            audit.error(f"{field_name}.collision.points", "must be empty for mode none")
        if mode == "polygon" and len(points) < 3:
            audit.error(f"{field_name}.collision.points", "polygon needs at least three points")
        if collision_role == "blocking" and mode != "polygon":
            audit.error(
                f"{field_name}.collision",
                "collisionRole=blocking requires polygon collision",
            )
        if collision_role in {"none", "decorative"} and mode != "none":
            audit.error(
                f"{field_name}.collision",
                f"collisionRole={collision_role} requires collision.mode=none",
            )
        for point_index, point in enumerate(points):
            point_field = f"{field_name}.collision.points[{point_index}]"
            if (
                not isinstance(point, list)
                or len(point) != 2
                or not all(
                    isinstance(value, (int, float))
                    and not isinstance(value, bool)
                    and math.isfinite(value)
                    for value in point
                )
            ):
                audit.error(point_field, "expected two finite numbers")
                continue
            if info is not None and not (0 <= point[0] < info.width and 0 <= point[1] < info.height):
                audit.error(point_field, "must remain inside local image dimensions")
    return object_ids, runtime_assets, collision_roles


def walk_references(
    audit: Audit,
    value: Any,
    field_name: str,
    tile_ids: set[str],
    object_ids: set[str],
) -> None:
    if isinstance(value, dict):
        for key, nested in value.items():
            nested_field = f"{field_name}.{key}"
            if key == "tileId" and nested not in tile_ids:
                audit.error(nested_field, f"unknown tileId {nested!r}")
            elif key == "objectId" and nested not in object_ids:
                audit.error(nested_field, f"unknown objectId {nested!r}")
            walk_references(audit, nested, nested_field, tile_ids, object_ids)
    elif isinstance(value, list):
        for index, nested in enumerate(value):
            walk_references(audit, nested, f"{field_name}[{index}]", tile_ids, object_ids)


def validate_ground_visual_contract(
    audit: Audit,
    ground: Any,
    tile_ids: set[str],
    field_name: str,
) -> None:
    """Validate optional visual-only ground selection without changing semantics.

    Older bindings remain valid: ``edgeTileId`` falls back to
    ``defaultTileId`` and both deterministic-variant fields may be absent.
    """
    if not isinstance(ground, dict):
        audit.error(field_name, "expected an object")
        return

    default_tile_id = ground.get("defaultTileId")
    if default_tile_id not in tile_ids:
        audit.error(
            f"{field_name}.defaultTileId",
            f"unknown tileId {default_tile_id!r}",
        )

    edge_tile_id = ground.get("edgeTileId", default_tile_id)
    if edge_tile_id not in tile_ids:
        audit.error(
            f"{field_name}.edgeTileId",
            f"unknown tileId {edge_tile_id!r}",
        )

    if "edgePaddingCells" in ground:
        edge_padding = ground.get("edgePaddingCells")
        if (
            not isinstance(edge_padding, int)
            or isinstance(edge_padding, bool)
            or not 0 <= edge_padding <= 32
        ):
            audit.error(
                f"{field_name}.edgePaddingCells",
                "must be an integer in the inclusive range 0..32",
            )

    if "variantSeed" in ground:
        variant_seed = ground.get("variantSeed")
        if (
            not isinstance(variant_seed, int)
            or isinstance(variant_seed, bool)
            or not MIN_VARIANT_SEED <= variant_seed <= MAX_VARIANT_SEED
        ):
            audit.error(
                f"{field_name}.variantSeed",
                "must be a signed 32-bit integer",
            )

    if "variantClusterSize" in ground:
        cluster_size = ground.get("variantClusterSize")
        if (
            not isinstance(cluster_size, int)
            or isinstance(cluster_size, bool)
            or not 1 <= cluster_size <= 8
        ):
            audit.error(
                f"{field_name}.variantClusterSize",
                "must be an integer in the inclusive range 1..8",
            )

    reserved_transition_tiles: set[str] = set()
    for tile_field in (
        "defaultTileId",
        "blockedTileId",
        "encounterTileId",
        "warpTileId",
        "pathTileId",
        "plazaTileId",
        "edgeTileId",
        "layeredBaseTileId",
    ):
        tile_id = ground.get(tile_field)
        if isinstance(tile_id, str) and tile_id:
            reserved_transition_tiles.add(tile_id)
    variants_for_transition = ground.get("tileVariants")
    if isinstance(variants_for_transition, dict):
        for base_tile_id, candidates in variants_for_transition.items():
            if isinstance(base_tile_id, str) and base_tile_id:
                reserved_transition_tiles.add(base_tile_id)
            if isinstance(candidates, list):
                reserved_transition_tiles.update(
                    candidate for candidate in candidates if isinstance(candidate, str) and candidate
                )

    all_transition_tiles: dict[str, str] = {}
    for transition_name, semantic_name in (
        ("pathTransitionTileIds", "pathTileId"),
        ("plazaTransitionTileIds", "plazaTileId"),
    ):
        transitions = ground.get(transition_name)
        if transitions is None:
            continue
        transition_field = f"{field_name}.{transition_name}"
        semantic_tile_id = ground.get(semantic_name)
        if not is_id(semantic_tile_id) or semantic_tile_id not in tile_ids:
            audit.error(
                f"{field_name}.{semantic_name}",
                f"{transition_name} requires a registered semantic tile ID",
            )
        if not isinstance(transitions, dict):
            audit.error(transition_field, "expected an object")
            continue
        actual_keys = set(transitions)
        if actual_keys != SURFACE_TRANSITION_KEYS:
            audit.error(
                transition_field,
                "must declare all 15 canonical exposed-edge signatures",
            )
        seen_transition_tiles: set[str] = set()
        for direction in sorted(SURFACE_TRANSITION_KEYS):
            tile_id = transitions.get(direction)
            direction_field = f"{transition_field}.{direction}"
            if not is_id(tile_id):
                audit.error(direction_field, "expected a lowercase stable tile ID")
                continue
            if tile_id not in tile_ids:
                audit.error(direction_field, f"unknown tileId {tile_id!r}")
            if tile_id in reserved_transition_tiles:
                audit.error(
                    direction_field,
                    "must not reuse a semantic or visual-variant tile",
                )
            if tile_id in seen_transition_tiles:
                audit.error(direction_field, "duplicates another surface transition tile")
            seen_transition_tiles.add(tile_id)
            previous_owner = all_transition_tiles.get(tile_id)
            if previous_owner is not None and previous_owner != transition_name:
                audit.error(
                    direction_field,
                    f"reuses transition tile from {previous_owner}",
                )
            all_transition_tiles[tile_id] = transition_name

    variants = ground.get("tileVariants")
    if variants is None:
        return
    if not isinstance(variants, dict):
        audit.error(f"{field_name}.tileVariants", "expected an object")
        return

    semantic_bases = set(variants)
    candidate_owner: dict[str, str] = {}
    for base_tile_id, candidates in variants.items():
        base_field = f"{field_name}.tileVariants.{base_tile_id}"
        if not is_id(base_tile_id):
            audit.error(base_field, "base key must be a lowercase stable tile ID")
        elif base_tile_id not in tile_ids:
            audit.error(base_field, f"unknown base tileId {base_tile_id!r}")
        if not isinstance(candidates, list) or not candidates:
            audit.error(base_field, "expected a non-empty array of tile IDs")
            continue

        seen_in_pool: set[str] = set()
        for index, candidate in enumerate(candidates):
            candidate_field = f"{base_field}[{index}]"
            if not is_id(candidate):
                audit.error(candidate_field, "expected a lowercase stable tile ID")
                continue
            if candidate not in tile_ids:
                audit.error(candidate_field, f"unknown tileId {candidate!r}")
            if candidate in seen_in_pool:
                audit.error(candidate_field, "duplicates another candidate in this pool")
                continue
            seen_in_pool.add(candidate)
            if candidate in semantic_bases and candidate != base_tile_id:
                audit.error(
                    candidate_field,
                    f"cannot cross into semantic base {candidate!r}",
                )
            previous_owner = candidate_owner.get(candidate)
            if previous_owner is not None and previous_owner != base_tile_id:
                audit.error(
                    candidate_field,
                    f"is already owned by semantic base {previous_owner!r}",
                )
            else:
                candidate_owner[candidate] = str(base_tile_id)
        if base_tile_id not in seen_in_pool:
            audit.error(base_field, "must explicitly include its base tile ID")


def validate_bindings(
    audit: Audit,
    bindings: Any,
    bundle_id: str | None,
    map_ids: set[str],
    tile_ids: set[str],
    object_ids: set[str],
    collision_roles: dict[str, str],
) -> tuple[dict[str, str], set[tuple[str, str]]]:
    binding_hashes: dict[str, str] = {}
    review_files: set[tuple[str, str]] = set()
    binding_map_ids = set(validate_unique_ids(audit, bindings, "mapBindings", "mapId"))
    if binding_map_ids != map_ids:
        missing = sorted(map_ids - binding_map_ids)
        extra = sorted(binding_map_ids - map_ids)
        if missing:
            audit.error("mapBindings", f"missing map bindings {missing!r}")
        if extra:
            audit.error("mapBindings", f"contains undeclared maps {extra!r}")
    if not isinstance(bindings, list):
        return binding_hashes, review_files
    for index, binding_entry in enumerate(bindings):
        field_name = f"mapBindings[{index}]"
        if not isinstance(binding_entry, dict):
            audit.error(field_name, "expected an object")
            continue
        map_id = binding_entry.get("mapId")
        binding_ref = binding_entry.get("binding")
        binding_ref_key = file_ref_key(binding_ref)
        if binding_ref_key is not None:
            review_files.add(binding_ref_key)
            if is_id(map_id):
                binding_hashes[map_id] = binding_ref_key[1]
        binding = audit.validate_json_ref(binding_ref, f"{field_name}.binding")
        if not isinstance(binding, dict):
            if binding is not None:
                audit.error(f"{field_name}.binding", "expected a JSON object")
            continue
        scan_forbidden_flags(audit, binding, f"{field_name}.binding.json")
        if binding.get("schemaVersion") != SCHEMA_VERSION:
            audit.error(f"{field_name}.binding.schemaVersion", f"must equal {SCHEMA_VERSION}")
        if bundle_id is not None and binding.get("bundleId") != bundle_id:
            audit.error(f"{field_name}.binding.bundleId", "must match manifest bundleId")
        if binding.get("mapId") != map_id:
            audit.error(f"{field_name}.binding.mapId", "must match binding entry mapId")

        map_grid_size: list[int | float] | None = None
        if "mapGridSize" in binding:
            map_grid_size = validate_number_pair(
                audit,
                binding.get("mapGridSize"),
                f"{field_name}.binding.mapGridSize",
                positive=True,
                integer=True,
            )

        ground = binding.get("ground")
        validate_ground_visual_contract(
            audit,
            ground,
            tile_ids,
            f"{field_name}.binding.ground",
        )
        edge_padding_cells = 0
        if isinstance(ground, dict):
            edge_padding_value = ground.get("edgePaddingCells", 0)
            if (
                isinstance(edge_padding_value, int)
                and not isinstance(edge_padding_value, bool)
                and 0 <= edge_padding_value <= 32
            ):
                edge_padding_cells = edge_padding_value
            overrides = ground.get("overrides")
            if not isinstance(overrides, list):
                audit.error(
                    f"{field_name}.binding.ground.overrides",
                    "expected an array; use [] when there are no overrides",
                )
            else:
                used_override_cells: set[tuple[int, int]] = set()
                for override_index, override in enumerate(overrides):
                    override_field = (
                        f"{field_name}.binding.ground.overrides[{override_index}]"
                    )
                    if not isinstance(override, dict):
                        audit.error(override_field, "expected an object")
                        continue
                    cell = validate_grid_cell(
                        audit,
                        override.get("grid"),
                        f"{override_field}.grid",
                        map_grid_size,
                    )
                    if cell is not None:
                        if cell in used_override_cells:
                            audit.error(f"{override_field}.grid", "duplicates another override cell")
                        used_override_cells.add(cell)
                    override_tile_id = override.get("tileId")
                    if override_tile_id not in tile_ids:
                        audit.error(
                            f"{override_field}.tileId",
                            f"unknown tileId {override_tile_id!r}",
                        )

        placements = binding.get("objectPlacements")
        if not isinstance(placements, list):
            audit.error(
                f"{field_name}.binding.objectPlacements",
                "expected an array; use [] when there are no objects",
            )
        else:
            instance_ids: set[str] = set()
            for placement_index, placement in enumerate(placements):
                placement_field = (
                    f"{field_name}.binding.objectPlacements[{placement_index}]"
                )
                if not isinstance(placement, dict):
                    audit.error(placement_field, "expected an object")
                    continue
                instance_id = validate_id(
                    audit,
                    placement.get("instanceId"),
                    f"{placement_field}.instanceId",
                )
                if instance_id is not None:
                    if instance_id in instance_ids:
                        audit.error(
                            f"{placement_field}.instanceId",
                            f"duplicate instanceId {instance_id!r}",
                        )
                    instance_ids.add(instance_id)
                object_id = placement.get("objectId")
                if object_id not in object_ids:
                    audit.error(
                        f"{placement_field}.objectId",
                        f"unknown objectId {object_id!r}",
                    )
                collision_role = collision_roles.get(object_id)
                anchor_cell = validate_object_anchor_cell(
                    audit,
                    placement.get("grid"),
                    f"{placement_field}.grid",
                    map_grid_size,
                    collision_role,
                    edge_padding_cells,
                )
                validate_number_pair(
                    audit,
                    placement.get("offset"),
                    f"{placement_field}.offset",
                )
                if placement.get("mirrored") is not False:
                    audit.error(f"{placement_field}.mirrored", "must be explicitly false")
                if "interactionLink" not in placement:
                    audit.error(
                        f"{placement_field}.interactionLink",
                        "is required; use null when there is no interaction",
                    )
                else:
                    interaction_link = placement.get("interactionLink")
                    if interaction_link is not None and not is_id(interaction_link):
                        audit.error(
                            f"{placement_field}.interactionLink",
                            "expected null or a lowercase stable ID",
                        )
                    if (
                        interaction_link is not None
                        and collision_role in {"none", "decorative"}
                        and anchor_cell is not None
                        and map_grid_size is not None
                        and not (
                            0 <= anchor_cell[0] < int(map_grid_size[0])
                            and 0 <= anchor_cell[1] < int(map_grid_size[1])
                        )
                    ):
                        audit.error(
                            f"{placement_field}.interactionLink",
                            "off-grid none/decorative scenery must use null",
                        )
                footprint = placement.get("collisionFootprint")
                if not isinstance(footprint, list):
                    audit.error(
                        f"{placement_field}.collisionFootprint",
                            "expected an array; use [] for no occupied cells",
                        )
                else:
                    if collision_role == "blocking" and not footprint:
                        audit.error(
                            f"{placement_field}.collisionFootprint",
                            "must be non-empty for a blocking object",
                        )
                    if collision_role in {"none", "decorative"} and footprint:
                        audit.error(
                            f"{placement_field}.collisionFootprint",
                            f"must be empty for collisionRole={collision_role}",
                        )
                    footprint_cells: set[tuple[int, int]] = set()
                    for footprint_index, footprint_cell in enumerate(footprint):
                        footprint_field = (
                            f"{placement_field}.collisionFootprint[{footprint_index}]"
                        )
                        checked_cell = validate_grid_cell(
                            audit,
                            footprint_cell,
                            footprint_field,
                            map_grid_size,
                        )
                        if checked_cell is not None:
                            if checked_cell in footprint_cells:
                                audit.error(footprint_field, "duplicates another footprint cell")
                            footprint_cells.add(checked_cell)
        walk_references(audit, binding, f"{field_name}.binding.json", tile_ids, object_ids)
    return binding_hashes, review_files


def _is_finite_scalar(value: Any) -> bool:
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        return False
    return math.isfinite(value)


def _is_finite_number(value: Any, *, positive: bool = False) -> bool:
    if not _is_finite_scalar(value):
        return False
    return value > 0 if positive else value >= 0


def _is_canonical_three_decimal_number(value: Any) -> bool:
    return _is_finite_scalar(value) and math.isclose(
        float(value),
        round(float(value), 3),
        rel_tol=0.0,
        abs_tol=1e-12,
    )


def _is_non_negative_int_pair(value: Any) -> bool:
    return (
        isinstance(value, list)
        and len(value) == 2
        and all(
            isinstance(part, int) and not isinstance(part, bool) and part >= 0
            for part in value
        )
    )


def _validate_timezone_aware_timestamp(
    audit: Audit,
    value: Any,
    field_name: str,
    *,
    require_utc: bool,
) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        qualifier = "UTC " if require_utc else ""
        audit.error(field_name, f"expected a non-empty timezone-aware {qualifier}timestamp")
        return None
    normalized = value[:-1] + "+00:00" if value.endswith("Z") else value
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        audit.error(field_name, "must be an ISO-8601 timestamp")
        return None
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        audit.error(field_name, "must include a timezone offset")
        return None
    if require_utc and parsed.utcoffset().total_seconds() != 0:
        audit.error(field_name, "must identify UTC with Z or +00:00")
        return None
    if parsed > datetime.now(timezone.utc) + timedelta(minutes=5):
        audit.error(field_name, "must not be more than five minutes in the future")
        return None
    return parsed.astimezone(timezone.utc)


def _validate_generated_at_utc(
    audit: Audit,
    value: Any,
    field_name: str,
) -> datetime | None:
    return _validate_timezone_aware_timestamp(
        audit,
        value,
        field_name,
        require_utc=True,
    )


def _validate_metric_triplet(audit: Audit, value: Any, field_name: str) -> None:
    if (
        not isinstance(value, list)
        or len(value) != 3
        or not all(_is_finite_number(part) for part in value)
    ):
        audit.error(field_name, "expected three finite non-negative numbers")
        return
    minimum, mean, maximum = value
    if not minimum <= mean <= maximum:
        audit.error(field_name, "must be ordered min <= mean <= max")


def _validate_performance_sample(
    audit: Audit,
    sample: Any,
    field_name: str,
    *,
    moving: bool,
) -> float | None:
    if not isinstance(sample, dict):
        audit.error(field_name, "expected an object")
        return None
    samples = sample.get("samples")
    if not isinstance(samples, int) or isinstance(samples, bool) or samples <= 0:
        audit.error(f"{field_name}.samples", "must be a positive integer")
    _validate_metric_triplet(
        audit,
        sample.get("fpsMinMeanMax"),
        f"{field_name}.fpsMinMeanMax",
    )
    process_triplet = sample.get("processTotalMsMinMeanMax")
    _validate_metric_triplet(
        audit,
        process_triplet,
        f"{field_name}.processTotalMsMinMeanMax",
    )
    process_mean = (
        float(process_triplet[1])
        if isinstance(process_triplet, list)
        and len(process_triplet) == 3
        and all(_is_finite_number(part) for part in process_triplet)
        else None
    )
    _validate_metric_triplet(
        audit,
        sample.get("drawWorldMsMinMeanMax"),
        f"{field_name}.drawWorldMsMinMeanMax",
    )
    if not moving:
        return process_mean
    clicks = sample.get("clicks")
    accepted = sample.get("accepted")
    if not isinstance(clicks, int) or isinstance(clicks, bool) or clicks <= 0:
        audit.error(f"{field_name}.clicks", "must be a positive integer")
    if not isinstance(accepted, int) or isinstance(accepted, bool) or accepted <= 0:
        audit.error(f"{field_name}.accepted", "must be a positive integer")
    elif accepted != clicks:
        audit.error(f"{field_name}.accepted", "must equal clicks")
    resolved = sample.get("resolved")
    applied = sample.get("applied")
    if not isinstance(resolved, int) or isinstance(resolved, bool) or resolved <= 0:
        audit.error(f"{field_name}.resolved", "must be a positive integer")
    if not isinstance(applied, int) or isinstance(applied, bool) or applied <= 0:
        audit.error(f"{field_name}.applied", "must be a positive integer")
    elif (
        isinstance(resolved, int)
        and not isinstance(resolved, bool)
        and resolved > 0
        and applied > resolved
    ):
        audit.error(f"{field_name}.applied", "must be <= resolved")
    if (
        isinstance(resolved, int)
        and not isinstance(resolved, bool)
        and resolved > 0
        and isinstance(accepted, int)
        and not isinstance(accepted, bool)
        and accepted > 0
        and resolved >= accepted
    ):
        audit.error(f"{field_name}.resolved", "must be < accepted")
    for metric in ("avgInputUs", "maxInputUs"):
        if not _is_finite_number(sample.get(metric)):
            audit.error(f"{field_name}.{metric}", "expected a finite non-negative number")
    if (
        _is_finite_number(sample.get("avgInputUs"))
        and _is_finite_number(sample.get("maxInputUs"))
        and sample["maxInputUs"] < sample["avgInputUs"]
    ):
        audit.error(f"{field_name}.maxInputUs", "must be >= avgInputUs")
    for true_field in ("moved", "coalesced", "settled", "finalTargetMatched"):
        if sample.get(true_field) is not True:
            audit.error(f"{field_name}.{true_field}", "must be explicitly true")
    if sample.get("battle") is not False:
        audit.error(f"{field_name}.battle", "must be explicitly false")
    if sample.get("encounter") is not False:
        audit.error(f"{field_name}.encounter", "must be explicitly false")
    return process_mean


def _performance_repeated_fields_present(
    report: dict[str, Any],
    report_maps: dict[str, dict[str, Any]],
) -> bool:
    if report.get("aggregationMode") == PERFORMANCE_REPEATED_AGGREGATION_MODE:
        return True
    for entry in report_maps.values():
        for variant in ("baseline", "candidate"):
            variant_report = entry.get(variant)
            if not isinstance(variant_report, dict):
                continue
            for mode in ("idle", "moving"):
                sample = variant_report.get(mode)
                if isinstance(sample, dict) and any(
                    key in sample
                    for key in (
                        "aggregationMethod",
                        "repetitionCount",
                        "runMeanValues",
                        "workloadIdentityByRepetition",
                        "measurementBoundary",
                        "runtimeIdentity",
                        "processScopeTotalMsMinMeanMax",
                    )
                ):
                    return True
        comparison = entry.get("comparison")
        if isinstance(comparison, dict) and comparison.get("pairedAggregation") is not None:
            return True
    return False


def _validate_repeated_workload_identity(
    audit: Audit,
    value: Any,
    field_name: str,
    *,
    map_id: str,
    expected_workload: dict[str, Any] | None,
) -> dict[str, Any] | None:
    expected_keys = {
        "sequenceId",
        "sequenceSha256",
        "startCell",
        "actualStartCell",
        "finalCell",
        "clicks",
        "mouseEvents",
    }
    if not isinstance(value, dict) or set(value) != expected_keys:
        audit.error(
            field_name,
            f"must contain exactly {sorted(expected_keys)!r}",
        )
        return None
    if value.get("sequenceId") != PERFORMANCE_MOVING_WORKLOAD_CONTRACT:
        audit.error(
            f"{field_name}.sequenceId",
            f"must equal {PERFORMANCE_MOVING_WORKLOAD_CONTRACT!r}",
        )
    sequence_sha256 = value.get("sequenceSha256")
    if not isinstance(sequence_sha256, str) or not SHA256_RE.fullmatch(sequence_sha256):
        audit.error(
            f"{field_name}.sequenceSha256",
            "expected 64 lowercase hex characters",
        )
    for cell_key in ("startCell", "actualStartCell", "finalCell"):
        cell = value.get(cell_key)
        if not isinstance(cell, str) or re.fullmatch(r"\d+,\d+", cell) is None:
            audit.error(
                f"{field_name}.{cell_key}",
                "expected a non-negative grid cell encoded as x,y",
            )
    if value.get("actualStartCell") != value.get("startCell"):
        audit.error(
            f"{field_name}.actualStartCell",
            "must equal the planned startCell",
        )
    if value.get("clicks") != 60:
        audit.error(f"{field_name}.clicks", "must equal 60")
    if value.get("mouseEvents") != 120:
        audit.error(f"{field_name}.mouseEvents", "must equal 120")
    start_cell = value.get("startCell")
    if isinstance(start_cell, str) and re.fullmatch(r"\d+,\d+", start_cell):
        start_x, start_y = (int(part) for part in start_cell.split(",", 1))
        cells = [
            (
                start_x + (0 if index % 2 == 0 else 1),
                start_y + (-1 if index % 2 == 0 else 0),
            )
            for index in range(60)
        ]
        serialized = (
            f"{PERFORMANCE_MOVING_WORKLOAD_CONTRACT}|{map_id}|{start_cell}|"
            + ";".join(f"{x},{y}" for x, y in cells)
        )
        expected_sequence_sha256 = hashlib.sha256(
            serialized.encode("utf-8")
        ).hexdigest()
        if value.get("sequenceSha256") != expected_sequence_sha256:
            audit.error(
                f"{field_name}.sequenceSha256",
                "must match the fixed spawn-adjacent sequence",
            )
        expected_final_cell = f"{cells[-1][0]},{cells[-1][1]}"
        if value.get("finalCell") != expected_final_cell:
            audit.error(
                f"{field_name}.finalCell",
                f"must equal the fixed sequence final cell {expected_final_cell!r}",
            )
    if expected_workload is not None and value != expected_workload:
        audit.error(
            field_name,
            "must exactly match the workload derived from authoritative map data",
        )
    return value


def _authoritative_performance_workloads(
    audit: Audit,
    map_ids: list[str],
    field_name: str,
) -> dict[str, dict[str, Any]]:
    godot_root = next(
        (
            parent
            for parent in (audit.root, *audit.root.parents)
            if parent.joinpath("project.godot").is_file()
        ),
        None,
    )
    # Synthetic report-contract tests may intentionally have no Godot project.
    # A real bundle audit always reaches this helper from inside the project.
    if godot_root is None:
        return {}
    catalog_path = godot_root / "scripts/world/map_data_catalog.gd"
    try:
        catalog_text = catalog_path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError) as exc:
        audit.error(field_name, f"cannot read authoritative MapDataCatalog ({exc})")
        return {}
    registered_paths = {
        map_id: path
        for map_id, path in re.findall(
            r'"([a-z0-9][a-z0-9_-]*)"\s*:\s*"(res://data/[^"\r\n]+\.json)"',
            catalog_text,
        )
    }
    expected: dict[str, dict[str, Any]] = {}
    for map_id in map_ids:
        resource_path = registered_paths.get(map_id)
        if resource_path is None:
            audit.error(
                f"{field_name}.{map_id}",
                "map is absent from authoritative MapDataCatalog",
            )
            continue
        map_path = godot_root / resource_path[len("res://") :]
        try:
            map_data = json.loads(map_path.read_text(encoding="utf-8"))
        except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
            audit.error(
                f"{field_name}.{map_id}",
                f"cannot parse authoritative map data ({exc})",
            )
            continue
        grid_size = map_data.get("gridSize") if isinstance(map_data, dict) else None
        spawn_points = (
            map_data.get("spawnPoints") if isinstance(map_data, dict) else None
        )
        start_value = (
            spawn_points.get("default", map_data.get("spawnCell"))
            if isinstance(spawn_points, dict)
            else None
        )
        if (
            not isinstance(map_data, dict)
            or map_data.get("id") != map_id
            or not isinstance(grid_size, list)
            or len(grid_size) != 2
            or not all(
                isinstance(value, int) and not isinstance(value, bool) and value > 0
                for value in grid_size
            )
            or not isinstance(start_value, list)
            or len(start_value) != 2
            or not all(
                isinstance(value, int) and not isinstance(value, bool)
                for value in start_value
            )
        ):
            audit.error(
                f"{field_name}.{map_id}",
                "authoritative movement geometry is invalid",
            )
            continue
        start = (int(start_value[0]), int(start_value[1]))
        blocked = {
            (int(value[0]), int(value[1]))
            for value in map_data.get("blockedCells", [])
            if isinstance(value, list) and len(value) >= 2
        }
        interaction_cells = {
            (int(value["cell"][0]), int(value["cell"][1]))
            for value in map_data.get("interactionPoints", [])
            if isinstance(value, dict)
            and isinstance(value.get("cell"), list)
            and len(value["cell"]) >= 2
        }
        cells = [
            (
                start[0] + (0 if index % 2 == 0 else 1),
                start[1] + (-1 if index % 2 == 0 else 0),
            )
            for index in range(60)
        ]
        if any(
            x < 0
            or y < 0
            or x >= int(grid_size[0])
            or y >= int(grid_size[1])
            or (x, y) in blocked
            or (x, y) in interaction_cells
            for x, y in cells
        ):
            audit.error(
                f"{field_name}.{map_id}",
                "authoritative shared movement target is unsafe",
            )
            continue
        start_key = f"{start[0]},{start[1]}"
        cell_keys = [f"{x},{y}" for x, y in cells]
        serialized = (
            f"{PERFORMANCE_MOVING_WORKLOAD_CONTRACT}|{map_id}|{start_key}|"
            + ";".join(cell_keys)
        )
        expected[map_id] = {
            "sequenceId": PERFORMANCE_MOVING_WORKLOAD_CONTRACT,
            "sequenceSha256": hashlib.sha256(
                serialized.encode("utf-8")
            ).hexdigest(),
            "startCell": start_key,
            "actualStartCell": start_key,
            "finalCell": cell_keys[-1],
            "clicks": 60,
            "mouseEvents": 120,
        }
    return expected


def _expected_repeated_runtime_identity(
    map_id: str,
    variant: str,
    bundle_id: str | None,
    comparison_mode: Any,
    runner_version: Any,
    video_adapter_name: Any,
) -> dict[str, Any] | None:
    if (
        comparison_mode not in PERFORMANCE_REPEATED_COMPARISON_MODES
        or not isinstance(runner_version, str)
    ):
        return None
    version_match = re.fullmatch(
        r"(?P<version>\d+\.\d+)\.(?P<status>[^.]+)\."
        r"(?P<build>[^.]+)\.(?P<hash>[0-9a-f]+)",
        runner_version,
    )
    if version_match is None:
        return None
    candidate = variant == "candidate"
    if comparison_mode == "released_primary_vs_same_primary_qa_preview":
        visual_state = {
            "mapVisualActive": True,
            "mapVisualBundleId": bundle_id,
            "mapVisualCatalogSource": "normal",
            "mapVisualMapId": map_id,
            "mapVisualQaPreview": candidate,
            "mapVisualReviewCandidate": False,
            "mapVisualStatus": "released",
        }
    else:
        visual_state = {
            "mapVisualActive": candidate,
            "mapVisualBundleId": bundle_id if candidate else "",
            "mapVisualCatalogSource": "review" if candidate else "",
            "mapVisualMapId": map_id if candidate else "",
            "mapVisualQaPreview": candidate,
            "mapVisualReviewCandidate": candidate,
            "mapVisualStatus": "owner_review_pending" if candidate else "",
        }
    return {
        "candidateEnabled": candidate,
        "displayServer": "macOS",
        "engineVersion": (
            f"{version_match.group('version')}-{version_match.group('status')} "
            f"({version_match.group('build')})"
        ),
        "engineVersionHash": version_match.group("hash"),
        "mapId": map_id,
        **visual_state,
        "processScopeMonitor": "process_priority_boundary_v1",
        "processScopePriorities": [-1000000, 1000000],
        "processScopeReady": True,
        "renderingDriver": "metal",
        "renderingMethod": "mobile",
        "sampleFrames": PERFORMANCE_SAMPLE_FRAMES,
        "status": "passed",
        "videoAdapterName": video_adapter_name,
        "viewportSize": MAIN_VIEWPORT,
        "vsyncMode": 0,
    }


def _validate_repeated_performance_sample(
    audit: Audit,
    sample: Any,
    field_name: str,
    *,
    moving: bool,
    repetition_count: int,
    map_id: str,
    variant: str,
    bundle_id: str | None,
    comparison_mode: Any,
    runner_version: Any,
    expected_workload: dict[str, Any] | None,
) -> None:
    if not isinstance(sample, dict):
        return
    expected_samples = repetition_count * PERFORMANCE_SAMPLES_PER_REPETITION
    expected_measurement_frames = repetition_count * PERFORMANCE_MEASUREMENT_FRAMES
    if sample.get("samples") != expected_samples:
        audit.error(
            f"{field_name}.samples",
            f"must equal {expected_samples} fixed windows",
        )
    if sample.get("measurementFrames") != expected_measurement_frames:
        audit.error(
            f"{field_name}.measurementFrames",
            f"must equal {expected_measurement_frames}",
        )
    draw_observed_count = sample.get("drawWorldObservedSampleCount")
    if (
        not isinstance(draw_observed_count, int)
        or isinstance(draw_observed_count, bool)
        or not 0 <= draw_observed_count <= expected_samples
    ):
        audit.error(
            f"{field_name}.drawWorldObservedSampleCount",
            f"must be an integer from 0 through {expected_samples}",
        )
    if sample.get("repetitionCount") != repetition_count:
        audit.error(
            f"{field_name}.repetitionCount",
            "must match the report repetitionCount",
        )
    if sample.get("aggregationMethod") != PERFORMANCE_AGGREGATED_SAMPLE_METHOD:
        audit.error(
            f"{field_name}.aggregationMethod",
            f"must equal {PERFORMANCE_AGGREGATED_SAMPLE_METHOD!r}",
        )
    expected_boundary = (
        "shared_input_then_fixed_frames"
        if moving
        else "post_warmup_fixed_frames"
    )
    if sample.get("measurementBoundary") != expected_boundary:
        audit.error(
            f"{field_name}.measurementBoundary",
            f"must equal {expected_boundary!r}",
        )
    for triplet_key in (
        "fpsMinMeanMax",
        "processTotalMsMinMeanMax",
        "drawWorldMsMinMeanMax",
        "processScopeTotalMsMinMeanMax",
    ):
        triplet = sample.get(triplet_key)
        if isinstance(triplet, list) and not all(
            _is_canonical_three_decimal_number(value) for value in triplet
        ):
            audit.error(
                f"{field_name}.{triplet_key}",
                "repeated aggregate values must be canonical to three decimals",
            )

    process_scope_triplet = sample.get("processScopeTotalMsMinMeanMax")
    _validate_metric_triplet(
        audit,
        process_scope_triplet,
        f"{field_name}.processScopeTotalMsMinMeanMax",
    )
    run_means = sample.get("runMeanValues")
    expected_run_mean_keys = {
        "fps",
        "processTotalMs",
        "drawWorldMs",
        "processScopeTotalMs",
        "measurementFrames",
    }
    if not isinstance(run_means, dict) or set(run_means) != expected_run_mean_keys:
        audit.error(
            f"{field_name}.runMeanValues",
            f"must contain exactly {sorted(expected_run_mean_keys)!r}",
        )
        run_means = {}
    for metric_key in (
        "fps",
        "processTotalMs",
        "drawWorldMs",
        "processScopeTotalMs",
    ):
        values = run_means.get(metric_key)
        metric_field = f"{field_name}.runMeanValues.{metric_key}"
        if (
            not isinstance(values, list)
            or len(values) != repetition_count
            or not all(_is_finite_number(value) for value in values)
        ):
            audit.error(
                metric_field,
                f"must contain {repetition_count} finite non-negative run means",
            )
            continue
        if not all(_is_canonical_three_decimal_number(value) for value in values):
            audit.error(
                metric_field,
                "repeated run means must be canonical to three decimals",
            )
        if metric_key == "fps" and any(
            not math.isclose(
                float(value),
                PERFORMANCE_FIXED_STEP_FPS,
                rel_tol=0.0,
                abs_tol=PERFORMANCE_DECIMAL_TOLERANCE,
            )
            for value in values
        ):
            audit.error(metric_field, "every fixed-step run mean must equal 60 FPS")
        triplet_key = {
            "fps": "fpsMinMeanMax",
            "processTotalMs": "processTotalMsMinMeanMax",
            "drawWorldMs": "drawWorldMsMinMeanMax",
            "processScopeTotalMs": "processScopeTotalMsMinMeanMax",
        }[metric_key]
        triplet = sample.get(triplet_key)
        if (
            isinstance(triplet, list)
            and len(triplet) == 3
            and all(_is_finite_number(value) for value in triplet)
        ):
            expected_median = round(float(median(values)), 3)
            if not math.isclose(
                float(triplet[1]),
                expected_median,
                rel_tol=0.0,
                abs_tol=PERFORMANCE_DECIMAL_TOLERANCE,
            ):
                audit.error(
                    f"{field_name}.{triplet_key}",
                    f"mean must equal the median run mean ({expected_median:.3f})",
                )
            if any(value < triplet[0] or value > triplet[2] for value in values):
                audit.error(
                    f"{field_name}.{triplet_key}",
                    "envelope extrema must contain every independent run mean",
                )
    measurement_values = run_means.get("measurementFrames")
    if (
        not isinstance(measurement_values, list)
        or len(measurement_values) != repetition_count
        or any(
            value != PERFORMANCE_MEASUREMENT_FRAMES
            for value in measurement_values
        )
    ):
        audit.error(
            f"{field_name}.runMeanValues.measurementFrames",
            f"must contain {repetition_count} entries equal to "
            f"{PERFORMANCE_MEASUREMENT_FRAMES}",
        )

    runtime_identity = sample.get("runtimeIdentity")
    if not isinstance(runtime_identity, dict):
        audit.error(f"{field_name}.runtimeIdentity", "expected an object")
    else:
        if not str(runtime_identity.get("videoAdapterName", "")).strip():
            audit.error(
                f"{field_name}.runtimeIdentity.videoAdapterName",
                "must be non-empty",
            )
        expected_runtime = _expected_repeated_runtime_identity(
            map_id,
            variant,
            bundle_id,
            comparison_mode,
            runner_version,
            runtime_identity.get("videoAdapterName"),
        )
        if expected_runtime is None:
            audit.error(
                f"{field_name}.runtimeIdentity.engineVersion",
                "cannot derive runtime identity from runnerVersion",
            )
        elif runtime_identity != expected_runtime:
            audit.error(
                f"{field_name}.runtimeIdentity",
                "must exactly attest the expected Main/Metal/map/process-scope runtime",
            )

    workloads = sample.get("workloadIdentityByRepetition")
    if not moving:
        if workloads is not None:
            audit.error(
                f"{field_name}.workloadIdentityByRepetition",
                "idle samples must not declare a moving workload",
            )
        return
    if not isinstance(workloads, list) or len(workloads) != repetition_count:
        audit.error(
            f"{field_name}.workloadIdentityByRepetition",
            f"must contain {repetition_count} workload identities",
        )
        return
    valid_workloads = [
        _validate_repeated_workload_identity(
            audit,
            workload,
            f"{field_name}.workloadIdentityByRepetition[{index}]",
            map_id=map_id,
            expected_workload=expected_workload,
        )
        for index, workload in enumerate(workloads)
    ]
    canonical = {
        json.dumps(value, ensure_ascii=False, sort_keys=True)
        for value in valid_workloads
        if value is not None
    }
    if len(canonical) > 1:
        audit.error(
            f"{field_name}.workloadIdentityByRepetition",
            "every repetition must use one exact shared workload",
        )
    expected_clicks = 60 * repetition_count
    if sample.get("clicks") != expected_clicks:
        audit.error(f"{field_name}.clicks", f"must equal {expected_clicks}")
    if sample.get("accepted") != expected_clicks:
        audit.error(f"{field_name}.accepted", f"must equal {expected_clicks}")


def _performance_expected_argv(
    executable: str,
    map_id: str,
    variant: str,
    mode: str,
) -> list[str]:
    argv = [
        executable,
        "--path",
        "client/godot",
        "--scene",
        MAIN_SCENE,
        "--windowed",
        "--resolution",
        "1280x720",
        "--single-window",
        "--fixed-fps",
        str(PERFORMANCE_FIXED_STEP_FPS),
        "--time-scale",
        "1.0",
        "--disable-vsync",
        "--",
        "--beastbound-qa-user-data-lane=automation",
        f"--map-perf-probe-map={map_id}",
    ]
    if variant == "candidate":
        argv.append(f"--map-art-review-preview={map_id}")
    if mode == "moving":
        argv.extend(
            [
                "--movement-spam-click-check",
                "--movement-spam-click-limit=60",
                "--movement-spam-shared-target-contract="
                f"{PERFORMANCE_MOVING_WORKLOAD_CONTRACT}",
            ]
        )
    argv.extend(
        [
            "--perf-probe",
            f"--perf-probe-warmup-frames={PERFORMANCE_WARMUP_FRAMES}",
            f"--perf-probe-sample-frames={PERFORMANCE_SAMPLE_FRAMES}",
            f"--perf-probe-clean-exit-frames={PERFORMANCE_MEASUREMENT_FRAMES}",
        ]
    )
    return argv


def _performance_expected_execution_matrix(
    map_ids: list[str],
    repetition_count: int,
) -> list[tuple[str, str, str, int]]:
    expected: list[tuple[str, str, str, int]] = []
    for repetition in range(1, repetition_count + 1):
        rotation = (repetition - 1) % len(map_ids)
        rotated_map_ids = map_ids[rotation:] + map_ids[:rotation]
        variants = (
            ("baseline", "candidate")
            if repetition % 2 == 1
            else ("candidate", "baseline")
        )
        for map_id in rotated_map_ids:
            for mode in ("idle", "moving"):
                for variant in variants:
                    expected.append((map_id, variant, mode, repetition))
    return expected


def _parse_performance_key_values(
    audit: Audit,
    value: str,
    field_name: str,
) -> dict[str, str] | None:
    parsed: dict[str, str] = {}
    for token in value.split():
        if "=" not in token:
            audit.error(field_name, f"malformed token {token!r}")
            return None
        key, token_value = token.split("=", 1)
        if not key or not token_value or key in parsed:
            audit.error(field_name, f"malformed or duplicate key {key!r}")
            return None
        parsed[key] = token_value
    return parsed


def _strict_performance_json_loads(value: str) -> Any:
    def reject_duplicate_keys(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
        result: dict[str, Any] = {}
        for key, item in pairs:
            if key in result:
                raise ValueError(f"duplicate JSON key {key!r}")
            result[key] = item
        return result

    return json.loads(
        value,
        object_pairs_hook=reject_duplicate_keys,
        parse_constant=lambda constant: (_ for _ in ()).throw(
            ValueError(f"non-finite JSON constant {constant}")
        ),
    )


def _performance_int(
    audit: Audit,
    values: dict[str, str],
    key: str,
    field_name: str,
) -> int | None:
    try:
        value = int(values[key])
    except (KeyError, TypeError, ValueError):
        audit.error(f"{field_name}.{key}", "expected an integer")
        return None
    return value


@lru_cache(maxsize=1)
def _performance_batch_contract():
    path = REPOSITORY_ROOT / "tools/map_performance_batch_contract.py"
    spec = importlib.util.spec_from_file_location("map_performance_batch_for_audit", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load performance batch contract: {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _parse_repeated_performance_record(
    audit: Audit,
    record: Any,
    field_name: str,
    *,
    bundle_id: str | None,
    comparison_mode: Any,
    runner_identity: dict[str, Any],
    expected_workload: dict[str, Any] | None,
) -> tuple[tuple[str, str, str, int] | None, dict[str, Any] | None]:
    if not isinstance(record, dict):
        audit.error(field_name, "expected a JSON object")
        return None, None
    expected_record_keys = {
        "schemaVersion",
        "recordType",
        "bundleId",
        "mapId",
        "variant",
        "mode",
        "repetition",
        "buildIdentity",
        "evidenceBuilderSha256",
        "evidenceRunnerSha256",
        "samplingContract",
        "runner",
        "runnerVersion",
        "argv",
        "startedAtUtc",
        "endedAtUtc",
        "returncode",
        "stdout",
        "stderr",
        "qaLane",
    }
    batched = "batch" in record
    if batched:
        expected_record_keys.add("batch")
        try:
            _performance_batch_contract().validate_binding(record)
        except (ValueError, TypeError, KeyError, OSError) as exc:
            audit.error(f"{field_name}.batch", str(exc))
    if set(record) != expected_record_keys:
        audit.error(
            field_name,
            f"must contain exactly {sorted(expected_record_keys)!r}",
        )
    map_id = record.get("mapId")
    variant = record.get("variant")
    mode = record.get("mode")
    repetition = record.get("repetition")
    identity = None
    if (
        is_id(map_id)
        and variant in {"baseline", "candidate"}
        and mode in {"idle", "moving"}
        and isinstance(repetition, int)
        and not isinstance(repetition, bool)
        and repetition > 0
    ):
        identity = (map_id, variant, mode, repetition)
    else:
        audit.error(
            field_name,
            "must identify a valid map, variant, mode and positive repetition",
        )
        return None, None
    record_schema = 2 if batched else SCHEMA_VERSION
    if type(record.get("schemaVersion")) is not int or record.get("schemaVersion") != record_schema:
        audit.error(f"{field_name}.schemaVersion", f"must equal {record_schema}")
    if record.get("recordType") != PERFORMANCE_RUNNER_RECORD_TYPE:
        audit.error(
            f"{field_name}.recordType",
            f"must equal {PERFORMANCE_RUNNER_RECORD_TYPE!r}",
        )
    if bundle_id is not None and record.get("bundleId") != bundle_id:
        audit.error(f"{field_name}.bundleId", "must match the report bundleId")
    if record.get("runner") != "godot":
        audit.error(f"{field_name}.runner", "must equal 'godot'")
    for key in ("runnerVersion", "buildIdentity"):
        if record.get(key) != runner_identity.get(key):
            audit.error(
                f"{field_name}.{key}",
                "must match the report runnerIdentity",
            )
    if type(record.get("returncode")) is not int or record.get("returncode") != 0:
        audit.error(f"{field_name}.returncode", "must equal 0")
    started_at = _validate_generated_at_utc(
        audit,
        record.get("startedAtUtc"),
        f"{field_name}.startedAtUtc",
    )
    ended_at = _validate_generated_at_utc(
        audit,
        record.get("endedAtUtc"),
        f"{field_name}.endedAtUtc",
    )
    if started_at is not None and ended_at is not None and ended_at < started_at:
        audit.error(
            f"{field_name}.endedAtUtc",
            "must not precede startedAtUtc",
        )
    for hash_key, tool_path in PERFORMANCE_TOOL_PATHS.items():
        try:
            expected_hash = hashlib.sha256(tool_path.read_bytes()).hexdigest()
        except OSError as exc:
            audit.error(
                f"{field_name}.{hash_key}",
                f"cannot hash the trusted evidence tool ({exc})",
            )
            continue
        if record.get(hash_key) != expected_hash:
            audit.error(
                f"{field_name}.{hash_key}",
                "must match the current trusted evidence tool",
            )

    sampling_contract = record.get("samplingContract")
    expected_boundary = (
        "shared_input_then_fixed_frames"
        if mode == "moving"
        else "post_warmup_fixed_frames"
    )
    expected_sampling = {
        "version": 2,
        "warmupFrames": PERFORMANCE_WARMUP_FRAMES,
        "measurementFrames": PERFORMANCE_MEASUREMENT_FRAMES,
        "sampleFrames": PERFORMANCE_SAMPLE_FRAMES,
        "measurementBoundary": expected_boundary,
        "audioPlaybackDisabled": True,
        "cleanExitRequired": True,
        "processScopeMonitor": "process_priority_boundary_v1",
        "movingWorkloadContract": (
            PERFORMANCE_MOVING_WORKLOAD_CONTRACT if mode == "moving" else None
        ),
    }
    if sampling_contract != expected_sampling:
        audit.error(
            f"{field_name}.samplingContract",
            "must equal the fixed 180/480/60 process-scope sampling contract",
        )

    argv = record.get("argv")
    if (
        not isinstance(argv, list)
        or not argv
        or not all(isinstance(value, str) for value in argv)
        or Path(argv[0]).name.lower() != "godot"
        or argv != (
            _performance_batch_contract().command(argv[0]) if batched
            else _performance_expected_argv(argv[0], map_id, variant, mode)
        )
    ):
        audit.error(
            f"{field_name}.argv",
            "must equal the canonical non-headless fixed-step Main command",
        )

    qa_lane = record.get("qaLane")
    expected_qa_lane_keys = {
        "attestation",
        "verified",
        "realUnchanged",
        "laneAbsentAfterCleanup",
        "realInventorySha256",
        "postCleanupInspectionSha256",
    }
    if not isinstance(qa_lane, dict) or set(qa_lane) != expected_qa_lane_keys:
        audit.error(
            f"{field_name}.qaLane",
            f"must contain exactly {sorted(expected_qa_lane_keys)!r}",
        )
    else:
        if qa_lane.get("attestation") != PERFORMANCE_QA_LANE_ATTESTATION:
            audit.error(
                f"{field_name}.qaLane.attestation",
                "must equal the redacted automation-lane runtime attestation",
            )
        for key in ("verified", "realUnchanged", "laneAbsentAfterCleanup"):
            if qa_lane.get(key) is not True:
                audit.error(f"{field_name}.qaLane.{key}", "must be explicitly true")
        for key in ("realInventorySha256", "postCleanupInspectionSha256"):
            digest = qa_lane.get(key)
            if not isinstance(digest, str) or not SHA256_RE.fullmatch(digest):
                audit.error(
                    f"{field_name}.qaLane.{key}",
                    "expected 64 lowercase hex characters",
                )

    stdout = record.get("stdout")
    stderr = record.get("stderr")
    if not isinstance(stdout, str) or not isinstance(stderr, str):
        audit.error(f"{field_name}.output", "stdout and stderr must be strings")
        return identity, None
    lines = (stdout + "\n" + stderr).splitlines()

    def indexes_with_prefix(prefix: str) -> list[int]:
        return [index for index, line in enumerate(lines) if line.startswith(prefix)]

    warmup_indexes = indexes_with_prefix(PERFORMANCE_WARMUP_PREFIX)
    runtime_indexes = indexes_with_prefix(PERFORMANCE_RUNTIME_PREFIX)
    measurement_indexes = indexes_with_prefix(PERFORMANCE_MEASUREMENT_PREFIX)
    cleanup_indexes = indexes_with_prefix(PERFORMANCE_CLEAN_EXIT_PREFIX)
    if any(
        len(indexes) != 1
        for indexes in (
            warmup_indexes,
            runtime_indexes,
            measurement_indexes,
            cleanup_indexes,
        )
    ):
        audit.error(
            f"{field_name}.output",
            "must emit exactly one warmup, runtime, measurement and clean-exit marker",
        )
        return identity, None
    warmup_index = warmup_indexes[0]
    runtime_index = runtime_indexes[0]
    measurement_index = measurement_indexes[0]
    cleanup_index = cleanup_indexes[0]
    perf_indexes = [
        index
        for index, line in enumerate(lines)
        if PERFORMANCE_PERF_LINE_RE.match(line) is not None
    ]
    if (
        not perf_indexes
        or not warmup_index < runtime_index < min(perf_indexes)
        or max(perf_indexes) >= measurement_index
        or cleanup_index <= measurement_index
        or any(index <= warmup_index for index in perf_indexes)
    ):
        audit.error(
            f"{field_name}.output",
            "performance samples must stay between warmup/runtime and measurement completion",
        )

    def marker_json(prefix: str, index: int, marker_field: str) -> Any:
        try:
            return _strict_performance_json_loads(lines[index][len(prefix) :])
        except (json.JSONDecodeError, ValueError):
            audit.error(marker_field, "must contain valid JSON")
            return None

    warmup = marker_json(
        PERFORMANCE_WARMUP_PREFIX,
        warmup_index,
        f"{field_name}.warmup",
    )
    if warmup != {"frames": PERFORMANCE_WARMUP_FRAMES, "status": "passed"}:
        audit.error(
            f"{field_name}.warmup",
            f"must attest exactly {PERFORMANCE_WARMUP_FRAMES} warmup frames",
        )
    runtime = marker_json(
        PERFORMANCE_RUNTIME_PREFIX,
        runtime_index,
        f"{field_name}.runtime",
    )
    if not isinstance(runtime, dict):
        audit.error(f"{field_name}.runtime", "expected an object")
    else:
        if not str(runtime.get("videoAdapterName", "")).strip():
            audit.error(
                f"{field_name}.runtime.videoAdapterName",
                "must be non-empty",
            )
        expected_runtime = _expected_repeated_runtime_identity(
            map_id,
            variant,
            bundle_id,
            comparison_mode,
            runner_identity.get("runnerVersion"),
            runtime.get("videoAdapterName"),
        )
        if expected_runtime is None or runtime != expected_runtime:
            audit.error(
                f"{field_name}.runtime",
                "must exactly attest the expected Main/Metal/map/process-scope runtime",
            )

    measurement = marker_json(
        PERFORMANCE_MEASUREMENT_PREFIX,
        measurement_index,
        f"{field_name}.measurement",
    )
    expected_measurement = {
        "completeSamples": PERFORMANCE_SAMPLES_PER_REPETITION,
        "discardedPartialFrames": 0,
        "expectedFrames": PERFORMANCE_MEASUREMENT_FRAMES,
        "frames": PERFORMANCE_MEASUREMENT_FRAMES,
        "mode": expected_boundary,
        "processScope": "process_priority_boundary_v1",
        "processScopeFrames": PERFORMANCE_MEASUREMENT_FRAMES,
        "status": "passed",
    }
    if measurement != expected_measurement:
        audit.error(
            f"{field_name}.measurement",
            "must attest eight aligned 60-frame process-scope windows",
        )
    cleanup = marker_json(
        PERFORMANCE_CLEAN_EXIT_PREFIX,
        cleanup_index,
        f"{field_name}.cleanExit",
    )
    if not isinstance(cleanup, dict):
        audit.error(f"{field_name}.cleanExit", "expected an object")
    else:
        expected_cleanup_keys = {
            "audioManagerReleased",
            "audioPlaybackDisabled",
            "audioStopped",
            "audioStreamsDetached",
            "detachedAudioPlayerCount",
            "drainFrames",
            "drainSeconds",
            "requestedExitCode",
            "status",
        }
        if set(cleanup) != expected_cleanup_keys:
            audit.error(
                f"{field_name}.cleanExit",
                f"must contain exactly {sorted(expected_cleanup_keys)!r}",
            )
        for key in (
            "audioManagerReleased",
            "audioPlaybackDisabled",
            "audioStopped",
            "audioStreamsDetached",
        ):
            if cleanup.get(key) is not True:
                audit.error(f"{field_name}.cleanExit.{key}", "must be explicitly true")
        if (
            cleanup.get("status") != "passed"
            or type(cleanup.get("requestedExitCode")) is not int
            or cleanup.get("requestedExitCode") != 0
        ):
            audit.error(f"{field_name}.cleanExit", "must report a successful clean exit")
        detached_count = cleanup.get("detachedAudioPlayerCount")
        if (
            not isinstance(detached_count, int)
            or isinstance(detached_count, bool)
            or detached_count <= 0
        ):
            audit.error(
                f"{field_name}.cleanExit.detachedAudioPlayerCount",
                "must be a positive integer",
            )

    samples: list[dict[str, float]] = []
    for index in perf_indexes:
        match = PERFORMANCE_PERF_LINE_RE.match(lines[index])
        assert match is not None
        metric_pairs = PERFORMANCE_METRIC_RE.findall(match.group("body"))
        if len({key for key, _value in metric_pairs}) != len(metric_pairs):
            audit.error(
                f"{field_name}.samples[{len(samples)}]",
                "must not contain duplicate metric keys",
            )
            continue
        metrics = {key: float(value) for key, value in metric_pairs}
        frames = int(match.group("frames"))
        fps = float(match.group("fps"))
        if (
            frames != PERFORMANCE_SAMPLE_FRAMES
            or not math.isclose(
                fps,
                PERFORMANCE_FIXED_STEP_FPS,
                rel_tol=0.0,
                abs_tol=PERFORMANCE_DECIMAL_TOLERANCE,
            )
            or "process_total" not in metrics
            or "process_scope_total" not in metrics
        ):
            audit.error(
                f"{field_name}.samples[{len(samples)}]",
                "must be one 60-frame/60-FPS window with Main and process-scope metrics",
            )
            continue
        if metrics["process_scope_total"] < metrics["process_total"]:
            audit.error(
                f"{field_name}.samples[{len(samples)}].process_scope_total",
                "must include and therefore be >= the Main._process-only total",
            )
            continue
        samples.append(
            {
                "fps": fps,
                "processTotalMs": metrics["process_total"],
                "drawWorldMs": metrics.get("draw_world", 0.0),
                "drawWorldObserved": int("draw_world" in metrics),
                "processScopeTotalMs": metrics["process_scope_total"],
            }
        )
    if len(perf_indexes) != PERFORMANCE_SAMPLES_PER_REPETITION:
        audit.error(
            f"{field_name}.samples",
            f"must contain exactly {PERFORMANCE_SAMPLES_PER_REPETITION} windows",
        )
    if len(samples) != PERFORMANCE_SAMPLES_PER_REPETITION:
        return identity, None

    moving_indexes = [
        index
        for index, line in enumerate(lines)
        if line.startswith(PERFORMANCE_MOVING_PREFIX)
    ]
    moving_lines = [
        lines[index][len(PERFORMANCE_MOVING_PREFIX) :]
        for index in moving_indexes
    ]
    workload_identity = None
    moving_values = None
    if mode == "idle":
        if moving_lines:
            audit.error(f"{field_name}.movement", "idle output must not contain movement data")
    elif (
        len(moving_lines) != 1
        or moving_indexes[0] <= runtime_index
        or moving_indexes[0] >= min(perf_indexes)
    ):
        audit.error(
            f"{field_name}.movement",
            "must contain exactly one pre-sample movement summary",
        )
    else:
        moving_values = _parse_performance_key_values(
            audit,
            moving_lines[0],
            f"{field_name}.movement",
        )
        if moving_values is not None:
            required_values = {
                "status": "ok",
                "moved": "true",
                "coalesced": "true",
                "settled": "true",
                "final_match": "true",
                "screen_roundtrip": "true",
                "projection_ready": "true",
                "battle": "false",
                "encounter": "false",
                "shared_error": "none",
                "sequence_id": PERFORMANCE_MOVING_WORKLOAD_CONTRACT,
            }
            for key, expected in required_values.items():
                if moving_values.get(key) != expected:
                    audit.error(
                        f"{field_name}.movement.{key}",
                        f"must equal {expected!r}",
                    )
            integer_values = {
                key: _performance_int(
                    audit,
                    moving_values,
                    key,
                    f"{field_name}.movement",
                )
                for key in (
                    "clicks",
                    "click_limit",
                    "target_count",
                    "mouse_events",
                    "ui_skipped",
                    "interaction_skipped",
                    "input_ui",
                    "remote_hit",
                    "accepted",
                    "resolved",
                    "applied",
                    "screen_matches",
                    "screen_mismatches",
                    "avg_input_us",
                    "max_input_us",
                )
            }
            exact_integers = {
                "clicks": 60,
                "click_limit": 60,
                "target_count": 60,
                "mouse_events": 120,
                "ui_skipped": 0,
                "interaction_skipped": 0,
                "input_ui": 0,
                "remote_hit": 0,
                "accepted": 60,
                "screen_matches": 60,
                "screen_mismatches": 0,
            }
            for key, expected in exact_integers.items():
                if integer_values.get(key) != expected:
                    audit.error(
                        f"{field_name}.movement.{key}",
                        f"must equal {expected}",
                    )
            resolved = integer_values.get("resolved")
            applied = integer_values.get("applied")
            if (
                resolved is None
                or applied is None
                or not 0 < applied <= resolved < 60
            ):
                audit.error(
                    f"{field_name}.movement",
                    "must prove 0 < applied <= resolved < accepted",
                )
            workload_identity = {
                "sequenceId": moving_values.get("sequence_id"),
                "sequenceSha256": moving_values.get("sequence_sha256"),
                "startCell": moving_values.get("start_cell"),
                "actualStartCell": moving_values.get("actual_start_cell"),
                "finalCell": moving_values.get("final_cell"),
                "clicks": integer_values.get("clicks"),
                "mouseEvents": integer_values.get("mouse_events"),
            }
            _validate_repeated_workload_identity(
                audit,
                workload_identity,
                f"{field_name}.movement.workloadIdentity",
                map_id=map_id,
                expected_workload=expected_workload,
            )
            if moving_values.get("final_cell") != moving_values.get("expected_cell"):
                audit.error(
                    f"{field_name}.movement.final_cell",
                    "must equal expected_cell",
                )

    def metric_triplet(key: str) -> list[float]:
        values = [sample[key] for sample in samples]
        return [
            round(min(values), 3),
            round(sum(values) / len(values), 3),
            round(max(values), 3),
        ]

    parsed_record: dict[str, Any] = {
        "fpsMinMeanMax": metric_triplet("fps"),
        "processTotalMsMinMeanMax": metric_triplet("processTotalMs"),
        "drawWorldMsMinMeanMax": metric_triplet("drawWorldMs"),
        "drawWorldObservedSampleCount": sum(
            int(sample["drawWorldObserved"]) for sample in samples
        ),
        "processScopeTotalMsMinMeanMax": metric_triplet("processScopeTotalMs"),
        "measurementFrames": PERFORMANCE_MEASUREMENT_FRAMES,
        "measurementBoundary": expected_boundary,
        "runtimeIdentity": runtime,
        "endedAtUtc": record.get("endedAtUtc"),
    }
    if moving_values is not None:
        for source_key, output_key in (
            ("clicks", "clicks"),
            ("accepted", "accepted"),
            ("resolved", "resolved"),
            ("applied", "applied"),
            ("avg_input_us", "avgInputUs"),
            ("max_input_us", "maxInputUs"),
        ):
            parsed_record[output_key] = _performance_int(
                audit,
                moving_values,
                source_key,
                f"{field_name}.movement",
            )
        parsed_record["workloadIdentity"] = workload_identity
    return identity, parsed_record


def _read_repeated_performance_receipt(
    audit: Audit,
    receipt_path: Path,
    field_name: str,
    *,
    bundle_id: str | None,
    map_ids: list[str],
    repetition_count: int,
    comparison_mode: Any,
    runner_identity: dict[str, Any],
    expected_workloads: dict[str, dict[str, Any]],
) -> dict[tuple[str, str, str, int], dict[str, Any]]:
    if receipt_path.suffix.lower() != ".jsonl":
        audit.error(field_name, "repeated performance receipts must use .jsonl")
        return {}
    try:
        lines = receipt_path.read_text(encoding="utf-8").splitlines()
    except (OSError, UnicodeDecodeError) as exc:
        audit.error(field_name, f"cannot read repeated receipt ({exc})")
        return {}
    if not lines or any(not line.strip() for line in lines):
        audit.error(field_name, "must contain non-empty JSONL records without blank lines")
        return {}
    records: list[Any] = []
    for index, line in enumerate(lines):
        try:
            records.append(_strict_performance_json_loads(line))
        except (json.JSONDecodeError, ValueError) as exc:
            audit.error(f"{field_name}[{index}]", f"invalid JSON ({exc})")
    expected_order = _performance_expected_execution_matrix(map_ids, repetition_count)
    if all(isinstance(record, dict) for record in records):
        try:
            _performance_batch_contract().validate_matrix(records)
        except (ValueError, TypeError, KeyError, OSError) as exc:
            audit.error(f"{field_name}.batch", str(exc))
    if len(records) != len(expected_order):
        audit.error(
            field_name,
            f"must contain exactly {len(expected_order)} matrix records",
        )
    parsed: dict[tuple[str, str, str, int], dict[str, Any]] = {}
    actual_order: list[tuple[str, str, str, int]] = []
    real_inventory_hashes: set[str] = set()
    for index, record in enumerate(records):
        identity, sample = _parse_repeated_performance_record(
            audit,
            record,
            f"{field_name}[{index}]",
            bundle_id=bundle_id,
            comparison_mode=comparison_mode,
            runner_identity=runner_identity,
            expected_workload=expected_workloads.get(str(record.get("mapId", "")))
            if isinstance(record, dict)
            else None,
        )
        if identity is None:
            continue
        actual_order.append(identity)
        if identity in parsed:
            audit.error(f"{field_name}[{index}]", "duplicates another matrix record")
        elif sample is not None:
            parsed[identity] = sample
        if isinstance(record, dict) and isinstance(record.get("qaLane"), dict):
            inventory_hash = record["qaLane"].get("realInventorySha256")
            if isinstance(inventory_hash, str):
                real_inventory_hashes.add(inventory_hash)
    if actual_order != expected_order:
        audit.error(
            field_name,
            "record order must match repetition, rotated map, mode and alternating variant order",
        )
    if len(real_inventory_hashes) != 1:
        audit.error(
            field_name,
            "all matrix records must preserve one real-user inventory hash",
        )
    return parsed


def _performance_receipt_declares_v2_sampling(receipt_path: Path) -> bool:
    if receipt_path.suffix.lower() != ".jsonl":
        return False
    try:
        lines = receipt_path.read_text(encoding="utf-8").splitlines()
    except (OSError, UnicodeDecodeError):
        return False
    for line in lines:
        try:
            record = _strict_performance_json_loads(line)
        except (json.JSONDecodeError, ValueError):
            if any(
                marker in line
                for marker in (
                    "samplingContract",
                    "process_scope_total=",
                    PERFORMANCE_WARMUP_PREFIX,
                    PERFORMANCE_RUNTIME_PREFIX,
                    PERFORMANCE_MEASUREMENT_PREFIX,
                    PERFORMANCE_CLEAN_EXIT_PREFIX,
                )
            ):
                return True
            continue
        if not isinstance(record, dict):
            continue
        contract = record.get("samplingContract")
        stdout = record.get("stdout")
        argv = record.get("argv")
        if (
            contract is not None
            or any(
                key in record
                for key in (
                    "buildIdentity",
                    "evidenceBuilderSha256",
                    "evidenceRunnerSha256",
                )
            )
            or (
                isinstance(stdout, str)
                and any(
                    marker in stdout
                    for marker in (
                        "process_scope_total=",
                        PERFORMANCE_WARMUP_PREFIX,
                        PERFORMANCE_RUNTIME_PREFIX,
                        PERFORMANCE_MEASUREMENT_PREFIX,
                        PERFORMANCE_CLEAN_EXIT_PREFIX,
                    )
                )
            )
            or (
                isinstance(argv, list)
                and any(
                    isinstance(value, str)
                    and value.startswith("--perf-probe-warmup-frames=")
                    for value in argv
                )
            )
        ):
            return True
    return False


def _triplet_close(left: Any, right: Any) -> bool:
    return (
        isinstance(left, list)
        and isinstance(right, list)
        and len(left) == len(right) == 3
        and all(
            _is_finite_number(left_value)
            and _is_finite_number(right_value)
            and math.isclose(
                float(left_value),
                float(right_value),
                rel_tol=0.0,
                abs_tol=PERFORMANCE_DECIMAL_TOLERANCE,
            )
            for left_value, right_value in zip(left, right)
        )
    )


def _validate_repeated_sample_against_receipt(
    audit: Audit,
    sample: Any,
    field_name: str,
    *,
    raw_samples: list[dict[str, Any]],
    moving: bool,
) -> None:
    if not isinstance(sample, dict) or not raw_samples:
        return
    runtime_identities = [raw.get("runtimeIdentity") for raw in raw_samples]
    if (
        any(not isinstance(value, dict) for value in runtime_identities)
        or len(
            {
                json.dumps(value, ensure_ascii=False, sort_keys=True)
                for value in runtime_identities
            }
        )
        != 1
    ):
        audit.error(
            f"{field_name}.runtimeIdentity",
            "raw repetitions must preserve one exact runtime identity",
        )
    elif sample.get("runtimeIdentity") != runtime_identities[0]:
        audit.error(
            f"{field_name}.runtimeIdentity",
            "must exactly match the raw receipt runtime identity",
        )
    raw_boundaries = [raw.get("measurementBoundary") for raw in raw_samples]
    if len(set(raw_boundaries)) != 1 or sample.get("measurementBoundary") != raw_boundaries[0]:
        audit.error(
            f"{field_name}.measurementBoundary",
            "must exactly match one stable raw measurement boundary",
        )
    raw_triplet_keys = (
        "fpsMinMeanMax",
        "processTotalMsMinMeanMax",
        "drawWorldMsMinMeanMax",
        "processScopeTotalMsMinMeanMax",
    )
    run_mean_key = {
        "fpsMinMeanMax": "fps",
        "processTotalMsMinMeanMax": "processTotalMs",
        "drawWorldMsMinMeanMax": "drawWorldMs",
        "processScopeTotalMsMinMeanMax": "processScopeTotalMs",
    }
    run_means = sample.get("runMeanValues")
    for triplet_key in raw_triplet_keys:
        expected_run_means = [raw[triplet_key][1] for raw in raw_samples]
        declared_run_means = (
            run_means.get(run_mean_key[triplet_key])
            if isinstance(run_means, dict)
            else None
        )
        if (
            not isinstance(declared_run_means, list)
            or len(declared_run_means) != len(expected_run_means)
            or any(
                not _is_finite_number(declared)
                or not math.isclose(
                    float(declared),
                    float(expected),
                    rel_tol=0.0,
                    abs_tol=PERFORMANCE_DECIMAL_TOLERANCE,
                )
                for declared, expected in zip(declared_run_means, expected_run_means)
            )
        ):
            audit.error(
                f"{field_name}.runMeanValues.{run_mean_key[triplet_key]}",
                "must exactly reproduce the ordered raw receipt run means",
            )
        expected_aggregate = [
            round(min(raw[triplet_key][0] for raw in raw_samples), 3),
            round(float(median(expected_run_means)), 3),
            round(max(raw[triplet_key][2] for raw in raw_samples), 3),
        ]
        if not _triplet_close(sample.get(triplet_key), expected_aggregate):
            audit.error(
                f"{field_name}.{triplet_key}",
                f"must equal the raw receipt aggregation {expected_aggregate!r}",
            )
    expected_draw_observed = sum(
        int(raw.get("drawWorldObservedSampleCount", 0)) for raw in raw_samples
    )
    if sample.get("drawWorldObservedSampleCount") != expected_draw_observed:
        audit.error(
            f"{field_name}.drawWorldObservedSampleCount",
            f"must equal raw total {expected_draw_observed}",
        )
    if not moving:
        return
    workloads = [raw.get("workloadIdentity") for raw in raw_samples]
    if sample.get("workloadIdentityByRepetition") != workloads:
        audit.error(
            f"{field_name}.workloadIdentityByRepetition",
            "must exactly match the raw receipt workload identity for every repetition",
        )
    for key in ("clicks", "accepted", "resolved", "applied"):
        raw_values = [raw.get(key) for raw in raw_samples]
        if not all(
            isinstance(value, int) and not isinstance(value, bool)
            for value in raw_values
        ):
            audit.error(
                f"{field_name}.{key}",
                "raw repetitions must contain valid integer values",
            )
            continue
        expected = sum(int(value) for value in raw_values)
        if sample.get(key) != expected:
            audit.error(f"{field_name}.{key}", f"must equal raw total {expected}")
    raw_avg_values = [raw.get("avgInputUs") for raw in raw_samples]
    if all(
        isinstance(value, int) and not isinstance(value, bool)
        for value in raw_avg_values
    ):
        expected_avg = int(median(int(value) for value in raw_avg_values))
        if sample.get("avgInputUs") != expected_avg:
            audit.error(
                f"{field_name}.avgInputUs", f"must equal raw median {expected_avg}"
            )
    else:
        audit.error(
            f"{field_name}.avgInputUs",
            "raw repetitions must contain valid integer values",
        )
    raw_max_values = [raw.get("maxInputUs") for raw in raw_samples]
    if all(
        isinstance(value, int) and not isinstance(value, bool)
        for value in raw_max_values
    ):
        expected_max = max(int(value) for value in raw_max_values)
        if sample.get("maxInputUs") != expected_max:
            audit.error(
                f"{field_name}.maxInputUs", f"must equal raw maximum {expected_max}"
            )
    else:
        audit.error(
            f"{field_name}.maxInputUs",
            "raw repetitions must contain valid integer values",
        )


def _validate_repeated_paired_aggregation(
    audit: Audit,
    comparison: dict[str, Any],
    field_name: str,
    *,
    baseline: dict[str, Any],
    candidate: dict[str, Any],
    repetition_count: int,
) -> None:
    paired = comparison.get("pairedAggregation")
    expected_keys = {
        "repetitions",
        "processScopeTotalMeanDeltaMsByRepetition",
        "medianProcessScopeTotalMeanDeltaMs",
        "gates",
        "thresholdSource",
    }
    if not isinstance(paired, dict) or set(paired) != expected_keys:
        audit.error(
            f"{field_name}.pairedAggregation",
            f"must contain exactly {sorted(expected_keys)!r}",
        )
        return
    repetitions = list(range(1, repetition_count + 1))
    if paired.get("repetitions") != repetitions:
        audit.error(
            f"{field_name}.pairedAggregation.repetitions",
            f"must equal {repetitions!r}",
        )
    if paired.get("thresholdSource") != "comparison.thresholds":
        audit.error(
            f"{field_name}.pairedAggregation.thresholdSource",
            "must equal 'comparison.thresholds'",
        )
    deltas = paired.get("processScopeTotalMeanDeltaMsByRepetition")
    medians = paired.get("medianProcessScopeTotalMeanDeltaMs")
    if not isinstance(deltas, dict) or set(deltas) != {"idle", "moving"}:
        audit.error(
            f"{field_name}.pairedAggregation.processScopeTotalMeanDeltaMsByRepetition",
            "must contain exactly idle and moving",
        )
        deltas = {}
    if not isinstance(medians, dict) or set(medians) != {"idle", "moving"}:
        audit.error(
            f"{field_name}.pairedAggregation.medianProcessScopeTotalMeanDeltaMs",
            "must contain exactly idle and moving",
        )
        medians = {}
    for mode in ("idle", "moving"):
        baseline_means = baseline.get(mode, {}).get("runMeanValues", {}).get(
            "processScopeTotalMs"
        )
        candidate_means = candidate.get(mode, {}).get("runMeanValues", {}).get(
            "processScopeTotalMs"
        )
        if (
            not isinstance(baseline_means, list)
            or not isinstance(candidate_means, list)
            or len(baseline_means) != repetition_count
            or len(candidate_means) != repetition_count
            or not all(_is_finite_number(value) for value in baseline_means)
            or not all(_is_finite_number(value) for value in candidate_means)
        ):
            continue
        expected_deltas = [
            round(float(candidate_value) - float(baseline_value), 3)
            for baseline_value, candidate_value in zip(
                baseline_means,
                candidate_means,
            )
        ]
        declared_deltas = deltas.get(mode)
        if (
            not isinstance(declared_deltas, list)
            or len(declared_deltas) != repetition_count
            or any(
                not _is_finite_scalar(declared)
                or not math.isclose(
                    float(declared),
                    expected,
                    rel_tol=0.0,
                    abs_tol=PERFORMANCE_DECIMAL_TOLERANCE,
                )
                for declared, expected in zip(declared_deltas, expected_deltas)
            )
        ):
            audit.error(
                f"{field_name}.pairedAggregation.processScopeTotalMeanDeltaMsByRepetition.{mode}",
                f"must equal paired candidate-minus-baseline deltas {expected_deltas!r}",
            )
        elif not all(
            _is_canonical_three_decimal_number(value) for value in declared_deltas
        ):
            audit.error(
                f"{field_name}.pairedAggregation.processScopeTotalMeanDeltaMsByRepetition.{mode}",
                "must use canonical three-decimal deltas",
            )
        expected_median = round(float(median(expected_deltas)), 3)
        declared_median = medians.get(mode)
        if (
            not _is_finite_scalar(declared_median)
            or not math.isclose(
                float(declared_median),
                expected_median,
                rel_tol=0.0,
                abs_tol=PERFORMANCE_DECIMAL_TOLERANCE,
            )
        ):
            audit.error(
                f"{field_name}.pairedAggregation.medianProcessScopeTotalMeanDeltaMs.{mode}",
                f"must equal {expected_median:.3f}",
            )
        elif not _is_canonical_three_decimal_number(declared_median):
            audit.error(
                f"{field_name}.pairedAggregation.medianProcessScopeTotalMeanDeltaMs.{mode}",
                "must use a canonical three-decimal median",
            )
        threshold = PERFORMANCE_PROCESS_SCOPE_THRESHOLDS[
            "idleProcessScopeRegressionMaxMs"
            if mode == "idle"
            else "movingProcessScopeRegressionMaxMs"
        ]
        if expected_median > threshold:
            audit.error(
                f"{field_name}.pairedAggregation.medianProcessScopeTotalMeanDeltaMs.{mode}",
                f"paired regression exceeds {threshold}",
            )
    paired_gates = paired.get("gates")
    if (
        not isinstance(paired_gates, dict)
        or set(paired_gates) != PERFORMANCE_PAIRED_GATE_NAMES
    ):
        audit.error(
            f"{field_name}.pairedAggregation.gates",
            f"must contain exactly {sorted(PERFORMANCE_PAIRED_GATE_NAMES)!r}",
        )
    elif any(value != "PASS" for value in paired_gates.values()):
        audit.error(
            f"{field_name}.pairedAggregation.gates",
            "all paired regression gates must PASS",
        )


def _validate_report_map_entries(
    audit: Audit,
    value: Any,
    field_name: str,
    map_ids: set[str],
) -> dict[str, dict[str, Any]]:
    if not isinstance(value, list):
        audit.error(field_name, "expected an array")
        return {}
    entries: dict[str, dict[str, Any]] = {}
    for index, entry in enumerate(value):
        entry_field = f"{field_name}[{index}]"
        if not isinstance(entry, dict):
            audit.error(entry_field, "expected an object")
            continue
        map_id = entry.get("mapId")
        if not is_id(map_id):
            audit.error(f"{entry_field}.mapId", "expected a lowercase stable map ID")
            continue
        if map_id in entries:
            audit.error(f"{entry_field}.mapId", "duplicates another map entry")
            continue
        entries[map_id] = entry
    missing = sorted(map_ids - set(entries))
    extra = sorted(set(entries) - map_ids)
    if missing:
        audit.error(field_name, f"missing manifest maps {missing!r}")
    if extra:
        audit.error(field_name, f"contains undeclared maps {extra!r}")
    return entries


def _validate_report_hash_snapshot(
    audit: Audit,
    value: Any,
    field_name: str,
    expected: dict[str, str],
) -> None:
    if not isinstance(value, dict):
        audit.error(field_name, "expected a mapId-to-SHA256 object")
        return
    if value != expected:
        audit.error(field_name, "must exactly match the frozen catalog-contract snapshot")
    for map_id, digest in value.items():
        if not is_id(map_id):
            audit.error(field_name, f"invalid map ID {map_id!r}")
        if not isinstance(digest, str) or not SHA256_RE.fullmatch(digest):
            audit.error(f"{field_name}.{map_id}", "expected 64 lowercase hex characters")


def validate_report(
    audit: Audit,
    evidence: dict[str, Any],
    key: str,
    bundle_id: str | None,
    map_ids: set[str],
    catalog_contract_sha256: str | None,
    catalog_contract_hashes: dict[str, dict[str, str]],
    runtime_capture_pairs: dict[
        str,
        dict[tuple[tuple[str, str], tuple[str, str]], str],
    ],
    *,
    map_id_order: list[str] | None = None,
    required: bool,
    release_frozen: bool,
) -> set[tuple[str, str]]:
    nested_evidence: set[tuple[str, str]] = set()
    value = evidence.get(key)
    if value is None:
        if required:
            audit.error(f"evidence.{key}", "is required for frozen owner approval")
        return nested_evidence
    report = audit.validate_json_ref(value, f"evidence.{key}")
    if not isinstance(report, dict):
        if report is not None:
            audit.error(f"evidence.{key}", "expected a JSON object")
        return nested_evidence

    field_name = f"evidence.{key}"
    if key == "performanceReport" and isinstance(value, dict):
        strict_report_path = audit.resolve_file(
            value.get("path"),
            f"{field_name}.path",
        )
        if strict_report_path is not None:
            try:
                strict_report = _strict_performance_json_loads(
                    strict_report_path.read_text(encoding="utf-8")
                )
            except (OSError, UnicodeDecodeError, json.JSONDecodeError, ValueError) as exc:
                audit.error(field_name, f"must use strict JSON without duplicate keys ({exc})")
                return nested_evidence
            if not isinstance(strict_report, dict):
                audit.error(field_name, "expected a strict JSON object")
                return nested_evidence
            report = strict_report
    expected_types = {
        "collisionAudit": COLLISION_REPORT_TYPE,
        "performanceReport": PERFORMANCE_REPORT_TYPE,
        "computerUseReport": COMPUTER_USE_REPORT_TYPE,
    }
    if type(report.get("schemaVersion")) is not int or report.get("schemaVersion") != SCHEMA_VERSION:
        audit.error(f"{field_name}.schemaVersion", f"must equal {SCHEMA_VERSION}")
    if report.get("reportType") != expected_types[key]:
        audit.error(f"{field_name}.reportType", f"must equal {expected_types[key]!r}")
    _validate_generated_at_utc(audit, report.get("generatedAtUtc"), f"{field_name}.generatedAtUtc")
    if bundle_id is not None and report.get("bundleId") != bundle_id:
        audit.error(f"{field_name}.bundleId", "must match manifest bundleId")
    if report.get("result") != "PASS":
        audit.error(f"{field_name}.result", "must equal PASS")
    tested = report.get("testedMapIds")
    if not isinstance(tested, list) or not all(is_id(item) for item in tested):
        audit.error(f"{field_name}.testedMapIds", "expected an array of map IDs")
    else:
        if len(tested) != len(set(tested)):
            audit.error(f"{field_name}.testedMapIds", "must not contain duplicate map IDs")
        if set(tested) != map_ids:
            audit.error(f"{field_name}.testedMapIds", "must exactly cover manifest mapIds")

    excluded_gate = report.get("excludedReleaseGate")
    if excluded_gate is not None and (
        not isinstance(excluded_gate, str) or not excluded_gate.strip()
    ):
        audit.error(f"{field_name}.excludedReleaseGate", "expected null or a non-empty string")
    blockers = report.get("blockers")
    if not isinstance(blockers, list) or not all(
        isinstance(blocker, str) and blocker.strip() for blocker in blockers
    ):
        audit.error(f"{field_name}.blockers", "expected an array of non-empty strings")
        blockers = []
    if release_frozen and isinstance(excluded_gate, str) and excluded_gate.strip():
        audit.error(
            f"{field_name}.excludedReleaseGate",
            "must be null before owner-approved or released evidence is accepted",
        )
    if release_frozen and blockers:
        audit.error(
            f"{field_name}.blockers",
            "must be empty before owner-approved or released evidence is accepted",
        )

    receipt_path: Path | None = None
    if key in {"collisionAudit", "performanceReport"}:
        runner_gate = f"{key}.runner_identity"
        runner_identity = report.get("runnerIdentity")
        if runner_identity is None:
            audit.report_release_gates.add(runner_gate)
        elif not isinstance(runner_identity, dict):
            audit.error(f"{field_name}.runnerIdentity", "expected an object")
            audit.report_release_gates.add(runner_gate)
        else:
            if set(runner_identity) != {"runner", "runnerVersion", "buildIdentity"}:
                audit.error(
                    f"{field_name}.runnerIdentity",
                    "must contain exactly runner, runnerVersion and buildIdentity",
                )
                audit.report_release_gates.add(runner_gate)
            if runner_identity.get("runner") != "godot":
                audit.error(f"{field_name}.runnerIdentity.runner", "must equal 'godot'")
                audit.report_release_gates.add(runner_gate)
            for identity_key in ("runnerVersion", "buildIdentity"):
                identity_value = runner_identity.get(identity_key)
                if not isinstance(identity_value, str) or not identity_value.strip():
                    audit.error(
                        f"{field_name}.runnerIdentity.{identity_key}",
                        "expected a non-empty string",
                    )
                    audit.report_release_gates.add(runner_gate)

        receipt_gate = f"{key}.raw_runner_receipt"
        receipt_ref = report.get("rawRunnerReceipt")
        if receipt_ref is None:
            audit.report_release_gates.add(receipt_gate)
        else:
            receipt_path = audit.validate_file_ref(
                receipt_ref,
                f"{field_name}.rawRunnerReceipt",
            )
            receipt_key = file_ref_key(receipt_ref)
            if receipt_key is not None:
                nested_evidence.add(receipt_key)
            if receipt_path is None:
                audit.report_release_gates.add(receipt_gate)
            else:
                if receipt_path.suffix.lower() not in {".log", ".txt", ".jsonl"}:
                    audit.error(
                        f"{field_name}.rawRunnerReceipt.path",
                        "raw runner receipt must use .log, .txt or .jsonl",
                    )
                    audit.report_release_gates.add(receipt_gate)
                try:
                    if receipt_path.stat().st_size <= 0:
                        audit.error(
                            f"{field_name}.rawRunnerReceipt",
                            "raw runner receipt must not be empty",
                        )
                        audit.report_release_gates.add(receipt_gate)
                except OSError as exc:
                    audit.error(
                        f"{field_name}.rawRunnerReceipt",
                        f"cannot stat raw runner receipt ({exc})",
                    )
                    audit.report_release_gates.add(receipt_gate)
        if release_frozen:
            unresolved_report_gates = sorted(
                gate
                for gate in audit.report_release_gates
                if gate.startswith(f"{key}.")
            )
            if unresolved_report_gates:
                audit.error(
                    field_name,
                    "unresolved formal-release gates: "
                    + ", ".join(unresolved_report_gates),
                )

    report_maps: dict[str, dict[str, Any]] = {}
    if key in {"collisionAudit", "performanceReport"}:
        report_maps = _validate_report_map_entries(
            audit,
            report.get("maps"),
            f"{field_name}.maps",
            map_ids,
        )

    if key == "collisionAudit":
        if report.get("scene") != MAIN_SCENE:
            audit.error(f"{field_name}.scene", f"must equal {MAIN_SCENE!r}")
        if report.get("command") not in VALID_COLLISION_COMMANDS:
            audit.error(
                f"{field_name}.command",
                f"must equal one of {sorted(VALID_COLLISION_COMMANDS)!r}",
            )
        checks = report.get("checks")
        if not isinstance(checks, dict) or not checks:
            audit.error(f"{field_name}.checks", "expected a non-empty check-to-result object")
        else:
            missing_checks = sorted(REQUIRED_COLLISION_CHECKS - set(checks))
            if missing_checks:
                audit.error(f"{field_name}.checks", f"missing checks {missing_checks!r}")
            failed_checks = sorted(name for name, result in checks.items() if result != "PASS")
            if failed_checks:
                audit.error(f"{field_name}.checks", f"all checks must PASS; failed {failed_checks!r}")
        for map_id, entry in report_maps.items():
            for metric in ("groundDraws", "objectCount", "protectedCells"):
                value = entry.get(metric)
                if not isinstance(value, int) or isinstance(value, bool) or value < 0:
                    audit.error(
                        f"{field_name}.maps.{map_id}.{metric}",
                        "expected a non-negative integer",
                    )
        snapshot = report.get("authoritySnapshot")
        if not isinstance(snapshot, dict):
            audit.error(f"{field_name}.authoritySnapshot", "expected an object")
        else:
            if snapshot.get("catalogContractSha256") != catalog_contract_sha256:
                audit.error(
                    f"{field_name}.authoritySnapshot.catalogContractSha256",
                    "must match the manifest catalog-contract reference",
                )
            _validate_report_hash_snapshot(
                audit,
                snapshot.get("bindingHashes"),
                f"{field_name}.authoritySnapshot.bindingHashes",
                catalog_contract_hashes.get("bindingHashes", {}),
            )
            _validate_report_hash_snapshot(
                audit,
                snapshot.get("mapDataHashes"),
                f"{field_name}.authoritySnapshot.mapDataHashes",
                catalog_contract_hashes.get("mapDataHashes", {}),
            )

    elif key == "performanceReport":
        if report.get("scene") != MAIN_SCENE:
            audit.error(f"{field_name}.scene", f"must equal {MAIN_SCENE!r}")
        if report.get("viewport") != MAIN_VIEWPORT:
            audit.error(f"{field_name}.viewport", f"must equal {MAIN_VIEWPORT!r}")
        display_server = report.get("displayServer")
        if (
            not isinstance(display_server, str)
            or not display_server.strip()
            or display_server.lower() == "headless"
        ):
            audit.error(f"{field_name}.displayServer", "must identify a non-headless display server")
        if report.get("movingInputDelivery") != "Input.parse_input_event":
            audit.error(
                f"{field_name}.movingInputDelivery",
                "must equal 'Input.parse_input_event'",
            )
        if report.get("movingInputFrameSeparated") is not True:
            audit.error(
                f"{field_name}.movingInputFrameSeparated",
                "must be explicitly true",
            )
        comparison_mode = report.get("comparisonMode")
        repeated_fields_present = _performance_repeated_fields_present(
            report,
            report_maps,
        )
        aggregation_mode = report.get("aggregationMode")
        repetition_count_value = report.get("repetitionCount")
        execution_order = report.get("executionOrder")
        repeated_contract = aggregation_mode == PERFORMANCE_REPEATED_AGGREGATION_MODE
        repetition_count: int | None = None
        if repeated_fields_present and not repeated_contract:
            audit.error(
                f"{field_name}.aggregationMode",
                f"repeated fields require {PERFORMANCE_REPEATED_AGGREGATION_MODE!r}",
            )
        if repeated_contract:
            if report.get("displayServer") != "macOS Metal":
                audit.error(
                    f"{field_name}.displayServer",
                    "repeated reports must equal 'macOS Metal'",
                )
            if comparison_mode not in PERFORMANCE_REPEATED_COMPARISON_MODES:
                audit.error(
                    f"{field_name}.comparisonMode",
                    "must identify a supported repeated runtime comparison",
                )
            if (
                not isinstance(runner_identity, dict)
                or runner_identity.get("runnerVersion") != PERFORMANCE_RUNNER_VERSION
            ):
                audit.error(
                    f"{field_name}.runnerIdentity.runnerVersion",
                    f"must equal {PERFORMANCE_RUNNER_VERSION!r}",
                )
            if map_id_order is not None and tested != map_id_order:
                audit.error(
                    f"{field_name}.testedMapIds",
                    "repeated reports must preserve the manifest mapIds order",
                )
            if (
                not isinstance(repetition_count_value, int)
                or isinstance(repetition_count_value, bool)
                or repetition_count_value < 3
                or repetition_count_value % 2 == 0
            ):
                audit.error(
                    f"{field_name}.repetitionCount",
                    "must be an odd integer of at least 3",
                )
            else:
                repetition_count = repetition_count_value
            if execution_order != PERFORMANCE_REPEATED_EXECUTION_ORDER:
                audit.error(
                    f"{field_name}.executionOrder",
                    f"must equal {PERFORMANCE_REPEATED_EXECUTION_ORDER!r}",
                )
            if report.get("controlledFixedStepFps") != PERFORMANCE_FIXED_STEP_FPS:
                audit.error(
                    f"{field_name}.controlledFixedStepFps",
                    f"must equal {PERFORMANCE_FIXED_STEP_FPS}",
                )
            if report.get("metricScope") != PERFORMANCE_METRIC_SCOPE:
                audit.error(
                    f"{field_name}.metricScope",
                    f"must equal {PERFORMANCE_METRIC_SCOPE!r}",
                )
        elif aggregation_mode is not None:
            if comparison_mode != PERFORMANCE_LEGACY_COMPARISON_MODE:
                audit.error(
                    f"{field_name}.comparisonMode",
                    f"legacy reports must equal {PERFORMANCE_LEGACY_COMPARISON_MODE!r}",
                )
            if aggregation_mode != PERFORMANCE_LEGACY_AGGREGATION_MODE:
                audit.error(
                    f"{field_name}.aggregationMode",
                    f"must equal {PERFORMANCE_LEGACY_AGGREGATION_MODE!r} or the repeated mode",
                )
            if repetition_count_value != 1:
                audit.error(f"{field_name}.repetitionCount", "legacy mode must equal 1")
            if execution_order != PERFORMANCE_LEGACY_EXECUTION_ORDER:
                audit.error(
                    f"{field_name}.executionOrder",
                    f"legacy mode must equal {PERFORMANCE_LEGACY_EXECUTION_ORDER!r}",
                )
            metric_scope = report.get("metricScope")
            if metric_scope not in (
                PERFORMANCE_METRIC_PROVENANCE,
                PERFORMANCE_LEGACY_METRIC_SCOPE,
            ):
                audit.error(
                    f"{field_name}.metricScope",
                    "legacy reports must identify processTotalMsMinMeanMax as the gate metric",
                )
        elif repetition_count_value is not None or execution_order is not None:
            audit.error(
                f"{field_name}.aggregationMode",
                "repetitionCount/executionOrder require an aggregationMode",
            )
        else:
            if comparison_mode != PERFORMANCE_LEGACY_COMPARISON_MODE:
                audit.error(
                    f"{field_name}.comparisonMode",
                    f"historical reports must equal {PERFORMANCE_LEGACY_COMPARISON_MODE!r}",
                )
            metric_scope = report.get("metricScope")
            if metric_scope is not None and metric_scope not in (
                PERFORMANCE_METRIC_PROVENANCE,
                PERFORMANCE_LEGACY_METRIC_SCOPE,
            ):
                audit.error(
                    f"{field_name}.metricScope",
                    "historical reports may only declare legacy metric provenance",
                )
        if not repeated_contract and (
            "controlledFixedStepFps" in report
            and report.get("controlledFixedStepFps") != PERFORMANCE_FIXED_STEP_FPS
        ):
            audit.error(
                f"{field_name}.controlledFixedStepFps",
                f"must equal {PERFORMANCE_FIXED_STEP_FPS} when declared",
            )

        raw_repeated_samples: dict[
            tuple[str, str, str, int], dict[str, Any]
        ] = {}
        ordered_map_ids = (
            list(map_id_order)
            if map_id_order is not None
            else list(tested)
            if isinstance(tested, list)
            and len(tested) == len(set(tested))
            and all(is_id(item) for item in tested)
            and set(tested) == map_ids
            else sorted(map_ids)
        )
        expected_workloads = (
            _authoritative_performance_workloads(
                audit,
                ordered_map_ids,
                f"{field_name}.movingWorkloadAuthority",
            )
            if repeated_contract and repetition_count is not None
            else {}
        )
        if repeated_contract and repetition_count is not None:
            if receipt_path is None:
                audit.error(
                    f"{field_name}.rawRunnerReceipt",
                    "is required to validate repeated aggregation",
                )
            else:
                raw_repeated_samples = _read_repeated_performance_receipt(
                    audit,
                    receipt_path,
                    f"{field_name}.rawRunnerReceipt",
                    bundle_id=bundle_id,
                    map_ids=ordered_map_ids,
                    repetition_count=repetition_count,
                    comparison_mode=comparison_mode,
                    runner_identity=(
                        runner_identity if isinstance(runner_identity, dict) else {}
                    ),
                    expected_workloads=expected_workloads,
                )
                raw_ended_at_values = [
                    sample.get("endedAtUtc")
                    for sample in raw_repeated_samples.values()
                    if isinstance(sample.get("endedAtUtc"), str)
                ]
                if raw_ended_at_values and report.get("generatedAtUtc") != max(
                    raw_ended_at_values
                ):
                    audit.error(
                        f"{field_name}.generatedAtUtc",
                        "must equal the latest raw receipt completion time",
                    )
        elif (
            receipt_path is not None
            and _performance_receipt_declares_v2_sampling(receipt_path)
        ):
            audit.error(
                f"{field_name}.aggregationMode",
                "a v2 repeated receipt cannot be downgraded to a legacy report",
            )
        repeated_video_adapters: set[str] = set()
        for map_id, entry in report_maps.items():
            means: dict[str, dict[str, float | None]] = {}
            variant_reports: dict[str, dict[str, Any]] = {}
            for variant, renderer in (
                ("baseline", "legacy_fallback"),
                ("candidate", "map_visual_candidate"),
            ):
                variant_field = f"{field_name}.maps.{map_id}.{variant}"
                variant_report = entry.get(variant)
                if not isinstance(variant_report, dict):
                    audit.error(variant_field, "expected an object")
                    continue
                if variant_report.get("renderer") != renderer:
                    audit.error(
                        f"{variant_field}.renderer",
                        f"must equal {renderer!r}",
                    )
                variant_reports[variant] = variant_report
                means[variant] = {
                    "idle": _validate_performance_sample(
                        audit,
                        variant_report.get("idle"),
                        f"{variant_field}.idle",
                        moving=False,
                    ),
                    "moving": _validate_performance_sample(
                        audit,
                        variant_report.get("moving"),
                        f"{variant_field}.moving",
                        moving=True,
                    ),
                }
                if repeated_contract and repetition_count is not None:
                    for mode in ("idle", "moving"):
                        sample = variant_report.get(mode)
                        sample_field = f"{variant_field}.{mode}"
                        _validate_repeated_performance_sample(
                            audit,
                            sample,
                            sample_field,
                            moving=mode == "moving",
                            repetition_count=repetition_count,
                            map_id=map_id,
                            variant=variant,
                            bundle_id=bundle_id,
                            comparison_mode=comparison_mode,
                            runner_version=(
                                runner_identity.get("runnerVersion")
                                if isinstance(runner_identity, dict)
                                else None
                            ),
                            expected_workload=expected_workloads.get(map_id),
                        )
                        raw_samples = [
                            raw_repeated_samples.get(
                                (map_id, variant, mode, repetition)
                            )
                            for repetition in range(1, repetition_count + 1)
                        ]
                        if all(isinstance(value, dict) for value in raw_samples):
                            _validate_repeated_sample_against_receipt(
                                audit,
                                sample,
                                sample_field,
                                raw_samples=[
                                    value
                                    for value in raw_samples
                                    if isinstance(value, dict)
                                ],
                                moving=mode == "moving",
                            )
                        if isinstance(sample, dict):
                            runtime_identity = sample.get("runtimeIdentity")
                            if isinstance(runtime_identity, dict):
                                adapter_name = runtime_identity.get("videoAdapterName")
                                if isinstance(adapter_name, str) and adapter_name.strip():
                                    repeated_video_adapters.add(adapter_name)
                            process_scope_triplet = sample.get(
                                "processScopeTotalMsMinMeanMax"
                            )
                            means[variant][mode] = (
                                float(process_scope_triplet[1])
                                if isinstance(process_scope_triplet, list)
                                and len(process_scope_triplet) == 3
                                and all(
                                    _is_finite_number(value)
                                    for value in process_scope_triplet
                                )
                                else None
                            )

            if repeated_contract and repetition_count is not None:
                for variant in ("baseline", "candidate"):
                    idle_runtime = variant_reports.get(variant, {}).get(
                        "idle", {}
                    )
                    moving_runtime = variant_reports.get(variant, {}).get(
                        "moving", {}
                    )
                    if (
                        isinstance(idle_runtime, dict)
                        and isinstance(moving_runtime, dict)
                        and idle_runtime.get("runtimeIdentity")
                        != moving_runtime.get("runtimeIdentity")
                    ):
                        audit.error(
                            f"{field_name}.maps.{map_id}.{variant}.runtimeIdentity",
                            "idle and moving must use one exact runtime identity",
                        )
                baseline_moving = variant_reports.get("baseline", {}).get("moving")
                candidate_moving = variant_reports.get("candidate", {}).get("moving")
                if (
                    isinstance(baseline_moving, dict)
                    and isinstance(candidate_moving, dict)
                    and baseline_moving.get("workloadIdentityByRepetition")
                    != candidate_moving.get("workloadIdentityByRepetition")
                ):
                    audit.error(
                        f"{field_name}.maps.{map_id}.movingWorkload",
                        "baseline and candidate must use the same exact workload per repetition",
                    )

            comparison_field = f"{field_name}.maps.{map_id}.comparison"
            comparison = entry.get("comparison")
            if not isinstance(comparison, dict):
                audit.error(comparison_field, "expected an object")
                continue
            if repeated_contract and repetition_count is not None:
                _validate_repeated_paired_aggregation(
                    audit,
                    comparison,
                    comparison_field,
                    baseline=variant_reports.get("baseline", {}),
                    candidate=variant_reports.get("candidate", {}),
                    repetition_count=repetition_count,
                )
            elif comparison.get("pairedAggregation") is not None:
                audit.error(
                    f"{comparison_field}.pairedAggregation",
                    "is only valid for repeated aggregation",
                )
            comparison_delta_key = (
                "processScopeTotalMeanDeltaMs"
                if repeated_contract
                else "processTotalMeanDeltaMs"
            )
            expected_thresholds = (
                PERFORMANCE_PROCESS_SCOPE_THRESHOLDS
                if repeated_contract
                else PERFORMANCE_LEGACY_THRESHOLDS
            )
            if repeated_contract and set(comparison) != {
                comparison_delta_key,
                "pairedAggregation",
                "thresholds",
                "gates",
            }:
                audit.error(
                    comparison_field,
                    "repeated comparison must contain only the process-scope delta, "
                    "paired aggregation, thresholds and gates",
                )
            deltas = comparison.get(comparison_delta_key)
            if not isinstance(deltas, dict):
                audit.error(
                    f"{comparison_field}.{comparison_delta_key}",
                    "expected idle and moving deltas",
                )
                deltas = {}
            elif set(deltas) != {"idle", "moving"}:
                audit.error(
                    f"{comparison_field}.{comparison_delta_key}",
                    "must contain exactly idle and moving",
                )
            thresholds = comparison.get("thresholds")
            if not isinstance(thresholds, dict):
                audit.error(f"{comparison_field}.thresholds", "expected an object")
                thresholds = {}
            else:
                if thresholds != expected_thresholds:
                    audit.error(
                        f"{comparison_field}.thresholds",
                        f"must equal the fixed gate {expected_thresholds!r}",
                    )
                for threshold_name, threshold in thresholds.items():
                    if not _is_finite_number(threshold, positive=True):
                        audit.error(
                            f"{comparison_field}.thresholds.{threshold_name}",
                            "must be a finite positive number",
                        )
            gates = comparison.get("gates")
            if not isinstance(gates, dict) or set(gates) != PERFORMANCE_GATE_NAMES:
                audit.error(
                    f"{comparison_field}.gates",
                    f"must contain exactly {sorted(PERFORMANCE_GATE_NAMES)!r}",
                )
            elif any(result != "PASS" for result in gates.values()):
                audit.error(f"{comparison_field}.gates", "all comparison gates must PASS")

            baseline_means = means.get("baseline", {})
            candidate_means = means.get("candidate", {})
            for mode in ("idle", "moving"):
                baseline_mean = baseline_means.get(mode)
                candidate_mean = candidate_means.get(mode)
                declared_delta = deltas.get(mode)
                delta_field = f"{comparison_field}.{comparison_delta_key}.{mode}"
                if not _is_finite_scalar(declared_delta):
                    audit.error(delta_field, "expected a finite number")
                    continue
                if repeated_contract and not _is_canonical_three_decimal_number(
                    declared_delta
                ):
                    audit.error(
                        delta_field,
                        "must use a canonical three-decimal delta",
                    )
                if baseline_mean is None or candidate_mean is None:
                    continue
                actual_delta = round(candidate_mean - baseline_mean, 3)
                delta_tolerance = (
                    PERFORMANCE_DECIMAL_TOLERANCE if repeated_contract else 0.001
                )
                if not math.isclose(
                    float(declared_delta),
                    actual_delta,
                    rel_tol=0.0,
                    abs_tol=delta_tolerance,
                ):
                    audit.error(
                        delta_field,
                        f"must equal candidate minus baseline ({actual_delta:.3f})",
                    )
                candidate_limit = thresholds.get(
                    (
                        "candidateIdleProcessScopeMeanMaxMs"
                        if mode == "idle"
                        else "candidateMovingProcessScopeMeanMaxMs"
                    )
                    if repeated_contract
                    else (
                        "candidateIdleProcessMeanMaxMs"
                        if mode == "idle"
                        else "candidateMovingProcessMeanMaxMs"
                    )
                )
                regression_limit = thresholds.get(
                    (
                        "idleProcessScopeRegressionMaxMs"
                        if mode == "idle"
                        else "movingProcessScopeRegressionMaxMs"
                    )
                    if repeated_contract
                    else (
                        "idleRegressionMaxMs"
                        if mode == "idle"
                        else "movingRegressionMaxMs"
                    )
                )
                if _is_finite_number(candidate_limit, positive=True) and candidate_mean > candidate_limit:
                    audit.error(
                        f"{comparison_field}.thresholds",
                        f"candidate {mode} mean {candidate_mean:.3f} exceeds {candidate_limit}",
                    )
                if _is_finite_number(regression_limit, positive=True) and actual_delta > regression_limit:
                    audit.error(
                        f"{comparison_field}.thresholds",
                        f"{mode} regression {actual_delta:.3f} exceeds {regression_limit}",
                    )
        if repeated_contract and len(repeated_video_adapters) != 1:
            audit.error(
                f"{field_name}.runtimeIdentity.videoAdapterName",
                "all repeated baseline/candidate runs must use one video adapter",
            )

    elif key == "computerUseReport":
        if report.get("method") != "computer_use":
            audit.error(f"{field_name}.method", "must equal 'computer_use'")
        if report.get("scene") != MAIN_SCENE:
            audit.error(f"{field_name}.scene", f"must equal {MAIN_SCENE!r}")
        if report.get("viewport") != MAIN_VIEWPORT:
            audit.error(f"{field_name}.viewport", f"must equal {MAIN_VIEWPORT!r}")
        display_server = report.get("displayServer")
        if (
            not isinstance(display_server, str)
            or not display_server.strip()
            or display_server.lower() == "headless"
        ):
            audit.error(f"{field_name}.displayServer", "must identify a non-headless display server")
        actions = report.get("actions")
        action_kinds_by_map: dict[str, set[str]] = {
            map_id: set() for map_id in map_ids
        }
        action_ids: set[str] = set()
        used_capture_pairs: set[
            tuple[str, tuple[tuple[str, str], tuple[str, str]]]
        ] = set()
        used_action_receipts: set[tuple[str, str]] = set()
        action_modes = {
            "pointer": {"idle"},
            "movement_path": {"moving"},
            "warp": {"moving", "transition"},
            "collision": {"moving"},
            # The project-owned Main capture harness intentionally authors only
            # idle and moving reports. Occlusion is therefore a distinct
            # Computer Use action/receipt performed during an independently
            # captured moving traversal past a tall foreground object.
            "occlusion": {"moving"},
        }
        if not isinstance(actions, list) or not actions:
            audit.error(f"{field_name}.actions", "expected a non-empty array")
        else:
            for index, action in enumerate(actions):
                action_field = f"{field_name}.actions[{index}]"
                if not isinstance(action, dict):
                    audit.error(action_field, "expected an object")
                    continue
                action_id = action.get("actionId")
                if not is_id(action_id):
                    audit.error(f"{action_field}.actionId", "expected a lowercase stable ID")
                elif action_id in action_ids:
                    audit.error(f"{action_field}.actionId", "duplicates another action")
                else:
                    action_ids.add(action_id)
                map_id = action.get("mapId")
                if not isinstance(map_id, str) or map_id not in map_ids:
                    audit.error(f"{action_field}.mapId", "must reference a manifest mapId")
                    map_id = None
                action_kind = action.get("actionKind")
                if not isinstance(action_kind, str) or action_kind not in COMPUTER_USE_ACTION_KINDS:
                    audit.error(
                        f"{action_field}.actionKind",
                        f"expected one of {sorted(COMPUTER_USE_ACTION_KINDS)!r}",
                    )
                    action_kind = None
                elif map_id is not None:
                    if action_kind in action_kinds_by_map[map_id]:
                        audit.error(
                            f"{action_field}.actionKind",
                            "duplicates this action kind for the same map",
                        )
                    action_kinds_by_map[map_id].add(action_kind)
                if not isinstance(action.get("description"), str) or not action["description"].strip():
                    audit.error(f"{action_field}.description", "expected a non-empty string")
                if action.get("result") != "PASS":
                    audit.error(f"{action_field}.result", "must equal PASS")
                evidence_refs = action.get("evidence")
                if not isinstance(evidence_refs, list) or not evidence_refs:
                    audit.error(f"{action_field}.evidence", "expected hashed file references")
                    continue
                action_ref_keys: set[tuple[str, str]] = set()
                validated_evidence_paths: dict[tuple[str, str], Path] = {}
                for evidence_index, evidence_ref in enumerate(evidence_refs):
                    evidence_field = f"{action_field}.evidence[{evidence_index}]"
                    evidence_path = audit.validate_file_ref(evidence_ref, evidence_field)
                    evidence_key = file_ref_key(evidence_ref)
                    if evidence_key is None:
                        continue
                    if evidence_key in action_ref_keys:
                        audit.error(evidence_field, "duplicates another action evidence reference")
                    action_ref_keys.add(evidence_key)
                    nested_evidence.add(evidence_key)
                    if evidence_path is not None:
                        validated_evidence_paths[evidence_key] = evidence_path
                matching_pairs = []
                if map_id is not None:
                    matching_pairs = [
                        (pair, pair_mode)
                        for pair, pair_mode in runtime_capture_pairs.get(map_id, {}).items()
                        if pair[0] in action_ref_keys and pair[1] in action_ref_keys
                    ]
                if len(matching_pairs) != 1:
                    audit.error(
                        f"{action_field}.evidence",
                        "must reference exactly one frozen screenshot/captureReport pair for this map",
                    )
                else:
                    matched_pair, matched_mode = matching_pairs[0]
                    pair_identity = (map_id, matched_pair)
                    if pair_identity in used_capture_pairs:
                        audit.error(
                            f"{action_field}.evidence",
                            "must use a capture pair not used by another action",
                        )
                    used_capture_pairs.add(pair_identity)
                    allowed_modes = action_modes.get(action_kind, set())
                    if matched_mode not in allowed_modes:
                        audit.error(
                            f"{action_field}.evidence",
                            f"actionKind {action_kind!r} requires capture mode in {sorted(allowed_modes)!r}",
                        )
                    screenshot_path = validated_evidence_paths.get(matched_pair[0])
                    if screenshot_path is not None:
                        try:
                            screenshot_info = decode_png(screenshot_path)
                        except (OSError, PngError) as exc:
                            audit.error(
                                f"{action_field}.evidence",
                                f"runtime screenshot PNG cannot be decoded ({exc})",
                            )
                        else:
                            audit.pngs_checked.add(
                                str(screenshot_path.relative_to(audit.root.resolve()))
                            )
                            if [screenshot_info.width, screenshot_info.height] != MAIN_VIEWPORT:
                                audit.error(
                                    f"{action_field}.evidence",
                                    f"runtime screenshot must decode to {MAIN_VIEWPORT!r}",
                                )

                receipt_ref = action.get("actionReceipt")
                receipt_path = audit.validate_file_ref(
                    receipt_ref,
                    f"{action_field}.actionReceipt",
                )
                receipt_key = file_ref_key(receipt_ref)
                if receipt_key is not None:
                    nested_evidence.add(receipt_key)
                    if receipt_key in used_action_receipts:
                        audit.error(
                            f"{action_field}.actionReceipt",
                            "must be unique to this Computer Use action",
                        )
                    used_action_receipts.add(receipt_key)
                if receipt_path is not None:
                    if receipt_path.suffix.lower() not in {".log", ".txt", ".jsonl"}:
                        audit.error(
                            f"{action_field}.actionReceipt.path",
                            "must use .log, .txt or .jsonl",
                        )
                    try:
                        if receipt_path.stat().st_size <= 0:
                            audit.error(
                                f"{action_field}.actionReceipt",
                                "must not be empty",
                            )
                    except OSError as exc:
                        audit.error(
                            f"{action_field}.actionReceipt",
                            f"cannot stat action receipt ({exc})",
                        )
        for map_id in sorted(map_ids):
            missing_kinds = sorted(
                COMPUTER_USE_ACTION_KINDS - action_kinds_by_map.get(map_id, set())
            )
            if missing_kinds:
                audit.error(
                    f"{field_name}.actions",
                    f"map {map_id!r} is missing action kinds {missing_kinds!r}",
                )

    return nested_evidence


def pending_review_lifecycle_valid(manifest: dict[str, Any]) -> bool:
    return (
        manifest.get("status") == "owner_review_pending"
        and manifest.get("ownerReviewStatus") == "pending"
        and manifest.get("releaseApproved") is False
        and manifest.get("runtimeEnabled") is False
    )


def resolve_godot_resource_path(
    audit: Audit,
    godot_root: Path,
    path_value: Any,
    field_name: str,
) -> Path | None:
    if not isinstance(path_value, str) or not path_value.startswith("res://"):
        audit.error(field_name, "expected a res:// path")
        return None
    candidate = godot_root.joinpath(path_value[len("res://") :])
    try:
        resolved = candidate.resolve(strict=True)
        resolved.relative_to(godot_root.resolve())
    except (FileNotFoundError, OSError, ValueError) as exc:
        audit.error(field_name, f"cannot resolve inside the Godot project ({exc})")
        return None
    if not resolved.is_file():
        audit.error(field_name, "must resolve to a regular file")
        return None
    return resolved


def validate_live_catalog_registration(
    audit: Audit,
    catalog_path: Path,
    godot_root: Path,
    manifest: dict[str, Any],
    map_ids: set[str],
    manifest_binding_hashes: dict[str, str],
) -> None:
    """Bind a bundle to the correct primary or pending-review live catalog."""
    is_pending_review_candidate = pending_review_lifecycle_valid(manifest)
    if catalog_path.name == "map_visual_review_catalog.json" and not is_pending_review_candidate:
        audit.error(
            "reviewCatalog.lifecycle",
            "review catalog requires exactly owner_review_pending/pending/false/false",
        )
    try:
        live_catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        audit.error(
            "catalogContractCheck.catalogSha256",
            f"live map visual catalog cannot be parsed ({exc})",
        )
        return
    if not isinstance(live_catalog, dict):
        audit.error("liveCatalog", "expected an object")
        return
    if live_catalog.get("schemaVersion") != SCHEMA_VERSION:
        audit.error("liveCatalog.schemaVersion", f"must equal {SCHEMA_VERSION}")
    entries = live_catalog.get("entries")
    if not isinstance(entries, list):
        audit.error("catalogContractCheck.catalogSha256", "live catalog entries must be an array")
        return

    catalog_entries: dict[str, dict[str, Any]] = {}
    for index, entry in enumerate(entries):
        entry_field = f"liveCatalog.entries[{index}]"
        if not isinstance(entry, dict):
            audit.error(entry_field, "expected an object")
            continue
        map_id = entry.get("mapId")
        if not is_id(map_id):
            audit.error(f"{entry_field}.mapId", "expected a lowercase stable ID")
            continue
        if map_id in catalog_entries:
            audit.error(f"{entry_field}.mapId", "duplicates another live catalog entry")
        catalog_entries[map_id] = entry

    expected_lifecycle = {
        "status": "owner_review_pending",
        "ownerReviewStatus": "pending",
        "releaseApproved": False,
        "runtimeEnabled": False,
    }
    for map_id in sorted(map_ids):
        entry = catalog_entries.get(map_id)
        if entry is None:
            audit.error(
                "catalogContractCheck.catalogSha256",
                f"live catalog is missing map {map_id!r}",
            )
            continue
        manifest_path = resolve_godot_resource_path(
            audit,
            godot_root,
            entry.get("bundleManifest"),
            f"liveCatalog.{map_id}.bundleManifest",
        )
        if (
            manifest_path is not None
            and manifest_path.resolve() != audit.manifest_path.resolve()
        ):
            audit.error(
                f"liveCatalog.{map_id}.bundleManifest",
                "must resolve to the audited bundle manifest",
            )
        if manifest_path is not None and is_pending_review_candidate:
            try:
                live_manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
                audit.error(
                    f"liveCatalog.{map_id}.bundleManifest",
                    f"cannot parse pending candidate manifest ({exc})",
                )
            else:
                actual_lifecycle = {
                    key: live_manifest.get(key)
                    for key in expected_lifecycle
                } if isinstance(live_manifest, dict) else {}
                if actual_lifecycle != expected_lifecycle:
                    audit.error(
                        f"liveCatalog.{map_id}.lifecycle",
                        "pending candidate must be exactly owner_review_pending/pending/false/false",
                    )
        binding_path = resolve_godot_resource_path(
            audit,
            godot_root,
            entry.get("bindingPath"),
            f"liveCatalog.{map_id}.bindingPath",
        )
        if binding_path is not None:
            actual_binding_digest = hashlib.sha256(binding_path.read_bytes()).hexdigest()
            expected_binding_digest = manifest_binding_hashes.get(map_id)
            if actual_binding_digest != expected_binding_digest:
                audit.error(
                    f"liveCatalog.{map_id}.bindingPath",
                    "live binding bytes must match the manifest binding SHA-256",
                )


def validate_catalog_contract_check(
    audit: Audit,
    value: Any,
    bundle_id: str | None,
    map_ids: set[str],
    manifest_binding_hashes: dict[str, str],
    manifest: dict[str, Any],
) -> dict[str, dict[str, str]]:
    snapshots: dict[str, dict[str, str]] = {
        "bindingHashes": {},
        "mapDataHashes": {},
    }
    report = audit.validate_json_ref(value, "catalogContractCheck")
    if not isinstance(report, dict):
        if report is not None:
            audit.error("catalogContractCheck", "expected a JSON object")
        return snapshots
    if set(report) != CATALOG_CONTRACT_KEYS:
        audit.error(
            "catalogContractCheck",
            f"must contain exactly {sorted(CATALOG_CONTRACT_KEYS)!r}",
        )
    if report.get("schemaVersion") != SCHEMA_VERSION:
        audit.error(
            "catalogContractCheck.schemaVersion",
            f"must equal {SCHEMA_VERSION}",
        )
    if report.get("reportType") != CATALOG_CONTRACT_REPORT_TYPE:
        audit.error(
            "catalogContractCheck.reportType",
            f"must equal {CATALOG_CONTRACT_REPORT_TYPE!r}",
        )
    _validate_generated_at_utc(
        audit,
        report.get("generatedAtUtc"),
        "catalogContractCheck.generatedAtUtc",
    )
    if not isinstance(report.get("generatedAtUtc"), str) or not re.fullmatch(
        r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z",
        report["generatedAtUtc"],
    ):
        audit.error(
            "catalogContractCheck.generatedAtUtc",
            "must use exact UTC whole-second form YYYY-MM-DDTHH:MM:SSZ",
        )
    if bundle_id is not None and report.get("bundleId") != bundle_id:
        audit.error("catalogContractCheck.bundleId", "must match manifest bundleId")
    if report.get("result") != "PASS":
        audit.error("catalogContractCheck.result", "must equal PASS")
    tested = report.get("testedMapIds")
    if not isinstance(tested, list) or not all(is_id(item) for item in tested):
        audit.error("catalogContractCheck.testedMapIds", "expected an array of map IDs")
    else:
        if len(tested) != len(set(tested)):
            audit.error("catalogContractCheck.testedMapIds", "must not contain duplicates")
        if set(tested) != map_ids:
            audit.error(
                "catalogContractCheck.testedMapIds",
                "must exactly cover manifest mapIds",
            )

    godot_root = next(
        (
            parent
            for parent in (audit.root, *audit.root.parents)
            if parent.joinpath("project.godot").is_file()
        ),
        None,
    )
    catalog_path: Path | None = None
    if godot_root is None:
        audit.error(
            "catalogContractCheck.catalogSha256",
            "cannot locate the owning Godot project",
        )
    else:
        catalog_name = (
            "map_visual_review_catalog.json"
            if manifest.get("status") == "owner_review_pending"
            else "map_visual_catalog.json"
        )
        catalog_path = godot_root / "data" / catalog_name

    catalog_digest = report.get("catalogSha256")
    if not isinstance(catalog_digest, str) or not SHA256_RE.fullmatch(catalog_digest):
        audit.error(
            "catalogContractCheck.catalogSha256",
            "expected 64 lowercase hex characters",
        )
    elif catalog_path is not None:
        try:
            actual_catalog_digest = hashlib.sha256(catalog_path.read_bytes()).hexdigest()
        except OSError as exc:
            audit.error(
                "catalogContractCheck.catalogSha256",
                f"cannot read the live map visual catalog ({exc})",
            )
        else:
            if catalog_digest != actual_catalog_digest:
                audit.error(
                    "catalogContractCheck.catalogSha256",
                    f"must equal the live {catalog_path.name} SHA-256",
                )

    report_maps = _validate_report_map_entries(
        audit,
        report.get("maps"),
        "catalogContractCheck.maps",
        map_ids,
    )
    for map_id, map_report in report_maps.items():
        expected_map_keys = {"mapId", "groundDraws", "objects", "protectedCells"}
        if set(map_report) != expected_map_keys:
            audit.error(
                f"catalogContractCheck.maps.{map_id}",
                f"must contain exactly {sorted(expected_map_keys)!r}",
            )
        for metric in ("groundDraws", "objects", "protectedCells"):
            metric_value = map_report.get(metric)
            if (
                not isinstance(metric_value, int)
                or isinstance(metric_value, bool)
                or metric_value <= 0
            ):
                audit.error(
                    f"catalogContractCheck.maps.{map_id}.{metric}",
                    "must be a positive integer",
                )

    checks = report.get("checks")
    if not isinstance(checks, dict) or set(checks) != CATALOG_CONTRACT_CHECKS:
        audit.error(
            "catalogContractCheck.checks",
            f"must contain exactly {sorted(CATALOG_CONTRACT_CHECKS)!r}",
        )
    elif any(value is not True for value in checks.values()):
        audit.error("catalogContractCheck.checks", "all independent checks must be true")
    if report.get("errors") != []:
        audit.error("catalogContractCheck.errors", "must be an empty array")

    for key in ("bindingHashes", "mapDataHashes"):
        hashes = report.get(key)
        if not isinstance(hashes, dict):
            audit.error(f"catalogContractCheck.{key}", "expected a mapId-to-SHA256 object")
            continue
        declared_ids = set(hashes)
        missing = sorted(map_ids - declared_ids)
        extra = sorted(declared_ids - map_ids)
        if missing:
            audit.error(f"catalogContractCheck.{key}", f"missing map IDs {missing!r}")
        if extra:
            audit.error(f"catalogContractCheck.{key}", f"contains undeclared map IDs {extra!r}")
        for map_id, digest in hashes.items():
            if not is_id(map_id):
                audit.error(f"catalogContractCheck.{key}", f"invalid map ID {map_id!r}")
            if not isinstance(digest, str) or not SHA256_RE.fullmatch(digest):
                audit.error(
                    f"catalogContractCheck.{key}.{map_id}",
                    "expected 64 lowercase hex characters",
                )
        snapshots[key] = {
            map_id: digest
            for map_id, digest in hashes.items()
            if is_id(map_id)
            and isinstance(digest, str)
            and SHA256_RE.fullmatch(digest)
        }

    declared_binding_hashes = report.get("bindingHashes")
    if isinstance(declared_binding_hashes, dict):
        for map_id in map_ids:
            expected = manifest_binding_hashes.get(map_id)
            actual = declared_binding_hashes.get(map_id)
            if expected is None:
                audit.error(
                    f"catalogContractCheck.bindingHashes.{map_id}",
                    "cannot match a missing or invalid manifest binding hash",
                )
            elif actual != expected:
                audit.error(
                    f"catalogContractCheck.bindingHashes.{map_id}",
                    "must equal the manifest binding SHA-256",
                )

    if godot_root is not None and catalog_path is not None:
        validate_live_catalog_registration(
            audit,
            catalog_path,
            godot_root,
            manifest,
            map_ids,
            manifest_binding_hashes,
        )
        map_data_catalog_path = godot_root / "scripts" / "world" / "map_data_catalog.gd"
        try:
            map_data_catalog_text = map_data_catalog_path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError) as exc:
            audit.error(
                "catalogContractCheck.mapDataHashes",
                f"cannot read MapDataCatalog source ({exc})",
            )
            map_data_paths: dict[str, str] = {}
        else:
            map_data_paths = {}
            for match in re.finditer(
                r'"([a-z0-9][a-z0-9_-]*)"\s*:\s*"(res://data/[^"\r\n]+\.json)"',
                map_data_catalog_text,
            ):
                matched_map_id, matched_path = match.groups()
                if matched_map_id in map_data_paths and map_data_paths[matched_map_id] != matched_path:
                    audit.error(
                        "catalogContractCheck.mapDataHashes",
                        f"MapDataCatalog has duplicate paths for {matched_map_id!r}",
                    )
                map_data_paths[matched_map_id] = matched_path
        declared_map_hashes = report.get("mapDataHashes")
        if isinstance(declared_map_hashes, dict):
            for map_id in sorted(map_ids):
                map_data_path = resolve_godot_resource_path(
                    audit,
                    godot_root,
                    map_data_paths.get(map_id),
                    f"catalogContractCheck.mapDataHashes.{map_id}.path",
                )
                if map_data_path is None:
                    continue
                actual_map_digest = hashlib.sha256(map_data_path.read_bytes()).hexdigest()
                if declared_map_hashes.get(map_id) != actual_map_digest:
                    audit.error(
                        f"catalogContractCheck.mapDataHashes.{map_id}",
                        "must equal the live authoritative map JSON SHA-256",
                    )

    return snapshots


def _batch_source_identity() -> dict[str, dict[str, str]]:
    identity: dict[str, dict[str, str]] = {}
    for key, portable_path in BATCH_PREVIEW_SOURCE_PATHS.items():
        if portable_path.startswith("repo://"):
            path = REPOSITORY_ROOT / portable_path[len("repo://") :]
        else:
            path = (
                REPOSITORY_ROOT
                / "client/godot"
                / portable_path[len("res://") :]
            )
        identity[key] = {
            "path": portable_path,
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        }
    return identity


def _batch_capture_surface_identity(
    bundle_id: str,
    map_ids: Iterable[str],
) -> dict[str, str]:
    bundle_root = (
        REPOSITORY_ROOT / "client/godot/assets/maps" / bundle_id
    )
    paths = {
        REPOSITORY_ROOT / "client/godot/data/map_visual_review_catalog.json",
        REPOSITORY_ROOT / "client/godot/scripts/world/map_data_catalog.gd",
        REPOSITORY_ROOT / "client/godot/scripts/world/map_visual_catalog.gd",
        REPOSITORY_ROOT / "client/godot/scripts/world/map_visual_renderer.gd",
        bundle_root / MANIFEST_NAME,
    }
    map_catalog_source = (
        REPOSITORY_ROOT / "client/godot/scripts/world/map_data_catalog.gd"
    ).read_text(encoding="utf-8")
    map_paths = dict(re.findall(
        r'"([a-z0-9][a-z0-9_-]*)"\s*:\s*"res://([^"\r\n]+\.json)"',
        map_catalog_source,
    ))
    for map_id in map_ids:
        relative_path = map_paths.get(map_id)
        if relative_path is not None:
            paths.add(REPOSITORY_ROOT / "client/godot" / relative_path)
    for relative_directory in ("bindings", "runtime"):
        directory = bundle_root / relative_directory
        if directory.is_dir():
            paths.update(path for path in directory.rglob("*") if path.is_file())
    manifest_path = bundle_root / MANIFEST_NAME
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest_subject_sha = _canonical_object_sha256({
        key: manifest.get(key) for key in BATCH_MANIFEST_RUNTIME_SUBJECT_KEYS
    })
    return {
        path.relative_to(REPOSITORY_ROOT).as_posix(): (
            manifest_subject_sha
            if path == manifest_path
            else hashlib.sha256(path.read_bytes()).hexdigest()
        )
        for path in sorted(paths)
    }


def _canonical_object_sha256(value: Any) -> str:
    return hashlib.sha256(
        json.dumps(
            value,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")
    ).hexdigest()


@lru_cache(maxsize=1)
def _current_map_runtime_build_identity() -> str:
    spec = importlib.util.spec_from_file_location(
        "beastbound_map_visual_evidence_builder_for_audit",
        MAP_VISUAL_EVIDENCE_BUILDER_PATH,
    )
    if spec is None or spec.loader is None:
        raise RuntimeError(
            f"cannot load map evidence builder: {MAP_VISUAL_EVIDENCE_BUILDER_PATH}"
        )
    builder = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(builder)
    identity = builder.build_identity()
    if (
        not isinstance(identity, str)
        or MAP_RUNTIME_BUILD_IDENTITY_RE.fullmatch(identity) is None
    ):
        raise RuntimeError("map evidence builder returned an invalid build identity")
    return identity


@lru_cache(maxsize=128)
def _map_runtime_identity_matches_current(captured: str, current: str) -> bool:
    if not all(MAP_RUNTIME_BUILD_IDENTITY_RE.fullmatch(value) for value in (captured, current)):
        return False
    captured_git, captured_surface = captured.split("+", 1)
    current_git, current_surface = current.split("+", 1)
    if captured_surface != current_surface:
        return False
    if captured_git == current_git:
        return True
    # Evidence/docs commits necessarily change HEAD. Preserve the capture's
    # actual provenance, while accepting identical runtime bytes only from an
    # existing ancestor in this repository; unknown/unrelated revisions fail.
    try:
        result = subprocess.run(
            ["git", "merge-base", "--is-ancestor", captured_git[4:], current_git[4:]],
            cwd=REPOSITORY_ROOT, capture_output=True, text=True, timeout=5,
        )
    except (OSError, subprocess.SubprocessError):
        return False
    return result.returncode == 0


def _batch_window_checkpoint_valid(value: Any, root_window_id: Any) -> bool:
    return (
        isinstance(value, dict)
        and value.get("windowCount") == 1
        and value.get("windowIds") == [root_window_id]
        and value.get("rootWindowId") == root_window_id
        and type(value.get("processFrame")) is int
        and value.get("processFrame", -1) >= 0
    )


def _validate_capture_preview_authorization(
    audit: Audit,
    capture_report: dict[str, Any],
    field_name: str,
    *,
    bundle_id: str,
    map_id: str,
    map_ids: Iterable[str],
) -> None:
    flag_present = capture_report.get("qaPreviewFlagPresent")
    if flag_present is True:
        if capture_report.get("qaPreviewMapId") != map_id:
            audit.error(
                f"{field_name}.qaPreviewMapId",
                "must match screenshot mapId for a legacy per-action preview flag",
            )
        unexpected = sorted(BATCH_PREVIEW_FIELDS.intersection(capture_report))
        if unexpected:
            audit.error(
                f"{field_name}.qaPreviewAuthorization",
                "legacy preview evidence must not carry batch-only fields "
                f"{unexpected!r}",
            )
        return
    if flag_present is not False:
        audit.error(
            f"{field_name}.qaPreviewFlagPresent",
            "must be a truthful boolean legacy flag or strict batch authorization",
        )
        return
    if capture_report.get("qaPreviewMapId") != "":
        audit.error(
            f"{field_name}.qaPreviewMapId",
            "batch authorization must truthfully record no per-map CLI preview flag",
        )
    plan_sha = capture_report.get("batchPlanSha256")
    build_identity = capture_report.get("batchBuildIdentity")
    manifest_identity = capture_report.get("batchBundleManifestIdentity")
    surface_identity = capture_report.get("batchCaptureSurfaceIdentity")
    surface_sha = capture_report.get("batchCaptureSurfaceIdentitySha256")
    authorization = capture_report.get("qaPreviewAuthorization")
    if not isinstance(plan_sha, str) or SHA256_RE.fullmatch(plan_sha) is None:
        audit.error(f"{field_name}.batchPlanSha256", "expected a SHA-256")
    if (
        not isinstance(build_identity, str)
        or MAP_RUNTIME_BUILD_IDENTITY_RE.fullmatch(build_identity) is None
    ):
        audit.error(
            f"{field_name}.batchBuildIdentity",
            "expected git:<40hex>+beastbound-map-runtime-surface-v2:<64hex>",
        )
    else:
        try:
            current_build_identity = _current_map_runtime_build_identity()
        except Exception as error:
            audit.error(
                f"{field_name}.batchBuildIdentity",
                f"cannot derive the current map runtime build identity: {error}",
            )
        else:
            if not _map_runtime_identity_matches_current(build_identity, current_build_identity):
                audit.error(
                    f"{field_name}.batchBuildIdentity",
                    "must match the current runtime surface and an existing ancestor commit",
                )
    expected_manifest_path = (
        f"client/godot/assets/maps/{bundle_id}/{MANIFEST_NAME}"
    )
    audited_manifest = json.loads(audit.manifest_path.read_text(encoding="utf-8"))
    expected_manifest_sha = _canonical_object_sha256({
        key: audited_manifest.get(key)
        for key in BATCH_MANIFEST_RUNTIME_SUBJECT_KEYS
    })
    if manifest_identity != {
        "path": expected_manifest_path,
        "canonicalization": "map_runtime_subject_v1",
        "sha256": expected_manifest_sha,
    }:
        audit.error(
            f"{field_name}.batchBundleManifestIdentity",
            "must bind the exact audited pending manifest bytes",
        )
    expected_surface = _batch_capture_surface_identity(bundle_id, map_ids)
    expected_surface_sha = _canonical_object_sha256(expected_surface)
    if surface_identity != expected_surface:
        audit.error(
            f"{field_name}.batchCaptureSurfaceIdentity",
            "must exactly bind the current candidate catalog, renderer, maps, bindings and runtime assets",
        )
    if surface_sha != expected_surface_sha:
        audit.error(
            f"{field_name}.batchCaptureSurfaceIdentitySha256",
            "must match the canonical candidate-source identity",
        )
    if capture_report.get("batchSourceIdentity") != _batch_source_identity():
        audit.error(
            f"{field_name}.batchSourceIdentity",
            "must exactly bind the current batch entrypoint/controller/Main sources",
        )
    expected_authorization = {
        "kind": "sha256_bound_batch_plan",
        "authorized": True,
        "cliPreviewFlagPresent": False,
        "controllerActivatedCandidatePreview": True,
        "planSha256": plan_sha,
        "bundleId": bundle_id,
        "mapId": map_id,
        "actionKind": capture_report.get("captureVariant"),
        "buildIdentity": build_identity,
        "bundleManifestSha256": expected_manifest_sha,
        "captureSurfaceIdentitySha256": expected_surface_sha,
    }
    if authorization != expected_authorization:
        audit.error(
            f"{field_name}.qaPreviewAuthorization",
            "must be the exact SHA-bound batch authorization",
        )
    if capture_report.get("batchReportSealed") is not True:
        audit.error(f"{field_name}.batchReportSealed", "must be explicitly true")
    runtime = capture_report.get("batchRuntimeIdentity")
    root_window_id = runtime.get("rootWindowId") if isinstance(runtime, dict) else None
    if (
        not isinstance(runtime, dict)
        or runtime.get("displayServerWindowCount") != 1
        or runtime.get("displayServerWindowIds") != [root_window_id]
        or type(runtime.get("processId")) is not int
        or runtime.get("processId", 0) <= 0
        or runtime.get("audioDriver") != "Dummy"
        or runtime.get("mainSceneLoadCount") != 1
        or runtime.get("mainSceneInstanceCount") != 1
        or runtime.get("viewport") != MAIN_VIEWPORT
    ):
        audit.error(
            f"{field_name}.batchRuntimeIdentity",
            "must prove one real Main process/root window with Dummy audio",
        )
    window_identity = capture_report.get("batchWindowIdentity")
    if not (
        isinstance(window_identity, dict)
        and window_identity.get("rootWindowId") == root_window_id
        and _batch_window_checkpoint_valid(
            window_identity.get("before"), root_window_id
        )
        and _batch_window_checkpoint_valid(
            window_identity.get("after"), root_window_id
        )
    ):
        audit.error(
            f"{field_name}.batchWindowIdentity",
            "must prove the same sole root window before and after the action",
        )


def validate_evidence(
    audit: Audit,
    evidence: Any,
    bundle_id: str | None,
    map_style_id: str | None,
    manifest_subject_hash: str,
    map_ids: set[str],
    map_id_order: list[str],
    owner_status: Any,
    frozen_required: bool,
    review_subject_files: set[tuple[str, str]],
    catalog_contract_ref: Any,
    catalog_contract_hashes: dict[str, dict[str, str]],
) -> None:
    if not isinstance(evidence, dict):
        audit.error("evidence", "expected an object")
        return
    frozen_files: set[tuple[str, str]] = set(review_subject_files)

    def remember_file_ref(value: Any) -> None:
        if not isinstance(value, dict):
            return
        path = value.get("path")
        digest = value.get("sha256")
        if isinstance(path, str) and isinstance(digest, str):
            frozen_files.add((path, digest))

    for key in ("dressedReference", "layeredPreview"):
        value = evidence.get(key)
        if value is None:
            if frozen_required:
                audit.error(f"evidence.{key}", "is required for frozen owner approval")
        else:
            audit.validate_png_ref(value, f"evidence.{key}")
            remember_file_ref(value)
            if frozen_required and key == "layeredPreview":
                if not isinstance(value, dict) or value.get("dimensions") != [1280, 720]:
                    audit.error(
                        "evidence.layeredPreview.dimensions",
                        "must be exactly [1280, 720] for frozen approval",
                    )

    screenshots = evidence.get("runtimeScreenshots")
    coverage: set[tuple[str, str]] = set()
    runtime_image_refs: set[tuple[str, str]] = set()
    runtime_capture_refs: set[tuple[str, str]] = set()
    runtime_pair_refs: set[
        tuple[str, tuple[str, str], tuple[str, str]]
    ] = set()
    runtime_capture_pairs: dict[
        str,
        dict[tuple[tuple[str, str], tuple[str, str]], str],
    ] = {}
    if screenshots is None:
        screenshots = []
    if not isinstance(screenshots, list):
        audit.error("evidence.runtimeScreenshots", "expected an array")
    else:
        for duplicate_map_id, duplicate_digest in sorted(
            duplicate_runtime_screenshot_hashes(screenshots)
        ):
            audit.error(
                "evidence.runtimeScreenshots",
                "same-map actions must not reuse identical screenshot pixels "
                f"({duplicate_map_id}: {duplicate_digest})",
            )
        for index, screenshot in enumerate(screenshots):
            field_name = f"evidence.runtimeScreenshots[{index}]"
            if not isinstance(screenshot, dict):
                audit.error(field_name, "expected an object")
                continue
            map_id = screenshot.get("mapId")
            mode = screenshot.get("mode")
            if map_id not in map_ids:
                audit.error(f"{field_name}.mapId", "must reference a manifest mapId")
            if mode not in VALID_SCREENSHOT_MODES:
                audit.error(
                    f"{field_name}.mode",
                    f"expected one of {sorted(VALID_SCREENSHOT_MODES)!r}",
                )
            if map_id in map_ids and mode in VALID_SCREENSHOT_MODES:
                # Several independently captured actions can legitimately share
                # one semantic mode (for example movement_path and collision
                # are both moving). Coverage is therefore a set, while the
                # concrete image/report references below must remain unique.
                coverage.add((map_id, mode))
            image_ref = screenshot.get("image")
            audit.validate_png_ref(image_ref, f"{field_name}.image")
            remember_file_ref(image_ref)
            image_key = file_ref_key(image_ref)
            if image_key is not None:
                if image_key in runtime_image_refs:
                    audit.error(
                        f"{field_name}.image",
                        "must not reuse another runtime screenshot reference",
                    )
                runtime_image_refs.add(image_key)
            capture_ref = screenshot.get("captureReport")
            capture_key: tuple[str, str] | None = None
            if capture_ref is None:
                audit.error(
                    f"{field_name}.captureReport",
                    "is required to freeze the Main scene, input and isolation proof",
                )
            else:
                capture_report = audit.validate_json_ref(
                    capture_ref,
                    f"{field_name}.captureReport",
                )
                remember_file_ref(capture_ref)
                capture_key = file_ref_key(capture_ref)
                if capture_key is not None:
                    if capture_key in runtime_capture_refs:
                        audit.error(
                            f"{field_name}.captureReport",
                            "must not reuse another runtime capture-report reference",
                        )
                    runtime_capture_refs.add(capture_key)
                if isinstance(capture_report, dict):
                    if capture_report.get("schemaVersion") != SCHEMA_VERSION:
                        audit.error(
                            f"{field_name}.captureReport.schemaVersion",
                            f"must equal {SCHEMA_VERSION}",
                        )
                    _validate_generated_at_utc(
                        audit,
                        capture_report.get("generatedAtUtc"),
                        f"{field_name}.captureReport.generatedAtUtc",
                    )
                    if capture_report.get("reportType") != "beastbound_map_visual_main_review_capture":
                        audit.error(
                            f"{field_name}.captureReport.reportType",
                            "must be a Beastbound Main map review capture",
                        )
                    if bundle_id is not None and capture_report.get("bundleId") != bundle_id:
                        audit.error(
                            f"{field_name}.captureReport.bundleId",
                            "must match manifest bundleId",
                        )
                    if capture_report.get("mapId") != map_id:
                        audit.error(
                            f"{field_name}.captureReport.mapId",
                            "must match screenshot mapId",
                        )
                    if capture_report.get("mode") != mode:
                        audit.error(
                            f"{field_name}.captureReport.mode",
                            "must match screenshot mode",
                        )
                    if capture_report.get("result") != "PASS" or capture_report.get("ok") is not True:
                        audit.error(
                            f"{field_name}.captureReport.result",
                            "must be an explicit PASS",
                        )
                    if capture_report.get("scene") != "res://scenes/Main.tscn":
                        audit.error(
                            f"{field_name}.captureReport.scene",
                            "must come from the real Main.tscn scene",
                        )
                    if capture_report.get("viewport") != [1280, 720]:
                        audit.error(
                            f"{field_name}.captureReport.viewport",
                            "must equal [1280, 720]",
                        )
                    if capture_report.get("debugBuild") is not True:
                        audit.error(
                            f"{field_name}.captureReport.debugBuild",
                            "must be explicitly true",
                        )
                    display_server = capture_report.get("displayServer")
                    if (
                        not isinstance(display_server, str)
                        or not display_server.strip()
                        or display_server.lower() == "headless"
                    ):
                        audit.error(
                            f"{field_name}.captureReport.displayServer",
                            "must identify a non-headless display server",
                        )
                    if bundle_id is not None and isinstance(map_id, str):
                        _validate_capture_preview_authorization(
                            audit,
                            capture_report,
                            f"{field_name}.captureReport",
                            bundle_id=bundle_id,
                            map_id=map_id,
                            map_ids=map_ids,
                        )
                    if capture_report.get("mapArtStatus") != "owner_review_pending":
                        audit.error(
                            f"{field_name}.captureReport.mapArtStatus",
                            "must freeze owner_review_pending candidate art",
                        )
                    if map_style_id is not None and capture_report.get("mapStyleId") != map_style_id:
                        audit.error(
                            f"{field_name}.captureReport.mapStyleId",
                            "must match manifest mapStyleId",
                        )
                    if capture_report.get("errors") != []:
                        audit.error(
                            f"{field_name}.captureReport.errors",
                            "must be an empty array",
                        )
                    for true_field in (
                        "mapArtActive",
                        "mapArtQaPreview",
                        "defaultProfileIsolation",
                        "normalPlayerHud",
                    ):
                        if capture_report.get(true_field) is not True:
                            audit.error(
                                f"{field_name}.captureReport.{true_field}",
                                "must be explicitly true",
                            )
                    for false_field in (
                        "authAutoBypass",
                        "accountAuthenticated",
                        "serverAccountSession",
                        "profileSaveEnabled",
                        "authPanelVisible",
                        "qaMenuVisible",
                        "qaPanelVisible",
                        "numericWorkbenchVisible",
                        "debugUiVisible",
                    ):
                        if capture_report.get(false_field) is not False:
                            audit.error(
                                f"{field_name}.captureReport.{false_field}",
                                "must be explicitly false",
                            )
                    expected_sha = image_ref.get("sha256") if isinstance(image_ref, dict) else None
                    if capture_report.get("screenshotSha256") != expected_sha:
                        audit.error(
                            f"{field_name}.captureReport.screenshotSha256",
                            "must match the frozen screenshot hash",
                        )
                    nested_screenshot = capture_report.get("screenshot")
                    if not isinstance(nested_screenshot, dict):
                        audit.error(
                            f"{field_name}.captureReport.screenshot",
                            "expected an object",
                        )
                    elif nested_screenshot.get("sha256") != expected_sha:
                        audit.error(
                            f"{field_name}.captureReport.screenshot.sha256",
                            "must match the frozen screenshot hash",
                        )
                    expected_path = image_ref.get("path") if isinstance(image_ref, dict) else None
                    for path_field, captured_path in (
                        ("screenshotPath", capture_report.get("screenshotPath")),
                        (
                            "screenshot.path",
                            nested_screenshot.get("path") if isinstance(nested_screenshot, dict) else None,
                        ),
                    ):
                        normalized_path = captured_path.replace("\\", "/") if isinstance(captured_path, str) else ""
                        if not isinstance(expected_path, str) or not (
                            normalized_path == expected_path
                            or normalized_path.endswith("/" + expected_path)
                        ):
                            audit.error(
                                f"{field_name}.captureReport.{path_field}",
                                "must resolve to the frozen screenshot path",
                            )
                    for cell_field in ("startCell", "targetCell", "endCell"):
                        if not _is_non_negative_int_pair(capture_report.get(cell_field)):
                            audit.error(
                                f"{field_name}.captureReport.{cell_field}",
                                "must be a pair of non-negative integers",
                            )
                    if mode == "moving":
                        input_report = capture_report.get("input")
                        if not isinstance(input_report, dict):
                            audit.error(
                                f"{field_name}.captureReport.input",
                                "expected a moving input report",
                            )
                        else:
                            if input_report.get("delivery") != "Input.parse_input_event":
                                audit.error(
                                    f"{field_name}.captureReport.input.delivery",
                                    "must use Input.parse_input_event",
                                )
                            if input_report.get("eventClass") != "InputEventMouseButton":
                                audit.error(
                                    f"{field_name}.captureReport.input.eventClass",
                                    "must be InputEventMouseButton",
                                )
                            if input_report.get("frameSeparated") is not True:
                                audit.error(
                                    f"{field_name}.captureReport.input.frameSeparated",
                                    "must be explicitly true",
                                )
                            press_frame = input_report.get("pressProcessFrame")
                            release_frame = input_report.get("releaseProcessFrame")
                            if not (
                                isinstance(press_frame, int)
                                and not isinstance(press_frame, bool)
                                and isinstance(release_frame, int)
                                and not isinstance(release_frame, bool)
                                and press_frame >= 0
                                and release_frame > press_frame
                            ):
                                audit.error(
                                    f"{field_name}.captureReport.input",
                                    "press/release frames must be non-negative and separated",
                                )
                        if capture_report.get("playerCellChanged") is not True:
                            audit.error(
                                f"{field_name}.captureReport.playerCellChanged",
                                "must be explicitly true for moving evidence",
                            )
                        if capture_report.get("startCell") == capture_report.get("endCell"):
                            audit.error(
                                f"{field_name}.captureReport.endCell",
                                "must differ from startCell for moving evidence",
                            )
                        if capture_report.get("endCell") != capture_report.get("targetCell"):
                            audit.error(
                                f"{field_name}.captureReport.endCell",
                                "must exactly reach targetCell for moving evidence",
                            )
                    elif mode == "idle":
                        start_cell = capture_report.get("startCell")
                        target_cell = capture_report.get("targetCell")
                        end_cell = capture_report.get("endCell")
                        if not (start_cell == target_cell == end_cell):
                            audit.error(
                                f"{field_name}.captureReport.endCell",
                                "idle evidence requires startCell == targetCell == endCell",
                            )
                        if capture_report.get("playerCellChanged") is not False:
                            audit.error(
                                f"{field_name}.captureReport.playerCellChanged",
                                "must be explicitly false for idle evidence",
                            )
                        input_report = capture_report.get("input")
                        if not isinstance(input_report, dict):
                            audit.error(
                                f"{field_name}.captureReport.input",
                                "expected an idle input report",
                            )
                        else:
                            if input_report.get("delivery") != "none":
                                audit.error(
                                    f"{field_name}.captureReport.input.delivery",
                                    "must equal 'none' for idle evidence",
                                )
                            if input_report.get("frameSeparated") is not False:
                                audit.error(
                                    f"{field_name}.captureReport.input.frameSeparated",
                                    "must be explicitly false for idle evidence",
                                )
            if (
                map_id in map_ids
                and mode in VALID_SCREENSHOT_MODES
                and image_key is not None
                and capture_key is not None
            ):
                pair_identity = (map_id, image_key, capture_key)
                if pair_identity in runtime_pair_refs:
                    audit.error(
                        field_name,
                        "duplicates another runtime screenshot/captureReport pair",
                    )
                runtime_pair_refs.add(pair_identity)
                runtime_capture_pairs.setdefault(map_id, {})[
                    (image_key, capture_key)
                ] = mode
            if frozen_required:
                if not isinstance(image_ref, dict) or image_ref.get("dimensions") != [1280, 720]:
                    audit.error(
                        f"{field_name}.image.dimensions",
                        "must be exactly [1280, 720] for frozen approval",
                    )
    if frozen_required:
        if len(runtime_pair_refs) < 3:
            audit.error(
                "evidence.runtimeScreenshots",
                "requires at least three unique screenshot/captureReport pairs",
            )
        covered_maps = {map_id for map_id, _mode in coverage}
        missing_maps = sorted(map_ids - covered_maps)
        if missing_maps:
            audit.error(
                "evidence.runtimeScreenshots",
                f"does not cover manifest maps {missing_maps!r}",
            )
        covered_modes = {mode for _map_id, mode in coverage}
        for required_mode in ("idle", "moving"):
            if required_mode not in covered_modes:
                audit.error(
                    "evidence.runtimeScreenshots",
                    f"requires at least one {required_mode} capture",
                )

    for key in ("computerUseReport", "collisionAudit", "performanceReport"):
        report_ref = evidence.get(key)
        nested_evidence = validate_report(
            audit,
            evidence,
            key,
            bundle_id,
            map_ids,
            (
                catalog_contract_ref.get("sha256")
                if isinstance(catalog_contract_ref, dict)
                else None
            ),
            catalog_contract_hashes,
            runtime_capture_pairs,
            map_id_order=map_id_order,
            required=frozen_required,
            release_frozen=frozen_required,
        )
        frozen_files.update(nested_evidence)
        if report_ref is not None:
            remember_file_ref(report_ref)

    owner_ref = evidence.get("ownerAcceptance")
    owner_required = owner_status == "approved" or frozen_required
    if owner_ref is None:
        if owner_required:
            audit.error("evidence.ownerAcceptance", "is required after owner approval")
    else:
        if owner_status != "approved":
            audit.error(
                "evidence.ownerAcceptance",
                "must be null until ownerReviewStatus is approved",
            )
        record = audit.validate_json_ref(owner_ref, "evidence.ownerAcceptance")
        if not isinstance(record, dict):
            if record is not None:
                audit.error("evidence.ownerAcceptance", "expected a JSON object")
        else:
            if record.get("schemaVersion") != SCHEMA_VERSION:
                audit.error(
                    "evidence.ownerAcceptance.schemaVersion",
                    f"must equal {SCHEMA_VERSION}",
                )
            if bundle_id is not None and record.get("bundleId") != bundle_id:
                audit.error("evidence.ownerAcceptance.bundleId", "must match manifest bundleId")
            if record.get("approved") is not True:
                audit.error("evidence.ownerAcceptance.approved", "must be true")
            if record.get("manifestReviewSubjectSha256") != manifest_subject_hash:
                audit.error(
                    "evidence.ownerAcceptance.manifestReviewSubjectSha256",
                    "must match the canonical manifest review-subject digest",
                )
            if not isinstance(record.get("reviewer"), str) or not record["reviewer"].strip():
                audit.error("evidence.ownerAcceptance.reviewer", "expected a non-empty string")
            _validate_timezone_aware_timestamp(
                audit,
                record.get("reviewedAt"),
                "evidence.ownerAcceptance.reviewedAt",
                require_utc=False,
            )
            accepted = record.get("acceptedFiles")
            accepted_files: set[tuple[str, str]] = set()
            if not isinstance(accepted, list) or not accepted:
                audit.error(
                    "evidence.ownerAcceptance.acceptedFiles",
                    "expected a non-empty array of frozen path/SHA references",
                )
            else:
                for index, accepted_ref in enumerate(accepted):
                    accepted_field = f"evidence.ownerAcceptance.acceptedFiles[{index}]"
                    audit.validate_file_ref(accepted_ref, accepted_field)
                    if not isinstance(accepted_ref, dict):
                        continue
                    path = accepted_ref.get("path")
                    digest = accepted_ref.get("sha256")
                    if isinstance(path, str) and isinstance(digest, str):
                        key = (path, digest)
                        if key in accepted_files:
                            audit.error(accepted_field, "duplicates another accepted file")
                        accepted_files.add(key)
            if frozen_required:
                missing = sorted(frozen_files - accepted_files)
                extra = sorted(accepted_files - frozen_files)
                if missing:
                    audit.error(
                        "evidence.ownerAcceptance.acceptedFiles",
                        f"does not cover frozen evidence {missing!r}",
                    )
                if extra:
                    audit.error(
                        "evidence.ownerAcceptance.acceptedFiles",
                        f"contains files outside the frozen evidence set {extra!r}",
                    )


def _read_referenced_json_for_readiness(audit: Audit, value: Any) -> dict[str, Any] | None:
    if not isinstance(value, dict):
        return None
    path_value = value.get("path")
    if not isinstance(path_value, str) or not path_value:
        return None
    relative = Path(path_value)
    if relative.is_absolute() or ".." in relative.parts:
        return None
    candidate = audit.root.joinpath(relative)
    try:
        resolved = candidate.resolve(strict=True)
        resolved.relative_to(audit.root.resolve())
        parsed = json.loads(resolved.read_text(encoding="utf-8"))
    except (FileNotFoundError, OSError, UnicodeDecodeError, json.JSONDecodeError, ValueError):
        return None
    return parsed if isinstance(parsed, dict) else None


def runtime_screenshot_coverage_complete(
    concrete_pair_count: int,
    coverage: set[tuple[str, str]],
    map_ids: set[str],
) -> bool:
    covered_maps = {map_id for map_id, _mode in coverage}
    covered_modes = {mode for _map_id, mode in coverage}
    return (
        concrete_pair_count >= 3
        and covered_maps == map_ids
        and {"idle", "moving"}.issubset(covered_modes)
    )


def duplicate_runtime_screenshot_hashes(
    screenshots: Any,
) -> set[tuple[str, str]]:
    if not isinstance(screenshots, list):
        return set()
    seen: set[tuple[str, str]] = set()
    duplicates: set[tuple[str, str]] = set()
    for screenshot in screenshots:
        if not isinstance(screenshot, dict):
            continue
        map_id = screenshot.get("mapId")
        image = screenshot.get("image")
        digest = image.get("sha256") if isinstance(image, dict) else None
        if not isinstance(map_id, str) or not isinstance(digest, str):
            continue
        key = (map_id, digest)
        if key in seen:
            duplicates.add(key)
        seen.add(key)
    return duplicates


def evaluate_release_readiness(
    audit: Audit,
    manifest: dict[str, Any],
    map_ids: set[str],
) -> None:
    missing: list[str] = []
    if not (
        manifest.get("status") == "released"
        and manifest.get("ownerReviewStatus") == "approved"
        and manifest.get("releaseApproved") is True
        and manifest.get("runtimeEnabled") is True
    ):
        missing.append("lifecycle_released_and_enabled")
    if not audit.release_attestation_valid:
        missing.append("release_attestation")

    evidence = manifest.get("evidence")
    if not isinstance(evidence, dict):
        missing.extend(
            [
                "owner_acceptance",
                "dressed_reference",
                "layered_preview",
                "computer_use_report",
                "runtime_screenshot_coverage",
            ]
        )
    else:
        if evidence.get("ownerAcceptance") is None:
            missing.append("owner_acceptance")
        if evidence.get("dressedReference") is None:
            missing.append("dressed_reference")
        if evidence.get("layeredPreview") is None:
            missing.append("layered_preview")
        if evidence.get("computerUseReport") is None:
            missing.append("computer_use_report")

        screenshots = evidence.get("runtimeScreenshots")
        coverage: set[tuple[str, str]] = set()
        concrete_pairs: set[
            tuple[str, tuple[str, str], tuple[str, str]]
        ] = set()
        if isinstance(screenshots, list):
            for screenshot in screenshots:
                if not isinstance(screenshot, dict):
                    continue
                map_id = screenshot.get("mapId")
                mode = screenshot.get("mode")
                if map_id in map_ids and mode in VALID_SCREENSHOT_MODES:
                    coverage.add((map_id, mode))
                    image_key = file_ref_key(screenshot.get("image"))
                    capture_key = file_ref_key(screenshot.get("captureReport"))
                    if image_key is not None and capture_key is not None:
                        concrete_pairs.add((map_id, image_key, capture_key))
        if not runtime_screenshot_coverage_complete(
            len(concrete_pairs),
            coverage,
            map_ids,
        ):
            missing.append("runtime_screenshot_coverage")

        for key in ("computerUseReport", "collisionAudit", "performanceReport"):
            report = _read_referenced_json_for_readiness(audit, evidence.get(key))
            if report is None:
                if key != "computerUseReport" or evidence.get(key) is not None:
                    missing.append(f"{key}.valid_report")
                continue
            excluded_gate = report.get("excludedReleaseGate")
            if isinstance(excluded_gate, str) and excluded_gate.strip():
                missing.append(f"{key}.excluded_release_gate")
            blockers = report.get("blockers")
            if isinstance(blockers, list) and blockers:
                missing.append(f"{key}.blockers")

    if audit.errors:
        missing.append("structural_validation")
    missing.extend(audit.provenance_release_gates)
    missing.extend(audit.report_release_gates)
    audit.missing_release_gates = sorted(set(missing))
    audit.release_ready = not audit.errors and not audit.missing_release_gates
    if audit.missing_release_gates:
        audit.warning(
            "releaseReadiness",
            "not release-ready; unresolved gates: "
            + ", ".join(audit.missing_release_gates),
        )


def audit_manifest(manifest_path: Path) -> Audit:
    root = manifest_path.parent.resolve()
    audit = Audit(manifest_path=manifest_path.resolve(), root=root)
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        audit.error("manifest", f"cannot be parsed ({exc})")
        return audit
    if not isinstance(manifest, dict):
        audit.error("manifest", "expected a JSON object")
        return audit
    scan_forbidden_flags(audit, manifest, "manifest")

    if manifest.get("schemaVersion") != SCHEMA_VERSION:
        audit.error("schemaVersion", f"must equal {SCHEMA_VERSION}")
    bundle_id = validate_id(audit, manifest.get("bundleId"), "bundleId")
    audit.bundle_id = bundle_id
    map_style_id = validate_id(audit, manifest.get("mapStyleId"), "mapStyleId")
    map_ids = set(validate_unique_ids(audit, manifest.get("mapIds"), "mapIds"))
    if manifest.get("tileSize") != TILE_SIZE:
        audit.error("tileSize", f"must equal {TILE_SIZE!r}")

    status = manifest.get("status")
    owner_status = manifest.get("ownerReviewStatus")
    release_approved = manifest.get("releaseApproved")
    runtime_enabled = manifest.get("runtimeEnabled")
    if status not in VALID_STATUSES:
        audit.error("status", f"expected one of {sorted(VALID_STATUSES)!r}")
    if owner_status not in VALID_OWNER_REVIEW_STATUSES:
        audit.error(
            "ownerReviewStatus",
            f"expected one of {sorted(VALID_OWNER_REVIEW_STATUSES)!r}",
        )
    if not isinstance(release_approved, bool):
        audit.error("releaseApproved", "expected a boolean")
    if not isinstance(runtime_enabled, bool):
        audit.error("runtimeEnabled", "expected a boolean")
    if owner_status != "approved" and release_approved is not False:
        audit.error("releaseApproved", "must be false until owner review is approved")
    if owner_status != "approved" and runtime_enabled is not False:
        audit.error("runtimeEnabled", "must be false until owner review is approved")
    if runtime_enabled is True and release_approved is not True:
        audit.error("runtimeEnabled", "requires releaseApproved=true")
    if status != "released" and release_approved is not False:
        audit.error("releaseApproved", "must remain false until status is released")
    if status != "released" and runtime_enabled is not False:
        audit.error("runtimeEnabled", "must remain false until status is released")
    if status in {"approved", "released"} and owner_status != "approved":
        audit.error("ownerReviewStatus", f"must be approved for status {status}")
    if owner_status == "approved" and status not in {"approved", "released"}:
        audit.error("status", "owner approval requires approved or released status")
    if status == "released" and (release_approved is not True or runtime_enabled is not True):
        audit.error("status", "released requires both release flags true")
    if status in {"in_production", "owner_review_pending"} and owner_status != "pending":
        audit.error("ownerReviewStatus", f"must be pending for {status} status")
    if owner_status == "rejected" and status != "rejected":
        audit.error("status", "must be rejected when owner review is rejected")
    if status == "rejected" and owner_status != "rejected":
        audit.error("ownerReviewStatus", "must be rejected for rejected status")

    atlas_ref = manifest.get("groundAtlas")
    atlas_info = audit.validate_png_ref(atlas_ref, "groundAtlas", required_alpha_mode="mixed")
    runtime_assets: dict[str, str] = {}
    if isinstance(atlas_ref, dict):
        path = atlas_ref.get("path")
        digest = atlas_ref.get("sha256")
        if isinstance(path, str) and isinstance(digest, str):
            runtime_assets[path] = digest

    tile_ids = validate_tiles(audit, manifest.get("tiles"), atlas_info)
    object_ids, object_assets, collision_roles = validate_objects(
        audit,
        manifest.get("objects"),
    )
    for path, digest in object_assets.items():
        if path in runtime_assets:
            audit.error("objects", f"runtime path {path!r} is already used by another asset")
        runtime_assets[path] = digest

    review_subject_files: set[tuple[str, str]] = set(runtime_assets.items())
    review_subject_files.update(
        validate_source(audit, manifest.get("source"), bundle_id, runtime_assets)
    )
    binding_hashes, binding_review_files = validate_bindings(
        audit,
        manifest.get("mapBindings"),
        bundle_id,
        map_ids,
        tile_ids,
        object_ids,
        collision_roles,
    )
    review_subject_files.update(binding_review_files)
    frozen_required = owner_status == "approved" or status in {"approved", "released"}
    release_attestation_key = validate_release_attestation(
        audit,
        manifest,
        required=frozen_required,
    )
    if release_attestation_key is not None:
        review_subject_files.add(release_attestation_key)
    catalog_contract_ref = manifest.get("catalogContractCheck")
    catalog_contract_key = file_ref_key(catalog_contract_ref)
    if catalog_contract_key is not None:
        review_subject_files.add(catalog_contract_key)
    catalog_contract_hashes = validate_catalog_contract_check(
        audit,
        catalog_contract_ref,
        bundle_id,
        map_ids,
        binding_hashes,
        manifest,
    )

    if frozen_required and audit.provenance_release_gates:
        audit.error(
            "source.provenance.reproducibility",
            "unresolved formal-release gates: "
            + ", ".join(sorted(audit.provenance_release_gates)),
        )
    validate_evidence(
        audit,
        manifest.get("evidence"),
        bundle_id,
        map_style_id,
        manifest_review_subject_sha256(manifest),
        map_ids,
        (
            list(manifest.get("mapIds", []))
            if isinstance(manifest.get("mapIds"), list)
            and all(is_id(item) for item in manifest.get("mapIds", []))
            else sorted(map_ids)
        ),
        owner_status,
        frozen_required,
        review_subject_files,
        catalog_contract_ref,
        catalog_contract_hashes,
    )
    evaluate_release_readiness(audit, manifest, map_ids)
    return audit


def resolve_manifest(argument: str) -> Path:
    candidate = Path(argument).expanduser()
    if candidate.is_dir():
        candidate = candidate / MANIFEST_NAME
    return candidate.resolve()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Read-only audit of a Beastbound map visual bundle"
    )
    parser.add_argument(
        "bundle",
        help=f"bundle directory or explicit {MANIFEST_NAME} path",
    )
    args = parser.parse_args(argv)
    manifest_path = resolve_manifest(args.bundle)
    if not manifest_path.is_file():
        result = {
            "status": "FAIL",
            "releaseReady": False,
            "missingReleaseGates": ["manifest"],
            "manifest": str(manifest_path),
            "bundleId": None,
            "filesChecked": 0,
            "pngsChecked": 0,
            "jsonsChecked": 0,
            "errors": [f"manifest: file not found: {manifest_path}"],
            "warnings": [],
        }
        print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
        return 1

    audit = audit_manifest(manifest_path)
    result = {
        "status": "PASS" if not audit.errors else "FAIL",
        "releaseReady": audit.release_ready,
        "missingReleaseGates": audit.missing_release_gates,
        "manifest": str(audit.manifest_path),
        "bundleId": audit.bundle_id,
        "filesChecked": len(audit.files_checked),
        "pngsChecked": len(audit.pngs_checked),
        "jsonsChecked": len(audit.jsons_checked),
        "errors": audit.errors,
        "warnings": audit.warnings,
    }
    print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
    return 0 if not audit.errors else 1


if __name__ == "__main__":
    sys.exit(main())
