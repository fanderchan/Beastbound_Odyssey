#!/usr/bin/env python3
"""Capture Phase403 real-Main battle layout performance evidence.

The runner opens the normal Metal ``Main.tscn`` path at 1280x720 and segments
the built-in ``--perf-probe`` samples into idle, command selection, and real
cross-frame adjacent-target switching.  It never starts a backend, writes a
movie, or accepts extra Godot arguments.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import math
import os
import re
import statistics
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Sequence


REPO_ROOT = Path(__file__).resolve().parents[1]
DIAGNOSTIC_TOOL_PATH = (
    REPO_ROOT / "tools" / "record_battle_layout_owner_review.py"
)
DIAGNOSTIC_SPEC = importlib.util.spec_from_file_location(
    "_beastbound_phase403_attack_input_contract",
    DIAGNOSTIC_TOOL_PATH,
)
if DIAGNOSTIC_SPEC is None or DIAGNOSTIC_SPEC.loader is None:
    raise RuntimeError(
        f"无法加载Phase403攻击输入合同：{DIAGNOSTIC_TOOL_PATH}"
    )
DIAGNOSTIC = importlib.util.module_from_spec(DIAGNOSTIC_SPEC)
DIAGNOSTIC_SPEC.loader.exec_module(DIAGNOSTIC)
CORE = DIAGNOSTIC.CORE

GODOT_PROJECT = REPO_ROOT / "client" / "godot"
MAIN_SCENE = "res://scenes/Main.tscn"
MAIN_SCRIPT_PATH = GODOT_PROJECT / "scripts" / "main.gd"
CAPTURE_SCRIPT_PATH = (
    GODOT_PROJECT
    / "scripts"
    / "qa"
    / "battle_layout_owner_review_capture.gd"
)
PERF_CAPTURE_FLAG = "--phase403-battle-layout-perf"
DEFAULT_OUTPUT_ROOT = Path(".run/evidence/phase403_battle_layout_perf")
REPORT_SCHEMA_VERSION = 2
REPORT_TYPE = "beastbound_phase403_battle_layout_real_main_performance"
LAYOUT_IDENTITY = "phase403_grid1280_o94x340p4_l152x52_r64xm48_e132x164"
EXPECTED_STATES = ("idle", "command_selection", "target_switch")
EXPECTED_TARGET_SLOTS = ("enemy.front.4", "enemy.front.5")
EXPECTED_SWITCHES = 8
EXPECTED_SWITCH_CLICKS = 24
EXPECTED_QA_SYNC_SAMPLES = 160
MIN_STATE_SAMPLES = 5
MIN_RAW_FRAME_SAMPLES = 120
MIN_RAW_STATE_DURATION_USEC = 7_000_000
MAX_RAW_STATE_DURATION_USEC = 9_000_000
RAW_FRAME_SAMPLE_LIMIT = 600
MIN_STABLE_FPS_BY_STATE = {
    "idle": 28.0,
    "command_selection": 28.0,
    "target_switch": 45.0,
}
IDLE_MEDIAN_MS = 5.0
IDLE_P95_MS = 15.0
ACTIVE_MEDIAN_MS = 10.0
ACTIVE_P95_MS = 30.0
SAFE_RUN_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")
START_MARKER = "PHASE403_BATTLE_LAYOUT_PERF_START"
STATE_MARKER = "PHASE403_BATTLE_LAYOUT_PERF_STATE"
TARGET_MARKER = "PHASE403_BATTLE_LAYOUT_TARGET"
REVIEW_ONLY_MARKER = "PHASE403_BATTLE_LAYOUT_REVIEW_ONLY"
END_MARKER = "PHASE403_BATTLE_LAYOUT_PERF_END"
FAILURE_MARKERS = (
    "PHASE403_BATTLE_LAYOUT_PERF_FAILED",
    "PHASE403_BATTLE_LAYOUT_OWNER_REVIEW_FAILED",
)
ATTACK_INPUT_BEFORE_MARKER = DIAGNOSTIC.ATTACK_INPUT_BEFORE_MARKER
ATTACK_INPUT_AFTER_MARKER = DIAGNOSTIC.ATTACK_INPUT_AFTER_MARKER
ENVIRONMENT_MARKER = "PHASE403_BATTLE_LAYOUT_PERF_ENVIRONMENT"
RAW_FRAME_MARKER = "PHASE403_BATTLE_LAYOUT_PERF_RAW_FRAMES"
SEGMENTS_MARKER = "PHASE403_BATTLE_LAYOUT_PERF_SEGMENTS"
INVARIANT_MARKER = "PHASE403_BATTLE_LAYOUT_PERF_INVARIANT"


class Phase403BattleLayoutPerfError(RuntimeError):
    """The real-Main Phase403 performance contract failed."""


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _new_run_id() -> str:
    timestamp = _utc_now().strftime("%Y%m%dT%H%M%S.%fZ")
    return f"phase403-battle-layout-perf-{timestamp}-{uuid.uuid4().hex[:8]}"


def _build_godot_command(
    *,
    godot: str,
    extra_args: Sequence[str] = (),
) -> list[str]:
    if extra_args:
        raise Phase403BattleLayoutPerfError(
            "Phase403战斗布局性能验收不接受附加Godot参数"
        )
    try:
        command = CORE._build_native_godot_command(
            godot=godot,
            capture_flag=DIAGNOSTIC.CAPTURE_FLAG,
            review_args=(PERF_CAPTURE_FLAG, "--perf-probe"),
        )
    except CORE.PetManagementRecordingError as error:
        raise Phase403BattleLayoutPerfError(str(error)) from error
    if (
        command.count(DIAGNOSTIC.CAPTURE_FLAG) != 1
        or command.count(PERF_CAPTURE_FLAG) != 1
        or command.count(CORE.QA_LANE_ARGUMENT) != 1
        or "--user-data-dir" in command
        or "--script" in command
    ):
        raise Phase403BattleLayoutPerfError(
            "Phase403性能命令capture/perf/lane合同不精确"
        )
    return command


def _require_formal_active_pet_fixture_contract(
    capture_source: str,
) -> None:
    required_patterns = (
        r'const\s+READY_FRAME_LIMIT\s*:=\s*120',
        r'const\s+FORMAL_PET_INSTANCE_ID\s*:=\s*'
        r'"phase403_formal_battle_pet"',
        r'var\s+fixture_pet\s*:=\s*'
        r'PlayerProgressModel\.create_pet_instance_from_form\(\s*'
        r'FORMAL_PET_INSTANCE_ID,\s*MAX_PET_NAME,\s*'
        r'FORMAL_PET_FORM_ID,\s*'
        r'PlayerProgressModel\.PET_STATE_BATTLE,\s*140\s*\)',
        r'profile\["petInstances"\]\s*=\s*\[fixture_pet\]',
        r'profile\["activePetInstanceId"\]\s*=\s*'
        r'FORMAL_PET_INSTANCE_ID',
        r'profile\s*=\s*PlayerProgressModel\.normalize_profile\(profile\)',
        r'host\.call\("_start_battle",\s*state\)\s*'
        r'await\s+host\.get_tree\(\)\.process_frame\s*'
        r'if\s+not\s+_assert_post_start_formation_contract\(\):\s*'
        r'return\s+false',
        r'int\(readiness\.get\("actorCount",\s*0\)\)\s*!=\s*20',
        r'int\(readiness\.get\("slotCount",\s*0\)\)\s*!=\s*20',
        r'int\(readiness\.get\("invalidActorCount",\s*0\)\)\s*!=\s*0',
        r'int\(readiness\.get\("duplicateSlotCount",\s*0\)\)\s*!=\s*0',
        r'int\(readiness\.get\("allyCount",\s*0\)\)\s*!=\s*10',
        r'int\(readiness\.get\("enemyCount",\s*0\)\)\s*!=\s*10',
        r'not\s+bool\(readiness\.get\("fullFormation",\s*false\)\)',
        r'str\(readiness\.get\("allyPetInstanceId",\s*""\)\)\s*'
        r'!=\s*FORMAL_PET_INSTANCE_ID',
        r'str\(readiness\.get\("allyPetFormId",\s*""\)\)\s*'
        r'!=\s*FORMAL_PET_FORM_ID',
        r'str\(readiness\.get\("allyPetName",\s*""\)\)\s*'
        r'!=\s*MAX_PET_NAME',
        r'bool\(readiness\.get\("layoutOk",\s*false\)\)',
    )
    if any(
        re.search(pattern, capture_source, flags=re.MULTILINE | re.DOTALL)
        is None
        for pattern in required_patterns
    ) or len(
        re.findall(
            r'readiness=%s"\s*%\s*JSON\.stringify\(readiness\)',
            capture_source,
            flags=re.MULTILINE,
        )
    ) < 2:
        raise Phase403BattleLayoutPerfError(
            "Phase403性能fixture必须绑定active battle pet并首帧失败关闭"
        )
    if re.search(
        r'state\["(?:reviewLab|serverAuthority)"\]\s*=\s*true',
        capture_source,
    ):
        raise Phase403BattleLayoutPerfError(
            "Phase403性能fixture不得绕过Main本地队伍归一化"
        )


def _require_player_command_union_contract(capture_source: str) -> None:
    try:
        hud_contract_source = DIAGNOSTIC._gdscript_function_source(
            capture_source,
            "_assert_actual_hud_rects",
        )
    except DIAGNOSTIC.Phase403BattleLayoutRecordingError as error:
        raise Phase403BattleLayoutPerfError(str(error)) from error
    expected_labels_pattern = (
        r"const\s+EXPECTED_PLAYER_COMMAND_LABELS:\s*Array\[String\]\s*=\s*"
        r'\[\s*"咒术",\s*"攻击",\s*"道具",\s*"托管",\s*'
        r'"逃跑",\s*"援助",\s*"抓捕",\s*"召唤",\s*"防御",\s*'
        r'"自动",\s*\]'
    )
    required_fragments = (
        '(_view as Object).call("command_buttons")',
        '(command_buttons_value as Dictionary).values()',
        '(_view as Object).call("input_blockers")',
        '(_view as Object).call("snapshot")',
        "if visible_controls.has(control):",
        "visible_controls.append(control)",
        "visible_controls.size() != 10",
        'int(snapshot.get("activeButtonCount", -1)) != 10',
        "actual_labels.size() != 10",
        "sorted_actual_labels != sorted_expected_labels",
        "COMMAND_RIGHT_COLUMN_RECT.grow(0.5).encloses(rect)",
        "COMMAND_BOTTOM_ROW_RECT.grow(0.5).encloses(rect)",
        "hud_rect.intersects(rect)",
        "previous_rect.intersects(rect)",
        "actual_count=%d raw_count=%d active_count=%d labels=%s rects=%s",
    )
    if (
        re.search(
            expected_labels_pattern,
            capture_source,
            flags=re.MULTILINE | re.DOTALL,
        )
        is None
        or any(
            fragment not in hud_contract_source
            for fragment in required_fragments
        )
    ):
        raise Phase403BattleLayoutPerfError(
            "Phase403性能人物十指令必须由公开command buttons与input blockers去重闭合"
        )
    if "visible_blockers < 8" in capture_source:
        raise Phase403BattleLayoutPerfError(
            "Phase403性能不得把input_blockers误当全部人物指令"
        )


def _require_attack_input_diagnostic_contract(
    capture_source: str,
    command_view_source: str,
    command_host_source: str,
    main_source: str,
) -> None:
    try:
        DIAGNOSTIC._require_attack_input_diagnostic_contract(
            capture_source,
            command_view_source,
            command_host_source,
            main_source,
        )
    except DIAGNOSTIC.Phase403BattleLayoutRecordingError as error:
        raise Phase403BattleLayoutPerfError(str(error)) from error


def _require_perf_wiring() -> None:
    try:
        main_source = MAIN_SCRIPT_PATH.read_text(encoding="utf-8")
        capture_source = CAPTURE_SCRIPT_PATH.read_text(encoding="utf-8")
        command_view_source = DIAGNOSTIC.COMMAND_VIEW_SCRIPT_PATH.read_text(
            encoding="utf-8"
        )
        command_host_source = DIAGNOSTIC.COMMAND_HOST_SCRIPT_PATH.read_text(
            encoding="utf-8"
        )
    except OSError as error:
        raise Phase403BattleLayoutPerfError(
            "无法读取Phase403真实Main性能验收源码"
        ) from error
    _require_formal_active_pet_fixture_contract(capture_source)
    _require_player_command_union_contract(capture_source)
    try:
        DIAGNOSTIC._require_perf_evidence_contract(capture_source)
    except DIAGNOSTIC.Phase403BattleLayoutRecordingError as error:
        raise Phase403BattleLayoutPerfError(str(error)) from error
    _require_attack_input_diagnostic_contract(
        capture_source,
        command_view_source,
        command_host_source,
        main_source,
    )
    main_fragments = (
        CAPTURE_SCRIPT_PATH.name,
        "BattleLayoutOwnerReviewCapture.is_flag",
        "_run_battle_layout_owner_review_capture",
    )
    capture_fragments = (
        f'const PERF_CAPTURE_FLAG := "{PERF_CAPTURE_FLAG}"',
        "func _run_perf_capture()",
        "state=idle_begin",
        "state=command_selection_begin",
        "state=target_switch_begin",
        "Input.parse_input_event(press)",
        "button.gui_input.connect(gui_input_callable)",
        '"guiLeftButtonEvents": (',
        '"routeStages": (',
        '"observerSignalsDisconnected": bool(',
        '"releaseRoutingClassification": (',
        "await host.get_tree().process_frame",
        "await RenderingServer.frame_post_draw",
        'input_probe["postDrawBoundaryReached"] = true',
        'input_probe["nextLoopPostDrawBoundaryReached"] = true',
        '"release_next_loop_post_draw"',
        '"sameLoopDelivered": bool(',
        '"nextLoopDelivered": bool(',
        '"sameLoopProcessFrame": int(',
        '"nextLoopProcessFrame": int(',
        '"sameLoopGuiLeftButtonReleaseCount": int(',
        '"nextLoopGuiLeftButtonReleaseCount": int(',
        "MountVisualProfileCatalog.warm_world_form",
        "inserted_into_battle_state=false",
        "runtime_frame=256x256",
        "source_image_frame=512x512",
        "slot_collisions_recomputed=false",
        "func _normalized_frame_size(value) -> Vector2i:",
        "if values.size() != 2:",
        "Vector2i(512, 512)",
        "Vector2i(256, 256)",
    )
    if any(fragment not in main_source for fragment in main_fragments):
        raise Phase403BattleLayoutPerfError(
            "Phase403性能验收未通过最小Main flag wiring接入"
        )
    if any(fragment not in capture_source for fragment in capture_fragments):
        raise Phase403BattleLayoutPerfError(
            "Phase403性能controller缺少状态窗口或真实跨帧输入"
        )
    if "phase402" in capture_source.lower():
        raise Phase403BattleLayoutPerfError(
            "Phase403性能controller不得引用Phase402候选视觉"
        )
    if "source_frame=256x256" in capture_source:
        raise Phase403BattleLayoutPerfError(
            "Phase403性能controller不得把256运行帧误写为源图"
        )
    review_marker_start = capture_source.find(REVIEW_ONLY_MARKER)
    fixture_marker_start = capture_source.find(
        "PHASE403_BATTLE_LAYOUT_FIXTURE"
    )
    if (
        review_marker_start < 0
        or fixture_marker_start <= review_marker_start
        or "collisions=0"
        in capture_source[review_marker_start:fixture_marker_start]
    ):
        raise Phase403BattleLayoutPerfError(
            "Phase403性能review-only骑乘不得冒充完整slot零碰撞证据"
        )


def _parse_number(line: str, key: str) -> float:
    fields = _parse_fields(line)
    token = fields.get(key)
    if token is None:
        return math.nan
    number_pattern = r"[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?"
    if key == "fps":
        match = re.fullmatch(number_pattern, token)
        number_text = token
    elif key in ("process_total", "draw_battle"):
        match = re.fullmatch(number_pattern + r"ms", token)
        number_text = token[:-2]
    else:
        return math.nan
    if match is None:
        return math.nan
    try:
        value = float(number_text)
    except ValueError:
        return math.nan
    return value if math.isfinite(value) else math.nan


def _parse_fields(line: str) -> dict[str, str]:
    fields: dict[str, str] = {}
    for match in re.finditer(
        r"\b([A-Za-z][A-Za-z0-9_]*)=([^\s]+)",
        line,
    ):
        key = match.group(1)
        if key in fields:
            raise Phase403BattleLayoutPerfError(
                f"Phase403性能字段重复：{key}"
            )
        fields[key] = match.group(2)
    return fields


def _strict_json_loads(payload: str, label: str) -> Any:
    def reject_constant(value: str) -> None:
        raise ValueError(f"invalid JSON constant: {value}")

    def reject_duplicate_object(
        pairs: list[tuple[str, Any]],
    ) -> dict[str, Any]:
        parsed: dict[str, Any] = {}
        for key, value in pairs:
            if key in parsed:
                raise Phase403BattleLayoutPerfError(
                    f"{label} JSON字段重复：{key}"
                )
            parsed[key] = value
        return parsed

    try:
        return json.loads(
            payload,
            object_pairs_hook=reject_duplicate_object,
            parse_constant=reject_constant,
        )
    except Phase403BattleLayoutPerfError:
        raise
    except (json.JSONDecodeError, ValueError) as error:
        raise Phase403BattleLayoutPerfError(
            f"{label}不是严格JSON"
        ) from error


def _require_bool(fields: dict[str, str], key: str, expected: bool) -> None:
    expected_text = "true" if expected else "false"
    if fields.get(key, "").lower() != expected_text:
        raise Phase403BattleLayoutPerfError(
            f"Phase403性能字段{key}必须为{expected_text}"
        )


def _require_int(fields: dict[str, str], key: str) -> int:
    try:
        return int(fields[key])
    except (KeyError, ValueError) as error:
        raise Phase403BattleLayoutPerfError(
            f"Phase403性能字段{key}必须为整数"
        ) from error


def _require_positive_finite_float(fields: dict[str, str], key: str) -> float:
    try:
        value = float(fields[key])
    except (KeyError, ValueError) as error:
        raise Phase403BattleLayoutPerfError(
            f"Phase403性能字段{key}必须为有限正数"
        ) from error
    if not math.isfinite(value) or value <= 0.0:
        raise Phase403BattleLayoutPerfError(
            f"Phase403性能字段{key}必须为有限正数"
        )
    return value


def _percentile(values: Sequence[float], ratio: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(float(value) for value in values)
    index = min(
        len(ordered) - 1,
        max(0, math.ceil(len(ordered) * ratio) - 1),
    )
    return ordered[index]


def _metric_stats(values: Sequence[float]) -> dict[str, float]:
    return {
        "minimum": min(values) if values else 0.0,
        "median": statistics.median(values) if values else 0.0,
        "p95": _percentile(values, 0.95),
        "maximum": max(values) if values else 0.0,
    }


def _state_stats(samples: Sequence[dict[str, float]]) -> dict[str, Any]:
    stable_start = len(samples) // 2 if len(samples) >= 4 else 0
    stable = list(samples[stable_start:])
    fps = [sample["fps"] for sample in stable]
    process_total = [sample["processTotalMs"] for sample in stable]
    draw_battle = [sample["drawBattleMs"] for sample in stable]
    return {
        "sampleCount": len(samples),
        "stableSampleCount": len(stable),
        "stableWindow": "latter_half",
        "oneSecondFps": _metric_stats(fps),
        "processTotalMs": _metric_stats(process_total),
        "drawBattleMs": _metric_stats(draw_battle),
        "samples": [dict(sample) for sample in samples],
    }


def _validate_attack_input_diagnostic_lines(
    before_line: str,
    after_line: str,
) -> dict[str, Any]:
    try:
        return DIAGNOSTIC._validate_attack_input_diagnostic(
            DIAGNOSTIC._parse_attack_input_json(
                before_line,
                ATTACK_INPUT_BEFORE_MARKER,
            ),
            DIAGNOSTIC._parse_attack_input_json(
                after_line,
                ATTACK_INPUT_AFTER_MARKER,
            ),
        )
    except DIAGNOSTIC.Phase403BattleLayoutRecordingError as error:
        raise Phase403BattleLayoutPerfError(str(error)) from error


def _parse_json_marker(line: str, marker: str) -> dict[str, Any]:
    payload = line[len(marker) :].strip()
    parsed = _strict_json_loads(
        payload,
        f"Phase403性能marker {marker}",
    )
    if not isinstance(parsed, dict):
        raise Phase403BattleLayoutPerfError(
            f"Phase403性能marker {marker}必须是JSON对象"
        )
    return parsed


def _json_int(
    value: Any,
    label: str,
    *,
    minimum: int | None = None,
) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise Phase403BattleLayoutPerfError(
            f"Phase403性能JSON字段{label}必须为整数"
        )
    if minimum is not None and value < minimum:
        raise Phase403BattleLayoutPerfError(
            f"Phase403性能JSON字段{label}小于{minimum}"
        )
    return value


def _json_finite_number(
    value: Any,
    label: str,
    *,
    positive: bool = False,
) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise Phase403BattleLayoutPerfError(
            f"Phase403性能JSON字段{label}必须为有限数"
        )
    normalized = float(value)
    if not math.isfinite(normalized) or (positive and normalized <= 0.0):
        raise Phase403BattleLayoutPerfError(
            f"Phase403性能JSON字段{label}必须为有限正数"
        )
    return normalized


def _validate_environment_payload(payload: dict[str, Any]) -> dict[str, Any]:
    stage = payload.get("stage")
    window_size = payload.get("windowSize")
    refresh_hz = _json_finite_number(
        payload.get("screenRefreshHz"),
        "screenRefreshHz",
    )
    refresh_known = payload.get("screenRefreshKnown")
    time_scale = _json_finite_number(payload.get("timeScale"), "timeScale")
    video_adapter = str(payload.get("videoAdapter", "")).strip()
    if (
        stage not in ("start", "end")
        or payload.get("snapshotScope") != "start_end_only"
        or str(payload.get("displayServer", "")).lower() != "macos"
        or _json_int(payload.get("vsyncMode"), "vsyncMode") != 1
        or payload.get("windowFocused") is not True
        or _json_int(payload.get("windowMode"), "windowMode") != 0
        or window_size != [1280, 720]
        or _json_int(payload.get("screenIndex"), "screenIndex", minimum=0) < 0
        or not isinstance(refresh_known, bool)
        or refresh_known != (refresh_hz > 0.0)
        or _json_int(payload.get("maxFps"), "maxFps") != 60
        or _json_int(
            payload.get("physicsTicksPerSecond"),
            "physicsTicksPerSecond",
        )
        != 60
        or not math.isclose(time_scale, 1.0, abs_tol=1e-9)
        or payload.get("renderingMethod") != "mobile"
        or str(payload.get("renderingDriver", "")).lower() != "metal"
        or not video_adapter
        or payload.get("hostPropertyCacheReady") is not True
    ):
        raise Phase403BattleLayoutPerfError(
            "Phase403性能环境不是聚焦macOS/Metal Mobile/VSync/60FPS"
        )
    return {
        "stage": stage,
        "snapshotScope": "start_end_only",
        "displayServer": payload["displayServer"],
        "vsyncMode": 1,
        "windowFocused": True,
        "windowMode": 0,
        "windowSize": [1280, 720],
        "screenIndex": payload["screenIndex"],
        "screenRefreshHz": refresh_hz,
        "screenRefreshKnown": refresh_known,
        "maxFps": 60,
        "physicsTicksPerSecond": 60,
        "timeScale": 1.0,
        "renderingMethod": "mobile",
        "renderingDriver": "metal",
        "videoAdapter": video_adapter,
        "hostPropertyCacheReady": True,
    }


def _validate_raw_frame_payload(
    payload: dict[str, Any],
    expected_state: str,
) -> dict[str, Any]:
    if payload.get("state") != expected_state:
        raise Phase403BattleLayoutPerfError(
            f"Phase403逐帧raw状态错配：{expected_state}"
        )
    sample_limit = _json_int(payload.get("sampleLimit"), "sampleLimit")
    sample_count = _json_int(
        payload.get("sampleCount"),
        "sampleCount",
        minimum=MIN_RAW_FRAME_SAMPLES,
    )
    dropped_count = _json_int(
        payload.get("droppedCount"),
        "droppedCount",
        minimum=0,
    )
    started_usec = _json_int(
        payload.get("startedUsec"),
        "startedUsec",
        minimum=1,
    )
    ended_usec = _json_int(
        payload.get("endedUsec"),
        "endedUsec",
        minimum=1,
    )
    duration_usec = _json_int(
        payload.get("durationUsec"),
        "durationUsec",
        minimum=MIN_RAW_STATE_DURATION_USEC,
    )
    started_frame = _json_int(
        payload.get("startedFrame"),
        "startedFrame",
        minimum=0,
    )
    ended_frame = _json_int(
        payload.get("endedFrame"),
        "endedFrame",
        minimum=0,
    )
    pairs = payload.get("pairs")
    if (
        payload.get("clock") != "Time.get_ticks_usec"
        or sample_limit != RAW_FRAME_SAMPLE_LIMIT
        or dropped_count != 0
        or payload.get("monotonic") is not True
        or payload.get("samplerDisconnected") is not True
        or ended_usec - started_usec != duration_usec
        or duration_usec > MAX_RAW_STATE_DURATION_USEC
        or ended_frame < started_frame
        or not isinstance(pairs, list)
        or len(pairs) != sample_count * 2
        or sample_count >= sample_limit
    ):
        raise Phase403BattleLayoutPerfError(
            f"Phase403 {expected_state}逐帧raw边界不完整"
        )
    normalized_pairs = [
        _json_int(value, f"pairs[{index}]", minimum=0)
        for index, value in enumerate(pairs)
    ]
    frames = normalized_pairs[0::2]
    ticks = normalized_pairs[1::2]
    if (
        ticks[0] < started_usec
        or ticks[-1] > ended_usec
        or frames[0] < started_frame
        or frames[0] > started_frame + 1
        or frames[-1] > ended_frame
        or ended_frame > frames[-1] + 1
    ):
        raise Phase403BattleLayoutPerfError(
            f"Phase403 {expected_state}逐帧raw frame/usec越出窗口"
        )
    intervals_ms: list[float] = []
    interval_right_ticks: list[int] = []
    for index in range(1, sample_count):
        if frames[index] != frames[index - 1] + 1:
            raise Phase403BattleLayoutPerfError(
                f"Phase403 {expected_state}逐process帧编号不连续"
            )
        delta_usec = ticks[index] - ticks[index - 1]
        if delta_usec <= 0:
            raise Phase403BattleLayoutPerfError(
                f"Phase403 {expected_state}逐帧单调时钟未递增"
            )
        intervals_ms.append(float(delta_usec) / 1000.0)
        interval_right_ticks.append(ticks[index])
    wall_midpoint_usec = started_usec + duration_usec // 2
    stable_start = next(
        (
            index
            for index, right_tick in enumerate(interval_right_ticks)
            if right_tick > wall_midpoint_usec
        ),
        -1,
    )
    if stable_start < 0:
        raise Phase403BattleLayoutPerfError(
            f"Phase403 {expected_state}逐帧raw后半墙钟窗口为空"
        )
    stable_intervals = intervals_ms[stable_start:]
    stable_first_sample_index = stable_start
    elapsed_between_samples_usec = ticks[-1] - ticks[stable_first_sample_index]
    raw_aggregate_fps = (
        float(frames[-1] - frames[stable_first_sample_index]) * 1_000_000.0
        / float(elapsed_between_samples_usec)
    )
    return {
        "clock": "Time.get_ticks_usec",
        "sampleLimit": sample_limit,
        "sampleCount": sample_count,
        "intervalSampleCount": len(stable_intervals),
        "intervalWindow": "wall_time_latter_half",
        "intervalSelection": "right_endpoint_after_midpoint",
        "wallMidpointUsec": wall_midpoint_usec,
        "intervalWindowStartedUsec": ticks[stable_first_sample_index],
        "droppedCount": 0,
        "startedUsec": started_usec,
        "endedUsec": ended_usec,
        "durationUsec": duration_usec,
        "startedFrame": started_frame,
        "endedFrame": ended_frame,
        "rawAggregateFps": raw_aggregate_fps,
        "rawFrameIntervalMs": _metric_stats(stable_intervals),
        "pairs": normalized_pairs,
    }


def _validate_segments_payload(
    payload: dict[str, Any],
    target_raw: dict[str, Any],
) -> dict[str, Any]:
    switch_count = _json_int(payload.get("switchCount"), "switchCount")
    click_count = _json_int(
        payload.get("realLeftClickCount"),
        "realLeftClickCount",
    )
    qa_usec = _json_int(
        payload.get("qaSyncWallUsec"),
        "qaSyncWallUsec",
        minimum=0,
    )
    qa_count = _json_int(
        payload.get("qaSyncSampleCount"),
        "qaSyncSampleCount",
        minimum=0,
    )
    input_usec = payload.get("inputDispatchWallUsec")
    input_counts = payload.get("inputDispatchEventCounts")
    operation_wall = payload.get("operationWallUsec")
    operation_boundaries = payload.get("operationBoundaryUsec")
    if (
        payload.get("state") != "target_switch"
        or payload.get("clock") != "Time.get_ticks_usec"
        or switch_count != EXPECTED_SWITCHES
        or click_count != EXPECTED_SWITCH_CLICKS
        or qa_count != EXPECTED_QA_SYNC_SAMPLES
        or payload.get("qaCoverage")
        != "instrumented_sync_sections_only"
        or not isinstance(input_usec, dict)
        or not isinstance(input_counts, dict)
        or not isinstance(operation_wall, dict)
        or not isinstance(operation_boundaries, dict)
        or set(input_usec) != {"motion", "press", "release"}
        or set(input_counts) != {"motion", "press", "release"}
        or set(operation_wall) != {"target", "recall", "attack"}
        or set(operation_boundaries) != {"target", "recall", "attack"}
        or payload.get("operationBoundaryClockAbsolute") is not True
        or payload.get("operationWallIncludesFrameWaits") is not True
        or payload.get("targetMarkersBufferedUntilAfterRaw") is not True
        or payload.get("layoutTimingAvailable") is not False
        or payload.get("layoutTimingUnavailableReason")
        != "product_not_instrumented"
    ):
        raise Phase403BattleLayoutPerfError(
            "Phase403 target_switch分段性能边界不完整"
        )
    normalized_input_usec: dict[str, int] = {}
    normalized_input_counts: dict[str, int] = {}
    for kind in ("motion", "press", "release"):
        normalized_input_usec[kind] = _json_int(
            input_usec.get(kind),
            f"inputDispatchWallUsec.{kind}",
            minimum=0,
        )
        normalized_input_counts[kind] = _json_int(
            input_counts.get(kind),
            f"inputDispatchEventCounts.{kind}",
            minimum=0,
        )
        if normalized_input_counts[kind] != EXPECTED_SWITCH_CLICKS:
            raise Phase403BattleLayoutPerfError(
                f"Phase403 {kind}真实Input.parse次数不是24"
            )
    total_input_events = _json_int(
        payload.get("inputDispatchEventCount"),
        "inputDispatchEventCount",
    )
    if total_input_events != EXPECTED_SWITCH_CLICKS * 3:
        raise Phase403BattleLayoutPerfError(
            "Phase403 target_switch真实Input.parse事件总数不是72"
        )
    normalized_operations: dict[str, list[int]] = {}
    normalized_boundaries: dict[str, list[int]] = {}
    target_window_start = int(target_raw["startedUsec"])
    target_window_end = int(target_raw["endedUsec"])
    for kind in ("target", "recall", "attack"):
        samples = operation_wall.get(kind)
        boundaries = operation_boundaries.get(kind)
        if not isinstance(samples, list) or len(samples) != EXPECTED_SWITCHES:
            raise Phase403BattleLayoutPerfError(
                f"Phase403 {kind} wall分段必须精确8项"
            )
        if (
            not isinstance(boundaries, list)
            or len(boundaries) != EXPECTED_SWITCHES * 2
        ):
            raise Phase403BattleLayoutPerfError(
                f"Phase403 {kind} start/end边界必须精确16项"
            )
        normalized_operations[kind] = [
            _json_int(value, f"operationWallUsec.{kind}[{index}]", minimum=1)
            for index, value in enumerate(samples)
        ]
        normalized_boundaries[kind] = [
            _json_int(
                value,
                f"operationBoundaryUsec.{kind}[{index}]",
                minimum=1,
            )
            for index, value in enumerate(boundaries)
        ]
        previous_start = -1
        for index in range(EXPECTED_SWITCHES):
            started_usec = normalized_boundaries[kind][index * 2]
            ended_usec = normalized_boundaries[kind][index * 2 + 1]
            if (
                started_usec < target_window_start
                or ended_usec > target_window_end
                or started_usec <= previous_start
                or ended_usec <= started_usec
                or ended_usec - started_usec
                != normalized_operations[kind][index]
            ):
                raise Phase403BattleLayoutPerfError(
                    f"Phase403 {kind} wall与绝对边界不一致或越出raw窗口"
                )
            previous_start = started_usec
    for index in range(EXPECTED_SWITCHES):
        target_start, target_end = normalized_boundaries["target"][
            index * 2 : index * 2 + 2
        ]
        recall_start, recall_end = normalized_boundaries["recall"][
            index * 2 : index * 2 + 2
        ]
        attack_start, attack_end = normalized_boundaries["attack"][
            index * 2 : index * 2 + 2
        ]
        if not (
            target_start < target_end <= recall_start < recall_end
            <= attack_start < attack_end
        ):
            raise Phase403BattleLayoutPerfError(
                f"Phase403 第{index + 1}轮target/recall/attack顺序错误"
            )
        if index > 0:
            previous_attack_end = normalized_boundaries["attack"][
                (index - 1) * 2 + 1
            ]
            if previous_attack_end > target_start:
                raise Phase403BattleLayoutPerfError(
                    f"Phase403 第{index}轮attack与第{index + 1}轮"
                    "target时钟重叠"
                )
    target_starts = normalized_boundaries["target"][0::2]
    target_start_gaps_ms = [
        float(target_starts[index] - target_starts[index - 1]) / 1000.0
        for index in range(1, len(target_starts))
    ]
    target_start_span_usec = target_starts[-1] - target_starts[0]
    target_start_rate_hz = (
        float(EXPECTED_SWITCHES - 1) * 1_000_000.0
        / float(target_start_span_usec)
    )
    return {
        "clock": "Time.get_ticks_usec",
        "switchCount": switch_count,
        "realLeftClickCount": click_count,
        "qaSyncWallUsec": qa_usec,
        "qaSyncSampleCount": qa_count,
        "qaCoverage": "instrumented_sync_sections_only",
        "inputDispatchWallUsec": normalized_input_usec,
        "inputDispatchEventCounts": normalized_input_counts,
        "inputDispatchEventCount": total_input_events,
        "operationWallUsec": normalized_operations,
        "operationBoundaryUsec": normalized_boundaries,
        "targetStartGapMs": _metric_stats(target_start_gaps_ms),
        "targetStartRateHz": target_start_rate_hz,
        "operationBoundaryClockAbsolute": True,
        "operationWallIncludesFrameWaits": True,
        "targetMarkersBufferedUntilAfterRaw": True,
        "layoutTimingAvailable": False,
        "layoutTimingUnavailableReason": "product_not_instrumented",
    }


def _validate_godot_log(path: Path) -> dict[str, Any]:
    text = path.read_text(encoding="utf-8")
    if any(marker in text for marker in FAILURE_MARKERS):
        raise Phase403BattleLayoutPerfError(
            "Godot Phase403战斗布局性能脚本报告失败"
        )
    for forbidden in (
        "entry=SceneTreeScript",
        "extends SceneTree",
        "SCRIPT ERROR",
        "Parse Error",
        "WARNING:",
        "ERROR:",
        "ObjectDB instances were leaked at exit",
        "resources still in use at exit",
        "Movie Maker mode enabled",
        "phase402",
    ):
        if forbidden.lower() in text.lower():
            raise Phase403BattleLayoutPerfError(
                f"Phase403性能日志包含禁止内容：{forbidden}"
            )
    if "Metal 4.0 - Forward Mobile" not in text:
        raise Phase403BattleLayoutPerfError(
            "Phase403性能验收没有使用Metal Forward Mobile"
        )

    state_samples: dict[str, list[dict[str, float]]] = {
        state: [] for state in EXPECTED_STATES
    }
    state_events: list[str] = []
    state_boundary_fields: dict[str, dict[str, str]] = {}
    target_slots: list[str] = []
    target_indices: list[int] = []
    active_state = ""
    start_lines: list[str] = []
    review_only_lines: list[str] = []
    end_lines: list[str] = []
    attack_before_lines: list[str] = []
    attack_after_lines: list[str] = []
    environment_lines: list[str] = []
    raw_frame_payloads: dict[str, dict[str, Any]] = {}
    segment_lines: list[str] = []
    invariant_lines: list[str] = []
    state_pattern = re.compile(
        rf"^{STATE_MARKER}\s+state="
        r"(idle|command_selection|target_switch)_(begin|end)(?:\s.*)?$"
    )
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if line.startswith(ENVIRONMENT_MARKER + " "):
            environment_lines.append(line)
            continue
        if line.startswith(RAW_FRAME_MARKER + " "):
            if active_state not in EXPECTED_STATES:
                raise Phase403BattleLayoutPerfError(
                    "Phase403逐帧raw marker必须位于对应状态窗口内"
                )
            if active_state in raw_frame_payloads:
                raise Phase403BattleLayoutPerfError(
                    f"Phase403 {active_state}逐帧raw marker重复"
                )
            raw_frame_payloads[active_state] = _parse_json_marker(
                line,
                RAW_FRAME_MARKER,
            )
            continue
        if line.startswith(SEGMENTS_MARKER + " "):
            if active_state != "target_switch":
                raise Phase403BattleLayoutPerfError(
                    "Phase403性能分段marker必须位于target_switch窗口内"
                )
            segment_lines.append(line)
            continue
        if line.startswith(INVARIANT_MARKER + " "):
            if active_state:
                raise Phase403BattleLayoutPerfError(
                    "Phase403完整20人/HUD复验必须位于性能窗口之外"
                )
            invariant_lines.append(line)
            continue
        if line.startswith(START_MARKER + " "):
            start_lines.append(line)
            continue
        if line.startswith(REVIEW_ONLY_MARKER + " "):
            review_only_lines.append(line)
            continue
        if line.startswith(END_MARKER + " "):
            end_lines.append(line)
            continue
        if line.startswith(ATTACK_INPUT_BEFORE_MARKER + " "):
            attack_before_lines.append(line)
            continue
        if line.startswith(ATTACK_INPUT_AFTER_MARKER + " "):
            attack_after_lines.append(line)
            continue
        if line.startswith(TARGET_MARKER + " "):
            if active_state != "target_switch":
                raise Phase403BattleLayoutPerfError(
                    "Phase403性能目标marker必须位于target_switch窗口内"
                )
            fields = _parse_fields(line)
            if fields.get("expected") != fields.get("resolved"):
                raise Phase403BattleLayoutPerfError(
                    "Phase403性能目标切换存在非精确actor命中"
                )
            _require_bool(fields, "exact", True)
            _require_bool(fields, "focus_label_fits", True)
            _require_bool(fields, "hud_overlap", False)
            slot_id = fields.get("slot", "")
            expected_actor = (
                "enemy_front_4"
                if slot_id == "enemy.front.4"
                else "enemy_front_5"
                if slot_id == "enemy.front.5"
                else ""
            )
            if (
                fields.get("actor") != expected_actor
                or fields.get("expected") != expected_actor
                or not math.isclose(
                    float(fields.get("adjacent_distance", "nan")),
                    80.0,
                    abs_tol=0.01,
                )
            ):
                raise Phase403BattleLayoutPerfError(
                    "Phase403性能相邻slot/actor/距离合同漂移"
                )
            target_indices.append(_require_int(fields, "index"))
            target_slots.append(slot_id)
            continue
        state_match = state_pattern.match(line)
        if state_match is not None:
            state, boundary = state_match.groups()
            state_events.append(f"{state}_{boundary}")
            state_boundary_fields[f"{state}_{boundary}"] = _parse_fields(line)
            if boundary == "begin":
                if active_state:
                    raise Phase403BattleLayoutPerfError(
                        "Phase403性能状态窗口发生嵌套"
                    )
                active_state = state
            else:
                if active_state != state:
                    raise Phase403BattleLayoutPerfError(
                        "Phase403性能状态窗口结束顺序错误"
                    )
                if state not in raw_frame_payloads:
                    raise Phase403BattleLayoutPerfError(
                        f"Phase403 {state}结束前缺少逐帧raw marker"
                    )
                active_state = ""
            continue
        if line.startswith("perf probe:") and active_state:
            fps = _parse_number(line, "fps")
            process_total = _parse_number(line, "process_total")
            draw_battle = _parse_number(line, "draw_battle")
            if (
                not math.isfinite(fps)
                or fps <= 0.0
                or not math.isfinite(process_total)
                or process_total < 0.0
                or not math.isfinite(draw_battle)
                or draw_battle < 0.0
            ):
                raise Phase403BattleLayoutPerfError(
                    f"Phase403 {active_state}性能样本缺少fps/process_total/draw_battle"
                )
            state_samples[active_state].append(
                {
                    "fps": fps,
                    "processTotalMs": process_total,
                    "drawBattleMs": draw_battle,
                }
            )

    if any(
        len(lines) != 1
        for lines in (
            start_lines,
            review_only_lines,
            attack_before_lines,
            attack_after_lines,
            end_lines,
        )
    ):
        raise Phase403BattleLayoutPerfError(
            "Phase403性能日志的真实Main起点、攻击诊断、review-only与终点必须各且仅有一个"
        )
    if (
        len(environment_lines) != 2
        or len(segment_lines) != 1
        or len(invariant_lines) != 2
        or tuple(raw_frame_payloads) != EXPECTED_STATES
    ):
        raise Phase403BattleLayoutPerfError(
            "Phase403性能环境、三段逐帧raw、输入分段与阶段外复验必须完整且唯一"
        )
    start_line = start_lines[0]
    marker_offsets = (
        text.find(STATE_MARKER + " state=idle_end"),
        text.find(ATTACK_INPUT_BEFORE_MARKER + " "),
        text.find(ATTACK_INPUT_AFTER_MARKER + " "),
        text.find(STATE_MARKER + " state=command_selection_begin"),
    )
    if any(offset < 0 for offset in marker_offsets) or tuple(
        sorted(marker_offsets)
    ) != marker_offsets:
        raise Phase403BattleLayoutPerfError(
            "Phase403性能攻击诊断必须位于idle结束后、指令窗口前且顺序唯一"
        )
    evidence_offsets = (
        text.find(ENVIRONMENT_MARKER + " "),
        text.find(START_MARKER + " "),
        text.find(INVARIANT_MARKER + " stage=pre_windows "),
        text.find(STATE_MARKER + " state=target_switch_end"),
        text.find(INVARIANT_MARKER + " stage=post_windows "),
        text.rfind(ENVIRONMENT_MARKER + " "),
        text.find(END_MARKER + " "),
    )
    if any(offset < 0 for offset in evidence_offsets) or tuple(
        sorted(evidence_offsets)
    ) != evidence_offsets:
        raise Phase403BattleLayoutPerfError(
            "Phase403性能环境、窗口、阶段外复验与终点顺序错误"
        )
    target_evidence_offsets = (
        text.find(STATE_MARKER + " state=target_switch_begin"),
        text.rfind(RAW_FRAME_MARKER + " "),
        text.find(TARGET_MARKER + " "),
        text.find(SEGMENTS_MARKER + " "),
        text.find(STATE_MARKER + " state=target_switch_end"),
    )
    if any(offset < 0 for offset in target_evidence_offsets) or tuple(
        sorted(target_evidence_offsets)
    ) != target_evidence_offsets:
        raise Phase403BattleLayoutPerfError(
            "Phase403 target marker/segments必须在raw采样断开后再输出"
        )
    attack_input = _validate_attack_input_diagnostic_lines(
        attack_before_lines[0],
        attack_after_lines[0],
    )
    review_only_line = review_only_lines[0]
    end_line = end_lines[0]
    expected_events = [
        f"{state}_{boundary}"
        for state in EXPECTED_STATES
        for boundary in ("begin", "end")
    ]
    if state_events != expected_events or active_state:
        raise Phase403BattleLayoutPerfError(
            "Phase403性能状态必须按idle→command_selection→target_switch闭合"
        )

    environment = [
        _validate_environment_payload(
            _parse_json_marker(line, ENVIRONMENT_MARKER)
        )
        for line in environment_lines
    ]
    if [value["stage"] for value in environment] != ["start", "end"]:
        raise Phase403BattleLayoutPerfError(
            "Phase403性能环境marker必须为start→end"
        )
    for key in (
        "displayServer",
        "snapshotScope",
        "vsyncMode",
        "windowSize",
        "windowMode",
        "screenIndex",
        "screenRefreshKnown",
        "maxFps",
        "physicsTicksPerSecond",
        "timeScale",
        "renderingMethod",
        "renderingDriver",
        "videoAdapter",
        "hostPropertyCacheReady",
    ):
        if environment[0][key] != environment[1][key]:
            raise Phase403BattleLayoutPerfError(
                f"Phase403性能环境字段{key}在窗口中漂移"
            )
    if not math.isclose(
        float(environment[0]["screenRefreshHz"]),
        float(environment[1]["screenRefreshHz"]),
        rel_tol=0.0,
        abs_tol=0.01,
    ):
        raise Phase403BattleLayoutPerfError(
            "Phase403性能环境字段screenRefreshHz在窗口中漂移"
        )
    validated_raw_frames = {
        state: _validate_raw_frame_payload(raw_frame_payloads[state], state)
        for state in EXPECTED_STATES
    }
    segments = _validate_segments_payload(
        _parse_json_marker(segment_lines[0], SEGMENTS_MARKER),
        validated_raw_frames["target_switch"],
    )
    invariants: dict[str, dict[str, str]] = {}
    for invariant_line in invariant_lines:
        invariant = _parse_fields(invariant_line)
        stage = invariant.get("stage", "")
        if (
            stage not in ("pre_windows", "post_windows")
            or stage in invariants
            or _require_int(invariant, "actors") != 20
            or _require_int(invariant, "slots") != 20
            or _require_int(invariant, "ally") != 10
            or _require_int(invariant, "enemy") != 10
            or _require_int(invariant, "hud_collisions") != 0
            or _require_int(invariant, "viewport_violations") != 0
            or invariant.get("layout_identity") != LAYOUT_IDENTITY
        ):
            raise Phase403BattleLayoutPerfError(
                "Phase403阶段外20 actor/slot/HUD布局复验不完整"
            )
        _require_bool(invariant, "full_formation", True)
        _require_bool(invariant, "hud_exact", True)
        invariants[stage] = invariant
    if tuple(invariants) != ("pre_windows", "post_windows"):
        raise Phase403BattleLayoutPerfError(
            "Phase403阶段外复验必须按pre_windows→post_windows闭合"
        )

    target_begin = state_boundary_fields["target_switch_begin"]
    target_end = state_boundary_fields["target_switch_end"]
    if (
        _require_int(target_begin, "switches") != EXPECTED_SWITCHES
        or _require_int(target_begin, "clicks") != EXPECTED_SWITCH_CLICKS
        or _require_int(target_end, "switches") != EXPECTED_SWITCHES
        or _require_int(target_end, "target_hits") != EXPECTED_SWITCHES
        or _require_int(target_end, "switch_clicks")
        != EXPECTED_SWITCH_CLICKS
        or _require_int(target_end, "hud_passthrough") != 0
    ):
        raise Phase403BattleLayoutPerfError(
            "Phase403 target_switch必须精确8轮、24次跨帧左键"
        )
    for key in ("exact_slots", "raw_frames", "segments"):
        _require_bool(target_end, key, True)

    start = _parse_fields(start_line)
    if (
        start.get("scene") != "Main.tscn"
        or start.get("entry") != "MainSceneFlag"
        or start.get("viewport") != "1280x720"
        or start.get("environment") != "runtime_markers"
        or start.get("formation") != "10v10"
        or _require_int(start, "actors") != 20
        or start.get("layout_identity") != LAYOUT_IDENTITY
    ):
        raise Phase403BattleLayoutPerfError(
            "Phase403性能起点不是Main/运行环境marker/1280x720/正式20人布局"
        )
    _require_bool(start, "backend_started", False)
    _require_bool(start, "profile_save", False)
    _require_bool(start, "host_property_cache", True)

    review_only = _parse_fields(review_only_line)
    review_visible_px = _require_positive_finite_float(
        review_only,
        "max_visible_px",
    )
    review_envelope_px = _require_positive_finite_float(
        review_only,
        "horizontal_envelope_px",
    )
    if (
        review_only.get("kind") != "integrated_mount"
        or review_only.get("runtime_frame") != "256x256"
        or review_only.get("source_image_frame") != "not_asserted"
        or "collisions" in review_only
        or "envelope" in review_only
        or not math.isclose(review_envelope_px, 132.0, abs_tol=0.01)
        or review_visible_px > review_envelope_px
    ):
        raise Phase403BattleLayoutPerfError(
            "Phase403性能review-only整体骑乘宽度合同不完整"
        )
    _require_bool(review_only, "geometry_only", True)
    _require_bool(review_only, "width_covered", True)
    _require_bool(review_only, "actual_bundle_warmed", True)
    _require_bool(review_only, "player_visible", False)
    _require_bool(review_only, "ordinary_battle", False)
    _require_bool(review_only, "inserted_into_battle_state", False)
    _require_bool(review_only, "vertical_recomputed", False)
    _require_bool(review_only, "anchor_recomputed", False)
    _require_bool(review_only, "slot_collisions_recomputed", False)

    end = _parse_fields(end_line)
    _require_positive_finite_float(end, "elapsed_wall")
    switches = _require_int(end, "switches")
    target_hits = _require_int(end, "target_hits")
    left_clicks = _require_int(end, "actual_left_clicks")
    cross_frame = _require_int(end, "cross_frame_presses")
    if (
        end.get("status") != "passed"
        or end.get("scene") != "Main.tscn"
        or end.get("entry") != "MainSceneFlag"
        or end.get("viewport") != "1280x720"
        or end.get("layout_identity") != LAYOUT_IDENTITY
        or _require_int(end, "actors") != 20
        or switches != EXPECTED_SWITCHES
        or target_hits != switches
        or left_clicks != 1 + EXPECTED_SWITCH_CLICKS
        or cross_frame != left_clicks
        or _require_int(end, "hud_collisions") != 0
        or _require_int(end, "hud_passthrough") != 0
    ):
        raise Phase403BattleLayoutPerfError(
            "Phase403性能终点未闭合精确目标/HUD/跨帧合同"
        )
    for key in (
        "idle",
        "command_selection",
        "target_switch",
        "exact_slots",
        "raw_frames",
        "segments",
        "runtime_environment",
        "pre_invariant",
        "post_invariant",
    ):
        _require_bool(end, key, True)
    for key in ("backend_started", "profile_save"):
        _require_bool(end, key, False)
    if len(target_slots) != target_hits:
        raise Phase403BattleLayoutPerfError(
            "Phase403性能目标marker数与target_hits不一致"
        )
    if target_indices != list(range(1, target_hits + 1)):
        raise Phase403BattleLayoutPerfError(
            "Phase403性能目标marker index没有连续递增"
        )
    if any(slot not in EXPECTED_TARGET_SLOTS for slot in target_slots):
        raise Phase403BattleLayoutPerfError(
            "Phase403性能目标切换越出两个指定相邻slot"
        )
    if any(
        target_slots[index] == target_slots[index - 1]
        for index in range(1, len(target_slots))
    ):
        raise Phase403BattleLayoutPerfError(
            "Phase403性能目标没有在两个相邻slot之间交替"
        )

    states: dict[str, Any] = {}
    gates: list[dict[str, Any]] = []
    for state in EXPECTED_STATES:
        samples = state_samples[state]
        if len(samples) < MIN_STATE_SAMPLES:
            raise Phase403BattleLayoutPerfError(
                f"Phase403 {state}性能样本少于{MIN_STATE_SAMPLES}"
            )
        stats = _state_stats(samples)
        raw_frames = validated_raw_frames[state]
        stats["rawFrames"] = raw_frames
        stats["rawAggregateFps"] = raw_frames["rawAggregateFps"]
        stats["rawFrameIntervalMs"] = raw_frames["rawFrameIntervalMs"]
        states[state] = stats
        minimum_fps = MIN_STABLE_FPS_BY_STATE[state]
        median_limit = IDLE_MEDIAN_MS if state == "idle" else ACTIVE_MEDIAN_MS
        p95_limit = IDLE_P95_MS if state == "idle" else ACTIVE_P95_MS
        checks = (
            (
                "oneSecondFps.minimum",
                stats["oneSecondFps"]["minimum"],
                minimum_fps,
                ">=",
            ),
            (
                "rawAggregateFps",
                stats["rawAggregateFps"],
                minimum_fps,
                ">=",
            ),
            (
                "rawFrameIntervalMs.p95",
                stats["rawFrameIntervalMs"]["p95"],
                1000.0 / minimum_fps,
                "<=",
            ),
            (
                "processTotalMs.median",
                stats["processTotalMs"]["median"],
                median_limit,
                "<=",
            ),
            (
                "processTotalMs.p95",
                stats["processTotalMs"]["p95"],
                p95_limit,
                "<=",
            ),
            (
                "drawBattleMs.median",
                stats["drawBattleMs"]["median"],
                median_limit,
                "<=",
            ),
            (
                "drawBattleMs.p95",
                stats["drawBattleMs"]["p95"],
                p95_limit,
                "<=",
            ),
        )
        for metric, actual, threshold, operator in checks:
            passed = actual >= threshold if operator == ">=" else actual <= threshold
            gates.append(
                {
                    "state": state,
                    "metric": metric,
                    "actual": actual,
                    "operator": operator,
                    "threshold": threshold,
                    "passed": passed,
                }
            )
            if not passed:
                raise Phase403BattleLayoutPerfError(
                    f"Phase403 {state} {metric}={actual:.3f}未通过"
                )
    return {
        "status": "passed",
        "scene": MAIN_SCENE,
        "entryMode": "MainSceneFlag",
        "viewport": "1280x720",
        "renderer": "Metal Forward Mobile",
        "environment": environment,
        "layoutIdentity": LAYOUT_IDENTITY,
        "states": states,
        "gates": gates,
        "interaction": {
            "switches": switches,
            "targetHits": target_hits,
            "targetSlots": target_slots,
            "actualLeftClicks": left_clicks,
            "crossFramePresses": cross_frame,
            "hudPassthrough": 0,
            "attackInput": attack_input,
            "segments": segments,
        },
        "windowInvariants": {
            stage: {
                "actors": 20,
                "slots": 20,
                "ally": 10,
                "enemy": 10,
                "fullFormation": True,
                "hudExact": True,
                "hudCollisions": 0,
                "viewportViolations": 0,
                "layoutIdentity": LAYOUT_IDENTITY,
            }
            for stage in ("pre_windows", "post_windows")
        },
        "reviewOnlyMountWidthOnly": True,
        "reviewOnlyMountSlotCollisionClaimed": False,
        "ordinaryBattleContainsMount": False,
    }


def _write_manifest(root: Path, paths: Sequence[Path]) -> Path:
    return CORE._write_sha256_manifest(root, paths)


def _capture_into(
    *,
    args: argparse.Namespace,
    run_id: str,
    run_dir: Path,
) -> Path:
    timeout_seconds = float(args.timeout_seconds)
    if not math.isfinite(timeout_seconds) or timeout_seconds <= 0:
        raise Phase403BattleLayoutPerfError(
            "--timeout-seconds必须是有限正数"
        )
    try:
        godot = CORE._require_executable(args.godot, label="Godot")
    except CORE.PetManagementRecordingError as error:
        raise Phase403BattleLayoutPerfError(str(error)) from error
    temporary_dir = run_dir / "tmp"
    temporary_dir.mkdir(parents=False, exist_ok=False)
    base_environment = CORE._isolated_environment(temporary_dir)
    command = _build_godot_command(godot=godot)
    log_path = run_dir / "godot-perf.log"
    lane_evidence = CORE._run_official_lane_godot_sequence(
        run_dir=run_dir,
        godot=godot,
        base_environment=base_environment,
        native_command=command,
        native_log=log_path,
        native_log_validator=_validate_godot_log,
        timeout_seconds=timeout_seconds,
    )
    result = lane_evidence["native"]["logValidation"]
    summary_path = run_dir / "summary.json"
    summary = {
        "schemaVersion": REPORT_SCHEMA_VERSION,
        "reportType": REPORT_TYPE,
        "status": "passed",
        "finalStatusAuthority": True,
        "finalStatusAuthorityRequires": {
            "artifact": CORE._repo_relative(run_dir / "SHA256SUMS"),
            "writtenAfterSummary": True,
            "coversThisSummary": True,
            "failureSummaryAbsent": True,
        },
        "runId": run_id,
        "generatedAtUtc": _utc_now().isoformat().replace("+00:00", "Z"),
        "scene": MAIN_SCENE,
        "captureFlag": DIAGNOSTIC.CAPTURE_FLAG,
        "perfCaptureFlag": PERF_CAPTURE_FLAG,
        "command": CORE._redacted_command(command),
        "isolation": {
            "laneFreshAtRecorderStart": True,
            "normalPlayerSavePathUsed": False,
            "containmentScope": CORE.CONTAINMENT_SCOPE,
            "qaLane": {
                "lane": CORE.QA_LANE,
                "owner": lane_evidence["session"]["owner"],
                "feature": CORE.QA_LANE_FEATURE,
                "customUserDirName": CORE.QA_LANE_CUSTOM_USER_DIR_NAME,
                "laneRoot": lane_evidence["session"]["godotLaneRoot"],
                "realRoot": lane_evidence["session"]["godotRealRoot"],
                "realBeforeSha256": lane_evidence["session"][
                    "realInventorySha256"
                ],
            },
            "temporaryDirectory": CORE._repo_relative(temporary_dir),
            "backendProcessStartedByTool": False,
            "mysqlAccessByTool": False,
            "profileSaveEnabled": False,
        },
        "preflight": lane_evidence["preflight"],
        "sourceCheck": lane_evidence["sourceCheck"],
        "initialVerification": lane_evidence["initialVerification"],
        "native": lane_evidence["native"],
        "qaLaneCleanup": lane_evidence["cleanup"],
        "postCleanupInspect": lane_evidence["postCleanupInspect"],
        "laneLifecycle": CORE._artifact_record(lane_evidence["lifecyclePath"]),
        "ownerEvidence": CORE._artifact_record(
            lane_evidence["ownerEvidencePath"]
        ),
        "result": result,
        "log": CORE._artifact_record(log_path),
        "sha256Manifest": {
            "path": CORE._repo_relative(run_dir / "SHA256SUMS"),
            "coversAllRetainedEvidenceFiles": True,
            "writtenLast": True,
        },
    }
    CORE._write_json(summary_path, summary)
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
    print(
        json.dumps(
            {
                "status": "passed",
                "runId": run_id,
                "summary": CORE._repo_relative(summary_path),
                "manifest": CORE._repo_relative(run_dir / "SHA256SUMS"),
            },
            ensure_ascii=False,
        ),
        flush=True,
    )
    _write_manifest(run_dir, hash_paths)
    return summary_path


def _write_failure_summary(
    run_dir: Path,
    *,
    run_id: str,
    error: BaseException,
) -> bool:
    lifecycle: Any = None
    lifecycle_read_error: dict[str, Any] | None = None
    lifecycle_path = run_dir / "qa-lane-lifecycle.json"
    try:
        if lifecycle_path.is_file():
            with lifecycle_path.open("r", encoding="utf-8", newline="") as stream:
                lifecycle = json.load(stream)
            if not isinstance(lifecycle, dict):
                raise ValueError("QA lane lifecycle authority不是JSON object")
    except BaseException as read_error:
        lifecycle = None
        lifecycle_read_error = CORE._failure_envelope(read_error)
    supersedes_summary: dict[str, Any] | None = None
    summary_path = run_dir / "summary.json"
    try:
        if summary_path.is_file():
            supersedes_summary = CORE._artifact_record(summary_path)
    except BaseException as summary_error:
        supersedes_summary = {
            "path": CORE._repo_relative(summary_path),
            "readError": CORE._failure_envelope(summary_error),
        }
    try:
        CORE._write_secure_json(
            run_dir / "failure-summary.json",
            {
                "schemaVersion": REPORT_SCHEMA_VERSION,
                "reportType": REPORT_TYPE,
                "status": "failed",
                "finalStatusAuthority": True,
                "supersedesSummary": supersedes_summary,
                "runId": run_id,
                "generatedAtUtc": _utc_now().isoformat().replace("+00:00", "Z"),
                **CORE._failure_envelope(error),
                "evidenceDirectoryPreserved": True,
                "qaLane": lifecycle,
                "qaLaneReadError": lifecycle_read_error,
                "sha256Manifest": {
                    "path": CORE._repo_relative(run_dir / "SHA256SUMS"),
                    "writeAttemptedAfterSummary": True,
                    "successNotClaimedByFailureSummary": True,
                },
            },
            exclusive=True,
        )
    except BaseException:
        return False
    return True


def _capture(args: argparse.Namespace) -> Path:
    if Path.cwd().resolve() != REPO_ROOT:
        raise Phase403BattleLayoutPerfError(
            f"必须从仓库根执行：cd {REPO_ROOT}"
        )
    if not GODOT_PROJECT.is_dir():
        raise Phase403BattleLayoutPerfError(
            f"Godot项目不存在：{GODOT_PROJECT}"
        )
    _require_perf_wiring()
    run_id = args.run_id or _new_run_id()
    if SAFE_RUN_ID.fullmatch(run_id) is None:
        raise Phase403BattleLayoutPerfError(f"不安全的runId：{run_id!r}")
    try:
        output_root = CORE._resolve_output_root(args.output_root)
    except CORE.PetManagementRecordingError as error:
        raise Phase403BattleLayoutPerfError(str(error)) from error
    output_root.mkdir(parents=True, exist_ok=True)
    run_dir = output_root / run_id
    run_dir.mkdir(parents=False, exist_ok=False)
    try:
        return _capture_into(args=args, run_id=run_id, run_dir=run_dir)
    except BaseException as error:
        failure_summary_written = _write_failure_summary(
            run_dir,
            run_id=run_id,
            error=error,
        )
        if failure_summary_written:
            try:
                retained = sorted(
                    (
                        path
                        for path in run_dir.rglob("*")
                        if path.is_file()
                        and path.name != "SHA256SUMS"
                        and path.relative_to(run_dir).parts[0] != "tmp"
                    ),
                    key=lambda path: str(path.relative_to(run_dir)),
                )
                if retained:
                    _write_manifest(run_dir, retained)
            except BaseException:
                pass
        else:
            try:
                (run_dir / "SHA256SUMS").unlink()
                CORE._fsync_parent_directory(run_dir / "SHA256SUMS")
            except FileNotFoundError:
                pass
            except BaseException:
                pass
        raise


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "采集Phase403真实Main正式20人战斗idle、指令选择、相邻目标切换"
            "的fps/process_total/draw_battle/frame interval证据。"
        )
    )
    parser.add_argument("--run-id", help="可选唯一安全runId。")
    parser.add_argument(
        "--output-root",
        type=Path,
        default=DEFAULT_OUTPUT_ROOT,
    )
    parser.add_argument("--godot", default=os.environ.get("GODOT_BIN", "godot"))
    parser.add_argument("--timeout-seconds", type=float, default=180.0)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        _capture(args)
    except KeyboardInterrupt:
        print("phase403 battle layout perf interrupted", file=sys.stderr)
        return 130
    except (
        Phase403BattleLayoutPerfError,
        CORE.PetManagementRecordingError,
        FileExistsError,
        OSError,
        ValueError,
    ) as error:
        print(f"phase403 battle layout perf failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
