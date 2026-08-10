#!/usr/bin/env python3
"""Rebuild or verify the generated 2x2 pet UI micro-ornament atlas."""

import argparse
from pathlib import Path

from PIL import Image, ImageChops


SOURCE_DIR = Path(__file__).resolve().parent
RUNTIME_DIR = SOURCE_DIR.parent / "runtime"
ATLAS_PATH = SOURCE_DIR / "micro-ornament-atlas-alpha.png"
OUTPUTS = (
    ("quality_badge_frame.png", 0, 0, 0.0),
    ("close_icon.png", 1, 0, 0.22),
    ("edit_icon.png", 0, 1, 0.0),
    ("roster_up_down_control.png", 1, 1, 0.0),
)
TRIM_PADDING = 8


def alpha_trim(image: Image.Image) -> Image.Image:
    alpha = image.getchannel("A")
    box = alpha.getbbox()
    if box is None:
        return image
    left = max(0, box[0] - TRIM_PADDING)
    top = max(0, box[1] - TRIM_PADDING)
    right = min(image.width, box[2] + TRIM_PADDING)
    bottom = min(image.height, box[3] + TRIM_PADDING)
    return image.crop((left, top, right, bottom))


def expected_images() -> dict[str, Image.Image]:
    atlas = Image.open(ATLAS_PATH).convert("RGBA")
    cell_width = atlas.width // 2
    cell_height = atlas.height // 2
    outputs: dict[str, Image.Image] = {}
    for filename, column, row, discard_left_ratio in OUTPUTS:
        cell = atlas.crop(
            (
                column * cell_width,
                row * cell_height,
                (column + 1) * cell_width,
                (row + 1) * cell_height,
            )
        )
        if discard_left_ratio > 0.0:
            cell = cell.crop(
                (
                    round(cell.width * discard_left_ratio),
                    0,
                    cell.width,
                    cell.height,
                )
            )
        outputs[filename] = alpha_trim(cell)
    return outputs


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
            errors.append(f"{filename}: pixels differ from micro atlas")
    return errors


def write() -> None:
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
    print(f"micro ornaments ok: {len(OUTPUTS)}/{len(OUTPUTS)}")


if __name__ == "__main__":
    main()
