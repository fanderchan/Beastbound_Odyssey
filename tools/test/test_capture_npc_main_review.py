from __future__ import annotations

import hashlib
import importlib.util
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from PIL import Image, ImageDraw


SCRIPT = Path(__file__).resolve().parents[1] / "capture_npc_main_review.py"
SPEC = importlib.util.spec_from_file_location("capture_npc_main_review", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
TOOL = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(TOOL)


class CaptureNpcMainReviewTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.project = self.root / "godot"
        self.project.mkdir()
        self.original_project = TOOL.GODOT_PROJECT
        TOOL.GODOT_PROJECT = self.project
        self.addCleanup(setattr, TOOL, "GODOT_PROJECT", self.original_project)
        self.target = dict(TOOL.TARGETS[0])
        self.run_id = "phase327-main-test-v1"
        self.screenshot = self.root / "main-dialog-1280x720.png"
        self.report_path = self.root / "main-dialog-report.json"
        self._write_source_images()
        self._write_screenshot()
        self.report = self._valid_report()
        self._write_report()

    def _write_source_images(self) -> None:
        appearance = self.target["appearanceId"]
        for index, direction in enumerate(TOOL.WORLD_DIRECTIONS):
            world = (
                self.project
                / "assets"
                / "npcs"
                / appearance
                / "world"
                / "directions"
                / direction
                / "idle"
                / "idle-1.png"
            )
            world.parent.mkdir(parents=True)
            world_image = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
            world_draw = ImageDraw.Draw(world_image)
            world_draw.ellipse(
                (72, 40, 184, 244),
                fill=(80 + index * 8, 170 - index * 6, 110 + index * 4, 255),
            )
            world_image.save(world)
        for index, state in enumerate(TOOL.PORTRAIT_STATES):
            portrait = (
                self.project
                / "assets"
                / "npcs"
                / appearance
                / "portrait"
                / f"{state}.png"
            )
            portrait.parent.mkdir(parents=True, exist_ok=True)
            portrait_image = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
            portrait_draw = ImageDraw.Draw(portrait_image)
            portrait_draw.rectangle(
                (72, 32, 440, 500),
                fill=(210 - index * 14, 130 + index * 13, 70 + index * 9, 255),
            )
            portrait_image.save(portrait)

    def _write_screenshot(self) -> None:
        image = Image.new("RGBA", (1280, 720), (20, 60, 70, 255))
        draw = ImageDraw.Draw(image)
        draw.rectangle((0, 360, 1279, 719), fill=(100, 60, 35, 255))
        draw.rectangle((460, 180, 820, 520), fill=(230, 190, 70, 255))
        image.save(self.screenshot)

    def _source(self, kind: str, slot: str, path: str) -> dict[str, object]:
        file_path = TOOL._res_path_to_file(path)
        full_rgba_sha = TOOL._decoded_rgba_sha256(file_path)
        canonical_rgba_sha = TOOL._canonical_source_rgba_sha256(file_path)
        return {
            "kind": kind,
            "slot": slot,
            "path": path,
            "fileSha256": TOOL._sha256(file_path),
            "sourceFullDecodedRgbaSha256": full_rgba_sha,
            "sourceDecodedRgbaSha256": canonical_rgba_sha,
            "loadedDecodedRgbaSha256": canonical_rgba_sha,
            "sourceLoadedRgbaMatch": True,
            "importFresh": True,
            "loadMode": "godot_import",
            "canonicalRgbaMatch": True,
            "status": "passed",
            "errors": [],
        }

    def _valid_report(self) -> dict[str, object]:
        appearance = self.target["appearanceId"]
        facing = self.target["facing"]
        state = self.target["portraitState"]
        frames = [
            self._source(kind, slot, path)
            for kind, slot, path in TOOL._expected_frame_specs(self.target)
        ]
        world_source = next(
            frame
            for frame in frames
            if frame["kind"] == "world" and frame["slot"] == facing
        )
        portrait_source = next(
            frame
            for frame in frames
            if frame["kind"] == "portrait" and frame["slot"] == state
        )
        screenshot_sha = TOOL._sha256(self.screenshot)
        screenshot_rgba = TOOL._decoded_rgba_sha256(self.screenshot)
        return {
            "schemaVersion": TOOL.REPORT_SCHEMA_VERSION,
            "reportType": TOOL.REPORT_TYPE,
            "processKind": "main_capture",
            "runId": self.run_id,
            "status": "passed",
            "ok": True,
            "scene": TOOL.MAIN_SCENE,
            "qaPreview": False,
            "normalPlayerRuntimeEnabled": True,
            "debugBuild": True,
            "displayServer": "metal",
            "runtimeMirroring": False,
            "defaultProfileIsolation": True,
            "profileIsolation": "default_profile_ephemeral_no_save",
            "authAutoBypass": False,
            "accountAuthenticated": False,
            "profileSaveEnabled": False,
            "serverAccountSession": False,
            "appearanceId": appearance,
            "mapId": self.target["mapId"],
            "spawnName": self.target["spawnName"],
            "npcId": self.target["npcId"],
            "facing": facing,
            "portraitState": state,
            "worldVisible": True,
            "portraitVisible": True,
            "dialogVisible": True,
            "dialogVisibleButtonCount": 4,
            "dialogButtonsInBounds": True,
            "debugUiVisible": False,
            "normalPlayerUi": True,
            "qaDebugControlsVisible": False,
            "qaPanelVisible": False,
            "authPanelVisible": False,
            "viewportSize": [1280, 720],
            "checkedFrames": 12,
            "passedFrames": 12,
            "frames": frames,
            "sources": frames,
            "sourceSetSha256": TOOL._source_set_sha256(frames),
            "world": {
                **{
                    key: world_source[key]
                    for key in (
                        "path",
                        "fileSha256",
                        "sourceFullDecodedRgbaSha256",
                        "sourceDecodedRgbaSha256",
                        "loadedDecodedRgbaSha256",
                    )
                },
                "screenRect": [500.0, 180.0, 92.0, 92.0],
            },
            "portrait": {
                **{
                    key: portrait_source[key]
                    for key in (
                        "path",
                        "fileSha256",
                        "sourceFullDecodedRgbaSha256",
                        "sourceDecodedRgbaSha256",
                        "loadedDecodedRgbaSha256",
                    )
                },
                "state": state,
                "screenRect": [380.0, 500.0, 112.0, 112.0],
            },
            "screenshot": {
                "path": str(self.screenshot.resolve()),
                "fileSha256": screenshot_sha,
                "decodedRgbaSha256": screenshot_rgba,
                "width": 1280,
                "height": 720,
            },
            "screenshotPath": str(self.screenshot.resolve()),
            "screenshotSha256": screenshot_sha,
            "visualObservation": (
                "Main.tscn 1280x720 画面同时显示目标 NPC 世界像和 speaking 人像。"
            ),
            "dialog": {
                "npcId": self.target["npcId"],
                "name": "兽栏管理员阿牧",
                "visible": True,
            },
            "errors": [],
        }

    def _write_report(self) -> None:
        self.report_path.write_text(
            json.dumps(self.report, ensure_ascii=False), encoding="utf-8"
        )

    def _validate(self) -> dict[str, object]:
        return TOOL._validate_capture_report(
            self.report_path,
            target=self.target,
            screenshot_path=self.screenshot,
            run_id=self.run_id,
            qa_preview=False,
            normal_player_runtime_enabled=True,
        )

    def test_valid_report_binds_real_main_target_and_sources(self) -> None:
        result = self._validate()
        self.assertEqual(result["scene"], TOOL.MAIN_SCENE)
        self.assertTrue(result["worldVisible"])
        self.assertTrue(result["portraitVisible"])
        self.assertEqual(result["checkedFrames"], 12)
        self.assertEqual(
            [(frame["kind"], frame["slot"]) for frame in result["frames"]],
            [(kind, slot) for kind, slot, _path in TOOL._expected_frame_specs(self.target)],
        )

    def test_rejects_capture_mode_drift(self) -> None:
        self.report["qaPreview"] = True
        self.report["normalPlayerRuntimeEnabled"] = False
        self._write_report()
        with self.assertRaisesRegex(
            TOOL.NpcMainReviewError,
            "qaPreview=.*normalPlayerRuntimeEnabled",
        ):
            self._validate()

    def test_partial_alpha_keeps_full_and_canonical_hash_domains_separate(self) -> None:
        frame = self.report["frames"][0]
        source_path = TOOL._res_path_to_file(str(frame["path"]))
        with Image.open(source_path) as opened:
            image = opened.convert("RGBA")
        image.putpixel((12, 12), (219, 41, 133, 96))
        image.save(source_path)
        image.close()
        full_sha = TOOL._decoded_rgba_sha256(source_path)
        canonical_sha = TOOL._canonical_source_rgba_sha256(source_path)
        self.assertNotEqual(full_sha, canonical_sha)
        frame["fileSha256"] = TOOL._sha256(source_path)
        frame["sourceFullDecodedRgbaSha256"] = full_sha
        frame["sourceDecodedRgbaSha256"] = canonical_sha
        frame["loadedDecodedRgbaSha256"] = canonical_sha
        self.report["sourceSetSha256"] = TOOL._source_set_sha256(
            self.report["frames"]
        )
        self._write_report()
        self._validate()

        frame["sourceFullDecodedRgbaSha256"] = canonical_sha
        self.report["sourceSetSha256"] = TOOL._source_set_sha256(
            self.report["frames"]
        )
        self._write_report()
        with self.assertRaisesRegex(
            TOOL.NpcMainReviewError, "sourceFullDecodedRgbaSha256"
        ):
            self._validate()

    def test_source_set_hash_binds_full_and_canonical_rgba_domains(self) -> None:
        sources = [
            {
                "kind": "world",
                "slot": "south",
                "path": "res://world.png",
                "fileSha256": "file-sha",
                "sourceFullDecodedRgbaSha256": "full-rgba-sha",
                "sourceDecodedRgbaSha256": "canonical-rgba-sha",
            }
        ]
        expected_payload = (
            "world\tsouth\tres://world.png\tfile-sha\t"
            "full-rgba-sha\tcanonical-rgba-sha\n"
        )
        expected = hashlib.sha256(expected_payload.encode("utf-8")).hexdigest()
        self.assertEqual(TOOL._source_set_sha256(sources), expected)

        canonical_changed = [
            {**sources[0], "sourceDecodedRgbaSha256": "changed-canonical-sha"}
        ]
        full_changed = [
            {**sources[0], "sourceFullDecodedRgbaSha256": "changed-full-sha"}
        ]
        self.assertNotEqual(TOOL._source_set_sha256(canonical_changed), expected)
        self.assertNotEqual(TOOL._source_set_sha256(full_changed), expected)

    def test_rejects_wrong_scene_or_run_id(self) -> None:
        self.report["scene"] = "res://scenes/qa/NpcDirectionReview.tscn"
        self.report["runId"] = "old-run"
        self._write_report()
        with self.assertRaisesRegex(TOOL.NpcMainReviewError, "runId=.*scene"):
            self._validate()

    def test_rejects_headless_or_hidden_world_and_portrait(self) -> None:
        self.report["displayServer"] = "headless"
        self.report["worldVisible"] = False
        self.report["portraitVisible"] = False
        self._write_report()
        with self.assertRaisesRegex(
            TOOL.NpcMainReviewError, "worldVisible.*portraitVisible.*displayServer"
        ):
            self._validate()

    def test_rejects_target_mapping_drift(self) -> None:
        self.report["npcId"] = "firebud_bank_keeper"
        self.report["appearanceId"] = "npc_bank_keeper_f_v1"
        self._write_report()
        with self.assertRaisesRegex(TOOL.NpcMainReviewError, "appearanceId=.*npcId"):
            self._validate()

    def test_rejects_source_file_tamper(self) -> None:
        source_path = TOOL._res_path_to_file(self.report["sources"][0]["path"])
        Image.new("RGBA", (256, 256), (255, 0, 0, 255)).save(source_path)
        with self.assertRaisesRegex(
            TOOL.NpcMainReviewError, "fileSha256.*sourceDecodedRgbaSha256"
        ):
            self._validate()

    def test_rejects_missing_import_freshness(self) -> None:
        self.report["frames"][0]["importFresh"] = False
        self._write_report()
        with self.assertRaisesRegex(TOOL.NpcMainReviewError, "importFresh"):
            self._validate()

    def test_rejects_incomplete_or_reordered_twelve_frame_set(self) -> None:
        self.report["frames"][0], self.report["frames"][1] = (
            self.report["frames"][1],
            self.report["frames"][0],
        )
        self.report["sources"] = self.report["frames"]
        self.report["sourceSetSha256"] = TOOL._source_set_sha256(
            self.report["frames"]
        )
        self._write_report()
        with self.assertRaisesRegex(TOOL.NpcMainReviewError, r"frames\[0\].*path"):
            self._validate()

    def test_rejects_debug_ui_or_nonisolated_profile(self) -> None:
        self.report["debugUiVisible"] = True
        self.report["normalPlayerUi"] = False
        self.report["qaDebugControlsVisible"] = True
        self.report["authAutoBypass"] = True
        self.report["profileIsolation"] = "user_profile"
        self._write_report()
        with self.assertRaisesRegex(
            TOOL.NpcMainReviewError,
            "profileIsolation=.*authAutoBypass=.*debugUiVisible=.*normalPlayerUi",
        ):
            self._validate()

    def test_rejects_dialog_buttons_outside_real_panel(self) -> None:
        self.report["dialogButtonsInBounds"] = False
        self.report["dialogVisibleButtonCount"] = 1
        self._write_report()
        with self.assertRaisesRegex(
            TOOL.NpcMainReviewError,
            "dialogButtonsInBounds.*dialogVisibleButtonCount",
        ):
            self._validate()

    def test_first8_capture_command_uses_normal_released_runtime(self) -> None:
        command = TOOL._build_capture_command(
            godot="/opt/godot",
            user_data_dir="/tmp/npc-main-user",
            target=self.target,
            run_id=self.run_id,
            screenshot_path=self.screenshot,
            report_path=self.report_path,
            qa_preview=False,
        )
        separator = command.index("--")
        self.assertEqual(command.count("--"), 1)
        self.assertIn("--scene", command[:separator])
        self.assertIn(TOOL.MAIN_SCENE, command[:separator])
        self.assertNotIn("--npc-main-review-capture", command[:separator])
        self.assertIn("--npc-main-review-capture", command[separator + 1 :])
        self.assertNotIn("--npc-art-review-preview", command[separator + 1 :])
        self.assertIn(
            f"--npc-main-review-run-id={self.run_id}", command[separator + 1 :]
        )

    def test_remaining7_capture_command_requires_explicit_qa_preview(self) -> None:
        target = dict(TOOL.REMAINING7_TARGETS[0])
        command = TOOL._build_capture_command(
            godot="/opt/godot",
            user_data_dir="/tmp/npc-main-user",
            target=target,
            run_id=self.run_id,
            screenshot_path=self.screenshot,
            report_path=self.report_path,
            qa_preview=True,
        )
        separator = command.index("--")
        self.assertEqual(command.count("--"), 1)
        self.assertIn("--npc-main-review-capture", command[separator + 1 :])
        self.assertIn("--npc-art-review-preview", command[separator + 1 :])

    def test_rejects_non_1280x720_screenshot(self) -> None:
        Image.new("RGBA", (640, 360), (20, 70, 80, 255)).save(self.screenshot)
        with self.assertRaisesRegex(TOOL.NpcMainReviewError, "1280x720"):
            self._validate()

    def test_fixed_target_contract_is_exact_and_unique(self) -> None:
        TOOL._validate_fixed_targets()
        self.assertEqual(len(TOOL.TARGETS), 8)
        self.assertEqual(
            len({target["appearanceId"] for target in TOOL.TARGETS}), 8
        )
        self.assertEqual(
            len({(target["mapId"], target["npcId"]) for target in TOOL.TARGETS}),
            8,
        )

    def test_remaining7_target_contract_is_exact_and_disjoint(self) -> None:
        TOOL._validate_all_target_batches()
        remaining = TOOL._targets_for_batch(TOOL.REMAINING_TARGET_BATCH)
        self.assertEqual(
            [target["npcId"] for target in remaining],
            [
                "firebud_rebirth_mentor",
                "firebud_pet_mm_trial_mentor",
                "firebud_pet_mm_stage2_keeper",
                "firebud_diamond_keeper",
                "firebud_pet_skill_trainer",
                "firebud_welfare_clerk",
                "firebud_storyteller",
            ],
        )
        self.assertEqual(
            [target["appearanceId"] for target in remaining],
            [
                "npc_player_rebirth_mentor_f_v1",
                "npc_pet_mm_trial_mentor_m_v1",
                "npc_pet_mm_stage2_keeper_f_v1",
                "npc_diamond_merchant_m_v1",
                "npc_pet_skill_trainer_m_v1",
                "npc_welfare_clerk_f_v1",
                "npc_storyteller_m_v1",
            ],
        )
        all_targets = TOOL.TARGETS + remaining
        self.assertEqual(len(all_targets), 15)
        self.assertEqual(
            len({target["appearanceId"] for target in all_targets}), 15
        )
        self.assertEqual(
            len({(target["mapId"], target["npcId"]) for target in all_targets}),
            15,
        )

    def test_parser_preserves_first8_default_and_selects_remaining7(self) -> None:
        self.assertEqual(
            TOOL._parser().parse_args([]).batch, TOOL.DEFAULT_TARGET_BATCH
        )
        self.assertEqual(
            TOOL._parser().parse_args(["--batch", "remaining7"]).batch,
            TOOL.REMAINING_TARGET_BATCH,
        )
        self.assertEqual(
            TOOL._capture_mode_for_batch(TOOL.DEFAULT_TARGET_BATCH),
            {"qaPreview": False, "normalPlayerRuntimeEnabled": True},
        )
        self.assertEqual(
            TOOL._capture_mode_for_batch(TOOL.REMAINING_TARGET_BATCH),
            {"qaPreview": True, "normalPlayerRuntimeEnabled": False},
        )

    def test_remaining7_index_metadata_matches_selected_targets(self) -> None:
        output_root = self.root / "main-evidence"
        run_id = "phase-main-remaining7-test-v1"
        original_cwd = Path.cwd()
        resolved_root = self.root.resolve()

        def fake_run_logged(
            _command: object, *, log_path: Path, timeout_seconds: float
        ) -> None:
            self.assertGreater(timeout_seconds, 0)
            log_path.write_text("fake capture passed\n", encoding="utf-8")

        def fake_capture_target(**kwargs: object) -> dict[str, object]:
            target = kwargs["target"]
            target_dir = kwargs["target_dir"]
            assert isinstance(target, dict)
            assert isinstance(target_dir, Path)
            self.assertIs(kwargs["qa_preview"], True)
            self.assertIs(kwargs["normal_player_runtime_enabled"], False)
            target_dir.mkdir(parents=False, exist_ok=False)
            (target_dir / "fake-main.log").write_text(
                "fake Main capture passed\n", encoding="utf-8"
            )
            return {
                "appearanceId": target["appearanceId"],
                "npcId": target["npcId"],
            }

        os.chdir(self.root)
        try:
            with (
                mock.patch.object(TOOL, "REPO_ROOT", resolved_root),
                mock.patch.object(
                    TOOL, "_require_executable", return_value="/opt/godot"
                ),
                mock.patch.object(TOOL, "_run_logged", side_effect=fake_run_logged),
                mock.patch.object(
                    TOOL, "_capture_target", side_effect=fake_capture_target
                ),
                mock.patch.object(TOOL, "_capture_version", return_value="test"),
            ):
                args = TOOL._parser().parse_args(
                    [
                        "--batch",
                        "remaining7",
                        "--output-root",
                        str(output_root.relative_to(self.root)),
                        "--run-id",
                        run_id,
                    ]
                )
                index_path = TOOL._record(args)
        finally:
            os.chdir(original_cwd)

        index = json.loads(index_path.read_text(encoding="utf-8"))
        targets = TOOL.REMAINING7_TARGETS
        self.assertEqual(index["targetBatch"], TOOL.REMAINING_TARGET_BATCH)
        self.assertTrue(index["qaPreview"])
        self.assertEqual(index["expected"]["captureCount"], 7)
        self.assertFalse(index["expected"]["normalPlayerRuntimeEnabled"])
        self.assertEqual(
            index["appearanceIds"],
            [target["appearanceId"] for target in targets],
        )
        self.assertEqual(index["npcIds"], [target["npcId"] for target in targets])
        self.assertEqual(
            [capture["npcId"] for capture in index["captures"]],
            [target["npcId"] for target in targets],
        )

    def test_first8_index_marks_normal_player_runtime_enabled(self) -> None:
        output_root = self.root / "main-evidence"
        run_id = "phase-main-first8-test-v1"
        original_cwd = Path.cwd()
        resolved_root = self.root.resolve()

        def fake_run_logged(
            _command: object, *, log_path: Path, timeout_seconds: float
        ) -> None:
            self.assertGreater(timeout_seconds, 0)
            log_path.write_text("fake capture passed\n", encoding="utf-8")

        def fake_capture_target(**kwargs: object) -> dict[str, object]:
            target = kwargs["target"]
            target_dir = kwargs["target_dir"]
            assert isinstance(target, dict)
            assert isinstance(target_dir, Path)
            self.assertIs(kwargs["qa_preview"], False)
            self.assertIs(kwargs["normal_player_runtime_enabled"], True)
            target_dir.mkdir(parents=False, exist_ok=False)
            (target_dir / "fake-main.log").write_text(
                "fake Main capture passed\n", encoding="utf-8"
            )
            return {
                "appearanceId": target["appearanceId"],
                "npcId": target["npcId"],
            }

        os.chdir(self.root)
        try:
            with (
                mock.patch.object(TOOL, "REPO_ROOT", resolved_root),
                mock.patch.object(
                    TOOL, "_require_executable", return_value="/opt/godot"
                ),
                mock.patch.object(TOOL, "_run_logged", side_effect=fake_run_logged),
                mock.patch.object(
                    TOOL, "_capture_target", side_effect=fake_capture_target
                ),
                mock.patch.object(TOOL, "_capture_version", return_value="test"),
            ):
                args = TOOL._parser().parse_args(
                    [
                        "--output-root",
                        str(output_root.relative_to(self.root)),
                        "--run-id",
                        run_id,
                    ]
                )
                index_path = TOOL._record(args)
        finally:
            os.chdir(original_cwd)

        index = json.loads(index_path.read_text(encoding="utf-8"))
        self.assertEqual(index["targetBatch"], TOOL.DEFAULT_TARGET_BATCH)
        self.assertFalse(index["qaPreview"])
        self.assertEqual(index["expected"]["captureCount"], 8)
        self.assertTrue(index["expected"]["normalPlayerRuntimeEnabled"])


if __name__ == "__main__":
    unittest.main()
