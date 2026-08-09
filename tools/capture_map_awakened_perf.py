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
PANEL_FLOW_SCRIPT_PATH = (
    GODOT_PROJECT / "scripts" / "ui" / "panel_flow_coordinator.gd"
)
MAP_PANEL_SCRIPT_PATH = (
    GODOT_PROJECT / "scripts" / "ui" / "map_awakened_panel.gd"
)
PLAYER_PROGRESS_SCRIPT_PATH = (
    GODOT_PROJECT
    / "scripts"
    / "progression"
    / "player_progress_model.gd"
)
AUTO_CHECK_SCRIPT_PATH = (
    GODOT_PROJECT / "scripts" / "qa" / "auto_check_coordinator.gd"
)
WORLD_HUD_VIEW_SCRIPT_PATH = (
    GODOT_PROJECT / "scripts" / "ui" / "world_hud_awakened_view.gd"
)
WORLD_HUD_VIEW_CHECK_SCRIPT_PATH = (
    GODOT_PROJECT
    / "scripts"
    / "ui"
    / "world_hud_awakened_view_check.gd"
)
PERF_CAPTURE_FLAG = "--map-awakened-owner-review-perf"
RENDER_DIAGNOSTIC_FLAG = "--map-awakened-render-diagnostic"
DEFAULT_OUTPUT_ROOT = Path(".run/evidence/phase399_map_awakened_perf")
DEFAULT_DIAGNOSTIC_OUTPUT_ROOT = Path(
    ".run/evidence/phase399_map_awakened_render_diagnostic"
)
SAFE_RUN_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")
START_MARKER = "PHASE399_MAP_PERF_START"
STATE_MARKER = "PHASE399_MAP_PERF_STATE"
HANDLER_MARKER = "PHASE399_MAP_PERF_HANDLER"
END_MARKER = "PHASE399_MAP_PERF_END"
FAILURE_MARKERS = (
    "PHASE399_MAP_PERF_FAILED",
    "PHASE399_MAP_DIAGNOSTIC_FAILED",
    "PHASE399_MAP_OWNER_REVIEW_FAILED",
)
EXPECTED_STATES = ("idle", "moving", "panel_stress")
EXPECTED_STRESS_CYCLES = 12
EXPECTED_PANEL_CLICKS = EXPECTED_STRESS_CYCLES * 5
EXPECTED_MENU_60_CHECKS = EXPECTED_STRESS_CYCLES * 4
MIN_STATE_SAMPLES = 5
MIN_STABLE_STATE_SAMPLES = 5
# The normal Main path intentionally idles near 30 FPS. Continuous movement and
# an open formal map are interactive states with the product's 60fps budget.
MIN_STABLE_FPS_BY_STATE = {
    "idle": 28.0,
    "moving": 45.0,
    "panel_stress": 55.0,
}
MIN_PANEL_STABLE_FPS = 45.0
IDLE_MEDIAN_PROCESS_TOTAL_MS = 5.0
IDLE_P95_PROCESS_TOTAL_MS = 15.0
ACTIVE_MEDIAN_PROCESS_TOTAL_MS = 10.0
ACTIVE_P95_PROCESS_TOTAL_MS = 16.7
MAX_PANEL_DISPATCH_USEC = 8000
REPORT_SCHEMA_VERSION = 2
REPORT_TYPE = "beastbound_phase399_map_real_main_performance"
DIAGNOSTIC_REPORT_TYPE = "beastbound_phase399_map_render_diagnostic"
DIAGNOSTIC_START_MARKER = "PHASE399_MAP_DIAGNOSTIC_START"
DIAGNOSTIC_STATE_MARKER = "PHASE399_MAP_DIAGNOSTIC_STATE"
DIAGNOSTIC_INPUT_MARKER = "PHASE399_MAP_DIAGNOSTIC_INPUT"
DIAGNOSTIC_SIGNAL_MARKER = "PHASE399_MAP_DIAGNOSTIC_SIGNAL"
DIAGNOSTIC_OPEN_TIMING_MARKER = (
    "PHASE399_MAP_DIAGNOSTIC_OPEN_TIMING"
)
DIAGNOSTIC_FOCUS_SETUP_MARKER = (
    "PHASE399_MAP_DIAGNOSTIC_FOCUS_SETUP"
)
DIAGNOSTIC_SETUP_MARKER = "PHASE399_MAP_DIAGNOSTIC_SETUP"
DIAGNOSTIC_END_MARKER = "PHASE399_MAP_DIAGNOSTIC_END"
DIAGNOSTIC_STATES = (
    "world_active_static",
    "fresh_local_static",
    "world_atlas_static",
    "panel_stress",
    "post_stress_local_static",
)
DIAGNOSTIC_SIGNAL_ACTIONS = (
    "open_local",
    "world_tab",
    "select_region",
    "local_tab",
    "close_panel",
)
DIAGNOSTIC_WARMUP_FRAMES = 60
DIAGNOSTIC_SAMPLE_FRAMES = 300
DIAGNOSTIC_SIGNAL_CYCLES = 12
DIAGNOSTIC_OPEN_TIMING_USEC_FIELDS = (
    "hang_usec",
    "dialog_encounter_usec",
    "other_panels_usec",
    "show_reset_usec",
    "view_state_usec",
    "bounds_usec",
    "prepared_predicate_usec",
    "fallback_usec",
    "apply_state_copy_usec",
    "apply_header_usec",
    "apply_sidebar_usec",
    "apply_local_map_usec",
    "apply_world_regions_usec",
    "apply_world_detail_usec",
    "apply_show_mode_usec",
    "apply_marker_schedule_usec",
    "apply_residual_usec",
    "panel_apply_total_usec",
    "marker_publish_usec",
    "refresh_residual_usec",
    "refresh_total_usec",
    "layout_usec",
    "deferred_layout_schedule_usec",
    "tutorial_usec",
    "open_residual_usec",
    "open_total_usec",
    "signal_residual_usec",
    "signal_total_usec",
)
DIAGNOSTIC_TARGET_60_CHECKS = (
    DIAGNOSTIC_WARMUP_FRAMES + DIAGNOSTIC_SAMPLE_FRAMES
)


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


def _build_diagnostic_command(
    *,
    godot: str,
    user_data_dir: Path,
    extra_args: Sequence[str] = (),
) -> list[str]:
    if extra_args:
        raise Phase399MapPerfError(
            "Phase399地图渲染诊断不接受附加Godot参数，避免联网或旁路"
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
        RENDER_DIAGNOSTIC_FLAG,
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
        "DisplayServer.window_move_to_foreground()",
        "DisplayServer.window_is_focused()",
        'host.call("_world_menu_is_open")',
        "runtime_target_fps_cache",
        "Engine.max_fps != 60",
        "PHASE399_MAP_PERF_HANDLER",
        "handler_refresh_p95_usec",
    )
    if any(fragment not in main_source for fragment in main_fragments):
        raise Phase399MapPerfError(
            "Phase399地图性能验收未通过最小Main flag wiring接入"
        )
    if any(fragment not in capture_source for fragment in capture_fragments):
        raise Phase399MapPerfError(
            "Phase399地图性能脚本缺少真实跨帧左键或稳定地图getter"
        )


def _require_diagnostic_wiring() -> None:
    try:
        main_source = MAIN_SCRIPT_PATH.read_text(encoding="utf-8")
        capture_source = CAPTURE_SCRIPT_PATH.read_text(encoding="utf-8")
        panel_flow_source = PANEL_FLOW_SCRIPT_PATH.read_text(
            encoding="utf-8"
        )
        map_panel_source = MAP_PANEL_SCRIPT_PATH.read_text(
            encoding="utf-8"
        )
        player_progress_source = PLAYER_PROGRESS_SCRIPT_PATH.read_text(
            encoding="utf-8"
        )
        auto_check_source = AUTO_CHECK_SCRIPT_PATH.read_text(
            encoding="utf-8"
        )
        world_hud_view_source = WORLD_HUD_VIEW_SCRIPT_PATH.read_text(
            encoding="utf-8"
        )
        world_hud_view_check_source = (
            WORLD_HUD_VIEW_CHECK_SCRIPT_PATH.read_text(encoding="utf-8")
        )
    except OSError as error:
        raise Phase399MapPerfError(
            "无法读取Phase399地图渲染诊断源码"
        ) from error
    main_fragments = (
        CAPTURE_SCRIPT_PATH.name,
        "MapAwakenedOwnerReviewCapture.is_flag",
        "_run_map_awakened_owner_review_capture",
    )
    sample_sequence = (
        "await host.get_tree().process_frame\n"
        '\thost.call("_reset_perf_probe_frame_max_for_qa")\n'
        "\tawait RenderingServer.frame_post_draw"
    )
    warmup_alignment = (
        "await RenderingServer.frame_post_draw\n"
        "\tvar metrics := _diagnostic_new_frame_metrics()"
    )
    failure_context_fragments = (
        "actual_count=%d ",
        "interval_index=%d engine_delta=%d engine_before=%d ",
        "engine_after=%d context=%s",
    )
    capture_fragments = (
        f'const RENDER_DIAGNOSTIC_FLAG := "{RENDER_DIAGNOSTIC_FLAG}"',
        "func _run_render_diagnostic()",
        "profile=fresh backend_started=false profile_save=false",
        "DIAGNOSTIC_WARMUP_FRAMES := 60",
        "DIAGNOSTIC_SAMPLE_FRAMES := 300",
        "DisplayServer.window_move_to_foreground()",
        "DisplayServer.window_is_focused()",
        "func _diagnostic_prepare_autofill_guard() -> bool:",
        "viewport.gui_get_focus_owner()",
        "(focus_before as Control).release_focus()",
        "_map_entry.grab_focus()",
        'str(_map_entry.name) != "WorldHudEntryMap"',
        "PHASE399_MAP_DIAGNOSTIC_FOCUS_SETUP",
        "autofill_guard=true focused_text_before=%s",
        "focused_text_after=%s focus_class_before=%s",
        "focus_path_before=%s focus_class_after=%s",
        "focus_target=%s foreground=%s",
        "return control is LineEdit or control is TextEdit",
        "if focused_text_after:",
        "if focus_after != _map_entry:",
        "if not foreground:",
        'elif boundary != "end":',
        'host.call("_world_needs_active_fps")',
        "runtime_target_fps_cache",
        "Engine.max_fps != 60",
        'host.call("_reset_perf_probe_frame_max_for_qa")',
        'host.call("_perf_probe_frame_snapshot_for_qa")',
        sample_sequence,
        warmup_alignment,
        "var engine_frame_before := Engine.get_process_frames()",
        "var engine_frame_after := Engine.get_process_frames()",
        "if actual_count != 1:",
        "if engine_delta < 0 or engine_delta > 1:",
        *failure_context_fragments,
        "stress_action=%s cycle=%d phase=motion",
        "stress_action=%s cycle=%d phase=press",
        "stress_action=%s cycle=%d phase=release_observe_%d",
        "Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME",
        "Performance.RENDER_TOTAL_OBJECTS_IN_FRAME",
        "Performance.RENDER_TOTAL_PRIMITIVES_IN_FRAME",
        "Performance.OBJECT_NODE_COUNT",
        "Performance.OBJECT_ORPHAN_NODE_COUNT",
        'find_child(\n\t\t"MapAwakenedViewport"',
        'button.get_signal_connection_list("pressed")',
        "(flags & CONNECT_DEFERRED) != 0",
        "button.pressed.emit()",
        "pressed.emit返回前状态没有同步变化",
        "PHASE399_MAP_DIAGNOSTIC_SETUP action=reset_region",
        "setup_only=true",
        "PHASE399_MAP_DIAGNOSTIC_OPEN_TIMING",
        "lightweight_layout=%s",
        "layout_fallback_delta=%d",
        'sample.has("lightweight_layout")',
        'sample.has("layout_fallback_delta")',
        'not bool(sample.get("lightweight_layout", false))',
        'int(sample.get("layout_fallback_delta", -1)) != 0',
        'map_flow.call("disable_map_open_timing_for_qa")',
        'map_flow.call("reset_map_world_lightweight_layout_for_qa")',
        '"map_world_lightweight_open_same_call_for_qa"',
        '"map_world_lightweight_close_same_call_for_qa"',
        '"map_world_full_layout_fallback_count_for_qa"',
        "func _assert_world_hud_restored_after_map_close() -> bool:",
        "WorldCameraSafeAreaModel.safe_viewport_rect(",
        '"world_camera_safe_anchor_screen"',
        '"battle_message_expand_button"',
        '"battle_message_clear_button"',
        '"_clamped_camera_center"',
        "地图轻量关闭没有恢复Phase400移动边界与computed／clamped相机",
        '"begin_map_open_timing_for_qa"',
        '"consume_map_open_timing_for_qa"',
        "_diagnostic_print_open_timing_raw(",
        "_diagnostic_validate_open_timing_sample(",
        "open_timing_cycle: int = -1",
        'apply_child_usec != int(sample.get("panel_apply_total_usec", 0))',
        'refresh_child_usec != int(sample.get("refresh_total_usec", 0))',
        'open_child_usec != int(sample.get("open_total_usec", 0))',
        '+ int(sample.get("signal_residual_usec", 0))',
        'int(sample.get("signal_total_usec", 0)) >= DIAGNOSTIC_MAX_SIGNAL_USEC',
        "真实release后三帧内没有观察到状态变化",
        DIAGNOSTIC_END_MARKER,
    )
    panel_flow_fragments = (
        "var _map_open_timing_for_qa_active := false",
        "var _map_open_timing_for_qa_sample = null",
        "func begin_map_open_timing_for_qa(",
        "func consume_map_open_timing_for_qa() -> Dictionary:",
        "func disable_map_open_timing_for_qa() -> void:",
        "func map_open_timing_active_for_qa() -> bool:",
        "func _refresh_map_panel(diagnostic_timing = null) -> void:",
        "if diagnostic_timing is Dictionary:",
        'timing_ref["fallback_usec"] = (',
        "if not prepared_visual_usable",
        "else 0",
        'timing_ref["refresh_total_usec"]',
        'timing["open_total_usec"]',
        'timing["lightweight_layout"]',
        'timing["layout_fallback_delta"]',
        "var _map_world_lightweight_layout_active := false",
        "var _map_world_lightweight_layout_viewport := Vector2.ZERO",
        "func _map_world_lightweight_layout_blocker(",
        "func _map_world_lightweight_preflight_blocker(",
        "func _map_formal_world_hud_ready() -> bool:",
        "func _apply_map_world_lightweight_layout(",
        "func _apply_map_world_safe_area_tail(",
        "func _apply_map_world_full_layout_fallback(",
        "func _map_world_full_layout_available() -> bool:",
        "func reset_map_world_lightweight_layout_for_qa() -> void:",
        "func invalidate_map_world_lightweight_viewport_for_qa() -> void:",
    )
    map_panel_fragments = (
        "diagnostic_timing = null",
        "var timing_enabled := diagnostic_timing is Dictionary",
        "if timing_enabled:",
        'timing["panel_apply_total_usec"]',
        'timing["apply_marker_schedule_usec"]',
        'timing["apply_residual_usec"]',
    )
    auto_check_type_fragments = (
        "var stale_marker_container_id: int = int(",
        "var repaired_marker_container_id: int = int(",
        "var formal_map_panel: PanelContainer = host.map_panel as PanelContainer",
        "var formal_world_hud: Control = host.world_hud_awakened_view as Control",
        "var expected_camera_position: Vector2 = (",
    )
    formal_message_capture_fragments = (
        '"WorldHudMessageSurface", true, false',
        '"WorldHudChatSurface", true, false',
        '"WorldHudMessageActions", true, false',
        'find_child("BattleLog", true, false)',
        "formal_battle_log.get_parent() != chat_surface",
        "(message_expand_button as Button).get_parent() != message_actions",
        "(message_clear_button as Button).get_parent() != message_actions",
    )
    formal_message_panel_flow_fragments = (
        'battle_message_expand_button.name = "WorldHudMessageExpandButton"',
        "battle_message_expand_button.pressed.connect(_toggle_battle_message_expanded)",
        'battle_message_clear_button.name = "WorldHudMessageClearButton"',
        "battle_message_clear_button.pressed.connect(_clear_world_log_panel)",
        '"battleMessageExpandButton": battle_message_expand_button',
        '"battleMessageClearButton": battle_message_clear_button',
        '"WorldHudChatSurface", true, false',
        '"WorldHudMessageActions", true, false',
        "battle_message_expand_button.get_parent() == message_actions",
        "battle_message_clear_button.get_parent() == message_actions",
    )
    formal_message_view_fragments = (
        '"battleMessageExpandButton"',
        '"battleMessageClearButton"',
        'missing_ids.append("battleMessageExpandButton")',
        'missing_ids.append("battleMessageClearButton")',
        '_message_action_row.name = "WorldHudMessageActions"',
        '_message_expand_button.name = "WorldHudMessageExpandButton"',
        '_message_clear_button.name = "WorldHudMessageClearButton"',
        "_reparent_control(message_button, _message_action_row)",
        "WorldHudAwakenedVisualSkin.apply_entry_button(",
        "_message_action_row.position = Vector2(",
        "_message_action_row.size = Vector2(112.0, 28.0)",
    )
    formal_message_check_fragments = (
        "message_expand_button.pressed.connect(_fixture_toggle_message_expanded)",
        "message_clear_button.pressed.connect(_fixture_clear_message)",
        '"battleMessageExpandButton": message_expand_button',
        '"battleMessageClearButton": message_clear_button',
        "func _append_message_action_errors() -> void:",
        "expand_button.pressed.emit()",
        "clear_button.pressed.emit()",
        "and expand_button.text == \"收起\"",
        "and clear_button.disabled",
        "and not message_panel.visible",
    )
    message_check_start = world_hud_view_check_source.find(
        "func _append_message_action_errors() -> void:"
    )
    message_check_end = world_hud_view_check_source.find(
        "\n\nfunc _fixture_toggle_message_expanded() -> void:",
        message_check_start,
    )
    message_check_source = (
        world_hud_view_check_source[message_check_start:message_check_end]
        if 0 <= message_check_start < message_check_end
        else ""
    )
    rollback_capture_sequence = (
        "_configure_rollback_fixture()\n"
        "\tvar rollback_message_panel: Control = (\n"
        '\t\t_legacy_controls.get("battleMessagePanel") as Control\n'
        "\t)\n"
        "\t_expect(\n"
        "\t\trollback_message_panel != null and not rollback_message_panel.visible,\n"
        '\t\t"rollback fixture 消息根在基线排版前应保持隐藏"\n'
        "\t)\n"
        "\trollback_message_panel.visible = true\n"
        "\tawait process_frame\n"
        "\tawait process_frame\n"
        "\trollback_message_panel.visible = false\n"
        "\t_rollback_expectations = _capture_rollback_expectations()\n"
        "\t_append_internal_auto_name_fixture_errors()\n"
        "\t_append_noncanonical_intrinsic_minimum_fixture_errors()"
    )
    rollback_assert_sequence = (
        '_rollback_result = _view.call("rollback_mount") as Dictionary\n'
        "\t_append_mount_rollback_structure_errors()\n"
        '\t_append_mount_write_set_errors("rollback 同调用")\n'
        "\t_expect(\n"
        "\t\trollback_message_panel != null and not rollback_message_panel.visible,\n"
        '\t\t"rollback 同调用没有恢复隐藏的消息根"\n'
        "\t)\n"
        "\trollback_message_panel.visible = true\n"
        "\tawait process_frame\n"
        "\tawait process_frame\n"
        "\trollback_message_panel.visible = false\n"
        "\t_append_mount_rollback_errors()\n"
        '\t_append_mount_write_set_errors("rollback settled")\n'
        "\t_append_mount_name_helper_contract_errors(legacy_host)"
    )
    rollback_capture_start = world_hud_view_check_source.find(
        "_configure_rollback_fixture()"
    )
    rollback_capture_end = world_hud_view_check_source.find(
        "_rollback_expectations = _capture_rollback_expectations()",
        rollback_capture_start,
    )
    rollback_capture_source = (
        world_hud_view_check_source[
            rollback_capture_start:rollback_capture_end
        ]
        if 0 <= rollback_capture_start < rollback_capture_end
        else ""
    )
    rollback_assert_start = world_hud_view_check_source.find(
        '_rollback_result = _view.call("rollback_mount") as Dictionary'
    )
    rollback_assert_end = world_hud_view_check_source.find(
        "_append_mount_rollback_errors()", rollback_assert_start
    )
    rollback_assert_source = (
        world_hud_view_check_source[rollback_assert_start:rollback_assert_end]
        if 0 <= rollback_assert_start < rollback_assert_end
        else ""
    )
    rollback_structure_start = world_hud_view_check_source.find(
        "func _append_mount_rollback_structure_errors() -> void:"
    )
    rollback_full_start = world_hud_view_check_source.find(
        "func _append_mount_rollback_errors() -> void:",
        rollback_structure_start,
    )
    rollback_full_end = world_hud_view_check_source.find(
        "\n\nfunc legacy_host_find(", rollback_full_start
    )
    rollback_structure_source = (
        world_hud_view_check_source[
            rollback_structure_start:rollback_full_start
        ]
        if 0 <= rollback_structure_start < rollback_full_start
        else ""
    )
    rollback_full_source = (
        world_hud_view_check_source[rollback_full_start:rollback_full_end]
        if 0 <= rollback_full_start < rollback_full_end
        else ""
    )
    rollback_expect_start = world_hud_view_check_source.find(
        "func _expect(condition: bool, message: String) -> void:"
    )
    rollback_expect_source = (
        world_hud_view_check_source[rollback_expect_start:]
        if rollback_expect_start >= 0
        else ""
    )
    rollback_run_start = world_hud_view_check_source.find(
        "func _run() -> void:"
    )
    rollback_run_tail_start = world_hud_view_check_source.find(
        "\t_append_mount_rollback_errors()", rollback_run_start
    )
    rollback_run_tail_end = world_hud_view_check_source.find(
        "\n\nfunc _build_legacy_controls(", rollback_run_tail_start
    )
    rollback_run_tail_source = (
        world_hud_view_check_source[
            rollback_run_tail_start:rollback_run_tail_end
        ]
        if 0 <= rollback_run_tail_start < rollback_run_tail_end
        else ""
    )
    rollback_noncanonical_start = world_hud_view_check_source.find(
        "func _append_noncanonical_intrinsic_minimum_fixture_errors() -> void:"
    )
    rollback_internal_name_start = world_hud_view_check_source.find(
        "func _append_internal_auto_name_fixture_errors() -> void:"
    )
    rollback_internal_name_source = (
        world_hud_view_check_source[
            rollback_internal_name_start:rollback_noncanonical_start
        ]
        if 0 <= rollback_internal_name_start < rollback_noncanonical_start
        else ""
    )
    rollback_noncanonical_end = world_hud_view_check_source.find(
        "\n\nfunc _control_mount_write_set_snapshot(",
        rollback_noncanonical_start,
    )
    rollback_noncanonical_source = (
        world_hud_view_check_source[
            rollback_noncanonical_start:rollback_noncanonical_end
        ]
        if 0 <= rollback_noncanonical_start < rollback_noncanonical_end
        else ""
    )
    rollback_write_set_start = world_hud_view_check_source.find(
        "func _control_mount_write_set_snapshot("
    )
    rollback_write_set_end = world_hud_view_check_source.find(
        "\n\nfunc _capture_rollback_expectations() -> Array[Dictionary]:",
        rollback_write_set_start,
    )
    rollback_write_set_source = (
        world_hud_view_check_source[
            rollback_write_set_start:rollback_write_set_end
        ]
        if 0 <= rollback_write_set_start < rollback_write_set_end
        else ""
    )
    view_rollback_start = world_hud_view_source.find(
        "func rollback_mount() -> Dictionary:"
    )
    view_rollback_end = world_hud_view_source.find(
        "\n\nfunc apply_layout(", view_rollback_start
    )
    view_rollback_source = (
        world_hud_view_source[view_rollback_start:view_rollback_end]
        if 0 <= view_rollback_start < view_rollback_end
        else ""
    )
    view_semantic_item_start = world_hud_view_source.find(
        "func _restore_mount_item_semantics("
    )
    view_semantic_control_start = world_hud_view_source.find(
        "func _restore_control_mount_semantics(", view_semantic_item_start
    )
    view_geometry_item_start = world_hud_view_source.find(
        "func _restore_mount_item_geometry(", view_semantic_control_start
    )
    view_geometry_control_start = world_hud_view_source.find(
        "func _restore_control_mount_geometry(", view_geometry_item_start
    )
    view_geometry_control_end = world_hud_view_source.find(
        "\n\nfunc _restore_metadata(", view_geometry_control_start
    )
    view_semantic_item_source = (
        world_hud_view_source[
            view_semantic_item_start:view_semantic_control_start
        ]
        if 0 <= view_semantic_item_start < view_semantic_control_start
        else ""
    )
    view_semantic_control_source = (
        world_hud_view_source[
            view_semantic_control_start:view_geometry_item_start
        ]
        if 0 <= view_semantic_control_start < view_geometry_item_start
        else ""
    )
    view_geometry_item_source = (
        world_hud_view_source[
            view_geometry_item_start:view_geometry_control_start
        ]
        if 0 <= view_geometry_item_start < view_geometry_control_start
        else ""
    )
    view_geometry_control_source = (
        world_hud_view_source[
            view_geometry_control_start:view_geometry_control_end
        ]
        if 0 <= view_geometry_control_start < view_geometry_control_end
        else ""
    )
    rollback_structure_fragments = (
        'bool(_rollback_result.get("ok", false))',
        'int(_rollback_result.get("restoredCount", 0))',
        "control.get_parent() == expected.get(\"parent\")",
        "control.get_index() == int(expected.get(\"index\", -1))",
        "control.position.is_equal_approx(",
        'control.size.is_equal_approx(expected.get("size", Vector2.ZERO))',
        "control.anchor_left",
        "control.anchor_top",
        "control.anchor_right",
        "control.anchor_bottom",
        'expected.get("anchorLeft", 0.0)',
        "control.offset_left",
        "control.offset_top",
        "control.offset_right",
        "control.offset_bottom",
        'expected.get("offsetLeft", 0.0)',
        'is_equal_approx(control.rotation, float(expected.get("rotation", 0.0)))',
        'control.scale.is_equal_approx(expected.get("scale", Vector2.ONE))',
        "control.pivot_offset.is_equal_approx(",
        'expected.get("pivotOffset", Vector2.ZERO)',
        "expand_button.pressed.is_connected(",
        "_fixture_toggle_message_expanded",
        "clear_button.pressed.is_connected(_fixture_clear_message)",
        "legacy_host_find(artifact_name) == null",
    )
    rollback_semantic_call = (
        "_restore_mount_item_semantics(item as CanvasItem, record, errors)"
    )
    rollback_geometry_call = (
        "_restore_mount_item_geometry(item as CanvasItem, record)"
    )
    rollback_two_pass_sequence = (
        "\tfor record in ordered:\n"
        '\t\tvar item = record.get("node")\n'
        "\t\tif not (item is CanvasItem) or not is_instance_valid(item):\n"
        "\t\t\tcontinue\n"
        f"\t\t{rollback_semantic_call}\n"
        "\t\trestored_count += 1\n"
        "\tfor record in ordered:\n"
        '\t\tvar item = record.get("node")\n'
        "\t\tif not (item is CanvasItem) or not is_instance_valid(item):\n"
        "\t\t\tcontinue\n"
        f"\t\t{rollback_geometry_call}"
    )
    rollback_fail_safe_cleanup_sequence = (
        "\tif errors.is_empty():\n"
        "\t\t_remove_mount_artifacts()\n"
        "\t\t_mounted = false\n"
        "\t\t_mount_snapshot.clear()\n"
        "\t\t_mount_root_child_ids.clear()"
    )
    rollback_depth_order_fragment = (
        'return int(left.get("depth", 0)) < int(right.get("depth", 0))'
    )
    semantic_geometry_forbidden = (
        "control.anchor_left =",
        "control.anchor_top =",
        "control.anchor_right =",
        "control.anchor_bottom =",
        "control.offset_left =",
        "control.offset_top =",
        "control.offset_right =",
        "control.offset_bottom =",
        "control.position =",
        "control.size =",
        "control.rotation =",
        "control.scale =",
        "control.pivot_offset =",
    )
    semantic_item_required_fragments = (
        "_restore_mount_item_name(item, record, errors)",
        "item.visible =",
        "item.modulate =",
        "item.self_modulate =",
        "item.z_index =",
        "item.z_as_relative =",
        "item.show_behind_parent =",
        "_restore_metadata(item,",
        "_restore_control_mount_semantics(",
        "label.text =",
        "label.horizontal_alignment =",
        "label.vertical_alignment =",
        "label.autowrap_mode =",
        "label.clip_text =",
        "label.text_overrun_behavior =",
        "label.max_lines_visible =",
        "rich_text.text =",
        "rich_text.fit_content =",
        "rich_text.scroll_active =",
        "rich_text.autowrap_mode =",
        "base_button.disabled =",
        "base_button.toggle_mode =",
        "base_button.button_pressed =",
        "base_button.action_mode =",
        "button.text =",
        "button.icon =",
        "button.flat =",
        "button.clip_text =",
        "button.text_overrun_behavior =",
        "button.alignment =",
        "button.icon_alignment =",
        "button.expand_icon =",
    )
    semantic_control_required_fragments = (
        "control.custom_minimum_size =",
        "control.size_flags_horizontal =",
        "control.size_flags_vertical =",
        "control.mouse_filter =",
        "control.mouse_default_cursor_shape =",
        "control.focus_mode =",
        "control.clip_contents =",
        "control.tooltip_text =",
        "_restore_theme_overrides(control,",
    )
    semantic_item_sequence = "\n".join((
        "func _restore_mount_item_semantics(",
        "\titem: CanvasItem,",
        "\trecord: Dictionary,",
        "\terrors: Array[String]",
        ") -> void:",
        "\t_restore_mount_item_name(item, record, errors)",
        '\titem.visible = bool(record.get("visible", true))',
        '\titem.modulate = record.get("modulate", item.modulate)',
        '\titem.self_modulate = record.get("selfModulate", item.self_modulate)',
        '\titem.z_index = int(record.get("zIndex", item.z_index))',
        '\titem.z_as_relative = bool(record.get("zAsRelative", item.z_as_relative))',
        '\titem.show_behind_parent = bool(record.get("showBehindParent", item.show_behind_parent))',
        '\t_restore_metadata(item, record.get("metadata", {}))',
        "\tif item is Control:",
        '\t\t_restore_control_mount_semantics(item as Control, record.get("control", {}))',
        "\tif item is Label:",
        "\t\tvar label := item as Label",
        '\t\tvar state = record.get("label", {}) as Dictionary',
        '\t\tlabel.text = str(state.get("text", label.text))',
        '\t\tlabel.horizontal_alignment = state.get("horizontalAlignment", label.horizontal_alignment)',
        '\t\tlabel.vertical_alignment = state.get("verticalAlignment", label.vertical_alignment)',
        '\t\tlabel.autowrap_mode = state.get("autowrapMode", label.autowrap_mode)',
        '\t\tlabel.clip_text = bool(state.get("clipText", label.clip_text))',
        '\t\tlabel.text_overrun_behavior = state.get("textOverrunBehavior", label.text_overrun_behavior)',
        '\t\tlabel.max_lines_visible = int(state.get("maxLinesVisible", label.max_lines_visible))',
        "\telif item is RichTextLabel:",
        "\t\tvar rich_text := item as RichTextLabel",
        '\t\tvar state = record.get("richText", {}) as Dictionary',
        '\t\trich_text.text = str(state.get("text", rich_text.text))',
        '\t\trich_text.fit_content = bool(state.get("fitContent", rich_text.fit_content))',
        '\t\trich_text.scroll_active = bool(state.get("scrollActive", rich_text.scroll_active))',
        '\t\trich_text.autowrap_mode = state.get("autowrapMode", rich_text.autowrap_mode)',
        "\tif item is BaseButton:",
        "\t\tvar base_button := item as BaseButton",
        '\t\tvar state = record.get("baseButton", {}) as Dictionary',
        '\t\tbase_button.disabled = bool(state.get("disabled", base_button.disabled))',
        '\t\tbase_button.toggle_mode = bool(state.get("toggleMode", base_button.toggle_mode))',
        '\t\tbase_button.button_pressed = bool(state.get("buttonPressed", base_button.button_pressed))',
        '\t\tbase_button.action_mode = state.get("actionMode", base_button.action_mode)',
        "\tif item is Button:",
        "\t\tvar button := item as Button",
        '\t\tvar state = record.get("button", {}) as Dictionary',
        '\t\tbutton.text = str(state.get("text", button.text))',
        '\t\tbutton.icon = state.get("icon", button.icon)',
        '\t\tbutton.flat = bool(state.get("flat", button.flat))',
        '\t\tbutton.clip_text = bool(state.get("clipText", button.clip_text))',
        '\t\tbutton.text_overrun_behavior = state.get("textOverrunBehavior", button.text_overrun_behavior)',
        '\t\tbutton.alignment = state.get("alignment", button.alignment)',
        '\t\tbutton.icon_alignment = state.get("iconAlignment", button.icon_alignment)',
        '\t\tbutton.expand_icon = bool(state.get("expandIcon", button.expand_icon))',
        "",
        "",
        "func _restore_mount_item_name(",
        "\titem: CanvasItem,",
        "\trecord: Dictionary,",
        "\terrors: Array[String]",
        ") -> void:",
        '\tif not record.has("name"):',
        '\t\terrors.append("mount snapshot name is missing")',
        "\t\treturn",
        '\tvar saved_name: StringName = StringName(record.get("name"))',
        "\tif saved_name == StringName():",
        '\t\terrors.append("mount snapshot name is empty")',
        "\t\treturn",
        "\tif item.name == saved_name:",
        "\t\treturn",
        '\tif str(saved_name).begins_with("@"):',
        '\t\terrors.append("internal mount name changed: %s" % str(saved_name))',
        "\t\treturn",
        "\titem.name = saved_name",
        "\tif item.name != saved_name:",
        '\t\terrors.append("mount name restore failed: %s" % str(saved_name))',
    ))
    semantic_control_sequence = "\n".join((
        "func _restore_control_mount_semantics(control: Control, state: Dictionary) -> void:",
        '\tcontrol.custom_minimum_size = state.get("customMinimumSize", control.custom_minimum_size)',
        '\tcontrol.size_flags_horizontal = int(state.get("sizeFlagsHorizontal", control.size_flags_horizontal))',
        '\tcontrol.size_flags_vertical = int(state.get("sizeFlagsVertical", control.size_flags_vertical))',
        '\tcontrol.mouse_filter = state.get("mouseFilter", control.mouse_filter)',
        "\tcontrol.mouse_default_cursor_shape = state.get(",
        '\t\t"mouseDefaultCursorShape",',
        "\t\tcontrol.mouse_default_cursor_shape",
        "\t)",
        '\tcontrol.focus_mode = state.get("focusMode", control.focus_mode)',
        '\tcontrol.clip_contents = bool(state.get("clipContents", control.clip_contents))',
        '\tcontrol.tooltip_text = str(state.get("tooltipText", control.tooltip_text))',
        '\t_restore_theme_overrides(control, state.get("themeOverrides", {}))',
    ))
    geometry_order_fragments = (
        "control.anchor_left =",
        "control.anchor_top =",
        "control.anchor_right =",
        "control.anchor_bottom =",
        "control.position =",
        "control.size =",
        "control.rotation =",
        "control.scale =",
        "control.pivot_offset =",
        "control.offset_left =",
        "control.offset_top =",
        "control.offset_right =",
        "control.offset_bottom =",
    )
    geometry_order = [
        view_geometry_control_source.find(fragment)
        for fragment in geometry_order_fragments
    ]
    geometry_semantic_forbidden = (
        "item.name",
        "item.visible",
        "item.modulate",
        "item.self_modulate",
        "item.z_index",
        "item.z_as_relative",
        "item.show_behind_parent",
        "_restore_metadata",
        "custom_minimum_size",
        "size_flags_horizontal",
        "size_flags_vertical",
        "mouse_filter",
        "mouse_default_cursor_shape",
        "focus_mode",
        "clip_contents",
        "tooltip_text",
        "_restore_theme_overrides",
        "fit_content",
        "scroll_active",
        "autowrap_mode",
        "disabled",
        "toggle_mode",
        "button_pressed",
        "action_mode",
        ".icon =",
        ".flat =",
        ".text =",
    )
    geometry_item_sequence = (
        "func _restore_mount_item_geometry(item: CanvasItem, record: Dictionary) -> void:\n"
        "\tif not (item is Control):\n"
        "\t\treturn\n"
        "\t_restore_control_mount_geometry(item as Control, record.get(\"control\", {}))"
    )
    geometry_control_sequence = (
        "func _restore_control_mount_geometry(control: Control, state: Dictionary) -> void:\n"
        '\tcontrol.anchor_left = float(state.get("anchorLeft", control.anchor_left))\n'
        '\tcontrol.anchor_top = float(state.get("anchorTop", control.anchor_top))\n'
        '\tcontrol.anchor_right = float(state.get("anchorRight", control.anchor_right))\n'
        '\tcontrol.anchor_bottom = float(state.get("anchorBottom", control.anchor_bottom))\n'
        '\tcontrol.position = state.get("position", control.position)\n'
        '\tcontrol.size = state.get("size", control.size)\n'
        '\tcontrol.rotation = float(state.get("rotation", control.rotation))\n'
        '\tcontrol.scale = state.get("scale", control.scale)\n'
        '\tcontrol.pivot_offset = state.get("pivotOffset", control.pivot_offset)\n'
        '\tcontrol.offset_left = float(state.get("offsetLeft", control.offset_left))\n'
        '\tcontrol.offset_top = float(state.get("offsetTop", control.offset_top))\n'
        '\tcontrol.offset_right = float(state.get("offsetRight", control.offset_right))\n'
        '\tcontrol.offset_bottom = float(state.get("offsetBottom", control.offset_bottom))'
    )
    rollback_noncanonical_names_sequence = (
        "const ROLLBACK_NONCANONICAL_INTRINSIC_MINIMUM_NAMES: Array[String] = [\n"
        '\t"LegacyStatusLabel",\n'
        '\t"LegacyVersionLabel",\n'
        '\t"LegacyDetailLabel",\n'
        '\t"LegacyTaskRouteButton",\n'
        '\t"LegacyMessageBox",\n'
        '\t"LegacyCollapseButton",\n'
        "]"
    )
    rollback_noncanonical_sequence = "\n".join((
        "func _append_noncanonical_intrinsic_minimum_fixture_errors() -> void:",
        "\tvar noncanonical_count := 0",
        "\tfor node_name in ROLLBACK_NONCANONICAL_INTRINSIC_MINIMUM_NAMES:",
        "\t\tvar control := legacy_host_find(node_name) as Control",
        '\t\t_expect(control != null, "rollback 非 canonical fixture 缺少控件：%s" % node_name)',
        "\t\tif control == null:",
        "\t\t\tcontinue",
        "\t\tvar expected := _rollback_expectation_for(control)",
        '\t\t_expect(not expected.is_empty(), "rollback 非 canonical fixture 缺少快照：%s" % node_name)',
        "\t\tif expected.is_empty():",
        "\t\t\tcontinue",
        "\t\tvar intrinsic_minimum := control.get_combined_minimum_size()",
        "\t\t_expect(",
        "\t\t\tintrinsic_minimum.x > 0.0 or intrinsic_minimum.y > 0.0,",
        '\t\t\t"rollback 非 canonical fixture 没有 intrinsic minimum：%s" % node_name',
        "\t\t)",
        "\t\tvar parent_area_size := control.get_parent_area_size()",
        '\t\tvar expected_position: Vector2 = expected.get("position", control.position)',
        '\t\tvar expected_size: Vector2 = expected.get("size", control.size)',
        "\t\tvar canonical_x := expected_position.x",
        "\t\tif control.is_layout_rtl():",
        "\t\t\tcanonical_x = parent_area_size.x - canonical_x - expected_size.x",
        "\t\tvar canonical_right := (",
        "\t\t\tcanonical_x",
        "\t\t\t+ expected_size.x",
        '\t\t\t- float(expected.get("anchorRight", control.anchor_right)) * parent_area_size.x',
        "\t\t)",
        "\t\tvar canonical_bottom := (",
        "\t\t\texpected_position.y",
        "\t\t\t+ expected_size.y",
        '\t\t\t- float(expected.get("anchorBottom", control.anchor_bottom)) * parent_area_size.y',
        "\t\t)",
        '\t\tvar raw_right := float(expected.get("offsetRight", control.offset_right))',
        '\t\tvar raw_bottom := float(expected.get("offsetBottom", control.offset_bottom))',
        "\t\tvar right_is_noncanonical := not is_equal_approx(raw_right, canonical_right)",
        "\t\tvar bottom_is_noncanonical := not is_equal_approx(raw_bottom, canonical_bottom)",
        "\t\t_expect(",
        "\t\t\tright_is_noncanonical and bottom_is_noncanonical,",
        '\t\t\t"rollback fixture 没有锁住 raw R/B 非 canonical 状态：%s" % node_name',
        "\t\t)",
        "\t\tif right_is_noncanonical and bottom_is_noncanonical:",
        "\t\t\tnoncanonical_count += 1",
        "\t_expect(",
        "\t\tnoncanonical_count == ROLLBACK_NONCANONICAL_INTRINSIC_MINIMUM_NAMES.size(),",
        '\t\t"rollback fixture 非 canonical intrinsic-min 控件数量错误：%d" % noncanonical_count',
        "\t)",
    ))
    rollback_structure_sha256 = (
        "84b798baef7744bd6dc22d93f8e05c7f4d0847055dd442ff477ebdfb81d37037"
    )
    view_rollback_sha256 = (
        "a727f56446da147ff526c0ca90713c238df86a282ff7348087173fee7a6d4f93"
    )
    rollback_full_sha256 = (
        "718536b1015fdaa02f373ae1df2d6b3b328a6d443b03821a8836d29b00e3312b"
    )
    rollback_expect_sha256 = (
        "bcb715b343850bece362ea28e4c4c7dfac855897d3a6615029af3e35ebd9aebe"
    )
    rollback_internal_name_sha256 = (
        "2935169cec30736896fd0014032b794c07f9bed501031a27a3a7bd8e4f0a8251"
    )
    rollback_write_set_sha256 = (
        "c585adac6ebe3ca6926a8ab4c91b8094b2ec757b09fab4b49a43a6795534efef"
    )
    rollback_run_tail_sha256 = (
        "b122080ffd455ace194757aa66625d73fbfb333c98d477963b383f6a67351e0e"
    )
    rollback_expectation_transform_fragments = (
        '"rotation": control.rotation',
        '"scale": control.scale',
        '"pivotOffset": control.pivot_offset',
    )
    rollback_full_geometry_fragments = (
        'control.position.is_equal_approx(expected.get("position", Vector2.ZERO))',
        'control.size.is_equal_approx(expected.get("size", Vector2.ZERO))',
        'is_equal_approx(control.rotation, float(expected.get("rotation", 0.0)))',
        'control.scale.is_equal_approx(expected.get("scale", Vector2.ONE))',
        'control.pivot_offset.is_equal_approx(expected.get("pivotOffset", Vector2.ZERO))',
        "control.anchor_left",
        "control.anchor_top",
        "control.anchor_right",
        "control.anchor_bottom",
        "control.offset_left",
        "control.offset_top",
        "control.offset_right",
        "control.offset_bottom",
    )
    rollback_full_semantic_fragments = (
        "control.visible ==",
        "control.custom_minimum_size.is_equal_approx(",
        "control.mouse_filter ==",
        "_control_metadata_snapshot(control) ==",
        "button.text ==",
        "button.disabled ==",
        "button.icon ==",
        "(control as Label).text ==",
        'control.has_theme_stylebox_override("panel")',
        'control.has_theme_color_override("font_color")',
    )
    rollback_exact_size_fragment = (
        "_expect(control.size.is_equal_approx("
        'expected.get("size", Vector2.ZERO)), '
        '"rollback 尺寸错误：%s" % label)'
    )
    auto_map_start = auto_check_source.find(
        "func _run_auto_map_panel_check() -> void:"
    )
    auto_snapshot_start = auto_check_source.find(
        "func _print_map_lightweight_qa_snapshot(", auto_map_start
    )
    auto_open_state_start = auto_check_source.find(
        "func _map_lightweight_open_state_ready() -> bool:",
        auto_snapshot_start,
    )
    auto_world_state_start = auto_check_source.find(
        "func _map_lightweight_world_state_ready() -> bool:",
        auto_open_state_start,
    )
    auto_world_state_end = auto_check_source.find(
        "\n\nfunc _map_rect_nearly_equal(", auto_world_state_start
    )
    auto_map_source = (
        auto_check_source[auto_map_start:auto_snapshot_start]
        if 0 <= auto_map_start < auto_snapshot_start
        else ""
    )
    auto_snapshot_source = (
        auto_check_source[auto_snapshot_start:auto_open_state_start]
        if 0 <= auto_snapshot_start < auto_open_state_start
        else ""
    )
    auto_open_state_source = (
        auto_check_source[auto_open_state_start:auto_world_state_start]
        if 0 <= auto_open_state_start < auto_world_state_start
        else ""
    )
    auto_world_state_source = (
        auto_check_source[auto_world_state_start:auto_world_state_end]
        if 0 <= auto_world_state_start < auto_world_state_end
        else ""
    )
    prepared_order_fragments = (
        'host._set_world_log_message("地图轻量布局回归消息")',
        "panel_flow.reset_map_minimap_fallback_build_count_for_qa()",
        "host._open_map_panel()",
        "var prepared_visual_ok: bool = (",
        "var prepared_fallback_builds_first: int = (",
        "var prepared_fallback_skipped_ok: bool = (",
        '_print_map_lightweight_qa_snapshot("firebud_prepared_open"',
    )
    prepared_order = [
        auto_map_source.find(fragment)
        for fragment in prepared_order_fragments
    ]
    shadow_anchor = auto_map_source.find(
        "var continuation_ok: bool = ("
    )
    shadow_order_fragments = (
        '"shadow_nonprepared_before_reset"',
        "panel_flow.reset_map_minimap_fallback_build_count_for_qa()",
        "panel_flow.reset_map_world_lightweight_layout_for_qa()",
        "host._open_map_panel()",
        "var shadow_nonprepared_visual_ok: bool = (",
        "var shadow_nonprepared_fallback_builds: int = (",
        "var shadow_nonprepared_fallback_ok: bool = (",
        '_print_map_lightweight_qa_snapshot("shadow_nonprepared_open"',
        "host._close_map_panel()",
        '_print_map_lightweight_qa_snapshot("shadow_nonprepared_close"',
    )
    shadow_order = []
    shadow_cursor = shadow_anchor
    for fragment in shadow_order_fragments:
        shadow_cursor = auto_map_source.find(fragment, shadow_cursor + 1)
        shadow_order.append(shadow_cursor)
    auto_snapshot_fragments = (
        "PHASE398_MAP_LIGHTWEIGHT_QA_SNAPSHOT stage=%s",
        "panel_visible=%s open_same=%s close_same=%s active=%s",
        "minimap_fallback_count=%d full_layout_fallback_count=%d",
        "fallback_reason=%s preflight=%s layout=%s",
        "visible_menu_paths=%s visible_menu_ids=%s",
        "panel_flow._map_world_lightweight_preflight_blocker(viewport_size)",
        "panel_flow._map_world_lightweight_layout_blocker(",
        "panel_flow._map_visible_world_menu_controls()",
    )
    auto_snapshot_reset_sequences = (
        (
            '_print_map_lightweight_qa_snapshot("initial_before_reset", panel_flow)\n'
            "\tpanel_flow.reset_map_minimap_fallback_build_count_for_qa()\n"
            "\tpanel_flow.reset_map_world_lightweight_layout_for_qa()"
        ),
        (
            '_print_map_lightweight_qa_snapshot("before_hang_reset", panel_flow)\n'
            "\tpanel_flow.reset_map_world_lightweight_layout_for_qa()"
        ),
        (
            '_print_map_lightweight_qa_snapshot("before_battle_reset", panel_flow)\n'
            "\tpanel_flow.reset_map_world_lightweight_layout_for_qa()"
        ),
        (
            '_print_map_lightweight_qa_snapshot("nonformal_before_reset", panel_flow)\n'
            "\tpanel_flow.reset_map_minimap_fallback_build_count_for_qa()\n"
            "\tpanel_flow.reset_map_world_lightweight_layout_for_qa()"
        ),
        (
            '_print_map_lightweight_qa_snapshot("missing_world_before_reset", panel_flow)\n'
            "\tpanel_flow.reset_map_world_lightweight_layout_for_qa()"
        ),
    )
    required_before_reset_snapshot_stages = (
        "initial_before_reset",
        "before_hang_reset",
        "before_battle_reset",
        "nonformal_before_reset",
        "missing_world_before_reset",
    )
    auto_open_state_fragments = (
        "var no_blockers: Array[Rect2] = []",
        "WorldCameraSafeAreaModel.safe_viewport_rect(",
        "WorldCameraSafeAreaModel.player_anchor(",
        "host.world_camera_safe_anchor_screen.distance_to(",
    )
    auto_world_state_fragments = (
        'find_child("WorldHudMessageSurface", true, false)',
        'find_child("WorldHudChatSurface", true, false)',
        'find_child("WorldHudMessageActions", true, false)',
        'find_child("BattleLog", true, false)',
        "formal_battle_log.get_parent() == chat_surface",
        "host.battle_message_expand_button.get_parent()",
        "host.battle_message_clear_button.get_parent()",
    )
    if any(fragment not in main_source for fragment in main_fragments):
        raise Phase399MapPerfError(
            "Phase399地图渲染诊断未通过最小Main统一flag接入"
        )
    if any(fragment not in capture_source for fragment in capture_fragments):
        raise Phase399MapPerfError(
            "Phase399地图渲染诊断缺少五态／前台／逐帧／输入证据接线"
        )
    if any(
        fragment not in capture_source
        for fragment in formal_message_capture_fragments
    ) or any(
        fragment not in panel_flow_source
        for fragment in formal_message_panel_flow_fragments
    ) or any(
        fragment not in world_hud_view_source
        for fragment in formal_message_view_fragments
    ) or any(
        fragment not in world_hud_view_check_source
        for fragment in formal_message_check_fragments
    ):
        raise Phase399MapPerfError(
            "正式WorldHud ChatSurface缺少复用展开／清空按钮、权威回调或真实pressed门"
        )
    if (
        message_check_source.count("expand_button.pressed.emit()") != 2
        or message_check_source.count("clear_button.pressed.emit()") != 1
        or message_check_source.find('expand_button.text == "收起"')
        < message_check_source.find("expand_button.pressed.emit()")
        or message_check_source.find("clear_button.pressed.emit()")
        < message_check_source.find('expand_button.text == "收起"')
        or message_check_source.rfind("expand_button.pressed.emit()")
        < message_check_source.find("clear_button.pressed.emit()")
    ):
        raise Phase399MapPerfError(
            "WorldHud focused必须按真实展开→清空→恢复顺序触发复用Button"
        )
    if (
        rollback_capture_sequence not in world_hud_view_check_source
        or rollback_assert_sequence not in world_hud_view_check_source
        or rollback_capture_source.count("await process_frame") != 2
        or rollback_assert_source.count("await process_frame") != 2
        or world_hud_view_check_source.count(
            "var rollback_message_panel: Control = ("
        ) != 1
        or world_hud_view_check_source.count(
            "rollback_message_panel.visible = true"
        ) != 2
        or world_hud_view_check_source.count(
            "rollback_message_panel.visible = false"
        ) != 2
        or "RenderingServer.frame_post_draw" in world_hud_view_check_source
        or "physics_frame" in rollback_capture_source
        or "physics_frame" in rollback_assert_source
        or "create_timer" in rollback_capture_source
        or "create_timer" in rollback_assert_source
        or "call_deferred" in rollback_capture_source
        or "call_deferred" in rollback_assert_source
        or any(
            fragment not in rollback_structure_source
            for fragment in rollback_structure_fragments
        )
        or any(
            fragment not in world_hud_view_check_source
            for fragment in rollback_expectation_transform_fragments
        )
        or view_rollback_source.count(rollback_semantic_call) != 1
        or hashlib.sha256(
            view_rollback_source.strip().encode("utf-8")
        ).hexdigest()
        != view_rollback_sha256
        or view_rollback_source.count(rollback_geometry_call) != 1
        or rollback_two_pass_sequence not in view_rollback_source
        or rollback_fail_safe_cleanup_sequence not in view_rollback_source
        or rollback_depth_order_fragment not in view_rollback_source
        or view_rollback_source.find(rollback_semantic_call)
        >= view_rollback_source.find(rollback_geometry_call)
        or "func _restore_mount_item(" in world_hud_view_source
        or "_restore_control_mount_state(" in world_hud_view_source
        or any(
            fragment not in view_semantic_item_source
            for fragment in semantic_item_required_fragments
        )
        or any(
            fragment not in view_semantic_control_source
            for fragment in semantic_control_required_fragments
        )
        or view_semantic_item_source.strip() != semantic_item_sequence.strip()
        or view_semantic_control_source.strip() != semantic_control_sequence.strip()
        or any(
            fragment in view_semantic_item_source
            or fragment in view_semantic_control_source
            for fragment in semantic_geometry_forbidden
        )
        or view_geometry_item_source.strip() != geometry_item_sequence.strip()
        or view_geometry_control_source.strip() != geometry_control_sequence.strip()
        or world_hud_view_check_source.count(
            rollback_noncanonical_names_sequence
        ) != 1
        or rollback_noncanonical_source.strip()
        != rollback_noncanonical_sequence.strip()
        or hashlib.sha256(
            rollback_internal_name_source.strip().encode("utf-8")
        ).hexdigest()
        != rollback_internal_name_sha256
        or hashlib.sha256(
            rollback_structure_source.strip().encode("utf-8")
        ).hexdigest()
        != rollback_structure_sha256
        or hashlib.sha256(
            rollback_full_source.strip().encode("utf-8")
        ).hexdigest()
        != rollback_full_sha256
        or hashlib.sha256(
            rollback_expect_source.strip().encode("utf-8")
        ).hexdigest()
        != rollback_expect_sha256
        or hashlib.sha256(
            rollback_write_set_source.strip().encode("utf-8")
        ).hexdigest()
        != rollback_write_set_sha256
        or hashlib.sha256(
            rollback_run_tail_source.strip().encode("utf-8")
        ).hexdigest()
        != rollback_run_tail_sha256
        or world_hud_view_check_source.count(
            "\t_append_mount_write_set_errors("
        ) != 2
        or world_hud_view_check_source.count(
            "\t_append_mount_name_helper_contract_errors(legacy_host)"
        ) != 1
        or 'message_title.name =' in world_hud_view_check_source
        or world_hud_view_check_source.count(
            'hang_button.name = "MountedReadableNameMutation"'
        ) != 1
        or world_hud_view_check_source.count(
            'hang_button.name != expected.get("name")'
        ) != 1
        or "_mount_item_snapshot(" in world_hud_view_check_source
        or "_errors.clear()" in world_hud_view_check_source
        or any(index < 0 for index in geometry_order)
        or geometry_order != sorted(geometry_order)
        or any(
            fragment in view_geometry_control_source
            for fragment in geometry_semantic_forbidden
        )
        or any(
            fragment not in rollback_full_source
            for fragment in rollback_full_geometry_fragments
        )
        or any(
            fragment not in rollback_full_source
            for fragment in rollback_full_semantic_fragments
        )
        or rollback_exact_size_fragment not in rollback_full_source
        or "control is Container" in rollback_structure_source
        or "control is Container" in rollback_full_source
    ):
        raise Phase399MapPerfError(
            "WorldHud rollback必须先全量恢复语义／min／theme／text，再按depth升序仅重放几何；focused须同调用与settled两次精确断言"
        )
    if (
        any(index < 0 for index in prepared_order)
        or prepared_order != sorted(prepared_order)
        or shadow_anchor < 0
        or any(index < 0 for index in shadow_order)
        or shadow_order != sorted(shadow_order)
        or 'host.world_log_message = "地图轻量布局回归消息"'
        in auto_map_source
        or "prepared_fallback_builds_first == 0" not in auto_map_source
        or "shadow_nonprepared_fallback_builds == 1"
        not in auto_map_source
        or any(
            fragment not in auto_snapshot_source
            for fragment in auto_snapshot_fragments
        )
        or any(
            auto_map_source.count(f'"{stage}"') != 1
            for stage in required_before_reset_snapshot_stages
        )
        or any(
            sequence not in auto_map_source
            for sequence in auto_snapshot_reset_sequences
        )
        or any(
            fragment not in auto_open_state_source
            for fragment in auto_open_state_fragments
        )
        or "Rect2(Vector2.ZERO, viewport_size)"
        in auto_open_state_source
        or any(
            fragment not in auto_world_state_source
            for fragment in auto_world_state_fragments
        )
    ):
        raise Phase399MapPerfError(
            "地图auto缺少权威消息、prepared／nonprepared冻结、安全区或原始PFC快照门"
        )
    if any(
        fragment not in panel_flow_source
        for fragment in panel_flow_fragments
    ) or any(
        fragment not in map_panel_source
        for fragment in map_panel_fragments
    ) or any(
        fragment not in auto_check_source
        for fragment in auto_check_type_fragments
    ):
        raise Phase399MapPerfError(
            "地图打开分段计时缺少default-off或三层ownership接线"
        )
    focus_call = capture_source.find(
        "if not await _diagnostic_prepare_autofill_guard():"
    )
    start_marker = capture_source.find(
        '"PHASE399_MAP_DIAGNOSTIC_START scene=Main.tscn "'
    )
    focus_helper_start = capture_source.find(
        "func _diagnostic_prepare_autofill_guard() -> bool:"
    )
    focus_helper_end = capture_source.find(
        "\n\nfunc _diagnostic_prepare_static_world_target()",
        focus_helper_start,
    )
    focus_helper = (
        capture_source[focus_helper_start:focus_helper_end]
        if focus_helper_start >= 0 and focus_helper_end > focus_helper_start
        else ""
    )
    focus_read = focus_helper.find("viewport.gui_get_focus_owner()")
    focus_release = focus_helper.find(
        "(focus_before as Control).release_focus()"
    )
    focus_target = focus_helper.find("_map_entry.grab_focus()")
    focus_process = focus_helper.find(
        "await host.get_tree().process_frame"
    )
    focus_post_draw = focus_helper.find(
        "await RenderingServer.frame_post_draw"
    )
    focus_read_after = focus_helper.find(
        "viewport.gui_get_focus_owner()",
        focus_read + 1,
    )
    focus_foreground = focus_helper.find(
        "var foreground := DisplayServer.window_is_focused()"
    )
    focus_log = focus_helper.find(
        '"PHASE399_MAP_DIAGNOSTIC_FOCUS_SETUP status=observed "'
    )
    focus_text_guard = focus_helper.find("if focused_text_after:")
    focus_target_guard = focus_helper.find("if focus_after != _map_entry:")
    focus_foreground_guard = focus_helper.find("if not foreground:")
    if not (
        0 <= focus_call < start_marker
        and capture_source.count(
            "if not await _diagnostic_prepare_autofill_guard():"
        ) == 1
        and capture_source.count(
            '"PHASE399_MAP_DIAGNOSTIC_FOCUS_SETUP status=observed "'
        ) == 1
        and 0 <= focus_read < focus_release < focus_target < focus_process
        < focus_post_draw < focus_read_after < focus_foreground < focus_log
        < focus_text_guard < focus_target_guard < focus_foreground_guard
    ):
        raise Phase399MapPerfError(
            "地图诊断autofill guard必须在START前唯一执行并按文本释放→世界焦点→process/post-draw→fresh检查输出"
        )
    open_start = panel_flow_source.find("func _open_map_panel() -> void:")
    open_end = panel_flow_source.find(
        "\n\nfunc _close_map_panel()",
        open_start,
    )
    refresh_start = panel_flow_source.find(
        "func _refresh_map_panel(diagnostic_timing = null) -> void:"
    )
    refresh_end = panel_flow_source.find(
        "\n\nfunc _map_targets_for_current_map()",
        refresh_start,
    )
    apply_start = map_panel_source.find("func apply_view_state(")
    apply_end = map_panel_source.find(
        "\n\nfunc reset_to_local_view()",
        apply_start,
    )
    open_source = (
        panel_flow_source[open_start:open_end]
        if open_start >= 0 and open_end > open_start
        else ""
    )
    close_start = panel_flow_source.find(
        "func _close_map_panel() -> void:",
        open_end,
    )
    blocker_start = panel_flow_source.find(
        "func _map_world_lightweight_layout_blocker(",
        close_start,
    )
    preflight_start = panel_flow_source.find(
        "func _map_world_lightweight_preflight_blocker(",
        blocker_start,
    )
    formal_ready_start = panel_flow_source.find(
        "func _map_formal_world_hud_ready() -> bool:",
        preflight_start,
    )
    visible_menu_start = panel_flow_source.find(
        "func _map_visible_world_menu_controls()",
        formal_ready_start,
    )
    light_layout_start = panel_flow_source.find(
        "func _apply_map_world_lightweight_layout(",
        visible_menu_start,
    )
    safe_tail_start = panel_flow_source.find(
        "func _apply_map_world_safe_area_tail(",
        light_layout_start,
    )
    full_fallback_start = panel_flow_source.find(
        "func _apply_map_world_full_layout_fallback(",
        safe_tail_start,
    )
    next_panel_start = panel_flow_source.find(
        "\n\nfunc _open_chat_panel()",
        full_fallback_start,
    )
    blocker_source = (
        panel_flow_source[blocker_start:preflight_start]
        if blocker_start >= 0 and preflight_start > blocker_start
        else ""
    )
    preflight_source = (
        panel_flow_source[preflight_start:formal_ready_start]
        if preflight_start >= 0 and formal_ready_start > preflight_start
        else ""
    )
    tutorial_start = panel_flow_source.find(
        "func _record_tutorial_feature_opened(feature_id: String) -> void:"
    )
    tutorial_end = panel_flow_source.find(
        "\n\nfunc _queue_server_quest_record_event(", tutorial_start
    )
    tutorial_source = (
        panel_flow_source[tutorial_start:tutorial_end]
        if 0 <= tutorial_start < tutorial_end
        else ""
    )
    certainty_start = player_progress_source.find(
        "static func active_quest_event_match_certainty("
    )
    certainty_end = player_progress_source.find(
        "\n\nstatic func record_current_battle_pet_quest(", certainty_start
    )
    certainty_source = (
        player_progress_source[certainty_start:certainty_end]
        if 0 <= certainty_start < certainty_end
        else ""
    )
    formal_ready_source = (
        panel_flow_source[formal_ready_start:visible_menu_start]
        if formal_ready_start >= 0 and visible_menu_start > formal_ready_start
        else ""
    )
    light_layout_source = (
        panel_flow_source[light_layout_start:safe_tail_start]
        if light_layout_start >= 0 and safe_tail_start > light_layout_start
        else ""
    )
    safe_tail_source = (
        panel_flow_source[safe_tail_start:full_fallback_start]
        if safe_tail_start >= 0 and full_fallback_start > safe_tail_start
        else ""
    )
    full_fallback_source = (
        panel_flow_source[full_fallback_start:next_panel_start]
        if full_fallback_start >= 0 and next_panel_start > full_fallback_start
        else ""
    )
    refresh_source = (
        panel_flow_source[refresh_start:refresh_end]
        if refresh_start >= 0 and refresh_end > refresh_start
        else ""
    )
    apply_source = (
        map_panel_source[apply_start:apply_end]
        if apply_start >= 0 and apply_end > apply_start
        else ""
    )
    reset_start = apply_end
    show_mode_start = map_panel_source.find(
        "func show_mode(mode: String) -> void:",
        reset_start,
    )
    reset_source = (
        map_panel_source[reset_start:show_mode_start]
        if reset_start >= 0 and show_mode_start > reset_start
        else ""
    )
    node_live_start = map_panel_source.find(
        "static func _node_is_live(value) -> bool:"
    )
    ancestry_live_start = map_panel_source.find(
        "static func _node_has_live_ancestry_to(value, expected_ancestor) -> bool:",
        node_live_start,
    )
    children_live_start = map_panel_source.find(
        "static func _all_direct_children_live(container_value) -> bool:",
        ancestry_live_start,
    )
    fixed_nodes_start = map_panel_source.find(
        "func _fixed_ui_root_nodes() -> Array:",
        children_live_start,
    )
    fixed_ready_start = map_panel_source.find(
        "func _fixed_ui_roots_ready() -> bool:",
        fixed_nodes_start,
    )
    rebuild_roots_start = map_panel_source.find(
        "func _rebuild_fixed_ui_roots() -> void:",
        fixed_ready_start,
    )
    cache_context_start = map_panel_source.find(
        "func _build_prepared_cache_context("
        , rebuild_roots_start
    )
    signature_start = map_panel_source.find(
        "func _static_signature(value: Dictionary) -> Dictionary:",
        cache_context_start,
    )
    signatures_equal_start = map_panel_source.find(
        "func _signatures_equal(left: Dictionary, right: Dictionary) -> bool:",
        signature_start,
    )
    signature_with_base_start = map_panel_source.find(
        "func _signature_with_base(",
        signatures_equal_start,
    )
    invalidate_start = map_panel_source.find(
        "func _invalidate_prepared_static_cache() -> void:",
        signature_with_base_start,
    )
    sorted_keys_start = map_panel_source.find(
        "func _sorted_string_keys(values: Dictionary) -> Array[String]:",
        invalidate_start,
    )
    sidebar_ready_start = map_panel_source.find(
        "func _local_sidebar_cache_ready() -> bool:",
        sorted_keys_start,
    )
    regions_ready_start = map_panel_source.find(
        "func _world_regions_cache_ready() -> bool:",
        sidebar_ready_start,
    )
    detail_ready_start = map_panel_source.find(
        "func _world_detail_cache_ready() -> bool:",
        regions_ready_start,
    )
    sidebar_refresh_start = map_panel_source.find(
        "func _refresh_local_sidebar(context: Dictionary) -> void:",
        detail_ready_start,
    )
    regions_refresh_start = map_panel_source.find(
        "func _refresh_world_regions(context: Dictionary) -> void:",
        sidebar_refresh_start,
    )
    detail_refresh_start = map_panel_source.find(
        "func _refresh_selected_world_region(context: Dictionary) -> void:",
        regions_refresh_start,
    )
    ensure_selection_start = map_panel_source.find(
        "func _ensure_selected_world_region(current_region_id: String) -> void:",
        detail_refresh_start,
    )
    populate_local_start = map_panel_source.find(
        "func _populate_local_sidebar() -> void:",
        ensure_selection_start,
    )
    configure_map_start = map_panel_source.find(
        "func _configure_local_map(",
        populate_local_start,
    )
    ensure_canvas_start = map_panel_source.find(
        "func _ensure_local_map_canvas_ready() -> bool:",
        configure_map_start,
    )
    build_markers_start = map_panel_source.find(
        "func _build_map_markers() -> void:",
        ensure_canvas_start,
    )
    marker_positions_start = map_panel_source.find(
        "func _refresh_map_marker_positions() -> void:",
        build_markers_start,
    )
    marker_positions_end = map_panel_source.find(
        "\n\nfunc _target_should_show_on_map(",
        marker_positions_start,
    )
    populate_regions_start = map_panel_source.find(
        "func _populate_world_regions() -> void:",
        marker_positions_start,
    )
    atlas_anchor_start = map_panel_source.find(
        "func _region_atlas_anchor(region_id: String) -> Vector2:",
        populate_regions_start,
    )
    render_detail_start = map_panel_source.find(
        "func _render_selected_world_region() -> void:",
        atlas_anchor_start,
    )
    sync_region_start = map_panel_source.find(
        "func _sync_world_region_button_state() -> void:",
        render_detail_start,
    )
    world_entry_start = map_panel_source.find(
        "func _on_world_entry_route_pressed() -> void:",
        sync_region_start,
    )
    latest_target_start = map_panel_source.find(
        "func _emit_latest_local_target(target_id: String) -> void:",
        world_entry_start,
    )
    latest_destination_start = map_panel_source.find(
        "func _emit_latest_map_destination(region_id: String, map_id: String) -> void:",
        latest_target_start,
    )
    world_point_start = map_panel_source.find(
        "func _world_map_point_state(region_id: String, map_id: String) -> Dictionary:",
        latest_destination_start,
    )
    region_point_start = map_panel_source.find(
        "func _region_point_for_map(region: Dictionary, map_id: String) -> Dictionary:",
        world_point_start,
    )
    clear_children_start = map_panel_source.find(
        "func _clear_children(container: Node) -> void:",
        region_point_start,
    )
    cache_slices = {
        "node_live": map_panel_source[node_live_start:ancestry_live_start],
        "ancestry_live": map_panel_source[
            ancestry_live_start:children_live_start
        ],
        "children_live": map_panel_source[
            children_live_start:fixed_nodes_start
        ],
        "fixed_nodes": map_panel_source[fixed_nodes_start:fixed_ready_start],
        "fixed_ready": map_panel_source[fixed_ready_start:rebuild_roots_start],
        "rebuild_roots": map_panel_source[
            rebuild_roots_start:cache_context_start
        ],
        "context": map_panel_source[cache_context_start:signature_start],
        "signature": map_panel_source[
            signature_start:signatures_equal_start
        ],
        "signatures_equal": map_panel_source[
            signatures_equal_start:signature_with_base_start
        ],
        "signature_with_base": map_panel_source[
            signature_with_base_start:invalidate_start
        ],
        "invalidate": map_panel_source[invalidate_start:sorted_keys_start],
        "sorted_keys": map_panel_source[
            sorted_keys_start:sidebar_ready_start
        ],
        "sidebar_ready": map_panel_source[
            sidebar_ready_start:regions_ready_start
        ],
        "regions_ready": map_panel_source[
            regions_ready_start:detail_ready_start
        ],
        "detail_ready": map_panel_source[
            detail_ready_start:sidebar_refresh_start
        ],
        "sidebar_refresh": map_panel_source[
            sidebar_refresh_start:regions_refresh_start
        ],
        "regions_refresh": map_panel_source[
            regions_refresh_start:detail_refresh_start
        ],
        "detail_refresh": map_panel_source[
            detail_refresh_start:ensure_selection_start
        ],
        "ensure_selection": map_panel_source[
            ensure_selection_start:populate_local_start
        ],
        "populate_local": map_panel_source[
            populate_local_start:configure_map_start
        ],
        "configure_map": map_panel_source[
            configure_map_start:ensure_canvas_start
        ],
        "ensure_canvas": map_panel_source[
            ensure_canvas_start:build_markers_start
        ],
        "build_markers": map_panel_source[
            build_markers_start:marker_positions_start
        ],
        "marker_positions": map_panel_source[
            marker_positions_start:marker_positions_end
        ],
        "populate_regions": map_panel_source[
            populate_regions_start:atlas_anchor_start
        ],
        "render_detail": map_panel_source[
            render_detail_start:sync_region_start
        ],
        "world_entry": map_panel_source[
            world_entry_start:latest_target_start
        ],
        "latest_target": map_panel_source[
            latest_target_start:latest_destination_start
        ],
        "latest_destination": map_panel_source[
            latest_destination_start:world_point_start
        ],
        "world_point": map_panel_source[
            world_point_start:region_point_start
        ],
        "clear_children": map_panel_source[clear_children_start:],
    }
    cache_boundaries = (
        node_live_start,
        ancestry_live_start,
        children_live_start,
        fixed_nodes_start,
        fixed_ready_start,
        rebuild_roots_start,
        cache_context_start,
        signature_start,
        signatures_equal_start,
        signature_with_base_start,
        invalidate_start,
        sorted_keys_start,
        sidebar_ready_start,
        regions_ready_start,
        detail_ready_start,
        sidebar_refresh_start,
        regions_refresh_start,
        detail_refresh_start,
        ensure_selection_start,
        populate_local_start,
        configure_map_start,
        ensure_canvas_start,
        build_markers_start,
        marker_positions_start,
        populate_regions_start,
        atlas_anchor_start,
        render_detail_start,
        sync_region_start,
        world_entry_start,
        latest_target_start,
        latest_destination_start,
        world_point_start,
        region_point_start,
        clear_children_start,
    )
    if (
        any(index < 0 for index in cache_boundaries)
        or list(cache_boundaries) != sorted(cache_boundaries)
        or marker_positions_end <= marker_positions_start
        or any(not value or "\nfunc " in value for value in cache_slices.values())
    ):
        raise Phase399MapPerfError(
            "prepared地图静态缓存函数边界必须唯一且有序"
        )
    cache_context_fragments = (
        "var prepared_usable := can_use_prepared_visual(",
        "var valid := (\n\t\tprepared_usable",
        'state.get("mapVisualRevision", -1)',
        'state.get("mapCatalogRevision", "")',
        'state.get("mapRouteContractRevision", "")',
        'state.get("mapNames", {})',
        'state.get("localTargets", null) is Array',
        'state.get("currentRegion", null) is Dictionary',
        'state.get("worldRegions", null) is Array',
        '"currentMapId": current_map_id',
        '"mapVisualRevision": visual_revision',
        '"mapCatalogRevision": catalog_revision',
        '"mapRouteContractRevision": route_revision',
        '"mapNames": map_names_value',
        '"worldBounds": [',
        '"canvasSignature": _static_signature({',
    )
    signature_fragments = (
        "return value.duplicate(true)",
        "left.recursive_equal(right, 0)",
        "projection[key] = payload.get(key)",
        "return _static_signature(projection)",
    )
    cache_ready_fragments = (
        "_all_direct_children_live(marker_container)",
        "_sorted_string_keys(marker_buttons)",
        "_prepared_sidebar_button_keys",
        "_sorted_string_keys(_local_destination_buttons)",
        "_prepared_sidebar_destination_button_keys",
        "button.get_parent() != marker_container",
        "_all_direct_children_live(_world_region_list)",
        "_sorted_string_keys(_world_region_buttons)",
        "_prepared_region_button_keys",
        "button.get_parent() != _world_region_list",
        "_all_direct_children_live(_world_detail_points)",
        "_sorted_string_keys(_world_route_buttons)",
        "_prepared_detail_button_keys",
        "button.get_parent() != _world_detail_points",
    )
    cache_refresh_fragments = (
        '"localTargets": _view_state.get("localTargets", [])',
        '"currentRegion": _view_state.get("currentRegion", {})',
        "_local_sidebar_cache_ready()",
        "_populate_local_sidebar()",
        '"worldRegions": _view_state.get("worldRegions", [])',
        "_world_regions_cache_ready()",
        "_populate_world_regions()",
        '"selectedWorldRegionId": _selected_world_region_id',
        '"selectedWorldRegion": _world_region_state(',
        "_world_detail_cache_ready()",
        "_render_selected_world_region()",
    )
    stable_callback_fragments = (
        "_local_destination_buttons.clear()",
        "_emit_latest_local_target(",
        "_emit_latest_map_destination(captured_region_id, captured_map_id)",
        "_local_destination_buttons[map_id] = button",
        "_refresh_selected_world_region(_prepared_cache_context)",
        "route_target_requested.emit(target.duplicate(true))",
        'var targets_value = _view_state.get("localTargets", [])',
        "var point := _world_map_point_state(region_id, map_id)",
        "if point.is_empty():",
        "map_destination_requested.emit(map_id, label)",
    )
    fixed_root_fragments = (
        "legacy_texture_rect",
        "legacy_detail_label",
        "marker_container",
        "_world_region_list",
        "_world_detail_points",
        "_world_entry_route_button",
        "_world_detail_column",
        "_map_marker_overlay",
        "not _node_is_live(_ui_root)",
        "_ui_root.get_parent() != self",
        "not _node_has_live_ancestry_to(value, _ui_root)",
        "_world_entry_route_button.get_parent() == _world_detail_column",
        "_ui_root.free()",
        "node.free()",
        "_invalidate_prepared_static_cache()",
        "_build_ui()",
    )
    node_live_fragments = (
        "is_instance_valid(value)",
        "value is Node",
        "not (value as Node).is_queued_for_deletion()",
    )
    ancestry_live_fragments = (
        "not _node_is_live(value)",
        "not _node_is_live(expected_ancestor)",
        "while node != ancestor:",
        "node = node.get_parent()",
        "if not _node_is_live(node):",
    )
    children_live_fragments = (
        "if not _node_is_live(container_value):",
        "for child in container.get_children():",
        "not _node_is_live(child)",
        "child.get_parent() != container",
    )
    clear_children_fragments = (
        "for child in container.get_children():",
        "container.remove_child(child)",
        "if not child.is_queued_for_deletion():",
        "child.queue_free()",
    )
    reset_repair_order = (
        reset_source.find("if not _fixed_ui_roots_ready():"),
        reset_source.find("_rebuild_fixed_ui_roots()"),
        reset_source.find("show_mode(MapAwakenedPresenter.MODE_LOCAL)"),
    )
    if (
        any(
            fragment not in cache_slices["context"]
            for fragment in cache_context_fragments
        )
        or any(
            fragment not in (
                cache_slices["signature"]
                + cache_slices["signatures_equal"]
                + cache_slices["signature_with_base"]
            )
            for fragment in signature_fragments
        )
        or "JSON.stringify(" in map_panel_source[
            cache_context_start:build_markers_start
        ]
        or any(
            fragment not in (
                cache_slices["sidebar_ready"]
                + cache_slices["regions_ready"]
                + cache_slices["detail_ready"]
            )
            for fragment in cache_ready_fragments
        )
        or any(
            fragment not in (
                cache_slices["sidebar_refresh"]
                + cache_slices["regions_refresh"]
                + cache_slices["detail_refresh"]
            )
            for fragment in cache_refresh_fragments
        )
        or any(
            fragment not in (
                cache_slices["populate_local"]
                + cache_slices["build_markers"]
                + cache_slices["populate_regions"]
                + cache_slices["render_detail"]
                + cache_slices["latest_target"]
                + cache_slices["latest_destination"]
            )
            for fragment in stable_callback_fragments
        )
        or any(
            fragment not in (
                cache_slices["fixed_nodes"]
                + cache_slices["fixed_ready"]
                + cache_slices["rebuild_roots"]
            )
            for fragment in fixed_root_fragments
        )
        or any(
            fragment not in cache_slices["node_live"]
            for fragment in node_live_fragments
        )
        or any(
            fragment not in cache_slices["ancestry_live"]
            for fragment in ancestry_live_fragments
        )
        or any(
            fragment not in cache_slices["children_live"]
            for fragment in children_live_fragments
        )
        or any(
            fragment not in cache_slices["clear_children"]
            for fragment in clear_children_fragments
        )
        or any(index < 0 for index in reset_repair_order)
        or list(reset_repair_order) != sorted(reset_repair_order)
        or cache_slices["context"].count("\n\treturn {") != 1
        or cache_slices["context"].find("\n\treturn {")
        < cache_slices["context"].find("var base := {")
        or cache_slices["sidebar_ready"].count("return true") != 1
        or cache_slices["regions_ready"].count("return true") != 1
        or cache_slices["detail_ready"].count("return true") != 1
        or cache_slices["sidebar_refresh"].find("return")
        < cache_slices["sidebar_refresh"].find(
            "_local_sidebar_cache_ready()"
        )
        or "route_target_requested.emit(" in cache_slices["populate_local"]
        or "captured_target_index" in cache_slices["populate_local"]
        or "captured_target_index" in cache_slices["build_markers"]
        or "target_index" in cache_slices["latest_target"]
        or map_panel_source.count(
            "_emit_latest_map_destination(captured_region_id, captured_map_id)"
        ) != 2
        or 'if _selected_world_region_id == "":' not in cache_slices[
            "ensure_selection"
        ]
        or "map_destination_requested.emit(" in (
            cache_slices["populate_local"]
            + cache_slices["populate_regions"]
            + cache_slices["render_detail"]
        )
        or not cache_slices["world_point"].rstrip().endswith("return {}")
    ):
        raise Phase399MapPerfError(
            "prepared地图静态缓存缺少完整原生签名、节点key门或latest view-state闭包"
        )
    latest_destination_order = (
        cache_slices["latest_destination"].find(
            "var point := _world_map_point_state(region_id, map_id)"
        ),
        cache_slices["latest_destination"].find("if point.is_empty():"),
        cache_slices["latest_destination"].find("\n\t\treturn"),
        cache_slices["latest_destination"].find(
            'var label := str(point.get("label", map_id))'
        ),
        cache_slices["latest_destination"].find(
            "map_destination_requested.emit(map_id, label)"
        ),
    )
    if (
        any(index < 0 for index in latest_destination_order)
        or list(latest_destination_order) != sorted(latest_destination_order)
        or 'if region_id == "" or map_id == "":' not in cache_slices[
            "world_point"
        ]
        or 'get("id", ""))\n\t\t\t== region_id' not in cache_slices[
            "world_point"
        ]
        or 'get("id", "")) != region_id' not in cache_slices[
            "world_point"
        ]
        or 'get("entryMapId"' in cache_slices["world_point"]
        or "var region := _world_region_state(_selected_world_region_id)" not in cache_slices[
            "world_entry"
        ]
        or 'var map_id := str(region.get("entryMapId", ""))' not in cache_slices[
            "world_entry"
        ]
        or 'region.get("entryMapName", region.get("label", map_id))' not in cache_slices[
            "world_entry"
        ]
        or "map_destination_requested.emit(map_id, label)" not in cache_slices[
            "world_entry"
        ]
        or "_emit_latest_map_destination(" in cache_slices["world_entry"]
    ):
        raise Phase399MapPerfError(
            "缓存地图地点按钮必须从latest view-state解析，ID消失时在emit前fail closed"
        )
    configure_source = cache_slices["configure_map"]
    configure_prepared = configure_source.find("if _using_prepared_visual:")
    configure_fallback = configure_source.find("\n\telse:", configure_prepared)
    configure_markers = configure_source.rfind("_build_map_markers()")
    if (
        "can_use_prepared_visual(" not in configure_source
        or "not _ensure_local_map_canvas_ready()" not in configure_source
        or "_map_canvas.configure(" not in configure_source
        or "_prepared_canvas_signature = {}" not in configure_source[
            configure_fallback:configure_markers
        ]
        or "legacy_texture_rect.texture = fallback_texture" not in (
            configure_source[configure_fallback:configure_markers]
        )
        or not (
            0 <= configure_prepared < configure_fallback < configure_markers
        )
        or configure_source.count("\n\t_build_map_markers()\n") != 1
        or "\n\treturn" in configure_source
        or "_prepared_canvas_signature = {}" not in cache_slices[
            "ensure_canvas"
        ]
        or "WorldHudMinimapRenderCanvas.new()" not in cache_slices[
            "ensure_canvas"
        ]
        or "if not _node_is_live(_map_viewport):" not in cache_slices[
            "ensure_canvas"
        ]
        or "if is_instance_valid(_map_viewport):\n\t\t\t_map_viewport.free()" not in cache_slices[
            "ensure_canvas"
        ]
        or "if not _node_is_live(_map_canvas):" not in cache_slices[
            "ensure_canvas"
        ]
        or "if is_instance_valid(_map_canvas):\n\t\t\t_map_canvas.free()" not in cache_slices[
            "ensure_canvas"
        ]
        or "if not _fixed_ui_roots_ready():" not in cache_slices[
            "marker_positions"
        ]
        or "_using_prepared_visual and not _node_is_live(_map_canvas)" not in cache_slices[
            "marker_positions"
        ]
    ):
        raise Phase399MapPerfError(
            "prepared canvas必须按revision／bounds有界复用，节点缺失重建，nonprepared消费fresh fallback并始终刷新marker"
        )
    refresh_alias_order = (
        refresh_source.find("if map_panel == null:"),
        refresh_source.find("if map_panel is MapAwakenedPanel:"),
        refresh_source.find("awakened_panel.apply_view_state("),
        refresh_source.find("map_close_button = awakened_panel.close_button"),
        refresh_source.find(
            "map_texture_rect = awakened_panel.legacy_texture_rect"
        ),
        refresh_source.find(
            "map_detail_label = awakened_panel.legacy_detail_label"
        ),
        refresh_source.find(
            "map_marker_container = awakened_panel.marker_container"
        ),
        refresh_source.find(
            "map_marker_buttons = awakened_panel.marker_buttons"
        ),
    )
    awakened_return = refresh_source.find(
        "\n\t\treturn\n",
        refresh_alias_order[-1],
    )
    legacy_alias_guard = refresh_source.find(
        "if map_texture_rect == null or map_detail_label == null "
        "or map_marker_container == null:",
        awakened_return,
    )
    if (
        any(index < 0 for index in refresh_alias_order)
        or list(refresh_alias_order) != sorted(refresh_alias_order)
        or not (refresh_alias_order[-1] < awakened_return < legacy_alias_guard)
        or "map_texture_rect" in refresh_source[
            refresh_alias_order[0]:refresh_alias_order[1]
        ]
        or refresh_source.count(
            "map_marker_container = awakened_panel.marker_container"
        ) != 1
    ):
        raise Phase399MapPerfError(
            "awakened地图必须先进入panel自愈，再重发四个宿主alias；legacy guard只能位于正式分支之后"
        )
    apply_cache_order = (
        apply_source.find("if not _fixed_ui_roots_ready():"),
        apply_source.find("_rebuild_fixed_ui_roots()"),
        apply_source.find("_view_state = state.duplicate(true)"),
        apply_source.find("_build_prepared_cache_context("),
        apply_source.find("_header_location_label.text"),
        apply_source.find("_refresh_local_sidebar("),
        apply_source.find("_configure_local_map("),
        apply_source.find("_refresh_world_regions("),
        apply_source.find("_ensure_selected_world_region("),
        apply_source.find("_refresh_selected_world_region("),
        apply_source.find("show_mode(MapAwakenedPresenter.MODE_LOCAL)"),
    )
    if (
        any(index < 0 for index in apply_cache_order)
        or list(apply_cache_order) != sorted(apply_cache_order)
        or map_panel_source.count(
            "var _prepared_cache_context: Dictionary = {}"
        ) != 1
        or map_panel_source.count(
            "var _prepared_sidebar_signature: Dictionary = {}"
        ) != 1
        or map_panel_source.count(
            "var _prepared_regions_signature: Dictionary = {}"
        ) != 1
        or map_panel_source.count(
            "var _prepared_detail_signature: Dictionary = {}"
        ) != 1
        or map_panel_source.count(
            "var _prepared_canvas_signature: Dictionary = {}"
        ) != 1
    ):
        raise Phase399MapPerfError(
            "prepared地图缓存必须是单panel有界状态，且每次先投影最新动态state再局部刷新"
        )
    view_state_start = panel_flow_source.find(
        "func _map_awakened_view_state() -> Dictionary:"
    )
    map_names_start = panel_flow_source.find(
        "func _map_awakened_map_names() -> Dictionary:",
        view_state_start,
    )
    catalog_revision_start = panel_flow_source.find(
        "func _map_awakened_catalog_revision() -> String:",
        map_names_start,
    )
    route_revision_start = panel_flow_source.find(
        "func _map_awakened_route_contract_revision() -> String:",
        catalog_revision_start,
    )
    fallback_start = panel_flow_source.find(
        "func _map_minimap_texture() -> Texture2D:",
        route_revision_start,
    )
    revision_boundaries = (
        view_state_start,
        map_names_start,
        catalog_revision_start,
        route_revision_start,
        fallback_start,
    )
    view_state_source = panel_flow_source[view_state_start:map_names_start]
    catalog_revision_source = panel_flow_source[
        catalog_revision_start:route_revision_start
    ]
    route_revision_source = panel_flow_source[
        route_revision_start:fallback_start
    ]
    revision_fragments = (
        "var regions := MapRegionCatalog.regions()",
        "var map_names := _map_awakened_map_names()",
        'state["mapNames"] = map_names.duplicate(true)',
        'state["mapVisualRevision"] = int(host.map_visual_render_revision)',
        'state["mapCatalogRevision"] = _map_awakened_catalog_revision()',
        'state["mapRouteContractRevision"] = _map_awakened_route_contract_revision()',
    )
    if (
        any(index < 0 for index in revision_boundaries)
        or list(revision_boundaries) != sorted(revision_boundaries)
        or any(fragment not in view_state_source for fragment in revision_fragments)
        or "if _map_awakened_catalog_revision_cache != \"\":" not in (
            catalog_revision_source
        )
        or "JSON.stringify(catalog).sha256_text()" not in (
            catalog_revision_source
        )
        or "if _map_route_planner == null:" not in route_revision_source
        or "_map_route_planner.get_instance_id()" not in route_revision_source
        or "_map_route_planner.map_count()" not in route_revision_source
        or "_map_route_planner.directed_edge_count()" not in (
            route_revision_source
        )
        or "_map_route_planner_instance()" in route_revision_source
    ):
        raise Phase399MapPerfError(
            "地图静态缓存revision必须覆盖catalog／route／visual且不得为签名同步构建37图planner"
        )
    hang_guard = "if hang_mode_active:\n\t\thost._set_hang_mode(false)"
    deferred_guard = (
        'if lightweight_reason != "":\n'
        '\t\thost.call_deferred("_layout_hud")'
    )
    blocker_fragments = (
        'if battle_active:\n\t\treturn "battle_active"',
        'if encounter_active:\n\t\treturn "encounter_active"',
        "_map_world_lightweight_preflight_blocker(",
        'if not (map_panel is MapAwakenedPanel):\n'
        '\t\treturn "non_formal_map"',
        'return "other_world_menu"',
        'if not viewport_size.is_equal_approx(\n'
        '\t\t_map_world_lightweight_layout_viewport\n'
        '\t):\n\t\treturn "viewport_changed"',
    )
    preflight_fragments = (
        "func _map_world_lightweight_preflight_blocker(",
        'if viewport_size.x <= 0.0 or viewport_size.y <= 0.0:',
        'map_panel == null',
        'or player == null',
        'or map_data.is_empty()',
        'map_panel is MapAwakenedPanel',
        'or not _map_formal_world_hud_ready()',
        'return "non_world_state"',
        'return "missing_world_hud"',
    )
    formal_ready_fragments = (
        '"WorldHudMessageSurface", true, false',
        '"WorldHudFixedEntries", true, false',
        '"WorldHudEntryMap", true, false',
        "and map_entry == host.map_menu_button",
    )
    light_fragments = (
        "top_panel.visible = false",
        "side_panel.visible = false",
        "action_bar.visible = false",
        "battle_message_panel.visible = false",
        "party_roster_panel.visible = false",
        "_layout_world_hud_awakened(viewport_size, opening)",
        "_apply_map_world_safe_area_tail(viewport_size)",
    )
    safe_tail_fragments = (
        "host._refresh_world_camera_safe_area(viewport_size)",
        "player.set_movement_bounds(host._player_movement_bounds())",
        "host._update_camera_limits()",
        "host._update_camera_position(true)",
        "host.queue_redraw()",
    )
    if (
        hang_guard not in open_source
        or open_source.count("host._set_hang_mode(false)") != 1
        or deferred_guard not in open_source
        or any(fragment not in blocker_source for fragment in blocker_fragments)
        or any(fragment not in preflight_source for fragment in preflight_fragments)
        or any(fragment not in formal_ready_source for fragment in formal_ready_fragments)
        or "\nfunc " in blocker_source
        or "\nfunc " in preflight_source
        or "\nfunc " in formal_ready_source
        or panel_flow_source.count(
            "func _map_world_lightweight_layout_blocker("
        ) != 1
        or panel_flow_source.count(
            "func _map_world_lightweight_preflight_blocker("
        ) != 1
        or panel_flow_source.count(
            "func _map_formal_world_hud_ready() -> bool:"
        ) != 1
        or panel_flow_source.count(
            "_map_world_lightweight_layout_blocker("
        ) != 3
        or panel_flow_source.count(
            "_map_world_lightweight_preflight_blocker("
        ) != 3
        or any(fragment not in light_layout_source for fragment in light_fragments)
        or any(fragment not in safe_tail_source for fragment in safe_tail_fragments)
        or "host._layout_hud()" in light_layout_source
        or 'host.call_deferred("_layout_hud")' in light_layout_source
        or "if not _map_world_full_layout_available():" not in full_fallback_source
        or "host._layout_hud()" not in full_fallback_source
    ):
        raise Phase399MapPerfError(
            "正式MapAwakened轻量world overlay、挂机no-op或完整回退合同不完整"
        )
    tutorial_order = [
        tutorial_source.find(
            "if not (_is_server_account_session() and not auth_auto_bypass):"
        ),
        tutorial_source.find(
            "PlayerProgressModel.active_quest_event_match_certainty("
        ),
        tutorial_source.find(
            "if match_certainty == PlayerProgressModel.QUEST_EVENT_NO_MATCH:"
        ),
        tutorial_source.find("_record_quest_event_and_maybe_claim(event)"),
    ]
    certainty_fragments = (
        'or not profile.has("schemaVersion")',
        "or not profile.has(ACTIVE_QUEST_ID_KEY)",
        "or not profile.has(QUEST_STATES_KEY)",
        "or QuestModel.is_optional(quest)",
        "or not _quest_progress_available_for_profile(quest, profile)",
        "== QuestModel.STATUS_CLAIMED",
        "QuestModel.progress_amount_for_event(quest, event) > 0",
    )
    if (
        panel_flow_source.count(
            "func _record_tutorial_feature_opened(feature_id: String) -> void:"
        ) != 1
        or "\nfunc " in tutorial_source
        or any(index < 0 for index in tutorial_order)
        or tutorial_order != sorted(tutorial_order)
        or tutorial_source.count(
            "if match_certainty == PlayerProgressModel.QUEST_EVENT_NO_MATCH:"
        ) != 1
        or "QUEST_EVENT_MATCH:" in tutorial_source
        or "QUEST_EVENT_UNCERTAIN:" in tutorial_source
        or any(fragment not in certainty_source for fragment in certainty_fragments)
        or "normalize_profile(" in certainty_source
    ):
        raise Phase399MapPerfError(
            "地图教程事件三态快门必须仅跳过本地确定不匹配，server／uncertain保持权威路径"
        )
    blocker_order = [
        blocker_source.find('if battle_active:\n\t\treturn "battle_active"'),
        blocker_source.find('if encounter_active:\n\t\treturn "encounter_active"'),
        blocker_source.find("_map_world_lightweight_preflight_blocker("),
        blocker_source.find("if not (map_panel is MapAwakenedPanel):"),
    ]
    preflight_order = [
        preflight_source.find(
            "if viewport_size.x <= 0.0 or viewport_size.y <= 0.0:"
        ),
        preflight_source.find("map_panel == null"),
        preflight_source.find("map_panel is MapAwakenedPanel"),
        preflight_source.find("or not _map_formal_world_hud_ready()"),
        preflight_source.find('return "missing_world_hud"'),
    ]
    if (
        any(index < 0 for index in blocker_order + preflight_order)
        or blocker_order != sorted(blocker_order)
        or preflight_order != sorted(preflight_order)
        or blocker_source.find("return ") < blocker_order[0]
        or preflight_source.find("return ") < preflight_order[0]
    ):
        raise Phase399MapPerfError(
            "地图blocker/preflight真实控制流顺序被旁路"
        )
    preflight_call = open_source.find(
        "_map_world_lightweight_preflight_blocker("
    )
    hang_call = open_source.find("if hang_mode_active:")
    refresh_call = open_source.find("_refresh_map_panel(diagnostic_timing)")
    tutorial_call = open_source.find(
        "_record_tutorial_feature_opened(TutorialFeatureModel.FEATURE_MAP)"
    )
    final_layout_call = open_source.find(
        "_map_world_lightweight_layout_blocker("
    )
    battle_return = "if battle_active:\n\t\treturn"
    preflight_failure = (
        'if preflight_reason != "":\n'
        '\t\tif map_panel != null:\n'
        '\t\t\tmap_panel.visible = false\n'
        '\t\t_apply_map_world_full_layout_fallback(preflight_reason, false)\n'
        '\t\treturn'
    )
    if not (
        battle_return in open_source
        and preflight_failure in open_source
        and 0 <= preflight_call < hang_call < refresh_call
        < tutorial_call < final_layout_call
        and "_apply_map_world_full_layout_fallback" not in open_source[
            open_source.find(battle_return):preflight_call
        ]
    ):
        raise Phase399MapPerfError(
            "地图必须先formal preflight，再按refresh→教程→最终轻量HUD投影执行"
        )
    safe_tail_positions = [
        safe_tail_source.find(fragment) for fragment in safe_tail_fragments
    ]
    if any(index < 0 for index in safe_tail_positions) or (
        safe_tail_positions != sorted(safe_tail_positions)
    ):
        raise Phase399MapPerfError(
            "地图轻量布局未保持Phase400安全区／移动／相机／重绘顺序"
        )
    guarded_timing_fragments = (
        (
            open_source,
            "if diagnostic_timing is Dictionary:\n"
            "\t\topen_started_usec = Time.get_ticks_usec()",
        ),
        (
            refresh_source,
            "if timing_enabled:\n"
            "\t\trefresh_started_usec = Time.get_ticks_usec()",
        ),
        (
            apply_source,
            "if timing_enabled:\n"
            "\t\tapply_started_usec = Time.get_ticks_usec()",
        ),
    )
    if any(
        required not in source
        for source, required in guarded_timing_fragments
    ) or any(
        flag in panel_flow_source or flag in map_panel_source
        for flag in (PERF_CAPTURE_FLAG, RENDER_DIAGNOSTIC_FLAG)
    ):
        raise Phase399MapPerfError(
            "地图打开分段计时default-off路径不得读Time或由广义flag启用"
        )
    if (
        capture_source.count(sample_sequence) != 1
        or capture_source.count(warmup_alignment) != 2
        or any(
            capture_source.count(fragment) != 2
            for fragment in failure_context_fragments
        )
    ):
        raise Phase399MapPerfError(
            "Phase399地图渲染诊断采样顺序、post-draw对齐或失败上下文不完整"
        )
    if (
        capture_source.count('"begin_map_open_timing_for_qa"') != 1
        or capture_source.count('"consume_map_open_timing_for_qa"') != 1
        or capture_source.count(
            'map_flow.call("disable_map_open_timing_for_qa")'
        ) != 2
    ):
        raise Phase399MapPerfError(
            "地图打开分段计时只能由direct12轮显式begin/consume/disable"
        )
    emit_start = capture_source.find("func _diagnostic_emit_button(")
    emit_end = capture_source.find(
        "\n\nfunc _diagnostic_print_open_timing_raw(",
        emit_start,
    )
    emit_source = (
        capture_source[emit_start:emit_end]
        if emit_start >= 0 and emit_end > emit_start
        else ""
    )
    emit_call = emit_source.find("button.pressed.emit()")
    consume_call = emit_source.find('"consume_map_open_timing_for_qa"')
    raw_call = emit_source.find("_diagnostic_print_open_timing_raw(")
    structure_call = emit_source.find(
        "_diagnostic_validate_open_timing_sample("
    )
    post_emit_state = emit_source.find(
        "if not bool(state_predicate.call()):",
        emit_call + 1,
    )
    if not (
        0 <= emit_call < consume_call < raw_call < structure_call
        < post_emit_state
    ):
        raise Phase399MapPerfError(
            "地图打开分段raw必须在emit后任何状态／性能断言前输出"
        )
    real_click_start = capture_source.find(
        "func _diagnostic_real_button_click("
    )
    real_click_end = capture_source.find(
        "\n\nfunc _diagnostic_button_ready(",
        real_click_start,
    )
    if (
        real_click_start < 0
        or real_click_end <= real_click_start
        or "physics_frame" in capture_source[real_click_start:real_click_end]
    ):
        raise Phase399MapPerfError(
            "Phase399地图渲染诊断press完整帧后不得再插physics_frame"
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


def _parse_fields_strict(line: str) -> dict[str, str]:
    pairs = [
        (match.group(1), match.group(2))
        for match in re.finditer(
            r"\b([A-Za-z][A-Za-z0-9_]*)=([^\s]+)",
            line,
        )
    ]
    fields: dict[str, str] = {}
    for key, value in pairs:
        if key in fields:
            raise Phase399MapPerfError(
                f"Phase399地图渲染诊断标记包含重复字段{key}"
            )
        fields[key] = value
    return fields


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
        "backend_started=false profile_save=false foreground_start=true"
    )
    if required_start not in text:
        raise Phase399MapPerfError("Phase399地图性能日志缺少真实Main隔离起点")

    state_samples: dict[str, list[dict[str, float]]] = {
        state: [] for state in EXPECTED_STATES
    }
    state_events: list[str] = []
    active_state = ""
    end_line = ""
    handler_line = ""
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
        if line.startswith(HANDLER_MARKER + " "):
            if handler_line:
                raise Phase399MapPerfError(
                    "Phase399地图性能日志出现重复输入处理标记"
                )
            handler_line = line
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
    if not handler_line:
        raise Phase399MapPerfError("Phase399地图性能日志缺少输入处理标记")

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
        "foreground_start",
        "foreground_end",
        "menu_fps60",
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
    menu_fps60_checks = _require_int(fields, "menu_fps60_checks")
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
        or menu_fps60_checks != EXPECTED_MENU_60_CHECKS
    ):
        raise Phase399MapPerfError(
            "Phase399真实移动／面板压力／跨帧左键结束事实不完整"
        )

    stats = {
        state: _state_stats(state_samples[state]) for state in EXPECTED_STATES
    }
    handler_fields = _parse_fields(handler_line)
    handler_panel_clicks = _require_int(handler_fields, "panel_clicks")
    press_dispatch_samples = _require_int(
        handler_fields,
        "press_dispatch_samples",
    )
    handler_refresh_samples = _require_int(
        handler_fields,
        "handler_refresh_samples",
    )
    press_dispatch_p95_usec = _require_int(
        handler_fields,
        "press_dispatch_p95_usec",
    )
    press_dispatch_max_usec = _require_int(
        handler_fields,
        "press_dispatch_max_usec",
    )
    handler_refresh_p95_usec = _require_int(
        handler_fields,
        "handler_refresh_p95_usec",
    )
    handler_refresh_max_usec = _require_int(
        handler_fields,
        "handler_refresh_max_usec",
    )
    end_handler_values = {
        "press_dispatch_p95_usec": press_dispatch_p95_usec,
        "press_dispatch_max_usec": press_dispatch_max_usec,
        "handler_refresh_p95_usec": handler_refresh_p95_usec,
        "handler_refresh_max_usec": handler_refresh_max_usec,
    }
    if any(
        _require_int(fields, key) != expected
        for key, expected in end_handler_values.items()
    ):
        raise Phase399MapPerfError(
            "Phase399地图输入处理标记与最终状态摘要不一致"
        )
    if (
        handler_panel_clicks != EXPECTED_PANEL_CLICKS
        or press_dispatch_samples != EXPECTED_PANEL_CLICKS
        or handler_refresh_samples != EXPECTED_PANEL_CLICKS
        or min(
            press_dispatch_p95_usec,
            press_dispatch_max_usec,
            handler_refresh_p95_usec,
            handler_refresh_max_usec,
        ) < 0
        or press_dispatch_p95_usec > press_dispatch_max_usec
        or handler_refresh_p95_usec > handler_refresh_max_usec
    ):
        raise Phase399MapPerfError(
            "Phase399地图压力输入处理样本数量或p95/max关系无效"
        )
    gates: list[dict[str, Any]] = []
    for state in EXPECTED_STATES:
        state_stats = stats[state]
        process_stats = state_stats["processTotalMs"]
        sample_metric = (
            "stable_sample_count"
            if state == "panel_stress"
            else "sample_count"
        )
        sample_actual = int(
            state_stats[
                "stableSampleCount"
                if state == "panel_stress"
                else "sampleCount"
            ]
        )
        sample_limit = (
            MIN_STABLE_STATE_SAMPLES
            if state == "panel_stress"
            else MIN_STATE_SAMPLES
        )
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
                sample_metric,
                sample_actual,
                ">=",
                sample_limit,
                sample_actual >= sample_limit,
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
        if state == "panel_stress":
            minimum_fps = float(state_stats["fps"]["minimum"])
            gates.append(
                {
                    "state": state,
                    "metric": "stable_fps_minimum",
                    "actual": minimum_fps,
                    "operator": ">=",
                    "limit": MIN_PANEL_STABLE_FPS,
                    "passed": minimum_fps >= MIN_PANEL_STABLE_FPS,
                }
            )
    handler_metrics = (
        ("press_dispatch_p95_usec", press_dispatch_p95_usec),
        ("press_dispatch_max_usec", press_dispatch_max_usec),
        ("handler_refresh_p95_usec", handler_refresh_p95_usec),
        ("handler_refresh_max_usec", handler_refresh_max_usec),
    )
    for metric, actual in handler_metrics:
        gates.append(
            {
                "state": "panel_handler",
                "metric": metric,
                "actual": actual,
                "operator": "<",
                "limit": MAX_PANEL_DISPATCH_USEC,
                "passed": actual < MAX_PANEL_DISPATCH_USEC,
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
        "runtimeContract": {
            "foregroundStart": True,
            "foregroundEnd": True,
            "menuFps60": True,
            "menuFps60Checks": menu_fps60_checks,
        },
        "panelHandler": {
            "pressDispatchSamples": press_dispatch_samples,
            "pressDispatchP95Microseconds": press_dispatch_p95_usec,
            "pressDispatchMaxMicroseconds": press_dispatch_max_usec,
            "handlerRefreshSamples": handler_refresh_samples,
            "handlerRefreshP95Microseconds": handler_refresh_p95_usec,
            "handlerRefreshMaxMicroseconds": handler_refresh_max_usec,
        },
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


def _diagnostic_float(fields: dict[str, str], key: str) -> float:
    try:
        value = float(fields[key])
    except (KeyError, ValueError) as error:
        raise Phase399MapPerfError(
            f"Phase399地图渲染诊断缺少数值字段{key}"
        ) from error
    if not math.isfinite(value):
        raise Phase399MapPerfError(
            f"Phase399地图渲染诊断字段{key}不是有限数"
        )
    return value


def _diagnostic_int(fields: dict[str, str], key: str) -> int:
    try:
        return int(fields[key])
    except (KeyError, ValueError) as error:
        raise Phase399MapPerfError(
            f"Phase399地图渲染诊断缺少整数字段{key}"
        ) from error


def _validate_diagnostic_log(path: Path) -> dict[str, Any]:
    text = path.read_text(encoding="utf-8")
    if any(marker in text for marker in FAILURE_MARKERS):
        raise Phase399MapPerfError("Godot Phase399地图渲染诊断报告失败")
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
                f"Godot Phase399地图渲染诊断日志包含禁止内容：{forbidden}"
            )
    if "Metal 4.0 - Forward Mobile" not in text:
        raise Phase399MapPerfError(
            "Phase399地图渲染诊断没有使用真实Metal Forward Mobile"
        )

    marker_prefixes = (
        DIAGNOSTIC_FOCUS_SETUP_MARKER,
        DIAGNOSTIC_START_MARKER,
        DIAGNOSTIC_STATE_MARKER,
        DIAGNOSTIC_OPEN_TIMING_MARKER,
        DIAGNOSTIC_SIGNAL_MARKER,
        DIAGNOSTIC_SETUP_MARKER,
        DIAGNOSTIC_INPUT_MARKER,
        DIAGNOSTIC_END_MARKER,
    )
    records: list[tuple[str, dict[str, str], str]] = []
    for raw_line in text.splitlines():
        diagnostic_marker_count = raw_line.count(
            "PHASE399_MAP_DIAGNOSTIC_"
        )
        if diagnostic_marker_count and (
            not raw_line.startswith("PHASE399_MAP_DIAGNOSTIC_")
            or diagnostic_marker_count != 1
        ):
            raise Phase399MapPerfError(
                "地图渲染诊断标记必须从列0开始且每行只能出现一次"
            )
        line = raw_line.strip()
        marker = next(
            (
                prefix
                for prefix in marker_prefixes
                if line.startswith(prefix + " ")
            ),
            "",
        )
        if line.startswith("PHASE399_MAP_DIAGNOSTIC_") and not marker:
            raise Phase399MapPerfError(
                "地图渲染诊断日志包含未知诊断标记"
            )
        if marker:
            records.append((marker, _parse_fields_strict(line), line))

    expected_markers = (
        (DIAGNOSTIC_FOCUS_SETUP_MARKER, ""),
        (DIAGNOSTIC_START_MARKER, ""),
        (DIAGNOSTIC_STATE_MARKER, "world_active_static"),
        (DIAGNOSTIC_STATE_MARKER, "fresh_local_static"),
        (DIAGNOSTIC_STATE_MARKER, "world_atlas_static"),
        *tuple(
            (DIAGNOSTIC_OPEN_TIMING_MARKER, "open_local")
            for _index in range(DIAGNOSTIC_SIGNAL_CYCLES)
        ),
        (DIAGNOSTIC_SIGNAL_MARKER, "open_local"),
        (DIAGNOSTIC_SIGNAL_MARKER, "world_tab"),
        (DIAGNOSTIC_SIGNAL_MARKER, "select_region"),
        (DIAGNOSTIC_SIGNAL_MARKER, "local_tab"),
        (DIAGNOSTIC_SIGNAL_MARKER, "close_panel"),
        (DIAGNOSTIC_SETUP_MARKER, "reset_region"),
        (DIAGNOSTIC_STATE_MARKER, "panel_stress"),
        (DIAGNOSTIC_INPUT_MARKER, ""),
        (DIAGNOSTIC_STATE_MARKER, "post_stress_local_static"),
        (DIAGNOSTIC_END_MARKER, ""),
    )
    observed_markers = tuple(
        (
            marker,
            fields.get(
                "state" if marker == DIAGNOSTIC_STATE_MARKER else "action",
                "",
            )
            if marker in (
                DIAGNOSTIC_STATE_MARKER,
                DIAGNOSTIC_OPEN_TIMING_MARKER,
                DIAGNOSTIC_SIGNAL_MARKER,
                DIAGNOSTIC_SETUP_MARKER,
            )
            else "",
        )
        for marker, fields, _line in records
    )
    if observed_markers != expected_markers:
        raise Phase399MapPerfError(
            "地图渲染诊断标记必须全局唯一并按FOCUS_SETUP→START→五态／signal／setup／input→END输出"
        )

    focus_setup_fields = records[0][1]
    if focus_setup_fields.get("status") != "observed":
        raise Phase399MapPerfError(
            "地图渲染诊断autofill guard必须标记observed"
        )
    _require_bool(focus_setup_fields, "autofill_guard", True)
    focused_text_before = focus_setup_fields.get(
        "focused_text_before", ""
    ).lower()
    if focused_text_before not in ("true", "false"):
        raise Phase399MapPerfError(
            "地图渲染诊断autofill guard缺少严格文本焦点起点"
        )
    _require_bool(focus_setup_fields, "focused_text_after", False)
    _require_bool(focus_setup_fields, "foreground", True)
    focus_class_before = focus_setup_fields.get("focus_class_before", "")
    focus_path_before = focus_setup_fields.get("focus_path_before", "")
    focus_class_after = focus_setup_fields.get("focus_class_after", "")
    focus_target = focus_setup_fields.get("focus_target", "")
    if (
        not focus_class_before
        or not focus_path_before
        or focus_class_after != "Button"
        or not focus_target.startswith("/root/")
        or not focus_target.endswith("/WorldHudEntryMap")
        or (
            focused_text_before == "true"
            and focus_class_before not in ("LineEdit", "TextEdit")
        )
        or (
            focused_text_before == "false"
            and focus_class_before in ("LineEdit", "TextEdit")
        )
    ):
        raise Phase399MapPerfError(
            "地图渲染诊断autofill guard没有从真实起点稳定落到非文本世界按钮"
        )

    start_fields = records[1][1]
    if (
        start_fields.get("scene") != "Main.tscn"
        or start_fields.get("entry") != "MainSceneFlag"
        or start_fields.get("viewport") != "1280x720"
        or start_fields.get("renderer") != "Metal"
        or start_fields.get("profile") != "fresh"
        or start_fields.get("status") != "observing"
        or _diagnostic_int(start_fields, "states") != len(DIAGNOSTIC_STATES)
        or _diagnostic_int(start_fields, "warmup_frames")
        != DIAGNOSTIC_WARMUP_FRAMES
        or _diagnostic_int(start_fields, "sample_frames")
        != DIAGNOSTIC_SAMPLE_FRAMES
    ):
        raise Phase399MapPerfError(
            "地图渲染诊断START不是1280×720真实Main五态观测"
        )
    _require_bool(start_fields, "backend_started", False)
    _require_bool(start_fields, "profile_save", False)

    state_records = [
        (fields, line)
        for marker, fields, line in records
        if marker == DIAGNOSTIC_STATE_MARKER
    ]
    states: dict[str, dict[str, Any]] = {}
    for fields, _line in state_records:
        state_id = fields["state"]
        if fields.get("status") != "observed":
            raise Phase399MapPerfError(
                f"地图渲染诊断{state_id}不得冒充passed"
            )
        _require_bool(fields, "foreground_start", True)
        _require_bool(fields, "foreground_end", True)
        _require_bool(fields, "subviewport_present", True)
        warmup_frames = _diagnostic_int(fields, "warmup_frames")
        interval_samples = _diagnostic_int(fields, "interval_samples")
        target60_checks = _diagnostic_int(fields, "target60_checks")
        main_process_samples = _diagnostic_int(fields, "main_process_samples")
        if (
            warmup_frames != DIAGNOSTIC_WARMUP_FRAMES
            or interval_samples != DIAGNOSTIC_SAMPLE_FRAMES
            or target60_checks != DIAGNOSTIC_TARGET_60_CHECKS
            or main_process_samples != DIAGNOSTIC_SAMPLE_FRAMES
            or fields.get("subviewport_size") != "900x520"
            or _diagnostic_int(fields, "subviewport_update_mode") < 0
        ):
            raise Phase399MapPerfError(
                f"地图渲染诊断{state_id}没有精确60+300帧或正式SubViewport"
            )
        interval_median = _diagnostic_float(fields, "interval_median_usec")
        interval_p95 = _diagnostic_float(fields, "interval_p95_usec")
        interval_max = _diagnostic_float(fields, "interval_max_usec")
        effective_fps = _diagnostic_float(fields, "effective_fps")
        main_process_p95 = _diagnostic_float(fields, "main_process_p95_usec")
        main_process_max = _diagnostic_float(fields, "main_process_max_usec")
        draw_median = _diagnostic_float(fields, "draw_calls_median")
        draw_p95 = _diagnostic_float(fields, "draw_calls_p95")
        objects_median = _diagnostic_float(fields, "render_objects_median")
        objects_p95 = _diagnostic_float(fields, "render_objects_p95")
        primitives_median = _diagnostic_float(
            fields,
            "render_primitives_median",
        )
        primitives_p95 = _diagnostic_float(
            fields,
            "render_primitives_p95",
        )
        node_start = _diagnostic_int(fields, "node_start")
        node_end = _diagnostic_int(fields, "node_end")
        orphan_start = _diagnostic_int(fields, "orphan_start")
        orphan_end = _diagnostic_int(fields, "orphan_end")
        if (
            interval_median <= 0.0
            or interval_median > interval_p95
            or interval_p95 > interval_max
            or effective_fps <= 0.0
            or main_process_p95 < 0.0
            or main_process_p95 > main_process_max
            or min(
                draw_median,
                draw_p95,
                objects_median,
                objects_p95,
                primitives_median,
                primitives_p95,
            ) < 0.0
            or draw_median > draw_p95
            or objects_median > objects_p95
            or primitives_median > primitives_p95
            or min(node_start, node_end, orphan_start, orphan_end) < 0
        ):
            raise Phase399MapPerfError(
                f"地图渲染诊断{state_id}帧／Main／render／node观测关系无效"
            )
        expected_fps = 1_000_000.0 / interval_median
        fps_tolerance = max(0.05, expected_fps * 0.005)
        if abs(effective_fps - expected_fps) > fps_tolerance:
            raise Phase399MapPerfError(
                f"地图渲染诊断{state_id}有效FPS与帧间隔中位数不自洽"
            )
        states[state_id] = {
            "status": "observed",
            "foregroundStart": True,
            "foregroundEnd": True,
            "warmupFrames": warmup_frames,
            "intervalSamples": interval_samples,
            "target60Checks": target60_checks,
            "frameIntervalMicroseconds": {
                "median": interval_median,
                "p95": interval_p95,
                "maximum": interval_max,
            },
            "effectiveFps": effective_fps,
            "mainProcessMicroseconds": {
                "samples": main_process_samples,
                "p95": main_process_p95,
                "maximum": main_process_max,
            },
            "render": {
                "drawCallsMedian": draw_median,
                "drawCallsP95": draw_p95,
                "objectsMedian": objects_median,
                "objectsP95": objects_p95,
                "primitivesMedian": primitives_median,
                "primitivesP95": primitives_p95,
            },
            "nodes": {
                "start": node_start,
                "end": node_end,
                "orphanStart": orphan_start,
                "orphanEnd": orphan_end,
            },
            "subViewport": {
                "present": True,
                "size": fields["subviewport_size"],
                "updateMode": _diagnostic_int(
                    fields,
                    "subviewport_update_mode",
                ),
            },
        }

    input_fields = next(
        fields
        for marker, fields, _line in records
        if marker == DIAGNOSTIC_INPUT_MARKER
    )
    if input_fields.get("status") != "observed":
        raise Phase399MapPerfError("真实输入延迟只能标记observed")
    input_samples = _diagnostic_int(input_fields, "samples")
    input_observed = _diagnostic_int(input_fields, "observed")
    input_cross_frame = _diagnostic_int(input_fields, "cross_frame")
    latency_p95_usec = _diagnostic_int(input_fields, "latency_p95_usec")
    latency_max_usec = _diagnostic_int(input_fields, "latency_max_usec")
    latency_p95_frames = _diagnostic_int(input_fields, "latency_p95_frames")
    latency_max_frames = _diagnostic_int(input_fields, "latency_max_frames")
    if (
        input_samples != EXPECTED_PANEL_CLICKS
        or input_observed != EXPECTED_PANEL_CLICKS
        or input_cross_frame != EXPECTED_PANEL_CLICKS
        or min(
            latency_p95_usec,
            latency_max_usec,
            latency_p95_frames,
            latency_max_frames,
        ) < 0
        or latency_p95_usec > latency_max_usec
        or latency_p95_frames > latency_max_frames
        or latency_max_frames > 3
    ):
        raise Phase399MapPerfError(
            "地图渲染诊断release→首状态观测样本不完整"
        )

    open_timing_records = [
        fields
        for marker, fields, _line in records
        if marker == DIAGNOSTIC_OPEN_TIMING_MARKER
    ]
    open_timing: list[dict[str, Any]] = []
    open_signal_totals: list[int] = []
    if len(open_timing_records) != DIAGNOSTIC_SIGNAL_CYCLES:
        raise Phase399MapPerfError(
            "地图渲染诊断必须包含精确12条地图打开raw分段"
        )
    for expected_cycle, fields in enumerate(open_timing_records):
        if (
            fields.get("action") != "open_local"
            or fields.get("status") != "observed"
            or fields.get("token") != f"open_local:{expected_cycle}"
            or _diagnostic_int(fields, "cycle") != expected_cycle
        ):
            raise Phase399MapPerfError(
                "地图打开raw分段必须唯一、连续且按cycle 0..11输出"
            )
        _require_bool(fields, "complete", True)
        _require_bool(fields, "default_off", True)
        _require_bool(fields, "consume_once", True)
        _require_bool(fields, "prepared_visual", True)
        _require_bool(fields, "fallback_called", False)
        _require_bool(fields, "lightweight_layout", True)
        fallback_counter_delta = _diagnostic_int(
            fields,
            "fallback_counter_delta",
        )
        layout_fallback_delta = _diagnostic_int(
            fields,
            "layout_fallback_delta",
        )
        usec = {
            key: _diagnostic_int(fields, key)
            for key in DIAGNOSTIC_OPEN_TIMING_USEC_FIELDS
        }
        if min(usec.values()) < 0:
            raise Phase399MapPerfError(
                "地图打开raw分段包含负数或缺失的微秒字段"
            )
        if (
            usec["fallback_usec"] != 0
            or fallback_counter_delta != 0
            or layout_fallback_delta != 0
        ):
            raise Phase399MapPerfError(
                "正式prepared地图raw分段必须使用轻量布局且不得构建fallback"
            )
        apply_children = sum(
            usec[key]
            for key in (
                "apply_state_copy_usec",
                "apply_header_usec",
                "apply_sidebar_usec",
                "apply_local_map_usec",
                "apply_world_regions_usec",
                "apply_world_detail_usec",
                "apply_show_mode_usec",
                "apply_marker_schedule_usec",
                "apply_residual_usec",
            )
        )
        refresh_children = sum(
            usec[key]
            for key in (
                "view_state_usec",
                "bounds_usec",
                "prepared_predicate_usec",
                "fallback_usec",
                "panel_apply_total_usec",
                "marker_publish_usec",
                "refresh_residual_usec",
            )
        )
        open_children = sum(
            usec[key]
            for key in (
                "hang_usec",
                "dialog_encounter_usec",
                "other_panels_usec",
                "show_reset_usec",
                "refresh_total_usec",
                "layout_usec",
                "deferred_layout_schedule_usec",
                "tutorial_usec",
                "open_residual_usec",
            )
        )
        if (
            apply_children != usec["panel_apply_total_usec"]
            or refresh_children != usec["refresh_total_usec"]
            or open_children != usec["open_total_usec"]
            or usec["open_total_usec"]
            + usec["signal_residual_usec"]
            != usec["signal_total_usec"]
            or usec["panel_apply_total_usec"]
            > usec["refresh_total_usec"]
            or usec["refresh_total_usec"] > usec["open_total_usec"]
            or usec["open_total_usec"] > usec["signal_total_usec"]
            or usec["signal_total_usec"] >= MAX_PANEL_DISPATCH_USEC
        ):
            raise Phase399MapPerfError(
                "地图打开raw分段ownership恒等式、residual或8ms信号门无效"
            )
        open_signal_totals.append(usec["signal_total_usec"])
        open_timing.append(
            {
                "action": "open_local",
                "cycle": expected_cycle,
                "token": fields["token"],
                "status": "observed",
                "complete": True,
                "defaultOff": True,
                "consumeOnce": True,
                "preparedVisual": True,
                "fallbackCalled": False,
                "fallbackCounterDelta": fallback_counter_delta,
                "lightweightLayout": True,
                "layoutFallbackDelta": layout_fallback_delta,
                "microseconds": usec,
            }
        )

    signal_records = [
        fields
        for marker, fields, _line in records
        if marker == DIAGNOSTIC_SIGNAL_MARKER
    ]
    signal_cpu: dict[str, dict[str, Any]] = {}
    for fields in signal_records:
        action_id = fields["action"]
        if fields.get("status") != "observed":
            raise Phase399MapPerfError(
                f"地图渲染诊断signal {action_id}不得冒充passed"
            )
        _require_bool(fields, "synchronous", True)
        _require_bool(fields, "immediate_state", True)
        samples = _diagnostic_int(fields, "samples")
        p95_usec = _diagnostic_int(fields, "p95_usec")
        max_usec = _diagnostic_int(fields, "max_usec")
        if (
            samples != DIAGNOSTIC_SIGNAL_CYCLES
            or p95_usec < 0
            or p95_usec > max_usec
            or p95_usec >= MAX_PANEL_DISPATCH_USEC
            or max_usec >= MAX_PANEL_DISPATCH_USEC
        ):
            raise Phase399MapPerfError(
                f"地图渲染诊断signal {action_id}样本不完整或同步CPU达到8ms"
            )
        signal_cpu[action_id] = {
            "samples": samples,
            "synchronous": True,
            "immediateState": True,
            "p95Microseconds": p95_usec,
            "maxMicroseconds": max_usec,
        }
    open_signal_aggregate = signal_cpu.get("open_local", {})
    if (
        int(_percentile(open_signal_totals, 0.95))
        != int(open_signal_aggregate.get("p95Microseconds", -1))
        or max(open_signal_totals, default=-1)
        != int(open_signal_aggregate.get("maxMicroseconds", -1))
    ):
        raise Phase399MapPerfError(
            "地图打开12条raw signal_total与open_local汇总不一致"
        )

    setup_fields = next(
        fields
        for marker, fields, _line in records
        if marker == DIAGNOSTIC_SETUP_MARKER
    )
    if (
        setup_fields.get("action") != "reset_region"
        or setup_fields.get("status") != "observed"
        or _diagnostic_int(setup_fields, "samples")
        != EXPECTED_STRESS_CYCLES * 2
    ):
        raise Phase399MapPerfError(
            "地图渲染诊断setup必须是24次独立区域复位观测"
        )
    _require_bool(setup_fields, "setup_only", True)
    _require_bool(setup_fields, "synchronous", True)
    _require_bool(setup_fields, "immediate_state", True)

    end_fields = records[-1][1]
    if (
        end_fields.get("status") != "observed"
        or end_fields.get("release_decision") != "diagnostic_only"
        or end_fields.get("scene") != "Main.tscn"
        or end_fields.get("entry") != "MainSceneFlag"
        or end_fields.get("viewport") != "1280x720"
    ):
        raise Phase399MapPerfError(
            "地图渲染诊断END必须明确observed且不能冒充发布PASS"
        )
    _require_bool(end_fields, "complete", True)
    if (
        _diagnostic_int(end_fields, "states") != len(DIAGNOSTIC_STATES)
        or _diagnostic_int(end_fields, "static_states") != 4
        or _diagnostic_int(end_fields, "stress_cycles")
        != EXPECTED_STRESS_CYCLES
        or _diagnostic_int(end_fields, "real_click_samples")
        != EXPECTED_PANEL_CLICKS
        or _diagnostic_int(end_fields, "signal_samples")
        != EXPECTED_PANEL_CLICKS
        or _diagnostic_int(end_fields, "open_timing_samples")
        != DIAGNOSTIC_SIGNAL_CYCLES
        or min(
            _diagnostic_int(end_fields, "node_start"),
            _diagnostic_int(end_fields, "node_end"),
            _diagnostic_int(end_fields, "orphan_start"),
            _diagnostic_int(end_fields, "orphan_end"),
        ) < 0
    ):
        raise Phase399MapPerfError(
            "地图渲染诊断END五态／输入／node事实不完整"
        )
    return {
        "status": "observed",
        "complete": True,
        "releaseDecision": "diagnostic_only",
        "focusSetup": {
            "status": "observed",
            "autofillGuard": True,
            "focusedTextBefore": focused_text_before == "true",
            "focusedTextAfter": False,
            "focusClassBefore": focus_class_before,
            "focusPathBefore": focus_path_before,
            "focusClassAfter": focus_class_after,
            "focusTarget": focus_target,
            "foreground": True,
        },
        "states": states,
        "realInputLatency": {
            "samples": input_samples,
            "observed": input_observed,
            "crossFrame": input_cross_frame,
            "p95Microseconds": latency_p95_usec,
            "maxMicroseconds": latency_max_usec,
            "p95Frames": latency_p95_frames,
            "maxFrames": latency_max_frames,
        },
        "signalCpu": signal_cpu,
        "openTiming": open_timing,
        "setup": {
            "action": "reset_region",
            "status": "observed",
            "setupOnly": True,
            "samples": EXPECTED_STRESS_CYCLES * 2,
            "synchronous": True,
            "immediateState": True,
        },
        "globalNodes": {
            "start": _diagnostic_int(end_fields, "node_start"),
            "end": _diagnostic_int(end_fields, "node_end"),
            "orphanStart": _diagnostic_int(end_fields, "orphan_start"),
            "orphanEnd": _diagnostic_int(end_fields, "orphan_end"),
        },
        "endLine": records[-1][2],
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
            "runtimeContract": validation["runtimeContract"],
            "panelHandler": validation["panelHandler"],
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
            "runtimeContract": validation["runtimeContract"],
            "panelHandler": validation["panelHandler"],
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


def _run_diagnostic(
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
        raise Phase399MapPerfError(f"拒绝覆盖既有诊断证据目录：{run_dir}")
    run_dir.mkdir(parents=True)
    log_path = run_dir / "godot-diagnostic.log"
    started_at = _utc_now()
    command: list[str] = []
    try:
        _require_diagnostic_wiring()
        with tempfile.TemporaryDirectory(
            prefix="beastbound-phase399-map-diagnostic-"
        ) as user_data_raw:
            command = _build_diagnostic_command(
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
                f"Godot Phase399地图渲染诊断进程退出码为{completed.returncode}"
            )
        validation = _validate_diagnostic_log(log_path)
        summary = {
            "schemaVersion": REPORT_SCHEMA_VERSION,
            "reportType": DIAGNOSTIC_REPORT_TYPE,
            "status": "observed",
            "complete": True,
            "releaseDecision": "diagnostic_only",
            "ownerReviewStatus": "pending",
            "startedAtUtc": started_at.isoformat().replace("+00:00", "Z"),
            "completedAtUtc": _utc_now().isoformat().replace("+00:00", "Z"),
            "scene": MAIN_SCENE,
            "entryMode": "MainSceneFlag",
            "viewport": {"width": 1280, "height": 720},
            "renderer": "Metal 4.0 - Forward Mobile",
            "command": command,
            "states": validation["states"],
            "realInputLatency": validation["realInputLatency"],
            "signalCpu": validation["signalCpu"],
            "setup": validation["setup"],
            "globalNodes": validation["globalNodes"],
            "statementBoundary": (
                "QA-only observed frame-pacing diagnostic. Low effective FPS "
                "is preserved as evidence and never converted into a release "
                "pass; the separate Map60 release gate remains unchanged."
            ),
            "isolation": {
                "freshUserData": True,
                "backendStarted": False,
                "profileSaveEnabled": False,
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
            "status": "observed",
            "complete": True,
            "releaseDecision": "diagnostic_only",
            "runDir": str(run_dir),
            "summary": str(summary_path),
            "log": str(log_path),
            "manifest": str(manifest_path),
            "manifestSha256": _sha256(manifest_path),
            "states": validation["states"],
            "realInputLatency": validation["realInputLatency"],
            "signalCpu": validation["signalCpu"],
            "setup": validation["setup"],
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
                    "reportType": DIAGNOSTIC_REPORT_TYPE,
                    "status": "failed",
                    "complete": False,
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
    parser.add_argument("--output-root")
    parser.add_argument("--run-id", default=_new_run_id())
    parser.add_argument("--timeout-seconds", type=float, default=120.0)
    parser.add_argument(
        "--diagnostic",
        action="store_true",
        help=(
            "Run the QA-only five-state render diagnostic. The result is "
            "observed/complete and never a Map60 release pass."
        ),
    )
    args = parser.parse_args(argv)
    default_output_root = (
        DEFAULT_DIAGNOSTIC_OUTPUT_ROOT
        if args.diagnostic
        else DEFAULT_OUTPUT_ROOT
    )
    output_root = Path(args.output_root or str(default_output_root))
    if not output_root.is_absolute():
        output_root = REPO_ROOT / output_root
    try:
        runner = _run_diagnostic if args.diagnostic else _run
        result = runner(
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
