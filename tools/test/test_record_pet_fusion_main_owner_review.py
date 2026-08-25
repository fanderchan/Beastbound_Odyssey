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


def _godot_report(*, qa_lane: str = "automation") -> dict:
    profile = TOOL._qa_lane_profile(qa_lane)
    user_root = f"/tmp/{profile['customUserDirName']}"
    chapters = []
    cursor = 0
    for chapter_id, state, route, frame_count in TOOL.EXPECTED_CHAPTERS:
        end = cursor + frame_count
        target = TOOL.EXPECTED_ROUTE_TARGETS[route]
        target_form = str(target["formId"])
        source_visible = state in {
            "preview",
            "armed",
            "submitted",
            "recovered",
            "pending",
            "success",
        }
        runtime = state in {"pending", "success", "failure"}
        qa_preview = state in {"preview", "armed", "submitted", "recovered"}
        controls_locked = state in {
            "closed",
            "submitted",
            "pending",
            "success",
            "failure",
        }
        snapshot = {
            "closed": state == "closed",
            "runtime": runtime,
            "qaPreview": qa_preview,
            "messageText": "融合功能尚未开放",
            "targetName": target["name"] if source_visible else "",
            "targetFormId": "" if state == "closed" else target_form,
            "targetPortraitResourcePath": (
                "" if not source_visible
                else (
                    "res://assets/pets/"
                    f"{target_form}/portrait/default.png"
                )
            ),
            "targetPortraitStatus": "formal" if source_visible else "none",
            "candidateCount": 5,
            "candidateFormalPortraitCount": 5,
            "candidatePlaceholderCount": 0,
            "materialDisabledCount": 3 if controls_locked else 0,
            "candidateDisabledCount": 5 if controls_locked else 0,
            "quoteValid": source_visible,
            "confirmationArmed": state == "armed",
            "confirmDisabled": controls_locked,
            "buttonText": "确认融合",
            "secondConfirmationCount": 1 if state == "submitted" else 0,
            "quoteRequestCount": 0,
            "fusionRequestCount": 0,
            "networkRequestCount": 0,
            "outcomeVisible": runtime,
            "outcomeKind": "",
            "outcomeAction": "",
            "outcomeActionText": "",
            "outcomeActionDisabled": True,
            "outcomeActionDispatched": False,
            "outcomePortraitFormId": "",
            "outcomePortraitStatus": "none",
            "outcomePortraitResourcePath": "",
            "outcomeTitleText": "",
            "outcomeStatusText": "",
            "outcomeNameText": "",
            "outcomeLevelText": "",
            "outcomeActiveText": "",
            "outcomePassiveText": "",
            "outcomeBindingText": "",
            "outcomeTerminalText": "",
            "outcomeConsumptionText": "",
            "outcomeDetailText": "",
            "playerQaTextPresent": False,
            "playerRawIdentifierPresent": False,
            "visibleText": "玩家可见融合文案",
        }
        if state == "pending":
            snapshot.update(
                {
                    "outcomeKind": "pending",
                    "outcomeActionText": "服务器确认中…",
                    "outcomePortraitStatus": "symbol",
                    "outcomeTitleText": "正在确认融合结果",
                    "outcomeConsumptionText": "结果确认前，不判断材料是否已消耗。",
                }
            )
        elif state == "success":
            snapshot.update(
                {
                    "outcomeKind": "success",
                    "outcomeAction": "view_pet",
                    "outcomeActionText": "查看新宠",
                    "outcomeActionDisabled": False,
                    "outcomePortraitFormId": target_form,
                    "outcomePortraitStatus": "formal",
                    "outcomePortraitResourcePath": (
                        "res://assets/pets/"
                        f"{target_form}/portrait/default.png"
                    ),
                    "outcomeTitleText": "融合完成",
                    "outcomeStatusText": "服务器结果已确认，角色档案已同步",
                    "outcomeNameText": target["name"],
                    "outcomeLevelText": "一转 Lv1",
                    "outcomeActiveText": "主动技能：攻击、防御；血脉遗传：烈焰角击",
                    "outcomePassiveText": "被动技能：赤炎血脉",
                    "outcomeBindingText": f"绑定与交易：成品{target['bindingNeedle']}",
                    "outcomeTerminalText": "一转终局融合形态 · 不可骑乘",
                    "outcomeConsumptionText": "三只材料宠已永久消耗：材料甲 / 材料乙 / 材料丙",
                }
            )
        elif state == "failure":
            snapshot.update(
                {
                    "outcomeKind": "failure",
                    "outcomeAction": "requote",
                    "outcomeActionText": "重新获取报价",
                    "outcomeActionDisabled": False,
                    "outcomePortraitStatus": "symbol",
                    "outcomeTitleText": "融合未完成",
                    "outcomeStatusText": "服务器未执行本次融合",
                    "outcomeNameText": "三只材料宠仍在",
                    "outcomeConsumptionText": "本次没有消耗任何宠物。",
                }
            )
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
        "schemaVersion": TOOL.REPORT_SCHEMA_VERSION,
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
        "expectedChapterFrameCount": TOOL.EXPECTED_CHAPTER_FRAME_COUNT,
        "renderedChapterFrameCount": TOOL.EXPECTED_CHAPTER_FRAME_COUNT,
        "transitionFrameCount": 31,
        "actualLeftClicks": 5,
        "pressFrames": 5,
        "productionRuntimeEnabled": False,
        "playerEntryOpened": False,
        "formalPortraitsRequired": True,
        "qaOnlySecondConfirmationExecuted": True,
        "qaLocalSecondConfirmationCount": 2,
        "authoritativeMutationExecuted": False,
        "authoritativeMutationCount": 0,
        "profileWriteCount": 0,
        "outcomeActionCount": 1,
        "outcomeActions": ["requote"],
        "networkRequestCount": 0,
        "playerQaTextPresent": False,
        "playerRawIdentifierPresent": False,
        "profileSaveEnabled": False,
        "accountSessionPresent": False,
        "backendConnected": False,
        "qaLane": qa_lane,
        "qaLaneFeature": profile["feature"],
        "qaLaneFeaturePresent": True,
        "actualUserDataRoot": user_root,
        "expectedUserDataRoot": user_root,
        "chapters": chapters,
        "portraitOwnerReviewStatus": "owner_review_pending",
        "ownerReviewStatus": "pending",
        "errors": [],
    }


def _godot_log(
    *,
    movie: bool,
    warning: bool = False,
    process_total_ms: float = 0.4,
) -> str:
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
        + "profile_save=false qa_local_outcomes=true "
        + "authoritative_mutations=false production_runtime=false "
        + "player_entry=false "
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
        "perf probe: fps=30.0 frames=30 "
        f"process_total={process_total_ms:.2f}ms draw_world=0.20ms"
    )
    lines.append(
        "perf probe: fps=30.0 frames=30 "
        f"process_total={process_total_ms + 0.1:.2f}ms draw_world=0.20ms"
    )
    lines.append(
        "perf probe: fps=30.0 frames=30 "
        f"process_total={process_total_ms + 0.2:.2f}ms draw_world=0.20ms"
    )
    lines.append(
        "perf probe: fps=30.0 frames=30 "
        f"process_total={process_total_ms + 0.3:.2f}ms draw_world=0.20ms"
    )
    lines.append(
        TOOL.STATE_MARKER
        + " main_host=true qa_lane=true profile_isolated=true "
        + "formal_portraits=true placeholders=0 layout_valid=true "
        + "no_player_qa_text=true production_runtime=false "
        + "player_entry=false network_requests=0 profile_writes=0 "
        + "qa_second_confirmations=2 authoritative_mutations=0 "
        + "outcome_actions=1 actual_left_clicks=5 press_frames=5 "
        + f"chapter_frames={TOOL.EXPECTED_CHAPTER_FRAME_COUNT} "
        + "transition_frames=31"
    )
    lines.append(
        TOOL.END_MARKER
        + " completed=true speed=1.00x profile=isolated backend=false "
        + "owner_review_status=pending"
    )
    return "\n".join(lines) + "\n"


def _probe(
    *,
    duration: str = "48.100000",
    frame_count: str = "1443",
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
            self.assertEqual(command.count("--perf-probe"), 1)
            self.assertNotIn("--script", command)
            self.assertNotIn("--user-data-dir", command)
            self.assertIn(TOOL.MAIN_SCENE, command)
        self.assertNotIn("--write-movie", native)
        self.assertEqual(movie.count("--write-movie"), 1)

    def test_client1_lane_is_explicitly_bound_and_restored(self) -> None:
        profile = TOOL._qa_lane_profile("client1")
        original_lane = TOOL.MEDIA.QA_LANE
        with TOOL._selected_media_lane(profile):
            command = TOOL._build_godot_command(
                godot="/Applications/Godot.app/Contents/MacOS/Godot",
                report_path=Path("/tmp/client1.json"),
                avi_path=None,
            )
            self.assertEqual(command.count(profile["argument"]), 1)
            validated = TOOL._validate_godot_report(
                _godot_report(qa_lane="client1")
            )
            self.assertEqual(validated["qaLane"], "client1")
            self.assertEqual(
                validated["qaLaneFeature"],
                "beastbound_qa_client1",
            )
        self.assertEqual(TOOL.MEDIA.QA_LANE, original_lane)

    def test_unknown_lane_is_rejected(self) -> None:
        with self.assertRaises(TOOL.FusionMainRecordingError):
            TOOL._qa_lane_profile("scratch")

    def test_exact_godot_report_passes(self) -> None:
        validated = TOOL._validate_godot_report(_godot_report())
        self.assertEqual(
            validated["renderedChapterFrameCount"],
            TOOL.EXPECTED_CHAPTER_FRAME_COUNT,
        )
        self.assertEqual(validated["actualLeftClicks"], 5)

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

    def test_authoritative_mutation_report_is_rejected(self) -> None:
        report = _godot_report()
        report["authoritativeMutationExecuted"] = True
        report["authoritativeMutationCount"] = 1
        with self.assertRaises(TOOL.FusionMainRecordingError):
            TOOL._validate_godot_report(report)

    def test_failure_consumption_guess_is_rejected(self) -> None:
        report = _godot_report()
        failure = next(
            chapter
            for chapter in report["chapters"]
            if chapter["state"] == "failure"
        )
        failure["snapshot"]["outcomeConsumptionText"] = "材料可能已消耗。"
        with self.assertRaises(TOOL.FusionMainRecordingError):
            TOOL._validate_godot_report(report)

    def test_success_outcome_portrait_binding_is_required(self) -> None:
        report = _godot_report()
        success = next(
            chapter
            for chapter in report["chapters"]
            if chapter["id"] == "moss_success"
        )
        success["snapshot"]["outcomePortraitResourcePath"] = "res://wrong.png"
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
            self.assertEqual(movie["performance"]["sampleCount"], 4)

    def test_high_process_total_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            report_path = root / "report.json"
            report_path.write_text(
                json.dumps(_godot_report(), ensure_ascii=False),
                encoding="utf-8",
            )
            log_path = root / "native.log"
            log_path.write_text(
                _godot_log(movie=False, process_total_ms=20.0),
                encoding="utf-8",
            )
            with self.assertRaises(TOOL.FusionMainRecordingError):
                TOOL._validate_godot_log(
                    log_path,
                    report_path=report_path,
                    movie_mode=False,
                )

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
                _probe(duration="46.900000", frame_count="1407")
            )


if __name__ == "__main__":
    unittest.main()
