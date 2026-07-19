#!/usr/bin/env python3
"""Finalize an existing pet identity-key-pose bundle without inventing art.

This tool is deliberately narrow: it archives an already generated PNG as a
lossless WebP, records reproducible hashes, and writes the standard incomplete
action manifest used by the owner-review identity gate.  It never creates
poses, enables runtime art, or marks owner approval.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any

from PIL import Image


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CATALOG = REPO_ROOT / "client/godot/data/pet_art_catalog.json"

ACTION_SPECS: dict[str, tuple[int, int, bool]] = {
    "idle": (6, 8, True),
    "walk": (8, 10, True),
    "attack": (8, 12, False),
    "skill": (8, 12, False),
    "hurt": (6, 12, False),
    "defend": (6, 10, False),
    "dodge": (8, 12, False),
    "counter": (8, 12, False),
    "stagger": (8, 10, False),
    "knockaway": (8, 12, False),
    "down": (8, 10, False),
    "revive": (8, 10, False),
}

CANONICAL_DIRECTIONS = [
    "south",
    "southwest",
    "west",
    "northwest",
    "north",
    "northeast",
    "east",
    "southeast",
]


class FinalizeError(RuntimeError):
    """Raised when an identity bundle cannot be finalized safely."""


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def decoded_rgba_sha256(path: Path) -> str:
    with Image.open(path) as image:
        rgba = image.convert("RGBA")
        payload = rgba.tobytes()
    return hashlib.sha256(payload).hexdigest()


def image_size(path: Path) -> list[int]:
    with Image.open(path) as image:
        return [image.width, image.height]


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def resolve_repo_path(value: str) -> Path:
    path = (REPO_ROOT / value).resolve()
    try:
        path.relative_to(REPO_ROOT)
    except ValueError as exc:
        raise FinalizeError(f"catalog path escapes repository: {value}") from exc
    return path


def require_file(path: Path, label: str) -> None:
    if not path.is_file():
        raise FinalizeError(f"missing {label}: {path.relative_to(REPO_ROOT)}")


def archive_lossless_webp(raw_png: Path, raw_webp: Path) -> tuple[str, str]:
    original_decoded = decoded_rgba_sha256(raw_png)
    with Image.open(raw_png) as image:
        image.convert("RGBA").save(
            raw_webp,
            format="WEBP",
            lossless=True,
            quality=100,
            method=6,
            exact=True,
        )
    archived_decoded = decoded_rgba_sha256(raw_webp)
    if archived_decoded != original_decoded:
        raw_webp.unlink(missing_ok=True)
        raise FinalizeError(
            f"lossless WebP decoded hash mismatch: {raw_png.relative_to(REPO_ROOT)}"
        )
    return original_decoded, sha256_file(raw_webp)


def action_metadata() -> dict[str, Any]:
    return {
        action: {
            "frameCount": frame_count,
            "fps": fps,
            "loop": loop,
            "status": "not_produced",
        }
        for action, (frame_count, fps, loop) in ACTION_SPECS.items()
    }


def finalize_form(form: dict[str, Any], force: bool) -> None:
    form_id = str(form.get("formId", ""))
    display_name = str(form.get("displayName", ""))
    pet = form.get("pet")
    if not form_id or not display_name or not isinstance(pet, dict):
        raise FinalizeError("catalog form is missing formId/displayName/pet")

    root = resolve_repo_path(str(pet.get("root", "")))
    metadata_path = resolve_repo_path(str(pet.get("metadataPath", "")))
    identity_path = resolve_repo_path(str(pet.get("identityPath", "")))
    ownership_path = resolve_repo_path(str(pet.get("ownershipPath", "")))
    prompt_path = resolve_repo_path(str(pet.get("promptPath", "")))
    identity_dir = root / "identity"
    source_dir = root / "source"
    raw_png = source_dir / "identity-board-raw.png"
    raw_webp = source_dir / "identity-board-raw.webp"
    source_meta_path = source_dir / "identity-board-source-meta.json"
    pipeline_meta_path = source_dir / "identity-board-pipeline-meta.json"
    transparent_board = identity_dir / "identity-board-transparent.png"

    for path, label in [
        (identity_path, "identity lock"),
        (ownership_path, "ownership record"),
        (prompt_path, "generation prompt"),
        (raw_png, "raw identity PNG"),
        (pipeline_meta_path, "pipeline metadata"),
        (transparent_board, "transparent identity board"),
    ]:
        require_file(path, label)
    for pose in ["front_3quarter_sw", "back_3quarter_ne", "south", "west"]:
        require_file(identity_dir / f"{pose}.png", f"identity pose {pose}")

    if metadata_path.exists() and not force:
        raise FinalizeError(
            f"metadata already exists (use --force): {metadata_path.relative_to(REPO_ROOT)}"
        )

    source_dir.mkdir(parents=True, exist_ok=True)
    decoded_hash, webp_hash = archive_lossless_webp(raw_png, raw_webp)
    source_meta = {
        "schemaVersion": 1,
        "asset": f"{form_id}_identity_board",
        "generator": "OpenAI built-in image generation",
        "originalGeneratedFilename": raw_png.name,
        "originalPngSize": image_size(raw_png),
        "originalPngSha256": sha256_file(raw_png),
        "decodedRgbaPixelSha256": decoded_hash,
        "archive": {
            "path": "source/identity-board-raw.webp",
            "format": "webp",
            "lossless": True,
            "sha256": webp_hash,
            "decodedRgbaPixelSha256": decoded_hash,
        },
        "prompt": str(prompt_path.relative_to(root)),
        "pipelineMetadata": str(pipeline_meta_path.relative_to(root)),
        "outputs": {
            "transparentBoard": "identity/identity-board-transparent.png",
            "transparentBoardSha256": sha256_file(transparent_board),
        },
    }
    write_json(source_meta_path, source_meta)

    metadata = {
        "schemaVersion": 1,
        "formId": form_id,
        "displayName": display_name,
        "artStatus": "in_production",
        "productionScope": "identity_key_pose_gate",
        "runtimeEnabled": False,
        "runtimeFrameSize": [256, 256],
        "views": ["front_3quarter_sw", "back_3quarter_ne"],
        "identity": {
            "status": "self_review_passed_owner_pending",
            "sourceFrameSize": [512, 512],
            "board": "identity/identity-board-transparent.png",
            "poses": {
                "front_3quarter_sw": "identity/front_3quarter_sw.png",
                "back_3quarter_ne": "identity/back_3quarter_ne.png",
                "south": "identity/south.png",
                "west": "identity/west.png",
            },
        },
        "actions": action_metadata(),
        "worldVisual": {
            "status": "not_produced",
            "strategy": "independent_8",
            "runtimeMirroring": False,
            "directions": CANONICAL_DIRECTIONS,
            "actions": {
                "idle": {
                    "frameCount": 1,
                    "fps": 4,
                    "loop": True,
                    "status": "not_produced",
                },
                "walk": {
                    "frameCount": 4,
                    "fps": 10,
                    "loop": True,
                    "status": "not_produced",
                },
            },
        },
        "supportedMountedCharacterIds": list(form.get("supportedCharacterIds", [])),
        "sourceArchive": {
            "policy": "tracked_lossless_webp_with_original_sha256",
            "raw": "source/identity-board-raw.webp",
            "sourceMetadata": "source/identity-board-source-meta.json",
            "pipelineMetadata": "source/identity-board-pipeline-meta.json",
            "prompt": str(prompt_path.relative_to(root)),
        },
        "evidence": {
            "identityBoard": "identity/identity-board-transparent.png",
            "identityBoardSha256": sha256_file(transparent_board),
        },
        "keyPoseReviewStatus": "owner_review_pending",
        "ownerReviewStatus": "pending",
        "notes": (
            "Identity and four key poses only. World and battle animation "
            "matrices are intentionally not produced in this gate."
        ),
    }
    write_json(metadata_path, metadata)
    print(f"finalized {form_id}: {metadata_path.relative_to(REPO_ROOT)}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--catalog", type=Path, default=DEFAULT_CATALOG)
    parser.add_argument("--form", action="append", required=True, dest="forms")
    parser.add_argument("--force", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    catalog_path = args.catalog.resolve()
    catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    forms = {
        str(form.get("formId", "")): form
        for form in catalog.get("forms", [])
        if isinstance(form, dict)
    }
    unknown = [form_id for form_id in args.forms if form_id not in forms]
    if unknown:
        raise FinalizeError(f"unknown catalog form(s): {', '.join(unknown)}")
    for form_id in args.forms:
        finalize_form(forms[form_id], args.force)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (FinalizeError, json.JSONDecodeError, OSError) as exc:
        raise SystemExit(f"error: {exc}") from exc
