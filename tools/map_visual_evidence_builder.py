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
import importlib.util
import json
import math
import os
from pathlib import Path
import re
from statistics import median
import subprocess
import sys
from typing import Any, Iterable

_batch_spec = importlib.util.spec_from_file_location(
    "_map_performance_batch_contract", Path(__file__).with_name("map_performance_batch_contract.py")
)
assert _batch_spec is not None and _batch_spec.loader is not None
batch_contract = importlib.util.module_from_spec(_batch_spec)
_batch_spec.loader.exec_module(batch_contract)


REPO_ROOT = Path(__file__).resolve().parents[1]
GODOT_ROOT = REPO_ROOT / "client/godot"
PERFORMANCE_BUILDER_PATH = Path(__file__).resolve()
PERFORMANCE_RUNNER_PATH = REPO_ROOT / "tools/run_map_visual_performance_evidence.py"
GODOT_SCENE = "res://scenes/Main.tscn"
COLLISION_LOG_PATH = "../../.run/map-visual-runtime-check.log"
COLLISION_COMMAND = (
    "godot --headless --path client/godot --script "
    "res://scripts/qa/map_visual_runtime_check.gd"
)
COLLISION_COMMAND_ARGS = (
    "godot",
    "--headless",
    "--path",
    "client/godot",
    "--log-file",
    COLLISION_LOG_PATH,
    "--script",
    "res://scripts/qa/map_visual_runtime_check.gd",
)
COLLISION_PREVIEW_FLAG = "--preview-map-visual-catalog-contract"
COLLISION_PREVIEW_COMMAND = (
    f"{COLLISION_COMMAND} -- {COLLISION_PREVIEW_FLAG}"
)
COLLISION_PREVIEW_COMMAND_ARGS = (
    *COLLISION_COMMAND_ARGS,
    "--",
    COLLISION_PREVIEW_FLAG,
)
RUNNER_VERSION = "4.7.stable.official.5b4e0cb0f"
RUNTIME_ENGINE_VERSION = "4.7-stable (official)"
PERF_WARMUP_FRAMES = 180
PERF_MEASUREMENT_FRAMES = 480
PERF_SAMPLE_FRAMES = 60
MOVING_WORKLOAD_CONTRACT = "spawn_adjacent_pair_v1"
PROCESS_SCOPE_THRESHOLDS = {
    "candidateIdleProcessScopeMeanMaxMs": 0.5,
    "candidateMovingProcessScopeMeanMaxMs": 0.6,
    "idleProcessScopeRegressionMaxMs": 0.1,
    "movingProcessScopeRegressionMaxMs": 0.35,
}
LEGACY_PROCESS_THRESHOLDS = {
    "candidateIdleProcessMeanMaxMs": 0.5,
    "candidateMovingProcessMeanMaxMs": 0.6,
    "idleRegressionMaxMs": 0.1,
    "movingRegressionMaxMs": 0.35,
}
MAP_BUNDLES = {
    "earth_vein_cave_visual_v1": (
        "assets/maps/earth_vein_cave_visual_v1",
        (
            "earth_vein_cave",
            "earth_vein_cave_f2",
            "earth_vein_cave_f3",
            "earth_vein_cave_f4",
        ),
    ),
    "firebud_region_visual_v2": (
        "assets/maps/firebud_region_visual_v2",
        ("firebud_training_yard", "firebud_village_gate"),
    ),
    "firebud_region_visual_v1": (
        "assets/maps/firebud_region_visual_v1",
        ("firebud_training_yard", "firebud_village_gate"),
    ),
    "mistcap_marsh_visual_v1": (
        "assets/maps/mistcap_marsh_visual_v1",
        ("mistcap_marsh",),
    ),
}
MAP_DATA_PATHS = {
    "earth_vein_cave": "data/earth_vein_cave_map.json",
    "earth_vein_cave_f2": "data/earth_vein_cave_f2_map.json",
    "earth_vein_cave_f3": "data/earth_vein_cave_f3_map.json",
    "earth_vein_cave_f4": "data/earth_vein_cave_f4_map.json",
    "firebud_training_yard": "data/firebud_training_map.json",
    "firebud_village_gate": "data/firebud_village_gate_map.json",
    "mistcap_marsh": "data/mistcap_marsh_map.json",
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
    "scripts/ui/panel_registry.gd",
    "scripts/ui/world_hud_awakened_presenter.gd",
    "scripts/ui/world_hud_awakened_visual_skin.gd",
    "scripts/ui/world_hud_awakened_view.gd",
    "scripts/ui/world_hud_minimap_render_canvas.gd",
    "scripts/world/isometric_map_model.gd",
    "scripts/world/map_data_catalog.gd",
    "scripts/world/map_visual_catalog.gd",
    "scripts/world/map_visual_renderer.gd",
    "scripts/world/world_camera_safe_area_model.gd",
    "scripts/world/world_presentation_profile.gd",
    "scripts/world/world_depth_layer.gd",
    "scripts/world/world_ground_layer.gd",
    "scripts/world/world_overlay_layer.gd",
    "scripts/qa/map_visual_runtime_check.gd",
    "scripts/qa/movement_spam_probe_plan.gd",
    "scripts/qa/perf_probe_exit_controller.gd",
    "scripts/qa/perf_probe_process_scope_boundary.gd",
    "scripts/qa/runtime_exit_cleanup.gd",
    "scripts/qa/world_depth_layer_check.gd",
    "scripts/qa/world_ground_layer_check.gd",
    "data/map_visual_catalog.json",
    "data/map_visual_review_catalog.json",
    "data/earth_vein_cave_map.json",
    "data/earth_vein_cave_f2_map.json",
    "data/earth_vein_cave_f3_map.json",
    "data/earth_vein_cave_f4_map.json",
    "data/firebud_training_map.json",
    "data/firebud_village_gate_map.json",
    "data/mistcap_marsh_map.json",
    "data/npc_appearances.json",
    "scenes/player/Player.tscn",
    "scripts/player/player.gd",
)
BUILD_IDENTITY_NAMESPACE = "beastbound-map-runtime-surface-v2"
PROJECT_SETTINGS_IDENTITY_PATH = "project.godot.semantic-settings.json"
PERF_LINE_RE = re.compile(
    r"^perf probe: fps=(?P<fps>[0-9.]+) frames=(?P<frames>[0-9]+) (?P<body>.*)$"
)
METRIC_RE = re.compile(r"\b([a-z0-9_]+)=([0-9.]+)ms\b")
MOVING_LINE_RE = re.compile(r"^movement spam click check ready: (?P<body>.*)$")
PERF_WARMUP_PREFIX = "perf probe warmup complete: "
PERF_RUNTIME_PREFIX = "perf probe runtime: "
PERF_MEASUREMENT_PREFIX = "perf probe measurement complete: "
PERF_CLEAN_EXIT_PREFIX = "perf probe clean exit: "


class EvidenceError(RuntimeError):
    pass


def expected_performance_argv(
    executable: str,
    map_id: str,
    variant: str,
    mode: str,
) -> list[str]:
    command = [
        executable,
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
        "--",
        "--beastbound-qa-user-data-lane=automation",
        f"--map-perf-probe-map={map_id}",
    ]
    if variant == "candidate":
        command.append(f"--map-art-review-preview={map_id}")
    if mode == "moving":
        command.extend(
            [
                "--movement-spam-click-check",
                "--movement-spam-click-limit=60",
                "--movement-spam-shared-target-contract="
                f"{MOVING_WORKLOAD_CONTRACT}",
            ]
        )
    command.extend(
        [
            "--perf-probe",
            f"--perf-probe-warmup-frames={PERF_WARMUP_FRAMES}",
            f"--perf-probe-sample-frames={PERF_SAMPLE_FRAMES}",
            f"--perf-probe-clean-exit-frames={PERF_MEASUREMENT_FRAMES}",
        ]
    )
    return command


def expected_performance_matrix(
    map_ids: tuple[str, ...] | list[str],
    repetitions: int,
) -> list[tuple[str, str, str, int]]:
    cases: list[tuple[str, str, str, int]] = []
    ordered_map_ids = list(map_ids)
    for repetition in range(1, repetitions + 1):
        rotation = (repetition - 1) % len(ordered_map_ids)
        rotated_map_ids = ordered_map_ids[rotation:] + ordered_map_ids[:rotation]
        for map_id in rotated_map_ids:
            variant_order = (
                ("baseline", "candidate")
                if repetition % 2 == 1
                else ("candidate", "baseline")
            )
            for mode in ("idle", "moving"):
                for variant in variant_order:
                    cases.append((map_id, variant, mode, repetition))
    return cases


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


def performance_evidence_tool_hashes() -> dict[str, str]:
    return {
        "evidenceBuilderSha256": _sha256(PERFORMANCE_BUILDER_PATH),
        "evidenceRunnerSha256": _sha256(PERFORMANCE_RUNNER_PATH),
    }


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


def _runtime_payload_text(text: str, *, label: str) -> dict[str, Any]:
    prefix = "map visual runtime check: "
    matches = [
        line[len(prefix) :]
        for line in text.splitlines()
        if line.startswith(prefix)
    ]
    if len(matches) != 1:
        raise EvidenceError(
            f"{label} must contain exactly one map visual runtime report"
        )
    try:
        payload = json.loads(matches[0])
    except json.JSONDecodeError as error:
        raise EvidenceError(f"invalid runtime receipt JSON: {error}") from error
    if not isinstance(payload, dict) or payload.get("result") != "PASS":
        raise EvidenceError(f"runtime receipt is not PASS: {label}")
    if payload.get("errors") != []:
        raise EvidenceError(f"runtime receipt has errors: {label}")
    return payload


def _runtime_payload(receipt: Path) -> dict[str, Any]:
    return _runtime_payload_text(
        receipt.read_text(encoding="utf-8"),
        label=str(receipt),
    )


def capture_collision_receipt(
    bundle_id: str,
    *,
    allow_pending_catalog_preview: bool = False,
    runner: Any = subprocess.run,
) -> Path:
    if bundle_id not in MAP_BUNDLES:
        raise EvidenceError(f"unknown map bundle: {bundle_id}")
    relative_root, expected_map_ids = MAP_BUNDLES[bundle_id]
    bundle_root = GODOT_ROOT / relative_root
    command_args = COLLISION_COMMAND_ARGS
    expected_mode = "strict_frozen_validation"
    if allow_pending_catalog_preview:
        manifest = _read_json(bundle_root / "map-visual-bundle.json")
        if (
            manifest.get("status") != "owner_review_pending"
            or manifest.get("ownerReviewStatus") != "pending"
            or manifest.get("releaseApproved") is not False
            or manifest.get("runtimeEnabled") is not False
        ):
            raise EvidenceError(
                "catalog preview receipt is restricted to a fail-closed "
                "owner_review_pending bundle"
            )
        command_args = COLLISION_PREVIEW_COMMAND_ARGS
        expected_mode = "catalog_contract_preview"
    completed = runner(
        list(command_args),
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    receipt_text = completed.stdout + completed.stderr
    if completed.returncode != 0:
        raise EvidenceError(
            f"map collision runner failed with {completed.returncode}"
        )
    payload = _runtime_payload_text(receipt_text, label="Godot stdout/stderr")
    if (
        payload.get("mode") != expected_mode
        or payload.get("result") != "PASS"
        or payload.get("errors") != []
    ):
        raise EvidenceError("map collision runner did not return strict PASS")
    reports = payload.get("bundleReports")
    report = reports.get(bundle_id) if isinstance(reports, dict) else None
    if (
        not isinstance(report, dict)
        or report.get("result") != "PASS"
        or tuple(report.get("testedMapIds", ())) != expected_map_ids
    ):
        raise EvidenceError(f"runtime receipt lacks PASS bundle report: {bundle_id}")
    if allow_pending_catalog_preview:
        runtime_checks = payload.get("checks")
        report_checks = report.get("checks")
        if (
            not isinstance(runtime_checks, dict)
            or runtime_checks.get(
                "frozenReportValidationSkippedForGeneration"
            )
            is not False
            or not isinstance(report_checks, dict)
            or report_checks.get(
                "frozenReportValidationSkippedForGeneration"
            )
            is not False
        ):
            raise EvidenceError(
                "catalog preview runner did not strictly validate the frozen report"
            )
        frozen_catalog = _read_json(
            bundle_root / "evidence/catalog-contract-check.json"
        )
        if (
            frozen_catalog.get("bundleId") != bundle_id
            or frozen_catalog.get("result") != "PASS"
            or frozen_catalog.get("errors") != []
        ):
            raise EvidenceError(
                f"pending bundle catalog contract is not a clean PASS: {bundle_id}"
            )
        for key in (
            "testedMapIds",
            "catalogSha256",
            "bindingHashes",
            "mapDataHashes",
            "maps",
        ):
            if report.get(key) != frozen_catalog.get(key):
                raise EvidenceError(
                    f"catalog preview/frozen snapshot drift at {key}"
                )

    output = bundle_root / "evidence/collision-runner-receipt.log"
    temp = output.with_name(f".{output.name}.{os.getpid()}.tmp")
    if temp.exists():
        raise EvidenceError(f"collision receipt temp already exists: {temp}")
    try:
        temp.write_text(receipt_text, encoding="utf-8")
        os.replace(temp, output)
    finally:
        temp.unlink(missing_ok=True)
    return output


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
        "command": (
            COLLISION_PREVIEW_COMMAND
            if runtime.get("mode") == "catalog_contract_preview"
            else COLLISION_COMMAND
        ),
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
        if key in result:
            raise EvidenceError(f"movement summary repeats key: {key}")
        result[key] = value
    return result


def expected_movement_workload(map_id: str) -> dict[str, Any]:
    relative_path = MAP_DATA_PATHS.get(map_id)
    if relative_path is None:
        raise EvidenceError(f"no authoritative map data registered for {map_id}")
    map_data = _read_json(GODOT_ROOT / relative_path)
    if map_data.get("id") != map_id:
        raise EvidenceError(f"authoritative map id mismatch for {map_id}")
    grid_size = map_data.get("gridSize")
    spawn_points = map_data.get("spawnPoints")
    if (
        not isinstance(grid_size, list)
        or len(grid_size) != 2
        or not all(isinstance(value, int) for value in grid_size)
        or not isinstance(spawn_points, dict)
    ):
        raise EvidenceError(f"authoritative movement geometry is invalid for {map_id}")
    start_value = spawn_points.get("default", map_data.get("spawnCell"))
    if (
        not isinstance(start_value, list)
        or len(start_value) != 2
        or not all(isinstance(value, int) for value in start_value)
    ):
        raise EvidenceError(f"authoritative default spawn is invalid for {map_id}")
    start = (int(start_value[0]), int(start_value[1]))
    blocked = {
        (int(value[0]), int(value[1]))
        for value in map_data.get("blockedCells", [])
        if isinstance(value, list) and len(value) >= 2
    }
    interaction_cells = {
        (int(value["cell"][0]), int(value["cell"][1]))
        for value in map_data.get("interactionPoints", [])
        if (
            isinstance(value, dict)
            and isinstance(value.get("cell"), list)
            and len(value["cell"]) >= 2
        )
    }
    cells = [
        (start[0] + (0 if index % 2 == 0 else 1), start[1] + (-1 if index % 2 == 0 else 0))
        for index in range(60)
    ]
    for cell in cells:
        if (
            cell[0] < 0
            or cell[1] < 0
            or cell[0] >= int(grid_size[0])
            or cell[1] >= int(grid_size[1])
            or cell in blocked
            or cell in interaction_cells
        ):
            raise EvidenceError(
                f"authoritative shared movement target is unsafe for {map_id}: {cell}"
            )
    start_key = f"{start[0]},{start[1]}"
    cell_keys = [f"{cell[0]},{cell[1]}" for cell in cells]
    serialized = (
        f"{MOVING_WORKLOAD_CONTRACT}|{map_id}|{start_key}|"
        + ";".join(cell_keys)
    )
    return {
        "sequenceId": MOVING_WORKLOAD_CONTRACT,
        "sequenceSha256": hashlib.sha256(serialized.encode("utf-8")).hexdigest(),
        "startCell": start_key,
        "actualStartCell": start_key,
        "finalCell": cell_keys[-1],
        "clicks": 60,
        "mouseEvents": 120,
    }


def _catalog_entry_for_map(catalog_path: Path, map_id: str) -> dict[str, Any]:
    catalog = _read_json(catalog_path)
    entries = catalog.get("entries")
    if not isinstance(entries, list):
        raise EvidenceError(f"map visual catalog entries must be an array: {catalog_path}")
    matches = [
        value
        for value in entries
        if isinstance(value, dict) and value.get("mapId") == map_id
    ]
    if len(matches) > 1:
        raise EvidenceError(f"map visual catalog duplicates mapId {map_id}")
    return dict(matches[0]) if matches else {}


def _resource_json(path: str) -> dict[str, Any]:
    if not path.startswith("res://"):
        raise EvidenceError(f"map visual resource path is invalid: {path}")
    return _read_json(GODOT_ROOT / path.removeprefix("res://"))


def _expected_map_visual_runtime_state(
    map_id: str,
    variant: str,
    receipt_bundle_id: str,
) -> dict[str, Any]:
    normal_entry = _catalog_entry_for_map(
        GODOT_ROOT / "data/map_visual_catalog.json",
        map_id,
    )
    review_entry = _catalog_entry_for_map(
        GODOT_ROOT / "data/map_visual_review_catalog.json",
        map_id,
    )
    qa_preview = variant == "candidate"
    source = ""
    entry: dict[str, Any] = {}
    if not qa_preview:
        if normal_entry:
            source = "normal"
            entry = normal_entry
    elif review_entry:
        if normal_entry and review_entry == normal_entry:
            source = "normal"
            entry = normal_entry
        else:
            source = "review"
            entry = review_entry
    elif normal_entry:
        source = "normal"
        entry = normal_entry

    # Synthetic unit fixtures use an unknown map id.  Keep their state strict
    # and internally coherent without weakening any repository-known map: an
    # unknown candidate models one staged review bundle, while an unknown
    # baseline models fallback rendering.
    if not entry and map_id not in {
        str(value.get("mapId", ""))
        for catalog_path in (
            GODOT_ROOT / "data/map_visual_catalog.json",
            GODOT_ROOT / "data/map_visual_review_catalog.json",
        )
        for value in _read_json(catalog_path).get("entries", [])
        if isinstance(value, dict)
    } and qa_preview:
        return {
            "mapVisualActive": True,
            "mapVisualBundleId": receipt_bundle_id,
            "mapVisualCatalogSource": "review",
            "mapVisualMapId": map_id,
            "mapVisualQaPreview": True,
            "mapVisualReviewCandidate": True,
            "mapVisualStatus": "owner_review_pending",
        }
    if not entry:
        return {
            "mapVisualActive": False,
            "mapVisualBundleId": "",
            "mapVisualCatalogSource": "",
            "mapVisualMapId": "",
            "mapVisualQaPreview": False,
            "mapVisualReviewCandidate": False,
            "mapVisualStatus": "",
        }
    manifest = _resource_json(str(entry.get("bundleManifest", "")))
    return {
        "mapVisualActive": True,
        "mapVisualBundleId": str(manifest.get("bundleId", "")),
        "mapVisualCatalogSource": source,
        "mapVisualMapId": map_id,
        "mapVisualQaPreview": qa_preview,
        "mapVisualReviewCandidate": source == "review",
        "mapVisualStatus": str(manifest.get("status", "")),
    }


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
    sampling_contract = record.get("samplingContract")
    repeated_sampling = isinstance(sampling_contract, dict)
    measurement_report: dict[str, Any] | None = None
    measurement_output_lines = (stdout + "\n" + stderr).splitlines()
    if repeated_sampling:
        expected_contract_keys = {
            "version",
            "warmupFrames",
            "measurementFrames",
            "sampleFrames",
            "measurementBoundary",
            "audioPlaybackDisabled",
            "cleanExitRequired",
            "processScopeMonitor",
            "movingWorkloadContract",
        }
        if set(sampling_contract) != expected_contract_keys:
            raise EvidenceError("performance sampling contract keys are invalid")
        mode = record.get("mode")
        expected_boundary = (
            "shared_input_then_fixed_frames"
            if mode == "moving"
            else "post_warmup_fixed_frames"
        )
        expected_workload = (
            "spawn_adjacent_pair_v1" if mode == "moving" else None
        )
        warmup_frames = sampling_contract.get("warmupFrames")
        measurement_frames = sampling_contract.get("measurementFrames")
        sample_frames = sampling_contract.get("sampleFrames")
        if (
            sampling_contract.get("version") != 2
            or warmup_frames != PERF_WARMUP_FRAMES
            or measurement_frames != PERF_MEASUREMENT_FRAMES
            or sample_frames != PERF_SAMPLE_FRAMES
            or sampling_contract.get("measurementBoundary")
            != expected_boundary
            or sampling_contract.get("audioPlaybackDisabled") is not True
            or sampling_contract.get("cleanExitRequired") is not True
            or sampling_contract.get("processScopeMonitor")
            != "process_priority_boundary_v1"
            or sampling_contract.get("movingWorkloadContract")
            != expected_workload
        ):
            raise EvidenceError("performance sampling contract values are invalid")
        if (
            record.get("schemaVersion") != (2 if "batch" in record else 1)
            or record.get("recordType")
            != "beastbound_map_performance_runner_receipt"
            or record.get("runner") != "godot"
            or record.get("runnerVersion") != RUNNER_VERSION
            or not isinstance(record.get("buildIdentity"), str)
            or not str(record.get("buildIdentity", "")).strip()
            or not isinstance(record.get("bundleId"), str)
            or not str(record.get("bundleId", "")).strip()
        ):
            raise EvidenceError("performance runner identity is invalid")
        expected_tool_hashes = performance_evidence_tool_hashes()
        if any(
            record.get(key) != value
            for key, value in expected_tool_hashes.items()
        ):
            raise EvidenceError("performance evidence tool identity is stale")
        argv = record.get("argv")
        if not isinstance(argv, list) or not all(isinstance(value, str) for value in argv):
            raise EvidenceError("performance sampling argv must be a string array")
        if any(value.startswith("--quit-after") for value in argv):
            raise EvidenceError("performance sampling must use runtime clean exit")
        expected_argv = (
            batch_contract.command(argv[0])
            if "batch" in record and argv
            else expected_performance_argv(
                argv[0] if argv else "", str(record.get("mapId", "")),
                str(record.get("variant", "")), str(mode),
            )
        )
        if "batch" in record:
            try:
                batch_contract.validate_binding(record)
            except ValueError as error:
                raise EvidenceError(str(error)) from error
        if (
            mode not in ("idle", "moving")
            or record.get("variant") not in ("baseline", "candidate")
            or not argv
            or Path(argv[0]).name.lower() != "godot"
            or argv != expected_argv
        ):
            raise EvidenceError("performance argv is not the canonical command")
        combined_output = stdout + "\n" + stderr
        warmup_lines = [
            line
            for line in combined_output.splitlines()
            if line.startswith(PERF_WARMUP_PREFIX)
        ]
        if len(warmup_lines) != 1:
            raise EvidenceError("performance run must emit one warmup completion")
        output_lines = combined_output.splitlines()
        warmup_line_index = output_lines.index(warmup_lines[0])
        runtime_lines = [
            line
            for line in output_lines
            if line.startswith(PERF_RUNTIME_PREFIX)
        ]
        if len(runtime_lines) != 1:
            raise EvidenceError("performance run must emit one runtime identity")
        runtime_line_index = output_lines.index(runtime_lines[0])
        perf_line_indexes = [
            index
            for index, line in enumerate(output_lines)
            if PERF_LINE_RE.match(line) is not None
        ]
        measurement_lines = [
            line
            for line in output_lines
            if line.startswith(PERF_MEASUREMENT_PREFIX)
        ]
        if len(measurement_lines) != 1:
            raise EvidenceError(
                "performance run must emit one measurement completion"
            )
        measurement_line_index = output_lines.index(measurement_lines[0])
        if (
            not perf_line_indexes
            or runtime_line_index <= warmup_line_index
            or runtime_line_index >= min(perf_line_indexes)
            or any(
                index <= warmup_line_index or index >= measurement_line_index
                for index in perf_line_indexes
            )
        ):
            raise EvidenceError(
                "performance samples must stay inside the measurement window"
            )
        moving_line_indexes = [
            index
            for index, line in enumerate(output_lines)
            if MOVING_LINE_RE.match(line) is not None
        ]
        if mode == "idle" and moving_line_indexes:
            raise EvidenceError("idle run emitted a movement summary")
        if mode == "moving" and (
            len(moving_line_indexes) != 1
            or moving_line_indexes[0] <= runtime_line_index
            or moving_line_indexes[0] >= min(perf_line_indexes)
        ):
            raise EvidenceError(
                "moving run must emit exactly one pre-sample movement summary"
            )
        try:
            warmup_report = json.loads(warmup_lines[0][len(PERF_WARMUP_PREFIX) :])
        except json.JSONDecodeError as error:
            raise EvidenceError("performance warmup completion is invalid JSON") from error
        if not isinstance(warmup_report, dict) or warmup_report != {
            "frames": warmup_frames,
            "status": "passed",
        }:
            raise EvidenceError("performance warmup completion identity mismatch")
        try:
            runtime_report = json.loads(
                runtime_lines[0][len(PERF_RUNTIME_PREFIX) :]
            )
        except json.JSONDecodeError as error:
            raise EvidenceError("performance runtime identity is invalid JSON") from error
        expected_visual_state = _expected_map_visual_runtime_state(
            str(record.get("mapId", "")),
            str(record.get("variant", "")),
            str(record.get("bundleId", "")),
        )
        if (
            expected_visual_state.get("mapVisualActive") is True
            and expected_visual_state.get("mapVisualBundleId")
            != record.get("bundleId")
        ):
            raise EvidenceError("performance runtime bundle identity mismatch")
        expected_runtime_report = {
            "candidateEnabled": record.get("variant") == "candidate",
            "displayServer": "macOS",
            "engineVersion": RUNTIME_ENGINE_VERSION,
            "engineVersionHash": RUNNER_VERSION.rsplit(".", 1)[1],
            "mapId": record.get("mapId"),
            **expected_visual_state,
            "processScopeMonitor": "process_priority_boundary_v1",
            "processScopePriorities": [-1000000, 1000000],
            "processScopeReady": True,
            "renderingDriver": "metal",
            "renderingMethod": "mobile",
            "sampleFrames": PERF_SAMPLE_FRAMES,
            "status": "passed",
            "videoAdapterName": runtime_report.get("videoAdapterName")
            if isinstance(runtime_report, dict)
            else None,
            "viewportSize": [1280, 720],
            "vsyncMode": 0,
        }
        if (
            not isinstance(runtime_report, dict)
            or set(runtime_report) != set(expected_runtime_report)
            or str(runtime_report.get("renderingDriver", "")).lower() != "metal"
            or not str(runtime_report.get("videoAdapterName", "")).strip()
            or any(
                runtime_report.get(key) != value
                for key, value in expected_runtime_report.items()
                if key not in ("renderingDriver", "videoAdapterName")
            )
        ):
            raise EvidenceError("performance runtime identity mismatch")
        try:
            measurement_report = json.loads(
                measurement_lines[0][len(PERF_MEASUREMENT_PREFIX) :]
            )
        except json.JSONDecodeError as error:
            raise EvidenceError(
                "performance measurement completion is invalid JSON"
            ) from error
        expected_measurement_report = {
            "completeSamples": 8,
            "discardedPartialFrames": 0,
            "expectedFrames": measurement_frames,
            "frames": measurement_frames,
            "mode": expected_boundary,
            "processScope": "process_priority_boundary_v1",
            "processScopeFrames": measurement_frames,
            "status": "passed",
        }
        if (
            not isinstance(measurement_report, dict)
            or measurement_report != expected_measurement_report
        ):
            raise EvidenceError(
                "performance measurement completion identity mismatch"
            )
        cleanup_lines = [
            line
            for line in combined_output.splitlines()
            if line.startswith(PERF_CLEAN_EXIT_PREFIX)
        ]
        if len(cleanup_lines) != 1:
            raise EvidenceError("performance run must emit one clean-exit report")
        cleanup_line_index = output_lines.index(cleanup_lines[0])
        if cleanup_line_index <= measurement_line_index:
            raise EvidenceError(
                "performance clean exit must follow measurement completion"
            )
        measurement_output_lines = output_lines[
            warmup_line_index + 1 : measurement_line_index
        ]
        try:
            cleanup = json.loads(cleanup_lines[0][len(PERF_CLEAN_EXIT_PREFIX) :])
        except json.JSONDecodeError as error:
            raise EvidenceError("performance clean-exit report is invalid JSON") from error
        if not isinstance(cleanup, dict):
            raise EvidenceError("performance clean-exit report must be an object")
        for key in (
            "audioManagerReleased",
            "audioPlaybackDisabled",
            "audioStopped",
            "audioStreamsDetached",
        ):
            if cleanup.get(key) is not True:
                raise EvidenceError(f"performance clean-exit failed: {key}")
        if cleanup.get("status") != "passed" or cleanup.get("requestedExitCode") != 0:
            raise EvidenceError("performance clean-exit status failed")
        detached_player_count = cleanup.get("detachedAudioPlayerCount")
        if (
            not isinstance(detached_player_count, int)
            or isinstance(detached_player_count, bool)
            or detached_player_count <= 0
        ):
            raise EvidenceError("performance clean-exit detached no audio players")
    samples: list[dict[str, float]] = []
    moving_summaries: list[dict[str, str]] = []
    if repeated_sampling and record.get("mode") == "moving":
        moving_match = MOVING_LINE_RE.match(output_lines[moving_line_indexes[0]])
        if moving_match is None:
            raise EvidenceError("moving summary identity disappeared")
        moving_summaries.append(_parse_key_values(moving_match.group("body")))
    for line in measurement_output_lines:
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
                    "frames": float(perf_match.group("frames")),
                    "process_total": metrics["process_total"],
                    "draw_world": metrics.get("draw_world", 0.0),
                    "draw_world_observed": float("draw_world" in metrics),
                    "process_scope_total": metrics.get(
                        "process_scope_total",
                        -1.0,
                    ),
                }
            )
        moving_match = MOVING_LINE_RE.match(line)
        if moving_match is not None and not repeated_sampling:
            moving_summaries.append(_parse_key_values(moving_match.group("body")))
    minimum_samples = 8 if repeated_sampling else (
        2 if record.get("mode") == "moving" else 3
    )
    if len(samples) < minimum_samples:
        raise EvidenceError(
            f"performance run has fewer than {minimum_samples} samples: {record.get('mapId')} "
            f"{record.get('variant')} {record.get('mode')}"
        )
    if repeated_sampling:
        if len(samples) != 8 or measurement_report is None:
            raise EvidenceError(
                "performance fixed measurement must contain eight samples"
            )
        if any(
            int(sample["frames"]) != PERF_SAMPLE_FRAMES
            or abs(float(sample["fps"]) - 60.0) > 0.001
            for sample in samples
        ):
            raise EvidenceError(
                "performance samples must use exact 60-frame fixed-step windows"
            )
        measured_frames = sum(int(sample["frames"]) for sample in samples)
        if measured_frames != int(measurement_report["frames"]):
            raise EvidenceError(
                "performance sample frames do not fill the measurement window"
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
        "measurementFrames": sum(int(sample["frames"]) for sample in samples),
        "fpsMinMeanMax": triplet("fps"),
        "processTotalMsMinMeanMax": triplet("process_total"),
        "drawWorldMsMinMeanMax": triplet("draw_world"),
        "drawWorldObservedSampleCount": sum(
            int(sample["draw_world_observed"]) for sample in samples
        ),
    }
    if repeated_sampling and measurement_report is not None:
        result["measurementBoundary"] = str(measurement_report["mode"])
        result["runtimeIdentity"] = runtime_report
    process_scope_values = [
        sample["process_scope_total"]
        for sample in samples
        if sample["process_scope_total"] >= 0.0
    ]
    if repeated_sampling and len(process_scope_values) != len(samples):
        raise EvidenceError("performance run lacks full process-scope samples")
    if process_scope_values:
        result["processScopeTotalMsMinMeanMax"] = [
            round(min(process_scope_values), 3),
            round(sum(process_scope_values) / len(process_scope_values), 3),
            round(max(process_scope_values), 3),
        ]
    if record.get("mode") != "moving":
        if moving_summaries:
            raise EvidenceError("idle run emitted a movement summary")
        return result
    if len(moving_summaries) != 1:
        raise EvidenceError("moving run must emit exactly one movement summary")
    moving_values = moving_summaries[0]
    if moving_values is None or moving_values.get("status") != "ok":
        raise EvidenceError("moving run lacks a PASS movement summary")
    required_true = (
        "moved",
        "coalesced",
        "settled",
        "final_match",
        "screen_roundtrip",
        "projection_ready",
    )
    if any(moving_values.get(key) != "true" for key in required_true):
        raise EvidenceError(f"moving summary invariant failed: {moving_values}")
    if moving_values.get("battle") != "false" or moving_values.get("encounter") != "false":
        raise EvidenceError("moving run entered battle/encounter")
    def moving_int(key: str) -> int:
        try:
            return int(moving_values[key])
        except (KeyError, TypeError, ValueError) as error:
            raise EvidenceError(
                f"moving summary integer is invalid: {key}"
            ) from error

    clicks = moving_int("clicks")
    accepted = moving_int("accepted")
    resolved = moving_int("resolved")
    applied = moving_int("applied")
    if accepted != clicks:
        raise EvidenceError("moving click acceptance counts are inconsistent")
    # The runtime deliberately coalesces burst targets twice: screen points are
    # first resolved after debounce, then a resolved target may be superseded or
    # prove equivalent before a path is applied.  Keep the evidence contract in
    # lockstep with Main.gd: at least one path must be applied, no path may be
    # applied without a resolved target, and the burst must collapse before the
    # accepted-click count.  Requiring applied == resolved rejects healthy
    # camera-relative bursts whose final target still settles exactly.
    if not (0 < applied <= resolved < accepted):
        raise EvidenceError("moving resolve/apply coalescing counts are inconsistent")
    workload_identity: dict[str, Any] | None = None
    if repeated_sampling:
        click_limit = moving_int("click_limit")
        target_count = moving_int("target_count")
        mouse_events = moving_int("mouse_events")
        ui_skipped = moving_int("ui_skipped")
        interaction_skipped = moving_int("interaction_skipped")
        input_ui = moving_int("input_ui")
        remote_hit = moving_int("remote_hit")
        screen_matches = moving_int("screen_matches")
        screen_mismatches = moving_int("screen_mismatches")
        sequence_id = moving_values.get("sequence_id", "")
        sequence_sha256 = moving_values.get("sequence_sha256", "")
        start_cell = moving_values.get("start_cell", "")
        actual_start_cell = moving_values.get("actual_start_cell", "")
        final_cell = moving_values.get("final_cell", "")
        expected_cell = moving_values.get("expected_cell", "")
        if (
            clicks != 60
            or click_limit != 60
            or accepted != 60
            or target_count != 60
            or mouse_events != 120
            or ui_skipped != 0
            or interaction_skipped != 0
            or input_ui != 0
            or remote_hit != 0
            or screen_matches != 60
            or screen_mismatches != 0
            or sequence_id != "spawn_adjacent_pair_v1"
            or re.fullmatch(r"[0-9a-f]{64}", sequence_sha256) is None
            or re.fullmatch(r"\d+,\d+", start_cell) is None
            or actual_start_cell != start_cell
            or re.fullmatch(r"\d+,\d+", final_cell) is None
            or final_cell != expected_cell
            or moving_values.get("shared_error") != "none"
        ):
            raise EvidenceError(
                f"moving shared workload identity failed: {moving_values}"
            )
        workload_identity = {
            "sequenceId": sequence_id,
            "sequenceSha256": sequence_sha256,
            "startCell": start_cell,
            "actualStartCell": actual_start_cell,
            "finalCell": final_cell,
            "clicks": clicks,
            "mouseEvents": mouse_events,
        }
        map_id = str(record.get("mapId", ""))
        if map_id in MAP_DATA_PATHS:
            expected_workload_identity = expected_movement_workload(map_id)
            if workload_identity != expected_workload_identity:
                raise EvidenceError(
                    "moving shared workload does not match authoritative map data"
                )
    result.update(
        {
            "clicks": clicks,
            "accepted": accepted,
            "resolved": resolved,
            "applied": applied,
            "avgInputUs": moving_int("avg_input_us"),
            "maxInputUs": moving_int("max_input_us"),
            "moved": True,
            "coalesced": True,
            "settled": True,
            "finalTargetMatched": True,
            "battle": False,
            "encounter": False,
        }
    )
    if workload_identity is not None:
        result["workloadIdentity"] = workload_identity
    return result


def aggregate_perf_runs(records: list[dict[str, Any]]) -> dict[str, Any]:
    """Aggregate independent runs without allowing an outlier to define the mean."""
    if len(records) < 3 or len(records) % 2 == 0:
        raise EvidenceError(
            "repeated performance evidence requires an odd run count of at least 3"
        )
    repetitions: list[int] = []
    parsed: list[dict[str, Any]] = []
    for record in records:
        repetition = record.get("repetition")
        if (
            not isinstance(repetition, int)
            or isinstance(repetition, bool)
            or repetition <= 0
        ):
            raise EvidenceError("performance repetition must be a positive integer")
        repetitions.append(repetition)
        parsed.append(parse_perf_run(record))
    expected_repetitions = list(range(1, len(records) + 1))
    if sorted(repetitions) != expected_repetitions:
        raise EvidenceError(
            "performance repetitions must be unique and contiguous from 1"
        )
    ordered = [
        sample
        for _repetition, sample in sorted(zip(repetitions, parsed), key=lambda pair: pair[0])
    ]

    def aggregate_triplet(key: str) -> list[float]:
        values = [sample[key] for sample in ordered]
        return [
            round(min(value[0] for value in values), 3),
            round(float(median(value[1] for value in values)), 3),
            round(max(value[2] for value in values), 3),
        ]

    result: dict[str, Any] = {
        "samples": sum(int(sample["samples"]) for sample in ordered),
        "measurementFrames": sum(
            int(sample["measurementFrames"]) for sample in ordered
        ),
        "fpsMinMeanMax": aggregate_triplet("fpsMinMeanMax"),
        "processTotalMsMinMeanMax": aggregate_triplet(
            "processTotalMsMinMeanMax"
        ),
        "drawWorldMsMinMeanMax": aggregate_triplet("drawWorldMsMinMeanMax"),
        "drawWorldObservedSampleCount": sum(
            int(sample.get("drawWorldObservedSampleCount", 0)) for sample in ordered
        ),
        "repetitionCount": len(ordered),
        "aggregationMethod": "median_of_independent_run_means_with_envelope_extrema",
        "runMeanValues": {
            "fps": [sample["fpsMinMeanMax"][1] for sample in ordered],
            "processTotalMs": [
                sample["processTotalMsMinMeanMax"][1] for sample in ordered
            ],
            "drawWorldMs": [
                sample["drawWorldMsMinMeanMax"][1] for sample in ordered
            ],
            "measurementFrames": [
                int(sample["measurementFrames"]) for sample in ordered
            ],
        },
    }
    runtime_identities = [sample.get("runtimeIdentity") for sample in ordered]
    if all(isinstance(value, dict) for value in runtime_identities):
        canonical_runtime_identities = {
            json.dumps(value, ensure_ascii=False, sort_keys=True)
            for value in runtime_identities
        }
        if len(canonical_runtime_identities) != 1:
            raise EvidenceError("performance repetitions changed runtime identity")
        result["runtimeIdentity"] = runtime_identities[0]
    measurement_boundaries = [sample.get("measurementBoundary") for sample in ordered]
    if all(isinstance(value, str) and value for value in measurement_boundaries):
        if len(set(measurement_boundaries)) != 1:
            raise EvidenceError("performance repetitions changed measurement boundary")
        result["measurementBoundary"] = measurement_boundaries[0]
    if all("processScopeTotalMsMinMeanMax" in sample for sample in ordered):
        result["processScopeTotalMsMinMeanMax"] = aggregate_triplet(
            "processScopeTotalMsMinMeanMax"
        )
        result["runMeanValues"]["processScopeTotalMs"] = [
            sample["processScopeTotalMsMinMeanMax"][1] for sample in ordered
        ]
    if records[0].get("mode") != "moving":
        return result
    workload_identities = [sample.get("workloadIdentity") for sample in ordered]
    if any(not isinstance(value, dict) for value in workload_identities):
        raise EvidenceError("moving repeated runs lack workload identity")
    canonical_workloads = {
        json.dumps(value, ensure_ascii=False, sort_keys=True)
        for value in workload_identities
    }
    if len(canonical_workloads) != 1:
        raise EvidenceError(
            "moving repetitions did not reuse one exact workload"
        )
    result.update(
        {
            "clicks": sum(int(sample["clicks"]) for sample in ordered),
            "accepted": sum(int(sample["accepted"]) for sample in ordered),
            "resolved": sum(int(sample["resolved"]) for sample in ordered),
            "applied": sum(int(sample["applied"]) for sample in ordered),
            "avgInputUs": int(median(int(sample["avgInputUs"]) for sample in ordered)),
            "maxInputUs": max(int(sample["maxInputUs"]) for sample in ordered),
            "moved": True,
            "coalesced": True,
            "settled": True,
            "finalTargetMatched": True,
            "battle": False,
            "encounter": False,
            "workloadIdentityByRepetition": workload_identities,
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
    try:
        batch_contract.validate_matrix(records)
    except ValueError as error:
        raise EvidenceError(str(error)) from error
    grouped: dict[tuple[str, str, str], list[dict[str, Any]]] = {}
    explicit_repetitions = ["repetition" in record for record in records]
    if any(explicit_repetitions) and not all(explicit_repetitions):
        raise EvidenceError(
            "performance receipt cannot mix repeated and legacy single-run records"
        )
    for record in records:
        identity = (
            str(record.get("mapId", "")),
            str(record.get("variant", "")),
            str(record.get("mode", "")),
        )
        grouped.setdefault(identity, []).append(record)
    expected = {
        (map_id, variant, mode)
        for map_id in map_ids
        for variant in ("baseline", "candidate")
        for mode in ("idle", "moving")
    }
    if set(grouped) != expected:
        raise EvidenceError(
            f"performance matrix mismatch; missing={sorted(expected-set(grouped))} "
            f"extra={sorted(set(grouped)-expected)}"
        )
    repeated = all(explicit_repetitions)
    if repeated:
        if any(not isinstance(record.get("samplingContract"), dict) for record in records):
            raise EvidenceError(
                "repeated performance evidence requires the warmup/clean-exit sampling contract"
            )
        for record in records:
            repetition = record.get("repetition")
            if (
                not isinstance(repetition, int)
                or isinstance(repetition, bool)
                or repetition <= 0
            ):
                raise EvidenceError(
                    "performance repetition must be a positive integer"
                )
            if (
                record.get("buildIdentity") != build_id
                or record.get("runnerVersion") != RUNNER_VERSION
                or record.get("bundleId") != bundle_id
            ):
                raise EvidenceError(
                    "performance receipt is stale for the current build identity"
                )
            qa_lane = record.get("qaLane")
            if (
                not isinstance(qa_lane, dict)
                or qa_lane.get("verified") is not True
                or qa_lane.get("realUnchanged") is not True
                or qa_lane.get("laneAbsentAfterCleanup") is not True
                or re.fullmatch(
                    r"[0-9a-f]{64}",
                    str(qa_lane.get("realInventorySha256", "")),
                )
                is None
                or re.fullmatch(
                    r"[0-9a-f]{64}",
                    str(qa_lane.get("postCleanupInspectionSha256", "")),
                )
                is None
            ):
                raise EvidenceError(
                    "performance receipt lacks completed QA lane isolation"
                )
        real_inventory_hashes = {
            str(record["qaLane"]["realInventorySha256"])
            for record in records
        }
        if len(real_inventory_hashes) != 1:
            raise EvidenceError(
                "real user data changed between performance runs"
            )
        repetition_sets = {
            tuple(sorted(record["repetition"] for record in group))
            for group in grouped.values()
        }
        if len(repetition_sets) != 1:
            raise EvidenceError(
                "every performance matrix cell must use the same repetitions"
            )
        repetitions = next(iter(repetition_sets))
        if (
            len(repetitions) < 3
            or len(repetitions) % 2 == 0
            or repetitions != tuple(range(1, len(repetitions) + 1))
        ):
            raise EvidenceError(
                "performance repetitions must be a shared odd contiguous range from 1"
            )
        actual_order = [
            (
                str(record.get("mapId", "")),
                str(record.get("variant", "")),
                str(record.get("mode", "")),
                int(record["repetition"]),
            )
            for record in records
        ]
        expected_order = expected_performance_matrix(
            map_ids,
            len(repetitions),
        )
        if actual_order != expected_order:
            raise EvidenceError(
                "performance receipt execution order does not match the matrix"
            )
    else:
        if any(len(group) != 1 for group in grouped.values()):
            raise EvidenceError("duplicate legacy performance run")
        repetitions = (1,)

    def summarize(identity: tuple[str, str, str]) -> dict[str, Any]:
        group = grouped[identity]
        if repeated:
            return aggregate_perf_runs(group)
        return parse_perf_run(group[0])

    metric_triplet_key = (
        "processScopeTotalMsMinMeanMax"
        if repeated
        else "processTotalMsMinMeanMax"
    )
    run_mean_metric_key = (
        "processScopeTotalMs" if repeated else "processTotalMs"
    )
    comparison_delta_key = (
        "processScopeTotalMeanDeltaMs"
        if repeated
        else "processTotalMeanDeltaMs"
    )
    thresholds = (
        PROCESS_SCOPE_THRESHOLDS
        if repeated
        else LEGACY_PROCESS_THRESHOLDS
    )
    candidate_idle_threshold_key = (
        "candidateIdleProcessScopeMeanMaxMs"
        if repeated
        else "candidateIdleProcessMeanMaxMs"
    )
    candidate_moving_threshold_key = (
        "candidateMovingProcessScopeMeanMaxMs"
        if repeated
        else "candidateMovingProcessMeanMaxMs"
    )
    idle_regression_threshold_key = (
        "idleProcessScopeRegressionMaxMs"
        if repeated
        else "idleRegressionMaxMs"
    )
    moving_regression_threshold_key = (
        "movingProcessScopeRegressionMaxMs"
        if repeated
        else "movingRegressionMaxMs"
    )
    maps: list[dict[str, Any]] = []
    for map_id in map_ids:
        baseline = {
            "renderer": "legacy_fallback",
            "idle": summarize((map_id, "baseline", "idle")),
            "moving": summarize((map_id, "baseline", "moving")),
        }
        candidate = {
            "renderer": "map_visual_candidate",
            "idle": summarize((map_id, "candidate", "idle")),
            "moving": summarize((map_id, "candidate", "moving")),
        }
        if repeated and (
            baseline["idle"]["runtimeIdentity"]
            != baseline["moving"]["runtimeIdentity"]
            or candidate["idle"]["runtimeIdentity"]
            != candidate["moving"]["runtimeIdentity"]
        ):
            raise EvidenceError(
                f"performance runtime identity changed between modes for {map_id}"
            )
        if repeated and (
            baseline["moving"]["workloadIdentityByRepetition"]
            != candidate["moving"]["workloadIdentityByRepetition"]
        ):
            raise EvidenceError(
                f"performance moving workload mismatch for {map_id}"
            )
        idle_delta = round(
            candidate["idle"][metric_triplet_key][1]
            - baseline["idle"][metric_triplet_key][1],
            3,
        )
        moving_delta = round(
            candidate["moving"][metric_triplet_key][1]
            - baseline["moving"][metric_triplet_key][1],
            3,
        )
        paired_deltas: dict[str, list[float]] = {}
        paired_delta_medians: dict[str, float] = {}
        if repeated:
            for mode in ("idle", "moving"):
                baseline_run_means = baseline[mode]["runMeanValues"][
                    run_mean_metric_key
                ]
                candidate_run_means = candidate[mode]["runMeanValues"][
                    run_mean_metric_key
                ]
                paired_deltas[mode] = [
                    round(candidate_mean - baseline_mean, 3)
                    for baseline_mean, candidate_mean in zip(
                        baseline_run_means,
                        candidate_run_means,
                    )
                ]
                paired_delta_medians[mode] = round(
                    float(median(paired_deltas[mode])),
                    3,
                )
        gates = {
            "candidateIdleWithinLimit": (
                candidate["idle"][metric_triplet_key][1]
                <= thresholds[candidate_idle_threshold_key]
            ),
            "candidateMovingWithinLimit": (
                candidate["moving"][metric_triplet_key][1]
                <= thresholds[candidate_moving_threshold_key]
            ),
            "idleRegressionWithinLimit": (
                idle_delta <= thresholds[idle_regression_threshold_key]
                and (
                    not repeated
                    or paired_delta_medians["idle"]
                    <= thresholds[idle_regression_threshold_key]
                )
            ),
            "movingRegressionWithinLimit": (
                moving_delta <= thresholds[moving_regression_threshold_key]
                and (
                    not repeated
                    or paired_delta_medians["moving"]
                    <= thresholds[moving_regression_threshold_key]
                )
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
                    comparison_delta_key: {
                        "idle": idle_delta,
                        "moving": moving_delta,
                    },
                    "pairedAggregation": (
                        {
                            "repetitions": list(repetitions),
                            "processScopeTotalMeanDeltaMsByRepetition": paired_deltas,
                            "medianProcessScopeTotalMeanDeltaMs": paired_delta_medians,
                            "gates": {
                                "idleRegressionWithinLimit": (
                                    "PASS"
                                    if paired_delta_medians["idle"]
                                    <= thresholds[idle_regression_threshold_key]
                                    else "FAIL"
                                ),
                                "movingRegressionWithinLimit": (
                                    "PASS"
                                    if paired_delta_medians["moving"]
                                    <= thresholds[moving_regression_threshold_key]
                                    else "FAIL"
                                ),
                            },
                            "thresholdSource": "comparison.thresholds",
                        }
                        if repeated
                        else None
                    ),
                    "thresholds": thresholds,
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
    comparison_mode = "legacy_fallback_vs_candidate"
    if repeated:
        baseline_runtime_states = [
            value["baseline"]["idle"]["runtimeIdentity"] for value in maps
        ]
        candidate_runtime_states = [
            value["candidate"]["idle"]["runtimeIdentity"] for value in maps
        ]
        if (
            all(state.get("mapVisualActive") is False for state in baseline_runtime_states)
            and all(
                state.get("mapVisualActive") is True
                and state.get("mapVisualCatalogSource") == "review"
                for state in candidate_runtime_states
            )
        ):
            comparison_mode = "legacy_fallback_vs_candidate"
        elif (
            all(state.get("mapVisualActive") is True for state in baseline_runtime_states)
            and all(state.get("mapVisualActive") is True for state in candidate_runtime_states)
            and all(
                state.get("mapVisualCatalogSource") == "normal"
                for state in baseline_runtime_states + candidate_runtime_states
            )
        ):
            comparison_mode = "released_primary_vs_same_primary_qa_preview"
        else:
            raise EvidenceError(
                "performance report comparison runtime states are unsupported"
            )
    report = {
        "schemaVersion": 1,
        "reportType": "beastbound_map_performance_report",
        "bundleId": bundle_id,
        "result": "PASS",
        "comparisonMode": comparison_mode,
        "aggregationMode": (
            "median_of_independent_run_means_with_envelope_extrema"
            if repeated
            else "legacy_single_run"
        ),
        "repetitionCount": len(repetitions),
        "executionOrder": (
            "repetition_then_rotated_map_then_mode_then_alternating_variant_order"
            if repeated
            else "legacy_single_run"
        ),
        "generatedAtUtc": generated_at,
        "scene": GODOT_SCENE,
        "viewport": [1280, 720],
        "displayServer": "macOS Metal",
        "movingInputDelivery": "Input.parse_input_event",
        "movingInputFrameSeparated": True,
        "controlledFixedStepFps": 60,
        "metricScope": {
            "comparisonAndGateMetric": metric_triplet_key,
            "processTotalMsMinMeanMax": "Main._process_only",
            "processScopeTotalMsMinMeanMax": "QA_process_priority_boundaries_all_intervening_Node_process_callbacks",
            "drawWorldMsMinMeanMax": "Main._draw_only_missing_windows_recorded_as_zero",
        },
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
            f"All {len(records)} variants ran through the real Main.tscn non-headless Metal path.",
            (
                f"Each matrix cell used {len(repetitions)} fresh-Main samples; the reported mean is the median of sample means, while min/max preserve the full envelope."
                if repeated
                else "This historical receipt predates repeated-run aggregation and uses one validated run per matrix cell."
            ),
            (
                "Odd repetitions ran baseline then candidate; even repetitions reversed the order to limit systematic cache/order bias."
                if repeated
                else "Legacy execution order is preserved by the raw receipt."
            ),
            (
                "Repeated runs rotated map order, discarded 180 warmup frames, disabled audio playback, and required shared runtime clean-exit cleanup."
                if repeated
                else "Legacy sampling predates the warmup and runtime clean-exit contract."
            ),
            "Moving variants used cross-frame Input.parse_input_event mouse press/release delivery.",
            (
                "One process/window; Main state resets between samples, while process resource caches remain shared. This is fixed-step steady-state CPU evidence, not cold-start or observed display FPS."
                if "batch" in records[0]
                else "Each historical sample used a separate process/window."
            ),
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
        choices=("identity", "collision-receipt", "collision", "performance"),
    )
    parser.add_argument(
        "--bundle-id",
        choices=tuple(MAP_BUNDLES),
    )
    parser.add_argument("--build-identity")
    parser.add_argument("--update-manifest-ref", action="store_true")
    parser.add_argument(
        "--allow-pending-catalog-preview",
        action="store_true",
        help=(
            "For collision-receipt only: use the read-only catalog preview "
            "runner for an exact fail-closed owner_review_pending bundle."
        ),
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        if (
            args.allow_pending_catalog_preview
            and args.mode != "collision-receipt"
        ):
            raise EvidenceError(
                "--allow-pending-catalog-preview is only valid for "
                "collision-receipt"
            )
        identity = build_identity()
        if args.mode == "identity":
            print(identity)
            return 0
        if args.bundle_id is None:
            raise EvidenceError("--bundle-id is required")
        if args.mode == "collision-receipt":
            output = capture_collision_receipt(
                args.bundle_id,
                allow_pending_catalog_preview=(
                    args.allow_pending_catalog_preview
                ),
            )
            print(
                json.dumps(
                    {
                        "status": "PASS",
                        "output": str(output),
                        "sha256": _sha256(output),
                    },
                    ensure_ascii=False,
                    indent=2,
                )
            )
            return 0
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
