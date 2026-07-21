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
import time
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
import sprite_alpha_despill as alpha_despill  # noqa: E402


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
                self.assertEqual(
                    frame["sourceResampleMode"],
                    builder.PREMULTIPLIED_BILINEAR,
                )
                self.assertEqual(
                    frame["runtimeResampleMode"],
                    builder.PREMULTIPLIED_BILINEAR,
                )

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
            self.assertEqual(
                metadata["frames"][0]["sourceResampleMode"],
                builder.PREMULTIPLIED_LANCZOS,
            )
            self.assertEqual(
                metadata["frames"][0]["runtimeResampleMode"],
                builder.PREMULTIPLIED_LANCZOS,
            )

    def test_transparent_alpha_contrasting_purple_rim_is_preserved_without_provenance(self) -> None:
        image = Image.new("RGBA", (96, 96), (0, 0, 0, 0))
        draw = ImageDraw.Draw(image)
        draw.rounded_rectangle((18, 18, 77, 77), radius=14, fill=(112, 67, 31, 255))
        # An already-transparent input provides no proof that this contrasting
        # purple contour is spill rather than authored fur or a marking.
        draw.rounded_rectangle((17, 17, 78, 78), radius=15, outline=(116, 4, 132, 180), width=2)
        before = np.asarray(image, dtype=np.uint8).copy()

        cleaned, metadata = builder.chroma_to_alpha(
            image,
            builder.DEFAULT_KEY,
            40.0,
            150.0,
            8,
        )
        self.assertTrue(np.array_equal(before, np.asarray(cleaned, dtype=np.uint8)))
        despill = metadata["transparentAlphaDespill"]
        self.assertEqual(despill["despilledPixels"], 0)
        self.assertEqual(despill["alphaPixelsChanged"], 0)
        self.assertEqual(despill["skippedReason"], "no_chroma_provenance")

    def test_explicit_chroma_provenance_can_clean_known_spill_without_alpha_erosion(self) -> None:
        image = Image.new("RGBA", (96, 96), (0, 0, 0, 0))
        draw = ImageDraw.Draw(image)
        draw.rounded_rectangle((18, 18, 77, 77), radius=14, fill=(112, 67, 31, 255))
        draw.rounded_rectangle((17, 17, 78, 78), radius=15, outline=(116, 4, 132, 180), width=2)
        before = np.asarray(image, dtype=np.uint8).copy()
        eligible = np.all(before[:, :, :3] == np.asarray((116, 4, 132)), axis=2)

        cleaned, metadata = alpha_despill.despill_transparent_alpha(
            image,
            8,
            eligible,
        )
        after = np.asarray(cleaned, dtype=np.uint8)
        self.assertTrue(np.array_equal(before[:, :, 3], after[:, :, 3]))
        self.assertGreater(metadata["despilledPixels"], 0)
        self.assertEqual(metadata["strongMagentaEdgePixelsAfter"], 0)
        self.assertEqual(metadata["alphaPixelsChanged"], 0)
        self.assertFalse(np.array_equal(before[:, :, :3], after[:, :, :3]))

    def test_transparent_alpha_legitimate_purple_subject_is_not_recolored(self) -> None:
        image = Image.new("RGBA", (96, 96), (0, 0, 0, 0))
        ImageDraw.Draw(image).rounded_rectangle(
            (18, 18, 77, 77),
            radius=14,
            fill=(105, 34, 148, 255),
        )
        before = np.asarray(image, dtype=np.uint8).copy()
        cleaned, metadata = builder.chroma_to_alpha(
            image,
            builder.DEFAULT_KEY,
            40.0,
            150.0,
            8,
        )
        self.assertTrue(np.array_equal(before, np.asarray(cleaned, dtype=np.uint8)))
        self.assertEqual(metadata["transparentAlphaDespill"]["despilledPixels"], 0)

    def test_low_matte_inverse_does_not_create_fluorescent_green(self) -> None:
        image = Image.new("RGBA", (96, 96), (*builder.DEFAULT_KEY, 255))
        draw = ImageDraw.Draw(image)
        body_color = (112, 67, 31, 255)
        draw.rectangle((18, 18, 77, 77), fill=body_color)
        # This real failure-shape color is mathematically in gamut under the
        # old inverse, but becomes an implausible green RGB triplet at low alpha.
        image.putpixel((17, 48), (221, 28, 210, 255))

        cleaned, metadata = builder.chroma_to_alpha(
            image,
            builder.DEFAULT_KEY,
            40.0,
            150.0,
            8,
        )
        pixel = cleaned.getpixel((17, 48))
        self.assertGreater(pixel[3], 0)
        self.assertLessEqual(pixel[3], 127)
        self.assertLess(pixel[1] - max(pixel[0], pixel[2]), 18)
        anomaly = metadata["partialChromaAnomalyDespill"]
        self.assertGreater(anomaly["strongGreenPixelsBefore"], 0)
        self.assertEqual(anomaly["strongGreenPixelsAfter"], 0)
        self.assertEqual(anomaly["alphaPixelsChanged"], 0)

        second, _ = builder.chroma_to_alpha(
            cleaned,
            builder.DEFAULT_KEY,
            40.0,
            150.0,
            8,
        )
        self.assertTrue(np.array_equal(np.asarray(cleaned), np.asarray(second)))

    def test_natural_green_body_and_detached_vfx_are_preserved(self) -> None:
        image = Image.new("RGBA", (48, 48), (0, 0, 0, 0))
        draw = ImageDraw.Draw(image)
        draw.rectangle((12, 12, 32, 32), fill=(42, 171, 54, 255))
        image.putpixel((11, 22), (46, 166, 57, 72))
        draw.rectangle((40, 5, 42, 7), fill=(34, 225, 62, 80))
        partial = np.zeros((48, 48), dtype=np.bool_)
        partial[22, 11] = True
        partial[5:8, 40:43] = True
        inverse_valid = np.ones((48, 48), dtype=np.bool_)
        before = np.asarray(image, dtype=np.uint8).copy()

        cleaned, metadata = alpha_despill.despill_chroma_partial_anomalies(
            image,
            partial,
            inverse_valid,
            8,
        )
        self.assertTrue(np.array_equal(before, np.asarray(cleaned, dtype=np.uint8)))
        self.assertEqual(metadata["repairedPixels"], 0)
        self.assertEqual(metadata["alphaPixelsChanged"], 0)

    def test_connected_translucent_green_vfx_is_preserved_without_provenance(self) -> None:
        image = Image.new("RGBA", (48, 48), (0, 0, 0, 0))
        draw = ImageDraw.Draw(image)
        draw.rectangle((12, 12, 32, 32), fill=(112, 67, 31, 255))
        draw.rectangle((33, 20, 42, 23), fill=(34, 225, 62, 80))
        before = np.asarray(image, dtype=np.uint8).copy()

        cleaned, metadata = alpha_despill.despill_resampled_green_edges(image, 2)
        self.assertTrue(np.array_equal(before, np.asarray(cleaned, dtype=np.uint8)))
        self.assertEqual(metadata["repairedPixels"], 0)
        self.assertEqual(metadata["alphaPixelsChanged"], 0)
        self.assertEqual(metadata["skippedReason"], "no_chroma_provenance")

    def test_large_unproven_green_region_is_preserved_as_authored_vfx(self) -> None:
        image = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
        ImageDraw.Draw(image).rectangle((128, 96, 416, 448), fill=(118, 54, 32, 255))
        partial = np.zeros((512, 512), dtype=np.bool_)
        for y in range(100, 445):
            image.putpixel((127, y), (24, 205, 18, 64))
            partial[y, 127] = True
        inverse_valid = np.ones((512, 512), dtype=np.bool_)
        # A partial-alpha matte alone does not prove that this authored green
        # strip is chroma damage.  Only an exact same-operation anomaly mask may
        # authorize recoloring.
        proven_green = np.zeros((512, 512), dtype=np.bool_)
        before = np.asarray(image, dtype=np.uint8).copy()

        started = time.perf_counter()
        cleaned, metadata = alpha_despill.despill_chroma_partial_anomalies(
            image,
            partial,
            inverse_valid,
            8,
            proven_green,
        )
        elapsed = time.perf_counter() - started
        self.assertEqual(metadata["repairedPixels"], 0)
        self.assertEqual(metadata["strongGreenPixelsBefore"], 0)
        self.assertTrue(np.array_equal(before, np.asarray(cleaned, dtype=np.uint8)))
        self.assertLess(elapsed, 2.0, f"sparse 512px cleanup took {elapsed:.3f}s")

    def test_bundle_source_and_runtime_resize_keep_green_fix_and_alpha_shape(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            input_path = root / "green-regression.png"
            output_dir = root / "bundle"
            image = Image.new("RGBA", (128, 128), (*builder.DEFAULT_KEY, 255))
            draw = ImageDraw.Draw(image)
            draw.rounded_rectangle((28, 20, 99, 111), radius=18, fill=(112, 67, 31, 255))
            image.putpixel((27, 64), (221, 28, 210, 255))
            image.save(input_path, format="PNG")
            metadata = builder.build_bundle(
                builder.BuildOptions(
                    input_path=input_path,
                    output_dir=output_dir,
                    rows=1,
                    cols=1,
                    slots=("frame-1",),
                    make_gif=False,
                    make_contact_sheet=False,
                )
            )
            self.assertEqual(
                metadata["frames"][0]["chroma"]["partialChromaAnomalyDespill"][
                    "alphaPixelsChanged"
                ],
                0,
            )
            self.assertNotIn("sourceResampleGreenCleanup", metadata["frames"][0])
            self.assertNotIn("runtimeResampleGreenCleanup", metadata["frames"][0])
            for path in (
                output_dir / "source-frames/frame-1.png",
                output_dir / "runtime-frames/frame-1.png",
            ):
                with Image.open(path) as opened:
                    rgba = np.asarray(opened.convert("RGBA"), dtype=np.uint8)
                visible = rgba[:, :, 3] >= 8
                dominance = rgba[:, :, 1].astype(np.int16) - np.maximum(
                    rgba[:, :, 0], rgba[:, :, 2]
                ).astype(np.int16)
                strong_green = visible & (rgba[:, :, 1] >= 80) & (dominance >= 30)
                self.assertEqual(int(np.count_nonzero(strong_green)), 0, path)

    def test_premultiplied_resize_keeps_the_established_alpha_bytes(self) -> None:
        image = Image.new("RGBA", (83, 71), (0, 0, 0, 0))
        draw = ImageDraw.Draw(image)
        draw.ellipse((9, 7, 68, 64), fill=(186, 54, 36, 231))
        draw.rectangle((42, 13, 78, 26), fill=(38, 178, 65, 91))
        expected_alpha = np.asarray(
            image.getchannel("A").resize((137, 119), Image.Resampling.LANCZOS),
            dtype=np.uint8,
        )
        resized = builder.resize_rgba_premultiplied(image, (137, 119))
        explicit = builder.resize_rgba_premultiplied(
            image,
            (137, 119),
            resample_mode=builder.PREMULTIPLIED_LANCZOS,
        )
        actual_alpha = np.asarray(resized.getchannel("A"), dtype=np.uint8)
        self.assertTrue(np.array_equal(expected_alpha, actual_alpha))
        self.assertEqual(builder.rgba_hash(resized), builder.rgba_hash(explicit))

    def test_source_resample_mode_requires_chroma_key_provenance(self) -> None:
        cutout = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
        ImageDraw.Draw(cutout).rectangle((8, 8, 23, 23), fill=(112, 67, 31, 255))
        options = builder.BuildOptions(
            input_path=Path("unused.png"),
            output_dir=Path("unused-bundle"),
            rows=1,
            cols=1,
            slots=("frame-1",),
        )

        def prepared(background_mode: str) -> builder.PreparedFrame:
            return builder.PreparedFrame(
                slot="frame-1",
                row=0,
                col=0,
                cell_box=(0, 0, 32, 32),
                cutout=cutout,
                visible_bbox_in_cutout=(8, 8, 24, 24),
                horizontal_anchor=16.0,
                subject_span=16.0,
                metadata={
                    "chroma": {"inputBackgroundMode": background_mode},
                },
            )

        keyed, keyed_metadata = builder.normalize_canvas(
            prepared("chroma_key"),
            1.0,
            options,
            8,
        )
        transparent, transparent_metadata = builder.normalize_canvas(
            prepared("transparent_alpha"),
            1.0,
            options,
            8,
        )
        keyed_x, keyed_y = keyed_metadata["sourcePastePosition"]
        transparent_x, transparent_y = transparent_metadata["sourcePastePosition"]

        self.assertEqual(
            keyed_metadata["sourceResampleMode"],
            builder.PREMULTIPLIED_BILINEAR,
        )
        self.assertEqual(
            transparent_metadata["sourceResampleMode"],
            builder.PREMULTIPLIED_LANCZOS,
        )
        self.assertGreater(keyed.getpixel((keyed_x + 12, keyed_y + 12))[3], 0)
        self.assertGreater(
            transparent.getpixel((transparent_x + 12, transparent_y + 12))[3],
            0,
        )

    def test_bilinear_runtime_matches_direct_resize_and_preserves_key_near_detail(self) -> None:
        crop = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
        draw = ImageDraw.Draw(crop)
        draw.rectangle((8, 8, 55, 55), fill=(112, 67, 31, 255))
        draw.rectangle((20, 20, 31, 31), fill=(255, 0, 255, 64))
        draw.rectangle((36, 20, 47, 31), fill=(190, 24, 205, 96))

        source = builder.resize_rgba_premultiplied(
            crop,
            (512, 512),
            resample_mode=builder.PREMULTIPLIED_BILINEAR,
        )
        runtime, cleaned = builder.derive_runtime_frame(
            source,
            builder.DEFAULT_KEY,
            70.0,
            96,
            resample_mode=builder.PREMULTIPLIED_BILINEAR,
        )
        direct = builder.resize_rgba_premultiplied(
            source,
            (256, 256),
            resample_mode=builder.PREMULTIPLIED_BILINEAR,
        )
        direct, direct_cleaned = builder.clean_resample_alpha(
            direct,
            builder.DEFAULT_KEY,
            70.0,
            96,
        )

        self.assertEqual(cleaned, 0)
        self.assertEqual(direct_cleaned, 0)
        self.assertEqual(builder.rgba_hash(runtime), builder.rgba_hash(direct))
        source_key_detail = source.getpixel((204, 204))
        runtime_key_detail = runtime.getpixel((102, 102))
        runtime_purple_detail = runtime.getpixel((166, 102))
        self.assertGreater(source_key_detail[3], 0)
        self.assertGreater(runtime_key_detail[3], 0)
        self.assertGreater(runtime_purple_detail[3], 0)
        self.assertGreater(source_key_detail[0], 240)
        self.assertGreater(source_key_detail[2], 240)
        self.assertGreater(runtime_key_detail[0], 240)
        self.assertGreater(runtime_key_detail[2], 240)
        self.assertGreater(runtime_purple_detail[0], runtime_purple_detail[1])
        self.assertGreater(runtime_purple_detail[2], runtime_purple_detail[1])

    def test_premultiplied_resize_rejects_unknown_mode(self) -> None:
        image = Image.new("RGBA", (8, 8), (0, 0, 0, 0))
        with self.assertRaisesRegex(
            builder.BundleBuildError,
            "unsupported premultiplied resample mode",
        ):
            builder.resize_rgba_premultiplied(
                image,
                (4, 4),
                resample_mode="premultiplied_nearest",
            )

    def test_keyed_resample_fails_on_visible_magenta_instead_of_deleting_it(self) -> None:
        cutout = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
        draw = ImageDraw.Draw(cutout)
        draw.rectangle((8, 8, 55, 55), fill=(112, 67, 31, 255))
        draw.rectangle((24, 24, 39, 39), fill=(255, 0, 255, 64))
        prepared = builder.PreparedFrame(
            slot="frame-1",
            row=0,
            col=0,
            cell_box=(0, 0, 64, 64),
            cutout=cutout,
            visible_bbox_in_cutout=(8, 8, 56, 56),
            horizontal_anchor=32.0,
            subject_span=48.0,
            metadata={"chroma": {"inputBackgroundMode": "chroma_key"}},
        )
        options = builder.BuildOptions(
            input_path=Path("unused.png"),
            output_dir=Path("unused-bundle"),
            rows=1,
            cols=1,
            slots=("frame-1",),
        )

        with self.assertRaisesRegex(
            builder.BundleBuildError,
            "source normalization produced .* residual magenta pixels",
        ):
            builder.render_frames([prepared], options)

    def test_runtime_derivation_does_not_globally_delete_unprovenanced_color(self) -> None:
        source = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
        draw = ImageDraw.Draw(source)
        draw.rounded_rectangle((112, 92, 398, 472), radius=52, fill=(112, 67, 31, 255))
        # This low-alpha magenta patch is deliberately indistinguishable from a
        # chroma fringe by color alone.  Without the exact same-operation keying
        # mask it must survive canonical runtime derivation.
        draw.rectangle((172, 172, 211, 211), fill=(255, 0, 255, 64))
        expected_alpha = np.asarray(
            source.getchannel("A").resize((256, 256), Image.Resampling.LANCZOS),
            dtype=np.uint8,
        ).copy()
        expected_alpha[expected_alpha < 2] = 0

        runtime, cleaned_pixels = builder.derive_runtime_frame(
            source,
            builder.DEFAULT_KEY,
            70.0,
            96,
        )
        actual = np.asarray(runtime.convert("RGBA"), dtype=np.uint8)

        self.assertEqual(cleaned_pixels, 0)
        self.assertTrue(np.array_equal(expected_alpha, actual[:, :, 3]))
        self.assertGreater(int(actual[95, 95, 3]), 0)
        self.assertGreater(int(actual[95, 95, 0]), int(actual[95, 95, 1]))
        self.assertGreater(int(actual[95, 95, 2]), int(actual[95, 95, 1]))

    def test_both_runtime_modes_apply_only_the_alpha_floor(self) -> None:
        source = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
        draw = ImageDraw.Draw(source)
        draw.rectangle((96, 80, 415, 447), fill=(112, 67, 31, 255))
        draw.rectangle((144, 144, 183, 183), fill=(255, 0, 255, 64))
        draw.rectangle((384, 144, 407, 183), fill=(41, 173, 92, 1))

        raw_runtime = builder.resize_rgba_premultiplied(source, (256, 256))
        self.assertEqual(raw_runtime.getpixel((197, 81))[3], 1)

        lanczos, lanczos_cleaned = builder.derive_runtime_frame(
            source,
            builder.DEFAULT_KEY,
            70.0,
            96,
        )
        bilinear, bilinear_cleaned = builder.derive_runtime_frame(
            source,
            builder.DEFAULT_KEY,
            70.0,
            96,
            resample_mode=builder.PREMULTIPLIED_BILINEAR,
        )

        self.assertEqual(lanczos_cleaned, 0)
        self.assertEqual(bilinear_cleaned, 0)
        self.assertGreater(lanczos.getpixel((81, 81))[3], 0)
        self.assertGreater(bilinear.getpixel((81, 81))[3], 0)
        self.assertEqual(lanczos.getpixel((197, 81)), (0, 0, 0, 0))
        self.assertEqual(bilinear.getpixel((197, 81)), (0, 0, 0, 0))

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
