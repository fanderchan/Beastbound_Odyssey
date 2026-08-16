#!/usr/bin/env python3
"""Verify the first fusion pets' tracked, fail-closed production registration.

This is deliberately not a release promoter.  It proves that the two frozen
fusion forms are registered in production while all player-facing release
gates remain closed:

* the historical owner decision is byte-bound and approves only the isolated
  identity/world/battle visual scope;
* both production roots exactly replay their closed-registration manifests;
* the art catalog contains exactly the two expected in-production,
  non-rideable, runtime-disabled fusion forms;
* the fusion catalog contains exactly the two expected formal recipes while
  its global runtime switch remains disabled;
* each dedicated portrait is present but remains owner-review-pending,
  semantically unverified, and release-gated off;
* the machine report says runtimeEnabled=false and playerEntryOpened=false.

The two tracked per-root manifests are the only asset attestations.  This tool
independently replays them and prints a machine-readable report to stdout.  An
optional ``--json-out`` may store the same generated report under
``.run/audit`` without overwriting existing evidence.
The tool never edits catalogs, assets, runtime code, owner decisions, or
portrait approval, and it never creates a runtime release attestation.
"""

from __future__ import annotations

import argparse
import copy
from dataclasses import dataclass
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
import subprocess
import sys
from typing import Any, Iterable, Mapping, Sequence


TOOLS_DIR = Path(__file__).resolve().parent
if str(TOOLS_DIR) not in sys.path:
    sys.path.insert(0, str(TOOLS_DIR))
from pet_identity_replay_contract import (
    CLOSED_REGISTRATION_LEGACY_PATH_BOUND_REPLAY_SHA256,
)


REPO_ROOT = Path(__file__).resolve().parents[1]
TOOL_NAME = "verify_pet_fusion_closed_release.py"
OWNER_DECISION_RELATIVE = Path(
    "client/godot/data/pet_fusion_visual_owner_decision_v1.json"
)
ART_CATALOG_RELATIVE = Path("client/godot/data/pet_art_catalog.json")
FUSION_CATALOG_RELATIVE = Path("client/godot/data/pet_fusion_recipes.json")
PHASE_RECORD_RELATIVE = Path(
    "docs/phase_372_fusion_pet_full_bundle_owner_approval.md"
)
MANIFEST_RELATIVE = Path("qa/release/closed-registration-manifest-v1.json")

OWNER_DECISION_SHA256 = (
    "852f8772cfbe2223479d6af2b3b81cff2a79125b4f4ca3343c2912dfc6303d14"
)
PHASE_RECORD_SHA256 = (
    "99f364fcb025c124ef1d6df26df306a6146e0186524e81e1f2a2f6895204cc7e"
)
OWNER_REVIEW_VIDEO_SHA256 = (
    "5b18f43d1eaa0dd9ba239cbba9c1d69559285b03d6e285bc6dbf337aa94c706d"
)
OWNER_REVIEW_VIDEO_RELATIVE = (
    ".run/evidence/phase371_fusion_owner_review/"
    "fusion-pets-owner-review-1x.mp4"
)
OWNER_APPROVED_SCOPES = (
    "standalone_pet_identity_visual_only",
    "standalone_pet_world_true8_visual_only",
    "standalone_pet_battle_two_view_visual_only",
    "revive_sequence_visual_only",
)
OWNER_EXCLUDED_SCOPES = (
    "dedicated_pet_portrait",
    "production_art_catalog_registration",
    "formal_fusion_recipe_registration",
    "player_fusion_entry",
    "fusion_runtime_release",
    "mounted_pet_art",
)
PORTRAIT_FILE_PATHS = (
    "portrait/default.png",
    "portrait/portrait-meta.json",
    "portrait/source-and-ownership.md",
    "prompts/portrait-v1.txt",
    "qa/portrait/contact-sheet.png",
    "source/portrait/generation-attestation.json",
    "source/portrait/headshot-alpha-mask.png",
    "source/portrait/headshot-chroma-eligibility-mask.png",
    "source/portrait/headshot-master-1024.png",
    "source/portrait/headshot-original-generated.png",
    "source/portrait/headshot-raw-lossless.webp",
)
QA_IMPORT_ISOLATION_CONTROL_PATH = "qa/portrait/.gdignore"
QA_IMPORT_ISOLATION_CONTROL_BYTES = (
    b"# Portrait QA evidence; excluded from Godot runtime import.\n"
)
QA_IMPORT_ISOLATION_CONTROL_SIZE = 60
QA_IMPORT_ISOLATION_CONTROL_SHA256 = (
    "66dc166e420e6b4e2c26bfea5bd102f2ab7afbe5b1ab9b73f1fa42a8127923e5"
)
EXPECTED_COPIED_FILE_COUNT = 675
EXPECTED_OWNER_APPROVED_VISUAL_FILE_COUNT = 445
EXPECTED_ENGINEERING_SUPPORT_FILE_COUNT = 230
EXPECTED_EXCLUDED_PORTRAIT_FILE_COUNT = 11
EXPECTED_ART_CATALOG_SLICE_SHA256 = (
    "b55ef1556118ea23b3b39e9885fd2f5a968684bfe6aaad8277d6f5e228e8aa69"
)
EXPECTED_FUSION_CATALOG_SLICE_SHA256 = (
    "e8b436996bc779964d7c41aef7dd622e371b1c75d4d01dd806c9400aa2e77332"
)
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
REPORT_CLAIM_LIMIT = (
    "closed production-registration proof only; does not approve portraits, "
    "player entry, fusion runtime, mounted art, or release"
)


class VerificationError(RuntimeError):
    """A strict closed-state or manifest verification failure."""


@dataclass(frozen=True)
class FormSpec:
    source_slug: str
    form_id: str
    display_name: str
    subtype_id: str
    production_group: str
    art_skeleton_id: str
    identity_brief: str
    recipe_id: str
    growth_profile_id: str
    battle_bundle_digest: str

    @property
    def root_relative(self) -> Path:
        return Path("client/godot/assets/pets") / self.form_id

    @property
    def manifest_relative(self) -> Path:
        return self.root_relative / MANIFEST_RELATIVE


FORM_SPECS = (
    FormSpec(
        source_slug="solar_crown",
        form_id="emberhorn_fusion_solar_crown_fire7_wind3",
        display_name="曜冠角兽",
        subtype_id="emberhorn_fusion_solar_crown",
        production_group="G16",
        art_skeleton_id="emberhorn_solar_crown_v1",
        identity_brief=(
            "成熟四足高速冲锋角兽，单根盾基前向长角、强肩窄腰、连续双层冠鬃和宽菱形尾簇；"
            "深炭紫、暗铜、暖奶油与旧金黑曜角层，背部结构覆盖原鞍位。"
        ),
        recipe_id="emberhorn_solar_crown_fusion_v1",
        growth_profile_id="emberhorn_fusion_solar_crown_fire7_wind3_v1",
        battle_bundle_digest=(
            "5a4896f64614b4eceaad220071fdd80fe85909bfa78d67ffb0637090a71da2fc"
        ),
    ),
    FormSpec(
        source_slug="moss_rampart",
        form_id="emberhorn_fusion_moss_rampart_fire4_earth6",
        display_name="苔垒角兽",
        subtype_id="emberhorn_fusion_moss_rampart",
        production_group="G17",
        art_skeleton_id="emberhorn_moss_rampart_v1",
        identity_brief=(
            "炽角楔头、单角和冲锋轴结合低矮分段有机甲垒、克制苔藓与守势重量；"
            "仍保持四足攻坚轮廓，背甲完整覆盖原鞍位。"
        ),
        recipe_id="emberhorn_moss_rampart_fusion_v1",
        growth_profile_id="emberhorn_fusion_moss_rampart_fire4_earth6_v1",
        battle_bundle_digest=(
            "27c3a0784ab6a2e55a3f3acc6624a722a8b4240bbb04bcd0ffbc53a52d524107"
        ),
    ),
)

EXPECTED_PIPELINE_REPLAY_SHA256 = dict(
    CLOSED_REGISTRATION_LEGACY_PATH_BOUND_REPLAY_SHA256
)

PORTRAIT_AUXILIARY_REFERENCE_RECORDS = {
    FORM_SPECS[0].form_id: (
        {
            "index": 1,
            "pathLabel": (
                ".codex/generated_images/"
                "019fa946-616c-7dd0-ab02-17e6356c5aea/"
                "call_dxUvn2b9rpdSJAXgbT8G5Mp3.png"
            ),
            "role": "codex_generated_iteration_reference",
            "matchesDeclaredIdentityReference": False,
            "currentFileSha256": (
                "3fa0d3e3443895b0a89466b92797412b0311d6fb94f71cba2087115146bd1a88"
            ),
            "currentFileByteLength": 1972736,
            "currentFileWidth": 1254,
            "currentFileHeight": 1254,
            "currentFileFormat": "PNG",
            "currentFileMode": "RGB",
            "historicalRequestBytesVerified": False,
        },
    ),
    FORM_SPECS[1].form_id: (),
}

PORTRAIT_DIRECT_AUXILIARY_REFERENCE_RECORDS = {
    FORM_SPECS[1].form_id: (
        {
            "index": 1,
            "pathLabel": (
                "repository:client/godot/assets/pets/"
                "emberhorn_fusion_solar_crown_fire7_wind3/portrait/"
                "default.png"
            ),
            "role": "repository_reference",
            "matchesDeclaredIdentityReference": False,
            "currentFileSha256": (
                "94f268b58859fff9ff89dee21de7f611c01e279a0dd2d3c2c1c22321d60d8b59"
            ),
            "currentFileByteLength": 199190,
            "currentFileWidth": 512,
            "currentFileHeight": 512,
            "currentFileFormat": "PNG",
            "currentFileMode": "RGBA",
            "historicalRequestBytesVerified": False,
        },
        {
            "index": 2,
            "pathLabel": (
                ".codex/generated_images/"
                "019fe7c8-2fd7-7972-94a7-98382ddfe591/"
                "exec-571f647a-1bbb-4903-862b-a82328a31c63.png"
            ),
            "role": "codex_generated_iteration_reference",
            "matchesDeclaredIdentityReference": False,
            "currentFileSha256": (
                "14b9b63c08093cedb7967c41565b1fac9da53e2ec7276e9d351c48e330e31b7c"
            ),
            "currentFileByteLength": 1870258,
            "currentFileWidth": 1254,
            "currentFileHeight": 1254,
            "currentFileFormat": "PNG",
            "currentFileMode": "RGB",
            "historicalRequestBytesVerified": False,
        },
    ),
}

EMBERHORN_GENE_IDS = (
    "fusion_gene_emberhorn_red_v1",
    "fusion_gene_emberhorn_ash_v1",
    "fusion_gene_emberhorn_gale_v1",
)
MOSSBACK_GENE_IDS = (
    "fusion_gene_mossback_marsh_v1",
    "fusion_gene_mossback_sunbaked_v1",
)
ALL_GENE_IDS = (*EMBERHORN_GENE_IDS, *MOSSBACK_GENE_IDS)
WORLD_DIRECTIONS = (
    "south",
    "southwest",
    "west",
    "northwest",
    "north",
    "northeast",
    "east",
    "southeast",
)
BATTLE_VIEWS = ("front_3quarter_sw", "back_3quarter_ne")
BATTLE_ACTION_FRAME_COUNTS = {
    "idle": 6,
    "walk": 8,
    "attack": 8,
    "skill": 8,
    "hurt": 6,
    "defend": 6,
    "dodge": 8,
    "counter": 8,
    "stagger": 8,
    "knockaway": 8,
    "down": 8,
    "revive": 8,
}


def _expected_owner_visual_paths() -> frozenset[str]:
    paths = {
        "identity/identity-board-transparent.png",
        "identity/front_3quarter_sw.png",
        "identity/back_3quarter_ne.png",
        "identity/south.png",
        "identity/west.png",
    }
    for prefix in ("world/directions", "source/world-frames"):
        for direction in WORLD_DIRECTIONS:
            paths.add(f"{prefix}/{direction}/idle/idle-1.png")
            paths.update(
                f"{prefix}/{direction}/walk/walk-{index}.png"
                for index in range(1, 5)
            )
    for view in BATTLE_VIEWS:
        for action, frame_count in BATTLE_ACTION_FRAME_COUNTS.items():
            for index in range(1, frame_count + 1):
                paths.add(f"views/{view}/{action}/{action}-{index}.png")
                paths.add(
                    f"source/battle/{view}/{action}/source-frames/"
                    f"{action}-{index}.png"
                )
    return frozenset(paths)


def _expected_engineering_support_paths() -> frozenset[str]:
    paths = {
        "action-bundle-meta.json",
        "identity/identity-lock.md",
        "identity/source-and-ownership.md",
        "prompts/identity.txt",
        "qa/battle/contact-sheet.png",
        "qa/battle/qc-summary.json",
        "qa/identity-key-pose-contact-sheet.png",
        "qa/identity-key-pose-qc.json",
        "source/battle/install-manifest.json",
        "source/battle/source-ledger.json",
        "source/identity-board-pipeline-meta.json",
        "source/identity-board-raw.png",
        "source/identity-board-raw.webp",
        "source/identity-board-source-meta.json",
    }
    battle_source_support = (
        "pipeline-input-lossless.png",
        "pipeline-meta.json",
        "prompt-used.txt",
        "qa.json",
        "raw-sheet-lossless.png",
        "repack-meta.json",
        "source-meta.json",
    )
    for view in BATTLE_VIEWS:
        for action in BATTLE_ACTION_FRAME_COUNTS:
            paths.add(f"qa/battle/actions/{view}/{action}-contact.png")
            paths.add(f"qa/battle/actions/{view}/{action}.gif")
            paths.update(
                f"source/battle/{view}/{action}/{filename}"
                for filename in battle_source_support
            )
    return frozenset(paths)


EXPECTED_OWNER_VISUAL_PATHS = _expected_owner_visual_paths()
EXPECTED_ENGINEERING_SUPPORT_PATHS = _expected_engineering_support_paths()
EXPECTED_EXCLUDED_PORTRAIT_PATHS = frozenset(PORTRAIT_FILE_PATHS)


def _sha256_bytes(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    try:
        with path.open("rb") as stream:
            for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(chunk)
    except OSError as error:
        raise VerificationError(f"cannot read file: {path}: {error}") from error
    return digest.hexdigest()


def _json_bytes(value: Any) -> bytes:
    return (
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=False) + "\n"
    ).encode("utf-8")


def _canonical_json_sha256(value: Any) -> str:
    payload = json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return _sha256_bytes(payload)


def _parse_json_bytes(payload: bytes, *, label: str) -> dict[str, Any]:
    def reject_duplicate_keys(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
        result: dict[str, Any] = {}
        for key, value in pairs:
            if key in result:
                raise VerificationError(f"{label} contains duplicate JSON key: {key}")
            result[key] = value
        return result

    try:
        value = json.loads(
            payload.decode("utf-8"),
            object_pairs_hook=reject_duplicate_keys,
        )
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise VerificationError(f"invalid {label}: {error}") from error
    if not isinstance(value, dict):
        raise VerificationError(f"{label} must be a JSON object")
    return value


def _read_json(path: Path, *, label: str) -> dict[str, Any]:
    try:
        payload = path.read_bytes()
    except OSError as error:
        raise VerificationError(f"invalid {label}: {path}: {error}") from error
    return _parse_json_bytes(payload, label=f"{label}: {path}")


def _require_exact_keys(
    value: Mapping[str, Any],
    expected: Iterable[str],
    *,
    label: str,
) -> None:
    expected_set = set(expected)
    actual_set = set(value)
    if actual_set != expected_set:
        raise VerificationError(
            f"{label} keys drift: missing={sorted(expected_set - actual_set)} "
            f"extra={sorted(actual_set - expected_set)}"
        )


def _require_exact_key_order(
    value: Mapping[str, Any],
    expected: Sequence[str],
    *,
    label: str,
) -> None:
    actual = tuple(value)
    expected_tuple = tuple(expected)
    if actual != expected_tuple:
        raise VerificationError(
            f"{label} key order drift: "
            f"expected={list(expected_tuple)} actual={list(actual)}"
        )


def _safe_relative(value: Any, *, label: str) -> str:
    if not isinstance(value, str) or not value:
        raise VerificationError(f"{label} must be a non-empty relative path")
    if "\\" in value:
        raise VerificationError(f"{label} must use POSIX separators: {value!r}")
    path = PurePosixPath(value)
    if path.is_absolute() or any(part in {"", ".", ".."} for part in path.parts):
        raise VerificationError(f"{label} is not a safe relative path: {value!r}")
    if path.as_posix() != value:
        raise VerificationError(f"{label} is not canonical: {value!r}")
    return value


def _repo_path(repo_root: Path, relative: Path | str, *, label: str) -> Path:
    relative_text = _safe_relative(Path(relative).as_posix(), label=label)
    root = repo_root.resolve()
    candidate = root.joinpath(*PurePosixPath(relative_text).parts)
    current = root
    for part in PurePosixPath(relative_text).parts:
        current /= part
        if current.is_symlink():
            raise VerificationError(f"{label} may not traverse a symlink: {current}")
    try:
        resolved = candidate.resolve(strict=False)
        resolved.relative_to(root)
    except (OSError, ValueError) as error:
        raise VerificationError(f"{label} escapes repository root: {relative_text}") from error
    return candidate


def _require_file(path: Path, *, label: str) -> None:
    try:
        mode = path.lstat().st_mode
    except OSError as error:
        raise VerificationError(f"missing {label}: {path}: {error}") from error
    if stat.S_ISLNK(mode) or not stat.S_ISREG(mode) or path.stat().st_size <= 0:
        raise VerificationError(f"{label} must be a non-empty regular file: {path}")


def _require_directory(path: Path, *, label: str) -> None:
    try:
        mode = path.lstat().st_mode
    except OSError as error:
        raise VerificationError(f"missing {label}: {path}: {error}") from error
    if stat.S_ISLNK(mode) or not stat.S_ISDIR(mode):
        raise VerificationError(f"{label} must be a real directory: {path}")


def _file_record(root: Path, path: Path) -> dict[str, Any]:
    return {
        "path": path.relative_to(root).as_posix(),
        "sha256": _sha256_file(path),
        "size": path.stat().st_size,
    }


def _scan_files(root: Path, *, label: str) -> list[dict[str, Any]]:
    _require_directory(root, label=label)
    records: list[dict[str, Any]] = []
    for current, directory_names, file_names in os.walk(root, followlinks=False):
        current_path = Path(current)
        for name in directory_names:
            child = current_path / name
            try:
                mode = child.lstat().st_mode
            except OSError as error:
                raise VerificationError(
                    f"cannot inspect {label} directory: {child}: {error}"
                ) from error
            if stat.S_ISLNK(mode) or not stat.S_ISDIR(mode):
                raise VerificationError(f"{label} contains unsafe directory: {child}")
        for name in file_names:
            child = current_path / name
            try:
                mode = child.lstat().st_mode
            except OSError as error:
                raise VerificationError(
                    f"cannot inspect {label} file: {child}: {error}"
                ) from error
            if stat.S_ISLNK(mode) or not stat.S_ISREG(mode):
                raise VerificationError(f"{label} contains unsafe file: {child}")
            if name.endswith(".import"):
                # Godot sidecars are derived editor state, not product-source
                # evidence. A separate check below rejects them if someone
                # accidentally adds them to the repository index.
                continue
            records.append(_file_record(root, child))
    return sorted(records, key=lambda item: item["path"])


def _git_object_format(repo_root: Path) -> str:
    result = subprocess.run(
        ["git", "-C", str(repo_root), "rev-parse", "--show-object-format"],
        check=False,
        capture_output=True,
        text=True,
    )
    value = result.stdout.strip()
    if result.returncode != 0 or value not in {"sha1", "sha256"}:
        raise VerificationError(
            "cannot determine Git object format: "
            f"{result.stderr.strip() or value!r}"
        )
    return value


def _git_stage_zero_entries(
    repo_root: Path,
    pathspecs: Sequence[str],
    *,
    label: str,
) -> dict[str, tuple[str, str]]:
    result = subprocess.run(
        [
            "git",
            "-C",
            str(repo_root),
            "ls-files",
            "--stage",
            "-z",
            "--",
            *pathspecs,
        ],
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise VerificationError(
            f"cannot inspect {label} Git index: {result.stderr.strip()}"
        )
    entries: dict[str, tuple[str, str]] = {}
    for raw_entry in result.stdout.split("\0"):
        if not raw_entry:
            continue
        header, separator, repository_path = raw_entry.partition("\t")
        fields = header.split()
        if not separator or len(fields) != 3:
            raise VerificationError(f"{label} Git index entry is malformed")
        mode, object_id, stage = fields
        if stage != "0":
            raise VerificationError(
                f"{label} Git index contains an unresolved stage for "
                f"{repository_path}"
            )
        if mode not in {"100644", "100755"}:
            raise VerificationError(
                f"{label} Git index contains a non-regular mode for "
                f"{repository_path}: {mode}"
            )
        if repository_path in entries:
            raise VerificationError(
                f"{label} Git index contains duplicate path: {repository_path}"
            )
        entries[repository_path] = (mode, object_id)
    return entries


def _raw_git_blob_oid(path: Path, *, object_format: str, label: str) -> str:
    _require_file(path, label=label)
    try:
        digest = hashlib.new(object_format)
    except ValueError as error:
        raise VerificationError(
            f"unsupported Git object format: {object_format}"
        ) from error
    try:
        size = path.stat().st_size
        digest.update(f"blob {size}\0".encode("ascii"))
        with path.open("rb") as stream:
            for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(chunk)
    except OSError as error:
        raise VerificationError(f"cannot hash {label}: {path}: {error}") from error
    return digest.hexdigest()


def _require_working_bytes_equal_index(
    repo_root: Path,
    entries: Mapping[str, tuple[str, str]],
    *,
    label: str,
) -> None:
    object_format = _git_object_format(repo_root)
    expected_length = 40 if object_format == "sha1" else 64
    for repository_path, (index_mode, index_oid) in entries.items():
        if not re.fullmatch(rf"[0-9a-f]{{{expected_length}}}", index_oid):
            raise VerificationError(
                f"{label} Git index object id is invalid: {repository_path}"
            )
        working_path = _repo_path(
            repo_root,
            repository_path,
            label=f"{label} working path",
        )
        try:
            working_mode = (
                "100755"
                if working_path.stat().st_mode & 0o111
                else "100644"
            )
        except OSError as error:
            raise VerificationError(
                f"cannot inspect {label} working mode: "
                f"{working_path}: {error}"
            ) from error
        if working_mode != index_mode:
            raise VerificationError(
                f"{label} working mode differs from tracked Git index: "
                f"{repository_path}"
            )
        working_oid = _raw_git_blob_oid(
            working_path,
            object_format=object_format,
            label=f"{label} working file",
        )
        if working_oid != index_oid:
            raise VerificationError(
                f"{label} working bytes differ from tracked Git index: "
                f"{repository_path}"
            )


def _validate_git_index_inventory(
    repo_root: Path,
    root_relative: Path,
    expected_paths: set[str],
) -> bool:
    if not (repo_root / ".git").exists():
        raise VerificationError(
            "closed registration verification requires a Git working tree "
            "so production assets can be bound to the index"
        )
    entries = _git_stage_zero_entries(
        repo_root,
        (root_relative.as_posix(),),
        label=f"{root_relative.as_posix()} production inventory",
    )
    prefix = f"{root_relative.as_posix()}/"
    tracked_repository_paths = set(entries)
    tracked_imports = sorted(
        path for path in tracked_repository_paths if path.endswith(".import")
    )
    if tracked_imports:
        raise VerificationError(
            f"{root_relative.as_posix()} contains tracked generated .import files: "
            f"{tracked_imports}"
        )
    tracked_relative_paths = {
        path[len(prefix) :]
        for path in tracked_repository_paths
        if path.startswith(prefix)
    }
    if tracked_relative_paths != expected_paths:
        raise VerificationError(
            f"{root_relative.as_posix()} Git index inventory drift: "
            f"missing={sorted(expected_paths - tracked_relative_paths)} "
            f"extra={sorted(tracked_relative_paths - expected_paths)}"
        )
    _require_working_bytes_equal_index(
        repo_root,
        entries,
        label=f"{root_relative.as_posix()} production inventory",
    )
    return True


def _validate_git_index_authorities(
    repo_root: Path,
    expected_paths: Sequence[Path],
) -> bool:
    if not (repo_root / ".git").exists():
        raise VerificationError(
            "closed registration verification requires a Git working tree "
            "so authority inputs can be bound to the index"
        )
    expected = {path.as_posix() for path in expected_paths}
    entries = _git_stage_zero_entries(
        repo_root,
        tuple(sorted(expected)),
        label="authority inputs",
    )
    actual = set(entries)
    if actual != expected:
        raise VerificationError(
            "authority inputs are not exactly tracked in the Git index: "
            f"missing={sorted(expected - actual)} extra={sorted(actual - expected)}"
        )
    _require_working_bytes_equal_index(
        repo_root,
        entries,
        label="authority input",
    )
    return True


def _validate_record_list(value: Any, *, label: str) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        raise VerificationError(f"{label} must be a list")
    records: list[dict[str, Any]] = []
    seen: set[str] = set()
    for index, record in enumerate(value):
        item_label = f"{label}[{index}]"
        if not isinstance(record, dict):
            raise VerificationError(f"{item_label} must be an object")
        _require_exact_keys(record, {"path", "sha256", "size"}, label=item_label)
        _require_exact_key_order(
            record,
            ("path", "sha256", "size"),
            label=item_label,
        )
        relative = _safe_relative(record.get("path"), label=f"{item_label}.path")
        sha256 = record.get("sha256")
        size = record.get("size")
        if not isinstance(sha256, str) or not SHA256_RE.fullmatch(sha256):
            raise VerificationError(f"{item_label}.sha256 is invalid")
        if isinstance(size, bool) or not isinstance(size, int) or size <= 0:
            raise VerificationError(f"{item_label}.size must be a positive integer")
        if relative in seen:
            raise VerificationError(f"{label} contains duplicate path: {relative}")
        seen.add(relative)
        records.append({"path": relative, "sha256": sha256, "size": size})
    if [record["path"] for record in records] != sorted(seen):
        raise VerificationError(f"{label} must be sorted by path")
    return records


def _record_map(records: Sequence[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {record["path"]: record for record in records}


def _verify_records_on_disk(
    root: Path,
    records: Sequence[dict[str, Any]],
    *,
    label: str,
) -> None:
    for record in records:
        path = _repo_path(root, record["path"], label=f"{label} path")
        _require_file(path, label=f"{label} file")
        actual = _file_record(root, path)
        if actual != record:
            raise VerificationError(
                f"{label} drift: {record['path']} "
                f"expected={record} actual={actual}"
            )


def _expected_owner_decision() -> dict[str, Any]:
    return {
        "schemaVersion": 1,
        "decisionType": "beastbound_pet_fusion_full_nonrideable_visual_owner_decision",
        "decisionId": "pet_fusion_p1_4e_full_nonrideable_visual_20260730",
        "roadmapItem": "P1.4e",
        "decision": "approved",
        "reviewer": "project-owner:fander",
        "reviewedOn": "2026-07-30",
        "recordedDecisionText": "通过啊",
        "approvedScopes": list(OWNER_APPROVED_SCOPES),
        "excludedScopes": list(OWNER_EXCLUDED_SCOPES),
        "evidence": {
            "mergedReviewVideo": {
                "path": OWNER_REVIEW_VIDEO_RELATIVE,
                "sha256": OWNER_REVIEW_VIDEO_SHA256,
                "width": 1280,
                "height": 720,
                "fps": 30,
                "playbackSpeed": 1.0,
                "videoFrameCount": 3312,
            },
            "phaseRecord": {
                "path": PHASE_RECORD_RELATIVE.as_posix(),
                "sha256": PHASE_RECORD_SHA256,
            },
            "forms": [
                {
                    "formId": FORM_SPECS[0].form_id,
                    "battleBundleDigest": FORM_SPECS[0].battle_bundle_digest,
                    "worldEvidenceIndex": {
                        "path": (
                            ".run/evidence/p1_4e_fusion_full_pack/world-review/"
                            "p1-4e-solar-world-final/evidence-index.json"
                        ),
                        "sha256": (
                            "bcc3248294e6fd8249b07ca2b04a5f4b9c67ef98565be01750ae6c1f71aae571"
                        ),
                    },
                    "battleReviewVideo": {
                        "path": (
                            ".run/evidence/phase371_fusion_owner_review/"
                            "solar-battle-revive-fix-v1/review.mp4"
                        ),
                        "sha256": (
                            "c0ea90703062ae9172dadd9d97aa9d015f00cb9cb0e92f065124f33890f39bf8"
                        ),
                    },
                },
                {
                    "formId": FORM_SPECS[1].form_id,
                    "battleBundleDigest": FORM_SPECS[1].battle_bundle_digest,
                    "worldEvidenceIndex": {
                        "path": (
                            ".run/evidence/p1_4e_fusion_full_pack/world-review/"
                            "p1-4e-moss-world-final/evidence-index.json"
                        ),
                        "sha256": (
                            "28eac45aaa1a9145d7597422f06bb35d9e5966a8a05bc63f75ca4f9e00ab6062"
                        ),
                    },
                    "battleReviewVideo": {
                        "path": (
                            ".run/evidence/phase371_fusion_owner_review/"
                            "moss-battle-revive-fix-v1/review.mp4"
                        ),
                        "sha256": (
                            "db12103d76d14cce6ec7a4d9490552a9a0971e834972d72d23bb5ef61f0b21cb"
                        ),
                    },
                },
            ],
        },
        "releaseApproved": False,
        "runtimeEnabled": False,
    }


def _validate_owner_decision(repo_root: Path) -> dict[str, Any]:
    decision_path = _repo_path(
        repo_root,
        OWNER_DECISION_RELATIVE,
        label="owner decision path",
    )
    _require_file(decision_path, label="tracked owner decision")
    actual_sha = _sha256_file(decision_path)
    if actual_sha != OWNER_DECISION_SHA256:
        raise VerificationError(
            "owner decision SHA drift: "
            f"expected={OWNER_DECISION_SHA256} actual={actual_sha}"
        )
    decision = _read_json(decision_path, label="owner decision")
    expected = _expected_owner_decision()
    if decision != expected:
        raise VerificationError(
            "owner decision content drifted from the frozen approval/exclusion scope"
        )
    phase_path = _repo_path(
        repo_root,
        PHASE_RECORD_RELATIVE,
        label="owner phase record path",
    )
    _require_file(phase_path, label="tracked owner phase record")
    phase_sha = _sha256_file(phase_path)
    if phase_sha != PHASE_RECORD_SHA256:
        raise VerificationError(
            "owner phase record SHA drift: "
            f"expected={PHASE_RECORD_SHA256} actual={phase_sha}"
        )
    external_records = [expected["evidence"]["mergedReviewVideo"]]
    for form_record in expected["evidence"]["forms"]:
        external_records.extend(
            [form_record["worldEvidenceIndex"], form_record["battleReviewVideo"]]
        )
    optional_evidence: list[dict[str, Any]] = []
    for record in external_records:
        evidence_path = _repo_path(
            repo_root,
            record["path"],
            label="optional local owner evidence path",
        )
        if not evidence_path.exists() and not evidence_path.is_symlink():
            optional_evidence.append(
                {
                    "path": record["path"],
                    "sha256": record["sha256"],
                    "present": False,
                }
            )
            continue
        _require_file(evidence_path, label="optional local owner evidence")
        evidence_sha = _sha256_file(evidence_path)
        if evidence_sha != record["sha256"]:
            raise VerificationError(
                "optional local owner evidence SHA drift: "
                f"{record['path']} expected={record['sha256']} actual={evidence_sha}"
            )
        optional_evidence.append(
            {
                "path": record["path"],
                "sha256": evidence_sha,
                "present": True,
            }
        )
    return {
        "path": OWNER_DECISION_RELATIVE.as_posix(),
        "sha256": actual_sha,
        "approvedScopes": list(OWNER_APPROVED_SCOPES),
        "excludedScopes": list(OWNER_EXCLUDED_SCOPES),
        "optionalEvidence": optional_evidence,
    }


def _expected_art_form(spec: FormSpec) -> dict[str, Any]:
    root = spec.root_relative.as_posix()
    return {
        "formId": spec.form_id,
        "displayName": spec.display_name,
        "lineId": "emberhorn",
        "subtypeId": spec.subtype_id,
        "productionGroup": spec.production_group,
        "artSkeletonId": spec.art_skeleton_id,
        "status": "in_production",
        "runtimeEnabled": False,
        "rideableTarget": False,
        "supportedCharacterIds": [],
        "identityBrief": spec.identity_brief,
        "pet": {
            "root": root,
            "portraitPath": f"{root}/portrait/default.png",
            "metadataPath": f"{root}/action-bundle-meta.json",
            "identityPath": f"{root}/identity/identity-lock.md",
            "ownershipPath": f"{root}/identity/source-and-ownership.md",
            "promptPath": f"{root}/prompts/identity.txt",
        },
    }


def _iter_string_values(value: Any, *, path: str = "$") -> Iterable[tuple[str, str]]:
    if isinstance(value, dict):
        for key, child in value.items():
            yield from _iter_string_values(child, path=f"{path}.{key}")
    elif isinstance(value, list):
        for index, child in enumerate(value):
            yield from _iter_string_values(child, path=f"{path}[{index}]")
    elif isinstance(value, str):
        yield path, value


def _validate_art_catalog(repo_root: Path) -> dict[str, str]:
    path = _repo_path(repo_root, ART_CATALOG_RELATIVE, label="pet art catalog path")
    _require_file(path, label="pet art catalog")
    catalog = _read_json(path, label="pet art catalog")
    forms = catalog.get("forms")
    if not isinstance(forms, list):
        raise VerificationError("pet art catalog forms must be a list")
    target_ids = {spec.form_id for spec in FORM_SPECS}
    target_roots = {spec.root_relative.as_posix() for spec in FORM_SPECS}
    target_private_identifiers = {
        value
        for spec in FORM_SPECS
        for value in (spec.form_id, spec.subtype_id, spec.art_skeleton_id)
    }
    target_roots_folded = {root.casefold() for root in target_roots}
    target_private_identifiers_folded = {
        value.casefold() for value in target_private_identifiers
    }
    non_target_forms: list[dict[str, Any]] = []
    for index, item in enumerate(forms):
        if not isinstance(item, dict):
            raise VerificationError(f"pet art catalog form[{index}] must be an object")
        form_id = str(item.get("formId", ""))
        if form_id in target_ids:
            continue
        non_target_forms.append(item)
    non_target_catalog = {
        key: value for key, value in catalog.items() if key != "forms"
    }
    non_target_catalog["forms"] = non_target_forms
    for value_path, string_value in _iter_string_values(non_target_catalog):
        folded_value = string_value.casefold()
        aliases_root = any(
            folded_value == root or folded_value.startswith(f"{root}/")
            for root in target_roots_folded
        )
        aliases_private_id = any(
            private_id in folded_value
            for private_id in target_private_identifiers_folded
        )
        if aliases_root or aliases_private_id:
            raise VerificationError(
                "pet art catalog aliases a frozen fusion production contract "
                f"outside its exact target form at {value_path}: "
                f"value={string_value!r}"
            )
    fusion_forms = [
        item
        for item in forms
        if isinstance(item, dict)
        and "_fusion_" in str(item.get("formId", "")).casefold()
    ]
    expected = [_expected_art_form(spec) for spec in FORM_SPECS]
    actual_by_id = {
        str(item.get("formId")): item for item in fusion_forms if isinstance(item, dict)
    }
    expected_by_id = {item["formId"]: item for item in expected}
    if len(actual_by_id) != len(fusion_forms) or actual_by_id != expected_by_id:
        raise VerificationError(
            "pet art catalog must contain exactly the two frozen in_production, "
            "runtime-disabled, non-rideable fusion forms with no mounted contract"
        )
    for form in fusion_forms:
        serialized = json.dumps(form, ensure_ascii=False).lower()
        if '"mounted"' in serialized or "/mounted/" in serialized:
            raise VerificationError(
                f"mounted art is forbidden for first-release fusion form "
                f"{form.get('formId')}"
            )
    catalog_slice = {
        key: value for key, value in catalog.items() if key != "forms"
    }
    catalog_slice["forms"] = sorted(
        expected,
        key=lambda item: item["formId"],
    )
    slice_sha = _canonical_json_sha256(catalog_slice)
    if slice_sha != EXPECTED_ART_CATALOG_SLICE_SHA256:
        raise VerificationError(
            "pet art catalog fusion slice drift: "
            f"expected={EXPECTED_ART_CATALOG_SLICE_SHA256} actual={slice_sha}"
        )
    return {
        "path": ART_CATALOG_RELATIVE.as_posix(),
        "sliceSha256": slice_sha,
    }


def _expected_recipe(spec: FormSpec) -> dict[str, Any]:
    if spec is FORM_SPECS[0]:
        resonance_one_lineages = ["emberhorn"]
        resonance_one_genes = list(EMBERHORN_GENE_IDS)
    else:
        resonance_one_lineages = ["mossback"]
        resonance_one_genes = list(MOSSBACK_GENE_IDS)
    return {
        "recipeId": spec.recipe_id,
        "targetFormId": spec.form_id,
        "targetGrowthProfileId": spec.growth_profile_id,
        "roleGeneRules": {
            "core": {
                "allowedLineageIds": ["emberhorn"],
                "allowedGeneProfileIds": list(EMBERHORN_GENE_IDS),
            },
            "resonance_one": {
                "allowedLineageIds": resonance_one_lineages,
                "allowedGeneProfileIds": resonance_one_genes,
            },
            "resonance_two": {
                "allowedLineageIds": ["emberhorn", "mossback"],
                "allowedGeneProfileIds": list(ALL_GENE_IDS),
            },
        },
        "result": {
            "level": 1,
            "rebirthCount": 1,
            "terminalPathId": "fusion_terminal_v1",
            "paidResetAllowed": False,
            "newInstanceRequired": True,
            "numericSource": "target_profile_only_v1",
            "rideable": False,
            "bindingPolicy": "bound_if_any_material_bound",
            "resultStatePolicy": "replace_active_else_core_state",
        },
        "assetGate": {
            "status": "formal",
            "replacementPath": spec.root_relative.as_posix(),
        },
    }


def _validate_fusion_catalog(repo_root: Path) -> dict[str, str]:
    path = _repo_path(
        repo_root,
        FUSION_CATALOG_RELATIVE,
        label="fusion catalog path",
    )
    _require_file(path, label="fusion catalog")
    catalog = _read_json(path, label="fusion catalog")
    if catalog.get("schemaVersion") != 2:
        raise VerificationError("fusion catalog schemaVersion must remain 2")
    if catalog.get("catalogId") != "pet_fusion_recipes_v2":
        raise VerificationError("fusion catalogId drift")
    if catalog.get("runtimeEnabled") is not False:
        raise VerificationError("fusion catalog runtimeEnabled must remain false")
    recipes = catalog.get("recipes")
    expected_recipes = [_expected_recipe(spec) for spec in FORM_SPECS]
    if not isinstance(recipes, list):
        raise VerificationError("fusion catalog recipes must be a list")
    recipes_by_id = {
        str(item.get("recipeId")): item
        for item in recipes
        if isinstance(item, dict)
    }
    expected_by_id = {item["recipeId"]: item for item in expected_recipes}
    if len(recipes_by_id) != len(recipes) or recipes_by_id != expected_by_id:
        raise VerificationError(
            "fusion catalog must contain exactly the two frozen formal recipes"
        )
    if "playerEntry" in catalog:
        raise VerificationError("fusion catalog may not declare a player entry")
    gene_profiles = catalog.get("geneProfiles")
    if not isinstance(gene_profiles, list):
        raise VerificationError("fusion catalog geneProfiles must be a list")
    relevant_genes = [
        item
        for item in gene_profiles
        if isinstance(item, dict) and item.get("geneProfileId") in ALL_GENE_IDS
    ]
    if (
        len(relevant_genes) != len(ALL_GENE_IDS)
        or {item.get("geneProfileId") for item in relevant_genes} != set(ALL_GENE_IDS)
    ):
        raise VerificationError(
            "fusion catalog must contain exactly one record for each of the five "
            "recipe-bound genes"
        )
    catalog_slice = {
        key: value
        for key, value in catalog.items()
        if key not in {"geneProfiles", "recipes"}
    }
    catalog_slice["geneProfiles"] = sorted(
        relevant_genes,
        key=lambda item: item["geneProfileId"],
    )
    catalog_slice["recipes"] = sorted(
        expected_recipes,
        key=lambda item: item["recipeId"],
    )
    slice_sha = _canonical_json_sha256(catalog_slice)
    if slice_sha != EXPECTED_FUSION_CATALOG_SLICE_SHA256:
        raise VerificationError(
            "fusion catalog closed slice drift: "
            f"expected={EXPECTED_FUSION_CATALOG_SLICE_SHA256} actual={slice_sha}"
        )
    return {
        "path": FUSION_CATALOG_RELATIVE.as_posix(),
        "sliceSha256": slice_sha,
    }


def _expected_manifest_lifecycle() -> dict[str, Any]:
    return {
        "registrationStatus": "engineering_closed_asset_copy",
        "runtimeEnabled": False,
        "rideable": False,
        "petArtCatalogEdited": False,
        "fusionRecipeCatalogEdited": False,
        "playerEntryOpened": False,
        "ownerVisualDecisionApprovesThisEngineeringRegistration": False,
    }


def _reject_mounted_contract(value: Any, *, label: str) -> None:
    if isinstance(value, dict):
        for key, child in value.items():
            normalized = re.sub(r"[^a-z0-9]", "", str(key).lower())
            mounted_gate = (
                "mounted" in normalized
                or normalized in {"rideable", "rideabletarget", "resultrideable"}
                or (
                    "ride" in normalized
                    and any(
                        token in normalized
                        for token in ("allowed", "enabled", "support", "target")
                    )
                )
            )
            if mounted_gate:
                if child not in (False, None, "", [], {}):
                    raise VerificationError(
                        f"{label} opens forbidden mounted field: {key}"
                    )
                continue
            _reject_mounted_contract(child, label=f"{label}.{key}")
    elif isinstance(value, list):
        for index, child in enumerate(value):
            _reject_mounted_contract(child, label=f"{label}[{index}]")
    elif isinstance(value, str) and "/mounted/" in value.lower():
        raise VerificationError(f"{label} contains forbidden mounted asset path")


def _reject_open_release_state(value: Any, *, label: str) -> None:
    closed_boolean_keys = {
        "automaticapprovaleligible",
        "fullbodycropallowed",
        "playerentry",
        "playerentryopened",
        "portraitreleasegate",
        "releaseapproved",
        "releasegate",
        "runtimereleaseready",
        "runtimeenabled",
        "semanticindependenceverified",
    }

    def is_closed_gate_key(normalized: str) -> bool:
        if normalized in closed_boolean_keys:
            return True
        gate_state_tokens = (
            "accepted",
            "approved",
            "available",
            "eligible",
            "enabled",
            "gate",
            "open",
            "ready",
            "released",
            "unlocked",
            "verified",
        )
        if "playerentry" in normalized or "playeraccess" in normalized:
            return True
        if (
            any(
                subject in normalized
                for subject in (
                    "art",
                    "automaticapproval",
                    "fusion",
                    "owner",
                    "production",
                    "registration",
                    "runtime",
                    "release",
                    "semantic",
                    "semanticindependence",
                )
            )
            and any(token in normalized for token in gate_state_tokens)
        ):
            return True
        return False

    if isinstance(value, dict):
        for key, child in value.items():
            normalized = re.sub(r"[^a-z0-9]", "", str(key).lower())
            child_label = f"{label}.{key}"
            if is_closed_gate_key(normalized) and child is not False:
                raise VerificationError(
                    f"{child_label} must remain explicitly false in closed state"
                )
            if normalized in {"ownerdecision", "portraitownerdecision"} and child not in (
                None,
                False,
                "",
                [],
                {},
            ):
                raise VerificationError(
                    f"{child_label} is forbidden while owner review is pending"
                )
            if (
                isinstance(child, str)
                and child.lower() == "approved"
                and any(token in normalized for token in ("owner", "review", "release"))
            ):
                raise VerificationError(
                    f"{child_label} may not claim approved in closed state"
                )
            _reject_open_release_state(child, label=child_label)
    elif isinstance(value, list):
        for index, child in enumerate(value):
            _reject_open_release_state(child, label=f"{label}[{index}]")


def _validate_action_metadata(root: Path, spec: FormSpec) -> None:
    path = root / "action-bundle-meta.json"
    _require_file(path, label=f"{spec.form_id} action metadata")
    metadata = _read_json(path, label=f"{spec.form_id} action metadata")
    expected = {
        "formId": spec.form_id,
        "runtimeEnabled": False,
        "rideableTarget": False,
        "ownerReviewStatus": "pending",
    }
    for key, value in expected.items():
        if metadata.get(key) != value:
            raise VerificationError(
                f"{spec.form_id} action metadata {key} must remain {value!r}, "
                f"got {metadata.get(key)!r}"
            )
    if metadata.get("artStatus", "in_production") != "in_production":
        raise VerificationError(
            f"{spec.form_id} action metadata artStatus must remain in_production"
        )
    if metadata.get("supportedMountedCharacterIds", []) != []:
        raise VerificationError(
            f"{spec.form_id} action metadata mounted character list must stay empty"
        )
    for section_name in ("worldVisual", "battleVisual"):
        section = metadata.get(section_name)
        if section is None:
            continue
        if not isinstance(section, dict):
            raise VerificationError(
                f"{spec.form_id} action metadata {section_name} must be an object"
            )
        if section.get("runtimeEnabled", False) is not False:
            raise VerificationError(
                f"{spec.form_id} action metadata {section_name}.runtimeEnabled "
                "must remain false"
            )
        if section.get("status", "owner_review_pending") != "owner_review_pending":
            raise VerificationError(
                f"{spec.form_id} action metadata {section_name}.status must remain "
                "owner_review_pending"
            )
    _reject_mounted_contract(
        metadata,
        label=f"{spec.form_id} action metadata",
    )
    _reject_open_release_state(
        metadata,
        label=f"{spec.form_id} action metadata",
    )


def _require_sha_size(
    value: Mapping[str, Any],
    *,
    sha_key: str,
    size_key: str,
    label: str,
) -> tuple[str, int]:
    sha256 = value.get(sha_key)
    size = value.get(size_key)
    if not isinstance(sha256, str) or not SHA256_RE.fullmatch(sha256):
        raise VerificationError(f"{label}.{sha_key} is invalid")
    if isinstance(size, bool) or not isinstance(size, int) or size <= 0:
        raise VerificationError(f"{label}.{size_key} must be a positive integer")
    return sha256, size


def _reverse_single_json_string_change(
    candidate_payload: bytes,
    *,
    old_value: str,
    new_value: str,
    source_sha256: str,
    source_size: int,
    label: str,
) -> dict[str, Any]:
    try:
        candidate_text = candidate_payload.decode("utf-8")
    except UnicodeDecodeError as error:
        raise VerificationError(f"{label} candidate is not UTF-8: {error}") from error
    old_token = json.dumps(old_value, ensure_ascii=False)
    new_token = json.dumps(new_value, ensure_ascii=False)
    if old_token == new_token or candidate_text.count(new_token) != 1:
        raise VerificationError(
            f"{label} candidate must contain exactly one transformed JSON token"
        )
    if old_token in candidate_text:
        raise VerificationError(f"{label} candidate still contains its source token")
    source_payload = candidate_text.replace(new_token, old_token, 1).encode("utf-8")
    if len(source_payload) != source_size or _sha256_bytes(source_payload) != source_sha256:
        raise VerificationError(
            f"{label} cannot replay the declared isolated-source bytes"
        )
    return _parse_json_bytes(source_payload, label=f"{label} reconstructed source")


def _json_value_at(value: Any, field_path: Sequence[str]) -> Any:
    current = value
    for key in field_path:
        if not isinstance(current, dict) or key not in current:
            return None
        current = current[key]
    return current


def _set_json_value(
    value: dict[str, Any],
    field_path: Sequence[str],
    replacement: str,
    *,
    label: str,
) -> None:
    current = value
    for key in field_path[:-1]:
        child = current.get(key)
        if not isinstance(child, dict):
            raise VerificationError(
                f"{label} field is not an object: {'.'.join(field_path)}"
            )
        current = child
    current[field_path[-1]] = replacement


def _reverse_json_string_changes(
    candidate_payload: bytes,
    *,
    field_updates: Sequence[Mapping[str, Any]],
    source_sha256: str,
    source_size: int,
    label: str,
) -> dict[str, Any]:
    try:
        candidate_text = candidate_payload.decode("utf-8")
    except UnicodeDecodeError as error:
        raise VerificationError(f"{label} candidate is not UTF-8: {error}") from error
    candidate = _parse_json_bytes(candidate_payload, label=f"{label} candidate")
    expected_source = copy.deepcopy(candidate)
    source_text = candidate_text
    for index, update in enumerate(field_updates):
        update_label = f"{label}.fieldUpdates[{index}]"
        _require_exact_keys(
            update,
            {"field", "digestKind", "from", "to"},
            label=update_label,
        )
        _require_exact_key_order(
            update,
            ("field", "digestKind", "from", "to"),
            label=update_label,
        )
        field = update.get("field")
        old_value = update.get("from")
        new_value = update.get("to")
        if (
            not isinstance(field, str)
            or not field
            or not isinstance(old_value, str)
            or not SHA256_RE.fullmatch(old_value)
            or not isinstance(new_value, str)
            or not SHA256_RE.fullmatch(new_value)
            or old_value == new_value
        ):
            raise VerificationError(f"{update_label} has an invalid hash update")
        field_path = tuple(field.split("."))
        if any(not key for key in field_path):
            raise VerificationError(f"{update_label}.field is invalid")
        if _json_value_at(candidate, field_path) != new_value:
            raise VerificationError(
                f"{update_label} does not bind its candidate field value"
            )
        old_token = json.dumps(old_value, ensure_ascii=False)
        new_token = json.dumps(new_value, ensure_ascii=False)
        if source_text.count(new_token) != 1:
            raise VerificationError(
                f"{update_label} candidate token must occur exactly once"
            )
        if old_token in source_text:
            raise VerificationError(
                f"{update_label} candidate still contains its source token"
            )
        source_text = source_text.replace(new_token, old_token, 1)
        _set_json_value(
            expected_source,
            field_path,
            old_value,
            label=update_label,
        )
    source_payload = source_text.encode("utf-8")
    if len(source_payload) != source_size or _sha256_bytes(source_payload) != source_sha256:
        raise VerificationError(
            f"{label} cannot replay the declared isolated-source bytes"
        )
    source = _parse_json_bytes(
        source_payload,
        label=f"{label} reconstructed source",
    )
    if source != expected_source:
        raise VerificationError(
            f"{label} changed fields beyond its declared fieldUpdates"
        )
    return source


def _validate_engineering_transformations(
    repo_root: Path,
    root: Path,
    spec: FormSpec,
    manifest: Mapping[str, Any],
    copied_map: Mapping[str, dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    relocations = manifest.get("engineeringRelocations")
    integrity_updates = manifest.get("engineeringIntegrityUpdates")
    if not isinstance(relocations, list) or len(relocations) != 1:
        raise VerificationError(
            f"{spec.form_id} manifest must contain exactly one engineering relocation"
        )
    if not isinstance(integrity_updates, list) or len(integrity_updates) != 2:
        raise VerificationError(
            f"{spec.form_id} manifest must contain exactly two engineering integrity updates"
        )

    relocation = relocations[0]
    if not isinstance(relocation, dict):
        raise VerificationError(f"{spec.form_id} engineering relocation must be an object")
    _require_exact_keys(
        relocation,
        {
            "path",
            "field",
            "from",
            "to",
            "sourceMetadataSha256",
            "sourceMetadataSize",
            "candidateMetadataSha256",
            "candidateMetadataSize",
            "inputAsset",
        },
        label=f"{spec.form_id} engineering relocation",
    )
    _require_exact_key_order(
        relocation,
        (
            "path",
            "field",
            "from",
            "to",
            "sourceMetadataSha256",
            "sourceMetadataSize",
            "candidateMetadataSha256",
            "candidateMetadataSize",
            "inputAsset",
        ),
        label=f"{spec.form_id} engineering relocation",
    )
    pipeline_relative = "source/identity-board-pipeline-meta.json"
    raw_relative = "source/identity-board-raw.png"
    source_raw = f"{manifest['sourceRoot']}/{raw_relative}"
    candidate_raw = f"{manifest['destinationRoot']}/{raw_relative}"
    if (
        relocation.get("path") != pipeline_relative
        or relocation.get("field") != "input"
        or relocation.get("from") != source_raw
        or relocation.get("to") != candidate_raw
    ):
        raise VerificationError(f"{spec.form_id} identity pipeline relocation drift")
    source_pipeline_sha, source_pipeline_size = _require_sha_size(
        relocation,
        sha_key="sourceMetadataSha256",
        size_key="sourceMetadataSize",
        label=f"{spec.form_id} engineering relocation",
    )
    candidate_pipeline_sha, candidate_pipeline_size = _require_sha_size(
        relocation,
        sha_key="candidateMetadataSha256",
        size_key="candidateMetadataSize",
        label=f"{spec.form_id} engineering relocation",
    )
    pipeline_record = copied_map.get(pipeline_relative)
    if pipeline_record != {
        "path": pipeline_relative,
        "sha256": candidate_pipeline_sha,
        "size": candidate_pipeline_size,
    }:
        raise VerificationError(
            f"{spec.form_id} pipeline relocation does not bind copiedFiles"
        )
    input_asset = relocation.get("inputAsset")
    if not isinstance(input_asset, dict):
        raise VerificationError(f"{spec.form_id} relocation inputAsset must be an object")
    _require_exact_keys(
        input_asset,
        {"path", "sha256"},
        label=f"{spec.form_id} relocation inputAsset",
    )
    _require_exact_key_order(
        input_asset,
        ("path", "sha256"),
        label=f"{spec.form_id} relocation inputAsset",
    )
    raw_record = copied_map.get(raw_relative)
    if (
        input_asset.get("path") != candidate_raw
        or raw_record is None
        or input_asset.get("sha256") != raw_record["sha256"]
    ):
        raise VerificationError(
            f"{spec.form_id} pipeline relocation raw input binding drift"
        )
    pipeline_path = root / pipeline_relative
    _require_file(pipeline_path, label=f"{spec.form_id} relocated pipeline metadata")
    pipeline_payload = pipeline_path.read_bytes()
    if (
        _sha256_bytes(pipeline_payload) != candidate_pipeline_sha
        or len(pipeline_payload) != candidate_pipeline_size
    ):
        raise VerificationError(f"{spec.form_id} relocated pipeline metadata drift")
    pipeline = _parse_json_bytes(
        pipeline_payload,
        label=f"{spec.form_id} relocated pipeline metadata",
    )
    if (
        pipeline.get("input") != candidate_raw
        or pipeline.get("inputSha256") != raw_record["sha256"]
    ):
        raise VerificationError(
            f"{spec.form_id} relocated pipeline fields do not bind the production raw board"
        )
    source_pipeline = _reverse_single_json_string_change(
        pipeline_payload,
        old_value=source_raw,
        new_value=candidate_raw,
        source_sha256=source_pipeline_sha,
        source_size=source_pipeline_size,
        label=f"{spec.form_id} pipeline relocation",
    )
    expected_source_pipeline = dict(pipeline)
    expected_source_pipeline["input"] = source_raw
    if source_pipeline != expected_source_pipeline:
        raise VerificationError(
            f"{spec.form_id} pipeline relocation changed fields beyond input"
        )

    integrity_by_path: dict[str, Mapping[str, Any]] = {}
    for index, value in enumerate(integrity_updates):
        if not isinstance(value, dict):
            raise VerificationError(
                f"{spec.form_id} engineering integrity update "
                f"{index} must be an object"
            )
        path = value.get("path")
        if not isinstance(path, str) or path in integrity_by_path:
            raise VerificationError(
                f"{spec.form_id} engineering integrity update paths must be unique"
            )
        integrity_by_path[path] = value
    expected_integrity_order = [
        "source/identity-board-source-meta.json",
        "action-bundle-meta.json",
    ]
    if [item.get("path") for item in integrity_updates] != expected_integrity_order:
        raise VerificationError(
            f"{spec.form_id} engineering integrity update order drift"
        )

    integrity = integrity_by_path["source/identity-board-source-meta.json"]
    if not isinstance(integrity, dict):
        raise VerificationError(
            f"{spec.form_id} engineering integrity update must be an object"
        )
    _require_exact_keys(
        integrity,
        {
            "path",
            "field",
            "from",
            "to",
            "sourceMetadataSha256",
            "sourceMetadataSize",
            "candidateMetadataSha256",
            "candidateMetadataSize",
            "boundFile",
            "fieldUpdates",
        },
        label=f"{spec.form_id} engineering integrity update",
    )
    _require_exact_key_order(
        integrity,
        (
            "path",
            "field",
            "from",
            "to",
            "fieldUpdates",
            "sourceMetadataSha256",
            "sourceMetadataSize",
            "candidateMetadataSha256",
            "candidateMetadataSize",
            "boundFile",
        ),
        label=f"{spec.form_id} engineering integrity update",
    )
    source_meta_relative = "source/identity-board-source-meta.json"
    candidate_pipeline_path = (
        f"{manifest['destinationRoot']}/{pipeline_relative}"
    )
    if (
        integrity.get("path") != source_meta_relative
        or integrity.get("field") != "pipelineMetadataSha256"
        or integrity.get("from") != source_pipeline_sha
        or integrity.get("to") != candidate_pipeline_sha
    ):
        raise VerificationError(f"{spec.form_id} source-ledger integrity update drift")
    source_meta_field_updates = integrity.get("fieldUpdates")
    if source_meta_field_updates != [
        {
            "field": "pipelineMetadataSha256",
            "digestKind": "file_sha256",
            "from": source_pipeline_sha,
            "to": candidate_pipeline_sha,
        }
    ]:
        raise VerificationError(
            f"{spec.form_id} source-ledger fieldUpdates drift"
        )
    _require_exact_key_order(
        source_meta_field_updates[0],
        ("field", "digestKind", "from", "to"),
        label=f"{spec.form_id} source-ledger fieldUpdates[0]",
    )
    source_meta_sha, source_meta_size = _require_sha_size(
        integrity,
        sha_key="sourceMetadataSha256",
        size_key="sourceMetadataSize",
        label=f"{spec.form_id} engineering integrity update",
    )
    candidate_meta_sha, candidate_meta_size = _require_sha_size(
        integrity,
        sha_key="candidateMetadataSha256",
        size_key="candidateMetadataSize",
        label=f"{spec.form_id} engineering integrity update",
    )
    source_meta_record = copied_map.get(source_meta_relative)
    if source_meta_record != {
        "path": source_meta_relative,
        "sha256": candidate_meta_sha,
        "size": candidate_meta_size,
    }:
        raise VerificationError(
            f"{spec.form_id} source-ledger update does not bind copiedFiles"
        )
    bound_file = integrity.get("boundFile")
    if not isinstance(bound_file, dict):
        raise VerificationError(
            f"{spec.form_id} engineering integrity boundFile must be an object"
        )
    _require_exact_keys(
        bound_file,
        {"path", "sha256"},
        label=f"{spec.form_id} engineering integrity boundFile",
    )
    _require_exact_key_order(
        bound_file,
        ("path", "sha256"),
        label=f"{spec.form_id} engineering integrity boundFile",
    )
    if bound_file != {
        "path": candidate_pipeline_path,
        "sha256": candidate_pipeline_sha,
    }:
        raise VerificationError(
            f"{spec.form_id} source-ledger boundFile does not bind the pipeline"
        )
    source_meta_path = root / source_meta_relative
    _require_file(source_meta_path, label=f"{spec.form_id} relocated source ledger")
    source_meta_payload = source_meta_path.read_bytes()
    if (
        _sha256_bytes(source_meta_payload) != candidate_meta_sha
        or len(source_meta_payload) != candidate_meta_size
    ):
        raise VerificationError(f"{spec.form_id} relocated source ledger drift")
    source_meta = _parse_json_bytes(
        source_meta_payload,
        label=f"{spec.form_id} relocated source ledger",
    )
    if (
        source_meta.get("pipelineMetadata") != pipeline_relative
        or source_meta.get("pipelineMetadataSha256") != candidate_pipeline_sha
    ):
        raise VerificationError(
            f"{spec.form_id} source ledger does not bind relocated pipeline metadata"
        )
    isolated_source_meta = _reverse_single_json_string_change(
        source_meta_payload,
        old_value=source_pipeline_sha,
        new_value=candidate_pipeline_sha,
        source_sha256=source_meta_sha,
        source_size=source_meta_size,
        label=f"{spec.form_id} source-ledger integrity update",
    )
    expected_source_meta = dict(source_meta)
    expected_source_meta["pipelineMetadataSha256"] = source_pipeline_sha
    if isolated_source_meta != expected_source_meta:
        raise VerificationError(
            f"{spec.form_id} source-ledger update changed fields beyond its bound hash"
        )

    action_integrity = integrity_by_path["action-bundle-meta.json"]
    _require_exact_keys(
        action_integrity,
        {
            "path",
            "field",
            "from",
            "to",
            "fieldUpdates",
            "sourceMetadataSha256",
            "sourceMetadataSize",
            "candidateMetadataSha256",
            "candidateMetadataSize",
            "boundFile",
        },
        label=f"{spec.form_id} action metadata integrity update",
    )
    _require_exact_key_order(
        action_integrity,
        (
            "path",
            "field",
            "from",
            "to",
            "fieldUpdates",
            "sourceMetadataSha256",
            "sourceMetadataSize",
            "candidateMetadataSha256",
            "candidateMetadataSize",
            "boundFile",
        ),
        label=f"{spec.form_id} action metadata integrity update",
    )
    action_field_updates = action_integrity.get("fieldUpdates")
    if not isinstance(action_field_updates, list) or len(action_field_updates) != 2:
        raise VerificationError(
            f"{spec.form_id} action metadata integrity update must contain "
            "exactly two fieldUpdates"
        )
    replay_update = action_field_updates[1]
    if not isinstance(replay_update, dict):
        raise VerificationError(
            f"{spec.form_id} action metadata replay update must be an object"
        )
    _require_exact_keys(
        replay_update,
        {"field", "digestKind", "from", "to"},
        label=f"{spec.form_id} action metadata replay update",
    )
    _require_exact_key_order(
        replay_update,
        ("field", "digestKind", "from", "to"),
        label=f"{spec.form_id} action metadata replay update",
    )
    source_pipeline_replay_sha = replay_update.get("from")
    candidate_pipeline_replay_sha = replay_update.get("to")
    expected_replay_sha = EXPECTED_PIPELINE_REPLAY_SHA256.get(spec.form_id)
    if (
        expected_replay_sha is None
        or replay_update.get("field")
        != (
            "evidence.identityGateAudit.pipelineMetadata."
            "metadataReplaySha256"
        )
        or replay_update.get("digestKind")
        != "pipeline_metadata_replay_sha256"
        or not isinstance(source_pipeline_replay_sha, str)
        or not SHA256_RE.fullmatch(source_pipeline_replay_sha)
        or not isinstance(candidate_pipeline_replay_sha, str)
        or not SHA256_RE.fullmatch(candidate_pipeline_replay_sha)
        or source_pipeline_replay_sha == candidate_pipeline_replay_sha
        or (
            source_pipeline_replay_sha,
            candidate_pipeline_replay_sha,
        )
        != expected_replay_sha
    ):
        raise VerificationError(
            f"{spec.form_id} action metadata replay update drift"
        )
    # The identity builder's historical replay digest deliberately includes the
    # absolute raw-source path.  Registration freezes that path-bound digest in
    # the manifest and proves the exact two-field action-metadata transform
    # below.  Re-resolving it against the verifier's checkout would make an
    # otherwise identical clean clone fail solely because its directory moved.
    expected_action_field_updates = [
        {
            "field": "evidence.identityGateAudit.pipelineMetadata.sha256",
            "digestKind": "file_sha256",
            "from": source_pipeline_sha,
            "to": candidate_pipeline_sha,
        },
        {
            "field": (
                "evidence.identityGateAudit.pipelineMetadata."
                "metadataReplaySha256"
            ),
            "digestKind": "pipeline_metadata_replay_sha256",
            "from": source_pipeline_replay_sha,
            "to": candidate_pipeline_replay_sha,
        },
    ]
    if (
        action_integrity.get("path") != "action-bundle-meta.json"
        or action_integrity.get("field")
        != "evidence.identityGateAudit.pipelineMetadata.sha256"
        or action_integrity.get("from") != source_pipeline_sha
        or action_integrity.get("to") != candidate_pipeline_sha
        or action_integrity.get("fieldUpdates") != expected_action_field_updates
    ):
        raise VerificationError(
            f"{spec.form_id} action metadata integrity update drift"
        )
    action_source_sha, action_source_size = _require_sha_size(
        action_integrity,
        sha_key="sourceMetadataSha256",
        size_key="sourceMetadataSize",
        label=f"{spec.form_id} action metadata integrity update",
    )
    action_candidate_sha, action_candidate_size = _require_sha_size(
        action_integrity,
        sha_key="candidateMetadataSha256",
        size_key="candidateMetadataSize",
        label=f"{spec.form_id} action metadata integrity update",
    )
    action_relative = "action-bundle-meta.json"
    action_record = copied_map.get(action_relative)
    if action_record != {
        "path": action_relative,
        "sha256": action_candidate_sha,
        "size": action_candidate_size,
    }:
        raise VerificationError(
            f"{spec.form_id} action metadata update does not bind copiedFiles"
        )
    action_bound_file = action_integrity.get("boundFile")
    if not isinstance(action_bound_file, dict):
        raise VerificationError(
            f"{spec.form_id} action metadata boundFile must be an object"
        )
    _require_exact_keys(
        action_bound_file,
        {"path", "sha256"},
        label=f"{spec.form_id} action metadata boundFile",
    )
    _require_exact_key_order(
        action_bound_file,
        ("path", "sha256"),
        label=f"{spec.form_id} action metadata boundFile",
    )
    if action_bound_file != {
        "path": candidate_pipeline_path,
        "sha256": candidate_pipeline_sha,
    }:
        raise VerificationError(
            f"{spec.form_id} action metadata boundFile does not bind the pipeline"
        )
    action_path = root / action_relative
    _require_file(action_path, label=f"{spec.form_id} relocated action metadata")
    action_payload = action_path.read_bytes()
    if (
        _sha256_bytes(action_payload) != action_candidate_sha
        or len(action_payload) != action_candidate_size
    ):
        raise VerificationError(f"{spec.form_id} relocated action metadata drift")
    action = _parse_json_bytes(
        action_payload,
        label=f"{spec.form_id} relocated action metadata",
    )
    pipeline_evidence = _json_value_at(
        action,
        ("evidence", "identityGateAudit", "pipelineMetadata"),
    )
    if not isinstance(pipeline_evidence, dict) or (
        pipeline_evidence.get("sha256") != candidate_pipeline_sha
        or pipeline_evidence.get("metadataReplaySha256")
        != candidate_pipeline_replay_sha
    ):
        raise VerificationError(
            f"{spec.form_id} action metadata does not bind the relocated pipeline"
        )
    _reverse_json_string_changes(
        action_payload,
        field_updates=expected_action_field_updates,
        source_sha256=action_source_sha,
        source_size=action_source_size,
        label=f"{spec.form_id} action metadata integrity update",
    )

    return {
        pipeline_relative: {
            "path": pipeline_relative,
            "sha256": source_pipeline_sha,
            "size": source_pipeline_size,
        },
        source_meta_relative: {
            "path": source_meta_relative,
            "sha256": source_meta_sha,
            "size": source_meta_size,
        },
        action_relative: {
            "path": action_relative,
            "sha256": action_source_sha,
            "size": action_source_size,
        },
    }


def _is_portrait_path(relative: str) -> bool:
    if relative == QA_IMPORT_ISOLATION_CONTROL_PATH:
        return False
    return (
        relative.startswith("portrait/")
        or relative.startswith("source/portrait/")
        or relative.startswith("qa/portrait/")
        or relative == "prompts/portrait-v1.txt"
    )


def _validate_qa_import_isolation_control(
    root: Path,
    spec: FormSpec,
) -> dict[str, Any]:
    path = root / QA_IMPORT_ISOLATION_CONTROL_PATH
    _require_file(
        path,
        label=f"{spec.form_id} portrait QA import isolation control",
    )
    payload = path.read_bytes()
    actual_sha256 = _sha256_bytes(payload)
    if (
        payload != QA_IMPORT_ISOLATION_CONTROL_BYTES
        or len(payload) != QA_IMPORT_ISOLATION_CONTROL_SIZE
        or actual_sha256 != QA_IMPORT_ISOLATION_CONTROL_SHA256
    ):
        raise VerificationError(
            f"{spec.form_id} portrait QA import isolation control drift: "
            f"expectedSize={QA_IMPORT_ISOLATION_CONTROL_SIZE} "
            f"actualSize={len(payload)} "
            f"expectedSha256={QA_IMPORT_ISOLATION_CONTROL_SHA256} "
            f"actualSha256={actual_sha256}"
        )
    return {
        "path": QA_IMPORT_ISOLATION_CONTROL_PATH,
        "sha256": actual_sha256,
        "size": len(payload),
    }


def _validate_manifest(
    repo_root: Path,
    spec: FormSpec,
    owner_decision_record: Mapping[str, Any],
) -> tuple[dict[str, Any], int, bool, dict[str, Any]]:
    root = _repo_path(repo_root, spec.root_relative, label=f"{spec.form_id} root")
    _require_directory(root, label=f"{spec.form_id} production root")
    manifest_path = _repo_path(
        repo_root,
        spec.manifest_relative,
        label=f"{spec.form_id} registration manifest path",
    )
    _require_file(manifest_path, label=f"{spec.form_id} registration manifest")
    manifest_sha = _sha256_file(manifest_path)
    manifest = _read_json(
        manifest_path,
        label=f"{spec.form_id} registration manifest",
    )
    _require_exact_keys(
        manifest,
        {
            "schemaVersion",
            "manifestType",
            "tool",
            "formId",
            "displayName",
            "sourceRoot",
            "destinationRoot",
            "lifecycle",
            "frozenOwnerApproval",
            "validatedMatrices",
            "portrait",
            "sourceSnapshotSha256",
            "isolatedSourceSnapshotSha256",
            "copiedFiles",
            "ownerApprovedVisualFiles",
            "engineeringSupportFiles",
            "engineeringRelocations",
            "engineeringIntegrityUpdates",
        },
        label=f"{spec.form_id} registration manifest",
    )
    _require_exact_key_order(
        manifest,
        (
            "schemaVersion",
            "manifestType",
            "tool",
            "formId",
            "displayName",
            "sourceRoot",
            "destinationRoot",
            "lifecycle",
            "frozenOwnerApproval",
            "validatedMatrices",
            "portrait",
            "sourceSnapshotSha256",
            "copiedFiles",
            "ownerApprovedVisualFiles",
            "engineeringSupportFiles",
            "engineeringRelocations",
            "engineeringIntegrityUpdates",
            "isolatedSourceSnapshotSha256",
        ),
        label=f"{spec.form_id} registration manifest",
    )
    scalar_expected = {
        "schemaVersion": 1,
        "manifestType": "fusion_pet_closed_asset_copy_registration",
        "tool": "register_fusion_pet_closed_assets.py",
        "formId": spec.form_id,
        "displayName": spec.display_name,
        "sourceRoot": f".run/p1_4e_fusion_full_pack/{spec.source_slug}/pet-root",
        "destinationRoot": spec.root_relative.as_posix(),
    }
    for key, expected in scalar_expected.items():
        if manifest.get(key) != expected:
            raise VerificationError(
                f"{spec.form_id} manifest {key} drift: "
                f"expected={expected!r} actual={manifest.get(key)!r}"
            )
    if manifest.get("lifecycle") != _expected_manifest_lifecycle():
        raise VerificationError(
            f"{spec.form_id} manifest lifecycle is not the frozen closed registration"
        )
    _require_exact_key_order(
        manifest["lifecycle"],
        tuple(_expected_manifest_lifecycle()),
        label=f"{spec.form_id} manifest lifecycle",
    )
    frozen_owner = manifest.get("frozenOwnerApproval")
    expected_frozen_owner = {
        "ownerDecision": {
            "path": owner_decision_record["path"],
            "sha256": owner_decision_record["sha256"],
        },
        "ownerReviewVideo": {
            "path": OWNER_REVIEW_VIDEO_RELATIVE,
            "sha256": OWNER_REVIEW_VIDEO_SHA256,
            "playbackSpeed": "1.00x",
        },
        "scope": list(OWNER_APPROVED_SCOPES),
        "excludedScope": list(OWNER_EXCLUDED_SCOPES),
        "phase371BattleBundleDigest": spec.battle_bundle_digest,
    }
    if frozen_owner != expected_frozen_owner:
        raise VerificationError(
            f"{spec.form_id} manifest frozen owner approval binding drift"
        )
    _require_exact_key_order(
        frozen_owner,
        (
            "ownerDecision",
            "ownerReviewVideo",
            "scope",
            "excludedScope",
            "phase371BattleBundleDigest",
        ),
        label=f"{spec.form_id} manifest frozenOwnerApproval",
    )
    _require_exact_key_order(
        frozen_owner["ownerDecision"],
        ("path", "sha256"),
        label=f"{spec.form_id} manifest frozen owner decision",
    )
    _require_exact_key_order(
        frozen_owner["ownerReviewVideo"],
        ("path", "sha256", "playbackSpeed"),
        label=f"{spec.form_id} manifest frozen owner video",
    )
    expected_matrices = {
        "identityVisualFiles": 5,
        "worldRuntimeFrames": 40,
        "worldSourceFrames": 40,
        "battleRuntimeFrames": 180,
        "battleSourceFrames": 180,
        "mountedFiles": 0,
    }
    if manifest.get("validatedMatrices") != expected_matrices:
        raise VerificationError(f"{spec.form_id} manifest matrix proof drift")
    _require_exact_key_order(
        manifest["validatedMatrices"],
        tuple(expected_matrices),
        label=f"{spec.form_id} manifest validatedMatrices",
    )
    portrait = manifest.get("portrait")
    if not isinstance(portrait, dict):
        raise VerificationError(f"{spec.form_id} manifest portrait record is missing")
    _require_exact_keys(
        portrait,
        {"status", "builder", "copied", "excludedFiles"},
        label=f"{spec.form_id} manifest portrait",
    )
    _require_exact_key_order(
        portrait,
        ("status", "builder", "copied", "excludedFiles"),
        label=f"{spec.form_id} manifest portrait",
    )
    if (
        portrait.get("status") != "pending_formal_rebuild_and_owner_review"
        or portrait.get("builder") != "build_pet_portrait"
        or portrait.get("copied") is not False
    ):
        raise VerificationError(
            f"{spec.form_id} manifest must keep the original portrait excluded/pending"
        )

    copied = _validate_record_list(
        manifest.get("copiedFiles"),
        label=f"{spec.form_id} manifest copiedFiles",
    )
    owner_visual = _validate_record_list(
        manifest.get("ownerApprovedVisualFiles"),
        label=f"{spec.form_id} manifest ownerApprovedVisualFiles",
    )
    engineering = _validate_record_list(
        manifest.get("engineeringSupportFiles"),
        label=f"{spec.form_id} manifest engineeringSupportFiles",
    )
    excluded = _validate_record_list(
        portrait.get("excludedFiles"),
        label=f"{spec.form_id} manifest portrait.excludedFiles",
    )
    counts = (
        (len(copied), EXPECTED_COPIED_FILE_COUNT, "copiedFiles"),
        (
            len(owner_visual),
            EXPECTED_OWNER_APPROVED_VISUAL_FILE_COUNT,
            "ownerApprovedVisualFiles",
        ),
        (
            len(engineering),
            EXPECTED_ENGINEERING_SUPPORT_FILE_COUNT,
            "engineeringSupportFiles",
        ),
        (
            len(excluded),
            EXPECTED_EXCLUDED_PORTRAIT_FILE_COUNT,
            "portrait.excludedFiles",
        ),
    )
    for actual, expected, label in counts:
        if actual != expected:
            raise VerificationError(
                f"{spec.form_id} manifest {label} count drift: "
                f"expected={expected} actual={actual}"
            )
    copied_map = _record_map(copied)
    owner_map = _record_map(owner_visual)
    engineering_map = _record_map(engineering)
    if set(owner_map) & set(engineering_map):
        raise VerificationError(
            f"{spec.form_id} owner/engineering manifest partitions overlap"
        )
    if copied_map != {**owner_map, **engineering_map}:
        raise VerificationError(
            f"{spec.form_id} owner/engineering records do not exactly partition copiedFiles"
        )
    if set(owner_map) != set(EXPECTED_OWNER_VISUAL_PATHS):
        raise VerificationError(
            f"{spec.form_id} ownerApprovedVisualFiles path set drift: "
            f"missing={sorted(set(EXPECTED_OWNER_VISUAL_PATHS) - set(owner_map))} "
            f"extra={sorted(set(owner_map) - set(EXPECTED_OWNER_VISUAL_PATHS))}"
        )
    if set(engineering_map) != set(EXPECTED_ENGINEERING_SUPPORT_PATHS):
        raise VerificationError(
            f"{spec.form_id} engineeringSupportFiles path set drift: "
            f"missing={sorted(set(EXPECTED_ENGINEERING_SUPPORT_PATHS) - set(engineering_map))} "
            f"extra={sorted(set(engineering_map) - set(EXPECTED_ENGINEERING_SUPPORT_PATHS))}"
        )
    if any(_is_portrait_path(record["path"]) for record in copied):
        raise VerificationError(
            f"{spec.form_id} closed registration copied a portrait artifact"
        )
    if any(not _is_portrait_path(record["path"]) for record in excluded):
        raise VerificationError(
            f"{spec.form_id} manifest excludedFiles contains a non-portrait path"
        )
    if {record["path"] for record in excluded} != set(
        EXPECTED_EXCLUDED_PORTRAIT_PATHS
    ):
        raise VerificationError(
            f"{spec.form_id} manifest portrait.excludedFiles path set drift"
        )
    candidate_snapshot = _sha256_bytes(_json_bytes([*copied, *excluded]))
    if manifest.get("sourceSnapshotSha256") != candidate_snapshot:
        raise VerificationError(
            f"{spec.form_id} manifest sourceSnapshotSha256 does not replay"
        )
    isolated_records_by_path = _validate_engineering_transformations(
        repo_root,
        root,
        spec,
        manifest,
        copied_map,
    )
    isolated_copied = [
        isolated_records_by_path.get(record["path"], record)
        for record in copied
    ]
    isolated_snapshot = _sha256_bytes(
        _json_bytes([*isolated_copied, *excluded])
    )
    if manifest.get("isolatedSourceSnapshotSha256") != isolated_snapshot:
        raise VerificationError(
            f"{spec.form_id} manifest isolatedSourceSnapshotSha256 does not replay"
        )
    _verify_records_on_disk(
        root,
        copied,
        label=f"{spec.form_id} copiedFiles",
    )
    for record in copied:
        if PurePosixPath(record["path"]).suffix.lower() != ".json":
            continue
        copied_json = _read_json(
            root / record["path"],
            label=f"{spec.form_id} copied JSON {record['path']}",
        )
        _reject_open_release_state(
            copied_json,
            label=f"{spec.form_id}:{record['path']}",
        )
        _reject_mounted_contract(
            copied_json,
            label=f"{spec.form_id}:{record['path']}",
        )
    _validate_action_metadata(root, spec)
    qa_import_isolation_control = _validate_qa_import_isolation_control(
        root,
        spec,
    )
    actual_records = _scan_files(root, label=f"{spec.form_id} production root")
    actual_paths = {record["path"] for record in actual_records}
    base_paths = {*copied_map, MANIFEST_RELATIVE.as_posix()}
    expected_paths = (
        base_paths
        | set(PORTRAIT_FILE_PATHS)
        | {QA_IMPORT_ISOLATION_CONTROL_PATH}
    )
    if actual_paths != expected_paths:
        raise VerificationError(
            f"{spec.form_id} production root inventory drift: "
            f"missing={sorted(expected_paths - actual_paths)} "
            f"extra={sorted(actual_paths - expected_paths)}"
        )
    if any("mounted" in PurePosixPath(path).parts for path in actual_paths):
        raise VerificationError(f"{spec.form_id} production root contains mounted art")
    tracking_verified = _validate_git_index_inventory(
        repo_root,
        spec.root_relative,
        expected_paths,
    )
    return (
        {
            "path": spec.manifest_relative.as_posix(),
            "sha256": manifest_sha,
            "sourceSnapshotSha256": manifest["sourceSnapshotSha256"],
            "isolatedSourceSnapshotSha256": manifest[
                "isolatedSourceSnapshotSha256"
            ],
            "engineeringRelocationsVerified": len(
                manifest["engineeringRelocations"]
            ),
            "engineeringIntegrityUpdatesVerified": len(
                manifest["engineeringIntegrityUpdates"]
            ),
            "pipelineMetadataSha256": manifest[
                "engineeringRelocations"
            ][0]["candidateMetadataSha256"],
            "sourceMetadataSha256": next(
                item["candidateMetadataSha256"]
                for item in manifest["engineeringIntegrityUpdates"]
                if item["path"]
                == "source/identity-board-source-meta.json"
            ),
            "actionMetadataSha256": next(
                item["candidateMetadataSha256"]
                for item in manifest["engineeringIntegrityUpdates"]
                if item["path"] == "action-bundle-meta.json"
            ),
            "engineeringTransformCount": (
                len(manifest["engineeringRelocations"])
                + len(manifest["engineeringIntegrityUpdates"])
            ),
        },
        len(copied),
        tracking_verified,
        {
            **qa_import_isolation_control,
            "gitTracked": tracking_verified,
        },
    )


def _validate_asset_reference(
    repo_root: Path,
    value: Any,
    *,
    expected_path: str,
    label: str,
) -> None:
    if not isinstance(value, dict):
        raise VerificationError(f"{label} must be an object")
    if value.get("path") != expected_path:
        raise VerificationError(
            f"{label}.path drift: expected={expected_path!r} "
            f"actual={value.get('path')!r}"
        )
    sha256 = value.get("sha256")
    if not isinstance(sha256, str) or not SHA256_RE.fullmatch(sha256):
        raise VerificationError(f"{label}.sha256 is invalid")
    path = _repo_path(repo_root, expected_path, label=f"{label}.path")
    _require_file(path, label=label)
    if _sha256_file(path) != sha256:
        raise VerificationError(f"{label} SHA does not match current file")


def _validate_direct_portrait_references(
    *,
    repo_root: Path,
    spec: FormSpec,
    referenced_images: list[Any],
    identity: Mapping[str, Any],
) -> None:
    auxiliary_records = PORTRAIT_DIRECT_AUXILIARY_REFERENCE_RECORDS.get(
        spec.form_id
    )
    if auxiliary_records is None:
        raise VerificationError(
            f"{spec.form_id} portrait direct identity provenance is not frozen"
        )
    identity_path = _repo_path(
        repo_root,
        identity["path"],
        label=f"{spec.form_id} portrait direct identity path",
    )
    _require_file(
        identity_path,
        label=f"{spec.form_id} portrait direct identity reference",
    )
    if (
        _sha256_file(identity_path) != identity["sha256"]
        or identity_path.stat().st_size != identity["size"]
    ):
        raise VerificationError(
            f"{spec.form_id} portrait direct identity bytes drift"
        )
    expected_reference_count = len(auxiliary_records) + 1
    auxiliary_indexes = [record.get("index") for record in auxiliary_records]
    if (
        any(
            not isinstance(index, int)
            or isinstance(index, bool)
            or not 0 <= index < expected_reference_count
            for index in auxiliary_indexes
        )
        or len(set(auxiliary_indexes)) != len(auxiliary_indexes)
    ):
        raise VerificationError(
            f"{spec.form_id} portrait auxiliary reference indexes are invalid"
        )
    identity_indexes = sorted(
        set(range(expected_reference_count)) - set(auxiliary_indexes)
    )
    if len(identity_indexes) != 1:
        raise VerificationError(
            f"{spec.form_id} portrait direct identity index is ambiguous"
        )
    direct_reference = {
        "index": identity_indexes[0],
        "pathLabel": f"repository:{identity['path']}",
        "role": "declared_identity_reference",
        "matchesDeclaredIdentityReference": True,
        "currentFileSha256": identity["sha256"],
        "currentFileByteLength": identity["size"],
        "currentFileWidth": 512,
        "currentFileHeight": 512,
        "currentFileFormat": "PNG",
        "currentFileMode": "RGBA",
        "historicalRequestBytesVerified": False,
    }
    expected_referenced_images = sorted(
        [*auxiliary_records, direct_reference],
        key=lambda record: record["index"],
    )
    reference_key_order = (
        "index",
        "pathLabel",
        "role",
        "matchesDeclaredIdentityReference",
        "currentFileSha256",
        "currentFileByteLength",
        "currentFileWidth",
        "currentFileHeight",
        "currentFileFormat",
        "currentFileMode",
        "historicalRequestBytesVerified",
    )
    if len(referenced_images) != len(expected_referenced_images):
        raise VerificationError(
            f"{spec.form_id} portrait referencedImages provenance drift"
        )
    for index, reference in enumerate(referenced_images):
        if not isinstance(reference, dict):
            raise VerificationError(
                f"{spec.form_id} portrait referencedImages[{index}] must be an object"
            )
        _require_exact_key_order(
            reference,
            reference_key_order,
            label=f"{spec.form_id} portrait referencedImages[{index}]",
        )
    if referenced_images != expected_referenced_images:
        raise VerificationError(
            f"{spec.form_id} portrait referencedImages provenance drift"
        )


def _validate_portrait_identity_lineage(
    repo_root: Path,
    spec: FormSpec,
    metadata: Mapping[str, Any],
    generation_attestation: Mapping[str, Any],
    registration_manifest: Mapping[str, Any],
) -> None:
    root = spec.root_relative.as_posix()

    def current(relative: str) -> dict[str, Any]:
        repository_relative = f"{root}/{relative}"
        path = _repo_path(
            repo_root,
            repository_relative,
            label=f"{spec.form_id} portrait identity lineage path",
        )
        _require_file(path, label=f"{spec.form_id} portrait identity lineage file")
        return {
            "path": repository_relative,
            "sha256": _sha256_file(path),
            "size": path.stat().st_size,
        }

    identity = current("identity/front_3quarter_sw.png")
    action_metadata = current("action-bundle-meta.json")
    identity_lock = current("identity/identity-lock.md")
    pipeline_metadata = current("source/identity-board-pipeline-meta.json")
    ownership = current("identity/source-and-ownership.md")
    prompt = current("prompts/identity.txt")
    _validate_asset_reference(
        repo_root,
        metadata.get("identityReference"),
        expected_path=identity["path"],
        label=f"{spec.form_id} portrait identityReference",
    )
    if (
        generation_attestation.get("identityReferencePath") != identity["path"]
        or generation_attestation.get("identityReferenceSha256")
        != identity["sha256"]
    ):
        raise VerificationError(
            f"{spec.form_id} generation attestation identity reference drift"
        )
    identity_evidence = generation_attestation.get("identityEvidence")
    if not isinstance(identity_evidence, dict):
        raise VerificationError(
            f"{spec.form_id} generation attestation identityEvidence is missing"
        )
    expected_identity_values = {
        "contract": "pet_identity_bundle_binding_v1",
        "bindingMode": "metadata_pose",
        "formId": spec.form_id,
        "bundleMetadataPath": action_metadata["path"],
        "bundleMetadataSha256": action_metadata["sha256"],
        "identityLockPath": identity_lock["path"],
        "identityLockSha256": identity_lock["sha256"],
        "identityStatus": "self_review_passed_owner_pending",
        "referenceRole": "front_3quarter_sw",
        "referencePath": identity["path"],
        "referenceSha256": identity["sha256"],
        "pipelineMetadataPath": pipeline_metadata["path"],
        "pipelineMetadataSha256": pipeline_metadata["sha256"],
        "pipelinePixelHashVerified": True,
        "currentReferencePixelBindingVerified": True,
        "compatibilityLedger": None,
    }
    for key, expected in expected_identity_values.items():
        if identity_evidence.get(key) != expected:
            raise VerificationError(
                f"{spec.form_id} portrait identityEvidence.{key} drift"
            )
    catalog_evidence = identity_evidence.get("catalogEvidence")
    if not isinstance(catalog_evidence, dict):
        raise VerificationError(
            f"{spec.form_id} portrait identity catalogEvidence is missing"
        )
    expected_catalog_evidence = {
        "path": ART_CATALOG_RELATIVE.as_posix(),
        "ownershipPath": ownership["path"],
        "ownershipSha256": ownership["sha256"],
        "promptPath": prompt["path"],
        "promptSha256": prompt["sha256"],
    }
    for key, expected in expected_catalog_evidence.items():
        if catalog_evidence.get(key) != expected:
            raise VerificationError(
                f"{spec.form_id} portrait catalogEvidence.{key} drift"
            )
    form_slice_sha = catalog_evidence.get("formIdentitySliceSha256")
    expected_form_slice_sha = _canonical_json_sha256(_expected_art_form(spec))
    if form_slice_sha != expected_form_slice_sha:
        raise VerificationError(
            f"{spec.form_id} portrait form identity slice hash drift"
        )

    generation_result = generation_attestation.get("generationResultEvidence")
    transcript = (
        generation_result.get("transcriptEvidence")
        if isinstance(generation_result, dict)
        else None
    )
    request_binding = (
        transcript.get("requestArgumentBinding")
        if isinstance(transcript, dict)
        else None
    )
    if not isinstance(request_binding, dict):
        raise VerificationError(
            f"{spec.form_id} portrait requestArgumentBinding is missing"
        )
    request_expected = {
        "requestArgumentBindingVerified": True,
        "declaredIdentityReferenceIncluded": True,
        "automaticApprovalEligible": False,
        "currentReferencedImageContentBound": True,
        "historicalReferencedImageBytesVerified": False,
    }
    for key, expected in request_expected.items():
        if request_binding.get(key) != expected:
            raise VerificationError(
                f"{spec.form_id} portrait requestArgumentBinding.{key} drift"
            )
    relocation = {
        "contract": "fusion_pet_formal_identity_relocation_v1",
        "formId": spec.form_id,
        "manifestPath": spec.manifest_relative.as_posix(),
        "manifestSha256": registration_manifest["sha256"],
        "sourceRoot": (
            f".run/p1_4e_fusion_full_pack/{spec.source_slug}/pet-root"
        ),
        "destinationRoot": root,
        "identityRelativePath": "identity/front_3quarter_sw.png",
        "identitySha256": identity["sha256"],
        "identityByteLength": identity["size"],
        "ownerDecisionPath": OWNER_DECISION_RELATIVE.as_posix(),
        "ownerDecisionSha256": OWNER_DECISION_SHA256,
        "pipelineMetadataSha256": registration_manifest[
            "pipelineMetadataSha256"
        ],
        "sourceMetadataSha256": registration_manifest[
            "sourceMetadataSha256"
        ],
        "actionMetadataSha256": registration_manifest[
            "actionMetadataSha256"
        ],
        "sourceSnapshotSha256": registration_manifest[
            "sourceSnapshotSha256"
        ],
        "isolatedSourceSnapshotSha256": registration_manifest[
            "isolatedSourceSnapshotSha256"
        ],
        "engineeringTransformCount": registration_manifest[
            "engineeringTransformCount"
        ],
        "runtimeEnabled": False,
        "playerEntryOpened": False,
        "portraitOwnerApprovalExcluded": True,
    }
    relocation_key_order = (
        "contract",
        "formId",
        "manifestPath",
        "manifestSha256",
        "sourceRoot",
        "destinationRoot",
        "identityRelativePath",
        "identitySha256",
        "identityByteLength",
        "ownerDecisionPath",
        "ownerDecisionSha256",
        "pipelineMetadataSha256",
        "sourceMetadataSha256",
        "actionMetadataSha256",
        "sourceSnapshotSha256",
        "isolatedSourceSnapshotSha256",
        "engineeringTransformCount",
        "runtimeEnabled",
        "playerEntryOpened",
        "portraitOwnerApprovalExcluded",
    )
    identity_lineage = request_binding.get("identityLineage")
    if not isinstance(identity_lineage, dict):
        raise VerificationError(
            f"{spec.form_id} portrait identityLineage is missing"
        )
    referenced_images = request_binding.get("referencedImages")
    if not isinstance(referenced_images, list):
        raise VerificationError(
            f"{spec.form_id} portrait referencedImages is missing"
        )
    lineage_mode = identity_lineage.get("mode")
    if lineage_mode == "relocated_direct_declared_identity_reference":
        lineage_expected = {
            "contract": "imagegen_request_identity_lineage_v1",
            "verified": True,
            "mode": "relocated_direct_declared_identity_reference",
            "predecessors": [],
            "formalRelocations": [relocation],
        }
        if identity_lineage != lineage_expected:
            raise VerificationError(
                f"{spec.form_id} portrait identityLineage.formalRelocations drift"
            )
        formal_relocations = identity_lineage.get("formalRelocations")
        assert isinstance(formal_relocations, list)
        _require_exact_key_order(
            formal_relocations[0],
            relocation_key_order,
            label=(
                f"{spec.form_id} portrait identityLineage formal relocation"
            ),
        )
        primary_reference = {
            "index": 0,
            "pathLabel": (
                "repository:.run/p1_4e_fusion_full_pack/"
                f"{spec.source_slug}/pet-root/identity/front_3quarter_sw.png"
            ),
            "role": "relocated_declared_identity_reference",
            "matchesDeclaredIdentityReference": False,
            "currentFileSha256": identity["sha256"],
            "currentFileByteLength": identity["size"],
            "currentFileWidth": 512,
            "currentFileHeight": 512,
            "currentFileFormat": "PNG",
            "currentFileMode": "RGBA",
            "historicalRequestBytesVerified": False,
            "formalIdentityRelocation": relocation,
        }
        expected_referenced_images = [
            primary_reference,
            *PORTRAIT_AUXILIARY_REFERENCE_RECORDS[spec.form_id],
        ]
        if referenced_images != expected_referenced_images:
            raise VerificationError(
                f"{spec.form_id} portrait referencedImages provenance drift"
            )
        actual_reference_relocation = referenced_images[0].get(
            "formalIdentityRelocation"
        )
        if not isinstance(actual_reference_relocation, dict):
            raise VerificationError(
                f"{spec.form_id} portrait primary reference relocation is missing"
            )
        _require_exact_key_order(
            actual_reference_relocation,
            relocation_key_order,
            label=(
                f"{spec.form_id} portrait referenced-image formal relocation"
            ),
        )
    elif lineage_mode == "direct_declared_identity_reference":
        _require_exact_keys(
            identity_lineage,
            {"contract", "verified", "mode", "predecessors"},
            label=f"{spec.form_id} portrait direct identityLineage",
        )
        _require_exact_key_order(
            identity_lineage,
            ("contract", "verified", "mode", "predecessors"),
            label=f"{spec.form_id} portrait direct identityLineage",
        )
        expected_lineage = {
            "contract": "imagegen_request_identity_lineage_v1",
            "verified": True,
            "mode": "direct_declared_identity_reference",
            "predecessors": [],
        }
        if identity_lineage != expected_lineage:
            raise VerificationError(
                f"{spec.form_id} portrait direct identityLineage drift"
            )
        _validate_direct_portrait_references(
            repo_root=repo_root,
            spec=spec,
            referenced_images=referenced_images,
            identity=identity,
        )
    else:
        raise VerificationError(
            f"{spec.form_id} portrait identityLineage.mode is unsupported"
        )


def _validate_portrait(
    repo_root: Path,
    spec: FormSpec,
    registration_manifest: Mapping[str, Any],
) -> dict[str, Any]:
    root = _repo_path(repo_root, spec.root_relative, label=f"{spec.form_id} root")
    metadata_relative = spec.root_relative / "portrait/portrait-meta.json"
    metadata_path = _repo_path(
        repo_root,
        metadata_relative,
        label=f"{spec.form_id} portrait metadata path",
    )
    _require_file(metadata_path, label=f"{spec.form_id} portrait metadata")
    metadata = _read_json(metadata_path, label=f"{spec.form_id} portrait metadata")
    _reject_open_release_state(
        metadata,
        label=f"{spec.form_id} portrait metadata",
    )
    _reject_mounted_contract(
        metadata,
        label=f"{spec.form_id} portrait metadata",
    )
    required_values = {
        "schemaVersion": 1,
        "tool": "build_pet_portrait.py",
        "formId": spec.form_id,
        "capability": "shared_dedicated_headshot_v1",
        "independentlyAuthoredClaim": True,
        "independentAuthorshipClaimTrust": "untrusted_claim",
        "semanticIndependenceVerified": False,
        "fullBodyCropAllowed": False,
        "releaseGate": False,
    }
    for key, expected in required_values.items():
        if metadata.get(key) != expected:
            raise VerificationError(
                f"{spec.form_id} portrait {key} must remain {expected!r}, "
                f"got {metadata.get(key)!r}"
            )
    owner_review = metadata.get("ownerReview")
    if owner_review != {
        "required": True,
        "status": "owner_review_pending",
        "evidencePaths": [],
    }:
        raise VerificationError(
            f"{spec.form_id} portrait must remain owner_review_pending with no decision"
        )
    expected_binding = {
        "mode": "pet_art_catalog_explicit",
        "catalogPath": ART_CATALOG_RELATIVE.as_posix(),
        "petRoot": spec.root_relative.as_posix(),
    }
    if metadata.get("catalogBinding") != expected_binding:
        raise VerificationError(f"{spec.form_id} portrait catalog binding drift")
    if not isinstance(metadata.get("claimLimit"), str) or not metadata["claimLimit"]:
        raise VerificationError(f"{spec.form_id} portrait claimLimit is missing")

    asset_paths = {
        "originalGeneratedPng": (
            spec.root_relative / "source/portrait/headshot-original-generated.png"
        ).as_posix(),
        "rawLossless": (
            spec.root_relative / "source/portrait/headshot-raw-lossless.webp"
        ).as_posix(),
        "master": (
            spec.root_relative / "source/portrait/headshot-master-1024.png"
        ).as_posix(),
        "runtime": (spec.root_relative / "portrait/default.png").as_posix(),
        "eligibilityMask": (
            spec.root_relative
            / "source/portrait/headshot-chroma-eligibility-mask.png"
        ).as_posix(),
        "alphaMask": (
            spec.root_relative / "source/portrait/headshot-alpha-mask.png"
        ).as_posix(),
    }
    assets = metadata.get("assets")
    if not isinstance(assets, dict):
        raise VerificationError(f"{spec.form_id} portrait assets record is missing")
    for key, expected_path in asset_paths.items():
        _validate_asset_reference(
            repo_root,
            assets.get(key),
            expected_path=expected_path,
            label=f"{spec.form_id} portrait assets.{key}",
        )
    _validate_asset_reference(
        repo_root,
        metadata.get("ownership"),
        expected_path=(
            spec.root_relative / "portrait/source-and-ownership.md"
        ).as_posix(),
        label=f"{spec.form_id} portrait ownership",
    )
    _validate_asset_reference(
        repo_root,
        metadata.get("prompt"),
        expected_path=(
            spec.root_relative / "prompts/portrait-v1.txt"
        ).as_posix(),
        label=f"{spec.form_id} portrait prompt",
    )
    evidence = metadata.get("evidence")
    contact_sheet = (
        evidence.get("contactSheet")
        if isinstance(evidence, dict)
        else None
    )
    _validate_asset_reference(
        repo_root,
        contact_sheet,
        expected_path=(
            spec.root_relative / "qa/portrait/contact-sheet.png"
        ).as_posix(),
        label=f"{spec.form_id} portrait contact sheet",
    )
    source = metadata.get("source")
    if not isinstance(source, dict):
        raise VerificationError(f"{spec.form_id} portrait source record is missing")
    generation_attestation_path = (
        spec.root_relative / "source/portrait/generation-attestation.json"
    ).as_posix()
    _validate_asset_reference(
        repo_root,
        source.get("generationAttestation"),
        expected_path=generation_attestation_path,
        label=f"{spec.form_id} portrait generation attestation",
    )
    generation_attestation = _read_json(
        _repo_path(
            repo_root,
            generation_attestation_path,
            label=f"{spec.form_id} generation attestation path",
        ),
        label=f"{spec.form_id} generation attestation",
    )
    _reject_open_release_state(
        generation_attestation,
        label=f"{spec.form_id} generation attestation",
    )
    _reject_mounted_contract(
        generation_attestation,
        label=f"{spec.form_id} generation attestation",
    )
    generation_expected = {
        "semanticIndependenceVerified": False,
        "ownerReviewStatus": "owner_review_pending",
        "fullBodyCropAllowed": False,
        "releaseGate": False,
    }
    for key, expected in generation_expected.items():
        if generation_attestation.get(key) != expected:
            raise VerificationError(
                f"{spec.form_id} generation attestation {key} must remain "
                f"{expected!r}"
            )
    _validate_portrait_identity_lineage(
        repo_root,
        spec,
        metadata,
        generation_attestation,
        registration_manifest,
    )
    owner_decision_path = root / "portrait/owner-decision.json"
    if owner_decision_path.exists() or owner_decision_path.is_symlink():
        raise VerificationError(
            f"{spec.form_id} portrait may not contain an owner decision while pending"
        )
    actual_records = _scan_files(root, label=f"{spec.form_id} production root")
    portrait_records = [
        record for record in actual_records if _is_portrait_path(record["path"])
    ]
    if [record["path"] for record in portrait_records] != list(PORTRAIT_FILE_PATHS):
        raise VerificationError(
            f"{spec.form_id} portrait inventory must be the exact formal 11-file set"
        )
    return {
        "present": True,
        "status": "owner_review_pending",
        "metadataPath": metadata_relative.as_posix(),
        "metadataSha256": _sha256_file(metadata_path),
        "ownerReviewStatus": "owner_review_pending",
        "semanticIndependenceVerified": False,
        "releaseGate": False,
        "files": portrait_records,
    }


def verify_closed_state(repo_root: Path) -> dict[str, Any]:
    """Replay both tracked manifests and return a closed-state machine report."""

    repo_root = repo_root.resolve()
    _require_directory(repo_root, label="repository root")
    authority_tracking_verified = _validate_git_index_authorities(
        repo_root,
        (
            OWNER_DECISION_RELATIVE,
            PHASE_RECORD_RELATIVE,
            ART_CATALOG_RELATIVE,
            FUSION_CATALOG_RELATIVE,
        ),
    )
    owner_decision = _validate_owner_decision(repo_root)
    art_catalog = _validate_art_catalog(repo_root)
    fusion_catalog = _validate_fusion_catalog(repo_root)
    forms: list[dict[str, Any]] = []
    copied_count = 0
    portrait_count = 0
    for spec in FORM_SPECS:
        (
            manifest,
            copied,
            tracking_verified,
            qa_import_isolation_control,
        ) = _validate_manifest(
            repo_root,
            spec,
            owner_decision,
        )
        portrait = _validate_portrait(
            repo_root,
            spec,
            manifest,
        )
        copied_count += copied
        portrait_count += len(portrait["files"])
        forms.append(
            {
                "formId": spec.form_id,
                "displayName": spec.display_name,
                "recipeId": spec.recipe_id,
                "productionRoot": spec.root_relative.as_posix(),
                "registrationManifest": manifest,
                "copiedFilesVerified": copied,
                "gitIndexInventoryVerified": tracking_verified,
                "qaImportIsolationControl": qa_import_isolation_control,
                "portrait": portrait,
            }
        )
    return {
        "schemaVersion": 1,
        "reportType": "beastbound_pet_fusion_closed_registration_verification",
        "tool": TOOL_NAME,
        "status": "PASS",
        "closedRegistrationVerified": True,
        "claimLimit": REPORT_CLAIM_LIMIT,
        "releaseApproved": False,
        "runtimeEnabled": False,
        "playerEntryOpened": False,
        "portraitReleaseGate": False,
        "gitIndexAuthorityVerified": authority_tracking_verified,
        "ownerDecision": owner_decision,
        "catalogs": {
            "petArt": art_catalog,
            "fusionRecipes": fusion_catalog,
        },
        "forms": forms,
        "summary": {
            "formsVerified": len(forms),
            "copiedFilesVerified": copied_count,
            "portraitFilesVerified": portrait_count,
            "qaImportIsolationControlsVerified": len(forms),
        },
    }


def _write_report(repo_root: Path, path: Path, payload: bytes) -> None:
    try:
        relative = path.relative_to(repo_root)
    except ValueError as error:
        raise VerificationError(
            "--json-out write target escaped the repository"
        ) from error
    parent_parts = relative.parent.parts
    directory_flags = (
        os.O_RDONLY
        | getattr(os, "O_DIRECTORY", 0)
        | getattr(os, "O_NOFOLLOW", 0)
    )
    opened_directories: list[int] = []
    report_fd: int | None = None
    target_created = False
    try:
        current_fd = os.open(
            repo_root,
            directory_flags,
        )
        opened_directories.append(current_fd)
        for part in parent_parts:
            try:
                next_fd = os.open(
                    part,
                    directory_flags,
                    dir_fd=current_fd,
                )
            except FileNotFoundError:
                try:
                    os.mkdir(part, mode=0o700, dir_fd=current_fd)
                except FileExistsError:
                    pass
                next_fd = os.open(
                    part,
                    directory_flags,
                    dir_fd=current_fd,
                )
            opened_directories.append(next_fd)
            current_fd = next_fd
        report_fd = os.open(
            relative.name,
            (
                os.O_WRONLY
                | os.O_CREAT
                | os.O_EXCL
                | getattr(os, "O_NOFOLLOW", 0)
            ),
            0o600,
            dir_fd=current_fd,
        )
        target_created = True
        offset = 0
        while offset < len(payload):
            written = os.write(report_fd, payload[offset:])
            if written <= 0:
                raise OSError("short write while storing generated report")
            offset += written
        os.fsync(report_fd)
    except FileExistsError as error:
        raise VerificationError(
            f"--json-out refuses to overwrite an existing path: {path}"
        ) from error
    except OSError as error:
        if target_created and opened_directories:
            try:
                os.unlink(relative.name, dir_fd=opened_directories[-1])
            except OSError:
                pass
        raise VerificationError(f"cannot write generated report: {error}") from error
    finally:
        if report_fd is not None:
            try:
                os.close(report_fd)
            except OSError:
                pass
        for directory_fd in reversed(opened_directories):
            try:
                os.close(directory_fd)
            except OSError:
                pass


def _secure_report_path(
    repo_root: Path,
    json_out: Path,
) -> Path:
    if json_out.suffix.lower() != ".json":
        raise VerificationError("--json-out must use a .json filename")
    raw_output = json_out if json_out.is_absolute() else repo_root / json_out
    output_path = Path(os.path.abspath(raw_output))
    audit_root = Path(os.path.abspath(repo_root / ".run/audit"))
    try:
        output_path.relative_to(audit_root)
    except ValueError as error:
        raise VerificationError(
            "--json-out must stay under repository .run/audit/"
        ) from error
    if output_path == audit_root:
        raise VerificationError("--json-out must name a file under .run/audit/")

    current = repo_root
    relative_parent = output_path.parent.relative_to(repo_root)
    for part in relative_parent.parts:
        current /= part
        try:
            mode = current.lstat().st_mode
        except FileNotFoundError:
            try:
                current.mkdir(mode=0o700)
            except FileExistsError:
                mode = current.lstat().st_mode
            else:
                mode = current.lstat().st_mode
        except OSError as error:
            raise VerificationError(
                f"cannot inspect --json-out parent: {current}: {error}"
            ) from error
        if stat.S_ISLNK(mode) or not stat.S_ISDIR(mode):
            raise VerificationError(
                f"--json-out parent may not traverse a symlink or non-directory: "
                f"{current}"
            )
    try:
        output_path.lstat()
    except FileNotFoundError:
        return output_path
    except OSError as error:
        raise VerificationError(
            f"cannot inspect --json-out target: {output_path}: {error}"
        ) from error
    raise VerificationError(
        f"--json-out refuses to overwrite an existing path: {output_path}"
    )


def run(
    *,
    repo_root: Path,
    json_out: Path | None = None,
) -> dict[str, Any]:
    repo_root = repo_root.resolve()
    _require_directory(repo_root, label="repository root")
    report = verify_closed_state(repo_root)
    if json_out is not None:
        output_path = _secure_report_path(repo_root, json_out)
        _write_report(repo_root, output_path, _json_bytes(report))
        report = dict(report)
        report["jsonOut"] = output_path.relative_to(repo_root).as_posix()
    return report


def _argument_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--repo-root",
        type=Path,
        default=REPO_ROOT,
        help="Repository root used for all strict relative-path checks.",
    )
    parser.add_argument(
        "--json-out",
        type=Path,
        help=(
            "Optional no-clobber generated JSON report path. It must remain under "
            "the repository .run/audit/ directory; stdout is always emitted."
        ),
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _argument_parser().parse_args(argv)
    try:
        result = run(
            repo_root=args.repo_root,
            json_out=args.json_out,
        )
    except (VerificationError, OSError, ValueError) as error:
        print(
            json.dumps(
                {"status": "FAIL", "error": str(error)},
                ensure_ascii=False,
                indent=2,
            )
        )
        return 1
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
