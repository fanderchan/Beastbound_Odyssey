from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import tempfile
import unittest


TOOL_PATH = (
    Path(__file__).resolve().parents[1]
    / "record_pet_fusion_main_owner_review.py"
)
SPEC = importlib.util.spec_from_file_location(
    "record_pet_fusion_main_owner_review",
    TOOL_PATH,
)
assert SPEC is not None and SPEC.loader is not None
TOOL = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(TOOL)


def _godot_report() -> dict:
    user_root = "/tmp/BeastboundOdysseyQA_Automation"
    chapters = []
    cursor = 0
    for chapter_id, state, route, frame_count in TOOL.EXPECTED_CHAPTERS:
        end = cursor + frame_count
        target = TOOL.EXPECTED_ROUTE_TARGETS[route]
        target_form = str(target["formId"])
        snapshot = {
            "closed": state == "closed",
            "messageText": "融合功能尚未开放",
            "targetName": "" if state == "closed" else target["name"],
            "targetFormId": "" if state == "closed" else target_form,
            "targetPortraitResourcePath": (
                ""
                if state == "closed"
                else (
                    "res://assets/pets/"
                    f"{target_form}/portrait/default.png"
                )
            ),
            "targetPortraitStatus": "none" if state == "closed" else "formal",
            "candidateCount": 5,
            "candidateFormalPortraitCount": 5,
            "candidatePlaceholderCount": 0,
            "quoteValid": state != "closed",
            "confirmationArmed": state == "armed",
            "confirmDisabled": state == "closed",
            "buttonText": "敬请期待" if state == "closed" else "确认融合",
            "secondConfirmationCount": 0,
            "networkRequestCount": 0,
        }
        chapters.append(
            {
                "id": chapter_id,
                "state": state,
                "route": route,
                "startFrame": cursor,
                "endFrameExclusive": end,
                "frameCount": frame_count,
                "startTimeSeconds": cursor / 30.0,
                "centerTimeSeconds": (cursor + frame_count // 2) / 30.0,
                "endTimeSeconds": end / 30.0,
                "snapshot": snapshot,
                "errors": [],
            }
        )
        cursor = end
    return {
        "schemaVersion": 1,
        "reportType": TOOL.GODOT_REPORT_TYPE,
        "result": "PASS",
        "scene": TOOL.MAIN_SCENE,
        "entryMode": "MainSceneFlag",
        "realMainSceneInstantiated": True,
        "qaOnlyMainOverlay": True,
        "viewport": {"width": 1280, "height": 720},
        "displayServer": "macOS",
        "window": {
            "mode": 0,
            "modeName": "windowed",
            "visible": True,
            "width": 1280,
            "height": 720,
        },
        "captureFps": 30,
        "playbackSpeed": 1.0,
        "expectedChapterFrameCount": 900,
        "renderedChapterFrameCount": 900,
        "transitionFrameCount": 13,
        "actualLeftClicks": 2,
        "pressFrames": 2,
        "productionRuntimeEnabled": False,
        "playerEntryOpened": False,
        "formalPortraitsRequired": True,
        "secondConfirmationExecuted": False,
        "networkRequestCount": 0,
        "profileSaveEnabled": False,
        "accountSessionPresent": False,
        "backendConnected": False,
        "qaLane": "automation",
        "qaLaneFeaturePresent": True,
        "actualUserDataRoot": user_root,
        "expectedUserDataRoot": user_root,
        "chapters": chapters,
        "portraitOwnerReviewStatus": "owner_review_pending",
        "ownerReviewStatus": "pending",
        "errors": [],
    }


def _godot_log(*, movie: bool, warning: bool = False) -> str:
    lines = [
        "Godot Engine v4.7.stable.official.5b4e0cb0f",
        "Metal 4.0 - Forward Mobile - Using Device #0: Apple - Test",
    ]
    if movie:
        lines.append(
            "Movie Maker mode enabled, recording movie in 1280×720 @ 30 FPS..."
        )
    if warning:
        lines.append(TOOL.KNOWN_MAIN_WARNING)
    lines.append(
        TOOL.START_MARKER
        + " scene=Main.tscn entry=MainSceneFlag viewport=1280x720 "
        + "fps=30 speed=1.00x profile=isolated backend=false "
        + "profile_save=false production_runtime=false player_entry=false "
        + "owner_review_status=pending"
    )
    for chapter_id, state, route, frames in TOOL.EXPECTED_CHAPTERS:
        lines.append(
            TOOL.CHAPTER_MARKER
            + f" chapter={chapter_id} frame={frames} "
            + f"seconds={frames / 30.0:.3f} speed=1.00x "
            + f"state={state} route={route}"
        )
    lines.append(
        TOOL.STATE_MARKER
        + " main_host=true qa_lane=true profile_isolated=true "
        + "formal_portraits=true placeholders=0 layout_valid=true "
        + "no_player_qa_text=true production_runtime=false "
        + "player_entry=false network_requests=0 second_confirmations=0 "
        + "actual_left_clicks=2 press_frames=2 chapter_frames=900 "
        + "transition_frames=13"
    )
    lines.append(
        TOOL.END_MARKER
        + " completed=true speed=1.00x profile=isolated backend=false "
        + "owner_review_status=pending"
    )
    return "\n".join(lines) + "\n"


def _probe(
    *,
    duration: str = "30.500000",
    frame_count: str = "915",
    with_audio: bool = True,
) -> dict:
    streams = [
        {
            "codec_type": "video",
            "codec_name": "h264",
            "pix_fmt": "yuv420p",
            "width": 1280,
            "height": 720,
            "avg_frame_rate": "30/1",
            "r_frame_rate": "30/1",
            "nb_read_frames": frame_count,
            "duration": duration,
        }
    ]
    if with_audio:
        streams.append(
            {
                "codec_type": "audio",
                "codec_name": "aac",
                "sample_rate": "48000",
                "channels": 2,
                "duration": duration,
            }
        )
    return {"streams": streams, "format": {"duration": duration}}


class FusionMainOwnerReviewRecorderTest(unittest.TestCase):
    def test_current_main_hosted_wiring_passes(self) -> None:
        TOOL._require_main_hosted_capture_wiring()

    def test_direct_player_panel_wiring_is_rejected(self) -> None:
        main_source = TOOL.MAIN_SCRIPT_PATH.read_text(encoding="utf-8")
        with self.assertRaises(TOOL.FusionMainRecordingError):
            TOOL._require_main_hosted_capture_wiring(
                main_source=main_source + "\n# pet_fusion_panel.gd\n"
            )

    def test_missing_fail_closed_player_entry_is_rejected(self) -> None:
        coordinator_source = TOOL.PANEL_FLOW_PATH.read_text(encoding="utf-8")
        with self.assertRaises(TOOL.FusionMainRecordingError):
            TOOL._require_main_hosted_capture_wiring(
                panel_flow_source=coordinator_source.replace(
                    '_pet_fusion_open_button.text = "融合"',
                    '_pet_fusion_open_button.text = ""',
                    1,
                )
            )

    def test_native_and_movie_commands_use_one_official_lane(self) -> None:
        native = TOOL._build_godot_command(
            godot="/Applications/Godot.app/Contents/MacOS/Godot",
            report_path=Path("/tmp/native.json"),
            avi_path=None,
        )
        movie = TOOL._build_godot_command(
            godot="/Applications/Godot.app/Contents/MacOS/Godot",
            report_path=Path("/tmp/movie.json"),
            avi_path=Path("/tmp/movie.avi"),
        )
        for command in (native, movie):
            self.assertEqual(command.count(TOOL.CAPTURE_FLAG), 1)
            self.assertEqual(command.count(TOOL.MEDIA.QA_LANE_ARGUMENT), 1)
            self.assertNotIn("--script", command)
            self.assertNotIn("--user-data-dir", command)
            self.assertIn(TOOL.MAIN_SCENE, command)
        self.assertNotIn("--write-movie", native)
        self.assertEqual(movie.count("--write-movie"), 1)

    def test_exact_godot_report_passes(self) -> None:
        validated = TOOL._validate_godot_report(_godot_report())
        self.assertEqual(validated["renderedChapterFrameCount"], 900)
        self.assertEqual(validated["actualLeftClicks"], 2)

    def test_open_runtime_report_is_rejected(self) -> None:
        report = _godot_report()
        report["productionRuntimeEnabled"] = True
        with self.assertRaises(TOOL.FusionMainRecordingError):
            TOOL._validate_godot_report(report)

    def test_second_confirmation_report_is_rejected(self) -> None:
        report = _godot_report()
        report["chapters"][2]["snapshot"]["secondConfirmationCount"] = 1
        with self.assertRaises(TOOL.FusionMainRecordingError):
            TOOL._validate_godot_report(report)

    def test_wrong_portrait_binding_is_rejected(self) -> None:
        report = _godot_report()
        report["chapters"][1]["snapshot"][
            "targetPortraitResourcePath"
        ] = "res://wrong.png"
        with self.assertRaises(TOOL.FusionMainRecordingError):
            TOOL._validate_godot_report(report)

    def test_native_and_movie_logs_pass_with_exact_report(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            report_path = root / "report.json"
            report_path.write_text(
                json.dumps(_godot_report(), ensure_ascii=False),
                encoding="utf-8",
            )
            native_log = root / "native.log"
            native_log.write_text(_godot_log(movie=False), encoding="utf-8")
            movie_log = root / "movie.log"
            movie_log.write_text(
                _godot_log(movie=True, warning=True),
                encoding="utf-8",
            )
            native = TOOL._validate_godot_log(
                native_log,
                report_path=report_path,
                movie_mode=False,
            )
            movie = TOOL._validate_godot_log(
                movie_log,
                report_path=report_path,
                movie_mode=True,
            )
            self.assertFalse(native["movieMode"])
            self.assertTrue(movie["movieMode"])
            self.assertEqual(movie["knownMainWarningCount"], 1)

    def test_failure_marker_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            report_path = root / "report.json"
            report_path.write_text(
                json.dumps(_godot_report(), ensure_ascii=False),
                encoding="utf-8",
            )
            log_path = root / "movie.log"
            log_path.write_text(
                _godot_log(movie=True)
                + f"{TOOL.FAILURE_MARKER} reason=boom\n",
                encoding="utf-8",
            )
            with self.assertRaises(TOOL.FusionMainRecordingError):
                TOOL._validate_godot_log(
                    log_path,
                    report_path=report_path,
                    movie_mode=True,
                )

    def test_media_probe_requires_audible_shape(self) -> None:
        result = TOOL._validate_probe(_probe())
        self.assertEqual(result["audioSampleRate"], 48000)
        with self.assertRaises(TOOL.FusionMainRecordingError):
            TOOL._validate_probe(_probe(with_audio=False))

    def test_media_probe_rejects_short_video(self) -> None:
        with self.assertRaises(TOOL.FusionMainRecordingError):
            TOOL._validate_probe(
                _probe(duration="29.900000", frame_count="897")
            )


if __name__ == "__main__":
    unittest.main()
