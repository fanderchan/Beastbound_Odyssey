#!/usr/bin/env python3
"""Build the Earth Vein 80x40 atlas with a seam-safe diamond alpha mask."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import statistics
import tempfile

from PIL import Image, ImageDraw


TILE_SIZE = (80, 40)
GRID = (3, 2)
LABELS = (
    "earth_cave_floor_a",
    "earth_cave_floor_b",
    "earth_cave_path_a",
    "earth_cave_blocked_a",
    "earth_cave_mineral_a",
    "earth_cave_edge_a",
)
SUPERSAMPLE = 8
OVERLAP_PIXELS = 1
SECONDARY_SOURCE_WEIGHTS = {
    "earth_cave_floor_b": 0.10,
    "earth_cave_path_a": 0.30,
    "earth_cave_blocked_a": 0.42,
    "earth_cave_mineral_a": 0.20,
}


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _save_png(image: Image.Image, path: Path) -> None:
    image.save(path, format="PNG", optimize=False, compress_level=9)


def _median_visible_rgb(image: Image.Image) -> tuple[int, int, int]:
    pixels = (
        image.get_flattened_data()
        if hasattr(image, "get_flattened_data")
        else image.getdata()
    )
    visible = [
        (red, green, blue)
        for red, green, blue, alpha in pixels
        if alpha >= 128
    ]
    if not visible:
        raise ValueError("source tile contains no sufficiently opaque pixels")
    return tuple(
        int(statistics.median(pixel[channel] for pixel in visible))
        for channel in range(3)
    )


def _diamond_mask() -> Image.Image:
    width, height = TILE_SIZE
    scale = SUPERSAMPLE
    overlap = OVERLAP_PIXELS * scale
    mask = Image.new("L", (width * scale, height * scale), 0)
    draw = ImageDraw.Draw(mask)
    draw.polygon(
        (
            (width * scale // 2, -overlap),
            (width * scale + overlap, height * scale // 2),
            (width * scale // 2, height * scale + overlap),
            (-overlap, height * scale // 2),
        ),
        fill=255,
    )
    return mask.resize(TILE_SIZE, Image.Resampling.LANCZOS)


def _prepared_tile(cell: Image.Image, mask: Image.Image) -> tuple[Image.Image, tuple[int, int, int, int]]:
    alpha = cell.getchannel("A")
    bbox = alpha.point(lambda value: 255 if value > 0 else 0).getbbox()
    if bbox is None:
        raise ValueError("source grid cell is empty")
    cropped = cell.crop(bbox)
    matte = Image.new("RGBA", cropped.size, _median_visible_rgb(cropped) + (255,))
    matte.alpha_composite(cropped)
    texture = matte.convert("RGB").resize(TILE_SIZE, Image.Resampling.LANCZOS)
    result = texture.convert("RGBA")
    result.putalpha(mask)
    return result, (bbox[0], bbox[1], bbox[2] - bbox[0], bbox[3] - bbox[1])


def build(source_path: Path, output_dir: Path) -> dict[str, object]:
    source_path = source_path.resolve()
    output_dir = output_dir.resolve()
    if output_dir.exists():
        raise ValueError(f"output directory must not already exist: {output_dir}")
    if source_path.suffix.lower() != ".png" or not source_path.is_file():
        raise ValueError("source must be an existing PNG")
    with Image.open(source_path) as opened:
        opened.load()
        source = opened.convert("RGBA")
    columns, rows = GRID
    if source.width % columns or source.height % rows:
        raise ValueError("source dimensions must divide exactly into the fixed 3x2 grid")

    cell_width = source.width // columns
    cell_height = source.height // rows
    mask = _diamond_mask()
    atlas = Image.new("RGBA", (TILE_SIZE[0] * columns, TILE_SIZE[1] * rows), (0, 0, 0, 0))
    entries: list[dict[str, object]] = []

    output_dir.mkdir(parents=True)
    with tempfile.TemporaryDirectory(prefix=".diamond-atlas-", dir=output_dir) as raw_temp:
        temp = Path(raw_temp)
        primary_floor: Image.Image | None = None
        for index, label in enumerate(LABELS):
            row, column = divmod(index, columns)
            cell_rect = (
                column * cell_width,
                row * cell_height,
                (column + 1) * cell_width,
                (row + 1) * cell_height,
            )
            tile, bbox = _prepared_tile(source.crop(cell_rect), mask)
            if label == "earth_cave_floor_a":
                primary_floor = tile.copy()
            elif label in SECONDARY_SOURCE_WEIGHTS:
                if primary_floor is None:
                    raise ValueError("primary floor must be prepared before blended tiles")
                tile = Image.blend(
                    primary_floor,
                    tile,
                    SECONDARY_SOURCE_WEIGHTS[label],
                )
                tile.putalpha(mask)
            atlas.alpha_composite(tile, (column * TILE_SIZE[0], row * TILE_SIZE[1]))
            tile_path = temp / f"{label}.png"
            _save_png(tile, tile_path)
            entries.append(
                {
                    "tileId": label,
                    "rect": [column * TILE_SIZE[0], row * TILE_SIZE[1], *TILE_SIZE],
                    "dimensions": list(TILE_SIZE),
                    "sha256": _sha256(tile_path),
                    "sourceCell": [cell_rect[0], cell_rect[1], cell_width, cell_height],
                    "sourceAlphaBBox": list(bbox),
                }
            )

        atlas_path = output_dir / "atlas.png"
        _save_png(atlas, atlas_path)
        manifest = {
            "schemaVersion": 1,
            "source": {
                "path": Path(os.path.relpath(source_path, output_dir)).as_posix(),
                "dimensions": [source.width, source.height],
                "sha256": _sha256(source_path),
                "grid": {"rows": rows, "columns": columns},
            },
            "tileSize": list(TILE_SIZE),
            "alphaMask": {
                "mode": "expanded_diamond",
                "overlapPixels": OVERLAP_PIXELS,
                "supersample": SUPERSAMPLE,
            },
            "variantBlend": {
                "tileId": "earth_cave_floor_b",
                "primaryTileId": "earth_cave_floor_a",
                "secondarySourceWeight": SECONDARY_SOURCE_WEIGHTS["earth_cave_floor_b"],
            },
            "semanticBlend": {
                "primaryTileId": "earth_cave_floor_a",
                "secondarySourceWeights": {
                    tile_id: weight
                    for tile_id, weight in SECONDARY_SOURCE_WEIGHTS.items()
                    if tile_id != "earth_cave_floor_b"
                },
            },
            "atlas": {
                "path": "atlas.png",
                "dimensions": [atlas.width, atlas.height],
                "sha256": _sha256(atlas_path),
            },
            "tiles": entries,
        }
        manifest_path = output_dir / "build-manifest.json"
        manifest_path.write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
    return manifest


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    manifest = build(args.source, args.output_dir)
    print(json.dumps({"status": "ok", "atlas": manifest["atlas"]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
