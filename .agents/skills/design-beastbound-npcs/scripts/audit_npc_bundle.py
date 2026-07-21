#!/usr/bin/env python3
"""Read-only structural, provenance and pixel audit for Beastbound NPC bundles.

The auditor uses only the Python standard library. It decodes non-interlaced,
8-bit PNG files so dimensions, mask-bounded mutation, transparency, duplicate
and exact-mirror checks operate on decoded pixels instead of container bytes.
It also verifies the frozen identity, prompts, generation/ownership ledgers,
pipeline script/dependency lock and the complete non-metadata output hash set.
Its boundary is the immutable production bundle: external action-bundle install
metadata, catalog paths and installed copies belong to the installer/Godot gate.
"""

from __future__ import annotations

import argparse
import binascii
import datetime as dt
import hashlib
import importlib.util
import json
import math
import os
import re
import shutil
import struct
import sys
import tempfile
import zlib
from collections import deque
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Sequence, Tuple


PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
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
HORIZONTAL_MIRROR_PAIRS = (
    ("west", "east"),
    ("southwest", "southeast"),
    ("northwest", "northeast"),
)
VERTICAL_MIRROR_PAIRS = (("south", "north"),)
VALID_REVIEW_STATES = {"planned", "in_production", "owner_review_pending", "approved"}
ID_RE = re.compile(r"^[a-z0-9][a-z0-9_-]*$")
REQUESTED_BACKGROUND = "#FF00FF"
CHROMA_OPERATION = "recorded_border_connected_chroma_v1"
TRANSPARENT_OPERATION = "genuine_transparent_alpha_preservation_v1"
MASK_REVIEW_OPERATION = "reviewed_chroma_components_v3_1"
MASK_REVIEW_METHOD = "visual-inspection"
ENCLOSED_COMPONENT_TYPE = "enclosed-chroma"
FRINGE_COMPONENT_TYPE = "adjacent-chroma-fringe"
OUTER_BACKGROUND_COMPONENT_TYPE = "reviewed-outer-background-hole"
RESIDUAL_KEY_COMPONENT_TYPE = "residual-key-color-candidate"
RESIDUAL_KEY_REPAIR_DECISION = "repair-key-spill"
RESIDUAL_KEY_RETAIN_DECISION = "retain-authored-color"
MASK_REVIEW_COMPONENT_TYPES = (
    ENCLOSED_COMPONENT_TYPE,
    FRINGE_COMPONENT_TYPE,
    OUTER_BACKGROUND_COMPONENT_TYPE,
    RESIDUAL_KEY_COMPONENT_TYPE,
)
MASK_REVIEW_DECISIONS = (
    "background-hole",
    "background-fringe",
    "retain-subject",
    RESIDUAL_KEY_REPAIR_DECISION,
    RESIDUAL_KEY_RETAIN_DECISION,
)
SOURCE_MODE_AUTO = "auto"
SOURCE_MODE_OPAQUE_CHROMA = "opaque-chroma"
SOURCE_MODE_GENUINE_TRANSPARENT = "genuine-transparent"
RESOLVED_SOURCE_MODES = (
    SOURCE_MODE_OPAQUE_CHROMA,
    SOURCE_MODE_GENUINE_TRANSPARENT,
)
REQUESTED_SOURCE_MODES = (SOURCE_MODE_AUTO, *RESOLVED_SOURCE_MODES)
BUILDER_TOOL = "build_npc_art_bundle.py"
BUILDER_VERSION = "3.1.0"
WORLD_EDGE_POLICY = "all-edges-safe-v1"
PORTRAIT_EDGE_POLICY = "portrait-bust-crop-v1"
PORTRAIT_INNER_CROP_MIN_Y_RATIO = 0.65
EDGE_NAMES = ("top", "bottom", "left", "right")
CANONICAL_PORTRAITS = ("neutral", "speaking", "smile", "concerned")
NEAR_VISUAL_DISTANCE_LIMIT = 0.007
CHROMA_BORDER_MIN_CHANNEL = 128
CHROMA_BORDER_MIN_DOMINANCE = 64
CHROMA_BORDER_MAX_RED_BLUE_DELTA = 96
CHROMA_MIN_CHANNEL_SLACK = 8
CHROMA_MIN_DOMINANCE_SLACK = 8
CHROMA_MAX_RED_BLUE_DELTA_SLACK = 8
CHROMA_CONNECTIVITY = 4
ALPHA_COMPONENT_CONNECTIVITY = 8
MIN_DETACHED_ALPHA_COMPONENT_PIXELS = 8
MAX_ALPHA_POSITIVE_COMPONENTS = 8
SOFT_MATTE_REFERENCE_SHA256 = (
    "3f7b9b14ad5c90f37618bc1c16a039a2076abca12ddc41b3ae470e2b1cad6c0e"
)
SOFT_MATTE_ALGORITHM = "imagegen-soft-matte-bounded-v1"
SOFT_MATTE_TRANSPARENT_THRESHOLD = 12.0
SOFT_MATTE_OPAQUE_THRESHOLD = 220.0
SOFT_MATTE_KEY_DOMINANCE_THRESHOLD = 16.0
SOFT_MATTE_ALPHA_NOISE_FLOOR = 8
SOFT_MATTE_DESPILL_ALPHA_RANGE = [1, 251]
SOFT_MATTE_NEAR_OPAQUE_UNTOUCHED_ALPHA_RANGE = [252, 255]
FRINGE_MAX_DISTANCE = 3
FRINGE_REVIEW_GROUPING = "gap-bridged-8-v1"
RESIDUAL_KEY_REVIEW_GROUPING = "connected-4-v1"
LARGE_ENCLOSED_COMPONENT_REVIEW_THRESHOLD = 1024
DETACHED_FOREGROUND_OPERATION = "static_detached_foreground_v1"
DETACHED_FOREGROUND_CONNECTIVITY = 4
DETACHED_FOREGROUND_ALPHA_THRESHOLD = 16
DETACHED_FOREGROUND_PIXEL_THRESHOLD = 128
MIN_BACKGROUND_RATIO = 0.08
MAX_BACKGROUND_RATIO = 0.94
PREMULTIPLIED_RESAMPLE = "premultiplied_alpha_bilinear"


class PngDecodeError(ValueError):
    """Raised when a PNG is unsupported or malformed."""


@dataclass(frozen=True)
class PngImage:
    width: int
    height: int
    rgba: bytes

    @property
    def rgba_sha256(self) -> str:
        """Full decoded RGBA bytes without a dimensions prefix."""

        return hashlib.sha256(self.rgba).hexdigest()

    @property
    def canonical_rgba_sha256(self) -> str:
        """Legacy/full decoded RGBA hash with the canonical dimensions prefix."""

        digest = hashlib.sha256()
        digest.update(f"{self.width}x{self.height}:RGBA\n".encode("ascii"))
        digest.update(self.rgba)
        return digest.hexdigest()

    @property
    def godot_canonical_rgba_sha256(self) -> str:
        """Godot parity hash: zero RGB anywhere alpha is not fully opaque."""

        canonical = bytearray(self.rgba)
        for offset in range(0, len(canonical), 4):
            if canonical[offset + 3] < 255:
                canonical[offset : offset + 3] = b"\x00\x00\x00"
        digest = hashlib.sha256()
        digest.update(f"{self.width}x{self.height}:RGBA\n".encode("ascii"))
        digest.update(canonical)
        return digest.hexdigest()

    def horizontal_mirror_sha256(self) -> str:
        row_bytes = self.width * 4
        mirrored = bytearray(len(self.rgba))
        for y in range(self.height):
            row = self.rgba[y * row_bytes : (y + 1) * row_bytes]
            out = bytearray(row_bytes)
            for x in range(self.width):
                source = x * 4
                target = (self.width - 1 - x) * 4
                out[target : target + 4] = row[source : source + 4]
            mirrored[y * row_bytes : (y + 1) * row_bytes] = out
        return hashlib.sha256(mirrored).hexdigest()

    def vertical_mirror_sha256(self) -> str:
        row_bytes = self.width * 4
        mirrored = bytearray(len(self.rgba))
        for y in range(self.height):
            source = y * row_bytes
            target = (self.height - 1 - y) * row_bytes
            mirrored[target : target + row_bytes] = self.rgba[source : source + row_bytes]
        return hashlib.sha256(mirrored).hexdigest()


@dataclass
class AuditResult:
    errors: List[str]
    warnings: List[str]
    world_frames: int = 0
    portrait_frames: int = 0

    @property
    def ok(self) -> bool:
        return not self.errors


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


def _read_chunks(data: bytes) -> Iterable[Tuple[bytes, bytes]]:
    offset = len(PNG_SIGNATURE)
    while offset < len(data):
        if offset + 12 > len(data):
            raise PngDecodeError("truncated PNG chunk")
        length = struct.unpack(">I", data[offset : offset + 4])[0]
        chunk_type = data[offset + 4 : offset + 8]
        payload_start = offset + 8
        payload_end = payload_start + length
        crc_end = payload_end + 4
        if crc_end > len(data):
            raise PngDecodeError(f"truncated {chunk_type!r} chunk")
        payload = data[payload_start:payload_end]
        expected_crc = struct.unpack(">I", data[payload_end:crc_end])[0]
        actual_crc = binascii.crc32(chunk_type + payload) & 0xFFFFFFFF
        if expected_crc != actual_crc:
            raise PngDecodeError(f"CRC mismatch in {chunk_type.decode('ascii', errors='replace')}")
        yield chunk_type, payload
        offset = crc_end
        if chunk_type == b"IEND":
            if offset != len(data):
                raise PngDecodeError("trailing bytes after IEND")
            return
    raise PngDecodeError("missing IEND chunk")


def decode_png(path: Path) -> PngImage:
    data = path.read_bytes()
    if not data.startswith(PNG_SIGNATURE):
        raise PngDecodeError("invalid PNG signature")

    width = height = bit_depth = color_type = None
    compression = filter_method = interlace = None
    palette: bytes | None = None
    transparency: bytes | None = None
    compressed = bytearray()
    saw_iend = False

    for chunk_type, payload in _read_chunks(data):
        if chunk_type == b"IHDR":
            if len(payload) != 13 or width is not None:
                raise PngDecodeError("invalid or duplicate IHDR")
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
        elif chunk_type == b"IEND":
            saw_iend = True

    if not saw_iend or width is None or height is None:
        raise PngDecodeError("missing required PNG chunks")
    if width <= 0 or height <= 0:
        raise PngDecodeError("invalid zero PNG dimension")
    if bit_depth != 8:
        raise PngDecodeError(f"unsupported bit depth {bit_depth}; expected 8")
    if compression != 0 or filter_method != 0 or interlace != 0:
        raise PngDecodeError("only standard compression/filter and non-interlaced PNGs are supported")

    channels_by_type = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}
    if color_type not in channels_by_type:
        raise PngDecodeError(f"unsupported PNG color type {color_type}")
    channels = channels_by_type[color_type]
    scanline_bytes = width * channels

    try:
        inflated = zlib.decompress(bytes(compressed))
    except zlib.error as exc:
        raise PngDecodeError(f"invalid IDAT stream: {exc}") from exc
    expected_length = height * (scanline_bytes + 1)
    if len(inflated) != expected_length:
        raise PngDecodeError(
            f"unexpected decompressed length {len(inflated)}; expected {expected_length}"
        )

    rows: List[bytes] = []
    previous = bytes(scanline_bytes)
    cursor = 0
    for _ in range(height):
        filter_type = inflated[cursor]
        cursor += 1
        encoded = inflated[cursor : cursor + scanline_bytes]
        cursor += scanline_bytes
        decoded = bytearray(scanline_bytes)
        for index, value in enumerate(encoded):
            left = decoded[index - channels] if index >= channels else 0
            up = previous[index]
            upper_left = previous[index - channels] if index >= channels else 0
            if filter_type == 0:
                reconstructed = value
            elif filter_type == 1:
                reconstructed = value + left
            elif filter_type == 2:
                reconstructed = value + up
            elif filter_type == 3:
                reconstructed = value + ((left + up) // 2)
            elif filter_type == 4:
                reconstructed = value + _paeth(left, up, upper_left)
            else:
                raise PngDecodeError(f"unsupported PNG filter {filter_type}")
            decoded[index] = reconstructed & 0xFF
        rows.append(bytes(decoded))
        previous = bytes(decoded)

    rgba = bytearray(width * height * 4)
    output = 0
    transparent_gray = struct.unpack(">H", transparency)[0] if color_type == 0 and transparency and len(transparency) == 2 else None
    transparent_rgb = struct.unpack(">HHH", transparency) if color_type == 2 and transparency and len(transparency) == 6 else None

    for row in rows:
        for x in range(width):
            source = x * channels
            if color_type == 6:
                red, green, blue, alpha = row[source : source + 4]
            elif color_type == 4:
                gray, alpha = row[source : source + 2]
                red = green = blue = gray
            elif color_type == 2:
                red, green, blue = row[source : source + 3]
                alpha = 0 if transparent_rgb == (red, green, blue) else 255
            elif color_type == 0:
                gray = row[source]
                red = green = blue = gray
                alpha = 0 if transparent_gray == gray else 255
            else:
                if palette is None or len(palette) % 3 != 0:
                    raise PngDecodeError("indexed PNG missing valid PLTE")
                palette_index = row[source]
                palette_offset = palette_index * 3
                if palette_offset + 3 > len(palette):
                    raise PngDecodeError("palette index out of range")
                red, green, blue = palette[palette_offset : palette_offset + 3]
                alpha = transparency[palette_index] if transparency and palette_index < len(transparency) else 255
            rgba[output : output + 4] = bytes((red, green, blue, alpha))
            output += 4

    return PngImage(width=width, height=height, rgba=bytes(rgba))


def _load_json(path: Path, label: str, errors: List[str]) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        errors.append(f"missing {label}: {path}")
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        errors.append(f"invalid {label} {path}: {exc}")
    return None


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _canonical_mask_sha256(image: PngImage) -> str | None:
    values = bytearray(image.width * image.height)
    output = 0
    for index in range(0, len(image.rgba), 4):
        red, green, blue, alpha = image.rgba[index : index + 4]
        if alpha != 255 or red != green or green != blue or red not in (0, 255):
            return None
        values[output] = red
        output += 1
    digest = hashlib.sha256()
    digest.update(f"{image.width}x{image.height}:L\n".encode("ascii"))
    digest.update(values)
    return digest.hexdigest()


def _binary_mask_hash(width: int, height: int, values: Sequence[bool]) -> str:
    digest = hashlib.sha256()
    digest.update(f"{width}x{height}:L\n".encode("ascii"))
    digest.update(bytes(255 if value else 0 for value in values))
    return digest.hexdigest()


def _mask_values(image: PngImage) -> List[bool] | None:
    values: List[bool] = []
    for index in range(0, len(image.rgba), 4):
        red, green, blue, alpha = image.rgba[index : index + 4]
        if alpha != 255 or red != green or green != blue or red not in (0, 255):
            return None
        values.append(red == 255)
    return values


def _component_hash(width: int, height: int, component: Sequence[bool]) -> str:
    digest = hashlib.sha256()
    digest.update(f"{width}x{height}:binary-component-4\n".encode("ascii"))
    digest.update(bytes(1 if value else 0 for value in component))
    return digest.hexdigest()


def _component_bbox(
    width: int, height: int, component: Sequence[bool]
) -> List[int]:
    points = [index for index, value in enumerate(component) if value]
    if not points:
        raise ValueError("empty component")
    xs = [index % width for index in points]
    ys = [index // width for index in points]
    return [min(xs), min(ys), max(xs) + 1, max(ys) + 1]


def _static_detached_foreground_report(
    image: PngImage, stage: str
) -> Dict[str, Any]:
    """Independently replay the builder's static foreground-island gate."""

    foreground = [
        alpha >= DETACHED_FOREGROUND_ALPHA_THRESHOLD
        for alpha in image.rgba[3::4]
    ]
    components = _connected_components(
        foreground,
        image.width,
        image.height,
        connectivity=DETACHED_FOREGROUND_CONNECTIVITY,
    )
    descriptors = [
        {
            "componentPixelSha256": _component_hash(
                image.width, image.height, component
            ),
            "bbox": _component_bbox(image.width, image.height, component),
            "pixelCount": sum(component),
        }
        for component in components
    ]
    principal_index = (
        max(
            range(len(descriptors)),
            key=lambda index: (descriptors[index]["pixelCount"], -index),
        )
        if descriptors
        else None
    )
    detached = [
        descriptor
        for index, descriptor in enumerate(descriptors)
        if index != principal_index
    ]
    blocking = [
        descriptor
        for descriptor in detached
        if descriptor["pixelCount"] >= DETACHED_FOREGROUND_PIXEL_THRESHOLD
    ]
    return {
        "operation": DETACHED_FOREGROUND_OPERATION,
        "stage": stage,
        "connectivity": DETACHED_FOREGROUND_CONNECTIVITY,
        "alphaThresholdInclusive": DETACHED_FOREGROUND_ALPHA_THRESHOLD,
        "minimumBlockingDetachedPixelCount": DETACHED_FOREGROUND_PIXEL_THRESHOLD,
        "alphaQualifiedComponentCount": len(descriptors),
        "principalComponent": (
            descriptors[principal_index] if principal_index is not None else None
        ),
        "detachedComponentCount": len(detached),
        "largestDetachedComponentPixelCount": max(
            (descriptor["pixelCount"] for descriptor in detached), default=0
        ),
        "blockingComponents": blocking,
        "automaticDeletionApplied": False,
    }


def _connected_components(
    values: Sequence[bool], width: int, height: int, connectivity: int = 4
) -> List[List[bool]]:
    if connectivity not in (4, 8):
        raise ValueError("component connectivity must be 4 or 8")
    visited = [False] * (width * height)
    components: List[List[bool]] = []
    for start in range(width * height):
        if not values[start] or visited[start]:
            continue
        component = [False] * (width * height)
        component[start] = True
        visited[start] = True
        pending = deque([start])
        while pending:
            index = pending.popleft()
            y, x = divmod(index, width)
            neighbours = [(y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)]
            if connectivity == 8:
                neighbours.extend(
                    (
                        (y - 1, x - 1),
                        (y - 1, x + 1),
                        (y + 1, x - 1),
                        (y + 1, x + 1),
                    )
                )
            for next_y, next_x in neighbours:
                if 0 <= next_y < height and 0 <= next_x < width:
                    next_index = next_y * width + next_x
                    if values[next_index] and not visited[next_index]:
                        visited[next_index] = True
                        component[next_index] = True
                        pending.append(next_index)
        components.append(component)
    return components


def _adjacent_four(values: Sequence[bool], width: int, height: int) -> List[bool]:
    adjacent = [False] * (width * height)
    for index, value in enumerate(values):
        if not value:
            continue
        y, x = divmod(index, width)
        for next_y, next_x in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if 0 <= next_y < height and 0 <= next_x < width:
                adjacent[next_y * width + next_x] = True
    return adjacent


def _within_four_neighbour_distance(
    values: Sequence[bool], width: int, height: int, distance: int
) -> List[bool]:
    if distance < 0:
        raise ValueError("four-neighbour distance cannot be negative")
    reached = list(values)
    for _ in range(distance):
        adjacent = _adjacent_four(reached, width, height)
        reached = [value or neighbour for value, neighbour in zip(reached, adjacent)]
    return reached


def _dilate_eight(values: Sequence[bool], width: int, height: int) -> List[bool]:
    output = [False] * (width * height)
    for index, value in enumerate(values):
        if not value:
            continue
        y, x = divmod(index, width)
        for next_y in range(max(0, y - 1), min(height, y + 2)):
            for next_x in range(max(0, x - 1), min(width, x + 2)):
                output[next_y * width + next_x] = True
    return output


def _group_fringe_components(
    values: Sequence[bool], width: int, height: int
) -> List[List[bool]]:
    if not any(values):
        return []
    joined = _dilate_eight(values, width, height)
    groups: List[List[bool]] = []
    for region in _connected_components(joined, width, height, connectivity=8):
        original = [member and value for member, value in zip(region, values)]
        if any(original):
            groups.append(original)
    return groups


def _median_channel(values: Sequence[int]) -> float:
    ordered = sorted(values)
    middle = len(ordered) // 2
    if len(ordered) % 2:
        return float(ordered[middle])
    return (ordered[middle - 1] + ordered[middle]) / 2.0


def _soft_matte_proposal(
    image: PngImage,
    border: Sequence[Tuple[int, int, int]],
    automatic: Sequence[bool],
) -> Dict[str, Any]:
    width, height = image.width, image.height
    key = tuple(
        int(round(_median_channel([pixel[channel] for pixel in border])))
        for channel in range(3)
    )
    proposed = bytearray(image.rgba)
    changed = [False] * (width * height)
    proposed_alpha_values = [255] * (width * height)
    for pixel_index, offset in enumerate(range(0, len(image.rgba), 4)):
        red, green, blue, _ = image.rgba[offset : offset + 4]
        distance = max(abs(red - key[0]), abs(green - key[1]), abs(blue - key[2]))
        dominance = min(red, blue) - green
        key_like = distance <= 32 or dominance >= SOFT_MATTE_KEY_DOMINANCE_THRESHOLD
        ratio = max(
            0.0,
            min(
                1.0,
                (float(distance) - SOFT_MATTE_TRANSPARENT_THRESHOLD)
                / (SOFT_MATTE_OPAQUE_THRESHOLD - SOFT_MATTE_TRANSPARENT_THRESHOLD),
            ),
        )
        smooth = ratio * ratio * (3.0 - 2.0 * ratio)
        distance_alpha = int(round(smooth * 255.0))
        denominator = max(1.0, float(max(key)) - float(green))
        dominance_ratio = max(0.0, min(1.0, float(dominance) / denominator))
        dominance_alpha = int(round((1.0 - dominance_ratio) * 255.0))
        proposed_alpha = min(distance_alpha, dominance_alpha) if key_like else 255
        if 0 < proposed_alpha <= SOFT_MATTE_ALPHA_NOISE_FLOOR:
            proposed_alpha = 0
        proposed_alpha_values[pixel_index] = proposed_alpha
        if proposed_alpha == 0:
            proposed[offset : offset + 4] = b"\x00\x00\x00\x00"
        else:
            proposed[offset + 3] = proposed_alpha
            if 0 < proposed_alpha < 252 and key_like:
                cap = max(0, green - 1)
                proposed[offset] = min(red, cap)
                proposed[offset + 2] = min(blue, cap)
        changed[pixel_index] = (
            not automatic[pixel_index]
            and proposed[offset : offset + 4] != image.rgba[offset : offset + 4]
        )
    within_distance = _within_four_neighbour_distance(
        automatic, width, height, FRINGE_MAX_DISTANCE
    )
    fringe = [
        value and within_distance[index] and not automatic[index]
        for index, value in enumerate(changed)
    ]
    metadata = {
        "algorithm": SOFT_MATTE_ALGORITHM,
        "referenceScriptSha256": SOFT_MATTE_REFERENCE_SHA256,
        "parameters": {
            "autoKey": "policy-safe-edges-median",
            "softMatte": True,
            "transparentThreshold": SOFT_MATTE_TRANSPARENT_THRESHOLD,
            "opaqueThreshold": SOFT_MATTE_OPAQUE_THRESHOLD,
            "keyDominanceThreshold": SOFT_MATTE_KEY_DOMINANCE_THRESHOLD,
            "alphaNoiseFloor": SOFT_MATTE_ALPHA_NOISE_FLOOR,
            "despill": True,
            "despillAlphaInclusiveRange": SOFT_MATTE_DESPILL_ALPHA_RANGE,
            "nearOpaqueRgbUntouchedAlphaInclusiveRange": (
                SOFT_MATTE_NEAR_OPAQUE_UNTOUCHED_ALPHA_RANGE
            ),
            "edgeFeather": 0.0,
            "edgeContract": 0,
            "maximumFourNeighbourDistance": FRINGE_MAX_DISTANCE,
            "largeEnclosedComponentReviewThreshold": (
                LARGE_ENCLOSED_COMPONENT_REVIEW_THRESHOLD
            ),
        },
        "sampledKeyRgb": list(key),
        "globalProposalChangedPixelCount": sum(changed),
        "boundedFringeCandidatePixelCount": sum(fringe),
        "globalProposalApplied": False,
    }
    return {
        "rgba": bytes(proposed),
        "alpha": proposed_alpha_values,
        "changed": changed,
        "fringe": fringe,
        "withinDistance": within_distance,
        "metadata": metadata,
    }


def _chroma_edge_policy(group: str, slot: str | None = None) -> Dict[str, Any]:
    if group == "world":
        return {
            "id": WORLD_EDGE_POLICY,
            "requiredSafeEdges": list(EDGE_NAMES),
            "backgroundSampleEdges": list(EDGE_NAMES),
            "backgroundFloodSeedEdges": list(EDGE_NAMES),
            "allowedSubjectCropEdges": [],
            "innerCropEdge": None,
            "innerCropMinimumYRatio": None,
        }
    if group != "portrait" or slot not in CANONICAL_PORTRAITS:
        raise ValueError(f"unsupported chroma edge-policy context: {group}/{slot}")
    col = CANONICAL_PORTRAITS.index(slot) % 2
    outer = "left" if col == 0 else "right"
    inner = "right" if col == 0 else "left"
    safe_edges = ["top", outer]
    return {
        "id": PORTRAIT_EDGE_POLICY,
        "requiredSafeEdges": safe_edges,
        "backgroundSampleEdges": safe_edges,
        "backgroundFloodSeedEdges": safe_edges,
        "allowedSubjectCropEdges": ["bottom", inner],
        "innerCropEdge": inner,
        "innerCropMinimumYRatio": PORTRAIT_INNER_CROP_MIN_Y_RATIO,
    }


def _edge_indexes(width: int, height: int, edges: Sequence[str]) -> List[int]:
    """Return the ordered sampling multiset, including shared edge corners."""

    indexes: List[int] = []
    for edge in edges:
        if edge == "top":
            indexes.extend(range(width))
        elif edge == "bottom":
            indexes.extend((height - 1) * width + x for x in range(width))
        elif edge == "left":
            # Builder sampling intentionally keeps the full edge multiset,
            # including corner pixels already contributed by top/bottom.
            indexes.extend(y * width for y in range(height))
        elif edge == "right":
            indexes.extend(y * width + width - 1 for y in range(height))
        else:
            raise ValueError(f"unsupported chroma edge: {edge}")
    if not indexes:
        raise ValueError("chroma edge policy has no background samples")
    return indexes


def _flood_seed_indexes(
    width: int, height: int, edges: Sequence[str]
) -> List[int]:
    """Replay builder flood seeds; left/right omit corners already owned by rows."""

    indexes: List[int] = []
    for edge in edges:
        if edge == "top":
            indexes.extend(range(width))
        elif edge == "bottom":
            indexes.extend((height - 1) * width + x for x in range(width))
        elif edge == "left":
            indexes.extend(y * width for y in range(1, height - 1))
        elif edge == "right":
            indexes.extend(y * width + width - 1 for y in range(1, height - 1))
        else:
            raise ValueError(f"unsupported chroma edge: {edge}")
    if not indexes:
        raise ValueError("chroma edge policy has no background flood seeds")
    return indexes


def _classify_raw_chroma(
    image: PngImage, group: str = "world", slot: str | None = None
) -> Dict[str, Any]:
    width, height = image.width, image.height
    if any(image.rgba[offset + 3] != 255 for offset in range(0, len(image.rgba), 4)):
        raise ValueError("raw chroma cell is not fully opaque")
    rgb = [tuple(image.rgba[index : index + 3]) for index in range(0, len(image.rgba), 4)]
    policy = _chroma_edge_policy(group, slot)
    border_indexes = _edge_indexes(
        width, height, policy["backgroundSampleEdges"]
    )
    border = [rgb[index] for index in border_indexes]
    minimum_channels = [min(red, blue) for red, _, blue in border]
    dominance = [min(red, blue) - green for red, green, blue in border]
    red_blue_delta = [abs(red - blue) for red, _, blue in border]
    if any(
        minimum < CHROMA_BORDER_MIN_CHANNEL
        or dominant < CHROMA_BORDER_MIN_DOMINANCE
        or delta > CHROMA_BORDER_MAX_RED_BLUE_DELTA
        for minimum, dominant, delta in zip(
            minimum_channels, dominance, red_blue_delta
        )
    ):
        raise ValueError("raw cell border is not a safe generated magenta backdrop")
    inner_crop_edge = policy["innerCropEdge"]
    inner_crop_minimum = policy["innerCropMinimumYRatio"]
    if inner_crop_edge is not None:
        minimum_y = int(height * inner_crop_minimum)
        x = 0 if inner_crop_edge == "left" else width - 1
        for y in range(minimum_y):
            red, green, blue = rgb[y * width + x]
            minimum = min(red, blue)
            if (
                minimum < CHROMA_BORDER_MIN_CHANNEL
                or minimum - green < CHROMA_BORDER_MIN_DOMINANCE
                or abs(red - blue) > CHROMA_BORDER_MAX_RED_BLUE_DELTA
            ):
                raise ValueError(
                    "portrait subject touches inner seam above allowed crop zone"
                )
    minimum_channel = max(
        CHROMA_BORDER_MIN_CHANNEL,
        min(minimum_channels) - CHROMA_MIN_CHANNEL_SLACK,
    )
    minimum_dominance = max(
        CHROMA_BORDER_MIN_DOMINANCE,
        min(dominance) - CHROMA_MIN_DOMINANCE_SLACK,
    )
    maximum_delta = min(
        CHROMA_BORDER_MAX_RED_BLUE_DELTA,
        max(red_blue_delta) + CHROMA_MAX_RED_BLUE_DELTA_SLACK,
    )
    candidate = [
        min(red, blue) >= minimum_channel
        and min(red, blue) - green >= minimum_dominance
        and abs(red - blue) <= maximum_delta
        for red, green, blue in rgb
    ]
    automatic = [False] * (width * height)
    pending: deque[int] = deque()
    seed_indexes = _flood_seed_indexes(
        width, height, policy["backgroundFloodSeedEdges"]
    )
    for index in seed_indexes:
        if candidate[index] and not automatic[index]:
            automatic[index] = True
            pending.append(index)
    while pending:
        index = pending.popleft()
        y, x = divmod(index, width)
        for next_y, next_x in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if 0 <= next_y < height and 0 <= next_x < width:
                next_index = next_y * width + next_x
                if candidate[next_index] and not automatic[next_index]:
                    automatic[next_index] = True
                    pending.append(next_index)
    automatic_ratio = sum(automatic) / float(width * height)
    if not MIN_BACKGROUND_RATIO <= automatic_ratio <= MAX_BACKGROUND_RATIO:
        raise ValueError(
            f"border-connected background ratio {automatic_ratio:.6f} is outside "
            f"[{MIN_BACKGROUND_RATIO:.2f}, {MAX_BACKGROUND_RATIO:.2f}]"
        )
    enclosed = [value and not automatic[index] for index, value in enumerate(candidate)]
    enclosed_components = _connected_components(enclosed, width, height, connectivity=4)
    soft_matte = _soft_matte_proposal(image, border, automatic)
    fringe_candidate = soft_matte["fringe"]
    fringe_components = _group_fringe_components(fringe_candidate, width, height)

    provisional_zero = [
        automatic[index]
        or enclosed[index]
        or (fringe_candidate[index] and soft_matte["alpha"][index] == 0)
        for index in range(width * height)
    ]
    outer_pool = [
        soft_matte["changed"][index]
        and not candidate[index]
        and not fringe_candidate[index]
        for index in range(width * height)
    ]
    provisional_adjacent = _adjacent_four(provisional_zero, width, height)
    outer_seeds = [
        outer_pool[index] and provisional_adjacent[index]
        for index in range(width * height)
    ]
    outer_background = [False] * (width * height)
    for component in _connected_components(outer_pool, width, height, connectivity=4):
        if any(member and outer_seeds[index] for index, member in enumerate(component)):
            outer_background = [
                existing or member
                for existing, member in zip(outer_background, component)
            ]
    outer_components = _group_fringe_components(outer_background, width, height)
    residual_key_candidate = [
        soft_matte["changed"][index]
        and not automatic[index]
        and not enclosed[index]
        and not fringe_candidate[index]
        and not outer_background[index]
        for index in range(width * height)
    ]
    residual_key_components = _connected_components(
        residual_key_candidate,
        width,
        height,
        connectivity=CHROMA_CONNECTIVITY,
    )
    return {
        "candidate": candidate,
        "automatic": automatic,
        "enclosed": enclosed,
        "components": enclosed_components,
        "enclosedComponents": enclosed_components,
        "fringeCandidate": fringe_candidate,
        "fringeComponents": fringe_components,
        "outerBackgroundCandidate": outer_background,
        "outerBackgroundComponents": outer_components,
        "residualKeyCandidate": residual_key_candidate,
        "residualKeyComponents": residual_key_components,
        "residualKeyMaskPixelSha256": _binary_mask_hash(
            width, height, residual_key_candidate
        ),
        "matteRgba": soft_matte["rgba"],
        "proposalChanged": soft_matte["changed"],
        "withinFringeDistance": soft_matte["withinDistance"],
        "automaticMaskPixelSha256": _binary_mask_hash(width, height, automatic),
        "candidatePixelCount": sum(candidate),
        "automaticEligiblePixelRatio": round(automatic_ratio, 8),
        "edgePolicy": policy["id"],
        "requiredSafeEdges": policy["requiredSafeEdges"],
        "allowedSubjectCropEdges": policy["allowedSubjectCropEdges"],
        "backgroundSampleEdges": policy["backgroundSampleEdges"],
        "backgroundFloodSeedEdges": policy["backgroundFloodSeedEdges"],
        "innerCropMinimumYRatio": policy["innerCropMinimumYRatio"],
        "thresholds": {
            "minimumRedBlueChannel": minimum_channel,
            "minimumMagentaDominance": minimum_dominance,
            "maximumRedBlueDelta": maximum_delta,
            "borderSafetyMinimumRedBlueChannel": CHROMA_BORDER_MIN_CHANNEL,
            "borderSafetyMinimumMagentaDominance": CHROMA_BORDER_MIN_DOMINANCE,
            "borderSafetyMaximumRedBlueDelta": CHROMA_BORDER_MAX_RED_BLUE_DELTA,
        },
        "softMatte": soft_matte["metadata"],
    }


def _decode_png_file(path: Path, label: str, errors: List[str]) -> PngImage | None:
    if not path.is_file():
        errors.append(f"missing {label}: {path}")
        return None
    try:
        return decode_png(path)
    except (OSError, PngDecodeError) as exc:
        errors.append(f"cannot decode {label} {path}: {exc}")
        return None


def _resolve_bundle_path(root: Path, value: Any, label: str, errors: List[str]) -> Path | None:
    if not isinstance(value, str) or not value:
        errors.append(f"{label} must be a non-empty relative path")
        return None
    candidate = Path(value)
    if candidate.is_absolute():
        errors.append(f"{label} must stay inside the bundle: {value}")
        return None
    resolved = (root / candidate).resolve()
    try:
        resolved.relative_to(root)
    except ValueError:
        errors.append(f"{label} escapes the bundle: {value}")
        return None
    return resolved


def _expect_nonempty_string(mapping: Dict[str, Any], key: str, label: str, errors: List[str]) -> str | None:
    value = mapping.get(key)
    if not isinstance(value, str) or not value.strip():
        errors.append(f"{label}.{key} must be a non-empty string")
        return None
    return value


def _validate_png(
    path: Path,
    expected_size: Sequence[int],
    label: str,
    errors: List[str],
) -> PngImage | None:
    if not path.is_file():
        errors.append(f"missing {label}: {path}")
        return None
    try:
        image = decode_png(path)
    except (OSError, PngDecodeError) as exc:
        errors.append(f"cannot decode {label} {path}: {exc}")
        return None
    if [image.width, image.height] != list(expected_size):
        errors.append(
            f"{label} has size {image.width}x{image.height}; expected {expected_size[0]}x{expected_size[1]}"
        )

    has_transparent = False
    has_visible = False
    dirty_transparent = 0
    for index in range(0, len(image.rgba), 4):
        red, green, blue, alpha = image.rgba[index : index + 4]
        if alpha == 0:
            has_transparent = True
            if red or green or blue:
                dirty_transparent += 1
        else:
            has_visible = True
    if not has_transparent:
        errors.append(f"{label} has no fully transparent pixel: {path}")
    if not has_visible:
        errors.append(f"{label} has no visible pixel: {path}")
    if dirty_transparent:
        errors.append(
            f"{label} has {dirty_transparent} fully transparent pixels with non-zero RGB: {path}"
        )
    return image


def _validate_manifest(root: Path, manifest: Any, result: AuditResult) -> Dict[str, Any] | None:
    errors = result.errors
    if not isinstance(manifest, dict):
        errors.append("npc-bundle.json root must be an object")
        return None
    if manifest.get("schemaVersion") != 1:
        errors.append("npc-bundle.json schemaVersion must be 1")
    for key in ("archetypeId", "appearanceId"):
        value = _expect_nonempty_string(manifest, key, "manifest", errors)
        if value and not ID_RE.fullmatch(value):
            errors.append(f"manifest.{key} must match {ID_RE.pattern}: {value}")
    _expect_nonempty_string(manifest, "displayName", "manifest", errors)

    mobility = manifest.get("mobility")
    if mobility not in ("static", "mobile"):
        errors.append("manifest.mobility must be 'static' or 'mobile'")
    if manifest.get("directions") != list(CANONICAL_DIRECTIONS):
        errors.append("manifest.directions must exactly match the canonical ordered eight directions")

    world = manifest.get("world")
    if not isinstance(world, dict):
        errors.append("manifest.world must be an object")
    else:
        runtime_size = world.get("runtimeSize")
        if not (
            isinstance(runtime_size, list)
            and len(runtime_size) == 2
            and all(isinstance(value, int) and value > 0 for value in runtime_size)
        ):
            errors.append("manifest.world.runtimeSize must contain two positive integers")
        if world.get("idleFrames") != 1:
            errors.append("manifest.world.idleFrames must be 1")
        expected_walk = 0 if mobility == "static" else 4 if mobility == "mobile" else None
        if expected_walk is not None and world.get("walkFrames") != expected_walk:
            errors.append(f"manifest.world.walkFrames must be {expected_walk} for {mobility}")
        if world.get("runtimeMirroring") is not False:
            errors.append("manifest.world.runtimeMirroring must be false")

    portraits = manifest.get("portraits")
    if not isinstance(portraits, dict):
        errors.append("manifest.portraits must be an object")
    else:
        states = portraits.get("states")
        if not isinstance(states, list) or any(not isinstance(state, str) or not state for state in states):
            errors.append("manifest.portraits.states must be a non-empty string array")
        elif states != list(CANONICAL_PORTRAITS):
            errors.append(
                "manifest.portraits.states must exactly be neutral, speaking, smile, concerned"
            )
        if portraits.get("defaultState") != "neutral":
            errors.append("manifest.portraits.defaultState must be neutral")
        if portraits.get("speakingState") != "speaking":
            errors.append("manifest.portraits.speakingState must be speaking")
        runtime_size = portraits.get("runtimeSize")
        if not (
            isinstance(runtime_size, list)
            and len(runtime_size) == 2
            and all(isinstance(value, int) and value > 0 for value in runtime_size)
        ):
            errors.append("manifest.portraits.runtimeSize must contain two positive integers")

    identity = manifest.get("identity")
    if not isinstance(identity, dict):
        errors.append("manifest.identity must be an object")
    else:
        identity_path = _resolve_bundle_path(
            root, identity.get("board"), "identity.board", errors
        )
        if identity_path:
            image = _decode_png_file(identity_path, "identity board", errors)
            if image is not None:
                expected_size = identity.get("size")
                if expected_size != [image.width, image.height]:
                    errors.append("manifest.identity.size does not match identity board")
                if identity.get("fileSha256") != _sha256_file(identity_path):
                    errors.append("manifest.identity.fileSha256 does not match identity board")
                if identity.get("decodedRgbaByteSha256") != image.rgba_sha256:
                    errors.append(
                        "manifest.identity.decodedRgbaByteSha256 does not match identity board"
                    )
                if (
                    identity.get("godotCanonicalRgbaSha256")
                    != image.godot_canonical_rgba_sha256
                ):
                    errors.append(
                        "manifest.identity.godotCanonicalRgbaSha256 does not match identity board"
                    )
                if identity.get("decodedRgbaSha256") != image.canonical_rgba_sha256:
                    errors.append(
                        "manifest.identity.decodedRgbaSha256 does not match identity board"
                    )

    generation = manifest.get("generation")
    if not isinstance(generation, dict):
        errors.append("manifest.generation must be an object")
    else:
        if generation.get("tool") != "image_gen":
            errors.append("manifest.generation.tool must be image_gen")
        _expect_nonempty_string(generation, "model", "manifest.generation", errors)
        generated_at = _expect_nonempty_string(
            generation, "generatedAt", "manifest.generation", errors
        )
        if generated_at and not _reviewed_at_is_valid(generated_at):
            errors.append("manifest.generation.generatedAt must be timezone-aware ISO-8601")
        if generation.get("requestedBackground") not in (
            REQUESTED_BACKGROUND,
            "transparent",
            "mixed",
        ):
            errors.append(
                "manifest.generation.requestedBackground must be #FF00FF, transparent, or mixed"
            )
        source_modes = generation.get("sourceModes")
        if not isinstance(source_modes, dict) or set(source_modes) != {
            "world",
            "portrait",
        }:
            errors.append(
                "manifest.generation.sourceModes must contain exactly world and portrait"
            )
        elif any(mode not in RESOLVED_SOURCE_MODES for mode in source_modes.values()):
            errors.append(
                "manifest.generation.sourceModes values must be opaque-chroma or genuine-transparent"
            )
        else:
            unique_modes = set(source_modes.values())
            expected_background = (
                REQUESTED_BACKGROUND
                if unique_modes == {SOURCE_MODE_OPAQUE_CHROMA}
                else "transparent"
                if unique_modes == {SOURCE_MODE_GENUINE_TRANSPARENT}
                else "mixed"
            )
            if generation.get("requestedBackground") != expected_background:
                errors.append(
                    "manifest.generation.requestedBackground does not derive from resolved sourceModes"
                )
        if generation.get("backgroundOperations") != {
            "opaqueChroma": CHROMA_OPERATION,
            "genuineTransparent": TRANSPARENT_OPERATION,
            "reviewedComponents": MASK_REVIEW_OPERATION,
        }:
            errors.append("manifest.generation.backgroundOperations does not match builder 3.1")
        if not isinstance(generation.get("explicitMaskReviews"), dict):
            errors.append("manifest.generation.explicitMaskReviews must be an object")
        elif isinstance(source_modes, dict):
            for group in generation["explicitMaskReviews"]:
                if source_modes.get(group) != SOURCE_MODE_OPAQUE_CHROMA:
                    errors.append(
                        f"manifest genuine-transparent {group} cannot have an explicit chroma review"
                    )
        for field, label in (
            ("promptLedger", "prompt ledger"),
            ("provenanceLedger", "provenance ledger"),
            ("generationLedger", "generation ledger"),
        ):
            ledger_path = _resolve_bundle_path(root, generation.get(field), f"generation.{field}", errors)
            if ledger_path:
                ledger = _load_json(ledger_path, label, errors)
                if ledger is not None and not isinstance(ledger, dict):
                    errors.append(f"{label} root must be an object: {ledger_path}")

    ownership = manifest.get("ownership")
    if not isinstance(ownership, dict):
        errors.append("manifest.ownership must be an object")
    else:
        for key in ("origin", "owner", "licenseBasis", "replacementPath"):
            _expect_nonempty_string(ownership, key, "manifest.ownership", errors)
        replacement_path = ownership.get("replacementPath")
        if isinstance(replacement_path, str) and not Path(replacement_path).is_absolute():
            errors.append("manifest.ownership.replacementPath must be absolute")
        ledger_path = _resolve_bundle_path(
            root, ownership.get("ledger"), "ownership.ledger", errors
        )
        if ledger_path:
            ledger = _load_json(ledger_path, "ownership ledger", errors)
            if isinstance(ledger, dict):
                for key in ("origin", "owner", "licenseBasis", "replacementPath"):
                    if ledger.get(key) != ownership.get(key):
                        errors.append(
                            f"manifest.ownership.{key} does not match ownership ledger"
                        )

    review = manifest.get("review")
    art_status = None
    owner_status = None
    if not isinstance(review, dict):
        errors.append("manifest.review must be an object")
    else:
        art_status = review.get("artStatus")
        owner_status = review.get("ownerReviewStatus")
        if art_status not in VALID_REVIEW_STATES:
            errors.append(f"manifest.review.artStatus must be one of {sorted(VALID_REVIEW_STATES)}")
        if owner_status not in ("pending", "approved", "rejected"):
            errors.append("manifest.review.ownerReviewStatus must be pending, approved or rejected")
        if art_status == "approved" and owner_status != "approved":
            errors.append("approved art requires ownerReviewStatus=approved")

    release = manifest.get("release")
    if not isinstance(release, dict):
        errors.append("manifest.release must be an object")
    else:
        runtime_enabled = release.get("runtimeEnabled")
        release_approved = release.get("releaseApproved")
        if not isinstance(runtime_enabled, bool):
            errors.append("manifest.release.runtimeEnabled must be boolean")
        if not isinstance(release_approved, bool):
            errors.append("manifest.release.releaseApproved must be boolean")
        _expect_nonempty_string(release, "reason", "manifest.release", errors)
        if art_status != "approved" or owner_status != "approved":
            if runtime_enabled is not False or release_approved is not False:
                errors.append(
                    "unapproved NPC art must keep runtimeEnabled and releaseApproved false"
                )
    return manifest


def _validate_prompt_and_generation_ledgers(
    root: Path, manifest: Dict[str, Any], result: AuditResult
) -> None:
    errors = result.errors
    generation = manifest.get("generation")
    identity = manifest.get("identity")
    if not isinstance(generation, dict) or not isinstance(identity, dict):
        return
    prompt_path = _resolve_bundle_path(
        root, generation.get("promptLedger"), "generation.promptLedger", errors
    )
    generation_path = _resolve_bundle_path(
        root,
        generation.get("generationLedger"),
        "generation.generationLedger",
        errors,
    )
    identity_path = _resolve_bundle_path(
        root, identity.get("board"), "identity.board", errors
    )
    if not prompt_path or not generation_path or not identity_path:
        return
    prompts = _load_json(prompt_path, "prompt ledger", errors)
    ledger = _load_json(generation_path, "generation ledger", errors)
    if not isinstance(prompts, dict) or not isinstance(ledger, dict):
        return
    if prompts.get("schemaVersion") != 1:
        errors.append("prompt ledger schemaVersion must be 1")
    prompt_entries = prompts.get("prompts")
    if not isinstance(prompt_entries, list):
        errors.append("prompt ledger prompts must be an array")
        prompt_entries = []
    prompt_by_id: Dict[str, Dict[str, Any]] = {}
    for entry in prompt_entries:
        if not isinstance(entry, dict) or entry.get("id") not in ("world", "portrait"):
            errors.append("prompt ledger entries must have id world or portrait")
            continue
        prompt_id = entry["id"]
        if prompt_id in prompt_by_id:
            errors.append(f"duplicate prompt ledger id: {prompt_id}")
            continue
        prompt_by_id[prompt_id] = entry
        copied = _resolve_bundle_path(
            root, entry.get("copiedPath"), f"prompt {prompt_id}.copiedPath", errors
        )
        if copied and copied.is_file():
            try:
                text = copied.read_text(encoding="utf-8")
            except (OSError, UnicodeError) as exc:
                errors.append(f"cannot read copied prompt {copied}: {exc}")
            else:
                if entry.get("text") != text:
                    errors.append(f"prompt {prompt_id}.text does not match copied prompt")
                if entry.get("fileSha256") != _sha256_file(copied):
                    errors.append(
                        f"prompt {prompt_id}.fileSha256 does not match copied prompt"
                    )
        for key in ("tool", "model", "generatedAt", "requestedBackground"):
            if entry.get(key) != generation.get(key):
                errors.append(
                    f"prompt {prompt_id}.{key} does not match manifest generation"
                )
        negative = entry.get("negativeConstraints")
        if not isinstance(negative, list) or not negative or any(
            not isinstance(value, str) or not value.strip() for value in negative
        ):
            errors.append(
                f"prompt {prompt_id}.negativeConstraints must be a non-empty string array"
            )
        if not isinstance(entry.get("parameters"), dict):
            errors.append(f"prompt {prompt_id}.parameters must be an object")
    if set(prompt_by_id) != {"world", "portrait"}:
        errors.append("prompt ledger must contain exactly world and portrait prompts")

    if ledger.get("schemaVersion") != 1:
        errors.append("generation ledger schemaVersion must be 1")
    if ledger.get("tool") != "image_gen":
        errors.append("generation ledger tool must be image_gen")
    for key in ("tool", "model", "generatedAt", "requestedBackground"):
        if ledger.get(key) != generation.get(key):
            errors.append(f"generation ledger {key} does not match manifest generation")
    if not isinstance(ledger.get("parameters"), dict):
        errors.append("generation ledger parameters must be an object")
    negative = ledger.get("negativeConstraints")
    if not isinstance(negative, list) or not negative:
        errors.append("generation ledger negativeConstraints must be non-empty")
    sources = ledger.get("sources")
    if not isinstance(sources, dict):
        errors.append("generation ledger sources must be an object")
        return
    identity_hash = _sha256_file(identity_path) if identity_path.is_file() else None
    identity_source = sources.get("identityBoard")
    if not isinstance(identity_source, dict) or identity_source.get("fileSha256") != identity_hash:
        errors.append("generation ledger identityBoard hash does not match bundled identity")
    for source_id, sheet_path, prompt_id, prompt_hash_key in (
        ("worldSheet", root / "source/raw/world-sheet.png", "world", "worldPromptSha256"),
        (
            "portraitSheet",
            root / "source/raw/portrait-sheet.png",
            "portrait",
            "portraitPromptSha256",
        ),
    ):
        source = sources.get(source_id)
        if not isinstance(source, dict):
            errors.append(f"generation ledger sources.{source_id} must be an object")
            continue
        if not sheet_path.is_file() or source.get("fileSha256") != _sha256_file(sheet_path):
            errors.append(f"generation ledger {source_id} hash does not match bundled sheet")
        if source.get("identityBoardSha256") != identity_hash:
            errors.append(
                f"generation ledger {source_id}.identityBoardSha256 does not match identity"
            )
        prompt = prompt_by_id.get(prompt_id)
        if prompt is not None and source.get(prompt_hash_key) != prompt.get("fileSha256"):
            errors.append(
                f"generation ledger {source_id}.{prompt_hash_key} does not match prompt"
            )
        source_modes = generation.get("sourceModes")
        if isinstance(source_modes, dict):
            group = "world" if source_id == "worldSheet" else "portrait"
            resolved_mode = source_modes.get(group)
            if resolved_mode == SOURCE_MODE_GENUINE_TRANSPARENT:
                if source.get("sourceMode") != SOURCE_MODE_GENUINE_TRANSPARENT:
                    errors.append(
                        f"generation ledger sources.{source_id}.sourceMode must be genuine-transparent"
                    )
                if source.get("requestedBackground") != "transparent":
                    errors.append(
                        f"generation ledger sources.{source_id}.requestedBackground must be transparent"
                    )
            elif resolved_mode == SOURCE_MODE_OPAQUE_CHROMA:
                if source.get("sourceMode") != SOURCE_MODE_OPAQUE_CHROMA:
                    errors.append(
                        f"generation ledger sources.{source_id}.sourceMode must be opaque-chroma"
                    )
                if source.get("requestedBackground") != REQUESTED_BACKGROUND:
                    errors.append(
                        f"generation ledger sources.{source_id}.requestedBackground must be #FF00FF"
                    )


def _native_png_header(path: Path) -> Tuple[int, int, int, int, int]:
    data = path.read_bytes()
    if not data.startswith(PNG_SIGNATURE):
        raise PngDecodeError("invalid PNG signature")
    for chunk_type, payload in _read_chunks(data):
        if chunk_type == b"IHDR":
            if len(payload) != 13:
                raise PngDecodeError("invalid IHDR")
            width, height, bit_depth, color_type, _, _, interlace = struct.unpack(
                ">IIBBBBB", payload
            )
            return width, height, bit_depth, color_type, interlace
    raise PngDecodeError("missing IHDR")


def _reviewed_at_is_valid(value: Any) -> bool:
    if not isinstance(value, str) or not value.strip():
        return False
    try:
        parsed = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return False
    return parsed.tzinfo is not None and parsed.utcoffset() is not None


def _crop_rgba(image: PngImage, box: Sequence[int]) -> bytes:
    x0, y0, x1, y1 = box
    row_bytes = image.width * 4
    return b"".join(
        image.rgba[y * row_bytes + x0 * 4 : y * row_bytes + x1 * 4]
        for y in range(y0, y1)
    )


def _crop_mask(
    values: Sequence[bool], width: int, box: Sequence[int]
) -> List[bool]:
    x0, y0, x1, y1 = box
    return [
        value
        for y in range(y0, y1)
        for value in values[y * width + x0 : y * width + x1]
    ]


def _component_descriptor(
    width: int,
    height: int,
    component: Sequence[bool],
    slot: str,
    cell_box: Sequence[int],
    component_type: str = ENCLOSED_COMPONENT_TYPE,
) -> Dict[str, Any]:
    cell_bbox = _component_bbox(width, height, component)
    pixel_count = sum(component)
    return {
        "slot": slot,
        "componentType": component_type,
        "componentPixelSha256": _component_hash(width, height, component),
        "cellBbox": cell_bbox,
        "sheetBbox": [
            cell_box[0] + cell_bbox[0],
            cell_box[1] + cell_bbox[1],
            cell_box[0] + cell_bbox[2],
            cell_box[1] + cell_bbox[3],
        ],
        "pixelCount": pixel_count,
        "requiresLargeComponentAttention": (
            component_type == ENCLOSED_COMPONENT_TYPE
            and pixel_count > LARGE_ENCLOSED_COMPONENT_REVIEW_THRESHOLD
        ),
    }


def _measured_background_samples(
    image: PngImage, group: str, slot: str
) -> List[Dict[str, Any]]:
    policy = _chroma_edge_policy(group, slot)
    edges = policy["backgroundSampleEdges"]
    width, height = image.width, image.height
    points: List[Tuple[int, int]] = []
    if "top" in edges:
        points.extend(((0, 0), (width // 2, 0), (width - 1, 0)))
    if "bottom" in edges:
        points.extend(
            ((0, height - 1), (width // 2, height - 1), (width - 1, height - 1))
        )
    if "left" in edges:
        points.extend(
            (
                (0, height // 4),
                (0, height // 2),
                (0, (height * 3) // 4),
                (0, height - 1),
            )
        )
    if "right" in edges:
        points.extend(
            (
                (width - 1, height // 4),
                (width - 1, height // 2),
                (width - 1, (height * 3) // 4),
                (width - 1, height - 1),
            )
        )
    samples: List[Dict[str, Any]] = []
    for x, y in points:
        offset = (y * width + x) * 4
        samples.append(
            {
                "position": [x, y],
                "rgb": list(image.rgba[offset : offset + 3]),
            }
        )
    return samples


def _alpha_distribution(image: PngImage) -> Dict[str, int]:
    alphas = image.rgba[3::4]
    return {
        "totalPixelCount": len(alphas),
        "transparentPixelCount": sum(alpha == 0 for alpha in alphas),
        "partialAlphaPixelCount": sum(0 < alpha < 255 for alpha in alphas),
        "opaquePixelCount": sum(alpha == 255 for alpha in alphas),
    }


def _visible_bbox_from_rgba(image: PngImage) -> List[int]:
    visible = [
        index
        for index, alpha in enumerate(image.rgba[3::4])
        if alpha > 0
    ]
    if not visible:
        raise ValueError("image has no alpha-positive pixel")
    xs = [index % image.width for index in visible]
    ys = [index // image.width for index in visible]
    return [min(xs), min(ys), max(xs) + 1, max(ys) + 1]


def _resolved_source_mode_from_pixels(image: PngImage) -> str | None:
    stats = _alpha_distribution(image)
    total = stats["totalPixelCount"]
    if stats["opaquePixelCount"] == total:
        return SOURCE_MODE_OPAQUE_CHROMA
    if (
        stats["transparentPixelCount"] > 0
        and stats["partialAlphaPixelCount"] + stats["opaquePixelCount"] > 0
    ):
        return SOURCE_MODE_GENUINE_TRANSPARENT
    return None


def _transparent_replay(
    image: PngImage, group: str, slot: str
) -> Dict[str, Any]:
    width, height = image.width, image.height
    alpha = list(image.rgba[3::4])
    eligibility = [value == 0 for value in alpha]
    visible = [value > 0 for value in alpha]
    if not any(eligibility) or not any(visible):
        raise ValueError(
            "genuine-transparent cell must contain alpha-zero background and alpha-positive subject"
        )
    background_ratio = sum(eligibility) / float(len(eligibility))
    if not MIN_BACKGROUND_RATIO <= background_ratio <= MAX_BACKGROUND_RATIO:
        raise ValueError(
            f"transparent background ratio {background_ratio:.6f} is outside "
            f"[{MIN_BACKGROUND_RATIO:.2f}, {MAX_BACKGROUND_RATIO:.2f}]"
        )
    policy = _chroma_edge_policy(group, slot)
    for edge in policy["requiredSafeEdges"]:
        if edge == "top":
            indexes = range(width)
        elif edge == "bottom":
            indexes = range((height - 1) * width, height * width)
        elif edge == "left":
            indexes = (y * width for y in range(height))
        else:
            indexes = (y * width + width - 1 for y in range(height))
        if any(alpha[index] != 0 for index in indexes):
            raise ValueError(f"genuine-transparent subject touches required-safe {edge} edge")
    inner_edge = policy["innerCropEdge"]
    inner_ratio = policy["innerCropMinimumYRatio"]
    if inner_edge is not None:
        minimum_y = int(math.floor(height * float(inner_ratio)))
        x = 0 if inner_edge == "left" else width - 1
        if any(alpha[y * width + x] != 0 for y in range(minimum_y)):
            raise ValueError(
                "genuine-transparent portrait subject touches inner seam above allowed crop zone"
            )
    components = _connected_components(
        visible, width, height, connectivity=ALPHA_COMPONENT_CONNECTIVITY
    )
    component_sizes = [sum(component) for component in components]
    if (
        not components
        or len(components) > MAX_ALPHA_POSITIVE_COMPONENTS
        or any(size < MIN_DETACHED_ALPHA_COMPONENT_PIXELS for size in component_sizes)
    ):
        raise ValueError(
            "genuine-transparent source has invalid alpha-positive component count/size"
        )
    processed = bytearray(image.rgba)
    changed = [False] * (width * height)
    for index, eligible in enumerate(eligibility):
        if not eligible:
            continue
        offset = index * 4
        if processed[offset] or processed[offset + 1] or processed[offset + 2]:
            changed[index] = True
        processed[offset : offset + 4] = b"\x00\x00\x00\x00"
    return {
        "eligibility": eligibility,
        "changed": changed,
        "processed": bytes(processed),
        "componentSizes": component_sizes,
        "edgePolicy": policy,
        "stats": _alpha_distribution(image),
    }


def _validate_fringe_distance(
    component: Sequence[bool],
    automatic: Sequence[bool],
    width: int,
    height: int,
) -> bool:
    within = _within_four_neighbour_distance(
        automatic, width, height, FRINGE_MAX_DISTANCE
    )
    return all(not member or within[index] for index, member in enumerate(component))


def _load_explicit_mask_reviews(
    root: Path,
    manifest: Dict[str, Any],
    provenance: Dict[str, Any],
    errors: List[str],
) -> Dict[str, Dict[str, Any]]:
    generation = manifest.get("generation")
    if not isinstance(generation, dict):
        return {}
    manifest_reviews = generation.get("explicitMaskReviews")
    provenance_reviews = provenance.get("explicitMaskReviews")
    if not isinstance(manifest_reviews, dict):
        return {}
    if not isinstance(provenance_reviews, dict):
        errors.append("provenance explicitMaskReviews must be an object")
        provenance_reviews = {}
    if provenance_reviews != manifest_reviews:
        errors.append(
            "manifest and provenance explicitMaskReviews must match exactly"
        )
    invalid_groups = sorted(set(manifest_reviews) - {"world", "portrait"})
    if invalid_groups:
        errors.append(f"unsupported explicit mask review groups: {invalid_groups}")

    contexts: Dict[str, Dict[str, Any]] = {}
    for group in ("world", "portrait"):
        if group not in manifest_reviews:
            continue
        label = f"{group} mask authoring ledger"
        summary = manifest_reviews[group]
        if not isinstance(summary, dict):
            errors.append(f"manifest explicitMaskReviews.{group} must be an object")
            continue
        if summary.get("operation") != MASK_REVIEW_OPERATION:
            errors.append(f"{label} summary operation mismatch")
        if summary.get("reviewMethod") != MASK_REVIEW_METHOD:
            errors.append(f"{label} summary reviewMethod mismatch")
        mask_path = _resolve_bundle_path(
            root,
            summary.get("explicitSheetMaskPath"),
            f"explicitMaskReviews.{group}.explicitSheetMaskPath",
            errors,
        )
        ledger_path = _resolve_bundle_path(
            root,
            summary.get("maskAuthoringLedgerPath"),
            f"explicitMaskReviews.{group}.maskAuthoringLedgerPath",
            errors,
        )
        raw_path = root / f"source/raw/{group}-sheet.png"
        raw = _decode_png_file(raw_path, f"{group} raw sheet", errors)
        mask = (
            _decode_png_file(mask_path, f"{group} explicit sheet mask", errors)
            if mask_path
            else None
        )
        ledger = (
            _load_json(ledger_path, label, errors) if ledger_path else None
        )
        if not raw or not mask or not isinstance(ledger, dict) or not mask_path or not ledger_path:
            continue
        try:
            _, _, bit_depth, color_type, interlace = _native_png_header(mask_path)
        except (OSError, PngDecodeError) as exc:
            errors.append(f"cannot inspect {group} explicit sheet mask header: {exc}")
            continue
        if (bit_depth, color_type, interlace) != (8, 0, 0):
            errors.append(
                f"{group} explicit sheet mask must be a non-interlaced 8-bit grayscale PNG"
            )
        mask_values = _mask_values(mask)
        if mask_values is None:
            errors.append(f"{group} explicit sheet mask must be opaque binary grayscale")
            continue
        if all(mask_values):
            errors.append(f"{group} explicit sheet mask must not be full-true")
        if (mask.width, mask.height) != (raw.width, raw.height):
            errors.append(f"{group} explicit sheet mask dimensions do not match raw sheet")

        raw_file_hash = _sha256_file(raw_path)
        mask_file_hash = _sha256_file(mask_path)
        mask_pixel_hash = _binary_mask_hash(mask.width, mask.height, mask_values)
        ledger_file_hash = _sha256_file(ledger_path)
        summary_expected = {
            "operation": MASK_REVIEW_OPERATION,
            "reviewMethod": MASK_REVIEW_METHOD,
            "rawSheetFileSha256": raw_file_hash,
            "explicitSheetMaskPath": mask_path.relative_to(root).as_posix(),
            "explicitSheetMaskFileSha256": mask_file_hash,
            "explicitSheetMaskPixelSha256": mask_pixel_hash,
            "maskAuthoringLedgerPath": ledger_path.relative_to(root).as_posix(),
            "maskAuthoringLedgerFileSha256": ledger_file_hash,
        }
        for key, expected in summary_expected.items():
            if summary.get(key) != expected:
                errors.append(f"{label} summary {key} does not match archived input")

        if ledger.get("schemaVersion") != 1:
            errors.append(f"{label} schemaVersion must be 1")
        if ledger.get("operation") != MASK_REVIEW_OPERATION:
            errors.append(f"{label} operation mismatch")
        if ledger.get("group") != group:
            errors.append(f"{label} group mismatch")
        if ledger.get("reviewMethod") != MASK_REVIEW_METHOD:
            errors.append(f"{label} reviewMethod mismatch")
        source = ledger.get("source")
        expected_source = {
            "rawSheetFileSha256": raw_file_hash,
            "rawSheetDecodedRgbaByteSha256": raw.rgba_sha256,
            "rawSheetGodotCanonicalRgbaSha256": raw.godot_canonical_rgba_sha256,
            "rawSheetDecodedRgbaSha256": raw.canonical_rgba_sha256,
            "explicitMaskFileSha256": mask_file_hash,
            "explicitMaskPixelSha256": mask_pixel_hash,
            "width": raw.width,
            "height": raw.height,
        }
        if not isinstance(source, dict):
            errors.append(f"{label}.source must be an object")
        else:
            for key, expected in expected_source.items():
                if source.get(key) != expected:
                    errors.append(f"{label}.source.{key} does not match archived input")
        classifier = ledger.get("classifier")
        expected_edge_policy = (
            WORLD_EDGE_POLICY if group == "world" else PORTRAIT_EDGE_POLICY
        )
        expected_classifier = {
            "operation": CHROMA_OPERATION,
            "connectivity": CHROMA_CONNECTIVITY,
            "edgePolicy": expected_edge_policy,
            "fringeMaximumFourNeighbourDistance": FRINGE_MAX_DISTANCE,
            "fringeReviewGrouping": FRINGE_REVIEW_GROUPING,
            "residualKeyReviewGrouping": RESIDUAL_KEY_REVIEW_GROUPING,
            "largeEnclosedComponentReviewThreshold": (
                LARGE_ENCLOSED_COMPONENT_REVIEW_THRESHOLD
            ),
        }
        if not isinstance(classifier, dict) or any(
            classifier.get(key) != expected
            for key, expected in expected_classifier.items()
        ):
            errors.append(
                f"{label}.classifier must bind the current classifier, fringe distance/grouping, and large-component attention threshold"
            )

        components = ledger.get("components")
        if not isinstance(components, list):
            errors.append(f"{label}.components must be an array")
            continue
        if summary.get("reviewedComponentCount") != len(components):
            errors.append(f"{label} summary reviewedComponentCount mismatch")
        allowed_slots = (
            set(CANONICAL_DIRECTIONS)
            if group == "world"
            else set(CANONICAL_PORTRAITS)
        )
        entries: Dict[Tuple[str, str, str], Dict[str, Any]] = {}
        for index, entry in enumerate(components):
            entry_label = f"{label}.components[{index}]"
            if not isinstance(entry, dict):
                errors.append(f"{entry_label} must be an object")
                continue
            slot = entry.get("slot")
            component_type = entry.get("componentType")
            component_hash = entry.get("componentPixelSha256")
            if slot not in allowed_slots:
                errors.append(f"{entry_label}.slot is not valid for {group}")
            if component_type not in MASK_REVIEW_COMPONENT_TYPES:
                errors.append(f"{entry_label}.componentType is invalid")
            if not isinstance(component_hash, str) or not re.fullmatch(
                r"[0-9a-f]{64}", component_hash
            ):
                errors.append(f"{entry_label}.componentPixelSha256 is invalid")
                continue
            key = (str(slot), str(component_type), component_hash)
            if key in entries:
                errors.append(
                    f"{label} duplicates component {slot}/{component_type}/{component_hash}"
                )
            entries[key] = entry
            for bbox_key in ("cellBbox", "sheetBbox"):
                bbox = entry.get(bbox_key)
                if not (
                    isinstance(bbox, list)
                    and len(bbox) == 4
                    and all(isinstance(value, int) for value in bbox)
                ):
                    errors.append(f"{entry_label}.{bbox_key} must contain four integers")
            if not isinstance(entry.get("pixelCount"), int) or entry["pixelCount"] <= 0:
                errors.append(f"{entry_label}.pixelCount must be a positive integer")
            if not isinstance(entry.get("requiresLargeComponentAttention"), bool):
                errors.append(
                    f"{entry_label}.requiresLargeComponentAttention must be boolean"
                )
            allowed_decisions = (
                (RESIDUAL_KEY_REPAIR_DECISION, RESIDUAL_KEY_RETAIN_DECISION)
                if component_type == RESIDUAL_KEY_COMPONENT_TYPE
                else ("background-fringe", "retain-subject")
                if component_type == FRINGE_COMPONENT_TYPE
                else ("background-hole", "retain-subject")
            )
            if entry.get("decision") not in allowed_decisions:
                errors.append(
                    f"{entry_label}.decision is invalid for {component_type}"
                )
            if not isinstance(entry.get("reviewer"), str) or not entry["reviewer"].strip():
                errors.append(f"{entry_label}.reviewer must be non-empty")
            if not _reviewed_at_is_valid(entry.get("reviewedAt")):
                errors.append(f"{entry_label}.reviewedAt must be timezone-aware ISO-8601")
        contexts[group] = {
            "summary": summary,
            "mask": mask,
            "maskValues": mask_values,
            "raw": raw,
            "rawPath": raw_path,
            "entries": entries,
            "used": set(),
            "frames": 0,
        }
    return contexts


def _validate_frame_provenance(
    root: Path, manifest: Dict[str, Any], result: AuditResult
) -> None:
    errors = result.errors
    generation = manifest.get("generation")
    if not isinstance(generation, dict):
        return
    provenance_path = _resolve_bundle_path(
        root,
        generation.get("provenanceLedger"),
        "generation.provenanceLedger",
        errors,
    )
    if not provenance_path:
        return
    provenance = _load_json(provenance_path, "provenance ledger", errors)
    if not isinstance(provenance, dict):
        return
    if provenance.get("schemaVersion") != 1:
        errors.append("provenance ledger schemaVersion must be 1")
    if provenance.get("tool") != BUILDER_TOOL:
        errors.append(f"provenance tool must be {BUILDER_TOOL}")
    if provenance.get("toolVersion") != BUILDER_VERSION:
        errors.append(f"provenance toolVersion must be {BUILDER_VERSION}")
    if provenance.get("requestedBackground") != generation.get("requestedBackground"):
        errors.append("provenance requestedBackground does not match manifest")
    source_modes = generation.get("sourceModes")
    if provenance.get("sourceModes") != source_modes:
        errors.append("provenance sourceModes do not match manifest")
    if provenance.get("backgroundOperations") != {
        "opaqueChroma": CHROMA_OPERATION,
        "genuineTransparent": TRANSPARENT_OPERATION,
        "reviewedChromaComponents": MASK_REVIEW_OPERATION,
    }:
        errors.append("provenance backgroundOperations do not match builder 3.1")
    if provenance.get("maskContract") != (
        "Genuine-transparent inputs preserve all alpha-positive pixels and "
        "canonicalize RGB only where source alpha is zero. Every frame "
        "archives two distinct masks: an eligibility mask records the full "
        "reviewed background domain, while an exact changed-pixel mask "
        "records only source pixels whose RGBA bytes actually changed. "
        "Opaque chroma eligibility contains the automatic core plus every "
        "reviewed whole enclosed, fringe, outer-background-hole, or residual "
        "key-color component. Residual components exhaust every global "
        "soft-matte proposal pixel outside the earlier classifier scopes; "
        "only repair-key-spill decisions may change those pixels. No pixel "
        "outside the exact changed-pixel mask may change."
    ):
        errors.append("provenance maskContract does not match builder 3.1")

    identity_path = root / "identity/identity-board.png"
    identity_image = _decode_png_file(identity_path, "identity board", errors)
    identity_record = provenance.get("identity")
    if identity_image is not None:
        expected_identity = {
            "path": "identity/identity-board.png",
            "fileSha256": _sha256_file(identity_path),
            "decodedRgbaByteSha256": identity_image.rgba_sha256,
            "godotCanonicalRgbaSha256": identity_image.godot_canonical_rgba_sha256,
            "decodedRgbaSha256": identity_image.canonical_rgba_sha256,
            "size": [identity_image.width, identity_image.height],
        }
        if identity_record != expected_identity:
            errors.append("provenance identity record does not match bundled identity")

    raw_sheets_value = provenance.get("rawSheets")
    raw_sheet_by_group: Dict[str, PngImage] = {}
    if not isinstance(raw_sheets_value, list):
        errors.append("provenance rawSheets must be an array")
    else:
        seen_raw_ids: set[str] = set()
        for entry in raw_sheets_value:
            if not isinstance(entry, dict) or entry.get("id") not in ("world", "portrait"):
                errors.append("provenance rawSheets entries must have id world or portrait")
                continue
            group = str(entry["id"])
            if group in seen_raw_ids:
                errors.append(f"duplicate provenance raw sheet id: {group}")
                continue
            seen_raw_ids.add(group)
            copied_path = _resolve_bundle_path(
                root, entry.get("copiedPath"), f"rawSheets.{group}.copiedPath", errors
            )
            if copied_path is None:
                continue
            image = _decode_png_file(copied_path, f"{group} raw sheet", errors)
            if image is None:
                continue
            raw_sheet_by_group[group] = image
            file_hash = _sha256_file(copied_path)
            expected = {
                "id": group,
                "copiedPath": f"source/raw/{group}-sheet.png",
                "inputFileSha256": file_hash,
                "copiedFileSha256": file_hash,
                "sourceMode": source_modes.get(group) if isinstance(source_modes, dict) else None,
                "decodedRgbaByteSha256": image.rgba_sha256,
                "godotCanonicalRgbaSha256": image.godot_canonical_rgba_sha256,
                "decodedRgbaSha256": image.canonical_rgba_sha256,
                "size": [image.width, image.height],
            }
            if entry != expected:
                errors.append(f"provenance rawSheets.{group} does not match archived sheet")
            resolved_mode = _resolved_source_mode_from_pixels(image)
            if resolved_mode != expected["sourceMode"]:
                errors.append(
                    f"provenance {group} sourceMode does not match decoded alpha distribution"
                )
        if seen_raw_ids != {"world", "portrait"}:
            errors.append("provenance rawSheets must contain exactly world and portrait")

    review_contexts = _load_explicit_mask_reviews(
        root, manifest, provenance, errors
    )
    frames = provenance.get("frames")
    if not isinstance(frames, list):
        errors.append("provenance frames must be an array")
        return
    expected_paths = {
        *(f"runtime/world/{direction}/idle-1.png" for direction in CANONICAL_DIRECTIONS),
        *(f"runtime/portraits/{state}.png" for state in CANONICAL_PORTRAITS),
    }
    seen_paths: set[str] = set()
    for index, frame in enumerate(frames):
        label = f"provenance frame {index}"
        if not isinstance(frame, dict):
            errors.append(f"{label} must be an object")
            continue
        group = frame.get("group")
        slot = frame.get("slot")
        allowed_slots = (
            set(CANONICAL_DIRECTIONS)
            if group == "world"
            else set(CANONICAL_PORTRAITS)
            if group == "portrait"
            else set()
        )
        if not isinstance(slot, str) or slot not in allowed_slots:
            errors.append(f"{label} has invalid group/slot: {group}/{slot}")
            continue
        source_mode = frame.get("sourceMode")
        expected_source_mode = (
            source_modes.get(group) if isinstance(source_modes, dict) else None
        )
        if source_mode != expected_source_mode or source_mode not in RESOLVED_SOURCE_MODES:
            errors.append(f"{label}.sourceMode does not match manifest sourceModes")
        runtime_value = frame.get("runtimePath")
        expected_runtime = (
            f"runtime/world/{slot}/idle-1.png"
            if group == "world"
            else f"runtime/portraits/{slot}.png"
        )
        if runtime_value != expected_runtime:
            errors.append(f"{label}.runtimePath does not match canonical group/slot path")
        if isinstance(runtime_value, str):
            if runtime_value in seen_paths:
                errors.append(f"duplicate provenance runtimePath: {runtime_value}")
            seen_paths.add(runtime_value)
        resolved: Dict[str, Path] = {}
        for key in (
            "rawPath",
            "maskPath",
            "changedPixelMaskPath",
            "processedPath",
            "runtimePath",
        ):
            path = _resolve_bundle_path(root, frame.get(key), f"{label}.{key}", errors)
            if path is not None:
                resolved[key] = path
        if frame.get("eligibilityMaskPath") != frame.get("maskPath"):
            errors.append(f"{label}.eligibilityMaskPath must alias maskPath exactly")
        if set(resolved) != {
            "rawPath",
            "maskPath",
            "changedPixelMaskPath",
            "processedPath",
            "runtimePath",
        }:
            continue
        eligibility_mask_path = resolved["maskPath"]
        changed_pixel_mask_path = resolved["changedPixelMaskPath"]
        if eligibility_mask_path == changed_pixel_mask_path:
            errors.append(
                f"{label} eligibility and changed-pixel masks must resolve to distinct files"
            )
        else:
            try:
                masks_share_file = os.path.samefile(
                    eligibility_mask_path, changed_pixel_mask_path
                )
            except OSError:
                masks_share_file = False
            if masks_share_file:
                errors.append(
                    f"{label} eligibility and changed-pixel masks must not share one filesystem file"
                )
        raw = _decode_png_file(resolved["rawPath"], f"{label} raw", errors)
        mask = _decode_png_file(resolved["maskPath"], f"{label} mask", errors)
        changed_mask = _decode_png_file(
            resolved["changedPixelMaskPath"], f"{label} changed-pixel mask", errors
        )
        processed = _decode_png_file(
            resolved["processedPath"], f"{label} processed", errors
        )
        runtime = _decode_png_file(resolved["runtimePath"], f"{label} runtime", errors)
        if not raw or not mask or not changed_mask or not processed or not runtime:
            continue
        for path_key, hash_key in (
            ("rawPath", "rawFileSha256"),
            ("maskPath", "maskFileSha256"),
            ("changedPixelMaskPath", "changedPixelMaskFileSha256"),
            ("processedPath", "processedFileSha256"),
            ("runtimePath", "runtimeFileSha256"),
        ):
            if frame.get(hash_key) != _sha256_file(resolved[path_key]):
                errors.append(f"{label}.{hash_key} does not match file")
        for image, prefix in (
            (raw, "raw"),
            (processed, "processed"),
            (runtime, "runtime"),
        ):
            expected_hashes = {
                f"{prefix}DecodedRgbaByteSha256": image.rgba_sha256,
                f"{prefix}GodotCanonicalRgbaSha256": image.godot_canonical_rgba_sha256,
                f"{prefix}RgbaSha256": image.canonical_rgba_sha256,
            }
            for hash_key, expected_hash in expected_hashes.items():
                if frame.get(hash_key) != expected_hash:
                    errors.append(f"{label}.{hash_key} does not match decoded pixels")
        processed_detached = _static_detached_foreground_report(
            processed, "processed-cell"
        )
        runtime_detached = _static_detached_foreground_report(runtime, "runtime")
        for field, replayed in (
            ("processedDetachedForegroundGate", processed_detached),
            ("runtimeDetachedForegroundGate", runtime_detached),
        ):
            if frame.get(field) != replayed:
                errors.append(f"{label}.{field} does not replay decoded alpha components")
        for stage, replayed in (
            ("processed-cell", processed_detached),
            ("runtime", runtime_detached),
        ):
            if replayed["blockingComponents"]:
                errors.append(
                    f"{label} {stage} has detached foreground component(s) at or above "
                    f"{DETACHED_FOREGROUND_PIXEL_THRESHOLD} pixels with alpha >= "
                    f"{DETACHED_FOREGROUND_ALPHA_THRESHOLD}"
                )
        for hash_key, expected_hash in (
            ("maskSourceDecodedRgbaByteSha256", raw.rgba_sha256),
            ("maskSourceGodotCanonicalRgbaSha256", raw.godot_canonical_rgba_sha256),
            ("maskSourceRgbaSha256", raw.canonical_rgba_sha256),
        ):
            if frame.get(hash_key) != expected_hash:
                errors.append(f"{label}.{hash_key} does not match raw pixels")
        mask_hash = _canonical_mask_sha256(mask)
        mask_values = _mask_values(mask)
        changed_mask_hash = _canonical_mask_sha256(changed_mask)
        changed_mask_values = _mask_values(changed_mask)
        if mask_hash is None or mask_values is None:
            errors.append(f"{label} mask must be opaque binary grayscale")
            continue
        if changed_mask_hash is None or changed_mask_values is None:
            errors.append(f"{label} changed-pixel mask must be opaque binary grayscale")
            continue
        for path_key, image_value in (
            ("maskPath", mask),
            ("changedPixelMaskPath", changed_mask),
        ):
            try:
                _, _, bit_depth, color_type, interlace = _native_png_header(
                    resolved[path_key]
                )
            except (OSError, PngDecodeError) as exc:
                errors.append(f"cannot inspect {label}.{path_key} header: {exc}")
            else:
                if (bit_depth, color_type, interlace) != (8, 0, 0):
                    errors.append(
                        f"{label}.{path_key} must be non-interlaced 8-bit grayscale"
                    )
        if frame.get("maskPixelSha256") != mask_hash:
            errors.append(f"{label}.maskPixelSha256 does not match mask pixels")
        if frame.get("changedPixelMaskSha256") != changed_mask_hash:
            errors.append(
                f"{label}.changedPixelMaskSha256 does not match changed-pixel mask"
            )
        if (
            raw.width != processed.width
            or raw.height != processed.height
            or raw.width != mask.width
            or raw.height != mask.height
            or raw.width != changed_mask.width
            or raw.height != changed_mask.height
        ):
            errors.append(
                f"{label} raw, eligibility mask, changed mask and processed dimensions must match"
            )
            continue
        if frame.get("maskWidth") != mask.width or frame.get("maskHeight") != mask.height:
            errors.append(f"{label} declared mask dimensions do not match")

        actual_changed = [
            raw.rgba[offset : offset + 4] != processed.rgba[offset : offset + 4]
            for offset in range(0, len(raw.rgba), 4)
        ]
        if changed_mask_values != actual_changed:
            errors.append(
                f"{label} changed-pixel mask is not the exact raw-to-processed RGBA diff"
            )
        if frame.get("changedPixelCount") != sum(actual_changed):
            errors.append(f"{label}.changedPixelCount does not replay")
        outside_changed = sum(
            changed and not eligible
            for changed, eligible in zip(actual_changed, mask_values)
        )
        if outside_changed:
            errors.append(
                f"{label} mutated {outside_changed} pixels outside its eligibility mask"
            )
        if frame.get("eligiblePixelCount") != sum(mask_values):
            errors.append(f"{label}.eligiblePixelCount does not match eligibility mask")
        expected_eligible_ratio = round(
            sum(mask_values) / float(len(mask_values)), 8
        )
        if frame.get("eligiblePixelRatio") != expected_eligible_ratio:
            errors.append(f"{label}.eligiblePixelRatio does not match eligibility mask")

        sheet = raw_sheet_by_group.get(str(group))
        cell_box = frame.get("rawSheetCellBox")
        rows, cols = (2, 4) if group == "world" else (2, 2)
        ordered_slots = CANONICAL_DIRECTIONS if group == "world" else CANONICAL_PORTRAITS
        if sheet is not None:
            slot_index = ordered_slots.index(str(slot))
            row, col = divmod(slot_index, cols)
            x_bounds = [position * sheet.width // cols for position in range(cols + 1)]
            y_bounds = [position * sheet.height // rows for position in range(rows + 1)]
            expected_cell_box = [
                x_bounds[col],
                y_bounds[row],
                x_bounds[col + 1],
                y_bounds[row + 1],
            ]
            if cell_box != expected_cell_box:
                errors.append(f"{label}.rawSheetCellBox does not match canonical grid")
            elif _crop_rgba(sheet, expected_cell_box) != raw.rgba:
                errors.append(f"{label} raw crop does not match frozen raw sheet cell")

        context = review_contexts.get(str(group))
        mask_review = frame.get("maskReview")
        if not isinstance(mask_review, dict):
            errors.append(f"{label}.maskReview must be an object")
            continue

        if source_mode == SOURCE_MODE_GENUINE_TRANSPARENT:
            if context is not None:
                errors.append(f"{label} genuine-transparent source cannot use chroma review")
            try:
                transparent = _transparent_replay(raw, str(group), str(slot))
            except ValueError as exc:
                errors.append(f"{label} cannot replay genuine transparency: {exc}")
                continue
            if mask_values != transparent["eligibility"]:
                errors.append(f"{label} eligibility mask must exactly equal source alpha==0")
            if processed.rgba != transparent["processed"]:
                errors.append(
                    f"{label} genuine-transparent processing changed alpha-positive pixels or failed alpha-zero RGB normalization"
                )
            if actual_changed != transparent["changed"]:
                errors.append(
                    f"{label} genuine-transparent changed mask must exclude already canonical RGBA-zero pixels"
                )
            stats = transparent["stats"]
            expected_alpha_stats = {
                "transparentPixelCount": stats["transparentPixelCount"],
                "partialAlphaPixelCount": stats["partialAlphaPixelCount"],
                "opaquePixelCount": stats["opaquePixelCount"],
                "alphaPositiveComponentCount": len(transparent["componentSizes"]),
                "alphaZeroRgbCanonicalizedPixelCount": sum(transparent["changed"]),
            }
            if frame.get("alphaStats") != expected_alpha_stats:
                errors.append(f"{label}.alphaStats do not replay")
            policy = transparent["edgePolicy"]
            common_expected = {
                "requestedBackground": "transparent",
                "eligibilityOperation": TRANSPARENT_OPERATION,
                "eligibilityConnectivity": ALPHA_COMPONENT_CONNECTIVITY,
                "eligibilityEdgePolicy": policy["id"],
                "requiredSafeEdges": policy["requiredSafeEdges"],
                "allowedSubjectCropEdges": policy["allowedSubjectCropEdges"],
                "innerCropMinimumYRatio": policy["innerCropMinimumYRatio"],
                "automaticEligiblePixelCount": sum(transparent["eligibility"]),
                "automaticMaskPixelSha256": _binary_mask_hash(
                    raw.width, raw.height, transparent["eligibility"]
                ),
                "classifierEnclosedCandidatePixels": 0,
                "classifierEnclosedComponentCount": 0,
                "classifierAdjacentFringeCandidatePixels": 0,
                "classifierAdjacentFringeComponentCount": 0,
                "classifierReviewedOuterBackgroundHoleCandidatePixels": 0,
                "classifierReviewedOuterBackgroundHoleComponentCount": 0,
                "classifierResidualKeyColorCandidatePixels": 0,
                "classifierResidualKeyColorComponentCount": 0,
                "classifierResidualKeyColorReviewGrouping": (
                    RESIDUAL_KEY_REVIEW_GROUPING
                ),
                "classifierResidualKeyColorMaskPixelSha256": _binary_mask_hash(
                    raw.width,
                    raw.height,
                    [False] * (raw.width * raw.height),
                ),
            }
            for key, expected in common_expected.items():
                if frame.get(key) != expected:
                    errors.append(f"{label}.{key} does not replay")
            expected_review = {
                "mode": "genuine-transparent-alpha-zero",
                "automaticMaskPixelSha256": common_expected[
                    "automaticMaskPixelSha256"
                ],
                "reviewOperation": None,
                "reviewedComponents": [],
                "reviewedBackgroundHolePixelCount": 0,
                "reviewedBackgroundFringePixelCount": 0,
                "reviewedOuterBackgroundHolePixelCount": 0,
                "reviewedRetainedSubjectPixelCount": 0,
                "reviewedResidualKeySpillPixelCount": 0,
                "reviewedRetainedAuthoredColorPixelCount": 0,
            }
            if mask_review != expected_review:
                errors.append(f"{label}.maskReview does not match genuine-transparent contract")
            expected_operations = [
                "preserve every alpha-positive source pixel",
                "canonicalize RGB to zero only where source alpha is zero",
                "padded crop without alpha-positive pixel mutation",
                PREMULTIPLIED_RESAMPLE,
                "shared-scale canvas normalization",
            ]
            if frame.get("operations") != expected_operations:
                errors.append(f"{label}.operations do not match genuine-transparent pipeline")
        else:
            try:
                classification = _classify_raw_chroma(raw, str(group), str(slot))
            except ValueError as exc:
                errors.append(f"{label} cannot replay chroma classifier: {exc}")
                continue
            automatic = classification["automatic"]
            all_components: List[Tuple[List[bool], str]] = [
                *( (component, ENCLOSED_COMPONENT_TYPE) for component in classification["enclosedComponents"] ),
                *( (component, FRINGE_COMPONENT_TYPE) for component in classification["fringeComponents"] ),
                *( (component, OUTER_BACKGROUND_COMPONENT_TYPE) for component in classification["outerBackgroundComponents"] ),
                *( (component, RESIDUAL_KEY_COMPONENT_TYPE) for component in classification["residualKeyComponents"] ),
            ]
            allowed = [
                classification["candidate"][pixel]
                or classification["fringeCandidate"][pixel]
                or classification["outerBackgroundCandidate"][pixel]
                or classification["residualKeyCandidate"][pixel]
                for pixel in range(raw.width * raw.height)
            ]
            missing_automatic = sum(
                expected and not actual for expected, actual in zip(automatic, mask_values)
            )
            noncandidate = sum(
                actual and not possible for actual, possible in zip(mask_values, allowed)
            )
            if missing_automatic:
                errors.append(
                    f"{label} eligibility mask omits {missing_automatic} automatic border pixels"
                )
            if noncandidate:
                errors.append(
                    f"{label} eligibility mask selects {noncandidate} pixels outside classifier scope"
                )
            expected_processed = bytearray(raw.rgba)
            for pixel, selected in enumerate(mask_values):
                if not selected:
                    continue
                offset = pixel * 4
                if (
                    classification["fringeCandidate"][pixel]
                    or classification["residualKeyCandidate"][pixel]
                ):
                    expected_processed[offset : offset + 4] = classification[
                        "matteRgba"
                    ][offset : offset + 4]
                else:
                    expected_processed[offset : offset + 4] = b"\x00\x00\x00\x00"
            if processed.rgba != bytes(expected_processed):
                errors.append(
                    f"{label} processed RGBA does not equal hard-hole plus reviewed bounded soft-matte replay"
                )
            common_expected = {
                "requestedBackground": REQUESTED_BACKGROUND,
                "eligibilityOperation": CHROMA_OPERATION,
                "eligibilityConnectivity": CHROMA_CONNECTIVITY,
                "eligibilityEdgePolicy": classification["edgePolicy"],
                "requiredSafeEdges": classification["requiredSafeEdges"],
                "allowedSubjectCropEdges": classification["allowedSubjectCropEdges"],
                "backgroundSampleEdges": classification["backgroundSampleEdges"],
                "backgroundFloodSeedEdges": classification["backgroundFloodSeedEdges"],
                "innerCropMinimumYRatio": classification["innerCropMinimumYRatio"],
                "automaticEligiblePixelCount": sum(automatic),
                "automaticMaskPixelSha256": classification[
                    "automaticMaskPixelSha256"
                ],
                "classifierEnclosedCandidatePixels": sum(
                    sum(component) for component in classification["enclosedComponents"]
                ),
                "classifierEnclosedComponentCount": len(
                    classification["enclosedComponents"]
                ),
                "classifierAdjacentFringeCandidatePixels": sum(
                    classification["fringeCandidate"]
                ),
                "classifierAdjacentFringeComponentCount": len(
                    classification["fringeComponents"]
                ),
                "classifierReviewedOuterBackgroundHoleCandidatePixels": sum(
                    classification["outerBackgroundCandidate"]
                ),
                "classifierReviewedOuterBackgroundHoleComponentCount": len(
                    classification["outerBackgroundComponents"]
                ),
                "classifierResidualKeyColorCandidatePixels": sum(
                    classification["residualKeyCandidate"]
                ),
                "classifierResidualKeyColorComponentCount": len(
                    classification["residualKeyComponents"]
                ),
                "classifierResidualKeyColorReviewGrouping": (
                    RESIDUAL_KEY_REVIEW_GROUPING
                ),
                "classifierResidualKeyColorMaskPixelSha256": classification[
                    "residualKeyMaskPixelSha256"
                ],
            }
            for key, expected in common_expected.items():
                if frame.get(key) != expected:
                    errors.append(f"{label}.{key} does not replay")
            if frame.get("eligibilityThresholds") != classification["thresholds"]:
                errors.append(f"{label}.eligibilityThresholds do not replay")
            if frame.get("measuredBackgroundSamples") != _measured_background_samples(
                raw, str(group), str(slot)
            ):
                errors.append(f"{label}.measuredBackgroundSamples do not replay")
            if frame.get("softMatte") != classification["softMatte"]:
                errors.append(f"{label}.softMatte helper reference/parameters do not replay")
            for key in (
                "ambiguousEnclosedCandidatePixels",
                "unreviewedEnclosedCandidatePixels",
                "unreviewedResidualKeyColorCandidatePixels",
            ):
                if frame.get(key) != 0:
                    errors.append(f"{label}.{key} must be zero")

            reviewed_components: List[Dict[str, Any]] = []
            background_hole_pixels = 0
            background_fringe_pixels = 0
            outer_background_pixels = 0
            retained_subject_pixels = 0
            residual_key_spill_pixels = 0
            retained_authored_color_pixels = 0
            if context is None:
                if all_components:
                    errors.append(f"{label} has unreviewed chroma components")
                if mask_values != automatic:
                    errors.append(f"{label} automatic-only mask differs from replayed core")
                expected_review = {
                    "mode": "automatic-border-connected-only",
                    "automaticMaskPixelSha256": classification[
                        "automaticMaskPixelSha256"
                    ],
                    "reviewOperation": None,
                    "reviewedComponents": [],
                    "reviewedBackgroundHolePixelCount": 0,
                    "reviewedBackgroundFringePixelCount": 0,
                    "reviewedOuterBackgroundHolePixelCount": 0,
                    "reviewedRetainedSubjectPixelCount": 0,
                    "reviewedResidualKeySpillPixelCount": 0,
                    "reviewedRetainedAuthoredColorPixelCount": 0,
                }
            else:
                context["frames"] += 1
                summary = context["summary"]
                if not (
                    isinstance(cell_box, list)
                    and len(cell_box) == 4
                    and all(isinstance(value, int) for value in cell_box)
                ):
                    errors.append(f"{label}.rawSheetCellBox is invalid")
                    continue
                explicit_cell = _crop_mask(
                    context["maskValues"], context["mask"].width, cell_box
                )
                if explicit_cell != mask_values:
                    errors.append(
                        f"{label} eligibility mask does not match frozen explicit sheet mask cell"
                    )
                for component, component_type in all_components:
                    descriptor = _component_descriptor(
                        raw.width,
                        raw.height,
                        component,
                        str(slot),
                        cell_box,
                        component_type,
                    )
                    key = (
                        str(slot),
                        component_type,
                        str(descriptor["componentPixelSha256"]),
                    )
                    entry = context["entries"].get(key)
                    if entry is None:
                        errors.append(
                            f"{label} has unreviewed component {slot}/{component_type}/{descriptor['componentPixelSha256']}"
                        )
                        continue
                    for field in (
                        "slot",
                        "componentType",
                        "componentPixelSha256",
                        "cellBbox",
                        "sheetBbox",
                        "pixelCount",
                        "requiresLargeComponentAttention",
                    ):
                        if entry.get(field) != descriptor[field]:
                            errors.append(
                                f"{label} mask authoring ledger component has mismatched {field}"
                            )
                    selected = sum(
                        selected_pixel and member
                        for selected_pixel, member in zip(mask_values, component)
                    )
                    pixel_count = int(descriptor["pixelCount"])
                    if selected not in (0, pixel_count):
                        errors.append(
                            f"{label} explicit mask splits component {slot}/{component_type}/{descriptor['componentPixelSha256']}"
                        )
                    decision = entry.get("decision")
                    if decision == "background-fringe" and not _validate_fringe_distance(
                        component, automatic, raw.width, raw.height
                    ):
                        errors.append(
                            f"{label} background-fringe contains pixels farther than {FRINGE_MAX_DISTANCE}px four-neighbour distance from automatic border core"
                        )
                    expected_background_decision = (
                        RESIDUAL_KEY_REPAIR_DECISION
                        if component_type == RESIDUAL_KEY_COMPONENT_TYPE
                        else "background-fringe"
                        if component_type == FRINGE_COMPONENT_TYPE
                        else "background-hole"
                    )
                    expected_selected = (
                        pixel_count if decision == expected_background_decision else 0
                    )
                    if selected != expected_selected:
                        errors.append(
                            f"{label} explicit mask contradicts {decision} decision"
                        )
                    context["used"].add(key)
                    reviewed_components.append(
                        {
                            **descriptor,
                            "decision": decision,
                            "reviewer": entry.get("reviewer"),
                            "reviewedAt": entry.get("reviewedAt"),
                        }
                    )
                    if decision == "background-hole":
                        background_hole_pixels += pixel_count
                        if component_type == OUTER_BACKGROUND_COMPONENT_TYPE:
                            outer_background_pixels += pixel_count
                    elif decision == "background-fringe":
                        background_fringe_pixels += pixel_count
                    elif decision == "retain-subject":
                        retained_subject_pixels += pixel_count
                    elif decision == RESIDUAL_KEY_REPAIR_DECISION:
                        residual_key_spill_pixels += pixel_count
                    elif decision == RESIDUAL_KEY_RETAIN_DECISION:
                        retained_authored_color_pixels += pixel_count
                expected_review = {
                    "mode": "automatic-plus-reviewed-components",
                    "reviewOperation": MASK_REVIEW_OPERATION,
                    "reviewMethod": MASK_REVIEW_METHOD,
                    "automaticMaskPixelSha256": classification[
                        "automaticMaskPixelSha256"
                    ],
                    "explicitSheetMaskPath": summary.get("explicitSheetMaskPath"),
                    "explicitSheetMaskFileSha256": summary.get(
                        "explicitSheetMaskFileSha256"
                    ),
                    "explicitSheetMaskPixelSha256": summary.get(
                        "explicitSheetMaskPixelSha256"
                    ),
                    "maskAuthoringLedgerPath": summary.get("maskAuthoringLedgerPath"),
                    "maskAuthoringLedgerFileSha256": summary.get(
                        "maskAuthoringLedgerFileSha256"
                    ),
                    "rawSheetFileSha256": summary.get("rawSheetFileSha256"),
                    "reviewedComponents": reviewed_components,
                    "reviewedBackgroundHolePixelCount": background_hole_pixels,
                    "reviewedBackgroundFringePixelCount": background_fringe_pixels,
                    "reviewedOuterBackgroundHolePixelCount": outer_background_pixels,
                    "reviewedRetainedSubjectPixelCount": retained_subject_pixels,
                    "reviewedResidualKeySpillPixelCount": residual_key_spill_pixels,
                    "reviewedRetainedAuthoredColorPixelCount": (
                        retained_authored_color_pixels
                    ),
                }
            if mask_review != expected_review:
                errors.append(f"{label}.maskReview reviewed components do not replay")
            expected_operations = [
                "measured border-connected chroma core set to canonical RGBA zero",
                *(
                    [
                        "whole-component visual-review decisions applied from frozen explicit sheet mask",
                        "approved adjacent fringe receives bounded soft matte and despill",
                        "approved residual key-spill components receive exact frozen soft-matte repair",
                    ]
                    if context is not None
                    else []
                ),
                "padded crop without out-of-mask RGB mutation",
                PREMULTIPLIED_RESAMPLE,
                "shared-scale canvas normalization",
            ]
            if frame.get("operations") != expected_operations:
                errors.append(f"{label}.operations do not match opaque-chroma pipeline")

        if frame.get("maskBoundedColorMutationOnly") is not True:
            errors.append(f"{label}.maskBoundedColorMutationOnly must be true")
        if frame.get("postMaskGlobalColorDeletion") is not False:
            errors.append(f"{label}.postMaskGlobalColorDeletion must be false")
        if frame.get("globalRgbCleanup") is not False:
            errors.append(f"{label}.globalRgbCleanup must be false")
        if frame.get("colorDistanceDeletion") is not False:
            errors.append(f"{label}.colorDistanceDeletion must be false")

    if seen_paths != expected_paths:
        missing = sorted(expected_paths - seen_paths)
        extra = sorted(seen_paths - expected_paths)
        errors.append(
            f"provenance runtimePath set mismatch; missing={missing} extra={extra}"
        )
    expected_frame_counts = {"world": 8, "portrait": 4}
    for group, context in review_contexts.items():
        if context["frames"] != expected_frame_counts[group]:
            errors.append(
                f"{group} explicit mask review was not applied to every group frame"
            )
        unused = sorted(set(context["entries"]) - context["used"])
        if unused:
            errors.append(f"{group} mask authoring ledger has stale components: {unused}")


def _replay_pipeline_source_processing(
    root: Path, frame: Dict[str, Any]
) -> Dict[str, Any] | None:
    try:
        raw = decode_png(root / str(frame["rawPath"]))
        mask = decode_png(root / str(frame["maskPath"]))
        processed = decode_png(root / str(frame["processedPath"]))
    except (KeyError, OSError, PngDecodeError):
        return None
    eligibility = _mask_values(mask)
    if eligibility is None:
        return None
    group, slot = str(frame.get("group")), str(frame.get("slot"))
    source_mode = frame.get("sourceMode")
    changed = [
        raw.rgba[offset : offset + 4] != processed.rgba[offset : offset + 4]
        for offset in range(0, len(raw.rgba), 4)
    ]
    changed_hash = _binary_mask_hash(raw.width, raw.height, changed)
    visible_count = sum(alpha > 0 for alpha in processed.rgba[3::4])
    partial_count = sum(0 < alpha < 255 for alpha in processed.rgba[3::4])
    common = {
        "eligiblePixelCount": sum(eligibility),
        "eligiblePixelRatio": round(sum(eligibility) / float(len(eligibility)), 8),
        "visiblePixelCount": visible_count,
        "visibleBbox": _visible_bbox_from_rgba(processed),
        "maskPixelSha256": _binary_mask_hash(raw.width, raw.height, eligibility),
        "changedPixelCount": sum(changed),
        "changedPixelMaskSha256": changed_hash,
        "maskReview": frame.get("maskReview"),
        "processedDetachedForegroundGate": _static_detached_foreground_report(
            processed, "processed-cell"
        ),
        "maskBoundedColorMutationOnly": True,
        "postMaskGlobalColorDeletion": False,
    }
    if source_mode == SOURCE_MODE_GENUINE_TRANSPARENT:
        replay = _transparent_replay(raw, group, slot)
        stats = replay["stats"]
        policy = replay["edgePolicy"]
        return {
            "sourceMode": SOURCE_MODE_GENUINE_TRANSPARENT,
            "operation": TRANSPARENT_OPERATION,
            "connectivity": ALPHA_COMPONENT_CONNECTIVITY,
            "edgePolicy": policy["id"],
            "requiredSafeEdges": policy["requiredSafeEdges"],
            "allowedSubjectCropEdges": policy["allowedSubjectCropEdges"],
            "innerCropMinimumYRatio": policy["innerCropMinimumYRatio"],
            "automaticEligiblePixelCount": sum(replay["eligibility"]),
            "automaticMaskPixelSha256": _binary_mask_hash(
                raw.width, raw.height, replay["eligibility"]
            ),
            "transparentPixelCount": stats["transparentPixelCount"],
            "partialAlphaPixelCount": stats["partialAlphaPixelCount"],
            "opaquePixelCount": stats["opaquePixelCount"],
            "alphaPositiveComponentCount": len(replay["componentSizes"]),
            "alphaPositiveComponentPixelCounts": replay["componentSizes"],
            "alphaZeroRgbCanonicalizedPixelCount": sum(replay["changed"]),
            **common,
        }
    try:
        classification = _classify_raw_chroma(raw, group, slot)
    except ValueError:
        return None
    soft_candidates = [
        classification["fringeCandidate"][index]
        or classification["residualKeyCandidate"][index]
        for index in range(len(eligibility))
    ]
    hard = [
        eligible and not soft_candidates[index]
        for index, eligible in enumerate(eligibility)
    ]
    soft = [
        eligible and soft_candidates[index]
        for index, eligible in enumerate(eligibility)
    ]
    processed_zero = [alpha == 0 for alpha in processed.rgba[3::4]]
    processed_adjacent_to_zero = _adjacent_four(
        processed_zero, raw.width, raw.height
    )
    residual_boundary = [
        processed.rgba[index * 4 + 3] > 0
        and processed_adjacent_to_zero[index]
        and classification["proposalChanged"][index]
        and not eligibility[index]
        and not classification["candidate"][index]
        and not classification["fringeCandidate"][index]
        and not classification["outerBackgroundCandidate"][index]
        and not classification["residualKeyCandidate"][index]
        for index in range(len(eligibility))
    ]
    return {
        "requestedBackground": REQUESTED_BACKGROUND,
        "operation": CHROMA_OPERATION,
        "connectivity": CHROMA_CONNECTIVITY,
        "edgePolicy": classification["edgePolicy"],
        "requiredSafeEdges": classification["requiredSafeEdges"],
        "allowedSubjectCropEdges": classification["allowedSubjectCropEdges"],
        "backgroundSampleEdges": classification["backgroundSampleEdges"],
        "backgroundFloodSeedEdges": classification["backgroundFloodSeedEdges"],
        "innerCropMinimumYRatio": classification["innerCropMinimumYRatio"],
        "measuredBackgroundSamples": _measured_background_samples(raw, group, slot),
        "thresholds": classification["thresholds"],
        "candidatePixelCount": classification["candidatePixelCount"],
        "automaticEligiblePixelCount": sum(classification["automatic"]),
        "automaticEligiblePixelRatio": classification["automaticEligiblePixelRatio"],
        "automaticMaskPixelSha256": classification["automaticMaskPixelSha256"],
        "classifierEnclosedCandidatePixels": sum(classification["enclosed"]),
        "classifierEnclosedComponentCount": len(classification["enclosedComponents"]),
        "classifierAdjacentFringeCandidatePixels": sum(
            classification["fringeCandidate"]
        ),
        "classifierAdjacentFringeComponentCount": len(
            classification["fringeComponents"]
        ),
        "classifierAdjacentFringeReviewGrouping": FRINGE_REVIEW_GROUPING,
        "classifierReviewedOuterBackgroundHoleCandidatePixels": sum(
            classification["outerBackgroundCandidate"]
        ),
        "classifierReviewedOuterBackgroundHoleComponentCount": len(
            classification["outerBackgroundComponents"]
        ),
        "classifierResidualKeyColorCandidatePixels": sum(
            classification["residualKeyCandidate"]
        ),
        "classifierResidualKeyColorComponentCount": len(
            classification["residualKeyComponents"]
        ),
        "classifierResidualKeyColorReviewGrouping": RESIDUAL_KEY_REVIEW_GROUPING,
        "classifierResidualKeyColorMaskPixelSha256": classification[
            "residualKeyMaskPixelSha256"
        ],
        "softMatte": classification["softMatte"],
        "ambiguousEnclosedCandidatePixels": 0,
        "unreviewedEnclosedCandidatePixels": 0,
        "unreviewedResidualKeyColorCandidatePixels": 0,
        "partialAlphaPixelCount": partial_count,
        "hardTransparentPixelCount": sum(hard),
        "softMatteChangedPixelCount": sum(soft),
        "softMatteFringeChangedPixelCount": sum(
            eligible and classification["fringeCandidate"][index]
            for index, eligible in enumerate(eligibility)
        ),
        "softMatteResidualKeyRepairPixelCount": sum(
            eligible and classification["residualKeyCandidate"][index]
            for index, eligible in enumerate(eligibility)
        ),
        "outOfBandSoftMatteBoundaryPixelCount": sum(residual_boundary),
        "sourceMode": SOURCE_MODE_OPAQUE_CHROMA,
        **common,
    }


def _frame_review_count(frame: Dict[str, Any], key: str) -> int:
    review = frame.get("maskReview")
    if not isinstance(review, dict):
        return 0
    value = review.get(key)
    return value if isinstance(value, int) and value >= 0 else 0


def _frame_nonnegative_count(frame: Dict[str, Any], key: str) -> int:
    value = frame.get(key)
    return value if isinstance(value, int) and value >= 0 else 0


def _validate_pipeline_lock(
    root: Path, manifest: Dict[str, Any], result: AuditResult
) -> None:
    errors = result.errors
    generation = manifest.get("generation")
    if not isinstance(generation, dict):
        return
    metadata_path = _resolve_bundle_path(
        root,
        generation.get("pipelineMetadata"),
        "generation.pipelineMetadata",
        errors,
    )
    qc_path = _resolve_bundle_path(
        root, generation.get("qcSummary"), "generation.qcSummary", errors
    )
    qc: Dict[str, Any] | None = None
    provenance: Dict[str, Any] | None = None
    provenance_path = _resolve_bundle_path(
        root, generation.get("provenanceLedger"), "generation.provenanceLedger", errors
    )
    if provenance_path:
        loaded = _load_json(provenance_path, "provenance ledger", errors)
        if isinstance(loaded, dict):
            provenance = loaded
    if qc_path:
        loaded_qc = _load_json(qc_path, "QC summary", errors)
        if isinstance(loaded_qc, dict):
            qc = loaded_qc
        if qc is None or qc.get("status") != "pass":
            errors.append("QC summary must record status=pass")
        else:
            if qc.get("tool") != BUILDER_TOOL:
                errors.append("QC summary tool mismatch")
            checks = qc.get("checks")
            distinct = checks.get("distinctFrameRisks") if isinstance(checks, dict) else None
            source_check = (
                checks.get("maskBoundedSourceProcessing")
                if isinstance(checks, dict)
                else None
            )
            detached_check = (
                checks.get("staticDetachedForeground")
                if isinstance(checks, dict)
                else None
            )
            if not isinstance(distinct, dict) or distinct.get("status") != "pass":
                errors.append("QC distinctFrameRisks must record status=pass")
            else:
                for key in (
                    "worldExactDuplicatePairs",
                    "portraitExactDuplicatePairs",
                    "worldExactHorizontalMirrorPairs",
                    "worldExactVerticalMirrorPairs",
                    "worldNearDuplicatePairs",
                    "worldNearHorizontalMirrorPairs",
                    "worldNearVerticalMirrorPairs",
                ):
                    if distinct.get(key) != []:
                        errors.append(f"QC distinctFrameRisks.{key} must be empty")
                if distinct.get("nearVisualDistanceLimit") != NEAR_VISUAL_DISTANCE_LIMIT:
                    errors.append("QC nearVisualDistanceLimit does not match contract")
                if distinct.get("semanticDirectionAutomaticallyApproved") is not False:
                    errors.append("QC cannot automatically approve semantic direction")
                if distinct.get("blindDirectionReviewRequired") is not True:
                    errors.append("QC must retain blind direction review")
            if isinstance(checks, dict):
                world_contract = manifest.get("world")
                portrait_contract = manifest.get("portraits")
                world_runtime_size = (
                    world_contract.get("runtimeSize")
                    if isinstance(world_contract, dict)
                    else None
                )
                portrait_runtime_size = (
                    portrait_contract.get("runtimeSize")
                    if isinstance(portrait_contract, dict)
                    else None
                )
                for group, expected_count in (("world", 8), ("portrait", 4)):
                    frame_key = f"{group}FrameCount"
                    if checks.get(frame_key) != {
                        "status": "pass",
                        "actual": expected_count,
                        "expected": expected_count,
                    }:
                        errors.append(f"QC {frame_key} mismatch")
                if checks.get("outputDimensions") != {
                    "status": "pass",
                    "world": world_runtime_size,
                    "portraits": portrait_runtime_size,
                }:
                    errors.append("QC outputDimensions mismatch manifest")
            if not isinstance(source_check, dict) or (
                source_check.get("status") != "pass"
                or source_check.get("operations")
                != [CHROMA_OPERATION, TRANSPARENT_OPERATION]
                or source_check.get("reviewOperation") != MASK_REVIEW_OPERATION
                or source_check.get("ambiguousEnclosedCandidatePixels") != 0
                or source_check.get("unreviewedEnclosedCandidatePixels") != 0
                or source_check.get("unreviewedResidualKeyColorCandidatePixels")
                != 0
                or source_check.get("postMaskGlobalColorDeletion") is not False
            ):
                errors.append("QC maskBoundedSourceProcessing contract is incomplete")
            elif provenance is not None and isinstance(provenance.get("frames"), list):
                provenance_frames = [
                    frame for frame in provenance["frames"] if isinstance(frame, dict)
                ]
                count_fields = (
                    "classifierEnclosedCandidatePixels",
                    "classifierAdjacentFringeCandidatePixels",
                    "classifierResidualKeyColorCandidatePixels",
                    "reviewedBackgroundHolePixelCount",
                    "reviewedBackgroundFringePixelCount",
                    "reviewedOuterBackgroundHolePixelCount",
                    "reviewedRetainedSubjectPixelCount",
                    "reviewedResidualKeySpillPixelCount",
                    "reviewedRetainedAuthoredColorPixelCount",
                )
                expected_counts = {
                    "classifierEnclosedCandidatePixels": sum(
                        _frame_nonnegative_count(
                            frame, "classifierEnclosedCandidatePixels"
                        )
                        for frame in provenance_frames
                    ),
                    "classifierAdjacentFringeCandidatePixels": sum(
                        _frame_nonnegative_count(
                            frame, "classifierAdjacentFringeCandidatePixels"
                        )
                        for frame in provenance_frames
                    ),
                    "classifierResidualKeyColorCandidatePixels": sum(
                        _frame_nonnegative_count(
                            frame, "classifierResidualKeyColorCandidatePixels"
                        )
                        for frame in provenance_frames
                    ),
                    "reviewedBackgroundHolePixelCount": sum(
                        _frame_review_count(frame, "reviewedBackgroundHolePixelCount")
                        for frame in provenance_frames
                    ),
                    "reviewedBackgroundFringePixelCount": sum(
                        _frame_review_count(frame, "reviewedBackgroundFringePixelCount")
                        for frame in provenance_frames
                    ),
                    "reviewedOuterBackgroundHolePixelCount": sum(
                        _frame_review_count(
                            frame, "reviewedOuterBackgroundHolePixelCount"
                        )
                        for frame in provenance_frames
                    ),
                    "reviewedRetainedSubjectPixelCount": sum(
                        _frame_review_count(frame, "reviewedRetainedSubjectPixelCount")
                        for frame in provenance_frames
                    ),
                    "reviewedResidualKeySpillPixelCount": sum(
                        _frame_review_count(
                            frame, "reviewedResidualKeySpillPixelCount"
                        )
                        for frame in provenance_frames
                    ),
                    "reviewedRetainedAuthoredColorPixelCount": sum(
                        _frame_review_count(
                            frame, "reviewedRetainedAuthoredColorPixelCount"
                        )
                        for frame in provenance_frames
                    ),
                }
                for key in count_fields:
                    if source_check.get(key) != expected_counts[key]:
                        errors.append(f"QC maskBoundedSourceProcessing.{key} does not replay")
            if detached_check != {
                "status": "pass",
                "operation": DETACHED_FOREGROUND_OPERATION,
                "connectivity": DETACHED_FOREGROUND_CONNECTIVITY,
                "alphaThresholdInclusive": DETACHED_FOREGROUND_ALPHA_THRESHOLD,
                "minimumBlockingDetachedPixelCount": (
                    DETACHED_FOREGROUND_PIXEL_THRESHOLD
                ),
                "processedBlockingComponentCount": 0,
                "runtimeBlockingComponentCount": 0,
                "automaticDeletionApplied": False,
            }:
                errors.append("QC staticDetachedForeground contract is incomplete")
    if not metadata_path:
        return
    metadata = _load_json(metadata_path, "pipeline metadata", errors)
    if not isinstance(metadata, dict):
        return
    if metadata.get("schemaVersion") != 1:
        errors.append("pipeline schemaVersion must be 1")
    if metadata.get("tool") != BUILDER_TOOL or metadata.get("toolVersion") != BUILDER_VERSION:
        errors.append("pipeline tool/toolVersion must bind builder 3.1")
    if metadata.get("appearanceId") != manifest.get("appearanceId"):
        errors.append("pipeline appearanceId does not match manifest")
    if metadata.get("archetypeId") != manifest.get("archetypeId"):
        errors.append("pipeline archetypeId does not match manifest")
    if metadata.get("canonicalDirections") != list(CANONICAL_DIRECTIONS):
        errors.append("pipeline canonicalDirections are not canonical")
    if metadata.get("portraitSlots") != list(CANONICAL_PORTRAITS):
        errors.append("pipeline portraitSlots are not canonical")
    source_processing = metadata.get("sourceProcessing")
    if not isinstance(source_processing, dict):
        errors.append("pipeline sourceProcessing must be an object")
    else:
        if source_processing.get("requestedBackground") != generation.get(
            "requestedBackground"
        ):
            errors.append("pipeline sourceProcessing requestedBackground mismatch")
        if source_processing.get("sourceModes") != generation.get("sourceModes"):
            errors.append("pipeline sourceProcessing sourceModes mismatch")
        if source_processing.get("backgroundOperations") != {
            "opaqueChroma": CHROMA_OPERATION,
            "genuineTransparent": TRANSPARENT_OPERATION,
            "reviewedChromaComponents": MASK_REVIEW_OPERATION,
        } or source_processing.get("connectivity") != CHROMA_CONNECTIVITY:
            errors.append("pipeline sourceProcessing operations mismatch")
        if source_processing.get("edgePolicies") != {
            "world": WORLD_EDGE_POLICY,
            "portrait": PORTRAIT_EDGE_POLICY,
            "portraitInnerCropMinimumYRatio": PORTRAIT_INNER_CROP_MIN_Y_RATIO,
        }:
            errors.append("pipeline sourceProcessing edgePolicies mismatch")
        if source_processing.get("explicitMaskReviews") != generation.get(
            "explicitMaskReviews"
        ):
            errors.append("pipeline explicitMaskReviews do not match manifest")
        if source_processing.get("maskProvenance") != {
            "eligibilityMask": (
                "per-cell lossless binary L PNG; records the complete automatic "
                "plus reviewed background-eligible domain"
            ),
            "changedPixelMask": (
                "per-cell lossless binary L PNG; exactly marks decoded source "
                "RGBA pixels changed by source processing"
            ),
            "invariant": "no_source_rgba_change_outside_changed_pixel_mask",
        }:
            errors.append("pipeline sourceProcessing maskProvenance mismatch")
        if source_processing.get("residualKeyColorCandidates") != {
            "componentType": RESIDUAL_KEY_COMPONENT_TYPE,
            "grouping": RESIDUAL_KEY_REVIEW_GROUPING,
            "definition": (
                "global_soft_matte_proposal_changed_minus_automatic_"
                "enclosed_fringe_and_outer_scopes"
            ),
            "minimumPixelCount": 1,
            "repairDecision": RESIDUAL_KEY_REPAIR_DECISION,
            "retainDecision": RESIDUAL_KEY_RETAIN_DECISION,
            "unreviewedBehavior": "fail_closed",
        }:
            errors.append(
                "pipeline sourceProcessing residualKeyColorCandidates mismatch"
            )
        if (
            source_processing.get("globalRgbCleanup") is not False
            or source_processing.get("colorDistanceDeletion") is not False
        ):
            errors.append("pipeline must forbid global RGB/color-distance deletion")
        soft_matte = source_processing.get("softMatte")
        required_soft_matte = {
            "algorithm": SOFT_MATTE_ALGORITHM,
            "referenceScriptSha256": SOFT_MATTE_REFERENCE_SHA256,
            "transparentThreshold": SOFT_MATTE_TRANSPARENT_THRESHOLD,
            "opaqueThreshold": SOFT_MATTE_OPAQUE_THRESHOLD,
            "maximumFourNeighbourDistance": FRINGE_MAX_DISTANCE,
            "globalProposalApplied": False,
        }
        if not isinstance(soft_matte, dict) or any(
            soft_matte.get(key) != expected
            for key, expected in required_soft_matte.items()
        ):
            errors.append("pipeline softMatte helper reference/parameters mismatch")
    if metadata.get("staticDetachedForeground") != {
        "operation": DETACHED_FOREGROUND_OPERATION,
        "connectivity": DETACHED_FOREGROUND_CONNECTIVITY,
        "alphaThresholdInclusive": DETACHED_FOREGROUND_ALPHA_THRESHOLD,
        "minimumBlockingDetachedPixelCount": DETACHED_FOREGROUND_PIXEL_THRESHOLD,
        "automaticDeletionApplied": False,
        "failureAction": "regenerate_clean_source",
    }:
        errors.append("pipeline staticDetachedForeground contract mismatch")
    environment = metadata.get("environment")
    if not isinstance(environment, dict):
        errors.append("pipeline environment/dependency lock is missing")
    else:
        if (
            environment.get("schemaVersion") != 1
            or environment.get("tool") != BUILDER_TOOL
            or environment.get("toolVersion") != BUILDER_VERSION
        ):
            errors.append("pipeline environment must bind builder 3.1")
        script_path = _resolve_bundle_path(
            root, environment.get("scriptPath"), "environment.scriptPath", errors
        )
        if script_path and script_path.is_file():
            if environment.get("scriptSha256") != _sha256_file(script_path):
                errors.append("pipeline scriptSha256 does not match frozen script")
        versions = environment.get("versions")
        if not isinstance(versions, dict) or any(
            not isinstance(versions.get(key), str) or not versions.get(key)
            for key in ("python", "pythonImplementation", "pillow", "numpy")
        ):
            errors.append("pipeline dependency versions are incomplete")
        dependency_path = root / "source/dependencies.json"
        dependency_lock = _load_json(dependency_path, "dependency lock", errors)
        if dependency_lock != environment:
            errors.append("source/dependencies.json does not match pipeline environment")
        replay = metadata.get("replay")
        if not isinstance(replay, dict) or (
            replay.get("executable") != "python3"
            or replay.get("workingDirectory") != "{bundle}"
            or replay.get("script") != "{bundle}/source/tool/build_npc_art_bundle.py"
            or replay.get("scriptSha256") != environment.get("scriptSha256")
            or replay.get("dependencyLock") != "{bundle}/source/dependencies.json"
            or not isinstance(replay.get("arguments"), list)
        ):
            errors.append("pipeline replay record is incomplete or stale")
    if qc is not None and metadata.get("qc") != qc:
        errors.append("pipeline embedded QC does not match qc-summary.json")

    build_options = metadata.get("buildOptions")
    resolved_modes = generation.get("sourceModes")
    if not isinstance(build_options, dict):
        errors.append("pipeline buildOptions must be an object")
    elif isinstance(resolved_modes, dict):
        for group, key in (("world", "worldSourceMode"), ("portrait", "portraitSourceMode")):
            requested = build_options.get(key)
            if requested not in REQUESTED_SOURCE_MODES:
                errors.append(f"pipeline buildOptions.{key} is invalid")
            elif requested != SOURCE_MODE_AUTO and requested != resolved_modes.get(group):
                errors.append(
                    f"pipeline buildOptions.{key} contradicts resolved source mode"
                )

    inputs = metadata.get("inputs")
    if not isinstance(inputs, dict):
        errors.append("pipeline inputs must be an object")
    else:
        for group, key in (("world", "worldSheet"), ("portrait", "portraitSheet")):
            entry = inputs.get(key)
            path = root / f"source/raw/{group}-sheet.png"
            image = _decode_png_file(path, f"pipeline {group} input", errors)
            if not isinstance(entry, dict) or image is None:
                errors.append(f"pipeline inputs.{key} is incomplete")
                continue
            expected_fields = {
                "fileSha256": _sha256_file(path),
                "sourceMode": resolved_modes.get(group) if isinstance(resolved_modes, dict) else None,
                "decodedRgbaByteSha256": image.rgba_sha256,
                "godotCanonicalRgbaSha256": image.godot_canonical_rgba_sha256,
                "decodedRgbaSha256": image.canonical_rgba_sha256,
                "size": [image.width, image.height],
            }
            for field, expected in expected_fields.items():
                if entry.get(field) != expected:
                    errors.append(f"pipeline inputs.{key}.{field} mismatch")
            grid = entry.get("grid")
            if not isinstance(grid, dict) or grid.get("sourceMode") != expected_fields[
                "sourceMode"
            ]:
                errors.append(f"pipeline inputs.{key}.grid sourceMode mismatch")
            elif grid.get("sheetAlphaStats") != _alpha_distribution(image):
                errors.append(f"pipeline inputs.{key}.grid sheetAlphaStats mismatch")
            if isinstance(grid, dict) and provenance is not None and isinstance(
                provenance.get("frames"), list
            ):
                group_frames = [
                    frame
                    for frame in provenance["frames"]
                    if isinstance(frame, dict) and frame.get("group") == group
                ]
                grid_residual_expected = {
                    "classifierResidualKeyColorCandidatePixels": sum(
                        _frame_nonnegative_count(
                            frame, "classifierResidualKeyColorCandidatePixels"
                        )
                        for frame in group_frames
                    ),
                    "classifierResidualKeyColorComponentCount": sum(
                        _frame_nonnegative_count(
                            frame, "classifierResidualKeyColorComponentCount"
                        )
                        for frame in group_frames
                    ),
                    "reviewedResidualKeySpillPixelCount": sum(
                        _frame_review_count(
                            frame, "reviewedResidualKeySpillPixelCount"
                        )
                        for frame in group_frames
                    ),
                    "reviewedRetainedAuthoredColorPixelCount": sum(
                        _frame_review_count(
                            frame, "reviewedRetainedAuthoredColorPixelCount"
                        )
                        for frame in group_frames
                    ),
                }
                for field, expected in grid_residual_expected.items():
                    if grid.get(field) != expected:
                        errors.append(
                            f"pipeline inputs.{key}.grid.{field} does not replay"
                        )
        identity_entry = inputs.get("identityBoard")
        identity_path = root / "identity/identity-board.png"
        identity_image = _decode_png_file(identity_path, "pipeline identity input", errors)
        if isinstance(identity_entry, dict) and identity_image is not None:
            for field, expected in {
                "fileSha256": _sha256_file(identity_path),
                "decodedRgbaByteSha256": identity_image.rgba_sha256,
                "godotCanonicalRgbaSha256": identity_image.godot_canonical_rgba_sha256,
                "decodedRgbaSha256": identity_image.canonical_rgba_sha256,
                "size": [identity_image.width, identity_image.height],
            }.items():
                if identity_entry.get(field) != expected:
                    errors.append(f"pipeline inputs.identityBoard.{field} mismatch")
        else:
            errors.append("pipeline inputs.identityBoard is incomplete")
        for key, relative in (
            ("generationLedger", "source/generation-ledger.json"),
            ("ownershipLedger", "source/ownership-ledger.json"),
        ):
            entry = inputs.get(key)
            path = root / relative
            if not isinstance(entry, dict) or not path.is_file() or entry.get(
                "fileSha256"
            ) != _sha256_file(path):
                errors.append(f"pipeline inputs.{key}.fileSha256 mismatch")

    if provenance is not None and isinstance(provenance.get("frames"), list):
        provenance_frames = {
            (frame.get("group"), frame.get("slot")): frame
            for frame in provenance["frames"]
            if isinstance(frame, dict)
        }
        pipeline_frames = metadata.get("frames")
        if not isinstance(pipeline_frames, list) or len(pipeline_frames) != len(
            provenance_frames
        ):
            errors.append("pipeline frames must cover every provenance frame")
        else:
            seen: set[Tuple[Any, Any]] = set()
            for frame in pipeline_frames:
                if not isinstance(frame, dict):
                    errors.append("pipeline frames contains a non-object")
                    continue
                key = (frame.get("group"), frame.get("slot"))
                provenance_frame = provenance_frames.get(key)
                if provenance_frame is None or key in seen:
                    errors.append(f"pipeline frame is unknown or duplicate: {key}")
                    continue
                seen.add(key)
                for pipeline_field, provenance_field in (
                    ("sourceMode", "sourceMode"),
                    ("rawDecodedRgbaByteSha256", "rawDecodedRgbaByteSha256"),
                    ("rawGodotCanonicalRgbaSha256", "rawGodotCanonicalRgbaSha256"),
                    ("rawRgbaSha256", "rawRgbaSha256"),
                    ("processedCellDecodedRgbaByteSha256", "processedDecodedRgbaByteSha256"),
                    ("processedCellGodotCanonicalRgbaSha256", "processedGodotCanonicalRgbaSha256"),
                    ("processedCellRgbaSha256", "processedRgbaSha256"),
                    ("runtimeRgbaSha256", "runtimeRgbaSha256"),
                    (
                        "runtimeDetachedForegroundGate",
                        "runtimeDetachedForegroundGate",
                    ),
                ):
                    if frame.get(pipeline_field) != provenance_frame.get(provenance_field):
                        errors.append(
                            f"pipeline frame {key}.{pipeline_field} differs from provenance"
                        )
                processing = frame.get("sourceProcessing")
                if not isinstance(processing, dict):
                    errors.append(f"pipeline frame {key}.sourceProcessing is missing")
                else:
                    replayed = _replay_pipeline_source_processing(
                        root, provenance_frame
                    )
                    if replayed is None or processing != replayed:
                        errors.append(
                            f"pipeline frame {key}.sourceProcessing does not exactly replay"
                        )
                    if frame.get("chroma") != processing:
                        errors.append(
                            f"pipeline frame {key}.chroma must exactly alias sourceProcessing"
                        )
    expected_hashes = metadata.get("outputFileSha256")
    if not isinstance(expected_hashes, dict):
        errors.append("pipeline outputFileSha256 must be an object")
        return
    actual_paths = {
        path.relative_to(root).as_posix()
        for path in root.rglob("*")
        if path.is_file() and path != metadata_path
    }
    if set(expected_hashes) != actual_paths:
        errors.append("pipeline outputFileSha256 path set does not match bundle files")
    for relative, expected_hash in expected_hashes.items():
        if not isinstance(relative, str) or not isinstance(expected_hash, str):
            errors.append("pipeline outputFileSha256 entries must be string pairs")
            continue
        path = _resolve_bundle_path(
            root, relative, f"outputFileSha256[{relative}]", errors
        )
        if path and path.is_file() and _sha256_file(path) != expected_hash:
            errors.append(f"pipeline output hash mismatch: {relative}")


def audit_bundle(bundle_root: Path) -> AuditResult:
    root = bundle_root.expanduser().resolve()
    result = AuditResult(errors=[], warnings=[])
    if not root.is_dir():
        result.errors.append(f"bundle root is not a directory: {root}")
        return result

    manifest = _load_json(root / "npc-bundle.json", "npc-bundle.json", result.errors)
    valid_manifest = _validate_manifest(root, manifest, result) if manifest is not None else None
    if valid_manifest is None:
        return result

    _validate_prompt_and_generation_ledgers(root, valid_manifest, result)
    _validate_frame_provenance(root, valid_manifest, result)
    _validate_pipeline_lock(root, valid_manifest, result)

    world = valid_manifest.get("world")
    portraits = valid_manifest.get("portraits")
    mobility = valid_manifest.get("mobility")
    if not isinstance(world, dict) or not isinstance(portraits, dict) or mobility not in ("static", "mobile"):
        return result
    world_size = world.get("runtimeSize")
    portrait_size = portraits.get("runtimeSize")
    portrait_states = portraits.get("states")
    if not (
        isinstance(world_size, list)
        and len(world_size) == 2
        and all(isinstance(value, int) and value > 0 for value in world_size)
        and isinstance(portrait_size, list)
        and len(portrait_size) == 2
        and all(isinstance(value, int) and value > 0 for value in portrait_size)
        and isinstance(portrait_states, list)
        and all(isinstance(state, str) and state for state in portrait_states)
    ):
        return result

    world_root = root / "runtime" / "world"
    if not world_root.is_dir():
        result.errors.append(f"missing world directory: {world_root}")
        return result
    actual_direction_dirs = sorted(path.name for path in world_root.iterdir() if path.is_dir())
    if sorted(CANONICAL_DIRECTIONS) != actual_direction_dirs:
        result.errors.append(
            "runtime/world direction directories must be exactly: " + ", ".join(CANONICAL_DIRECTIONS)
        )

    required_names = ["idle-1.png"]
    if mobility == "mobile":
        required_names.extend(f"walk-{index}.png" for index in range(1, 5))

    images: Dict[Tuple[str, str], PngImage] = {}
    for direction in CANONICAL_DIRECTIONS:
        direction_root = world_root / direction
        if not direction_root.is_dir():
            result.errors.append(f"missing direction directory: {direction_root}")
            continue
        action_pngs = sorted(
            path.name
            for path in direction_root.iterdir()
            if path.is_file() and path.suffix.lower() == ".png" and re.match(r"^(idle|walk)-", path.name)
        )
        if action_pngs != sorted(required_names):
            result.errors.append(
                f"{direction} idle/walk PNGs must be exactly {sorted(required_names)}; found {action_pngs}"
            )
        for name in required_names:
            path = direction_root / name
            image = _validate_png(path, world_size, f"world frame {direction}/{name}", result.errors)
            if image is not None:
                images[(direction, name)] = image
                result.world_frames += 1

    portraits_root = root / "runtime" / "portraits"
    if not portraits_root.is_dir():
        result.errors.append(f"missing portraits directory: {portraits_root}")
    else:
        for state in portrait_states:
            image = _validate_png(
                portraits_root / f"{state}.png",
                portrait_size,
                f"portrait {state}",
                result.errors,
            )
            if image is not None:
                result.portrait_frames += 1

    by_hash: Dict[str, List[Tuple[str, str]]] = {}
    for key, image in images.items():
        by_hash.setdefault(image.rgba_sha256, []).append(key)
    for duplicates in by_hash.values():
        duplicate_directions = {direction for direction, _ in duplicates}
        if len(duplicate_directions) > 1:
            labels = ", ".join(f"{direction}/{name}" for direction, name in sorted(duplicates))
            result.errors.append(f"decoded-RGBA duplicate reused across directions: {labels}")

    for left_direction, right_direction in HORIZONTAL_MIRROR_PAIRS:
        for name in required_names:
            left = images.get((left_direction, name))
            right = images.get((right_direction, name))
            if left and right and left.width == right.width and left.height == right.height:
                if left.horizontal_mirror_sha256() == right.rgba_sha256:
                    result.errors.append(
                        f"exact horizontal mirror detected: {left_direction}/{name} -> {right_direction}/{name}"
                    )
    for lower_direction, upper_direction in VERTICAL_MIRROR_PAIRS:
        for name in required_names:
            lower = images.get((lower_direction, name))
            upper = images.get((upper_direction, name))
            if lower and upper and lower.width == upper.width and lower.height == upper.height:
                if lower.vertical_mirror_sha256() == upper.rgba_sha256:
                    result.errors.append(
                        f"exact vertical mirror detected: {lower_direction}/{name} -> {upper_direction}/{name}"
                    )

    result.warnings.append(
        "Pixel hashes cannot prove semantic facing; complete the required blind eight-direction visual audit."
    )
    return result


def _png_chunk(chunk_type: bytes, payload: bytes) -> bytes:
    crc = binascii.crc32(chunk_type + payload) & 0xFFFFFFFF
    return struct.pack(">I", len(payload)) + chunk_type + payload + struct.pack(">I", crc)


def _write_rgba_png(path: Path, width: int, height: int, rgba: bytes) -> None:
    if len(rgba) != width * height * 4:
        raise ValueError("RGBA fixture byte count does not match dimensions")
    scanlines = bytearray()
    row_bytes = width * 4
    for y in range(height):
        scanlines.append(0)
        scanlines.extend(rgba[y * row_bytes : (y + 1) * row_bytes])
    payload = (
        PNG_SIGNATURE
        + _png_chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
        + _png_chunk(b"IDAT", zlib.compress(bytes(scanlines)))
        + _png_chunk(b"IEND", b"")
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(payload)


def _horizontal_mirror_rgba(rgba: bytes, width: int, height: int) -> bytes:
    row_bytes = width * 4
    mirrored = bytearray(len(rgba))
    for y in range(height):
        for x in range(width):
            source = y * row_bytes + x * 4
            target = y * row_bytes + (width - 1 - x) * 4
            mirrored[target : target + 4] = rgba[source : source + 4]
    return bytes(mirrored)


def _write_gray_png(path: Path, width: int, height: int, values: Sequence[bool]) -> None:
    if len(values) != width * height:
        raise ValueError("grayscale fixture pixel count does not match dimensions")
    scanlines = bytearray()
    for y in range(height):
        scanlines.append(0)
        scanlines.extend(
            255 if value else 0 for value in values[y * width : (y + 1) * width]
        )
    payload = (
        PNG_SIGNATURE
        + _png_chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 0, 0, 0, 0))
        + _png_chunk(b"IDAT", zlib.compress(bytes(scanlines)))
        + _png_chunk(b"IEND", b"")
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(payload)


def _load_self_test_builder() -> Any:
    repository = Path(__file__).resolve().parents[4]
    builder_path = repository / "tools/build_npc_art_bundle.py"
    spec = importlib.util.spec_from_file_location(
        "beastbound_npc_bundle_builder_self_test", builder_path
    )
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load builder for self-test: {builder_path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def _self_test_world_sheet(cell_size: int = 64) -> Tuple[bytes, int, int]:
    width, height = cell_size * 4, cell_size * 2
    rgba = bytearray(bytes((255, 0, 255, 255)) * (width * height))
    colors = (
        (20, 200, 60),
        (35, 185, 110),
        (55, 210, 160),
        (75, 175, 210),
        (95, 220, 70),
        (115, 190, 125),
        (135, 225, 175),
        (155, 195, 225),
    )
    for index, color in enumerate(colors):
        row, col = divmod(index, 4)
        origin_x, origin_y = col * cell_size, row * cell_size
        for y in range(6, 58):
            for x in range(6, 58):
                if x in (6, 57) or y in (6, 57):
                    pixel = (200, 70, 200, 255)
                elif 15 <= x < 48 and 15 <= y < 48:
                    # Deliberate >1024px internal magenta clothing: exact manual
                    # retain-subject is required; size alone must never reject it.
                    pixel = (255, 0, 255, 255)
                else:
                    pixel = (*color, 255)
                offset = ((origin_y + y) * width + origin_x + x) * 4
                rgba[offset : offset + 4] = bytes(pixel)
        # A proposal-changing key-colour remnant far from every earlier scope.
        # Even slots use an exact 1px component; odd slots use 2px so the
        # negative suite can prove that partial component selection is rejected.
        residual_points = ((10, 10),) if index % 2 == 0 else ((10, 10), (11, 10))
        for x, y in residual_points:
            offset = ((origin_y + y) * width + origin_x + x) * 4
            rgba[offset : offset + 4] = bytes((200, 70, 200, 255))
    return bytes(rgba), width, height


def _self_test_portrait_sheet(cell_size: int = 64) -> Tuple[bytes, int, int]:
    width, height = cell_size * 2, cell_size * 2
    rgba = bytearray(width * height * 4)
    colors = ((40, 160, 70), (70, 190, 130), (100, 170, 200), (130, 210, 90))
    for index, color in enumerate(colors):
        row, col = divmod(index, 2)
        origin_x, origin_y = col * cell_size, row * cell_size
        for y in range(cell_size):
            for x in range(cell_size):
                offset = ((origin_y + y) * width + origin_x + x) * 4
                if (x + y) % 2:
                    rgba[offset : offset + 4] = bytes((9, 11, 13, 0))
        for y in range(6, 58):
            for x in range(8, 56):
                offset = ((origin_y + y) * width + origin_x + x) * 4
                rgba[offset : offset + 4] = bytes((*color, 255))
        # A partial-alpha, intentionally magenta subject pixel must survive.
        partial_offset = ((origin_y + 20) * width + origin_x + 20) * 4
        rgba[partial_offset : partial_offset + 4] = bytes((255, 0, 255, 128))
    return bytes(rgba), width, height


def _self_test_opaque_bottom_portrait(
    slot: str,
    cell_size: int = 64,
    outer_bottom_rgb: Tuple[int, int, int] = (200, 50, 200),
) -> PngImage:
    """Exercise top+outer-edge corner multiplicity for bottom-row portraits."""

    if slot not in ("smile", "concerned"):
        raise ValueError("bottom portrait fixture requires smile or concerned")
    col = CANONICAL_PORTRAITS.index(slot) % 2
    rgba = bytearray(bytes((255, 0, 255, 255)) * (cell_size * cell_size))
    outer_x = 0 if col == 0 else cell_size - 1
    for y in range(cell_size):
        offset = (y * cell_size + outer_x) * 4
        rgba[offset : offset + 4] = bytes((200, 50, 200, 255))
    corner_offset = outer_x * 4
    rgba[corner_offset : corner_offset + 4] = bytes((180, 80, 180, 255))
    outer_bottom_offset = ((cell_size - 1) * cell_size + outer_x) * 4
    rgba[outer_bottom_offset : outer_bottom_offset + 4] = bytes(
        (*outer_bottom_rgb, 255)
    )
    for y in range(16, 56):
        for x in range(16, 48):
            offset = (y * cell_size + x) * 4
            rgba[offset : offset + 4] = bytes((46, 112, 184, 255))
    return PngImage(cell_size, cell_size, bytes(rgba))


def _write_self_test_inputs(root: Path, builder: Any) -> Tuple[Path, Any]:
    inputs = root / "inputs"
    inputs.mkdir(parents=True, exist_ok=True)
    world_rgba, world_width, world_height = _self_test_world_sheet()
    portrait_rgba, portrait_width, portrait_height = _self_test_portrait_sheet()
    world_path = inputs / "world.png"
    portrait_path = inputs / "portrait.png"
    identity_path = inputs / "identity.png"
    _write_rgba_png(world_path, world_width, world_height, world_rgba)
    _write_rgba_png(portrait_path, portrait_width, portrait_height, portrait_rgba)
    identity_rgba = bytes((33, 55, 77, 255)) * (64 * 64)
    _write_rgba_png(identity_path, 64, 64, identity_rgba)
    world_prompt = inputs / "world.txt"
    portrait_prompt = inputs / "portrait.txt"
    world_prompt.write_text("self-test reviewed opaque world\n", encoding="utf-8")
    portrait_prompt.write_text("self-test genuine transparent portraits\n", encoding="utf-8")

    world_image = decode_png(world_path)
    explicit_values = [False] * (world_width * world_height)
    component_entries: List[Dict[str, Any]] = []
    for index, slot in enumerate(CANONICAL_DIRECTIONS):
        row, col = divmod(index, 4)
        cell_box = [col * 64, row * 64, (col + 1) * 64, (row + 1) * 64]
        raw = PngImage(64, 64, _crop_rgba(world_image, cell_box))
        classification = _classify_raw_chroma(raw, "world", slot)
        cell_selection = list(classification["automatic"])
        typed_components = [
            *((component, ENCLOSED_COMPONENT_TYPE) for component in classification["enclosedComponents"]),
            *((component, FRINGE_COMPONENT_TYPE) for component in classification["fringeComponents"]),
            *((component, OUTER_BACKGROUND_COMPONENT_TYPE) for component in classification["outerBackgroundComponents"]),
            *((component, RESIDUAL_KEY_COMPONENT_TYPE) for component in classification["residualKeyComponents"]),
        ]
        for component, component_type in typed_components:
            descriptor = _component_descriptor(
                64, 64, component, slot, cell_box, component_type
            )
            decision = (
                (
                    RESIDUAL_KEY_REPAIR_DECISION
                    if index % 4 in (0, 1)
                    else RESIDUAL_KEY_RETAIN_DECISION
                )
                if component_type == RESIDUAL_KEY_COMPONENT_TYPE
                else "retain-subject"
                if component_type == ENCLOSED_COMPONENT_TYPE
                else "background-fringe"
                if component_type == FRINGE_COMPONENT_TYPE
                else "background-hole"
            )
            if decision in (
                "background-hole",
                "background-fringe",
                RESIDUAL_KEY_REPAIR_DECISION,
            ):
                cell_selection = [
                    selected or member
                    for selected, member in zip(cell_selection, component)
                ]
            component_entries.append(
                {
                    **descriptor,
                    "decision": decision,
                    "reviewer": "independent-self-test-reviewer",
                    "reviewedAt": "2026-07-22T12:00:00+08:00",
                }
            )
        for y in range(64):
            sheet_start = (row * 64 + y) * world_width + col * 64
            cell_start = y * 64
            explicit_values[sheet_start : sheet_start + 64] = cell_selection[
                cell_start : cell_start + 64
            ]
    explicit_path = inputs / "world-mask.png"
    _write_gray_png(explicit_path, world_width, world_height, explicit_values)
    explicit_image = decode_png(explicit_path)
    ledger_path = inputs / "world-mask-ledger.json"
    ledger = {
        "schemaVersion": 1,
        "operation": MASK_REVIEW_OPERATION,
        "group": "world",
        "reviewMethod": MASK_REVIEW_METHOD,
        "source": {
            "rawSheetFileSha256": _sha256_file(world_path),
            "rawSheetDecodedRgbaByteSha256": world_image.rgba_sha256,
            "rawSheetGodotCanonicalRgbaSha256": world_image.godot_canonical_rgba_sha256,
            "rawSheetDecodedRgbaSha256": world_image.canonical_rgba_sha256,
            "explicitMaskFileSha256": _sha256_file(explicit_path),
            "explicitMaskPixelSha256": _canonical_mask_sha256(explicit_image),
            "width": world_width,
            "height": world_height,
        },
        "classifier": {
            "operation": CHROMA_OPERATION,
            "connectivity": CHROMA_CONNECTIVITY,
            "edgePolicy": WORLD_EDGE_POLICY,
            "fringeMaximumFourNeighbourDistance": FRINGE_MAX_DISTANCE,
            "fringeReviewGrouping": FRINGE_REVIEW_GROUPING,
            "residualKeyReviewGrouping": RESIDUAL_KEY_REVIEW_GROUPING,
            "largeEnclosedComponentReviewThreshold": LARGE_ENCLOSED_COMPONENT_REVIEW_THRESHOLD,
        },
        "components": component_entries,
    }
    ledger_path.write_text(json.dumps(ledger, indent=2) + "\n", encoding="utf-8")

    generation_path = inputs / "generation.json"
    generation = {
        "schemaVersion": 1,
        "tool": "image_gen",
        "model": "self-test-model-v3",
        "generatedAt": "2026-07-22T11:00:00+08:00",
        "requestedBackground": "mixed",
        "parameters": {"fixture": True},
        "negativeConstraints": ["no mirroring", "no labels"],
        "sources": {
            "identityBoard": {"fileSha256": _sha256_file(identity_path)},
            "worldSheet": {
                "fileSha256": _sha256_file(world_path),
                "worldPromptSha256": _sha256_file(world_prompt),
                "identityBoardSha256": _sha256_file(identity_path),
                "sourceMode": SOURCE_MODE_OPAQUE_CHROMA,
                "requestedBackground": REQUESTED_BACKGROUND,
            },
            "portraitSheet": {
                "fileSha256": _sha256_file(portrait_path),
                "portraitPromptSha256": _sha256_file(portrait_prompt),
                "identityBoardSha256": _sha256_file(identity_path),
                "sourceMode": SOURCE_MODE_GENUINE_TRANSPARENT,
                "requestedBackground": "transparent",
            },
        },
    }
    generation_path.write_text(
        json.dumps(generation, indent=2) + "\n", encoding="utf-8"
    )
    ownership_path = inputs / "ownership.json"
    ownership_path.write_text(
        json.dumps(
            {
                "schemaVersion": 1,
                "origin": "self-test generated original",
                "owner": "Beastbound test",
                "licenseBasis": "self-test fixture",
                "replacementPath": str(inputs.resolve()),
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    bundle = root / "bundle"
    options = builder.BuildOptions(
        role_id="npc_self_test_keeper_v1",
        display_name="Self-test keeper",
        world_sheet=world_path,
        portrait_sheet=portrait_path,
        identity_board=identity_path,
        world_prompt=world_prompt,
        portrait_prompt=portrait_prompt,
        generation_ledger=generation_path,
        ownership_ledger=ownership_path,
        output_dir=bundle,
        world_explicit_mask=explicit_path,
        world_mask_authoring_ledger=ledger_path,
        world_source_mode=SOURCE_MODE_AUTO,
        portrait_source_mode=SOURCE_MODE_GENUINE_TRANSPARENT,
        crop_padding=1,
        world_fit_scale=0.70,
        portrait_fit_scale=0.75,
    )
    builder.build_bundle(options)
    return bundle, builder


def _refresh_self_test_output_hashes(bundle: Path) -> None:
    metadata_path = bundle / "pipeline-meta.json"
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    metadata["outputFileSha256"] = {
        path.relative_to(bundle).as_posix(): _sha256_file(path)
        for path in sorted(bundle.rglob("*"))
        if path.is_file() and path != metadata_path
    }
    metadata_path.write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


def _expect_self_test_error(
    label: str, bundle: Path, expected_fragment: str
) -> str | None:
    result = audit_bundle(bundle)
    if result.ok or not any(expected_fragment in error for error in result.errors):
        return (
            f"{label}: expected error containing {expected_fragment!r}; "
            f"actual={result.errors}"
        )
    return None


def run_self_test() -> int:
    print("SELF-TEST START: building and auditing isolated builder-3.1 fixtures", flush=True)
    failures: List[str] = []
    with tempfile.TemporaryDirectory(prefix="beastbound-npc-audit-") as temporary:
        root = Path(temporary)
        try:
            builder = _load_self_test_builder()
            for bottom_slot in ("smile", "concerned"):
                bottom_fixture = _self_test_opaque_bottom_portrait(bottom_slot)
                bottom_col = CANONICAL_PORTRAITS.index(bottom_slot) % 2
                independent = _classify_raw_chroma(
                    bottom_fixture, "portrait", bottom_slot
                )
                reference = builder._classify_chroma(
                    builder.Image.frombytes(
                        "RGBA",
                        (bottom_fixture.width, bottom_fixture.height),
                        bottom_fixture.rgba,
                    ),
                    builder.chroma_edge_policy("portrait", bottom_col),
                )
                reference_domains = {
                    "candidate": reference.candidate,
                    "automatic": reference.automatic_eligible,
                    "enclosed": reference.candidate & ~reference.automatic_eligible,
                    "fringeCandidate": reference.fringe_candidate,
                    "outerBackgroundCandidate": reference.outer_background_candidate,
                    "residualKeyCandidate": reference.residual_key_candidate,
                }
                for key, reference_mask in reference_domains.items():
                    reference_values = [
                        bool(value) for value in reference_mask.reshape(-1)
                    ]
                    if independent[key] != reference_values:
                        failures.append(
                            f"opaque bottom-row portrait {bottom_slot} {key} differs from builder"
                        )
                if (
                    independent["matteRgba"] != reference.matte_rgba.tobytes()
                    or independent["softMatte"] != reference.metadata["softMatte"]
                ):
                    failures.append(
                        f"opaque bottom-row portrait {bottom_slot} soft-matte replay differs from builder"
                    )
                if independent["softMatte"]["sampledKeyRgb"] != [200, 50, 200]:
                    failures.append(
                        f"opaque bottom-row portrait {bottom_slot} did not preserve full-edge corner multiplicity"
                    )
                bottom_variant = _self_test_opaque_bottom_portrait(
                    bottom_slot, outer_bottom_rgb=(255, 0, 255)
                )
                independent_variant = _classify_raw_chroma(
                    bottom_variant, "portrait", bottom_slot
                )
                reference_variant = builder._classify_chroma(
                    builder.Image.frombytes(
                        "RGBA",
                        (bottom_variant.width, bottom_variant.height),
                        bottom_variant.rgba,
                    ),
                    builder.chroma_edge_policy("portrait", bottom_col),
                )
                if (
                    independent_variant["softMatte"]["sampledKeyRgb"]
                    != [228, 25, 228]
                    or independent_variant["softMatte"]
                    != reference_variant.metadata["softMatte"]
                    or independent_variant["matteRgba"]
                    != reference_variant.matte_rgba.tobytes()
                ):
                    failures.append(
                        f"opaque bottom-row portrait {bottom_slot} outer-bottom corner weighting does not replay"
                    )
            bundle, _ = _write_self_test_inputs(root, builder)
        except Exception as exc:  # pragma: no cover - diagnostic boundary
            print(f"SELF-TEST FAIL: cannot build builder-3.1 fixture: {exc}", file=sys.stderr)
            return 1

        valid = audit_bundle(bundle)
        if not valid.ok:
            failures.append("valid builder-3.1 mixed-source fixture was rejected: " + repr(valid.errors))

        detached_reports: Dict[int, Dict[str, Any]] = {}
        for detached_pixels in (127, 128):
            detached_rgba = bytearray(64 * 32 * 4)
            for pixel in range(detached_pixels):
                x, y = pixel % 16, pixel // 16
                offset = (y * 64 + x) * 4
                detached_rgba[offset : offset + 4] = bytes((90, 110, 130, 16))
            for y in range(10, 26):
                for x in range(32, 56):
                    offset = (y * 64 + x) * 4
                    detached_rgba[offset : offset + 4] = bytes((40, 80, 160, 255))
            detached_reports[detached_pixels] = _static_detached_foreground_report(
                PngImage(64, 32, bytes(detached_rgba)), "runtime"
            )
        if (
            detached_reports[127]["blockingComponents"] != []
            or len(detached_reports[128]["blockingComponents"]) != 1
            or detached_reports[128]["blockingComponents"][0]["pixelCount"]
            != 128
            or detached_reports[128]["alphaThresholdInclusive"] != 16
        ):
            failures.append(
                "detached foreground alpha=16 boundary did not allow 127px and block 128px"
            )

        provenance_path = bundle / "source/provenance.json"
        provenance = json.loads(provenance_path.read_text(encoding="utf-8"))
        archived_review = json.loads(
            (
                bundle
                / "source/reviewed-masks/world-mask-authoring-ledger.json"
            ).read_text(encoding="utf-8")
        )
        if not any(
            entry.get("componentType") == ENCLOSED_COMPONENT_TYPE
            and entry.get("requiresLargeComponentAttention") is True
            and entry.get("decision") == "retain-subject"
            for entry in archived_review.get("components", [])
            if isinstance(entry, dict)
        ):
            failures.append(
                "large enclosed internal-magenta component lacked exact retain-subject review"
            )
        residual_entries = [
            entry
            for entry in archived_review.get("components", [])
            if isinstance(entry, dict)
            and entry.get("componentType") == RESIDUAL_KEY_COMPONENT_TYPE
        ]
        if (
            len(residual_entries) != len(CANONICAL_DIRECTIONS)
            or sum(entry.get("pixelCount") == 1 for entry in residual_entries) != 4
            or {
                entry.get("decision") for entry in residual_entries
            }
            != {RESIDUAL_KEY_REPAIR_DECISION, RESIDUAL_KEY_RETAIN_DECISION}
        ):
            failures.append(
                "residual fixture did not bind every 1px/2px component to both exact v3.1 decisions"
            )
        residual_entries_by_key = {
            (
                entry.get("slot"),
                entry.get("componentPixelSha256"),
            ): entry
            for entry in residual_entries
        }
        residual_replay_failed = False
        for residual_frame in (
            frame
            for frame in provenance["frames"]
            if frame.get("group") == "world"
        ):
            raw_image = decode_png(bundle / residual_frame["rawPath"])
            processed_image = decode_png(bundle / residual_frame["processedPath"])
            eligibility_values = _mask_values(
                decode_png(bundle / residual_frame["maskPath"])
            )
            changed_values = _mask_values(
                decode_png(bundle / residual_frame["changedPixelMaskPath"])
            )
            classification = _classify_raw_chroma(
                raw_image, "world", str(residual_frame["slot"])
            )
            if eligibility_values is None or changed_values is None:
                residual_replay_failed = True
                continue
            for component in classification["residualKeyComponents"]:
                component_hash = _component_hash(
                    raw_image.width, raw_image.height, component
                )
                entry = residual_entries_by_key.get(
                    (residual_frame["slot"], component_hash)
                )
                if entry is None:
                    residual_replay_failed = True
                    continue
                repair = entry.get("decision") == RESIDUAL_KEY_REPAIR_DECISION
                for pixel, member in enumerate(component):
                    if not member:
                        continue
                    offset = pixel * 4
                    expected_rgba = (
                        classification["matteRgba"][offset : offset + 4]
                        if repair
                        else raw_image.rgba[offset : offset + 4]
                    )
                    actual_rgba = processed_image.rgba[offset : offset + 4]
                    expected_changed = (
                        expected_rgba != raw_image.rgba[offset : offset + 4]
                    )
                    if (
                        actual_rgba != expected_rgba
                        or eligibility_values[pixel] is not repair
                        or changed_values[pixel] is not expected_changed
                    ):
                        residual_replay_failed = True
        if residual_replay_failed:
            failures.append(
                "residual repair did not equal the frozen matte proposal or retain did not stay byte-exact"
            )
        world_frame = next(
            frame for frame in provenance["frames"] if frame["group"] == "world"
        )
        world_raw = decode_png(bundle / world_frame["rawPath"])
        world_processed = decode_png(bundle / world_frame["processedPath"])
        internal_offset = (20 * world_raw.width + 20) * 4
        if (
            world_raw.rgba[internal_offset : internal_offset + 4]
            != b"\xff\x00\xff\xff"
            or world_processed.rgba[internal_offset : internal_offset + 4]
            != world_raw.rgba[internal_offset : internal_offset + 4]
        ):
            failures.append("reviewed internal magenta clothing was not retained byte-exact")
        portrait_frame = next(
            frame for frame in provenance["frames"] if frame["group"] == "portrait"
        )
        portrait_raw = decode_png(bundle / portrait_frame["rawPath"])
        portrait_processed = decode_png(bundle / portrait_frame["processedPath"])
        partial_offsets = [
            offset
            for offset in range(0, len(portrait_raw.rgba), 4)
            if 0 < portrait_raw.rgba[offset + 3] < 255
        ]
        if not partial_offsets or any(
            portrait_raw.rgba[offset : offset + 4]
            != portrait_processed.rgba[offset : offset + 4]
            for offset in partial_offsets
        ):
            failures.append("partial-alpha/internal-magenta subject pixels were not preserved")

        changed_case = root / "changed-mask-negative"
        shutil.copytree(bundle, changed_case)
        changed_provenance_path = changed_case / "source/provenance.json"
        changed_provenance = json.loads(
            changed_provenance_path.read_text(encoding="utf-8")
        )
        changed_frame = next(
            frame
            for frame in changed_provenance["frames"]
            if frame["group"] == "portrait"
        )
        shutil.copyfile(
            changed_case / changed_frame["maskPath"],
            changed_case / changed_frame["changedPixelMaskPath"],
        )
        changed_mask_image = decode_png(
            changed_case / changed_frame["changedPixelMaskPath"]
        )
        changed_frame["changedPixelMaskFileSha256"] = _sha256_file(
            changed_case / changed_frame["changedPixelMaskPath"]
        )
        changed_frame["changedPixelMaskSha256"] = _canonical_mask_sha256(
            changed_mask_image
        )
        changed_frame["changedPixelCount"] = changed_frame["eligiblePixelCount"]
        changed_provenance_path.write_text(
            json.dumps(changed_provenance, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        changed_pipeline_path = changed_case / "pipeline-meta.json"
        changed_pipeline = json.loads(changed_pipeline_path.read_text(encoding="utf-8"))
        changed_pipeline_frame = next(
            frame
            for frame in changed_pipeline["frames"]
            if frame["group"] == "portrait" and frame["slot"] == changed_frame["slot"]
        )
        changed_pipeline_frame["sourceProcessing"]["changedPixelCount"] = changed_frame[
            "changedPixelCount"
        ]
        changed_pipeline_frame["sourceProcessing"]["changedPixelMaskSha256"] = changed_frame[
            "changedPixelMaskSha256"
        ]
        changed_pipeline_path.write_text(
            json.dumps(changed_pipeline, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        _refresh_self_test_output_hashes(changed_case)
        error = _expect_self_test_error(
            "exact changed-mask negative",
            changed_case,
            "changed-pixel mask is not the exact raw-to-processed RGBA diff",
        )
        if error:
            failures.append(error)

        alias_case = root / "dual-mask-path-alias-negative"
        shutil.copytree(bundle, alias_case)
        alias_provenance_path = alias_case / "source/provenance.json"
        alias_provenance = json.loads(
            alias_provenance_path.read_text(encoding="utf-8")
        )
        alias_frame = next(
            frame
            for frame in alias_provenance["frames"]
            if frame["group"] == "portrait"
        )
        alias_frame["changedPixelMaskPath"] = alias_frame["maskPath"]
        alias_provenance_path.write_text(
            json.dumps(alias_provenance, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        _refresh_self_test_output_hashes(alias_case)
        error = _expect_self_test_error(
            "dual-mask resolved-path alias negative",
            alias_case,
            "eligibility and changed-pixel masks must resolve to distinct files",
        )
        if error:
            failures.append(error)

        hardlink_case = root / "dual-mask-hardlink-negative"
        shutil.copytree(bundle, hardlink_case)
        hardlink_provenance = json.loads(
            (hardlink_case / "source/provenance.json").read_text(encoding="utf-8")
        )
        hardlink_frame = next(
            frame
            for frame in hardlink_provenance["frames"]
            if frame["group"] == "portrait"
        )
        hardlink_mask_path = hardlink_case / hardlink_frame["maskPath"]
        hardlink_changed_path = hardlink_case / hardlink_frame[
            "changedPixelMaskPath"
        ]
        hardlink_changed_path.unlink()
        os.link(hardlink_mask_path, hardlink_changed_path)
        _refresh_self_test_output_hashes(hardlink_case)
        error = _expect_self_test_error(
            "dual-mask hardlink alias negative",
            hardlink_case,
            "eligibility and changed-pixel masks must not share one filesystem file",
        )
        if error:
            failures.append(error)

        old_operation_case = root / "old-residual-operation-negative"
        shutil.copytree(bundle, old_operation_case)
        old_operation_ledger_path = (
            old_operation_case
            / "source/reviewed-masks/world-mask-authoring-ledger.json"
        )
        old_operation_ledger = json.loads(
            old_operation_ledger_path.read_text(encoding="utf-8")
        )
        old_operation_ledger["operation"] = "reviewed_chroma_components_v2"
        old_operation_ledger_path.write_text(
            json.dumps(old_operation_ledger, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        _refresh_self_test_output_hashes(old_operation_case)
        error = _expect_self_test_error(
            "old residual operation negative",
            old_operation_case,
            "world mask authoring ledger operation mismatch",
        )
        if error:
            failures.append(error)

        missing_residual_case = root / "missing-1px-residual-review-negative"
        shutil.copytree(bundle, missing_residual_case)
        missing_residual_ledger_path = (
            missing_residual_case
            / "source/reviewed-masks/world-mask-authoring-ledger.json"
        )
        missing_residual_ledger = json.loads(
            missing_residual_ledger_path.read_text(encoding="utf-8")
        )
        missing_entry = next(
            entry
            for entry in missing_residual_ledger["components"]
            if entry.get("componentType") == RESIDUAL_KEY_COMPONENT_TYPE
            and entry.get("pixelCount") == 1
        )
        missing_residual_ledger["components"].remove(missing_entry)
        missing_residual_ledger_path.write_text(
            json.dumps(missing_residual_ledger, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        _refresh_self_test_output_hashes(missing_residual_case)
        error = _expect_self_test_error(
            "missing 1px residual review negative",
            missing_residual_case,
            "has unreviewed component",
        )
        if error:
            failures.append(error)

        partial_residual_case = root / "partial-residual-component-negative"
        shutil.copytree(bundle, partial_residual_case)
        partial_entry = next(
            entry
            for entry in residual_entries
            if entry.get("pixelCount") == 2
            and entry.get("decision") == RESIDUAL_KEY_REPAIR_DECISION
        )
        partial_provenance = json.loads(
            (partial_residual_case / "source/provenance.json").read_text(
                encoding="utf-8"
            )
        )
        partial_frame = next(
            frame
            for frame in partial_provenance["frames"]
            if frame.get("group") == "world"
            and frame.get("slot") == partial_entry.get("slot")
        )
        partial_raw = decode_png(partial_residual_case / partial_frame["rawPath"])
        partial_classification = _classify_raw_chroma(
            partial_raw, "world", str(partial_frame["slot"])
        )
        partial_component = next(
            component
            for component in partial_classification["residualKeyComponents"]
            if _component_hash(
                partial_raw.width, partial_raw.height, component
            )
            == partial_entry["componentPixelSha256"]
        )
        partial_mask_path = partial_residual_case / partial_frame["maskPath"]
        partial_mask_image = decode_png(partial_mask_path)
        partial_mask_values = _mask_values(partial_mask_image)
        assert partial_mask_values is not None
        first_member = next(
            index for index, member in enumerate(partial_component) if member
        )
        partial_mask_values[first_member] = False
        _write_gray_png(
            partial_mask_path,
            partial_mask_image.width,
            partial_mask_image.height,
            partial_mask_values,
        )
        _refresh_self_test_output_hashes(partial_residual_case)
        error = _expect_self_test_error(
            "partial residual component negative",
            partial_residual_case,
            "explicit mask splits component",
        )
        if error:
            failures.append(error)

        stale_case = root / "stale-ledger-negative"
        shutil.copytree(bundle, stale_case)
        stale_ledger_path = (
            stale_case / "source/reviewed-masks/world-mask-authoring-ledger.json"
        )
        stale_ledger = json.loads(stale_ledger_path.read_text(encoding="utf-8"))
        stale_entry = dict(
            next(
                entry
                for entry in stale_ledger["components"]
                if entry.get("componentType") == RESIDUAL_KEY_COMPONENT_TYPE
            )
        )
        stale_entry["componentPixelSha256"] = "f" * 64
        stale_ledger["components"].append(stale_entry)
        stale_ledger_path.write_text(
            json.dumps(stale_ledger, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        _refresh_self_test_output_hashes(stale_case)
        error = _expect_self_test_error(
            "stale ledger negative", stale_case, "mask authoring ledger has stale components"
        )
        if error:
            failures.append(error)

        residual_hash_case = root / "residual-mask-hash-negative"
        shutil.copytree(bundle, residual_hash_case)
        residual_hash_provenance_path = (
            residual_hash_case / "source/provenance.json"
        )
        residual_hash_provenance = json.loads(
            residual_hash_provenance_path.read_text(encoding="utf-8")
        )
        residual_hash_frame = next(
            frame
            for frame in residual_hash_provenance["frames"]
            if frame.get("group") == "world"
        )
        residual_hash_frame["classifierResidualKeyColorMaskPixelSha256"] = (
            "0" * 64
        )
        residual_hash_provenance_path.write_text(
            json.dumps(residual_hash_provenance, ensure_ascii=False, indent=2)
            + "\n",
            encoding="utf-8",
        )
        _refresh_self_test_output_hashes(residual_hash_case)
        error = _expect_self_test_error(
            "residual mask hash negative",
            residual_hash_case,
            "classifierResidualKeyColorMaskPixelSha256 does not replay",
        )
        if error:
            failures.append(error)

        hash_case = root / "dual-hash-negative"
        shutil.copytree(bundle, hash_case)
        hash_provenance_path = hash_case / "source/provenance.json"
        hash_provenance = json.loads(hash_provenance_path.read_text(encoding="utf-8"))
        hash_provenance["frames"][0]["runtimeGodotCanonicalRgbaSha256"] = "0" * 64
        hash_provenance_path.write_text(
            json.dumps(hash_provenance, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        _refresh_self_test_output_hashes(hash_case)
        error = _expect_self_test_error(
            "dual hash drift negative",
            hash_case,
            "runtimeGodotCanonicalRgbaSha256 does not match decoded pixels",
        )
        if error:
            failures.append(error)

        for gate_field, threshold_field, wrong_value in (
            ("processedDetachedForegroundGate", "alphaThresholdInclusive", 17),
            (
                "runtimeDetachedForegroundGate",
                "minimumBlockingDetachedPixelCount",
                129,
            ),
        ):
            detached_metadata_case = root / f"{gate_field}-metadata-negative"
            shutil.copytree(bundle, detached_metadata_case)
            detached_provenance_path = (
                detached_metadata_case / "source/provenance.json"
            )
            detached_provenance = json.loads(
                detached_provenance_path.read_text(encoding="utf-8")
            )
            detached_provenance["frames"][0][gate_field][threshold_field] = (
                wrong_value
            )
            detached_provenance_path.write_text(
                json.dumps(detached_provenance, ensure_ascii=False, indent=2)
                + "\n",
                encoding="utf-8",
            )
            _refresh_self_test_output_hashes(detached_metadata_case)
            error = _expect_self_test_error(
                f"{gate_field} metadata negative",
                detached_metadata_case,
                f"{gate_field} does not replay decoded alpha components",
            )
            if error:
                failures.append(error)

        detached_block_case = root / "detached-128px-blocking-negative"
        shutil.copytree(bundle, detached_block_case)
        detached_block_provenance_path = (
            detached_block_case / "source/provenance.json"
        )
        detached_block_provenance = json.loads(
            detached_block_provenance_path.read_text(encoding="utf-8")
        )
        detached_block_frame = next(
            frame
            for frame in detached_block_provenance["frames"]
            if frame.get("group") == "world"
        )
        detached_block_runtime_path = (
            detached_block_case / detached_block_frame["runtimePath"]
        )
        detached_block_runtime = decode_png(detached_block_runtime_path)
        detached_block_rgba = bytearray(detached_block_runtime.rgba)
        for y in range(8):
            for x in range(16):
                offset = (y * detached_block_runtime.width + x) * 4
                detached_block_rgba[offset : offset + 4] = bytes(
                    (90, 110, 130, DETACHED_FOREGROUND_ALPHA_THRESHOLD)
                )
        _write_rgba_png(
            detached_block_runtime_path,
            detached_block_runtime.width,
            detached_block_runtime.height,
            bytes(detached_block_rgba),
        )
        detached_block_runtime = decode_png(detached_block_runtime_path)
        detached_block_report = _static_detached_foreground_report(
            detached_block_runtime, "runtime"
        )
        detached_block_frame.update(
            {
                "runtimeFileSha256": _sha256_file(detached_block_runtime_path),
                "runtimeDecodedRgbaByteSha256": detached_block_runtime.rgba_sha256,
                "runtimeGodotCanonicalRgbaSha256": (
                    detached_block_runtime.godot_canonical_rgba_sha256
                ),
                "runtimeRgbaSha256": detached_block_runtime.canonical_rgba_sha256,
                "runtimeDetachedForegroundGate": detached_block_report,
            }
        )
        detached_block_provenance_path.write_text(
            json.dumps(detached_block_provenance, ensure_ascii=False, indent=2)
            + "\n",
            encoding="utf-8",
        )
        detached_block_pipeline_path = detached_block_case / "pipeline-meta.json"
        detached_block_pipeline = json.loads(
            detached_block_pipeline_path.read_text(encoding="utf-8")
        )
        detached_block_pipeline_frame = next(
            frame
            for frame in detached_block_pipeline["frames"]
            if frame.get("group") == detached_block_frame.get("group")
            and frame.get("slot") == detached_block_frame.get("slot")
        )
        detached_block_pipeline_frame["runtimeRgbaSha256"] = (
            detached_block_runtime.canonical_rgba_sha256
        )
        detached_block_pipeline_frame["runtimeDetachedForegroundGate"] = (
            detached_block_report
        )
        detached_block_pipeline_path.write_text(
            json.dumps(detached_block_pipeline, ensure_ascii=False, indent=2)
            + "\n",
            encoding="utf-8",
        )
        _refresh_self_test_output_hashes(detached_block_case)
        error = _expect_self_test_error(
            "detached 128px synchronized metadata negative",
            detached_block_case,
            "runtime has detached foreground component(s) at or above 128 pixels",
        )
        if error:
            failures.append(error)

        detached_pipeline_case = root / "detached-pipeline-contract-negative"
        shutil.copytree(bundle, detached_pipeline_case)
        detached_pipeline_path = detached_pipeline_case / "pipeline-meta.json"
        detached_pipeline = json.loads(
            detached_pipeline_path.read_text(encoding="utf-8")
        )
        detached_pipeline["staticDetachedForeground"][
            "minimumBlockingDetachedPixelCount"
        ] = 127
        detached_pipeline_path.write_text(
            json.dumps(detached_pipeline, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        error = _expect_self_test_error(
            "detached pipeline contract negative",
            detached_pipeline_case,
            "pipeline staticDetachedForeground contract mismatch",
        )
        if error:
            failures.append(error)

        source_mode_case = root / "source-mode-ledger-negative"
        shutil.copytree(bundle, source_mode_case)
        generation_ledger_path = source_mode_case / "source/generation-ledger.json"
        generation_ledger = json.loads(
            generation_ledger_path.read_text(encoding="utf-8")
        )
        generation_ledger["sources"]["worldSheet"].pop("sourceMode", None)
        generation_ledger_path.write_text(
            json.dumps(generation_ledger, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        _refresh_self_test_output_hashes(source_mode_case)
        error = _expect_self_test_error(
            "explicit source-mode ledger negative",
            source_mode_case,
            "generation ledger sources.worldSheet.sourceMode must be opaque-chroma",
        )
        if error:
            failures.append(error)

        mirror_case = root / "mirror-negative"
        shutil.copytree(bundle, mirror_case)
        west_path = mirror_case / "runtime/world/west/idle-1.png"
        east_path = mirror_case / "runtime/world/east/idle-1.png"
        west = decode_png(west_path)
        _write_rgba_png(
            east_path,
            west.width,
            west.height,
            _horizontal_mirror_rgba(west.rgba, west.width, west.height),
        )
        _refresh_self_test_output_hashes(mirror_case)
        error = _expect_self_test_error(
            "mirror negative",
            mirror_case,
            "exact horizontal mirror detected: west/idle-1.png -> east/idle-1.png",
        )
        if error:
            failures.append(error)

        core = [False] * 9
        core[0] = True
        out_of_range = [False] * 9
        out_of_range[4] = True
        if _validate_fringe_distance(out_of_range, core, 9, 1):
            failures.append("out-of-range 4-neighbour fringe at distance 4 was accepted")

    if failures:
        print(f"SELF-TEST FAIL: {len(failures)} failure(s)", file=sys.stderr)
        for failure in failures:
            print(f"  - {failure}", file=sys.stderr)
        return 1
    print(
        "SELF-TEST PASS: all builder-3.1 positive and negative cases "
        "(bottom-row portrait full-edge corner multiset, mixed source + partial "
        "alpha/internal magenta, exact 1px/2px residual review with repair/retain, "
        "old operation, missing/partial/stale residual entries, residual mask-hash "
        "forgery, exact changed mask, resolved-path/hardlink dual-mask aliases, "
        "processed/runtime detached metadata, alpha=16 127/128px detached bound, "
        "synchronized 128px blocking island, pipeline detached contract, dual hash "
        "drift, explicit source-mode ledger, mirror, 3px fringe bound, and "
        "large-component review)"
    )
    return 0


def _print_result(root: Path, result: AuditResult, json_output: bool) -> None:
    if json_output:
        print(
            json.dumps(
                {
                    "bundle": str(root),
                    "ok": result.ok,
                    "worldFrames": result.world_frames,
                    "portraitFrames": result.portrait_frames,
                    "errors": result.errors,
                    "warnings": result.warnings,
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        return
    status = "PASS" if result.ok else "FAIL"
    print(
        f"{status}: {root} (world frames: {result.world_frames}, portraits: {result.portrait_frames})"
    )
    for warning in result.warnings:
        print(f"WARNING: {warning}")
    for error in result.errors:
        print(f"ERROR: {error}", file=sys.stderr)


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("bundle", nargs="?", type=Path, help="NPC production bundle root")
    parser.add_argument("--json", action="store_true", help="emit machine-readable JSON")
    parser.add_argument("--self-test", action="store_true", help="run isolated temporary fixtures")
    args = parser.parse_args(argv)
    if args.self_test:
        if args.bundle is not None:
            parser.error("bundle cannot be supplied with --self-test")
        return run_self_test()
    if args.bundle is None:
        parser.error("bundle is required unless --self-test is used")
    root = args.bundle.expanduser().resolve()
    result = audit_bundle(root)
    _print_result(root, result, args.json)
    return 0 if result.ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
