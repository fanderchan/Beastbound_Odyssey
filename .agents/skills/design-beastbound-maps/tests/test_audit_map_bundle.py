from __future__ import annotations

import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest import mock


SCRIPT_PATH = Path(__file__).resolve().parents[1] / "scripts" / "audit_map_bundle.py"
SPEC = importlib.util.spec_from_file_location("audit_map_bundle", SCRIPT_PATH)
assert SPEC is not None and SPEC.loader is not None
AUDITOR = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = AUDITOR
SPEC.loader.exec_module(AUDITOR)

BUILDER_PATH = Path(__file__).resolve().parents[4] / "tools/map_visual_evidence_builder.py"
BUILDER_SPEC = importlib.util.spec_from_file_location(
    "map_visual_evidence_builder_for_auditor_tests",
    BUILDER_PATH,
)
assert BUILDER_SPEC is not None and BUILDER_SPEC.loader is not None
BUILDER = importlib.util.module_from_spec(BUILDER_SPEC)
sys.modules[BUILDER_SPEC.name] = BUILDER
BUILDER_SPEC.loader.exec_module(BUILDER)


def sample_manifest() -> dict:
    return {
        "schemaVersion": 1,
        "bundleId": "solo_map_visual_v1",
        "mapStyleId": "solo_style_v1",
        "mapIds": ["solo_map"],
        "status": "owner_review_pending",
        "ownerReviewStatus": "pending",
        "releaseApproved": False,
        "runtimeEnabled": False,
        "tileSize": [80, 40],
        "catalogContractCheck": {
            "path": "evidence/catalog.json",
            "sha256": "1" * 64,
        },
        "source": {
            "origin": "AI-generated original",
            "owner": "Beastbound Odyssey project",
            "licenseBasis": "project-owned generated output",
        },
        "groundAtlas": {
            "path": "runtime/ground/atlas.png",
            "sha256": "2" * 64,
            "dimensions": [80, 40],
            "alphaMode": "mixed",
        },
        "tiles": [
            {"tileId": "grass", "rect": [0, 0, 80, 40], "role": "ground"}
        ],
        "objects": [],
        "mapBindings": [
            {
                "mapId": "solo_map",
                "binding": {
                    "path": "bindings/solo_map.json",
                    "sha256": "3" * 64,
                },
            }
        ],
        "evidence": {
            "dressedReference": {
                "path": "evidence/dressed.png",
                "sha256": "4" * 64,
            },
            "runtimeScreenshots": [],
            "ownerAcceptance": None,
        },
    }


def release_attestation(manifest: dict) -> dict:
    summaries = AUDITOR.release_summary_hashes(manifest)
    return {
        "schemaVersion": 1,
        "attestationType": AUDITOR.RELEASE_ATTESTATION_TYPE,
        "status": AUDITOR.RELEASE_ATTESTATION_STATUS,
        "bundleId": manifest["bundleId"],
        "mapStyleId": manifest["mapStyleId"],
        "mapIds": manifest["mapIds"],
        "manifest": {
            "path": AUDITOR.MANIFEST_NAME,
            "summarySha256": summaries["manifestSha256"],
        },
        "lifecycle": {
            "status": "released",
            "ownerReviewStatus": "approved",
            "releaseApproved": True,
            "runtimeEnabled": True,
        },
        "offlineAudit": {
            "status": "PASS",
            "releaseReady": True,
            "missingReleaseGates": [],
        },
        "summaries": {
            "evidenceSha256": summaries["evidenceSha256"],
            "assetSha256": summaries["assetSha256"],
            "bundleSha256": summaries["bundleSha256"],
        },
    }


class RuntimeScreenshotCoverageTests(unittest.TestCase):
    def test_three_unique_pairs_on_one_map_do_not_collapse_by_mode(self) -> None:
        coverage = {("solo_map", "idle"), ("solo_map", "moving")}
        self.assertTrue(
            AUDITOR.runtime_screenshot_coverage_complete(
                3,
                coverage,
                {"solo_map"},
            )
        )
        self.assertFalse(
            AUDITOR.runtime_screenshot_coverage_complete(
                2,
                coverage,
                {"solo_map"},
            )
        )

    def test_coverage_still_requires_every_map_and_idle_moving(self) -> None:
        self.assertFalse(
            AUDITOR.runtime_screenshot_coverage_complete(
                5,
                {("solo_map", "moving")},
                {"solo_map"},
            )
        )
        self.assertFalse(
            AUDITOR.runtime_screenshot_coverage_complete(
                5,
                {("solo_map", "idle"), ("solo_map", "moving")},
                {"solo_map", "second_map"},
            )
        )

    def test_same_map_action_screenshots_must_not_share_pixel_hash(self) -> None:
        digest = "a" * 64
        screenshots = [
            {"mapId": "solo_map", "image": {"sha256": digest}},
            {"mapId": "solo_map", "image": {"sha256": digest}},
            {"mapId": "second_map", "image": {"sha256": digest}},
        ]
        self.assertEqual(
            {("solo_map", digest)},
            AUDITOR.duplicate_runtime_screenshot_hashes(screenshots),
        )


class CapturePreviewAuthorizationTests(unittest.TestCase):
    BUNDLE_ID = "earth_vein_cave_visual_v1"
    MAP_IDS = (
        "earth_vein_cave",
        "earth_vein_cave_f2",
        "earth_vein_cave_f3",
        "earth_vein_cave_f4",
    )
    BUILD_IDENTITY = BUILDER.build_identity()

    def _audit(self) -> AUDITOR.Audit:
        root = (
            AUDITOR.REPOSITORY_ROOT
            / "client/godot/assets/maps"
            / self.BUNDLE_ID
        )
        return AUDITOR.Audit(root / AUDITOR.MANIFEST_NAME, root)

    @staticmethod
    def _checkpoint(label: str) -> dict:
        return {
            "label": label,
            "processFrame": 10,
            "windowCount": 1,
            "windowIds": [0],
            "rootWindowId": 0,
        }

    def _batch_capture(self, audit: AUDITOR.Audit) -> dict:
        surface = AUDITOR._batch_capture_surface_identity(
            self.BUNDLE_ID,
            self.MAP_IDS,
        )
        surface_sha = AUDITOR._canonical_object_sha256(surface)
        manifest = json.loads(audit.manifest_path.read_text(encoding="utf-8"))
        manifest_sha = AUDITOR._canonical_object_sha256({
            key: manifest.get(key)
            for key in AUDITOR.BATCH_MANIFEST_RUNTIME_SUBJECT_KEYS
        })
        return {
            "captureVariant": "pointer",
            "qaPreviewFlagPresent": False,
            "qaPreviewMapId": "",
            "batchPlanSha256": "a" * 64,
            "batchBuildIdentity": self.BUILD_IDENTITY,
            "batchBundleManifestIdentity": {
                "path": (
                    "client/godot/assets/maps/earth_vein_cave_visual_v1/"
                    "map-visual-bundle.json"
                ),
                "canonicalization": "map_runtime_subject_v1",
                "sha256": manifest_sha,
            },
            "batchCaptureSurfaceIdentity": surface,
            "batchCaptureSurfaceIdentitySha256": surface_sha,
            "batchSourceIdentity": AUDITOR._batch_source_identity(),
            "batchRuntimeIdentity": {
                "processId": 123,
                "displayServerWindowCount": 1,
                "displayServerWindowIds": [0],
                "rootWindowId": 0,
                "audioDriver": "Dummy",
                "mainSceneLoadCount": 1,
                "mainSceneInstanceCount": 1,
                "viewport": [1280, 720],
            },
            "batchWindowIdentity": {
                "rootWindowId": 0,
                "before": self._checkpoint("before"),
                "after": self._checkpoint("after"),
            },
            "batchReportSealed": True,
            "qaPreviewAuthorization": {
                "kind": "sha256_bound_batch_plan",
                "authorized": True,
                "cliPreviewFlagPresent": False,
                "controllerActivatedCandidatePreview": True,
                "planSha256": "a" * 64,
                "bundleId": self.BUNDLE_ID,
                "mapId": "earth_vein_cave",
                "actionKind": "pointer",
                "buildIdentity": self.BUILD_IDENTITY,
                "bundleManifestSha256": manifest_sha,
                "captureSurfaceIdentitySha256": surface_sha,
            },
        }

    def test_legacy_and_strict_batch_preview_contracts_both_pass(self) -> None:
        legacy_audit = self._audit()
        AUDITOR._validate_capture_preview_authorization(
            legacy_audit,
            {
                "qaPreviewFlagPresent": True,
                "qaPreviewMapId": "earth_vein_cave",
            },
            "capture",
            bundle_id=self.BUNDLE_ID,
            map_id="earth_vein_cave",
            map_ids=self.MAP_IDS,
        )
        self.assertEqual([], legacy_audit.errors)

        batch_audit = self._audit()
        AUDITOR._validate_capture_preview_authorization(
            batch_audit,
            self._batch_capture(batch_audit),
            "capture",
            bundle_id=self.BUNDLE_ID,
            map_id="earth_vein_cave",
            map_ids=self.MAP_IDS,
        )
        self.assertEqual([], batch_audit.errors)

    def test_preview_downgrade_and_surface_tamper_fail_closed(self) -> None:
        legacy_audit = self._audit()
        AUDITOR._validate_capture_preview_authorization(
            legacy_audit,
            {
                "qaPreviewFlagPresent": True,
                "qaPreviewMapId": "earth_vein_cave",
                "batchReportSealed": True,
            },
            "capture",
            bundle_id=self.BUNDLE_ID,
            map_id="earth_vein_cave",
            map_ids=self.MAP_IDS,
        )
        self.assertTrue(any("batch-only" in error for error in legacy_audit.errors))

        batch_audit = self._audit()
        capture = self._batch_capture(batch_audit)
        capture["batchCaptureSurfaceIdentity"] = {}
        AUDITOR._validate_capture_preview_authorization(
            batch_audit,
            capture,
            "capture",
            bundle_id=self.BUNDLE_ID,
            map_id="earth_vein_cave",
            map_ids=self.MAP_IDS,
        )
        self.assertTrue(any(
            "batchCaptureSurfaceIdentity" in error
            for error in batch_audit.errors
        ))

    def test_batch_build_identity_rejects_malformed_and_current_build_drift(
        self,
    ) -> None:
        malformed_audit = self._audit()
        malformed = self._batch_capture(malformed_audit)
        malformed["batchBuildIdentity"] = "b" * 64
        malformed["qaPreviewAuthorization"]["buildIdentity"] = "b" * 64
        AUDITOR._validate_capture_preview_authorization(
            malformed_audit,
            malformed,
            "capture",
            bundle_id=self.BUNDLE_ID,
            map_id="earth_vein_cave",
            map_ids=self.MAP_IDS,
        )
        self.assertTrue(any(
            "git:<40hex>+beastbound-map-runtime-surface-v2:<64hex>" in error
            for error in malformed_audit.errors
        ))

        drift_audit = self._audit()
        drifted = self._batch_capture(drift_audit)
        replacement = "0" if self.BUILD_IDENTITY[-1] != "0" else "1"
        drifted_identity = self.BUILD_IDENTITY[:-1] + replacement
        drifted["batchBuildIdentity"] = drifted_identity
        drifted["qaPreviewAuthorization"]["buildIdentity"] = drifted_identity
        AUDITOR._validate_capture_preview_authorization(
            drift_audit,
            drifted,
            "capture",
            bundle_id=self.BUNDLE_ID,
            map_id="earth_vein_cave",
            map_ids=self.MAP_IDS,
        )
        self.assertTrue(any(
            "must equal the current map_visual_evidence_builder build identity"
            in error
            for error in drift_audit.errors
        ))

    def test_batch_source_identity_rejects_missing_extra_and_byte_drift(
        self,
    ) -> None:
        for mutation in ("missing", "extra", "drift"):
            audit = self._audit()
            capture = self._batch_capture(audit)
            source_identity = copy.deepcopy(capture["batchSourceIdentity"])
            if mutation == "missing":
                source_identity.pop("evidenceBuilder")
            elif mutation == "extra":
                source_identity["untrackedHelper"] = {
                    "path": "repo://tools/untracked.py",
                    "sha256": "f" * 64,
                }
            else:
                source_identity["evidenceBuilder"]["sha256"] = "f" * 64
            capture["batchSourceIdentity"] = source_identity
            AUDITOR._validate_capture_preview_authorization(
                audit,
                capture,
                "capture",
                bundle_id=self.BUNDLE_ID,
                map_id="earth_vein_cave",
                map_ids=self.MAP_IDS,
            )
            self.assertTrue(any(
                "batchSourceIdentity" in error for error in audit.errors
            ))


class CollisionCommandContractTests(unittest.TestCase):
    def test_strict_and_read_only_pending_preview_are_the_only_commands(self) -> None:
        self.assertEqual(
            {
                AUDITOR.COLLISION_COMMAND,
                AUDITOR.COLLISION_PREVIEW_COMMAND,
            },
            AUDITOR.VALID_COLLISION_COMMANDS,
        )
        self.assertNotIn(
            AUDITOR.COLLISION_COMMAND + " --generate-map-visual-catalog-contract",
            AUDITOR.VALID_COLLISION_COMMANDS,
        )


class PerformanceSampleContractTests(unittest.TestCase):
    @staticmethod
    def _moving_sample() -> dict:
        return {
            "samples": 2,
            "fpsMinMeanMax": [60.0, 60.0, 60.0],
            "processTotalMsMinMeanMax": [0.2, 0.3, 0.4],
            "drawWorldMsMinMeanMax": [0.0, 0.1, 0.2],
            "clicks": 12,
            "accepted": 12,
            "resolved": 3,
            "applied": 2,
            "avgInputUs": 1,
            "maxInputUs": 2,
            "moved": True,
            "coalesced": True,
            "settled": True,
            "finalTargetMatched": True,
            "battle": False,
            "encounter": False,
        }

    def _audit(self, sample: dict) -> AUDITOR.Audit:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            audit = AUDITOR.Audit(root / AUDITOR.MANIFEST_NAME, root)
            AUDITOR._validate_performance_sample(
                audit,
                sample,
                "performance.moving",
                moving=True,
            )
            return audit

    def test_resolved_target_may_be_superseded_before_path_apply(self) -> None:
        self.assertEqual([], self._audit(self._moving_sample()).errors)

    def test_path_apply_without_resolved_target_fails_closed(self) -> None:
        sample = self._moving_sample()
        sample["applied"] = 4
        self.assertTrue(
            any("applied: must be <= resolved" in error for error in self._audit(sample).errors)
        )

    def test_click_burst_must_collapse_before_accepted_count(self) -> None:
        sample = self._moving_sample()
        sample["resolved"] = sample["accepted"]
        self.assertTrue(
            any("resolved: must be < accepted" in error for error in self._audit(sample).errors)
        )


TEST_PERFORMANCE_BUNDLE_ID = "test_perf_visual_v1"
TEST_PERFORMANCE_MAP_ID = "test_perf_map"


def _repeated_runtime_identity(map_id: str, variant: str) -> dict:
    candidate = variant == "candidate"
    return {
        "candidateEnabled": candidate,
        "displayServer": "macOS",
        "engineVersion": BUILDER.RUNTIME_ENGINE_VERSION,
        "engineVersionHash": BUILDER.RUNNER_VERSION.rsplit(".", 1)[1],
        "mapId": map_id,
        "mapVisualActive": candidate,
        "mapVisualBundleId": TEST_PERFORMANCE_BUNDLE_ID if candidate else "",
        "mapVisualCatalogSource": "review" if candidate else "",
        "mapVisualMapId": map_id if candidate else "",
        "mapVisualQaPreview": candidate,
        "mapVisualReviewCandidate": candidate,
        "mapVisualStatus": "owner_review_pending" if candidate else "",
        "processScopeMonitor": "process_priority_boundary_v1",
        "processScopePriorities": [-1000000, 1000000],
        "processScopeReady": True,
        "renderingDriver": "metal",
        "renderingMethod": "mobile",
        "sampleFrames": BUILDER.PERF_SAMPLE_FRAMES,
        "status": "passed",
        "videoAdapterName": "Unit Test GPU",
        "viewportSize": [1280, 720],
        "vsyncMode": 0,
    }


def _released_runtime_identity(map_id: str, variant: str) -> dict:
    runtime = _repeated_runtime_identity(map_id, variant)
    runtime.update(
        {
            "mapVisualActive": True,
            "mapVisualBundleId": TEST_PERFORMANCE_BUNDLE_ID,
            "mapVisualCatalogSource": "normal",
            "mapVisualMapId": map_id,
            "mapVisualQaPreview": variant == "candidate",
            "mapVisualReviewCandidate": False,
            "mapVisualStatus": "released",
        }
    )
    return runtime


def _repeated_workload_sequence_sha256(map_id: str) -> str:
    cells = ["4,19" if index % 2 == 0 else "5,20" for index in range(60)]
    serialized = (
        f"{BUILDER.MOVING_WORKLOAD_CONTRACT}|{map_id}|4,20|"
        + ";".join(cells)
    )
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def _repeated_performance_record(
    map_id: str,
    variant: str,
    mode: str,
    repetition: int,
    process_mean: float,
) -> dict:
    boundary = (
        "shared_input_then_fixed_frames"
        if mode == "moving"
        else "post_warmup_fixed_frames"
    )
    runtime = _repeated_runtime_identity(map_id, variant)
    movement = ""
    if mode == "moving":
        movement = (
            "movement spam click check ready: status=ok clicks=60 "
            "click_limit=60 ui_skipped=0 interaction_skipped=0 "
            "mouse_events=120 input_ui=0 remote_hit=0 accepted=60 "
            "resolved=20 applied=19 screen_matches=60 screen_mismatches=0 "
            "screen_roundtrip=true projection_ready=true avg_input_us=2 max_input_us=9 "
            "moved=true coalesced=true settled=true final_match=true "
            "battle=false encounter=false sequence_id=spawn_adjacent_pair_v1 "
            f"sequence_sha256={_repeated_workload_sequence_sha256(map_id)} "
            "target_count=60 "
            "start_cell=4,20 actual_start_cell=4,20 final_cell=5,20 "
            "expected_cell=5,20 shared_error=none\n"
        )
    sample = (
        "perf probe: fps=60.0 frames=60 draw_world=0.100ms "
        "process_scope_total=0.400ms "
        f"process_total={process_mean:.3f}ms\n"
    )
    output = (
        BUILDER.PERF_WARMUP_PREFIX
        + json.dumps(
            {"frames": BUILDER.PERF_WARMUP_FRAMES, "status": "passed"},
            separators=(",", ":"),
        )
        + "\n"
        + BUILDER.PERF_RUNTIME_PREFIX
        + json.dumps(runtime, separators=(",", ":"))
        + "\n"
        + movement
        + sample * 8
        + BUILDER.PERF_MEASUREMENT_PREFIX
        + json.dumps(
            {
                "completeSamples": 8,
                "discardedPartialFrames": 0,
                "expectedFrames": BUILDER.PERF_MEASUREMENT_FRAMES,
                "frames": BUILDER.PERF_MEASUREMENT_FRAMES,
                "mode": boundary,
                "processScope": "process_priority_boundary_v1",
                "processScopeFrames": BUILDER.PERF_MEASUREMENT_FRAMES,
                "status": "passed",
            },
            separators=(",", ":"),
        )
        + "\n"
        + BUILDER.PERF_CLEAN_EXIT_PREFIX
        + json.dumps(
            {
                "audioManagerReleased": True,
                "audioPlaybackDisabled": True,
                "audioStopped": True,
                "audioStreamsDetached": True,
                "detachedAudioPlayerCount": 16,
                "drainFrames": 16,
                "drainSeconds": 1.5,
                "requestedExitCode": 0,
                "status": "passed",
            },
            separators=(",", ":"),
        )
        + "\n"
    )
    return {
        "schemaVersion": 1,
        "recordType": BUILDER.PERFORMANCE_RUNNER_RECORD_TYPE
        if hasattr(BUILDER, "PERFORMANCE_RUNNER_RECORD_TYPE")
        else "beastbound_map_performance_runner_receipt",
        "bundleId": TEST_PERFORMANCE_BUNDLE_ID,
        "mapId": map_id,
        "variant": variant,
        "mode": mode,
        "repetition": repetition,
        "buildIdentity": "test-build",
        **BUILDER.performance_evidence_tool_hashes(),
        "runner": "godot",
        "runnerVersion": BUILDER.RUNNER_VERSION,
        "samplingContract": {
            "version": 2,
            "warmupFrames": BUILDER.PERF_WARMUP_FRAMES,
            "measurementFrames": BUILDER.PERF_MEASUREMENT_FRAMES,
            "sampleFrames": BUILDER.PERF_SAMPLE_FRAMES,
            "measurementBoundary": boundary,
            "audioPlaybackDisabled": True,
            "cleanExitRequired": True,
            "processScopeMonitor": "process_priority_boundary_v1",
            "movingWorkloadContract": (
                BUILDER.MOVING_WORKLOAD_CONTRACT if mode == "moving" else None
            ),
        },
        "qaLane": {
            "attestation": copy.deepcopy(AUDITOR.PERFORMANCE_QA_LANE_ATTESTATION),
            "verified": True,
            "realUnchanged": True,
            "laneAbsentAfterCleanup": True,
            "realInventorySha256": "a" * 64,
            "postCleanupInspectionSha256": "b" * 64,
        },
        "argv": BUILDER.expected_performance_argv(
            "godot",
            map_id,
            variant,
            mode,
        ),
        "returncode": 0,
        "stdout": output,
        "stderr": "",
        "startedAtUtc": "2026-08-24T23:59:59Z",
        "endedAtUtc": "2026-08-25T00:00:00Z",
    }


class RepeatedPerformanceReportContractTests(unittest.TestCase):
    def _build_fixture(self, root: Path) -> tuple[Path, dict]:
        godot_root = root / "client/godot"
        godot_root.mkdir(parents=True)
        (godot_root / "project.godot").write_text(
            '[application]\nconfig/name="Performance Contract Test"\n',
            encoding="utf-8",
        )
        evidence_root = godot_root / "assets/maps/test/evidence"
        evidence_root.mkdir(parents=True)
        data_root = godot_root / "data"
        data_root.mkdir(parents=True)
        (data_root / "test_perf_map.json").write_text(
            json.dumps(
                {
                    "id": TEST_PERFORMANCE_MAP_ID,
                    "gridSize": [10, 30],
                    "spawnPoints": {"default": [4, 20]},
                    "blockedCells": [],
                    "interactionPoints": [],
                }
            )
            + "\n",
            encoding="utf-8",
        )
        map_catalog_source = godot_root / "scripts/world/map_data_catalog.gd"
        map_catalog_source.parent.mkdir(parents=True)
        map_catalog_source.write_text(
            'const MAP_DATA_PATHS := {\n'
            f'    "{TEST_PERFORMANCE_MAP_ID}": '
            '"res://data/test_perf_map.json",\n'
            '}\n',
            encoding="utf-8",
        )
        for catalog_name in (
            "map_visual_catalog.json",
            "map_visual_review_catalog.json",
        ):
            (data_root / catalog_name).write_text(
                json.dumps({"entries": []}) + "\n",
                encoding="utf-8",
            )
        values = {
            ("baseline", "idle"): (0.20, 0.21, 0.22),
            ("candidate", "idle"): (0.24, 0.25, 0.26),
            ("baseline", "moving"): (0.30, 0.31, 0.32),
            ("candidate", "moving"): (0.35, 0.36, 0.37),
        }
        records = [
            _repeated_performance_record(
                map_id,
                variant,
                mode,
                repetition,
                values[(variant, mode)][repetition - 1],
            )
            for map_id, variant, mode, repetition in BUILDER.expected_performance_matrix(
                [TEST_PERFORMANCE_MAP_ID],
                3,
            )
        ]
        receipt = evidence_root / "performance-runner-receipt.jsonl"
        receipt.write_text(
            "".join(json.dumps(record) + "\n" for record in records),
            encoding="utf-8",
        )
        with (
            mock.patch.object(BUILDER, "GODOT_ROOT", godot_root),
            mock.patch.dict(
                BUILDER.MAP_BUNDLES,
                {
                    TEST_PERFORMANCE_BUNDLE_ID: (
                        "assets/maps/test",
                        (TEST_PERFORMANCE_MAP_ID,),
                    )
                },
                clear=True,
            ),
        ):
            report_path = BUILDER.build_performance_report(
                TEST_PERFORMANCE_BUNDLE_ID,
                build_id="test-build",
                update_manifest_ref=False,
            )
        return report_path.parent.parent, json.loads(
            report_path.read_text(encoding="utf-8")
        )

    @staticmethod
    def _write_report(bundle_root: Path, report: dict) -> dict:
        report_path = bundle_root / "evidence/performance-report.json"
        report_path.write_text(
            json.dumps(report, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        return {
            "path": "evidence/performance-report.json",
            "sha256": hashlib.sha256(report_path.read_bytes()).hexdigest(),
        }

    def _audit(self, bundle_root: Path, report: dict) -> AUDITOR.Audit:
        audit = AUDITOR.Audit(bundle_root / AUDITOR.MANIFEST_NAME, bundle_root)
        AUDITOR.validate_report(
            audit,
            {"performanceReport": self._write_report(bundle_root, report)},
            "performanceReport",
            TEST_PERFORMANCE_BUNDLE_ID,
            {TEST_PERFORMANCE_MAP_ID},
            None,
            {},
            {},
            map_id_order=[TEST_PERFORMANCE_MAP_ID],
            required=True,
            release_frozen=True,
        )
        return audit

    def _rewrite_receipt(self, bundle_root: Path, report: dict, records: list[dict]) -> None:
        receipt = bundle_root / "evidence/performance-runner-receipt.jsonl"
        receipt.write_text(
            "".join(json.dumps(record) + "\n" for record in records),
            encoding="utf-8",
        )
        report["rawRunnerReceipt"]["sha256"] = hashlib.sha256(
            receipt.read_bytes()
        ).hexdigest()

    def test_builder_report_passes_independent_strict_audit(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            bundle_root, report = self._build_fixture(Path(temporary))
            audit = self._audit(bundle_root, report)
        self.assertEqual([], audit.errors)

    def test_repeated_metadata_sampling_and_scope_tampering_fail_closed(self) -> None:
        mutations = {
            "aggregation": lambda report: report.__setitem__(
                "aggregationMode", "legacy_single_run"
            ),
            "repetitions": lambda report: report.__setitem__("repetitionCount", 2),
            "order": lambda report: report.__setitem__("executionOrder", "map_first"),
            "fixed step": lambda report: report.__setitem__("controlledFixedStepFps", 30),
            "display": lambda report: report.__setitem__(
                "displayServer", "Windows Vulkan"
            ),
            "generation time": lambda report: report.__setitem__(
                "generatedAtUtc", "2026-08-24T00:00:00Z"
            ),
            "gate metric": lambda report: report["metricScope"].__setitem__(
                "comparisonAndGateMetric", "processTotalMsMinMeanMax"
            ),
            "measurement frames": lambda report: report["maps"][0]["candidate"][
                "idle"
            ].__setitem__("measurementFrames", 1439),
            "process scope metric": lambda report: report["maps"][0]["candidate"][
                "idle"
            ].pop("processScopeTotalMsMinMeanMax"),
            "draw observation count": lambda report: report["maps"][0][
                "candidate"
            ]["idle"].__setitem__("drawWorldObservedSampleCount", 999),
        }
        for label, mutate in mutations.items():
            with self.subTest(label=label), tempfile.TemporaryDirectory() as temporary:
                bundle_root, report = self._build_fixture(Path(temporary))
                mutate(report)
                self.assertNotEqual([], self._audit(bundle_root, report).errors)

    def test_repeated_report_cannot_fall_back_to_custom_process_total_gates(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            bundle_root, report = self._build_fixture(Path(temporary))
            report["metricScope"]["comparisonAndGateMetric"] = (
                "processTotalMsMinMeanMax"
            )
            for entry in report["maps"]:
                for variant in ("baseline", "candidate"):
                    for mode in ("idle", "moving"):
                        sample = entry[variant][mode]
                        sample.pop("processScopeTotalMsMinMeanMax")
                        sample["runMeanValues"].pop("processScopeTotalMs")
                comparison = entry["comparison"]
                comparison["processTotalMeanDeltaMs"] = comparison.pop(
                    "processScopeTotalMeanDeltaMs"
                )
                paired = comparison["pairedAggregation"]
                paired["processTotalMeanDeltaMsByRepetition"] = paired.pop(
                    "processScopeTotalMeanDeltaMsByRepetition"
                )
                paired["medianProcessTotalMeanDeltaMs"] = paired.pop(
                    "medianProcessScopeTotalMeanDeltaMs"
                )
                comparison["thresholds"] = copy.deepcopy(
                    AUDITOR.PERFORMANCE_LEGACY_THRESHOLDS
                )
            audit = self._audit(bundle_root, report)
        self.assertTrue(
            any("processScopeTotalMsMinMeanMax" in error for error in audit.errors),
            audit.errors,
        )
        self.assertTrue(
            any("metricScope" in error for error in audit.errors),
            audit.errors,
        )

    def test_process_scope_overage_fails_even_when_custom_process_total_passes(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            bundle_root, report = self._build_fixture(Path(temporary))
            entry = report["maps"][0]
            candidate_idle = entry["candidate"]["idle"]
            self.assertLess(candidate_idle["processTotalMsMinMeanMax"][1], 0.5)
            candidate_idle["processScopeTotalMsMinMeanMax"] = [0.7, 0.7, 0.7]
            candidate_idle["runMeanValues"]["processScopeTotalMs"] = [0.7] * 3
            comparison = entry["comparison"]
            comparison["processScopeTotalMeanDeltaMs"]["idle"] = 0.3
            paired = comparison["pairedAggregation"]
            paired["processScopeTotalMeanDeltaMsByRepetition"]["idle"] = [0.3] * 3
            paired["medianProcessScopeTotalMeanDeltaMs"]["idle"] = 0.3
            audit = self._audit(bundle_root, report)
        self.assertTrue(
            any("candidate idle mean 0.700 exceeds 0.5" in error for error in audit.errors),
            audit.errors,
        )

    def test_raw_and_report_workload_hash_cotamper_fails_closed(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            bundle_root, report = self._build_fixture(Path(temporary))
            receipt = bundle_root / "evidence/performance-runner-receipt.jsonl"
            records = [
                json.loads(line)
                for line in receipt.read_text(encoding="utf-8").splitlines()
            ]
            expected_hash = _repeated_workload_sequence_sha256(
                TEST_PERFORMANCE_MAP_ID
            )
            forged_cells = [
                "3,19" if index % 2 == 0 else "4,20" for index in range(60)
            ]
            tampered_hash = hashlib.sha256(
                (
                    f"{BUILDER.MOVING_WORKLOAD_CONTRACT}|"
                    f"{TEST_PERFORMANCE_MAP_ID}|3,20|"
                    + ";".join(forged_cells)
                ).encode("utf-8")
            ).hexdigest()
            for record in records:
                if record["mode"] == "moving":
                    record["stdout"] = record["stdout"].replace(
                        f"sequence_sha256={expected_hash}",
                        f"sequence_sha256={tampered_hash}",
                    )
                    record["stdout"] = record["stdout"].replace(
                        "start_cell=4,20 actual_start_cell=4,20 "
                        "final_cell=5,20 expected_cell=5,20",
                        "start_cell=3,20 actual_start_cell=3,20 "
                        "final_cell=4,20 expected_cell=4,20",
                    )
            for variant in ("baseline", "candidate"):
                workloads = report["maps"][0][variant]["moving"][
                    "workloadIdentityByRepetition"
                ]
                for workload in workloads:
                    workload["sequenceSha256"] = tampered_hash
                    workload["startCell"] = "3,20"
                    workload["actualStartCell"] = "3,20"
                    workload["finalCell"] = "4,20"
            self._rewrite_receipt(bundle_root, report, records)
            audit = self._audit(bundle_root, report)
        self.assertTrue(
            any(
                "must exactly match the workload derived from authoritative map data"
                in error
                for error in audit.errors
            ),
            audit.errors,
        )

    def test_sub_thousandth_raw_binding_cannot_hide_scope_regression(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            bundle_root, report = self._build_fixture(Path(temporary))
            receipt = bundle_root / "evidence/performance-runner-receipt.jsonl"
            records = [
                json.loads(line)
                for line in receipt.read_text(encoding="utf-8").splitlines()
            ]
            for record in records:
                if record["mode"] != "idle":
                    continue
                raw_value = "0.399" if record["variant"] == "baseline" else "0.500"
                record["stdout"] = record["stdout"].replace(
                    "process_scope_total=0.400ms",
                    f"process_scope_total={raw_value}ms",
                )
            entry = report["maps"][0]
            for variant, forged_mean in (
                ("baseline", 0.39948),
                ("candidate", 0.49952),
            ):
                sample = entry[variant]["idle"]
                sample["processScopeTotalMsMinMeanMax"] = [forged_mean] * 3
                sample["runMeanValues"]["processScopeTotalMs"] = [
                    forged_mean
                ] * 3
            comparison = entry["comparison"]
            comparison["processScopeTotalMeanDeltaMs"]["idle"] = 0.1
            paired = comparison["pairedAggregation"]
            paired["processScopeTotalMeanDeltaMsByRepetition"]["idle"] = [0.1] * 3
            paired["medianProcessScopeTotalMeanDeltaMs"]["idle"] = 0.1
            self._rewrite_receipt(bundle_root, report, records)
            audit = self._audit(bundle_root, report)
        self.assertTrue(
            any("canonical to three decimals" in error for error in audit.errors),
            audit.errors,
        )

    def test_scope_cotamper_cannot_drop_below_main_process_total(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            bundle_root, report = self._build_fixture(Path(temporary))
            receipt = bundle_root / "evidence/performance-runner-receipt.jsonl"
            records = [
                json.loads(line)
                for line in receipt.read_text(encoding="utf-8").splitlines()
            ]
            for record in records:
                record["stdout"] = record["stdout"].replace(
                    "process_scope_total=0.400ms",
                    "process_scope_total=0.001ms",
                )
            for entry in report["maps"]:
                for variant in ("baseline", "candidate"):
                    for mode in ("idle", "moving"):
                        sample = entry[variant][mode]
                        sample["processScopeTotalMsMinMeanMax"] = [0.001] * 3
                        sample["runMeanValues"]["processScopeTotalMs"] = [
                            0.001
                        ] * 3
                comparison = entry["comparison"]
                comparison["processScopeTotalMeanDeltaMs"] = {
                    "idle": 0.0,
                    "moving": 0.0,
                }
                paired = comparison["pairedAggregation"]
                paired["processScopeTotalMeanDeltaMsByRepetition"] = {
                    "idle": [0.0] * 3,
                    "moving": [0.0] * 3,
                }
                paired["medianProcessScopeTotalMeanDeltaMs"] = {
                    "idle": 0.0,
                    "moving": 0.0,
                }
            self._rewrite_receipt(bundle_root, report, records)
            audit = self._audit(bundle_root, report)
        self.assertTrue(
            any("must include and therefore be >=" in error for error in audit.errors),
            audit.errors,
        )

    def test_malformed_raw_moving_integer_fails_without_crashing(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            bundle_root, report = self._build_fixture(Path(temporary))
            receipt = bundle_root / "evidence/performance-runner-receipt.jsonl"
            records = [
                json.loads(line)
                for line in receipt.read_text(encoding="utf-8").splitlines()
            ]
            moving = next(record for record in records if record["mode"] == "moving")
            moving["stdout"] = moving["stdout"].replace(
                "status=ok clicks=60 ", "status=ok clicks=nope ", 1
            )
            self._rewrite_receipt(bundle_root, report, records)
            audit = self._audit(bundle_root, report)
        self.assertTrue(any("clicks: expected an integer" in error for error in audit.errors))

    def test_invalid_paired_run_mean_fails_without_crashing(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            bundle_root, report = self._build_fixture(Path(temporary))
            report["maps"][0]["candidate"]["idle"]["runMeanValues"][
                "processScopeTotalMs"
            ][0] = None
            audit = self._audit(bundle_root, report)
        self.assertTrue(
            any("processScopeTotalMs" in error for error in audit.errors),
            audit.errors,
        )

    def test_malformed_raw_fps_and_metric_fail_without_crashing(self) -> None:
        mutations = {
            "fps": ("fps=60.0", "fps=..."),
            "metric": ("process_total=0.200ms", "process_total=...ms"),
        }
        for label, (old, new) in mutations.items():
            with self.subTest(label=label), tempfile.TemporaryDirectory() as temporary:
                bundle_root, report = self._build_fixture(Path(temporary))
                receipt = bundle_root / "evidence/performance-runner-receipt.jsonl"
                records = [
                    json.loads(line)
                    for line in receipt.read_text(encoding="utf-8").splitlines()
                ]
                records[0]["stdout"] = records[0]["stdout"].replace(old, new, 1)
                self._rewrite_receipt(bundle_root, report, records)
                audit = self._audit(bundle_root, report)
                self.assertNotEqual([], audit.errors)

    def test_raw_and_report_adapter_cotamper_fails_comparability(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            bundle_root, report = self._build_fixture(Path(temporary))
            receipt = bundle_root / "evidence/performance-runner-receipt.jsonl"
            records = [
                json.loads(line)
                for line in receipt.read_text(encoding="utf-8").splitlines()
            ]
            for record in records:
                if record["variant"] != "candidate":
                    continue
                lines = record["stdout"].splitlines()
                runtime_index = next(
                    index
                    for index, line in enumerate(lines)
                    if line.startswith(BUILDER.PERF_RUNTIME_PREFIX)
                )
                runtime = json.loads(
                    lines[runtime_index][len(BUILDER.PERF_RUNTIME_PREFIX) :]
                )
                runtime["videoAdapterName"] = "Different GPU"
                lines[runtime_index] = BUILDER.PERF_RUNTIME_PREFIX + json.dumps(
                    runtime, separators=(",", ":")
                )
                record["stdout"] = "\n".join(lines) + "\n"
            for mode in ("idle", "moving"):
                report["maps"][0]["candidate"][mode]["runtimeIdentity"][
                    "videoAdapterName"
                ] = "Different GPU"
            self._rewrite_receipt(bundle_root, report, records)
            audit = self._audit(bundle_root, report)
        self.assertTrue(
            any("must use one video adapter" in error for error in audit.errors),
            audit.errors,
        )

    def test_duplicate_key_in_performance_report_fails_strict_json(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            bundle_root, report = self._build_fixture(Path(temporary))
            report_path = bundle_root / "evidence/performance-report.json"
            payload = json.dumps(report, ensure_ascii=False, indent=2).replace(
                '"result": "PASS"',
                '"result": "FAIL",\n  "result": "PASS"',
                1,
            ) + "\n"
            report_path.write_text(payload, encoding="utf-8")
            reference = {
                "path": "evidence/performance-report.json",
                "sha256": hashlib.sha256(report_path.read_bytes()).hexdigest(),
            }
            audit = AUDITOR.Audit(
                bundle_root / AUDITOR.MANIFEST_NAME,
                bundle_root,
            )
            AUDITOR.validate_report(
                audit,
                {"performanceReport": reference},
                "performanceReport",
                TEST_PERFORMANCE_BUNDLE_ID,
                {TEST_PERFORMANCE_MAP_ID},
                None,
                {},
                {},
                map_id_order=[TEST_PERFORMANCE_MAP_ID],
                required=True,
                release_frozen=True,
            )
        self.assertTrue(
            any("duplicate JSON key" in error for error in audit.errors),
            audit.errors,
        )

    def test_full_report_strip_with_tampered_sampling_version_cannot_downgrade(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            bundle_root, report = self._build_fixture(Path(temporary))
            report["aggregationMode"] = "legacy_single_run"
            report["repetitionCount"] = 1
            report["executionOrder"] = "legacy_single_run"
            report["metricScope"] = copy.deepcopy(
                AUDITOR.PERFORMANCE_LEGACY_METRIC_SCOPE
            )
            for entry in report["maps"]:
                for variant in ("baseline", "candidate"):
                    for mode in ("idle", "moving"):
                        sample = entry[variant][mode]
                        for key in (
                            "aggregationMethod",
                            "repetitionCount",
                            "runMeanValues",
                            "workloadIdentityByRepetition",
                            "measurementBoundary",
                            "runtimeIdentity",
                            "processScopeTotalMsMinMeanMax",
                        ):
                            sample.pop(key, None)
                entry["comparison"] = {
                    "processTotalMeanDeltaMs": {"idle": 0.04, "moving": 0.05},
                    "pairedAggregation": None,
                    "thresholds": copy.deepcopy(
                        AUDITOR.PERFORMANCE_LEGACY_THRESHOLDS
                    ),
                    "gates": {
                        key: "PASS" for key in AUDITOR.PERFORMANCE_GATE_NAMES
                    },
                }
            receipt = bundle_root / "evidence/performance-runner-receipt.jsonl"
            records = [
                json.loads(line)
                for line in receipt.read_text(encoding="utf-8").splitlines()
            ]
            for record in records:
                record["samplingContract"] = {"version": 1}
            self._rewrite_receipt(bundle_root, report, records)
            audit = self._audit(bundle_root, report)
        self.assertTrue(
            any("cannot be downgraded" in error for error in audit.errors),
            audit.errors,
        )

    def test_released_primary_same_primary_preview_runtime_is_supported(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            bundle_root, report = self._build_fixture(Path(temporary))
            receipt = bundle_root / "evidence/performance-runner-receipt.jsonl"
            records = [
                json.loads(line)
                for line in receipt.read_text(encoding="utf-8").splitlines()
            ]
            for record in records:
                runtime = _released_runtime_identity(
                    record["mapId"], record["variant"]
                )
                lines = record["stdout"].splitlines()
                runtime_index = next(
                    index
                    for index, line in enumerate(lines)
                    if line.startswith(BUILDER.PERF_RUNTIME_PREFIX)
                )
                lines[runtime_index] = BUILDER.PERF_RUNTIME_PREFIX + json.dumps(
                    runtime, separators=(",", ":")
                )
                record["stdout"] = "\n".join(lines) + "\n"
            report["comparisonMode"] = (
                "released_primary_vs_same_primary_qa_preview"
            )
            for entry in report["maps"]:
                for variant in ("baseline", "candidate"):
                    runtime = _released_runtime_identity(entry["mapId"], variant)
                    for mode in ("idle", "moving"):
                        entry[variant][mode]["runtimeIdentity"] = copy.deepcopy(
                            runtime
                        )
            self._rewrite_receipt(bundle_root, report, records)
            audit = self._audit(bundle_root, report)
        self.assertEqual([], audit.errors)

    def test_paired_threshold_gate_and_workload_tampering_fail_closed(self) -> None:
        mutations = {
            "paired median": lambda report: report["maps"][0]["comparison"][
                "pairedAggregation"
            ]["medianProcessScopeTotalMeanDeltaMs"].__setitem__("idle", 0.041),
            "paired gate key": lambda report: report["maps"][0]["comparison"][
                "pairedAggregation"
            ]["gates"].__setitem__("extra", "PASS"),
            "threshold key": lambda report: report["maps"][0]["comparison"][
                "thresholds"
            ].__setitem__("extra", 1.0),
            "gate key": lambda report: report["maps"][0]["comparison"][
                "gates"
            ].pop("candidateIdleWithinLimit"),
            "workload": lambda report: report["maps"][0]["candidate"]["moving"][
                "workloadIdentityByRepetition"
            ][0].__setitem__("sequenceSha256", "d" * 64),
        }
        for label, mutate in mutations.items():
            with self.subTest(label=label), tempfile.TemporaryDirectory() as temporary:
                bundle_root, report = self._build_fixture(Path(temporary))
                mutate(report)
                self.assertNotEqual([], self._audit(bundle_root, report).errors)

    def test_raw_order_scope_marker_and_runtime_tampering_fail_closed(self) -> None:
        def shuffled(records: list[dict]) -> None:
            records[0], records[1] = records[1], records[0]

        def scope_marker(records: list[dict]) -> None:
            records[0]["stdout"] = records[0]["stdout"].replace(
                '"processScopeFrames":480',
                '"processScopeFrames":479',
            )

        def runtime_identity(records: list[dict]) -> None:
            records[0]["stdout"] = records[0]["stdout"].replace(
                '"processScopeReady":true',
                '"processScopeReady":false',
            )

        for label, mutate in {
            "order": shuffled,
            "scope marker": scope_marker,
            "runtime identity": runtime_identity,
        }.items():
            with self.subTest(label=label), tempfile.TemporaryDirectory() as temporary:
                bundle_root, report = self._build_fixture(Path(temporary))
                receipt = bundle_root / "evidence/performance-runner-receipt.jsonl"
                records = [
                    json.loads(line)
                    for line in receipt.read_text(encoding="utf-8").splitlines()
                ]
                mutate(records)
                self._rewrite_receipt(bundle_root, report, records)
                self.assertNotEqual([], self._audit(bundle_root, report).errors)

    def test_v2_receipt_cannot_be_downgraded_to_legacy(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            bundle_root, report = self._build_fixture(Path(temporary))
            report["aggregationMode"] = "legacy_single_run"
            report["repetitionCount"] = 1
            report["executionOrder"] = "legacy_single_run"
            for entry in report["maps"]:
                for variant in ("baseline", "candidate"):
                    for mode in ("idle", "moving"):
                        sample = entry[variant][mode]
                        for key in (
                            "aggregationMethod",
                            "repetitionCount",
                            "runMeanValues",
                            "workloadIdentityByRepetition",
                        ):
                            sample.pop(key, None)
                entry["comparison"]["pairedAggregation"] = None
            audit = self._audit(bundle_root, report)
        self.assertTrue(
            any("cannot be downgraded" in error for error in audit.errors),
            audit.errors,
        )

    def test_historical_report_without_repeated_fields_still_passes(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            bundle_root, report = self._build_fixture(Path(temporary))
            for key in (
                "aggregationMode",
                "repetitionCount",
                "executionOrder",
                "controlledFixedStepFps",
                "metricScope",
            ):
                report.pop(key, None)
            legacy_idle = {
                "samples": 3,
                "fpsMinMeanMax": [60.0, 60.0, 60.0],
                "processTotalMsMinMeanMax": [0.2, 0.2, 0.2],
                "drawWorldMsMinMeanMax": [0.1, 0.1, 0.1],
            }
            legacy_moving = {
                **legacy_idle,
                "samples": 2,
                "clicks": 12,
                "accepted": 12,
                "resolved": 3,
                "applied": 2,
                "avgInputUs": 1,
                "maxInputUs": 2,
                "moved": True,
                "coalesced": True,
                "settled": True,
                "finalTargetMatched": True,
                "battle": False,
                "encounter": False,
            }
            entry = report["maps"][0]
            entry["baseline"] = {
                "renderer": "legacy_fallback",
                "idle": copy.deepcopy(legacy_idle),
                "moving": copy.deepcopy(legacy_moving),
            }
            candidate_idle = copy.deepcopy(legacy_idle)
            candidate_idle["processTotalMsMinMeanMax"] = [0.24, 0.24, 0.24]
            candidate_moving = copy.deepcopy(legacy_moving)
            candidate_moving["processTotalMsMinMeanMax"] = [0.25, 0.25, 0.25]
            entry["candidate"] = {
                "renderer": "map_visual_candidate",
                "idle": candidate_idle,
                "moving": candidate_moving,
            }
            entry["comparison"] = {
                "processTotalMeanDeltaMs": {"idle": 0.04, "moving": 0.05},
                "thresholds": copy.deepcopy(AUDITOR.PERFORMANCE_THRESHOLDS),
                "gates": {key: "PASS" for key in AUDITOR.PERFORMANCE_GATE_NAMES},
            }
            receipt = bundle_root / "evidence/performance-runner-receipt.jsonl"
            receipt.write_text('{"legacy":true}\n', encoding="utf-8")
            report["rawRunnerReceipt"]["sha256"] = hashlib.sha256(
                receipt.read_bytes()
            ).hexdigest()
            historical_audit = self._audit(bundle_root, report)
            report["aggregationMode"] = "legacy_single_run"
            report["repetitionCount"] = 1
            report["executionOrder"] = "legacy_single_run"
            report["metricScope"] = copy.deepcopy(
                AUDITOR.PERFORMANCE_LEGACY_METRIC_SCOPE
            )
            explicit_legacy_audit = self._audit(bundle_root, report)
        self.assertEqual([], historical_audit.errors)
        self.assertEqual([], explicit_legacy_audit.errors)


class ReleaseAttestationTests(unittest.TestCase):
    def _write_attestation(
        self,
        root: Path,
        manifest: dict,
        attestation: dict,
    ) -> None:
        payload = (
            json.dumps(attestation, ensure_ascii=False, indent=2, sort_keys=True)
            + "\n"
        ).encode("utf-8")
        path = root / AUDITOR.RELEASE_ATTESTATION_NAME
        path.write_bytes(payload)
        manifest["releaseAttestation"] = {
            "path": AUDITOR.RELEASE_ATTESTATION_NAME,
            "sha256": hashlib.sha256(payload).hexdigest(),
        }

    def test_valid_non_circular_attestation_passes_and_owner_subject_binds_it(
        self,
    ) -> None:
        manifest = sample_manifest()
        summaries_before = AUDITOR.release_summary_hashes(manifest)
        owner_subject_before = AUDITOR.manifest_review_subject_sha256(manifest)
        attestation = release_attestation(manifest)
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            self._write_attestation(root, manifest, attestation)
            audit = AUDITOR.Audit(
                manifest_path=root / AUDITOR.MANIFEST_NAME,
                root=root,
            )
            key = AUDITOR.validate_release_attestation(
                audit,
                manifest,
                required=True,
            )
        self.assertEqual([], audit.errors)
        self.assertTrue(audit.release_attestation_valid)
        self.assertIsNotNone(key)
        self.assertEqual(
            summaries_before,
            AUDITOR.release_summary_hashes(manifest),
            "releaseAttestation must be excluded from its own summary",
        )
        self.assertNotEqual(
            owner_subject_before,
            AUDITOR.manifest_review_subject_sha256(manifest),
            "owner review subject must bind the attestation reference",
        )

    def test_attestation_summary_drift_fails(self) -> None:
        manifest = sample_manifest()
        attestation = release_attestation(manifest)
        attestation["summaries"]["assetSha256"] = "f" * 64
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            self._write_attestation(root, manifest, attestation)
            audit = AUDITOR.Audit(
                manifest_path=root / AUDITOR.MANIFEST_NAME,
                root=root,
            )
            AUDITOR.validate_release_attestation(
                audit,
                manifest,
                required=True,
            )
        self.assertFalse(audit.release_attestation_valid)
        self.assertTrue(
            any("assetSha256" in error for error in audit.errors),
            audit.errors,
        )

    def test_boolean_and_integer_type_confusion_fails_closed(self) -> None:
        mutations = {
            "boolean schemaVersion": lambda value: value.__setitem__(
                "schemaVersion",
                True,
            ),
            "integer releaseApproved": lambda value: value["lifecycle"].__setitem__(
                "releaseApproved",
                1,
            ),
            "integer runtimeEnabled": lambda value: value["lifecycle"].__setitem__(
                "runtimeEnabled",
                1,
            ),
            "integer releaseReady": lambda value: value["offlineAudit"].__setitem__(
                "releaseReady",
                1,
            ),
        }
        for label, mutate in mutations.items():
            with self.subTest(label=label):
                manifest = sample_manifest()
                attestation = release_attestation(manifest)
                mutate(attestation)
                with tempfile.TemporaryDirectory() as temporary:
                    root = Path(temporary)
                    self._write_attestation(root, manifest, attestation)
                    audit = AUDITOR.Audit(
                        manifest_path=root / AUDITOR.MANIFEST_NAME,
                        root=root,
                    )
                    AUDITOR.validate_release_attestation(
                        audit,
                        manifest,
                        required=True,
                    )
                self.assertFalse(audit.release_attestation_valid)
                self.assertNotEqual([], audit.errors)


class GroundVisualContractTests(unittest.TestCase):
    def _audit(self, root: Path) -> AUDITOR.Audit:
        return AUDITOR.Audit(root / AUDITOR.MANIFEST_NAME, root)

    def test_legacy_ground_remains_valid_and_edge_falls_back_to_default(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            audit = self._audit(root)
            AUDITOR.validate_ground_visual_contract(
                audit,
                {"defaultTileId": "grass"},
                {"grass"},
                "ground",
            )
        self.assertEqual([], audit.errors)

    def test_valid_deterministic_visual_variants_pass(self) -> None:
        path_transitions = {
            signature: f"path_edge_{signature}"
            for signature in AUDITOR.SURFACE_TRANSITION_KEYS
        }
        plaza_transitions = {
            signature: f"plaza_edge_{signature}"
            for signature in AUDITOR.SURFACE_TRANSITION_KEYS
        }
        tiles = {
            "grass",
            "grass_b",
            "path",
            "path_b",
            "plaza",
            "edge",
            "edge_b",
            *path_transitions.values(),
            *plaza_transitions.values(),
        }
        ground = {
            "defaultTileId": "grass",
            "edgeTileId": "edge",
            "edgePaddingCells": 8,
            "variantSeed": -2147483648,
            "variantClusterSize": 3,
            "pathTileId": "path",
            "pathTransitionTileIds": path_transitions,
            "plazaTileId": "plaza",
            "plazaTransitionTileIds": plaza_transitions,
            "tileVariants": {
                "grass": ["grass", "grass_b"],
                "path": ["path", "path_b"],
                "edge": ["edge", "edge_b"],
            },
        }
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            audit = self._audit(root)
            AUDITOR.validate_ground_visual_contract(audit, ground, tiles, "ground")
        self.assertEqual([], audit.errors)

    def test_invalid_optional_ground_fields_fail_closed(self) -> None:
        path_transitions = {
            signature: f"path_edge_{signature}"
            for signature in AUDITOR.SURFACE_TRANSITION_KEYS
        }
        plaza_transitions = {
            signature: f"plaza_edge_{signature}"
            for signature in AUDITOR.SURFACE_TRANSITION_KEYS
        }
        missing_direction = dict(path_transitions)
        missing_direction.pop("nw_ne_sw_se")
        unknown_transition = dict(path_transitions)
        unknown_transition["nw"] = "missing"
        duplicate_transition = dict(path_transitions)
        duplicate_transition["ne"] = duplicate_transition["nw"]
        reserved_transition = dict(path_transitions)
        reserved_transition["nw"] = "grass"
        reused_plaza_transition = dict(plaza_transitions)
        reused_plaza_transition["nw"] = path_transitions["nw"]
        tiles = {
            "grass",
            "grass_b",
            "path",
            "path_b",
            "shared",
            *path_transitions.values(),
            *plaza_transitions.values(),
        }
        fixtures = {
            "unknown edge": {
                "defaultTileId": "grass",
                "edgeTileId": "missing",
            },
            "boolean seed": {
                "defaultTileId": "grass",
                "variantSeed": True,
            },
            "oversized seed": {
                "defaultTileId": "grass",
                "variantSeed": 2**31,
            },
            "cluster below range": {
                "defaultTileId": "grass",
                "variantClusterSize": 0,
            },
            "cluster above range": {
                "defaultTileId": "grass",
                "variantClusterSize": 9,
            },
            "unknown candidate": {
                "defaultTileId": "grass",
                "tileVariants": {"grass": ["grass", "missing"]},
            },
            "base omitted": {
                "defaultTileId": "grass",
                "tileVariants": {"grass": ["grass_b"]},
            },
            "duplicate candidate": {
                "defaultTileId": "grass",
                "tileVariants": {"grass": ["grass", "grass"]},
            },
            "crossed semantic base": {
                "defaultTileId": "grass",
                "tileVariants": {
                    "grass": ["grass", "path"],
                    "path": ["path", "path_b"],
                },
            },
            "candidate shared by pools": {
                "defaultTileId": "grass",
                "tileVariants": {
                    "grass": ["grass", "shared"],
                    "path": ["path", "shared"],
                },
            },
            "path transitions without path semantic": {
                "defaultTileId": "grass",
                "pathTransitionTileIds": path_transitions,
            },
            "plaza transitions without plaza semantic": {
                "defaultTileId": "grass",
                "plazaTransitionTileIds": plaza_transitions,
            },
            "path transitions is not an object": {
                "defaultTileId": "grass",
                "pathTileId": "path",
                "pathTransitionTileIds": [],
            },
            "path transitions missing direction": {
                "defaultTileId": "grass",
                "pathTileId": "path",
                "pathTransitionTileIds": missing_direction,
            },
            "path transitions unknown tile": {
                "defaultTileId": "grass",
                "pathTileId": "path",
                "pathTransitionTileIds": unknown_transition,
            },
            "path transitions duplicate tile": {
                "defaultTileId": "grass",
                "pathTileId": "path",
                "pathTransitionTileIds": duplicate_transition,
            },
            "path transitions reuse semantic tile": {
                "defaultTileId": "grass",
                "pathTileId": "path",
                "pathTransitionTileIds": reserved_transition,
            },
            "surface transition tile reused across fields": {
                "defaultTileId": "grass",
                "pathTileId": "path",
                "plazaTileId": "path_b",
                "pathTransitionTileIds": path_transitions,
                "plazaTransitionTileIds": reused_plaza_transition,
            },
        }
        for label, ground in fixtures.items():
            with self.subTest(label=label), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                audit = self._audit(root)
                AUDITOR.validate_ground_visual_contract(audit, ground, tiles, "ground")
                self.assertNotEqual([], audit.errors)


class ObjectPlacementAnchorContractTests(unittest.TestCase):
    def _validate(
        self,
        cell: list[int],
        role: str,
        *,
        grid_size: list[int] | None = None,
        padding: int = 0,
    ) -> AUDITOR.Audit:
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        root = Path(temporary.name)
        audit = AUDITOR.Audit(root / AUDITOR.MANIFEST_NAME, root)
        AUDITOR.validate_object_anchor_cell(
            audit,
            cell,
            "placement.grid",
            grid_size,
            role,
            padding,
        )
        return audit

    def _validate_binding(
        self,
        role: str,
        cell: list[int],
        footprint: list[list[int]],
    ) -> AUDITOR.Audit:
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        root = Path(temporary.name)
        (root / "bindings").mkdir()
        binding = {
            "schemaVersion": 1,
            "bundleId": "test_bundle",
            "mapId": "test_map",
            "mapGridSize": [10, 8],
            "ground": {
                "defaultTileId": "grass",
                "edgePaddingCells": 2,
                "overrides": [],
            },
            "objectPlacements": [
                {
                    "instanceId": "tree_01",
                    "objectId": "tree",
                    "grid": cell,
                    "offset": [0, 0],
                    "mirrored": False,
                    "interactionLink": "test_link" if role == "interaction" else None,
                    "collisionFootprint": footprint,
                }
            ],
        }
        binding_path = root / "bindings" / "test_map.json"
        binding_path.write_text(
            json.dumps(binding, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        audit = AUDITOR.Audit(root / AUDITOR.MANIFEST_NAME, root)
        AUDITOR.validate_bindings(
            audit,
            [
                {
                    "mapId": "test_map",
                    "binding": {
                        "path": "bindings/test_map.json",
                        "sha256": hashlib.sha256(binding_path.read_bytes()).hexdigest(),
                    },
                }
            ],
            "test_bundle",
            {"test_map"},
            {"grass"},
            {"tree"},
            {"tree": role},
        )
        return audit

    def test_legacy_in_grid_anchor_remains_valid(self) -> None:
        self.assertEqual([], self._validate([3, 4], "blocking").errors)
        self.assertEqual(
            [],
            self._validate([9, 7], "interaction", grid_size=[10, 8]).errors,
        )

    def test_visual_only_roles_may_anchor_on_edge_skirt(self) -> None:
        for role in ("none", "decorative"):
            for cell in ([-2, 0], [0, -2], [11, 7], [9, 9], [-2, -2], [11, 9]):
                with self.subTest(role=role, cell=cell):
                    self.assertEqual(
                        [],
                        self._validate(
                            cell,
                            role,
                            grid_size=[10, 8],
                            padding=2,
                        ).errors,
                    )

        self.assertEqual(
            [],
            self._validate_binding("decorative", [-2, 9], []).errors,
        )

    def test_visual_only_anchor_outside_skirt_fails_closed(self) -> None:
        for cell in ([-3, 0], [0, -3], [12, 7], [9, 10]):
            with self.subTest(cell=cell):
                self.assertNotEqual(
                    [],
                    self._validate(
                        cell,
                        "decorative",
                        grid_size=[10, 8],
                        padding=2,
                    ).errors,
                )
        self.assertNotEqual(
            [],
            self._validate(
                [-1, 0],
                "none",
                grid_size=[10, 8],
                padding=0,
            ).errors,
        )
        self.assertNotEqual([], self._validate([-1, 0], "none").errors)

    def test_physical_roles_and_footprints_stay_inside_authoritative_grid(self) -> None:
        for role in ("blocking", "interaction"):
            with self.subTest(role=role):
                self.assertNotEqual(
                    [],
                    self._validate(
                        [-1, 0],
                        role,
                        grid_size=[10, 8],
                        padding=2,
                    ).errors,
                )
        for footprint in ([-1, 0], [10, 0], [0, 8]):
            with self.subTest(footprint=footprint), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                audit = AUDITOR.Audit(root / AUDITOR.MANIFEST_NAME, root)
                AUDITOR.validate_grid_cell(
                    audit,
                    footprint,
                    "placement.collisionFootprint[0]",
                    [10, 8],
                )
                self.assertNotEqual([], audit.errors)
        self.assertNotEqual(
            [],
            self._validate_binding("blocking", [-1, 0], [[0, 0]]).errors,
        )
        self.assertNotEqual(
            [],
            self._validate_binding("interaction", [10, 0], []).errors,
        )


class ReviewCatalogContractTests(unittest.TestCase):
    def _write_candidate(self, root: Path) -> tuple[dict, Path, Path, Path]:
        (root / "data").mkdir(parents=True)
        bundle_root = root / "assets" / "maps" / "candidate"
        (bundle_root / "bindings").mkdir(parents=True)
        manifest = sample_manifest()
        manifest_path = bundle_root / AUDITOR.MANIFEST_NAME
        binding_path = bundle_root / "bindings" / "solo_map.json"
        binding_path.write_text('{"mapId":"solo_map"}\n', encoding="utf-8")
        manifest_path.write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        catalog_path = root / "data" / "map_visual_review_catalog.json"
        catalog_path.write_text(
            json.dumps(
                {
                    "schemaVersion": 1,
                    "entries": [
                        {
                            "mapId": "solo_map",
                            "bundleManifest": (
                                "res://assets/maps/candidate/map-visual-bundle.json"
                            ),
                            "bindingPath": (
                                "res://assets/maps/candidate/bindings/solo_map.json"
                            ),
                        }
                    ],
                },
                ensure_ascii=False,
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
        (root / "project.godot").write_text("[application]\n", encoding="utf-8")
        return manifest, manifest_path, binding_path, catalog_path

    def test_pending_candidate_paths_and_lifecycle_pass(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            manifest, manifest_path, binding_path, catalog_path = self._write_candidate(root)
            audit = AUDITOR.Audit(manifest_path, manifest_path.parent)
            AUDITOR.validate_live_catalog_registration(
                audit,
                catalog_path,
                root,
                manifest,
                {"solo_map"},
                {"solo_map": hashlib.sha256(binding_path.read_bytes()).hexdigest()},
            )
        self.assertEqual([], audit.errors)

    def test_review_catalog_rejects_non_pending_lifecycle(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            manifest, manifest_path, binding_path, catalog_path = self._write_candidate(root)
            manifest.update(
                {
                    "status": "released",
                    "ownerReviewStatus": "approved",
                    "releaseApproved": True,
                    "runtimeEnabled": True,
                }
            )
            manifest_path.write_text(
                json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
            audit = AUDITOR.Audit(manifest_path, manifest_path.parent)
            AUDITOR.validate_live_catalog_registration(
                audit,
                catalog_path,
                root,
                manifest,
                {"solo_map"},
                {"solo_map": hashlib.sha256(binding_path.read_bytes()).hexdigest()},
            )
        self.assertTrue(any("reviewCatalog.lifecycle" in error for error in audit.errors))

    def test_pending_candidate_cannot_be_release_ready(self) -> None:
        manifest = sample_manifest()
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            audit = AUDITOR.Audit(root / AUDITOR.MANIFEST_NAME, root)
            AUDITOR.evaluate_release_readiness(audit, manifest, {"solo_map"})
        self.assertFalse(audit.release_ready)
        self.assertIn("lifecycle_released_and_enabled", audit.missing_release_gates)
        self.assertIn("release_attestation", audit.missing_release_gates)


if __name__ == "__main__":
    unittest.main()
