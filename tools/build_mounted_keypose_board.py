#!/usr/bin/env python3
"""Assemble approved AI-drawn mounted key poses into one exact 2x4 board.

The source sheet and every replacement already contain a whole illustrated
"rider + mount + tack" subject.  This tool never composites separate rider and
pet layers.  It only removes the chroma backdrop, selects one connected whole
subject, normalizes the review scale/baseline, and repacks the approved poses
into the project's canonical eight-direction order.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image

from repack_chroma_sprite_grid import chroma_to_alpha, connected_components, frame_order


DIRECTIONS = (
    "south",
    "southwest",
    "west",
    "northwest",
    "north",
    "northeast",
    "east",
    "southeast",
)
KEY = (255, 0, 255)
ROWS = 2
COLS = 4
CELL_SIZE = (384, 512)
TARGET_HEIGHT = 408
MAX_WIDTH = 344
BOTTOM_PADDING = 36


def parse_replacements(values: list[str]) -> dict[str, Path]:
    replacements: dict[str, Path] = {}
    for value in values:
        direction, separator, path_text = value.partition("=")
        if not separator or direction not in DIRECTIONS or not path_text:
            raise ValueError(f"replacement must be DIRECTION=PATH, got {value!r}")
        if direction in replacements:
            raise ValueError(f"duplicate replacement for {direction}")
        replacements[direction] = Path(path_text)
    return replacements


def cleaned_image(path: Path) -> Image.Image:
    return chroma_to_alpha(
        Image.open(path).convert("RGBA"),
        KEY,
        transparent_distance=28.0,
        opaque_distance=145.0,
    )


def crop_component(image: Image.Image, component: dict[str, object]) -> tuple[Image.Image, list[int]]:
    x0, y0, x1, y1 = (int(value) for value in component["bbox"])
    padding = 4
    box = [
        max(0, x0 - padding),
        max(0, y0 - padding),
        min(image.width, x1 + padding),
        min(image.height, y1 + padding),
    ]
    return image.crop(tuple(box)), box


def extract_base(sheet_path: Path) -> tuple[dict[str, Image.Image], dict[str, object]]:
    sheet = cleaned_image(sheet_path)
    alpha = np.asarray(sheet.getchannel("A"), dtype=np.uint8)
    components = connected_components(alpha >= 24, min_area=6000)
    if len(components) != len(DIRECTIONS):
        raise ValueError(f"base sheet must contain exactly 8 whole subjects, found {len(components)}")
    ordered = frame_order(components, ROWS, COLS)
    images: dict[str, Image.Image] = {}
    source_meta: dict[str, object] = {}
    for direction, component in zip(DIRECTIONS, ordered, strict=True):
        crop, box = crop_component(sheet, component)
        images[direction] = crop
        source_meta[direction] = {
            "path": str(sheet_path),
            "sourceBbox": box,
            "sourceArea": int(component["area"]),
            "replacement": False,
        }
    return images, source_meta


def extract_single(path: Path) -> tuple[Image.Image, dict[str, object]]:
    image = cleaned_image(path)
    alpha = np.asarray(image.getchannel("A"), dtype=np.uint8)
    components = connected_components(alpha >= 24, min_area=6000)
    if not components:
        raise ValueError(f"replacement has no whole foreground subject: {path}")
    component = max(components, key=lambda item: int(item["area"]))
    crop, box = crop_component(image, component)
    return crop, {
        "path": str(path),
        "sourceBbox": box,
        "sourceArea": int(component["area"]),
        "discardedComponents": len(components) - 1,
        "replacement": True,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-sheet", required=True, type=Path)
    parser.add_argument("--replacement", action="append", default=[])
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--metadata", type=Path)
    args = parser.parse_args()

    replacements = parse_replacements(args.replacement)
    images, sources = extract_base(args.base_sheet)
    for direction, path in replacements.items():
        images[direction], sources[direction] = extract_single(path)

    cell_width, cell_height = CELL_SIZE
    board = Image.new("RGB", (cell_width * COLS, cell_height * ROWS), KEY)
    frame_meta: dict[str, object] = {}
    for index, direction in enumerate(DIRECTIONS):
        crop = images[direction]
        scale = min(TARGET_HEIGHT / crop.height, MAX_WIDTH / crop.width)
        output_size = (
            max(1, round(crop.width * scale)),
            max(1, round(crop.height * scale)),
        )
        resized = crop.resize(output_size, Image.Resampling.LANCZOS)
        row, col = divmod(index, COLS)
        x = col * cell_width + (cell_width - resized.width) // 2
        y = row * cell_height + cell_height - BOTTOM_PADDING - resized.height
        board_rgba = Image.new("RGBA", board.size, (*KEY, 255))
        board_rgba.paste(board.convert("RGBA"))
        board_rgba.alpha_composite(resized, (x, y))
        board = board_rgba.convert("RGB")
        frame_meta[direction] = {
            **sources[direction],
            "scale": scale,
            "outputSize": list(output_size),
            "pastePosition": [x, y],
            "cell": [row, col],
        }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    board.save(args.output, format="PNG", optimize=True)
    metadata_path = args.metadata or args.output.with_suffix(".json")
    metadata_path.parent.mkdir(parents=True, exist_ok=True)
    metadata_path.write_text(
        json.dumps(
            {
                "schemaVersion": 1,
                "rule": "whole AI-drawn mounted subjects only; no rider/pet layer composition",
                "order": list(DIRECTIONS),
                "cellSize": list(CELL_SIZE),
                "targetHeight": TARGET_HEIGHT,
                "maxWidth": MAX_WIDTH,
                "bottomPadding": BOTTOM_PADDING,
                "frames": frame_meta,
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
