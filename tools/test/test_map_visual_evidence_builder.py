from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from typing import Callable
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

TEST_PERFORMANCE_BUNDLE_ID = "earth_vein_cave_visual_v1"


def _record(mode: str = "idle") -> dict:
    moving = ""
    if mode == "moving":
        moving = (
            "\nmovement spam click check ready: status=ok clicks=12 "
            "accepted=12 resolved=3 applied=3 screen_roundtrip=true "
            "avg_input_us=2 max_input_us=9 moved=true coalesced=true "
            "settled=true final_match=true projection_ready=true "
            "battle=false encounter=false"
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


def _record_at_mean(
    map_id: str,
    variant: str,
    mode: str,
    repetition: int,
    process_mean: float,
    *,
    process_scope_mean: float = 0.4,
) -> dict:
    record = _record(mode)
    record.update(
        {
            "schemaVersion": 1,
            "recordType": "beastbound_map_performance_runner_receipt",
            "mapId": map_id,
            "bundleId": TEST_PERFORMANCE_BUNDLE_ID,
            "variant": variant,
            "repetition": repetition,
            "buildIdentity": "test-build",
            **builder.performance_evidence_tool_hashes(),
            "runner": "godot",
            "runnerVersion": builder.RUNNER_VERSION,
            "samplingContract": {
                "version": 2,
                "warmupFrames": builder.PERF_WARMUP_FRAMES,
                "measurementFrames": builder.PERF_MEASUREMENT_FRAMES,
                "sampleFrames": builder.PERF_SAMPLE_FRAMES,
                "measurementBoundary": (
                    "shared_input_then_fixed_frames"
                    if mode == "moving"
                    else "post_warmup_fixed_frames"
                ),
                "audioPlaybackDisabled": True,
                "cleanExitRequired": True,
                "processScopeMonitor": "process_priority_boundary_v1",
                "movingWorkloadContract": (
                    builder.MOVING_WORKLOAD_CONTRACT
                    if mode == "moving"
                    else None
                ),
            },
            "qaLane": {
                "verified": True,
                "realUnchanged": True,
                "laneAbsentAfterCleanup": True,
                "realInventorySha256": "a" * 64,
                "postCleanupInspectionSha256": "b" * 64,
            },
        }
    )
    record["argv"] = builder.expected_performance_argv(
        "godot",
        map_id,
        variant,
        mode,
    )
    moving = ""
    if mode == "moving":
        moving = (
            "movement spam click check ready: status=ok clicks=60 "
            "click_limit=60 ui_skipped=0 interaction_skipped=0 "
            "mouse_events=120 input_ui=0 remote_hit=0 accepted=60 "
            "resolved=20 applied=19 screen_matches=60 screen_mismatches=0 "
            "screen_roundtrip=true "
            "avg_input_us=2 max_input_us=9 moved=true coalesced=true "
            "settled=true final_match=true projection_ready=true "
            "battle=false encounter=false "
            "sequence_id=spawn_adjacent_pair_v1 sequence_sha256="
            + "c" * 64
            + " target_count=60 start_cell=4,20 actual_start_cell=4,20 "
            "final_cell=5,20 "
            "expected_cell=5,20 shared_error=none\n"
        )
    sample = (
        "perf probe: fps=60.0 frames=60 "
        "draw_world=0.10ms "
        f"process_scope_total={process_scope_mean:.3f}ms "
        f"process_total={process_mean:.3f}ms\n"
    )
    record["stdout"] = (
        builder.PERF_WARMUP_PREFIX
        + json.dumps(
            {
                "frames": builder.PERF_WARMUP_FRAMES,
                "status": "passed",
            },
            separators=(",", ":"),
        )
        + "\n"
        + builder.PERF_RUNTIME_PREFIX
        + json.dumps(
            {
                "candidateEnabled": variant == "candidate",
                "displayServer": "macOS",
                "engineVersion": builder.RUNTIME_ENGINE_VERSION,
                "engineVersionHash": builder.RUNNER_VERSION.rsplit(".", 1)[1],
                "mapId": map_id,
                "mapVisualActive": variant == "candidate",
                "mapVisualBundleId": (
                    TEST_PERFORMANCE_BUNDLE_ID
                    if variant == "candidate"
                    else ""
                ),
                "mapVisualCatalogSource": (
                    "review" if variant == "candidate" else ""
                ),
                "mapVisualMapId": map_id if variant == "candidate" else "",
                "mapVisualQaPreview": variant == "candidate",
                "mapVisualReviewCandidate": variant == "candidate",
                "mapVisualStatus": (
                    "owner_review_pending"
                    if variant == "candidate"
                    else ""
                ),
                "processScopeMonitor": "process_priority_boundary_v1",
                "processScopePriorities": [-1000000, 1000000],
                "processScopeReady": True,
                "renderingDriver": "metal",
                "renderingMethod": "mobile",
                "sampleFrames": builder.PERF_SAMPLE_FRAMES,
                "status": "passed",
                "videoAdapterName": "Unit Test GPU",
                "viewportSize": [1280, 720],
                "vsyncMode": 0,
            },
            separators=(",", ":"),
        )
        + "\n"
        + moving
        + sample * 8
        + builder.PERF_MEASUREMENT_PREFIX
        + json.dumps(
            {
                "completeSamples": (
                    builder.PERF_MEASUREMENT_FRAMES
                    // builder.PERF_SAMPLE_FRAMES
                ),
                "discardedPartialFrames": 0,
                "expectedFrames": builder.PERF_MEASUREMENT_FRAMES,
                "frames": builder.PERF_MEASUREMENT_FRAMES,
                "mode": record["samplingContract"]["measurementBoundary"],
                "processScope": "process_priority_boundary_v1",
                "processScopeFrames": builder.PERF_MEASUREMENT_FRAMES,
                "status": "passed",
            },
            separators=(",", ":"),
        )
        + "\n"
        + builder.PERF_CLEAN_EXIT_PREFIX
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
    return record


def _authoritative_earth_moving_record(
    map_id: str = "earth_vein_cave",
) -> dict:
    record = _record_at_mean(map_id, "candidate", "moving", 1, 0.2)
    workload = builder.expected_movement_workload(map_id)
    record["stdout"] = (
        record["stdout"]
        .replace(
            "sequence_sha256=" + "c" * 64,
            "sequence_sha256=" + workload["sequenceSha256"],
            1,
        )
        .replace(
            "start_cell=4,20 actual_start_cell=4,20",
            "start_cell="
            + workload["startCell"]
            + " actual_start_cell="
            + workload["actualStartCell"],
            1,
        )
        .replace(
            "final_cell=5,20 expected_cell=5,20",
            "final_cell="
            + workload["finalCell"]
            + " expected_cell="
            + workload["finalCell"],
            1,
        )
    )
    return record


class PerformanceParserTests(unittest.TestCase):
    def test_expected_movement_workloads_match_all_earth_maps(self) -> None:
        expected = {
            "earth_vein_cave": (
                "4,20",
                "5,20",
                "a2bfef4d8c014e07bb45218365215ca48bce1c5b9627df0cf658765be4cbf7fd",
            ),
            "earth_vein_cave_f2": (
                "5,20",
                "6,20",
                "f15c799f2d4d21ebdf13248487b5afe0ab48e9a0937c54727366293bfa6c0fbd",
            ),
            "earth_vein_cave_f3": (
                "5,20",
                "6,20",
                "e1e8fa28f147b65dc936d957f66834c8fc933e252ae480d090ecbac100ab6fb5",
            ),
            "earth_vein_cave_f4": (
                "5,22",
                "6,22",
                "86b56eb2fba289d4523e7931f39abf5b082bbc6eebe21f023acc8e2528d49d13",
            ),
        }
        for map_id, (start_cell, final_cell, sequence_sha256) in expected.items():
            with self.subTest(map_id=map_id):
                workload = builder.expected_movement_workload(map_id)
                self.assertEqual(
                    workload,
                    {
                        "sequenceId": builder.MOVING_WORKLOAD_CONTRACT,
                        "sequenceSha256": sequence_sha256,
                        "startCell": start_cell,
                        "actualStartCell": start_cell,
                        "finalCell": final_cell,
                        "clicks": 60,
                        "mouseEvents": 120,
                    },
                )
                self.assertRegex(
                    workload["sequenceSha256"],
                    r"\A[0-9a-f]{64}\Z",
                )

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
        self.assertLessEqual(parsed["applied"], parsed["resolved"])

    def test_moving_accepts_resolved_target_superseded_before_apply(self) -> None:
        record = _record("moving")
        record["stdout"] = record["stdout"].replace(
            "resolved=3 applied=3",
            "resolved=3 applied=2",
        )
        parsed = builder.parse_perf_run(record)
        self.assertEqual(parsed["resolved"], 3)
        self.assertEqual(parsed["applied"], 2)

    def test_moving_rejects_path_apply_without_resolved_target(self) -> None:
        record = _record("moving")
        record["stdout"] = record["stdout"].replace(
            "resolved=3 applied=3",
            "resolved=3 applied=4",
        )
        with self.assertRaises(builder.EvidenceError):
            builder.parse_perf_run(record)

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

    def test_repeated_run_rejects_incomplete_fixed_window(self) -> None:
        record = _record_at_mean("map", "candidate", "idle", 1, 0.2)
        lines = record["stdout"].splitlines()
        removed = False
        kept = []
        for line in lines:
            if not removed and line.startswith("perf probe: "):
                removed = True
                continue
            kept.append(line)
        record["stdout"] = "\n".join(kept) + "\n"
        with self.assertRaisesRegex(builder.EvidenceError, "fewer than 8"):
            builder.parse_perf_run(record)

    def test_runtime_timing_diagnostic_does_not_replace_fixed_step_samples(self) -> None:
        record = _record_at_mean("map", "candidate", "idle", 1, 0.2)
        expected = builder.parse_perf_run(record)
        timing = {
            "schemaVersion": 1,
            "scope": "sampled_process_frames",
            "status": "passed",
            "frames": 480,
            "wallElapsedSeconds": 0.02,
            "simulationElapsedSeconds": 8.0,
            "wallProcessFramesPerSecond": 24000.0,
            "simulationProcessFramesPerSecond": 60.0,
            "configuredMaxFpsAtStart": 30,
            "configuredMaxFpsAtEnd": 30,
        }
        record["stdout"] = record["stdout"].replace(
            "perf probe measurement complete: ",
            "perf probe runtime timing: " + json.dumps(timing) + "\n"
            + "perf probe measurement complete: ",
        )
        self.assertEqual(builder.parse_perf_run(record), expected)
        record["stdout"] = "\n".join(
            line for line in record["stdout"].splitlines()
            if not line.startswith("perf probe: ")
        ) + "\n"
        with self.assertRaisesRegex(builder.EvidenceError, "measurement window"):
            builder.parse_perf_run(record)

    def test_repeated_run_rejects_cleanup_window_sample(self) -> None:
        record = _record_at_mean("map", "candidate", "idle", 1, 0.2)
        leaked_sample = (
            "perf probe: fps=60.0 frames=60 draw_world=0.10ms "
            "process_scope_total=0.40ms process_total=0.200ms\n"
        )
        record["stdout"] = record["stdout"].replace(
            "perf probe clean exit: ",
            leaked_sample + "perf probe clean exit: ",
        )
        with self.assertRaisesRegex(builder.EvidenceError, "measurement window"):
            builder.parse_perf_run(record)

    def test_repeated_run_rejects_stale_tool_identity(self) -> None:
        record = _record_at_mean("map", "candidate", "idle", 1, 0.2)
        record["evidenceRunnerSha256"] = "0" * 64
        with self.assertRaisesRegex(builder.EvidenceError, "tool identity"):
            builder.parse_perf_run(record)

    def test_repeated_run_rejects_noncanonical_argv(self) -> None:
        record = _record_at_mean("map", "candidate", "idle", 1, 0.2)
        record["argv"].remove("--single-window")
        with self.assertRaisesRegex(builder.EvidenceError, "canonical command"):
            builder.parse_perf_run(record)

    def test_repeated_run_rejects_headless_argv(self) -> None:
        record = _record_at_mean("map", "candidate", "idle", 1, 0.2)
        record["argv"].insert(1, "--headless")
        with self.assertRaisesRegex(builder.EvidenceError, "canonical command"):
            builder.parse_perf_run(record)

    def test_repeated_run_rejects_wrong_map_argv(self) -> None:
        record = _record_at_mean("map", "candidate", "idle", 1, 0.2)
        record["argv"] = [
            "--map-perf-probe-map=other"
            if value == "--map-perf-probe-map=map"
            else value
            for value in record["argv"]
        ]
        with self.assertRaisesRegex(builder.EvidenceError, "canonical command"):
            builder.parse_perf_run(record)

    def test_repeated_run_rejects_wrong_variant_argv(self) -> None:
        record = _record_at_mean("map", "candidate", "idle", 1, 0.2)
        record["argv"] = builder.expected_performance_argv(
            "godot",
            "map",
            "baseline",
            "idle",
        )
        with self.assertRaisesRegex(builder.EvidenceError, "canonical command"):
            builder.parse_perf_run(record)

    def test_repeated_run_rejects_quit_after_argv(self) -> None:
        record = _record_at_mean("map", "candidate", "idle", 1, 0.2)
        record["argv"].append("--quit-after=1")
        with self.assertRaisesRegex(builder.EvidenceError, "runtime clean exit"):
            builder.parse_perf_run(record)

    def test_repeated_run_rejects_59_and_61_frame_windows(self) -> None:
        record = _record_at_mean("map", "candidate", "idle", 1, 0.2)
        lines = record["stdout"].splitlines()
        seen_samples = 0
        for index, line in enumerate(lines):
            if not line.startswith("perf probe: "):
                continue
            if seen_samples == 0:
                lines[index] = line.replace("frames=60", "frames=59", 1)
            elif seen_samples == 1:
                lines[index] = line.replace("frames=60", "frames=61", 1)
            seen_samples += 1
        record["stdout"] = "\n".join(lines) + "\n"
        with self.assertRaisesRegex(builder.EvidenceError, "exact 60-frame"):
            builder.parse_perf_run(record)

    def test_repeated_run_rejects_30_fps_window(self) -> None:
        record = _record_at_mean("map", "candidate", "idle", 1, 0.2)
        record["stdout"] = record["stdout"].replace(
            "perf probe: fps=60.0",
            "perf probe: fps=30.0",
            1,
        )
        with self.assertRaisesRegex(builder.EvidenceError, "fixed-step windows"):
            builder.parse_perf_run(record)

    def test_repeated_moving_rejects_duplicate_summary(self) -> None:
        record = _record_at_mean("map", "candidate", "moving", 1, 0.2)
        summary = next(
            line
            for line in record["stdout"].splitlines()
            if line.startswith("movement spam click check ready: ")
        )
        record["stdout"] = record["stdout"].replace(
            summary + "\n",
            summary + "\n" + summary + "\n",
            1,
        )
        with self.assertRaisesRegex(builder.EvidenceError, "exactly one"):
            builder.parse_perf_run(record)

    def test_repeated_run_rejects_array_cleanup_json(self) -> None:
        record = _record_at_mean("map", "candidate", "idle", 1, 0.2)
        cleanup_line = next(
            line
            for line in record["stdout"].splitlines()
            if line.startswith(builder.PERF_CLEAN_EXIT_PREFIX)
        )
        record["stdout"] = record["stdout"].replace(
            cleanup_line,
            builder.PERF_CLEAN_EXIT_PREFIX + "[]",
            1,
        )
        with self.assertRaisesRegex(builder.EvidenceError, "must be an object"):
            builder.parse_perf_run(record)

    def test_repeated_moving_rejects_inexact_shared_workload(self) -> None:
        record = _record_at_mean("map", "candidate", "moving", 1, 0.2)
        record["stdout"] = record["stdout"].replace(
            "clicks=60",
            "clicks=59",
            1,
        )
        with self.assertRaisesRegex(builder.EvidenceError, "inconsistent|shared workload"):
            builder.parse_perf_run(record)

    def test_repeated_moving_wraps_malformed_integer(self) -> None:
        record = _record_at_mean("map", "candidate", "moving", 1, 0.2)
        record["stdout"] = record["stdout"].replace(
            "mouse_events=120",
            "mouse_events=invalid",
        )
        with self.assertRaisesRegex(builder.EvidenceError, "integer is invalid"):
            builder.parse_perf_run(record)

    def test_repeated_moving_rejects_wrong_authoritative_start(self) -> None:
        record = _authoritative_earth_moving_record()
        record["stdout"] = record["stdout"].replace(
            "start_cell=4,20 actual_start_cell=4,20",
            "start_cell=9,9 actual_start_cell=9,9",
            1,
        )
        with self.assertRaisesRegex(
            builder.EvidenceError,
            "does not match authoritative map data",
        ):
            builder.parse_perf_run(record)

    def test_repeated_moving_rejects_arbitrary_valid_sha256(self) -> None:
        record = _authoritative_earth_moving_record()
        workload = builder.expected_movement_workload("earth_vein_cave")
        record["stdout"] = record["stdout"].replace(
            workload["sequenceSha256"],
            "d" * 64,
            1,
        )
        with self.assertRaisesRegex(
            builder.EvidenceError,
            "does not match authoritative map data",
        ):
            builder.parse_perf_run(record)

    def test_repeated_moving_rejects_wrong_authoritative_final(self) -> None:
        record = _authoritative_earth_moving_record()
        record["stdout"] = record["stdout"].replace(
            "final_cell=5,20 expected_cell=5,20",
            "final_cell=6,20 expected_cell=6,20",
            1,
        )
        with self.assertRaisesRegex(
            builder.EvidenceError,
            "does not match authoritative map data",
        ):
            builder.parse_perf_run(record)

    def test_repeated_moving_rejects_missing_projection_ready(self) -> None:
        record = _authoritative_earth_moving_record()
        record["stdout"] = record["stdout"].replace(
            "projection_ready=true ",
            "",
            1,
        )
        with self.assertRaisesRegex(
            builder.EvidenceError,
            "moving summary invariant failed",
        ):
            builder.parse_perf_run(record)

    def test_repeated_moving_rejects_summary_outside_setup_window(self) -> None:
        for placement in ("before_runtime", "after_first_sample"):
            with self.subTest(placement=placement):
                record = _authoritative_earth_moving_record()
                lines = record["stdout"].splitlines()
                summary = next(
                    line
                    for line in lines
                    if line.startswith("movement spam click check ready: ")
                )
                lines.remove(summary)
                if placement == "before_runtime":
                    runtime_index = next(
                        index
                        for index, line in enumerate(lines)
                        if line.startswith(builder.PERF_RUNTIME_PREFIX)
                    )
                    lines.insert(runtime_index, summary)
                else:
                    first_sample_index = next(
                        index
                        for index, line in enumerate(lines)
                        if line.startswith("perf probe: ")
                    )
                    lines.insert(first_sample_index + 1, summary)
                record["stdout"] = "\n".join(lines) + "\n"
                with self.assertRaisesRegex(
                    builder.EvidenceError,
                    "pre-sample movement summary",
                ):
                    builder.parse_perf_run(record)

    def test_repeated_moving_rejects_duplicate_summary_key(self) -> None:
        record = _authoritative_earth_moving_record()
        record["stdout"] = record["stdout"].replace(
            "click_limit=60",
            "click_limit=60 click_limit=60",
            1,
        )
        with self.assertRaisesRegex(
            builder.EvidenceError,
            "movement summary repeats key: click_limit",
        ):
            builder.parse_perf_run(record)


class PerformanceAggregationTests(unittest.TestCase):
    def test_aggregate_uses_median_run_mean_and_full_envelope(self) -> None:
        records = [
            _record_at_mean("map", "candidate", "idle", repetition, value)
            for repetition, value in enumerate((0.2, 0.9, 0.22), 1)
        ]
        aggregated = builder.aggregate_perf_runs(records)
        self.assertEqual(aggregated["repetitionCount"], 3)
        self.assertEqual(aggregated["samples"], 24)
        self.assertEqual(aggregated["measurementFrames"], 1440)
        self.assertEqual(
            aggregated["processTotalMsMinMeanMax"],
            [0.2, 0.22, 0.9],
        )
        self.assertEqual(
            aggregated["runMeanValues"]["processTotalMs"],
            [0.2, 0.9, 0.22],
        )
        self.assertEqual(
            aggregated["processScopeTotalMsMinMeanMax"],
            [0.4, 0.4, 0.4],
        )
        self.assertEqual(
            aggregated["runMeanValues"]["processScopeTotalMs"],
            [0.4, 0.4, 0.4],
        )

    def test_moving_aggregation_preserves_input_invariants(self) -> None:
        records = [
            _record_at_mean("map", "candidate", "moving", repetition, value)
            for repetition, value in enumerate((0.2, 0.3, 0.25), 1)
        ]
        aggregated = builder.aggregate_perf_runs(records)
        self.assertEqual(aggregated["clicks"], 180)
        self.assertEqual(aggregated["accepted"], 180)
        self.assertEqual(aggregated["resolved"], 60)
        self.assertEqual(aggregated["applied"], 57)
        self.assertEqual(aggregated["avgInputUs"], 2)
        self.assertEqual(aggregated["maxInputUs"], 9)
        self.assertTrue(aggregated["finalTargetMatched"])
        self.assertEqual(
            len(aggregated["workloadIdentityByRepetition"]),
            3,
        )

    def test_aggregate_rejects_non_contiguous_or_even_repetitions(self) -> None:
        non_contiguous = [
            _record_at_mean("map", "candidate", "idle", repetition, 0.2)
            for repetition in (1, 3, 5)
        ]
        with self.assertRaisesRegex(builder.EvidenceError, "contiguous"):
            builder.aggregate_perf_runs(non_contiguous)
        even = [
            _record_at_mean("map", "candidate", "idle", repetition, 0.2)
            for repetition in (1, 2, 3, 4)
        ]
        with self.assertRaisesRegex(builder.EvidenceError, "odd run count"):
            builder.aggregate_perf_runs(even)

    def _build_report(
        self,
        root: Path,
        candidate_idle_scope_values: tuple[float, float, float],
        *,
        candidate_moving_scope_values: tuple[float, float, float] = (
            0.3,
            0.9,
            0.31,
        ),
        candidate_moving_sequence_sha256: str | None = None,
        build_identity: str = "test-build",
        receipt_mutator: Callable[[list[dict]], None] | None = None,
    ) -> dict:
        godot_root = root / "client/godot"
        evidence = godot_root / "assets/maps/test/evidence"
        evidence.mkdir(parents=True)
        data_root = godot_root / "data"
        data_root.mkdir(parents=True)
        for catalog_name in (
            "map_visual_catalog.json",
            "map_visual_review_catalog.json",
        ):
            (data_root / catalog_name).write_text(
                json.dumps({"entries": []}),
                encoding="utf-8",
            )
        records = []
        process_scope_values = {
            ("baseline", "idle"): (0.2, 0.9, 0.21),
            ("candidate", "idle"): candidate_idle_scope_values,
            ("baseline", "moving"): (0.2, 0.8, 0.21),
            ("candidate", "moving"): candidate_moving_scope_values,
        }
        for map_id, variant, mode, repetition in builder.expected_performance_matrix(
            ["map"],
            3,
        ):
            record = _record_at_mean(
                map_id,
                variant,
                mode,
                repetition,
                0.05,
                process_scope_mean=process_scope_values[(variant, mode)][
                    repetition - 1
                ],
            )
            record["buildIdentity"] = build_identity
            if (
                candidate_moving_sequence_sha256 is not None
                and variant == "candidate"
                and mode == "moving"
            ):
                record["stdout"] = record["stdout"].replace(
                    "c" * 64,
                    candidate_moving_sequence_sha256,
                )
            records.append(record)
        if receipt_mutator is not None:
            receipt_mutator(records)
        receipt = evidence / "performance-runner-receipt.jsonl"
        receipt.write_text(
            "".join(json.dumps(record) + "\n" for record in records),
            encoding="utf-8",
        )
        with (
            mock.patch.object(builder, "GODOT_ROOT", godot_root),
            mock.patch.dict(
                builder.MAP_BUNDLES,
                {
                    TEST_PERFORMANCE_BUNDLE_ID: (
                        "assets/maps/test",
                        ("map",),
                    )
                },
                clear=True,
            ),
        ):
            output = builder.build_performance_report(
                TEST_PERFORMANCE_BUNDLE_ID,
                build_id="test-build",
                update_manifest_ref=False,
            )
        return json.loads(output.read_text(encoding="utf-8"))

    def _build_legacy_report(self, root: Path) -> dict:
        godot_root = root / "client/godot"
        evidence = godot_root / "assets/maps/test/evidence"
        evidence.mkdir(parents=True)
        records = []
        for variant in ("baseline", "candidate"):
            for mode in ("idle", "moving"):
                record = _record(mode)
                record.update(
                    {
                        "mapId": "map",
                        "variant": variant,
                        "mode": mode,
                        "endedAtUtc": "2026-08-26T00:00:00Z",
                    }
                )
                records.append(record)
        (evidence / "performance-runner-receipt.jsonl").write_text(
            "".join(json.dumps(record) + "\n" for record in records),
            encoding="utf-8",
        )
        with (
            mock.patch.object(builder, "GODOT_ROOT", godot_root),
            mock.patch.dict(
                builder.MAP_BUNDLES,
                {
                    TEST_PERFORMANCE_BUNDLE_ID: (
                        "assets/maps/test",
                        ("map",),
                    )
                },
                clear=True,
            ),
        ):
            output = builder.build_performance_report(
                TEST_PERFORMANCE_BUNDLE_ID,
                build_id="legacy-build-identity-is-not-required",
                update_manifest_ref=False,
            )
        return json.loads(output.read_text(encoding="utf-8"))

    def test_report_uses_process_scope_medians_and_explicit_schema(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            report = self._build_report(
                Path(temporary),
                (0.29, 0.95, 0.30),
            )
        entry = report["maps"][0]
        self.assertEqual(report["repetitionCount"], 3)
        self.assertEqual(
            report["metricScope"]["comparisonAndGateMetric"],
            "processScopeTotalMsMinMeanMax",
        )
        self.assertEqual(
            entry["baseline"]["idle"]["processScopeTotalMsMinMeanMax"][1],
            0.21,
        )
        self.assertEqual(
            entry["candidate"]["idle"]["processScopeTotalMsMinMeanMax"][1],
            0.3,
        )
        self.assertEqual(
            entry["candidate"]["idle"]["processTotalMsMinMeanMax"][1],
            0.05,
        )
        self.assertEqual(
            entry["comparison"]["processScopeTotalMeanDeltaMs"]["idle"],
            0.09,
        )
        self.assertEqual(
            entry["comparison"]["pairedAggregation"][
                "medianProcessScopeTotalMeanDeltaMs"
            ]["idle"],
            0.09,
        )
        self.assertEqual(
            entry["comparison"]["thresholds"],
            builder.PROCESS_SCOPE_THRESHOLDS,
        )
        self.assertNotIn("processTotalMeanDeltaMs", entry["comparison"])

    def test_legacy_v1_report_keeps_process_total_schema(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            report = self._build_legacy_report(Path(temporary))
        entry = report["maps"][0]
        self.assertEqual(report["aggregationMode"], "legacy_single_run")
        self.assertEqual(
            report["metricScope"]["comparisonAndGateMetric"],
            "processTotalMsMinMeanMax",
        )
        self.assertEqual(
            entry["comparison"]["processTotalMeanDeltaMs"],
            {"idle": 0.0, "moving": 0.0},
        )
        self.assertEqual(
            entry["comparison"]["thresholds"],
            builder.LEGACY_PROCESS_THRESHOLDS,
        )
        self.assertNotIn("processScopeTotalMeanDeltaMs", entry["comparison"])

    def test_report_rejects_process_scope_absolute_overage_when_custom_total_passes(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            with self.assertRaisesRegex(
                builder.EvidenceError,
                "'candidateIdleWithinLimit': False",
            ):
                self._build_report(
                    Path(temporary),
                    (0.51, 0.99, 0.52),
                )
        with tempfile.TemporaryDirectory() as temporary:
            with self.assertRaisesRegex(
                builder.EvidenceError,
                "'candidateMovingWithinLimit': False",
            ):
                self._build_report(
                    Path(temporary),
                    (0.29, 0.95, 0.30),
                    candidate_moving_scope_values=(0.61, 0.99, 0.62),
                )

    def test_report_rejects_process_scope_regression_when_custom_total_passes(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            with self.assertRaisesRegex(
                builder.EvidenceError,
                "'candidateIdleWithinLimit': True,.*"
                "'idleRegressionWithinLimit': False",
            ):
                self._build_report(
                    Path(temporary),
                    (0.31, 0.99, 0.32),
                )
        with tempfile.TemporaryDirectory() as temporary:
            with self.assertRaisesRegex(
                builder.EvidenceError,
                "'candidateMovingWithinLimit': True,.*"
                "'movingRegressionWithinLimit': False",
            ):
                self._build_report(
                    Path(temporary),
                    (0.29, 0.95, 0.30),
                    candidate_moving_scope_values=(0.56, 0.99, 0.57),
                )

    def test_report_rejects_paired_process_scope_regression(self) -> None:
        # Difference-of-medians is exactly 0.100, but two of three paired
        # repetitions regress by more than 0.100. The stricter paired gate must
        # reject this instead of letting reordered noise cancel the regression.
        with tempfile.TemporaryDirectory() as temporary:
            with self.assertRaisesRegex(builder.EvidenceError, "threshold failed"):
                self._build_report(
                    Path(temporary),
                    (0.31, 1.02, 0.10),
                )

    def test_expected_matrix_reverses_even_repetition_variant_order(self) -> None:
        matrix = builder.expected_performance_matrix(["map"], 3)
        even_idle = [
            variant
            for map_id, variant, mode, repetition in matrix
            if map_id == "map" and mode == "idle" and repetition == 2
        ]
        even_moving = [
            variant
            for map_id, variant, mode, repetition in matrix
            if map_id == "map" and mode == "moving" and repetition == 2
        ]
        self.assertEqual(even_idle, ["candidate", "baseline"])
        self.assertEqual(even_moving, ["candidate", "baseline"])

    def test_report_rejects_shuffled_receipt_order(self) -> None:
        def swap_first_pair(records: list[dict]) -> None:
            records[0], records[1] = records[1], records[0]

        with tempfile.TemporaryDirectory() as temporary:
            with self.assertRaisesRegex(builder.EvidenceError, "execution order"):
                self._build_report(
                    Path(temporary),
                    (0.29, 0.30, 0.31),
                    receipt_mutator=swap_first_pair,
                )

    def test_report_rejects_unreversed_even_repetition_order(self) -> None:
        def restore_baseline_first_on_even_run(records: list[dict]) -> None:
            even_idle_indexes = [
                index
                for index, record in enumerate(records)
                if record["repetition"] == 2 and record["mode"] == "idle"
            ]
            self.assertEqual(
                [records[index]["variant"] for index in even_idle_indexes],
                ["candidate", "baseline"],
            )
            first, second = even_idle_indexes
            records[first], records[second] = records[second], records[first]

        with tempfile.TemporaryDirectory() as temporary:
            with self.assertRaisesRegex(builder.EvidenceError, "execution order"):
                self._build_report(
                    Path(temporary),
                    (0.29, 0.30, 0.31),
                    receipt_mutator=restore_baseline_first_on_even_run,
                )

    def test_report_rejects_stale_build_and_mismatched_workload(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            with self.assertRaisesRegex(builder.EvidenceError, "stale"):
                self._build_report(
                    Path(temporary),
                    (0.29, 0.30, 0.31),
                    build_identity="old-build",
                )
        with tempfile.TemporaryDirectory() as temporary:
            with self.assertRaisesRegex(builder.EvidenceError, "workload mismatch"):
                self._build_report(
                    Path(temporary),
                    (0.29, 0.30, 0.31),
                    candidate_moving_sequence_sha256="d" * 64,
                )

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
