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

import numpy as np
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

    def test_contiguous_row_ranges_share_one_honest_generation_sheet(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            input_path = root / "shared-front-back.png"
            rows, cols = 4, 2
            cell_width, cell_height = 128, 128
            sheet = Image.new(
                "RGB",
                (cell_width * cols, cell_height * rows),
                builder.DEFAULT_KEY,
            )
            draw = ImageDraw.Draw(sheet)
            for index in range(rows * cols):
                row, col = divmod(index, cols)
                x = col * cell_width
                y = row * cell_height
                draw.rounded_rectangle(
                    (x + 24, y + 18, x + 102, y + 116),
                    radius=16,
                    fill=(40 + index * 17, 100 + row * 20, 170 - col * 30),
                )
                draw.rectangle(
                    (x + 38 + index, y + 48, x + 48 + index, y + 62),
                    fill=(238, 214, 86),
                )
            sheet.save(input_path, format="PNG")

            top = builder.build_bundle(
                builder.BuildOptions(
                    input_path=input_path,
                    output_dir=root / "top",
                    rows=rows,
                    cols=cols,
                    row_start=0,
                    row_count=2,
                    slots=tuple(f"front-{index}" for index in range(1, 5)),
                )
            )
            bottom = builder.build_bundle(
                builder.BuildOptions(
                    input_path=input_path,
                    output_dir=root / "bottom",
                    rows=rows,
                    cols=cols,
                    row_start=2,
                    row_count=2,
                    slots=tuple(f"back-{index}" for index in range(1, 5)),
                )
            )

            self.assertEqual(top["inputSha256"], bottom["inputSha256"])
            self.assertEqual(top["rowStart"], 0)
            self.assertEqual(bottom["rowStart"], 2)
            self.assertEqual(top["rowCount"], 2)
            self.assertEqual(bottom["rowCount"], 2)
            self.assertEqual([frame["grid"][0] for frame in top["frames"]], [0, 0, 1, 1])
            self.assertEqual([frame["grid"][0] for frame in bottom["frames"]], [2, 2, 3, 3])
            self.assertGreater(
                bottom["frames"][0]["sourceCellBox"][1],
                top["frames"][-1]["sourceCellBox"][1],
            )
            with Image.open(root / "bottom/sheet-runtime-transparent.png") as output:
                self.assertEqual(output.size, (cols * 256, 2 * 256))

    def test_non_divisible_generated_sheet_uses_exact_integer_boundaries(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            input_path = root / "imagegen-1254.png"
            size = 1254
            rows = cols = 4
            x_boundaries = builder.grid_boundaries(size, cols)
            y_boundaries = builder.grid_boundaries(size, rows)
            sheet = Image.new("RGB", (size, size), builder.DEFAULT_KEY)
            draw = ImageDraw.Draw(sheet)
            for row in range(rows):
                for col in range(cols):
                    left = x_boundaries[col]
                    top = y_boundaries[row]
                    right = x_boundaries[col + 1]
                    bottom = y_boundaries[row + 1]
                    draw.rounded_rectangle(
                        (left + 72, top + 54, right - 72, bottom - 40),
                        radius=28,
                        fill=(60 + row * 25, 120 + col * 18, 190),
                    )
            sheet.save(input_path, format="PNG")

            metadata = builder.build_bundle(
                builder.BuildOptions(
                    input_path=input_path,
                    output_dir=root / "bottom-half",
                    rows=rows,
                    cols=cols,
                    row_start=2,
                    row_count=2,
                    slots=tuple(f"back-{index}" for index in range(1, 9)),
                )
            )

            self.assertEqual(metadata["inputSize"], [1254, 1254])
            self.assertEqual(
                metadata["inputCellSizeMode"],
                "distributed_integer_boundaries",
            )
            self.assertEqual(metadata["inputGridBoundaries"]["x"], [0, 313, 627, 940, 1254])
            self.assertEqual(metadata["inputGridBoundaries"]["y"], [0, 313, 627, 940, 1254])
            self.assertEqual(metadata["frames"][0]["sourceCellBox"], [0, 627, 313, 940])
            self.assertEqual(metadata["frames"][-1]["sourceCellBox"], [940, 940, 1254, 1254])
            self.assertEqual(
                sum(
                    metadata["inputGridBoundaries"]["x"][index + 1]
                    - metadata["inputGridBoundaries"]["x"][index]
                    for index in range(cols)
                ),
                size,
            )

    def test_adaptive_grid_uses_real_chroma_gutters_without_resizing_source(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            input_path = root / "irregular-grid.png"
            width, height = 812, 798
            x_cells = (0, 180, 410, 585, width)
            y_cells = (0, 230, 390, 620, height)
            sheet = Image.new("RGB", (width, height), builder.DEFAULT_KEY)
            draw = ImageDraw.Draw(sheet)
            for row in range(4):
                for col in range(4):
                    center_x = (x_cells[col] + x_cells[col + 1]) // 2
                    center_y = (y_cells[row] + y_cells[row + 1]) // 2
                    draw.rounded_rectangle(
                        (center_x - 52, center_y - 48, center_x + 52, center_y + 48),
                        radius=18,
                        fill=(50 + row * 24, 110 + col * 20, 180),
                    )
            sheet.save(input_path, format="PNG")

            metadata = builder.build_bundle(
                builder.BuildOptions(
                    input_path=input_path,
                    output_dir=root / "adaptive-bottom",
                    rows=4,
                    cols=4,
                    row_start=2,
                    row_count=2,
                    grid_mode="adaptive-gutters",
                    slots=tuple(f"back-{index}" for index in range(1, 9)),
                )
            )

            self.assertEqual(metadata["inputSize"], [width, height])
            self.assertEqual(metadata["gridMode"], "adaptive-gutters")
            self.assertEqual(metadata["inputCellSizeMode"], "adaptive_chroma_gutters")
            self.assertNotEqual(metadata["inputGridBoundaries"]["y"][1], height // 4)
            self.assertEqual(metadata["inputGridBoundaries"]["x"][0], 0)
            self.assertEqual(metadata["inputGridBoundaries"]["x"][-1], width)
            self.assertEqual(metadata["inputGridBoundaries"]["y"][0], 0)
            self.assertEqual(metadata["inputGridBoundaries"]["y"][-1], height)
            self.assertEqual(metadata["frames"][0]["grid"], [2, 0])
            self.assertEqual(metadata["frames"][-1]["grid"], [3, 3])

    def test_adaptive_grid_fails_when_no_empty_gutter_exists(self) -> None:
        with self.assertRaisesRegex(builder.BundleBuildError, "empty gutter"):
            builder.adaptive_axis_boundaries(
                np.ones(400, dtype=np.int32),
                length=400,
                count=2,
                search_ratio=0.25,
                minimum_gutter=8,
            )

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
