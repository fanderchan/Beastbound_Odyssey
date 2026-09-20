from __future__ import annotations

import copy
import importlib.util
import json
import re
import tempfile
import unittest
from unittest import mock
from pathlib import Path


TOOL_PATH = Path(__file__).resolve().parents[1] / "record_map_visual_action_captures.py"
SPEC = importlib.util.spec_from_file_location(
    "record_map_visual_action_captures",
    TOOL_PATH,
)
assert SPEC is not None and SPEC.loader is not None
TOOL = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(TOOL)

BUILD_IDENTITY_RE = re.compile(
    r"^git:[0-9a-f]{40}\+beastbound-map-runtime-surface-v2:[0-9a-f]{64}$"
)


class RecordMapVisualActionCapturesTest(unittest.TestCase):
    @staticmethod
    def _window_checkpoint(label: str, root_window_id: int = 0) -> dict:
        return {
            "label": label,
            "processFrame": 10,
            "windowCount": 1,
            "windowIds": [root_window_id],
            "rootWindowId": root_window_id,
        }

    def _earth_targets(
        self,
        root: Path,
        *,
        state: str = "record",
    ) -> list[tuple[str, str, str, Path, Path, str]]:
        TOOL.RECORDER._activate_bundle("earth_vein_cave_visual_v1")
        targets = []
        for map_id in TOOL.RECORDER.REVIEW_MAPS:
            for action_kind in TOOL.ACTION_KINDS:
                output = root / "scratch-actions" / map_id
                targets.append((
                    map_id,
                    action_kind,
                    TOOL.ACTION_MODES[action_kind],
                    output / f"{action_kind}.png",
                    output / f"{action_kind}-capture.json",
                    state,
                ))
        return targets

    @staticmethod
    def _fake_transaction_guard(
        path,
        *,
        allowed_root,
        label,
        expected="any",
        anchor=None,
    ):
        candidate = TOOL._absolute_lexical(path)
        root = TOOL._absolute_lexical(allowed_root)
        candidate.relative_to(root)
        if expected == "file" and not candidate.is_file():
            raise TOOL.MapActionCaptureError(label)
        if expected == "missing" and (
            candidate.exists() or candidate.is_symlink()
        ):
            raise TOOL.MapActionCaptureError(label)
        if expected == "dir" and not candidate.is_dir():
            raise TOOL.MapActionCaptureError(label)
        return candidate

    def _formal_transaction_fixture(
        self,
        repository_root: Path,
        *,
        had_old: bool,
        run_root: Path | None = None,
        staged_prefix: str = "new",
    ) -> tuple[
        str,
        Path,
        Path,
        Path,
        list[tuple[str, str, str, Path, Path, str]],
        dict[tuple[str, str], tuple[Path, Path]],
        list[tuple[str, str, str, Path, Path, str]],
        dict[Path, bytes],
    ]:
        bundle_id = "earth_vein_cave_visual_v1"
        if run_root is None:
            run_root = repository_root / ".run/evidence/run"
        staging_root = (
            run_root / "single-window-batch" / "staged-actions"
        )
        install_root = (
            repository_root
            / "client/godot/assets/maps"
            / bundle_id
            / "evidence/runtime-actions"
        )
        staged_targets = []
        formal_targets = []
        installs = {}
        old_bytes = {}
        for map_id in TOOL.RECORDER.RECORDER_CONFIGS[bundle_id]["maps"]:
            for action_kind in TOOL.ACTION_KINDS:
                staged_dir = staging_root / map_id
                install_dir = install_root / map_id
                staged_dir.mkdir(parents=True, exist_ok=True)
                install_dir.mkdir(parents=True, exist_ok=True)
                staged_png = staged_dir / f"{action_kind}.png"
                staged_report = staged_dir / f"{action_kind}-capture.json"
                destination_png = install_dir / f"{action_kind}.png"
                destination_report = (
                    install_dir / f"{action_kind}-capture.json"
                )
                staged_png.write_bytes(
                    f"{staged_prefix}:{map_id}:{action_kind}:png".encode()
                )
                staged_report.write_bytes(
                    f"{staged_prefix}:{map_id}:{action_kind}:report".encode()
                )
                if had_old:
                    for destination, suffix in (
                        (destination_png, "png"),
                        (destination_report, "report"),
                    ):
                        if not destination.exists():
                            destination.write_bytes(
                                f"old:{map_id}:{action_kind}:{suffix}".encode()
                            )
                        payload = destination.read_bytes()
                        old_bytes[destination] = payload
                staged_targets.append((
                    map_id,
                    action_kind,
                    TOOL.ACTION_MODES[action_kind],
                    staged_png,
                    staged_report,
                    "replace" if had_old else "record",
                ))
                formal_targets.append((
                    map_id,
                    action_kind,
                    TOOL.ACTION_MODES[action_kind],
                    destination_png,
                    destination_report,
                    "replace" if had_old else "record",
                ))
                installs[(map_id, action_kind)] = (
                    destination_png,
                    destination_report,
                )
        return (
            bundle_id,
            run_root,
            staging_root,
            install_root,
            staged_targets,
            installs,
            formal_targets,
            old_bytes,
        )

    @staticmethod
    def _fixture_artifact(
        *,
        path: str = "fixture/artifact.bin",
        sha256: str = "a" * 64,
        size_bytes: int = 1,
    ) -> dict:
        return {
            "path": path,
            "sizeBytes": size_bytes,
            "sha256": sha256,
        }

    def _valid_formal_summary(self, journal: dict) -> dict:
        entries = {
            (entry["mapId"], entry["actionKind"], entry["type"]): entry
            for entry in journal["entries"]
        }
        plan_sha = "a" * 64
        generic_artifact = self._fixture_artifact()
        records = []
        maps = TOOL.RECORDER.RECORDER_CONFIGS[journal["bundleId"]]["maps"]
        for map_id in maps:
            for action_kind in TOOL.ACTION_KINDS:
                screenshot = entries[(map_id, action_kind, "screenshot_png")]
                report = entries[(
                    map_id,
                    action_kind,
                    "capture_report_json",
                )]
                record = {
                    "mapId": map_id,
                    "actionKind": action_kind,
                    "mode": TOOL.ACTION_MODES[action_kind],
                    "captureVariant": action_kind,
                    "resumed": False,
                    "screenshot": self._fixture_artifact(
                        path=TOOL._portable(Path(screenshot["destination"])),
                        sha256=screenshot["stagedSha256"],
                        size_bytes=Path(screenshot["destination"]).stat().st_size,
                    ),
                    "captureReport": self._fixture_artifact(
                        path=TOOL._portable(Path(report["destination"])),
                        sha256=report["stagedSha256"],
                        size_bytes=Path(report["destination"]).stat().st_size,
                    ),
                    "captureResult": "PASS",
                    "targetClearance": "two_cell",
                    "hudGlyphStability": {"status": "passed"},
                    "qaLane": {
                        "sourceCheck": {},
                        "nativeAttestation": {},
                        "nativeProcess": {},
                        "cleanup": {},
                        "postCleanupInspect": {},
                        "lifecycle": dict(generic_artifact),
                    },
                    "godotLog": dict(generic_artifact),
                    "batchBinding": {
                        "planSha256": plan_sha,
                        "sourceIdentity": {},
                        "runtimeIdentity": {},
                        "buildIdentity": "fixture-build",
                        "windowIdentity": {},
                        "batchResult": "PASS",
                        "actionReceipt": {},
                    },
                    "singleWindowBatch": {
                        "planSha256": plan_sha,
                        "godotProcessCount": 1,
                        "userVisibleWindowOpenCount": 1,
                        "userVisibleWindowCloseCount": 1,
                        "singlePersistentWindow": True,
                        "processId": 123,
                        "displayServerWindowCountDuringCapture": 1,
                        "processReturnedBeforeLaneCleanup": True,
                        "laneCleanupStatus": "cleaned",
                        "postCleanupInspectStatus": "inspected",
                        "processExitCode": 0,
                        "leaderReaped": True,
                        "processGroupClosed": True,
                        "processGroupResidualObserved": False,
                        "derivation": "fixture",
                        "sourceIdentity": {},
                    },
                }
                records.append(record)
        superseded = []
        for entry in journal["entries"]:
            if entry["operation"] != "install" or not entry["hadOld"]:
                continue
            backup = Path(entry["backup"])
            superseded.append(self._fixture_artifact(
                path=TOOL._portable(backup),
                sha256=entry["oldSha256"],
                size_bytes=backup.stat().st_size,
            ))
        batch = {
            "planSha256": plan_sha,
            "processId": 123,
            "rootWindowId": 0,
            "godotProcessCount": 1,
            "userVisibleWindowOpenCount": 1,
            "userVisibleWindowCloseCount": 1,
            "singlePersistentWindow": True,
            "displayServerWindowCountDuringCapture": 1,
            "processReturnedBeforeLaneCleanup": True,
            "laneCleanupStatus": "cleaned",
            "postCleanupInspectStatus": "inspected",
            "processExitCode": 0,
            "leaderReaped": True,
            "processGroupClosed": True,
            "processGroupResidualObserved": False,
            "derivation": "fixture",
            "actionCount": len(records),
        }
        return {
            "schemaVersion": 1,
            "reportType": TOOL.BATCH_TRANSACTION_SUMMARY_REPORT_TYPE,
            "generatedAtUtc": "2026-08-26T00:00:00Z",
            "result": "PASS",
            "bundleId": journal["bundleId"],
            "maps": list(maps),
            "actionKinds": list(TOOL.ACTION_KINDS),
            "captureCount": len(records),
            "launchStrategy": "single_persistent_window",
            "godotProcessCount": 1,
            "userVisibleWindowOpenCount": 1,
            "userVisibleWindowCloseCount": 1,
            "singlePersistentWindow": True,
            "windowCountEvidence": {
                "godotProcessCount": 1,
                "userVisibleWindowOpenCount": 1,
                "userVisibleWindowCloseCount": 1,
                "singlePersistentWindow": True,
                "batchCount": 1,
                "batches": [batch],
                "derivation": "fixture",
            },
            "actionsRecordedInSingleProcess": len(records),
            "batchEntrypoint": dict(generic_artifact),
            "batchCaptureController": dict(generic_artifact),
            "batchPlan": self._fixture_artifact(sha256=plan_sha),
            "batchPlanSha256": plan_sha,
            "batchRuntimeReceipt": {"result": "PASS"},
            "scratchOnly": False,
            "resumed": False,
            "replacedPendingEvidence": False,
            "supersededEvidence": superseded,
            "hudGlyphStability": {
                "status": "passed",
                "selfContainedImageCount": len(records),
                "incrementalPreviewAcceptedAsPixelAuthority": False,
                "board": {
                    "path": "fixture/board.png",
                    "sha256": "b" * 64,
                    "bytes": 1,
                    "width": 1,
                    "height": 1,
                    "itemCount": len(records),
                    "presentationMode": (
                        "single_precomposed_bitmap_no_incremental_frames"
                    ),
                },
            },
            "records": records,
        }

    def test_default_batch_command_opens_only_one_persistent_window(self) -> None:
        TOOL.RECORDER._activate_bundle("earth_vein_cave_visual_v1")
        command = TOOL._build_batch_godot_command(
            godot="/Applications/Godot.app/Contents/MacOS/Godot",
        )
        self.assertEqual(command.count("--script"), 1)
        self.assertEqual(command.count(TOOL.BATCH_CAPTURE_SCRIPT), 1)
        self.assertEqual(command.count("--single-window"), 1)
        self.assertEqual(command.count("1280x720"), 1)
        self.assertNotIn("--scene", command)
        self.assertNotIn("--headless", command)
        self.assertNotIn("--write-movie", command)
        self.assertEqual(command.count("--audio-driver"), 1)
        self.assertEqual(command.count("Dummy"), 1)
        self.assertFalse(any(
            value.startswith("--map-art-review-preview")
            for value in command
        ))
        self.assertEqual(
            command.count(TOOL.CORE.QA_LANE_ARGUMENT),
            1,
        )

    def test_earth_batch_plan_has_20_actions_and_pending_lifecycle(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            plan = TOOL._batch_plan(
                bundle_id="earth_vein_cave_visual_v1",
                targets=self._earth_targets(root),
            )
        self.assertEqual(len(plan["actions"]), 20)
        self.assertEqual(plan["lifecycle"], TOOL.PENDING_LIFECYCLE)
        self.assertEqual(plan["launchContract"], TOOL.LAUNCH_CONTRACT)
        self.assertEqual(plan["outputMode"], "scratch")
        self.assertEqual(plan["outputRoot"], plan["installRoot"])
        self.assertEqual(plan["windowContract"], {
            "godotProcessCount": 1,
            "userVisibleWindowOpenCount": 1,
            "userVisibleWindowCloseCount": 1,
            "singlePersistentWindow": True,
            "viewport": [1280, 720],
        })
        self.assertEqual(
            {
                (entry["mapId"], entry["actionKind"])
                for entry in plan["actions"]
            },
            {
                (map_id, action_kind)
                for map_id in TOOL.RECORDER.REVIEW_MAPS
                for action_kind in TOOL.ACTION_KINDS
            },
        )
        self.assertEqual(
            plan["sourceIdentity"],
            TOOL._batch_source_identity(),
        )
        self.assertEqual(
            set(plan["sourceIdentity"]),
            {
                "orchestrator",
                "evidenceBuilder",
                "ownerReviewRecorder",
                "processContainment",
                "qaUserDataLane",
                "hudGlyphAuditor",
                "entrypoint",
                "captureController",
                "interactionModel",
                "playerProgressModel",
                "showcaseProfile",
                "mainScene",
                "mainHost",
            },
        )
        self.assertEqual(plan["buildIdentity"], TOOL.EVIDENCE_BUILDER.build_identity())
        self.assertRegex(plan["buildIdentity"], BUILD_IDENTITY_RE)
        self.assertEqual(
            plan["captureSurfaceIdentity"],
            TOOL._capture_surface_identity("earth_vein_cave_visual_v1"),
        )

    def test_batch_plan_excludes_only_reused_actions(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            targets = self._earth_targets(Path(temp))
            reused = (*targets[0][0:5], "reuse")
            targets[0] = reused
            plan = TOOL._batch_plan(
                bundle_id="earth_vein_cave_visual_v1",
                targets=targets,
            )
        self.assertEqual(len(plan["actions"]), 19)
        self.assertNotIn(
            (reused[0], reused[1]),
            {
                (entry["mapId"], entry["actionKind"])
                for entry in plan["actions"]
            },
        )

    def test_formal_plan_writes_only_to_batch_staging_then_installs_exactly(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            staging = root / "single-window-batch" / "staged-actions"
            formal = root / "formal-actions"
            staged_targets = []
            install_targets = {}
            for map_id, action_kind, mode, _shot, _report, state in (
                self._earth_targets(root)[:2]
            ):
                staged_targets.append((
                    map_id,
                    action_kind,
                    mode,
                    staging / map_id / f"{action_kind}.png",
                    staging / map_id / f"{action_kind}-capture.json",
                    state,
                ))
                install_targets[(map_id, action_kind)] = (
                    formal / map_id / f"{action_kind}.png",
                    formal / map_id / f"{action_kind}-capture.json",
                )
            plan = TOOL._batch_plan(
                bundle_id="earth_vein_cave_visual_v1",
                targets=staged_targets,
                output_mode="formal_staging",
                install_targets=install_targets,
            )
        self.assertEqual(plan["outputMode"], "formal_staging")
        self.assertEqual(plan["outputRoot"], str(staging))
        self.assertEqual(plan["installRoot"], str(formal))
        for action in plan["actions"]:
            self.assertTrue(action["outputPath"].startswith(f"{staging}/"))
            self.assertTrue(
                action["installOutputPath"].startswith(f"{formal}/")
            )

    def test_batch_log_receipt_proves_one_process_window_and_all_actions(self) -> None:
        TOOL.RECORDER._activate_bundle("earth_vein_cave_visual_v1")
        freeze = TOOL._batch_freeze("earth_vein_cave_visual_v1")
        root_window_id = 0
        initial_window = self._window_checkpoint("initial", root_window_id)
        final_window = self._window_checkpoint("final", root_window_id)
        payload = {
            "status": "passed",
            "result": "PASS",
            "scene": "res://scenes/Main.tscn",
            "bundleId": "earth_vein_cave_visual_v1",
            "planSha256": "a" * 64,
            "actionCount": 20,
            "completedActionCount": 20,
            "godotProcessCount": 1,
            "userVisibleWindowOpenCount": 1,
            "singlePersistentWindow": True,
            "viewport": [1280, 720],
            **freeze,
            "runtimeIdentity": {
                "processId": 4242,
                "processFrameOrigin": 1,
                "displayServer": "macOS",
                "displayServerWindowCount": 1,
                "displayServerWindowIds": [root_window_id],
                "rootWindowId": root_window_id,
                "audioDriver": "Dummy",
                "mainSceneLoadCount": 1,
                "mainSceneInstanceCount": 1,
                "viewport": [1280, 720],
            },
            "windowCountEvidence": {
                "displayServerWindowCountDuringCapture": 1,
                "singleWindowEngineFlagRequiredByPlan": True,
                "windowLifecycle": {
                    "rootWindowId": root_window_id,
                    "initial": initial_window,
                    "final": final_window,
                },
            },
            "finalCleanup": {
                "status": "not_required",
                "reason": "already_drained",
            },
            "processFrameCount": 400,
            "lifecycle": TOOL.PENDING_LIFECYCLE,
            "actions": [
                {
                    "mapId": map_id,
                    "actionKind": action_kind,
                    "result": "PASS",
                    "screenshotSha256": "b" * 64,
                    "captureReportSha256": "c" * 64,
                    "windowIdentity": {
                        "rootWindowId": root_window_id,
                        "before": self._window_checkpoint(
                            f"{map_id}/{action_kind}:before", root_window_id
                        ),
                        "after": self._window_checkpoint(
                            f"{map_id}/{action_kind}:after", root_window_id
                        ),
                    },
                }
                for map_id in TOOL.RECORDER.REVIEW_MAPS
                for action_kind in TOOL.ACTION_KINDS
            ],
            "errors": [],
        }
        with tempfile.TemporaryDirectory() as temp:
            log = Path(temp) / "godot.log"
            log.write_text(
                "OpenGL API 4.1 Metal - 90.5 - Compatibility - Using Device: Apple - Apple M5\n"
                + "\n".join(
                    TOOL.BATCH_PROGRESS_PREFIX
                    + json.dumps({
                        "bundleId": "earth_vein_cave_visual_v1",
                        "planSha256": "a" * 64,
                        "actionIndex": index,
                        "stage": stage,
                    })
                    for index in range(20)
                    for stage in ("before_prepare", "after_capture")
                )
                + "\n"
                + "\n".join(
                    "map visual review capture: {}" for _index in range(20)
                )
                + "\n"
                + TOOL.BATCH_LOG_PREFIX
                + json.dumps(payload)
                + "\n",
                encoding="utf-8",
            )
            actual = TOOL._batch_receipt_from_log(
                log,
                expected_action_count=20,
                expected_plan_sha256="a" * 64,
                expected_bundle_id="earth_vein_cave_visual_v1",
            )
            self.assertEqual(actual, payload)
            payload["userVisibleWindowOpenCount"] = 20
            log.write_text(
                "OpenGL API 4.1 Metal - 90.5 - Compatibility - Using Device: Apple - Apple M5\n"
                + "\n".join(
                    TOOL.BATCH_PROGRESS_PREFIX + "{}"
                    for _index in range(40)
                )
                + "\n"
                + "\n".join(
                    "map visual review capture: {}" for _index in range(20)
                )
                + "\n"
                + TOOL.BATCH_LOG_PREFIX
                + json.dumps(payload)
                + "\n",
                encoding="utf-8",
            )
            with self.assertRaises(TOOL.MapActionCaptureError):
                TOOL._batch_receipt_from_log(
                    log,
                    expected_action_count=20,
                    expected_plan_sha256="a" * 64,
                    expected_bundle_id="earth_vein_cave_visual_v1",
                )
            payload["userVisibleWindowOpenCount"] = 1
            payload["status"] = "failed"
            log.write_text(
                "OpenGL API 4.1 Metal - 90.5 - Compatibility - Using Device: Apple - Apple M5\n"
                + "\n".join(
                    TOOL.BATCH_PROGRESS_PREFIX + "{}"
                    for _index in range(40)
                )
                + "\n"
                + "\n".join(
                    "map visual review capture: {}" for _index in range(20)
                )
                + "\n"
                + TOOL.BATCH_LOG_PREFIX
                + json.dumps(payload)
                + "\n",
                encoding="utf-8",
            )
            with self.assertRaises(TOOL.MapActionCaptureError):
                TOOL._batch_receipt_from_log(
                    log,
                    expected_action_count=20,
                    expected_plan_sha256="a" * 64,
                    expected_bundle_id="earth_vein_cave_visual_v1",
                )

    def test_batch_entrypoint_instantiates_one_real_main_and_switches_maps(self) -> None:
        source = TOOL.BATCH_CAPTURE_SCRIPT_PATH.read_text(encoding="utf-8")
        self.assertIn("extends SceneTree", source)
        self.assertEqual(source.count("change_scene_to_file(MAIN_SCENE)"), 1)
        self.assertIn('const MAIN_SCENE := "res://scenes/Main.tscn"', source)
        self.assertIn('host._load_map(map_id, "default")', source)
        self.assertIn("MapVisualReviewCapture.new(host).run(request)", source)
        self.assertIn('"godotProcessCount": 1', source)
        self.assertIn('"displayServerWindowCount": window_ids.size()', source)
        self.assertIn('"rootWindowId": root.get_window_id()', source)
        self.assertIn('"audioDriver": AudioServer.get_driver_name()', source)
        self.assertIn('report["qaPreviewFlagPresent"] = false', source)
        self.assertIn('"kind": "sha256_bound_batch_plan"', source)
        self.assertIn('report["batchSourceIdentity"]', source)
        self.assertIn('report["batchRuntimeIdentity"]', source)
        self.assertIn('"ownerReviewStatus": "pending"', source)
        self.assertIn('"releaseApproved": false', source)
        self.assertIn('"runtimeEnabled": false', source)
        self.assertIn("plan_file.get_buffer(plan_file.get_length())", source)
        self.assertIn("hash_context.update(plan_bytes)", source)
        self.assertIn(
            "JSON.parse_string(plan_bytes.get_string_from_utf8())",
            source,
        )
        self.assertIn(
            'const BUILD_IDENTITY_NAMESPACE := "beastbound-map-runtime-surface-v2"',
            source,
        )
        self.assertIn("if not _is_build_identity(build_identity):", source)
        self.assertNotIn("if not _is_sha256(build_identity):", source)
        self.assertNotIn(
            "JSON.parse_string(FileAccess.get_file_as_string(plan_path))",
            source,
        )

    def test_batch_resume_directory_contract_rejects_signed_numbers(self) -> None:
        source = TOOL.BATCH_CAPTURE_SCRIPT_PATH.read_text(encoding="utf-8")
        self.assertIn(
            'resume_number.substr(0, 1).is_valid_int()',
            source,
        )
        self.assertIn("int(resume_number) < 1", source)
        self.assertIn("int(resume_number) > 99", source)

    def test_python_recorder_runs_the_official_lane_once_for_the_batch(self) -> None:
        source = TOOL_PATH.read_text(encoding="utf-8")
        self.assertEqual(
            source.count("CORE._run_official_lane_godot_sequence("),
            1,
        )
        self.assertNotIn("RECORDER._build_godot_command(", source)
        self.assertIn("batch_timeout_seconds = min(", source)
        self.assertIn("_batch_progress_godot_runner(", source)
        self.assertIn("no_progress_timeout=timeout_seconds", source)
        self.assertIn('"launchStrategy": "single_persistent_window"', source)
        self.assertIn('record["singleWindowBatch"]', source)
        self.assertIn('"sourceIdentity": batch_receipt.get(', source)
        self.assertIn("_path_exists_or_link(superseded_root)", source)
        self.assertIn("_install_staged_pairs(", source)
        self.assertIn("_rollback_installed_pairs(", source)
        self.assertLess(
            source.index("# Keep the complete old formal set installed"),
            source.index("_begin_formal_transaction(", source.index(
                "# Keep the complete old formal set installed"
            )),
        )
        self.assertLess(
            source.index("# Validate every sealed staging pair"),
            source.index("# Keep the complete old formal set installed"),
        )

    def test_scratch_only_is_an_explicit_non_formal_mode(self) -> None:
        args = TOOL._parse_args([
            "--bundle-id",
            "firebud_region_visual_v2",
            "--run-id",
            "scratch-contract",
            "--scratch-only",
        ])
        self.assertTrue(args.scratch_only)
        self.assertFalse(args.replace_pending_evidence)
        source = TOOL_PATH.read_text(encoding="utf-8")
        self.assertIn('run_root / "scratch-actions"', source)
        self.assertIn('"scratchOnly": scratch_only', source)

    def test_scratch_preflight_does_not_read_or_recover_formal_history(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            bundle_id = "earth_vein_cave_visual_v1"
            base = root / TOOL.DEFAULT_RUN_ROOT / bundle_id
            broken = base / "old" / "formal-install-transaction.json"
            broken.parent.mkdir(parents=True)
            broken.write_bytes(b"not a valid journal")
            # A known later preflight boundary stops before any Godot launch.
            (base / "existing-run").mkdir()
            guard = TOOL._guard_repo_path
            with (
                mock.patch.object(TOOL, "REPO_ROOT", root),
                mock.patch.object(TOOL, "_guard_repo_path", side_effect=lambda path, **kw: guard(path, **{**kw, "anchor": root})),
                mock.patch.object(TOOL.CORE, "_require_executable", return_value="fixture-godot"),
                mock.patch.object(TOOL, "_process_start_identity", return_value="f" * 64),
            ):
                for scratch in (True, False):
                    args = TOOL._parse_args([
                        "--bundle-id", bundle_id, "--run-id", "existing-run",
                        *(["--scratch-only"] if scratch else []),
                    ])
                    expected = "runId 根 必须尚不存在" if scratch else "formal transaction journal"
                    with self.subTest(scratch=scratch), self.assertRaisesRegex(TOOL.MapActionCaptureError, expected):
                        TOOL._record(args)
                    self.assertEqual(broken.read_bytes(), b"not a valid journal")
                    self.assertFalse((base / TOOL.BATCH_BUNDLE_LOCK_NAME).exists())

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

    def test_pending_replacement_requires_complete_pair(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            screenshot = root / "pointer.png"
            report = root / "pointer-capture.json"
            screenshot.write_bytes(b"png")
            report.write_text("{}", encoding="utf-8")
            self.assertEqual(
                TOOL._target_state(
                    screenshot,
                    report,
                    resume=False,
                    replace_pending=True,
                ),
                "replace",
            )
            report.unlink()
            with self.assertRaises(TOOL.MapActionCaptureError):
                TOOL._target_state(
                    screenshot,
                    report,
                    resume=False,
                    replace_pending=True,
                )

    def test_pending_replacement_lifecycle_is_fail_closed(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            manifest = Path(temp) / "map-visual-bundle.json"
            payload = {
                "bundleId": "example_v1",
                **TOOL.PENDING_LIFECYCLE,
            }
            manifest.write_text(json.dumps(payload), encoding="utf-8")
            TOOL._validate_pending_replacement(manifest, "example_v1")
            payload["runtimeEnabled"] = True
            manifest.write_text(json.dumps(payload), encoding="utf-8")
            with self.assertRaises(TOOL.MapActionCaptureError):
                TOOL._validate_pending_replacement(manifest, "example_v1")

    def test_formal_pair_backup_can_be_fully_restored(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            formal_root = root / "formal"
            screenshot = formal_root / "map_a" / "pointer.png"
            report = formal_root / "map_a" / "pointer-capture.json"
            screenshot.parent.mkdir(parents=True)
            screenshot.write_bytes(b"old-png")
            report.write_bytes(b"old-report")
            targets = [
                ("map_a", "pointer", "idle", screenshot, report, "replace")
            ]
            backups = TOOL._backup_formal_pairs(
                targets,
                root / "backup",
                formal_root=formal_root,
                safety_anchor=root,
            )
            self.assertFalse(screenshot.exists())
            self.assertFalse(report.exists())
            screenshot.write_bytes(b"new-png")
            report.write_bytes(b"new-report")
            TOOL._restore_formal_pairs(
                backups,
                formal_root=formal_root,
                backup_root=root / "backup",
                safety_anchor=root,
            )
            self.assertEqual(screenshot.read_bytes(), b"old-png")
            self.assertEqual(report.read_bytes(), b"old-report")

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

    def test_path_guard_rejects_prefix_collision_and_parent_symlink(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            allowed = root / "allowed"
            allowed.mkdir()
            prefix_collision = root / "allowed-evil" / "capture.png"
            with self.assertRaises(TOOL.MapActionCaptureError):
                TOOL._guard_repo_path(
                    prefix_collision,
                    allowed_root=allowed,
                    anchor=root,
                    label="prefix collision",
                    expected="file_or_missing",
                )
            outside = root / "outside"
            outside.mkdir()
            linked_parent = allowed / "linked"
            linked_parent.symlink_to(outside, target_is_directory=True)
            with self.assertRaises(TOOL.MapActionCaptureError):
                TOOL._guard_repo_path(
                    linked_parent / "capture.png",
                    allowed_root=allowed,
                    anchor=root,
                    label="linked parent",
                    expected="file_or_missing",
                )

    def test_bundle_lock_blocks_active_recorder_and_cleans_on_exit(self) -> None:
        TOOL.REPO_ROOT.joinpath(".run").mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(dir=TOOL.REPO_ROOT / ".run") as temp:
            run_base = Path(temp)
            identity = "a" * 64
            with (
                mock.patch.object(TOOL, "DEFAULT_RUN_ROOT", Path(".run")),
                mock.patch.object(
                    TOOL,
                    "_process_start_identity",
                    return_value=identity,
                ),
            ):
                with TOOL._bundle_recorder_lock(
                    run_base,
                    bundle_id="earth_vein_cave_visual_v1",
                ) as lock:
                    lock_path, payload, _inode = lock
                    record = TOOL._parse_bundle_lock(
                        payload,
                        bundle_id="earth_vein_cave_visual_v1",
                    )
                    self.assertEqual(record["runner"]["pid"], TOOL.os.getpid())
                    self.assertEqual(
                        record["runner"]["startIdentitySha256"],
                        identity,
                    )
                    with self.assertRaises(TOOL.MapActionCaptureError):
                        TOOL._acquire_bundle_recorder_lock(
                            run_base,
                            bundle_id="earth_vein_cave_visual_v1",
                        )
                    self.assertTrue(lock_path.is_file())
                self.assertFalse(
                    (run_base / TOOL.BATCH_BUNDLE_LOCK_NAME).exists()
                )

    def test_bundle_lock_safely_recovers_stale_owner_and_rejects_symlink(
        self,
    ) -> None:
        TOOL.REPO_ROOT.joinpath(".run").mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(dir=TOOL.REPO_ROOT / ".run") as temp:
            run_base = Path(temp)
            lock_path = run_base / TOOL.BATCH_BUNDLE_LOCK_NAME
            stale_payload = TOOL._bundle_lock_bytes(
                bundle_id="earth_vein_cave_visual_v1",
                owner="1" * 32,
                process_id=999999,
                start_identity="b" * 64,
            )
            lock_path.write_bytes(stale_payload)

            def identity_for(process_id: int) -> str:
                return "" if process_id == 999999 else "c" * 64

            with (
                mock.patch.object(TOOL, "DEFAULT_RUN_ROOT", Path(".run")),
                mock.patch.object(
                    TOOL,
                    "_process_start_identity",
                    side_effect=identity_for,
                ),
            ):
                with TOOL._bundle_recorder_lock(
                    run_base,
                    bundle_id="earth_vein_cave_visual_v1",
                ):
                    self.assertNotEqual(lock_path.read_bytes(), stale_payload)
                outside = run_base / "outside-lock"
                outside.write_text("foreign", encoding="utf-8")
                lock_path.symlink_to(outside)
                with self.assertRaises(TOOL.MapActionCaptureError):
                    TOOL._acquire_bundle_recorder_lock(
                        run_base,
                        bundle_id="earth_vein_cave_visual_v1",
                    )
                self.assertTrue(lock_path.is_symlink())

    def test_reusable_lane_requires_official_source_and_complete_cleanup(
        self,
    ) -> None:
        real_sha = "d" * 64
        lane_root = "/tmp/BeastboundOdysseyQA_Automation"
        lifecycle = {
            "sourceCheck": {"status": "source_contract_passed"},
            "status": "cleaned_before_media",
            "lane": TOOL.CORE.QA_LANE,
            "feature": TOOL.CORE.QA_LANE_FEATURE,
            "customUserDirName": TOOL.CORE.QA_LANE_CUSTOM_USER_DIR_NAME,
            "laneRoot": lane_root,
            "realBeforeSha256": real_sha,
            "qaLanePreserved": False,
            "lanePreservationReason": None,
            "phases": {
                "native": {
                    "attestation": {
                        "customUserDirName": (
                            TOOL.CORE.QA_LANE_CUSTOM_USER_DIR_NAME
                        ),
                        "feature": TOOL.CORE.QA_LANE_FEATURE,
                        "lane": TOOL.CORE.QA_LANE,
                        "status": "passed",
                        "userDataRoot": lane_root,
                    },
                    "process": {
                        "exitCode": 0,
                        "leaderReaped": True,
                        "processGroupClosed": True,
                        "processGroupResidualObserved": False,
                    },
                    "postVerify": {
                        "status": "verified",
                        "realUnchanged": True,
                        "realInventorySha256": real_sha,
                    },
                },
            },
            "cleanup": {
                "status": "cleaned",
                "realUnchanged": True,
                "laneAbsent": True,
                "realInventorySha256": real_sha,
            },
            "postCleanupInspect": {
                "status": "inspected",
                "laneRootState": "absent",
                "publishedLockState": "absent",
                "pendingLockState": "absent",
                "realInventorySha256": real_sha,
            },
        }
        TOOL._validate_reusable_qa_lane_lifecycle(lifecycle)
        for path, key, value in (
            (("sourceCheck",), "status", "unverified"),
            (("cleanup",), "realUnchanged", False),
            (("cleanup",), "laneAbsent", False),
            (("postCleanupInspect",), "laneRootState", "present"),
        ):
            drifted = json.loads(json.dumps(lifecycle))
            target = drifted
            for component in path:
                target = target[component]
            target[key] = value
            with self.assertRaises(TOOL.MapActionCaptureError):
                TOOL._validate_reusable_qa_lane_lifecycle(drifted)

    def test_resume_rejects_single_action_pass_from_failed_batch(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            run_root = Path(temp) / "run"
            action_root = run_root / "earth_vein_cave" / "pointer"
            batch_root = run_root / "single-window-batch"
            batch_root.mkdir(parents=True)
            plan_path = batch_root / "single-window-action-plan.json"
            plan_path.write_text(
                json.dumps({"actions": [{"mapId": "earth_vein_cave"}]}),
                encoding="utf-8",
            )
            screenshot = run_root / "pointer.png"
            report = run_root / "pointer-capture.json"
            screenshot.write_bytes(b"png")
            report.write_text("{}", encoding="utf-8")
            (batch_root / "qa-lane-lifecycle.json").write_text(
                "{}",
                encoding="utf-8",
            )
            failed_receipt = {
                "status": "failed",
                "result": "FAIL",
                "bundleId": "earth_vein_cave_visual_v1",
                "planSha256": TOOL._sha256(plan_path),
                "actionCount": 1,
                "completedActionCount": 1,
                "actions": [{
                    "mapId": "earth_vein_cave",
                    "actionKind": "pointer",
                    "result": "PASS",
                }],
                "errors": ["later action failed"],
            }
            (batch_root / "godot.log").write_text(
                "OpenGL API 4.1 Metal - 90.5 - Compatibility - Using Device: Apple - Apple M5\n"
                + TOOL.BATCH_PROGRESS_PREFIX + "{}\n"
                + TOOL.BATCH_PROGRESS_PREFIX + "{}\n"
                + "map visual review capture: {}\n"
                + TOOL.BATCH_LOG_PREFIX + json.dumps(failed_receipt) + "\n",
                encoding="utf-8",
            )
            with (
                mock.patch.object(TOOL.RECORDER, "_validate_godot_log"),
                mock.patch.object(TOOL, "_validate_action_run_binding") as binding,
            ):
                with self.assertRaises(TOOL.MapActionCaptureError):
                    TOOL._find_successful_action_run(
                        action_root,
                        map_id="earth_vein_cave",
                        action_kind="pointer",
                        screenshot=screenshot,
                        report=report,
                    )
                binding.assert_not_called()

    def test_dangling_symlink_is_not_treated_as_missing_target(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            screenshot = root / "pointer.png"
            report = root / "pointer-capture.json"
            screenshot.symlink_to(root / "missing.png")
            with self.assertRaises(TOOL.MapActionCaptureError):
                TOOL._target_state(screenshot, report, resume=True)

    def test_partial_formal_install_rolls_back_before_returning_error(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            staging_root = root / "staging"
            install_root = root / "formal"
            staged_map = staging_root / "map_a"
            install_map = install_root / "map_a"
            staged_map.mkdir(parents=True)
            install_map.mkdir(parents=True)
            staged_screenshot = staged_map / "pointer.png"
            staged_report = staged_map / "pointer-capture.json"
            staged_screenshot.write_bytes(b"new-png")
            staged_report.write_bytes(b"new-report")
            install_screenshot = install_map / "pointer.png"
            install_report = install_map / "pointer-capture.json"
            install_report.symlink_to(root / "missing-report.json")
            targets = [(
                "map_a",
                "pointer",
                "idle",
                staged_screenshot,
                staged_report,
                "record",
            )]
            with self.assertRaises(TOOL.MapActionCaptureError):
                TOOL._install_staged_pairs(
                    targets,
                    {("map_a", "pointer"): (
                        install_screenshot,
                        install_report,
                    )},
                    staging_root=staging_root,
                    install_root=install_root,
                    safety_anchor=root,
                )
            self.assertTrue(staged_screenshot.is_file())
            self.assertTrue(staged_report.is_file())
            self.assertFalse(install_screenshot.exists())
            self.assertTrue(install_report.is_symlink())

    def test_window_counts_are_derived_from_runtime_and_lane_cleanup(self) -> None:
        receipt = {
            "runtimeIdentity": {
                "processId": 99,
                "displayServerWindowCount": 1,
            },
        }
        lane = {
            "cleanup": {"status": "cleaned"},
            "postCleanupInspect": {"status": "inspected"},
            "nativeProcess": {
                "exitCode": 0,
                "leaderReaped": True,
                "processGroupClosed": True,
                "processGroupResidualObserved": False,
            },
        }
        evidence = TOOL._derive_window_evidence(
            receipt,
            lane,
            native_invocation_count=1,
        )
        self.assertEqual(evidence["userVisibleWindowOpenCount"], 1)
        self.assertEqual(evidence["userVisibleWindowCloseCount"], 1)
        for key, bad_value in (
            ("exitCode", 1),
            ("leaderReaped", False),
            ("processGroupClosed", False),
            ("processGroupResidualObserved", True),
        ):
            with self.subTest(key=key):
                bad_lane = copy.deepcopy(lane)
                bad_lane["nativeProcess"][key] = bad_value
                with self.assertRaises(TOOL.MapActionCaptureError):
                    TOOL._derive_window_evidence(
                        receipt, bad_lane, native_invocation_count=1
                    )
        receipt["runtimeIdentity"]["displayServerWindowCount"] = 2
        with self.assertRaises(TOOL.MapActionCaptureError):
            TOOL._derive_window_evidence(
                receipt,
                lane,
                native_invocation_count=1,
            )

    def test_action_binding_rejects_unrelated_shared_batch_receipt(self) -> None:
        TOOL.RECORDER._activate_bundle("earth_vein_cave_visual_v1")
        TOOL.REPO_ROOT.joinpath(".run").mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(dir=TOOL.REPO_ROOT / ".run") as temp:
            action_run = Path(temp)
            output = action_run / "scratch-actions" / "earth_vein_cave"
            output.mkdir(parents=True)
            screenshot = output / "pointer.png"
            report = output / "pointer-capture.json"
            screenshot.write_bytes(b"png")
            target = [(
                "earth_vein_cave",
                "pointer",
                "idle",
                screenshot,
                report,
                "record",
            )]
            plan = TOOL._batch_plan(
                bundle_id="earth_vein_cave_visual_v1",
                targets=target,
            )
            plan_path = action_run / "single-window-action-plan.json"
            plan_path.write_text(json.dumps(plan), encoding="utf-8")
            plan_sha = TOOL._sha256(plan_path)
            freeze = TOOL._batch_freeze("earth_vein_cave_visual_v1")
            runtime_identity = {
                "processId": 7,
                "displayServerWindowCount": 1,
                "displayServerWindowIds": [0],
                "rootWindowId": 0,
                "audioDriver": "Dummy",
                "mainSceneLoadCount": 1,
                "mainSceneInstanceCount": 1,
                "viewport": [1280, 720],
            }
            capture = {
                "batchPlanSha256": plan_sha,
                "batchSourceIdentity": freeze["sourceIdentity"],
                "batchRuntimeIdentity": runtime_identity,
                "batchBuildIdentity": freeze["buildIdentity"],
                "batchBundleManifestIdentity": freeze[
                    "bundleManifestIdentity"
                ],
                "batchCaptureSurfaceIdentity": freeze[
                    "captureSurfaceIdentity"
                ],
                "batchCaptureSurfaceIdentitySha256": freeze[
                    "captureSurfaceIdentitySha256"
                ],
                "captureWritePath": TOOL._capture_path(screenshot),
                "captureReportWritePath": TOOL._capture_path(report),
            }
            report.write_text(json.dumps(capture), encoding="utf-8")
            action_receipt = {
                "mapId": "earth_vein_cave",
                "actionKind": "pointer",
                "result": "PASS",
                "screenshotSha256": TOOL._sha256(screenshot),
                "captureReportSha256": TOOL._sha256(report),
                "windowIdentity": {
                    "rootWindowId": 0,
                    "before": self._window_checkpoint("before"),
                    "after": self._window_checkpoint("after"),
                },
            }
            receipt = {
                "scene": "res://scenes/Main.tscn",
                "bundleId": "earth_vein_cave_visual_v1",
                "planSha256": plan_sha,
                **freeze,
                "runtimeIdentity": runtime_identity,
                "actions": [action_receipt],
            }
            log = action_run / "godot.log"
            log.write_text(
                TOOL.BATCH_LOG_PREFIX + json.dumps(receipt) + "\n",
                encoding="utf-8",
            )
            TOOL._validate_action_run_binding(
                action_run,
                map_id="earth_vein_cave",
                action_kind="pointer",
                screenshot=screenshot,
                report=report,
                capture=capture,
            )
            receipt["actions"][0]["mapId"] = "earth_vein_cave_f2"
            log.write_text(
                TOOL.BATCH_LOG_PREFIX + json.dumps(receipt) + "\n",
                encoding="utf-8",
            )
            with self.assertRaises(TOOL.MapActionCaptureError):
                TOOL._validate_action_run_binding(
                    action_run,
                    map_id="earth_vein_cave",
                    action_kind="pointer",
                    screenshot=screenshot,
                    report=report,
                    capture=capture,
                )
            receipt["actions"][0]["mapId"] = "earth_vein_cave"
            log.write_text(
                TOOL.BATCH_LOG_PREFIX + json.dumps(receipt) + "\n",
                encoding="utf-8",
            )
            capture["batchSourceIdentity"] = {}
            with self.assertRaises(TOOL.MapActionCaptureError):
                TOOL._validate_action_run_binding(
                    action_run,
                    map_id="earth_vein_cave",
                    action_kind="pointer",
                    screenshot=screenshot,
                    report=report,
                    capture=capture,
                )

    def test_preinstall_freeze_rejects_promotion_or_identity_drift(self) -> None:
        build_identity = (
            "git:" + "1" * 40
            + "+beastbound-map-runtime-surface-v2:" + "2" * 64
        )
        frozen = {
            "bundleManifestIdentity": {"sha256": "a" * 64},
            "buildIdentity": build_identity,
            "captureSurfaceIdentity": {"x": "c" * 64},
            "captureSurfaceIdentitySha256": "d" * 64,
            "sourceIdentity": {"entrypoint": {"sha256": "e" * 64}},
        }
        with (
            mock.patch.object(TOOL, "_validate_pending_replacement") as lifecycle,
            mock.patch.object(TOOL, "_batch_freeze", return_value=frozen),
        ):
            TOOL._validate_preinstall_freeze(
                Path("manifest.json"),
                bundle_id="earth_vein_cave_visual_v1",
                plan=frozen,
                receipt=frozen,
            )
            lifecycle.assert_called_once()
            drifted = dict(frozen)
            drifted["buildIdentity"] = (
                "git:" + "3" * 40
                + "+beastbound-map-runtime-surface-v2:" + "4" * 64
            )
            with self.assertRaises(TOOL.MapActionCaptureError):
                TOOL._validate_preinstall_freeze(
                    Path("manifest.json"),
                    bundle_id="earth_vein_cave_visual_v1",
                    plan=frozen,
                    receipt=drifted,
                )
            missing_source = dict(frozen)
            missing_source["sourceIdentity"] = {}
            with self.assertRaises(TOOL.MapActionCaptureError):
                TOOL._validate_preinstall_freeze(
                    Path("manifest.json"),
                    bundle_id="earth_vein_cave_visual_v1",
                    plan=missing_source,
                    receipt=frozen,
                )

    def test_same_map_duplicate_action_png_fails_before_install(self) -> None:
        TOOL.REPO_ROOT.joinpath(".run").mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(dir=TOOL.REPO_ROOT / ".run") as temp:
            root = Path(temp)
            paths = {}
            for index, action_kind in enumerate(TOOL.ACTION_KINDS):
                path = root / f"{action_kind}.png"
                path.write_bytes(f"png-{index}".encode())
                paths[("map_a", action_kind)] = path
            TOOL._validate_same_map_action_png_uniqueness(
                paths,
                map_ids=["map_a"],
            )
            paths[("map_a", "occlusion")].write_bytes(
                paths[("map_a", "pointer")].read_bytes()
            )
            with self.assertRaises(TOOL.MapActionCaptureError):
                TOOL._validate_same_map_action_png_uniqueness(
                    paths,
                    map_ids=["map_a"],
                )

    def test_fully_reused_resume_rejects_duplicate_same_map_action_pngs(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory(dir=TOOL.REPO_ROOT / ".run") as temp:
            root = Path(temp)
            targets = []
            for index, action_kind in enumerate(TOOL.ACTION_KINDS):
                screenshot = root / f"{action_kind}.png"
                report = root / f"{action_kind}-capture.json"
                screenshot.write_bytes(f"png-{index}".encode())
                report.write_text("{}", encoding="utf-8")
                targets.append((
                    "map_a",
                    action_kind,
                    TOOL.ACTION_MODES[action_kind],
                    screenshot,
                    report,
                    "reuse",
                ))
            targets[-1][3].write_bytes(targets[0][3].read_bytes())
            with self.assertRaises(TOOL.MapActionCaptureError):
                TOOL._validate_final_action_png_uniqueness(
                    targets,
                    map_ids=["map_a"],
                )

    def test_resume_window_summary_aggregates_distinct_batches_truthfully(self) -> None:
        def record(plan: str, process_id: int, root_window_id: int) -> dict:
            checkpoint = self._window_checkpoint("checkpoint", root_window_id)
            return {
                "batchBinding": {
                    "planSha256": plan,
                    "runtimeIdentity": {
                        "processId": process_id,
                        "displayServerWindowCount": 1,
                        "rootWindowId": root_window_id,
                    },
                    "windowIdentity": {
                        "rootWindowId": root_window_id,
                        "before": checkpoint,
                        "after": checkpoint,
                    },
                },
                "qaLane": {
                    "cleanup": {"status": "cleaned"},
                    "postCleanupInspect": {"status": "inspected"},
                    "nativeProcess": {
                        "exitCode": 0,
                        "leaderReaped": True,
                        "processGroupClosed": True,
                        "processGroupResidualObserved": False,
                    },
                },
            }

        evidence = TOOL._aggregate_window_evidence([
            record("a" * 64, 10, 0),
            record("b" * 64, 11, 0),
        ])
        self.assertEqual(evidence["godotProcessCount"], 2)
        self.assertEqual(evidence["userVisibleWindowOpenCount"], 2)
        self.assertEqual(evidence["userVisibleWindowCloseCount"], 2)
        self.assertFalse(evidence["singlePersistentWindow"])

    def test_no_progress_watchdog_times_out_a_stalled_batch(self) -> None:
        class FakeProcess:
            args = ["godot"]
            pid = 123

            def wait(self, timeout=None):
                raise TOOL.subprocess.TimeoutExpired(self.args, timeout)

        with tempfile.TemporaryDirectory() as temp:
            log = Path(temp) / "godot.log"
            log.write_text("$ godot\n", encoding="utf-8")
            process = TOOL._ProgressWatchdogProcess(
                FakeProcess(),
                log_path=log,
                no_progress_timeout=0.01,
                bundle_id="earth_vein_cave_visual_v1",
                plan_sha256="a" * 64,
                action_count=20,
            )
            with self.assertRaises(TOOL.subprocess.TimeoutExpired):
                process.wait(timeout=0.1)

    def test_durable_formal_transaction_restores_after_interruption(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            repository_root = Path(temp)
            (
                bundle_id,
                run_root,
                staging_root,
                install_root,
                staged_targets,
                installs,
                formal_targets,
                old_bytes,
            ) = self._formal_transaction_fixture(
                repository_root,
                had_old=True,
            )
            with (
                mock.patch.object(TOOL, "REPO_ROOT", repository_root),
                mock.patch.object(
                    TOOL,
                    "_guard_repo_path",
                    side_effect=self._fake_transaction_guard,
                ),
            ):
                journal_path, journal, _backups = TOOL._begin_formal_transaction(
                    bundle_id=bundle_id,
                    run_root=run_root,
                    staging_root=staging_root,
                    install_root=install_root,
                    staged_targets=staged_targets,
                    install_targets=installs,
                    formal_targets=formal_targets,
                )
                self.assertEqual(len(journal["entries"]), 40)
                TOOL._install_formal_transaction(journal_path, journal)
                TOOL._recover_formal_transaction(journal_path)
                for destination, payload in old_bytes.items():
                    self.assertEqual(destination.read_bytes(), payload)
                self.assertEqual(
                    json.loads(journal_path.read_text())["status"],
                    "rolled_back",
                )

    def test_recovery_no_old_dual_names_removes_formal_destination(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            repository_root = Path(temp)
            (
                bundle_id,
                run_root,
                staging_root,
                install_root,
                staged_targets,
                installs,
                formal_targets,
                _old_bytes,
            ) = self._formal_transaction_fixture(
                repository_root,
                had_old=False,
            )
            with (
                mock.patch.object(TOOL, "REPO_ROOT", repository_root),
                mock.patch.object(
                    TOOL,
                    "_guard_repo_path",
                    side_effect=self._fake_transaction_guard,
                ),
            ):
                journal_path, journal, _backups = TOOL._begin_formal_transaction(
                    bundle_id=bundle_id,
                    run_root=run_root,
                    staging_root=staging_root,
                    install_root=install_root,
                    staged_targets=staged_targets,
                    install_targets=installs,
                    formal_targets=formal_targets,
                )
                first = journal["entries"][0]
                staged = Path(first["staged"])
                destination = Path(first["destination"])
                destination.parent.mkdir(parents=True, exist_ok=True)
                destination.write_bytes(staged.read_bytes())
                journal["status"] = "installing"
                first["state"] = "installing"
                TOOL._write_durable_json(journal_path, journal)

                TOOL._recover_formal_transaction(journal_path)

                self.assertFalse(destination.exists())
                self.assertEqual(
                    TOOL._sha256(staged),
                    first["stagedSha256"],
                )
                self.assertEqual(
                    json.loads(journal_path.read_text())["status"],
                    "rolled_back",
                )

    def test_recovery_rejects_unknown_old_destination_before_any_mutation(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temp:
            repository_root = Path(temp)
            fixture = self._formal_transaction_fixture(
                repository_root,
                had_old=True,
            )
            (
                bundle_id,
                run_root,
                staging_root,
                install_root,
                staged_targets,
                installs,
                formal_targets,
                old_bytes,
            ) = fixture
            with (
                mock.patch.object(TOOL, "REPO_ROOT", repository_root),
                mock.patch.object(
                    TOOL,
                    "_guard_repo_path",
                    side_effect=self._fake_transaction_guard,
                ),
            ):
                journal_path, journal, _backups = TOOL._begin_formal_transaction(
                    bundle_id=bundle_id,
                    run_root=run_root,
                    staging_root=staging_root,
                    install_root=install_root,
                    staged_targets=staged_targets,
                    install_targets=installs,
                    formal_targets=formal_targets,
                )
                bad_destination = Path(journal["entries"][-1]["destination"])
                bad_destination.write_bytes(b"unknown-concurrent-bytes")
                first_backup = Path(journal["entries"][0]["backup"])
                first_backup_before = first_backup.read_bytes()

                with self.assertRaises(TOOL.MapActionCaptureError):
                    TOOL._recover_formal_transaction(journal_path)

                self.assertEqual(first_backup.read_bytes(), first_backup_before)
                first_destination = Path(journal["entries"][0]["destination"])
                self.assertEqual(
                    first_destination.read_bytes(),
                    old_bytes[first_destination],
                )
                self.assertEqual(
                    json.loads(journal_path.read_text())["status"],
                    "prepared",
                )

    def test_recovery_cleans_partial_backup_and_random_temporary_copy(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temp:
            repository_root = Path(temp)
            (
                bundle_id,
                run_root,
                staging_root,
                install_root,
                staged_targets,
                installs,
                formal_targets,
                old_bytes,
            ) = self._formal_transaction_fixture(
                repository_root,
                had_old=True,
            )
            with (
                mock.patch.object(TOOL, "REPO_ROOT", repository_root),
                mock.patch.object(
                    TOOL,
                    "_guard_repo_path",
                    side_effect=self._fake_transaction_guard,
                ),
            ):
                journal_path, journal, _backups = TOOL._begin_formal_transaction(
                    bundle_id=bundle_id,
                    run_root=run_root,
                    staging_root=staging_root,
                    install_root=install_root,
                    staged_targets=staged_targets,
                    install_targets=installs,
                    formal_targets=formal_targets,
                )
                first = journal["entries"][0]
                backup = Path(first["backup"])
                backup.write_bytes(b"partial-final-backup")
                temporary = backup.parent / (
                    f".{backup.name}.{'f' * 32}.backup.tmp"
                )
                temporary.write_bytes(b"partial-temporary-backup")
                journal["status"] = "preparing_backups"
                first["state"] = "planned"
                TOOL._write_durable_json(journal_path, journal)

                TOOL._recover_formal_transaction(journal_path)

                self.assertFalse(backup.exists())
                self.assertFalse(temporary.exists())
                self.assertEqual(
                    json.loads(journal_path.read_text())["status"],
                    "rolled_back",
                )
                for destination, payload in old_bytes.items():
                    self.assertEqual(destination.read_bytes(), payload)

    def test_pending_summary_rejects_extra_missing_and_wrong_type_fields(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temp:
            repository_root = Path(temp)
            (
                bundle_id,
                run_root,
                staging_root,
                install_root,
                staged_targets,
                installs,
                formal_targets,
                _old_bytes,
            ) = self._formal_transaction_fixture(
                repository_root,
                had_old=False,
            )
            with (
                mock.patch.object(TOOL, "REPO_ROOT", repository_root),
                mock.patch.object(
                    TOOL,
                    "_guard_repo_path",
                    side_effect=self._fake_transaction_guard,
                ),
            ):
                journal_path, journal, _backups = TOOL._begin_formal_transaction(
                    bundle_id=bundle_id,
                    run_root=run_root,
                    staging_root=staging_root,
                    install_root=install_root,
                    staged_targets=staged_targets,
                    install_targets=installs,
                    formal_targets=formal_targets,
                )
                TOOL._install_formal_transaction(journal_path, journal)
                valid = self._valid_formal_summary(journal)
                pending = run_root / "capture-matrix.pending.json"
                TOOL._write_durable_json(pending, valid)
                TOOL._validate_summary_against_transaction(pending, journal)

                mutations = []
                extra_root = copy.deepcopy(valid)
                extra_root["unexpected"] = True
                mutations.append(extra_root)
                missing_record = copy.deepcopy(valid)
                del missing_record["records"][0]["captureResult"]
                mutations.append(missing_record)
                extra_artifact = copy.deepcopy(valid)
                extra_artifact["records"][0]["screenshot"]["legacy"] = True
                mutations.append(extra_artifact)
                wrong_type = copy.deepcopy(valid)
                wrong_type["schemaVersion"] = True
                mutations.append(wrong_type)

                for mutation in mutations:
                    with self.subTest(keys=sorted(mutation)):
                        TOOL._write_durable_json(pending, mutation)
                        with self.assertRaises(TOOL.MapActionCaptureError):
                            TOOL._validate_summary_against_transaction(
                                pending,
                                journal,
                            )

    def test_committed_recovery_requires_bound_summary_and_formal_hashes(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temp:
            repository_root = Path(temp)
            (
                bundle_id,
                run_root,
                staging_root,
                install_root,
                staged_targets,
                installs,
                formal_targets,
                _old_bytes,
            ) = self._formal_transaction_fixture(
                repository_root,
                had_old=False,
            )
            with (
                mock.patch.object(TOOL, "REPO_ROOT", repository_root),
                mock.patch.object(
                    TOOL,
                    "_guard_repo_path",
                    side_effect=self._fake_transaction_guard,
                ),
            ):
                journal_path, journal, _backups = TOOL._begin_formal_transaction(
                    bundle_id=bundle_id,
                    run_root=run_root,
                    staging_root=staging_root,
                    install_root=install_root,
                    staged_targets=staged_targets,
                    install_targets=installs,
                    formal_targets=formal_targets,
                )
                TOOL._install_formal_transaction(journal_path, journal)
                summary = self._valid_formal_summary(journal)
                pending = run_root / "capture-matrix.pending.json"
                TOOL._write_durable_json(pending, summary)
                TOOL._commit_formal_transaction(journal_path, pending)
                committed = json.loads(journal_path.read_text())
                self.assertEqual(
                    len(committed["summaryBinding"]["entrySet"]),
                    40,
                )

                TOOL._recover_formal_transaction(journal_path)

                final = run_root / "capture-matrix.json"
                self.assertTrue(final.is_file())
                self.assertFalse(pending.exists())
                self.assertEqual(json.loads(final.read_text())["result"], "PASS")

                first_destination = Path(
                    committed["entries"][0]["destination"]
                )
                first_destination.write_bytes(b"drifted-after-commit")
                with self.assertRaises(TOOL.MapActionCaptureError):
                    TOOL._recover_formal_transaction(journal_path)

    def _finish_history_fixture(self, root: Path, run_root: Path, outcome: str) -> Path:
        existing = root / "client/godot/assets/maps/earth_vein_cave_visual_v1/evidence/runtime-actions"
        bundle, run, staging, install, targets, installs, formal, _old = self._formal_transaction_fixture(
            root, had_old=existing.exists(), run_root=run_root, staged_prefix=run_root.name,
        )
        journal_path, journal, _backups = TOOL._begin_formal_transaction(
            bundle_id=bundle, run_root=run, staging_root=staging,
            install_root=install, staged_targets=targets,
            install_targets=installs, formal_targets=formal,
        )
        TOOL._install_formal_transaction(journal_path, journal)
        if outcome == "rolled_back":
            TOOL._recover_formal_transaction(journal_path)
            return journal_path
        pending = run / "capture-matrix.pending.json"
        TOOL._write_durable_json(pending, self._valid_formal_summary(journal))
        TOOL._commit_formal_transaction(journal_path, pending)
        if outcome == "published":
            TOOL._publish_committed_summary(journal_path)
        return journal_path

    def test_recovery_preserves_completed_history_after_a_later_replacement(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            bundle = "earth_vein_cave_visual_v1"
            base = root / TOOL.DEFAULT_RUN_ROOT / bundle
            guard = TOOL._guard_repo_path
            with (
                mock.patch.object(TOOL, "REPO_ROOT", root),
                mock.patch.object(TOOL, "_guard_repo_path", side_effect=lambda path, **kw: guard(path, **{**kw, "anchor": root})),
                mock.patch.object(TOOL, "_process_start_identity", return_value="f" * 64),
            ):
                first = self._finish_history_fixture(root, base / "first", "published")
                self._finish_history_fixture(root, base / "rollback", "rolled_back")
                self._finish_history_fixture(root, base / "second", "published")
                before = {p: p.read_bytes() for p in root.rglob("*") if p.is_file()}
                with TOOL._bundle_recorder_lock(base, bundle_id=bundle) as lock:
                    TOOL._recover_incomplete_formal_transactions(base, bundle_lock=lock)
                self.assertEqual(before, {p: p.read_bytes() for p in root.rglob("*") if p.is_file()})
                # Explicit verification of the obsolete installed set remains
                # strict; the history scan is not evidence of current validity.
                with self.assertRaises(TOOL.MapActionCaptureError):
                    TOOL._recover_formal_transaction(first)

    def test_history_scan_rejects_corrupt_or_ambiguous_completion(self) -> None:
        for mutation in ("summary_bytes", "summary_symlink", "missing_summary", "dual_summary", "rollback_state", "run_symlink"):
            with self.subTest(mutation=mutation), tempfile.TemporaryDirectory() as temp:
                root = Path(temp)
                bundle = "earth_vein_cave_visual_v1"
                base = root / TOOL.DEFAULT_RUN_ROOT / bundle
                guard = TOOL._guard_repo_path
                with (
                    mock.patch.object(TOOL, "REPO_ROOT", root),
                    mock.patch.object(TOOL, "_guard_repo_path", side_effect=lambda path, **kw: guard(path, **{**kw, "anchor": root})),
                    mock.patch.object(TOOL, "_process_start_identity", return_value="f" * 64),
                ):
                    outcome = "rolled_back" if mutation == "rollback_state" else "published"
                    journal = self._finish_history_fixture(root, base / "capture", outcome)
                    final = journal.parent / "capture-matrix.json"
                    if mutation == "summary_bytes":
                        final.write_bytes(final.read_bytes() + b"\n")
                    elif mutation == "summary_symlink":
                        target = final.with_suffix(".saved")
                        final.rename(target)
                        final.symlink_to(target)
                    elif mutation == "missing_summary":
                        final.unlink()
                    elif mutation == "dual_summary":
                        (journal.parent / "capture-matrix.pending.json").write_bytes(final.read_bytes())
                    elif mutation == "run_symlink":
                        relocated = root / "relocated-history"
                        journal.parent.rename(relocated)
                        journal.parent.symlink_to(relocated, target_is_directory=True)
                    else:
                        payload = json.loads(journal.read_text())
                        payload["entries"][0]["state"] = "installed"
                        TOOL._write_durable_json(journal, payload)
                    before = {p: p.read_bytes() for p in root.rglob("*") if p.is_file() and not p.is_symlink()}
                    with TOOL._bundle_recorder_lock(base, bundle_id=bundle) as lock:
                        with self.assertRaises(TOOL.MapActionCaptureError):
                            TOOL._recover_incomplete_formal_transactions(base, bundle_lock=lock)
                    self.assertEqual(before, {p: p.read_bytes() for p in root.rglob("*") if p.is_file() and not p.is_symlink()})

    def test_history_scan_finishes_an_unpublished_commit_strictly(self) -> None:
        for drift in (False, True):
            with self.subTest(drift=drift), tempfile.TemporaryDirectory() as temp:
                root = Path(temp)
                bundle = "earth_vein_cave_visual_v1"
                base = root / TOOL.DEFAULT_RUN_ROOT / bundle
                guard = TOOL._guard_repo_path
                with (
                    mock.patch.object(TOOL, "REPO_ROOT", root),
                    mock.patch.object(TOOL, "_guard_repo_path", side_effect=lambda path, **kw: guard(path, **{**kw, "anchor": root})),
                    mock.patch.object(TOOL, "_process_start_identity", return_value="f" * 64),
                ):
                    journal = self._finish_history_fixture(root, base / "capture", "pending")
                    pending = journal.parent / "capture-matrix.pending.json"
                    if drift:
                        destination = Path(json.loads(journal.read_text())["entries"][0]["destination"])
                        destination.write_bytes(b"unknown modification")
                    with TOOL._bundle_recorder_lock(base, bundle_id=bundle) as lock:
                        if drift:
                            with self.assertRaises(TOOL.MapActionCaptureError):
                                TOOL._recover_incomplete_formal_transactions(base, bundle_lock=lock)
                            self.assertTrue(pending.is_file())
                            self.assertFalse((journal.parent / "capture-matrix.json").exists())
                        else:
                            TOOL._recover_incomplete_formal_transactions(base, bundle_lock=lock)
                            self.assertFalse(pending.exists())
                            self.assertTrue((journal.parent / "capture-matrix.json").is_file())

if __name__ == "__main__":
    unittest.main()
