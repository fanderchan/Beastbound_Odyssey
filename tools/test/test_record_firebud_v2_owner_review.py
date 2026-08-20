#!/usr/bin/env python3
"""Focused safety and contract checks for the Phase383 Firebud v2 recorder."""

from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from unittest import mock
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
TOOL_PATH = REPO_ROOT / "tools" / "record_firebud_v2_owner_review.py"
CAPTURE_PATH = (
    REPO_ROOT
    / "client"
    / "godot"
    / "scripts"
    / "qa"
    / "map_visual_review_capture.gd"
)
RUNTIME_EXIT_CLEANUP_PATH = (
    REPO_ROOT
    / "client"
    / "godot"
    / "scripts"
    / "qa"
    / "runtime_exit_cleanup.gd"
)
SPEC = importlib.util.spec_from_file_location("record_firebud_v2_owner_review", TOOL_PATH)
assert SPEC is not None and SPEC.loader is not None
TOOL = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(TOOL)


def _capture_report(*, map_id: str, mode: str) -> dict:
    return {
        "result": "PASS", "ok": True, "scene": TOOL.MAIN_SCENE,
        "mapId": map_id, "mode": mode, "qaPreviewFlagPresent": True,
        "qaPreviewMapId": map_id, "mapArtActive": True,
        "mapArtQaPreview": True, "mapArtStatus": "owner_review_pending",
        "bundleId": TOOL.EXPECTED_BUNDLE_ID, "defaultProfileIsolation": True,
        "profileIsolation": "default_profile_verified_then_showcase_ephemeral_no_save",
        "showcaseProfileRequested": True,
        "showcaseProfileInMemory": True,
        "showcaseProfilePostInjectionIsDefault": False,
        "showcaseProfileId": "phase383_firebud_v2_owner_review",
        "showcasePlayerAppearanceId": "ember_spark_v1",
        "showcaseActivePetFormId": "bui_novice_sprout_earth5_wind5",
        "showcaseProfilePersisted": False,
        "accountAuthenticated": False, "profileSaveEnabled": False,
        "serverAccountSession": False, "networkRequestAttempted": False,
        "networkRequestsDisconnected": True,
        "normalPlayerHud": True, "viewport": [1280, 720], "errors": [],
        "cameraComposition": {
            "safeRect": [8.0, 206.0, 955.0, 288.0],
            "configuredAnchor": [390.0, 360.0],
            "effectiveAnchor": [390.0, 360.0],
            "playerScreenPoint": [390.0, 360.0],
            "playerAtEffectiveAnchor": True,
            "taskHudVisible": True,
            "taskHudRect": [999.0, 13.0, 206.0, 465.0],
            "playerInsideSafeRect": True,
            "playerClearOfTaskHud": True,
            "taskHudOverlappingBlockingObjectIds": [],
            "nearestWarp": {
                "id": "warp_to_training_yard",
                "cell": [2, 15],
                "screenPoint": [328.0, 360.0],
                "edgeClear": True,
                "insideSafeRect": True,
            },
        },
        "groundDrawCount": 100, "objectCount": 5,
        "runtimeCleanup": {
            "status": "passed", "audioPlaybackDisabled": True,
            "audioStopped": True,
            "audioStreamsDetached": True,
            "detachedAudioPlayerCount": 12,
            "audioManagerReleased": True,
            "drainSeconds": 1.5, "drainFrames": 16,
        },
        "playerCellChanged": mode == "moving",
        "input": ({"eventClass": "InputEventMouseButton", "delivery": "Input.parse_input_event", "frameSeparated": True} if mode == "moving" else {}),
    }


class RecordFirebudV2OwnerReviewTest(unittest.TestCase):
    def test_closed_command_is_real_main_isolated_one_x_and_explicit_preview(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            command = TOOL._build_godot_command(
                godot="/opt/godot", avi_path=root / "review.avi",
                map_id="firebud_village_gate",
                mode="moving", screenshot_path=(root / "frame.png").resolve(),
                report_path=(root / "report.json").resolve(),
            )
        separator = command.index("--")
        engine, user = command[:separator], command[separator + 1:]
        self.assertEqual(command.count("--"), 1)
        self.assertIn(TOOL.MAIN_SCENE, engine)
        self.assertNotIn("--user-data-dir", engine)
        self.assertIn("1280x720", engine)
        self.assertEqual(engine[engine.index("--fixed-fps") + 1], "30")
        self.assertEqual(engine[engine.index("--time-scale") + 1], "1.0")
        self.assertIn("--write-movie", engine)
        self.assertIn("--map-art-review-preview=firebud_village_gate", user)
        self.assertIn(TOOL.DEFAULT_CAPTURE_FLAG, user)
        self.assertEqual(user.count(TOOL.SHOWCASE_PROFILE_FLAG), 1)
        self.assertEqual(user.count(TOOL.CORE.QA_LANE_ARGUMENT), 1)
        self.assertNotIn("--login", user)
        self.assertNotIn("--server-url", user)

        native = TOOL._build_godot_command(
            godot="/opt/godot", avi_path=None,
            map_id="firebud_village_gate", mode="idle",
            screenshot_path=(root / "native.png").resolve(),
            report_path=(root / "native.json").resolve(),
        )
        self.assertNotIn("--write-movie", native)
        self.assertEqual(native.count(TOOL.CORE.QA_LANE_ARGUMENT), 1)

    def test_rejects_non_review_maps_modes_and_non_absolute_artifacts(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            kwargs = dict(godot="godot", avi_path=root / "a.avi", map_id="firebud_village_gate", mode="idle", screenshot_path=(root / "a.png").resolve(), report_path=(root / "a.json").resolve())
            for key, value in (("map_id", "wetland"), ("mode", "battle"), ("screenshot_path", Path("relative.png"))):
                altered = {**kwargs, key: value}
                with self.subTest(key=key):
                    with self.assertRaises(TOOL.FirebudV2RecordingError):
                        TOOL._build_godot_command(**altered)

    def test_earth_vein_bundle_uses_default_isolated_profile_without_showcase_flag(self) -> None:
        TOOL._activate_bundle("earth_vein_cave_visual_v1")
        try:
            with tempfile.TemporaryDirectory() as temp:
                root = Path(temp)
                command = TOOL._build_godot_command(
                    godot="/opt/godot",
                    avi_path=root / "review.avi",
                    map_id="earth_vein_cave_f4",
                    mode="moving",
                    screenshot_path=(root / "frame.png").resolve(),
                    report_path=(root / "report.json").resolve(),
                    capture_variant="collision",
                )
                self.assertNotIn(TOOL.SHOWCASE_PROFILE_FLAG, command)
                self.assertIn("--map-art-review-preview=earth_vein_cave_f4", command)
                self.assertIn(
                    "--map-visual-review-capture-variant=collision",
                    command,
                )

                report = _capture_report(map_id="earth_vein_cave_f4", mode="moving")
                report.update({
                    "profileIsolation": "default_profile_ephemeral_no_save",
                    "showcaseProfileRequested": False,
                    "showcaseProfileInMemory": False,
                    "showcaseProfilePostInjectionIsDefault": True,
                    "showcaseProfileId": "",
                    "showcasePlayerAppearanceId": "",
                    "showcaseActivePetFormId": "",
                    "captureVariant": "collision",
                })
                path = root / "capture.json"
                path.write_text(json.dumps(report), encoding="utf-8")
                parsed = TOOL._read_capture_report(
                    path,
                    map_id="earth_vein_cave_f4",
                    mode="moving",
                    capture_variant="collision",
                )
                self.assertEqual(parsed["bundleId"], "earth_vein_cave_visual_v1")
        finally:
            TOOL._activate_bundle("firebud_region_visual_v2")

    def test_rejects_arbitrary_capture_variant(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            with self.assertRaises(TOOL.FirebudV2RecordingError):
                TOOL._build_godot_command(
                    godot="/opt/godot",
                    avi_path=None,
                    map_id="firebud_village_gate",
                    mode="moving",
                    screenshot_path=(root / "frame.png").resolve(),
                    report_path=(root / "report.json").resolve(),
                    capture_variant="freeform",
                )

    def test_capture_report_requires_pending_candidate_isolation_and_real_movement(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "capture.json"
            valid = _capture_report(map_id="firebud_training_yard", mode="moving")
            path.write_text(json.dumps(valid), encoding="utf-8")
            result = TOOL._read_capture_report(path, map_id="firebud_training_yard", mode="moving")
            self.assertEqual(result["bundleId"], TOOL.EXPECTED_BUNDLE_ID)
            for key, value in (
                ("bundleId", "firebud_region_visual_v1"),
                ("accountAuthenticated", True),
                ("mapArtQaPreview", False),
                ("playerCellChanged", False),
                ("showcaseProfileInMemory", False),
                ("showcasePlayerAppearanceId", ""),
                ("showcaseActivePetFormId", ""),
                ("networkRequestsDisconnected", False),
                ("runtimeCleanup", {"status": "failed"}),
            ):
                invalid = _capture_report(map_id="firebud_training_yard", mode="moving")
                invalid[key] = value
                path.write_text(json.dumps(invalid), encoding="utf-8")
                with self.subTest(key=key):
                    with self.assertRaises(TOOL.FirebudV2RecordingError):
                        TOOL._read_capture_report(path, map_id="firebud_training_yard", mode="moving")

    def test_capture_report_rejects_hud_occlusion_and_cropped_gate_landmark(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "capture.json"
            invalid_cases = (
                ("taskHudVisible", False),
                ("playerInsideSafeRect", False),
                ("playerClearOfTaskHud", False),
                ("playerAtEffectiveAnchor", False),
                ("taskHudOverlappingBlockingObjectIds", ["service_pavilion"]),
            )
            for key, value in invalid_cases:
                report = _capture_report(map_id="firebud_village_gate", mode="idle")
                report["cameraComposition"][key] = value
                path.write_text(json.dumps(report), encoding="utf-8")
                with self.subTest(key=key):
                    with self.assertRaises(TOOL.FirebudV2RecordingError):
                        TOOL._read_capture_report(
                            path,
                            map_id="firebud_village_gate",
                            mode="idle",
                        )

            report = _capture_report(map_id="firebud_village_gate", mode="idle")
            report["cameraComposition"]["nearestWarp"]["edgeClear"] = False
            path.write_text(json.dumps(report), encoding="utf-8")
            with self.assertRaises(TOOL.FirebudV2RecordingError):
                TOOL._read_capture_report(
                    path,
                    map_id="firebud_village_gate",
                    mode="idle",
                )

    def test_short_individual_clip_is_allowed_but_must_keep_real_movie_contract(self) -> None:
        probe = {
            "streams": [
                {"codec_type": "video", "codec_name": "h264", "pix_fmt": "yuv420p", "width": 1280, "height": 720, "r_frame_rate": "30/1", "avg_frame_rate": "30/1", "nb_read_frames": "21", "duration": "0.700"},
                {"codec_type": "audio", "codec_name": "aac", "sample_rate": "48000", "channels": 2, "duration": "0.700"},
            ],
            "format": {"duration": "0.700"},
        }
        self.assertEqual(TOOL._validate_segment_probe(probe)["fps"], 30.0)
        probe["streams"][0]["avg_frame_rate"] = "60/1"
        with self.assertRaises(TOOL.FirebudV2RecordingError):
            TOOL._validate_segment_probe(probe)

    def test_godot_log_rejects_missing_movie_contract_and_runtime_leaks(self) -> None:
        clean_native = "\n".join((
            "Metal 4.0 - Forward Mobile - Using Device #0",
            "map visual review capture: {}",
        ))
        clean_movie = "\n".join((
            clean_native,
            "Movie Maker mode enabled, recording movie in 1280×720 @ 30 FPS...",
        ))
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "godot.log"
            path.write_text(clean_native, encoding="utf-8")
            self.assertEqual(
                TOOL._validate_godot_log(path, movie_mode=False)["status"],
                "passed",
            )
            path.write_text(clean_movie, encoding="utf-8")
            self.assertEqual(
                TOOL._validate_godot_log(path, movie_mode=True)["status"],
                "passed",
            )
            path.write_text(
                clean_movie + "\nERROR: resources still in use at exit",
                encoding="utf-8",
            )
            with self.assertRaises(TOOL.FirebudV2RecordingError):
                TOOL._validate_godot_log(path, movie_mode=True)
            path.write_text(
                clean_movie + "\nWARNING: layout drift",
                encoding="utf-8",
            )
            with self.assertRaises(TOOL.FirebudV2RecordingError):
                TOOL._validate_godot_log(path, movie_mode=True)

    def test_source_keeps_limited_range_h264_concat_and_no_extra_godot_args(self) -> None:
        source = TOOL_PATH.read_text(encoding="utf-8")
        self.assertIn('"tpad=stop_mode=clone:stop_duration="', source)
        self.assertIn('f"apad=pad_dur={POST_CAPTURE_HOLD_SECONDS:.1f}"', source)
        self.assertNotIn("setpts=", source)
        self.assertNotIn("atempo=", source)
        self.assertIn('"-c",\n            "copy"', source)
        self.assertIn('loginOrServerArgumentsAccepted": False', source)
        self.assertIn('showcaseProfileInMemoryOnly": USE_SHOWCASE_PROFILE', source)
        self.assertIn('"officialAutomationQaLanePerSegment": True', source)
        self.assertNotIn('"freshUserDataDirectoryPerSegment": True', source)
        self.assertIn('"coversAllRetainedEvidenceFiles": True', source)
        self.assertIn('"coversThisSummary": True', source)
        self.assertNotIn("--review-arg", source)

    def test_capture_cleanup_detaches_audio_and_never_waits_for_draw_after_screenshot(self) -> None:
        source = CAPTURE_PATH.read_text(encoding="utf-8")
        cleanup = RUNTIME_EXIT_CLEANUP_PATH.read_text(encoding="utf-8")
        self.assertIn(
            "return await RuntimeExitCleanup.drain_audio(host)",
            source,
        )
        self.assertNotIn("RenderingServer.frame_post_draw", cleanup)
        self.assertNotIn("configure_playback_enabled", cleanup)
        self.assertIn('"AudioStreamPlayer"', cleanup)
        self.assertIn("player.stream = null", cleanup)
        self.assertIn("AUDIO_DRAIN_FRAMES_BEFORE_FREE := 8", cleanup)
        self.assertIn("AUDIO_DRAIN_FRAMES_AFTER_FREE := 8", cleanup)
        self.assertIn("AUDIO_DRAIN_SECONDS_BEFORE_FREE := 0.75", cleanup)
        self.assertIn("AUDIO_DRAIN_SECONDS_AFTER_FREE := 0.75", cleanup)
        self.assertEqual(cleanup.count("create_timer("), 2)
        self.assertIn('"audioStreamsDetached": true', cleanup)
        self.assertIn('"audioPlaybackDisabled": true', cleanup)
        self.assertIn('"drainSeconds": (', cleanup)
        self.assertIn('"drainFrames": (', cleanup)

        main_source = (
            REPO_ROOT / "client" / "godot" / "scripts" / "main.gd"
        ).read_text(encoding="utf-8")
        audio_build = main_source[
            main_source.index("func _build_game_audio_manager()"):
            main_source.index("func _mount_audio_settings_panel()")
        ]
        self.assertIn(
            "if map_visual_review_capture or perf_probe_clean_exit_frames > 0:",
            audio_build,
        )
        self.assertIn(
            "game_audio_manager.configure_playback_enabled(false)",
            audio_build,
        )
        self.assertLess(
            audio_build.index("configure_playback_enabled(false)"),
            audio_build.index("add_child(game_audio_manager)"),
        )

    def test_failure_summary_embeds_lane_receipt_and_gets_manifest(self) -> None:
        evidence_root = REPO_ROOT / ".run" / "evidence"
        evidence_root.mkdir(parents=True, exist_ok=True)

        def fail_after_lane_prepare(
            *,
            args: object,
            run_id: str,
            run_dir: Path,
        ) -> Path:
            del args, run_id
            lane_dir = run_dir / "segments" / "map-idle-qa-lane"
            lane_dir.mkdir(parents=True)
            TOOL.CORE._write_secure_json(
                lane_dir / "qa-lane-lifecycle.json",
                {
                    "status": "cleaned_after_contained_timeout",
                    "qaLanePreserved": False,
                    "cleanup": {"laneAbsent": True, "realUnchanged": True},
                },
            )
            raise TOOL.CORE.PetManagementRecordingError(
                "contained timeout receipt"
            )

        with tempfile.TemporaryDirectory(dir=evidence_root) as output_root:
            args = TOOL._parser().parse_args(
                [
                    "--output-root",
                    output_root,
                    "--run-id",
                    "failure-receipt",
                ]
            )
            with mock.patch.object(
                TOOL,
                "_record_into",
                side_effect=fail_after_lane_prepare,
            ):
                with self.assertRaises(TOOL.CORE.PetManagementRecordingError):
                    TOOL._record(args)
            run_dir = Path(output_root) / "failure-receipt"
            failure_path = run_dir / "failure-summary.json"
            failure = json.loads(failure_path.read_text(encoding="utf-8"))
            self.assertEqual(failure["status"], "failed")
            self.assertTrue(failure["finalStatusAuthority"])
            self.assertEqual(len(failure["qaLaneReceipts"]), 1)
            receipt = failure["qaLaneReceipts"][0]
            self.assertEqual(
                receipt["lifecycle"]["status"],
                "cleaned_after_contained_timeout",
            )
            self.assertFalse(receipt["lifecycle"]["qaLanePreserved"])
            self.assertEqual(failure["qaLaneReceiptReadErrors"], [])
            manifest = (run_dir / "SHA256SUMS").read_text(encoding="utf-8")
            self.assertIn("failure-summary.json", manifest)
            self.assertIn("qa-lane-lifecycle.json", manifest)
            self.assertEqual(failure_path.stat().st_mode & 0o777, 0o600)


if __name__ == "__main__":
    unittest.main()
