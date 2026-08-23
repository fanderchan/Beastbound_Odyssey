from __future__ import annotations

import importlib.util
import io
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from PIL import Image, ImageDraw


TOOL_PATH = (
    Path(__file__).resolve().parents[1]
    / "audit_firebud_hud_glyph_stability.py"
)
SPEC = importlib.util.spec_from_file_location(
    "audit_firebud_hud_glyph_stability",
    TOOL_PATH,
)
assert SPEC is not None and SPEC.loader is not None
TOOL = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(TOOL)


def _complete_native_image() -> Image.Image:
    image = Image.new("RGB", TOOL.EXPECTED_VIEWPORT, (52, 42, 32))
    draw = ImageDraw.Draw(image)
    for contract in TOOL.REGIONS.values():
        x1, y1, x2, y2 = contract["rect"]
        for y in range(y1, y2, 4):
            for x in range(x1, x2, 4):
                if ((x - x1) // 4 + (y - y1) // 4) % 2 == 0:
                    draw.rectangle(
                        (x, y, min(x + 3, x2 - 1), min(y + 3, y2 - 1)),
                        fill=(245, 245, 245),
                    )
    return image


def _computer_use_image(native: Image.Image) -> Image.Image:
    frame = Image.new("RGB", TOOL.COMPUTER_USE_FRAME, (12, 12, 12))
    viewport = native.resize((640, 360), Image.Resampling.LANCZOS)
    frame.paste(viewport, (0, TOOL.COMPUTER_USE_TITLE_BAR_HEIGHT))
    return frame


class AuditFirebudHudGlyphStabilityTest(unittest.TestCase):
    def test_native_and_computer_use_images_pass_independent_pixel_gate(self) -> None:
        native = TOOL.analyze_image(_complete_native_image(), label="native")
        computer_use = TOOL.analyze_image(
            _computer_use_image(_complete_native_image()),
            label="computer-use",
        )
        self.assertTrue(native["passed"])
        self.assertTrue(computer_use["passed"])
        self.assertEqual(
            computer_use["sourceFormat"],
            "computer_use_640x392_titlebar_normalized",
        )
        self.assertEqual(set(native["regions"]), set(TOOL.REGIONS))

    def test_blank_task_hud_fails_closed_but_pointer_can_be_not_applicable(self) -> None:
        blank = Image.new("RGB", TOOL.EXPECTED_VIEWPORT, (52, 42, 32))
        with self.assertRaises(TOOL.HudGlyphAuditError):
            TOOL.analyze_image(blank, label="blank")
        pointer = TOOL.analyze_image(
            blank,
            label="pointer",
            require_task_hud=False,
        )
        self.assertTrue(pointer["passed"])
        self.assertEqual(pointer["status"], "not_applicable")

    def test_reference_comparison_rejects_cursor_or_wrong_glyph_shape(self) -> None:
        reference = _complete_native_image()
        altered = reference.copy()
        draw = ImageDraw.Draw(altered)
        x1, y1, x2, y2 = TOOL.REGIONS["routeButton"]["rect"]
        draw.rectangle((x1, y1, x2 - 1, y2 - 1), fill=(80, 74, 68))
        draw.line((x1 + 8, y1 + 2, x1 + 30, y2 - 3), fill=(250, 250, 250), width=3)
        result = TOOL.analyze_image(
            altered,
            label="cursor-like-replacement",
            reference=reference,
            raise_on_failure=False,
        )
        self.assertFalse(result["passed"])
        self.assertIn("routeButton", result["failedRegions"])
        self.assertFalse(
            result["referenceComparison"]["regions"]["routeButton"]["passed"]
        )

    def test_board_is_one_self_contained_png(self) -> None:
        payload = TOOL.build_task_hud_board_bytes(
            [
                {"label": "frame-a", "source": _complete_native_image()},
                {
                    "label": "frame-b",
                    "source": _computer_use_image(_complete_native_image()),
                },
            ],
            columns=2,
        )
        with Image.open(io.BytesIO(payload)) as board:
            self.assertEqual(board.format, "PNG")
            self.assertEqual(board.width, 444)
            self.assertEqual(board.height, 441)

    @unittest.skipUnless(shutil.which("ffmpeg"), "ffmpeg is required")
    def test_every_video_frame_is_decoded_and_gated(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / "source.png"
            video = root / "three-frames.mp4"
            _complete_native_image().save(source)
            subprocess.run(
                [
                    shutil.which("ffmpeg") or "ffmpeg",
                    "-y",
                    "-v",
                    "error",
                    "-loop",
                    "1",
                    "-i",
                    str(source),
                    "-frames:v",
                    "3",
                    "-r",
                    "30",
                    "-c:v",
                    "libx264",
                    "-pix_fmt",
                    "yuv420p",
                    str(video),
                ],
                check=True,
            )
            report = TOOL.analyze_video(
                shutil.which("ffmpeg") or "ffmpeg",
                video,
                expected_frame_count=3,
            )
            self.assertEqual(report["frameCount"], 3)
            self.assertEqual(report["passedFrameCount"], 3)
            self.assertTrue(report["consecutiveFrames"])


if __name__ == "__main__":
    unittest.main()
