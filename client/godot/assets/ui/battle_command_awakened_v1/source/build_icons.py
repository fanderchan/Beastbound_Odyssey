#!/usr/bin/env python3
"""Build the runtime battle-command icon set from the reviewed 4x4 source atlas."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "source" / "generated" / "battle_command_icon_atlas_alpha.png"
OUT_DIR = ROOT / "runtime" / "icons"
ICON_SIZE = 96
CONTENT_SIZE = 78

ICON_NAMES = (
    "attack",
    "spirit",
    "item",
    "escape",
    "assist",
    "capture",
    "summon",
    "defend",
    "auto",
    "skill",
    "recall",
    "return",
    "player",
    "pet",
    "cancel",
    "managed",
)


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _cell_bounds(edge: int, index: int) -> tuple[int, int]:
    start = round(edge * index / 4)
    end = round(edge * (index + 1) / 4)
    return start, end


def _fit_icon(cell: Image.Image) -> Image.Image:
    alpha = cell.getchannel("A")
    bounds = alpha.getbbox()
    if bounds is None:
        raise RuntimeError("source atlas cell is empty")
    content = cell.crop(bounds)
    scale = min(CONTENT_SIZE / content.width, CONTENT_SIZE / content.height)
    width = max(1, round(content.width * scale))
    height = max(1, round(content.height * scale))
    content = content.resize((width, height), Image.Resampling.LANCZOS)
    result = Image.new("RGBA", (ICON_SIZE, ICON_SIZE), (0, 0, 0, 0))
    result.alpha_composite(content, ((ICON_SIZE - width) // 2, (ICON_SIZE - height) // 2))
    return result


def main() -> None:
    source = Image.open(SOURCE).convert("RGBA")
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    records: list[dict[str, object]] = []
    for index, name in enumerate(ICON_NAMES):
        row, column = divmod(index, 4)
        left, right = _cell_bounds(source.width, column)
        top, bottom = _cell_bounds(source.height, row)
        icon = _fit_icon(source.crop((left, top, right, bottom)))
        output = OUT_DIR / f"{name}.png"
        icon.save(output, optimize=True)
        records.append(
            {
                "id": name,
                "path": f"runtime/icons/{name}.png",
                "width": ICON_SIZE,
                "height": ICON_SIZE,
                "sha256": _sha256(output),
            }
        )
    manifest = {
        "schemaVersion": 1,
        "bundleId": "battle_command_awakened_v1",
        "source": "source/generated/battle_command_icon_atlas_alpha.png",
        "sourceSha256": _sha256(SOURCE),
        "icons": records,
    }
    (ROOT / "asset-manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
