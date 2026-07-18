#!/usr/bin/env python3
"""Repack chroma-key sprite subjects into an exact, safely padded grid.

Image generators often draw the right number of subjects but center the whole
row rather than each logical cell. A fixed-grid split can then cut a tail or an
ear even though the full sheet looks fine. This tool detects each disconnected
foreground subject on the full sheet, preserves its pixels, and deterministically
places the subjects into equal cells with one shared scale and bottom anchor.
"""

from __future__ import annotations

import argparse
import json
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image


def parse_hex_color(value: str) -> tuple[int, int, int]:
    text = value.strip().lstrip("#")
    if len(text) != 6:
        raise argparse.ArgumentTypeError("key color must be RRGGBB")
    try:
        return tuple(int(text[index : index + 2], 16) for index in (0, 2, 4))
    except ValueError as exc:
        raise argparse.ArgumentTypeError("key color must be hexadecimal") from exc


def chroma_to_alpha(
    image: Image.Image,
    key: tuple[int, int, int],
    transparent_distance: float,
    opaque_distance: float,
) -> Image.Image:
    rgba = np.asarray(image.convert("RGBA"), dtype=np.uint8).copy()
    rgb = rgba[:, :, :3].astype(np.float32)
    key_rgb = np.asarray(key, dtype=np.float32)
    distance = np.sqrt(np.sum(np.square(rgb - key_rgb), axis=2))
    span = max(1.0, opaque_distance - transparent_distance)
    matte = np.clip((distance - transparent_distance) / span, 0.0, 1.0)
    rgba[:, :, 3] = np.minimum(rgba[:, :, 3], np.rint(matte * 255.0).astype(np.uint8))
    return Image.fromarray(rgba, mode="RGBA")


def connected_components(mask: np.ndarray, min_area: int) -> list[dict[str, object]]:
    height, width = mask.shape
    visited = np.zeros((height, width), dtype=np.bool_)
    components: list[dict[str, object]] = []

    for y in range(height):
        for x in range(width):
            if not mask[y, x] or visited[y, x]:
                continue
            queue: deque[tuple[int, int]] = deque([(x, y)])
            visited[y, x] = True
            area = 0
            min_x = max_x = x
            min_y = max_y = y
            while queue:
                cx, cy = queue.popleft()
                area += 1
                min_x = min(min_x, cx)
                max_x = max(max_x, cx)
                min_y = min(min_y, cy)
                max_y = max(max_y, cy)
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if 0 <= nx < width and 0 <= ny < height and mask[ny, nx] and not visited[ny, nx]:
                        visited[ny, nx] = True
                        queue.append((nx, ny))
            if area >= min_area:
                components.append(
                    {
                        "area": area,
                        "bbox": (min_x, min_y, max_x + 1, max_y + 1),
                        "center": ((min_x + max_x + 1) / 2.0, (min_y + max_y + 1) / 2.0),
                    }
                )
    return components


def frame_order(components: list[dict[str, object]], rows: int, cols: int) -> list[dict[str, object]]:
    ordered_by_y = sorted(components, key=lambda item: (item["center"][1], item["center"][0]))
    ordered: list[dict[str, object]] = []
    for row in range(rows):
        row_items = ordered_by_y[row * cols : (row + 1) * cols]
        ordered.extend(sorted(row_items, key=lambda item: item["center"][0]))
    return ordered


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--rows", required=True, type=int)
    parser.add_argument("--cols", required=True, type=int)
    parser.add_argument("--key", default="#FF00FF", type=parse_hex_color)
    parser.add_argument("--transparent-distance", default=28.0, type=float)
    parser.add_argument("--opaque-distance", default=145.0, type=float)
    parser.add_argument("--mask-alpha", default=24, type=int)
    parser.add_argument("--min-component-area", default=4000, type=int)
    parser.add_argument("--fit-scale", default=0.78, type=float)
    parser.add_argument("--bottom-padding-ratio", default=0.08, type=float)
    parser.add_argument("--allow-upscale", action="store_true")
    parser.add_argument("--metadata", type=Path)
    args = parser.parse_args()

    if args.rows <= 0 or args.cols <= 0:
        raise ValueError("rows and cols must be positive")
    if not 0.1 <= args.fit_scale <= 0.95:
        raise ValueError("fit-scale must be between 0.1 and 0.95")

    source = Image.open(args.input).convert("RGBA")
    cleaned = chroma_to_alpha(source, args.key, args.transparent_distance, args.opaque_distance)
    alpha = np.asarray(cleaned.getchannel("A"), dtype=np.uint8)
    components = connected_components(alpha >= args.mask_alpha, args.min_component_area)
    expected = args.rows * args.cols
    discarded_components: list[dict[str, object]] = []
    if len(components) > expected:
        by_area = sorted(components, key=lambda item: int(item["area"]), reverse=True)
        kept = by_area[:expected]
        discarded_components = by_area[expected:]
        smallest_kept = min(int(item["area"]) for item in kept)
        largest_discarded = max(int(item["area"]) for item in discarded_components)
        if largest_discarded < smallest_kept * 0.25:
            components = kept

    if len(components) != expected:
        summary = sorted(
            (
                {
                    "area": int(item["area"]),
                    "bbox": list(item["bbox"]),
                    "center": [round(value, 1) for value in item["center"]],
                }
                for item in components
            ),
            key=lambda item: item["area"],
            reverse=True,
        )
        raise ValueError(
            f"expected {expected} foreground subjects, found {len(components)}; "
            f"components={json.dumps(summary[:expected + 4], ensure_ascii=False)}"
        )

    ordered = frame_order(components, args.rows, args.cols)
    cell_width = source.width // args.cols
    cell_height = source.height // args.rows
    crops: list[Image.Image] = []
    for component in ordered:
        x0, y0, x1, y1 = component["bbox"]
        padding = 3
        box = (max(0, x0 - padding), max(0, y0 - padding), min(source.width, x1 + padding), min(source.height, y1 + padding))
        crops.append(cleaned.crop(box))

    max_width = max(crop.width for crop in crops)
    max_height = max(crop.height for crop in crops)
    shared_scale = min(cell_width / max_width, cell_height / max_height) * args.fit_scale
    if not args.allow_upscale:
        shared_scale = min(1.0, shared_scale)

    canvas = Image.new("RGBA", source.size, (*args.key, 255))
    frames_meta: list[dict[str, object]] = []
    for index, (component, crop) in enumerate(zip(ordered, crops, strict=True)):
        width = max(1, round(crop.width * shared_scale))
        height = max(1, round(crop.height * shared_scale))
        if (width, height) != crop.size:
            crop = crop.resize((width, height), Image.Resampling.LANCZOS)
        row, col = divmod(index, args.cols)
        cell_x = col * cell_width
        cell_y = row * cell_height
        x = cell_x + (cell_width - width) // 2
        bottom_padding = round(cell_height * args.bottom_padding_ratio)
        y = cell_y + cell_height - height - bottom_padding
        canvas.alpha_composite(crop, (x, y))
        frames_meta.append(
            {
                "index": index + 1,
                "grid": [row, col],
                "sourceBbox": list(component["bbox"]),
                "sourceArea": int(component["area"]),
                "outputSize": [width, height],
                "pastePosition": [x, y],
                "cellMargins": [x - cell_x, y - cell_y, cell_x + cell_width - (x + width), cell_y + cell_height - (y + height)],
            }
        )

    args.output.parent.mkdir(parents=True, exist_ok=True)
    canvas.convert("RGB").save(args.output, format="PNG", optimize=True)
    metadata_path = args.metadata or args.output.with_suffix(".json")
    metadata_path.parent.mkdir(parents=True, exist_ok=True)
    metadata_path.write_text(
        json.dumps(
            {
                "schemaVersion": 1,
                "input": str(args.input),
                "output": str(args.output),
                "rows": args.rows,
                "cols": args.cols,
                "key": "#%02X%02X%02X" % args.key,
                "sharedScale": shared_scale,
                "allowUpscale": args.allow_upscale,
                "discardedSmallComponents": [
                    {"area": int(item["area"]), "bbox": list(item["bbox"])}
                    for item in discarded_components
                ],
                "frames": frames_meta,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(args.output)


if __name__ == "__main__":
    main()
