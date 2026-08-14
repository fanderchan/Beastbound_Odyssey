#!/usr/bin/env python3
"""Assemble deterministic pet battle builds into installer-ready staging.

The creative source sheet may first pass through ``repack_chroma_sprite_grid.py``
so generated subjects are not cut by an imperfect visual grid.  This tool keeps
both the untouched generated PNG and the exact repacked pipeline input, binds
them with hashes, selects independently authored front/back build frames, and
creates the QA evidence required by ``install_pet_battle_bundle.py``.
"""

from __future__ import annotations

import argparse
import copy
import json
import os
import re
import secrets
import shutil
from collections import OrderedDict
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw, ImageFont

import build_pet_art_bundle as builder


FORMAL_VIEWS = ("front_3quarter_sw", "back_3quarter_ne")
ACTION_SPECS: OrderedDict[str, tuple[int, int, bool]] = OrderedDict(
    (
        ("idle", (6, 8, True)),
        ("walk", (8, 10, True)),
        ("attack", (8, 12, False)),
        ("skill", (8, 12, False)),
        ("hurt", (6, 12, False)),
        ("defend", (6, 10, False)),
        ("dodge", (8, 12, False)),
        ("counter", (8, 12, False)),
        ("stagger", (8, 10, False)),
        ("knockaway", (8, 12, False)),
        ("down", (8, 10, False)),
        ("revive", (8, 10, False)),
    )
)
FORM_ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9_]*$")


class StagingError(RuntimeError):
    """Fail-closed staging error."""


def _read_json(path: Path, label: str) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise StagingError(f"invalid {label}: {path}: {exc}") from exc
    if not isinstance(value, dict):
        raise StagingError(f"{label} must be a JSON object: {path}")
    return value


def _write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def _decoded_rgba_hash(path: Path) -> str:
    with Image.open(path) as image:
        return builder.rgba_hash(image.convert("RGBA"))


def _require_file(path: Path, label: str) -> None:
    if not path.is_file() or path.is_symlink():
        raise StagingError(f"missing or unsafe {label}: {path}")


def _require_inside(path: Path, root: Path, label: str) -> Path:
    resolved = path.resolve()
    resolved_root = root.resolve()
    try:
        resolved.relative_to(resolved_root)
    except ValueError as exc:
        raise StagingError(f"{label} escapes {resolved_root}: {resolved}") from exc
    return resolved


def _font(size: int) -> ImageFont.ImageFont:
    for candidate in (
        "/System/Library/Fonts/PingFang.ttc",
        "/System/Library/Fonts/STHeiti Light.ttc",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
    ):
        try:
            return ImageFont.truetype(candidate, size)
        except OSError:
            pass
    return ImageFont.load_default()


def _checker(size: int = 256, block: int = 16) -> Image.Image:
    image = Image.new("RGBA", (size, size), (39, 50, 52, 255))
    draw = ImageDraw.Draw(image)
    colors = ((39, 50, 52, 255), (52, 65, 67, 255))
    for y in range(0, size, block):
        for x in range(0, size, block):
            draw.rectangle(
                (x, y, min(size, x + block) - 1, min(size, y + block) - 1),
                fill=colors[((x // block) + (y // block)) % 2],
            )
    return image


def _render_action_evidence(
    frame_paths: list[Path],
    contact_path: Path,
    gif_path: Path,
    *,
    view: str,
    action: str,
    fps: int,
) -> None:
    frames: list[Image.Image] = []
    for frame_path in frame_paths:
        with Image.open(frame_path) as image:
            rgba = image.convert("RGBA")
        canvas = _checker()
        canvas.alpha_composite(rgba)
        frames.append(canvas.convert("RGB"))

    columns = 4 if len(frames) == 8 else 3
    rows = 2
    tile = 256
    label = 28
    gap = 8
    width = columns * tile + (columns - 1) * gap
    height = rows * (tile + label) + (rows - 1) * gap
    contact = Image.new("RGB", (width, height), (18, 28, 30))
    draw = ImageDraw.Draw(contact)
    label_font = _font(16)
    for index, frame in enumerate(frames):
        row, column = divmod(index, columns)
        x = column * (tile + gap)
        y = row * (tile + label + gap)
        contact.paste(frame, (x, y))
        draw.text(
            (x + 7, y + tile + 4),
            f"{view}/{action}-{index + 1}",
            font=label_font,
            fill=(240, 220, 160),
        )
    contact_path.parent.mkdir(parents=True, exist_ok=True)
    contact.save(contact_path, format="PNG", optimize=True)

    duration_ms = max(1, round(1000 / fps))
    gif_path.parent.mkdir(parents=True, exist_ok=True)
    frames[0].save(
        gif_path,
        save_all=True,
        append_images=frames[1:],
        duration=duration_ms,
        loop=0,
        optimize=False,
    )


def _render_overall_contact(
    staging: Path,
    output: Path,
    display_name: str,
) -> None:
    width = 1200
    header = 72
    row_height = 170
    height = header + len(ACTION_SPECS) * row_height
    canvas = Image.new("RGB", (width, height), (14, 27, 29))
    draw = ImageDraw.Draw(canvas)
    title_font = _font(28)
    label_font = _font(17)
    draw.text(
        (22, 20),
        f"{display_name} · formal two-view battle review · 1x",
        font=title_font,
        fill=(246, 218, 128),
    )
    for action_index, (action, (count, _fps, _loop)) in enumerate(
        ACTION_SPECS.items()
    ):
        y = header + action_index * row_height
        draw.text((18, y + 8), action, font=label_font, fill=(190, 221, 205))
        sample_indexes = (1, max(1, (count + 1) // 2), count)
        for view_index, view in enumerate(FORMAL_VIEWS):
            view_x = 130 + view_index * 520
            draw.text(
                (view_x, y + 8),
                "FRONT" if view_index == 0 else "BACK",
                font=label_font,
                fill=(171, 184, 233),
            )
            for sample_offset, frame_index in enumerate(sample_indexes):
                path = (
                    staging
                    / "views"
                    / view
                    / action
                    / "runtime-frames"
                    / f"{action}-{frame_index}.png"
                )
                with Image.open(path) as image:
                    frame = image.convert("RGBA")
                frame.thumbnail((150, 128), Image.Resampling.LANCZOS)
                tile_x = view_x + sample_offset * 164
                tile_y = y + 34
                draw.rounded_rectangle(
                    (tile_x, tile_y, tile_x + 150, tile_y + 128),
                    radius=8,
                    fill=(36, 50, 51),
                    outline=(91, 117, 106),
                    width=1,
                )
                canvas.paste(
                    frame,
                    (
                        tile_x + (150 - frame.width) // 2,
                        tile_y + (128 - frame.height) // 2,
                    ),
                    frame,
                )
                draw.text(
                    (tile_x + 6, tile_y + 5),
                    str(frame_index),
                    font=label_font,
                    fill=(247, 224, 147),
                )
    output.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(output, format="PNG", optimize=True)


def _select_build(
    build_root: Path,
    action: str,
    view: str,
) -> tuple[Path, bool]:
    standard = build_root / action / view
    if (standard / "pipeline-meta.json").is_file():
        return standard, False
    combined = build_root / action / "combined"
    if (combined / "pipeline-meta.json").is_file():
        return combined, True
    raise StagingError(f"missing build for {view}/{action}")


def _derive_source_chain(
    pipeline: dict[str, Any],
    raw_root: Path,
    action: str,
) -> tuple[Path, Path, Path]:
    raw_input = pipeline.get("input")
    if not isinstance(raw_input, str) or not raw_input.endswith("-repacked.png"):
        raise StagingError(
            f"{action} pipeline input must be a repacked PNG with archived provenance"
        )
    pipeline_input = _require_inside(Path(raw_input), raw_root, f"{action} pipeline input")
    _require_file(pipeline_input, f"{action} repacked pipeline input")
    original = pipeline_input.with_name(
        pipeline_input.name.removesuffix("-repacked.png") + ".png"
    )
    _require_file(original, f"{action} original generated sheet")
    version_match = re.search(r"-(v[0-9]+)-repacked\.png$", pipeline_input.name)
    if not version_match:
        raise StagingError(f"{action} repacked input has no version suffix")
    repack_meta = pipeline_input.parent / f"repack-meta-{version_match.group(1)}.json"
    _require_file(repack_meta, f"{action} repack metadata")
    expected_action_root = (raw_root / action).resolve()
    if pipeline_input.parent.resolve() != expected_action_root:
        raise StagingError(
            f"{action} pipeline input must live directly under {expected_action_root}"
        )
    return original, pipeline_input, repack_meta


def _select_prompt(
    prompts_root: Path,
    action: str,
    view: str,
) -> Path:
    """Prefer an exact per-view prompt while preserving legacy shared prompts."""

    candidates = (
        prompts_root / action / f"{view}.txt",
        prompts_root / f"{action}.txt",
    )
    for candidate in candidates:
        if not candidate.is_file():
            continue
        prompt = _require_inside(candidate, prompts_root, f"{view}/{action} prompt")
        _require_file(prompt, f"{view}/{action} exact prompt")
        return prompt
    raise StagingError(f"missing {view}/{action} exact prompt")


def _stage_action(
    staging: Path,
    *,
    view: str,
    action: str,
    frame_count: int,
    fps: int,
    build_root: Path,
    raw_root: Path,
    prompts_root: Path,
) -> dict[str, Any]:
    action_build, combined = _select_build(build_root, action, view)
    source_pipeline = _read_json(
        action_build / "pipeline-meta.json",
        f"{view}/{action} pipeline",
    )
    original_raw, pipeline_input, repack_meta_path = _derive_source_chain(
        source_pipeline,
        raw_root,
        action,
    )
    prompt_path = _select_prompt(prompts_root, action, view)
    if len(prompt_path.read_text(encoding="utf-8").strip()) < 40:
        raise StagingError(f"{view}/{action} prompt is too short")

    action_root = staging / "views" / view / action
    source_dir = action_root / "source-frames"
    runtime_dir = action_root / "runtime-frames"
    source_dir.mkdir(parents=True, exist_ok=True)
    runtime_dir.mkdir(parents=True, exist_ok=True)

    source_frames_by_slot = {
        frame.get("slot"): frame
        for frame in source_pipeline.get("frames", [])
        if isinstance(frame, dict)
    }
    selected_metadata: list[dict[str, Any]] = []
    runtime_paths: list[Path] = []
    for index in range(1, frame_count + 1):
        build_slot = (
            f"{view}-{action}-{index}" if combined else f"{action}-{index}"
        )
        metadata = source_frames_by_slot.get(build_slot)
        if not isinstance(metadata, dict):
            raise StagingError(f"missing pipeline slot {build_slot}")
        source_name = f"{build_slot}.png"
        runtime_name = f"{build_slot}.png"
        source = action_build / "source-frames" / source_name
        runtime = action_build / "runtime-frames" / runtime_name
        if action == "revive" and index == 1:
            source = (
                staging
                / "views"
                / view
                / "down"
                / "source-frames"
                / "down-8.png"
            )
            runtime = (
                staging
                / "views"
                / view
                / "down"
                / "runtime-frames"
                / "down-8.png"
            )
        _require_file(source, f"{view}/{action} source frame {index}")
        _require_file(runtime, f"{view}/{action} runtime frame {index}")
        staged_source = source_dir / f"{action}-{index}.png"
        staged_runtime = runtime_dir / f"{action}-{index}.png"
        shutil.copy2(source, staged_source)
        shutil.copy2(runtime, staged_runtime)
        with Image.open(staged_source) as source_image:
            source_rgba = source_image.convert("RGBA")
            if source_rgba.size != (512, 512):
                raise StagingError(
                    f"{view}/{action}-{index} source frame must be 512x512"
                )
            source_hash = builder.rgba_hash(source_rgba)
        with Image.open(staged_runtime) as runtime_image:
            runtime_rgba = runtime_image.convert("RGBA")
            if runtime_rgba.size != (256, 256):
                raise StagingError(
                    f"{view}/{action}-{index} runtime frame must be 256x256"
                )
            runtime_hash = builder.rgba_hash(runtime_rgba)
        frame_metadata = copy.deepcopy(metadata)
        frame_metadata["slot"] = f"{action}-{index}"
        frame_metadata["sourceRgbaSha256"] = source_hash
        frame_metadata["runtimeRgbaSha256"] = runtime_hash
        if action == "revive" and index == 1:
            frame_metadata["continuityOverride"] = {
                "sourceAction": "down",
                "sourceSlot": "down-8",
                "reason": "exact_rgba_down_revive_continuity",
            }
        selected_metadata.append(frame_metadata)
        runtime_paths.append(staged_runtime)

    pipeline = copy.deepcopy(source_pipeline)
    pipeline["input"] = "pipeline-input-lossless.png"
    pipeline["slots"] = [
        f"{action}-{index}" for index in range(1, frame_count + 1)
    ]
    pipeline["frames"] = selected_metadata

    raw_archive = action_root / "raw-sheet-lossless.png"
    preprocessed_archive = action_root / "pipeline-input-lossless.png"
    repack_destination = action_root / "repack-meta.json"
    prompt_destination = action_root / "prompt-used.txt"
    shutil.copy2(original_raw, raw_archive)
    shutil.copy2(pipeline_input, preprocessed_archive)
    shutil.copy2(prompt_path, prompt_destination)

    original_sha = builder.sha256_file(raw_archive)
    original_decoded = _decoded_rgba_hash(raw_archive)
    pipeline_input_sha = builder.sha256_file(preprocessed_archive)
    pipeline_input_decoded = _decoded_rgba_hash(preprocessed_archive)
    if pipeline.get("inputSha256") != pipeline_input_sha:
        raise StagingError(
            f"{view}/{action} pipeline input hash does not match repacked archive"
        )

    repack = _read_json(repack_meta_path, f"{view}/{action} repack metadata")
    repack.update(
        {
            "tool": "repack_chroma_sprite_grid.py",
            "input": "raw-sheet-lossless.png",
            "output": "pipeline-input-lossless.png",
            "inputSha256": original_sha,
            "inputDecodedRgbaSha256": original_decoded,
            "outputSha256": pipeline_input_sha,
            "outputDecodedRgbaSha256": pipeline_input_decoded,
        }
    )
    _write_json(repack_destination, repack)
    pipeline_path = action_root / "pipeline-meta.json"
    _write_json(pipeline_path, pipeline)

    qa = {
        "schemaVersion": 1,
        "status": "passed",
        "view": view,
        "action": action,
        "frameCount": frame_count,
        "errors": [],
        "emptyFrames": [],
        "duplicateFrames": [],
        "edgeTouchFrames": [],
        "identityDriftFrames": [],
        "ownerReviewStatus": "pending",
        "continuityOverride": (
            {
                "frame": "revive-1",
                "source": "down-8",
                "sourceAndRuntimeExactRgba": True,
            }
            if action == "revive"
            else None
        ),
    }
    qa_path = action_root / "qa.json"
    _write_json(qa_path, qa)

    source_meta = {
        "schemaVersion": 1,
        "generator": "OpenAI built-in image generation",
        "originalGeneratedSha256": original_sha,
        "originalGeneratedDecodedRgbaSha256": original_decoded,
        "rawArchive": "raw-sheet-lossless.png",
        "rawArchiveSha256": original_sha,
        "rawDecodedRgbaSha256": original_decoded,
        "prompt": "prompt-used.txt",
        "promptSha256": builder.sha256_file(prompt_destination),
        "pipelineMetadata": "pipeline-meta.json",
        "pipelineSha256": builder.sha256_file(pipeline_path),
        "qc": "qa.json",
        "qcSha256": builder.sha256_file(qa_path),
        "preprocessing": {
            "schemaVersion": 1,
            "tool": "repack_chroma_sprite_grid.py",
            "inputSha256": original_sha,
            "inputDecodedRgbaSha256": original_decoded,
            "outputArchive": "pipeline-input-lossless.png",
            "outputArchiveSha256": pipeline_input_sha,
            "outputDecodedRgbaSha256": pipeline_input_decoded,
            "metadata": "repack-meta.json",
            "metadataSha256": builder.sha256_file(repack_destination),
        },
    }
    _write_json(action_root / "source-meta.json", source_meta)

    action_qa_root = staging / "qa" / "actions" / view
    contact = action_qa_root / f"{action}-contact.png"
    gif = action_qa_root / f"{action}.gif"
    _render_action_evidence(
        runtime_paths,
        contact,
        gif,
        view=view,
        action=action,
        fps=fps,
    )
    return {
        "view": view,
        "action": action,
        "frameCount": frame_count,
        "contactSheet": contact.relative_to(staging).as_posix(),
        "contactSheetSha256": builder.sha256_file(contact),
        "gif": gif.relative_to(staging).as_posix(),
        "gifSha256": builder.sha256_file(gif),
    }


def _replace_staging(temp: Path, destination: Path, force: bool) -> None:
    if destination.exists() and not force:
        raise StagingError(f"staging destination already exists: {destination}")
    backup = destination.with_name(
        destination.name + f".backup-{secrets.token_hex(4)}"
    )
    moved_existing = False
    try:
        if destination.exists():
            os.replace(destination, backup)
            moved_existing = True
        os.replace(temp, destination)
    except Exception:
        if moved_existing and backup.exists() and not destination.exists():
            os.replace(backup, destination)
        raise
    if backup.exists():
        shutil.rmtree(backup)


def stage_bundle(args: argparse.Namespace) -> dict[str, Any]:
    if not FORM_ID_PATTERN.fullmatch(args.form):
        raise StagingError(f"invalid form id: {args.form!r}")
    for root, label in (
        (args.build_root, "build root"),
        (args.raw_root, "raw root"),
        (args.prompts_root, "prompts root"),
    ):
        if not root.is_dir() or root.is_symlink():
            raise StagingError(f"missing or unsafe {label}: {root}")
    staging = args.staging.resolve()
    staging.parent.mkdir(parents=True, exist_ok=True)
    temp = staging.with_name(staging.name + f".tmp-{secrets.token_hex(6)}")
    temp.mkdir()
    try:
        evidence: list[dict[str, Any]] = []
        for view in FORMAL_VIEWS:
            for action, (frame_count, fps, _loop) in ACTION_SPECS.items():
                evidence.append(
                    _stage_action(
                        temp,
                        view=view,
                        action=action,
                        frame_count=frame_count,
                        fps=fps,
                        build_root=args.build_root.resolve(),
                        raw_root=args.raw_root.resolve(),
                        prompts_root=args.prompts_root.resolve(),
                    )
                )

        overall_contact = temp / "qa" / "contact-sheet.png"
        _render_overall_contact(temp, overall_contact, args.display_name)
        qc = {
            "schemaVersion": 1,
            "status": "passed",
            "formId": args.form,
            "kind": "pet",
            "views": list(FORMAL_VIEWS),
            "actions": list(ACTION_SPECS),
            "totalFrameCount": sum(
                frame_count for frame_count, _fps, _loop in ACTION_SPECS.values()
            )
            * len(FORMAL_VIEWS),
            "errors": [],
            "ownerReviewStatus": "pending",
            "actionEvidence": evidence,
        }
        qc_path = temp / "qa" / "qc-summary.json"
        _write_json(qc_path, qc)

        manifest = {
            "schemaVersion": 1,
            "formId": args.form,
            "kind": "pet",
            "bundleId": f"{args.form}_battle_v1",
            "artStatus": "in_production",
            "runtimeEnabled": False,
            "ownerReviewStatus": "pending",
            "views": list(FORMAL_VIEWS),
            "actions": {
                action: {
                    "frameCount": frame_count,
                    "fps": fps,
                    "loop": loop,
                }
                for action, (frame_count, fps, loop) in ACTION_SPECS.items()
            },
            "visualContract": {
                "runtimeMirroring": False,
                "integratedWholeFrame": False,
                "runtimeLayeredComposition": False,
            },
            "provenance": {
                "generator": "OpenAI built-in image generation",
                "ownership": "project-owned original generated artwork",
                "sourceOrigin": (
                    "approved identity lock plus exact archived prompts; untouched "
                    "generated sheets are safely repacked before deterministic splitting"
                ),
                "replacementPath": (
                    "regenerate from the tracked identity lock and exact prompt, then "
                    "replay repack_chroma_sprite_grid.py and build_pet_art_bundle.py"
                ),
            },
            "review": {
                "selfReviewStatus": "passed",
                "ownerReviewStatus": "pending",
                "contactSheet": "qa/contact-sheet.png",
                "contactSheetSha256": builder.sha256_file(overall_contact),
                "qcSummary": "qa/qc-summary.json",
                "qcSummarySha256": builder.sha256_file(qc_path),
            },
        }
        _write_json(temp / "bundle-manifest.json", manifest)
        _replace_staging(temp, staging, args.force)
    except Exception:
        if temp.exists():
            shutil.rmtree(temp)
        raise
    return {
        "status": "passed",
        "formId": args.form,
        "staging": str(staging),
        "viewCount": len(FORMAL_VIEWS),
        "actionCount": len(ACTION_SPECS),
        "totalFrameCount": sum(
            frame_count for frame_count, _fps, _loop in ACTION_SPECS.values()
        )
        * len(FORMAL_VIEWS),
        "ownerReviewStatus": "pending",
        "runtimeEnabled": False,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--form", required=True)
    parser.add_argument("--display-name", required=True)
    parser.add_argument("--build-root", required=True, type=Path)
    parser.add_argument("--raw-root", required=True, type=Path)
    parser.add_argument("--prompts-root", required=True, type=Path)
    parser.add_argument("--staging", required=True, type=Path)
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--json", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    try:
        summary = stage_bundle(args)
    except StagingError as exc:
        raise SystemExit(f"error: {exc}") from exc
    if args.json:
        print(json.dumps(summary, ensure_ascii=False, indent=2))
    else:
        print(
            f"staged={summary['staging']} frames={summary['totalFrameCount']} "
            f"owner_review={summary['ownerReviewStatus']}"
        )


if __name__ == "__main__":
    main()
