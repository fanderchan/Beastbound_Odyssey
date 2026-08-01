#!/usr/bin/env python3
"""Focused tests for record_player_character_owner_review.py."""

from __future__ import annotations

import importlib.util
import tempfile
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
TOOL_PATH = REPO_ROOT / "tools" / "record_player_character_owner_review.py"
SPEC = importlib.util.spec_from_file_location(
    "record_player_character_owner_review",
    TOOL_PATH,
)
assert SPEC is not None and SPEC.loader is not None
TOOL = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(TOOL)


def _probe(
    *,
    duration: float = 32.0,
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
        "world": 2.0,
        "attributes": 3.5,
        "stat_page": 2.0,
        "stat_draft": 2.0,
        "stat_undo": 1.8,
        "stat_reset": 1.5,
        "stat_final_draft": 1.8,
        "stat_confirmed": 3.5,
        "ride_all": 3.5,
        "ride_species_menu": 3.0,
        "ride_species_filtered": 3.5,
        "return_world": 2.5,
    }
    lines = [
        "PLAYER_CHARACTER_OWNER_REVIEW_START scene=Main.tscn "
        "viewport=1280x720 fps=30 speed=1.00x "
        "profile=isolated backend=false profile_save=false",
        "PLAYER_CHARACTER_OWNER_REVIEW_ISOLATION scene=Main.tscn "
        "profile=isolated backend=false profile_save=false "
        "entry=right_bottom x=1190.0 y=680.0",
        "PLAYER_CHARACTER_OWNER_REVIEW_ATTRIBUTES "
        "opened=true equipment_slots=9 player=焰芽斗士",
    ]
    for chapter in TOOL.EXPECTED_CHAPTERS:
        seconds = durations[chapter]
        lines.append(
            "PLAYER_CHARACTER_OWNER_REVIEW_CHAPTER "
            f"chapter={chapter} frame={round(seconds * 30)} "
            f"seconds={seconds:.3f} speed=1.00x"
        )
        if chapter == "stat_confirmed":
            lines.append(
                "PLAYER_CHARACTER_OWNER_REVIEW_STATS "
                "draft=true undo=true reset=true confirmed=true "
                "points_before=4 points_after=1 hp_gain=4 "
                "attack_gain=1 defense_gain=1 profile_save=false"
            )
        elif chapter == "ride_all":
            lines.append(
                "PLAYER_CHARACTER_OWNER_REVIEW_RIDES "
                "filter=all real_forms=3 fake_forms=0"
            )
        elif chapter == "ride_species_filtered":
            lines.append(
                "PLAYER_CHARACTER_OWNER_REVIEW_RIDES "
                "filter=line:tiger species_menu=true visible_forms=1"
            )
    lines.append(
        "PLAYER_CHARACTER_OWNER_REVIEW_END elapsed_wall=31.200 "
        "scene=Main.tscn viewport=1280x720 fps=30 speed=1.00x "
        "profile=isolated backend=false profile_save=false "
        "entry=right_bottom stats_confirmed=true "
        "real_ride_forms=3 species_filter=true return_world=true"
    )
    return "\n".join(lines) + "\n"


class RecordPlayerCharacterOwnerReviewTest(unittest.TestCase):
    def test_command_uses_main_1280x720_30fps_one_x_and_isolated_flag(
        self,
    ) -> None:
        command = TOOL._build_godot_command(
            godot="/opt/godot",
            user_data_dir=Path("/tmp/player-character-review-user"),
            avi_path=Path("/tmp/player-character-review.avi"),
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
        with self.assertRaises(TOOL.PlayerCharacterRecordingError):
            TOOL._build_godot_command(
                godot="/opt/godot",
                user_data_dir=Path("/tmp/player-character-review-user"),
                avi_path=Path("/tmp/player-character-review.avi"),
                review_args=("--auto-auth-server-live-check",),
            )

    def test_probe_requires_audio_30fps_and_25_to_45_seconds(self) -> None:
        metadata = TOOL._validate_probe(_probe())
        self.assertEqual(metadata["durationSeconds"], 32.0)
        self.assertEqual(metadata["fps"], 30.0)
        for probe in (
            _probe(duration=24.9),
            _probe(duration=45.1),
            _probe(fps="60/1"),
            _probe(audio_codec="pcm_s16le"),
            _probe(sample_rate="44100"),
            _probe(channels=1),
            _probe(audio_duration=31.5),
        ):
            with self.subTest(probe=probe):
                with self.assertRaises(TOOL.PlayerCharacterRecordingError):
                    TOOL._validate_probe(probe)

    def test_log_requires_ordered_real_flow_and_no_fake_rides(self) -> None:
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
            self.assertTrue(result["realWorldEntryClicked"])
            self.assertEqual(result["equipmentSlotCount"], 9)
            self.assertTrue(result["draftUndoResetConfirmed"])
            self.assertEqual(result["remainingStatPoints"], 1)
            self.assertEqual(result["realRideFormCount"], 3)
            self.assertEqual(result["fakeRideFormCount"], 0)
            self.assertTrue(result["speciesFilterReviewed"])
            self.assertTrue(result["returnedToWorld"])

            invalid_values = (
                (
                    "profile=isolated backend=false profile_save=false",
                    "profile=normal backend=true profile_save=true",
                ),
                ("equipment_slots=9", "equipment_slots=6"),
                ("stats_confirmed=true", "stats_confirmed=false"),
                ("real_forms=3 fake_forms=0", "real_forms=9 fake_forms=6"),
                ("species_filter=true", "species_filter=false"),
                ("return_world=true", "return_world=false"),
                ("speed=1.00x", "speed=2.00x"),
            )
            for old, new in invalid_values:
                with self.subTest(old=old):
                    log_path.write_text(
                        _godot_log().replace(old, new),
                        encoding="utf-8",
                    )
                    with self.assertRaises(
                        TOOL.PlayerCharacterRecordingError
                    ):
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
        self.assertIn(
            "phase381_player_character_owner_review",
            source,
        )
        self.assertIn(
            "beastbound_player_character_main_owner_review_video",
            source,
        )


if __name__ == "__main__":
    unittest.main()
