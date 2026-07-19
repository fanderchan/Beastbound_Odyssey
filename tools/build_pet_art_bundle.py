#!/usr/bin/env python3
"""Build deterministic Beastbound pet sprite bundles from chroma-key sheets.

The input must be an already-created multi-row/multi-column image-generation
sheet on a solid ``#FF00FF`` background.  This tool does not create or alter
creative poses.  It only removes the chroma background, isolates frame cells,
normalizes every frame with one shared scale and anchor rule, performs strict
QC, and publishes transparent 512px source frames plus 256px runtime frames.

The build fails closed for empty/cropped frames, unsafe output bounds, large
detached components, residual magenta, or excessive generated scale drift.
Outputs are staged and installed atomically so a failed build cannot leave a
partially valid-looking bundle behind.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import re
import shutil
import statistics
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Sequence

import numpy as np
from PIL import Image, ImageDraw, ImageFont

from cleanup_sprite_alpha_components import alpha_components


TOOL_NAME = "build_pet_art_bundle.py"
SCHEMA_VERSION = 1
SOURCE_FRAME_SIZE = 512
RUNTIME_FRAME_SIZE = 256
RESAMPLE_GUARD = 2
DEFAULT_KEY = (255, 0, 255)
SLOT_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]*$")


class BundleBuildError(ValueError):
    """A deterministic validation failure suitable for a concise CLI error."""


@dataclass(frozen=True)
class BuildOptions:
    input_path: Path
    output_dir: Path
    rows: int
    cols: int
    slots: tuple[str, ...]
    key: tuple[int, int, int] = DEFAULT_KEY
    transparent_distance: float = 40.0
    opaque_distance: float = 150.0
    alpha_threshold: int = 8
    component_mode: str = "largest"
    min_component_area: int = 64
    max_detached_component_ratio: float = 0.12
    component_padding: int = 2
    fit_scale: float = 0.82
    anchor: str = "feet"
    foot_band_ratio: float = 0.12
    safe_margin: int = 4
    source_edge_margin: int = 4
    max_dimension_drift: float = 0.35
    residual_magenta_distance: float = 70.0
    fringe_cleanup_alpha: int = 96
    allow_upscale: bool = True
    make_gif: bool = False
    make_contact_sheet: bool = False
    duration_ms: int = 100
    contact_columns: int = 4
    force: bool = False


@dataclass
class PreparedFrame:
    slot: str
    row: int
    col: int
    cell_box: tuple[int, int, int, int]
    cutout: Image.Image
    visible_bbox_in_cutout: tuple[int, int, int, int]
    horizontal_anchor: float
    subject_span: float
    metadata: dict[str, object]


@dataclass
class RenderedFrame:
    prepared: PreparedFrame
    source: Image.Image
    runtime: Image.Image
    metadata: dict[str, object]


def parse_hex_color(value: str) -> tuple[int, int, int]:
    text = value.strip().lstrip("#")
    if len(text) != 6:
        raise argparse.ArgumentTypeError("color must be six hexadecimal digits")
    try:
        return tuple(int(text[index : index + 2], 16) for index in (0, 2, 4))
    except ValueError as exc:
        raise argparse.ArgumentTypeError("color must be hexadecimal") from exc


def color_text(color: tuple[int, int, int]) -> str:
    return "#%02X%02X%02X" % color


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def rgba_hash(image: Image.Image) -> str:
    rgba = image.convert("RGBA")
    digest = hashlib.sha256()
    digest.update(f"{rgba.width}x{rgba.height}:RGBA\n".encode("ascii"))
    digest.update(rgba.tobytes())
    return digest.hexdigest()


def validate_options(options: BuildOptions) -> None:
    if not options.input_path.is_file():
        raise BundleBuildError(f"input does not exist: {options.input_path}")
    if options.rows <= 0 or options.cols <= 0:
        raise BundleBuildError("rows and cols must be positive")
    expected = options.rows * options.cols
    if len(options.slots) != expected:
        raise BundleBuildError(
            f"expected exactly {expected} explicit slot names for "
            f"{options.rows}x{options.cols}, got {len(options.slots)}"
        )
    if len(set(options.slots)) != len(options.slots):
        raise BundleBuildError("slot names must be unique")
    invalid_slots = [slot for slot in options.slots if not SLOT_PATTERN.fullmatch(slot)]
    if invalid_slots:
        raise BundleBuildError(
            "slot names may contain only ASCII letters, digits, dot, underscore, and hyphen: "
            + ", ".join(invalid_slots)
        )
    if not 0.0 <= options.transparent_distance < options.opaque_distance:
        raise BundleBuildError(
            "transparent-distance must be non-negative and lower than opaque-distance"
        )
    if not 1 <= options.alpha_threshold <= 255:
        raise BundleBuildError("alpha-threshold must be between 1 and 255")
    if options.component_mode not in {"largest", "all"}:
        raise BundleBuildError("component-mode must be largest or all")
    if options.min_component_area <= 0:
        raise BundleBuildError("min-component-area must be positive")
    if not 0.0 <= options.max_detached_component_ratio <= 1.0:
        raise BundleBuildError("max-detached-component-ratio must be between 0 and 1")
    if options.component_padding < 0:
        raise BundleBuildError("component-padding cannot be negative")
    if not 0.1 <= options.fit_scale <= 1.0:
        raise BundleBuildError("fit-scale must be between 0.1 and 1.0")
    if options.anchor not in {"bottom-center", "feet"}:
        raise BundleBuildError("anchor must be bottom-center or feet")
    if not 0.01 <= options.foot_band_ratio <= 0.5:
        raise BundleBuildError("foot-band-ratio must be between 0.01 and 0.5")
    if options.safe_margin < 4:
        raise BundleBuildError("safe-margin must be at least 4 pixels")
    if options.safe_margin * 2 >= RUNTIME_FRAME_SIZE:
        raise BundleBuildError("safe-margin leaves no runtime drawing area")
    if options.source_edge_margin < 0:
        raise BundleBuildError("source-edge-margin cannot be negative")
    if not 0.0 <= options.max_dimension_drift <= 1.0:
        raise BundleBuildError("max-dimension-drift must be between 0 and 1")
    if options.residual_magenta_distance < 0:
        raise BundleBuildError("residual-magenta-distance cannot be negative")
    if not 1 <= options.fringe_cleanup_alpha <= 127:
        raise BundleBuildError("fringe-cleanup-alpha must be between 1 and 127")
    if options.duration_ms <= 0:
        raise BundleBuildError("duration-ms must be positive")
    if options.contact_columns <= 0:
        raise BundleBuildError("contact-columns must be positive")
    validate_output_target(options.output_dir, options.force)


def validate_output_target(output_dir: Path, force: bool) -> None:
    if not output_dir.exists():
        return
    if not output_dir.is_dir():
        raise BundleBuildError(f"output path is not a directory: {output_dir}")
    contents = list(output_dir.iterdir())
    if not contents:
        return
    if not force:
        raise BundleBuildError(f"output directory is not empty: {output_dir}; pass --force")
    metadata_path = output_dir / "pipeline-meta.json"
    try:
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise BundleBuildError(
            "refusing to replace a non-empty directory not owned by this builder: "
            f"{output_dir}"
        ) from exc
    if metadata.get("tool") != TOOL_NAME:
        raise BundleBuildError(
            "refusing to replace a non-empty directory not owned by this builder: "
            f"{output_dir}"
        )


def border_connected(mask: np.ndarray) -> np.ndarray:
    """Return candidate pixels connected to a synthetic one-pixel outer border."""

    padded = np.pad(mask.astype(np.uint8) * 255, 1, mode="constant", constant_values=255)
    # ``Image.fromarray`` may expose a read-only buffer.  Flood fill silently
    # returns when its seed assignment raises ValueError, so force an owned
    # mutable copy before filling.
    flood = Image.fromarray(padded, mode="L").copy()
    ImageDraw.floodfill(flood, (0, 0), 128, thresh=0)
    flooded = np.asarray(flood, dtype=np.uint8) == 128
    return flooded[1:-1, 1:-1]


def chroma_to_alpha(
    image: Image.Image,
    key: tuple[int, int, int],
    transparent_distance: float,
    opaque_distance: float,
    alpha_threshold: int,
) -> tuple[Image.Image, dict[str, object]]:
    """Key only border-connected magenta and decontaminate partial edge RGB."""

    rgba = np.asarray(image.convert("RGBA"), dtype=np.uint8).copy()
    rgb = rgba[:, :, :3].astype(np.float32)
    original_alpha = rgba[:, :, 3].astype(np.float32) / 255.0
    key_rgb = np.asarray(key, dtype=np.float32)
    distance = np.sqrt(np.sum(np.square(rgb - key_rgb), axis=2))

    corner_alphas = [
        int(rgba[0, 0, 3]),
        int(rgba[0, -1, 3]),
        int(rgba[-1, 0, 3]),
        int(rgba[-1, -1, 3]),
    ]
    if all(value < alpha_threshold for value in corner_alphas):
        # Accept the output of the project-approved chroma helper as an input
        # too.  It provides a stronger soft matte/despill pass for fur, fins,
        # and high-resolution identity boards than a second hard key.
        output_alpha = rgba[:, :, 3]
        output_alpha[output_alpha < alpha_threshold] = 0
        rgba[:, :, 3] = output_alpha
        rgba[output_alpha == 0, :3] = 0
        return Image.fromarray(rgba, mode="RGBA"), {
            "inputBackgroundMode": "transparent_alpha",
            "cornerAlpha": corner_alphas,
            "borderConnectedPixels": 0,
            "keyedCandidatePixels": 0,
            "transparentPixels": int(np.count_nonzero(output_alpha == 0)),
            "partialAlphaPixels": int(
                np.count_nonzero((output_alpha > 0) & (output_alpha < 255))
            ),
            "backgroundRatio": round(
                float(np.count_nonzero(output_alpha == 0)) / output_alpha.size,
                6,
            ),
        }

    corner_distances = [
        float(distance[0, 0]),
        float(distance[0, -1]),
        float(distance[-1, 0]),
        float(distance[-1, -1]),
    ]
    if any(value >= opaque_distance for value in corner_distances):
        raise BundleBuildError(
            "cell corners are not chroma background; subject may be cropped or the sheet "
            f"does not use {color_text(key)} (distances={','.join(f'{v:.1f}' for v in corner_distances)})"
        )

    candidate = distance < opaque_distance
    connected = border_connected(candidate)
    if not np.any(connected):
        raise BundleBuildError("cell has no border-connected chroma background")

    matte = np.ones(distance.shape, dtype=np.float32)
    span = max(1.0, opaque_distance - transparent_distance)
    # The key color is contractually forbidden inside the pet.  Key every
    # near-magenta pixel, including enclosed negative spaces between limbs;
    # border connectivity remains a validation signal for the outer backdrop.
    # Restricting keying to the outer flood would leave opaque magenta pockets
    # whenever arms, legs, fins, or a curled tail enclose background.
    matte[candidate] = np.clip(
        (distance[candidate] - transparent_distance) / span,
        0.0,
        1.0,
    )
    output_alpha = np.rint(original_alpha * matte * 255.0).astype(np.uint8)
    output_alpha[output_alpha < alpha_threshold] = 0

    partial = candidate & (matte > 0.0) & (matte < 1.0) & (output_alpha > 0)
    if np.any(partial):
        partial_matte = np.maximum(matte[partial, None], 1.0 / 255.0)
        decontaminated = (
            rgb[partial] - (1.0 - partial_matte) * key_rgb[None, :]
        ) / partial_matte
        rgba[:, :, :3][partial] = np.rint(np.clip(decontaminated, 0.0, 255.0)).astype(
            np.uint8
        )

    rgba[:, :, 3] = output_alpha
    rgba[output_alpha == 0, :3] = 0
    cleaned = Image.fromarray(rgba, mode="RGBA")
    return cleaned, {
        "inputBackgroundMode": "chroma_key",
        "cornerChromaDistances": [round(value, 3) for value in corner_distances],
        "borderConnectedPixels": int(np.count_nonzero(connected)),
        "keyedCandidatePixels": int(np.count_nonzero(candidate)),
        "transparentPixels": int(np.count_nonzero(output_alpha == 0)),
        "partialAlphaPixels": int(np.count_nonzero((output_alpha > 0) & (output_alpha < 255))),
        "backgroundRatio": round(float(np.count_nonzero(connected)) / connected.size, 6),
    }


def component_bbox(component: Sequence[tuple[int, int]]) -> tuple[int, int, int, int]:
    xs = [point[0] for point in component]
    ys = [point[1] for point in component]
    return min(xs), min(ys), max(xs) + 1, max(ys) + 1


def bbox_touches_margin(
    bbox: tuple[int, int, int, int], width: int, height: int, margin: int
) -> bool:
    x0, y0, x1, y1 = bbox
    return x0 < margin or y0 < margin or x1 > width - margin or y1 > height - margin


def visible_bbox(image: Image.Image, alpha_threshold: int) -> tuple[int, int, int, int]:
    alpha = np.asarray(image.convert("RGBA").getchannel("A"), dtype=np.uint8)
    ys, xs = np.nonzero(alpha >= alpha_threshold)
    if len(xs) == 0:
        raise BundleBuildError("frame has no visible pixels after normalization")
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def count_residual_magenta(
    image: Image.Image,
    key: tuple[int, int, int],
    alpha_threshold: int,
    residual_distance: float,
) -> int:
    rgba = np.asarray(image.convert("RGBA"), dtype=np.uint8)
    visible = rgba[:, :, 3] >= alpha_threshold
    rgb = rgba[:, :, :3].astype(np.float32)
    distance = np.sqrt(
        np.sum(np.square(rgb - np.asarray(key, dtype=np.float32)), axis=2)
    )
    return int(np.count_nonzero(visible & (distance <= residual_distance)))


def clear_unselected_components(
    image: Image.Image,
    selected: Sequence[Sequence[tuple[int, int]]],
) -> Image.Image:
    rgba = np.asarray(image.convert("RGBA"), dtype=np.uint8).copy()
    keep = np.zeros((image.height, image.width), dtype=np.bool_)
    for component in selected:
        for x, y in component:
            keep[y, x] = True
    rgba[~keep] = 0
    return Image.fromarray(rgba, mode="RGBA")


def horizontal_anchor(
    cutout: Image.Image,
    bbox: tuple[int, int, int, int],
    anchor: str,
    foot_band_ratio: float,
    alpha_threshold: int,
) -> float:
    if anchor == "bottom-center":
        return (bbox[0] + bbox[2]) / 2.0

    alpha = np.asarray(cutout.getchannel("A"), dtype=np.float32)
    band_height = max(2, round((bbox[3] - bbox[1]) * foot_band_ratio))
    band_top = max(bbox[1], bbox[3] - band_height)
    band = alpha[band_top : bbox[3], bbox[0] : bbox[2]]
    y_indices, x_indices = np.nonzero(band >= alpha_threshold)
    if len(x_indices) == 0:
        return (bbox[0] + bbox[2]) / 2.0
    weights = band[y_indices, x_indices]
    return float(bbox[0] + np.average(x_indices, weights=weights))


def prepare_frame(
    cell: Image.Image,
    slot: str,
    row: int,
    col: int,
    cell_box: tuple[int, int, int, int],
    options: BuildOptions,
) -> PreparedFrame:
    cleaned, chroma_meta = chroma_to_alpha(
        cell,
        options.key,
        options.transparent_distance,
        options.opaque_distance,
        options.alpha_threshold,
    )
    components = [
        component
        for component in alpha_components(cleaned)
        if len(component) >= options.min_component_area
    ]
    if not components:
        raise BundleBuildError(f"slot {slot}: empty frame after chroma/component cleanup")
    components.sort(key=len, reverse=True)
    component_entries = [
        {"area": len(component), "bbox": list(component_bbox(component))}
        for component in components
    ]

    for entry in component_entries:
        bbox = tuple(entry["bbox"])
        if bbox_touches_margin(
            bbox,
            cleaned.width,
            cleaned.height,
            options.source_edge_margin,
        ):
            raise BundleBuildError(
                f"slot {slot}: source subject touches the {options.source_edge_margin}px "
                f"cell safety edge (bbox={bbox}, cell={cleaned.size})"
            )

    if len(components) > 1:
        detached_ratio = len(components[1]) / len(components[0])
    else:
        detached_ratio = 0.0
    if (
        options.component_mode == "largest"
        and detached_ratio > options.max_detached_component_ratio
    ):
        raise BundleBuildError(
            f"slot {slot}: detached component ratio {detached_ratio:.3f} exceeds "
            f"{options.max_detached_component_ratio:.3f}; regenerate or explicitly use "
            "--component-mode all for an intentional multi-part subject"
        )

    selected = components[:1] if options.component_mode == "largest" else components
    selected_image = clear_unselected_components(cleaned, selected)
    selected_bboxes = [component_bbox(component) for component in selected]
    union_bbox = (
        min(bbox[0] for bbox in selected_bboxes),
        min(bbox[1] for bbox in selected_bboxes),
        max(bbox[2] for bbox in selected_bboxes),
        max(bbox[3] for bbox in selected_bboxes),
    )
    residual_count = count_residual_magenta(
        selected_image,
        options.key,
        options.alpha_threshold,
        options.residual_magenta_distance,
    )
    if residual_count:
        raise BundleBuildError(
            f"slot {slot}: {residual_count} visible pixels remain too close to "
            f"{color_text(options.key)}; magenta fringe or keyed color is embedded in the subject"
        )

    padding = options.component_padding
    padded_bbox = (
        max(0, union_bbox[0] - padding),
        max(0, union_bbox[1] - padding),
        min(selected_image.width, union_bbox[2] + padding),
        min(selected_image.height, union_bbox[3] + padding),
    )
    cutout = selected_image.crop(padded_bbox)
    visible_in_cutout = (
        union_bbox[0] - padded_bbox[0],
        union_bbox[1] - padded_bbox[1],
        union_bbox[2] - padded_bbox[0],
        union_bbox[3] - padded_bbox[1],
    )
    anchor_x = horizontal_anchor(
        cutout,
        visible_in_cutout,
        options.anchor,
        options.foot_band_ratio,
        options.alpha_threshold,
    )
    subject_span = float(
        max(union_bbox[2] - union_bbox[0], union_bbox[3] - union_bbox[1])
    )
    return PreparedFrame(
        slot=slot,
        row=row,
        col=col,
        cell_box=cell_box,
        cutout=cutout,
        visible_bbox_in_cutout=visible_in_cutout,
        horizontal_anchor=anchor_x,
        subject_span=subject_span,
        metadata={
            "slot": slot,
            "grid": [row, col],
            "sourceCellBox": list(cell_box),
            "sourceCellSize": [cell.width, cell.height],
            "chroma": chroma_meta,
            "componentMode": options.component_mode,
            "components": component_entries,
            "detachedComponentRatio": round(detached_ratio, 6),
            "selectedBbox": list(union_bbox),
            "paddedCropBbox": list(padded_bbox),
            "paddedCropSize": list(cutout.size),
            "subjectSpan": subject_span,
            "horizontalAnchorInCrop": round(anchor_x, 4),
            "residualMagentaPixelsBeforeResize": residual_count,
        },
    )


def prepare_frames(sheet: Image.Image, options: BuildOptions) -> list[PreparedFrame]:
    if sheet.width % options.cols != 0 or sheet.height % options.rows != 0:
        raise BundleBuildError(
            f"input size {sheet.size} is not evenly divisible by "
            f"{options.rows}x{options.cols}"
        )
    cell_width = sheet.width // options.cols
    cell_height = sheet.height // options.rows
    frames: list[PreparedFrame] = []
    for index, slot in enumerate(options.slots):
        row, col = divmod(index, options.cols)
        box = (
            col * cell_width,
            row * cell_height,
            (col + 1) * cell_width,
            (row + 1) * cell_height,
        )
        try:
            prepared = prepare_frame(sheet.crop(box), slot, row, col, box, options)
        except BundleBuildError as exc:
            if str(exc).startswith(f"slot {slot}:"):
                raise
            raise BundleBuildError(f"slot {slot}: {exc}") from exc
        frames.append(prepared)

    spans = [frame.subject_span for frame in frames]
    median_span = statistics.median(spans)
    if median_span <= 0:
        raise BundleBuildError("subject dimension median is zero")
    deviations = [abs(span / median_span - 1.0) for span in spans]
    worst_index = int(np.argmax(np.asarray(deviations)))
    if deviations[worst_index] > options.max_dimension_drift:
        raise BundleBuildError(
            f"slot {frames[worst_index].slot}: generated subject span drift "
            f"{deviations[worst_index]:.3f} exceeds {options.max_dimension_drift:.3f} "
            f"(span={spans[worst_index]:.1f}, median={median_span:.1f})"
        )
    for frame, deviation in zip(frames, deviations, strict=True):
        frame.metadata["dimensionDriftFromMedian"] = round(deviation, 6)
    return frames


def normalize_canvas(
    prepared: PreparedFrame,
    common_scale: float,
    options: BuildOptions,
    effective_source_margin: int,
) -> tuple[Image.Image, dict[str, object]]:
    crop = prepared.cutout
    width = max(1, round(crop.width * common_scale))
    height = max(1, round(crop.height * common_scale))
    resized = crop.resize((width, height), Image.Resampling.LANCZOS)
    actual_scale_x = width / crop.width
    actual_scale_y = height / crop.height
    baseline_exclusive = SOURCE_FRAME_SIZE - effective_source_margin - RESAMPLE_GUARD
    # Derive the final anchor from the already resampled alpha rather than
    # multiplying the pre-resize bbox.  Lanczos can extend a hard alpha edge by
    # several pixels when the source is enlarged, so theoretical coordinates
    # would put the actual feet below the declared baseline.
    resized_visible_bbox = visible_bbox(resized, options.alpha_threshold)
    horizontal_anchor_px = horizontal_anchor(
        resized,
        resized_visible_bbox,
        options.anchor,
        options.foot_band_ratio,
        options.alpha_threshold,
    )
    x = round(SOURCE_FRAME_SIZE / 2.0 - horizontal_anchor_px)
    y = round(baseline_exclusive - resized_visible_bbox[3])
    canvas = Image.new(
        "RGBA", (SOURCE_FRAME_SIZE, SOURCE_FRAME_SIZE), (0, 0, 0, 0)
    )
    canvas.alpha_composite(resized, (x, y))
    canvas, cleaned_fringe = clean_resample_alpha(
        canvas,
        options.key,
        options.residual_magenta_distance,
        options.fringe_cleanup_alpha,
    )
    bbox = visible_bbox(canvas, options.alpha_threshold)
    if bbox_touches_margin(
        bbox,
        SOURCE_FRAME_SIZE,
        SOURCE_FRAME_SIZE,
        effective_source_margin,
    ):
        raise BundleBuildError(
            f"slot {prepared.slot}: normalized source frame violates "
            f"{effective_source_margin}px effective safety edge (bbox={bbox}); "
            "reduce --fit-scale or use --anchor bottom-center"
        )
    residual = count_residual_magenta(
        canvas,
        options.key,
        options.alpha_threshold,
        options.residual_magenta_distance,
    )
    if residual:
        raise BundleBuildError(
            f"slot {prepared.slot}: source normalization produced {residual} residual magenta pixels"
        )
    return canvas, {
        "sourceOutputSize": [width, height],
        "sourcePastePosition": [x, y],
        "resizedVisibleBbox": list(resized_visible_bbox),
        "sourceVisibleBbox": list(bbox),
        "sourceBaselineExclusive": baseline_exclusive,
        "actualScale": [round(actual_scale_x, 8), round(actual_scale_y, 8)],
        "sourceLowAlphaMagentaPixelsCleared": cleaned_fringe,
        "residualMagentaPixelsSource": residual,
    }


def clean_resample_alpha(
    image: Image.Image,
    key: tuple[int, int, int],
    residual_distance: float,
    fringe_cleanup_alpha: int,
    alpha_threshold: int = 2,
) -> tuple[Image.Image, int]:
    rgba = np.asarray(image.convert("RGBA"), dtype=np.uint8).copy()
    rgb = rgba[:, :, :3].astype(np.float32)
    distance = np.sqrt(
        np.sum(np.square(rgb - np.asarray(key, dtype=np.float32)), axis=2)
    )
    fringe = (
        (rgba[:, :, 3] > 0)
        & (rgba[:, :, 3] <= fringe_cleanup_alpha)
        & (distance <= residual_distance)
    )
    cleaned_fringe = int(np.count_nonzero(fringe))
    rgba[fringe] = 0
    rgba[rgba[:, :, 3] < alpha_threshold] = 0
    rgba[rgba[:, :, 3] == 0, :3] = 0
    return Image.fromarray(rgba, mode="RGBA"), cleaned_fringe


def render_frames(
    prepared_frames: Sequence[PreparedFrame], options: BuildOptions
) -> tuple[list[RenderedFrame], float, int]:
    runtime_ratio = SOURCE_FRAME_SIZE / RUNTIME_FRAME_SIZE
    effective_source_margin = max(
        options.safe_margin,
        math.ceil(options.safe_margin * runtime_ratio),
    )
    center_x = SOURCE_FRAME_SIZE / 2.0
    half_width_available = center_x - effective_source_margin - RESAMPLE_GUARD
    baseline_exclusive = SOURCE_FRAME_SIZE - effective_source_margin - RESAMPLE_GUARD
    scale_limits: list[float] = []
    for frame in prepared_frames:
        left_extent = frame.horizontal_anchor
        right_extent = frame.cutout.width - frame.horizontal_anchor
        visible_bbox_in_crop = frame.visible_bbox_in_cutout
        visible_height = visible_bbox_in_crop[3] - visible_bbox_in_crop[1]
        if left_extent > 0:
            scale_limits.append(half_width_available / left_extent)
        if right_extent > 0:
            scale_limits.append(half_width_available / right_extent)
        if visible_height > 0:
            scale_limits.append(
                (baseline_exclusive - effective_source_margin) / visible_height
            )
    if not scale_limits:
        raise BundleBuildError("cannot compute a shared scale for empty frame extents")
    # Include the declared fit factor only once, after accounting for an
    # asymmetric feet anchor.  This prevents a lunging tail/head pose from
    # clipping merely because its foot center is not its bbox center.
    common_scale = min(scale_limits) * options.fit_scale
    if not options.allow_upscale:
        common_scale = min(1.0, common_scale)
    if common_scale <= 0:
        raise BundleBuildError("computed shared scale is not positive")

    rendered: list[RenderedFrame] = []
    for prepared in prepared_frames:
        source, render_meta = normalize_canvas(
            prepared,
            common_scale,
            options,
            effective_source_margin,
        )
        runtime = source.resize(
            (RUNTIME_FRAME_SIZE, RUNTIME_FRAME_SIZE), Image.Resampling.LANCZOS
        )
        runtime, runtime_cleaned_fringe = clean_resample_alpha(
            runtime,
            options.key,
            options.residual_magenta_distance,
            options.fringe_cleanup_alpha,
        )
        runtime_bbox = visible_bbox(runtime, options.alpha_threshold)
        if bbox_touches_margin(
            runtime_bbox,
            RUNTIME_FRAME_SIZE,
            RUNTIME_FRAME_SIZE,
            options.safe_margin,
        ):
            raise BundleBuildError(
                f"slot {prepared.slot}: runtime frame violates {options.safe_margin}px "
                f"safe edge after 512->256 resampling (bbox={runtime_bbox})"
            )
        runtime_residual = count_residual_magenta(
            runtime,
            options.key,
            options.alpha_threshold,
            options.residual_magenta_distance,
        )
        if runtime_residual:
            raise BundleBuildError(
                f"slot {prepared.slot}: runtime frame contains {runtime_residual} residual magenta pixels"
            )
        rendered.append(
            RenderedFrame(
                prepared=prepared,
                source=source,
                runtime=runtime,
                metadata={
                    **prepared.metadata,
                    **render_meta,
                    "runtimeVisibleBbox": list(runtime_bbox),
                    "runtimeLowAlphaMagentaPixelsCleared": runtime_cleaned_fringe,
                    "residualMagentaPixelsRuntime": runtime_residual,
                    "sourceRgbaSha256": rgba_hash(source),
                    "runtimeRgbaSha256": rgba_hash(runtime),
                },
            )
        )
    return rendered, common_scale, effective_source_margin


def compose_sheet(
    frames: Sequence[Image.Image], rows: int, cols: int, cell_size: int
) -> Image.Image:
    sheet = Image.new("RGBA", (cols * cell_size, rows * cell_size), (0, 0, 0, 0))
    for index, frame in enumerate(frames):
        row, col = divmod(index, cols)
        sheet.alpha_composite(frame, (col * cell_size, row * cell_size))
    return sheet


def make_transparent_gif(
    frames: Sequence[Image.Image], output: Path, duration_ms: int
) -> None:
    if not frames:
        raise BundleBuildError("cannot build GIF without frames")
    paletted_frames: list[Image.Image] = []
    transparent_index = 255
    for frame in frames:
        rgba = frame.convert("RGBA")
        background = Image.new("RGB", rgba.size, (0, 0, 0))
        background.paste(rgba.convert("RGB"), mask=rgba.getchannel("A"))
        paletted = background.convert(
            "P", palette=Image.Palette.ADAPTIVE, colors=255, dither=Image.Dither.NONE
        )
        alpha = np.asarray(rgba.getchannel("A"), dtype=np.uint8)
        indices = np.asarray(paletted, dtype=np.uint8).copy()
        indices[alpha < 128] = transparent_index
        rebuilt = Image.fromarray(indices, mode="P")
        palette = list(paletted.getpalette() or [])
        palette.extend([0] * (768 - len(palette)))
        palette[transparent_index * 3 : transparent_index * 3 + 3] = [255, 0, 255]
        rebuilt.putpalette(palette)
        rebuilt.info["transparency"] = transparent_index
        rebuilt.info["disposal"] = 2
        paletted_frames.append(rebuilt)
    paletted_frames[0].save(
        output,
        save_all=True,
        append_images=paletted_frames[1:],
        duration=duration_ms,
        loop=0,
        transparency=transparent_index,
        disposal=2,
        optimize=False,
    )


def checkerboard(size: tuple[int, int], tile: int = 16) -> Image.Image:
    board = Image.new("RGBA", size, (43, 53, 55, 255))
    draw = ImageDraw.Draw(board)
    light = (57, 70, 72, 255)
    for y in range(0, size[1], tile):
        for x in range(0, size[0], tile):
            if (x // tile + y // tile) % 2:
                draw.rectangle((x, y, min(x + tile - 1, size[0] - 1), min(y + tile - 1, size[1] - 1)), fill=light)
    return board


def make_contact_sheet(
    rendered: Sequence[RenderedFrame], columns: int
) -> Image.Image:
    columns = min(columns, len(rendered))
    rows = math.ceil(len(rendered) / columns)
    label_height = 24
    gutter = 8
    cell_width = RUNTIME_FRAME_SIZE + gutter * 2
    cell_height = RUNTIME_FRAME_SIZE + label_height + gutter * 2
    output = Image.new(
        "RGBA", (columns * cell_width, rows * cell_height), (22, 31, 33, 255)
    )
    draw = ImageDraw.Draw(output)
    try:
        font = ImageFont.load_default(size=14)
    except TypeError:
        font = ImageFont.load_default()
    for index, frame in enumerate(rendered):
        row, col = divmod(index, columns)
        x = col * cell_width + gutter
        y = row * cell_height + gutter
        board = checkerboard((RUNTIME_FRAME_SIZE, RUNTIME_FRAME_SIZE))
        board.alpha_composite(frame.runtime)
        output.alpha_composite(board, (x, y + label_height))
        draw.text((x, y), frame.prepared.slot, fill=(238, 226, 190, 255), font=font)
    return output


def write_bundle(
    rendered: Sequence[RenderedFrame],
    common_scale: float,
    effective_source_margin: int,
    input_sheet: Image.Image,
    options: BuildOptions,
) -> dict[str, object]:
    output_parent = options.output_dir.parent
    output_parent.mkdir(parents=True, exist_ok=True)
    staging = Path(
        tempfile.mkdtemp(prefix=f".{options.output_dir.name}.staging-", dir=output_parent)
    )
    try:
        source_dir = staging / "source-frames"
        runtime_dir = staging / "runtime-frames"
        source_dir.mkdir()
        runtime_dir.mkdir()
        for frame in rendered:
            frame.source.save(source_dir / f"{frame.prepared.slot}.png", format="PNG", optimize=True)
            frame.runtime.save(runtime_dir / f"{frame.prepared.slot}.png", format="PNG", optimize=True)

        source_sheet = compose_sheet(
            [frame.source for frame in rendered],
            options.rows,
            options.cols,
            SOURCE_FRAME_SIZE,
        )
        runtime_sheet = compose_sheet(
            [frame.runtime for frame in rendered],
            options.rows,
            options.cols,
            RUNTIME_FRAME_SIZE,
        )
        source_sheet.save(staging / "sheet-transparent.png", format="PNG", optimize=True)
        runtime_sheet.save(
            staging / "sheet-runtime-transparent.png", format="PNG", optimize=True
        )
        optional_outputs: dict[str, str] = {}
        if options.make_gif:
            make_transparent_gif(
                [frame.runtime for frame in rendered],
                staging / "animation.gif",
                options.duration_ms,
            )
            optional_outputs["gif"] = "animation.gif"
        if options.make_contact_sheet:
            contact = make_contact_sheet(rendered, options.contact_columns)
            contact.save(staging / "contact-sheet.png", format="PNG", optimize=True)
            optional_outputs["contactSheet"] = "contact-sheet.png"

        metadata: dict[str, object] = {
            "schemaVersion": SCHEMA_VERSION,
            "tool": TOOL_NAME,
            "input": str(options.input_path),
            "inputSha256": sha256_file(options.input_path),
            "inputSize": list(input_sheet.size),
            "rows": options.rows,
            "cols": options.cols,
            "inputCellSize": [
                input_sheet.width // options.cols,
                input_sheet.height // options.rows,
            ],
            "slots": list(options.slots),
            "key": color_text(options.key),
            "transparentDistance": options.transparent_distance,
            "opaqueDistance": options.opaque_distance,
            "alphaThreshold": options.alpha_threshold,
            "componentMode": options.component_mode,
            "minComponentArea": options.min_component_area,
            "maxDetachedComponentRatio": options.max_detached_component_ratio,
            "componentPadding": options.component_padding,
            "fitScale": options.fit_scale,
            "sharedScale": round(common_scale, 10),
            "allowUpscale": options.allow_upscale,
            "anchor": options.anchor,
            "footBandRatio": options.foot_band_ratio,
            "sourceFrameSize": SOURCE_FRAME_SIZE,
            "runtimeFrameSize": RUNTIME_FRAME_SIZE,
            "safeMargin": options.safe_margin,
            "effectiveSourceMargin": effective_source_margin,
            "sourceResampleGuard": RESAMPLE_GUARD,
            "sourceEdgeMargin": options.source_edge_margin,
            "maxDimensionDrift": options.max_dimension_drift,
            "residualMagentaDistance": options.residual_magenta_distance,
            "fringeCleanupAlpha": options.fringe_cleanup_alpha,
            "outputs": {
                "sourceFrames": "source-frames",
                "runtimeFrames": "runtime-frames",
                "transparentSheet": "sheet-transparent.png",
                "runtimeTransparentSheet": "sheet-runtime-transparent.png",
                **optional_outputs,
            },
            "frames": [frame.metadata for frame in rendered],
        }
        (staging / "pipeline-meta.json").write_text(
            json.dumps(metadata, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

        previous: Path | None = None
        if options.output_dir.exists():
            previous = staging.with_name(staging.name + ".previous")
            os.replace(options.output_dir, previous)
        try:
            os.replace(staging, options.output_dir)
        except Exception:
            if previous is not None and previous.exists() and not options.output_dir.exists():
                os.replace(previous, options.output_dir)
            raise
        if previous is not None:
            shutil.rmtree(previous, ignore_errors=True)
        return metadata
    except Exception:
        shutil.rmtree(staging, ignore_errors=True)
        raise


def build_bundle(options: BuildOptions) -> dict[str, object]:
    validate_options(options)
    try:
        with Image.open(options.input_path) as source:
            input_sheet = source.convert("RGBA")
    except (OSError, ValueError) as exc:
        raise BundleBuildError(f"cannot read input image: {options.input_path}: {exc}") from exc
    prepared = prepare_frames(input_sheet, options)
    rendered, common_scale, effective_source_margin = render_frames(prepared, options)
    return write_bundle(
        rendered,
        common_scale,
        effective_source_margin,
        input_sheet,
        options,
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("--input", required=True, type=Path, help="Raw chroma-key PNG sheet.")
    parser.add_argument("--output-dir", required=True, type=Path, help="Atomic bundle output directory.")
    parser.add_argument("--rows", required=True, type=int, help="Input sheet row count.")
    parser.add_argument("--cols", required=True, type=int, help="Input sheet column count.")
    parser.add_argument(
        "--slots",
        required=True,
        nargs="+",
        help="Explicit row-major frame names; count must equal rows*cols.",
    )
    parser.add_argument("--key", type=parse_hex_color, default=DEFAULT_KEY)
    parser.add_argument("--transparent-distance", type=float, default=40.0)
    parser.add_argument("--opaque-distance", type=float, default=150.0)
    parser.add_argument("--alpha-threshold", type=int, default=8)
    parser.add_argument("--component-mode", choices=["largest", "all"], default="largest")
    parser.add_argument("--min-component-area", type=int, default=64)
    parser.add_argument("--max-detached-component-ratio", type=float, default=0.12)
    parser.add_argument("--component-padding", type=int, default=2)
    parser.add_argument("--fit-scale", type=float, default=0.82)
    parser.add_argument("--anchor", choices=["bottom-center", "feet"], default="feet")
    parser.add_argument("--foot-band-ratio", type=float, default=0.12)
    parser.add_argument("--safe-margin", type=int, default=4)
    parser.add_argument("--source-edge-margin", type=int, default=4)
    parser.add_argument("--max-dimension-drift", type=float, default=0.35)
    parser.add_argument("--residual-magenta-distance", type=float, default=70.0)
    parser.add_argument("--fringe-cleanup-alpha", type=int, default=96)
    parser.add_argument("--no-upscale", action="store_true", help="Cap the common scale at 1.0.")
    parser.add_argument("--gif", action="store_true", help="Also write animation.gif from runtime frames.")
    parser.add_argument("--contact-sheet", action="store_true", help="Also write a labeled QA contact sheet.")
    parser.add_argument("--duration-ms", type=int, default=100, help="GIF frame duration.")
    parser.add_argument("--contact-columns", type=int, default=4)
    parser.add_argument(
        "--force",
        action="store_true",
        help="Replace only an existing bundle previously owned by this builder.",
    )
    return parser


def options_from_args(args: argparse.Namespace) -> BuildOptions:
    return BuildOptions(
        input_path=args.input,
        output_dir=args.output_dir,
        rows=args.rows,
        cols=args.cols,
        slots=tuple(args.slots),
        key=args.key,
        transparent_distance=args.transparent_distance,
        opaque_distance=args.opaque_distance,
        alpha_threshold=args.alpha_threshold,
        component_mode=args.component_mode,
        min_component_area=args.min_component_area,
        max_detached_component_ratio=args.max_detached_component_ratio,
        component_padding=args.component_padding,
        fit_scale=args.fit_scale,
        anchor=args.anchor,
        foot_band_ratio=args.foot_band_ratio,
        safe_margin=args.safe_margin,
        source_edge_margin=args.source_edge_margin,
        max_dimension_drift=args.max_dimension_drift,
        residual_magenta_distance=args.residual_magenta_distance,
        fringe_cleanup_alpha=args.fringe_cleanup_alpha,
        allow_upscale=not args.no_upscale,
        make_gif=args.gif,
        make_contact_sheet=args.contact_sheet,
        duration_ms=args.duration_ms,
        contact_columns=args.contact_columns,
        force=args.force,
    )


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        metadata = build_bundle(options_from_args(args))
    except BundleBuildError as exc:
        parser.exit(2, f"error: {exc}\n")
    print(
        f"built={args.output_dir} frames={len(metadata['frames'])} "
        f"shared_scale={metadata['sharedScale']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
