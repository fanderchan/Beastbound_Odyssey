#!/usr/bin/env python3
"""Run the fixed Beastbound map performance matrix and freeze raw JSONL."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import os
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


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace(
        "+00:00", "Z"
    )


def _command(
    map_id: str,
    variant: str,
    mode: str,
) -> list[str]:
    command = [
        GODOT,
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
        "--quit-after",
        "480" if mode == "idle" else "2600",
        "--",
        QA_LANE_ARGUMENT,
        f"--map-perf-probe-map={map_id}",
    ]
    if variant == "candidate":
        command.append(f"--map-art-review-preview={map_id}")
    if mode == "moving":
        command.append("--movement-spam-click-check")
        command.append("--movement-spam-click-limit=60")
    command.append("--perf-probe")
    return command


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
    map_id: str,
    variant: str,
    mode: str,
    *,
    runner: Any = subprocess.run,
    lane_api: Any = lane_helper,
    base_environment: dict[str, str] | None = None,
) -> dict[str, Any]:
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
            "mapId": map_id,
            "variant": variant,
            "mode": mode,
            "runner": "godot",
            "argv": command,
            "startedAtUtc": started,
            "endedAtUtc": ended,
            "returncode": completed.returncode,
            "stdout": public_stdout,
            "stderr": public_stderr,
            "qaLane": {"attestation": _public_qa_lane_attestation(attestation)},
        }
        # Validate each run before it can enter the frozen receipt.
        builder.parse_perf_run(record)
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
        help="Run only the selected bundle; may be repeated. Defaults to every bundle.",
    )
    parser.add_argument(
        "--replace-existing",
        action="store_true",
        help="Atomically replace an existing receipt after every new run validates.",
    )
    args = parser.parse_args(argv)
    try:
        lane_helper.validate_repository_contract(REPO_ROOT)
        current_identity = builder.build_identity()
        if args.build_identity != current_identity:
            raise builder.EvidenceError(
                "build identity drifted before performance execution"
            )
        selected_bundle_ids = args.bundle_id or list(builder.MAP_BUNDLES)
        all_records: dict[str, list[dict[str, Any]]] = {
            bundle_id: [] for bundle_id in selected_bundle_ids
        }
        for bundle_id in selected_bundle_ids:
            _root, map_ids = builder.MAP_BUNDLES[bundle_id]
            for map_id in map_ids:
                for variant in ("baseline", "candidate"):
                    for mode in ("idle", "moving"):
                        all_records[bundle_id].append(
                            _run(
                                _command(map_id, variant, mode),
                                map_id,
                                variant,
                                mode,
                            )
                        )
        if builder.build_identity() != current_identity:
            raise builder.EvidenceError(
                "map runtime identity drifted during performance execution"
            )
        for bundle_id, records in all_records.items():
            relative_root, _map_ids = builder.MAP_BUNDLES[bundle_id]
            receipt = (
                builder.GODOT_ROOT
                / relative_root
                / "evidence/performance-runner-receipt.jsonl"
            )
            _write_receipt(
                receipt,
                records,
                replace_existing=args.replace_existing,
            )
        print(
            json.dumps(
                {
                    "status": "PASS",
                    "buildIdentity": current_identity,
                    "runs": sum(len(value) for value in all_records.values()),
                    "receipts": {
                        bundle_id: str(
                            builder.GODOT_ROOT
                            / builder.MAP_BUNDLES[bundle_id][0]
                            / "evidence/performance-runner-receipt.jsonl"
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
