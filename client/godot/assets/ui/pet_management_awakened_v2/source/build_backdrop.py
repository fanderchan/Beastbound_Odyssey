#!/usr/bin/env python3
"""Rebuild or verify the 1280x720 pet screen backdrop."""

import argparse
from pathlib import Path

from PIL import Image, ImageChops


SOURCE_DIR = Path(__file__).resolve().parent
SOURCE_PATH = SOURCE_DIR / "pet_management_backdrop_wide_original.png"
OUTPUT_PATH = SOURCE_DIR.parent / "runtime" / "pet_management_backdrop_1280x720.png"

PANEL_BOX = (614, 80, 1137, 591)
TARGET_PANEL_WIDTH = 466
ERASE_BOX = (1078, 68, 1147, 604)
ERASE_SAMPLE_X = 1151


def expected_image() -> Image.Image:
    image = Image.open(SOURCE_PATH).convert("RGBA")
    rebuilt = image.copy()

    erase_width = ERASE_BOX[2] - ERASE_BOX[0]
    clean_background = image.crop(
        (
            ERASE_SAMPLE_X,
            ERASE_BOX[1],
            ERASE_SAMPLE_X + erase_width,
            ERASE_BOX[3],
        )
    )
    rebuilt.paste(clean_background, ERASE_BOX[:2])

    panel = image.crop(PANEL_BOX)
    panel = panel.resize(
        (TARGET_PANEL_WIDTH, PANEL_BOX[3] - PANEL_BOX[1]),
        Image.Resampling.LANCZOS,
    )
    rebuilt.alpha_composite(panel, (PANEL_BOX[0], PANEL_BOX[1]))
    return rebuilt


def verify() -> None:
    if not OUTPUT_PATH.is_file():
        raise SystemExit(f"missing runtime backdrop: {OUTPUT_PATH}")
    actual = Image.open(OUTPUT_PATH).convert("RGBA")
    expected = expected_image()
    if actual.size != expected.size:
        raise SystemExit(
            f"runtime backdrop size differs: {actual.size} != {expected.size}"
        )
    if ImageChops.difference(actual, expected).getbbox() is not None:
        raise SystemExit("runtime backdrop pixels differ from deterministic build")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--write",
        action="store_true",
        help="rebuild the runtime backdrop; default is read-only verification",
    )
    args = parser.parse_args()
    if args.write:
        expected_image().save(OUTPUT_PATH, optimize=True)
    verify()
    print("pet management backdrop ok: 1280x720")


if __name__ == "__main__":
    main()
