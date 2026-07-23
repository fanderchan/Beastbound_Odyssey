#!/usr/bin/env python3
"""Extract independent RGBA objects from a regular alpha sprite sheet.

Every grid cell is cropped to its visible alpha bounds, optionally reduced to
fit a maximum output dimension, surrounded by transparent padding, and written
as an independent PNG. The script never creates an atlas. A JSON manifest
records the source grid coordinates, source-space alpha bounds, dimensions,
anchor, and SHA-256 digest for every object.

The command is deliberately fail-closed: it rejects non-RGBA sources, invalid
or duplicate labels, empty cells, visible alpha touching a source-cell edge,
unsafe output paths, and existing outputs.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
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


LABEL_RE = re.compile(r"^[a-z0-9][a-z0-9_-]*$")
DEFAULT_PADDING = 8
DEFAULT_MAX_DIMENSION = 256
DEFAULT_ANCHOR = (0.5, 1.0)


class ExtractError(ValueError):
    """Raised when the source or requested output violates the contract."""


@dataclass(frozen=True)
class ExtractedObject:
    """One prepared object and its immutable source provenance."""

    label: str
    row: int
    column: int
    source_cell: tuple[int, int, int, int]
    source_bbox: tuple[int, int, int, int]
    source_cell_edges_touched: tuple[str, ...]
    image: Image.Image


def positive_int(value: str) -> int:
    """Parse an integer greater than zero for argparse."""

    try:
        parsed = int(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("must be an integer") from exc
    if parsed <= 0:
        raise argparse.ArgumentTypeError("must be greater than zero")
    return parsed


def nonnegative_int(value: str) -> int:
    """Parse an integer greater than or equal to zero for argparse."""

    try:
        parsed = int(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("must be an integer") from exc
    if parsed < 0:
        raise argparse.ArgumentTypeError("must be zero or greater")
    return parsed


def alpha_threshold(value: str) -> int:
    """Parse an alpha threshold while leaving at least one visible value."""

    try:
        parsed = int(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("must be an integer") from exc
    if not 0 <= parsed <= 254:
        raise argparse.ArgumentTypeError("must be between 0 and 254")
    return parsed


def unit_float(value: str) -> float:
    """Parse a finite normalized coordinate for argparse."""

    try:
        parsed = float(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("must be a number") from exc
    if not math.isfinite(parsed) or not 0.0 <= parsed <= 1.0:
        raise argparse.ArgumentTypeError("must be a finite number between 0 and 1")
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
    """Validate row-major object labels."""

    if len(labels) != expected_count:
        raise ExtractError(
            f"expected exactly {expected_count} labels for the source grid, "
            f"received {len(labels)}"
        )
    normalized = list(labels)
    invalid = [label for label in normalized if not LABEL_RE.fullmatch(label)]
    if invalid:
        raise ExtractError(
            "labels must match [a-z0-9][a-z0-9_-]*; invalid: "
            + ", ".join(repr(label) for label in invalid)
        )
    seen: set[str] = set()
    duplicates: set[str] = set()
    for label in normalized:
        if label in seen:
            duplicates.add(label)
        seen.add(label)
    if duplicates:
        raise ExtractError(
            "labels must be unique; duplicates: " + ", ".join(sorted(duplicates))
        )
    return normalized


def open_source(path: Path) -> Image.Image:
    """Open and fully decode a true RGBA PNG without implicit conversion."""

    if not path.exists():
        raise ExtractError(f"source image does not exist: {path}")
    if not path.is_file():
        raise ExtractError(f"source image is not a regular file: {path}")
    try:
        with Image.open(path) as opened:
            opened.load()
            if opened.format != "PNG":
                raise ExtractError(
                    f"source image must be PNG, decoded format is {opened.format!r}"
                )
            if opened.mode != "RGBA":
                raise ExtractError(
                    "source PNG must use exact RGBA mode; "
                    f"decoded mode is {opened.mode!r}"
                )
            return opened.copy()
    except (OSError, UnidentifiedImageError) as exc:
        raise ExtractError(f"source image cannot be decoded: {exc}") from exc


def _resize_to_fit(
    image: Image.Image,
    *,
    content_limit: int,
) -> Image.Image:
    """Downsample to fit using premultiplied-alpha Lanczos; never upscale."""

    width, height = image.size
    largest = max(width, height)
    if largest <= content_limit:
        return image
    scale = content_limit / largest
    resized_width = max(1, min(content_limit, int(round(width * scale))))
    resized_height = max(1, min(content_limit, int(round(height * scale))))
    return (
        image.convert("RGBa")
        .resize((resized_width, resized_height), Image.Resampling.LANCZOS)
        .convert("RGBA")
    )


def extract_objects(
    source: Image.Image,
    *,
    rows: int,
    columns: int,
    labels: Sequence[str],
    padding: int,
    max_dimension: int,
    threshold: int,
    allow_cell_edge_touch: bool,
) -> list[ExtractedObject]:
    """Crop, cap, and pad every grid cell in row-major label order."""

    source_width, source_height = source.size
    if source_width % columns != 0 or source_height % rows != 0:
        raise ExtractError(
            f"source dimensions {source_width}x{source_height} are not evenly "
            f"divisible by the declared {rows}x{columns} grid"
        )
    cell_width = source_width // columns
    cell_height = source_height // rows
    if cell_width <= 0 or cell_height <= 0:
        raise ExtractError("source grid produces an empty cell")

    content_limit = max_dimension - (padding * 2)
    if content_limit <= 0:
        raise ExtractError(
            f"max dimension {max_dimension} must exceed twice the padding "
            f"({padding * 2})"
        )

    extracted: list[ExtractedObject] = []
    for index, label in enumerate(labels):
        row, column = divmod(index, columns)
        cell_left = column * cell_width
        cell_top = row * cell_height
        cell_rect = (
            cell_left,
            cell_top,
            cell_left + cell_width,
            cell_top + cell_height,
        )
        cell = source.crop(cell_rect)
        alpha = cell.getchannel("A")
        visible_mask = alpha.point(lambda value: 255 if value > threshold else 0)
        local_bbox = visible_mask.getbbox()
        if local_bbox is None:
            raise ExtractError(
                f"object {label!r} at row {row}, column {column} contains no "
                f"pixels above alpha threshold {threshold}"
            )

        touched_edges: list[str] = []
        if local_bbox[0] == 0:
            touched_edges.append("left")
        if local_bbox[1] == 0:
            touched_edges.append("top")
        if local_bbox[2] == cell_width:
            touched_edges.append("right")
        if local_bbox[3] == cell_height:
            touched_edges.append("bottom")
        if touched_edges and not allow_cell_edge_touch:
            raise ExtractError(
                f"object {label!r} at row {row}, column {column} has visible "
                "alpha touching source-cell edge(s): "
                + ", ".join(touched_edges)
                + "; separate the object from the cell boundary or pass "
                "--allow-cell-edge-touch to record an explicit override"
            )

        visible = cell.crop(local_bbox)
        visible = _resize_to_fit(visible, content_limit=content_limit)
        padded = Image.new(
            "RGBA",
            (visible.width + padding * 2, visible.height + padding * 2),
            (0, 0, 0, 0),
        )
        padded.alpha_composite(visible, (padding, padding))
        if max(padded.size) > max_dimension:
            raise ExtractError(
                f"internal size error for {label!r}: output {padded.size} exceeds "
                f"maximum dimension {max_dimension}"
            )

        source_bbox = (
            cell_left + local_bbox[0],
            cell_top + local_bbox[1],
            local_bbox[2] - local_bbox[0],
            local_bbox[3] - local_bbox[1],
        )
        extracted.append(
            ExtractedObject(
                label=label,
                row=row,
                column=column,
                source_cell=(cell_left, cell_top, cell_width, cell_height),
                source_bbox=source_bbox,
                source_cell_edges_touched=tuple(touched_edges),
                image=padded,
            )
        )
    return extracted


def assert_output_targets(
    output_dir: Path,
    *,
    source_path: Path,
    labels: Sequence[str],
    manifest_name: str,
) -> list[Path]:
    """Reject unsafe, colliding, or existing output targets before writing."""

    if not output_dir.is_absolute():
        raise ExtractError(f"output directory must be absolute: {output_dir}")
    if output_dir.is_symlink():
        raise ExtractError(f"output directory must not be a symlink: {output_dir}")
    if output_dir.exists() and not output_dir.is_dir():
        raise ExtractError(f"output path exists and is not a directory: {output_dir}")
    targets = [output_dir / f"{label}.png" for label in labels]
    targets.append(output_dir / manifest_name)

    source_resolved = source_path.resolve(strict=True)
    resolved_root = output_dir.resolve(strict=False)
    resolved_targets: list[Path] = []
    for target in targets:
        if target.parent.is_symlink():
            raise ExtractError(
                f"output target parent must not be a symlink: {target.parent}"
            )
        if target.is_symlink():
            raise ExtractError(f"output target must not be a symlink: {target}")
        resolved_target = target.resolve(strict=False)
        try:
            lexical_common = Path(os.path.commonpath((str(output_dir), str(target))))
            resolved_common = Path(
                os.path.commonpath((str(resolved_root), str(resolved_target)))
            )
        except ValueError as exc:
            raise ExtractError(
                f"output target is outside the output directory: {target}"
            ) from exc
        if lexical_common != output_dir or resolved_common != resolved_root:
            raise ExtractError(
                f"output target is outside the output directory: {target}"
            )
        resolved_targets.append(resolved_target)
    if source_resolved in resolved_targets:
        raise ExtractError("an output target would overwrite the source image")
    if len(set(resolved_targets)) != len(resolved_targets):
        collisions = sorted(
            str(target)
            for target in set(resolved_targets)
            if resolved_targets.count(target) > 1
        )
        raise ExtractError("output targets collide: " + ", ".join(collisions))

    existing = [str(target) for target in targets if target.exists()]
    if existing:
        raise ExtractError(
            "output files already exist; refusing to overwrite: "
            + ", ".join(existing)
        )
    invalid_targets = [str(target) for target in targets if target.exists() and target.is_dir()]
    if invalid_targets:
        raise ExtractError("output target is a directory: " + ", ".join(invalid_targets))
    return targets


def save_png(image: Image.Image, path: Path) -> None:
    """Write a deterministic true-RGBA PNG."""

    if image.mode != "RGBA":
        raise ExtractError(f"internal image for {path.name!r} is not RGBA")
    image.save(path, format="PNG", optimize=False, compress_level=9)


def write_outputs(
    *,
    source_path: Path,
    source_image: Image.Image,
    objects: Sequence[ExtractedObject],
    output_dir: Path,
    rows: int,
    columns: int,
    padding: int,
    max_dimension: int,
    threshold: int,
    allow_cell_edge_touch: bool,
    anchor: tuple[float, float],
    manifest_name: str,
) -> dict[str, object]:
    """Build in a sibling temporary directory and publish the manifest last."""

    parent = output_dir.parent
    parent.mkdir(parents=True, exist_ok=True)
    source_reference = Path(os.path.relpath(source_path, output_dir)).as_posix()

    with tempfile.TemporaryDirectory(prefix=".object-sheet-extract-", dir=parent) as raw_tmp:
        temp_dir = Path(raw_tmp)
        object_entries: list[dict[str, object]] = []
        for item in objects:
            output_name = f"{item.label}.png"
            temp_path = temp_dir / output_name
            save_png(item.image, temp_path)
            object_entries.append(
                {
                    "label": item.label,
                    "path": output_name,
                    "sourceGrid": [item.row, item.column],
                    "sourceCell": list(item.source_cell),
                    "sourceBbox": list(item.source_bbox),
                    "sourceCellEdgesTouched": list(item.source_cell_edges_touched),
                    "dimensions": [item.image.width, item.image.height],
                    "anchor": [anchor[0], anchor[1]],
                    "sha256": sha256(temp_path),
                }
            )

        manifest: dict[str, object] = {
            "schemaVersion": 1,
            "source": {
                "path": source_reference,
                "dimensions": [source_image.width, source_image.height],
                "sha256": sha256(source_path),
                "grid": {"rows": rows, "columns": columns},
                "alphaThreshold": threshold,
            },
            "padding": padding,
            "maxDimension": max_dimension,
            "cellEdgePolicy": {
                "visibleAlphaMustBeInsideCell": not allow_cell_edge_touch,
                "overrideUsed": allow_cell_edge_touch,
                "overrideFlag": (
                    "--allow-cell-edge-touch" if allow_cell_edge_touch else ""
                ),
            },
            "defaultAnchor": [anchor[0], anchor[1]],
            "objects": object_entries,
        }
        temp_manifest_path = temp_dir / manifest_name
        temp_manifest_path.write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )

        # Repeat the no-overwrite check immediately before publication to catch
        # files created after the initial preflight. Individual PNGs become
        # visible first; the manifest is the completion marker and is last.
        output_dir.mkdir(parents=True, exist_ok=True)
        assert_output_targets(
            output_dir,
            source_path=source_path,
            labels=[item.label for item in objects],
            manifest_name=manifest_name,
        )
        for item in objects:
            os.replace(temp_dir / f"{item.label}.png", output_dir / f"{item.label}.png")
        os.replace(temp_manifest_path, output_dir / manifest_name)

    return manifest


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Split a regular RGBA object sheet, alpha-crop and pad each cell, "
            "cap outputs while preserving aspect ratio, and write independent "
            "PNGs plus a SHA-256 manifest. No atlas is generated."
        )
    )
    parser.add_argument("source", type=Path, help="exact-RGBA source PNG")
    parser.add_argument("--rows", required=True, type=positive_int, help="source rows")
    parser.add_argument(
        "--columns", required=True, type=positive_int, help="source columns"
    )
    parser.add_argument(
        "--labels",
        required=True,
        nargs="+",
        metavar="ID",
        help="unique row-major object IDs; count must equal rows times columns",
    )
    parser.add_argument(
        "--output-dir", required=True, type=Path, help="destination directory"
    )
    parser.add_argument(
        "--padding",
        type=nonnegative_int,
        default=DEFAULT_PADDING,
        help=f"transparent pixels added on every side (default: {DEFAULT_PADDING})",
    )
    parser.add_argument(
        "--max-dimension",
        type=positive_int,
        default=DEFAULT_MAX_DIMENSION,
        help=(
            "maximum final width or height including padding; large objects are "
            f"downsampled with premultiplied-alpha Lanczos (default: {DEFAULT_MAX_DIMENSION})"
        ),
    )
    parser.add_argument(
        "--alpha-threshold",
        type=alpha_threshold,
        default=0,
        help="crop to pixels with alpha greater than this value (default: 0)",
    )
    parser.add_argument(
        "--allow-cell-edge-touch",
        action="store_true",
        help=(
            "explicitly allow visible alpha to touch a source-cell boundary; "
            "the override and touched edges are recorded in the manifest"
        ),
    )
    parser.add_argument(
        "--anchor",
        nargs=2,
        type=unit_float,
        default=list(DEFAULT_ANCHOR),
        metavar=("X", "Y"),
        help="normalized object anchor (default: bottom-center, 0.5 1.0)",
    )
    parser.add_argument(
        "--manifest-name",
        type=filename,
        default="objects-manifest.json",
        help="JSON manifest filename (default: objects-manifest.json)",
    )
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        labels = validate_labels(args.labels, args.rows * args.columns)
        if Path(args.manifest_name).suffix.lower() != ".json":
            raise ExtractError("manifest filename must use a .json suffix")
        source_path = args.source.expanduser().resolve()
        requested_output_dir = Path(os.path.abspath(args.output_dir.expanduser()))
        if requested_output_dir.is_symlink():
            raise ExtractError(
                f"output directory must not be a symlink: {requested_output_dir}"
            )
        output_dir = requested_output_dir.resolve(strict=False)
        source_image = open_source(source_path)
        objects = extract_objects(
            source_image,
            rows=args.rows,
            columns=args.columns,
            labels=labels,
            padding=args.padding,
            max_dimension=args.max_dimension,
            threshold=args.alpha_threshold,
            allow_cell_edge_touch=args.allow_cell_edge_touch,
        )
        assert_output_targets(
            output_dir,
            source_path=source_path,
            labels=labels,
            manifest_name=args.manifest_name,
        )
        anchor = (float(args.anchor[0]), float(args.anchor[1]))
        manifest = write_outputs(
            source_path=source_path,
            source_image=source_image,
            objects=objects,
            output_dir=output_dir,
            rows=args.rows,
            columns=args.columns,
            padding=args.padding,
            max_dimension=args.max_dimension,
            threshold=args.alpha_threshold,
            allow_cell_edge_touch=args.allow_cell_edge_touch,
            anchor=anchor,
            manifest_name=args.manifest_name,
        )
    except (ExtractError, OSError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    print(
        json.dumps(
            {
                "status": "ok",
                "manifest": str(output_dir / args.manifest_name),
                "objects": len(manifest["objects"]),
            },
            ensure_ascii=False,
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
