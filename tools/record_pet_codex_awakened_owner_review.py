#!/usr/bin/env python3
"""Record the formal awakened pet-codex flow from the real ``Main.tscn``.

The recorder runs in the owner-attested automation QA lane, drives only
cross-frame left clicks, requires an audible 1280x720/30fps H.264 artifact, and
fails closed on Godot warnings, errors, leaks, missing flow chapters, or an
incomplete return to the formal Phase396 world HUD.
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
    "_beastbound_pet_codex_media_core",
    CORE_PATH,
)

GODOT_PROJECT = REPO_ROOT / "client" / "godot"
MAIN_SCENE = "res://scenes/Main.tscn"
MAIN_SCRIPT_PATH = GODOT_PROJECT / "scripts" / "main.gd"
CAPTURE_HELPER_PATH = (
    GODOT_PROJECT
    / "scripts"
    / "qa"
    / "pet_codex_awakened_owner_review_capture.gd"
)
CAPTURE_FLAG = "--pet-codex-awakened-owner-review-capture"
NATIVE_PERF_FLAG = "--pet-codex-awakened-owner-review-native-perf"
DEFAULT_OUTPUT_ROOT = Path(
    ".run/evidence/phase398_pet_codex_awakened_owner_review"
)
REPORT_SCHEMA_VERSION = 2
REPORT_TYPE = "beastbound_pet_codex_awakened_owner_review_video"
EXPECTED_WIDTH = 1280
EXPECTED_HEIGHT = 720
EXPECTED_FPS = 30
EXPECTED_VIDEO_CODEC = "h264"
EXPECTED_PIXEL_FORMAT = "yuv420p"
EXPECTED_AUDIO_CODEC = "aac"
EXPECTED_AUDIO_SAMPLE_RATE = 48000
EXPECTED_AUDIO_CHANNELS = 2
MIN_DURATION_SECONDS = 15.0
MAX_DURATION_SECONDS = 25.0
DEFAULT_SAMPLE_COUNT = 15
MAX_SAMPLE_COUNT = 16
SAFE_RUN_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")

START_MARKER = "PET_CODEX_AWAKENED_OWNER_REVIEW_START"
CHAPTER_MARKER = "PET_CODEX_AWAKENED_OWNER_REVIEW_CHAPTER"
STATE_MARKER = "PET_CODEX_AWAKENED_OWNER_REVIEW_STATE"
END_MARKER = "PET_CODEX_AWAKENED_OWNER_REVIEW_END"
FAILURE_MARKER = "PET_CODEX_AWAKENED_OWNER_REVIEW_FAILED"
EXPECTED_CHAPTERS = (
    ("world_formal_hud", 1.6),
    ("codex_open", 1.8),
    ("family_and_form", 2.0),
    ("attributes_tab", 1.5),
    ("growth_tab", 1.5),
    ("acquisition_embedded", 2.2),
    ("top_close_collapses_embedded", 1.4),
    ("embedded_close", 1.5),
    ("return_world_hud", 2.0),
)
EXPECTED_STATE_FLAGS = (
    "world_hud_before",
    "real_codex_entry",
    "family_form",
    "attributes_growth",
    "acquisition_open",
    "modal_blocks_underlay",
    "top_close_collapses",
    "embedded_close",
    "world_hud_restored",
    "world_hud_clickable",
    "message_panel_restored",
    "safe_area_restored",
    "movement_bounds_restored",
    "camera_state_restored",
    "menu_fps60",
    "idle_fps30",
    "battle_fps60",
    "foreground_contract",
    "pending_portrait_blocked",
    "no_player_qa_text",
    "hot_selection",
    "route_cache_stable",
)


class PetCodexRecordingError(RuntimeError):
    """The formal pet-codex owner-review contract was not met."""


def _load_media_core() -> Any:
    if CORE_SPEC is None or CORE_SPEC.loader is None:
        raise RuntimeError(f"无法加载媒体录制核心：{CORE_PATH}")
    module = importlib.util.module_from_spec(CORE_SPEC)
    CORE_SPEC.loader.exec_module(module)
    return module


CORE = _load_media_core()


def _require_main_hosted_capture_wiring(
    *,
    main_source: str | None = None,
    capture_source: str | None = None,
) -> None:
    try:
        main_text = (
            main_source
            if main_source is not None
            else MAIN_SCRIPT_PATH.read_text(encoding="utf-8")
        )
        capture_text = (
            capture_source
            if capture_source is not None
            else CAPTURE_HELPER_PATH.read_text(encoding="utf-8")
        )
    except OSError as error:
        raise PetCodexRecordingError(
            "无法读取正式 Main-hosted 图鉴录像接线"
        ) from error

    def require_count(source: str, fragment: str, count: int = 1) -> None:
        if source.count(fragment) != count:
            raise PetCodexRecordingError(
                f"Main-hosted 图鉴录像接线不精确：{fragment}"
            )

    def function_slice(source: str, signature: str) -> str:
        if source.count(signature) != 1:
            raise PetCodexRecordingError(
                f"Main-hosted 图鉴录像函数不精确：{signature}"
            )
        start = source.index(signature)
        end = source.find("\nfunc ", start + 1)
        return source[start:] if end < 0 else source[start:end]

    if not capture_text.startswith("extends RefCounted\n"):
        raise PetCodexRecordingError("图鉴录像必须是 RefCounted Main host helper")
    for forbidden in (
        "extends SceneTree",
        'preload("res://scenes/Main.tscn")',
        ".instantiate(",
        ".add_child(",
        ".remove_child(",
        ".free(",
        "queue_free(",
    ):
        if forbidden in capture_text:
            raise PetCodexRecordingError(
                f"图鉴录像不得自建或释放 Main：{forbidden}"
            )
    if re.search(r"(?m)^\s*(?:[A-Za-z_][A-Za-z0-9_]*\.)?current_scene\s*=(?!=)", capture_text):
        raise PetCodexRecordingError("图鉴录像不得重写 SceneTree.current_scene")
    require_count(capture_text, f'const CAPTURE_FLAG := "{CAPTURE_FLAG}"')
    require_count(
        capture_text,
        f'const NATIVE_PERF_FLAG := "{NATIVE_PERF_FLAG}"',
    )
    is_flag_slice = function_slice(
        capture_text,
        "static func is_flag(argument: String) -> bool:",
    )
    require_count(
        is_flag_slice,
        "return argument == CAPTURE_FLAG or argument == NATIVE_PERF_FLAG",
    )
    run_slice = function_slice(capture_text, "func run() -> void:")
    for fragment in (
        "capture_count != 1 or native_perf_count > 1",
        "_native_perf_mode = native_perf_count == 1",
        "await _run()",
    ):
        require_count(run_slice, fragment)
    capture_run_slice = function_slice(capture_text, "func _run() -> void:")
    ordered_capture = (
        "tree.current_scene != _host",
        "bool(_host.perf_probe_enabled) != _native_perf_mode",
        "await tree.process_frame",
        "await RenderingServer.frame_post_draw",
        '_coverage["foreground_contract"] = await _wait_for_native_foreground_focus()',
        'if not bool(_coverage["foreground_contract"]):',
        'await _fail("native 性能窗口没有进入玩家前台焦点态")',
        "await _wait_for_real_world()",
        "await _configure_isolated_world()",
    )
    capture_positions = [capture_run_slice.find(value) for value in ordered_capture]
    if any(value < 0 for value in capture_positions) or capture_positions != sorted(
        capture_positions
    ):
        raise PetCodexRecordingError(
            "Main-hosted 图鉴录像的宿主／焦点／隔离顺序不精确"
        )
    focus_gate = (
        "\tif _native_perf_mode:\n"
        '\t\t_coverage["foreground_contract"] = await '
        "_wait_for_native_foreground_focus()\n"
        '\t\tif not bool(_coverage["foreground_contract"]):\n'
        '\t\t\tawait _fail("native 性能窗口没有进入玩家前台焦点态")\n'
        "\t\t\treturn\n"
        "\telse:\n"
        '\t\t_coverage["foreground_contract"] = true\n'
    )
    require_count(capture_run_slice, focus_gate)
    end_focus_gate = (
        "\tif _native_perf_mode:\n"
        '\t\t_coverage["foreground_contract"] = (\n'
        '\t\t\tbool(_coverage["foreground_contract"])\n'
        "\t\t\tand DisplayServer.window_is_focused()\n"
        "\t\t)\n"
        '\t\tif not bool(_coverage["foreground_contract"]):\n'
        '\t\t\tawait _fail("native 图鉴交互切片结束前失去玩家前台焦点")\n'
        "\t\t\treturn\n"
    )
    require_count(capture_run_slice, end_focus_gate)
    require_count(capture_run_slice, "await _finish(0)")
    fail_slice = function_slice(capture_text, "func _fail(message: String) -> void:")
    expected_fail = (
        "func _fail(message: String) -> void:\n"
        "\tif _failed:\n"
        "\t\treturn\n"
        "\t_failed = true\n"
        '\tprint("PET_CODEX_AWAKENED_OWNER_REVIEW_FAILED reason=%s" % message)\n'
        '\tpush_error("pet codex awakened owner review failed: %s" % message)\n'
        "\tawait _finish(1)\n"
    )
    if fail_slice.rstrip() + "\n" != expected_fail:
        raise PetCodexRecordingError("Main-hosted 图鉴失败标记或收口不精确")
    finish_slice = function_slice(capture_text, "func _finish(exit_code: int) -> void:")
    expected_finish = (
        "func _finish(exit_code: int) -> void:\n"
        "\tvar tree := _tree\n"
        "\tif tree == null:\n"
        "\t\treturn\n"
        "\tfor _frame_index in range(4):\n"
        "\t\tawait tree.process_frame\n"
        '\ttree.call_deferred("quit", exit_code)\n'
    )
    if finish_slice.rstrip() + "\n" != expected_finish:
        raise PetCodexRecordingError("Main-hosted 图鉴录像收口顺序不精确")
    require_count(capture_text, "const FOREGROUND_TIMEOUT_MSEC := 3000")
    foreground_slice = function_slice(
        capture_text,
        "func _wait_for_native_foreground_focus() -> bool:",
    )
    require_count(foreground_slice, "FOREGROUND_TIMEOUT_MSEC")
    require_count(foreground_slice, "DisplayServer.window_move_to_foreground()")
    for fragment in (
        "auth_auto_bypass = false",
        "cancel_request()",
        "_refresh_gm_visibility()",
        "entry=MainSceneFlag",
    ):
        require_count(capture_text, fragment)
    require_count(capture_text, "HTTPClient.STATUS_DISCONNECTED", 2)

    preload_block = (
        "const PetCodexAwakenedOwnerReviewCapture := preload(\n"
        '\t"res://scripts/qa/pet_codex_awakened_owner_review_capture.gd"\n'
        ")"
    )
    require_count(main_text, preload_block)
    for fragment in (
        "var pet_codex_awakened_owner_review_capture: bool = false",
        "var pet_codex_awakened_owner_review_capture_arg_count: int = 0",
        "var pet_codex_awakened_owner_review_native_perf_arg_count: int = 0",
        'var pet_codex_awakened_owner_review_parse_error: String = ""',
    ):
        require_count(main_text, fragment)
    dev_slice = function_slice(
        main_text,
        "func _dev_entrypoint_arg(arg: String) -> bool:",
    )
    require_count(
        dev_slice,
        "PetCodexAwakenedOwnerReviewCapture.is_flag(normalized)",
    )
    apply_slice = function_slice(main_text, "func _apply_preview_window_args() -> void:")
    for fragment in (
        "elif arg == PetCodexAwakenedOwnerReviewCapture.CAPTURE_FLAG:",
        "pet_codex_awakened_owner_review_capture = true",
        "pet_codex_awakened_owner_review_capture_arg_count += 1",
        "elif arg == PetCodexAwakenedOwnerReviewCapture.NATIVE_PERF_FLAG:",
        "pet_codex_awakened_owner_review_native_perf_arg_count += 1",
        "if pet_codex_awakened_owner_review_capture_arg_count != 1:",
        "elif pet_codex_awakened_owner_review_native_perf_arg_count > 1:",
    ):
        require_count(apply_slice, fragment)
    pet_contract_start = apply_slice.find(
        "\tif (\n"
        "\t\tpet_codex_awakened_owner_review_capture_arg_count > 0\n"
        "\t\tor pet_codex_awakened_owner_review_native_perf_arg_count > 0\n"
        "\t):"
    )
    if pet_contract_start < 0:
        raise PetCodexRecordingError("Main 缺失 pet-codex 参数 fail-closed block")
    next_contract_start = apply_slice.find("\n\tif (\n", pet_contract_start + 1)
    pet_contract_end = (
        next_contract_start if next_contract_start >= 0 else len(apply_slice)
    )
    require_count(
        apply_slice[pet_contract_start:pet_contract_end],
        "auth_auto_bypass = false",
    )
    ready_slice = function_slice(main_text, "func _ready() -> void:")
    ordered_ready = (
        "_apply_preview_window_args()",
        "if not _attest_qa_user_data_lane_or_exit():",
        'if pet_codex_awakened_owner_review_parse_error != "":',
        "_bootstrap_auth_state()",
        "or pet_codex_awakened_owner_review_capture",
        "and not pet_codex_awakened_owner_review_capture",
        'call_deferred("_run_pet_codex_awakened_owner_review_capture")',
    )
    ready_positions = [ready_slice.find(value) for value in ordered_ready]
    if any(value < 0 for value in ready_positions) or ready_positions != sorted(
        ready_positions
    ):
        raise PetCodexRecordingError(
            "Main attestation／参数／隔离档案／延迟录像顺序不精确"
        )
    require_count(
        ready_slice,
        'call_deferred("_run_pet_codex_awakened_owner_review_capture")',
    )
    dispatcher = function_slice(
        main_text,
        "func _run_pet_codex_awakened_owner_review_capture() -> void:",
    )
    if dispatcher.rstrip() + "\n" != (
        "func _run_pet_codex_awakened_owner_review_capture() -> void:\n"
        "\tawait PetCodexAwakenedOwnerReviewCapture.new(self).run()\n"
    ):
        raise PetCodexRecordingError("Main pet-codex dispatcher 不精确")


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _new_run_id() -> str:
    timestamp = _utc_now().strftime("%Y%m%dT%H%M%S.%fZ")
    return f"phase398-{timestamp}-{uuid.uuid4().hex[:8]}"


def _build_godot_command(
    *,
    godot: str,
    avi_path: Path,
) -> list[str]:
    command = [
        godot,
        "--path",
        str(GODOT_PROJECT),
        "--windowed",
        "--resolution",
        f"{EXPECTED_WIDTH}x{EXPECTED_HEIGHT}",
        "--single-window",
        "--fixed-fps",
        str(EXPECTED_FPS),
        "--time-scale",
        "1.0",
        "--disable-vsync",
        "--write-movie",
        str(avi_path),
        "--scene",
        MAIN_SCENE,
        "--",
        f"--qa-viewport={EXPECTED_WIDTH}x{EXPECTED_HEIGHT}",
        CAPTURE_FLAG,
        CORE.QA_LANE_ARGUMENT,
    ]
    if (
        command.count(CAPTURE_FLAG) != 1
        or NATIVE_PERF_FLAG in command
        or command.count(CORE.QA_LANE_ARGUMENT) != 1
        or "--script" in command
        or "--user-data-dir" in command
    ):
        raise PetCodexRecordingError("Godot movie command QA lane 参数不精确")
    return command


def _build_native_perf_command(
    *,
    godot: str,
) -> list[str]:
    command = [
        godot,
        "--path",
        str(GODOT_PROJECT),
        "--windowed",
        "--resolution",
        f"{EXPECTED_WIDTH}x{EXPECTED_HEIGHT}",
        "--single-window",
        "--time-scale",
        "1.0",
        "--scene",
        MAIN_SCENE,
        "--",
        f"--qa-viewport={EXPECTED_WIDTH}x{EXPECTED_HEIGHT}",
        CAPTURE_FLAG,
        NATIVE_PERF_FLAG,
        "--perf-probe",
        CORE.QA_LANE_ARGUMENT,
    ]
    if (
        command.count(CAPTURE_FLAG) != 1
        or command.count(NATIVE_PERF_FLAG) != 1
        or command.count("--perf-probe") != 1
        or command.count(CORE.QA_LANE_ARGUMENT) != 1
        or "--script" in command
        or "--user-data-dir" in command
    ):
        raise PetCodexRecordingError("Godot native command QA lane 参数不精确")
    return command


def _validate_probe(probe: dict[str, Any]) -> dict[str, Any]:
    try:
        metadata = CORE._validate_probe(probe)
    except CORE.PetManagementRecordingError as error:
        raise PetCodexRecordingError(str(error)) from error
    duration = float(metadata.get("durationSeconds", -1.0))
    if (
        not math.isfinite(duration)
        or duration < MIN_DURATION_SECONDS
        or duration > MAX_DURATION_SECONDS
    ):
        raise PetCodexRecordingError(
            "图鉴验收视频时长必须在 "
            f"{MIN_DURATION_SECONDS:.0f}-{MAX_DURATION_SECONDS:.0f} 秒，"
            f"实际 {duration:.3f} 秒"
        )
    minimum_frames = int(math.floor(duration * EXPECTED_FPS) - 2)
    if int(metadata.get("frameCount", -1)) < minimum_frames:
        raise PetCodexRecordingError("图鉴验收视频帧数与 30fps 时长不一致")
    streams = probe.get("streams", [])
    audio = next(
        (
            value
            for value in streams
            if isinstance(value, dict)
            and value.get("codec_type") == "audio"
        ),
        {},
    )
    if (
        str(audio.get("sample_rate", ""))
        != str(EXPECTED_AUDIO_SAMPLE_RATE)
        or int(audio.get("channels", -1)) != EXPECTED_AUDIO_CHANNELS
    ):
        raise PetCodexRecordingError("图鉴验收音频必须为 48kHz 双声道")
    metadata["audioSampleRate"] = EXPECTED_AUDIO_SAMPLE_RATE
    metadata["audioChannels"] = EXPECTED_AUDIO_CHANNELS
    return metadata


def _validate_godot_log(
    path: Path,
    *,
    expected_perf_mode: str = "movie30",
) -> dict[str, Any]:
    if expected_perf_mode not in {"native", "movie30"}:
        raise PetCodexRecordingError(
            f"未知图鉴性能口径：{expected_perf_mode}"
        )
    with path.open("r", encoding="utf-8", newline="") as stream:
        text = stream.read()
    lines = [
        raw_line[:-1] if raw_line.endswith("\r") else raw_line
        for raw_line in text.split("\n")
    ]
    failure_marker_count = text.count(FAILURE_MARKER)
    if failure_marker_count:
        failure_lines = [line for line in lines if FAILURE_MARKER in line]
        failure_pattern = re.compile(
            rf"{re.escape(FAILURE_MARKER)} "
            r"reason=([^\x00-\x1f\x7f-\x9f\u2028\u2029]{1,512})"
        )
        failure_match = (
            failure_pattern.fullmatch(failure_lines[0])
            if failure_marker_count == 1 and len(failure_lines) == 1
            else None
        )
        if failure_match is None:
            raise PetCodexRecordingError(
                "Godot 图鉴验收失败标记必须列零、唯一且为精确单行"
            )
        failure_reason = failure_match.group(1)
        if failure_reason == "" or failure_reason.strip() != failure_reason:
            raise PetCodexRecordingError(
                "Godot 图鉴验收失败标记 reason 必须非空且不得含首尾空白"
            )
        raise PetCodexRecordingError(failure_reason)
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
        raise PetCodexRecordingError(
            "Godot 图鉴验收日志未通过零错误／零警告／零泄漏门禁："
            + ", ".join(found)
        )
    if "Metal 4.0 - Forward Mobile" not in text:
        raise PetCodexRecordingError(
            "Godot 图鉴验收没有使用 Metal Forward Mobile"
        )
    movie_marker = (
        "Movie Maker mode enabled, recording movie in "
        "1280×720 @ 30 FPS"
    )
    if expected_perf_mode == "movie30" and movie_marker not in text:
        raise PetCodexRecordingError(
            "Godot 图鉴验收没有确认 1280×720 30fps Movie Maker"
        )
    if expected_perf_mode == "native" and movie_marker in text:
        raise PetCodexRecordingError("native 性能证据错误启用了 Movie Maker")
    def unique_column_zero_marker(marker: str) -> str:
        matches = [line for line in lines if marker in line]
        if len(matches) != 1 or not matches[0].startswith(marker):
            raise PetCodexRecordingError(
                f"Godot 图鉴验收标记必须列零且唯一：{marker}"
            )
        return matches[0]

    start_line = unique_column_zero_marker(START_MARKER)
    start_pattern = re.compile(
        rf"{re.escape(START_MARKER)} scene=Main\.tscn "
        r"entry=MainSceneFlag viewport=1280x720 "
        rf"fps={'native60' if expected_perf_mode == 'native' else '30'} "
        r"speed=1\.00x profile=isolated backend=false profile_save=false "
        rf"owner_review_status=pending perf_mode={expected_perf_mode}"
    )
    if start_pattern.fullmatch(start_line) is None:
        raise PetCodexRecordingError(
            "验收日志未确认真实 Main、隔离档案、有声 1× 画面或 pending 状态"
        )

    chapter_pattern = re.compile(
        rf"{re.escape(CHAPTER_MARKER)} chapter=([A-Za-z0-9_.-]+) "
        r"frame=(\d+) seconds=([0-9.]+) speed=1\.00x"
    )
    chapter_lines = [line for line in lines if CHAPTER_MARKER in line]
    chapter_matches = [chapter_pattern.fullmatch(line) for line in chapter_lines]
    if any(match is None for match in chapter_matches):
        raise PetCodexRecordingError("Godot 图鉴验收章节标记必须列零且精确")
    chapters = []
    for match in chapter_matches:
        assert match is not None
        chapters.append(
            {
                "id": match.group(1),
                "frameCount": int(match.group(2)),
                "durationSeconds": float(match.group(3)),
            }
        )
    chapter_ids = tuple(chapter["id"] for chapter in chapters)
    expected_ids = tuple(chapter[0] for chapter in EXPECTED_CHAPTERS)
    if chapter_ids != expected_ids:
        raise PetCodexRecordingError(
            "Godot 图鉴验收章节不完整或顺序错误："
            + ",".join(chapter_ids)
        )
    for chapter, expected in zip(chapters, EXPECTED_CHAPTERS):
        expected_seconds = expected[1]
        if not math.isclose(
            float(chapter["durationSeconds"]),
            expected_seconds,
            abs_tol=0.0005,
        ):
            raise PetCodexRecordingError(
                f"章节 {chapter['id']} 持续时间不是 {expected_seconds:.3f}s"
            )
        evidence_fps = 60 if expected_perf_mode == "native" else EXPECTED_FPS
        if int(chapter["frameCount"]) != round(expected_seconds * evidence_fps):
            raise PetCodexRecordingError(
                f"章节 {chapter['id']} 的帧数与 {evidence_fps}fps 不一致"
            )

    state_pattern = re.compile(
        rf"{re.escape(STATE_MARKER)} "
        + r" ".join(
            rf"{name}=(true|false)" for name in EXPECTED_STATE_FLAGS
        )
        + r" actual_left_clicks=(\d+) press_frames=(\d+)"
        + r" server_writes=(\d+) main_process_max_ms=([0-9.]+)"
        + r" main_process_samples=(\d+)"
        + r" monitor_diagnostic_ms=([0-9.]+)"
        + r" open_monitor_diagnostic_ms=([0-9.]+)"
        + r" selection_max_usec=(\d+)"
        + r" input_dispatch_max_usec=(\d+)"
        + r" detail_tab_max_usec=(\d+)"
        + r" route_source_loads_before=(\d+)"
        + r" route_source_loads_after=(\d+)"
        + r" perf_mode=(native|movie30)"
    )
    state_line = unique_column_zero_marker(STATE_MARKER)
    state_match = state_pattern.fullmatch(state_line)
    if state_match is None:
        raise PetCodexRecordingError("Godot 图鉴验收缺少完整状态摘要")
    groups = state_match.groups()
    flag_values = groups[: len(EXPECTED_STATE_FLAGS)]
    actual_clicks = int(groups[len(EXPECTED_STATE_FLAGS)])
    press_frames = int(groups[len(EXPECTED_STATE_FLAGS) + 1])
    server_writes = int(groups[len(EXPECTED_STATE_FLAGS) + 2])
    main_process_max_ms = float(groups[len(EXPECTED_STATE_FLAGS) + 3])
    main_process_samples = int(groups[len(EXPECTED_STATE_FLAGS) + 4])
    monitor_diagnostic_ms = float(groups[len(EXPECTED_STATE_FLAGS) + 5])
    open_monitor_diagnostic_ms = float(groups[len(EXPECTED_STATE_FLAGS) + 6])
    selection_max_usec = int(groups[len(EXPECTED_STATE_FLAGS) + 7])
    input_dispatch_max_usec = int(groups[len(EXPECTED_STATE_FLAGS) + 8])
    detail_tab_max_usec = int(groups[len(EXPECTED_STATE_FLAGS) + 9])
    route_source_loads_before = int(groups[len(EXPECTED_STATE_FLAGS) + 10])
    route_source_loads_after = int(groups[len(EXPECTED_STATE_FLAGS) + 11])
    perf_mode = groups[len(EXPECTED_STATE_FLAGS) + 12]
    if any(value != "true" for value in flag_values):
        raise PetCodexRecordingError(
            "图鉴验收缺少入口、族／形态、页签、内嵌页、关闭或 HUD 状态"
        )
    if actual_clicks < 13 or press_frames != actual_clicks:
        raise PetCodexRecordingError("图鉴验收没有完整使用跨帧真实左键")
    if server_writes != 0:
        raise PetCodexRecordingError("图鉴验收意外报告了服务端写入")
    if perf_mode != expected_perf_mode:
        raise PetCodexRecordingError("图鉴日志性能口径与命令不一致")
    if not math.isfinite(monitor_diagnostic_ms) or monitor_diagnostic_ms < 0.0:
        raise PetCodexRecordingError("图鉴延迟监控诊断值无效")
    if (
        not math.isfinite(open_monitor_diagnostic_ms)
        or open_monitor_diagnostic_ms < 0.0
    ):
        raise PetCodexRecordingError("图鉴入口进程诊断值无效")
    if expected_perf_mode == "native":
        if main_process_samples <= 0:
            raise PetCodexRecordingError("native 性能证据没有 Main 帧样本")
        if (
            not math.isfinite(main_process_max_ms)
            or main_process_max_ms < 0.0
            or main_process_max_ms > 16.7
        ):
            raise PetCodexRecordingError("native Main 进程帧超过 16.7ms")
    elif main_process_samples != 0 or main_process_max_ms != 0.0:
        raise PetCodexRecordingError("Movie Maker 日志混入 native Main 帧指标")
    if (
        selection_max_usec >= 8000
        or input_dispatch_max_usec >= 8000
        or detail_tab_max_usec >= 8000
    ):
        raise PetCodexRecordingError("图鉴交互处理热路径超过 8ms")
    if (
        route_source_loads_before < 0
        or route_source_loads_after != route_source_loads_before
    ):
        raise PetCodexRecordingError("图鉴选择热路径仍触发资源读取")
    end_line = unique_column_zero_marker(END_MARKER)
    end_match = re.fullmatch(
        rf"{re.escape(END_MARKER)} elapsed_wall=([0-9.]+) "
        r"speed=1\.00x profile=isolated backend=false completed=(true|false)",
        end_line,
    )
    if end_match is None or end_match.group(2) != "true":
        raise PetCodexRecordingError("图鉴验收没有完整回到世界 HUD")
    elapsed_wall_seconds = float(end_match.group(1))
    if expected_perf_mode == "native" and not (
        15.0 <= elapsed_wall_seconds <= 30.0
    ):
        raise PetCodexRecordingError(
            "native 前台流程 wall-clock 不符合 60fps 调度证据"
        )
    return {
        "status": "passed",
        "chapterCount": len(chapters),
        "chapters": chapters,
        "flowCoverage": {
            name: True for name in EXPECTED_STATE_FLAGS
        },
        "actualLeftClicks": actual_clicks,
        "crossFramePresses": press_frames,
        "serverWriteCount": 0,
        "perfMode": perf_mode,
        "mainProcessMaxMilliseconds": main_process_max_ms,
        "mainProcessSamples": main_process_samples,
        "mainProcessMetricRole": (
            "native-main-process-ticks-release-gate"
            if expected_perf_mode == "native"
            else "not-collected-in-movie30"
        ),
        "monitorDiagnosticMilliseconds": monitor_diagnostic_ms,
        "openMonitorDiagnosticMilliseconds": open_monitor_diagnostic_ms,
        "monitorMetricRole": "diagnostic-only-delayed-built-in-monitor",
        "selectionMaxMicroseconds": selection_max_usec,
        "inputDispatchMaxMicroseconds": input_dispatch_max_usec,
        "detailTabMaxMicroseconds": detail_tab_max_usec,
        "routeSourceLoadsBefore": route_source_loads_before,
        "routeSourceLoadsAfter": route_source_loads_after,
        "playbackSpeed": 1.0,
        "elapsedWallSeconds": elapsed_wall_seconds,
        "profileIsolated": True,
        "backendConnected": False,
        "realMainSceneInstantiated": True,
        "entryMode": "MainSceneFlag",
        "renderer": "Metal 4.0 - Forward Mobile",
        "movieWriter": (
            "1280x720@30fps" if expected_perf_mode == "movie30" else None
        ),
        "strictLogGate": "passed",
    }


def _validate_audible_audio(
    *,
    ffmpeg: str,
    video_path: Path,
    log_path: Path,
    timeout_seconds: float,
    environment: dict[str, str],
) -> dict[str, float | str]:
    CORE._run_logged(
        [
            ffmpeg,
            "-v",
            "info",
            "-i",
            str(video_path),
            "-map",
            "0:a:0",
            "-af",
            "volumedetect",
            "-f",
            "null",
            "-",
        ],
        log_path=log_path,
        timeout_seconds=timeout_seconds,
        environment=environment,
    )
    text = log_path.read_text(encoding="utf-8")
    mean_match = re.search(r"mean_volume:\s*(-?(?:[0-9.]+|inf))\s+dB", text)
    max_match = re.search(r"max_volume:\s*(-?(?:[0-9.]+|inf))\s+dB", text)
    if mean_match is None or max_match is None:
        raise PetCodexRecordingError("无法从图鉴验收音轨读取响度")
    mean_text = mean_match.group(1)
    max_text = max_match.group(1)
    if "inf" in mean_text.lower() or "inf" in max_text.lower():
        raise PetCodexRecordingError("图鉴验收音轨为静音")
    mean_db = float(mean_text)
    max_db = float(max_text)
    if not math.isfinite(max_db) or max_db < -55.0:
        raise PetCodexRecordingError("图鉴验收音轨不可听")
    return {
        "status": "passed",
        "meanVolumeDb": mean_db,
        "maxVolumeDb": max_db,
    }


def _record_into(
    *,
    args: argparse.Namespace,
    run_id: str,
    run_dir: Path,
) -> Path:
    timeout_seconds = float(args.timeout_seconds)
    if not math.isfinite(timeout_seconds) or timeout_seconds <= 0:
        raise PetCodexRecordingError("--timeout-seconds 必须大于 0")
    godot = CORE._require_executable(args.godot, label="Godot")
    ffmpeg = CORE._require_executable(args.ffmpeg, label="ffmpeg")
    ffprobe = CORE._require_executable(args.ffprobe, label="ffprobe")
    temporary_dir = run_dir / "tmp"
    temporary_dir.mkdir(parents=False, exist_ok=False)
    base_environment = CORE._isolated_environment(temporary_dir)

    native_log = run_dir / "godot-native-perf.log"
    native_command_path = run_dir / "native-perf-command.json"
    native_result_path = run_dir / "native-perf-result.json"
    native_command = _build_native_perf_command(
        godot=godot,
    )
    CORE._write_json(
        native_command_path,
        {"command": CORE._redacted_command(native_command)},
    )
    avi_path = run_dir / "pet-codex-awakened-owner-review-1x.avi"
    video_path = run_dir / "pet-codex-awakened-owner-review-1x.mp4"
    godot_log = run_dir / "godot-recording.log"
    movie_command_path = run_dir / "movie-command.json"
    command = _build_godot_command(
        godot=godot,
        avi_path=avi_path,
    )
    CORE._write_json(
        movie_command_path,
        {"command": CORE._redacted_command(command)},
    )
    lane_evidence = CORE._run_official_lane_godot_sequence(
        run_dir=run_dir,
        godot=godot,
        base_environment=base_environment,
        native_command=native_command,
        movie_command=command,
        native_log=native_log,
        movie_log=godot_log,
        timeout_seconds=timeout_seconds,
        native_log_validator=lambda path: _validate_godot_log(
            path,
            expected_perf_mode="native",
        ),
        movie_log_validator=lambda path: _validate_godot_log(
            path,
            expected_perf_mode="movie30",
        ),
    )
    environment = lane_evidence["environment"]
    native_performance = lane_evidence["native"]["logValidation"]
    godot_sequence = lane_evidence["movie"]["logValidation"]
    CORE._write_json(native_result_path, native_performance)
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
            EXPECTED_PIXEL_FORMAT,
            "-color_range",
            "tv",
            "-c:a",
            EXPECTED_AUDIO_CODEC,
            "-b:a",
            "192k",
            "-ar",
            str(EXPECTED_AUDIO_SAMPLE_RATE),
            "-ac",
            str(EXPECTED_AUDIO_CHANNELS),
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
    media = _validate_probe(probe)
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
    loudness_log = run_dir / "audio-loudness.log"
    audible_audio = _validate_audible_audio(
        ffmpeg=ffmpeg,
        video_path=video_path,
        log_path=loudness_log,
        timeout_seconds=timeout_seconds,
        environment=environment,
    )

    sample_times = CORE._selected_sample_times(
        float(media["durationSeconds"]),
        requested=tuple(args.sample_times or ()),
        sample_count=int(args.sample_count),
    )
    keyframes_dir = run_dir / "keyframes"
    keyframes = CORE._extract_review_frames(
        ffmpeg=ffmpeg,
        video_path=video_path,
        screenshots_dir=keyframes_dir,
        sample_times=sample_times,
        timeout_seconds=timeout_seconds,
    )
    contact = CORE._build_contact_sheet(
        ffmpeg=ffmpeg,
        screenshots_dir=keyframes_dir,
        output_path=run_dir / "contact-sheet.png",
        sample_count=len(sample_times),
        timeout_seconds=timeout_seconds,
    )

    metadata_path = run_dir / "metadata.json"
    metadata = {
        "schemaVersion": REPORT_SCHEMA_VERSION,
        "reportType": REPORT_TYPE,
        "scene": MAIN_SCENE,
        "captureFlag": CAPTURE_FLAG,
        "entryMode": "MainSceneFlag",
        "realMainSceneInstantiated": True,
        "viewport": {"width": EXPECTED_WIDTH, "height": EXPECTED_HEIGHT},
        "fps": EXPECTED_FPS,
        "playbackSpeed": 1.0,
        "videoCodec": EXPECTED_VIDEO_CODEC,
        "pixelFormat": EXPECTED_PIXEL_FORMAT,
        "audioCodec": EXPECTED_AUDIO_CODEC,
        "audioSampleRate": media["audioSampleRate"],
        "audioChannels": media["audioChannels"],
        "audibleAudio": audible_audio,
        "durationSeconds": media["durationSeconds"],
        "frameCount": media["frameCount"],
        "fullDecodeStatus": "passed",
        "nativePerformance": native_performance,
        "godotSequence": godot_sequence,
        "ownerReviewStatus": "pending",
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
                "realBeforeSha256": lane_evidence["session"]["realInventorySha256"],
            },
            "backendProcessStartedByTool": False,
            "mysqlAccessByTool": False,
            "serverWritesAllowed": False,
        },
    }
    CORE._write_json(metadata_path, metadata)

    video = {
        **CORE._artifact_record(video_path),
        **media,
        "playbackSpeed": 1.0,
        "decodeStatus": "passed",
        "audibleAudio": audible_audio,
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
        "captureContract": {
            "normalMainScene": True,
            "mainSceneFlagDispatch": True,
            "width": EXPECTED_WIDTH,
            "height": EXPECTED_HEIGHT,
            "fps": EXPECTED_FPS,
            "playbackSpeed": 1.0,
            "durationRangeSeconds": [
                MIN_DURATION_SECONDS,
                MAX_DURATION_SECONDS,
            ],
            "audioRequired": True,
            "audibleAudioRequired": True,
            "realLeftClicksRequired": True,
            "serverWritesAllowed": False,
            "strictGodotLogRequired": True,
            "nativeForegroundRequired": True,
            "nativeMainProcessTicksRequired": True,
            "nativeMainProcessMaxMilliseconds": 16.7,
            "interactionHandlerMaxMicroseconds": 8000,
        },
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
                "realBeforeSha256": lane_evidence["session"]["realInventorySha256"],
            },
            "temporaryDirectory": CORE._repo_relative(temporary_dir),
            "backendProcessStartedByTool": False,
            "mysqlAccessByTool": False,
        },
        "tools": {
            "godot": lane_evidence["preflight"]["version"]["normalizedVersion"],
            "ffmpeg": CORE._capture_version(ffmpeg, ["-version"]),
            "ffprobe": CORE._capture_version(ffprobe, ["-version"]),
            "python": sys.version.splitlines()[0],
        },
        "commands": {
            "nativePerformance": CORE._redacted_command(native_command),
            "movie30": CORE._redacted_command(command),
        },
        "preflight": lane_evidence["preflight"],
        "sourceCheck": lane_evidence["sourceCheck"],
        "initialVerification": lane_evidence["initialVerification"],
        "nativeProcess": lane_evidence["native"]["process"],
        "nativeAttestation": lane_evidence["native"]["attestation"],
        "nativePostVerify": lane_evidence["native"]["postVerify"],
        "movieProcess": lane_evidence["movie"]["process"],
        "movieAttestation": lane_evidence["movie"]["attestation"],
        "moviePostVerify": lane_evidence["movie"]["postVerify"],
        "qaLaneCleanup": lane_evidence["cleanup"],
        "postCleanupInspect": lane_evidence["postCleanupInspect"],
        "laneLifecycle": CORE._artifact_record(lane_evidence["lifecyclePath"]),
        "nativePerformance": native_performance,
        "godotSequence": godot_sequence,
        "rawMovie": raw_movie,
        "video": video,
        "metadata": CORE._artifact_record(metadata_path),
        "probe": CORE._artifact_record(probe_path),
        "fullDecode": {
            "status": "passed",
            "videoStreamDecoded": True,
            "audioStreamDecoded": True,
            "log": CORE._artifact_record(decode_log),
        },
        "keyframes": keyframes,
        "contactSheet": contact,
        "sha256Manifest": {
            "path": CORE._repo_relative(run_dir / "SHA256SUMS"),
            "coversAllRetainedEvidenceFiles": True,
            "writtenLast": True,
        },
        "logs": {
            "nativePerformance": CORE._artifact_record(native_log),
            "godot": CORE._artifact_record(godot_log),
            "transcode": CORE._artifact_record(transcode_log),
            "audioLoudness": CORE._artifact_record(loudness_log),
        },
        "ownerReviewStatus": "pending",
    }
    summary_path = run_dir / "summary.json"
    CORE._write_json(summary_path, summary)
    excluded_roots = {"tmp"}
    hash_paths = sorted(
        (
            path
            for path in run_dir.rglob("*")
            if path.is_file()
            and path.name != "SHA256SUMS"
            and path.relative_to(run_dir).parts[0] not in excluded_roots
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
                "metadata": CORE._repo_relative(metadata_path),
                "summary": CORE._repo_relative(summary_path),
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
                raise ValueError("QA lane lifecycle authority 不是 JSON object")
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
                "generatedAtUtc": _utc_now().isoformat().replace(
                    "+00:00", "Z"
                ),
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
        # Failure reporting is secondary evidence and must never replace the
        # original recorder exception.
        return False
    return True


def _record(args: argparse.Namespace) -> Path:
    if Path.cwd().resolve() != REPO_ROOT:
        raise PetCodexRecordingError(f"必须从仓库根执行：cd {REPO_ROOT}")
    if not GODOT_PROJECT.is_dir():
        raise PetCodexRecordingError(f"Godot 项目不存在：{GODOT_PROJECT}")
    _require_main_hosted_capture_wiring()
    run_id = args.run_id or _new_run_id()
    if SAFE_RUN_ID.fullmatch(run_id) is None:
        raise PetCodexRecordingError(f"不安全的 runId：{run_id!r}")
    try:
        output_root = CORE._resolve_output_root(args.output_root)
    except CORE.PetManagementRecordingError as error:
        raise PetCodexRecordingError(str(error)) from error
    output_root.mkdir(parents=True, exist_ok=True)
    run_dir = output_root / run_id
    run_dir.mkdir(parents=False, exist_ok=False)
    try:
        return _record_into(args=args, run_id=run_id, run_dir=run_dir)
    except BaseException as error:
        failure_summary_written = _write_failure_summary(
            run_dir, run_id=run_id, error=error
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
                # Retained-file discovery and the secondary manifest are
                # best-effort only; neither may replace the primary failure.
                pass
        else:
            try:
                (run_dir / "SHA256SUMS").unlink()
                CORE._fsync_parent_directory(run_dir / "SHA256SUMS")
            except FileNotFoundError:
                pass
            except BaseException:
                # The non-zero recorder exit remains authoritative if even
                # manifest invalidation cannot be persisted.
                pass
        raise


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "通过正式 Main.tscn 旗标宿主录制 "
            "1280x720、30fps、1×、有声的正式觉醒风宠物图鉴验收视频。"
        )
    )
    parser.add_argument("--run-id", help="可选的唯一安全 runId。")
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
        print("pet codex owner review recording interrupted", file=sys.stderr)
        return 130
    except (
        PetCodexRecordingError,
        CORE.PetManagementRecordingError,
        FileExistsError,
        OSError,
        ValueError,
    ) as error:
        print(
            f"pet codex owner review recording failed: {error}",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
