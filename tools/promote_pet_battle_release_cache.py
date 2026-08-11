#!/usr/bin/env python3
"""Deterministically promote the audited standalone pet battle startup cache.

This tool never changes release entries or asset approval state.  It only writes
the internal runtime cache and the registry pin that protects the exact bytes of
that cache.  Source PNG/metadata/attestation validation remains authoritative in
``audit_pet_battle_release_gate.py`` and must pass before promotion.
"""

from __future__ import annotations

import argparse
from contextlib import contextmanager
import fcntl
import hashlib
import json
import os
from pathlib import Path
import tempfile
from typing import Any

try:
    from tools.audit_pet_battle_release_gate import (
        DEFAULT_REGISTRY,
        DEFAULT_RUNTIME_CACHE,
        REPO_ROOT,
        RUNTIME_CACHE_CONTRACT_ID,
        _canonical_json_snapshot_from_bytes,
        _read_json_snapshot,
        build_report,
        build_runtime_cache_document,
        registry_release_subject,
        registry_release_subject_sha256,
    )
except ModuleNotFoundError:  # Direct ``python tools/...py`` execution.
    from audit_pet_battle_release_gate import (
        DEFAULT_REGISTRY,
        DEFAULT_RUNTIME_CACHE,
        REPO_ROOT,
        RUNTIME_CACHE_CONTRACT_ID,
        _canonical_json_snapshot_from_bytes,
        _read_json_snapshot,
        build_report,
        build_runtime_cache_document,
        registry_release_subject,
        registry_release_subject_sha256,
    )


def render_json(value: Any) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def _sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def promotion_candidate(
    repo_root: Path,
    registry_relative: Path = DEFAULT_REGISTRY,
    runtime_cache_relative: Path = DEFAULT_RUNTIME_CACHE,
) -> dict[str, Any]:
    repo_root = repo_root.resolve()
    registry_path = (repo_root / registry_relative).resolve()
    try:
        source_registry_bytes = registry_path.read_bytes()
        registry_snapshot = _canonical_json_snapshot_from_bytes(
            registry_path,
            source_registry_bytes,
        )
        registry = registry_snapshot["document"]
    except (OSError, RuntimeError) as exc:
        raise RuntimeError(f"cannot read registry snapshot {registry_path}: {exc}") from exc
    if not isinstance(registry, dict):
        raise RuntimeError("registry snapshot root must be an object")
    source_registry_sha = _sha256_bytes(source_registry_bytes)
    source_release_subject_sha = registry_release_subject_sha256(registry)
    report = build_report(
        repo_root,
        registry_relative=registry_relative,
        runtime_cache_relative=runtime_cache_relative,
        verify_runtime_cache=False,
        registry_snapshot=registry_snapshot,
    )
    if report.get("status") != "passed":
        raise RuntimeError(
            "source release audit failed before runtime-cache promotion: "
            + "; ".join(str(error) for error in report.get("errors", []))
        )
    if registry_path.read_bytes() != source_registry_bytes:
        raise RuntimeError("registry bytes changed while source release audit was running")
    release_subject_before = registry_release_subject(registry)
    cache = build_runtime_cache_document(registry)
    cache_bytes = render_json(cache)
    cache_sha = _sha256_bytes(cache_bytes)
    updated_registry = json.loads(json.dumps(registry, ensure_ascii=False))
    updated_registry["runtimeCache"] = {
        "contractId": RUNTIME_CACHE_CONTRACT_ID,
        "path": runtime_cache_relative.as_posix(),
        "sha256": cache_sha,
    }
    if registry_release_subject(updated_registry) != release_subject_before:
        raise RuntimeError("runtime-cache promotion attempted to mutate release-subject facts")
    return {
        "repoRoot": repo_root,
        "registryPath": registry_path,
        "runtimeCachePath": (repo_root / runtime_cache_relative).resolve(),
        "registry": updated_registry,
        "registryBytes": render_json(updated_registry),
        "runtimeCache": cache,
        "runtimeCacheBytes": cache_bytes,
        "runtimeCacheSha256": cache_sha,
        "releaseSubjectSha256": cache["releaseSubjectSha256"],
        "sourceRegistryBytes": source_registry_bytes,
        "sourceRegistrySha256": source_registry_sha,
        "sourceReleaseSubjectSha256": source_release_subject_sha,
        "sourceReport": report,
    }


def check_candidate(candidate: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    for label, path_key, bytes_key in (
        ("registry", "registryPath", "registryBytes"),
        ("runtime cache", "runtimeCachePath", "runtimeCacheBytes"),
    ):
        path = Path(candidate[path_key])
        if not path.is_file() or path.is_symlink():
            errors.append(f"{label} file is missing or unsafe: {path}")
            continue
        if path.read_bytes() != candidate[bytes_key]:
            errors.append(f"{label} bytes differ from deterministic promotion candidate")
    return errors


def _atomic_write(path: Path, payload: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=path.parent, prefix=f".{path.name}.", delete=False) as handle:
        temporary = Path(handle.name)
        handle.write(payload)
        handle.flush()
        os.fsync(handle.fileno())
    try:
        os.replace(temporary, path)
    finally:
        if temporary.exists():
            temporary.unlink()


@contextmanager
def _promotion_lock(repo_root: Path):
    lock_path = repo_root.resolve() / ".run/locks/pet-battle-release-cache-promotion.lock"
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    with lock_path.open("a+b") as handle:
        fcntl.flock(handle.fileno(), fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(handle.fileno(), fcntl.LOCK_UN)


def _apply_candidate_locked(candidate: dict[str, Any]) -> None:
    registry_path = Path(candidate["registryPath"])
    source_registry_bytes = candidate["sourceRegistryBytes"]
    if not registry_path.is_file():
        raise RuntimeError("registry bytes drifted before runtime-cache promotion write")
    current_snapshot = _read_json_snapshot(registry_path)
    if current_snapshot["rawBytes"] != source_registry_bytes:
        raise RuntimeError("registry bytes drifted before runtime-cache promotion write")
    current_registry = current_snapshot["document"]
    if (
        registry_release_subject_sha256(current_registry)
        != candidate["sourceReleaseSubjectSha256"]
    ):
        raise RuntimeError("registry release subject drifted before runtime-cache promotion write")
    # Cache first keeps any interrupted promotion fail-closed under the old pin.
    _atomic_write(Path(candidate["runtimeCachePath"]), candidate["runtimeCacheBytes"])
    if registry_path.read_bytes() != source_registry_bytes:
        raise RuntimeError("registry bytes drifted immediately before registry pin write")
    _atomic_write(registry_path, candidate["registryBytes"])
    if registry_path.read_bytes() != candidate["registryBytes"]:
        raise RuntimeError("registry pin bytes drifted immediately after promotion write")


def apply_candidate(candidate: dict[str, Any]) -> None:
    with _promotion_lock(Path(candidate["repoRoot"])):
        _apply_candidate_locked(candidate)


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-root", type=Path, default=REPO_ROOT)
    parser.add_argument("--registry", type=Path, default=DEFAULT_REGISTRY)
    parser.add_argument("--runtime-cache", type=Path, default=DEFAULT_RUNTIME_CACHE)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true")
    mode.add_argument("--apply", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = _parse_args()
    try:
        with _promotion_lock(args.repo_root):
            candidate = promotion_candidate(
                args.repo_root,
                args.registry,
                args.runtime_cache,
            )
            if args.apply:
                _apply_candidate_locked(candidate)
            errors = check_candidate(candidate)
    except (RuntimeError, OSError) as exc:
        errors = [str(exc)]
        candidate = {}
    if errors:
        for error in errors:
            print(f"ERROR {error}")
        return 1
    print(
        "pet battle runtime cache: passed "
        f"entries={len(candidate['runtimeCache']['entries'])} "
        f"cache_sha256={candidate['runtimeCacheSha256']} "
        f"release_subject_sha256={candidate['releaseSubjectSha256']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
