#!/usr/bin/env python3
"""Rebuild or verify the six primary pet-management ornament textures."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageChops


SOURCE_DIR = Path(__file__).resolve().parent
RUNTIME_DIR = SOURCE_DIR.parent / "runtime"
ATLAS_PATH = SOURCE_DIR / "ornament-atlas-alpha.png"
OUTPUTS = (
    ("stage_frame_normal.png", 0, 0),
    ("stage_frame_selected.png", 1, 0),
    ("header_paw.png", 2, 0),
    ("help_medallion.png", 0, 1),
    ("strategy_banner.png", 1, 1),
    ("codex_badge.png", 2, 1),
)


def expected_images() -> dict[str, Image.Image]:
    atlas = Image.open(ATLAS_PATH).convert("RGBA")
    if atlas.width % 3 or atlas.height % 2:
        raise ValueError(f"atlas must be a 3x2 grid, got {atlas.size}")
    cell_width = atlas.width // 3
    cell_height = atlas.height // 2
    return {
        filename: atlas.crop(
            (
                column * cell_width,
                row * cell_height,
                (column + 1) * cell_width,
                (row + 1) * cell_height,
            )
        )
        for filename, column, row in OUTPUTS
    }


def verify() -> list[str]:
    errors: list[str] = []
    for filename, expected in expected_images().items():
        runtime_path = RUNTIME_DIR / filename
        if not runtime_path.is_file():
            errors.append(f"missing runtime texture: {runtime_path}")
            continue
        actual = Image.open(runtime_path).convert("RGBA")
        if actual.size != expected.size:
            errors.append(
                f"{filename}: expected {expected.size}, got {actual.size}"
            )
            continue
        if ImageChops.difference(actual, expected).getbbox() is not None:
            errors.append(f"{filename}: pixels differ from primary atlas")
    return errors


def write() -> None:
    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
    for filename, expected in expected_images().items():
        expected.save(RUNTIME_DIR / filename, optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--write",
        action="store_true",
        help="write deterministic crops; default is read-only verification",
    )
    args = parser.parse_args()
    if args.write:
        write()
    errors = verify()
    if errors:
        raise SystemExit("\n".join(errors))
    print(f"primary ornaments ok: {len(OUTPUTS)}/{len(OUTPUTS)}")


if __name__ == "__main__":
    main()
