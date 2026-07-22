#!/usr/bin/env python3
"""Prepare a deterministic, direction-neutral NPC blind-review packet.

The reviewer receives only eight opaque 320x320 PNG paths and their hashes.
The direction answer key stays in a separate producer-only mapping.  Existing
output directories are never reused, so a stale or partially reviewed run
cannot be silently overwritten.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path
from typing import Any, Sequence

from PIL import Image, UnidentifiedImageError


REPO_ROOT = Path(__file__).resolve().parents[1]
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
SAFE_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")
LOWER_SHA256 = re.compile(r"^[0-9a-f]{64}$")
UTC_TIMESTAMP = re.compile(
    r"^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]+)?Z$"
)
INDEX_TYPE = "beastbound_npc_direction_review_evidence"
INDEX_SCENE = "res://scenes/qa/NpcDirectionReview.tscn"
PARITY_TYPE = "beastbound_npc_direction_review_parity"
PACKET_TYPE = "beastbound_npc_blind_review_packet"
MAPPING_TYPE = "beastbound_npc_blind_producer_mapping"
WRAPPER_OPERATION = "transparent_pad_32_to_320_v1"
EXPECTED_FRAME_COUNT = 12


class BlindPacketError(RuntimeError):
    """A fail-closed blind-packet contract error."""


def _sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _rgba_sha256(image: Image.Image) -> str:
    rgba = image if image.mode == "RGBA" else image.convert("RGBA")
    prefix = f"{rgba.width}x{rgba.height}:RGBA\n".encode("utf-8")
    return _sha256_bytes(prefix + rgba.tobytes())


def _canonical_rgba_sha256(image: Image.Image) -> str:
    """Match WorldReviewFrameParity's partial-alpha canonical RGBA hash."""
    rgba = image if image.mode == "RGBA" else image.convert("RGBA")
    pixels = bytearray(rgba.tobytes())
    for offset in range(0, len(pixels), 4):
        if pixels[offset + 3] < 255:
            pixels[offset] = 0
            pixels[offset + 1] = 0
            pixels[offset + 2] = 0
    prefix = f"{rgba.width}x{rgba.height}:RGBA\n".encode("utf-8")
    return _sha256_bytes(prefix + pixels)


def _json_bytes(value: Any) -> bytes:
    return (
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    ).encode("utf-8")


def _read_json(path: Path, *, label: str) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise BlindPacketError(f"无法读取 {label}：{path}: {error}") from error
    if not isinstance(value, dict):
        raise BlindPacketError(f"{label} 根节点必须是对象：{path}")
    return value


def _write_new(path: Path, payload: bytes) -> None:
    try:
        with path.open("xb") as stream:
            stream.write(payload)
    except FileExistsError as error:
        raise BlindPacketError(f"拒绝覆盖已有盲审产物：{path}") from error


def _resolved_under(path: Path, root: Path, *, label: str) -> Path:
    resolved = path.resolve(strict=False)
    root_resolved = root.resolve(strict=True)
    try:
        resolved.relative_to(root_resolved)
    except ValueError as error:
        raise BlindPacketError(f"{label} 越出仓库根目录：{path}") from error
    return resolved


def _safe_relative_path(value: Any, *, label: str) -> str:
    if not isinstance(value, str) or not value or "\\" in value:
        raise BlindPacketError(f"{label} 不是安全相对路径")
    candidate = Path(value)
    if candidate.is_absolute() or ".." in candidate.parts or "" in candidate.parts:
        raise BlindPacketError(f"{label} 不是安全相对路径：{value}")
    return candidate.as_posix()


def _required_hash(value: Any, *, label: str) -> str:
    if not isinstance(value, str) or LOWER_SHA256.fullmatch(value) is None:
        raise BlindPacketError(f"{label} 不是 lowercase SHA-256")
    return value


def _installation_frames(
    metadata: dict[str, Any], appearance_id: str
) -> list[dict[str, Any]]:
    if metadata.get("appearanceId") != appearance_id:
        raise BlindPacketError("action-bundle-meta appearanceId 与请求不一致")
    installation = metadata.get("installation")
    if not isinstance(installation, dict):
        raise BlindPacketError("action-bundle-meta 缺少 installation")
    values = installation.get("frames")
    if not isinstance(values, list):
        raise BlindPacketError("installation.frames 不是数组")

    required: dict[str, dict[str, Any]] = {}
    expected_sources = {
        **{
            f"runtime/world/{direction}/idle-1.png": ("world", direction)
            for direction in DIRECTIONS
        },
        **{
            f"runtime/portraits/{state}.png": ("portrait", state)
            for state in PORTRAIT_STATES
        },
    }
    for value in values:
        if not isinstance(value, dict):
            continue
        source_path = value.get("sourceRuntimePath")
        if source_path not in expected_sources:
            continue
        if source_path in required:
            raise BlindPacketError(f"installation 重复登记：{source_path}")
        expected_kind, expected_slot = expected_sources[source_path]
        installed_path = _safe_relative_path(
            value.get("installedPath"), label=f"{source_path}.installedPath"
        )
        file_sha = _required_hash(
            value.get("fileSha256"), label=f"{source_path}.fileSha256"
        )
        rgba_sha = _required_hash(
            value.get("rgbaSha256"), label=f"{source_path}.rgbaSha256"
        )
        if value.get("kind") != expected_kind:
            raise BlindPacketError(f"installation kind 不匹配：{source_path}")
        required[source_path] = {
            "kind": expected_kind,
            "slot": expected_slot,
            "sourceRuntimePath": source_path,
            "installedPath": installed_path,
            "fileSha256": file_sha,
            "rgbaSha256": rgba_sha,
        }
    missing = sorted(set(expected_sources) - set(required))
    if missing:
        raise BlindPacketError(f"installation 漏登记 world8/portrait4：{missing}")
    return [
        required[f"runtime/world/{direction}/idle-1.png"]
        for direction in DIRECTIONS
    ] + [
        required[f"runtime/portraits/{state}.png"]
        for state in PORTRAIT_STATES
    ]


def _source_set_sha256(appearance_id: str, frames: list[dict[str, Any]]) -> str:
    lines = "".join(
        "\t".join(
            (
                str(frame["kind"]),
                str(frame["slot"]),
                f"res://assets/npcs/{appearance_id}/{frame['installedPath']}",
                _required_hash(
                    frame.get("fileSha256"),
                    label=f"{frame['installedPath']}.fileSha256",
                ),
                _required_hash(
                    frame.get("sourceFullDecodedRgbaSha256"),
                    label=(
                        f"{frame['installedPath']}.sourceFullDecodedRgbaSha256"
                    ),
                ),
                _required_hash(
                    frame.get("sourceDecodedRgbaSha256"),
                    label=f"{frame['installedPath']}.sourceDecodedRgbaSha256",
                ),
            )
        )
        + "\n"
        for frame in frames
    )
    return _sha256_bytes(lines.encode("utf-8"))


def _frozen_preflight_frames(
    *,
    repo_root: Path,
    evidence_index_path: Path,
    appearance_entry: dict[str, Any],
    appearance_id: str,
    run_id: str,
    installation_frames: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    artifact = appearance_entry.get("preflightParity")
    if not isinstance(artifact, dict):
        raise BlindPacketError("evidence index 缺少冻结 preflightParity")
    artifact_path_value = _safe_relative_path(
        artifact.get("path"), label="preflightParity.path"
    )
    artifact_path = _resolved_under(
        repo_root / artifact_path_value,
        repo_root,
        label="preflightParity.path",
    )
    expected_artifact_path = (
        evidence_index_path.parent
        / appearance_id
        / "preflight-parity.json"
    ).resolve(strict=False)
    if artifact_path != expected_artifact_path:
        raise BlindPacketError(
            "preflightParity.path 未绑定当前 run/appearance"
        )
    if not artifact_path.is_file():
        raise BlindPacketError("冻结 preflight parity 文件不存在")
    artifact_sha = _required_hash(
        artifact.get("sha256"), label="preflightParity.sha256"
    )
    if _sha256_file(artifact_path) != artifact_sha:
        raise BlindPacketError("冻结 preflight parity 文件 hash 漂移")
    artifact_size = artifact.get("sizeBytes")
    if (
        type(artifact_size) is not int
        or artifact_size <= 0
        or artifact_path.stat().st_size != artifact_size
    ):
        raise BlindPacketError("冻结 preflight parity 文件大小漂移")

    expected_source_set = _required_hash(
        appearance_entry.get("sourceSetSha256"),
        label="evidence index appearance.sourceSetSha256",
    )
    if (
        artifact.get("status") != "passed"
        or artifact.get("processKind") != "preflight"
        or artifact.get("checkedFrames") != EXPECTED_FRAME_COUNT
        or artifact.get("passedFrames") != EXPECTED_FRAME_COUNT
        or artifact.get("expectedFrames") != EXPECTED_FRAME_COUNT
        or artifact.get("sourceSetSha256") != expected_source_set
    ):
        raise BlindPacketError(
            "evidence index preflightParity sourceSet/摘要无效"
        )

    report = _read_json(artifact_path, label="冻结 preflight parity")
    if (
        report.get("schemaVersion") != 1
        or report.get("reportType") != PARITY_TYPE
        or report.get("status") != "passed"
        or report.get("appearanceId") != appearance_id
        or report.get("runId") != run_id
        or report.get("processKind") != "preflight"
        or report.get("checkedFrames") != EXPECTED_FRAME_COUNT
        or report.get("passedFrames") != EXPECTED_FRAME_COUNT
        or report.get("runtimeMirroring") is not False
        or report.get("errors") != []
    ):
        raise BlindPacketError("冻结 preflight parity 报告合同无效")
    report_source_set = _required_hash(
        report.get("sourceSetSha256"),
        label="preflight parity sourceSetSha256",
    )
    if report_source_set != expected_source_set:
        raise BlindPacketError("冻结 preflight parity sourceSet 与 index 不一致")
    report_frames = report.get("frames")
    if (
        not isinstance(report_frames, list)
        or len(report_frames) != EXPECTED_FRAME_COUNT
        or len(installation_frames) != EXPECTED_FRAME_COUNT
    ):
        raise BlindPacketError("冻结 preflight parity 必须覆盖 world8/portrait4")

    frozen: list[dict[str, Any]] = []
    for ordinal, (installed, parity_value) in enumerate(
        zip(installation_frames, report_frames, strict=True)
    ):
        label = f"preflight parity frames[{ordinal}]"
        if not isinstance(parity_value, dict):
            raise BlindPacketError(f"{label} 不是对象")
        expected_path = (
            f"res://assets/npcs/{appearance_id}/{installed['installedPath']}"
        )
        source_full = _required_hash(
            parity_value.get("sourceFullDecodedRgbaSha256"),
            label=f"{label}.sourceFullDecodedRgbaSha256",
        )
        source_canonical = _required_hash(
            parity_value.get("sourceDecodedRgbaSha256"),
            label=f"{label}.sourceDecodedRgbaSha256",
        )
        loaded_canonical = _required_hash(
            parity_value.get("loadedDecodedRgbaSha256"),
            label=f"{label}.loadedDecodedRgbaSha256",
        )
        if (
            parity_value.get("kind") != installed["kind"]
            or parity_value.get("slot") != installed["slot"]
            or parity_value.get("path") != expected_path
            or parity_value.get("fileSha256") != installed["fileSha256"]
            or source_full != installed["rgbaSha256"]
            or source_canonical != loaded_canonical
            or parity_value.get("sourceLoadedRgbaMatch") is not True
            or parity_value.get("canonicalRgbaMatch") is not True
            or parity_value.get("importFresh") is not True
            or parity_value.get("loadMode") != "godot_import"
            or parity_value.get("status") != "passed"
            or parity_value.get("errors") != []
        ):
            raise BlindPacketError(
                f"{label} 未绑定当前 installation/file/full/canonical"
            )
        frozen.append(
            {
                **installed,
                "sourceFullDecodedRgbaSha256": source_full,
                "sourceDecodedRgbaSha256": source_canonical,
            }
        )

    if _source_set_sha256(appearance_id, frozen) != expected_source_set:
        raise BlindPacketError(
            "冻结 preflight parity sourceSet 未同时绑定 file/full/canonical"
        )
    return frozen


def _appearance_entry(
    index: dict[str, Any], appearance_id: str, run_id: str
) -> dict[str, Any]:
    if (
        index.get("schemaVersion") != 1
        or index.get("indexType") != INDEX_TYPE
        or index.get("status") != "passed"
        or index.get("scene") != INDEX_SCENE
        or index.get("runId") != run_id
    ):
        raise BlindPacketError("evidence index schema/status/scene/runId 无效或陈旧")
    appearance_ids = index.get("appearanceIds")
    if not isinstance(appearance_ids, list) or appearance_id not in appearance_ids:
        raise BlindPacketError("evidence index 未登记当前 appearanceId")
    appearances = index.get("appearances")
    if not isinstance(appearances, list):
        raise BlindPacketError("evidence index.appearances 不是数组")
    matches = [
        value
        for value in appearances
        if isinstance(value, dict) and value.get("appearanceId") == appearance_id
    ]
    if len(matches) != 1 or matches[0].get("runId") != run_id:
        raise BlindPacketError("evidence index appearance entry 缺失、重复或 runId 陈旧")
    if matches[0].get("status") != "passed":
        raise BlindPacketError("evidence index appearance entry 未通过")
    return matches[0]


def _deterministic_order(
    *, run_id: str, appearance_id: str, index_sha: str, source_set_sha: str
) -> tuple[list[str], str]:
    seed_material = (
        f"{run_id}\n{appearance_id}\n{index_sha}\n{source_set_sha}\n"
    ).encode("utf-8")
    seed_sha = _sha256_bytes(seed_material)
    order = sorted(
        DIRECTIONS,
        key=lambda direction: _sha256_bytes(
            f"{seed_sha}\n{direction}\n".encode("utf-8")
        ),
    )
    if tuple(order) == DIRECTIONS:
        order = order[1:] + order[:1]
    return order, seed_sha


def prepare_blind_packet(
    *,
    repo_root: Path,
    run_id: str,
    appearance_id: str,
    evidence_index_path: Path,
    metadata_path: Path,
    producer_id: str,
) -> dict[str, Any]:
    repo_root = repo_root.resolve(strict=True)
    if SAFE_ID.fullmatch(run_id) is None:
        raise BlindPacketError(f"不安全的 runId：{run_id!r}")
    if SAFE_ID.fullmatch(appearance_id) is None:
        raise BlindPacketError(f"不安全的 appearanceId：{appearance_id!r}")
    if not producer_id.strip():
        raise BlindPacketError("producerId 不能为空")
    evidence_index_path = _resolved_under(
        evidence_index_path, repo_root, label="evidence index"
    )
    metadata_path = _resolved_under(metadata_path, repo_root, label="metadata")
    try:
        index_relative = evidence_index_path.relative_to(repo_root)
    except ValueError as error:  # pragma: no cover - guarded above
        raise BlindPacketError("evidence index 越出仓库") from error
    if (
        index_relative.parts[:2] != (".run", "evidence")
        or evidence_index_path.name != "evidence-index.json"
        or evidence_index_path.parent.name != run_id
    ):
        raise BlindPacketError("evidence index 路径必须位于 .run/evidence/.../<runId>/evidence-index.json")
    expected_metadata = (
        repo_root
        / "client"
        / "godot"
        / "assets"
        / "npcs"
        / appearance_id
        / "action-bundle-meta.json"
    ).resolve(strict=False)
    if metadata_path != expected_metadata:
        raise BlindPacketError("metadata 路径未绑定当前 appearance asset root")

    index = _read_json(evidence_index_path, label="evidence index")
    metadata = _read_json(metadata_path, label="action-bundle-meta")
    appearance_entry = _appearance_entry(index, appearance_id, run_id)
    evidence_index_sha = _sha256_file(evidence_index_path)
    installation_frames = _installation_frames(metadata, appearance_id)
    frames = _frozen_preflight_frames(
        repo_root=repo_root,
        evidence_index_path=evidence_index_path,
        appearance_entry=appearance_entry,
        appearance_id=appearance_id,
        run_id=run_id,
        installation_frames=installation_frames,
    )
    source_set_sha = _source_set_sha256(appearance_id, frames)
    if appearance_entry.get("sourceSetSha256") != source_set_sha:
        raise BlindPacketError("evidence index sourceSet 未绑定当前 installation world8/portrait4")
    generated_at = index.get("generatedAtUtc")
    if not isinstance(generated_at, str) or UTC_TIMESTAMP.fullmatch(generated_at) is None:
        raise BlindPacketError("evidence index.generatedAtUtc 不是冻结 UTC 时间")

    asset_root = metadata_path.parent
    world_by_direction = {str(frame["slot"]): frame for frame in frames[:8]}
    source_images: dict[str, Image.Image] = {}
    for frame in frames:
        installed = _resolved_under(
            asset_root / str(frame["installedPath"]), asset_root, label="installed PNG"
        )
        if not installed.is_file() or _sha256_file(installed) != frame["fileSha256"]:
            raise BlindPacketError(f"当前安装 PNG 文件 hash 漂移：{installed}")
        try:
            with Image.open(installed) as opened:
                opened.load()
                if opened.mode != "RGBA":
                    raise BlindPacketError(f"当前安装 PNG 必须为原生 RGBA：{installed}")
                image = opened.copy()
        except (OSError, UnidentifiedImageError) as error:
            raise BlindPacketError(f"当前安装 PNG 无法解码：{installed}") from error
        if _rgba_sha256(image) != frame["rgbaSha256"]:
            raise BlindPacketError(f"当前安装 PNG decoded RGBA 漂移：{installed}")
        if _canonical_rgba_sha256(image) != frame["sourceDecodedRgbaSha256"]:
            raise BlindPacketError(
                f"当前安装 PNG canonical RGBA 与冻结 parity 漂移：{installed}"
            )
        if frame["kind"] == "world":
            if image.size != (256, 256):
                raise BlindPacketError(f"世界 PNG 必须为 256x256：{installed}")
            source_images[str(frame["slot"])] = image
        else:
            image.close()

    appearance_dir = evidence_index_path.parent / appearance_id
    blind_dir = appearance_dir / "blind"
    private_dir = appearance_dir / "private"
    if blind_dir.exists() or private_dir.exists():
        raise BlindPacketError("拒绝覆盖已有 blind/private 输出；请使用新的 runId")
    appearance_dir.mkdir(parents=False, exist_ok=True)
    blind_dir.mkdir(parents=False, exist_ok=False)
    private_dir.mkdir(parents=False, exist_ok=False)

    order, shuffle_seed_sha = _deterministic_order(
        run_id=run_id,
        appearance_id=appearance_id,
        index_sha=evidence_index_sha,
        source_set_sha=source_set_sha,
    )
    assets: list[dict[str, Any]] = []
    presentation: list[dict[str, Any]] = []
    for presentation_index, direction in enumerate(order):
        opaque_name = _sha256_bytes(
            f"{shuffle_seed_sha}\nanonymous\n{presentation_index}\n".encode("utf-8")
        )[:32] + ".png"
        opaque_path = blind_dir / opaque_name
        wrapper = Image.new("RGBA", (320, 320), (0, 0, 0, 0))
        wrapper.alpha_composite(source_images[direction], (32, 32))
        try:
            with opaque_path.open("xb") as output:
                wrapper.save(output, format="PNG", optimize=False, compress_level=9)
        except FileExistsError as error:
            raise BlindPacketError(f"拒绝覆盖匿名 PNG：{opaque_path}") from error
        anonymous_file_sha = _sha256_file(opaque_path)
        anonymous_rgba_sha = _rgba_sha256(wrapper)
        frame = world_by_direction[direction]
        if (
            anonymous_file_sha == frame["fileSha256"]
            or anonymous_rgba_sha == frame["rgbaSha256"]
        ):
            raise BlindPacketError("匿名 wrapper 仍可通过安装 hash 直接解盲")
        assets.append(
            {
                "presentationIndex": presentation_index,
                "opaquePath": opaque_path.resolve().as_posix(),
                "fileSha256": anonymous_file_sha,
                "rgbaSha256": anonymous_rgba_sha,
            }
        )
        presentation.append(
            {
                "presentationIndex": presentation_index,
                "sourceRuntimePath": frame["sourceRuntimePath"],
                "installedPath": frame["installedPath"],
                "fileSha256": frame["fileSha256"],
                "rgbaSha256": frame["rgbaSha256"],
                "anonymousFileSha256": anonymous_file_sha,
                "anonymousRgbaSha256": anonymous_rgba_sha,
                "wrapperOperation": WRAPPER_OPERATION,
            }
        )
        wrapper.close()
    for image in source_images.values():
        image.close()

    packet = {
        "schemaVersion": 1,
        "packetType": PACKET_TYPE,
        "status": "prepared",
        "appearanceId": appearance_id,
        "evidenceIndexSha256": evidence_index_sha,
        "producerId": producer_id.strip(),
        "generatedAtUtc": generated_at,
        "assets": assets,
    }
    packet_path = blind_dir / "reviewer-packet.json"
    _write_new(packet_path, _json_bytes(packet))
    packet_sha = _sha256_file(packet_path)
    mapping = {
        "schemaVersion": 1,
        "mappingType": MAPPING_TYPE,
        "status": "prepared",
        "appearanceId": appearance_id,
        "evidenceIndexSha256": evidence_index_sha,
        "sourceSetSha256": source_set_sha,
        "reviewPacketSha256": packet_sha,
        "shuffleSeedSha256": shuffle_seed_sha,
        "producerId": producer_id.strip(),
        "generatedAtUtc": generated_at,
        "presentation": presentation,
    }
    mapping_path = private_dir / "producer-mapping.json"
    _write_new(mapping_path, _json_bytes(mapping))
    return {
        "status": "prepared",
        "runId": run_id,
        "appearanceId": appearance_id,
        "reviewPacket": packet_path.resolve().as_posix(),
        "reviewPacketSha256": packet_sha,
        "producerMapping": mapping_path.resolve().as_posix(),
        "producerMappingSha256": _sha256_file(mapping_path),
        "shuffleSeedSha256": shuffle_seed_sha,
        "anonymousPngCount": len(assets),
    }


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="生成不可按文件名或安装 hash 解盲的 NPC 八方向 reviewer packet。"
    )
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--appearance-id", required=True)
    parser.add_argument("--evidence-index", required=True, type=Path)
    parser.add_argument("--metadata", type=Path)
    parser.add_argument("--producer-id", required=True)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    metadata = args.metadata or (
        REPO_ROOT
        / "client"
        / "godot"
        / "assets"
        / "npcs"
        / args.appearance_id
        / "action-bundle-meta.json"
    )
    try:
        result = prepare_blind_packet(
            repo_root=REPO_ROOT,
            run_id=args.run_id,
            appearance_id=args.appearance_id,
            evidence_index_path=args.evidence_index,
            metadata_path=metadata,
            producer_id=args.producer_id,
        )
    except BlindPacketError as error:
        print(f"NPC blind packet failed: {error}", file=sys.stderr)
        return 1
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
