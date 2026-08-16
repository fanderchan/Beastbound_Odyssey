#!/usr/bin/env python3
"""Focused tests for the Phase395 real-Main matchmaking recorder."""

from __future__ import annotations

import importlib.util
import tempfile
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
TOOL_PATH = (
    REPO_ROOT / "tools" / "record_hang_matchmaking_world_hud_owner_review.py"
)
CAPTURE_PATH = (
    REPO_ROOT
    / "client"
    / "godot"
    / "scripts"
    / "qa"
    / "hang_matchmaking_world_hud_owner_review_capture.gd"
)
SPEC = importlib.util.spec_from_file_location(
    "record_hang_matchmaking_world_hud_owner_review",
    TOOL_PATH,
)
assert SPEC is not None and SPEC.loader is not None
TOOL = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(TOOL)


def _probe(
    *,
    duration: float = 24.0,
    fps: str = "30/1",
    audio_codec: str = "aac",
    audio_duration: float | None = None,
    sample_rate: str = "48000",
    channels: int = 2,
    frame_count: int | None = None,
) -> dict:
    resolved_frames = (
        round(duration * 30) if frame_count is None else frame_count
    )
    resolved_audio_duration = (
        duration if audio_duration is None else audio_duration
    )
    return {
        "streams": [
            {
                "codec_type": "video",
                "codec_name": "h264",
                "pix_fmt": "yuv420p",
                "width": 1280,
                "height": 720,
                "r_frame_rate": fps,
                "avg_frame_rate": fps,
                "nb_read_frames": str(resolved_frames),
                "duration": str(duration),
            },
            {
                "codec_type": "audio",
                "codec_name": audio_codec,
                "sample_rate": sample_rate,
                "channels": channels,
                "duration": str(resolved_audio_duration),
            },
        ],
        "format": {"duration": str(duration)},
    }


def _godot_log() -> str:
    lines = [
        "Metal 4.0 - Forward Mobile - Using Device #0: Apple",
        "Movie Maker mode enabled, recording movie in 1280x720 @ 30 FPS...",
        (
            "PHASE395_WORLD_PARTY_OWNER_REVIEW_START scene=Main.tscn "
            "entry=MainSceneFlag viewport=1280x720 fps=30 speed=1.00x "
            "profile=isolated backend=false profile_save=false "
            "state_source=deterministic_injected_controller http=false"
        ),
        (
            "PHASE395_WORLD_PARTY_OWNER_REVIEW_HUD "
            "awakened_mounted=true action_bar=true dock=true "
            "fixed_entries=true"
        ),
        (
            "PHASE395_WORLD_PARTY_OWNER_REVIEW_ROUTE fullscreen=true "
            "route_cards=true selected_current=true real_click=true"
        ),
        (
            "PHASE395_WORLD_PARTY_OWNER_REVIEW_CHOICE immediate=true "
            "matchmaking=true fullscreen=true"
        ),
        (
            "PHASE395_WORLD_PARTY_OWNER_REVIEW_IDLE_EMPTY_PARTY "
            "idle_empty_no_fake_human=true"
        ),
        (
            "PHASE395_WORLD_PARTY_OWNER_REVIEW_ACTIVE_EMPTY_PARTY "
            "active_empty_authoritative=true stale_ordinary_ignored=true "
            "human=1 npc=4"
        ),
        (
            "PHASE395_WORLD_PARTY_OWNER_REVIEW_FULL_EMPTY_PARTY "
            "full_empty_authoritative=true stale_ordinary_ignored=true "
            "syncing_humans=5"
        ),
        (
            "PHASE395_WORLD_PARTY_OWNER_REVIEW_PRODUCTION_PARTY "
            "offline_filtered=true pending_neutral=true "
            "team_snapshot_level=true"
        ),
        (
            "PHASE395_WORLD_PARTY_OWNER_REVIEW_TRUTH_GATES "
            "idleEmptyTruth=true activeEmptyTruth=true fullEmptyTruth=true "
            "productionPartyTruth=true fullscreenProductionTruth=true"
        ),
        (
            "PHASE395_WORLD_PARTY_OWNER_REVIEW_MATCH panel_closed=true "
            "world_visible=true human=1 npc=0 empty=4 hang_active=true"
        ),
        (
            "PHASE395_WORLD_PARTY_OWNER_REVIEW_NPC_FILL human=1 npc=4 "
            "empty=0 explicit_npc_names=true server_ai=true "
            "neutral_npc_portraits=true authority_shape=true"
        ),
        (
            "PHASE395_WORLD_PARTY_OWNER_REVIEW_REPLACEMENT human=2 npc=3 "
            "next_match_replacement_visible=true"
        ),
        (
            "PHASE395_WORLD_PARTY_OWNER_REVIEW_TABS task_real_click=true "
            "party_real_click=true roster_instance_stable=true"
        ),
        (
            "PHASE395_WORLD_PARTY_OWNER_REVIEW_CANCEL match_active=false "
            "hang_active=true full_bottom_hud=true"
        ),
        (
            "PHASE395_WORLD_PARTY_OWNER_REVIEW_STOP_ENTRY fullscreen=true "
            "visible_stop=true real_entry_click=true"
        ),
        (
            "PHASE395_WORLD_PARTY_OWNER_REVIEW_STOPPED hang_active=false "
            "panel_closed=true full_bottom_hud=true"
        ),
    ]
    for chapter, seconds in TOOL.EXPECTED_CHAPTERS:
        lines.append(
            "PHASE395_WORLD_PARTY_OWNER_REVIEW_CHAPTER "
            f"chapter={chapter} frame={round(seconds * 30)} "
            f"seconds={seconds:.3f} speed=1.00x"
        )
    lines.append(
        "PHASE395_WORLD_PARTY_OWNER_REVIEW_END elapsed_wall=21.200 "
        "scene=Main.tscn entry=MainSceneFlag completed=true "
        "awakened_hud_mounted=true bottom_hud_persistent=true "
        "route_choice=true one_human_four_empty=true "
        "one_human_four_npc=true two_human_three_npc=true "
        "next_match_replacement=true "
        "idle_empty_no_fake_human=true active_empty_authoritative=true "
        "full_empty_authoritative=true production_party_authority=true "
        "fullscreen_production_truth=true "
        "task_party_real_click=true "
        "cancel_kept_hang=true stopped_hang=true right_party_tab=true "
        "five_slots=true legacy_ui_hidden=true backend=false "
        "profile_save=false server_writes=0 actual_left_clicks=9 "
        "cross_frame_presses=9"
    )
    return "\n".join(lines) + "\n"


class RecordHangMatchmakingWorldHudOwnerReviewTest(unittest.TestCase):
    def test_command_uses_real_main_scene_flag_and_never_script_entry(
        self,
    ) -> None:
        command = TOOL._build_godot_command(
            godot="/opt/godot",
            avi_path=Path("/tmp/phase395-world-party.avi"),
        )
        separator = command.index("--")
        engine = command[:separator]
        user = command[separator + 1 :]
        self.assertIn("--scene", engine)
        self.assertEqual(
            engine[engine.index("--scene") + 1],
            TOOL.MAIN_SCENE,
        )
        self.assertNotIn("--script", engine)
        self.assertNotIn("--user-data-dir", command)
        self.assertIn("1280x720", engine)
        self.assertEqual(engine[engine.index("--fixed-fps") + 1], "30")
        self.assertEqual(engine[engine.index("--time-scale") + 1], "1.0")
        self.assertIn("--write-movie", engine)
        self.assertIn(TOOL.DEFAULT_CAPTURE_FLAG, user)
        self.assertEqual(command.count(TOOL.CORE.QA_LANE_ARGUMENT), 1)
        native = TOOL._build_native_godot_command(godot="/opt/godot")
        self.assertIn("--scene", native)
        self.assertNotIn("--script", native)
        self.assertNotIn("--user-data-dir", native)
        self.assertNotIn("--write-movie", native)
        self.assertEqual(native.count(TOOL.CORE.QA_LANE_ARGUMENT), 1)
        with self.assertRaises(TOOL.Phase395WorldPartyRecordingError):
            TOOL._build_godot_command(
                godot="/opt/godot",
                avi_path=Path("/tmp/phase395-world-party.avi"),
                review_args=("--auto-auth-server-live-check",),
            )

    def test_recorder_fails_closed_until_main_flag_and_capture_are_wired(
        self,
    ) -> None:
        original = TOOL.MAIN_SCRIPT_PATH
        try:
            with tempfile.TemporaryDirectory() as temp_dir:
                main_path = Path(temp_dir) / "main.gd"
                TOOL.MAIN_SCRIPT_PATH = main_path
                main_path.write_text("extends Node\n", encoding="utf-8")
                with self.assertRaises(
                    TOOL.Phase395WorldPartyRecordingError
                ):
                    TOOL._require_main_flag_wiring()
                main_path.write_text(
                    "\n".join(
                        (
                            "extends Node",
                            f'const FLAG := "{TOOL.DEFAULT_CAPTURE_FLAG}"',
                            f'const CAPTURE := preload("{TOOL.CAPTURE_SCRIPT}")',
                        )
                    ),
                    encoding="utf-8",
                )
                TOOL._require_main_flag_wiring()
        finally:
            TOOL.MAIN_SCRIPT_PATH = original

    def test_probe_requires_audio_30fps_and_bounded_duration(self) -> None:
        metadata = TOOL._validate_probe(_probe())
        self.assertEqual(metadata["durationSeconds"], 24.0)
        self.assertEqual(metadata["fps"], 30.0)
        for probe in (
            _probe(duration=16.9),
            _probe(duration=35.1),
            _probe(fps="60/1"),
            _probe(audio_codec="pcm_s16le"),
            _probe(sample_rate="44100"),
            _probe(channels=1),
            _probe(audio_duration=23.5),
            _probe(frame_count=100),
        ):
            with self.subTest(probe=probe):
                with self.assertRaises(
                    TOOL.Phase395WorldPartyRecordingError
                ):
                    TOOL._validate_probe(probe)

    def test_log_hard_gates_complete_world_matchmaking_flow(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            log_path = Path(temp_dir) / "godot.log"
            log_path.write_text(_godot_log(), encoding="utf-8")
            result = TOOL._validate_godot_log(log_path)
            self.assertEqual(
                result["chapterCount"], len(TOOL.EXPECTED_CHAPTERS)
            )
            self.assertEqual(result["entryMode"], "MainSceneFlag")
            for key in (
                "awakenedHudMounted",
                "bottomHudPersistent",
                "rightPartyTab",
                "fiveSlots",
                "legacyUiHidden",
                "routeChoice",
                "idleEmptyNoFakeHuman",
                "activeEmptyAuthoritative",
                "activeEmptyStaleOrdinaryIgnored",
                "fullEmptyAuthoritative",
                "fullEmptyStaleOrdinaryIgnored",
                "productionOfflineFiltered",
                "productionPendingNeutral",
                "productionTeamSnapshotLevel",
                "fullscreenProductionTruth",
                "oneHumanFourEmpty",
                "oneHumanFourNpc",
                "neutralNpcPortraits",
                "twoHumanThreeNpc",
                "nextMatchReplacement",
                "taskPartyRealClicks",
                "cancelKeptHang",
                "stoppedHang",
                "deterministicController",
            ):
                self.assertTrue(result[key], key)
            self.assertEqual(result["serverWrites"], 0)
            self.assertEqual(result["fullEmptySyncingHumans"], 5)
            self.assertEqual(result["actualLeftClicks"], 9)
            self.assertEqual(result["crossFramePresses"], 9)

            invalid_values = (
                ("entry=MainSceneFlag", "entry=SceneTreeScript"),
                ("awakened_mounted=true", "awakened_mounted=false"),
                ("action_bar=true", "action_bar=false"),
                ("fixed_entries=true", "fixed_entries=false"),
                ("route_cards=true", "route_cards=false"),
                (
                    "idle_empty_no_fake_human=true",
                    "idle_empty_no_fake_human=false",
                ),
                (
                    "active_empty_authoritative=true",
                    "active_empty_authoritative=false",
                ),
                (
                    "full_empty_authoritative=true",
                    "full_empty_authoritative=false",
                ),
                (
                    "production_party_authority=true",
                    "production_party_authority=false",
                ),
                (
                    "fullscreenProductionTruth=true",
                    "fullscreenProductionTruth=false",
                ),
                (
                    "fullscreen_production_truth=true",
                    "fullscreen_production_truth=false",
                ),
                ("panel_closed=true", "panel_closed=false"),
                ("explicit_npc_names=true", "explicit_npc_names=false"),
                (
                    "next_match_replacement_visible=true",
                    "next_match_replacement_visible=false",
                ),
                ("task_real_click=true", "task_real_click=false"),
                ("match_active=false", "match_active=true"),
                ("visible_stop=true", "visible_stop=false"),
                ("stopped_hang=true", "stopped_hang=false"),
                ("legacy_ui_hidden=true", "legacy_ui_hidden=false"),
                (
                    "bottom_hud_persistent=true",
                    "bottom_hud_persistent=false",
                ),
                ("server_writes=0", "server_writes=1"),
                ("actual_left_clicks=9", "actual_left_clicks=8"),
                ("cross_frame_presses=9", "cross_frame_presses=8"),
                ("completed=true", "completed=false"),
            )
            for old, new in invalid_values:
                with self.subTest(old=old):
                    log_path.write_text(
                        _godot_log().replace(old, new),
                        encoding="utf-8",
                    )
                    with self.assertRaises(
                        TOOL.Phase395WorldPartyRecordingError
                    ):
                        TOOL._validate_godot_log(log_path)
            marker_prefixes = (
                "PHASE395_WORLD_PARTY_OWNER_REVIEW_IDLE_EMPTY_PARTY",
                "PHASE395_WORLD_PARTY_OWNER_REVIEW_ACTIVE_EMPTY_PARTY",
                "PHASE395_WORLD_PARTY_OWNER_REVIEW_FULL_EMPTY_PARTY",
                "PHASE395_WORLD_PARTY_OWNER_REVIEW_PRODUCTION_PARTY",
                "PHASE395_WORLD_PARTY_OWNER_REVIEW_TRUTH_GATES",
            )
            for marker_prefix in marker_prefixes:
                with self.subTest(missing_marker=marker_prefix):
                    log_path.write_text(
                        "\n".join(
                            line
                            for line in _godot_log().splitlines()
                            if not line.startswith(marker_prefix)
                        )
                        + "\n",
                        encoding="utf-8",
                    )
                    with self.assertRaises(
                        TOOL.Phase395WorldPartyRecordingError
                    ):
                        TOOL._validate_godot_log(log_path)
            log_path.write_text(
                TOOL.FAILURE_MARKER + " blocked\n" + _godot_log(),
                encoding="utf-8",
            )
            with self.assertRaises(TOOL.Phase395WorldPartyRecordingError):
                TOOL._validate_godot_log(log_path)
            for leak_marker in (
                "WARNING: 4 ObjectDB instances were leaked at exit",
                "ERROR: 2 resources still in use at exit",
                "WARNING: unrelated warning must also fail",
                "ERROR: unrelated error must also fail",
            ):
                with self.subTest(leak_marker=leak_marker):
                    log_path.write_text(
                        _godot_log() + leak_marker + "\n",
                        encoding="utf-8",
                    )
                    with self.assertRaises(
                        TOOL.Phase395WorldPartyRecordingError
                    ):
                        TOOL._validate_godot_log(log_path)

    def test_summary_truth_contract_fails_when_any_gate_is_missing(
        self,
    ) -> None:
        summary = {
            "captureContract": dict(TOOL.SUMMARY_TRUTH_CONTRACT),
            "godotSequence": dict(TOOL.SUMMARY_GODOT_TRUTH_CONTRACT),
        }
        self.assertIs(TOOL._validate_summary_contract(summary), summary)
        for section, contract in (
            ("captureContract", TOOL.SUMMARY_TRUTH_CONTRACT),
            ("godotSequence", TOOL.SUMMARY_GODOT_TRUTH_CONTRACT),
        ):
            for key in contract:
                with self.subTest(section=section, missing=key):
                    invalid = {
                        "captureContract": dict(
                            TOOL.SUMMARY_TRUTH_CONTRACT
                        ),
                        "godotSequence": dict(
                            TOOL.SUMMARY_GODOT_TRUTH_CONTRACT
                        ),
                    }
                    invalid[section].pop(key)
                    with self.assertRaises(
                        TOOL.Phase395WorldPartyRecordingError
                    ):
                        TOOL._validate_summary_contract(invalid)

    def test_capture_is_host_injected_and_hard_asserts_formal_nodes(
        self,
    ) -> None:
        source = TOOL_PATH.read_text(encoding="utf-8")
        capture = CAPTURE_PATH.read_text(encoding="utf-8")
        self.assertEqual(
            TOOL.REPORT_TYPE,
            "beastbound_phase395_world_party_main_owner_review_video",
        )
        self.assertEqual(
            TOOL.DEFAULT_OUTPUT_ROOT.as_posix(),
            ".run/evidence/phase395_hang_matchmaking_world_hud_owner_review",
        )
        self.assertIn("extends RefCounted", capture)
        self.assertNotIn("extends SceneTree", capture)
        self.assertNotIn('preload("res://scenes/Main.tscn")', capture)
        self.assertNotIn("MAIN_SCENE.instantiate", capture)
        self.assertIn("host.get_tree().current_scene", capture)
        self.assertIn("entry=MainSceneFlag", capture)
        for node_name in (
            "WorldHudDockSurface",
            "WorldHudFixedEntries",
            "WorldHudPartyRosterShell",
            "WorldHudPartyTaskTab",
            "WorldHudPartyTeamTab",
            "WorldHudPartyMember5",
            "HangMatchStopButton",
        ):
            self.assertIn(f'"{node_name}"', capture)
        self.assertIn('int(_roster.call("slot_count")) != 5', capture)
        self.assertIn("_assert_legacy_ui_hidden", capture)
        self.assertIn("_install_deterministic_controller_bridge", capture)
        self.assertIn("_matching_state(3, 1, 4)", capture)
        self.assertIn("_matching_state(4, 2, 3)", capture)
        self.assertIn("_run_authority_projection_hard_gates", capture)
        self.assertIn("_idle_empty_party_state(1)", capture)
        self.assertIn("_active_empty_party_state(2)", capture)
        self.assertIn("_full_empty_party_state(3)", capture)
        self.assertIn("_production_party_state(4)", capture)
        self.assertIn("_ordinary_stale_party_state", capture)
        self.assertIn("_assert_fullscreen_production_party_truth", capture)
        self.assertIn("fullscreenProductionTruth=true", capture)
        self.assertIn('"teamSnapshot"', capture)
        self.assertIn('"level": 37', capture)
        self.assertIn('"level": 1', capture)
        self.assertIn('"detailsPending": true', capture)
        self.assertIn('"online": false', capture)
        self.assertIn('"队友信息同步中"', capture)
        self.assertIn('"资料同步中"', capture)
        npc_block = capture[
            capture.index("var npc_names") : capture.index(
                "\treturn {", capture.index("var npc_names")
            )
        ]
        self.assertNotIn('"appearanceId"', npc_block)
        self.assertIn("_assert_neutral_npc_portraits", capture)
        self.assertIn("NEUTRAL_PARTY_PORTRAIT_PATH", capture)
        self.assertIn('"下一场替换"', capture)
        self.assertIn('"cancelled"', capture)
        self.assertIn('"profile_save_enabled", false', capture)
        self.assertIn("server_writes=0", capture)
        self.assertIn("Input.parse_input_event", capture)
        self.assertIn("await _release_capture_audio_runtime()", capture)
        self.assertIn('audio_manager.call("stop_all")', capture)
        self.assertIn("player.stream = null", capture)
        self.assertLess(
            capture.index("await _release_capture_audio_runtime()"),
            capture.index(
                '"PHASE395_WORLD_PARTY_OWNER_REVIEW_END elapsed_wall=%.3f "'
            ),
        )
        self.assertIn(
            '"scale=in_range=pc:out_range=tv,format=yuv420p"', source
        )
        self.assertIn('"contact-sheet.png"', source)
        self.assertIn("CORE._write_sha256_manifest", source)
        self.assertIn('"ownerReviewStatus": "pending"', source)
        self.assertIn("_validate_summary_contract(summary)", source)


if __name__ == "__main__":
    unittest.main()
