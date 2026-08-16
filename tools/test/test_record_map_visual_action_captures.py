from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


TOOL_PATH = Path(__file__).resolve().parents[1] / "record_map_visual_action_captures.py"
SPEC = importlib.util.spec_from_file_location(
    "record_map_visual_action_captures",
    TOOL_PATH,
)
assert SPEC is not None and SPEC.loader is not None
TOOL = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(TOOL)


class RecordMapVisualActionCapturesTest(unittest.TestCase):
    def test_fresh_run_refuses_any_existing_formal_pair(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            screenshot = root / "pointer.png"
            report = root / "pointer-capture.json"
            screenshot.write_bytes(b"png")
            report.write_text("{}", encoding="utf-8")
            with self.assertRaises(TOOL.MapActionCaptureError):
                TOOL._target_state(screenshot, report, resume=False)

    def test_resume_reuses_only_a_complete_pair(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            screenshot = root / "pointer.png"
            report = root / "pointer-capture.json"
            screenshot.write_bytes(b"png")
            report.write_text("{}", encoding="utf-8")
            self.assertEqual(
                TOOL._target_state(screenshot, report, resume=True),
                "reuse",
            )

    def test_resume_archives_explicit_failed_report_without_overwrite(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            screenshot = root / "movement.png"
            report = root / "movement-capture.json"
            failed = {
                "result": "FAIL",
                "ok": False,
                "errors": ["no target"],
                "screenshotPath": "",
                "screenshot": {},
            }
            report.write_text(json.dumps(failed), encoding="utf-8")
            self.assertEqual(
                TOOL._target_state(screenshot, report, resume=True),
                "archive_failed_report",
            )
            action_root = root / "run" / "map" / "movement"
            archived = TOOL._archive_failed_report(report, action_root)
            self.assertFalse(report.exists())
            self.assertTrue(archived.is_file())
            self.assertEqual(json.loads(archived.read_text()), failed)

    def test_resume_refuses_orphan_pass_report_or_screenshot(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            screenshot = root / "collision.png"
            report = root / "collision-capture.json"
            report.write_text(
                json.dumps({
                    "result": "PASS",
                    "ok": True,
                    "errors": [],
                    "screenshotPath": "res://collision.png",
                    "screenshot": {"sha256": "a" * 64},
                }),
                encoding="utf-8",
            )
            with self.assertRaises(TOOL.MapActionCaptureError):
                TOOL._target_state(screenshot, report, resume=True)
            report.unlink()
            screenshot.write_bytes(b"png")
            with self.assertRaises(TOOL.MapActionCaptureError):
                TOOL._target_state(screenshot, report, resume=True)

    def test_next_action_run_preserves_original_attempt(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            action_root = Path(temp) / "map" / "warp"
            first = TOOL._next_action_run(action_root)
            self.assertEqual(first, action_root)
            (first / "godot.log").write_text("old", encoding="utf-8")
            resumed = TOOL._next_action_run(action_root)
            self.assertEqual(resumed.name, "resume-01")
            self.assertEqual((first / "godot.log").read_text(), "old")


if __name__ == "__main__":
    unittest.main()
