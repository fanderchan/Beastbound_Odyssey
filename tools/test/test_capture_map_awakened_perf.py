#!/usr/bin/env python3
"""Focused tests for the Phase399 real-Main map performance runner."""

from __future__ import annotations

import importlib.util
import tempfile
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
TOOL_PATH = REPO_ROOT / "tools" / "capture_map_awakened_perf.py"
SPEC = importlib.util.spec_from_file_location(
    "capture_map_awakened_perf",
    TOOL_PATH,
)
assert SPEC is not None and SPEC.loader is not None
TOOL = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(TOOL)


def _perf_log(
    *,
    sample_count: int = 6,
    idle_fps: float = 59.9,
    idle_process: float = 0.35,
    moving_fps: float = 59.8,
    moving_process: float = 0.72,
    panel_fps: float = 59.7,
    panel_process: float = 1.15,
    cross_frame_presses: int = 68,
) -> str:
    lines = [
        "Godot Engine v4.7.stable.official",
        "Metal 4.0 - Forward Mobile - Using Device #0: Apple",
        (
            "PHASE399_MAP_PERF_START scene=Main.tscn "
            "entry=MainSceneFlag viewport=1280x720 renderer=Metal "
            "profile=isolated backend_started=false profile_save=false"
        ),
    ]
    values = (
        ("idle", idle_fps, idle_process),
        ("moving", moving_fps, moving_process),
        ("panel_stress", panel_fps, panel_process),
    )
    for state, fps, process_total in values:
        suffix = (
            " prepared_visual=true expected_regions=9"
            if state == "panel_stress"
            else ""
        )
        lines.append(
            f"PHASE399_MAP_PERF_STATE state={state}_begin{suffix}"
        )
        for index in range(sample_count):
            lines.append(
                "perf probe: "
                f"fps={fps - index * 0.01:.1f} frames=60 "
                f"draw=0.12ms process_total={process_total + index * 0.01:.2f}ms"
            )
        end_suffix = (
            " cycles=12 panel_clicks=60 prepared_visual=true regions=9 "
            "hud_restored=true ui_world_leaks=0"
            if state == "panel_stress"
            else ""
        )
        lines.append(
            f"PHASE399_MAP_PERF_STATE state={state}_end{end_suffix}"
        )
    lines.append(
        "PHASE399_MAP_PERF_END status=passed elapsed_wall=24.600 "
        "scene=Main.tscn entry=MainSceneFlag viewport=1280x720 "
        "idle=true moving=true panel_stress=true cycles=12 "
        "moving_clicks=8 moving_accepted=8 moved_distance=932.50 "
        "panel_clicks=60 prepared_visual=true regions=9 "
        "hud_restored=true ui_world_leaks=0 backend_started=false "
        "profile_save=false end_http_disconnected=true "
        f"actual_left_clicks=68 cross_frame_presses={cross_frame_presses}"
    )
    return "\n".join(lines) + "\n"


class CaptureMapAwakenedPerfTest(unittest.TestCase):
    def test_command_is_real_main_1280x720_and_has_no_bypass(self) -> None:
        command = TOOL._build_godot_command(
            godot="/opt/godot",
            user_data_dir=Path("/tmp/phase399-map-perf-user"),
        )
        separator = command.index("--")
        engine = command[:separator]
        user = command[separator + 1 :]
        self.assertEqual(
            engine[engine.index("--scene") + 1],
            TOOL.MAIN_SCENE,
        )
        self.assertEqual(
            engine[engine.index("--resolution") + 1],
            "1280x720",
        )
        self.assertIn("--windowed", engine)
        self.assertIn("--single-window", engine)
        self.assertNotIn("--script", engine)
        self.assertNotIn("--headless", engine)
        self.assertNotIn("--write-movie", engine)
        self.assertIn("--perf-probe", user)
        self.assertIn(TOOL.PERF_CAPTURE_FLAG, user)
        with self.assertRaises(TOOL.Phase399MapPerfError):
            TOOL._build_godot_command(
                godot="/opt/godot",
                user_data_dir=Path("/tmp/phase399-map-perf-user"),
                extra_args=("--auto-auth-server-live-check",),
            )

    def test_current_sources_have_minimal_main_and_real_click_contract(
        self,
    ) -> None:
        TOOL._require_perf_wiring()

    def test_log_accepts_three_ordered_states_and_strict_interaction(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "godot-perf.log"
            path.write_text(_perf_log(), encoding="utf-8")
            result = TOOL._validate_godot_log(path)
        self.assertEqual(tuple(result["states"]), TOOL.EXPECTED_STATES)
        self.assertEqual(result["interaction"]["stressCycles"], 12)
        self.assertEqual(result["interaction"]["panelClicks"], 60)
        self.assertEqual(result["interaction"]["actualLeftClicks"], 68)
        self.assertEqual(result["interaction"]["crossFramePresses"], 68)
        self.assertEqual(result["interaction"]["uiWorldLeaks"], 0)
        self.assertEqual(len(result["gates"]), 12)
        self.assertTrue(all(gate["passed"] for gate in result["gates"]))

    def test_log_rejects_short_slow_hot_or_same_frame_evidence(self) -> None:
        invalid_logs = (
            _perf_log(sample_count=4),
            _perf_log(idle_fps=27.0),
            _perf_log(moving_fps=44.0),
            _perf_log(panel_fps=27.0),
            _perf_log(idle_process=15.1),
            _perf_log(moving_process=30.1),
            _perf_log(panel_process=30.1),
            _perf_log(cross_frame_presses=67),
            _perf_log().replace("regions=9", "regions=8"),
            _perf_log().replace(
                "state=moving_begin",
                "state=panel_stress_begin",
                1,
            ),
        )
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "godot-perf.log"
            for index, text in enumerate(invalid_logs):
                with self.subTest(index=index):
                    path.write_text(text, encoding="utf-8")
                    with self.assertRaises(TOOL.Phase399MapPerfError):
                        TOOL._validate_godot_log(path)

    def test_manifest_locks_log_and_summary(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            log = root / "godot-perf.log"
            summary = root / "summary.json"
            log.write_text("log\n", encoding="utf-8")
            summary.write_text("{}\n", encoding="utf-8")
            manifest = TOOL._write_manifest(root, (log, summary))
            lines = manifest.read_text(encoding="utf-8").splitlines()
            self.assertEqual(len(lines), 2)
            self.assertTrue(lines[0].endswith("  godot-perf.log"))
            self.assertTrue(lines[1].endswith("  summary.json"))


if __name__ == "__main__":
    unittest.main()
