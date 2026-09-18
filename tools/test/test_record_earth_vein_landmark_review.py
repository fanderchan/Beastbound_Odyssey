#!/usr/bin/env python3
"""Focused contracts for the Earth Vein F4 landmark recorder."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import tempfile
import unittest


REPO_ROOT = Path(__file__).resolve().parents[2]
TOOL_PATH = REPO_ROOT / "tools" / "record_earth_vein_landmark_review.py"
CAPTURE_PATH = (
    REPO_ROOT
    / "client"
    / "godot"
    / "scripts"
    / "qa"
    / "earth_vein_landmark_review_capture.gd"
)
SPEC = importlib.util.spec_from_file_location(
    "record_earth_vein_landmark_review",
    TOOL_PATH,
)
assert SPEC is not None and SPEC.loader is not None
TOOL = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(TOOL)


def _report() -> dict:
    return {
        "result": "PASS",
        "ok": True,
        "scene": "res://scenes/Main.tscn",
        "mapId": TOOL.EXPECTED_MAP_ID,
        "bundleId": TOOL.EXPECTED_BUNDLE_ID,
        "mapArtStatus": "owner_review_pending",
        "mapArtActive": True,
        "mapArtQaPreview": True,
        "viewport": [1280, 720],
        "reviewOnlyViewpointReposition": True,
        "startCell": [20, 16],
        "targetCell": [22, 11],
        "endCell": [22, 11],
        "playerCellChanged": True,
        "movementCompleted": True,
        "networkRequestsDisconnected": True,
        "requiredLandmarkInstanceIds": TOOL.EXPECTED_LANDMARKS,
        "preparedObjectInstanceIds": [*TOOL.EXPECTED_LANDMARKS, "other"],
        "input": {"frameSeparated": True, "uiBlocked": False},
        "screenshotSha256": "a" * 64,
        "screenshot": {"width": 1280, "height": 720, "sha256": "a" * 64},
        "audioCapturePreparation": {
            "status": "passed",
            "playbackDisabled": True,
            "audioStopped": True,
            "audioStreamsDetached": True,
            "audioPlayerCount": 20,
            "playingAudioPlayerCount": 0,
            "attachedAudioStreamCount": 0,
        },
        "runtimeCleanup": {
            "status": "passed",
            "audioPlaybackDisabled": True,
            "audioStopped": True,
            "audioStreamsDetached": True,
            "detachedAudioPlayerCount": 20,
            "audioManagerReleased": True,
        },
        "errors": [],
    }


class EarthVeinLandmarkRecorderTests(unittest.TestCase):
    def _read(self, report: dict) -> dict:
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "report.json"
            path.write_text(json.dumps(report), encoding="utf-8")
            return TOOL._read_report(path)

    def test_command_is_closed_to_f4_preview_and_qa_lane(self) -> None:
        command = TOOL._command(godot="/Godot", avi_path=None)
        self.assertEqual(command.count(TOOL.QA_PREVIEW_ARG), 1)
        self.assertEqual(command.count(TOOL.CORE.QA_LANE_ARGUMENT), 1)
        self.assertNotIn("--login", command)
        self.assertNotIn("--server-url", command)
        self.assertNotIn("--write-movie", command)

    def test_report_requires_audio_stop_detach_and_manager_release(self) -> None:
        self.assertEqual("PASS", self._read(_report())["result"])

    def test_report_rejects_playback_left_enabled_before_movement(self) -> None:
        report = _report()
        report["audioCapturePreparation"]["playbackDisabled"] = False
        with self.assertRaisesRegex(
            TOOL.EarthLandmarkRecordingError,
            "audioCapturePreparation",
        ):
            self._read(report)

    def test_report_rejects_cleanup_player_count_drift(self) -> None:
        report = _report()
        report["runtimeCleanup"]["detachedAudioPlayerCount"] = 19
        with self.assertRaisesRegex(TOOL.EarthLandmarkRecordingError, "runtimeCleanup"):
            self._read(report)

    def test_capture_disables_audio_before_real_review_input(self) -> None:
        source = CAPTURE_PATH.read_text(encoding="utf-8")
        preparation = source.index(
            'report["audioCapturePreparation"] = await _disable_capture_audio_runtime('
        )
        movement = source.index("await _send_real_mouse_click", preparation)
        disable = source.index('manager.call("configure_playback_enabled", false)')
        stop = source.index('manager.call("stop_all")', disable)
        self.assertLess(preparation, movement)
        self.assertLess(disable, stop)
        self.assertIn('player.stream != null', source)
        self.assertIn('"audioCapturePreparation": {}', source)


if __name__ == "__main__":
    unittest.main()
