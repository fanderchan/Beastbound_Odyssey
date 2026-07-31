#!/usr/bin/env python3
"""Deterministically publish the frost_whisper_v1 source sheets.

This is a post-processing/QC utility only.  It removes the authored magenta
key, slices the independently generated cells, applies one stable scale per
animation family, and derives the 256px runtime files from archived 512px
source frames.  It never mirrors, rotates, paints, or synthesizes poses.
"""

from __future__ import annotations

import hashlib
import json
import shutil
import sys
from collections import defaultdict, deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont


ASSET_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = next(parent for parent in ASSET_ROOT.parents if (parent / "tools").is_dir())
sys.path.insert(0, str(REPO_ROOT / "tools"))

from build_pet_art_bundle import resize_rgba_premultiplied, rgba_hash  # noqa: E402


SOURCE_SIZE = 512
RUNTIME_SIZE = 256
WORLD_DIRECTIONS = (
    "south",
    "southwest",
    "west",
    "northwest",
    "north",
    "northeast",
    "east",
    "southeast",
)
VIEWS = ("front_3quarter_sw", "back_3quarter_ne")
ACTION_SPECS = {
    "idle": {"count": 6, "fps": 8, "loop": True},
    "walk": {"count": 8, "fps": 11, "loop": True},
    "attack": {"count": 8, "fps": 12, "loop": False},
    "skill": {"count": 8, "fps": 12, "loop": False},
    "hurt": {"count": 6, "fps": 12, "loop": False},
    "defend": {"count": 6, "fps": 8, "loop": False},
    "dodge": {"count": 8, "fps": 14, "loop": False},
    "counter": {"count": 8, "fps": 13, "loop": False},
    "stagger_return": {"count": 8, "fps": 10, "loop": False},
    "knockaway": {"count": 8, "fps": 12, "loop": False},
    "down": {"count": 8, "fps": 10, "loop": False},
    "revive": {"count": 8, "fps": 10, "loop": False},
}


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def proportional_box(width: int, height: int, cols: int, rows: int, index: int):
    row, col = divmod(index, cols)
    return (
        round(col * width / cols),
        round(row * height / rows),
        round((col + 1) * width / cols),
        round((row + 1) * height / rows),
    )


def remove_magenta(cell: Image.Image) -> Image.Image:
    rgb = np.asarray(cell.convert("RGB"), dtype=np.uint8)
    work = rgb.astype(np.int16)
    magenta_candidates = (
        (rgb[:, :, 0] > 175)
        & (rgb[:, :, 2] > 175)
        & (rgb[:, :, 1] < 145)
        & ((rgb[:, :, 0].astype(np.int16) - rgb[:, :, 1]) > 75)
        & ((rgb[:, :, 2].astype(np.int16) - rgb[:, :, 1]) > 75)
    )
    border = np.zeros(magenta_candidates.shape, dtype=bool)
    band = max(3, min(cell.size) // 40)
    border[:band, :] = True
    border[-band:, :] = True
    border[:, :band] = True
    border[:, -band:] = True
    samples = rgb[magenta_candidates & border]
    key = np.median(samples, axis=0) if len(samples) else np.array([255, 0, 255])
    distance = np.linalg.norm(work - key.astype(np.int16), axis=2)
    alpha = np.clip((distance - 20.0) / 80.0 * 255.0, 0, 255).astype(np.uint8)
    # The generated key is saturated magenta.  This secondary rule removes
    # anti-aliased key pixels without touching the character's cyan/blue art.
    alpha[magenta_candidates & (distance < 105)] = np.minimum(
        alpha[magenta_candidates & (distance < 105)], 80
    )
    rgba = np.dstack((rgb, alpha))
    rgba[rgba[:, :, 3] == 0, :3] = 0
    return Image.fromarray(rgba, "RGBA")


def remove_detached_generation_specks(image: Image.Image) -> Image.Image:
    """Drop tiny disconnected source-sheet noise without modifying silhouettes."""

    rgba = np.asarray(image.convert("RGBA"), dtype=np.uint8).copy()
    binary = rgba[:, :, 3] > 32
    height, width = binary.shape
    visited = np.zeros_like(binary, dtype=bool)
    components = []
    for y in range(height):
        for x in range(width):
            if not binary[y, x] or visited[y, x]:
                continue
            queue = deque([(x, y)])
            visited[y, x] = True
            pixels = []
            min_x = max_x = x
            min_y = max_y = y
            while queue:
                px, py = queue.popleft()
                pixels.append((px, py))
                min_x = min(min_x, px)
                max_x = max(max_x, px)
                min_y = min(min_y, py)
                max_y = max(max_y, py)
                for nx, ny in ((px - 1, py), (px + 1, py), (px, py - 1), (px, py + 1)):
                    if 0 <= nx < width and 0 <= ny < height and binary[ny, nx] and not visited[ny, nx]:
                        visited[ny, nx] = True
                        queue.append((nx, ny))
            components.append(
                {
                    "pixels": pixels,
                    "area": len(pixels),
                    "bbox": (min_x, min_y, max_x + 1, max_y + 1),
                }
            )
    if not components:
        return image
    largest = max(components, key=lambda component: component["area"])
    # A generated grid can leak pieces of a neighboring cell into this cell.
    # Retaining the single dominant connected silhouette removes those leaks
    # while preserving the held weapon whenever it is genuinely authored as
    # part of the pose. Detached VFX are not present in this character bundle.
    keep = [largest]

    support = Image.new("L", (width, height), 0)
    support_pixels = support.load()
    for component in keep:
        for x, y in component["pixels"]:
            support_pixels[x, y] = 255
    support = support.filter(ImageFilter.MaxFilter(5))
    support_array = np.asarray(support) > 0
    rgba[~support_array] = 0
    rgba[rgba[:, :, 3] == 0, :3] = 0
    return Image.fromarray(rgba, "RGBA")


def content_bbox(image: Image.Image):
    alpha = np.asarray(image.getchannel("A"))
    ys, xs = np.where(alpha > 8)
    if not len(xs):
        raise RuntimeError("empty frame after chroma removal")
    return (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)


def normalize_collection(frames: list[dict], *, fit: int = 438) -> list[dict]:
    max_width = max(frame["bbox"][2] - frame["bbox"][0] for frame in frames)
    max_height = max(frame["bbox"][3] - frame["bbox"][1] for frame in frames)
    scale = min(fit / max_width, fit / max_height)
    scale = min(scale, 2.0)
    for frame in frames:
        crop = frame["image"].crop(frame["bbox"])
        width = max(1, round(crop.width * scale))
        height = max(1, round(crop.height * scale))
        resized = resize_rgba_premultiplied(crop, (width, height))
        canvas = Image.new("RGBA", (SOURCE_SIZE, SOURCE_SIZE), (0, 0, 0, 0))
        x = (SOURCE_SIZE - width) // 2
        y = min(SOURCE_SIZE - height - 18, 474 - height)
        y = max(18, y)
        canvas.alpha_composite(resized, (x, y))
        arr = np.asarray(canvas, dtype=np.uint8).copy()
        arr[arr[:, :, 3] == 0, :3] = 0
        frame["normalized"] = Image.fromarray(arr, "RGBA")
        frame["scale"] = scale
    return frames


def save_source_and_runtime(source_image: Image.Image, source_path: Path, runtime_path: Path):
    source_path.parent.mkdir(parents=True, exist_ok=True)
    runtime_path.parent.mkdir(parents=True, exist_ok=True)
    source_image.save(source_path, optimize=False)
    runtime = resize_rgba_premultiplied(source_image, (RUNTIME_SIZE, RUNTIME_SIZE))
    arr = np.asarray(runtime, dtype=np.uint8).copy()
    arr[arr[:, :, 3] == 0, :3] = 0
    Image.fromarray(arr, "RGBA").save(runtime_path, optimize=False)


def source_edge_warnings(frames: list[dict]) -> list[dict]:
    warnings = []
    for frame in frames:
        left, top, right, bottom = frame["bbox"]
        width, height = frame["cell_size"]
        edges = []
        if left <= 1:
            edges.append("left")
        if top <= 1:
            edges.append("top")
        if right >= width - 1:
            edges.append("right")
        if bottom >= height - 1:
            edges.append("bottom")
        if edges:
            warnings.append({"frame": frame["label"], "edges": edges})
    return warnings


def split_world() -> tuple[list[dict], list[dict]]:
    all_frames = []
    ledger = []
    for direction in WORLD_DIRECTIONS:
        path = ASSET_ROOT / "source" / "world-sheets" / f"{direction}-raw.png"
        sheet = Image.open(path).convert("RGB")
        ledger.append({"path": str(path.relative_to(ASSET_ROOT)), "sha256": sha256_file(path)})
        for index in range(5):
            crop_box = proportional_box(sheet.width, sheet.height, 2, 3, index)
            cell = remove_detached_generation_specks(remove_magenta(sheet.crop(crop_box)))
            all_frames.append(
                {
                    "kind": "world",
                    "direction": direction,
                    "index": index,
                    "label": f"world/{direction}/{index + 1}",
                    "image": cell,
                    "bbox": content_bbox(cell),
                    "cell_size": cell.size,
                    "cropBox": list(crop_box),
                }
            )
    normalize_collection(all_frames, fit=430)
    for frame in all_frames:
        direction = frame["direction"]
        index = frame["index"]
        action = "idle" if index == 0 else "walk"
        frame_number = 1 if index == 0 else index
        source_path = (
            ASSET_ROOT
            / "source"
            / "normalized"
            / "world"
            / direction
            / action
            / f"{action}-{frame_number}.png"
        )
        runtime_path = (
            ASSET_ROOT
            / "world"
            / "directions"
            / direction
            / action
            / f"{action}-{frame_number}.png"
        )
        save_source_and_runtime(frame["normalized"], source_path, runtime_path)
        frame["sourcePath"] = str(source_path.relative_to(ASSET_ROOT))
        frame["runtimePath"] = str(runtime_path.relative_to(ASSET_ROOT))
    return all_frames, ledger


def split_battle() -> tuple[list[dict], list[dict]]:
    by_view: dict[str, list[dict]] = defaultdict(list)
    ledger = []
    for action, spec in ACTION_SPECS.items():
        path = ASSET_ROOT / "source" / "battle-sheets" / f"{action}-raw.png"
        sheet = Image.open(path).convert("RGB")
        ledger.append({"path": str(path.relative_to(ASSET_ROOT)), "sha256": sha256_file(path)})
        for view_index, view in enumerate(VIEWS):
            for index in range(spec["count"]):
                sheet_cell_index = view_index * 8 + index
                crop_box = proportional_box(sheet.width, sheet.height, 4, 4, sheet_cell_index)
                cell = remove_detached_generation_specks(remove_magenta(sheet.crop(crop_box)))
                by_view[view].append(
                    {
                        "kind": "battle",
                        "view": view,
                        "action": action,
                        "index": index,
                        "label": f"battle/{view}/{action}/{index + 1}",
                        "image": cell,
                        "bbox": content_bbox(cell),
                        "cell_size": cell.size,
                        "cropBox": list(crop_box),
                    }
                )
    all_frames = []
    for view in VIEWS:
        normalize_collection(by_view[view], fit=438)
        all_frames.extend(by_view[view])
    for frame in all_frames:
        view, action, index = frame["view"], frame["action"], frame["index"]
        source_path = (
            ASSET_ROOT
            / "source"
            / "normalized"
            / "views"
            / view
            / action
            / f"{action}-{index + 1}.png"
        )
        runtime_path = ASSET_ROOT / "views" / view / action / f"{action}-{index + 1}.png"
        save_source_and_runtime(frame["normalized"], source_path, runtime_path)
        frame["sourcePath"] = str(source_path.relative_to(ASSET_ROOT))
        frame["runtimePath"] = str(runtime_path.relative_to(ASSET_ROOT))

    # Explicit state-machine seam: the final down pose is the first revive pose.
    for view in VIEWS:
        for prefix in (ASSET_ROOT / "source" / "normalized", ASSET_ROOT):
            base = prefix / "views" / view
            shutil.copyfile(base / "down" / "down-8.png", base / "revive" / "revive-1.png")
    return all_frames, ledger


def load_font(size: int):
    for candidate in (
        "/System/Library/Fonts/PingFang.ttc",
        "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
    ):
        if Path(candidate).is_file():
            return ImageFont.truetype(candidate, size)
    return ImageFont.load_default()


def make_contact_sheet(path: Path, rows: list[tuple[str, list[Path]]], columns: int = 8):
    thumb = 112
    label_width = 170
    header = 58
    row_height = 126
    canvas = Image.new(
        "RGB", (label_width + columns * thumb, header + len(rows) * row_height), (24, 24, 28)
    )
    draw = ImageDraw.Draw(canvas)
    title_font = load_font(24)
    label_font = load_font(18)
    draw.text((18, 14), "霜语游侠 frost_whisper_v1 运行时帧接触表", fill=(239, 226, 188), font=title_font)
    for row_index, (label, frame_paths) in enumerate(rows):
        y = header + row_index * row_height
        draw.text((12, y + 45), label, fill=(200, 215, 228), font=label_font)
        for column, frame_path in enumerate(frame_paths[:columns]):
            frame = Image.open(frame_path).convert("RGBA")
            preview = frame.resize((thumb, thumb), Image.Resampling.LANCZOS)
            box = Image.new("RGBA", (thumb, thumb), (44, 45, 52, 255))
            box.alpha_composite(preview)
            canvas.paste(box.convert("RGB"), (label_width + column * thumb, y + 7))
            draw.rectangle(
                (label_width + column * thumb, y + 7, label_width + (column + 1) * thumb - 1, y + 118),
                outline=(92, 94, 106),
                width=1,
            )
    path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(path, optimize=False)


def create_contact_sheets():
    world_rows = []
    for direction in WORLD_DIRECTIONS:
        base = ASSET_ROOT / "world" / "directions" / direction
        paths = [base / "idle" / "idle-1.png"] + [
            base / "walk" / f"walk-{index}.png" for index in range(1, 5)
        ]
        world_rows.append((direction, paths))
    make_contact_sheet(ASSET_ROOT / "qa" / "contact_sheets" / "world-true-eight.png", world_rows)

    for view in VIEWS:
        battle_rows = []
        for action, spec in ACTION_SPECS.items():
            battle_rows.append(
                (
                    action,
                    [
                        ASSET_ROOT / "views" / view / action / f"{action}-{index}.png"
                        for index in range(1, spec["count"] + 1)
                    ],
                )
            )
        make_contact_sheet(
            ASSET_ROOT / "qa" / "contact_sheets" / f"battle-{view}.png", battle_rows
        )


def validate_runtime(world_frames: list[dict], battle_frames: list[dict], warnings: list[dict]):
    runtime_paths = sorted((ASSET_ROOT / "world").rglob("*.png")) + sorted(
        (ASSET_ROOT / "views").rglob("*.png")
    )
    errors = []
    edge_failures = []
    hashes: dict[str, list[str]] = defaultdict(list)
    for path in runtime_paths:
        image = Image.open(path).convert("RGBA")
        if image.size != (RUNTIME_SIZE, RUNTIME_SIZE):
            errors.append(f"wrong dimensions: {path.relative_to(ASSET_ROOT)} {image.size}")
        alpha = np.asarray(image.getchannel("A"))
        if np.any(alpha[0, :]) or np.any(alpha[-1, :]) or np.any(alpha[:, 0]) or np.any(alpha[:, -1]):
            edge_failures.append(str(path.relative_to(ASSET_ROOT)))
        hashes[rgba_hash(image)].append(str(path.relative_to(ASSET_ROOT)))
    expected_world = len(WORLD_DIRECTIONS) * 5
    expected_battle = len(VIEWS) * sum(spec["count"] for spec in ACTION_SPECS.values())
    if len(runtime_paths) != expected_world + expected_battle:
        errors.append(
            f"runtime count {len(runtime_paths)} != {expected_world + expected_battle}"
        )
    if edge_failures:
        errors.append(f"runtime alpha touches outer edge: {len(edge_failures)} frames")

    intentional = set()
    continuity = {}
    for view in VIEWS:
        down = ASSET_ROOT / "views" / view / "down" / "down-8.png"
        revive = ASSET_ROOT / "views" / view / "revive" / "revive-1.png"
        exact = Image.open(down).convert("RGBA").tobytes() == Image.open(revive).convert("RGBA").tobytes()
        continuity[view] = exact
        intentional.add(tuple(sorted((str(down.relative_to(ASSET_ROOT)), str(revive.relative_to(ASSET_ROOT))))))
        if not exact:
            errors.append(f"down/revive seam mismatch: {view}")

    duplicate_groups = []
    for digest, paths in hashes.items():
        if len(paths) <= 1:
            continue
        group = tuple(sorted(paths))
        duplicate_groups.append({"rgbaHash": digest, "paths": list(group), "intentional": group in intentional})

    summary = {
        "schemaVersion": 1,
        "characterId": "frost_whisper_v1",
        "status": "runtime_contract_passed" if not errors else "failed",
        "ownerReviewStatus": "owner_review_pending",
        "counts": {
            "world": expected_world,
            "battlePerView": sum(spec["count"] for spec in ACTION_SPECS.values()),
            "battleTotal": expected_battle,
            "runtimeTotal": len(runtime_paths),
        },
        "runtimeDimensions": [RUNTIME_SIZE, RUNTIME_SIZE],
        "runtimeAlphaEdgeFailures": edge_failures,
        "sourceCellEdgeWarnings": warnings,
        "downReviveExact": continuity,
        "duplicateRgbaGroups": duplicate_groups,
        "errors": errors,
        "notes": [
            "All eight world directions were independently generated; no mirroring was used.",
            "Both battle views were independently generated; no view was mirrored from the other.",
            "Source-cell edge warnings are retained for owner visual review and do not imply a transparent runtime-edge failure.",
        ],
    }
    qa_path = ASSET_ROOT / "qa" / "qc-summary.json"
    qa_path.parent.mkdir(parents=True, exist_ok=True)
    qa_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if errors:
        raise RuntimeError("; ".join(errors))


def write_metadata(source_ledger: list[dict], warnings: list[dict]):
    metadata = {
        "schemaVersion": 3,
        "bundleId": "character_action_frost_whisper_v1",
        "characterId": "frost_whisper_v1",
        "displayName": "霜语游侠",
        "identityLock": "identity/identity-lock.md",
        "identityLockImage": "identity/identity-lock.png",
        "artStatus": "produced",
        "runtimeEnabled": True,
        "ownerReviewStatus": "owner_review_pending",
        "sourceFrameSize": [SOURCE_SIZE, SOURCE_SIZE],
        "runtimeFrameSize": [RUNTIME_SIZE, RUNTIME_SIZE],
        "views": list(VIEWS),
        "actions": {
            action: {
                "frameCount": spec["count"],
                "fps": spec["fps"],
                "loop": spec["loop"],
                "status": "produced",
            }
            for action, spec in ACTION_SPECS.items()
        },
        "worldVisual": {
            "strategy": "independent_8",
            "runtimeMirroring": False,
            "directions": list(WORLD_DIRECTIONS),
            "independentlyAuthoredDirections": True,
            "onFoot": {
                "actions": {
                    "idle": {"frameCount": 1, "fps": 4, "loop": True, "status": "produced"},
                    "walk": {"frameCount": 4, "fps": 9, "loop": True, "status": "produced"},
                },
                "totalFrameCount": 40,
            },
        },
        "ui": {
            "portrait": "ui/portrait.png",
            "showcase": "ui/showcase.png",
            "independentlyAuthored": True,
        },
        "frameTotals": {"world": 40, "battlePerView": 90, "battleTotal": 180, "runtimeTotal": 220},
        "source": {
            "ledger": "source/source-ledger.json",
            "postprocessor": "source/process_frost_whisper_assets.py",
            "sourceCellEdgeWarningCount": len(warnings),
        },
        "quality": {
            "runtimeContractStatus": "passed",
            "ownerReviewStatus": "owner_review_pending",
            "runtimeMirroring": False,
            "downReviveContinuity": "exact_rgba",
            "qcSummary": "qa/qc-summary.json",
            "contactSheets": [
                "qa/contact_sheets/world-true-eight.png",
                "qa/contact_sheets/battle-front_3quarter_sw.png",
                "qa/contact_sheets/battle-back_3quarter_ne.png",
            ],
        },
    }
    (ASSET_ROOT / "action-bundle-meta.json").write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    ledger = {
        "schemaVersion": 1,
        "characterId": "frost_whisper_v1",
        "generationMethod": "OpenAI built-in image generation with archived prompt contracts",
        "postprocessing": "deterministic chroma removal, proportional slicing, shared-scale normalization, premultiplied resize",
        "creativeTransformations": [],
        "mirroringUsed": False,
        "inputs": source_ledger,
    }
    (ASSET_ROOT / "source" / "source-ledger.json").write_text(
        json.dumps(ledger, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


def main():
    world_frames, world_ledger = split_world()
    battle_frames, battle_ledger = split_battle()
    warnings = source_edge_warnings(world_frames + battle_frames)
    create_contact_sheets()
    identity_ui_ledger = []
    for relative in (
        "source/identity-board-raw.png",
        "source/ui/portrait-green-raw.png",
        "source/ui/showcase-raw.png",
        "identity/identity-lock.png",
        "ui/portrait.png",
        "ui/showcase.png",
    ):
        path = ASSET_ROOT / relative
        identity_ui_ledger.append({"path": relative, "sha256": sha256_file(path)})
    write_metadata(identity_ui_ledger + world_ledger + battle_ledger, warnings)
    validate_runtime(world_frames, battle_frames, warnings)
    print(
        json.dumps(
            {
                "characterId": "frost_whisper_v1",
                "worldFrames": len(world_frames),
                "battleFrames": len(battle_frames),
                "runtimeFrames": len(world_frames) + len(battle_frames),
                "sourceCellEdgeWarnings": len(warnings),
                "ownerReviewStatus": "owner_review_pending",
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
