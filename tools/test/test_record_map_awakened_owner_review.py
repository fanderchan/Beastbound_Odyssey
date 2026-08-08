#!/usr/bin/env python3
"""Focused tests for the Phase399 real-Main map recorder."""

from __future__ import annotations

import importlib.util
import tempfile
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
TOOL_PATH = REPO_ROOT / "tools" / "record_map_awakened_owner_review.py"
CAPTURE_PATH = (
    REPO_ROOT
    / "client"
    / "godot"
    / "scripts"
    / "qa"
    / "map_awakened_owner_review_capture.gd"
)
SPEC = importlib.util.spec_from_file_location(
    "record_map_awakened_owner_review",
    TOOL_PATH,
)
assert SPEC is not None and SPEC.loader is not None
TOOL = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(TOOL)


def _probe(
    *,
    duration: float = 25.0,
    fps: str = "30/1",
    video_codec: str = "h264",
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
                "codec_name": video_codec,
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
            "PHASE399_MAP_OWNER_REVIEW_START scene=Main.tscn "
            "entry=MainSceneFlag viewport=1280x720 fps=30 speed=1.00x "
            "profile=isolated backend=false profile_save=false http=false"
        ),
        (
            "PHASE399_MAP_OWNER_REVIEW_HUD map_entry=true "
            "formal_world_hud=true battle=false"
        ),
        (
            "PHASE399_MAP_OWNER_REVIEW_LOCAL fullscreen=true local_mode=true "
            "prepared_visual=true target_list=true"
        ),
        (
            "PHASE399_MAP_OWNER_REVIEW_LOCAL_ROUTE real_click=true "
            "panel_closed=true pending_interaction=true target_cell=true"
        ),
        (
            "PHASE399_MAP_OWNER_REVIEW_WORLD world_mode=true atlas=true "
            "regions=9 prepared_visual=true"
        ),
        (
            "PHASE399_MAP_OWNER_REVIEW_REGION selected=shadow_oath_cavern "
            "entry_route=true floor_route=true"
        ),
        (
            "PHASE399_MAP_OWNER_REVIEW_CROSS_ROUTE route_path=true "
            "continuation=true panel_closed=true "
            "destination=shadow_oath_cavern_f2"
        ),
        (
            "PHASE399_MAP_OWNER_REVIEW_RESTORE panel_closed=true "
            "formal_world_hud=true map_entry=true action_bar=true"
        ),
        (
            "PHASE399_MAP_OWNER_REVIEW_BATTLE battle_active=true "
            "map_entry_hidden=true panel_hidden=true audio=true"
        ),
    ]
    movie_frames = (60, 132, 222, 297, 390, 477, 558, 633)
    for (chapter, seconds), movie_frame in zip(
        TOOL.EXPECTED_CHAPTERS,
        movie_frames,
    ):
        lines.append(
            "PHASE399_MAP_OWNER_REVIEW_CHAPTER "
            f"chapter={chapter} frame={round(seconds * 30)} "
            f"seconds={seconds:.3f} speed=1.00x movie_frame={movie_frame}"
        )
    lines.append(
        "PHASE399_MAP_OWNER_REVIEW_END elapsed_wall=21.500 "
        "scene=Main.tscn entry=MainSceneFlag completed=true "
        "fullscreen_local=true prepared_visual=true local_route=true "
        "world_atlas=true regions=9 region_route=true route_path=true "
        "continuation=true route_closes_panel=true hud_restored=true "
        "battle_map_hidden=true audio=true backend=false profile_save=false "
        "server_writes=0 actual_left_clicks=6 cross_frame_presses=6"
    )
    return "\n".join(lines) + "\n"


class RecordMapAwakenedOwnerReviewTest(unittest.TestCase):
    def test_command_uses_real_main_scene_flag_and_never_script_entry(
        self,
    ) -> None:
        command = TOOL._build_godot_command(
            godot="/opt/godot",
            user_data_dir=Path("/tmp/phase399-map-user"),
            avi_path=Path("/tmp/phase399-map.avi"),
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
        self.assertIn("--user-data-dir", engine)
        self.assertIn("1280x720", engine)
        self.assertEqual(engine[engine.index("--fixed-fps") + 1], "30")
        self.assertEqual(engine[engine.index("--time-scale") + 1], "1.0")
        self.assertIn("--write-movie", engine)
        self.assertIn(TOOL.DEFAULT_CAPTURE_FLAG, user)
        with self.assertRaises(TOOL.Phase399MapRecordingError):
            TOOL._build_godot_command(
                godot="/opt/godot",
                user_data_dir=Path("/tmp/phase399-map-user"),
                avi_path=Path("/tmp/phase399-map.avi"),
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
                with self.assertRaises(TOOL.Phase399MapRecordingError):
                    TOOL._require_main_flag_wiring()
                main_path.write_text(
                    "\n".join(
                        (
                            "extends Node",
                            f'const CAPTURE := preload("{TOOL.CAPTURE_SCRIPT}")',
                            "var flag = MapAwakenedOwnerReviewCapture.is_flag('--capture')",
                            "func _run_map_awakened_owner_review_capture(): pass",
                        )
                    ),
                    encoding="utf-8",
                )
                TOOL._require_main_flag_wiring()
        finally:
            TOOL.MAIN_SCRIPT_PATH = original

    def test_probe_requires_h264_aac_audio_and_bounded_duration(self) -> None:
        metadata = TOOL._validate_probe(_probe())
        self.assertEqual(metadata["durationSeconds"], 25.0)
        self.assertEqual(metadata["fps"], 30.0)
        self.assertEqual(metadata["videoCodec"], "h264")
        self.assertEqual(metadata["audioCodec"], "aac")
        for probe in (
            _probe(duration=19.9),
            _probe(duration=30.1),
            _probe(fps="60/1"),
            _probe(video_codec="vp9"),
            _probe(audio_codec="pcm_s16le"),
            _probe(sample_rate="44100"),
            _probe(channels=1),
            _probe(audio_duration=24.5),
            _probe(frame_count=100),
        ):
            with self.subTest(probe=probe):
                with self.assertRaises(TOOL.Phase399MapRecordingError):
                    TOOL._validate_probe(probe)

    def test_log_hard_gates_complete_map_flow_and_timeline(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            log_path = Path(temp_dir) / "godot.log"
            log_path.write_text(_godot_log(), encoding="utf-8")
            result = TOOL._validate_godot_log(log_path)
            self.assertEqual(
                result["chapterCount"],
                len(TOOL.EXPECTED_CHAPTERS),
            )
            self.assertEqual(result["entryMode"], "MainSceneFlag")
            self.assertEqual(result["worldRegionCount"], 9)
            self.assertEqual(result["actualLeftClicks"], 6)
            self.assertEqual(result["crossFramePresses"], 6)
            for key in (
                "formalWorldHudMapEntry",
                "fullScreenLocalMap",
                "preparedLocalVisual",
                "localTargetRealClick",
                "worldAtlasVisual",
                "worldRegionRealClick",
                "crossMapRoutePath",
                "crossMapContinuation",
                "successfulRouteClosesPanel",
                "worldHudRestored",
                "battleMapEntryHidden",
            ):
                self.assertTrue(result[key], key)
            comparison_times = TOOL._comparison_sample_times(result, 25.0)
            self.assertEqual(len(comparison_times), 3)
            self.assertEqual(tuple(sorted(comparison_times)), comparison_times)

            invalid_values = (
                ("entry=MainSceneFlag", "entry=SceneTreeScript"),
                ("prepared_visual=true", "prepared_visual=false"),
                ("regions=9", "regions=8"),
                ("route_path=true", "route_path=false"),
                ("continuation=true", "continuation=false"),
                ("map_entry_hidden=true", "map_entry_hidden=false"),
                ("actual_left_clicks=6", "actual_left_clicks=5"),
                ("movie_frame=297", "movie_frame=200"),
            )
            for old, new in invalid_values:
                with self.subTest(old=old, new=new):
                    log_path.write_text(
                        _godot_log().replace(old, new, 1),
                        encoding="utf-8",
                    )
                    with self.assertRaises(TOOL.Phase399MapRecordingError):
                        TOOL._validate_godot_log(log_path)
            for forbidden in (
                "SCRIPT ERROR: broken\n",
                "WARNING: degraded\n",
                "ObjectDB instances were leaked at exit\n",
            ):
                log_path.write_text(
                    forbidden + _godot_log(),
                    encoding="utf-8",
                )
                with self.assertRaises(TOOL.Phase399MapRecordingError):
                    TOOL._validate_godot_log(log_path)

    def test_reference_inputs_are_copied_into_run_scope(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            source = root / "source"
            comparison = root / "comparison"
            source.mkdir()
            comparison.mkdir()
            for filename in TOOL.REFERENCE_FILENAMES:
                (source / filename).write_bytes(b"reference")
            copied = TOOL._copy_reference_inputs(source, comparison)
            self.assertEqual(len(copied), 3)
            self.assertTrue(all(path.is_file() for path in copied))
            self.assertTrue(
                all(path.parent.name == "reference" for path in copied)
            )

    def test_summary_contract_and_artifact_surface_are_strict(self) -> None:
        contract = dict(TOOL.SUMMARY_TRUTH_CONTRACT)
        summary = {
            "captureContract": contract,
            "godotSequence": {"status": "passed"},
            "referenceVsImplementation": {
                "status": "passed",
                "rowCount": 3,
            },
        }
        self.assertIs(TOOL._validate_summary_contract(summary), summary)
        for key in contract:
            broken = {
                **summary,
                "captureContract": {**contract, key: None},
            }
            with self.subTest(key=key):
                with self.assertRaises(TOOL.Phase399MapRecordingError):
                    TOOL._validate_summary_contract(broken)

        tool_source = TOOL_PATH.read_text(encoding="utf-8")
        capture_source = CAPTURE_PATH.read_text(encoding="utf-8")
        for needle in (
            '"map-awakened-owner-review-1x.mp4"',
            '"contact-sheet.png"',
            '"reference-vs-implementation.png"',
            '"comparison-manifest.json"',
            '"ownerReviewStatus": "pending"',
            '"-xerror"',
            "CORE._write_sha256_manifest",
        ):
            self.assertIn(needle, tool_source)
        for needle in (
            "Input.parse_input_event",
            "world_tab_button",
            "world_region_button",
            "world_route_button",
            "world_entry_route_button",
            "uses_prepared_visual",
            "EXPECTED_WORLD_REGION_COUNT := 9",
            "battle_map_entry_hidden",
        ):
            self.assertIn(needle, capture_source)


if __name__ == "__main__":
    unittest.main()
