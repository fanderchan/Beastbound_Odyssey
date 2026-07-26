from __future__ import annotations

import importlib.util
import json
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from PIL import Image, ImageDraw


MODULE_PATH = Path(__file__).resolve().parents[1] / "finalize_pet_identity_gate.py"
SPEC = importlib.util.spec_from_file_location("finalize_pet_identity_gate", MODULE_PATH)
assert SPEC is not None and SPEC.loader is not None
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class FinalizePetIdentityGateTest(unittest.TestCase):
    def make_bundle_fixture(
        self,
        root: Path,
        form_id: str = "test_form",
    ) -> tuple[dict[str, object], Path]:
        pet_root = root / f"assets/pets/{form_id}"
        identity = pet_root / "identity"
        source = pet_root / "source"
        prompts = pet_root / "prompts"
        qa = pet_root / "qa"
        identity.mkdir(parents=True)
        source.mkdir(parents=True)
        prompts.mkdir(parents=True)
        qa.mkdir(parents=True)

        (identity / "identity-lock.md").write_text(
            "identity\n",
            encoding="utf-8",
        )
        (identity / "source-and-ownership.md").write_text(
            "ownership\n",
            encoding="utf-8",
        )
        (prompts / "identity.txt").write_text("prompt\n", encoding="utf-8")
        raw_path = source / "identity-board-raw.png"
        raw = Image.new("RGB", MODULE.IDENTITY_BOARD_SIZE, (255, 0, 255))
        draw = ImageDraw.Draw(raw)
        colors = [
            (180, 91, 40),
            (44, 101, 174),
            (61, 142, 75),
            (130, 72, 164),
        ]
        for index, color in enumerate(colors):
            row, col = divmod(index, 2)
            left = col * 512 + 104
            top = row * 512 + 84
            draw.rounded_rectangle(
                (left, top + 58, left + 300, top + 364),
                radius=54,
                fill=color,
            )
            draw.ellipse(
                (left + 78, top, left + 222, top + 148),
                fill=color,
            )
            draw.polygon(
                (
                    (left + 132, top + 8),
                    (left + 150, top - 34 + index * 3),
                    (left + 170, top + 12),
                ),
                fill=color,
            )
        raw.save(raw_path)
        builder_output = root / ".fixture-builder-output"
        MODULE.pet_art_builder.build_bundle(
            MODULE.pet_art_builder.BuildOptions(
                input_path=raw_path,
                output_dir=builder_output,
                rows=2,
                cols=2,
                slots=tuple(MODULE.IDENTITY_POSES),
                row_start=0,
                row_count=2,
                fit_scale=0.76,
                anchor="feet",
            )
        )
        pose_paths: dict[str, Path] = {}
        for pose in MODULE.IDENTITY_POSES:
            pose_path = identity / f"{pose}.png"
            shutil.copy2(
                builder_output / "source-frames" / f"{pose}.png",
                pose_path,
            )
            pose_paths[pose] = pose_path
        board_path = identity / "identity-board-transparent.png"
        shutil.copy2(builder_output / "sheet-transparent.png", board_path)
        shutil.copy2(
            builder_output / "pipeline-meta.json",
            source / "identity-board-pipeline-meta.json",
        )

        with Image.open(board_path) as opened:
            board = opened.copy()
        pipeline = json.loads(
            (source / "identity-board-pipeline-meta.json").read_text(
                encoding="utf-8"
            )
        )
        replay_options = MODULE.pet_art_builder.options_from_metadata(
            pipeline,
            input_path=raw_path,
            output_dir=root / ".fixture-options-check",
        )
        self.assertEqual(replay_options.slots, tuple(MODULE.IDENTITY_POSES))
        self.assertEqual(
            {
                "rows": pipeline["rows"],
                "cols": pipeline["cols"],
                "slots": pipeline["slots"],
            },
            {
                "rows": 2,
                "cols": 2,
                "slots": MODULE.IDENTITY_POSES,
            },
        )

        contact_sheet_path = qa / "identity-key-pose-contact-sheet.png"
        board.save(contact_sheet_path)
        qc = {
            "schemaVersion": MODULE.SELF_REVIEW_SCHEMA_VERSION,
            "formId": form_id,
            "reviewScope": "identity_key_pose_gate",
            "selfReviewStatus": "passed",
            "ownerReviewStatus": "pending",
            "runtimeEnabled": False,
            "errors": [],
            "identityBoard": {
                "path": "identity/identity-board-transparent.png",
                "fileSha256": MODULE.sha256_file(board_path),
                "canonicalRgbaSha256": MODULE.canonical_rgba_sha256(board_path),
            },
            "poses": {
                pose: {
                    "path": f"identity/{pose}.png",
                    "fileSha256": MODULE.sha256_file(pose_paths[pose]),
                    "canonicalRgbaSha256": MODULE.canonical_rgba_sha256(
                        pose_paths[pose]
                    ),
                }
                for pose in MODULE.IDENTITY_POSES
            },
            "contactSheet": {
                "path": "qa/identity-key-pose-contact-sheet.png",
                "fileSha256": MODULE.sha256_file(contact_sheet_path),
            },
        }
        (qa / MODULE.SELF_REVIEW_FILENAME).write_text(
            json.dumps(qc),
            encoding="utf-8",
        )

        form: dict[str, object] = {
            "formId": form_id,
            "displayName": "测试宠",
            "status": "in_production",
            "runtimeEnabled": False,
            "rideableTarget": False,
            "supportedCharacterIds": [],
            "pet": {
                "root": f"assets/pets/{form_id}",
                "metadataPath": f"assets/pets/{form_id}/action-bundle-meta.json",
                "identityPath": (
                    f"assets/pets/{form_id}/identity/identity-lock.md"
                ),
                "ownershipPath": (
                    f"assets/pets/{form_id}/identity/source-and-ownership.md"
                ),
                "promptPath": f"assets/pets/{form_id}/prompts/identity.txt",
            },
        }
        return form, pet_root

    def finalize_fixture(
        self,
        root: Path,
        form: dict[str, object],
        *,
        force: bool = False,
        check_only: bool = False,
    ) -> None:
        with mock.patch.object(MODULE, "REPO_ROOT", root):
            MODULE.finalize_form(
                form,
                force=force,
                check_only=check_only,
            )

    def test_action_contract_is_complete_and_pending(self) -> None:
        actions = MODULE.action_metadata()
        self.assertEqual(list(actions), list(MODULE.ACTION_SPECS))
        self.assertEqual(len(actions), 12)
        self.assertTrue(all(value["status"] == "not_produced" for value in actions.values()))
        self.assertEqual(actions["idle"]["frameCount"], 6)
        self.assertEqual(actions["revive"]["frameCount"], 8)

    def test_lossless_webp_preserves_decoded_rgba_pixels(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "source.png"
            archive = root / "source.webp"
            image = Image.new("RGBA", (9, 7), (0, 0, 0, 0))
            image.putpixel((1, 1), (12, 34, 56, 255))
            image.putpixel((4, 5), (222, 111, 7, 127))
            image.save(source)

            decoded_hash, archive_hash = MODULE.archive_lossless_webp(source, archive)

            self.assertTrue(archive.is_file())
            self.assertEqual(decoded_hash, MODULE.decoded_rgba_sha256(source))
            self.assertEqual(decoded_hash, MODULE.decoded_rgba_sha256(archive))
            self.assertEqual(archive_hash, MODULE.sha256_file(archive))

    def test_transparent_png_audit_freezes_alpha_and_hash_contract(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "pose.png"
            image = Image.new("RGBA", MODULE.IDENTITY_POSE_SIZE, (0, 0, 0, 0))
            for x in range(96, 416):
                for y in range(112, 464):
                    image.putpixel((x, y), (34, 89, 144, 255))
            image.putpixel((96, 112), (34, 89, 144, 127))
            image.save(source)

            with mock.patch.object(MODULE, "REPO_ROOT", root):
                audit = MODULE.inspect_transparent_png(
                    source,
                    MODULE.IDENTITY_POSE_SIZE,
                    "test pose",
                )

            self.assertEqual(audit["format"], "PNG")
            self.assertEqual(audit["mode"], "RGBA")
            self.assertEqual(audit["pixelSize"], [512, 512])
            self.assertGreater(audit["transparentPixelCount"], 0)
            self.assertGreater(audit["alphaPositivePixelCount"], 0)
            self.assertEqual(audit["partialAlphaPixelCount"], 1)
            self.assertEqual(audit["fileSha256"], MODULE.sha256_file(source))
            self.assertEqual(
                audit["decodedRgbaPixelSha256"],
                MODULE.decoded_rgba_sha256(source),
            )

    def test_transparent_png_audit_rejects_rgb_opaque_empty_and_wrong_size(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            cases = {
                "rgb.png": Image.new("RGB", MODULE.IDENTITY_POSE_SIZE, (12, 34, 56)),
                "opaque.png": Image.new(
                    "RGBA",
                    MODULE.IDENTITY_POSE_SIZE,
                    (12, 34, 56, 255),
                ),
                "empty.png": Image.new(
                    "RGBA",
                    MODULE.IDENTITY_POSE_SIZE,
                    (0, 0, 0, 0),
                ),
                "wrong-size.png": Image.new("RGBA", (511, 512), (0, 0, 0, 0)),
                "rgb-leak.png": Image.new(
                    "RGBA",
                    MODULE.IDENTITY_POSE_SIZE,
                    (0, 0, 0, 0),
                ),
            }
            for x in range(96, 416):
                for y in range(112, 464):
                    cases["rgb-leak.png"].putpixel((x, y), (34, 89, 144, 255))
            cases["rgb-leak.png"].putpixel((0, 0), (255, 0, 255, 0))
            for name, image in cases.items():
                image.save(root / name)
            Image.new("RGBA", MODULE.IDENTITY_POSE_SIZE, (0, 0, 0, 0)).save(
                root / "not-png.png",
                format="BMP",
            )
            edge = Image.new(
                "RGBA",
                MODULE.IDENTITY_POSE_SIZE,
                (0, 0, 0, 0),
            )
            for x in range(1, 320):
                for y in range(1, 360):
                    edge.putpixel((x, y), (34, 89, 144, 255))
            edge.save(root / "unsafe-edge.png")

            with mock.patch.object(MODULE, "REPO_ROOT", root):
                with self.assertRaisesRegex(MODULE.FinalizeError, "decode as PNG"):
                    MODULE.inspect_transparent_png(
                        root / "not-png.png",
                        MODULE.IDENTITY_POSE_SIZE,
                        "test pose",
                    )
                with self.assertRaisesRegex(MODULE.FinalizeError, "explicit RGBA"):
                    MODULE.inspect_transparent_png(
                        root / "rgb.png",
                        MODULE.IDENTITY_POSE_SIZE,
                        "test pose",
                    )
                with self.assertRaisesRegex(MODULE.FinalizeError, "safety margin"):
                    MODULE.inspect_transparent_png(
                        root / "unsafe-edge.png",
                        MODULE.IDENTITY_POSE_SIZE,
                        "test pose",
                        safe_margin=4,
                    )
                with self.assertRaisesRegex(MODULE.FinalizeError, "transparent background"):
                    MODULE.inspect_transparent_png(
                        root / "opaque.png",
                        MODULE.IDENTITY_POSE_SIZE,
                        "test pose",
                    )
                with self.assertRaisesRegex(MODULE.FinalizeError, "non-empty subject"):
                    MODULE.inspect_transparent_png(
                        root / "empty.png",
                        MODULE.IDENTITY_POSE_SIZE,
                        "test pose",
                    )
                with self.assertRaisesRegex(MODULE.FinalizeError, "512x512"):
                    MODULE.inspect_transparent_png(
                        root / "wrong-size.png",
                        MODULE.IDENTITY_POSE_SIZE,
                        "test pose",
                    )
                with self.assertRaisesRegex(MODULE.FinalizeError, "non-zero RGB"):
                    MODULE.inspect_transparent_png(
                        root / "rgb-leak.png",
                        MODULE.IDENTITY_POSE_SIZE,
                        "test pose",
                    )

    def test_finalize_form_records_strict_gate_without_approving_or_enabling(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            form, pet_root = self.make_bundle_fixture(root)
            self.finalize_fixture(root, form)

            metadata = json.loads(
                (pet_root / "action-bundle-meta.json").read_text(encoding="utf-8")
            )
            source = pet_root / "source"
            source_meta = json.loads(
                (source / "identity-board-source-meta.json").read_text(
                    encoding="utf-8"
                )
            )
            self.assertFalse(metadata["runtimeEnabled"])
            self.assertFalse(metadata["rideableTarget"])
            self.assertEqual(metadata["supportedMountedCharacterIds"], [])
            self.assertEqual(metadata["ownerReviewStatus"], "pending")
            self.assertEqual(
                metadata["evidence"]["identityGateAudit"]["status"],
                "self_review_passed_owner_review_pending",
            )
            gate = metadata["evidence"]["identityGateAudit"]
            self.assertEqual(set(gate["poses"]), set(MODULE.IDENTITY_POSES))
            self.assertEqual(gate["selfReview"]["status"], "passed")
            self.assertEqual(source_meta["schemaVersion"], 2)
            self.assertEqual(
                source_meta["pipelineMetadataSha256"],
                MODULE.sha256_file(source / "identity-board-pipeline-meta.json"),
            )
            self.assertEqual(
                source_meta["promptSha256"],
                MODULE.sha256_file(pet_root / "prompts/identity.txt"),
            )
            self.assertEqual(
                source_meta["identityLockSha256"],
                MODULE.sha256_file(pet_root / "identity/identity-lock.md"),
            )
            self.assertEqual(
                source_meta["ownershipSha256"],
                MODULE.sha256_file(
                    pet_root / "identity/source-and-ownership.md"
                ),
            )
            self.assertTrue((source / "identity-board-raw.webp").is_file())

    def test_finalize_rejects_duplicate_poses_and_board_mismatch(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            form, pet_root = self.make_bundle_fixture(root)
            identity = pet_root / "identity"
            with Image.open(identity / "front_3quarter_sw.png") as source:
                source.save(identity / "back_3quarter_ne.png")
            board = Image.new("RGBA", MODULE.IDENTITY_BOARD_SIZE, (0, 0, 0, 0))
            for index, pose in enumerate(MODULE.IDENTITY_POSES):
                with Image.open(identity / f"{pose}.png") as image:
                    board.paste(
                        image,
                        (
                            (index % 2) * MODULE.IDENTITY_POSE_SIZE[0],
                            (index // 2) * MODULE.IDENTITY_POSE_SIZE[1],
                        ),
                    )
            board.save(identity / "identity-board-transparent.png")
            with self.assertRaisesRegex(MODULE.FinalizeError, "unique decoded RGBA"):
                self.finalize_fixture(root, form)

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            form, pet_root = self.make_bundle_fixture(root)
            board_path = pet_root / "identity/identity-board-transparent.png"
            with Image.open(board_path) as opened:
                board = opened.copy()
            board.putpixel((100, 100), (1, 2, 3, 255))
            board.save(board_path)
            with self.assertRaisesRegex(MODULE.FinalizeError, "exact 2x2"):
                self.finalize_fixture(root, form)

    def test_finalize_rejects_pipeline_schema_hash_and_residue_drift(self) -> None:
        mutations = [
            ("schemaVersion", 99, "must come from"),
            ("replayContractVersion", 99, "replay contract"),
            ("inputSha256", "0" * 64, "inputSha256"),
        ]
        for key, value, expected_error in mutations:
            with self.subTest(key=key), tempfile.TemporaryDirectory() as directory:
                root = Path(directory).resolve()
                form, pet_root = self.make_bundle_fixture(root)
                pipeline_path = (
                    pet_root / "source/identity-board-pipeline-meta.json"
                )
                pipeline = json.loads(pipeline_path.read_text(encoding="utf-8"))
                pipeline[key] = value
                pipeline_path.write_text(json.dumps(pipeline), encoding="utf-8")
                with self.assertRaisesRegex(MODULE.FinalizeError, expected_error):
                    self.finalize_fixture(root, form)

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            form, pet_root = self.make_bundle_fixture(root)
            pipeline_path = (
                pet_root / "source/identity-board-pipeline-meta.json"
            )
            pipeline = json.loads(pipeline_path.read_text(encoding="utf-8"))
            pipeline.pop("replayContractVersion")
            pipeline_path.write_text(json.dumps(pipeline), encoding="utf-8")
            with self.assertRaisesRegex(
                MODULE.FinalizeError,
                "replay contract",
            ):
                self.finalize_fixture(root, form)

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            form, pet_root = self.make_bundle_fixture(root)
            pipeline_path = pet_root / "source/identity-board-pipeline-meta.json"
            pipeline = json.loads(pipeline_path.read_text(encoding="utf-8"))
            pipeline["frames"][0]["residualMagentaPixelsSource"] = 1
            pipeline_path.write_text(json.dumps(pipeline), encoding="utf-8")
            with self.assertRaisesRegex(MODULE.FinalizeError, "magenta residue"):
                self.finalize_fixture(root, form)

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            form, pet_root = self.make_bundle_fixture(root)
            pipeline_path = pet_root / "source/identity-board-pipeline-meta.json"
            pipeline = json.loads(pipeline_path.read_text(encoding="utf-8"))
            pipeline["frames"][0]["slot"] = "west"
            pipeline_path.write_text(json.dumps(pipeline), encoding="utf-8")
            with self.assertRaisesRegex(MODULE.FinalizeError, "slot mismatch"):
                self.finalize_fixture(root, form)

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            form, pet_root = self.make_bundle_fixture(root)
            pipeline_path = pet_root / "source/identity-board-pipeline-meta.json"
            pipeline = json.loads(pipeline_path.read_text(encoding="utf-8"))
            pipeline["frames"][0]["sourceRgbaSha256"] = "0" * 64
            pipeline_path.write_text(json.dumps(pipeline), encoding="utf-8")
            with self.assertRaisesRegex(MODULE.FinalizeError, "hash mismatch"):
                self.finalize_fixture(root, form)

    def test_finalize_requires_hash_bound_self_review(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            form, pet_root = self.make_bundle_fixture(root)
            review_path = pet_root / "qa" / MODULE.SELF_REVIEW_FILENAME
            review_path.unlink()
            with self.assertRaisesRegex(MODULE.FinalizeError, "self-review"):
                self.finalize_fixture(root, form)

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            form, pet_root = self.make_bundle_fixture(root)
            review_path = pet_root / "qa" / MODULE.SELF_REVIEW_FILENAME
            review = json.loads(review_path.read_text(encoding="utf-8"))
            review["identityBoard"]["fileSha256"] = "0" * 64
            review_path.write_text(json.dumps(review), encoding="utf-8")
            with self.assertRaisesRegex(MODULE.FinalizeError, "board binding"):
                self.finalize_fixture(root, form)

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            form, pet_root = self.make_bundle_fixture(root)
            review_path = pet_root / "qa" / MODULE.SELF_REVIEW_FILENAME
            review = json.loads(review_path.read_text(encoding="utf-8"))
            review["formal"] = True
            review["ownerApproved"] = True
            review["runtimeReady"] = True
            review["releaseAttestation"] = {"status": "approved"}
            review_path.write_text(json.dumps(review), encoding="utf-8")
            with self.assertRaisesRegex(
                MODULE.FinalizeError,
                "unexpected or missing",
            ):
                self.finalize_fixture(root, form)

    def test_finalize_rejects_unrelated_raw_and_pose_outputs(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            form, pet_root = self.make_bundle_fixture(root)
            raw_path = pet_root / "source/identity-board-raw.png"
            with Image.open(raw_path) as opened:
                raw = opened.copy()
            draw = ImageDraw.Draw(raw)
            draw.rectangle((110, 110, 390, 430), fill=(12, 220, 200))
            raw.save(raw_path)
            pipeline_path = (
                pet_root / "source/identity-board-pipeline-meta.json"
            )
            pipeline = json.loads(pipeline_path.read_text(encoding="utf-8"))
            pipeline["inputSha256"] = MODULE.sha256_file(raw_path)
            pipeline_path.write_text(json.dumps(pipeline), encoding="utf-8")

            with self.assertRaisesRegex(
                MODULE.FinalizeError,
                "source pose|fully equivalent|hash mismatch",
            ):
                self.finalize_fixture(root, form)

    def test_finalize_rejects_wrong_contact_sheet_even_with_matching_file_hash(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            form, pet_root = self.make_bundle_fixture(root)
            contact_path = pet_root / "qa/identity-key-pose-contact-sheet.png"
            wrong = Image.new(
                "RGBA",
                MODULE.IDENTITY_BOARD_SIZE,
                (12, 34, 56, 255),
            )
            wrong.save(contact_path)
            review_path = pet_root / "qa" / MODULE.SELF_REVIEW_FILENAME
            review = json.loads(review_path.read_text(encoding="utf-8"))
            review["contactSheet"]["fileSha256"] = MODULE.sha256_file(
                contact_path
            )
            review_path.write_text(json.dumps(review), encoding="utf-8")

            with self.assertRaisesRegex(MODULE.FinalizeError, "pixel-bound"):
                self.finalize_fixture(root, form)

    def test_finalize_rejects_contact_swap_between_audit_and_snapshot(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            form, pet_root = self.make_bundle_fixture(root)
            contact_path = pet_root / "qa/identity-key-pose-contact-sheet.png"
            real_resolve = MODULE.resolve_pet_relative_path
            contact_resolves = 0

            def swap_on_second_contact(
                pet_root_path: Path,
                value: str,
                label: str,
                *,
                require_exists: bool = False,
            ) -> Path:
                nonlocal contact_resolves
                if label == "identity self-review contact sheet":
                    contact_resolves += 1
                    if contact_resolves == 2:
                        Image.new(
                            "RGBA",
                            MODULE.IDENTITY_BOARD_SIZE,
                            (12, 34, 56, 255),
                        ).save(contact_path)
                return real_resolve(
                    pet_root_path,
                    value,
                    label,
                    require_exists=require_exists,
                )

            with mock.patch.object(
                MODULE,
                "resolve_pet_relative_path",
                side_effect=swap_on_second_contact,
            ):
                with self.assertRaisesRegex(
                    MODULE.FinalizeError,
                    "changed during validation",
                ):
                    self.finalize_fixture(root, form)

    def test_catalog_state_requires_explicit_closed_booleans(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            base_form, _pet_root = self.make_bundle_fixture(root)
            mutations = [
                ("runtimeEnabled", True, "runtimeEnabled=false"),
                ("runtimeEnabled", 0, "runtimeEnabled=false"),
                ("rideableTarget", 0, "explicit boolean"),
                ("rideableTarget", "false", "explicit boolean"),
                ("status", "approved", "exactly in_production"),
                ("status", "live", "exactly in_production"),
                ("status", "complete", "exactly in_production"),
                ("status", "formal", "exactly in_production"),
            ]
            for key, value, expected_error in mutations:
                with self.subTest(key=key, value=value):
                    form = dict(base_form)
                    form[key] = value
                    with self.assertRaisesRegex(
                        MODULE.FinalizeError,
                        expected_error,
                    ):
                        self.finalize_fixture(root, form)

    def test_catalog_and_derived_paths_cannot_escape_or_use_symlinks(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            form, pet_root = self.make_bundle_fixture(root)
            pet = dict(form["pet"])
            form["pet"] = pet
            pet["metadataPath"] = (
                "assets/pets/test_form/qa/not-action-metadata.json"
            )
            with self.assertRaisesRegex(MODULE.FinalizeError, "exactly"):
                self.finalize_fixture(root, form)

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            form, _pet_root = self.make_bundle_fixture(root)
            pet = dict(form["pet"])
            form["pet"] = pet
            pet["promptPath"] = "outside-prompt.txt"
            (root / "outside-prompt.txt").write_text(
                "outside\n",
                encoding="utf-8",
            )
            with self.assertRaisesRegex(MODULE.FinalizeError, "pet root"):
                self.finalize_fixture(root, form)
            pet["promptPath"] = (
                "assets/pets/test_form/prompts/identity.txt"
            )
            review_path = (
                root
                / "assets/pets/test_form/qa"
                / MODULE.SELF_REVIEW_FILENAME
            )
            review = json.loads(review_path.read_text(encoding="utf-8"))
            review["contactSheet"]["path"] = "../outside-prompt.txt"
            review_path.write_text(json.dumps(review), encoding="utf-8")
            with self.assertRaisesRegex(
                MODULE.FinalizeError,
                "relative to pet root",
            ):
                self.finalize_fixture(root, form)

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            form, pet_root = self.make_bundle_fixture(root)
            prompt_path = pet_root / "prompts/identity.txt"
            outside = root / "outside-prompt.txt"
            outside.write_text("outside\n", encoding="utf-8")
            prompt_path.unlink()
            prompt_path.symlink_to(outside)
            with self.assertRaisesRegex(MODULE.FinalizeError, "symlink"):
                self.finalize_fixture(root, form)

    def test_pipeline_metadata_rejects_bool_as_number(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            form, pet_root = self.make_bundle_fixture(root)
            pipeline_path = (
                pet_root / "source/identity-board-pipeline-meta.json"
            )
            pipeline = json.loads(pipeline_path.read_text(encoding="utf-8"))
            pipeline["safeMargin"] = True
            pipeline_path.write_text(json.dumps(pipeline), encoding="utf-8")
            with self.assertRaisesRegex(MODULE.FinalizeError, "safeMargin"):
                self.finalize_fixture(root, form)

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            form, pet_root = self.make_bundle_fixture(root)
            pipeline_path = (
                pet_root / "source/identity-board-pipeline-meta.json"
            )
            pipeline = json.loads(pipeline_path.read_text(encoding="utf-8"))
            pipeline["frames"][0]["residualMagentaPixelsSource"] = False
            pipeline_path.write_text(json.dumps(pipeline), encoding="utf-8")
            with self.assertRaisesRegex(
                MODULE.FinalizeError,
                "invalid or non-zero magenta residue",
            ):
                self.finalize_fixture(root, form)

    def test_force_cannot_overwrite_approved_or_runtime_enabled_metadata(self) -> None:
        for key, value in (
            ("ownerReviewStatus", "approved"),
            ("runtimeEnabled", True),
        ):
            with self.subTest(key=key), tempfile.TemporaryDirectory() as directory:
                root = Path(directory).resolve()
                form, pet_root = self.make_bundle_fixture(root)
                self.finalize_fixture(root, form)
                metadata_path = pet_root / "action-bundle-meta.json"
                metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
                metadata[key] = value
                metadata_path.write_text(json.dumps(metadata), encoding="utf-8")
                with self.assertRaisesRegex(
                    MODULE.FinalizeError,
                    "may not overwrite",
                ):
                    self.finalize_fixture(root, form, force=True)

    def test_force_rejects_malformed_and_nested_protected_state(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            form, pet_root = self.make_bundle_fixture(root)
            self.finalize_fixture(root, form)
            metadata_path = pet_root / "action-bundle-meta.json"
            original = json.loads(metadata_path.read_text(encoding="utf-8"))
            mutations = [
                ("schema-bool", lambda data: data.__setitem__("schemaVersion", True)),
                (
                    "different-form",
                    lambda data: data.__setitem__("formId", "other_form"),
                ),
                (
                    "different-scope",
                    lambda data: data.__setitem__(
                        "productionScope",
                        "full_runtime_bundle",
                    ),
                ),
                (
                    "nested-runtime-number",
                    lambda data: data["evidence"][
                        "identityGateAudit"
                    ].__setitem__("runtimeEnabled", 0),
                ),
                (
                    "nested-approved-status",
                    lambda data: data["evidence"][
                        "identityGateAudit"
                    ].__setitem__("status", "approved"),
                ),
                (
                    "produced-action-status",
                    lambda data: data["actions"]["idle"].__setitem__(
                        "status",
                        "produced",
                    ),
                ),
                (
                    "unknown-nested-source",
                    lambda data: data["evidence"][
                        "identityGateAudit"
                    ].__setitem__(
                        "battleSource",
                        {"status": "pending"},
                    ),
                ),
                (
                    "malformed-status",
                    lambda data: data["identity"].__setitem__("status", False),
                ),
            ]
            for name, mutate in mutations:
                with self.subTest(name=name):
                    payload = json.loads(json.dumps(original))
                    mutate(payload)
                    metadata_path.write_text(
                        json.dumps(payload),
                        encoding="utf-8",
                    )
                    with self.assertRaisesRegex(
                        MODULE.FinalizeError,
                        "may not overwrite|protected|status|nested schema",
                    ):
                        self.finalize_fixture(root, form, force=True)
            metadata_path.write_text(json.dumps(original), encoding="utf-8")

    def test_atomic_commit_rolls_back_every_existing_output(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            form, pet_root = self.make_bundle_fixture(root)
            self.finalize_fixture(root, form)
            output_paths = [
                pet_root / "source/identity-board-raw.webp",
                pet_root / "source/identity-board-source-meta.json",
                pet_root / "action-bundle-meta.json",
            ]
            original_bytes = {
                path: path.read_bytes() for path in output_paths
            }
            real_install = MODULE._install_output_no_clobber
            call_count = 0

            def fail_mid_commit(source: Path, target: Path) -> None:
                nonlocal call_count
                call_count += 1
                if call_count == 2:
                    real_install(source, target)
                    raise KeyboardInterrupt(
                        "injected post-link interruption"
                    )
                real_install(source, target)

            with mock.patch.object(
                MODULE,
                "_install_output_no_clobber",
                side_effect=fail_mid_commit,
            ):
                with self.assertRaisesRegex(
                    MODULE.FinalizeError,
                    "rolled back",
                ):
                    self.finalize_fixture(root, form, force=True)

            self.assertEqual(
                {path: path.read_bytes() for path in output_paths},
                original_bytes,
            )
            self.assertFalse((pet_root / ".identity-finalize.lock").exists())
            self.assertEqual(
                list(pet_root.glob(".identity-finalize-txn-*")),
                [],
            )

    def test_atomic_commit_rolls_back_post_backup_move_interruption(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            form, pet_root = self.make_bundle_fixture(root)
            self.finalize_fixture(root, form)
            output_paths = [
                pet_root / "source/identity-board-raw.webp",
                pet_root / "source/identity-board-source-meta.json",
                pet_root / "action-bundle-meta.json",
            ]
            original_bytes = {
                path: path.read_bytes() for path in output_paths
            }
            real_replace = MODULE._replace_output
            call_count = 0

            def fail_after_backup_move(source: Path, target: Path) -> None:
                nonlocal call_count
                call_count += 1
                real_replace(source, target)
                if call_count == 3:
                    raise KeyboardInterrupt(
                        "injected post-backup-move interruption"
                    )

            with mock.patch.object(
                MODULE,
                "_replace_output",
                side_effect=fail_after_backup_move,
            ):
                with self.assertRaisesRegex(
                    MODULE.FinalizeError,
                    "rolled back",
                ):
                    self.finalize_fixture(root, form, force=True)

            self.assertEqual(
                {path: path.read_bytes() for path in output_paths},
                original_bytes,
            )
            self.assertFalse((pet_root / ".identity-finalize.lock").exists())
            self.assertEqual(
                list(pet_root.glob(".identity-finalize-txn-*")),
                [],
            )

    def test_commit_refuses_concurrent_approved_metadata_captured_in_backup(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            form, pet_root = self.make_bundle_fixture(root)
            self.finalize_fixture(root, form)
            metadata_path = pet_root / "action-bundle-meta.json"
            other_outputs = [
                pet_root / "source/identity-board-raw.webp",
                pet_root / "source/identity-board-source-meta.json",
            ]
            original_other = {
                path: path.read_bytes() for path in other_outputs
            }
            real_replace = MODULE._replace_output
            injected = False

            def approve_before_backup(source: Path, target: Path) -> None:
                nonlocal injected
                if source == metadata_path and not injected:
                    approved = json.loads(
                        metadata_path.read_text(encoding="utf-8")
                    )
                    approved["ownerReviewStatus"] = "approved"
                    approved["runtimeEnabled"] = True
                    metadata_path.write_text(
                        json.dumps(approved),
                        encoding="utf-8",
                    )
                    injected = True
                real_replace(source, target)

            with mock.patch.object(
                MODULE,
                "_replace_output",
                side_effect=approve_before_backup,
            ):
                with self.assertRaisesRegex(
                    MODULE.FinalizeError,
                    "may not overwrite|protected|rolled back",
                ):
                    self.finalize_fixture(root, form, force=True)

            preserved = json.loads(
                metadata_path.read_text(encoding="utf-8")
            )
            self.assertEqual(preserved["ownerReviewStatus"], "approved")
            self.assertIs(preserved["runtimeEnabled"], True)
            self.assertEqual(
                {path: path.read_bytes() for path in other_outputs},
                original_other,
            )

    def test_evidence_inputs_may_not_alias_outputs_or_each_other(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            form, pet_root = self.make_bundle_fixture(root)
            self.finalize_fixture(root, form)
            pet = dict(form["pet"])
            form["pet"] = pet
            pet["promptPath"] = (
                "assets/pets/test_form/action-bundle-meta.json"
            )
            with self.assertRaisesRegex(MODULE.FinalizeError, "aliases"):
                self.finalize_fixture(root, form, force=True)

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            form, pet_root = self.make_bundle_fixture(root)
            review_path = pet_root / "qa" / MODULE.SELF_REVIEW_FILENAME
            review = json.loads(review_path.read_text(encoding="utf-8"))
            board_path = (
                pet_root / "identity/identity-board-transparent.png"
            )
            review["contactSheet"] = {
                "path": "identity/identity-board-transparent.png",
                "fileSha256": MODULE.sha256_file(board_path),
            }
            review_path.write_text(json.dumps(review), encoding="utf-8")
            with self.assertRaisesRegex(
                MODULE.FinalizeError,
                "distinct paths",
            ):
                self.finalize_fixture(root, form)

    def test_raw_and_contact_pixel_limits_fail_before_large_decode(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            form, _pet_root = self.make_bundle_fixture(root)
            with mock.patch.object(MODULE, "MAX_RAW_SOURCE_PIXELS", 100):
                with self.assertRaisesRegex(
                    MODULE.FinalizeError,
                    "raw identity source exceeds",
                ):
                    self.finalize_fixture(root, form)

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            form, _pet_root = self.make_bundle_fixture(root)
            with mock.patch.object(MODULE, "MAX_CONTACT_SHEET_PIXELS", 100):
                with self.assertRaisesRegex(
                    MODULE.FinalizeError,
                    "contactSheet exceeds",
                ):
                    self.finalize_fixture(root, form)

    def test_check_only_revalidates_without_writing_outputs(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            form, pet_root = self.make_bundle_fixture(root)
            self.finalize_fixture(root, form, check_only=True)
            self.assertFalse((pet_root / "action-bundle-meta.json").exists())
            self.assertFalse(
                (pet_root / "source/identity-board-source-meta.json").exists()
            )
            self.assertFalse(
                (pet_root / "source/identity-board-raw.webp").exists()
            )

    def test_non_rideable_form_rejects_mounted_contract(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            form, _pet_root = self.make_bundle_fixture(root)
            form["supportedCharacterIds"] = ["novice_hunter_v1"]
            form["mounted"] = {"root": "forbidden"}
            with self.assertRaisesRegex(MODULE.FinalizeError, "non-rideable"):
                self.finalize_fixture(root, form)


if __name__ == "__main__":
    unittest.main()
