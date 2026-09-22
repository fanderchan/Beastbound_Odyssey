"""Recognize a catalog-only promotion without rewriting captured v2 identities.

Rebuild the capture digest from *current* runtime bytes, substituting only a
Git ancestor's primary catalog, verified literal QA registrations and the
disabled-ground fixture map when that fixture was just promoted.
Any changed renderer, HUD, map, asset, review catalog or validation code remains
in the digest and cannot be excused by a release-lifecycle transition.
"""

from __future__ import annotations

import hashlib
import importlib.util
import json
from pathlib import Path
import re
import subprocess
from typing import Any

PRIMARY = "data/map_visual_catalog.json"
REVIEW = "data/map_visual_review_catalog.json"
CHECK = "scripts/qa/map_visual_runtime_check.gd"
GROUND_CHECK = "scripts/qa/world_ground_layer_check.gd"
IDENTITY = re.compile(r"^git:([0-9a-f]{40})\+beastbound-map-runtime-surface-v2:([0-9a-f]{64})$")
MANIFEST_KEYS = (
    "schemaVersion", "bundleId", "mapStyleId", "mapIds", "tileSize",
    "groundAtlas", "tiles", "objects", "mapBindings",
)


def _load_builder(repo: Path):
    spec = importlib.util.spec_from_file_location(
        "_promotion_identity_builder", repo / "tools/map_visual_evidence_builder.py"
    )
    if spec is None or spec.loader is None:
        raise ValueError("Cannot load the frozen runtime identity implementation")
    builder = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(builder)
    return builder


def _runtime_surface(repo: Path, builder: Any, overrides: dict[str, bytes]) -> str:
    """Reproduce v2 byte-for-byte; overrides are restricted by the caller."""
    if not set(overrides).issubset({PRIMARY, CHECK, GROUND_CHECK}):
        raise ValueError("Only catalog promotion metadata can be reconstructed")
    godot = repo / "client/godot"
    digest = hashlib.sha256()
    builder._add_identity_file(digest, builder.PROJECT_SETTINGS_IDENTITY_PATH,
                              builder._project_settings_identity_bytes(godot / "project.godot"))
    for relative in builder.RUNTIME_IDENTITY_FILES:
        value = overrides.get(relative)
        builder._add_identity_file(digest, relative,
                                  (godot / relative).read_bytes() if value is None else value)
    for relative_root, _map_ids in builder.MAP_BUNDLES.values():
        root = godot / relative_root
        manifest = json.loads((root / "map-visual-bundle.json").read_bytes())
        builder._add_identity_file(
            digest, f"{relative_root}/map-visual-bundle.runtime-subject.json",
            builder._canonical_json_bytes({key: manifest.get(key) for key in MANIFEST_KEYS}),
        )
        for directory in ("bindings", "runtime"):
            for path in sorted((root / directory).rglob("*")):
                if path.is_file() and path.suffix != ".import" and path.name != ".DS_Store":
                    builder._add_identity_file(digest, path.relative_to(godot).as_posix(), path.read_bytes())
    return digest.hexdigest()


def _catalog(data: bytes) -> dict[str, dict[str, str]]:
    value = json.loads(data)
    if (not isinstance(value, dict) or set(value) != {"schemaVersion", "entries"}
            or type(value["schemaVersion"]) is not int or value["schemaVersion"] != 1
            or not isinstance(value["entries"], list)):
        raise ValueError("Invalid catalog")
    entries = {}
    for entry in value["entries"]:
        if not isinstance(entry, dict) or set(entry) != {"mapId", "bundleManifest", "bindingPath"}:
            raise ValueError("Invalid catalog entry")
        map_id = entry["mapId"]
        if not isinstance(map_id, str) or not re.fullmatch(r"[a-z0-9][a-z0-9_-]*", map_id) or map_id in entries:
            raise ValueError("Invalid or duplicate map")
        for key in ("bundleManifest", "bindingPath"):
            path = entry[key]
            if (not isinstance(path, str) or not path.startswith("res://") or "\\" in path
                    or Path(path[6:]).is_absolute() or ".." in Path(path[6:]).parts):
                raise ValueError("Invalid resource path")
        entries[map_id] = entry
    return entries


def _registrations(data: bytes) -> tuple[str, dict[str, Any]]:
    source = data.decode("utf-8")
    values = {}
    for name, pattern in (
        ("EXPECTED_MAP_IDS", r"^const EXPECTED_MAP_IDS: Array\[String\] = (\[.*?^\])"),
        ("BINDING_PATHS", r"^const BINDING_PATHS := (\{.*?^\})"),
        ("BUNDLE_MAP_IDS", r"^const BUNDLE_MAP_IDS := (\{.*?^\})"),
    ):
        matches = list(re.finditer(pattern, source, re.MULTILINE | re.DOTALL))
        if len(matches) != 1:
            raise ValueError("Missing or ambiguous literal QA registration")
        match = matches[0]
        values[name] = json.loads(re.sub(r",\s*([}\]])", r"\1", match.group(1)))
        source = source[:match.start()] + f"<catalog-registration:{name}>" + source[match.end():]
    return source, values


def _registry_matches(values: dict, entries: dict, godot: Path) -> bool:
    ids = values["EXPECTED_MAP_IDS"]
    if not isinstance(ids, list) or len(ids) != len(set(ids)) or set(ids) != set(entries):
        return False
    if values["BINDING_PATHS"] != {key: entry["bindingPath"] for key, entry in entries.items()}:
        return False
    bundles: dict[str, list[str]] = {}
    for map_id, entry in entries.items():
        path = (godot / entry["bundleManifest"][6:]).resolve()
        path.relative_to(godot.resolve())
        manifest = json.loads(path.read_bytes())
        bundles.setdefault(manifest["bundleId"], []).append(map_id)
    declared = values["BUNDLE_MAP_IDS"]
    return (isinstance(declared, dict) and set(declared) == set(bundles)
            and all(isinstance(declared[key], list)
                    and len(declared[key]) == len(set(declared[key]))
                    and set(declared[key]) == set(ids) for key, ids in bundles.items()))


def _fallback_fixture_matches(old: bytes, new: bytes, added: set[str],
                              primary: dict, review: dict) -> bool:
    if old == new:
        return True
    # Only switch the disabled-ground test's map after its former fixture was
    # promoted. Preserve every assertion and the rest of the QA code verbatim.
    pattern = rb'(\thost\.map_art_review_preview = false\n\thost\._load_map\(")([a-z0-9_]+)("\))'
    before, after = list(re.finditer(pattern, old)), list(re.finditer(pattern, new))
    if len(before) != 1 or len(after) != 1:
        return False
    previous, replacement = before[0][2].decode(), after[0][2].decode()
    return (previous in added and replacement in review and replacement not in primary
            and old[:before[0].start(2)] + after[0][2] + old[before[0].end(2):] == new)


def matches_catalog_promotion(captured: str, current: str, repo: Path) -> bool:
    """Fail closed unless the entire digest difference is a proven promotion."""
    old, new = IDENTITY.fullmatch(captured), IDENTITY.fullmatch(current)
    if old is None or new is None:
        return False
    try:
        def git(*args: str) -> bytes:
            return subprocess.run(["git", *args], cwd=repo, check=True,
                                  capture_output=True, timeout=10).stdout

        git("merge-base", "--is-ancestor", old[1], new[1])
        if git("rev-parse", "HEAD").decode().strip() != new[1]:
            return False
        historical = {relative: git("show", f"{old[1]}:client/godot/{relative}")
                      for relative in (PRIMARY, REVIEW, CHECK, GROUND_CHECK)}
        godot = repo / "client/godot"
        if historical[REVIEW] != (godot / REVIEW).read_bytes():
            return False
        before = _catalog(historical[PRIMARY])
        after = _catalog((godot / PRIMARY).read_bytes())
        review = _catalog(historical[REVIEW])
        added = set(after) - set(before)
        if not added or any(after.get(key) != value for key, value in before.items()):
            return False
        for map_id in added:
            if after[map_id] != review.get(map_id):
                return False
            manifest_path = (godot / after[map_id]["bundleManifest"][6:]).resolve()
            manifest_path.relative_to(godot.resolve())
            manifest = json.loads(manifest_path.read_bytes())
            if (not isinstance(manifest.get("mapIds"), list)
                    or not set(manifest["mapIds"]).issubset(added)
                    or map_id not in manifest["mapIds"]
                    or any(after.get(key) != review.get(key) for key in manifest["mapIds"])):
                return False
        old_code, old_registry = _registrations(historical[CHECK])
        current_check = (godot / CHECK).read_bytes()
        new_code, new_registry = _registrations(current_check)
        if old_code != new_code or not _registry_matches(old_registry, before, godot):
            return False
        if current_check != historical[CHECK] and not _registry_matches(new_registry, after, godot):
            return False
        if not _fallback_fixture_matches(historical[GROUND_CHECK],
                (godot / GROUND_CHECK).read_bytes(), added, after, review):
            return False
        builder = _load_builder(repo)
        if _runtime_surface(repo, builder, {}) != new[2]:
            return False
        return _runtime_surface(repo, builder, {key: historical[key]
            for key in (PRIMARY, CHECK, GROUND_CHECK)}) == old[2]
    except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError):
        return False
