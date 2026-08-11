#!/usr/bin/env python3
"""Run the fail-closed Phase404 standalone pet battle export/PCK release gate.

The source tree remains authoritative: before export this tool audits every raw
PNG against the install ledger and creates an external expectation containing
both raw-file and exact Godot 4.7 import-oracle RGBA8 digests.  The oracle
reproduces ``Image::fix_alpha_edges`` exactly; it never ignores low-alpha RGB.
After cold import the tool also verifies every exact-form ``.png.import`` uses
the frozen lossless/fix-alpha/no-premultiply options.  The PCK QA process then
loads the exact 180 Texture2D paths per released form and compares all imported
RGBA bytes exactly.
Only a fully passing, byte-stable PCK run may produce a final release
attestation.  The registry never points at the external expectation or final
attestation.
"""

from __future__ import annotations

import argparse
from decimal import Decimal, InvalidOperation
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import signal
import stat
import struct
import subprocess
import sys
import tempfile
import time
from typing import Any, Iterable
import zlib

try:
    from tools.audit_pet_battle_release_gate import (
        CANONICAL_JSON_CONTRACT_ID,
        CanonicalJsonError,
        DEFAULT_REGISTRY,
        DEFAULT_RUNTIME_CACHE,
        EXPECTED_RUNTIME_FRAME_COUNT,
        FORMAL_ACTIONS,
        FORMAL_FRAME_COUNTS,
        FORMAL_VIEWS,
        MAX_SAFE_JSON_INTEGER,
        REPO_ROOT,
        RUNTIME_TREE_CONTRACT_ID,
        _read_canonical_json_snapshot,
        _read_json_snapshot,
        _sha256_file,
        build_report,
        canonical_json_equal,
        canonical_json_sha256,
        normalize_canonical_json,
    )
except ModuleNotFoundError:  # Direct ``python tools/...py`` execution.
    from audit_pet_battle_release_gate import (
        CANONICAL_JSON_CONTRACT_ID,
        CanonicalJsonError,
        DEFAULT_REGISTRY,
        DEFAULT_RUNTIME_CACHE,
        EXPECTED_RUNTIME_FRAME_COUNT,
        FORMAL_ACTIONS,
        FORMAL_FRAME_COUNTS,
        FORMAL_VIEWS,
        MAX_SAFE_JSON_INTEGER,
        REPO_ROOT,
        RUNTIME_TREE_CONTRACT_ID,
        _read_canonical_json_snapshot,
        _read_json_snapshot,
        _sha256_file,
        build_report,
        canonical_json_equal,
        canonical_json_sha256,
        normalize_canonical_json,
    )


EXPECTATION_ID = "beastbound_pet_battle_export_expectation_v3"
EXPECTATION_CONTRACT_ID = "beastbound_pet_battle_export_expectation_contract_v3"
PIXEL_CONTRACT_ID = (
    "beastbound_texture_godot47_fix_alpha_edges_raw_rgba8_sha256_v3"
)
IMPORT_ORACLE_ID = "beastbound_godot47_fix_alpha_edges_import_oracle_v1"
FRAME_IMPORT_BINDING_ID = "beastbound_pet_battle_frame_import_binding_v1"
IMPORT_SIDECAR_AUDIT_ID = "beastbound_pet_battle_import_sidecar_audit_v1"
QA_REPORT_ID = "beastbound_pet_battle_export_qa_report_v6"
QA_REPORT_CONTRACT_ID = "beastbound_pet_battle_export_qa_report_contract_v6"
FINAL_ATTESTATION_ID = "beastbound_pet_battle_final_release_attestation_v6"
FINAL_ATTESTATION_CONTRACT_ID = "beastbound_pet_battle_export_gate_v6"
EXPECTATION_ROOT_KEYS = frozenset(
    {
        "schemaVersion",
        "expectationId",
        "contractId",
        "canonicalJsonContractId",
        "pixelContractId",
        "importOracle",
        "importOracleSha256",
        "registrySha256",
        "runtimeCacheSha256",
        "releaseSubjectSha256",
        "sourceAuditReportSha256",
        "forms",
    }
)
EXPECTATION_FORM_KEYS = frozenset(
    {
        "formId",
        "petRoot",
        "releaseMode",
        "formalRelease",
        "normalBattleActionIds",
        "sourceRuntimeTreeSha256",
        "sourceRuntimeFrameCount",
        "expectedFrameCount",
        "expectedImportedPixelTreeSha256",
        "frames",
    }
)
EXPECTATION_FRAME_KEYS = frozenset(
    {
        "path",
        "sourceRepoPath",
        "view",
        "action",
        "frameIndex",
        "width",
        "height",
        "sourceFileSha256",
        "sourceRgba8Sha256",
        "sourceRgba8ByteCount",
        "importOracleSha256",
        "importOptions",
        "expectedImportedRgba8RawSha256",
        "expectedImportedPixelContractSha256",
        "expectedImportedRgba8ByteCount",
        "frameImportBindingSha256",
    }
)
SOURCE_AUDIT_REPORT_KEYS = frozenset(
    {
        "schemaVersion",
        "reportType",
        "scope",
        "catalogPath",
        "registryPath",
        "progressionPath",
        "catalogFormCount",
        "formalWildTrainingFormCount",
        "formalWildTrainingForms",
        "formalWildTrainingDerivation",
        "formalReleaseCount",
        "legacyCompatibilityExceptionCount",
        "runtimeCandidateCount",
        "proceduralPlaceholderCount",
        "policy",
        "runtimeCache",
        "status",
        "errors",
        "runtimeCandidates",
        "forms",
    }
)
RELEASE_REGISTRY_ID = "pet_battle_exact_form_release_v1"
RUNTIME_CACHE_ID = "pet_battle_release_runtime_cache_v1"
PCK_RELEASE_SUMMARY_KEYS = frozenset(
    {
        "ok",
        "state",
        "registryId",
        "runtimeCacheId",
        "registryRawSha256",
        "runtimeCacheRawSha256",
        "releaseSubjectSha256",
        "formalFormIds",
        "legacyCompatibilityFormIds",
        "errors",
    }
)
PCK_QA_RESULT_KEYS = frozenset(
    {
        "ok",
        "formId",
        "canonicalJsonContractId",
        "exportExpectationId",
        "exportExpectationContractId",
        "pixelContractId",
        "importOracleContractId",
        "importOracleSha256",
        "sourceAuditReportSha256",
        "expectedGodotVersion",
        "expectedGodotSourceCommit",
        "expectedGodotExecutableSha256",
        "actualGodotVersion",
        "actualGodotSourceCommit",
        "importFixAlphaBorder",
        "importPremultAlpha",
        "exportWorkingDir",
        "exportUserRoot",
        "exportResourceRoot",
        "exportRepoRoot",
        "exportRepoRootSha256",
        "exportExpectationMode",
        "exportExpectationPathAbsolute",
        "exportExpectationExpectedSha256",
        "exportExpectationSha256",
        "exportTextureFrameCount",
        "exportTextureExpectedFrameCount",
        "exportTextureTreeSha256",
        "exportExpectedImportedPixelTreeSha256",
        "battleFrameCount",
        "battleViews",
        "battleActions",
        "battleReleaseMode",
        "battleReleaseFormal",
        "battleNormalRuntimeSupported",
        "battleNormalRuntimeWarmed",
        "battleNormalRuntimeTextureLoaded",
        "battleQaPreviewDisabledBefore",
        "battleQaPreviewDisabledAfter",
        "battleRuntimeTreeFrameCount",
        "battleRuntimeTreeSha256",
        "battleRuntimeTreeVerificationUsec",
        "battleReleaseRegistry",
        "errors",
        "pckProfileSaveEnabled",
        "pckServerAccountSession",
        "pckAuthAutoBypass",
        "pckWorkingDir",
        "pckUserRoot",
        "pckResourceRoot",
        "pckRepoRoot",
        "pckRepoRootSha256",
    }
)
PINNED_GODOT_VERSION = "4.7.stable.official.5b4e0cb0f"
PINNED_GODOT_SOURCE_COMMIT = "5b4e0cb0fd279832bbdd69fed5354d4e5ad26f88"
PINNED_GODOT_EXECUTABLE_SHA256 = (
    "445c6f95030e2ca767dd921be1e91bd99e50c3703f91d22a22cd31216c93a80f"
)
GODOT_FIX_ALPHA_THRESHOLD = 20
GODOT_FIX_ALPHA_RADIUS = 4
GODOT_FIX_ALPHA_SOURCE_URL = (
    "https://github.com/godotengine/godot/blob/"
    f"{PINNED_GODOT_SOURCE_COMMIT}/core/io/image.cpp#L4259-L4323"
)
GODOT_TEXTURE_IMPORT_SOURCE_URL = (
    "https://github.com/godotengine/godot/blob/"
    f"{PINNED_GODOT_SOURCE_COMMIT}/editor/import/"
    "resource_importer_texture.cpp#L859-L866"
)
EXPECTATION_ENV = "BEASTBOUND_PET_BATTLE_EXPORT_EXPECTATION"
EXPECTATION_SHA256_ENV = "BEASTBOUND_PET_BATTLE_EXPORT_EXPECTATION_SHA256"
SOURCE_AUDIT_REPORT_ENV = "BEASTBOUND_PET_BATTLE_SOURCE_AUDIT_REPORT"
SOURCE_AUDIT_REPORT_SHA256_ENV = (
    "BEASTBOUND_PET_BATTLE_SOURCE_AUDIT_REPORT_SHA256"
)
DEFAULT_PRESET = "macOS"
DEFAULT_PRESET_PATH = Path("client/godot/export_presets.cfg")
DEFAULT_PROJECT_PATH = Path("client/godot")
DEFAULT_OUTPUT_DIR = Path(".run/evidence/phase404_pet_battle_release_gate/export_gate")
RESULT_PREFIX = "pet action asset check ready: "
USER_ROOT_PREFLIGHT_ENV = "BEASTBOUND_PET_BATTLE_USER_ROOT_PREFLIGHT"
USER_ROOT_PREFLIGHT_PREFIX = "pet battle user root preflight: "
REPO_ROOT_ENV = "BEASTBOUND_PET_BATTLE_REPO_ROOT"
REPO_ROOT_SHA256_ENV = "BEASTBOUND_PET_BATTLE_REPO_ROOT_SHA256"
REPO_ROOT_BINDING_CONTRACT_ID = "beastbound_phase404_repo_root_path_utf8_v1"
PCK_SANDBOX_CONTRACT_ID = "beastbound_macos_sandboxed_pck_user_write_deny_v1"
PCK_WORKING_DIRECTORY_CONTRACT_ID = "beastbound_phase404_pck_working_directory_utf8_v1"
SANDBOX_EXECUTABLE = Path("/usr/bin/sandbox-exec")
SANDBOX_TOUCH_EXECUTABLE = Path("/usr/bin/touch")
GIT_COMMAND_TIMEOUT_SECONDS = 60.0
GODOT_VERSION_TIMEOUT_SECONDS = 30.0
GODOT_IMPORT_TIMEOUT_SECONDS = 900.0
GODOT_EXPORT_TIMEOUT_SECONDS = 900.0
GODOT_PCK_TIMEOUT_SECONDS = 900.0
SANDBOX_CANARY_TIMEOUT_SECONDS = 30.0
PROCESS_GROUP_TERMINATE_GRACE_SECONDS = 5.0
QA_LANE_HELPER_TIMEOUT_SECONDS = 30.0
QA_LANE = "automation"
QA_LANE_FEATURE = "beastbound_qa_automation"
QA_LANE_CUSTOM_USER_DIR_NAME = "BeastboundOdysseyQA_Automation"
QA_LANE_ARG = "--beastbound-qa-user-data-lane=automation"
QA_LANE_ATTESTATION_PREFIX = "BEASTBOUND_QA_USER_DATA_ATTESTATION: "
QA_LANE_HELPER_PATH = Path("tools/godot_qa_user_data_lane.py")
QA_LANE_LIFECYCLE_CONTRACT_ID = "beastbound_phase404_export_qa_lane_lifecycle_v1"
FAILURE_REPORT_ID = "beastbound_pet_battle_export_gate_failure_v6"
EXPECTED_GODOT_PHASE_LABELS = (
    "initial_version",
    "editor_help",
    "cold_import",
    "export_pack",
    "preflight",
    "default_bui",
    "wuli",
    "driftfox",
    "final_version",
)

PHASE404_PATH_ALLOWLIST = (
    "client/godot/data/pet_battle_release_registry_v1.json",
    "client/godot/data/pet_battle_release_runtime_cache_v1.json",
    "client/godot/project.godot",
    "client/godot/scripts/main.gd",
    "client/godot/scripts/pet/pet_action_asset_catalog.gd",
    "client/godot/scripts/pet/pet_battle_release_gate.gd",
    "client/godot/scripts/qa/auto_check_coordinator.gd",
    "client/godot/scripts/qa/battle_layout_owner_review_capture.gd",
    "client/godot/scripts/qa/pet_action_asset_check.gd",
    "client/godot/scripts/qa/pet_codex_awakened_owner_review_capture.gd",
    "docs/phase_404_pet_battle_exact_form_release_gate.md",
    "tools/audit_pet_battle_release_gate.py",
    "tools/godot_qa_user_data_lane.py",
    "tools/promote_pet_battle_release_cache.py",
    "tools/run_pet_battle_export_gate.py",
    "tools/run_godot_auto_checks.mjs",
    "tools/test/test_audit_pet_battle_release_gate.py",
    "tools/test/test_godot_qa_user_data_lane.py",
    "tools/test/test_pet_battle_export_gate.py",
    "tools/test/run_godot_auto_checks.test.mjs",
)


class ExportGateError(RuntimeError):
    pass


class QaLanePreservationRequired(ExportGateError):
    """A lane or process boundary is no longer trusted enough for cleanup."""

    def __init__(self, message: str, *, cause: BaseException | None = None) -> None:
        super().__init__(message)
        self.preserve_qa_lane = True
        self.cause = cause


class ProcessGroupTimeout(ExportGateError):
    def __init__(
        self,
        command: list[str],
        timeout_seconds: float,
        stdout: bytes | str | None,
        stderr: bytes | str | None,
        cleanup_errors: Iterable[str] = (),
    ) -> None:
        self.cleanup_errors = tuple(cleanup_errors)
        cleanup_summary = (
            "its process group was reaped"
            if not self.cleanup_errors
            else "process-group cleanup failed: " + "; ".join(self.cleanup_errors)
        )
        super().__init__(
            f"command timed out after {timeout_seconds:g}s and {cleanup_summary}: "
            + " ".join(command)
        )
        self.command = command
        self.timeout_seconds = timeout_seconds
        self.stdout = stdout
        self.stderr = stderr
        self.group_reaped = not self.cleanup_errors


class ProcessGroupLeak(ExportGateError):
    def __init__(
        self,
        command: list[str],
        stdout: bytes | str | None,
        stderr: bytes | str | None,
        cleanup_errors: Iterable[str] = (),
    ) -> None:
        self.cleanup_errors = tuple(cleanup_errors)
        cleanup_summary = (
            "the lingering process group was reaped"
            if not self.cleanup_errors
            else "process-group cleanup failed: " + "; ".join(self.cleanup_errors)
        )
        super().__init__(
            "command parent exited but same-PGID descendants remained; "
            + cleanup_summary
            + ": "
            + " ".join(command)
        )
        self.command = command
        self.stdout = stdout
        self.stderr = stderr
        self.group_reaped = not self.cleanup_errors


def _process_group_exists(process_group_id: int) -> bool:
    try:
        os.killpg(process_group_id, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


def _wait_for_process_group_exit(process_group_id: int, timeout_seconds: float) -> bool:
    deadline = time.monotonic() + timeout_seconds
    while _process_group_exists(process_group_id):
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            return False
        time.sleep(min(0.05, remaining))
    return True


def _signal_process_group(
    process_group_id: int,
    requested_signal: int,
    cleanup_errors: list[str],
) -> None:
    try:
        os.killpg(process_group_id, requested_signal)
    except ProcessLookupError:
        pass
    except OSError as exc:
        cleanup_errors.append(
            f"cannot signal process group {process_group_id} with "
            f"{signal.Signals(requested_signal).name}: {exc}"
        )


def _cleanup_process_group(
    process: subprocess.Popen,
    output: bytes | str | None,
    error_output: bytes | str | None,
    *,
    direct_child_reaped: bool,
) -> tuple[bytes | str | None, bytes | str | None, list[str]]:
    """Terminate same-PGID descendants, reap the leader, and prove the group is gone."""

    process_group_id = process.pid
    cleanup_errors: list[str] = []
    _signal_process_group(process_group_id, signal.SIGTERM, cleanup_errors)
    if not direct_child_reaped:
        try:
            cleaned_output, cleaned_error_output = process.communicate(
                timeout=PROCESS_GROUP_TERMINATE_GRACE_SECONDS
            )
            if cleaned_output is not None:
                output = cleaned_output
            if cleaned_error_output is not None:
                error_output = cleaned_error_output
            direct_child_reaped = True
        except subprocess.TimeoutExpired as terminate_timeout:
            if terminate_timeout.output is not None:
                output = terminate_timeout.output
            if terminate_timeout.stderr is not None:
                error_output = terminate_timeout.stderr
        except BaseException as exc:  # Cleanup must continue even during caller cancellation.
            cleanup_errors.append(
                f"cannot reap direct child {process_group_id} after SIGTERM: "
                f"{type(exc).__name__}: {exc}"
            )
    if _process_group_exists(process_group_id) and not _wait_for_process_group_exit(
        process_group_id,
        PROCESS_GROUP_TERMINATE_GRACE_SECONDS,
    ):
        _signal_process_group(process_group_id, signal.SIGKILL, cleanup_errors)
    if not direct_child_reaped:
        try:
            cleaned_output, cleaned_error_output = process.communicate(
                timeout=PROCESS_GROUP_TERMINATE_GRACE_SECONDS
            )
            if cleaned_output is not None:
                output = cleaned_output
            if cleaned_error_output is not None:
                error_output = cleaned_error_output
            direct_child_reaped = True
        except subprocess.TimeoutExpired as kill_timeout:
            if kill_timeout.output is not None:
                output = kill_timeout.output
            if kill_timeout.stderr is not None:
                error_output = kill_timeout.stderr
        except BaseException as exc:
            cleanup_errors.append(
                f"cannot reap direct child {process_group_id} after SIGKILL: "
                f"{type(exc).__name__}: {exc}"
            )
    if not _wait_for_process_group_exit(
        process_group_id,
        PROCESS_GROUP_TERMINATE_GRACE_SECONDS,
    ):
        _signal_process_group(process_group_id, signal.SIGKILL, cleanup_errors)
        if not _wait_for_process_group_exit(
            process_group_id,
            PROCESS_GROUP_TERMINATE_GRACE_SECONDS,
        ):
            cleanup_errors.append(
                f"process group {process_group_id} still exists after repeated SIGKILL"
            )
    if not direct_child_reaped:
        if process.poll() is not None:
            direct_child_reaped = True
        else:
            try:
                process.kill()
                process.wait(timeout=PROCESS_GROUP_TERMINATE_GRACE_SECONDS)
                direct_child_reaped = True
            except BaseException as exc:
                cleanup_errors.append(
                    f"direct child {process_group_id} could not be reaped: "
                    f"{type(exc).__name__}: {exc}"
                )
    if not direct_child_reaped:
        cleanup_errors.append(f"direct child {process_group_id} was not reaped")
    return output, error_output, list(dict.fromkeys(cleanup_errors))


def _run_subprocess(
    command: list[str],
    *,
    cwd: Path,
    timeout_seconds: float,
    env: dict[str, str] | None = None,
    check: bool = False,
    stdout: int | None = None,
    stderr: int | None = None,
    text: bool = False,
) -> subprocess.CompletedProcess:
    """Run one bounded command in a new session and reject any lingering group."""

    if timeout_seconds <= 0:
        raise ExportGateError("subprocess timeout must be positive")
    process = subprocess.Popen(
        command,
        cwd=cwd,
        env=env,
        stdout=stdout,
        stderr=stderr,
        text=text,
        start_new_session=True,
    )
    output: bytes | str | None = None
    error_output: bytes | str | None = None
    try:
        output, error_output = process.communicate(timeout=timeout_seconds)
    except subprocess.TimeoutExpired as initial_timeout:
        output = initial_timeout.output
        error_output = initial_timeout.stderr
        output, error_output, cleanup_errors = _cleanup_process_group(
            process,
            output,
            error_output,
            direct_child_reaped=False,
        )
        raise ProcessGroupTimeout(
            command,
            timeout_seconds,
            output,
            error_output,
            cleanup_errors,
        )
    except BaseException as exc:
        output, error_output, cleanup_errors = _cleanup_process_group(
            process,
            output,
            error_output,
            direct_child_reaped=False,
        )
        if cleanup_errors:
            raise ProcessGroupLeak(
                command,
                output,
                error_output,
                cleanup_errors,
            ) from exc
        raise
    if _process_group_exists(process.pid):
        output, error_output, cleanup_errors = _cleanup_process_group(
            process,
            output,
            error_output,
            direct_child_reaped=True,
        )
        raise ProcessGroupLeak(command, output, error_output, cleanup_errors)
    completed = subprocess.CompletedProcess(
        command,
        process.returncode,
        output,
        error_output,
    )
    if check and completed.returncode != 0:
        raise subprocess.CalledProcessError(
            completed.returncode,
            command,
            output=completed.stdout,
            stderr=completed.stderr,
        )
    return completed


def _json_object_without_duplicate_keys(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ExportGateError(f"duplicate JSON key: {key}")
        result[key] = value
    return result


def _reject_non_json_constant(value: str) -> None:
    raise ExportGateError(f"non-JSON numeric constant: {value}")


def _parse_canonical_json_integer(raw: str) -> int:
    digits = raw[1:] if raw.startswith("-") else raw
    if len(digits) > len(str(MAX_SAFE_JSON_INTEGER)):
        raise ExportGateError(f"unsafe canonical JSON integer: {raw}")
    try:
        value = int(raw, 10)
    except ValueError as exc:
        raise ExportGateError(f"invalid canonical JSON integer: {raw}") from exc
    if value < -MAX_SAFE_JSON_INTEGER or value > MAX_SAFE_JSON_INTEGER:
        raise ExportGateError(f"unsafe canonical JSON integer: {raw}")
    return value


def _parse_canonical_json_decimal(raw: str) -> int:
    try:
        value = Decimal(raw)
    except InvalidOperation as exc:
        raise ExportGateError(f"invalid canonical JSON decimal: {raw}") from exc
    if not value.is_finite():
        raise ExportGateError(f"non-finite canonical JSON decimal: {raw}")
    if value.is_zero():
        return 0
    adjusted = value.adjusted()
    if adjusted > len(str(MAX_SAFE_JSON_INTEGER)) - 1:
        raise ExportGateError(f"unsafe canonical JSON decimal: {raw}")
    if adjusted < 0:
        raise ExportGateError(f"non-integral canonical JSON decimal: {raw}")
    integral = value.to_integral_value()
    if value != integral:
        raise ExportGateError(f"non-integral canonical JSON decimal: {raw}")
    if value < -MAX_SAFE_JSON_INTEGER or value > MAX_SAFE_JSON_INTEGER:
        raise ExportGateError(f"unsafe canonical JSON decimal: {raw}")
    integer = int(integral)
    return integer


def _normalize_godot_path(value: Any) -> str:
    return str(value or "").replace("\\", "/").rstrip("/")


def _assert_exact_payload_keys(
    payload: dict[str, Any],
    command: str,
    expected_keys: Iterable[str],
) -> None:
    actual = sorted(payload)
    expected = sorted(expected_keys)
    if actual != expected:
        raise ExportGateError(
            f"QA lane helper {command} keys are not exact: " + ",".join(actual)
        )


def _assert_lower_hex(payload: dict[str, Any], field: str, length: int, command: str) -> None:
    value = payload.get(field)
    if not isinstance(value, str) or not re.fullmatch(rf"[0-9a-f]{{{length}}}", value):
        raise ExportGateError(
            f"QA lane helper {command} field must be lowercase hex: {field}"
        )


def _assert_non_negative_integer(payload: dict[str, Any], field: str, command: str) -> None:
    value = payload.get(field)
    if type(value) is not int or value < 0:
        raise ExportGateError(
            f"QA lane helper {command} field must be a non-negative integer: {field}"
        )


def _assert_exact_string_fields(
    payload: dict[str, Any],
    fields: Iterable[str],
    command: str,
) -> None:
    invalid = [field for field in fields if type(payload.get(field)) is not str]
    if invalid:
        raise ExportGateError(
            f"QA lane helper {command} fields must be exact strings: "
            + ",".join(invalid)
        )


def parse_qa_lane_helper_output(
    completed: subprocess.CompletedProcess,
    command: str,
) -> dict[str, Any]:
    stdout = completed.stdout if isinstance(completed.stdout, str) else ""
    stderr = completed.stderr if isinstance(completed.stderr, str) else ""
    match = re.fullmatch(r"([^\r\n]+)\r?\n?", stdout)
    if match is None or stderr != "":
        raise ExportGateError(
            f"QA lane helper {command} must emit exactly one JSON line on stdout and no stderr"
        )
    raw = match.group(1)
    try:
        payload = json.loads(
            raw,
            object_pairs_hook=_json_object_without_duplicate_keys,
            parse_constant=_reject_non_json_constant,
            parse_int=_parse_canonical_json_integer,
            parse_float=_parse_canonical_json_decimal,
        )
    except (json.JSONDecodeError, UnicodeError, ExportGateError) as exc:
        raise ExportGateError(
            f"QA lane helper {command} emitted invalid JSON: {exc}"
        ) from exc
    if not isinstance(payload, dict):
        raise ExportGateError(f"QA lane helper {command} payload must be an object")
    canonical = json.dumps(
        {key: payload[key] for key in sorted(payload)},
        ensure_ascii=False,
        separators=(",", ":"),
    )
    if raw != canonical:
        raise ExportGateError(
            f"QA lane helper {command} JSON must be canonical and key-sorted"
        )
    if completed.returncode != 0:
        diagnostic = payload.get("error", f"exit={completed.returncode}")
        raise ExportGateError(f"QA lane helper {command} failed: {diagnostic}")
    return payload


def run_qa_lane_helper(
    repo_root: Path,
    command: str,
    arguments: Iterable[str] = (),
) -> dict[str, Any]:
    helper = (repo_root / QA_LANE_HELPER_PATH).resolve()
    completed = _run_subprocess(
        [sys.executable, "-B", str(helper), command, *[str(value) for value in arguments]],
        cwd=repo_root,
        timeout_seconds=QA_LANE_HELPER_TIMEOUT_SECONDS,
        check=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    return parse_qa_lane_helper_output(completed, command)


def validate_qa_lane_source_contract(repo_root: Path) -> dict[str, Any]:
    payload = run_qa_lane_helper(
        repo_root,
        "source-check",
        ("--repo-root", str(repo_root.resolve())),
    )
    _assert_exact_payload_keys(payload, "source-check", ("status",))
    _assert_exact_string_fields(payload, ("status",), "source-check")
    if payload.get("status") != "source_contract_passed":
        raise ExportGateError(
            "QA lane helper source contract did not pass exactly before static audit"
        )
    return payload


def validate_prepared_qa_lane(payload: dict[str, Any], owner: str) -> dict[str, Any]:
    command = "prepare"
    _assert_exact_payload_keys(
        payload,
        command,
        (
            "customUserDirName", "editorCustomFeatures", "feature", "godotLaneRoot",
            "godotRealRoot", "lane", "laneEntryCount", "laneInventorySha256",
            "laneRoot", "owner", "realEntryCount", "realInventorySha256", "realRoot",
            "status",
        ),
    )
    string_fields = (
        "customUserDirName", "editorCustomFeatures", "feature", "godotLaneRoot",
        "godotRealRoot", "lane", "laneInventorySha256", "laneRoot", "owner",
        "realInventorySha256", "realRoot", "status",
    )
    _assert_exact_string_fields(payload, string_fields, command)
    lane_root = Path(payload["laneRoot"]).resolve()
    real_root = Path(payload["realRoot"]).resolve()
    roots_overlap = False
    for candidate, ancestor in ((lane_root, real_root), (real_root, lane_root)):
        try:
            candidate.relative_to(ancestor)
        except ValueError:
            continue
        roots_overlap = True
        break
    if (
        payload["status"] != "prepared"
        or payload["lane"] != QA_LANE
        or payload["owner"] != owner
        or payload["feature"] != QA_LANE_FEATURE
        or payload["customUserDirName"] != QA_LANE_CUSTOM_USER_DIR_NAME
        or _normalize_godot_path(payload["laneRoot"])
        != _normalize_godot_path(payload["godotLaneRoot"])
        or _normalize_godot_path(payload["realRoot"])
        != _normalize_godot_path(payload["godotRealRoot"])
        or roots_overlap
    ):
        raise ExportGateError("QA lane helper returned an invalid prepare identity contract")
    _assert_lower_hex(payload, "owner", 32, command)
    _assert_lower_hex(payload, "realInventorySha256", 64, command)
    _assert_lower_hex(payload, "laneInventorySha256", 64, command)
    _assert_non_negative_integer(payload, "realEntryCount", command)
    _assert_non_negative_integer(payload, "laneEntryCount", command)
    features = [value.strip() for value in payload["editorCustomFeatures"].split(",") if value.strip()]
    if (
        features.count(QA_LANE_FEATURE) != 1
        or any(value != QA_LANE_FEATURE and value.startswith("beastbound_qa_") for value in features)
    ):
        raise ExportGateError("QA lane helper prepare feature contract is not exclusive")
    return payload


def build_qa_lane_environment(
    base_environment: dict[str, str],
    prepared: dict[str, Any],
) -> dict[str, str]:
    environment = dict(base_environment)
    environment["GODOT_EDITOR_CUSTOM_FEATURES"] = str(prepared["editorCustomFeatures"])
    environment["BEASTBOUND_QA_USER_DATA_LANE"] = str(prepared["lane"])
    environment["BEASTBOUND_QA_EXPECTED_USER_DATA_ROOT"] = str(prepared["godotLaneRoot"])
    if environment.get("HOME") != base_environment.get("HOME"):
        raise ExportGateError("QA lane environment must not replace HOME")
    return environment


def prepare_qa_lane(
    repo_root: Path,
    base_environment: dict[str, str],
    owner: str,
) -> dict[str, Any]:
    if not re.fullmatch(r"[0-9a-f]{32}", owner):
        raise ExportGateError("export gate must provide one explicit 32-hex QA lane owner")
    payload = run_qa_lane_helper(
        repo_root,
        "prepare",
        (
            "--lane", QA_LANE,
            "--owner", owner,
            "--existing-features", base_environment.get("GODOT_EDITOR_CUSTOM_FEATURES", ""),
        ),
    )
    prepared = validate_prepared_qa_lane(payload, owner)
    return {
        **prepared,
        "lastLaneInventorySha256": prepared["laneInventorySha256"],
        "lastLaneEntryCount": prepared["laneEntryCount"],
        "environment": build_qa_lane_environment(base_environment, prepared),
    }


def validate_verified_qa_lane(payload: dict[str, Any], qa_lane: dict[str, Any]) -> dict[str, Any]:
    command = "verify"
    _assert_exact_payload_keys(
        payload,
        command,
        (
            "feature", "godotLaneRoot", "lane", "laneEntryCount", "laneInventorySha256",
            "laneRoot", "owner", "realEntryCount", "realInventorySha256", "realRoot",
            "realUnchanged", "status",
        ),
    )
    _assert_exact_string_fields(
        payload,
        (
            "feature", "godotLaneRoot", "lane", "laneInventorySha256",
            "laneRoot", "owner", "realInventorySha256", "realRoot", "status",
        ),
        command,
    )
    if (
        payload.get("status") != "verified"
        or payload.get("realUnchanged") is not True
        or payload.get("lane") != qa_lane["lane"]
        or payload.get("owner") != qa_lane["owner"]
        or payload.get("feature") != qa_lane["feature"]
        or payload.get("laneRoot") != qa_lane["laneRoot"]
        or _normalize_godot_path(payload.get("godotLaneRoot"))
        != _normalize_godot_path(qa_lane["godotLaneRoot"])
        or payload.get("realRoot") != qa_lane["realRoot"]
        or payload.get("realInventorySha256") != qa_lane["realInventorySha256"]
    ):
        raise ExportGateError("QA lane helper verify identity contract is invalid")
    _assert_lower_hex(payload, "realInventorySha256", 64, command)
    _assert_lower_hex(payload, "laneInventorySha256", 64, command)
    _assert_non_negative_integer(payload, "realEntryCount", command)
    _assert_non_negative_integer(payload, "laneEntryCount", command)
    return payload


def verify_qa_lane(repo_root: Path, qa_lane: dict[str, Any]) -> dict[str, Any]:
    payload = run_qa_lane_helper(
        repo_root,
        "verify",
        (
            "--lane", qa_lane["lane"],
            "--owner", qa_lane["owner"],
            "--expected-real-sha256", qa_lane["realInventorySha256"],
        ),
    )
    verified = validate_verified_qa_lane(payload, qa_lane)
    qa_lane["lastLaneInventorySha256"] = verified["laneInventorySha256"]
    qa_lane["lastLaneEntryCount"] = verified["laneEntryCount"]
    return verified


def verify_qa_lane_or_preserve(
    repo_root: Path,
    qa_lane: dict[str, Any],
    phase: str,
) -> dict[str, Any]:
    try:
        return verify_qa_lane(repo_root, qa_lane)
    except BaseException as exc:
        raise QaLanePreservationRequired(
            f"QA lane verification is untrusted after {phase}; lane and lock preserved: {exc}",
            cause=exc,
        ) from exc


def validate_cleaned_qa_lane(payload: dict[str, Any], qa_lane: dict[str, Any]) -> dict[str, Any]:
    command = "cleanup"
    _assert_exact_payload_keys(
        payload,
        command,
        (
            "feature", "lane", "laneAbsent", "laneRoot", "owner", "realInventorySha256",
            "realRoot", "realUnchanged", "removedLaneEntryCount",
            "removedLaneInventorySha256", "status",
        ),
    )
    _assert_exact_string_fields(
        payload,
        (
            "feature", "lane", "laneRoot", "owner", "realInventorySha256",
            "realRoot", "removedLaneInventorySha256", "status",
        ),
        command,
    )
    if (
        payload.get("status") != "cleaned"
        or payload.get("laneAbsent") is not True
        or payload.get("realUnchanged") is not True
        or payload.get("lane") != qa_lane["lane"]
        or payload.get("owner") != qa_lane["owner"]
        or payload.get("feature") != qa_lane["feature"]
        or payload.get("laneRoot") != qa_lane["laneRoot"]
        or payload.get("realRoot") != qa_lane["realRoot"]
        or payload.get("realInventorySha256") != qa_lane["realInventorySha256"]
        or payload.get("removedLaneInventorySha256")
        != qa_lane["lastLaneInventorySha256"]
        or payload.get("removedLaneEntryCount") != qa_lane["lastLaneEntryCount"]
    ):
        raise ExportGateError("QA lane helper cleanup identity contract is invalid")
    _assert_lower_hex(payload, "realInventorySha256", 64, command)
    _assert_lower_hex(payload, "removedLaneInventorySha256", 64, command)
    _assert_non_negative_integer(payload, "removedLaneEntryCount", command)
    return payload


def cleanup_qa_lane(repo_root: Path, qa_lane: dict[str, Any]) -> dict[str, Any]:
    try:
        payload = run_qa_lane_helper(
            repo_root,
            "cleanup",
            (
                "--lane", qa_lane["lane"],
                "--owner", qa_lane["owner"],
                "--expected-real-sha256", qa_lane["realInventorySha256"],
            ),
        )
        return validate_cleaned_qa_lane(payload, qa_lane)
    except BaseException as exc:
        raise QaLanePreservationRequired(
            f"QA lane cleanup is untrusted; no recovery attempted: {exc}",
            cause=exc,
        ) from exc


def validate_post_cleanup_inspection(
    payload: dict[str, Any],
    qa_lane: dict[str, Any],
) -> dict[str, Any]:
    command = "inspect"
    _assert_exact_payload_keys(
        payload,
        command,
        (
            "feature", "inspectionSha256", "lane", "laneEntryCount",
            "laneInventorySha256", "laneRoot", "laneRootState", "lockedRealInventorySha256",
            "owner", "ownerCanaryState", "pendingLockPayloadSha256", "pendingLockState",
            "pendingLockedRealInventorySha256", "pendingOwnerPayloadSha256",
            "pendingOwnerState", "publishedLockState", "realEntryCount",
            "realInventorySha256", "realRoot", "status",
        ),
    )
    _assert_exact_string_fields(
        payload,
        (
            "feature", "inspectionSha256", "lane", "laneInventorySha256",
            "laneRoot", "laneRootState", "lockedRealInventorySha256", "owner",
            "ownerCanaryState", "pendingLockPayloadSha256", "pendingLockState",
            "pendingLockedRealInventorySha256", "pendingOwnerPayloadSha256",
            "pendingOwnerState", "publishedLockState", "realInventorySha256",
            "realRoot", "status",
        ),
        command,
    )
    _assert_non_negative_integer(payload, "laneEntryCount", command)
    if (
        payload.get("status") != "inspected"
        or payload.get("lane") != qa_lane["lane"]
        or payload.get("owner") != qa_lane["owner"]
        or payload.get("feature") != qa_lane["feature"]
        or payload.get("laneRoot") != qa_lane["laneRoot"]
        or payload.get("realRoot") != qa_lane["realRoot"]
        or payload.get("realInventorySha256") != qa_lane["realInventorySha256"]
        or payload.get("pendingLockState") != "absent"
        or payload.get("publishedLockState") != "absent"
        or payload.get("laneRootState") != "absent"
        or payload.get("ownerCanaryState") != "not_applicable"
        or payload.get("pendingOwnerState") != "not_applicable"
        or payload.get("laneEntryCount") != 0
        or any(
            payload.get(field) != ""
            for field in (
                "lockedRealInventorySha256", "pendingLockPayloadSha256",
                "pendingLockedRealInventorySha256", "pendingOwnerPayloadSha256",
            )
        )
    ):
        raise ExportGateError("QA lane post-cleanup inspection is not exact absent state")
    _assert_lower_hex(payload, "inspectionSha256", 64, command)
    _assert_lower_hex(payload, "laneInventorySha256", 64, command)
    _assert_lower_hex(payload, "realInventorySha256", 64, command)
    _assert_non_negative_integer(payload, "realEntryCount", command)
    return payload


def inspect_cleaned_qa_lane(repo_root: Path, qa_lane: dict[str, Any]) -> dict[str, Any]:
    try:
        payload = run_qa_lane_helper(
            repo_root,
            "inspect",
            ("--lane", qa_lane["lane"], "--owner", qa_lane["owner"]),
        )
        return validate_post_cleanup_inspection(payload, qa_lane)
    except BaseException as exc:
        raise QaLanePreservationRequired(
            f"QA lane post-cleanup inspection is untrusted; no recovery attempted: {exc}",
            cause=exc,
        ) from exc


def _process_exception_requires_lane_preservation(exc: BaseException) -> bool:
    pending: list[BaseException] = [exc]
    seen: set[int] = set()
    while pending:
        current = pending.pop()
        identity = id(current)
        if identity in seen:
            continue
        seen.add(identity)
        if isinstance(
            current,
            (ProcessGroupTimeout, ProcessGroupLeak, QaLanePreservationRequired),
        ):
            return True
        for attribute in ("__cause__", "__context__", "cause"):
            try:
                related = getattr(current, attribute, None)
            except BaseException:
                continue
            if isinstance(related, BaseException):
                pending.append(related)
    return False


def run_phase_with_qa_lane_verification(
    repo_root: Path,
    qa_lane: dict[str, Any],
    label: str,
    callback,
) -> tuple[Any, dict[str, Any]]:
    result: Any = None
    phase_error: BaseException | None = None
    try:
        result = callback()
    except BaseException as exc:
        if isinstance(exc, QaLanePreservationRequired):
            raise
        if _process_exception_requires_lane_preservation(exc):
            if hasattr(exc, "add_note"):
                exc.add_note(
                    f"process containment is untrusted after {label}; QA lane and lock preserved"
                )
            raise
        phase_error = exc
    verification = verify_qa_lane_or_preserve(repo_root, qa_lane, label)
    if phase_error is not None:
        raise phase_error
    return result, verification


def _strict_raw_output_lines(
    value: str,
    label: str,
    *,
    allow_tab: bool = True,
    allow_sgr: bool = True,
) -> list[str]:
    text_value = str(value or "")
    limited_sgr = re.compile(
        r"\x1b\[(?:0|[1-9][0-9]{0,2})(?:;(?:0|[1-9][0-9]{0,2})){0,7}m"
    )
    cursor = 0
    while cursor < len(text_value):
        character = text_value[cursor]
        codepoint = ord(character)
        if character == "\r":
            if cursor + 1 >= len(text_value) or text_value[cursor + 1] != "\n":
                raise ExportGateError(f"{label} contains a non-CRLF carriage return")
        elif character == "\x1b":
            if not allow_sgr:
                raise ExportGateError(f"{label} contains a forbidden escape sequence")
            match = limited_sgr.match(text_value, cursor)
            if match is None:
                raise ExportGateError(f"{label} contains an unsupported escape sequence")
            cursor = match.end() - 1
        elif (
            (
                codepoint < 0x20
                and character != "\n"
                and not (allow_tab and character == "\t")
            )
            or codepoint == 0x7F
            or 0x80 <= codepoint <= 0x9F
            or codepoint in (0x2028, 0x2029)
        ):
            raise ExportGateError(f"{label} contains a forbidden line/control character")
        cursor += 1
    return [line[:-1] if line.endswith("\r") else line for line in text_value.split("\n")]


def _extract_authoritative_json_object(
    output: str,
    prefix: str,
    label: str,
) -> dict[str, Any]:
    lines = _strict_raw_output_lines(
        output,
        label,
        allow_tab=False,
        allow_sgr=False,
    )
    matches: list[str] = []
    non_column_occurrences = 0
    for line in lines:
        if prefix not in line:
            continue
        if not line.startswith(prefix) or line.count(prefix) != 1:
            non_column_occurrences += 1
            continue
        matches.append(line[len(prefix):])
    if len(matches) != 1 or non_column_occurrences:
        raise ExportGateError(
            f"expected exactly one column-zero {label}, found {len(matches)} exact and "
            f"{non_column_occurrences} non-column/duplicate occurrences"
        )
    raw = matches[0]
    if not raw or raw != raw.strip() or not raw.startswith("{") or not raw.endswith("}"):
        raise ExportGateError(f"{label} payload must be exactly one raw JSON object")
    try:
        result = json.loads(
            raw,
            object_pairs_hook=_json_object_without_duplicate_keys,
            parse_constant=_reject_non_json_constant,
            parse_int=_parse_canonical_json_integer,
            parse_float=_parse_canonical_json_decimal,
        )
    except (json.JSONDecodeError, ExportGateError) as exc:
        raise ExportGateError(f"{label} result is not strict JSON: {exc}") from exc
    if type(result) is not dict:
        raise ExportGateError(f"{label} result root is not an object")
    return result


def godot_help_has_option(help_output: str, option: str) -> bool:
    option_pattern = re.compile(
        rf"^[ \t]*(?:-[A-Za-z],[ \t]*)?{re.escape(option)}(?:[ \t]|$)"
    )
    limited_sgr = re.compile(r"\x1b\[(?:0|[1-9][0-9]{0,2})(?:;(?:0|[1-9][0-9]{0,2})){0,7}m")
    ascii_help_line = re.compile(r"^[\t\x20-\x7e]*$")
    token_character = re.compile(r"[A-Za-z0-9_-]")
    for raw_line in _strict_raw_output_lines(help_output, "Godot help output"):
        sgr_inside_token = False

        def remove_sgr(match: re.Match[str]) -> str:
            nonlocal sgr_inside_token
            before = raw_line[match.start() - 1] if match.start() > 0 else ""
            after = raw_line[match.end()] if match.end() < len(raw_line) else ""
            if token_character.fullmatch(before) and token_character.fullmatch(after):
                sgr_inside_token = True
            return ""

        line = limited_sgr.sub(remove_sgr, raw_line)
        if not sgr_inside_token and ascii_help_line.fullmatch(line) and option_pattern.search(line):
            return True
    return False


def validate_pinned_godot_help(output: str) -> dict[str, bool]:
    result = {
        "editor": godot_help_has_option(output, "--editor"),
        "projectManager": godot_help_has_option(output, "--project-manager"),
    }
    if not all(result.values()):
        raise ExportGateError(
            "Phase404 QA lanes require a tools-enabled Godot editor with exact --editor and --project-manager help options"
        )
    return result


def parse_qa_lane_attestation(output: str, qa_lane: dict[str, Any]) -> dict[str, Any]:
    marker_lines = [
        line
        for line in _strict_raw_output_lines(
            output,
            "PCK QA lane attestation output",
            allow_tab=False,
            allow_sgr=False,
        )
        if QA_LANE_ATTESTATION_PREFIX in line
    ]
    if len(marker_lines) != 1 or not marker_lines[0].startswith(QA_LANE_ATTESTATION_PREFIX):
        raise ExportGateError(
            f"expected exactly one column-zero QA lane attestation, found {len(marker_lines)}"
        )
    expected = {
        "customUserDirName": qa_lane["customUserDirName"],
        "feature": qa_lane["feature"],
        "lane": qa_lane["lane"],
        "status": "passed",
        "userDataRoot": _normalize_godot_path(qa_lane["godotLaneRoot"]),
    }
    expected_text = json.dumps(expected, ensure_ascii=False, separators=(",", ":"))
    actual_text = marker_lines[0][len(QA_LANE_ATTESTATION_PREFIX):]
    if actual_text != expected_text:
        raise ExportGateError(
            f"QA lane attestation is not the exact expected marker: expected={expected_text} actual={actual_text}"
        )
    return expected


def build_qa_lane_release_evidence(
    *,
    attempt_id: str,
    source_contract: dict[str, Any],
    qa_lane: dict[str, Any],
    initial_verification: dict[str, Any],
    phase_verifications: list[dict[str, Any]],
    cleanup: dict[str, Any],
    post_cleanup_inspection: dict[str, Any],
    home_unchanged: bool,
) -> dict[str, Any]:
    if not re.fullmatch(r"[0-9a-f]{32}", attempt_id):
        raise ExportGateError("Phase404 QA lane evidence requires one 32-hex attempt ID")
    labels = [item.get("label") for item in phase_verifications]
    if labels != list(EXPECTED_GODOT_PHASE_LABELS):
        raise ExportGateError(
            "Phase404 QA lane evidence requires the exact nine Godot phase order"
        )
    if home_unchanged is not True:
        raise ExportGateError("Phase404 QA lane evidence requires unchanged HOME")
    if source_contract != {"status": "source_contract_passed"}:
        raise ExportGateError("Phase404 QA lane source contract evidence drifted")
    if cleanup.get("laneAbsent") is not True:
        raise ExportGateError("Phase404 QA lane cleanup did not prove lane absence")
    if (
        post_cleanup_inspection.get("laneRootState") != "absent"
        or post_cleanup_inspection.get("publishedLockState") != "absent"
        or post_cleanup_inspection.get("pendingLockState") != "absent"
    ):
        raise ExportGateError("Phase404 QA lane post-cleanup absence evidence drifted")
    prepare_evidence = {
        key: value
        for key, value in qa_lane.items()
        if key not in {"environment", "lastLaneEntryCount", "lastLaneInventorySha256"}
    }
    evidence = {
        "schemaVersion": 1,
        "contractId": QA_LANE_LIFECYCLE_CONTRACT_ID,
        "attemptId": attempt_id,
        "sourceContract": source_contract,
        "lane": qa_lane["lane"],
        "feature": qa_lane["feature"],
        "customUserDirName": qa_lane["customUserDirName"],
        "qaLaneRoot": str(Path(qa_lane["laneRoot"]).resolve()),
        "realRoot": str(Path(qa_lane["realRoot"]).resolve()),
        "homeUnchanged": True,
        "prepare": prepare_evidence,
        "initialVerification": initial_verification,
        "godotPhaseVerifications": phase_verifications,
        "godotPhaseLabels": labels,
        "godotPhaseVerificationCount": len(phase_verifications),
        "cleanup": cleanup,
        "postCleanupInspection": post_cleanup_inspection,
        "laneAbsentAfterCleanup": True,
        "lockAbsentAfterCleanup": True,
    }
    if (
        not Path(evidence["qaLaneRoot"]).is_absolute()
        or not Path(evidence["realRoot"]).is_absolute()
        or Path(evidence["qaLaneRoot"]) == Path(evidence["realRoot"])
    ):
        raise ExportGateError("Phase404 QA lane and real-root evidence is not disjoint")
    try:
        normalized = normalize_canonical_json(evidence)
    except CanonicalJsonError as exc:
        raise ExportGateError(f"Phase404 QA lane evidence violates canonical v2: {exc}") from exc
    validate_qa_lane_release_evidence(normalized)
    return normalized


def validate_qa_lane_release_evidence(evidence: dict[str, Any]) -> str:
    if type(evidence) is not dict:
        raise ExportGateError("final release attestation requires QA lane evidence")
    expected_root_keys = {
        "schemaVersion", "contractId", "attemptId", "sourceContract", "lane",
        "feature", "customUserDirName", "qaLaneRoot", "realRoot", "homeUnchanged",
        "prepare", "initialVerification", "godotPhaseVerifications",
        "godotPhaseLabels", "godotPhaseVerificationCount", "cleanup",
        "postCleanupInspection", "laneAbsentAfterCleanup", "lockAbsentAfterCleanup",
    }
    if (
        set(evidence) != expected_root_keys
        or type(evidence.get("schemaVersion")) is not int
        or evidence.get("schemaVersion") != 1
        or evidence.get("contractId") != QA_LANE_LIFECYCLE_CONTRACT_ID
        or evidence.get("lane") != QA_LANE
        or evidence.get("feature") != QA_LANE_FEATURE
        or evidence.get("customUserDirName") != QA_LANE_CUSTOM_USER_DIR_NAME
        or evidence.get("homeUnchanged") is not True
        or evidence.get("godotPhaseLabels") != list(EXPECTED_GODOT_PHASE_LABELS)
        or evidence.get("godotPhaseVerificationCount") != len(EXPECTED_GODOT_PHASE_LABELS)
        or evidence.get("laneAbsentAfterCleanup") is not True
        or evidence.get("lockAbsentAfterCleanup") is not True
        or not isinstance(evidence.get("attemptId"), str)
        or not re.fullmatch(r"[0-9a-f]{32}", evidence["attemptId"])
    ):
        raise ExportGateError("final release attestation QA lane evidence drifted")
    if evidence.get("sourceContract") != {"status": "source_contract_passed"}:
        raise ExportGateError("final release attestation source contract evidence drifted")
    qa_lane_root = evidence.get("qaLaneRoot")
    real_root = evidence.get("realRoot")
    if (
        not isinstance(qa_lane_root, str)
        or not isinstance(real_root, str)
        or not Path(qa_lane_root).is_absolute()
        or not Path(real_root).is_absolute()
    ):
        raise ExportGateError("final release attestation must distinguish QA lane and real root")
    resolved_qa_root = Path(qa_lane_root).resolve()
    resolved_real_root = Path(real_root).resolve()
    for candidate, ancestor in (
        (resolved_qa_root, resolved_real_root),
        (resolved_real_root, resolved_qa_root),
    ):
        try:
            candidate.relative_to(ancestor)
        except ValueError:
            continue
        raise ExportGateError("final release attestation QA lane and real root overlap")
    prepare = evidence.get("prepare")
    if type(prepare) is not dict:
        raise ExportGateError("final release attestation prepare evidence is missing")
    prepare_owner = prepare.get("owner")
    if type(prepare_owner) is not str:
        raise ExportGateError("final release attestation prepare owner is missing")
    prepared = validate_prepared_qa_lane(prepare, prepare_owner)
    if (
        prepared["lane"] != evidence["lane"]
        or prepared["feature"] != evidence["feature"]
        or prepared["customUserDirName"] != evidence["customUserDirName"]
        or Path(prepared["laneRoot"]).resolve() != resolved_qa_root
        or Path(prepared["realRoot"]).resolve() != resolved_real_root
    ):
        raise ExportGateError("final release attestation prepare/root evidence drifted")
    lane_state = {
        **prepared,
        "lastLaneInventorySha256": prepared["laneInventorySha256"],
        "lastLaneEntryCount": prepared["laneEntryCount"],
    }
    initial_verification = evidence.get("initialVerification")
    if type(initial_verification) is not dict:
        raise ExportGateError("final release attestation initial verification is missing")
    validated_initial = validate_verified_qa_lane(initial_verification, lane_state)
    lane_state["lastLaneInventorySha256"] = validated_initial["laneInventorySha256"]
    lane_state["lastLaneEntryCount"] = validated_initial["laneEntryCount"]
    phase_verifications = evidence.get("godotPhaseVerifications")
    if type(phase_verifications) is not list or len(phase_verifications) != len(
        EXPECTED_GODOT_PHASE_LABELS
    ):
        raise ExportGateError("final release attestation phase verifications are incomplete")
    for index, item in enumerate(phase_verifications):
        if (
            type(item) is not dict
            or set(item) != {"label", "verification"}
            or item.get("label") != EXPECTED_GODOT_PHASE_LABELS[index]
            or type(item.get("verification")) is not dict
        ):
            raise ExportGateError("final release attestation phase verification schema drifted")
        verified = validate_verified_qa_lane(item["verification"], lane_state)
        lane_state["lastLaneInventorySha256"] = verified["laneInventorySha256"]
        lane_state["lastLaneEntryCount"] = verified["laneEntryCount"]
    cleanup = evidence.get("cleanup")
    inspection = evidence.get("postCleanupInspection")
    if type(cleanup) is not dict or type(inspection) is not dict:
        raise ExportGateError("final release attestation requires cleanup plus absent lane/lock inspection")
    validate_cleaned_qa_lane(cleanup, lane_state)
    validate_post_cleanup_inspection(inspection, lane_state)
    return canonical_json_sha256(evidence)


class GeneratedImportStateGuard:
    """Restore import sidecars and remove a cold-import cache on every exit path."""

    def __init__(self, project_root: Path, cleanup_report_path: Path | None = None) -> None:
        self.project_root = project_root.resolve()
        self.godot_cache = self.project_root / ".godot"
        self.cleanup_report_path = cleanup_report_path
        self.sidecars: dict[Path, bytes] = {}

    def __enter__(self) -> "GeneratedImportStateGuard":
        if self.godot_cache.exists():
            raise ExportGateError(
                "cold export gate requires client/godot/.godot to be absent before start"
            )
        for pattern in ("*.import", "*.uid"):
            for path in self.project_root.rglob(pattern):
                if path.is_file() and not path.is_symlink():
                    self.sidecars[path.resolve()] = path.read_bytes()
        return self

    def __exit__(self, _exc_type, _exc, _traceback) -> bool:
        cleanup_errors: list[str] = []
        generated_entries: list[dict[str, Any]] = []
        for pattern in ("*.import", "*.uid"):
            for path in self.project_root.rglob(pattern):
                resolved = path.resolve()
                if (
                    path.is_file()
                    and not path.is_symlink()
                    and resolved not in self.sidecars
                ):
                    payload = path.read_bytes()
                    generated_entries.append(
                        {
                            "path": resolved.relative_to(self.project_root).as_posix(),
                            "sha256": sha256_bytes(payload),
                            "size": len(payload),
                        }
                    )
        generated_entries.sort(key=lambda entry: entry["path"])
        if self.godot_cache.exists():
            try:
                shutil.rmtree(self.godot_cache)
            except OSError as exc:
                cleanup_errors.append(f"cannot remove generated .godot cache: {exc}")
        current: set[Path] = set()
        for pattern in ("*.import", "*.uid"):
            for path in self.project_root.rglob(pattern):
                if path.is_file() and not path.is_symlink():
                    current.add(path.resolve())
        for path in sorted(current - set(self.sidecars)):
            try:
                path.unlink()
            except OSError as exc:
                cleanup_errors.append(f"cannot remove generated sidecar {path}: {exc}")
        for path, original in self.sidecars.items():
            try:
                if not path.is_file() or path.read_bytes() != original:
                    path.parent.mkdir(parents=True, exist_ok=True)
                    path.write_bytes(original)
            except OSError as exc:
                cleanup_errors.append(f"cannot restore import sidecar {path}: {exc}")
        residual: list[str] = []
        for pattern in ("*.import", "*.uid"):
            for path in self.project_root.rglob(pattern):
                resolved = path.resolve()
                if resolved not in self.sidecars:
                    residual.append(resolved.relative_to(self.project_root).as_posix())
        cleanup_report = {
            "schemaVersion": 1,
            "reportId": "beastbound_pet_battle_generated_sidecar_cleanup_v1",
            "generatedSidecarCount": len(generated_entries),
            "generatedSidecarAggregateSha256": canonical_json_sha256(generated_entries),
            "generatedSidecars": generated_entries,
            "residualGeneratedSidecarCount": len(residual),
            "residualGeneratedSidecars": sorted(residual),
            "restoredBaselineSidecarCount": len(self.sidecars),
            "errors": cleanup_errors,
        }
        if self.cleanup_report_path is not None:
            try:
                self.cleanup_report_path.parent.mkdir(parents=True, exist_ok=True)
                self.cleanup_report_path.write_bytes(render_json(cleanup_report))
            except OSError as exc:
                cleanup_errors.append(f"cannot write generated-sidecar cleanup report: {exc}")
        if residual:
            cleanup_errors.append(
                f"generated import sidecars remain after cleanup: {len(residual)}"
            )
        if cleanup_errors:
            raise ExportGateError("; ".join(cleanup_errors))
        return False


def _path_is_within(path: Path, root: Path) -> bool:
    try:
        path.resolve().relative_to(root.resolve())
    except ValueError:
        return False
    return True


class IsolatedPckLaunchDirectories:
    """Own two disjoint mkdtemp roots and remove both on every exit path."""

    def __init__(self, repo_root: Path) -> None:
        self.repo_root = repo_root.resolve()
        self.expectation_root: Path | None = None
        self.pck_launch_root: Path | None = None

    def __enter__(self) -> "IsolatedPckLaunchDirectories":
        try:
            self.expectation_root = Path(
                tempfile.mkdtemp(prefix="beastbound-phase404-export-expectation-")
            ).resolve()
            self.pck_launch_root = Path(
                tempfile.mkdtemp(prefix="beastbound-phase404-pck-launch-")
            ).resolve()
            roots = (self.expectation_root, self.pck_launch_root)
            if any(_path_is_within(root, self.repo_root) for root in roots):
                raise ExportGateError("Phase404 isolated runtime roots must stay outside repository")
            if self.expectation_root.parent != self.pck_launch_root.parent:
                raise ExportGateError(
                    "Phase404 expectation and PCK launch roots must be siblings"
                )
            if (
                _path_is_within(self.expectation_root, self.pck_launch_root)
                or _path_is_within(self.pck_launch_root, self.expectation_root)
            ):
                raise ExportGateError(
                    "Phase404 expectation and PCK runtime roots must be mutually disjoint"
                )
            return self
        except Exception:
            self._cleanup()
            raise

    def _cleanup(self) -> list[str]:
        errors: list[str] = []
        for label, root in (
            ("expectation", self.expectation_root),
            ("PCK launch", self.pck_launch_root),
        ):
            if root is None or not root.exists():
                continue
            try:
                shutil.rmtree(root)
            except OSError as exc:
                errors.append(f"cannot remove Phase404 {label} root {root}: {exc}")
            if root.exists():
                errors.append(f"Phase404 {label} root remains after cleanup: {root}")
        return errors

    def __exit__(self, _exc_type, _exc, _traceback) -> bool:
        errors = self._cleanup()
        if errors:
            raise ExportGateError("; ".join(errors))
        return False


def tree_inventory(root: Path) -> dict[str, Any]:
    """Return a no-follow path/size/SHA inventory without mutating the root."""

    raw_root = root.expanduser()
    if raw_root.is_symlink():
        raise ExportGateError(f"inventory root may not be a symlink: {raw_root}")
    resolved = raw_root.resolve()
    entries: list[dict[str, Any]] = []
    if resolved.exists():
        if not resolved.is_dir():
            raise ExportGateError(f"inventory root must be a directory: {resolved}")
        def visit(directory: Path) -> None:
            try:
                children = sorted(os.scandir(directory), key=lambda item: item.name)
            except OSError as exc:
                raise ExportGateError(f"cannot inventory directory {directory}: {exc}") from exc
            for child in children:
                path = Path(child.path)
                relative = path.relative_to(resolved).as_posix()
                if child.is_symlink():
                    entries.append(
                        {
                            "path": relative,
                            "kind": "symlink",
                            "target": os.readlink(path),
                        }
                    )
                elif child.is_dir(follow_symlinks=False):
                    entries.append({"path": relative, "kind": "directory"})
                    visit(path)
                elif child.is_file(follow_symlinks=False):
                    try:
                        payload = path.read_bytes()
                    except OSError as exc:
                        raise ExportGateError(f"cannot inventory file {path}: {exc}") from exc
                    entries.append(
                        {
                            "path": relative,
                            "kind": "file",
                            "size": len(payload),
                            "sha256": sha256_bytes(payload),
                        }
                    )
                else:
                    raise ExportGateError(
                        f"inventory root contains unsupported entry: {path}"
                    )

        visit(resolved)
    document = {"exists": resolved.exists(), "entries": entries}
    return {
        "root": str(resolved),
        "exists": document["exists"],
        "entryCount": len(entries),
        "fileCount": sum(entry["kind"] == "file" for entry in entries),
        "treeSha256": canonical_json_sha256(document),
        "entries": entries,
    }


def assert_inventory_unchanged(
    before: dict[str, Any],
    after: dict[str, Any],
    label: str,
) -> None:
    if before.get("root") != after.get("root"):
        raise ExportGateError(f"{label} inventory root changed")
    if before.get("treeSha256") != after.get("treeSha256"):
        raise ExportGateError(f"{label} inventory changed during PCK QA")


def assert_inventory_has_no_symlinks(
    inventory: dict[str, Any],
    label: str,
) -> None:
    symlinks = [
        str(entry.get("path", ""))
        for entry in inventory.get("entries", [])
        if entry.get("kind") == "symlink"
    ]
    if symlinks:
        raise ExportGateError(
            f"{label} contains symlinks that cannot be proven byte-stable: "
            + ", ".join(symlinks)
        )


def resolve_real_user_root(project_path: Path) -> Path:
    """Resolve the documented macOS default user:// root without creating it."""

    project_file = project_path.resolve() / "project.godot"
    try:
        project_text = project_file.read_text(encoding="utf-8")
    except OSError as exc:
        raise ExportGateError(f"cannot read Godot project config: {exc}") from exc
    if re.search(r"(?m)^config/use_custom_user_dir\s*=\s*true\s*$", project_text):
        raise ExportGateError("Phase404 real user-root inventory does not support custom user dir")
    match = re.search(r'(?m)^config/name\s*=\s*("(?:\\.|[^"\\])*")\s*$', project_text)
    if match is None:
        raise ExportGateError("Godot project config/name is missing")
    try:
        project_name = json.loads(match.group(1))
    except json.JSONDecodeError as exc:
        raise ExportGateError(f"Godot project config/name is invalid: {exc}") from exc
    if not isinstance(project_name, str) or not project_name.strip():
        raise ExportGateError("Godot project config/name is empty")
    sanitized_name = project_name.replace("/", "-").replace("\\", "-")
    return (
        Path.home()
        / "Library/Application Support/Godot/app_userdata"
        / sanitized_name
    )


def repo_root_binding(repo_root: Path) -> dict[str, str]:
    normalized = str(repo_root.resolve()).replace("\\", "/")
    payload = f"{REPO_ROOT_BINDING_CONTRACT_ID}\n{normalized}".encode("utf-8")
    return {
        "contractId": REPO_ROOT_BINDING_CONTRACT_ID,
        "path": normalized,
        "sha256": sha256_bytes(payload),
    }


def build_pck_sandbox_profile(real_user_root: Path) -> dict[str, Any]:
    real_root = real_user_root.resolve()
    app_userdata_root = real_root.parent
    if app_userdata_root.name != "app_userdata" or real_root.parent == real_root:
        raise ExportGateError("real Beastbound user root is outside Godot app_userdata")
    if not app_userdata_root.is_dir() or app_userdata_root.is_symlink():
        raise ExportGateError("Godot app_userdata root is missing or unsafe")
    normalized = str(app_userdata_root).replace("\\", "/")
    if any(character in normalized for character in ('\n', '\r', '\x00')):
        raise ExportGateError("Godot app_userdata root cannot be represented in sandbox profile")
    quoted = json.dumps(normalized, ensure_ascii=False)
    payload = (
        "(version 1)\n"
        "(allow default)\n"
        "(deny file-write*\n"
        f"    (literal {quoted})\n"
        f"    (subpath {quoted}))\n"
    ).encode("utf-8")
    return {
        "contractId": PCK_SANDBOX_CONTRACT_ID,
        "deniedRoot": app_userdata_root,
        "profileBytes": payload,
        "profileSha256": sha256_bytes(payload),
    }


def create_pck_sandbox_runtime(
    *,
    godot_executable: Path,
    real_user_root: Path,
    pck_launch_root: Path,
) -> dict[str, Any]:
    launch_root = pck_launch_root.resolve()
    if not launch_root.is_dir() or launch_root.is_symlink():
        raise ExportGateError("PCK launch root is missing or unsafe")
    binaries = {
        "sandboxExecutable": SANDBOX_EXECUTABLE,
        "touchExecutable": SANDBOX_TOUCH_EXECUTABLE,
        "godotExecutable": godot_executable.resolve(),
    }
    for label, path in binaries.items():
        if path.is_symlink() or not path.is_file():
            raise ExportGateError(f"{label} is missing or unsafe: {path}")
    profile = build_pck_sandbox_profile(real_user_root)
    profile_path = launch_root / "phase404-pck-user-write-deny.sb"
    if profile_path.exists() or profile_path.is_symlink():
        raise ExportGateError("PCK sandbox profile path is not empty")
    profile_path.write_bytes(profile["profileBytes"])
    runtime = {
        "contractId": PCK_SANDBOX_CONTRACT_ID,
        **binaries,
        "sandboxExecutableSha256": _sha256_file(binaries["sandboxExecutable"]),
        "touchExecutableSha256": _sha256_file(binaries["touchExecutable"]),
        "godotExecutableSha256": _sha256_file(binaries["godotExecutable"]),
        "profilePath": profile_path,
        "profileBytes": profile["profileBytes"],
        "profileSha256": profile["profileSha256"],
        "deniedRoot": profile["deniedRoot"],
        "pckLaunchRoot": launch_root,
    }
    assert_pck_sandbox_runtime_integrity(runtime)
    return runtime


def assert_pck_sandbox_runtime_integrity(runtime: dict[str, Any]) -> None:
    for path_key, sha_key in (
        ("sandboxExecutable", "sandboxExecutableSha256"),
        ("touchExecutable", "touchExecutableSha256"),
        ("godotExecutable", "godotExecutableSha256"),
    ):
        path = Path(runtime[path_key])
        if path.is_symlink() or not path.is_file():
            raise ExportGateError(f"PCK sandbox runtime {path_key} disappeared")
        if _sha256_file(path) != str(runtime[sha_key]):
            raise ExportGateError(f"PCK sandbox runtime {path_key} changed")
    profile_path = Path(runtime["profilePath"])
    if profile_path.is_symlink() or not profile_path.is_file():
        raise ExportGateError("PCK sandbox profile disappeared")
    if profile_path.read_bytes() != runtime["profileBytes"]:
        raise ExportGateError("PCK sandbox profile bytes changed")
    if _sha256_file(profile_path) != str(runtime["profileSha256"]):
        raise ExportGateError("PCK sandbox profile SHA-256 changed")


def sandboxed_command(runtime: dict[str, Any], godot_arguments: list[str]) -> list[str]:
    return [
        str(runtime["sandboxExecutable"]),
        "-f",
        str(runtime["profilePath"]),
        str(runtime["godotExecutable"]),
        *godot_arguments,
    ]


def read_engine_log_snapshot(
    path: Path,
    evidence_path: Path | None = None,
) -> dict[str, Any]:
    if path.is_symlink() or not path.is_file():
        raise ExportGateError(f"Godot engine log is missing or unsafe: {path}")
    try:
        payload = path.read_bytes()
        text = payload.decode("utf-8")
    except (OSError, UnicodeDecodeError) as exc:
        raise ExportGateError(f"cannot read Godot engine log {path}: {exc}") from exc
    if evidence_path is not None:
        evidence_path.parent.mkdir(parents=True, exist_ok=True)
        evidence_path.write_bytes(payload)
    findings = scan_log_errors(text)
    if findings:
        raise ExportGateError(
            f"strict engine log scan failed for {path}: {'; '.join(findings)}"
        )
    return {
        "path": str(path.resolve()),
        "evidencePath": str(evidence_path.resolve()) if evidence_path is not None else "",
        "size": len(payload),
        "sha256": sha256_bytes(payload),
    }


def parse_pinned_godot_version(output: str) -> str:
    lines = _strict_raw_output_lines(
        output,
        "pinned Godot version output",
        allow_tab=False,
        allow_sgr=False,
    )
    if lines and lines[-1] == "":
        lines.pop()
    if lines != [PINNED_GODOT_VERSION]:
        raise ExportGateError(
            "Phase404 requires the exact pinned Godot build "
            f"{PINNED_GODOT_VERSION}, got {output!r}"
        )
    return PINNED_GODOT_VERSION


def extract_user_root_preflight(log_text: str) -> dict[str, Any]:
    return _extract_authoritative_json_object(
        log_text,
        USER_ROOT_PREFLIGHT_PREFIX,
        "user-root preflight",
    )


def validate_pck_preflight(
    result: dict[str, Any],
    *,
    pck_launch_root: Path,
    godot_executable: Path,
    expectation_path: Path,
    real_user_root: Path,
    repo_root: Path,
    repo_binding_sha256: str,
) -> dict[str, Path | str]:
    expected_keys = {
        "ok", "workingDir", "resourceRoot", "userRoot", "executablePath",
        "repoRoot", "repoRootSha256",
    }
    if type(result) is not dict or set(result) != expected_keys:
        raise ExportGateError("PCK preflight result keys are not exact")
    if result.get("ok") is not True:
        raise ExportGateError("PCK path preflight did not pass")
    string_fields = (
        "workingDir", "resourceRoot", "userRoot", "executablePath", "repoRoot",
        "repoRootSha256",
    )
    if any(type(result.get(field)) is not str for field in string_fields):
        raise ExportGateError("PCK preflight string fields must be exact strings")
    if any(result[field] != result[field].strip() for field in string_fields):
        raise ExportGateError("PCK preflight string fields contain boundary whitespace")
    if result["resourceRoot"] != "":
        raise ExportGateError("PCK preflight resourceRoot must be exactly empty")
    raw_paths = {
        "workingDir": result["workingDir"],
        "userRoot": result["userRoot"],
        "executablePath": result["executablePath"],
        "repoRoot": result["repoRoot"],
    }
    for label, raw in raw_paths.items():
        if not raw or not Path(raw).is_absolute():
            raise ExportGateError(f"PCK preflight {label} must be an absolute path")
    working_directory = Path(raw_paths["workingDir"]).resolve()
    user_root = Path(raw_paths["userRoot"]).resolve()
    executable = Path(raw_paths["executablePath"]).resolve()
    observed_repo_root = Path(raw_paths["repoRoot"]).resolve()
    if working_directory != pck_launch_root.resolve():
        raise ExportGateError("PCK workingDir is not the isolated launch root")
    if executable != godot_executable.resolve():
        raise ExportGateError("PCK preflight did not execute the pinned Godot binary")
    if user_root != real_user_root.resolve():
        raise ExportGateError("PCK preflight userRoot is not the real Beastbound user root")
    if observed_repo_root != repo_root.resolve():
        raise ExportGateError("PCK preflight repoRoot binding path mismatch")
    observed_repo_sha = result.get("repoRootSha256")
    if (
        not re.fullmatch(r"[0-9a-f]{64}", observed_repo_sha)
        or observed_repo_sha != repo_binding_sha256
    ):
        raise ExportGateError("PCK preflight repoRoot binding SHA-256 mismatch")
    expectation_directory = expectation_path.resolve().parent
    for label, root in (
        ("workingDir", working_directory),
        ("userRoot", user_root),
        ("repoRoot", observed_repo_root),
    ):
        if _path_is_within(expectation_directory, root) or _path_is_within(
            root,
            expectation_directory,
        ):
            raise ExportGateError(f"PCK expectation overlaps preflight {label}")
    return {
        "workingDir": working_directory,
        "resourceRoot": "",
        "userRoot": user_root,
        "executablePath": executable,
        "repoRoot": observed_repo_root,
        "repoRootSha256": repo_binding_sha256,
    }


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def render_json(value: Any) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def read_regular_file_no_follow(
    root: Path,
    relative_path: str | Path,
    *,
    label: str,
) -> tuple[Path, bytes]:
    """Read one stable regular file without following any path-component symlink."""

    root = Path(root)
    if not root.is_absolute():
        raise ExportGateError(f"{label} root must be absolute")
    relative = Path(relative_path)
    if relative.is_absolute() or not relative.parts or any(
        part in ("", ".", "..") for part in relative.parts
    ):
        raise ExportGateError(f"{label} relative path is unsafe: {relative_path}")
    candidate = root.joinpath(*relative.parts)
    no_follow = getattr(os, "O_NOFOLLOW", None)
    directory_only = getattr(os, "O_DIRECTORY", None)
    if no_follow is None or directory_only is None:
        raise ExportGateError(f"{label} platform lacks no-follow directory traversal")
    close_on_exec = getattr(os, "O_CLOEXEC", 0)
    identity = lambda value: (
        value.st_dev,
        value.st_ino,
        value.st_mode,
        value.st_size,
        value.st_mtime_ns,
    )
    descriptors: list[int] = []
    namespace_edges: list[tuple[int, str, tuple[int, int, int, int, int]]] = []
    try:
        root_lstat = os.lstat(root)
        if stat.S_ISLNK(root_lstat.st_mode) or not stat.S_ISDIR(root_lstat.st_mode):
            raise ExportGateError(f"{label} root must be a non-symlink directory")
        root_fd = os.open(
            root,
            os.O_RDONLY | directory_only | no_follow | close_on_exec,
        )
        descriptors.append(root_fd)
        root_fstat = os.fstat(root_fd)
        if identity(root_lstat) != identity(root_fstat):
            raise ExportGateError(f"{label} root changed before its no-follow traversal")

        parent_fd = root_fd
        for part in relative.parts[:-1]:
            child_lstat = os.stat(part, dir_fd=parent_fd, follow_symlinks=False)
            if stat.S_ISLNK(child_lstat.st_mode):
                raise ExportGateError(
                    f"{label} path contains a symlink: {relative_path}"
                )
            if not stat.S_ISDIR(child_lstat.st_mode):
                raise ExportGateError(
                    f"{label} parent is not a directory: {relative_path}"
                )
            child_fd = os.open(
                part,
                os.O_RDONLY | directory_only | no_follow | close_on_exec,
                dir_fd=parent_fd,
            )
            descriptors.append(child_fd)
            child_stat = os.fstat(child_fd)
            if identity(child_lstat) != identity(child_stat):
                raise ExportGateError(
                    f"{label} parent changed before its no-follow traversal"
                )
            namespace_edges.append((parent_fd, part, identity(child_stat)))
            parent_fd = child_fd

        leaf_name = relative.parts[-1]
        leaf_lstat = os.stat(leaf_name, dir_fd=parent_fd, follow_symlinks=False)
        if stat.S_ISLNK(leaf_lstat.st_mode) or not stat.S_ISREG(leaf_lstat.st_mode):
            raise ExportGateError(f"{label} is not a non-symlink regular file: {relative_path}")
        descriptor = os.open(
            leaf_name,
            os.O_RDONLY | no_follow | close_on_exec,
            dir_fd=parent_fd,
        )
        descriptors.append(descriptor)
        before = os.fstat(descriptor)
        if not stat.S_ISREG(before.st_mode) or identity(leaf_lstat) != identity(before):
            raise ExportGateError(f"{label} descriptor is not a regular file")
        chunks: list[bytes] = []
        while True:
            chunk = os.read(descriptor, 1024 * 1024)
            if not chunk:
                break
            chunks.append(chunk)
        after = os.fstat(descriptor)
        final_leaf_lstat = os.stat(
            leaf_name,
            dir_fd=parent_fd,
            follow_symlinks=False,
        )
        if identity(before) != identity(after) or identity(after) != identity(final_leaf_lstat):
            raise ExportGateError(f"{label} changed during its no-follow read")
        for edge_parent_fd, edge_name, edge_identity in namespace_edges:
            final_edge_stat = os.stat(
                edge_name,
                dir_fd=edge_parent_fd,
                follow_symlinks=False,
            )
            if edge_identity != identity(final_edge_stat):
                raise ExportGateError(f"{label} parent changed during its no-follow read")
        final_root_lstat = os.lstat(root)
        if identity(root_fstat) != identity(final_root_lstat):
            raise ExportGateError(f"{label} root changed during its no-follow read")
    except OSError as exc:
        raise ExportGateError(
            f"cannot read stable {label}; path may be missing, a symlink, or changed: "
            f"{relative_path}"
        ) from exc
    finally:
        for descriptor in reversed(descriptors):
            os.close(descriptor)
    return candidate, b"".join(chunks)


def expected_import_param_literals() -> dict[str, str]:
    """Return every pinned Godot 4.7 ``[params]`` value as exact source text."""

    return {
        "compress/mode": "0",
        "compress/high_quality": "false",
        "compress/lossy_quality": "0.7",
        "compress/uastc_level": "0",
        "compress/rdo_quality_loss": "0.0",
        "compress/hdr_compression": "1",
        "compress/normal_map": "0",
        "compress/channel_pack": "0",
        "mipmaps/generate": "false",
        "mipmaps/limit": "-1",
        "roughness/mode": "0",
        "roughness/src_normal": '""',
        "process/channel_remap/red": "0",
        "process/channel_remap/green": "1",
        "process/channel_remap/blue": "2",
        "process/channel_remap/alpha": "3",
        "process/fix_alpha_border": "true",
        "process/premult_alpha": "false",
        "process/normal_map_invert_y": "false",
        "process/hdr_as_srgb": "false",
        "process/hdr_clamp_exposure": "false",
        "process/size_limit": "0",
        "detect_3d/compress_to": "1",
    }


def expected_import_options() -> dict[str, Any]:
    """Return the complete deterministic sidecar semantics bound per frame."""

    return {
        "importer": "texture",
        "resourceType": "CompressedTexture2D",
        "metadataVramTexture": False,
        "destinationContract": "single_res_imported_ctex",
        "parameterLiterals": expected_import_param_literals(),
    }


def godot47_import_oracle() -> dict[str, Any]:
    """Describe the frozen source-to-imported-pixel transform without ambiguity."""

    return {
        "schemaVersion": 1,
        "contractId": IMPORT_ORACLE_ID,
        "pixelContractId": PIXEL_CONTRACT_ID,
        "godotVersion": PINNED_GODOT_VERSION,
        "godotSourceCommit": PINNED_GODOT_SOURCE_COMMIT,
        "godotExecutableSha256": PINNED_GODOT_EXECUTABLE_SHA256,
        "sourceImageFormat": "RGBA8",
        "outputImageFormat": "RGBA8",
        "fixAlphaEdges": {
            "sourceCopy": True,
            "alphaEligibleBelow": GODOT_FIX_ALPHA_THRESHOLD,
            "radius": GODOT_FIX_ALPHA_RADIUS,
            "searchShape": "clamped_square",
            "distanceMetric": "squared_euclidean",
            "targetTraversal": "row_major_y_x",
            "candidateTraversal": "row_major_y_x",
            "tieBreak": "first_row_major_candidate",
            "copiedChannels": ["red", "green", "blue"],
            "alphaPreserved": True,
        },
        "importOptions": expected_import_options(),
        "premultiplyAfterFixAlphaEdges": False,
        "fixAlphaEdgesSourceUrl": GODOT_FIX_ALPHA_SOURCE_URL,
        "textureImporterSourceUrl": GODOT_TEXTURE_IMPORT_SOURCE_URL,
    }


def godot47_import_oracle_sha256() -> str:
    return canonical_json_sha256(godot47_import_oracle())


def _validate_rgba8_payload(width: int, height: int, pixels: bytes) -> None:
    if (
        type(width) is not int
        or type(height) is not int
        or width <= 0
        or height <= 0
    ):
        raise ExportGateError("RGBA8 dimensions must be positive integers")
    if not isinstance(pixels, bytes) or len(pixels) != width * height * 4:
        raise ExportGateError("RGBA8 byte count mismatch")


def godot47_fix_alpha_edges_rgba8(width: int, height: int, pixels: bytes) -> bytes:
    """Reproduce Godot 4.7 ``Image::fix_alpha_edges`` on an immutable source.

    The implementation is equivalent to the C++ square search but uses a
    per-source-row nearest-x table so auditing 540 full frames remains bounded.
    Within a row an equal-distance tie selects the lower x; rows are considered
    from low y to high y, so the global tie is the first row-major candidate.
    """

    _validate_rgba8_payload(width, height, pixels)
    source = pixels
    transformed = bytearray(pixels)
    radius = GODOT_FIX_ALPHA_RADIUS
    threshold = GODOT_FIX_ALPHA_THRESHOLD
    nearest_x_by_row: list[list[int]] = []
    for y in range(height):
        row_offset = y * width * 4
        left = [-1] * width
        right = [-1] * width
        last = -radius - 1
        for x in range(width):
            if source[row_offset + x * 4 + 3] >= threshold:
                last = x
            if x - last <= radius:
                left[x] = last
        last = width + radius
        for x in range(width - 1, -1, -1):
            if source[row_offset + x * 4 + 3] >= threshold:
                last = x
            if last - x <= radius:
                right[x] = last
        nearest = [-1] * width
        for x in range(width):
            left_x = left[x]
            right_x = right[x]
            if left_x >= 0 and (
                right_x < 0 or x - left_x <= right_x - x
            ):
                nearest[x] = left_x
            elif right_x < width:
                nearest[x] = right_x
        nearest_x_by_row.append(nearest)

    for y in range(height):
        target_row_offset = y * width * 4
        from_y = max(0, y - radius)
        to_y = min(height - 1, y + radius)
        for x in range(width):
            target_offset = target_row_offset + x * 4
            if source[target_offset + 3] >= threshold:
                continue
            closest_distance = (radius * radius * 2) + 1
            closest_offset = -1
            for source_y in range(from_y, to_y + 1):
                source_x = nearest_x_by_row[source_y][x]
                if source_x < 0:
                    continue
                delta_y = y - source_y
                delta_x = x - source_x
                distance = delta_y * delta_y + delta_x * delta_x
                if distance >= closest_distance:
                    continue
                closest_distance = distance
                closest_offset = (source_y * width + source_x) * 4
            if closest_offset >= 0:
                transformed[target_offset : target_offset + 3] = source[
                    closest_offset : closest_offset + 3
                ]
    return bytes(transformed)


def imported_pixel_contract_sha256(
    width: int,
    height: int,
    imported_pixels: bytes,
    import_oracle_sha256: str,
) -> str:
    _validate_rgba8_payload(width, height, imported_pixels)
    if not re.fullmatch(r"[0-9a-f]{64}", import_oracle_sha256):
        raise ExportGateError("import oracle SHA-256 is invalid")
    prefix = (
        f"{PIXEL_CONTRACT_ID}\n{import_oracle_sha256}\n{width}x{height}:RGBA8\n"
    ).encode("utf-8")
    return sha256_bytes(prefix + imported_pixels)


def frame_import_binding_document(frame: dict[str, Any]) -> dict[str, Any]:
    return {
        "contractId": FRAME_IMPORT_BINDING_ID,
        "path": frame.get("path"),
        "sourceFileSha256": frame.get("sourceFileSha256"),
        "sourceRgba8Sha256": frame.get("sourceRgba8Sha256"),
        "importOracleSha256": frame.get("importOracleSha256"),
        "importOptions": frame.get("importOptions"),
        "expectedImportedRgba8RawSha256": frame.get(
            "expectedImportedRgba8RawSha256"
        ),
        "expectedImportedPixelContractSha256": frame.get(
            "expectedImportedPixelContractSha256"
        ),
    }


def _paeth(a: int, b: int, c: int) -> int:
    prediction = a + b - c
    distance_a = abs(prediction - a)
    distance_b = abs(prediction - b)
    distance_c = abs(prediction - c)
    if distance_a <= distance_b and distance_a <= distance_c:
        return a
    return b if distance_b <= distance_c else c


def decode_rgba8_png(payload: bytes) -> tuple[int, int, bytes]:
    """Decode the source contract's 8-bit non-interlaced RGBA PNG subset."""

    if not payload.startswith(b"\x89PNG\r\n\x1a\n"):
        raise ExportGateError("source frame is not a PNG")
    offset = 8
    width = height = 0
    saw_ihdr = saw_iend = False
    compressed = bytearray()
    while offset < len(payload):
        if offset + 12 > len(payload):
            raise ExportGateError("source PNG chunk is truncated")
        length = struct.unpack(">I", payload[offset : offset + 4])[0]
        chunk_type = payload[offset + 4 : offset + 8]
        data_start = offset + 8
        data_end = data_start + length
        crc_end = data_end + 4
        if crc_end > len(payload):
            raise ExportGateError("source PNG chunk payload is truncated")
        data = payload[data_start:data_end]
        expected_crc = struct.unpack(">I", payload[data_end:crc_end])[0]
        if zlib.crc32(chunk_type + data) & 0xFFFFFFFF != expected_crc:
            raise ExportGateError("source PNG chunk CRC mismatch")
        if chunk_type == b"IHDR":
            if saw_ihdr or length != 13:
                raise ExportGateError("source PNG IHDR is invalid")
            width, height, depth, color, compression, filtering, interlace = struct.unpack(
                ">IIBBBBB", data
            )
            if (
                width <= 0
                or height <= 0
                or depth != 8
                or color != 6
                or compression != 0
                or filtering != 0
                or interlace != 0
            ):
                raise ExportGateError(
                    "source PNG must be 8-bit non-interlaced RGBA with standard compression/filtering"
                )
            saw_ihdr = True
        elif chunk_type == b"IDAT":
            if not saw_ihdr:
                raise ExportGateError("source PNG IDAT precedes IHDR")
            compressed.extend(data)
        elif chunk_type == b"IEND":
            saw_iend = True
            offset = crc_end
            break
        offset = crc_end
    if not saw_ihdr or not saw_iend or not compressed:
        raise ExportGateError("source PNG is missing IHDR, IDAT, or IEND")
    try:
        filtered = zlib.decompress(bytes(compressed))
    except zlib.error as exc:
        raise ExportGateError(f"source PNG IDAT cannot be decompressed: {exc}") from exc
    bytes_per_pixel = 4
    stride = width * bytes_per_pixel
    expected_length = (stride + 1) * height
    if len(filtered) != expected_length:
        raise ExportGateError(
            f"source PNG scanline length mismatch: {len(filtered)} != {expected_length}"
        )
    decoded = bytearray(width * height * bytes_per_pixel)
    previous = bytearray(stride)
    source_offset = 0
    for row_index in range(height):
        filter_type = filtered[source_offset]
        source_offset += 1
        scanline = filtered[source_offset : source_offset + stride]
        source_offset += stride
        current = bytearray(stride)
        for index, raw in enumerate(scanline):
            left = current[index - bytes_per_pixel] if index >= bytes_per_pixel else 0
            above = previous[index]
            upper_left = previous[index - bytes_per_pixel] if index >= bytes_per_pixel else 0
            if filter_type == 0:
                value = raw
            elif filter_type == 1:
                value = raw + left
            elif filter_type == 2:
                value = raw + above
            elif filter_type == 3:
                value = raw + ((left + above) // 2)
            elif filter_type == 4:
                value = raw + _paeth(left, above, upper_left)
            else:
                raise ExportGateError(f"source PNG uses unsupported filter {filter_type}")
            current[index] = value & 0xFF
        destination = row_index * stride
        decoded[destination : destination + stride] = current
        previous = current
    return width, height, bytes(decoded)


def canonical_frame_facts(form_id: str, pet_root: str) -> Iterable[dict[str, Any]]:
    for view in FORMAL_VIEWS:
        for action in FORMAL_ACTIONS:
            for frame_index in range(1, FORMAL_FRAME_COUNTS[action] + 1):
                relative = f"views/{view}/{action}/{action}-{frame_index}.png"
                yield {
                    "formId": form_id,
                    "view": view,
                    "action": action,
                    "frameIndex": frame_index,
                    "repoPath": f"{pet_root}/{relative}",
                    "resourcePath": f"res://{pet_root.removeprefix('client/godot/')}/{relative}",
                }


def source_frame_expectation(
    repo_root: Path,
    fact: dict[str, Any],
    import_oracle_sha256: str | None = None,
) -> dict[str, Any]:
    _source_path, payload = read_regular_file_no_follow(
        repo_root,
        str(fact["repoPath"]),
        label="source frame",
    )
    width, height, pixels = decode_rgba8_png(payload)
    if width != 256 or height != 256:
        raise ExportGateError(
            f"source frame must be 256x256: {fact['repoPath']} ({width}x{height})"
        )
    oracle_sha = import_oracle_sha256 or godot47_import_oracle_sha256()
    imported_pixels = godot47_fix_alpha_edges_rgba8(width, height, pixels)
    frame = {
        "path": fact["resourcePath"],
        "sourceRepoPath": fact["repoPath"],
        "view": fact["view"],
        "action": fact["action"],
        "frameIndex": fact["frameIndex"],
        "width": width,
        "height": height,
        "sourceFileSha256": sha256_bytes(payload),
        "sourceRgba8Sha256": sha256_bytes(pixels),
        "sourceRgba8ByteCount": len(pixels),
        "importOracleSha256": oracle_sha,
        "importOptions": expected_import_options(),
        "expectedImportedRgba8RawSha256": sha256_bytes(imported_pixels),
        "expectedImportedPixelContractSha256": imported_pixel_contract_sha256(
            width,
            height,
            imported_pixels,
            oracle_sha,
        ),
        "expectedImportedRgba8ByteCount": len(imported_pixels),
    }
    frame["frameImportBindingSha256"] = canonical_json_sha256(
        frame_import_binding_document(frame)
    )
    return frame


def source_runtime_tree_sha256(
    form_id: str,
    pet_root: str,
    frames: list[dict[str, Any]],
) -> str:
    facts = list(canonical_frame_facts(form_id, pet_root))
    if len(frames) != EXPECTED_RUNTIME_FRAME_COUNT or len(frames) != len(facts):
        raise ExportGateError(f"source runtime tree is not 180 frames: {form_id}")
    lines = [
        f"contract\t{RUNTIME_TREE_CONTRACT_ID}\n",
        f"formId\t{form_id}\n",
        "runtimeRoot\tviews\n",
        f"views\t{','.join(FORMAL_VIEWS)}\n",
        "actions\t"
        + ",".join(f"{action}:{FORMAL_FRAME_COUNTS[action]}" for action in FORMAL_ACTIONS)
        + "\n",
    ]
    for frame, fact in zip(frames, facts):
        if frame.get("path") != fact["resourcePath"]:
            raise ExportGateError(f"source runtime tree frame order drift: {form_id}")
        source_sha = str(frame.get("sourceFileSha256", "")).lower()
        if not re.fullmatch(r"[0-9a-f]{64}", source_sha):
            raise ExportGateError(f"source runtime tree frame SHA is invalid: {form_id}")
        relative = str(fact["repoPath"]).removeprefix(f"{pet_root}/")
        lines.append(f"{relative}\t{source_sha}\n")
    return sha256_bytes("".join(lines).encode("utf-8"))


def _parse_import_assignment(value: str, label: str) -> Any:
    try:
        return json.loads(
            value,
            object_pairs_hook=_json_object_without_duplicate_keys,
            parse_constant=_reject_non_json_constant,
        )
    except (json.JSONDecodeError, ExportGateError) as exc:
        raise ExportGateError(f"Godot import sidecar {label} is not a JSON scalar") from exc


def _strict_typed_equal(actual: Any, expected: Any) -> bool:
    if type(actual) is not type(expected):
        return False
    if isinstance(actual, dict):
        return set(actual) == set(expected) and all(
            _strict_typed_equal(actual[key], expected[key]) for key in actual
        )
    if isinstance(actual, list):
        return len(actual) == len(expected) and all(
            _strict_typed_equal(left, right)
            for left, right in zip(actual, expected)
        )
    return actual == expected


def parse_texture_import_sidecar(payload: bytes, resource_path: str) -> dict[str, Any]:
    """Parse one Godot 4.7 texture sidecar with an exact, fail-closed schema."""

    try:
        text = payload.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise ExportGateError("Godot import sidecar is not UTF-8") from exc
    sections: dict[str, list[str]] = {}
    current = ""
    for raw_line in text.splitlines():
        if raw_line != raw_line.strip():
            raise ExportGateError("Godot import sidecar contains non-canonical whitespace")
        line = raw_line
        if not line:
            continue
        section_match = re.fullmatch(r"\[([a-z]+)\]", line)
        if section_match:
            current = section_match.group(1)
            if current in sections:
                raise ExportGateError(f"Godot import sidecar section is duplicated: {current}")
            sections[current] = []
            continue
        if not current:
            raise ExportGateError("Godot import sidecar content precedes its first section")
        sections[current].append(line)
    if list(sections) != ["remap", "deps", "params"]:
        raise ExportGateError("Godot import sidecar sections/order drifted")

    def assignments(
        section: str, *, allow_metadata: bool = False
    ) -> tuple[dict[str, Any], dict[str, str]]:
        values: dict[str, Any] = {}
        raw_values: dict[str, str] = {}
        metadata_lines: list[str] = []
        in_metadata = False
        for line in sections[section]:
            if allow_metadata and line == "metadata={":
                if in_metadata or metadata_lines:
                    raise ExportGateError("Godot import sidecar metadata is duplicated")
                in_metadata = True
                metadata_lines.append(line)
                continue
            if in_metadata:
                metadata_lines.append(line)
                if line == "}":
                    in_metadata = False
                continue
            if "=" not in line:
                raise ExportGateError(
                    f"Godot import sidecar {section} contains a malformed assignment"
                )
            key, raw_value = line.split("=", 1)
            if not key or key != key.strip() or key in values:
                raise ExportGateError(
                    f"Godot import sidecar assignment is duplicated: {section}/{key}"
                )
            raw_values[key] = raw_value
            values[key] = _parse_import_assignment(raw_value, f"{section}/{key}")
        if in_metadata:
            raise ExportGateError("Godot import sidecar metadata is unterminated")
        if allow_metadata and metadata_lines != [
            "metadata={",
            '"vram_texture": false',
            "}",
        ]:
            raise ExportGateError("Godot import sidecar metadata drifted")
        return values, raw_values

    remap, _remap_literals = assignments("remap", allow_metadata=True)
    deps, _deps_literals = assignments("deps")
    params, param_literals = assignments("params")
    if set(remap) != {"importer", "type", "uid", "path"}:
        raise ExportGateError("Godot import sidecar remap keys drifted")
    if remap["importer"] != "texture" or remap["type"] != "CompressedTexture2D":
        raise ExportGateError("Godot import sidecar is not a lossless Texture2D import")
    if not isinstance(remap["uid"], str) or not remap["uid"].startswith("uid://"):
        raise ExportGateError("Godot import sidecar uid is invalid")
    if set(deps) != {"source_file", "dest_files"}:
        raise ExportGateError("Godot import sidecar deps keys drifted")
    if deps["source_file"] != resource_path:
        raise ExportGateError("Godot import sidecar source_file does not match the exact frame")
    dest_files = deps["dest_files"]
    if (
        not isinstance(dest_files, list)
        or len(dest_files) != 1
        or not isinstance(dest_files[0], str)
        or not dest_files[0].startswith("res://.godot/imported/")
        or not dest_files[0].endswith(".ctex")
        or remap["path"] != dest_files[0]
    ):
        raise ExportGateError("Godot import sidecar destination binding drifted")
    expected_params = {
        key: _parse_import_assignment(raw_value, f"expected params/{key}")
        for key, raw_value in expected_import_param_literals().items()
    }
    if param_literals != expected_import_param_literals():
        raise ExportGateError("Godot import sidecar params literal text drifted")
    if not _strict_typed_equal(params, expected_params):
        raise ExportGateError("Godot import sidecar params/options drifted")
    return {
        "importer": remap["importer"],
        "resourceType": remap["type"],
        "destination": dest_files[0],
        "sourceFile": deps["source_file"],
        "importOptions": expected_import_options(),
    }


def audit_import_sidecars(
    repo_root: Path,
    expectation: dict[str, Any],
) -> dict[str, Any]:
    """Audit tracked and generated sidecars for all 540 canonical frames."""

    repo_root = repo_root.resolve()
    oracle = expectation.get("importOracle")
    oracle_sha = str(expectation.get("importOracleSha256", ""))
    if not isinstance(oracle, dict) or not canonical_json_equal(
        oracle, godot47_import_oracle()
    ):
        raise ExportGateError("sidecar audit import oracle mismatch")
    if oracle_sha != canonical_json_sha256(oracle):
        raise ExportGateError("sidecar audit import oracle SHA-256 mismatch")
    frames_evidence: list[dict[str, Any]] = []
    seen_paths: set[str] = set()
    forms = expectation.get("forms")
    if not isinstance(forms, list):
        raise ExportGateError("sidecar audit expectation forms must be an array")
    for form in forms:
        if not isinstance(form, dict) or not isinstance(form.get("frames"), list):
            raise ExportGateError("sidecar audit expectation form/frames are malformed")
        for frame in form["frames"]:
            if not isinstance(frame, dict):
                raise ExportGateError("sidecar audit expectation frame is not an object")
            resource_path = str(frame.get("path", ""))
            repo_path = str(frame.get("sourceRepoPath", ""))
            if (
                not resource_path.startswith("res://")
                or repo_path != f"client/godot/{resource_path.removeprefix('res://')}"
                or repo_path in seen_paths
            ):
                raise ExportGateError("sidecar audit frame path binding is invalid or duplicated")
            seen_paths.add(repo_path)
            if not canonical_json_equal(
                frame.get("importOptions"), expected_import_options()
            ):
                raise ExportGateError(f"sidecar audit expected import options drifted: {repo_path}")
            if frame.get("importOracleSha256") != oracle_sha:
                raise ExportGateError(f"sidecar audit frame oracle binding drifted: {repo_path}")
            if frame.get("frameImportBindingSha256") != canonical_json_sha256(
                frame_import_binding_document(frame)
            ):
                raise ExportGateError(f"sidecar audit frame binding drifted: {repo_path}")
            sidecar_relative = f"{repo_path}.import"
            _sidecar_path, payload = read_regular_file_no_follow(
                repo_root,
                sidecar_relative,
                label="canonical import sidecar",
            )
            parsed = parse_texture_import_sidecar(payload, resource_path)
            frames_evidence.append(
                {
                    "path": resource_path,
                    "sidecarPath": sidecar_relative,
                    "sidecarByteCount": len(payload),
                    "sidecarSha256": sha256_bytes(payload),
                    "frameImportBindingSha256": frame["frameImportBindingSha256"],
                    "importOptions": parsed["importOptions"],
                }
            )
    expected_count = 3 * EXPECTED_RUNTIME_FRAME_COUNT
    if len(frames_evidence) != expected_count or len(seen_paths) != expected_count:
        raise ExportGateError(
            f"canonical import sidecar audit must cover exactly {expected_count} frames"
        )
    aggregate_sha = canonical_json_sha256(frames_evidence)
    return normalize_canonical_json(
        {
            "schemaVersion": 1,
            "contractId": IMPORT_SIDECAR_AUDIT_ID,
            "pixelContractId": PIXEL_CONTRACT_ID,
            "importOracleSha256": oracle_sha,
            "godotVersion": PINNED_GODOT_VERSION,
            "godotSourceCommit": PINNED_GODOT_SOURCE_COMMIT,
            "godotExecutableSha256": PINNED_GODOT_EXECUTABLE_SHA256,
            "frameCount": len(frames_evidence),
            "frameBindingAggregateSha256": aggregate_sha,
            "frames": frames_evidence,
        }
    )


def build_export_expectation(
    repo_root: Path = REPO_ROOT,
    *,
    evidence_out: dict[str, Any] | None = None,
) -> dict[str, Any]:
    repo_root = repo_root.resolve()
    registry_path = repo_root / DEFAULT_REGISTRY
    cache_path = repo_root / DEFAULT_RUNTIME_CACHE
    registry_snapshot = _read_canonical_json_snapshot(registry_path)
    cache_snapshot = _read_canonical_json_snapshot(cache_path)
    cache = cache_snapshot["document"]
    report = build_report(
        repo_root,
        registry_snapshot=registry_snapshot,
        runtime_cache_snapshot=cache_snapshot,
    )
    if report.get("status") != "passed":
        raise ExportGateError(
            "source release audit failed before export: "
            + "; ".join(str(error) for error in report.get("errors", []))
        )
    source_audit_report_bytes = render_json(report)
    source_audit_snapshot = {
        "document": report,
        "rawBytes": source_audit_report_bytes,
        "sha256": sha256_bytes(source_audit_report_bytes),
        "byteCount": len(source_audit_report_bytes),
    }
    if registry_path.read_bytes() != registry_snapshot["rawBytes"]:
        raise ExportGateError("release registry changed during source expectation audit")
    if cache_path.read_bytes() != cache_snapshot["rawBytes"]:
        raise ExportGateError("runtime cache changed during source expectation audit")
    import_oracle = godot47_import_oracle()
    import_oracle_sha = canonical_json_sha256(import_oracle)
    forms: list[dict[str, Any]] = []
    for cache_entry in cache.get("entries", []):
        if not isinstance(cache_entry, dict):
            raise ExportGateError("runtime cache contains a non-object entry")
        form_id = str(cache_entry.get("formId", "")).strip()
        pet_root = str(cache_entry.get("petRoot", "")).strip().replace("\\", "/")
        frames: list[dict[str, Any]] = []
        tree_frames: list[dict[str, Any]] = []
        for fact in canonical_frame_facts(form_id, pet_root):
            frame = source_frame_expectation(repo_root, fact, import_oracle_sha)
            frames.append(frame)
            tree_frames.append(
                {
                    "path": fact["resourcePath"],
                    "sourceFileSha256": frame["sourceFileSha256"],
                    "sourceRgba8Sha256": frame["sourceRgba8Sha256"],
                    "importOracleSha256": frame["importOracleSha256"],
                    "importOptions": frame["importOptions"],
                    "expectedImportedRgba8RawSha256": frame[
                        "expectedImportedRgba8RawSha256"
                    ],
                    "expectedImportedPixelContractSha256": frame[
                        "expectedImportedPixelContractSha256"
                    ],
                    "frameImportBindingSha256": frame[
                        "frameImportBindingSha256"
                    ],
                }
            )
        if len(frames) != EXPECTED_RUNTIME_FRAME_COUNT:
            raise ExportGateError(f"source expectation is not 180 frames: {form_id}")
        source_tree_sha = source_runtime_tree_sha256(form_id, pet_root, frames)
        if not canonical_json_equal(
            source_tree_sha,
            cache_entry.get("battleRuntimeTreeSha256"),
        ):
            raise ExportGateError(
                f"source PNG tree changed after source audit: {form_id}"
            )
        pixel_tree = {
            "contractId": PIXEL_CONTRACT_ID,
            "formId": form_id,
            "petRoot": pet_root,
            "frames": tree_frames,
        }
        forms.append(
            {
                "formId": form_id,
                "petRoot": pet_root,
                "releaseMode": cache_entry.get("releaseMode"),
                "formalRelease": cache_entry.get("formalRelease"),
                "normalBattleActionIds": cache_entry.get("normalBattleActionIds"),
                "sourceRuntimeTreeSha256": cache_entry.get("battleRuntimeTreeSha256"),
                "sourceRuntimeFrameCount": cache_entry.get("sourceRuntimeFrameCount"),
                "expectedFrameCount": EXPECTED_RUNTIME_FRAME_COUNT,
                "expectedImportedPixelTreeSha256": canonical_json_sha256(pixel_tree),
                "frames": frames,
            }
        )
    if registry_path.read_bytes() != registry_snapshot["rawBytes"]:
        raise ExportGateError("release registry changed while building source expectation")
    if cache_path.read_bytes() != cache_snapshot["rawBytes"]:
        raise ExportGateError("runtime cache changed while building source expectation")
    expectation = {
        "schemaVersion": 1,
        "expectationId": EXPECTATION_ID,
        "contractId": EXPECTATION_CONTRACT_ID,
        "canonicalJsonContractId": CANONICAL_JSON_CONTRACT_ID,
        "pixelContractId": PIXEL_CONTRACT_ID,
        "importOracle": import_oracle,
        "importOracleSha256": import_oracle_sha,
        "registrySha256": registry_snapshot["sha256"],
        "runtimeCacheSha256": cache_snapshot["sha256"],
        "releaseSubjectSha256": cache.get("releaseSubjectSha256", ""),
        "sourceAuditReportSha256": source_audit_snapshot["sha256"],
        "forms": forms,
    }
    try:
        expectation = normalize_canonical_json(expectation)
    except CanonicalJsonError as exc:
        raise ExportGateError(f"export expectation violates canonical v2: {exc}") from exc
    validation_errors = validate_expectation_document(
        expectation,
        registry_snapshot["sha256"],
        cache,
        cache_snapshot["sha256"],
        source_audit_snapshot=source_audit_snapshot,
    )
    if validation_errors:
        raise ExportGateError(
            "generated export expectation failed its full validator: "
            + "; ".join(validation_errors)
        )
    if evidence_out is not None:
        evidence_out.clear()
        evidence_out.update(
            {
                "sourceAuditSnapshot": source_audit_snapshot,
                "registrySnapshotSha256": registry_snapshot["sha256"],
                "runtimeCacheSnapshotSha256": cache_snapshot["sha256"],
            }
        )
    return expectation


def validate_external_expectation_path(
    value: str | Path,
    repo_root: Path,
    *,
    additional_forbidden_roots: Iterable[Path] = (),
) -> Path:
    raw = str(value).strip().replace("\\", "/")
    if not raw or raw.startswith("res://") or raw.startswith("user://"):
        raise ExportGateError("export expectation path must be an external absolute filesystem path")
    path = Path(raw).expanduser()
    if not path.is_absolute():
        raise ExportGateError("export expectation path must be absolute")
    if path.is_symlink():
        raise ExportGateError("export expectation path may not be a symlink")
    resolved = path.resolve()
    forbidden = [repo_root.resolve(), *(root.resolve() for root in additional_forbidden_roots)]
    for root in forbidden:
        try:
            resolved.relative_to(root)
        except ValueError:
            continue
        raise ExportGateError(f"export expectation path must be outside forbidden root: {root}")
    return resolved


def read_external_expectation_snapshot(
    path: Path,
    expected_sha256: str,
) -> dict[str, Any]:
    """Read expectation bytes exactly once, bind their SHA, then parse those bytes."""

    normalized_sha = expected_sha256.strip().lower()
    if not re.fullmatch(r"[0-9a-f]{64}", normalized_sha):
        raise ExportGateError("export expectation expected SHA-256 is missing or invalid")
    if path.is_symlink():
        raise ExportGateError("external export expectation may not be a symlink")
    try:
        payload = path.read_bytes()
    except OSError as exc:
        raise ExportGateError(f"cannot read external export expectation: {exc}") from exc
    actual_sha = sha256_bytes(payload)
    if actual_sha != normalized_sha:
        raise ExportGateError("external export expectation SHA-256 does not match environment binding")
    try:
        parsed = json.loads(
            payload.decode("utf-8"),
            object_pairs_hook=_json_object_without_duplicate_keys,
            parse_constant=_reject_non_json_constant,
            parse_int=_parse_canonical_json_integer,
            parse_float=_parse_canonical_json_decimal,
        )
        document = normalize_canonical_json(parsed)
    except (
        UnicodeDecodeError,
        json.JSONDecodeError,
        CanonicalJsonError,
        ExportGateError,
    ) as exc:
        raise ExportGateError(f"external export expectation is not UTF-8 JSON: {exc}") from exc
    if not isinstance(document, dict):
        raise ExportGateError("external export expectation root must be an object")
    return {
        "document": document,
        "sha256": actual_sha,
        "byteCount": len(payload),
    }


def validate_expectation_document(
    expectation: dict[str, Any],
    registry_sha256: str,
    runtime_cache: dict[str, Any],
    runtime_cache_sha256: str,
    *,
    source_audit_snapshot: dict[str, Any] | None,
) -> list[str]:
    errors: list[str] = []
    if set(expectation) != EXPECTATION_ROOT_KEYS:
        errors.append("expectation root keys mismatch")
    if not canonical_json_equal(expectation.get("schemaVersion"), 1):
        errors.append("expectation schemaVersion mismatch")
    if expectation.get("expectationId") != EXPECTATION_ID:
        errors.append("expectationId mismatch")
    if expectation.get("contractId") != EXPECTATION_CONTRACT_ID:
        errors.append("expectation contractId mismatch")
    if expectation.get("canonicalJsonContractId") != CANONICAL_JSON_CONTRACT_ID:
        errors.append("canonical JSON contract mismatch")
    if expectation.get("pixelContractId") != PIXEL_CONTRACT_ID:
        errors.append("pixel contract mismatch")
    import_oracle = expectation.get("importOracle")
    import_oracle_sha = str(expectation.get("importOracleSha256", ""))
    if not isinstance(import_oracle, dict) or not canonical_json_equal(
        import_oracle, godot47_import_oracle()
    ):
        errors.append("expectation Godot 4.7 import oracle mismatch")
    if (
        not re.fullmatch(r"[0-9a-f]{64}", import_oracle_sha)
        or not isinstance(import_oracle, dict)
        or import_oracle_sha != canonical_json_sha256(import_oracle)
    ):
        errors.append("expectation import oracle SHA-256 mismatch")
    if expectation.get("registrySha256") != registry_sha256:
        errors.append("expectation registry SHA-256 mismatch")
    if expectation.get("runtimeCacheSha256") != runtime_cache_sha256:
        errors.append("expectation runtime-cache SHA-256 mismatch")
    source_audit_sha = str(expectation.get("sourceAuditReportSha256", ""))
    if source_audit_snapshot is None:
        errors.append("expectation source-audit snapshot is required")
    else:
        source_audit_document = source_audit_snapshot.get("document")
        source_audit_raw = source_audit_snapshot.get("rawBytes")
        source_audit_snapshot_sha = source_audit_snapshot.get("sha256")
        source_audit_byte_count = source_audit_snapshot.get("byteCount")
        if set(source_audit_snapshot) != {
            "document",
            "rawBytes",
            "sha256",
            "byteCount",
        }:
            errors.append("expectation source-audit snapshot keys mismatch")
        if not isinstance(source_audit_document, dict):
            errors.append("expectation source-audit document is not an object")
        if not isinstance(source_audit_raw, bytes):
            errors.append("expectation source-audit raw bytes are missing")
        elif (
            source_audit_byte_count != len(source_audit_raw)
            or source_audit_snapshot_sha != sha256_bytes(source_audit_raw)
            or source_audit_sha != source_audit_snapshot_sha
        ):
            errors.append("expectation source-audit raw snapshot SHA-256 mismatch")
        else:
            try:
                parsed_source_audit = normalize_canonical_json(
                    json.loads(
                        source_audit_raw.decode("utf-8"),
                        object_pairs_hook=_json_object_without_duplicate_keys,
                        parse_constant=_reject_non_json_constant,
                        parse_int=_parse_canonical_json_integer,
                        parse_float=_parse_canonical_json_decimal,
                    )
                )
            except (
                UnicodeDecodeError,
                json.JSONDecodeError,
                CanonicalJsonError,
                ExportGateError,
            ):
                parsed_source_audit = None
            if (
                not isinstance(parsed_source_audit, dict)
                or not canonical_json_equal(
                    parsed_source_audit, source_audit_document
                )
            ):
                errors.append("expectation source-audit raw/document snapshot mismatch")
        if isinstance(source_audit_document, dict):
            if set(source_audit_document) != SOURCE_AUDIT_REPORT_KEYS:
                errors.append("expectation source-audit report keys mismatch")
            expected_source_audit_facts = {
                "schemaVersion": 1,
                "reportType": "beastbound_pet_battle_exact_form_release_coverage",
                "scope": "standalone_pet_battle",
                "catalogFormCount": 36,
                "formalWildTrainingFormCount": 13,
                "formalReleaseCount": 2,
                "legacyCompatibilityExceptionCount": 1,
                "runtimeCandidateCount": 3,
                "proceduralPlaceholderCount": 33,
                "status": "passed",
                "errors": [],
            }
            for key, expected in expected_source_audit_facts.items():
                if not canonical_json_equal(
                    source_audit_document.get(key), expected
                ):
                    errors.append(
                        f"expectation source-audit fact mismatch: {key}"
                    )
            source_audit_runtime_cache = source_audit_document.get("runtimeCache")
            if not isinstance(source_audit_runtime_cache, dict):
                errors.append("expectation source-audit runtimeCache is not an object")
            elif (
                not canonical_json_equal(
                    source_audit_runtime_cache.get("sha256"), runtime_cache_sha256
                )
                or not canonical_json_equal(
                    source_audit_runtime_cache.get("releaseSubjectSha256"),
                    runtime_cache.get("releaseSubjectSha256"),
                )
                or not canonical_json_equal(
                    source_audit_runtime_cache.get("entryCount"), 3
                )
                or source_audit_runtime_cache.get("ok") is not True
                or source_audit_runtime_cache.get("errors") != []
            ):
                errors.append("expectation source-audit runtimeCache binding mismatch")
    if not canonical_json_equal(
        expectation.get("releaseSubjectSha256"),
        runtime_cache.get("releaseSubjectSha256"),
    ):
        errors.append("expectation release-subject SHA-256 mismatch")
    cache_entries = {
        entry.get("formId"): entry
        for entry in runtime_cache.get("entries", [])
        if isinstance(entry, dict)
    }
    forms = expectation.get("forms") if isinstance(expectation.get("forms"), list) else []
    if not isinstance(expectation.get("forms"), list) or any(
        not isinstance(form, dict) for form in forms
    ):
        errors.append("expectation forms may only contain objects")
    form_ids = [form.get("formId") for form in forms if isinstance(form, dict)]
    if len(form_ids) != len(set(form_ids)) or set(form_ids) != set(cache_entries):
        errors.append("expectation exact-form set differs from runtime cache")
    for form in forms:
        if not isinstance(form, dict):
            errors.append("expectation forms may only contain objects")
            continue
        form_id = form.get("formId")
        if set(form) != EXPECTATION_FORM_KEYS:
            errors.append(f"expectation form keys mismatch: {form_id}")
        cache_entry = cache_entries.get(form_id, {})
        expected_paths = [
            fact["resourcePath"]
            for fact in canonical_frame_facts(str(form_id), str(cache_entry.get("petRoot", "")))
        ]
        frames = form.get("frames") if isinstance(form.get("frames"), list) else []
        actual_paths = [frame.get("path") for frame in frames if isinstance(frame, dict)]
        if len(frames) != EXPECTED_RUNTIME_FRAME_COUNT or actual_paths != expected_paths:
            errors.append(f"expectation frames are not the ordered exact 180 paths: {form_id}")
        tree_frames: list[dict[str, Any]] = []
        expected_facts = list(
            canonical_frame_facts(str(form_id), str(cache_entry.get("petRoot", "")))
        )
        for index, frame in enumerate(frames):
            if not isinstance(frame, dict):
                errors.append(f"expectation frame is not an object: {form_id}/{index}")
                continue
            if set(frame) != EXPECTATION_FRAME_KEYS:
                errors.append(f"expectation frame keys mismatch: {form_id}/{index}")
            if index < len(expected_facts):
                fact = expected_facts[index]
                if (
                    not canonical_json_equal(frame.get("view"), fact["view"])
                    or not canonical_json_equal(frame.get("action"), fact["action"])
                    or not canonical_json_equal(
                        frame.get("frameIndex"), fact["frameIndex"]
                    )
                    or not canonical_json_equal(
                        frame.get("sourceRepoPath"), fact["repoPath"]
                    )
                    or not canonical_json_equal(
                        frame.get("path"), fact["resourcePath"]
                    )
                ):
                    errors.append(f"expectation frame identity mismatch: {form_id}/{index}")
            if not canonical_json_equal(
                frame.get("width"), 256
            ) or not canonical_json_equal(frame.get("height"), 256):
                errors.append(f"expectation frame dimensions mismatch: {form_id}/{index}")
            for digest_key in (
                "sourceFileSha256",
                "sourceRgba8Sha256",
                "importOracleSha256",
                "expectedImportedRgba8RawSha256",
                "expectedImportedPixelContractSha256",
                "frameImportBindingSha256",
            ):
                if not re.fullmatch(r"[0-9a-f]{64}", str(frame.get(digest_key, ""))):
                    errors.append(f"expectation frame {digest_key} invalid: {form_id}/{index}")
            if (
                not canonical_json_equal(frame.get("sourceRgba8ByteCount"), 256 * 256 * 4)
                or not canonical_json_equal(
                    frame.get("expectedImportedRgba8ByteCount"), 256 * 256 * 4
                )
            ):
                errors.append(f"expectation frame RGBA8 byte count mismatch: {form_id}/{index}")
            if not canonical_json_equal(
                frame.get("importOptions"), expected_import_options()
            ):
                errors.append(f"expectation frame import options mismatch: {form_id}/{index}")
            if frame.get("importOracleSha256") != import_oracle_sha:
                errors.append(f"expectation frame import oracle mismatch: {form_id}/{index}")
            try:
                expected_frame_binding_sha = canonical_json_sha256(
                    frame_import_binding_document(frame)
                )
            except CanonicalJsonError:
                expected_frame_binding_sha = ""
            if frame.get("frameImportBindingSha256") != expected_frame_binding_sha:
                errors.append(f"expectation frame import binding mismatch: {form_id}/{index}")
            tree_frames.append(
                {
                    "path": str(frame.get("path", "")),
                    "sourceFileSha256": str(frame.get("sourceFileSha256", "")),
                    "sourceRgba8Sha256": str(frame.get("sourceRgba8Sha256", "")),
                    "importOracleSha256": str(frame.get("importOracleSha256", "")),
                    "importOptions": frame.get("importOptions"),
                    "expectedImportedRgba8RawSha256": str(
                        frame.get("expectedImportedRgba8RawSha256", "")
                    ),
                    "expectedImportedPixelContractSha256": str(
                        frame.get("expectedImportedPixelContractSha256", "")
                    ),
                    "frameImportBindingSha256": str(
                        frame.get("frameImportBindingSha256", "")
                    ),
                }
            )
        expected_pixel_tree_sha = canonical_json_sha256(
            {
                "contractId": PIXEL_CONTRACT_ID,
                "formId": form_id,
                "petRoot": cache_entry.get("petRoot", ""),
                "frames": tree_frames,
            }
        )
        if form.get("expectedImportedPixelTreeSha256") != expected_pixel_tree_sha:
            errors.append(f"expectation imported pixel tree SHA-256 mismatch: {form_id}")
        try:
            expected_runtime_tree_sha = source_runtime_tree_sha256(
                str(form_id),
                str(cache_entry.get("petRoot", "")),
                frames,
            )
        except ExportGateError:
            expected_runtime_tree_sha = ""
        if form.get("sourceRuntimeTreeSha256") != expected_runtime_tree_sha:
            errors.append(f"expectation source runtime tree SHA-256 mismatch: {form_id}")
        for key, cache_key in (
            ("petRoot", "petRoot"),
            ("releaseMode", "releaseMode"),
            ("formalRelease", "formalRelease"),
            ("normalBattleActionIds", "normalBattleActionIds"),
            ("sourceRuntimeTreeSha256", "battleRuntimeTreeSha256"),
            ("sourceRuntimeFrameCount", "sourceRuntimeFrameCount"),
        ):
            if not canonical_json_equal(form.get(key), cache_entry.get(cache_key)):
                errors.append(f"expectation/cache binding mismatch: {form_id}/{key}")
        if not canonical_json_equal(
            form.get("expectedFrameCount"), EXPECTED_RUNTIME_FRAME_COUNT
        ):
            errors.append(f"expectation expectedFrameCount mismatch: {form_id}")
    return list(dict.fromkeys(errors))


def assert_pck_unchanged(before_sha256: str, after_sha256: str) -> None:
    if before_sha256 != after_sha256:
        raise ExportGateError("PCK SHA-256 changed during QA")


def extract_godot_result(log_text: str) -> dict[str, Any]:
    return _extract_authoritative_json_object(
        log_text,
        RESULT_PREFIX,
        "pet action result",
    )


def validate_pck_result(
    result: dict[str, Any],
    form_expectation: dict[str, Any],
    expectation_sha256: str,
    *,
    release_expectation: dict[str, Any],
    expected_user_root: Path,
    expected_working_dir: Path,
    expected_repo_root: Path,
    expected_repo_root_sha256: str,
) -> list[str]:
    form_id = form_expectation.get("formId")
    errors: list[str] = []
    if set(result) != PCK_QA_RESULT_KEYS:
        errors.append(f"PCK QA result keys mismatch: {form_id}")
    form_frames = form_expectation.get("frames")
    expected_import_oracle_sha = (
        form_frames[0].get("importOracleSha256")
        if isinstance(form_frames, list)
        and form_frames
        and isinstance(form_frames[0], dict)
        else ""
    )
    expected_equal = {
        "ok": True,
        "formId": form_id,
        "canonicalJsonContractId": CANONICAL_JSON_CONTRACT_ID,
        "exportExpectationId": EXPECTATION_ID,
        "exportExpectationContractId": EXPECTATION_CONTRACT_ID,
        "pixelContractId": PIXEL_CONTRACT_ID,
        "importOracleContractId": IMPORT_ORACLE_ID,
        "importOracleSha256": expected_import_oracle_sha,
        "sourceAuditReportSha256": release_expectation.get(
            "sourceAuditReportSha256"
        ),
        "expectedGodotVersion": PINNED_GODOT_VERSION,
        "expectedGodotSourceCommit": PINNED_GODOT_SOURCE_COMMIT,
        "expectedGodotExecutableSha256": PINNED_GODOT_EXECUTABLE_SHA256,
        "actualGodotVersion": PINNED_GODOT_VERSION,
        "actualGodotSourceCommit": PINNED_GODOT_SOURCE_COMMIT,
        "importFixAlphaBorder": True,
        "importPremultAlpha": False,
        "exportExpectationMode": True,
        "exportExpectationPathAbsolute": True,
        "exportExpectationExpectedSha256": expectation_sha256,
        "exportExpectationSha256": expectation_sha256,
        "exportTextureFrameCount": EXPECTED_RUNTIME_FRAME_COUNT,
        "exportTextureExpectedFrameCount": EXPECTED_RUNTIME_FRAME_COUNT,
        "exportTextureTreeSha256": form_expectation.get(
            "expectedImportedPixelTreeSha256"
        ),
        "exportExpectedImportedPixelTreeSha256": form_expectation.get(
            "expectedImportedPixelTreeSha256"
        ),
        "battleFrameCount": EXPECTED_RUNTIME_FRAME_COUNT,
        "battleViews": len(FORMAL_VIEWS),
        "battleActions": len(FORMAL_ACTIONS),
        "battleReleaseMode": form_expectation.get("releaseMode"),
        "battleReleaseFormal": form_expectation.get("formalRelease"),
        "battleNormalRuntimeSupported": True,
        "battleNormalRuntimeWarmed": True,
        "battleNormalRuntimeTextureLoaded": True,
        "battleQaPreviewDisabledBefore": True,
        "battleQaPreviewDisabledAfter": True,
        "battleRuntimeTreeFrameCount": EXPECTED_RUNTIME_FRAME_COUNT,
        "battleRuntimeTreeSha256": form_expectation.get("sourceRuntimeTreeSha256"),
        "battleRuntimeTreeVerificationUsec": 0,
        "pckProfileSaveEnabled": False,
        "pckServerAccountSession": False,
        "pckAuthAutoBypass": True,
        "exportResourceRoot": "",
        "pckResourceRoot": "",
        "exportRepoRootSha256": expected_repo_root_sha256,
        "pckRepoRootSha256": expected_repo_root_sha256,
    }
    for key, expected in expected_equal.items():
        if not canonical_json_equal(result.get(key), expected):
            errors.append(f"PCK QA result mismatch: {form_id}/{key}")
    if result.get("errors") != []:
        errors.append(f"PCK QA result contains errors: {form_id}")
    formal_ids = sorted(
        str(form.get("formId", ""))
        for form in release_expectation.get("forms", [])
        if isinstance(form, dict) and form.get("formalRelease") is True
    )
    legacy_ids = sorted(
        str(form.get("formId", ""))
        for form in release_expectation.get("forms", [])
        if isinstance(form, dict) and form.get("formalRelease") is False
    )
    expected_release_summary = {
        "ok": True,
        "state": "READY",
        "registryId": RELEASE_REGISTRY_ID,
        "runtimeCacheId": RUNTIME_CACHE_ID,
        "registryRawSha256": release_expectation.get("registrySha256"),
        "runtimeCacheRawSha256": release_expectation.get("runtimeCacheSha256"),
        "releaseSubjectSha256": release_expectation.get("releaseSubjectSha256"),
        "formalFormIds": formal_ids,
        "legacyCompatibilityFormIds": legacy_ids,
        "errors": [],
    }
    observed_release_summary = result.get("battleReleaseRegistry")
    if (
        not isinstance(observed_release_summary, dict)
        or set(observed_release_summary) != PCK_RELEASE_SUMMARY_KEYS
        or not canonical_json_equal(observed_release_summary, expected_release_summary)
    ):
        errors.append(f"PCK QA release summary mismatch: {form_id}")
    expected_paths = {
        "exportUserRoot": expected_user_root.resolve(),
        "exportWorkingDir": expected_working_dir.resolve(),
        "exportRepoRoot": expected_repo_root.resolve(),
        "pckUserRoot": expected_user_root.resolve(),
        "pckWorkingDir": expected_working_dir.resolve(),
        "pckRepoRoot": expected_repo_root.resolve(),
    }
    for key, expected in expected_paths.items():
        raw = result.get(key)
        if (
            type(raw) is not str
            or raw != raw.strip()
            or not raw
            or not Path(raw).is_absolute()
            or Path(raw).resolve() != expected
        ):
            errors.append(f"PCK QA result mismatch: {form_id}/{key}")
    return errors


def scan_log_errors(log_text: str) -> list[str]:
    lines = _strict_raw_output_lines(log_text, "Godot engine/stdout log")
    patterns = (
        r"(?im)^\s*(?:SCRIPT ERROR|ERROR|FATAL):",
        r"(?im)parse error",
        r"(?im)instances? leaked",
        r"(?im)resources? still in use at exit",
        r"(?im)orphan(?:ed)? (?:node|process)",
        r"(?im)sandbox(?:-exec)?:.*(?:deny|violation)",
        r"(?im)operation not permitted",
    )
    findings: list[str] = []
    for raw_line in lines:
        line = re.sub(r"\x1b\[[0-9;]*[A-Za-z]", "", raw_line)
        if any(re.search(pattern, line) for pattern in patterns):
            findings.append(line.strip())
    return list(dict.fromkeys(findings))


def git_status_entries(repo_root: Path) -> list[dict[str, str]]:
    completed = _run_subprocess(
        ["git", "status", "--porcelain=v1", "-z", "--untracked-files=all"],
        cwd=repo_root,
        timeout_seconds=GIT_COMMAND_TIMEOUT_SECONDS,
        check=True,
        stdout=subprocess.PIPE,
    )
    entries = completed.stdout.split(b"\0")
    result: list[dict[str, str]] = []
    index = 0
    while index < len(entries):
        entry = entries[index]
        index += 1
        if not entry:
            continue
        text = entry.decode("utf-8", errors="strict")
        status = text[:2]
        path = text[3:]
        if status[0] in "RC" or status[1] in "RC":
            if index >= len(entries):
                raise ExportGateError("malformed git porcelain rename entry")
            path = entries[index].decode("utf-8", errors="strict")
            index += 1
        result.append({"status": status, "path": path})
    return sorted(result, key=lambda entry: (entry["path"], entry["status"]))


def changed_paths(repo_root: Path) -> list[str]:
    return sorted({entry["path"] for entry in git_status_entries(repo_root)})


def _is_generated_sidecar_path(path: str) -> bool:
    normalized = path.replace("\\", "/")
    return (
        normalized.startswith("client/godot/")
        and (normalized.endswith(".import") or normalized.endswith(".uid"))
        and not Path(normalized).is_absolute()
        and ".." not in Path(normalized).parts
    )


def status_scope_report(
    repo_root: Path,
    entries: list[dict[str, str]],
    *,
    allowlist: Iterable[str] = PHASE404_PATH_ALLOWLIST,
    allow_generated_sidecars: bool = False,
) -> dict[str, Any]:
    repo_root = repo_root.resolve()
    allowed = set(allowlist)
    errors: list[str] = []
    product_paths: set[str] = set()
    generated_entries: list[dict[str, Any]] = []
    for entry in entries:
        status = str(entry.get("status", ""))
        path = str(entry.get("path", "")).replace("\\", "/")
        staged = len(status) == 2 and status != "??" and status[0] != " "
        generated_sidecar = status == "??" and _is_generated_sidecar_path(path)
        if generated_sidecar and allow_generated_sidecars:
            candidate = (repo_root / path).resolve()
            try:
                candidate.relative_to(repo_root)
            except ValueError:
                errors.append(f"generated sidecar escapes repository: {path}")
                continue
            if not candidate.is_file() or candidate.is_symlink():
                errors.append(f"generated sidecar is missing or unsafe: {path}")
                continue
            payload = candidate.read_bytes()
            generated_entries.append(
                {
                    "path": path,
                    "sha256": sha256_bytes(payload),
                    "size": len(payload),
                }
            )
            continue
        product_paths.add(path)
        if staged:
            errors.append(f"Phase404 export gate forbids staged changes: {path} ({status})")
        if _is_generated_sidecar_path(path):
            errors.append(
                f"generated sidecar must be untracked and unstaged (??): {path} ({status})"
            )
        elif path not in allowed:
            errors.append(f"working tree changed outside Phase404 allowlist: {path}")
    missing = sorted(allowed - product_paths)
    if missing:
        errors.append("Phase404 product patch is missing allowlisted paths: " + ", ".join(missing))
    generated_entries.sort(key=lambda value: value["path"])
    return {
        "ok": not errors,
        "productPathCount": len(product_paths),
        "productPaths": sorted(product_paths),
        "generatedSidecarCount": len(generated_entries),
        "generatedSidecarAggregateSha256": canonical_json_sha256(generated_entries),
        "generatedSidecars": generated_entries,
        "errors": list(dict.fromkeys(errors)),
    }


def assert_exact_allowlist(
    repo_root: Path,
    *,
    allow_generated_sidecars: bool = False,
) -> dict[str, Any]:
    report = status_scope_report(
        repo_root,
        git_status_entries(repo_root),
        allow_generated_sidecars=allow_generated_sidecars,
    )
    if not report["ok"]:
        raise ExportGateError("; ".join(report["errors"]))
    return report


def git_patch_bytes(repo_root: Path) -> bytes:
    tracked = _run_subprocess(
        ["git", "ls-files", "-z", "--", *PHASE404_PATH_ALLOWLIST],
        cwd=repo_root,
        timeout_seconds=GIT_COMMAND_TIMEOUT_SECONDS,
        check=True,
        stdout=subprocess.PIPE,
    ).stdout.split(b"\0")
    tracked_paths = {value.decode("utf-8") for value in tracked if value}
    output = bytearray(b"beastbound-phase404-git-patch-v1\0")
    if tracked_paths:
        diff = _run_subprocess(
            ["git", "diff", "--binary", "--no-ext-diff", "HEAD", "--", *sorted(tracked_paths)],
            cwd=repo_root,
            timeout_seconds=GIT_COMMAND_TIMEOUT_SECONDS,
            check=True,
            stdout=subprocess.PIPE,
        ).stdout
        output.extend(b"tracked\0")
        output.extend(diff)
    for relative in PHASE404_PATH_ALLOWLIST:
        if relative in tracked_paths:
            continue
        path = repo_root / relative
        if not path.is_file():
            output.extend(f"absent\0{relative}\0".encode("utf-8"))
            continue
        completed = _run_subprocess(
            ["git", "diff", "--binary", "--no-index", "--", "/dev/null", relative],
            cwd=repo_root,
            timeout_seconds=GIT_COMMAND_TIMEOUT_SECONDS,
            check=False,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        if completed.returncode not in (0, 1):
            raise ExportGateError(
                f"cannot render untracked git patch for {relative}: "
                + completed.stderr.decode("utf-8", errors="replace")
            )
        output.extend(f"untracked\0{relative}\0".encode("utf-8"))
        output.extend(completed.stdout)
    return bytes(output)


def build_final_release_attestation(
    *,
    expectation_sha256: str,
    source_audit_report_sha256: str,
    import_oracle_sha256: str,
    import_sidecar_audit_sha256: str,
    import_sidecar_audit_aggregate_sha256: str,
    import_sidecar_audit_evidence_aggregate_sha256: str,
    import_sidecar_audit_frame_count: int,
    registry_sha256: str,
    runtime_cache_sha256: str,
    pck_before_sha256: str,
    pck_after_sha256: str,
    git_patch_sha256: str,
    export_preset_name: str,
    export_preset_sha256: str,
    godot_version: str,
    godot_executable_sha256: str,
    pck_qa_godot_executable_sha256: str,
    sandbox_executable_sha256: str,
    sandbox_touch_executable_sha256: str,
    sandbox_profile_sha256: str,
    sandbox_canary_report_sha256: str,
    sandbox_command_aggregate_sha256: str,
    godot_command_aggregate_sha256: str,
    repo_root_binding_sha256: str,
    pck_working_directory: str,
    real_user_root_run_inventory_pairs: list[dict[str, Any]],
    real_user_root_inventory_before_sha256: str,
    real_user_root_inventory_after_sha256: str,
    pck_engine_log_aggregate_sha256: str,
    temporary_roots_cleaned: bool,
    qa_lane_evidence: dict[str, Any],
    qa_report_sha256: str,
    qa_form_ids: list[str],
    qa_passed: bool,
) -> dict[str, Any]:
    if qa_passed is not True:
        raise ExportGateError("final release attestation is forbidden when PCK QA failed")
    if temporary_roots_cleaned is not True:
        raise ExportGateError(
            "final release attestation is forbidden before temporary PCK roots are cleaned"
        )
    if real_user_root_inventory_before_sha256 != real_user_root_inventory_after_sha256:
        raise ExportGateError(
            "final release attestation is forbidden after real user:// drift"
        )
    if godot_executable_sha256 != pck_qa_godot_executable_sha256:
        raise ExportGateError(
            "final release attestation is forbidden after pinned Godot drift"
        )
    if (
        godot_executable_sha256 != PINNED_GODOT_EXECUTABLE_SHA256
        or import_oracle_sha256 != godot47_import_oracle_sha256()
    ):
        raise ExportGateError(
            "final release attestation requires the exact Godot 4.7 import oracle"
        )
    if type(import_sidecar_audit_frame_count) is not int or import_sidecar_audit_frame_count != 540:
        raise ExportGateError(
            "final release attestation requires all 540 canonical import sidecars"
        )
    normalized_preset_name = export_preset_name.strip()
    normalized_godot_version = godot_version.strip()
    if not normalized_preset_name:
        raise ExportGateError("final release attestation requires an export preset name")
    if normalized_godot_version != PINNED_GODOT_VERSION:
        raise ExportGateError("final release attestation requires exact pinned Godot evidence")
    if (
        not isinstance(pck_working_directory, str)
        or not Path(pck_working_directory).is_absolute()
    ):
        raise ExportGateError("final release attestation requires an absolute PCK workingDir")
    normalized_working_directory = str(Path(pck_working_directory).resolve())
    expected_inventory_labels = list(EXPECTED_GODOT_PHASE_LABELS)
    if (
        not isinstance(real_user_root_run_inventory_pairs, list)
        or len(real_user_root_run_inventory_pairs) != len(expected_inventory_labels)
    ):
        raise ExportGateError("final release attestation requires nine Godot user-root inventory pairs")
    for index, pair in enumerate(real_user_root_run_inventory_pairs):
        if not isinstance(pair, dict) or pair.get("label") != expected_inventory_labels[index]:
            raise ExportGateError("final release attestation user-root inventory labels drifted")
        if pair.get("unchanged") is not True:
            raise ExportGateError("final release attestation requires unchanged user-root pairs")
        for key in (
            "beforeTreeSha256",
            "afterTreeSha256",
            "beforeReportSha256",
            "afterReportSha256",
        ):
            value = pair.get(key)
            if not isinstance(value, str) or not re.fullmatch(r"[0-9a-f]{64}", value):
                raise ExportGateError(
                    f"final release attestation has invalid user-root pair {key}"
                )
        if (
            pair["beforeTreeSha256"] != pair["afterTreeSha256"]
            or pair["beforeReportSha256"] != pair["afterReportSha256"]
            or pair["beforeTreeSha256"] != real_user_root_inventory_before_sha256
        ):
            raise ExportGateError("final release attestation detected user-root inventory drift")
    assert_pck_unchanged(pck_before_sha256, pck_after_sha256)
    qa_lane_lifecycle_sha256 = validate_qa_lane_release_evidence(qa_lane_evidence)
    inventory_pair_aggregate_sha256 = canonical_json_sha256(
        real_user_root_run_inventory_pairs
    )
    working_directory_sha256 = sha256_bytes(
        f"{PCK_WORKING_DIRECTORY_CONTRACT_ID}\n{normalized_working_directory}".encode(
            "utf-8"
        )
    )
    required_hashes = {
        "expectationSha256": expectation_sha256,
        "sourceAuditReportSha256": source_audit_report_sha256,
        "importOracleSha256": import_oracle_sha256,
        "importSidecarAuditSha256": import_sidecar_audit_sha256,
        "importSidecarAuditAggregateSha256": import_sidecar_audit_aggregate_sha256,
        "importSidecarAuditEvidenceAggregateSha256": (
            import_sidecar_audit_evidence_aggregate_sha256
        ),
        "registrySha256": registry_sha256,
        "runtimeCacheSha256": runtime_cache_sha256,
        "pckSha256": pck_before_sha256,
        "gitPatchSha256": git_patch_sha256,
        "exportPresetSha256": export_preset_sha256,
        "godotExecutableSha256": godot_executable_sha256,
        "pckQaGodotExecutableSha256": pck_qa_godot_executable_sha256,
        "sandboxExecutableSha256": sandbox_executable_sha256,
        "sandboxTouchExecutableSha256": sandbox_touch_executable_sha256,
        "sandboxProfileSha256": sandbox_profile_sha256,
        "sandboxCanaryReportSha256": sandbox_canary_report_sha256,
        "sandboxCommandAggregateSha256": sandbox_command_aggregate_sha256,
        "godotCommandAggregateSha256": godot_command_aggregate_sha256,
        "repoRootBindingSha256": repo_root_binding_sha256,
        "pckWorkingDirectorySha256": working_directory_sha256,
        "realUserRootRunInventoryAggregateSha256": inventory_pair_aggregate_sha256,
        "realUserRootInventoryBeforeSha256": real_user_root_inventory_before_sha256,
        "realUserRootInventoryAfterSha256": real_user_root_inventory_after_sha256,
        "pckEngineLogAggregateSha256": pck_engine_log_aggregate_sha256,
        "qaReportSha256": qa_report_sha256,
        "qaLaneLifecycleSha256": qa_lane_lifecycle_sha256,
    }
    for label, value in required_hashes.items():
        if not isinstance(value, str) or not re.fullmatch(r"[0-9a-f]{64}", value):
            raise ExportGateError(f"final release attestation has invalid {label}")
    if (
        not isinstance(qa_form_ids, list)
        or len(qa_form_ids) != 3
        or len(set(qa_form_ids)) != 3
        or any(not isinstance(value, str) or not value.strip() for value in qa_form_ids)
    ):
        raise ExportGateError("final release attestation requires three unique QA form IDs")
    attestation = {
        "schemaVersion": 6,
        "attestationId": FINAL_ATTESTATION_ID,
        "contractId": FINAL_ATTESTATION_CONTRACT_ID,
        "canonicalJsonContractId": CANONICAL_JSON_CONTRACT_ID,
        "pixelContractId": PIXEL_CONTRACT_ID,
        "expectationId": EXPECTATION_ID,
        "expectationContractId": EXPECTATION_CONTRACT_ID,
        "qaReportId": QA_REPORT_ID,
        "qaReportContractId": QA_REPORT_CONTRACT_ID,
        "importOracleContractId": IMPORT_ORACLE_ID,
        "importSidecarAuditContractId": IMPORT_SIDECAR_AUDIT_ID,
        "godotSourceCommit": PINNED_GODOT_SOURCE_COMMIT,
        "importOptions": expected_import_options(),
        "importSidecarAuditFrameCount": import_sidecar_audit_frame_count,
        "importSidecarAuditsStable": True,
        "pckSandboxContractId": PCK_SANDBOX_CONTRACT_ID,
        "repoRootBindingContractId": REPO_ROOT_BINDING_CONTRACT_ID,
        "pckWorkingDirectoryContractId": PCK_WORKING_DIRECTORY_CONTRACT_ID,
        "qaLaneLifecycleContractId": QA_LANE_LIFECYCLE_CONTRACT_ID,
        "attemptId": qa_lane_evidence["attemptId"],
        "temporaryPckRootsCleaned": True,
        "status": "passed",
        **required_hashes,
        "gitPatchContractId": "beastbound-phase404-git-patch-v1",
        "exportPresetName": normalized_preset_name,
        "godotVersion": normalized_godot_version,
        "pckWorkingDirectory": normalized_working_directory,
        "qaLane": QA_LANE,
        "qaLaneFeature": QA_LANE_FEATURE,
        "qaLaneRoot": qa_lane_evidence["qaLaneRoot"],
        "realUserRoot": qa_lane_evidence["realRoot"],
        "qaLaneAbsentAfterCleanup": True,
        "qaLaneLockAbsentAfterCleanup": True,
        "qaLaneVerificationCount": qa_lane_evidence[
            "godotPhaseVerificationCount"
        ] + 1,
        "godotInvocationCount": len(real_user_root_run_inventory_pairs),
        "sandboxedPckRunCount": 4,
        "qaFormIds": qa_form_ids,
    }
    try:
        return normalize_canonical_json(attestation)
    except CanonicalJsonError as exc:
        raise ExportGateError(f"final release attestation violates canonical v2: {exc}") from exc


def write_final_attestation_atomic(
    final_path: Path,
    final_bytes: bytes,
    *,
    qa_report_path: Path,
    qa_report_sha256: str,
    commit_context: dict[str, Any] | None = None,
) -> str:
    """Publish the last pass artifact with one non-rollback committed boundary."""

    if final_path.exists() or final_path.is_symlink():
        final_path.unlink()
    if final_path.exists() or final_path.is_symlink():
        raise ExportGateError("stale final attestation could not be invalidated")
    if (
        qa_report_path.is_symlink()
        or not qa_report_path.is_file()
        or _sha256_file(qa_report_path) != qa_report_sha256
    ):
        raise ExportGateError("PCK QA report changed before final atomic write")
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{final_path.name}.",
        suffix=".tmp",
        dir=final_path.parent,
    )
    temporary_path = Path(temporary_name)
    expected_final_sha256 = sha256_bytes(final_bytes)
    replace_attempted = False
    try:
        handle = os.fdopen(descriptor, "wb")
        descriptor = -1
        with handle:
            handle.write(final_bytes)
            handle.flush()
            os.fsync(handle.fileno())
        if temporary_path.is_symlink() or temporary_path.read_bytes() != final_bytes:
            raise ExportGateError("temporary final attestation changed before atomic replace")
        if (
            qa_report_path.is_symlink()
            or not qa_report_path.is_file()
            or _sha256_file(qa_report_path) != qa_report_sha256
        ):
            raise ExportGateError("PCK QA report changed before final commit")
        if final_path.exists() or final_path.is_symlink():
            raise ExportGateError("final attestation target appeared before commit")
        replace_attempted = True
        os.replace(temporary_path, final_path)
        # A successful replace is the committed boundary.  All validation that
        # can fail has already happened; no post-commit rollback is attempted.
        if commit_context is not None:
            commit_context["committed"] = True
        return expected_final_sha256
    except BaseException:
        if replace_attempted:
            try:
                committed = (
                    not temporary_path.exists()
                    and not temporary_path.is_symlink()
                    and final_path.is_file()
                    and not final_path.is_symlink()
                    and final_path.read_bytes() == final_bytes
                )
            except BaseException:
                committed = False
            if committed:
                if commit_context is not None:
                    commit_context["committed"] = True
                return expected_final_sha256
        raise
    finally:
        if descriptor >= 0:
            os.close(descriptor)
        if temporary_path.exists() or temporary_path.is_symlink():
            try:
                temporary_path.unlink()
            except OSError:
                pass


def _recognized_committed_final_result(
    lifecycle_context: dict[str, Any],
    output_dir: Path,
) -> tuple[str, dict[str, Any] | None]:
    candidate = lifecycle_context.get("finalCommitCandidate")
    if type(candidate) is not dict:
        return "not_committed", None
    committed_hint = candidate.get("committed") is True
    try:
        if set(candidate) != {
            "attemptId", "finalPath", "finalBytes", "finalSha256", "qaReportPath",
            "qaReportBytes", "qaReportSha256", "result", "committed",
        }:
            return ("committed_unverifiable", None) if committed_hint else ("not_committed", None)
        attempt_id = candidate["attemptId"]
        final_path = Path(candidate["finalPath"])
        qa_report_path = Path(candidate["qaReportPath"])
        final_bytes = candidate["finalBytes"]
        qa_report_bytes = candidate["qaReportBytes"]
        result = candidate["result"]
        if (
            type(attempt_id) is not str
            or not re.fullmatch(r"[0-9a-f]{32}", attempt_id)
            or final_path != output_dir / "pet-battle-final-release-attestation.json"
            or qa_report_path != output_dir / "pet-battle-export-qa-report.json"
            or type(final_bytes) is not bytes
            or type(qa_report_bytes) is not bytes
            or type(result) is not dict
            or candidate["finalSha256"] != sha256_bytes(final_bytes)
            or candidate["qaReportSha256"] != sha256_bytes(qa_report_bytes)
            or result.get("finalReleaseAttestationSha256") != candidate["finalSha256"]
            or result.get("finalReleaseAttestation", {}).get("attemptId") != attempt_id
            or result.get("qaReport", {}).get("qaLaneLifecycle", {}).get("attemptId")
            != attempt_id
        ):
            return ("committed_unverifiable", None) if committed_hint else ("not_committed", None)
        if (
            final_path.is_symlink()
            or qa_report_path.is_symlink()
            or not final_path.is_file()
            or not qa_report_path.is_file()
            or final_path.read_bytes() != final_bytes
            or qa_report_path.read_bytes() != qa_report_bytes
        ):
            return ("committed_unverifiable", None) if committed_hint else ("not_committed", None)
        return "committed_exact", result
    except BaseException:
        return ("committed_unverifiable", None) if committed_hint else ("not_committed", None)


def write_export_gate_failure_marker(
    output_dir: Path,
    *,
    attempt_id: str,
    primary: BaseException,
    secondary_errors: list[str],
    qa_lane_disposition: str,
    cleanup_trusted: bool | None,
    preservation_required: bool,
    pass_artifacts_invalidated: bool,
) -> Path:
    """Publish one failed-attempt authority that supersedes pass files in the directory."""

    if not re.fullmatch(r"[0-9a-f]{32}", attempt_id):
        raise ExportGateError("failure marker requires one 32-hex attempt ID")
    if qa_lane_disposition not in {"not_created", "preserved", "cleaned", "unknown"}:
        raise ExportGateError("failure marker QA lane disposition is invalid")
    output_dir.mkdir(parents=True, exist_ok=True)
    marker_path = output_dir / "pet-battle-export-gate-failure.json"
    marker = {
        "schemaVersion": 6,
        "reportId": FAILURE_REPORT_ID,
        "attemptId": attempt_id,
        "status": "failed",
        "supersedesPassArtifactsInDirectory": True,
        "passArtifactsInvalidated": pass_artifacts_invalidated,
        "qaLaneDisposition": qa_lane_disposition,
        "qaLanePreserved": qa_lane_disposition == "preserved",
        "cleanupTrusted": cleanup_trusted,
        "preservationRequired": preservation_required,
        "primaryErrorType": type(primary).__name__,
        "primaryError": safe_exception_text(primary),
        "secondaryErrors": list(dict.fromkeys(secondary_errors)),
    }
    marker_bytes = render_json(marker)
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{marker_path.name}.",
        suffix=".tmp",
        dir=output_dir,
    )
    temporary_path = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "wb") as handle:
            descriptor = -1
            handle.write(marker_bytes)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary_path, marker_path)
        return marker_path
    finally:
        if descriptor >= 0:
            os.close(descriptor)
        if temporary_path.exists() or temporary_path.is_symlink():
            try:
                temporary_path.unlink()
            except OSError:
                pass


def safe_exception_text(error: BaseException) -> str:
    try:
        base = str(error)
    except BaseException as stringify_error:
        try:
            detail = type(stringify_error).__name__
        except BaseException:
            detail = "unknown"
        base = f"<unprintable {type(error).__name__}: __str__ raised {detail}>"
    try:
        diagnostics = getattr(error, "beastbound_secondary_diagnostics", ())
        if isinstance(diagnostics, tuple) and diagnostics:
            base += " | " + " | ".join(
                value for value in diagnostics if isinstance(value, str) and value
            )
    except BaseException:
        pass
    return base


def append_primary_error_context(primary: BaseException, diagnostics: Iterable[str]) -> None:
    additions = [value for value in diagnostics if value]
    if not additions:
        return
    original = safe_exception_text(primary)
    combined = original + " | " + " | ".join(dict.fromkeys(additions))
    try:
        existing = tuple(getattr(primary, "args", ()))
        if existing:
            primary.args = (combined, *existing[1:])
        else:
            primary.args = (combined,)
    except BaseException:
        try:
            primary.beastbound_secondary_diagnostics = tuple(dict.fromkeys(additions))
        except BaseException:
            pass
        try:
            primary.add_note(combined)
        except BaseException:
            pass


def _run_logged(
    command: list[str],
    *,
    cwd: Path,
    env: dict[str, str],
    log_path: Path,
    timeout_seconds: float,
) -> str:
    log_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        completed = _run_subprocess(
            command,
            cwd=cwd,
            env=env,
            timeout_seconds=timeout_seconds,
            check=False,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
        )
    except (ProcessGroupTimeout, ProcessGroupLeak) as exc:
        failed_output = exc.stdout if isinstance(exc.stdout, str) else ""
        try:
            log_path.write_text(failed_output, encoding="utf-8")
        except BaseException as log_error:
            append_primary_error_context(
                exc,
                [
                    "cannot persist settled process failure output without replacing the "
                    f"containment error: {safe_exception_text(log_error)}"
                ],
            )
        raise
    output = completed.stdout or ""
    try:
        log_path.write_text(output, encoding="utf-8")
    except BaseException as log_error:
        failure = ExportGateError(
            "cannot persist current settled command output: "
            + safe_exception_text(log_error)
        )
        failure.beastbound_settled_stdout = output
        raise failure from log_error
    if completed.returncode != 0:
        failure = ExportGateError(
            f"command failed with exit {completed.returncode}: {' '.join(command)}; log={log_path}"
        )
        failure.beastbound_settled_stdout = output
        raise failure
    findings = scan_log_errors(output)
    if findings:
        failure = ExportGateError(
            f"strict log scan failed for {log_path}: {'; '.join(findings)}"
        )
        failure.beastbound_settled_stdout = output
        raise failure
    return output


def run_godot_with_user_inventory(
    command: list[str],
    *,
    label: str,
    evidence_prefix: str,
    cwd: Path,
    env: dict[str, str],
    log_path: Path,
    timeout_seconds: float,
    real_user_root: Path,
    real_user_baseline: dict[str, Any],
    output_dir: Path,
) -> dict[str, Any]:
    """Run an unsandboxed Godot command while proving real user:// stayed byte-stable."""

    if not re.fullmatch(r"[a-z0-9_]+", label):
        raise ExportGateError("Godot inventory label is unsafe")
    if not re.fullmatch(r"[0-9]{2}", evidence_prefix):
        raise ExportGateError("Godot inventory evidence prefix is unsafe")
    real_before = tree_inventory(real_user_root)
    assert_inventory_has_no_symlinks(real_before, f"real Beastbound user:// before {label}")
    assert_inventory_unchanged(
        real_user_baseline,
        real_before,
        f"real Beastbound user:// before {label}",
    )
    real_before_bytes = render_json(real_before)
    before_path = output_dir / f"{evidence_prefix}_real_user_root_before_{label}.json"
    before_path.write_bytes(real_before_bytes)
    stdout = ""
    failures: list[str] = []
    try:
        stdout = _run_logged(
            command,
            cwd=cwd,
            env=env,
            log_path=log_path,
            timeout_seconds=timeout_seconds,
        )
    except (ProcessGroupTimeout, ProcessGroupLeak) as exc:
        raise
    except (ExportGateError, OSError, subprocess.SubprocessError) as exc:
        failures.append(str(exc))
    real_after = tree_inventory(real_user_root)
    assert_inventory_has_no_symlinks(real_after, f"real Beastbound user:// after {label}")
    real_after_bytes = render_json(real_after)
    after_path = output_dir / f"{evidence_prefix}_real_user_root_after_{label}.json"
    after_path.write_bytes(real_after_bytes)
    try:
        assert_inventory_unchanged(
            real_before,
            real_after,
            f"real Beastbound user:// during {label}",
        )
    except ExportGateError as exc:
        failures.append(str(exc))
    if failures:
        failure_path = output_dir / f"{evidence_prefix}_godot_{label}_failure.json"
        failure_path.write_bytes(
            render_json(
                {
                    "schemaVersion": 1,
                    "contractId": "beastbound_phase404_godot_failure_evidence_v1",
                    "label": label,
                    "commandSha256": canonical_json_sha256(command),
                    "beforeTreeSha256": real_before["treeSha256"],
                    "afterTreeSha256": real_after["treeSha256"],
                    "beforeReportSha256": sha256_bytes(real_before_bytes),
                    "afterReportSha256": sha256_bytes(real_after_bytes),
                    "errors": list(dict.fromkeys(failures)),
                }
            )
        )
        raise ExportGateError(
            "; ".join(dict.fromkeys(failures)) + f"; report={failure_path}"
        )
    pair = {
        "label": label,
        "beforeTreeSha256": real_before["treeSha256"],
        "afterTreeSha256": real_after["treeSha256"],
        "beforeReportSha256": sha256_bytes(real_before_bytes),
        "afterReportSha256": sha256_bytes(real_after_bytes),
        "unchanged": True,
    }
    return {
        "stdout": stdout,
        "command": command,
        "commandSha256": canonical_json_sha256(command),
        "realUserInventoryPair": pair,
        "realUserInventoryEvidence": {
            "beforePath": str(before_path.resolve()),
            "afterPath": str(after_path.resolve()),
        },
    }


def run_pck_sandbox_canary(
    runtime: dict[str, Any],
    *,
    real_user_root: Path,
    output_dir: Path,
    env: dict[str, str],
) -> dict[str, Any]:
    assert_pck_sandbox_runtime_integrity(runtime)
    denied_root = Path(runtime["deniedRoot"])
    launch_root = Path(runtime["pckLaunchRoot"])
    if not os.access(denied_root, os.W_OK):
        raise ExportGateError("sandbox deny canary target is not writable without sandbox")
    denied_target = denied_root / ".beastbound-phase404-sandbox-deny-canary"
    allowed_target = launch_root / "phase404-sandbox-allow-canary"
    for label, path in (("deny", denied_target), ("allow", allowed_target)):
        if path.exists() or path.is_symlink():
            raise ExportGateError(f"sandbox {label} canary path is not empty: {path}")
    real_before = tree_inventory(real_user_root)
    assert_inventory_has_no_symlinks(real_before, "real Beastbound user:// before sandbox canary")
    real_before_bytes = render_json(real_before)
    (output_dir / "02_real_user_root_before_sandbox_canary.json").write_bytes(
        real_before_bytes
    )
    denied_command = [
        str(runtime["sandboxExecutable"]),
        "-f",
        str(runtime["profilePath"]),
        str(runtime["touchExecutable"]),
        str(denied_target),
    ]
    allowed_command = [
        str(runtime["sandboxExecutable"]),
        "-f",
        str(runtime["profilePath"]),
        str(runtime["touchExecutable"]),
        str(allowed_target),
    ]
    errors: list[str] = []
    denied_return_code: int | None = None
    denied_output = ""
    try:
        denied = _run_subprocess(
            denied_command,
            cwd=launch_root,
            env=env,
            timeout_seconds=SANDBOX_CANARY_TIMEOUT_SECONDS,
            check=False,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
        )
        denied_return_code = denied.returncode
        denied_output = denied.stdout or ""
    except (ProcessGroupTimeout, ProcessGroupLeak) as exc:
        raise
    except (ExportGateError, OSError, subprocess.SubprocessError) as exc:
        errors.append(f"sandbox deny canary command failed: {exc}")
    (output_dir / "02_pck_sandbox_deny_canary.log").write_text(
        denied_output,
        encoding="utf-8",
    )
    denied_target_created = denied_target.exists() or denied_target.is_symlink()
    denied_target_cleaned = not denied_target_created
    if denied_target_created:
        try:
            if denied_target.is_dir() and not denied_target.is_symlink():
                denied_target.rmdir()
            else:
                denied_target.unlink()
            denied_target_cleaned = not denied_target.exists() and not denied_target.is_symlink()
        except OSError as exc:
            errors.append(f"cannot clean escaped sandbox deny canary {denied_target}: {exc}")
    allowed_return_code: int | None = None
    allowed_output = ""
    try:
        allowed = _run_subprocess(
            allowed_command,
            cwd=launch_root,
            env=env,
            timeout_seconds=SANDBOX_CANARY_TIMEOUT_SECONDS,
            check=False,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
        )
        allowed_return_code = allowed.returncode
        allowed_output = allowed.stdout or ""
    except (ProcessGroupTimeout, ProcessGroupLeak) as exc:
        raise
    except (ExportGateError, OSError, subprocess.SubprocessError) as exc:
        errors.append(f"sandbox allow canary command failed: {exc}")
    (output_dir / "02_pck_sandbox_allow_canary.log").write_text(
        allowed_output,
        encoding="utf-8",
    )
    allowed_target_created = (
        allowed_target.is_file()
        and not allowed_target.is_symlink()
        and allowed_target.read_bytes() == b""
    )
    if allowed_target.exists() or allowed_target.is_symlink():
        try:
            if allowed_target.is_dir() and not allowed_target.is_symlink():
                allowed_target.rmdir()
            else:
                allowed_target.unlink()
        except OSError as exc:
            errors.append(f"cannot clean sandbox allow canary {allowed_target}: {exc}")
    real_after = tree_inventory(real_user_root)
    real_after_bytes = render_json(real_after)
    (output_dir / "02_real_user_root_after_sandbox_canary.json").write_bytes(
        real_after_bytes
    )
    try:
        assert_inventory_has_no_symlinks(
            real_after,
            "real Beastbound user:// after sandbox canary",
        )
        assert_inventory_unchanged(
            real_before,
            real_after,
            "real Beastbound user:// during sandbox canary",
        )
    except ExportGateError as exc:
        errors.append(str(exc))
    try:
        assert_pck_sandbox_runtime_integrity(runtime)
    except ExportGateError as exc:
        errors.append(str(exc))
    if denied_return_code == 0:
        errors.append("sandbox deny canary unexpectedly succeeded")
    if denied_return_code is None:
        errors.append("sandbox deny canary produced no return code")
    if denied_target_created:
        errors.append("sandbox deny canary escaped into Godot app_userdata")
    if not denied_target_cleaned:
        errors.append("sandbox deny canary target was not cleaned")
    if allowed_return_code != 0 or not allowed_target_created:
        errors.append("sandbox allow canary could not write inside PCK launch root")
    evidence = {
        "schemaVersion": 1,
        "contractId": PCK_SANDBOX_CONTRACT_ID,
        "deniedRoot": str(denied_root),
        "deniedCommandSha256": canonical_json_sha256(denied_command),
        "deniedReturnCode": denied_return_code,
        "deniedOutputSha256": sha256_bytes(denied_output.encode("utf-8")),
        "deniedTargetCreated": denied_target_created,
        "deniedTargetCleaned": denied_target_cleaned,
        "allowedCommandSha256": canonical_json_sha256(allowed_command),
        "allowedReturnCode": allowed_return_code,
        "allowedOutputSha256": sha256_bytes(allowed_output.encode("utf-8")),
        "allowedTargetCreated": allowed_target_created,
        "realUserRootBeforeTreeSha256": real_before["treeSha256"],
        "realUserRootAfterTreeSha256": real_after["treeSha256"],
        "realUserRootBeforeReportSha256": sha256_bytes(real_before_bytes),
        "realUserRootAfterReportSha256": sha256_bytes(real_after_bytes),
        "passed": not errors,
        "errors": list(dict.fromkeys(errors)),
    }
    evidence_bytes = render_json(evidence)
    evidence_path = output_dir / "02_pck_sandbox_canary.json"
    evidence_path.write_bytes(evidence_bytes)
    if errors:
        raise ExportGateError(
            "; ".join(dict.fromkeys(errors)) + f"; report={evidence_path}"
        )
    return {
        **evidence,
        "reportPath": str(evidence_path),
        "reportSha256": sha256_bytes(evidence_bytes),
        "realUserInventory": real_after,
    }


def run_sandboxed_godot_check(
    runtime: dict[str, Any],
    *,
    label: str,
    godot_arguments: list[str],
    pck_path: Path,
    expected_pck_sha256: str,
    real_user_root: Path,
    real_user_baseline: dict[str, Any],
    output_dir: Path,
    env: dict[str, str],
    qa_lane: dict[str, Any],
) -> dict[str, Any]:
    if not re.fullmatch(r"[a-z0-9_]+", label):
        raise ExportGateError("sandboxed Godot check label is unsafe")
    if godot_arguments.count(QA_LANE_ARG) != 1:
        raise ExportGateError(
            f"sandboxed {label} must carry exactly one official QA lane marker"
        )
    assert_pck_sandbox_runtime_integrity(runtime)
    if _sha256_file(pck_path) != expected_pck_sha256:
        raise ExportGateError(f"PCK changed before sandboxed {label} check")
    real_before = tree_inventory(real_user_root)
    assert_inventory_has_no_symlinks(
        real_before,
        f"real Beastbound user:// before {label}",
    )
    assert_inventory_unchanged(
        real_user_baseline,
        real_before,
        f"real Beastbound user:// before {label}",
    )
    real_before_bytes = render_json(real_before)
    before_path = output_dir / f"03_real_user_root_before_{label}.json"
    before_path.write_bytes(real_before_bytes)
    engine_log_path = Path(runtime["pckLaunchRoot"]) / f"phase404-{label}-engine.log"
    command = sandboxed_command(
        runtime,
        [
            "--headless",
            "--main-pack",
            str(pck_path),
            "--log-file",
            str(engine_log_path),
            "--quit-after",
            "3600",
            *godot_arguments,
        ],
    )
    output_log_path = output_dir / f"03_pck_{label}.log"
    engine_evidence_path = output_dir / f"03_pck_{label}.engine.log"
    stdout = ""
    engine_snapshot: dict[str, Any] = {}
    failures: list[str] = []
    try:
        stdout = _run_logged(
            command,
            cwd=Path(runtime["pckLaunchRoot"]),
            env=env,
            log_path=output_log_path,
            timeout_seconds=GODOT_PCK_TIMEOUT_SECONDS,
        )
    except (ProcessGroupTimeout, ProcessGroupLeak) as exc:
        raise
    except (ExportGateError, OSError) as exc:
        failures.append(str(exc))
        try:
            settled_stdout = getattr(exc, "beastbound_settled_stdout", None)
        except BaseException:
            settled_stdout = None
        if type(settled_stdout) is str:
            stdout = settled_stdout
    # Once process-group settlement has yielded raw stdout, Main's exact lane
    # attestation is the first trust decision.  No hashing, inventory, engine-log,
    # or evidence I/O failure may demote a missing/spoofed marker to product failure.
    try:
        qa_lane_attestation = parse_qa_lane_attestation(stdout, qa_lane)
    except BaseException as exc:
        raise QaLanePreservationRequired(
            f"PCK {label} Main QA lane attestation is untrusted; lane and lock preserved: {exc}",
            cause=exc,
        ) from exc
    try:
        engine_snapshot = read_engine_log_snapshot(
            engine_log_path,
            engine_evidence_path,
        )
    except (ExportGateError, OSError) as exc:
        failures.append(str(exc))
    try:
        assert_pck_sandbox_runtime_integrity(runtime)
    except ExportGateError as exc:
        failures.append(str(exc))
    if not pck_path.is_file() or _sha256_file(pck_path) != expected_pck_sha256:
        failures.append(f"PCK changed during sandboxed {label} check")
    real_after = tree_inventory(real_user_root)
    real_after_bytes = render_json(real_after)
    after_path = output_dir / f"03_real_user_root_after_{label}.json"
    after_path.write_bytes(real_after_bytes)
    try:
        assert_inventory_unchanged(
            real_before,
            real_after,
            f"real Beastbound user:// during {label}",
        )
    except ExportGateError as exc:
        failures.append(str(exc))
    if failures:
        failure_path = output_dir / f"03_pck_{label}_failure.json"
        failure_path.write_bytes(
            render_json(
                {
                    "schemaVersion": 1,
                    "contractId": "beastbound_phase404_godot_failure_evidence_v1",
                    "label": label,
                    "commandSha256": canonical_json_sha256(command),
                    "beforeTreeSha256": real_before["treeSha256"],
                    "afterTreeSha256": real_after["treeSha256"],
                    "beforeReportSha256": sha256_bytes(real_before_bytes),
                    "afterReportSha256": sha256_bytes(real_after_bytes),
                    "errors": list(dict.fromkeys(failures)),
                }
            )
        )
        raise ExportGateError(
            "; ".join(dict.fromkeys(failures)) + f"; report={failure_path}"
        )
    inventory_pair = {
        "label": label,
        "beforeTreeSha256": real_before["treeSha256"],
        "afterTreeSha256": real_after["treeSha256"],
        "beforeReportSha256": sha256_bytes(real_before_bytes),
        "afterReportSha256": sha256_bytes(real_after_bytes),
        "unchanged": True,
    }
    return {
        "stdout": stdout,
        "command": command,
        "commandSha256": canonical_json_sha256(command),
        "engineLog": engine_snapshot,
        "qaLaneAttestation": qa_lane_attestation,
        "realUserInventoryPair": inventory_pair,
        "realUserInventoryEvidence": {
            "beforePath": str(before_path.resolve()),
            "afterPath": str(after_path.resolve()),
        },
    }


def _run_export_gate_managed_impl(
    *,
    repo_root: Path,
    godot_executable: Path,
    output_dir: Path,
    preset_name: str = DEFAULT_PRESET,
    lifecycle_context: dict[str, Any],
) -> dict[str, Any]:
    repo_root = repo_root.resolve()
    output_dir = output_dir if output_dir.is_absolute() else repo_root / output_dir
    output_dir = output_dir.resolve()
    try:
        output_dir.relative_to(repo_root / ".run")
    except ValueError as exc:
        raise ExportGateError("export artifacts must stay under repository .run") from exc
    final_path = output_dir / "pet-battle-final-release-attestation.json"
    qa_report_path = output_dir / "pet-battle-export-qa-report.json"
    source_contract = validate_qa_lane_source_contract(repo_root)
    lifecycle_context["sourceContractPassed"] = True
    attempt_id = os.urandom(16).hex()
    lifecycle_context["attemptId"] = attempt_id
    # Source identity is proven before even ignored stale evidence is mutated.
    failure_marker_path = output_dir / "pet-battle-export-gate-failure.json"
    for stale in (final_path, qa_report_path, failure_marker_path):
        try:
            if stale.exists() or stale.is_symlink():
                stale.unlink()
        except OSError as exc:
            raise ExportGateError(
                f"cannot invalidate stale Phase404 authority before static audit: {stale}: {exc}"
            ) from exc
        if stale.exists() or stale.is_symlink():
            raise ExportGateError(
                f"stale Phase404 authority remains before static audit: {stale}"
            )
    baseline_scope = assert_exact_allowlist(repo_root)
    initial_patch_sha = sha256_bytes(git_patch_bytes(repo_root))
    godot_path = godot_executable.resolve()
    godot_sha = _sha256_file(godot_path)
    if godot_sha != PINNED_GODOT_EXECUTABLE_SHA256:
        raise ExportGateError("Phase404 Godot executable SHA-256 is not the pinned 4.7 binary")
    source_build_evidence: dict[str, Any] = {}
    expectation = build_export_expectation(
        repo_root,
        evidence_out=source_build_evidence,
    )
    source_audit_snapshot = source_build_evidence.get("sourceAuditSnapshot")
    if not isinstance(source_audit_snapshot, dict):
        raise ExportGateError("source expectation build omitted its audit snapshot")
    source_audit_report_bytes = source_audit_snapshot.get("rawBytes")
    source_audit_report_sha = source_audit_snapshot.get("sha256")
    if (
        not isinstance(source_audit_report_bytes, bytes)
        or not isinstance(source_audit_report_sha, str)
        or source_audit_report_sha != sha256_bytes(source_audit_report_bytes)
        or expectation.get("sourceAuditReportSha256") != source_audit_report_sha
    ):
        raise ExportGateError("source expectation audit snapshot binding is invalid")
    if sha256_bytes(git_patch_bytes(repo_root)) != initial_patch_sha:
        raise ExportGateError("Phase404 product patch changed during source expectation audit")
    registry_path = repo_root / DEFAULT_REGISTRY
    cache_path = repo_root / DEFAULT_RUNTIME_CACHE
    preset_path = repo_root / DEFAULT_PRESET_PATH
    project_path = repo_root / DEFAULT_PROJECT_PATH
    registry_sha = str(expectation.get("registrySha256", "")).lower()
    cache_sha = str(expectation.get("runtimeCacheSha256", "")).lower()
    if not re.fullmatch(r"[0-9a-f]{64}", registry_sha):
        raise ExportGateError("source expectation registry SHA-256 is invalid")
    if not re.fullmatch(r"[0-9a-f]{64}", cache_sha):
        raise ExportGateError("source expectation runtime-cache SHA-256 is invalid")
    if _sha256_file(registry_path) != registry_sha:
        raise ExportGateError("release registry changed after source expectation audit")
    if _sha256_file(cache_path) != cache_sha:
        raise ExportGateError("runtime cache changed after source expectation audit")
    preset_sha = _sha256_file(preset_path)
    real_user_root = resolve_real_user_root(project_path).resolve()
    repo_binding = repo_root_binding(repo_root)
    env = dict(os.environ)
    env[REPO_ROOT_ENV] = repo_binding["path"]
    env[REPO_ROOT_SHA256_ENV] = repo_binding["sha256"]
    output_dir.mkdir(parents=True, exist_ok=True)
    source_audit_evidence_path = output_dir / "00_source_release_audit.json"
    source_audit_evidence_path.write_bytes(source_audit_report_bytes)
    if (
        source_audit_evidence_path.is_symlink()
        or source_audit_evidence_path.read_bytes() != source_audit_report_bytes
        or _sha256_file(source_audit_evidence_path) != source_audit_report_sha
    ):
        raise ExportGateError("source release audit evidence changed after write")
    pck_path = output_dir / "phase404_macos_release.pck"
    real_user_inventory_before = tree_inventory(real_user_root)
    assert_inventory_has_no_symlinks(
        real_user_inventory_before,
        "real Beastbound user:// before any Phase404 Godot process",
    )
    real_user_before_bytes = render_json(real_user_inventory_before)
    (output_dir / "00_real_user_root_before_any_godot.json").write_bytes(
        real_user_before_bytes
    )
    qa_lane_owner = os.urandom(16).hex()
    lifecycle_context["qaLaneAttempted"] = True
    lifecycle_context["qaLaneOwner"] = qa_lane_owner
    lifecycle_context["qaLaneId"] = QA_LANE
    lifecycle_context["cleaned"] = False
    qa_lane = prepare_qa_lane(repo_root, env, qa_lane_owner)
    lifecycle_context["qaLane"] = qa_lane
    if Path(qa_lane["realRoot"]).resolve() != real_user_root:
        raise ExportGateError(
            "QA lane helper realRoot does not match the independently resolved player root"
        )
    initial_lane_verification = verify_qa_lane_or_preserve(
        repo_root,
        qa_lane,
        "initial_lane_verification",
    )
    lifecycle_context["initialVerification"] = initial_lane_verification
    lifecycle_context["phaseVerifications"] = []
    env = qa_lane["environment"]
    godot_runs: list[dict[str, Any]] = []
    initial_version_run, initial_version_verification = run_phase_with_qa_lane_verification(
        repo_root,
        qa_lane,
        "initial_version",
        lambda: run_godot_with_user_inventory(
            [str(godot_path), "--version"],
            label="initial_version",
            evidence_prefix="00",
            cwd=repo_root,
            env=env,
            log_path=output_dir / "00_godot_version_before.log",
            timeout_seconds=GODOT_VERSION_TIMEOUT_SECONDS,
            real_user_root=real_user_root,
            real_user_baseline=real_user_inventory_before,
            output_dir=output_dir,
        ),
    )
    lifecycle_context["phaseVerifications"].append(
        {"label": "initial_version", "verification": initial_version_verification}
    )
    godot_runs.append(initial_version_run)
    version = parse_pinned_godot_version(initial_version_run["stdout"])
    if _sha256_file(godot_path) != godot_sha:
        raise ExportGateError("source Godot executable changed during initial version check")

    editor_help_run, editor_help_verification = run_phase_with_qa_lane_verification(
        repo_root,
        qa_lane,
        "editor_help",
        lambda: run_godot_with_user_inventory(
            [str(godot_path), "--help"],
            label="editor_help",
            evidence_prefix="00",
            cwd=repo_root,
            env=env,
            log_path=output_dir / "00_godot_help.log",
            timeout_seconds=GODOT_VERSION_TIMEOUT_SECONDS,
            real_user_root=real_user_root,
            real_user_baseline=real_user_inventory_before,
            output_dir=output_dir,
        ),
    )
    lifecycle_context["phaseVerifications"].append(
        {"label": "editor_help", "verification": editor_help_verification}
    )
    godot_runs.append(editor_help_run)
    godot_help = validate_pinned_godot_help(editor_help_run["stdout"])

    cleanup_report_path = output_dir / "05_generated_sidecar_cleanup.json"
    with GeneratedImportStateGuard(
        project_path,
        cleanup_report_path,
    ), IsolatedPckLaunchDirectories(repo_root) as isolated:
        expectation_root = isolated.expectation_root
        pck_launch_root = isolated.pck_launch_root
        if expectation_root is None or pck_launch_root is None:
            raise ExportGateError("Phase404 temporary launch roots were not initialized")
        expectation_path = validate_external_expectation_path(
            expectation_root / "pet-battle-export-expectation.json",
            repo_root,
            additional_forbidden_roots=(
                pck_launch_root,
                real_user_root,
                Path(qa_lane["laneRoot"]),
            ),
        )
        source_audit_runtime_path = validate_external_expectation_path(
            expectation_root / "pet-battle-source-release-audit.json",
            repo_root,
            additional_forbidden_roots=(
                pck_launch_root,
                real_user_root,
                Path(qa_lane["laneRoot"]),
            ),
        )
        expectation_bytes = render_json(expectation)
        expectation_path.write_bytes(expectation_bytes)
        source_audit_runtime_path.write_bytes(source_audit_report_bytes)
        expectation_sha = sha256_bytes(expectation_bytes)
        expectation_snapshot = read_external_expectation_snapshot(
            expectation_path,
            expectation_sha,
        )
        if not canonical_json_equal(expectation_snapshot["document"], expectation):
            raise ExportGateError("external expectation snapshot differs from generated document")
        env[EXPECTATION_ENV] = str(expectation_path)
        env[EXPECTATION_SHA256_ENV] = expectation_sha
        env[SOURCE_AUDIT_REPORT_ENV] = str(source_audit_runtime_path)
        env[SOURCE_AUDIT_REPORT_SHA256_ENV] = source_audit_report_sha

        cold_import_run, cold_import_verification = run_phase_with_qa_lane_verification(
            repo_root,
            qa_lane,
            "cold_import",
            lambda: run_godot_with_user_inventory(
                [
                    str(godot_path),
                    "--headless",
                    "--path",
                    str(project_path),
                    "--import",
                ],
                label="cold_import",
                evidence_prefix="01",
                cwd=repo_root,
                env=env,
                log_path=output_dir / "01_cold_import.log",
                timeout_seconds=GODOT_IMPORT_TIMEOUT_SECONDS,
                real_user_root=real_user_root,
                real_user_baseline=real_user_inventory_before,
                output_dir=output_dir,
            ),
        )
        lifecycle_context["phaseVerifications"].append(
            {"label": "cold_import", "verification": cold_import_verification}
        )
        godot_runs.append(cold_import_run)
        post_import_scope = assert_exact_allowlist(
            repo_root,
            allow_generated_sidecars=True,
        )
        (output_dir / "01_generated_sidecars_after_import.json").write_bytes(
            render_json(post_import_scope)
        )
        if sha256_bytes(git_patch_bytes(repo_root)) != initial_patch_sha:
            raise ExportGateError("Phase404 product patch changed during cold import")
        import_sidecar_audit_a = audit_import_sidecars(repo_root, expectation)
        import_sidecar_audit_bytes = render_json(import_sidecar_audit_a)
        import_sidecar_audit_paths = [
            output_dir / "01_import_sidecar_audit_after_cold_import.json",
            output_dir / "02_import_sidecar_audit_after_export.json",
            output_dir / "04_import_sidecar_audit_before_cleanup.json",
        ]
        import_sidecar_audit_paths[0].write_bytes(import_sidecar_audit_bytes)
        export_pack_run, export_pack_verification = run_phase_with_qa_lane_verification(
            repo_root,
            qa_lane,
            "export_pack",
            lambda: run_godot_with_user_inventory(
                [
                    str(godot_path),
                    "--headless",
                    "--path",
                    str(project_path),
                    "--export-pack",
                    preset_name,
                    str(pck_path),
                ],
                label="export_pack",
                evidence_prefix="02",
                cwd=repo_root,
                env=env,
                log_path=output_dir / "02_export_pack.log",
                timeout_seconds=GODOT_EXPORT_TIMEOUT_SECONDS,
                real_user_root=real_user_root,
                real_user_baseline=real_user_inventory_before,
                output_dir=output_dir,
            ),
        )
        lifecycle_context["phaseVerifications"].append(
            {"label": "export_pack", "verification": export_pack_verification}
        )
        godot_runs.append(export_pack_run)
        import_sidecar_audit_b = audit_import_sidecars(repo_root, expectation)
        if not canonical_json_equal(import_sidecar_audit_b, import_sidecar_audit_a):
            raise ExportGateError("canonical 540 import sidecars changed during export")
        import_sidecar_audit_paths[1].write_bytes(import_sidecar_audit_bytes)
        if not pck_path.is_file():
            raise ExportGateError("Godot export did not produce the PCK")
        pck_before_sha = _sha256_file(pck_path)
        (output_dir / "02_real_user_root_before_pck.json").write_bytes(
            real_user_before_bytes
        )

        sandbox_runtime = create_pck_sandbox_runtime(
            godot_executable=godot_path,
            real_user_root=real_user_root,
            pck_launch_root=pck_launch_root,
        )
        if sandbox_runtime["godotExecutableSha256"] != godot_sha:
            raise ExportGateError("pinned Godot changed before sandboxed PCK QA")
        sandbox_profile_evidence_path = output_dir / "02_pck_sandbox_profile.sb"
        sandbox_profile_evidence_path.write_bytes(sandbox_runtime["profileBytes"])
        sandbox_runtime_evidence = {
            "schemaVersion": 1,
            "contractId": PCK_SANDBOX_CONTRACT_ID,
            "sandboxExecutable": str(sandbox_runtime["sandboxExecutable"]),
            "sandboxExecutableSha256": sandbox_runtime["sandboxExecutableSha256"],
            "touchExecutable": str(sandbox_runtime["touchExecutable"]),
            "touchExecutableSha256": sandbox_runtime["touchExecutableSha256"],
            "godotExecutable": str(sandbox_runtime["godotExecutable"]),
            "godotExecutableSha256": sandbox_runtime["godotExecutableSha256"],
            "deniedRoot": str(sandbox_runtime["deniedRoot"]),
            "profileEvidencePath": str(sandbox_profile_evidence_path),
            "profileSha256": sandbox_runtime["profileSha256"],
            "repoRootBinding": repo_binding,
        }
        sandbox_runtime_evidence_bytes = render_json(sandbox_runtime_evidence)
        sandbox_runtime_evidence_path = output_dir / "02_pck_sandbox_runtime.json"
        sandbox_runtime_evidence_path.write_bytes(sandbox_runtime_evidence_bytes)
        sandbox_canary = run_pck_sandbox_canary(
            sandbox_runtime,
            real_user_root=real_user_root,
            output_dir=output_dir,
            env=env,
        )
        assert_inventory_unchanged(
            real_user_inventory_before,
            sandbox_canary["realUserInventory"],
            "real Beastbound user:// during sandbox canary",
        )

        preflight_env = dict(env)
        preflight_env[USER_ROOT_PREFLIGHT_ENV] = "1"
        preflight_run, preflight_verification = run_phase_with_qa_lane_verification(
            repo_root,
            qa_lane,
            "preflight",
            lambda: run_sandboxed_godot_check(
                sandbox_runtime,
                label="preflight",
                godot_arguments=["--", QA_LANE_ARG],
                pck_path=pck_path,
                expected_pck_sha256=pck_before_sha,
                real_user_root=real_user_root,
                real_user_baseline=real_user_inventory_before,
                output_dir=output_dir,
                env=preflight_env,
                qa_lane=qa_lane,
            ),
        )
        lifecycle_context["phaseVerifications"].append(
            {"label": "preflight", "verification": preflight_verification}
        )
        preflight_result = extract_user_root_preflight(preflight_run["stdout"])
        preflight_facts = validate_pck_preflight(
            preflight_result,
            pck_launch_root=pck_launch_root,
            godot_executable=godot_path,
            expectation_path=expectation_path,
            real_user_root=Path(qa_lane["laneRoot"]),
            repo_root=repo_root,
            repo_binding_sha256=repo_binding["sha256"],
        )

        forms_by_id = {form["formId"]: form for form in expectation["forms"]}
        default_form_id = "bui_novice_sprout_earth5_wind5"
        run_forms: list[tuple[str, str]] = [("default_bui", "")]
        run_forms.extend(
            (form_id.split("_")[0], form_id)
            for form_id in forms_by_id
            if form_id != default_form_id
        )
        if [label for label, _form_id in run_forms] != ["default_bui", "wuli", "driftfox"]:
            raise ExportGateError("PCK exact-form QA order drifted")
        qa_results: list[dict[str, Any]] = []
        pck_runs: list[dict[str, Any]] = [preflight_run]
        qa_env = dict(env)
        qa_env.pop(USER_ROOT_PREFLIGHT_ENV, None)
        for label, explicit_form_id in run_forms:
            expected_form_id = explicit_form_id or default_form_id
            arguments = ["--", QA_LANE_ARG, "--auto-pet-action-asset-check"]
            if explicit_form_id:
                arguments.append(f"--auto-pet-action-asset-form={explicit_form_id}")
            qa_run, qa_run_verification = run_phase_with_qa_lane_verification(
                repo_root,
                qa_lane,
                label,
                lambda label=label, arguments=arguments: run_sandboxed_godot_check(
                    sandbox_runtime,
                    label=label,
                    godot_arguments=arguments,
                    pck_path=pck_path,
                    expected_pck_sha256=pck_before_sha,
                    real_user_root=real_user_root,
                    real_user_baseline=real_user_inventory_before,
                    output_dir=output_dir,
                    env=qa_env,
                    qa_lane=qa_lane,
                ),
            )
            lifecycle_context["phaseVerifications"].append(
                {"label": label, "verification": qa_run_verification}
            )
            result = extract_godot_result(qa_run["stdout"])
            result_errors = validate_pck_result(
                result,
                forms_by_id[expected_form_id],
                expectation_sha,
                release_expectation=expectation,
                expected_user_root=Path(qa_lane["laneRoot"]),
                expected_working_dir=pck_launch_root,
                expected_repo_root=repo_root,
                expected_repo_root_sha256=repo_binding["sha256"],
            )
            if result_errors:
                raise ExportGateError("; ".join(result_errors))
            qa_results.append(result)
            pck_runs.append(qa_run)
        godot_runs.extend(pck_runs)
        real_user_inventory_after = tree_inventory(real_user_root)
        assert_inventory_unchanged(
            real_user_inventory_before,
            real_user_inventory_after,
            "real Beastbound user:// after all sandboxed PCK QA",
        )
        pck_after_sha = _sha256_file(pck_path)
        assert_pck_unchanged(pck_before_sha, pck_after_sha)
        assert_pck_sandbox_runtime_integrity(sandbox_runtime)
        if sandbox_profile_evidence_path.read_bytes() != sandbox_runtime["profileBytes"]:
            raise ExportGateError("sandbox profile evidence changed during PCK QA")
        final_expectation_snapshot = read_external_expectation_snapshot(
            expectation_path,
            expectation_sha,
        )
        if not canonical_json_equal(final_expectation_snapshot["document"], expectation):
            raise ExportGateError("external expectation changed during PCK QA")
        import_sidecar_audit_c = audit_import_sidecars(repo_root, expectation)
        if not canonical_json_equal(import_sidecar_audit_c, import_sidecar_audit_a):
            raise ExportGateError("canonical 540 import sidecars changed during PCK QA")
        import_sidecar_audit_paths[2].write_bytes(import_sidecar_audit_bytes)
        pre_cleanup_scope = assert_exact_allowlist(
            repo_root,
            allow_generated_sidecars=True,
        )
        (output_dir / "04_generated_sidecars_before_cleanup.json").write_bytes(
            render_json(pre_cleanup_scope)
        )
        if sha256_bytes(git_patch_bytes(repo_root)) != initial_patch_sha:
            raise ExportGateError("Phase404 product patch changed during PCK QA")

    temporary_roots_cleaned = (
        not expectation_root.exists()
        and not expectation_root.is_symlink()
        and not pck_launch_root.exists()
        and not pck_launch_root.is_symlink()
    )
    if not temporary_roots_cleaned:
        raise ExportGateError("temporary expectation/PCK launch roots remain after cleanup")
    temporary_cleanup = {
        "schemaVersion": 1,
        "contractId": PCK_SANDBOX_CONTRACT_ID,
        "expectationRoot": str(expectation_root),
        "pckLaunchRoot": str(pck_launch_root),
        "expectationRootExists": expectation_root.exists(),
        "pckLaunchRootExists": pck_launch_root.exists(),
        "rootsCleaned": temporary_roots_cleaned,
    }
    temporary_cleanup_bytes = render_json(temporary_cleanup)
    (output_dir / "05_pck_temporary_root_cleanup.json").write_bytes(
        temporary_cleanup_bytes
    )
    final_version_run, final_version_verification = run_phase_with_qa_lane_verification(
        repo_root,
        qa_lane,
        "final_version",
        lambda: run_godot_with_user_inventory(
            [str(godot_path), "--version"],
            label="final_version",
            evidence_prefix="04",
            cwd=repo_root,
            env=env,
            log_path=output_dir / "04_godot_version_after.log",
            timeout_seconds=GODOT_VERSION_TIMEOUT_SECONDS,
            real_user_root=real_user_root,
            real_user_baseline=real_user_inventory_before,
            output_dir=output_dir,
        ),
    )
    lifecycle_context["phaseVerifications"].append(
        {"label": "final_version", "verification": final_version_verification}
    )
    godot_runs.append(final_version_run)
    final_version = parse_pinned_godot_version(final_version_run["stdout"])
    if final_version != version:
        raise ExportGateError("source Godot version output changed during export QA")
    if _sha256_file(godot_path) != godot_sha:
        raise ExportGateError("source Godot executable changed during final version check")
    real_user_inventory_final = tree_inventory(real_user_root)
    assert_inventory_has_no_symlinks(
        real_user_inventory_final,
        "real Beastbound user:// after every Phase404 Godot process",
    )
    assert_inventory_unchanged(
        real_user_inventory_before,
        real_user_inventory_final,
        "real Beastbound user:// after every Phase404 Godot process",
    )
    real_user_after_bytes = render_json(real_user_inventory_final)
    (output_dir / "04_real_user_root_after_all_godot.json").write_bytes(
        real_user_after_bytes
    )

    final_patch_sha = sha256_bytes(git_patch_bytes(repo_root))
    if final_patch_sha != initial_patch_sha:
        raise ExportGateError("Phase404 git patch changed during export QA")
    final_scope = assert_exact_allowlist(repo_root)
    (output_dir / "06_product_scope_after_cleanup.json").write_bytes(
        render_json(final_scope)
    )
    if final_scope["generatedSidecarCount"] != 0:
        raise ExportGateError("generated sidecars remain after cleanup")
    cleanup_report_snapshot = _read_json_snapshot(cleanup_report_path)
    cleanup_report = cleanup_report_snapshot["document"]
    if cleanup_report.get("residualGeneratedSidecarCount") != 0:
        raise ExportGateError("generated-sidecar cleanup report is not zero")
    if _sha256_file(registry_path) != registry_sha or _sha256_file(cache_path) != cache_sha:
        raise ExportGateError("registry or runtime cache changed during export QA")
    if _sha256_file(preset_path) != preset_sha:
        raise ExportGateError("export preset changed during export QA")
    if _sha256_file(godot_path) != godot_sha:
        raise ExportGateError("source Godot executable changed during export QA")
    if cleanup_report_path.read_bytes() != cleanup_report_snapshot["rawBytes"]:
        raise ExportGateError("generated-sidecar cleanup report changed after verification")
    inventory_pairs = [run["realUserInventoryPair"] for run in godot_runs]
    for run, pair in zip(godot_runs, inventory_pairs):
        evidence_paths = run["realUserInventoryEvidence"]
        for side, sha_key in (
            ("before", "beforeReportSha256"),
            ("after", "afterReportSha256"),
        ):
            evidence_path = Path(evidence_paths[f"{side}Path"])
            if evidence_path.is_symlink() or not evidence_path.is_file():
                raise ExportGateError(
                    f"real user-root {side} evidence disappeared: {pair['label']}"
                )
            if _sha256_file(evidence_path) != pair[sha_key]:
                raise ExportGateError(
                    f"real user-root {side} evidence changed: {pair['label']}"
                )
    godot_command_evidence = [
        {"run": pair["label"], "sha256": run["commandSha256"]}
        for pair, run in zip(inventory_pairs, godot_runs)
    ]
    sandbox_command_evidence = [
        {"run": run["realUserInventoryPair"]["label"], "sha256": run["commandSha256"]}
        for run in pck_runs
    ]
    engine_log_snapshots = [
        {"run": run["realUserInventoryPair"]["label"], **run["engineLog"]}
        for run in pck_runs
    ]
    for item in engine_log_snapshots:
        evidence_path = Path(item["evidencePath"])
        if evidence_path.is_symlink() or not evidence_path.is_file():
            raise ExportGateError(f"PCK engine-log evidence disappeared: {item['run']}")
        if _sha256_file(evidence_path) != item["sha256"]:
            raise ExportGateError(f"PCK engine-log evidence changed: {item['run']}")
    import_sidecar_audit_evidence: list[dict[str, Any]] = []
    for label, evidence_path in zip(
        ("after_cold_import", "after_export", "before_cleanup"),
        import_sidecar_audit_paths,
    ):
        if (
            evidence_path.is_symlink()
            or not evidence_path.is_file()
            or evidence_path.read_bytes() != import_sidecar_audit_bytes
        ):
            raise ExportGateError(f"import sidecar audit evidence changed: {label}")
        import_sidecar_audit_evidence.append(
            {
                "label": label,
                "path": str(evidence_path.resolve()),
                "sha256": sha256_bytes(import_sidecar_audit_bytes),
            }
        )
    if (
        sandbox_runtime_evidence_path.is_symlink()
        or sandbox_runtime_evidence_path.read_bytes() != sandbox_runtime_evidence_bytes
    ):
        raise ExportGateError("sandbox runtime evidence changed before final attestation")
    sandbox_canary_path = Path(sandbox_canary["reportPath"])
    if (
        sandbox_canary_path.is_symlink()
        or not sandbox_canary_path.is_file()
        or _sha256_file(sandbox_canary_path) != sandbox_canary["reportSha256"]
    ):
        raise ExportGateError("sandbox canary evidence changed before final attestation")
    if (output_dir / "02_real_user_root_before_pck.json").read_bytes() != real_user_before_bytes:
        raise ExportGateError("real user-root baseline evidence changed before final attestation")
    if (output_dir / "04_real_user_root_after_all_godot.json").read_bytes() != real_user_after_bytes:
        raise ExportGateError("real user-root final evidence changed before final attestation")
    if (output_dir / "05_pck_temporary_root_cleanup.json").read_bytes() != temporary_cleanup_bytes:
        raise ExportGateError("temporary-root cleanup evidence changed before final attestation")
    if (
        source_audit_evidence_path.is_symlink()
        or source_audit_evidence_path.read_bytes() != source_audit_report_bytes
        or _sha256_file(source_audit_evidence_path) != source_audit_report_sha
    ):
        raise ExportGateError("source release audit evidence changed before final attestation")
    sandbox_command_aggregate_sha = canonical_json_sha256(sandbox_command_evidence)
    godot_command_aggregate_sha = canonical_json_sha256(godot_command_evidence)
    engine_log_aggregate_sha = canonical_json_sha256(
        [
            {"run": item["run"], "size": item["size"], "sha256": item["sha256"]}
            for item in engine_log_snapshots
        ]
    )
    lifecycle_context["cleanupAttempted"] = True
    qa_lane_cleanup = cleanup_qa_lane(repo_root, qa_lane)
    lifecycle_context["cleanupReturned"] = True
    lifecycle_context["cleanup"] = qa_lane_cleanup
    lifecycle_context["postCleanupInspectionAttempted"] = True
    qa_lane_post_cleanup = inspect_cleaned_qa_lane(repo_root, qa_lane)
    lifecycle_context["postCleanupInspection"] = qa_lane_post_cleanup
    lifecycle_context["cleaned"] = True
    qa_lane_evidence = build_qa_lane_release_evidence(
        attempt_id=attempt_id,
        source_contract=source_contract,
        qa_lane=qa_lane,
        initial_verification=initial_lane_verification,
        phase_verifications=lifecycle_context["phaseVerifications"],
        cleanup=qa_lane_cleanup,
        post_cleanup_inspection=qa_lane_post_cleanup,
        home_unchanged=env.get("HOME") == os.environ.get("HOME"),
    )
    sandbox_canary_public = {
        key: value
        for key, value in sandbox_canary.items()
        if key != "realUserInventory"
    }
    qa_report = {
        "schemaVersion": 6,
        "reportId": QA_REPORT_ID,
        "contractId": QA_REPORT_CONTRACT_ID,
        "canonicalJsonContractId": CANONICAL_JSON_CONTRACT_ID,
        "pixelContractId": PIXEL_CONTRACT_ID,
        "expectationId": EXPECTATION_ID,
        "expectationContractId": EXPECTATION_CONTRACT_ID,
        "importOracle": expectation["importOracle"],
        "importOracleSha256": expectation["importOracleSha256"],
        "importSidecarAuditContractId": IMPORT_SIDECAR_AUDIT_ID,
        "importSidecarAuditFrameCount": import_sidecar_audit_a["frameCount"],
        "importSidecarAuditAggregateSha256": import_sidecar_audit_a[
            "frameBindingAggregateSha256"
        ],
        "importSidecarAuditsStable": True,
        "importSidecarAuditEvidence": import_sidecar_audit_evidence,
        "pckSandboxContractId": PCK_SANDBOX_CONTRACT_ID,
        "qaLaneLifecycle": qa_lane_evidence,
        "qaLaneLifecycleSha256": canonical_json_sha256(qa_lane_evidence),
        "qaLaneRoot": qa_lane_evidence["qaLaneRoot"],
        "realRoot": qa_lane_evidence["realRoot"],
        "godotHelp": godot_help,
        "status": "passed",
        "expectationSha256": expectation_sha,
        "sourceAuditReport": {
            "path": str(source_audit_evidence_path.resolve()),
            "size": len(source_audit_report_bytes),
            "sha256": source_audit_report_sha,
        },
        "repoRootBinding": repo_binding,
        "pckWorkingDirectory": str(preflight_facts["workingDir"]),
        "resourceRootObserved": preflight_facts["resourceRoot"],
        "pckBeforeSha256": pck_before_sha,
        "pckAfterSha256": pck_after_sha,
        "baselineProductPathCount": baseline_scope["productPathCount"],
        "generatedSidecarCount": pre_cleanup_scope["generatedSidecarCount"],
        "generatedSidecarAggregateSha256": pre_cleanup_scope[
            "generatedSidecarAggregateSha256"
        ],
        "cleanupResidualGeneratedSidecarCount": cleanup_report[
            "residualGeneratedSidecarCount"
        ],
        "cleanupReportSha256": cleanup_report_snapshot["sha256"],
        "sandboxRuntime": sandbox_runtime_evidence,
        "sandboxRuntimeEvidenceSha256": sha256_bytes(sandbox_runtime_evidence_bytes),
        "sandboxCanary": sandbox_canary_public,
        "sandboxCommandSha256s": sandbox_command_evidence,
        "sandboxCommandAggregateSha256": sandbox_command_aggregate_sha,
        "godotCommandSha256s": godot_command_evidence,
        "godotCommandAggregateSha256": godot_command_aggregate_sha,
        "sourceGodotExecutableSha256": godot_sha,
        "pckQaGodotExecutableSha256": sandbox_runtime["godotExecutableSha256"],
        "preflight": preflight_result,
        "pckQaLaneAttestations": [
            {
                "run": run["realUserInventoryPair"]["label"],
                "attestation": run["qaLaneAttestation"],
            }
            for run in pck_runs
        ],
        "pckEngineLogs": engine_log_snapshots,
        "pckEngineLogAggregateSha256": engine_log_aggregate_sha,
        "realUserRootBefore": {
            "root": real_user_inventory_before["root"],
            "entryCount": real_user_inventory_before["entryCount"],
            "fileCount": real_user_inventory_before["fileCount"],
            "treeSha256": real_user_inventory_before["treeSha256"],
            "reportSha256": sha256_bytes(real_user_before_bytes),
        },
        "realUserRootAfter": {
            "root": real_user_inventory_final["root"],
            "entryCount": real_user_inventory_final["entryCount"],
            "fileCount": real_user_inventory_final["fileCount"],
            "treeSha256": real_user_inventory_final["treeSha256"],
            "reportSha256": sha256_bytes(real_user_after_bytes),
        },
        "realUserRootRunInventoryPairs": inventory_pairs,
        "realUserRootRunInventoryAggregateSha256": canonical_json_sha256(
            inventory_pairs
        ),
        "temporaryRootsCleaned": temporary_roots_cleaned,
        "temporaryCleanupReportSha256": sha256_bytes(temporary_cleanup_bytes),
        "results": qa_results,
    }
    try:
        qa_report = normalize_canonical_json(qa_report)
    except CanonicalJsonError as exc:
        raise ExportGateError(f"PCK QA report violates canonical v2: {exc}") from exc
    qa_report_bytes = render_json(qa_report)
    qa_report_path.write_bytes(qa_report_bytes)
    qa_report_snapshot = _read_json_snapshot(qa_report_path)
    if (
        qa_report_snapshot["rawBytes"] != qa_report_bytes
        or not canonical_json_equal(qa_report_snapshot["document"], qa_report)
    ):
        raise ExportGateError("PCK QA report changed after write")
    qa_report_sha = qa_report_snapshot["sha256"]
    final = build_final_release_attestation(
        expectation_sha256=expectation_sha,
        source_audit_report_sha256=source_audit_report_sha,
        import_oracle_sha256=expectation["importOracleSha256"],
        import_sidecar_audit_sha256=sha256_bytes(import_sidecar_audit_bytes),
        import_sidecar_audit_aggregate_sha256=import_sidecar_audit_a[
            "frameBindingAggregateSha256"
        ],
        import_sidecar_audit_evidence_aggregate_sha256=canonical_json_sha256(
            import_sidecar_audit_evidence
        ),
        import_sidecar_audit_frame_count=import_sidecar_audit_a["frameCount"],
        registry_sha256=registry_sha,
        runtime_cache_sha256=cache_sha,
        pck_before_sha256=pck_before_sha,
        pck_after_sha256=pck_after_sha,
        git_patch_sha256=initial_patch_sha,
        export_preset_name=preset_name,
        export_preset_sha256=preset_sha,
        godot_version=version,
        godot_executable_sha256=godot_sha,
        pck_qa_godot_executable_sha256=sandbox_runtime[
            "godotExecutableSha256"
        ],
        sandbox_executable_sha256=sandbox_runtime["sandboxExecutableSha256"],
        sandbox_touch_executable_sha256=sandbox_runtime[
            "touchExecutableSha256"
        ],
        sandbox_profile_sha256=sandbox_runtime["profileSha256"],
        sandbox_canary_report_sha256=sandbox_canary["reportSha256"],
        sandbox_command_aggregate_sha256=sandbox_command_aggregate_sha,
        godot_command_aggregate_sha256=godot_command_aggregate_sha,
        repo_root_binding_sha256=repo_binding["sha256"],
        pck_working_directory=str(preflight_facts["workingDir"]),
        real_user_root_run_inventory_pairs=inventory_pairs,
        real_user_root_inventory_before_sha256=real_user_inventory_before[
            "treeSha256"
        ],
        real_user_root_inventory_after_sha256=real_user_inventory_final[
            "treeSha256"
        ],
        pck_engine_log_aggregate_sha256=engine_log_aggregate_sha,
        temporary_roots_cleaned=temporary_roots_cleaned,
        qa_lane_evidence=qa_lane_evidence,
        qa_report_sha256=qa_report_sha,
        qa_form_ids=[result["formId"] for result in qa_results],
        qa_passed=True,
    )
    final_bytes = render_json(final)
    if (
        qa_report_path.is_symlink()
        or qa_report_path.read_bytes() != qa_report_bytes
        or _sha256_file(qa_report_path) != qa_report_sha
    ):
        raise ExportGateError("PCK QA report changed before final builder handoff")
    expected_final_sha = sha256_bytes(final_bytes)
    success_result = {
        "qaReport": qa_report,
        "finalReleaseAttestation": final,
        "finalReleaseAttestationSha256": expected_final_sha,
        "outputDir": str(output_dir),
    }
    final_commit_candidate = {
        "attemptId": attempt_id,
        "finalPath": str(final_path),
        "finalBytes": final_bytes,
        "finalSha256": expected_final_sha,
        "qaReportPath": str(qa_report_path),
        "qaReportBytes": qa_report_bytes,
        "qaReportSha256": qa_report_sha,
        "result": success_result,
        "committed": False,
    }
    lifecycle_context["finalCommitCandidate"] = final_commit_candidate
    final_sha = write_final_attestation_atomic(
        final_path,
        final_bytes,
        qa_report_path=qa_report_path,
        qa_report_sha256=qa_report_sha,
        commit_context=final_commit_candidate,
    )
    if final_sha != expected_final_sha:
        raise ExportGateError("final attestation writer returned an unexpected SHA-256")
    return success_result


def run_export_gate(
    *,
    repo_root: Path,
    godot_executable: Path,
    output_dir: Path,
    preset_name: str = DEFAULT_PRESET,
) -> dict[str, Any]:
    resolved_repo_root = repo_root.resolve()
    resolved_output_dir = (
        output_dir if output_dir.is_absolute() else resolved_repo_root / output_dir
    ).resolve()
    lifecycle_context: dict[str, Any] = {}
    try:
        return _run_export_gate_managed_impl(
            repo_root=resolved_repo_root,
            godot_executable=godot_executable,
            output_dir=resolved_output_dir,
            preset_name=preset_name,
            lifecycle_context=lifecycle_context,
        )
    except BaseException as exc:
        commit_state, committed_result = _recognized_committed_final_result(
            lifecycle_context,
            resolved_output_dir,
        )
        if commit_state == "committed_exact" and committed_result is not None:
            return committed_result
        if commit_state == "committed_unverifiable":
            append_primary_error_context(
                exc,
                [
                    "final replace crossed its committed boundary; pass artifacts were not "
                    "invalidated and no failed-attempt marker was published"
                ],
            )
            raise
        secondary_errors: list[str] = []
        if lifecycle_context.get("sourceContractPassed") is True:
            for stale_name in (
                "pet-battle-final-release-attestation.json",
                "pet-battle-export-qa-report.json",
            ):
                stale = resolved_output_dir / stale_name
                try:
                    if stale.exists() or stale.is_symlink():
                        stale.unlink()
                except BaseException as stale_error:
                    secondary_errors.append(
                        f"cannot invalidate stale pass artifact {stale}: {stale_error}"
                    )
        qa_lane = lifecycle_context.get("qaLane")
        already_cleaned = lifecycle_context.get("cleaned") is True
        qa_lane_attempted_without_payload = (
            lifecycle_context.get("qaLaneAttempted") is True
            and not isinstance(qa_lane, dict)
        )
        cleanup_attempted_without_trusted_absence = (
            lifecycle_context.get("cleanupAttempted") is True
            and not already_cleaned
        )
        preserve = (
            _process_exception_requires_lane_preservation(exc)
            or qa_lane_attempted_without_payload
            or cleanup_attempted_without_trusted_absence
        )
        cleanup_trusted: bool | None = True if already_cleaned else None
        cleanup_became_unknown = False
        if qa_lane_attempted_without_payload:
            cleanup_trusted = False
            secondary_errors.append(
                "QA lane prepare was invoked but returned no trusted payload; lane/lock state is "
                "unknown and no cleanup or recovery was attempted"
            )
        if cleanup_attempted_without_trusted_absence:
            cleanup_trusted = False
            cleanup_became_unknown = True
            secondary_errors.append(
                "QA lane cleanup was attempted without trusted post-cleanup absence; lane/lock "
                "state is unknown and no retry or recovery was attempted"
            )
        if isinstance(qa_lane, dict) and not already_cleaned and not preserve:
            try:
                verify_qa_lane_or_preserve(
                    resolved_repo_root,
                    qa_lane,
                    "trusted_product_failure_cleanup_precheck",
                )
            except BaseException as precheck_error:
                preserve = True
                secondary_errors.append(
                    "trusted product failure cleanup precheck verification is untrusted; "
                    "cleanup/recovery was not attempted and the lane/lock were preserved: "
                    + safe_exception_text(precheck_error)
                )
            else:
                lifecycle_context["cleanupAttempted"] = True
                try:
                    cleanup_result = cleanup_qa_lane(resolved_repo_root, qa_lane)
                    lifecycle_context["cleanupReturned"] = True
                    lifecycle_context["cleanup"] = cleanup_result
                    lifecycle_context["postCleanupInspectionAttempted"] = True
                    inspect_cleaned_qa_lane(resolved_repo_root, qa_lane)
                    lifecycle_context["cleaned"] = True
                    cleanup_trusted = True
                except BaseException as cleanup_error:
                    cleanup_trusted = False
                    cleanup_became_unknown = True
                    secondary_errors.append(
                        "trusted product failure cleanup became untrusted; lane recovery was not attempted: "
                        + safe_exception_text(cleanup_error)
                    )
        if preserve and not isinstance(exc, QaLanePreservationRequired):
            secondary_errors.append(
                "untrusted process/lane evidence requires preserving the QA lane and lock"
            )
        if lifecycle_context.get("sourceContractPassed") is True:
            pass_invalidated = all(
                not path.exists() and not path.is_symlink()
                for path in (
                    resolved_output_dir / "pet-battle-final-release-attestation.json",
                    resolved_output_dir / "pet-battle-export-qa-report.json",
                )
            )
            if qa_lane_attempted_without_payload:
                qa_lane_disposition = "unknown"
            elif cleanup_attempted_without_trusted_absence or cleanup_became_unknown:
                qa_lane_disposition = "unknown"
            elif not isinstance(qa_lane, dict):
                qa_lane_disposition = "not_created"
            elif preserve:
                qa_lane_disposition = "preserved"
            elif lifecycle_context.get("cleaned") is True:
                qa_lane_disposition = "cleaned"
            else:
                qa_lane_disposition = "unknown"
            try:
                marker_path = write_export_gate_failure_marker(
                    resolved_output_dir,
                    attempt_id=str(
                        lifecycle_context.get("attemptId") or os.urandom(16).hex()
                    ),
                    primary=exc,
                    secondary_errors=secondary_errors,
                    qa_lane_disposition=qa_lane_disposition,
                    cleanup_trusted=cleanup_trusted,
                    preservation_required=preserve,
                    pass_artifacts_invalidated=pass_invalidated,
                )
                secondary_errors.append(
                    f"failed attempt authority={marker_path} passArtifactsInvalidated={str(pass_invalidated).lower()} qaLaneDisposition={qa_lane_disposition} cleanupTrusted={str(cleanup_trusted).lower()} preservationRequired={str(preserve).lower()}"
                )
            except BaseException as marker_error:
                secondary_errors.append(
                    f"cannot publish failed-attempt authority: {marker_error}"
                )
        append_primary_error_context(exc, secondary_errors)
        if secondary_errors and hasattr(exc, "add_note"):
            for note in secondary_errors:
                exc.add_note(note)
        raise


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-root", type=Path, default=REPO_ROOT)
    parser.add_argument("--godot", type=Path)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--preset", default=DEFAULT_PRESET)
    return parser.parse_args()


def main() -> int:
    args = _parse_args()
    godot = args.godot
    if godot is None:
        discovered = shutil.which("godot")
        if not discovered:
            print("ERROR Godot executable was not found")
            return 1
        godot = Path(discovered)
    try:
        result = run_export_gate(
            repo_root=args.repo_root,
            godot_executable=godot,
            output_dir=args.output_dir,
            preset_name=args.preset,
        )
    except (ExportGateError, OSError, subprocess.SubprocessError) as exc:
        print(f"ERROR {safe_exception_text(exc)}")
        return 1
    final = result["finalReleaseAttestation"]
    print(
        "pet battle export gate: passed "
        f"pck_sha256={final['pckSha256']} qa_sha256={final['qaReportSha256']} "
        f"attestation_sha256={result['finalReleaseAttestationSha256']} "
        f"attestation={Path(result['outputDir']) / 'pet-battle-final-release-attestation.json'}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
