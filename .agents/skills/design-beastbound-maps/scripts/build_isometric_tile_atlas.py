#!/usr/bin/env python3
"""Build a deterministic 80x40 isometric tile atlas from a regular source grid.

Each source cell is cropped to the bounding box of pixels whose alpha exceeds
the configured threshold, resized to exactly 80x40, and written both as an
individual transparent PNG and into a transparent atlas. A JSON manifest
freezes source cells, output rectangles, dimensions, and SHA-256 digests.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence

try:
    from PIL import Image, UnidentifiedImageError
except ImportError as exc:  # pragma: no cover - environment-dependent failure
    raise SystemExit(
        "Pillow is required. Install it with: python3 -m pip install Pillow"
    ) from exc


TILE_WIDTH = 80
TILE_HEIGHT = 40
LABEL_RE = re.compile(r"^[a-z0-9][a-z0-9_-]*$")


class BuildError(ValueError):
    """Raised when input or output contracts are invalid."""


@dataclass(frozen=True)
class PreparedTile:
    label: str
    row: int
    column: int
    source_cell: tuple[int, int, int, int]
    source_alpha_bbox: tuple[int, int, int, int]
    image: Image.Image


def positive_int(value: str) -> int:
    """Parse a positive integer for argparse."""

    try:
        parsed = int(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("must be an integer") from exc
    if parsed <= 0:
        raise argparse.ArgumentTypeError("must be greater than zero")
    return parsed


def alpha_threshold(value: str) -> int:
    """Parse an alpha threshold that still permits at least one visible value."""

    try:
        parsed = int(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("must be an integer") from exc
    if not 0 <= parsed <= 254:
        raise argparse.ArgumentTypeError("must be between 0 and 254")
    return parsed


def filename(value: str) -> str:
    """Accept a plain filename while rejecting traversal and nested paths."""

    candidate = Path(value)
    if not value or candidate.name != value or value in {".", ".."}:
        raise argparse.ArgumentTypeError("must be a plain filename without directories")
    return value


def sha256(path: Path) -> str:
    """Return the lowercase SHA-256 digest of a file."""

    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def validate_labels(labels: Sequence[str], expected_count: int) -> list[str]:
    """Validate tile labels and return a normalized list."""

    if len(labels) != expected_count:
        raise BuildError(
            f"expected exactly {expected_count} labels for the source grid, "
            f"received {len(labels)}"
        )
    normalized = list(labels)
    invalid = [label for label in normalized if not LABEL_RE.fullmatch(label)]
    if invalid:
        raise BuildError(
            "labels must match [a-z0-9][a-z0-9_-]*; invalid: "
            + ", ".join(repr(label) for label in invalid)
        )
    duplicates = sorted({label for label in normalized if normalized.count(label) > 1})
    if duplicates:
        raise BuildError("labels must be unique; duplicates: " + ", ".join(duplicates))
    return normalized


def open_source(path: Path) -> Image.Image:
    """Open and fully decode an alpha-bearing source PNG."""

    if not path.exists():
        raise BuildError(f"source image does not exist: {path}")
    if not path.is_file():
        raise BuildError(f"source image is not a regular file: {path}")
    try:
        with Image.open(path) as opened:
            opened.load()
            if opened.format != "PNG":
                raise BuildError(
                    f"source image must be PNG, decoded format is {opened.format!r}"
                )
            if "A" not in opened.getbands():
                raise BuildError("source PNG must contain an explicit alpha channel")
            return opened.convert("RGBA")
    except (OSError, UnidentifiedImageError) as exc:
        raise BuildError(f"source image cannot be decoded: {exc}") from exc


def prepare_tiles(
    source: Image.Image,
    *,
    rows: int,
    columns: int,
    labels: Sequence[str],
    threshold: int,
) -> list[PreparedTile]:
    """Split, alpha-crop, and normalize every source cell."""

    source_width, source_height = source.size
    if source_width % columns != 0 or source_height % rows != 0:
        raise BuildError(
            f"source dimensions {source_width}x{source_height} are not evenly "
            f"divisible by the declared {rows}x{columns} grid"
        )
    cell_width = source_width // columns
    cell_height = source_height // rows
    if cell_width <= 0 or cell_height <= 0:
        raise BuildError("source grid produces an empty cell")

    prepared: list[PreparedTile] = []
    for index, label in enumerate(labels):
        row, column = divmod(index, columns)
        left = column * cell_width
        top = row * cell_height
        cell_rect = (left, top, left + cell_width, top + cell_height)
        cell = source.crop(cell_rect)
        alpha = cell.getchannel("A")
        visible_mask = alpha.point(lambda value: 255 if value > threshold else 0)
        bbox = visible_mask.getbbox()
        if bbox is None:
            raise BuildError(
                f"tile {label!r} at row {row}, column {column} contains no pixels "
                f"above alpha threshold {threshold}"
            )

        cropped = cell.crop(bbox)
        # Resize premultiplied colors so transparent source RGB cannot bleed into
        # antialiased edges, then convert back to ordinary straight-alpha RGBA.
        normalized = (
            cropped.convert("RGBa")
            .resize((TILE_WIDTH, TILE_HEIGHT), Image.Resampling.LANCZOS)
            .convert("RGBA")
        )
        prepared.append(
            PreparedTile(
                label=label,
                row=row,
                column=column,
                source_cell=(left, top, cell_width, cell_height),
                source_alpha_bbox=(bbox[0], bbox[1], bbox[2] - bbox[0], bbox[3] - bbox[1]),
                image=normalized,
            )
        )
    return prepared


def assert_output_targets(
    output_dir: Path,
    *,
    source_path: Path,
    labels: Sequence[str],
    atlas_name: str,
    manifest_name: str,
    overwrite: bool,
) -> None:
    """Fail before writing if an output path is unsafe or already occupied."""

    if not output_dir.is_absolute():
        raise BuildError(f"output directory must be absolute: {output_dir}")
    if output_dir.is_symlink():
        raise BuildError(f"output directory must not be a symlink: {output_dir}")
    if output_dir.exists() and not output_dir.is_dir():
        raise BuildError(f"output path exists and is not a directory: {output_dir}")
    tiles_dir = output_dir / "tiles"
    if tiles_dir.is_symlink():
        raise BuildError(f"individual tile directory must not be a symlink: {tiles_dir}")
    if tiles_dir.exists() and not tiles_dir.is_dir():
        raise BuildError(f"individual tile path exists and is not a directory: {tiles_dir}")

    expected_tile_names = {f"{label}.png" for label in labels}
    if tiles_dir.is_dir():
        existing_tile_names = {
            child.name
            for child in tiles_dir.iterdir()
            if child.suffix.lower() == ".png"
        }
        if existing_tile_names and existing_tile_names != expected_tile_names:
            unexpected = sorted(existing_tile_names - expected_tile_names)
            missing = sorted(expected_tile_names - existing_tile_names)
            details: list[str] = []
            if unexpected:
                details.append("unexpected: " + ", ".join(unexpected))
            if missing:
                details.append("missing: " + ", ".join(missing))
            raise BuildError(
                "individual tile directory must be fresh or contain exactly the "
                "expected PNG set; " + "; ".join(details)
            )

    targets = [output_dir / atlas_name, output_dir / manifest_name]
    targets.extend(tiles_dir / f"{label}.png" for label in labels)
    resolved_root = output_dir.resolve(strict=False)
    resolved_targets: list[Path] = []
    for target in targets:
        if target.parent.is_symlink():
            raise BuildError(f"output target parent must not be a symlink: {target.parent}")
        if target.is_symlink():
            raise BuildError(f"output target must not be a symlink: {target}")
        resolved_target = target.resolve(strict=False)
        try:
            lexical_common = Path(os.path.commonpath((str(output_dir), str(target))))
            resolved_common = Path(
                os.path.commonpath((str(resolved_root), str(resolved_target)))
            )
        except ValueError as exc:
            raise BuildError(f"output target is outside the output directory: {target}") from exc
        if lexical_common != output_dir or resolved_common != resolved_root:
            raise BuildError(f"output target is outside the output directory: {target}")
        resolved_targets.append(resolved_target)

    if source_path in resolved_targets:
        raise BuildError("an output target would overwrite the source image")
    duplicates = sorted(
        str(path)
        for path in set(resolved_targets)
        if resolved_targets.count(path) > 1
    )
    if duplicates:
        raise BuildError("output targets collide: " + ", ".join(duplicates))
    if not overwrite:
        existing = [str(path) for path in targets if path.exists()]
        if existing:
            raise BuildError(
                "output files already exist; pass --overwrite to replace them: "
                + ", ".join(existing)
            )
    invalid_targets = [str(path) for path in targets if path.exists() and path.is_dir()]
    if invalid_targets:
        raise BuildError("output target is a directory: " + ", ".join(invalid_targets))


def save_png(image: Image.Image, path: Path) -> None:
    """Write a deterministic RGBA PNG."""

    image.save(path, format="PNG", optimize=False, compress_level=9)


def build_outputs(
    *,
    source_path: Path,
    source_image: Image.Image,
    prepared: Sequence[PreparedTile],
    output_dir: Path,
    rows: int,
    columns: int,
    atlas_columns: int,
    threshold: int,
    atlas_name: str,
    manifest_name: str,
    overwrite: bool,
) -> dict[str, object]:
    """Build all files in a temporary directory and publish the manifest last."""

    tile_count = len(prepared)
    atlas_rows = (tile_count + atlas_columns - 1) // atlas_columns
    atlas_size = (atlas_columns * TILE_WIDTH, atlas_rows * TILE_HEIGHT)
    atlas = Image.new("RGBA", atlas_size, (0, 0, 0, 0))
    source_reference = Path(os.path.relpath(source_path, output_dir)).as_posix()

    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "tiles").mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".tile-atlas-build-", dir=output_dir) as raw_tmp:
        temp_dir = Path(raw_tmp)
        temp_tiles = temp_dir / "tiles"
        temp_tiles.mkdir()
        tile_entries: list[dict[str, object]] = []

        for index, tile in enumerate(prepared):
            atlas_row, atlas_column = divmod(index, atlas_columns)
            atlas_x = atlas_column * TILE_WIDTH
            atlas_y = atlas_row * TILE_HEIGHT
            atlas.alpha_composite(tile.image, (atlas_x, atlas_y))

            relative_tile_path = Path("tiles") / f"{tile.label}.png"
            temp_tile_path = temp_dir / relative_tile_path
            save_png(tile.image, temp_tile_path)
            tile_entries.append(
                {
                    "tileId": tile.label,
                    "path": relative_tile_path.as_posix(),
                    "rect": [atlas_x, atlas_y, TILE_WIDTH, TILE_HEIGHT],
                    "dimensions": [TILE_WIDTH, TILE_HEIGHT],
                    "sha256": sha256(temp_tile_path),
                    "sourceCell": list(tile.source_cell),
                    "sourceAlphaBBox": list(tile.source_alpha_bbox),
                }
            )

        temp_atlas_path = temp_dir / atlas_name
        save_png(atlas, temp_atlas_path)
        manifest: dict[str, object] = {
            "schemaVersion": 1,
            "source": {
                "path": source_reference,
                "dimensions": [source_image.width, source_image.height],
                "sha256": sha256(source_path),
                "grid": {"rows": rows, "columns": columns},
                "alphaThreshold": threshold,
            },
            "tileSize": [TILE_WIDTH, TILE_HEIGHT],
            "atlas": {
                "path": atlas_name,
                "dimensions": [atlas_size[0], atlas_size[1]],
                "sha256": sha256(temp_atlas_path),
            },
            "tiles": tile_entries,
        }
        temp_manifest_path = temp_dir / manifest_name
        temp_manifest_path.write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )

        # Recheck every final target after all temporary work and immediately
        # before publication, retaining the caller's original overwrite
        # semantics so a late file is never silently accepted.
        assert_output_targets(
            output_dir,
            source_path=source_path,
            labels=[tile.label for tile in prepared],
            atlas_name=atlas_name,
            manifest_name=manifest_name,
            overwrite=overwrite,
        )

        # Individual assets and atlas become visible first; the manifest is the
        # completion marker and is deliberately published last.
        for tile in prepared:
            source_tile = temp_tiles / f"{tile.label}.png"
            os.replace(source_tile, output_dir / "tiles" / source_tile.name)
        os.replace(temp_atlas_path, output_dir / atlas_name)
        os.replace(temp_manifest_path, output_dir / manifest_name)

    return manifest


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Split an alpha PNG on a regular grid, crop each cell by alpha, "
            "normalize every tile to 80x40, and write tiles, an atlas, and a "
            "SHA-256 manifest."
        )
    )
    parser.add_argument("source", type=Path, help="alpha-bearing source PNG")
    parser.add_argument("--rows", required=True, type=positive_int, help="source grid rows")
    parser.add_argument(
        "--columns", required=True, type=positive_int, help="source grid columns"
    )
    parser.add_argument(
        "--labels",
        required=True,
        nargs="+",
        metavar="ID",
        help="row-major tile IDs; count must equal rows times columns",
    )
    parser.add_argument(
        "--output-dir", required=True, type=Path, help="destination directory"
    )
    parser.add_argument(
        "--atlas-columns",
        type=positive_int,
        help="output atlas columns (defaults to source grid columns)",
    )
    parser.add_argument(
        "--alpha-threshold",
        type=alpha_threshold,
        default=0,
        help="crop to pixels with alpha greater than this value (default: 0)",
    )
    parser.add_argument(
        "--atlas-name", type=filename, default="atlas.png", help="atlas PNG filename"
    )
    parser.add_argument(
        "--manifest-name",
        type=filename,
        default="atlas-manifest.json",
        help="JSON manifest filename",
    )
    parser.add_argument(
        "--overwrite", action="store_true", help="replace matching output files"
    )
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        tile_count = args.rows * args.columns
        labels = validate_labels(args.labels, tile_count)
        atlas_columns = args.atlas_columns or args.columns
        if atlas_columns > tile_count:
            raise BuildError(
                f"atlas columns ({atlas_columns}) cannot exceed tile count ({tile_count})"
            )
        if Path(args.atlas_name).suffix.lower() != ".png":
            raise BuildError("atlas filename must use a .png suffix")
        if Path(args.manifest_name).suffix.lower() != ".json":
            raise BuildError("manifest filename must use a .json suffix")
        source_path = args.source.expanduser().resolve()
        # Reject a symlink at the requested root, then use one physical root for
        # every write and manifest-relative path. Ancestor aliases such as
        # macOS /var -> /private/var cannot leak a second lexical identity.
        requested_output_dir = Path(os.path.abspath(args.output_dir.expanduser()))
        if requested_output_dir.is_symlink():
            raise BuildError(
                f"output directory must not be a symlink: {requested_output_dir}"
            )
        output_dir = requested_output_dir.resolve(strict=False)
        source_image = open_source(source_path)
        prepared = prepare_tiles(
            source_image,
            rows=args.rows,
            columns=args.columns,
            labels=labels,
            threshold=args.alpha_threshold,
        )
        assert_output_targets(
            output_dir,
            source_path=source_path,
            labels=labels,
            atlas_name=args.atlas_name,
            manifest_name=args.manifest_name,
            overwrite=args.overwrite,
        )
        manifest = build_outputs(
            source_path=source_path,
            source_image=source_image,
            prepared=prepared,
            output_dir=output_dir,
            rows=args.rows,
            columns=args.columns,
            atlas_columns=atlas_columns,
            threshold=args.alpha_threshold,
            atlas_name=args.atlas_name,
            manifest_name=args.manifest_name,
            overwrite=args.overwrite,
        )
    except (BuildError, OSError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    print(
        json.dumps(
            {
                "status": "ok",
                "atlas": str(output_dir / args.atlas_name),
                "manifest": str(output_dir / args.manifest_name),
                "tiles": len(manifest["tiles"]),
            },
            ensure_ascii=False,
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
