#!/usr/bin/env python3
"""Run the strict offline pre-export gate for released map visual bundles."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import subprocess
import sys
from typing import Any, Callable, Sequence

import promote_map_visual_release as release_tool


REPO_ROOT = Path(__file__).resolve().parents[1]
AUDITOR_PATH = (
    REPO_ROOT
    / ".agents/skills/design-beastbound-maps/scripts/audit_map_bundle.py"
)


class PreexportGateError(RuntimeError):
    """A strict pre-export contract failure."""


def _strict_audit_contract(
    payload: Any,
    *,
    returncode: int,
    stderr: str,
) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise PreexportGateError("auditor stdout 根节点不是 JSON object")
    status = payload.get("status")
    release_ready = payload.get("releaseReady")
    missing = payload.get("missingReleaseGates")
    if returncode != 0:
        raise PreexportGateError(
            f"auditor 退出码不是 0：{returncode}; stderr={stderr.strip()!r}"
        )
    if status != "PASS":
        raise PreexportGateError(f"auditor status 必须严格等于 PASS：{status!r}")
    if type(release_ready) is not bool or release_ready is not True:
        raise PreexportGateError(
            "auditor releaseReady 必须严格为 JSON boolean true"
        )
    if not isinstance(missing, list) or missing != []:
        raise PreexportGateError(
            "auditor missingReleaseGates 必须严格为空数组"
        )
    errors = payload.get("errors")
    if not isinstance(errors, list) or errors:
        raise PreexportGateError("auditor errors 必须严格为空数组")
    return payload


def _run_auditor(
    bundle: Path,
    *,
    runner: Callable[..., subprocess.CompletedProcess[str]] = subprocess.run,
) -> dict[str, Any]:
    completed = runner(
        [sys.executable, str(AUDITOR_PATH), str(bundle)],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    try:
        payload = json.loads(completed.stdout)
    except json.JSONDecodeError as error:
        raise PreexportGateError(
            f"auditor stdout 不是单个有效 JSON object：{error}"
        ) from error
    return _strict_audit_contract(
        payload,
        returncode=completed.returncode,
        stderr=completed.stderr,
    )


def run_bundle_gate(bundle_value: str) -> dict[str, Any]:
    bundle = release_tool._resolve_bundle(bundle_value)
    auditor_payload = _run_auditor(bundle)
    attestation = release_tool.validate_current_release(bundle)
    return {
        "bundleId": auditor_payload.get("bundleId"),
        "bundle": str(bundle),
        "audit": {
            "status": auditor_payload["status"],
            "releaseReady": auditor_payload["releaseReady"],
            "missingReleaseGates": auditor_payload["missingReleaseGates"],
            "filesChecked": auditor_payload.get("filesChecked"),
            "pngsChecked": auditor_payload.get("pngsChecked"),
            "jsonsChecked": auditor_payload.get("jsonsChecked"),
        },
        "releaseAttestation": attestation["releaseAttestation"],
    }


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Require status=PASS, releaseReady=true, empty missingReleaseGates, "
            "and a valid detached root release attestation."
        )
    )
    parser.add_argument(
        "bundle",
        nargs="+",
        help="One or more map bundle directories/manifests.",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        bundles = [run_bundle_gate(value) for value in args.bundle]
        print(
            json.dumps(
                {"status": "PASS", "bundles": bundles},
                ensure_ascii=False,
                indent=2,
            )
        )
        return 0
    except (
        OSError,
        PreexportGateError,
        release_tool.PromotionError,
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
