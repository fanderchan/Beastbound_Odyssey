from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import subprocess
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
        )
        separator = command.index("--")
        engine = command[:separator]
        user = command[separator + 1 :]
        self.assertNotIn("--user-data-dir", engine)
        self.assertIn("res://scenes/Main.tscn", engine)
        self.assertIn("1280x720", engine)
        self.assertIn("--windowed", engine)
        self.assertIn("--single-window", engine)
        self.assertIn("--map-art-review-preview=firebud_training_yard", user)
        self.assertIn("--beastbound-qa-user-data-lane=automation", user)
        self.assertIn("--movement-spam-click-check", user)
        self.assertIn("--movement-spam-click-limit=60", user)
        self.assertIn("--perf-probe", user)
        self.assertFalse(any("login" in value or "server-url" in value for value in command))

    def test_baseline_omits_review_candidate_flag(self) -> None:
        command = RUNNER._command(
            "firebud_village_gate",
            "baseline",
            "idle",
        )
        self.assertFalse(any(value.startswith("--map-art-review-preview") for value in command))
        self.assertNotIn("--movement-spam-click-check", command)
        self.assertFalse(any(value.startswith("--movement-spam-click-limit=") for value in command))

    def test_earth_candidate_uses_review_catalog_without_login(self) -> None:
        command = RUNNER._command(
            "earth_vein_cave_f4",
            "candidate",
            "idle",
        )
        self.assertIn("--map-art-review-preview=earth_vein_cave_f4", command)
        self.assertFalse(any("login" in value or "server-url" in value for value in command))

    def test_run_requires_attested_lane_and_proves_cleanup(self) -> None:
        calls: list[str] = []
        private_home = "/".join(("", "Users", "example"))
        private_lane_root = str(
            Path(private_home)
            / "Library/Application Support/BeastboundOdysseyQA_Automation"
        )

        class LaneApi:
            @staticmethod
            def prepare_lane(lane, existing_features, owner):
                calls.append("prepare")
                return {
                    "status": "prepared",
                    "lane": lane,
                    "owner": owner,
                    "feature": RUNNER.QA_FEATURE,
                    "customUserDirName": RUNNER.QA_CUSTOM_USER_DIR_NAME,
                    "godotLaneRoot": private_lane_root,
                    "editorCustomFeatures": f"{existing_features},{RUNNER.QA_FEATURE}",
                    "realInventorySha256": "a" * 64,
                }

            @staticmethod
            def verify_lane(lane, owner, real_sha):
                calls.append("verify")
                return {
                    "status": "verified",
                    "lane": lane,
                    "owner": owner,
                    "realUnchanged": True,
                    "realInventorySha256": real_sha,
                }

            @staticmethod
            def cleanup_lane(lane, owner, real_sha):
                calls.append("cleanup")
                return {
                    "status": "cleaned",
                    "lane": lane,
                    "owner": owner,
                    "laneAbsent": True,
                    "realUnchanged": True,
                    "realInventorySha256": real_sha,
                }

            @staticmethod
            def inspect_lane(lane, owner):
                calls.append("inspect")
                return {
                    "status": "inspected",
                    "lane": lane,
                    "owner": owner,
                    "laneRootState": "absent",
                    "pendingLockState": "absent",
                    "publishedLockState": "absent",
                    "realInventorySha256": "a" * 64,
                    "inspectionSha256": "b" * 64,
                }

        def runner(command, **kwargs):
            self.assertEqual(
                kwargs["env"]["BEASTBOUND_QA_USER_DATA_LANE"],
                RUNNER.QA_LANE,
            )
            attestation = {
                "customUserDirName": RUNNER.QA_CUSTOM_USER_DIR_NAME,
                "feature": RUNNER.QA_FEATURE,
                "lane": RUNNER.QA_LANE,
                "status": "passed",
                "userDataRoot": private_lane_root,
            }
            stdout = (
                RUNNER.QA_ATTESTATION_PREFIX
                + json.dumps(attestation, separators=(",", ":"))
                + "\n"
                + "perf probe: fps=60.0 frames=60 draw_world=0.1ms process_total=0.2ms\n"
                + "perf probe: fps=60.0 frames=60 draw_world=0.1ms process_total=0.2ms\n"
                + "perf probe: fps=60.0 frames=60 draw_world=0.1ms process_total=0.2ms\n"
            )
            return subprocess.CompletedProcess(command, 0, stdout, "")

        record = RUNNER._run(
            RUNNER._command("earth_vein_cave", "baseline", "idle"),
            "earth_vein_cave",
            "baseline",
            "idle",
            runner=runner,
            lane_api=LaneApi,
            base_environment={"GODOT_EDITOR_CUSTOM_FEATURES": "base"},
        )
        self.assertEqual(calls, ["prepare", "verify", "cleanup", "inspect"])
        self.assertTrue(record["qaLane"]["laneAbsentAfterCleanup"])
        self.assertTrue(record["qaLane"]["realUnchanged"])
        serialized = json.dumps(record, ensure_ascii=False)
        self.assertNotIn(private_lane_root, serialized)
        self.assertNotIn(private_home, serialized)
        self.assertIn(RUNNER.QA_USER_DATA_ROOT_REDACTION, serialized)
        self.assertEqual(
            record["qaLane"]["attestation"]["userDataRoot"],
            RUNNER.QA_USER_DATA_ROOT_REDACTION,
        )

    def test_run_cleans_prepared_lane_when_environment_identity_is_invalid(self) -> None:
        calls: list[str] = []

        class LaneApi:
            @staticmethod
            def prepare_lane(lane, existing_features, owner):
                calls.append("prepare")
                return {
                    "status": "prepared",
                    "lane": lane,
                    "owner": owner,
                    "feature": RUNNER.QA_FEATURE,
                    "customUserDirName": RUNNER.QA_CUSTOM_USER_DIR_NAME,
                    "godotLaneRoot": "/tmp/BeastboundOdysseyQA_Automation",
                    "editorCustomFeatures": existing_features,
                    "realInventorySha256": "a" * 64,
                }

            @staticmethod
            def verify_lane(_lane, _owner, _real_sha):
                calls.append("verify")
                raise AssertionError("invalid environment must not run verification")

            @staticmethod
            def cleanup_lane(lane, owner, real_sha):
                calls.append("cleanup")
                return {
                    "status": "cleaned",
                    "lane": lane,
                    "owner": owner,
                    "laneAbsent": True,
                    "realUnchanged": True,
                    "realInventorySha256": real_sha,
                }

            @staticmethod
            def inspect_lane(lane, owner):
                calls.append("inspect")
                return {
                    "status": "inspected",
                    "lane": lane,
                    "owner": owner,
                    "laneRootState": "absent",
                    "pendingLockState": "absent",
                    "publishedLockState": "absent",
                    "realInventorySha256": "a" * 64,
                    "inspectionSha256": "b" * 64,
                }

        def runner(_command, **_kwargs):
            calls.append("runner")
            raise AssertionError("invalid environment must not launch Godot")

        with self.assertRaisesRegex(
            RUNNER.builder.EvidenceError,
            "QA lane prepare identity is invalid",
        ):
            RUNNER._run(
                RUNNER._command("firebud_village_gate", "baseline", "idle"),
                "firebud_village_gate",
                "baseline",
                "idle",
                runner=runner,
                lane_api=LaneApi,
                base_environment={"GODOT_EDITOR_CUSTOM_FEATURES": "base"},
            )
        self.assertEqual(calls, ["prepare", "cleanup", "inspect"])

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
