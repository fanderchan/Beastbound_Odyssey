"""Execute the map matrix in one contained native window, then seal receipts."""

from __future__ import annotations

import json
import os
from pathlib import Path
import re
import shutil
from typing import Any
import uuid

import godot_qa_user_data_lane as lane
import map_performance_batch_contract as contract
import map_visual_evidence_builder as builder
import record_pet_management_owner_review as core


def plan_for(bundle_id: str, repetitions: int, executable: str) -> dict[str, Any]:
    if repetitions < 3 or repetitions > 9 or repetitions % 2 != 1:
        raise builder.EvidenceError("batch repetitions must be odd, from 3 to 9")
    _root, maps = builder.MAP_BUNDLES[bundle_id]
    return {
        "schemaVersion": 1, "strategy": contract.STRATEGY,
        "mainScene": contract.MAIN_SCENE, "bundleId": bundle_id,
        "focusPolicy": "foreground_drawable_required_v2",
        "repetitions": repetitions, "buildIdentity": builder.build_identity(),
        "sourceIdentity": contract.source_identity(builder.REPO_ROOT),
        "executableSha256": builder._sha256(Path(executable)),
        "samples": [dict(zip(("mapId", "variant", "mode", "repetition"), case))
                    for case in builder.expected_performance_matrix(maps, repetitions)],
    }


def split_log(text: str, plan: dict[str, Any]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Keep verbatim sample output; reject partial/interleaved runs and errors."""
    if re.search(r"(?m)^(?:SCRIPT ERROR:|ERROR:|WARNING:.*(?:leak|RID))", text):
        raise builder.EvidenceError("Godot error or resource leak in batch log")
    lines = text.splitlines(keepends=True)
    samples: list[dict[str, Any]] = []
    start: dict[str, Any] | None = None
    chunk_start = 0
    completion: dict[str, Any] | None = None
    completion_line = ""
    for line_index, line in enumerate(lines):
        if line.startswith(contract.START_PREFIX):
            if (start is not None or completion is not None
                    or (samples and "drainStdout" not in samples[-1])):
                raise builder.EvidenceError("interleaved performance sample starts")
            start = json.loads(line[len(contract.START_PREFIX):])
            if start.get("sampleIndex") != len(samples):
                raise builder.EvidenceError("performance samples out of order")
        elif line.startswith(contract.END_PREFIX):
            if start is None:
                raise builder.EvidenceError("performance sample end has no start")
            ending = json.loads(line[len(contract.END_PREFIX):])
            samples.append({"start": start, "end": ending,
                            "stdout": "".join(lines[chunk_start:line_index + 1])})
            chunk_start = line_index + 1
            start = None
        elif line.startswith(contract.DRAIN_PREFIX):
            drain = json.loads(line[len(contract.DRAIN_PREFIX):])
            if (start is not None or completion is not None or not samples
                    or "drainStdout" in samples[-1]
                    or drain.get("sampleIndex") != len(samples) - 1):
                raise builder.EvidenceError("missing or interleaved prefetch cleanup")
            samples[-1]["drainStdout"] = line
            chunk_start = line_index + 1
        elif line.startswith(contract.FINISH_PREFIX):
            if completion is not None or start is not None:
                raise builder.EvidenceError("duplicate or early batch completion")
            completion = json.loads(line[len(contract.FINISH_PREFIX):])
            completion_line = line
    if (start is not None or len(samples) != len(plan["samples"])
            or completion is None or completion.get("status") != "passed"
            or any("drainStdout" not in sample for sample in samples)):
        raise builder.EvidenceError("performance batch did not finish its full plan")
    for sample in samples:
        sample["cleanupStdout"] = sample.pop("drainStdout") + completion_line
    return samples, completion


def _save(path: Path, value: dict[str, Any]) -> None:
    core._write_secure_json(path, value)


def run_batch(*, bundle_id: str, repetitions: int, executable: str,
              run_dir: Path, build_identity: str) -> list[dict[str, Any]]:
    # Reuse the established lane validators without changing their contract.
    import run_map_visual_performance_evidence as runner

    resolved = shutil.which(executable)
    if resolved is None:
        raise builder.EvidenceError(f"Godot executable not found: {executable}")
    executable = str(Path(resolved).resolve())
    runner._probe_godot_version(executable)
    plan = plan_for(bundle_id, repetitions, executable)
    if plan["buildIdentity"] != build_identity:
        raise builder.EvidenceError("build identity drift before batch")
    run_dir.mkdir(parents=True, exist_ok=False)
    plan_path = run_dir / "plan.json"
    # These canonical bytes are hashed by both Python and Godot.
    plan_path.write_text(json.dumps(plan, ensure_ascii=False, sort_keys=True,
                                    separators=(",", ":")), encoding="utf-8")
    plan_sha = contract.sha256(plan)
    owner = uuid.uuid4().hex
    _save(run_dir / "lane-owner.json", {"lane": runner.QA_LANE, "owner": owner})
    lifecycle: dict[str, Any] = {"status": "preparing", "owner": owner,
                               "planSha256": plan_sha}
    lifecycle_path = run_dir / "qa-lane-lifecycle.json"
    _save(lifecycle_path, lifecycle)
    prepared = lane.prepare_lane(runner.QA_LANE,
                                 os.environ.get("GODOT_EDITOR_CUSTOM_FEATURES", ""), owner)
    lifecycle.update(status="prepared", prepared=prepared)
    _save(lifecycle_path, lifecycle)
    environment = runner._lane_environment(prepared, base_environment=dict(os.environ))
    environment[contract.PLAN_ENV] = str(plan_path.resolve())
    environment[contract.PLAN_SHA_ENV] = plan_sha
    command = contract.command(executable)
    process: dict[str, Any] | None = None
    verified: dict[str, Any] | None = None
    samples: list[dict[str, Any]] = []
    completion: dict[str, Any] = {}
    failure: BaseException | None = None
    started = runner._utc_now()
    try:
        process = core._run_godot_with_settlement(
            command, phase="native", log_path=run_dir / "godot.log",
            timeout_seconds=120 + len(plan["samples"]) * 25,
            environment=environment,
        )
        lifecycle["process"] = process
        core._require_contained_godot_process(process, "native")
        if process["exitCode"] != 0:
            raise builder.EvidenceError(f"performance batch exited {process['exitCode']}")
        raw = (run_dir / "godot.log").read_text(encoding="utf-8")
        samples, completion = split_log(raw, plan)
        # Each fresh Main attests the same owner-bound isolated directory.
        for sample in samples:
            runner._parse_qa_lane_attestation(sample["stdout"], prepared)
        if (builder.build_identity() != build_identity
                or contract.source_identity(builder.REPO_ROOT) != plan["sourceIdentity"]
                or builder._sha256(Path(executable)) != plan["executableSha256"]):
            raise builder.EvidenceError("source or binary changed during performance batch")
    except BaseException as error:
        failure = error
        lifecycle["failure"] = {"type": type(error).__name__, "message": str(error)}
    finally:
        # Unknown containment retains the owner record and QA lane. Known
        # contained failures clean up but can never install formal evidence.
        contained = process is not None and process.get("leaderReaped") is True and process.get("processGroupClosed") is True
        if not contained:
            lifecycle["status"] = "preserved_unknown_process_containment"
            _save(lifecycle_path, lifecycle)
        else:
            verified = lane.verify_lane(runner.QA_LANE, owner, prepared["realInventorySha256"])
            cleaned = lane.cleanup_lane(runner.QA_LANE, owner, prepared["realInventorySha256"])
            inspected = lane.inspect_lane(runner.QA_LANE, owner)
            runner._validate_lane_cleanup(prepared, verified, cleaned, inspected)
            lifecycle.update(status="cleaned", verified=verified, cleanup=cleaned,
                             postCleanupInspection=inspected)
            _save(lifecycle_path, lifecycle)
    if failure is not None:
        raise failure
    if verified is None or process is None:
        raise builder.EvidenceError("performance batch has no verified cleanup")
    ended = runner._utc_now()
    records: list[dict[str, Any]] = []
    for case, sample in zip(plan["samples"], samples):
        record = {
            "schemaVersion": 2, "recordType": "beastbound_map_performance_runner_receipt",
            "bundleId": bundle_id, **case, "buildIdentity": build_identity,
            **builder.performance_evidence_tool_hashes(),
            "runner": "godot", "runnerVersion": builder.RUNNER_VERSION,
            "argv": command, "startedAtUtc": started, "endedAtUtc": ended,
            "returncode": process["exitCode"],
            "stdout": runner._sanitize_qa_lane_evidence_text(sample["stdout"], prepared),
            "stderr": "",
            "samplingContract": {
                "version": 2, "warmupFrames": builder.PERF_WARMUP_FRAMES,
                "measurementFrames": builder.PERF_MEASUREMENT_FRAMES,
                "sampleFrames": builder.PERF_SAMPLE_FRAMES,
                "measurementBoundary": "shared_input_then_fixed_frames" if case["mode"] == "moving" else "post_warmup_fixed_frames",
                "audioPlaybackDisabled": True, "cleanExitRequired": True,
                "processScopeMonitor": "process_priority_boundary_v1",
                "movingWorkloadContract": builder.MOVING_WORKLOAD_CONTRACT if case["mode"] == "moving" else None,
            },
            "qaLane": {
                "attestation": runner._public_qa_lane_attestation(runner._parse_qa_lane_attestation(sample["stdout"], prepared)),
                "verified": True, "realUnchanged": True, "laneAbsentAfterCleanup": True,
                "realInventorySha256": prepared["realInventorySha256"],
                "postCleanupInspectionSha256": lifecycle["postCleanupInspection"]["inspectionSha256"],
            },
            "batch": {
                "strategy": contract.STRATEGY, "plan": plan, "planSha256": plan_sha,
                "start": sample["start"], "end": sample["end"], "completion": completion,
                "cleanupStdout": sample["cleanupStdout"],
                "processSettled": True, "windowClosedAfterCleanup": True,
            },
        }
        builder.parse_perf_run(record)
        records.append(record)
    contract.validate_matrix(records)
    return records
