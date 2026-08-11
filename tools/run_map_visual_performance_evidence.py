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
import tempfile
from typing import Any

import map_visual_evidence_builder as builder


REPO_ROOT = Path(__file__).resolve().parents[1]
GODOT = "godot"


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace(
        "+00:00", "Z"
    )


def _command(
    map_id: str,
    variant: str,
    mode: str,
    *,
    user_data_dir: Path,
) -> list[str]:
    command = [
        GODOT,
        "--path",
        "client/godot",
        "--user-data-dir",
        str(user_data_dir),
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
        f"--map-perf-probe-map={map_id}",
    ]
    if variant == "candidate":
        command.append(f"--map-art-review-preview={map_id}")
    if mode == "moving":
        command.append("--movement-spam-click-check")
        command.append("--movement-spam-click-limit=30")
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
                        with tempfile.TemporaryDirectory(
                            prefix=f"beastbound-map-perf-{map_id}-{variant}-{mode}-"
                        ) as temporary:
                            all_records[bundle_id].append(
                                _run(
                                    _command(
                                        map_id,
                                        variant,
                                        mode,
                                        user_data_dir=Path(temporary),
                                    ),
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
