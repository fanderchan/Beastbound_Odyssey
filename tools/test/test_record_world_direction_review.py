#!/usr/bin/env python3
"""Focused contract tests for tools/record_world_direction_review.py."""

from __future__ import annotations

import copy
import hashlib
import importlib.util
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from PIL import Image


REPO_ROOT = Path(__file__).resolve().parents[2]
TOOL_PATH = REPO_ROOT / "tools" / "record_world_direction_review.py"
SPEC = importlib.util.spec_from_file_location("record_world_direction_review", TOOL_PATH)
assert SPEC is not None and SPEC.loader is not None
TOOL = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(TOOL)


def _parity_report(
    *,
    form_id: str = "fixture_form",
    run_id: str = "fixture-run",
    subjects: tuple[str, ...] = TOOL.PARITY_KINDS,
    action_frames: tuple[tuple[str, int], ...] = TOOL.PARITY_ACTION_FRAMES,
) -> dict:
    frames = []
    for direction in TOOL.PARITY_DIRECTIONS:
        for action, frame_index in action_frames:
            for kind in subjects:
                ordinal = len(frames)
                frames.append(
                    {
                        "kind": kind,
                        "path": (
                            f"res://fixtures/{kind}/world/directions/{direction}/"
                            f"{action}/{action}-{frame_index}.png"
                        ),
                        "direction": direction,
                        "action": action,
                        "index": frame_index,
                        "status": "passed",
                        "errors": [],
                        "importFresh": True,
                        "loadMode": "godot_import",
                        "canonicalRgbaMatch": True,
                        "sourceFileSha256": hashlib.sha256(
                            f"source-file-{ordinal}".encode()
                        ).hexdigest(),
                        "sourceDecodedRgbaSha256": hashlib.sha256(
                            f"source-rgba-{ordinal}".encode()
                        ).hexdigest(),
                        "loadedDecodedRgbaSha256": hashlib.sha256(
                            f"loaded-rgba-{ordinal}".encode()
                        ).hexdigest(),
                    }
                )
    report = {
        "schemaVersion": 1,
        "runId": run_id,
        "formId": form_id,
        "subjects": list(subjects),
        "expectedFrames": len(frames),
        "status": "passed",
        "checkedFrames": len(frames),
        "passedFrames": len(frames),
        "errors": [],
        "frames": frames,
    }
    report["sourceSetSha256"] = TOOL._parity_source_set_sha256(frames)
    return report


def _probe(*, frame_count: int = 433, duration: str = "14.433333") -> dict:
    return {
        "streams": [
            {
                "codec_type": "video",
                "codec_name": "h264",
                "width": 1280,
                "height": 720,
                "r_frame_rate": "30/1",
                "avg_frame_rate": "30/1",
                "nb_frames": str(frame_count),
                "nb_read_frames": str(frame_count),
                "duration": duration,
            }
        ],
        "format": {"duration": duration},
    }


def _isolated_meta(form_id: str) -> dict:
    return {
        "schemaVersion": 1,
        "formId": form_id,
        "displayName": "fixture",
        "runtimeEnabled": False,
        "rideableTarget": False,
        "ownerReviewStatus": "pending",
        "supportedMountedCharacterIds": [],
        "runtimeFrameSize": [256, 256],
        "identity": {
            "board": "identity/identity-board-transparent.png",
            "poses": {
                "front_3quarter_sw": "identity/front_3quarter_sw.png",
                "back_3quarter_ne": "identity/back_3quarter_ne.png",
                "south": "identity/south.png",
                "west": "identity/west.png",
            },
            "sourceFrameSize": [512, 512],
            "status": "self_review_passed_owner_pending",
        },
        "worldVisual": {
            "strategy": "independent_8",
            "runtimeMirroring": False,
            "runtimeMountedComposition": False,
            "directions": list(TOOL.PARITY_DIRECTIONS),
            "totalFrameCount": 40,
            "actions": {
                "idle": {"frameCount": 1},
                "walk": {"frameCount": 4},
            },
        },
    }


def _materialize_isolated_root(
    repo_root: Path,
    *,
    form_id: str = "fixture_form",
) -> Path:
    root = repo_root / ".run" / "isolated-fixture"
    root.mkdir(parents=True)
    (root / "action-bundle-meta.json").write_text(
        json.dumps(_isolated_meta(form_id)),
        encoding="utf-8",
    )
    identity_paths = TOOL._isolated_identity_paths(root)
    for index, path in enumerate(identity_paths):
        path.parent.mkdir(parents=True, exist_ok=True)
        size = (1024, 1024) if index == 0 else (512, 512)
        Image.new("RGBA", size, (20 + index, 40, 60, 255)).save(path)
    for ordinal, path in enumerate(TOOL._isolated_world_frame_paths(root)):
        path.parent.mkdir(parents=True, exist_ok=True)
        Image.new(
            "RGBA",
            (256, 256),
            ((ordinal * 5 + 1) % 255, 30, 80, 255),
        ).save(path)
    return root


def _isolated_parity_report(bundle: dict) -> dict:
    report = _parity_report(subjects=TOOL.PET_ONLY_SUBJECTS)
    report["isolatedPetRoot"] = bundle["rootAbsolute"]
    report["overlayScope"] = "world_pet_only"
    for frame in report["frames"]:
        path = (
            f"repo://{bundle['root']}/world/directions/"
            f"{frame['direction']}/{frame['action']}/"
            f"{frame['action']}-{frame['index']}.png"
        )
        frame["path"] = path
        frame["sourceFileSha256"] = TOOL._sha256(
            TOOL.REPO_ROOT / path.removeprefix("repo://")
        )
        frame["importFresh"] = False
        frame["sourceFileFresh"] = True
        frame["resourceImportParityChecked"] = False
        frame["importSourceMd5"] = ""
        frame["loadMode"] = "qa_isolated_file"
    report["sourceSetSha256"] = TOOL._parity_source_set_sha256(report["frames"])
    return report


class RecordWorldDirectionReviewTest(unittest.TestCase):
    def test_parity_report_requires_same_form_run_and_all_120_frames(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "parity.json"
            path.write_text(json.dumps(_parity_report()), encoding="utf-8")
            report = TOOL._validate_parity_report(
                path,
                form_id="fixture_form",
                run_id="fixture-run",
                label="fixture parity",
            )
            self.assertEqual(report["checkedFrames"], 120)

            changed = _parity_report(run_id="other-run")
            path.write_text(json.dumps(changed), encoding="utf-8")
            with self.assertRaisesRegex(TOOL.ReviewRecordingError, "runId"):
                TOOL._validate_parity_report(
                    path,
                    form_id="fixture_form",
                    run_id="fixture-run",
                    label="fixture parity",
                )

    def test_pet_only_parity_report_requires_exact_40_pet_frames(self) -> None:
        report = _parity_report(subjects=TOOL.PET_ONLY_SUBJECTS)
        validated = self._validate_parity(
            report,
            subjects=TOOL.PET_ONLY_SUBJECTS,
        )
        self.assertEqual(validated["subjects"], ["pet"])
        self.assertEqual(validated["checkedFrames"], 40)

        mixed = _parity_report(subjects=TOOL.PET_ONLY_SUBJECTS)
        mixed["frames"][0]["kind"] = "character"
        mixed["sourceSetSha256"] = TOOL._parity_source_set_sha256(mixed["frames"])
        with self.assertRaisesRegex(
            TOOL.ReviewRecordingError,
            "未请求主体|规范 kind",
        ):
            self._validate_parity(mixed, subjects=TOOL.PET_ONLY_SUBJECTS)

    def test_pet_only_report_rejects_missing_subject_binding(self) -> None:
        report = _parity_report(subjects=TOOL.PET_ONLY_SUBJECTS)
        report.pop("subjects")
        report.pop("expectedFrames")
        with self.assertRaisesRegex(TOOL.ReviewRecordingError, "subjects"):
            self._validate_parity(report, subjects=TOOL.PET_ONLY_SUBJECTS)

    def test_isolated_pet_root_and_direct_load_parity_are_bound(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir).resolve()
            root = _materialize_isolated_root(repo_root)
            with mock.patch.object(TOOL, "REPO_ROOT", repo_root):
                bundle = TOOL._validate_isolated_pet_root(
                    root,
                    form_id="fixture_form",
                )
                self.assertEqual(bundle["root"], ".run/isolated-fixture")
                self.assertEqual(bundle["frameCount"], 40)
                report = _isolated_parity_report(bundle)
                validated = self._validate_parity(
                    report,
                    subjects=TOOL.PET_ONLY_SUBJECTS,
                    isolated_bundle=bundle,
                )
                self.assertEqual(validated["overlayScope"], "world_pet_only")

                report["frames"][0]["loadMode"] = "godot_import"
                report["sourceSetSha256"] = TOOL._parity_source_set_sha256(
                    report["frames"]
                )
                with self.assertRaisesRegex(
                    TOOL.ReviewRecordingError,
                    "loadMode",
                ):
                    self._validate_parity(
                        report,
                        subjects=TOOL.PET_ONLY_SUBJECTS,
                        isolated_bundle=bundle,
                    )

    def test_isolated_pet_root_rejects_unsafe_or_noncanonical_content(self) -> None:
        mutations = (
            "runtime",
            "rideable",
            "mounted_ids",
            "missing_frame",
            "extra_frame",
            "wrong_size",
            "mounted_directory",
        )
        for mutation in mutations:
            with self.subTest(mutation=mutation), tempfile.TemporaryDirectory() as temp_dir:
                repo_root = Path(temp_dir).resolve()
                root = _materialize_isolated_root(repo_root)
                meta_path = root / "action-bundle-meta.json"
                meta = json.loads(meta_path.read_text(encoding="utf-8"))
                if mutation == "runtime":
                    meta["runtimeEnabled"] = True
                elif mutation == "rideable":
                    meta["rideableTarget"] = True
                elif mutation == "mounted_ids":
                    meta["supportedMountedCharacterIds"] = ["novice_hunter_v1"]
                elif mutation == "missing_frame":
                    TOOL._isolated_world_frame_paths(root)[0].unlink()
                elif mutation == "extra_frame":
                    extra = root / "world" / "directions" / "south" / "idle" / "idle-2.png"
                    Image.new("RGBA", (256, 256), (1, 2, 3, 255)).save(extra)
                elif mutation == "wrong_size":
                    Image.new("RGBA", (255, 256), (1, 2, 3, 255)).save(
                        TOOL._isolated_world_frame_paths(root)[0]
                    )
                elif mutation == "mounted_directory":
                    (root / "mounted").mkdir()
                meta_path.write_text(json.dumps(meta), encoding="utf-8")
                with mock.patch.object(TOOL, "REPO_ROOT", repo_root), self.assertRaises(
                    TOOL.ReviewRecordingError
                ):
                    TOOL._validate_isolated_pet_root(
                        root,
                        form_id="fixture_form",
                    )

    def test_isolated_pet_root_rejects_outside_run_and_symlink_alias(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir).resolve()
            root = _materialize_isolated_root(repo_root)
            outside_run = repo_root / "candidate"
            root.rename(outside_run)
            with mock.patch.object(TOOL, "REPO_ROOT", repo_root), self.assertRaisesRegex(
                TOOL.ReviewRecordingError,
                r"\.run",
            ):
                TOOL._validate_isolated_pet_root(
                    outside_run,
                    form_id="fixture_form",
                )

            safe_root = _materialize_isolated_root(repo_root)
            alias = repo_root / ".run" / "alias"
            os.symlink(safe_root, alias)
            with mock.patch.object(TOOL, "REPO_ROOT", repo_root), self.assertRaisesRegex(
                TOOL.ReviewRecordingError,
                "符号链接",
            ):
                TOOL._validate_isolated_pet_root(
                    alias,
                    form_id="fixture_form",
                )

    def test_parity_report_rejects_source_set_drift_between_processes(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "parity.json"
            path.write_text(json.dumps(_parity_report()), encoding="utf-8")
            with self.assertRaisesRegex(TOOL.ReviewRecordingError, "漂移"):
                TOOL._validate_parity_report(
                    path,
                    form_id="fixture_form",
                    run_id="fixture-run",
                    label="recording parity",
                    expected_source_set_sha256="b" * 64,
                )

    def test_parity_report_rejects_schema_drift(self) -> None:
        report = _parity_report()
        report["schemaVersion"] = 2
        self._assert_parity_rejected(report, "schemaVersion")

    def test_parity_report_rejects_duplicate_logical_row(self) -> None:
        report = _parity_report()
        report["frames"][-1] = copy.deepcopy(report["frames"][0])
        report["sourceSetSha256"] = TOOL._parity_source_set_sha256(report["frames"])
        self._assert_parity_rejected(report, "重复逻辑帧")

    def test_parity_report_rejects_non_godot_import_load_mode(self) -> None:
        report = _parity_report()
        report["frames"][0]["loadMode"] = "qa_direct_file"
        self._assert_parity_rejected(report, "loadMode")

    def test_parity_report_rejects_recomputed_source_set_hash_mismatch(self) -> None:
        report = _parity_report()
        report["sourceSetSha256"] = "b" * 64
        self._assert_parity_rejected(report, "重算")

    def test_parity_report_rejects_invalid_frame_sha_and_unsafe_path(self) -> None:
        report = _parity_report()
        report["frames"][0]["sourceFileSha256"] = "A" * 64
        report["frames"][1]["path"] = "res://fixtures/../escape.png"
        report["sourceSetSha256"] = TOOL._parity_source_set_sha256(report["frames"])
        self._assert_parity_rejected(report, "小写 SHA-256")
        with self.assertRaisesRegex(TOOL.ReviewRecordingError, "安全"):
            self._validate_parity(report)

    def _validate_parity(
        self,
        report: dict,
        *,
        subjects: tuple[str, ...] = TOOL.PARITY_KINDS,
        character_id: str | None = None,
        isolated_bundle: dict | None = None,
    ) -> dict:
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "parity.json"
            path.write_text(json.dumps(report), encoding="utf-8")
            return TOOL._validate_parity_report(
                path,
                form_id="fixture_form",
                run_id="fixture-run",
                label="fixture parity",
                subjects=subjects,
                character_id=character_id,
                isolated_bundle=isolated_bundle,
            )

    def _assert_parity_rejected(self, report: dict, pattern: str) -> None:
        with self.assertRaisesRegex(TOOL.ReviewRecordingError, pattern):
            self._validate_parity(report)

    def test_probe_requires_fixed_1280x720_30fps_433_frame_contract(self) -> None:
        metadata = TOOL._validate_probe(_probe())
        self.assertEqual(metadata["frameCount"], 433)
        self.assertAlmostEqual(metadata["durationSeconds"], 14.433333)

        with self.assertRaisesRegex(TOOL.ReviewRecordingError, "frameCount"):
            TOOL._validate_probe(_probe(frame_count=432, duration="14.4"))

    def test_form_ids_are_safe_and_unique(self) -> None:
        self.assertEqual(TOOL._selected_forms(["a", "b"]), ("a", "b"))
        with self.assertRaisesRegex(TOOL.ReviewRecordingError, "不能重复"):
            TOOL._selected_forms(["a", "a"])
        with self.assertRaisesRegex(TOOL.ReviewRecordingError, "不安全"):
            TOOL._selected_forms(["../escape"])

    def test_subjects_are_exact_and_legacy_default_is_preserved(self) -> None:
        self.assertEqual(TOOL._selected_subjects(None), TOOL.PARITY_KINDS)
        self.assertEqual(
            TOOL._selected_subjects("character"),
            TOOL.CHARACTER_ONLY_SUBJECTS,
        )
        self.assertEqual(TOOL._selected_subjects("pet"), TOOL.PET_ONLY_SUBJECTS)
        self.assertEqual(
            TOOL._selected_subjects("character,pet,mounted"),
            TOOL.PARITY_KINDS,
        )
        for invalid in ("pet,character", "pet,pet", "pet,mounted"):
            with self.subTest(invalid=invalid), self.assertRaisesRegex(
                TOOL.ReviewRecordingError,
                "仅允许",
            ):
                TOOL._selected_subjects(invalid)

    def test_character_only_arguments_and_parity_bind_appearance_id(self) -> None:
        action_frames = TOOL._character_parity_action_frames("ember_spark_v1")
        report = _parity_report(
            subjects=TOOL.CHARACTER_ONLY_SUBJECTS,
            action_frames=action_frames,
        )
        report["characterId"] = "ember_spark_v1"
        validated = self._validate_parity(
            report,
            subjects=TOOL.CHARACTER_ONLY_SUBJECTS,
            character_id="ember_spark_v1",
        )
        self.assertEqual(validated["checkedFrames"], 56)

        with self.assertRaisesRegex(TOOL.ReviewRecordingError, "characterId"):
            self._validate_parity(
                report,
                subjects=TOOL.CHARACTER_ONLY_SUBJECTS,
                character_id="obsidian_scout_v1",
            )

        arguments = TOOL._review_arguments(
            form_id="fixture_form",
            run_id="fixture-run",
            parity_report_path=Path("/tmp/parity.json"),
            subjects=TOOL.CHARACTER_ONLY_SUBJECTS,
            character_id="ember_spark_v1",
        )
        self.assertIn("--mount-review-subjects=character", arguments)
        self.assertIn("--mount-review-character=ember_spark_v1", arguments)

    def test_source_independence_rejects_hardlink_alias_and_horizontal_mirror(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            project = Path(temp_dir)
            report = _parity_report(subjects=TOOL.PET_ONLY_SUBJECTS)
            for ordinal, frame in enumerate(report["frames"]):
                path = project / frame["path"].removeprefix("res://")
                path.parent.mkdir(parents=True, exist_ok=True)
                image = Image.new(
                    "RGBA",
                    (4, 4),
                    (ordinal + 1, 20, 40, 255),
                )
                image.save(path)
                canonical = TOOL._canonical_rgba_bytes(image)
                frame["sourceDecodedRgbaSha256"] = TOOL._rgba_sha256(
                    4,
                    4,
                    canonical,
                )

            with mock.patch.object(TOOL, "GODOT_PROJECT", project):
                TOOL._validate_source_frame_independence(
                    report["frames"],
                    subjects=TOOL.PET_ONLY_SUBJECTS,
                )

                first = project / report["frames"][0]["path"].removeprefix("res://")
                second = project / report["frames"][1]["path"].removeprefix("res://")
                second.unlink()
                second.hardlink_to(first)
                with self.assertRaisesRegex(
                    TOOL.ReviewRecordingError,
                    "硬链接别名|文件系统别名",
                ):
                    TOOL._validate_source_frame_independence(
                        report["frames"],
                        subjects=TOOL.PET_ONLY_SUBJECTS,
                    )

            second.unlink()
            Image.new("RGBA", (4, 4), (2, 20, 40, 255)).save(second)
            second = project / report["frames"][5]["path"].removeprefix("res://")
            first_image = Image.new("RGBA", (4, 4), (0, 0, 0, 255))
            first_image.putpixel((0, 1), (255, 0, 0, 255))
            mirror_image = first_image.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
            first_image.save(first)
            mirror_image.save(second)
            for frame, image in (
                (report["frames"][0], first_image),
                (report["frames"][5], mirror_image),
            ):
                frame["sourceDecodedRgbaSha256"] = TOOL._rgba_sha256(
                    4,
                    4,
                    TOOL._canonical_rgba_bytes(image),
                )
            with mock.patch.object(TOOL, "GODOT_PROJECT", project), self.assertRaisesRegex(
                TOOL.ReviewRecordingError,
                "水平镜像",
            ):
                TOOL._validate_source_frame_independence(
                    report["frames"],
                    subjects=TOOL.PET_ONLY_SUBJECTS,
                )


if __name__ == "__main__":
    unittest.main()
