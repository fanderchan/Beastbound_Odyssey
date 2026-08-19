#!/usr/bin/env python3
"""Shared fail-closed capture/media core for formal owner-review recorders.

The module deliberately owns only lane lifecycle, capture, and media
validation.  The historical standalone management default flag is not
registered by Main and is not claimed as a completed recorder entry point in
this slice.  The formal Phase403 battle-layout recorder and performance probe
reuse this core.

Every run claims the fixed, owner-attested ``automation`` QA lane before any
Godot process.  The recorder does not start a backend, access MySQL, or invoke
any repository ops command.
"""

from __future__ import annotations

import argparse
import ast
import hashlib
import importlib.util
import json
import math
import os
import re
import secrets
import shlex
import shutil
import signal
import struct
import subprocess
import sys
import time
import uuid
from datetime import datetime, timezone
from fractions import Fraction
from pathlib import Path
from typing import Any, Mapping, Sequence


REPO_ROOT = Path(__file__).resolve().parents[1]
GODOT_PROJECT = REPO_ROOT / "client" / "godot"
MAIN_SCENE = "res://scenes/Main.tscn"
DEFAULT_OUTPUT_ROOT = Path(
    ".run/evidence/phase373_pet_management_owner_review"
)
DEFAULT_CAPTURE_FLAG = "--pet-management-review-capture"

REPORT_SCHEMA_VERSION = 2
REPORT_TYPE = "beastbound_pet_management_owner_review_video"
EXPECTED_WIDTH = 1280
EXPECTED_HEIGHT = 720
EXPECTED_FPS = Fraction(30, 1)
EXPECTED_VIDEO_CODEC = "h264"
EXPECTED_PIXEL_FORMAT = "yuv420p"
EXPECTED_AUDIO_CODEC = "aac"
MIN_DURATION_SECONDS = 1.0
DEFAULT_SAMPLE_COUNT = 8
MAX_SAMPLE_COUNT = 16
CONTACT_CELL_WIDTH = 320
CONTACT_CELL_HEIGHT = 180
SAFE_RUN_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")
SAFE_USER_ARGUMENT = re.compile(
    r"^--[A-Za-z0-9][A-Za-z0-9._-]*(?:=[^\x00\r\n]*)?$"
)
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
SENSITIVE_ARGUMENT = re.compile(
    r"(?:password|passwd|secret|token|credential|api[-_]?key)",
    re.IGNORECASE,
)

QA_LANE = "automation"
QA_LANE_FEATURE = "beastbound_qa_automation"
QA_LANE_CUSTOM_USER_DIR_NAME = "BeastboundOdysseyQA_Automation"
QA_LANE_ARGUMENT = "--beastbound-qa-user-data-lane=automation"
QA_ATTESTATION_PREFIX = "BEASTBOUND_QA_USER_DATA_ATTESTATION: "
CONTAINMENT_SCOPE = "cooperative_inherited_pgid"
ANSI_SGR = re.compile(
    r"\x1b\[(?:0|[1-9][0-9]{0,2})(?:;(?:0|[1-9][0-9]{0,2})){0,7}m"
)
LANE_HELPER_PATH = REPO_ROOT / "tools" / "godot_qa_user_data_lane.py"
PET_CODEX_RECORDER_PATH = (
    REPO_ROOT / "tools" / "record_pet_codex_awakened_owner_review.py"
)
BATTLE_LAYOUT_RECORDER_PATH = (
    REPO_ROOT / "tools" / "record_battle_layout_owner_review.py"
)
BATTLE_LAYOUT_PERF_PATH = (
    REPO_ROOT / "tools" / "capture_battle_layout_perf.py"
)
# These in-source digests are a non-adversarial regression oracle for wiring
# drift.  They are not an integrity signature against a same-UID actor who can
# synchronously rewrite both implementation and oracle before execution.
MANAGEMENT_RECORDER_CONTRACT_FUNCTION_SHA256 = {
    "_build_godot_command": "a091a7cbad7a37a6d71ba46f556a0b174367f47c77866d1b0e2a6c31aca3d500",
    "_build_lane_environment": "eb3b3558001ab5d5ed97c0ff5fd6544e3051d1105a6cc9a768a62402c50b6af9",
    "_build_native_godot_command": "0d9428a1260cab1f2d71b671619a89709075b63debf86c62fab286c6ba54ad17",
    "_cleanup_automation_lane": "d8791caf971935c52e7a916658aee3d99c227a166e78488172e89a4f9da9d2fb",
    "_failure_envelope": "c7d8097e196ba3de7f877f239e230348ca0e6a9db433c65d843e552b1627ba2b",
    "_godot_help_has_exact_tools_options": "cf0dab57d2828baedf5de691d93f47f47a4da1937e75aa063b85e2ceff41d363",
    "_inspect_clean_automation_lane": "359356f99d3024941e90d2f7ae06ce6f528f09ef94809cbfc5099306ca636b8d",
    "_is_exact_godot_47_version": "0c44db57b77b46807794449b14b7272805d67b7fa7d4e9dbd09162a0da9eee0a",
    "_mark_active_lane_signal": "72050cd6e9e7ce036f875591f7f00520903ad881a12c13d6146766fc7ec58fee",
    "_load_lane_helper": "a03b63e8193885134c6afd0fa63ff9473578bdfa8d9d92f3a3f692d875a4797b",
    "_parse_exact_qa_lane_attestation": "1b9968e8a74dcae7efdf5b203468e7f9fa1df9727f7ff2444131d608f9fffe59",
    "_prepare_automation_lane": "4c5c905a233de06339cb45c7966caa942a9289d7850177dc80645f34e1dea892",
    "_record": "fbef58d17cf28d7e2fc4912c59c7f99031b107eff21026778755a7ae6ed5bc32",
    "_record_into": "ee90182360a5fd9f42b66816863609444d440eed11a58ea5db85d71a4348e676",
    "_require_contained_godot_process": "0928724c39c0920d9b161f8b95b5c814d10af8bed857b331b98fd9056328c1cc",
    "_run_godot_with_settlement": "967586ce82ab4b2cb31d73221e6d239cdf14bfbc144de01fea1ab6696d62552e",
    "_run_official_lane_godot_sequence": "3688e2320deed6ecaa76fa5c0a8108055dbcc8991e3e2b3a756f4213a4037bf6",
    "_run_official_lane_godot_sequence_active": "def8ed260eec89f4e9b2f9966081dd3b8a33ce5718f58ba63f3fcc03960eb73b",
    "_settle_godot_process_group": "ea6ae64c952eaca4ff1979987eb9181b8d2c62e46dab947669142250ebc6f3a4",
    "_top_level_contract_source": "f3504c2c349de83e2265698249ab9e5cc1ee168b69ef3ff0b1c4c4dc727bddae",
    "_validate_lane_source_contract": "2d7c10df96186bd0792f59305528c5f8ff70b80aab9dc2a869d235c81b55906a",
    "_validate_recorder_source_contract": "44ddd2c829fd6c99a59ee4acde412b7bacfc42f4aa13de22a5cdf9e1e46fdeb0",
    "_verify_automation_lane": "6f70775261a4c17e6f649f121505424c69be353704768b6dee46cd11f788b69a",
    "_write_lifecycle_authority": "0ac5249d797e93474857fe4c62abb6fdc956f877156068dbb2a93859962177ed",
    "_write_failure_summary": "e08a3a7b40e6b80133c1ca179a92add82c2502662b4107914ade28b072e562c4",
    "_write_sha256_manifest": "3db0dff1ad3938f55d998515d3a92e72756799df30b62f25259161e24f267362",
    "_write_secure_json": "79211ef4a31c888f1950ad49ad5e7a3ab86969f8b1cfa76ddc41f4d5ebadb0b4",
}
CODEX_RECORDER_CONTRACT_FUNCTION_SHA256 = {
    "_build_godot_command": "a081e1f1f3284fc883be7737dc7d11d2d0d50f5abac61e34f57bd4ce42d331a3",
    "_build_native_perf_command": "a2008371e64474d45c2de2d852337e24bbc6ab45109177693167a38dab07f55f",
    "_load_media_core": "3320dcebbf5434f41a0df5825751fe314fffc8acbb41b9cc8b6e50c8f3772c36",
    "_parser": "523c5e23aa4595a8350d222088c9741288aa969d7338b1df637ea046dfc31899",
    "_record": "767b9f188430052d33d15506d5d7e1c161513986a0d82b4d20207792fe443ee5",
    "_record_into": "b46bdd64f0fa21b125f958e52e86d56446dd33972ffd826c566e6523138d02ad",
    "_require_main_hosted_capture_wiring": "0d91a34a49a1bfbd5cb77a13dc50bb6279b63a2c9dac3c2988ba061ff281d46a",
    "_validate_godot_log": "4572b99c7af808747ff8be123736949004397a4a7161a1929172a32801920093",
    "_write_failure_summary": "264c02f992b9d325e4e190430738f96dd39b8218df51a8492ba4ea2fba9bc4b7",
}
BATTLE_LAYOUT_RECORDER_CONTRACT_FUNCTION_SHA256 = {
    "_build_godot_command": "652e1efba665dde472083d256853fcef46c1a5414bb57a561ec6791a1244159d",
    "_build_native_godot_command": "1fcfe2cbf501f383677da96bb827362d317c2879d7715ae37bf8be03bfd26b09",
    "_parse_attack_input_json": "c1fde8f2654a3781424b7d529649f5433634845ad0256f325c7702efecda4a20",
    "_parse_fields": "35de7d3e6ea91a7a3074bc79eaf6090071465f6302a1c780a50d8ca80de2fc7e",
    "_parser": "388b9806a735d1928573209901733f45406e82c5b13910baafb2e9f6b4d0f85c",
    "_phase403_capture_contract": "66e0cd1cf721d521077ee70ca8c3274f293db778eba1f322c46466b3a72f5a20",
    "_record": "f26e4e7a5f092a9f59a912fe31186dc593346fb90f43a8d8b2124e52c3af6424",
    "_record_into": "ef64d81c55f601a1494b7ec13f154fe6203f6320b82faed5e73637753b9958d1",
    "_require_main_flag_wiring": "7a17b45f60b05eac2dc60465ee0edb9540ecdae824d7b38041287bc71f966c44",
    "_strict_json_loads": "a33e05e101212d81700eb07da12dc7f58063c0faed41e4075fe7270099d9369c",
    "_validate_arena_visual_marker": "6f9f06d4612e5abdc1e95c0edbc22e4773ff856638dad51b9841f7df3f29accc",
    "_validate_godot_log": "621909751df4cc783433a80beabe520f605fe73451eb2d5f3c57700abf1de3c3",
    "_write_failure_summary": "9d4894314a1ed3530fcf1af3d0d1afcd6a7ba237882d13c0c2419832683136f1",
    "main": "9178120f6d68b5e9370fb05ca0fca57dd6cc7e0851a02113fcf56dafe7fe0176",
}
BATTLE_LAYOUT_PERF_CONTRACT_FUNCTION_SHA256 = {
    "_build_godot_command": "949823083f5564baa1a8415294f6a0ca957ca781b9f2703a95a61a3d07398fe7",
    "_capture": "075c3a53fc7ca7ac23fbbdda2d6ef4c3fbe91766f43ccc3fcc0a399b77164a6c",
    "_capture_into": "61e4caa6c8cba2b016ae20d1ced56d3cbfdb0664ed6a39b54f383f77c65f8e8e",
    "_parse_fields": "03c64b4f67e39cb37aeabef1fabeeff6f2d0b9c81fd75e81674506b5ad1d7e0d",
    "_parse_json_marker": "7c55fd2f4e21d98c60638e08ab7f5edaf5d952ae212e30265386939965d22334",
    "_parse_number": "66ab5d2adad2414b7aad46dfef31cfbc271558e1495859cc91618c7b74e243c1",
    "_parser": "b8fe2acb42ef6c249d78925d69ba16e272bc6ffa894c05f9e647b82ba2c06b7f",
    "_require_perf_wiring": "39bb047b8fffa9059fcb9a841e4630c7903de33c1fdc975710b8aac008b8a19f",
    "_strict_json_loads": "df3ccc478a7cae28e4e53d26115a060dbd73d15b9704e6ed07707a84f4e862dc",
    "_validate_godot_log": "5826b6754fa1b4c3400381a844929e0e08db5e5625f1d410fcc09bfd7a858565",
    "_write_failure_summary": "9d4894314a1ed3530fcf1af3d0d1afcd6a7ba237882d13c0c2419832683136f1",
    "_write_manifest": "19319ed92ab24c15d29ce555a6966c82807dafe5953a02722206e7f7ab8386a8",
    "main": "f50515d9c20c22b54ba2f25d955daf5c3dce1e3ed9602df4592e92c82f77330f",
}
RECORDER_TOP_LEVEL_CONTRACT_SHA256 = {
    "management recorder": "cc729f91ee89f859f510a1b8bcb145653cee973ced3b1210c71419cc20d4fba5",
    "pet codex recorder": "5e876d5d8bfe225583ee62bbfb911071e91a3927ec1987b7d0fcfa3468ddc58e",
    "battle layout recorder": "8ae2768df333ec963859a432006444d14acab0f81a986aab67fe03eef4d7522c",
    "battle layout perf": "e0a10520ccaf6df3b8b07167ac87a5ec50b33415a923dac9fc8d85c2bc8204be",
}
_LANE_HELPER_MODULE_NAME = "_beastbound_owner_review_lane_helper"


class PetManagementRecordingError(RuntimeError):
    """A pet-management owner-review recording contract failure."""


def _load_lane_helper() -> Any:
    spec = importlib.util.spec_from_file_location(
        _LANE_HELPER_MODULE_NAME,
        LANE_HELPER_PATH,
    )
    if spec is None or spec.loader is None:
        raise RuntimeError(f"无法加载 QA lane helper：{LANE_HELPER_PATH}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[_LANE_HELPER_MODULE_NAME] = module
    spec.loader.exec_module(module)
    return module


LANE_HELPER = _load_lane_helper()


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _new_run_id() -> str:
    timestamp = _utc_now().strftime("%Y%m%dT%H%M%S.%fZ")
    return f"phase373-{timestamp}-{uuid.uuid4().hex[:8]}"


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _repo_relative(path: Path) -> str:
    resolved = path.resolve(strict=False)
    try:
        return resolved.relative_to(REPO_ROOT).as_posix()
    except ValueError as error:
        raise PetManagementRecordingError(
            f"证据路径越出仓库根目录：{path}"
        ) from error


def _resolve_output_root(path: Path) -> Path:
    resolved = (
        path.resolve(strict=False)
        if path.is_absolute()
        else (REPO_ROOT / path).resolve(strict=False)
    )
    evidence_root = (REPO_ROOT / ".run" / "evidence").resolve(strict=False)
    try:
        resolved.relative_to(evidence_root)
    except ValueError as error:
        raise PetManagementRecordingError(
            "录像输出必须位于仓库 .run/evidence/ 下"
        ) from error
    return resolved


def _write_json(path: Path, value: Any) -> None:
    temporary = path.with_name(f".{path.name}.tmp")
    temporary.write_text(
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    temporary.replace(path)


def _artifact_record(path: Path) -> dict[str, Any]:
    if not path.is_file():
        raise PetManagementRecordingError(
            f"证据文件不存在：{_repo_relative(path)}"
        )
    size = path.stat().st_size
    if size <= 0:
        raise PetManagementRecordingError(
            f"证据文件为空：{_repo_relative(path)}"
        )
    return {
        "path": _repo_relative(path),
        "sizeBytes": size,
        "sha256": _sha256(path),
    }


def _require_executable(value: str, *, label: str) -> str:
    resolved = shutil.which(value)
    if resolved is None:
        raise PetManagementRecordingError(
            f"找不到 {label} 可执行文件：{value}"
        )
    return resolved


def _redacted_command(command: Sequence[str]) -> list[str]:
    redacted: list[str] = []
    for value in command:
        argument = str(value)
        if "=" in argument:
            name, _separator, _payload = argument.partition("=")
            if SENSITIVE_ARGUMENT.search(name):
                redacted.append(f"{name}=[REDACTED_SECRET]")
                continue
        redacted.append(argument)
    return redacted


def _safe_error_text(value: BaseException) -> str:
    try:
        text = str(value)
    except BaseException:
        return "<unreadable exception>"
    return text or type(value).__name__


def _failure_envelope(error: BaseException) -> dict[str, Any]:
    envelope: dict[str, Any] = {
        "errorType": type(error).__name__,
        "error": _safe_error_text(error),
    }
    if isinstance(error, GodotLanePreservationError):
        envelope["lanePreservationReason"] = error.reason
        envelope["lanePreservationEvidence"] = dict(error.evidence)
    cause = getattr(error, "__cause__", None)
    if isinstance(cause, BaseException):
        envelope["cause"] = {
            "errorType": type(cause).__name__,
            "error": _safe_error_text(cause),
        }
    return envelope


def _write_all(descriptor: int, payload: bytes) -> None:
    offset = 0
    while offset < len(payload):
        written = os.write(descriptor, payload[offset:])
        if written <= 0:
            raise PetManagementRecordingError("证据文件发生短写")
        offset += written


def _fsync_parent_directory(path: Path) -> None:
    flags = os.O_RDONLY | getattr(os, "O_DIRECTORY", 0)
    descriptor = os.open(path.parent, flags)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def _write_secure_json(path: Path, value: Any, *, exclusive: bool = False) -> None:
    payload = (
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    ).encode("utf-8")
    temporary = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
    descriptor: int | None = None
    try:
        descriptor = os.open(
            temporary,
            os.O_CREAT | os.O_EXCL | os.O_WRONLY,
            0o600,
        )
        _write_all(descriptor, payload)
        os.fsync(descriptor)
        os.close(descriptor)
        descriptor = None
        if exclusive:
            os.link(temporary, path, follow_symlinks=False)
        else:
            os.replace(temporary, path)
        _fsync_parent_directory(path)
    finally:
        if descriptor is not None:
            os.close(descriptor)
        try:
            temporary.unlink()
        except FileNotFoundError:
            pass
    if exclusive:
        _fsync_parent_directory(path)


def _persist_lane_owner(run_dir: Path, owner: str) -> Path:
    if re.fullmatch(r"[0-9a-f]{32}", owner) is None:
        raise PetManagementRecordingError("QA lane owner 必须是 32 位小写十六进制")
    path = run_dir / "qa-lane-owner.json"
    _write_secure_json(
        path,
        {
            "lane": QA_LANE,
            "owner": owner,
            "recoveryPolicy": "manual_inspect_only_after_external_no_process_confirmation",
        },
        exclusive=True,
    )
    return path


def _require_exact_keys(value: Mapping[str, Any], keys: set[str], label: str) -> None:
    if set(value) != keys:
        raise PetManagementRecordingError(
            f"{label} 字段不精确：expected={sorted(keys)} actual={sorted(value)}"
        )


def _require_lower_hex(value: Any, length: int, label: str) -> str:
    if type(value) is not str or re.fullmatch(rf"[0-9a-f]{{{length}}}", value) is None:
        raise PetManagementRecordingError(f"{label} 必须是 {length} 位小写十六进制")
    return value


def _require_non_negative_integer(value: Any, label: str) -> int:
    if type(value) is not int or value < 0:
        raise PetManagementRecordingError(f"{label} 必须是非负整数")
    return value


def _normalized_absolute_path(value: Any, label: str) -> str:
    if type(value) is not str or not value or not os.path.isabs(value):
        raise PetManagementRecordingError(f"{label} 必须是绝对路径字符串")
    return os.path.normcase(os.path.normpath(value))


def _paths_intersect(first: str, second: str) -> bool:
    try:
        common = os.path.commonpath((first, second))
    except ValueError:
        return False
    return common in (first, second)


def _validate_editor_custom_features(value: Any, existing: str) -> str:
    if type(value) is not str:
        raise PetManagementRecordingError("editorCustomFeatures 必须是字符串")
    tokens = value.split(",") if value else []
    if (
        any(not token or token != token.strip() for token in tokens)
        or len(tokens) != len(set(tokens))
        or tokens.count(QA_LANE_FEATURE) != 1
        or any(
            token.startswith("beastbound_qa_") and token != QA_LANE_FEATURE
            for token in tokens
        )
    ):
        raise PetManagementRecordingError("editorCustomFeatures QA feature 不唯一")
    expected = LANE_HELPER.merge_editor_custom_features(existing, QA_LANE_FEATURE)
    if value != expected:
        raise PetManagementRecordingError("editorCustomFeatures 未精确保留原 feature")
    return value


def _top_level_function_sources(source: str, label: str) -> tuple[ast.Module, dict[str, str]]:
    try:
        tree = ast.parse(source)
    except SyntaxError as error:
        raise PetManagementRecordingError(f"{label} source 无法解析") from error
    lines = source.splitlines(keepends=True)
    functions: dict[str, str] = {}
    for node in tree.body:
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        if node.name in functions or node.end_lineno is None:
            raise PetManagementRecordingError(f"{label} function 重复或缺少边界：{node.name}")
        if node.decorator_list:
            raise PetManagementRecordingError(f"{label} contracted function 不得有 decorator：{node.name}")
        functions[node.name] = "".join(lines[node.lineno - 1:node.end_lineno])
    return tree, functions


def _top_level_contract_source(source: str, tree: ast.Module) -> str:
    excluded_assignments = {
        "MANAGEMENT_RECORDER_CONTRACT_FUNCTION_SHA256",
        "CODEX_RECORDER_CONTRACT_FUNCTION_SHA256",
        "BATTLE_LAYOUT_RECORDER_CONTRACT_FUNCTION_SHA256",
        "BATTLE_LAYOUT_PERF_CONTRACT_FUNCTION_SHA256",
        "RECORDER_TOP_LEVEL_CONTRACT_SHA256",
    }
    lines = source.splitlines(keepends=True)
    chunks: list[str] = []
    for index, statement in enumerate(tree.body):
        if isinstance(statement, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        if index == len(tree.body) - 1 and isinstance(statement, ast.If):
            continue
        if (
            isinstance(statement, ast.Assign)
            and len(statement.targets) == 1
            and isinstance(statement.targets[0], ast.Name)
            and statement.targets[0].id in excluded_assignments
        ):
            continue
        if statement.end_lineno is None:
            raise PetManagementRecordingError("recorder top-level statement 缺少源边界")
        chunks.append("".join(lines[statement.lineno - 1:statement.end_lineno]))
    return "".join(chunks)


def _validate_recorder_source_contract(
    management_source: str | None = None,
    codex_source: str | None = None,
    battle_layout_source: str | None = None,
    battle_layout_perf_source: str | None = None,
) -> None:
    management_text = (
        management_source
        if management_source is not None
        else Path(__file__).read_text(encoding="utf-8")
    )
    codex_text = (
        codex_source
        if codex_source is not None
        else PET_CODEX_RECORDER_PATH.read_text(encoding="utf-8")
    )
    battle_layout_text = (
        battle_layout_source
        if battle_layout_source is not None
        else BATTLE_LAYOUT_RECORDER_PATH.read_text(encoding="utf-8")
    )
    battle_layout_perf_text = (
        battle_layout_perf_source
        if battle_layout_perf_source is not None
        else BATTLE_LAYOUT_PERF_PATH.read_text(encoding="utf-8")
    )
    contracts = (
        (
            "management recorder",
            management_text,
            MANAGEMENT_RECORDER_CONTRACT_FUNCTION_SHA256,
            {
                "REPORT_SCHEMA_VERSION": 2,
                "QA_LANE": "automation",
                "QA_LANE_FEATURE": "beastbound_qa_automation",
                "QA_LANE_CUSTOM_USER_DIR_NAME": "BeastboundOdysseyQA_Automation",
                "QA_LANE_ARGUMENT": "--beastbound-qa-user-data-lane=automation",
                "CONTAINMENT_SCOPE": "cooperative_inherited_pgid",
            },
        ),
        (
            "pet codex recorder",
            codex_text,
            CODEX_RECORDER_CONTRACT_FUNCTION_SHA256,
            {
                "REPORT_SCHEMA_VERSION": 2,
                "MAIN_SCENE": "res://scenes/Main.tscn",
                "CAPTURE_FLAG": "--pet-codex-awakened-owner-review-capture",
                "NATIVE_PERF_FLAG": "--pet-codex-awakened-owner-review-native-perf",
            },
        ),
        (
            "battle layout recorder",
            battle_layout_text,
            BATTLE_LAYOUT_RECORDER_CONTRACT_FUNCTION_SHA256,
            {
                "REPORT_SCHEMA_VERSION": 2,
                "MAIN_SCENE": "res://scenes/Main.tscn",
                "CAPTURE_FLAG": "--phase403-battle-layout-owner-review-capture",
                "REPORT_TYPE": "beastbound_phase403_battle_layout_main_owner_review_video",
            },
        ),
        (
            "battle layout perf",
            battle_layout_perf_text,
            BATTLE_LAYOUT_PERF_CONTRACT_FUNCTION_SHA256,
            {
                "REPORT_SCHEMA_VERSION": 2,
                "MAIN_SCENE": "res://scenes/Main.tscn",
                "PERF_CAPTURE_FLAG": "--phase403-battle-layout-perf",
                "REPORT_TYPE": "beastbound_phase403_battle_layout_real_main_performance",
            },
        ),
    )
    expected_guard_source = (
        'if __name__ == "__main__":\n'
        '    raise SystemExit(main())\n'
    )
    required_management = {
        "_build_godot_command", "_build_lane_environment",
        "_build_native_godot_command", "_cleanup_automation_lane",
        "_failure_envelope", "_godot_help_has_exact_tools_options",
        "_inspect_clean_automation_lane", "_is_exact_godot_47_version",
        "_load_lane_helper", "_mark_active_lane_signal",
        "_parse_exact_qa_lane_attestation", "_prepare_automation_lane",
        "_record", "_record_into", "_require_contained_godot_process",
        "_run_godot_with_settlement", "_run_official_lane_godot_sequence",
        "_run_official_lane_godot_sequence_active",
        "_settle_godot_process_group", "_top_level_contract_source",
        "_validate_lane_source_contract", "_validate_recorder_source_contract",
        "_verify_automation_lane", "_write_lifecycle_authority",
        "_write_failure_summary", "_write_sha256_manifest",
        "_write_secure_json",
    }
    required_codex = {
        "_build_godot_command", "_build_native_perf_command", "_load_media_core",
        "_parser", "_record", "_record_into",
        "_require_main_hosted_capture_wiring", "_validate_godot_log",
        "_write_failure_summary",
    }
    required_battle_layout = {
        "_build_godot_command", "_build_native_godot_command", "_parser",
        "_parse_attack_input_json", "_parse_fields",
        "_phase403_capture_contract", "_record", "_record_into",
        "_require_main_flag_wiring", "_strict_json_loads",
        "_validate_arena_visual_marker", "_validate_godot_log",
        "_write_failure_summary", "main",
    }
    required_battle_layout_perf = {
        "_build_godot_command", "_capture", "_capture_into", "_parser",
        "_parse_fields", "_parse_json_marker", "_parse_number",
        "_require_perf_wiring",
        "_strict_json_loads", "_validate_godot_log",
        "_write_failure_summary", "_write_manifest", "main",
    }
    required_classes = {
        "management recorder": {
            "PetManagementRecordingError",
            "GodotLanePreservationError",
            "GodotRecorderSignal",
        },
        "pet codex recorder": {"PetCodexRecordingError"},
        "battle layout recorder": {"Phase403BattleLayoutRecordingError"},
        "battle layout perf": {"Phase403BattleLayoutPerfError"},
    }
    if set(MANAGEMENT_RECORDER_CONTRACT_FUNCTION_SHA256) != required_management:
        raise PetManagementRecordingError("management recorder function keyset 不精确")
    if set(CODEX_RECORDER_CONTRACT_FUNCTION_SHA256) != required_codex:
        raise PetManagementRecordingError("pet codex recorder function keyset 不精确")
    if (
        set(BATTLE_LAYOUT_RECORDER_CONTRACT_FUNCTION_SHA256)
        != required_battle_layout
    ):
        raise PetManagementRecordingError(
            "battle layout recorder function keyset 不精确"
        )
    if (
        set(BATTLE_LAYOUT_PERF_CONTRACT_FUNCTION_SHA256)
        != required_battle_layout_perf
    ):
        raise PetManagementRecordingError(
            "battle layout perf function keyset 不精确"
        )
    if set(RECORDER_TOP_LEVEL_CONTRACT_SHA256) != {
        "management recorder", "pet codex recorder",
        "battle layout recorder", "battle layout perf"
    }:
        raise PetManagementRecordingError("recorder top-level keyset 不精确")
    for label, source, digests, constants in contracts:
        tree, functions = _top_level_function_sources(source, label)
        lines = source.splitlines(keepends=True)
        guard_source = (
            "".join(lines[tree.body[-1].lineno - 1:tree.body[-1].end_lineno])
            if tree.body and tree.body[-1].end_lineno is not None
            else ""
        )
        if guard_source != expected_guard_source:
            raise PetManagementRecordingError(f"{label} main guard 不精确")
        classes: dict[str, ast.ClassDef] = {}
        for index, statement in enumerate(tree.body):
            if (
                index == 0
                and isinstance(statement, ast.Expr)
                and isinstance(statement.value, ast.Constant)
                and isinstance(statement.value.value, str)
            ):
                continue
            if index == len(tree.body) - 1 and isinstance(statement, ast.If):
                continue
            if isinstance(
                statement,
                (ast.Import, ast.ImportFrom, ast.FunctionDef, ast.AsyncFunctionDef),
            ):
                continue
            if isinstance(statement, ast.ClassDef):
                if statement.name in classes or statement.decorator_list:
                    raise PetManagementRecordingError(
                        f"{label} class 重复或含 decorator：{statement.name}"
                    )
                classes[statement.name] = statement
                continue
            if (
                isinstance(statement, ast.Assign)
                and len(statement.targets) == 1
                and isinstance(statement.targets[0], ast.Name)
            ):
                continue
            if label != "management recorder" and isinstance(
                statement, (ast.Expr, ast.If)
            ):
                # Phase403 wrappers load their shared validation module at
                # import time. Their exact bootstrap is covered by the
                # top-level digest below; no wrapper may silently disappear.
                continue
            raise PetManagementRecordingError(
                f"{label} 包含未授权的顶层执行语句：{type(statement).__name__}"
            )
        if set(classes) != required_classes[label]:
            raise PetManagementRecordingError(f"{label} class keyset 不精确")
        top_level_digest = hashlib.sha256(
            _top_level_contract_source(source, tree).encode("utf-8")
        ).hexdigest()
        if top_level_digest != RECORDER_TOP_LEVEL_CONTRACT_SHA256[label]:
            raise PetManagementRecordingError(f"{label} top-level source changed")
        if set(digests) - set(functions):
            raise PetManagementRecordingError(f"{label} contracted function 缺失")
        protected = set(digests)
        for statement in tree.body:
            if isinstance(statement, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue
            rebound = {
                node.id
                for node in ast.walk(statement)
                if isinstance(node, ast.Name)
                and isinstance(node.ctx, (ast.Store, ast.Del))
                and node.id in protected
            }
            if rebound:
                raise PetManagementRecordingError(
                    f"{label} contracted function 被顶层重绑定：{sorted(rebound)}"
                )
        assignments: dict[str, Any] = {}
        for statement in tree.body:
            if (
                isinstance(statement, ast.Assign)
                and len(statement.targets) == 1
                and isinstance(statement.targets[0], ast.Name)
                and statement.targets[0].id in constants
            ):
                try:
                    assignments[statement.targets[0].id] = ast.literal_eval(statement.value)
                except (TypeError, ValueError) as error:
                    raise PetManagementRecordingError(
                        f"{label} constant 不是精确 literal"
                    ) from error
        if assignments != constants:
            raise PetManagementRecordingError(f"{label} safety constants 不精确")
        for name, expected in digests.items():
            actual = hashlib.sha256(functions[name].encode("utf-8")).hexdigest()
            if actual != expected:
                raise PetManagementRecordingError(
                    f"{label} function source changed: {name}"
                )


def _validate_lane_source_contract(lane_helper: Any = LANE_HELPER) -> dict[str, Any]:
    _validate_recorder_source_contract()
    lane_helper.validate_repository_contract(REPO_ROOT)
    return {"status": "source_contract_passed"}


def _build_lane_environment(
    base_environment: Mapping[str, str],
    prepared: Mapping[str, Any],
) -> dict[str, str]:
    environment = dict(base_environment)
    environment.update(
        {
            "GODOT_EDITOR_CUSTOM_FEATURES": str(prepared["editorCustomFeatures"]),
            "BEASTBOUND_QA_USER_DATA_LANE": QA_LANE,
            "BEASTBOUND_QA_EXPECTED_USER_DATA_ROOT": str(prepared["godotLaneRoot"]),
        }
    )
    for preserved in ("HOME", "XDG_DATA_HOME"):
        if environment.get(preserved) != base_environment.get(preserved):
            raise PetManagementRecordingError(
                f"QA lane environment 不得修改 {preserved}"
            )
    lane_keys = {
        "GODOT_EDITOR_CUSTOM_FEATURES",
        "BEASTBOUND_QA_USER_DATA_LANE",
        "BEASTBOUND_QA_EXPECTED_USER_DATA_ROOT",
    }
    changed_outside_lane = {
        key
        for key in set(environment) | set(base_environment)
        if key not in lane_keys
        and environment.get(key) != base_environment.get(key)
    }
    if changed_outside_lane:
        raise PetManagementRecordingError("QA lane environment 只能设置三个隔离变量")
    if (
        environment.get("GODOT_EDITOR_CUSTOM_FEATURES")
        != str(prepared["editorCustomFeatures"])
        or environment.get("BEASTBOUND_QA_USER_DATA_LANE") != QA_LANE
        or environment.get("BEASTBOUND_QA_EXPECTED_USER_DATA_ROOT")
        != str(prepared["godotLaneRoot"])
    ):
        raise PetManagementRecordingError("QA lane environment 隔离变量不精确")
    return environment


def _prepare_automation_lane(
    base_environment: Mapping[str, str],
    owner: str,
    lane_helper: Any = LANE_HELPER,
) -> dict[str, Any]:
    runner_pid = os.getppid()
    prepared = dict(
        lane_helper.prepare_lane(
            QA_LANE,
            str(base_environment.get("GODOT_EDITOR_CUSTOM_FEATURES", "")),
            owner,
            runner_pid,
        )
    )
    expected_keys = {
        "status", "lane", "owner", "feature", "customUserDirName",
        "laneRoot", "godotLaneRoot", "realRoot", "godotRealRoot",
        "realInventorySha256", "realEntryCount", "laneInventorySha256",
        "laneEntryCount", "editorCustomFeatures", "lockSchemaVersion",
        "runnerPid", "runnerStartIdentitySha256",
    }
    _require_exact_keys(prepared, expected_keys, "prepare payload")
    for field in (
        "status", "lane", "owner", "feature", "customUserDirName",
        "laneRoot", "godotLaneRoot", "realRoot", "godotRealRoot",
        "realInventorySha256", "laneInventorySha256", "editorCustomFeatures",
        "runnerStartIdentitySha256",
    ):
        if type(prepared[field]) is not str:
            raise PetManagementRecordingError(f"prepare {field} 必须是字符串")
    lane_root = _normalized_absolute_path(prepared["laneRoot"], "prepare laneRoot")
    godot_lane_root = _normalized_absolute_path(
        prepared["godotLaneRoot"], "prepare godotLaneRoot"
    )
    real_root = _normalized_absolute_path(prepared["realRoot"], "prepare realRoot")
    godot_real_root = _normalized_absolute_path(
        prepared["godotRealRoot"], "prepare godotRealRoot"
    )
    if (
        prepared["status"] != "prepared"
        or prepared["lane"] != QA_LANE
        or prepared["owner"] != owner
        or prepared["feature"] != QA_LANE_FEATURE
        or prepared["customUserDirName"] != QA_LANE_CUSTOM_USER_DIR_NAME
        or lane_root != godot_lane_root
        or real_root != godot_real_root
        or _paths_intersect(lane_root, real_root)
        or type(prepared["lockSchemaVersion"]) is not int
        or prepared["lockSchemaVersion"] != 2
        or type(prepared["runnerPid"]) is not int
        or prepared["runnerPid"] != runner_pid
    ):
        raise PetManagementRecordingError("prepare payload identity 不匹配")
    _require_lower_hex(prepared["owner"], 32, "prepare owner")
    _require_lower_hex(
        prepared["realInventorySha256"], 64, "prepare realInventorySha256"
    )
    _require_lower_hex(
        prepared["laneInventorySha256"], 64, "prepare laneInventorySha256"
    )
    _require_lower_hex(
        prepared["runnerStartIdentitySha256"],
        64,
        "prepare runnerStartIdentitySha256",
    )
    _require_non_negative_integer(prepared["realEntryCount"], "prepare realEntryCount")
    _require_non_negative_integer(prepared["laneEntryCount"], "prepare laneEntryCount")
    _validate_editor_custom_features(
        prepared["editorCustomFeatures"],
        str(base_environment.get("GODOT_EDITOR_CUSTOM_FEATURES", "")),
    )
    prepared["environment"] = _build_lane_environment(base_environment, prepared)
    prepared["lastLaneInventorySha256"] = prepared["laneInventorySha256"]
    prepared["lastLaneEntryCount"] = prepared["laneEntryCount"]
    return prepared


def _verify_automation_lane(
    session: dict[str, Any],
    lane_helper: Any = LANE_HELPER,
) -> dict[str, Any]:
    verified = dict(
        lane_helper.verify_lane(
            QA_LANE,
            str(session["owner"]),
            str(session["realInventorySha256"]),
        )
    )
    expected_keys = {
        "status", "lane", "owner", "feature", "laneRoot", "godotLaneRoot",
        "realRoot", "realInventorySha256", "realEntryCount", "realUnchanged",
        "laneInventorySha256", "laneEntryCount",
    }
    _require_exact_keys(verified, expected_keys, "verify payload")
    for field in (
        "status", "lane", "owner", "feature", "laneRoot", "godotLaneRoot",
        "realRoot", "realInventorySha256", "laneInventorySha256",
    ):
        if type(verified[field]) is not str:
            raise PetManagementRecordingError(f"verify {field} 必须是字符串")
    if (
        verified["status"] != "verified"
        or verified["lane"] != QA_LANE
        or verified["owner"] != session["owner"]
        or verified["feature"] != QA_LANE_FEATURE
        or verified["realUnchanged"] is not True
        or verified["realInventorySha256"] != session["realInventorySha256"]
        or verified["realEntryCount"] != session["realEntryCount"]
        or verified["laneRoot"] != session["laneRoot"]
        or verified["godotLaneRoot"] != session["godotLaneRoot"]
        or verified["realRoot"] != session["realRoot"]
    ):
        raise PetManagementRecordingError("verify payload identity 不匹配")
    _require_lower_hex(
        verified["realInventorySha256"], 64, "verify realInventorySha256"
    )
    _require_lower_hex(
        verified["laneInventorySha256"], 64, "verify laneInventorySha256"
    )
    _require_non_negative_integer(verified["realEntryCount"], "verify realEntryCount")
    _require_non_negative_integer(verified["laneEntryCount"], "verify laneEntryCount")
    session["lastLaneInventorySha256"] = verified["laneInventorySha256"]
    session["lastLaneEntryCount"] = verified["laneEntryCount"]
    return verified


def _cleanup_automation_lane(
    session: Mapping[str, Any],
    lane_helper: Any = LANE_HELPER,
) -> dict[str, Any]:
    cleaned = dict(
        lane_helper.cleanup_lane(
            QA_LANE,
            str(session["owner"]),
            str(session["realInventorySha256"]),
        )
    )
    expected_keys = {
        "status", "lane", "owner", "feature", "laneRoot", "laneAbsent",
        "removedLaneInventorySha256", "removedLaneEntryCount", "realRoot",
        "realInventorySha256", "realUnchanged",
    }
    _require_exact_keys(cleaned, expected_keys, "cleanup payload")
    for field in (
        "status", "lane", "owner", "feature", "laneRoot", "realRoot",
        "realInventorySha256", "removedLaneInventorySha256",
    ):
        if type(cleaned[field]) is not str:
            raise PetManagementRecordingError(f"cleanup {field} 必须是字符串")
    if (
        cleaned["status"] != "cleaned"
        or cleaned["lane"] != QA_LANE
        or cleaned["owner"] != session["owner"]
        or cleaned["feature"] != session["feature"]
        or cleaned["laneRoot"] != session["laneRoot"]
        or cleaned["realRoot"] != session["realRoot"]
        or cleaned["laneAbsent"] is not True
        or cleaned["realUnchanged"] is not True
        or cleaned["realInventorySha256"] != session["realInventorySha256"]
        or cleaned["removedLaneInventorySha256"] != session["lastLaneInventorySha256"]
        or cleaned["removedLaneEntryCount"] != session["lastLaneEntryCount"]
    ):
        raise PetManagementRecordingError("cleanup payload identity 不匹配")
    _require_lower_hex(
        cleaned["realInventorySha256"], 64, "cleanup realInventorySha256"
    )
    _require_lower_hex(
        cleaned["removedLaneInventorySha256"],
        64,
        "cleanup removedLaneInventorySha256",
    )
    _require_non_negative_integer(
        cleaned["removedLaneEntryCount"], "cleanup removedLaneEntryCount"
    )
    return cleaned


def _inspect_clean_automation_lane(
    session: Mapping[str, Any],
    lane_helper: Any = LANE_HELPER,
) -> dict[str, Any]:
    inspected = dict(lane_helper.inspect_lane(QA_LANE, str(session["owner"])))
    expected_keys = {
        "status", "lane", "owner", "feature", "laneRoot", "realRoot",
        "pendingLockState", "pendingLockPayloadSha256",
        "pendingLockedRealInventorySha256", "publishedLockState",
        "lockedRealInventorySha256", "laneRootState", "ownerCanaryState",
        "pendingOwnerState", "pendingOwnerPayloadSha256",
        "laneInventorySha256", "laneEntryCount", "realInventorySha256",
        "realEntryCount", "inspectionSha256",
    }
    _require_exact_keys(inspected, expected_keys, "post-clean inspect payload")
    for field in (
        "status", "lane", "owner", "feature", "laneRoot", "realRoot",
        "pendingLockState", "pendingLockPayloadSha256",
        "pendingLockedRealInventorySha256", "publishedLockState",
        "lockedRealInventorySha256", "laneRootState", "ownerCanaryState",
        "pendingOwnerState", "pendingOwnerPayloadSha256",
        "laneInventorySha256", "realInventorySha256", "inspectionSha256",
    ):
        if type(inspected[field]) is not str:
            raise PetManagementRecordingError(f"post-clean inspect {field} 必须是原生字符串")
    if (
        inspected.get("status") != "inspected"
        or inspected.get("lane") != QA_LANE
        or inspected.get("owner") != session["owner"]
        or inspected.get("feature") != session["feature"]
        or inspected.get("laneRoot") != session["laneRoot"]
        or inspected.get("realRoot") != session["realRoot"]
        or inspected.get("laneRootState") != "absent"
        or inspected.get("ownerCanaryState") != "not_applicable"
        or inspected.get("pendingOwnerState") != "not_applicable"
        or inspected.get("publishedLockState") != "absent"
        or inspected.get("pendingLockState") != "absent"
        or inspected.get("pendingLockPayloadSha256") != ""
        or inspected.get("pendingLockedRealInventorySha256") != ""
        or inspected.get("lockedRealInventorySha256") != ""
        or inspected.get("pendingOwnerPayloadSha256") != ""
        or inspected.get("laneEntryCount") != 0
        or inspected.get("laneInventorySha256")
        != hashlib.sha256(b"absent\n").hexdigest()
        or inspected.get("realInventorySha256") != session["realInventorySha256"]
        or inspected.get("realEntryCount") != session["realEntryCount"]
    ):
        raise PetManagementRecordingError("post-clean inspect 未证明 lane authority 消失")
    _require_lower_hex(
        inspected["laneInventorySha256"], 64, "inspect laneInventorySha256"
    )
    _require_lower_hex(
        inspected["realInventorySha256"], 64, "inspect realInventorySha256"
    )
    _require_lower_hex(inspected["inspectionSha256"], 64, "inspect inspectionSha256")
    _require_non_negative_integer(inspected["laneEntryCount"], "inspect laneEntryCount")
    _require_non_negative_integer(inspected["realEntryCount"], "inspect realEntryCount")
    inspection_report = dict(inspected)
    inspection_sha256 = inspection_report.pop("inspectionSha256")
    expected_inspection_sha256 = hashlib.sha256(
        json.dumps(
            inspection_report,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")
    ).hexdigest()
    if inspection_sha256 != expected_inspection_sha256:
        raise PetManagementRecordingError("post-clean inspectionSha256 与 payload 不绑定")
    return inspected


class GodotLanePreservationError(PetManagementRecordingError):
    """A Godot phase whose lane containment can no longer be trusted."""

    def __init__(self, message: str, *, reason: str, evidence: Mapping[str, Any]):
        super().__init__(message)
        self.preserve_lane = True
        self.reason = reason
        self.evidence = dict(evidence)


class GodotRecorderSignal(BaseException):
    """Convert termination signals into the bounded Godot settlement path."""

    def __init__(self, signum: int):
        super().__init__(f"recorder received signal {signum}")
        self.signum = signum


def _raise_godot_recorder_signal(signum: int, _frame: Any) -> None:
    raise GodotRecorderSignal(signum)


def _install_godot_signal_handlers(
    handler: Any = _raise_godot_recorder_signal,
) -> dict[int, Any]:
    if os.name != "posix":
        return {}
    old_handlers: dict[int, Any] = {}
    try:
        for signum in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP):
            old_handlers[signum] = signal.getsignal(signum)
            signal.signal(signum, handler)
    except BaseException:
        _restore_godot_signal_handlers(old_handlers)
        raise
    return old_handlers


def _restore_godot_signal_handlers(old_handlers: Mapping[int, Any]) -> None:
    for signum, handler in old_handlers.items():
        signal.signal(signum, handler)


def _process_group_exists(process_group: int) -> bool:
    try:
        os.killpg(process_group, 0)
    except ProcessLookupError:
        return False
    return True


def _settle_godot_process_group(
    process_group: int,
    *,
    leader_process: Any | None = None,
    dependencies: Mapping[str, Any] | None = None,
    timeout_seconds: float = 10.0,
) -> dict[str, Any]:
    deps = dict(dependencies or {})
    group_exists = deps.get("process_group_exists", _process_group_exists)
    kill_group = deps.get("killpg", os.killpg)
    monotonic = deps.get("monotonic", time.monotonic)
    sleep = deps.get("sleep", time.sleep)
    evidence = {
        "processGroupClosed": False,
        "processGroupResidualObserved": False,
        "processGroupTermSent": False,
        "processGroupKillSent": False,
        "leaderReapedDuringSettlement": False,
    }

    def reap_leader(wait_seconds: float) -> None:
        if leader_process is None or evidence["leaderReapedDuringSettlement"]:
            return
        try:
            leader_process.wait(timeout=max(0.01, wait_seconds))
        except subprocess.TimeoutExpired:
            return
        except BaseException as error:
            evidence["containmentDiagnostic"] = _safe_error_text(error)
        else:
            evidence["leaderReapedDuringSettlement"] = True

    try:
        exists = bool(group_exists(process_group))
    except BaseException as error:
        evidence["containmentDiagnostic"] = _safe_error_text(error)
        return evidence
    if not exists:
        evidence["processGroupClosed"] = True
        return evidence
    evidence["processGroupResidualObserved"] = True
    deadline = monotonic() + max(0.01, timeout_seconds)
    try:
        kill_group(process_group, signal.SIGTERM)
        evidence["processGroupTermSent"] = True
    except ProcessLookupError:
        evidence["processGroupClosed"] = True
        return evidence
    except BaseException as error:
        evidence["containmentDiagnostic"] = _safe_error_text(error)
        return evidence
    reap_leader(min(0.25, max(0.01, timeout_seconds / 4.0)))
    while monotonic() < deadline - timeout_seconds / 2.0:
        try:
            if not group_exists(process_group):
                evidence["processGroupClosed"] = True
                return evidence
        except BaseException as error:
            evidence["containmentDiagnostic"] = _safe_error_text(error)
            return evidence
        sleep(0.02)
    try:
        kill_group(process_group, signal.SIGKILL)
        evidence["processGroupKillSent"] = True
    except ProcessLookupError:
        evidence["processGroupClosed"] = True
        return evidence
    except BaseException as error:
        evidence["containmentDiagnostic"] = _safe_error_text(error)
        return evidence
    reap_leader(min(0.5, max(0.01, timeout_seconds / 4.0)))
    while monotonic() < deadline:
        try:
            if not group_exists(process_group):
                evidence["processGroupClosed"] = True
                return evidence
        except BaseException as error:
            evidence["containmentDiagnostic"] = _safe_error_text(error)
            return evidence
        sleep(0.02)
    try:
        evidence["processGroupClosed"] = not bool(group_exists(process_group))
    except BaseException as error:
        evidence["containmentDiagnostic"] = _safe_error_text(error)
    return evidence


def _run_godot_with_settlement(
    command: Sequence[str],
    *,
    phase: str,
    log_path: Path,
    timeout_seconds: float,
    environment: Mapping[str, str],
    dependencies: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    deps = dict(dependencies or {})
    popen = deps.get("popen", subprocess.Popen)
    settle = deps.get("settle", _settle_godot_process_group)
    after_spawn = deps.get("after_spawn")
    evidence: dict[str, Any] = {
        "phase": phase,
        "containmentScope": CONTAINMENT_SCOPE,
        "command": _redacted_command(command),
        "exitCode": None,
        "leaderReaped": False,
        "timedOut": False,
        "signalOrError": "",
        "processGroupClosed": False,
        "processGroupResidualObserved": False,
        "processGroupTermSent": False,
        "processGroupKillSent": False,
    }
    try:
        descriptor = os.open(
            log_path,
            os.O_CREAT | os.O_EXCL | os.O_WRONLY,
            0o600,
        )
    except BaseException as error:
        evidence["signalOrError"] = _safe_error_text(error)
        raise GodotLanePreservationError(
            f"Godot {phase} log setup 不可信：{evidence['signalOrError']}",
            reason=f"{phase}_setup_or_wait_error",
            evidence=evidence,
        ) from error
    process: Any = None
    process_group: int | None = None
    descriptor_owned = True
    old_signal_handlers: dict[int, Any] = {}
    try:
        log_stream = os.fdopen(descriptor, "w", encoding="utf-8", closefd=True)
        descriptor_owned = False
        with log_stream as log:
            log.write(f"$ {shlex.join(_redacted_command(command))}\n")
            log.flush()
            try:
                old_signal_handlers = _install_godot_signal_handlers()
                process = popen(
                    list(command),
                    cwd=REPO_ROOT,
                    env=dict(environment),
                    stdin=subprocess.DEVNULL,
                    stdout=log,
                    stderr=subprocess.STDOUT,
                    text=True,
                    start_new_session=True,
                )
                process_group = int(process.pid)
                if after_spawn is not None:
                    after_spawn(process)
                try:
                    evidence["exitCode"] = int(
                        process.wait(timeout=timeout_seconds)
                    )
                    evidence["leaderReaped"] = True
                except subprocess.TimeoutExpired as error:
                    evidence["timedOut"] = True
                    evidence["signalOrError"] = _safe_error_text(error)
                except BaseException as error:
                    evidence["signalOrError"] = _safe_error_text(error)
            except BaseException as error:
                if not evidence["signalOrError"]:
                    evidence["signalOrError"] = _safe_error_text(error)
            if process_group is not None:
                try:
                    closure = settle(
                        process_group,
                        leader_process=process,
                        dependencies=deps.get("settlement_dependencies"),
                        timeout_seconds=min(10.0, timeout_seconds),
                    )
                    closure_evidence = dict(closure)
                    if closure_evidence.pop(
                        "leaderReapedDuringSettlement",
                        False,
                    ):
                        evidence["leaderReaped"] = True
                    evidence.update(closure_evidence)
                except BaseException as error:
                    evidence["signalOrError"] = (
                        evidence["signalOrError"] or _safe_error_text(error)
                    )
                if not evidence["leaderReaped"]:
                    try:
                        evidence["exitCode"] = int(process.wait(timeout=1.0))
                        evidence["leaderReaped"] = True
                    except BaseException as error:
                        evidence["signalOrError"] = (
                            evidence["signalOrError"] or _safe_error_text(error)
                        )
            log.flush()
    except BaseException as error:
        evidence["signalOrError"] = evidence["signalOrError"] or _safe_error_text(error)
    finally:
        try:
            _restore_godot_signal_handlers(old_signal_handlers)
        except BaseException as error:
            evidence["signalOrError"] = (
                evidence["signalOrError"] or _safe_error_text(error)
            )
        if descriptor_owned:
            try:
                os.close(descriptor)
            except OSError:
                pass
    unsafe_reason = ""
    if evidence["timedOut"]:
        unsafe_reason = f"{phase}_timeout"
    elif not evidence["processGroupClosed"]:
        unsafe_reason = f"{phase}_containment_unknown"
    elif evidence["processGroupResidualObserved"]:
        unsafe_reason = f"{phase}_process_group_residual"
    elif evidence["signalOrError"]:
        unsafe_reason = f"{phase}_setup_or_wait_error"
    if unsafe_reason:
        raise GodotLanePreservationError(
            f"Godot {phase} containment 不可信：{evidence['signalOrError'] or unsafe_reason}",
            reason=unsafe_reason,
            evidence=evidence,
        )
    return evidence


def _require_contained_godot_process(
    process_result: Mapping[str, Any],
    phase: str,
) -> None:
    if (
        not isinstance(process_result, Mapping)
        or process_result.get("containmentScope") != CONTAINMENT_SCOPE
        or process_result.get("leaderReaped") is not True
        or process_result.get("processGroupClosed") is not True
        or process_result.get("processGroupResidualObserved") is not False
        or process_result.get("timedOut") is not False
        or process_result.get("signalOrError") != ""
        or process_result.get("processGroupTermSent") is not False
        or process_result.get("processGroupKillSent") is not False
    ):
        raise GodotLanePreservationError(
            f"Godot {phase} process containment evidence 不可信",
            reason=f"{phase}_containment_evidence_invalid",
            evidence=process_result,
        )


def _parse_exact_qa_lane_attestation(
    log_path: Path,
    session: Mapping[str, Any],
) -> dict[str, str]:
    with log_path.open("r", encoding="utf-8", newline="") as stream:
        text = stream.read()
    raw_lines = text.split("\n")
    lines = [
        raw_line[:-1] if raw_line.endswith("\r") else raw_line
        for raw_line in raw_lines
    ]
    marker_lines = [
        line
        for line in lines
        if QA_ATTESTATION_PREFIX in line
    ]
    if len(marker_lines) != 1 or not marker_lines[0].startswith(QA_ATTESTATION_PREFIX):
        raise PetManagementRecordingError(
            f"Main QA lane attestation 必须列零且唯一，实际 {len(marker_lines)} 条"
        )
    expected = {
        "customUserDirName": QA_LANE_CUSTOM_USER_DIR_NAME,
        "feature": QA_LANE_FEATURE,
        "lane": QA_LANE,
        "status": "passed",
        "userDataRoot": str(session["godotLaneRoot"]),
    }
    expected_text = json.dumps(
        expected,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    actual_text = marker_lines[0][len(QA_ATTESTATION_PREFIX):]
    if actual_text != expected_text:
        raise PetManagementRecordingError("Main QA lane attestation identity 不匹配")
    return expected


def _validate_management_godot_log(log_path: Path) -> dict[str, Any]:
    text = log_path.read_text(encoding="utf-8")
    forbidden = (
        "SCRIPT ERROR:", "Parse Error:", "ERROR:", "WARNING:",
        "Leaked instance", "Resource still in use",
    )
    matches = [needle for needle in forbidden if needle in text]
    if matches:
        raise PetManagementRecordingError(
            f"宠物栏 Godot 日志包含失败诊断：{matches}"
        )
    return {"status": "passed", "strictLogGate": "passed"}


def _godot_log_output(log_path: Path) -> str:
    with log_path.open("r", encoding="utf-8", newline="") as stream:
        output = stream.read()
    if output.startswith("$ "):
        boundary = output.find("\n")
        output = "" if boundary < 0 else output[boundary + 1:]
    if output.endswith("\n"):
        output = output[:-1]
    return output


def _godot_help_has_exact_tools_options(output: str) -> bool:
    found = {"editor": False, "project-manager": False}
    patterns = {
        "editor": re.compile(r"^[ \t]*(?:-e,[ \t]+)?--editor(?:[ \t]|$)"),
        "project-manager": re.compile(
            r"^[ \t]*(?:-p,[ \t]+)?--project-manager(?:[ \t]|$)"
        ),
    }
    for raw_line in output.split("\n"):
        if raw_line.endswith("\r"):
            raw_line = raw_line[:-1]
        if "\r" in raw_line:
            return False
        sgr_inside_token = False

        def strip_sgr(match: re.Match[str]) -> str:
            nonlocal sgr_inside_token
            before = raw_line[match.start() - 1] if match.start() > 0 else ""
            after = raw_line[match.end()] if match.end() < len(raw_line) else ""
            if (
                re.fullmatch(r"[A-Za-z0-9_-]", before) is not None
                and re.fullmatch(r"[A-Za-z0-9_-]", after) is not None
            ):
                sgr_inside_token = True
            return ""

        normalized = ANSI_SGR.sub(strip_sgr, raw_line)
        if any(character != "\t" and not (" " <= character <= "~") for character in normalized):
            return False
        if sgr_inside_token or "\x1b" in normalized:
            return False
        for name, pattern in patterns.items():
            if pattern.match(normalized) is not None:
                found[name] = True
    return all(found.values())


def _is_exact_godot_47_version(output: str) -> bool:
    value = output[:-1] if output.endswith("\r") else output
    return (
        "\n" not in value
        and "\r" not in value
        and all(" " <= character <= "~" for character in value)
        and re.fullmatch(r"4\.7(?:[.-][0-9A-Za-z][0-9A-Za-z._-]*)*", value)
        is not None
    )


def _manual_lane_inspect_guidance(owner: str) -> str:
    return (
        f"/usr/bin/python3 -B tools/godot_qa_user_data_lane.py inspect "
        f"--lane {QA_LANE} --owner {owner}"
    )


def _write_lifecycle_authority(
    path: Path,
    lifecycle: Mapping[str, Any],
    *,
    writer: Any = _write_secure_json,
    original_error: BaseException | None = None,
) -> None:
    try:
        writer(path, lifecycle)
    except GodotRecorderSignal:
        raise
    except BaseException as write_error:
        evidence = {
            "lifecyclePath": _repo_relative(path),
            "authorityWriteError": _safe_error_text(write_error),
            "originalError": (
                _safe_error_text(original_error)
                if original_error is not None
                else ""
            ),
        }
        raise GodotLanePreservationError(
            "QA lane lifecycle authority 写入失败；不允许继续 cleanup",
            reason="authority_write_failed",
            evidence=evidence,
        ) from (original_error if original_error is not None else write_error)


def _run_official_lane_godot_sequence_active(
    *,
    run_dir: Path,
    godot: str,
    base_environment: Mapping[str, str],
    native_command: Sequence[str],
    native_log: Path,
    timeout_seconds: float,
    native_log_validator: Any,
    movie_command: Sequence[str] | None = None,
    movie_log: Path | None = None,
    movie_log_validator: Any = None,
    dependencies: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    movie_contract = (
        movie_command is not None,
        movie_log is not None,
        movie_log_validator is not None,
    )
    if any(movie_contract) and not all(movie_contract):
        raise PetManagementRecordingError(
            "movie_command/movie_log/movie_log_validator 必须全有或全无"
        )
    capture_phases: list[tuple[str, Sequence[str], Path, Any]] = [
        ("native", native_command, native_log, native_log_validator)
    ]
    if movie_command is not None and movie_log is not None:
        capture_phases.append(
            ("movie", movie_command, movie_log, movie_log_validator)
        )
    deps = dict(dependencies or {})
    lane_helper = deps.get("lane_helper", LANE_HELPER)
    source_checker = deps.get("source_checker", _validate_lane_source_contract)
    godot_runner = deps.get("godot_runner", _run_godot_with_settlement)
    owner_factory = deps.get("owner_factory", lambda: secrets.token_hex(16))
    lifecycle_writer = deps.get("lifecycle_writer", _write_secure_json)
    try:
        source_check = dict(source_checker(lane_helper))
    except GodotRecorderSignal:
        raise
    except BaseException as error:
        raise PetManagementRecordingError(
            f"recorder source-check 失败：{_safe_error_text(error)}"
        ) from error
    _require_exact_keys(source_check, {"status"}, "source-check payload")
    if type(source_check["status"]) is not str or source_check["status"] != "source_contract_passed":
        raise PetManagementRecordingError("source-check payload status 不精确")
    owner = str(owner_factory())
    owner_path = _persist_lane_owner(run_dir, owner)
    lifecycle_path = run_dir / "qa-lane-lifecycle.json"
    lifecycle: dict[str, Any] = {
        "schemaVersion": REPORT_SCHEMA_VERSION,
        "containmentScope": CONTAINMENT_SCOPE,
        "sourceCheck": source_check,
        "status": "owner_evidence_persisted_before_prepare",
        "laneFreshAtRecorderStart": None,
        "lane": QA_LANE,
        "owner": owner,
        "feature": QA_LANE_FEATURE,
        "customUserDirName": QA_LANE_CUSTOM_USER_DIR_NAME,
        "ownerEvidence": _artifact_record(owner_path),
        "qaLanePreserved": None,
        "lanePreservationReason": "prepare_in_progress",
        "manualInspectGuidance": _manual_lane_inspect_guidance(owner),
        "phases": {},
    }
    _write_lifecycle_authority(
        lifecycle_path,
        lifecycle,
        writer=lifecycle_writer,
    )
    try:
        session = _prepare_automation_lane(base_environment, owner, lane_helper)
    except GodotRecorderSignal:
        raise
    except BaseException as error:
        lifecycle["status"] = "prepare_ambiguous"
        lifecycle["qaLanePreserved"] = True
        lifecycle["lanePreservationReason"] = "prepare_ambiguous"
        lifecycle["failure"] = {
            "errorType": type(error).__name__,
            "error": _safe_error_text(error),
        }
        _write_lifecycle_authority(
            lifecycle_path,
            lifecycle,
            writer=lifecycle_writer,
            original_error=error,
        )
        raise GodotLanePreservationError(
            f"QA lane prepare 结果不可确认：{_safe_error_text(error)}",
            reason="prepare_ambiguous",
            evidence=lifecycle["failure"],
        ) from error
    lifecycle.update(
        {
            "status": "prepared",
            "laneFreshAtRecorderStart": True,
            "qaLanePreserved": True,
            "lanePreservationReason": "lane_active",
            "laneRoot": session["godotLaneRoot"],
            "realRoot": session["godotRealRoot"],
            "realBeforeSha256": session["realInventorySha256"],
        }
    )
    _write_lifecycle_authority(
        lifecycle_path,
        lifecycle,
        writer=lifecycle_writer,
    )

    def preserve(reason: str, error: BaseException, evidence: Mapping[str, Any] | None = None) -> None:
        lifecycle["qaLanePreserved"] = True
        lifecycle["lanePreservationReason"] = reason
        lifecycle["failure"] = {
            "errorType": type(error).__name__,
            "error": _safe_error_text(error),
        }
        if evidence is not None:
            lifecycle["failure"]["process"] = dict(evidence)
        _write_lifecycle_authority(
            lifecycle_path,
            lifecycle,
            writer=lifecycle_writer,
            original_error=error,
        )
        if isinstance(error, GodotLanePreservationError):
            raise error
        raise GodotLanePreservationError(
            f"QA lane preserved：{_safe_error_text(error)}",
            reason=reason,
            evidence=evidence or {},
        ) from error

    def verify_phase(phase: str) -> dict[str, Any]:
        try:
            verified = _verify_automation_lane(session, lane_helper)
        except GodotRecorderSignal:
            raise
        except BaseException as error:
            preserve(f"{phase}_verify_failed", error)
            raise AssertionError("unreachable")
        lifecycle["phases"].setdefault(phase, {})["postVerify"] = verified
        return verified

    def cleanup_after_trusted_failure(error: BaseException, phase: str) -> None:
        lifecycle["status"] = "trusted_product_failure_before_media"
        lifecycle["productFailure"] = {
            "phase": phase,
            "errorType": type(error).__name__,
            "error": _safe_error_text(error),
        }
        _write_lifecycle_authority(
            lifecycle_path,
            lifecycle,
            writer=lifecycle_writer,
            original_error=error,
        )
        try:
            lifecycle["cleanup"] = _cleanup_automation_lane(session, lane_helper)
            lifecycle["postCleanupInspect"] = _inspect_clean_automation_lane(
                session, lane_helper
            )
        except GodotRecorderSignal:
            raise
        except BaseException as cleanup_error:
            preserve("cleanup_failed", cleanup_error)
        lifecycle["status"] = "cleaned_after_trusted_product_failure"
        lifecycle["qaLanePreserved"] = False
        lifecycle["lanePreservationReason"] = None
        _write_lifecycle_authority(
            lifecycle_path,
            lifecycle,
            writer=lifecycle_writer,
        )
        raise PetManagementRecordingError(_safe_error_text(error)) from error

    try:
        lifecycle["initialVerification"] = _verify_automation_lane(
            session, lane_helper
        )
    except GodotRecorderSignal:
        raise
    except BaseException as error:
        preserve("initial_verify_failed", error)

    preflight_specs = (
        ("version", [godot, "--version"], run_dir / "godot-version.log"),
        ("help", [godot, "--help"], run_dir / "godot-help.log"),
    )
    for phase, command, log_path in preflight_specs:
        try:
            process_result = godot_runner(
                command,
                phase=phase,
                log_path=log_path,
                timeout_seconds=min(timeout_seconds, 30.0),
                environment=session["environment"],
                dependencies=deps.get("godot_dependencies"),
            )
        except GodotRecorderSignal:
            raise
        except GodotLanePreservationError as error:
            preserve(error.reason, error, error.evidence)
        except BaseException as error:
            preserve(f"{phase}_runner_exception", error)
        try:
            _require_contained_godot_process(process_result, phase)
        except GodotRecorderSignal:
            raise
        except GodotLanePreservationError as error:
            preserve(error.reason, error, error.evidence)
        except BaseException as error:
            preserve(f"{phase}_runner_exception", error)
        lifecycle["phases"][phase] = {"process": process_result}
        verify_phase(phase)
        try:
            output = _godot_log_output(log_path)
        except GodotRecorderSignal:
            raise
        except BaseException as error:
            cleanup_after_trusted_failure(error, phase)
            raise AssertionError("unreachable")
        product_error: BaseException | None = None
        if process_result["exitCode"] != 0:
            product_error = PetManagementRecordingError(
                f"Godot {phase} preflight exit={process_result['exitCode']}"
            )
        elif phase == "version":
            if not _is_exact_godot_47_version(output):
                product_error = PetManagementRecordingError("Godot version 不是 4.7")
            else:
                lifecycle["phases"][phase]["normalizedVersion"] = (
                    output[:-1] if output.endswith("\r") else output
                )
        elif phase == "help" and not _godot_help_has_exact_tools_options(output):
            product_error = PetManagementRecordingError(
                "Godot help 未精确证明 tools-enabled --editor/--project-manager"
            )
        lifecycle["phases"][phase]["output"] = output
        if product_error is not None:
            cleanup_after_trusted_failure(product_error, phase)

    for phase, command, log_path, validator in capture_phases:
        try:
            process_result = godot_runner(
                command,
                phase=phase,
                log_path=log_path,
                timeout_seconds=timeout_seconds,
                environment=session["environment"],
                dependencies=deps.get("godot_dependencies"),
            )
        except GodotRecorderSignal:
            raise
        except GodotLanePreservationError as error:
            preserve(error.reason, error, error.evidence)
        except BaseException as error:
            preserve(f"{phase}_runner_exception", error)
        try:
            _require_contained_godot_process(process_result, phase)
        except GodotRecorderSignal:
            raise
        except GodotLanePreservationError as error:
            preserve(error.reason, error, error.evidence)
        except BaseException as error:
            preserve(f"{phase}_runner_exception", error)
        lifecycle["phases"][phase] = {"process": process_result}
        product_error = None
        product_result: Any = None
        try:
            product_result = validator(log_path)
        except GodotRecorderSignal:
            raise
        except BaseException as error:
            product_error = error
        lifecycle["phases"][phase]["logValidation"] = product_result
        if process_result["exitCode"] != 0 and product_error is None:
            product_error = PetManagementRecordingError(
                f"Godot {phase} exit={process_result['exitCode']}"
            )
        if product_error is not None:
            lifecycle["productFailure"] = {
                "phase": phase,
                "errorType": type(product_error).__name__,
                "error": _safe_error_text(product_error),
            }
        attestation: dict[str, Any] | None = None
        attestation_error: BaseException | None = None
        try:
            attestation = _parse_exact_qa_lane_attestation(log_path, session)
        except GodotRecorderSignal:
            raise
        except BaseException as error:
            attestation_error = error
            lifecycle["attestationFailure"] = {
                "phase": phase,
                "errorType": type(error).__name__,
                "error": _safe_error_text(error),
            }
        lifecycle["phases"][phase]["attestation"] = attestation
        verify_phase(phase)
        if attestation_error is not None:
            preserve(
                f"{phase}_attestation_failed",
                attestation_error,
                process_result,
            )
        if product_error is not None:
            cleanup_after_trusted_failure(product_error, phase)

    lifecycle["status"] = "godot_phases_verified"
    last_phase = capture_phases[-1][0]
    lifecycle["lastTrustedVerification"] = lifecycle["phases"][last_phase][
        "postVerify"
    ]
    _write_lifecycle_authority(
        lifecycle_path,
        lifecycle,
        writer=lifecycle_writer,
    )
    try:
        lifecycle["cleanup"] = _cleanup_automation_lane(session, lane_helper)
        lifecycle["postCleanupInspect"] = _inspect_clean_automation_lane(
            session, lane_helper
        )
    except GodotRecorderSignal:
        raise
    except BaseException as error:
        preserve("cleanup_failed", error)
    lifecycle["status"] = "cleaned_before_media"
    lifecycle["laneFreshAtRecorderStart"] = True
    lifecycle["qaLanePreserved"] = False
    lifecycle["lanePreservationReason"] = None
    _write_lifecycle_authority(
        lifecycle_path,
        lifecycle,
        writer=lifecycle_writer,
    )
    result = {
        "session": session,
        "sourceCheck": source_check,
        "initialVerification": lifecycle["initialVerification"],
        "preflight": {
            "version": lifecycle["phases"]["version"],
            "help": lifecycle["phases"]["help"],
        },
        "native": lifecycle["phases"]["native"],
        "cleanup": lifecycle["cleanup"],
        "postCleanupInspect": lifecycle["postCleanupInspect"],
        "lifecyclePath": lifecycle_path,
        "ownerEvidencePath": owner_path,
        "environment": session["environment"],
    }
    if "movie" in lifecycle["phases"]:
        result["movie"] = lifecycle["phases"]["movie"]
    return result


def _mark_active_lane_signal(lifecycle_path: Path, signum: int) -> None:
    try:
        with lifecycle_path.open("r", encoding="utf-8", newline="") as stream:
            lifecycle = json.load(stream)
        if isinstance(lifecycle, dict):
            lifecycle["qaLanePreserved"] = None
            lifecycle["lanePreservationReason"] = f"recorder_signal_{signum}"
            lifecycle["laneState"] = "ambiguous_after_signal"
            lifecycle["status"] = "interrupted_with_ambiguous_lane_state"
            lifecycle["failure"] = {
                "errorType": "GodotRecorderSignal",
                "error": f"recorder received signal {signum}",
            }
            _write_secure_json(lifecycle_path, lifecycle)
    except BaseException:
        # The O_EXCL owner record remains the recovery authority even if the
        # lifecycle artifact cannot be refreshed inside a signal handler.
        pass


def _run_official_lane_godot_sequence(**kwargs: Any) -> dict[str, Any]:
    run_dir = Path(kwargs["run_dir"])
    lifecycle_path = run_dir / "qa-lane-lifecycle.json"

    def handle_sequence_signal(signum: int, _frame: Any) -> None:
        _mark_active_lane_signal(lifecycle_path, signum)
        raise GodotRecorderSignal(signum)

    old_handlers = _install_godot_signal_handlers(handle_sequence_signal)
    try:
        return _run_official_lane_godot_sequence_active(**kwargs)
    finally:
        _restore_godot_signal_handlers(old_handlers)


def _terminate_process_group(process: subprocess.Popen[Any]) -> None:
    if process.poll() is not None:
        return
    if os.name != "posix":
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)
        return

    try:
        process_group = os.getpgid(process.pid)
    except ProcessLookupError:
        return
    try:
        os.killpg(process_group, signal.SIGTERM)
    except ProcessLookupError:
        return
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        pass
    # The process leader can exit while one of its children ignores SIGTERM.
    # Always follow with SIGKILL for the original, dedicated process group.
    try:
        os.killpg(process_group, signal.SIGKILL)
    except ProcessLookupError:
        return
    if process.poll() is None:
        process.wait(timeout=5)


def _run_logged(
    command: Sequence[str],
    *,
    log_path: Path,
    timeout_seconds: float,
    environment: Mapping[str, str] | None = None,
) -> None:
    redacted = _redacted_command(command)
    with log_path.open("w", encoding="utf-8") as log:
        log.write(f"$ {shlex.join(redacted)}\n")
        log.flush()
        process = subprocess.Popen(
            list(command),
            cwd=REPO_ROOT,
            env=dict(environment) if environment is not None else None,
            stdin=subprocess.DEVNULL,
            stdout=log,
            stderr=subprocess.STDOUT,
            text=True,
            start_new_session=True,
        )
        try:
            return_code = process.wait(timeout=timeout_seconds)
        except subprocess.TimeoutExpired as error:
            _terminate_process_group(process)
            log.write(f"\nTIMEOUT after {timeout_seconds:.1f}s\n")
            log.flush()
            raise PetManagementRecordingError(
                f"命令超时（{timeout_seconds:.1f}s），详见 "
                f"{_repo_relative(log_path)}"
            ) from error
        except BaseException:
            _terminate_process_group(process)
            raise
    if return_code != 0:
        raise PetManagementRecordingError(
            f"命令失败 exit={return_code}，详见 {_repo_relative(log_path)}"
        )


def _run_capture(
    command: Sequence[str],
    *,
    timeout_seconds: float,
) -> subprocess.CompletedProcess[str]:
    process = subprocess.Popen(
        list(command),
        cwd=REPO_ROOT,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        start_new_session=True,
    )
    try:
        stdout, stderr = process.communicate(timeout=timeout_seconds)
    except subprocess.TimeoutExpired as error:
        _terminate_process_group(process)
        raise PetManagementRecordingError(
            f"命令超时（{timeout_seconds:.1f}s）："
            f"{shlex.join(_redacted_command(command))}"
        ) from error
    except BaseException:
        _terminate_process_group(process)
        raise
    return subprocess.CompletedProcess(
        list(command),
        process.returncode,
        stdout,
        stderr,
    )


def _capture_version(executable: str, arguments: Sequence[str]) -> str:
    completed = _run_capture(
        [executable, *arguments],
        timeout_seconds=30.0,
    )
    if completed.returncode != 0:
        raise PetManagementRecordingError(
            f"无法读取工具版本：{executable} {' '.join(arguments)}"
        )
    output = (completed.stdout or completed.stderr).strip()
    return output.splitlines()[0] if output else "unknown"


def _validate_user_argument(value: str, *, label: str) -> str:
    if SAFE_USER_ARGUMENT.fullmatch(value) is None or value == "--":
        raise PetManagementRecordingError(
            f"{label} 必须是单个安全 Godot 用户参数：{value!r}"
        )
    return value


def _build_godot_command(
    *,
    godot: str,
    avi_path: Path,
    capture_flag: str,
    review_args: Sequence[str] = (),
) -> list[str]:
    capture = _validate_user_argument(capture_flag, label="capture flag")
    extras = [
        _validate_user_argument(value, label="review arg")
        for value in review_args
    ]
    if any(
        value.startswith("--beastbound-qa-user-data-lane")
        for value in extras
    ):
        raise PetManagementRecordingError("review arg 不得注入 QA lane marker")
    command = [
        godot,
        "--path",
        str(GODOT_PROJECT),
        "--scene",
        MAIN_SCENE,
        "--windowed",
        "--resolution",
        f"{EXPECTED_WIDTH}x{EXPECTED_HEIGHT}",
        "--single-window",
        "--fixed-fps",
        str(EXPECTED_FPS.numerator),
        "--time-scale",
        "1.0",
        "--disable-vsync",
        "--write-movie",
        str(avi_path),
        "--",
        f"--qa-viewport={EXPECTED_WIDTH}x{EXPECTED_HEIGHT}",
        capture,
        *extras,
        QA_LANE_ARGUMENT,
    ]
    if command.count(QA_LANE_ARGUMENT) != 1 or "--user-data-dir" in command:
        raise PetManagementRecordingError("Godot movie command QA lane 参数不精确")
    return command


def _build_native_godot_command(
    *,
    godot: str,
    capture_flag: str,
    review_args: Sequence[str] = (),
) -> list[str]:
    capture = _validate_user_argument(capture_flag, label="capture flag")
    extras = [
        _validate_user_argument(value, label="review arg")
        for value in review_args
    ]
    if any(
        value.startswith("--beastbound-qa-user-data-lane")
        for value in extras
    ):
        raise PetManagementRecordingError("review arg 不得注入 QA lane marker")
    command = [
        godot,
        "--path",
        str(GODOT_PROJECT),
        "--scene",
        MAIN_SCENE,
        "--windowed",
        "--resolution",
        f"{EXPECTED_WIDTH}x{EXPECTED_HEIGHT}",
        "--single-window",
        "--",
        f"--qa-viewport={EXPECTED_WIDTH}x{EXPECTED_HEIGHT}",
        capture,
        *extras,
        QA_LANE_ARGUMENT,
    ]
    if command.count(QA_LANE_ARGUMENT) != 1 or "--user-data-dir" in command:
        raise PetManagementRecordingError("Godot native command QA lane 参数不精确")
    return command


def _parse_fraction(value: Any, *, label: str) -> Fraction:
    try:
        return Fraction(str(value))
    except (ValueError, ZeroDivisionError) as error:
        raise PetManagementRecordingError(
            f"ffprobe {label} 无法解析：{value!r}"
        ) from error


def _stream_duration(
    stream: Mapping[str, Any],
    probe: Mapping[str, Any],
) -> float:
    raw_duration = stream.get("duration")
    if raw_duration in (None, "N/A"):
        format_value = probe.get("format")
        raw_duration = (
            format_value.get("duration")
            if isinstance(format_value, dict)
            else None
        )
    try:
        return float(raw_duration)
    except (TypeError, ValueError):
        return -1.0


def _validate_probe(probe: dict[str, Any]) -> dict[str, Any]:
    streams = probe.get("streams")
    if not isinstance(streams, list):
        raise PetManagementRecordingError("ffprobe streams 不是数组")
    video = next(
        (
            value
            for value in streams
            if isinstance(value, dict) and value.get("codec_type") == "video"
        ),
        None,
    )
    audio = next(
        (
            value
            for value in streams
            if isinstance(value, dict) and value.get("codec_type") == "audio"
        ),
        None,
    )
    if video is None:
        raise PetManagementRecordingError("ffprobe 未发现视频流")
    if audio is None:
        raise PetManagementRecordingError("ffprobe 未发现音频流")

    errors: list[str] = []
    if video.get("codec_name") != EXPECTED_VIDEO_CODEC:
        errors.append(f"video.codec={video.get('codec_name')!r}")
    if video.get("pix_fmt") != EXPECTED_PIXEL_FORMAT:
        errors.append(f"video.pixFmt={video.get('pix_fmt')!r}")
    if (
        video.get("width") != EXPECTED_WIDTH
        or video.get("height") != EXPECTED_HEIGHT
    ):
        errors.append(
            f"video.size={video.get('width')}x{video.get('height')}"
        )
    frame_rate = _parse_fraction(
        video.get("avg_frame_rate") or video.get("r_frame_rate"),
        label="video fps",
    )
    if frame_rate != EXPECTED_FPS:
        errors.append(f"video.fps={frame_rate}")
    video_duration = _stream_duration(video, probe)
    if (
        not math.isfinite(video_duration)
        or video_duration < MIN_DURATION_SECONDS
    ):
        errors.append(f"video.duration={video_duration}")
    if audio.get("codec_name") != EXPECTED_AUDIO_CODEC:
        errors.append(f"audio.codec={audio.get('codec_name')!r}")
    audio_duration = _stream_duration(audio, probe)
    if not math.isfinite(audio_duration) or audio_duration <= 0:
        errors.append(f"audio.duration={audio_duration}")

    raw_frame_count = video.get("nb_read_frames") or video.get("nb_frames")
    try:
        frame_count = int(raw_frame_count)
    except (TypeError, ValueError):
        frame_count = -1
    if frame_count <= 0:
        errors.append(f"video.frameCount={raw_frame_count!r}")
    if errors:
        raise PetManagementRecordingError(
            "视频元数据未通过宠物栏录像契约：" + "；".join(errors)
        )
    return {
        "videoCodec": EXPECTED_VIDEO_CODEC,
        "pixelFormat": EXPECTED_PIXEL_FORMAT,
        "audioCodec": EXPECTED_AUDIO_CODEC,
        "width": EXPECTED_WIDTH,
        "height": EXPECTED_HEIGHT,
        "fps": float(frame_rate),
        "durationSeconds": video_duration,
        "audioDurationSeconds": audio_duration,
        "frameCount": frame_count,
    }


def _write_probe(
    ffprobe: str,
    video_path: Path,
    output_path: Path,
) -> dict[str, Any]:
    command = [
        ffprobe,
        "-v",
        "error",
        "-count_frames",
        "-show_entries",
        (
            "stream=index,codec_type,codec_name,pix_fmt,width,height,"
            "r_frame_rate,avg_frame_rate,nb_frames,nb_read_frames,duration,"
            "sample_rate,channels:"
            "format=format_name,duration,size"
        ),
        "-of",
        "json",
        str(video_path),
    ]
    completed = _run_capture(command, timeout_seconds=180.0)
    if completed.returncode != 0:
        raise PetManagementRecordingError(
            f"ffprobe 失败 exit={completed.returncode}: "
            f"{completed.stderr.strip()}"
        )
    try:
        probe = json.loads(completed.stdout)
    except json.JSONDecodeError as error:
        raise PetManagementRecordingError(
            "ffprobe 没有返回有效 JSON"
        ) from error
    if not isinstance(probe, dict):
        raise PetManagementRecordingError("ffprobe JSON 根节点不是对象")
    _write_json(output_path, probe)
    return probe


def _png_dimensions(path: Path) -> tuple[int, int]:
    try:
        header = path.read_bytes()[:24]
    except OSError as error:
        raise PetManagementRecordingError(
            f"无法读取 PNG：{path}: {error}"
        ) from error
    if (
        len(header) < 24
        or header[:8] != PNG_SIGNATURE
        or header[12:16] != b"IHDR"
    ):
        raise PetManagementRecordingError(
            f"不是有效 PNG 头：{_repo_relative(path)}"
        )
    return struct.unpack(">II", header[16:24])


def _default_sample_times(
    duration_seconds: float,
    *,
    sample_count: int,
) -> tuple[float, ...]:
    if (
        not math.isfinite(duration_seconds)
        or duration_seconds < MIN_DURATION_SECONDS
    ):
        raise PetManagementRecordingError("视频太短，无法生成取样帧")
    if sample_count < 2 or sample_count > MAX_SAMPLE_COUNT:
        raise PetManagementRecordingError(
            f"--sample-count 必须介于 2 和 {MAX_SAMPLE_COUNT}"
        )
    last_frame_time = max(
        0.0,
        duration_seconds - (1.0 / float(EXPECTED_FPS)),
    )
    return tuple(
        min(
            last_frame_time,
            duration_seconds * ((index + 0.5) / sample_count),
        )
        for index in range(sample_count)
    )


def _selected_sample_times(
    duration_seconds: float,
    *,
    requested: Sequence[float],
    sample_count: int,
) -> tuple[float, ...]:
    if not requested:
        return _default_sample_times(
            duration_seconds,
            sample_count=sample_count,
        )
    if len(requested) < 2 or len(requested) > MAX_SAMPLE_COUNT:
        raise PetManagementRecordingError(
            f"--sample-time 数量必须介于 2 和 {MAX_SAMPLE_COUNT}"
        )
    normalized = tuple(float(value) for value in requested)
    if not all(math.isfinite(value) for value in normalized):
        raise PetManagementRecordingError("--sample-time 必须是有限秒数")
    if tuple(sorted(normalized)) != normalized:
        raise PetManagementRecordingError("--sample-time 必须严格递增")
    if len(set(normalized)) != len(normalized):
        raise PetManagementRecordingError("--sample-time 不能重复")
    for value in normalized:
        if value < 0 or value >= duration_seconds:
            raise PetManagementRecordingError(
                f"--sample-time={value} 越出视频时长 {duration_seconds:.3f}s"
            )
    return normalized


def _extract_review_frames(
    *,
    ffmpeg: str,
    video_path: Path,
    screenshots_dir: Path,
    sample_times: Sequence[float],
    timeout_seconds: float,
) -> list[dict[str, Any]]:
    screenshots_dir.mkdir(parents=False, exist_ok=False)
    records: list[dict[str, Any]] = []
    for index, sample_time in enumerate(sample_times, start=1):
        output_path = screenshots_dir / f"frame-{index:02d}.png"
        log_path = screenshots_dir / f"frame-{index:02d}.log"
        _run_logged(
            [
                ffmpeg,
                "-y",
                "-v",
                "warning",
                "-ss",
                f"{sample_time:.6f}",
                "-i",
                str(video_path),
                "-map",
                "0:v:0",
                "-frames:v",
                "1",
                "-vf",
                (
                    f"scale={EXPECTED_WIDTH}:{EXPECTED_HEIGHT}:"
                    "flags=lanczos"
                ),
                str(output_path),
            ],
            log_path=log_path,
            timeout_seconds=timeout_seconds,
        )
        width, height = _png_dimensions(output_path)
        if (width, height) != (EXPECTED_WIDTH, EXPECTED_HEIGHT):
            raise PetManagementRecordingError(
                f"取样帧尺寸错误：{width}x{height}"
            )
        records.append(
            {
                **_artifact_record(output_path),
                "sampleTimeSeconds": round(sample_time, 6),
                "width": width,
                "height": height,
                "log": _artifact_record(log_path),
            }
        )
    return records


def _build_contact_sheet(
    *,
    ffmpeg: str,
    screenshots_dir: Path,
    output_path: Path,
    sample_count: int,
    timeout_seconds: float,
) -> dict[str, Any]:
    columns = min(4, sample_count)
    rows = math.ceil(sample_count / columns)
    expected_width = columns * CONTACT_CELL_WIDTH
    expected_height = rows * CONTACT_CELL_HEIGHT
    log_path = output_path.with_suffix(".log")
    tile_filter = (
        f"scale={CONTACT_CELL_WIDTH}:{CONTACT_CELL_HEIGHT}:flags=lanczos,"
        f"tile={columns}x{rows}:nb_frames={sample_count}:padding=0:margin=0"
    )
    _run_logged(
        [
            ffmpeg,
            "-y",
            "-v",
            "warning",
            "-framerate",
            "1",
            "-start_number",
            "1",
            "-i",
            str(screenshots_dir / "frame-%02d.png"),
            "-vf",
            tile_filter,
            "-frames:v",
            "1",
            str(output_path),
        ],
        log_path=log_path,
        timeout_seconds=timeout_seconds,
    )
    width, height = _png_dimensions(output_path)
    if (width, height) != (expected_width, expected_height):
        raise PetManagementRecordingError(
            "联系表尺寸错误："
            f"{width}x{height}，期望 {expected_width}x{expected_height}"
        )
    return {
        **_artifact_record(output_path),
        "width": width,
        "height": height,
        "columns": columns,
        "rows": rows,
        "sampleCount": sample_count,
        "log": _artifact_record(log_path),
    }


def _write_sha256_manifest(
    run_dir: Path,
    paths: Sequence[Path],
) -> Path:
    manifest_path = run_dir / "SHA256SUMS"
    unique_paths = sorted(
        {path.resolve() for path in paths},
        key=lambda value: value.as_posix(),
    )
    lines: list[str] = []
    for path in unique_paths:
        if not path.is_file() or path.stat().st_size <= 0:
            raise PetManagementRecordingError(
                f"SHA256 清单目标不存在或为空：{path}"
            )
        try:
            relative = path.relative_to(run_dir.resolve()).as_posix()
        except ValueError as error:
            raise PetManagementRecordingError(
                f"SHA256 清单目标越出本次证据目录：{path}"
            ) from error
        lines.append(f"{_sha256(path)}  {relative}")
    payload = ("\n".join(lines) + "\n").encode("utf-8")
    temporary = manifest_path.with_name(
        f".{manifest_path.name}.{uuid.uuid4().hex}.tmp"
    )
    descriptor: int | None = None
    committed = False
    try:
        try:
            os.lstat(manifest_path)
        except FileNotFoundError:
            pass
        else:
            raise PetManagementRecordingError("SHA256 清单 final path 已存在")
        descriptor = os.open(
            temporary,
            os.O_CREAT | os.O_EXCL | os.O_WRONLY,
            0o600,
        )
        _write_all(descriptor, payload)
        os.fsync(descriptor)
        os.close(descriptor)
        descriptor = None
        try:
            os.replace(temporary, manifest_path)
        except BaseException:
            # Some filesystems/wrappers can report an error after the atomic
            # replacement already committed.  Exact final bytes plus consumed
            # temp make that a committed success, never a failure-handler path.
            try:
                committed = (
                    not temporary.exists()
                    and manifest_path.read_bytes() == payload
                )
            except BaseException:
                committed = False
            if not committed:
                raise
        else:
            committed = True
        if committed:
            # The final path is already an atomic, complete commit.  A later
            # directory-fsync or cleanup diagnostic must not turn it into a
            # non-zero run with a valid success authority left behind.
            try:
                _fsync_parent_directory(manifest_path)
            except BaseException:
                pass
            return manifest_path
        raise PetManagementRecordingError("SHA256 清单未原子提交")
    finally:
        if descriptor is not None:
            try:
                os.close(descriptor)
            except BaseException:
                pass
        try:
            temporary.unlink()
        except FileNotFoundError:
            pass
        except BaseException:
            if not committed:
                # Pre-commit cleanup is secondary to the original exception.
                pass


def _isolated_environment(temporary_dir: Path) -> dict[str, str]:
    environment = dict(os.environ)
    environment["TMPDIR"] = str(temporary_dir)
    environment["BEASTBOUND_OWNER_REVIEW_CAPTURE"] = "1"
    return environment


def _user_data_inventory(user_data_dir: Path) -> dict[str, Any]:
    files = sorted(
        (
            path
            for path in user_data_dir.rglob("*")
            if path.is_file()
        ),
        key=lambda value: value.as_posix(),
    )
    return {
        "path": _repo_relative(user_data_dir),
        "fileCount": len(files),
        "totalBytes": sum(path.stat().st_size for path in files),
        "paths": [
            path.relative_to(user_data_dir).as_posix()
            for path in files
        ],
        "isFreshPerRun": True,
        "normalPlayerSavePathUsed": False,
    }


def _record_into(
    *,
    args: argparse.Namespace,
    run_id: str,
    run_dir: Path,
) -> Path:
    timeout_seconds = float(args.timeout_seconds)
    if not math.isfinite(timeout_seconds) or timeout_seconds <= 0:
        raise PetManagementRecordingError("--timeout-seconds 必须大于 0")
    requested_sample_times = tuple(args.sample_times or ())
    if not requested_sample_times:
        if int(args.sample_count) < 2 or int(args.sample_count) > MAX_SAMPLE_COUNT:
            raise PetManagementRecordingError(
                f"--sample-count 必须介于 2 和 {MAX_SAMPLE_COUNT}"
            )
    else:
        if (
            len(requested_sample_times) < 2
            or len(requested_sample_times) > MAX_SAMPLE_COUNT
        ):
            raise PetManagementRecordingError(
                f"--sample-time 数量必须介于 2 和 {MAX_SAMPLE_COUNT}"
            )
        normalized_preflight = tuple(
            float(value) for value in requested_sample_times
        )
        if not all(math.isfinite(value) for value in normalized_preflight):
            raise PetManagementRecordingError("--sample-time 必须是有限秒数")
        if any(value < 0 for value in normalized_preflight):
            raise PetManagementRecordingError("--sample-time 不能为负数")
        if (
            tuple(sorted(normalized_preflight)) != normalized_preflight
            or len(set(normalized_preflight)) != len(normalized_preflight)
        ):
            raise PetManagementRecordingError(
                "--sample-time 必须严格递增且不能重复"
            )
    godot = _require_executable(args.godot, label="Godot")
    ffmpeg = _require_executable(args.ffmpeg, label="ffmpeg")
    ffprobe = _require_executable(args.ffprobe, label="ffprobe")

    temporary_dir = run_dir / "tmp"
    temporary_dir.mkdir(parents=False, exist_ok=False)
    base_environment = _isolated_environment(temporary_dir)

    avi_path = run_dir / "pet-management-owner-review-1x.avi"
    video_path = run_dir / "pet-management-owner-review-1x.mp4"
    native_log = run_dir / "godot-native.log"
    godot_log = run_dir / "godot-movie.log"
    capture_flag = str(args.capture_flag)
    review_args = tuple(args.review_args or ())
    native_command = _build_native_godot_command(
        godot=godot,
        capture_flag=capture_flag,
        review_args=review_args,
    )
    godot_command = _build_godot_command(
        godot=godot,
        avi_path=avi_path,
        capture_flag=capture_flag,
        review_args=review_args,
    )
    lane_evidence = _run_official_lane_godot_sequence(
        run_dir=run_dir,
        godot=godot,
        base_environment=base_environment,
        native_command=native_command,
        movie_command=godot_command,
        native_log=native_log,
        movie_log=godot_log,
        timeout_seconds=timeout_seconds,
        native_log_validator=_validate_management_godot_log,
        movie_log_validator=_validate_management_godot_log,
    )
    environment = lane_evidence["environment"]
    raw_movie = _artifact_record(avi_path)

    transcode_log = run_dir / "ffmpeg-transcode.log"
    _run_logged(
        [
            ffmpeg,
            "-y",
            "-v",
            "warning",
            "-i",
            str(avi_path),
            "-map",
            "0:v:0",
            "-map",
            "0:a:0",
            "-vf",
            "scale=in_range=pc:out_range=tv,format=yuv420p",
            "-c:v",
            "libx264",
            "-preset",
            "slow",
            "-crf",
            "18",
            "-pix_fmt",
            EXPECTED_PIXEL_FORMAT,
            "-color_range",
            "tv",
            "-c:a",
            EXPECTED_AUDIO_CODEC,
            "-b:a",
            "192k",
            "-ar",
            "48000",
            "-ac",
            "2",
            "-map_metadata",
            "-1",
            "-movflags",
            "+faststart",
            str(video_path),
        ],
        log_path=transcode_log,
        timeout_seconds=timeout_seconds,
        environment=environment,
    )

    probe_path = run_dir / "ffprobe.json"
    probe = _write_probe(ffprobe, video_path, probe_path)
    media = _validate_probe(probe)

    decode_log = run_dir / "full-audio-video-decode.log"
    _run_logged(
        [
            ffmpeg,
            "-v",
            "error",
            "-xerror",
            "-i",
            str(video_path),
            "-map",
            "0:v:0",
            "-map",
            "0:a:0",
            "-f",
            "null",
            "-",
        ],
        log_path=decode_log,
        timeout_seconds=timeout_seconds,
        environment=environment,
    )

    sample_times = _selected_sample_times(
        float(media["durationSeconds"]),
        requested=requested_sample_times,
        sample_count=int(args.sample_count),
    )
    screenshots_dir = run_dir / "screenshots"
    screenshots = _extract_review_frames(
        ffmpeg=ffmpeg,
        video_path=video_path,
        screenshots_dir=screenshots_dir,
        sample_times=sample_times,
        timeout_seconds=timeout_seconds,
    )
    contact = _build_contact_sheet(
        ffmpeg=ffmpeg,
        screenshots_dir=screenshots_dir,
        output_path=run_dir / "contact-sheet.png",
        sample_count=len(sample_times),
        timeout_seconds=timeout_seconds,
    )

    video = {
        **_artifact_record(video_path),
        **media,
        "playbackSpeed": 1.0,
        "decodeStatus": "passed",
    }

    summary = {
        "schemaVersion": REPORT_SCHEMA_VERSION,
        "reportType": REPORT_TYPE,
        "status": "passed",
        "finalStatusAuthority": True,
        "finalStatusAuthorityRequires": {
            "artifact": _repo_relative(run_dir / "SHA256SUMS"),
            "writtenAfterSummary": True,
            "coversThisSummary": True,
            "failureSummaryAbsent": True,
        },
        "runId": run_id,
        "generatedAtUtc": _utc_now().isoformat().replace("+00:00", "Z"),
        "scene": MAIN_SCENE,
        "captureFlag": capture_flag,
        "reviewArguments": _redacted_command(review_args),
        "captureContract": {
            "normalMainScene": True,
            "width": EXPECTED_WIDTH,
            "height": EXPECTED_HEIGHT,
            "fps": float(EXPECTED_FPS),
            "playbackSpeed": 1.0,
            "movieWriterFixedFps": True,
            "transcodeChangesTiming": False,
            "audioRequired": True,
        },
        "isolation": {
            "laneFreshAtRecorderStart": True,
            "normalPlayerSavePathUsed": False,
            "containmentScope": CONTAINMENT_SCOPE,
            "qaLane": {
                "lane": QA_LANE,
                "owner": lane_evidence["session"]["owner"],
                "feature": QA_LANE_FEATURE,
                "customUserDirName": QA_LANE_CUSTOM_USER_DIR_NAME,
                "laneRoot": lane_evidence["session"]["godotLaneRoot"],
                "realRoot": lane_evidence["session"]["godotRealRoot"],
                "realBeforeSha256": lane_evidence["session"]["realInventorySha256"],
            },
            "temporaryDirectory": _repo_relative(temporary_dir),
            "backendProcessStartedByTool": False,
            "mysqlAccessByTool": False,
        },
        "tools": {
            "godot": lane_evidence["preflight"]["version"]["normalizedVersion"],
            "ffmpeg": _capture_version(ffmpeg, ["-version"]),
            "ffprobe": _capture_version(ffprobe, ["-version"]),
            "python": sys.version.splitlines()[0],
        },
        "commands": {
            "native": _redacted_command(native_command),
            "movie": _redacted_command(godot_command),
        },
        "preflight": lane_evidence["preflight"],
        "sourceCheck": lane_evidence["sourceCheck"],
        "initialVerification": lane_evidence["initialVerification"],
        "native": lane_evidence["native"],
        "movie": lane_evidence["movie"],
        "qaLaneCleanup": lane_evidence["cleanup"],
        "postCleanupInspect": lane_evidence["postCleanupInspect"],
        "laneLifecycle": _artifact_record(lane_evidence["lifecyclePath"]),
        "rawMovie": raw_movie,
        "video": video,
        "probe": _artifact_record(probe_path),
        "fullDecode": {
            "status": "passed",
            "videoStreamDecoded": True,
            "audioStreamDecoded": True,
            "log": _artifact_record(decode_log),
        },
        "screenshots": screenshots,
        "contactSheet": contact,
        "sha256Manifest": {
            "path": _repo_relative(run_dir / "SHA256SUMS"),
            "coversAllRetainedEvidenceFiles": True,
            "writtenLast": True,
        },
        "logs": {
            "godotNative": _artifact_record(native_log),
            "godotMovie": _artifact_record(godot_log),
            "transcode": _artifact_record(transcode_log),
        },
        "ownerReviewStatus": "pending",
    }
    summary_path = run_dir / "summary.json"
    _write_json(summary_path, summary)
    hash_paths = sorted(
        (
            path
            for path in run_dir.rglob("*")
            if path.is_file()
            and path.name != "SHA256SUMS"
            and path.relative_to(run_dir).parts[0] != "tmp"
        ),
        key=lambda path: str(path.relative_to(run_dir)),
    )
    print(
        json.dumps(
            {
                "status": "passed",
                "runId": run_id,
                "video": video["path"],
                "contactSheet": contact["path"],
                "summary": _repo_relative(summary_path),
            },
            ensure_ascii=False,
        ),
        flush=True,
    )
    _write_sha256_manifest(run_dir, hash_paths)
    return summary_path


def _write_failure_summary(
    run_dir: Path,
    *,
    run_id: str,
    error: BaseException,
) -> bool:
    lifecycle: Any = None
    lifecycle_read_error: dict[str, Any] | None = None
    lifecycle_path = run_dir / "qa-lane-lifecycle.json"
    try:
        if lifecycle_path.is_file():
            with lifecycle_path.open("r", encoding="utf-8", newline="") as stream:
                lifecycle = json.load(stream)
            if not isinstance(lifecycle, dict):
                raise ValueError("QA lane lifecycle authority 不是 JSON object")
    except BaseException as read_error:
        lifecycle = None
        lifecycle_read_error = _failure_envelope(read_error)

    supersedes_summary: dict[str, Any] | None = None
    summary_path = run_dir / "summary.json"
    try:
        if summary_path.is_file():
            supersedes_summary = _artifact_record(summary_path)
    except BaseException as summary_error:
        supersedes_summary = {
            "path": _repo_relative(summary_path),
            "readError": _failure_envelope(summary_error),
        }

    try:
        _write_secure_json(
            run_dir / "failure-summary.json",
            {
                "schemaVersion": REPORT_SCHEMA_VERSION,
                "reportType": REPORT_TYPE,
                "status": "failed",
                "finalStatusAuthority": True,
                "supersedesSummary": supersedes_summary,
                "runId": run_id,
                "generatedAtUtc": _utc_now().isoformat().replace(
                    "+00:00",
                    "Z",
                ),
                **_failure_envelope(error),
                "evidenceDirectoryPreserved": True,
                "qaLane": lifecycle,
                "qaLaneReadError": lifecycle_read_error,
                "sha256Manifest": {
                    "path": _repo_relative(run_dir / "SHA256SUMS"),
                    "writeAttemptedAfterSummary": True,
                    "successNotClaimedByFailureSummary": True,
                },
            },
            exclusive=True,
        )
    except BaseException:
        # Failure reporting is secondary evidence and must never replace the
        # original recorder exception.
        return False
    return True


def _record(args: argparse.Namespace) -> Path:
    if Path.cwd().resolve() != REPO_ROOT:
        raise PetManagementRecordingError(
            f"必须从仓库根执行：cd {REPO_ROOT}"
        )
    if not GODOT_PROJECT.is_dir():
        raise PetManagementRecordingError(
            f"Godot 项目不存在：{GODOT_PROJECT}"
        )
    run_id = args.run_id or _new_run_id()
    if SAFE_RUN_ID.fullmatch(run_id) is None:
        raise PetManagementRecordingError(f"不安全的 runId：{run_id!r}")
    output_root = _resolve_output_root(args.output_root)
    output_root.mkdir(parents=True, exist_ok=True)
    run_dir = output_root / run_id
    run_dir.mkdir(parents=False, exist_ok=False)
    try:
        return _record_into(args=args, run_id=run_id, run_dir=run_dir)
    except BaseException as error:
        failure_summary_written = _write_failure_summary(
            run_dir, run_id=run_id, error=error
        )
        if failure_summary_written:
            try:
                retained = sorted(
                    (
                        path
                        for path in run_dir.rglob("*")
                        if path.is_file()
                        and path.name != "SHA256SUMS"
                        and path.relative_to(run_dir).parts[0] != "tmp"
                    ),
                    key=lambda path: str(path.relative_to(run_dir)),
                )
                if retained:
                    _write_sha256_manifest(run_dir, retained)
            except BaseException:
                # Retained-file discovery and the secondary manifest are
                # best-effort only; neither may replace the primary failure.
                pass
        else:
            try:
                (run_dir / "SHA256SUMS").unlink()
                _fsync_parent_directory(run_dir / "SHA256SUMS")
            except FileNotFoundError:
                pass
            except BaseException:
                # The non-zero recorder exit remains authoritative if even
                # manifest invalidation cannot be persisted.
                pass
        raise


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "用真实 Main.tscn 录制 1280x720、30fps、1×、有声的宠物栏"
            "项目所有者验收视频，并生成可复核媒体证据。"
        )
    )
    parser.add_argument("--run-id", help="可选的唯一安全 runId。")
    parser.add_argument(
        "--output-root",
        type=Path,
        default=DEFAULT_OUTPUT_ROOT,
        help=(
            "仓库 .run/evidence/ 下的输出根目录"
            f"（默认：{DEFAULT_OUTPUT_ROOT.as_posix()}）。"
        ),
    )
    parser.add_argument(
        "--capture-flag",
        "--review-flag",
        dest="capture_flag",
        default=DEFAULT_CAPTURE_FLAG,
        help=(
            "Godot 端自动漫游用户参数；若控制器最终改名，请使用 "
            "--capture-flag=--新名字。"
        ),
    )
    parser.add_argument(
        "--review-arg",
        action="append",
        dest="review_args",
        help=(
            "附加 Godot 用户参数；可重复。参数以 -- 开头时请使用 "
            "--review-arg=--参数。"
        ),
    )
    parser.add_argument(
        "--sample-count",
        type=int,
        default=DEFAULT_SAMPLE_COUNT,
        help=f"自动等距截图数量（默认：{DEFAULT_SAMPLE_COUNT}）。",
    )
    parser.add_argument(
        "--sample-time",
        type=float,
        action="append",
        dest="sample_times",
        help="改用指定秒数截图；需递增，可重复。",
    )
    parser.add_argument(
        "--godot",
        default=os.environ.get("GODOT_BIN", "godot"),
    )
    parser.add_argument(
        "--ffmpeg",
        default=os.environ.get("FFMPEG_BIN", "ffmpeg"),
    )
    parser.add_argument(
        "--ffprobe",
        default=os.environ.get("FFPROBE_BIN", "ffprobe"),
    )
    parser.add_argument(
        "--timeout-seconds",
        type=float,
        default=900.0,
        help="每个外部步骤的超时秒数（默认：900）。",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        _record(args)
    except KeyboardInterrupt:
        print(
            "pet management owner review recording interrupted",
            file=sys.stderr,
        )
        return 130
    except (
        PetManagementRecordingError,
        FileExistsError,
        OSError,
        ValueError,
    ) as error:
        print(
            f"pet management owner review recording failed: {error}",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
