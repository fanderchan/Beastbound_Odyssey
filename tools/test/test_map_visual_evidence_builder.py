from __future__ import annotations

import importlib.util
from pathlib import Path
import sys
import unittest


MODULE_PATH = (
    Path(__file__).resolve().parents[1] / "map_visual_evidence_builder.py"
)
SPEC = importlib.util.spec_from_file_location(
    "map_visual_evidence_builder_test_target",
    MODULE_PATH,
)
assert SPEC is not None and SPEC.loader is not None
builder = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = builder
SPEC.loader.exec_module(builder)


def _record(mode: str = "idle") -> dict:
    moving = ""
    if mode == "moving":
        moving = (
            "\nmovement spam click check ready: status=ok clicks=12 "
            "accepted=12 resolved=3 applied=3 screen_roundtrip=true "
            "avg_input_us=2 max_input_us=9 moved=true coalesced=true "
            "settled=true final_match=true battle=false encounter=false"
        )
    return {
        "mapId": "firebud_training_yard",
        "variant": "candidate",
        "mode": mode,
        "returncode": 0,
        "stdout": (
            "perf probe: fps=60.0 frames=60 "
            "draw_world=0.30ms process_total=0.20ms\n"
            "perf probe: fps=59.0 frames=59 process_total=0.40ms\n"
            "perf probe: fps=61.0 frames=61 "
            "draw_world=0.60ms process_total=0.30ms"
            f"{moving}\n"
        ),
        "stderr": "",
    }


class PerformanceParserTests(unittest.TestCase):
    def test_idle_is_derived_from_raw_samples(self) -> None:
        parsed = builder.parse_perf_run(_record())
        self.assertEqual(parsed["samples"], 3)
        self.assertEqual(parsed["fpsMinMeanMax"], [59.0, 60.0, 61.0])
        self.assertEqual(
            parsed["processTotalMsMinMeanMax"],
            [0.2, 0.3, 0.4],
        )
        self.assertEqual(
            parsed["drawWorldMsMinMeanMax"],
            [0.0, 0.3, 0.6],
        )

    def test_moving_requires_real_summary_invariants(self) -> None:
        parsed = builder.parse_perf_run(_record("moving"))
        self.assertTrue(parsed["moved"])
        self.assertTrue(parsed["coalesced"])
        self.assertEqual(parsed["clicks"], parsed["accepted"])
        self.assertEqual(parsed["resolved"], parsed["applied"])

    def test_moving_failure_is_rejected(self) -> None:
        record = _record("moving")
        record["stdout"] = record["stdout"].replace(
            "screen_roundtrip=true",
            "screen_roundtrip=false",
        )
        with self.assertRaises(builder.EvidenceError):
            builder.parse_perf_run(record)

    def test_nonzero_runner_exit_is_rejected(self) -> None:
        record = _record()
        record["returncode"] = 1
        with self.assertRaises(builder.EvidenceError):
            builder.parse_perf_run(record)


class ProjectSettingsIdentityTests(unittest.TestCase):
    def test_editor_reformat_and_setting_reorder_are_identity_neutral(self) -> None:
        compact = """\
config_version=5

[application]
run/main_scene="res://scenes/Main.tscn"
run/max_fps=60
config/features=PackedStringArray("4.7", "Mobile")

[input]
move_up={
"deadzone": 0.2,
"events": [Object(InputEventKey,"keycode":87), Object(InputEventKey,"keycode":4194320)]
}

[rendering]
renderer/rendering_method="mobile"
textures/canvas_textures/default_texture_filter=0
"""
        editor_rewritten = """\
; Engine configuration file.

config_version = 5

[rendering]
textures/canvas_textures/default_texture_filter = 0
renderer/rendering_method = "mobile"

[input]
move_up = {
  "deadzone": 0.2,
  "events": [Object(InputEventKey, "keycode":87)
  , Object(InputEventKey, "keycode":4194320)
  ]
}

[application]
config/features = PackedStringArray("4.7", "Mobile")
run/max_fps = 60
run/main_scene = "res://scenes/Main.tscn"
"""
        self.assertEqual(
            builder._canonical_project_settings_bytes(compact),
            builder._canonical_project_settings_bytes(editor_rewritten),
        )

    def test_semantic_setting_change_changes_identity_subject(self) -> None:
        mobile = """\
config_version=5
[rendering]
renderer/rendering_method="mobile"
"""
        gl_compatibility = mobile.replace('"mobile"', '"gl_compatibility"')
        self.assertNotEqual(
            builder._canonical_project_settings_bytes(mobile),
            builder._canonical_project_settings_bytes(gl_compatibility),
        )

    def test_unclosed_setting_fails_closed(self) -> None:
        with self.assertRaises(builder.EvidenceError):
            builder._canonical_project_settings_bytes(
                'config_version=5\n[input]\nmove_up={"events": [1, 2]\n'
            )


if __name__ == "__main__":
    unittest.main()
