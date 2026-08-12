#!/usr/bin/env python3
"""Record the Phase403 formal 10v10 layout through the real Main scene.

The tool is intentionally a thin, fail-closed wrapper around the repository's
existing 1280x720 H264/AAC Movie Maker helpers. It fixes the dedicated
Phase403 flag, runs native and movie phases through the owner-attested QA
lane, validates every runtime marker, and commits the final Phase403 summary
before the atomic SHA256 manifest.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import math
import os
import re
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Sequence


REPO_ROOT = Path(__file__).resolve().parents[1]
CORE_PATH = REPO_ROOT / "tools" / "record_pet_management_owner_review.py"
CORE_SPEC = importlib.util.spec_from_file_location(
    "_beastbound_phase403_media_core",
    CORE_PATH,
)
if CORE_SPEC is None or CORE_SPEC.loader is None:
    raise RuntimeError(f"无法加载媒体录制核心：{CORE_PATH}")
CORE = importlib.util.module_from_spec(CORE_SPEC)
CORE_SPEC.loader.exec_module(CORE)

GODOT_PROJECT = REPO_ROOT / "client" / "godot"
MAIN_SCENE = "res://scenes/Main.tscn"
MAIN_SCRIPT_PATH = GODOT_PROJECT / "scripts" / "main.gd"
COMMAND_VIEW_SCRIPT_PATH = (
    GODOT_PROJECT / "scripts" / "ui" / "battle_command_awakened_view.gd"
)
COMMAND_HOST_SCRIPT_PATH = (
    GODOT_PROJECT / "scripts" / "ui" / "battle_command_awakened_host.gd"
)
CAPTURE_SCRIPT_PATH = (
    GODOT_PROJECT
    / "scripts"
    / "qa"
    / "battle_layout_owner_review_capture.gd"
)
ARENA_CATALOG_SCRIPT_PATH = (
    GODOT_PROJECT / "scripts" / "battle" / "battle_arena_visual_catalog.gd"
)
CAPTURE_FLAG = "--phase403-battle-layout-owner-review-capture"
DEFAULT_OUTPUT_ROOT = Path(
    ".run/evidence/phase403_battle_layout_owner_review"
)
REPORT_SCHEMA_VERSION = 2
REPORT_TYPE = "beastbound_phase403_battle_layout_main_owner_review_video"
LAYOUT_IDENTITY = "phase403_grid1280_o94x340p4_l152x52_r64xm48_e132x164"
EXPECTED_CHAPTERS = (
    "formal_idle",
    "command_selection_a",
    "adjacent_target_a",
    "command_selection_b",
    "adjacent_target_b",
)
EXPECTED_TARGETS = (
    ("enemy_front_4", "enemy.front.4"),
    ("enemy_front_5", "enemy.front.5"),
)
EXPECTED_LEFT_CLICKS = 5
EXPECTED_ATTACK_ROUTE_STAGES = (
    "press_sync",
    "pre_release",
    "release_sync",
    "release_process",
    "release_post_draw",
    "release_next_loop_post_draw",
)
MIN_DURATION_SECONDS = 12.0
MAX_DURATION_SECONDS = 45.0
DEFAULT_SAMPLE_COUNT = 10
MAX_SAMPLE_COUNT = 16
SAFE_RUN_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")

START_MARKER = "PHASE403_BATTLE_LAYOUT_OWNER_REVIEW_START"
CHAPTER_MARKER = "PHASE403_BATTLE_LAYOUT_OWNER_REVIEW_CHAPTER"
FIXTURE_MARKER = "PHASE403_BATTLE_LAYOUT_FIXTURE"
LAYOUT_MARKER = "PHASE403_BATTLE_LAYOUT_IDENTITY"
TARGET_MARKER = "PHASE403_BATTLE_LAYOUT_TARGET"
REVIEW_ONLY_MARKER = "PHASE403_BATTLE_LAYOUT_REVIEW_ONLY"
END_MARKER = "PHASE403_BATTLE_LAYOUT_OWNER_REVIEW_END"
FAILURE_MARKER = "PHASE403_BATTLE_LAYOUT_OWNER_REVIEW_FAILED"
ATTACK_INPUT_BEFORE_MARKER = "PHASE403_BATTLE_LAYOUT_ATTACK_INPUT_BEFORE"
ATTACK_INPUT_AFTER_MARKER = "PHASE403_BATTLE_LAYOUT_ATTACK_INPUT_AFTER"
ARENA_MARKER = "PHASE412_BATTLE_ARENA_VISUAL"
EXPECTED_ARENA_ID = "moss_meadow"
EXPECTED_ARENA_BUNDLE_ID = "battle_review_arenas_v1"
EXPECTED_ARENA_SHA256 = (
    "215210ead48013359fe16cf0d4043811d4ef86d160cbedcdc08c1f11c0effa69"
)


class Phase403BattleLayoutRecordingError(RuntimeError):
    """The formal real-Main Phase403 recording contract failed."""


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _new_run_id() -> str:
    timestamp = _utc_now().strftime("%Y%m%dT%H%M%S.%fZ")
    return f"phase403-battle-layout-{timestamp}-{uuid.uuid4().hex[:8]}"


def _parse_fields(line: str) -> dict[str, str]:
    fields: dict[str, str] = {}
    for match in re.finditer(
        r"\b([A-Za-z][A-Za-z0-9_]*)=([^\s]+)",
        line,
    ):
        key = match.group(1)
        if key in fields:
            raise Phase403BattleLayoutRecordingError(
                f"Phase403日志字段重复：{key}"
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
                raise Phase403BattleLayoutRecordingError(
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
    except Phase403BattleLayoutRecordingError:
        raise
    except (json.JSONDecodeError, ValueError) as error:
        raise Phase403BattleLayoutRecordingError(
            f"{label}不是严格JSON"
        ) from error


def _require_bool(fields: dict[str, str], key: str, expected: bool) -> None:
    expected_text = "true" if expected else "false"
    if fields.get(key, "").lower() != expected_text:
        raise Phase403BattleLayoutRecordingError(
            f"Phase403日志字段{key}必须为{expected_text}"
        )


def _require_int(fields: dict[str, str], key: str) -> int:
    try:
        return int(fields[key])
    except (KeyError, ValueError) as error:
        raise Phase403BattleLayoutRecordingError(
            f"Phase403日志缺少整数字段{key}"
        ) from error


def _require_positive_finite_float(fields: dict[str, str], key: str) -> float:
    try:
        value = float(fields[key])
    except (KeyError, ValueError) as error:
        raise Phase403BattleLayoutRecordingError(
            f"Phase403日志字段{key}必须为有限正数"
        ) from error
    if not math.isfinite(value) or value <= 0.0:
        raise Phase403BattleLayoutRecordingError(
            f"Phase403日志字段{key}必须为有限正数"
        )
    return value


def _validate_arena_visual_marker(line: str) -> dict[str, Any]:
    fields = _parse_fields(line)
    expected = {
        "id": EXPECTED_ARENA_ID,
        "bundle": EXPECTED_ARENA_BUNDLE_ID,
        "source_map": "firebud_village_gate",
        "sha256": EXPECTED_ARENA_SHA256,
        "viewport": "1280x720",
        "owner_review": "pending",
    }
    if any(fields.get(key) != value for key, value in expected.items()):
        raise Phase403BattleLayoutRecordingError(
            "Phase412战场候选ID、来源地图、哈希、尺寸或生命周期漂移"
        )
    for key in ("qa_preview", "explicit_capture"):
        _require_bool(fields, key, True)
    for key in (
        "runtime_enabled",
        "release_approved",
        "ordinary_player_enabled",
        "review_lab",
        "baked_actors",
    ):
        _require_bool(fields, key, False)
    return {
        "id": EXPECTED_ARENA_ID,
        "bundleId": EXPECTED_ARENA_BUNDLE_ID,
        "sourceMapId": "firebud_village_gate",
        "sha256": EXPECTED_ARENA_SHA256,
        "width": 1280,
        "height": 720,
        "ownerReviewStatus": "pending",
        "runtimeEnabled": False,
        "releaseApproved": False,
        "qaPreviewEnabled": True,
        "explicitCaptureOnly": True,
        "ordinaryPlayerEnabled": False,
        "reviewLab": False,
        "bakedActors": False,
    }


def _build_godot_command(
    *,
    godot: str,
    avi_path: Path,
    extra_args: Sequence[str] = (),
) -> list[str]:
    if extra_args:
        raise Phase403BattleLayoutRecordingError(
            "Phase403正式战斗布局录像不接受附加Godot参数"
        )
    try:
        return CORE._build_godot_command(
            godot=godot,
            avi_path=avi_path,
            capture_flag=CAPTURE_FLAG,
            review_args=(),
        )
    except CORE.PetManagementRecordingError as error:
        raise Phase403BattleLayoutRecordingError(str(error)) from error


def _build_native_godot_command(
    *,
    godot: str,
    extra_args: Sequence[str] = (),
) -> list[str]:
    if extra_args:
        raise Phase403BattleLayoutRecordingError(
            "Phase403正式战斗布局原生验收不接受附加Godot参数"
        )
    try:
        return CORE._build_native_godot_command(
            godot=godot,
            capture_flag=CAPTURE_FLAG,
            review_args=(),
        )
    except CORE.PetManagementRecordingError as error:
        raise Phase403BattleLayoutRecordingError(str(error)) from error


def _require_frame_size_normalization_contract(capture_source: str) -> None:
    required_patterns = (
        r"const\s+INVALID_FRAME_SIZE\s*:=\s*Vector2i\(-1,\s*-1\)",
        r"func\s+_normalized_frame_size\(value\)\s*->\s*Vector2i:",
        r"if\s+not\s+\(value\s+is\s+Array\):\s*"
        r"return\s+INVALID_FRAME_SIZE",
        r"if\s+values\.size\(\)\s*!=\s*2:\s*"
        r"return\s+INVALID_FRAME_SIZE",
        r"not\s+\(raw_value\s+is\s+int\s+or\s+raw_value\s+is\s+float\)",
        r"not\s+is_finite\(numeric_value\)",
        r"not\s+is_equal_approx\(numeric_value,\s*roundf\(numeric_value\)\)",
        r"_normalized_frame_size\(character_meta\.get\("
        r'"sourceFrameSize",\s*\[\]\)\)\s*!=\s*Vector2i\(512,\s*512\)',
        r"_normalized_frame_size\(character_meta\.get\("
        r'"runtimeFrameSize",\s*\[\]\)\)\s*!=\s*Vector2i\(256,\s*256\)',
        r"_normalized_frame_size\(\s*\(pet_identity\s+as\s+Dictionary\)"
        r'\.get\("sourceFrameSize",\s*\[\]\)\s*\)\s*'
        r"!=\s*Vector2i\(512,\s*512\)",
        r"_normalized_frame_size\(pet_meta\.get\("
        r'"runtimeFrameSize",\s*\[\]\)\)\s*!=\s*Vector2i\(256,\s*256\)',
    )
    if any(
        re.search(pattern, capture_source, flags=re.MULTILINE) is None
        for pattern in required_patterns
    ):
        raise Phase403BattleLayoutRecordingError(
            "Phase403 fixture尺寸必须以两元素数值数组归一为Vector2i后精确比较"
        )
    if re.search(
        r'(?:sourceFrameSize|runtimeFrameSize)",\s*\[\]\)\s*'
        r"!=\s*\[(?:256|512),\s*(?:256|512)\]",
        capture_source,
        flags=re.MULTILINE,
    ):
        raise Phase403BattleLayoutRecordingError(
            "Phase403 fixture不得直接比较JSON数字Array与整数字面Array"
        )


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
        r'if\s+not\s+_assert_owner_review_arena_visual_contract\(\):\s*'
        r'return\s+false\s*'
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
        raise Phase403BattleLayoutRecordingError(
            "Phase403正式20人fixture必须绑定active battle pet并首帧失败关闭"
        )
    if re.search(
        r'state\["(?:reviewLab|serverAuthority)"\]\s*=\s*true',
        capture_source,
    ):
        raise Phase403BattleLayoutRecordingError(
            "Phase403正式战斗fixture不得绕过Main本地队伍归一化"
        )


def _require_player_command_union_contract(capture_source: str) -> None:
    hud_contract_source = _gdscript_function_source(
        capture_source,
        "_assert_actual_hud_rects",
    )
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
        raise Phase403BattleLayoutRecordingError(
            "Phase403人物十指令必须由公开command buttons与input blockers去重闭合"
        )
    if "visible_blockers < 8" in capture_source:
        raise Phase403BattleLayoutRecordingError(
            "Phase403不得把input_blockers误当全部人物指令"
        )


def _gdscript_function_source(source: str, function_name: str) -> str:
    start_match = re.search(
        rf"(?m)^func\s+{re.escape(function_name)}\(",
        source,
    )
    if start_match is None:
        raise Phase403BattleLayoutRecordingError(
            f"Phase403点击诊断缺少{function_name}"
        )
    next_match = re.search(r"(?m)^func\s+", source[start_match.end() :])
    end = (
        len(source)
        if next_match is None
        else start_match.end() + next_match.start()
    )
    return source[start_match.start() : end]


def _require_host_property_cache_contract(capture_source: str) -> None:
    for function_name in (
        "_cache_host_property_names",
        "_host_property",
        "_set_host_property",
    ):
        if len(
            re.findall(
                rf"(?m)^func\s+{re.escape(function_name)}\(",
                capture_source,
            )
        ) != 1:
            raise Phase403BattleLayoutRecordingError(
                "Phase403 Main属性名缓存helper必须完整且唯一"
            )
    prepare_source = _gdscript_function_source(
        capture_source,
        "_prepare_real_main_battle",
    )
    cache_source = _gdscript_function_source(
        capture_source,
        "_cache_host_property_names",
    )
    getter_source = _gdscript_function_source(capture_source, "_host_property")
    setter_source = _gdscript_function_source(
        capture_source,
        "_set_host_property",
    )
    cache_fragments = (
        "if _host_property_cache_ready:",
        "for raw_property in host.get_property_list():",
        'var property_name := str((raw_property as Dictionary).get("name", ""))',
        "property_names[property_name] = true",
        "_host_property_names = property_names",
        "_host_property_cache_ready = true",
    )
    cache_call_offset = prepare_source.find("if not _cache_host_property_names():")
    property_access_offsets = [
        offset
        for offset in (
            prepare_source.find("_host_property("),
            prepare_source.find("_set_host_property("),
        )
        if offset >= 0
    ]
    first_property_access = min(property_access_offsets, default=-1)
    if (
        capture_source.count("get_property_list") != 1
        or cache_source.count("get_property_list") != 1
        or any(fragment not in cache_source for fragment in cache_fragments)
        or "get_property_list" in getter_source
        or "get_property_list" in setter_source
        or "_host_property_names.has(property_name)" not in getter_source
        or "_host_property_names.has(property_name)" not in setter_source
        or 'host.get(property_name) if _host_property_names.has(property_name)'
        not in getter_source
        or cache_call_offset < 0
        or first_property_access < 0
        or cache_call_offset >= first_property_access
    ):
        raise Phase403BattleLayoutRecordingError(
            "Phase403 Main属性只允许准备期单次建名缓存，热路径必须实时get/set"
        )


def _require_perf_evidence_contract(capture_source: str) -> None:
    _require_host_property_cache_contract(capture_source)
    helper_names = (
        "_cache_host_property_names",
        "_perf_environment_snapshot",
        "_wait_for_perf_foreground_focus",
        "_print_perf_environment",
        "_begin_perf_frame_sampling",
        "_capture_perf_process_frame",
        "_disconnect_perf_frame_sampler",
        "_wait_for_perf_sample_duration",
        "_end_perf_frame_sampling",
        "_reset_perf_segments",
        "_record_perf_qa_sync_wall",
        "_record_perf_input_dispatch_wall",
        "_record_perf_operation_wall",
        "_packed_ints_as_array",
        "_operation_wall_samples",
        "_print_perf_target_markers",
        "_print_perf_segments",
        "_host_property",
        "_set_host_property",
    )
    if any(
        len(
            re.findall(
                rf"(?m)^func\s+{re.escape(function_name)}\(",
                capture_source,
            )
        )
        != 1
        for function_name in helper_names
    ):
        raise Phase403BattleLayoutRecordingError(
            "Phase403性能证据缓存、逐帧时钟和分段helper必须完整且唯一"
        )

    prepare_source = _gdscript_function_source(
        capture_source,
        "_prepare_real_main_battle",
    )
    run_source = _gdscript_function_source(capture_source, "_run_perf_capture")
    cache_source = _gdscript_function_source(
        capture_source,
        "_cache_host_property_names",
    )
    getter_source = _gdscript_function_source(capture_source, "_host_property")
    setter_source = _gdscript_function_source(
        capture_source,
        "_set_host_property",
    )
    environment_source = _gdscript_function_source(
        capture_source,
        "_perf_environment_snapshot",
    )
    environment_print_source = _gdscript_function_source(
        capture_source,
        "_print_perf_environment",
    )
    foreground_source = _gdscript_function_source(
        capture_source,
        "_wait_for_perf_foreground_focus",
    )
    begin_source = _gdscript_function_source(
        capture_source,
        "_begin_perf_frame_sampling",
    )
    frame_source = _gdscript_function_source(
        capture_source,
        "_capture_perf_process_frame",
    )
    disconnect_source = _gdscript_function_source(
        capture_source,
        "_disconnect_perf_frame_sampler",
    )
    wait_source = _gdscript_function_source(
        capture_source,
        "_wait_for_perf_sample_duration",
    )
    end_source = _gdscript_function_source(
        capture_source,
        "_end_perf_frame_sampling",
    )
    segment_source = _gdscript_function_source(
        capture_source,
        "_print_perf_segments",
    )
    reset_source = _gdscript_function_source(
        capture_source,
        "_reset_perf_segments",
    )
    target_click_source = _gdscript_function_source(
        capture_source,
        "_click_exact_target",
    )
    target_marker_source = _gdscript_function_source(
        capture_source,
        "_print_perf_target_markers",
    )
    operation_source = _gdscript_function_source(
        capture_source,
        "_record_perf_operation_wall",
    )
    left_click_source = _gdscript_function_source(
        capture_source,
        "_left_click_point",
    )

    required_constants = (
        "const PERF_TARGET_SWITCH_COUNT := 8",
        "const PERF_FRAME_SAMPLE_LIMIT := 600",
        'const PERF_ENVIRONMENT_MARKER := '
        '"PHASE403_BATTLE_LAYOUT_PERF_ENVIRONMENT"',
        'const PERF_RAW_FRAME_MARKER := '
        '"PHASE403_BATTLE_LAYOUT_PERF_RAW_FRAMES"',
        'const PERF_SEGMENTS_MARKER := '
        '"PHASE403_BATTLE_LAYOUT_PERF_SEGMENTS"',
        'const PERF_INVARIANT_MARKER := '
        '"PHASE403_BATTLE_LAYOUT_PERF_INVARIANT"',
    )
    cache_fragments = (
        "if _host_property_cache_ready:",
        "for raw_property in host.get_property_list():",
        'var property_name := str((raw_property as Dictionary).get("name", ""))',
        "property_names[property_name] = true",
        "_host_property_names = property_names",
        "_host_property_cache_ready = true",
    )
    environment_fragments = (
        '"snapshotScope": "start_end_only"',
        '"displayServer": DisplayServer.get_name()',
        '"vsyncMode": int(DisplayServer.window_get_vsync_mode())',
        '"windowFocused": DisplayServer.window_is_focused()',
        '"windowMode": int(DisplayServer.window_get_mode())',
        '"windowSize": [window_size.x, window_size.y]',
        '"screenRefreshHz": screen_refresh_hz',
        '"screenRefreshKnown": screen_refresh_hz > 0.0',
        '"maxFps": Engine.max_fps',
        '"physicsTicksPerSecond": Engine.physics_ticks_per_second',
        '"timeScale": Engine.time_scale',
        '"renderingMethod": RenderingServer.get_current_rendering_method()',
        '"renderingDriver": RenderingServer.get_current_rendering_driver_name()',
        '"videoAdapter": RenderingServer.get_video_adapter_name()',
        '"hostPropertyCacheReady": _host_property_cache_ready',
    )
    begin_fragments = (
        "_perf_sample_started_usec = Time.get_ticks_usec()",
        "_perf_sample_started_frame = Engine.get_process_frames()",
        "_perf_sample_count = 0",
        "_perf_frame_pairs = PackedInt64Array()",
        "_perf_frame_pairs.resize(PERF_FRAME_SAMPLE_LIMIT * 2)",
        "host.get_tree().process_frame.connect(sampler)",
        "_perf_sampler_connected = true",
    )
    frame_fragments = (
        "var process_frame: int = Engine.get_process_frames()",
        "var ticks_usec: int = Time.get_ticks_usec()",
        "process_frame <= _perf_sample_previous_frame",
        "ticks_usec <= _perf_sample_previous_usec",
        "if _perf_sample_count < PERF_FRAME_SAMPLE_LIMIT:",
        "var pair_index: int = _perf_sample_count * 2",
        "_perf_frame_pairs[pair_index] = process_frame",
        "_perf_frame_pairs[pair_index + 1] = ticks_usec",
        "_perf_sample_count += 1",
        "_perf_sample_dropped += 1",
    )
    frame_call_targets = set(
        re.findall(
            r"(?<![A-Za-z0-9_.])([A-Za-z_][A-Za-z0-9_.]*)\s*\(",
            frame_source.split("\n", 1)[1],
        )
    )
    allowed_frame_call_targets = {
        "if",
        "and",
        "Engine.get_process_frames",
        "Time.get_ticks_usec",
    }
    canonical_frame_source = (
        "func _capture_perf_process_frame() -> void:\n"
        '\tif _perf_sample_state == "":\n'
        "\t\treturn\n"
        "\tvar process_frame: int = Engine.get_process_frames()\n"
        "\tvar ticks_usec: int = Time.get_ticks_usec()\n"
        "\tif (\n"
        "\t\t_perf_sample_previous_frame >= 0\n"
        "\t\tand (\n"
        "\t\t\tprocess_frame <= _perf_sample_previous_frame\n"
        "\t\t\tor ticks_usec <= _perf_sample_previous_usec\n"
        "\t\t)\n"
        "\t):\n"
        "\t\t_perf_sample_monotonic = false\n"
        "\tif _perf_sample_count < PERF_FRAME_SAMPLE_LIMIT:\n"
        "\t\tvar pair_index: int = _perf_sample_count * 2\n"
        "\t\t_perf_frame_pairs[pair_index] = process_frame\n"
        "\t\t_perf_frame_pairs[pair_index + 1] = ticks_usec\n"
        "\t\t_perf_sample_count += 1\n"
        "\telse:\n"
        "\t\t_perf_sample_dropped += 1\n"
        "\t_perf_sample_previous_frame = process_frame\n"
        "\t_perf_sample_previous_usec = ticks_usec"
    )
    end_fragments = (
        "var disconnected := _disconnect_perf_frame_sampler()",
        "var ended_usec: int = Time.get_ticks_usec()",
        "var ended_frame: int = Engine.get_process_frames()",
        '"clock": "Time.get_ticks_usec"',
        '"sampleLimit": PERF_FRAME_SAMPLE_LIMIT',
        '"sampleCount": sample_count',
        '"droppedCount": _perf_sample_dropped',
        '"startedUsec": _perf_sample_started_usec',
        '"endedUsec": ended_usec',
        '"durationUsec": duration_usec',
        '"startedFrame": _perf_sample_started_frame',
        '"endedFrame": ended_frame',
        '"monotonic": _perf_sample_monotonic',
        '"samplerDisconnected": disconnected',
        '"pairs": pair_values',
        'print("%s %s" % [PERF_RAW_FRAME_MARKER, JSON.stringify(payload)])',
        "duration_usec < int(PERF_STATE_SECONDS * 1000000.0)",
        "duration_usec > int((PERF_STATE_SECONDS + 1.8) * 1000000.0)",
    )
    wait_fragments = (
        "_perf_sample_started_usec",
        "int(PERF_STATE_SECONDS * 1000000.0)",
        "while Time.get_ticks_usec() < target_usec:",
        "await host.get_tree().process_frame",
    )
    segment_fragments = (
        '"realLeftClickCount": completed_switches * 3',
        '"qaSyncWallUsec": _perf_qa_sync_wall_usec',
        '"qaSyncSampleCount": _perf_qa_sample_count',
        '"qaCoverage": "instrumented_sync_sections_only"',
        '"inputDispatchWallUsec": '
        '_perf_input_dispatch_wall_usec.duplicate(true)',
        '"inputDispatchEventCounts": '
        '_perf_input_dispatch_counts.duplicate(true)',
        '"operationWallUsec": {',
        '"operationBoundaryUsec": {',
        '"operationBoundaryClockAbsolute": true',
        '"operationWallIncludesFrameWaits": true',
        '"targetMarkersBufferedUntilAfterRaw": true',
        '"layoutTimingAvailable": false',
        '"layoutTimingUnavailableReason": "product_not_instrumented"',
        'print("%s %s" % [PERF_SEGMENTS_MARKER, JSON.stringify(payload)])',
        'int(_perf_input_dispatch_counts.get("motion", 0)) != expected_clicks',
        'int(_perf_input_dispatch_counts.get("press", 0)) != expected_clicks',
        'int(_perf_input_dispatch_counts.get("release", 0)) != expected_clicks',
        "_perf_qa_sample_count != PERF_TARGET_SWITCH_COUNT * 20",
    )
    if (
        any(fragment not in capture_source for fragment in required_constants)
        or capture_source.count("get_property_list") != 1
        or cache_source.count("get_property_list") != 1
        or any(fragment not in cache_source for fragment in cache_fragments)
        or any(
            "get_property_list" in source
            for source in (getter_source, setter_source, run_source)
        )
        or "_host_property_names.has(property_name)" not in getter_source
        or "_host_property_names.has(property_name)" not in setter_source
        or 'host.get(property_name) if _host_property_names.has(property_name)'
        not in getter_source
        or "if not _cache_host_property_names():" not in prepare_source
        or any(
            fragment not in environment_source
            for fragment in environment_fragments
        )
        or 'print("%s %s" % [PERF_ENVIRONMENT_MARKER, JSON.stringify(snapshot)])'
        not in environment_print_source
        or "DisplayServer.VSYNC_ENABLED" not in environment_print_source
        or "DisplayServer.WINDOW_MODE_WINDOWED" not in environment_print_source
        or 'bool(snapshot.get("screenRefreshKnown", false))'
        not in environment_print_source
        or "!= (refresh_hz > 0.0)" not in environment_print_source
        or "refresh_hz <= 0.0" in environment_print_source
        or 'int(snapshot.get("physicsTicksPerSecond", 0)) != 60'
        not in environment_print_source
        or 'is_equal_approx(float(snapshot.get("timeScale", 0.0)), 1.0)'
        not in environment_print_source
        or 'str(snapshot.get("renderingMethod", "")) != "mobile"'
        not in environment_print_source
        or 'str(snapshot.get("renderingDriver", "")).to_lower() != "metal"'
        not in environment_print_source
        or 'str(snapshot.get("videoAdapter", "")).strip_edges() == ""'
        not in environment_print_source
        or any(fragment not in begin_source for fragment in begin_fragments)
        or any(fragment not in frame_source for fragment in frame_fragments)
        or frame_source.strip() != canonical_frame_source
        or not frame_call_targets.issubset(allowed_frame_call_targets)
        or any(
            forbidden in frame_source
            for forbidden in (
                ".append(",
                ".resize(",
                "print(",
                "JSON.",
                "host.",
                "await ",
                "DisplayServer",
                "RenderingServer",
                "get_property_list",
                "_host_property(",
                "_assert_live_layout_contract",
                "Callable(",
                ".call(",
                ".callv(",
                ".get(",
            )
        )
        or len(
            re.findall(
                r"(?m)^\s*_perf_frame_pairs\[[^\]]+\]\s*=",
                frame_source,
            )
        )
        != 2
        or re.search(
            r"(?m)^\s*(?:process_frame|ticks_usec)\s*=",
            frame_source,
        )
        is not None
        or "tree.process_frame.disconnect(sampler)" not in disconnect_source
        or any(fragment not in wait_source for fragment in wait_fragments)
        or run_source.count("await _wait_for_perf_sample_duration()") != 3
        or "create_timer(PERF_STATE_SECONDS)" in run_source
        or any(fragment not in end_source for fragment in end_fragments)
        or any(fragment not in segment_source for fragment in segment_fragments)
        or "_perf_target_marker_lines.clear()" not in reset_source
        or "_perf_target_marker_lines.resize(PERF_TARGET_SWITCH_COUNT)"
        not in reset_source
        or "boundaries.resize(PERF_TARGET_SWITCH_COUNT * 2)"
        not in reset_source
        or "boundaries[sample_index * 2] = started_usec"
        not in operation_source
        or "boundaries[sample_index * 2 + 1] = ended_usec"
        not in operation_source
        or "_perf_operation_sample_counts[kind] = sample_index + 1"
        not in operation_source
        or len(
            re.findall(
                r"(?m)^\s*boundaries\[[^\]]+\]\s*=",
                operation_source,
            )
        )
        != 2
        or operation_source.count(
            "_perf_operation_sample_counts[kind] = sample_index + 1"
        )
        != 1
        or ".append(" in operation_source
        or target_click_source.count(
            "_perf_target_marker_lines[index - 1] = marker_line"
        )
        != 1
        or target_click_source.count("print(marker_line)") != 1
        or (
            'if _perf_sample_state == "target_switch":\n'
            '\t\tif index < 1 or index > _perf_target_marker_lines.size():\n'
            '\t\t\t_fail_capture("性能目标marker index越界：%d" % index)\n'
            "\t\t\treturn\n"
            "\t\t_perf_target_marker_lines[index - 1] = marker_line\n"
            "\telse:\n"
            "\t\tprint(marker_line)"
        )
        not in target_click_source
        or target_marker_source.count("print(marker_line)") != 1
        or "for marker_line in _perf_target_marker_lines:"
        not in target_marker_source
        or left_click_source.count("Input.parse_input_event(") != 3
        or left_click_source.count(
            '_record_perf_input_dispatch_wall("motion"'
        )
        != 1
        or left_click_source.count(
            '_record_perf_input_dispatch_wall("press"'
        )
        != 1
        or left_click_source.count(
            '_record_perf_input_dispatch_wall("release"'
        )
        != 1
        or capture_source.count("_record_perf_qa_sync_wall(") < 8
        or "const PERF_FOREGROUND_TIMEOUT_MSEC := 3000" not in capture_source
        or "const PERF_FOREGROUND_RETRY_MSEC := 250" not in capture_source
        or foreground_source.count(
            "DisplayServer.window_move_to_foreground()"
        )
        != 1
        or foreground_source.count("DisplayServer.window_is_focused()") != 1
        or foreground_source.count("await tree.process_frame") != 1
        or "while Time.get_ticks_msec() - started_msec "
        "<= PERF_FOREGROUND_TIMEOUT_MSEC:" not in foreground_source
        or "PHASE403_BATTLE_LAYOUT_PERF_FOCUS" not in foreground_source
    ):
        raise Phase403BattleLayoutRecordingError(
            "Phase403性能证据必须缓存Main属性、限时取得前台并被动记录逐帧环境和输入分段"
        )

    ordered_run_fragments = (
        "if not _assert_live_layout_contract():",
        "if not _assert_review_only_mount_width_contract():",
        "if not await _wait_for_perf_foreground_focus():",
        '_print_perf_environment("start")',
        " stage=pre_windows actors=20 slots=20 ally=10 enemy=10 ",
        '_begin_perf_frame_sampling("idle")',
        "state=idle_begin",
        "await _wait_for_perf_sample_duration()",
        '_end_perf_frame_sampling("idle")',
        "state=idle_end",
        '_begin_perf_frame_sampling("command_selection")',
        "state=command_selection_begin",
        "await _wait_for_perf_sample_duration()",
        '_end_perf_frame_sampling("command_selection")',
        "state=command_selection_end",
        "_reset_perf_segments()",
        '_begin_perf_frame_sampling("target_switch")',
        "state=target_switch_begin",
        "for switch_index in range(PERF_TARGET_SWITCH_COUNT):",
        "await _click_exact_target(fixture, completed_switches + 1)",
        '_record_perf_operation_wall("target", operation_started_usec)',
        'await _click_pet_recall("性能目标切换撤回")',
        '_record_perf_operation_wall("recall", operation_started_usec)',
        'await _click_player_attack("性能目标切换攻击")',
        '_record_perf_operation_wall("attack", operation_started_usec)',
        "await _wait_for_perf_sample_duration()",
        '_end_perf_frame_sampling("target_switch")',
        "_print_perf_target_markers(completed_switches)",
        "_print_perf_segments(completed_switches)",
        "state=target_switch_end",
        "if not _assert_post_start_formation_contract():",
        "if not _assert_live_layout_contract():",
        " stage=post_windows actors=20 slots=20 ally=10 enemy=10 ",
        '_print_perf_environment("end")',
    )
    cursor = -1
    for fragment in ordered_run_fragments:
        cursor = run_source.find(fragment, cursor + 1)
        if cursor < 0:
            raise Phase403BattleLayoutRecordingError(
                "Phase403性能证据必须按环境→三raw窗口→分段→阶段外布局复验闭合"
            )
    for state in ("idle", "command_selection", "target_switch"):
        if (
            run_source.count(f'_begin_perf_frame_sampling("{state}")') != 1
            or run_source.count(f'_end_perf_frame_sampling("{state}")') != 1
        ):
            raise Phase403BattleLayoutRecordingError(
                f"Phase403 {state}逐帧采样窗口必须各且仅有一次"
            )
    if (
        run_source.count("_wait_for_perf_foreground_focus(") != 1
        or run_source.count("_print_perf_environment(") != 2
        or run_source.count("PERF_INVARIANT_MARKER") != 2
        or run_source.count("hud_collisions=0 ") != 3
        or run_source.count("viewport_violations=0 layout_identity=%s") != 2
        or run_source.count("_print_perf_target_markers(") != 1
        or 'completed_switches != PERF_TARGET_SWITCH_COUNT' not in run_source
        or 'switch_clicks != completed_switches * 3' not in run_source
        or 'or _actual_left_clicks != _cross_frame_presses' not in run_source
        or "runtime_environment=true pre_invariant=true post_invariant=true"
        not in run_source
    ):
        raise Phase403BattleLayoutRecordingError(
            "Phase403性能窗口必须精确8轮24次跨帧点击并复验20人HUD"
        )


def _require_attack_input_diagnostic_contract(
    capture_source: str,
    command_view_source: str,
    command_host_source: str,
    main_source: str,
) -> None:
    helper_names = (
        "_hovered_control_matches_target",
        "_attack_input_route_stage_snapshot",
        "_capture_attack_input_route_stage",
        "_attack_input_gui_left_button_count",
        "_attack_input_route_stage_delivered",
        "_capture_attack_input_delivery_boundary",
        "_matching_connection_count",
        "_matching_connection_flags",
        "_attack_product_connection_snapshot",
        "_install_attack_input_probe",
        "_on_attack_probe_button_down",
        "_on_attack_probe_button_up",
        "_on_attack_probe_pressed",
        "_on_attack_probe_view_command",
        "_on_attack_probe_gui_input",
        "_on_attack_probe_mouse_entered",
        "_on_attack_probe_mouse_exited",
        "_capture_attack_input_post_draw_states",
        "_disconnect_probe_signal",
        "_disconnect_attack_input_probe",
        "_attack_input_probe_context",
        "_attack_input_probe_result",
        "_attack_input_state_snapshot",
        "_attack_input_state_snapshot_with_point_classification",
        "_attack_input_common_state_ok",
        "_attack_input_precondition_ok",
        "_attack_input_postcondition_ok",
        "_attack_input_release_routing_classification",
        "_attack_input_classification",
    )
    if any(
        len(
            re.findall(
                rf"(?m)^func\s+{re.escape(function_name)}\(",
                capture_source,
            )
        )
        != 1
        for function_name in helper_names
    ):
        raise Phase403BattleLayoutRecordingError(
            "Phase403首个攻击点击诊断helper必须完整且唯一"
        )
    if any(
        forbidden in capture_source
        for forbidden in (
            "flush_buffered_events",
            "use_accumulated_input",
            "agile_event_flushing",
            "push_input",
            "emit_signal",
            ".emit(",
        )
    ):
        raise Phase403BattleLayoutRecordingError(
            "Phase403输入诊断不得改全局缓冲、切投递API或直接emit"
        )
    if (
        capture_source.count(
            '"PHASE403_BATTLE_LAYOUT_ATTACK_INPUT_BEFORE"'
        )
        != 1
        or capture_source.count(
            '"PHASE403_BATTLE_LAYOUT_ATTACK_INPUT_AFTER"'
        )
        != 1
    ):
        raise Phase403BattleLayoutRecordingError(
            "Phase403攻击点击诊断marker源码必须各且仅有一个"
        )
    required_fragments = (
        'call("visible_button_with_label", "攻击")',
        '(_view as Object).call("command_buttons")',
        '_host_property("battle_command_buttons")',
        'visible_attack == button',
        'view_attack == button',
        'host_attack == button',
        'var button_identity_exact: bool = (',
        '"buttonIdentityExact": button_identity_exact',
        'viewport.gui_get_hovered_control() as Control',
        'var hover_matches := _hovered_control_matches_target(',
        'if cursor == target_control:',
        'cursor = cursor.get_parent()',
        'input_probe["hoverMatchesTarget"] = hover_matches',
        'input_probe["hoveredPath"] = _control_path(hovered)',
        '"hoveredInstanceId"',
        '"hoveredMouseFilter"',
        '"hoveredZIndex"',
        'input_probe["uiPoint"] = bool(host.call("_is_ui_point", viewport_point))',
        'input_probe["battlePanelPoint"] = bool(',
        'snapshot["uiPoint"] = bool(host.call("_is_ui_point", viewport_point))',
        'snapshot["battlePanelPoint"] = bool(',
        'callback.get_object() == target',
        'str(callback.get_method()) == method_name',
        'button.pressed.get_connections()',
        'get_signal_connection_list("command_pressed")',
        'button.gui_input.connect(gui_input_callable)',
        'button.mouse_entered.connect(mouse_entered_callable)',
        'button.mouse_exited.connect(mouse_exited_callable)',
        'event is InputEventMouseButton',
        'mouse_event.button_index != MOUSE_BUTTON_LEFT',
        '"buttonMask": int(mouse_event.button_mask)',
        '"position": _vector_payload(mouse_event.position)',
        '"globalPosition": _vector_payload(mouse_event.global_position)',
        'connection.get("flags", -1)',
        '(product_button_flags[0] & CONNECT_DEFERRED) == 0',
        '(product_view_flags[0] & CONNECT_DEFERRED) == 0',
        '"productButtonConnectionFlags": product_button_flags.duplicate()',
        '"productViewConnectionFlags": product_view_flags.duplicate()',
        '"productConnectionsNonDeferred": product_connections_non_deferred',
        '"active": active',
        '"owner": str(_host_property("battle_command_owner"))',
        '"mode": str(_host_property("battle_target_mode"))',
        '"selected": str(_host_property("battle_selected_target_id"))',
        '"pending": pending',
        '"phase": phase',
        '"locked": locked',
        '"actionTimer": action_timer',
        '"eventQueueCount": event_queue_count',
        '"enemyPending": enemy_pending',
        '"endPending": end_pending',
        '"livingEnemyId": BattleModel.living_enemy_id(state)',
        '"livingEnemyCount": living_enemy_count',
        '"buttonPath": _control_path(button)',
        '"buttonGlobalRect": _rect_payload(button_rect)',
        '"buttonDisabled"',
        '"buttonVisible"',
        '"viewportPoint"',
        '"screenTransform"',
        '"inputPosition"',
        'var viewport_point := button_rect.get_center()',
        'var viewport: Viewport = host.get_viewport() as Viewport',
        'var screen_transform: Transform2D = viewport.get_screen_transform()',
        'var input_position: Vector2 = screen_transform * viewport_point',
        '"inputPosition": _vector_payload(screen_transform * viewport_point)',
        'input_probe["viewportPoint"] = _vector_payload(viewport_point)',
        'input_probe["screenTransform"] = _transform_payload(screen_transform)',
        'input_probe["inputPosition"] = _vector_payload(input_position)',
        '"downCount": int(probe.get("downCount", 0))',
        '"upCount": int(probe.get("upCount", 0))',
        '"pressedCount": int(probe.get("pressedCount", 0))',
        '"viewAttackCount": int(probe.get("viewAttackCount", 0))',
        '"postDrawBoundaryReached": bool(',
        '"nextLoopPostDrawBoundaryReached": bool(',
        '"postDrawStateCaptured": bool(',
        '"sameLoopDelivered": bool(',
        '"nextLoopDelivered": bool(',
        '"sameLoopProcessFrame": int(',
        '"nextLoopProcessFrame": int(',
        '"sameLoopGuiLeftButtonEventCount": int(',
        '"sameLoopGuiLeftButtonPressCount": int(',
        '"sameLoopGuiLeftButtonReleaseCount": int(',
        '"nextLoopGuiLeftButtonEventCount": int(',
        '"nextLoopGuiLeftButtonPressCount": int(',
        '"nextLoopGuiLeftButtonReleaseCount": int(',
        '"guiLeftButtonEvents": (',
        '"mouseEnteredCount": int(probe.get("mouseEnteredCount", 0))',
        '"mouseExitedCount": int(probe.get("mouseExitedCount", 0))',
        '"routeStages": (',
        '"observerSignalsDisconnected": bool(',
        'probe.get("observerSignalsDisconnected", false)',
        '"releaseRoutingClassification": (',
        "_attack_input_release_routing_classification(probe)",
        'return "release_not_routed"',
        'return "release_routed_but_basebutton_not_up"',
        'return "capture_lost_before_release"',
        'return "release_routed_and_button_up"',
        'return "no_down"',
        'return "down_without_up"',
        'return "pressed_without_view"',
        'return "post_draw_boundary_missing"',
        'return "next_loop_delivery_incomplete"',
        'return "view_without_mode"',
        'return "mode_then_polluted"',
        '_capture_attack_input_post_draw_states(probe, attack_button)',
        '_attack_input_probe_result(probe, classification, cleanup_ok)',
        '% [ATTACK_INPUT_BEFORE_MARKER, JSON.stringify(before)]',
        '% [ATTACK_INPUT_AFTER_MARKER, JSON.stringify(after)]',
    )
    if any(fragment not in capture_source for fragment in required_fragments):
        raise Phase403BattleLayoutRecordingError(
            "Phase403攻击点击诊断缺少身份、hover、状态或失败归因"
        )

    hover_source = _gdscript_function_source(
        capture_source,
        "_left_click_point",
    )
    state_snapshot_source = _gdscript_function_source(
        capture_source,
        "_attack_input_state_snapshot",
    )
    classified_snapshot_source = _gdscript_function_source(
        capture_source,
        "_attack_input_state_snapshot_with_point_classification",
    )
    product_snapshot_source = _gdscript_function_source(
        capture_source,
        "_attack_product_connection_snapshot",
    )
    explicit_snapshot_patterns = (
        r"(?m)^\s*var\s+button_identity_exact:\s*bool\s*=\s*\($",
        r"(?m)^\s*var\s+viewport:\s*Viewport\s*=\s*"
        r"host\.get_viewport\(\)\s+as\s+Viewport\s*$",
        r"(?m)^\s*if\s+viewport\s*==\s*null:\s*$",
        r"(?m)^\s*var\s+screen_transform:\s*Transform2D\s*=\s*"
        r"viewport\.get_screen_transform\(\)\s*$",
    )
    explicit_click_patterns = (
        r"(?m)^\s*var\s+viewport:\s*Viewport\s*=\s*"
        r"host\.get_viewport\(\)\s+as\s+Viewport\s*$",
        r"(?m)^\s*if\s+viewport\s*==\s*null:\s*$",
        r"(?m)^\s*var\s+screen_transform:\s*Transform2D\s*=\s*"
        r"viewport\.get_screen_transform\(\)\s*$",
    )
    if (
        any(
            len(re.findall(pattern, state_snapshot_source)) != 1
            for pattern in explicit_snapshot_patterns
        )
        or any(
            len(re.findall(pattern, hover_source)) != 1
            for pattern in explicit_click_patterns
        )
        or re.search(
            r'input_probe\["uiPoint"\]\s*=\s*bool\(host\.call\('
            r'"_is_ui_point",\s*viewport_point\)\)',
            hover_source,
            flags=re.MULTILINE,
        )
        is None
        or re.search(
            r'input_probe\["battlePanelPoint"\]\s*=\s*bool\(\s*'
            r'host\.call\("_battle_point_overlaps_panel",\s*'
            r'viewport_point\)\s*\)',
            hover_source,
            flags=re.MULTILINE,
        )
        is None
        or re.search(
            r'snapshot\["uiPoint"\]\s*=\s*bool\(host\.call\('
            r'"_is_ui_point",\s*viewport_point\)\)',
            classified_snapshot_source,
            flags=re.MULTILINE,
        )
        is None
        or re.search(
            r'snapshot\["battlePanelPoint"\]\s*=\s*bool\(\s*'
            r'host\.call\("_battle_point_overlaps_panel",\s*'
            r'viewport_point\)\s*\)',
            classified_snapshot_source,
            flags=re.MULTILINE,
        )
        is None
        or re.search(r"(?m)^\s*hovered\s*=", hover_source) is not None
        or re.search(r"(?m)^\s*hover_matches\s*=", hover_source) is not None
        or any(
            len(
                re.findall(
                    rf'input_probe\["{re.escape(key)}"\]\s*=',
                    hover_source,
                )
            )
            != 1
            for key in (
                "viewportPoint",
                "screenTransform",
                "inputPosition",
                "hoveredPath",
                "hoverMatchesTarget",
                "uiPoint",
                "battlePanelPoint",
            )
        )
        or any(
            re.search(
                rf"(?m)^\s*{name}\s*=",
                hover_source,
            )
            is not None
            for name in ("viewport_point", "screen_transform", "input_position")
        )
        or re.search(
            r"(?m)^\s*button_identity_exact\s*=",
            state_snapshot_source,
        )
        is not None
        or len(
            re.findall(
                r"(?m)^\s*var\s+viewport_point\s*:=\s*"
                r"button_rect\.get_center\(\)\s*$",
                state_snapshot_source,
            )
        )
        != 1
        or any(
            re.search(
                rf"(?m)^\s*{name}\s*=",
                state_snapshot_source,
            )
            is not None
            for name in ("visible_attack", "view_attack", "host_attack")
        )
        or re.search(
            r"(?m)^\s*viewport_point\s*=",
            state_snapshot_source,
        )
        is not None
        or re.search(
            r"(?m)^\s*screen_transform\s*=",
            state_snapshot_source,
        )
        is not None
        or any(
            fragment not in state_snapshot_source
            for fragment in (
                "not active",
                "or action_timer > 0.0",
                "or event_queue_count != 0",
                "or enemy_pending",
                "or end_pending",
                'or phase != "command"',
            )
        )
        or re.search(
            r"(?m)^\s*product_connections_non_deferred\s*=",
            product_snapshot_source,
        )
        is not None
        or any(
            re.search(
                rf"(?m)^\s*{name}\s*=",
                product_snapshot_source,
            )
            is not None
            for name in ("product_button_flags", "product_view_flags")
        )
    ):
        raise Phase403BattleLayoutRecordingError(
            "Phase403攻击诊断不得覆盖实际hover、按钮身份或锁分量"
        )

    player_attack_source = _gdscript_function_source(
        capture_source,
        "_click_player_attack",
    )
    post_draw_state_source = _gdscript_function_source(
        capture_source,
        "_capture_attack_input_post_draw_states",
    )
    post_click_fragments = (
        "await _left_click_control(attack_button, label, probe)",
        "_capture_attack_input_post_draw_states(probe, attack_button)",
        "var after := _attack_input_state_snapshot_with_point_classification(",
        "var cleanup_ok := _disconnect_attack_input_probe(",
        "var classification := _attack_input_classification(probe, after)",
        "_attack_input_probe_result(probe, classification, cleanup_ok)",
    )
    post_click_cursor = -1
    for fragment in post_click_fragments:
        post_click_cursor = player_attack_source.find(
            fragment,
            post_click_cursor + 1,
        )
        if post_click_cursor < 0:
            raise Phase403BattleLayoutRecordingError(
                "Phase403攻击诊断必须在post-draw后采状态、清spy并分类"
            )
    post_draw_state_fragments = (
        'probe.get("postDrawBoundaryReached", false)',
        'probe.get("nextLoopPostDrawBoundaryReached", false)',
        'probe["postDrawStateCaptured"] = (',
        'post_draw_boundary_reached',
        'next_loop_post_draw_boundary_reached',
        'if not bool(probe.get("postDrawStateCaptured", false)):',
        'if int(probe.get("upCount", 0)) > 0:',
        'probe["releaseState"] = _attack_input_state_snapshot(button, "release")',
        'if int(probe.get("pressedCount", 0)) > 0:',
        'probe["pressedState"] = _attack_input_state_snapshot(button, "pressed")',
        'if int(probe.get("viewAttackCount", 0)) > 0:',
        'probe["viewState"] = _attack_input_state_snapshot(button, "view")',
    )
    if (
        any(
            fragment not in post_draw_state_source
            for fragment in post_draw_state_fragments
        )
        or re.search(
            r"var\s+post_draw_boundary_reached:\s*bool\s*=\s*bool\(\s*"
            r'probe\.get\("postDrawBoundaryReached",\s*false\)\s*\)',
            post_draw_state_source,
            flags=re.MULTILINE,
        )
        is None
        or re.search(
            r"var\s+next_loop_post_draw_boundary_reached:\s*bool\s*=\s*bool\(\s*"
            r'probe\.get\("nextLoopPostDrawBoundaryReached",\s*false\)\s*\)',
            post_draw_state_source,
            flags=re.MULTILINE,
        )
        is None
        or re.search(
            r"(?m)^\s*post_draw_boundary_reached\s*=",
            post_draw_state_source,
        )
        is not None
        or "await " in post_draw_state_source
        or player_attack_source.count(
            "_capture_attack_input_post_draw_states(probe, attack_button)"
        )
        != 1
        or any(
            capture_source.count(f'probe["{state_key}"] =') != 1
            for state_key in ("releaseState", "pressedState", "viewState")
        )
    ):
        raise Phase403BattleLayoutRecordingError(
            "Phase403 release/up/pressed/view状态只能在post-draw边界后采集"
        )

    route_stage_source = _gdscript_function_source(
        capture_source,
        "_attack_input_route_stage_snapshot",
    )
    route_capture_source = _gdscript_function_source(
        capture_source,
        "_capture_attack_input_route_stage",
    )
    gui_count_source = _gdscript_function_source(
        capture_source,
        "_attack_input_gui_left_button_count",
    )
    delivered_source = _gdscript_function_source(
        capture_source,
        "_attack_input_route_stage_delivered",
    )
    boundary_source = _gdscript_function_source(
        capture_source,
        "_capture_attack_input_delivery_boundary",
    )
    release_routing_source = _gdscript_function_source(
        capture_source,
        "_attack_input_release_routing_classification",
    )
    route_stage_fragments = (
        "var parent: Node = button.get_parent()",
        "var viewport: Viewport = button.get_viewport() as Viewport",
        "viewport.gui_get_hovered_control() as Control",
        '"buttonPath": _control_path(button)',
        '"buttonInstanceId": _control_instance_id(button)',
        '"buttonParentPath": (',
        '"buttonParentInstanceId": (',
        '"buttonGlobalRect": _rect_payload(button.get_global_rect())',
        '"buttonVisible": button.is_visible_in_tree()',
        '"buttonDisabled": button.disabled',
        '"buttonMouseFilter": int(button.mouse_filter)',
        '"buttonActionMode": int(button.action_mode)',
        '"buttonKeepPressedOutside": button.keep_pressed_outside',
        '"buttonPressed": button.button_pressed',
        '"buttonIsHovered": button.is_hovered()',
        '"viewportHoveredPath": _control_path(hovered)',
        '"viewportHoveredInstanceId": _control_instance_id(hovered)',
        '"viewportHoveredMatchesButton": _hovered_control_matches_target(',
        '"inputLeftPressed": Input.is_mouse_button_pressed(MOUSE_BUTTON_LEFT)',
    )
    route_capture_fragments = (
        'var stages := probe.get("routeStages", []) as Array',
        "if target_control is BaseButton:",
        "_attack_input_route_stage_snapshot(",
        '"processFrame": Engine.get_process_frames()',
        '"downCount": int(probe.get("downCount", 0))',
        '"upCount": int(probe.get("upCount", 0))',
        '"pressedCount": int(probe.get("pressedCount", 0))',
        '"viewAttackCount": int(probe.get("viewAttackCount", 0))',
        '"guiLeftButtonEventCount": gui_events.size()',
        '"guiLeftButtonPressCount": (',
        '_attack_input_gui_left_button_count(probe, true)',
        '"guiLeftButtonReleaseCount": (',
        '_attack_input_gui_left_button_count(probe, false)',
        'stage == "release_post_draw"',
        'stage == "release_next_loop_post_draw"',
        '"sameLoop"',
        '"nextLoop"',
        'stages.append({"stage": stage, "invalidTarget": true})',
        'probe["routeStages"] = stages',
    )
    release_routing_fragments = (
        'probe.get("guiLeftButtonEvents", []) as Array',
        'int(event.get("buttonIndex", 0)) != MOUSE_BUTTON_LEFT',
        'probe.get("routeStages", [])',
        '"press_sync"',
        '"pre_release"',
        'pre_release_stage.get("buttonInstanceId", 0)',
        'pre_release_stage.get("buttonParentInstanceId", 0)',
        'pre_release_stage.get("buttonGlobalRect", [])',
        'pre_release_stage.get("buttonIsHovered", false)',
        'pre_release_stage.get("viewportHoveredMatchesButton", false)',
        'pre_release_stage.get("inputLeftPressed", false)',
        "var capture_lost: bool = (",
        'return "capture_lost_before_release"',
        'return "release_not_routed"',
        'return "release_routed_but_basebutton_not_up"',
        'return "release_routed_and_button_up"',
    )
    canonical_capture_lost_block = (
        "\tvar capture_lost: bool = (\n"
        "\t\tpress_stage.is_empty()\n"
        "\t\tor pre_release_stage.is_empty()\n"
        '\t\tor int(pre_release_stage.get("buttonInstanceId", 0))\n'
        '\t\t!= int(press_stage.get("buttonInstanceId", -1))\n'
        '\t\tor str(pre_release_stage.get("buttonPath", ""))\n'
        '\t\t!= str(press_stage.get("buttonPath", ""))\n'
        '\t\tor int(pre_release_stage.get("buttonParentInstanceId", 0))\n'
        '\t\t!= int(press_stage.get("buttonParentInstanceId", -1))\n'
        '\t\tor str(pre_release_stage.get("buttonParentPath", ""))\n'
        '\t\t!= str(press_stage.get("buttonParentPath", ""))\n'
        '\t\tor pre_release_stage.get("buttonGlobalRect", [])\n'
        '\t\t!= press_stage.get("buttonGlobalRect", [])\n'
        '\t\tor not bool(pre_release_stage.get("buttonVisible", false))\n'
        '\t\tor bool(pre_release_stage.get("buttonDisabled", true))\n'
        '\t\tor not bool(pre_release_stage.get("buttonIsHovered", false))\n'
        "\t\tor not bool(\n"
        '\t\t\tpre_release_stage.get("viewportHoveredMatchesButton", false)\n'
        "\t\t)\n"
        '\t\tor not bool(pre_release_stage.get("inputLeftPressed", false))\n'
        "\t)\n"
    )
    gui_count_fragments = (
        'probe.get("guiLeftButtonEvents", [])',
        'int(event.get("buttonIndex", 0)) == MOUSE_BUTTON_LEFT',
        'bool(event.get("pressed", false)) == pressed_value',
        "count += 1",
    )
    delivered_fragments = (
        'not bool(stage.get("inputLeftPressed", true))',
        'not bool(stage.get("buttonPressed", true))',
        'int(stage.get("downCount", 0)) == 1',
        'int(stage.get("upCount", 0)) == 1',
        'int(stage.get("pressedCount", 0)) == 1',
        'int(stage.get("viewAttackCount", 0)) == 1',
        'int(stage.get("guiLeftButtonEventCount", 0)) == 2',
        'int(stage.get("guiLeftButtonPressCount", 0)) == 1',
        'int(stage.get("guiLeftButtonReleaseCount", 0)) == 1',
    )
    boundary_fragments = (
        'probe[prefix + "Delivered"] = _attack_input_route_stage_delivered(stage)',
        'probe[prefix + "ProcessFrame"] = int(stage.get("processFrame", -1))',
        'probe[prefix + "GuiLeftButtonEventCount"] = int(',
        'probe[prefix + "GuiLeftButtonPressCount"] = int(',
        'probe[prefix + "GuiLeftButtonReleaseCount"] = int(',
    )
    canonical_route_capture_fragments = (
        '"processFrame": Engine.get_process_frames()',
        '"downCount": int(probe.get("downCount", 0))',
        '"upCount": int(probe.get("upCount", 0))',
        '"pressedCount": int(probe.get("pressedCount", 0))',
        '"viewAttackCount": int(probe.get("viewAttackCount", 0))',
        '"guiLeftButtonEventCount": gui_events.size()',
        '_attack_input_gui_left_button_count(probe, true)',
        '_attack_input_gui_left_button_count(probe, false)',
    )
    if (
        any(fragment not in route_stage_source for fragment in route_stage_fragments)
        or any(
            fragment not in route_capture_source
            for fragment in route_capture_fragments
        )
        or any(fragment not in gui_count_source for fragment in gui_count_fragments)
        or any(fragment not in delivered_source for fragment in delivered_fragments)
        or any(fragment not in boundary_source for fragment in boundary_fragments)
        or any(
            route_capture_source.count(fragment) != 1
            for fragment in canonical_route_capture_fragments
        )
        or route_capture_source.count("stage_snapshot.merge(") != 1
        or route_capture_source.count("stages.append(stage_snapshot)") != 1
        or route_capture_source.count("stages.append(") != 2
        or route_capture_source.count('probe["routeStages"] = stages') != 1
        or len(
            re.findall(
                r"(?m)^\s*probe\[[^\n]+\]\s*=",
                route_capture_source,
            )
        )
        != 1
        or any(
            boundary_source.count(fragment) != 1
            for fragment in boundary_fragments
        )
        or re.search(
            r"(?m)^\s*stage_snapshot(?:\[[^\n]+\])?\s*=",
            route_capture_source,
        )
        is not None
        or re.search(
            r"(?m)^\s*stages\[[^\n]+\]\s*=",
            route_capture_source,
        )
        is not None
        or re.search(
            r"\b(?:stage_snapshot|stages)\."
            r"(?:clear|erase|set|append_array|assign)\s*\(",
            route_capture_source,
        )
        is not None
        or re.search(
            r"\bgui_events\."
            r"(?:append|append_array|clear|erase|set|assign)\s*\(",
            route_capture_source,
        )
        is not None
        or re.search(
            r"(?m)^\s*gui_events\s*=",
            route_capture_source,
        )
        is not None
        or 'probe["guiLeftButtonEvents"]' in route_capture_source
        or re.search(
            r"\bprobe\.(?:set|merge|erase|clear|assign)\s*\(",
            route_capture_source,
        )
        is not None
        or boundary_source.count("probe[prefix + ") != 5
        or ".merge(" in boundary_source
        or any(
            fragment not in release_routing_source
            for fragment in release_routing_fragments
        )
        or release_routing_source.count(canonical_capture_lost_block) != 1
        or '"mouseExitedCount"' in release_routing_source
        or len(
            re.findall(
                r"(?m)^\s*var\s+capture_lost:\s*bool\s*=\s*\($",
                release_routing_source,
            )
        )
        != 1
        or any(
            forbidden
            in (
                route_stage_source
                + route_capture_source
                + gui_count_source
                + delivered_source
                + boundary_source
            )
            for forbidden in (
                "accept_event",
                "set_input_as_handled",
                "Input.parse_input_event",
                "push_input",
                "flush_buffered_events",
                "use_accumulated_input",
                "agile_event_flushing",
                "_on_battle_command_pressed",
                "_emit_command(",
            )
        )
        or re.search(
            r"\b(?:button|_button)\."
            r"(?:disabled|mouse_filter|action_mode|keep_pressed_outside|"
            r"button_pressed)\s*=",
            route_stage_source
            + route_capture_source
            + gui_count_source
            + delivered_source
            + boundary_source
            + release_routing_source,
        )
    ):
        raise Phase403BattleLayoutRecordingError(
            "Phase403分段路由诊断必须只读真实button/parent/hover/Input状态"
        )

    left_click_source = hover_source
    ordered_input_fragments = (
        "Input.parse_input_event(motion)",
        "await host.get_tree().process_frame",
        "gui_get_hovered_control() as Control",
        "Input.parse_input_event(press)",
        '"press_sync"',
        "await host.get_tree().process_frame",
        "await host.get_tree().physics_frame",
        '"pre_release"',
        "Input.parse_input_event(release)",
        '"release_sync"',
        "await host.get_tree().process_frame",
        '"release_process"',
        "await RenderingServer.frame_post_draw",
        'input_probe["postDrawBoundaryReached"] = true',
        '"release_post_draw"',
        "await host.get_tree().process_frame",
        "await RenderingServer.frame_post_draw",
        'input_probe["nextLoopPostDrawBoundaryReached"] = true',
        '"release_next_loop_post_draw"',
    )
    cursor = -1
    for fragment in ordered_input_fragments:
        cursor = left_click_source.find(fragment, cursor + 1)
        if cursor < 0:
            raise Phase403BattleLayoutRecordingError(
                "Phase403攻击诊断必须保留Input.parse跨帧motion/press/release"
            )
    if (
        left_click_source.count("Input.parse_input_event(motion)") != 1
        or left_click_source.count("Input.parse_input_event(press)") != 1
        or left_click_source.count("Input.parse_input_event(release)") != 1
        or left_click_source.count("await host.get_tree().process_frame") != 4
        or left_click_source.count("await host.get_tree().physics_frame") != 1
        or left_click_source.count("await RenderingServer.frame_post_draw") != 2
        or left_click_source.count(
            'input_probe["postDrawBoundaryReached"] = true'
        )
        != 1
        or left_click_source.count(
            'input_probe["nextLoopPostDrawBoundaryReached"] = true'
        )
        != 1
        or left_click_source.count("_capture_attack_input_route_stage(") != 6
        or len(re.findall(r"(?m)^\s*await\s+", left_click_source)) != 7
        or re.search(
            r"_capture_attack_input_route_stage\(\s*input_probe,\s*"
            r'target_control,\s*"pre_release"\s*\)\s*\n'
            r"\s*_record_perf_qa_sync_wall\(perf_qa_started_usec\)\s*\n"
            r"\s*input_parse_started_usec\s*=\s*Time\.get_ticks_usec\(\)\s*\n"
            r"\s*Input\.parse_input_event\(release\)\s*\n"
            r'\s*_record_perf_input_dispatch_wall\("release",\s*'
            r"input_parse_started_usec\)\s*\n"
            r"\s*_capture_attack_input_route_stage\(\s*input_probe,\s*"
            r'target_control,\s*"release_sync"\s*\)\s*\n'
            r"\s*await host\.get_tree\(\)\.process_frame\s*\n"
            r"\s*_capture_attack_input_route_stage\(\s*input_probe,\s*"
            r'target_control,\s*"release_process"\s*\)\s*\n'
            r"\s*if not input_probe\.is_empty\(\):\s*\n"
            r"\s*await RenderingServer\.frame_post_draw\s*\n"
            r'\s*input_probe\["postDrawBoundaryReached"\]\s*=\s*true\s*\n'
            r"\s*_capture_attack_input_route_stage\(\s*input_probe,\s*"
            r'target_control,\s*"release_post_draw"\s*\)\s*\n'
            r"\s*await host\.get_tree\(\)\.process_frame\s*\n"
            r"\s*if not input_probe\.is_empty\(\):\s*\n"
            r"\s*await RenderingServer\.frame_post_draw\s*\n"
            r'\s*input_probe\["nextLoopPostDrawBoundaryReached"\]\s*=\s*true\s*\n'
            r"\s*_capture_attack_input_route_stage\(\s*input_probe,\s*"
            r'target_control,\s*"release_next_loop_post_draw"\s*\)',
            left_click_source,
            flags=re.MULTILINE,
        )
        is None
        or left_click_source.count("if not input_probe.is_empty():") != 3
        or "if input_probe.is_empty():" in left_click_source
        or re.search(
            r"Input\.parse_input_event\(press\)\s*\n"
            r'\s*_record_perf_input_dispatch_wall\("press",\s*'
            r"input_parse_started_usec\)\s*\n"
            r"\s*_capture_attack_input_route_stage\(\s*input_probe,\s*"
            r'target_control,\s*"press_sync"\s*\)\s*\n'
            r"\s*await host\.get_tree\(\)\.process_frame",
            left_click_source,
            flags=re.MULTILINE,
        )
        is None
        or any(
            forbidden in left_click_source
            for forbidden in (
                "create_timer",
                "delay_msec",
                "delay_usec",
                "sleep(",
                "push_input",
                "flush_buffered_events",
                "use_accumulated_input",
                "agile_event_flushing",
                "Input.action_press",
                "Input.action_release",
                "emit_signal",
                ".emit(",
                "call_deferred",
            )
        )
    ):
        raise Phase403BattleLayoutRecordingError(
            "Phase403攻击诊断必须按release/process/post-draw完成GUI边界"
        )

    install_source = _gdscript_function_source(
        capture_source,
        "_install_attack_input_probe",
    )
    if (
        install_source.count("CONNECT_ONE_SHOT") != 4
        or install_source.count("button.button_down.connect") != 1
        or install_source.count("button.button_up.connect") != 1
        or install_source.count("button.pressed.connect") != 1
        or install_source.count("button.gui_input.connect(gui_input_callable)")
        != 1
        or install_source.count(
            "button.mouse_entered.connect(mouse_entered_callable)"
        )
        != 1
        or install_source.count(
            "button.mouse_exited.connect(mouse_exited_callable)"
        )
        != 1
        or len(
            re.findall(
                r'\(_view\s+as\s+Object\)\.connect\(\s*'
                r'"command_pressed",\s*view_callable,\s*'
                r'CONNECT_ONE_SHOT\s*\)',
                install_source,
                flags=re.MULTILINE,
            )
        )
        != 1
        or "CONNECT_DEFERRED" in install_source
        or "_on_battle_command_pressed" in install_source
        or "_emit_command(" in install_source
        or re.search(
            r"\b(?:button|_button)\."
            r"(?:disabled|mouse_filter|action_mode|keep_pressed_outside|"
            r"button_pressed)\s*=",
            install_source,
        )
    ):
        raise Phase403BattleLayoutRecordingError(
            "Phase403攻击spy必须是四条one-shot与三条同步被动观察连接"
        )
    product_snapshot_offset = install_source.find(
        "_attack_product_connection_snapshot(button)"
    )
    exact_guard_offset = install_source.find(
        'if not bool(probe.get("productChainExactBefore", false)):'
    )
    view_spy_offset = install_source.find(
        '(_view as Object).connect('
    )
    gui_spy_offset = install_source.find(
        "button.gui_input.connect(gui_input_callable)"
    )
    entered_spy_offset = install_source.find(
        "button.mouse_entered.connect(mouse_entered_callable)"
    )
    exited_spy_offset = install_source.find(
        "button.mouse_exited.connect(mouse_exited_callable)"
    )
    if (
        min(
            product_snapshot_offset,
            exact_guard_offset,
            gui_spy_offset,
            entered_spy_offset,
            exited_spy_offset,
            view_spy_offset,
        )
        < 0
        or not (
            product_snapshot_offset
            < exact_guard_offset
            < gui_spy_offset
            < entered_spy_offset
            < exited_spy_offset
            < view_spy_offset
        )
        or '"viewObserverMode": "synchronous_after_preexisting_host"'
        not in install_source
    ):
        raise Phase403BattleLayoutRecordingError(
            "Phase403同步view spy必须在唯一既有host连接验明后最后接入"
        )
    for callback_name in (
        "_on_attack_probe_button_down",
        "_on_attack_probe_button_up",
        "_on_attack_probe_pressed",
        "_on_attack_probe_view_command",
        "_on_attack_probe_gui_input",
        "_on_attack_probe_mouse_entered",
        "_on_attack_probe_mouse_exited",
    ):
        callback_source = _gdscript_function_source(
            capture_source,
            callback_name,
        )
        if any(
            forbidden in callback_source
            for forbidden in (
                ".connect(",
                ".disconnect(",
                ".emit(",
                "emit_signal",
                "host.call(",
                "_on_battle_command_pressed",
                "_emit_command(",
                "_fail_capture(",
                "accept_event",
                "set_input_as_handled",
                "Input.parse_input_event",
                "push_input",
            )
        ) or re.search(
            r"\b(?:button|_button)\."
            r"(?:disabled|mouse_filter|action_mode|keep_pressed_outside|"
            r"button_pressed)\s*=",
            callback_source,
        ):
            raise Phase403BattleLayoutRecordingError(
                "Phase403攻击spy回调只能被动计数和读取状态"
            )
    gui_observer_source = _gdscript_function_source(
        capture_source,
        "_on_attack_probe_gui_input",
    )
    gui_observer_fragments = (
        "event is InputEventMouseButton",
        "var mouse_event := event as InputEventMouseButton",
        "mouse_event.button_index != MOUSE_BUTTON_LEFT",
        'probe.get("guiLeftButtonEvents", []) as Array',
        '"pressed": mouse_event.pressed',
        '"buttonIndex": int(mouse_event.button_index)',
        '"buttonMask": int(mouse_event.button_mask)',
        '"position": _vector_payload(mouse_event.position)',
        '"globalPosition": _vector_payload(mouse_event.global_position)',
        'probe["guiLeftButtonEvents"] = events',
    )
    if any(
        fragment not in gui_observer_source
        for fragment in gui_observer_fragments
    ):
        raise Phase403BattleLayoutRecordingError(
            "Phase403 gui_input observer必须同步被动记录真实左键到达"
        )
    for callback_name in (
        "_on_attack_probe_button_up",
        "_on_attack_probe_pressed",
        "_on_attack_probe_view_command",
    ):
        callback_source = _gdscript_function_source(
            capture_source,
            callback_name,
        )
        if "_attack_input_state_snapshot(" in callback_source:
            raise Phase403BattleLayoutRecordingError(
                "Phase403 release/up/pressed/view回调不得在post-draw前采状态"
            )
    cleanup_source = _gdscript_function_source(
        capture_source,
        "_disconnect_attack_input_probe",
    )
    cleanup_keys = (
        'probe.get("_downCallable"',
        'probe.get("_upCallable"',
        'probe.get("_pressedCallable"',
        'probe.get("_viewCallable"',
        'probe.get("_guiInputCallable"',
        'probe.get("_mouseEnteredCallable"',
        'probe.get("_mouseExitedCallable"',
    )
    if (
        any(key not in cleanup_source for key in cleanup_keys)
        or cleanup_source.count("_disconnect_probe_signal(") != 7
        or 'probe["observerSignalsDisconnected"] = cleanup_ok'
        not in cleanup_source
        or "_emit_command" in cleanup_source
        or "_on_battle_command_pressed" in cleanup_source
    ):
        raise Phase403BattleLayoutRecordingError(
            "Phase403攻击spy清理只能断开自身七条观察连接"
        )
    common_state_source = _gdscript_function_source(
        capture_source,
        "_attack_input_common_state_ok",
    )
    precondition_source = _gdscript_function_source(
        capture_source,
        "_attack_input_precondition_ok",
    )
    if (
        'snapshot.get("uiPoint"' in common_state_source
        or 'snapshot.get("uiPoint"' in precondition_source
        or 'snapshot.get("battlePanelPoint", false)' not in precondition_source
        or 'snapshot.get("productConnectionsNonDeferred", false)'
        not in precondition_source
    ):
        raise Phase403BattleLayoutRecordingError(
            "Phase403中_is_ui_point仅记录，当前HUD命中门以battlePanelPoint为准"
        )

    configure_source = _gdscript_function_source(
        command_view_source,
        "configure_command_buttons",
    )
    command_buttons_source = _gdscript_function_source(
        command_view_source,
        "command_buttons",
    )
    emit_source = _gdscript_function_source(
        command_view_source,
        "_emit_command",
    )
    mount_source = _gdscript_function_source(
        command_host_source,
        "_mount_command_view",
    )
    host_callback_source = _gdscript_function_source(
        main_source,
        "_on_battle_command_pressed",
    )
    if (
        len(
            re.findall(
                r"(?m)^\s*_command_buttons\s*=\s*buttons\s*$",
                configure_source,
            )
        )
        != 1
        or "_command_buttons = buttons.duplicate" in configure_source
        or configure_source.count(
            "button.pressed.connect(_emit_command.bind(str(command_id)))"
        )
        != 1
        or configure_source.count("button.pressed.connect(") != 1
        or command_buttons_source.count("return _command_buttons") != 1
        or emit_source.count("command_pressed.emit(command_id)") != 1
        or mount_source.count(
            '_view.command_pressed.connect(Callable(_host, '
            '"_on_battle_command_pressed"))'
        )
        != 1
        or mount_source.count("_view.command_pressed.connect(") != 1
        or mount_source.count(
            "_view.configure_command_buttons(_host.battle_command_buttons)"
        )
        != 1
        or re.search(
            r'(?m)^\s*"attack":\s*\n\s*'
            r'_begin_player_enemy_target_selection\("attack"\)',
            host_callback_source,
        )
        is None
    ):
        raise Phase403BattleLayoutRecordingError(
            "Phase403攻击诊断必须锁住唯一正式view到Main回调链"
        )


def _require_main_flag_wiring() -> None:
    try:
        main_source = MAIN_SCRIPT_PATH.read_text(encoding="utf-8")
        capture_source = CAPTURE_SCRIPT_PATH.read_text(encoding="utf-8")
        command_view_source = COMMAND_VIEW_SCRIPT_PATH.read_text(
            encoding="utf-8"
        )
        command_host_source = COMMAND_HOST_SCRIPT_PATH.read_text(
            encoding="utf-8"
        )
        arena_catalog_source = ARENA_CATALOG_SCRIPT_PATH.read_text(
            encoding="utf-8"
        )
    except OSError as error:
        raise Phase403BattleLayoutRecordingError(
            "无法读取Phase403真实Main录像接线源码"
        ) from error
    _require_frame_size_normalization_contract(capture_source)
    _require_formal_active_pet_fixture_contract(capture_source)
    _require_player_command_union_contract(capture_source)
    _require_host_property_cache_contract(capture_source)
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
        "BattleArenaVisualCatalog.warm_state(",
        "BattleArenaVisualCatalog.texture_for_state(",
        "battle_layout_owner_review_capture",
    )
    capture_fragments = (
        f'const CAPTURE_FLAG := "{CAPTURE_FLAG}"',
        "BattleModel.create_formation_preview_battle",
        'const FORMAL_CHARACTER_APPEARANCE_ID := "ember_spark_v1"',
        'const FORMAL_PET_FORM_ID := "wuli_evolved_crystal_earth8_water2"',
        "Input.parse_input_event(press)",
        "await host.get_tree().process_frame",
        "await RenderingServer.frame_post_draw",
        'input_probe["postDrawBoundaryReached"] = true',
        "MountVisualProfileCatalog.warm_world_form",
        "inserted_into_battle_state=false",
        "runtime_frame=256x256",
        "source_image_frame=512x512",
        "slot_collisions_recomputed=false",
        'const ARENA_VISUAL_MARKER := "PHASE412_BATTLE_ARENA_VISUAL"',
        "BattleArenaVisualCatalog.OWNER_REVIEW_ARENA_ID_KEY",
        "_assert_owner_review_arena_visual_contract",
        "BattleArenaVisualCatalog.texture_for_state(state, false)",
        "ordinary_player_enabled=false",
    )
    arena_catalog_fragments = (
        'const OWNER_REVIEW_ARENA_ID_KEY := "battleArenaOwnerReviewId"',
        "allow_owner_review_preview: bool = false",
        "if allow_owner_review_preview:",
        "texture_for_state(owner_review_state, false) != null",
        "texture_for_state(owner_review_state, true) == null",
    )
    if any(fragment not in main_source for fragment in main_fragments):
        raise Phase403BattleLayoutRecordingError(
            "Phase403录像未通过最小Main flag wiring接入"
        )
    if any(fragment not in capture_source for fragment in capture_fragments):
        raise Phase403BattleLayoutRecordingError(
            "Phase403录像controller缺少正式fixture或跨帧左键合同"
        )
    if any(
        fragment not in arena_catalog_source
        for fragment in arena_catalog_fragments
    ):
        raise Phase403BattleLayoutRecordingError(
            "Phase412待审战场没有显式审片门禁或普通玩家失败关闭合同"
        )
    if "phase402" in capture_source.lower():
        raise Phase403BattleLayoutRecordingError(
            "Phase403录像controller不得引用Phase402候选视觉"
        )
    if "source_frame=256x256" in capture_source:
        raise Phase403BattleLayoutRecordingError(
            "Phase403录像controller不得把256运行帧误写为源图"
        )
    review_marker_start = capture_source.find(REVIEW_ONLY_MARKER)
    fixture_marker_start = capture_source.find(FIXTURE_MARKER)
    if (
        review_marker_start < 0
        or fixture_marker_start <= review_marker_start
        or "collisions=0"
        in capture_source[review_marker_start:fixture_marker_start]
    ):
        raise Phase403BattleLayoutRecordingError(
            "Phase403 review-only骑乘不得冒充完整slot零碰撞证据"
        )


def _parse_attack_input_json(line: str, marker: str) -> dict[str, Any]:
    payload = line[len(marker) :].strip()
    parsed = _strict_json_loads(
        payload,
        f"Phase403攻击点击诊断{marker}",
    )
    if not isinstance(parsed, dict):
        raise Phase403BattleLayoutRecordingError(
            f"Phase403攻击点击诊断{marker}必须是JSON对象"
        )
    return parsed


def _require_finite_number_array(
    value: Any,
    length: int,
    key: str,
) -> tuple[float, ...]:
    if (
        not isinstance(value, list)
        or len(value) != length
        or any(
            isinstance(item, bool)
            or not isinstance(item, (int, float))
            or not math.isfinite(float(item))
            for item in value
        )
    ):
        raise Phase403BattleLayoutRecordingError(
            f"Phase403攻击点击诊断{key}必须是{length}元素有限数值数组"
        )
    return tuple(float(item) for item in value)


def _number_tuples_close(
    left: tuple[float, ...],
    right: tuple[float, ...],
    *,
    tolerance: float = 0.0001,
) -> bool:
    return len(left) == len(right) and all(
        math.isclose(
            left_value,
            right_value,
            rel_tol=0.0,
            abs_tol=tolerance,
        )
        for left_value, right_value in zip(left, right)
    )


def _transform2d_point(
    transform: tuple[float, ...],
    point: tuple[float, ...],
) -> tuple[float, float]:
    return (
        transform[0] * point[0]
        + transform[2] * point[1]
        + transform[4],
        transform[1] * point[0]
        + transform[3] * point[1]
        + transform[5],
    )


def _require_single_non_deferred_connection_flag(
    value: Any,
    key: str,
) -> int:
    if (
        not isinstance(value, list)
        or len(value) != 1
        or type(value[0]) is not int
        or value[0] < 0
        or value[0] & 1
    ):
        raise Phase403BattleLayoutRecordingError(
            f"Phase403攻击点击诊断{key}必须是单个非deferred正式连接flag"
        )
    return int(value[0])


def _require_attack_input_state(
    state: Any,
    *,
    stage: str,
    modes: tuple[str, ...],
    require_point_classification: bool,
) -> dict[str, Any]:
    if not isinstance(state, dict):
        raise Phase403BattleLayoutRecordingError(
            f"Phase403攻击点击诊断缺少{stage}状态对象"
        )
    required_true = (
        "active",
        "buttonIdentityExact",
        "buttonInsideTree",
        "buttonVisible",
    )
    required_false = (
        "locked",
        "enemyPending",
        "endPending",
        "buttonDisabled",
    )
    if any(state.get(key) is not True for key in required_true) or any(
        state.get(key) is not False for key in required_false
    ):
        raise Phase403BattleLayoutRecordingError(
            f"Phase403攻击点击诊断{stage}活动/锁定/button状态不合法"
        )
    action_timer = state.get("actionTimer")
    if (
        isinstance(action_timer, bool)
        or not isinstance(action_timer, (int, float))
        or not math.isfinite(float(action_timer))
        or not math.isclose(float(action_timer), 0.0, abs_tol=0.000001)
    ):
        raise Phase403BattleLayoutRecordingError(
            f"Phase403攻击点击诊断{stage} actionTimer必须为0"
        )
    integer_fields = (
        "eventQueueCount",
        "livingEnemyCount",
        "buttonInstanceId",
        "visibleAttackInstanceId",
        "viewAttackInstanceId",
        "hostAttackInstanceId",
    )
    if any(type(state.get(key)) is not int for key in integer_fields):
        raise Phase403BattleLayoutRecordingError(
            f"Phase403攻击点击诊断{stage}计数或实例ID类型错误"
        )
    button_id = int(state["buttonInstanceId"])
    if (
        state.get("stage") != stage
        or state.get("owner") != "player"
        or state.get("mode") not in modes
        or state.get("selected") != ""
        or state.get("pending") != {}
        or state.get("phase") != "command"
        or state["eventQueueCount"] != 0
        or state["livingEnemyCount"] <= 0
        or not isinstance(state.get("livingEnemyId"), str)
        or not state["livingEnemyId"]
        or not isinstance(state.get("buttonPath"), str)
        or not state["buttonPath"]
        or button_id <= 0
        or any(
            state[key] != button_id
            for key in (
                "visibleAttackInstanceId",
                "viewAttackInstanceId",
                "hostAttackInstanceId",
            )
        )
    ):
        raise Phase403BattleLayoutRecordingError(
            f"Phase403攻击点击诊断{stage}人物命令状态或按钮身份漂移"
        )
    button_rect = _require_finite_number_array(
        state.get("buttonGlobalRect"),
        4,
        f"{stage}.buttonGlobalRect",
    )
    if button_rect[2] <= 0.0 or button_rect[3] <= 0.0:
        raise Phase403BattleLayoutRecordingError(
            f"Phase403攻击点击诊断{stage}按钮rect必须为正尺寸"
        )
    viewport_point = _require_finite_number_array(
        state.get("viewportPoint"),
        2,
        f"{stage}.viewportPoint",
    )
    screen_transform = _require_finite_number_array(
        state.get("screenTransform"),
        6,
        f"{stage}.screenTransform",
    )
    input_position = _require_finite_number_array(
        state.get("inputPosition"),
        2,
        f"{stage}.inputPosition",
    )
    rect_center = (
        button_rect[0] + button_rect[2] * 0.5,
        button_rect[1] + button_rect[3] * 0.5,
    )
    transformed_point = _transform2d_point(screen_transform, viewport_point)
    if (
        not _number_tuples_close(viewport_point, rect_center)
        or not _number_tuples_close(input_position, transformed_point)
    ):
        raise Phase403BattleLayoutRecordingError(
            f"Phase403攻击点击诊断{stage}坐标没有由实际rect/Transform2D推导"
        )
    if require_point_classification and (
        type(state.get("uiPoint")) is not bool
        or state.get("battlePanelPoint") is not True
    ):
        raise Phase403BattleLayoutRecordingError(
            f"Phase403攻击点击诊断{stage}缺少真实UI/HUD点分类"
        )
    return state


def _validate_attack_input_diagnostic(
    before: dict[str, Any],
    after: dict[str, Any],
) -> dict[str, Any]:
    before_state = _require_attack_input_state(
        before,
        stage="before",
        modes=("enemy",),
        require_point_classification=True,
    )
    if (
        before.get("productChainExactBefore") is not True
        or before.get("productConnectionsNonDeferred") is not True
        or before.get("spiesInstalled") is not True
        or before.get("productButtonConnectionCount") != 1
        or before.get("productButtonTotalConnectionCount") != 1
        or before.get("productViewConnectionCount") != 1
        or before.get("productViewTotalConnectionCount") != 1
        or before.get("viewObserverMode")
        != "synchronous_after_preexisting_host"
    ):
        raise Phase403BattleLayoutRecordingError(
            "Phase403攻击点击前必须锁住唯一正式产品回调链"
        )
    before_button_flags = _require_single_non_deferred_connection_flag(
        before.get("productButtonConnectionFlags"),
        "before.productButtonConnectionFlags",
    )
    before_view_flags = _require_single_non_deferred_connection_flag(
        before.get("productViewConnectionFlags"),
        "before.productViewConnectionFlags",
    )
    after_state = _require_attack_input_state(
        after,
        stage="deferred",
        modes=("player_attack_target",),
        require_point_classification=True,
    )
    if (
        after.get("classification") != "ok"
        or after.get("cleanupOk") is not True
        or after.get("productChainExactBefore") is not True
        or after.get("productChainExactAfterCleanup") is not True
        or after.get("productConnectionsNonDeferred") is not True
        or after.get("spiesInstalled") is not True
        or after.get("viewObserverMode")
        != "synchronous_after_preexisting_host"
        or after.get("unexpectedViewCommand") != ""
        or after.get("postDrawBoundaryReached") is not True
        or after.get("nextLoopPostDrawBoundaryReached") is not True
        or after.get("postDrawStateCaptured") is not True
        or type(after.get("sameLoopDelivered")) is not bool
        or after.get("nextLoopDelivered") is not True
        or after.get("observerSignalsDisconnected") is not True
        or after.get("releaseRoutingClassification")
        != "release_routed_and_button_up"
        or after.get("hoverMatchesTarget") is not True
        or after.get("battlePanelPoint") is not True
        or type(after.get("uiPoint")) is not bool
        or after.get("clickBattlePanelPoint") is not True
        or type(after.get("clickUiPoint")) is not bool
        or any(
            after.get(key) != 1
            for key in (
                "downCount",
                "upCount",
                "pressedCount",
                "viewAttackCount",
            )
        )
    ):
        raise Phase403BattleLayoutRecordingError(
            "Phase403攻击点击必须闭合hover、四信号、产品回调与cleanup"
        )
    gui_events = after.get("guiLeftButtonEvents")
    if not isinstance(gui_events, list) or len(gui_events) != 2:
        raise Phase403BattleLayoutRecordingError(
            "Phase403 gui_input observer必须精确收到左键press/release"
        )
    normalized_gui_events: list[dict[str, Any]] = []
    for index, expected_pressed in enumerate((True, False)):
        raw_event = gui_events[index]
        if not isinstance(raw_event, dict):
            raise Phase403BattleLayoutRecordingError(
                "Phase403 gui_input observer事件必须是字典"
            )
        button_mask = raw_event.get("buttonMask")
        if (
            raw_event.get("pressed") is not expected_pressed
            or raw_event.get("buttonIndex") != 1
            or type(button_mask) is not int
            or (expected_pressed and (button_mask & 1) == 0)
            or (not expected_pressed and (button_mask & 1) != 0)
        ):
            raise Phase403BattleLayoutRecordingError(
                "Phase403 gui_input observer左键press/release字段不完整"
            )
        position = _require_finite_number_array(
            raw_event.get("position"),
            2,
            f"guiLeftButtonEvents[{index}].position",
        )
        global_position = _require_finite_number_array(
            raw_event.get("globalPosition"),
            2,
            f"guiLeftButtonEvents[{index}].globalPosition",
        )
        normalized_gui_events.append(
            {
                "pressed": expected_pressed,
                "buttonIndex": 1,
                "buttonMask": button_mask,
                "position": list(position),
                "globalPosition": list(global_position),
            }
        )
    if (
        not _number_tuples_close(
            tuple(normalized_gui_events[0]["position"]),
            tuple(normalized_gui_events[1]["position"]),
        )
        or not _number_tuples_close(
            tuple(normalized_gui_events[0]["globalPosition"]),
            tuple(normalized_gui_events[1]["globalPosition"]),
        )
    ):
        raise Phase403BattleLayoutRecordingError(
            "Phase403 gui_input press/release必须命中同一坐标"
        )
    mouse_entered_count = after.get("mouseEnteredCount")
    mouse_exited_count = after.get("mouseExitedCount")
    if (
        type(mouse_entered_count) is not int
        or mouse_entered_count < 0
        or type(mouse_exited_count) is not int
        or mouse_exited_count < 0
    ):
        raise Phase403BattleLayoutRecordingError(
            "Phase403 mouse enter/exit计数必须是非负诊断值"
        )
    route_stages = after.get("routeStages")
    if (
        not isinstance(route_stages, list)
        or len(route_stages) != len(EXPECTED_ATTACK_ROUTE_STAGES)
    ):
        raise Phase403BattleLayoutRecordingError(
            "Phase403分段输入路由必须包含六个精确阶段"
        )
    normalized_route_stages: list[dict[str, Any]] = []
    parent_identity: tuple[str, int] | None = None
    prior_process_frame = -1
    release_delivery_started = False
    for index, expected_stage in enumerate(EXPECTED_ATTACK_ROUTE_STAGES):
        raw_stage = route_stages[index]
        if not isinstance(raw_stage, dict):
            raise Phase403BattleLayoutRecordingError(
                "Phase403分段输入路由阶段必须是字典"
            )
        stage_rect = _require_finite_number_array(
            raw_stage.get("buttonGlobalRect"),
            4,
            f"routeStages[{index}].buttonGlobalRect",
        )
        parent_path = raw_stage.get("buttonParentPath")
        parent_instance_id = raw_stage.get("buttonParentInstanceId")
        hovered_path = raw_stage.get("viewportHoveredPath")
        hovered_instance_id = raw_stage.get("viewportHoveredInstanceId")
        process_frame = raw_stage.get("processFrame")
        is_final_stage = expected_stage == "release_next_loop_post_draw"
        hover_state_typed = (
            type(raw_stage.get("buttonIsHovered")) is bool
            and isinstance(hovered_path, str)
            and type(hovered_instance_id) is int
            and hovered_instance_id >= 0
            and type(raw_stage.get("viewportHoveredMatchesButton")) is bool
        )
        hover_state_pre_release_ok = (
            raw_stage.get("buttonIsHovered") is True
            and bool(hovered_path)
            and (
                hovered_path == before_state["buttonPath"]
                or hovered_path.startswith(before_state["buttonPath"] + "/")
            )
            and hovered_instance_id > 0
            and (
                hovered_path != before_state["buttonPath"]
                or hovered_instance_id == before_state["buttonInstanceId"]
            )
            and raw_stage.get("viewportHoveredMatchesButton") is True
        )
        hover_state_final_ok = (
            hover_state_pre_release_ok
            or (
                raw_stage.get("buttonIsHovered") is False
                and hovered_path == ""
                and hovered_instance_id == 0
                and raw_stage.get("viewportHoveredMatchesButton") is False
            )
        )
        stage_counts = tuple(
            raw_stage.get(key)
            for key in (
                "downCount",
                "upCount",
                "pressedCount",
                "viewAttackCount",
                "guiLeftButtonEventCount",
                "guiLeftButtonPressCount",
                "guiLeftButtonReleaseCount",
            )
        )
        if (
            raw_stage.get("stage") != expected_stage
            or raw_stage.get("buttonPath") != before_state["buttonPath"]
            or raw_stage.get("buttonInstanceId")
            != before_state["buttonInstanceId"]
            or tuple(stage_rect) != tuple(before_state["buttonGlobalRect"])
            or not isinstance(parent_path, str)
            or not parent_path
            or type(parent_instance_id) is not int
            or parent_instance_id <= 0
            or raw_stage.get("buttonVisible") is not True
            or raw_stage.get("buttonDisabled") is not False
            or type(raw_stage.get("buttonMouseFilter")) is not int
            or type(raw_stage.get("buttonActionMode")) is not int
            or type(raw_stage.get("buttonKeepPressedOutside")) is not bool
            or type(raw_stage.get("buttonPressed")) is not bool
            or not hover_state_typed
            or (not is_final_stage and not hover_state_pre_release_ok)
            or (is_final_stage and not hover_state_final_ok)
            or type(raw_stage.get("inputLeftPressed")) is not bool
            or type(process_frame) is not int
            or process_frame < 0
            or process_frame < prior_process_frame
            or any(type(value) is not int or value < 0 for value in stage_counts)
            or stage_counts[4] != stage_counts[5] + stage_counts[6]
        ):
            raise Phase403BattleLayoutRecordingError(
                "Phase403分段输入路由必须绑定同一真实button及完整状态"
            )
        prior_process_frame = process_frame
        current_parent_identity = (parent_path, parent_instance_id)
        if parent_identity is None:
            parent_identity = current_parent_identity
        elif current_parent_identity != parent_identity:
            raise Phase403BattleLayoutRecordingError(
                "Phase403分段输入路由button parent身份发生漂移"
            )

        press_not_delivered = (
            raw_stage["inputLeftPressed"] is False
            and raw_stage["buttonPressed"] is False
            and stage_counts == (0, 0, 0, 0, 0, 0, 0)
        )
        press_delivered = (
            raw_stage["inputLeftPressed"] is True
            and raw_stage["buttonPressed"] is True
            and stage_counts == (1, 0, 0, 0, 1, 1, 0)
        )
        release_delivered = (
            raw_stage["inputLeftPressed"] is False
            and raw_stage["buttonPressed"] is False
            and stage_counts == (1, 1, 1, 1, 2, 1, 1)
        )
        if expected_stage == "press_sync":
            stage_state_ok = press_not_delivered or press_delivered
        elif expected_stage == "pre_release":
            stage_state_ok = press_delivered
        elif expected_stage in (
            "release_sync",
            "release_process",
            "release_post_draw",
        ):
            stage_state_ok = press_delivered or release_delivered
            if release_delivery_started and not release_delivered:
                stage_state_ok = False
            release_delivery_started = (
                release_delivery_started or release_delivered
            )
        else:
            stage_state_ok = release_delivered
        if not stage_state_ok:
            raise Phase403BattleLayoutRecordingError(
                "Phase403分段输入路由状态必须为未投递或完整投递，禁止半投递"
            )
        normalized_route_stages.append(dict(raw_stage))

    process_frames = tuple(
        stage["processFrame"] for stage in normalized_route_stages
    )
    if (
        process_frames[0] >= process_frames[1]
        or process_frames[2] != process_frames[1]
        or process_frames[3] != process_frames[2]
        or process_frames[4] != process_frames[3]
        or process_frames[4] >= process_frames[5]
    ):
        raise Phase403BattleLayoutRecordingError(
            "Phase403六阶段必须锁住press<release同轮<next自然loop"
        )

    same_loop_stage = normalized_route_stages[-2]
    next_loop_stage = normalized_route_stages[-1]
    same_loop_delivered = (
        same_loop_stage["inputLeftPressed"] is False
        and same_loop_stage["buttonPressed"] is False
        and same_loop_stage["downCount"] == 1
        and same_loop_stage["upCount"] == 1
        and same_loop_stage["pressedCount"] == 1
        and same_loop_stage["viewAttackCount"] == 1
        and same_loop_stage["guiLeftButtonEventCount"] == 2
        and same_loop_stage["guiLeftButtonPressCount"] == 1
        and same_loop_stage["guiLeftButtonReleaseCount"] == 1
    )
    next_loop_delivered = (
        next_loop_stage["inputLeftPressed"] is False
        and next_loop_stage["buttonPressed"] is False
        and next_loop_stage["downCount"] == 1
        and next_loop_stage["upCount"] == 1
        and next_loop_stage["pressedCount"] == 1
        and next_loop_stage["viewAttackCount"] == 1
        and next_loop_stage["guiLeftButtonEventCount"] == 2
        and next_loop_stage["guiLeftButtonPressCount"] == 1
        and next_loop_stage["guiLeftButtonReleaseCount"] == 1
    )
    boundary_specs = (
        ("sameLoop", same_loop_stage, same_loop_delivered),
        ("nextLoop", next_loop_stage, next_loop_delivered),
    )
    for prefix, stage_payload, delivered in boundary_specs:
        if (
            type(after.get(prefix + "ProcessFrame")) is not int
            or type(after.get(prefix + "GuiLeftButtonEventCount")) is not int
            or type(after.get(prefix + "GuiLeftButtonPressCount")) is not int
            or type(after.get(prefix + "GuiLeftButtonReleaseCount")) is not int
            or after.get(prefix + "Delivered") is not delivered
            or after.get(prefix + "ProcessFrame")
            != stage_payload["processFrame"]
            or after.get(prefix + "GuiLeftButtonEventCount")
            != stage_payload["guiLeftButtonEventCount"]
            or after.get(prefix + "GuiLeftButtonPressCount")
            != stage_payload["guiLeftButtonPressCount"]
            or after.get(prefix + "GuiLeftButtonReleaseCount")
            != stage_payload["guiLeftButtonReleaseCount"]
        ):
            raise Phase403BattleLayoutRecordingError(
                f"Phase403 {prefix}投递标记、process frame或GUI计数不真实"
            )
    if (
        not next_loop_delivered
        or next_loop_stage["processFrame"] <= same_loop_stage["processFrame"]
    ):
        raise Phase403BattleLayoutRecordingError(
            "Phase403最终成功门必须跨下一自然process并完整收到release/up/pressed/view"
        )
    after_button_flags = _require_single_non_deferred_connection_flag(
        after.get("productButtonConnectionFlags"),
        "after.productButtonConnectionFlags",
    )
    after_view_flags = _require_single_non_deferred_connection_flag(
        after.get("productViewConnectionFlags"),
        "after.productViewConnectionFlags",
    )
    if (
        after_button_flags != before_button_flags
        or after_view_flags != before_view_flags
    ):
        raise Phase403BattleLayoutRecordingError(
            "Phase403攻击点击前后正式连接flags发生漂移"
        )
    for key in ("targetInstanceId", "hoveredInstanceId"):
        if type(after.get(key)) is not int or after[key] <= 0:
            raise Phase403BattleLayoutRecordingError(
                f"Phase403攻击点击诊断{key}必须是实际Control实例"
            )
    target_path = after.get("targetPath")
    hovered_path = after.get("hoveredPath")
    if (
        after.get("targetInstanceId") != before_state["buttonInstanceId"]
        or target_path != before_state["buttonPath"]
        or not isinstance(hovered_path, str)
        or not hovered_path
        or not (
            hovered_path == target_path
            or hovered_path.startswith(target_path + "/")
        )
        or (
            hovered_path == target_path
            and after.get("hoveredInstanceId")
            != after.get("targetInstanceId")
        )
        or type(after.get("hoveredMouseFilter")) is not int
        or after["hoveredMouseFilter"] not in (0, 1, 2)
        or type(after.get("hoveredZIndex")) is not int
    ):
        raise Phase403BattleLayoutRecordingError(
            "Phase403攻击点击hover/target实例诊断不完整"
        )
    before_viewport = _require_finite_number_array(
        before_state.get("viewportPoint"),
        2,
        "before.viewportPoint",
    )
    before_transform = _require_finite_number_array(
        before_state.get("screenTransform"),
        6,
        "before.screenTransform",
    )
    before_input = _require_finite_number_array(
        before_state.get("inputPosition"),
        2,
        "before.inputPosition",
    )
    after_viewport = _require_finite_number_array(
        after_state.get("viewportPoint"),
        2,
        "after.viewportPoint",
    )
    after_transform = _require_finite_number_array(
        after_state.get("screenTransform"),
        6,
        "after.screenTransform",
    )
    after_input = _require_finite_number_array(
        after_state.get("inputPosition"),
        2,
        "after.inputPosition",
    )
    click_viewport = _require_finite_number_array(
        after.get("clickViewportPoint"),
        2,
        "click.viewportPoint",
    )
    click_transform = _require_finite_number_array(
        after.get("clickScreenTransform"),
        6,
        "click.screenTransform",
    )
    click_input = _require_finite_number_array(
        after.get("clickInputPosition"),
        2,
        "click.inputPosition",
    )
    if (
        not _number_tuples_close(before_viewport, after_viewport)
        or not _number_tuples_close(before_viewport, click_viewport)
        or not _number_tuples_close(before_transform, after_transform)
        or not _number_tuples_close(before_transform, click_transform)
        or not _number_tuples_close(before_input, after_input)
        or not _number_tuples_close(before_input, click_input)
        or any(
            not _number_tuples_close(
                tuple(event["globalPosition"]),
                before_input,
            )
            for event in normalized_gui_events
        )
        or not _number_tuples_close(
            click_input,
            _transform2d_point(click_transform, click_viewport),
        )
    ):
        raise Phase403BattleLayoutRecordingError(
            "Phase403攻击点击before/after/click坐标链不一致"
        )
    nested_specs = (
        ("downState", "down", ("enemy",)),
        (
            "releaseState",
            "release",
            ("enemy", "player_attack_target"),
        ),
        ("pressedState", "pressed", ("player_attack_target",)),
        ("viewState", "view", ("player_attack_target",)),
    )
    nested_states: dict[str, dict[str, Any]] = {}
    for key, stage, modes in nested_specs:
        nested = _require_attack_input_state(
            after.get(key),
            stage=stage,
            modes=modes,
            require_point_classification=False,
        )
        nested_states[key] = nested
    comparison_states = (after_state, *nested_states.values())
    for state in comparison_states:
        if (
            state["buttonInstanceId"] != before_state["buttonInstanceId"]
            or state["buttonPath"] != before_state["buttonPath"]
            or state["buttonGlobalRect"] != before_state["buttonGlobalRect"]
        ):
            raise Phase403BattleLayoutRecordingError(
                "Phase403攻击点击各阶段必须来自同一正式攻击按钮"
            )
    return {
        "classification": "ok",
        "buttonPath": before_state["buttonPath"],
        "buttonInstanceId": before_state["buttonInstanceId"],
        "hoveredPath": after["hoveredPath"],
        "uiPoint": after["uiPoint"],
        "battlePanelPoint": True,
        "coordinates": {
            "buttonGlobalRect": list(before_state["buttonGlobalRect"]),
            "viewportPoint": list(before_viewport),
            "screenTransform": list(before_transform),
            "inputPosition": list(before_input),
        },
        "productConnectionFlags": {
            "button": before_button_flags,
            "view": before_view_flags,
            "nonDeferred": True,
        },
        "postDrawBoundary": {
            "sameLoop": True,
            "nextLoop": True,
        },
        "routing": {
            "classification": "release_routed_and_button_up",
            "sameLoopDelivered": same_loop_delivered,
            "nextLoopDelivered": next_loop_delivered,
            "sameLoopProcessFrame": same_loop_stage["processFrame"],
            "nextLoopProcessFrame": next_loop_stage["processFrame"],
            "guiLeftButtonEvents": normalized_gui_events,
            "mouseEnteredCount": mouse_entered_count,
            "mouseExitedCount": mouse_exited_count,
            "stages": normalized_route_stages,
            "observersDisconnected": True,
        },
        "signals": {
            "down": 1,
            "up": 1,
            "pressed": 1,
            "viewAttack": 1,
        },
        "cleanup": True,
    }


def _validate_godot_log(
    path: Path,
    *,
    require_movie_maker: bool = True,
) -> dict[str, Any]:
    text = path.read_text(encoding="utf-8")
    if FAILURE_MARKER in text:
        raise Phase403BattleLayoutRecordingError(
            "Godot Phase403正式战斗布局验收报告失败"
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
        "phase402",
    ):
        if forbidden.lower() in text.lower():
            raise Phase403BattleLayoutRecordingError(
                f"Godot Phase403录像日志包含禁止内容：{forbidden}"
            )
    if "Metal 4.0 - Forward Mobile" not in text:
        raise Phase403BattleLayoutRecordingError(
            "Phase403正式录像没有使用Metal Forward Mobile"
        )
    movie_maker_present = re.search(
        r"Movie Maker mode enabled, recording movie in "
        r"1280(?:x|×)720 @ 30 FPS",
        text,
    ) is not None
    if require_movie_maker and not movie_maker_present:
        raise Phase403BattleLayoutRecordingError(
            "Phase403正式录像未确认1280x720@30fps Movie Maker"
        )
    if not require_movie_maker and movie_maker_present:
        raise Phase403BattleLayoutRecordingError(
            "Phase403原生验收日志不得伪装Movie Maker阶段"
        )

    start_lines: list[str] = []
    fixture_lines: list[str] = []
    layout_lines: list[str] = []
    review_only_lines: list[str] = []
    arena_lines: list[str] = []
    end_lines: list[str] = []
    chapter_lines: list[str] = []
    target_lines: list[str] = []
    attack_before_lines: list[str] = []
    attack_after_lines: list[str] = []
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if line.startswith(START_MARKER + " "):
            start_lines.append(line)
        elif line.startswith(FIXTURE_MARKER + " "):
            fixture_lines.append(line)
        elif line.startswith(LAYOUT_MARKER + " "):
            layout_lines.append(line)
        elif line.startswith(REVIEW_ONLY_MARKER + " "):
            review_only_lines.append(line)
        elif line.startswith(ARENA_MARKER + " "):
            arena_lines.append(line)
        elif line.startswith(CHAPTER_MARKER + " "):
            chapter_lines.append(line)
        elif line.startswith(TARGET_MARKER + " "):
            target_lines.append(line)
        elif line.startswith(ATTACK_INPUT_BEFORE_MARKER + " "):
            attack_before_lines.append(line)
        elif line.startswith(ATTACK_INPUT_AFTER_MARKER + " "):
            attack_after_lines.append(line)
        elif line.startswith(END_MARKER + " "):
            end_lines.append(line)
    singular_markers = {
        START_MARKER: start_lines,
        FIXTURE_MARKER: fixture_lines,
        LAYOUT_MARKER: layout_lines,
        REVIEW_ONLY_MARKER: review_only_lines,
        ARENA_MARKER: arena_lines,
        ATTACK_INPUT_BEFORE_MARKER: attack_before_lines,
        ATTACK_INPUT_AFTER_MARKER: attack_after_lines,
        END_MARKER: end_lines,
    }
    if any(len(lines) != 1 for lines in singular_markers.values()):
        raise Phase403BattleLayoutRecordingError(
            "Phase403/412录像的起点、fixture、布局、战场、攻击诊断、review-only与终点标记必须各且仅有一个"
        )
    start_line = start_lines[0]
    fixture_line = fixture_lines[0]
    layout_line = layout_lines[0]
    review_only_line = review_only_lines[0]
    arena_line = arena_lines[0]
    attack_before_line = attack_before_lines[0]
    attack_after_line = attack_after_lines[0]
    end_line = end_lines[0]

    marker_offsets = (
        text.find(CHAPTER_MARKER + " chapter=formal_idle "),
        text.find(ATTACK_INPUT_BEFORE_MARKER + " "),
        text.find(ATTACK_INPUT_AFTER_MARKER + " "),
        text.find(CHAPTER_MARKER + " chapter=command_selection_a "),
    )
    if any(offset < 0 for offset in marker_offsets) or tuple(
        sorted(marker_offsets)
    ) != marker_offsets:
        raise Phase403BattleLayoutRecordingError(
            "Phase403攻击诊断必须位于formal_idle后、首个指令章节前且顺序唯一"
        )
    attack_input = _validate_attack_input_diagnostic(
        _parse_attack_input_json(
            attack_before_line,
            ATTACK_INPUT_BEFORE_MARKER,
        ),
        _parse_attack_input_json(
            attack_after_line,
            ATTACK_INPUT_AFTER_MARKER,
        ),
    )

    start = _parse_fields(start_line)
    if (
        start.get("scene") != "Main.tscn"
        or start.get("entry") != "MainSceneFlag"
        or start.get("viewport") != "1280x720"
        or start.get("formation") != "10v10"
        or _require_int(start, "actors") != 20
    ):
        raise Phase403BattleLayoutRecordingError(
            "Phase403录像起点不是真实Main 1280x720正式20人战斗"
        )
    _require_bool(start, "backend", False)
    _require_bool(start, "profile_save", False)

    fixture = _parse_fields(fixture_line)
    expected_fixture = {
        "character": "ember_spark_v1",
        "character_lifecycle": "owner_review_pending",
        "pet": "wuli_evolved_crystal_earth8_water2",
        "pet_lifecycle": "approved",
        "runtime_frame": "256x256",
        "source_image_frame": "512x512",
        "draw_canvas": "156x156",
        "visual_scale": "0.74",
        "character_name_chars": "24",
        "pet_name_chars": "8",
        "mounted_player_actors": "0",
    }
    if any(fixture.get(key) != value for key, value in expected_fixture.items()):
        raise Phase403BattleLayoutRecordingError(
            "Phase403录像fixture没有绑定最大正式人物/宠物/长名"
        )
    for key in ("character_runtime", "pet_runtime", "lifecycle_unchanged"):
        _require_bool(fixture, key, True)

    layout = _parse_fields(layout_line)
    if (
        layout.get("id") != LAYOUT_IDENTITY
        or layout.get("formation") != "10v10"
        or _require_int(layout, "actors") != 20
        or layout.get("origin") != "94x340.4"
        or layout.get("lane") != "152x52"
        or layout.get("rank") != "64x-48"
        or layout.get("envelope") != "132x164"
        or _require_int(layout, "hud_collisions") != 0
        or _require_int(layout, "viewport_violations") != 0
    ):
        raise Phase403BattleLayoutRecordingError(
            "Phase403录像布局identity或HUD零交合同漂移"
        )
    _require_bool(layout, "exact", True)

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
        or review_only.get("mount_scale") != "0.88"
        or review_only.get("visual_scale") != "0.74"
        or not math.isclose(review_envelope_px, 132.0, abs_tol=0.01)
        or review_visible_px > review_envelope_px
    ):
        raise Phase403BattleLayoutRecordingError(
            "Phase403 review-only整体骑乘宽度合同不完整"
        )
    for key in ("geometry_only", "width_covered"):
        _require_bool(review_only, key, True)
    _require_bool(review_only, "actual_bundle_warmed", True)
    for key in (
        "player_visible",
        "ordinary_battle",
        "inserted_into_battle_state",
        "vertical_recomputed",
        "anchor_recomputed",
        "slot_collisions_recomputed",
    ):
        _require_bool(review_only, key, False)

    arena_visual = _validate_arena_visual_marker(arena_line)

    chapters = tuple(
        _parse_fields(line).get("chapter", "") for line in chapter_lines
    )
    if chapters != EXPECTED_CHAPTERS:
        raise Phase403BattleLayoutRecordingError(
            "Phase403录像章节必须按正式idle/指令/相邻目标顺序完整闭合"
        )
    movie_frames: list[int] = []
    for line in chapter_lines:
        fields = _parse_fields(line)
        movie_frames.append(_require_int(fields, "movie_frame"))
        _require_positive_finite_float(fields, "seconds")
    if movie_frames != sorted(movie_frames) or len(set(movie_frames)) != len(movie_frames):
        raise Phase403BattleLayoutRecordingError(
            "Phase403录像章节movie_frame必须严格递增"
        )

    if len(target_lines) != len(EXPECTED_TARGETS):
        raise Phase403BattleLayoutRecordingError(
            "Phase403录像必须精确命中两个相邻actor"
        )
    for index, (line, expected) in enumerate(
        zip(target_lines, EXPECTED_TARGETS),
        start=1,
    ):
        fields = _parse_fields(line)
        actor_id, slot_id = expected
        if (
            _require_int(fields, "index") != index
            or fields.get("actor") != actor_id
            or fields.get("slot") != slot_id
            or fields.get("expected") != actor_id
            or fields.get("resolved") != actor_id
            or not math.isclose(
                float(fields.get("adjacent_distance", "nan")),
                80.0,
                abs_tol=0.01,
            )
        ):
            raise Phase403BattleLayoutRecordingError(
                f"Phase403第{index}个相邻actor没有精确命中"
            )
        for key in ("exact", "focus_label_fits"):
            _require_bool(fields, key, True)
        _require_bool(fields, "hud_overlap", False)

    end = _parse_fields(end_line)
    _require_positive_finite_float(end, "elapsed_wall")
    if (
        end.get("status") != "passed"
        or end.get("scene") != "Main.tscn"
        or end.get("entry") != "MainSceneFlag"
        or end.get("viewport") != "1280x720"
        or end.get("layout_identity") != LAYOUT_IDENTITY
        or _require_int(end, "actors") != 20
        or _require_int(end, "hud_collisions") != 0
        or _require_int(end, "viewport_violations") != 0
        or _require_int(end, "hud_passthrough") != 0
        or _require_int(end, "exact_targets") != 2
        or _require_int(end, "mounted_player_actors") != 0
        or _require_int(end, "actual_left_clicks") != EXPECTED_LEFT_CLICKS
        or _require_int(end, "cross_frame_presses") != EXPECTED_LEFT_CLICKS
    ):
        raise Phase403BattleLayoutRecordingError(
            "Phase403录像终点未闭合20人/HUD/精确目标/跨帧合同"
        )
    for key in ("layout_exact", "review_only_mount"):
        _require_bool(end, key, True)
    for key in ("backend", "profile_save"):
        _require_bool(end, key, False)
    return {
        "status": "passed",
        "entryMode": "MainSceneFlag",
        "viewport": "1280x720",
        "layoutIdentity": LAYOUT_IDENTITY,
        "actorCount": 20,
        "chapterCount": len(chapters),
        "chapters": list(chapters),
        "targetSlots": [slot_id for _actor_id, slot_id in EXPECTED_TARGETS],
        "exactTargetCount": 2,
        "actualLeftClicks": EXPECTED_LEFT_CLICKS,
        "crossFramePresses": EXPECTED_LEFT_CLICKS,
        "hudCollisions": 0,
        "hudPassthrough": 0,
        "reviewOnlyMountWidthOnly": True,
        "reviewOnlyMountSlotCollisionClaimed": False,
        "ordinaryBattleContainsMount": False,
        "arenaVisual": arena_visual,
        "attackInput": attack_input,
    }


def _phase403_capture_contract() -> dict[str, Any]:
    return {
        "normalMainScene": True,
        "width": 1280,
        "height": 720,
        "fps": 30.0,
        "playbackSpeed": 1.0,
        "formationTemplate": "10v10",
        "actorCount": 20,
        "layoutIdentity": LAYOUT_IDENTITY,
        "formalCharacter": "ember_spark_v1",
        "formalPet": "wuli_evolved_crystal_earth8_water2",
        "maximumCharacterNameChars": 24,
        "maximumPetNameChars": 8,
        "realCrossFrameLeftClicks": True,
        "exactAdjacentTargetSlots": [
            slot_id for _actor_id, slot_id in EXPECTED_TARGETS
        ],
        "persistentHudCollisions": 0,
        "hudPassthrough": 0,
        "reviewOnlyMountWidthOnly": True,
        "reviewOnlyMountSlotCollisionClaimed": False,
        "ordinaryBattleContainsMount": False,
        "arenaVisual": {
            "id": EXPECTED_ARENA_ID,
            "bundleId": EXPECTED_ARENA_BUNDLE_ID,
            "sourceMapId": "firebud_village_gate",
            "sha256": EXPECTED_ARENA_SHA256,
            "ownerReviewStatus": "pending",
            "runtimeEnabled": False,
            "releaseApproved": False,
            "qaPreviewEnabled": True,
            "explicitCaptureOnly": True,
            "ordinaryPlayerEnabled": False,
        },
        "httpRequests": False,
        "serverWrites": 0,
        "audioRequired": True,
    }


def _record_into(
    *,
    args: argparse.Namespace,
    run_id: str,
    run_dir: Path,
) -> Path:
    timeout_seconds = float(args.timeout_seconds)
    if not math.isfinite(timeout_seconds) or timeout_seconds <= 0:
        raise Phase403BattleLayoutRecordingError(
            "--timeout-seconds必须是有限正数"
        )
    requested_sample_times = tuple(args.sample_times or ())
    if not requested_sample_times:
        if int(args.sample_count) < 2 or int(args.sample_count) > MAX_SAMPLE_COUNT:
            raise Phase403BattleLayoutRecordingError(
                f"--sample-count必须介于2和{MAX_SAMPLE_COUNT}"
            )
    else:
        normalized_times = tuple(float(value) for value in requested_sample_times)
        if (
            len(normalized_times) < 2
            or len(normalized_times) > MAX_SAMPLE_COUNT
            or not all(math.isfinite(value) for value in normalized_times)
            or any(value < 0 for value in normalized_times)
            or tuple(sorted(normalized_times)) != normalized_times
            or len(set(normalized_times)) != len(normalized_times)
        ):
            raise Phase403BattleLayoutRecordingError(
                "--sample-time必须是2-16个有限、非负、严格递增且不重复的秒数"
            )
    try:
        godot = CORE._require_executable(args.godot, label="Godot")
        ffmpeg = CORE._require_executable(args.ffmpeg, label="ffmpeg")
        ffprobe = CORE._require_executable(args.ffprobe, label="ffprobe")
    except CORE.PetManagementRecordingError as error:
        raise Phase403BattleLayoutRecordingError(str(error)) from error

    temporary_dir = run_dir / "tmp"
    temporary_dir.mkdir(parents=False, exist_ok=False)
    base_environment = CORE._isolated_environment(temporary_dir)
    avi_path = run_dir / "phase403-battle-layout-owner-review-1x.avi"
    video_path = run_dir / "phase403-battle-layout-owner-review-1x.mp4"
    native_log = run_dir / "godot-native.log"
    movie_log = run_dir / "godot-movie.log"
    native_command = _build_native_godot_command(godot=godot)
    movie_command = _build_godot_command(
        godot=godot,
        avi_path=avi_path,
    )
    lane_evidence = CORE._run_official_lane_godot_sequence(
        run_dir=run_dir,
        godot=godot,
        base_environment=base_environment,
        native_command=native_command,
        native_log=native_log,
        native_log_validator=lambda path: _validate_godot_log(
            path,
            require_movie_maker=False,
        ),
        movie_command=movie_command,
        movie_log=movie_log,
        movie_log_validator=_validate_godot_log,
        timeout_seconds=timeout_seconds,
    )
    environment = lane_evidence["environment"]
    native_sequence = lane_evidence["native"]["logValidation"]
    godot_sequence = lane_evidence["movie"]["logValidation"]
    raw_movie = CORE._artifact_record(avi_path)

    transcode_log = run_dir / "ffmpeg-transcode.log"
    CORE._run_logged(
        [
            ffmpeg,
            "-y",
            "-v",
            "warning",
            "-i",
            str(avi_path),
            "-map",
            "0:v:0",
            "-map",
            "0:a:0",
            "-vf",
            "scale=in_range=pc:out_range=tv,format=yuv420p",
            "-c:v",
            "libx264",
            "-preset",
            "slow",
            "-crf",
            "18",
            "-pix_fmt",
            CORE.EXPECTED_PIXEL_FORMAT,
            "-color_range",
            "tv",
            "-c:a",
            CORE.EXPECTED_AUDIO_CODEC,
            "-b:a",
            "192k",
            "-ar",
            "48000",
            "-ac",
            "2",
            "-map_metadata",
            "-1",
            "-movflags",
            "+faststart",
            str(video_path),
        ],
        log_path=transcode_log,
        timeout_seconds=timeout_seconds,
        environment=environment,
    )
    probe_path = run_dir / "ffprobe.json"
    probe = CORE._write_probe(ffprobe, video_path, probe_path)
    media = CORE._validate_probe(probe)
    duration = float(media["durationSeconds"])
    if (
        not math.isfinite(duration)
        or duration < MIN_DURATION_SECONDS
        or duration > MAX_DURATION_SECONDS
    ):
        raise Phase403BattleLayoutRecordingError(
            "Phase403录像时长必须在"
            f"{MIN_DURATION_SECONDS:.0f}-{MAX_DURATION_SECONDS:.0f}秒"
        )

    decode_log = run_dir / "full-audio-video-decode.log"
    CORE._run_logged(
        [
            ffmpeg,
            "-v",
            "error",
            "-xerror",
            "-i",
            str(video_path),
            "-map",
            "0:v:0",
            "-map",
            "0:a:0",
            "-f",
            "null",
            "-",
        ],
        log_path=decode_log,
        timeout_seconds=timeout_seconds,
        environment=environment,
    )
    sample_times = CORE._selected_sample_times(
        duration,
        requested=requested_sample_times,
        sample_count=int(args.sample_count),
    )
    screenshots_dir = run_dir / "screenshots"
    screenshots = CORE._extract_review_frames(
        ffmpeg=ffmpeg,
        video_path=video_path,
        screenshots_dir=screenshots_dir,
        sample_times=sample_times,
        timeout_seconds=timeout_seconds,
    )
    contact = CORE._build_contact_sheet(
        ffmpeg=ffmpeg,
        screenshots_dir=screenshots_dir,
        output_path=run_dir / "contact-sheet.png",
        sample_count=len(sample_times),
        timeout_seconds=timeout_seconds,
    )
    video = {
        **CORE._artifact_record(video_path),
        **media,
        "playbackSpeed": 1.0,
        "decodeStatus": "passed",
    }
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
        "captureFlag": CAPTURE_FLAG,
        "captureContract": _phase403_capture_contract(),
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
            "serverWritesAllowed": False,
        },
        "tools": {
            "godot": lane_evidence["preflight"]["version"][
                "normalizedVersion"
            ],
            "ffmpeg": CORE._capture_version(ffmpeg, ["-version"]),
            "ffprobe": CORE._capture_version(ffprobe, ["-version"]),
            "python": sys.version.splitlines()[0],
        },
        "commands": {
            "native": CORE._redacted_command(native_command),
            "movie": CORE._redacted_command(movie_command),
        },
        "preflight": lane_evidence["preflight"],
        "sourceCheck": lane_evidence["sourceCheck"],
        "initialVerification": lane_evidence["initialVerification"],
        "native": lane_evidence["native"],
        "movie": lane_evidence["movie"],
        "qaLaneCleanup": lane_evidence["cleanup"],
        "postCleanupInspect": lane_evidence["postCleanupInspect"],
        "laneLifecycle": CORE._artifact_record(lane_evidence["lifecyclePath"]),
        "nativeSequence": native_sequence,
        "godotSequence": godot_sequence,
        "rawMovie": raw_movie,
        "video": video,
        "probe": CORE._artifact_record(probe_path),
        "fullDecode": {
            "status": "passed",
            "videoStreamDecoded": True,
            "audioStreamDecoded": True,
            "log": CORE._artifact_record(decode_log),
        },
        "screenshots": screenshots,
        "contactSheet": contact,
        "sha256Manifest": {
            "path": CORE._repo_relative(run_dir / "SHA256SUMS"),
            "coversAllRetainedEvidenceFiles": True,
            "writtenLast": True,
        },
        "logs": {
            "godotNative": CORE._artifact_record(native_log),
            "godotMovie": CORE._artifact_record(movie_log),
            "transcode": CORE._artifact_record(transcode_log),
        },
        "ownerReviewStatus": "pending",
    }
    summary_path = run_dir / "summary.json"
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
                "video": video["path"],
                "contactSheet": contact["path"],
                "summary": CORE._repo_relative(summary_path),
                "ownerReviewStatus": "pending",
            },
            ensure_ascii=False,
        ),
        flush=True,
    )
    CORE._write_sha256_manifest(run_dir, hash_paths)
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


def _record(args: argparse.Namespace) -> Path:
    if Path.cwd().resolve() != REPO_ROOT:
        raise Phase403BattleLayoutRecordingError(
            f"必须从仓库根执行：cd {REPO_ROOT}"
        )
    if not GODOT_PROJECT.is_dir():
        raise Phase403BattleLayoutRecordingError(
            f"Godot项目不存在：{GODOT_PROJECT}"
        )
    _require_main_flag_wiring()
    run_id = args.run_id or _new_run_id()
    if SAFE_RUN_ID.fullmatch(run_id) is None:
        raise Phase403BattleLayoutRecordingError(
            f"不安全的runId：{run_id!r}"
        )
    try:
        output_root = CORE._resolve_output_root(args.output_root)
    except CORE.PetManagementRecordingError as error:
        raise Phase403BattleLayoutRecordingError(str(error)) from error
    output_root.mkdir(parents=True, exist_ok=True)
    run_dir = output_root / run_id
    run_dir.mkdir(parents=False, exist_ok=False)
    try:
        return _record_into(args=args, run_id=run_id, run_dir=run_dir)
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
                    CORE._write_sha256_manifest(run_dir, retained)
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
            "通过真实Main.tscn录制Phase403正式1280x720十对十布局、"
            "相邻actor跨帧命中和HUD零交证据。"
        )
    )
    parser.add_argument("--run-id", help="可选唯一安全runId。")
    parser.add_argument(
        "--output-root",
        type=Path,
        default=DEFAULT_OUTPUT_ROOT,
    )
    parser.add_argument(
        "--sample-count",
        type=int,
        default=DEFAULT_SAMPLE_COUNT,
    )
    parser.add_argument(
        "--sample-time",
        type=float,
        action="append",
        dest="sample_times",
    )
    parser.add_argument("--godot", default=os.environ.get("GODOT_BIN", "godot"))
    parser.add_argument(
        "--ffmpeg", default=os.environ.get("FFMPEG_BIN", "ffmpeg")
    )
    parser.add_argument(
        "--ffprobe", default=os.environ.get("FFPROBE_BIN", "ffprobe")
    )
    parser.add_argument("--timeout-seconds", type=float, default=900.0)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    if int(args.sample_count) < 2 or int(args.sample_count) > MAX_SAMPLE_COUNT:
        print(
            f"sample count must be between 2 and {MAX_SAMPLE_COUNT}",
            file=sys.stderr,
        )
        return 1
    try:
        _record(args)
    except KeyboardInterrupt:
        print("phase403 battle layout recording interrupted", file=sys.stderr)
        return 130
    except (
        Phase403BattleLayoutRecordingError,
        CORE.PetManagementRecordingError,
        FileExistsError,
        OSError,
        ValueError,
    ) as error:
        print(f"phase403 battle layout recording failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
