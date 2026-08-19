#!/usr/bin/env python3
"""Focused reproducibility contracts for the Firebud v4 ground atlas."""

from __future__ import annotations

import argparse
import importlib.util
import tempfile
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
BUNDLE_ROOT = REPO_ROOT / "client/godot/assets/maps/firebud_region_visual_v2"
TOOL_PATH = BUNDLE_ROOT / "source/tools/build_ground_atlas_v4.py"
MATERIALS_PATH = BUNDLE_ROOT / "source/raw/firebud-ground-materials-v4.png"
SEMANTICS_PATH = (
    BUNDLE_ROOT / "source/processed/firebud-semantic-variants-v1-alpha.png"
)
TRANSITIONS_PATH = (
    BUNDLE_ROOT / "source/processed/firebud-path-edge-autotile-v2-alpha.png"
)
PLAZA_TRANSITIONS_PATH = (
    BUNDLE_ROOT / "source/processed/firebud-plaza-edge-autotile-v2-alpha.png"
)
LEGACY_TRANSITIONS_PATH = (
    BUNDLE_ROOT / "source/processed/firebud-path-edge-transitions-v1-alpha.png"
)
EXPECTED_ATLAS_SHA256 = (
    "991e8c2010ade24738b8475db0549fe9dadb38874afc96ae5490a344c0638265"
)
EXPECTED_TRANSITION_ATLAS_SHA256 = (
    "a5125f527f56286a78cb84a7f0ef6ab3cdf05cb6d2a488680acba0884e79498d"
)
EXPECTED_PATH_AND_PLAZA_TRANSITION_ATLAS_SHA256 = (
    "5a57acdf761d5c3ed4a901178bc9407368f33b46e367c38c909aad3bbc80dd31"
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
                self.assertGreater(entry["meanRgba"][0], 80.0)
                self.assertGreater(entry["meanRgba"][1], 75.0)

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
