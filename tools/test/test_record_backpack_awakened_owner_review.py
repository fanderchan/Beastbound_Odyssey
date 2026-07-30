#!/usr/bin/env python3
"""Focused tests for record_backpack_awakened_owner_review.py."""

from __future__ import annotations

import importlib.util
import tempfile
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
TOOL_PATH = (
    REPO_ROOT
    / "tools"
    / "record_backpack_awakened_owner_review.py"
)
SPEC = importlib.util.spec_from_file_location(
    "record_backpack_awakened_owner_review",
    TOOL_PATH,
)
assert SPEC is not None and SPEC.loader is not None
TOOL = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(TOOL)


def _probe(
    *,
    duration: float = 48.0,
    fps: str = "30/1",
    audio_codec: str = "aac",
) -> dict:
    frame_count = str(round(duration * 30))
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
                "sample_rate": "48000",
                "channels": 2,
                "duration": str(duration),
            },
        ],
        "format": {"duration": str(duration)},
    }


def _godot_log() -> str:
    lines = []
    durations = {
        "world": 2.5,
        "backpack_overview": 2.5,
        "slot_capacity": 2.0,
        "locked_slot_dialog": 2.5,
        "stack_detail": 1.5,
        "stack_split_panel": 2.5,
        "target_item_detail": 1.5,
        "pet_target_selection": 3.0,
        "pet_target_heal_feedback": 2.0,
        "filter_all": 0.7,
        "filter_world": 0.7,
        "filter_battle": 0.7,
        "filter_capture": 0.7,
        "filter_equipment": 0.7,
        "exact_instance_comparison": 4.0,
        "exact_instance_equipped": 3.0,
        "gain_loss_comparison": 3.5,
        "equipped_detail": 2.5,
        "unequip_result": 2.5,
        "pet_egg_headshot": 3.0,
        "ride_permit_headshot": 3.0,
        "return_world": 3.0,
    }
    for chapter in TOOL.EXPECTED_CHAPTERS:
        seconds = durations[chapter]
        lines.append(
            "BACKPACK_AWAKENED_OWNER_REVIEW_CHAPTER "
            f"chapter={chapter} frame={round(seconds * 30)} "
            f"seconds={seconds:.3f} speed=1.00x"
        )
    lines.append(
        "BACKPACK_AWAKENED_OWNER_REVIEW_END elapsed_wall=1.0 "
        "speed=1.00x profile=isolated backend=false "
        "exact_instance=equip_000002"
    )
    return "\n".join(lines) + "\n"


class RecordBackpackAwakenedOwnerReviewTest(unittest.TestCase):
    def test_command_uses_real_main_1280x720_30fps_and_one_x(self) -> None:
        command = TOOL._build_godot_command(
            godot="/opt/godot",
            user_data_dir=Path("/tmp/backpack-review-user"),
            avi_path=Path("/tmp/backpack-review.avi"),
        )
        separator = command.index("--")
        engine = command[:separator]
        user = command[separator + 1 :]
        self.assertIn("--scene", engine)
        self.assertIn(TOOL.MAIN_SCENE, engine)
        self.assertIn("--user-data-dir", engine)
        self.assertIn("1280x720", engine)
        self.assertEqual(
            engine[engine.index("--fixed-fps") + 1],
            "30",
        )
        self.assertEqual(
            engine[engine.index("--time-scale") + 1],
            "1.0",
        )
        self.assertIn("--write-movie", engine)
        self.assertIn(TOOL.DEFAULT_CAPTURE_FLAG, user)

    def test_probe_requires_codec_audio_and_45_to_55_seconds(self) -> None:
        metadata = TOOL._validate_probe(_probe())
        self.assertEqual(metadata["durationSeconds"], 48.0)
        self.assertEqual(metadata["fps"], 30.0)
        for probe in (
            _probe(duration=44.9),
            _probe(duration=55.1),
            _probe(fps="60/1"),
            _probe(audio_codec="pcm_s16le"),
        ):
            with self.subTest(probe=probe):
                with self.assertRaises(
                    TOOL.BackpackAwakenedRecordingError
                ):
                    TOOL._validate_probe(probe)

    def test_godot_log_requires_all_ordered_chapters_and_isolation(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            log_path = Path(temp_dir) / "godot.log"
            log_path.write_text(_godot_log(), encoding="utf-8")
            result = TOOL._validate_godot_log(log_path)
            self.assertEqual(
                result["chapterCount"],
                len(TOOL.EXPECTED_CHAPTERS),
            )
            self.assertTrue(result["profileIsolated"])
            self.assertFalse(result["backendConnected"])
            self.assertEqual(result["chapterCount"], 22)
            self.assertIn(
                "locked_slot_dialog",
                [chapter["id"] for chapter in result["chapters"]],
            )
            self.assertIn(
                "stack_split_panel",
                [chapter["id"] for chapter in result["chapters"]],
            )
            self.assertIn(
                "pet_target_selection",
                [chapter["id"] for chapter in result["chapters"]],
            )
            self.assertIn(
                "pet_target_heal_feedback",
                [chapter["id"] for chapter in result["chapters"]],
            )

            log_path.write_text(
                _godot_log().replace(
                    "profile=isolated backend=false",
                    "profile=normal backend=true",
                ),
                encoding="utf-8",
            )
            with self.assertRaises(
                TOOL.BackpackAwakenedRecordingError
            ):
                TOOL._validate_godot_log(log_path)

    def test_transcode_and_full_decode_contract_are_present(self) -> None:
        source = TOOL_PATH.read_text(encoding="utf-8")
        self.assertIn(
            '"scale=in_range=pc:out_range=tv,format=yuv420p"',
            source,
        )
        self.assertIn('"-color_range"', source)
        self.assertIn('"-xerror"', source)
        self.assertIn('"metadata.json"', source)
        self.assertIn('"contact-sheet.png"', source)


if __name__ == "__main__":
    unittest.main()
