#!/usr/bin/env python3
"""Promote frozen static NPC art evidence to an owner-approved runtime release.

This is deliberately not part of the candidate builder. It accepts only an
already-complete ``owner_review_pending`` appearance, replays the frozen
evidence and installed-frame bindings, and creates a schema-v2 owner decision
and runtime attestation. ``--apply`` additionally requires an explicit
``--owner-accepted-frozen-evidence`` acknowledgement.
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Sequence

from PIL import Image, UnidentifiedImageError


REPO_ROOT = Path(__file__).resolve().parents[1]
CATALOG_PATH = REPO_ROOT / "client/godot/data/npc_appearances.json"
NPC_ROOT = REPO_ROOT / "client/godot/assets/npcs"
DIRECTIONS = (
    "south",
    "southwest",
    "west",
    "northwest",
    "north",
    "northeast",
    "east",
    "southeast",
)
PORTRAIT_STATES = ("neutral", "speaking", "smile", "concerned")
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
APPEARANCE_ID_RE = re.compile(r"^npc_[a-z0-9_]+_[mf]_v[1-9][0-9]*$")
UTC_RE = re.compile(
    r"^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]+)?Z$"
)
HASH_EVIDENCE_KEYS = (
    "runtimeEvidenceIndexSha256",
    "blindStageAResultSha256",
    "blindStageBObservationSha256",
    "blindAuditSha256",
    "blindReviewPacketSha256",
    "blindProducerMappingSha256",
    "runtimeVideoSha256",
)
ARRAY_EVIDENCE_KEYS = (
    "mainCaptureReportSha256s",
    "runtimeScreenshotSha256s",
)
FROZEN_PATH_HASH_PAIRS = (
    ("runtimeEvidenceIndex", "runtimeEvidenceIndexSha256"),
    ("blindStageAResult", "blindStageAResultSha256"),
    ("blindStageBObservation", "blindStageBObservationSha256"),
    ("blindAudit", "blindAuditSha256"),
    ("blindReviewPacket", "blindReviewPacketSha256"),
    ("blindProducerMapping", "blindProducerMappingSha256"),
    ("runtimeVideo", "runtimeVideoSha256"),
)
FROZEN_ARRAY_PATH_HASH_PAIRS = (
    ("mainCaptureReports", "mainCaptureReportSha256s"),
    ("runtimeScreenshots", "runtimeScreenshotSha256s"),
)


class PromotionError(RuntimeError):
    """A fail-closed NPC release-promotion contract error."""


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


def _replace_exact_count(
    text: str,
    old: str,
    new: str,
    *,
    expected_count: int,
    label: str,
) -> str:
    actual_count = text.count(old)
    if actual_count != expected_count:
        raise PromotionError(
            f"{label} 文本合同计数无效：expected={expected_count} "
            f"actual={actual_count}"
        )
    return text.replace(old, new)


def _promoted_metadata_bytes(
    original_bytes: bytes,
    promoted_metadata: dict[str, Any],
    appearance_id: str,
) -> bytes:
    """Apply the release-state delta without reformatting frozen metadata."""
    try:
        text = original_bytes.decode("utf-8")
    except UnicodeDecodeError as error:
        raise PromotionError(
            f"action-bundle-meta 不是 UTF-8：{appearance_id}"
        ) from error
    text = _replace_exact_count(
        text,
        '"artStatus": "owner_review_pending"',
        '"artStatus": "approved"',
        expected_count=1,
        label=f"{appearance_id}.artStatus",
    )
    text = _replace_exact_count(
        text,
        '"ownerReviewStatus": "pending"',
        '"ownerReviewStatus": "approved"',
        expected_count=1,
        label=f"{appearance_id}.ownerReviewStatus",
    )
    text = _replace_exact_count(
        text,
        '"releaseApproved": false',
        '"releaseApproved": true',
        expected_count=2,
        label=f"{appearance_id}.releaseApproved",
    )
    text = _replace_exact_count(
        text,
        '"runtimeEnabled": false',
        '"runtimeEnabled": true',
        expected_count=3,
        label=f"{appearance_id}.runtimeEnabled",
    )
    remaining_pattern = re.compile(
        r',\n(?P<indent>[ \t]*)"remainingEvidence": \[\n'
        r'(?P=indent)  "explicit project owner acceptance"\n'
        r"(?P=indent)\]"
    )
    text, count = remaining_pattern.subn("", text)
    if count != 1:
        raise PromotionError(
            f"{appearance_id}.remainingEvidence 文本合同计数无效：{count}"
        )
    reason = str(promoted_metadata["release"]["reason"])
    reason_pattern = re.compile(r'("reason": )"[^"\n]*"')
    text, count = reason_pattern.subn(
        lambda match: match.group(1)
        + json.dumps(reason, ensure_ascii=False),
        text,
    )
    if count != 1:
        raise PromotionError(
            f"{appearance_id}.release.reason 文本合同计数无效：{count}"
        )
    try:
        reparsed = json.loads(text)
    except json.JSONDecodeError as error:
        raise PromotionError(
            f"格式保留后的 action-bundle-meta 无法解析：{appearance_id}: {error}"
        ) from error
    if reparsed != promoted_metadata:
        raise PromotionError(
            f"格式保留后的 action-bundle-meta 语义不匹配：{appearance_id}"
        )
    return text.encode("utf-8")


def _appearance_object_span(text: str, appearance_id: str) -> tuple[int, int]:
    marker = f'"appearanceId": "{appearance_id}"'
    marker_index = text.find(marker)
    if marker_index < 0 or text.find(marker, marker_index + 1) >= 0:
        raise PromotionError(
            f"catalog 必须恰好包含一条 appearance 文本记录：{appearance_id}"
        )
    start = text.rfind("{", 0, marker_index)
    if start < 0:
        raise PromotionError(f"catalog appearance 对象起点缺失：{appearance_id}")
    depth = 0
    in_string = False
    escaped = False
    for index in range(start, len(text)):
        character = text[index]
        if in_string:
            if escaped:
                escaped = False
            elif character == "\\":
                escaped = True
            elif character == '"':
                in_string = False
            continue
        if character == '"':
            in_string = True
        elif character == "{":
            depth += 1
        elif character == "}":
            depth -= 1
            if depth == 0:
                return start, index + 1
    raise PromotionError(f"catalog appearance 对象未闭合：{appearance_id}")


def _promoted_catalog_bytes(
    original_bytes: bytes,
    promoted_catalog: dict[str, Any],
    promotions: list[dict[str, Any]],
) -> bytes:
    """Preserve the catalog's compact arrays and mapping entries exactly."""
    try:
        text = original_bytes.decode("utf-8")
    except UnicodeDecodeError as error:
        raise PromotionError("npc_appearances catalog 不是 UTF-8") from error
    for promotion in promotions:
        appearance_id = str(promotion["appearanceId"])
        start, end = _appearance_object_span(text, appearance_id)
        block = text[start:end]
        block = _replace_exact_count(
            block,
            '"status": "owner_review_pending"',
            '"status": "approved"',
            expected_count=1,
            label=f"{appearance_id}.catalog.status",
        )
        block = _replace_exact_count(
            block,
            '"ownerReviewStatus": "pending"',
            '"ownerReviewStatus": "approved"',
            expected_count=1,
            label=f"{appearance_id}.catalog.ownerReviewStatus",
        )
        block = _replace_exact_count(
            block,
            '"releaseApproved": false',
            '"releaseApproved": true',
            expected_count=1,
            label=f"{appearance_id}.catalog.releaseApproved",
        )
        block = _replace_exact_count(
            block,
            '"runtimeEnabled": false',
            '"runtimeEnabled": true',
            expected_count=1,
            label=f"{appearance_id}.catalog.runtimeEnabled",
        )
        record_suffix = "\n      }\n    }"
        if not block.endswith(record_suffix):
            raise PromotionError(
                f"catalog appearance 紧凑格式尾部无效：{appearance_id}"
            )
        attestation_path = (
            f"client/godot/assets/npcs/{appearance_id}/release-attestation.json"
        )
        attestation_sha = str(promotion["releaseAttestationSha256"])
        promoted_suffix = (
            "\n      },\n"
            f'      "releaseAttestationPath": "{attestation_path}",\n'
            f'      "releaseAttestationSha256": "{attestation_sha}"\n'
            "    }"
        )
        block = block[: -len(record_suffix)] + promoted_suffix
        text = text[:start] + block + text[end:]
    try:
        reparsed = json.loads(text)
    except json.JSONDecodeError as error:
        raise PromotionError(
            f"格式保留后的 npc_appearances catalog 无法解析：{error}"
        ) from error
    if reparsed != promoted_catalog:
        raise PromotionError("格式保留后的 npc_appearances catalog 语义不匹配")
    return text.encode("utf-8")


def _read_json(path: Path, *, label: str) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise PromotionError(f"无法读取 {label}：{path}: {error}") from error
    if not isinstance(value, dict):
        raise PromotionError(f"{label} 根节点必须是对象：{path}")
    return value


def _required_sha(value: Any, *, label: str) -> str:
    if not isinstance(value, str) or SHA256_RE.fullmatch(value) is None:
        raise PromotionError(f"{label} 不是 lowercase SHA-256")
    return value


def _require_exact_keys(
    value: dict[str, Any], expected: set[str], *, label: str
) -> None:
    if set(value) != expected:
        raise PromotionError(
            f"{label} 字段集合无效；"
            f"missing={sorted(expected - set(value))} "
            f"extra={sorted(set(value) - expected)}"
        )


def _resolve_repo_artifact(value: Any, *, label: str) -> Path:
    if not isinstance(value, str) or not value.strip():
        raise PromotionError(f"{label} 路径为空")
    candidate = Path(value)
    resolved = (
        candidate.resolve(strict=False)
        if candidate.is_absolute()
        else (REPO_ROOT / candidate).resolve(strict=False)
    )
    try:
        resolved.relative_to(REPO_ROOT.resolve(strict=True))
    except ValueError as error:
        raise PromotionError(f"{label} 必须位于仓库内：{resolved}") from error
    return resolved


def _verify_frozen_file(path: Path, expected_sha: Any, *, label: str) -> str:
    expected = _required_sha(expected_sha, label=f"{label} SHA-256")
    if not path.is_file() or path.stat().st_size <= 0:
        raise PromotionError(f"{label} 不存在或为空：{path}")
    actual = _sha256_file(path)
    if actual != expected:
        raise PromotionError(
            f"{label} hash 漂移：expected={expected} actual={actual}"
        )
    return actual


def _safe_relative_path(value: Any, *, label: str) -> str:
    if not isinstance(value, str) or not value or "\\" in value:
        raise PromotionError(f"{label} 不是安全相对路径")
    candidate = Path(value)
    if candidate.is_absolute() or ".." in candidate.parts or "" in candidate.parts:
        raise PromotionError(f"{label} 不是安全相对路径：{value}")
    return candidate.as_posix()


def _full_rgba_sha(image: Image.Image) -> str:
    rgba = image if image.mode == "RGBA" else image.convert("RGBA")
    prefix = f"{rgba.width}x{rgba.height}:RGBA\n".encode("utf-8")
    return _sha256_bytes(prefix + rgba.tobytes())


def _canonical_rgba_sha(image: Image.Image) -> str:
    rgba = image if image.mode == "RGBA" else image.convert("RGBA")
    pixels = bytearray(rgba.tobytes())
    for offset in range(0, len(pixels), 4):
        if pixels[offset + 3] < 255:
            pixels[offset] = 0
            pixels[offset + 1] = 0
            pixels[offset + 2] = 0
    prefix = f"{rgba.width}x{rgba.height}:RGBA\n".encode("utf-8")
    return _sha256_bytes(prefix + pixels)


def _validate_utc(value: str) -> None:
    if UTC_RE.fullmatch(value) is None:
        raise PromotionError("--approved-at-utc 必须是 UTC 时间")
    try:
        datetime.fromisoformat(value.removesuffix("Z") + "+00:00")
    except ValueError as error:
        raise PromotionError("--approved-at-utc 不是有效时间") from error


def _catalog_record(
    catalog: dict[str, Any], appearance_id: str
) -> dict[str, Any]:
    values = catalog.get("appearances")
    if not isinstance(values, list):
        raise PromotionError("npc_appearances.json appearances 不是数组")
    matches = [
        value
        for value in values
        if isinstance(value, dict) and value.get("appearanceId") == appearance_id
    ]
    if len(matches) != 1:
        raise PromotionError(
            f"catalog 必须恰好包含一条 appearance：{appearance_id}"
        )
    return matches[0]


def _validate_pending_state(
    record: dict[str, Any], metadata: dict[str, Any], appearance_id: str
) -> None:
    expected_asset_root = f"client/godot/assets/npcs/{appearance_id}"
    if (
        record.get("appearanceId") != appearance_id
        or record.get("status") != "owner_review_pending"
        or record.get("ownerReviewStatus") != "pending"
        or record.get("releaseApproved") is not False
        or record.get("runtimeEnabled") is not False
        or record.get("mobility") != "static"
        or record.get("assetRoot") != expected_asset_root
        or record.get("metadataPath")
        != f"{expected_asset_root}/action-bundle-meta.json"
        or "releaseAttestationPath" in record
        or "releaseAttestationSha256" in record
    ):
        raise PromotionError(
            f"catalog 不是未发布 static owner_review_pending 状态：{appearance_id}"
        )
    if metadata.get("appearanceId") != appearance_id:
        raise PromotionError(
            f"action-bundle-meta appearanceId 不匹配：{appearance_id}"
        )
    review = metadata.get("review")
    release = metadata.get("release")
    if not isinstance(review, dict) or not isinstance(release, dict):
        raise PromotionError(f"action-bundle-meta 缺少 review/release：{appearance_id}")
    if (
        review.get("artStatus") != "owner_review_pending"
        or review.get("ownerReviewStatus") != "pending"
        or review.get("releaseApproved") is not False
        or review.get("runtimeEnabled") is not False
        or review.get("remainingEvidence")
        != ["explicit project owner acceptance"]
        or release.get("releaseApproved") is not False
        or release.get("runtimeEnabled") is not False
        or metadata.get("runtimeEnabled") is not False
    ):
        raise PromotionError(
            f"action-bundle-meta 不是仅缺 owner acceptance 的候选：{appearance_id}"
        )


def _validate_review_artifacts(
    review: dict[str, Any], appearance_id: str
) -> tuple[dict[str, Any], dict[str, Any], Path]:
    for path_key, hash_key in FROZEN_PATH_HASH_PAIRS:
        path = _resolve_repo_artifact(
            review.get(path_key), label=f"{appearance_id}.{path_key}"
        )
        _verify_frozen_file(
            path,
            review.get(hash_key),
            label=f"{appearance_id}.{path_key}",
        )
    for paths_key, hashes_key in FROZEN_ARRAY_PATH_HASH_PAIRS:
        paths = review.get(paths_key)
        hashes = review.get(hashes_key)
        if (
            not isinstance(paths, list)
            or not isinstance(hashes, list)
            or not paths
            or len(paths) != len(hashes)
        ):
            raise PromotionError(
                f"{appearance_id}.{paths_key}/{hashes_key} 必须非空且一一对应"
            )
        if len(set(hashes)) != len(hashes):
            raise PromotionError(f"{appearance_id}.{hashes_key} 含重复 hash")
        for index, path_value in enumerate(paths):
            path = _resolve_repo_artifact(
                path_value, label=f"{appearance_id}.{paths_key}[{index}]"
            )
            _verify_frozen_file(
                path,
                hashes[index],
                label=f"{appearance_id}.{paths_key}[{index}]",
            )

    index_path = _resolve_repo_artifact(
        review.get("runtimeEvidenceIndex"),
        label=f"{appearance_id}.runtimeEvidenceIndex",
    )
    index = _read_json(index_path, label="runtime evidence index")
    if (
        index.get("schemaVersion") != 1
        or index.get("indexType") != "beastbound_npc_direction_review_evidence"
        or index.get("status") != "passed"
        or index.get("scene") != "res://scenes/qa/NpcDirectionReview.tscn"
    ):
        raise PromotionError(f"runtime evidence index 状态无效：{appearance_id}")
    appearances = index.get("appearances")
    if not isinstance(appearances, list):
        raise PromotionError("runtime evidence index appearances 不是数组")
    entries = [
        value
        for value in appearances
        if isinstance(value, dict) and value.get("appearanceId") == appearance_id
    ]
    if len(entries) != 1:
        raise PromotionError(
            f"runtime evidence index 必须恰好绑定当前 appearance：{appearance_id}"
        )
    entry = entries[0]
    if entry.get("status") != "passed":
        raise PromotionError(f"runtime evidence appearance 未通过：{appearance_id}")
    source_set_sha = _required_sha(
        entry.get("sourceSetSha256"),
        label=f"{appearance_id}.sourceSetSha256",
    )
    preflight_artifact = entry.get("preflightParity")
    if not isinstance(preflight_artifact, dict):
        raise PromotionError(f"evidence index 缺少 preflightParity：{appearance_id}")
    if (
        preflight_artifact.get("status") != "passed"
        or preflight_artifact.get("processKind") != "preflight"
        or preflight_artifact.get("sourceSetSha256") != source_set_sha
    ):
        raise PromotionError(
            f"evidence index preflightParity 状态/sourceSet 无效：{appearance_id}"
        )
    preflight_path = _resolve_repo_artifact(
        preflight_artifact.get("path"),
        label=f"{appearance_id}.preflightParity",
    )
    _verify_frozen_file(
        preflight_path,
        preflight_artifact.get("sha256"),
        label=f"{appearance_id}.preflightParity",
    )
    preflight = _read_json(preflight_path, label="preflight parity report")
    if (
        preflight.get("schemaVersion") != 1
        or preflight.get("reportType")
        != "beastbound_npc_direction_review_parity"
        or preflight.get("status") != "passed"
        or preflight.get("processKind") != "preflight"
        or preflight.get("appearanceId") != appearance_id
        or preflight.get("sourceSetSha256") != source_set_sha
    ):
        raise PromotionError(f"preflight parity report 状态无效：{appearance_id}")
    return entry, preflight, index_path


def _installation_frames(
    metadata: dict[str, Any],
    record: dict[str, Any],
    preflight: dict[str, Any],
    appearance_id: str,
) -> tuple[list[dict[str, Any]], str]:
    installation = metadata.get("installation")
    if not isinstance(installation, dict):
        raise PromotionError(f"action-bundle-meta 缺少 installation：{appearance_id}")
    values = installation.get("frames")
    if not isinstance(values, list):
        raise PromotionError(f"installation.frames 不是数组：{appearance_id}")
    expected_sources: dict[str, tuple[str, str, str]] = {
        **{
            f"runtime/world/{direction}/idle-1.png": (
                "world",
                f"{direction}/idle/1",
                direction,
            )
            for direction in DIRECTIONS
        },
        **{
            f"runtime/portraits/{state}.png": ("portrait", state, state)
            for state in PORTRAIT_STATES
        },
    }
    by_source: dict[str, dict[str, Any]] = {}
    for value in values:
        if not isinstance(value, dict):
            raise PromotionError(f"installation.frames 含非对象：{appearance_id}")
        source_path = value.get("sourceRuntimePath")
        if source_path not in expected_sources or source_path in by_source:
            raise PromotionError(
                f"installation sourceRuntimePath 未知或重复：{appearance_id}/{source_path}"
            )
        expected_kind, expected_slot, _ = expected_sources[source_path]
        installed_path = _safe_relative_path(
            value.get("installedPath"),
            label=f"{appearance_id}/{source_path}.installedPath",
        )
        if (
            value.get("kind") != expected_kind
            or value.get("slot") != expected_slot
        ):
            raise PromotionError(
                f"installation kind/slot 不匹配：{appearance_id}/{source_path}"
            )
        file_sha = _required_sha(
            value.get("fileSha256"),
            label=f"{appearance_id}/{source_path}.fileSha256",
        )
        rgba_sha = _required_sha(
            value.get("rgbaSha256"),
            label=f"{appearance_id}/{source_path}.rgbaSha256",
        )
        installed_file = REPO_ROOT / str(record["assetRoot"]) / installed_path
        _verify_frozen_file(
            installed_file,
            file_sha,
            label=f"{appearance_id} installed frame {installed_path}",
        )
        try:
            with Image.open(installed_file) as opened:
                image = opened.convert("RGBA")
        except (OSError, UnidentifiedImageError) as error:
            raise PromotionError(
                f"无法解码 installed PNG：{installed_file}: {error}"
            ) from error
        actual_full = _full_rgba_sha(image)
        actual_canonical = _canonical_rgba_sha(image)
        if actual_full != rgba_sha:
            raise PromotionError(
                f"installed RGBA hash 漂移：{appearance_id}/{installed_path}"
            )
        by_source[str(source_path)] = {
            "installedPath": installed_path,
            "sourceRuntimePath": source_path,
            "kind": expected_kind,
            "slot": expected_slot,
            "fileSha256": file_sha,
            "rgbaSha256": rgba_sha,
            "_logicalSlot": expected_sources[source_path][2],
            "_canonicalSha256": actual_canonical,
        }
    if set(by_source) != set(expected_sources):
        raise PromotionError(
            f"installation 必须精确覆盖 world8/portrait4：{appearance_id}"
        )

    parity_values = preflight.get("frames")
    if not isinstance(parity_values, list) or len(parity_values) != 12:
        raise PromotionError(
            f"preflight parity 必须精确覆盖 12 帧：{appearance_id}"
        )
    parity_by_path: dict[str, dict[str, Any]] = {}
    for value in parity_values:
        if not isinstance(value, dict):
            raise PromotionError(f"preflight parity.frames 含非对象：{appearance_id}")
        path = value.get("path")
        if not isinstance(path, str) or path in parity_by_path:
            raise PromotionError(
                f"preflight parity path 无效或重复：{appearance_id}/{path}"
            )
        parity_by_path[path] = value

    ordered_sources = [
        f"runtime/world/{direction}/idle-1.png" for direction in DIRECTIONS
    ] + [f"runtime/portraits/{state}.png" for state in PORTRAIT_STATES]
    attestation_frames: list[dict[str, Any]] = []
    source_set_lines: list[str] = []
    for source_path in ordered_sources:
        installed = by_source[source_path]
        parity_path = (
            f"res://assets/npcs/{appearance_id}/{installed['installedPath']}"
        )
        parity = parity_by_path.get(parity_path)
        if not isinstance(parity, dict):
            raise PromotionError(
                f"preflight parity 漏登记 installed path：{appearance_id}/{parity_path}"
            )
        expected_parity_slot = installed["_logicalSlot"]
        canonical_sha = _required_sha(
            parity.get("sourceDecodedRgbaSha256"),
            label=f"{appearance_id}/{parity_path}.sourceDecodedRgbaSha256",
        )
        if (
            parity.get("kind") != installed["kind"]
            or parity.get("slot") != expected_parity_slot
            or parity.get("fileSha256") != installed["fileSha256"]
            or parity.get("sourceFullDecodedRgbaSha256")
            != installed["rgbaSha256"]
            or parity.get("loadedDecodedRgbaSha256") != canonical_sha
            or parity.get("status") != "passed"
            or parity.get("canonicalRgbaMatch") is not True
            or parity.get("sourceLoadedRgbaMatch") is not True
            or canonical_sha != installed["_canonicalSha256"]
        ):
            raise PromotionError(
                f"preflight canonical/file/full 绑定不匹配：{appearance_id}/{parity_path}"
            )
        attestation_frames.append(
            {
                "installedPath": installed["installedPath"],
                "sourceRuntimePath": installed["sourceRuntimePath"],
                "kind": installed["kind"],
                "slot": installed["slot"],
                "fileSha256": installed["fileSha256"],
                "rgbaSha256": installed["rgbaSha256"],
                "sourceDecodedRgbaSha256": canonical_sha,
            }
        )
        source_set_lines.append(
            "\t".join(
                (
                    str(installed["kind"]),
                    str(expected_parity_slot),
                    parity_path,
                    str(installed["fileSha256"]),
                    str(installed["rgbaSha256"]),
                    canonical_sha,
                )
            )
            + "\n"
        )
    if set(parity_by_path) != {
        f"res://assets/npcs/{appearance_id}/{frame['installedPath']}"
        for frame in attestation_frames
    }:
        raise PromotionError(
            f"preflight parity 含未绑定额外帧：{appearance_id}"
        )
    return attestation_frames, _sha256_bytes("".join(source_set_lines).encode())


def _strict_evidence(
    review: dict[str, Any], source_set_sha: str, appearance_id: str
) -> dict[str, Any]:
    evidence: dict[str, Any] = {"sourceSetSha256": source_set_sha}
    for key in HASH_EVIDENCE_KEYS:
        evidence[key] = _required_sha(
            review.get(key), label=f"{appearance_id}.{key}"
        )
    for key in ARRAY_EVIDENCE_KEYS:
        values = review.get(key)
        if not isinstance(values, list) or not values:
            raise PromotionError(f"{appearance_id}.{key} 必须是非空数组")
        hashes = [
            _required_sha(value, label=f"{appearance_id}.{key}[{index}]")
            for index, value in enumerate(values)
        ]
        if len(set(hashes)) != len(hashes):
            raise PromotionError(f"{appearance_id}.{key} 含重复 hash")
        evidence[key] = hashes
    _require_exact_keys(
        evidence,
        {
            "sourceSetSha256",
            *HASH_EVIDENCE_KEYS,
            *ARRAY_EVIDENCE_KEYS,
        },
        label=f"{appearance_id}.strictEvidence",
    )
    return evidence


def _prepare_promotion(
    catalog: dict[str, Any],
    appearance_id: str,
    owner_id: str,
    approved_at_utc: str,
) -> dict[str, Any]:
    if APPEARANCE_ID_RE.fullmatch(appearance_id) is None:
        raise PromotionError(f"appearanceId 不是 canonical ID：{appearance_id}")
    record = _catalog_record(catalog, appearance_id)
    asset_dir = NPC_ROOT / appearance_id
    metadata_path = asset_dir / "action-bundle-meta.json"
    owner_path = asset_dir / "release-owner-decision.json"
    attestation_path = asset_dir / "release-attestation.json"
    if owner_path.exists() or attestation_path.exists():
        raise PromotionError(
            f"拒绝覆盖已有 owner decision/attestation：{appearance_id}"
        )
    original_metadata_bytes = metadata_path.read_bytes()
    metadata = _read_json(metadata_path, label="action-bundle-meta")
    _validate_pending_state(record, metadata, appearance_id)
    review = metadata["review"]
    evidence_entry, preflight, _ = _validate_review_artifacts(
        review, appearance_id
    )
    attestation_frames, computed_source_set = _installation_frames(
        metadata, record, preflight, appearance_id
    )
    frozen_source_set = _required_sha(
        evidence_entry.get("sourceSetSha256"),
        label=f"{appearance_id}.frozenSourceSetSha256",
    )
    if computed_source_set != frozen_source_set:
        raise PromotionError(
            f"schema-v2 sourceSet 未绑定 frozen runtime evidence：{appearance_id}; "
            f"computed={computed_source_set} frozen={frozen_source_set}"
        )
    strict_evidence = _strict_evidence(
        review, frozen_source_set, appearance_id
    )
    decision = {
        "schemaVersion": 1,
        "decisionType": "beastbound_npc_owner_release_decision",
        "appearanceId": appearance_id,
        "decision": "approved",
        "ownerReviewStatus": "approved",
        "ownerId": owner_id,
        "releaseApproved": True,
        "runtimeEnabled": True,
        "approvedAtUtc": approved_at_utc,
        "sourceSetSha256": frozen_source_set,
        "runtimeEvidenceIndexSha256": strict_evidence[
            "runtimeEvidenceIndexSha256"
        ],
        "acceptedEvidence": copy.deepcopy(strict_evidence),
    }
    decision_bytes = _json_bytes(decision)
    attestation = {
        "schemaVersion": 2,
        "attestationType": "beastbound_npc_runtime_release_attestation",
        "status": "passed",
        "appearanceId": appearance_id,
        "ownerReviewStatus": "approved",
        "releaseApproved": True,
        "runtimeEnabled": True,
        "ownerApprovedAtUtc": approved_at_utc,
        "ownerDecisionRecord": (
            f"client/godot/assets/npcs/{appearance_id}/"
            "release-owner-decision.json"
        ),
        "ownerDecisionRecordSha256": _sha256_bytes(decision_bytes),
        "sourceSetSha256": frozen_source_set,
        "strictEvidence": copy.deepcopy(strict_evidence),
        "frames": attestation_frames,
    }
    attestation_bytes = _json_bytes(attestation)

    promoted_metadata = copy.deepcopy(metadata)
    promoted_review = promoted_metadata["review"]
    promoted_review["artStatus"] = "approved"
    promoted_review["ownerReviewStatus"] = "approved"
    promoted_review["releaseApproved"] = True
    promoted_review["runtimeEnabled"] = True
    promoted_review.pop("remainingEvidence", None)
    promoted_release = promoted_metadata["release"]
    promoted_release["releaseApproved"] = True
    promoted_release["runtimeEnabled"] = True
    promoted_release["reason"] = (
        "project owner accepted the frozen NPC evidence; owner decision "
        "and schema-v2 runtime release attestation are hash-bound"
    )
    promoted_metadata["runtimeEnabled"] = True

    promoted_record = copy.deepcopy(record)
    promoted_record["status"] = "approved"
    promoted_record["ownerReviewStatus"] = "approved"
    promoted_record["releaseApproved"] = True
    promoted_record["runtimeEnabled"] = True
    promoted_record["releaseAttestationPath"] = (
        f"client/godot/assets/npcs/{appearance_id}/release-attestation.json"
    )
    promoted_record["releaseAttestationSha256"] = _sha256_bytes(
        attestation_bytes
    )
    return {
        "appearanceId": appearance_id,
        "metadataPath": metadata_path,
        "metadataBytes": _promoted_metadata_bytes(
            original_metadata_bytes, promoted_metadata, appearance_id
        ),
        "ownerPath": owner_path,
        "ownerBytes": decision_bytes,
        "attestationPath": attestation_path,
        "attestationBytes": attestation_bytes,
        "promotedRecord": promoted_record,
        "sourceSetSha256": frozen_source_set,
        "ownerDecisionSha256": _sha256_bytes(decision_bytes),
        "releaseAttestationSha256": _sha256_bytes(attestation_bytes),
    }


def _atomic_apply(
    promotions: list[dict[str, Any]],
    original_catalog_bytes: bytes,
    promoted_catalog_bytes: bytes,
) -> None:
    writes: list[tuple[Path, bytes, bool]] = []
    for promotion in promotions:
        writes.extend(
            (
                (promotion["ownerPath"], promotion["ownerBytes"], True),
                (
                    promotion["attestationPath"],
                    promotion["attestationBytes"],
                    True,
                ),
                (
                    promotion["metadataPath"],
                    promotion["metadataBytes"],
                    False,
                ),
            )
        )
    writes.append((CATALOG_PATH, promoted_catalog_bytes, False))
    original_bytes: dict[Path, bytes] = {
        path: path.read_bytes() for path, _, must_be_new in writes if not must_be_new
    }
    temporary_paths: list[Path] = []
    applied_paths: list[tuple[Path, bool]] = []
    try:
        for index, (path, payload, must_be_new) in enumerate(writes):
            if must_be_new and path.exists():
                raise PromotionError(f"拒绝覆盖已有发布记录：{path}")
            temp = path.with_name(
                f".{path.name}.promote-{os.getpid()}-{index}.tmp"
            )
            if temp.exists():
                raise PromotionError(f"临时文件已存在：{temp}")
            with temp.open("xb") as stream:
                stream.write(payload)
                stream.flush()
                os.fsync(stream.fileno())
            temporary_paths.append(temp)
        for (path, _, must_be_new), temp in zip(writes, temporary_paths):
            os.replace(temp, path)
            applied_paths.append((path, must_be_new))
        temporary_paths.clear()
    except Exception:
        for temp in temporary_paths:
            try:
                temp.unlink(missing_ok=True)
            except OSError:
                pass
        for path, must_be_new in reversed(applied_paths):
            try:
                if must_be_new:
                    path.unlink(missing_ok=True)
                else:
                    path.write_bytes(
                        original_catalog_bytes
                        if path == CATALOG_PATH
                        else original_bytes[path]
                    )
            except OSError:
                pass
        raise


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Fail-closed promotion of frozen static NPC evidence to a "
            "schema-v2 owner-approved runtime release."
        )
    )
    parser.add_argument(
        "--appearance-id",
        action="append",
        required=True,
        help="Canonical appearanceId; repeat for a reviewed batch.",
    )
    parser.add_argument("--owner-id", required=True)
    parser.add_argument("--approved-at-utc", required=True)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check-only", action="store_true")
    mode.add_argument("--apply", action="store_true")
    parser.add_argument(
        "--owner-accepted-frozen-evidence",
        action="store_true",
        help="Required with --apply; confirms explicit project-owner acceptance.",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        owner_id = args.owner_id.strip()
        if not owner_id:
            raise PromotionError("--owner-id 不能为空")
        _validate_utc(args.approved_at_utc)
        appearance_ids = list(dict.fromkeys(args.appearance_id))
        if len(appearance_ids) != len(args.appearance_id):
            raise PromotionError("--appearance-id 不得重复")
        if args.apply and not args.owner_accepted_frozen_evidence:
            raise PromotionError(
                "--apply 必须显式提供 --owner-accepted-frozen-evidence"
            )
        original_catalog_bytes = CATALOG_PATH.read_bytes()
        catalog = _read_json(CATALOG_PATH, label="npc_appearances catalog")
        promoted_catalog = copy.deepcopy(catalog)
        promotions = [
            _prepare_promotion(
                promoted_catalog,
                appearance_id,
                owner_id,
                args.approved_at_utc,
            )
            for appearance_id in appearance_ids
        ]
        for promotion in promotions:
            record = _catalog_record(
                promoted_catalog, promotion["appearanceId"]
            )
            record.clear()
            record.update(promotion["promotedRecord"])
        promoted_catalog_bytes = _promoted_catalog_bytes(
            original_catalog_bytes, promoted_catalog, promotions
        )
        if args.apply:
            _atomic_apply(
                promotions, original_catalog_bytes, promoted_catalog_bytes
            )
        summary = {
            "status": "applied" if args.apply else "check-only-passed",
            "attestationSchemaVersion": 2,
            "ownerId": owner_id,
            "approvedAtUtc": args.approved_at_utc,
            "appearances": [
                {
                    "appearanceId": value["appearanceId"],
                    "sourceSetSha256": value["sourceSetSha256"],
                    "ownerDecisionSha256": value["ownerDecisionSha256"],
                    "releaseAttestationSha256": value[
                        "releaseAttestationSha256"
                    ],
                }
                for value in promotions
            ],
        }
        print(json.dumps(summary, ensure_ascii=False, indent=2))
        return 0
    except (OSError, PromotionError) as error:
        print(f"NPC release promotion failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
