#!/usr/bin/env python3
"""Shape-preserving chroma spill cleanup for already-transparent sprites.

Image generators and first-pass chroma helpers can leave magenta RGB in the
soft alpha fringe even after the background becomes transparent.  This module
changes only RGB on edge pixels whose hue disagrees with nearby opaque subject
pixels; alpha is never eroded, so fur tips and thin limbs keep their silhouette.
"""

from __future__ import annotations

from typing import Any

import numpy as np
from PIL import Image


EDGE_RADIUS = 2
REFERENCE_RADIUS = 4
MAGENTA_MIN_CHANNEL = 35.0
MAGENTA_DOMINANCE_MIN = 18.0
LOCAL_DOMINANCE_GAP = 12.0
REFERENCE_ALPHA_MIN = 64


def _aligned_slices(
    height: int,
    width: int,
    dy: int,
    dx: int,
) -> tuple[tuple[slice, slice], tuple[slice, slice]]:
    target = (
        slice(max(0, -dy), min(height, height - dy)),
        slice(max(0, -dx), min(width, width - dx)),
    )
    source = (
        slice(max(0, dy), min(height, height + dy)),
        slice(max(0, dx), min(width, width + dx)),
    )
    return target, source


def transparent_edge_mask(alpha: np.ndarray, alpha_threshold: int, radius: int = EDGE_RADIUS) -> np.ndarray:
    """Return visible pixels within ``radius`` pixels of transparent space."""

    visible = alpha >= alpha_threshold
    transparent = ~visible
    near_transparent = np.zeros_like(visible)
    height, width = visible.shape
    for dy in range(-radius, radius + 1):
        for dx in range(-radius, radius + 1):
            if dx == 0 and dy == 0:
                continue
            target, source = _aligned_slices(height, width, dy, dx)
            near_transparent[target] |= transparent[source]
    return visible & near_transparent


def _magenta_dominance(rgb: np.ndarray) -> np.ndarray:
    values = rgb.astype(np.float32)
    return np.minimum(values[:, :, 0], values[:, :, 2]) - values[:, :, 1]


def _nearest_clean_edge_reference(
    rgba: np.ndarray,
    edge: np.ndarray,
    alpha_threshold: int,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    rgb = rgba[:, :, :3]
    alpha = rgba[:, :, 3]
    dominance = _magenta_dominance(rgb)
    strong = (
        edge
        & (rgb[:, :, 0] >= MAGENTA_MIN_CHANNEL)
        & (rgb[:, :, 2] >= MAGENTA_MIN_CHANNEL)
        & (dominance >= MAGENTA_DOMINANCE_MIN)
    )
    visible = alpha >= alpha_threshold
    clean = visible & ~strong & (alpha >= max(alpha_threshold, REFERENCE_ALPHA_MIN))
    references = np.zeros_like(rgb)
    assigned = np.zeros_like(strong)
    unresolved = strong.copy()
    height, width = strong.shape
    offsets = sorted(
        (
            (dy * dy + dx * dx, dy, dx)
            for dy in range(-REFERENCE_RADIUS, REFERENCE_RADIUS + 1)
            for dx in range(-REFERENCE_RADIUS, REFERENCE_RADIUS + 1)
            if dx != 0 or dy != 0
        ),
        key=lambda item: (item[0], abs(item[1]) + abs(item[2]), item[1], item[2]),
    )
    for _, dy, dx in offsets:
        if not np.any(unresolved):
            break
        target, source = _aligned_slices(height, width, dy, dx)
        matches = unresolved[target] & clean[source]
        if not np.any(matches):
            continue
        target_reference = references[target]
        source_rgb = rgb[source]
        target_reference[matches] = source_rgb[matches]
        target_assigned = assigned[target]
        target_assigned[matches] = True
        target_unresolved = unresolved[target]
        target_unresolved[matches] = False

    reference_dominance = _magenta_dominance(references)
    contamination = strong & assigned & (
        dominance - reference_dominance >= LOCAL_DOMINANCE_GAP
    )
    return contamination, references, dominance


def magenta_edge_metrics(image: Image.Image, alpha_threshold: int = 24) -> dict[str, Any]:
    rgba = np.asarray(image.convert("RGBA"), dtype=np.uint8)
    edge = transparent_edge_mask(rgba[:, :, 3], alpha_threshold)
    contamination, _, _ = _nearest_clean_edge_reference(rgba, edge, alpha_threshold)
    edge_count = int(np.count_nonzero(edge))
    contamination_count = int(np.count_nonzero(contamination))
    return {
        "edgePixelCount": edge_count,
        "strongMagentaEdgePixels": contamination_count,
        "strongMagentaEdgeRatio": round(
            contamination_count / edge_count if edge_count else 0.0,
            6,
        ),
    }

def despill_transparent_alpha(
    image: Image.Image,
    alpha_threshold: int = 8,
) -> tuple[Image.Image, dict[str, Any]]:
    """Replace polluted edge RGB while preserving every alpha value exactly."""

    rgba = np.asarray(image.convert("RGBA"), dtype=np.uint8).copy()
    original_alpha = rgba[:, :, 3].copy()
    edge = transparent_edge_mask(original_alpha, alpha_threshold)
    contamination, references, _ = _nearest_clean_edge_reference(
        rgba,
        edge,
        alpha_threshold,
    )
    before_count = int(np.count_nonzero(contamination))
    if before_count:
        current = rgba[:, :, :3].astype(np.float32)
        reference = references.astype(np.float32)
        current_luma = (
            current[:, :, 0] * 0.2126
            + current[:, :, 1] * 0.7152
            + current[:, :, 2] * 0.0722
        )
        reference_luma = np.maximum(
            reference[:, :, 0] * 0.2126
            + reference[:, :, 1] * 0.7152
            + reference[:, :, 2] * 0.0722,
            1.0,
        )
        # Keep a naturally dark contour dark, while borrowing the hue from the
        # nearest clean subject pixel.  Partial alpha continues to carry the
        # antialiasing weight; no silhouette pixels are deleted.
        scale = np.clip(current_luma / reference_luma, 0.42, 1.05)
        replacement = np.clip(reference * scale[:, :, None], 0.0, 255.0)
        rgba[:, :, :3][contamination] = np.rint(replacement[contamination]).astype(np.uint8)
    rgba[original_alpha == 0, :3] = 0
    rgba[:, :, 3] = original_alpha
    result = Image.fromarray(rgba, mode="RGBA")
    after = magenta_edge_metrics(result, alpha_threshold=max(alpha_threshold, 24))
    return result, {
        "edgePixelCount": int(np.count_nonzero(edge)),
        "strongMagentaEdgePixelsBefore": before_count,
        "strongMagentaEdgePixelsAfter": after["strongMagentaEdgePixels"],
        "strongMagentaEdgeRatioAfter": after["strongMagentaEdgeRatio"],
        "despilledPixels": before_count,
        "alphaPixelsChanged": int(np.count_nonzero(rgba[:, :, 3] != original_alpha)),
    }
