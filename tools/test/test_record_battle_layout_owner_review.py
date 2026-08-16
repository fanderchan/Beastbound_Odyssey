#!/usr/bin/env python3
"""Focused static tests for the Phase403 formal battle layout recorder."""

from __future__ import annotations

import argparse
import importlib.util
import json
import tempfile
import unittest
from unittest import mock
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
TOOL_PATH = REPO_ROOT / "tools" / "record_battle_layout_owner_review.py"
SPEC = importlib.util.spec_from_file_location(
    "record_battle_layout_owner_review",
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


def _godot_log() -> str:
    lines = [
        "Godot Engine v4.7.stable.official",
        "Metal 4.0 - Forward Mobile - Using Device #0: Apple",
        "Movie Maker mode enabled, recording movie in 1280x720 @ 30 FPS",
        (
            "PHASE412_BATTLE_ARENA_VISUAL id=moss_meadow "
            "bundle=battle_review_arenas_v1 source_map=firebud_village_gate "
            f"sha256={TOOL.EXPECTED_ARENA_SHA256} viewport=1280x720 "
            "owner_review=pending runtime_enabled=false "
            "release_approved=false qa_preview=true explicit_capture=true "
            "ordinary_player_enabled=false review_lab=false "
            "baked_actors=false"
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
        (
            "PHASE403_BATTLE_LAYOUT_OWNER_REVIEW_START scene=Main.tscn "
            "entry=MainSceneFlag viewport=1280x720 fps=30 speed=1.00x "
            "formation=10v10 actors=20 profile=isolated backend=false "
            "profile_save=false input=real_cross_frame_left_click"
        ),
        (
            "PHASE403_BATTLE_LAYOUT_FIXTURE character=ember_spark_v1 "
            "character_runtime=true character_lifecycle=owner_review_pending "
            "pet=wuli_evolved_crystal_earth8_water2 pet_runtime=true "
            "pet_lifecycle=approved runtime_frame=256x256 "
            "source_image_frame=512x512 draw_canvas=156x156 visual_scale=0.74 "
            "character_name_chars=24 pet_name_chars=8 "
            "character_variants=4 pet_variants=3 "
            "representative_runtime_mix=true single_asset_stress=false "
            "pet_sprite_profiles=3 crystal_wuli_sprite_scale=1.30 "
            "ordinary_actor_presentation_scale=1.00 contact_scale=1.00 "
            "boss_sprite_override=false sprite_only=true "
            "maximum_label_stress_preserved=true mounted_player_actors=0 "
            "lifecycle_unchanged=true"
        ),
        (
            "PHASE403_BATTLE_LAYOUT_IDENTITY "
            f"id={TOOL.LAYOUT_IDENTITY} formation=10v10 actors=20 "
            "origin=94x340.4 lane=152x52 rank=64x-48 envelope=132x164 "
            "round=576,18,128,40 timer=584,62,112,44 "
            "message=57,469,348,233 footer=57,703,204,17 "
            "hud_collisions=0 viewport_violations=0 exact=true"
        ),
    ]
    movie_frame = 100
    for chapter in TOOL.EXPECTED_CHAPTERS:
        lines.append(
            "PHASE403_BATTLE_LAYOUT_OWNER_REVIEW_CHAPTER "
            f"chapter={chapter} frame=75 seconds=2.500 "
            f"speed=1.00x movie_frame={movie_frame}"
        )
        movie_frame += 75
        if chapter == "formal_idle":
            lines.extend(_attack_marker_lines())
        if chapter == "command_selection_a":
            lines.append(
                "PHASE403_BATTLE_LAYOUT_TARGET index=1 actor=enemy_front_4 "
                "slot=enemy.front.4 expected=enemy_front_4 "
                "resolved=enemy_front_4 exact=true adjacent_distance=80.00 "
                "focus_name_chars=8 focus_label_fits=true hud_overlap=false"
            )
        if chapter == "command_selection_b":
            lines.append(
                "PHASE403_BATTLE_LAYOUT_TARGET index=2 actor=enemy_front_5 "
                "slot=enemy.front.5 expected=enemy_front_5 "
                "resolved=enemy_front_5 exact=true adjacent_distance=80.00 "
                "focus_name_chars=8 focus_label_fits=true hud_overlap=false"
            )
    lines.append(
        "PHASE403_BATTLE_LAYOUT_OWNER_REVIEW_END status=passed "
        "elapsed_wall=15.200 scene=Main.tscn entry=MainSceneFlag "
        "viewport=1280x720 formation=10v10 actors=20 "
        f"layout_identity={TOOL.LAYOUT_IDENTITY} layout_exact=true "
        "hud_collisions=0 viewport_violations=0 hud_passthrough=0 "
        "exact_targets=2 target_slots=enemy.front.4,enemy.front.5 "
        "mounted_player_actors=0 review_only_mount=true backend=false "
        "profile_save=false actual_left_clicks=5 cross_frame_presses=5"
    )
    return "\n".join(lines) + "\n"


class RecordBattleLayoutOwnerReviewTest(unittest.TestCase):
    def test_command_is_fixed_real_main_movie_maker_contract(self) -> None:
        movie = TOOL._build_godot_command(
            godot="/opt/godot",
            avi_path=Path("/tmp/phase403-layout.avi"),
        )
        native = TOOL._build_native_godot_command(godot="/opt/godot")
        for command in (native, movie):
            separator = command.index("--")
            engine = command[:separator]
            user = command[separator + 1 :]
            self.assertEqual(
                engine[engine.index("--scene") + 1],
                TOOL.MAIN_SCENE,
            )
            self.assertEqual(
                engine[engine.index("--resolution") + 1],
                "1280x720",
            )
            self.assertIn("--windowed", engine)
            self.assertNotIn("--script", engine)
            self.assertNotIn("--headless", engine)
            self.assertNotIn("--user-data-dir", command)
            self.assertEqual(command.count(TOOL.CAPTURE_FLAG), 1)
            self.assertEqual(command.count(TOOL.CORE.QA_LANE_ARGUMENT), 1)
            self.assertGreater(
                command.index(TOOL.CORE.QA_LANE_ARGUMENT),
                separator,
            )
        movie_engine = movie[: movie.index("--")]
        self.assertEqual(
            movie_engine[movie_engine.index("--fixed-fps") + 1],
            "30",
        )
        self.assertIn("--write-movie", movie_engine)
        self.assertNotIn("--write-movie", native)
        with self.assertRaises(TOOL.Phase403BattleLayoutRecordingError):
            TOOL._build_godot_command(
                godot="/opt/godot",
                avi_path=Path("/tmp/phase403-layout.avi"),
                extra_args=("--auto-auth-server-live-check",),
            )
        with self.assertRaises(TOOL.Phase403BattleLayoutRecordingError):
            TOOL._build_native_godot_command(
                godot="/opt/godot",
                extra_args=("--auto-auth-server-live-check",),
            )

    def test_current_sources_have_minimal_main_and_fixture_wiring(self) -> None:
        TOOL._require_main_flag_wiring()
        tool_source = TOOL_PATH.read_text(encoding="utf-8")
        capture_source = TOOL.CAPTURE_SCRIPT_PATH.read_text(encoding="utf-8")
        for appearance_id in (
            "novice_hunter_v1",
            "obsidian_scout_v1",
            "frost_whisper_v1",
            "ember_spark_v1",
        ):
            self.assertIn(f'"{appearance_id}"', capture_source)
        for form_id in (
            "bui_novice_sprout_earth5_wind5",
            "driftfox_evolved_moon_gale_wind7_water3",
            "wuli_evolved_crystal_earth8_water2",
        ):
            self.assertIn(f'"{form_id}"', capture_source)
        self.assertIn(
            "_assert_representative_actor_identity_contract(state)",
            capture_source,
        )
        self.assertIn("_assert_pet_sprite_scale_contract()", capture_source)
        self.assertIn("pet_battle_sprite_scale_catalog.gd", capture_source)
        self.assertIn("crystal_wuli_sprite_scale=1.30", capture_source)
        self.assertIn("single_asset_stress=false", capture_source)
        self.assertNotIn("strict=True", tool_source)
        TOOL._require_frame_size_normalization_contract(capture_source)
        TOOL._require_host_property_cache_contract(capture_source)
        host_cache_without_perf = capture_source.replace(
            "func _begin_perf_frame_sampling(",
            "func _missing_perf_frame_sampling(",
            1,
        )
        TOOL._require_host_property_cache_contract(host_cache_without_perf)
        invalid_cache_sources = (
            capture_source.replace(
                "if not _cache_host_property_names():",
                "if false:",
                1,
            ),
            capture_source.replace(
                "return host.get(property_name) if "
                "_host_property_names.has(property_name) else null",
                "return host.get_property_list()",
                1,
            ),
            capture_source
            + "\nvar duplicate_property_scan = host.get_property_list()\n",
            capture_source
            + '\nvar reflected_property_scan = host.call("get_property_list")\n',
        )
        for invalid_source in invalid_cache_sources:
            with self.assertRaises(TOOL.Phase403BattleLayoutRecordingError):
                TOOL._require_host_property_cache_contract(invalid_source)
        invalid_sources = (
            capture_source.replace(
                '_normalized_frame_size(character_meta.get("sourceFrameSize", []))\n'
                "\t\t!= Vector2i(512, 512)",
                '_normalized_frame_size(character_meta.get("sourceFrameSize", []))\n'
                "\t\t!= Vector2i(511, 512)",
                1,
            ),
            capture_source.replace("values.size() != 2", "values.size() != 3", 1),
            capture_source
            + '\nvar invalid_direct_compare = character_meta.get('
            + '"sourceFrameSize", []) != [512, 512]\n',
        )
        for invalid_source in invalid_sources:
            with self.assertRaises(TOOL.Phase403BattleLayoutRecordingError):
                TOOL._require_frame_size_normalization_contract(invalid_source)
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
            with self.assertRaises(TOOL.Phase403BattleLayoutRecordingError):
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
            with self.assertRaises(TOOL.Phase403BattleLayoutRecordingError):
                TOOL._require_player_command_union_contract(invalid_source)
        command_view_source = TOOL.COMMAND_VIEW_SCRIPT_PATH.read_text(
            encoding="utf-8"
        )
        command_host_source = TOOL.COMMAND_HOST_SCRIPT_PATH.read_text(
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
            (
                capture_source.replace(
                    "var button_identity_exact: bool = (",
                    "var button_identity_exact := (",
                    1,
                ),
                command_view_source,
                command_host_source,
                main_source,
            ),
            (
                capture_source.replace(
                    "var screen_transform: Transform2D = "
                    "viewport.get_screen_transform()",
                    "var screen_transform := "
                    "host.get_viewport().get_screen_transform()",
                ),
                command_view_source,
                command_host_source,
                main_source,
            ),
            (
                capture_source.replace(
                    "func _hovered_control_matches_target(",
                    "func _missing_hovered_control_matches_target(",
                    1,
                ),
                command_view_source,
                command_host_source,
                main_source,
            ),
            (
                capture_source.replace(
                    "and visible_attack == button",
                    "and visible_attack != button",
                    1,
                ),
                command_view_source,
                command_host_source,
                main_source,
            ),
            (
                capture_source.replace(
                    "gui_get_hovered_control() as Control",
                    "target_control as Control",
                    1,
                ),
                command_view_source,
                command_host_source,
                main_source,
            ),
            (
                capture_source.replace(
                    'input_probe["hoverMatchesTarget"] = hover_matches',
                    'input_probe["hoverMatchesTarget"] = true',
                    1,
                ),
                command_view_source,
                command_host_source,
                main_source,
            ),
            (
                capture_source.replace(
                    '"viewObserverMode": '
                    '"synchronous_after_preexisting_host"',
                    '"viewObserverMode": "unspecified"',
                    1,
                ),
                command_view_source,
                command_host_source,
                main_source,
            ),
            (
                capture_source.replace(
                    "view_callable,\n\t\tCONNECT_ONE_SHOT",
                    "view_callable,\n\t\tCONNECT_DEFERRED | CONNECT_ONE_SHOT",
                    1,
                ),
                command_view_source,
                command_host_source,
                main_source,
            ),
            (
                capture_source.replace(
                    'probe["downState"] = '
                    '_attack_input_state_snapshot(button, "down")',
                    'host.call("_on_battle_command_pressed", "attack")',
                    1,
                ),
                command_view_source,
                command_host_source,
                main_source,
            ),
            (
                capture_source.replace(
                    'probe.get("_downCallable", Callable())',
                    'probe.get("_viewCallable", Callable())',
                    1,
                ),
                command_view_source,
                command_host_source,
                main_source,
            ),
            (
                capture_source.replace(
                    'return "no_down"',
                    'return "unclassified"',
                    1,
                ),
                command_view_source,
                command_host_source,
                main_source,
            ),
            (
                capture_source.replace(
                    'and bool(snapshot.get("battlePanelPoint", false))',
                    'and bool(snapshot.get("uiPoint", false))',
                    1,
                ),
                command_view_source,
                command_host_source,
                main_source,
            ),
            (
                capture_source.replace(
                    "Input.parse_input_event(press)",
                    "host.get_viewport().push_input(press, true)",
                    1,
                ),
                command_view_source,
                command_host_source,
                main_source,
            ),
            (
                capture_source.replace(
                    "\tawait RenderingServer.frame_post_draw\n",
                    "",
                    1,
                ),
                command_view_source,
                command_host_source,
                main_source,
            ),
            (
                capture_source.replace(
                    release_post_draw_sequence,
                    "await RenderingServer.frame_post_draw\n"
                    "\tInput.parse_input_event(release)\n"
                    "\tawait host.get_tree().process_frame",
                    1,
                ),
                command_view_source,
                command_host_source,
                main_source,
            ),
            (
                capture_source.replace(
                    "await RenderingServer.frame_post_draw",
                    "await RenderingServer.frame_post_draw\n"
                    "\tawait RenderingServer.frame_post_draw",
                    1,
                ),
                command_view_source,
                command_host_source,
                main_source,
            ),
            (
                capture_source.replace(
                    "await RenderingServer.frame_post_draw",
                    "await host.get_tree().create_timer(0.01).timeout",
                    1,
                ),
                command_view_source,
                command_host_source,
                main_source,
            ),
            (
                capture_source.replace(
                    release_post_draw_sequence,
                    "Input.parse_input_event(release)\n"
                    "\tawait RenderingServer.frame_post_draw",
                    1,
                ),
                command_view_source,
                command_host_source,
                main_source,
            ),
            (
                capture_source.replace(
                    'probe["postDrawStateCaptured"] = (\n'
                    "\t\tpost_draw_boundary_reached\n"
                    "\t\tand next_loop_post_draw_boundary_reached\n"
                    "\t)",
                    'probe["postDrawStateCaptured"] = true',
                    1,
                ),
                command_view_source,
                command_host_source,
                main_source,
            ),
            (
                capture_source.replace(
                    'probe["upCount"] = '
                    'int(probe.get("upCount", 0)) + 1',
                    'probe["upCount"] = '
                    'int(probe.get("upCount", 0)) + 1\n'
                    '\tprobe["releaseState"] = '
                    '_attack_input_state_snapshot(_button, "release")',
                    1,
                ),
                command_view_source,
                command_host_source,
                main_source,
            ),
            (
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
                command_view_source,
                command_host_source,
                main_source,
            ),
            (
                capture_source.replace(
                    "var input_position: Vector2 = "
                    "screen_transform * viewport_point",
                    "var input_position: Vector2 = Vector2.ZERO",
                    1,
                ),
                command_view_source,
                command_host_source,
                main_source,
            ),
            (
                capture_source.replace(
                    "var viewport_point := button_rect.get_center()",
                    "var viewport_point := "
                    "button_rect.get_center() + Vector2(1.0, 0.0)",
                    1,
                ),
                command_view_source,
                command_host_source,
                main_source,
            ),
            (
                capture_source.replace(
                    '"inputPosition": _vector_payload('
                    "screen_transform * viewport_point)",
                    '"inputPosition": _vector_payload(viewport_point)',
                    1,
                ),
                command_view_source,
                command_host_source,
                main_source,
            ),
            (
                capture_source.replace(
                    'input_probe["hoveredPath"] = _control_path(hovered)',
                    'input_probe["hoveredPath"] = '
                    '_control_path(target_control)',
                    1,
                ),
                command_view_source,
                command_host_source,
                main_source,
            ),
            (
                capture_source.replace(
                    "button.gui_input.connect(gui_input_callable)",
                    "pass # gui_input observer removed",
                    1,
                ),
                command_view_source,
                command_host_source,
                main_source,
            ),
            (
                capture_source.replace(
                    "button.gui_input.connect(gui_input_callable)",
                    "button.gui_input.connect("
                    "gui_input_callable, CONNECT_DEFERRED)",
                    1,
                ),
                command_view_source,
                command_host_source,
                main_source,
            ),
            (
                capture_source.replace(
                    "button.gui_input.connect(gui_input_callable)",
                    "button.disabled = false\n\t"
                    "button.gui_input.connect(gui_input_callable)",
                    1,
                ),
                command_view_source,
                command_host_source,
                main_source,
            ),
            (
                capture_source.replace(
                    'probe["guiLeftButtonEvents"] = events',
                    'probe["guiLeftButtonEvents"] = events\n\taccept_event()',
                    1,
                ),
                command_view_source,
                command_host_source,
                main_source,
            ),
            (
                capture_source.replace(
                    'probe["guiLeftButtonEvents"] = events',
                    'probe["guiLeftButtonEvents"] = events\n'
                    '\thost.call("_on_battle_command_pressed", "attack")',
                    1,
                ),
                command_view_source,
                command_host_source,
                main_source,
            ),
            (
                capture_source.replace(
                    'probe["upCount"] = '
                    'int(probe.get("upCount", 0)) + 1',
                    'probe["upCount"] = '
                    'int(probe.get("upCount", 0)) + 1\n'
                    '\t_button.disabled = false',
                    1,
                ),
                command_view_source,
                command_host_source,
                main_source,
            ),
            (
                capture_source.replace(
                    'probe.get("_guiInputCallable", Callable())',
                    'probe.get("_downCallable", Callable())',
                    1,
                ),
                command_view_source,
                command_host_source,
                main_source,
            ),
            (
                capture_source.replace(
                    'target_control,\n\t\t"release_sync"',
                    'target_control,\n\t\t"release_process"',
                    1,
                ),
                command_view_source,
                command_host_source,
                main_source,
            ),
            (
                capture_source.replace(
                    '"buttonInstanceId": _control_instance_id(button)',
                    '"buttonInstanceId": 40301',
                    1,
                ),
                command_view_source,
                command_host_source,
                main_source,
            ),
            (
                capture_source.replace(
                    '"inputLeftPressed": '
                    "Input.is_mouse_button_pressed(MOUSE_BUTTON_LEFT)",
                    '"inputLeftPressed": false',
                    1,
                ),
                command_view_source,
                command_host_source,
                main_source,
            ),
            (
                capture_source.replace(
                    'return "release_not_routed"',
                    'return "release_routed_and_button_up"',
                    1,
                ),
                command_view_source,
                command_host_source,
                main_source,
            ),
            (
                capture_source.replace(
                    "var capture_lost: bool = (",
                    "var capture_lost := (",
                    1,
                ),
                command_view_source,
                command_host_source,
                main_source,
            ),
            (
                capture_source.replace(
                    "var capture_lost: bool = (",
                    "var capture_lost = (",
                    1,
                ),
                command_view_source,
                command_host_source,
                main_source,
            ),
            (
                capture_source.replace(
                    '\t\tor not bool(pre_release_stage.get('
                    '"inputLeftPressed", false))\n\t)',
                    '\t\tor not bool(pre_release_stage.get('
                    '"inputLeftPressed", false))\n'
                    '\t\tor int(probe.get("mouseExitedCount", 0)) > 0\n\t)',
                    1,
                ),
                command_view_source,
                command_host_source,
                main_source,
            ),
            (
                capture_source.replace(
                    '\t\tor not bool(pre_release_stage.get('
                    '"inputLeftPressed", false))\n\t)',
                    '\t\tor not bool(pre_release_stage.get('
                    '"inputLeftPressed", false))\n'
                    '\t\tor int(probe["mouseExitedCount"]) > 0\n\t)',
                    1,
                ),
                command_view_source,
                command_host_source,
                main_source,
            ),
            (
                capture_source.replace(
                    '\t\tor not bool(pre_release_stage.get('
                    '"buttonVisible", false))\n',
                    "",
                    1,
                ),
                command_view_source,
                command_host_source,
                main_source,
            ),
            (
                capture_source.replace(
                    '\t\tor not bool(pre_release_stage.get('
                    '"buttonIsHovered", false))',
                    '\t\tor bool(pre_release_stage.get('
                    '"buttonIsHovered", false))',
                    1,
                ),
                command_view_source,
                command_host_source,
                main_source,
            ),
            (
                capture_source.replace(
                    "_attack_input_release_routing_classification(probe)",
                    '"release_routed_and_button_up"',
                    1,
                ),
                command_view_source,
                command_host_source,
                main_source,
            ),
            (
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
                command_view_source,
                command_host_source,
                main_source,
            ),
            (
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
                command_view_source,
                command_host_source,
                main_source,
            ),
            (
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
                command_view_source,
                command_host_source,
                main_source,
            ),
            (
                capture_source.replace(
                    'target_control,\n\t\t\t"release_next_loop_post_draw"',
                    'target_control,\n\t\t\t"release_post_draw"',
                    1,
                ),
                command_view_source,
                command_host_source,
                main_source,
            ),
            (
                capture_source.replace(
                    "Input.parse_input_event(release)",
                    "Input.parse_input_event(release)\n"
                    "\tInput.flush_buffered_events()",
                    1,
                ),
                command_view_source,
                command_host_source,
                main_source,
            ),
            (
                capture_source.replace(
                    "Input.parse_input_event(release)",
                    "Input.use_accumulated_input = false\n"
                    "\tInput.parse_input_event(release)",
                    1,
                ),
                command_view_source,
                command_host_source,
                main_source,
            ),
            (
                capture_source.replace(
                    "Input.parse_input_event(release)",
                    "Input.parse_input_event(release)\n\tpress.emit()",
                    1,
                ),
                command_view_source,
                command_host_source,
                main_source,
            ),
            (
                capture_source.replace(
                    'probe[prefix + "Delivered"] = '
                    "_attack_input_route_stage_delivered(stage)",
                    'probe[prefix + "Delivered"] = true',
                    1,
                ),
                command_view_source,
                command_host_source,
                main_source,
            ),
            (
                capture_source.replace(
                    "_attack_input_gui_left_button_count(probe, false)",
                    "1",
                    1,
                ),
                command_view_source,
                command_host_source,
                main_source,
            ),
            (
                capture_source.replace(
                    "\t\tstages.append(stage_snapshot)",
                    '\t\tstage_snapshot["processFrame"] = 999\n'
                    "\t\tstages.append(stage_snapshot)",
                    1,
                ),
                command_view_source,
                command_host_source,
                main_source,
            ),
            (
                capture_source.replace(
                    "\t\tstages.append(stage_snapshot)",
                    '\t\tstage_snapshot["guiLeftButtonEventCount"] = 2\n'
                    "\t\tstages.append(stage_snapshot)",
                    1,
                ),
                command_view_source,
                command_host_source,
                main_source,
            ),
            (
                capture_source.replace(
                    "\t\tstages.append(stage_snapshot)",
                    '\t\tstage_snapshot["guiLeftButtonReleaseCount"] = 1\n'
                    "\t\tstages.append(stage_snapshot)",
                    1,
                ),
                command_view_source,
                command_host_source,
                main_source,
            ),
            (
                capture_source.replace(
                    "\t\tstages.append(stage_snapshot)",
                    '\t\tstage_snapshot.merge({"processFrame": 999}, true)\n'
                    "\t\tstages.append(stage_snapshot)",
                    1,
                ),
                command_view_source,
                command_host_source,
                main_source,
            ),
            (
                capture_source.replace(
                    "\t\tstages.append(stage_snapshot)",
                    "\t\tstages.append(stage_snapshot.duplicate(true))",
                    1,
                ),
                command_view_source,
                command_host_source,
                main_source,
            ),
            (
                capture_source.replace(
                    "\t\tstage_snapshot.merge(\n",
                    '\t\tgui_events.append({"pressed": false})\n'
                    "\t\tstage_snapshot.merge(\n",
                    1,
                ),
                command_view_source,
                command_host_source,
                main_source,
            ),
            (
                capture_source.replace(
                    "\t\tstage_snapshot.merge(\n",
                    '\t\tprobe["upCount"] = 1\n'
                    "\t\tstage_snapshot.merge(\n",
                    1,
                ),
                command_view_source,
                command_host_source,
                main_source,
            ),
            (
                capture_source.replace(
                    "\t\tstage_snapshot.merge(\n",
                    '\t\t(probe["guiLeftButtonEvents"] as Array).append('
                    '{"pressed": false})\n'
                    "\t\tstage_snapshot.merge(\n",
                    1,
                ),
                command_view_source,
                command_host_source,
                main_source,
            ),
            (
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
                command_view_source,
                command_host_source,
                main_source,
            ),
            (
                capture_source
                + '\nvar duplicate_attack_marker = '
                + '"PHASE403_BATTLE_LAYOUT_ATTACK_INPUT_BEFORE"\n',
                command_view_source,
                command_host_source,
                main_source,
            ),
            (
                capture_source,
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
                capture_source,
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
        )
        for index, sources in enumerate(invalid_attack_contracts):
            with self.subTest(attack_contract_mutation=index):
                with self.assertRaises(
                    TOOL.Phase403BattleLayoutRecordingError
                ):
                    TOOL._require_attack_input_diagnostic_contract(*sources)

    def test_log_accepts_exact_20_actor_hud_and_adjacent_targets(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "godot.log"
            path.write_text(_godot_log(), encoding="utf-8")
            result = TOOL._validate_godot_log(path)
        self.assertEqual(result["layoutIdentity"], TOOL.LAYOUT_IDENTITY)
        self.assertEqual(result["actorCount"], 20)
        self.assertEqual(result["chapterCount"], 5)
        self.assertEqual(
            tuple(result["targetSlots"]),
            ("enemy.front.4", "enemy.front.5"),
        )
        self.assertEqual(result["actualLeftClicks"], 5)
        self.assertEqual(result["crossFramePresses"], 5)
        self.assertEqual(result["hudCollisions"], 0)
        self.assertTrue(result["reviewOnlyMountWidthOnly"])
        self.assertFalse(result["reviewOnlyMountSlotCollisionClaimed"])
        self.assertFalse(result["ordinaryBattleContainsMount"])
        self.assertEqual(result["representativeCharacterVariantCount"], 4)
        self.assertEqual(result["representativePetVariantCount"], 3)
        self.assertFalse(result["singleAssetStressFixture"])
        self.assertEqual(result["petSpriteScaleProfileCount"], 3)
        self.assertEqual(result["crystalWuliSpriteScale"], 1.3)
        self.assertEqual(result["ordinaryActorPresentationScale"], 1.0)
        self.assertEqual(result["contactScale"], 1.0)
        self.assertFalse(result["bossSpriteOverride"])
        self.assertTrue(result["spriteOnlyScale"])
        self.assertEqual(result["arenaVisual"]["id"], "moss_meadow")
        self.assertEqual(
            result["arenaVisual"]["sha256"],
            TOOL.EXPECTED_ARENA_SHA256,
        )
        self.assertFalse(result["arenaVisual"]["runtimeEnabled"])
        self.assertFalse(result["arenaVisual"]["ordinaryPlayerEnabled"])
        self.assertEqual(result["attackInput"]["classification"], "ok")
        self.assertEqual(
            result["attackInput"]["postDrawBoundary"],
            {"sameLoop": True, "nextLoop": True},
        )
        self.assertFalse(
            result["attackInput"]["routing"]["sameLoopDelivered"]
        )
        self.assertTrue(
            result["attackInput"]["routing"]["nextLoopDelivered"]
        )
        self.assertEqual(result["attackInput"]["signals"]["viewAttack"], 1)
        self.assertEqual(
            result["attackInput"]["routing"]["classification"],
            "release_routed_and_button_up",
        )
        self.assertEqual(
            [
                stage["stage"]
                for stage in result["attackInput"]["routing"]["stages"]
            ],
            list(TOOL.EXPECTED_ATTACK_ROUTE_STAGES),
        )
        self.assertTrue(
            result["attackInput"]["routing"]["observersDisconnected"]
        )
        self.assertEqual(
            result["attackInput"]["coordinates"]["viewportPoint"],
            [1220.0, 512.0],
        )
        self.assertTrue(
            result["attackInput"]["productConnectionFlags"]["nonDeferred"]
        )
        same_control_log = _godot_log().replace(
            '"hoveredPath":"/root/Main/HUD/'
            'BattleCommandAwakenedView/Attack/Label"',
            '"hoveredPath":"/root/Main/HUD/'
            'BattleCommandAwakenedView/Attack"',
            1,
        ).replace('"hoveredInstanceId":40302', '"hoveredInstanceId":40301', 1)
        with tempfile.TemporaryDirectory() as temp_dir:
            same_control_path = Path(temp_dir) / "same-control.log"
            same_control_path.write_text(same_control_log, encoding="utf-8")
            same_control_result = TOOL._validate_godot_log(same_control_path)
        self.assertEqual(
            same_control_result["attackInput"]["hoveredPath"],
            "/root/Main/HUD/BattleCommandAwakenedView/Attack",
        )
        _, current_after = _attack_marker_lines()
        _, delivered_after = _attack_marker_lines(same_loop_delivered=True)
        delivered_same_loop_log = _godot_log().replace(
            current_after,
            delivered_after,
            1,
        )
        with tempfile.TemporaryDirectory() as temp_dir:
            delivered_path = Path(temp_dir) / "same-loop-delivered.log"
            delivered_path.write_text(delivered_same_loop_log, encoding="utf-8")
            delivered_result = TOOL._validate_godot_log(delivered_path)
        self.assertTrue(
            delivered_result["attackInput"]["routing"]["sameLoopDelivered"]
        )
        self.assertTrue(
            delivered_result["attackInput"]["routing"]["nextLoopDelivered"]
        )
        final_hover_present_log = _godot_log().replace(
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
            final_hover_result["attackInput"]["routing"]["nextLoopDelivered"]
        )

    def test_log_rejects_duplicate_plain_and_recursive_json_fields(self) -> None:
        normal_payload = {
            "message": "two words",
            "items": ["marker", {"state": "ok"}],
        }
        parsed = TOOL._parse_attack_input_json(
            TOOL.ATTACK_INPUT_BEFORE_MARKER
            + " "
            + json.dumps(
                normal_payload,
                ensure_ascii=False,
                separators=(",", ":"),
            ),
            TOOL.ATTACK_INPUT_BEFORE_MARKER,
        )
        self.assertEqual(parsed, normal_payload)

        base = _godot_log()
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
                TOOL.ATTACK_INPUT_BEFORE_MARKER + ' {"stage":"before"',
                TOOL.ATTACK_INPUT_BEFORE_MARKER
                + ' {"state":"wrong","state":"ignored","stage":"before"',
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
            base.replace(
                '"guiLeftButtonEvents":[{"pressed":true',
                '"guiLeftButtonEvents":[{"classification":"wrong",'
                '"classification":"ignored","pressed":true',
                1,
            ),
        )
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "duplicate-fields.log"
            for index, text in enumerate(invalid_logs):
                with self.subTest(index=index):
                    self.assertNotEqual(text, base)
                    path.write_text(text, encoding="utf-8")
                    with self.assertRaises(
                        TOOL.Phase403BattleLayoutRecordingError
                    ):
                        TOOL._validate_godot_log(path)

    def test_log_rejects_false_or_misleading_evidence(self) -> None:
        invalid_replacements = (
            ("entry=MainSceneFlag", "entry=SceneTreeScript"),
            ("actors=20", "actors=19"),
            ("origin=94x340.4", "origin=128x338.4"),
            ("character_name_chars=24", "character_name_chars=23"),
            ("character_variants=4", "character_variants=1"),
            ("pet_variants=3", "pet_variants=1"),
            ("pet_sprite_profiles=3", "pet_sprite_profiles=2"),
            (
                "crystal_wuli_sprite_scale=1.30",
                "crystal_wuli_sprite_scale=1.00",
            ),
            (
                "ordinary_actor_presentation_scale=1.00",
                "ordinary_actor_presentation_scale=1.30",
            ),
            ("contact_scale=1.00", "contact_scale=1.30"),
            ("boss_sprite_override=false", "boss_sprite_override=true"),
            ("sprite_only=true", "sprite_only=false"),
            (
                "representative_runtime_mix=true",
                "representative_runtime_mix=false",
            ),
            ("single_asset_stress=false", "single_asset_stress=true"),
            (
                "maximum_label_stress_preserved=true",
                "maximum_label_stress_preserved=false",
            ),
            ("pet_lifecycle=approved", "pet_lifecycle=owner_review_pending"),
            ("runtime_frame=256x256", "source_frame=256x256"),
            ("source_image_frame=512x512", "source_image_frame=256x256"),
            ("resolved=enemy_front_4", "resolved=enemy_front_5"),
            ("slot=enemy.front.5", "slot=enemy.front.4"),
            ("adjacent_distance=80.00", "adjacent_distance=76.00"),
            ("hud_passthrough=0", "hud_passthrough=1"),
            ("cross_frame_presses=5", "cross_frame_presses=4"),
            ("player_visible=false", "player_visible=true"),
            ("ordinary_battle=false", "ordinary_battle=true"),
            ("width_covered=true", "width_covered=false"),
            ("width_covered=true", "width_covered=true collisions=0"),
            ("vertical_recomputed=false", "vertical_recomputed=true"),
            (
                "slot_collisions_recomputed=false",
                "slot_collisions_recomputed=true",
            ),
            ("elapsed_wall=15.200", "elapsed_wall=nan"),
            ("elapsed_wall=15.200", "elapsed_wall=-1.000"),
            ("seconds=2.500", "seconds=nan"),
            ("seconds=2.500", "seconds=-2.500"),
            (
                "inserted_into_battle_state=false",
                "inserted_into_battle_state=true",
            ),
            ("owner_review=pending", "owner_review=approved"),
            ("runtime_enabled=false", "runtime_enabled=true"),
            (
                "ordinary_player_enabled=false",
                "ordinary_player_enabled=true",
            ),
            ("baked_actors=false", "baked_actors=true"),
            (
                f"sha256={TOOL.EXPECTED_ARENA_SHA256}",
                "sha256=" + "0" * 64,
            ),
        )
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "godot.log"
            for old, new in invalid_replacements:
                with self.subTest(old=old, new=new):
                    path.write_text(
                        _godot_log().replace(old, new, 1),
                        encoding="utf-8",
                    )
                    with self.assertRaises(
                        TOOL.Phase403BattleLayoutRecordingError
                    ):
                        TOOL._validate_godot_log(path)
            for forbidden in (
                "SCRIPT ERROR: broken\n",
                "WARNING: degraded\n",
                "Phase402 candidate image\n",
            ):
                path.write_text(forbidden + _godot_log(), encoding="utf-8")
                with self.assertRaises(TOOL.Phase403BattleLayoutRecordingError):
                    TOOL._validate_godot_log(path)
            for marker in (
                TOOL.START_MARKER,
                TOOL.FIXTURE_MARKER,
                TOOL.LAYOUT_MARKER,
                TOOL.REVIEW_ONLY_MARKER,
                TOOL.ARENA_MARKER,
                TOOL.END_MARKER,
                TOOL.ATTACK_INPUT_BEFORE_MARKER,
                TOOL.ATTACK_INPUT_AFTER_MARKER,
            ):
                marker_line = next(
                    line
                    for line in _godot_log().splitlines()
                    if line.startswith(marker + " ")
                )
                path.write_text(
                    _godot_log() + marker_line + "\n",
                    encoding="utf-8",
                )
                with self.assertRaises(TOOL.Phase403BattleLayoutRecordingError):
                    TOOL._validate_godot_log(path)
            diagnostic_replacements = (
                ('"classification":"ok"', '"classification":"no_down"'),
                ('"hoverMatchesTarget":true', '"hoverMatchesTarget":false'),
                ('"downCount":1', '"downCount":0'),
                ('"viewAttackCount":1', '"viewAttackCount":0'),
                (
                    '"postDrawBoundaryReached":true',
                    '"postDrawBoundaryReached":false',
                ),
                (
                    '"nextLoopPostDrawBoundaryReached":true',
                    '"nextLoopPostDrawBoundaryReached":false',
                ),
                (
                    '"postDrawStateCaptured":true',
                    '"postDrawStateCaptured":false',
                ),
                ('"sameLoopDelivered":false', '"sameLoopDelivered":true'),
                ('"nextLoopDelivered":true', '"nextLoopDelivered":false'),
                ('"sameLoopProcessFrame":102', '"sameLoopProcessFrame":101'),
                ('"nextLoopProcessFrame":103', '"nextLoopProcessFrame":102'),
                (
                    '"sameLoopGuiLeftButtonEventCount":1',
                    '"sameLoopGuiLeftButtonEventCount":2',
                ),
                (
                    '"nextLoopGuiLeftButtonReleaseCount":1',
                    '"nextLoopGuiLeftButtonReleaseCount":0',
                ),
                ('"cleanupOk":true', '"cleanupOk":false'),
                ('"buttonIdentityExact":true', '"buttonIdentityExact":false'),
                ('"battlePanelPoint":true', '"battlePanelPoint":false'),
                ('"owner":"player"', '"owner":"pet"'),
                (
                    '"productButtonConnectionFlags":[0]',
                    '"productButtonConnectionFlags":[1]',
                ),
                (
                    '"viewportPoint":[1220.0,512.0]',
                    '"viewportPoint":[1221.0,512.0]',
                ),
                (
                    '"inputPosition":[1220.0,512.0]',
                    '"inputPosition":[0.0,0.0]',
                ),
                (
                    '"screenTransform":[1.0,0.0,0.0,1.0,0.0,0.0]',
                    '"screenTransform":[2.0,0.0,0.0,2.0,10.0,20.0]',
                ),
                (
                    '"clickViewportPoint":[1220.0,512.0]',
                    '"clickViewportPoint":[1219.0,512.0]',
                ),
                (
                    '"clickInputPosition":[1220.0,512.0]',
                    '"clickInputPosition":[1219.0,512.0]',
                ),
                (
                    '"hoveredPath":"/root/Main/HUD/'
                    'BattleCommandAwakenedView/Attack/Label"',
                    '"hoveredPath":"/root/Main/HUD/Unrelated"',
                ),
                (
                    '"releaseRoutingClassification":'
                    '"release_routed_and_button_up"',
                    '"releaseRoutingClassification":"release_not_routed"',
                ),
                (
                    '"releaseRoutingClassification":'
                    '"release_routed_and_button_up"',
                    '"releaseRoutingClassification":'
                    '"release_routed_but_basebutton_not_up"',
                ),
                (
                    '"releaseRoutingClassification":'
                    '"release_routed_and_button_up"',
                    '"releaseRoutingClassification":'
                    '"capture_lost_before_release"',
                ),
                (
                    '"observerSignalsDisconnected":true',
                    '"observerSignalsDisconnected":false',
                ),
                ('"mouseExitedCount":1', '"mouseExitedCount":-1'),
                (
                    '"pressed":true,"buttonIndex":1,"buttonMask":1',
                    '"pressed":true,"buttonIndex":1,"buttonMask":0',
                ),
                (
                    '"pressed":false,"buttonIndex":1,"buttonMask":0',
                    '"pressed":false,"buttonIndex":1,"buttonMask":1',
                ),
                (
                    '"pressed":false,"buttonIndex":1',
                    '"pressed":true,"buttonIndex":1',
                ),
                ('"stage":"release_sync"', '"stage":"release_process"'),
                (
                    '"buttonParentInstanceId":40300',
                    '"buttonParentInstanceId":40399',
                ),
                (
                    '"stage":"press_sync","processFrame":100,"buttonPath":'
                    '"/root/Main/HUD/BattleCommandAwakenedView/Attack",'
                    '"buttonInstanceId":40301',
                    '"stage":"press_sync","processFrame":100,"buttonPath":'
                    '"/root/Main/HUD/BattleCommandAwakenedView/Attack",'
                    '"buttonInstanceId":40399',
                ),
                (
                    '"buttonParentInstanceId":40300,'
                    '"buttonGlobalRect":[1186.0,476.0,68.0,72.0]',
                    '"buttonParentInstanceId":40300,'
                    '"buttonGlobalRect":[1187.0,476.0,68.0,72.0]',
                ),
                (
                    '"inputLeftPressed":true',
                    '"inputLeftPressed":false',
                ),
                (
                    '"buttonPressed":true',
                    '"buttonPressed":false',
                ),
                (
                    '"globalPosition":[1220.0,512.0]',
                    '"globalPosition":[1219.0,512.0]',
                ),
                (
                    '"viewportHoveredPath":'
                    '"/root/Main/HUD/BattleCommandAwakenedView/Attack/Label"',
                    '"viewportHoveredPath":"/root/Main/HUD/Unrelated"',
                ),
                (
                    ',{"pressed":false,"buttonIndex":1,"buttonMask":0,'
                    '"position":[34.0,36.0],'
                    '"globalPosition":[1220.0,512.0]}',
                    '',
                ),
                (
                    _attack_route_stage_json("release_sync", True),
                    _attack_route_stage_json(
                        "release_sync",
                        True,
                        buttonPressed=False,
                    ),
                ),
                (
                    _attack_route_stage_json("pre_release", True),
                    _attack_route_stage_json(
                        "pre_release",
                        True,
                        buttonIsHovered=False,
                    ),
                ),
                (
                    _attack_route_stage_json("release_process", True),
                    _attack_route_stage_json(
                        "release_process",
                        True,
                        inputLeftPressed=False,
                    ),
                ),
                (
                    _attack_route_stage_json("release_post_draw", True),
                    _attack_route_stage_json(
                        "release_post_draw",
                        True,
                        buttonVisible=False,
                    ),
                ),
                (
                    _attack_route_stage_json("release_process", True),
                    _attack_route_stage_json(
                        "release_process",
                        True,
                        buttonDisabled=True,
                    ),
                ),
                (
                    _attack_route_stage_json("release_post_draw", True),
                    _attack_route_stage_json(
                        "release_post_draw",
                        True,
                        buttonIsHovered=False,
                    ),
                ),
                (
                    _attack_route_stage_json(
                        "release_next_loop_post_draw",
                        False,
                    ),
                    _attack_route_stage_json(
                        "release_next_loop_post_draw",
                        False,
                        buttonIsHovered=True,
                    ),
                ),
                (
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
                ),
                (
                    _attack_route_stage_json(
                        "release_next_loop_post_draw",
                        False,
                    ),
                    _attack_route_stage_json(
                        "release_next_loop_post_draw",
                        False,
                        upCount=0,
                    ),
                ),
                (
                    _attack_route_stage_json(
                        "release_next_loop_post_draw",
                        False,
                    ),
                    _attack_route_stage_json(
                        "release_next_loop_post_draw",
                        False,
                        buttonVisible=False,
                    ),
                ),
                (
                    _attack_route_stage_json(
                        "release_next_loop_post_draw",
                        False,
                    ),
                    _attack_route_stage_json(
                        "release_next_loop_post_draw",
                        False,
                        inputLeftPressed=True,
                    ),
                ),
                (
                    _attack_route_stage_json(
                        "release_next_loop_post_draw",
                        False,
                    ),
                    _attack_route_stage_json(
                        "release_next_loop_post_draw",
                        False,
                        guiLeftButtonReleaseCount=0,
                    ),
                ),
            )
            for old, new in diagnostic_replacements:
                path.write_text(
                    _godot_log().replace(old, new, 1),
                    encoding="utf-8",
                )
                with self.assertRaises(TOOL.Phase403BattleLayoutRecordingError):
                    TOOL._validate_godot_log(path)
            synchronized_frame_forgery_logs = (
                _godot_log()
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
                _godot_log()
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
            )
            for invalid_log in synchronized_frame_forgery_logs:
                path.write_text(invalid_log, encoding="utf-8")
                with self.assertRaises(TOOL.Phase403BattleLayoutRecordingError):
                    TOOL._validate_godot_log(path)
            same_path_wrong_instance = _godot_log().replace(
                '"hoveredPath":"/root/Main/HUD/'
                'BattleCommandAwakenedView/Attack/Label"',
                '"hoveredPath":"/root/Main/HUD/'
                'BattleCommandAwakenedView/Attack"',
                1,
            )
            path.write_text(same_path_wrong_instance, encoding="utf-8")
            with self.assertRaises(TOOL.Phase403BattleLayoutRecordingError):
                TOOL._validate_godot_log(path)
            for marker in (
                TOOL.ATTACK_INPUT_BEFORE_MARKER,
                TOOL.ATTACK_INPUT_AFTER_MARKER,
            ):
                missing = "\n".join(
                    line
                    for line in _godot_log().splitlines()
                    if not line.startswith(marker + " ")
                ) + "\n"
                path.write_text(missing, encoding="utf-8")
                with self.assertRaises(TOOL.Phase403BattleLayoutRecordingError):
                    TOOL._validate_godot_log(path)
            before_line, after_line = _attack_marker_lines()
            swapped = _godot_log().replace(
                before_line + "\n" + after_line,
                after_line + "\n" + before_line,
                1,
            )
            path.write_text(swapped, encoding="utf-8")
            with self.assertRaises(TOOL.Phase403BattleLayoutRecordingError):
                TOOL._validate_godot_log(path)

    def test_native_log_uses_same_business_gate_without_movie_claim(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "native.log"
            native_log = "\n".join(
                line
                for line in _godot_log().splitlines()
                if not line.startswith("Movie Maker mode enabled")
            ) + "\n"
            path.write_text(native_log, encoding="utf-8")
            result = TOOL._validate_godot_log(
                path,
                require_movie_maker=False,
            )
            self.assertEqual(result["status"], "passed")
            with self.assertRaises(TOOL.Phase403BattleLayoutRecordingError):
                TOOL._validate_godot_log(path)
            path.write_text(_godot_log(), encoding="utf-8")
            with self.assertRaises(TOOL.Phase403BattleLayoutRecordingError):
                TOOL._validate_godot_log(
                    path,
                    require_movie_maker=False,
                )

    def test_final_summary_precedes_atomic_manifest_without_core_record_rewrite(self) -> None:
        source = TOOL_PATH.read_text(encoding="utf-8")
        record_into = source[
            source.index("def _record_into("):
            source.index("def _write_failure_summary(")
        ]
        self.assertNotIn("CORE._record(", record_into)
        self.assertNotIn("--user-data-dir", record_into)
        self.assertEqual(
            record_into.count("CORE._run_official_lane_godot_sequence("),
            1,
        )
        summary_write = record_into.index("CORE._write_json(summary_path, summary)")
        passed_print = record_into.rindex("print(")
        manifest_commit = record_into.index(
            "CORE._write_sha256_manifest(run_dir, hash_paths)"
        )
        self.assertLess(summary_write, passed_print)
        self.assertLess(passed_print, manifest_commit)
        self.assertIn("flush=True", record_into)

    def test_residual_and_verify_failures_publish_failure_authority(self) -> None:
        evidence_root = REPO_ROOT / ".run" / "evidence"
        evidence_root.mkdir(parents=True, exist_ok=True)
        for reason in (
            "native_process_group_residual",
            "native_verify_failed",
        ):
            with self.subTest(reason=reason), tempfile.TemporaryDirectory(
                dir=evidence_root
            ) as output_directory:
                args = argparse.Namespace(
                    run_id=f"owner-{reason}",
                    output_root=Path(output_directory),
                    sample_count=2,
                    sample_times=None,
                    godot="godot",
                    ffmpeg="ffmpeg",
                    ffprobe="ffprobe",
                    timeout_seconds=1.0,
                )

                def fail_after_lane_authority(
                    *,
                    run_id: str,
                    run_dir: Path,
                    **_kwargs: object,
                ) -> Path:
                    TOOL.CORE._write_json(
                        run_dir / "qa-lane-lifecycle.json",
                        {
                            "status": "preserved",
                            "qaLanePreserved": True,
                            "lanePreservationReason": reason,
                        },
                    )
                    raise TOOL.CORE.GodotLanePreservationError(
                        reason,
                        reason=reason,
                        evidence={"runId": run_id},
                    )

                with mock.patch.object(
                    TOOL,
                    "_require_main_flag_wiring",
                    return_value=None,
                ), mock.patch.object(
                    TOOL,
                    "_record_into",
                    side_effect=fail_after_lane_authority,
                ):
                    with self.assertRaises(TOOL.CORE.GodotLanePreservationError):
                        TOOL._record(args)
                run_dir = Path(output_directory) / args.run_id
                failure = json.loads(
                    (run_dir / "failure-summary.json").read_text(
                        encoding="utf-8"
                    )
                )
                self.assertEqual(failure["status"], "failed")
                self.assertTrue(failure["finalStatusAuthority"])
                self.assertTrue(failure["qaLane"]["qaLanePreserved"])
                self.assertEqual(
                    failure["qaLane"]["lanePreservationReason"],
                    reason,
                )
                manifest = (run_dir / "SHA256SUMS").read_text(
                    encoding="utf-8"
                )
                self.assertIn("failure-summary.json", manifest)
                self.assertIn("qa-lane-lifecycle.json", manifest)

    def test_trusted_product_failure_retains_cleanup_and_specific_error(self) -> None:
        evidence_root = REPO_ROOT / ".run" / "evidence"
        evidence_root.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=evidence_root) as output_directory:
            args = argparse.Namespace(
                run_id="owner-trusted-product-failure",
                output_root=Path(output_directory),
                sample_count=2,
                sample_times=None,
                godot="godot",
                ffmpeg="ffmpeg",
                ffprobe="ffprobe",
                timeout_seconds=1.0,
            )

            def fail_after_trusted_cleanup(
                *,
                run_dir: Path,
                **_kwargs: object,
            ) -> Path:
                TOOL.CORE._write_json(
                    run_dir / "qa-lane-lifecycle.json",
                    {
                        "status": "cleaned_after_trusted_product_failure",
                        "qaLanePreserved": False,
                        "lanePreservationReason": None,
                        "cleanup": {"status": "cleaned"},
                        "postCleanupInspect": {"status": "inspected"},
                    },
                )
                raise TOOL.Phase403BattleLayoutRecordingError(
                    "Phase403 native chapter target count mismatch"
                )

            with mock.patch.object(
                TOOL,
                "_require_main_flag_wiring",
                return_value=None,
            ), mock.patch.object(
                TOOL,
                "_record_into",
                side_effect=fail_after_trusted_cleanup,
            ):
                with self.assertRaisesRegex(
                    TOOL.Phase403BattleLayoutRecordingError,
                    "target count mismatch",
                ):
                    TOOL._record(args)
            run_dir = Path(output_directory) / args.run_id
            failure = json.loads(
                (run_dir / "failure-summary.json").read_text(encoding="utf-8")
            )
            self.assertFalse(failure["qaLane"]["qaLanePreserved"])
            self.assertEqual(failure["qaLane"]["cleanup"]["status"], "cleaned")
            self.assertIn("target count mismatch", failure["error"])

    def test_manifest_commit_failure_is_superseded_by_failure_authority(self) -> None:
        evidence_root = REPO_ROOT / ".run" / "evidence"
        evidence_root.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=evidence_root) as output_directory:
            args = argparse.Namespace(
                run_id="owner-manifest-failure",
                output_root=Path(output_directory),
                sample_count=2,
                sample_times=None,
                godot="godot",
                ffmpeg="ffmpeg",
                ffprobe="ffprobe",
                timeout_seconds=1.0,
            )
            original_manifest = TOOL.CORE._write_sha256_manifest
            manifest_calls = 0

            def flaky_manifest(run_dir: Path, paths: list[Path]) -> Path:
                nonlocal manifest_calls
                manifest_calls += 1
                if manifest_calls == 1:
                    raise OSError("owner manifest atomic commit failed")
                return original_manifest(run_dir, paths)

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
                TOOL.CORE._write_sha256_manifest(run_dir, [summary_path])
                return summary_path

            with mock.patch.object(
                TOOL,
                "_require_main_flag_wiring",
                return_value=None,
            ), mock.patch.object(
                TOOL,
                "_record_into",
                side_effect=fail_at_manifest,
            ), mock.patch.object(
                TOOL.CORE,
                "_write_sha256_manifest",
                side_effect=flaky_manifest,
            ):
                with self.assertRaisesRegex(OSError, "atomic commit failed"):
                    TOOL._record(args)
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

    def test_summary_contract_never_claims_mount_as_ordinary_battle(self) -> None:
        contract = TOOL._phase403_capture_contract()
        self.assertEqual(contract["actorCount"], 20)
        self.assertEqual(contract["persistentHudCollisions"], 0)
        self.assertTrue(contract["reviewOnlyMountWidthOnly"])
        self.assertFalse(contract["reviewOnlyMountSlotCollisionClaimed"])
        self.assertFalse(contract["ordinaryBattleContainsMount"])
        self.assertEqual(
            contract["representativeCharacterAppearances"],
            [
                "novice_hunter_v1",
                "obsidian_scout_v1",
                "frost_whisper_v1",
                "ember_spark_v1",
            ],
        )
        self.assertEqual(
            contract["representativePetForms"],
            [
                "bui_novice_sprout_earth5_wind5",
                "driftfox_evolved_moon_gale_wind7_water3",
                "wuli_evolved_crystal_earth8_water2",
            ],
        )
        self.assertFalse(contract["singleAssetStressFixture"])
        self.assertEqual(
            contract["petSpriteScaleCatalog"],
            "client/godot/data/pet_battle_sprite_scales.json",
        )
        self.assertEqual(
            contract["petSpriteScaleApplicationMode"],
            "ordinary_formal_pet_sprite_only",
        )
        self.assertEqual(contract["crystalWuliSpriteScale"], 1.3)
        self.assertFalse(contract["authoritativeGeometryChanged"])
        self.assertEqual(contract["arenaVisual"]["id"], "moss_meadow")
        self.assertEqual(
            contract["arenaVisual"]["ownerReviewStatus"],
            "pending",
        )
        self.assertFalse(contract["arenaVisual"]["runtimeEnabled"])
        self.assertFalse(contract["arenaVisual"]["ordinaryPlayerEnabled"])
        self.assertEqual(
            contract["exactAdjacentTargetSlots"],
            ["enemy.front.4", "enemy.front.5"],
        )


if __name__ == "__main__":
    unittest.main()
