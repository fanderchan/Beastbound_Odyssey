#!/usr/bin/env python3
"""Build a deterministic two-view pet action contact sheet for visual QA."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


VIEWS = ("front_3quarter_sw", "back_3quarter_ne")
ACTIONS = ("idle", "walk", "attack", "hurt", "defend", "down")


def label_font(size: int) -> ImageFont.ImageFont:
    candidates = (
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
    )
    for candidate in candidates:
        try:
            return ImageFont.truetype(candidate, size)
        except OSError:
            pass
    return ImageFont.load_default()


def frame_paths(root: Path, view: str, action: str, count: int) -> list[Path]:
    paths = [root / "views" / view / action / f"{action}-{index}.png" for index in range(1, count + 1)]
    missing = [str(path) for path in paths if not path.is_file()]
    if missing:
        raise FileNotFoundError(f"missing frames: {missing}")
    return paths


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()

    metadata = json.loads((args.root / "action-bundle-meta.json").read_text(encoding="utf-8"))
    tile_size = 192
    label_height = 30
    outer_padding = 26
    column_gap = 14
    row_gap = 20
    cell_width = tile_size
    cell_height = tile_size + label_height
    width = outer_padding * 2 + len(ACTIONS) * cell_width + (len(ACTIONS) - 1) * column_gap
    height = outer_padding * 2 + len(VIEWS) * cell_height + (len(VIEWS) - 1) * row_gap
    canvas = Image.new("RGB", (width, height), (16, 31, 31))
    draw = ImageDraw.Draw(canvas)
    font = label_font(18)
    small_font = label_font(14)

    for row, view in enumerate(VIEWS):
        for column, action in enumerate(ACTIONS):
            action_meta = metadata["actions"][action]
            count = int(action_meta["frameCount"])
            # The contact sheet uses the peak frame; GIF/MP4 evidence verifies continuity.
            peak_index = count if action == "down" else max(1, min(count, (count + 1) // 2 + (1 if action in {"attack", "hurt"} else 0)))
            frame = Image.open(frame_paths(args.root, view, action, count)[peak_index - 1]).convert("RGBA")
            frame.thumbnail((tile_size, tile_size), Image.Resampling.LANCZOS)
            x = outer_padding + column * (cell_width + column_gap)
            y = outer_padding + row * (cell_height + row_gap)
            draw.rounded_rectangle((x, y, x + tile_size, y + tile_size), radius=12, fill=(31, 52, 50), outline=(126, 151, 106), width=2)
            paste_x = x + (tile_size - frame.width) // 2
            paste_y = y + (tile_size - frame.height) // 2
            canvas.paste(frame, (paste_x, paste_y), frame)
            draw.text((x + 8, y + tile_size + 5), f"{action}  {peak_index}/{count}", font=font, fill=(244, 224, 148))
            draw.text((x + 8, y + 8), "FRONT" if row == 0 else "BACK", font=small_font, fill=(164, 219, 199))

    args.output.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(args.output, format="PNG", optimize=True)
    print(args.output)


if __name__ == "__main__":
    main()
