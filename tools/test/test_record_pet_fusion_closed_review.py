from __future__ import annotations

import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest import mock


TOOL_PATH = (
    Path(__file__).resolve().parents[1]
    / "record_pet_fusion_closed_review.py"
)
SPEC = importlib.util.spec_from_file_location(
    "record_pet_fusion_closed_review",
    TOOL_PATH,
)
assert SPEC is not None and SPEC.loader is not None
TOOL = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(TOOL)


def _probe(
    *,
    codec: str = "h264",
    pixel_format: str = "yuv420p",
    width: int = 1280,
    height: int = 720,
    average_fps: str = "30/1",
    real_fps: str = "30/1",
    frame_count: str = "900",
    duration: str = "30.000000",
    with_audio: bool = False,
) -> dict:
    streams = [
        {
            "codec_type": "video",
            "codec_name": codec,
            "pix_fmt": pixel_format,
            "width": width,
            "height": height,
            "avg_frame_rate": average_fps,
            "r_frame_rate": real_fps,
            "nb_read_frames": frame_count,
            "duration": duration,
        }
    ]
    if with_audio:
        streams.append(
            {
                "codec_type": "audio",
                "codec_name": "aac",
                "duration": duration,
            }
        )
    return {
        "streams": streams,
        "format": {"duration": duration},
    }


def _sequence_report() -> dict:
    expected_user_data_root = str(
        Path("/tmp/GodotFusionReview.app").resolve()
    )
    chapters = []
    cursor = 0
    for chapter_id, state, route, frame_count in TOOL.EXPECTED_CHAPTERS:
        end = cursor + frame_count
        target = TOOL.EXPECTED_ROUTE_TARGETS[route]
        target_form_id = str(target["formId"])
        snapshot = {
            "closed": state == "closed",
            "messageText": "融合功能尚未开放",
            "targetName": (
                "" if state == "closed" else str(target["name"])
            ),
            "targetFormId": (
                "" if state == "closed" else target_form_id
            ),
            "targetPortraitResourcePath": (
                ""
                if state == "closed"
                else (
                    "res://assets/pets/"
                    f"{target_form_id}/portrait/default.png"
                )
            ),
            "targetPortraitStatus": (
                "none" if state == "closed" else "formal"
            ),
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
                "postDrawFrameCount": (
                    frame_count - 1
                    if chapter_id == "closed_final"
                    else frame_count
                ),
                "movieWriterTerminalFrameCount": (
                    1 if chapter_id == "closed_final" else 0
                ),
                "startTimeSeconds": cursor / 30.0,
                "centerTimeSeconds": (
                    cursor + frame_count // 2
                )
                / 30.0,
                "endTimeSeconds": end / 30.0,
                "snapshot": snapshot,
                "errors": [],
            }
        )
        cursor = end
    return {
        "schemaVersion": 1,
        "reportType": (
            "beastbound.pet_fusion_closed_owner_review_sequence"
        ),
        "result": "PASS",
        "viewport": {"width": 1280, "height": 720},
        "displayServer": "macos",
        "renderingDriverRequiredByRecorder": "metal",
        "window": {
            "mode": 0,
            "modeName": "windowed",
            "visible": True,
            "width": 1280,
            "height": 720,
        },
        "captureFps": 30,
        "playbackSpeed": 1.0,
        "expectedFrameCount": 900,
        "postDrawSequenceFrameCount": 899,
        "movieWriterTerminalFrameCount": 1,
        "renderedSequenceFrameCount": 900,
        "expectedDurationSeconds": 30.0,
        "productionRuntimeEnabled": False,
        "playerEntryOpened": False,
        "formalPortraitsRequired": True,
        "secondConfirmationExecuted": False,
        "networkRequestCount": 0,
        "expectedUserDataRoot": expected_user_data_root,
        "actualUserDataDir": (
            expected_user_data_root
            + "/Contents/editor_data/"
            "app_userdata/Beastbound Odyssey"
        ),
        "userDataIsolationVerified": True,
        "normalPlayerUserDataUsed": False,
        "chapters": chapters,
        "ownerReviewStatus": "pending",
        "errors": [],
    }


def _timeline(
    *,
    frame_count: int = 900,
    drift_index: int | None = None,
    duration_index: int | None = None,
) -> dict:
    frames = []
    for index in range(frame_count):
        pts = index / 30.0
        if drift_index == index:
            pts += 0.01
        duration = 1.0 / 30.0
        if duration_index == index:
            duration = 0.02
        frames.append(
            {
                "media_type": "video",
                "pts_time": f"{pts:.6f}",
                "best_effort_timestamp_time": f"{pts:.6f}",
                "duration_time": f"{duration:.6f}",
            }
        )
    return {"frames": frames}


def _visual_signature_text(
    *,
    altered_frame: int | None = None,
    merge_chapter_index: int | None = None,
    merge_nonadjacent_routes: bool = False,
) -> str:
    headers = [
        "#format: frame checksums",
        "#version: 2",
        "#hash: SHA256",
        "#software: Lavf-test",
        "#tb 0: 1/30",
        "#media_type 0: video",
        "#codec_id 0: rawvideo",
        "#dimensions 0: 1280x720",
        "#sar 0: 1/1",
        "#stream#, dts, pts, duration, size, hash",
    ]
    signatures = [
        hashlib.sha256(f"chapter-{index}".encode()).hexdigest()
        for index in range(len(TOOL.EXPECTED_CHAPTERS))
    ]
    signatures[-1] = signatures[0]
    if merge_chapter_index is not None:
        signatures[merge_chapter_index] = signatures[
            merge_chapter_index - 1
        ]
    if merge_nonadjacent_routes:
        signatures[3] = signatures[1]
    rows = []
    frame_index = 0
    for chapter_index, chapter in enumerate(TOOL.EXPECTED_CHAPTERS):
        signature = signatures[chapter_index]
        for _offset in range(chapter[3]):
            current = signature
            if altered_frame == frame_index:
                current = hashlib.sha256(b"altered").hexdigest()
            rows.append(
                "0, {0}, {0}, 1, 3686400, {1}".format(
                    frame_index,
                    current,
                )
            )
            frame_index += 1
    return "\n".join([*headers, *rows, ""])


def _psnr_text(
    *,
    frame_count: int = 900,
    low_frame: int | None = None,
    wrong_number_frame: int | None = None,
) -> str:
    rows = []
    for index in range(frame_count):
        number = index + 1
        if wrong_number_frame == index:
            number += 1
        psnr = 40.0 if low_frame == index else 51.25
        rows.append(
            "n:{0} mse_avg:0.49 mse_y:0.52 mse_u:0.40 "
            "mse_v:0.35 psnr_avg:{1:.2f} psnr_y:50.96 "
            "psnr_u:52.11 psnr_v:52.69".format(number, psnr)
        )
    return "\n".join([*rows, ""])


def _write_formal_portrait_fixture(repo_root: Path) -> Path:
    catalog_path = (
        repo_root / "client" / "godot" / "data" / "pet_art_catalog.json"
    )
    catalog_path.parent.mkdir(parents=True)
    forms = []
    for form_id in TOOL.FORM_IDS:
        relative_root = Path("client/godot/assets/pets") / form_id
        root = repo_root / relative_root
        for relative in TOOL.PORTRAIT_PATHS:
            path = root / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(f"{form_id}:{relative}".encode("utf-8"))
        runtime = root / "portrait" / "default.png"
        master = (
            root / "source" / "portrait" / "headshot-master-1024.png"
        )
        metadata = {
            "formId": form_id,
            "semanticIndependenceVerified": False,
            "fullBodyCropAllowed": False,
            "ownerReview": {
                "required": True,
                "status": "owner_review_pending",
            },
            "assets": {
                "runtime": {
                    "path": (
                        relative_root / "portrait" / "default.png"
                    ).as_posix(),
                    "sha256": TOOL._sha256(runtime),
                    "width": 512,
                    "height": 512,
                },
                "master": {
                    "path": (
                        relative_root
                        / "source"
                        / "portrait"
                        / "headshot-master-1024.png"
                    ).as_posix(),
                    "sha256": TOOL._sha256(master),
                    "width": 1024,
                    "height": 1024,
                },
            },
        }
        (
            root / "portrait" / "portrait-meta.json"
        ).write_text(json.dumps(metadata), encoding="utf-8")
        attestation = {
            "ownerReviewStatus": "owner_review_pending",
            "semanticIndependenceVerified": False,
        }
        (
            root
            / "source"
            / "portrait"
            / "generation-attestation.json"
        ).write_text(json.dumps(attestation), encoding="utf-8")
        forms.append(
            {
                "formId": form_id,
                "runtimeEnabled": False,
                "pet": {
                    "root": relative_root.as_posix(),
                    "portraitPath": (
                        relative_root / "portrait" / "default.png"
                    ).as_posix(),
                },
            }
        )
    catalog_path.write_text(
        json.dumps({"forms": forms}),
        encoding="utf-8",
    )
    return catalog_path


class FusionReviewRecorderTests(unittest.TestCase):
    def test_godot_command_is_visible_metal_isolated_and_one_x(self) -> None:
        command = TOOL._build_godot_command(
            godot="/opt/godot",
            expected_user_data_root=Path(
                "/tmp/GodotFusionReview.app"
            ),
            avi_path=Path("/tmp/raw.avi"),
            sequence_report=Path("/tmp/report.json"),
        )
        self.assertEqual(
            command[:3],
            [
                TOOL.NETWORK_SANDBOX_EXECUTABLE,
                "-p",
                TOOL.NETWORK_SANDBOX_PROFILE,
            ],
        )
        self.assertIn("--display-driver", command)
        self.assertEqual(
            command[command.index("--display-driver") + 1],
            "macos",
        )
        self.assertEqual(
            command[command.index("--rendering-driver") + 1],
            "metal",
        )
        self.assertEqual(
            command[command.index("--resolution") + 1],
            "1280x720",
        )
        self.assertEqual(
            command[command.index("--fixed-fps") + 1],
            "30",
        )
        self.assertEqual(
            command[command.index("--time-scale") + 1],
            "1.0",
        )
        self.assertNotIn("--user-data-dir", command)
        self.assertEqual(
            command[command.index("--script") + 1],
            TOOL.SEQUENCE_SCRIPT,
        )
        self.assertIn(
            (
                "--expected-user-data-root="
                "/tmp/GodotFusionReview.app"
            ),
            command,
        )
        self.assertNotIn("--headless", command)
        self.assertNotIn("Main.tscn", " ".join(command))

    def test_transcode_has_no_speed_or_timing_transform(self) -> None:
        command = TOOL._build_transcode_command(
            ffmpeg="ffmpeg",
            avi_path=Path("/tmp/raw.avi"),
            candidate_path=Path("/tmp/candidate.mp4"),
        )
        TOOL._assert_no_timing_transform(command)
        self.assertIn("-an", command)
        self.assertNotIn("-r", command)
        self.assertEqual(
            command[command.index("-vf") + 1],
            TOOL.TRANSCODE_VIDEO_FILTER,
        )
        self.assertEqual(
            command[command.index("-x264-params") + 1],
            "keyint=900:min-keyint=900:scenecut=0",
        )

    def test_transcode_rejects_timing_options_and_filters(self) -> None:
        valid = TOOL._build_transcode_command(
            ffmpeg="ffmpeg",
            avi_path=Path("/tmp/raw.avi"),
            candidate_path=Path("/tmp/candidate.mp4"),
        )
        variants = (
            [*valid[:-1], "-r", "60", valid[-1]],
            [
                *valid[: valid.index("-vf") + 1],
                "setpts=0.5*PTS,format=yuv420p",
                *valid[valid.index("-vf") + 2 :],
            ],
            [*valid[:-1], "-filter_complex", "fps=60", valid[-1]],
        )
        for command in variants:
            with self.subTest(command=command):
                with self.assertRaises(TOOL.FusionReviewRecordingError):
                    TOOL._assert_no_timing_transform(command)

    def test_probe_requires_exact_silent_900_frame_media(self) -> None:
        media = TOOL._validate_probe(_probe())
        self.assertEqual(media["frameCount"], 900)
        self.assertEqual(media["durationSeconds"], 30.0)
        self.assertFalse(media["audioPresent"])
        invalid = (
            _probe(codec="hevc"),
            _probe(pixel_format="yuv444p"),
            _probe(width=1920),
            _probe(average_fps="60/1"),
            _probe(real_fps="30000/1001"),
            _probe(frame_count="899"),
            _probe(duration="29.500000"),
            _probe(with_audio=True),
        )
        for value in invalid:
            with self.subTest(probe=value):
                with self.assertRaises(TOOL.FusionReviewRecordingError):
                    TOOL._validate_probe(value)

    def test_frame_timeline_proves_every_pts_and_duration_is_one_x(
        self,
    ) -> None:
        result = TOOL._validate_frame_timeline(_timeline())
        self.assertEqual(result["frameCount"], 900)
        self.assertTrue(result["constantFrameIntervalVerified"])
        self.assertTrue(result["allPtsMatchFrameIndexAt30Fps"])
        self.assertAlmostEqual(result["timelineEndSeconds"], 30.0)

    def test_frame_timeline_rejects_vfr_drift_or_wrong_count(self) -> None:
        invalid = (
            _timeline(frame_count=899),
            _timeline(drift_index=451),
            _timeline(duration_index=312),
        )
        for timeline in invalid:
            with self.subTest(frame_count=len(timeline["frames"])):
                with self.assertRaises(TOOL.FusionReviewRecordingError):
                    TOOL._validate_frame_timeline(timeline)

    def test_raw_visual_signatures_prove_every_chapter_boundary(
        self,
    ) -> None:
        result = TOOL._validate_frame_visual_signatures(
            _visual_signature_text()
        )
        self.assertEqual(result["frameCount"], 900)
        self.assertEqual(result["visualStateCount"], 5)
        self.assertTrue(result["exactChapterBoundariesVerified"])
        self.assertTrue(
            result[
                "terminalFrameMatchesClosedFinalRangeSignature"
            ]
        )
        self.assertEqual(
            result["chapters"][0]["sha256"],
            result["chapters"][-1]["sha256"],
        )

    def test_raw_visual_signatures_reject_boundary_or_terminal_drift(
        self,
    ) -> None:
        invalid = (
            _visual_signature_text(altered_frame=120),
            _visual_signature_text(altered_frame=899),
            _visual_signature_text(merge_chapter_index=2),
            _visual_signature_text(merge_nonadjacent_routes=True),
        )
        for text in invalid:
            with self.subTest():
                with self.assertRaises(
                    TOOL.FusionReviewRecordingError
                ):
                    TOOL._validate_frame_visual_signatures(text)

    def test_lossy_h264_fidelity_compares_every_same_index_frame(
        self,
    ) -> None:
        result = TOOL._validate_transcode_fidelity(_psnr_text())
        self.assertEqual(result["frameCount"], 900)
        self.assertTrue(
            result["allFramesComparedToSameIndexRawFrame"]
        )
        self.assertTrue(result["allFramesMeetFidelityThreshold"])
        self.assertEqual(result["minimumObservedPsnrDb"], 51.25)
        self.assertTrue(
            result["terminalFrameMatchesRawClosedFinalAtSameIndex"]
        )

    def test_lossy_h264_fidelity_rejects_low_wrong_or_missing_frame(
        self,
    ) -> None:
        invalid = (
            _psnr_text(low_frame=899),
            _psnr_text(wrong_number_frame=450),
            _psnr_text(frame_count=899),
        )
        for text in invalid:
            with self.subTest():
                with self.assertRaises(
                    TOOL.FusionReviewRecordingError
                ):
                    TOOL._validate_transcode_fidelity(text)

    def test_complex_static_ui_h264_uses_bounded_fidelity(
        self,
    ) -> None:
        ffmpeg = shutil.which("ffmpeg")
        if ffmpeg is None:
            self.skipTest("ffmpeg unavailable")
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            raw = root / "complex-static-ui.avi"
            candidate = root / "complex-static-ui.mp4"
            source_filter = (
                "color=c=0x18212b:s=1280x720:r=30:d=30,"
                "drawgrid=w=31:h=23:t=1:c=0x435160,"
                "drawbox=x=75:y=70:w=440:h=180:"
                "c=0x2472a4:t=fill:"
                "enable='between(t,4,9.999)',"
                "drawbox=x=690:y=105:w=410:h=220:"
                "c=0xa44732:t=fill:"
                "enable='between(t,10,14.999)',"
                "drawbox=x=135:y=390:w=520:h=210:"
                "c=0x327a54:t=fill:"
                "enable='between(t,15,20.999)',"
                "drawbox=x=735:y=380:w=370:h=190:"
                "c=0xb28125:t=fill:"
                "enable='between(t,21,25.999)'"
            )
            TOOL._run_logged(
                [
                    ffmpeg,
                    "-y",
                    "-v",
                    "error",
                    "-f",
                    "lavfi",
                    "-i",
                    source_filter,
                    "-c:v",
                    "mjpeg",
                    "-q:v",
                    "2",
                    "-pix_fmt",
                    "yuvj420p",
                    "-an",
                    str(raw),
                ],
                log_path=root / "raw.log",
                timeout_seconds=180.0,
            )
            raw_signature = TOOL._write_frame_visual_signatures(
                ffmpeg=ffmpeg,
                video_path=raw,
                output_path=root / "raw-signatures.sha256",
                expected_frame_count=900,
            )
            self.assertEqual(raw_signature["visualStateCount"], 5)
            TOOL._run_logged(
                TOOL._build_transcode_command(
                    ffmpeg=ffmpeg,
                    avi_path=raw,
                    candidate_path=candidate,
                ),
                log_path=root / "transcode.log",
                timeout_seconds=180.0,
            )
            fidelity = TOOL._write_transcode_fidelity(
                ffmpeg=ffmpeg,
                raw_video_path=raw,
                candidate_video_path=candidate,
                output_path=root / "fidelity.txt",
                expected_frame_count=900,
            )
            self.assertTrue(
                fidelity["allFramesMeetFidelityThreshold"]
            )
            self.assertGreaterEqual(
                float(fidelity["minimumObservedPsnrDb"]),
                TOOL.MIN_TRANSCODE_PSNR_DB,
            )
            with self.assertRaises(
                TOOL.FusionReviewRecordingError
            ):
                TOOL._write_frame_visual_signatures(
                    ffmpeg=ffmpeg,
                    video_path=candidate,
                    output_path=root / "wrong-exact-gate.sha256",
                    expected_frame_count=900,
                    media_label="lossy_complex_ui",
                )

    def test_sequence_report_requires_all_six_closed_safe_chapters(self) -> None:
        report = TOOL._validate_sequence_report(
            _sequence_report(),
            expected_user_data_root=Path(
                "/tmp/GodotFusionReview.app"
            ).resolve(),
        )
        self.assertEqual(len(report["chapters"]), 6)
        self.assertEqual(report["networkRequestCount"], 0)
        self.assertFalse(report["secondConfirmationExecuted"])
        self.assertFalse(report["productionRuntimeEnabled"])
        self.assertFalse(report["playerEntryOpened"])

    def test_self_contained_godot_clone_uses_disposable_markers(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            original = (
                root
                / "Installed"
                / "Godot.app"
                / "Contents"
                / "MacOS"
                / "Godot"
            )
            original.parent.mkdir(parents=True)
            original.write_bytes(b"godot")
            run_tmp = root / "run" / "tmp"
            run_tmp.mkdir(parents=True)
            clone_log = root / "clone.log"

            def fake_copy(
                command: list[str],
                *,
                log_path: Path,
                timeout_seconds: float,
                environment: dict[str, str] | None = None,
            ) -> None:
                self.assertEqual(command[:2], ["/bin/cp", "-cR"])
                destination = Path(command[-1])
                executable = (
                    destination
                    / "Contents"
                    / "MacOS"
                    / "Godot"
                )
                executable.parent.mkdir(parents=True)
                executable.write_bytes(b"godot-clone")
                log_path.write_text("clone ok\n", encoding="utf-8")

            with mock.patch.object(
                TOOL,
                "_run_logged",
                side_effect=fake_copy,
            ):
                clone_executable, clone_root = (
                    TOOL._prepare_self_contained_godot(
                        original_godot=str(original),
                        temporary_dir=run_tmp,
                        clone_log=clone_log,
                        timeout_seconds=5.0,
                    )
                )
            self.assertEqual(
                Path(clone_executable),
                clone_root / "Contents" / "MacOS" / "Godot",
            )
            self.assertTrue(
                (run_tmp / "._sc_").is_file()
            )
            self.assertTrue(
                (clone_root / "Contents" / "._sc_").is_file()
            )
            self.assertTrue(
                (
                    clone_root
                    / "Contents"
                    / "MacOS"
                    / "._sc_"
                ).is_file()
            )
            self.assertTrue(
                TOOL._remove_generated_godot_clone(clone_root)
            )
            self.assertFalse(clone_root.exists())
            self.assertFalse((run_tmp / "._sc_").exists())

    def test_clone_cleanup_handles_partial_copy_and_rejects_marker_symlink(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            temporary_dir = Path(temporary) / "tmp"
            temporary_dir.mkdir()
            clone_root = temporary_dir / "GodotFusionReview.app"
            clone_root.mkdir()
            self.assertTrue(
                TOOL._remove_generated_godot_clone(clone_root)
            )
            self.assertFalse(clone_root.exists())

            marker = temporary_dir / "._sc_"
            marker.touch()
            self.assertTrue(
                TOOL._remove_generated_godot_clone(clone_root)
            )
            self.assertFalse(marker.exists())

            marker.symlink_to(temporary_dir / "outside")
            with self.assertRaisesRegex(
                TOOL.FusionReviewRecordingError,
                "marker",
            ):
                TOOL._remove_generated_godot_clone(clone_root)
            self.assertTrue(marker.is_symlink())

    def test_isolated_user_data_must_be_inside_clone_and_is_preserved(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            repo_root = Path(temporary).resolve()
            clone_root = (
                repo_root
                / ".run"
                / "evidence"
                / "review"
                / "tmp"
                / "GodotFusionReview.app"
            )
            actual = (
                clone_root
                / "Contents"
                / "editor_data"
                / "app_userdata"
                / "Beastbound Odyssey"
            )
            actual.mkdir(parents=True)
            (actual / "capture.json").write_text(
                "{}\n",
                encoding="utf-8",
            )
            destination = clone_root.parent.parent / "user-data"
            with mock.patch.object(TOOL, "REPO_ROOT", repo_root):
                inventory = TOOL._preserve_isolated_user_data(
                    actual_user_data_dir=actual,
                    allowed_root=clone_root,
                    destination=destination,
                )
            self.assertFalse(actual.exists())
            self.assertTrue(
                (destination / "capture.json").is_file()
            )
            self.assertEqual(inventory["fileCount"], 1)
            self.assertFalse(
                inventory["normalPlayerSavePathUsed"]
            )

            outside = repo_root / "normal-player-user-data"
            outside.mkdir()
            (outside / "save.json").write_text(
                "{}\n",
                encoding="utf-8",
            )
            with self.assertRaisesRegex(
                TOOL.FusionReviewRecordingError,
                "没有落在",
            ):
                TOOL._preserve_isolated_user_data(
                    actual_user_data_dir=outside,
                    allowed_root=clone_root,
                    destination=repo_root / "forbidden",
                )

            second_actual = (
                clone_root / "isolated-home" / "second-user-data"
            )
            second_actual.mkdir(parents=True)
            occupied = repo_root / "occupied-user-data"
            occupied.mkdir()
            with self.assertRaisesRegex(
                TOOL.FusionReviewRecordingError,
                "目标已存在",
            ):
                TOOL._preserve_isolated_user_data(
                    actual_user_data_dir=second_actual,
                    allowed_root=clone_root,
                    destination=occupied,
                )
            self.assertTrue(second_actual.is_dir())

    def test_isolated_environment_overrides_only_child_home(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            temporary_dir = Path(temporary) / "tmp"
            temporary_dir.mkdir()
            parent_home = os.environ.get("HOME")
            environment = TOOL._isolated_environment(temporary_dir)
            self.assertEqual(os.environ.get("HOME"), parent_home)
            self.assertEqual(
                Path(environment["HOME"]),
                temporary_dir / "isolated-home",
            )
            self.assertTrue(Path(environment["HOME"]).is_dir())
            self.assertEqual(
                environment["TMPDIR"],
                str(temporary_dir),
            )

    def test_sequence_report_rejects_second_click_or_placeholder(self) -> None:
        second_click = _sequence_report()
        second_click["chapters"][2]["snapshot"][
            "secondConfirmationCount"
        ] = 1
        placeholder = _sequence_report()
        placeholder["chapters"][3]["snapshot"][
            "targetPortraitStatus"
        ] = "qa_placeholder"
        network = _sequence_report()
        network["networkRequestCount"] = 1
        swapped_route = _sequence_report()
        moss_target = TOOL.EXPECTED_ROUTE_TARGETS["moss"]
        swapped_route["chapters"][1]["snapshot"].update(
            {
                "targetName": moss_target["name"],
                "targetFormId": moss_target["formId"],
                "targetPortraitResourcePath": (
                    "res://assets/pets/"
                    f"{moss_target['formId']}/portrait/default.png"
                ),
            }
        )
        for report in (
            second_click,
            placeholder,
            network,
            swapped_route,
        ):
            with self.subTest(report=report):
                with self.assertRaises(TOOL.FusionReviewRecordingError):
                    TOOL._validate_sequence_report(report)

    def test_chapter_samples_use_each_reported_center(self) -> None:
        report = _sequence_report()
        samples = TOOL._chapter_sample_times(report)
        self.assertEqual(
            tuple(value[0] for value in samples),
            tuple(value[0] for value in TOOL.EXPECTED_CHAPTERS),
        )
        self.assertEqual(samples[0][1], 2.0)
        self.assertEqual(samples[-1][1], 28.0)

    def test_capture_log_requires_metal_and_exact_movie_contract(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "godot.log"
            path.write_text(
                "Godot Engine v4.7\n"
                "Metal 4.0 - Forward Mobile - Using Device #0: Apple\n"
                "Movie Maker mode enabled, recording movie in "
                "1280×720 @ 30 FPS...\n",
                encoding="utf-8",
            )
            evidence = TOOL._validate_godot_capture_log(path)
            self.assertEqual(evidence["renderingDriver"], "metal")
            path.write_text(
                "Godot Engine v4.7\n"
                "Movie Maker mode enabled, recording movie in "
                "1280×720 @ 30 FPS...\n",
                encoding="utf-8",
            )
            with self.assertRaises(TOOL.FusionReviewRecordingError):
                TOOL._validate_godot_capture_log(path)

    def test_runtime_monitor_requires_visible_offline_godot_window(
        self,
    ) -> None:
        monitor = {
            "pid": 12345,
            "socketSampleCount": 4,
            "visibleWindow": {
                "status": "window",
                "processName": "Godot",
                "processVisible": True,
                "windowCount": 1,
                "minimizedWindowCount": 0,
                "axMinimizedReadCount": 1,
                "nonMinimizedOnScreenWindowCount": 1,
                "primaryVisibleWindowBounds": {
                    "x": 100,
                    "y": 100,
                    "width": 1280,
                    "height": 748,
                },
                "mainScreenBounds": {
                    "left": 0,
                    "top": 0,
                    "right": 2560,
                    "bottom": 1600,
                },
                "primaryVisibleIntersection": {
                    "x": 100,
                    "y": 100,
                    "width": 1280,
                    "height": 748,
                },
                "primaryVisibleArea": 957440,
                "primaryWindowArea": 957440,
                "primaryVisibleFraction": 1.0,
            },
            "internetSocketLines": [],
            "mysqlUnixSocketLines": [],
            "descendantProcesses": [],
        }
        monitor["windowObservations"] = [
            dict(monitor["visibleWindow"]) for _index in range(4)
        ]
        monitor["socketSamples"] = [
            {
                "elapsedSeconds": float(index),
                "pids": [12345],
                "internetSocketLines": [],
                "mysqlUnixSocketLines": [],
            }
            for index in range(4)
        ]
        monitor["networkSandbox"] = {
            "executable": TOOL.NETWORK_SANDBOX_EXECUTABLE,
            "profile": TOOL.NETWORK_SANDBOX_PROFILE,
            "denyNetworkSyscalls": True,
            "inheritedByDescendants": True,
        }
        interrupted_window = {
            **monitor["visibleWindow"],
            "minimizedWindowCount": 1,
            "nonMinimizedOnScreenWindowCount": 0,
            "primaryVisibleFraction": 0.0,
        }
        interrupted_monitor = {
            **monitor,
            "windowObservations": [
                monitor["visibleWindow"],
                interrupted_window,
                monitor["visibleWindow"],
            ],
            "socketSampleCount": 3,
            "socketSamples": monitor["socketSamples"][:3],
        }
        validated = TOOL._validate_runtime_monitor(monitor)
        self.assertTrue(
            validated["visibleWindowProcessVerified"]
        )
        self.assertTrue(
            validated["visibleNonMinimizedWindowVerified"]
        )
        self.assertFalse(validated["internetSocketObserved"])
        invalid_values = (
            {**monitor, "visibleWindow": None},
            {
                **monitor,
                "visibleWindow": {
                    **monitor["visibleWindow"],
                    "minimizedWindowCount": 1,
                    "nonMinimizedOnScreenWindowCount": 0,
                    "primaryVisibleWindowBounds": {
                        "x": 0,
                        "y": 0,
                        "width": 0,
                        "height": 0,
                    },
                },
            },
            {
                **monitor,
                "visibleWindow": {
                    **monitor["visibleWindow"],
                    "primaryVisibleIntersection": {
                        "x": 2559,
                        "y": 1599,
                        "width": 1,
                        "height": 1,
                    },
                    "primaryVisibleArea": 1,
                    "primaryVisibleFraction": (
                        1.0 / 957440.0
                    ),
                },
            },
            {**monitor, "internetSocketLines": ["Godot TCP 127.0.0.1"]},
            {
                **monitor,
                "mysqlUnixSocketLines": ["Godot /tmp/mysql.sock"],
            },
            {
                **monitor,
                "descendantProcesses": [
                    {
                        "pid": 2,
                        "parentPid": 1,
                        "command": "/usr/local/bin/node",
                    }
                ],
            },
            interrupted_monitor,
        )
        for value in invalid_values:
            with self.subTest(value=value):
                with self.assertRaises(TOOL.FusionReviewRecordingError):
                    TOOL._validate_runtime_monitor(value)

    def test_window_observation_preserves_transient_sample_failure(
        self,
    ) -> None:
        with mock.patch.object(
            TOOL,
            "_run_capture",
            side_effect=TOOL.FusionReviewRecordingError(
                "forced accessibility timeout"
            ),
        ):
            observation = TOOL._window_observation(
                12345,
                screen_bounds={
                    "left": 0,
                    "top": 0,
                    "right": 1280,
                    "bottom": 720,
                },
            )
        self.assertEqual(observation["status"], "error")
        self.assertIn(
            "forced accessibility timeout",
            observation["error"],
        )

    def test_release_report_must_remain_closed(self) -> None:
        valid = {
            "status": "PASS",
            "runtimeEnabled": False,
            "playerEntryOpened": False,
        }
        self.assertEqual(
            TOOL._validate_release_report(valid)["status"],
            "PASS",
        )
        for field in ("runtimeEnabled", "playerEntryOpened"):
            invalid = dict(valid)
            invalid[field] = True
            with self.subTest(field=field):
                with self.assertRaises(TOOL.FusionReviewRecordingError):
                    TOOL._validate_release_report(invalid)

    def test_formal_portrait_preflight_requires_all_files_and_pending_state(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            repo_root = Path(temporary)
            catalog_path = _write_formal_portrait_fixture(repo_root)
            with (
                mock.patch.object(TOOL, "REPO_ROOT", repo_root),
                mock.patch.object(TOOL, "ART_CATALOG", catalog_path),
            ):
                records = TOOL._portrait_readiness()
                self.assertEqual(
                    tuple(record["formId"] for record in records),
                    TOOL.FORM_IDS,
                )
                self.assertTrue(
                    all(
                        record["ownerReviewStatus"]
                        == "owner_review_pending"
                        for record in records
                    )
                )

                missing = (
                    repo_root
                    / "client"
                    / "godot"
                    / "assets"
                    / "pets"
                    / TOOL.FORM_IDS[0]
                    / "portrait"
                    / "default.png"
                )
                missing.unlink()
                with self.assertRaisesRegex(
                    TOOL.FusionReviewRecordingError,
                    "正式 portrait 文件",
                ):
                    TOOL._portrait_readiness()

    def test_formal_portrait_preflight_rejects_implicit_owner_approval(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            repo_root = Path(temporary)
            catalog_path = _write_formal_portrait_fixture(repo_root)
            metadata_path = (
                repo_root
                / "client"
                / "godot"
                / "assets"
                / "pets"
                / TOOL.FORM_IDS[1]
                / "portrait"
                / "portrait-meta.json"
            )
            metadata = json.loads(metadata_path.read_text())
            metadata["ownerReview"]["status"] = "approved"
            metadata_path.write_text(json.dumps(metadata), encoding="utf-8")
            with (
                mock.patch.object(TOOL, "REPO_ROOT", repo_root),
                mock.patch.object(TOOL, "ART_CATALOG", catalog_path),
            ):
                with self.assertRaisesRegex(
                    TOOL.FusionReviewRecordingError,
                    "ownerReview.status",
                ):
                    TOOL._portrait_readiness()

    def test_output_root_cannot_escape_evidence(self) -> None:
        with self.assertRaises(TOOL.FusionReviewRecordingError):
            TOOL._resolve_output_root(Path("/tmp/fusion-review"))

    def test_manifest_can_hash_hidden_candidate_as_final_logical_path(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            repo_root = Path(temporary).resolve()
            run_dir = repo_root / ".run" / "evidence" / "review"
            run_dir.mkdir(parents=True)
            candidate = run_dir / ".candidate.mp4"
            candidate.write_bytes(b"validated-video")
            final = run_dir / "review-1x.mp4"
            with mock.patch.object(TOOL, "REPO_ROOT", repo_root):
                manifest = TOOL._write_sha256_manifest(
                    run_dir,
                    [candidate],
                    aliases={candidate: final},
                )
            text = manifest.read_text(encoding="utf-8")
            self.assertIn("  review-1x.mp4\n", text)
            self.assertNotIn(".candidate.mp4", text)
            self.assertFalse(final.exists())

    def test_failed_publication_removes_marker_and_quarantines_video(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            repo_root = Path(temporary).resolve()
            run_dir = repo_root / ".run" / "evidence" / "review"
            run_dir.mkdir(parents=True)
            final = run_dir / "pet-fusion-closed-review-1x.mp4"
            final.write_bytes(b"video")
            (run_dir / "PASS.json").write_text(
                "{}\n",
                encoding="utf-8",
            )
            with mock.patch.object(TOOL, "REPO_ROOT", repo_root):
                result = TOOL._cleanup_failed_publication(run_dir)
            self.assertEqual(result["status"], "passed")
            self.assertTrue(result["passMarkerRemoved"])
            self.assertTrue(result["videoQuarantined"])
            self.assertFalse(result["passNamedVideoPresent"])
            self.assertFalse(
                result["validPublishedPassArtifactPresent"]
            )
            self.assertTrue(
                (
                    run_dir / ".failed-pet-fusion-review.mp4"
                ).is_file()
            )

    def test_failed_publication_reports_quarantine_failure_truthfully(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            repo_root = Path(temporary).resolve()
            run_dir = repo_root / ".run" / "evidence" / "review"
            run_dir.mkdir(parents=True)
            final = run_dir / "pet-fusion-closed-review-1x.mp4"
            final.write_bytes(b"video")
            (run_dir / "PASS.json").write_text(
                "{}\n",
                encoding="utf-8",
            )
            with (
                mock.patch.object(TOOL, "REPO_ROOT", repo_root),
                mock.patch.object(
                    Path,
                    "replace",
                    side_effect=OSError("denied"),
                ),
            ):
                result = TOOL._cleanup_failed_publication(run_dir)
            self.assertEqual(result["status"], "incomplete")
            self.assertTrue(result["passNamedVideoPresent"])
            self.assertFalse(result["passMarkerPresent"])
            self.assertFalse(
                result["validPublishedPassArtifactPresent"]
            )
            self.assertTrue(result["errors"])

    def test_failure_summary_reports_actual_publication_state(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            run_dir = Path(temporary)
            TOOL._write_failure_summary(
                run_dir,
                run_id="fault-injection",
                error=RuntimeError("after promotion"),
                clone_cleanup_succeeded=True,
                publication_cleanup={
                    "status": "incomplete",
                    "validPublishedPassArtifactPresent": True,
                    "passNamedVideoPresent": True,
                    "passMarkerPresent": True,
                    "errors": ["forced cleanup failure"],
                },
            )
            report = json.loads(
                (run_dir / "failure-summary.json").read_text(
                    encoding="utf-8"
                )
            )
            self.assertTrue(
                report["validPublishedPassArtifactPresent"]
            )
            self.assertTrue(
                report["publicationCleanup"][
                    "passNamedVideoPresent"
                ]
            )

    def test_pass_marker_is_written_after_all_fallible_summary_work(
        self,
    ) -> None:
        source = TOOL_PATH.read_text(encoding="utf-8")
        summary_write = source.index(
            "_write_json(summary_path, summary)"
        )
        video_promotion = source.index(
            "candidate_path.replace(final_video_path)"
        )
        marker_write = source.index(
            "_write_json(\n        pass_marker_path,"
        )
        self.assertLess(summary_write, video_promotion)
        self.assertLess(video_promotion, marker_write)
        self.assertIn('"requiresPassMarker": True', source)

    def test_sequence_source_is_fixed_thirty_second_contract(self) -> None:
        source = TOOL.SEQUENCE_SOURCE.read_text(encoding="utf-8")
        for chapter_id, _state, _route, frame_count in (
            TOOL.EXPECTED_CHAPTERS
        ):
            self.assertIn(f'"id": "{chapter_id}"', source)
            self.assertIn(f'"frames": {frame_count}', source)
        self.assertIn("Exactly one local click", source)
        self.assertIn("Never invoke the second confirmation", source)
        self.assertIn('snapshot["targetNameText"] = ""', source)
        self.assertNotIn("_panel.queue_free()", source)
        self.assertNotIn("res://scenes/Main.tscn", source)


if __name__ == "__main__":
    unittest.main()
