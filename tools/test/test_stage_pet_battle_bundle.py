#!/usr/bin/env python3
"""Contract tests for tools/stage_pet_battle_bundle.py."""

from __future__ import annotations

import argparse
import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw


REPO_ROOT = Path(__file__).resolve().parents[2]
TOOLS_DIR = REPO_ROOT / "tools"
STAGE_TOOL_PATH = TOOLS_DIR / "stage_pet_battle_bundle.py"
INSTALL_TOOL_PATH = TOOLS_DIR / "install_pet_battle_bundle.py"
sys.path.insert(0, str(TOOLS_DIR))

import build_pet_art_bundle as BUILDER  # noqa: E402


def _load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


STAGER = _load_module("stage_pet_battle_bundle", STAGE_TOOL_PATH)
INSTALLER = _load_module("stage_test_install_pet_battle_bundle", INSTALL_TOOL_PATH)


def _write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def _source_frame(
    view_index: int,
    action_index: int,
    frame_index: int,
) -> Image.Image:
    image = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    x_shift = frame_index * 2
    color = (
        55 + action_index * 11,
        92 + view_index * 74,
        65 + frame_index * 13,
        255,
    )
    draw.rounded_rectangle(
        (126 + x_shift, 116, 374 + x_shift, 463),
        radius=44,
        fill=color,
    )
    draw.polygon(
        (
            (145 + x_shift, 151),
            (178 + x_shift, 73),
            (208 + x_shift, 152),
        ),
        fill=(231, 166, 65, 255),
    )
    eye_x = 185 + view_index * 76 + x_shift
    draw.ellipse((eye_x, 182, eye_x + 22, 204), fill=(13, 24, 35, 255))
    marker_x = 174 + frame_index * 15
    draw.polygon(
        (
            (marker_x, 328 + action_index % 6),
            (marker_x + 12, 310),
            (marker_x + 27, 334),
        ),
        fill=(245, 220 - frame_index * 4, 72 + action_index, 255),
    )
    return image


def _materialize_action(
    root: Path,
    action: str,
    *,
    combined: bool,
) -> None:
    frame_count, _fps, _loop = STAGER.ACTION_SPECS[action]
    action_index = list(STAGER.ACTION_SPECS).index(action)
    raw_action_root = root / "raw" / action
    raw_action_root.mkdir(parents=True, exist_ok=True)
    original = raw_action_root / "combined-views-v1.png"
    repacked = raw_action_root / "combined-views-v1-repacked.png"
    raw_sheet = Image.new("RGBA", (128, 128), (255, 0, 255, 255))
    ImageDraw.Draw(raw_sheet).rounded_rectangle(
        (23, 16, 106, 119),
        radius=20,
        fill=(61 + action_index * 6, 101, 144, 255),
    )
    raw_sheet.save(original, format="PNG")
    raw_sheet.save(repacked, format="PNG")
    _write_json(
        raw_action_root / "repack-meta-v1.json",
        {
            "schemaVersion": 1,
            "tool": "repack_chroma_sprite_grid.py",
            "inputSha256": BUILDER.sha256_file(original),
            "outputSha256": BUILDER.sha256_file(repacked),
        },
    )
    prompts_root = root / "prompts"
    prompts_root.mkdir(parents=True, exist_ok=True)
    (prompts_root / f"{action}.txt").write_text(
        (
            "Create one exact original fusion creature action sheet with two "
            f"independently authored views for the {action} motion and stable identity."
        ),
        encoding="utf-8",
    )

    if combined:
        build_roots = [(root / "build" / action / "combined", None)]
    else:
        build_roots = [
            (
                root / "build" / action / view,
                view,
            )
            for view in STAGER.FORMAL_VIEWS
        ]
    for build_root, only_view in build_roots:
        source_root = build_root / "source-frames"
        runtime_root = build_root / "runtime-frames"
        source_root.mkdir(parents=True, exist_ok=True)
        runtime_root.mkdir(parents=True, exist_ok=True)
        frames: list[dict[str, Any]] = []
        slots: list[str] = []
        target_views = (
            STAGER.FORMAL_VIEWS if only_view is None else (only_view,)
        )
        for view in target_views:
            view_index = STAGER.FORMAL_VIEWS.index(view)
            for frame_index in range(1, frame_count + 1):
                slot = (
                    f"{view}-{action}-{frame_index}"
                    if combined
                    else f"{action}-{frame_index}"
                )
                source = _source_frame(
                    view_index,
                    action_index,
                    frame_index,
                )
                runtime, _cleaned = BUILDER.derive_runtime_frame(
                    source,
                    (255, 0, 255),
                    30.0,
                    96,
                )
                source.save(source_root / f"{slot}.png")
                runtime.save(runtime_root / f"{slot}.png")
                slots.append(slot)
                frames.append(
                    {
                        "slot": slot,
                        "sourceRgbaSha256": BUILDER.rgba_hash(source),
                        "runtimeRgbaSha256": BUILDER.rgba_hash(runtime),
                    }
                )
        _write_json(
            build_root / "pipeline-meta.json",
            {
                "schemaVersion": 1,
                "tool": "build_pet_art_bundle.py",
                "input": str(repacked.resolve()),
                "inputSha256": BUILDER.sha256_file(repacked),
                "slots": slots,
                "sourceFrameSize": 512,
                "runtimeFrameSize": 256,
                "safeMargin": 8,
                "effectiveSourceMargin": 16,
                "key": "#FF00FF",
                "residualMagentaDistance": 30.0,
                "fringeCleanupAlpha": 96,
                "frames": frames,
            },
        )


class StagePetBattleBundleTest(unittest.TestCase):
    def test_full_stage_is_installer_ready_and_preserves_continuity(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for action in STAGER.ACTION_SPECS:
                _materialize_action(
                    root,
                    action,
                    combined=action in {"hurt", "defend"},
                )
            staging = root / "staging"
            summary = STAGER.stage_bundle(
                argparse.Namespace(
                    form="fixture_fusion_pet_v1",
                    display_name="Fixture Fusion Pet",
                    build_root=root / "build",
                    raw_root=root / "raw",
                    prompts_root=root / "prompts",
                    staging=staging,
                    force=False,
                )
            )

            self.assertEqual(summary["totalFrameCount"], 180)
            self.assertFalse(summary["runtimeEnabled"])
            self.assertEqual(summary["ownerReviewStatus"], "pending")
            self.assertEqual(
                len(list(staging.glob("views/*/*/source-frames/*.png"))),
                180,
            )
            self.assertEqual(
                len(list(staging.glob("views/*/*/runtime-frames/*.png"))),
                180,
            )
            for view in STAGER.FORMAL_VIEWS:
                for frame_kind in ("source-frames", "runtime-frames"):
                    down = (
                        staging
                        / "views"
                        / view
                        / "down"
                        / frame_kind
                        / "down-8.png"
                    )
                    revive = (
                        staging
                        / "views"
                        / view
                        / "revive"
                        / frame_kind
                        / "revive-1.png"
                    )
                    self.assertEqual(down.read_bytes(), revive.read_bytes())
                source_meta = json.loads(
                    (
                        staging
                        / "views"
                        / view
                        / "hurt"
                        / "source-meta.json"
                    ).read_text(encoding="utf-8")
                )
                self.assertEqual(
                    source_meta["preprocessing"]["tool"],
                    "repack_chroma_sprite_grid.py",
                )

            validated = INSTALLER.validate_bundle(
                INSTALLER.InstallOptions(
                    staging=staging,
                    destination=root / "isolated-pet-root",
                    form_id="fixture_fusion_pet_v1",
                    kind="pet",
                    character_id=None,
                    dry_run=True,
                    archive_mode="full",
                )
            )
            self.assertEqual(
                len(
                    [
                        entry
                        for entry in validated.copies
                        if entry.destination_relative.parts[0] == "views"
                    ]
                ),
                180,
            )

    def test_source_chain_must_stay_inside_action_raw_root(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            raw_root = root / "raw"
            action_root = raw_root / "attack"
            action_root.mkdir(parents=True)
            outside = root / "outside-v1-repacked.png"
            Image.new("RGBA", (8, 8), (255, 0, 255, 255)).save(outside)
            pipeline = {"input": str(outside)}

            with self.assertRaisesRegex(
                STAGER.StagingError,
                "escapes",
            ):
                STAGER._derive_source_chain(
                    pipeline,
                    raw_root,
                    "attack",
                )


if __name__ == "__main__":
    unittest.main()
