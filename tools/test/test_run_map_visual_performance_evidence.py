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
        self.assertEqual(
            command,
            [
                "godot",
                "--path",
                "client/godot",
                "--scene",
                "res://scenes/Main.tscn",
                "--windowed",
                "--resolution",
                "1280x720",
                "--single-window",
                "--fixed-fps",
                "60",
                "--time-scale",
                "1.0",
                "--disable-vsync",
                "--",
                "--beastbound-qa-user-data-lane=automation",
                "--map-perf-probe-map=firebud_training_yard",
                "--map-art-review-preview=firebud_training_yard",
                "--movement-spam-click-check",
                "--movement-spam-click-limit=60",
                "--movement-spam-shared-target-contract=spawn_adjacent_pair_v1",
                "--perf-probe",
                "--perf-probe-warmup-frames=180",
                "--perf-probe-sample-frames=60",
                "--perf-probe-clean-exit-frames=480",
            ],
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
        self.assertIn(
            "--movement-spam-shared-target-contract=spawn_adjacent_pair_v1",
            user,
        )
        self.assertIn("--perf-probe", user)
        self.assertIn("--perf-probe-warmup-frames=180", user)
        self.assertIn("--perf-probe-sample-frames=60", user)
        self.assertIn("--perf-probe-clean-exit-frames=480", user)
        self.assertNotIn("--quit-after", engine)
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
        self.assertFalse(
            any(
                value.startswith("--movement-spam-shared-target-contract=")
                for value in command
            )
        )

    def test_earth_candidate_uses_review_catalog_without_login(self) -> None:
        command = RUNNER._command(
            "earth_vein_cave_f4",
            "candidate",
            "idle",
        )
        self.assertIn("--map-art-review-preview=earth_vein_cave_f4", command)
        self.assertFalse(any("login" in value or "server-url" in value for value in command))

    def test_matrix_pairs_variants_for_three_independent_repetitions(self) -> None:
        cases = RUNNER._performance_matrix(
            ["earth_vein_cave", "earth_vein_cave_f2"],
            3,
        )
        self.assertEqual(len(cases), 24)
        self.assertEqual(
            cases[:4],
            [
                ("earth_vein_cave", "baseline", "idle", 1),
                ("earth_vein_cave", "candidate", "idle", 1),
                ("earth_vein_cave", "baseline", "moving", 1),
                ("earth_vein_cave", "candidate", "moving", 1),
            ],
        )
        self.assertEqual(
            cases[8:12],
            [
                ("earth_vein_cave_f2", "candidate", "idle", 2),
                ("earth_vein_cave_f2", "baseline", "idle", 2),
                ("earth_vein_cave_f2", "candidate", "moving", 2),
                ("earth_vein_cave_f2", "baseline", "moving", 2),
            ],
        )
        for map_id in ("earth_vein_cave", "earth_vein_cave_f2"):
            map_cases = [case for case in cases if case[0] == map_id]
            self.assertEqual(len(map_cases), 12)
            self.assertEqual({case[3] for case in map_cases}, {1, 2, 3})

    def test_repetition_count_requires_odd_three_or_more(self) -> None:
        self.assertEqual(RUNNER._repetition_count("3"), 3)
        self.assertEqual(RUNNER._repetition_count("5"), 5)
        for value in ("1", "2", "4", "invalid"):
            with self.subTest(value=value):
                with self.assertRaises(RUNNER.argparse.ArgumentTypeError):
                    RUNNER._repetition_count(value)

    def test_probe_godot_version_requires_exact_frozen_runner(self) -> None:
        calls: list[tuple[list[str], dict[str, object]]] = []

        def matching_runner(command, **kwargs):
            calls.append((command, kwargs))
            return subprocess.CompletedProcess(
                command,
                0,
                RUNNER.builder.RUNNER_VERSION + "\n",
                "",
            )

        self.assertEqual(
            RUNNER._probe_godot_version("/Applications/Godot", runner=matching_runner),
            RUNNER.builder.RUNNER_VERSION,
        )
        self.assertEqual(calls[0][0], ["/Applications/Godot", "--version"])
        self.assertEqual(calls[0][1]["cwd"], RUNNER.REPO_ROOT)
        self.assertEqual(calls[0][1]["timeout"], 15)
        self.assertFalse(calls[0][1]["check"])

        for returncode, stdout in (
            (0, "4.7.stable.official.different\n"),
            (1, RUNNER.builder.RUNNER_VERSION + "\n"),
            (0, ""),
        ):
            with self.subTest(returncode=returncode, stdout=stdout):
                def rejected_runner(command, **_kwargs):
                    return subprocess.CompletedProcess(
                        command,
                        returncode,
                        stdout,
                        "probe failed",
                    )

                with self.assertRaisesRegex(
                    RUNNER.builder.EvidenceError,
                    "Godot runner version does not match",
                ):
                    RUNNER._probe_godot_version(
                        "/Applications/Godot",
                        runner=rejected_runner,
                    )

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
                + 'perf probe warmup complete: {"frames":180,"status":"passed"}\n'
                + RUNNER.builder.PERF_RUNTIME_PREFIX
                + json.dumps(
                    {
                        "candidateEnabled": False,
                        "displayServer": "macOS",
                        "engineVersion": RUNNER.builder.RUNTIME_ENGINE_VERSION,
                        "engineVersionHash": RUNNER.builder.RUNNER_VERSION.rsplit(".", 1)[1],
                        "mapId": "earth_vein_cave",
                        "mapVisualActive": False,
                        "mapVisualCatalogSource": "",
                        "mapVisualMapId": "",
                        "mapVisualReviewCandidate": False,
                        "mapVisualQaPreview": False,
                        "mapVisualBundleId": "",
                        "mapVisualStatus": "",
                        "processScopeMonitor": "process_priority_boundary_v1",
                        "processScopePriorities": [-1000000, 1000000],
                        "processScopeReady": True,
                        "renderingMethod": "gl_compatibility",
                        "renderingDriver": "opengl3",
                        "videoAdapterName": "Apple Test GPU",
                        "viewportSize": [1280, 720],
                        "sampleFrames": 60,
                        "status": "passed",
                        "vsyncMode": 0,
                    },
                    separators=(",", ":"),
                )
                + "\n"
                + "perf probe: fps=60.0 frames=60 draw_world=0.1ms process_scope_total=0.3ms process_total=0.2ms\n" * 8
                + 'perf probe measurement complete: {"completeSamples":8,'
                + '"discardedPartialFrames":0,'
                + '"expectedFrames":480,"frames":480,'
                + '"mode":"post_warmup_fixed_frames",'
                + '"processScope":"process_priority_boundary_v1",'
                + '"processScopeFrames":480,'
                + '"status":"passed"}\n'
                + 'perf probe clean exit: {"audioManagerReleased":true,"audioPlaybackDisabled":true,"audioStopped":true,"audioStreamsDetached":true,"detachedAudioPlayerCount":16,"drainFrames":16,"drainSeconds":1.5,"requestedExitCode":0,"status":"passed"}\n'
            )
            return subprocess.CompletedProcess(command, 0, stdout, "")

        record = RUNNER._run(
            RUNNER._command("earth_vein_cave", "baseline", "idle"),
            "earth_vein_cave_visual_v1",
            "earth_vein_cave",
            "baseline",
            "idle",
            repetition=2,
            build_identity="test-build",
            runner_version=RUNNER.builder.RUNNER_VERSION,
            runner=runner,
            lane_api=LaneApi,
            base_environment={"GODOT_EDITOR_CUSTOM_FEATURES": "base"},
        )
        self.assertEqual(calls, ["prepare", "verify", "cleanup", "inspect"])
        self.assertTrue(record["qaLane"]["laneAbsentAfterCleanup"])
        self.assertTrue(record["qaLane"]["realUnchanged"])
        self.assertEqual(record["repetition"], 2)
        self.assertEqual(record["bundleId"], "earth_vein_cave_visual_v1")
        self.assertEqual(record["buildIdentity"], "test-build")
        self.assertEqual(record["runnerVersion"], RUNNER.builder.RUNNER_VERSION)
        self.assertEqual(record["samplingContract"]["sampleFrames"], 60)
        self.assertEqual(
            record["argv"],
            RUNNER._command("earth_vein_cave", "baseline", "idle"),
        )
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
                "earth_vein_cave_visual_v1",
                "firebud_village_gate",
                "baseline",
                "idle",
                build_identity="test-build",
                runner_version=RUNNER.builder.RUNNER_VERSION,
                runner=runner,
                lane_api=LaneApi,
                base_environment={"GODOT_EDITOR_CUSTOM_FEATURES": "base"},
            )
        self.assertEqual(calls, ["prepare", "cleanup", "inspect"])

    def test_run_timeout_still_cleans_and_inspects_isolated_lane(self) -> None:
        calls: list[object] = []
        expected_real_sha = "a" * 64

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
                    "editorCustomFeatures": f"{existing_features},{RUNNER.QA_FEATURE}",
                    "realInventorySha256": expected_real_sha,
                }

            @staticmethod
            def verify_lane(_lane, _owner, _real_sha):
                calls.append("verify")
                raise AssertionError("a timed-out process must not be verified")

            @staticmethod
            def cleanup_lane(lane, owner, real_sha):
                calls.append(("cleanup", real_sha))
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
                    "realInventorySha256": expected_real_sha,
                    "inspectionSha256": "b" * 64,
                }

        def timed_out_runner(command, **kwargs):
            calls.append(("runner", kwargs["timeout"]))
            raise subprocess.TimeoutExpired(
                command,
                kwargs["timeout"],
                output="partial stdout",
                stderr="partial stderr",
            )

        with self.assertRaises(subprocess.TimeoutExpired):
            RUNNER._run(
                RUNNER._command("earth_vein_cave", "baseline", "idle"),
                "earth_vein_cave_visual_v1",
                "earth_vein_cave",
                "baseline",
                "idle",
                build_identity="test-build",
                runner_version=RUNNER.builder.RUNNER_VERSION,
                runner=timed_out_runner,
                lane_api=LaneApi,
                base_environment={"GODOT_EDITOR_CUSTOM_FEATURES": "base"},
            )
        self.assertEqual(
            calls,
            [
                "prepare",
                ("runner", RUNNER.RUN_TIMEOUT_SECONDS),
                ("cleanup", expected_real_sha),
                "inspect",
            ],
        )

    def test_run_timeout_fails_closed_when_real_user_identity_changes(self) -> None:
        calls: list[str] = []
        expected_real_sha = "a" * 64

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
                    "editorCustomFeatures": f"{existing_features},{RUNNER.QA_FEATURE}",
                    "realInventorySha256": expected_real_sha,
                }

            @staticmethod
            def verify_lane(_lane, _owner, _real_sha):
                calls.append("verify")
                raise AssertionError("a timed-out process must not be verified")

            @staticmethod
            def cleanup_lane(lane, owner, _real_sha):
                calls.append("cleanup")
                return {
                    "status": "cleaned",
                    "lane": lane,
                    "owner": owner,
                    "laneAbsent": True,
                    "realUnchanged": False,
                    "realInventorySha256": "c" * 64,
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
                    "realInventorySha256": "c" * 64,
                    "inspectionSha256": "b" * 64,
                }

        def timed_out_runner(command, **kwargs):
            calls.append("runner")
            raise subprocess.TimeoutExpired(command, kwargs["timeout"])

        with self.assertRaisesRegex(
            RUNNER.builder.EvidenceError,
            "performance run failed .* QA lane cleanup failed",
        ):
            RUNNER._run(
                RUNNER._command("earth_vein_cave", "baseline", "idle"),
                "earth_vein_cave_visual_v1",
                "earth_vein_cave",
                "baseline",
                "idle",
                build_identity="test-build",
                runner_version=RUNNER.builder.RUNNER_VERSION,
                runner=timed_out_runner,
                lane_api=LaneApi,
                base_environment={"GODOT_EDITOR_CUSTOM_FEATURES": "base"},
            )
        self.assertEqual(calls, ["prepare", "runner", "cleanup", "inspect"])

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
