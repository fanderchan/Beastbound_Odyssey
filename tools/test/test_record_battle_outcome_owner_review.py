#!/usr/bin/env python3
"""Focused tests for record_battle_outcome_owner_review.py."""

from __future__ import annotations

import importlib.util
import tempfile
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
TOOL_PATH = REPO_ROOT / "tools" / "record_battle_outcome_owner_review.py"
CAPTURE_PATH = (
    REPO_ROOT
    / "client"
    / "godot"
    / "scripts"
    / "qa"
    / "battle_outcome_owner_review_capture.gd"
)
SPEC = importlib.util.spec_from_file_location(
    "record_battle_outcome_owner_review",
    TOOL_PATH,
)
assert SPEC is not None and SPEC.loader is not None
TOOL = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(TOOL)


def _probe(
    *,
    duration: float = 10.0,
    fps: str = "30/1",
    video_codec: str = "h264",
    audio_codec: str = "aac",
    audio_sample_rate: str = "48000",
    audio_channels: int = 2,
    frame_count: int | None = None,
) -> dict:
    frames = frame_count if frame_count is not None else round(duration * 30)
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
                "nb_read_frames": str(frames),
                "duration": str(duration),
            },
            {
                "codec_type": "audio",
                "codec_name": audio_codec,
                "sample_rate": audio_sample_rate,
                "channels": audio_channels,
                "duration": str(duration),
            },
        ],
        "format": {"duration": str(duration)},
    }


def _godot_log() -> str:
    lines = [
        "Metal 4.0 - Forward Mobile - Using Device #0: Apple",
        "Movie Maker mode enabled, recording movie in 1280×720 @ 30 FPS...",
        (
            "BATTLE_OUTCOME_OWNER_REVIEW_START scene=Main.tscn "
            "entry=SceneTreeScript viewport=1280x720 fps=30 speed=1.00x "
            "profile=isolated backend=false profile_save=false structured=true"
        ),
    ]
    for chapter, seconds in TOOL.EXPECTED_CHAPTERS:
        lines.append(
            "BATTLE_OUTCOME_OWNER_REVIEW_CHAPTER "
            f"chapter={chapter} frame={round(seconds * 30)} "
            f"seconds={seconds:.3f} speed=1.00x"
        )
    flags = " ".join(
        f"{name}=true" for name in TOOL.EXPECTED_VIEW_FLAGS
    )
    lines.append(
        "BATTLE_OUTCOME_OWNER_REVIEW_VIEW result=victory entries=11 "
        f"{flags} server_writes=0"
    )
    lines.append(
        "BATTLE_OUTCOME_OWNER_REVIEW_END elapsed_wall=1.0 speed=1.00x "
        "profile=isolated backend=false entries=11 completed=true "
        "moved_up=true faded=true"
    )
    return "\n".join(lines) + "\n"


class RecordBattleOutcomeOwnerReviewTest(unittest.TestCase):
    def test_command_uses_scene_tree_script_that_instantiates_main(self) -> None:
        command = TOOL._build_godot_command(
            godot="/opt/godot",
            user_data_dir=Path("/tmp/battle-outcome-review-user"),
            avi_path=Path("/tmp/battle-outcome-review.avi"),
        )
        separator = command.index("--")
        engine = command[:separator]
        user = command[separator + 1 :]
        self.assertIn("--script", engine)
        self.assertEqual(
            engine[engine.index("--script") + 1],
            TOOL.CAPTURE_SCRIPT,
        )
        self.assertNotIn("--scene", engine)
        self.assertIn("--user-data-dir", engine)
        self.assertIn("1280x720", engine)
        self.assertEqual(engine[engine.index("--fixed-fps") + 1], "30")
        self.assertEqual(engine[engine.index("--time-scale") + 1], "1.0")
        self.assertIn("--write-movie", engine)
        self.assertEqual(user, ["--qa-viewport=1280x720"])

    def test_probe_requires_fixed_media_contract_and_duration(self) -> None:
        metadata = TOOL._validate_probe(_probe())
        self.assertEqual(metadata["durationSeconds"], 10.0)
        self.assertEqual(metadata["fps"], 30.0)
        self.assertEqual(metadata["videoCodec"], "h264")
        self.assertEqual(metadata["audioCodec"], "aac")
        self.assertEqual(metadata["audioSampleRate"], 48000)
        self.assertEqual(metadata["audioChannels"], 2)
        for probe in (
            _probe(duration=8.9),
            _probe(duration=18.1),
            _probe(fps="60/1"),
            _probe(video_codec="vp9"),
            _probe(audio_codec="pcm_s16le"),
            _probe(audio_sample_rate="44100"),
            _probe(audio_channels=1),
            _probe(frame_count=100),
        ):
            with self.subTest(probe=probe):
                with self.assertRaises(TOOL.BattleOutcomeRecordingError):
                    TOOL._validate_probe(probe)

    def test_log_requires_complete_structured_write_free_sequence(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            log_path = Path(temp_dir) / "godot.log"
            log_path.write_text(_godot_log(), encoding="utf-8")
            result = TOOL._validate_godot_log(log_path)
            self.assertEqual(result["chapterCount"], 4)
            self.assertEqual(result["result"], "victory")
            self.assertEqual(result["entryCount"], 11)
            self.assertTrue(result["queueCompleted"])
            self.assertTrue(result["upwardMotionObserved"])
            self.assertTrue(result["fadeObserved"])
            self.assertTrue(result["realMainSceneInstantiated"])
            self.assertEqual(result["serverWriteCount"], 0)
            self.assertTrue(all(result["viewCoverage"].values()))

            invalid_logs = (
                _godot_log().replace(
                    "profile=isolated backend=false profile_save=false",
                    "profile=normal backend=true profile_save=true",
                ),
                _godot_log().replace(TOOL.END_MARKER, "END_MISSING"),
                _godot_log().replace("world_context frame=60", "world_context frame=59"),
                _godot_log().replace("outcome_intro", "settled_world", 1),
                _godot_log().replace("ride_exp=true", "ride_exp=false"),
                _godot_log().replace("server_writes=0", "server_writes=1"),
                _godot_log().replace("completed=true", "completed=false"),
                _godot_log().replace("moved_up=true", "moved_up=false"),
                _godot_log().replace("faded=true", "faded=false"),
                _godot_log().replace("entry=SceneTreeScript", "entry=MainFlag"),
                TOOL.FAILURE_MARKER + "\n" + _godot_log(),
                _godot_log().replace(
                    "Metal 4.0 - Forward Mobile",
                    "OpenGL Compatibility",
                ),
                _godot_log().replace(
                    "Movie Maker mode enabled",
                    "Movie Maker disabled",
                ),
                "SCRIPT ERROR: broken\n" + _godot_log(),
            )
            for invalid in invalid_logs:
                with self.subTest(invalid=invalid[:100]):
                    log_path.write_text(invalid, encoding="utf-8")
                    with self.assertRaises(
                        TOOL.BattleOutcomeRecordingError
                    ):
                        TOOL._validate_godot_log(log_path)

    def test_artifact_defaults_and_capture_contract_are_present(self) -> None:
        source = TOOL_PATH.read_text(encoding="utf-8")
        self.assertEqual(
            TOOL.REPORT_TYPE,
            "beastbound_battle_outcome_owner_review_video",
        )
        self.assertEqual(
            TOOL.DEFAULT_OUTPUT_ROOT.as_posix(),
            ".run/evidence/phase393_battle_outcome_owner_review",
        )
        self.assertEqual(
            TOOL.CAPTURE_SCRIPT,
            "res://scripts/qa/battle_outcome_owner_review_capture.gd",
        )
        self.assertEqual(TOOL.MIN_DURATION_SECONDS, 9.0)
        self.assertIn(
            '"scale=in_range=pc:out_range=tv,format=yuv420p"',
            source,
        )
        self.assertIn('"libx264"', source)
        self.assertIn('"-c:a"', source)
        self.assertIn('"-xerror"', source)
        self.assertIn('"metadata.json"', source)
        self.assertIn('"summary.json"', source)
        self.assertIn('"contact-sheet.png"', source)
        self.assertIn('"battle-outcome-owner-review-1x.mp4"', source)
        self.assertIn("CORE._write_sha256_manifest", source)
        self.assertIn('"keyframes"', source)
        self.assertIn('"0:a:0"', source)

        if CAPTURE_PATH.exists():
            capture = CAPTURE_PATH.read_text(encoding="utf-8")
            self.assertIn('preload("res://scenes/Main.tscn")', capture)
            self.assertIn("extends SceneTree", capture)
            self.assertNotIn("新功能开启", capture)


if __name__ == "__main__":
    unittest.main()
