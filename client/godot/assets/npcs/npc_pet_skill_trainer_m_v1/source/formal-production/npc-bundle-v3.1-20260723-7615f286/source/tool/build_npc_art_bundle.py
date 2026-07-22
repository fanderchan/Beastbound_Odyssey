#!/usr/bin/env python3
"""Build a deterministic static Beastbound NPC art bundle.

The builder consumes an identity board and two lossless source sheets:

* a 2x4 world sheet in canonical row-major direction order; and
* a 2x2 dialogue-portrait sheet in explicit row-major state order.

It does not generate, redraw, mirror, or semantically approve art. Genuine
transparent sources preserve every alpha-positive pixel. Legacy opaque chroma
sources use a measured border core plus separately reviewed, narrowly adjacent
soft-matte components. The exact changed-pixel mask is archived and every pixel
outside it is preserved until an explicitly recorded premultiplied-alpha resize.
Structural failures are closed before a one-step atomic publication into a new
directory.
"""

from __future__ import annotations

import argparse
import contextlib
import ctypes
import datetime as dt
import errno
import fcntl
import hashlib
import io
import json
import os
import platform
import re
import shutil
import stat
import sys
import tempfile
from collections import deque
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator, Sequence

import numpy as np
import PIL
from PIL import Image, ImageDraw, ImageFont


TOOL_NAME = "build_npc_art_bundle.py"
TOOL_VERSION = "3.1.0"
SCHEMA_VERSION = 1
WORLD_ROWS = 2
WORLD_COLS = 4
PORTRAIT_ROWS = 2
PORTRAIT_COLS = 2
WORLD_SIZE = 256
PORTRAIT_SIZE = 512
DEFAULT_KEY = (255, 0, 255)
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
MASK_REVIEW_DECISIONS = (
    "background-hole",
    "background-fringe",
    "retain-subject",
    RESIDUAL_KEY_REPAIR_DECISION,
    RESIDUAL_KEY_RETAIN_DECISION,
)
CHROMA_CONNECTIVITY = 4
ALPHA_COMPONENT_CONNECTIVITY = 8
MIN_DETACHED_ALPHA_COMPONENT_PIXELS = 8
MAX_ALPHA_POSITIVE_COMPONENTS = 8
SOURCE_MODE_AUTO = "auto"
SOURCE_MODE_OPAQUE_CHROMA = "opaque-chroma"
SOURCE_MODE_GENUINE_TRANSPARENT = "genuine-transparent"
SOURCE_MODES = (
    SOURCE_MODE_AUTO,
    SOURCE_MODE_OPAQUE_CHROMA,
    SOURCE_MODE_GENUINE_TRANSPARENT,
)
WORLD_EDGE_POLICY = "all-edges-safe-v1"
PORTRAIT_EDGE_POLICY = "portrait-bust-crop-v1"
PORTRAIT_INNER_CROP_MIN_Y_RATIO = 0.65
EDGE_NAMES = ("top", "bottom", "left", "right")
CHROMA_BORDER_MIN_CHANNEL = 128
CHROMA_BORDER_MIN_DOMINANCE = 64
CHROMA_BORDER_MAX_RED_BLUE_DELTA = 96
CHROMA_MIN_CHANNEL_SLACK = 8
CHROMA_MIN_DOMINANCE_SLACK = 8
CHROMA_MAX_RED_BLUE_DELTA_SLACK = 8
# Frozen project adaptation of the imagegen remove_chroma_key.py soft-matte
# behavior (Apache-2.0 reference SHA below). The project applies it only inside
# reviewed fringe components no farther than FRINGE_MAX_DISTANCE from the
# automatic border background, plus exact residual components explicitly marked
# repair-key-spill.  The global proposal is never applied wholesale.
SOFT_MATTE_REFERENCE_SHA256 = (
    "3f7b9b14ad5c90f37618bc1c16a039a2076abca12ddc41b3ae470e2b1cad6c0e"
)
SOFT_MATTE_ALGORITHM = "imagegen-soft-matte-bounded-v1"
SOFT_MATTE_TRANSPARENT_THRESHOLD = 12.0
SOFT_MATTE_OPAQUE_THRESHOLD = 220.0
SOFT_MATTE_KEY_DOMINANCE_THRESHOLD = 16.0
SOFT_MATTE_ALPHA_NOISE_FLOOR = 8
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
MAX_VISIBLE_HEIGHT_DRIFT = 0.15
NEAR_VISUAL_DISTANCE_LIMIT = 0.007
VISUAL_FINGERPRINT_SIZE = 96
PREMULTIPLIED_RESAMPLE = "premultiplied_alpha_bilinear"
DEFAULT_DIRECTIONS = (
    "south",
    "southwest",
    "west",
    "northwest",
    "north",
    "northeast",
    "east",
    "southeast",
)
DEFAULT_PORTRAIT_SLOTS = ("neutral", "speaking", "smile", "concerned")
ROLE_PATTERN = re.compile(r"^(?:npc_)?[a-z][a-z0-9_]*_v[1-9][0-9]*$")


class NpcBundleBuildError(ValueError):
    """A deterministic validation failure safe to present through the CLI."""


@dataclass(frozen=True)
class BuildOptions:
    role_id: str
    world_sheet: Path
    portrait_sheet: Path
    identity_board: Path
    world_prompt: Path
    portrait_prompt: Path
    generation_ledger: Path
    ownership_ledger: Path
    output_dir: Path
    display_name: str | None = None
    world_explicit_mask: Path | None = None
    world_mask_authoring_ledger: Path | None = None
    portrait_explicit_mask: Path | None = None
    portrait_mask_authoring_ledger: Path | None = None
    world_source_mode: str = SOURCE_MODE_AUTO
    portrait_source_mode: str = SOURCE_MODE_AUTO
    source_edge_margin: int = 4
    world_safe_margin: int = 8
    portrait_safe_margin: int = 12
    crop_padding: int = 4
    world_fit_scale: float = 0.86
    portrait_fit_scale: float = 0.90


@dataclass(frozen=True)
class FrozenInput:
    label: str
    original_path: Path
    data: bytes
    file_sha256: str


@dataclass(frozen=True)
class FrozenInputs:
    world_sheet: FrozenInput
    portrait_sheet: FrozenInput
    identity_board: FrozenInput
    world_prompt: FrozenInput
    portrait_prompt: FrozenInput
    generation_ledger: FrozenInput
    ownership_ledger: FrozenInput
    world_prompt_text: str
    portrait_prompt_text: str
    generation: dict[str, object]
    ownership: dict[str, object]
    world_explicit_mask: FrozenInput | None = None
    world_mask_authoring_ledger: FrozenInput | None = None
    portrait_explicit_mask: FrozenInput | None = None
    portrait_mask_authoring_ledger: FrozenInput | None = None
    world_mask_review: dict[str, object] | None = None
    portrait_mask_review: dict[str, object] | None = None


@dataclass(frozen=True)
class ChromaClassification:
    rgba: np.ndarray
    candidate: np.ndarray
    automatic_eligible: np.ndarray
    enclosed_components: tuple[np.ndarray, ...]
    fringe_candidate: np.ndarray
    fringe_components: tuple[np.ndarray, ...]
    outer_background_candidate: np.ndarray
    outer_background_components: tuple[np.ndarray, ...]
    residual_key_candidate: np.ndarray
    residual_key_components: tuple[np.ndarray, ...]
    matte_rgba: np.ndarray
    metadata: dict[str, object]


@dataclass(frozen=True)
class ExplicitMaskReview:
    group: str
    mask_snapshot: FrozenInput
    ledger_snapshot: FrozenInput
    mask_image: Image.Image
    ledger: dict[str, object]


@dataclass(frozen=True)
class TransparentClassification:
    rgba: np.ndarray
    eligibility: np.ndarray
    processed_rgba: np.ndarray
    changed_pixels: np.ndarray
    metadata: dict[str, object]


@dataclass
class PreparedFrame:
    group: str
    slot: str
    row: int
    col: int
    cell_box: tuple[int, int, int, int]
    raw_cell: Image.Image
    eligibility_mask: Image.Image
    changed_pixel_mask: Image.Image
    processed_cell: Image.Image
    crop: Image.Image
    crop_visible_bbox: tuple[int, int, int, int]
    metadata: dict[str, object]


@dataclass
class RenderedFrame:
    prepared: PreparedFrame
    runtime: Image.Image
    metadata: dict[str, object]


def grid_boundaries(length: int, count: int) -> tuple[int, ...]:
    """Return deterministic integer cell boundaries covering the exact axis."""

    if length < count:
        raise NpcBundleBuildError(
            f"grid axis length {length} cannot provide {count} positive cells"
        )
    return tuple(index * length // count for index in range(count + 1))


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def canonical_pixel_hash(image: Image.Image, mode: str) -> str:
    canonical = image.convert(mode)
    digest = hashlib.sha256()
    digest.update(
        f"{canonical.width}x{canonical.height}:{mode}\n".encode("ascii")
    )
    digest.update(canonical.tobytes())
    return digest.hexdigest()


def rgba_hash(image: Image.Image) -> str:
    """Full decoded RGBA signature: dimensions/mode prefix plus all RGBA bytes."""

    return canonical_pixel_hash(image, "RGBA")


def rgba_bytes_hash(image: Image.Image) -> str:
    """SHA-256 of the full decoded RGBA byte stream without a prefix."""

    return sha256_bytes(image.convert("RGBA").tobytes())


def godot_canonical_rgba_hash(image: Image.Image) -> str:
    """Godot review signature with RGB zeroed anywhere alpha is not fully opaque."""

    rgba = np.asarray(image.convert("RGBA"), dtype=np.uint8).copy()
    rgba[rgba[:, :, 3] < 255, :3] = 0
    digest = hashlib.sha256()
    digest.update(f"{image.width}x{image.height}:RGBA\n".encode("ascii"))
    digest.update(rgba.tobytes())
    return digest.hexdigest()


def mask_hash(image: Image.Image) -> str:
    return canonical_pixel_hash(image, "L")


def _write_json(path: Path, value: object) -> None:
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _validate_new_output(output_dir: Path) -> None:
    if os.path.lexists(output_dir):
        raise NpcBundleBuildError(
            "output path already exists; NPC production bundles are immutable, so "
            f"choose a new output directory: {output_dir}"
        )


@contextlib.contextmanager
def _locked_output(output_dir: Path) -> Iterator[None]:
    """Serialize builders targeting one path without placing a lock in the repo."""

    resolved = output_dir.expanduser().resolve(strict=False)
    lock_root = Path(tempfile.gettempdir()) / "beastbound-npc-bundle-locks"
    lock_root.mkdir(parents=True, exist_ok=True)
    lock_name = hashlib.sha256(str(resolved).encode("utf-8")).hexdigest() + ".lock"
    descriptor = os.open(lock_root / lock_name, os.O_CREAT | os.O_RDWR, 0o600)
    try:
        fcntl.flock(descriptor, fcntl.LOCK_EX)
        yield
    finally:
        fcntl.flock(descriptor, fcntl.LOCK_UN)
        os.close(descriptor)


def validate_options(options: BuildOptions) -> None:
    if not ROLE_PATTERN.fullmatch(options.role_id):
        raise NpcBundleBuildError(
            "role-id must be a lowercase stable ID ending in _vN, for example "
            "stable_keeper_m_v1"
        )
    if options.source_edge_margin < 1:
        raise NpcBundleBuildError("source-edge-margin must be positive")
    if options.crop_padding < 1:
        raise NpcBundleBuildError("crop-padding must be positive")
    if options.world_safe_margin < 4 or options.portrait_safe_margin < 4:
        raise NpcBundleBuildError("runtime safe margins must be at least 4 pixels")
    if options.world_safe_margin * 2 >= WORLD_SIZE:
        raise NpcBundleBuildError("world-safe-margin leaves no drawable area")
    if options.portrait_safe_margin * 2 >= PORTRAIT_SIZE:
        raise NpcBundleBuildError("portrait-safe-margin leaves no drawable area")
    if not 0.1 <= options.world_fit_scale <= 1.0:
        raise NpcBundleBuildError("world-fit-scale must be between 0.1 and 1.0")
    if not 0.1 <= options.portrait_fit_scale <= 1.0:
        raise NpcBundleBuildError("portrait-fit-scale must be between 0.1 and 1.0")
    for group, source_mode in (
        ("world", options.world_source_mode),
        ("portrait", options.portrait_source_mode),
    ):
        if source_mode not in SOURCE_MODES:
            raise NpcBundleBuildError(
                f"{group}-source-mode must be one of: " + ", ".join(SOURCE_MODES)
            )
    for group, mask_path, ledger_path in (
        (
            "world",
            options.world_explicit_mask,
            options.world_mask_authoring_ledger,
        ),
        (
            "portrait",
            options.portrait_explicit_mask,
            options.portrait_mask_authoring_ledger,
        ),
    ):
        if (mask_path is None) != (ledger_path is None):
            raise NpcBundleBuildError(
                f"{group} explicit mask and mask authoring ledger must be supplied together"
            )
        if mask_path is not None and ledger_path is not None:
            if mask_path.expanduser().resolve(strict=False) == ledger_path.expanduser().resolve(
                strict=False
            ):
                raise NpcBundleBuildError(
                    f"{group} explicit mask and authoring ledger must be different files"
                )
            source_mode = (
                options.world_source_mode
                if group == "world"
                else options.portrait_source_mode
            )
            if source_mode == SOURCE_MODE_GENUINE_TRANSPARENT:
                raise NpcBundleBuildError(
                    f"{group} genuine-transparent sources cannot use an explicit "
                    "chroma review mask"
                )
    input_paths = [
        options.world_sheet,
        options.portrait_sheet,
        options.identity_board,
        options.world_prompt,
        options.portrait_prompt,
        options.generation_ledger,
        options.ownership_ledger,
    ]
    input_paths.extend(
        path
        for path in (
            options.world_explicit_mask,
            options.world_mask_authoring_ledger,
            options.portrait_explicit_mask,
            options.portrait_mask_authoring_ledger,
        )
        if path is not None
    )
    resolved_output = options.output_dir.expanduser().resolve(strict=False)
    if any(path.expanduser().resolve(strict=False) == resolved_output for path in input_paths):
        raise NpcBundleBuildError("output-dir cannot also be an input file")


def _freeze_file(path: Path, label: str) -> FrozenInput:
    expanded = path.expanduser()
    flags = os.O_RDONLY | getattr(os, "O_CLOEXEC", 0) | getattr(os, "O_NOFOLLOW", 0)
    try:
        descriptor = os.open(expanded, flags)
    except OSError as exc:
        raise NpcBundleBuildError(
            f"{label} must be a readable regular non-symlink file: {path}: {exc}"
        ) from exc
    try:
        metadata = os.fstat(descriptor)
        if not stat.S_ISREG(metadata.st_mode):
            raise NpcBundleBuildError(
                f"{label} must be a regular non-symlink file: {path}"
            )
        chunks: list[bytes] = []
        while True:
            chunk = os.read(descriptor, 1024 * 1024)
            if not chunk:
                break
            chunks.append(chunk)
        data = b"".join(chunks)
    except OSError as exc:
        raise NpcBundleBuildError(f"cannot read {label}: {path}: {exc}") from exc
    finally:
        os.close(descriptor)
    if not data:
        raise NpcBundleBuildError(f"{label} is empty: {path}")
    absolute_path = Path(os.path.abspath(os.fspath(expanded)))
    return FrozenInput(label, absolute_path, data, sha256_bytes(data))


def _png_header(
    snapshot: FrozenInput,
    *,
    allowed_color_types: tuple[int, ...] = (2, 6),
    expected_format: str = "8-bit RGB or RGBA",
) -> tuple[int, int, int, int, int]:
    data = snapshot.data
    signature = b"\x89PNG\r\n\x1a\n"
    if len(data) < 33 or not data.startswith(signature):
        raise NpcBundleBuildError(f"{snapshot.label} must be a lossless PNG")
    if data[12:16] != b"IHDR" or int.from_bytes(data[8:12], "big") != 13:
        raise NpcBundleBuildError(f"{snapshot.label} has an invalid PNG IHDR")
    width = int.from_bytes(data[16:20], "big")
    height = int.from_bytes(data[20:24], "big")
    bit_depth, color_type, compression, filter_method, interlace = data[24:29]
    if width <= 0 or height <= 0:
        raise NpcBundleBuildError(f"{snapshot.label} has invalid PNG dimensions")
    if bit_depth != 8 or color_type not in allowed_color_types:
        raise NpcBundleBuildError(
            f"{snapshot.label} must be an {expected_format} PNG; "
            f"found bitDepth={bit_depth} colorType={color_type}"
        )
    if compression != 0 or filter_method != 0 or interlace != 0:
        raise NpcBundleBuildError(
            f"{snapshot.label} must use standard compression/filter and no interlace"
        )
    return width, height, bit_depth, color_type, interlace


def _load_png_snapshot(
    snapshot: FrozenInput, *, require_opaque: bool
) -> Image.Image:
    _png_header(snapshot)
    try:
        with Image.open(io.BytesIO(snapshot.data)) as opened:
            if opened.format != "PNG":
                raise NpcBundleBuildError(
                    f"{snapshot.label} must be a lossless PNG"
                )
            image = opened.convert("RGBA")
            image.load()
    except NpcBundleBuildError:
        raise
    except (OSError, ValueError) as exc:
        raise NpcBundleBuildError(
            f"cannot decode {snapshot.label}: {snapshot.original_path}: {exc}"
        ) from exc
    if not require_opaque:
        return image
    alpha = np.asarray(image, dtype=np.uint8)[:, :, 3]
    non_opaque = int(np.count_nonzero(alpha != 255))
    if non_opaque:
        raise NpcBundleBuildError(
            f"{snapshot.label} must be an untouched opaque chroma source; found "
            f"{non_opaque} non-opaque pixels"
        )
    return image


def _load_binary_mask_snapshot(snapshot: FrozenInput) -> Image.Image:
    _png_header(
        snapshot,
        allowed_color_types=(0,),
        expected_format="8-bit grayscale binary-mask",
    )
    try:
        with Image.open(io.BytesIO(snapshot.data)) as opened:
            if opened.format != "PNG" or opened.mode != "L":
                raise NpcBundleBuildError(
                    f"{snapshot.label} must decode as an 8-bit grayscale PNG"
                )
            image = opened.copy()
            image.load()
    except NpcBundleBuildError:
        raise
    except (OSError, ValueError) as exc:
        raise NpcBundleBuildError(
            f"cannot decode {snapshot.label}: {snapshot.original_path}: {exc}"
        ) from exc
    values = np.asarray(image, dtype=np.uint8)
    invalid = int(np.count_nonzero((values != 0) & (values != 255)))
    if invalid:
        raise NpcBundleBuildError(
            f"{snapshot.label} must contain only binary values 0 and 255; "
            f"found {invalid} non-binary pixels"
        )
    return image


def _decode_text(snapshot: FrozenInput) -> str:
    try:
        value = snapshot.data.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise NpcBundleBuildError(f"{snapshot.label} must be UTF-8 text") from exc
    if not value.strip():
        raise NpcBundleBuildError(f"{snapshot.label} must not be blank")
    return value


def _decode_json(snapshot: FrozenInput) -> dict[str, object]:
    try:
        value = json.loads(_decode_text(snapshot))
    except json.JSONDecodeError as exc:
        raise NpcBundleBuildError(f"{snapshot.label} is invalid JSON: {exc}") from exc
    if not isinstance(value, dict):
        raise NpcBundleBuildError(f"{snapshot.label} root must be an object")
    return value


def _required_string(value: dict[str, object], key: str, label: str) -> str:
    result = value.get(key)
    if not isinstance(result, str) or not result.strip():
        raise NpcBundleBuildError(f"{label}.{key} must be a non-empty string")
    return result


def _validate_generation_ledger(
    ledger: dict[str, object], snapshots: dict[str, FrozenInput]
) -> None:
    if ledger.get("schemaVersion") != SCHEMA_VERSION:
        raise NpcBundleBuildError("generation ledger schemaVersion must be 1")
    if ledger.get("tool") != "image_gen":
        raise NpcBundleBuildError("generation ledger tool must be image_gen")
    _required_string(ledger, "model", "generation ledger")
    timestamp = _required_string(ledger, "generatedAt", "generation ledger")
    try:
        parsed_time = dt.datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
    except ValueError as exc:
        raise NpcBundleBuildError("generation ledger generatedAt must be ISO-8601") from exc
    if parsed_time.tzinfo is None:
        raise NpcBundleBuildError("generation ledger generatedAt must include a timezone")
    requested_background = ledger.get("requestedBackground")
    if requested_background not in (REQUESTED_BACKGROUND, "transparent", "mixed"):
        raise NpcBundleBuildError(
            "generation ledger requestedBackground must be #FF00FF, transparent, or mixed"
        )
    if not isinstance(ledger.get("parameters"), dict):
        raise NpcBundleBuildError("generation ledger parameters must be an object")
    negative = ledger.get("negativeConstraints")
    if not isinstance(negative, list) or not negative or any(
        not isinstance(item, str) or not item.strip() for item in negative
    ):
        raise NpcBundleBuildError(
            "generation ledger negativeConstraints must be a non-empty string array"
        )
    sources = ledger.get("sources")
    if not isinstance(sources, dict):
        raise NpcBundleBuildError("generation ledger sources must be an object")
    for key in ("identityBoard", "worldSheet", "portraitSheet"):
        snapshot = snapshots[key]
        entry = sources.get(key)
        if not isinstance(entry, dict):
            raise NpcBundleBuildError(f"generation ledger sources.{key} must be an object")
        if entry.get("fileSha256") != snapshot.file_sha256:
            raise NpcBundleBuildError(
                f"generation ledger sources.{key}.fileSha256 does not match frozen input"
            )
    for source_key, prompt_key in (
        ("worldSheet", "worldPromptSha256"),
        ("portraitSheet", "portraitPromptSha256"),
    ):
        entry = sources[source_key]
        expected = snapshots["worldPrompt" if source_key == "worldSheet" else "portraitPrompt"]
        if not isinstance(entry, dict) or entry.get(prompt_key) != expected.file_sha256:
            raise NpcBundleBuildError(
                f"generation ledger sources.{source_key}.{prompt_key} does not match frozen prompt"
            )
        if entry.get("identityBoardSha256") != snapshots["identityBoard"].file_sha256:
            raise NpcBundleBuildError(
                f"generation ledger sources.{source_key}.identityBoardSha256 "
                "does not match the frozen identity board"
            )


def _resolve_source_mode(
    image: Image.Image, requested_mode: str, label: str
) -> tuple[str, dict[str, object]]:
    rgba = np.asarray(image.convert("RGBA"), dtype=np.uint8)
    alpha = rgba[:, :, 3]
    zero = int(np.count_nonzero(alpha == 0))
    partial = int(np.count_nonzero((alpha > 0) & (alpha < 255)))
    opaque = int(np.count_nonzero(alpha == 255))
    total = int(alpha.size)
    if requested_mode == SOURCE_MODE_AUTO:
        if opaque == total:
            resolved = SOURCE_MODE_OPAQUE_CHROMA
        elif zero > 0 and (partial + opaque) > 0:
            resolved = SOURCE_MODE_GENUINE_TRANSPARENT
        else:
            raise NpcBundleBuildError(
                f"{label} auto source-mode cannot classify alpha distribution "
                f"(zero={zero}, partial={partial}, opaque={opaque})"
            )
    else:
        resolved = requested_mode
    if resolved == SOURCE_MODE_OPAQUE_CHROMA and opaque != total:
        raise NpcBundleBuildError(
            f"{label} opaque-chroma source must be fully opaque; found "
            f"{zero + partial} non-opaque pixels"
        )
    if resolved == SOURCE_MODE_GENUINE_TRANSPARENT:
        if zero == total:
            raise NpcBundleBuildError(
                f"{label} genuine-transparent source is fully transparent"
            )
        if opaque == total:
            raise NpcBundleBuildError(
                f"{label} genuine-transparent source is fully opaque"
            )
        if zero == 0:
            raise NpcBundleBuildError(
                f"{label} genuine-transparent source has partial alpha but no "
                "fully transparent background"
            )
    return resolved, {
        "totalPixelCount": total,
        "transparentPixelCount": zero,
        "partialAlphaPixelCount": partial,
        "opaquePixelCount": opaque,
    }


def _validate_generation_source_modes(
    generation: dict[str, object], resolved_modes: dict[str, str]
) -> None:
    sources = generation.get("sources")
    assert isinstance(sources, dict)
    for group, source_key in (("world", "worldSheet"), ("portrait", "portraitSheet")):
        entry = sources.get(source_key)
        assert isinstance(entry, dict)
        resolved = resolved_modes[group]
        declared_mode = entry.get("sourceMode")
        declared_background = entry.get("requestedBackground")
        if resolved == SOURCE_MODE_GENUINE_TRANSPARENT:
            if declared_mode != SOURCE_MODE_GENUINE_TRANSPARENT:
                raise NpcBundleBuildError(
                    f"generation ledger sources.{source_key}.sourceMode must be "
                    f"{SOURCE_MODE_GENUINE_TRANSPARENT}"
                )
            if declared_background != "transparent":
                raise NpcBundleBuildError(
                    f"generation ledger sources.{source_key}.requestedBackground "
                    "must be transparent"
                )
        else:
            if declared_mode != SOURCE_MODE_OPAQUE_CHROMA:
                raise NpcBundleBuildError(
                    f"generation ledger sources.{source_key}.sourceMode must be "
                    f"{SOURCE_MODE_OPAQUE_CHROMA}"
                )
            if declared_background != REQUESTED_BACKGROUND:
                raise NpcBundleBuildError(
                    f"generation ledger sources.{source_key}.requestedBackground "
                    f"must be {REQUESTED_BACKGROUND}"
                )
    mode_values = set(resolved_modes.values())
    expected_background = (
        "mixed"
        if len(mode_values) > 1
        else (
            "transparent"
            if resolved_modes["world"] == SOURCE_MODE_GENUINE_TRANSPARENT
            else REQUESTED_BACKGROUND
        )
    )
    if generation.get("requestedBackground") != expected_background:
        raise NpcBundleBuildError(
            "generation ledger requestedBackground must be derived exactly from "
            "resolved world/portrait source modes: "
            f"expected {expected_background}"
        )


def _validate_ownership_ledger(ledger: dict[str, object]) -> None:
    if ledger.get("schemaVersion") != SCHEMA_VERSION:
        raise NpcBundleBuildError("ownership ledger schemaVersion must be 1")
    for key in ("origin", "owner", "licenseBasis", "replacementPath"):
        _required_string(ledger, key, "ownership ledger")
    if not Path(str(ledger["replacementPath"])).is_absolute():
        raise NpcBundleBuildError("ownership ledger replacementPath must be absolute")


def _freeze_inputs(options: BuildOptions) -> FrozenInputs:
    snapshots: dict[str, FrozenInput] = {
        "worldSheet": _freeze_file(options.world_sheet, "world sheet"),
        "portraitSheet": _freeze_file(options.portrait_sheet, "portrait sheet"),
        "identityBoard": _freeze_file(options.identity_board, "identity board"),
        "worldPrompt": _freeze_file(options.world_prompt, "world prompt"),
        "portraitPrompt": _freeze_file(options.portrait_prompt, "portrait prompt"),
        "generationLedger": _freeze_file(
            options.generation_ledger, "generation ledger"
        ),
        "ownershipLedger": _freeze_file(options.ownership_ledger, "ownership ledger"),
    }
    for key, path, label in (
        ("worldExplicitMask", options.world_explicit_mask, "world explicit mask"),
        (
            "worldMaskAuthoringLedger",
            options.world_mask_authoring_ledger,
            "world mask authoring ledger",
        ),
        (
            "portraitExplicitMask",
            options.portrait_explicit_mask,
            "portrait explicit mask",
        ),
        (
            "portraitMaskAuthoringLedger",
            options.portrait_mask_authoring_ledger,
            "portrait mask authoring ledger",
        ),
    ):
        if path is not None:
            snapshots[key] = _freeze_file(path, label)
    generation = _decode_json(snapshots["generationLedger"])
    ownership = _decode_json(snapshots["ownershipLedger"])
    world_mask_review = (
        _decode_json(snapshots["worldMaskAuthoringLedger"])
        if "worldMaskAuthoringLedger" in snapshots
        else None
    )
    portrait_mask_review = (
        _decode_json(snapshots["portraitMaskAuthoringLedger"])
        if "portraitMaskAuthoringLedger" in snapshots
        else None
    )
    _validate_generation_ledger(generation, snapshots)
    _validate_ownership_ledger(ownership)
    return FrozenInputs(
        world_sheet=snapshots["worldSheet"],
        portrait_sheet=snapshots["portraitSheet"],
        identity_board=snapshots["identityBoard"],
        world_prompt=snapshots["worldPrompt"],
        portrait_prompt=snapshots["portraitPrompt"],
        generation_ledger=snapshots["generationLedger"],
        ownership_ledger=snapshots["ownershipLedger"],
        world_prompt_text=_decode_text(snapshots["worldPrompt"]),
        portrait_prompt_text=_decode_text(snapshots["portraitPrompt"]),
        generation=generation,
        ownership=ownership,
        world_explicit_mask=snapshots.get("worldExplicitMask"),
        world_mask_authoring_ledger=snapshots.get("worldMaskAuthoringLedger"),
        portrait_explicit_mask=snapshots.get("portraitExplicitMask"),
        portrait_mask_authoring_ledger=snapshots.get(
            "portraitMaskAuthoringLedger"
        ),
        world_mask_review=world_mask_review,
        portrait_mask_review=portrait_mask_review,
    )


def visible_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    alpha = np.asarray(image.convert("RGBA"), dtype=np.uint8)[:, :, 3]
    ys, xs = np.nonzero(alpha > 0)
    if len(xs) == 0:
        raise NpcBundleBuildError("empty frame after recorded chroma removal")
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def bbox_touches_margin(
    bbox: tuple[int, int, int, int], width: int, height: int, margin: int
) -> bool:
    x0, y0, x1, y1 = bbox
    return x0 < margin or y0 < margin or x1 > width - margin or y1 > height - margin


def chroma_edge_policy(group: str, col: int = 0) -> dict[str, object]:
    """Return the immutable source-edge policy for a canonical sheet cell.

    World frames must retain generated background on all four cell edges. A
    dialogue bust may be intentionally cropped at the bottom and at the inner
    2x2 grid seam, but its top and sheet-outer side remain uncontaminated
    background references. The inner crop is restricted to the lower 35% so a
    face, hair or prop touching a high seam still fails closed.
    """

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
    if group != "portrait" or col not in (0, 1):
        raise NpcBundleBuildError(
            f"unsupported chroma edge-policy context: group={group} col={col}"
        )
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


def _edge_pixels(rgb: np.ndarray, edges: Sequence[str]) -> np.ndarray:
    parts: list[np.ndarray] = []
    for edge in edges:
        if edge == "top":
            parts.append(rgb[0, :, :])
        elif edge == "bottom":
            parts.append(rgb[-1, :, :])
        elif edge == "left":
            parts.append(rgb[:, 0, :])
        elif edge == "right":
            parts.append(rgb[:, -1, :])
        else:
            raise NpcBundleBuildError(f"unsupported chroma edge name: {edge}")
    if not parts:
        raise NpcBundleBuildError("chroma edge policy has no background samples")
    return np.concatenate(parts, axis=0)


def _measured_background_samples(
    rgb: np.ndarray, edge_policy: dict[str, object]
) -> list[dict[str, object]]:
    height, width = rgb.shape[:2]
    sample_edges = edge_policy["backgroundSampleEdges"]
    assert isinstance(sample_edges, list)
    points: list[tuple[int, int]] = []
    if "top" in sample_edges:
        points.extend(((0, 0), (width // 2, 0), (width - 1, 0)))
    if "bottom" in sample_edges:
        points.extend(
            ((0, height - 1), (width // 2, height - 1), (width - 1, height - 1))
        )
    if "left" in sample_edges:
        points.extend(
            (
                (0, height // 4),
                (0, height // 2),
                (0, (height * 3) // 4),
                (0, height - 1),
            )
        )
    if "right" in sample_edges:
        points.extend(
            (
                (width - 1, height // 4),
                (width - 1, height // 2),
                (width - 1, (height * 3) // 4),
                (width - 1, height - 1),
            )
        )
    return [
        {
            "position": [x, y],
            "rgb": [int(channel) for channel in rgb[y, x]],
        }
        for x, y in points
    ]


def _flood_border_connected(
    candidate: np.ndarray, seed_edges: Sequence[str] = EDGE_NAMES
) -> np.ndarray:
    height, width = candidate.shape
    connected = np.zeros_like(candidate, dtype=np.bool_)
    pending: deque[tuple[int, int]] = deque()
    edge_points: list[tuple[int, int]] = []
    if "top" in seed_edges:
        edge_points.extend((0, x) for x in range(width))
    if "bottom" in seed_edges:
        edge_points.extend((height - 1, x) for x in range(width))
    if "left" in seed_edges:
        edge_points.extend((y, 0) for y in range(1, height - 1))
    if "right" in seed_edges:
        edge_points.extend((y, width - 1) for y in range(1, height - 1))
    for y, x in edge_points:
        if candidate[y, x] and not connected[y, x]:
            connected[y, x] = True
            pending.append((y, x))
    while pending:
        y, x = pending.popleft()
        for next_y, next_x in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if (
                0 <= next_y < height
                and 0 <= next_x < width
                and candidate[next_y, next_x]
                and not connected[next_y, next_x]
            ):
                connected[next_y, next_x] = True
                pending.append((next_y, next_x))
    return connected


def _connected_components(
    candidate: np.ndarray, connectivity: int = CHROMA_CONNECTIVITY
) -> tuple[np.ndarray, ...]:
    if connectivity not in (4, 8):
        raise NpcBundleBuildError("component connectivity must be 4 or 8")
    height, width = candidate.shape
    visited = np.zeros_like(candidate, dtype=np.bool_)
    components: list[np.ndarray] = []
    for start_y in range(height):
        for start_x in range(width):
            if not candidate[start_y, start_x] or visited[start_y, start_x]:
                continue
            component = np.zeros_like(candidate, dtype=np.bool_)
            pending: deque[tuple[int, int]] = deque([(start_y, start_x)])
            visited[start_y, start_x] = True
            component[start_y, start_x] = True
            while pending:
                y, x = pending.popleft()
                neighbours = [
                    (y - 1, x),
                    (y + 1, x),
                    (y, x - 1),
                    (y, x + 1),
                ]
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
                    if (
                        0 <= next_y < height
                        and 0 <= next_x < width
                        and candidate[next_y, next_x]
                        and not visited[next_y, next_x]
                    ):
                        visited[next_y, next_x] = True
                        component[next_y, next_x] = True
                        pending.append((next_y, next_x))
            components.append(component)
    return tuple(components)


def component_pixel_hash(component: np.ndarray) -> str:
    if component.ndim != 2:
        raise NpcBundleBuildError("component mask must be two-dimensional")
    height, width = component.shape
    digest = hashlib.sha256()
    digest.update(f"{width}x{height}:binary-component-4\n".encode("ascii"))
    digest.update(component.astype(np.uint8, copy=False).tobytes())
    return digest.hexdigest()


def _component_bbox(component: np.ndarray) -> tuple[int, int, int, int]:
    ys, xs = np.nonzero(component)
    if len(xs) == 0:
        raise NpcBundleBuildError("empty enclosed chroma component")
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def _component_descriptor(
    component: np.ndarray,
    slot: str,
    cell_box: tuple[int, int, int, int],
    component_type: str = ENCLOSED_COMPONENT_TYPE,
) -> dict[str, object]:
    cell_bbox = _component_bbox(component)
    pixel_count = int(np.count_nonzero(component))
    return {
        "slot": slot,
        "componentType": component_type,
        "componentPixelSha256": component_pixel_hash(component),
        "cellBbox": list(cell_bbox),
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


def _detached_foreground_component_descriptor(
    component: np.ndarray,
) -> dict[str, object]:
    return {
        "componentPixelSha256": component_pixel_hash(component),
        "bbox": list(_component_bbox(component)),
        "pixelCount": int(np.count_nonzero(component)),
    }


def _static_detached_foreground_report(
    image: Image.Image,
    stage: str,
) -> dict[str, object]:
    """Describe significant four-connected foreground islands without deleting any.

    The alpha floor ignores near-zero interpolation dust only.  Every component
    at or above the floor is still counted; the largest is the principal
    subject, and any other component at the explicit size threshold is a hard
    regeneration failure for the static-NPC pipeline.
    """

    alpha = np.asarray(image.convert("RGBA"), dtype=np.uint8)[:, :, 3]
    foreground = alpha >= DETACHED_FOREGROUND_ALPHA_THRESHOLD
    components = _connected_components(
        foreground, connectivity=DETACHED_FOREGROUND_CONNECTIVITY
    )
    descriptors = [
        _detached_foreground_component_descriptor(component)
        for component in components
    ]
    principal_index = (
        max(
            range(len(descriptors)),
            key=lambda index: (int(descriptors[index]["pixelCount"]), -index),
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
        if int(descriptor["pixelCount"])
        >= DETACHED_FOREGROUND_PIXEL_THRESHOLD
    ]
    return {
        "operation": DETACHED_FOREGROUND_OPERATION,
        "stage": stage,
        "connectivity": DETACHED_FOREGROUND_CONNECTIVITY,
        "alphaThresholdInclusive": DETACHED_FOREGROUND_ALPHA_THRESHOLD,
        "minimumBlockingDetachedPixelCount": DETACHED_FOREGROUND_PIXEL_THRESHOLD,
        "alphaQualifiedComponentCount": len(descriptors),
        "principalComponent": (
            descriptors[principal_index]
            if principal_index is not None
            else None
        ),
        "detachedComponentCount": len(detached),
        "largestDetachedComponentPixelCount": max(
            (int(descriptor["pixelCount"]) for descriptor in detached),
            default=0,
        ),
        "blockingComponents": blocking,
        "automaticDeletionApplied": False,
    }


def _enforce_static_detached_foreground(
    image: Image.Image,
    group: str,
    slot: str,
    stage: str,
) -> dict[str, object]:
    report = _static_detached_foreground_report(image, stage)
    blocking = report["blockingComponents"]
    assert isinstance(blocking, list)
    if blocking:
        raise NpcBundleBuildError(
            f"{group} slot {slot}: {stage} has detached foreground component(s) "
            f"at or above {DETACHED_FOREGROUND_PIXEL_THRESHOLD} pixels with "
            f"alpha >= {DETACHED_FOREGROUND_ALPHA_THRESHOLD}; regenerate a clean "
            "source (no automatic deletion): "
            + json.dumps(blocking, ensure_ascii=False, separators=(",", ":"))
        )
    return report


def _adjacent_four(mask: np.ndarray) -> np.ndarray:
    adjacent = np.zeros_like(mask, dtype=np.bool_)
    adjacent[1:, :] |= mask[:-1, :]
    adjacent[:-1, :] |= mask[1:, :]
    adjacent[:, 1:] |= mask[:, :-1]
    adjacent[:, :-1] |= mask[:, 1:]
    return adjacent


def _within_four_neighbour_distance(mask: np.ndarray, distance: int) -> np.ndarray:
    if distance < 0:
        raise NpcBundleBuildError("four-neighbour distance cannot be negative")
    reached = mask.copy()
    for _ in range(distance):
        reached |= _adjacent_four(reached)
    return reached


def _dilate_eight(mask: np.ndarray) -> np.ndarray:
    padded = np.pad(mask, 1, mode="constant", constant_values=False)
    output = np.zeros_like(mask, dtype=np.bool_)
    height, width = mask.shape
    for offset_y in range(3):
        for offset_x in range(3):
            output |= padded[offset_y : offset_y + height, offset_x : offset_x + width]
    return output


def _group_fringe_components(candidate: np.ndarray) -> tuple[np.ndarray, ...]:
    """Join one-pixel antialias gaps without adding any eligible pixels."""

    if not np.any(candidate):
        return ()
    joined = _dilate_eight(candidate)
    groups: list[np.ndarray] = []
    for region in _connected_components(joined, connectivity=8):
        original = region & candidate
        if np.any(original):
            groups.append(original)
    return tuple(groups)


def _soft_matte_alpha(distance: np.ndarray) -> np.ndarray:
    ratio = np.clip(
        (distance.astype(np.float32) - SOFT_MATTE_TRANSPARENT_THRESHOLD)
        / (SOFT_MATTE_OPAQUE_THRESHOLD - SOFT_MATTE_TRANSPARENT_THRESHOLD),
        0.0,
        1.0,
    )
    smooth = ratio * ratio * (3.0 - 2.0 * ratio)
    return np.rint(smooth * 255.0).astype(np.uint8)


def _despill_soft_matte_pixels(
    proposed: np.ndarray,
    source_rgb: np.ndarray,
    proposed_alpha: np.ndarray,
    key_like: np.ndarray,
) -> None:
    """Mirror the frozen helper: despill only 1..251 alpha, never 252..255."""

    despill_eligible = (proposed_alpha > 0) & (proposed_alpha < 252) & key_like
    if not np.any(despill_eligible):
        return
    cap = np.maximum(0, source_rgb[:, :, 1] - 1)
    for channel in (0, 2):
        values = proposed[:, :, channel].astype(np.int16)
        values[despill_eligible] = np.minimum(
            values[despill_eligible], cap[despill_eligible]
        )
        proposed[:, :, channel] = values.astype(np.uint8)


def _bounded_soft_matte(
    rgba: np.ndarray,
    border: np.ndarray,
    automatic: np.ndarray,
) -> tuple[np.ndarray, np.ndarray, dict[str, object]]:
    """Return the frozen soft-matte proposal and its narrow reviewed fringe.

    The proposal follows imagegen's soft-matte/despill behavior, but it is only
    applied later only to reviewed fringe components grown from the automatic
    background by at most FRINGE_MAX_DISTANCE four-neighbour steps, or to exact
    residual components explicitly approved as key-spill repair.
    """

    key = np.rint(np.median(border.astype(np.float32), axis=0)).astype(np.int16)
    rgb = rgba[:, :, :3].astype(np.int16)
    distance = np.max(np.abs(rgb - key[None, None, :]), axis=2)
    min_spill = np.minimum(rgb[:, :, 0], rgb[:, :, 2])
    dominance = min_spill - rgb[:, :, 1]
    key_like = (distance <= 32) | (
        dominance >= SOFT_MATTE_KEY_DOMINANCE_THRESHOLD
    )
    distance_alpha = _soft_matte_alpha(distance)
    denominator = np.maximum(1.0, float(max(int(value) for value in key)) - rgb[:, :, 1])
    dominance_ratio = np.clip(dominance.astype(np.float32) / denominator, 0.0, 1.0)
    dominance_alpha = np.rint((1.0 - dominance_ratio) * 255.0).astype(np.uint8)
    proposed_alpha = np.where(
        key_like, np.minimum(distance_alpha, dominance_alpha), 255
    ).astype(np.uint8)
    proposed_alpha[(proposed_alpha > 0) & (proposed_alpha <= SOFT_MATTE_ALPHA_NOISE_FLOOR)] = 0
    proposed = rgba.copy()
    zero = proposed_alpha == 0
    proposed[zero] = 0
    proposed[:, :, 3] = proposed_alpha
    _despill_soft_matte_pixels(proposed, rgb, proposed_alpha, key_like)
    changed = np.any(proposed != rgba, axis=2) & ~automatic
    within_distance = _within_four_neighbour_distance(
        automatic, FRINGE_MAX_DISTANCE
    )
    fringe = changed & within_distance & ~automatic
    metadata = {
        "algorithm": SOFT_MATTE_ALGORITHM,
        "referenceScriptSha256": SOFT_MATTE_REFERENCE_SHA256,
        "parameters": {
            "autoKey": "policy-safe-edges-median",
            "softMatte": True,
            "transparentThreshold": SOFT_MATTE_TRANSPARENT_THRESHOLD,
            "opaqueThreshold": SOFT_MATTE_OPAQUE_THRESHOLD,
            "despill": True,
            "keyDominanceThreshold": SOFT_MATTE_KEY_DOMINANCE_THRESHOLD,
            "alphaNoiseFloor": SOFT_MATTE_ALPHA_NOISE_FLOOR,
            "despillAlphaInclusiveRange": [1, 251],
            "nearOpaqueRgbUntouchedAlphaInclusiveRange": [252, 255],
            "edgeFeather": 0.0,
            "edgeContract": 0,
            "maximumFourNeighbourDistance": FRINGE_MAX_DISTANCE,
            "largeEnclosedComponentReviewThreshold": LARGE_ENCLOSED_COMPONENT_REVIEW_THRESHOLD,
        },
        "sampledKeyRgb": [int(value) for value in key],
        "globalProposalChangedPixelCount": int(np.count_nonzero(changed)),
        "boundedFringeCandidatePixelCount": int(np.count_nonzero(fringe)),
        "globalProposalApplied": False,
    }
    return proposed, fringe, metadata


def _classify_chroma(
    cell: Image.Image, edge_policy: dict[str, object] | None = None
) -> ChromaClassification:
    policy = edge_policy or chroma_edge_policy("world")
    rgba = np.asarray(cell.convert("RGBA"), dtype=np.uint8).copy()
    if np.any(rgba[:, :, 3] != 255):
        raise NpcBundleBuildError("raw chroma cell is not fully opaque")
    rgb = rgba[:, :, :3].astype(np.int16)
    required_safe_edges = policy["requiredSafeEdges"]
    sample_edges = policy["backgroundSampleEdges"]
    flood_seed_edges = policy["backgroundFloodSeedEdges"]
    allowed_crop_edges = policy["allowedSubjectCropEdges"]
    assert isinstance(required_safe_edges, list)
    assert isinstance(sample_edges, list)
    assert isinstance(flood_seed_edges, list)
    assert isinstance(allowed_crop_edges, list)
    border = _edge_pixels(rgb, sample_edges)
    border_min_channel = np.minimum(border[:, 0], border[:, 2])
    border_dominance = border_min_channel - border[:, 1]
    border_red_blue_delta = np.abs(border[:, 0] - border[:, 2])
    unsafe_border = (
        (border_min_channel < CHROMA_BORDER_MIN_CHANNEL)
        | (border_dominance < CHROMA_BORDER_MIN_DOMINANCE)
        | (border_red_blue_delta > CHROMA_BORDER_MAX_RED_BLUE_DELTA)
    )
    if np.any(unsafe_border):
        raise NpcBundleBuildError(
            "cell border is not a safe generated magenta backdrop; subject or "
            "non-background art touches the cell edge"
        )

    inner_crop_edge = policy["innerCropEdge"]
    inner_crop_minimum = policy["innerCropMinimumYRatio"]
    if inner_crop_edge is not None:
        if inner_crop_edge not in ("left", "right") or not isinstance(
            inner_crop_minimum, float
        ):
            raise NpcBundleBuildError("invalid portrait inner-crop edge policy")
        edge = rgb[:, 0, :] if inner_crop_edge == "left" else rgb[:, -1, :]
        edge_min_channel = np.minimum(edge[:, 0], edge[:, 2])
        edge_dominance = edge_min_channel - edge[:, 1]
        edge_red_blue_delta = np.abs(edge[:, 0] - edge[:, 2])
        unsafe = (
            (edge_min_channel < CHROMA_BORDER_MIN_CHANNEL)
            | (edge_dominance < CHROMA_BORDER_MIN_DOMINANCE)
            | (edge_red_blue_delta > CHROMA_BORDER_MAX_RED_BLUE_DELTA)
        )
        minimum_y = int(np.floor(cell.height * inner_crop_minimum))
        if np.any(unsafe[:minimum_y]):
            raise NpcBundleBuildError(
                "portrait subject touches the inner sheet seam above the allowed "
                f"lower crop zone (minimum y ratio {inner_crop_minimum:.2f})"
            )

    min_channel = max(
        CHROMA_BORDER_MIN_CHANNEL,
        int(border_min_channel.min()) - CHROMA_MIN_CHANNEL_SLACK,
    )
    min_dominance = max(
        CHROMA_BORDER_MIN_DOMINANCE,
        int(border_dominance.min()) - CHROMA_MIN_DOMINANCE_SLACK,
    )
    max_red_blue_delta = min(
        CHROMA_BORDER_MAX_RED_BLUE_DELTA,
        int(border_red_blue_delta.max()) + CHROMA_MAX_RED_BLUE_DELTA_SLACK,
    )
    min_rgb_channel = np.minimum(rgb[:, :, 0], rgb[:, :, 2])
    candidate = (
        (min_rgb_channel >= min_channel)
        & ((min_rgb_channel - rgb[:, :, 1]) >= min_dominance)
        & (np.abs(rgb[:, :, 0] - rgb[:, :, 2]) <= max_red_blue_delta)
    )
    automatic_eligible = _flood_border_connected(candidate, flood_seed_edges)
    enclosed = candidate & ~automatic_eligible
    enclosed_components = _connected_components(enclosed)
    matte_rgba, fringe_candidate, soft_matte = _bounded_soft_matte(
        rgba, border, automatic_eligible
    )
    fringe_components = _group_fringe_components(fringe_candidate)
    provisional = rgba.copy()
    provisional[automatic_eligible | enclosed] = 0
    provisional[fringe_candidate] = matte_rgba[fringe_candidate]
    proposal_changed = np.any(matte_rgba != rgba, axis=2)
    outer_pool = proposal_changed & ~candidate & ~fringe_candidate
    outer_seeds = outer_pool & _adjacent_four(provisional[:, :, 3] == 0)
    outer_background = np.zeros_like(candidate, dtype=np.bool_)
    for component in _connected_components(outer_pool, connectivity=4):
        if np.any(component & outer_seeds):
            outer_background |= component
    outer_background_components = _group_fringe_components(outer_background)
    residual_key_candidate = proposal_changed & ~(
        automatic_eligible
        | enclosed
        | fringe_candidate
        | outer_background
    )
    residual_key_components = _connected_components(
        residual_key_candidate, connectivity=CHROMA_CONNECTIVITY
    )
    eligible_count = int(np.count_nonzero(automatic_eligible))
    if eligible_count == automatic_eligible.size:
        raise NpcBundleBuildError("empty frame after recorded chroma removal")
    ratio = eligible_count / float(automatic_eligible.size)
    if not MIN_BACKGROUND_RATIO <= ratio <= MAX_BACKGROUND_RATIO:
        raise NpcBundleBuildError(
            f"border-connected background ratio {ratio:.6f} is outside "
            f"[{MIN_BACKGROUND_RATIO:.2f}, {MAX_BACKGROUND_RATIO:.2f}]"
        )
    automatic_mask = Image.fromarray(
        automatic_eligible.astype(np.uint8) * 255, mode="L"
    )
    metadata: dict[str, object] = {
        "requestedBackground": REQUESTED_BACKGROUND,
        "operation": CHROMA_OPERATION,
        "connectivity": CHROMA_CONNECTIVITY,
        "edgePolicy": policy["id"],
        "requiredSafeEdges": required_safe_edges,
        "allowedSubjectCropEdges": allowed_crop_edges,
        "backgroundSampleEdges": sample_edges,
        "backgroundFloodSeedEdges": flood_seed_edges,
        "innerCropMinimumYRatio": inner_crop_minimum,
        "measuredBackgroundSamples": _measured_background_samples(
            rgba[:, :, :3], policy
        ),
        "thresholds": {
            "minimumRedBlueChannel": min_channel,
            "minimumMagentaDominance": min_dominance,
            "maximumRedBlueDelta": max_red_blue_delta,
            "borderSafetyMinimumRedBlueChannel": CHROMA_BORDER_MIN_CHANNEL,
            "borderSafetyMinimumMagentaDominance": CHROMA_BORDER_MIN_DOMINANCE,
            "borderSafetyMaximumRedBlueDelta": CHROMA_BORDER_MAX_RED_BLUE_DELTA,
        },
        "candidatePixelCount": int(np.count_nonzero(candidate)),
        "automaticEligiblePixelCount": eligible_count,
        "automaticEligiblePixelRatio": round(ratio, 8),
        "automaticMaskPixelSha256": mask_hash(automatic_mask),
        "classifierEnclosedCandidatePixels": int(np.count_nonzero(enclosed)),
        "classifierEnclosedComponentCount": len(enclosed_components),
        "classifierAdjacentFringeCandidatePixels": int(
            np.count_nonzero(fringe_candidate)
        ),
        "classifierAdjacentFringeComponentCount": len(fringe_components),
        "classifierAdjacentFringeReviewGrouping": FRINGE_REVIEW_GROUPING,
        "classifierReviewedOuterBackgroundHoleCandidatePixels": int(
            np.count_nonzero(outer_background)
        ),
        "classifierReviewedOuterBackgroundHoleComponentCount": len(
            outer_background_components
        ),
        "classifierResidualKeyColorCandidatePixels": int(
            np.count_nonzero(residual_key_candidate)
        ),
        "classifierResidualKeyColorComponentCount": len(residual_key_components),
        "classifierResidualKeyColorReviewGrouping": RESIDUAL_KEY_REVIEW_GROUPING,
        "classifierResidualKeyColorMaskPixelSha256": mask_hash(
            Image.fromarray(
                residual_key_candidate.astype(np.uint8) * 255, mode="L"
            )
        ),
        "softMatte": soft_matte,
        "maskBoundedColorMutationOnly": True,
        "postMaskGlobalColorDeletion": False,
    }
    return ChromaClassification(
        rgba=rgba,
        candidate=candidate,
        automatic_eligible=automatic_eligible,
        enclosed_components=enclosed_components,
        fringe_candidate=fringe_candidate,
        fringe_components=fringe_components,
        outer_background_candidate=outer_background,
        outer_background_components=outer_background_components,
        residual_key_candidate=residual_key_candidate,
        residual_key_components=residual_key_components,
        matte_rgba=matte_rgba,
        metadata=metadata,
    )


def _apply_chroma_classification(
    classification: ChromaClassification,
    eligibility: np.ndarray,
    mask_review: dict[str, object],
) -> tuple[Image.Image, Image.Image, Image.Image, dict[str, object]]:
    if eligibility.shape != classification.automatic_eligible.shape:
        raise NpcBundleBuildError("eligibility mask dimensions do not match raw cell")
    eligible = eligibility.astype(np.bool_, copy=False)
    eligible_count = int(np.count_nonzero(eligible))
    if eligible_count == eligible.size:
        raise NpcBundleBuildError("empty frame after recorded chroma removal")
    ratio = eligible_count / float(eligible.size)
    if not MIN_BACKGROUND_RATIO <= ratio <= MAX_BACKGROUND_RATIO:
        raise NpcBundleBuildError(
            f"final reviewed background ratio {ratio:.6f} is outside "
            f"[{MIN_BACKGROUND_RATIO:.2f}, {MAX_BACKGROUND_RATIO:.2f}]"
        )
    output = classification.rgba.copy()
    soft_candidates = (
        classification.fringe_candidate | classification.residual_key_candidate
    )
    soft_eligible = eligible & soft_candidates
    hard_eligible = eligible & ~soft_candidates
    output[hard_eligible] = 0
    output[soft_eligible] = classification.matte_rgba[soft_eligible]
    proposal_changed = np.any(
        classification.matte_rgba != classification.rgba, axis=2
    )
    residual_boundary = (
        (output[:, :, 3] > 0)
        & _adjacent_four(output[:, :, 3] == 0)
        & proposal_changed
        & ~eligible
        & ~classification.candidate
        & ~classification.fringe_candidate
        & ~classification.outer_background_candidate
        & ~classification.residual_key_candidate
    )
    residual_boundary_count = int(np.count_nonzero(residual_boundary))
    if residual_boundary_count:
        raise NpcBundleBuildError(
            f"soft-matte key spill extends {residual_boundary_count} pixels onto "
            "the visible alpha boundary beyond the reviewed maximum "
            f"{FRINGE_MAX_DISTANCE}px four-neighbour fringe; regenerate source"
        )
    processed = Image.fromarray(output, mode="RGBA")
    mask = Image.fromarray(eligible.astype(np.uint8) * 255, mode="L")
    changed_pixels = np.any(output != classification.rgba, axis=2)
    changed_mask = Image.fromarray(
        changed_pixels.astype(np.uint8) * 255, mode="L"
    )
    bbox = visible_bbox(processed)
    metadata = {
        **classification.metadata,
        "eligiblePixelCount": eligible_count,
        "eligiblePixelRatio": round(ratio, 8),
        "ambiguousEnclosedCandidatePixels": 0,
        "unreviewedEnclosedCandidatePixels": 0,
        "unreviewedResidualKeyColorCandidatePixels": 0,
        "visiblePixelCount": int(np.count_nonzero(output[:, :, 3] > 0)),
        "partialAlphaPixelCount": int(
            np.count_nonzero((output[:, :, 3] > 0) & (output[:, :, 3] < 255))
        ),
        "hardTransparentPixelCount": int(np.count_nonzero(hard_eligible)),
        "softMatteChangedPixelCount": int(np.count_nonzero(soft_eligible)),
        "softMatteFringeChangedPixelCount": int(
            np.count_nonzero(eligible & classification.fringe_candidate)
        ),
        "softMatteResidualKeyRepairPixelCount": int(
            np.count_nonzero(eligible & classification.residual_key_candidate)
        ),
        "outOfBandSoftMatteBoundaryPixelCount": residual_boundary_count,
        "visibleBbox": list(bbox),
        "maskPixelSha256": mask_hash(mask),
        "changedPixelCount": int(np.count_nonzero(changed_pixels)),
        "changedPixelMaskSha256": mask_hash(changed_mask),
        "maskReview": mask_review,
    }
    return processed, mask, changed_mask, metadata


def _alpha_edge(alpha: np.ndarray, edge: str) -> np.ndarray:
    if edge == "top":
        return alpha[0, :]
    if edge == "bottom":
        return alpha[-1, :]
    if edge == "left":
        return alpha[:, 0]
    if edge == "right":
        return alpha[:, -1]
    raise NpcBundleBuildError(f"unsupported alpha edge name: {edge}")


def _classify_genuine_transparent(
    cell: Image.Image, edge_policy: dict[str, object]
) -> TransparentClassification:
    rgba = np.asarray(cell.convert("RGBA"), dtype=np.uint8).copy()
    alpha = rgba[:, :, 3]
    zero = alpha == 0
    visible = alpha > 0
    zero_count = int(np.count_nonzero(zero))
    visible_count = int(np.count_nonzero(visible))
    if zero_count == 0 or visible_count == 0:
        raise NpcBundleBuildError(
            "genuine-transparent cell must contain both alpha-zero background and "
            "alpha-positive subject pixels"
        )
    required_safe_edges = edge_policy["requiredSafeEdges"]
    assert isinstance(required_safe_edges, list)
    for edge in required_safe_edges:
        if np.any(_alpha_edge(alpha, str(edge)) != 0):
            raise NpcBundleBuildError(
                f"genuine-transparent subject touches required-safe {edge} edge"
            )
    inner_crop_edge = edge_policy["innerCropEdge"]
    inner_crop_minimum = edge_policy["innerCropMinimumYRatio"]
    if inner_crop_edge is not None:
        if not isinstance(inner_crop_minimum, float):
            raise NpcBundleBuildError("invalid transparent portrait edge policy")
        edge_alpha = _alpha_edge(alpha, str(inner_crop_edge))
        minimum_y = int(np.floor(cell.height * inner_crop_minimum))
        if np.any(edge_alpha[:minimum_y] != 0):
            raise NpcBundleBuildError(
                "genuine-transparent portrait subject touches the inner sheet seam "
                "above the allowed lower crop zone"
            )
    ratio = zero_count / float(zero.size)
    if not MIN_BACKGROUND_RATIO <= ratio <= MAX_BACKGROUND_RATIO:
        raise NpcBundleBuildError(
            f"transparent background ratio {ratio:.6f} is outside "
            f"[{MIN_BACKGROUND_RATIO:.2f}, {MAX_BACKGROUND_RATIO:.2f}]"
        )
    visible_components = _connected_components(
        visible, connectivity=ALPHA_COMPONENT_CONNECTIVITY
    )
    component_sizes = [int(np.count_nonzero(component)) for component in visible_components]
    tiny_components = [size for size in component_sizes if size < MIN_DETACHED_ALPHA_COMPONENT_PIXELS]
    if tiny_components or len(visible_components) > MAX_ALPHA_POSITIVE_COMPONENTS:
        raise NpcBundleBuildError(
            "genuine-transparent source contains implausible detached alpha-positive "
            f"islands (components={len(visible_components)}, sizes={component_sizes})"
        )
    processed = rgba.copy()
    noncanonical = zero & np.any(rgba[:, :, :3] != 0, axis=2)
    processed[zero] = 0
    mask = Image.fromarray(zero.astype(np.uint8) * 255, mode="L")
    changed_mask = Image.fromarray(
        noncanonical.astype(np.uint8) * 255, mode="L"
    )
    processed_image = Image.fromarray(processed, mode="RGBA")
    bbox = visible_bbox(processed_image)
    metadata: dict[str, object] = {
        "sourceMode": SOURCE_MODE_GENUINE_TRANSPARENT,
        "operation": TRANSPARENT_OPERATION,
        "connectivity": ALPHA_COMPONENT_CONNECTIVITY,
        "edgePolicy": edge_policy["id"],
        "requiredSafeEdges": required_safe_edges,
        "allowedSubjectCropEdges": edge_policy["allowedSubjectCropEdges"],
        "innerCropMinimumYRatio": inner_crop_minimum,
        "eligiblePixelCount": zero_count,
        "eligiblePixelRatio": round(ratio, 8),
        "automaticEligiblePixelCount": zero_count,
        "automaticMaskPixelSha256": mask_hash(mask),
        "transparentPixelCount": zero_count,
        "partialAlphaPixelCount": int(
            np.count_nonzero((alpha > 0) & (alpha < 255))
        ),
        "opaquePixelCount": int(np.count_nonzero(alpha == 255)),
        "alphaPositiveComponentCount": len(visible_components),
        "alphaPositiveComponentPixelCounts": component_sizes,
        "alphaZeroRgbCanonicalizedPixelCount": int(np.count_nonzero(noncanonical)),
        "visiblePixelCount": visible_count,
        "visibleBbox": list(bbox),
        "maskPixelSha256": mask_hash(mask),
        "changedPixelCount": int(np.count_nonzero(noncanonical)),
        "changedPixelMaskSha256": mask_hash(changed_mask),
        "maskReview": {
            "mode": "genuine-transparent-alpha-zero",
            "automaticMaskPixelSha256": mask_hash(mask),
            "reviewOperation": None,
            "reviewedComponents": [],
            "reviewedBackgroundHolePixelCount": 0,
            "reviewedBackgroundFringePixelCount": 0,
            "reviewedOuterBackgroundHolePixelCount": 0,
            "reviewedRetainedSubjectPixelCount": 0,
            "reviewedResidualKeySpillPixelCount": 0,
            "reviewedRetainedAuthoredColorPixelCount": 0,
        },
        "maskBoundedColorMutationOnly": True,
        "postMaskGlobalColorDeletion": False,
    }
    return TransparentClassification(rgba, zero, processed, noncanonical, metadata)


def border_connected_chroma_to_alpha(
    cell: Image.Image,
) -> tuple[Image.Image, Image.Image, dict[str, object]]:
    """Key only the measured border component; enclosed candidates fail closed."""

    classification = _classify_chroma(cell)
    enclosed_count = int(classification.metadata["classifierEnclosedCandidatePixels"])
    fringe_count = int(
        classification.metadata["classifierAdjacentFringeCandidatePixels"]
    )
    outer_count = int(
        classification.metadata[
            "classifierReviewedOuterBackgroundHoleCandidatePixels"
        ]
    )
    residual_count = int(
        classification.metadata["classifierResidualKeyColorCandidatePixels"]
    )
    if enclosed_count or fringe_count or outer_count or residual_count:
        raise NpcBundleBuildError(
            f"found {enclosed_count} enclosed chroma candidates and {fringe_count} "
            f"adjacent chroma-fringe candidates plus {outer_count} reviewed outer "
            f"background-hole candidates plus {residual_count} residual key-color "
            "candidates outside the automatic background; "
            "regenerate or provide the paired explicit sheet mask and visual-review "
            "authoring ledger CLI inputs"
        )
    automatic_mask = Image.fromarray(
        classification.automatic_eligible.astype(np.uint8) * 255, mode="L"
    )
    processed, eligibility_mask, _changed_mask, metadata = _apply_chroma_classification(
        classification,
        classification.automatic_eligible,
        {
            "mode": "automatic-border-connected-only",
            "automaticMaskPixelSha256": mask_hash(automatic_mask),
            "reviewOperation": None,
            "reviewedComponents": [],
            "reviewedBackgroundHolePixelCount": 0,
            "reviewedBackgroundFringePixelCount": 0,
            "reviewedOuterBackgroundHolePixelCount": 0,
            "reviewedRetainedSubjectPixelCount": 0,
            "reviewedResidualKeySpillPixelCount": 0,
            "reviewedRetainedAuthoredColorPixelCount": 0,
        },
    )
    return processed, eligibility_mask, metadata


def _validate_reviewed_at(value: object, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise NpcBundleBuildError(f"{label} must be a non-empty ISO-8601 string")
    try:
        parsed = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise NpcBundleBuildError(f"{label} must be ISO-8601") from exc
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise NpcBundleBuildError(f"{label} must include a timezone")
    return value


def _build_explicit_mask_review(
    group: str,
    raw_snapshot: FrozenInput,
    raw_image: Image.Image,
    mask_snapshot: FrozenInput | None,
    ledger_snapshot: FrozenInput | None,
    ledger: dict[str, object] | None,
) -> ExplicitMaskReview | None:
    if mask_snapshot is None and ledger_snapshot is None and ledger is None:
        return None
    if mask_snapshot is None or ledger_snapshot is None or ledger is None:
        raise NpcBundleBuildError(
            f"{group} explicit mask review is missing its paired frozen input"
        )
    mask_image = _load_binary_mask_snapshot(mask_snapshot)
    if mask_image.size != raw_image.size:
        raise NpcBundleBuildError(
            f"{group} explicit mask size {mask_image.size} does not match raw sheet "
            f"size {raw_image.size}"
        )
    label = f"{group} mask authoring ledger"
    if ledger.get("schemaVersion") != SCHEMA_VERSION:
        raise NpcBundleBuildError(f"{label} schemaVersion must be 1")
    if ledger.get("operation") != MASK_REVIEW_OPERATION:
        raise NpcBundleBuildError(
            f"{label} operation must be {MASK_REVIEW_OPERATION}"
        )
    if ledger.get("group") != group:
        raise NpcBundleBuildError(f"{label} group must be {group}")
    if ledger.get("reviewMethod") != MASK_REVIEW_METHOD:
        raise NpcBundleBuildError(
            f"{label} reviewMethod must be {MASK_REVIEW_METHOD}"
        )
    source = ledger.get("source")
    if not isinstance(source, dict):
        raise NpcBundleBuildError(f"{label}.source must be an object")
    expected_source = {
        "rawSheetFileSha256": raw_snapshot.file_sha256,
        "rawSheetDecodedRgbaByteSha256": rgba_bytes_hash(raw_image),
        "rawSheetGodotCanonicalRgbaSha256": godot_canonical_rgba_hash(raw_image),
        "rawSheetDecodedRgbaSha256": rgba_hash(raw_image),
        "explicitMaskFileSha256": mask_snapshot.file_sha256,
        "explicitMaskPixelSha256": mask_hash(mask_image),
        "width": raw_image.width,
        "height": raw_image.height,
    }
    for key, expected in expected_source.items():
        if source.get(key) != expected:
            raise NpcBundleBuildError(
                f"{label}.source.{key} does not match the frozen raw/mask input"
            )
    classifier = ledger.get("classifier")
    expected_edge_policy = (
        WORLD_EDGE_POLICY if group == "world" else PORTRAIT_EDGE_POLICY
    )
    if not isinstance(classifier, dict) or (
        classifier.get("operation") != CHROMA_OPERATION
        or classifier.get("connectivity") != CHROMA_CONNECTIVITY
        or classifier.get("edgePolicy") != expected_edge_policy
        or classifier.get("fringeMaximumFourNeighbourDistance")
        != FRINGE_MAX_DISTANCE
        or classifier.get("fringeReviewGrouping") != FRINGE_REVIEW_GROUPING
        or classifier.get("residualKeyReviewGrouping")
        != RESIDUAL_KEY_REVIEW_GROUPING
        or classifier.get("largeEnclosedComponentReviewThreshold")
        != LARGE_ENCLOSED_COMPONENT_REVIEW_THRESHOLD
    ):
        raise NpcBundleBuildError(
            f"{label}.classifier must bind {CHROMA_OPERATION}, connectivity 4, "
            f"edgePolicy {expected_edge_policy}, fringe distance "
            f"{FRINGE_MAX_DISTANCE}, fringe grouping {FRINGE_REVIEW_GROUPING}, "
            f"and residual grouping {RESIDUAL_KEY_REVIEW_GROUPING}"
        )
    components = ledger.get("components")
    if not isinstance(components, list):
        raise NpcBundleBuildError(f"{label}.components must be an array")
    seen: set[tuple[str, str, str]] = set()
    for index, entry in enumerate(components):
        entry_label = f"{label}.components[{index}]"
        if not isinstance(entry, dict):
            raise NpcBundleBuildError(f"{entry_label} must be an object")
        slot = _required_string(entry, "slot", entry_label)
        component_type = _required_string(entry, "componentType", entry_label)
        if component_type not in (
            ENCLOSED_COMPONENT_TYPE,
            FRINGE_COMPONENT_TYPE,
            OUTER_BACKGROUND_COMPONENT_TYPE,
            RESIDUAL_KEY_COMPONENT_TYPE,
        ):
            raise NpcBundleBuildError(
                f"{entry_label}.componentType must be {ENCLOSED_COMPONENT_TYPE} "
                f", {FRINGE_COMPONENT_TYPE}, {OUTER_BACKGROUND_COMPONENT_TYPE}, "
                f"or {RESIDUAL_KEY_COMPONENT_TYPE}"
            )
        component_hash = _required_string(
            entry, "componentPixelSha256", entry_label
        )
        if not re.fullmatch(r"[0-9a-f]{64}", component_hash):
            raise NpcBundleBuildError(
                f"{entry_label}.componentPixelSha256 must be lowercase SHA-256"
            )
        key = (slot, component_type, component_hash)
        if key in seen:
            raise NpcBundleBuildError(
                f"{label} duplicates component {slot}/{component_type}/{component_hash}"
            )
        seen.add(key)
        for bbox_key in ("cellBbox", "sheetBbox"):
            bbox = entry.get(bbox_key)
            if not (
                isinstance(bbox, list)
                and len(bbox) == 4
                and all(isinstance(value, int) for value in bbox)
            ):
                raise NpcBundleBuildError(
                    f"{entry_label}.{bbox_key} must contain four integers"
                )
        if not isinstance(entry.get("pixelCount"), int) or entry["pixelCount"] <= 0:
            raise NpcBundleBuildError(
                f"{entry_label}.pixelCount must be a positive integer"
            )
        if not isinstance(entry.get("requiresLargeComponentAttention"), bool):
            raise NpcBundleBuildError(
                f"{entry_label}.requiresLargeComponentAttention must be boolean"
            )
        decision = entry.get("decision")
        allowed_decisions = (
            (RESIDUAL_KEY_REPAIR_DECISION, RESIDUAL_KEY_RETAIN_DECISION)
            if component_type == RESIDUAL_KEY_COMPONENT_TYPE
            else ("background-hole", "retain-subject")
            if component_type
            in (ENCLOSED_COMPONENT_TYPE, OUTER_BACKGROUND_COMPONENT_TYPE)
            else ("background-fringe", "retain-subject")
        )
        if decision not in allowed_decisions:
            raise NpcBundleBuildError(
                f"{entry_label}.decision must be " + " or ".join(allowed_decisions)
            )
        _required_string(entry, "reviewer", entry_label)
        _validate_reviewed_at(entry.get("reviewedAt"), f"{entry_label}.reviewedAt")
    return ExplicitMaskReview(
        group=group,
        mask_snapshot=mask_snapshot,
        ledger_snapshot=ledger_snapshot,
        mask_image=mask_image,
        ledger=ledger,
    )


def _prepare_group(
    sheet: Image.Image,
    group: str,
    rows: int,
    cols: int,
    slots: Sequence[str],
    edge_margin: int,
    crop_padding: int,
    explicit_review: ExplicitMaskReview | None = None,
    source_mode: str = SOURCE_MODE_OPAQUE_CHROMA,
) -> tuple[list[PreparedFrame], dict[str, object]]:
    x_boundaries = grid_boundaries(sheet.width, cols)
    y_boundaries = grid_boundaries(sheet.height, rows)
    minimum_width = min(
        x_boundaries[index + 1] - x_boundaries[index] for index in range(cols)
    )
    minimum_height = min(
        y_boundaries[index + 1] - y_boundaries[index] for index in range(rows)
    )
    if minimum_width <= edge_margin * 2 or minimum_height <= edge_margin * 2:
        raise NpcBundleBuildError(
            f"{group} grid cells are too small for the {edge_margin}px edge margin"
        )

    if source_mode == SOURCE_MODE_GENUINE_TRANSPARENT and explicit_review is not None:
        raise NpcBundleBuildError(
            f"{group} genuine-transparent source cannot use a chroma review mask"
        )
    review_entries: dict[tuple[str, str, str], dict[str, object]] = {}
    if explicit_review is not None:
        for entry in explicit_review.ledger["components"]:
            assert isinstance(entry, dict)
            key = (
                str(entry["slot"]),
                str(entry["componentType"]),
                str(entry["componentPixelSha256"]),
            )
            review_entries[key] = entry
    used_review_entries: set[tuple[str, str, str]] = set()
    frames: list[PreparedFrame] = []
    for index, slot in enumerate(slots):
        row, col = divmod(index, cols)
        edge_policy = chroma_edge_policy(group, col)
        box = (
            x_boundaries[col],
            y_boundaries[row],
            x_boundaries[col + 1],
            y_boundaries[row + 1],
        )
        raw_cell = sheet.crop(box)
        try:
            if source_mode == SOURCE_MODE_GENUINE_TRANSPARENT:
                transparent = _classify_genuine_transparent(raw_cell, edge_policy)
                processing = transparent.metadata
                processed = Image.fromarray(transparent.processed_rgba, mode="RGBA")
                mask = Image.fromarray(
                    transparent.eligibility.astype(np.uint8) * 255, mode="L"
                )
                changed_mask = Image.fromarray(
                    transparent.changed_pixels.astype(np.uint8) * 255, mode="L"
                )
            else:
                classification = _classify_chroma(raw_cell, edge_policy)
                all_components: list[tuple[np.ndarray, dict[str, object]]] = []
                for component in classification.enclosed_components:
                    all_components.append(
                        (
                            component,
                            _component_descriptor(
                                component, slot, box, ENCLOSED_COMPONENT_TYPE
                            ),
                        )
                    )
                for component in classification.fringe_components:
                    all_components.append(
                        (
                            component,
                            _component_descriptor(
                                component, slot, box, FRINGE_COMPONENT_TYPE
                            ),
                        )
                    )
                for component in classification.outer_background_components:
                    all_components.append(
                        (
                            component,
                            _component_descriptor(
                                component,
                                slot,
                                box,
                                OUTER_BACKGROUND_COMPONENT_TYPE,
                            ),
                        )
                    )
                for component in classification.residual_key_components:
                    all_components.append(
                        (
                            component,
                            _component_descriptor(
                                component,
                                slot,
                                box,
                                RESIDUAL_KEY_COMPONENT_TYPE,
                            ),
                        )
                    )
                automatic_mask = Image.fromarray(
                    classification.automatic_eligible.astype(np.uint8) * 255,
                    mode="L",
                )
                if explicit_review is None:
                    enclosed_count = int(
                        classification.metadata["classifierEnclosedCandidatePixels"]
                    )
                    fringe_count = int(
                        classification.metadata[
                            "classifierAdjacentFringeCandidatePixels"
                        ]
                    )
                    outer_count = int(
                        classification.metadata[
                            "classifierReviewedOuterBackgroundHoleCandidatePixels"
                        ]
                    )
                    residual_count = int(
                        classification.metadata[
                            "classifierResidualKeyColorCandidatePixels"
                        ]
                    )
                    if enclosed_count or fringe_count or outer_count or residual_count:
                        raise NpcBundleBuildError(
                            f"found {enclosed_count} enclosed chroma candidates and "
                            f"{fringe_count} adjacent chroma-fringe candidates plus "
                            f"{outer_count} reviewed outer-background candidates plus "
                            f"{residual_count} residual key-color candidates; supply "
                            f"the paired --{group}-explicit-mask and "
                            f"--{group}-mask-authoring-ledger after visual review, or "
                            "regenerate as genuine transparent"
                        )
                    mask_review = {
                        "mode": "automatic-border-connected-only",
                        "automaticMaskPixelSha256": mask_hash(automatic_mask),
                        "reviewOperation": None,
                        "reviewedComponents": [],
                        "reviewedBackgroundHolePixelCount": 0,
                        "reviewedBackgroundFringePixelCount": 0,
                        "reviewedOuterBackgroundHolePixelCount": 0,
                        "reviewedRetainedSubjectPixelCount": 0,
                        "reviewedResidualKeySpillPixelCount": 0,
                        "reviewedRetainedAuthoredColorPixelCount": 0,
                    }
                    final_eligibility = classification.automatic_eligible
                else:
                    explicit_cell = np.asarray(
                        explicit_review.mask_image.crop(box), dtype=np.uint8
                    ) == 255
                    missing_count = int(
                        np.count_nonzero(
                            classification.automatic_eligible & ~explicit_cell
                        )
                    )
                    if missing_count:
                        raise NpcBundleBuildError(
                            f"explicit mask omits {missing_count} automatic "
                            "border-connected background pixels"
                        )
                    allowed = (
                        classification.candidate
                        | classification.fringe_candidate
                        | classification.outer_background_candidate
                        | classification.residual_key_candidate
                    )
                    noncandidate_count = int(
                        np.count_nonzero(explicit_cell & ~allowed)
                    )
                    if noncandidate_count:
                        raise NpcBundleBuildError(
                            f"explicit mask adds {noncandidate_count} pixels outside "
                            "automatic/enclosed/fringe/outer/residual classifier scope"
                        )
                    reviewed_components: list[dict[str, object]] = []
                    background_hole_pixels = 0
                    background_fringe_pixels = 0
                    outer_background_pixels = 0
                    retained_subject_pixels = 0
                    residual_key_spill_pixels = 0
                    retained_authored_color_pixels = 0
                    for component, descriptor in all_components:
                        component_type = str(descriptor["componentType"])
                        component_hash = str(descriptor["componentPixelSha256"])
                        key = (slot, component_type, component_hash)
                        entry = review_entries.get(key)
                        if entry is None:
                            raise NpcBundleBuildError(
                                f"unreviewed {component_type} component "
                                f"{slot}/{component_hash}"
                            )
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
                                raise NpcBundleBuildError(
                                    f"mask authoring ledger component {slot}/"
                                    f"{component_type}/{component_hash} has "
                                    f"mismatched {field}"
                                )
                        selected_count = int(
                            np.count_nonzero(explicit_cell & component)
                        )
                        pixel_count = int(descriptor["pixelCount"])
                        if selected_count not in (0, pixel_count):
                            raise NpcBundleBuildError(
                                f"explicit mask splits {component_type} component "
                                f"{slot}/{component_hash}: selected "
                                f"{selected_count}/{pixel_count} pixels"
                            )
                        decision = str(entry["decision"])
                        if decision == "background-fringe":
                            within_core_distance = _within_four_neighbour_distance(
                                classification.automatic_eligible,
                                FRINGE_MAX_DISTANCE,
                            )
                            if np.any(component & ~within_core_distance):
                                raise NpcBundleBuildError(
                                    f"background-fringe component {slot}/"
                                    f"{component_hash} contains pixels farther than "
                                    f"{FRINGE_MAX_DISTANCE}px four-neighbour distance "
                                    "from the automatic border core"
                                )
                        expected_background_decision = (
                            RESIDUAL_KEY_REPAIR_DECISION
                            if component_type == RESIDUAL_KEY_COMPONENT_TYPE
                            else "background-hole"
                            if component_type
                            in (
                                ENCLOSED_COMPONENT_TYPE,
                                OUTER_BACKGROUND_COMPONENT_TYPE,
                            )
                            else "background-fringe"
                        )
                        expected_selected = (
                            pixel_count
                            if decision == expected_background_decision
                            else 0
                        )
                        if selected_count != expected_selected:
                            raise NpcBundleBuildError(
                                f"explicit mask contradicts {decision} decision for "
                                f"component {slot}/{component_type}/{component_hash}"
                            )
                        used_review_entries.add(key)
                        reviewed_components.append(
                            {
                                **descriptor,
                                "decision": decision,
                                "reviewer": entry["reviewer"],
                                "reviewedAt": entry["reviewedAt"],
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
                    mask_path = f"source/reviewed-masks/{group}-sheet-mask.png"
                    ledger_path = (
                        f"source/reviewed-masks/{group}-mask-authoring-ledger.json"
                    )
                    mask_review = {
                        "mode": "automatic-plus-reviewed-components",
                        "reviewOperation": MASK_REVIEW_OPERATION,
                        "reviewMethod": MASK_REVIEW_METHOD,
                        "automaticMaskPixelSha256": mask_hash(automatic_mask),
                        "explicitSheetMaskPath": mask_path,
                        "explicitSheetMaskFileSha256": explicit_review.mask_snapshot.file_sha256,
                        "explicitSheetMaskPixelSha256": mask_hash(
                            explicit_review.mask_image
                        ),
                        "maskAuthoringLedgerPath": ledger_path,
                        "maskAuthoringLedgerFileSha256": explicit_review.ledger_snapshot.file_sha256,
                        "rawSheetFileSha256": explicit_review.ledger["source"][
                            "rawSheetFileSha256"
                        ],
                        "reviewedComponents": reviewed_components,
                        "reviewedBackgroundHolePixelCount": background_hole_pixels,
                        "reviewedBackgroundFringePixelCount": background_fringe_pixels,
                        "reviewedOuterBackgroundHolePixelCount": outer_background_pixels,
                        "reviewedRetainedSubjectPixelCount": retained_subject_pixels,
                        "reviewedResidualKeySpillPixelCount": residual_key_spill_pixels,
                        "reviewedRetainedAuthoredColorPixelCount": retained_authored_color_pixels,
                    }
                    final_eligibility = explicit_cell
                processed, mask, changed_mask, processing = _apply_chroma_classification(
                    classification, final_eligibility, mask_review
                )
                processing["sourceMode"] = SOURCE_MODE_OPAQUE_CHROMA
        except NpcBundleBuildError as exc:
            raise NpcBundleBuildError(f"{group} slot {slot}: {exc}") from exc
        processing["processedDetachedForegroundGate"] = (
            _enforce_static_detached_foreground(
                processed, group, slot, "processed-cell"
            )
        )
        bbox = tuple(int(value) for value in processing["visibleBbox"])
        required_safe_edges = edge_policy["requiredSafeEdges"]
        assert isinstance(required_safe_edges, list)
        x0, y0, x1, y1 = bbox
        violates_required_edge = (
            ("left" in required_safe_edges and x0 < edge_margin)
            or ("top" in required_safe_edges and y0 < edge_margin)
            or ("right" in required_safe_edges and x1 > processed.width - edge_margin)
            or ("bottom" in required_safe_edges and y1 > processed.height - edge_margin)
        )
        if violates_required_edge:
            raise NpcBundleBuildError(
                f"{group} slot {slot}: subject or residue touches the "
                f"{edge_margin}px required-safe cell edge under {edge_policy['id']} "
                f"(bbox={bbox}, cell={processed.size})"
            )
        padded = (
            max(0, x0 - crop_padding),
            max(0, y0 - crop_padding),
            min(processed.width, x1 + crop_padding),
            min(processed.height, y1 + crop_padding),
        )
        crop = processed.crop(padded)
        crop_bbox = (
            x0 - padded[0],
            y0 - padded[1],
            x1 - padded[0],
            y1 - padded[1],
        )
        metadata: dict[str, object] = {
            "group": group,
            "slot": slot,
            "grid": [row, col],
            "sourceCellBox": list(box),
            "sourceCellSize": list(raw_cell.size),
            "sourceMode": source_mode,
            "rawDecodedRgbaByteSha256": rgba_bytes_hash(raw_cell),
            "rawGodotCanonicalRgbaSha256": godot_canonical_rgba_hash(raw_cell),
            "rawRgbaSha256": rgba_hash(raw_cell),
            "sourceProcessing": processing,
            "chroma": processing,
            "processedCellDecodedRgbaByteSha256": rgba_bytes_hash(processed),
            "processedCellGodotCanonicalRgbaSha256": godot_canonical_rgba_hash(processed),
            "processedCellRgbaSha256": rgba_hash(processed),
            "processedVisibleBbox": list(bbox),
            "paddedCropBbox": list(padded),
            "paddedCropSize": list(crop.size),
            "paddedCropVisibleBbox": list(crop_bbox),
        }
        frames.append(
            PreparedFrame(
                group=group,
                slot=slot,
                row=row,
                col=col,
                cell_box=box,
                raw_cell=raw_cell,
                eligibility_mask=mask,
                changed_pixel_mask=changed_mask,
                processed_cell=processed,
                crop=crop,
                crop_visible_bbox=crop_bbox,
                metadata=metadata,
            )
        )
    if explicit_review is not None:
        unused = sorted(set(review_entries) - used_review_entries)
        if unused:
            raise NpcBundleBuildError(
                f"{group} mask authoring ledger contains unknown or stale components: "
                + ", ".join(
                    f"{slot}/{component_type}/{component_hash}"
                    for slot, component_type, component_hash in unused
                )
            )
    visible_heights = [
        frame.crop_visible_bbox[3] - frame.crop_visible_bbox[1] for frame in frames
    ]
    minimum_visible_height = min(visible_heights)
    maximum_visible_height = max(visible_heights)
    height_drift = maximum_visible_height / float(minimum_visible_height) - 1.0
    if height_drift > MAX_VISIBLE_HEIGHT_DRIFT:
        raise NpcBundleBuildError(
            f"{group} visible-height scale drift {height_drift:.4f} exceeds "
            f"{MAX_VISIBLE_HEIGHT_DRIFT:.2f}; regenerate inconsistent slots"
        )
    return frames, {
        "sourceMode": source_mode,
        "rows": rows,
        "cols": cols,
        "order": list(slots),
        "boundaries": {"x": list(x_boundaries), "y": list(y_boundaries)},
        "visibleHeights": visible_heights,
        "maximumVisibleHeightDrift": round(height_drift, 8),
        "maximumAllowedVisibleHeightDrift": MAX_VISIBLE_HEIGHT_DRIFT,
        "explicitMaskReview": explicit_review is not None,
        "classifierEnclosedCandidatePixels": sum(
            int(
                frame.metadata["sourceProcessing"].get(
                    "classifierEnclosedCandidatePixels", 0
                )
            )
            for frame in frames
        ),
        "classifierEnclosedComponentCount": sum(
            int(
                frame.metadata["sourceProcessing"].get(
                    "classifierEnclosedComponentCount", 0
                )
            )
            for frame in frames
        ),
        "classifierAdjacentFringeCandidatePixels": sum(
            int(
                frame.metadata["sourceProcessing"].get(
                    "classifierAdjacentFringeCandidatePixels", 0
                )
            )
            for frame in frames
        ),
        "classifierAdjacentFringeComponentCount": sum(
            int(
                frame.metadata["sourceProcessing"].get(
                    "classifierAdjacentFringeComponentCount", 0
                )
            )
            for frame in frames
        ),
        "classifierReviewedOuterBackgroundHoleCandidatePixels": sum(
            int(
                frame.metadata["sourceProcessing"].get(
                    "classifierReviewedOuterBackgroundHoleCandidatePixels", 0
                )
            )
            for frame in frames
        ),
        "classifierReviewedOuterBackgroundHoleComponentCount": sum(
            int(
                frame.metadata["sourceProcessing"].get(
                    "classifierReviewedOuterBackgroundHoleComponentCount", 0
                )
            )
            for frame in frames
        ),
        "classifierResidualKeyColorCandidatePixels": sum(
            int(
                frame.metadata["sourceProcessing"].get(
                    "classifierResidualKeyColorCandidatePixels", 0
                )
            )
            for frame in frames
        ),
        "classifierResidualKeyColorComponentCount": sum(
            int(
                frame.metadata["sourceProcessing"].get(
                    "classifierResidualKeyColorComponentCount", 0
                )
            )
            for frame in frames
        ),
        "reviewedBackgroundHolePixelCount": sum(
            int(
                frame.metadata["sourceProcessing"]["maskReview"][
                    "reviewedBackgroundHolePixelCount"
                ]
            )
            for frame in frames
        ),
        "reviewedRetainedSubjectPixelCount": sum(
            int(
                frame.metadata["sourceProcessing"]["maskReview"][
                    "reviewedRetainedSubjectPixelCount"
                ]
            )
            for frame in frames
        ),
        "reviewedBackgroundFringePixelCount": sum(
            int(
                frame.metadata["sourceProcessing"]["maskReview"][
                    "reviewedBackgroundFringePixelCount"
                ]
            )
            for frame in frames
        ),
        "reviewedOuterBackgroundHolePixelCount": sum(
            int(
                frame.metadata["sourceProcessing"]["maskReview"][
                    "reviewedOuterBackgroundHolePixelCount"
                ]
            )
            for frame in frames
        ),
        "reviewedResidualKeySpillPixelCount": sum(
            int(
                frame.metadata["sourceProcessing"]["maskReview"][
                    "reviewedResidualKeySpillPixelCount"
                ]
            )
            for frame in frames
        ),
        "reviewedRetainedAuthoredColorPixelCount": sum(
            int(
                frame.metadata["sourceProcessing"]["maskReview"][
                    "reviewedRetainedAuthoredColorPixelCount"
                ]
            )
            for frame in frames
        ),
    }


def resize_rgba_premultiplied(
    image: Image.Image, size: tuple[int, int]
) -> Image.Image:
    """Resize RGBA with explicitly recorded premultiplied-alpha bilinear.

    Chroma-keyed inputs use a non-negative interpolation kernel so transparent
    background pixels cannot contribute hidden RGB and the resize cannot add
    Lanczos ringing.  No post-resize color deletion is permitted.
    """

    if size[0] <= 0 or size[1] <= 0:
        raise NpcBundleBuildError(f"invalid resize target: {size}")
    rgba = np.asarray(image.convert("RGBA"), dtype=np.uint8)
    alpha = rgba[:, :, 3].astype(np.float32)
    resample = Image.Resampling.BILINEAR
    output_alpha = np.asarray(
        Image.fromarray(rgba[:, :, 3], mode="L").resize(size, resample),
        dtype=np.uint8,
    )
    interpolated_alpha = np.asarray(
        Image.fromarray(alpha, mode="F").resize(size, resample),
        dtype=np.float32,
    )
    premultiplied = rgba[:, :, :3].astype(np.float32) * (
        alpha[:, :, None] / 255.0
    )
    channels: list[np.ndarray] = []
    for channel in range(3):
        channels.append(
            np.asarray(
                Image.fromarray(premultiplied[:, :, channel], mode="F").resize(
                    size, resample
                ),
                dtype=np.float32,
            )
        )
    resized_premultiplied = np.stack(channels, axis=2)
    resized_premultiplied = np.clip(
        resized_premultiplied, 0.0, interpolated_alpha[:, :, None]
    )
    output_rgb = np.zeros_like(resized_premultiplied)
    np.divide(
        resized_premultiplied * 255.0,
        interpolated_alpha[:, :, None],
        out=output_rgb,
        where=interpolated_alpha[:, :, None] > 0.0,
    )
    output = np.zeros((size[1], size[0], 4), dtype=np.uint8)
    output[:, :, :3] = np.rint(np.clip(output_rgb, 0.0, 255.0)).astype(np.uint8)
    output[:, :, 3] = output_alpha
    output[output_alpha == 0, :3] = 0
    return Image.fromarray(output, mode="RGBA")


def _render_group(
    frames: Sequence[PreparedFrame],
    target_size: int,
    safe_margin: int,
    fit_scale: float,
    vertical_anchor: str,
) -> tuple[list[RenderedFrame], float]:
    available = target_size - safe_margin * 2
    scale_limits: list[float] = []
    for frame in frames:
        x0, y0, x1, y1 = frame.crop_visible_bbox
        width = x1 - x0
        height = y1 - y0
        if width <= 0 or height <= 0:
            raise NpcBundleBuildError(f"{frame.group} slot {frame.slot}: empty crop")
        scale_limits.extend((available / width, available / height))
    common_scale = min(scale_limits) * fit_scale
    if common_scale <= 0:
        raise NpcBundleBuildError("computed common scale is not positive")

    rendered: list[RenderedFrame] = []
    for prepared in frames:
        resized_size = (
            max(1, round(prepared.crop.width * common_scale)),
            max(1, round(prepared.crop.height * common_scale)),
        )
        resized = resize_rgba_premultiplied(prepared.crop, resized_size)
        resized_bbox = visible_bbox(resized)
        visible_center_x = (resized_bbox[0] + resized_bbox[2]) / 2.0
        paste_x = round(target_size / 2.0 - visible_center_x)
        if vertical_anchor == "baseline":
            paste_y = target_size - safe_margin - resized_bbox[3]
        elif vertical_anchor == "center":
            visible_center_y = (resized_bbox[1] + resized_bbox[3]) / 2.0
            paste_y = round(target_size / 2.0 - visible_center_y)
        else:
            raise NpcBundleBuildError(f"unsupported vertical anchor: {vertical_anchor}")

        if (
            paste_x < 0
            or paste_y < 0
            or paste_x + resized.width > target_size
            or paste_y + resized.height > target_size
        ):
            raise NpcBundleBuildError(
                f"{prepared.group} slot {prepared.slot}: normalized crop exceeds canvas; "
                "reduce fit scale"
            )
        canvas = Image.new("RGBA", (target_size, target_size), (0, 0, 0, 0))
        canvas.alpha_composite(resized, dest=(paste_x, paste_y))
        runtime_bbox = visible_bbox(canvas)
        if bbox_touches_margin(
            runtime_bbox, target_size, target_size, safe_margin
        ):
            raise NpcBundleBuildError(
                f"{prepared.group} slot {prepared.slot}: output violates the "
                f"{safe_margin}px alpha safety bound (bbox={runtime_bbox})"
            )
        array = np.asarray(canvas, dtype=np.uint8)
        transparent = array[:, :, 3] == 0
        visible = ~transparent
        if not np.any(transparent) or not np.any(visible):
            raise NpcBundleBuildError(
                f"{prepared.group} slot {prepared.slot}: output must contain both "
                "transparent and visible pixels"
            )
        if np.any(array[transparent, :3] != 0):
            raise NpcBundleBuildError(
                f"{prepared.group} slot {prepared.slot}: transparent RGB is not canonical zero"
            )
        runtime_detached_foreground = _enforce_static_detached_foreground(
            canvas, prepared.group, prepared.slot, "runtime"
        )
        metadata: dict[str, object] = {
            **prepared.metadata,
            "runtimeSize": [target_size, target_size],
            "runtimeResample": PREMULTIPLIED_RESAMPLE,
            "commonScale": round(common_scale, 10),
            "resizedCropSize": list(resized_size),
            "resizedVisibleBbox": list(resized_bbox),
            "runtimePastePosition": [paste_x, paste_y],
            "runtimeVisibleBbox": list(runtime_bbox),
            "transparentPixelCount": int(np.count_nonzero(transparent)),
            "visiblePixelCount": int(np.count_nonzero(visible)),
            "partialAlphaPixelCount": int(
                np.count_nonzero((array[:, :, 3] > 0) & (array[:, :, 3] < 255))
            ),
            "runtimeDetachedForegroundGate": runtime_detached_foreground,
            "postMaskGlobalColorDeletion": False,
            "runtimeRgbaSha256": rgba_hash(canvas),
        }
        rendered.append(RenderedFrame(prepared, canvas, metadata))
    return rendered, common_scale


def _duplicate_pairs(frames: Sequence[RenderedFrame]) -> list[list[str]]:
    pairs: list[list[str]] = []
    for left_index, left in enumerate(frames):
        left_hash = rgba_hash(left.runtime)
        for right in frames[left_index + 1 :]:
            if left_hash == rgba_hash(right.runtime):
                pairs.append([left.prepared.slot, right.prepared.slot])
    return pairs


def _horizontal_mirror_pairs(
    frames: Sequence[RenderedFrame],
) -> list[list[str]]:
    pairs: list[list[str]] = []
    runtime_hashes = {frame.prepared.slot: rgba_hash(frame.runtime) for frame in frames}
    for left_index, left in enumerate(frames):
        mirrored_runtime_hash = rgba_hash(
            left.runtime.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
        )
        mirrored_processed_hash = rgba_hash(
            left.prepared.processed_cell.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
        )
        for right in frames[left_index + 1 :]:
            runtime_equal = mirrored_runtime_hash == runtime_hashes[right.prepared.slot]
            source_equal = (
                left.prepared.processed_cell.size
                == right.prepared.processed_cell.size
                and mirrored_processed_hash == rgba_hash(right.prepared.processed_cell)
            )
            if runtime_equal or source_equal:
                pairs.append([left.prepared.slot, right.prepared.slot])
    return pairs


def _vertical_mirror_pairs(frames: Sequence[RenderedFrame]) -> list[list[str]]:
    pairs: list[list[str]] = []
    runtime_hashes = {frame.prepared.slot: rgba_hash(frame.runtime) for frame in frames}
    for left_index, left in enumerate(frames):
        mirrored_runtime_hash = rgba_hash(
            left.runtime.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
        )
        mirrored_processed_hash = rgba_hash(
            left.prepared.processed_cell.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
        )
        for right in frames[left_index + 1 :]:
            runtime_equal = mirrored_runtime_hash == runtime_hashes[right.prepared.slot]
            source_equal = (
                left.prepared.processed_cell.size
                == right.prepared.processed_cell.size
                and mirrored_processed_hash == rgba_hash(right.prepared.processed_cell)
            )
            if runtime_equal or source_equal:
                pairs.append([left.prepared.slot, right.prepared.slot])
    return pairs


def _visual_fingerprint(
    image: Image.Image, transform: Image.Transpose | None = None
) -> np.ndarray:
    source = image.transpose(transform) if transform is not None else image
    bbox = visible_bbox(source)
    tight = source.crop(bbox)
    available = VISUAL_FINGERPRINT_SIZE - 4
    scale = min(available / tight.width, available / tight.height)
    size = (max(1, round(tight.width * scale)), max(1, round(tight.height * scale)))
    resized = resize_rgba_premultiplied(tight, size)
    canvas = Image.new(
        "RGBA",
        (VISUAL_FINGERPRINT_SIZE, VISUAL_FINGERPRINT_SIZE),
        (0, 0, 0, 0),
    )
    x = (VISUAL_FINGERPRINT_SIZE - resized.width) // 2
    y = VISUAL_FINGERPRINT_SIZE - 2 - resized.height
    canvas.alpha_composite(resized, (x, y))
    rgba = np.asarray(canvas, dtype=np.float32)
    alpha = rgba[:, :, 3:4] / 255.0
    return np.concatenate((rgba[:, :, :3] * alpha, rgba[:, :, 3:4]), axis=2)


def _near_visual_pairs(
    frames: Sequence[RenderedFrame], transform: Image.Transpose | None
) -> list[dict[str, object]]:
    fingerprints = {
        frame.prepared.slot: _visual_fingerprint(frame.runtime)
        for frame in frames
    }
    transformed = {
        frame.prepared.slot: _visual_fingerprint(frame.runtime, transform)
        for frame in frames
    }
    pairs: list[dict[str, object]] = []
    for left_index, left in enumerate(frames):
        left_value = transformed[left.prepared.slot]
        for right in frames[left_index + 1 :]:
            distance = float(
                np.mean(np.abs(left_value - fingerprints[right.prepared.slot])) / 255.0
            )
            if distance <= NEAR_VISUAL_DISTANCE_LIMIT:
                pairs.append(
                    {
                        "slots": [left.prepared.slot, right.prepared.slot],
                        "normalizedMeanAbsoluteDistance": round(distance, 8),
                    }
                )
    return pairs


def _validate_distinct_frames(
    world: Sequence[RenderedFrame], portraits: Sequence[RenderedFrame]
) -> dict[str, object]:
    duplicate_world = _duplicate_pairs(world)
    duplicate_portraits = _duplicate_pairs(portraits)
    horizontal_mirrored_world = _horizontal_mirror_pairs(world)
    vertical_mirrored_world = _vertical_mirror_pairs(world)
    if duplicate_world:
        raise NpcBundleBuildError(
            "world directions contain exact decoded-RGBA duplicates: "
            + ", ".join("/".join(pair) for pair in duplicate_world)
        )
    if duplicate_portraits:
        raise NpcBundleBuildError(
            "portrait states contain exact decoded-RGBA duplicates: "
            + ", ".join("/".join(pair) for pair in duplicate_portraits)
        )
    if horizontal_mirrored_world:
        raise NpcBundleBuildError(
            "world directions contain exact horizontal-mirror equality: "
            + ", ".join("/".join(pair) for pair in horizontal_mirrored_world)
        )
    if vertical_mirrored_world:
        raise NpcBundleBuildError(
            "world directions contain exact vertical-mirror equality: "
            + ", ".join("/".join(pair) for pair in vertical_mirrored_world)
        )
    near_duplicate_world = _near_visual_pairs(world, None)
    near_horizontal_mirrored_world = _near_visual_pairs(
        world, Image.Transpose.FLIP_LEFT_RIGHT
    )
    near_vertical_mirrored_world = _near_visual_pairs(
        world, Image.Transpose.FLIP_TOP_BOTTOM
    )
    if near_duplicate_world:
        raise NpcBundleBuildError(
            "world directions contain near-duplicate visual risk: "
            + ", ".join("/".join(pair["slots"]) for pair in near_duplicate_world)
        )
    if near_horizontal_mirrored_world:
        raise NpcBundleBuildError(
            "world directions contain near horizontal-mirror visual risk: "
            + ", ".join(
                "/".join(pair["slots"]) for pair in near_horizontal_mirrored_world
            )
        )
    if near_vertical_mirrored_world:
        raise NpcBundleBuildError(
            "world directions contain near vertical-mirror visual risk: "
            + ", ".join(
                "/".join(pair["slots"]) for pair in near_vertical_mirrored_world
            )
        )
    return {
        "worldExactDuplicatePairs": duplicate_world,
        "portraitExactDuplicatePairs": duplicate_portraits,
        "worldExactHorizontalMirrorPairs": horizontal_mirrored_world,
        "worldExactVerticalMirrorPairs": vertical_mirrored_world,
        "nearVisualDistanceLimit": NEAR_VISUAL_DISTANCE_LIMIT,
        "worldNearDuplicatePairs": near_duplicate_world,
        "worldNearHorizontalMirrorPairs": near_horizontal_mirrored_world,
        "worldNearVerticalMirrorPairs": near_vertical_mirrored_world,
        "semanticDirectionAutomaticallyApproved": False,
        "blindDirectionReviewRequired": True,
    }


def _contact_sheet(
    world: Sequence[RenderedFrame], portraits: Sequence[RenderedFrame]
) -> Image.Image:
    frames = [*world, *portraits]
    columns = 4
    thumbnail_size = WORLD_SIZE
    gutter = 8
    label_height = 22
    cell_width = thumbnail_size + gutter * 2
    cell_height = thumbnail_size + label_height + gutter * 2
    rows = 3
    sheet = Image.new(
        "RGBA", (columns * cell_width, rows * cell_height), (0, 0, 0, 0)
    )
    draw = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.load_default(size=13)
    except TypeError:
        font = ImageFont.load_default()
    for index, frame in enumerate(frames):
        row, col = divmod(index, columns)
        x = col * cell_width + gutter
        y = row * cell_height + gutter
        preview = frame.runtime
        if preview.size != (thumbnail_size, thumbnail_size):
            preview = resize_rgba_premultiplied(
                preview, (thumbnail_size, thumbnail_size)
            )
        sheet.alpha_composite(preview, dest=(x, y + label_height))
        label = (
            frame.prepared.slot
            if frame.prepared.group == "world"
            else f"portrait:{frame.prepared.slot}"
        )
        draw.text((x, y), label, fill=(238, 226, 190, 255), font=font)
    return sheet


def _frame_paths(frame: RenderedFrame) -> dict[str, str]:
    slot = frame.prepared.slot
    if frame.prepared.group == "world":
        return {
            "raw": f"source/raw/cells/world/{slot}-idle-1.png",
            "mask": f"source/masks/world/{slot}/idle-1.png",
            "changedMask": f"source/changed-masks/world/{slot}/idle-1.png",
            "processed": f"source/processed/world/{slot}/idle-1.png",
            "runtime": f"runtime/world/{slot}/idle-1.png",
        }
    return {
        "raw": f"source/raw/cells/portraits/{slot}.png",
        "mask": f"source/masks/portraits/{slot}.png",
        "changedMask": f"source/changed-masks/portraits/{slot}.png",
        "processed": f"source/processed/portraits/{slot}.png",
        "runtime": f"runtime/portraits/{slot}.png",
    }


def _save_frames(staging: Path, frames: Sequence[RenderedFrame]) -> list[dict[str, object]]:
    provenance: list[dict[str, object]] = []
    for frame in frames:
        paths = _frame_paths(frame)
        for path_text in paths.values():
            (staging / path_text).parent.mkdir(parents=True, exist_ok=True)
        raw_path = staging / paths["raw"]
        mask_path = staging / paths["mask"]
        changed_mask_path = staging / paths["changedMask"]
        processed_path = staging / paths["processed"]
        runtime_path = staging / paths["runtime"]
        frame.prepared.raw_cell.save(raw_path, format="PNG", optimize=False)
        frame.prepared.eligibility_mask.save(mask_path, format="PNG", optimize=False)
        frame.prepared.changed_pixel_mask.save(
            changed_mask_path, format="PNG", optimize=False
        )
        frame.prepared.processed_cell.save(
            processed_path, format="PNG", optimize=False
        )
        frame.runtime.save(runtime_path, format="PNG", optimize=False)

        prompt_id = "world" if frame.prepared.group == "world" else "portrait"
        processing = frame.prepared.metadata["sourceProcessing"]
        source_mode = str(frame.prepared.metadata["sourceMode"])
        entry: dict[str, object] = {
                "group": frame.prepared.group,
                "slot": frame.prepared.slot,
                "sourceMode": source_mode,
                "runtimePath": paths["runtime"],
                "promptId": prompt_id,
                "rawPath": paths["raw"],
                "rawFileSha256": sha256_file(raw_path),
                "rawDecodedRgbaByteSha256": rgba_bytes_hash(
                    frame.prepared.raw_cell
                ),
                "rawGodotCanonicalRgbaSha256": godot_canonical_rgba_hash(
                    frame.prepared.raw_cell
                ),
                "rawRgbaSha256": rgba_hash(frame.prepared.raw_cell),
                "rawSheetCellBox": list(frame.prepared.cell_box),
                "maskPath": paths["mask"],
                "eligibilityMaskPath": paths["mask"],
                "maskFileSha256": sha256_file(mask_path),
                "maskPixelSha256": mask_hash(frame.prepared.eligibility_mask),
                "maskWidth": frame.prepared.eligibility_mask.width,
                "maskHeight": frame.prepared.eligibility_mask.height,
                "changedPixelMaskPath": paths["changedMask"],
                "changedPixelMaskFileSha256": sha256_file(changed_mask_path),
                "changedPixelMaskSha256": mask_hash(
                    frame.prepared.changed_pixel_mask
                ),
                "changedPixelCount": processing["changedPixelCount"],
                "eligiblePixelCount": processing["eligiblePixelCount"],
                "eligiblePixelRatio": processing["eligiblePixelRatio"],
                "automaticEligiblePixelCount": processing[
                    "automaticEligiblePixelCount"
                ],
                "automaticMaskPixelSha256": processing[
                    "automaticMaskPixelSha256"
                ],
                "classifierEnclosedCandidatePixels": processing.get(
                    "classifierEnclosedCandidatePixels", 0
                ),
                "classifierEnclosedComponentCount": processing.get(
                    "classifierEnclosedComponentCount", 0
                ),
                "classifierAdjacentFringeCandidatePixels": processing.get(
                    "classifierAdjacentFringeCandidatePixels", 0
                ),
                "classifierAdjacentFringeComponentCount": processing.get(
                    "classifierAdjacentFringeComponentCount", 0
                ),
                "classifierReviewedOuterBackgroundHoleCandidatePixels": processing.get(
                    "classifierReviewedOuterBackgroundHoleCandidatePixels", 0
                ),
                "classifierReviewedOuterBackgroundHoleComponentCount": processing.get(
                    "classifierReviewedOuterBackgroundHoleComponentCount", 0
                ),
                "classifierResidualKeyColorCandidatePixels": processing.get(
                    "classifierResidualKeyColorCandidatePixels", 0
                ),
                "classifierResidualKeyColorComponentCount": processing.get(
                    "classifierResidualKeyColorComponentCount", 0
                ),
                "classifierResidualKeyColorReviewGrouping": processing.get(
                    "classifierResidualKeyColorReviewGrouping",
                    RESIDUAL_KEY_REVIEW_GROUPING,
                ),
                "classifierResidualKeyColorMaskPixelSha256": processing.get(
                    "classifierResidualKeyColorMaskPixelSha256",
                    mask_hash(Image.new("L", frame.prepared.raw_cell.size, 0)),
                ),
                "processedDetachedForegroundGate": processing[
                    "processedDetachedForegroundGate"
                ],
                "runtimeDetachedForegroundGate": frame.metadata[
                    "runtimeDetachedForegroundGate"
                ],
                "maskSourceDecodedRgbaByteSha256": rgba_bytes_hash(
                    frame.prepared.raw_cell
                ),
                "maskSourceGodotCanonicalRgbaSha256": godot_canonical_rgba_hash(
                    frame.prepared.raw_cell
                ),
                "maskSourceRgbaSha256": rgba_hash(frame.prepared.raw_cell),
                "processedPath": paths["processed"],
                "processedFileSha256": sha256_file(processed_path),
                "processedDecodedRgbaByteSha256": rgba_bytes_hash(
                    frame.prepared.processed_cell
                ),
                "processedGodotCanonicalRgbaSha256": godot_canonical_rgba_hash(
                    frame.prepared.processed_cell
                ),
                "processedRgbaSha256": rgba_hash(frame.prepared.processed_cell),
                "runtimeFileSha256": sha256_file(runtime_path),
                "runtimeDecodedRgbaByteSha256": rgba_bytes_hash(frame.runtime),
                "runtimeGodotCanonicalRgbaSha256": godot_canonical_rgba_hash(frame.runtime),
                "runtimeRgbaSha256": rgba_hash(frame.runtime),
                "requestedBackground": (
                    "transparent"
                    if source_mode == SOURCE_MODE_GENUINE_TRANSPARENT
                    else REQUESTED_BACKGROUND
                ),
                "eligibilityOperation": processing["operation"],
                "eligibilityConnectivity": processing["connectivity"],
                "eligibilityEdgePolicy": processing["edgePolicy"],
                "requiredSafeEdges": processing["requiredSafeEdges"],
                "allowedSubjectCropEdges": processing["allowedSubjectCropEdges"],
                "innerCropMinimumYRatio": processing["innerCropMinimumYRatio"],
                "maskReview": processing["maskReview"],
                "maskBoundedColorMutationOnly": True,
                "postMaskGlobalColorDeletion": False,
                "globalRgbCleanup": False,
                "colorDistanceDeletion": False,
            }
        if source_mode == SOURCE_MODE_OPAQUE_CHROMA:
            entry.update(
                {
                    "measuredBackgroundSamples": processing[
                        "measuredBackgroundSamples"
                    ],
                    "backgroundSampleEdges": processing[
                        "backgroundSampleEdges"
                    ],
                    "backgroundFloodSeedEdges": processing[
                        "backgroundFloodSeedEdges"
                    ],
                    "eligibilityThresholds": processing["thresholds"],
                    "softMatte": processing["softMatte"],
                    "ambiguousEnclosedCandidatePixels": processing[
                        "ambiguousEnclosedCandidatePixels"
                    ],
                    "unreviewedEnclosedCandidatePixels": processing[
                        "unreviewedEnclosedCandidatePixels"
                    ],
                    "unreviewedResidualKeyColorCandidatePixels": processing[
                        "unreviewedResidualKeyColorCandidatePixels"
                    ],
                    "operations": [
                        "measured border-connected chroma core set to canonical RGBA zero",
                        *(
                            [
                                "whole-component visual-review decisions applied from frozen explicit sheet mask",
                                "approved adjacent fringe receives bounded soft matte and despill",
                                "approved residual key-spill components receive exact frozen soft-matte repair",
                            ]
                            if processing["maskReview"]["reviewOperation"]
                            == MASK_REVIEW_OPERATION
                            else []
                        ),
                        "padded crop without out-of-mask RGB mutation",
                        PREMULTIPLIED_RESAMPLE,
                        "shared-scale canvas normalization",
                    ],
                }
            )
        else:
            entry.update(
                {
                    "alphaStats": {
                        key: processing[key]
                        for key in (
                            "transparentPixelCount",
                            "partialAlphaPixelCount",
                            "opaquePixelCount",
                            "alphaPositiveComponentCount",
                            "alphaZeroRgbCanonicalizedPixelCount",
                        )
                    },
                    "operations": [
                        "preserve every alpha-positive source pixel",
                        "canonicalize RGB to zero only where source alpha is zero",
                        "padded crop without alpha-positive pixel mutation",
                        PREMULTIPLIED_RESAMPLE,
                        "shared-scale canvas normalization",
                    ],
                }
            )
        provenance.append(entry)
    return provenance


def _relative_file_hashes(root: Path) -> dict[str, str]:
    hashes: dict[str, str] = {}
    for path in sorted(root.rglob("*")):
        if path.is_file() and path.name != "pipeline-meta.json":
            hashes[path.relative_to(root).as_posix()] = sha256_file(path)
    return hashes


def _dependency_versions() -> dict[str, str]:
    return {
        "python": platform.python_version(),
        "pythonImplementation": platform.python_implementation(),
        "pillow": PIL.__version__,
        "numpy": np.__version__,
    }


def _replay_arguments(
    options: BuildOptions,
    world_prompt_name: str,
    portrait_prompt_name: str,
) -> list[str]:
    arguments = [
        "--role-id",
        options.role_id,
        "--world-sheet",
        "{bundle}/source/raw/world-sheet.png",
        "--portrait-sheet",
        "{bundle}/source/raw/portrait-sheet.png",
        "--identity-board",
        "{bundle}/identity/identity-board.png",
        "--world-prompt",
        f"{{bundle}}/source/prompts/{world_prompt_name}",
        "--portrait-prompt",
        f"{{bundle}}/source/prompts/{portrait_prompt_name}",
        "--generation-ledger",
        "{bundle}/source/generation-ledger.json",
        "--ownership-ledger",
        "{bundle}/source/ownership-ledger.json",
        "--output-dir",
        "{output}",
        "--source-edge-margin",
        str(options.source_edge_margin),
        "--world-safe-margin",
        str(options.world_safe_margin),
        "--portrait-safe-margin",
        str(options.portrait_safe_margin),
        "--crop-padding",
        str(options.crop_padding),
        "--world-fit-scale",
        str(options.world_fit_scale),
        "--portrait-fit-scale",
        str(options.portrait_fit_scale),
        "--world-source-mode",
        options.world_source_mode,
        "--portrait-source-mode",
        options.portrait_source_mode,
    ]
    if options.display_name is not None:
        arguments.extend(("--display-name", options.display_name))
    if options.world_explicit_mask is not None:
        arguments.extend(
            (
                "--world-explicit-mask",
                "{bundle}/source/reviewed-masks/world-sheet-mask.png",
                "--world-mask-authoring-ledger",
                "{bundle}/source/reviewed-masks/world-mask-authoring-ledger.json",
            )
        )
    if options.portrait_explicit_mask is not None:
        arguments.extend(
            (
                "--portrait-explicit-mask",
                "{bundle}/source/reviewed-masks/portrait-sheet-mask.png",
                "--portrait-mask-authoring-ledger",
                "{bundle}/source/reviewed-masks/portrait-mask-authoring-ledger.json",
            )
        )
    return arguments


def _write_frozen(path: Path, snapshot: FrozenInput) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(snapshot.data)
    if sha256_file(path) != snapshot.file_sha256:
        raise NpcBundleBuildError(f"frozen copy hash mismatch for {snapshot.label}")


def _fsync_tree(root: Path) -> None:
    """Flush staged files before the atomic directory publication."""

    for path in sorted(root.rglob("*")):
        if not path.is_file():
            continue
        descriptor = os.open(path, os.O_RDONLY)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
    directories = [path for path in root.rglob("*") if path.is_dir()]
    for path in sorted([*directories, root], key=lambda value: len(value.parts), reverse=True):
        descriptor = os.open(path, os.O_RDONLY)
        try:
            try:
                os.fsync(descriptor)
            except OSError as exc:
                if exc.errno not in (errno.EINVAL, errno.ENOTSUP):
                    raise
        finally:
            os.close(descriptor)


def _atomic_publish_new(staging: Path, output: Path) -> None:
    """Atomically rename a staged directory while refusing any replacement."""

    libc = ctypes.CDLL(None, use_errno=True)
    old_path = os.fsencode(staging)
    new_path = os.fsencode(output)
    at_fdcwd = -2
    result: int
    if sys.platform == "darwin" and hasattr(libc, "renameatx_np"):
        rename = libc.renameatx_np
        rename.argtypes = [
            ctypes.c_int,
            ctypes.c_char_p,
            ctypes.c_int,
            ctypes.c_char_p,
            ctypes.c_uint,
        ]
        rename.restype = ctypes.c_int
        result = rename(at_fdcwd, old_path, at_fdcwd, new_path, 0x00000004)
    elif sys.platform.startswith("linux") and hasattr(libc, "renameat2"):
        rename = libc.renameat2
        rename.argtypes = [
            ctypes.c_int,
            ctypes.c_char_p,
            ctypes.c_int,
            ctypes.c_char_p,
            ctypes.c_uint,
        ]
        rename.restype = ctypes.c_int
        result = rename(at_fdcwd, old_path, at_fdcwd, new_path, 0x00000001)
    else:
        raise NpcBundleBuildError(
            "this platform lacks atomic no-replace directory publication; refusing "
            "a potentially destructive fallback"
        )
    if result != 0:
        error_number = ctypes.get_errno()
        if error_number in (errno.EEXIST, errno.ENOTEMPTY):
            raise NpcBundleBuildError(
                "output path appeared during publication; no files were replaced: "
                f"{output}"
            )
        raise OSError(error_number, os.strerror(error_number), str(output))
    parent_descriptor = os.open(output.parent, os.O_RDONLY)
    try:
        try:
            os.fsync(parent_descriptor)
        except OSError as exc:
            if exc.errno not in (errno.EINVAL, errno.ENOTSUP):
                raise
    finally:
        os.close(parent_descriptor)


def _write_bundle(
    options: BuildOptions,
    frozen: FrozenInputs,
    world_sheet: Image.Image,
    portrait_sheet: Image.Image,
    identity_board: Image.Image,
    world_grid: dict[str, object],
    portrait_grid: dict[str, object],
    world: Sequence[RenderedFrame],
    portraits: Sequence[RenderedFrame],
    world_scale: float,
    portrait_scale: float,
    distinct_qc: dict[str, object],
) -> dict[str, object]:
    output_parent = options.output_dir.parent
    output_parent.mkdir(parents=True, exist_ok=True)
    staging = Path(
        tempfile.mkdtemp(prefix=f".{options.output_dir.name}.staging-", dir=output_parent)
    )
    try:
        source_world = staging / "source/raw/world-sheet.png"
        source_portraits = staging / "source/raw/portrait-sheet.png"
        identity_path = staging / "identity/identity-board.png"
        generation_path = staging / "source/generation-ledger.json"
        ownership_path = staging / "source/ownership-ledger.json"
        _write_frozen(source_world, frozen.world_sheet)
        _write_frozen(source_portraits, frozen.portrait_sheet)
        _write_frozen(identity_path, frozen.identity_board)
        _write_frozen(generation_path, frozen.generation_ledger)
        _write_frozen(ownership_path, frozen.ownership_ledger)
        explicit_mask_reviews: dict[str, dict[str, object]] = {}
        for group, mask_snapshot, ledger_snapshot, ledger in (
            (
                "world",
                frozen.world_explicit_mask,
                frozen.world_mask_authoring_ledger,
                frozen.world_mask_review,
            ),
            (
                "portrait",
                frozen.portrait_explicit_mask,
                frozen.portrait_mask_authoring_ledger,
                frozen.portrait_mask_review,
            ),
        ):
            if mask_snapshot is None:
                continue
            assert ledger_snapshot is not None and ledger is not None
            mask_relative = f"source/reviewed-masks/{group}-sheet-mask.png"
            ledger_relative = (
                f"source/reviewed-masks/{group}-mask-authoring-ledger.json"
            )
            _write_frozen(staging / mask_relative, mask_snapshot)
            _write_frozen(staging / ledger_relative, ledger_snapshot)
            source = ledger["source"]
            assert isinstance(source, dict)
            components = ledger["components"]
            assert isinstance(components, list)
            explicit_mask_reviews[group] = {
                "operation": MASK_REVIEW_OPERATION,
                "reviewMethod": MASK_REVIEW_METHOD,
                "rawSheetFileSha256": source["rawSheetFileSha256"],
                "explicitSheetMaskPath": mask_relative,
                "explicitSheetMaskFileSha256": mask_snapshot.file_sha256,
                "explicitSheetMaskPixelSha256": source[
                    "explicitMaskPixelSha256"
                ],
                "maskAuthoringLedgerPath": ledger_relative,
                "maskAuthoringLedgerFileSha256": ledger_snapshot.file_sha256,
                "reviewedComponentCount": len(components),
            }

        prompt_world_suffix = options.world_prompt.suffix or ".txt"
        prompt_portrait_suffix = options.portrait_prompt.suffix or ".txt"
        prompt_world_name = f"world{prompt_world_suffix}"
        prompt_portrait_name = f"portrait{prompt_portrait_suffix}"
        prompt_world_path = staging / "source/prompts" / prompt_world_name
        prompt_portrait_path = staging / "source/prompts" / prompt_portrait_name
        _write_frozen(prompt_world_path, frozen.world_prompt)
        _write_frozen(prompt_portrait_path, frozen.portrait_prompt)
        generation = frozen.generation
        prompt_common = {
            "negativeConstraints": generation["negativeConstraints"],
            "tool": generation["tool"],
            "model": generation["model"],
            "parameters": generation["parameters"],
            "generatedAt": generation["generatedAt"],
            "requestedBackground": generation["requestedBackground"],
        }
        prompts = {
            "schemaVersion": SCHEMA_VERSION,
            "prompts": [
                {
                    "id": "world",
                    "text": frozen.world_prompt_text,
                    "copiedPath": prompt_world_path.relative_to(staging).as_posix(),
                    "fileSha256": frozen.world_prompt.file_sha256,
                    **prompt_common,
                },
                {
                    "id": "portrait",
                    "text": frozen.portrait_prompt_text,
                    "copiedPath": prompt_portrait_path.relative_to(staging).as_posix(),
                    "fileSha256": frozen.portrait_prompt.file_sha256,
                    **prompt_common,
                },
            ],
        }
        _write_json(staging / "source/prompts.json", prompts)

        frame_provenance = _save_frames(staging, [*world, *portraits])
        provenance = {
            "schemaVersion": SCHEMA_VERSION,
            "tool": TOOL_NAME,
            "toolVersion": TOOL_VERSION,
            "requestedBackground": generation["requestedBackground"],
            "sourceModes": {
                "world": world_grid["sourceMode"],
                "portrait": portrait_grid["sourceMode"],
            },
            "backgroundOperations": {
                "opaqueChroma": CHROMA_OPERATION,
                "genuineTransparent": TRANSPARENT_OPERATION,
                "reviewedChromaComponents": MASK_REVIEW_OPERATION,
            },
            "maskContract": (
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
            ),
            "explicitMaskReviews": explicit_mask_reviews,
            "identity": {
                "path": "identity/identity-board.png",
                "fileSha256": frozen.identity_board.file_sha256,
                "decodedRgbaByteSha256": rgba_bytes_hash(identity_board),
                "godotCanonicalRgbaSha256": godot_canonical_rgba_hash(identity_board),
                "decodedRgbaSha256": rgba_hash(identity_board),
                "size": list(identity_board.size),
            },
            "rawSheets": [
                {
                    "id": "world",
                    "copiedPath": "source/raw/world-sheet.png",
                    "inputFileSha256": frozen.world_sheet.file_sha256,
                    "copiedFileSha256": sha256_file(source_world),
                    "sourceMode": world_grid["sourceMode"],
                    "decodedRgbaByteSha256": rgba_bytes_hash(world_sheet),
                    "godotCanonicalRgbaSha256": godot_canonical_rgba_hash(world_sheet),
                    "decodedRgbaSha256": rgba_hash(world_sheet),
                    "size": list(world_sheet.size),
                },
                {
                    "id": "portrait",
                    "copiedPath": "source/raw/portrait-sheet.png",
                    "inputFileSha256": frozen.portrait_sheet.file_sha256,
                    "copiedFileSha256": sha256_file(source_portraits),
                    "sourceMode": portrait_grid["sourceMode"],
                    "decodedRgbaByteSha256": rgba_bytes_hash(portrait_sheet),
                    "godotCanonicalRgbaSha256": godot_canonical_rgba_hash(portrait_sheet),
                    "decodedRgbaSha256": rgba_hash(portrait_sheet),
                    "size": list(portrait_sheet.size),
                },
            ],
            "frames": frame_provenance,
        }
        _write_json(staging / "source/provenance.json", provenance)

        contact_path = staging / "evidence/contact-sheets/contact-sheet-transparent.png"
        contact_path.parent.mkdir(parents=True, exist_ok=True)
        contact = _contact_sheet(world, portraits)
        contact.save(contact_path, format="PNG", optimize=False)

        qc = {
            "schemaVersion": SCHEMA_VERSION,
            "tool": TOOL_NAME,
            "status": "pass",
            "scope": "deterministic_structure_and_pixel_risk_only",
            "checks": {
                "worldGrid": {"status": "pass", **world_grid},
                "portraitGrid": {"status": "pass", **portrait_grid},
                "worldFrameCount": {"status": "pass", "actual": len(world), "expected": 8},
                "portraitFrameCount": {
                    "status": "pass",
                    "actual": len(portraits),
                    "expected": 4,
                },
                "outputDimensions": {
                    "status": "pass",
                    "world": [WORLD_SIZE, WORLD_SIZE],
                    "portraits": [PORTRAIT_SIZE, PORTRAIT_SIZE],
                },
                "alphaBoundsAndTransparency": {"status": "pass"},
                "maskBoundedSourceProcessing": {
                    "status": "pass",
                    "operations": [CHROMA_OPERATION, TRANSPARENT_OPERATION],
                    "reviewOperation": MASK_REVIEW_OPERATION,
                    "eligibilityMaskPixelCount": sum(
                        int(frame.metadata["sourceProcessing"]["eligiblePixelCount"])
                        for frame in [*world, *portraits]
                    ),
                    "changedPixelCount": sum(
                        int(frame.metadata["sourceProcessing"]["changedPixelCount"])
                        for frame in [*world, *portraits]
                    ),
                    "changedPixelMasks": [
                        {
                            "group": frame.prepared.group,
                            "slot": frame.prepared.slot,
                            "pixelSha256": mask_hash(
                                frame.prepared.changed_pixel_mask
                            ),
                            "changedPixelCount": int(
                                frame.metadata["sourceProcessing"][
                                    "changedPixelCount"
                                ]
                            ),
                        }
                        for frame in [*world, *portraits]
                    ],
                    "classifierEnclosedCandidatePixels": sum(
                        int(
                            frame.metadata["sourceProcessing"].get(
                                "classifierEnclosedCandidatePixels", 0
                            )
                        )
                        for frame in [*world, *portraits]
                    ),
                    "classifierAdjacentFringeCandidatePixels": sum(
                        int(
                            frame.metadata["sourceProcessing"].get(
                                "classifierAdjacentFringeCandidatePixels", 0
                            )
                        )
                        for frame in [*world, *portraits]
                    ),
                    "classifierResidualKeyColorCandidatePixels": sum(
                        int(
                            frame.metadata["sourceProcessing"].get(
                                "classifierResidualKeyColorCandidatePixels", 0
                            )
                        )
                        for frame in [*world, *portraits]
                    ),
                    "reviewedBackgroundHolePixelCount": sum(
                        int(
                            frame.metadata["sourceProcessing"]["maskReview"][
                                "reviewedBackgroundHolePixelCount"
                            ]
                        )
                        for frame in [*world, *portraits]
                    ),
                    "reviewedBackgroundFringePixelCount": sum(
                        int(
                            frame.metadata["sourceProcessing"]["maskReview"][
                                "reviewedBackgroundFringePixelCount"
                            ]
                        )
                        for frame in [*world, *portraits]
                    ),
                    "reviewedOuterBackgroundHolePixelCount": sum(
                        int(
                            frame.metadata["sourceProcessing"]["maskReview"][
                                "reviewedOuterBackgroundHolePixelCount"
                            ]
                        )
                        for frame in [*world, *portraits]
                    ),
                    "reviewedRetainedSubjectPixelCount": sum(
                        int(
                            frame.metadata["sourceProcessing"]["maskReview"][
                                "reviewedRetainedSubjectPixelCount"
                            ]
                        )
                        for frame in [*world, *portraits]
                    ),
                    "reviewedResidualKeySpillPixelCount": sum(
                        int(
                            frame.metadata["sourceProcessing"]["maskReview"][
                                "reviewedResidualKeySpillPixelCount"
                            ]
                        )
                        for frame in [*world, *portraits]
                    ),
                    "reviewedRetainedAuthoredColorPixelCount": sum(
                        int(
                            frame.metadata["sourceProcessing"]["maskReview"][
                                "reviewedRetainedAuthoredColorPixelCount"
                            ]
                        )
                        for frame in [*world, *portraits]
                    ),
                    "ambiguousEnclosedCandidatePixels": 0,
                    "unreviewedEnclosedCandidatePixels": 0,
                    "unreviewedResidualKeyColorCandidatePixels": 0,
                    "postMaskGlobalColorDeletion": False,
                },
                "staticDetachedForeground": {
                    "status": "pass",
                    "operation": DETACHED_FOREGROUND_OPERATION,
                    "connectivity": DETACHED_FOREGROUND_CONNECTIVITY,
                    "alphaThresholdInclusive": DETACHED_FOREGROUND_ALPHA_THRESHOLD,
                    "minimumBlockingDetachedPixelCount": DETACHED_FOREGROUND_PIXEL_THRESHOLD,
                    "processedBlockingComponentCount": 0,
                    "runtimeBlockingComponentCount": 0,
                    "automaticDeletionApplied": False,
                },
                "distinctFrameRisks": {"status": "pass", **distinct_qc},
            },
            "directionReview": {
                "automaticallyApproved": False,
                "status": "blind_visual_review_required",
                "reason": (
                    "Hashes can reject exact duplicates and mirrors but cannot infer "
                    "whether a non-identical silhouette faces the requested direction."
                ),
            },
        }
        qc_path = staging / "evidence/qc/qc-summary.json"
        qc_path.parent.mkdir(parents=True, exist_ok=True)
        _write_json(qc_path, qc)

        role_without_prefix = (
            options.role_id[4:] if options.role_id.startswith("npc_") else options.role_id
        )
        appearance_id = (
            options.role_id
            if options.role_id.startswith("npc_")
            else f"npc_{options.role_id}"
        )
        display_name = options.display_name or role_without_prefix
        manifest = {
            "schemaVersion": SCHEMA_VERSION,
            "archetypeId": role_without_prefix,
            "appearanceId": appearance_id,
            "displayName": display_name,
            "mobility": "static",
            "directions": list(DEFAULT_DIRECTIONS),
            "world": {
                "runtimeSize": [WORLD_SIZE, WORLD_SIZE],
                "idleFrames": 1,
                "walkFrames": 0,
                "runtimeMirroring": False,
            },
            "identity": {
                "board": "identity/identity-board.png",
                "fileSha256": frozen.identity_board.file_sha256,
                "decodedRgbaByteSha256": rgba_bytes_hash(identity_board),
                "godotCanonicalRgbaSha256": godot_canonical_rgba_hash(identity_board),
                "decodedRgbaSha256": rgba_hash(identity_board),
                "size": list(identity_board.size),
            },
            "portraits": {
                "states": list(DEFAULT_PORTRAIT_SLOTS),
                "runtimeSize": [PORTRAIT_SIZE, PORTRAIT_SIZE],
                "defaultState": "neutral",
                "speakingState": "speaking",
            },
            "generation": {
                "tool": generation["tool"],
                "model": generation["model"],
                "generatedAt": generation["generatedAt"],
                "requestedBackground": generation["requestedBackground"],
                "sourceModes": {
                    "world": world_grid["sourceMode"],
                    "portrait": portrait_grid["sourceMode"],
                },
                "backgroundOperations": {
                    "opaqueChroma": CHROMA_OPERATION,
                    "genuineTransparent": TRANSPARENT_OPERATION,
                    "reviewedComponents": MASK_REVIEW_OPERATION,
                },
                "promptLedger": "source/prompts.json",
                "provenanceLedger": "source/provenance.json",
                "generationLedger": "source/generation-ledger.json",
                "explicitMaskReviews": explicit_mask_reviews,
                "pipelineMetadata": "pipeline-meta.json",
                "qcSummary": "evidence/qc/qc-summary.json",
            },
            "ownership": {
                "origin": frozen.ownership["origin"],
                "owner": frozen.ownership["owner"],
                "licenseBasis": frozen.ownership["licenseBasis"],
                "replacementPath": frozen.ownership["replacementPath"],
                "ledger": "source/ownership-ledger.json",
            },
            "review": {
                "artStatus": "in_production",
                "ownerReviewStatus": "pending",
                "contactSheet": "evidence/contact-sheets/contact-sheet-transparent.png",
                "blindDirectionAudit": "required",
                "automaticDirectionApproval": False,
            },
            "release": {
                "runtimeEnabled": False,
                "releaseApproved": False,
                "reason": (
                    "builder output lacks real-Godot, blind-direction and explicit "
                    "owner acceptance evidence"
                ),
            },
        }
        _write_json(staging / "npc-bundle.json", manifest)

        pipeline_metadata: dict[str, object] = {
            "schemaVersion": SCHEMA_VERSION,
            "tool": TOOL_NAME,
            "toolVersion": TOOL_VERSION,
            "roleId": options.role_id,
            "archetypeId": role_without_prefix,
            "appearanceId": appearance_id,
            "canonicalDirections": list(DEFAULT_DIRECTIONS),
            "portraitSlots": list(DEFAULT_PORTRAIT_SLOTS),
            "sourceProcessing": {
                "requestedBackground": generation["requestedBackground"],
                "sourceModes": {
                    "world": world_grid["sourceMode"],
                    "portrait": portrait_grid["sourceMode"],
                },
                "backgroundOperations": {
                    "opaqueChroma": CHROMA_OPERATION,
                    "genuineTransparent": TRANSPARENT_OPERATION,
                    "reviewedChromaComponents": MASK_REVIEW_OPERATION,
                },
                "connectivity": CHROMA_CONNECTIVITY,
                "edgePolicies": {
                    "world": WORLD_EDGE_POLICY,
                    "portrait": PORTRAIT_EDGE_POLICY,
                    "portraitInnerCropMinimumYRatio": PORTRAIT_INNER_CROP_MIN_Y_RATIO,
                },
                "maskProvenance": {
                    "eligibilityMask": (
                        "per-cell lossless binary L PNG; records the complete "
                        "automatic plus reviewed background-eligible domain"
                    ),
                    "changedPixelMask": (
                        "per-cell lossless binary L PNG; exactly marks decoded "
                        "source RGBA pixels changed by source processing"
                    ),
                    "invariant": "no_source_rgba_change_outside_changed_pixel_mask",
                },
                "ambiguousEnclosedCandidates": (
                    "fail_closed_unless_whole_components_are_bound_to_a_frozen_"
                    "explicit_mask_and_visual_review_ledger"
                ),
                "residualKeyColorCandidates": {
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
                },
                "explicitMaskReviews": explicit_mask_reviews,
                "softMatte": {
                    "algorithm": SOFT_MATTE_ALGORITHM,
                    "referenceScriptSha256": SOFT_MATTE_REFERENCE_SHA256,
                    "transparentThreshold": SOFT_MATTE_TRANSPARENT_THRESHOLD,
                    "opaqueThreshold": SOFT_MATTE_OPAQUE_THRESHOLD,
                    "maximumFourNeighbourDistance": FRINGE_MAX_DISTANCE,
                    "globalProposalApplied": False,
                },
                "globalRgbCleanup": False,
                "colorDistanceDeletion": False,
            },
            "staticDetachedForeground": {
                "operation": DETACHED_FOREGROUND_OPERATION,
                "connectivity": DETACHED_FOREGROUND_CONNECTIVITY,
                "alphaThresholdInclusive": DETACHED_FOREGROUND_ALPHA_THRESHOLD,
                "minimumBlockingDetachedPixelCount": DETACHED_FOREGROUND_PIXEL_THRESHOLD,
                "automaticDeletionApplied": False,
                "failureAction": "regenerate_clean_source",
            },
            "resize": {
                "algorithm": PREMULTIPLIED_RESAMPLE,
                "pillowFilter": "Image.Resampling.BILINEAR",
                "worldTarget": [WORLD_SIZE, WORLD_SIZE],
                "portraitTarget": [PORTRAIT_SIZE, PORTRAIT_SIZE],
                "worldCommonScale": round(world_scale, 10),
                "portraitCommonScale": round(portrait_scale, 10),
                "worldVerticalAnchor": "baseline",
                "portraitVerticalAnchor": "center",
            },
            "inputs": {
                "worldSheet": {
                    "originalPath": str(frozen.world_sheet.original_path),
                    "fileSha256": frozen.world_sheet.file_sha256,
                    "sourceMode": world_grid["sourceMode"],
                    "decodedRgbaByteSha256": rgba_bytes_hash(world_sheet),
                    "godotCanonicalRgbaSha256": godot_canonical_rgba_hash(world_sheet),
                    "decodedRgbaSha256": rgba_hash(world_sheet),
                    "size": list(world_sheet.size),
                    "grid": world_grid,
                },
                "portraitSheet": {
                    "originalPath": str(frozen.portrait_sheet.original_path),
                    "fileSha256": frozen.portrait_sheet.file_sha256,
                    "sourceMode": portrait_grid["sourceMode"],
                    "decodedRgbaByteSha256": rgba_bytes_hash(portrait_sheet),
                    "godotCanonicalRgbaSha256": godot_canonical_rgba_hash(portrait_sheet),
                    "decodedRgbaSha256": rgba_hash(portrait_sheet),
                    "size": list(portrait_sheet.size),
                    "grid": portrait_grid,
                },
                "worldPrompt": {
                    "originalPath": str(frozen.world_prompt.original_path),
                    "fileSha256": frozen.world_prompt.file_sha256,
                },
                "portraitPrompt": {
                    "originalPath": str(frozen.portrait_prompt.original_path),
                    "fileSha256": frozen.portrait_prompt.file_sha256,
                },
                "identityBoard": {
                    "originalPath": str(frozen.identity_board.original_path),
                    "fileSha256": frozen.identity_board.file_sha256,
                    "decodedRgbaByteSha256": rgba_bytes_hash(identity_board),
                    "godotCanonicalRgbaSha256": godot_canonical_rgba_hash(identity_board),
                    "decodedRgbaSha256": rgba_hash(identity_board),
                    "size": list(identity_board.size),
                },
                "generationLedger": {
                    "originalPath": str(frozen.generation_ledger.original_path),
                    "fileSha256": frozen.generation_ledger.file_sha256,
                },
                "ownershipLedger": {
                    "originalPath": str(frozen.ownership_ledger.original_path),
                    "fileSha256": frozen.ownership_ledger.file_sha256,
                },
                **(
                    {
                        "worldExplicitMask": {
                            "originalPath": str(
                                frozen.world_explicit_mask.original_path
                            ),
                            "fileSha256": frozen.world_explicit_mask.file_sha256,
                            "authoringLedgerOriginalPath": str(
                                frozen.world_mask_authoring_ledger.original_path
                            ),
                            "authoringLedgerFileSha256": frozen.world_mask_authoring_ledger.file_sha256,
                        }
                    }
                    if frozen.world_explicit_mask is not None
                    and frozen.world_mask_authoring_ledger is not None
                    else {}
                ),
                **(
                    {
                        "portraitExplicitMask": {
                            "originalPath": str(
                                frozen.portrait_explicit_mask.original_path
                            ),
                            "fileSha256": frozen.portrait_explicit_mask.file_sha256,
                            "authoringLedgerOriginalPath": str(
                                frozen.portrait_mask_authoring_ledger.original_path
                            ),
                            "authoringLedgerFileSha256": frozen.portrait_mask_authoring_ledger.file_sha256,
                        }
                    }
                    if frozen.portrait_explicit_mask is not None
                    and frozen.portrait_mask_authoring_ledger is not None
                    else {}
                ),
            },
            "buildOptions": {
                "worldSourceMode": options.world_source_mode,
                "portraitSourceMode": options.portrait_source_mode,
                "sourceEdgeMargin": options.source_edge_margin,
                "worldSafeMargin": options.world_safe_margin,
                "portraitSafeMargin": options.portrait_safe_margin,
                "cropPadding": options.crop_padding,
                "worldFitScale": options.world_fit_scale,
                "portraitFitScale": options.portrait_fit_scale,
            },
            "frames": [frame.metadata for frame in [*world, *portraits]],
            "qc": qc,
        }

        tool_source = Path(__file__).resolve()
        tool_snapshot = _freeze_file(tool_source, "NPC bundle builder script")
        tool_copy = staging / "source/tool/build_npc_art_bundle.py"
        _write_frozen(tool_copy, tool_snapshot)
        dependencies = {
            "schemaVersion": SCHEMA_VERSION,
            "tool": TOOL_NAME,
            "toolVersion": TOOL_VERSION,
            "scriptPath": "source/tool/build_npc_art_bundle.py",
            "scriptSha256": tool_snapshot.file_sha256,
            "versions": _dependency_versions(),
            "platform": platform.platform(),
        }
        _write_json(staging / "source/dependencies.json", dependencies)
        pipeline_metadata["environment"] = dependencies
        pipeline_metadata["replay"] = {
            "executable": "python3",
            "workingDirectory": "{bundle}",
            "script": "{bundle}/source/tool/build_npc_art_bundle.py",
            "scriptSha256": tool_snapshot.file_sha256,
            "dependencyLock": "{bundle}/source/dependencies.json",
            "arguments": _replay_arguments(
                options, prompt_world_name, prompt_portrait_name
            ),
        }
        pipeline_metadata["outputFileSha256"] = _relative_file_hashes(staging)
        _write_json(staging / "pipeline-meta.json", pipeline_metadata)
        _fsync_tree(staging)
        _atomic_publish_new(staging, options.output_dir)
        return pipeline_metadata
    except Exception:
        shutil.rmtree(staging, ignore_errors=True)
        raise


def build_bundle(options: BuildOptions) -> dict[str, object]:
    validate_options(options)
    with _locked_output(options.output_dir):
        _validate_new_output(options.output_dir)
        frozen = _freeze_inputs(options)
        world_sheet = _load_png_snapshot(frozen.world_sheet, require_opaque=False)
        portrait_sheet = _load_png_snapshot(
            frozen.portrait_sheet, require_opaque=False
        )
        world_source_mode, world_alpha_stats = _resolve_source_mode(
            world_sheet, options.world_source_mode, "world sheet"
        )
        portrait_source_mode, portrait_alpha_stats = _resolve_source_mode(
            portrait_sheet, options.portrait_source_mode, "portrait sheet"
        )
        _validate_generation_source_modes(
            frozen.generation,
            {"world": world_source_mode, "portrait": portrait_source_mode},
        )
        identity_board = _load_png_snapshot(
            frozen.identity_board, require_opaque=False
        )
        world_mask_review = _build_explicit_mask_review(
            "world",
            frozen.world_sheet,
            world_sheet,
            frozen.world_explicit_mask,
            frozen.world_mask_authoring_ledger,
            frozen.world_mask_review,
        )
        portrait_mask_review = _build_explicit_mask_review(
            "portrait",
            frozen.portrait_sheet,
            portrait_sheet,
            frozen.portrait_explicit_mask,
            frozen.portrait_mask_authoring_ledger,
            frozen.portrait_mask_review,
        )
        world_prepared, world_grid = _prepare_group(
            world_sheet,
            "world",
            WORLD_ROWS,
            WORLD_COLS,
            DEFAULT_DIRECTIONS,
            options.source_edge_margin,
            options.crop_padding,
            world_mask_review,
            world_source_mode,
        )
        portrait_prepared, portrait_grid = _prepare_group(
            portrait_sheet,
            "portrait",
            PORTRAIT_ROWS,
            PORTRAIT_COLS,
            DEFAULT_PORTRAIT_SLOTS,
            options.source_edge_margin,
            options.crop_padding,
            portrait_mask_review,
            portrait_source_mode,
        )
        world_grid["sheetAlphaStats"] = world_alpha_stats
        portrait_grid["sheetAlphaStats"] = portrait_alpha_stats
        world, world_scale = _render_group(
            world_prepared,
            WORLD_SIZE,
            options.world_safe_margin,
            options.world_fit_scale,
            "baseline",
        )
        portraits, portrait_scale = _render_group(
            portrait_prepared,
            PORTRAIT_SIZE,
            options.portrait_safe_margin,
            options.portrait_fit_scale,
            "center",
        )
        distinct_qc = _validate_distinct_frames(world, portraits)
        return _write_bundle(
            options,
            frozen,
            world_sheet,
            portrait_sheet,
            identity_board,
            world_grid,
            portrait_grid,
            world,
            portraits,
            world_scale,
            portrait_scale,
            distinct_qc,
        )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("--role-id", required=True)
    parser.add_argument("--display-name")
    parser.add_argument("--world-sheet", required=True, type=Path)
    parser.add_argument("--portrait-sheet", required=True, type=Path)
    parser.add_argument("--identity-board", required=True, type=Path)
    parser.add_argument("--world-prompt", required=True, type=Path)
    parser.add_argument("--portrait-prompt", required=True, type=Path)
    parser.add_argument("--generation-ledger", required=True, type=Path)
    parser.add_argument("--ownership-ledger", required=True, type=Path)
    parser.add_argument(
        "--world-explicit-mask",
        type=Path,
        help=(
            "Optional 8-bit grayscale sheet mask; requires the paired visual-review "
            "authoring ledger and may add only whole enclosed classifier components."
        ),
    )
    parser.add_argument("--world-mask-authoring-ledger", type=Path)
    parser.add_argument("--portrait-explicit-mask", type=Path)
    parser.add_argument("--portrait-mask-authoring-ledger", type=Path)
    parser.add_argument(
        "--world-source-mode",
        choices=SOURCE_MODES,
        default=SOURCE_MODE_AUTO,
        help="Resolve automatically, require legacy opaque chroma, or require genuine alpha.",
    )
    parser.add_argument(
        "--portrait-source-mode",
        choices=SOURCE_MODES,
        default=SOURCE_MODE_AUTO,
    )
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--source-edge-margin", type=int, default=4)
    parser.add_argument("--world-safe-margin", type=int, default=8)
    parser.add_argument("--portrait-safe-margin", type=int, default=12)
    parser.add_argument("--crop-padding", type=int, default=4)
    parser.add_argument("--world-fit-scale", type=float, default=0.86)
    parser.add_argument("--portrait-fit-scale", type=float, default=0.90)
    return parser


def options_from_args(args: argparse.Namespace) -> BuildOptions:
    return BuildOptions(
        role_id=args.role_id,
        display_name=args.display_name,
        world_sheet=args.world_sheet,
        portrait_sheet=args.portrait_sheet,
        identity_board=args.identity_board,
        world_prompt=args.world_prompt,
        portrait_prompt=args.portrait_prompt,
        generation_ledger=args.generation_ledger,
        ownership_ledger=args.ownership_ledger,
        output_dir=args.output_dir,
        world_explicit_mask=args.world_explicit_mask,
        world_mask_authoring_ledger=args.world_mask_authoring_ledger,
        portrait_explicit_mask=args.portrait_explicit_mask,
        portrait_mask_authoring_ledger=args.portrait_mask_authoring_ledger,
        world_source_mode=args.world_source_mode,
        portrait_source_mode=args.portrait_source_mode,
        source_edge_margin=args.source_edge_margin,
        world_safe_margin=args.world_safe_margin,
        portrait_safe_margin=args.portrait_safe_margin,
        crop_padding=args.crop_padding,
        world_fit_scale=args.world_fit_scale,
        portrait_fit_scale=args.portrait_fit_scale,
    )


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        metadata = build_bundle(options_from_args(args))
    except NpcBundleBuildError as exc:
        parser.exit(2, f"error: {exc}\n")
    print(
        f"built={args.output_dir} appearance={metadata['appearanceId']} "
        "world=8 portraits=4 direction_review=required"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
