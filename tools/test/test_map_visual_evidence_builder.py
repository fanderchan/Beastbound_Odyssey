from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest import mock


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

    def test_moving_accepts_two_samples_after_real_target_settle(self) -> None:
        record = _record("moving")
        record["stdout"] = "\n".join(record["stdout"].splitlines()[1:]) + "\n"
        parsed = builder.parse_perf_run(record)
        self.assertEqual(parsed["samples"], 2)

    def test_moving_failure_is_rejected(self) -> None:
        record = _record("moving")
        record["stdout"] = record["stdout"].replace(
            "screen_roundtrip=true",
            "screen_roundtrip=false",
        )
        with self.assertRaises(builder.EvidenceError):
            builder.parse_perf_run(record)


class CollisionReceiptTests(unittest.TestCase):
    def test_runner_redirects_engine_log_without_changing_evidence_command(self) -> None:
        args = list(builder.COLLISION_COMMAND_ARGS)
        self.assertEqual(args.count("--log-file"), 1)
        log_flag_index = args.index("--log-file")
        self.assertEqual(
            args[log_flag_index + 1],
            "../../.run/map-visual-runtime-check.log",
        )
        self.assertNotIn("--log-file", builder.COLLISION_COMMAND)

    def _stdout(self) -> str:
        payload = {
            "mode": "strict_frozen_validation",
            "result": "PASS",
            "errors": [],
            "bundleReports": {
                "firebud_region_visual_v2": {
                    "result": "PASS",
                    "testedMapIds": [
                        "firebud_training_yard",
                        "firebud_village_gate",
                    ],
                }
            },
        }
        return (
            "Godot fixture\nmap visual runtime check: "
            + json.dumps(payload)
            + "\n"
        )

    def _preview_stdout(self, report: dict) -> str:
        runtime_report = dict(report)
        runtime_report["checks"] = {
            "frozenReportValidationSkippedForGeneration": False,
        }
        payload = {
            "mode": "catalog_contract_preview",
            "result": "PASS",
            "errors": [],
            "checks": {
                "frozenReportValidationSkippedForGeneration": False,
            },
            "bundleReports": {
                "firebud_region_visual_v2": runtime_report,
            },
        }
        return (
            "Godot fixture\nmap visual runtime check: "
            + json.dumps(payload)
            + "\n"
        )

    def test_capture_installs_only_strict_pass_receipt(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            godot_root = root / "client/godot"
            evidence = (
                godot_root
                / "assets/maps/firebud_region_visual_v2/evidence"
            )
            evidence.mkdir(parents=True)

            def runner(*_args, **_kwargs):
                return subprocess.CompletedProcess(
                    args=list(builder.COLLISION_COMMAND_ARGS),
                    returncode=0,
                    stdout=self._stdout(),
                    stderr="",
                )

            with (
                mock.patch.object(builder, "REPO_ROOT", root),
                mock.patch.object(builder, "GODOT_ROOT", godot_root),
            ):
                output = builder.capture_collision_receipt(
                    "firebud_region_visual_v2",
                    runner=runner,
                )
            self.assertEqual(output.read_text(encoding="utf-8"), self._stdout())

    def test_pending_preview_requires_exact_frozen_catalog_snapshot(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            godot_root = root / "client/godot"
            bundle_root = (
                godot_root / "assets/maps/firebud_region_visual_v2"
            )
            evidence = bundle_root / "evidence"
            evidence.mkdir(parents=True)
            manifest = {
                "status": "owner_review_pending",
                "ownerReviewStatus": "pending",
                "releaseApproved": False,
                "runtimeEnabled": False,
            }
            (bundle_root / "map-visual-bundle.json").write_text(
                json.dumps(manifest),
                encoding="utf-8",
            )
            report = {
                "bundleId": "firebud_region_visual_v2",
                "result": "PASS",
                "errors": [],
                "testedMapIds": [
                    "firebud_training_yard",
                    "firebud_village_gate",
                ],
                "catalogSha256": "a" * 64,
                "bindingHashes": {
                    "firebud_training_yard": "b" * 64,
                    "firebud_village_gate": "c" * 64,
                },
                "mapDataHashes": {
                    "firebud_training_yard": "d" * 64,
                    "firebud_village_gate": "e" * 64,
                },
                "maps": [
                    {
                        "mapId": "firebud_training_yard",
                        "groundDraws": 1,
                        "objects": 2,
                        "protectedCells": 3,
                    },
                    {
                        "mapId": "firebud_village_gate",
                        "groundDraws": 4,
                        "objects": 5,
                        "protectedCells": 6,
                    },
                ],
                "checks": {
                    "frozenReportValidationSkippedForGeneration": True,
                },
            }
            (evidence / "catalog-contract-check.json").write_text(
                json.dumps(report),
                encoding="utf-8",
            )
            stdout = self._preview_stdout(report)

            def runner(args, **_kwargs):
                self.assertEqual(
                    args,
                    list(builder.COLLISION_PREVIEW_COMMAND_ARGS),
                )
                return subprocess.CompletedProcess(
                    args=args,
                    returncode=0,
                    stdout=stdout,
                    stderr="",
                )

            with (
                mock.patch.object(builder, "REPO_ROOT", root),
                mock.patch.object(builder, "GODOT_ROOT", godot_root),
            ):
                output = builder.capture_collision_receipt(
                    "firebud_region_visual_v2",
                    allow_pending_catalog_preview=True,
                    runner=runner,
                )
            self.assertEqual(output.read_text(encoding="utf-8"), stdout)

    def test_pending_preview_rejects_skipped_frozen_validation(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            godot_root = root / "client/godot"
            bundle_root = (
                godot_root / "assets/maps/firebud_region_visual_v2"
            )
            evidence = bundle_root / "evidence"
            evidence.mkdir(parents=True)
            (bundle_root / "map-visual-bundle.json").write_text(
                json.dumps(
                    {
                        "status": "owner_review_pending",
                        "ownerReviewStatus": "pending",
                        "releaseApproved": False,
                        "runtimeEnabled": False,
                    }
                ),
                encoding="utf-8",
            )
            frozen_report = {
                "bundleId": "firebud_region_visual_v2",
                "result": "PASS",
                "errors": [],
                "testedMapIds": [
                    "firebud_training_yard",
                    "firebud_village_gate",
                ],
                "catalogSha256": "a" * 64,
                "bindingHashes": {},
                "mapDataHashes": {},
                "maps": [],
            }
            (evidence / "catalog-contract-check.json").write_text(
                json.dumps(frozen_report),
                encoding="utf-8",
            )
            payload = {
                "mode": "catalog_contract_preview",
                "result": "PASS",
                "errors": [],
                "checks": {
                    "frozenReportValidationSkippedForGeneration": True,
                },
                "bundleReports": {
                    "firebud_region_visual_v2": {
                        **frozen_report,
                        "checks": {
                            "frozenReportValidationSkippedForGeneration": True,
                        },
                    }
                },
            }
            stdout = (
                "map visual runtime check: "
                + json.dumps(payload)
                + "\n"
            )

            def runner(args, **_kwargs):
                return subprocess.CompletedProcess(
                    args=args,
                    returncode=0,
                    stdout=stdout,
                    stderr="",
                )

            with (
                mock.patch.object(builder, "REPO_ROOT", root),
                mock.patch.object(builder, "GODOT_ROOT", godot_root),
                self.assertRaises(builder.EvidenceError),
            ):
                builder.capture_collision_receipt(
                    "firebud_region_visual_v2",
                    allow_pending_catalog_preview=True,
                    runner=runner,
                )

    def test_pending_preview_rejects_released_manifest_before_runner(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            godot_root = root / "client/godot"
            bundle_root = (
                godot_root / "assets/maps/firebud_region_visual_v2"
            )
            bundle_root.mkdir(parents=True)
            (bundle_root / "map-visual-bundle.json").write_text(
                json.dumps(
                    {
                        "status": "released",
                        "ownerReviewStatus": "approved",
                        "releaseApproved": True,
                        "runtimeEnabled": True,
                    }
                ),
                encoding="utf-8",
            )
            runner = mock.Mock()
            with (
                mock.patch.object(builder, "REPO_ROOT", root),
                mock.patch.object(builder, "GODOT_ROOT", godot_root),
                self.assertRaises(builder.EvidenceError),
            ):
                builder.capture_collision_receipt(
                    "firebud_region_visual_v2",
                    allow_pending_catalog_preview=True,
                    runner=runner,
                )
            runner.assert_not_called()

    def test_capture_rejects_failed_runner_without_overwriting(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            godot_root = root / "client/godot"
            output = (
                godot_root
                / "assets/maps/firebud_region_visual_v2/evidence/"
                "collision-runner-receipt.log"
            )
            output.parent.mkdir(parents=True)
            output.write_text("old receipt\n", encoding="utf-8")

            def runner(*_args, **_kwargs):
                return subprocess.CompletedProcess(
                    args=list(builder.COLLISION_COMMAND_ARGS),
                    returncode=1,
                    stdout=self._stdout(),
                    stderr="failure",
                )

            with (
                mock.patch.object(builder, "REPO_ROOT", root),
                mock.patch.object(builder, "GODOT_ROOT", godot_root),
                self.assertRaises(builder.EvidenceError),
            ):
                builder.capture_collision_receipt(
                    "firebud_region_visual_v2",
                    runner=runner,
                )
            self.assertEqual(output.read_text(encoding="utf-8"), "old receipt\n")

    def test_nonzero_runner_exit_is_rejected(self) -> None:
        record = _record()
        record["returncode"] = 1
        with self.assertRaises(builder.EvidenceError):
            builder.parse_perf_run(record)


class ProjectSettingsIdentityTests(unittest.TestCase):
    def test_runtime_identity_covers_map_facing_world_hud_dependencies(self) -> None:
        self.assertTrue(
            {
                "scripts/ui/world_hud_awakened_presenter.gd",
                "scripts/ui/world_hud_awakened_view.gd",
                "scripts/ui/world_hud_minimap_render_canvas.gd",
            }.issubset(set(builder.RUNTIME_IDENTITY_FILES))
        )

    def test_runtime_identity_covers_review_only_earth_candidate(self) -> None:
        self.assertEqual(
            builder.MAP_BUNDLES["earth_vein_cave_visual_v1"][1],
            (
                "earth_vein_cave",
                "earth_vein_cave_f2",
                "earth_vein_cave_f3",
                "earth_vein_cave_f4",
            ),
        )
        self.assertTrue(
            {
                "scripts/world/world_presentation_profile.gd",
                "data/map_visual_review_catalog.json",
                "data/earth_vein_cave_map.json",
                "data/earth_vein_cave_f2_map.json",
                "data/earth_vein_cave_f3_map.json",
                "data/earth_vein_cave_f4_map.json",
            }.issubset(set(builder.RUNTIME_IDENTITY_FILES))
        )

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
