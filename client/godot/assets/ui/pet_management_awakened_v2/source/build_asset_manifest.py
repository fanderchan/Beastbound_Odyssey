#!/usr/bin/env python3
"""Write the deterministic source/runtime hash manifest for this UI bundle."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image


BUNDLE_DIR = Path(__file__).resolve().parents[1]
SOURCE_DIR = BUNDLE_DIR / "source"
RUNTIME_DIR = BUNDLE_DIR / "runtime"
OUTPUT_PATH = BUNDLE_DIR / "asset-manifest.json"
SOURCE_PATHS = (
    "source/base-components-alpha.png",
    "source/micro-ornament-atlas-alpha.png",
    "source/micro-ornament-atlas-chroma.png",
    "source/ornament-atlas-alpha.png",
    "source/ornament-atlas-chroma.png",
    "source/pet_management_backdrop_wide_original.png",
    "source/selected-option-2-reference.png",
)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def image_entry(relative_path: str) -> dict[str, object]:
    path = BUNDLE_DIR / relative_path
    with Image.open(path) as image:
        width, height = image.size
        mode = image.mode
    return {
        "path": relative_path,
        "width": width,
        "height": height,
        "mode": mode,
        "sha256": sha256(path),
    }


def main() -> None:
    runtime_paths = sorted(
        path.relative_to(BUNDLE_DIR).as_posix()
        for path in RUNTIME_DIR.rglob("*.png")
    )
    manifest = {
        "schemaVersion": 2,
        "assetPackId": "pet_management_awakened_v2",
        "generatedAt": "2026-07-28",
        "authoringTools": [
            "OpenAI built-in image generation",
            "deterministic Python/Pillow processing",
            "existing formal Beastbound pet identity art",
        ],
        "ownership": "original_beastbound_generation_and_formal_art_copies",
        "reviewState": "approved",
        "sourceFiles": [image_entry(path) for path in SOURCE_PATHS],
        "runtimeFiles": [image_entry(path) for path in runtime_paths],
        "showcaseCount": sum(
            1 for path in runtime_paths if path.startswith("runtime/showcase/")
        ),
    }
    OUTPUT_PATH.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(
        "asset manifest written: "
        f"{len(manifest['runtimeFiles'])} runtime files, "
        f"{manifest['showcaseCount']} showcase files"
    )


if __name__ == "__main__":
    main()
