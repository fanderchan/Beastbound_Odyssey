#!/usr/bin/env python3
"""Focused tests for record_character_entry_owner_review.py."""

from __future__ import annotations

import importlib.util
import tempfile
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
TOOL_PATH = REPO_ROOT / "tools" / "record_character_entry_owner_review.py"
SPEC = importlib.util.spec_from_file_location(
    "record_character_entry_owner_review",
    TOOL_PATH,
)
assert SPEC is not None and SPEC.loader is not None
TOOL = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(TOOL)


def _probe(
    *,
    duration: float = 24.5,
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
        "four_empty_slots": 1.5,
        "creation_configuration_open": 1.0,
        "appearance_novice_hunter_v1": 0.7,
        "appearance_obsidian_scout_v1": 0.7,
        "appearance_frost_whisper_v1": 0.7,
        "appearance_ember_spark_v1": 0.7,
        "remaining_point_blocks_creation": 0.8,
        "legal_dual_elements_earth_green": 1.4,
        "name_row_inside_board_earth_green": 1.5,
        "random_name_1_allowed": 0.8,
        "random_name_2_allowed": 0.8,
        "random_name_3_allowed": 0.8,
        "restricted_name_rejected": 2.0,
        "random_name_recovered": 0.8,
        "typed_name_ready": 1.0,
        "create_payload_captured": 0.7,
        "authoritative_created_slot": 2.4,
    }
    lines = []
    for chapter in TOOL.EXPECTED_CHAPTERS:
        seconds = durations[chapter]
        lines.append(
            "CHARACTER_ENTRY_OWNER_REVIEW_CHAPTER "
            f"chapter={chapter} frame={round(seconds * 30)} "
            f"seconds={seconds:.3f} speed=1.00x"
        )
    lines.append(
        "CHARACTER_ENTRY_OWNER_REVIEW_LAYOUT "
        "name_row=inside_board button=inside_board overlap=false "
        "earth=green"
    )
    lines.extend(
        [
            "CHARACTER_ENTRY_OWNER_REVIEW_RANDOM "
            "index=1 name=山岚 nonempty=true changed=true allowed=true",
            "CHARACTER_ENTRY_OWNER_REVIEW_RANDOM "
            "index=2 name=潮歌 nonempty=true changed=true allowed=true",
            "CHARACTER_ENTRY_OWNER_REVIEW_RANDOM "
            "index=3 name=霜羽 nonempty=true changed=true allowed=true",
        ]
    )
    lines.append(
        "CHARACTER_ENTRY_OWNER_REVIEW_RESTRICTED "
        "input=obfuscated policy=blocked error=generic submit=disabled"
    )
    lines.append(
        "CHARACTER_ENTRY_OWNER_REVIEW_RECOVERY "
        "random_name=林芽 allowed=true submit=enabled"
    )
    lines.append(
        "CHARACTER_ENTRY_OWNER_REVIEW_PAYLOAD slot=0 name=林岚 "
        "appearance=ember_spark_v1 earth=6 water=4 fire=0 wind=0 "
        "scene=Main.tscn backend=false"
    )
    lines.append(
        "CHARACTER_ENTRY_OWNER_REVIEW_END elapsed_wall=24.9 "
        "scene=Main.tscn speed=1.00x roster=isolated backend=false "
        "payload=captured profile_save=false "
        "selected=character_review_created appearance=ember_spark_v1 "
        "elements=earth6_water4 phase=380 name_row=inside earth=green "
        "random_names=3 restricted=blocked"
    )
    return "\n".join(lines) + "\n"


class RecordCharacterEntryOwnerReviewTest(unittest.TestCase):
    def test_command_uses_real_main_1280x720_30fps_and_one_x(self) -> None:
        command = TOOL._build_godot_command(
            godot="/opt/godot",
            user_data_dir=Path("/tmp/character-entry-review-user"),
            avi_path=Path("/tmp/character-entry-review.avi"),
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
        with self.assertRaises(TOOL.CharacterEntryRecordingError):
            TOOL._build_godot_command(
                godot="/opt/godot",
                user_data_dir=Path("/tmp/character-entry-review-user"),
                avi_path=Path("/tmp/character-entry-review.avi"),
                review_args=("--auto-auth-server-live-check",),
            )

    def test_probe_requires_audio_and_20_to_35_seconds(self) -> None:
        metadata = TOOL._validate_probe(_probe())
        self.assertEqual(metadata["durationSeconds"], 24.5)
        self.assertEqual(metadata["fps"], 30.0)
        for probe in (
            _probe(duration=19.9),
            _probe(duration=35.1),
            _probe(fps="60/1"),
            _probe(audio_codec="pcm_s16le"),
            _probe(sample_rate="44100"),
            _probe(channels=1),
            _probe(audio_duration=23.9),
        ):
            with self.subTest(probe=probe):
                with self.assertRaises(TOOL.CharacterEntryRecordingError):
                    TOOL._validate_probe(probe)

    def test_log_requires_main_isolation_payload_and_created_slot(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            log_path = Path(temp_dir) / "godot.log"
            log_path.write_text(_godot_log(), encoding="utf-8")
            result = TOOL._validate_godot_log(log_path)
            self.assertEqual(
                result["chapterCount"], len(TOOL.EXPECTED_CHAPTERS)
            )
            self.assertTrue(result["rosterIsolated"])
            self.assertFalse(result["backendConnected"])
            self.assertTrue(result["fourEmptySlotsAtStart"])
            self.assertTrue(result["payloadCaptured"])
            self.assertFalse(result["profileSaveEnabled"])
            self.assertTrue(result["createdSlotPresented"])
            self.assertEqual(result["scene"], TOOL.MAIN_SCENE)
            self.assertEqual(
                result["createdElements"],
                {"earth": 6, "water": 4, "fire": 0, "wind": 0},
            )
            self.assertTrue(result["nameRowInsideBoard"])
            self.assertTrue(result["earthElementGreen"])
            self.assertEqual(result["randomNameClickCount"], 3)
            self.assertEqual(
                result["randomNames"], ["山岚", "潮歌", "霜羽"]
            )
            self.assertTrue(result["restrictedObfuscatedNameBlocked"])
            self.assertTrue(result["restrictedNameMessageGeneric"])
            self.assertTrue(result["restrictedNameSubmitDisabled"])
            self.assertEqual(result["randomNameRecovery"], "林芽")

            invalid_values = (
                (
                    "roster=isolated backend=false",
                    "roster=normal backend=true",
                ),
                (
                    "selected=character_review_created",
                    "selected=character_review_missing",
                ),
                ("speed=1.00x", "speed=2.00x"),
                ("scene=Main.tscn", "scene=Standalone.tscn"),
                ("payload=captured", "payload=missing"),
                ("profile_save=false", "profile_save=true"),
                ("earth=green", "earth=brown"),
                (
                    "error=generic submit=disabled",
                    "error=missing submit=enabled",
                ),
            )
            for old, new in invalid_values:
                with self.subTest(old=old):
                    log_path.write_text(
                        _godot_log().replace(old, new),
                        encoding="utf-8",
                    )
                    with self.assertRaises(
                        TOOL.CharacterEntryRecordingError
                    ):
                        TOOL._validate_godot_log(log_path)

    def test_transcode_decode_contact_sheet_and_sha_contract_exist(self) -> None:
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
        self.assertIn("phase380_character_name_safety_owner_review", source)
        self.assertIn(
            "beastbound_character_name_safety_main_owner_review_video",
            source,
        )


if __name__ == "__main__":
    unittest.main()
