#!/usr/bin/env python3
"""Normalize the v5 authored swatches; retain v4 cells during the floor rollout.

Only source crop, matte/colour normalization, resampling and atlas assembly happen
here. The twelve independently authored textures all come from the saved raw PNG.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
from pathlib import Path
import tempfile

from PIL import Image


SPEC = importlib.util.spec_from_file_location(
    "diamond", Path(__file__).with_name("build_diamond_ground_atlas.py")
)
DIAMOND = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(DIAMOND)
LABELS = (
    "floor_a", "floor_b", "floor_c", "floor_d", "path_a", "path_b",
    "blocked_a", "mineral_a", "damp_a", "damp_b", "sanctum_a", "sanctum_b",
)


def build(raw: Path, legacy_source: Path, output: Path) -> dict:
    if output.exists():
        raise ValueError("output directory must be fresh")
    source = Image.open(raw).convert("RGBA")
    if source.size != (1536, 1024):
        raise ValueError("unexpected source dimensions")
    if source.getchannel("A").crop((0, 1023, 1536, 1024)).getbbox():
        raise ValueError("the removable final row must be fully transparent")
    source = source.crop((0, 0, 1536, 1023))
    output.mkdir(parents=True)
    atlas = Image.new("RGBA", (480, 120), (0, 0, 0, 0))
    mask = DIAMOND._diamond_mask()
    entries = []
    with tempfile.TemporaryDirectory(prefix="ground-v5-") as temp:
        old = Path(temp) / "legacy"
        legacy = DIAMOND.build(legacy_source, old)
        legacy_atlas = Image.open(old / "atlas.png").convert("RGBA")
        for index, entry in enumerate(legacy["tiles"]):
            x, y, w, h = entry["rect"]
            atlas.alpha_composite(legacy_atlas.crop((x, y, x+w, y+h)), (index*80, 0))
            entries.append({**entry, "rect": [index*80, 0, 80, 40], "sourceVersion": "v4"})
    raw_tiles = []
    for index, label in enumerate(LABELS):
        row, column = divmod(index, 4)
        cell = source.crop((column*384, row*341, (column+1)*384, (row+1)*341))
        bbox = cell.getchannel("A").point(lambda a: 255 if a > 16 else 0).getbbox()
        if bbox is None:
            raise ValueError(f"empty swatch: {label}")
        crop = cell.crop(bbox)
        median = DIAMOND._median_visible_rgb(crop)
        matte = Image.new("RGBA", crop.size, median + (255,))
        matte.alpha_composite(crop)
        tile = matte.convert("RGB").resize((80, 40), Image.Resampling.LANCZOS).convert("RGBA")
        tile.putalpha(mask)
        raw_tiles.append((tile, median, bbox))
    # Equalize the four dry-floor medians so random selection does not make a
    # checkerboard. Preserve each independent pattern, including source edges.
    target = tuple(round(sum(raw_tiles[i][1][c] for i in range(4))/4) for c in range(3))
    for index, (label, (tile, median, bbox)) in enumerate(zip(LABELS, raw_tiles)):
        if index < 4:
            channels = tile.split()
            tile = Image.merge("RGBA", tuple(
                channels[c].point(lambda value, delta=target[c]-median[c]: max(0, min(255, value+delta)))
                for c in range(3)
            ) + (mask,))
        slot = index + 6
        row, column = divmod(slot, 6)
        atlas.alpha_composite(tile, (column*80, row*40))
        entries.append({"tileId": "earth_cave_natural_" + label,
                        "rect": [column*80, row*40, 80, 40],
                        "sourceCell": [(index%4)*384, (index//4)*341, 384, 341],
                        "sourceAlphaBBox": list(bbox), "sourceVersion": "v5"})
    DIAMOND._save_png(atlas, output / "atlas.png")
    manifest = {"schemaVersion": 1, "sourceSha256": DIAMOND._sha256(raw),
                "legacySourceSha256": DIAMOND._sha256(legacy_source),
                "sourceTrim": "one fully transparent bottom row", "tileSize": [80, 40],
                "alphaMask": {"mode": "expanded_diamond", "overlapPixels": 1, "supersample": 8},
                "dryFloorMedianTarget": list(target), "tiles": entries,
                "atlas": {"path": "atlas.png", "dimensions": [480, 120],
                          "sha256": DIAMOND._sha256(output / "atlas.png")}}
    (output / "build-manifest.json").write_text(json.dumps(manifest, indent=2)+"\n")
    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("--legacy-source", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(build(args.source, args.legacy_source, args.output_dir)["atlas"]))
