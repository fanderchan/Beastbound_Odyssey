#!/usr/bin/env python3
"""Focused tests for record_world_hud_owner_review.py."""

from __future__ import annotations

import importlib.util
import tempfile
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
TOOL_PATH = REPO_ROOT / "tools" / "record_world_hud_owner_review.py"
SPEC = importlib.util.spec_from_file_location(
    "record_world_hud_owner_review",
    TOOL_PATH,
)
assert SPEC is not None and SPEC.loader is not None
TOOL = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(TOOL)


def _probe(
    *,
    duration: float = 45.0,
    fps: str = "30/1",
    audio_codec: str = "aac",
    audio_duration: float | None = None,
    sample_rate: str = "48000",
    channels: int = 2,
) -> dict:
    frame_count = str(round(duration * 30))
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
                "nb_read_frames": frame_count,
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
    durations = {
        "world_hud_complete": 3.0,
        "top_map_hud": 2.0,
        "map_panel": 3.0,
        "character_entry": 2.2,
        "backpack_entry": 2.2,
        "pet_entry": 2.2,
        "task_tab": 3.0,
        "party_tab": 3.0,
        "chat_open": 3.5,
        "chat_closed": 1.8,
        "more_drawer": 3.5,
        "hud_collapsed_restore_only": 3.5,
        "hud_expanded": 3.0,
        "world_move": 4.0,
    }
    lines = [
        "WORLD_HUD_OWNER_REVIEW_START scene=Main.tscn "
        "viewport=1280x720 fps=30 speed=1.00x "
        "profile=isolated backend=false profile_save=false",
        "WORLD_HUD_OWNER_REVIEW_ISOLATION scene=Main.tscn "
        "profile=isolated backend=false profile_save=false "
        "fresh_user_dir=true",
        "WORLD_HUD_OWNER_REVIEW_LAYERS complete=true top=true "
        "map=true action=true",
        "WORLD_HUD_OWNER_REVIEW_ENTRIES character=true backpack=true "
        "pet=true real_clicks=true",
        "WORLD_HUD_OWNER_REVIEW_TASK_PARTY reviewed=true task=true "
        "party=true",
        "WORLD_HUD_OWNER_REVIEW_CHAT opened=true closed=true offline=true",
        "WORLD_HUD_OWNER_REVIEW_MORE opened=true drawer_visible=true",
        "WORLD_HUD_OWNER_REVIEW_COLLAPSE restore_only=true expanded=true",
        "WORLD_HUD_OWNER_REVIEW_MOVE real_click=true moved=true "
        "frame_separated=true",
    ]
    for chapter in TOOL.EXPECTED_CHAPTERS:
        seconds = durations[chapter]
        lines.append(
            "WORLD_HUD_OWNER_REVIEW_CHAPTER "
            f"chapter={chapter} frame={round(seconds * 30)} "
            f"seconds={seconds:.3f} speed=1.00x"
        )
    lines.append(
        "WORLD_HUD_OWNER_REVIEW_END elapsed_wall=44.800 "
        "scene=Main.tscn viewport=1280x720 fps=30 speed=1.00x "
        "profile=isolated backend=false profile_save=false "
        "complete_hud=true map=true entries=true task_party=true chat=true "
        "more=true restore_only=true expanded=true moved=true"
    )
    return "\n".join(lines) + "\n"


class RecordWorldHudOwnerReviewTest(unittest.TestCase):
    def test_command_uses_main_1280x720_30fps_one_x_and_isolated_flag(
        self,
    ) -> None:
        command = TOOL._build_godot_command(
            godot="/opt/godot",
            user_data_dir=Path("/tmp/world-hud-review-user"),
            avi_path=Path("/tmp/world-hud-review.avi"),
        )
        separator = command.index("--")
        engine = command[:separator]
        user = command[separator + 1 :]
        self.assertIn("--scene", engine)
        self.assertIn(TOOL.MAIN_SCENE, engine)
        self.assertIn("--user-data-dir", engine)
        self.assertIn("1280x720", engine)
        self.assertEqual(engine[engine.index("--fixed-fps") + 1], "30")
        self.assertEqual(engine[engine.index("--time-scale") + 1], "1.0")
        self.assertIn("--write-movie", engine)
        self.assertIn(TOOL.DEFAULT_CAPTURE_FLAG, user)
        with self.assertRaises(TOOL.WorldHudRecordingError):
            TOOL._build_godot_command(
                godot="/opt/godot",
                user_data_dir=Path("/tmp/world-hud-review-user"),
                avi_path=Path("/tmp/world-hud-review.avi"),
                review_args=("--auto-auth-server-live-check",),
            )
        with self.assertRaises(TOOL.WorldHudRecordingError):
            TOOL._build_godot_command(
                godot="/opt/godot",
                user_data_dir=Path("/tmp/world-hud-review-user"),
                avi_path=Path("/tmp/world-hud-review.avi"),
                capture_flag="--different-capture",
            )

    def test_probe_requires_audio_30fps_and_38_to_60_seconds(self) -> None:
        metadata = TOOL._validate_probe(_probe())
        self.assertEqual(metadata["durationSeconds"], 45.0)
        self.assertEqual(metadata["fps"], 30.0)
        for probe in (
            _probe(duration=37.9),
            _probe(duration=60.1),
            _probe(fps="60/1"),
            _probe(audio_codec="pcm_s16le"),
            _probe(sample_rate="44100"),
            _probe(channels=1),
            _probe(audio_duration=44.5),
        ):
            with self.subTest(probe=probe):
                with self.assertRaises(TOOL.WorldHudRecordingError):
                    TOOL._validate_probe(probe)

    def test_log_requires_ordered_complete_real_world_flow(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            log_path = Path(temp_dir) / "godot.log"
            log_path.write_text(_godot_log(), encoding="utf-8")
            result = TOOL._validate_godot_log(log_path)
            self.assertEqual(
                result["chapterCount"], len(TOOL.EXPECTED_CHAPTERS)
            )
            self.assertTrue(result["profileIsolated"])
            self.assertFalse(result["backendConnected"])
            self.assertFalse(result["profileSaveEnabled"])
            self.assertTrue(result["completeHudReviewed"])
            self.assertTrue(result["mapReviewed"])
            self.assertTrue(result["realEntryClicks"])
            self.assertTrue(result["taskPartyReviewed"])
            self.assertTrue(result["chatReviewedOffline"])
            self.assertTrue(result["moreDrawerReviewed"])
            self.assertTrue(result["restoreOnlyCollapsedState"])
            self.assertTrue(result["expandedAgain"])
            self.assertTrue(result["realWorldMove"])

            invalid_values = (
                (
                    "profile=isolated backend=false profile_save=false",
                    "profile=normal backend=true profile_save=true",
                ),
                ("complete=true top=true", "complete=false top=false"),
                ("character=true backpack=true", "character=false backpack=false"),
                ("reviewed=true task=true", "reviewed=false task=false"),
                ("opened=true closed=true offline=true", "opened=false closed=false offline=false"),
                ("opened=true drawer_visible=true", "opened=false drawer_visible=false"),
                ("restore_only=true expanded=true", "restore_only=false expanded=false"),
                ("real_click=true moved=true", "real_click=false moved=false"),
                ("speed=1.00x", "speed=2.00x"),
            )
            for old, new in invalid_values:
                with self.subTest(old=old):
                    log_path.write_text(
                        _godot_log().replace(old, new),
                        encoding="utf-8",
                    )
                    with self.assertRaises(TOOL.WorldHudRecordingError):
                        TOOL._validate_godot_log(log_path)

    def test_transcode_decode_evidence_and_owner_gate_exist(self) -> None:
        source = TOOL_PATH.read_text(encoding="utf-8")
        self.assertIn(
            '"scale=in_range=pc:out_range=tv,format=yuv420p"',
            source,
        )
        self.assertIn('"-color_range"', source)
        self.assertIn('"-xerror"', source)
        self.assertIn('"contact-sheet.png"', source)
        self.assertIn("_write_sha256_manifest", source)
        self.assertIn('"ownerReviewStatus": "pending"', source)
        self.assertIn("phase382_world_hud_owner_review", source)
        self.assertIn(
            "beastbound_world_hud_main_owner_review_video",
            source,
        )


if __name__ == "__main__":
    unittest.main()
