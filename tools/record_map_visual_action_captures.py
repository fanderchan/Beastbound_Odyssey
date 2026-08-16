#!/usr/bin/env python3
"""Freeze one real-Main capture pair for every formal map-review action.

Computer Use receipts prove the operator action.  This companion recorder
creates the distinct 1280x720 PNG/capture-report pair that the map bundle
contract requires for pointer, movement, warp, collision and occlusion on every
map.  It deliberately reuses the existing closed MapVisualReviewCapture and
official owner-attested QA user-data lane; it never accepts login, server or
arbitrary Godot arguments.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import math
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
RECORDER_PATH = REPO_ROOT / "tools" / "record_firebud_v2_owner_review.py"
RECORDER_SPEC = importlib.util.spec_from_file_location(
    "_beastbound_map_action_capture_core", RECORDER_PATH
)
if RECORDER_SPEC is None or RECORDER_SPEC.loader is None:
    raise RuntimeError(f"无法加载地图 Main 取证核心：{RECORDER_PATH}")
RECORDER = importlib.util.module_from_spec(RECORDER_SPEC)
RECORDER_SPEC.loader.exec_module(RECORDER)
CORE = RECORDER.CORE

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
DEFAULT_RUN_ROOT = Path(".run/evidence/map_visual_action_captures")


class MapActionCaptureError(RuntimeError):
    """The closed formal action-capture contract failed."""


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace(
        "+00:00", "Z"
    )


def _default_run_id() -> str:
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")
    return f"map-actions-{timestamp}-{uuid.uuid4().hex[:8]}"


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--bundle-id",
        required=True,
        choices=tuple(sorted(RECORDER.RECORDER_CONFIGS)),
    )
    parser.add_argument("--godot", default="godot")
    parser.add_argument("--timeout-seconds", type=float, default=90.0)
    parser.add_argument("--run-id", default="")
    parser.add_argument(
        "--resume",
        action="store_true",
        help=(
            "只续跑同一 runId 中缺失的动作；完整 PASS 对保持 immutable，"
            "仅允许归档没有截图的明确 FAIL 报告"
        ),
    )
    return parser.parse_args()


def _portable(path: Path) -> str:
    try:
        return path.resolve().relative_to(REPO_ROOT).as_posix()
    except ValueError:
        return str(path.resolve())


def _read_json_object(path: Path, *, label: str) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise MapActionCaptureError(f"{label} 无法解析：{_portable(path)}") from error
    if not isinstance(value, dict):
        raise MapActionCaptureError(f"{label} 根节点必须是对象：{_portable(path)}")
    return value


def _target_state(
    screenshot: Path,
    report: Path,
    *,
    resume: bool,
) -> str:
    screenshot_exists = screenshot.is_file()
    report_exists = report.is_file()
    if screenshot_exists and report_exists:
        if not resume:
            raise MapActionCaptureError(
                "拒绝覆盖已有正式动作取证："
                f"{_portable(screenshot)} / {_portable(report)}"
            )
        return "reuse"
    if not screenshot_exists and not report_exists:
        return "record"
    if not resume:
        raise MapActionCaptureError(
            "拒绝覆盖不完整的正式动作取证："
            f"{_portable(screenshot)} / {_portable(report)}"
        )
    if screenshot_exists:
        raise MapActionCaptureError(
            "续跑拒绝处理没有 capture 报告的孤立截图："
            f"{_portable(screenshot)}"
        )
    failed = _read_json_object(report, label="孤立 capture 报告")
    errors = failed.get("errors")
    if (
        failed.get("result") != "FAIL"
        or failed.get("ok") is not False
        or not isinstance(errors, list)
        or not errors
        or failed.get("screenshotPath") not in ("", None)
        or failed.get("screenshot") not in ({}, None)
    ):
        raise MapActionCaptureError(
            "续跑只允许归档没有截图的明确 FAIL 报告："
            f"{_portable(report)}"
        )
    return "archive_failed_report"


def _next_archive_path(action_root: Path) -> Path:
    for index in range(1, 100):
        candidate = action_root / f"failed-capture-report-{index:02d}.json"
        if not candidate.exists():
            return candidate
    raise MapActionCaptureError(
        f"失败报告归档槽位已耗尽：{_portable(action_root)}"
    )


def _archive_failed_report(report: Path, action_root: Path) -> Path:
    action_root.mkdir(parents=True, exist_ok=True)
    destination = _next_archive_path(action_root)
    report.replace(destination)
    return destination


def _next_action_run(action_root: Path) -> Path:
    if not action_root.exists():
        action_root.mkdir(parents=True, exist_ok=False)
        return action_root
    for index in range(1, 100):
        candidate = action_root / f"resume-{index:02d}"
        if not candidate.exists():
            candidate.mkdir(parents=False, exist_ok=False)
            return candidate
    raise MapActionCaptureError(
        f"动作续跑槽位已耗尽：{_portable(action_root)}"
    )


def _capture_pair(
    screenshot: Path,
    report: Path,
    *,
    map_id: str,
    action_kind: str,
    mode: str,
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    capture = RECORDER._read_capture_report(
        report,
        map_id=map_id,
        mode=mode,
        capture_variant=action_kind,
    )
    screenshot_artifact = CORE._artifact_record(screenshot)
    report_artifact = CORE._artifact_record(report)
    screenshot_hash = str(screenshot_artifact.get("sha256", ""))
    screenshot_record = capture.get("screenshot")
    if (
        capture.get("screenshotSha256") != screenshot_hash
        or not isinstance(screenshot_record, dict)
        or screenshot_record.get("sha256") != screenshot_hash
        or screenshot_record.get("width") != 1280
        or screenshot_record.get("height") != 720
    ):
        raise MapActionCaptureError(
            "动作截图与 capture 报告哈希/尺寸不一致："
            f"{map_id}/{action_kind}"
        )
    return capture, screenshot_artifact, report_artifact


def _find_successful_action_run(action_root: Path) -> Path:
    candidates = sorted(
        (path for path in action_root.glob("resume-*") if path.is_dir()),
        reverse=True,
    )
    candidates.append(action_root)
    for candidate in candidates:
        log_path = candidate / "godot.log"
        lifecycle_path = candidate / "qa-lane-lifecycle.json"
        if not log_path.is_file() or not lifecycle_path.is_file():
            continue
        try:
            RECORDER._validate_godot_log(log_path, movie_mode=False)
            lifecycle = _read_json_object(
                lifecycle_path,
                label="QA lane lifecycle",
            )
        except (MapActionCaptureError, RECORDER.FirebudV2RecordingError):
            continue
        native = lifecycle.get("phases", {}).get("native", {})
        if (
            isinstance(native, dict)
            and isinstance(native.get("attestation"), dict)
            and lifecycle.get("cleanup", {}).get("status") == "cleaned"
            and lifecycle.get("postCleanupInspect", {}).get("status") == "inspected"
        ):
            return candidate
    raise MapActionCaptureError(
        f"找不到与既有 PASS 动作对应的完整 QA lane：{_portable(action_root)}"
    )


def _qa_lane_record(action_run: Path) -> dict[str, Any]:
    lifecycle_path = action_run / "qa-lane-lifecycle.json"
    lifecycle = _read_json_object(lifecycle_path, label="QA lane lifecycle")
    phases = lifecycle.get("phases", {})
    native = phases.get("native", {}) if isinstance(phases, dict) else {}
    return {
        "sourceCheck": lifecycle.get("sourceCheck", {}),
        "nativeAttestation": (
            native.get("attestation", {}) if isinstance(native, dict) else {}
        ),
        "cleanup": lifecycle.get("cleanup", {}),
        "postCleanupInspect": lifecycle.get("postCleanupInspect", {}),
        "lifecycle": CORE._artifact_record(lifecycle_path),
    }


def _record_entry(
    *,
    map_id: str,
    action_kind: str,
    mode: str,
    screenshot: Path,
    report: Path,
    action_run: Path,
    resumed: bool,
    archived_failed_report: Path | None = None,
) -> dict[str, Any]:
    capture, screenshot_artifact, report_artifact = _capture_pair(
        screenshot,
        report,
        map_id=map_id,
        action_kind=action_kind,
        mode=mode,
    )
    record: dict[str, Any] = {
        "mapId": map_id,
        "actionKind": action_kind,
        "mode": mode,
        "captureVariant": action_kind,
        "resumed": resumed,
        "screenshot": screenshot_artifact,
        "captureReport": report_artifact,
        "captureResult": capture.get("result"),
        "qaLane": _qa_lane_record(action_run),
        "godotLog": CORE._artifact_record(action_run / "godot.log"),
    }
    if archived_failed_report is not None:
        record["archivedFailedCaptureReport"] = CORE._artifact_record(
            archived_failed_report
        )
    return record


def _record(args: argparse.Namespace) -> Path:
    timeout_seconds = float(args.timeout_seconds)
    if not math.isfinite(timeout_seconds) or timeout_seconds <= 0:
        raise MapActionCaptureError("--timeout-seconds 必须大于 0")
    run_id = str(args.run_id).strip() or _default_run_id()
    if not RECORDER.SAFE_RUN_ID.fullmatch(run_id):
        raise MapActionCaptureError("--run-id 含不安全字符")

    RECORDER._activate_bundle(str(args.bundle_id))
    godot = CORE._require_executable(str(args.godot), label="Godot")
    run_root = (REPO_ROOT / DEFAULT_RUN_ROOT / args.bundle_id / run_id).resolve()
    resume = bool(args.resume)
    if resume:
        if not run_root.is_dir():
            raise MapActionCaptureError(
                f"--resume 要求既有 runId：{_portable(run_root)}"
            )
        if (run_root / "capture-matrix.json").exists():
            raise MapActionCaptureError("已完成的 capture matrix 不允许续跑")
        temporary_dir = run_root / f"tmp-resume-{uuid.uuid4().hex[:8]}"
        temporary_dir.mkdir(parents=False, exist_ok=False)
    else:
        run_root.mkdir(parents=True, exist_ok=False)
        temporary_dir = run_root / "tmp"
        temporary_dir.mkdir(parents=False, exist_ok=False)
    base_environment = CORE._isolated_environment(temporary_dir)

    bundle_root = (
        REPO_ROOT / "client" / "godot" / "assets" / "maps" / args.bundle_id
    )
    if not (bundle_root / "map-visual-bundle.json").is_file():
        raise MapActionCaptureError(f"地图 bundle 不存在：{bundle_root}")
    output_root = bundle_root / "evidence" / "runtime-actions"
    output_root.mkdir(parents=True, exist_ok=True)

    targets: list[tuple[str, str, str, Path, Path, str]] = []
    for map_id in RECORDER.REVIEW_MAPS:
        for action_kind in ACTION_KINDS:
            mode = ACTION_MODES[action_kind]
            map_output = output_root / map_id
            screenshot = map_output / f"{action_kind}.png"
            report = map_output / f"{action_kind}-capture.json"
            target_state = _target_state(screenshot, report, resume=resume)
            targets.append(
                (map_id, action_kind, mode, screenshot, report, target_state)
            )

    records: list[dict[str, Any]] = []
    for map_id, action_kind, mode, screenshot, report, target_state in targets:
        action_root = run_root / map_id / action_kind
        if target_state == "reuse":
            records.append(
                _record_entry(
                    map_id=map_id,
                    action_kind=action_kind,
                    mode=mode,
                    screenshot=screenshot,
                    report=report,
                    action_run=_find_successful_action_run(action_root),
                    resumed=True,
                )
            )
            continue
        archived_failed_report: Path | None = None
        if target_state == "archive_failed_report":
            archived_failed_report = _archive_failed_report(report, action_root)
        screenshot.parent.mkdir(parents=True, exist_ok=True)
        action_run = _next_action_run(action_root)
        log_path = action_run / "godot.log"
        command = RECORDER._build_godot_command(
            godot=godot,
            avi_path=None,
            map_id=map_id,
            mode=mode,
            screenshot_path=screenshot.resolve(),
            report_path=report.resolve(),
            capture_variant=action_kind,
        )
        CORE._run_official_lane_godot_sequence(
            run_dir=action_run,
            godot=godot,
            base_environment=base_environment,
            native_command=command,
            native_log=log_path,
            timeout_seconds=timeout_seconds,
            native_log_validator=lambda path: RECORDER._validate_godot_log(
                path, movie_mode=False
            ),
        )
        records.append(
            _record_entry(
                map_id=map_id,
                action_kind=action_kind,
                mode=mode,
                screenshot=screenshot,
                report=report,
                action_run=action_run,
                resumed=resume,
                archived_failed_report=archived_failed_report,
            )
        )

    summary = {
        "schemaVersion": 1,
        "reportType": "beastbound_map_visual_action_capture_matrix",
        "generatedAtUtc": _utc_now(),
        "result": "PASS",
        "bundleId": args.bundle_id,
        "maps": list(RECORDER.REVIEW_MAPS),
        "actionKinds": list(ACTION_KINDS),
        "captureCount": len(records),
        "resumed": resume,
        "records": records,
    }
    summary_path = run_root / "capture-matrix.json"
    summary_path.write_text(
        json.dumps(summary, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return summary_path


def main() -> int:
    args = _parse_args()
    try:
        summary_path = _record(args)
    except (MapActionCaptureError, RECORDER.FirebudV2RecordingError) as error:
        print(f"map visual action capture failed: {error}", file=sys.stderr)
        return 1
    print(f"map visual action capture: PASS summary={_portable(summary_path)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
