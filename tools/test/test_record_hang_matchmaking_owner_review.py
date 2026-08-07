#!/usr/bin/env python3
"""Focused tests for record_hang_matchmaking_owner_review.py."""

from __future__ import annotations

import importlib.util
import tempfile
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
TOOL_PATH = REPO_ROOT / "tools" / "record_hang_matchmaking_owner_review.py"
CAPTURE_PATH = (
    REPO_ROOT
    / "client"
    / "godot"
    / "scripts"
    / "qa"
    / "hang_matchmaking_owner_review_capture.gd"
)
SPEC = importlib.util.spec_from_file_location(
    "record_hang_matchmaking_owner_review",
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
            "HANG_MATCHMAKING_OWNER_REVIEW_START scene=Main.tscn "
            "entry=SceneTreeScript viewport=1280x720 fps=30 speed=1.00x "
            "profile=isolated backend=false profile_save=false "
            "state_source=deterministic_injected_controller "
            "online_claims=false"
        ),
    ]
    for chapter, seconds in TOOL.EXPECTED_CHAPTERS:
        lines.append(
            "HANG_MATCHMAKING_OWNER_REVIEW_CHAPTER "
            f"chapter={chapter} frame={round(seconds * 30)} "
            f"seconds={seconds:.3f} speed=1.00x"
        )
    flags = " ".join(
        f"{name}=true" for name in TOOL.EXPECTED_STATE_FLAGS
    )
    lines.append(
        "HANG_MATCHMAKING_OWNER_REVIEW_STATE "
        f"{flags} actual_left_clicks=9 press_frames=9 "
        "server_writes=0 online_claims=false max_process_ms=2.750"
    )
    lines.append(
        "HANG_MATCHMAKING_OWNER_REVIEW_END elapsed_wall=1.0 speed=1.00x "
        "profile=isolated backend=false completed=true"
    )
    return "\n".join(lines) + "\n"


class RecordHangMatchmakingOwnerReviewTest(unittest.TestCase):
    def test_command_uses_isolated_scene_tree_main_and_movie_writer(self) -> None:
        command = TOOL._build_godot_command(
            godot="/opt/godot",
            user_data_dir=Path("/tmp/hang-matchmaking-review-user"),
            avi_path=Path("/tmp/hang-matchmaking-review.avi"),
        )
        separator = command.index("--")
        engine = command[:separator]
        user = command[separator + 1 :]
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
        self.assertEqual(metadata["durationSeconds"], 25.0)
        self.assertEqual(metadata["fps"], 30.0)
        self.assertEqual(metadata["videoCodec"], "h264")
        self.assertEqual(metadata["audioCodec"], "aac")
        self.assertEqual(metadata["audioSampleRate"], 48000)
        self.assertEqual(metadata["audioChannels"], 2)
        for probe in (
            _probe(duration=21.9),
            _probe(duration=36.1),
            _probe(fps="60/1"),
            _probe(video_codec="vp9"),
            _probe(audio_codec="pcm_s16le"),
            _probe(audio_sample_rate="44100"),
            _probe(audio_channels=1),
            _probe(frame_count=100),
        ):
            with self.subTest(probe=probe):
                with self.assertRaises(TOOL.HangMatchmakingRecordingError):
                    TOOL._validate_probe(probe)

    def test_log_requires_complete_click_write_free_flow(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            log_path = Path(temp_dir) / "godot.log"
            log_path.write_text(_godot_log(), encoding="utf-8")
            result = TOOL._validate_godot_log(log_path)
            self.assertEqual(result["chapterCount"], 10)
            self.assertEqual(result["actualLeftClicks"], 9)
            self.assertEqual(result["crossFramePresses"], 9)
            self.assertEqual(result["serverWriteCount"], 0)
            self.assertFalse(result["onlinePopulationClaims"])
            self.assertLess(result["maxProcessMilliseconds"], 80.0)
            self.assertTrue(all(result["flowCoverage"].values()))

            invalid_logs = (
                _godot_log().replace(
                    "profile=isolated backend=false profile_save=false",
                    "profile=normal backend=true profile_save=true",
                ),
                _godot_log().replace(
                    "state_source=deterministic_injected_controller",
                    "state_source=fake_counter",
                ),
                _godot_log().replace(
                    "online_claims=false", "online_claims=true", 1
                ),
                _godot_log().replace(TOOL.END_MARKER, "END_MISSING"),
                _godot_log().replace("world_context frame=45", "world_context frame=44"),
                _godot_log().replace("npc_fill=true", "npc_fill=false"),
                _godot_log().replace(
                    "human_replacement_next_battle=true",
                    "human_replacement_next_battle=false",
                ),
                _godot_log().replace("actual_left_clicks=9", "actual_left_clicks=8"),
                _godot_log().replace("press_frames=9", "press_frames=8"),
                _godot_log().replace("server_writes=0", "server_writes=1"),
                _godot_log().replace("max_process_ms=2.750", "max_process_ms=80.001"),
                _godot_log().replace("completed=true", "completed=false"),
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
                        TOOL.HangMatchmakingRecordingError
                    ):
                        TOOL._validate_godot_log(log_path)

    def test_artifact_and_capture_contract_are_present(self) -> None:
        source = TOOL_PATH.read_text(encoding="utf-8")
        capture = CAPTURE_PATH.read_text(encoding="utf-8")
        self.assertEqual(
            TOOL.REPORT_TYPE,
            "beastbound_hang_matchmaking_owner_review_video",
        )
        self.assertEqual(
            TOOL.DEFAULT_OUTPUT_ROOT.as_posix(),
            ".run/evidence/phase394_hang_matchmaking_owner_review",
        )
        self.assertEqual(
            TOOL.CAPTURE_SCRIPT,
            "res://scripts/qa/hang_matchmaking_owner_review_capture.gd",
        )
        self.assertIn('"scale=in_range=pc:out_range=tv,format=yuv420p"', source)
        self.assertIn('"libx264"', source)
        self.assertIn('"-c:a"', source)
        self.assertIn('"-xerror"', source)
        self.assertIn('"metadata.json"', source)
        self.assertIn('"summary.json"', source)
        self.assertIn('"contact-sheet.png"', source)
        self.assertIn('"hang-matchmaking-owner-review-1x.mp4"', source)
        self.assertIn("CORE._write_sha256_manifest", source)
        self.assertIn('preload("res://scenes/Main.tscn")', capture)
        self.assertIn("extends SceneTree", capture)
        self.assertIn("Input.parse_input_event", capture)
        self.assertIn("_debug_apply_hang_matchmaking_state", capture)
        self.assertIn("_stop_hang_activity(\"挂机已停止。\", true, false)", capture)
        self.assertNotIn("新功能开启", capture)


if __name__ == "__main__":
    unittest.main()
