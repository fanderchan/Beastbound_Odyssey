#!/usr/bin/env python3
"""Normalize whole mounted-character frames without rebuilding their layers.

AI produces every frame as one already integrated rider, mount and tack image.
This utility only applies transparent-canvas scale and anchor normalization.  It
never moves the rider independently of the mount.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image


FRAME_SIZE = 256
DEFAULT_BOTTOM_EXCLUSIVE = 244
DEFAULT_SAFE_MARGIN = 8


def alpha_bbox(image: Image.Image, threshold: int = 8) -> tuple[int, int, int, int]:
    alpha = image.convert("RGBA").getchannel("A")
    binary = alpha.point(lambda value: 255 if value >= threshold else 0)
    bbox = binary.getbbox()
    if bbox is None:
        raise ValueError("frame has no visible subject")
    return bbox


def normalized_frame(
    image: Image.Image,
    scale: float,
    bottom_exclusive: int,
    center_x: float = FRAME_SIZE / 2.0,
) -> tuple[Image.Image, dict[str, object]]:
    rgba = image.convert("RGBA")
    bbox = alpha_bbox(rgba)
    crop = rgba.crop(bbox)
    output_size = (
        max(1, round(crop.width * scale)),
        max(1, round(crop.height * scale)),
    )
    resized = crop.resize(output_size, Image.Resampling.LANCZOS)
    x = round(center_x - resized.width / 2.0)
    y = bottom_exclusive - resized.height
    canvas = Image.new("RGBA", (FRAME_SIZE, FRAME_SIZE), (0, 0, 0, 0))
    canvas.alpha_composite(resized, (x, y))
    output_bbox = alpha_bbox(canvas)
    return canvas, {
        "sourceBbox": list(bbox),
        "sourceSize": [crop.width, crop.height],
        "scale": scale,
        "outputSize": list(output_size),
        "pastePosition": [x, y],
        "outputBbox": list(output_bbox),
    }


def validate_safe_bbox(path: Path, bbox: tuple[int, int, int, int], safe_margin: int) -> None:
    x0, y0, x1, y1 = bbox
    if x0 < safe_margin or y0 < safe_margin or x1 > FRAME_SIZE - safe_margin or y1 > FRAME_SIZE - safe_margin:
        raise ValueError(f"normalized frame touches {safe_margin}px safety margin: {path} bbox={bbox}")


def normalize_idle(args: argparse.Namespace) -> None:
    args.output_dir.mkdir(parents=True, exist_ok=True)
    frames_meta: dict[str, object] = {}
    for index in range(1, args.count + 1):
        source_path = args.input_dir / f"{args.prefix}-{index}.png"
        source = Image.open(source_path).convert("RGBA")
        bbox = alpha_bbox(source)
        width = bbox[2] - bbox[0]
        height = bbox[3] - bbox[1]
        scale = min(args.target_height / height, args.max_width / width)
        normalized, meta = normalized_frame(source, scale, args.bottom_exclusive)
        output_path = args.output_dir / source_path.name
        validate_safe_bbox(output_path, tuple(meta["outputBbox"]), args.safe_margin)
        normalized.save(output_path, format="PNG", optimize=True)
        meta["sourcePath"] = str(source_path)
        meta["outputPath"] = str(output_path)
        meta["heightLimited"] = args.target_height / height <= args.max_width / width
        frames_meta[str(index)] = meta
    write_metadata(args, "idle", frames_meta)


def normalize_walk(args: argparse.Namespace) -> None:
    idle = Image.open(args.idle).convert("RGBA")
    idle_bbox = alpha_bbox(idle)
    target_height = idle_bbox[3] - idle_bbox[1]
    target_center_x = (idle_bbox[0] + idle_bbox[2]) / 2.0
    sources: list[tuple[Path, Image.Image, tuple[int, int, int, int]]] = []
    for index in range(1, args.count + 1):
        path = args.input_dir / f"{args.prefix}-{index}.png"
        image = Image.open(path).convert("RGBA")
        sources.append((path, image, alpha_bbox(image)))

    first_height = sources[0][2][3] - sources[0][2][1]
    requested_scale = target_height / first_height
    width_limit = min(
        args.max_width / (bbox[2] - bbox[0])
        for _, _, bbox in sources
    )
    height_limit = min(
        (FRAME_SIZE - args.safe_margin - (FRAME_SIZE - args.bottom_exclusive)) / (bbox[3] - bbox[1])
        for _, _, bbox in sources
    )
    scale = min(requested_scale, width_limit, height_limit)
    ratio = scale / requested_scale
    if ratio < args.min_scale_ratio or ratio > args.max_scale_ratio:
        raise ValueError(
            f"walk generation needs excessive correction: requested={requested_scale:.4f} "
            f"applied={scale:.4f} ratio={ratio:.4f}"
        )

    args.output_dir.mkdir(parents=True, exist_ok=True)
    frames_meta: dict[str, object] = {}
    for index, (source_path, source, _) in enumerate(sources, start=1):
        normalized, meta = normalized_frame(source, scale, args.bottom_exclusive, target_center_x)
        output_path = args.output_dir / source_path.name
        validate_safe_bbox(output_path, tuple(meta["outputBbox"]), args.safe_margin)
        normalized.save(output_path, format="PNG", optimize=True)
        meta["sourcePath"] = str(source_path)
        meta["outputPath"] = str(output_path)
        frames_meta[str(index)] = meta
    write_metadata(
        args,
        "walk",
        frames_meta,
        {
            "idlePath": str(args.idle),
            "idleBbox": list(idle_bbox),
            "targetCenterX": target_center_x,
            "requestedScale": requested_scale,
            "appliedScale": scale,
            "correctionRatio": ratio,
        },
    )


def write_metadata(
    args: argparse.Namespace,
    mode: str,
    frames: dict[str, object],
    extra: dict[str, object] | None = None,
) -> None:
    metadata_path = args.metadata or args.output_dir / "normalization-meta.json"
    metadata_path.write_text(
        json.dumps(
            {
                "schemaVersion": 1,
                "mode": mode,
                "rule": "whole mounted subject transformed as one immutable layer",
                "frameSize": FRAME_SIZE,
                "bottomExclusive": args.bottom_exclusive,
                "safeMargin": args.safe_margin,
                "frames": frames,
                **(extra or {}),
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )


def common_options(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--input-dir", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--prefix", required=True)
    parser.add_argument("--count", type=int, default=4)
    parser.add_argument("--bottom-exclusive", type=int, default=DEFAULT_BOTTOM_EXCLUSIVE)
    parser.add_argument("--safe-margin", type=int, default=DEFAULT_SAFE_MARGIN)
    parser.add_argument("--max-width", type=int, default=240)
    parser.add_argument("--metadata", type=Path)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)
    idle = subparsers.add_parser("idle")
    common_options(idle)
    idle.add_argument("--target-height", type=int, default=224)
    idle.set_defaults(handler=normalize_idle)
    walk = subparsers.add_parser("walk")
    common_options(walk)
    walk.add_argument("--idle", required=True, type=Path)
    walk.add_argument("--min-scale-ratio", type=float, default=0.85)
    walk.add_argument("--max-scale-ratio", type=float, default=1.15)
    walk.set_defaults(handler=normalize_walk)
    args = parser.parse_args()
    args.handler(args)


if __name__ == "__main__":
    main()
