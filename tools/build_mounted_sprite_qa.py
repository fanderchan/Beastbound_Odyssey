#!/usr/bin/env python3
"""Build repeatable visual QA evidence for whole baked mounted sprites.

The input PNGs already contain one integrated rider, mount, and tack subject.
This tool only places those immutable whole frames on review canvases; it never
loads, aligns, or composites separate rider and pet layers.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


DIRECTIONS = (
    ("south", "S", 1),
    ("southwest", "SW", 2),
    ("west", "W", 3),
    ("northwest", "NW", 4),
    ("north", "N", 5),
    ("northeast", "NE", 6),
    ("east", "E", 7),
    ("southeast", "SE", 8),
)
WALK_FRAME_COUNT = 4
EXPECTED_FRAME_SIZE = (256, 256)
BACKGROUND = (17, 32, 34)
PANEL = (25, 45, 44)
PANEL_ALT = (29, 51, 49)
GRID_LINE = (74, 111, 102)
TEXT = (232, 238, 229)
MUTED_TEXT = (154, 177, 168)
ACCENT = (226, 177, 75)
CHECKER_A = (43, 61, 60)
CHECKER_B = (49, 68, 66)


@dataclass(frozen=True)
class DirectionFrames:
    key: str
    label: str
    idle_path: Path
    walk_paths: tuple[Path, ...]


def load_font(size: int, bold: bool = False) -> ImageFont.ImageFont:
    candidates = (
        Path("/System/Library/Fonts/Supplemental/Arial Bold.ttf") if bold else Path("/System/Library/Fonts/Supplemental/Arial.ttf"),
        Path("/System/Library/Fonts/Helvetica.ttc"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf") if bold else Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
    )
    for path in candidates:
        if path.exists():
            try:
                return ImageFont.truetype(str(path), size=size)
            except OSError:
                continue
    return ImageFont.load_default()


def discover_frames(idle_dir: Path, walk_root: Path) -> tuple[DirectionFrames, ...]:
    groups: list[DirectionFrames] = []
    missing: list[Path] = []
    for key, label, idle_index in DIRECTIONS:
        idle_path = idle_dir / f"ride_idle-{idle_index}.png"
        walk_paths = tuple(
            walk_root / key / "normalized" / f"ride_walk-{index}.png"
            for index in range(1, WALK_FRAME_COUNT + 1)
        )
        for path in (idle_path, *walk_paths):
            if not path.is_file():
                missing.append(path)
        groups.append(DirectionFrames(key, label, idle_path, walk_paths))
    if missing:
        rendered = "\n".join(f"- {path}" for path in missing)
        raise FileNotFoundError(f"missing mounted sprite inputs:\n{rendered}")
    return tuple(groups)


def read_rgba(path: Path) -> Image.Image:
    image = Image.open(path).convert("RGBA")
    if image.size != EXPECTED_FRAME_SIZE:
        raise ValueError(f"expected {EXPECTED_FRAME_SIZE} RGBA frame, got {image.size}: {path}")
    if image.getchannel("A").getbbox() is None:
        raise ValueError(f"frame has no visible mounted subject: {path}")
    return image


def checkerboard(size: tuple[int, int], tile: int = 16) -> Image.Image:
    board = Image.new("RGB", size, CHECKER_A)
    draw = ImageDraw.Draw(board)
    for y in range(0, size[1], tile):
        for x in range(0, size[0], tile):
            if (x // tile + y // tile) % 2:
                draw.rectangle((x, y, min(x + tile - 1, size[0] - 1), min(y + tile - 1, size[1] - 1)), fill=CHECKER_B)
    return board


def paste_whole_frame(canvas: Image.Image, frame: Image.Image, position: tuple[int, int]) -> None:
    """Place one immutable integrated frame on the QA canvas."""
    canvas.paste(frame, position, frame)


def build_contact_sheet(groups: tuple[DirectionFrames, ...], output_path: Path) -> None:
    label_width = 128
    frame_size = EXPECTED_FRAME_SIZE[0]
    cell_padding = 10
    cell_width = frame_size + cell_padding * 2
    cell_height = frame_size + cell_padding * 2
    title_height = 62
    header_height = 42
    footer_height = 42
    width = label_width + cell_width * WALK_FRAME_COUNT
    height = title_height + header_height + cell_height * len(groups) + footer_height
    canvas = Image.new("RGB", (width, height), BACKGROUND)
    draw = ImageDraw.Draw(canvas)
    title_font = load_font(24, bold=True)
    header_font = load_font(17, bold=True)
    label_font = load_font(20, bold=True)
    small_font = load_font(14)

    draw.text((22, 16), "Baked mounted walk QA | 8 directions x 4 phases", fill=TEXT, font=title_font)
    draw.text((width - 344, 22), "whole rider + mount frames only", fill=ACCENT, font=small_font)
    header_y = title_height
    draw.rectangle((0, header_y, width - 1, header_y + header_height - 1), fill=PANEL)
    draw.text((28, header_y + 11), "Facing", fill=MUTED_TEXT, font=header_font)
    for phase in range(WALK_FRAME_COUNT):
        x = label_width + phase * cell_width
        draw.text((x + cell_width // 2 - 31, header_y + 11), f"Phase {phase + 1}", fill=TEXT, font=header_font)

    checker = checkerboard(EXPECTED_FRAME_SIZE)
    for row, group in enumerate(groups):
        row_y = title_height + header_height + row * cell_height
        row_color = PANEL if row % 2 == 0 else PANEL_ALT
        draw.rectangle((0, row_y, width - 1, row_y + cell_height - 1), fill=row_color)
        draw.text((30, row_y + cell_height // 2 - 24), group.label, fill=ACCENT, font=label_font)
        draw.text((20, row_y + cell_height // 2 + 8), group.key, fill=MUTED_TEXT, font=small_font)
        for phase, path in enumerate(group.walk_paths):
            x = label_width + phase * cell_width + cell_padding
            y = row_y + cell_padding
            canvas.paste(checker, (x, y))
            paste_whole_frame(canvas, read_rgba(path), (x, y))
            draw.rectangle((x, y, x + frame_size - 1, y + frame_size - 1), outline=GRID_LINE, width=1)

    footer_y = height - footer_height
    draw.text(
        (20, footer_y + 12),
        "Canonical order: S, SW, W, NW, N, NE, E, SE | transparent 256px source frames",
        fill=MUTED_TEXT,
        font=small_font,
    )
    output_path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(output_path, format="PNG", optimize=True)


def build_cycle_gif(
    groups: tuple[DirectionFrames, ...],
    output_path: Path,
    duration_ms: int,
) -> None:
    columns = 4
    rows = 2
    preview_size = 224
    cell_padding = 10
    label_height = 28
    cell_width = preview_size + cell_padding * 2
    cell_height = preview_size + label_height + cell_padding * 2
    title_height = 54
    width = cell_width * columns
    height = title_height + cell_height * rows
    label_font = load_font(16, bold=True)
    small_font = load_font(13)
    checker = checkerboard((preview_size, preview_size), tile=14)
    animation_frames: list[Image.Image] = []

    for phase in range(WALK_FRAME_COUNT):
        canvas = Image.new("RGB", (width, height), BACKGROUND)
        draw = ImageDraw.Draw(canvas)
        draw.text((18, 14), "Baked mounted 8-direction walk cycle", fill=TEXT, font=load_font(21, bold=True))
        draw.text((width - 128, 18), f"phase {phase + 1}/4", fill=ACCENT, font=small_font)
        for index, group in enumerate(groups):
            row, column = divmod(index, columns)
            x0 = column * cell_width
            y0 = title_height + row * cell_height
            draw.rectangle((x0, y0, x0 + cell_width - 1, y0 + cell_height - 1), fill=PANEL if index % 2 == 0 else PANEL_ALT)
            image_x = x0 + cell_padding
            image_y = y0 + cell_padding
            canvas.paste(checker, (image_x, image_y))
            source = read_rgba(group.walk_paths[phase])
            displayed = source.resize((preview_size, preview_size), Image.Resampling.LANCZOS)
            paste_whole_frame(canvas, displayed, (image_x, image_y))
            draw.rectangle((image_x, image_y, image_x + preview_size - 1, image_y + preview_size - 1), outline=GRID_LINE, width=1)
            label = f"{group.label}  {group.key}"
            draw.text((x0 + cell_padding + 4, image_y + preview_size + 6), label, fill=TEXT, font=label_font)
        animation_frames.append(canvas)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    animation_frames[0].save(
        output_path,
        format="GIF",
        save_all=True,
        append_images=animation_frames[1:],
        duration=duration_ms,
        loop=0,
        disposal=2,
        optimize=False,
    )


def alpha_bbox(image: Image.Image, threshold: int = 8) -> tuple[int, int, int, int]:
    alpha = image.getchannel("A")
    binary = alpha.point(lambda value: 255 if value >= threshold else 0)
    bbox = binary.getbbox()
    if bbox is None:
        raise ValueError("frame has no visible subject")
    return bbox


def frame_metrics(path: Path) -> dict[str, object]:
    image = read_rgba(path)
    bbox = alpha_bbox(image)
    visible = 0
    magenta_fringe = 0
    rgba_bytes = image.tobytes()
    pixels = image.get_flattened_data() if hasattr(image, "get_flattened_data") else image.getdata()
    for red, green, blue, alpha in pixels:
        # Extremely faint matte pixels below the same 24-alpha component gate
        # used by the sprite processor are not visible residue at game scale.
        if alpha < 24:
            continue
        visible += 1
        if red >= 160 and blue >= 150 and green <= 100 and min(red, blue) - green >= 75:
            magenta_fringe += 1
    return {
        "path": str(path),
        "sha256": hashlib.sha256(rgba_bytes).hexdigest(),
        "alphaBbox": list(bbox),
        "visiblePixels": visible,
        "magentaFringePixels": magenta_fringe,
        "width": bbox[2] - bbox[0],
        "height": bbox[3] - bbox[1],
        "centerX": round((bbox[0] + bbox[2]) / 2.0, 2),
        "bottomExclusive": bbox[3],
    }


def build_report(
    groups: tuple[DirectionFrames, ...],
    output_path: Path,
    contact_path: Path,
    gif_path: Path,
) -> list[str]:
    warnings: list[str] = []
    direction_report: dict[str, object] = {}
    for group in groups:
        idle = frame_metrics(group.idle_path)
        walk = [frame_metrics(path) for path in group.walk_paths]
        hashes = {str(item["sha256"]) for item in walk}
        bottoms = [int(item["bottomExclusive"]) for item in walk]
        heights = [int(item["height"]) for item in walk]
        centers = [float(item["centerX"]) for item in walk]
        fringe_count = sum(int(item["magentaFringePixels"]) for item in walk)
        if len(hashes) != WALK_FRAME_COUNT:
            warnings.append(f"{group.key}: walk frames are not all visually unique ({len(hashes)}/4 hashes)")
        if max(bottoms) - min(bottoms) > 1:
            warnings.append(f"{group.key}: bottom anchor drifts by {max(bottoms) - min(bottoms)}px")
        if max(heights) / min(heights) > 1.15:
            warnings.append(f"{group.key}: alpha height varies by more than 15%")
        if max(centers) - min(centers) > 18:
            warnings.append(f"{group.key}: alpha center drifts by {max(centers) - min(centers):.1f}px")
        if fringe_count:
            warnings.append(f"{group.key}: {fringe_count} possible magenta fringe pixels")
        direction_report[group.key] = {
            "label": group.label,
            "idle": idle,
            "walk": walk,
            "summary": {
                "uniqueWalkFrames": len(hashes),
                "bottomDriftPx": max(bottoms) - min(bottoms),
                "heightRangePx": [min(heights), max(heights)],
                "centerDriftPx": round(max(centers) - min(centers), 2),
                "possibleMagentaFringePixels": fringe_count,
            },
        }

    report = {
        "schemaVersion": 1,
        "rule": "review canvases arrange immutable whole AI-baked rider + mount frames; no rider/pet layer composition",
        "directionOrder": [key for key, _, _ in DIRECTIONS],
        "walkFrameCountPerDirection": WALK_FRAME_COUNT,
        "expectedFrameSize": list(EXPECTED_FRAME_SIZE),
        "outputs": {
            "contactSheet": str(contact_path),
            "simultaneousCycleGif": str(gif_path),
        },
        "warnings": warnings,
        "directions": direction_report,
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return warnings


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--idle-dir", required=True, type=Path)
    parser.add_argument("--walk-root", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--duration-ms", type=int, default=180)
    args = parser.parse_args()
    if args.duration_ms < 60:
        raise ValueError("--duration-ms must be at least 60")

    groups = discover_frames(args.idle_dir, args.walk_root)
    contact_path = args.output_dir / "mounted-walk-8x4-contact.png"
    gif_path = args.output_dir / "mounted-walk-8-direction-cycle.gif"
    report_path = args.output_dir / "mounted-walk-qa-report.json"
    build_contact_sheet(groups, contact_path)
    build_cycle_gif(groups, gif_path, args.duration_ms)
    warnings = build_report(groups, report_path, contact_path, gif_path)
    print(contact_path)
    print(gif_path)
    print(report_path)
    if warnings:
        print("visual-QA metric warnings:")
        for warning in warnings:
            print(f"- {warning}")
    else:
        print("visual-QA metrics: PASS (manual visual review still required)")


if __name__ == "__main__":
    main()
