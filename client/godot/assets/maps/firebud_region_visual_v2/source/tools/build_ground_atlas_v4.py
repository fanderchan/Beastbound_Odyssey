#!/usr/bin/env python3
"""Build the Firebud v2 layered 12-, 27-, or 42-tile ground atlas deterministically.

The generated 2x2 material source supplies quiet grass, clay, flagstone, and
root-soil surfaces. The existing generated semantic sheet supplies the tall
grass and warp identities. Base meadow tiles use a small same-material bleed
to prevent raster seams. Semantic tiles use a feathered alpha matte so Godot
can draw them over the meadow base without exposing the grid as hard diamonds.
An optional generated 4x4 transition sheet adds all fifteen non-empty exposed
edge combinations for the path without changing the frozen 12-tile build when
the input is absent. A second 4x4 sheet does the same for exposed plaza edges.
Cell 16 is intentionally transparent and proves the exact row-major contract.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import tempfile
from pathlib import Path

from PIL import (
    Image,
    ImageChops,
    ImageEnhance,
    ImageFilter,
    ImageOps,
    ImageStat,
    __version__ as PILLOW_VERSION,
)


SCRIPT_VERSION = "2.1.0"
TILE_SIZE = (80, 40)
ATLAS_COLUMNS = 4
AUTOTILE_GRID_SIZE = 4
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
TILE_ORDER = (
    "firebud_meadow_a",
    "firebud_ochre_path_a",
    "firebud_honey_stone_a",
    "firebud_dark_root_soil_a",
    "firebud_meadow_b",
    "firebud_meadow_dry_b",
    "firebud_meadow_clover_c",
    "firebud_meadow_far",
    "firebud_ochre_path_worn_b",
    "firebud_honey_stone_moss_b",
    "firebud_tall_grass_encounter",
    "firebud_warp_stone",
)
TRANSITION_TILE_ORDER = tuple(
    f"firebud_ochre_path_edge_{signature}" for signature in AUTOTILE_SIGNATURES
)
PLAZA_TRANSITION_TILE_ORDER = tuple(
    f"firebud_honey_stone_edge_{signature}" for signature in AUTOTILE_SIGNATURES
)


class BuildError(ValueError):
    """Raised when an input or output violates the frozen build contract."""


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def portable_path(path: Path) -> str:
    """Prefer a repository-relative path while retaining external diagnostics."""

    try:
        return path.relative_to(Path.cwd().resolve()).as_posix()
    except ValueError:
        return str(path)


def open_rgba(path: Path, label: str) -> Image.Image:
    if not path.is_file():
        raise BuildError(f"{label} does not exist: {path}")
    with Image.open(path) as opened:
        opened.load()
        if opened.format != "PNG":
            raise BuildError(f"{label} must be PNG, got {opened.format!r}")
        if opened.width < 512 or opened.height < 512:
            raise BuildError(f"{label} is too small: {opened.width}x{opened.height}")
        return opened.convert("RGBA")


def quadrant(image: Image.Image, column: int, row: int) -> Image.Image:
    left = image.width * column // 2
    top = image.height * row // 2
    right = image.width * (column + 1) // 2
    bottom = image.height * (row + 1) // 2
    return image.crop((left, top, right, bottom))


def autotile_cell(image: Image.Image, column: int, row: int) -> Image.Image:
    if image.width != image.height:
        raise BuildError(
            f"autotile sheet must be square, got {image.width}x{image.height}"
        )
    if image.width % AUTOTILE_GRID_SIZE != 0:
        raise BuildError(
            f"autotile sheet size must divide by {AUTOTILE_GRID_SIZE}, "
            f"got {image.width}x{image.height}"
        )
    cell_size = image.width // AUTOTILE_GRID_SIZE
    left = column * cell_size
    top = row * cell_size
    return image.crop((left, top, left + cell_size, top + cell_size))


def validate_autotile_sheet(image: Image.Image, label: str) -> None:
    if image.width != image.height or image.width % AUTOTILE_GRID_SIZE != 0:
        raise BuildError(
            f"{label} must be a square {AUTOTILE_GRID_SIZE}x{AUTOTILE_GRID_SIZE} sheet"
        )
    for index in range(AUTOTILE_GRID_SIZE * AUTOTILE_GRID_SIZE):
        row, column = divmod(index, AUTOTILE_GRID_SIZE)
        cell = autotile_cell(image, column, row)
        alpha_bbox = cell.getchannel("A").getbbox()
        if index == len(AUTOTILE_SIGNATURES):
            if alpha_bbox is not None:
                raise BuildError(f"{label} row 4 column 4 must be transparent")
            continue
        if alpha_bbox is None:
            raise BuildError(f"{label} cell {column},{row} has no visible alpha")
        left, top, right, bottom = alpha_bbox
        if left <= 0 or top <= 0 or right >= cell.width or bottom >= cell.height:
            raise BuildError(f"{label} cell {column},{row} touches a cell edge")


def centered_crop(
    image: Image.Image,
    offset_x: int,
    offset_y: int,
    crop_margin: int,
) -> Image.Image:
    crop_size = min(image.width, image.height) - crop_margin
    if crop_size < 256:
        raise BuildError("material quadrant does not permit the frozen safe crop")
    travel_x = image.width - crop_size
    travel_y = image.height - crop_size
    left = max(0, min(travel_x, travel_x // 2 + offset_x))
    top = max(0, min(travel_y, travel_y // 2 + offset_y))
    return image.crop((left, top, left + crop_size, top + crop_size))


def tint(image: Image.Image, color: tuple[int, int, int], amount: float) -> Image.Image:
    alpha = image.getchannel("A")
    rgb = image.convert("RGB")
    wash = Image.new("RGB", image.size, color)
    result = Image.blend(rgb, wash, amount).convert("RGBA")
    result.putalpha(alpha)
    return result


def recolor_luminance(
    image: Image.Image,
    dark: tuple[int, int, int],
    light: tuple[int, int, int],
    amount: float,
) -> Image.Image:
    alpha = image.getchannel("A")
    rgb = image.convert("RGB")
    graded = ImageOps.colorize(ImageOps.grayscale(rgb), black=dark, white=light)
    result = Image.blend(rgb, graded, amount).convert("RGBA")
    result.putalpha(alpha)
    return result


def diamond_mask(*, overlay: bool) -> Image.Image:
    width, height = TILE_SIZE
    mask = Image.new("L", TILE_SIZE, 0)
    pixels = mask.load()
    for y in range(height):
        for x in range(width):
            distance = abs((x + 0.5 - width / 2.0) / (width / 2.0)) + abs(
                (y + 0.5 - height / 2.0) / (height / 2.0)
            )
            if overlay:
                if distance <= 0.82:
                    alpha = 238
                elif distance <= 1.06:
                    alpha = round(238.0 - (distance - 0.82) / 0.24 * 42.0)
                elif distance >= 1.18:
                    alpha = 0
                else:
                    alpha = round(196.0 * (1.18 - distance) / 0.12)
            else:
                if distance <= 1.12:
                    alpha = 255
                elif distance >= 1.22:
                    alpha = 0
                else:
                    alpha = round(255.0 * (1.22 - distance) / 0.10)
            pixels[x, y] = max(0, min(255, alpha))
    return mask


def connected_surface_mask() -> Image.Image:
    """Keep connected road cells opaque while retaining a short outer matte."""

    width, height = TILE_SIZE
    mask = Image.new("L", TILE_SIZE, 0)
    pixels = mask.load()
    for y in range(height):
        for x in range(width):
            distance = abs((x + 0.5 - width / 2.0) / (width / 2.0)) + abs(
                (y + 0.5 - height / 2.0) / (height / 2.0)
            )
            if distance <= 1.04:
                alpha = 255
            elif distance >= 1.14:
                alpha = 0
            else:
                alpha = round(255.0 * (1.14 - distance) / 0.10)
            pixels[x, y] = max(0, min(255, alpha))
    return mask


def material_tile(
    source: Image.Image,
    *,
    offset: tuple[int, int] = (0, 0),
    color_tint: tuple[tuple[int, int, int], float] | None = None,
    contrast: float = 1.0,
    brightness: float = 1.0,
    luminance_palette: (
        tuple[tuple[int, int, int], tuple[int, int, int], float] | None
    ) = None,
    crop_margin: int = 96,
    overlay: bool,
    opacity: float = 1.0,
) -> Image.Image:
    crop = centered_crop(source, offset[0], offset[1], crop_margin)
    tile = crop.resize(TILE_SIZE, Image.Resampling.LANCZOS)
    if contrast != 1.0:
        tile = ImageEnhance.Contrast(tile).enhance(contrast)
    if brightness != 1.0:
        tile = ImageEnhance.Brightness(tile).enhance(brightness)
    if luminance_palette is not None:
        tile = recolor_luminance(
            tile,
            luminance_palette[0],
            luminance_palette[1],
            luminance_palette[2],
        )
    if color_tint is not None:
        tile = tint(tile, color_tint[0], color_tint[1])
    if not 0.0 < opacity <= 1.0:
        raise BuildError("tile opacity must be within (0, 1]")
    mask = diamond_mask(overlay=overlay)
    if opacity != 1.0:
        mask = mask.point(lambda value: round(value * opacity))
    tile.putalpha(mask)
    return tile


def semantic_tile(
    source: Image.Image,
    *,
    column: int,
    row: int,
    color_tint: tuple[int, int, int],
    tint_amount: float,
    saturation: float,
    brightness: float,
) -> Image.Image:
    cell = quadrant(source, column, row)
    alpha_bbox = cell.getchannel("A").getbbox()
    if alpha_bbox is None:
        raise BuildError(f"semantic cell {column},{row} has no visible alpha")
    tile = cell.crop(alpha_bbox).convert("RGBa").resize(
        TILE_SIZE, Image.Resampling.LANCZOS
    ).convert("RGBA")
    alpha = tile.getchannel("A")
    tile = ImageEnhance.Color(tile).enhance(saturation)
    tile = ImageEnhance.Brightness(tile).enhance(brightness)
    tile = tint(tile, color_tint, tint_amount)
    combined_alpha = Image.new("L", TILE_SIZE, 0)
    semantic_pixels = alpha.load()
    feather_pixels = diamond_mask(overlay=True).load()
    combined_pixels = combined_alpha.load()
    for y in range(TILE_SIZE[1]):
        for x in range(TILE_SIZE[0]):
            combined_pixels[x, y] = min(semantic_pixels[x, y], feather_pixels[x, y])
    tile.putalpha(combined_alpha)
    return tile


def _hue_band_mask(image: Image.Image) -> Image.Image:
    """Select generated yellow/green grass while excluding ochre path pixels."""

    hue, saturation, _value = image.convert("RGB").convert("HSV").split()
    hue_mask = hue.point(
        lambda value: (
            0
            if value < 28 or value > 112
            else min(255, (value - 28) * 24)
            if value < 39
            else min(255, (112 - value) * 14)
            if value > 94
            else 255
        )
    )
    saturation_mask = saturation.point(
        lambda value: 0 if value <= 22 else min(255, (value - 22) * 7)
    )
    return ImageChops.multiply(hue_mask, saturation_mask).filter(
        ImageFilter.GaussianBlur(radius=0.8)
    )


def _expanded_grass_mask(image: Image.Image) -> Image.Image:
    # Preserve the generated irregular boundary at the 80x40 runtime size without
    # turning its larger meadow bays into repeated dark sawteeth.  A one-pixel
    # expansion keeps thin grass cues alive; the wider feather then softens the
    # colour hand-off while leaving the connected surface alpha contract intact.
    return _hue_band_mask(image).filter(ImageFilter.MaxFilter(size=3)).filter(
        ImageFilter.GaussianBlur(radius=1.4)
    )


def path_transition_tile(source: Image.Image, *, column: int, row: int) -> Image.Image:
    """Normalize one generated directional path tile into the Firebud palette."""

    cell = autotile_cell(source, column, row)
    alpha_bbox = cell.getchannel("A").getbbox()
    if alpha_bbox is None:
        raise BuildError(f"path transition cell {column},{row} has no visible alpha")
    tile = cell.crop(alpha_bbox).convert("RGBa").resize(
        TILE_SIZE, Image.Resampling.LANCZOS
    ).convert("RGBA")
    source_alpha = tile.getchannel("A")
    tile = ImageEnhance.Color(tile).enhance(0.76)
    tile = ImageEnhance.Brightness(tile).enhance(0.78)
    grass_mask = _expanded_grass_mask(tile)
    path_grade = recolor_luminance(
        tile,
        (78, 46, 31),
        (197, 132, 78),
        0.90,
    )
    grass_grade = recolor_luminance(
        tile,
        (32, 50, 38),
        (125, 147, 91),
        0.96,
    )
    graded = Image.composite(grass_grade, path_grade, grass_mask)
    graded.putalpha(ImageChops.darker(source_alpha, connected_surface_mask()))
    return graded


def plaza_transition_tile(source: Image.Image, *, column: int, row: int) -> Image.Image:
    """Normalize one generated directional plaza tile into the Firebud palette."""

    cell = autotile_cell(source, column, row)
    alpha_bbox = cell.getchannel("A").getbbox()
    if alpha_bbox is None:
        raise BuildError(f"plaza transition cell {column},{row} has no visible alpha")
    tile = cell.crop(alpha_bbox).convert("RGBa").resize(
        TILE_SIZE, Image.Resampling.LANCZOS
    ).convert("RGBA")
    source_alpha = tile.getchannel("A")
    tile = ImageEnhance.Color(tile).enhance(0.72)
    tile = ImageEnhance.Brightness(tile).enhance(0.80)
    grass_mask = _expanded_grass_mask(tile)
    stone_grade = recolor_luminance(
        tile,
        (73, 66, 49),
        (199, 182, 126),
        0.90,
    )
    grass_grade = recolor_luminance(
        tile,
        (32, 50, 38),
        (125, 147, 91),
        0.96,
    )
    graded = Image.composite(grass_grade, stone_grade, grass_mask)
    graded.putalpha(ImageChops.darker(source_alpha, connected_surface_mask()))
    return graded


def alpha_stats(image: Image.Image) -> dict[str, int]:
    alpha = image.getchannel("A")
    histogram = alpha.histogram()
    return {
        "transparentPixels": histogram[0],
        "opaquePixels": histogram[255],
        "partialAlphaPixels": sum(histogram[1:255]),
    }


def build_tiles(
    materials: Image.Image,
    semantics: Image.Image,
    transitions: Image.Image | None = None,
    plaza_transitions: Image.Image | None = None,
) -> dict[str, Image.Image]:
    meadow = quadrant(materials, 0, 0)
    clay = quadrant(materials, 1, 0)
    stone = quadrant(materials, 0, 1)
    soil = quadrant(materials, 1, 1)

    tiles = {
        "firebud_meadow_a": material_tile(
            meadow,
            offset=(-22, -18),
            contrast=0.82,
            brightness=0.95,
            luminance_palette=((40, 60, 44), (145, 166, 105), 0.88),
            overlay=False,
        ),
        "firebud_ochre_path_a": material_tile(
            clay,
            offset=(-18, 14),
            contrast=0.98,
            brightness=0.90,
            luminance_palette=((78, 46, 31), (197, 132, 78), 0.84),
            crop_margin=260,
            overlay=True,
        ),
        "firebud_honey_stone_a": material_tile(
            stone,
            offset=(16, -14),
            contrast=0.92,
            brightness=0.89,
            luminance_palette=((73, 66, 49), (199, 182, 126), 0.80),
            crop_margin=190,
            overlay=True,
        ),
        "firebud_dark_root_soil_a": material_tile(
            soil,
            offset=(12, 18),
            contrast=0.78,
            brightness=0.94,
            luminance_palette=((72, 55, 43), (151, 116, 82), 0.62),
            crop_margin=170,
            overlay=True,
            opacity=0.32,
        ),
        "firebud_meadow_b": material_tile(
            meadow,
            offset=(24, -8),
            contrast=0.82,
            brightness=0.95,
            luminance_palette=((40, 60, 44), (145, 166, 105), 0.88),
            overlay=False,
        ),
        "firebud_meadow_dry_b": material_tile(
            meadow,
            offset=(-8, 24),
            contrast=0.82,
            brightness=0.95,
            luminance_palette=((42, 60, 43), (147, 164, 102), 0.88),
            overlay=False,
        ),
        "firebud_meadow_clover_c": material_tile(
            meadow,
            offset=(22, 22),
            contrast=0.82,
            brightness=0.95,
            luminance_palette=((38, 60, 45), (141, 168, 106), 0.88),
            overlay=False,
        ),
        "firebud_meadow_far": material_tile(
            meadow,
            offset=(0, 0),
            contrast=0.72,
            brightness=0.85,
            luminance_palette=((32, 48, 38), (111, 132, 85), 0.92),
            overlay=False,
        ).filter(ImageFilter.GaussianBlur(radius=0.55)),
        "firebud_ochre_path_worn_b": material_tile(
            clay,
            offset=(22, -16),
            contrast=0.95,
            brightness=0.90,
            luminance_palette=((79, 47, 32), (196, 131, 78), 0.84),
            crop_margin=260,
            overlay=True,
        ),
        "firebud_honey_stone_moss_b": material_tile(
            stone,
            offset=(-20, 18),
            contrast=0.90,
            brightness=0.89,
            luminance_palette=((74, 67, 50), (197, 180, 124), 0.80),
            crop_margin=190,
            overlay=True,
        ),
        "firebud_tall_grass_encounter": semantic_tile(
            semantics,
            column=0,
            row=1,
            color_tint=(62, 91, 43),
            tint_amount=0.42,
            saturation=0.72,
            brightness=0.76,
        ),
        "firebud_warp_stone": semantic_tile(
            semantics,
            column=1,
            row=1,
            color_tint=(164, 135, 78),
            tint_amount=0.24,
            saturation=0.64,
            brightness=0.78,
        ),
    }
    if transitions is not None:
        validate_autotile_sheet(transitions, "path transition source")
        for tile_id in (
            "firebud_ochre_path_a",
            "firebud_ochre_path_worn_b",
        ):
            tiles[tile_id].putalpha(connected_surface_mask())
        for index, tile_id in enumerate(TRANSITION_TILE_ORDER):
            row, column = divmod(index, AUTOTILE_GRID_SIZE)
            tiles[tile_id] = path_transition_tile(
                transitions,
                column=column,
                row=row,
            )
    if plaza_transitions is not None:
        validate_autotile_sheet(plaza_transitions, "plaza transition source")
        for tile_id in (
            "firebud_honey_stone_a",
            "firebud_honey_stone_moss_b",
        ):
            tiles[tile_id].putalpha(connected_surface_mask())
        for index, tile_id in enumerate(PLAZA_TRANSITION_TILE_ORDER):
            row, column = divmod(index, AUTOTILE_GRID_SIZE)
            tiles[tile_id] = plaza_transition_tile(
                plaza_transitions,
                column=column,
                row=row,
            )
    expected_order = (
        TILE_ORDER
        + (TRANSITION_TILE_ORDER if transitions is not None else ())
        + (PLAZA_TRANSITION_TILE_ORDER if plaza_transitions is not None else ())
    )
    if tuple(tiles) != expected_order:
        raise BuildError("internal tile order drifted from the runtime contract")
    return tiles


def save_png_atomic(image: Image.Image, destination: Path, overwrite: bool) -> None:
    if destination.exists() and not overwrite:
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


def write_json_atomic(payload: dict, destination: Path, overwrite: bool) -> None:
    if destination.exists() and not overwrite:
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
    materials_path = args.materials.resolve()
    semantics_path = args.semantics.resolve()
    transitions_argument = getattr(args, "transitions", None)
    transitions_path = (
        transitions_argument.resolve() if transitions_argument is not None else None
    )
    plaza_transitions_argument = getattr(args, "plaza_transitions", None)
    plaza_transitions_path = (
        plaza_transitions_argument.resolve()
        if plaza_transitions_argument is not None
        else None
    )
    output_path = args.output.resolve()
    manifest_path = args.manifest.resolve()
    if output_path == manifest_path:
        raise BuildError("atlas output and manifest must be different paths")

    materials = open_rgba(materials_path, "materials source")
    semantics = open_rgba(semantics_path, "semantic source")
    transitions = (
        open_rgba(transitions_path, "path transition source")
        if transitions_path is not None
        else None
    )
    plaza_transitions = (
        open_rgba(plaza_transitions_path, "plaza transition source")
        if plaza_transitions_path is not None
        else None
    )
    tiles = build_tiles(materials, semantics, transitions, plaza_transitions)
    tile_order = (
        TILE_ORDER
        + (TRANSITION_TILE_ORDER if transitions is not None else ())
        + (PLAZA_TRANSITION_TILE_ORDER if plaza_transitions is not None else ())
    )
    atlas_rows = (len(tile_order) + ATLAS_COLUMNS - 1) // ATLAS_COLUMNS
    atlas = Image.new(
        "RGBA",
        (TILE_SIZE[0] * ATLAS_COLUMNS, TILE_SIZE[1] * atlas_rows),
        (0, 0, 0, 0),
    )
    for index, tile_id in enumerate(tile_order):
        row, column = divmod(index, ATLAS_COLUMNS)
        atlas.alpha_composite(tiles[tile_id], (column * TILE_SIZE[0], row * TILE_SIZE[1]))
    save_png_atomic(atlas, output_path, args.overwrite)

    tile_entries = []
    for index, tile_id in enumerate(tile_order):
        row, column = divmod(index, ATLAS_COLUMNS)
        tile_entries.append(
            {
                "tileId": tile_id,
                "atlasRect": [column * TILE_SIZE[0], row * TILE_SIZE[1], *TILE_SIZE],
                "alpha": alpha_stats(tiles[tile_id]),
                "meanRgba": [round(value, 3) for value in ImageStat.Stat(tiles[tile_id]).mean],
            }
        )
    payload = {
        "schemaVersion": 1,
        "reportType": "beastbound.firebud_ground_atlas_build",
        "scriptVersion": SCRIPT_VERSION,
        "pillowVersion": PILLOW_VERSION,
        "materialsSource": {
            "path": portable_path(materials_path),
            "sha256": sha256(materials_path),
            "dimensions": list(materials.size),
        },
        "semanticSource": {
            "path": portable_path(semantics_path),
            "sha256": sha256(semantics_path),
            "dimensions": list(semantics.size),
        },
        "atlas": {
            "path": portable_path(output_path),
            "sha256": sha256(output_path),
            "dimensions": list(atlas.size),
            "tileSize": list(TILE_SIZE),
            "columns": ATLAS_COLUMNS,
        },
        "renderContract": {
            "mode": "layered_semantic_overlay",
            "baseTiles": [
                "firebud_meadow_a",
                "firebud_meadow_b",
                "firebud_meadow_dry_b",
                "firebud_meadow_clover_c",
                "firebud_meadow_far",
            ],
            "semanticOverlays": [
                tile_id
                for tile_id in tile_order
                if tile_id
                not in {
                    "firebud_meadow_a",
                    "firebud_meadow_b",
                    "firebud_meadow_dry_b",
                    "firebud_meadow_clover_c",
                    "firebud_meadow_far",
                }
            ],
            "directionalPathTransitions": list(TRANSITION_TILE_ORDER)
            if transitions is not None
            else [],
            "pathTransitionSignatures": list(AUTOTILE_SIGNATURES)
            if transitions is not None
            else [],
            "directionalPlazaTransitions": list(PLAZA_TRANSITION_TILE_ORDER)
            if plaza_transitions is not None
            else [],
            "plazaTransitionSignatures": list(AUTOTILE_SIGNATURES)
            if plaza_transitions is not None
            else [],
        },
        "tiles": tile_entries,
    }
    if transitions_path is not None and transitions is not None:
        payload["pathTransitionSource"] = {
            "path": portable_path(transitions_path),
            "sha256": sha256(transitions_path),
            "dimensions": list(transitions.size),
            "grid": {"rows": 4, "columns": 4},
            "blankCell": [3, 3],
            "signatures": list(AUTOTILE_SIGNATURES),
        }
    if plaza_transitions_path is not None and plaza_transitions is not None:
        payload["plazaTransitionSource"] = {
            "path": portable_path(plaza_transitions_path),
            "sha256": sha256(plaza_transitions_path),
            "dimensions": list(plaza_transitions.size),
            "grid": {"rows": 4, "columns": 4},
            "blankCell": [3, 3],
            "signatures": list(AUTOTILE_SIGNATURES),
        }
    write_json_atomic(payload, manifest_path, args.overwrite)
    return payload


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--materials", type=Path, required=True)
    parser.add_argument("--semantics", type=Path, required=True)
    parser.add_argument("--transitions", type=Path)
    parser.add_argument("--plaza-transitions", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--overwrite", action="store_true")
    return parser.parse_args()


def main() -> int:
    try:
        payload = build(parse_args())
    except (BuildError, OSError) as error:
        print(f"ERROR: {error}")
        return 1
    print(json.dumps(payload["atlas"], ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
