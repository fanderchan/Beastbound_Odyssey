#!/usr/bin/env python3
"""Narrow deterministic tests for tools/build_pet_art_bundle.py.

The JSON fixtures describe only QA geometry.  Tests render those rectangles to
temporary chroma PNGs; they are not game art and never enter runtime assets.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from PIL import Image, ImageDraw


TOOLS_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = TOOLS_DIR.parent
FIXTURE_PATH = (
    Path(__file__).resolve().parent / "fixtures" / "pet_art_bundle" / "cases.json"
)
sys.path.insert(0, str(TOOLS_DIR))

import build_pet_art_bundle as builder  # noqa: E402


class PetArtBundleBuilderTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.cases = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))

    def make_sheet(self, case_name: str, output: Path) -> dict[str, object]:
        case = self.cases[case_name]
        cell_width, cell_height = case["cellSize"]
        sheet = Image.new(
            "RGB",
            (cell_width * case["cols"], cell_height * case["rows"]),
            builder.DEFAULT_KEY,
        )
        draw = ImageDraw.Draw(sheet)
        for index, frame in enumerate(case["frames"]):
            if frame.get("empty"):
                continue
            row, col = divmod(index, case["cols"])
            offset_x = col * cell_width
            offset_y = row * cell_height

            def translated(box: list[int]) -> tuple[int, int, int, int]:
                return (
                    offset_x + box[0],
                    offset_y + box[1],
                    offset_x + box[2] - 1,
                    offset_y + box[3] - 1,
                )

            draw.rectangle(translated(frame["bbox"]), fill=tuple(frame["color"]))
            if "embeddedMagenta" in frame:
                draw.rectangle(
                    translated(frame["embeddedMagenta"]),
                    fill=tuple(frame.get("embeddedMagentaColor", builder.DEFAULT_KEY)),
                )
            if "detachedBbox" in frame:
                draw.rectangle(
                    translated(frame["detachedBbox"]),
                    fill=tuple(frame["detachedColor"]),
                )
        sheet.save(output, format="PNG")
        return case

    def options(
        self,
        input_path: Path,
        output_dir: Path,
        case: dict[str, object],
        **overrides: object,
    ) -> builder.BuildOptions:
        values: dict[str, object] = {
            "input_path": input_path,
            "output_dir": output_dir,
            "rows": case["rows"],
            "cols": case["cols"],
            "slots": tuple(f"frame-{index + 1}" for index in range(case["rows"] * case["cols"])),
            "make_gif": True,
            "make_contact_sheet": True,
        }
        values.update(overrides)
        return builder.BuildOptions(**values)

    def test_valid_sheet_writes_512_and_256_bundle_with_optional_qa(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            input_path = root / "valid.png"
            output_dir = root / "bundle"
            case = self.make_sheet("valid", input_path)
            metadata = builder.build_bundle(self.options(input_path, output_dir, case))

            self.assertEqual(metadata["tool"], builder.TOOL_NAME)
            self.assertEqual(metadata["slots"], ["frame-1", "frame-2", "frame-3", "frame-4"])
            self.assertGreater(metadata["sharedScale"], 0)
            self.assertEqual(len(metadata["frames"]), 4)
            self.assertTrue((output_dir / "animation.gif").is_file())
            self.assertTrue((output_dir / "contact-sheet.png").is_file())
            self.assertTrue((output_dir / "sheet-transparent.png").is_file())
            self.assertTrue((output_dir / "sheet-runtime-transparent.png").is_file())

            for slot in metadata["slots"]:
                with Image.open(output_dir / "source-frames" / f"{slot}.png") as source:
                    self.assertEqual(source.size, (512, 512))
                    self.assertEqual(source.mode, "RGBA")
                    self.assertEqual(source.getpixel((0, 0))[3], 0)
                with Image.open(output_dir / "runtime-frames" / f"{slot}.png") as runtime:
                    self.assertEqual(runtime.size, (256, 256))
                    self.assertEqual(runtime.mode, "RGBA")
                    self.assertEqual(runtime.getpixel((0, 0))[3], 0)

            for frame in metadata["frames"]:
                x0, y0, x1, y1 = frame["runtimeVisibleBbox"]
                self.assertGreaterEqual(x0, 4)
                self.assertGreaterEqual(y0, 4)
                self.assertLessEqual(x1, 252)
                self.assertLessEqual(y1, 252)
                self.assertEqual(frame["residualMagentaPixelsRuntime"], 0)

    def test_already_transparent_chroma_helper_output_is_supported(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            input_path = root / "valid-transparent.png"
            output_dir = root / "bundle"
            case = self.make_sheet("valid", input_path)
            with Image.open(input_path) as opened:
                rgba = opened.convert("RGBA")
            pixels = rgba.load()
            for y in range(rgba.height):
                for x in range(rgba.width):
                    if pixels[x, y][:3] == builder.DEFAULT_KEY:
                        pixels[x, y] = (0, 0, 0, 0)
            rgba.save(input_path, format="PNG")

            metadata = builder.build_bundle(
                self.options(input_path, output_dir, case, make_gif=False, make_contact_sheet=False)
            )
            self.assertTrue((output_dir / "source-frames" / "frame-1.png").is_file())
            self.assertEqual(
                metadata["frames"][0]["chroma"]["inputBackgroundMode"],
                "transparent_alpha",
            )

    def assert_case_fails(self, case_name: str, message: str) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            input_path = root / f"{case_name}.png"
            output_dir = root / "bundle"
            case = self.make_sheet(case_name, input_path)
            with self.assertRaisesRegex(builder.BundleBuildError, message):
                builder.build_bundle(self.options(input_path, output_dir, case))
            self.assertFalse(output_dir.exists(), "failed builds must not publish partial output")

    def test_empty_frame_fails_closed(self) -> None:
        self.assert_case_fails("empty", "empty frame")

    def test_source_edge_touch_fails_closed(self) -> None:
        self.assert_case_fails("edge_touch", "source subject touches")

    def test_embedded_magenta_fails_closed(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            input_path = root / "magenta_residual.png"
            output_dir = root / "bundle"
            case = self.make_sheet("magenta_residual", input_path)
            # Deliberately use a narrower key range than the residual detector
            # to prove visible fringe still fails closed after keying.
            options = self.options(
                input_path,
                output_dir,
                case,
                transparent_distance=10.0,
                opaque_distance=30.0,
            )
            with self.assertRaisesRegex(builder.BundleBuildError, "visible pixels remain too close"):
                builder.build_bundle(options)
            self.assertFalse(output_dir.exists())

    def test_dimension_drift_fails_closed(self) -> None:
        self.assert_case_fails("dimension_drift", "subject span drift")

    def test_large_detached_component_fails_closed(self) -> None:
        self.assert_case_fails("detached_component", "detached component ratio")

    def test_explicit_slot_count_is_required(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            input_path = root / "valid.png"
            case = self.make_sheet("valid", input_path)
            options = self.options(
                input_path,
                root / "bundle",
                case,
                slots=("only-one",),
            )
            with self.assertRaisesRegex(builder.BundleBuildError, "explicit slot names"):
                builder.build_bundle(options)

    def test_force_replaces_only_a_builder_owned_bundle(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            input_path = root / "valid.png"
            output_dir = root / "bundle"
            case = self.make_sheet("valid", input_path)
            builder.build_bundle(self.options(input_path, output_dir, case))
            (output_dir / "stale-file.txt").write_text("old\n", encoding="utf-8")

            metadata = builder.build_bundle(
                self.options(input_path, output_dir, case, force=True)
            )
            self.assertEqual(metadata["tool"], builder.TOOL_NAME)
            self.assertFalse((output_dir / "stale-file.txt").exists())
            self.assertTrue((output_dir / "pipeline-meta.json").is_file())

    def test_force_refuses_an_unowned_directory(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            input_path = root / "valid.png"
            output_dir = root / "not-a-bundle"
            output_dir.mkdir()
            marker = output_dir / "keep-me.txt"
            marker.write_text("user data\n", encoding="utf-8")
            case = self.make_sheet("valid", input_path)

            with self.assertRaisesRegex(builder.BundleBuildError, "not owned"):
                builder.build_bundle(
                    self.options(input_path, output_dir, case, force=True)
                )
            self.assertEqual(marker.read_text(encoding="utf-8"), "user data\n")

    def test_cli_help_describes_formal_outputs(self) -> None:
        result = subprocess.run(
            [sys.executable, str(TOOLS_DIR / "build_pet_art_bundle.py"), "--help"],
            cwd=REPO_ROOT,
            check=False,
            capture_output=True,
            text=True,
            env={**dict(os.environ), "PYTHONDONTWRITEBYTECODE": "1"},
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("transparent 512px source frames plus 256px runtime frames", result.stdout)
        self.assertIn("--slots", result.stdout)


if __name__ == "__main__":
    unittest.main()
