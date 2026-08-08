#!/usr/bin/env python3
"""Freeze Phase399 real-Main map idle, movement and panel-stress evidence.

The runner uses the normal ``Main.tscn`` entry at 1280x720.  Its dedicated QA
flag drives real left-button events across frames for world movement and twelve
open/world/region/local/close cycles.  It does not start a backend, enable
profile saving, write a movie, or use a SceneTree test bypass.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import statistics
import subprocess
import sys
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Sequence


REPO_ROOT = Path(__file__).resolve().parents[1]
GODOT_PROJECT = REPO_ROOT / "client" / "godot"
MAIN_SCENE = "res://scenes/Main.tscn"
MAIN_SCRIPT_PATH = GODOT_PROJECT / "scripts" / "main.gd"
CAPTURE_SCRIPT_PATH = (
    GODOT_PROJECT
    / "scripts"
    / "qa"
    / "map_awakened_owner_review_capture.gd"
)
PERF_CAPTURE_FLAG = "--map-awakened-owner-review-perf"
DEFAULT_OUTPUT_ROOT = Path(".run/evidence/phase399_map_awakened_perf")
SAFE_RUN_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")
START_MARKER = "PHASE399_MAP_PERF_START"
STATE_MARKER = "PHASE399_MAP_PERF_STATE"
END_MARKER = "PHASE399_MAP_PERF_END"
FAILURE_MARKERS = (
    "PHASE399_MAP_PERF_FAILED",
    "PHASE399_MAP_OWNER_REVIEW_FAILED",
)
EXPECTED_STATES = ("idle", "moving", "panel_stress")
EXPECTED_STRESS_CYCLES = 12
EXPECTED_PANEL_CLICKS = EXPECTED_STRESS_CYCLES * 5
MIN_STATE_SAMPLES = 5
# The normal Main path intentionally idles near 30 FPS, including a static
# open panel; continuous world movement raises the cadence toward 60 FPS.
MIN_STABLE_FPS_BY_STATE = {
    "idle": 28.0,
    "moving": 45.0,
    "panel_stress": 28.0,
}
IDLE_MEDIAN_PROCESS_TOTAL_MS = 5.0
IDLE_P95_PROCESS_TOTAL_MS = 15.0
ACTIVE_MEDIAN_PROCESS_TOTAL_MS = 10.0
ACTIVE_P95_PROCESS_TOTAL_MS = 30.0
REPORT_SCHEMA_VERSION = 1
REPORT_TYPE = "beastbound_phase399_map_real_main_performance"


class Phase399MapPerfError(RuntimeError):
    """The real-Main map performance evidence contract failed."""


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _new_run_id() -> str:
    timestamp = _utc_now().strftime("%Y%m%dT%H%M%S.%fZ")
    return f"phase399-map-perf-{timestamp}-{uuid.uuid4().hex[:8]}"


def _build_godot_command(
    *,
    godot: str,
    user_data_dir: Path,
    extra_args: Sequence[str] = (),
) -> list[str]:
    if extra_args:
        raise Phase399MapPerfError(
            "Phase399地图性能验收不接受附加Godot参数，避免联网或旁路"
        )
    return [
        godot,
        "--path",
        str(GODOT_PROJECT),
        "--user-data-dir",
        str(user_data_dir),
        "--scene",
        MAIN_SCENE,
        "--windowed",
        "--resolution",
        "1280x720",
        "--single-window",
        "--",
        "--qa-viewport=1280x720",
        "--perf-probe",
        PERF_CAPTURE_FLAG,
    ]


def _require_perf_wiring() -> None:
    try:
        main_source = MAIN_SCRIPT_PATH.read_text(encoding="utf-8")
        capture_source = CAPTURE_SCRIPT_PATH.read_text(encoding="utf-8")
    except OSError as error:
        raise Phase399MapPerfError(
            "无法读取Phase399真实Main性能验收源码"
        ) from error
    main_fragments = (
        CAPTURE_SCRIPT_PATH.name,
        "MapAwakenedOwnerReviewCapture.is_flag",
        "_run_map_awakened_owner_review_capture",
    )
    capture_fragments = (
        f'const PERF_CAPTURE_FLAG := "{PERF_CAPTURE_FLAG}"',
        "func _run_perf_capture()",
        '"world_tab_button"',
        '"world_region_button"',
        '"local_tab_button"',
        "Input.parse_input_event(press)",
        "await host.get_tree().process_frame",
        "prepared_visual=true expected_regions=9",
    )
    if any(fragment not in main_source for fragment in main_fragments):
        raise Phase399MapPerfError(
            "Phase399地图性能验收未通过最小Main flag wiring接入"
        )
    if any(fragment not in capture_source for fragment in capture_fragments):
        raise Phase399MapPerfError(
            "Phase399地图性能脚本缺少真实跨帧左键或稳定地图getter"
        )


def _parse_number(line: str, key: str) -> float:
    match = re.search(rf"\b{re.escape(key)}=([-+0-9.]+)", line)
    if match is None:
        return math.nan
    try:
        return float(match.group(1))
    except ValueError:
        return math.nan


def _parse_fields(line: str) -> dict[str, str]:
    return {
        match.group(1): match.group(2)
        for match in re.finditer(r"\b([A-Za-z][A-Za-z0-9_]*)=([^\s]+)", line)
    }


def _percentile(values: Sequence[float], ratio: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(float(value) for value in values)
    index = min(
        len(ordered) - 1,
        max(0, math.ceil(len(ordered) * ratio) - 1),
    )
    return ordered[index]


def _state_stats(samples: Sequence[dict[str, float]]) -> dict[str, Any]:
    stable_start = len(samples) // 2 if len(samples) >= 4 else 0
    stable = list(samples[stable_start:])
    fps = [float(sample["fps"]) for sample in stable]
    process_total = [float(sample["processTotalMs"]) for sample in stable]
    return {
        "sampleCount": len(samples),
        "stableSampleCount": len(stable),
        "stableWindow": "latter_half",
        "fps": {
            "minimum": min(fps) if fps else 0.0,
            "median": statistics.median(fps) if fps else 0.0,
            "maximum": max(fps) if fps else 0.0,
        },
        "processTotalMs": {
            "minimum": min(process_total) if process_total else 0.0,
            "median": statistics.median(process_total) if process_total else 0.0,
            "p95": _percentile(process_total, 0.95),
            "maximum": max(process_total) if process_total else 0.0,
        },
        "samples": [dict(sample) for sample in samples],
    }


def _require_bool(fields: dict[str, str], key: str, expected: bool) -> None:
    actual = fields.get(key, "").lower()
    expected_text = "true" if expected else "false"
    if actual != expected_text:
        raise Phase399MapPerfError(
            f"Phase399性能结束标记字段{key}必须为{expected_text}"
        )


def _require_int(fields: dict[str, str], key: str) -> int:
    try:
        return int(fields[key])
    except (KeyError, ValueError) as error:
        raise Phase399MapPerfError(
            f"Phase399性能结束标记缺少整数字段{key}"
        ) from error


def _validate_godot_log(path: Path) -> dict[str, Any]:
    text = path.read_text(encoding="utf-8")
    if any(marker in text for marker in FAILURE_MARKERS):
        raise Phase399MapPerfError("Godot Phase399地图性能脚本报告失败")
    for forbidden in (
        "entry=SceneTreeScript",
        "extends SceneTree",
        "SCRIPT ERROR",
        "Parse Error",
        "WARNING:",
        "ERROR:",
        "ObjectDB instances were leaked at exit",
        "resources still in use at exit",
    ):
        if forbidden in text:
            raise Phase399MapPerfError(
                f"Godot Phase399地图性能日志包含禁止内容：{forbidden}"
            )
    if "Metal 4.0 - Forward Mobile" not in text:
        raise Phase399MapPerfError(
            "Phase399地图性能验收没有使用真实Metal Forward Mobile"
        )
    required_start = (
        f"{START_MARKER} scene=Main.tscn entry=MainSceneFlag "
        "viewport=1280x720 renderer=Metal profile=isolated "
        "backend_started=false profile_save=false"
    )
    if required_start not in text:
        raise Phase399MapPerfError("Phase399地图性能日志缺少真实Main隔离起点")

    state_samples: dict[str, list[dict[str, float]]] = {
        state: [] for state in EXPECTED_STATES
    }
    state_events: list[str] = []
    active_state = ""
    end_line = ""
    state_pattern = re.compile(
        rf"^{STATE_MARKER}\s+state="
        r"(idle|moving|panel_stress)_(begin|end)(?:\s.*)?$"
    )
    for raw_line in text.splitlines():
        line = raw_line.strip()
        state_match = state_pattern.match(line)
        if state_match is not None:
            state = state_match.group(1)
            boundary = state_match.group(2)
            state_events.append(f"{state}_{boundary}")
            if boundary == "begin":
                if active_state:
                    raise Phase399MapPerfError(
                        "Phase399性能状态窗口发生嵌套"
                    )
                active_state = state
            else:
                if active_state != state:
                    raise Phase399MapPerfError(
                        "Phase399性能状态窗口结束顺序错误"
                    )
                active_state = ""
            continue
        if line.startswith("perf probe:") and active_state:
            fps = _parse_number(line, "fps")
            process_total = _parse_number(line, "process_total")
            if not math.isfinite(fps) or not math.isfinite(process_total):
                raise Phase399MapPerfError(
                    f"Phase399 {active_state}性能样本无法解析"
                )
            state_samples[active_state].append(
                {"fps": fps, "processTotalMs": process_total}
            )
        if line.startswith(END_MARKER + " "):
            end_line = line
    expected_events = [
        f"{state}_{boundary}"
        for state in EXPECTED_STATES
        for boundary in ("begin", "end")
    ]
    if state_events != expected_events or active_state:
        raise Phase399MapPerfError(
            "Phase399性能状态必须按idle→moving→panel_stress完整闭合"
        )
    if not end_line:
        raise Phase399MapPerfError("Phase399地图性能日志缺少结束标记")

    fields = _parse_fields(end_line)
    if fields.get("status") != "passed":
        raise Phase399MapPerfError("Phase399地图性能结束状态不是passed")
    if fields.get("scene") != "Main.tscn" or fields.get("entry") != "MainSceneFlag":
        raise Phase399MapPerfError("Phase399地图性能结束标记不是Main场景入口")
    if fields.get("viewport") != "1280x720":
        raise Phase399MapPerfError("Phase399地图性能结束视口不是1280x720")
    for key in (
        "idle",
        "moving",
        "panel_stress",
        "prepared_visual",
        "hud_restored",
        "end_http_disconnected",
    ):
        _require_bool(fields, key, True)
    for key in (
        "backend_started",
        "profile_save",
    ):
        _require_bool(fields, key, False)
    cycles = _require_int(fields, "cycles")
    moving_clicks = _require_int(fields, "moving_clicks")
    moving_accepted = _require_int(fields, "moving_accepted")
    panel_clicks = _require_int(fields, "panel_clicks")
    regions = _require_int(fields, "regions")
    ui_world_leaks = _require_int(fields, "ui_world_leaks")
    actual_clicks = _require_int(fields, "actual_left_clicks")
    cross_frame = _require_int(fields, "cross_frame_presses")
    moved_distance = _parse_number(end_line, "moved_distance")
    if (
        cycles != EXPECTED_STRESS_CYCLES
        or panel_clicks != EXPECTED_PANEL_CLICKS
        or moving_clicks < 3
        or moving_accepted != moving_clicks
        or not math.isfinite(moved_distance)
        or moved_distance <= 64.0
        or regions != 9
        or ui_world_leaks != 0
        or actual_clicks != moving_clicks + panel_clicks
        or cross_frame != actual_clicks
    ):
        raise Phase399MapPerfError(
            "Phase399真实移动／面板压力／跨帧左键结束事实不完整"
        )

    stats = {
        state: _state_stats(state_samples[state]) for state in EXPECTED_STATES
    }
    gates: list[dict[str, Any]] = []
    for state in EXPECTED_STATES:
        state_stats = stats[state]
        process_stats = state_stats["processTotalMs"]
        median_limit = (
            IDLE_MEDIAN_PROCESS_TOTAL_MS
            if state == "idle"
            else ACTIVE_MEDIAN_PROCESS_TOTAL_MS
        )
        p95_limit = (
            IDLE_P95_PROCESS_TOTAL_MS
            if state == "idle"
            else ACTIVE_P95_PROCESS_TOTAL_MS
        )
        state_gates = (
            (
                "sample_count",
                int(state_stats["sampleCount"]),
                ">=",
                MIN_STATE_SAMPLES,
                int(state_stats["sampleCount"]) >= MIN_STATE_SAMPLES,
            ),
            (
                "stable_fps_median",
                float(state_stats["fps"]["median"]),
                ">=",
                MIN_STABLE_FPS_BY_STATE[state],
                float(state_stats["fps"]["median"])
                >= MIN_STABLE_FPS_BY_STATE[state],
            ),
            (
                "process_total_median_ms",
                float(process_stats["median"]),
                "<=",
                median_limit,
                float(process_stats["median"]) <= median_limit,
            ),
            (
                "process_total_p95_ms",
                float(process_stats["p95"]),
                "<=",
                p95_limit,
                float(process_stats["p95"]) <= p95_limit,
            ),
        )
        for metric, actual, operator, limit, passed in state_gates:
            gates.append(
                {
                    "state": state,
                    "metric": metric,
                    "actual": actual,
                    "operator": operator,
                    "limit": limit,
                    "passed": passed,
                }
            )
    failed_gates = [gate for gate in gates if not gate["passed"]]
    if failed_gates:
        raise Phase399MapPerfError(
            "Phase399地图性能门禁失败："
            + ", ".join(
                f"{gate['state']}.{gate['metric']}={gate['actual']}"
                for gate in failed_gates
            )
        )
    return {
        "states": stats,
        "gates": gates,
        "interaction": {
            "stressCycles": cycles,
            "movingClicks": moving_clicks,
            "movingAccepted": moving_accepted,
            "movedDistance": moved_distance,
            "panelClicks": panel_clicks,
            "actualLeftClicks": actual_clicks,
            "crossFramePresses": cross_frame,
            "uiWorldLeaks": ui_world_leaks,
            "preparedVisual": True,
            "worldRegionCount": regions,
            "hudRestored": True,
        },
        "endLine": end_line,
    }


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _write_manifest(run_dir: Path, paths: Sequence[Path]) -> Path:
    manifest = run_dir / "SHA256SUMS"
    lines = [
        f"{_sha256(path)}  {path.relative_to(run_dir).as_posix()}"
        for path in paths
    ]
    manifest.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return manifest


def _run(
    *,
    godot: str,
    output_root: Path,
    run_id: str,
    timeout_seconds: float,
) -> dict[str, Any]:
    if not SAFE_RUN_ID.fullmatch(run_id):
        raise Phase399MapPerfError("run-id包含不安全字符")
    run_dir = output_root / run_id
    if run_dir.exists():
        raise Phase399MapPerfError(f"拒绝覆盖既有性能证据目录：{run_dir}")
    run_dir.mkdir(parents=True)
    log_path = run_dir / "godot-perf.log"
    started_at = _utc_now()
    command: list[str] = []
    try:
        _require_perf_wiring()
        with tempfile.TemporaryDirectory(
            prefix="beastbound-phase399-map-perf-"
        ) as user_data_raw:
            command = _build_godot_command(
                godot=godot,
                user_data_dir=Path(user_data_raw),
            )
            completed = subprocess.run(
                command,
                cwd=REPO_ROOT,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                check=False,
                timeout=timeout_seconds,
            )
        log_path.write_text(completed.stdout, encoding="utf-8")
        if completed.returncode != 0:
            raise Phase399MapPerfError(
                f"Godot Phase399地图性能进程退出码为{completed.returncode}"
            )
        validation = _validate_godot_log(log_path)
        summary = {
            "schemaVersion": REPORT_SCHEMA_VERSION,
            "reportType": REPORT_TYPE,
            "status": "passed",
            "ownerReviewStatus": "pending",
            "startedAtUtc": started_at.isoformat().replace("+00:00", "Z"),
            "completedAtUtc": _utc_now().isoformat().replace("+00:00", "Z"),
            "scene": MAIN_SCENE,
            "entryMode": "MainSceneFlag",
            "viewport": {"width": 1280, "height": 720},
            "renderer": "Metal 4.0 - Forward Mobile",
            "command": command,
            "states": validation["states"],
            "gates": validation["gates"],
            "interaction": validation["interaction"],
            "isolation": {
                "freshUserData": True,
                "backendStarted": False,
                "profileSaveEnabled": False,
                "endHttpDisconnected": True,
                "statementBoundary": (
                    "Configuration and end-state declaration only; no request "
                    "counter or server-write measurement was installed."
                ),
            },
            "artifacts": {"log": log_path.name},
        }
        summary_path = run_dir / "summary.json"
        summary_path.write_text(
            json.dumps(summary, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        manifest_path = _write_manifest(run_dir, (log_path, summary_path))
        return {
            "status": "passed",
            "runDir": str(run_dir),
            "summary": str(summary_path),
            "log": str(log_path),
            "manifest": str(manifest_path),
            "manifestSha256": _sha256(manifest_path),
            "states": validation["states"],
            "interaction": validation["interaction"],
        }
    except (
        OSError,
        Phase399MapPerfError,
        subprocess.SubprocessError,
    ) as error:
        failure_path = run_dir / "failure-summary.json"
        failure_path.write_text(
            json.dumps(
                {
                    "schemaVersion": REPORT_SCHEMA_VERSION,
                    "reportType": REPORT_TYPE,
                    "status": "failed",
                    "error": str(error),
                    "command": command,
                },
                ensure_ascii=False,
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
        raise


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--godot", default="godot")
    parser.add_argument("--output-root", default=str(DEFAULT_OUTPUT_ROOT))
    parser.add_argument("--run-id", default=_new_run_id())
    parser.add_argument("--timeout-seconds", type=float, default=120.0)
    args = parser.parse_args(argv)
    output_root = Path(args.output_root)
    if not output_root.is_absolute():
        output_root = REPO_ROOT / output_root
    try:
        result = _run(
            godot=args.godot,
            output_root=output_root,
            run_id=args.run_id,
            timeout_seconds=max(30.0, args.timeout_seconds),
        )
    except (
        OSError,
        Phase399MapPerfError,
        subprocess.SubprocessError,
    ) as error:
        print(
            json.dumps(
                {"status": "failed", "error": str(error)},
                ensure_ascii=False,
                indent=2,
            ),
            file=sys.stderr,
        )
        return 1
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
