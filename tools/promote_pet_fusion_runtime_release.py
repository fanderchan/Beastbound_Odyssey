#!/usr/bin/env python3
"""Plan or atomically apply the first Beastbound fusion runtime release.

The default mode is read-only and fail-closed.  It proves the current closed
baseline, checks that runtime approval JSON will survive Godot export, and
reports the exact remaining owner/evidence blockers.  ``--apply`` additionally
requires an immutable approval-input SHA, an explicit command-line acceptance,
trusted per-portrait decision digests already pinned by code review, and a
fully server-validated candidate.  The fusion catalog is installed last as the
commit point; any ordinary failure restores every prior byte and removes only
new files created by this transaction.

This tool does not create review videos, performance evidence, or owner
approval.  Those inputs must already exist as hash-bound repository evidence.
"""

from __future__ import annotations

import argparse
import base64
from contextlib import contextmanager
import copy
from dataclasses import dataclass
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
from types import ModuleType
from typing import Any, Callable, Mapping, Sequence


REPO_ROOT = Path(__file__).resolve().parents[1]
FUSION_CATALOG_PATH = Path("client/godot/data/pet_fusion_recipes.json")
ART_CATALOG_PATH = Path("client/godot/data/pet_art_catalog.json")
PRIOR_BODY_DECISION_PATH = Path(
    "client/godot/data/pet_fusion_visual_owner_decision_v1.json"
)
RUNTIME_OWNER_DECISION_PATH = Path(
    "client/godot/data/pet_fusion_runtime_release_owner_decision_v1.json"
)
RUNTIME_ATTESTATION_PATH = Path(
    "client/godot/data/pet_fusion_runtime_release_attestation_v1.json"
)
PORTRAIT_AUDITOR_PATH = Path("tools/audit_pet_portrait_catalog.py")
SERVER_ATTESTATION_MODULE_PATH = Path(
    "server/node/src/auth/pet-fusion-release-attestation.js"
)
APPROVAL_RECORD_TYPE = "beastbound_pet_fusion_runtime_release_input"
OWNER_ID = "project-owner:fander"
OWNER_DECISION_TYPE = "beastbound_pet_fusion_runtime_release_owner_decision"
OWNER_DECISION_ID = "pet_fusion_p1_4_runtime_release_v1"
ATTESTATION_TYPE = "beastbound_pet_fusion_runtime_release_attestation"
ATTESTATION_ID = "pet_fusion_p1_4_runtime_release_v1"
CATALOG_ID = "pet_fusion_recipes_v2"
PORTRAIT_DECISION_TYPE = "beastbound_pet_portrait_owner_approval"
APPROVED_PORTRAIT_CLAIM_LIMIT = (
    "project-directed generated portrait; deterministic checks prove source "
    "and processing integrity, while semantic independence and release "
    "approval are bound only to the trusted project-owner decision"
)
RELEASE_PRODUCTION_SCOPE = "formal_nonrideable_runtime_release"
RELEASE_NOTES = (
    "Identity, true-eight-direction world art, dedicated portrait, and the "
    "complete two-view battle matrix are owner-approved for the first "
    "non-rideable fusion runtime release."
)
RECIPE_IDS = (
    "emberhorn_solar_crown_fusion_v1",
    "emberhorn_moss_rampart_fusion_v1",
)
VALIDATION_KINDS = (
    "closed_asset_replay",
    "authoritative_three_pet_atomic_transaction",
    "idempotency_disconnect_conflict_rollback",
    "real_main_entry_and_performance",
)
APPROVED_SCOPES = (
    "dedicated_pet_portrait",
    "fusion_information_layout",
    "player_fusion_entry",
    "fusion_runtime_release",
)
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
BATTLE_ACTIONS = (
    "idle",
    "walk",
    "attack",
    "skill",
    "hurt",
    "defend",
    "dodge",
    "counter",
    "stagger",
    "knockaway",
    "down",
    "revive",
)
BATTLE_VIEW_MAPPING = {
    "enemy": {
        "view": "front_3quarter_sw",
        "flipH": True,
        "facing": "southeast",
    },
    "ally": {
        "view": "back_3quarter_ne",
        "flipH": True,
        "facing": "northwest",
    },
}
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
ISO_UTC_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")


@dataclass(frozen=True)
class FormSpec:
    form_id: str
    pet_root: Path
    battle_bundle_digest: str

    @property
    def metadata_path(self) -> Path:
        return self.pet_root / "action-bundle-meta.json"

    @property
    def portrait_metadata_path(self) -> Path:
        return self.pet_root / "portrait/portrait-meta.json"

    @property
    def portrait_decision_path(self) -> Path:
        return self.pet_root / "portrait/owner-decision.json"

    @property
    def portrait_ownership_path(self) -> Path:
        return self.pet_root / "portrait/source-and-ownership.md"

    @property
    def portrait_master_path(self) -> Path:
        return self.pet_root / "source/portrait/headshot-master-1024.png"

    @property
    def portrait_runtime_path(self) -> Path:
        return self.pet_root / "portrait/default.png"


FORM_SPECS = (
    FormSpec(
        form_id="emberhorn_fusion_solar_crown_fire7_wind3",
        pet_root=Path(
            "client/godot/assets/pets/"
            "emberhorn_fusion_solar_crown_fire7_wind3"
        ),
        battle_bundle_digest=(
            "5a4896f64614b4eceaad220071fdd80fe85909bfa78d67ffb0637090a71da2fc"
        ),
    ),
    FormSpec(
        form_id="emberhorn_fusion_moss_rampart_fire4_earth6",
        pet_root=Path(
            "client/godot/assets/pets/"
            "emberhorn_fusion_moss_rampart_fire4_earth6"
        ),
        battle_bundle_digest=(
            "27c3a0784ab6a2e55a3f3acc6624a722a8b4240bbb04bcd0ffbc53a52d524107"
        ),
    ),
)


class PromotionError(RuntimeError):
    """A fail-closed fusion release promotion error."""


@dataclass(frozen=True)
class Mutation:
    repo_path: Path
    original_bytes: bytes | None
    candidate_bytes: bytes

    def summary(self) -> dict[str, Any]:
        return {
            "path": self.repo_path.as_posix(),
            "operation": "replace" if self.original_bytes is not None else "create",
            "originalSha256": (
                _sha256_bytes(self.original_bytes)
                if self.original_bytes is not None
                else None
            ),
            "candidateSha256": _sha256_bytes(self.candidate_bytes),
        }


@dataclass(frozen=True)
class PromotionCandidate:
    repo_root: Path
    approval_input_path: Path
    approval_input_sha256: str
    mutations: tuple[Mutation, ...]
    portrait_decision_sha256_by_form: Mapping[str, str]
    runtime_owner_decision_sha256: str
    runtime_attestation_sha256: str
    blockers: tuple[str, ...]

    def summary(self) -> dict[str, Any]:
        return {
            "approvalInput": {
                "path": self.approval_input_path.as_posix(),
                "sha256": self.approval_input_sha256,
            },
            "portraitDecisionSha256ByForm": dict(
                self.portrait_decision_sha256_by_form
            ),
            "runtimeOwnerDecisionSha256": self.runtime_owner_decision_sha256,
            "runtimeAttestationSha256": self.runtime_attestation_sha256,
            "mutations": [mutation.summary() for mutation in self.mutations],
            "blockers": list(self.blockers),
            "ready": not self.blockers,
        }


def _sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    try:
        with path.open("rb") as stream:
            for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(chunk)
    except OSError as error:
        raise PromotionError(f"cannot read file {path}: {error}") from error
    return digest.hexdigest()


def _json_bytes(value: Any) -> bytes:
    return (
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=False) + "\n"
    ).encode("utf-8")


def _read_json(path: Path, *, label: str) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise PromotionError(f"cannot read {label} {path}: {error}") from error
    if not isinstance(value, dict):
        raise PromotionError(f"{label} must be a JSON object: {path}")
    return value


def _exact_keys(value: Mapping[str, Any], expected: set[str], *, label: str) -> None:
    actual = set(value)
    if actual != expected:
        raise PromotionError(
            f"{label} fields are not exact; "
            f"missing={sorted(expected - actual)} extra={sorted(actual - expected)}"
        )


def _safe_repo_path(repo_root: Path, value: Any, *, label: str) -> tuple[Path, Path]:
    if not isinstance(value, str):
        raise PromotionError(f"{label} must be a repository-relative string")
    normalized = value.strip().replace("\\", "/")
    logical = Path(normalized)
    if (
        not normalized
        or logical.is_absolute()
        or ".." in logical.parts
        or ":" in normalized
    ):
        raise PromotionError(f"{label} is not a safe repository-relative path")
    root = repo_root.resolve()
    candidate = root / logical
    try:
        candidate.resolve(strict=False).relative_to(root)
    except ValueError as error:
        raise PromotionError(f"{label} escapes repository root") from error
    current = root
    for part in logical.parts:
        current = current / part
        if current.is_symlink():
            raise PromotionError(f"{label} traverses a symbolic link: {logical}")
    return logical, candidate


def _reference(
    repo_root: Path,
    value: Any,
    *,
    label: str,
    required_prefix: str | None = None,
) -> dict[str, str]:
    if not isinstance(value, dict):
        raise PromotionError(f"{label} must be a path/SHA-256 object")
    _exact_keys(value, {"path", "sha256"}, label=label)
    logical, path = _safe_repo_path(repo_root, value.get("path"), label=f"{label}.path")
    if required_prefix is not None and not logical.as_posix().startswith(required_prefix):
        raise PromotionError(f"{label}.path must start with {required_prefix}")
    expected = str(value.get("sha256", "")).strip().lower()
    if SHA256_RE.fullmatch(expected) is None:
        raise PromotionError(f"{label}.sha256 must be lowercase SHA-256")
    if not path.is_file() or path.stat().st_size <= 0:
        raise PromotionError(f"{label}.path is missing or empty: {logical}")
    actual = _sha256_file(path)
    if actual != expected:
        raise PromotionError(
            f"{label}.sha256 drift: expected={expected} actual={actual}"
        )
    return {"path": logical.as_posix(), "sha256": actual}


def _repo_reference(repo_root: Path, repo_path: Path) -> dict[str, str]:
    path = repo_root / repo_path
    if not path.is_file() or path.is_symlink():
        raise PromotionError(f"release dependency is missing or unsafe: {repo_path}")
    return {"path": repo_path.as_posix(), "sha256": _sha256_file(path)}


def _validate_approval_input(
    repo_root: Path,
    approval_input_path: Path,
) -> tuple[dict[str, Any], str]:
    logical, path = _safe_repo_path(
        repo_root,
        approval_input_path.as_posix(),
        label="approval input path",
    )
    document = _read_json(path, label="approval input")
    _exact_keys(
        document,
        {
            "schemaVersion",
            "recordType",
            "reviewer",
            "decision",
            "recordedDecisionText",
            "approvedAtUtc",
            "mainOwnerReview",
            "phaseRecord",
            "portraitEvidence",
            "validationEvidence",
        },
        label="approval input",
    )
    if (
        document.get("schemaVersion") != 1
        or document.get("recordType") != APPROVAL_RECORD_TYPE
        or document.get("reviewer") != OWNER_ID
        or document.get("decision") != "approved"
        or not isinstance(document.get("recordedDecisionText"), str)
        or not document["recordedDecisionText"].strip()
        or ISO_UTC_RE.fullmatch(str(document.get("approvedAtUtc", ""))) is None
    ):
        raise PromotionError("approval input does not contain exact owner approval")
    main_review = _reference(
        repo_root,
        document.get("mainOwnerReview"),
        label="approval input mainOwnerReview",
        required_prefix="docs/",
    )
    phase_record = _reference(
        repo_root,
        document.get("phaseRecord"),
        label="approval input phaseRecord",
        required_prefix="docs/",
    )
    portrait_evidence_raw = document.get("portraitEvidence")
    if not isinstance(portrait_evidence_raw, list):
        raise PromotionError("approval input portraitEvidence must be an array")
    portrait_evidence = [
        _reference(
            repo_root,
            value,
            label=f"approval input portraitEvidence[{index}]",
            required_prefix="docs/",
        )
        for index, value in enumerate(portrait_evidence_raw)
    ]
    if portrait_evidence != [main_review, phase_record]:
        raise PromotionError(
            "portraitEvidence must be exactly [mainOwnerReview, phaseRecord]"
        )
    validation_raw = document.get("validationEvidence")
    if not isinstance(validation_raw, list) or len(validation_raw) != len(VALIDATION_KINDS):
        raise PromotionError("approval input must bind exactly four validation records")
    validation: list[dict[str, str]] = []
    for index, expected_kind in enumerate(VALIDATION_KINDS):
        raw = validation_raw[index]
        if not isinstance(raw, dict):
            raise PromotionError(f"validationEvidence[{index}] must be an object")
        _exact_keys(raw, {"kind", "status", "path", "sha256"}, label=f"validationEvidence[{index}]")
        if raw.get("kind") != expected_kind or raw.get("status") != "passed":
            raise PromotionError(
                f"validationEvidence[{index}] does not match {expected_kind}/passed"
            )
        reference = _reference(
            repo_root,
            {"path": raw.get("path"), "sha256": raw.get("sha256")},
            label=f"validationEvidence[{index}]",
            required_prefix="docs/",
        )
        validation.append(
            {"kind": expected_kind, "status": "passed", **reference}
        )
    normalized = copy.deepcopy(document)
    normalized["mainOwnerReview"] = main_review
    normalized["phaseRecord"] = phase_record
    normalized["portraitEvidence"] = portrait_evidence
    normalized["validationEvidence"] = validation
    return normalized, _sha256_file(repo_root / logical)


def _load_portrait_auditor(repo_root: Path) -> ModuleType:
    path = repo_root / PORTRAIT_AUDITOR_PATH
    spec = importlib.util.spec_from_file_location(
        "_beastbound_portrait_auditor_for_fusion_promotion",
        path,
    )
    if spec is None or spec.loader is None:
        raise PromotionError(f"cannot load portrait auditor: {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    try:
        spec.loader.exec_module(module)
    except Exception as error:
        sys.modules.pop(spec.name, None)
        raise PromotionError(f"cannot load portrait auditor: {error}") from error
    return module


def _trusted_portrait_hashes(repo_root: Path) -> dict[str, frozenset[str]]:
    module = _load_portrait_auditor(repo_root)
    value = getattr(module, "TRUSTED_OWNER_DECISION_SHA256_BY_FORM", None)
    if not isinstance(value, dict):
        raise PromotionError("portrait auditor trusted owner digest map is missing")
    return {
        str(form_id): frozenset(str(digest).lower() for digest in digests)
        for form_id, digests in value.items()
    }


def _assert_closed_baseline(repo_root: Path) -> dict[str, Any]:
    try:
        from verify_pet_fusion_closed_release import verify_closed_state
    except ModuleNotFoundError:
        tools_path = str(repo_root / "tools")
        if tools_path not in sys.path:
            sys.path.insert(0, tools_path)
        from verify_pet_fusion_closed_release import verify_closed_state

    try:
        report = verify_closed_state(repo_root)
    except Exception as error:
        raise PromotionError(f"closed production baseline failed: {error}") from error
    expected = {
        "status": "PASS",
        "closedRegistrationVerified": True,
        "releaseApproved": False,
        "runtimeEnabled": False,
        "playerEntryOpened": False,
        "portraitReleaseGate": False,
        "gitIndexAuthorityVerified": True,
    }
    for key, value in expected.items():
        if report.get(key) != value:
            raise PromotionError(
                f"closed production baseline {key} drifted: {report.get(key)!r}"
            )
    return report


def _is_under_gdignore(repo_root: Path, repo_path: Path) -> bool:
    current = (repo_root / repo_path).parent
    root = repo_root.resolve()
    while current.resolve() != root:
        if (current / ".gdignore").is_file():
            return True
        current = current.parent
    return False


def validate_export_contract(repo_root: Path) -> dict[str, Any]:
    repo_root = repo_root.resolve()
    decision_paths: list[str] = []
    for spec in FORM_SPECS:
        path = spec.portrait_decision_path
        if path.parts[-2:] != ("portrait", "owner-decision.json"):
            raise PromotionError(
                f"portrait decision is not in the runtime portrait directory: {path}"
            )
        if _is_under_gdignore(repo_root, path):
            raise PromotionError(f"portrait decision is hidden by .gdignore: {path}")
        decision_paths.append(path.as_posix())
    preset_path = repo_root / "client/godot/export_presets.cfg"
    preset_text = preset_path.read_text(encoding="utf-8")
    for preset_name in ("macOS", "Windows Desktop"):
        marker = f'name="{preset_name}"'
        start = preset_text.find(marker)
        if start < 0:
            raise PromotionError(f"missing PC export preset: {preset_name}")
        next_preset = preset_text.find("\n[preset.", start + len(marker))
        block = preset_text[start : next_preset if next_preset >= 0 else None]
        if 'export_filter="all_resources"' not in block:
            raise PromotionError(f"{preset_name} does not export all resources")
        if 'exclude_filter=""' not in block:
            raise PromotionError(f"{preset_name} has an unexpected export exclusion")
    return {
        "status": "passed",
        "portraitDecisionPaths": decision_paths,
        "pcPresets": ["macOS", "Windows Desktop"],
    }


def _replace_pending_ownership(value: bytes, *, form_id: str) -> bytes:
    try:
        text = value.decode("utf-8")
    except UnicodeDecodeError as error:
        raise PromotionError(f"{form_id} portrait ownership is not UTF-8") from error
    pending = "owner review status: `owner_review_pending`"
    approved = "owner review status: `approved`"
    if text.count(pending) != 1 or approved in text:
        raise PromotionError(f"{form_id} portrait ownership is not exact pending baseline")
    return text.replace(pending, approved, 1).encode("utf-8")


def _find_form(catalog: dict[str, Any], form_id: str) -> dict[str, Any]:
    forms = catalog.get("forms")
    if not isinstance(forms, list):
        raise PromotionError("pet art catalog forms must be an array")
    matches = [
        value
        for value in forms
        if isinstance(value, dict) and value.get("formId") == form_id
    ]
    if len(matches) != 1:
        raise PromotionError(f"pet art catalog must contain exactly one {form_id}")
    return matches[0]


def _assert_form_closed(
    repo_root: Path,
    spec: FormSpec,
    art_form: dict[str, Any],
    metadata: dict[str, Any],
    portrait: dict[str, Any],
) -> None:
    if (
        art_form.get("status") != "in_production"
        or art_form.get("runtimeEnabled") is not False
        or art_form.get("rideableTarget") is not False
        or metadata.get("artStatus") != "in_production"
        or metadata.get("ownerReviewStatus") != "pending"
        or metadata.get("runtimeEnabled") is not False
        or metadata.get("releaseAttestation") is not None
        or metadata.get("riding") is not None
    ):
        raise PromotionError(f"{spec.form_id} is not the exact closed non-rideable baseline")
    world = metadata.get("worldVisual")
    battle = metadata.get("battleVisual")
    identity = metadata.get("identity")
    actions = metadata.get("actions")
    world_actions = world.get("actions") if isinstance(world, dict) else None
    world_idle = world_actions.get("idle") if isinstance(world_actions, dict) else None
    world_walk = world_actions.get("walk") if isinstance(world_actions, dict) else None
    owner_review = portrait.get("ownerReview")
    if (
        metadata.get("productionScope")
        != "formal_battle_two_view_owner_review_pending"
        or metadata.get("keyPoseReviewStatus") != "owner_review_pending"
        or not isinstance(identity, dict)
        or identity.get("status") != "self_review_passed_owner_pending"
        or not isinstance(actions, dict)
        or tuple(actions) != BATTLE_ACTIONS
        or any(
            not isinstance(action, dict)
            or action.get("status") != "owner_review_pending"
            for action in actions.values()
        )
        or metadata.get("battleViewMapping") != BATTLE_VIEW_MAPPING
        or not isinstance(world, dict)
        or world.get("status") != "owner_review_pending"
        or world.get("runtimeEnabled") is not None
        or not isinstance(world_actions, dict)
        or not isinstance(world_idle, dict)
        or world_idle.get("status") != "owner_review_pending"
        or not isinstance(world_walk, dict)
        or world_walk.get("status") != "owner_review_pending"
        or not isinstance(battle, dict)
        or battle.get("status") != "owner_review_pending"
        or battle.get("runtimeEnabled") is not False
        or battle.get("actions") != list(BATTLE_ACTIONS)
        or battle.get("battleViewMapping") != BATTLE_VIEW_MAPPING
        or battle.get("bundleDigest") != spec.battle_bundle_digest
        or not isinstance(owner_review, dict)
        or owner_review != {
            "required": True,
            "status": "owner_review_pending",
            "evidencePaths": [],
        }
        or portrait.get("independentAuthorshipClaimTrust") != "untrusted_claim"
        or portrait.get("semanticIndependenceVerified") is not False
        or portrait.get("releaseGate") is not False
    ):
        raise PromotionError(f"{spec.form_id} visual/portrait lifecycle is not closed")
    decision_path = repo_root / spec.portrait_decision_path
    if decision_path.exists() or decision_path.is_symlink():
        raise PromotionError(f"{spec.form_id} already contains a portrait owner decision")


def _mutation(repo_root: Path, repo_path: Path, candidate_bytes: bytes) -> Mutation:
    path = repo_root / repo_path
    original = path.read_bytes() if path.is_file() else None
    if path.exists() and original is None:
        raise PromotionError(f"mutation target is not a regular file: {repo_path}")
    return Mutation(repo_path, original, candidate_bytes)


def _build_candidate_documents(
    repo_root: Path,
    approval: dict[str, Any],
) -> tuple[list[Mutation], dict[str, str], str, str]:
    fusion_catalog = _read_json(repo_root / FUSION_CATALOG_PATH, label="fusion catalog")
    art_catalog = _read_json(repo_root / ART_CATALOG_PATH, label="pet art catalog")
    if fusion_catalog.get("runtimeEnabled") is not False:
        raise PromotionError("fusion catalog must remain closed before promotion")
    recipes = fusion_catalog.get("recipes")
    recipe_ids = [
        recipe.get("recipeId")
        for recipe in recipes
        if isinstance(recipe, dict)
    ] if isinstance(recipes, list) else []
    if not isinstance(recipes, list) or recipe_ids != list(RECIPE_IDS):
        raise PromotionError("fusion catalog does not contain the exact two release recipes")
    if [recipe.get("targetFormId") for recipe in recipes] != [spec.form_id for spec in FORM_SPECS]:
        raise PromotionError("fusion catalog target form order drifted")
    for recipe in recipes:
        if (
            not isinstance(recipe, dict)
            or not isinstance(recipe.get("assetGate"), dict)
            or recipe["assetGate"].get("status") != "formal"
            or not isinstance(recipe.get("result"), dict)
            or recipe["result"].get("rideable") is not False
        ):
            raise PromotionError("release recipe is not formal and non-rideable")

    promoted_fusion_catalog = copy.deepcopy(fusion_catalog)
    promoted_fusion_catalog["runtimeEnabled"] = True
    fusion_catalog_bytes = _json_bytes(promoted_fusion_catalog)

    promoted_art_catalog = copy.deepcopy(art_catalog)
    source_form_data: list[tuple[FormSpec, dict[str, Any], dict[str, Any], bytes]] = []
    portrait_decision_bytes: dict[str, bytes] = {}
    portrait_metadata_bytes: dict[str, bytes] = {}
    ownership_bytes: dict[str, bytes] = {}
    for spec in FORM_SPECS:
        art_form = _find_form(art_catalog, spec.form_id)
        metadata = _read_json(repo_root / spec.metadata_path, label=f"{spec.form_id} metadata")
        portrait = _read_json(
            repo_root / spec.portrait_metadata_path,
            label=f"{spec.form_id} portrait metadata",
        )
        ownership_original = (repo_root / spec.portrait_ownership_path).read_bytes()
        _assert_form_closed(repo_root, spec, art_form, metadata, portrait)
        promoted_form = _find_form(promoted_art_catalog, spec.form_id)
        promoted_form["status"] = "approved"
        promoted_form["runtimeEnabled"] = True

        promoted_ownership = _replace_pending_ownership(
            ownership_original,
            form_id=spec.form_id,
        )
        ownership_bytes[spec.form_id] = promoted_ownership
        master_reference = _repo_reference(repo_root, spec.portrait_master_path)
        runtime_reference = _repo_reference(repo_root, spec.portrait_runtime_path)
        ownership_reference = {
            "path": spec.portrait_ownership_path.as_posix(),
            "sha256": _sha256_bytes(promoted_ownership),
        }
        portrait_decision = {
            "schemaVersion": 2,
            "decisionType": PORTRAIT_DECISION_TYPE,
            "ownerId": OWNER_ID,
            "decision": "approved",
            "subject": {
                "kind": "shared_dedicated_headshot_v1",
                "formId": spec.form_id,
                "petRoot": spec.pet_root.as_posix(),
                "master": master_reference,
                "runtime": runtime_reference,
                "ownership": ownership_reference,
            },
            "acceptedEvidence": copy.deepcopy(approval["portraitEvidence"]),
            "reviewedAt": approval["approvedAtUtc"],
        }
        decision_bytes = _json_bytes(portrait_decision)
        portrait_decision_bytes[spec.form_id] = decision_bytes
        decision_reference = {
            "path": spec.portrait_decision_path.as_posix(),
            "sha256": _sha256_bytes(decision_bytes),
        }
        promoted_portrait = copy.deepcopy(portrait)
        promoted_portrait["independentAuthorshipClaimTrust"] = "owner_verified"
        promoted_portrait["semanticIndependenceVerified"] = True
        promoted_portrait["releaseGate"] = True
        promoted_portrait["claimLimit"] = APPROVED_PORTRAIT_CLAIM_LIMIT
        if not isinstance(promoted_portrait.get("ownership"), dict):
            raise PromotionError(f"{spec.form_id} portrait ownership reference is missing")
        promoted_portrait["ownership"]["sha256"] = ownership_reference["sha256"]
        promoted_portrait["ownerReview"] = {
            "required": True,
            "status": "approved",
            "evidence": copy.deepcopy(approval["portraitEvidence"]),
            "decision": decision_reference,
        }
        portrait_metadata_bytes[spec.form_id] = _json_bytes(promoted_portrait)
        source_form_data.append((spec, metadata, portrait, ownership_original))

    art_catalog_bytes = _json_bytes(promoted_art_catalog)
    owner_decision = {
        "schemaVersion": 1,
        "decisionType": OWNER_DECISION_TYPE,
        "decisionId": OWNER_DECISION_ID,
        "roadmapItem": "P1.4",
        "decision": "approved",
        "reviewer": OWNER_ID,
        "recordedDecisionText": approval["recordedDecisionText"].strip(),
        "ownerReviewStatus": "approved",
        "releaseApproved": True,
        "runtimeEnabled": True,
        "playerEntryOpened": True,
        "approvedAtUtc": approval["approvedAtUtc"],
        "catalogId": CATALOG_ID,
        "recipeIds": list(RECIPE_IDS),
        "targetFormIds": [spec.form_id for spec in FORM_SPECS],
        "nonRideableTargetFormIds": [spec.form_id for spec in FORM_SPECS],
        "approvedScopes": list(APPROVED_SCOPES),
        "evidence": {
            "mainOwnerReview": copy.deepcopy(approval["mainOwnerReview"]),
            "phaseRecord": copy.deepcopy(approval["phaseRecord"]),
        },
    }
    owner_decision_bytes = _json_bytes(owner_decision)
    owner_decision_reference = {
        "path": RUNTIME_OWNER_DECISION_PATH.as_posix(),
        "sha256": _sha256_bytes(owner_decision_bytes),
    }
    attestation = {
        "schemaVersion": 1,
        "attestationType": ATTESTATION_TYPE,
        "attestationId": ATTESTATION_ID,
        "status": "approved",
        "ownerReviewStatus": "approved",
        "releaseApproved": True,
        "runtimeEnabled": True,
        "playerEntryOpened": True,
        "approvedAtUtc": approval["approvedAtUtc"],
        "ownerDecision": owner_decision_reference,
        "priorBodyVisualDecision": _repo_reference(repo_root, PRIOR_BODY_DECISION_PATH),
        "catalog": {
            "path": FUSION_CATALOG_PATH.as_posix(),
            "sha256": _sha256_bytes(fusion_catalog_bytes),
        },
        "recipeIds": list(RECIPE_IDS),
        "targetFormIds": [spec.form_id for spec in FORM_SPECS],
        "forms": [
            {
                "formId": spec.form_id,
                "petMetadataPath": spec.metadata_path.as_posix(),
                "portraitMetadata": {
                    "path": spec.portrait_metadata_path.as_posix(),
                    "sha256": _sha256_bytes(portrait_metadata_bytes[spec.form_id]),
                },
                "battleBundleDigest": spec.battle_bundle_digest,
            }
            for spec in FORM_SPECS
        ],
        "validationEvidence": copy.deepcopy(approval["validationEvidence"]),
        "expectedLifecycle": {
            "artStatus": "approved",
            "ownerReviewStatus": "approved",
            "releaseApproved": True,
            "runtimeEnabled": True,
            "playerEntryOpened": True,
            "resultRideable": False,
            "petWorldRuntimeEnabled": True,
            "petBattleRuntimeEnabled": True,
            "portraitSemanticIndependenceVerified": True,
            "portraitReleaseGate": True,
        },
    }
    attestation_bytes = _json_bytes(attestation)
    attestation_sha = _sha256_bytes(attestation_bytes)
    attestation_reference = {
        "path": RUNTIME_ATTESTATION_PATH.as_posix(),
        "sha256": attestation_sha,
    }

    metadata_bytes: dict[str, bytes] = {}
    for spec, metadata, _portrait, _ownership_original in source_form_data:
        promoted = copy.deepcopy(metadata)
        promoted["artStatus"] = "approved"
        promoted["productionScope"] = RELEASE_PRODUCTION_SCOPE
        promoted["ownerReviewStatus"] = "approved"
        promoted["runtimeEnabled"] = True
        promoted["releaseAttestation"] = copy.deepcopy(attestation_reference)
        promoted["riding"] = None
        promoted["keyPoseReviewStatus"] = "approved"
        promoted["notes"] = RELEASE_NOTES
        identity = promoted.get("identity")
        if not isinstance(identity, dict):
            raise PromotionError(f"{spec.form_id} identity metadata is missing")
        identity["status"] = "approved"
        actions = promoted.get("actions")
        if not isinstance(actions, dict):
            raise PromotionError(f"{spec.form_id} actions are missing")
        for action in actions.values():
            if isinstance(action, dict) and action.get("status") == "owner_review_pending":
                action["status"] = "approved"
        world = promoted.get("worldVisual")
        battle = promoted.get("battleVisual")
        if not isinstance(world, dict) or not isinstance(battle, dict):
            raise PromotionError(f"{spec.form_id} world/battle visual metadata is missing")
        world["status"] = "approved"
        world["runtimeEnabled"] = True
        world_actions = world.get("actions")
        if isinstance(world_actions, dict):
            for action in world_actions.values():
                if isinstance(action, dict) and action.get("status") == "owner_review_pending":
                    action["status"] = "approved"
        battle["status"] = "approved"
        battle["runtimeEnabled"] = True
        metadata_bytes[spec.form_id] = _json_bytes(promoted)

    mutations: list[Mutation] = []
    for spec in FORM_SPECS:
        mutations.append(
            _mutation(
                repo_root,
                spec.portrait_decision_path,
                portrait_decision_bytes[spec.form_id],
            )
        )
    mutations.append(
        _mutation(repo_root, RUNTIME_OWNER_DECISION_PATH, owner_decision_bytes)
    )
    mutations.append(
        _mutation(repo_root, RUNTIME_ATTESTATION_PATH, attestation_bytes)
    )
    for spec in FORM_SPECS:
        mutations.extend(
            (
                _mutation(
                    repo_root,
                    spec.portrait_ownership_path,
                    ownership_bytes[spec.form_id],
                ),
                _mutation(
                    repo_root,
                    spec.portrait_metadata_path,
                    portrait_metadata_bytes[spec.form_id],
                ),
                _mutation(
                    repo_root,
                    spec.metadata_path,
                    metadata_bytes[spec.form_id],
                ),
            )
        )
    mutations.append(_mutation(repo_root, ART_CATALOG_PATH, art_catalog_bytes))
    # Commit point: normal player fusion stays closed until every dependency is
    # installed.  Rollback traverses this list in reverse, closing it first.
    mutations.append(_mutation(repo_root, FUSION_CATALOG_PATH, fusion_catalog_bytes))
    return (
        mutations,
        {
            spec.form_id: _sha256_bytes(portrait_decision_bytes[spec.form_id])
            for spec in FORM_SPECS
        },
        _sha256_bytes(owner_decision_bytes),
        attestation_sha,
    )


def _candidate_overrides(candidate: PromotionCandidate) -> dict[str, str]:
    return {
        mutation.repo_path.as_posix(): base64.b64encode(
            mutation.candidate_bytes
        ).decode("ascii")
        for mutation in candidate.mutations
    }


def validate_server_candidate(candidate: PromotionCandidate) -> dict[str, Any]:
    repo_root = candidate.repo_root.resolve()
    module_path = repo_root / SERVER_ATTESTATION_MODULE_PATH
    node_source = f"""
const fs = require('node:fs');
const path = require('node:path');
const mod = require({json.dumps(str(module_path))});
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const repoRoot = path.resolve(input.repoRoot);
const overrides = input.overrides;
function readFile(filePath) {{
  const resolved = path.resolve(String(filePath));
  const relative = path.relative(repoRoot, resolved).split(path.sep).join('/');
  if (Object.prototype.hasOwnProperty.call(overrides, relative)) {{
    return Buffer.from(overrides[relative], 'base64');
  }}
  return fs.readFileSync(resolved);
}}
const catalogPath = path.join(repoRoot, mod.DEFAULT_CATALOG_REPO_PATH);
const catalog = JSON.parse(readFile(catalogPath).toString('utf8'));
const result = mod.loadPetFusionReleaseAttestation({{
  repoRoot,
  attestationPath: path.join(repoRoot, mod.DEFAULT_ATTESTATION_REPO_PATH),
  expectedSha256: input.attestationSha256,
  expectedCatalogDocument: catalog,
  expectedCatalogPath: catalogPath,
  readFile,
}});
process.stdout.write(JSON.stringify({{
  releaseApproved: result.releaseApproved,
  runtimeEnabled: result.runtimeEnabled,
  playerEntryOpened: result.playerEntryOpened,
  recipeIds: result.recipeIds,
  targetFormIds: result.targetFormIds,
  validationKinds: result.validationKinds,
  attestationSha256: result.attestationSha256,
}}));
"""
    payload = {
        "repoRoot": str(repo_root),
        "overrides": _candidate_overrides(candidate),
        "attestationSha256": candidate.runtime_attestation_sha256,
    }
    try:
        completed = subprocess.run(
            ["node", "-e", node_source],
            input=json.dumps(payload),
            text=True,
            capture_output=True,
            cwd=repo_root,
            timeout=60,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        raise PromotionError(f"server candidate validation could not run: {error}") from error
    if completed.returncode != 0:
        detail = (completed.stderr or completed.stdout).strip()
        raise PromotionError(f"server candidate validation failed: {detail}")
    try:
        result = json.loads(completed.stdout)
    except json.JSONDecodeError as error:
        raise PromotionError("server candidate validation returned invalid JSON") from error
    if result != {
        "releaseApproved": True,
        "runtimeEnabled": True,
        "playerEntryOpened": True,
        "recipeIds": list(RECIPE_IDS),
        "targetFormIds": [spec.form_id for spec in FORM_SPECS],
        "validationKinds": list(VALIDATION_KINDS),
        "attestationSha256": candidate.runtime_attestation_sha256,
    }:
        raise PromotionError(f"server candidate summary drifted: {result!r}")
    return result


def prepare_candidate(
    repo_root: Path,
    approval_input_path: Path,
    *,
    trusted_hashes: Mapping[str, frozenset[str]] | None = None,
    verify_closed: bool = True,
    validate_server: bool = True,
) -> PromotionCandidate:
    repo_root = repo_root.resolve()
    validate_export_contract(repo_root)
    if verify_closed:
        _assert_closed_baseline(repo_root)
    approval, approval_sha = _validate_approval_input(repo_root, approval_input_path)
    mutations, portrait_hashes, owner_sha, attestation_sha = _build_candidate_documents(
        repo_root,
        approval,
    )
    actual_trusted = (
        dict(trusted_hashes)
        if trusted_hashes is not None
        else _trusted_portrait_hashes(repo_root)
    )
    blockers = tuple(
        f"trusted portrait owner digest is not pinned: {form_id}={digest}"
        for form_id, digest in portrait_hashes.items()
        if digest not in actual_trusted.get(form_id, frozenset())
    )
    candidate = PromotionCandidate(
        repo_root=repo_root,
        approval_input_path=approval_input_path,
        approval_input_sha256=approval_sha,
        mutations=tuple(mutations),
        portrait_decision_sha256_by_form=portrait_hashes,
        runtime_owner_decision_sha256=owner_sha,
        runtime_attestation_sha256=attestation_sha,
        blockers=blockers,
    )
    if validate_server:
        validate_server_candidate(candidate)
    return candidate


def check_readiness(
    repo_root: Path,
    approval_input_path: Path | None = None,
) -> dict[str, Any]:
    repo_root = repo_root.resolve()
    export = validate_export_contract(repo_root)
    closed = _assert_closed_baseline(repo_root)
    if approval_input_path is None:
        trusted = _trusted_portrait_hashes(repo_root)
        blockers = ["missing explicit owner approval input"]
        for spec in FORM_SPECS:
            if not trusted.get(spec.form_id):
                blockers.append(
                    f"trusted portrait owner digest is not pinned: {spec.form_id}"
                )
        return {
            "mode": "check",
            "status": "blocked",
            "productionClosed": True,
            "closedBaseline": {
                "status": closed.get("status"),
                "formsVerified": closed.get("summary", {}).get("formsVerified"),
                "copiedFilesVerified": closed.get("summary", {}).get("copiedFilesVerified"),
                "portraitFilesVerified": closed.get("summary", {}).get("portraitFilesVerified"),
            },
            "exportContract": export,
            "blockers": blockers,
        }
    candidate = prepare_candidate(
        repo_root,
        approval_input_path,
        verify_closed=False,
    )
    return {
        "mode": "check",
        "status": "ready" if not candidate.blockers else "blocked",
        "productionClosed": True,
        "closedBaseline": {
            "status": closed.get("status"),
            "formsVerified": closed.get("summary", {}).get("formsVerified"),
            "copiedFilesVerified": closed.get("summary", {}).get("copiedFilesVerified"),
            "portraitFilesVerified": closed.get("summary", {}).get("portraitFilesVerified"),
        },
        "exportContract": export,
        "candidate": candidate.summary(),
        "blockers": list(candidate.blockers),
    }


def _write_temp(path: Path, payload: bytes, *, suffix: str) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        dir=path.parent,
        prefix=f".{path.name}.fusion-release-{os.getpid()}-",
        suffix=suffix,
        delete=False,
    ) as stream:
        temporary = Path(stream.name)
        stream.write(payload)
        stream.flush()
        os.fsync(stream.fileno())
    return temporary


def _fsync_directory(path: Path) -> None:
    descriptor = os.open(path, os.O_RDONLY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def _restore_mutation(repo_root: Path, mutation: Mutation) -> None:
    path = repo_root / mutation.repo_path
    if mutation.original_bytes is None:
        if path.exists() or path.is_symlink():
            if not path.is_file() or path.is_symlink():
                raise PromotionError(f"cannot remove unsafe rollback target: {mutation.repo_path}")
            path.unlink()
            _fsync_directory(path.parent)
        return
    rollback = _write_temp(path, mutation.original_bytes, suffix=".rollback")
    try:
        os.replace(rollback, path)
        _fsync_directory(path.parent)
    finally:
        rollback.unlink(missing_ok=True)


@contextmanager
def _promotion_lock(repo_root: Path):
    lock_path = repo_root / ".run/locks/pet-fusion-runtime-release.lock"
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    with lock_path.open("a+b") as handle:
        fcntl.flock(handle.fileno(), fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(handle.fileno(), fcntl.LOCK_UN)


def _verify_candidate_inputs(candidate: PromotionCandidate) -> None:
    if (
        _sha256_file(candidate.repo_root / candidate.approval_input_path)
        != candidate.approval_input_sha256
    ):
        raise PromotionError("approval input drifted after candidate preparation")
    for mutation in candidate.mutations:
        path = candidate.repo_root / mutation.repo_path
        if mutation.original_bytes is None:
            if path.exists() or path.is_symlink():
                raise PromotionError(
                    f"new release path appeared before apply: {mutation.repo_path}"
                )
        elif not path.is_file() or path.read_bytes() != mutation.original_bytes:
            raise PromotionError(f"release input drifted before apply: {mutation.repo_path}")


def atomic_apply(
    candidate: PromotionCandidate,
    *,
    post_validate: Callable[[PromotionCandidate], Any] | None = validate_server_candidate,
    fault_hook: Callable[[str], None] | None = None,
) -> None:
    if candidate.blockers:
        raise PromotionError("release candidate is blocked: " + "; ".join(candidate.blockers))
    with _promotion_lock(candidate.repo_root):
        _verify_candidate_inputs(candidate)
        temporaries: dict[Path, Path] = {}
        installed: list[Mutation] = []
        try:
            for mutation in candidate.mutations:
                path = candidate.repo_root / mutation.repo_path
                temporaries[mutation.repo_path] = _write_temp(
                    path,
                    mutation.candidate_bytes,
                    suffix=".candidate",
                )
            for mutation in candidate.mutations:
                path = candidate.repo_root / mutation.repo_path
                temporary = temporaries[mutation.repo_path]
                os.replace(temporary, path)
                installed.append(mutation)
                _fsync_directory(path.parent)
                if fault_hook is not None:
                    fault_hook(f"after:{mutation.repo_path.as_posix()}")
            if post_validate is not None:
                post_validate(candidate)
            for mutation in candidate.mutations:
                path = candidate.repo_root / mutation.repo_path
                if path.read_bytes() != mutation.candidate_bytes:
                    raise PromotionError(f"post-apply bytes drifted: {mutation.repo_path}")
        except BaseException as error:
            rollback_errors: list[str] = []
            for mutation in reversed(installed):
                try:
                    _restore_mutation(candidate.repo_root, mutation)
                except Exception as rollback_error:
                    rollback_errors.append(f"{mutation.repo_path}: {rollback_error}")
            if rollback_errors:
                raise PromotionError(
                    "release apply failed and rollback was incomplete: "
                    + "; ".join(rollback_errors)
                ) from error
            raise
        finally:
            for temporary in temporaries.values():
                temporary.unlink(missing_ok=True)


def _parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-root", type=Path, default=REPO_ROOT)
    parser.add_argument(
        "--approval-input",
        type=Path,
        help="Repository-relative immutable owner/evidence input JSON.",
    )
    parser.add_argument(
        "--expected-approval-sha256",
        default="",
        help="Required with --apply; protects the explicit approval input bytes.",
    )
    parser.add_argument(
        "--owner-accepted-current-candidate",
        action="store_true",
        help="Required with --apply after explicit project-owner acceptance.",
    )
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--check", action="store_true", help="Read-only readiness check (default).")
    mode.add_argument(
        "--apply",
        action="store_true",
        help="Atomically install the verified release.",
    )
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = _parse_args(argv)
    repo_root = args.repo_root.resolve()
    approval_input = args.approval_input
    if approval_input is not None and approval_input.is_absolute():
        try:
            approval_input = approval_input.resolve().relative_to(repo_root)
        except ValueError:
            print("ERROR approval input must be inside the repository", file=sys.stderr)
            return 2
    try:
        if not args.apply:
            result = check_readiness(repo_root, approval_input)
            print(json.dumps(result, ensure_ascii=False, indent=2))
            return 0 if result["status"] == "ready" else 1
        if approval_input is None:
            raise PromotionError("--apply requires --approval-input")
        if not args.owner_accepted_current_candidate:
            raise PromotionError(
                "--apply requires --owner-accepted-current-candidate"
            )
        expected = str(args.expected_approval_sha256).strip().lower()
        if SHA256_RE.fullmatch(expected) is None:
            raise PromotionError(
                "--apply requires a lowercase --expected-approval-sha256"
            )
        candidate = prepare_candidate(repo_root, approval_input)
        if candidate.approval_input_sha256 != expected:
            raise PromotionError(
                "approval input SHA-256 does not match --expected-approval-sha256"
            )
        atomic_apply(candidate)
        result = {
            "mode": "apply",
            "status": "passed",
            "productionClosed": False,
            "candidate": candidate.summary(),
        }
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except (PromotionError, OSError) as error:
        print(f"ERROR {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
