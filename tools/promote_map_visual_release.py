#!/usr/bin/env python3
"""Promote one frozen Beastbound map visual bundle to a formal release.

The promoter is deliberately separate from the bundle auditor and from runtime
code.  It consumes only evidence already referenced by the candidate manifest;
it never creates Computer Use, collision, performance, or runner evidence.

Promotion is fail-closed and happens in two audited candidate phases:

1. ``approved`` records owner acceptance while both runtime flags remain false.
   The only permitted remaining release gate is the lifecycle gate.
2. ``released`` enables the two runtime flags.  The exact candidate must pass
   all three pre-export conditions.

The detached root release attestation freezes independent manifest, evidence,
asset, and bundle summaries.  Those summaries intentionally exclude lifecycle,
owner acceptance, and the attestation reference.  The manifest then freezes
the attestation path/hash, and owner acceptance freezes that manifest review
subject, so this ordering has no hash cycle.
"""

from __future__ import annotations

import argparse
import copy
from dataclasses import dataclass
from datetime import datetime
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import sys
import tempfile
from types import ModuleType
from typing import Any, Callable, Sequence


REPO_ROOT = Path(__file__).resolve().parents[1]
AUDITOR_PATH = (
    REPO_ROOT
    / ".agents/skills/design-beastbound-maps/scripts/audit_map_bundle.py"
)
MANIFEST_NAME = "map-visual-bundle.json"
OWNER_ACCEPTANCE_PATH = "evidence/owner-acceptance.json"
RELEASE_ATTESTATION_PATH = "release-attestation.json"
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
UNATTESTED_PENDING_GATES = (
    "lifecycle_released_and_enabled",
    "owner_acceptance",
    "release_attestation",
)
ATTESTED_PENDING_GATES = ("lifecycle_released_and_enabled", "owner_acceptance")
APPROVED_GATES = ("lifecycle_released_and_enabled",)


class PromotionError(RuntimeError):
    """A fail-closed map visual release-promotion error."""


@dataclass(frozen=True)
class AuditSnapshot:
    status: str
    release_ready: bool
    missing_release_gates: tuple[str, ...]
    errors: tuple[str, ...]
    warnings: tuple[str, ...]
    bundle_id: str
    files_checked: tuple[str, ...]
    pngs_checked: int
    jsons_checked: int
    review_subject_sha256: str

    def summary(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "releaseReady": self.release_ready,
            "missingReleaseGates": list(self.missing_release_gates),
            "filesChecked": len(self.files_checked),
            "pngsChecked": self.pngs_checked,
            "jsonsChecked": self.jsons_checked,
            "manifestReviewSubjectSha256": self.review_subject_sha256,
        }


@dataclass(frozen=True)
class PromotionCandidate:
    bundle_id: str
    input_manifest_sha256: str
    input_files: tuple[tuple[str, str], ...]
    manifest_bytes: bytes
    owner_acceptance_bytes: bytes
    release_attestation_bytes: bytes
    approved_audit: AuditSnapshot
    released_audit: AuditSnapshot
    release_summary_sha256: str

    def summary(self) -> dict[str, Any]:
        return {
            "bundleId": self.bundle_id,
            "inputManifestSha256": self.input_manifest_sha256,
            "ownerAcceptance": {
                "path": OWNER_ACCEPTANCE_PATH,
                "sha256": _sha256_bytes(self.owner_acceptance_bytes),
            },
            "releaseAttestation": {
                "path": RELEASE_ATTESTATION_PATH,
                "sha256": _sha256_bytes(self.release_attestation_bytes),
                "bundleSummarySha256": self.release_summary_sha256,
            },
            "approvedAudit": self.approved_audit.summary(),
            "releasedAudit": self.released_audit.summary(),
        }


_AUDITOR_MODULE: ModuleType | None = None


def _auditor_module() -> ModuleType:
    global _AUDITOR_MODULE
    if _AUDITOR_MODULE is not None:
        return _AUDITOR_MODULE
    if not AUDITOR_PATH.is_file():
        raise PromotionError(f"地图 bundle auditor 不存在：{AUDITOR_PATH}")
    name = "_beastbound_map_bundle_auditor"
    spec = importlib.util.spec_from_file_location(name, AUDITOR_PATH)
    if spec is None or spec.loader is None:
        raise PromotionError(f"无法加载地图 bundle auditor：{AUDITOR_PATH}")
    module = importlib.util.module_from_spec(spec)
    # dataclasses resolves annotation modules through sys.modules.
    sys.modules[name] = module
    try:
        spec.loader.exec_module(module)
    except Exception as error:
        sys.modules.pop(name, None)
        raise PromotionError(f"加载地图 bundle auditor 失败：{error}") from error
    _AUDITOR_MODULE = module
    return module


def _sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    try:
        with path.open("rb") as stream:
            for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(chunk)
    except OSError as error:
        raise PromotionError(f"无法读取文件：{path}: {error}") from error
    return digest.hexdigest()


def _json_bytes(value: Any) -> bytes:
    return (
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=False) + "\n"
    ).encode("utf-8")


def _read_json(path: Path, *, label: str) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise PromotionError(f"无法读取 {label}：{path}: {error}") from error
    if not isinstance(value, dict):
        raise PromotionError(f"{label} 根节点必须是 JSON object：{path}")
    return value


def _resolve_bundle(value: str) -> Path:
    candidate = Path(value).expanduser().resolve()
    manifest = candidate / MANIFEST_NAME if candidate.is_dir() else candidate
    if manifest.name != MANIFEST_NAME or not manifest.is_file():
        raise PromotionError(
            f"必须指向 bundle 目录或 {MANIFEST_NAME}：{value}"
        )
    return manifest.parent.resolve()


def _find_godot_root(bundle: Path) -> Path:
    for candidate in (bundle, *bundle.parents):
        if (candidate / "project.godot").is_file():
            return candidate.resolve()
    raise PromotionError(
        f"无法从 bundle 父链定位 Godot project.godot：{bundle}"
    )


def _copy_file_exact(source: Path, destination: Path, *, label: str) -> None:
    if not source.is_file():
        raise PromotionError(f"{label} 不存在：{source}")
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)
    if _sha256_file(source) != _sha256_file(destination):
        raise PromotionError(f"{label} 镜像复制后 hash 不一致")


def _map_data_paths(
    map_data_catalog_path: Path, map_ids: list[str]
) -> dict[str, str]:
    try:
        source = map_data_catalog_path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError) as error:
        raise PromotionError(f"无法读取 MapDataCatalog：{error}") from error
    discovered: dict[str, str] = {}
    for match in re.finditer(
        r'"([a-z0-9][a-z0-9_-]*)"\s*:\s*"(res://data/[^"\r\n]+\.json)"',
        source,
    ):
        map_id, path = match.groups()
        if map_id in discovered and discovered[map_id] != path:
            raise PromotionError(f"MapDataCatalog 含重复 mapId：{map_id}")
        discovered[map_id] = path
    missing = sorted(set(map_ids) - set(discovered))
    if missing:
        raise PromotionError(f"MapDataCatalog 缺少 mapId：{missing!r}")
    return {map_id: discovered[map_id] for map_id in map_ids}


def _create_candidate_project(
    source_bundle: Path,
    mirror_root: Path,
) -> Path:
    source_godot_root = _find_godot_root(source_bundle)
    try:
        relative_bundle = source_bundle.resolve().relative_to(
            source_godot_root
        )
    except ValueError as error:
        raise PromotionError("bundle 不在所属 Godot project 内") from error
    manifest = _read_json(source_bundle / MANIFEST_NAME, label=MANIFEST_NAME)
    map_ids = manifest.get("mapIds")
    if (
        not isinstance(map_ids, list)
        or not map_ids
        or not all(isinstance(value, str) and value for value in map_ids)
    ):
        raise PromotionError("manifest.mapIds 必须是非空字符串数组")

    _copy_file_exact(
        source_godot_root / "project.godot",
        mirror_root / "project.godot",
        label="project.godot",
    )
    _copy_file_exact(
        source_godot_root / "data/map_visual_catalog.json",
        mirror_root / "data/map_visual_catalog.json",
        label="map_visual_catalog.json",
    )
    map_data_catalog = source_godot_root / "scripts/world/map_data_catalog.gd"
    _copy_file_exact(
        map_data_catalog,
        mirror_root / "scripts/world/map_data_catalog.gd",
        label="map_data_catalog.gd",
    )
    for map_id, res_path in _map_data_paths(map_data_catalog, map_ids).items():
        relative = Path(res_path.removeprefix("res://"))
        _copy_file_exact(
            source_godot_root / relative,
            mirror_root / relative,
            label=f"authoritative map data {map_id}",
        )

    candidate_bundle = mirror_root / relative_bundle
    shutil.copytree(source_bundle, candidate_bundle, symlinks=False)
    return candidate_bundle


def _safe_bundle_path(bundle: Path, value: Any, *, label: str) -> Path:
    if not isinstance(value, str) or not value or "\\" in value:
        raise PromotionError(f"{label} 必须是非空 bundle-relative POSIX path")
    relative = Path(value)
    if relative.is_absolute() or ".." in relative.parts:
        raise PromotionError(f"{label} 必须留在 bundle 内：{value}")
    resolved = (bundle / relative).resolve(strict=False)
    try:
        resolved.relative_to(bundle.resolve())
    except ValueError as error:
        raise PromotionError(f"{label} 逃逸 bundle：{value}") from error
    return resolved


def _validate_timestamp(value: str) -> None:
    if not isinstance(value, str) or not value.strip():
        raise PromotionError("--reviewed-at 必须是带时区的 ISO-8601 时间")
    normalized = value.removesuffix("Z") + ("+00:00" if value.endswith("Z") else "")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError as error:
        raise PromotionError("--reviewed-at 不是有效 ISO-8601 时间") from error
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise PromotionError("--reviewed-at 必须包含时区")


def _audit_snapshot(manifest_path: Path) -> AuditSnapshot:
    module = _auditor_module()
    manifest = _read_json(manifest_path, label=MANIFEST_NAME)
    try:
        audit = module.audit_manifest(manifest_path)
        subject_sha = module.manifest_review_subject_sha256(manifest)
    except Exception as error:
        raise PromotionError(f"地图 auditor 执行失败：{error}") from error
    bundle_id = audit.bundle_id
    if not isinstance(bundle_id, str) or not bundle_id:
        bundle_id = manifest.get("bundleId")
    if not isinstance(bundle_id, str) or not bundle_id:
        raise PromotionError("bundleId 缺失")
    return AuditSnapshot(
        status="PASS" if not audit.errors else "FAIL",
        release_ready=audit.release_ready is True,
        missing_release_gates=tuple(audit.missing_release_gates),
        errors=tuple(audit.errors),
        warnings=tuple(audit.warnings),
        bundle_id=bundle_id,
        files_checked=tuple(sorted(audit.files_checked)),
        pngs_checked=len(audit.pngs_checked),
        jsons_checked=len(audit.jsons_checked),
        review_subject_sha256=subject_sha,
    )


def _require_audit(
    snapshot: AuditSnapshot,
    *,
    label: str,
    release_ready: bool,
    missing_gates: tuple[str, ...],
) -> None:
    expected_gates = tuple(sorted(missing_gates))
    actual_gates = tuple(sorted(snapshot.missing_release_gates))
    if (
        snapshot.status != "PASS"
        or snapshot.errors
        or snapshot.release_ready is not release_ready
        or actual_gates != expected_gates
    ):
        raise PromotionError(
            f"{label} 审计未满足严格契约："
            f"status={snapshot.status!r} "
            f"releaseReady={snapshot.release_ready!r} "
            f"missingReleaseGates={list(actual_gates)!r} "
            f"errors={list(snapshot.errors)!r}"
        )


def _file_refs_from_audit(
    bundle: Path, snapshot: AuditSnapshot
) -> list[dict[str, str]]:
    refs: list[dict[str, str]] = []
    seen: set[str] = set()
    for value in snapshot.files_checked:
        if value in seen:
            raise PromotionError(f"auditor files_checked 含重复路径：{value}")
        seen.add(value)
        path = _safe_bundle_path(bundle, value, label="auditor.files_checked")
        if not path.is_file() or path.stat().st_size <= 0:
            raise PromotionError(f"auditor files_checked 文件不存在或为空：{value}")
        refs.append({"path": value, "sha256": _sha256_file(path)})
    if not refs:
        raise PromotionError("auditor files_checked 为空，拒绝生成 owner acceptance")
    return refs


def _write_bytes(path: Path, payload: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("wb") as stream:
        stream.write(payload)
        stream.flush()
        os.fsync(stream.fileno())


def _fsync_directory(path: Path) -> None:
    try:
        directory_fd = os.open(path, os.O_RDONLY)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
    except OSError as error:
        raise PromotionError(f"无法 fsync 目录：{path}: {error}") from error


def _assert_pending_manifest(manifest: dict[str, Any]) -> None:
    evidence = manifest.get("evidence")
    if (
        manifest.get("status") != "owner_review_pending"
        or manifest.get("ownerReviewStatus") != "pending"
        or manifest.get("releaseApproved") is not False
        or manifest.get("runtimeEnabled") is not False
        or not isinstance(evidence, dict)
        or evidence.get("ownerAcceptance") is not None
        or manifest.get("releaseAttestation") is not None
    ):
        raise PromotionError(
            "输入必须是 ownerAcceptance/releaseAttestation 均为 null 的 "
            "owner_review_pending bundle，且两个 runtime flag 均为 false"
        )


def _build_attestation(
    *,
    manifest: dict[str, Any],
) -> tuple[dict[str, Any], str]:
    module = _auditor_module()
    try:
        summaries = module.release_summary_hashes(manifest)
    except Exception as error:
        raise PromotionError(f"无法计算 non-circular release summaries：{error}") from error
    if (
        not isinstance(summaries, dict)
        or set(summaries)
        != {
            "manifestSha256",
            "evidenceSha256",
            "assetSha256",
            "bundleSha256",
        }
        or any(
            not isinstance(value, str) or SHA256_RE.fullmatch(value) is None
            for value in summaries.values()
        )
    ):
        raise PromotionError("auditor release_summary_hashes 返回无效")
    value = {
        "schemaVersion": 1,
        "attestationType": "beastbound_map_runtime_release_attestation",
        "status": "passed",
        "bundleId": manifest.get("bundleId"),
        "mapStyleId": manifest.get("mapStyleId"),
        "mapIds": copy.deepcopy(manifest.get("mapIds")),
        "manifest": {
            "path": MANIFEST_NAME,
            "summarySha256": summaries["manifestSha256"],
        },
        "lifecycle": {
            "status": "released",
            "ownerReviewStatus": "approved",
            "releaseApproved": True,
            "runtimeEnabled": True,
        },
        "offlineAudit": {
            "status": "PASS",
            "releaseReady": True,
            "missingReleaseGates": [],
        },
        "summaries": {
            "evidenceSha256": summaries["evidenceSha256"],
            "assetSha256": summaries["assetSha256"],
            "bundleSha256": summaries["bundleSha256"],
        },
    }
    return value, summaries["bundleSha256"]


def _build_owner_acceptance(
    *,
    bundle_id: str,
    reviewer: str,
    reviewed_at: str,
    manifest_review_subject_sha256: str,
    accepted_files: list[dict[str, str]],
) -> dict[str, Any]:
    return {
        "schemaVersion": 1,
        "recordType": "beastbound_map_visual_owner_acceptance",
        "bundleId": bundle_id,
        "approved": True,
        "reviewer": reviewer,
        "reviewedAt": reviewed_at,
        "manifestReviewSubjectSha256": manifest_review_subject_sha256,
        "acceptedFiles": copy.deepcopy(accepted_files),
    }


def _prepare_candidate(
    source_bundle: Path,
    *,
    reviewer: str,
    reviewed_at: str,
) -> PromotionCandidate:
    source_manifest_path = source_bundle / MANIFEST_NAME
    source_manifest_bytes = source_manifest_path.read_bytes()
    godot_root = _find_godot_root(source_bundle)
    with tempfile.TemporaryDirectory(
        prefix=f".{source_bundle.name}-release-candidate-",
        dir=godot_root,
    ) as temporary:
        candidate_bundle = _create_candidate_project(
            source_bundle, Path(temporary)
        )
        candidate_manifest_path = candidate_bundle / MANIFEST_NAME
        manifest = _read_json(candidate_manifest_path, label=MANIFEST_NAME)
        _assert_pending_manifest(manifest)

        pending_audit = _audit_snapshot(candidate_manifest_path)
        _require_audit(
            pending_audit,
            label="owner_review_pending",
            release_ready=False,
            missing_gates=UNATTESTED_PENDING_GATES,
        )
        pending_files = _file_refs_from_audit(candidate_bundle, pending_audit)
        input_files = tuple(
            (value["path"], value["sha256"]) for value in pending_files
        )

        attestation, release_summary_sha = _build_attestation(manifest=manifest)
        attestation_bytes = _json_bytes(attestation)
        _write_bytes(
            candidate_bundle / RELEASE_ATTESTATION_PATH,
            attestation_bytes,
        )
        manifest["releaseAttestation"] = {
            "path": RELEASE_ATTESTATION_PATH,
            "sha256": _sha256_bytes(attestation_bytes),
        }
        _write_bytes(candidate_manifest_path, _json_bytes(manifest))

        attested_pending_audit = _audit_snapshot(candidate_manifest_path)
        _require_audit(
            attested_pending_audit,
            label="attested owner_review_pending",
            release_ready=False,
            missing_gates=ATTESTED_PENDING_GATES,
        )
        attested_pending_files = _file_refs_from_audit(
            candidate_bundle, attested_pending_audit
        )
        expected_attested_files = [
            *pending_files,
            {
                "path": RELEASE_ATTESTATION_PATH,
                "sha256": _sha256_bytes(attestation_bytes),
            },
        ]
        expected_attested_files.sort(key=lambda item: item["path"])
        if attested_pending_files != expected_attested_files:
            raise PromotionError(
                "加入 detached releaseAttestation 后 auditor files_checked "
                "不是原集合加 attestation"
            )

        owner_acceptance = _build_owner_acceptance(
            bundle_id=attested_pending_audit.bundle_id,
            reviewer=reviewer,
            reviewed_at=reviewed_at,
            manifest_review_subject_sha256=(
                attested_pending_audit.review_subject_sha256
            ),
            accepted_files=attested_pending_files,
        )
        owner_bytes = _json_bytes(owner_acceptance)
        _write_bytes(candidate_bundle / OWNER_ACCEPTANCE_PATH, owner_bytes)
        manifest["evidence"]["ownerAcceptance"] = {
            "path": OWNER_ACCEPTANCE_PATH,
            "sha256": _sha256_bytes(owner_bytes),
        }
        manifest["status"] = "approved"
        manifest["ownerReviewStatus"] = "approved"
        manifest["releaseApproved"] = False
        manifest["runtimeEnabled"] = False
        _write_bytes(candidate_manifest_path, _json_bytes(manifest))

        approved_audit = _audit_snapshot(candidate_manifest_path)
        _require_audit(
            approved_audit,
            label="approved",
            release_ready=False,
            missing_gates=APPROVED_GATES,
        )
        if (
            approved_audit.review_subject_sha256
            != attested_pending_audit.review_subject_sha256
        ):
            raise PromotionError("approved 阶段 canonical review digest 漂移")

        manifest["status"] = "released"
        manifest["releaseApproved"] = True
        manifest["runtimeEnabled"] = True
        released_manifest_bytes = _json_bytes(manifest)
        _write_bytes(candidate_manifest_path, released_manifest_bytes)
        released_audit = _audit_snapshot(candidate_manifest_path)
        _require_audit(
            released_audit,
            label="released",
            release_ready=True,
            missing_gates=(),
        )
        if (
            released_audit.review_subject_sha256
            != approved_audit.review_subject_sha256
        ):
            raise PromotionError("released 阶段 canonical review digest 漂移")
        validate_current_release(candidate_bundle)

        return PromotionCandidate(
            bundle_id=released_audit.bundle_id,
            input_manifest_sha256=_sha256_bytes(source_manifest_bytes),
            input_files=input_files,
            manifest_bytes=released_manifest_bytes,
            owner_acceptance_bytes=owner_bytes,
            release_attestation_bytes=attestation_bytes,
            approved_audit=approved_audit,
            released_audit=released_audit,
            release_summary_sha256=release_summary_sha,
        )


def _validate_file_ref(
    bundle: Path, value: Any, *, label: str
) -> tuple[Path, str, str]:
    if not isinstance(value, dict) or set(value) != {"path", "sha256"}:
        raise PromotionError(f"{label} 必须恰好包含 path/sha256")
    path_value = value.get("path")
    expected = value.get("sha256")
    if not isinstance(expected, str) or SHA256_RE.fullmatch(expected) is None:
        raise PromotionError(f"{label}.sha256 不是 lowercase SHA-256")
    path = _safe_bundle_path(bundle, path_value, label=f"{label}.path")
    if not path.is_file() or path.stat().st_size <= 0:
        raise PromotionError(f"{label} 文件不存在或为空：{path_value}")
    actual = _sha256_file(path)
    if actual != expected:
        raise PromotionError(
            f"{label} hash 漂移：expected={expected} actual={actual}"
        )
    return path, str(path_value), actual


def validate_current_release(bundle: Path) -> dict[str, Any]:
    """Validate a released bundle plus its detached root attestation."""
    manifest_path = bundle / MANIFEST_NAME
    manifest = _read_json(manifest_path, label=MANIFEST_NAME)
    if (
        manifest.get("status") != "released"
        or manifest.get("ownerReviewStatus") != "approved"
        or manifest.get("releaseApproved") is not True
        or manifest.get("runtimeEnabled") is not True
    ):
        raise PromotionError("当前 bundle 不是 released + approved + enabled")
    audit = _audit_snapshot(manifest_path)
    _require_audit(
        audit,
        label="current released",
        release_ready=True,
        missing_gates=(),
    )
    attestation_path, path_value, attestation_sha = _validate_file_ref(
        bundle,
        manifest.get("releaseAttestation"),
        label="releaseAttestation",
    )
    if path_value != RELEASE_ATTESTATION_PATH:
        raise PromotionError(
            f"releaseAttestation.path 必须是 {RELEASE_ATTESTATION_PATH}"
        )
    attestation = _read_json(attestation_path, label="release attestation")
    expected_attestation_keys = {
        "schemaVersion",
        "attestationType",
        "status",
        "bundleId",
        "mapStyleId",
        "mapIds",
        "manifest",
        "lifecycle",
        "offlineAudit",
        "summaries",
    }
    if set(attestation) != expected_attestation_keys:
        raise PromotionError(
            "release attestation 字段集合无效；"
            f"missing={sorted(expected_attestation_keys - set(attestation))} "
            f"extra={sorted(set(attestation) - expected_attestation_keys)}"
        )
    if (
        attestation.get("schemaVersion") != 1
        or attestation.get("attestationType")
        != "beastbound_map_runtime_release_attestation"
        or attestation.get("status") != "passed"
        or attestation.get("bundleId") != audit.bundle_id
    ):
        raise PromotionError("release attestation identity/status 无效")
    module = _auditor_module()
    expected_summaries = module.release_summary_hashes(manifest)
    if attestation.get("manifest") != {
        "path": MANIFEST_NAME,
        "summarySha256": expected_summaries["manifestSha256"],
    }:
        raise PromotionError("release attestation manifest summary 无效")
    if attestation.get("summaries") != {
        "evidenceSha256": expected_summaries["evidenceSha256"],
        "assetSha256": expected_summaries["assetSha256"],
        "bundleSha256": expected_summaries["bundleSha256"],
    }:
        raise PromotionError("release attestation independent summaries 无效")
    return {
        "bundleId": audit.bundle_id,
        "audit": audit.summary(),
        "releaseAttestation": {
            "path": path_value,
            "sha256": attestation_sha,
            "manifestSummarySha256": expected_summaries["manifestSha256"],
            "evidenceSummarySha256": expected_summaries["evidenceSha256"],
            "assetSummarySha256": expected_summaries["assetSha256"],
            "bundleSummarySha256": expected_summaries["bundleSha256"],
        },
    }


def _verify_input_unchanged(
    bundle: Path, candidate: PromotionCandidate
) -> None:
    manifest_path = bundle / MANIFEST_NAME
    if _sha256_file(manifest_path) != candidate.input_manifest_sha256:
        raise PromotionError("准备候选后原始 manifest 已变化，拒绝应用")
    snapshot = _audit_snapshot(manifest_path)
    _require_audit(
        snapshot,
        label="pre-apply owner_review_pending",
        release_ready=False,
        missing_gates=UNATTESTED_PENDING_GATES,
    )
    current_files = tuple(
        (value["path"], value["sha256"])
        for value in _file_refs_from_audit(bundle, snapshot)
    )
    if current_files != candidate.input_files:
        raise PromotionError("准备候选后 auditor files_checked 集合已变化")


def _restore_manifest(
    manifest_path: Path,
    original_manifest: bytes,
) -> bool:
    rollback = manifest_path.with_name(
        f".{MANIFEST_NAME}.map-release-rollback-{os.getpid()}.tmp"
    )
    try:
        rollback.unlink(missing_ok=True)
        _write_bytes(rollback, original_manifest)
        os.replace(rollback, manifest_path)
        _fsync_directory(manifest_path.parent)
        return True
    except (OSError, PromotionError):
        try:
            rollback.unlink(missing_ok=True)
        except OSError:
            pass
        return False


def _atomic_apply(
    bundle: Path,
    candidate: PromotionCandidate,
    *,
    _fault_hook: Callable[[str], None] | None = None,
) -> None:
    manifest_path = bundle / MANIFEST_NAME
    owner_path = bundle / OWNER_ACCEPTANCE_PATH
    attestation_path = bundle / RELEASE_ATTESTATION_PATH
    _verify_input_unchanged(bundle, candidate)

    original_manifest = manifest_path.read_bytes()
    support_writes = (
        (
            "attestation",
            attestation_path,
            candidate.release_attestation_bytes,
        ),
        ("owner", owner_path, candidate.owner_acceptance_bytes),
    )
    pending_support: list[tuple[str, Path, bytes, Path]] = []
    temporary_paths: list[Path] = []
    manifest_committed = False
    try:
        for index, (label, path, payload) in enumerate(support_writes):
            if path.exists():
                if not path.is_file() or path.read_bytes() != payload:
                    raise PromotionError(
                        f"已有 {label} 发布支持文件与候选不一致：{path}"
                    )
                _fsync_directory(path.parent)
                if _fault_hook is not None:
                    _fault_hook(f"after_{label}_install")
                continue
            temp = path.with_name(
                f".{path.name}.map-release-{os.getpid()}-{index}.tmp"
            )
            if temp.exists():
                raise PromotionError(f"临时文件已存在：{temp}")
            _write_bytes(temp, payload)
            temporary_paths.append(temp)
            pending_support.append((label, path, payload, temp))
        manifest_temp = manifest_path.with_name(
            f".{manifest_path.name}.map-release-{os.getpid()}-manifest.tmp"
        )
        if manifest_temp.exists():
            raise PromotionError(f"临时文件已存在：{manifest_temp}")
        _write_bytes(manifest_temp, candidate.manifest_bytes)
        temporary_paths.append(manifest_temp)

        for label, path, _payload, temp in pending_support:
            os.replace(temp, path)
            _fsync_directory(path.parent)
            if _fault_hook is not None:
                _fault_hook(f"after_{label}_install")

        os.replace(manifest_temp, manifest_path)
        manifest_committed = True
        _fsync_directory(bundle)
        # The manifest replacement is the commit point.  All referenced
        # supporting files were durable before it became visible.
        if _fault_hook is not None:
            _fault_hook("after_manifest_commit")
        validate_current_release(bundle)
        temporary_paths.clear()
    except Exception as error:
        for temp in temporary_paths:
            try:
                temp.unlink(missing_ok=True)
            except OSError:
                pass
        if manifest_committed and not _restore_manifest(
            manifest_path, original_manifest
        ):
            # Never remove the support records while a released manifest may
            # still reference them.  A subsequent --check-only can determine
            # whether the committed candidate is already valid.
            raise PromotionError(
                "manifest 已提交但回滚失败；已保留 attestation/owner "
                f"以避免 released 引用悬空。原始错误：{error}"
            ) from error
        # Exact installed support files are deliberately retained.  A retry
        # with the same frozen inputs is idempotent and resumes safely.
        raise


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Fail-closed two-phase owner approval and release promotion for "
            "one frozen Beastbound map visual bundle."
        )
    )
    parser.add_argument(
        "bundle",
        help=f"Bundle directory or explicit {MANIFEST_NAME}",
    )
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument(
        "--check-only",
        action="store_true",
        help="Validate an already released bundle and detached attestation.",
    )
    mode.add_argument(
        "--dry-run",
        action="store_true",
        help="Build and audit both promotion phases without changing the bundle.",
    )
    mode.add_argument(
        "--apply",
        action="store_true",
        help="Build, audit, and atomically apply the formal release.",
    )
    parser.add_argument("--reviewer")
    parser.add_argument("--reviewed-at")
    parser.add_argument(
        "--owner-accepted-frozen-evidence",
        action="store_true",
        help="Required with --apply; records explicit owner acceptance.",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        bundle = _resolve_bundle(args.bundle)
        if args.check_only:
            summary = validate_current_release(bundle)
            output = {"status": "PASS", "mode": "check-only", **summary}
        else:
            reviewer = args.reviewer.strip() if isinstance(args.reviewer, str) else ""
            reviewed_at = (
                args.reviewed_at.strip()
                if isinstance(args.reviewed_at, str)
                else ""
            )
            if not reviewer:
                raise PromotionError("--dry-run/--apply 必须提供 --reviewer")
            _validate_timestamp(reviewed_at)
            if args.apply and not args.owner_accepted_frozen_evidence:
                raise PromotionError(
                    "--apply 必须显式提供 --owner-accepted-frozen-evidence"
                )
            candidate = _prepare_candidate(
                bundle,
                reviewer=reviewer,
                reviewed_at=reviewed_at,
            )
            if args.apply:
                _atomic_apply(bundle, candidate)
            output = {
                "status": "PASS",
                "mode": "apply" if args.apply else "dry-run",
                **candidate.summary(),
            }
        print(json.dumps(output, ensure_ascii=False, indent=2))
        return 0
    except (OSError, PromotionError) as error:
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
