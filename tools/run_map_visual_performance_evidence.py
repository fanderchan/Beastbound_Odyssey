#!/usr/bin/env python3
"""Run the fixed Beastbound map performance matrix and freeze raw JSONL."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import subprocess
import sys
from typing import Any

import map_visual_evidence_builder as builder


REPO_ROOT = Path(__file__).resolve().parents[1]
GODOT = "godot"


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace(
        "+00:00", "Z"
    )


def _command(map_id: str, variant: str, mode: str) -> list[str]:
    command = [
        GODOT,
        "--path",
        "client/godot",
        "--scene",
        "res://scenes/Main.tscn",
        "--fixed-fps",
        "60",
        "--quit-after",
        "480" if mode == "idle" else "2600",
        "--",
        f"--map-perf-probe-map={map_id}",
    ]
    if variant == "candidate":
        command.append(f"--map-art-review-preview={map_id}")
    if mode == "moving":
        command.append("--movement-spam-click-check")
    command.append("--perf-probe")
    return command


def _run(command: list[str], map_id: str, variant: str, mode: str) -> dict[str, Any]:
    started = _utc_now()
    completed = subprocess.run(
        command,
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    ended = _utc_now()
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
        "stdout": completed.stdout,
        "stderr": completed.stderr,
    }
    # Validate each run before it can enter the frozen receipt.
    builder.parse_perf_run(record)
    return record


def _write_receipt(path: Path, records: list[dict[str, Any]]) -> None:
    if path.exists():
        raise builder.EvidenceError(f"refusing to overwrite receipt: {path}")
    path.write_text(
        "".join(
            json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n"
            for value in records
        ),
        encoding="utf-8",
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--build-identity",
        required=True,
        help="Must equal the current map runtime identity.",
    )
    args = parser.parse_args(argv)
    try:
        current_identity = builder.build_identity()
        if args.build_identity != current_identity:
            raise builder.EvidenceError(
                "build identity drifted before performance execution"
            )
        all_records: dict[str, list[dict[str, Any]]] = {
            bundle_id: [] for bundle_id in builder.MAP_BUNDLES
        }
        for bundle_id, (_root, map_ids) in builder.MAP_BUNDLES.items():
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
            _write_receipt(receipt, records)
        print(
            json.dumps(
                {
                    "status": "PASS",
                    "buildIdentity": current_identity,
                    "runs": sum(len(value) for value in all_records.values()),
                    "receipts": {
                        bundle_id: str(
                            builder.GODOT_ROOT
                            / relative_root
                            / "evidence/performance-runner-receipt.jsonl"
                        )
                        for bundle_id, (relative_root, _map_ids)
                        in builder.MAP_BUNDLES.items()
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
