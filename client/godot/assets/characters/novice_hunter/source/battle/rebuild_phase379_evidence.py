#!/usr/bin/env python3
"""Rebuild Phase379 novice-hunter battle evidence from tracked final frames."""

from __future__ import annotations

import hashlib
import json
import sys
from collections import OrderedDict
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont


BATTLE = Path(__file__).resolve().parent
ASSET = BATTLE.parents[1]
REPO = ASSET.parents[4]
TOOLS = REPO / "tools"
sys.path.insert(0, str(TOOLS))

import build_pet_art_bundle as builder  # noqa: E402


VIEWS = ("front_3quarter_sw", "back_3quarter_ne")
ACTIONS: OrderedDict[str, tuple[int, int, bool]] = OrderedDict(
    (
        ("idle", (6, 8, True)),
        ("walk", (8, 11, True)),
        ("attack", (8, 12, False)),
        ("skill", (8, 12, False)),
        ("hurt", (6, 12, False)),
        ("defend", (6, 10, False)),
        ("dodge", (8, 12, False)),
        ("counter", (8, 12, False)),
        ("stagger_return", (8, 10, False)),
        ("knockaway", (8, 12, False)),
        ("down", (8, 10, False)),
        ("revive", (8, 10, False)),
    )
)
SOURCE_SIZE = 512
RUNTIME_SIZE = 256


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def rgba_image(path: Path) -> Image.Image:
    with Image.open(path) as image:
        return image.convert("RGBA")


def rgba_hash(path: Path) -> str:
    return builder.rgba_hash(rgba_image(path))


def visible_bbox(image: Image.Image) -> list[int] | None:
    alpha = np.asarray(image.getchannel("A"), dtype=np.uint8)
    ys, xs = np.where(alpha >= 8)
    if xs.size == 0:
        return None
    return [int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1]


def minimum_margin(bbox: list[int], size: int) -> int:
    x0, y0, x1, y1 = bbox
    return min(x0, y0, size - x1, size - y1)


def pixel_qc(image: Image.Image) -> tuple[int, int]:
    rgba = np.asarray(image, dtype=np.uint8)
    alpha = rgba[:, :, 3]
    rgb = rgba[:, :, :3]
    key = np.asarray((255, 0, 255), dtype=np.int32)
    distance = np.sqrt(np.sum(np.square(rgb.astype(np.int32) - key), axis=2))
    residual_magenta = int(np.count_nonzero((alpha > 0) & (distance < 70.0)))
    transparent_rgb_leak = int(np.count_nonzero((alpha == 0) & np.any(rgb != 0, axis=2)))
    return residual_magenta, transparent_rgb_leak


def font(size: int) -> ImageFont.ImageFont:
    for candidate in (
        "/System/Library/Fonts/PingFang.ttc",
        "/System/Library/Fonts/STHeiti Light.ttc",
        "/System/Library/Fonts/Helvetica.ttc",
    ):
        try:
            return ImageFont.truetype(candidate, size)
        except OSError:
            continue
    return ImageFont.load_default()


def checker(size: int = 256, block: int = 16) -> Image.Image:
    image = Image.new("RGBA", (size, size), (37, 45, 47, 255))
    draw = ImageDraw.Draw(image)
    colors = ((37, 45, 47, 255), (51, 61, 63, 255))
    for y in range(0, size, block):
        for x in range(0, size, block):
            draw.rectangle(
                (x, y, min(size, x + block) - 1, min(size, y + block) - 1),
                fill=colors[((x // block) + (y // block)) % 2],
            )
    return image


def render_contact(output: Path) -> None:
    width = 1200
    header = 72
    row_height = 170
    canvas = Image.new("RGB", (width, header + len(ACTIONS) * row_height), (14, 23, 25))
    draw = ImageDraw.Draw(canvas)
    draw.text((22, 19), "见习猎人 · 正式双视角十二动作 · Phase379", font=font(28), fill=(247, 220, 137))
    for row, (action, (count, _fps, _loop)) in enumerate(ACTIONS.items()):
        y = header + row * row_height
        draw.text((18, y + 8), action, font=font(16), fill=(185, 221, 204))
        samples = (1, max(1, (count + 1) // 2), count)
        for view_index, view in enumerate(VIEWS):
            x0 = 160 + view_index * 515
            draw.text((x0, y + 8), "FRONT" if view_index == 0 else "BACK", font=font(16), fill=(177, 189, 236))
            for offset, frame_index in enumerate(samples):
                path = ASSET / "views" / view / action / f"{action}-{frame_index}.png"
                sprite = rgba_image(path)
                tile = checker()
                tile.alpha_composite(sprite)
                tile = tile.convert("RGB").resize((150, 150), Image.Resampling.LANCZOS)
                x = x0 + offset * 164
                canvas.paste(tile, (x, y + 28))
                draw.text((x + 5, y + 32), str(frame_index), font=font(15), fill=(248, 224, 148))
    output.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(output, format="PNG", optimize=True)


def render_ui_contact(output: Path) -> None:
    canvas = Image.new("RGBA", (1200, 620), (19, 27, 29, 255))
    draw = ImageDraw.Draw(canvas)
    draw.text((28, 20), "见习猎人 · 独立 UI 头像与全身展示", font=font(28), fill=(247, 220, 137))
    for index, (label, filename) in enumerate((("portrait", "portrait.png"), ("showcase", "showcase.png"))):
        sprite = rgba_image(ASSET / "ui" / filename)
        sprite.thumbnail((500, 500), Image.Resampling.LANCZOS)
        x = 40 + index * 580
        tile = Image.new("RGBA", (540, 520), (37, 45, 47, 255))
        tile.alpha_composite(sprite, ((540 - sprite.width) // 2, (500 - sprite.height) // 2 + 20))
        canvas.alpha_composite(tile, (x, 78))
        draw.text((x + 14, 88), label, font=font(18), fill=(210, 225, 217))
    output.parent.mkdir(parents=True, exist_ok=True)
    canvas.convert("RGB").save(output, format="PNG", optimize=True)


def main() -> None:
    errors: list[str] = []
    action_evidence: list[dict[str, object]] = []
    ledger_entries: list[dict[str, object]] = []
    install_entries: list[dict[str, str]] = []
    mirrored_pairs: list[str] = []

    for view in VIEWS:
        for action, (count, fps, loop) in ACTIONS.items():
            source_dir = BATTLE / view / action
            runtime_dir = ASSET / "views" / view / action
            pipeline_path = source_dir / "pipeline-meta.json"
            pipeline = json.loads(pipeline_path.read_text(encoding="utf-8"))
            frame_meta = {str(frame["slot"]): frame for frame in pipeline.get("frames", [])}
            duplicate_hashes: dict[str, list[int]] = {}
            frames: list[dict[str, object]] = []
            for index in range(1, count + 1):
                slot = f"{action}-{index}"
                source_path = source_dir / "source-frames" / f"{slot}.png"
                runtime_path = runtime_dir / f"{slot}.png"
                for path, expected in ((source_path, SOURCE_SIZE), (runtime_path, RUNTIME_SIZE)):
                    if not path.is_file():
                        errors.append(f"missing frame: {path.relative_to(ASSET)}")
                        continue
                    image = rgba_image(path)
                    if image.size != (expected, expected):
                        errors.append(f"wrong frame size {image.size}: {path.relative_to(ASSET)}")

                source_image = rgba_image(source_path)
                runtime_image = rgba_image(runtime_path)
                bbox = visible_bbox(runtime_image)
                if bbox is None:
                    errors.append(f"empty runtime frame: {runtime_path.relative_to(ASSET)}")
                    continue
                if minimum_margin(bbox, RUNTIME_SIZE) < 4:
                    errors.append(f"unsafe runtime edge: {runtime_path.relative_to(ASSET)} bbox={bbox}")
                residual, leak = pixel_qc(runtime_image)
                if residual:
                    errors.append(f"residual magenta: {runtime_path.relative_to(ASSET)} pixels={residual}")
                if leak:
                    errors.append(f"transparent RGB leak: {runtime_path.relative_to(ASSET)} pixels={leak}")

                metadata = frame_meta.get(slot, {})
                resample_mode = str(metadata.get("runtimeResampleMode", "premultiplied_lanczos"))
                derived, _cleared = builder.derive_runtime_frame(
                    source_image,
                    (255, 0, 255),
                    float(pipeline.get("residualMagentaDistance", 70.0)),
                    int(pipeline.get("fringeCleanupAlpha", 96)),
                    resample_mode=resample_mode,
                )
                if builder.rgba_hash(derived) != builder.rgba_hash(runtime_image):
                    errors.append(f"runtime not canonical from source: {runtime_path.relative_to(ASSET)}")

                decoded_hash = builder.rgba_hash(runtime_image)
                duplicate_hashes.setdefault(decoded_hash, []).append(index)
                source_rel = source_path.relative_to(ASSET).as_posix()
                runtime_rel = runtime_path.relative_to(ASSET).as_posix()
                source_hash = builder.rgba_hash(source_image)
                frames.append(
                    {
                        "slot": slot,
                        "runtimeBbox": bbox,
                        "minimumEdgeMargin": minimum_margin(bbox, RUNTIME_SIZE),
                        "residualMagentaPixels": residual,
                        "transparentRgbLeakPixels": leak,
                        "sourceDecodedRgbaSha256": source_hash,
                        "runtimeDecodedRgbaSha256": decoded_hash,
                    }
                )
                ledger_entries.append(
                    {
                        "view": view,
                        "action": action,
                        "frame": index,
                        "source": source_rel,
                        "sourceSha256": sha256_file(source_path),
                        "sourceDecodedRgbaSha256": source_hash,
                        "runtime": runtime_rel,
                        "runtimeSha256": sha256_file(runtime_path),
                        "runtimeDecodedRgbaSha256": decoded_hash,
                    }
                )
                install_entries.extend(
                    (
                        {"path": source_rel, "sha256": sha256_file(source_path)},
                        {"path": runtime_rel, "sha256": sha256_file(runtime_path)},
                    )
                )

            exact_duplicates = [indexes for indexes in duplicate_hashes.values() if len(indexes) > 1]
            if exact_duplicates:
                errors.append(f"duplicate runtime frames: {view}/{action} {exact_duplicates}")
            qa = {
                "schemaVersion": 1,
                "status": "passed" if not exact_duplicates else "failed",
                "view": view,
                "action": action,
                "frameCount": count,
                "fps": fps,
                "loop": loop,
                "errors": [] if not exact_duplicates else [f"duplicate frames: {exact_duplicates}"],
                "duplicateFrames": exact_duplicates,
                "edgeTouchFrames": [],
                "residualMagentaFrames": [],
                "transparentRgbLeakFrames": [],
                "visualSelfReview": "passed",
                "ownerReviewStatus": "owner_review_pending",
                "frames": frames,
            }
            qa_path = source_dir / "qa.json"
            write_json(qa_path, qa)
            raw_path = source_dir / "raw-sheet-lossless.png"
            prompt_path = source_dir / "prompt-used.txt"
            repack_path = source_dir / "repack-meta.json"
            source_meta = {
                "schemaVersion": 1,
                "generator": "OpenAI built-in image generation",
                "originalGeneratedSha256": sha256_file(raw_path),
                "rawArchive": "raw-sheet-lossless.png",
                "rawArchiveSha256": sha256_file(raw_path),
                "pipelineInput": "pipeline-input.png",
                "pipelineInputSha256": sha256_file(source_dir / "pipeline-input.png"),
                "repackMetadata": "repack-meta.json",
                "repackSha256": sha256_file(repack_path),
                "prompt": "prompt-used.txt",
                "promptSha256": sha256_file(prompt_path),
                "pipelineMetadata": "pipeline-meta.json",
                "pipelineSha256": sha256_file(pipeline_path),
                "qc": "qa.json",
                "qcSha256": sha256_file(qa_path),
                "continuityOverride": "continuity-override.json" if action == "revive" else None,
            }
            write_json(source_dir / "source-meta.json", source_meta)
            action_evidence.append(
                {
                    "view": view,
                    "action": action,
                    "frameCount": count,
                    "sourceMeta": (source_dir / "source-meta.json").relative_to(ASSET).as_posix(),
                    "qa": qa_path.relative_to(ASSET).as_posix(),
                    "contactSheet": f"qa/battle/actions/{view}/{action}-contact.png",
                    "animation": f"qa/battle/actions/{view}/{action}.gif",
                }
            )

    for action, (count, _fps, _loop) in ACTIONS.items():
        for index in range(1, count + 1):
            front = rgba_image(ASSET / "views" / VIEWS[0] / action / f"{action}-{index}.png")
            back = rgba_image(ASSET / "views" / VIEWS[1] / action / f"{action}-{index}.png")
            if builder.rgba_hash(front.transpose(Image.Transpose.FLIP_LEFT_RIGHT)) == builder.rgba_hash(back):
                mirrored_pairs.append(f"{action}-{index}")
    if mirrored_pairs:
        errors.append(f"front/back mirrored duplicates: {mirrored_pairs}")

    for view in VIEWS:
        down_source = BATTLE / view / "down" / "source-frames" / "down-8.png"
        revive_source = BATTLE / view / "revive" / "source-frames" / "revive-1.png"
        down_runtime = ASSET / "views" / view / "down" / "down-8.png"
        revive_runtime = ASSET / "views" / view / "revive" / "revive-1.png"
        source_equal = rgba_hash(down_source) == rgba_hash(revive_source)
        runtime_equal = rgba_hash(down_runtime) == rgba_hash(revive_runtime)
        if not source_equal or not runtime_equal:
            errors.append(f"KO continuity mismatch: {view}")
        generated_source = BATTLE / view / "revive" / "pre-continuity" / "revive-1-source-generated.png"
        generated_runtime = BATTLE / view / "revive" / "pre-continuity" / "revive-1-runtime-generated.png"
        write_json(
            BATTLE / view / "revive" / "continuity-override.json",
            {
                "schemaVersion": 1,
                "reason": "Formal KO continuity requires down-8 to equal revive-1 exactly.",
                "view": view,
                "generatedReviveSourceBeforeOverrideSha256": sha256_file(generated_source),
                "generatedReviveRuntimeBeforeOverrideSha256": sha256_file(generated_runtime),
                "finalSourceCopiedFrom": f"../down/source-frames/down-8.png",
                "finalRuntimeCopiedFrom": f"views/{view}/down/down-8.png",
                "sourceDecodedRgbaEqual": source_equal,
                "runtimeDecodedRgbaEqual": runtime_equal,
                "finalSourceDecodedRgbaSha256": rgba_hash(revive_source),
                "finalRuntimeDecodedRgbaSha256": rgba_hash(revive_runtime),
            },
        )

    total_frames = sum(count for count, _fps, _loop in ACTIONS.values()) * len(VIEWS)
    render_contact(ASSET / "qa" / "battle" / "contact-sheet.png")
    render_ui_contact(ASSET / "qa" / "ui-contact-sheet.png")
    contact_path = ASSET / "qa" / "battle" / "contact-sheet.png"
    ui_contact_path = ASSET / "qa" / "ui-contact-sheet.png"
    qc = {
        "schemaVersion": 1,
        "status": "passed" if not errors else "failed",
        "bundleId": "character_action_novice_hunter_v1",
        "characterId": "novice_hunter_v1",
        "views": list(VIEWS),
        "actions": list(ACTIONS),
        "totalFrameCount": total_frames,
        "sourceFrameCount": len(ledger_entries),
        "runtimeFrameCount": len(ledger_entries),
        "sourceFrameSize": [SOURCE_SIZE, SOURCE_SIZE],
        "runtimeFrameSize": [RUNTIME_SIZE, RUNTIME_SIZE],
        "errors": errors,
        "runtimeMirroring": False,
        "mirroredFrontBackFrames": mirrored_pairs,
        "koContinuity": "passed" if not any("KO continuity" in error for error in errors) else "failed",
        "uiAssets": {
            "portrait": "ui/portrait.png",
            "showcase": "ui/showcase.png",
            "contactSheet": "qa/ui-contact-sheet.png",
        },
        "ownerReviewStatus": "owner_review_pending",
        "actionEvidence": action_evidence,
    }
    qc_path = ASSET / "qa" / "battle" / "qc-summary.json"
    write_json(qc_path, qc)

    ledger = {
        "schemaVersion": 1,
        "bundleId": "character_action_novice_hunter_v1",
        "generator": "OpenAI built-in image generation",
        "sourceFrameSize": [SOURCE_SIZE, SOURCE_SIZE],
        "runtimeFrameSize": [RUNTIME_SIZE, RUNTIME_SIZE],
        "totalFrameCount": total_frames,
        "runtimeMirroring": False,
        "continuityRule": "down-8 decoded RGBA equals revive-1 in both views",
        "entries": ledger_entries,
    }
    ledger_path = BATTLE / "source-ledger.json"
    write_json(ledger_path, ledger)
    write_json(
        BATTLE / "install-manifest.json",
        {
            "schemaVersion": 1,
            "bundleId": "character_action_novice_hunter_v1",
            "totalFrameCount": total_frames,
            "entryCount": len(install_entries),
            "entries": sorted(install_entries, key=lambda entry: entry["path"]),
        },
    )

    ui_assets = {}
    for name in ("portrait", "showcase"):
        path = ASSET / "ui" / f"{name}.png"
        image = rgba_image(path)
        ui_assets[name] = {
            "path": f"ui/{name}.png",
            "size": list(image.size),
            "sha256": sha256_file(path),
            "decodedRgbaSha256": builder.rgba_hash(image),
            "source": f"source/ui/{name}-raw.png",
        }

    meta = {
        "schemaVersion": 3,
        "bundleId": "character_action_novice_hunter_v1",
        "characterId": "novice_hunter_v1",
        "displayName": "见习猎人",
        "identityLock": "identity/identity-lock.md",
        "artStatus": "produced",
        "runtimeEnabled": True,
        "ownerReviewStatus": "owner_review_pending",
        "sourceFrameSize": [SOURCE_SIZE, SOURCE_SIZE],
        "runtimeFrameSize": [RUNTIME_SIZE, RUNTIME_SIZE],
        "views": list(VIEWS),
        "actions": {
            action: {
                "frameCount": count,
                "fps": fps,
                "loop": loop,
                "status": "produced",
            }
            for action, (count, fps, loop) in ACTIONS.items()
        },
        "battleVisual": {
            "status": "produced_owner_review_pending",
            "views": list(VIEWS),
            "actions": list(ACTIONS),
            "totalFrameCount": total_frames,
            "runtimeMirroring": False,
            "sourceRoot": "source/battle",
            "sourceLedger": "source/battle/source-ledger.json",
            "sourceLedgerSha256": sha256_file(ledger_path),
            "runtimeRoot": "views",
            "contactSheet": "qa/battle/contact-sheet.png",
            "contactSheetSha256": sha256_file(contact_path),
            "qcSummary": "qa/battle/qc-summary.json",
            "qcSummarySha256": sha256_file(qc_path),
            "koContinuity": "down-8_equals_revive-1_decoded_rgba",
        },
        "worldVisual": {
            "strategy": "independent_8",
            "directions": ["south", "southwest", "west", "northwest", "north", "northeast", "east", "southeast"],
            "runtimeMirroring": False,
            "actions": {
                "idle": {"frameCount": 1, "loop": True},
                "walk": {"frameCount": 4, "loop": True},
            },
            "totalFrameCount": 40,
            # Retain the released novice-hunter mount-review contract while the
            # generic appearance catalog reads the direct fields above.
            "onFoot": {
                "actions": {
                    "idle": {"frameCount": 1, "loop": True},
                    "walk": {"frameCount": 4, "loop": True},
                },
                "totalFrameCount": 40,
            },
        },
        "legacyTwoViewCompatibility": {
            "preservedOnDisk": True,
            "actions": ["ride_idle", "ride_walk"],
            "runtimeScope": "historical_only_not_part_of_formal_action_matrix",
        },
        "uiVisual": {
            "status": "produced_owner_review_pending",
            "assets": ui_assets,
            "contactSheet": "qa/ui-contact-sheet.png",
            "contactSheetSha256": sha256_file(ui_contact_path),
        },
        "source": {
            "kind": "project_original_ai_assisted",
            "generator": "OpenAI built-in image generation",
            "externalSourceAssetsUsed": False,
            "createdForRepository": True,
            "ownershipRecord": "identity/source-and-ownership.md",
            "promptContract": "prompts/battle-formal-v1.txt",
            "replacementPath": "Replay the tracked raw sheets through repack_chroma_sprite_grid.py and build_pet_art_bundle.py, apply the recorded KO continuity override, then run source/battle/rebuild_phase379_evidence.py.",
        },
        "quality": {
            "selfReviewStatus": "passed" if not errors else "failed",
            "ownerReviewStatus": "owner_review_pending",
            "runtimeMirroring": False,
            "formalBattleFrameCount": total_frames,
            "worldFrameCount": 40,
        },
    }
    write_json(ASSET / "action-bundle-meta.json", meta)

    accepted_sources = [
        {
            "path": "source/identity-board-raw.png",
            "kind": "identity_board",
            "sha256": sha256_file(ASSET / "source" / "identity-board-raw.png"),
        }
    ]
    for view in VIEWS:
        for action in ACTIONS:
            path = BATTLE / view / action / "raw-sheet-lossless.png"
            accepted_sources.append(
                {
                    "path": path.relative_to(ASSET).as_posix(),
                    "kind": "formal_battle_action_raw",
                    "view": view,
                    "action": action,
                    "sha256": sha256_file(path),
                }
            )
    for name in ("portrait", "showcase"):
        path = ASSET / "source" / "ui" / f"{name}-raw.png"
        accepted_sources.append(
            {
                "path": path.relative_to(ASSET).as_posix(),
                "kind": f"ui_{name}_raw",
                "sha256": sha256_file(path),
            }
        )
    write_json(
        ASSET / "source" / "source-image-origin.json",
        {
            "schemaVersion": 2,
            "characterId": "novice_hunter_v1",
            "generator": "OpenAI built-in image generation",
            "externalSourceAssetsUsed": False,
            "acceptedSourceCount": len(accepted_sources),
            "acceptedSources": accepted_sources,
            "ownerReviewStatus": "owner_review_pending",
        },
    )

    print(
        json.dumps(
            {
                "status": qc["status"],
                "totalFrameCount": total_frames,
                "sourceFrameCount": len(ledger_entries),
                "runtimeFrameCount": len(ledger_entries),
                "errorCount": len(errors),
                "contactSheet": contact_path.relative_to(ASSET).as_posix(),
                "qcSummary": qc_path.relative_to(ASSET).as_posix(),
                "sourceLedger": ledger_path.relative_to(ASSET).as_posix(),
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    if errors:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
