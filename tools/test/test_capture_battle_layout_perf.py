#!/usr/bin/env python3
"""Focused static tests for the Phase403 battle layout perf runner."""

from __future__ import annotations

import argparse
import importlib.util
import inspect
import json
import tempfile
import unittest
from unittest import mock
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
TOOL_PATH = REPO_ROOT / "tools" / "capture_battle_layout_perf.py"
SPEC = importlib.util.spec_from_file_location(
    "capture_battle_layout_perf",
    TOOL_PATH,
)
assert SPEC is not None and SPEC.loader is not None
TOOL = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(TOOL)


def _attack_state(
    stage: str,
    mode: str,
    *,
    point_classification: bool = False,
) -> dict:
    state = {
        "stage": stage,
        "active": True,
        "owner": "player",
        "mode": mode,
        "selected": "",
        "pending": {},
        "phase": "command",
        "locked": False,
        "actionTimer": 0.0,
        "eventQueueCount": 0,
        "enemyPending": False,
        "endPending": False,
        "livingEnemyId": "enemy_front_4",
        "livingEnemyCount": 10,
        "buttonPath": "/root/Main/HUD/BattleCommandAwakenedView/Attack",
        "buttonInstanceId": 40301,
        "visibleAttackInstanceId": 40301,
        "viewAttackInstanceId": 40301,
        "hostAttackInstanceId": 40301,
        "buttonIdentityExact": True,
        "buttonGlobalRect": [1186.0, 476.0, 68.0, 72.0],
        "buttonDisabled": False,
        "buttonVisible": True,
        "buttonInsideTree": True,
        "viewportPoint": [1220.0, 512.0],
        "screenTransform": [1.0, 0.0, 0.0, 1.0, 0.0, 0.0],
        "inputPosition": [1220.0, 512.0],
    }
    if point_classification:
        state["uiPoint"] = False
        state["battlePanelPoint"] = True
    return state


def _attack_route_stage(stage: str, input_left_pressed: bool) -> dict:
    process_frames = {
        "press_sync": 100,
        "pre_release": 102,
        "release_sync": 102,
        "release_process": 102,
        "release_post_draw": 102,
        "release_next_loop_post_draw": 103,
    }
    final_hover_lost = stage == "release_next_loop_post_draw"
    if stage == "press_sync" and not input_left_pressed:
        counts = (0, 0, 0, 0, 0, 0, 0)
    elif input_left_pressed:
        counts = (1, 0, 0, 0, 1, 1, 0)
    else:
        counts = (1, 1, 1, 1, 2, 1, 1)
    return {
        "stage": stage,
        "processFrame": process_frames[stage],
        "buttonPath": "/root/Main/HUD/BattleCommandAwakenedView/Attack",
        "buttonInstanceId": 40301,
        "buttonParentPath": "/root/Main/HUD/BattleCommandAwakenedView",
        "buttonParentInstanceId": 40300,
        "buttonGlobalRect": [1186.0, 476.0, 68.0, 72.0],
        "buttonVisible": True,
        "buttonDisabled": False,
        "buttonMouseFilter": 0,
        "buttonActionMode": 1,
        "buttonKeepPressedOutside": False,
        "buttonPressed": input_left_pressed,
        "buttonIsHovered": not final_hover_lost,
        "viewportHoveredPath": (
            ""
            if final_hover_lost
            else "/root/Main/HUD/BattleCommandAwakenedView/Attack/Label"
        ),
        "viewportHoveredInstanceId": 0 if final_hover_lost else 40302,
        "viewportHoveredMatchesButton": not final_hover_lost,
        "inputLeftPressed": input_left_pressed,
        "downCount": counts[0],
        "upCount": counts[1],
        "pressedCount": counts[2],
        "viewAttackCount": counts[3],
        "guiLeftButtonEventCount": counts[4],
        "guiLeftButtonPressCount": counts[5],
        "guiLeftButtonReleaseCount": counts[6],
    }


def _attack_route_stage_json(
    stage: str,
    input_left_pressed: bool,
    **updates: object,
) -> str:
    payload = _attack_route_stage(stage, input_left_pressed)
    payload.update(updates)
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))


def _attack_marker_lines(
    *,
    same_loop_delivered: bool = False,
) -> tuple[str, str]:
    before = _attack_state("before", "enemy", point_classification=True)
    before.update(
        {
            "productButtonConnectionCount": 1,
            "productButtonTotalConnectionCount": 1,
            "productViewConnectionCount": 1,
            "productViewTotalConnectionCount": 1,
            "productButtonConnectionFlags": [0],
            "productViewConnectionFlags": [0],
            "productConnectionsNonDeferred": True,
            "productChainExactBefore": True,
            "viewObserverMode": "synchronous_after_preexisting_host",
            "spiesInstalled": True,
        }
    )
    after = _attack_state(
        "deferred",
        "player_attack_target",
        point_classification=True,
    )
    same_loop_pressed = not same_loop_delivered
    same_loop_event_count = 2 if same_loop_delivered else 1
    same_loop_release_count = 1 if same_loop_delivered else 0
    after.update(
        {
            "classification": "ok",
            "cleanupOk": True,
            "productButtonConnectionCount": 1,
            "productButtonTotalConnectionCount": 1,
            "productViewConnectionCount": 1,
            "productViewTotalConnectionCount": 1,
            "productButtonConnectionFlags": [0],
            "productViewConnectionFlags": [0],
            "productConnectionsNonDeferred": True,
            "productChainExactBefore": True,
            "productChainExactAfterCleanup": True,
            "viewObserverMode": "synchronous_after_preexisting_host",
            "spiesInstalled": True,
            "downCount": 1,
            "upCount": 1,
            "pressedCount": 1,
            "viewAttackCount": 1,
            "postDrawBoundaryReached": True,
            "nextLoopPostDrawBoundaryReached": True,
            "postDrawStateCaptured": True,
            "sameLoopDelivered": same_loop_delivered,
            "nextLoopDelivered": True,
            "sameLoopProcessFrame": 102,
            "nextLoopProcessFrame": 103,
            "sameLoopGuiLeftButtonEventCount": same_loop_event_count,
            "sameLoopGuiLeftButtonPressCount": 1,
            "sameLoopGuiLeftButtonReleaseCount": same_loop_release_count,
            "nextLoopGuiLeftButtonEventCount": 2,
            "nextLoopGuiLeftButtonPressCount": 1,
            "nextLoopGuiLeftButtonReleaseCount": 1,
            "guiLeftButtonEvents": [
                {
                    "pressed": True,
                    "buttonIndex": 1,
                    "buttonMask": 1,
                    "position": [34.0, 36.0],
                    "globalPosition": [1220.0, 512.0],
                },
                {
                    "pressed": False,
                    "buttonIndex": 1,
                    "buttonMask": 0,
                    "position": [34.0, 36.0],
                    "globalPosition": [1220.0, 512.0],
                },
            ],
            "mouseEnteredCount": 1,
            "mouseExitedCount": 1,
            "routeStages": [
                _attack_route_stage("press_sync", False),
                _attack_route_stage("pre_release", True),
                _attack_route_stage("release_sync", same_loop_pressed),
                _attack_route_stage("release_process", same_loop_pressed),
                _attack_route_stage("release_post_draw", same_loop_pressed),
                _attack_route_stage("release_next_loop_post_draw", False),
            ],
            "observerSignalsDisconnected": True,
            "releaseRoutingClassification": "release_routed_and_button_up",
            "unexpectedViewCommand": "",
            "downState": _attack_state("down", "enemy"),
            "releaseState": _attack_state("release", "enemy"),
            "pressedState": _attack_state(
                "pressed",
                "player_attack_target",
            ),
            "viewState": _attack_state("view", "player_attack_target"),
            "targetPath": before["buttonPath"],
            "targetInstanceId": before["buttonInstanceId"],
            "hoveredPath": before["buttonPath"] + "/Label",
            "hoveredInstanceId": 40302,
            "hoveredMouseFilter": 0,
            "hoveredZIndex": 31,
            "hoverMatchesTarget": True,
            "clickViewportPoint": before["viewportPoint"],
            "clickScreenTransform": before["screenTransform"],
            "clickInputPosition": before["inputPosition"],
            "clickUiPoint": False,
            "clickBattlePanelPoint": True,
        }
    )
    return (
        TOOL.ATTACK_INPUT_BEFORE_MARKER
        + " "
        + json.dumps(before, ensure_ascii=False, separators=(",", ":")),
        TOOL.ATTACK_INPUT_AFTER_MARKER
        + " "
        + json.dumps(after, ensure_ascii=False, separators=(",", ":")),
    )


def _environment_marker(stage: str, **updates: object) -> str:
    payload = {
        "stage": stage,
        "snapshotScope": "start_end_only",
        "displayServer": "macOS",
        "vsyncMode": 1,
        "windowFocused": True,
        "windowMode": 0,
        "windowSize": [1280, 720],
        "screenIndex": 0,
        "screenRefreshHz": 60.0,
        "screenRefreshKnown": True,
        "maxFps": 60,
        "physicsTicksPerSecond": 60,
        "timeScale": 1.0,
        "renderingMethod": "mobile",
        "renderingDriver": "metal",
        "videoAdapter": "Apple M5",
        "hostPropertyCacheReady": True,
    }
    payload.update(updates)
    return TOOL.ENVIRONMENT_MARKER + " " + json.dumps(
        payload,
        ensure_ascii=False,
        separators=(",", ":"),
    )


def _raw_frame_marker(
    state: str,
    *,
    interval_usec: int = 16_667,
    first_frame: int = 1000,
    first_tick_usec: int = 1_000_000,
    sample_count: int = 433,
) -> str:
    pairs: list[int] = []
    for index in range(sample_count):
        pairs.extend(
            (
                first_frame + index,
                first_tick_usec + index * interval_usec,
            )
        )
    ended_usec = pairs[-1] + 1
    payload = {
        "state": state,
        "clock": "Time.get_ticks_usec",
        "sampleLimit": TOOL.RAW_FRAME_SAMPLE_LIMIT,
        "sampleCount": sample_count,
        "droppedCount": 0,
        "startedUsec": first_tick_usec,
        "endedUsec": ended_usec,
        "durationUsec": ended_usec - first_tick_usec,
        "startedFrame": first_frame - 1,
        "endedFrame": pairs[-2] + 1,
        "monotonic": True,
        "samplerDisconnected": True,
        "pairs": pairs,
    }
    return TOOL.RAW_FRAME_MARKER + " " + json.dumps(
        payload,
        ensure_ascii=False,
        separators=(",", ":"),
    )


def _raw_payload_from_intervals(state: str, intervals_usec: list[int]) -> dict:
    first_frame = 1000
    first_tick_usec = 1_000_000
    pairs = [first_frame, first_tick_usec]
    current_tick = first_tick_usec
    for index, interval_usec in enumerate(intervals_usec, start=1):
        current_tick += interval_usec
        pairs.extend((first_frame + index, current_tick))
    ended_usec = current_tick
    return {
        "state": state,
        "clock": "Time.get_ticks_usec",
        "sampleLimit": TOOL.RAW_FRAME_SAMPLE_LIMIT,
        "sampleCount": len(intervals_usec) + 1,
        "droppedCount": 0,
        "startedUsec": first_tick_usec,
        "endedUsec": ended_usec,
        "durationUsec": ended_usec - first_tick_usec,
        "startedFrame": first_frame - 1,
        "endedFrame": first_frame + len(intervals_usec) + 1,
        "monotonic": True,
        "samplerDisconnected": True,
        "pairs": pairs,
    }


def _segments_marker(target_started_usec: int) -> str:
    operation_wall = {
        "target": [185_000] * 8,
        "recall": [180_000] * 8,
        "attack": [190_000] * 8,
    }
    operation_boundaries = {"target": [], "recall": [], "attack": []}
    for index in range(8):
        target_start = target_started_usec + 20_000 + index * 900_000
        target_end = target_start + operation_wall["target"][index]
        recall_start = target_end + 140_000
        recall_end = recall_start + operation_wall["recall"][index]
        attack_start = recall_end + 140_000
        attack_end = attack_start + operation_wall["attack"][index]
        operation_boundaries["target"].extend((target_start, target_end))
        operation_boundaries["recall"].extend((recall_start, recall_end))
        operation_boundaries["attack"].extend((attack_start, attack_end))
    payload = {
        "state": "target_switch",
        "clock": "Time.get_ticks_usec",
        "switchCount": TOOL.EXPECTED_SWITCHES,
        "realLeftClickCount": TOOL.EXPECTED_SWITCH_CLICKS,
        "qaSyncWallUsec": 2400,
        "qaSyncSampleCount": 160,
        "qaCoverage": "instrumented_sync_sections_only",
        "inputDispatchWallUsec": {
            "motion": 240,
            "press": 300,
            "release": 280,
        },
        "inputDispatchEventCounts": {
            "motion": 24,
            "press": 24,
            "release": 24,
        },
        "inputDispatchEventCount": 72,
        "operationWallUsec": operation_wall,
        "operationBoundaryUsec": operation_boundaries,
        "operationBoundaryClockAbsolute": True,
        "operationWallIncludesFrameWaits": True,
        "targetMarkersBufferedUntilAfterRaw": True,
        "layoutTimingAvailable": False,
        "layoutTimingUnavailableReason": "product_not_instrumented",
    }
    return TOOL.SEGMENTS_MARKER + " " + json.dumps(
        payload,
        ensure_ascii=False,
        separators=(",", ":"),
    )


def _mutate_json_marker(
    text: str,
    marker: str,
    *,
    match_key: str | None = None,
    match_value: object = None,
    mutate,
) -> str:
    lines = text.splitlines()
    matches = 0
    for index, line in enumerate(lines):
        if not line.startswith(marker + " "):
            continue
        payload = json.loads(line[len(marker) :].strip())
        if match_key is not None and payload.get(match_key) != match_value:
            continue
        mutate(payload)
        lines[index] = marker + " " + json.dumps(
            payload,
            ensure_ascii=False,
            separators=(",", ":"),
        )
        matches += 1
    if matches != 1:
        raise AssertionError(f"expected one {marker} mutation, got {matches}")
    return "\n".join(lines) + "\n"


def _perf_log(
    *,
    sample_count: int = 6,
    idle_fps: float = 59.9,
    command_fps: float = 59.8,
    switch_fps: float = 59.7,
    idle_process: float = 0.45,
    command_process: float = 0.72,
    switch_process: float = 1.15,
    idle_draw: float = 0.24,
    command_draw: float = 0.38,
    switch_draw: float = 0.68,
    switches: int = 8,
    cross_frame_presses: int = 25,
    idle_raw_interval_usec: int = 16_667,
    command_raw_interval_usec: int = 16_667,
    switch_raw_interval_usec: int = 16_667,
) -> str:
    lines = [
        "Godot Engine v4.7.stable.official",
        "Metal 4.0 - Forward Mobile - Using Device #0: Apple",
        (
            "PHASE412_BATTLE_ARENA_VISUAL id=moss_meadow "
            "bundle=battle_review_arenas_v1 source_map=firebud_village_gate "
            f"sha256={TOOL.DIAGNOSTIC.EXPECTED_ARENA_SHA256} "
            "viewport=1280x720 owner_review=pending "
            "runtime_enabled=false release_approved=false qa_preview=true "
            "explicit_capture=true ordinary_player_enabled=false "
            "review_lab=false baked_actors=false"
        ),
        (
            "PHASE403_BATTLE_LAYOUT_REVIEW_ONLY kind=integrated_mount "
            "bundle=mounted_action_novice_hunter_v1_bui_novice_sprout_v1 "
            "character=novice_hunter_v1 form=bui_novice_sprout_earth5_wind5 "
            "geometry_only=true player_visible=false ordinary_battle=false "
            "inserted_into_battle_state=false actual_bundle_warmed=true "
            "runtime_frame=256x256 source_image_frame=not_asserted "
            "mount_scale=0.88 visual_scale=0.74 opaque_ratio=0.72 "
            "max_visible_px=120.03 horizontal_envelope_px=132.00 "
            "width_covered=true vertical_recomputed=false "
            "anchor_recomputed=false slot_collisions_recomputed=false"
        ),
        _environment_marker("start"),
        (
            "PHASE403_BATTLE_LAYOUT_PERF_START scene=Main.tscn "
            "entry=MainSceneFlag viewport=1280x720 environment=runtime_markers "
            "formation=10v10 actors=20 "
            f"layout_identity={TOOL.LAYOUT_IDENTITY} profile=isolated "
            "backend_started=false profile_save=false host_property_cache=true"
        ),
        (
            "PHASE403_BATTLE_LAYOUT_PERF_INVARIANT stage=pre_windows "
            "actors=20 slots=20 ally=10 enemy=10 full_formation=true "
            "hud_exact=true hud_collisions=0 viewport_violations=0 "
            f"layout_identity={TOOL.LAYOUT_IDENTITY}"
        ),
    ]
    states = (
        ("idle", idle_fps, idle_process, idle_draw),
        ("command_selection", command_fps, command_process, command_draw),
        ("target_switch", switch_fps, switch_process, switch_draw),
    )
    for state, fps, process_total, draw_battle in states:
        begin_suffix = ""
        end_suffix = ""
        if state == "command_selection":
            begin_suffix = " target_mode=player_attack_target"
            end_suffix = " target_mode=player_attack_target"
        elif state == "target_switch":
            begin_suffix = (
                " slots=enemy.front.4,enemy.front.5 switches=8 clicks=24"
            )
            end_suffix = (
                f" switches={switches} target_hits={switches} "
                f"switch_clicks={switches * 3} exact_slots=true "
                "hud_passthrough=0 raw_frames=true segments=true"
            )
        lines.append(
            f"PHASE403_BATTLE_LAYOUT_PERF_STATE state={state}_begin"
            f"{begin_suffix}"
        )
        for index in range(sample_count):
            lines.append(
                "perf probe: "
                f"fps={fps - index * 0.01:.1f} frames=60 "
                f"draw=0.12ms draw_battle={draw_battle + index * 0.01:.2f}ms "
                f"process_total={process_total + index * 0.01:.2f}ms"
            )
        raw_interval_usec = {
            "idle": idle_raw_interval_usec,
            "command_selection": command_raw_interval_usec,
            "target_switch": switch_raw_interval_usec,
        }[state]
        raw_first_frame = 1000 + len(lines) * 1000
        raw_first_tick_usec = 1_000_000 + len(lines) * 10_000_000
        raw_sample_count = max(
            TOOL.MIN_RAW_FRAME_SAMPLES,
            round(7_200_000 / raw_interval_usec) + 1,
        )
        lines.append(
            _raw_frame_marker(
                state,
                interval_usec=raw_interval_usec,
                first_frame=raw_first_frame,
                first_tick_usec=raw_first_tick_usec,
                sample_count=raw_sample_count,
            )
        )
        if state == "target_switch":
            for index in range(switches):
                slot = TOOL.EXPECTED_TARGET_SLOTS[index % 2]
                actor = "enemy_front_4" if slot.endswith(".4") else "enemy_front_5"
                lines.append(
                    "PHASE403_BATTLE_LAYOUT_TARGET "
                    f"index={index + 1} actor={actor} slot={slot} "
                    f"expected={actor} resolved={actor} exact=true "
                    "adjacent_distance=80.00 focus_name_chars=8 "
                    "focus_label_fits=true hud_overlap=false"
                )
            lines.append(_segments_marker(raw_first_tick_usec))
        lines.append(
            f"PHASE403_BATTLE_LAYOUT_PERF_STATE state={state}_end"
            f"{end_suffix}"
        )
        if state == "idle":
            lines.extend(_attack_marker_lines())
    left_clicks = 1 + switches * 3
    lines.append(
        "PHASE403_BATTLE_LAYOUT_PERF_INVARIANT stage=post_windows "
        "actors=20 slots=20 ally=10 enemy=10 full_formation=true "
        "hud_exact=true hud_collisions=0 viewport_violations=0 "
        f"layout_identity={TOOL.LAYOUT_IDENTITY}"
    )
    lines.append(_environment_marker("end"))
    lines.append(
        "PHASE403_BATTLE_LAYOUT_PERF_END status=passed elapsed_wall=24.600 "
        "scene=Main.tscn entry=MainSceneFlag viewport=1280x720 "
        "formation=10v10 actors=20 "
        f"layout_identity={TOOL.LAYOUT_IDENTITY} idle=true "
        "command_selection=true target_switch=true "
        f"switches={switches} target_hits={switches} exact_slots=true "
        "hud_collisions=0 hud_passthrough=0 backend_started=false "
        f"profile_save=false actual_left_clicks={left_clicks} "
        f"cross_frame_presses={cross_frame_presses} raw_frames=true "
        "segments=true runtime_environment=true pre_invariant=true "
        "post_invariant=true"
    )
    return "\n".join(lines) + "\n"


class CaptureBattleLayoutPerfTest(unittest.TestCase):
    def test_command_is_real_main_metal_probe_without_movie_or_bypass(self) -> None:
        command = TOOL._build_godot_command(godot="/opt/godot")
        separator = command.index("--")
        engine = command[:separator]
        user = command[separator + 1 :]
        self.assertEqual(engine[engine.index("--scene") + 1], TOOL.MAIN_SCENE)
        self.assertEqual(
            engine[engine.index("--resolution") + 1],
            "1280x720",
        )
        self.assertIn("--windowed", engine)
        self.assertIn("--single-window", engine)
        self.assertNotIn("--headless", engine)
        self.assertNotIn("--script", engine)
        self.assertNotIn("--user-data-dir", command)
        self.assertNotIn("--write-movie", engine)
        self.assertEqual(user.count("--perf-probe"), 1)
        self.assertEqual(user.count(TOOL.DIAGNOSTIC.CAPTURE_FLAG), 1)
        self.assertEqual(user.count(TOOL.PERF_CAPTURE_FLAG), 1)
        self.assertEqual(user.count(TOOL.CORE.QA_LANE_ARGUMENT), 1)
        self.assertEqual(user[-1], TOOL.CORE.QA_LANE_ARGUMENT)
        with self.assertRaises(TOOL.Phase403BattleLayoutPerfError):
            TOOL._build_godot_command(
                godot="/opt/godot",
                extra_args=("--auto-auth-server-live-check",),
            )

    def test_current_sources_have_minimal_main_and_real_click_contract(self) -> None:
        TOOL._require_perf_wiring()
        raw_parser_source = inspect.getsource(TOOL._validate_raw_frame_payload)
        log_parser_source = inspect.getsource(TOOL._validate_godot_log)
        self.assertIn(
            "wall_midpoint_usec = started_usec + duration_usec // 2",
            raw_parser_source,
        )
        self.assertIn("right_tick > wall_midpoint_usec", raw_parser_source)
        self.assertIn("raw_aggregate_fps", raw_parser_source)
        self.assertNotIn("1000.0 /", raw_parser_source)
        for metric in (
            '"oneSecondFps.minimum"',
            '"rawAggregateFps"',
            '"rawFrameIntervalMs.p95"',
        ):
            self.assertIn(metric, log_parser_source)
        self.assertEqual(TOOL.MIN_STABLE_FPS_BY_STATE["target_switch"], 45.0)
        capture_source = TOOL.CAPTURE_SCRIPT_PATH.read_text(encoding="utf-8")
        invalid_fixture_sources = (
            capture_source.replace(
                "const READY_FRAME_LIMIT := 120",
                "const READY_FRAME_LIMIT := 600",
                1,
            ),
            capture_source.replace(
                "PlayerProgressModel.PET_STATE_BATTLE,\n\t\t140",
                "PlayerProgressModel.PET_STATE_STANDBY,\n\t\t140",
                1,
            ),
            capture_source.replace(
                'profile["petInstances"] = [fixture_pet]',
                'profile["petInstances"] = []',
                1,
            ),
            capture_source.replace(
                'profile["activePetInstanceId"] = FORMAL_PET_INSTANCE_ID',
                'profile["activePetInstanceId"] = ""',
                1,
            ),
            capture_source.replace(
                "profile = PlayerProgressModel.normalize_profile(profile)",
                "profile = profile.duplicate(true)",
                1,
            ),
            capture_source.replace(
                "if not _assert_owner_review_arena_visual_contract():",
                "if false:",
                1,
            ),
            capture_source.replace(
                'int(readiness.get("actorCount", 0)) != 20',
                'int(readiness.get("actorCount", 0)) != 19',
                1,
            ),
            capture_source.replace(
                'int(readiness.get("allyCount", 0)) != 10',
                'int(readiness.get("allyCount", 0)) != 9',
                1,
            ),
            capture_source.replace(
                'str(readiness.get("allyPetFormId", "")) '
                "!= FORMAL_PET_FORM_ID",
                'str(readiness.get("allyPetFormId", "")) != ""',
                1,
            ),
            capture_source.replace(" readiness=%s", "", 1),
            capture_source + '\nstate["reviewLab"] = true\n',
            capture_source + '\nstate["serverAuthority"] = true\n',
        )
        for invalid_source in invalid_fixture_sources:
            with self.assertRaises(TOOL.Phase403BattleLayoutPerfError):
                TOOL._require_formal_active_pet_fixture_contract(
                    invalid_source
                )
        invalid_command_sources = (
            capture_source.replace(
                '(_view as Object).call("command_buttons")',
                '(_view as Object).call("input_blockers")',
                1,
            ),
            capture_source.replace(
                "(command_buttons_value as Dictionary).values()",
                "(command_buttons_value as Dictionary).keys()",
                1,
            ),
            capture_source.replace(
                "if visible_controls.has(control):",
                "if false:",
                1,
            ),
            capture_source.replace(
                "visible_controls.size() != 10",
                "visible_controls.size() < 10",
                1,
            ),
            capture_source.replace(
                'int(snapshot.get("activeButtonCount", -1)) != 10',
                'int(snapshot.get("activeButtonCount", -1)) != 9',
                1,
            ),
            capture_source.replace('"咒术",', '"法术",', 1),
            capture_source.replace(
                "hud_rect.intersects(rect)",
                "false",
                1,
            ),
            capture_source.replace(
                "previous_rect.intersects(rect)",
                "false",
                1,
            ),
            capture_source.replace(" rects=%s", "", 1),
            capture_source + "\nvar invalid_count = visible_blockers < 8\n",
        )
        for invalid_source in invalid_command_sources:
            with self.assertRaises(TOOL.Phase403BattleLayoutPerfError):
                TOOL._require_player_command_union_contract(invalid_source)
        invalid_perf_sources = (
            capture_source.replace(
                "if not _cache_host_property_names():",
                "if false:",
                1,
            ),
            capture_source.replace(
                'if not bool(_host_property("perf_probe_enabled")):\n'
                '\t\t_fail_capture("性能验收必须同时启用--perf-probe")\n'
                "\t\treturn\n"
                "\tif not _assert_live_layout_contract():",
                'if not bool(_host_property("perf_probe_enabled")):\n'
                '\t\t_fail_capture("性能验收必须同时启用--perf-probe")\n'
                "\t\treturn\n\tif false:",
                1,
            ),
            capture_source.replace(
                "return host.get(property_name) if "
                "_host_property_names.has(property_name) else null",
                "return host.get_property_list()",
                1,
            ),
            capture_source.replace(
                "_perf_frame_pairs[pair_index] = process_frame",
                "_perf_frame_pairs.append(process_frame)",
                1,
            ),
            capture_source.replace(
                "var ticks_usec: int = Time.get_ticks_usec()",
                "_perf_frame_pairs.resize(2)\n"
                "\tvar ticks_usec: int = Time.get_ticks_usec()",
                1,
            ),
            capture_source.replace(
                "var ticks_usec: int = Time.get_ticks_usec()",
                'print("pollute")\n'
                "\tvar ticks_usec: int = Time.get_ticks_usec()",
                1,
            ),
            capture_source.replace(
                "var ticks_usec: int = Time.get_ticks_usec()",
                "JSON.stringify({})\n"
                "\tvar ticks_usec: int = Time.get_ticks_usec()",
                1,
            ),
            capture_source.replace(
                "var ticks_usec: int = Time.get_ticks_usec()",
                '_host_property("battle_state")\n'
                "\tvar ticks_usec: int = Time.get_ticks_usec()",
                1,
            ),
            capture_source.replace(
                "var ticks_usec: int = Time.get_ticks_usec()",
                "DisplayServer.get_name()\n"
                "\tvar ticks_usec: int = Time.get_ticks_usec()",
                1,
            ),
            capture_source.replace(
                "var ticks_usec: int = Time.get_ticks_usec()",
                "RenderingServer.get_current_rendering_method()\n"
                "\tvar ticks_usec: int = Time.get_ticks_usec()",
                1,
            ),
            capture_source.replace(
                "var ticks_usec: int = Time.get_ticks_usec()",
                "await host.get_tree().process_frame\n"
                "\tvar ticks_usec: int = Time.get_ticks_usec()",
                1,
            ),
            capture_source.replace(
                "var ticks_usec: int = Time.get_ticks_usec()",
                "host.get_property_list()\n"
                "\tvar ticks_usec: int = Time.get_ticks_usec()",
                1,
            ),
            capture_source.replace(
                "var ticks_usec: int = Time.get_ticks_usec()",
                "_assert_live_layout_contract()\n"
                "\tvar ticks_usec: int = Time.get_ticks_usec()",
                1,
            ),
            capture_source.replace(
                "var ticks_usec: int = Time.get_ticks_usec()",
                "_perf_indirect_probe()\n"
                "\tvar ticks_usec: int = Time.get_ticks_usec()",
                1,
            )
            + "\nfunc _perf_indirect_probe() -> void:\n\tpass\n",
            capture_source.replace(
                "var ticks_usec: int = Time.get_ticks_usec()",
                'Callable(self, "_perf_indirect_probe").call()\n'
                "\tvar ticks_usec: int = Time.get_ticks_usec()",
                1,
            ),
            capture_source.replace(
                "func _capture_perf_process_frame() -> void:\n",
                "func _capture_perf_process_frame() -> void:\n"
                '\tvar leaked_state = host["battle_state"]\n',
                1,
            ),
            capture_source.replace(
                "\t\t_perf_sample_count += 1\n",
                "\t\t_perf_sample_count += 1\n"
                "\t\t_perf_sample_count += 7\n",
                1,
            ),
            capture_source
            + '\nfunc _reflected_property_scan():\n'
            + '\treturn host.call("get_property_list")\n',
            capture_source.replace(
                "_perf_frame_pairs.resize(PERF_FRAME_SAMPLE_LIMIT * 2)",
                "pass",
                1,
            ),
            capture_source.replace(
                'if _perf_sample_state == "target_switch":\n'
                "\t\tif index < 1 or index > _perf_target_marker_lines.size():",
                'print(marker_line)\n'
                "\tif index < 1 or index > _perf_target_marker_lines.size():",
                1,
            ),
            capture_source.replace(
                'if not _end_perf_frame_sampling("target_switch"):\n'
                "\t\treturn\n"
                "\tif not _print_perf_target_markers(completed_switches):",
                "if not _print_perf_target_markers(completed_switches):\n"
                "\t\treturn\n"
                '\tif not _end_perf_frame_sampling("target_switch"):',
                1,
            ),
            capture_source.replace(" stage=pre_windows ", " stage=inside_window ", 1),
            capture_source.replace(
                "_perf_qa_sample_count != PERF_TARGET_SWITCH_COUNT * 20",
                "_perf_qa_sample_count <= 0",
                1,
            ),
            capture_source.replace(
                '_record_perf_input_dispatch_wall("release", '
                "input_parse_started_usec)",
                "pass",
                1,
            ),
            capture_source.replace(
                "boundaries[sample_index * 2 + 1] = ended_usec",
                "boundaries[sample_index * 2 + 1] = started_usec",
                1,
            ),
            capture_source.replace(
                "boundaries[sample_index * 2] = started_usec",
                "boundaries.append(started_usec)",
                1,
            ),
            capture_source.replace(
                '"screenRefreshKnown": screen_refresh_hz > 0.0',
                '"screenRefreshKnown": true',
                1,
            ),
            capture_source.replace(
                "!= (refresh_hz > 0.0)",
                "!= true",
                1,
            ),
            capture_source.replace(
                "or not is_finite(refresh_hz)",
                "or refresh_hz <= 0.0",
                1,
            ),
        )
        for index, invalid_source in enumerate(invalid_perf_sources):
            with self.subTest(perf_contract_mutation=index):
                self.assertNotEqual(invalid_source, capture_source)
                with self.assertRaises(
                    TOOL.DIAGNOSTIC.Phase403BattleLayoutRecordingError
                ):
                    TOOL.DIAGNOSTIC._require_perf_evidence_contract(
                        invalid_source
                    )
        command_view_source = TOOL.DIAGNOSTIC.COMMAND_VIEW_SCRIPT_PATH.read_text(
            encoding="utf-8"
        )
        command_host_source = TOOL.DIAGNOSTIC.COMMAND_HOST_SCRIPT_PATH.read_text(
            encoding="utf-8"
        )
        main_source = TOOL.MAIN_SCRIPT_PATH.read_text(encoding="utf-8")
        release_post_draw_sequence = (
            "Input.parse_input_event(release)\n"
            '\t_record_perf_input_dispatch_wall("release", '
            "input_parse_started_usec)\n"
            "\t_capture_attack_input_route_stage(\n"
            "\t\tinput_probe,\n"
            "\t\ttarget_control,\n"
            "\t\t\"release_sync\"\n"
            "\t)\n"
            "\tawait host.get_tree().process_frame\n"
            "\t_capture_attack_input_route_stage(\n"
            "\t\tinput_probe,\n"
            "\t\ttarget_control,\n"
            "\t\t\"release_process\"\n"
            "\t)\n"
            "\tif not input_probe.is_empty():\n"
            "\t\tawait RenderingServer.frame_post_draw"
        )
        invalid_attack_contracts = (
            capture_source.replace(
                "var button_identity_exact: bool = (",
                "var button_identity_exact := (",
                1,
            ),
            capture_source.replace(
                "var screen_transform: Transform2D = "
                "viewport.get_screen_transform()",
                "var screen_transform := "
                "host.get_viewport().get_screen_transform()",
            ),
            capture_source.replace(
                "func _attack_input_state_snapshot(",
                "func _missing_attack_input_state_snapshot(",
                1,
            ),
            capture_source.replace(
                "and host_attack == button",
                "and host_attack != button",
                1,
            ),
            capture_source.replace(
                "if cursor == target_control:",
                "if true:",
                1,
            ),
            capture_source.replace(
                'input_probe["hoverMatchesTarget"] = hover_matches',
                'input_probe["hoverMatchesTarget"] = true',
                1,
            ),
            capture_source.replace(
                '"viewObserverMode": '
                '"synchronous_after_preexisting_host"',
                '"viewObserverMode": "unspecified"',
                1,
            ),
            capture_source.replace(
                "view_callable,\n\t\tCONNECT_ONE_SHOT",
                "view_callable,\n\t\tCONNECT_DEFERRED | CONNECT_ONE_SHOT",
                1,
            ),
            capture_source.replace(
                'probe["viewState"] = '
                '_attack_input_state_snapshot(button, "view")',
                'command_pressed.emit("attack")',
                1,
            ),
            capture_source.replace(
                'probe.get("_viewCallable", Callable())',
                'probe.get("_pressedCallable", Callable())',
                1,
            ),
            capture_source.replace(
                'return "mode_then_polluted"',
                'return "ok"',
                1,
            ),
            capture_source.replace(
                'and bool(snapshot.get("battlePanelPoint", false))',
                'and bool(snapshot.get("uiPoint", false))',
                1,
            ),
            capture_source.replace(
                "await host.get_tree().physics_frame",
                "await host.get_tree().process_frame\n"
                "\tawait host.get_tree().physics_frame",
                1,
            ),
            capture_source.replace(
                "\tawait RenderingServer.frame_post_draw\n",
                "",
                1,
            ),
            capture_source.replace(
                release_post_draw_sequence,
                "await RenderingServer.frame_post_draw\n"
                "\tInput.parse_input_event(release)\n"
                "\tawait host.get_tree().process_frame",
                1,
            ),
            capture_source.replace(
                "await RenderingServer.frame_post_draw",
                "await RenderingServer.frame_post_draw\n"
                "\tawait RenderingServer.frame_post_draw",
                1,
            ),
            capture_source.replace(
                "await RenderingServer.frame_post_draw",
                "await host.get_tree().create_timer(0.01).timeout",
                1,
            ),
            capture_source.replace(
                release_post_draw_sequence,
                "Input.parse_input_event(release)\n"
                "\tawait RenderingServer.frame_post_draw",
                1,
            ),
            capture_source.replace(
                'probe["postDrawStateCaptured"] = (\n'
                "\t\tpost_draw_boundary_reached\n"
                "\t\tand next_loop_post_draw_boundary_reached\n"
                "\t)",
                'probe["postDrawStateCaptured"] = true',
                1,
            ),
            capture_source.replace(
                'probe["upCount"] = '
                'int(probe.get("upCount", 0)) + 1',
                'probe["upCount"] = '
                'int(probe.get("upCount", 0)) + 1\n'
                '\tprobe["releaseState"] = '
                '_attack_input_state_snapshot(_button, "release")',
                1,
            ),
            capture_source.replace(
                "\t\t_capture_attack_input_post_draw_states("
                "probe, attack_button)\n\t\tvar after :=",
                "\t\tvar after :=",
                1,
            ).replace(
                "\t\tvar classification := "
                "_attack_input_classification(probe, after)",
                "\t\t_capture_attack_input_post_draw_states("
                "probe, attack_button)\n"
                "\t\tvar classification := "
                "_attack_input_classification(probe, after)",
                1,
            ),
            capture_source.replace(
                "var input_position: Vector2 = "
                "screen_transform * viewport_point",
                "var input_position: Vector2 = Vector2.ZERO",
                1,
            ),
            capture_source.replace(
                "var viewport_point := button_rect.get_center()",
                "var viewport_point := "
                "button_rect.get_center() + Vector2(1.0, 0.0)",
                1,
            ),
            capture_source.replace(
                '"inputPosition": _vector_payload('
                "screen_transform * viewport_point)",
                '"inputPosition": _vector_payload(viewport_point)',
                1,
            ),
            capture_source.replace(
                'input_probe["hoveredPath"] = _control_path(hovered)',
                'input_probe["hoveredPath"] = '
                '_control_path(target_control)',
                1,
            ),
            capture_source.replace(
                "button.gui_input.connect(gui_input_callable)",
                "pass # gui_input observer removed",
                1,
            ),
            capture_source.replace(
                "button.gui_input.connect(gui_input_callable)",
                "button.gui_input.connect("
                "gui_input_callable, CONNECT_DEFERRED)",
                1,
            ),
            capture_source.replace(
                "button.gui_input.connect(gui_input_callable)",
                "button.disabled = false\n\t"
                "button.gui_input.connect(gui_input_callable)",
                1,
            ),
            capture_source.replace(
                'probe["guiLeftButtonEvents"] = events',
                'probe["guiLeftButtonEvents"] = events\n\taccept_event()',
                1,
            ),
            capture_source.replace(
                'probe["guiLeftButtonEvents"] = events',
                'probe["guiLeftButtonEvents"] = events\n'
                '\thost.call("_on_battle_command_pressed", "attack")',
                1,
            ),
            capture_source.replace(
                'probe["upCount"] = '
                'int(probe.get("upCount", 0)) + 1',
                'probe["upCount"] = '
                'int(probe.get("upCount", 0)) + 1\n'
                '\t_button.disabled = false',
                1,
            ),
            capture_source.replace(
                'probe.get("_guiInputCallable", Callable())',
                'probe.get("_downCallable", Callable())',
                1,
            ),
            capture_source.replace(
                'target_control,\n\t\t"release_sync"',
                'target_control,\n\t\t"release_process"',
                1,
            ),
            capture_source.replace(
                '"buttonInstanceId": _control_instance_id(button)',
                '"buttonInstanceId": 40301',
                1,
            ),
            capture_source.replace(
                '"inputLeftPressed": '
                "Input.is_mouse_button_pressed(MOUSE_BUTTON_LEFT)",
                '"inputLeftPressed": false',
                1,
            ),
            capture_source.replace(
                'return "release_not_routed"',
                'return "release_routed_and_button_up"',
                1,
            ),
            capture_source.replace(
                "var capture_lost: bool = (",
                "var capture_lost := (",
                1,
            ),
            capture_source.replace(
                "var capture_lost: bool = (",
                "var capture_lost = (",
                1,
            ),
            capture_source.replace(
                '\t\tor not bool(pre_release_stage.get('
                '"inputLeftPressed", false))\n\t)',
                '\t\tor not bool(pre_release_stage.get('
                '"inputLeftPressed", false))\n'
                '\t\tor int(probe.get("mouseExitedCount", 0)) > 0\n\t)',
                1,
            ),
            capture_source.replace(
                '\t\tor not bool(pre_release_stage.get('
                '"inputLeftPressed", false))\n\t)',
                '\t\tor not bool(pre_release_stage.get('
                '"inputLeftPressed", false))\n'
                '\t\tor int(probe["mouseExitedCount"]) > 0\n\t)',
                1,
            ),
            capture_source.replace(
                '\t\tor not bool(pre_release_stage.get('
                '"buttonVisible", false))\n',
                "",
                1,
            ),
            capture_source.replace(
                '\t\tor not bool(pre_release_stage.get('
                '"buttonIsHovered", false))',
                '\t\tor bool(pre_release_stage.get('
                '"buttonIsHovered", false))',
                1,
            ),
            capture_source.replace(
                "_attack_input_release_routing_classification(probe)",
                '"release_routed_and_button_up"',
                1,
            ),
            capture_source.replace(
                '\tawait host.get_tree().process_frame\n'
                '\tif not input_probe.is_empty():\n'
                '\t\tawait RenderingServer.frame_post_draw\n'
                '\t\tinput_probe["nextLoopPostDrawBoundaryReached"] = true',
                '\tif not input_probe.is_empty():\n'
                '\t\tawait RenderingServer.frame_post_draw\n'
                '\t\tinput_probe["nextLoopPostDrawBoundaryReached"] = true',
                1,
            ),
            capture_source.replace(
                '\tawait host.get_tree().process_frame\n'
                '\tif not input_probe.is_empty():\n'
                '\t\tawait RenderingServer.frame_post_draw\n'
                '\t\tinput_probe["nextLoopPostDrawBoundaryReached"] = true',
                '\tawait host.get_tree().process_frame\n'
                '\tawait host.get_tree().process_frame\n'
                '\tif not input_probe.is_empty():\n'
                '\t\tawait RenderingServer.frame_post_draw\n'
                '\t\tinput_probe["nextLoopPostDrawBoundaryReached"] = true',
                1,
            ),
            capture_source.replace(
                '\tawait host.get_tree().process_frame\n'
                '\tif not input_probe.is_empty():\n'
                '\t\tawait RenderingServer.frame_post_draw\n'
                '\t\tinput_probe["nextLoopPostDrawBoundaryReached"] = true',
                '\tif not input_probe.is_empty():\n'
                '\t\tawait RenderingServer.frame_post_draw\n'
                '\tawait host.get_tree().process_frame\n'
                '\t\tinput_probe["nextLoopPostDrawBoundaryReached"] = true',
                1,
            ),
            capture_source.replace(
                'target_control,\n\t\t\t"release_next_loop_post_draw"',
                'target_control,\n\t\t\t"release_post_draw"',
                1,
            ),
            capture_source.replace(
                "Input.parse_input_event(release)",
                "Input.parse_input_event(release)\n"
                "\tInput.flush_buffered_events()",
                1,
            ),
            capture_source.replace(
                "Input.parse_input_event(release)",
                "Input.use_accumulated_input = false\n"
                "\tInput.parse_input_event(release)",
                1,
            ),
            capture_source.replace(
                "Input.parse_input_event(release)",
                "Input.parse_input_event(release)\n\tpress.emit()",
                1,
            ),
            capture_source.replace(
                'probe[prefix + "Delivered"] = '
                "_attack_input_route_stage_delivered(stage)",
                'probe[prefix + "Delivered"] = true',
                1,
            ),
            capture_source.replace(
                "_attack_input_gui_left_button_count(probe, false)",
                "1",
                1,
            ),
            capture_source.replace(
                "\t\tstages.append(stage_snapshot)",
                '\t\tstage_snapshot["processFrame"] = 999\n'
                "\t\tstages.append(stage_snapshot)",
                1,
            ),
            capture_source.replace(
                "\t\tstages.append(stage_snapshot)",
                '\t\tstage_snapshot["guiLeftButtonEventCount"] = 2\n'
                "\t\tstages.append(stage_snapshot)",
                1,
            ),
            capture_source.replace(
                "\t\tstages.append(stage_snapshot)",
                '\t\tstage_snapshot["guiLeftButtonReleaseCount"] = 1\n'
                "\t\tstages.append(stage_snapshot)",
                1,
            ),
            capture_source.replace(
                "\t\tstages.append(stage_snapshot)",
                '\t\tstage_snapshot.merge({"processFrame": 999}, true)\n'
                "\t\tstages.append(stage_snapshot)",
                1,
            ),
            capture_source.replace(
                "\t\tstages.append(stage_snapshot)",
                "\t\tstages.append(stage_snapshot.duplicate(true))",
                1,
            ),
            capture_source.replace(
                "\t\tstage_snapshot.merge(\n",
                '\t\tgui_events.append({"pressed": false})\n'
                "\t\tstage_snapshot.merge(\n",
                1,
            ),
            capture_source.replace(
                "\t\tstage_snapshot.merge(\n",
                '\t\tprobe["upCount"] = 1\n'
                "\t\tstage_snapshot.merge(\n",
                1,
            ),
            capture_source.replace(
                "\t\tstage_snapshot.merge(\n",
                '\t\t(probe["guiLeftButtonEvents"] as Array).append('
                '{"pressed": false})\n'
                "\t\tstage_snapshot.merge(\n",
                1,
            ),
            capture_source.replace(
                '\tprobe[prefix + "GuiLeftButtonReleaseCount"] = int(\n'
                '\t\tstage.get("guiLeftButtonReleaseCount", -1)\n'
                "\t)",
                '\tprobe[prefix + "GuiLeftButtonReleaseCount"] = int(\n'
                '\t\tstage.get("guiLeftButtonReleaseCount", -1)\n'
                "\t)\n"
                '\tprobe[prefix + "ProcessFrame"] = 999',
                1,
            ),
            capture_source
            + '\nvar duplicate_attack_marker = '
            + '"PHASE403_BATTLE_LAYOUT_ATTACK_INPUT_BEFORE"\n',
        )
        for index, invalid_source in enumerate(invalid_attack_contracts):
            with self.subTest(attack_contract_mutation=index):
                with self.assertRaises(TOOL.Phase403BattleLayoutPerfError):
                    TOOL._require_attack_input_diagnostic_contract(
                        invalid_source,
                        command_view_source,
                        command_host_source,
                        main_source,
                    )
        invalid_product_contracts = (
            (
                command_view_source.replace(
                    "button.pressed.connect(_emit_command.bind(str(command_id)))",
                    "button.pressed.connect("
                    "_emit_command.bind(str(command_id)), CONNECT_DEFERRED)",
                    1,
                ),
                command_host_source,
                main_source,
            ),
            (
                command_view_source,
                command_host_source.replace(
                    '_view.command_pressed.connect(Callable(_host, '
                    '"_on_battle_command_pressed"))',
                    '_view.command_pressed.connect(Callable(_host, '
                    '"_on_battle_command_pressed"), CONNECT_DEFERRED)',
                    1,
                ),
                main_source,
            ),
            (
                command_view_source,
                command_host_source,
                main_source.replace(
                    '_begin_player_enemy_target_selection("attack")',
                    '_battle_attack()',
                    1,
                ),
            ),
        )
        for invalid_view, invalid_host, invalid_main in invalid_product_contracts:
            with self.assertRaises(TOOL.Phase403BattleLayoutPerfError):
                TOOL._require_attack_input_diagnostic_contract(
                    capture_source,
                    invalid_view,
                    invalid_host,
                    invalid_main,
                )

    def test_log_accepts_three_states_and_independent_raw_clock(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "godot-perf.log"
            path.write_text(_perf_log(), encoding="utf-8")
            result = TOOL._validate_godot_log(path)
        self.assertEqual(tuple(result["states"]), TOOL.EXPECTED_STATES)
        self.assertEqual(result["layoutIdentity"], TOOL.LAYOUT_IDENTITY)
        self.assertEqual(result["interaction"]["switches"], 8)
        self.assertEqual(result["interaction"]["targetHits"], 8)
        self.assertEqual(result["interaction"]["actualLeftClicks"], 25)
        self.assertEqual(result["interaction"]["crossFramePresses"], 25)
        self.assertEqual(result["interaction"]["hudPassthrough"], 0)
        self.assertEqual(
            result["interaction"]["attackInput"]["classification"],
            "ok",
        )
        self.assertEqual(
            result["interaction"]["attackInput"]["postDrawBoundary"],
            {"sameLoop": True, "nextLoop": True},
        )
        self.assertFalse(
            result["interaction"]["attackInput"]["routing"]
            ["sameLoopDelivered"]
        )
        self.assertTrue(
            result["interaction"]["attackInput"]["routing"]
            ["nextLoopDelivered"]
        )
        self.assertTrue(
            result["interaction"]["attackInput"]
            ["productConnectionFlags"]["nonDeferred"]
        )
        self.assertEqual(
            result["interaction"]["attackInput"]["routing"]["classification"],
            "release_routed_and_button_up",
        )
        self.assertEqual(
            [
                stage["stage"]
                for stage in result["interaction"]["attackInput"]
                ["routing"]["stages"]
            ],
            list(TOOL.DIAGNOSTIC.EXPECTED_ATTACK_ROUTE_STAGES),
        )
        self.assertTrue(
            result["interaction"]["attackInput"]
            ["routing"]["observersDisconnected"]
        )
        self.assertEqual(len(result["gates"]), 21)
        self.assertTrue(all(gate["passed"] for gate in result["gates"]))
        for state in TOOL.EXPECTED_STATES:
            stats = result["states"][state]
            self.assertIn("drawBattleMs", stats)
            self.assertIn("oneSecondFps", stats)
            self.assertIn("rawAggregateFps", stats)
            self.assertIn("rawFrameIntervalMs", stats)
            self.assertGreater(stats["rawFrameIntervalMs"]["median"], 0.0)
        segments = result["interaction"]["segments"]
        self.assertEqual(segments["qaSyncSampleCount"], 160)
        self.assertEqual(
            segments["inputDispatchEventCounts"],
            {"motion": 24, "press": 24, "release": 24},
        )
        self.assertAlmostEqual(segments["targetStartRateHz"], 1.111111, places=5)
        self.assertEqual(
            tuple(result["windowInvariants"]),
            ("pre_windows", "post_windows"),
        )
        self.assertTrue(result["reviewOnlyMountWidthOnly"])
        self.assertFalse(result["reviewOnlyMountSlotCollisionClaimed"])
        self.assertFalse(result["ordinaryBattleContainsMount"])
        self.assertEqual(result["arenaVisual"]["id"], "moss_meadow")
        self.assertFalse(result["arenaVisual"]["runtimeEnabled"])
        self.assertFalse(result["arenaVisual"]["ordinaryPlayerEnabled"])
        _, current_after = _attack_marker_lines()
        _, delivered_after = _attack_marker_lines(same_loop_delivered=True)
        delivered_same_loop_log = _perf_log().replace(
            current_after,
            delivered_after,
            1,
        )
        with tempfile.TemporaryDirectory() as temp_dir:
            delivered_path = Path(temp_dir) / "same-loop-delivered.log"
            delivered_path.write_text(delivered_same_loop_log, encoding="utf-8")
            delivered_result = TOOL._validate_godot_log(delivered_path)
        self.assertTrue(
            delivered_result["interaction"]["attackInput"]["routing"]
            ["sameLoopDelivered"]
        )
        final_hover_present_log = _perf_log().replace(
            _attack_route_stage_json(
                "release_next_loop_post_draw",
                False,
            ),
            _attack_route_stage_json(
                "release_next_loop_post_draw",
                False,
                buttonIsHovered=True,
                viewportHoveredPath=(
                    "/root/Main/HUD/"
                    "BattleCommandAwakenedView/Attack/Label"
                ),
                viewportHoveredInstanceId=40302,
                viewportHoveredMatchesButton=True,
            ),
            1,
        )
        with tempfile.TemporaryDirectory() as temp_dir:
            final_hover_path = Path(temp_dir) / "final-hover-present.log"
            final_hover_path.write_text(
                final_hover_present_log,
                encoding="utf-8",
            )
            final_hover_result = TOOL._validate_godot_log(final_hover_path)
        self.assertTrue(
            final_hover_result["interaction"]["attackInput"]["routing"]
            ["nextLoopDelivered"]
        )

    def test_log_rejects_duplicate_plain_and_recursive_json_fields(self) -> None:
        marker = "TEST_MARKER"
        normal_payload = {
            "message": "two words",
            "items": ["marker", {"state": "ok"}],
        }
        parsed = TOOL._parse_json_marker(
            marker
            + " "
            + json.dumps(
                normal_payload,
                ensure_ascii=False,
                separators=(",", ":"),
            ),
            marker,
        )
        self.assertEqual(parsed, normal_payload)

        base = _perf_log()
        raw_prefix = TOOL.RAW_FRAME_MARKER + ' {"state":"idle"'
        invalid_logs = (
            base.replace(
                "formation=10v10 actors=20",
                "formation=10v10 actors=19 actors=20",
                1,
            ),
            base.replace(
                "resolved=enemy_front_4 exact=true",
                "resolved=enemy_front_4 exact=false exact=true",
                1,
            ),
            base.replace(
                raw_prefix,
                TOOL.RAW_FRAME_MARKER
                + ' {"state":"wrong","state":"idle"',
                1,
            ),
            base.replace(
                raw_prefix,
                TOOL.RAW_FRAME_MARKER
                + ' {"metadata":{"classification":"wrong",'
                '"classification":"ignored"},"state":"idle"',
                1,
            ),
            base.replace(
                '"classification":"ok"',
                '"classification":"wrong","classification":"ok"',
                1,
            ),
            base.replace(
                '"downState":{"stage":"down"',
                '"downState":{"state":"wrong","state":"ignored",'
                '"stage":"down"',
                1,
            ),
        )
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "duplicate-fields.log"
            for index, text in enumerate(invalid_logs):
                with self.subTest(index=index):
                    self.assertNotEqual(text, base)
                    path.write_text(text, encoding="utf-8")
                    with self.assertRaises(TOOL.Phase403BattleLayoutPerfError):
                        TOOL._validate_godot_log(path)

    def test_perf_sample_tokens_are_exact_finite_and_unique(self) -> None:
        base = _perf_log()
        invalid_logs = (
            base.replace(
                "fps=59.9 frames=60",
                "fps=19 fps=59.9 frames=60",
                1,
            ),
            base.replace(
                "process_total=0.45ms",
                "process_total=9ms process_total=0.45ms",
                1,
            ),
            base.replace(
                "draw_battle=0.24ms",
                "draw_battle=9ms draw_battle=0.24ms",
                1,
            ),
            base.replace("fps=59.9", "fps=59.9oops", 1),
            base.replace("fps=59.9", "fps=59.9ms", 1),
            base.replace(
                "process_total=0.45ms",
                "process_total=0.45",
                1,
            ),
            base.replace(
                "process_total=0.45ms",
                "process_total=.45seconds",
                1,
            ),
            base.replace(
                "draw_battle=0.24ms",
                "draw_battle=.24garbage",
                1,
            ),
        )
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "invalid-sample-token.log"
            for index, text in enumerate(invalid_logs):
                with self.subTest(index=index):
                    self.assertNotEqual(text, base)
                    path.write_text(text, encoding="utf-8")
                    with self.assertRaises(TOOL.Phase403BattleLayoutPerfError):
                        TOOL._validate_godot_log(path)

    def test_log_rejects_short_slow_hot_same_frame_or_misleading_mount(self) -> None:
        invalid_logs = (
            _perf_log(sample_count=4),
            _perf_log(idle_fps=27.0),
            _perf_log(command_fps=27.0),
            _perf_log(switch_fps=44.0),
            _perf_log(idle_process=15.1),
            _perf_log(switch_process=30.1),
            _perf_log(idle_draw=15.1),
            _perf_log(switch_draw=30.1),
            _perf_log(cross_frame_presses=18),
            _perf_log().replace("draw_battle=0.24ms ", "", 1),
            _perf_log().replace("slot=enemy.front.5", "slot=enemy.front.4", 1),
            _perf_log().replace("player_visible=false", "player_visible=true"),
            _perf_log().replace("ordinary_battle=false", "ordinary_battle=true"),
            _perf_log().replace("width_covered=true", "width_covered=false"),
            _perf_log().replace(
                "width_covered=true",
                "width_covered=true collisions=0",
            ),
            _perf_log().replace(
                "slot_collisions_recomputed=false",
                "slot_collisions_recomputed=true",
            ),
            _perf_log().replace(
                "owner_review=pending",
                "owner_review=approved",
            ),
            _perf_log().replace(
                "runtime_enabled=false",
                "runtime_enabled=true",
            ),
            _perf_log().replace(
                "ordinary_player_enabled=false",
                "ordinary_player_enabled=true",
            ),
            _perf_log().replace(
                f"sha256={TOOL.DIAGNOSTIC.EXPECTED_ARENA_SHA256}",
                "sha256=" + "0" * 64,
            ),
            _perf_log().replace(
                "process_total=0.45ms",
                "process_total=-0.45ms",
                1,
            ),
            _perf_log().replace("elapsed_wall=24.600", "elapsed_wall=nan"),
            _perf_log().replace("elapsed_wall=24.600", "elapsed_wall=-1.000"),
            _perf_log()
            + next(
                line
                for line in _perf_log().splitlines()
                if line.startswith(TOOL.START_MARKER + " ")
            )
            + "\n",
            _perf_log().replace(
                "state=command_selection_begin",
                "state=target_switch_begin",
                1,
            ),
            _perf_log().replace(
                '"classification":"ok"',
                '"classification":"view_without_mode"',
                1,
            ),
            _perf_log().replace(
                '"hoverMatchesTarget":true',
                '"hoverMatchesTarget":false',
                1,
            ),
            _perf_log().replace('"upCount":1', '"upCount":0', 1),
            _perf_log().replace(
                '"postDrawBoundaryReached":true',
                '"postDrawBoundaryReached":false',
                1,
            ),
            _perf_log().replace(
                '"nextLoopPostDrawBoundaryReached":true',
                '"nextLoopPostDrawBoundaryReached":false',
                1,
            ),
            _perf_log().replace(
                '"postDrawStateCaptured":true',
                '"postDrawStateCaptured":false',
                1,
            ),
            _perf_log().replace(
                '"sameLoopDelivered":false',
                '"sameLoopDelivered":true',
                1,
            ),
            _perf_log().replace(
                '"nextLoopDelivered":true',
                '"nextLoopDelivered":false',
                1,
            ),
            _perf_log().replace(
                '"sameLoopProcessFrame":102',
                '"sameLoopProcessFrame":101',
                1,
            ),
            _perf_log().replace(
                '"nextLoopProcessFrame":103',
                '"nextLoopProcessFrame":102',
                1,
            ),
            _perf_log().replace(
                '"sameLoopGuiLeftButtonEventCount":1',
                '"sameLoopGuiLeftButtonEventCount":2',
                1,
            ),
            _perf_log().replace(
                '"nextLoopGuiLeftButtonReleaseCount":1',
                '"nextLoopGuiLeftButtonReleaseCount":0',
                1,
            ),
            _perf_log().replace(
                '"productChainExactAfterCleanup":true',
                '"productChainExactAfterCleanup":false',
                1,
            ),
            _perf_log().replace(
                '"productViewConnectionFlags":[0]',
                '"productViewConnectionFlags":[1]',
                1,
            ),
            _perf_log().replace(
                '"viewportPoint":[1220.0,512.0]',
                '"viewportPoint":[1221.0,512.0]',
                1,
            ),
            _perf_log().replace(
                '"clickInputPosition":[1220.0,512.0]',
                '"clickInputPosition":[0.0,0.0]',
                1,
            ),
            _perf_log().replace(
                '"hoveredPath":"/root/Main/HUD/'
                'BattleCommandAwakenedView/Attack/Label"',
                '"hoveredPath":"/root/Main/HUD/Unrelated"',
                1,
            ),
            _perf_log().replace(
                '"hoveredPath":"/root/Main/HUD/'
                'BattleCommandAwakenedView/Attack/Label"',
                '"hoveredPath":"/root/Main/HUD/'
                'BattleCommandAwakenedView/Attack"',
                1,
            ),
            _perf_log().replace(
                '"releaseRoutingClassification":'
                '"release_routed_and_button_up"',
                '"releaseRoutingClassification":"release_not_routed"',
                1,
            ),
            _perf_log().replace(
                '"releaseRoutingClassification":'
                '"release_routed_and_button_up"',
                '"releaseRoutingClassification":'
                '"release_routed_but_basebutton_not_up"',
                1,
            ),
            _perf_log().replace(
                '"releaseRoutingClassification":'
                '"release_routed_and_button_up"',
                '"releaseRoutingClassification":'
                '"capture_lost_before_release"',
                1,
            ),
            _perf_log().replace(
                '"observerSignalsDisconnected":true',
                '"observerSignalsDisconnected":false',
                1,
            ),
            _perf_log().replace(
                '"mouseExitedCount":1',
                '"mouseExitedCount":-1',
                1,
            ),
            _perf_log().replace(
                '"pressed":true,"buttonIndex":1,"buttonMask":1',
                '"pressed":true,"buttonIndex":1,"buttonMask":0',
                1,
            ),
            _perf_log().replace(
                '"pressed":false,"buttonIndex":1,"buttonMask":0',
                '"pressed":false,"buttonIndex":1,"buttonMask":1',
                1,
            ),
            _perf_log().replace(
                '"pressed":false,"buttonIndex":1',
                '"pressed":true,"buttonIndex":1',
                1,
            ),
            _perf_log().replace(
                '"stage":"release_sync"',
                '"stage":"release_process"',
                1,
            ),
            _perf_log().replace(
                '"buttonParentInstanceId":40300',
                '"buttonParentInstanceId":40399',
                1,
            ),
            _perf_log().replace(
                '"stage":"press_sync","processFrame":100,"buttonPath":'
                '"/root/Main/HUD/BattleCommandAwakenedView/Attack",'
                '"buttonInstanceId":40301',
                '"stage":"press_sync","processFrame":100,"buttonPath":'
                '"/root/Main/HUD/BattleCommandAwakenedView/Attack",'
                '"buttonInstanceId":40399',
                1,
            ),
            _perf_log().replace(
                '"buttonParentInstanceId":40300,'
                '"buttonGlobalRect":[1186.0,476.0,68.0,72.0]',
                '"buttonParentInstanceId":40300,'
                '"buttonGlobalRect":[1187.0,476.0,68.0,72.0]',
                1,
            ),
            _perf_log().replace(
                '"inputLeftPressed":true',
                '"inputLeftPressed":false',
                1,
            ),
            _perf_log().replace(
                '"buttonPressed":true',
                '"buttonPressed":false',
                1,
            ),
            _perf_log().replace(
                '"globalPosition":[1220.0,512.0]',
                '"globalPosition":[1219.0,512.0]',
                1,
            ),
            _perf_log().replace(
                '"viewportHoveredPath":'
                '"/root/Main/HUD/BattleCommandAwakenedView/Attack/Label"',
                '"viewportHoveredPath":"/root/Main/HUD/Unrelated"',
                1,
            ),
            _perf_log().replace(
                ',{"pressed":false,"buttonIndex":1,"buttonMask":0,'
                '"position":[34.0,36.0],'
                '"globalPosition":[1220.0,512.0]}',
                '',
                1,
            ),
            _perf_log().replace(
                _attack_route_stage_json("pre_release", True),
                _attack_route_stage_json(
                    "pre_release",
                    True,
                    buttonIsHovered=False,
                ),
                1,
            ),
            _perf_log().replace(
                _attack_route_stage_json("release_sync", True),
                _attack_route_stage_json(
                    "release_sync",
                    True,
                    buttonPressed=False,
                ),
                1,
            ),
            _perf_log().replace(
                _attack_route_stage_json("release_process", True),
                _attack_route_stage_json(
                    "release_process",
                    True,
                    inputLeftPressed=False,
                ),
                1,
            ),
            _perf_log().replace(
                _attack_route_stage_json("release_post_draw", True),
                _attack_route_stage_json(
                    "release_post_draw",
                    True,
                    buttonVisible=False,
                ),
                1,
            ),
            _perf_log().replace(
                _attack_route_stage_json("release_process", True),
                _attack_route_stage_json(
                    "release_process",
                    True,
                    buttonDisabled=True,
                ),
                1,
            ),
            _perf_log().replace(
                _attack_route_stage_json("release_post_draw", True),
                _attack_route_stage_json(
                    "release_post_draw",
                    True,
                    buttonIsHovered=False,
                ),
                1,
            ),
            _perf_log().replace(
                _attack_route_stage_json(
                    "release_next_loop_post_draw",
                    False,
                ),
                _attack_route_stage_json(
                    "release_next_loop_post_draw",
                    False,
                    buttonIsHovered=True,
                ),
                1,
            ),
            _perf_log().replace(
                _attack_route_stage_json(
                    "release_next_loop_post_draw",
                    False,
                ),
                _attack_route_stage_json(
                    "release_next_loop_post_draw",
                    False,
                    viewportHoveredPath=(
                        "/root/Main/HUD/"
                        "BattleCommandAwakenedView/Attack/Label"
                    ),
                    viewportHoveredInstanceId=40302,
                ),
                1,
            ),
            _perf_log().replace(
                _attack_route_stage_json(
                    "release_next_loop_post_draw",
                    False,
                ),
                _attack_route_stage_json(
                    "release_next_loop_post_draw",
                    False,
                    upCount=0,
                ),
                1,
            ),
            _perf_log().replace(
                _attack_route_stage_json(
                    "release_next_loop_post_draw",
                    False,
                ),
                _attack_route_stage_json(
                    "release_next_loop_post_draw",
                    False,
                    buttonVisible=False,
                ),
                1,
            ),
            _perf_log().replace(
                _attack_route_stage_json(
                    "release_next_loop_post_draw",
                    False,
                ),
                _attack_route_stage_json(
                    "release_next_loop_post_draw",
                    False,
                    inputLeftPressed=True,
                ),
                1,
            ),
            _perf_log().replace(
                _attack_route_stage_json(
                    "release_next_loop_post_draw",
                    False,
                ),
                _attack_route_stage_json(
                    "release_next_loop_post_draw",
                    False,
                    guiLeftButtonReleaseCount=0,
                ),
                1,
            ),
            _perf_log()
            .replace(
                '"nextLoopProcessFrame":103',
                '"nextLoopProcessFrame":102',
                1,
            )
            .replace(
                _attack_route_stage_json(
                    "release_next_loop_post_draw",
                    False,
                ),
                _attack_route_stage_json(
                    "release_next_loop_post_draw",
                    False,
                    processFrame=102,
                ),
                1,
            ),
            _perf_log()
            .replace(
                '"sameLoopProcessFrame":102',
                '"sameLoopProcessFrame":103',
                1,
            )
            .replace(
                '"nextLoopProcessFrame":103',
                '"nextLoopProcessFrame":104',
                1,
            )
            .replace(
                _attack_route_stage_json("release_post_draw", True),
                _attack_route_stage_json(
                    "release_post_draw",
                    True,
                    processFrame=103,
                ),
                1,
            )
            .replace(
                _attack_route_stage_json(
                    "release_next_loop_post_draw",
                    False,
                ),
                _attack_route_stage_json(
                    "release_next_loop_post_draw",
                    False,
                    processFrame=104,
                ),
                1,
            ),
            _perf_log().replace(
                TOOL.ATTACK_INPUT_AFTER_MARKER,
                "PHASE403_BATTLE_LAYOUT_ATTACK_INPUT_MISSING",
                1,
            ),
            _perf_log()
            + next(
                line
                for line in _perf_log().splitlines()
                if line.startswith(TOOL.ATTACK_INPUT_BEFORE_MARKER + " ")
            )
            + "\n",
        )
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "godot-perf.log"
            for index, text in enumerate(invalid_logs):
                with self.subTest(index=index):
                    path.write_text(text, encoding="utf-8")
                    with self.assertRaises(TOOL.Phase403BattleLayoutPerfError):
                        TOOL._validate_godot_log(path)

    def test_environment_records_unknown_refresh_and_rejects_runtime_drift(self) -> None:
        unknown_refresh = _perf_log().replace(
            _environment_marker("start"),
            _environment_marker(
                "start",
                screenRefreshHz=-1.0,
                screenRefreshKnown=False,
            ),
            1,
        ).replace(
            _environment_marker("end"),
            _environment_marker(
                "end",
                screenRefreshHz=-1.0,
                screenRefreshKnown=False,
            ),
            1,
        )
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "unknown-refresh.log"
            path.write_text(unknown_refresh, encoding="utf-8")
            result = TOOL._validate_godot_log(path)
        self.assertFalse(result["environment"][0]["screenRefreshKnown"])
        invalid_logs = []
        for field, value in (
            ("vsyncMode", 0),
            ("windowFocused", False),
            ("windowMode", 1),
            ("windowSize", [1279, 720]),
            ("maxFps", 30),
            ("physicsTicksPerSecond", 30),
            ("timeScale", 0.5),
            ("renderingMethod", "gl_compatibility"),
            ("renderingDriver", "vulkan"),
            ("videoAdapter", ""),
            ("hostPropertyCacheReady", False),
            ("screenRefreshKnown", False),
            ("snapshotScope", "continuous"),
        ):
            invalid_logs.append(
                _mutate_json_marker(
                    _perf_log(),
                    TOOL.ENVIRONMENT_MARKER,
                    match_key="stage",
                    match_value="start",
                    mutate=lambda payload, key=field, actual=value: payload.__setitem__(
                        key,
                        actual,
                    ),
                )
            )
        invalid_logs.append(
            _perf_log().replace(
                _environment_marker("end"),
                _environment_marker("end", videoAdapter="Apple M4"),
                1,
            )
        )
        invalid_logs.append(
            _perf_log().replace(
                _environment_marker("end"),
                _environment_marker("end", screenRefreshHz=120.0),
                1,
            )
        )
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "invalid-environment.log"
            for index, text in enumerate(invalid_logs):
                with self.subTest(environment=index):
                    path.write_text(text, encoding="utf-8")
                    with self.assertRaises(TOOL.Phase403BattleLayoutPerfError):
                        TOOL._validate_godot_log(path)

    def test_raw_clock_and_one_second_fps_are_independent_hard_gates(self) -> None:
        wall_split_payload = _raw_payload_from_intervals(
            "target_switch",
            [30_000] * 120 + [15_000] * 240,
        )
        wall_split = TOOL._validate_raw_frame_payload(
            wall_split_payload,
            "target_switch",
        )
        self.assertEqual(wall_split["intervalWindow"], "wall_time_latter_half")
        self.assertEqual(
            wall_split["intervalSelection"],
            "right_endpoint_after_midpoint",
        )
        self.assertEqual(wall_split["intervalSampleCount"], 240)
        self.assertGreaterEqual(
            wall_split["intervalWindowStartedUsec"],
            wall_split["wallMidpointUsec"],
        )
        self.assertAlmostEqual(
            wall_split["rawFrameIntervalMs"]["p95"],
            15.0,
            places=3,
        )
        crossing_stall_payload = _raw_payload_from_intervals(
            "target_switch",
            [16_667] * 120 + [2_610_000] + [16_667] * 155,
        )
        crossing_stall = TOOL._validate_raw_frame_payload(
            crossing_stall_payload,
            "target_switch",
        )
        self.assertLess(crossing_stall["rawAggregateFps"], 45.0)
        self.assertLess(
            crossing_stall["intervalWindowStartedUsec"],
            crossing_stall["wallMidpointUsec"],
        )
        valid_log = _perf_log(switch_fps=45.5, switch_raw_interval_usec=21_900)
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "independent-clock.log"
            path.write_text(valid_log, encoding="utf-8")
            valid = TOOL._validate_godot_log(path)
        self.assertGreaterEqual(
            valid["states"]["target_switch"]["oneSecondFps"]["minimum"],
            45.0,
        )
        self.assertGreaterEqual(
            valid["states"]["target_switch"]["rawAggregateFps"],
            45.0,
        )
        invalid_logs = [
            _perf_log(switch_fps=44.0, switch_raw_interval_usec=16_667),
            _perf_log(switch_fps=60.0, switch_raw_interval_usec=23_000),
            _mutate_json_marker(
                _perf_log(),
                TOOL.RAW_FRAME_MARKER,
                match_key="state",
                match_value="target_switch",
                mutate=lambda payload: (
                    payload.clear(),
                    payload.update(crossing_stall_payload),
                ),
            ),
            _mutate_json_marker(
                _perf_log(),
                TOOL.RAW_FRAME_MARKER,
                match_key="state",
                match_value="target_switch",
                mutate=lambda payload: payload.__setitem__("droppedCount", 1),
            ),
            _mutate_json_marker(
                _perf_log(),
                TOOL.RAW_FRAME_MARKER,
                match_key="state",
                match_value="target_switch",
                mutate=lambda payload: payload["pairs"].__setitem__(
                    2,
                    payload["pairs"][0] + 2,
                ),
            ),
            _mutate_json_marker(
                _perf_log(),
                TOOL.RAW_FRAME_MARKER,
                match_key="state",
                match_value="target_switch",
                mutate=lambda payload: payload["pairs"].__setitem__(
                    3,
                    payload["pairs"][1],
                ),
            ),
            _mutate_json_marker(
                _perf_log(),
                TOOL.RAW_FRAME_MARKER,
                match_key="state",
                match_value="target_switch",
                mutate=lambda payload: payload.__setitem__(
                    "sampleCount",
                    payload["sampleCount"] - 1,
                ),
            ),
            _mutate_json_marker(
                _perf_log(),
                TOOL.RAW_FRAME_MARKER,
                match_key="state",
                match_value="target_switch",
                mutate=lambda payload: payload.__setitem__(
                    "startedFrame",
                    payload["pairs"][0] - 2,
                ),
            ),
            _mutate_json_marker(
                _perf_log(),
                TOOL.RAW_FRAME_MARKER,
                match_key="state",
                match_value="target_switch",
                mutate=lambda payload: (
                    payload.__setitem__(
                        "endedUsec",
                        payload["startedUsec"]
                        + TOOL.MAX_RAW_STATE_DURATION_USEC
                        + 1,
                    ),
                    payload.__setitem__(
                        "durationUsec",
                        TOOL.MAX_RAW_STATE_DURATION_USEC + 1,
                    ),
                ),
            ),
            _mutate_json_marker(
                _perf_log(),
                TOOL.RAW_FRAME_MARKER,
                match_key="state",
                match_value="target_switch",
                mutate=lambda payload: payload.__setitem__("monotonic", False),
            ),
            _mutate_json_marker(
                _perf_log(),
                TOOL.RAW_FRAME_MARKER,
                match_key="state",
                match_value="target_switch",
                mutate=lambda payload: payload.__setitem__(
                    "samplerDisconnected",
                    False,
                ),
            ),
        ]
        raw_line = next(
            line
            for line in _perf_log().splitlines()
            if line.startswith(TOOL.RAW_FRAME_MARKER + " ")
            and '"state":"target_switch"' in line
        )
        invalid_logs.append(
            _perf_log().replace(raw_line, raw_line + "\n" + raw_line, 1)
        )
        invalid_logs.append(
            _perf_log().replace(raw_line, raw_line.replace(
                TOOL.RAW_FRAME_MARKER,
                "PHASE403_BATTLE_LAYOUT_PERF_RAW_MISSING",
                1,
            ), 1)
        )
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "invalid-raw.log"
            for index, text in enumerate(invalid_logs):
                with self.subTest(raw=index):
                    path.write_text(text, encoding="utf-8")
                    with self.assertRaises(TOOL.Phase403BattleLayoutPerfError):
                        TOOL._validate_godot_log(path)

    def test_segments_bind_24_inputs_to_ordered_target_operation_clock(self) -> None:
        def mutate_segment(mutator) -> str:
            return _mutate_json_marker(
                _perf_log(),
                TOOL.SEGMENTS_MARKER,
                mutate=mutator,
            )

        def overlap_second_iteration(payload: dict) -> None:
            boundaries = payload["operationBoundaryUsec"]
            shift = boundaries["attack"][1] - 10_000 - boundaries["target"][2]
            for kind in ("target", "recall", "attack"):
                boundaries[kind][2] += shift
                boundaries[kind][3] += shift

        invalid_logs = (
            mutate_segment(
                lambda payload: payload.__setitem__("qaSyncSampleCount", 159)
            ),
            mutate_segment(
                lambda payload: payload["inputDispatchEventCounts"].__setitem__(
                    "release",
                    23,
                )
            ),
            mutate_segment(
                lambda payload: payload.__setitem__(
                    "inputDispatchEventCount",
                    71,
                )
            ),
            mutate_segment(
                lambda payload: payload["operationWallUsec"]["target"].pop()
            ),
            mutate_segment(
                lambda payload: payload["operationBoundaryUsec"]["target"].__setitem__(
                    0,
                    1,
                )
            ),
            mutate_segment(
                lambda payload: payload["operationBoundaryUsec"]["recall"].__setitem__(
                    0,
                    payload["operationBoundaryUsec"]["target"][1] - 1,
                )
            ),
            mutate_segment(
                lambda payload: payload["operationBoundaryUsec"]["target"].__setitem__(
                    2,
                    payload["operationBoundaryUsec"]["target"][0],
                )
            ),
            mutate_segment(overlap_second_iteration),
            mutate_segment(
                lambda payload: payload.__setitem__(
                    "targetMarkersBufferedUntilAfterRaw",
                    False,
                )
            ),
            mutate_segment(
                lambda payload: payload.__setitem__(
                    "layoutTimingAvailable",
                    True,
                )
            ),
            mutate_segment(
                lambda payload: payload["inputDispatchEventCounts"].__setitem__(
                    "synthetic",
                    0,
                )
            ),
        )
        target_line = next(
            line
            for line in _perf_log().splitlines()
            if line.startswith(TOOL.TARGET_MARKER + " ")
        )
        target_raw_line = next(
            line
            for line in _perf_log().splitlines()
            if line.startswith(TOOL.RAW_FRAME_MARKER + " ")
            and '"state":"target_switch"' in line
        )
        invalid_order = _perf_log().replace(target_line + "\n", "", 1).replace(
            target_raw_line,
            target_line + "\n" + target_raw_line,
            1,
        )
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "invalid-segments.log"
            for index, text in enumerate((*invalid_logs, invalid_order)):
                with self.subTest(segments=index):
                    path.write_text(text, encoding="utf-8")
                    with self.assertRaises(TOOL.Phase403BattleLayoutPerfError):
                        TOOL._validate_godot_log(path)

    def test_pre_and_post_window_invariants_are_exact_and_outside_windows(self) -> None:
        base = _perf_log()
        pre_line = next(
            line
            for line in base.splitlines()
            if line.startswith(TOOL.INVARIANT_MARKER + " stage=pre_windows ")
        )
        invalid_logs = (
            base.replace(pre_line + "\n", "", 1),
            base.replace(pre_line, pre_line + "\n" + pre_line, 1),
            base.replace("stage=pre_windows", "stage=inside_windows", 1),
            base.replace("stage=pre_windows actors=20", "stage=pre_windows actors=19", 1),
            base.replace("hud_collisions=0", "hud_collisions=1", 1),
            base.replace("viewport_violations=0", "viewport_violations=1", 1),
            base.replace("pre_invariant=true", "pre_invariant=false", 1),
            base.replace(pre_line + "\n", "", 1).replace(
                "PHASE403_BATTLE_LAYOUT_PERF_STATE state=idle_begin",
                "PHASE403_BATTLE_LAYOUT_PERF_STATE state=idle_begin\n" + pre_line,
                1,
            ),
        )
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "invalid-invariant.log"
            for index, text in enumerate(invalid_logs):
                with self.subTest(invariant=index):
                    path.write_text(text, encoding="utf-8")
                    with self.assertRaises(TOOL.Phase403BattleLayoutPerfError):
                        TOOL._validate_godot_log(path)

    def test_capture_into_uses_one_official_phase_and_commits_all_evidence(self) -> None:
        evidence_root = REPO_ROOT / ".run" / "evidence"
        evidence_root.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=evidence_root) as directory:
            root = Path(directory)
            captured_kwargs: dict[str, object] = {}

            def official_sequence(**kwargs: object) -> dict[str, object]:
                captured_kwargs.update(kwargs)
                log_path = Path(kwargs["native_log"])
                log_path.write_text("perf product log\n", encoding="utf-8")
                lifecycle_path = root / "qa-lane-lifecycle.json"
                owner_path = root / "qa-lane-owner.json"
                version_log = root / "godot-version.log"
                help_log = root / "godot-help.log"
                TOOL.CORE._write_json(
                    lifecycle_path,
                    {"status": "cleaned_before_media", "qaLanePreserved": False},
                )
                TOOL.CORE._write_json(owner_path, {"owner": "1" * 32})
                version_log.write_text("4.7.stable.official\n", encoding="utf-8")
                help_log.write_text("tools enabled\n", encoding="utf-8")
                return {
                    "session": {
                        "owner": "1" * 32,
                        "godotLaneRoot": "/tmp/lane",
                        "godotRealRoot": "/tmp/real",
                        "realInventorySha256": "c" * 64,
                    },
                    "sourceCheck": {"status": "source_contract_passed"},
                    "initialVerification": {"status": "verified"},
                    "preflight": {
                        "version": {"normalizedVersion": "4.7.stable.official"},
                        "help": {"status": "passed"},
                    },
                    "native": {
                        "process": {"processGroupClosed": True},
                        "attestation": {"status": "passed"},
                        "postVerify": {"status": "verified"},
                        "logValidation": {"status": "passed", "rawClock": True},
                    },
                    "cleanup": {"status": "cleaned"},
                    "postCleanupInspect": {"status": "inspected"},
                    "lifecyclePath": lifecycle_path,
                    "ownerEvidencePath": owner_path,
                    "environment": {"TMPDIR": str(root / "tmp")},
                }

            args = argparse.Namespace(
                timeout_seconds=1.0,
                godot="godot",
            )
            with mock.patch.object(
                TOOL.CORE,
                "_require_executable",
                return_value="/opt/godot",
            ), mock.patch.object(
                TOOL.CORE,
                "_run_official_lane_godot_sequence",
                side_effect=official_sequence,
            ):
                summary_path = TOOL._capture_into(
                    args=args,
                    run_id="perf-success",
                    run_dir=root,
                )
            self.assertNotIn("movie_command", captured_kwargs)
            self.assertNotIn("movie_log", captured_kwargs)
            self.assertNotIn("movie_log_validator", captured_kwargs)
            self.assertIs(
                captured_kwargs["native_log_validator"],
                TOOL._validate_godot_log,
            )
            command = captured_kwargs["native_command"]
            self.assertEqual(command.count(TOOL.DIAGNOSTIC.CAPTURE_FLAG), 1)
            self.assertEqual(command.count(TOOL.PERF_CAPTURE_FLAG), 1)
            self.assertEqual(command.count(TOOL.CORE.QA_LANE_ARGUMENT), 1)
            summary = json.loads(summary_path.read_text(encoding="utf-8"))
            self.assertTrue(summary["finalStatusAuthority"])
            self.assertEqual(summary["result"]["status"], "passed")
            self.assertEqual(summary["native"]["attestation"]["status"], "passed")
            self.assertEqual(summary["qaLaneCleanup"]["status"], "cleaned")
            lines = (root / "SHA256SUMS").read_text(encoding="utf-8").splitlines()
            retained = {line.split("  ", 1)[1] for line in lines}
            self.assertTrue(
                {
                    "godot-help.log",
                    "godot-perf.log",
                    "godot-version.log",
                    "qa-lane-lifecycle.json",
                    "qa-lane-owner.json",
                    "summary.json",
                }.issubset(retained)
            )
            self.assertFalse((root / "sha256.txt").exists())

    def test_untrusted_and_trusted_failures_keep_lane_authority_semantics(self) -> None:
        evidence_root = REPO_ROOT / ".run" / "evidence"
        evidence_root.mkdir(parents=True, exist_ok=True)
        cases = (
            ("native_process_group_residual", True, "preserved"),
            ("native_verify_failed", True, "preserved"),
            ("trusted_product_failure", False, "cleaned_after_trusted_product_failure"),
        )
        for reason, preserved, status in cases:
            with self.subTest(reason=reason), tempfile.TemporaryDirectory(
                dir=evidence_root
            ) as output_directory:
                args = argparse.Namespace(
                    run_id=f"perf-{reason}",
                    output_root=Path(output_directory),
                    godot="godot",
                    timeout_seconds=1.0,
                )

                def fail_with_lifecycle(
                    *,
                    run_dir: Path,
                    **_kwargs: object,
                ) -> Path:
                    TOOL.CORE._write_json(
                        run_dir / "qa-lane-lifecycle.json",
                        {
                            "status": status,
                            "qaLanePreserved": preserved,
                            "lanePreservationReason": reason if preserved else None,
                            "cleanup": {"status": "cleaned"} if not preserved else None,
                        },
                    )
                    if preserved:
                        raise TOOL.CORE.GodotLanePreservationError(
                            reason,
                            reason=reason,
                            evidence={},
                        )
                    raise TOOL.Phase403BattleLayoutPerfError(
                        "target_switch raw wall-clock duration failed"
                    )

                with mock.patch.object(
                    TOOL,
                    "_require_perf_wiring",
                    return_value=None,
                ), mock.patch.object(
                    TOOL,
                    "_capture_into",
                    side_effect=fail_with_lifecycle,
                ):
                    with self.assertRaises(BaseException) as caught:
                        TOOL._capture(args)
                if preserved:
                    self.assertIsInstance(
                        caught.exception,
                        TOOL.CORE.GodotLanePreservationError,
                    )
                else:
                    self.assertIn("raw wall-clock", str(caught.exception))
                run_dir = Path(output_directory) / args.run_id
                failure = json.loads(
                    (run_dir / "failure-summary.json").read_text(encoding="utf-8")
                )
                self.assertEqual(failure["status"], "failed")
                self.assertEqual(failure["qaLane"]["qaLanePreserved"], preserved)
                if not preserved:
                    self.assertEqual(
                        failure["qaLane"]["cleanup"]["status"],
                        "cleaned",
                    )
                    self.assertIn("raw wall-clock", failure["error"])
                manifest = (run_dir / "SHA256SUMS").read_text(encoding="utf-8")
                self.assertIn("failure-summary.json", manifest)

    def test_manifest_failure_is_superseded_and_final_manifest_is_atomic(self) -> None:
        evidence_root = REPO_ROOT / ".run" / "evidence"
        evidence_root.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=evidence_root) as output_directory:
            args = argparse.Namespace(
                run_id="perf-manifest-failure",
                output_root=Path(output_directory),
                godot="godot",
                timeout_seconds=1.0,
            )
            original_manifest = TOOL.CORE._write_sha256_manifest
            manifest_calls = 0

            def flaky_manifest(root: Path, paths: list[Path]) -> Path:
                nonlocal manifest_calls
                manifest_calls += 1
                if manifest_calls == 1:
                    raise OSError("perf manifest atomic commit failed")
                return original_manifest(root, paths)

            def fail_at_manifest(
                *,
                run_dir: Path,
                **_kwargs: object,
            ) -> Path:
                summary_path = run_dir / "summary.json"
                TOOL.CORE._write_json(
                    summary_path,
                    {
                        "status": "passed",
                        "finalStatusAuthority": True,
                        "finalStatusAuthorityRequires": {
                            "failureSummaryAbsent": True
                        },
                    },
                )
                TOOL._write_manifest(run_dir, [summary_path])
                return summary_path

            with mock.patch.object(
                TOOL,
                "_require_perf_wiring",
                return_value=None,
            ), mock.patch.object(
                TOOL,
                "_capture_into",
                side_effect=fail_at_manifest,
            ), mock.patch.object(
                TOOL.CORE,
                "_write_sha256_manifest",
                side_effect=flaky_manifest,
            ):
                with self.assertRaisesRegex(OSError, "atomic commit failed"):
                    TOOL._capture(args)
            run_dir = Path(output_directory) / args.run_id
            failure = json.loads(
                (run_dir / "failure-summary.json").read_text(encoding="utf-8")
            )
            self.assertTrue(failure["finalStatusAuthority"])
            self.assertIsNotNone(failure["supersedesSummary"])
            manifest = (run_dir / "SHA256SUMS").read_text(encoding="utf-8")
            self.assertIn("summary.json", manifest)
            self.assertIn("failure-summary.json", manifest)
            self.assertEqual(manifest_calls, 2)

    def test_summary_write_and_stdout_precede_manifest_commit(self) -> None:
        source = TOOL_PATH.read_text(encoding="utf-8")
        capture_into = source[
            source.index("def _capture_into("):
            source.index("def _write_failure_summary(")
        ]
        self.assertNotIn("subprocess.run", capture_into)
        self.assertNotIn("--user-data-dir", capture_into)
        summary_write = capture_into.index("CORE._write_json(summary_path, summary)")
        passed_print = capture_into.rindex("print(")
        manifest_commit = capture_into.index("_write_manifest(run_dir, hash_paths)")
        self.assertLess(summary_write, passed_print)
        self.assertLess(passed_print, manifest_commit)
        self.assertIn("flush=True", capture_into)


if __name__ == "__main__":
    unittest.main()
