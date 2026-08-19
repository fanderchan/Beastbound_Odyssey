#!/usr/bin/env python3
"""Assemble four reviewed Firebud surface rows into one strict 4x4 sheet."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import tempfile
from pathlib import Path

from PIL import Image, __version__ as PILLOW_VERSION


SCRIPT_VERSION = "1.0.0"
GRID_SIZE = 4
AUTOTILE_SIGNATURES = (
    "nw",
    "ne",
    "nw_ne",
    "sw",
    "nw_sw",
    "ne_sw",
    "nw_ne_sw",
    "se",
    "nw_se",
    "ne_se",
    "nw_ne_se",
    "sw_se",
    "nw_sw_se",
    "ne_sw_se",
    "nw_ne_sw_se",
)


class BuildError(ValueError):
    """Raised when a row or destination violates the frozen sheet contract."""


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def portable_path(path: Path) -> str:
    try:
        return path.relative_to(Path.cwd().resolve()).as_posix()
    except ValueError:
        return str(path)


def _cell_bounds(width: int) -> list[int]:
    return [
        (index * width + GRID_SIZE // 2) // GRID_SIZE
        for index in range(GRID_SIZE + 1)
    ]


def _open_exact_rgba(path: Path, label: str) -> Image.Image:
    if not path.is_file():
        raise BuildError(f"{label} does not exist: {path}")
    with Image.open(path) as opened:
        opened.load()
        if opened.format != "PNG":
            raise BuildError(f"{label} must be PNG, got {opened.format!r}")
        if opened.mode != "RGBA":
            raise BuildError(f"{label} must be exact RGBA, got {opened.mode!r}")
        if opened.width < 512 or opened.height < 512:
            raise BuildError(
                f"{label} is too small for the production row contract: "
                f"{opened.width}x{opened.height}"
            )
        return opened.copy()


def _visible_gap_count(alpha: Image.Image, threshold: int = 16) -> int:
    pixels = alpha.load()
    gaps = 0
    for y in range(alpha.height):
        visible = [x for x in range(alpha.width) if pixels[x, y] > threshold]
        if not visible:
            continue
        left = min(visible)
        right = max(visible)
        gaps += sum(1 for x in range(left, right + 1) if pixels[x, y] == 0)
    return gaps


def _save_png_atomic(image: Image.Image, destination: Path) -> None:
    if destination.exists():
        raise BuildError(f"output already exists: {destination}")
    destination.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary_name = tempfile.mkstemp(
        prefix=f".{destination.name}.", suffix=".tmp", dir=destination.parent
    )
    os.close(fd)
    temporary = Path(temporary_name)
    try:
        image.save(temporary, format="PNG", optimize=False, compress_level=9)
        os.replace(temporary, destination)
    finally:
        temporary.unlink(missing_ok=True)


def _write_json_atomic(payload: dict, destination: Path) -> None:
    if destination.exists():
        raise BuildError(f"manifest already exists: {destination}")
    destination.parent.mkdir(parents=True, exist_ok=True)
    rendered = json.dumps(payload, ensure_ascii=False, indent=2) + "\n"
    fd, temporary_name = tempfile.mkstemp(
        prefix=f".{destination.name}.", suffix=".tmp", dir=destination.parent
    )
    temporary = Path(temporary_name)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(rendered)
        os.replace(temporary, destination)
    finally:
        temporary.unlink(missing_ok=True)


def build(args: argparse.Namespace) -> dict:
    row_arguments = list(args.row)
    if len(row_arguments) != GRID_SIZE:
        raise BuildError(f"exactly {GRID_SIZE} --row inputs are required")

    row_paths = [path.resolve() for path in row_arguments]
    output_path = args.output.resolve()
    manifest_path = args.manifest.resolve()
    if output_path == manifest_path:
        raise BuildError("sheet output and manifest must be different paths")

    rows = [
        _open_exact_rgba(path, f"row {index + 1}")
        for index, path in enumerate(row_paths)
    ]
    dimensions = {row.size for row in rows}
    if len(dimensions) != 1:
        raise BuildError(f"all rows must share one size, got {sorted(dimensions)}")

    source_width, source_height = rows[0].size
    x_bounds = _cell_bounds(source_width)
    source_cell_widths = [
        x_bounds[index + 1] - x_bounds[index] for index in range(GRID_SIZE)
    ]
    cell_size = max(source_cell_widths)
    if source_height < cell_size:
        raise BuildError("row height is smaller than its widest source cell")
    crop_top = (source_height - cell_size) // 2
    crop_bottom = crop_top + cell_size

    sheet = Image.new(
        "RGBA",
        (cell_size * GRID_SIZE, cell_size * GRID_SIZE),
        (0, 0, 0, 0),
    )
    cell_reports: list[dict] = []
    for row_index, row in enumerate(rows):
        for column_index in range(GRID_SIZE):
            linear_index = row_index * GRID_SIZE + column_index
            source_rect = (
                x_bounds[column_index],
                crop_top,
                x_bounds[column_index + 1],
                crop_bottom,
            )
            cell = row.crop(source_rect)
            alpha = cell.getchannel("A")
            alpha_bbox = alpha.getbbox()
            expected_blank = linear_index == len(AUTOTILE_SIGNATURES)
            if expected_blank:
                if alpha_bbox is not None:
                    raise BuildError("row 4 column 4 must be completely transparent")
            else:
                if alpha_bbox is None:
                    raise BuildError(
                        f"autotile cell {row_index + 1},{column_index + 1} is empty"
                    )
                left, top, right, bottom = alpha_bbox
                if left <= 0 or top <= 0 or right >= cell.width or bottom >= cell.height:
                    raise BuildError(
                        f"autotile cell {row_index + 1},{column_index + 1} "
                        "touches a source-cell edge"
                    )
                gaps = _visible_gap_count(alpha)
                if gaps:
                    raise BuildError(
                        f"autotile cell {row_index + 1},{column_index + 1} "
                        f"contains {gaps} transparent interior pixels"
                    )

            paste_x = column_index * cell_size + (cell_size - cell.width) // 2
            paste_y = row_index * cell_size
            sheet.alpha_composite(cell, (paste_x, paste_y))
            cell_reports.append(
                {
                    "row": row_index,
                    "column": column_index,
                    "signature": (
                        AUTOTILE_SIGNATURES[linear_index]
                        if not expected_blank
                        else None
                    ),
                    "sourceRect": list(source_rect),
                    "alphaBbox": list(alpha_bbox) if alpha_bbox is not None else None,
                    "blank": expected_blank,
                }
            )

    _save_png_atomic(sheet, output_path)
    payload = {
        "schemaVersion": 1,
        "reportType": "beastbound.firebud_surface_autotile_sheet_build",
        "scriptVersion": SCRIPT_VERSION,
        "pillowVersion": PILLOW_VERSION,
        "surface": args.surface,
        "signatures": list(AUTOTILE_SIGNATURES),
        "sources": [
            {
                "path": portable_path(path),
                "sha256": sha256(path),
                "dimensions": [source_width, source_height],
            }
            for path in row_paths
        ],
        "crop": {
            "xBounds": x_bounds,
            "top": crop_top,
            "bottom": crop_bottom,
            "cellSize": cell_size,
        },
        "output": {
            "path": portable_path(output_path),
            "sha256": sha256(output_path),
            "dimensions": list(sheet.size),
            "grid": {"rows": GRID_SIZE, "columns": GRID_SIZE},
            "blankCell": [3, 3],
        },
        "cells": cell_reports,
    }
    _write_json_atomic(payload, manifest_path)
    return payload


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--surface", choices=("path", "plaza"), required=True)
    parser.add_argument("--row", type=Path, action="append", required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    return parser.parse_args()


def main() -> int:
    try:
        payload = build(parse_args())
    except (BuildError, OSError) as error:
        print(f"ERROR: {error}")
        return 1
    print(json.dumps(payload["output"], ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
