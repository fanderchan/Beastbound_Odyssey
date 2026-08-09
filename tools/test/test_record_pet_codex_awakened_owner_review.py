#!/usr/bin/env python3
"""Focused tests for the formal pet-codex owner-review recorder."""

from __future__ import annotations

import importlib.util
import json
import re
import tempfile
import unittest
from unittest import mock
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
MAIN_PATH = REPO_ROOT / "client" / "godot" / "scripts" / "main.gd"
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
        "entry=MainSceneFlag viewport=1280x720 "
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
    def test_failure_evidence_enumeration_never_replaces_primary_exception(self) -> None:
        evidence_root = REPO_ROOT / ".run" / "evidence"
        evidence_root.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=evidence_root) as temp_dir:
            output_root = Path(temp_dir)
            args = type(
                "Args",
                (),
                {"run_id": "codex-retained-enumeration", "output_root": output_root},
            )()
            primary = RuntimeError("primary codex recorder failure")
            with mock.patch.object(TOOL, "_record_into", side_effect=primary):
                with mock.patch.object(
                    Path, "rglob", side_effect=OSError("secondary enumeration failure")
                ):
                    with self.assertRaises(RuntimeError) as caught:
                        TOOL._record(args)
            self.assertIs(caught.exception, primary)

    def test_manifest_retry_makes_failure_the_only_valid_status_authority(self) -> None:
        evidence_root = REPO_ROOT / ".run" / "evidence"
        evidence_root.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=evidence_root) as temp_dir:
            output_root = Path(temp_dir)
            args = type(
                "Args",
                (),
                {"run_id": "codex-manifest-retry", "output_root": output_root},
            )()
            manifest_error = OSError("first codex manifest failed")
            original_manifest = TOOL.CORE._write_sha256_manifest
            manifest_calls = 0

            def flaky_manifest(run_dir: Path, paths: list[Path]) -> Path:
                nonlocal manifest_calls
                manifest_calls += 1
                if manifest_calls == 1:
                    raise manifest_error
                return original_manifest(run_dir, paths)

            def fail_after_summary(*, run_dir: Path, **_kwargs: object) -> Path:
                summary_path = run_dir / "summary.json"
                TOOL.CORE._write_json(
                    summary_path,
                    {
                        "status": "passed",
                        "finalStatusAuthority": True,
                        "finalStatusAuthorityRequires": {
                            "artifact": TOOL.CORE._repo_relative(
                                run_dir / "SHA256SUMS"
                            ),
                            "writtenAfterSummary": True,
                            "coversThisSummary": True,
                            "failureSummaryAbsent": True,
                        },
                    },
                )
                TOOL.CORE._write_sha256_manifest(run_dir, [summary_path])
                return summary_path

            with mock.patch.object(TOOL, "_record_into", side_effect=fail_after_summary):
                with mock.patch.object(
                    TOOL.CORE,
                    "_write_sha256_manifest",
                    side_effect=flaky_manifest,
                ):
                    with self.assertRaises(OSError) as caught:
                        TOOL._record(args)
            self.assertIs(caught.exception, manifest_error)
            run_dir = output_root / "codex-manifest-retry"
            failure_path = run_dir / "failure-summary.json"
            failure = json.loads(failure_path.read_text(encoding="utf-8"))
            passed = json.loads((run_dir / "summary.json").read_text(encoding="utf-8"))
            self.assertTrue(failure["finalStatusAuthority"])
            self.assertTrue(
                passed["finalStatusAuthorityRequires"]["failureSummaryAbsent"]
            )
            self.assertTrue(failure_path.is_file())
            self.assertIn(
                "failure-summary.json",
                (run_dir / "SHA256SUMS").read_text(encoding="utf-8"),
            )
            self.assertEqual(manifest_calls, 2)

        with tempfile.TemporaryDirectory(dir=evidence_root) as temp_dir:
            output_root = Path(temp_dir)
            args = type(
                "Args",
                (),
                {"run_id": "codex-failure-writer-failed", "output_root": output_root},
            )()
            primary = RuntimeError("codex primary after stale manifest")

            def stale_success(*, run_dir: Path, **_kwargs: object) -> Path:
                TOOL.CORE._write_json(run_dir / "summary.json", {"status": "passed"})
                (run_dir / "SHA256SUMS").write_text("stale\n", encoding="utf-8")
                raise primary

            with mock.patch.object(TOOL, "_record_into", side_effect=stale_success):
                with mock.patch.object(TOOL, "_write_failure_summary", return_value=False):
                    with mock.patch.object(
                        Path,
                        "rglob",
                        side_effect=AssertionError("must not retry failure manifest"),
                    ):
                        with self.assertRaises(RuntimeError) as caught:
                            TOOL._record(args)
            self.assertIs(caught.exception, primary)
            self.assertFalse(
                (output_root / "codex-failure-writer-failed" / "SHA256SUMS").exists()
            )

    def test_failure_summary_is_final_authority_even_with_bad_lifecycle(self) -> None:
        evidence_root = REPO_ROOT / ".run" / "evidence"
        evidence_root.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=evidence_root) as temp_dir:
            run_dir = Path(temp_dir)
            (run_dir / "qa-lane-lifecycle.json").write_text(
                "not-json", encoding="utf-8"
            )
            TOOL.CORE._write_json(run_dir / "summary.json", {"status": "passed"})
            self.assertTrue(
                TOOL._write_failure_summary(
                    run_dir,
                    run_id="codex-failure-authority",
                    error=RuntimeError("original codex failure"),
                )
            )
            failure = json.loads(
                (run_dir / "failure-summary.json").read_text(encoding="utf-8")
            )
            self.assertTrue(failure["finalStatusAuthority"])
            self.assertEqual(failure["status"], "failed")
            self.assertIsNone(failure["qaLane"])
            self.assertEqual(failure["qaLaneReadError"]["errorType"], "JSONDecodeError")
            self.assertIsNotNone(failure["supersedesSummary"])
            self.assertTrue(
                failure["sha256Manifest"]["successNotClaimedByFailureSummary"]
            )
        with tempfile.TemporaryDirectory(dir=evidence_root) as temp_dir:
            with mock.patch.object(
                TOOL.CORE,
                "_write_secure_json",
                side_effect=OSError("codex failure authority full"),
            ):
                self.assertFalse(
                    TOOL._write_failure_summary(
                        Path(temp_dir),
                        run_id="codex-failure-authority-write-failed",
                        error=RuntimeError("original codex failure"),
                    )
                )

    def test_commands_use_the_official_lane_without_argument_injection(self) -> None:
        command = TOOL._build_godot_command(
            godot="/opt/godot",
            avi_path=Path("/tmp/pet-codex-review.avi"),
        )
        separator = command.index("--")
        engine = command[:separator]
        user = command[separator + 1 :]
        self.assertEqual(
            engine[engine.index("--scene") + 1],
            TOOL.MAIN_SCENE,
        )
        self.assertNotIn("--script", engine)
        self.assertNotIn("--user-data-dir", engine)
        self.assertIn("1280x720", engine)
        self.assertEqual(engine[engine.index("--fixed-fps") + 1], "30")
        self.assertEqual(engine[engine.index("--time-scale") + 1], "1.0")
        self.assertIn("--write-movie", engine)
        self.assertEqual(
            user,
            [
                "--qa-viewport=1280x720",
                TOOL.CAPTURE_FLAG,
                TOOL.CORE.QA_LANE_ARGUMENT,
            ],
        )
        self.assertEqual(command.count(TOOL.CAPTURE_FLAG), 1)
        self.assertNotIn(TOOL.NATIVE_PERF_FLAG, command)
        self.assertNotIn("--perf-probe", command)
        self.assertEqual(command.count(TOOL.CORE.QA_LANE_ARGUMENT), 1)

        native = TOOL._build_native_perf_command(
            godot="/opt/godot",
        )
        native_separator = native.index("--")
        native_engine = native[:native_separator]
        native_user = native[native_separator + 1 :]
        self.assertNotIn("--fixed-fps", native_engine)
        self.assertNotIn("--write-movie", native_engine)
        self.assertNotIn("--disable-vsync", native_engine)
        self.assertEqual(
            native_engine[native_engine.index("--scene") + 1],
            TOOL.MAIN_SCENE,
        )
        self.assertNotIn("--script", native_engine)
        self.assertEqual(
            native_user,
            [
                "--qa-viewport=1280x720",
                TOOL.CAPTURE_FLAG,
                TOOL.NATIVE_PERF_FLAG,
                "--perf-probe",
                TOOL.CORE.QA_LANE_ARGUMENT,
            ],
        )
        self.assertEqual(native.count(TOOL.CAPTURE_FLAG), 1)
        self.assertEqual(native.count(TOOL.NATIVE_PERF_FLAG), 1)
        self.assertEqual(native.count("--perf-probe"), 1)
        self.assertEqual(native.count(TOOL.CORE.QA_LANE_ARGUMENT), 1)
        self.assertNotIn("--user-data-dir", native)
        source = TOOL_PATH.read_text(encoding="utf-8")
        self.assertNotIn('"--review-arg"', source)
        self.assertNotIn("CORE._capture_version(godot", source)
        self.assertIn("REPORT_SCHEMA_VERSION = 2", source)
        self.assertIn("CORE._run_official_lane_godot_sequence", source)

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

            restored_runtime_flags = (
                "message_panel_restored",
                "safe_area_restored",
                "movement_bounds_restored",
                "camera_state_restored",
            )
            for flag in restored_runtime_flags:
                self.assertIn(flag, TOOL.EXPECTED_STATE_FLAGS)
                self.assertTrue(result["flowCoverage"][flag])

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
            baseline = _godot_log()
            for marker in (
                TOOL.START_MARKER,
                TOOL.STATE_MARKER,
                TOOL.END_MARKER,
                TOOL.CHAPTER_MARKER,
            ):
                marker_line = next(
                    line for line in baseline.split("\n") if line.startswith(marker)
                )
                authority_mutations = (
                    baseline + marker_line + "\n",
                    baseline.replace(marker_line, "junk " + marker_line, 1),
                )
                for invalid in authority_mutations:
                    with self.subTest(marker=marker, mutation=invalid[-80:]):
                        log_path.write_text(invalid, encoding="utf-8")
                        with self.assertRaises(TOOL.PetCodexRecordingError):
                            TOOL._validate_godot_log(log_path)
            for separator in ("\r", "\v", "\f", "\u0085", "\u2028", "\u2029"):
                invalid = baseline.replace(
                    TOOL.START_MARKER,
                    "junk" + separator + TOOL.START_MARKER,
                    1,
                )
                with self.subTest(separator=repr(separator)):
                    with log_path.open("w", encoding="utf-8", newline="") as stream:
                        stream.write(invalid)
                    with self.assertRaises(TOOL.PetCodexRecordingError):
                        TOOL._validate_godot_log(log_path)
            for flag in restored_runtime_flags:
                for mutation, invalid in (
                    (
                        "tampered",
                        _godot_log().replace(
                            f"{flag}=true",
                            f"{flag}=false",
                            1,
                        ),
                    ),
                    (
                        "deleted",
                        _godot_log().replace(f"{flag}=true ", "", 1),
                    ),
                ):
                    with self.subTest(flag=flag, mutation=mutation):
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

    def test_failure_marker_is_unique_column_zero_and_specific(self) -> None:
        marker = TOOL.FAILURE_MARKER
        reason = "native 性能窗口没有进入玩家前台焦点态"
        exact_line = f"{marker} reason={reason}"
        with tempfile.TemporaryDirectory() as temp_dir:
            log_path = Path(temp_dir) / "failure.log"
            log_path.write_text(
                exact_line + "\nERROR: secondary push_error diagnostic\n",
                encoding="utf-8",
            )
            with self.assertRaisesRegex(
                TOOL.PetCodexRecordingError,
                reason,
            ):
                TOOL._validate_godot_log(log_path, expected_perf_mode="native")

            invalid_lines = (
                exact_line + "\n" + exact_line,
                "junk " + exact_line,
                f"{marker} reason=",
                f"{marker} reason= ",
                f"{marker} reason= leading",
                f"{marker} reason=trailing ",
                f"{marker} reason=\u00a0reason",
                f"{marker} reason=reason\u00a0",
            )
            for invalid in invalid_lines:
                with self.subTest(invalid=repr(invalid)):
                    with log_path.open("w", encoding="utf-8", newline="") as stream:
                        stream.write(invalid + "\n")
                    with self.assertRaises(TOOL.PetCodexRecordingError):
                        TOOL._validate_godot_log(
                            log_path,
                            expected_perf_mode="native",
                        )
            for separator in ("\r", "\v", "\f", "\u0085", "\u2028", "\u2029"):
                invalid = "junk" + separator + exact_line + "\n"
                with self.subTest(separator=repr(separator)):
                    with log_path.open("w", encoding="utf-8", newline="") as stream:
                        stream.write(invalid)
                    with self.assertRaises(TOOL.PetCodexRecordingError):
                        TOOL._validate_godot_log(
                            log_path,
                            expected_perf_mode="native",
                        )

    def test_capture_contract_and_player_cleanliness_are_present(self) -> None:
        source = TOOL_PATH.read_text(encoding="utf-8")
        capture = CAPTURE_PATH.read_text(encoding="utf-8")
        main = MAIN_PATH.read_text(encoding="utf-8")
        self.assertIn('"contact-sheet.png"', source)
        self.assertIn('"audio-loudness.log"', source)
        self.assertIn("CORE._write_sha256_manifest", source)
        self.assertIn("extends RefCounted", capture)
        self.assertNotIn("extends SceneTree", capture)
        self.assertNotIn('preload("res://scenes/Main.tscn")', capture)
        self.assertIsNone(
            re.search(
                r"(?m)^\s*(?:[A-Za-z_][A-Za-z0-9_]*\.)?current_scene\s*=(?!=)",
                capture,
            )
        )
        self.assertNotIn("queue_free", capture)
        self.assertIn("func _init(host_node = null)", capture)
        self.assertIn("func run() -> void:", capture)
        self.assertIn("await _run()", capture)
        self.assertIn("Engine.get_main_loop()", capture)
        self.assertIn("await RenderingServer.frame_post_draw", capture)
        self.assertIn("DisplayServer.window_move_to_foreground()", capture)
        self.assertIn("FOREGROUND_TIMEOUT_MSEC", capture)
        self.assertIn("auth_auto_bypass = false", capture)
        self.assertIn("cancel_request()", capture)
        self.assertIn("HTTPClient.STATUS_DISCONNECTED", capture)
        self.assertIn("_refresh_gm_visibility()", capture)
        self.assertIn("entry=MainSceneFlag", capture)
        self.assertEqual(
            capture.count(f'const CAPTURE_FLAG := "{TOOL.CAPTURE_FLAG}"'), 1
        )
        self.assertEqual(
            capture.count(
                f'const NATIVE_PERF_FLAG := "{TOOL.NATIVE_PERF_FLAG}"'
            ),
            1,
        )
        self.assertIn("capture_count != 1 or native_perf_count > 1", capture)
        self.assertIn("bool(_host.perf_probe_enabled) != _native_perf_mode", capture)
        self.assertEqual(
            main.count(
                "const PetCodexAwakenedOwnerReviewCapture := preload(\n"
                '\t"res://scripts/qa/pet_codex_awakened_owner_review_capture.gd"\n'
                ")"
            ),
            1,
        )
        self.assertEqual(
            main.count(
                'call_deferred("_run_pet_codex_awakened_owner_review_capture")'
            ),
            1,
        )
        self.assertEqual(
            main.count(
                "await PetCodexAwakenedOwnerReviewCapture.new(self).run()"
            ),
            1,
        )
        self.assertLess(
            main.index("if not _attest_qa_user_data_lane_or_exit():"),
            main.index(
                'call_deferred("_run_pet_codex_awakened_owner_review_capture")'
            ),
        )
        self.assertIn(
            "or PetCodexAwakenedOwnerReviewCapture.is_flag(normalized)",
            main,
        )
        self.assertIn("auth_auto_bypass = false", main)
        self.assertIn("Input.parse_input_event", capture)
        self.assertIn("title_font_has_jian_glyph", capture)
        self.assertIn("modal_blocks_underlay", capture)
        self.assertIn("top_close_collapses", capture)
        self.assertIn("world_hud_restored", capture)
        self.assertIn("world_hud_clickable", capture)
        self.assertIn("message_panel_restored", capture)
        self.assertIn("safe_area_restored", capture)
        self.assertIn("movement_bounds_restored", capture)
        self.assertIn("camera_state_restored", capture)
        self.assertIn("_world_close_runtime_contract", capture)
        self.assertIn("WorldCameraSafeAreaModel.safe_viewport_rect", capture)
        self.assertIn("_player_movement_bounds", capture)
        self.assertIn("_camera_center_is_inside_limits", capture)
        self.assertIn("menu_fps60", capture)
        self.assertIn("idle_fps30", capture)
        self.assertIn("battle_fps60", capture)
        self.assertIn("foreground_contract", capture)
        self.assertIn("no_player_qa_text", capture)

    def test_main_hosted_wiring_rejects_static_mutations(self) -> None:
        main = MAIN_PATH.read_text(encoding="utf-8")
        capture = CAPTURE_PATH.read_text(encoding="utf-8")
        TOOL._require_main_hosted_capture_wiring(
            main_source=main,
            capture_source=capture,
        )
        capture_mutations = (
            capture.replace("extends RefCounted", "extends SceneTree", 1),
            capture.replace(TOOL.CAPTURE_FLAG, TOOL.CAPTURE_FLAG + "-changed", 1),
            capture.replace(
                TOOL.NATIVE_PERF_FLAG,
                TOOL.NATIVE_PERF_FLAG + "-changed",
                1,
            ),
            capture.replace(
                "return argument == CAPTURE_FLAG or argument == NATIVE_PERF_FLAG",
                "return argument == CAPTURE_FLAG",
                1,
            ),
            capture.replace("auth_auto_bypass = false", "auth_auto_bypass = true", 1),
            capture.replace("cancel_request()", "pass # deleted cancel", 1),
            capture.replace("_refresh_gm_visibility()", "pass # deleted GM refresh", 1),
            capture.replace(
                '_coverage["foreground_contract"] = await _wait_for_native_foreground_focus()',
                '_coverage["foreground_contract"] = true',
                1,
            ),
            capture.replace("\tif _native_perf_mode:\n", "\tif not _native_perf_mode:\n", 1),
            capture.replace(
                "\t\t\tand DisplayServer.window_is_focused()\n",
                "\t\t\tor true\n",
                1,
            ),
            capture.replace(
                "tree.current_scene != _host",
                "tree.current_scene = _host",
                1,
            ),
            capture + "\n# forbidden mutation\n# _host.queue_free()\n",
            capture + "\n# forbidden mutation\n# _tree.root.add_child(_host)\n",
            capture + "\n# forbidden mutation\n# MAIN_SCENE.instantiate()\n",
            capture.replace("\tawait _finish(1)\n", "\t_finish(1)\n", 1),
            capture.replace(
                "PET_CODEX_AWAKENED_OWNER_REVIEW_FAILED reason=%s",
                "PET_CODEX_AWAKENED_OWNER_REVIEW_FAILED changed=%s",
                1,
            ),
            capture.replace("\tawait _finish(0)\n", "\t_finish(0)\n", 1),
            capture.replace("\tfor _frame_index in range(4):\n", "", 1),
            capture.replace(
                "\tfor _frame_index in range(4):\n\t\tawait tree.process_frame\n",
                "\tfor _frame_index in range(4):\n\t\tpass\n",
                1,
            ),
            capture.replace(
                '\ttree.call_deferred("quit", exit_code)\n',
                '\ttree.root.remove_child(_host)\n\t_host.free()\n'
                '\ttree.call_deferred("quit", exit_code)\n',
                1,
            ),
        )
        for mutation_index, mutated in enumerate(capture_mutations):
            with self.subTest(capture_mutation=mutation_index):
                with self.assertRaises(TOOL.PetCodexRecordingError):
                    TOOL._require_main_hosted_capture_wiring(
                        main_source=main,
                        capture_source=mutated,
                    )

        preload = (
            "const PetCodexAwakenedOwnerReviewCapture := preload(\n"
            '\t"res://scripts/qa/pet_codex_awakened_owner_review_capture.gd"\n'
            ")"
        )
        pet_auth_block = (
            "\t\t# Formal owner review uses an isolated player session, never the generic\n"
            "\t\t# dev-GM bypass that other QA entrypoints may select above.\n"
            "\t\tauth_auto_bypass = false\n"
        )
        main_mutations = (
            main.replace(preload, preload.replace("pet_codex", "changed_pet_codex"), 1),
            main.replace(
                "var pet_codex_awakened_owner_review_capture: bool = false",
                "var pet_codex_awakened_owner_review_capture: bool = true",
                1,
            ),
            main.replace(
                "or PetCodexAwakenedOwnerReviewCapture.is_flag(normalized)",
                "or false",
                1,
            ),
            main.replace(
                "elif arg == PetCodexAwakenedOwnerReviewCapture.CAPTURE_FLAG:",
                "elif false:",
                1,
            ),
            main.replace(pet_auth_block, "", 1),
            main.replace(
                "\t\tand not pet_codex_awakened_owner_review_capture\n",
                "",
                1,
            ),
            main.replace(
                "\t\t\tor pet_codex_awakened_owner_review_capture\n",
                "",
                1,
            ),
            main.replace(
                '\t\tcall_deferred("_run_pet_codex_awakened_owner_review_capture")\n',
                "",
                1,
            ),
            main.replace(
                '\t\tcall_deferred("_run_pet_codex_awakened_owner_review_capture")\n',
                '\t\tcall_deferred("_run_pet_codex_awakened_owner_review_capture")\n'
                '\t\tcall_deferred("_run_pet_codex_awakened_owner_review_capture")\n',
                1,
            ),
            main.replace(
                "await PetCodexAwakenedOwnerReviewCapture.new(self).run()",
                "await PetCodexAwakenedOwnerReviewCapture.new(null).run()",
                1,
            ),
            main.replace(
                "\tawait PetCodexAwakenedOwnerReviewCapture.new(self).run()\n",
                "\tawait PetCodexAwakenedOwnerReviewCapture.new(self).run()\n"
                "\tawait PetCodexAwakenedOwnerReviewCapture.new(self).run()\n",
                1,
            ),
            main.replace(
                "\tif not _attest_qa_user_data_lane_or_exit():\n\t\treturn\n",
                "",
                1,
            ),
        )
        for mutation_index, mutated in enumerate(main_mutations):
            with self.subTest(main_mutation=mutation_index):
                with self.assertRaises(TOOL.PetCodexRecordingError):
                    TOOL._require_main_hosted_capture_wiring(
                        main_source=mutated,
                        capture_source=capture,
                    )


if __name__ == "__main__":
    unittest.main()
