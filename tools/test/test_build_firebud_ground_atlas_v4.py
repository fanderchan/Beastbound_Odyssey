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
EXPECTED_ATLAS_SHA256 = (
    "991e8c2010ade24738b8475db0549fe9dadb38874afc96ae5490a344c0638265"
)

SPEC = importlib.util.spec_from_file_location("build_firebud_ground_atlas_v4", TOOL_PATH)
assert SPEC is not None and SPEC.loader is not None
TOOL = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(TOOL)


def _arguments(root: Path, name: str, *, overwrite: bool = False) -> argparse.Namespace:
    return argparse.Namespace(
        materials=MATERIALS_PATH,
        semantics=SEMANTICS_PATH,
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
                output=path,
                manifest=path,
                overwrite=False,
            )
            with self.assertRaises(TOOL.BuildError):
                TOOL.build(arguments)


if __name__ == "__main__":
    unittest.main()
