#!/usr/bin/env python3
"""Wire distinct real-Main action captures into an existing map review.

The Computer Use before/after images and receipts remain the operator proof.
This tool validates those immutable records, validates the companion 1280x720
PNG/capture-report pairs under ``evidence/runtime-actions``, and refreshes only
the aggregate review and manifest evidence references.  It never changes owner
approval, release approval, or runtime enablement.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import struct
import sys
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
MAPS_ROOT = REPO_ROOT / "client" / "godot" / "assets" / "maps"
ACTION_KINDS = (
    "pointer",
    "movement_path",
    "warp",
    "collision",
    "occlusion",
)
ACTION_MODES = {
    "pointer": "idle",
    "movement_path": "moving",
    "warp": "moving",
    "collision": "moving",
    "occlusion": "moving",
}
EXPECTED_LIFECYCLE = {
    "status": "owner_review_pending",
    "ownerReviewStatus": "pending",
    "releaseApproved": False,
    "runtimeEnabled": False,
}
SCENE = "res://scenes/Main.tscn"
ISO_UTC = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")


class BundleConfig:
    def __init__(
        self,
        *,
        map_ids: tuple[str, ...],
        dressed_action: tuple[str, str],
        layered_action: tuple[str, str],
    ) -> None:
        self.map_ids = map_ids
        self.dressed_action = dressed_action
        self.layered_action = layered_action


BUNDLE_CONFIGS = {
    "firebud_region_visual_v2": BundleConfig(
        map_ids=("firebud_training_yard", "firebud_village_gate"),
        dressed_action=("firebud_village_gate", "pointer"),
        layered_action=("firebud_training_yard", "pointer"),
    ),
    "earth_vein_cave_visual_v1": BundleConfig(
        map_ids=(
            "earth_vein_cave",
            "earth_vein_cave_f2",
            "earth_vein_cave_f3",
            "earth_vein_cave_f4",
        ),
        dressed_action=("earth_vein_cave", "pointer"),
        layered_action=("earth_vein_cave_f4", "collision"),
    ),
}


class ActionEvidenceError(RuntimeError):
    """The closed action-evidence refresh contract failed."""


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _json_bytes(value: Any) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def _load_json(path: Path, *, label: str) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ActionEvidenceError(f"{label} 无法解析：{path}") from error
    if not isinstance(value, dict):
        raise ActionEvidenceError(f"{label} 根节点必须是对象：{path}")
    return value


def _safe_bundle_path(bundle_root: Path, relative: str, *, label: str) -> Path:
    if not isinstance(relative, str) or not relative or Path(relative).is_absolute():
        raise ActionEvidenceError(f"{label} 不是 bundle 相对路径")
    root = bundle_root.resolve()
    path = (root / relative).resolve()
    try:
        path.relative_to(root)
    except ValueError as error:
        raise ActionEvidenceError(f"{label} 越出 bundle：{relative}") from error
    return path


def _validate_file_ref(
    bundle_root: Path,
    value: Any,
    *,
    label: str,
) -> Path:
    if not isinstance(value, dict):
        raise ActionEvidenceError(f"{label} 必须是文件引用")
    relative = value.get("path")
    digest = value.get("sha256")
    path = _safe_bundle_path(bundle_root, relative, label=label)
    if not path.is_file() or path.stat().st_size <= 0:
        raise ActionEvidenceError(f"{label} 文件缺失或为空：{relative}")
    actual = _sha256(path)
    if digest != actual:
        raise ActionEvidenceError(f"{label} SHA-256 不一致：{relative}")
    return path


def _file_ref(bundle_root: Path, path: Path) -> dict[str, str]:
    resolved = path.resolve()
    try:
        relative = resolved.relative_to(bundle_root.resolve()).as_posix()
    except ValueError as error:
        raise ActionEvidenceError(f"证据越出 bundle：{path}") from error
    if not resolved.is_file() or resolved.stat().st_size <= 0:
        raise ActionEvidenceError(f"证据文件缺失或为空：{relative}")
    return {"path": relative, "sha256": _sha256(resolved)}


def _png_dimensions(path: Path) -> tuple[int, int]:
    header = path.read_bytes()[:24]
    if len(header) != 24 or header[:8] != b"\x89PNG\r\n\x1a\n":
        raise ActionEvidenceError(f"正式截图不是 PNG：{path}")
    return struct.unpack(">II", header[16:24])


def _image_ref(bundle_root: Path, path: Path) -> dict[str, Any]:
    dimensions = _png_dimensions(path)
    if dimensions != (1280, 720):
        raise ActionEvidenceError(f"正式截图不是 1280x720：{path}")
    return {
        **_file_ref(bundle_root, path),
        "dimensions": [1280, 720],
        "alphaMode": "opaque",
    }


def _validate_capture_pair(
    bundle_root: Path,
    *,
    bundle_id: str,
    map_id: str,
    action_kind: str,
) -> tuple[dict[str, Any], dict[str, str]]:
    runtime_root = bundle_root / "evidence" / "runtime-actions" / map_id
    image_path = runtime_root / f"{action_kind}.png"
    report_path = runtime_root / f"{action_kind}-capture.json"
    image_ref = _image_ref(bundle_root, image_path)
    report_ref = _file_ref(bundle_root, report_path)
    report = _load_json(report_path, label="Main action capture report")
    expected_mode = ACTION_MODES[action_kind]
    required = {
        "schemaVersion": 1,
        "reportType": "beastbound_map_visual_main_review_capture",
        "result": "PASS",
        "ok": True,
        "bundleId": bundle_id,
        "mapId": map_id,
        "mode": expected_mode,
        "captureVariant": action_kind,
        "scene": SCENE,
        "viewport": [1280, 720],
        "mapArtStatus": "owner_review_pending",
        "mapArtQaPreview": True,
        "defaultProfileIsolation": True,
        "normalPlayerHud": True,
        "accountAuthenticated": False,
        "profileSaveEnabled": False,
        "serverAccountSession": False,
        "networkRequestAttempted": False,
        "networkRequestsDisconnected": True,
        "errors": [],
    }
    mismatches = [
        f"{key}={report.get(key)!r}"
        for key, expected in required.items()
        if report.get(key) != expected
    ]
    digest = image_ref["sha256"]
    nested = report.get("screenshot")
    if report.get("screenshotSha256") != digest:
        mismatches.append("screenshotSha256")
    if not isinstance(nested, dict) or nested.get("sha256") != digest:
        mismatches.append("screenshot.sha256")
    relative_image = image_ref["path"]
    for label, value in (
        ("screenshotPath", report.get("screenshotPath")),
        ("screenshot.path", nested.get("path") if isinstance(nested, dict) else None),
    ):
        normalized = value.replace("\\", "/") if isinstance(value, str) else ""
        if not (
            normalized == relative_image
            or normalized.endswith("/" + relative_image)
        ):
            mismatches.append(label)
    if expected_mode == "moving":
        input_report = report.get("input")
        if (
            report.get("playerCellChanged") is not True
            or not isinstance(input_report, dict)
            or input_report.get("delivery") != "Input.parse_input_event"
            or input_report.get("eventClass") != "InputEventMouseButton"
            or input_report.get("frameSeparated") is not True
        ):
            mismatches.append("moving input")
    elif report.get("playerCellChanged") is not False:
        mismatches.append("idle playerCellChanged")
    if mismatches:
        raise ActionEvidenceError(
            f"动作 capture 合同失败 {map_id}/{action_kind}: "
            + ", ".join(mismatches)
        )
    return image_ref, report_ref


def _raw_evidence_refs(
    bundle_root: Path,
    action: dict[str, Any],
    *,
    action_id: str,
) -> list[dict[str, str]]:
    evidence = action.get("evidence")
    if not isinstance(evidence, list):
        raise ActionEvidenceError(f"{action_id}.evidence 必须是数组")
    raw_refs = [
        value
        for value in evidence
        if isinstance(value, dict)
        and isinstance(value.get("path"), str)
        and value["path"].startswith("evidence/computer-use-actions/raw/")
    ]
    if len(raw_refs) != 2:
        raise ActionEvidenceError(f"{action_id} 必须保留恰好两张 Computer Use 原图")
    for index, ref in enumerate(raw_refs):
        path = _validate_file_ref(
            bundle_root,
            ref,
            label=f"{action_id}.raw[{index}]",
        )
        if path.suffix.lower() not in {".jpg", ".jpeg"}:
            raise ActionEvidenceError(f"{action_id}.raw[{index}] 必须是 JPEG")
    if raw_refs[0]["sha256"] == raw_refs[1]["sha256"]:
        raise ActionEvidenceError(f"{action_id} 的 Computer Use 前后原图完全相同")
    return raw_refs


def _write_atomic(path: Path, payload: bytes) -> None:
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    if temporary.exists():
        raise ActionEvidenceError(f"临时输出已存在：{temporary}")
    temporary.write_bytes(payload)
    temporary.replace(path)


def refresh_bundle(
    bundle_root: Path,
    *,
    bundle_id: str,
    config: BundleConfig,
    generated_at_utc: str,
    apply: bool,
) -> dict[str, Any]:
    if ISO_UTC.fullmatch(generated_at_utc) is None:
        raise ActionEvidenceError("--generated-at-utc 必须是 YYYY-MM-DDTHH:MM:SSZ")
    manifest_path = bundle_root / "map-visual-bundle.json"
    report_path = bundle_root / "evidence" / "computer-use-review.json"
    manifest = _load_json(manifest_path, label="map visual manifest")
    report = _load_json(report_path, label="Computer Use review")
    lifecycle = {key: manifest.get(key) for key in EXPECTED_LIFECYCLE}
    if lifecycle != EXPECTED_LIFECYCLE:
        raise ActionEvidenceError(f"拒绝刷新非 pending lifecycle：{lifecycle}")
    if manifest.get("bundleId") != bundle_id or report.get("bundleId") != bundle_id:
        raise ActionEvidenceError("manifest/report bundleId 不一致")
    if report.get("method") != "computer_use" or report.get("scene") != SCENE:
        raise ActionEvidenceError("既有报告不是正式 Computer Use Main 报告")
    if set(report.get("testedMapIds", [])) != set(config.map_ids):
        raise ActionEvidenceError("既有报告 testedMapIds 不完整")
    actions = report.get("actions")
    if not isinstance(actions, list):
        raise ActionEvidenceError("Computer Use actions 必须是数组")
    expected_keys = {
        (map_id, action_kind)
        for map_id in config.map_ids
        for action_kind in ACTION_KINDS
    }
    actual_keys: set[tuple[str, str]] = set()
    refreshed_actions: list[dict[str, Any]] = []
    runtime_screenshots: list[dict[str, Any]] = []
    image_refs_by_key: dict[tuple[str, str], dict[str, Any]] = {}
    hashes_by_map = {map_id: set() for map_id in config.map_ids}
    for action in actions:
        if not isinstance(action, dict):
            raise ActionEvidenceError("Computer Use action 必须是对象")
        map_id = action.get("mapId")
        action_kind = action.get("actionKind")
        key = (map_id, action_kind)
        if key not in expected_keys or key in actual_keys:
            raise ActionEvidenceError(f"动作覆盖重复或越界：{key!r}")
        actual_keys.add(key)
        action_id = str(action.get("actionId", ""))
        if action_id != f"{map_id}_{action_kind}" or action.get("result") != "PASS":
            raise ActionEvidenceError(f"动作 ID/result 不符合合同：{key!r}")
        if not isinstance(action.get("description"), str) or not action["description"].strip():
            raise ActionEvidenceError(f"动作缺少描述：{key!r}")
        receipt = action.get("actionReceipt")
        receipt_path = _validate_file_ref(
            bundle_root,
            receipt,
            label=f"{action_id}.actionReceipt",
        )
        if receipt_path.suffix.lower() not in {".jsonl", ".log", ".txt"}:
            raise ActionEvidenceError(f"{action_id}.actionReceipt 扩展名不安全")
        raw_refs = _raw_evidence_refs(bundle_root, action, action_id=action_id)
        image_ref, capture_ref = _validate_capture_pair(
            bundle_root,
            bundle_id=bundle_id,
            map_id=str(map_id),
            action_kind=str(action_kind),
        )
        if image_ref["sha256"] in hashes_by_map[str(map_id)]:
            raise ActionEvidenceError(
                f"同一地图动作复用了截图像素：{map_id}/{action_kind}"
            )
        hashes_by_map[str(map_id)].add(image_ref["sha256"])
        image_refs_by_key[(str(map_id), str(action_kind))] = image_ref
        refreshed = dict(action)
        refreshed["evidence"] = [
            {"path": image_ref["path"], "sha256": image_ref["sha256"]},
            capture_ref,
            *raw_refs,
        ]
        refreshed_actions.append(refreshed)
        runtime_screenshots.append({
            "mapId": map_id,
            "mode": ACTION_MODES[str(action_kind)],
            "image": image_ref,
            "captureReport": capture_ref,
        })
    if actual_keys != expected_keys:
        raise ActionEvidenceError(
            f"动作覆盖不完整：missing={sorted(expected_keys - actual_keys)!r}"
        )

    refreshed_report = dict(report)
    refreshed_report["generatedAtUtc"] = generated_at_utc
    refreshed_report["actions"] = refreshed_actions
    report_payload = _json_bytes(refreshed_report)
    evidence = manifest.get("evidence")
    if not isinstance(evidence, dict):
        raise ActionEvidenceError("manifest.evidence 必须是对象")
    refreshed_evidence = dict(evidence)
    refreshed_evidence["dressedReference"] = image_refs_by_key[
        config.dressed_action
    ]
    refreshed_evidence["layeredPreview"] = image_refs_by_key[
        config.layered_action
    ]
    refreshed_evidence["runtimeScreenshots"] = runtime_screenshots
    refreshed_evidence["computerUseReport"] = {
        "path": "evidence/computer-use-review.json",
        "sha256": hashlib.sha256(report_payload).hexdigest(),
    }
    refreshed_manifest = dict(manifest)
    refreshed_manifest["evidence"] = refreshed_evidence
    if {key: refreshed_manifest.get(key) for key in EXPECTED_LIFECYCLE} != EXPECTED_LIFECYCLE:
        raise ActionEvidenceError("刷新过程意外改变 lifecycle")
    manifest_payload = _json_bytes(refreshed_manifest)
    result = {
        "bundleId": bundle_id,
        "mapCount": len(config.map_ids),
        "actionCount": len(refreshed_actions),
        "uniqueScreenshotCount": sum(len(value) for value in hashes_by_map.values()),
        "lifecycle": lifecycle,
        "applied": apply,
    }
    if apply:
        _write_atomic(report_path, report_payload)
        _write_atomic(manifest_path, manifest_payload)
    return result


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bundle-id", required=True, choices=tuple(BUNDLE_CONFIGS))
    parser.add_argument("--generated-at-utc", required=True)
    parser.add_argument("--apply", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = _parse_args()
    bundle_id = str(args.bundle_id)
    try:
        result = refresh_bundle(
            MAPS_ROOT / bundle_id,
            bundle_id=bundle_id,
            config=BUNDLE_CONFIGS[bundle_id],
            generated_at_utc=str(args.generated_at_utc),
            apply=bool(args.apply),
        )
    except (ActionEvidenceError, OSError, ValueError) as error:
        print(f"map action evidence refresh failed: {error}", file=sys.stderr)
        return 1
    print("map action evidence refresh: PASS " + json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
