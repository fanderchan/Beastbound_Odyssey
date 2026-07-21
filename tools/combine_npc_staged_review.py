#!/usr/bin/env python3
"""Create a producer-only NPC blind-audit v2 from frozen Stage A/B originals.

The reviewer files are inputs, never edited.  The final audit copies reviewer
arrays verbatim, adds current installation bindings in a separate section, and
privately deblinds Stage A against the producer mapping only after Stage B is
already frozen.
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Sequence


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
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
DIRECTION_TOKEN_RE = re.compile(
    r"(^|[^a-z])(southwest|southeast|northwest|northeast|south|north|west|east)([^a-z]|$)",
    re.IGNORECASE,
)
PRIVATE_TOKENS = (
    "producer-mapping",
    "private",
    "answerkey",
    "sourceruntimepath",
    "installedpath",
    "西南",
    "东南",
    "西北",
    "东北",
    "向南",
    "向北",
    "向西",
    "向东",
)
STAGE_A_KEYS = {
    "schemaVersion",
    "resultType",
    "status",
    "appearanceId",
    "reviewerId",
    "reviewPacketSha256",
    "frozenAtUtc",
    "directionResults",
}
STAGE_B_KEYS = {
    "schemaVersion",
    "observationType",
    "status",
    "appearanceId",
    "reviewerId",
    "stageAResultSha256",
    "frozenAtUtc",
    "portraitInspections",
    "mainSceneObservations",
}
STAGE_A_ROW_KEYS = {
    "presentationIndex",
    "classifiedDirection",
    "status",
    "visualObservation",
}
STAGE_B_PORTRAIT_KEYS = {
    "state",
    "reviewerArtifactPath",
    "reviewerArtifactSha256",
    "status",
    "visualObservation",
}
STAGE_B_MAIN_KEYS = {
    "reviewerArtifactPath",
    "reviewerArtifactSha256",
    "scene",
    "mapId",
    "npcId",
    "appearanceId",
    "worldVisible",
    "portraitVisible",
    "status",
    "visualObservation",
}


class StagedReviewError(RuntimeError):
    """A fail-closed staged review or producer-binding error."""


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _is_sha256(value: Any) -> bool:
    return isinstance(value, str) and SHA256_RE.fullmatch(value) is not None


def _read_json(path: Path, label: str) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise StagedReviewError(f"无法读取 {label}: {path}: {error}") from error
    if not isinstance(value, dict):
        raise StagedReviewError(f"{label} 根节点必须是对象: {path}")
    return value


def _resolve_repo_path(value: str | Path, label: str) -> Path:
    candidate = Path(value).expanduser()
    resolved = (
        candidate.resolve(strict=False)
        if candidate.is_absolute()
        else (REPO_ROOT / candidate).resolve(strict=False)
    )
    try:
        resolved.relative_to(REPO_ROOT.resolve())
    except ValueError as error:
        raise StagedReviewError(f"{label} 必须位于仓库内: {resolved}") from error
    return resolved


def _require_exact_keys(value: dict[str, Any], expected: set[str], label: str) -> None:
    if set(value) != expected:
        raise StagedReviewError(
            f"{label} 字段集合无效; missing={sorted(expected - set(value))} "
            f"extra={sorted(set(value) - expected)}"
        )


def _parse_utc(value: Any, label: str) -> datetime:
    if not isinstance(value, str) or not re.fullmatch(
        r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]+)?Z",
        value,
    ):
        raise StagedReviewError(f"{label} 必须是 UTC 时间")
    try:
        parsed = datetime.fromisoformat(value.removesuffix("Z") + "+00:00")
    except ValueError as error:
        raise StagedReviewError(f"{label} 不是有效时间: {value}") from error
    return parsed


def _absolute_artifact(value: Any, label: str) -> Path:
    if not isinstance(value, str) or not Path(value).is_absolute():
        raise StagedReviewError(f"{label} 必须是绝对路径")
    return _resolve_repo_path(value, label)


def _verify_frozen_file(path: Path, expected_sha: Any, label: str) -> None:
    if not _is_sha256(expected_sha):
        raise StagedReviewError(f"{label} SHA-256 无效")
    if not path.is_file() or path.stat().st_size <= 0:
        raise StagedReviewError(f"{label} 不存在或为空: {path}")
    actual = _sha256(path)
    if actual != expected_sha:
        raise StagedReviewError(
            f"{label} hash 漂移: expected={expected_sha} actual={actual}"
        )


def _review_frozen_path(
    review: dict[str, Any], path_key: str, hash_key: str, label: str
) -> Path:
    path = _absolute_artifact(review.get(path_key), label)
    _verify_frozen_file(path, review.get(hash_key), label)
    return path


def _text_leaks_stage_b_answer(value: str) -> bool:
    lowered = value.strip().lower()
    return bool(DIRECTION_TOKEN_RE.search(lowered)) or any(
        token in lowered for token in PRIVATE_TOKENS
    )


def _artifact_path_leaks_stage_b_answer(path: Path) -> bool:
    # Ignore unrelated machine/repository ancestors.  Only the reviewer-facing
    # artifact's own tail can function as an answer-bearing label.
    return any(_text_leaks_stage_b_answer(part) for part in path.parts[-4:])


def _validate_stage_a(
    stage_a: dict[str, Any], appearance_id: str, packet_sha: str
) -> tuple[str, datetime]:
    _require_exact_keys(stage_a, STAGE_A_KEYS, "Stage A 原始结果")
    reviewer_id = str(stage_a.get("reviewerId", "")).strip()
    frozen_at = _parse_utc(stage_a.get("frozenAtUtc"), "Stage A frozenAtUtc")
    if (
        type(stage_a.get("schemaVersion")) is not int
        or stage_a["schemaVersion"] != 1
        or stage_a.get("resultType") != "beastbound_npc_blind_stage_a_result"
        or stage_a.get("status") != "frozen"
        or stage_a.get("appearanceId") != appearance_id
        or not reviewer_id
        or stage_a.get("reviewPacketSha256") != packet_sha
    ):
        raise StagedReviewError("Stage A 未冻结当前 appearance/packet/reviewer")
    rows = stage_a.get("directionResults")
    if not isinstance(rows, list) or len(rows) != 8:
        raise StagedReviewError("Stage A directionResults 必须恰好八项")
    indices: set[int] = set()
    directions: set[str] = set()
    for row in rows:
        if not isinstance(row, dict):
            raise StagedReviewError("Stage A directionResults 存在非对象项")
        _require_exact_keys(row, STAGE_A_ROW_KEYS, "Stage A directionResults row")
        index = row.get("presentationIndex")
        direction = row.get("classifiedDirection")
        if (
            type(index) is not int
            or index not in range(8)
            or index in indices
            or direction not in DIRECTIONS
            or direction in directions
            or row.get("status") != "pass"
            or len(str(row.get("visualObservation", "")).strip()) < 4
        ):
            raise StagedReviewError("Stage A directionResults 内容无效或重复")
        indices.add(index)
        directions.add(str(direction))
    return reviewer_id, frozen_at


def _validate_stage_b(
    stage_b: dict[str, Any],
    appearance_id: str,
    reviewer_id: str,
    stage_a_sha: str,
    stage_a_time: datetime,
) -> datetime:
    _require_exact_keys(stage_b, STAGE_B_KEYS, "Stage B 原始观察")
    frozen_at = _parse_utc(stage_b.get("frozenAtUtc"), "Stage B frozenAtUtc")
    if (
        type(stage_b.get("schemaVersion")) is not int
        or stage_b["schemaVersion"] != 1
        or stage_b.get("observationType")
        != "beastbound_npc_blind_stage_b_observation"
        or stage_b.get("status") != "frozen"
        or stage_b.get("appearanceId") != appearance_id
        or str(stage_b.get("reviewerId", "")).strip() != reviewer_id
        or stage_b.get("stageAResultSha256") != stage_a_sha
        or frozen_at <= stage_a_time
    ):
        raise StagedReviewError("Stage B 未在 Stage A 后由同一 reviewer 冻结")
    portraits = stage_b.get("portraitInspections")
    if not isinstance(portraits, list) or len(portraits) != 4:
        raise StagedReviewError("Stage B portraitInspections 必须恰好四项")
    states: set[str] = set()
    paths: set[Path] = set()
    for row in portraits:
        if not isinstance(row, dict):
            raise StagedReviewError("Stage B portraitInspections 存在非对象项")
        _require_exact_keys(row, STAGE_B_PORTRAIT_KEYS, "Stage B portrait row")
        state = row.get("state")
        path = _absolute_artifact(row.get("reviewerArtifactPath"), "Stage B portrait artifact")
        observation = str(row.get("visualObservation", ""))
        if (
            state not in PORTRAIT_STATES
            or state in states
            or path in paths
            or row.get("status") != "pass"
            or len(observation.strip()) < 4
            or _artifact_path_leaks_stage_b_answer(path)
            or _text_leaks_stage_b_answer(observation)
        ):
            raise StagedReviewError("Stage B portrait 观察无效、重复或泄露方向/private")
        _verify_frozen_file(path, row.get("reviewerArtifactSha256"), "Stage B portrait artifact")
        states.add(str(state))
        paths.add(path)
    mains = stage_b.get("mainSceneObservations")
    if not isinstance(mains, list) or not mains:
        raise StagedReviewError("Stage B mainSceneObservations 不能为空")
    main_paths: set[Path] = set()
    for row in mains:
        if not isinstance(row, dict):
            raise StagedReviewError("Stage B Main 观察存在非对象项")
        _require_exact_keys(row, STAGE_B_MAIN_KEYS, "Stage B Main row")
        path = _absolute_artifact(row.get("reviewerArtifactPath"), "Stage B Main artifact")
        observation = str(row.get("visualObservation", ""))
        if (
            path in main_paths
            or row.get("scene") != "res://scenes/Main.tscn"
            or not str(row.get("mapId", "")).strip()
            or not str(row.get("npcId", "")).strip()
            or row.get("appearanceId") != appearance_id
            or row.get("worldVisible") is not True
            or row.get("portraitVisible") is not True
            or row.get("status") != "pass"
            or len(observation.strip()) < 4
            or _artifact_path_leaks_stage_b_answer(path)
            or _text_leaks_stage_b_answer(observation)
        ):
            raise StagedReviewError("Stage B Main 观察无效、重复或泄露方向/private")
        _verify_frozen_file(path, row.get("reviewerArtifactSha256"), "Stage B Main artifact")
        main_paths.add(path)
    return frozen_at


def _installation_by_key(metadata: dict[str, Any]) -> dict[str, dict[str, Any]]:
    installation = metadata.get("installation")
    frames = installation.get("frames") if isinstance(installation, dict) else None
    if not isinstance(frames, list):
        raise StagedReviewError("action meta installation.frames 必须是数组")
    result: dict[str, dict[str, Any]] = {}
    for frame in frames:
        if not isinstance(frame, dict):
            continue
        kind = frame.get("kind")
        source = str(frame.get("sourceRuntimePath", ""))
        key = ""
        if kind == "world":
            match = re.fullmatch(r"runtime/world/([^/]+)/idle-1\.png", source)
            key = f"world|{match.group(1)}" if match else ""
        elif kind == "portrait":
            match = re.fullmatch(r"runtime/portraits/([^/]+)\.png", source)
            key = f"portrait|{match.group(1)}" if match else ""
        if not key or key in result:
            raise StagedReviewError(f"installation frame 无法唯一归类: {source}")
        for hash_key in ("fileSha256", "rgbaSha256"):
            if not _is_sha256(frame.get(hash_key)):
                raise StagedReviewError(f"installation frame {hash_key} 无效: {source}")
        result[key] = frame
    expected = {f"world|{value}" for value in DIRECTIONS} | {
        f"portrait|{value}" for value in PORTRAIT_STATES
    }
    if set(result) != expected:
        raise StagedReviewError("installation 必须恰好覆盖 world8 + portrait4")
    return result


def _mapping_by_index(
    mapping: dict[str, Any], appearance_id: str
) -> dict[int, dict[str, Any]]:
    presentation = mapping.get("presentation")
    if (
        mapping.get("schemaVersion") != 1
        or mapping.get("mappingType") != "beastbound_npc_blind_producer_mapping"
        or mapping.get("status") != "prepared"
        or mapping.get("appearanceId") != appearance_id
        or not isinstance(presentation, list)
        or len(presentation) != 8
    ):
        raise StagedReviewError("private producer mapping schema 无效")
    result: dict[int, dict[str, Any]] = {}
    for row in presentation:
        index = row.get("presentationIndex") if isinstance(row, dict) else None
        if type(index) is not int or index not in range(8) or index in result:
            raise StagedReviewError("private producer mapping presentationIndex 无效")
        result[index] = row
    return result


def _runtime_direction(source_path: Any) -> str:
    match = re.fullmatch(r"runtime/world/([^/]+)/idle-1\.png", str(source_path))
    return match.group(1) if match and match.group(1) in DIRECTIONS else ""


def _check_stage_a_deblind(
    stage_a: dict[str, Any], mapping_by_index: dict[int, dict[str, Any]]
) -> None:
    for row in stage_a["directionResults"]:
        index = row["presentationIndex"]
        actual = _runtime_direction(mapping_by_index[index].get("sourceRuntimePath"))
        if row["classifiedDirection"] != actual:
            raise StagedReviewError(
                f"Stage A 解盲失败: presentationIndex={index} "
                f"classified={row['classifiedDirection']} actual={actual}"
            )


def _portrait_bindings(
    stage_b: dict[str, Any], installed: dict[str, dict[str, Any]]
) -> list[dict[str, Any]]:
    bindings: list[dict[str, Any]] = []
    for inspection in stage_b["portraitInspections"]:
        state = inspection["state"]
        frame = installed[f"portrait|{state}"]
        if inspection["reviewerArtifactSha256"] != frame["fileSha256"]:
            raise StagedReviewError(
                f"Stage B portrait artifact 不是当前安装帧的字节副本: {state}"
            )
        bindings.append(
            {
                "state": state,
                "reviewerArtifactPath": inspection["reviewerArtifactPath"],
                "reviewerArtifactSha256": inspection["reviewerArtifactSha256"],
                "sourceRuntimePath": frame["sourceRuntimePath"],
                "installedPath": frame["installedPath"],
                "fileSha256": frame["fileSha256"],
                "rgbaSha256": frame["rgbaSha256"],
            }
        )
    return bindings


def _validate_stage_b_main_bindings(
    stage_b: dict[str, Any], review: dict[str, Any]
) -> None:
    paths = review.get("runtimeScreenshots")
    hashes = review.get("runtimeScreenshotSha256s")
    if not isinstance(paths, list) or not isinstance(hashes, list) or len(paths) != len(hashes):
        raise StagedReviewError("review runtimeScreenshots/path hashes 无效")
    expected = {
        _absolute_artifact(path, "runtime screenshot"): sha
        for path, sha in zip(paths, hashes)
    }
    observed = {
        _absolute_artifact(row["reviewerArtifactPath"], "Stage B Main artifact"):
        row["reviewerArtifactSha256"]
        for row in stage_b["mainSceneObservations"]
    }
    if observed != expected:
        raise StagedReviewError("Stage B Main 原件未恰好绑定 review.runtimeScreenshots")


def combine_staged_review(
    *,
    action_meta_path: Path,
    stage_a_path: Path,
    stage_b_path: Path,
    output_path: Path,
    producer_id: str,
    produced_at_utc: str,
) -> dict[str, Any]:
    action_meta_path = _resolve_repo_path(action_meta_path, "action meta")
    stage_a_path = _resolve_repo_path(stage_a_path, "Stage A result")
    stage_b_path = _resolve_repo_path(stage_b_path, "Stage B observation")
    output_path = _resolve_repo_path(output_path, "output")
    if output_path.exists():
        raise StagedReviewError(f"拒绝覆盖 final audit: {output_path}")
    metadata = _read_json(action_meta_path, "action-bundle-meta")
    appearance_id = str(metadata.get("appearanceId", "")).strip()
    review = metadata.get("review")
    if not appearance_id or not isinstance(review, dict):
        raise StagedReviewError("action meta 缺少 appearanceId/review")
    frozen_stage_a_path = _review_frozen_path(
        review, "blindStageAResult", "blindStageAResultSha256", "Stage A original"
    )
    frozen_stage_b_path = _review_frozen_path(
        review,
        "blindStageBObservation",
        "blindStageBObservationSha256",
        "Stage B original",
    )
    if stage_a_path != frozen_stage_a_path or stage_b_path != frozen_stage_b_path:
        raise StagedReviewError("CLI Stage A/B 路径与 action meta 冻结路径不一致")
    packet_path = _review_frozen_path(
        review, "blindReviewPacket", "blindReviewPacketSha256", "blind packet"
    )
    mapping_path = _review_frozen_path(
        review,
        "blindProducerMapping",
        "blindProducerMappingSha256",
        "private producer mapping",
    )
    stage_a = _read_json(stage_a_path, "Stage A original")
    stage_b = _read_json(stage_b_path, "Stage B original")
    packet = _read_json(packet_path, "blind packet")
    mapping = _read_json(mapping_path, "private producer mapping")
    packet_sha = str(review["blindReviewPacketSha256"])
    stage_a_sha = str(review["blindStageAResultSha256"])
    stage_b_sha = str(review["blindStageBObservationSha256"])
    reviewer_id, stage_a_time = _validate_stage_a(stage_a, appearance_id, packet_sha)
    stage_b_time = _validate_stage_b(
        stage_b, appearance_id, reviewer_id, stage_a_sha, stage_a_time
    )
    produced_at = _parse_utc(produced_at_utc, "producedAtUtc")
    producer_id = producer_id.strip()
    if not producer_id or producer_id == reviewer_id:
        raise StagedReviewError("producerId 必须非空且不同于 reviewerId")
    if produced_at <= stage_b_time:
        raise StagedReviewError("producer merge 必须晚于 Stage B freeze")
    if (
        packet.get("appearanceId") != appearance_id
        or packet.get("producerId") != producer_id
        or mapping.get("producerId") != producer_id
        or mapping.get("reviewPacketSha256") != packet_sha
    ):
        raise StagedReviewError("packet/mapping/producerId 绑定不一致")
    mapping_by_index = _mapping_by_index(mapping, appearance_id)
    _check_stage_a_deblind(stage_a, mapping_by_index)
    installed = _installation_by_key(metadata)
    portrait_bindings = _portrait_bindings(stage_b, installed)
    _validate_stage_b_main_bindings(stage_b, review)
    for key in (
        "runtimeEvidenceIndexSha256",
        "runtimeVideoSha256",
        "blindReviewPacketSha256",
        "blindStageAResultSha256",
        "blindStageBObservationSha256",
    ):
        if not _is_sha256(review.get(key)):
            raise StagedReviewError(f"review.{key} 无效")
    screenshot_hashes = review.get("runtimeScreenshotSha256s")
    if not isinstance(screenshot_hashes, list) or not screenshot_hashes or not all(
        _is_sha256(value) for value in screenshot_hashes
    ):
        raise StagedReviewError("review.runtimeScreenshotSha256s 无效")
    shuffle_sha = mapping.get("shuffleSeedSha256")
    if not _is_sha256(shuffle_sha):
        raise StagedReviewError("private mapping shuffleSeedSha256 无效")
    audit = {
        "schemaVersion": 2,
        "auditType": "beastbound_npc_direction_blind_audit",
        "status": "pass",
        "appearanceId": appearance_id,
        "runtimeScene": "res://scenes/Main.tscn",
        "evidenceIndexSha256": review["runtimeEvidenceIndexSha256"],
        "runtimeVideoSha256": review["runtimeVideoSha256"],
        "runtimeScreenshotSha256s": copy.deepcopy(screenshot_hashes),
        "canonicalDirections": list(DIRECTIONS),
        "flags": [],
        "producerId": producer_id,
        "reviewerId": reviewer_id,
        "producedAtUtc": produced_at_utc,
        "reviewPacketSha256": packet_sha,
        "shuffleSeedSha256": shuffle_sha,
        "stageAResultPath": stage_a_path.as_posix(),
        "stageAResultSha256": stage_a_sha,
        "stageBObservationPath": stage_b_path.as_posix(),
        "stageBObservationSha256": stage_b_sha,
        "directionResults": copy.deepcopy(stage_a["directionResults"]),
        "portraitInspections": copy.deepcopy(stage_b["portraitInspections"]),
        "portraitBindings": portrait_bindings,
        "mainSceneObservations": copy.deepcopy(stage_b["mainSceneObservations"]),
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(audit, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return {
        "audit": audit,
        "output": output_path.as_posix(),
        "sha256": _sha256(output_path),
        "reviewBinding": {
            "blindAudit": output_path.as_posix(),
            "blindAuditSha256": _sha256(output_path),
        },
    }


def _utc_now_text() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace(
        "+00:00", "Z"
    )


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="将冻结的 NPC Stage A/B reviewer 原件安全合并为 producer blind-audit v2。"
    )
    parser.add_argument("--action-meta", type=Path, required=True)
    parser.add_argument("--stage-a-result", type=Path, required=True)
    parser.add_argument("--stage-b-observation", type=Path, required=True)
    parser.add_argument("--producer-id", required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--produced-at-utc", default=_utc_now_text())
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        result = combine_staged_review(
            action_meta_path=args.action_meta,
            stage_a_path=args.stage_a_result,
            stage_b_path=args.stage_b_observation,
            output_path=args.output,
            producer_id=args.producer_id,
            produced_at_utc=args.produced_at_utc,
        )
    except (OSError, StagedReviewError) as error:
        print(f"npc staged review combine failed: {error}", file=sys.stderr)
        return 1
    print(json.dumps({key: value for key, value in result.items() if key != "audit"}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
