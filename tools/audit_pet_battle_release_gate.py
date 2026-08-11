#!/usr/bin/env python3
"""Audit the standalone exact-form pet battle release gate without Godot.

This tool is intentionally read-only.  It reports every art-catalog form, derives
the formal wild-training form set from active progression data, and verifies that
normal standalone battle art can only resolve through an exact owner-approved attestation or
the single frozen non-formal legacy canary.
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import math
import re
from pathlib import Path
from typing import Any, Iterable


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CATALOG = Path("client/godot/data/pet_art_catalog.json")
DEFAULT_REGISTRY = Path("client/godot/data/pet_battle_release_registry_v1.json")
DEFAULT_RUNTIME_CACHE = Path("client/godot/data/pet_battle_release_runtime_cache_v1.json")
DEFAULT_PROGRESSION = Path("client/godot/data/balance/progression_zones.json")
REGISTRY_ID = "pet_battle_exact_form_release_v1"
RUNTIME_CACHE_ID = "pet_battle_release_runtime_cache_v1"
RUNTIME_CACHE_CONTRACT_ID = "beastbound_pet_battle_runtime_cache_v1"
CANONICAL_JSON_CONTRACT_ID = "beastbound_sorted_compact_safe_integer_json_utf8_v2"
MAX_SAFE_JSON_INTEGER = (1 << 53) - 1
AUTHORITY_KIND_EVOLUTION_V1 = "pet_evolution_runtime_release_v1"
LEGACY_EXCEPTION_ID = "legacy_bui_novice_battle_canary_v1"
LEGACY_FORM_ID = "bui_novice_sprout_earth5_wind5"
MODE_FORMAL = "formal_exact_asset"
MODE_LEGACY = "legacy_exact_asset"
MODE_PLACEHOLDER = "procedural_placeholder"
FORMAL_VIEWS = ["front_3quarter_sw", "back_3quarter_ne"]
FORMAL_ACTIONS = [
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
]
FORMAL_FRAME_COUNTS = {
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
LEGACY_ACTIONS = ["idle", "walk", "attack", "hurt", "defend", "stagger", "down"]
RUNTIME_TREE_CONTRACT_ID = "beastbound_pet_battle_runtime_tree_v1"
EXPECTED_RUNTIME_FRAME_COUNT = sum(FORMAL_FRAME_COUNTS.values()) * len(FORMAL_VIEWS)
FORMAL_MAPPING = {
    "enemy": {"view": "front_3quarter_sw", "flipH": True, "facing": "southeast"},
    "ally": {"view": "back_3quarter_ne", "flipH": True, "facing": "northwest"},
}
COVERAGE_CONTRACT_KEYS = frozenset(
    {
        "source",
        "formalWildTrainingExpectedCount",
        "formalWildTrainingDerivedSetSha256",
    }
)
FORMAL_ENTRY_KEYS = frozenset(
    {
        "formId",
        "artSkeletonId",
        "petRoot",
        "metadataPath",
        "metadataSha256",
        "battleRuntimeRoot",
        "battleBundleDigest",
        "battleRuntimeDigest",
        "battleRuntimeTreeSha256",
        "battleInstallManifestSha256",
        "releaseAuthority",
    }
)
LEGACY_ENTRY_KEYS = frozenset(
    {
        "exceptionId",
        "formId",
        "formalRelease",
        "compatibilityOnly",
        "artSkeletonId",
        "petRoot",
        "metadataPath",
        "metadataSha256",
        "battleRuntimeRoot",
        "battleBundleDigest",
        "battleRuntimeTreeSha256",
        "battleInstallManifestSha256",
        "legacyBattleActionIds",
        "reason",
    }
)
RELEASE_AUTHORITY_REFERENCE_KEYS = frozenset({"kind", "path", "sha256"})
RUNTIME_CACHE_REFERENCE_KEYS = frozenset({"contractId", "path", "sha256"})


class CanonicalJsonError(ValueError):
    """Raised when a release binding contains a value outside the v2 JSON domain."""


def normalize_canonical_json(value: Any, *, path: str = "$") -> Any:
    """Normalize the shared Python/GDScript safe-integer JSON contract.

    JSON booleans are deliberately handled before integers because ``bool`` is
    an ``int`` subclass in Python. Finite integral floats are equivalent to the
    same safe integer; every other numeric representation fails closed.
    """

    if value is None or isinstance(value, (str, bool)):
        return value
    if isinstance(value, int):
        if value < -MAX_SAFE_JSON_INTEGER or value > MAX_SAFE_JSON_INTEGER:
            raise CanonicalJsonError(f"canonical JSON unsafe integer at {path}")
        return value
    if isinstance(value, float):
        if not math.isfinite(value):
            raise CanonicalJsonError(f"canonical JSON non-finite number at {path}")
        if not value.is_integer():
            raise CanonicalJsonError(f"canonical JSON non-integral number at {path}")
        if value < -MAX_SAFE_JSON_INTEGER or value > MAX_SAFE_JSON_INTEGER:
            raise CanonicalJsonError(f"canonical JSON unsafe integral float at {path}")
        return int(value)
    if isinstance(value, list):
        return [
            normalize_canonical_json(item, path=f"{path}[{index}]")
            for index, item in enumerate(value)
        ]
    if isinstance(value, dict):
        normalized: dict[str, Any] = {}
        for key, item in value.items():
            if not isinstance(key, str):
                raise CanonicalJsonError(f"canonical JSON non-string object key at {path}")
            normalized[key] = normalize_canonical_json(item, path=f"{path}.{key}")
        return normalized
    raise CanonicalJsonError(
        f"canonical JSON unsupported value type at {path}: {type(value).__name__}"
    )


def _json_snapshot_from_bytes(path: Path, payload: bytes) -> dict[str, Any]:
    try:
        value = json.loads(payload.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"cannot read JSON {path}: {exc}") from exc
    if not isinstance(value, dict):
        raise RuntimeError(f"JSON root must be an object: {path}")
    return {
        "path": path.resolve(),
        "document": value,
        "rawBytes": payload,
        "sha256": hashlib.sha256(payload).hexdigest(),
    }


def _canonical_json_snapshot_from_bytes(path: Path, payload: bytes) -> dict[str, Any]:
    """Parse one raw snapshot, then apply v2 only to Phase404 semantic documents."""

    snapshot = _json_snapshot_from_bytes(path, payload)
    try:
        snapshot["document"] = normalize_canonical_json(snapshot["document"])
    except CanonicalJsonError as exc:
        raise RuntimeError(f"cannot read canonical JSON {path}: {exc}") from exc
    return snapshot


def _read_json_snapshot(
    path: Path,
    snapshot_cache: dict[Path, dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Read once, then derive both the parsed document and raw SHA from those bytes."""

    resolved = path.resolve()
    if snapshot_cache is not None and resolved in snapshot_cache:
        return snapshot_cache[resolved]
    try:
        payload = path.read_bytes()
    except OSError as exc:
        raise RuntimeError(f"cannot read JSON {path}: {exc}") from exc
    snapshot = _json_snapshot_from_bytes(path, payload)
    if snapshot_cache is not None:
        snapshot_cache[resolved] = snapshot
    return snapshot


def _read_canonical_json_snapshot(
    path: Path,
    snapshot_cache: dict[Path, dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Read registry/cache bytes once and normalize their semantic JSON values."""

    resolved = path.resolve()
    if snapshot_cache is not None and resolved in snapshot_cache:
        cached = snapshot_cache[resolved]
        raw_bytes = cached.get("rawBytes")
        if not isinstance(raw_bytes, bytes):
            raise RuntimeError(f"JSON snapshot raw bytes are missing: {path}")
        snapshot = _canonical_json_snapshot_from_bytes(path, raw_bytes)
        snapshot_cache[resolved] = snapshot
        return snapshot
    try:
        payload = path.read_bytes()
    except OSError as exc:
        raise RuntimeError(f"cannot read canonical JSON {path}: {exc}") from exc
    snapshot = _canonical_json_snapshot_from_bytes(path, payload)
    if snapshot_cache is not None:
        snapshot_cache[resolved] = snapshot
    return snapshot


def _read_json(
    path: Path,
    snapshot_cache: dict[Path, dict[str, Any]] | None = None,
) -> dict[str, Any]:
    return _read_json_snapshot(path, snapshot_cache)["document"]


def _bind_json_snapshot(
    path: Path,
    snapshot: dict[str, Any],
    snapshot_cache: dict[Path, dict[str, Any]],
) -> dict[str, Any]:
    """Bind a caller-provided snapshot without reopening its filesystem path."""

    resolved = path.resolve()
    raw_bytes = snapshot.get("rawBytes")
    document = snapshot.get("document")
    if snapshot.get("path") != resolved:
        raise RuntimeError(f"JSON snapshot path mismatch: {path}")
    if not isinstance(raw_bytes, bytes) or not isinstance(document, dict):
        raise RuntimeError(f"JSON snapshot is incomplete: {path}")
    if hashlib.sha256(raw_bytes).hexdigest() != snapshot.get("sha256"):
        raise RuntimeError(f"JSON snapshot raw SHA-256 mismatch: {path}")
    normalized = _canonical_json_snapshot_from_bytes(path, raw_bytes)
    if not canonical_json_equal(normalized["document"], document):
        raise RuntimeError(f"JSON snapshot document differs from raw bytes: {path}")
    snapshot_cache[resolved] = normalized
    return normalized


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def canonical_json_sha256(value: Any) -> str:
    return hashlib.sha256(canonical_json_bytes(value)).hexdigest()


def canonical_json_bytes(value: Any) -> bytes:
    """Return the cross-runtime canonical JSON bytes used by release bindings."""

    return json.dumps(
        normalize_canonical_json(value),
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")


def canonical_json_equal(actual: Any, expected: Any) -> bool:
    """Compare v2 semantic values without Python's ``True == 1`` coercion."""

    try:
        return canonical_json_bytes(actual) == canonical_json_bytes(expected)
    except CanonicalJsonError:
        return False


def registry_release_subject(registry: dict[str, Any]) -> dict[str, Any]:
    """Return the registry facts protected by the cache without creating a hash cycle."""

    subject = copy.deepcopy(registry)
    subject.pop("runtimeCache", None)
    return subject


def registry_release_subject_sha256(registry: dict[str, Any]) -> str:
    return canonical_json_sha256(registry_release_subject(registry))


def canonical_parity_vectors() -> list[dict[str, Any]]:
    values = [
        {
            "id": "nested_unicode_v1",
            "value": {
                "array": [3, True, None, "月岚风狐"],
                "object": {"z": "末", "a": "首"},
            },
        },
        {
            "id": "release_shape_v1",
            "value": {
                "formId": "wuli_evolved_crystal_earth8_water2",
                "formalRelease": True,
                "frameCount": 180,
                "views": FORMAL_VIEWS,
            },
        },
        {
            "id": "safe_integer_normalization_v2",
            "value": {
                "negativeZero": 0,
                "positiveIntegral": 6,
                "nested": {
                    "array": [
                        180,
                        -MAX_SAFE_JSON_INTEGER,
                        MAX_SAFE_JSON_INTEGER,
                        False,
                    ]
                },
            },
        },
    ]
    return [
        {**entry, "sha256": canonical_json_sha256(entry["value"])}
        for entry in values
    ]


def _text(value: Any) -> str:
    return str(value or "").strip()


def _objects(value: Any) -> list[dict[str, Any]]:
    return [entry for entry in value if isinstance(entry, dict)] if isinstance(value, list) else []


def _strict_objects(value: Any, label: str, errors: list[str]) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        errors.append(f"{label} must be an object-only array")
        return []
    if any(not isinstance(entry, dict) for entry in value):
        errors.append(f"{label} must be an object-only array")
    return _objects(value)


def _strict_strings(value: Any, label: str, errors: list[str]) -> list[str]:
    if not isinstance(value, list):
        errors.append(f"{label} must be a string-only array")
        return []
    if any(not isinstance(entry, str) for entry in value):
        errors.append(f"{label} must be a string-only array")
    return [entry for entry in value if isinstance(entry, str)]


def _strings(value: Any) -> list[str]:
    return [str(entry) for entry in value] if isinstance(value, list) else []


def _is_sha256(value: Any) -> bool:
    text = _text(value).lower()
    return len(text) == 64 and all(character in "0123456789abcdef" for character in text)


def _safe_repo_path(repo_root: Path, value: Any) -> Path | None:
    text = _text(value).replace("\\", "/")
    if not text:
        return None
    relative = Path(text)
    if relative.is_absolute() or ".." in relative.parts:
        return None
    candidate = (repo_root / relative).resolve()
    try:
        candidate.relative_to(repo_root.resolve())
    except ValueError:
        return None
    return candidate


def runtime_tree_snapshot(
    repo_root: Path,
    catalog: dict[str, Any],
    metadata: dict[str, Any],
    snapshot_cache: dict[Path, dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Hash the exact normative 180 runtime PNG paths and their current bytes."""

    form_id = _text(catalog.get("formId"))
    pet = catalog.get("pet") if isinstance(catalog.get("pet"), dict) else {}
    battle = metadata.get("battleVisual") if isinstance(metadata.get("battleVisual"), dict) else {}
    runtime_root = _text(battle.get("runtimeRoot"))
    errors: list[str] = []
    asset_root = _safe_repo_path(repo_root, pet.get("root"))
    install_manifest: dict[str, Any] = {}
    install_manifest_sha = ""
    install_manifest_loaded = False
    if asset_root is None or not asset_root.is_dir():
        errors.append("runtime asset root is missing or unsafe")
    if runtime_root != "views":
        errors.append("runtime tree root must be canonical views")
    if asset_root is not None and asset_root.is_dir():
        install_manifest_path = asset_root / "source/battle/install-manifest.json"
        if not install_manifest_path.is_file() or install_manifest_path.is_symlink():
            errors.append("battle install manifest is missing or unsafe")
        else:
            try:
                install_manifest_snapshot = _read_json_snapshot(
                    install_manifest_path,
                    snapshot_cache,
                )
                install_manifest = install_manifest_snapshot["document"]
                install_manifest_sha = install_manifest_snapshot["sha256"]
                install_manifest_loaded = True
            except RuntimeError as exc:
                errors.append(str(exc))
    installed_hashes = (
        install_manifest.get("installedFileHashes")
        if isinstance(install_manifest.get("installedFileHashes"), dict)
        else {}
    )
    if install_manifest_loaded and not installed_hashes:
        errors.append("battle install manifest installedFileHashes is missing")
    if install_manifest_loaded and (
        not canonical_json_equal(install_manifest.get("schemaVersion"), 1)
        or _text(install_manifest.get("formId")) != form_id
        or install_manifest.get("kind") != "pet"
        or install_manifest.get("characterId") is not None
    ):
        errors.append("battle install manifest exact-form identity is invalid")

    lines = [
        f"contract\t{RUNTIME_TREE_CONTRACT_ID}\n",
        f"formId\t{form_id}\n",
        f"runtimeRoot\t{runtime_root}\n",
        f"views\t{','.join(FORMAL_VIEWS)}\n",
        "actions\t"
        + ",".join(f"{action}:{FORMAL_FRAME_COUNTS[action]}" for action in FORMAL_ACTIONS)
        + "\n",
    ]
    frame_count = 0
    expected_runtime_paths: set[str] = set()
    missing_paths: list[str] = []
    invalid_manifest_hash_paths: list[str] = []
    drift_paths: list[str] = []
    if asset_root is not None and asset_root.is_dir() and runtime_root == "views":
        for view in FORMAL_VIEWS:
            for action in FORMAL_ACTIONS:
                for index in range(1, FORMAL_FRAME_COUNTS[action] + 1):
                    relative = Path("views") / view / action / f"{action}-{index}.png"
                    relative_text = relative.as_posix()
                    expected_runtime_paths.add(relative_text)
                    frame_path = asset_root / relative
                    if not frame_path.is_file() or frame_path.is_symlink():
                        missing_paths.append(relative_text)
                        continue
                    frame_sha = _sha256_file(frame_path)
                    if installed_hashes:
                        manifest_sha = _text(installed_hashes.get(relative_text)).lower()
                        if not _is_sha256(manifest_sha):
                            invalid_manifest_hash_paths.append(relative_text)
                        elif manifest_sha != frame_sha:
                            drift_paths.append(relative_text)
                    lines.append(f"{relative_text}\t{frame_sha}\n")
                    frame_count += 1
    if missing_paths:
        errors.append(
            f"runtime frames missing or unsafe: {len(missing_paths)}, first={missing_paths[0]}"
        )
    if invalid_manifest_hash_paths:
        errors.append(
            "install manifest runtime frame hashes invalid: "
            f"{len(invalid_manifest_hash_paths)}, first={invalid_manifest_hash_paths[0]}"
        )
    if drift_paths:
        errors.append(
            f"runtime frame SHA-256 drift: {len(drift_paths)}, first={drift_paths[0]}"
        )
    recorded_runtime_paths = {
        _text(path)
        for path in installed_hashes
        if _text(path).startswith("views/")
    }
    if installed_hashes and recorded_runtime_paths != expected_runtime_paths:
        errors.append("install manifest runtime path set does not equal the normative 180 frames")
    if frame_count != EXPECTED_RUNTIME_FRAME_COUNT:
        errors.append(
            f"runtime frame count mismatch: {frame_count} != {EXPECTED_RUNTIME_FRAME_COUNT}"
        )
    return {
        "ok": not errors,
        "formId": form_id,
        "runtimeRoot": runtime_root,
        "frameCount": frame_count,
        "installManifestSha256": install_manifest_sha,
        "installManifestBundleDigest": _text(install_manifest.get("bundleDigest")).lower(),
        "installManifestRuntimeFrameHashCount": len(recorded_runtime_paths),
        "sha256": (
            hashlib.sha256("".join(lines).encode("utf-8")).hexdigest()
            if frame_count == EXPECTED_RUNTIME_FRAME_COUNT and runtime_root == "views"
            else ""
        ),
        "errors": errors,
    }


def _entries_for_form(value: Any, form_id: str) -> list[dict[str, Any]]:
    return [entry for entry in _objects(value) if _text(entry.get("formId")) == form_id]


def _append_mismatch(errors: list[str], label: str, actual: Any, expected: Any) -> None:
    if not canonical_json_equal(actual, expected):
        errors.append(f"{label} mismatch")


def _placeholder(form_id: str, reason: str, errors: Iterable[str] = ()) -> dict[str, Any]:
    return {
        "normalRuntimeAllowed": False,
        "formalRelease": False,
        "legacyCompatibilityException": False,
        "releaseMode": MODE_PLACEHOLDER,
        "requestedFormId": form_id,
        "assetFormId": None,
        "placeholderFormId": form_id,
        "reason": reason,
        "errors": list(errors),
    }


def _allowed(form_id: str, mode: str, formal: bool) -> dict[str, Any]:
    return {
        "normalRuntimeAllowed": True,
        "formalRelease": formal,
        "legacyCompatibilityException": not formal,
        "releaseMode": mode,
        "requestedFormId": form_id,
        "assetFormId": form_id,
        "placeholderFormId": None,
        "reason": "exact_form_release_valid" if formal else "legacy_compatibility_exception",
        "errors": [],
    }


def _authority_status(
    repo_root: Path,
    entry: dict[str, Any],
    snapshot_cache: dict[Path, dict[str, Any]] | None = None,
) -> dict[str, Any]:
    authority = entry.get("releaseAuthority")
    if not isinstance(authority, dict):
        return {"ok": False, "path": "", "sha256": "", "formIds": [], "errors": ["release authority missing"]}
    kind = _text(authority.get("kind"))
    repo_path = _text(authority.get("path"))
    expected_sha = _text(authority.get("sha256")).lower()
    errors: list[str] = []
    if kind != AUTHORITY_KIND_EVOLUTION_V1:
        errors.append(f"unsupported release authority kind: {kind}")
    if repo_path != "client/godot/data/pet_evolution_release_attestation_v1.json":
        errors.append("release authority path is not the supported evolution attestation")
    if not _is_sha256(expected_sha):
        errors.append("release authority SHA-256 is invalid")
    path = _safe_repo_path(repo_root, repo_path)
    document: dict[str, Any] = {}
    document_loaded = False
    if path is None or not path.is_file():
        errors.append("release authority path is missing or unsafe")
    else:
        try:
            authority_snapshot = _read_json_snapshot(path, snapshot_cache)
            document = authority_snapshot["document"]
            document_loaded = True
            if authority_snapshot["sha256"] != expected_sha:
                errors.append("release authority SHA-256 drift")
        except RuntimeError as exc:
            errors.append(str(exc))
    if document_loaded:
        if (
            document.get("status") != "approved"
            or document.get("ownerReviewStatus") != "approved"
            or document.get("releaseApproved") is not True
            or document.get("runtimeEnabled") is not True
        ):
            errors.append("release authority is not owner-approved and runtime-enabled")
    authority_forms = _strict_objects(
        document.get("forms"),
        "release authority forms",
        errors,
    ) if document_loaded else []
    form_ids = [_text(form.get("formId")) for form in authority_forms]
    if document_loaded and (
        not form_ids
        or any(
            not isinstance(form.get("formId"), str)
            or not form.get("formId", "").strip()
            for form in authority_forms
        )
        or len(form_ids) != len(set(form_ids))
    ):
        errors.append("release authority formIds are empty or duplicated")
    return {
        "ok": not errors,
        "path": repo_path,
        "sha256": expected_sha,
        "formIds": form_ids,
        "errors": errors,
    }


def _formal_entry_errors(
    form_id: str,
    catalog: dict[str, Any],
    metadata: dict[str, Any],
    metadata_sha256: str,
    entry: dict[str, Any],
    authority: dict[str, Any],
    runtime_tree: dict[str, Any],
) -> list[str]:
    errors: list[str] = []
    pet = catalog.get("pet") if isinstance(catalog.get("pet"), dict) else {}
    battle = metadata.get("battleVisual") if isinstance(metadata.get("battleVisual"), dict) else {}
    release_authority = entry.get("releaseAuthority") if isinstance(entry.get("releaseAuthority"), dict) else {}
    authority_reference = {
        "path": _text(release_authority.get("path")),
        "sha256": _text(release_authority.get("sha256")).lower(),
    }
    checks = [
        ("attestation formId", _text(entry.get("formId")), form_id),
        ("catalog formId", _text(catalog.get("formId")), form_id),
        ("catalog status", catalog.get("status"), "approved"),
        ("catalog runtimeEnabled", catalog.get("runtimeEnabled"), True),
        ("catalog artSkeletonId", _text(catalog.get("artSkeletonId")), _text(entry.get("artSkeletonId"))),
        ("catalog pet.root", _text(pet.get("root")), _text(entry.get("petRoot"))),
        ("catalog metadataPath", _text(pet.get("metadataPath")), _text(entry.get("metadataPath"))),
        ("metadata formId", _text(metadata.get("formId")), form_id),
        ("metadata artStatus", metadata.get("artStatus"), "approved"),
        ("metadata ownerReviewStatus", metadata.get("ownerReviewStatus"), "approved"),
        ("metadata runtimeEnabled", metadata.get("runtimeEnabled"), True),
        ("metadata SHA-256", metadata_sha256.lower(), _text(entry.get("metadataSha256")).lower()),
        ("battleVisual status", battle.get("status"), "approved"),
        ("battleVisual runtimeEnabled", battle.get("runtimeEnabled"), True),
        ("battleVisual kind", battle.get("kind"), "pet"),
        ("battleVisual root", _text(battle.get("runtimeRoot")), _text(entry.get("battleRuntimeRoot"))),
        ("battleVisual canonical root", _text(battle.get("runtimeRoot")), "views"),
        ("battleVisual bundle digest", _text(battle.get("bundleDigest")).lower(), _text(entry.get("battleBundleDigest")).lower()),
        ("battleVisual runtime digest", _text(battle.get("runtimeBundleDigest")).lower(), _text(entry.get("battleRuntimeDigest")).lower()),
        ("runtime tree formId", _text(runtime_tree.get("formId")), form_id),
        ("runtime tree root", _text(runtime_tree.get("runtimeRoot")), "views"),
        ("runtime tree frame count", runtime_tree.get("frameCount"), EXPECTED_RUNTIME_FRAME_COUNT),
        ("runtime tree SHA-256", _text(runtime_tree.get("sha256")).lower(), _text(entry.get("battleRuntimeTreeSha256")).lower()),
        ("battle install manifest SHA-256", _text(runtime_tree.get("installManifestSha256")).lower(), _text(entry.get("battleInstallManifestSha256")).lower()),
        ("battle install manifest bundle digest", _text(runtime_tree.get("installManifestBundleDigest")).lower(), _text(entry.get("battleBundleDigest")).lower()),
        ("battle install manifest runtime hash count", runtime_tree.get("installManifestRuntimeFrameHashCount"), EXPECTED_RUNTIME_FRAME_COUNT),
        ("battleVisual views", _strings(battle.get("views")), FORMAL_VIEWS),
        ("battleVisual actions", _strings(battle.get("actions")), FORMAL_ACTIONS),
        ("metadata battleViewMapping", metadata.get("battleViewMapping"), FORMAL_MAPPING),
        ("battleVisual battleViewMapping", battle.get("battleViewMapping"), FORMAL_MAPPING),
        ("catalog releaseAttestation", catalog.get("releaseAttestation"), authority_reference),
        ("metadata releaseAttestation", metadata.get("releaseAttestation"), authority_reference),
        ("release authority kind", release_authority.get("kind"), AUTHORITY_KIND_EVOLUTION_V1),
    ]
    for label, actual, expected in checks:
        _append_mismatch(errors, label, actual, expected)
    for label in (
        "metadataSha256",
        "battleBundleDigest",
        "battleRuntimeDigest",
        "battleRuntimeTreeSha256",
        "battleInstallManifestSha256",
    ):
        if not _is_sha256(entry.get(label)):
            errors.append(f"attestation {label} is not SHA-256")
    if runtime_tree.get("ok") is not True:
        errors.extend(f"runtime tree: {error}" for error in _strings(runtime_tree.get("errors")))
    if (
        authority.get("ok") is not True
        or authority.get("path") != authority_reference["path"]
        or _text(authority.get("sha256")).lower() != authority_reference["sha256"]
        or form_id not in _strings(authority.get("formIds"))
    ):
        errors.append("upstream owner-approved release authority does not cover exact formId")
    return errors


def _legacy_entry_errors(
    form_id: str,
    catalog: dict[str, Any],
    metadata: dict[str, Any],
    metadata_sha256: str,
    entry: dict[str, Any],
    runtime_tree: dict[str, Any],
) -> list[str]:
    errors: list[str] = []
    pet = catalog.get("pet") if isinstance(catalog.get("pet"), dict) else {}
    battle = metadata.get("battleVisual") if isinstance(metadata.get("battleVisual"), dict) else {}
    checks = [
        ("legacy exceptionId", entry.get("exceptionId"), LEGACY_EXCEPTION_ID),
        ("legacy formId", form_id, LEGACY_FORM_ID),
        ("legacy entry formId", _text(entry.get("formId")), LEGACY_FORM_ID),
        ("legacy formalRelease", entry.get("formalRelease"), False),
        ("legacy compatibilityOnly", entry.get("compatibilityOnly"), True),
        ("legacy catalog status", catalog.get("status"), "in_production"),
        ("legacy catalog runtimeEnabled", catalog.get("runtimeEnabled"), True),
        ("legacy catalog artSkeletonId", _text(catalog.get("artSkeletonId")), _text(entry.get("artSkeletonId"))),
        ("legacy catalog pet.root", _text(pet.get("root")), _text(entry.get("petRoot"))),
        ("legacy catalog metadataPath", _text(pet.get("metadataPath")), _text(entry.get("metadataPath"))),
        ("legacy metadata formId", _text(metadata.get("formId")), LEGACY_FORM_ID),
        ("legacy metadata artStatus", metadata.get("artStatus"), "owner_review_pending"),
        ("legacy metadata ownerReviewStatus", metadata.get("ownerReviewStatus"), "pending"),
        ("legacy metadata runtimeEnabled", metadata.get("runtimeEnabled"), False),
        (
            "legacy metadata releaseAttestation",
            metadata.get("releaseAttestation", {}),
            {},
        ),
        ("legacy metadata SHA-256", metadata_sha256.lower(), _text(entry.get("metadataSha256")).lower()),
        ("legacy battleVisual status", battle.get("status"), "self_review_passed_owner_pending"),
        ("legacy battleVisual runtimeEnabled", battle.get("runtimeEnabled"), False),
        ("legacy battleVisual kind", battle.get("kind"), "pet"),
        ("legacy battleVisual root", _text(battle.get("runtimeRoot")), _text(entry.get("battleRuntimeRoot"))),
        ("legacy battleVisual bundle digest", _text(battle.get("bundleDigest")).lower(), _text(entry.get("battleBundleDigest")).lower()),
        ("legacy runtime tree formId", _text(runtime_tree.get("formId")), form_id),
        ("legacy runtime tree root", _text(runtime_tree.get("runtimeRoot")), "views"),
        ("legacy runtime tree frame count", runtime_tree.get("frameCount"), EXPECTED_RUNTIME_FRAME_COUNT),
        ("legacy runtime tree SHA-256", _text(runtime_tree.get("sha256")).lower(), _text(entry.get("battleRuntimeTreeSha256")).lower()),
        ("legacy install manifest SHA-256", _text(runtime_tree.get("installManifestSha256")).lower(), _text(entry.get("battleInstallManifestSha256")).lower()),
        ("legacy install manifest bundle digest", _text(runtime_tree.get("installManifestBundleDigest")).lower(), _text(entry.get("battleBundleDigest")).lower()),
        ("legacy install manifest runtime hash count", runtime_tree.get("installManifestRuntimeFrameHashCount"), EXPECTED_RUNTIME_FRAME_COUNT),
        ("legacy battleVisual views", _strings(battle.get("views")), FORMAL_VIEWS),
        ("legacy metadata battle actions", _strings(battle.get("actions")), FORMAL_ACTIONS),
        ("legacy runtime battle actions", _strings(entry.get("legacyBattleActionIds")), LEGACY_ACTIONS),
        ("legacy metadata battleViewMapping", metadata.get("battleViewMapping"), FORMAL_MAPPING),
        ("legacy battleVisual battleViewMapping", battle.get("battleViewMapping"), FORMAL_MAPPING),
    ]
    for label, actual, expected in checks:
        _append_mismatch(errors, label, actual, expected)
    for label in (
        "metadataSha256",
        "battleBundleDigest",
        "battleRuntimeTreeSha256",
        "battleInstallManifestSha256",
    ):
        if not _is_sha256(entry.get(label)):
            errors.append(f"legacy {label} is not SHA-256")
    if runtime_tree.get("ok") is not True:
        errors.extend(f"runtime tree: {error}" for error in _strings(runtime_tree.get("errors")))
    return errors


def resolve_documents(
    form_id: str,
    catalog: dict[str, Any],
    metadata: dict[str, Any],
    metadata_sha256: str,
    registry: dict[str, Any],
    authority: dict[str, Any] | None = None,
    runtime_tree: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Pure exact-form resolver used by the live audit and tamper tests."""

    requested = _text(form_id)
    if not requested:
        return _placeholder(requested, "empty_form_id", ["formId is empty"])
    if not catalog:
        return _placeholder(requested, "unknown_form")
    if _text(catalog.get("formId")) != requested:
        return _placeholder(requested, "catalog_form_id_mismatch", ["catalog formId does not match request"])
    formal_matches = _entries_for_form(registry.get("formalReleaseEntries"), requested)
    legacy_matches = _entries_for_form(registry.get("legacyCompatibilityExceptions"), requested)
    if len(formal_matches) + len(legacy_matches) > 1:
        return _placeholder(requested, "ambiguous_exact_form_attestation", ["multiple exact-form records"])
    if formal_matches:
        errors = _formal_entry_errors(
            requested,
            catalog,
            metadata,
            metadata_sha256,
            formal_matches[0],
            authority or {},
            runtime_tree or {},
        )
        return _placeholder(requested, "formal_attestation_mismatch", errors) if errors else _allowed(requested, MODE_FORMAL, True)
    if legacy_matches:
        errors = _legacy_entry_errors(
            requested,
            catalog,
            metadata,
            metadata_sha256,
            legacy_matches[0],
            runtime_tree or {},
        )
        return _placeholder(requested, "legacy_exception_mismatch", errors) if errors else _allowed(requested, MODE_LEGACY, False)
    return _placeholder(requested, "no_exact_form_release")


def _registry_errors(registry: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    try:
        normalize_canonical_json(registry)
    except CanonicalJsonError as exc:
        errors.append(str(exc))
    required_keys = {
        "schemaVersion",
        "registryId",
        "scope",
        "policy",
        "coverageContract",
        "formalReleaseEntries",
        "legacyCompatibilityExceptions",
    }
    allowed_keys = required_keys | {"runtimeCache"}
    if not required_keys.issubset(registry) or not set(registry).issubset(allowed_keys):
        errors.append("release registry keys may only contain release facts plus internal runtimeCache")
    if not canonical_json_equal(registry.get("schemaVersion"), 1):
        errors.append("release registry schemaVersion must be 1")
    if registry.get("registryId") != REGISTRY_ID:
        errors.append("release registryId mismatch")
    if registry.get("scope") != "standalone_pet_battle":
        errors.append("release scope must remain standalone_pet_battle")
    if "runtimeCache" in registry:
        runtime_cache_reference = registry.get("runtimeCache")
        if not isinstance(runtime_cache_reference, dict):
            errors.append("release registry runtimeCache must be an object")
        elif set(runtime_cache_reference) != RUNTIME_CACHE_REFERENCE_KEYS:
            errors.append("release registry runtimeCache keys mismatch")
        else:
            if runtime_cache_reference.get("contractId") != RUNTIME_CACHE_CONTRACT_ID:
                errors.append("release registry runtimeCache contractId mismatch")
            if runtime_cache_reference.get("path") != DEFAULT_RUNTIME_CACHE.as_posix():
                errors.append("release registry runtimeCache path mismatch")
            runtime_cache_sha256 = runtime_cache_reference.get("sha256")
            if not isinstance(runtime_cache_sha256, str) or not re.fullmatch(
                r"[0-9a-f]{64}", runtime_cache_sha256
            ):
                errors.append("release registry runtimeCache sha256 must be lowercase SHA-256")
    policy = registry.get("policy") if isinstance(registry.get("policy"), dict) else {}
    expected_policy = {
        "exactFormOnly": True,
        "skeletonFallbackAllowed": False,
        "unknownFormFallback": "same_actor_procedural_placeholder",
        "inProductionRuntimeSwitchAllowed": False,
    }
    if not canonical_json_equal(policy, expected_policy):
        errors.append("release policy must be exact-form and fail-closed")
    coverage_contract = registry.get("coverageContract")
    if (
        not isinstance(coverage_contract, dict)
        or set(coverage_contract) != COVERAGE_CONTRACT_KEYS
    ):
        errors.append("release coverageContract keys mismatch")
    formal_entries = registry.get("formalReleaseEntries")
    legacy_entries = registry.get("legacyCompatibilityExceptions")
    if not isinstance(formal_entries, list):
        errors.append("formalReleaseEntries must be an array")
        formal_entries = []
    if not isinstance(legacy_entries, list):
        errors.append("legacyCompatibilityExceptions must be an array")
        legacy_entries = []
    if any(not isinstance(entry, dict) for entry in formal_entries):
        errors.append("formalReleaseEntries may only contain objects")
    if any(not isinstance(entry, dict) for entry in legacy_entries):
        errors.append("legacyCompatibilityExceptions may only contain objects")
    seen: set[str] = set()
    for entry in _objects(formal_entries):
        form_id = _text(entry.get("formId"))
        if set(entry) != FORMAL_ENTRY_KEYS:
            errors.append(f"formal release entry keys mismatch: {form_id}")
        authority_reference = entry.get("releaseAuthority")
        if (
            not isinstance(authority_reference, dict)
            or set(authority_reference) != RELEASE_AUTHORITY_REFERENCE_KEYS
        ):
            errors.append(f"formal release authority keys mismatch: {form_id}")
        if not form_id or form_id in seen:
            errors.append(f"formal release formId empty or duplicate: {form_id}")
        seen.add(form_id)
    if len(legacy_entries) != 1:
        errors.append("legacy compatibility exception must remain exactly one entry")
    for entry in _objects(legacy_entries):
        form_id = _text(entry.get("formId"))
        if set(entry) != LEGACY_ENTRY_KEYS:
            errors.append(f"legacy compatibility entry keys mismatch: {form_id}")
        if (
            form_id != LEGACY_FORM_ID
            or entry.get("exceptionId") != LEGACY_EXCEPTION_ID
            or form_id in seen
        ):
            errors.append("legacy compatibility exception was expanded, renamed, or collided")
        legacy_actions = entry.get("legacyBattleActionIds")
        if not isinstance(legacy_actions, list) or any(
            not isinstance(action, str) for action in legacy_actions
        ):
            errors.append("legacyBattleActionIds must be a string-only array")
    return errors


def build_runtime_cache_document(registry: dict[str, Any]) -> dict[str, Any]:
    """Build the deterministic startup cache from an already audited registry."""

    entries: list[dict[str, Any]] = []
    for entry in _objects(registry.get("formalReleaseEntries")):
        entries.append(
            {
                "formId": _text(entry.get("formId")),
                "releaseMode": MODE_FORMAL,
                "formalRelease": True,
                "compatibilityException": False,
                "assetFormId": _text(entry.get("formId")),
                "catalogStatus": "approved",
                "catalogRuntimeEnabled": True,
                "artSkeletonId": _text(entry.get("artSkeletonId")),
                "petRoot": _text(entry.get("petRoot")),
                "battleRuntimeRoot": _text(entry.get("battleRuntimeRoot")),
                "battleRuntimeTreeSha256": _text(
                    entry.get("battleRuntimeTreeSha256")
                ).lower(),
                "sourceRuntimeFrameCount": EXPECTED_RUNTIME_FRAME_COUNT,
                "normalBattleActionIds": FORMAL_ACTIONS,
                "releaseEntrySha256": canonical_json_sha256(entry),
            }
        )
    for entry in _objects(registry.get("legacyCompatibilityExceptions")):
        entries.append(
            {
                "formId": _text(entry.get("formId")),
                "releaseMode": MODE_LEGACY,
                "formalRelease": False,
                "compatibilityException": True,
                "assetFormId": _text(entry.get("formId")),
                "catalogStatus": "in_production",
                "catalogRuntimeEnabled": True,
                "artSkeletonId": _text(entry.get("artSkeletonId")),
                "petRoot": _text(entry.get("petRoot")),
                "battleRuntimeRoot": _text(entry.get("battleRuntimeRoot")),
                "battleRuntimeTreeSha256": _text(
                    entry.get("battleRuntimeTreeSha256")
                ).lower(),
                "sourceRuntimeFrameCount": EXPECTED_RUNTIME_FRAME_COUNT,
                "normalBattleActionIds": _strings(entry.get("legacyBattleActionIds")),
                "releaseEntrySha256": canonical_json_sha256(entry),
            }
        )
    return {
        "schemaVersion": 1,
        "cacheId": RUNTIME_CACHE_ID,
        "registryId": REGISTRY_ID,
        "canonicalJsonContractId": CANONICAL_JSON_CONTRACT_ID,
        "releaseSubjectSha256": registry_release_subject_sha256(registry),
        "sourceRuntimeFrameContract": {
            "views": FORMAL_VIEWS,
            "actions": FORMAL_ACTIONS,
            "frameCounts": FORMAL_FRAME_COUNTS,
            "expectedFrameCount": EXPECTED_RUNTIME_FRAME_COUNT,
        },
        "canonicalParityVectors": canonical_parity_vectors(),
        "entries": entries,
    }


def validate_runtime_cache(
    repo_root: Path,
    registry: dict[str, Any],
    cache_relative: Path = DEFAULT_RUNTIME_CACHE,
    *,
    runtime_cache_snapshot: dict[str, Any] | None = None,
    snapshot_cache: dict[Path, dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Validate the pinned internal cache without trusting its duplicated fields."""

    errors: list[str] = []
    reference = registry.get("runtimeCache")
    if not isinstance(reference, dict):
        reference = {}
        errors.append("registry runtimeCache must be an object")
    if set(reference) != {"contractId", "path", "sha256"}:
        errors.append("registry runtimeCache may only pin the internal cache contract/path/SHA-256")
    expected_reference_path = cache_relative.as_posix()
    if reference.get("contractId") != RUNTIME_CACHE_CONTRACT_ID:
        errors.append("registry runtimeCache contractId mismatch")
    if _text(reference.get("path")) != expected_reference_path:
        errors.append("registry runtimeCache path mismatch")
    pinned_sha = _text(reference.get("sha256")).lower()
    if not _is_sha256(pinned_sha):
        errors.append("registry runtimeCache SHA-256 is invalid")

    cache_path = _safe_repo_path(repo_root, expected_reference_path)
    cache: dict[str, Any] = {}
    cache_sha = ""
    cache_loaded = False
    if cache_path is None or not cache_path.is_file() or cache_path.is_symlink():
        errors.append("runtime cache is missing or unsafe")
    else:
        try:
            if runtime_cache_snapshot is not None:
                supplied_raw = runtime_cache_snapshot.get("rawBytes")
                if not isinstance(supplied_raw, bytes):
                    raise RuntimeError("runtime cache snapshot raw bytes are missing")
                cache_snapshot = _canonical_json_snapshot_from_bytes(
                    cache_path,
                    supplied_raw,
                )
            else:
                cache_snapshot = _read_canonical_json_snapshot(
                    cache_path,
                    snapshot_cache,
                )
            if cache_snapshot.get("path") != cache_path.resolve():
                raise RuntimeError("runtime cache snapshot path mismatch")
            raw_bytes = cache_snapshot.get("rawBytes")
            if not isinstance(raw_bytes, bytes):
                raise RuntimeError("runtime cache snapshot raw bytes are missing")
            if hashlib.sha256(raw_bytes).hexdigest() != cache_snapshot.get("sha256"):
                raise RuntimeError("runtime cache snapshot raw SHA-256 mismatch")
            cache = cache_snapshot["document"]
            cache_sha = cache_snapshot["sha256"]
            cache_loaded = True
            if cache_sha != pinned_sha:
                errors.append("runtime cache raw SHA-256 does not match registry pin")
        except RuntimeError as exc:
            errors.append(str(exc))

    expected_cache = build_runtime_cache_document(registry)
    if cache_loaded and not canonical_json_equal(cache, expected_cache):
        errors.append("runtime cache content differs from the audited registry candidate")
    if cache_loaded:
        if not canonical_json_equal(cache.get("schemaVersion"), 1):
            errors.append("runtime cache schemaVersion must be 1")
        if cache.get("cacheId") != RUNTIME_CACHE_ID:
            errors.append("runtime cacheId mismatch")
        if cache.get("registryId") != REGISTRY_ID:
            errors.append("runtime cache registryId mismatch")
        if cache.get("canonicalJsonContractId") != CANONICAL_JSON_CONTRACT_ID:
            errors.append("runtime cache canonical JSON contract mismatch")
        if _text(cache.get("releaseSubjectSha256")).lower() != registry_release_subject_sha256(
            registry
        ):
            errors.append("runtime cache release-subject SHA-256 mismatch")
        frame_contract = cache.get("sourceRuntimeFrameContract")
        if not isinstance(frame_contract, dict):
            errors.append("runtime cache sourceRuntimeFrameContract must be an object")
            frame_contract = {}
        for key in ("views", "actions"):
            value = frame_contract.get(key)
            if not isinstance(value, list) or any(not isinstance(item, str) for item in value):
                errors.append(f"runtime cache frame contract {key} must be a string-only array")
        vectors_value = cache.get("canonicalParityVectors")
        if not isinstance(vectors_value, list) or any(
            not isinstance(vector, dict) for vector in vectors_value
        ):
            errors.append("runtime cache canonicalParityVectors must be an object-only array")
        entries_value = cache.get("entries")
        if not isinstance(entries_value, list) or any(
            not isinstance(entry, dict) for entry in entries_value
        ):
            errors.append("runtime cache entries must be an object-only array")
        for entry in _objects(entries_value):
            actions = entry.get("normalBattleActionIds")
            if not isinstance(actions, list) or any(
                not isinstance(action, str) for action in actions
            ):
                errors.append(
                    f"runtime cache normalBattleActionIds must be string-only: {_text(entry.get('formId'))}"
                )
        for vector in _objects(cache.get("canonicalParityVectors")):
            if canonical_json_sha256(vector.get("value")) != _text(vector.get("sha256")):
                errors.append(
                    f"runtime cache canonical parity vector mismatch: {_text(vector.get('id'))}"
                )
    return {
        "ok": not errors,
        "path": expected_reference_path,
        "sha256": cache_sha,
        "pinnedSha256": pinned_sha,
        "releaseSubjectSha256": registry_release_subject_sha256(registry),
        "entryCount": len(_objects(cache.get("entries"))),
        "errors": list(dict.fromkeys(errors)),
    }


def derive_formal_wild_training_forms(
    repo_root: Path,
    progression_path: Path,
    catalog_form_ids: set[str],
    snapshot_cache: dict[Path, dict[str, Any]] | None = None,
) -> dict[str, Any]:
    errors: list[str] = []
    progression_document = _read_json(progression_path, snapshot_cache)
    active_id = _text(progression_document.get("activeProgressionId"))
    progressions = _strict_objects(
        progression_document.get("progressions"),
        "progression_zones progressions",
        errors,
    )
    active = next((entry for entry in progressions if _text(entry.get("id")) == active_id), None)
    if active is None:
        return {
            "activeProgressionId": active_id,
            "formIds": [],
            "derivedSetSha256": canonical_json_sha256([]),
            "trainingZoneCount": 0,
            "matchedEncounterZoneCount": 0,
            "matches": [],
            "errors": [*errors, "active progression does not exist"],
        }

    maps_by_id: dict[str, tuple[Path, dict[str, Any]]] = {}
    for map_path in sorted((repo_root / "client/godot/data").glob("*_map.json")):
        try:
            document = _read_json(map_path, snapshot_cache)
        except RuntimeError as exc:
            errors.append(str(exc))
            continue
        map_id = _text(document.get("id"))
        if not map_id:
            errors.append(f"map id is empty: {map_path}")
        elif map_id in maps_by_id:
            errors.append(f"duplicate map id: {map_id}")
        else:
            maps_by_id[map_id] = (map_path, document)

    form_ids: set[str] = set()
    matches: list[dict[str, Any]] = []
    active_zones = _strict_objects(
        active.get("zones"),
        f"active progression {active_id} zones",
        errors,
    )
    training_zones = [
        zone for zone in active_zones if _text(zone.get("contentType")) == "wild_training"
    ]
    for progression_zone in training_zones:
        progression_zone_id = _text(progression_zone.get("id"))
        group_id = _text(progression_zone.get("encounterGroupId"))
        map_ids = _strict_strings(
            progression_zone.get("mapIds"),
            f"wild_training zone {progression_zone_id} mapIds",
            errors,
        )
        if not progression_zone_id or not group_id or not map_ids:
            errors.append(f"wild_training zone has incomplete route identity: {progression_zone_id}")
            continue
        for map_id in map_ids:
            map_entry = maps_by_id.get(map_id)
            if map_entry is None:
                errors.append(f"wild_training zone references missing map: {progression_zone_id}/{map_id}")
                continue
            map_path, map_document = map_entry
            encounter_zones = _strict_objects(
                map_document.get("encounterZones"),
                f"map {map_id} encounterZones",
                errors,
            )
            encounter_matches = [
                encounter
                for encounter in encounter_zones
                if _text(encounter.get("encounterGroupId")) == group_id
                and encounter.get("manualOnly") is not True
            ]
            if not encounter_matches:
                errors.append(
                    f"wild_training zone has no exact encounterGroupId match: "
                    f"{progression_zone_id}/{map_id}/{group_id}"
                )
                continue
            for encounter in encounter_matches:
                encounter_form_ids: list[str] = []
                wild_pet_pool = _strict_objects(
                    encounter.get("wildPetPool"),
                    (
                        f"map {map_id} encounterZone "
                        f"{_text(encounter.get('id'))} wildPetPool"
                    ),
                    errors,
                )
                for wild_pet in wild_pet_pool:
                    form_id = _text(wild_pet.get("formId"))
                    if not form_id:
                        errors.append(
                            f"wildPetPool formId empty: {progression_zone_id}/{map_id}/"
                            f"{_text(encounter.get('id'))}"
                        )
                        continue
                    if form_id not in catalog_form_ids:
                        errors.append(f"wildPetPool formId missing from art catalog: {form_id}")
                    form_ids.add(form_id)
                    if form_id not in encounter_form_ids:
                        encounter_form_ids.append(form_id)
                matches.append(
                    {
                        "progressionZoneId": progression_zone_id,
                        "mapId": map_id,
                        "mapPath": str(map_path.relative_to(repo_root)),
                        "encounterZoneId": _text(encounter.get("id")),
                        "encounterGroupId": group_id,
                        "formIds": sorted(encounter_form_ids),
                    }
                )
    sorted_ids = sorted(form_ids)
    return {
        "activeProgressionId": active_id,
        "formIds": sorted_ids,
        "derivedSetSha256": canonical_json_sha256(sorted_ids),
        "trainingZoneCount": len(training_zones),
        "matchedEncounterZoneCount": len(matches),
        "matches": matches,
        "errors": errors,
    }


def build_report(
    repo_root: Path = REPO_ROOT,
    catalog_relative: Path = DEFAULT_CATALOG,
    registry_relative: Path = DEFAULT_REGISTRY,
    progression_relative: Path = DEFAULT_PROGRESSION,
    runtime_cache_relative: Path = DEFAULT_RUNTIME_CACHE,
    *,
    verify_runtime_cache: bool = True,
    registry_snapshot: dict[str, Any] | None = None,
    runtime_cache_snapshot: dict[str, Any] | None = None,
) -> dict[str, Any]:
    repo_root = repo_root.resolve()
    catalog_path = (repo_root / catalog_relative).resolve()
    registry_path = (repo_root / registry_relative).resolve()
    progression_path = (repo_root / progression_relative).resolve()
    snapshot_cache: dict[Path, dict[str, Any]] = {}
    catalog = _read_json(catalog_path, snapshot_cache)
    bound_registry_snapshot = (
        _bind_json_snapshot(registry_path, registry_snapshot, snapshot_cache)
        if registry_snapshot is not None
        else _read_canonical_json_snapshot(registry_path, snapshot_cache)
    )
    registry = copy.deepcopy(bound_registry_snapshot["document"])
    if not isinstance(registry, dict):
        raise RuntimeError("registry snapshot root must be an object")
    bound_runtime_cache_snapshot: dict[str, Any] | None = None
    if runtime_cache_snapshot is not None:
        runtime_cache_path = (repo_root / runtime_cache_relative).resolve()
        bound_runtime_cache_snapshot = _bind_json_snapshot(
            runtime_cache_path,
            runtime_cache_snapshot,
            snapshot_cache,
        )
    errors = _registry_errors(registry)
    if not canonical_json_equal(catalog.get("schemaVersion"), 1):
        errors.append("art catalog schemaVersion must be 1")
    forms_value = catalog.get("forms")
    if not isinstance(forms_value, list):
        errors.append("art catalog forms must be an array")
        forms_value = []
    if any(not isinstance(form, dict) for form in forms_value):
        errors.append("art catalog forms may only contain objects")
    forms = _objects(forms_value)
    catalog_form_ids = [_text(form.get("formId")) for form in forms]
    if not catalog_form_ids or len(catalog_form_ids) != len(set(catalog_form_ids)):
        errors.append("art catalog formIds are empty or duplicated")
    coverage = derive_formal_wild_training_forms(
        repo_root,
        progression_path,
        set(catalog_form_ids),
        snapshot_cache,
    )
    errors.extend(coverage["errors"])
    coverage_contract = registry.get("coverageContract") if isinstance(registry.get("coverageContract"), dict) else {}
    expected_count = coverage_contract.get("formalWildTrainingExpectedCount")
    expected_hash = _text(coverage_contract.get("formalWildTrainingDerivedSetSha256")).lower()
    if not canonical_json_equal(len(coverage["formIds"]), expected_count):
        errors.append(
            f"formal wild-training derived form count mismatch: "
            f"{len(coverage['formIds'])} != {expected_count}"
        )
    if coverage["derivedSetSha256"] != expected_hash:
        errors.append("formal wild-training derived form set SHA-256 drift")

    rows: list[dict[str, Any]] = []
    runtime_candidates: list[dict[str, Any]] = []
    formal_wild_set = set(coverage["formIds"])
    rows_by_id: dict[str, dict[str, Any]] = {}
    for form in forms:
        form_id = _text(form.get("formId"))
        pet = form.get("pet") if isinstance(form.get("pet"), dict) else {}
        metadata_repo_path = _text(pet.get("metadataPath"))
        metadata_path = _safe_repo_path(repo_root, metadata_repo_path)
        metadata: dict[str, Any] = {}
        metadata_sha = ""
        row_errors: list[str] = []
        if metadata_path is None or not metadata_path.is_file():
            row_errors.append("metadata path missing or unsafe")
        else:
            try:
                metadata_snapshot = _read_json_snapshot(metadata_path, snapshot_cache)
                metadata = metadata_snapshot["document"]
                metadata_sha = metadata_snapshot["sha256"]
            except RuntimeError as exc:
                row_errors.append(str(exc))
        formal_entry = next(iter(_entries_for_form(registry.get("formalReleaseEntries"), form_id)), {})
        legacy_entry = next(
            iter(_entries_for_form(registry.get("legacyCompatibilityExceptions"), form_id)),
            {},
        )
        authority = (
            _authority_status(repo_root, formal_entry, snapshot_cache)
            if formal_entry
            else {}
        )
        runtime_tree = (
            runtime_tree_snapshot(repo_root, form, metadata, snapshot_cache)
            if formal_entry or legacy_entry
            else {}
        )
        decision = resolve_documents(
            form_id,
            form,
            metadata,
            metadata_sha,
            registry,
            authority,
            runtime_tree,
        )
        row_errors.extend(decision["errors"])
        battle = metadata.get("battleVisual") if isinstance(metadata.get("battleVisual"), dict) else {}
        row = {
            "formId": form_id,
            "displayName": _text(form.get("displayName")),
            "artSkeletonId": _text(form.get("artSkeletonId")),
            "formalWildTraining": form_id in formal_wild_set,
            "catalogStatus": _text(form.get("status")),
            "catalogRuntimeEnabled": form.get("runtimeEnabled") is True,
            "petRoot": _text(pet.get("root")),
            "metadataPath": metadata_repo_path,
            "metadataSha256": metadata_sha,
            "metadataFormId": _text(metadata.get("formId")),
            "metadataRuntimeEnabled": metadata.get("runtimeEnabled") is True,
            "battleVisualStatus": _text(battle.get("status")),
            "battleVisualRuntimeEnabled": battle.get("runtimeEnabled") is True,
            "battleRuntimeRoot": _text(battle.get("runtimeRoot")),
            "battleBundleDigest": _text(battle.get("bundleDigest")).lower(),
            "battleRuntimeDigest": _text(battle.get("runtimeBundleDigest")).lower(),
            "battleRuntimeTreeSha256": _text(runtime_tree.get("sha256")).lower(),
            "battleRuntimeFrameCount": runtime_tree.get("frameCount", 0),
            "battleInstallManifestSha256": _text(runtime_tree.get("installManifestSha256")).lower(),
            "battleInstallManifestRuntimeFrameHashCount": runtime_tree.get(
                "installManifestRuntimeFrameHashCount",
                0,
            ),
            **{key: value for key, value in decision.items() if key != "errors"},
            "errors": row_errors,
        }
        rows.append(row)
        rows_by_id[form_id] = row
        if form.get("runtimeEnabled") is True:
            runtime_candidates.append(
                {
                    "formId": form_id,
                    "catalogStatus": row["catalogStatus"],
                    "releaseMode": row["releaseMode"],
                    "formalRelease": row["formalRelease"],
                    "legacyCompatibilityException": row["legacyCompatibilityException"],
                    "normalRuntimeAllowed": row["normalRuntimeAllowed"],
                }
            )
            if not row["normalRuntimeAllowed"]:
                errors.append(f"catalog runtimeEnabled form is blocked by exact-form gate: {form_id}")
            if row["catalogStatus"] == "in_production" and row["releaseMode"] != MODE_LEGACY:
                errors.append(f"in_production + runtimeEnabled bypass attempt: {form_id}")

    for entry in _objects(registry.get("formalReleaseEntries")):
        form_id = _text(entry.get("formId"))
        row = rows_by_id.get(form_id)
        if row is None:
            errors.append(f"formal release entry references unknown catalog form: {form_id}")
        elif row["releaseMode"] != MODE_FORMAL or row["errors"]:
            errors.append(f"formal release entry failed exact-form validation: {form_id}")
    for entry in _objects(registry.get("legacyCompatibilityExceptions")):
        form_id = _text(entry.get("formId"))
        row = rows_by_id.get(form_id)
        if row is None:
            errors.append(f"legacy exception references unknown catalog form: {form_id}")
        elif row["releaseMode"] != MODE_LEGACY or row["errors"]:
            errors.append(f"legacy compatibility exception failed isolation validation: {form_id}")

    runtime_cache_status: dict[str, Any] = {
        "ok": False,
        "path": runtime_cache_relative.as_posix(),
        "sha256": "",
        "pinnedSha256": "",
        "releaseSubjectSha256": registry_release_subject_sha256(registry),
        "entryCount": 0,
        "errors": ["runtime cache verification was explicitly skipped"],
    }
    if verify_runtime_cache:
        runtime_cache_status = validate_runtime_cache(
            repo_root,
            registry,
            runtime_cache_relative,
            runtime_cache_snapshot=bound_runtime_cache_snapshot,
            snapshot_cache=snapshot_cache,
        )
        errors.extend(runtime_cache_status["errors"])

    formal_release_count = sum(row["releaseMode"] == MODE_FORMAL for row in rows)
    legacy_count = sum(row["releaseMode"] == MODE_LEGACY for row in rows)
    denied_count = sum(row["releaseMode"] == MODE_PLACEHOLDER for row in rows)
    unique_errors = list(dict.fromkeys(errors))
    return {
        "schemaVersion": 1,
        "reportType": "beastbound_pet_battle_exact_form_release_coverage",
        "scope": registry.get("scope", ""),
        "status": "passed" if not unique_errors else "failed",
        "catalogPath": str(catalog_path.relative_to(repo_root)),
        "registryPath": str(registry_path.relative_to(repo_root)),
        "progressionPath": str(progression_path.relative_to(repo_root)),
        "catalogFormCount": len(rows),
        "formalReleaseCount": formal_release_count,
        "legacyCompatibilityExceptionCount": legacy_count,
        "proceduralPlaceholderCount": denied_count,
        "runtimeCandidateCount": len(runtime_candidates),
        "runtimeCandidates": runtime_candidates,
        "formalWildTrainingFormCount": len(coverage["formIds"]),
        "formalWildTrainingForms": coverage["formIds"],
        "formalWildTrainingDerivation": {
            "activeProgressionId": coverage["activeProgressionId"],
            "trainingZoneCount": coverage["trainingZoneCount"],
            "matchedEncounterZoneCount": coverage["matchedEncounterZoneCount"],
            "derivedSetSha256": coverage["derivedSetSha256"],
            "matches": coverage["matches"],
        },
        "policy": registry.get("policy", {}),
        "runtimeCache": runtime_cache_status,
        "forms": rows,
        "errors": unique_errors,
    }


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-root", type=Path, default=REPO_ROOT)
    parser.add_argument("--catalog", type=Path, default=DEFAULT_CATALOG)
    parser.add_argument("--registry", type=Path, default=DEFAULT_REGISTRY)
    parser.add_argument("--progression", type=Path, default=DEFAULT_PROGRESSION)
    parser.add_argument("--runtime-cache", type=Path, default=DEFAULT_RUNTIME_CACHE)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--require-valid", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = _parse_args()
    try:
        report = build_report(
            args.repo_root,
            args.catalog,
            args.registry,
            args.progression,
            args.runtime_cache,
        )
    except RuntimeError as exc:
        report = {
            "schemaVersion": 1,
            "reportType": "beastbound_pet_battle_exact_form_release_coverage",
            "status": "failed",
            "errors": [str(exc)],
        }
    rendered = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        output = args.output if args.output.is_absolute() else args.repo_root / args.output
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(rendered, encoding="utf-8")
    if args.json:
        print(rendered, end="")
    else:
        print(
            "pet battle release gate: "
            f"{report.get('status')} forms={report.get('catalogFormCount', 0)} "
            f"formal={report.get('formalReleaseCount', 0)} "
            f"legacy={report.get('legacyCompatibilityExceptionCount', 0)} "
            f"wild_training={report.get('formalWildTrainingFormCount', 0)}"
        )
        if args.output:
            print(f"report={output}")
        for error in report.get("errors", []):
            print(f"ERROR {error}")
    return 1 if args.require_valid and report.get("status") != "passed" else 0


if __name__ == "__main__":
    raise SystemExit(main())
