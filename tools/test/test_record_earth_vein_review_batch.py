#!/usr/bin/env python3
"""Pure/source contracts for the low-disturbance Earth Vein recorder."""

from __future__ import annotations

import importlib.util
import json
import os
from pathlib import Path
import stat
import tempfile
import unittest
from unittest import mock


REPO_ROOT = Path(__file__).resolve().parents[2]
TOOL_PATH = REPO_ROOT / "tools" / "record_earth_vein_review_batch.py"
CONTROLLER_PATH = (
    REPO_ROOT
    / "client"
    / "godot"
    / "scripts"
    / "qa"
    / "earth_vein_review_batch_capture.gd"
)
SPEC = importlib.util.spec_from_file_location(
    "record_earth_vein_review_batch",
    TOOL_PATH,
)
assert SPEC is not None and SPEC.loader is not None
TOOL = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(TOOL)


def _runtime_checkpoint(
    label: str,
    *,
    visible: bool = True,
    window_mode: int = 0,
    main_count: int = 1,
    position: list[int] | None = None,
    process_frame: int = 50,
    audio_driver: str = "Dummy",
) -> dict:
    return {
        "label": label,
        "processId": 1234,
        "processFrame": process_frame,
        "displayServerWindowCount": 1,
        "displayServerWindowIds": [7],
        "rootWindowId": 7,
        "rootWindowVisible": visible,
        "rootWindowMode": window_mode,
        "rootWindowPosition": position or [100, 100],
        "mainSceneInstanceCount": main_count,
        "audioDriver": audio_driver,
    }


def _final_payload(capture_pass: str) -> dict:
    boundaries = [50, 90, 130, 170, 210, 250, 290, 330, 370, 499]
    stages = []
    for index in range(9):
        landmark = index == 8
        stages.append(
            {
                "kind": "landmark" if landmark else "four_floor",
                "processFrameRange": _frame_range(
                    boundaries[index],
                    boundaries[index + 1],
                    landmark=landmark,
                ),
                "runtimeIdentity": {
                    "before": _runtime_checkpoint(f"stage-{index}:before"),
                    "after": _runtime_checkpoint(f"stage-{index}:after"),
                },
            }
        )
    return {
        "result": "PASS",
        "capturePass": capture_pass,
        "mainSceneLoadCount": 1,
        "mainSceneInstanceCount": 1,
        "godotProcessInstanceCount": 1,
        "windowLifecycle": "persistent_single_window",
        "windowOpenCloseCycles": 1,
        "rootWindowId": 7,
        "fourFloorSegmentCount": 8,
        "landmarkSegmentCount": 1,
        "captureSequence": TOOL._expected_sequence(),
        "processFrameOrigin": 0,
        "movieWriterFrameOrigin": 0,
        "frameIndexContract": "zero_based_start_inclusive_end_exclusive_v1",
        "processFrameEndExclusive": 499,
        "preRollFrameCount": 50,
        "captureFrameStartInclusive": 50,
        "lastSegmentEndExclusive": 499,
        "movieWriterExportFrameRange": {
            "indexBasis": "movie_writer_zero_based_v1",
            "startFrameInclusive": 50,
            "endFrameExclusive": 499,
            "frameCount": 449,
        },
        "movieWriterTerminalFrameCount": 1,
        "movieWriterExpectedFrameCount": 500,
        "renderContinuity": {
            "policy": "occluded_viewport_without_present_v1",
            "result": "PASS",
            "performanceEvidence": False,
            "startProcessFrame": 50,
            "endProcessFrameExclusive": 499,
            "completedProcessFrameCount": 449,
            "fallbackDrawCount": 250,
            "missingDrawFrameCount": 0,
            "firstMissingDrawFrames": [],
        },
        "startupIsolation": {
            "status": "passed",
            "accountSessionCleared": True,
            "defaultProfileRestored": True,
            "accountAuthenticated": False,
            "authAutoBypass": False,
            "profileSaveEnabled": False,
            "gmVisibilityRefreshed": True,
            "authPanelHidden": True,
            "qaMenuHidden": True,
            "qaPanelHidden": True,
            "numericWorkbenchHidden": True,
            "rootMinimizedUntilIsolationComplete": True,
            "audioIsolation": {"status": "passed"},
        },
        "reviewAuthorization": {
            "status": "passed",
            "path": "/tmp/review-authorization.json",
            "sha256": "a" * 64,
            "validatedBeforeMain": True,
            "genericPreviewCliFlagPresent": False,
            "sourceIdentityCount": len(TOOL.GODOT_REVIEW_AUTH_RESOURCES),
        },
        "runtimeIdentity": {
            "preMain": _runtime_checkpoint(
                "preMain",
                window_mode=1,
                main_count=0,
                process_frame=0,
            ),
            "initial": _runtime_checkpoint("initial"),
            "final": _runtime_checkpoint("final", process_frame=499),
        },
        "stages": stages,
    }


def _frame_range(start: int, end: int, *, landmark: bool = False) -> dict:
    return {
        "indexBasis": "movie_writer_zero_based_v1",
        "origin": 0,
        "start": start,
        "startFrameInclusive": start,
        "endExclusive": end,
        "endFrameExclusive": end,
        "frameCount": end - start,
        "inProcessReviewHoldFrameCount": 120 if landmark else 0,
    }


def _capture_payload(*, end_cell: list[int] | None = None) -> dict:
    return {
        "startCell": [5, 22],
        "targetCell": [7, 20],
        "endCell": end_cell or [7, 20],
        "captureVariant": "default",
        "groundDrawCount": 100,
        "objectCount": 12,
        "tileCounts": {"ground": 100, "object": 12},
        "bundleId": TOOL.BUNDLE_ID,
        "mapStyleId": "earth_vein_cave_style_v1",
        "mapArtStatus": "owner_review_pending",
    }


class EarthVeinLowDisturbanceRecorderTests(unittest.TestCase):
    def test_render_continuity_rejects_stale_or_partial_frame_evidence(self) -> None:
        payload = _final_payload("movie")
        self.assertEqual(TOOL._validate_render_continuity(payload)["result"], "PASS")
        for field, invalid_values in {
            "policy": (None, "foreground_native"),
            "result": (None, "FAIL"),
            "performanceEvidence": (None, True, 0),
            "startProcessFrame": (None, True, 51),
            "endProcessFrameExclusive": (None, True, 498),
            "completedProcessFrameCount": (None, True, 448),
            "fallbackDrawCount": (None, True, -1, 451),
            "missingDrawFrameCount": (None, False, 1),
            "firstMissingDrawFrames": (None, [100]),
        }.items():
            for value in invalid_values:
                with self.subTest(field=field, value=value):
                    bad = json.loads(json.dumps(payload))
                    bad["renderContinuity"][field] = value
                    with self.assertRaises(TOOL.EarthVeinBatchRecordingError):
                        TOOL._validate_render_continuity(bad)
        del payload["renderContinuity"]
        with self.assertRaises(TOOL.EarthVeinBatchRecordingError):
            TOOL._validate_render_continuity(payload)

    def test_render_continuity_accepts_visible_and_occluded_capture_without_fps_claim(self) -> None:
        for capture_pass in ("native", "movie"):
            for fallback_count in (0, 449, 450):
                with self.subTest(capture_pass=capture_pass, fallback_count=fallback_count):
                    payload = _final_payload(capture_pass)
                    payload["renderContinuity"]["fallbackDrawCount"] = fallback_count
                    receipt = TOOL._validate_render_continuity(payload)
                    self.assertFalse(receipt["performanceEvidence"])

    def test_launch_contract_has_only_one_native_and_one_movie_window(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            contract = TOOL.launch_contract(
                godot="/Applications/Godot.app/Contents/MacOS/Godot",
                root=Path(temporary),
            )
        self.assertEqual(contract["nativeProcessCount"], 1)
        self.assertEqual(contract["movieWriterProcessCount"], 1)
        self.assertEqual(contract["visibleWindowOpenCloseCycles"], 2)
        self.assertEqual(contract["legacyVisibleCaptureProcessesAvoided"], 16)
        native = contract["commands"]["native"]
        movie = contract["commands"]["movie"]
        self.assertNotIn("--write-movie", native)
        self.assertEqual(movie.count("--write-movie"), 1)
        for command in (native, movie):
            self.assertEqual(command.count("--script"), 1)
            self.assertIn(TOOL.BATCH_CONTROLLER, command)
            self.assertNotIn("--scene", command)
            self.assertNotIn("--login", command)
            self.assertNotIn("--server-url", command)
            self.assertEqual(command.count(TOOL.CORE.QA_LANE_ARGUMENT), 1)
            self.assertEqual(command.count("--audio-driver"), 1)
            self.assertEqual(command[command.index("--audio-driver") + 1], "Dummy")
            self.assertEqual(command.count("--fixed-fps"), 1)
            self.assertEqual(command[command.index("--fixed-fps") + 1], "30")
            self.assertEqual(command.count("--disable-vsync"), 1)
            self.assertNotIn("--map-art-review-preview", command)

    def test_command_rejects_pass_movie_mismatch(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            with self.assertRaises(TOOL.EarthVeinBatchRecordingError):
                TOOL._command(
                    godot="godot",
                    capture_pass="native",
                    output_root=root / "native",
                    report_path=root / "native" / "batch-report.json",
                    avi_path=root / "unexpected.avi",
                )
            with self.assertRaises(TOOL.EarthVeinBatchRecordingError):
                TOOL._command(
                    godot="godot",
                    capture_pass="movie",
                    output_root=root / "movie",
                    report_path=root / "movie" / "batch-report.json",
                    avi_path=None,
                )

    def test_review_authorization_is_sha_bound_to_full_godot_harness(self) -> None:
        payload = TOOL._review_authorization_payload()
        self.assertEqual(payload["reportType"], TOOL.REVIEW_AUTH_REPORT_TYPE)
        self.assertEqual(
            set(payload["sourceIdentity"]),
            set(TOOL.GODOT_REVIEW_AUTH_RESOURCES),
        )
        self.assertFalse(payload["launchContract"]["genericPreviewCliFlag"])
        self.assertTrue(
            payload["launchContract"]["authorizationValidatedBeforeMain"]
        )
        for resource_path, local_path in TOOL.GODOT_REVIEW_AUTH_RESOURCES.items():
            self.assertEqual(
                payload["sourceIdentity"][resource_path]["sha256"],
                TOOL._sha256(local_path),
            )

    def test_log_validator_requires_exact_single_process_receipt(self) -> None:
        native_lines = [
            "Godot Engine v4.7.stable.official",
            "Metal 4.0 - Forward Mobile - Using Device #0",
            "earth vein review batch capture: "
            + json.dumps(_final_payload("native")),
        ]
        movie_lines = [
            native_lines[0],
            native_lines[1],
            "Movie Maker mode enabled, recording movie in 1280×720 @ 30 FPS...",
            "earth vein review batch capture: "
            + json.dumps(_final_payload("movie")),
        ]
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "godot.log"
            path.write_text("\n".join(native_lines), encoding="utf-8")
            self.assertEqual(
                TOOL._payload_from_log(path, movie_mode=False)["capturePass"],
                "native",
            )
            path.write_text("\n".join(movie_lines), encoding="utf-8")
            self.assertEqual(
                TOOL._payload_from_log(path, movie_mode=True)["capturePass"],
                "movie",
            )
            path.write_text("\n".join(movie_lines + [movie_lines[-1]]), encoding="utf-8")
            with self.assertRaises(TOOL.EarthVeinBatchRecordingError):
                TOOL._payload_from_log(path, movie_mode=True)

    def test_frame_ranges_are_positive_ordered_and_non_overlapping(self) -> None:
        stages = [
            {"kind": "four_floor", "processFrameRange": _frame_range(10, 50)},
            {"kind": "four_floor", "processFrameRange": _frame_range(55, 90)},
        ]
        TOOL._validate_frame_ranges(stages, process_frame_end_exclusive=90)
        with self.assertRaises(TOOL.EarthVeinBatchRecordingError):
            TOOL._validate_frame_ranges(
                stages,
                process_frame_end_exclusive=91,
            )
        for mutated in (
            [
                stages[0],
                {"kind": "four_floor", "processFrameRange": _frame_range(49, 90)},
            ],
            [
                {"kind": "four_floor", "processFrameRange": _frame_range(10, 10)},
            ],
            [
                {
                    "kind": "four_floor",
                    "processFrameRange": {
                        **_frame_range(10, 50),
                        "frameCount": 39,
                    },
                },
            ],
            [
                {
                    "kind": "landmark",
                    "processFrameRange": {
                        **_frame_range(10, 150, landmark=True),
                        "origin": 1,
                    },
                },
            ],
        ):
            with self.subTest(mutated=mutated):
                with self.assertRaises(TOOL.EarthVeinBatchRecordingError):
                    TOOL._validate_frame_ranges(
                        mutated,
                        process_frame_end_exclusive=90,
                    )

    def test_offline_range_transcode_keeps_1x_and_uses_frozen_frames(self) -> None:
        command = TOOL._range_transcode_command(
            ffmpeg="ffmpeg",
            raw_movie=Path("batch.avi"),
            output_path=Path("segment.mp4"),
            start_frame=90,
            end_frame=240,
            hold_frames=120,
        )
        video_filter = command[command.index("-vf") + 1]
        audio_filter = command[command.index("-af") + 1]
        self.assertIn("trim=start_frame=90:end_frame=240", video_filter)
        self.assertIn("setpts=PTS-STARTPTS", video_filter)
        self.assertIn("tpad=stop_mode=clone:stop=120", video_filter)
        self.assertIn("atrim=start=3.000000000:end=8.000000000", audio_filter)
        self.assertIn("asetpts=PTS-STARTPTS", audio_filter)
        self.assertIn("apad=pad_dur=4.000000000", audio_filter)
        self.assertIn("-n", command)
        self.assertNotIn("-y", command)
        self.assertNotIn("atempo", " ".join(command))
        self.assertNotIn("setpts=0.5", " ".join(command))

    def test_landmark_range_does_not_add_a_second_hold(self) -> None:
        command = TOOL._range_transcode_command(
            ffmpeg="ffmpeg",
            raw_movie=Path("batch.avi"),
            output_path=Path("landmark.mp4"),
            start_frame=300,
            end_frame=510,
            hold_frames=0,
        )
        self.assertNotIn("tpad", command[command.index("-vf") + 1])
        self.assertNotIn("apad", command[command.index("-af") + 1])

    def test_controller_loads_main_once_and_runs_fixed_8_plus_1_plan(self) -> None:
        source = CONTROLLER_PATH.read_text(encoding="utf-8")
        self.assertEqual(source.count("change_scene_to_file(MAIN_SCENE)"), 1)
        self.assertIn("for map_id in MAP_IDS:", source)
        self.assertIn("for mode in MODES:", source)
        self.assertIn("MapVisualReviewCapture.new(host).run(request)", source)
        self.assertIn("LANDMARK_HOLD_FRAMES := 120", source)
        self.assertIn("RuntimeExitCleanup.drain_audio(host)", source)
        self.assertIn('"movieWriterTerminalFrameCount": 1', source)
        self.assertIn('"frameIndexContract": "zero_based_start_inclusive_end_exclusive_v1"', source)
        self.assertIn('"windowLifecycle": "persistent_single_window"', source)
        self.assertIn('"ownerReviewStatus": "pending"', source)
        self.assertIn('"audioDriver": AudioServer.get_driver_name()', source)
        self.assertIn('const EXPECTED_AUDIO_DRIVER := "Dummy"', source)
        self.assertNotIn('"ownerReviewStatus": "approved"', source)
        self.assertNotIn('"releaseApproved": true', source)

    def test_controller_recreates_disabled_audio_inside_same_process(self) -> None:
        source = CONTROLLER_PATH.read_text(encoding="utf-8")
        prepare = source.index("func _prepare_map_stage")
        rebuild = source.index("host._build_game_audio_manager()", prepare)
        disable = source.index('manager.call("configure_playback_enabled", false)')
        stop = source.index('manager.call("stop_all")', disable)
        self.assertLess(rebuild, disable)
        self.assertLess(disable, stop)
        self.assertIn('"audioStreamsDetached": stream_count == 0', source)

    def test_controller_clears_preview_gm_state_before_first_capture(self) -> None:
        source = CONTROLLER_PATH.read_text(encoding="utf-8")
        configure_call = source.index(
            "startup_isolation = _configure_isolated_batch_host(host)"
        )
        first_capture = source.index(
            "MapVisualReviewCapture.new(host).run(request)"
        )
        self.assertLess(configure_call, first_capture)
        for contract in (
            "host.current_account_session = {}",
            "host.player_profile = PlayerProgressModel.default_profile()",
            'host._close_qa_panel(false)',
            'host._close_numeric_workbench_panel(false)',
            "host._refresh_gm_visibility()",
            '(item as CanvasItem).visible = false',
            '"accountSessionCleared": account_session_cleared',
            '"defaultProfileRestored": default_profile_restored',
            '"qaMenuHidden": qa_menu_hidden',
        ):
            self.assertIn(contract, source)

    def test_controller_authorizes_and_minimizes_before_main_then_freezes_preroll(self) -> None:
        source = CONTROLLER_PATH.read_text(encoding="utf-8")
        self.assertNotIn("root.visible = false", source)
        authorization = source.index("_read_and_validate_review_authorization(errors)")
        hidden = source.index("await _settle_root_window_mode(Window.MODE_MINIMIZED)")
        pre_main_rejection = source.index(
            "earth vein review batch pre-Main isolation rejected"
        )
        pre_main_quit = source.index("quit(1)", pre_main_rejection)
        pre_main_return = source.index("return", pre_main_quit)
        main = source.index("change_scene_to_file(MAIN_SCENE)")
        isolation = source.index("startup_isolation = _configure_isolated_batch_host(host)")
        visible = source.index("await _settle_root_window_mode(Window.MODE_WINDOWED)")
        capture = source.index("MapVisualReviewCapture.new(host).run(request)")
        self.assertLess(authorization, hidden)
        self.assertLess(hidden, pre_main_rejection)
        self.assertLess(pre_main_rejection, pre_main_quit)
        self.assertLess(pre_main_quit, pre_main_return)
        self.assertLess(pre_main_return, main)
        self.assertLess(hidden, main)
        self.assertLess(main, isolation)
        self.assertLess(isolation, visible)
        self.assertLess(visible, capture)
        self.assertIn('host.map_art_review_preview = true', source)
        self.assertIn('"preRollFrameCount": capture_frame_start', source)
        self.assertIn('"captureFrameStartInclusive": capture_frame_start', source)
        self.assertIn('"lastSegmentEndExclusive": last_segment_end_exclusive', source)
        self.assertNotIn('const QA_PREVIEW_ARG', source)

    def test_controller_rejects_untrusted_paths_before_main_or_writer(self) -> None:
        source = CONTROLLER_PATH.read_text(encoding="utf-8")
        validation = source.index("_validate_invocation(")
        rejection = source.index("if not errors.is_empty():", validation)
        quit_call = source.index("quit(1)", rejection)
        rejection_return = source.index("return", quit_call)
        main_load = source.index("change_scene_to_file(MAIN_SCENE)")
        self.assertLess(validation, rejection)
        self.assertLess(rejection, quit_call)
        self.assertLess(quit_call, rejection_return)
        self.assertLess(rejection_return, main_load)
        self.assertIn("DirAccess.make_dir_absolute(normalized_output)", source)
        self.assertNotIn("make_dir_recursive_absolute", source)
        self.assertIn("_path_has_link_from_root", source)
        self.assertIn('OS.execute(\n\t\t"/bin/ln"', source)
        self.assertIn("_publish_temp_file_no_replace", source)
        self.assertIn('link_arguments.append("-h")', source)
        self.assertIn('link_arguments.append("-T")', source)
        self.assertIn('"outputPath": temporary_screenshot_path', source)
        self.assertIn('"reportPath": temporary_report_path', source)
        self.assertIn("_write_png(screenshot_path, screenshot)", source)
        self.assertNotIn("screenshot.save_png(screenshot_path)", source)
        self.assertNotIn("DirAccess.rename_absolute(temp_path, normalized_path)", source)

    def test_controller_binds_all_harness_hashes(self) -> None:
        source = CONTROLLER_PATH.read_text(encoding="utf-8")
        expected = TOOL.GODOT_REVIEW_AUTH_RESOURCES
        for resource_path in expected:
            self.assertIn(resource_path, source)
        records = []
        for resource_path, local_path in expected.items():
            records.append(
                {
                    "path": resource_path,
                    "sha256": TOOL._sha256(local_path),
                    "sizeBytes": local_path.stat().st_size,
                }
            )
        self.assertEqual(len(TOOL._validate_harness_hashes(records)), len(expected))
        for required in (
            "gameAudioManager",
            "battleAudioTimelineController",
            "battleAudioCueModel",
            "audioCueCatalog",
            "audioAmbienceReleaseGate",
        ):
            self.assertIn(required, TOOL.HARNESS_PATHS)

    def test_expected_sequence_preserves_four_floor_and_landmark_semantics(self) -> None:
        self.assertEqual(
            TOOL._expected_sequence(),
            [
                "earth_vein_cave:idle",
                "earth_vein_cave:moving",
                "earth_vein_cave_f2:idle",
                "earth_vein_cave_f2:moving",
                "earth_vein_cave_f3:idle",
                "earth_vein_cave_f3:moving",
                "earth_vein_cave_f4:idle",
                "earth_vein_cave_f4:moving",
                "earth_vein_cave_f4:landmark",
            ],
        )

    def test_three_phase_identity_and_full_helper_hashes_fail_on_drift(self) -> None:
        harness = {
            "pythonRecorder": {"path": "tools/r.py", "sha256": "a" * 64},
            "qaLaneHelper": {"path": "tools/l.py", "sha256": "b" * 64},
        }
        snapshots = {
            phase: {"buildIdentity": "identity", "harness": harness}
            for phase in ("beforeNative", "afterNative", "afterMovie")
        }
        validated = TOOL._validate_phase_identity_snapshots(snapshots)
        self.assertEqual(validated["afterMovie"]["buildIdentity"], "identity")
        drifted = json.loads(json.dumps(snapshots))
        drifted["afterNative"]["buildIdentity"] = "drift"
        with self.assertRaises(TOOL.EarthVeinBatchRecordingError):
            TOOL._validate_phase_identity_snapshots(drifted)
        drifted = json.loads(json.dumps(snapshots))
        drifted["afterMovie"]["harness"]["qaLaneHelper"]["sha256"] = "c" * 64
        with self.assertRaises(TOOL.EarthVeinBatchRecordingError):
            TOOL._validate_phase_identity_snapshots(drifted)
        for required in (
            "mapRecorderHelper",
            "mediaCoreHelper",
            "landmarkRecorderHelper",
            "mapEvidenceBuilder",
            "qaLaneHelper",
            "hudGlyphHelper",
            "petCodexRecorder",
            "battleLayoutRecorder",
            "battleLayoutPerf",
            "autoCheckRunner",
        ):
            self.assertIn(required, TOOL.HARNESS_PATHS)

    def test_raw_and_deliverable_frame_counts_are_exact(self) -> None:
        report = {
            "processFrameOrigin": 0,
            "movieWriterFrameOrigin": 0,
            "processFrameEndExclusive": 499,
            "movieWriterTerminalFrameCount": 1,
            "movieWriterExpectedFrameCount": 500,
        }
        self.assertEqual(
            TOOL._validate_raw_movie_frame_count(500, report)[
                "actualRawFrameCount"
            ],
            500,
        )
        for actual in (499, 501):
            with self.assertRaises(TOOL.EarthVeinBatchRecordingError):
                TOOL._validate_raw_movie_frame_count(actual, report)

        floor_contract = TOOL._validate_segment_frame_count(
            {"frameCount": 270},
            frame_range=_frame_range(20, 170),
            appended_hold_frames=120,
            label="floor",
        )
        self.assertEqual(floor_contract["expectedFrameCount"], 270)
        landmark_contract = TOOL._validate_segment_frame_count(
            {"frameCount": 210},
            frame_range=_frame_range(300, 510, landmark=True),
            appended_hold_frames=0,
            label="landmark",
        )
        self.assertEqual(
            landmark_contract["inProcessReviewHoldFrameCount"], 120
        )
        for actual in (269, 271):
            with self.assertRaises(TOOL.EarthVeinBatchRecordingError):
                TOOL._validate_segment_frame_count(
                    {"frameCount": actual},
                    frame_range=_frame_range(20, 170),
                    appended_hold_frames=120,
                    label="floor",
                )
        concat = TOOL._validate_concat_frame_count(
            {"frameCount": 2160},
            [floor_contract] * 8,
        )
        self.assertEqual(concat["appendedHoldFrameCount"], 960)
        with self.assertRaises(TOOL.EarthVeinBatchRecordingError):
            TOOL._validate_concat_frame_count(
                {"frameCount": 2159},
                [floor_contract] * 8,
            )

    def test_native_movie_deterministic_capture_parity_is_fail_closed(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            native: list[dict] = []
            movie: list[dict] = []
            for index in range(9):
                landmark = index == 8
                payload = _capture_payload()
                if landmark:
                    payload["captureVariant"] = "f4_dual_resonance_landmark"
                native_path = root / f"native-{index}.json"
                movie_path = root / f"movie-{index}.json"
                native_path.write_text(json.dumps(payload), encoding="utf-8")
                movie_path.write_text(json.dumps(payload), encoding="utf-8")
                identity = {
                    "kind": "landmark" if landmark else "four_floor",
                    "mapId": "earth_vein_cave_f4" if landmark else TOOL.MAP_IDS[index // 2],
                    "mode": "moving" if landmark else TOOL.MODES[index % 2],
                    "captureVariant": payload["captureVariant"],
                    "processFrameRange": _frame_range(
                        20 + index * 200,
                        170 + index * 200,
                        landmark=landmark,
                    ),
                }
                native.append(
                    {**identity, "captureReport": {"path": str(native_path)}}
                )
                movie.append({
                    **identity,
                    "processFrameRange": _frame_range(
                        3044 + index * 500,
                        3194 + index * 500,
                        landmark=landmark,
                    ),
                    "captureReport": {"path": str(movie_path)},
                })
            parity = TOOL._validate_native_movie_stage_parity(native, movie)
            self.assertEqual(len(parity), 9)
            self.assertEqual(parity[0]["nativeProcessFrameRange"]["start"], 20)
            self.assertEqual(parity[0]["movieProcessFrameRange"]["start"], 3044)
            self.assertEqual(parity[0]["relativeFrameContract"]["frameCount"], 150)
            original_range = movie[3]["processFrameRange"]
            for changed_range in (
                _frame_range(original_range["start"], original_range["endExclusive"] + 1),
                {**original_range, "inProcessReviewHoldFrameCount": 1},
                {**original_range, "indexBasis": "different_basis"},
                {**original_range, "endFrameExclusive": original_range["endExclusive"] + 1},
                _frame_range(movie[2]["processFrameRange"]["start"],
                             movie[2]["processFrameRange"]["endExclusive"]),
            ):
                with self.subTest(changed_range=changed_range):
                    movie[3]["processFrameRange"] = changed_range
                    with self.assertRaises(TOOL.EarthVeinBatchRecordingError):
                        TOOL._validate_native_movie_stage_parity(native, movie)
            movie[3]["processFrameRange"] = original_range
            changed = _capture_payload(end_cell=[8, 20])
            movie_path = Path(movie[3]["captureReport"]["path"])
            movie_path.write_text(json.dumps(changed), encoding="utf-8")
            with self.assertRaises(TOOL.EarthVeinBatchRecordingError):
                TOOL._validate_native_movie_stage_parity(native, movie)

    def test_separate_process_frame_totals_keep_a_shared_index_basis(self) -> None:
        native = _final_payload("native")
        movie = _final_payload("movie")
        movie["processFrameEndExclusive"] = 22374
        movie["movieWriterExpectedFrameCount"] = 22375
        TOOL._validate_native_movie_frame_basis(native, movie)
        for key, changed in (
            ("processFrameOrigin", 1),
            ("movieWriterFrameOrigin", 1),
            ("frameIndexContract", "one_based"),
            ("movieWriterTerminalFrameCount", 2),
        ):
            with self.subTest(key=key):
                with self.assertRaises(TOOL.EarthVeinBatchRecordingError):
                    TOOL._validate_native_movie_frame_basis(
                        native, {**movie, key: changed}
                    )

    def test_symlink_containment_and_exclusive_manifest(self) -> None:
        evidence_root = REPO_ROOT / ".run" / "evidence"
        evidence_root.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=evidence_root) as temporary:
            run_dir = Path(temporary)
            outside = run_dir.parent / f"outside-{run_dir.name}"
            outside.mkdir()
            try:
                link = run_dir / "link"
                os.symlink(outside, link)
                with self.assertRaises(TOOL.EarthVeinBatchRecordingError):
                    TOOL._assert_contained_without_symlinks(
                        link / "report.json",
                        root=run_dir,
                    )
                link.unlink()

                artifact = run_dir / "artifact.txt"
                artifact.write_text("stable\n", encoding="utf-8")
                manifest = TOOL._write_sha256_manifest_exclusive(
                    run_dir,
                    [artifact],
                )
                original = manifest.read_bytes()
                inode = os.lstat(manifest).st_ino
                with self.assertRaises(TOOL.EarthVeinBatchRecordingError):
                    TOOL._write_sha256_manifest_exclusive(run_dir, [artifact])
                self.assertEqual(manifest.read_bytes(), original)
                self.assertEqual(os.lstat(manifest).st_ino, inode)
            finally:
                outside.rmdir()

    def test_fresh_run_directory_is_dirfd_claimed_0700_and_identity_bound(self) -> None:
        evidence_root = REPO_ROOT / ".run" / "evidence"
        evidence_root.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=evidence_root) as temporary:
            output_root = Path(temporary)
            run_dir, identity = TOOL._claim_fresh_run_directory(
                evidence_root=evidence_root,
                output_root=output_root,
                run_id="fresh-run",
            )
            self.assertEqual(stat.S_IMODE(os.lstat(run_dir).st_mode), 0o700)
            TOOL._assert_run_directory_identity(run_dir, identity)
            with self.assertRaises(TOOL.EarthVeinBatchRecordingError):
                TOOL._claim_fresh_run_directory(
                    evidence_root=evidence_root,
                    output_root=output_root,
                    run_id="fresh-run",
                )

            displaced = output_root / "displaced-run"
            run_dir.rename(displaced)
            run_dir.mkdir(mode=0o700)
            with self.assertRaises(TOOL.EarthVeinBatchRecordingError):
                TOOL._assert_run_directory_identity(run_dir, identity)

    def test_transcode_target_rejects_existing_file_and_symlink(self) -> None:
        evidence_root = REPO_ROOT / ".run" / "evidence"
        evidence_root.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=evidence_root) as temporary:
            root = Path(temporary)
            fresh = root / "fresh.mp4"
            TOOL._assert_fresh_output_target(fresh)
            fresh.write_bytes(b"media")
            TOOL._assert_regular_output(fresh)
            with self.assertRaises(TOOL.EarthVeinBatchRecordingError):
                TOOL._assert_fresh_output_target(fresh)

            sentinel = root / "sentinel.mp4"
            sentinel.write_bytes(b"sentinel")
            linked = root / "linked.mp4"
            os.symlink(sentinel, linked)
            with self.assertRaises(TOOL.EarthVeinBatchRecordingError):
                TOOL._assert_fresh_output_target(linked)

    def test_secure_concat_uses_exclusive_artifacts_and_never_overwrites(self) -> None:
        source = TOOL_PATH.read_text(encoding="utf-8")
        self.assertNotIn("MAP_RECORDER._concat_segments", source)
        self.assertNotIn("write_text(", source)
        evidence_root = REPO_ROOT / ".run" / "evidence"
        with tempfile.TemporaryDirectory(dir=evidence_root) as temporary:
            root = Path(temporary)
            videos = []
            for index in range(8):
                video = root / f"segment-{index}.mp4"
                video.write_bytes(f"segment-{index}".encode())
                videos.append(video)
            list_path = root / "concat-inputs.txt"
            log_path = root / "concat.log"
            output_path = root / "final.mp4"
            captured: list[str] = []

            def fake_run(command, *, log_path, timeout_seconds, environment):
                captured.extend(command)
                log_path.write_bytes(b"exclusive log\n")
                Path(command[-1]).write_bytes(b"final media")

            with (
                mock.patch.object(
                    TOOL,
                    "_run_logged_exclusive",
                    side_effect=fake_run,
                ),
                mock.patch.object(
                    TOOL,
                    "_validate_concat_temp_media",
                    return_value={"frameCount": 100, "durationSeconds": 3.0},
                ),
            ):
                result = TOOL._concat_segments_secure(
                    ffmpeg="ffmpeg",
                    ffprobe="ffprobe",
                    videos=videos,
                    list_path=list_path,
                    output_path=output_path,
                    log_path=log_path,
                    timeout_seconds=10.0,
                    environment={},
                )
            self.assertIn("-n", captured)
            self.assertNotIn("-y", captured)
            self.assertNotEqual(Path(captured[-1]), output_path)
            self.assertTrue(result["temporaryOutputPublishedAtomically"])
            self.assertTrue(list_path.is_file())
            self.assertTrue(output_path.is_file())
            with self.assertRaises(TOOL.EarthVeinBatchRecordingError):
                TOOL._concat_segments_secure(
                    ffmpeg="ffmpeg",
                    ffprobe="ffprobe",
                    videos=videos,
                    list_path=list_path,
                    output_path=output_path,
                    log_path=root / "second.log",
                    timeout_seconds=10.0,
                    environment={},
                )

            sentinel = root / "sentinel.mp4"
            sentinel.write_bytes(b"sentinel")
            linked_output = root / "linked-final.mp4"
            os.symlink(sentinel, linked_output)
            with self.assertRaises(TOOL.EarthVeinBatchRecordingError):
                TOOL._concat_segments_secure(
                    ffmpeg="ffmpeg",
                    ffprobe="ffprobe",
                    videos=videos,
                    list_path=root / "third-list.txt",
                    output_path=linked_output,
                    log_path=root / "third.log",
                    timeout_seconds=10.0,
                    environment={},
                )

            race_final = root / "race-final.mp4"
            race_sentinel = root / "race-sentinel.mp4"
            race_sentinel.write_bytes(b"race sentinel")

            def insert_race(_ffmpeg, _ffprobe, _temporary):
                os.symlink(race_sentinel, race_final)
                return {"frameCount": 100, "durationSeconds": 3.0}

            with (
                mock.patch.object(
                    TOOL,
                    "_run_logged_exclusive",
                    side_effect=fake_run,
                ),
                mock.patch.object(
                    TOOL,
                    "_validate_concat_temp_media",
                    side_effect=insert_race,
                ),
                self.assertRaises(TOOL.EarthVeinBatchRecordingError),
            ):
                TOOL._concat_segments_secure(
                    ffmpeg="ffmpeg",
                    ffprobe="ffprobe",
                    videos=videos,
                    list_path=root / "race-list.txt",
                    output_path=race_final,
                    log_path=root / "race.log",
                    timeout_seconds=10.0,
                    environment={},
                )
            self.assertTrue(race_final.is_symlink())
            self.assertEqual(race_sentinel.read_bytes(), b"race sentinel")

    def test_runtime_identity_rejects_window_main_or_preroll_drift(self) -> None:
        payload = _final_payload("movie")
        validated = TOOL._validate_runtime_identity_contract(
            payload,
            payload["stages"],
        )
        self.assertEqual(validated["checkpointCount"], 21)
        self.assertEqual(validated["audioDriver"], "Dummy")
        drifted = json.loads(json.dumps(payload))
        drifted["stages"][3]["runtimeIdentity"]["after"][
            "displayServerWindowIds"
        ] = [7, 8]
        with self.assertRaises(TOOL.EarthVeinBatchRecordingError):
            TOOL._validate_runtime_identity_contract(
                drifted,
                drifted["stages"],
            )
        two_window = json.loads(json.dumps(payload))
        two_window["runtimeIdentity"]["preMain"][
            "displayServerWindowCount"
        ] = 2
        two_window["runtimeIdentity"]["preMain"][
            "displayServerWindowIds"
        ] = [7, 8]
        with self.assertRaises(TOOL.EarthVeinBatchRecordingError):
            TOOL._validate_runtime_identity_contract(
                two_window,
                two_window["stages"],
            )

        non_dummy = json.loads(json.dumps(payload))
        non_dummy["runtimeIdentity"]["preMain"]["audioDriver"] = "CoreAudio"
        with self.assertRaises(TOOL.EarthVeinBatchRecordingError):
            TOOL._validate_runtime_identity_contract(
                non_dummy,
                non_dummy["stages"],
            )

        missing = json.loads(json.dumps(payload))
        del missing["stages"][5]["runtimeIdentity"]["before"]["audioDriver"]
        with self.assertRaises(TOOL.EarthVeinBatchRecordingError):
            TOOL._validate_runtime_identity_contract(
                missing,
                missing["stages"],
            )

    def test_only_minimized_startup_and_windowed_capture_are_accepted(self) -> None:
        for checkpoint, bad_modes in (
            ("preMain", (None, False, True, 0, 2, 3)),
            ("initial", (None, False, True, 1, 2, 3)),
            ("final", (None, False, True, 1, 2, 3)),
        ):
            for mode in bad_modes:
                with self.subTest(checkpoint=checkpoint, mode=mode):
                    payload = _final_payload("native")
                    payload["runtimeIdentity"][checkpoint]["rootWindowMode"] = mode
                    with self.assertRaises(TOOL.EarthVeinBatchRecordingError):
                        TOOL._validate_runtime_identity_contract(payload, payload["stages"])

    def test_native_movie_runtime_audio_identity_parity_is_fail_closed(self) -> None:
        native = _final_payload("native")
        movie = _final_payload("movie")
        parity = TOOL._validate_native_movie_runtime_identity_parity(
            native,
            movie,
        )
        self.assertEqual(parity["audioDriver"], "Dummy")
        self.assertEqual(parity["checkpointCountPerPass"], 21)

        drifted = json.loads(json.dumps(movie))
        drifted["stages"][3]["runtimeIdentity"]["after"][
            "audioDriver"
        ] = "CoreAudio"
        with self.assertRaises(TOOL.EarthVeinBatchRecordingError):
            TOOL._validate_native_movie_runtime_identity_parity(
                native,
                drifted,
            )

        missing = json.loads(json.dumps(movie))
        del missing["runtimeIdentity"]["final"]["audioDriver"]
        with self.assertRaises(TOOL.EarthVeinBatchRecordingError):
            TOOL._validate_native_movie_runtime_identity_parity(
                native,
                missing,
            )

    def test_secure_summary_write_never_replaces_existing_file_or_symlink(self) -> None:
        evidence_root = REPO_ROOT / ".run" / "evidence"
        with tempfile.TemporaryDirectory(dir=evidence_root) as temporary:
            root = Path(temporary)
            final = root / "summary.json"
            TOOL.CORE._write_secure_json(final, {"first": True}, exclusive=True)
            original = final.read_bytes()
            inode = os.lstat(final).st_ino
            with self.assertRaises(FileExistsError):
                TOOL.CORE._write_secure_json(final, {"second": True}, exclusive=True)
            self.assertEqual(final.read_bytes(), original)
            self.assertEqual(os.lstat(final).st_ino, inode)

            sentinel = root / "sentinel.json"
            sentinel.write_text("sentinel\n", encoding="utf-8")
            symlink = root / "linked-summary.json"
            os.symlink(sentinel, symlink)
            with self.assertRaises(FileExistsError):
                TOOL.CORE._write_secure_json(
                    symlink,
                    {"second": True},
                    exclusive=True,
                )
            self.assertEqual(sentinel.read_text(encoding="utf-8"), "sentinel\n")


if __name__ == "__main__":
    unittest.main()
