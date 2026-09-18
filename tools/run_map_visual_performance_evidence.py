#!/usr/bin/env python3
"""Run the fixed Beastbound map performance matrix and freeze raw JSONL."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import os
import re
from pathlib import Path
import subprocess
import sys
from typing import Any
import uuid

import godot_qa_user_data_lane as lane_helper
import map_visual_evidence_builder as builder


REPO_ROOT = Path(__file__).resolve().parents[1]
GODOT = "godot"
QA_LANE = "automation"
QA_LANE_ARGUMENT = "--beastbound-qa-user-data-lane=automation"
QA_ATTESTATION_PREFIX = "BEASTBOUND_QA_USER_DATA_ATTESTATION: "
QA_FEATURE = "beastbound_qa_automation"
QA_CUSTOM_USER_DIR_NAME = "BeastboundOdysseyQA_Automation"
QA_USER_DATA_ROOT_REDACTION = "<QA_USER_DATA_ROOT>"
DEFAULT_REPETITIONS = 3
PERF_WARMUP_FRAMES = builder.PERF_WARMUP_FRAMES
PERF_MEASUREMENT_FRAMES = builder.PERF_MEASUREMENT_FRAMES
PERF_SAMPLE_FRAMES = builder.PERF_SAMPLE_FRAMES
MOVING_WORKLOAD_CONTRACT = builder.MOVING_WORKLOAD_CONTRACT
RUN_TIMEOUT_SECONDS = 120


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace(
        "+00:00", "Z"
    )


def _probe_godot_version(
    executable: str,
    *,
    runner: Any = subprocess.run,
) -> str:
    completed = runner(
        [executable, "--version"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
        timeout=15,
    )
    version = completed.stdout.strip()
    if completed.returncode != 0 or version != builder.RUNNER_VERSION:
        raise builder.EvidenceError(
            "Godot runner version does not match the frozen evidence contract"
        )
    return version


def _command(
    map_id: str,
    variant: str,
    mode: str,
) -> list[str]:
    return builder.expected_performance_argv(GODOT, map_id, variant, mode)


def _repetition_count(value: str) -> int:
    try:
        count = int(value)
    except ValueError as error:
        raise argparse.ArgumentTypeError("repetitions must be an integer") from error
    if count < 3 or count % 2 == 0:
        raise argparse.ArgumentTypeError(
            "repetitions must be an odd integer greater than or equal to 3"
        )
    return count


def _performance_matrix(
    map_ids: tuple[str, ...] | list[str],
    repetitions: int,
) -> list[tuple[str, str, str, int]]:
    """Pair baseline/candidate runs closely while keeping runs independent."""
    return builder.expected_performance_matrix(map_ids, repetitions)


def _lane_environment(
    prepared: dict[str, Any],
    *,
    base_environment: dict[str, str],
) -> dict[str, str]:
    editor_features = [
        value.strip()
        for value in str(prepared.get("editorCustomFeatures", "")).split(",")
        if value.strip()
    ]
    if (
        prepared.get("status") != "prepared"
        or prepared.get("lane") != QA_LANE
        or prepared.get("feature") != QA_FEATURE
        or prepared.get("customUserDirName") != QA_CUSTOM_USER_DIR_NAME
        or not str(prepared.get("godotLaneRoot", "")).strip()
        or QA_FEATURE not in editor_features
    ):
        raise builder.EvidenceError("QA lane prepare identity is invalid")
    environment = dict(base_environment)
    environment.update(
        {
            "GODOT_EDITOR_CUSTOM_FEATURES": str(prepared["editorCustomFeatures"]),
            "BEASTBOUND_QA_USER_DATA_LANE": QA_LANE,
            "BEASTBOUND_QA_EXPECTED_USER_DATA_ROOT": str(prepared["godotLaneRoot"]),
        }
    )
    return environment


def _parse_qa_lane_attestation(
    text: str,
    prepared: dict[str, Any],
) -> dict[str, str]:
    lines = [
        line
        for line in text.splitlines()
        if QA_ATTESTATION_PREFIX in line
    ]
    if len(lines) != 1 or not lines[0].startswith(QA_ATTESTATION_PREFIX):
        raise builder.EvidenceError(
            f"performance run must emit exactly one QA lane attestation; got {len(lines)}"
        )
    try:
        payload = json.loads(lines[0][len(QA_ATTESTATION_PREFIX) :])
    except json.JSONDecodeError as error:
        raise builder.EvidenceError("invalid QA lane attestation JSON") from error
    expected = {
        "customUserDirName": QA_CUSTOM_USER_DIR_NAME,
        "feature": QA_FEATURE,
        "lane": QA_LANE,
        "status": "passed",
        "userDataRoot": str(prepared["godotLaneRoot"]),
    }
    if payload != expected:
        raise builder.EvidenceError("QA lane attestation identity mismatch")
    return expected


def _sanitize_qa_lane_evidence_text(
    text: str,
    prepared: dict[str, Any],
) -> str:
    """Redact the validated machine-local QA root before evidence is persisted."""
    user_data_root = str(prepared.get("godotLaneRoot", "")).strip()
    if not user_data_root:
        raise builder.EvidenceError("QA lane root is missing before evidence redaction")
    sanitized = text.replace(user_data_root, QA_USER_DATA_ROOT_REDACTION)
    if user_data_root in sanitized:
        raise builder.EvidenceError("QA lane root remained after evidence redaction")
    return sanitized


def _public_qa_lane_attestation(
    attestation: dict[str, str],
) -> dict[str, str]:
    public = dict(attestation)
    public["userDataRoot"] = QA_USER_DATA_ROOT_REDACTION
    return public


def _diagnostic_tail(value: str, limit: int = 2000) -> str:
    compact = "\\n".join(line.rstrip() for line in value.splitlines() if line.strip())
    if len(compact) <= limit:
        return compact
    return "<truncated>" + compact[-limit:]


def _validate_lane_cleanup(
    prepared: dict[str, Any],
    verified: dict[str, Any] | None,
    cleaned: dict[str, Any],
    inspected: dict[str, Any],
) -> None:
    if verified is not None and (
        verified.get("status") != "verified"
        or verified.get("lane") != QA_LANE
        or verified.get("owner") != prepared.get("owner")
        or verified.get("realUnchanged") is not True
        or verified.get("realInventorySha256")
        != prepared.get("realInventorySha256")
    ):
        raise builder.EvidenceError("QA lane verification identity mismatch")
    if (
        cleaned.get("status") != "cleaned"
        or cleaned.get("lane") != QA_LANE
        or cleaned.get("owner") != prepared.get("owner")
        or cleaned.get("laneAbsent") is not True
        or cleaned.get("realUnchanged") is not True
        or cleaned.get("realInventorySha256")
        != prepared.get("realInventorySha256")
    ):
        raise builder.EvidenceError("QA lane cleanup did not prove isolation")
    if (
        inspected.get("status") != "inspected"
        or inspected.get("lane") != QA_LANE
        or inspected.get("owner") != prepared.get("owner")
        or inspected.get("laneRootState") != "absent"
        or inspected.get("pendingLockState") != "absent"
        or inspected.get("publishedLockState") != "absent"
        or inspected.get("realInventorySha256")
        != prepared.get("realInventorySha256")
    ):
        raise builder.EvidenceError("QA lane post-clean inspection failed")


def _run(
    command: list[str],
    bundle_id: str,
    map_id: str,
    variant: str,
    mode: str,
    *,
    repetition: int = 1,
    build_identity: str,
    runner_version: str,
    runner: Any = subprocess.run,
    lane_api: Any = lane_helper,
    base_environment: dict[str, str] | None = None,
) -> dict[str, Any]:
    if runner_version != builder.RUNNER_VERSION:
        raise builder.EvidenceError("Godot runner version is invalid")
    base = dict(os.environ if base_environment is None else base_environment)
    owner = uuid.uuid4().hex
    prepared = dict(
        lane_api.prepare_lane(
            QA_LANE,
            str(base.get("GODOT_EDITOR_CUSTOM_FEATURES", "")),
            owner,
        )
    )
    started = _utc_now()
    record: dict[str, Any] | None = None
    verified: dict[str, Any] | None = None
    primary_error: BaseException | None = None
    try:
        environment = _lane_environment(prepared, base_environment=base)
        completed = runner(
            command,
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
            check=False,
            env=environment,
            timeout=RUN_TIMEOUT_SECONDS,
        )
        ended = _utc_now()
        attestation = _parse_qa_lane_attestation(
            completed.stdout + completed.stderr,
            prepared,
        )
        public_stdout = _sanitize_qa_lane_evidence_text(completed.stdout, prepared)
        public_stderr = _sanitize_qa_lane_evidence_text(completed.stderr, prepared)
        record = {
            "schemaVersion": 1,
            "recordType": "beastbound_map_performance_runner_receipt",
            "bundleId": bundle_id,
            "mapId": map_id,
            "variant": variant,
            "mode": mode,
            "repetition": repetition,
            "buildIdentity": build_identity,
            **builder.performance_evidence_tool_hashes(),
            "samplingContract": {
                "version": 2,
                "warmupFrames": PERF_WARMUP_FRAMES,
                "measurementFrames": PERF_MEASUREMENT_FRAMES,
                "sampleFrames": PERF_SAMPLE_FRAMES,
                "measurementBoundary": (
                    "shared_input_then_fixed_frames"
                    if mode == "moving"
                    else "post_warmup_fixed_frames"
                ),
                "audioPlaybackDisabled": True,
                "cleanExitRequired": True,
                "processScopeMonitor": "process_priority_boundary_v1",
                "movingWorkloadContract": (
                    MOVING_WORKLOAD_CONTRACT if mode == "moving" else None
                ),
            },
            "runner": "godot",
            "runnerVersion": runner_version,
            "argv": command,
            "startedAtUtc": started,
            "endedAtUtc": ended,
            "returncode": completed.returncode,
            "stdout": public_stdout,
            "stderr": public_stderr,
            "qaLane": {"attestation": _public_qa_lane_attestation(attestation)},
        }
        # Validate each run before it can enter the frozen receipt. Preserve a
        # bounded, already-redacted diagnostic tail when Godot exits abnormally
        # so a failed matrix cannot collapse into an unactionable generic error.
        try:
            builder.parse_perf_run(record)
        except builder.EvidenceError as error:
            raise builder.EvidenceError(
                f"{error}; stdout_tail={_diagnostic_tail(public_stdout)!r}; "
                f"stderr_tail={_diagnostic_tail(public_stderr)!r}"
            ) from error
        verified = dict(
            lane_api.verify_lane(
                QA_LANE,
                str(prepared["owner"]),
                str(prepared["realInventorySha256"]),
            )
        )
    except BaseException as error:
        primary_error = error

    cleanup_error: BaseException | None = None
    cleaned: dict[str, Any] = {}
    inspected: dict[str, Any] = {}
    try:
        cleaned = dict(
            lane_api.cleanup_lane(
                QA_LANE,
                str(prepared["owner"]),
                str(prepared["realInventorySha256"]),
            )
        )
        inspected = dict(lane_api.inspect_lane(QA_LANE, str(prepared["owner"])))
        _validate_lane_cleanup(prepared, verified, cleaned, inspected)
    except BaseException as error:
        cleanup_error = error

    if cleanup_error is not None:
        if primary_error is not None:
            raise builder.EvidenceError(
                f"performance run failed ({primary_error}) and QA lane cleanup failed ({cleanup_error})"
            ) from cleanup_error
        raise builder.EvidenceError(
            f"QA lane cleanup failed: {cleanup_error}"
        ) from cleanup_error
    if primary_error is not None:
        raise primary_error
    if record is None or verified is None:
        raise builder.EvidenceError("performance run did not produce a validated record")
    record["qaLane"].update(
        {
            "verified": True,
            "realUnchanged": True,
            "laneAbsentAfterCleanup": True,
            "realInventorySha256": str(cleaned["realInventorySha256"]),
            "postCleanupInspectionSha256": str(inspected["inspectionSha256"]),
        }
    )
    return record


def _write_receipt(
    path: Path,
    records: list[dict[str, Any]],
    *,
    replace_existing: bool,
) -> None:
    payload = "".join(
        json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n"
        for value in records
    )
    temp = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    if temp.exists():
        raise builder.EvidenceError(f"receipt temp already exists: {temp}")
    try:
        with temp.open("x", encoding="utf-8") as stream:
            stream.write(payload)
            stream.flush()
            os.fsync(stream.fileno())
        if replace_existing:
            os.replace(temp, path)
        else:
            try:
                os.link(temp, path)
            except FileExistsError as error:
                raise builder.EvidenceError(
                    f"refusing to overwrite receipt: {path}"
                ) from error
            temp.unlink()
    finally:
        temp.unlink(missing_ok=True)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--build-identity",
        required=True,
        help="Must equal the current map runtime identity.",
    )
    parser.add_argument(
        "--bundle-id",
        action="append",
        choices=tuple(builder.MAP_BUNDLES),
        required=True,
        help="Run the selected bundle; may be repeated.",
    )
    parser.add_argument(
        "--replace-existing",
        action="store_true",
        help="Atomically replace an existing receipt after every new run validates.",
    )
    parser.add_argument(
        "--repetitions",
        type=_repetition_count,
        default=DEFAULT_REPETITIONS,
        help=(
            "Fresh Main samples per map/variant/mode in one window. Odd, 3 to 9; "
            f"defaults to {DEFAULT_REPETITIONS}."
        ),
    )
    parser.add_argument("--godot", default=GODOT)
    parser.add_argument("--run-id", default=datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ"))
    parser.add_argument("--scratch-only", action="store_true",
                        help="Keep validated receipts under .run without replacing formal evidence.")
    args = parser.parse_args(argv)
    try:
        lane_helper.validate_repository_contract(REPO_ROOT)
        current_identity = builder.build_identity()
        if args.build_identity != current_identity:
            raise builder.EvidenceError(
                "build identity drifted before performance execution"
            )
        selected_bundle_ids = args.bundle_id
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}", args.run_id):
            raise builder.EvidenceError("invalid run-id")
        if len(set(selected_bundle_ids)) != len(selected_bundle_ids):
            raise builder.EvidenceError("duplicate bundle-id")
        if args.repetitions > 9:
            raise builder.EvidenceError("batch repetitions must not exceed 9")
        from map_performance_batch import run_batch
        all_records: dict[str, list[dict[str, Any]]] = {}
        matrix_real_inventory_sha256: str | None = None
        scratch_root = REPO_ROOT / ".run/map-performance" / args.run_id
        if scratch_root.exists():
            raise builder.EvidenceError(f"run-id already exists: {args.run_id}")
        for bundle_id in selected_bundle_ids:
            if not args.scratch_only and not args.replace_existing:
                target = builder.GODOT_ROOT / builder.MAP_BUNDLES[bundle_id][0] / "evidence/performance-runner-receipt.jsonl"
                if target.exists():
                    raise builder.EvidenceError(f"refusing to overwrite receipt: {target}")
        for bundle_id in selected_bundle_ids:
            records = run_batch(
                bundle_id=bundle_id, repetitions=args.repetitions,
                executable=args.godot, run_dir=scratch_root / bundle_id,
                build_identity=current_identity,
            )
            for record in records:
                real_sha = record["qaLane"]["realInventorySha256"]
                if matrix_real_inventory_sha256 is None:
                    matrix_real_inventory_sha256 = real_sha
                elif real_sha != matrix_real_inventory_sha256:
                    raise builder.EvidenceError("real user data changed between performance runs")
                summary = builder.parse_perf_run(record)
                print(json.dumps({"status": "RUN_PASS", "bundleId": bundle_id,
                                  **{key: record[key] for key in ("mapId", "variant", "mode", "repetition")},
                                  "processScopeTotalMsMinMeanMax": summary["processScopeTotalMsMinMeanMax"]},
                                 ensure_ascii=False, separators=(",", ":")), flush=True)
            all_records[bundle_id] = records
            _write_receipt(scratch_root / bundle_id / "performance-runner-receipt.jsonl",
                           records, replace_existing=False)
        if builder.build_identity() != current_identity:
            raise builder.EvidenceError(
                "map runtime identity drifted during performance execution"
            )
        if not args.scratch_only:
            for bundle_id, records in all_records.items():
                receipt = builder.GODOT_ROOT / builder.MAP_BUNDLES[bundle_id][0] / "evidence/performance-runner-receipt.jsonl"
                _write_receipt(receipt, records, replace_existing=args.replace_existing)
        print(
            json.dumps(
                {
                    "status": "PASS",
                    "scope": "raw_capture_and_cleanup",
                    "performanceGatesEvaluated": False,
                    "buildIdentity": current_identity,
                    "repetitions": args.repetitions,
                    "visibleWindowLifecycles": len(all_records),
                    "scratchOnly": args.scratch_only,
                    "runs": sum(len(value) for value in all_records.values()),
                    "receipts": {
                        bundle_id: str(
                            scratch_root / bundle_id / "performance-runner-receipt.jsonl"
                        )
                        for bundle_id in all_records
                    },
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        return 0
    except (
        builder.EvidenceError,
        OSError,
        subprocess.SubprocessError,
        RuntimeError,
        ValueError,
    ) as error:
        print(
            json.dumps(
                {"status": "FAIL", "error": str(error)},
                ensure_ascii=False,
                indent=2,
            ),
            file=sys.stderr,
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
