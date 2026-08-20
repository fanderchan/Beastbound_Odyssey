#!/usr/bin/env python3
"""Freeze isolated real-Main performance evidence for Firebud visual v2.

This is deliberately separate from the released-map performance runner.  It
compares the released v1 baseline with the explicit review-only v2 candidate
for the village gate and training ground. Every run uses the owner-attested
``automation`` QA user-data lane, proves the real player directory unchanged,
and cleans the lane before the next matrix cell. It never accepts arbitrary
Godot, login, or server arguments; it never starts Node or accesses MySQL.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import math
import os
import re
import subprocess
import sys
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Sequence


REPO_ROOT = Path(__file__).resolve().parents[1]
CORE_PATH = REPO_ROOT / "tools" / "record_pet_management_owner_review.py"
CORE_SPEC = importlib.util.spec_from_file_location(
    "_beastbound_firebud_v2_performance_core", CORE_PATH
)
if CORE_SPEC is None or CORE_SPEC.loader is None:
    raise RuntimeError(f"无法加载隔离运行核心：{CORE_PATH}")
CORE = importlib.util.module_from_spec(CORE_SPEC)
CORE_SPEC.loader.exec_module(CORE)

GODOT_PROJECT = REPO_ROOT / "client" / "godot"
MAIN_SCENE = "res://scenes/Main.tscn"
DEFAULT_OUTPUT_ROOT = Path(".run/evidence/phase383_firebud_v2_performance")
REPORT_SCHEMA_VERSION = 1
REPORT_TYPE = "beastbound_firebud_v2_real_main_performance"
EXPECTED_WIDTH = 1280
EXPECTED_HEIGHT = 720
EXPECTED_FIXED_FPS = 60
EXPECTED_BUNDLE_ID = "firebud_region_visual_v2"
MAP_IDS = ("firebud_village_gate", "firebud_training_yard")
VARIANTS = ("baseline_v1", "candidate_v2_review")
MODES = ("idle", "moving")
SAFE_RUN_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")
PERF_LINE_RE = re.compile(r"^perf probe: fps=(?P<fps>[0-9.]+) frames=(?P<frames>[0-9]+) (?P<body>.*)$")
METRIC_RE = re.compile(r"\b([a-z0-9_]+)=([0-9.]+)ms\b")
MOVING_LINE_RE = re.compile(r"^movement spam click check ready: (?P<body>.*)$")
MIN_IDLE_PROBE_SAMPLES = 3
MIN_MOVING_PROBE_SAMPLES = 2


class FirebudV2PerformanceError(RuntimeError):
    """A Phase383 v2 performance evidence contract failure."""


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _new_run_id() -> str:
    return "phase383-perf-%s-%s" % (
        datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ"),
        uuid.uuid4().hex[:8],
    )


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _artifact(path: Path) -> dict[str, Any]:
    return CORE._artifact_record(path)


def _build_identity() -> str:
    """Hash the precise runtime surface used by this isolated comparison."""
    required = (
        "project.godot",
        "scenes/Main.tscn",
        "scripts/main.gd",
        "scripts/qa/perf_probe_exit_controller.gd",
        "scripts/qa/runtime_exit_cleanup.gd",
        "scripts/world/map_visual_catalog.gd",
        "scripts/world/map_visual_renderer.gd",
        "scripts/world/world_camera_safe_area_model.gd",
        "scripts/world/world_presentation_profile.gd",
        "scripts/qa/map_visual_runtime_check.gd",
        "data/map_visual_catalog.json",
        "data/map_visual_review_catalog.json",
        "data/firebud_training_map.json",
        "data/firebud_village_gate_map.json",
        "assets/maps/firebud_region_visual_v1/map-visual-bundle.json",
        "assets/maps/firebud_region_visual_v2/map-visual-bundle.json",
    )
    digest = hashlib.sha256(b"beastbound-firebud-v2-perf-surface-v1\0")
    for relative in required:
        path = GODOT_PROJECT / relative
        if not path.is_file():
            raise FirebudV2PerformanceError(f"性能构建输入不存在：{path}")
        digest.update(relative.encode("utf-8"))
        digest.update(b"\0")
        digest.update(bytes.fromhex(_sha256(path)))
        digest.update(b"\0")
    return digest.hexdigest()


def _build_command(*, godot: str, map_id: str, variant: str, mode: str) -> list[str]:
    if map_id not in MAP_IDS:
        raise FirebudV2PerformanceError(f"未知 Firebud 审图地图：{map_id}")
    if variant not in VARIANTS or mode not in MODES:
        raise FirebudV2PerformanceError("variant/mode 不在固定性能矩阵中")
    command = [
        godot,
        "--path", str(GODOT_PROJECT),
        "--scene", MAIN_SCENE,
        "--windowed",
        "--resolution", f"{EXPECTED_WIDTH}x{EXPECTED_HEIGHT}",
        "--single-window",
        "--fixed-fps", str(EXPECTED_FIXED_FPS),
        "--time-scale", "1.0",
        "--disable-vsync",
        "--",
        f"--qa-viewport={EXPECTED_WIDTH}x{EXPECTED_HEIGHT}",
        f"--map-perf-probe-map={map_id}",
    ]
    if variant == "candidate_v2_review":
        command.append(f"--map-art-review-preview={map_id}")
    if mode == "moving":
        command.append("--movement-spam-click-check")
    command.append("--perf-probe")
    command.append(
        "--perf-probe-clean-exit-frames=" + ("480" if mode == "idle" else "2600")
    )
    command.append(CORE.QA_LANE_ARGUMENT)
    if (
        command.count(CORE.QA_LANE_ARGUMENT) != 1
        or "--user-data-dir" in command
    ):
        raise FirebudV2PerformanceError(
            "Firebud 性能命令的 QA lane 边界不精确"
        )
    return command


def _parse_key_values(body: str) -> dict[str, str]:
    return {key: value for part in body.split() if "=" in part for key, value in [part.split("=", 1)]}


def _triplet(values: Sequence[float]) -> list[float]:
    if not values:
        return []
    return [round(min(values), 3), round(sum(values) / len(values), 3), round(max(values), 3)]


def _parse_in_game_probe(*, output: str, mode: str) -> dict[str, Any]:
    samples: list[dict[str, Any]] = []
    moving_summary: dict[str, str] | None = None
    for line in output.splitlines():
        perf = PERF_LINE_RE.match(line)
        if perf is not None:
            metrics = {key: float(value) for key, value in METRIC_RE.findall(perf.group("body"))}
            if "process_total" in metrics:
                samples.append({"fps": float(perf.group("fps")), "frames": int(perf.group("frames")), "metricsMs": metrics})
        moving = MOVING_LINE_RE.match(line)
        if moving is not None:
            moving_summary = _parse_key_values(moving.group("body"))
    minimum_samples = MIN_MOVING_PROBE_SAMPLES if mode == "moving" else MIN_IDLE_PROBE_SAMPLES
    if len(samples) < minimum_samples:
        raise FirebudV2PerformanceError(
            f"{mode} 游戏内 perf probe 少于 {minimum_samples} 份有效样本"
        )
    metric_names = sorted({key for sample in samples for key in sample["metricsMs"]})
    summary = {
        "sampleCount": len(samples),
        "samples": samples,
        "fpsMinMeanMax": _triplet([sample["fps"] for sample in samples]),
        "metricsMsMinMeanMax": {
            metric: _triplet([float(sample["metricsMs"].get(metric, 0.0)) for sample in samples])
            for metric in metric_names
        },
    }
    if mode == "moving":
        if moving_summary is None or moving_summary.get("status") != "ok":
            raise FirebudV2PerformanceError("moving 缺少真实鼠标移动 PASS 摘要")
        required_true = ("moved", "coalesced", "settled", "final_match", "screen_roundtrip")
        if any(moving_summary.get(key) != "true" for key in required_true):
            raise FirebudV2PerformanceError(f"moving 跨帧输入合同失败：{moving_summary}")
        if moving_summary.get("battle") != "false" or moving_summary.get("encounter") != "false":
            raise FirebudV2PerformanceError("moving 性能运行被战斗或遇敌中断")
        summary["realCrossFrameMouseMovement"] = True
        summary["movement"] = moving_summary
    else:
        summary["realCrossFrameMouseMovement"] = False
    return summary


def _ps_snapshot(pid: int) -> dict[str, Any] | None:
    completed = subprocess.run(
        ["ps", "-o", "%cpu=", "-o", "rss=", "-p", str(pid)],
        cwd=REPO_ROOT,
        stdin=subprocess.DEVNULL,
        capture_output=True,
        text=True,
        check=False,
    )
    if completed.returncode != 0:
        return None
    fields = completed.stdout.strip().split()
    if len(fields) < 2:
        return None
    try:
        return {"capturedAtUtc": _utc_now(), "cpuPercent": float(fields[0]), "rssKiB": int(fields[1])}
    except ValueError:
        return None


def _validate_godot_perf_log(path: Path, *, mode: str) -> dict[str, Any]:
    text = path.read_text(encoding="utf-8", errors="replace")
    forbidden = (
        "SCRIPT ERROR:",
        "Parse Error:",
        "ERROR:",
        "WARNING:",
        "ObjectDB instances were leaked",
        "resources still in use at exit",
        "Orphan StringName",
    )
    found = [token for token in forbidden if token in text]
    if found:
        raise FirebudV2PerformanceError(
            "Firebud 性能日志包含错误、警告或泄漏：" + ", ".join(found)
        )
    if "Metal 4.0 - Forward Mobile" not in text:
        raise FirebudV2PerformanceError(
            "Firebud 性能运行没有使用 Metal Forward Mobile"
        )
    clean_exit_prefix = "perf probe clean exit: "
    clean_exit_lines = [
        line for line in text.splitlines() if line.startswith(clean_exit_prefix)
    ]
    if len(clean_exit_lines) != 1:
        raise FirebudV2PerformanceError("Firebud 性能运行缺少唯一 clean-exit 收口摘要")
    try:
        clean_exit = json.loads(clean_exit_lines[0][len(clean_exit_prefix) :])
    except json.JSONDecodeError as error:
        raise FirebudV2PerformanceError("Firebud clean-exit 摘要不是合法 JSON") from error
    if not isinstance(clean_exit, dict) or clean_exit.get("status") != "passed":
        raise FirebudV2PerformanceError(f"Firebud clean-exit 收口失败：{clean_exit!r}")
    output = text[text.find("\n") + 1 :] if text.startswith("$ ") else text
    return {
        "status": "passed",
        "renderer": "Metal 4.0 - Forward Mobile",
        "strictLogGate": "passed",
        "runtimeCleanup": clean_exit,
        "inGamePerfProbe": _parse_in_game_probe(output=output, mode=mode),
    }


def _sampling_runner(
    target_samples: list[dict[str, Any]],
) -> Any:
    def run(
        command: Sequence[str],
        *,
        phase: str,
        log_path: Path,
        timeout_seconds: float,
        environment: dict[str, str],
        dependencies: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        samples: list[dict[str, Any]] = []
        stop_event = threading.Event()
        sampler: threading.Thread | None = None

        def after_spawn(process: Any) -> None:
            nonlocal sampler

            def sample_process() -> None:
                while not stop_event.is_set() and process.poll() is None:
                    snapshot = _ps_snapshot(int(process.pid))
                    if snapshot is not None:
                        samples.append(snapshot)
                    stop_event.wait(0.25)

            sampler = threading.Thread(
                target=sample_process,
                name=f"firebud-perf-{phase}",
                daemon=True,
            )
            sampler.start()

        runner_dependencies = dict(dependencies or {})
        if "after_spawn" in runner_dependencies:
            raise FirebudV2PerformanceError(
                "Firebud 性能采样不允许叠加第二个 after_spawn"
            )
        runner_dependencies["after_spawn"] = after_spawn
        try:
            result = CORE._run_godot_with_settlement(
                command,
                phase=phase,
                log_path=log_path,
                timeout_seconds=timeout_seconds,
                environment=environment,
                dependencies=runner_dependencies,
            )
        finally:
            stop_event.set()
            if sampler is not None:
                sampler.join(timeout=2.0)
        if phase == "native":
            target_samples.extend(samples)
        return result

    return run


def _run_official_segment(
    *,
    command: list[str],
    segment_dir: Path,
    godot: str,
    mode: str,
    timeout_seconds: float,
    base_environment: dict[str, str],
) -> tuple[dict[str, Any], list[dict[str, Any]], dict[str, Any]]:
    log_path = segment_dir / "godot.log"
    lane_dir = segment_dir / "qa-lane"
    lane_dir.mkdir(parents=False, exist_ok=False)
    samples: list[dict[str, Any]] = []
    lane_evidence = CORE._run_official_lane_godot_sequence(
        run_dir=lane_dir,
        godot=godot,
        base_environment=base_environment,
        native_command=command,
        native_log=log_path,
        timeout_seconds=timeout_seconds,
        native_log_validator=lambda path: _validate_godot_perf_log(
            path, mode=mode
        ),
        dependencies={"godot_runner": _sampling_runner(samples)},
    )
    if not samples:
        raise FirebudV2PerformanceError("没有获得运行中 ps CPU/RSS 样本")
    validation = lane_evidence["native"]["logValidation"]
    return validation["inGamePerfProbe"], samples, lane_evidence


def _ps_summary(samples: Sequence[dict[str, Any]]) -> dict[str, Any]:
    return {
        "sampleCount": len(samples),
        "samples": list(samples),
        "cpuPercentMinMeanMax": _triplet([float(sample["cpuPercent"]) for sample in samples]),
        "rssKiBMinMeanMax": _triplet([float(sample["rssKiB"]) for sample in samples]),
    }


def _write_json(path: Path, value: Any) -> None:
    CORE._write_json(path, value)


def _record(args: argparse.Namespace) -> Path:
    if Path.cwd().resolve() != REPO_ROOT:
        raise FirebudV2PerformanceError(f"必须从仓库根执行：cd {REPO_ROOT}")
    run_id = args.run_id or _new_run_id()
    if SAFE_RUN_ID.fullmatch(run_id) is None:
        raise FirebudV2PerformanceError(f"不安全的 runId：{run_id!r}")
    if not math.isfinite(float(args.timeout_seconds)) or float(args.timeout_seconds) <= 0:
        raise FirebudV2PerformanceError("--timeout-seconds 必须大于 0")
    try:
        output_root = CORE._resolve_output_root(args.output_root)
    except CORE.PetManagementRecordingError as error:
        raise FirebudV2PerformanceError(str(error)) from error
    output_root.mkdir(parents=True, exist_ok=True)
    run_dir = output_root / run_id
    run_dir.mkdir(parents=False, exist_ok=False)
    try:
        godot = CORE._require_executable(args.godot, label="Godot")
        build_identity = _build_identity()
        tmp_dir = run_dir / "tmp"
        tmp_dir.mkdir(parents=False, exist_ok=False)
        base_environment = CORE._isolated_environment(tmp_dir)
        records: list[dict[str, Any]] = []
        for map_id in MAP_IDS:
            for variant in VARIANTS:
                for mode in MODES:
                    segment_id = f"{map_id}-{variant}-{mode}"
                    segment_dir = run_dir / "segments" / segment_id
                    segment_dir.mkdir(parents=True, exist_ok=False)
                    log_path = segment_dir / "godot.log"
                    command = _build_command(
                        godot=godot,
                        map_id=map_id,
                        variant=variant,
                        mode=mode,
                    )
                    started = _utc_now()
                    in_game, ps_samples, lane_evidence = _run_official_segment(
                        command=command,
                        segment_dir=segment_dir,
                        godot=godot,
                        mode=mode,
                        timeout_seconds=float(args.timeout_seconds),
                        base_environment=base_environment,
                    )
                    record = {
                        "schemaVersion": REPORT_SCHEMA_VERSION,
                        "recordType": "beastbound_firebud_v2_performance_segment",
                        "mapId": map_id,
                        "variant": variant,
                        "mode": mode,
                        "startedAtUtc": started,
                        "endedAtUtc": _utc_now(),
                        "scene": MAIN_SCENE,
                        "viewport": [EXPECTED_WIDTH, EXPECTED_HEIGHT],
                        "fixedFps": EXPECTED_FIXED_FPS,
                        "playbackSpeed": 1.0,
                        "candidatePreviewExplicit": variant == "candidate_v2_review",
                        "candidateBundleIdExpected": EXPECTED_BUNDLE_ID if variant == "candidate_v2_review" else None,
                        "command": CORE._redacted_command(command),
                        "isolation": {
                            "officialAutomationQaLane": True,
                            "laneFreshAtRecorderStart": True,
                            "qaLaneCleaned": True,
                            "containmentScope": CORE.CONTAINMENT_SCOPE,
                            "qaLane": {
                                "lane": CORE.QA_LANE,
                                "owner": lane_evidence["session"]["owner"],
                                "feature": CORE.QA_LANE_FEATURE,
                                "customUserDirName": CORE.QA_LANE_CUSTOM_USER_DIR_NAME,
                                "laneRoot": lane_evidence["session"]["godotLaneRoot"],
                                "realRoot": lane_evidence["session"]["godotRealRoot"],
                                "realBeforeSha256": lane_evidence["session"]["realInventorySha256"],
                            },
                            "normalPlayerSavePathUsed": False,
                            "profileSaveEnabled": False,
                            "backendProcessStartedByTool": False,
                            "mysqlAccessByTool": False,
                            "loginOrServerArgumentsAccepted": False,
                        },
                        "qaLaneSourceCheck": lane_evidence["sourceCheck"],
                        "qaLaneInitialVerification": lane_evidence["initialVerification"],
                        "qaLanePreflight": lane_evidence["preflight"],
                        "qaLaneNative": lane_evidence["native"],
                        "qaLaneCleanup": lane_evidence["cleanup"],
                        "qaLanePostCleanupInspect": lane_evidence["postCleanupInspect"],
                        "qaLaneLifecycle": _artifact(lane_evidence["lifecyclePath"]),
                        "qaLaneOwnerEvidence": _artifact(lane_evidence["ownerEvidencePath"]),
                        "inGamePerfProbe": in_game,
                        "process": _ps_summary(ps_samples),
                        "log": _artifact(log_path),
                    }
                    record_path = segment_dir / "record.json"
                    _write_json(record_path, record)
                    records.append({**record, "record": _artifact(record_path)})
        if _build_identity() != build_identity:
            raise FirebudV2PerformanceError("性能运行期间 map v2 构建身份发生变化")
        report = {
            "schemaVersion": REPORT_SCHEMA_VERSION,
            "reportType": REPORT_TYPE,
            "status": "passed",
            "runId": run_id,
            "generatedAtUtc": _utc_now(),
            "buildIdentity": build_identity,
            "scene": MAIN_SCENE,
            "matrix": {"maps": list(MAP_IDS), "variants": list(VARIANTS), "modes": list(MODES), "expectedRuns": len(MAP_IDS) * len(VARIANTS) * len(MODES)},
            "isolation": {
                "officialAutomationQaLanePerRun": True,
                "qaLaneCleanedAfterEveryRun": True,
                "normalPlayerSavePathUsed": False,
                "profileSaveEnabled": False,
                "backendProcessStartedByTool": False,
                "mysqlAccessByTool": False,
                "loginOrServerArgumentsAccepted": False,
            },
            "records": records,
            "ownerReviewStatus": "pending",
        }
        report_path = run_dir / "summary.json"
        _write_json(report_path, report)
        hash_paths = sorted(
            (
                path
                for path in run_dir.rglob("*")
                if path.is_file()
                and path.name != "SHA256SUMS"
                and path.relative_to(run_dir).parts[0] != "tmp"
            ),
            key=lambda path: str(path.relative_to(run_dir)),
        )
        checksum_path = CORE._write_sha256_manifest(run_dir, hash_paths)
        print(json.dumps({"status": "passed", "runId": run_id, "summary": CORE._repo_relative(report_path), "sha256Manifest": CORE._repo_relative(checksum_path)}, ensure_ascii=False))
        return report_path
    except BaseException as error:
        try:
            _write_json(run_dir / "failure-summary.json", {"schemaVersion": REPORT_SCHEMA_VERSION, "reportType": REPORT_TYPE, "status": "failed", "runId": run_id, "generatedAtUtc": _utc_now(), "errorType": type(error).__name__, "error": str(error) or type(error).__name__, "evidenceDirectoryPreserved": True})
        except OSError:
            pass
        raise


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="运行 Phase383 火芽 v2 独立真实 Main 性能矩阵：v1 baseline 与 v2 QA candidate 各两图 idle/moving。工具不接受登录、服务器或任意 Godot 参数。")
    parser.add_argument("--run-id")
    parser.add_argument("--output-root", type=Path, default=DEFAULT_OUTPUT_ROOT)
    parser.add_argument("--godot", default=os.environ.get("GODOT_BIN", "godot"))
    parser.add_argument("--timeout-seconds", type=float, default=180.0)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        _record(args)
    except KeyboardInterrupt:
        print("firebud v2 performance interrupted", file=sys.stderr)
        return 130
    except (FirebudV2PerformanceError, CORE.PetManagementRecordingError, FileExistsError, OSError, ValueError) as error:
        print(f"firebud v2 performance failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
