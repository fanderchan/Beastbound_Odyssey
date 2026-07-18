#!/usr/bin/env python3
"""Remove detached alpha islands from generated sprite frames.

The normal use is ``--keep-largest`` after chroma despill. It preserves the
connected character silhouette and removes floating generation/keying noise.
"""

from __future__ import annotations

import argparse
from collections import deque
from pathlib import Path

from PIL import Image


def alpha_components(image: Image.Image) -> list[list[tuple[int, int]]]:
    alpha = image.getchannel("A")
    pixels = alpha.load()
    width, height = image.size
    visited: set[tuple[int, int]] = set()
    components: list[list[tuple[int, int]]] = []
    for y in range(height):
        for x in range(width):
            if pixels[x, y] == 0 or (x, y) in visited:
                continue
            queue: deque[tuple[int, int]] = deque([(x, y)])
            visited.add((x, y))
            component: list[tuple[int, int]] = []
            while queue:
                current_x, current_y = queue.popleft()
                component.append((current_x, current_y))
                for offset_x, offset_y in (
                    (-1, -1), (0, -1), (1, -1),
                    (-1, 0), (1, 0),
                    (-1, 1), (0, 1), (1, 1),
                ):
                    next_x = current_x + offset_x
                    next_y = current_y + offset_y
                    point = (next_x, next_y)
                    if (
                        0 <= next_x < width
                        and 0 <= next_y < height
                        and point not in visited
                        and pixels[next_x, next_y] > 0
                    ):
                        visited.add(point)
                        queue.append(point)
            components.append(component)
    return components


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--keep-largest", action="store_true")
    parser.add_argument("--min-area", type=int, default=24)
    parser.add_argument(
        "--clear-rect",
        help="Optional x,y,width,height cleanup rectangle applied after component filtering.",
    )
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    if not args.input.is_file():
        raise SystemExit(f"input does not exist: {args.input}")
    if args.output.exists() and args.output != args.input and not args.force:
        raise SystemExit(f"output exists: {args.output}; pass --force")
    with Image.open(args.input) as source:
        image = source.convert("RGBA")
    components = alpha_components(image)
    if not components:
        raise SystemExit(f"sprite has no visible alpha: {args.input}")
    largest = max(components, key=len)
    keep = {point for component in components for point in component if len(component) >= args.min_area}
    if args.keep_largest:
        keep = set(largest)
    pixels = image.load()
    removed = 0
    for component in components:
        for x, y in component:
            if (x, y) in keep:
                continue
            pixels[x, y] = (0, 0, 0, 0)
            removed += 1
    if args.clear_rect:
        values = [int(value.strip()) for value in args.clear_rect.split(",")]
        if len(values) != 4:
            raise SystemExit("--clear-rect must be x,y,width,height")
        left, top, rect_width, rect_height = values
        for y in range(max(0, top), min(image.height, top + max(0, rect_height))):
            for x in range(max(0, left), min(image.width, left + max(0, rect_width))):
                if pixels[x, y][3] == 0:
                    continue
                pixels[x, y] = (0, 0, 0, 0)
                removed += 1
    args.output.parent.mkdir(parents=True, exist_ok=True)
    image.save(args.output, format="PNG", optimize=True)
    print(
        f"cleaned={args.output} components={len(components)} "
        f"largest={len(largest)} removed={removed}"
    )


if __name__ == "__main__":
    main()
