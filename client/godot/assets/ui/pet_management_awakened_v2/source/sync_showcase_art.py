#!/usr/bin/env python3
"""Verify or refresh pet-management showcase copies from formal pet identities."""

from __future__ import annotations

import argparse
import hashlib
import shutil
from pathlib import Path

from PIL import Image


BUNDLE_DIR = Path(__file__).resolve().parents[1]
GODOT_DIR = Path(__file__).resolve().parents[4]
PETS_DIR = GODOT_DIR / "assets" / "pets"
SHOWCASE_DIR = BUNDLE_DIR / "runtime" / "showcase"


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def formal_sources() -> list[Path]:
    return sorted(PETS_DIR.glob("*/identity/front_3quarter_sw.png"))


def verify_source(path: Path) -> None:
    with Image.open(path) as image:
        if image.size != (512, 512) or image.mode != "RGBA":
            raise ValueError(
                f"{path}: expected 512x512 RGBA, got {image.size} {image.mode}"
            )


def verify() -> list[str]:
    errors: list[str] = []
    sources = formal_sources()
    expected_names = {f"{path.parents[1].name}.png" for path in sources}
    actual_names = {path.name for path in SHOWCASE_DIR.glob("*.png")}
    if expected_names != actual_names:
        missing = sorted(expected_names - actual_names)
        extra = sorted(actual_names - expected_names)
        if missing:
            errors.append(f"missing showcase copies: {', '.join(missing)}")
        if extra:
            errors.append(f"unexpected showcase copies: {', '.join(extra)}")
    for source_path in sources:
        try:
            verify_source(source_path)
        except ValueError as error:
            errors.append(str(error))
            continue
        runtime_path = SHOWCASE_DIR / f"{source_path.parents[1].name}.png"
        if runtime_path.is_file() and digest(runtime_path) != digest(source_path):
            errors.append(f"{runtime_path.name}: not an exact formal-art copy")
    return errors


def write() -> None:
    SHOWCASE_DIR.mkdir(parents=True, exist_ok=True)
    for source_path in formal_sources():
        verify_source(source_path)
        shutil.copy2(
            source_path,
            SHOWCASE_DIR / f"{source_path.parents[1].name}.png",
        )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--write",
        action="store_true",
        help="refresh showcase copies; default is read-only verification",
    )
    args = parser.parse_args()
    if args.write:
        write()
    errors = verify()
    if errors:
        raise SystemExit("\n".join(errors))
    count = len(formal_sources())
    print(f"showcase art ok: {count}/{count}")


if __name__ == "__main__":
    main()
