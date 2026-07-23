#!/usr/bin/env python3
"""Build reproducible map collision/performance evidence from raw Godot output.

This module never edits map bindings or visual declarations.  It validates raw
runner receipts first, derives report values from those receipts, and can update
only the two evidence references owned by the generated reports.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import re
import subprocess
import sys
from typing import Any, Iterable


REPO_ROOT = Path(__file__).resolve().parents[1]
GODOT_ROOT = REPO_ROOT / "client/godot"
GODOT_SCENE = "res://scenes/Main.tscn"
COLLISION_COMMAND = (
    "godot --headless --path client/godot --script "
    "res://scripts/qa/map_visual_runtime_check.gd"
)
RUNNER_VERSION = "4.7.stable.official.5b4e0cb0f"
THRESHOLDS = {
    "candidateIdleProcessMeanMaxMs": 0.5,
    "candidateMovingProcessMeanMaxMs": 0.6,
    "idleRegressionMaxMs": 0.1,
    "movingRegressionMaxMs": 0.35,
}
MAP_BUNDLES = {
    "firebud_region_visual_v1": (
        "assets/maps/firebud_region_visual_v1",
        ("firebud_training_yard", "firebud_village_gate"),
    ),
    "mistcap_marsh_visual_v1": (
        "assets/maps/mistcap_marsh_visual_v1",
        ("mistcap_marsh",),
    ),
}
REQUIRED_COLLISION_CHECKS = (
    "authoritativeBlockedCells",
    "objectCollisionFootprints",
    "pathLinkEndpointsAndExactReachability",
    "spawnProtection",
    "warpSourceAndDestinationProtection",
    "npcSourceAndReachableApproachProtection",
    "encounterCellsAndRectsRespectWalkability",
    "bindingAndMapDataHashes",
)
RUNTIME_IDENTITY_FILES = (
    "scenes/Main.tscn",
    "scripts/main.gd",
    "scripts/ui/panel_flow_coordinator.gd",
    "scripts/world/isometric_map_model.gd",
    "scripts/world/map_data_catalog.gd",
    "scripts/world/map_visual_catalog.gd",
    "scripts/world/map_visual_renderer.gd",
    "scripts/world/world_depth_layer.gd",
    "scripts/world/world_overlay_layer.gd",
    "scripts/qa/map_visual_runtime_check.gd",
    "scripts/qa/world_depth_layer_check.gd",
    "data/map_visual_catalog.json",
    "data/firebud_training_map.json",
    "data/firebud_village_gate_map.json",
    "data/mistcap_marsh_map.json",
    "data/npc_appearances.json",
)
BUILD_IDENTITY_NAMESPACE = "beastbound-map-runtime-surface-v2"
PROJECT_SETTINGS_IDENTITY_PATH = "project.godot.semantic-settings.json"
PERF_LINE_RE = re.compile(
    r"^perf probe: fps=(?P<fps>[0-9.]+) frames=(?P<frames>[0-9]+) (?P<body>.*)$"
)
METRIC_RE = re.compile(r"\b([a-z0-9_]+)=([0-9.]+)ms\b")
MOVING_LINE_RE = re.compile(r"^movement spam click check ready: (?P<body>.*)$")


class EvidenceError(RuntimeError):
    pass


def _read_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise EvidenceError(f"cannot read JSON {path}: {error}") from error
    if not isinstance(value, dict):
        raise EvidenceError(f"JSON root must be an object: {path}")
    return value


def _write_json(path: Path, value: dict[str, Any]) -> None:
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _canonical_json_bytes(value: Any) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")


def _add_identity_file(
    digest: "hashlib._Hash",
    relative_path: str,
    payload: bytes,
) -> None:
    digest.update(relative_path.encode("utf-8"))
    digest.update(b"\0")
    digest.update(hashlib.sha256(payload).digest())
    digest.update(b"\0")


def _normalize_project_setting_value(value: str) -> tuple[str, bool]:
    """Remove formatting outside strings and report whether nesting is closed."""

    normalized: list[str] = []
    closing_for = {"(": ")", "[": "]", "{": "}"}
    openings: list[str] = []
    in_string = False
    escaped = False
    in_comment = False
    for character in value:
        if in_comment:
            if character == "\n":
                in_comment = False
            continue
        if in_string:
            normalized.append(character)
            if escaped:
                escaped = False
            elif character == "\\":
                escaped = True
            elif character == '"':
                in_string = False
            continue
        if character == ";":
            in_comment = True
            continue
        if character == '"':
            in_string = True
            normalized.append(character)
            continue
        if character.isspace():
            continue
        if character in closing_for:
            openings.append(character)
        elif character in closing_for.values():
            if not openings or closing_for[openings.pop()] != character:
                raise EvidenceError(
                    f"project.godot setting has mismatched delimiter: {value!r}"
                )
        normalized.append(character)
    if escaped:
        raise EvidenceError("project.godot setting ends with an escaped quote")
    return "".join(normalized), not in_string and not openings


def _canonical_project_settings_bytes(text: str) -> bytes:
    """Canonicalize Godot project settings without hiding semantic changes."""

    settings: dict[str, str] = {}
    section = "@root"
    pending_key: str | None = None
    pending_value = ""

    def store(key: str, value: str) -> None:
        normalized, complete = _normalize_project_setting_value(value)
        if not complete:
            raise EvidenceError(
                f"project.godot setting is not closed: {section}/{key}"
            )
        identity_key = f"{section}/{key}"
        if identity_key in settings:
            raise EvidenceError(
                f"project.godot contains duplicate setting: {identity_key}"
            )
        settings[identity_key] = normalized

    for line_number, raw_line in enumerate(text.splitlines(), 1):
        stripped = raw_line.strip()
        if pending_key is not None:
            pending_value += "\n" + raw_line
            _normalized, complete = _normalize_project_setting_value(
                pending_value
            )
            if complete:
                store(pending_key, pending_value)
                pending_key = None
                pending_value = ""
            continue
        if not stripped or stripped.startswith(";"):
            continue
        if stripped.startswith("[") and stripped.endswith("]"):
            section_name = stripped[1:-1].strip()
            if not section_name:
                raise EvidenceError(
                    f"project.godot:{line_number}: empty section"
                )
            section = section_name
            continue
        if "=" not in raw_line:
            raise EvidenceError(
                f"project.godot:{line_number}: expected setting assignment"
            )
        key, value = raw_line.split("=", 1)
        key = key.strip()
        if not key:
            raise EvidenceError(
                f"project.godot:{line_number}: empty setting key"
            )
        _normalized, complete = _normalize_project_setting_value(value)
        if complete:
            store(key, value)
        else:
            pending_key = key
            pending_value = value
    if pending_key is not None:
        raise EvidenceError(
            f"project.godot setting is not closed: {section}/{pending_key}"
        )
    if not settings:
        raise EvidenceError("project.godot contains no settings")
    return _canonical_json_bytes(
        {
            "canonicalization": "godot-project-settings-v1",
            "settings": settings,
        }
    )


def _project_settings_identity_bytes(path: Path) -> bytes:
    try:
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError) as error:
        raise EvidenceError(f"cannot read project settings {path}: {error}") from error
    return _canonical_project_settings_bytes(text)


def build_identity() -> str:
    """Hash the semantic map runtime surface while excluding evidence/lifecycle."""

    digest = hashlib.sha256()
    project_settings = GODOT_ROOT / "project.godot"
    if not project_settings.is_file():
        raise EvidenceError(
            f"runtime identity input missing: {project_settings}"
        )
    _add_identity_file(
        digest,
        PROJECT_SETTINGS_IDENTITY_PATH,
        _project_settings_identity_bytes(project_settings),
    )
    for relative in RUNTIME_IDENTITY_FILES:
        path = GODOT_ROOT / relative
        if not path.is_file():
            raise EvidenceError(f"runtime identity input missing: {path}")
        _add_identity_file(digest, relative, path.read_bytes())

    for bundle_id, (relative_root, _map_ids) in MAP_BUNDLES.items():
        root = GODOT_ROOT / relative_root
        manifest = _read_json(root / "map-visual-bundle.json")
        runtime_subject = {
            key: manifest.get(key)
            for key in (
                "schemaVersion",
                "bundleId",
                "mapStyleId",
                "mapIds",
                "tileSize",
                "groundAtlas",
                "tiles",
                "objects",
                "mapBindings",
            )
        }
        _add_identity_file(
            digest,
            f"{relative_root}/map-visual-bundle.runtime-subject.json",
            _canonical_json_bytes(runtime_subject),
        )
        for directory in ("bindings", "runtime"):
            for path in sorted((root / directory).rglob("*")):
                if (
                    not path.is_file()
                    or path.suffix == ".import"
                    or path.name == ".DS_Store"
                ):
                    continue
                relative = path.relative_to(GODOT_ROOT).as_posix()
                _add_identity_file(digest, relative, path.read_bytes())

    head = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=REPO_ROOT,
        check=True,
        capture_output=True,
        text=True,
    ).stdout.strip()
    return f"git:{head}+{BUILD_IDENTITY_NAMESPACE}:{digest.hexdigest()}"


def _runtime_payload(receipt: Path) -> dict[str, Any]:
    text = receipt.read_text(encoding="utf-8")
    prefix = "map visual runtime check: "
    matches = [
        line[len(prefix) :]
        for line in text.splitlines()
        if line.startswith(prefix)
    ]
    if len(matches) != 1:
        raise EvidenceError(
            f"{receipt} must contain exactly one map visual runtime report"
        )
    try:
        payload = json.loads(matches[0])
    except json.JSONDecodeError as error:
        raise EvidenceError(f"invalid runtime receipt JSON: {error}") from error
    if not isinstance(payload, dict) or payload.get("result") != "PASS":
        raise EvidenceError(f"runtime receipt is not PASS: {receipt}")
    if payload.get("errors") != []:
        raise EvidenceError(f"runtime receipt has errors: {receipt}")
    return payload


def build_collision_report(
    bundle_id: str,
    *,
    build_id: str,
    update_manifest_ref: bool,
) -> Path:
    relative_root, map_ids = MAP_BUNDLES[bundle_id]
    root = GODOT_ROOT / relative_root
    receipt = root / "evidence/collision-runner-receipt.log"
    if not receipt.is_file() or receipt.stat().st_size <= 0:
        raise EvidenceError(f"missing non-empty collision receipt: {receipt}")
    runtime = _runtime_payload(receipt)
    bundle_reports = runtime.get("bundleReports")
    if not isinstance(bundle_reports, dict):
        raise EvidenceError("runtime receipt bundleReports missing")
    report_snapshot = bundle_reports.get(bundle_id)
    if not isinstance(report_snapshot, dict):
        raise EvidenceError(f"runtime receipt lacks bundle {bundle_id}")
    catalog_path = root / "evidence/catalog-contract-check.json"
    catalog = _read_json(catalog_path)
    if catalog.get("result") != "PASS":
        raise EvidenceError(f"catalog contract is not PASS: {catalog_path}")
    for key in (
        "testedMapIds",
        "catalogSha256",
        "bindingHashes",
        "mapDataHashes",
        "maps",
    ):
        if report_snapshot.get(key) != catalog.get(key):
            raise EvidenceError(f"runtime/catalog snapshot drift at {key}")
    if tuple(catalog.get("testedMapIds", ())) != map_ids:
        raise EvidenceError(f"catalog map order mismatch for {bundle_id}")

    maps: list[dict[str, Any]] = []
    for value in catalog["maps"]:
        maps.append(
            {
                "mapId": value["mapId"],
                "groundDraws": value["groundDraws"],
                "objectCount": value["objects"],
                "protectedCells": value["protectedCells"],
            }
        )
    report = {
        "schemaVersion": 1,
        "reportType": "beastbound_map_collision_audit",
        "bundleId": bundle_id,
        "result": "PASS",
        "generatedAtUtc": report_snapshot["generatedAtUtc"],
        "scene": GODOT_SCENE,
        "command": COLLISION_COMMAND,
        "testedMapIds": list(map_ids),
        "checks": {key: "PASS" for key in REQUIRED_COLLISION_CHECKS},
        "maps": maps,
        "authoritySnapshot": {
            "catalogContractSha256": _sha256(catalog_path),
            "bindingHashes": catalog["bindingHashes"],
            "mapDataHashes": catalog["mapDataHashes"],
        },
        "excludedReleaseGate": None,
        "blockers": [],
        "runnerIdentity": {
            "runner": "godot",
            "runnerVersion": RUNNER_VERSION,
            "buildIdentity": build_id,
        },
        "rawRunnerReceipt": {
            "path": "evidence/collision-runner-receipt.log",
            "sha256": _sha256(receipt),
        },
        "notes": [
            "This report covers authoritative map, collision, protected-cell and exact-path contracts.",
            "Tall-object front/behind presentation is independently gated by the formal Computer Use occlusion action.",
        ],
    }
    output = root / "evidence/collision-audit.json"
    _write_json(output, report)
    if update_manifest_ref:
        _update_manifest_evidence_ref(
            root,
            "collisionAudit",
            "evidence/collision-audit.json",
            _sha256(output),
        )
    return output


def _parse_key_values(body: str) -> dict[str, str]:
    result: dict[str, str] = {}
    for part in body.split():
        if "=" not in part:
            continue
        key, value = part.split("=", 1)
        result[key] = value
    return result


def parse_perf_run(record: dict[str, Any]) -> dict[str, Any]:
    stdout = record.get("stdout")
    stderr = record.get("stderr")
    if not isinstance(stdout, str) or not isinstance(stderr, str):
        raise EvidenceError("performance receipt stdout/stderr must be strings")
    if record.get("returncode") != 0:
        raise EvidenceError(
            f"performance runner failed: {record.get('mapId')} "
            f"{record.get('variant')} {record.get('mode')}"
        )
    samples: list[dict[str, float]] = []
    moving_values: dict[str, str] | None = None
    for line in (stdout + "\n" + stderr).splitlines():
        perf_match = PERF_LINE_RE.match(line)
        if perf_match is not None:
            metrics = {
                key: float(value)
                for key, value in METRIC_RE.findall(perf_match.group("body"))
            }
            if "process_total" not in metrics:
                continue
            samples.append(
                {
                    "fps": float(perf_match.group("fps")),
                    "process_total": metrics["process_total"],
                    "draw_world": metrics.get("draw_world", 0.0),
                }
            )
        moving_match = MOVING_LINE_RE.match(line)
        if moving_match is not None:
            moving_values = _parse_key_values(moving_match.group("body"))
    if len(samples) < 3:
        raise EvidenceError(
            f"performance run has fewer than 3 samples: {record.get('mapId')} "
            f"{record.get('variant')} {record.get('mode')}"
        )

    def triplet(key: str) -> list[float]:
        values = [sample[key] for sample in samples]
        return [
            round(min(values), 3),
            round(sum(values) / len(values), 3),
            round(max(values), 3),
        ]

    result: dict[str, Any] = {
        "samples": len(samples),
        "fpsMinMeanMax": triplet("fps"),
        "processTotalMsMinMeanMax": triplet("process_total"),
        "drawWorldMsMinMeanMax": triplet("draw_world"),
    }
    if record.get("mode") != "moving":
        return result
    if moving_values is None or moving_values.get("status") != "ok":
        raise EvidenceError("moving run lacks a PASS movement summary")
    required_true = (
        "moved",
        "coalesced",
        "settled",
        "final_match",
        "screen_roundtrip",
    )
    if any(moving_values.get(key) != "true" for key in required_true):
        raise EvidenceError(f"moving summary invariant failed: {moving_values}")
    if moving_values.get("battle") != "false" or moving_values.get("encounter") != "false":
        raise EvidenceError("moving run entered battle/encounter")
    clicks = int(moving_values["clicks"])
    accepted = int(moving_values["accepted"])
    resolved = int(moving_values["resolved"])
    applied = int(moving_values["applied"])
    if accepted != clicks or applied != resolved:
        raise EvidenceError("moving click/apply counts are inconsistent")
    result.update(
        {
            "clicks": clicks,
            "accepted": accepted,
            "resolved": resolved,
            "applied": applied,
            "avgInputUs": int(moving_values["avg_input_us"]),
            "maxInputUs": int(moving_values["max_input_us"]),
            "moved": True,
            "coalesced": True,
            "settled": True,
            "finalTargetMatched": True,
            "battle": False,
            "encounter": False,
        }
    )
    return result


def _read_receipt_records(receipt: Path) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for index, line in enumerate(receipt.read_text(encoding="utf-8").splitlines(), 1):
        try:
            value = json.loads(line)
        except json.JSONDecodeError as error:
            raise EvidenceError(f"{receipt}:{index}: invalid JSONL: {error}") from error
        if not isinstance(value, dict):
            raise EvidenceError(f"{receipt}:{index}: record must be an object")
        records.append(value)
    return records


def build_performance_report(
    bundle_id: str,
    *,
    build_id: str,
    update_manifest_ref: bool,
) -> Path:
    relative_root, map_ids = MAP_BUNDLES[bundle_id]
    root = GODOT_ROOT / relative_root
    receipt = root / "evidence/performance-runner-receipt.jsonl"
    if not receipt.is_file() or receipt.stat().st_size <= 0:
        raise EvidenceError(f"missing non-empty performance receipt: {receipt}")
    records = _read_receipt_records(receipt)
    indexed: dict[tuple[str, str, str], dict[str, Any]] = {}
    for record in records:
        identity = (
            str(record.get("mapId", "")),
            str(record.get("variant", "")),
            str(record.get("mode", "")),
        )
        if identity in indexed:
            raise EvidenceError(f"duplicate performance run: {identity}")
        indexed[identity] = record
    expected = {
        (map_id, variant, mode)
        for map_id in map_ids
        for variant in ("baseline", "candidate")
        for mode in ("idle", "moving")
    }
    if set(indexed) != expected:
        raise EvidenceError(
            f"performance matrix mismatch; missing={sorted(expected-set(indexed))} "
            f"extra={sorted(set(indexed)-expected)}"
        )

    maps: list[dict[str, Any]] = []
    for map_id in map_ids:
        baseline = {
            "renderer": "legacy_fallback",
            "idle": parse_perf_run(indexed[(map_id, "baseline", "idle")]),
            "moving": parse_perf_run(indexed[(map_id, "baseline", "moving")]),
        }
        candidate = {
            "renderer": "map_visual_candidate",
            "idle": parse_perf_run(indexed[(map_id, "candidate", "idle")]),
            "moving": parse_perf_run(indexed[(map_id, "candidate", "moving")]),
        }
        idle_delta = round(
            candidate["idle"]["processTotalMsMinMeanMax"][1]
            - baseline["idle"]["processTotalMsMinMeanMax"][1],
            3,
        )
        moving_delta = round(
            candidate["moving"]["processTotalMsMinMeanMax"][1]
            - baseline["moving"]["processTotalMsMinMeanMax"][1],
            3,
        )
        gates = {
            "candidateIdleWithinLimit": (
                candidate["idle"]["processTotalMsMinMeanMax"][1]
                <= THRESHOLDS["candidateIdleProcessMeanMaxMs"]
            ),
            "candidateMovingWithinLimit": (
                candidate["moving"]["processTotalMsMinMeanMax"][1]
                <= THRESHOLDS["candidateMovingProcessMeanMaxMs"]
            ),
            "idleRegressionWithinLimit": (
                idle_delta <= THRESHOLDS["idleRegressionMaxMs"]
            ),
            "movingRegressionWithinLimit": (
                moving_delta <= THRESHOLDS["movingRegressionMaxMs"]
            ),
        }
        if not all(gates.values()):
            raise EvidenceError(f"performance threshold failed for {map_id}: {gates}")
        maps.append(
            {
                "mapId": map_id,
                "baseline": baseline,
                "candidate": candidate,
                "comparison": {
                    "processTotalMeanDeltaMs": {
                        "idle": idle_delta,
                        "moving": moving_delta,
                    },
                    "thresholds": THRESHOLDS,
                    "gates": {
                        key: "PASS" if value else "FAIL"
                        for key, value in gates.items()
                    },
                },
            }
        )

    generated_at = max(
        str(record.get("endedAtUtc", "")) for record in records
    )
    report = {
        "schemaVersion": 1,
        "reportType": "beastbound_map_performance_report",
        "bundleId": bundle_id,
        "result": "PASS",
        "comparisonMode": "legacy_fallback_vs_candidate",
        "generatedAtUtc": generated_at,
        "scene": GODOT_SCENE,
        "viewport": [1280, 720],
        "displayServer": "macOS Metal",
        "movingInputDelivery": "Input.parse_input_event",
        "movingInputFrameSeparated": True,
        "testedMapIds": list(map_ids),
        "maps": maps,
        "excludedReleaseGate": None,
        "blockers": [],
        "runnerIdentity": {
            "runner": "godot",
            "runnerVersion": RUNNER_VERSION,
            "buildIdentity": build_id,
        },
        "rawRunnerReceipt": {
            "path": "evidence/performance-runner-receipt.jsonl",
            "sha256": _sha256(receipt),
        },
        "notes": [
            "All twelve variants ran through the real Main.tscn non-headless Metal path.",
            "Moving variants used cross-frame Input.parse_input_event mouse press/release delivery.",
            "All values were parsed from the verbatim Godot stdout/stderr frozen in the raw JSONL receipt.",
        ],
    }
    output = root / "evidence/performance-report.json"
    _write_json(output, report)
    if update_manifest_ref:
        _update_manifest_evidence_ref(
            root,
            "performanceReport",
            "evidence/performance-report.json",
            _sha256(output),
        )
    return output


def _update_manifest_evidence_ref(
    root: Path,
    key: str,
    relative_path: str,
    digest: str,
) -> None:
    manifest_path = root / "map-visual-bundle.json"
    manifest = _read_json(manifest_path)
    if (
        manifest.get("status") != "owner_review_pending"
        or manifest.get("ownerReviewStatus") != "pending"
        or manifest.get("releaseApproved") is not False
        or manifest.get("runtimeEnabled") is not False
    ):
        raise EvidenceError("manifest must remain owner_review_pending")
    evidence = manifest.get("evidence")
    if not isinstance(evidence, dict):
        raise EvidenceError("manifest evidence object missing")
    evidence[key] = {"path": relative_path, "sha256": digest}
    _write_json(manifest_path, manifest)


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "mode",
        choices=("identity", "collision", "performance"),
    )
    parser.add_argument(
        "--bundle-id",
        choices=tuple(MAP_BUNDLES),
    )
    parser.add_argument("--build-identity")
    parser.add_argument("--update-manifest-ref", action="store_true")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        identity = build_identity()
        if args.mode == "identity":
            print(identity)
            return 0
        if args.bundle_id is None:
            raise EvidenceError("--bundle-id is required")
        if args.build_identity != identity:
            raise EvidenceError(
                "provided build identity does not match the current runtime surface"
            )
        if args.mode == "collision":
            output = build_collision_report(
                args.bundle_id,
                build_id=identity,
                update_manifest_ref=args.update_manifest_ref,
            )
        else:
            output = build_performance_report(
                args.bundle_id,
                build_id=identity,
                update_manifest_ref=args.update_manifest_ref,
            )
        print(
            json.dumps(
                {
                    "status": "PASS",
                    "output": str(output),
                    "sha256": _sha256(output),
                    "buildIdentity": identity,
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        return 0
    except (EvidenceError, OSError, subprocess.SubprocessError) as error:
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
