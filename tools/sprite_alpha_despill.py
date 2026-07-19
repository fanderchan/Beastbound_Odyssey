#!/usr/bin/env python3
"""Shape-preserving chroma spill cleanup for already-transparent sprites.

Image generators and first-pass chroma helpers can leave magenta RGB in the
soft alpha fringe even after the background becomes transparent.  This module
changes only RGB on edge pixels whose hue disagrees with nearby opaque subject
pixels; alpha is never eroded, so fur tips and thin limbs keep their silhouette.
"""

from __future__ import annotations

from collections import deque
from typing import Any

import numpy as np
from PIL import Image


EDGE_RADIUS = 2
REFERENCE_RADIUS = 4
MAGENTA_MIN_CHANNEL = 35.0
MAGENTA_DOMINANCE_MIN = 18.0
LOCAL_DOMINANCE_GAP = 12.0
REFERENCE_ALPHA_MIN = 64
GREEN_EDGE_ALPHA_MAX = 127
GREEN_MIN_CHANNEL = 35.0
GREEN_DOMINANCE_MIN = 18.0
GREEN_LOCAL_DOMINANCE_GAP = 12.0
GREEN_REFERENCE_RADIUS = 12


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


def _green_dominance(rgb: np.ndarray) -> np.ndarray:
    values = rgb.astype(np.float32)
    return values[:, :, 1] - np.maximum(values[:, :, 0], values[:, :, 2])


def _component_labels_for_targets(
    visible: np.ndarray,
    targets: np.ndarray,
) -> np.ndarray:
    """Label only visible components that contain at least one target."""

    height, width = visible.shape
    labels = np.zeros((height, width), dtype=np.int32)
    label = 0
    target_y, target_x = np.nonzero(targets)
    for y, x in zip(target_y.tolist(), target_x.tolist()):
        if labels[y, x] != 0:
            continue
        label += 1
        labels[y, x] = label
        queue: deque[tuple[int, int]] = deque([(x, y)])
        while queue:
            current_x, current_y = queue.popleft()
            for next_x, next_y in (
                (current_x - 1, current_y),
                (current_x + 1, current_y),
                (current_x, current_y - 1),
                (current_x, current_y + 1),
            ):
                if not (0 <= next_x < width and 0 <= next_y < height):
                    continue
                if not visible[next_y, next_x] or labels[next_y, next_x] != 0:
                    continue
                labels[next_y, next_x] = label
                queue.append((next_x, next_y))
    return labels


def _connected_inward_references(
    rgb: np.ndarray,
    visible: np.ndarray,
    targets: np.ndarray,
    reliable_reference: np.ndarray,
    alpha: np.ndarray,
    radius: int,
) -> tuple[np.ndarray, np.ndarray]:
    """Choose a spatially nearest reference in the same visible component."""

    labels = _component_labels_for_targets(visible, targets)
    references = np.zeros((*targets.shape, 3), dtype=np.uint8)
    assigned = np.zeros_like(targets)
    height, width = targets.shape
    radius_squared = radius * radius
    target_y, target_x = np.nonzero(targets)
    for y, x in zip(target_y.tolist(), target_x.tolist()):
        component_label = labels[y, x]
        if component_label == 0:
            continue
        top = max(0, y - radius)
        bottom = min(height, y + radius + 1)
        left = max(0, x - radius)
        right = min(width, x + radius + 1)
        patch_y, patch_x = np.indices((bottom - top, right - left))
        dy = patch_y + top - y
        dx = patch_x + left - x
        distance_squared = dy * dy + dx * dx
        candidates = (
            reliable_reference[top:bottom, left:right]
            & (labels[top:bottom, left:right] == component_label)
            & (distance_squared > 0)
            & (distance_squared <= radius_squared)
        )
        candidate_y, candidate_x = np.nonzero(candidates)
        if len(candidate_x) == 0:
            continue
        candidate_dy = candidate_y + top - y
        candidate_dx = candidate_x + left - x
        candidate_distance = candidate_dy * candidate_dy + candidate_dx * candidate_dx
        candidate_alpha = alpha[top:bottom, left:right][candidates].astype(np.int16)
        # Match the previous dense search ordering exactly: distance first,
        # then higher alpha, then Manhattan distance, dy, and dx.
        order = np.lexsort(
            (
                candidate_dx,
                candidate_dy,
                np.abs(candidate_dy) + np.abs(candidate_dx),
                -candidate_alpha,
                candidate_distance,
            )
        )
        selected = int(order[0])
        reference_y = int(candidate_y[selected] + top)
        reference_x = int(candidate_x[selected] + left)
        references[y, x] = rgb[reference_y, reference_x]
        assigned[y, x] = True
    return references, assigned


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
    green_dominance = _green_dominance(rgb)
    clean = (
        visible
        & ~strong
        & (green_dominance < GREEN_DOMINANCE_MIN)
        & (alpha >= max(alpha_threshold, REFERENCE_ALPHA_MIN))
    )
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
        target_reference[matches] = rgb[source][matches]
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


def despill_chroma_partial_anomalies(
    image: Image.Image,
    partial_candidate: np.ndarray,
    inverse_valid: np.ndarray,
    alpha_threshold: int = 8,
) -> tuple[Image.Image, dict[str, Any]]:
    """Repair only mathematically suspect low-alpha chroma fringe RGB.

    ``partial_candidate`` identifies pixels whose alpha came from the chroma
    matte. ``inverse_valid`` records whether the ordinary straight-alpha color
    inverse stayed in gamut.  Out-of-gamut pixels are always suspect; a valid
    inverse is suspect only when it becomes locally fluorescent green.

    RGB may borrow from an inward pixel only when that pixel is reachable
    through the same visible component and has alpha >= 64.  Alpha is copied
    back byte-for-byte at the end.  This keeps detached VFX and naturally green
    body regions from donating color to unrelated edges.
    """

    rgba = np.asarray(image.convert("RGBA"), dtype=np.uint8).copy()
    if partial_candidate.shape != rgba.shape[:2] or inverse_valid.shape != rgba.shape[:2]:
        raise ValueError("chroma anomaly masks must match the image dimensions")

    original_alpha = rgba[:, :, 3].copy()
    rgb = rgba[:, :, :3]
    alpha = original_alpha
    visible = alpha >= alpha_threshold
    green_dominance = _green_dominance(rgb)
    magenta_dominance = _magenta_dominance(rgb)
    low_alpha_partial = (
        partial_candidate
        & visible
        & (alpha <= GREEN_EDGE_ALPHA_MAX)
    )
    # The first edge pass may already have replaced an out-of-gamut magenta
    # fringe with a trustworthy body hue.  Revisit only invalid pixels that
    # still look chroma-polluted; this keeps the local search bounded even on
    # effect-heavy sheets with thousands of low-alpha particles.
    invalid_inverse = (
        low_alpha_partial
        & ~inverse_valid
        & (magenta_dominance >= MAGENTA_DOMINANCE_MIN)
    )
    green_inverse = (
        low_alpha_partial
        & (rgb[:, :, 1] >= GREEN_MIN_CHANNEL)
        & (green_dominance >= GREEN_DOMINANCE_MIN)
    )
    anomalous = invalid_inverse | green_inverse

    # References may be opaque or mathematically valid partial pixels, but may
    # not themselves be suspicious green/magenta fringe.
    reliable_reference = (
        visible
        & (alpha >= REFERENCE_ALPHA_MIN)
        & (~partial_candidate | inverse_valid)
        & ~(partial_candidate & (green_dominance >= GREEN_DOMINANCE_MIN))
        & ~(partial_candidate & (magenta_dominance >= MAGENTA_DOMINANCE_MIN))
    )

    references, assigned = _connected_inward_references(
        rgb,
        visible,
        anomalous,
        reliable_reference,
        alpha,
        GREEN_REFERENCE_RADIUS,
    )
    reference_green_dominance = _green_dominance(references)
    local_green_gap = green_dominance - reference_green_dominance
    repaired_invalid = invalid_inverse & assigned
    repaired_green = (
        green_inverse
        & assigned
        & (local_green_gap >= GREEN_LOCAL_DOMINANCE_GAP)
    )
    preserved_natural_green = (
        green_inverse
        & assigned
        & (local_green_gap < GREEN_LOCAL_DOMINANCE_GAP)
    )
    repaired = repaired_invalid | repaired_green
    unresolved_invalid = invalid_inverse & ~assigned
    unresolved_green = green_inverse & ~assigned
    rgba[:, :, :3][repaired] = references[repaired]

    rgba[original_alpha == 0, :3] = 0
    rgba[:, :, 3] = original_alpha
    repaired_image = Image.fromarray(rgba, mode="RGBA")
    repaired_rgb = rgba[:, :, :3]
    repaired_green_dominance = _green_dominance(repaired_rgb)
    strong_green_after = (
        partial_candidate
        & visible
        & (alpha <= GREEN_EDGE_ALPHA_MAX)
        & (repaired_rgb[:, :, 1] >= GREEN_MIN_CHANNEL)
        & (repaired_green_dominance >= GREEN_DOMINANCE_MIN)
    )
    return repaired_image, {
        "invalidInversePixelsBefore": int(np.count_nonzero(invalid_inverse)),
        "strongGreenPixelsBefore": int(np.count_nonzero(green_inverse)),
        "repairedPixels": int(np.count_nonzero(repaired)),
        "unresolvedInvalidInversePixels": int(np.count_nonzero(unresolved_invalid)),
        "unresolvedStrongGreenPixels": int(np.count_nonzero(unresolved_green)),
        "preservedNaturalGreenPixels": int(np.count_nonzero(preserved_natural_green)),
        "strongGreenPixelsAfter": int(np.count_nonzero(strong_green_after)),
        "referenceRadius": GREEN_REFERENCE_RADIUS,
        "referenceAlphaMinimum": REFERENCE_ALPHA_MIN,
        "alphaPixelsChanged": int(np.count_nonzero(rgba[:, :, 3] != original_alpha)),
    }


def despill_resampled_green_edges(
    image: Image.Image,
    alpha_threshold: int = 2,
) -> tuple[Image.Image, dict[str, Any]]:
    """Apply the same local-contrast rule to low-alpha resize fringe."""

    rgba = np.asarray(image.convert("RGBA"), dtype=np.uint8)
    alpha = rgba[:, :, 3]
    resampled_fringe = (
        (alpha >= alpha_threshold)
        & (alpha <= GREEN_EDGE_ALPHA_MAX)
    )
    inverse_valid = np.ones(alpha.shape, dtype=np.bool_)
    return despill_chroma_partial_anomalies(
        image,
        resampled_fringe,
        inverse_valid,
        alpha_threshold,
    )


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
