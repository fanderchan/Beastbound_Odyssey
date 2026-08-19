#!/usr/bin/env python3
"""Contracts for the Firebud 4x4 surface-autotile sheet assembler."""

from __future__ import annotations

import argparse
import importlib.util
import tempfile
import unittest
from pathlib import Path

from PIL import Image, ImageDraw


REPO_ROOT = Path(__file__).resolve().parents[2]
TOOL_PATH = (
    REPO_ROOT
    / "client/godot/assets/maps/firebud_region_visual_v2/source/tools"
    / "assemble_surface_autotile_sheet.py"
)
SPEC = importlib.util.spec_from_file_location("assemble_surface_autotile_sheet", TOOL_PATH)
assert SPEC is not None and SPEC.loader is not None
TOOL = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(TOOL)


def _write_rows(root: Path, *, blank_last: bool = True) -> list[Path]:
    paths: list[Path] = []
    for row_index in range(4):
        image = Image.new("RGBA", (804, 603), (0, 0, 0, 0))
        draw = ImageDraw.Draw(image)
        bounds = TOOL._cell_bounds(image.width)
        for column_index in range(4):
            if row_index == 3 and column_index == 3 and blank_last:
                continue
            left = bounds[column_index]
            right = bounds[column_index + 1]
            center_x = (left + right) // 2
            center_y = image.height // 2
            draw.polygon(
                [
                    (center_x, center_y - 70),
                    (right - 18, center_y),
                    (center_x, center_y + 70),
                    (left + 18, center_y),
                ],
                fill=(180, 120, 70, 255),
            )
        path = root / f"row-{row_index + 1}.png"
        image.save(path)
        paths.append(path)
    return paths


def _args(root: Path, rows: list[Path], name: str = "sheet") -> argparse.Namespace:
    return argparse.Namespace(
        surface="path",
        row=rows,
        output=root / f"{name}.png",
        manifest=root / f"{name}.json",
    )


class AssembleSurfaceAutotileSheetTest(unittest.TestCase):
    def test_builds_exact_4x4_sheet_with_fifteen_signatures(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            payload = TOOL.build(_args(root, _write_rows(root)))

            self.assertEqual(payload["signatures"], list(TOOL.AUTOTILE_SIGNATURES))
            self.assertEqual(payload["output"]["dimensions"], [804, 804])
            self.assertEqual(payload["output"]["blankCell"], [3, 3])
            self.assertEqual(len(payload["cells"]), 16)
            self.assertTrue(payload["cells"][-1]["blank"])
            with Image.open(root / "sheet.png") as sheet:
                self.assertEqual(sheet.mode, "RGBA")
                self.assertIsNone(sheet.crop((603, 603, 804, 804)).getchannel("A").getbbox())

    def test_repeat_build_is_byte_deterministic(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            rows = _write_rows(root)
            first = _args(root, rows, "first")
            second = _args(root, rows, "second")
            TOOL.build(first)
            TOOL.build(second)
            self.assertEqual(first.output.read_bytes(), second.output.read_bytes())

    def test_requires_exactly_four_rows(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            rows = _write_rows(root)
            with self.assertRaises(TOOL.BuildError):
                TOOL.build(_args(root, rows[:3]))

    def test_rejects_nonempty_blank_cell(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            with self.assertRaises(TOOL.BuildError):
                TOOL.build(_args(root, _write_rows(root, blank_last=False)))

    def test_rejects_visible_alpha_touching_cell_edge(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            rows = _write_rows(root)
            with Image.open(rows[0]) as opened:
                image = opened.copy()
            image.putpixel((0, image.height // 2), (255, 255, 255, 255))
            image.save(rows[0])
            with self.assertRaises(TOOL.BuildError):
                TOOL.build(_args(root, rows))

    def test_refuses_existing_outputs(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            arguments = _args(root, _write_rows(root))
            TOOL.build(arguments)
            before = arguments.output.read_bytes()
            with self.assertRaises(TOOL.BuildError):
                TOOL.build(arguments)
            self.assertEqual(arguments.output.read_bytes(), before)


if __name__ == "__main__":
    unittest.main()
