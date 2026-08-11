#!/usr/bin/env python3
"""Focused safety and contract checks for the Phase383 Firebud v2 recorder."""

from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
TOOL_PATH = REPO_ROOT / "tools" / "record_firebud_v2_owner_review.py"
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
        "groundDrawCount": 100, "objectCount": 5,
        "runtimeCleanup": {
            "status": "passed", "audioStopped": True,
            "audioManagerReleased": True, "drainFrames": 4,
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
        self.assertIn('showcaseProfileInMemoryOnly": True', source)
        self.assertIn('"officialAutomationQaLanePerSegment": True', source)
        self.assertNotIn('"freshUserDataDirectoryPerSegment": True', source)
        self.assertIn('"coversAllRetainedEvidenceFiles": True', source)
        self.assertIn('"coversThisSummary": True', source)
        self.assertNotIn("--review-arg", source)


if __name__ == "__main__":
    unittest.main()
