"""Shared, versioned contract for one-window map performance sampling.

The fixed-step workload is unchanged. Each sample owns a fresh Main instance;
only the native window and process resource cache are shared. This is steady
state CPU evidence, never a cold-start or observed display-FPS benchmark.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

CONTROLLER = "res://scripts/qa/map_performance_batch.gd"
MAIN_SCENE = "res://scenes/Main.tscn"
STRATEGY = "single_window_fresh_main_v1"
PLAN_ENV = "BEASTBOUND_MAP_PERF_BATCH_PLAN"
PLAN_SHA_ENV = "BEASTBOUND_MAP_PERF_BATCH_PLAN_SHA256"
START_PREFIX = "map performance sample start: "
END_PREFIX = "map performance sample end: "
FINISH_PREFIX = "map performance batch complete: "
DRAIN_PREFIX = "map performance prefetch drain: "
SOURCE_PATHS = (
    "tools/run_map_visual_performance_evidence.py",
    "tools/map_visual_evidence_builder.py",
    "tools/map_performance_batch_contract.py",
    "tools/map_performance_batch.py",
    "tools/record_pet_management_owner_review.py",
    "tools/godot_qa_user_data_lane.py",
    "client/godot/scripts/qa/map_performance_batch.gd",
    "client/godot/scripts/qa/perf_probe_exit_controller.gd",
    "client/godot/scripts/qa/runtime_exit_cleanup.gd",
)


def command(executable: str) -> list[str]:
    return [
        executable, "--path", "client/godot", "--script", CONTROLLER,
        "--windowed", "--resolution", "1280x720", "--single-window",
        "--audio-driver", "Dummy", "--fixed-fps", "60", "--time-scale", "1.0",
        "--disable-vsync", "--", "--beastbound-qa-user-data-lane=automation",
        "--perf-probe", "--perf-probe-warmup-frames=180",
        "--perf-probe-sample-frames=60", "--perf-probe-clean-exit-frames=480",
    ]


def source_identity(root: Path) -> dict[str, str]:
    return {path: hashlib.sha256((root / path).read_bytes()).hexdigest()
            for path in SOURCE_PATHS}


def sha256(value: Any) -> str:
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True,
                                    separators=(",", ":")).encode()).hexdigest()


def validate_binding(record: dict[str, Any]) -> None:
    """Reject stale, spliced or incomplete sample/window lifecycle evidence."""
    batch = record.get("batch")
    if not isinstance(batch, dict) or set(batch) != {
        "strategy", "plan", "planSha256", "start", "end", "completion",
        "processSettled", "windowClosedAfterCleanup", "cleanupStdout",
    }:
        raise ValueError("invalid performance batch binding")
    plan = batch["plan"]
    if (batch["strategy"] != STRATEGY or not isinstance(plan, dict)
            or sha256(plan) != batch["planSha256"]
            or plan.get("strategy") != STRATEGY
            or plan.get("mainScene") != MAIN_SCENE
            or plan.get("focusPolicy") != "foreground_required_v1"
            or plan.get("buildIdentity") != record.get("buildIdentity")
            or plan.get("bundleId") != record.get("bundleId")
            or batch["processSettled"] is not True
            or batch["windowClosedAfterCleanup"] is not True):
        raise ValueError("performance batch plan/cleanup identity mismatch")
    argv = record.get("argv", [])
    if not argv or argv != command(argv[0]):
        raise ValueError("performance batch argv is not canonical")
    start, end, completion = batch["start"], batch["end"], batch["completion"]
    if not all(isinstance(value, dict) for value in (start, end, completion)):
        raise ValueError("performance batch lifecycle must be objects")
    for prefix, boundary in ((START_PREFIX, start), (END_PREFIX, end)):
        raw = [line[len(prefix):] for line in str(record.get("stdout", "")).splitlines()
               if line.startswith(prefix)]
        if len(raw) != 1 or json.loads(raw[0]) != boundary:
            raise ValueError("performance batch boundary does not match raw output")
    index = start.get("sampleIndex")
    samples = plan.get("samples", [])
    if type(index) is not int or not 0 <= index < len(samples):
        raise ValueError("performance batch sample index is invalid")
    case = {key: record.get(key) for key in ("mapId", "variant", "mode", "repetition")}
    if start.get("sample") != case or samples[index] != case:
        raise ValueError("performance batch sample does not match its plan")
    for key in ("processId", "rootWindowId", "mainInstanceId"):
        if type(start.get(key)) is not int or start[key] < 0 or end.get(key) != start[key]:
            raise ValueError(f"performance batch {key} changed")
    if start["processId"] <= 0 or start["mainInstanceId"] <= 0:
        raise ValueError("performance batch process/Main identity is empty")
    for boundary in (start, end):
        if (boundary.get("planSha256") != batch["planSha256"]
                or boundary.get("sampleIndex") != index
                or boundary.get("windowCount") != 1
                or boundary.get("mainCount") != 1
                or boundary.get("mainScene") != MAIN_SCENE
                or boundary.get("viewport") != [1280, 720]
                or boundary.get("windowMode") != 0
                or boundary.get("focused") is not True):
            raise ValueError("performance batch window/Main boundary mismatch")
    if (type(start.get("frame")) is not int or type(end.get("frame")) is not int
            or end["frame"] - start["frame"] < 660
            or type(end.get("focusObservedFrames")) is not int
            or end["focusObservedFrames"] < 660
            or type(end.get("unfocusedFrames")) is not int
            or end["unfocusedFrames"] != 0
            or end.get("exitCode") != 0):
        raise ValueError("performance batch sample did not complete cleanly")
    if (completion.get("status") != "passed"
            or completion.get("planSha256") != batch["planSha256"]
            or completion.get("processId") != start["processId"]
            or completion.get("rootWindowId") != start["rootWindowId"]
            or completion.get("windowCount") != 1
            or completion.get("completedSamples") != len(samples)
            or completion.get("releasedMainCount") != len(samples)
            or completion.get("remainingMainCount") != 0
            or completion.get("errors") != []):
        raise ValueError("performance batch final cleanup is incomplete")
    cleanup_lines = str(batch["cleanupStdout"]).splitlines()
    if (len(cleanup_lines) != 2 or not cleanup_lines[0].startswith(DRAIN_PREFIX)
            or not cleanup_lines[1].startswith(FINISH_PREFIX)
            or json.loads(cleanup_lines[1][len(FINISH_PREFIX):]) != completion):
        raise ValueError("performance batch cleanup does not match raw output")
    drain = json.loads(cleanup_lines[0][len(DRAIN_PREFIX):])
    if (not isinstance(drain, dict) or drain.get("sampleIndex") != index
            or not isinstance(drain.get("snapshot"), dict)
            or drain["snapshot"].get("inFlight") != 0
            or drain["snapshot"].get("retained") != 0):
        raise ValueError("performance batch prefetch cleanup is incomplete")
    root = Path(__file__).resolve().parents[1]
    if plan.get("sourceIdentity") != source_identity(root):
        raise ValueError("performance batch source identity is stale")


def validate_matrix(records: list[dict[str, Any]]) -> None:
    batched = ["batch" in record for record in records]
    if not any(batched):
        return
    if not all(batched):
        raise ValueError("performance matrix mixes batch and standalone runs")
    first = records[0]["batch"]
    seen_instances: set[int] = set()
    previous_end = -1
    for index, record in enumerate(records):
        validate_binding(record)
        batch = record["batch"]
        start, end = batch["start"], batch["end"]
        if (batch["plan"] != first["plan"]
                or batch["completion"] != first["completion"]
                or start["sampleIndex"] != index
                or start["mainInstanceId"] in seen_instances
                or start["frame"] <= previous_end):
            raise ValueError("performance batch order or fresh Main isolation failed")
        seen_instances.add(start["mainInstanceId"])
        previous_end = end["frame"]
    if len(records) != len(first["plan"]["samples"]):
        raise ValueError("performance batch is missing planned samples")
