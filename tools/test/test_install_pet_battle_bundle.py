#!/usr/bin/env python3
"""Isolated contract tests for tools/install_pet_battle_bundle.py."""

from __future__ import annotations

import copy
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw


REPO_ROOT = Path(__file__).resolve().parents[2]
TOOL_PATH = REPO_ROOT / "tools" / "install_pet_battle_bundle.py"
FIXTURE_PATH = Path(__file__).parent / "fixtures" / "install_pet_battle_bundle" / "manifest_v1.json"
SPEC = importlib.util.spec_from_file_location("install_pet_battle_bundle", TOOL_PATH)
assert SPEC is not None and SPEC.loader is not None
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


def _write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _manifest_fixture() -> dict[str, Any]:
    return json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))


def _source_frame(view_index: int, action_index: int, frame_index: int) -> Image.Image:
    """Create unique asymmetric transparent test art with safe, stable bounds."""

    image = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    red = 45 + (action_index * 13 + frame_index * 3) % 170
    green = 85 + view_index * 70
    blue = 75 + (action_index * 9) % 140
    x_shift = frame_index % 3
    draw.rounded_rectangle((126 + x_shift, 116, 374 + x_shift, 463), radius=46, fill=(red, green, blue, 255))
    draw.polygon(((142 + x_shift, 150), (174 + x_shift, 75), (205 + x_shift, 151)), fill=(230, 166, 63, 255))
    # View-coded eye location makes front/back independently authored and asymmetric.
    eye_x = 184 + view_index * 78 + x_shift
    draw.ellipse((eye_x, 183, eye_x + 22, 205), fill=(14, 25, 36, 255))
    # Frame-coded interior gesture changes guarantee no duplicate poses.
    marker_x = 176 + frame_index * 13
    marker_y = 322 + action_index % 7
    draw.polygon(
        ((marker_x, marker_y), (marker_x + 13, marker_y - 11), (marker_x + 24, marker_y + 7)),
        fill=(244, 221 - frame_index * 5, 70 + action_index, 255),
    )
    return image


def _refresh_action_integrity(action_root: Path) -> None:
    pipeline_path = action_root / "pipeline-meta.json"
    pipeline = json.loads(pipeline_path.read_text(encoding="utf-8"))
    action = action_root.name
    for index, frame_meta in enumerate(pipeline["frames"], start=1):
        source = action_root / "source-frames" / f"{action}-{index}.png"
        runtime = action_root / "runtime-frames" / f"{action}-{index}.png"
        with Image.open(source) as image:
            frame_meta["sourceRgbaSha256"] = MODULE.rgba_hash(image)
        with Image.open(runtime) as image:
            frame_meta["runtimeRgbaSha256"] = MODULE.rgba_hash(image)
    _write_json(pipeline_path, pipeline)
    source_meta_path = action_root / "source-meta.json"
    source_meta = json.loads(source_meta_path.read_text(encoding="utf-8"))
    source_meta["pipelineSha256"] = MODULE.sha256_file(pipeline_path)
    _write_json(source_meta_path, source_meta)


def _materialize_staging(root: Path, *, mounted: bool = False) -> tuple[Path, dict[str, Any]]:
    staging = root / "staging"
    manifest = _manifest_fixture()
    if mounted:
        manifest.update(
            {
                "kind": "mounted",
                "bundleId": "fixture_pet_v1_novice_hunter_v1_battle_v1",
                "characterId": "novice_hunter_v1",
            }
        )
        manifest["visualContract"].update(
            {"integratedWholeFrame": True, "runtimeLayeredComposition": False}
        )

    for view_index, view in enumerate(MODULE.FORMAL_VIEWS):
        for action_index, (action, (frame_count, _fps, _loop)) in enumerate(MODULE.ACTION_SPECS.items()):
            action_root = staging / "views" / view / action
            source_dir = action_root / "source-frames"
            runtime_dir = action_root / "runtime-frames"
            source_dir.mkdir(parents=True, exist_ok=True)
            runtime_dir.mkdir(parents=True, exist_ok=True)

            raw_png = action_root / "raw-input.png"
            raw_image = Image.new("RGBA", (96, 96), (255, 0, 255, 255))
            ImageDraw.Draw(raw_image).ellipse((20, 12, 76, 84), fill=(35 + action_index, 90, 150, 255))
            raw_image.save(raw_png)
            original_hash = MODULE.sha256_file(raw_png)
            raw_archive = action_root / "raw-sheet-lossless.webp"
            raw_image.save(raw_archive, format="WEBP", lossless=True, quality=100, method=6, exact=True)
            raw_png.unlink()

            prompt = action_root / "prompt-used.txt"
            prompt.write_text(
                f"Generate the exact fixture creature in {view}, action {action}, with stable identity and no detached effects.\n",
                encoding="utf-8",
            )
            qa = {
                "schemaVersion": 1,
                "status": "passed",
                "view": view,
                "action": action,
                "frameCount": frame_count,
                "errors": [],
                "emptyFrames": [],
                "duplicateFrames": [],
                "edgeTouchFrames": [],
                "identityDriftFrames": [],
                "ownerReviewStatus": "pending",
            }
            qa_path = action_root / "qa.json"
            _write_json(qa_path, qa)

            frames: list[dict[str, Any]] = []
            for frame_index in range(1, frame_count + 1):
                source = _source_frame(view_index, action_index, frame_index)
                runtime = MODULE._clean_resampled_runtime(source, (255, 0, 255), 30.0, 96)
                source_path = source_dir / f"{action}-{frame_index}.png"
                runtime_path = runtime_dir / f"{action}-{frame_index}.png"
                source.save(source_path)
                runtime.save(runtime_path)
                frames.append(
                    {
                        "slot": f"{action}-{frame_index}",
                        "sourceRgbaSha256": MODULE.rgba_hash(source),
                        "runtimeRgbaSha256": MODULE.rgba_hash(runtime),
                    }
                )
            pipeline = {
                "schemaVersion": 1,
                "tool": "build_pet_art_bundle.py",
                "inputSha256": original_hash,
                "slots": [f"{action}-{index}" for index in range(1, frame_count + 1)],
                "sourceFrameSize": 512,
                "runtimeFrameSize": 256,
                "safeMargin": 8,
                "effectiveSourceMargin": 16,
                "key": "#FF00FF",
                "residualMagentaDistance": 30.0,
                "fringeCleanupAlpha": 96,
                "frames": frames,
            }
            pipeline_path = action_root / "pipeline-meta.json"
            _write_json(pipeline_path, pipeline)
            source_meta = {
                "schemaVersion": 1,
                "generator": "OpenAI built-in image generation",
                "originalGeneratedSha256": original_hash,
                "originalGeneratedDecodedRgbaSha256": MODULE.decoded_rgba_hash(raw_archive),
                "rawArchive": "raw-sheet-lossless.webp",
                "rawArchiveSha256": MODULE.sha256_file(raw_archive),
                "rawDecodedRgbaSha256": MODULE.decoded_rgba_hash(raw_archive),
                "prompt": "prompt-used.txt",
                "promptSha256": MODULE.sha256_file(prompt),
                "pipelineMetadata": "pipeline-meta.json",
                "pipelineSha256": MODULE.sha256_file(pipeline_path),
                "qc": "qa.json",
                "qcSha256": MODULE.sha256_file(qa_path),
            }
            _write_json(action_root / "source-meta.json", source_meta)

    qa_dir = staging / "qa"
    qa_dir.mkdir(parents=True, exist_ok=True)
    contact = Image.new("RGB", (640, 360), (21, 35, 38))
    ImageDraw.Draw(contact).rectangle((20, 20, 620, 340), outline=(197, 158, 78), width=4)
    contact_path = qa_dir / "contact-sheet.png"
    contact.save(contact_path)
    qc_summary = {
        "schemaVersion": 1,
        "status": "passed",
        "formId": manifest["formId"],
        "kind": manifest["kind"],
        "views": list(MODULE.FORMAL_VIEWS),
        "actions": list(MODULE.ACTION_SPECS),
        "totalFrameCount": sum(value[0] for value in MODULE.ACTION_SPECS.values()) * 2,
        "errors": [],
        "ownerReviewStatus": "pending",
    }
    qc_path = qa_dir / "qc-summary.json"
    _write_json(qc_path, qc_summary)
    manifest["review"]["contactSheetSha256"] = MODULE.sha256_file(contact_path)
    manifest["review"]["qcSummarySha256"] = MODULE.sha256_file(qc_path)
    _write_json(staging / "bundle-manifest.json", manifest)
    return staging, manifest


def _options(
    staging: Path,
    destination: Path,
    *,
    mounted: bool = False,
    dry_run: bool = False,
    archive_mode: str = "full",
):
    return MODULE.InstallOptions(
        staging=staging,
        destination=destination,
        form_id="fixture_pet_v1",
        kind="mounted" if mounted else "pet",
        character_id="novice_hunter_v1" if mounted else None,
        dry_run=dry_run,
        archive_mode=archive_mode,
    )


class InstallPetBattleBundleTest(unittest.TestCase):
    def test_valid_pet_bundle_installs_180_frames_and_pending_metadata(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            staging, _ = _materialize_staging(root)
            destination = root / "asset-root"

            summary = MODULE.install_bundle(_options(staging, destination))

            self.assertTrue(summary["changed"])
            self.assertEqual(summary["frameCount"], 180)
            runtime_frames = list((destination / "views").glob("*/*/*.png"))
            source_frames = list((destination / "source/battle").glob("*/*/source-frames/*.png"))
            self.assertEqual(len(runtime_frames), 180)
            self.assertEqual(len(source_frames), 180)
            metadata = json.loads((destination / "action-bundle-meta.json").read_text(encoding="utf-8"))
            self.assertFalse(metadata["runtimeEnabled"])
            self.assertEqual(metadata["ownerReviewStatus"], "pending")
            self.assertEqual(metadata["battleVisual"]["status"], "owner_review_pending")

    def test_lean_archive_validates_full_source_but_tracks_runtime_and_compact_provenance(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            staging, _ = _materialize_staging(root)
            destination = root / "asset-root"

            summary = MODULE.install_bundle(
                _options(staging, destination, archive_mode="lean")
            )

            self.assertEqual(summary["archiveMode"], "lean")
            self.assertFalse(summary["trackedSourceFrames"])
            self.assertEqual(len(list((destination / "views").glob("*/*/*.png"))), 180)
            self.assertEqual(
                len(list((destination / "source/battle").glob("*/*/source-frames/*.png"))),
                0,
            )
            self.assertEqual(
                len(list((destination / "source/battle").glob("*/idle/raw-sheet-lossless.*"))),
                2,
            )
            self.assertEqual(
                len(list((destination / "source/battle").glob("*/*/prompt-used.txt"))),
                24,
            )
            ledger = json.loads(
                (destination / "source/battle/source-ledger.json").read_text(encoding="utf-8")
            )
            self.assertEqual(ledger["archiveMode"], "lean")
            self.assertTrue(ledger["fullSourceValidationRequiredBeforeInstall"])
            self.assertFalse(
                ledger["actions"]["front_3quarter_sw"]["attack"]["sourceFramesTracked"]
            )
            self.assertTrue(
                ledger["actions"]["back_3quarter_ne"]["idle"]["representativeRawTracked"]
            )
            metadata = json.loads(
                (destination / "action-bundle-meta.json").read_text(encoding="utf-8")
            )
            self.assertEqual(metadata["battleVisual"]["archiveMode"], "lean")
            self.assertFalse(metadata["battleVisual"]["sourceFramesTracked"])

            repeated = MODULE.install_bundle(
                _options(staging, destination, archive_mode="lean")
            )
            self.assertFalse(repeated["changed"])

    def test_dry_run_validates_without_creating_destination(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            staging, _ = _materialize_staging(root)
            destination = root / "asset-root"

            summary = MODULE.install_bundle(_options(staging, destination, dry_run=True))

            self.assertTrue(summary["changed"])
            self.assertTrue(summary["dryRun"])
            self.assertFalse(destination.exists())

    def test_repeat_install_is_idempotent_and_detects_no_change(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            staging, _ = _materialize_staging(root)
            destination = root / "asset-root"
            first = MODULE.install_bundle(_options(staging, destination))
            marker_mtime = (destination / "action-bundle-meta.json").stat().st_mtime_ns

            second = MODULE.install_bundle(_options(staging, destination))

            self.assertTrue(first["changed"])
            self.assertFalse(second["changed"])
            self.assertEqual(marker_mtime, (destination / "action-bundle-meta.json").stat().st_mtime_ns)

    def test_missing_frame_fails_before_destination_mutation(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            staging, _ = _materialize_staging(root)
            missing = staging / "views/front_3quarter_sw/idle/source-frames/idle-6.png"
            missing.unlink()
            destination = root / "asset-root"

            with self.assertRaisesRegex(MODULE.BattleBundleError, "missing or unsafe.*source frame"):
                MODULE.install_bundle(_options(staging, destination))
            self.assertFalse(destination.exists())

    def test_runtime_not_derived_from_source_fails_even_with_updated_hashes(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            staging, _ = _materialize_staging(root)
            action_root = staging / "views/front_3quarter_sw/attack"
            runtime_path = action_root / "runtime-frames/attack-2.png"
            with Image.open(runtime_path) as image:
                changed = image.copy()
            ImageDraw.Draw(changed).rectangle((90, 90, 96, 96), fill=(255, 255, 255, 255))
            changed.save(runtime_path)
            _refresh_action_integrity(action_root)

            with self.assertRaisesRegex(MODULE.BattleBundleError, "not deterministically derived"):
                MODULE.install_bundle(_options(staging, root / "asset-root"))

    def test_duplicate_frames_are_rejected_independent_of_qc_claim(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            staging, _ = _materialize_staging(root)
            action_root = staging / "views/front_3quarter_sw/hurt"
            shutil_source = action_root / "source-frames/hurt-1.png"
            shutil_runtime = action_root / "runtime-frames/hurt-1.png"
            (action_root / "source-frames/hurt-2.png").write_bytes(shutil_source.read_bytes())
            (action_root / "runtime-frames/hurt-2.png").write_bytes(shutil_runtime.read_bytes())
            _refresh_action_integrity(action_root)

            with self.assertRaisesRegex(MODULE.BattleBundleError, "duplicate frame content"):
                MODULE.install_bundle(_options(staging, root / "asset-root"))

    def test_exact_mirrored_battle_view_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            staging, _ = _materialize_staging(root)
            front = staging / "views/front_3quarter_sw/defend/source-frames/defend-3.png"
            back_root = staging / "views/back_3quarter_ne/defend"
            back_source = back_root / "source-frames/defend-3.png"
            back_runtime = back_root / "runtime-frames/defend-3.png"
            with Image.open(front) as image:
                mirrored_source = image.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
            mirrored_source.save(back_source)
            MODULE._clean_resampled_runtime(mirrored_source, (255, 0, 255), 30.0, 96).save(back_runtime)
            _refresh_action_integrity(back_root)

            with self.assertRaisesRegex(MODULE.BattleBundleError, "exact mirror"):
                MODULE.install_bundle(_options(staging, root / "asset-root"))

    def test_path_traversal_in_source_metadata_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            staging, _ = _materialize_staging(root)
            source_meta_path = staging / "views/front_3quarter_sw/idle/source-meta.json"
            source_meta = json.loads(source_meta_path.read_text(encoding="utf-8"))
            source_meta["prompt"] = "../../../../outside.txt"
            _write_json(source_meta_path, source_meta)

            with self.assertRaisesRegex(MODULE.BattleBundleError, "escapes staging root"):
                MODULE.install_bundle(_options(staging, root / "asset-root"))

    def test_forged_owner_approval_and_runtime_enable_are_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            staging, manifest = _materialize_staging(root)
            forged = copy.deepcopy(manifest)
            forged["ownerReviewStatus"] = "approved"
            forged["runtimeEnabled"] = True
            _write_json(staging / "bundle-manifest.json", forged)

            with self.assertRaises(MODULE.BattleBundleError):
                MODULE.install_bundle(_options(staging, root / "asset-root"))

    def test_atomic_swap_failure_restores_original_destination(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            staging, _ = _materialize_staging(root)
            destination = root / "asset-root"
            destination.mkdir()
            marker = destination / "keep-me.txt"
            marker.write_text("original\n", encoding="utf-8")

            def fail_after_backup() -> None:
                raise RuntimeError("injected swap failure")

            with self.assertRaisesRegex(RuntimeError, "injected swap failure"):
                MODULE.install_bundle(
                    _options(staging, destination),
                    after_backup=fail_after_backup,
                )
            self.assertEqual(marker.read_text(encoding="utf-8"), "original\n")
            self.assertFalse((destination / "views").exists())
            self.assertEqual(list(root.glob(".asset-root.backup-*")), [])

    def test_mounted_bundle_requires_and_preserves_whole_frame_contract(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            staging, _ = _materialize_staging(root, mounted=True)
            destination = root / "mounted-root"

            summary = MODULE.install_bundle(_options(staging, destination, mounted=True))

            self.assertEqual(summary["kind"], "mounted")
            metadata = json.loads((destination / "action-bundle-meta.json").read_text(encoding="utf-8"))
            self.assertEqual(metadata["mountFormId"], "fixture_pet_v1")
            self.assertEqual(metadata["characterId"], "novice_hunter_v1")
            self.assertTrue(metadata["battleVisual"]["integratedWholeFrame"])
            self.assertFalse(metadata["battleVisual"]["runtimeLayeredComposition"])

    def test_cli_emits_machine_readable_failure_summary(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            output = root / "summary.json"
            completed = subprocess.run(
                [
                    sys.executable,
                    str(TOOL_PATH),
                    "--staging",
                    str(root / "missing"),
                    "--destination",
                    str(root / "dest"),
                    "--form",
                    "fixture_pet_v1",
                    "--kind",
                    "pet",
                    "--json",
                    "--json-out",
                    str(output),
                ],
                capture_output=True,
                text=True,
                check=False,
                timeout=30,
            )
            payload = json.loads(completed.stdout)
            self.assertEqual(completed.returncode, 1)
            self.assertEqual(payload["status"], "failed")
            self.assertEqual(json.loads(output.read_text(encoding="utf-8"))["status"], "failed")


if __name__ == "__main__":
    unittest.main()
