from __future__ import annotations

import importlib.util
from pathlib import Path
import sys
import tempfile
import unittest


REPO_ROOT = Path(__file__).resolve().parents[2]
TOOLS_ROOT = REPO_ROOT / "tools"
if str(TOOLS_ROOT) not in sys.path:
    sys.path.insert(0, str(TOOLS_ROOT))
MODULE_PATH = TOOLS_ROOT / "run_map_visual_performance_evidence.py"
SPEC = importlib.util.spec_from_file_location(
    "run_map_visual_performance_evidence_test_target",
    MODULE_PATH,
)
assert SPEC is not None and SPEC.loader is not None
RUNNER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(RUNNER)


class RunMapVisualPerformanceEvidenceTest(unittest.TestCase):
    def test_command_uses_isolated_real_main_non_headless_contract(self) -> None:
        command = RUNNER._command(
            "firebud_training_yard",
            "candidate",
            "moving",
            user_data_dir=Path("/tmp/beastbound-map-perf-test"),
        )
        separator = command.index("--")
        engine = command[:separator]
        user = command[separator + 1 :]
        self.assertIn("--user-data-dir", engine)
        self.assertIn("res://scenes/Main.tscn", engine)
        self.assertIn("1280x720", engine)
        self.assertIn("--windowed", engine)
        self.assertIn("--single-window", engine)
        self.assertIn("--map-art-review-preview=firebud_training_yard", user)
        self.assertIn("--movement-spam-click-check", user)
        self.assertIn("--movement-spam-click-limit=30", user)
        self.assertIn("--perf-probe", user)
        self.assertFalse(any("login" in value or "server-url" in value for value in command))

    def test_baseline_omits_review_candidate_flag(self) -> None:
        command = RUNNER._command(
            "firebud_village_gate",
            "baseline",
            "idle",
            user_data_dir=Path("/tmp/beastbound-map-perf-test"),
        )
        self.assertFalse(any(value.startswith("--map-art-review-preview") for value in command))
        self.assertNotIn("--movement-spam-click-check", command)
        self.assertFalse(any(value.startswith("--movement-spam-click-limit=") for value in command))

    def test_receipt_replace_requires_explicit_flag_and_is_complete(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "receipt.jsonl"
            path.write_text('{"old":true}\n', encoding="utf-8")
            records = [{"recordType": "fresh", "returncode": 0}]
            with self.assertRaises(RUNNER.builder.EvidenceError):
                RUNNER._write_receipt(
                    path,
                    records,
                    replace_existing=False,
                )
            self.assertEqual(path.read_text(encoding="utf-8"), '{"old":true}\n')
            RUNNER._write_receipt(
                path,
                records,
                replace_existing=True,
            )
            self.assertEqual(
                path.read_text(encoding="utf-8"),
                '{"recordType":"fresh","returncode":0}\n',
            )


if __name__ == "__main__":
    unittest.main()
