#!/usr/bin/env python3
"""Focused reproducibility contracts for the Firebud v4 ground atlas."""

from __future__ import annotations

import argparse
import importlib.util
import statistics
import tempfile
import unittest
from pathlib import Path

from PIL import Image, ImageEnhance


REPO_ROOT = Path(__file__).resolve().parents[2]
BUNDLE_ROOT = REPO_ROOT / "client/godot/assets/maps/firebud_region_visual_v2"
TOOL_PATH = BUNDLE_ROOT / "source/tools/build_ground_atlas_v4.py"
MATERIALS_PATH = BUNDLE_ROOT / "source/raw/firebud-ground-materials-v4.png"
SEMANTICS_PATH = (
    BUNDLE_ROOT / "source/processed/firebud-semantic-variants-v1-alpha.png"
)
TRANSITIONS_PATH = (
    BUNDLE_ROOT / "source/processed/firebud-path-edge-autotile-v3-alpha.png"
)
PLAZA_TRANSITIONS_PATH = (
    BUNDLE_ROOT / "source/processed/firebud-plaza-edge-autotile-v3-alpha.png"
)
PRE_REWORK_TRANSITIONS_PATH = (
    BUNDLE_ROOT / "source/processed/firebud-path-edge-autotile-v2-alpha.png"
)
PRE_REWORK_PLAZA_TRANSITIONS_PATH = (
    BUNDLE_ROOT / "source/processed/firebud-plaza-edge-autotile-v2-alpha.png"
)
LEGACY_TRANSITIONS_PATH = (
    BUNDLE_ROOT / "source/processed/firebud-path-edge-transitions-v1-alpha.png"
)
EXPECTED_ATLAS_SHA256 = (
    "991e8c2010ade24738b8475db0549fe9dadb38874afc96ae5490a344c0638265"
)
EXPECTED_TRANSITION_ATLAS_SHA256 = (
    "69483595ceacda974dccd08f541354616d9447c95b49dd08cf6e5d8f95441583"
)
EXPECTED_PATH_AND_PLAZA_TRANSITION_ATLAS_SHA256 = (
    "a86cb47204e6446f289d7517e623910c92228b40ff5c97dfc4c93a89765cbb85"
)

SPEC = importlib.util.spec_from_file_location("build_firebud_ground_atlas_v4", TOOL_PATH)
assert SPEC is not None and SPEC.loader is not None
TOOL = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(TOOL)


def _arguments(
    root: Path,
    name: str,
    *,
    overwrite: bool = False,
    transitions: bool = False,
    plaza_transitions: bool = False,
) -> argparse.Namespace:
    return argparse.Namespace(
        materials=MATERIALS_PATH,
        semantics=SEMANTICS_PATH,
        transitions=TRANSITIONS_PATH if transitions else None,
        plaza_transitions=PLAZA_TRANSITIONS_PATH if plaza_transitions else None,
        output=root / f"{name}.png",
        manifest=root / f"{name}.json",
        overwrite=overwrite,
    )


def _grass_mask_coverages(
    source_path: Path,
    *,
    saturation: float,
    brightness: float,
) -> list[float]:
    with Image.open(source_path) as opened:
        source = opened.convert("RGBA")
    coverages: list[float] = []
    for index in range(len(TOOL.AUTOTILE_SIGNATURES)):
        row, column = divmod(index, TOOL.AUTOTILE_GRID_SIZE)
        cell = TOOL.autotile_cell(source, column, row)
        alpha_bbox = cell.getchannel("A").getbbox()
        if alpha_bbox is None:
            raise AssertionError(f"transition cell {column},{row} is empty")
        tile = cell.crop(alpha_bbox).convert("RGBa").resize(
            TOOL.TILE_SIZE,
            Image.Resampling.LANCZOS,
        ).convert("RGBA")
        tile = ImageEnhance.Color(tile).enhance(saturation)
        tile = ImageEnhance.Brightness(tile).enhance(brightness)
        histogram = TOOL._expanded_grass_mask(tile).histogram()
        covered = sum(histogram[128:])
        coverages.append(covered / sum(histogram))
    return coverages


class BuildFirebudGroundAtlasV4Test(unittest.TestCase):
    def test_frozen_sources_reproduce_committed_atlas_exactly(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            arguments = _arguments(Path(temporary), "atlas")
            payload = TOOL.build(arguments)

            self.assertEqual(TOOL.sha256(arguments.output), EXPECTED_ATLAS_SHA256)
            self.assertEqual(payload["atlas"]["dimensions"], [320, 120])
            self.assertEqual(payload["atlas"]["tileSize"], [80, 40])
            self.assertEqual(payload["renderContract"]["mode"], "layered_semantic_overlay")
            self.assertEqual(
                [entry["tileId"] for entry in payload["tiles"]],
                list(TOOL.TILE_ORDER),
            )

    def test_complete_path_autotile_extends_atlas_without_base_drift(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            arguments = _arguments(Path(temporary), "atlas", transitions=True)
            payload = TOOL.build(arguments)

            self.assertEqual(
                TOOL.sha256(arguments.output), EXPECTED_TRANSITION_ATLAS_SHA256
            )
            self.assertEqual(payload["atlas"]["dimensions"], [320, 280])
            self.assertEqual(
                payload["renderContract"]["directionalPathTransitions"],
                list(TOOL.TRANSITION_TILE_ORDER),
            )
            self.assertEqual(
                [entry["tileId"] for entry in payload["tiles"]],
                list(TOOL.TILE_ORDER + TOOL.TRANSITION_TILE_ORDER),
            )
            self.assertEqual(
                payload["pathTransitionSource"]["grid"],
                {"rows": 4, "columns": 4},
            )
            self.assertEqual(
                payload["pathTransitionSource"]["signatures"],
                list(TOOL.AUTOTILE_SIGNATURES),
            )
            self.assertEqual(payload["pathTransitionSource"]["blankCell"], [3, 3])
            entries = {entry["tileId"]: entry for entry in payload["tiles"]}
            for tile_id in TOOL.TRANSITION_TILE_ORDER:
                entry = entries[tile_id]
                self.assertGreater(entry["alpha"]["opaquePixels"], 0)
                self.assertGreater(entry["alpha"]["partialAlphaPixels"], 0)
                self.assertLess(entry["meanRgba"][0], 140.0)
                self.assertGreater(entry["meanRgba"][1], 65.0)

    def test_plaza_transitions_extend_the_path_transition_atlas(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            arguments = _arguments(
                Path(temporary),
                "atlas",
                transitions=True,
                plaza_transitions=True,
            )
            payload = TOOL.build(arguments)

            self.assertEqual(
                TOOL.sha256(arguments.output),
                EXPECTED_PATH_AND_PLAZA_TRANSITION_ATLAS_SHA256,
            )
            self.assertEqual(payload["atlas"]["dimensions"], [320, 440])
            self.assertEqual(
                payload["renderContract"]["directionalPlazaTransitions"],
                list(TOOL.PLAZA_TRANSITION_TILE_ORDER),
            )
            self.assertEqual(
                [entry["tileId"] for entry in payload["tiles"]],
                list(
                    TOOL.TILE_ORDER
                    + TOOL.TRANSITION_TILE_ORDER
                    + TOOL.PLAZA_TRANSITION_TILE_ORDER
                ),
            )
            self.assertEqual(
                payload["plazaTransitionSource"]["grid"],
                {"rows": 4, "columns": 4},
            )
            self.assertEqual(
                payload["plazaTransitionSource"]["signatures"],
                list(TOOL.AUTOTILE_SIGNATURES),
            )
            self.assertEqual(payload["plazaTransitionSource"]["blankCell"], [3, 3])
            entries = {entry["tileId"]: entry for entry in payload["tiles"]}
            for tile_id in TOOL.PLAZA_TRANSITION_TILE_ORDER:
                entry = entries[tile_id]
                self.assertGreater(entry["alpha"]["opaquePixels"], 0)
                self.assertGreater(entry["alpha"]["partialAlphaPixels"], 0)
                # The v3 all-edge variants deliberately admit substantially more
                # meadow into the stone footprint.  Keep a honey-stone colour floor
                # without rejecting the intended broad transition at 80x40.
                self.assertGreater(entry["meanRgba"][0], 70.0)
                self.assertGreater(entry["meanRgba"][1], 75.0)

    def test_reworked_transitions_survive_eighty_by_forty_downsampling(self) -> None:
        old_path = _grass_mask_coverages(
            PRE_REWORK_TRANSITIONS_PATH,
            saturation=0.76,
            brightness=0.78,
        )
        current_path = _grass_mask_coverages(
            TRANSITIONS_PATH,
            saturation=0.76,
            brightness=0.78,
        )
        old_plaza = _grass_mask_coverages(
            PRE_REWORK_PLAZA_TRANSITIONS_PATH,
            saturation=0.72,
            brightness=0.80,
        )
        current_plaza = _grass_mask_coverages(
            PLAZA_TRANSITIONS_PATH,
            saturation=0.72,
            brightness=0.80,
        )

        self.assertGreaterEqual(min(current_path), 0.08)
        self.assertGreaterEqual(statistics.median(current_path), 0.15)
        self.assertLessEqual(max(current_path), 0.50)
        self.assertGreater(
            statistics.median(current_path),
            statistics.median(old_path) + 0.14,
        )
        self.assertGreaterEqual(min(current_plaza), 0.12)
        self.assertGreaterEqual(statistics.median(current_plaza), 0.24)
        self.assertLessEqual(max(current_plaza), 0.55)
        self.assertGreater(
            statistics.median(current_plaza),
            statistics.median(old_plaza) + 0.10,
        )

    def test_legacy_four_single_edge_sheet_fails_closed(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            arguments = _arguments(Path(temporary), "atlas", transitions=True)
            arguments.transitions = LEGACY_TRANSITIONS_PATH
            with self.assertRaises(TOOL.BuildError):
                TOOL.build(arguments)

    def test_repeat_build_is_byte_deterministic(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            first = _arguments(root, "first")
            second = _arguments(root, "second")
            TOOL.build(first)
            TOOL.build(second)

            self.assertEqual(TOOL.sha256(first.output), TOOL.sha256(second.output))
            self.assertEqual(first.output.read_bytes(), second.output.read_bytes())

    def test_base_tiles_are_opaque_and_semantic_tiles_are_feathered(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            payload = TOOL.build(_arguments(Path(temporary), "atlas"))
            entries = {entry["tileId"]: entry for entry in payload["tiles"]}
            for tile_id in payload["renderContract"]["baseTiles"]:
                self.assertGreater(entries[tile_id]["alpha"]["opaquePixels"], 0)
            for tile_id in payload["renderContract"]["semanticOverlays"]:
                self.assertEqual(entries[tile_id]["alpha"]["opaquePixels"], 0)
                self.assertGreater(entries[tile_id]["alpha"]["partialAlphaPixels"], 0)

    def test_existing_outputs_fail_closed_without_overwrite(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            arguments = _arguments(Path(temporary), "atlas")
            TOOL.build(arguments)
            before = arguments.output.read_bytes()

            with self.assertRaises(TOOL.BuildError):
                TOOL.build(arguments)
            self.assertEqual(arguments.output.read_bytes(), before)

    def test_output_and_manifest_must_be_distinct(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "same-output"
            arguments = argparse.Namespace(
                materials=MATERIALS_PATH,
                semantics=SEMANTICS_PATH,
                transitions=None,
                plaza_transitions=None,
                output=path,
                manifest=path,
                overwrite=False,
            )
            with self.assertRaises(TOOL.BuildError):
                TOOL.build(arguments)


if __name__ == "__main__":
    unittest.main()
