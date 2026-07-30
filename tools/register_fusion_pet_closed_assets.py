#!/usr/bin/env python3
"""Safely register the first two fusion-pet art bundles while runtime stays closed.

This tool is deliberately narrower than a release promoter:

* it accepts only the two frozen P1.4 fusion forms;
* it verifies the Phase 371 battle-bundle digests and owner-review video hash;
* it installs both bundles as one no-clobber transaction;
* it excludes every portrait artifact so the formal portrait pipeline can
  rebuild and review those assets independently;
* it never edits the pet art catalog, fusion recipes, Godot code, Node code, or
  any runtime switch.

The default mode is read-only.  ``--write`` builds both complete destinations
under one unique sibling staging directory, verifies their exact contents, and
then renames them into place with rollback if either rename fails.  Existing
destinations are accepted only when both are byte-for-byte identical to the
candidate registration; any mixed or drifted state fails closed.
"""

from __future__ import annotations

import argparse
import copy
from dataclasses import dataclass
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import stat
import sys
from typing import Any, Callable, Sequence


REPO_ROOT = Path(__file__).resolve().parents[1]
TOOL_NAME = "register_fusion_pet_closed_assets.py"
MANIFEST_RELATIVE = Path("qa/release/closed-registration-manifest-v1.json")
RECOVERY_BASE = REPO_ROOT / ".run/recovery/fusion-pet-closed-registration"
OWNER_DECISION_PATH = (
    REPO_ROOT / "client/godot/data/pet_fusion_visual_owner_decision_v1.json"
)
OWNER_DECISION_SHA256 = (
    "852f8772cfbe2223479d6af2b3b81cff2a79125b4f4ca3343c2912dfc6303d14"
)
OWNER_REVIEW_VIDEO_SHA256 = (
    "5b18f43d1eaa0dd9ba239cbba9c1d69559285b03d6e285bc6dbf337aa94c706d"
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
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")

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
IDENTITY_VISUAL_PATHS = frozenset(
    {
        "identity/identity-board-transparent.png",
        "identity/front_3quarter_sw.png",
        "identity/back_3quarter_ne.png",
        "identity/south.png",
        "identity/west.png",
    }
)
PORTRAIT_EXCLUDED_ROOTS = (
    ("portrait",),
    ("source", "portrait"),
    ("qa", "portrait"),
)
PORTRAIT_EXCLUDED_FILE = "prompts/portrait-v1.txt"


class RegistrationError(RuntimeError):
    """A fail-closed closed-registration validation or installation error."""


@dataclass(frozen=True)
class FormSpec:
    source_slug: str
    form_id: str
    display_name: str
    battle_bundle_digest: str


FORM_SPECS = (
    FormSpec(
        source_slug="solar_crown",
        form_id="emberhorn_fusion_solar_crown_fire7_wind3",
        display_name="曜冠角兽",
        battle_bundle_digest=(
            "5a4896f64614b4eceaad220071fdd80fe85909bfa78d67ffb0637090a71da2fc"
        ),
    ),
    FormSpec(
        source_slug="moss_rampart",
        form_id="emberhorn_fusion_moss_rampart_fire4_earth6",
        display_name="苔垒角兽",
        battle_bundle_digest=(
            "27c3a0784ab6a2e55a3f3acc6624a722a8b4240bbb04bcd0ffbc53a52d524107"
        ),
    ),
)


@dataclass(frozen=True)
class FileRecord:
    path: str
    sha256: str
    size: int

    def json_value(self) -> dict[str, Any]:
        return {"path": self.path, "sha256": self.sha256, "size": self.size}


@dataclass(frozen=True)
class FileTransformation:
    path: str
    payload: bytes
    source_sha256: str
    candidate_sha256: str
    source_size: int
    candidate_size: int
    relocation: dict[str, Any]


@dataclass(frozen=True)
class IntegrityFieldRule:
    field_path: tuple[str, ...]
    digest_kind: str


@dataclass(frozen=True)
class IntegrityDependencyRule:
    target_path: str
    fields: tuple[IntegrityFieldRule, ...]
    bound_path: str


INTEGRITY_DEPENDENCY_RULES = (
    IntegrityDependencyRule(
        target_path="source/identity-board-source-meta.json",
        fields=(
            IntegrityFieldRule(
                field_path=("pipelineMetadataSha256",),
                digest_kind="file_sha256",
            ),
        ),
        bound_path="source/identity-board-pipeline-meta.json",
    ),
    IntegrityDependencyRule(
        target_path="action-bundle-meta.json",
        fields=(
            IntegrityFieldRule(
                field_path=(
                    "evidence",
                    "identityGateAudit",
                    "pipelineMetadata",
                    "sha256",
                ),
                digest_kind="file_sha256",
            ),
            IntegrityFieldRule(
                field_path=(
                    "evidence",
                    "identityGateAudit",
                    "pipelineMetadata",
                    "metadataReplaySha256",
                ),
                digest_kind="pipeline_metadata_replay_sha256",
            ),
        ),
        bound_path="source/identity-board-pipeline-meta.json",
    ),
)


@dataclass(frozen=True)
class RegistrationOptions:
    source_base: Path
    destination_base: Path
    owner_decision: Path
    owner_video: Path
    write: bool = False


@dataclass(frozen=True)
class RegistrationCandidate:
    spec: FormSpec
    source_root: Path
    destination_root: Path
    copied_records: tuple[FileRecord, ...]
    owner_visual_records: tuple[FileRecord, ...]
    engineering_records: tuple[FileRecord, ...]
    excluded_portrait_records: tuple[FileRecord, ...]
    transformations: tuple[FileTransformation, ...]
    manifest_bytes: bytes
    previous_transformation_paths: frozenset[str]
    previous_manifest_bytes: bytes
    legacy_manifest_bytes: bytes

    def _expected_records_for(
        self,
        active_transformation_paths: frozenset[str],
        manifest_bytes: bytes,
    ) -> tuple[FileRecord, ...]:
        transformed = {item.path: item for item in self.transformations}
        copied = [
            (
                record
                if (
                    record.path not in transformed
                    or record.path in active_transformation_paths
                )
                else FileRecord(
                    record.path,
                    transformed[record.path].source_sha256,
                    transformed[record.path].source_size,
                )
            )
            for record in self.copied_records
        ]
        manifest_record = FileRecord(
            MANIFEST_RELATIVE.as_posix(),
            _sha256_bytes(manifest_bytes),
            len(manifest_bytes),
        )
        return tuple(
            sorted((*copied, manifest_record), key=lambda record: record.path)
        )

    @property
    def expected_records(self) -> tuple[FileRecord, ...]:
        return self._expected_records_for(
            frozenset(item.path for item in self.transformations),
            self.manifest_bytes,
        )

    @property
    def previous_expected_records(self) -> tuple[FileRecord, ...]:
        return self._expected_records_for(
            self.previous_transformation_paths,
            self.previous_manifest_bytes,
        )

    @property
    def legacy_expected_records(self) -> tuple[FileRecord, ...]:
        return self._expected_records_for(
            frozenset(),
            self.legacy_manifest_bytes,
        )


def _sha256_bytes(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    try:
        with path.open("rb") as stream:
            for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(chunk)
    except OSError as error:
        raise RegistrationError(f"cannot read file: {path}: {error}") from error
    return digest.hexdigest()


def _json_bytes(value: Any) -> bytes:
    return (
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=False) + "\n"
    ).encode("utf-8")


def _read_json(path: Path, *, label: str) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise RegistrationError(f"invalid {label}: {path}: {error}") from error
    if not isinstance(value, dict):
        raise RegistrationError(f"{label} must be a JSON object: {path}")
    return value


def _display_path(path: Path) -> str:
    resolved = path.resolve()
    try:
        return resolved.relative_to(REPO_ROOT.resolve()).as_posix()
    except ValueError:
        return resolved.as_posix()


def _absolute_path(path: Path) -> Path:
    return Path(os.path.abspath(path.expanduser()))


def _require_no_symlink_components(
    path: Path,
    *,
    label: str,
    allow_missing_tail: bool,
) -> None:
    absolute = _absolute_path(path)
    current = Path(absolute.anchor)
    for part in absolute.parts[1:]:
        current /= part
        if current.is_symlink():
            raise RegistrationError(f"{label} may not traverse a symlink: {current}")
        if not current.exists():
            if allow_missing_tail:
                return
            raise RegistrationError(f"{label} path component is missing: {current}")


def _require_regular_file(path: Path, *, label: str) -> None:
    try:
        mode = path.lstat().st_mode
    except OSError as error:
        raise RegistrationError(f"missing {label}: {path}: {error}") from error
    if stat.S_ISLNK(mode) or not stat.S_ISREG(mode) or path.stat().st_size <= 0:
        raise RegistrationError(f"{label} must be a non-empty regular file: {path}")


def _scan_safe_tree(root: Path, *, label: str) -> tuple[Path, ...]:
    if root.is_symlink() or not root.is_dir():
        raise RegistrationError(f"{label} must be a real directory: {root}")
    files: list[Path] = []
    for current, directory_names, file_names in os.walk(root, followlinks=False):
        current_path = Path(current)
        for name in directory_names:
            child = current_path / name
            try:
                mode = child.lstat().st_mode
            except OSError as error:
                raise RegistrationError(f"cannot inspect {label}: {child}: {error}") from error
            if stat.S_ISLNK(mode) or not stat.S_ISDIR(mode):
                raise RegistrationError(f"{label} contains an unsafe directory: {child}")
        for name in file_names:
            child = current_path / name
            try:
                mode = child.lstat().st_mode
            except OSError as error:
                raise RegistrationError(f"cannot inspect {label}: {child}: {error}") from error
            if stat.S_ISLNK(mode) or not stat.S_ISREG(mode):
                raise RegistrationError(f"{label} contains an unsafe file: {child}")
            files.append(child)
    return tuple(sorted(files))


def _is_portrait_excluded(relative: Path) -> bool:
    if relative.as_posix() == PORTRAIT_EXCLUDED_FILE:
        return True
    return any(relative.parts[: len(prefix)] == prefix for prefix in PORTRAIT_EXCLUDED_ROOTS)


def _record(root: Path, path: Path) -> FileRecord:
    relative = path.relative_to(root).as_posix()
    return FileRecord(relative, _sha256_file(path), path.stat().st_size)


def _validate_owner_evidence(
    owner_decision: Path,
    owner_video: Path,
) -> dict[str, dict[str, Any]]:
    _require_regular_file(owner_decision, label="owner decision")
    _require_regular_file(owner_video, label="owner 1x review video")
    if owner_decision.resolve() != OWNER_DECISION_PATH.resolve():
        raise RegistrationError(
            "owner decision must use the tracked frozen decision artifact: "
            f"{OWNER_DECISION_PATH}"
        )
    decision_sha = _sha256_file(owner_decision)
    if decision_sha != OWNER_DECISION_SHA256:
        raise RegistrationError(
            "owner decision hash drift: "
            f"expected={OWNER_DECISION_SHA256} actual={decision_sha}"
        )
    video_sha = _sha256_file(owner_video)
    if video_sha != OWNER_REVIEW_VIDEO_SHA256:
        raise RegistrationError(
            "owner review video hash drift: "
            f"expected={OWNER_REVIEW_VIDEO_SHA256} actual={video_sha}"
        )
    decision = _read_json(owner_decision, label="owner decision")
    expected_decision = {
        "schemaVersion": 1,
        "decisionType": "beastbound_pet_fusion_full_nonrideable_visual_owner_decision",
        "decision": "approved",
        "reviewer": "project-owner:fander",
        "recordedDecisionText": "通过啊",
        "approvedScopes": list(OWNER_APPROVED_SCOPES),
        "excludedScopes": list(OWNER_EXCLUDED_SCOPES),
        "releaseApproved": False,
        "runtimeEnabled": False,
    }
    for key, expected in expected_decision.items():
        if decision.get(key) != expected:
            raise RegistrationError(
                f"owner decision {key} must be {expected!r}, got {decision.get(key)!r}"
            )
    evidence = decision.get("evidence")
    if not isinstance(evidence, dict):
        raise RegistrationError("owner decision evidence is missing")
    merged_video = evidence.get("mergedReviewVideo")
    if not isinstance(merged_video, dict):
        raise RegistrationError("owner decision mergedReviewVideo is missing")
    if (
        merged_video.get("sha256") != OWNER_REVIEW_VIDEO_SHA256
        or merged_video.get("playbackSpeed") != 1.0
    ):
        raise RegistrationError(
            "owner decision is not bound to the frozen 1.00x merged review video"
        )
    forms = evidence.get("forms")
    if not isinstance(forms, list) or len(forms) != len(FORM_SPECS):
        raise RegistrationError("owner decision must bind exactly the two frozen forms")
    form_digests = {
        item.get("formId"): item.get("battleBundleDigest")
        for item in forms
        if isinstance(item, dict)
    }
    expected_form_digests = {
        spec.form_id: spec.battle_bundle_digest for spec in FORM_SPECS
    }
    if form_digests != expected_form_digests:
        raise RegistrationError(
            "owner decision form/battle digest binding drift: "
            f"expected={expected_form_digests} actual={form_digests}"
        )
    return {
        "ownerDecision": {
            "path": _display_path(owner_decision),
            "sha256": decision_sha,
        },
        "ownerReviewVideo": {
            "path": _display_path(owner_video),
            "sha256": video_sha,
            "playbackSpeed": "1.00x",
        },
    }


def _expected_world_paths(prefix: str) -> set[str]:
    result: set[str] = set()
    for direction in WORLD_DIRECTIONS:
        result.add(f"{prefix}/{direction}/idle/idle-1.png")
        result.update(
            f"{prefix}/{direction}/walk/walk-{index}.png" for index in range(1, 5)
        )
    return result


def _expected_battle_paths(*, source: bool) -> set[str]:
    result: set[str] = set()
    for view in BATTLE_VIEWS:
        for action, frame_count in BATTLE_ACTION_FRAME_COUNTS.items():
            if source:
                prefix = f"source/battle/{view}/{action}/source-frames"
            else:
                prefix = f"views/{view}/{action}"
            result.update(
                f"{prefix}/{action}-{index}.png"
                for index in range(1, frame_count + 1)
            )
    return result


def _png_paths_beneath(root: Path, relative_root: Path) -> set[str]:
    path = root / relative_root
    if not path.is_dir() or path.is_symlink():
        raise RegistrationError(f"missing or unsafe frame root: {path}")
    return {
        child.relative_to(root).as_posix()
        for child in path.rglob("*.png")
        if child.is_file() and not child.is_symlink()
    }


def _validate_metadata(root: Path, spec: FormSpec) -> dict[str, Any]:
    metadata = _read_json(root / "action-bundle-meta.json", label="action bundle metadata")
    expected_scalars = {
        "formId": spec.form_id,
        "displayName": spec.display_name,
        "runtimeEnabled": False,
        "rideableTarget": False,
        "ownerReviewStatus": "pending",
    }
    for key, expected in expected_scalars.items():
        if metadata.get(key) != expected:
            raise RegistrationError(
                f"{spec.form_id} metadata.{key} must be {expected!r}, "
                f"got {metadata.get(key)!r}"
            )
    if metadata.get("supportedMountedCharacterIds") != []:
        raise RegistrationError(
            f"{spec.form_id} must declare no supported mounted character"
        )

    world = metadata.get("worldVisual")
    if not isinstance(world, dict):
        raise RegistrationError(f"{spec.form_id} worldVisual is missing")
    expected_world = {
        "strategy": "independent_8",
        "runtimeMirroring": False,
        "runtimeMountedComposition": False,
        "totalFrameCount": 40,
    }
    for key, expected in expected_world.items():
        if world.get(key) != expected:
            raise RegistrationError(
                f"{spec.form_id} worldVisual.{key} must be {expected!r}"
            )
    if tuple(world.get("directions", ())) != WORLD_DIRECTIONS:
        raise RegistrationError(f"{spec.form_id} must declare the canonical true-eight directions")
    world_actions = world.get("actions")
    if not isinstance(world_actions, dict):
        raise RegistrationError(f"{spec.form_id} worldVisual.actions is missing")
    if not isinstance(world_actions.get("idle"), dict) or world_actions["idle"].get(
        "frameCount"
    ) != 1:
        raise RegistrationError(f"{spec.form_id} world idle must contain one frame")
    if not isinstance(world_actions.get("walk"), dict) or world_actions["walk"].get(
        "frameCount"
    ) != 4:
        raise RegistrationError(f"{spec.form_id} world walk must contain four frames")

    battle = metadata.get("battleVisual")
    if not isinstance(battle, dict):
        raise RegistrationError(f"{spec.form_id} battleVisual is missing")
    expected_battle = {
        "kind": "pet",
        "views": list(BATTLE_VIEWS),
        "totalFrameCount": 180,
        "runtimeMirroring": False,
        "integratedWholeFrame": False,
        "runtimeLayeredComposition": False,
        "runtimeEnabled": False,
        "bundleDigest": spec.battle_bundle_digest,
        "archiveMode": "full",
        "sourceFramesTracked": True,
    }
    for key, expected in expected_battle.items():
        if battle.get(key) != expected:
            raise RegistrationError(
                f"{spec.form_id} battleVisual.{key} must be {expected!r}, "
                f"got {battle.get(key)!r}"
            )
    return metadata


def _validate_frame_matrices(root: Path, spec: FormSpec) -> set[str]:
    expected_world_runtime = _expected_world_paths("world/directions")
    expected_world_source = _expected_world_paths("source/world-frames")
    actual_world_runtime = _png_paths_beneath(root, Path("world/directions"))
    actual_world_source = _png_paths_beneath(root, Path("source/world-frames"))
    if actual_world_runtime != expected_world_runtime:
        raise RegistrationError(
            f"{spec.form_id} runtime true-eight matrix drift: "
            f"missing={sorted(expected_world_runtime - actual_world_runtime)} "
            f"extra={sorted(actual_world_runtime - expected_world_runtime)}"
        )
    if actual_world_source != expected_world_source:
        raise RegistrationError(
            f"{spec.form_id} source true-eight matrix drift: "
            f"missing={sorted(expected_world_source - actual_world_source)} "
            f"extra={sorted(actual_world_source - expected_world_source)}"
        )

    expected_battle_runtime = _expected_battle_paths(source=False)
    expected_battle_source = _expected_battle_paths(source=True)
    actual_battle_runtime = _png_paths_beneath(root, Path("views"))
    actual_battle_source = {
        child.relative_to(root).as_posix()
        for child in (root / "source/battle").glob("*/*/source-frames/*.png")
        if child.is_file() and not child.is_symlink()
    }
    if actual_battle_runtime != expected_battle_runtime:
        raise RegistrationError(
            f"{spec.form_id} runtime battle matrix drift: "
            f"missing={sorted(expected_battle_runtime - actual_battle_runtime)} "
            f"extra={sorted(actual_battle_runtime - expected_battle_runtime)}"
        )
    if actual_battle_source != expected_battle_source:
        raise RegistrationError(
            f"{spec.form_id} source battle matrix drift: "
            f"missing={sorted(expected_battle_source - actual_battle_source)} "
            f"extra={sorted(actual_battle_source - expected_battle_source)}"
        )
    for relative in (
        *IDENTITY_VISUAL_PATHS,
        *expected_world_runtime,
        *expected_world_source,
        *expected_battle_runtime,
        *expected_battle_source,
    ):
        _require_regular_file(root / relative, label=f"{spec.form_id} visual file")
    return {
        *IDENTITY_VISUAL_PATHS,
        *expected_world_runtime,
        *expected_world_source,
        *expected_battle_runtime,
        *expected_battle_source,
    }


def _validate_battle_install_manifest(root: Path, spec: FormSpec) -> None:
    path = root / "source/battle/install-manifest.json"
    install = _read_json(path, label="battle install manifest")
    expected = {
        "formId": spec.form_id,
        "kind": "pet",
        "characterId": None,
        "bundleDigest": spec.battle_bundle_digest,
        "archiveMode": "full",
        "runtimeEnabled": False,
        "ownerReviewStatus": "pending",
    }
    for key, expected_value in expected.items():
        if install.get(key) != expected_value:
            raise RegistrationError(
                f"{spec.form_id} install manifest {key} must be {expected_value!r}"
            )
    hashes = install.get("installedFileHashes")
    if not isinstance(hashes, dict) or not hashes:
        raise RegistrationError(f"{spec.form_id} installedFileHashes is missing")
    required_battle = {
        *_expected_battle_paths(source=False),
        *_expected_battle_paths(source=True),
    }
    missing_hashes = sorted(required_battle - set(hashes))
    if missing_hashes:
        raise RegistrationError(
            f"{spec.form_id} battle frames are not bound by install manifest: "
            f"{missing_hashes}"
        )
    for raw_relative, expected_hash in sorted(hashes.items()):
        if not isinstance(raw_relative, str) or not raw_relative:
            raise RegistrationError(f"{spec.form_id} has an invalid installed-file path")
        relative = Path(raw_relative)
        if relative.is_absolute() or ".." in relative.parts:
            raise RegistrationError(
                f"{spec.form_id} install manifest path escapes root: {raw_relative}"
            )
        if not isinstance(expected_hash, str) or SHA256_RE.fullmatch(expected_hash) is None:
            raise RegistrationError(
                f"{spec.form_id} install manifest has invalid hash: {raw_relative}"
            )
        installed = root / relative
        _require_regular_file(installed, label=f"{spec.form_id} installed file")
        actual_hash = _sha256_file(installed)
        if actual_hash != expected_hash:
            raise RegistrationError(
                f"{spec.form_id} installed file hash drift: {raw_relative}; "
                f"expected={expected_hash} actual={actual_hash}"
            )


def _validate_no_mounted_paths(root: Path, files: Sequence[Path], spec: FormSpec) -> None:
    mounted = [
        path.relative_to(root).as_posix()
        for path in files
        if any("mounted" in part.lower() for part in path.relative_to(root).parts)
    ]
    if mounted:
        raise RegistrationError(f"{spec.form_id} contains forbidden mounted files: {mounted}")


def _reject_open_runtime_state(value: Any, *, label: str) -> None:
    if isinstance(value, dict):
        for key, child in value.items():
            normalized = str(key).lower()
            if normalized in {"runtimeenabled", "releaseapproved"} and child is not False:
                raise RegistrationError(
                    f"{label}.{key} must remain false in a closed registration"
                )
            _reject_open_runtime_state(child, label=f"{label}.{key}")
    elif isinstance(value, list):
        for index, child in enumerate(value):
            _reject_open_runtime_state(child, label=f"{label}[{index}]")


def _relocate_identity_pipeline_metadata(
    *,
    source_root: Path,
    destination_root: Path,
    spec: FormSpec,
) -> FileTransformation:
    relative = Path("source/identity-board-pipeline-meta.json")
    source_path = source_root / relative
    raw_source = source_root / "source/identity-board-raw.png"
    _require_regular_file(source_path, label=f"{spec.form_id} identity pipeline metadata")
    _require_regular_file(raw_source, label=f"{spec.form_id} identity raw board")
    metadata = _read_json(source_path, label=f"{spec.form_id} identity pipeline metadata")
    expected_old_input = _display_path(raw_source)
    expected_new_input = _display_path(
        destination_root / "source/identity-board-raw.png"
    )
    if metadata.get("input") != expected_old_input:
        raise RegistrationError(
            f"{spec.form_id} identity pipeline input is not rooted at the isolated "
            f"source: expected={expected_old_input!r} actual={metadata.get('input')!r}"
        )
    raw_sha = _sha256_file(raw_source)
    if metadata.get("inputSha256") != raw_sha:
        raise RegistrationError(
            f"{spec.form_id} identity pipeline inputSha256 does not match "
            "source/identity-board-raw.png"
        )
    try:
        source_payload = source_path.read_bytes()
        source_text = source_payload.decode("utf-8")
    except (OSError, UnicodeDecodeError) as error:
        raise RegistrationError(
            f"{spec.form_id} identity pipeline metadata must be UTF-8: {error}"
        ) from error
    old_token = json.dumps(expected_old_input, ensure_ascii=False)
    new_token = json.dumps(expected_new_input, ensure_ascii=False)
    if source_text.count(old_token) != 1:
        raise RegistrationError(
            f"{spec.form_id} identity pipeline input token must occur exactly once"
        )
    candidate_text = source_text.replace(old_token, new_token)
    candidate_payload = candidate_text.encode("utf-8")
    try:
        candidate_json = json.loads(candidate_text)
    except json.JSONDecodeError as error:
        raise RegistrationError(
            f"{spec.form_id} relocated identity pipeline metadata is invalid: {error}"
        ) from error
    expected_candidate = dict(metadata)
    expected_candidate["input"] = expected_new_input
    if candidate_json != expected_candidate:
        raise RegistrationError(
            f"{spec.form_id} identity pipeline relocation changed fields beyond input"
        )
    return FileTransformation(
        path=relative.as_posix(),
        payload=candidate_payload,
        source_sha256=_sha256_bytes(source_payload),
        candidate_sha256=_sha256_bytes(candidate_payload),
        source_size=len(source_payload),
        candidate_size=len(candidate_payload),
        relocation={
            "path": relative.as_posix(),
            "field": "input",
            "from": expected_old_input,
            "to": expected_new_input,
            "sourceMetadataSha256": _sha256_bytes(source_payload),
            "sourceMetadataSize": len(source_payload),
            "candidateMetadataSha256": _sha256_bytes(candidate_payload),
            "candidateMetadataSize": len(candidate_payload),
            "inputAsset": {
                "path": expected_new_input,
                "sha256": raw_sha,
            },
        },
    )


def _json_value_at(value: Any, field_path: tuple[str, ...]) -> Any:
    current = value
    for key in field_path:
        if not isinstance(current, dict) or key not in current:
            return None
        current = current[key]
    return current


def _set_json_value(
    value: dict[str, Any],
    field_path: tuple[str, ...],
    replacement: str,
) -> None:
    current: dict[str, Any] = value
    for key in field_path[:-1]:
        child = current.get(key)
        if not isinstance(child, dict):
            raise RegistrationError(
                f"integrity dependency field is not an object: "
                f"{'.'.join(field_path)}"
            )
        current = child
    current[field_path[-1]] = replacement


def _find_json_scalar_paths(
    value: Any,
    expected: str,
    path: tuple[str, ...] = (),
) -> tuple[tuple[str, ...], ...]:
    matches: list[tuple[str, ...]] = []
    if isinstance(value, dict):
        for key, child in value.items():
            matches.extend(
                _find_json_scalar_paths(child, expected, (*path, str(key)))
            )
    elif isinstance(value, list):
        for index, child in enumerate(value):
            matches.extend(
                _find_json_scalar_paths(child, expected, (*path, f"[{index}]"))
            )
    elif value == expected:
        matches.append(path)
    return tuple(matches)


def _pipeline_metadata_replay_sha256(
    payload: bytes,
    *,
    raw_source: Path,
    label: str,
) -> str:
    try:
        value = json.loads(payload.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise RegistrationError(
            f"{label} must be UTF-8 JSON before replay digesting: {error}"
        ) from error
    if not isinstance(value, dict):
        raise RegistrationError(
            f"{label} must be a JSON object before replay digesting"
        )
    value["input"] = str(raw_source.resolve())
    replay_payload = (
        json.dumps(
            value,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        )
        + "\n"
    ).encode("utf-8")
    return _sha256_bytes(replay_payload)


def _integrity_field_values(
    *,
    source_root: Path,
    destination_root: Path,
    spec: FormSpec,
    field: IntegrityFieldRule,
    bound_transformation: FileTransformation,
) -> tuple[str, str]:
    if field.digest_kind == "file_sha256":
        return (
            bound_transformation.source_sha256,
            bound_transformation.candidate_sha256,
        )
    if field.digest_kind == "pipeline_metadata_replay_sha256":
        if (
            bound_transformation.path
            != "source/identity-board-pipeline-meta.json"
        ):
            raise RegistrationError(
                f"{spec.form_id} replay digest is bound to an unsupported "
                f"metadata file: {bound_transformation.path}"
            )
        bound_source = source_root / bound_transformation.path
        _require_regular_file(
            bound_source,
            label=f"{spec.form_id} replay-digest source metadata",
        )
        try:
            source_payload = bound_source.read_bytes()
        except OSError as error:
            raise RegistrationError(
                f"{spec.form_id} cannot read replay-digest source metadata: "
                f"{bound_source}: {error}"
            ) from error
        return (
            _pipeline_metadata_replay_sha256(
                source_payload,
                raw_source=(
                    source_root / "source/identity-board-raw.png"
                ),
                label=(
                    f"{spec.form_id} isolated "
                    f"{bound_transformation.path}"
                ),
            ),
            _pipeline_metadata_replay_sha256(
                bound_transformation.payload,
                raw_source=(
                    destination_root / "source/identity-board-raw.png"
                ),
                label=(
                    f"{spec.form_id} candidate "
                    f"{bound_transformation.path}"
                ),
            ),
        )
    raise RegistrationError(
        f"{spec.form_id} has unsupported integrity digest kind: "
        f"{field.digest_kind}"
    )


def _integrity_dependency_transformation(
    *,
    source_root: Path,
    destination_root: Path,
    spec: FormSpec,
    rule: IntegrityDependencyRule,
    bound_transformation: FileTransformation,
) -> FileTransformation:
    relative = Path(rule.target_path)
    source_path = source_root / relative
    _require_regular_file(
        source_path,
        label=f"{spec.form_id} integrity dependency metadata",
    )
    try:
        source_payload = source_path.read_bytes()
        source_text = source_payload.decode("utf-8")
        metadata = json.loads(source_text)
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise RegistrationError(
            f"{spec.form_id} integrity dependency must be UTF-8 JSON: "
            f"{relative.as_posix()}: {error}"
        ) from error
    if not isinstance(metadata, dict):
        raise RegistrationError(
            f"{spec.form_id} integrity dependency must be a JSON object: "
            f"{relative.as_posix()}"
        )
    field_updates: list[dict[str, str]] = []
    expected_candidate = copy.deepcopy(metadata)
    candidate_text = source_text
    for field in rule.fields:
        source_value, candidate_value = _integrity_field_values(
            source_root=source_root,
            destination_root=destination_root,
            spec=spec,
            field=field,
            bound_transformation=bound_transformation,
        )
        field_name = ".".join(field.field_path)
        if _json_value_at(metadata, field.field_path) != source_value:
            raise RegistrationError(
                f"{spec.form_id} integrity dependency does not bind the "
                f"isolated {field.digest_kind}: "
                f"{relative.as_posix()}:{field_name}"
            )
        if source_value == candidate_value:
            raise RegistrationError(
                f"{spec.form_id} integrity dependency would be a no-op: "
                f"{relative.as_posix()}:{field_name}"
            )
        old_token = json.dumps(source_value, ensure_ascii=False)
        new_token = json.dumps(candidate_value, ensure_ascii=False)
        if source_text.count(old_token) != 1:
            raise RegistrationError(
                f"{spec.form_id} integrity dependency hash token must occur "
                f"exactly once: {relative.as_posix()}:{field_name}"
            )
        candidate_text = candidate_text.replace(
            old_token,
            new_token,
            1,
        )
        _set_json_value(
            expected_candidate,
            field.field_path,
            candidate_value,
        )
        field_updates.append(
            {
                "field": field_name,
                "digestKind": field.digest_kind,
                "from": source_value,
                "to": candidate_value,
            }
        )
    candidate_payload = candidate_text.encode("utf-8")
    try:
        candidate_json = json.loads(candidate_text)
    except json.JSONDecodeError as error:
        raise RegistrationError(
            f"{spec.form_id} transformed integrity dependency is invalid: "
            f"{relative.as_posix()}: {error}"
        ) from error
    if candidate_json != expected_candidate:
        raise RegistrationError(
            f"{spec.form_id} integrity dependency update changed fields "
            f"beyond its declared field set: {relative.as_posix()}"
        )
    primary_update = field_updates[0]
    return FileTransformation(
        path=relative.as_posix(),
        payload=candidate_payload,
        source_sha256=_sha256_bytes(source_payload),
        candidate_sha256=_sha256_bytes(candidate_payload),
        source_size=len(source_payload),
        candidate_size=len(candidate_payload),
        relocation={
            "path": relative.as_posix(),
            "field": primary_update["field"],
            "from": primary_update["from"],
            "to": primary_update["to"],
            "fieldUpdates": field_updates,
            "sourceMetadataSha256": _sha256_bytes(source_payload),
            "sourceMetadataSize": len(source_payload),
            "candidateMetadataSha256": _sha256_bytes(candidate_payload),
            "candidateMetadataSize": len(candidate_payload),
            "boundFile": {
                "path": _display_path(
                    destination_root / bound_transformation.path
                ),
                "sha256": bound_transformation.candidate_sha256,
            },
        },
    )


def _hash_references_in_candidate_sources(
    *,
    source_root: Path,
    copied_records: Sequence[FileRecord],
    transformations: dict[str, FileTransformation],
    expected_hash: str,
    spec: FormSpec,
) -> frozenset[tuple[str, tuple[str, ...]]]:
    references: set[tuple[str, tuple[str, ...]]] = set()
    token = expected_hash.encode("ascii")
    for record in copied_records:
        relative = record.path
        transformation = transformations.get(relative)
        try:
            payload = (
                transformation.payload
                if transformation is not None
                else (source_root / relative).read_bytes()
            )
        except OSError as error:
            raise RegistrationError(
                f"{spec.form_id} cannot inspect dependency closure: "
                f"{relative}: {error}"
            ) from error
        if token not in payload:
            continue
        if Path(relative).suffix.lower() != ".json":
            references.add((relative, ("$raw",)))
            continue
        try:
            value = json.loads(payload.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise RegistrationError(
                f"{spec.form_id} dependency closure JSON is invalid: "
                f"{relative}: {error}"
            ) from error
        scalar_paths = _find_json_scalar_paths(value, expected_hash)
        if not scalar_paths:
            references.add((relative, ("$raw",)))
            continue
        references.update((relative, field_path) for field_path in scalar_paths)
    return frozenset(references)


def _build_recursive_integrity_transformations(
    *,
    source_root: Path,
    destination_root: Path,
    spec: FormSpec,
    source_copied: Sequence[FileRecord],
    pipeline_transformation: FileTransformation,
) -> tuple[FileTransformation, ...]:
    transformations = {
        pipeline_transformation.path: pipeline_transformation,
    }
    integrity: list[FileTransformation] = []
    queue = [pipeline_transformation]
    visited: set[str] = set()
    while queue:
        bound = queue.pop(0)
        if bound.path in visited:
            raise RegistrationError(
                f"{spec.form_id} integrity dependency cycle detected: {bound.path}"
            )
        visited.add(bound.path)
        matching_rules = tuple(
            rule
            for rule in INTEGRITY_DEPENDENCY_RULES
            if rule.bound_path == bound.path
        )
        expected_by_hash: dict[
            str,
            set[tuple[str, tuple[str, ...]]],
        ] = {bound.source_sha256: set()}
        for rule in matching_rules:
            for field in rule.fields:
                source_value, _candidate_value = _integrity_field_values(
                    source_root=source_root,
                    destination_root=destination_root,
                    spec=spec,
                    field=field,
                    bound_transformation=bound,
                )
                expected_by_hash.setdefault(source_value, set()).add(
                    (rule.target_path, field.field_path)
                )
        for expected_hash, reference_set in expected_by_hash.items():
            expected_references = frozenset(reference_set)
            actual_references = _hash_references_in_candidate_sources(
                source_root=source_root,
                copied_records=source_copied,
                transformations=transformations,
                expected_hash=expected_hash,
                spec=spec,
            )
            if actual_references != expected_references:
                missing = sorted(expected_references - actual_references)
                unexpected = sorted(actual_references - expected_references)
                raise RegistrationError(
                    f"{spec.form_id} integrity dependency graph drift for "
                    f"{bound.path} digest={expected_hash}: "
                    f"missing={missing} unexpected={unexpected}"
                )
        for rule in matching_rules:
            if rule.target_path in transformations:
                raise RegistrationError(
                    f"{spec.form_id} multiple integrity dependencies target one "
                    f"metadata file: {rule.target_path}"
                )
            transformation = _integrity_dependency_transformation(
                source_root=source_root,
                destination_root=destination_root,
                spec=spec,
                rule=rule,
                bound_transformation=bound,
            )
            transformations[transformation.path] = transformation
            integrity.append(transformation)
            queue.append(transformation)
    if len(integrity) != len(INTEGRITY_DEPENDENCY_RULES):
        raise RegistrationError(
            f"{spec.form_id} integrity dependency graph is incomplete: "
            f"expected={len(INTEGRITY_DEPENDENCY_RULES)} actual={len(integrity)}"
        )
    return tuple(integrity)


def _build_candidate(
    spec: FormSpec,
    *,
    source_base: Path,
    destination_base: Path,
    owner_evidence: dict[str, dict[str, Any]],
) -> RegistrationCandidate:
    source_root_input = source_base / spec.source_slug / "pet-root"
    _require_no_symlink_components(
        source_root_input,
        label=f"{spec.form_id} source root",
        allow_missing_tail=False,
    )
    source_root = source_root_input.resolve()
    destination_root = destination_base / spec.form_id
    files = _scan_safe_tree(source_root, label=f"{spec.form_id} source root")
    _validate_no_mounted_paths(source_root, files, spec)
    _validate_metadata(source_root, spec)
    owner_visual_paths = _validate_frame_matrices(source_root, spec)
    _validate_battle_install_manifest(source_root, spec)

    pipeline_transformation = _relocate_identity_pipeline_metadata(
        source_root=source_root,
        destination_root=destination_root,
        spec=spec,
    )
    source_copied: list[FileRecord] = []
    excluded: list[FileRecord] = []
    for path in files:
        relative = path.relative_to(source_root)
        if _is_generated_import_sidecar(relative):
            raise RegistrationError(
                f"{spec.form_id} isolated source may not contain Godot-generated "
                f".import state: {relative.as_posix()}"
            )
        if relative == MANIFEST_RELATIVE:
            raise RegistrationError(
                f"{spec.form_id} source may not contain a generated registration manifest"
            )
        if _is_portrait_excluded(relative):
            excluded.append(_record(source_root, path))
            continue
        if "portrait" in relative.as_posix().lower():
            raise RegistrationError(
                f"{spec.form_id} contains an unclassified portrait artifact: {relative}"
            )
        if relative.suffix.lower() == ".json":
            _reject_open_runtime_state(
                _read_json(path, label=f"{spec.form_id} closed JSON"),
                label=f"{spec.form_id}:{relative.as_posix()}",
            )
        source_copied.append(_record(source_root, path))
    if not excluded:
        raise RegistrationError(
            f"{spec.form_id} source does not expose portrait artifacts for explicit exclusion"
        )
    source_copied.sort(key=lambda record: record.path)
    excluded.sort(key=lambda record: record.path)
    integrity_transformations = _build_recursive_integrity_transformations(
        source_root=source_root,
        destination_root=destination_root,
        spec=spec,
        source_copied=source_copied,
        pipeline_transformation=pipeline_transformation,
    )
    transformation_sequence = (
        pipeline_transformation,
        *integrity_transformations,
    )
    transformations = {
        transformation.path: transformation
        for transformation in transformation_sequence
    }
    copied = [
        FileRecord(
            record.path,
            transformations[record.path].candidate_sha256,
            transformations[record.path].candidate_size,
        )
        if record.path in transformations
        else record
        for record in source_copied
    ]
    copied_paths = {record.path for record in copied}
    if not owner_visual_paths.issubset(copied_paths):
        raise RegistrationError(
            f"{spec.form_id} approved visual subset is incomplete after portrait exclusion"
        )
    owner_visual = [record for record in copied if record.path in owner_visual_paths]
    engineering = [record for record in copied if record.path not in owner_visual_paths]
    if len(owner_visual) != 445:
        raise RegistrationError(
            f"{spec.form_id} owner-approved identity/world/battle subset must contain "
            f"445 files, got {len(owner_visual)}"
        )

    isolated_source_snapshot = _sha256_bytes(
        _json_bytes([record.json_value() for record in (*source_copied, *excluded)])
    )
    candidate_snapshot = _sha256_bytes(
        _json_bytes([record.json_value() for record in (*copied, *excluded)])
    )
    base_manifest = {
        "schemaVersion": 1,
        "manifestType": "fusion_pet_closed_asset_copy_registration",
        "tool": TOOL_NAME,
        "formId": spec.form_id,
        "displayName": spec.display_name,
        "sourceRoot": _display_path(source_root),
        "destinationRoot": _display_path(destination_root),
        "lifecycle": {
            "registrationStatus": "engineering_closed_asset_copy",
            "runtimeEnabled": False,
            "rideable": False,
            "petArtCatalogEdited": False,
            "fusionRecipeCatalogEdited": False,
            "playerEntryOpened": False,
            "ownerVisualDecisionApprovesThisEngineeringRegistration": False,
        },
        "frozenOwnerApproval": {
            **owner_evidence,
            "scope": list(OWNER_APPROVED_SCOPES),
            "excludedScope": list(OWNER_EXCLUDED_SCOPES),
            "phase371BattleBundleDigest": spec.battle_bundle_digest,
        },
        "validatedMatrices": {
            "identityVisualFiles": 5,
            "worldRuntimeFrames": 40,
            "worldSourceFrames": 40,
            "battleRuntimeFrames": 180,
            "battleSourceFrames": 180,
            "mountedFiles": 0,
        },
        "portrait": {
            "status": "pending_formal_rebuild_and_owner_review",
            "builder": "build_pet_portrait",
            "copied": False,
            "excludedFiles": [record.json_value() for record in excluded],
        },
        "sourceSnapshotSha256": isolated_source_snapshot,
        "copiedFiles": [record.json_value() for record in source_copied],
        "ownerApprovedVisualFiles": [
            (
                FileRecord(
                    record.path,
                    transformations[record.path].source_sha256,
                    transformations[record.path].source_size,
                ).json_value()
                if record.path in transformations
                else record.json_value()
            )
            for record in owner_visual
        ],
        "engineeringSupportFiles": [
            (
                FileRecord(
                    record.path,
                    transformations[record.path].source_sha256,
                    transformations[record.path].source_size,
                ).json_value()
                if record.path in transformations
                else record.json_value()
            )
            for record in engineering
        ],
    }
    legacy_manifest_bytes = _json_bytes(base_manifest)
    previous_transformation_paths = frozenset(
        {
            pipeline_transformation.path,
            "source/identity-board-source-meta.json",
        }
    )
    previous_copied = [
        (
            record
            if (
                record.path not in transformations
                or record.path in previous_transformation_paths
            )
            else FileRecord(
                record.path,
                transformations[record.path].source_sha256,
                transformations[record.path].source_size,
            )
        )
        for record in copied
    ]
    previous_owner_visual = [
        record for record in previous_copied if record.path in owner_visual_paths
    ]
    previous_engineering = [
        record for record in previous_copied if record.path not in owner_visual_paths
    ]
    previous_snapshot = _sha256_bytes(
        _json_bytes(
            [record.json_value() for record in (*previous_copied, *excluded)]
        )
    )
    previous_manifest = dict(base_manifest)
    previous_manifest["engineeringRelocations"] = [
        pipeline_transformation.relocation
    ]
    previous_manifest["engineeringIntegrityUpdates"] = [
        {
            key: value
            for key, value in transformation.relocation.items()
            if key != "fieldUpdates"
        }
        for transformation in integrity_transformations
        if transformation.path == "source/identity-board-source-meta.json"
    ]
    previous_manifest["isolatedSourceSnapshotSha256"] = isolated_source_snapshot
    previous_manifest["sourceSnapshotSha256"] = previous_snapshot
    previous_manifest["copiedFiles"] = [
        record.json_value() for record in previous_copied
    ]
    previous_manifest["ownerApprovedVisualFiles"] = [
        record.json_value() for record in previous_owner_visual
    ]
    previous_manifest["engineeringSupportFiles"] = [
        record.json_value() for record in previous_engineering
    ]
    previous_manifest_bytes = _json_bytes(previous_manifest)
    manifest = dict(base_manifest)
    manifest["engineeringRelocations"] = [
        pipeline_transformation.relocation
    ]
    manifest["engineeringIntegrityUpdates"] = [
        transformation.relocation
        for transformation in integrity_transformations
    ]
    manifest["isolatedSourceSnapshotSha256"] = isolated_source_snapshot
    manifest["sourceSnapshotSha256"] = candidate_snapshot
    manifest["copiedFiles"] = [record.json_value() for record in copied]
    manifest["ownerApprovedVisualFiles"] = [
        record.json_value() for record in owner_visual
    ]
    manifest["engineeringSupportFiles"] = [
        record.json_value() for record in engineering
    ]
    return RegistrationCandidate(
        spec=spec,
        source_root=source_root,
        destination_root=destination_root,
        copied_records=tuple(copied),
        owner_visual_records=tuple(owner_visual),
        engineering_records=tuple(engineering),
        excluded_portrait_records=tuple(excluded),
        transformations=transformation_sequence,
        manifest_bytes=_json_bytes(manifest),
        previous_transformation_paths=previous_transformation_paths,
        previous_manifest_bytes=previous_manifest_bytes,
        legacy_manifest_bytes=legacy_manifest_bytes,
    )


def prepare_registration(options: RegistrationOptions) -> tuple[RegistrationCandidate, ...]:
    source_input = _absolute_path(options.source_base)
    destination_base = _absolute_path(options.destination_base)
    _require_no_symlink_components(
        source_input,
        label="source base",
        allow_missing_tail=False,
    )
    _require_no_symlink_components(
        destination_base,
        label="destination base",
        allow_missing_tail=True,
    )
    source_base = source_input.resolve()
    if not source_base.is_dir():
        raise RegistrationError(f"source base must be a real directory: {source_base}")
    if destination_base.exists() and not destination_base.is_dir():
        raise RegistrationError(f"destination base must be a directory: {destination_base}")
    if source_base == destination_base or source_base in destination_base.parents:
        raise RegistrationError("source and destination bases must be isolated")
    owner_evidence = _validate_owner_evidence(
        _absolute_path(options.owner_decision),
        _absolute_path(options.owner_video),
    )
    return tuple(
        _build_candidate(
            spec,
            source_base=source_base,
            destination_base=destination_base,
            owner_evidence=owner_evidence,
        )
        for spec in FORM_SPECS
    )


def _is_generated_import_sidecar(relative: Path) -> bool:
    return relative.name.endswith(".import")


def _partition_destination_records(
    destination: Path,
    *,
    allowed_sidecar_bases: frozenset[str] = frozenset(),
) -> tuple[tuple[FileRecord, ...], tuple[FileRecord, ...]]:
    files = _scan_safe_tree(destination, label="existing destination")
    relative_paths = {
        path.relative_to(destination).as_posix()
        for path in files
    }
    product: list[FileRecord] = []
    sidecars: list[FileRecord] = []
    for path in files:
        relative = path.relative_to(destination)
        relative_text = relative.as_posix()
        if not _is_generated_import_sidecar(relative):
            product.append(_record(destination, path))
            continue
        base_path = relative_text[: -len(".import")]
        if (
            base_path not in allowed_sidecar_bases
            or base_path not in relative_paths
        ):
            raise RegistrationError(
                "orphan or unregistered Godot .import sidecar refused: "
                f"{destination / relative}"
            )
        sidecars.append(_record(destination, path))
    return (
        tuple(sorted(product, key=lambda item: item.path)),
        tuple(sorted(sidecars, key=lambda item: item.path)),
    )


def _actual_destination_records(
    destination: Path,
    *,
    allowed_sidecar_bases: frozenset[str] = frozenset(),
) -> tuple[FileRecord, ...]:
    """Return product records after validating every disposable sidecar."""

    product, _sidecars = _partition_destination_records(
        destination,
        allowed_sidecar_bases=allowed_sidecar_bases,
    )
    return product


def _candidate_sidecar_bases(
    candidate: RegistrationCandidate,
) -> frozenset[str]:
    return frozenset(
        record.path
        for record in (
            *candidate.expected_records,
            *candidate.previous_expected_records,
            *candidate.legacy_expected_records,
        )
    )


def _generated_import_sidecar_records(
    destination: Path,
    *,
    allowed_sidecar_bases: frozenset[str],
) -> tuple[FileRecord, ...]:
    if not destination.exists():
        return ()
    _product, sidecars = _partition_destination_records(
        destination,
        allowed_sidecar_bases=allowed_sidecar_bases,
    )
    return sidecars


def _generated_import_sidecar_evidence(
    records: Sequence[FileRecord],
    *,
    retained_locations: Sequence[str],
) -> dict[str, Any]:
    return {
        "classification": "godot_generated_disposable_import_state",
        "productByteComparisonExcluded": True,
        "productionCandidateCopied": False,
        "retainedInRecovery": bool(retained_locations),
        "retainedRecoveryLocations": list(retained_locations),
        "count": len(records),
        "fileSetSha256": _records_digest(records),
        "files": [record.json_value() for record in records],
    }


def _expected_directories(records: Sequence[FileRecord]) -> set[str]:
    result: set[str] = set()
    for record in records:
        parent = Path(record.path).parent
        while parent != Path("."):
            result.add(parent.as_posix())
            parent = parent.parent
    return result


def _actual_directories(destination: Path) -> set[str]:
    return {
        path.relative_to(destination).as_posix()
        for path in destination.rglob("*")
        if path.is_dir() and not path.is_symlink()
    }


def _destination_state(candidate: RegistrationCandidate) -> str:
    destination = candidate.destination_root
    if not destination.exists():
        return "absent"
    if destination.is_symlink() or not destination.is_dir():
        raise RegistrationError(
            f"destination conflicts with a non-directory or symlink: {destination}"
        )
    for relative in (
        Path("portrait"),
        Path("source/portrait"),
        Path("qa/portrait"),
        Path(PORTRAIT_EXCLUDED_FILE),
    ):
        if (destination / relative).exists() or (destination / relative).is_symlink():
            raise RegistrationError(
                f"destination portrait must remain absent: {destination / relative}"
            )
    expected = candidate.expected_records
    actual = _actual_destination_records(
        destination,
        allowed_sidecar_bases=_candidate_sidecar_bases(candidate),
    )
    expected_directories = _expected_directories(expected)
    actual_directories = _actual_directories(destination)
    directory_match = actual_directories == expected_directories
    if actual == expected and directory_match:
        return "exact"
    if actual == candidate.previous_expected_records and directory_match:
        return "previous_exact"
    if actual == candidate.legacy_expected_records and directory_match:
        return "legacy_exact"
    if actual != expected:
        expected_by_path = {record.path: record for record in expected}
        actual_by_path = {record.path: record for record in actual}
        missing = sorted(set(expected_by_path) - set(actual_by_path))
        extra = sorted(set(actual_by_path) - set(expected_by_path))
        changed = sorted(
            path
            for path in set(expected_by_path) & set(actual_by_path)
            if expected_by_path[path] != actual_by_path[path]
        )
        missing_directories = sorted(expected_directories - actual_directories)
        extra_directories = sorted(actual_directories - expected_directories)
        raise RegistrationError(
            f"destination drift refused for {candidate.spec.form_id}: "
            f"missing={missing} extra={extra} changed={changed} "
            f"missingDirectories={missing_directories} "
            f"extraDirectories={extra_directories}"
        )
    raise RegistrationError(
        f"unreachable destination classification for {candidate.spec.form_id}"
    )


def inspect_destination_state(
    candidates: Sequence[RegistrationCandidate],
) -> str:
    states = [_destination_state(candidate) for candidate in candidates]
    if all(state == "absent" for state in states):
        return "ready"
    if all(state == "exact" for state in states):
        return "already_registered"
    if all(state == "previous_exact" for state in states):
        return "upgrade_ready"
    if all(state == "legacy_exact" for state in states):
        return "upgrade_ready"
    raise RegistrationError(
        "dual-pet registration is in a mixed state; no partial continuation is allowed: "
        f"{states}"
    )


def _copy_candidate_to_stage(candidate: RegistrationCandidate, stage_root: Path) -> None:
    if stage_root.exists():
        raise RegistrationError(f"unique staging destination already exists: {stage_root}")
    stage_root.mkdir(parents=True)
    transformed = {item.path: item for item in candidate.transformations}
    for record in candidate.copied_records:
        source = candidate.source_root / record.path
        destination = stage_root / record.path
        destination.parent.mkdir(parents=True, exist_ok=True)
        if record.path in transformed:
            destination.write_bytes(transformed[record.path].payload)
        else:
            shutil.copy2(source, destination)
        if (
            destination.stat().st_size != record.size
            or _sha256_file(destination) != record.sha256
        ):
            raise RegistrationError(
                f"staging copy verification failed: {candidate.spec.form_id}/{record.path}"
            )
    manifest_path = stage_root / MANIFEST_RELATIVE
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_bytes(candidate.manifest_bytes)
    actual = _actual_destination_records(stage_root)
    if actual != candidate.expected_records:
        raise RegistrationError(
            f"staging exact verification failed: {candidate.spec.form_id}"
        )


def _rename_no_clobber(source: Path, destination: Path) -> None:
    if destination.exists() or destination.is_symlink():
        raise RegistrationError(f"destination appeared during installation: {destination}")
    os.rename(source, destination)


def _install_candidates(
    candidates: Sequence[RegistrationCandidate],
    destination_base: Path,
    *,
    rename_no_clobber: Callable[[Path, Path], None] = _rename_no_clobber,
) -> None:
    destination_base = _absolute_path(destination_base)
    _require_no_symlink_components(
        destination_base,
        label="destination base",
        allow_missing_tail=True,
    )
    destination_base.parent.mkdir(parents=True, exist_ok=True)
    if destination_base.is_symlink():
        raise RegistrationError(f"destination base may not be a symlink: {destination_base}")
    destination_base.mkdir(parents=True, exist_ok=True)
    stage_container = destination_base.parent / (
        f".{destination_base.name}.fusion-closed-registration-"
        f"{os.getpid()}-{secrets.token_hex(8)}"
    )
    try:
        stage_container.mkdir()
    except OSError as error:
        raise RegistrationError(
            f"cannot create unique registration staging directory: {error}"
        ) from error

    moved: list[tuple[Path, Path]] = []
    try:
        for candidate in candidates:
            _copy_candidate_to_stage(candidate, stage_container / candidate.spec.form_id)
        if inspect_destination_state(candidates) != "ready":
            raise RegistrationError("destination changed while staging the registration")
        for candidate in candidates:
            staged = stage_container / candidate.spec.form_id
            rename_no_clobber(staged, candidate.destination_root)
            moved.append((candidate.destination_root, staged))
        if inspect_destination_state(candidates) != "already_registered":
            raise RegistrationError("post-install exact verification failed")
    except Exception as error:
        rollback_errors: list[str] = []
        for destination, staged in reversed(moved):
            try:
                if staged.exists():
                    raise RegistrationError(f"rollback staging path already exists: {staged}")
                os.rename(destination, staged)
            except Exception as rollback_error:  # pragma: no cover - catastrophic filesystem fault
                rollback_errors.append(f"{destination}: {rollback_error}")
        if rollback_errors:
            raise RegistrationError(
                f"dual-pet registration failed and rollback was incomplete: {rollback_errors}"
            ) from error
        if isinstance(error, RegistrationError):
            raise
        raise RegistrationError(f"dual-pet registration failed: {error}") from error
    finally:
        if stage_container.exists():
            shutil.rmtree(stage_container)


def _records_digest(records: Sequence[FileRecord]) -> str:
    return _sha256_bytes(_json_bytes([record.json_value() for record in records]))


def _recovery_tree_evidence(root: Path) -> dict[str, Any]:
    evidence: dict[str, Any] = {
        "path": _display_path(root),
        "exists": root.exists() or root.is_symlink(),
    }
    if not evidence["exists"]:
        return evidence
    if root.is_symlink() or not root.is_dir():
        evidence["kind"] = "unsafe_non_directory"
        return evidence
    try:
        records = tuple(
            sorted(
                (
                    _record(root, path)
                    for path in _scan_safe_tree(root, label="recovery tree")
                ),
                key=lambda record: record.path,
            )
        )
    except RegistrationError as error:
        evidence["auditError"] = str(error)
        return evidence
    evidence.update(
        {
            "kind": "directory",
            "fileCount": len(records),
            "fileSetSha256": _records_digest(records),
        }
    )
    return evidence


def _write_recovery_receipt(path: Path, value: dict[str, Any]) -> str:
    payload = _json_bytes(value)
    temporary = path.with_name(
        f".{path.name}.tmp-{os.getpid()}-{secrets.token_hex(8)}"
    )
    try:
        with temporary.open("xb") as handle:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
        if path.read_bytes() != payload:
            raise RegistrationError(
                f"recovery receipt byte verification failed: {path}"
            )
    except (OSError, RegistrationError) as error:
        raise RegistrationError(
            f"cannot durably write recovery receipt {path}: {error}"
        ) from error
    finally:
        if temporary.exists():
            temporary.unlink()
    return _sha256_bytes(payload)


def _copy_legacy_backup(
    candidate: RegistrationCandidate,
    backup_root: Path,
    prior_expected_records: tuple[FileRecord, ...],
) -> None:
    if backup_root.exists() or backup_root.is_symlink():
        raise RegistrationError(f"recovery backup path already exists: {backup_root}")
    shutil.copytree(candidate.destination_root, backup_root, symlinks=False)
    actual = _actual_destination_records(
        backup_root,
        allowed_sidecar_bases=_candidate_sidecar_bases(candidate),
    )
    if actual != prior_expected_records:
        raise RegistrationError(
            f"recovery backup exact verification failed: {candidate.spec.form_id}"
        )
    if _actual_directories(backup_root) != _expected_directories(
        prior_expected_records
    ):
        raise RegistrationError(
            f"recovery backup directory verification failed: {candidate.spec.form_id}"
        )
    allowed_sidecar_bases = _candidate_sidecar_bases(candidate)
    source_sidecars = _generated_import_sidecar_records(
        candidate.destination_root,
        allowed_sidecar_bases=allowed_sidecar_bases,
    )
    backup_sidecars = _generated_import_sidecar_records(
        backup_root,
        allowed_sidecar_bases=allowed_sidecar_bases,
    )
    if backup_sidecars != source_sidecars:
        raise RegistrationError(
            f"recovery backup generated-sidecar verification failed: "
            f"{candidate.spec.form_id}"
        )


def _upgrade_receipt_form(
    candidate: RegistrationCandidate,
    *,
    backup_root: Path,
    original_root: Path,
    initial_sidecars: tuple[FileRecord, ...],
    prior_generation: str,
    prior_expected_records: tuple[FileRecord, ...],
    prior_manifest_bytes: bytes,
    include_transition_hashes: bool,
) -> dict[str, Any]:
    backup_path = backup_root / candidate.spec.form_id
    original_path = original_root / candidate.spec.form_id
    backup_evidence = _recovery_tree_evidence(backup_path)
    original_evidence = _recovery_tree_evidence(original_path)
    retained_locations: list[str] = []
    allowed_sidecar_bases = _candidate_sidecar_bases(candidate)
    for label, path in (
        ("backup", backup_path),
        ("moved_original", original_path),
    ):
        if not path.is_dir() or path.is_symlink():
            continue
        try:
            retained_sidecars = _generated_import_sidecar_records(
                path,
                allowed_sidecar_bases=allowed_sidecar_bases,
            )
        except RegistrationError:
            continue
        if retained_sidecars == initial_sidecars:
            retained_locations.append(label)
    result: dict[str, Any] = {
        "formId": candidate.spec.form_id,
        "priorGeneration": prior_generation,
        "retainedBackupRoot": _display_path(backup_path),
        "movedOriginalRoot": _display_path(original_path),
        "retainedInRecovery": bool(
            backup_evidence["exists"] or original_evidence["exists"]
        ),
        "recoveryRetention": {
            "backup": backup_evidence,
            "movedOriginal": original_evidence,
        },
        "generatedImportSidecars": _generated_import_sidecar_evidence(
            initial_sidecars,
            retained_locations=retained_locations,
        ),
    }
    if include_transition_hashes:
        result.update(
            {
                "priorFileSetSha256": _records_digest(prior_expected_records),
                "priorManifestSha256": _sha256_bytes(prior_manifest_bytes),
                "candidateFileSetSha256": _records_digest(
                    candidate.expected_records
                ),
                "candidateManifestSha256": _sha256_bytes(
                    candidate.manifest_bytes
                ),
            }
        )
    return result


def _upgrade_legacy_candidates(
    candidates: Sequence[RegistrationCandidate],
    *,
    rename_no_clobber: Callable[[Path, Path], None] = _rename_no_clobber,
) -> dict[str, Any]:
    recovery_base = _absolute_path(RECOVERY_BASE)
    _require_no_symlink_components(
        recovery_base,
        label="upgrade recovery base",
        allow_missing_tail=True,
    )
    recovery_base.mkdir(parents=True, exist_ok=True)
    recovery_root = recovery_base / (
        f"upgrade-{os.getpid()}-{secrets.token_hex(8)}"
    )
    recovery_root.mkdir()
    backup_root = recovery_root / "backup"
    new_root = recovery_root / "transaction/new"
    original_root = recovery_root / "transaction/originals"
    backup_root.mkdir(parents=True)
    new_root.mkdir(parents=True)
    original_root.mkdir(parents=True)

    moved_originals: list[tuple[Path, Path]] = []
    moved_candidates: list[tuple[Path, Path]] = []
    prior_by_form: dict[
        str,
        tuple[str, tuple[FileRecord, ...], bytes],
    ] = {}
    for candidate in candidates:
        destination_state = _destination_state(candidate)
        if destination_state == "previous_exact":
            prior_by_form[candidate.spec.form_id] = (
                "closed_registration_v1",
                candidate.previous_expected_records,
                candidate.previous_manifest_bytes,
            )
        elif destination_state == "legacy_exact":
            prior_by_form[candidate.spec.form_id] = (
                "isolated_source_legacy",
                candidate.legacy_expected_records,
                candidate.legacy_manifest_bytes,
            )
        else:
            raise RegistrationError(
                f"upgrade source is not an exact supported generation: "
                f"{candidate.spec.form_id}:{destination_state}"
            )
    prior_generations = {
        value[0] for value in prior_by_form.values()
    }
    if len(prior_generations) != 1:
        raise RegistrationError(
            "dual-pet upgrade source generations are mixed; refusing partial "
            f"continuation: {sorted(prior_generations)}"
        )
    generated_sidecars_by_form = {
        candidate.spec.form_id: _generated_import_sidecar_records(
            candidate.destination_root,
            allowed_sidecar_bases=_candidate_sidecar_bases(candidate),
        )
        for candidate in candidates
    }
    receipt_path = recovery_root / "upgrade-receipt.json"
    receipt: dict[str, Any] | None = None
    receipt_sha256: str | None = None
    try:
        for candidate in candidates:
            _prior_generation, prior_records, _prior_manifest = prior_by_form[
                candidate.spec.form_id
            ]
            _copy_legacy_backup(
                candidate,
                backup_root / candidate.spec.form_id,
                prior_records,
            )
            _copy_candidate_to_stage(
                candidate,
                new_root / candidate.spec.form_id,
            )
        if inspect_destination_state(candidates) != "upgrade_ready":
            raise RegistrationError(
                "legacy destinations changed while staging the atomic upgrade"
            )

        for candidate in candidates:
            destination = candidate.destination_root
            original = original_root / candidate.spec.form_id
            if original.exists() or original.is_symlink():
                raise RegistrationError(
                    f"unique recovery original path already exists: {original}"
                )
            os.rename(destination, original)
            moved_originals.append((original, destination))

        for candidate in candidates:
            staged = new_root / candidate.spec.form_id
            rename_no_clobber(staged, candidate.destination_root)
            moved_candidates.append((candidate.destination_root, staged))

        if inspect_destination_state(candidates) != "already_registered":
            raise RegistrationError("post-upgrade exact verification failed")
        receipt = {
            "schemaVersion": 1,
            "tool": TOOL_NAME,
            "operation": "legacy_closed_registration_atomic_upgrade",
            "status": "completed",
            "runtimeEnabled": False,
            "portraitCopied": False,
            "recoveryDirectory": _display_path(recovery_root),
            "forms": [
                _upgrade_receipt_form(
                    candidate,
                    backup_root=backup_root,
                    original_root=original_root,
                    initial_sidecars=generated_sidecars_by_form[
                        candidate.spec.form_id
                    ],
                    prior_generation=prior_by_form[
                        candidate.spec.form_id
                    ][0],
                    prior_expected_records=prior_by_form[
                        candidate.spec.form_id
                    ][1],
                    prior_manifest_bytes=prior_by_form[
                        candidate.spec.form_id
                    ][2],
                    include_transition_hashes=True,
                )
                for candidate in candidates
            ],
        }
        for form in receipt["forms"]:
            retention = form["recoveryRetention"]
            if not (
                retention["backup"].get("kind") == "directory"
                and retention["movedOriginal"].get("kind") == "directory"
            ):
                raise RegistrationError(
                    f"completed upgrade lacks both retained recovery roots: "
                    f"{form['formId']}"
                )
        receipt_sha256 = _write_recovery_receipt(receipt_path, receipt)
    except Exception as error:
        rollback_errors: list[str] = []
        for destination, staged in reversed(moved_candidates):
            try:
                if staged.exists() or staged.is_symlink():
                    raise RegistrationError(
                        f"candidate rollback path already exists: {staged}"
                    )
                os.rename(destination, staged)
            except Exception as rollback_error:  # pragma: no cover - catastrophic filesystem fault
                rollback_errors.append(f"new {destination}: {rollback_error}")
        for original, destination in reversed(moved_originals):
            try:
                if destination.exists() or destination.is_symlink():
                    raise RegistrationError(
                        f"legacy rollback destination already exists: {destination}"
                    )
                os.rename(original, destination)
            except Exception as rollback_error:  # pragma: no cover - catastrophic filesystem fault
                rollback_errors.append(f"legacy {destination}: {rollback_error}")
        failure_receipt = {
            "schemaVersion": 1,
            "tool": TOOL_NAME,
            "operation": "legacy_closed_registration_atomic_upgrade",
            "status": "rolled_back" if not rollback_errors else "rollback_incomplete",
            "runtimeEnabled": False,
            "portraitCopied": False,
            "error": str(error),
            "rollbackErrors": rollback_errors,
            "recoveryDirectory": _display_path(recovery_root),
            "forms": [
                _upgrade_receipt_form(
                    candidate,
                    backup_root=backup_root,
                    original_root=original_root,
                    initial_sidecars=generated_sidecars_by_form[
                        candidate.spec.form_id
                    ],
                    prior_generation=prior_by_form[
                        candidate.spec.form_id
                    ][0],
                    prior_expected_records=prior_by_form[
                        candidate.spec.form_id
                    ][1],
                    prior_manifest_bytes=prior_by_form[
                        candidate.spec.form_id
                    ][2],
                    include_transition_hashes=False,
                )
                for candidate in candidates
            ],
        }
        receipt_errors: list[str] = []
        try:
            _write_recovery_receipt(receipt_path, failure_receipt)
        except RegistrationError as receipt_error:
            receipt_errors.append(str(receipt_error))
        if rollback_errors:
            raise RegistrationError(
                "legacy dual-pet upgrade failed and rollback was incomplete; "
                f"recovery={recovery_root}; errors={rollback_errors}; "
                f"receiptErrors={receipt_errors}"
            ) from error
        raise RegistrationError(
            f"legacy dual-pet upgrade failed and was rolled back; "
            f"recovery={recovery_root}; receiptErrors={receipt_errors}: {error}"
        ) from error

    if receipt is None or receipt_sha256 is None:  # pragma: no cover - defensive
        raise RegistrationError("completed upgrade receipt state is unavailable")
    receipt["receiptPath"] = _display_path(receipt_path)
    receipt["receiptSha256"] = receipt_sha256
    return receipt


def run_registration(
    options: RegistrationOptions,
    *,
    rename_no_clobber: Callable[[Path, Path], None] = _rename_no_clobber,
) -> dict[str, Any]:
    candidates = prepare_registration(options)
    state = inspect_destination_state(candidates)
    recovery_receipt: dict[str, Any] | None = None
    if options.write and state == "ready":
        _install_candidates(
            candidates,
            options.destination_base,
            rename_no_clobber=rename_no_clobber,
        )
        state = "registered"
    elif options.write and state == "upgrade_ready":
        recovery_receipt = _upgrade_legacy_candidates(
            candidates,
            rename_no_clobber=rename_no_clobber,
        )
        state = "upgraded"
    result = {
        "status": "PASS",
        "mode": "write" if options.write else "check_only",
        "registrationState": state,
        "runtimeEnabled": False,
        "portraitStatus": "pending_formal_rebuild_and_owner_review",
        "forms": [
            {
                "formId": candidate.spec.form_id,
                "sourceRoot": _display_path(candidate.source_root),
                "destinationRoot": _display_path(candidate.destination_root),
                "battleBundleDigest": candidate.spec.battle_bundle_digest,
                "closedRegistrationManifestSha256": _sha256_bytes(
                    candidate.manifest_bytes
                ),
                "copiedFiles": len(candidate.copied_records),
                "ownerApprovedVisualFiles": len(candidate.owner_visual_records),
                "engineeringSupportFiles": len(candidate.engineering_records),
                "excludedPortraitFiles": len(candidate.excluded_portrait_records),
                "existingGeneratedImportSidecars": len(
                    _generated_import_sidecar_records(
                        candidate.destination_root,
                        allowed_sidecar_bases=_candidate_sidecar_bases(candidate),
                    )
                ),
            }
            for candidate in candidates
        ],
    }
    if recovery_receipt is not None:
        result["recovery"] = recovery_receipt
    return result


def _argument_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source-base",
        type=Path,
        default=REPO_ROOT / ".run/p1_4e_fusion_full_pack",
        help="Directory containing solar_crown/pet-root and moss_rampart/pet-root.",
    )
    parser.add_argument(
        "--destination-base",
        type=Path,
        default=REPO_ROOT / "client/godot/assets/pets",
        help="Production pet asset root. Catalogs are not edited.",
    )
    parser.add_argument(
        "--owner-decision",
        type=Path,
        default=OWNER_DECISION_PATH,
        help=(
            "Tracked frozen owner-decision JSON. A different path or hash is rejected "
            "even when supplied explicitly."
        ),
    )
    parser.add_argument(
        "--owner-video",
        type=Path,
        required=True,
        help="Existing Phase 371 merged 1x review MP4.",
    )
    parser.add_argument(
        "--write",
        action="store_true",
        help="Install both exact closed bundles atomically. Default is read-only validation.",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _argument_parser().parse_args(argv)
    try:
        result = run_registration(
            RegistrationOptions(
                source_base=args.source_base,
                destination_base=args.destination_base,
                owner_decision=args.owner_decision,
                owner_video=args.owner_video,
                write=args.write,
            )
        )
    except RegistrationError as error:
        print(
            json.dumps(
                {"status": "FAIL", "error": str(error)},
                ensure_ascii=False,
                indent=2,
            ),
            file=sys.stderr,
        )
        return 1
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
