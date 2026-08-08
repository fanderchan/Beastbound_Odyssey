#!/usr/bin/env python3
"""Focused tests for the formal pet-codex owner-review recorder."""

from __future__ import annotations

import importlib.util
import tempfile
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
TOOL_PATH = (
    REPO_ROOT / "tools" / "record_pet_codex_awakened_owner_review.py"
)
CAPTURE_PATH = (
    REPO_ROOT
    / "client"
    / "godot"
    / "scripts"
    / "qa"
    / "pet_codex_awakened_owner_review_capture.gd"
)
SPEC = importlib.util.spec_from_file_location(
    "record_pet_codex_awakened_owner_review",
    TOOL_PATH,
)
assert SPEC is not None and SPEC.loader is not None
TOOL = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(TOOL)


def _probe(
    *,
    duration: float = 17.3,
    fps: str = "30/1",
    audio_sample_rate: str = "48000",
    audio_channels: int = 2,
    frame_count: int = 519,
) -> dict:
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
                "nb_read_frames": str(frame_count),
                "duration": str(duration),
            },
            {
                "codec_type": "audio",
                "codec_name": "aac",
                "sample_rate": audio_sample_rate,
                "channels": audio_channels,
                "duration": str(duration),
            },
        ],
        "format": {"duration": str(duration)},
    }


def _godot_log(*, perf_mode: str = "movie30") -> str:
    fps = 60 if perf_mode == "native" else 30
    lines = [
        "Metal 4.0 - Forward Mobile - Using Device #0: Apple",
    ]
    if perf_mode == "movie30":
        lines.append(
            "Movie Maker mode enabled, recording movie in 1280×720 @ 30 FPS..."
        )
    lines.append(
        "PET_CODEX_AWAKENED_OWNER_REVIEW_START scene=Main.tscn "
        "entry=SceneTreeScript viewport=1280x720 "
        f"fps={'native60' if perf_mode == 'native' else '30'} "
        "speed=1.00x profile=isolated backend=false profile_save=false "
        f"owner_review_status=pending perf_mode={perf_mode}"
    )
    for chapter, seconds in TOOL.EXPECTED_CHAPTERS:
        lines.append(
            "PET_CODEX_AWAKENED_OWNER_REVIEW_CHAPTER "
            f"chapter={chapter} frame={round(seconds * fps)} "
            f"seconds={seconds:.3f} speed=1.00x"
        )
    flags = " ".join(
        f"{name}=true" for name in TOOL.EXPECTED_STATE_FLAGS
    )
    lines.append(
        "PET_CODEX_AWAKENED_OWNER_REVIEW_STATE "
        f"{flags} actual_left_clicks=13 press_frames=13 "
        f"server_writes=0 main_process_max_ms={'6.250' if perf_mode == 'native' else '0.000'} "
        f"main_process_samples={'520' if perf_mode == 'native' else '0'} "
        "monitor_diagnostic_ms=8.500 open_monitor_diagnostic_ms=7.250 "
        "selection_max_usec=5200 input_dispatch_max_usec=4300 "
        "detail_tab_max_usec=2100 route_source_loads_before=38 "
        f"route_source_loads_after=38 perf_mode={perf_mode}"
    )
    lines.append(
        "PET_CODEX_AWAKENED_OWNER_REVIEW_END elapsed_wall=18.9 "
        "speed=1.00x profile=isolated backend=false completed=true"
    )
    return "\n".join(lines) + "\n"


class RecordPetCodexAwakenedOwnerReviewTest(unittest.TestCase):
    def test_command_uses_isolated_scene_tree_movie_writer(self) -> None:
        command = TOOL._build_godot_command(
            godot="/opt/godot",
            user_data_dir=Path("/tmp/pet-codex-review-user"),
            avi_path=Path("/tmp/pet-codex-review.avi"),
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

        native = TOOL._build_native_perf_command(
            godot="/opt/godot",
            user_data_dir=Path("/tmp/pet-codex-native-user"),
        )
        native_separator = native.index("--")
        native_engine = native[:native_separator]
        native_user = native[native_separator + 1 :]
        self.assertNotIn("--fixed-fps", native_engine)
        self.assertNotIn("--write-movie", native_engine)
        self.assertNotIn("--disable-vsync", native_engine)
        self.assertEqual(
            native_engine[native_engine.index("--script") + 1],
            TOOL.CAPTURE_SCRIPT,
        )
        self.assertIn("--pet-codex-native-perf", native_user)

    def test_probe_requires_fixed_audible_media_contract(self) -> None:
        metadata = TOOL._validate_probe(_probe())
        self.assertEqual(metadata["durationSeconds"], 17.3)
        self.assertEqual(metadata["videoCodec"], "h264")
        self.assertEqual(metadata["audioCodec"], "aac")
        self.assertEqual(metadata["audioSampleRate"], 48000)
        self.assertEqual(metadata["audioChannels"], 2)
        for probe in (
            _probe(duration=14.9, frame_count=447),
            _probe(duration=25.1, frame_count=753),
            _probe(fps="60/1"),
            _probe(audio_sample_rate="44100"),
            _probe(audio_channels=1),
            _probe(frame_count=100),
        ):
            with self.subTest(probe=probe):
                with self.assertRaises(TOOL.PetCodexRecordingError):
                    TOOL._validate_probe(probe)

    def test_log_requires_complete_strict_left_click_flow(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            log_path = Path(temp_dir) / "godot.log"
            log_path.write_text(_godot_log(), encoding="utf-8")
            result = TOOL._validate_godot_log(log_path)
            self.assertEqual(result["chapterCount"], 9)
            self.assertEqual(result["actualLeftClicks"], 13)
            self.assertEqual(result["crossFramePresses"], 13)
            self.assertEqual(result["serverWriteCount"], 0)
            self.assertLess(result["selectionMaxMicroseconds"], 8000)
            self.assertEqual(
                result["mainProcessMetricRole"],
                "not-collected-in-movie30",
            )
            self.assertEqual(result["routeSourceLoadsBefore"], 38)
            self.assertEqual(result["routeSourceLoadsAfter"], 38)
            self.assertEqual(result["strictLogGate"], "passed")
            self.assertTrue(all(result["flowCoverage"].values()))

            invalid_logs = (
                _godot_log().replace("family_form=true", "family_form=false"),
                _godot_log().replace(
                    "pending_portrait_blocked=true",
                    "pending_portrait_blocked=false",
                ),
                _godot_log().replace("actual_left_clicks=13", "actual_left_clicks=12"),
                _godot_log().replace("press_frames=13", "press_frames=12"),
                _godot_log().replace("server_writes=0", "server_writes=1"),
                _godot_log().replace("selection_max_usec=5200", "selection_max_usec=8000"),
                _godot_log().replace("input_dispatch_max_usec=4300", "input_dispatch_max_usec=8000"),
                _godot_log().replace("detail_tab_max_usec=2100", "detail_tab_max_usec=8000"),
                _godot_log().replace(
                    "main_process_samples=0",
                    "main_process_samples=1",
                ),
                _godot_log().replace("route_source_loads_after=38", "route_source_loads_after=39"),
                _godot_log().replace("perf_mode=movie30", "perf_mode=native"),
                _godot_log().replace("completed=true", "completed=false"),
                "WARNING: leaked object\n" + _godot_log(),
                "ERROR: resource still in use\n" + _godot_log(),
                "SCRIPT ERROR: broken\n" + _godot_log(),
            )
            for invalid in invalid_logs:
                with self.subTest(invalid=invalid[:100]):
                    log_path.write_text(invalid, encoding="utf-8")
                    with self.assertRaises(TOOL.PetCodexRecordingError):
                        TOOL._validate_godot_log(log_path)

    def test_native_log_requires_foreground_ticks_and_strict_budgets(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            log_path = Path(temp_dir) / "native.log"
            log_path.write_text(_godot_log(perf_mode="native"), encoding="utf-8")
            result = TOOL._validate_godot_log(
                log_path,
                expected_perf_mode="native",
            )
            self.assertEqual(result["perfMode"], "native")
            self.assertEqual(result["mainProcessSamples"], 520)
            self.assertLessEqual(result["mainProcessMaxMilliseconds"], 16.7)
            self.assertLess(result["inputDispatchMaxMicroseconds"], 8000)
            self.assertLess(result["detailTabMaxMicroseconds"], 8000)

            invalid_logs = (
                _godot_log(perf_mode="native").replace(
                    "main_process_max_ms=6.250",
                    "main_process_max_ms=16.701",
                ),
                _godot_log(perf_mode="native").replace(
                    "main_process_samples=520",
                    "main_process_samples=0",
                ),
                _godot_log(perf_mode="native").replace(
                    "foreground_contract=true",
                    "foreground_contract=false",
                ),
                _godot_log(perf_mode="native").replace(
                    "perf_mode=native",
                    "perf_mode=movie30",
                ),
                _godot_log(perf_mode="native").replace(
                    "elapsed_wall=18.9",
                    "elapsed_wall=31.0",
                ),
            )
            for invalid in invalid_logs:
                log_path.write_text(invalid, encoding="utf-8")
                with self.assertRaises(TOOL.PetCodexRecordingError):
                    TOOL._validate_godot_log(
                        log_path,
                        expected_perf_mode="native",
                    )

    def test_capture_contract_and_player_cleanliness_are_present(self) -> None:
        source = TOOL_PATH.read_text(encoding="utf-8")
        capture = CAPTURE_PATH.read_text(encoding="utf-8")
        self.assertIn('"contact-sheet.png"', source)
        self.assertIn('"audio-loudness.log"', source)
        self.assertIn("CORE._write_sha256_manifest", source)
        self.assertIn('preload("res://scenes/Main.tscn")', capture)
        self.assertIn("extends SceneTree", capture)
        self.assertIn("Input.parse_input_event", capture)
        self.assertIn("title_font_has_jian_glyph", capture)
        self.assertIn("modal_blocks_underlay", capture)
        self.assertIn("top_close_collapses", capture)
        self.assertIn("world_hud_restored", capture)
        self.assertIn("world_hud_clickable", capture)
        self.assertIn("menu_fps60", capture)
        self.assertIn("idle_fps30", capture)
        self.assertIn("battle_fps60", capture)
        self.assertIn("foreground_contract", capture)
        self.assertIn("no_player_qa_text", capture)


if __name__ == "__main__":
    unittest.main()
