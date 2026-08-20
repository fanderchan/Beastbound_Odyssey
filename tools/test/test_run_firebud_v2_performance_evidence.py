#!/usr/bin/env python3
"""Focused contracts for the Phase383 v2 performance runner."""

from __future__ import annotations

import importlib.util
import tempfile
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
TOOL_PATH = REPO_ROOT / "tools" / "run_firebud_v2_performance_evidence.py"
SPEC = importlib.util.spec_from_file_location("run_firebud_v2_performance_evidence", TOOL_PATH)
assert SPEC is not None and SPEC.loader is not None
TOOL = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(TOOL)


def _output(*, moving: bool) -> str:
    lines = [
        "perf probe: fps=60.0 frames=60 process_total=0.10ms draw_world=0.20ms hud_update=0.01ms",
        "perf probe: fps=60.0 frames=60 process_total=0.12ms draw_world=0.21ms hud_update=0.01ms",
        "perf probe: fps=60.0 frames=60 process_total=0.11ms draw_world=0.22ms hud_update=0.01ms",
    ]
    if moving:
        lines.append("movement spam click check ready: status=ok moved=true coalesced=true settled=true final_match=true screen_roundtrip=true battle=false encounter=false clicks=12 accepted=12 resolved=1 applied=1")
    return "\n".join(lines)


class RunFirebudV2PerformanceEvidenceTest(unittest.TestCase):
    def test_fixed_real_main_command_is_isolated_and_candidate_is_explicit(self) -> None:
        command = TOOL._build_command(godot="/opt/godot", map_id="firebud_village_gate", variant="candidate_v2_review", mode="moving")
        separator = command.index("--")
        engine, user = command[:separator], command[separator + 1:]
        self.assertEqual(command.count("--"), 1)
        self.assertIn(TOOL.MAIN_SCENE, engine)
        self.assertNotIn("--user-data-dir", engine)
        self.assertIn("1280x720", engine)
        self.assertEqual(engine[engine.index("--fixed-fps") + 1], "60")
        self.assertNotIn("--quit-after", engine)
        self.assertEqual(engine[engine.index("--time-scale") + 1], "1.0")
        self.assertIn("--map-art-review-preview=firebud_village_gate", user)
        self.assertIn("--movement-spam-click-check", user)
        self.assertIn("--perf-probe", user)
        self.assertIn("--perf-probe-clean-exit-frames=2600", user)
        self.assertEqual(command.count(TOOL.CORE.QA_LANE_ARGUMENT), 1)
        self.assertNotIn("--login", user)
        self.assertNotIn("--server-url", user)

    def test_only_fixed_matrix_values_are_permitted(self) -> None:
        for key, value in (("map_id", "mistcap_marsh"), ("variant", "candidate"), ("mode", "battle")):
            kwargs = {"godot": "godot", "map_id": "firebud_training_yard", "variant": "baseline_v1", "mode": "idle"}
            kwargs[key] = value
            with self.subTest(key=key):
                with self.assertRaises(TOOL.FirebudV2PerformanceError):
                    TOOL._build_command(**kwargs)

    def test_in_game_probe_includes_all_metrics_and_requires_real_cross_frame_move(self) -> None:
        idle = TOOL._parse_in_game_probe(output=_output(moving=False), mode="idle")
        self.assertIn("process_total", idle["metricsMsMinMeanMax"])
        self.assertIn("draw_world", idle["metricsMsMinMeanMax"])
        moving = TOOL._parse_in_game_probe(output=_output(moving=True), mode="moving")
        self.assertTrue(moving["realCrossFrameMouseMovement"])
        with self.assertRaises(TOOL.FirebudV2PerformanceError):
            TOOL._parse_in_game_probe(output=_output(moving=False), mode="moving")

    def test_moving_accepts_two_samples_because_real_input_check_quits_after_settle(self) -> None:
        two_samples = "\n".join(_output(moving=True).splitlines()[1:])
        moving = TOOL._parse_in_game_probe(output=two_samples, mode="moving")
        self.assertEqual(moving["sampleCount"], 2)
        with self.assertRaises(TOOL.FirebudV2PerformanceError):
            TOOL._parse_in_game_probe(output="\n".join(_output(moving=False).splitlines()[:2]), mode="idle")

    def test_source_records_ps_and_fails_closed_on_extra_arguments(self) -> None:
        source = TOOL_PATH.read_text(encoding="utf-8")
        self.assertIn('["ps", "-o", "%cpu=", "-o", "rss="', source)
        self.assertIn('"scripts/world/world_camera_safe_area_model.gd"', source)
        self.assertIn("officialAutomationQaLanePerRun", source)
        self.assertNotIn("freshUserDataDirectoryPerRun", source)
        self.assertIn("loginOrServerArgumentsAccepted", source)
        self.assertNotIn("--review-arg", source)
        self.assertNotIn("--server-url", source)

    def test_strict_log_gate_accepts_clean_metal_and_rejects_warnings(self) -> None:
        clean = (
            "$ godot\nMetal 4.0 - Forward Mobile\n"
            + _output(moving=False)
            + '\nperf probe clean exit: {"status":"passed","audioStreamsDetached":true}\n'
        )
        with tempfile.TemporaryDirectory() as temporary:
            log_path = Path(temporary) / "godot.log"
            log_path.write_text(clean, encoding="utf-8")
            result = TOOL._validate_godot_perf_log(log_path, mode="idle")
            self.assertEqual(result["strictLogGate"], "passed")
            self.assertEqual(result["inGamePerfProbe"]["sampleCount"], 3)
            log_path.write_text(clean + "\nWARNING: layout drift\n", encoding="utf-8")
            with self.assertRaises(TOOL.FirebudV2PerformanceError):
                TOOL._validate_godot_perf_log(log_path, mode="idle")


if __name__ == "__main__":
    unittest.main()
