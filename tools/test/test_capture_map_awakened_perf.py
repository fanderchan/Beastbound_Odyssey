#!/usr/bin/env python3
"""Focused tests for the Phase399 real-Main map performance runner."""

from __future__ import annotations

import importlib.util
import json
import subprocess
import tempfile
import unittest
from unittest import mock
from pathlib import Path
from typing import Optional


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
    sample_count: int = 10,
    idle_fps: float = 59.9,
    idle_process: float = 0.35,
    moving_fps: float = 59.8,
    moving_process: float = 0.72,
    moving_process_tail_override: Optional[float] = None,
    panel_fps: float = 59.7,
    panel_min_override: Optional[float] = None,
    panel_process: float = 1.15,
    panel_process_tail_override: Optional[float] = None,
    cross_frame_presses: int = 68,
    foreground_start: bool = True,
    foreground_end: bool = True,
    menu_fps60: bool = True,
    menu_fps60_checks: int = 48,
    press_dispatch_p95_usec: int = 1100,
    press_dispatch_max_usec: int = 1900,
    handler_refresh_p95_usec: int = 2400,
    handler_refresh_max_usec: int = 3600,
) -> str:
    lines = [
        "Godot Engine v4.7.stable.official",
        "Metal 4.0 - Forward Mobile - Using Device #0: Apple",
        (
            "PHASE399_MAP_PERF_START scene=Main.tscn "
            "entry=MainSceneFlag viewport=1280x720 renderer=Metal "
            "profile=isolated backend_started=false profile_save=false "
            f"foreground_start={str(foreground_start).lower()}"
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
            sample_fps = fps - index * 0.01
            sample_process = process_total + index * 0.01
            if (
                state == "panel_stress"
                and panel_min_override is not None
                and index == sample_count - 1
            ):
                sample_fps = panel_min_override
            if (
                state == "moving"
                and moving_process_tail_override is not None
                and index == sample_count - 1
            ):
                sample_process = moving_process_tail_override
            if (
                state == "panel_stress"
                and panel_process_tail_override is not None
                and index == sample_count - 1
            ):
                sample_process = panel_process_tail_override
            lines.append(
                "perf probe: "
                f"fps={sample_fps:.1f} frames=60 "
                f"draw=0.12ms process_total={sample_process:.2f}ms"
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
        "PHASE399_MAP_PERF_HANDLER panel_clicks=60 "
        "press_dispatch_samples=60 "
        f"press_dispatch_p95_usec={press_dispatch_p95_usec} "
        f"press_dispatch_max_usec={press_dispatch_max_usec} "
        "handler_refresh_samples=60 "
        f"handler_refresh_p95_usec={handler_refresh_p95_usec} "
        f"handler_refresh_max_usec={handler_refresh_max_usec}"
    )
    lines.append(
        "PHASE399_MAP_PERF_END status=passed elapsed_wall=24.600 "
        "scene=Main.tscn entry=MainSceneFlag viewport=1280x720 "
        "idle=true moving=true panel_stress=true cycles=12 "
        "moving_clicks=8 moving_accepted=8 moved_distance=932.50 "
        "panel_clicks=60 prepared_visual=true regions=9 "
        "hud_restored=true ui_world_leaks=0 backend_started=false "
        "profile_save=false end_http_disconnected=true "
        f"foreground_start={str(foreground_start).lower()} "
        f"foreground_end={str(foreground_end).lower()} "
        f"menu_fps60={str(menu_fps60).lower()} "
        f"menu_fps60_checks={menu_fps60_checks} "
        f"actual_left_clicks=68 cross_frame_presses={cross_frame_presses} "
        f"press_dispatch_p95_usec={press_dispatch_p95_usec} "
        f"press_dispatch_max_usec={press_dispatch_max_usec} "
        f"handler_refresh_p95_usec={handler_refresh_p95_usec} "
        f"handler_refresh_max_usec={handler_refresh_max_usec}"
    )
    return "\n".join(lines) + "\n"


def _diagnostic_log(
    *,
    panel_effective_fps: float = 41.5,
    signal_max_usec: int = 3600,
) -> str:
    def state_line(index: int, state: str) -> str:
        effective_fps = (
            panel_effective_fps
            if state == "panel_stress"
            else 59.5 - index * 0.2
        )
        interval_median = 1_000_000.0 / effective_fps
        return (
            "PHASE399_MAP_DIAGNOSTIC_STATE "
            f"state={state} status=observed "
            "foreground_start=true foreground_end=true warmup_frames=60 "
            "interval_samples=300 target60_checks=360 "
            f"interval_median_usec={interval_median:.1f} "
            f"interval_p95_usec={interval_median + 800.0:.1f} "
            f"interval_max_usec={interval_median + 2200.0:.1f} "
            f"effective_fps={effective_fps:.3f} "
            "main_process_samples=300 main_process_p95_usec=920.0 "
            "main_process_max_usec=1820.0 draw_calls_median=18.0 "
            "draw_calls_p95=22.0 render_objects_median=140.0 "
            "render_objects_p95=154.0 render_primitives_median=820.0 "
            "render_primitives_p95=910.0 node_start=1820 node_end=1820 "
            "orphan_start=0 orphan_end=0 subviewport_present=true "
            "subviewport_size=900x520 subviewport_update_mode=1"
        )

    def open_timing_line(cycle: int) -> str:
        signal_total = (
            signal_max_usec
            if cycle == TOOL.DIAGNOSTIC_SIGNAL_CYCLES - 1
            else 300
        )
        signal_residual = signal_total - 250
        return (
            "PHASE399_MAP_DIAGNOSTIC_OPEN_TIMING "
            f"action=open_local cycle={cycle} token=open_local:{cycle} "
            "status=observed complete=true default_off=true "
            "consume_once=true prepared_visual=true "
            "fallback_called=false fallback_counter_delta=0 "
            "lightweight_layout=true layout_fallback_delta=0 "
            "hang_usec=5 dialog_encounter_usec=10 other_panels_usec=20 "
            "show_reset_usec=5 view_state_usec=20 bounds_usec=5 "
            "prepared_predicate_usec=3 fallback_usec=0 "
            "apply_state_copy_usec=10 apply_header_usec=10 "
            "apply_sidebar_usec=10 apply_local_map_usec=10 "
            "apply_world_regions_usec=10 apply_world_detail_usec=10 "
            "apply_show_mode_usec=10 apply_marker_schedule_usec=10 "
            "apply_residual_usec=20 panel_apply_total_usec=100 "
            "marker_publish_usec=2 refresh_residual_usec=20 "
            "refresh_total_usec=150 layout_usec=20 "
            "deferred_layout_schedule_usec=2 tutorial_usec=3 "
            "open_residual_usec=35 open_total_usec=250 "
            f"signal_residual_usec={signal_residual} "
            f"signal_total_usec={signal_total}"
        )

    lines = [
        "Godot Engine v4.7.stable.official",
        "Metal 4.0 - Forward Mobile - Using Device #0: Apple",
        (
            "PHASE399_MAP_DIAGNOSTIC_FOCUS_SETUP status=observed "
            "autofill_guard=true focused_text_before=true "
            "focused_text_after=false focus_class_before=LineEdit "
            "focus_path_before=/root/Main/AuthPanel/Password "
            "focus_class_after=Button "
            "focus_target=/root/Main/WorldHud/WorldHudEntryMap "
            "foreground=true"
        ),
        (
            "PHASE399_MAP_DIAGNOSTIC_START scene=Main.tscn "
            "entry=MainSceneFlag viewport=1280x720 renderer=Metal "
            "profile=fresh backend_started=false profile_save=false "
            "status=observing states=5 warmup_frames=60 sample_frames=300"
        ),
    ]
    for index, state in enumerate(TOOL.DIAGNOSTIC_STATES[:3]):
        lines.append(state_line(index, state))
    for cycle in range(TOOL.DIAGNOSTIC_SIGNAL_CYCLES):
        lines.append(open_timing_line(cycle))
    for action in TOOL.DIAGNOSTIC_SIGNAL_ACTIONS:
        lines.append(
            "PHASE399_MAP_DIAGNOSTIC_SIGNAL "
            f"action={action} status=observed samples=12 "
            "synchronous=true immediate_state=true "
            f"p95_usec={signal_max_usec} max_usec={signal_max_usec}"
        )
    lines.append(
        "PHASE399_MAP_DIAGNOSTIC_SETUP action=reset_region "
        "status=observed setup_only=true samples=24 "
        "synchronous=true immediate_state=true"
    )
    lines.append(state_line(3, "panel_stress"))
    lines.append(
        "PHASE399_MAP_DIAGNOSTIC_INPUT status=observed samples=60 "
        "observed=60 cross_frame=60 latency_p95_usec=18400 "
        "latency_max_usec=34100 latency_p95_frames=1 latency_max_frames=2"
    )
    lines.append(state_line(4, "post_stress_local_static"))
    lines.append(
        "PHASE399_MAP_DIAGNOSTIC_END status=observed complete=true "
        "scene=Main.tscn entry=MainSceneFlag viewport=1280x720 states=5 "
        "static_states=4 stress_cycles=12 real_click_samples=60 "
        "signal_samples=60 open_timing_samples=12 "
        "node_start=1818 node_end=1820 "
        "orphan_start=0 orphan_end=0 release_decision=diagnostic_only "
        "elapsed_wall=48.200"
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
        diagnostic = TOOL._build_diagnostic_command(
            godot="/opt/godot",
            user_data_dir=Path("/tmp/phase399-map-diagnostic-user"),
        )
        diagnostic_separator = diagnostic.index("--")
        diagnostic_engine = diagnostic[:diagnostic_separator]
        diagnostic_user = diagnostic[diagnostic_separator + 1 :]
        self.assertEqual(
            diagnostic_engine[diagnostic_engine.index("--scene") + 1],
            TOOL.MAIN_SCENE,
        )
        self.assertEqual(
            diagnostic_engine[
                diagnostic_engine.index("--user-data-dir") + 1
            ],
            "/tmp/phase399-map-diagnostic-user",
        )
        self.assertEqual(
            diagnostic_engine[diagnostic_engine.index("--resolution") + 1],
            "1280x720",
        )
        self.assertIn("--windowed", diagnostic_engine)
        self.assertIn("--single-window", diagnostic_engine)
        self.assertNotIn("--headless", diagnostic_engine)
        self.assertNotIn("--fixed-fps", diagnostic_engine)
        self.assertNotIn("--write-movie", diagnostic_engine)
        self.assertIn("--perf-probe", diagnostic_user)
        self.assertIn(TOOL.RENDER_DIAGNOSTIC_FLAG, diagnostic_user)
        with self.assertRaises(TOOL.Phase399MapPerfError):
            TOOL._build_diagnostic_command(
                godot="/opt/godot",
                user_data_dir=Path("/tmp/phase399-map-diagnostic-user"),
                extra_args=("--auto-auth-server-live-check",),
            )

    def test_current_sources_have_minimal_main_and_real_click_contract(
        self,
    ) -> None:
        TOOL._require_perf_wiring()
        TOOL._require_diagnostic_wiring()

    def test_diagnostic_accepts_complete_observed_low_fps_without_pass(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "godot-diagnostic.log"
            path.write_text(
                _diagnostic_log(panel_effective_fps=40.0),
                encoding="utf-8",
            )
            result = TOOL._validate_diagnostic_log(path)
        self.assertEqual(result["status"], "observed")
        self.assertTrue(result["complete"])
        self.assertEqual(result["releaseDecision"], "diagnostic_only")
        self.assertTrue(result["focusSetup"]["autofillGuard"])
        self.assertTrue(result["focusSetup"]["focusedTextBefore"])
        self.assertFalse(result["focusSetup"]["focusedTextAfter"])
        self.assertEqual(result["focusSetup"]["focusClassAfter"], "Button")
        self.assertTrue(result["focusSetup"]["foreground"])
        self.assertEqual(tuple(result["states"]), TOOL.DIAGNOSTIC_STATES)
        self.assertEqual(
            result["states"]["panel_stress"]["effectiveFps"],
            40.0,
        )
        self.assertNotIn("passed", result)
        self.assertEqual(result["realInputLatency"]["samples"], 60)
        self.assertEqual(result["realInputLatency"]["observed"], 60)
        self.assertEqual(tuple(result["signalCpu"]), TOOL.DIAGNOSTIC_SIGNAL_ACTIONS)
        self.assertEqual(len(result["openTiming"]), 12)
        self.assertEqual(
            [sample["cycle"] for sample in result["openTiming"]],
            list(range(12)),
        )
        self.assertTrue(
            all(
                not sample["fallbackCalled"]
                and sample["fallbackCounterDelta"] == 0
                for sample in result["openTiming"]
            )
        )
        self.assertEqual(result["setup"]["action"], "reset_region")
        self.assertTrue(result["setup"]["setupOnly"])
        self.assertEqual(result["setup"]["samples"], 24)
        self.assertTrue(
            all(
                value["maxMicroseconds"] < 8000
                for value in result["signalCpu"].values()
            )
        )

    def test_diagnostic_rejects_incomplete_forged_or_async_evidence(
        self,
    ) -> None:
        valid = _diagnostic_log()
        valid_lines = valid.splitlines()
        end_before_evidence = "\n".join(
            valid_lines[:2] + [valid_lines[-1]] + valid_lines[2:-1]
        ) + "\n"
        start_after_state = "\n".join(
            valid_lines[:3]
            + [valid_lines[4], valid_lines[3]]
            + valid_lines[5:]
        ) + "\n"
        invalid_logs = (
            valid.replace(
                "PHASE399_MAP_DIAGNOSTIC_FOCUS_SETUP",
                "PHASE399_MAP_DIAGNOSTIC_FOCUS_SETUP_MISSING",
                1,
            ),
            valid.replace("autofill_guard=true", "autofill_guard=false", 1),
            valid.replace(" focused_text_before=true", "", 1),
            valid.replace(
                "focused_text_after=false", "focused_text_after=true", 1
            ),
            valid.replace(" focused_text_after=false", "", 1),
            valid.replace(
                "focus_class_after=Button", "focus_class_after=LineEdit", 1
            ),
            valid.replace(
                "focus_target=/root/Main/WorldHud/WorldHudEntryMap",
                "focus_target=none",
                1,
            ),
            valid.replace(
                " focus_target=/root/Main/WorldHud/WorldHudEntryMap", "", 1
            ),
            valid.replace(
                "focus_target=/root/Main/WorldHud/WorldHudEntryMap",
                "focus_target=/root/Main/AuthPanel/LoginButton",
                1,
            ),
            valid.replace(" foreground=true\n", " foreground=false\n", 1),
            valid
            + (
                "noise PHASE399_MAP_DIAGNOSTIC_FOCUS_SETUP "
                "status=observed autofill_guard=true\n"
            ),
            valid
            + "noise PHASE399_MAP_DIAGNOSTIC_START status=observing\n",
            valid.replace(
                " foreground=true\n",
                (
                    " foreground=true PHASE399_MAP_DIAGNOSTIC_START "
                    "status=observing\n"
                ),
                1,
            ),
            valid.replace(" status=observing", " status=passed", 1),
            valid.replace("profile=fresh", "profile=shared", 1),
            valid.replace(
                "status=observing",
                "status=observing status=observed",
                1,
            ),
            valid.replace("state=fresh_local_static", "state=panel_stress", 1),
            valid.replace(" foreground_start=true", " foreground_start=false", 1),
            valid.replace(" foreground_end=true", "", 1),
            valid.replace("interval_samples=300", "interval_samples=299", 1),
            valid.replace("target60_checks=360", "target60_checks=359", 1),
            valid.replace("main_process_samples=300", "main_process_samples=299", 1),
            valid.replace("subviewport_size=900x520", "subviewport_size=1x1", 1),
            valid.replace("effective_fps=59.500", "effective_fps=99.000", 1),
            valid.replace("samples=60 observed=60", "samples=60 observed=59", 1),
            valid.replace("latency_max_frames=2", "latency_max_frames=4", 1),
            valid.replace(" synchronous=true", " synchronous=false", 1),
            valid.replace(" immediate_state=true", " immediate_state=false", 1),
            _diagnostic_log(signal_max_usec=8000),
            valid.replace("samples=12", "samples=11", 1),
            valid.replace(
                "PHASE399_MAP_DIAGNOSTIC_OPEN_TIMING action=open_local cycle=0",
                "PHASE399_MAP_DIAGNOSTIC_OPEN_TIMING_MISSING action=open_local cycle=0",
                1,
            ),
            valid.replace(
                "cycle=1 token=open_local:1",
                "cycle=0 token=open_local:0",
                1,
            ),
            valid.replace(
                "cycle=1 token=open_local:1",
                "cycle=2 token=open_local:2",
                1,
            ),
            valid.replace("complete=true default_off=true", "complete=false default_off=true", 1),
            valid.replace("default_off=true", "default_off=false", 1),
            valid.replace("consume_once=true", "consume_once=false", 1),
            valid.replace("prepared_visual=true", "prepared_visual=false", 1),
            valid.replace("fallback_called=false", "fallback_called=true", 1),
            valid.replace("fallback_counter_delta=0", "fallback_counter_delta=1", 1),
            valid.replace("lightweight_layout=true", "lightweight_layout=false", 1),
            valid.replace(" layout_fallback_delta=0", "", 1),
            valid.replace("layout_fallback_delta=0", "layout_fallback_delta=1", 1),
            valid.replace("fallback_usec=0", "fallback_usec=1", 1),
            valid.replace("hang_usec=5", "hang_usec=-1", 1),
            valid.replace("apply_residual_usec=20", "apply_residual_usec=0", 1),
            valid.replace("refresh_residual_usec=20", "refresh_residual_usec=0", 1),
            valid.replace("open_residual_usec=35", "open_residual_usec=0", 1),
            valid.replace("signal_residual_usec=50", "signal_residual_usec=0", 1),
            valid.replace("panel_apply_total_usec=100", "panel_apply_total_usec=99", 1),
            valid.replace("refresh_total_usec=150", "refresh_total_usec=149", 1),
            valid.replace("open_total_usec=250", "open_total_usec=249", 1),
            valid.replace("signal_total_usec=300", "signal_total_usec=249", 1),
            valid.replace("signal_total_usec=300", "signal_total_usec=9000", 1),
            valid.replace(
                "action=open_local status=observed samples=12 "
                "synchronous=true immediate_state=true "
                "p95_usec=3600 max_usec=3600",
                "action=open_local status=observed samples=12 "
                "synchronous=true immediate_state=true "
                "p95_usec=3500 max_usec=3500",
                1,
            ),
            valid.replace("open_timing_samples=12", "open_timing_samples=11", 1),
            valid.replace("setup_only=true", "setup_only=false", 1),
            valid.replace(
                "PHASE399_MAP_DIAGNOSTIC_SETUP",
                "PHASE399_MAP_DIAGNOSTIC_SETUP_MISSING",
                1,
            ),
            valid.replace(
                "status=observed setup_only=true samples=24",
                "status=observed setup_only=true samples=23",
                1,
            ),
            valid.replace(
                "samples=24 synchronous=true",
                "samples=24 synchronous=false",
                1,
            ),
            valid.replace(
                "status=observed setup_only=true samples=24 "
                "synchronous=true immediate_state=true",
                "status=observed setup_only=true samples=24 "
                "synchronous=true immediate_state=false",
                1,
            ),
            valid.replace(
                "PHASE399_MAP_DIAGNOSTIC_END status=observed complete=true",
                "PHASE399_MAP_DIAGNOSTIC_END status=passed complete=true",
                1,
            ),
            valid.replace(
                "PHASE399_MAP_DIAGNOSTIC_END status=observed complete=true",
                "PHASE399_MAP_DIAGNOSTIC_END status=observed",
                1,
            ),
            valid.replace("release_decision=diagnostic_only", "release_decision=passed"),
            valid.replace(
                "release_decision=diagnostic_only",
                "release_decision=diagnostic_only release_decision=passed",
                1,
            ),
            valid.replace(
                "PHASE399_MAP_DIAGNOSTIC_SIGNAL action=world_tab",
                "PHASE399_MAP_DIAGNOSTIC_SIGNAL action=local_tab",
                1,
            ),
            valid.replace(
                "PHASE399_MAP_DIAGNOSTIC_INPUT",
                "PHASE399_MAP_DIAGNOSTIC_INPUT_MISSING",
                1,
            ),
            valid.replace(
                "PHASE399_MAP_DIAGNOSTIC_END",
                "PHASE399_MAP_DIAGNOSTIC_UNKNOWN status=observed\n"
                "PHASE399_MAP_DIAGNOSTIC_END",
                1,
            ),
            end_before_evidence,
            start_after_state,
        )
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "godot-diagnostic.log"
            for index, text in enumerate(invalid_logs):
                with self.subTest(index=index):
                    path.write_text(text, encoding="utf-8")
                    with self.assertRaises(TOOL.Phase399MapPerfError):
                        TOOL._validate_diagnostic_log(path)

    def test_diagnostic_source_contract_rejects_non_exact_frame_sample(
        self,
    ) -> None:
        main_source = TOOL.MAIN_SCRIPT_PATH.read_text(encoding="utf-8")
        capture_source = TOOL.CAPTURE_SCRIPT_PATH.read_text(encoding="utf-8")
        panel_flow_source = TOOL.PANEL_FLOW_SCRIPT_PATH.read_text(
            encoding="utf-8"
        )
        map_panel_source = TOOL.MAP_PANEL_SCRIPT_PATH.read_text(
            encoding="utf-8"
        )
        player_progress_source = TOOL.PLAYER_PROGRESS_SCRIPT_PATH.read_text(
            encoding="utf-8"
        )
        auto_check_source = TOOL.AUTO_CHECK_SCRIPT_PATH.read_text(
            encoding="utf-8"
        )
        world_hud_view_source = TOOL.WORLD_HUD_VIEW_SCRIPT_PATH.read_text(
            encoding="utf-8"
        )
        world_hud_view_check_source = (
            TOOL.WORLD_HUD_VIEW_CHECK_SCRIPT_PATH.read_text(
                encoding="utf-8"
            )
        )
        required_fragments = (
            (
                "await host.get_tree().process_frame\n"
                '\thost.call("_reset_perf_probe_frame_max_for_qa")\n'
                "\tawait RenderingServer.frame_post_draw"
            ),
            (
                "await RenderingServer.frame_post_draw\n"
                "\tvar metrics := _diagnostic_new_frame_metrics()"
            ),
            "var engine_frame_before := Engine.get_process_frames()",
            "var engine_frame_after := Engine.get_process_frames()",
            "if actual_count != 1:",
            "if engine_delta < 0 or engine_delta > 1:",
            "actual_count=%d ",
            "interval_index=%d engine_delta=%d engine_before=%d ",
            "engine_after=%d context=%s",
            "stress_action=%s cycle=%d phase=motion",
            "stress_action=%s cycle=%d phase=press",
            "stress_action=%s cycle=%d phase=release_observe_%d",
            "func _diagnostic_prepare_autofill_guard() -> bool:",
            "viewport.gui_get_focus_owner()",
            "(focus_before as Control).release_focus()",
            "_map_entry.grab_focus()",
            'str(_map_entry.name) != "WorldHudEntryMap"',
            "PHASE399_MAP_DIAGNOSTIC_FOCUS_SETUP",
            "autofill_guard=true focused_text_before=%s",
            "focused_text_after=%s focus_class_before=%s",
            "return control is LineEdit or control is TextEdit",
            "if focused_text_after:",
            "if focus_after != _map_entry:",
            "if not foreground:",
            "PHASE399_MAP_DIAGNOSTIC_OPEN_TIMING",
            '"begin_map_open_timing_for_qa"',
            '"consume_map_open_timing_for_qa"',
            "_diagnostic_print_open_timing_raw(",
            "_diagnostic_validate_open_timing_sample(",
            'apply_child_usec != int(sample.get("panel_apply_total_usec", 0))',
            'refresh_child_usec != int(sample.get("refresh_total_usec", 0))',
            'open_child_usec != int(sample.get("open_total_usec", 0))',
            '+ int(sample.get("signal_residual_usec", 0))',
            'int(sample.get("signal_total_usec", 0)) >= DIAGNOSTIC_MAX_SIGNAL_USEC',
        )
        for fragment in required_fragments:
            self.assertIn(fragment, capture_source)
        auto_type_fragments = (
            "var stale_marker_container_id: int = int(",
            "var repaired_marker_container_id: int = int(",
            "var formal_map_panel: PanelContainer = host.map_panel as PanelContainer",
            "var formal_world_hud: Control = host.world_hud_awakened_view as Control",
            "var expected_camera_position: Vector2 = (",
        )
        for fragment in auto_type_fragments:
            self.assertIn(fragment, auto_check_source)
        tampered_sources = (
            capture_source.replace(
                "if not await _diagnostic_prepare_autofill_guard():",
                "if false:",
                1,
            ),
            capture_source.replace(
                "(focus_before as Control).release_focus()",
                "(focus_before as Control).grab_focus()",
                1,
            ),
            capture_source.replace(
                "_map_entry.grab_focus()",
                "_map_entry.release_focus()",
                1,
            ),
            capture_source.replace(
                'str(_map_entry.name) != "WorldHudEntryMap"',
                "false",
                1,
            ),
            capture_source.replace(
                '"PHASE399_MAP_DIAGNOSTIC_FOCUS_SETUP status=observed "',
                '"PHASE399_MAP_DIAGNOSTIC_FOCUS_SETUP_MISSING status=observed "',
                1,
            ),
            capture_source.replace(
                "if focused_text_after:",
                "if false:",
                1,
            ),
            capture_source.replace(
                "if focus_after != _map_entry:",
                "if false:",
                1,
            ),
            capture_source.replace(
                "if not foreground:",
                "if false:",
                1,
            ),
            capture_source.replace(
                "\tvar release := InputEventMouseButton.new()",
                (
                    "\tawait host.get_tree().physics_frame\n"
                    "\tvar release := InputEventMouseButton.new()"
                ),
                1,
            ),
            capture_source.replace(
                (
                    "await host.get_tree().process_frame\n"
                    '\thost.call("_reset_perf_probe_frame_max_for_qa")\n'
                    "\tawait RenderingServer.frame_post_draw"
                ),
                (
                    'host.call("_reset_perf_probe_frame_max_for_qa")\n'
                    "\tawait host.get_tree().process_frame\n"
                    "\tawait RenderingServer.frame_post_draw"
                ),
                1,
            ),
            capture_source.replace(
                (
                    "await host.get_tree().process_frame\n"
                    '\thost.call("_reset_perf_probe_frame_max_for_qa")\n'
                    "\tawait RenderingServer.frame_post_draw"
                ),
                (
                    "await host.get_tree().process_frame\n"
                    '\thost.call("_reset_perf_probe_frame_max_for_qa")'
                ),
                1,
            ),
            capture_source.replace(
                (
                    "await RenderingServer.frame_post_draw\n"
                    "\tvar metrics := _diagnostic_new_frame_metrics()"
                ),
                "var metrics := _diagnostic_new_frame_metrics()",
                1,
            ),
            capture_source.replace(
                "if actual_count != 1:",
                "if actual_count < 1:",
                1,
            ),
            capture_source.replace(
                "if actual_count != 1:",
                "if actual_count <= 1:",
                1,
            ),
            capture_source.replace(
                "if actual_count != 1:",
                "if false:",
                1,
            ),
            capture_source.replace(
                "if engine_delta < 0 or engine_delta > 1:",
                "if engine_delta != 1:",
                1,
            ),
            capture_source.replace(
                "if engine_delta < 0 or engine_delta > 1:",
                "if engine_delta < 0:",
                1,
            ),
            capture_source.replace(
                "var engine_frame_before := Engine.get_process_frames()",
                "var engine_frame_before := 0",
                1,
            ),
            capture_source.replace(
                "actual_count=%d ",
                "sample_error ",
                1,
            ),
            capture_source.replace(
                "stress_action=%s cycle=%d phase=press",
                "stress_phase=press",
                1,
            ),
        )
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            main_path = root / "main.gd"
            capture_path = root / "capture.gd"
            main_path.write_text(main_source, encoding="utf-8")
            for index, tampered in enumerate(tampered_sources):
                with self.subTest(index=index):
                    capture_path.write_text(tampered, encoding="utf-8")
                    with (
                        mock.patch.object(TOOL, "MAIN_SCRIPT_PATH", main_path),
                        mock.patch.object(
                            TOOL,
                            "CAPTURE_SCRIPT_PATH",
                            capture_path,
                        ),
                    ):
                        with self.assertRaises(TOOL.Phase399MapPerfError):
                            TOOL._require_diagnostic_wiring()

        with tempfile.TemporaryDirectory() as temp_dir:
            auto_path = Path(temp_dir) / "auto_check_coordinator.gd"
            for index, fragment in enumerate(auto_type_fragments):
                with self.subTest(auto_type_index=index):
                    auto_path.write_text(
                        auto_check_source.replace(
                            fragment,
                            fragment.replace(": int", "").replace(
                                ": PanelContainer",
                                "",
                            ).replace(": Control", "").replace(
                                ": Vector2",
                                "",
                            ),
                            1,
                        ),
                        encoding="utf-8",
                    )
                    with mock.patch.object(
                        TOOL,
                        "AUTO_CHECK_SCRIPT_PATH",
                        auto_path,
                    ):
                        with self.assertRaises(TOOL.Phase399MapPerfError):
                            TOOL._require_diagnostic_wiring()

        formal_contract_tampered_sources = (
            (
                capture_source.replace(
                    '"WorldHudMessageActions", true, false',
                    '"WorldHudMessageActionsMissing", true, false',
                    1,
                ),
                panel_flow_source,
                auto_check_source,
                world_hud_view_source,
                world_hud_view_check_source,
            ),
            (
                capture_source,
                panel_flow_source.replace(
                    '"battleMessageExpandButton": battle_message_expand_button',
                    '"battleMessageExpandButtonMissing": battle_message_expand_button',
                    1,
                ),
                auto_check_source,
                world_hud_view_source,
                world_hud_view_check_source,
            ),
            (
                capture_source,
                panel_flow_source.replace(
                    "battle_message_clear_button.pressed.connect(_clear_world_log_panel)",
                    "battle_message_clear_button.pressed.connect(_toggle_battle_message_expanded)",
                    1,
                ),
                auto_check_source,
                world_hud_view_source,
                world_hud_view_check_source,
            ),
            (
                capture_source,
                panel_flow_source,
                auto_check_source,
                world_hud_view_source.replace(
                    "_reparent_control(message_button, _message_action_row)",
                    "message_button.visible = true",
                    1,
                ),
                world_hud_view_check_source,
            ),
            (
                capture_source,
                panel_flow_source,
                auto_check_source,
                world_hud_view_source,
                world_hud_view_check_source.replace(
                    "expand_button.pressed.emit()",
                    "pass # did not exercise the real preserved signal",
                    1,
                ),
            ),
            (
                capture_source,
                panel_flow_source,
                auto_check_source.replace(
                    'host._set_world_log_message("地图轻量布局回归消息")',
                    'host.world_log_message = "地图轻量布局回归消息"',
                    1,
                ),
                world_hud_view_source,
                world_hud_view_check_source,
            ),
            (
                capture_source,
                panel_flow_source,
                auto_check_source.replace(
                    "prepared_fallback_builds_first == 0",
                    "prepared_fallback_builds_first >= 0",
                    1,
                ),
                world_hud_view_source,
                world_hud_view_check_source,
            ),
            (
                capture_source,
                panel_flow_source,
                auto_check_source.replace(
                    "shadow_nonprepared_fallback_builds == 1",
                    "shadow_nonprepared_fallback_builds >= 0",
                    1,
                ),
                world_hud_view_source,
                world_hud_view_check_source,
            ),
            (
                capture_source,
                panel_flow_source,
                auto_check_source.replace(
                    "WorldCameraSafeAreaModel.safe_viewport_rect(\n"
                    "\t\tviewport_size,\n\t\tno_blockers\n\t)",
                    "Rect2(Vector2.ZERO, viewport_size)",
                    1,
                ),
                world_hud_view_source,
                world_hud_view_check_source,
            ),
            (
                capture_source,
                panel_flow_source,
                auto_check_source.replace(
                    "PHASE398_MAP_LIGHTWEIGHT_QA_SNAPSHOT stage=%s",
                    "PHASE398_MAP_LIGHTWEIGHT_QA_SNAPSHOT_MISSING stage=%s",
                    1,
                ),
                world_hud_view_source,
                world_hud_view_check_source,
            ),
        )
        rollback_panel_declaration = (
            "\tvar rollback_message_panel: Control = (\n"
            '\t\t_legacy_controls.get("battleMessagePanel") as Control\n'
            "\t)\n"
        )
        rollback_baseline_visibility = (
            "\t_expect(\n"
            "\t\trollback_message_panel != null and not rollback_message_panel.visible,\n"
            '\t\t"rollback fixture 消息根在基线排版前应保持隐藏"\n'
            "\t)\n"
        )
        rollback_restored_visibility = (
            "\t_expect(\n"
            "\t\trollback_message_panel != null and not rollback_message_panel.visible,\n"
            '\t\t"rollback 同调用没有恢复隐藏的消息根"\n'
            "\t)\n"
        )
        rollback_capture_sequence = (
            "_configure_rollback_fixture()\n"
            f"{rollback_panel_declaration}"
            f"{rollback_baseline_visibility}"
            "\trollback_message_panel.visible = true\n"
            "\tawait process_frame\n"
            "\tawait process_frame\n"
            "\trollback_message_panel.visible = false\n"
            "\t_rollback_expectations = _capture_rollback_expectations()\n"
            "\t_append_internal_auto_name_fixture_errors()\n"
            "\t_append_noncanonical_intrinsic_minimum_fixture_errors()"
        )
        rollback_assert_sequence = (
            '_rollback_result = _view.call("rollback_mount") as Dictionary\n'
            "\t_append_mount_rollback_structure_errors()\n"
            '\t_append_mount_write_set_errors("rollback 同调用")\n'
            f"{rollback_restored_visibility}"
            "\trollback_message_panel.visible = true\n"
            "\tawait process_frame\n"
            "\tawait process_frame\n"
            "\trollback_message_panel.visible = false\n"
            "\t_append_mount_rollback_errors()\n"
            '\t_append_mount_write_set_errors("rollback settled")\n'
            "\t_append_mount_name_helper_contract_errors(legacy_host)"
        )
        rollback_semantic_call = (
            "_restore_mount_item_semantics(item as CanvasItem, record, errors)"
        )
        rollback_geometry_call = (
            "_restore_mount_item_geometry(item as CanvasItem, record)"
        )
        rollback_two_pass_sequence = (
            "\tfor record in ordered:\n"
            '\t\tvar item = record.get("node")\n'
            "\t\tif not (item is CanvasItem) or not is_instance_valid(item):\n"
            "\t\t\tcontinue\n"
            f"\t\t{rollback_semantic_call}\n"
            "\t\trestored_count += 1\n"
            "\tfor record in ordered:\n"
            '\t\tvar item = record.get("node")\n'
            "\t\tif not (item is CanvasItem) or not is_instance_valid(item):\n"
            "\t\t\tcontinue\n"
            f"\t\t{rollback_geometry_call}"
        )
        rollback_phase_mutations = (
            world_hud_view_check_source.replace(
                rollback_panel_declaration,
                rollback_panel_declaration.replace(
                    'get("battleMessagePanel")', 'get("topPanel")'
                ),
                1,
            ),
            world_hud_view_check_source.replace(
                rollback_baseline_visibility,
                "",
                1,
            ),
            world_hud_view_check_source.replace(
                rollback_restored_visibility,
                "",
                1,
            ),
            world_hud_view_check_source.replace(
                rollback_capture_sequence,
                rollback_capture_sequence.replace(
                    "\tawait process_frame\n\tawait process_frame\n",
                    "\tawait process_frame\n",
                    1,
                ),
                1,
            ),
            world_hud_view_check_source.replace(
                rollback_capture_sequence,
                rollback_capture_sequence.replace(
                    "\trollback_message_panel.visible = false\n"
                    "\t_rollback_expectations = _capture_rollback_expectations()",
                    "\t_rollback_expectations = _capture_rollback_expectations()\n"
                    "\trollback_message_panel.visible = false",
                    1,
                ),
                1,
            ),
            world_hud_view_check_source.replace(
                rollback_capture_sequence,
                rollback_capture_sequence.replace(
                    "\tawait process_frame\n\tawait process_frame\n",
                    "\tawait process_frame\n"
                    "\tawait process_frame\n"
                    "\tawait process_frame\n",
                    1,
                ),
                1,
            ),
            world_hud_view_check_source.replace(
                rollback_capture_sequence,
                rollback_capture_sequence.replace(
                    "\tawait process_frame\n\tawait process_frame\n",
                    "\tawait process_frame\n\tawait physics_frame\n",
                    1,
                ),
                1,
            ),
            world_hud_view_check_source.replace(
                rollback_capture_sequence,
                rollback_capture_sequence.replace(
                    "\trollback_message_panel.visible = true\n", "", 1
                ),
                1,
            ),
            world_hud_view_check_source.replace(
                rollback_assert_sequence,
                rollback_assert_sequence.replace(
                    "\tawait process_frame\n\tawait process_frame\n",
                    "\tawait process_frame\n",
                    1,
                ),
                1,
            ),
            world_hud_view_check_source.replace(
                rollback_assert_sequence,
                rollback_assert_sequence.replace(
                    "\trollback_message_panel.visible = false\n"
                    "\t_append_mount_rollback_errors()\n"
                    '\t_append_mount_write_set_errors("rollback settled")',
                    "\t_append_mount_rollback_errors()\n"
                    '\t_append_mount_write_set_errors("rollback settled")\n'
                    "\trollback_message_panel.visible = false",
                    1,
                ),
                1,
            ),
            world_hud_view_check_source.replace(
                rollback_assert_sequence,
                rollback_assert_sequence.replace(
                    "\tawait process_frame\n\tawait process_frame\n",
                    "\tawait process_frame\n"
                    "\tawait process_frame\n"
                    "\tawait process_frame\n",
                    1,
                ),
                1,
            ),
            world_hud_view_check_source.replace(
                rollback_assert_sequence,
                rollback_assert_sequence.replace(
                    "\tawait process_frame\n\tawait process_frame\n",
                    "\tawait process_frame\n"
                    "\tawait get_tree().create_timer(0.0).timeout\n",
                    1,
                ),
                1,
            ),
            world_hud_view_check_source.replace(
                rollback_assert_sequence,
                rollback_assert_sequence.replace(
                    "\trollback_message_panel.visible = true\n", "", 1
                ),
                1,
            ),
            world_hud_view_check_source.replace(
                rollback_assert_sequence,
                rollback_assert_sequence.replace(
                    "\trollback_message_panel.visible = true\n"
                    "\tawait process_frame\n"
                    "\tawait process_frame\n"
                    "\trollback_message_panel.visible = false\n"
                    "\t_append_mount_rollback_errors()\n"
                    '\t_append_mount_write_set_errors("rollback settled")',
                    "\t_append_mount_rollback_errors()\n"
                    '\t_append_mount_write_set_errors("rollback settled")\n'
                    "\trollback_message_panel.visible = true\n"
                    "\tawait process_frame\n"
                    "\tawait process_frame\n"
                    "\trollback_message_panel.visible = false",
                    1,
                ),
                1,
            ),
        )
        for mutation in rollback_phase_mutations:
            self.assertNotEqual(mutation, world_hud_view_check_source)
            formal_contract_tampered_sources += (
                (
                    capture_source,
                    panel_flow_source,
                    auto_check_source,
                    world_hud_view_source,
                    mutation,
                ),
            )
        rollback_noncanonical_call = (
            "\t_rollback_expectations = _capture_rollback_expectations()\n"
            "\t_append_internal_auto_name_fixture_errors()\n"
            "\t_append_noncanonical_intrinsic_minimum_fixture_errors()"
        )
        rollback_noncanonical_mutations = (
            world_hud_view_check_source.replace(
                "\t_append_noncanonical_intrinsic_minimum_fixture_errors()\n",
                "",
                1,
            ),
            world_hud_view_check_source.replace(
                rollback_noncanonical_call,
                (
                    "\t_append_noncanonical_intrinsic_minimum_fixture_errors()\n"
                    "\t_rollback_expectations = _capture_rollback_expectations()\n"
                    "\t_append_internal_auto_name_fixture_errors()"
                ),
                1,
            ),
            world_hud_view_check_source.replace(
                "\tfor node_name in ROLLBACK_NONCANONICAL_INTRINSIC_MINIMUM_NAMES:\n",
                (
                    "\tfor node_name in ROLLBACK_NONCANONICAL_INTRINSIC_MINIMUM_NAMES:\n"
                    "\t\tif control is Container:\n"
                    "\t\t\tcontinue\n"
                ),
                1,
            ),
            world_hud_view_check_source.replace(
                "intrinsic_minimum.x > 0.0 or intrinsic_minimum.y > 0.0",
                "true # illegal intrinsic-min exemption",
                1,
            ),
            world_hud_view_check_source.replace(
                "var right_is_noncanonical := not is_equal_approx(raw_right, canonical_right)",
                "var right_is_noncanonical := true # illegal noncanonical evidence bypass",
                1,
            ),
            world_hud_view_check_source.replace(
                '"LegacyCollapseButton",\n',
                "",
                1,
            ),
        )
        for mutation in rollback_noncanonical_mutations:
            self.assertNotEqual(mutation, world_hud_view_check_source)
            formal_contract_tampered_sources += (
                (
                    capture_source,
                    panel_flow_source,
                    auto_check_source,
                    world_hud_view_source,
                    mutation,
                ),
            )
        rollback_internal_name_mutations = (
            world_hud_view_check_source.replace(
                "\t_append_internal_auto_name_fixture_errors()\n",
                "",
                1,
            ),
            world_hud_view_check_source.replace(
                "func _append_internal_auto_name_fixture_errors() -> void:\n",
                (
                    "func _append_internal_auto_name_fixture_errors() -> void:\n"
                    "\treturn # illegal internal-name precondition bypass\n"
                ),
                1,
            ),
            world_hud_view_check_source.replace(
                "\tvar message_title := Label.new()\n"
                '\tmessage_title.text = "消息"\n',
                "\tvar message_title := Label.new()\n"
                '\tmessage_title.name = "ExplicitMessageTitle"\n'
                '\tmessage_title.text = "消息"\n',
                1,
            ),
            world_hud_view_check_source.replace(
                "\t_append_mount_name_helper_contract_errors(legacy_host)\n",
                "",
                1,
            ),
            world_hud_view_check_source.replace(
                "func _append_mount_name_helper_contract_errors(host: Control) -> void:\n",
                (
                    "func _append_mount_name_helper_contract_errors(host: Control) -> void:\n"
                    "\treturn # illegal direct name-helper evidence bypass\n"
                ),
                1,
            ),
            world_hud_view_check_source.replace(
                "and not internal_changed_errors.is_empty(),",
                "and internal_changed_errors.is_empty(), # illegal swallowed internal error",
                1,
            ),
            world_hud_view_check_source.replace(
                '\thang_button.name = "MountedReadableNameMutation"\n',
                "",
                1,
            ),
            world_hud_view_check_source.replace(
                '\t\t\thang_button.name != expected.get("name"),\n',
                "\t\t\ttrue, # illegal readable-name mutation bypass\n",
                1,
            ),
        )
        for mutation in rollback_internal_name_mutations:
            self.assertNotEqual(mutation, world_hud_view_check_source)
            formal_contract_tampered_sources += (
                (
                    capture_source,
                    panel_flow_source,
                    auto_check_source,
                    world_hud_view_source,
                    mutation,
                ),
            )
        rollback_structure_start = world_hud_view_check_source.index(
            "func _append_mount_rollback_structure_errors() -> void:"
        )
        rollback_full_start = world_hud_view_check_source.index(
            "func _append_mount_rollback_errors() -> void:",
            rollback_structure_start,
        )
        rollback_full_end = world_hud_view_check_source.index(
            "\n\nfunc legacy_host_find(", rollback_full_start
        )
        rollback_structure_exact_source = world_hud_view_check_source[
            rollback_structure_start:rollback_full_start
        ]
        rollback_full_exact_source = world_hud_view_check_source[
            rollback_full_start:rollback_full_end
        ]
        rollback_write_set_start = world_hud_view_check_source.index(
            "func _control_mount_write_set_snapshot("
        )
        rollback_write_set_end = world_hud_view_check_source.index(
            "\n\nfunc _capture_rollback_expectations()",
            rollback_write_set_start,
        )
        rollback_write_set_exact_source = world_hud_view_check_source[
            rollback_write_set_start:rollback_write_set_end
        ]
        rollback_assertion_helper_mutations = (
            world_hud_view_check_source.replace(
                "func _append_mount_rollback_structure_errors() -> void:\n",
                (
                    "func _append_mount_rollback_structure_errors() -> void:\n"
                    "\treturn # illegal immediate evidence bypass\n"
                ),
                1,
            ),
            world_hud_view_check_source.replace(
                "func _append_mount_rollback_errors() -> void:\n",
                (
                    "func _append_mount_rollback_errors() -> void:\n"
                    "\treturn # illegal settled evidence bypass\n"
                ),
                1,
            ),
            world_hud_view_check_source.replace(
                rollback_structure_exact_source,
                rollback_structure_exact_source.replace(
                    "\tfor expected in _rollback_expectations:\n",
                    "\tfor expected in []: # illegal empty immediate loop\n",
                    1,
                ),
                1,
            ),
            world_hud_view_check_source.replace(
                rollback_full_exact_source,
                rollback_full_exact_source.replace(
                    "\tfor expected in _rollback_expectations:\n",
                    "\tfor expected in []: # illegal empty settled loop\n",
                    1,
                ),
                1,
            ),
            world_hud_view_check_source.replace(
                (
                    "func _expect(condition: bool, message: String) -> void:\n"
                    "\tif not condition:\n"
                    "\t\t_errors.append(message)"
                ),
                (
                    "func _expect(condition: bool, message: String) -> void:\n"
                    "\tpass # illegal assertion sink bypass"
                ),
                1,
            ),
            world_hud_view_check_source.replace(
                "func _append_mount_write_set_errors(phase_label: String) -> void:\n",
                (
                    "func _append_mount_write_set_errors(phase_label: String) -> void:\n"
                    "\treturn # illegal write-set evidence bypass\n"
                ),
                1,
            ),
            world_hud_view_check_source.replace(
                rollback_write_set_exact_source,
                rollback_write_set_exact_source.replace(
                    "\tfor expected in _rollback_expectations:\n",
                    "\tfor expected in []: # illegal empty write-set loop\n",
                    1,
                ),
                1,
            ),
            world_hud_view_check_source.replace(
                '\t\t"visible": control.visible,\n',
                "",
                1,
            ),
            world_hud_view_check_source.replace(
                '\t_append_mount_write_set_errors("rollback 同调用")\n',
                "",
                1,
            ),
            world_hud_view_check_source.replace(
                '\t_append_mount_write_set_errors("rollback settled")\n',
                "",
                1,
            ),
            world_hud_view_check_source.replace(
                (
                    "\t_append_mount_rollback_errors()\n"
                    '\t_append_mount_write_set_errors("rollback settled")\n'
                    "\t_append_mount_name_helper_contract_errors(legacy_host)\n\n"
                    "\tvar report := {"
                ),
                (
                    "\t_append_mount_rollback_errors()\n"
                    '\t_append_mount_write_set_errors("rollback settled")\n'
                    "\t_append_mount_name_helper_contract_errors(legacy_host)\n"
                    "\t_errors.clear() # illegal evidence erase\n\n"
                    "\tvar report := {"
                ),
                1,
            ),
            world_hud_view_check_source.replace(
                '"result": "PASS" if _errors.is_empty() else "FAIL",',
                '"result": "PASS", # illegal unconditional pass',
                1,
            ),
            world_hud_view_check_source.replace(
                "\tquit(0 if _errors.is_empty() else 1)",
                "\tquit(0) # illegal unconditional success",
                1,
            ),
        )
        for mutation in rollback_assertion_helper_mutations:
            self.assertNotEqual(mutation, world_hud_view_check_source)
            formal_contract_tampered_sources += (
                (
                    capture_source,
                    panel_flow_source,
                    auto_check_source,
                    world_hud_view_source,
                    mutation,
                ),
            )
        swapped_two_pass_sequence = (
            rollback_two_pass_sequence.replace(
                rollback_semantic_call, "__ROLLBACK_SWAP__", 1
            )
            .replace(rollback_geometry_call, rollback_semantic_call, 1)
            .replace("__ROLLBACK_SWAP__", rollback_geometry_call, 1)
        )
        geometry_position_size_transform = (
            '\tcontrol.position = state.get("position", control.position)\n'
            '\tcontrol.size = state.get("size", control.size)\n'
            '\tcontrol.rotation = float(state.get("rotation", control.rotation))\n'
            '\tcontrol.scale = state.get("scale", control.scale)\n'
            '\tcontrol.pivot_offset = state.get("pivotOffset", control.pivot_offset)\n'
        )
        geometry_raw_offset_tail = (
            '\tcontrol.offset_left = float(state.get("offsetLeft", control.offset_left))\n'
            '\tcontrol.offset_top = float(state.get("offsetTop", control.offset_top))\n'
            '\tcontrol.offset_right = float(state.get("offsetRight", control.offset_right))\n'
            '\tcontrol.offset_bottom = float(state.get("offsetBottom", control.offset_bottom))'
        )
        geometry_restore_tail = (
            geometry_position_size_transform + geometry_raw_offset_tail
        )
        rollback_product_mutations = (
            world_hud_view_source.replace(
                rollback_semantic_call,
                "_restore_mount_item_semantics(item as CanvasItem, record, [])",
                1,
            ),
            world_hud_view_source.replace(
                "\tif item.name == saved_name:\n\t\treturn\n",
                "\tif item.name == saved_name:\n\t\tpass # illegal same-name fallthrough\n",
                1,
            ),
            world_hud_view_source.replace(
                'if str(saved_name).begins_with("@"):',
                'if not str(saved_name).begins_with("@"): # illegal reversed internal guard',
                1,
            ),
            world_hud_view_source.replace(
                '\t\terrors.append("internal mount name changed: %s" % str(saved_name))\n',
                "\t\tpass # illegal silent internal-name skip\n",
                1,
            ),
            world_hud_view_source.replace(
                'var saved_name: StringName = StringName(record.get("name"))',
                "var saved_name: StringName = item.name # illegal current-name snapshot",
                1,
            ),
            world_hud_view_source.replace(
                "\titem.name = saved_name\n",
                "",
                1,
            ),
            world_hud_view_source.replace(
                "\tif item.name != saved_name:\n"
                '\t\terrors.append("mount name restore failed: %s" % str(saved_name))\n',
                "",
                1,
            ),
            world_hud_view_source.replace(
                "\tif errors.is_empty():\n"
                "\t\t_remove_mount_artifacts()\n",
                "\tif true: # illegal cleanup despite rollback errors\n"
                "\t\t_remove_mount_artifacts()\n",
                1,
            ),
            world_hud_view_source.replace(
                "\treturn {\n"
                '\t\t"ok": errors.is_empty(),\n',
                "\t_remove_mount_artifacts() # illegal unconditional cleanup\n"
                "\treturn {\n"
                '\t\t"ok": errors.is_empty(),\n',
                1,
            ),
            world_hud_view_source.replace(
                rollback_two_pass_sequence,
                swapped_two_pass_sequence,
                1,
            ),
            world_hud_view_source.replace(
                f"\t\t{rollback_geometry_call}",
                "\t\tpass # illegal missing geometry replay",
                1,
            ),
            world_hud_view_source.replace(
                (
                    "control.custom_minimum_size = state.get("
                    '"customMinimumSize", control.custom_minimum_size)'
                ),
                (
                    "control.custom_minimum_size = state.get("
                    '"customMinimumSize", control.custom_minimum_size)\n'
                    '\tcontrol.size = state.get("size", control.size)'
                ),
                1,
            ),
            world_hud_view_source.replace(
                "func _restore_control_mount_geometry(control: Control, state: Dictionary) -> void:\n",
                (
                    "func _restore_control_mount_geometry(control: Control, state: Dictionary) -> void:\n"
                    '\tcontrol.custom_minimum_size = state.get("customMinimumSize", control.custom_minimum_size)\n'
                ),
                1,
            ),
            world_hud_view_source.replace(
                (
                    'control.position = state.get("position", control.position)\n'
                    '\tcontrol.size = state.get("size", control.size)'
                ),
                (
                    'control.size = state.get("size", control.size)\n'
                    '\tcontrol.position = state.get("position", control.position)'
                ),
                1,
            ),
            world_hud_view_source.replace(
                'return int(left.get("depth", 0)) < int(right.get("depth", 0))',
                'return int(left.get("depth", 0)) > int(right.get("depth", 0))',
                1,
            ),
            world_hud_view_source.replace(
                "\t_restore_theme_overrides(control, state.get(\"themeOverrides\", {}))\n",
                "",
                1,
            ),
            world_hud_view_source.replace(
                'button.text = str(state.get("text", button.text))\n',
                "",
                1,
            ),
            world_hud_view_source.replace(
                geometry_restore_tail,
                geometry_raw_offset_tail
                + "\n"
                + geometry_position_size_transform.rstrip("\n"),
                1,
            ),
        )
        for mutation in rollback_product_mutations:
            self.assertNotEqual(mutation, world_hud_view_source)
            formal_contract_tampered_sources += (
                (
                    capture_source,
                    panel_flow_source,
                    auto_check_source,
                    mutation,
                    world_hud_view_check_source,
                ),
            )
        for offset_property in (
            "offset_left",
            "offset_top",
            "offset_right",
            "offset_bottom",
        ):
            offset_line = next(
                line
                for line in geometry_raw_offset_tail.splitlines()
                if f"control.{offset_property} =" in line
            )
            mutation = world_hud_view_source.replace(
                offset_line + ("\n" if offset_property != "offset_bottom" else ""),
                "",
                1,
            )
            self.assertNotEqual(mutation, world_hud_view_source)
            formal_contract_tampered_sources += (
                (
                    capture_source,
                    panel_flow_source,
                    auto_check_source,
                    mutation,
                    world_hud_view_check_source,
                ),
            )
        for illegal_tail_statement in (
            '\tcontrol.position = state.get("position", control.position)',
            '\tcontrol.size = state.get("size", control.size)',
            '\tcontrol.set_rect(Rect2(control.position, control.size))',
            '\tcontrol.custom_minimum_size = state.get("customMinimumSize", control.custom_minimum_size)',
            '\tcontrol.add_theme_color_override("font_color", Color.WHITE)',
            '\tcontrol.visible = bool(state.get("visible", control.visible))',
            '\tcontrol.tooltip_text = str(state.get("tooltipText", control.tooltip_text))',
        ):
            mutation = world_hud_view_source.replace(
                geometry_raw_offset_tail,
                geometry_raw_offset_tail + "\n" + illegal_tail_statement,
                1,
            )
            self.assertNotEqual(mutation, world_hud_view_source)
            formal_contract_tampered_sources += (
                (
                    capture_source,
                    panel_flow_source,
                    auto_check_source,
                    mutation,
                    world_hud_view_check_source,
                ),
            )
        semantic_item_fragments = (
            "item.name =",
            "item.visible =",
            "item.modulate =",
            "item.self_modulate =",
            "item.z_index =",
            "item.z_as_relative =",
            "item.show_behind_parent =",
            "_restore_metadata(item,",
            "_restore_control_mount_semantics(",
            "label.text =",
            "label.horizontal_alignment =",
            "label.vertical_alignment =",
            "label.autowrap_mode =",
            "label.clip_text =",
            "label.text_overrun_behavior =",
            "label.max_lines_visible =",
            "rich_text.text =",
            "rich_text.fit_content =",
            "rich_text.scroll_active =",
            "rich_text.autowrap_mode =",
            "base_button.disabled =",
            "base_button.toggle_mode =",
            "base_button.button_pressed =",
            "base_button.action_mode =",
            "button.text =",
            "button.icon =",
            "button.flat =",
            "button.clip_text =",
            "button.text_overrun_behavior =",
            "button.alignment =",
            "button.icon_alignment =",
            "button.expand_icon =",
        )
        semantic_control_fragments = (
            "control.custom_minimum_size =",
            "control.size_flags_horizontal =",
            "control.size_flags_vertical =",
            "control.mouse_filter =",
            "control.mouse_default_cursor_shape =",
            "control.focus_mode =",
            "control.clip_contents =",
            "control.tooltip_text =",
            "_restore_theme_overrides(control,",
        )
        semantic_item_start = world_hud_view_source.index(
            "func _restore_mount_item_semantics("
        )
        semantic_control_start = world_hud_view_source.index(
            "func _restore_control_mount_semantics(", semantic_item_start
        )
        geometry_item_start = world_hud_view_source.index(
            "func _restore_mount_item_geometry(", semantic_control_start
        )
        semantic_item_source = world_hud_view_source[
            semantic_item_start:semantic_control_start
        ]
        semantic_control_source = world_hud_view_source[
            semantic_control_start:geometry_item_start
        ]
        semantic_deletion_cases = (
            (semantic_item_start, semantic_control_start, semantic_item_source, semantic_item_fragments),
            (semantic_control_start, geometry_item_start, semantic_control_source, semantic_control_fragments),
        )
        for slice_start, slice_end, slice_source, fragments in semantic_deletion_cases:
            for fragment in fragments:
                mutated_slice = slice_source.replace(
                    fragment,
                    "pass # illegal missing rollback semantic ",
                    1,
                )
                self.assertNotEqual(mutated_slice, slice_source)
                mutation = (
                    world_hud_view_source[:slice_start]
                    + mutated_slice
                    + world_hud_view_source[slice_end:]
                )
                formal_contract_tampered_sources += (
                    (
                        capture_source,
                        panel_flow_source,
                        auto_check_source,
                        mutation,
                        world_hud_view_check_source,
                    ),
                )
        geometry_semantic_injections = (
            world_hud_view_source.replace(
                "func _restore_mount_item_geometry(item: CanvasItem, record: Dictionary) -> void:\n",
                (
                    "func _restore_mount_item_geometry(item: CanvasItem, record: Dictionary) -> void:\n"
                    '\titem.visible = bool(record.get("visible", true))\n'
                ),
                1,
            ),
            world_hud_view_source.replace(
                "func _restore_control_mount_geometry(control: Control, state: Dictionary) -> void:\n",
                (
                    "func _restore_control_mount_geometry(control: Control, state: Dictionary) -> void:\n"
                    '\tcontrol.mouse_filter = state.get("mouseFilter", control.mouse_filter)\n'
                ),
                1,
            ),
            world_hud_view_source.replace(
                "func _restore_control_mount_geometry(control: Control, state: Dictionary) -> void:\n",
                (
                    "func _restore_control_mount_geometry(control: Control, state: Dictionary) -> void:\n"
                    '\tcontrol.tooltip_text = str(state.get("tooltipText", control.tooltip_text))\n'
                ),
                1,
            ),
            world_hud_view_source.replace(
                (
                    '_restore_control_mount_geometry(item as Control, record.get("control", {}))'
                ),
                (
                    '_restore_control_mount_geometry(item as Control, record.get("control", {}))\n'
                    '\titem.visible = bool(record.get("visible", true))'
                ),
                1,
            ),
            world_hud_view_source.replace(
                'control.pivot_offset = state.get("pivotOffset", control.pivot_offset)',
                (
                    'control.pivot_offset = state.get("pivotOffset", control.pivot_offset)\n'
                    '\tcontrol.name = state.get("name", control.name)'
                ),
                1,
            ),
            world_hud_view_source.replace(
                'control.pivot_offset = state.get("pivotOffset", control.pivot_offset)',
                (
                    'control.pivot_offset = state.get("pivotOffset", control.pivot_offset)\n'
                    '\tcontrol.visible = bool(state.get("visible", control.visible))'
                ),
                1,
            ),
            world_hud_view_source.replace(
                '_restore_control_mount_geometry(item as Control, record.get("control", {}))',
                (
                    '_restore_control_mount_geometry(item as Control, record.get("control", {}))\n'
                    '\tpass # illegal arbitrary geometry item statement'
                ),
                1,
            ),
            world_hud_view_source.replace(
                'control.pivot_offset = state.get("pivotOffset", control.pivot_offset)',
                (
                    'control.pivot_offset = state.get("pivotOffset", control.pivot_offset)\n'
                    '\tpass # illegal arbitrary geometry control statement'
                ),
                1,
            ),
        )
        for mutation in geometry_semantic_injections:
            self.assertNotEqual(mutation, world_hud_view_source)
            formal_contract_tampered_sources += (
                (
                    capture_source,
                    panel_flow_source,
                    auto_check_source,
                    mutation,
                    world_hud_view_check_source,
                ),
            )
        semantic_rhs_mutations = (
            (
                'item.visible = bool(record.get("visible", true))',
                "item.visible = item.visible",
            ),
            (
                'control.custom_minimum_size = state.get("customMinimumSize", control.custom_minimum_size)',
                "control.custom_minimum_size = control.custom_minimum_size",
            ),
            (
                'label.text = str(state.get("text", label.text))',
                "label.text = label.text",
            ),
            (
                'rich_text.text = str(state.get("text", rich_text.text))',
                "rich_text.text = rich_text.text",
            ),
            (
                'base_button.disabled = bool(state.get("disabled", base_button.disabled))',
                "base_button.disabled = base_button.disabled",
            ),
            (
                'button.text = str(state.get("text", button.text))',
                "button.text = button.text",
            ),
        )
        for original, replacement in semantic_rhs_mutations:
            mutation = world_hud_view_source.replace(original, replacement, 1)
            self.assertNotEqual(mutation, world_hud_view_source)
            formal_contract_tampered_sources += (
                (
                    capture_source,
                    panel_flow_source,
                    auto_check_source,
                    mutation,
                    world_hud_view_check_source,
                ),
            )
        rollback_transform_expectation_fragments = (
            '"rotation": control.rotation,',
            '"scale": control.scale,',
            '"pivotOffset": control.pivot_offset,',
        )
        rollback_immediate_geometry_fragments = (
            "control.position.is_equal_approx(\n"
            '\t\t\t\texpected.get("position", Vector2.ZERO)\n'
            "\t\t\t)",
            'control.size.is_equal_approx(expected.get("size", Vector2.ZERO))',
            '[control.anchor_left, expected.get("anchorLeft", 0.0), "左"]',
            '[control.anchor_top, expected.get("anchorTop", 0.0), "上"]',
            '[control.anchor_right, expected.get("anchorRight", 0.0), "右"]',
            '[control.anchor_bottom, expected.get("anchorBottom", 0.0), "下"]',
            '[control.offset_left, expected.get("offsetLeft", 0.0), "左"]',
            '[control.offset_top, expected.get("offsetTop", 0.0), "上"]',
            '[control.offset_right, expected.get("offsetRight", 0.0), "右"]',
            '[control.offset_bottom, expected.get("offsetBottom", 0.0), "下"]',
            'is_equal_approx(control.rotation, float(expected.get("rotation", 0.0)))',
            'control.scale.is_equal_approx(expected.get("scale", Vector2.ONE))',
            "control.pivot_offset.is_equal_approx(\n"
            '\t\t\t\texpected.get("pivotOffset", Vector2.ZERO)\n'
            "\t\t\t)",
        )
        rollback_settled_geometry_fragments = (
            'control.position.is_equal_approx(expected.get("position", Vector2.ZERO))',
            'control.size.is_equal_approx(expected.get("size", Vector2.ZERO))',
            'is_equal_approx(control.rotation, float(expected.get("rotation", 0.0)))',
            'control.scale.is_equal_approx(expected.get("scale", Vector2.ONE))',
            'control.pivot_offset.is_equal_approx(expected.get("pivotOffset", Vector2.ZERO))',
            'is_equal_approx(control.anchor_left, float(expected.get("anchorLeft", 0.0)))',
            'is_equal_approx(control.anchor_top, float(expected.get("anchorTop", 0.0)))',
            'is_equal_approx(control.anchor_right, float(expected.get("anchorRight", 0.0)))',
            'is_equal_approx(control.anchor_bottom, float(expected.get("anchorBottom", 0.0)))',
            'is_equal_approx(control.offset_left, float(expected.get("offsetLeft", 0.0)))',
            'is_equal_approx(control.offset_top, float(expected.get("offsetTop", 0.0)))',
            'is_equal_approx(control.offset_right, float(expected.get("offsetRight", 0.0)))',
            'is_equal_approx(control.offset_bottom, float(expected.get("offsetBottom", 0.0)))',
        )
        for fragment in (
            rollback_transform_expectation_fragments
            + rollback_immediate_geometry_fragments
            + rollback_settled_geometry_fragments
        ):
            mutation = world_hud_view_check_source.replace(
                fragment,
                "false # illegal missing rollback geometry evidence",
                1,
            )
            self.assertNotEqual(mutation, world_hud_view_check_source)
            formal_contract_tampered_sources += (
                (
                    capture_source,
                    panel_flow_source,
                    auto_check_source,
                    world_hud_view_source,
                    mutation,
                ),
            )
        rollback_exact_size_fragment = (
            "_expect(control.size.is_equal_approx("
            'expected.get("size", Vector2.ZERO)), '
            '"rollback 尺寸错误：%s" % label)'
        )
        rollback_immediate_size_fragment = (
            "\t\t_expect(\n"
            '\t\t\tcontrol.size.is_equal_approx(expected.get("size", Vector2.ZERO)),\n'
            '\t\t\t"rollback 同调用尺寸错误：%s" % label\n'
            "\t\t)"
        )
        size_mutations = (
            world_hud_view_check_source.replace(
                rollback_exact_size_fragment,
                "pass # illegal rollback size exemption",
                1,
            ),
            world_hud_view_check_source.replace(
                rollback_exact_size_fragment,
                (
                    "if control is Container:\n"
                    "\t\t\tcontinue\n\t\t"
                    f"{rollback_exact_size_fragment}"
                ),
                1,
            ),
            world_hud_view_check_source.replace(
                rollback_immediate_size_fragment,
                "\t\tpass # illegal missing same-call exact geometry",
                1,
            ),
        )
        for mutation in size_mutations:
            self.assertNotEqual(mutation, world_hud_view_check_source)
            formal_contract_tampered_sources += (
                (
                    capture_source,
                    panel_flow_source,
                    auto_check_source,
                    world_hud_view_source,
                    mutation,
                ),
            )
        before_reset_snapshot_contracts = (
            (
                '_print_map_lightweight_qa_snapshot("initial_before_reset", panel_flow)',
                "panel_flow.reset_map_minimap_fallback_build_count_for_qa()\n"
                "\tpanel_flow.reset_map_world_lightweight_layout_for_qa()",
            ),
            (
                '_print_map_lightweight_qa_snapshot("before_hang_reset", panel_flow)',
                "panel_flow.reset_map_world_lightweight_layout_for_qa()",
            ),
            (
                '_print_map_lightweight_qa_snapshot("before_battle_reset", panel_flow)',
                "panel_flow.reset_map_world_lightweight_layout_for_qa()",
            ),
            (
                '_print_map_lightweight_qa_snapshot("nonformal_before_reset", panel_flow)',
                "panel_flow.reset_map_minimap_fallback_build_count_for_qa()\n"
                "\tpanel_flow.reset_map_world_lightweight_layout_for_qa()",
            ),
            (
                '_print_map_lightweight_qa_snapshot("missing_world_before_reset", panel_flow)',
                "panel_flow.reset_map_world_lightweight_layout_for_qa()",
            ),
        )
        before_reset_snapshot_mutations = []
        for snapshot_call, reset_block in before_reset_snapshot_contracts:
            exact_sequence = f"{snapshot_call}\n\t{reset_block}"
            deleted = auto_check_source.replace(
                f"{snapshot_call}\n", "", 1
            )
            moved_after_reset = auto_check_source.replace(
                exact_sequence,
                f"{reset_block}\n\t{snapshot_call}",
                1,
            )
            self.assertNotEqual(deleted, auto_check_source)
            self.assertNotEqual(moved_after_reset, auto_check_source)
            before_reset_snapshot_mutations.extend(
                (
                    (
                        capture_source,
                        panel_flow_source,
                        deleted,
                        world_hud_view_source,
                        world_hud_view_check_source,
                    ),
                    (
                        capture_source,
                        panel_flow_source,
                        moved_after_reset,
                        world_hud_view_source,
                        world_hud_view_check_source,
                    ),
                )
            )
        formal_contract_tampered_sources += tuple(
            before_reset_snapshot_mutations
        )
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            paths = {
                "capture": root / "capture.gd",
                "panel_flow": root / "panel_flow.gd",
                "auto": root / "auto_check.gd",
                "world_hud_view": root / "world_hud_view.gd",
                "world_hud_view_check": root / "world_hud_view_check.gd",
            }
            for index, sources in enumerate(formal_contract_tampered_sources):
                with self.subTest(formal_message_index=index):
                    for path, source in zip(paths.values(), sources):
                        path.write_text(source, encoding="utf-8")
                    with (
                        mock.patch.object(
                            TOOL, "CAPTURE_SCRIPT_PATH", paths["capture"]
                        ),
                        mock.patch.object(
                            TOOL,
                            "PANEL_FLOW_SCRIPT_PATH",
                            paths["panel_flow"],
                        ),
                        mock.patch.object(
                            TOOL, "AUTO_CHECK_SCRIPT_PATH", paths["auto"]
                        ),
                        mock.patch.object(
                            TOOL,
                            "WORLD_HUD_VIEW_SCRIPT_PATH",
                            paths["world_hud_view"],
                        ),
                        mock.patch.object(
                            TOOL,
                            "WORLD_HUD_VIEW_CHECK_SCRIPT_PATH",
                            paths["world_hud_view_check"],
                        ),
                    ):
                        with self.assertRaises(TOOL.Phase399MapPerfError):
                            TOOL._require_diagnostic_wiring()

        timing_tampered_sources = (
            (
                capture_source.replace(
                    'apply_child_usec != int(sample.get("panel_apply_total_usec", 0))',
                    'apply_child_usec > int(sample.get("panel_apply_total_usec", 0))',
                    1,
                ),
                panel_flow_source,
                map_panel_source,
            ),
            (
                capture_source.replace(
                    "_diagnostic_print_open_timing_raw(",
                    "_diagnostic_print_open_timing_raw_missing(",
                    1,
                ),
                panel_flow_source,
                map_panel_source,
            ),
            (
                capture_source.replace(
                    'map_flow.call("disable_map_open_timing_for_qa")',
                    (
                        'map_flow.call("begin_map_open_timing_for_qa")\n'
                        '\tmap_flow.call("disable_map_open_timing_for_qa")'
                    ),
                    1,
                ),
                panel_flow_source,
                map_panel_source,
            ),
            (
                capture_source,
                panel_flow_source.replace(
                    "var _map_open_timing_for_qa_active := false",
                    "var _map_open_timing_for_qa_active := true",
                    1,
                ),
                map_panel_source,
            ),
            (
                capture_source,
                panel_flow_source.replace(
                    "if not _map_world_full_layout_available():",
                    "if false:",
                    1,
                ),
                map_panel_source,
            ),
            (
                capture_source,
                panel_flow_source.replace(
                    "or not _map_formal_world_hud_ready()",
                    "or false",
                    1,
                ),
                map_panel_source,
            ),
            (
                capture_source,
                panel_flow_source.replace(
                    "_map_world_lightweight_preflight_blocker(\n\t\tviewport_size\n\t)",
                    '"preflight_missing"',
                    1,
                ),
                map_panel_source,
            ),
            (
                capture_source,
                panel_flow_source.replace(
                    (
                        "_map_world_lightweight_close_same_call = false\n"
                        "\tif battle_active:\n\t\treturn"
                    ),
                    (
                        "_map_world_lightweight_close_same_call = false\n"
                        "\tif battle_active:\n"
                        '\t\t_apply_map_world_full_layout_fallback("battle_active", false)\n'
                        "\t\treturn"
                    ),
                    1,
                ),
                map_panel_source,
            ),
            (
                capture_source,
                panel_flow_source.replace(
                    "\t\t\tmap_panel.visible = false",
                    "\t\t\tpass # invalid world leaked map visibility",
                    1,
                ),
                map_panel_source,
            ),
            (
                capture_source,
                panel_flow_source.replace(
                    "_record_tutorial_feature_opened(TutorialFeatureModel.FEATURE_MAP)",
                    "pass # tutorial event moved after final lightweight layout",
                    1,
                ),
                map_panel_source,
            ),
            (
                capture_source,
                panel_flow_source.replace(
                    (
                        "if diagnostic_timing is Dictionary:\n"
                        "\t\topen_started_usec = Time.get_ticks_usec()"
                    ),
                    (
                        "if true:\n"
                        "\t\topen_started_usec = Time.get_ticks_usec()"
                    ),
                    1,
                ),
                map_panel_source,
            ),
            (
                capture_source,
                panel_flow_source.replace(
                    (
                        "if timing_enabled:\n"
                        "\t\trefresh_started_usec = Time.get_ticks_usec()"
                    ),
                    (
                        "if true:\n"
                        "\t\trefresh_started_usec = Time.get_ticks_usec()"
                    ),
                    1,
                ),
                map_panel_source,
            ),
            (
                capture_source,
                panel_flow_source,
                map_panel_source.replace(
                    (
                        "if timing_enabled:\n"
                        "\t\tapply_started_usec = Time.get_ticks_usec()"
                    ),
                    (
                        "if true:\n"
                        "\t\tapply_started_usec = Time.get_ticks_usec()"
                    ),
                    1,
                ),
            ),
            (
                capture_source,
                panel_flow_source.replace(
                    (
                        "# path must not rebuild hang HUD/profile state just to open a menu.\n"
                        "\tif hang_mode_active:\n\t\thost._set_hang_mode(false)"
                    ),
                    (
                        "# path must not rebuild hang HUD/profile state just to open a menu.\n"
                        "\tif true:\n\t\thost._set_hang_mode(false)"
                    ),
                    1,
                ),
                map_panel_source,
            ),
            (
                capture_source,
                panel_flow_source.replace(
                    'if battle_active:\n\t\treturn "battle_active"',
                    'if false:\n\t\treturn "battle_active"',
                    1,
                ),
                map_panel_source,
            ),
            (
                capture_source,
                panel_flow_source.replace(
                    'if battle_active:\n\t\treturn "battle_active"',
                    'if false:\n\t\treturn "battle_active"',
                    1,
                ).replace(
                    "func _map_world_lightweight_preflight_blocker(",
                    (
                        "func _dead_battle_guard() -> void:\n"
                        '\tif battle_active:\n\t\treturn "battle_active"\n\n'
                        "func _map_world_lightweight_preflight_blocker("
                    ),
                    1,
                ),
                map_panel_source,
            ),
            (
                capture_source,
                panel_flow_source.replace(
                    (
                        'if not (map_panel is MapAwakenedPanel):\n'
                        '\t\treturn "non_formal_map"'
                    ),
                    'if false:\n\t\treturn "non_formal_map"',
                    1,
                ).replace(
                    "func _map_world_lightweight_preflight_blocker(",
                    (
                        "func _dead_non_formal_guard() -> void:\n"
                        '\tif not (map_panel is MapAwakenedPanel):\n'
                        '\t\treturn "non_formal_map"\n\n'
                        "func _map_world_lightweight_preflight_blocker("
                    ),
                    1,
                ),
                map_panel_source,
            ),
            (
                capture_source,
                panel_flow_source.replace(
                    "or not _map_formal_world_hud_ready()",
                    "or false",
                    1,
                ).replace(
                    "func _map_formal_world_hud_ready() -> bool:",
                    (
                        "func _dead_missing_world_guard() -> void:\n"
                        "\tif map_panel is MapAwakenedPanel and (\n"
                        "\t\tor not _map_formal_world_hud_ready()\n"
                        "\t):\n\t\treturn \"missing_world_hud\"\n\n"
                        "func _map_formal_world_hud_ready() -> bool:"
                    ),
                    1,
                ),
                map_panel_source,
            ),
            (
                capture_source,
                panel_flow_source.replace(
                    (
                        "if not viewport_size.is_equal_approx(\n"
                        "\t\t_map_world_lightweight_layout_viewport\n"
                        "\t):\n\t\treturn \"viewport_changed\""
                    ),
                    "if false:\n\t\treturn \"viewport_changed\"",
                    1,
                ),
                map_panel_source,
            ),
            (
                capture_source,
                panel_flow_source.replace(
                    (
                        'if lightweight_reason != "":\n'
                        '\t\thost.call_deferred("_layout_hud")'
                    ),
                    'if true:\n\t\thost.call_deferred("_layout_hud")',
                    1,
                ),
                map_panel_source,
            ),
            (
                capture_source,
                panel_flow_source.replace(
                    (
                        "func _apply_map_world_safe_area_tail(viewport_size: Vector2) -> void:\n"
                        "\thost._refresh_world_camera_safe_area(viewport_size)"
                    ),
                    (
                        "func _apply_map_world_safe_area_tail(viewport_size: Vector2) -> void:\n"
                        "\tpass # missing Phase400 safe-area refresh"
                    ),
                    1,
                ),
                map_panel_source,
            ),
            (
                capture_source.replace(
                    '"map_world_lightweight_close_same_call_for_qa"',
                    '"map_world_lightweight_close_same_call_missing_for_qa"',
                    1,
                ),
                panel_flow_source,
                map_panel_source,
            ),
            (
                capture_source.replace(
                    'sample.has("lightweight_layout")',
                    'sample.has("lightweight_layout_missing")',
                    1,
                ),
                panel_flow_source,
                map_panel_source,
            ),
            (
                capture_source,
                panel_flow_source.replace(
                    'timing["layout_fallback_delta"]',
                    'timing["layout_fallback_delta_missing"]',
                    1,
                ),
                map_panel_source,
            ),
        )
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            main_path = root / "main.gd"
            capture_path = root / "capture.gd"
            panel_flow_path = root / "panel_flow.gd"
            map_panel_path = root / "map_panel.gd"
            main_path.write_text(main_source, encoding="utf-8")
            for index, sources in enumerate(timing_tampered_sources):
                with self.subTest(timing_index=index):
                    capture_path.write_text(sources[0], encoding="utf-8")
                    panel_flow_path.write_text(sources[1], encoding="utf-8")
                    map_panel_path.write_text(sources[2], encoding="utf-8")
                    with (
                        mock.patch.object(TOOL, "MAIN_SCRIPT_PATH", main_path),
                        mock.patch.object(
                            TOOL,
                            "CAPTURE_SCRIPT_PATH",
                            capture_path,
                        ),
                        mock.patch.object(
                            TOOL,
                            "PANEL_FLOW_SCRIPT_PATH",
                            panel_flow_path,
                        ),
                        mock.patch.object(
                            TOOL,
                            "MAP_PANEL_SCRIPT_PATH",
                            map_panel_path,
                        ),
                    ):
                        with self.assertRaises(TOOL.Phase399MapPerfError):
                            TOOL._require_diagnostic_wiring()

        tutorial_tampered_sources = (
            (
                panel_flow_source.replace(
                    (
                        "if not (_is_server_account_session() and not "
                        "auth_auto_bypass):"
                    ),
                    "if true:",
                    1,
                ),
                player_progress_source,
            ),
            (
                panel_flow_source.replace(
                    "if match_certainty == "
                    "PlayerProgressModel.QUEST_EVENT_NO_MATCH:",
                    "if match_certainty == "
                    "PlayerProgressModel.QUEST_EVENT_UNCERTAIN:",
                    1,
                ),
                player_progress_source,
            ),
            (
                panel_flow_source.replace(
                    "var messages := "
                    "_record_quest_event_and_maybe_claim(event)",
                    (
                        "if match_certainty == "
                        "PlayerProgressModel.QUEST_EVENT_MATCH:\n"
                        "\t\treturn\n"
                        "\tvar messages := "
                        "_record_quest_event_and_maybe_claim(event)"
                    ),
                    1,
                ),
                player_progress_source,
            ),
            (
                panel_flow_source,
                player_progress_source.replace(
                    'or not profile.has("schemaVersion")',
                    "or false # legacy schema was incorrectly trusted",
                    1,
                ),
            ),
            (
                panel_flow_source,
                player_progress_source.replace(
                    "or QuestModel.is_optional(quest)",
                    "or false # optional quest was incorrectly definitive",
                    1,
                ),
            ),
            (
                panel_flow_source,
                player_progress_source.replace(
                    (
                        "\t# This is a no-mutation fast gate, not a "
                        "replacement for normalization."
                    ),
                    (
                        "\tvar normalized := normalize_profile(profile)\n"
                        "\t# illegal full normalization in the open path"
                    ),
                    1,
                ),
            ),
            (
                panel_flow_source.replace(
                    (
                        ") -> String:\n"
                        "\tif battle_active:\n"
                        '\t\treturn "battle_active"'
                    ),
                    (
                        ") -> String:\n"
                        '\treturn "" # illegal blocker early return\n'
                        "\tif battle_active:\n"
                        '\t\treturn "battle_active"'
                    ),
                    1,
                ),
                player_progress_source,
            ),
            (
                panel_flow_source.replace(
                    (
                        ") -> String:\n"
                        "\t# This guard must run before refresh:"
                    ),
                    (
                        ") -> String:\n"
                        '\treturn "" # illegal preflight early return\n'
                        "\t# This guard must run before refresh:"
                    ),
                    1,
                ),
                player_progress_source,
            ),
        )
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            panel_flow_path = root / "panel_flow.gd"
            player_progress_path = root / "player_progress.gd"
            for index, sources in enumerate(tutorial_tampered_sources):
                with self.subTest(tutorial_index=index):
                    panel_flow_path.write_text(sources[0], encoding="utf-8")
                    player_progress_path.write_text(
                        sources[1], encoding="utf-8"
                    )
                    with (
                        mock.patch.object(
                            TOOL,
                            "PANEL_FLOW_SCRIPT_PATH",
                            panel_flow_path,
                        ),
                        mock.patch.object(
                            TOOL,
                            "PLAYER_PROGRESS_SCRIPT_PATH",
                            player_progress_path,
                        ),
                    ):
                        with self.assertRaises(TOOL.Phase399MapPerfError):
                            TOOL._require_diagnostic_wiring()

        cache_tampered_sources = (
            (
                panel_flow_source,
                map_panel_source.replace(
                    "var valid := (\n\t\tprepared_usable",
                    "var valid := (\n\t\ttrue",
                    1,
                ),
            ),
            (
                panel_flow_source,
                map_panel_source.replace(
                    '"mapRouteContractRevision": route_revision',
                    '"mapRouteContractRevisionMissing": route_revision',
                    1,
                ),
            ),
            (
                panel_flow_source,
                map_panel_source.replace(
                    '"mapNames": map_names_value',
                    '"mapNamesMissing": map_names_value',
                    1,
                ),
            ),
            (
                panel_flow_source,
                map_panel_source.replace(
                    '"localTargets": _view_state.get("localTargets", [])',
                    '"localTargets": []',
                    1,
                ),
            ),
            (
                panel_flow_source,
                map_panel_source.replace(
                    '"currentRegion": _view_state.get("currentRegion", {})',
                    '"currentRegion": {}',
                    1,
                ),
            ),
            (
                panel_flow_source,
                map_panel_source.replace(
                    '"worldRegions": _view_state.get("worldRegions", [])',
                    '"worldRegions": []',
                    1,
                ),
            ),
            (
                panel_flow_source,
                map_panel_source.replace(
                    '"selectedWorldRegionId": _selected_world_region_id',
                    '"selectedWorldRegionId": ""',
                    1,
                ),
            ),
            (
                panel_flow_source,
                map_panel_source.replace(
                    "left.recursive_equal(right, 0)",
                    "left == right",
                    1,
                ),
            ),
            (
                panel_flow_source,
                map_panel_source.replace(
                    (
                        "_sorted_string_keys(_local_destination_buttons)\n"
                        "\t\t!= _prepared_sidebar_destination_button_keys"
                    ),
                    "[] != []",
                    1,
                ),
            ),
            (
                panel_flow_source,
                map_panel_source.replace(
                    "_emit_latest_local_target(captured_target_id)",
                    "route_target_requested.emit(target)",
                    1,
                ),
            ),
            (
                panel_flow_source,
                map_panel_source.replace(
                    "_emit_latest_map_destination(captured_region_id, captured_map_id)",
                    "map_destination_requested.emit(captured_map_id, point.get(\"label\", \"\"))",
                    1,
                ),
            ),
            (
                panel_flow_source,
                map_panel_source.replace(
                    "var point := _world_map_point_state(region_id, map_id)",
                    "var point := _world_map_point_state(\"\", map_id)",
                    1,
                ),
            ),
            (
                panel_flow_source,
                map_panel_source.replace(
                    'if str((region_value as Dictionary).get("id", "")) != region_id:\n'
                    "\t\t\t\tcontinue\n",
                    "# region-scoped destination guard removed\n",
                    1,
                ),
            ),
            (
                panel_flow_source,
                map_panel_source.replace(
                    "map_destination_requested.emit(map_id, label)\n\n\nfunc _emit_latest_local_target",
                    "_emit_latest_map_destination(_selected_world_region_id, map_id)\n\n\nfunc _emit_latest_local_target",
                    1,
                ),
            ),
            (
                panel_flow_source,
                map_panel_source.replace(
                    "\n\t_build_map_markers()\n",
                    "\n\t\t_build_map_markers()\n",
                    1,
                ),
            ),
            (
                panel_flow_source.replace(
                    "if _map_route_planner == null:",
                    "if _map_route_planner_instance() == null:",
                    1,
                ),
                map_panel_source,
            ),
            (
                panel_flow_source,
                map_panel_source.replace(
                    "_using_prepared_visual and not _ensure_local_map_canvas_ready()",
                    "_using_prepared_visual and false",
                    1,
                ),
            ),
            (
                panel_flow_source,
                map_panel_source.replace(
                    (
                        "\telse:\n"
                        "\t\t_prepared_canvas_signature = {}\n"
                        "\t\tlegacy_texture_rect.texture = fallback_texture"
                    ),
                    (
                        "\telse:\n"
                        "\t\t# stale prepared canvas signature retained\n"
                        "\t\tlegacy_texture_rect.texture = fallback_texture"
                    ),
                    1,
                ),
            ),
            (
                panel_flow_source.replace(
                    'state["mapVisualRevision"] = int(host.map_visual_render_revision)',
                    'state["mapVisualRevisionMissing"] = int(host.map_visual_render_revision)',
                    1,
                ),
                map_panel_source,
            ),
            (
                panel_flow_source.replace(
                    'if _map_awakened_catalog_revision_cache != "":',
                    "if false:",
                    1,
                ),
                map_panel_source,
            ),
            (
                panel_flow_source,
                map_panel_source.replace(
                    (
                        "func _build_prepared_cache_context(\n"
                        "\tstate: Dictionary,\n"
                        "\tprepared_visual: Dictionary,\n"
                        "\tworld_bounds: Rect2\n"
                        ") -> Dictionary:\n"
                    ),
                    (
                        "func _build_prepared_cache_context(\n"
                        "\tstate: Dictionary,\n"
                        "\tprepared_visual: Dictionary,\n"
                        "\tworld_bounds: Rect2\n"
                        ") -> Dictionary:\n"
                        "\treturn {\"valid\": true} # illegal early cache hit\n"
                    ),
                    1,
                ),
            ),
            (
                panel_flow_source,
                map_panel_source.replace(
                    "func _local_sidebar_cache_ready() -> bool:\n",
                    (
                        "func _local_sidebar_cache_ready() -> bool:\n"
                        "\treturn true # illegal same-count cache bypass\n"
                    ),
                    1,
                ),
            ),
            (
                panel_flow_source,
                map_panel_source.replace(
                    (
                        "\tif not _node_is_live(_map_canvas):\n"
                        "\t\tif is_instance_valid(_map_canvas):\n"
                        "\t\t\t_map_canvas.free()\n"
                    ),
                    (
                        "\tif not _node_is_live(_map_canvas):\n"
                        "\t\t# queued canvas was incorrectly reused\n"
                    ),
                    1,
                ),
            ),
            (
                panel_flow_source,
                map_panel_source.replace(
                    "and not (value as Node).is_queued_for_deletion()",
                    "and true # queued nodes incorrectly accepted",
                    1,
                ),
            ),
            (
                panel_flow_source,
                map_panel_source.replace(
                    "\twhile node != ancestor:\n",
                    "\twhile false: # queued ancestors skipped\n",
                    1,
                ),
            ),
            (
                panel_flow_source,
                map_panel_source.replace(
                    "_node_has_live_ancestry_to(value, _ui_root)",
                    "_node_is_live(value)",
                    1,
                ),
            ),
            (
                panel_flow_source,
                map_panel_source.replace(
                    "\tfor child in container.get_children():\n",
                    "\tfor child in []: # queued static children skipped\n",
                    1,
                ),
            ),
            (
                panel_flow_source,
                map_panel_source.replace(
                    (
                        "\t\tif not child.is_queued_for_deletion():\n"
                        "\t\t\tchild.queue_free()\n"
                    ),
                    "\t\tchild.queue_free() # queued child double-delete\n",
                    1,
                ),
            ),
            (
                panel_flow_source,
                map_panel_source.replace(
                    "_all_direct_children_live(marker_container)",
                    "_node_is_live(marker_container)",
                    1,
                ),
            ),
            (
                panel_flow_source,
                map_panel_source.replace(
                    "_all_direct_children_live(_world_region_list)",
                    "_node_is_live(_world_region_list)",
                    1,
                ),
            ),
            (
                panel_flow_source,
                map_panel_source.replace(
                    "_all_direct_children_live(_world_detail_points)",
                    "_node_is_live(_world_detail_points)",
                    1,
                ),
            ),
            (
                panel_flow_source,
                map_panel_source.replace(
                    (
                        "func reset_to_local_view() -> void:\n"
                        "\tif not _fixed_ui_roots_ready():\n"
                        "\t\t_rebuild_fixed_ui_roots()\n"
                        "\tshow_mode(MapAwakenedPresenter.MODE_LOCAL)"
                    ),
                    (
                        "func reset_to_local_view() -> void:\n"
                        "\tshow_mode(MapAwakenedPresenter.MODE_LOCAL)"
                    ),
                    1,
                ),
            ),
            (
                panel_flow_source,
                map_panel_source.replace(
                    (
                        "\tif not _node_is_live(_map_viewport):\n"
                        "\t\tif is_instance_valid(_map_viewport):\n"
                        "\t\t\t_map_viewport.free()\n"
                    ),
                    (
                        "\tif not _node_is_live(_map_viewport):\n"
                        "\t\t# queued viewport was incorrectly reused\n"
                    ),
                    1,
                ),
            ),
            (
                panel_flow_source,
                map_panel_source.replace(
                    (
                        "\tif not _fixed_ui_roots_ready():\n"
                        "\t\treturn\n"
                        "\tif _using_prepared_visual and not _node_is_live(_map_canvas):"
                    ),
                    (
                        "\tif _using_prepared_visual and not _node_is_live(_map_canvas):"
                    ),
                    1,
                ),
            ),
            (
                panel_flow_source,
                map_panel_source.replace(
                    "if not _fixed_ui_roots_ready():",
                    "if false: # fixed-root repair bypassed",
                    1,
                ),
            ),
            (
                panel_flow_source,
                map_panel_source.replace(
                    (
                        "return _world_entry_route_button.get_parent() "
                        "== _world_detail_column"
                    ),
                    "return true # detached entry parent accepted",
                    1,
                ),
            ),
            (
                panel_flow_source,
                map_panel_source.replace(
                    "\t_invalidate_prepared_static_cache()\n\t_build_ui()",
                    (
                        "\t_invalidate_prepared_static_cache()\n"
                        "\t# fixed UI rebuild removed"
                    ),
                    1,
                ),
            ),
            (
                panel_flow_source.replace(
                    (
                        "\t\tmap_marker_container = "
                        "awakened_panel.marker_container\n"
                    ),
                    "\t\t# repaired marker alias was not republished\n",
                    1,
                ),
                map_panel_source,
            ),
            (
                panel_flow_source.replace(
                    "if map_panel == null:\n\t\treturn",
                    (
                        "if map_panel == null or map_marker_container == null:\n"
                        "\t\treturn"
                    ),
                    1,
                ),
                map_panel_source,
            ),
            (
                panel_flow_source,
                map_panel_source.replace(
                    'if _selected_world_region_id == "":',
                    "if true: # invalid nonempty selection changed semantics",
                    1,
                ),
            ),
            (
                panel_flow_source,
                map_panel_source.replace(
                    "\tif point.is_empty():\n\t\treturn\n",
                    "\t# stale destination ID was not rejected\n",
                    1,
                ),
            ),
            (
                panel_flow_source,
                map_panel_source.replace(
                    "\treturn {}\n\n\nfunc _region_point_for_map(",
                    (
                        "\treturn {\"mapId\": map_id, \"label\": map_id}\n"
                        "\n\nfunc _region_point_for_map("
                    ),
                    1,
                ),
            ),
        )
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            panel_flow_path = root / "panel_flow.gd"
            map_panel_path = root / "map_panel.gd"
            for index, sources in enumerate(cache_tampered_sources):
                with self.subTest(cache_index=index):
                    self.assertNotEqual(
                        sources,
                        (panel_flow_source, map_panel_source),
                    )
                    panel_flow_path.write_text(sources[0], encoding="utf-8")
                    map_panel_path.write_text(sources[1], encoding="utf-8")
                    with (
                        mock.patch.object(
                            TOOL,
                            "PANEL_FLOW_SCRIPT_PATH",
                            panel_flow_path,
                        ),
                        mock.patch.object(
                            TOOL,
                            "MAP_PANEL_SCRIPT_PATH",
                            map_panel_path,
                        ),
                    ):
                        with self.assertRaises(TOOL.Phase399MapPerfError):
                            TOOL._require_diagnostic_wiring()

    def test_diagnostic_runner_freezes_observed_manifest_and_failure(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            completed = subprocess.CompletedProcess(
                args=["/opt/godot"],
                returncode=0,
                stdout=_diagnostic_log(panel_effective_fps=40.0),
            )
            with mock.patch.object(
                TOOL.subprocess,
                "run",
                return_value=completed,
            ) as run_mock:
                result = TOOL._run_diagnostic(
                    godot="/opt/godot",
                    output_root=root,
                    run_id="diagnostic-observed",
                    timeout_seconds=180.0,
                )
            self.assertEqual(result["status"], "observed")
            self.assertTrue(result["complete"])
            self.assertEqual(result["releaseDecision"], "diagnostic_only")
            run_mock.assert_called_once()
            summary_path = Path(result["summary"])
            summary = json.loads(
                summary_path.read_text(encoding="utf-8")
            )
            self.assertEqual(summary["status"], "observed")
            self.assertTrue(summary["complete"])
            self.assertNotEqual(summary["status"], "passed")
            manifest = Path(result["manifest"])
            manifest_lines = manifest.read_text(
                encoding="utf-8"
            ).splitlines()
            self.assertEqual(len(manifest_lines), 2)
            self.assertTrue(
                manifest_lines[0].endswith("  godot-diagnostic.log")
            )
            self.assertTrue(manifest_lines[1].endswith("  summary.json"))

        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            failed = subprocess.CompletedProcess(
                args=["/opt/godot"],
                returncode=9,
                stdout="diagnostic failed before marker\n",
            )
            with mock.patch.object(
                TOOL.subprocess,
                "run",
                return_value=failed,
            ):
                with self.assertRaises(TOOL.Phase399MapPerfError):
                    TOOL._run_diagnostic(
                        godot="/opt/godot",
                        output_root=root,
                        run_id="diagnostic-failed",
                        timeout_seconds=180.0,
                    )
            failure_path = (
                root / "diagnostic-failed" / "failure-summary.json"
            )
            self.assertTrue(failure_path.is_file())
            failure = json.loads(
                failure_path.read_text(encoding="utf-8")
            )
            self.assertEqual(failure["status"], "failed")
            self.assertFalse(failure["complete"])

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
        self.assertEqual(result["runtimeContract"]["menuFps60Checks"], 48)
        self.assertTrue(result["runtimeContract"]["foregroundStart"])
        self.assertTrue(result["runtimeContract"]["foregroundEnd"])
        self.assertEqual(result["panelHandler"]["pressDispatchSamples"], 60)
        self.assertEqual(result["panelHandler"]["handlerRefreshSamples"], 60)
        self.assertEqual(len(result["gates"]), 17)
        self.assertTrue(all(gate["passed"] for gate in result["gates"]))

    def test_log_rejects_short_slow_hot_or_same_frame_evidence(self) -> None:
        invalid_logs = (
            _perf_log(sample_count=8),
            _perf_log(idle_fps=27.0),
            _perf_log(moving_fps=44.0),
            _perf_log(panel_fps=40.0),
            _perf_log(panel_fps=50.0),
            _perf_log(panel_min_override=44.9),
            _perf_log(idle_process=15.1),
            _perf_log(moving_process=16.8),
            _perf_log(panel_process=16.8),
            _perf_log(moving_process_tail_override=16.8),
            _perf_log(panel_process_tail_override=16.8),
            _perf_log(cross_frame_presses=67),
            _perf_log(foreground_start=False),
            _perf_log(foreground_end=False),
            _perf_log(menu_fps60=False),
            _perf_log(menu_fps60_checks=47),
            _perf_log(press_dispatch_p95_usec=8000, press_dispatch_max_usec=8000),
            _perf_log(press_dispatch_max_usec=8000),
            _perf_log(handler_refresh_p95_usec=8000, handler_refresh_max_usec=8000),
            _perf_log(handler_refresh_max_usec=8000),
            _perf_log().replace(" foreground_start=true", "", 1),
            _perf_log().replace("foreground_start=true ", "", 1),
            _perf_log().replace(" foreground_end=true", "", 1),
            _perf_log().replace(" menu_fps60=true", "", 1),
            _perf_log().replace(" menu_fps60_checks=48", "", 1),
            _perf_log().replace(
                "PHASE399_MAP_PERF_HANDLER",
                "PHASE399_MAP_PERF_HANDLER_MISSING",
                1,
            ),
            _perf_log().replace(
                "handler_refresh_max_usec=3600",
                "handler_refresh_max_usec=3601",
                1,
            ),
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
