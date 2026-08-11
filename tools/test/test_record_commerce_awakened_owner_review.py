#!/usr/bin/env python3
"""Focused tests for record_commerce_awakened_owner_review.py."""

from __future__ import annotations

import importlib.util
import tempfile
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
TOOL_PATH = (
    REPO_ROOT
    / "tools"
    / "record_commerce_awakened_owner_review.py"
)
SPEC = importlib.util.spec_from_file_location(
    "record_commerce_awakened_owner_review",
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


def _godot_log(*, movie_mode: bool = True) -> str:
    durations = {
        "world_context": 2.5,
        "item_shop_identity": 3.0,
        "item_shop_sell": 2.5,
        "equipment_shop_identity": 3.0,
        "bank_identity": 3.0,
        "bank_drag_split": 3.0,
        "synthesis_recipe": 3.0,
        "synthesis_confirm": 2.5,
        "return_world": 2.5,
    }
    lines = [
        "Metal 4.0 - Forward Mobile - Using Device #0: Apple",
    ]
    if movie_mode:
        lines.append(
            "Movie Maker mode enabled, recording movie in "
            "1280×720 @ 30 FPS..."
        )
    for chapter in TOOL.EXPECTED_CHAPTERS:
        seconds = durations[chapter]
        lines.append(
            "COMMERCE_AWAKENED_OWNER_REVIEW_CHAPTER "
            f"chapter={chapter} frame={round(seconds * 30)} "
            f"seconds={seconds:.3f} speed=1.00x"
        )
    lines.append(
        "COMMERCE_AWAKENED_OWNER_REVIEW_END elapsed_wall=1.0 "
        "speed=1.00x profile=isolated backend=false"
    )
    return "\n".join(lines) + "\n"


class RecordCommerceAwakenedOwnerReviewTest(unittest.TestCase):
    def test_command_uses_real_main_fixed_flag_and_media_timing(self) -> None:
        command = TOOL._build_godot_command(
            godot="/opt/godot",
            avi_path=Path("/tmp/commerce-review.avi"),
        )
        separator = command.index("--")
        engine = command[:separator]
        user = command[separator + 1 :]
        self.assertIn("--scene", engine)
        self.assertIn(TOOL.MAIN_SCENE, engine)
        self.assertNotIn("--user-data-dir", engine)
        self.assertIn("1280x720", engine)
        self.assertEqual(engine[engine.index("--fixed-fps") + 1], "30")
        self.assertEqual(engine[engine.index("--time-scale") + 1], "1.0")
        self.assertIn("--write-movie", engine)
        self.assertIn(TOOL.DEFAULT_CAPTURE_FLAG, user)
        self.assertEqual(user.count(TOOL.CORE.QA_LANE_ARGUMENT), 1)
        self.assertEqual(
            TOOL.DEFAULT_CAPTURE_FLAG,
            "--commerce-awakened-owner-review-capture",
        )
        parsed = TOOL._parser().parse_args([])
        self.assertFalse(hasattr(parsed, "capture_flag"))
        with self.assertRaises(TOOL.CommerceAwakenedRecordingError):
            TOOL._build_godot_command(
                godot="/opt/godot",
                avi_path=Path("/tmp/commerce-review.avi"),
                review_args=("--login",),
            )
        native = TOOL._build_godot_command(
            godot="/opt/godot",
            avi_path=None,
        )
        self.assertNotIn("--write-movie", native)
        self.assertNotIn("--fixed-fps", native)
        self.assertEqual(native.count(TOOL.CORE.QA_LANE_ARGUMENT), 1)

    def test_probe_requires_h264_aac_audio_30fps_and_20_to_30_seconds(self) -> None:
        metadata = TOOL._validate_probe(_probe())
        self.assertEqual(metadata["durationSeconds"], 25.0)
        self.assertEqual(metadata["fps"], 30.0)
        self.assertEqual(metadata["videoCodec"], "h264")
        self.assertEqual(metadata["audioCodec"], "aac")
        self.assertEqual(metadata["audioSampleRate"], 48000)
        self.assertEqual(metadata["audioChannels"], 2)
        for probe in (
            _probe(duration=19.9),
            _probe(duration=30.1),
            _probe(fps="60/1"),
            _probe(video_codec="vp9"),
            _probe(audio_codec="pcm_s16le"),
            _probe(audio_sample_rate="44100"),
            _probe(audio_channels=1),
            _probe(frame_count=100),
        ):
            with self.subTest(probe=probe):
                with self.assertRaises(TOOL.CommerceAwakenedRecordingError):
                    TOOL._validate_probe(probe)

    def test_log_requires_exact_order_timing_isolation_and_end_marker(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            log_path = Path(temp_dir) / "godot.log"
            log_path.write_text(_godot_log(), encoding="utf-8")
            result = TOOL._validate_godot_log(log_path, movie_mode=True)
            self.assertEqual(result["chapterCount"], 9)
            self.assertEqual(
                tuple(chapter["id"] for chapter in result["chapters"]),
                TOOL.EXPECTED_CHAPTERS,
            )
            self.assertTrue(result["profileIsolated"])
            self.assertFalse(result["backendConnected"])
            log_path.write_text(
                _godot_log(movie_mode=False),
                encoding="utf-8",
            )
            native_result = TOOL._validate_godot_log(
                log_path,
                movie_mode=False,
            )
            self.assertEqual(native_result["movieWriter"], "disabled")

            invalid_logs = (
                _godot_log().replace(
                    "profile=isolated backend=false",
                    "profile=normal backend=true",
                ),
                _godot_log().replace(TOOL.END_MARKER, "END_MISSING"),
                _godot_log().replace(
                    "world_context frame=75",
                    "world_context frame=74",
                ),
                _godot_log().replace(
                    "item_shop_identity",
                    "bank_identity",
                    1,
                ),
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
                "ERROR: leaked resource\n" + _godot_log(),
                _godot_log()
                + "WARNING: 4 ObjectDB instances were leaked at exit\n",
                _godot_log()
                + "ERROR: 2 resources still in use at exit\n",
            )
            for invalid in invalid_logs:
                with self.subTest(invalid=invalid[:80]):
                    log_path.write_text(invalid, encoding="utf-8")
                    with self.assertRaises(
                        TOOL.CommerceAwakenedRecordingError
                    ):
                        TOOL._validate_godot_log(
                            log_path,
                            movie_mode=True,
                        )
            log_path.write_text(_godot_log(), encoding="utf-8")
            with self.assertRaises(TOOL.CommerceAwakenedRecordingError):
                TOOL._validate_godot_log(log_path, movie_mode=False)

    def test_audio_loudness_must_be_present_finite_and_audible(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            log_path = Path(temp_dir) / "audio.log"
            log_path.write_text(
                "mean_volume: -28.0 dB\nmax_volume: -13.5 dB\n",
                encoding="utf-8",
            )
            result = TOOL._validate_audible_audio(log_path)
            self.assertEqual(result["meanVolumeDb"], -28.0)
            self.assertEqual(result["maxVolumeDb"], -13.5)
            for invalid in (
                "",
                "mean_volume: -inf dB\nmax_volume: -inf dB\n",
                "mean_volume: -70.0 dB\nmax_volume: -60.0 dB\n",
            ):
                with self.subTest(invalid=invalid):
                    log_path.write_text(invalid, encoding="utf-8")
                    with self.assertRaises(
                        TOOL.CommerceAwakenedRecordingError
                    ):
                        TOOL._validate_audible_audio(log_path)

    def test_artifact_contract_and_defaults_are_present(self) -> None:
        source = TOOL_PATH.read_text(encoding="utf-8")
        self.assertEqual(
            TOOL.DEFAULT_OUTPUT_ROOT.as_posix(),
            ".run/evidence/phase391_commerce_identity_owner_review",
        )
        self.assertIn(
            '"scale=in_range=pc:out_range=tv,format=yuv420p"',
            source,
        )
        self.assertIn('"libx264"', source)
        self.assertIn('"-color_range"', source)
        self.assertIn('"-c:a"', source)
        self.assertIn('"-xerror"', source)
        self.assertIn('"metadata.json"', source)
        self.assertIn('"summary.json"', source)
        self.assertIn('"contact-sheet.png"', source)
        self.assertIn("CORE._write_sha256_manifest", source)
        self.assertIn("CORE._run_official_lane_godot_sequence", source)
        self.assertIn("CORE.QA_LANE_ARGUMENT", source)
        self.assertIn('"0:a:0"', source)
        capture_source = (
            REPO_ROOT
            / "client"
            / "godot"
            / "scripts"
            / "qa"
            / "commerce_awakened_owner_review_capture.gd"
        ).read_text(encoding="utf-8")
        self.assertIn(
            "await _drain_main_audio_for_movie_shutdown()",
            capture_source,
        )
        self.assertIn('manager.call("stop_all")', capture_source)
        self.assertIn("manager.queue_free()", capture_source)


if __name__ == "__main__":
    unittest.main()
