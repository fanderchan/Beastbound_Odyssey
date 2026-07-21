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
TOOLS_DIR = REPO_ROOT / "tools"
TOOL_PATH = REPO_ROOT / "tools" / "install_pet_battle_bundle.py"
FIXTURE_PATH = Path(__file__).parent / "fixtures" / "install_pet_battle_bundle" / "manifest_v1.json"
sys.path.insert(0, str(TOOLS_DIR))

import build_pet_art_bundle as BUILDER  # noqa: E402

SPEC = importlib.util.spec_from_file_location("install_pet_battle_bundle", TOOL_PATH)
assert SPEC is not None and SPEC.loader is not None
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)

EXPECTED_BATTLE_VIEW_MAPPING = {
    "enemy": {
        "view": "front_3quarter_sw",
        "flipH": True,
        "facing": "southeast",
    },
    "ally": {
        "view": "back_3quarter_ne",
        "flipH": True,
        "facing": "northwest",
    },
}


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
                if action == "revive" and frame_index == 1:
                    down_hold = (
                        staging
                        / "views"
                        / view
                        / "down"
                        / "source-frames"
                        / "down-8.png"
                    )
                    with Image.open(down_hold) as image:
                        source = image.convert("RGBA").copy()
                else:
                    source = _source_frame(view_index, action_index, frame_index)
                runtime, _cleaned_fringe = BUILDER.derive_runtime_frame(
                    source,
                    (255, 0, 255),
                    30.0,
                    96,
                )
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
        "actionEvidence": [],
    }
    for view_index, view in enumerate(MODULE.FORMAL_VIEWS):
        for action_index, (action, (frame_count, _fps, _loop)) in enumerate(
            MODULE.ACTION_SPECS.items()
        ):
            action_qa_dir = qa_dir / "actions" / view
            action_qa_dir.mkdir(parents=True, exist_ok=True)
            action_contact = action_qa_dir / f"{action}-contact.png"
            contact_image = Image.new(
                "RGB",
                (96, 64),
                (25 + view_index * 40, 40 + action_index * 5, 75),
            )
            ImageDraw.Draw(contact_image).text((6, 6), f"{view}/{action}", fill=(240, 220, 160))
            contact_image.save(action_contact)

            action_gif = action_qa_dir / f"{action}.gif"
            gif_frames = [
                Image.new(
                    "RGB",
                    (24, 24),
                    (
                        20 + view_index * 70,
                        30 + (action_index * 13 + frame_index * 17) % 200,
                        80 + frame_index * 7,
                    ),
                )
                for frame_index in range(frame_count)
            ]
            gif_frames[0].save(
                action_gif,
                save_all=True,
                append_images=gif_frames[1:],
                duration=110,
                loop=0,
            )
            qc_summary["actionEvidence"].append(
                {
                    "view": view,
                    "action": action,
                    "frameCount": frame_count,
                    "contactSheet": f"qa/actions/{view}/{action}-contact.png",
                    "contactSheetSha256": MODULE.sha256_file(action_contact),
                    "gif": f"qa/actions/{view}/{action}.gif",
                    "gifSha256": MODULE.sha256_file(action_gif),
                }
            )
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
    def test_runtime_derivation_matches_builder_premultiplied_transparent_edges(self) -> None:
        source = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
        draw = ImageDraw.Draw(source)
        draw.rounded_rectangle(
            (123, 91, 390, 468),
            radius=61,
            fill=(112, 67, 31, 231),
        )
        draw.polygon(
            ((339, 126), (438, 171), (357, 235)),
            fill=(38, 178, 65, 91),
        )

        expected, _cleaned_fringe = BUILDER.derive_runtime_frame(
            source,
            (255, 0, 255),
            30.0,
            96,
        )
        actual = MODULE._clean_resampled_runtime(
            source,
            (255, 0, 255),
            30.0,
            96,
        )
        legacy_straight = source.resize(
            (MODULE.RUNTIME_FRAME_SIZE, MODULE.RUNTIME_FRAME_SIZE),
            Image.Resampling.LANCZOS,
        )
        legacy_straight, _legacy_cleaned = BUILDER.clean_resample_alpha(
            legacy_straight,
            (255, 0, 255),
            30.0,
            96,
        )

        self.assertEqual(MODULE.rgba_hash(actual), MODULE.rgba_hash(expected))
        self.assertEqual(actual.getchannel("A").tobytes(), legacy_straight.getchannel("A").tobytes())
        self.assertNotEqual(MODULE.rgba_hash(actual), MODULE.rgba_hash(legacy_straight))

    def test_install_replays_explicit_bilinear_and_keeps_legacy_default(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            staging, _ = _materialize_staging(root)
            action_root = staging / "views/front_3quarter_sw/attack"
            source_path = action_root / "source-frames/attack-2.png"
            runtime_path = action_root / "runtime-frames/attack-2.png"
            with Image.open(source_path) as image:
                source = image.convert("RGBA").copy()
            ImageDraw.Draw(source).rectangle(
                (172, 172, 211, 211),
                fill=(190, 24, 205, 96),
            )
            bilinear_runtime, bilinear_cleaned = BUILDER.derive_runtime_frame(
                source,
                (255, 0, 255),
                30.0,
                96,
                resample_mode=BUILDER.PREMULTIPLIED_BILINEAR,
            )
            legacy_runtime = MODULE._clean_resampled_runtime(
                source,
                (255, 0, 255),
                30.0,
                96,
            )
            self.assertEqual(bilinear_cleaned, 0)
            self.assertNotEqual(
                MODULE.rgba_hash(bilinear_runtime),
                MODULE.rgba_hash(legacy_runtime),
            )
            source.save(source_path)
            bilinear_runtime.save(runtime_path)

            pipeline_path = action_root / "pipeline-meta.json"
            pipeline = json.loads(pipeline_path.read_text(encoding="utf-8"))
            pipeline["frames"][1]["chroma"] = {
                "inputBackgroundMode": "chroma_key",
            }
            pipeline["frames"][1]["sourceResampleMode"] = (
                BUILDER.PREMULTIPLIED_BILINEAR
            )
            pipeline["frames"][1]["runtimeResampleMode"] = (
                BUILDER.PREMULTIPLIED_BILINEAR
            )
            _write_json(pipeline_path, pipeline)
            _refresh_action_integrity(action_root)

            bilinear_summary = MODULE.install_bundle(
                _options(staging, root / "bilinear-asset-root")
            )
            self.assertTrue(bilinear_summary["changed"])
            self.assertEqual(
                MODULE.decoded_rgba_hash(
                    root
                    / "bilinear-asset-root/views/front_3quarter_sw/attack/attack-2.png"
                ),
                MODULE.rgba_hash(bilinear_runtime),
            )

            legacy_runtime.save(runtime_path)
            pipeline = json.loads(pipeline_path.read_text(encoding="utf-8"))
            pipeline["frames"][1]["sourceResampleMode"] = (
                BUILDER.PREMULTIPLIED_LANCZOS
            )
            pipeline["frames"][1]["runtimeResampleMode"] = (
                BUILDER.PREMULTIPLIED_LANCZOS
            )
            pipeline["frames"][1]["chroma"]["inputBackgroundMode"] = (
                "transparent_alpha"
            )
            _write_json(pipeline_path, pipeline)
            _refresh_action_integrity(action_root)

            explicit_legacy = MODULE.install_bundle(
                _options(staging, root / "explicit-legacy-asset-root")
            )
            self.assertTrue(explicit_legacy["changed"])
            self.assertEqual(
                MODULE.decoded_rgba_hash(
                    root
                    / "explicit-legacy-asset-root/views/front_3quarter_sw/attack/attack-2.png"
                ),
                MODULE.rgba_hash(legacy_runtime),
            )

            pipeline = json.loads(pipeline_path.read_text(encoding="utf-8"))
            pipeline["frames"][1]["chroma"]["inputBackgroundMode"] = "chroma_key"
            _write_json(pipeline_path, pipeline)
            _refresh_action_integrity(action_root)
            with self.assertRaisesRegex(
                MODULE.BattleBundleError,
                "chroma.inputBackgroundMode=chroma_key requires .*premultiplied_bilinear",
            ):
                MODULE.install_bundle(
                    _options(staging, root / "keyed-explicit-lanczos-root")
                )

            pipeline = json.loads(pipeline_path.read_text(encoding="utf-8"))
            del pipeline["frames"][1]["sourceResampleMode"]
            del pipeline["frames"][1]["runtimeResampleMode"]
            pipeline["frames"][1]["chroma"]["inputBackgroundMode"] = "chroma_key"
            _write_json(pipeline_path, pipeline)
            _refresh_action_integrity(action_root)

            missing_mode = MODULE.install_bundle(
                _options(staging, root / "missing-mode-asset-root")
            )
            self.assertTrue(missing_mode["changed"])
            self.assertEqual(
                MODULE.decoded_rgba_hash(
                    root
                    / "missing-mode-asset-root/views/front_3quarter_sw/attack/attack-2.png"
                ),
                MODULE.rgba_hash(legacy_runtime),
            )

            pipeline = json.loads(pipeline_path.read_text(encoding="utf-8"))
            pipeline["frames"][1]["runtimeResampleMode"] = (
                BUILDER.PREMULTIPLIED_LANCZOS
            )
            _write_json(pipeline_path, pipeline)
            _refresh_action_integrity(action_root)
            with self.assertRaisesRegex(
                MODULE.BattleBundleError,
                "must both be present or both be omitted",
            ):
                MODULE.install_bundle(_options(staging, root / "runtime-only-mode-root"))

            pipeline = json.loads(pipeline_path.read_text(encoding="utf-8"))
            del pipeline["frames"][1]["runtimeResampleMode"]
            pipeline["frames"][1]["sourceResampleMode"] = (
                BUILDER.PREMULTIPLIED_LANCZOS
            )
            _write_json(pipeline_path, pipeline)
            _refresh_action_integrity(action_root)
            with self.assertRaisesRegex(
                MODULE.BattleBundleError,
                "must both be present or both be omitted",
            ):
                MODULE.install_bundle(_options(staging, root / "source-only-mode-root"))

            pipeline = json.loads(pipeline_path.read_text(encoding="utf-8"))
            pipeline["frames"][1]["sourceResampleMode"] = (
                BUILDER.PREMULTIPLIED_LANCZOS
            )
            pipeline["frames"][1]["runtimeResampleMode"] = 7
            _write_json(pipeline_path, pipeline)
            _refresh_action_integrity(action_root)
            with self.assertRaisesRegex(
                MODULE.BattleBundleError,
                "runtimeResampleMode must be a string",
            ):
                MODULE.install_bundle(_options(staging, root / "non-string-mode-root"))

            pipeline = json.loads(pipeline_path.read_text(encoding="utf-8"))
            pipeline["frames"][1]["sourceResampleMode"] = "premultiplied_nearest"
            pipeline["frames"][1]["runtimeResampleMode"] = "premultiplied_nearest"
            _write_json(pipeline_path, pipeline)
            _refresh_action_integrity(action_root)
            with self.assertRaisesRegex(
                MODULE.BattleBundleError,
                "sourceResampleMode is unsupported",
            ):
                MODULE.install_bundle(_options(staging, root / "unknown-mode-root"))

            pipeline = json.loads(pipeline_path.read_text(encoding="utf-8"))
            pipeline["frames"][1]["sourceResampleMode"] = (
                BUILDER.PREMULTIPLIED_BILINEAR
            )
            pipeline["frames"][1]["runtimeResampleMode"] = (
                BUILDER.PREMULTIPLIED_LANCZOS
            )
            _write_json(pipeline_path, pipeline)
            _refresh_action_integrity(action_root)
            with self.assertRaisesRegex(
                MODULE.BattleBundleError,
                "sourceResampleMode and runtimeResampleMode must match",
            ):
                MODULE.install_bundle(_options(staging, root / "mismatched-mode-root"))

            pipeline = json.loads(pipeline_path.read_text(encoding="utf-8"))
            pipeline["frames"][1]["sourceResampleMode"] = (
                BUILDER.PREMULTIPLIED_BILINEAR
            )
            pipeline["frames"][1]["runtimeResampleMode"] = (
                BUILDER.PREMULTIPLIED_BILINEAR
            )
            pipeline["frames"][1]["chroma"]["inputBackgroundMode"] = "transparent_alpha"
            _write_json(pipeline_path, pipeline)
            _refresh_action_integrity(action_root)
            with self.assertRaisesRegex(
                MODULE.BattleBundleError,
                "chroma.inputBackgroundMode=transparent_alpha requires .*premultiplied_lanczos",
            ):
                MODULE.install_bundle(
                    _options(staging, root / "transparent-bilinear-root")
                )

            pipeline = json.loads(pipeline_path.read_text(encoding="utf-8"))
            del pipeline["frames"][1]["chroma"]
            _write_json(pipeline_path, pipeline)
            _refresh_action_integrity(action_root)
            with self.assertRaisesRegex(
                MODULE.BattleBundleError,
                "explicit resample modes require chroma.inputBackgroundMode",
            ):
                MODULE.install_bundle(
                    _options(staging, root / "missing-chroma-bilinear-root")
                )

            pipeline = json.loads(pipeline_path.read_text(encoding="utf-8"))
            pipeline["frames"][1]["chroma"] = {
                "inputBackgroundMode": "opaque_unknown",
            }
            pipeline["frames"][1]["sourceResampleMode"] = (
                BUILDER.PREMULTIPLIED_LANCZOS
            )
            pipeline["frames"][1]["runtimeResampleMode"] = (
                BUILDER.PREMULTIPLIED_LANCZOS
            )
            legacy_runtime.save(runtime_path)
            _write_json(pipeline_path, pipeline)
            _refresh_action_integrity(action_root)
            with self.assertRaisesRegex(
                MODULE.BattleBundleError,
                "explicit resample modes require chroma.inputBackgroundMode",
            ):
                MODULE.install_bundle(
                    _options(staging, root / "unknown-chroma-explicit-lanczos-root")
                )

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
            self.assertEqual(metadata["battleViewMapping"], EXPECTED_BATTLE_VIEW_MAPPING)
            self.assertEqual(
                metadata["battleVisual"]["battleViewMapping"],
                EXPECTED_BATTLE_VIEW_MAPPING,
            )

    def test_action_evidence_is_relocated_and_qc_paths_match_installed_layout(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            staging, _ = _materialize_staging(root)
            destination = root / "asset-root"

            MODULE.install_bundle(_options(staging, destination, archive_mode="lean"))

            installed_qc_path = destination / "qa/battle/qc-summary.json"
            installed_qc = json.loads(installed_qc_path.read_text(encoding="utf-8"))
            self.assertEqual(len(installed_qc["actionEvidence"]), 24)
            for evidence in installed_qc["actionEvidence"]:
                view = evidence["view"]
                action = evidence["action"]
                self.assertEqual(
                    evidence["contactSheet"],
                    f"qa/battle/actions/{view}/{action}-contact.png",
                )
                self.assertEqual(
                    evidence["gif"],
                    f"qa/battle/actions/{view}/{action}.gif",
                )
                self.assertTrue((destination / evidence["contactSheet"]).is_file())
                self.assertTrue((destination / evidence["gif"]).is_file())
            self.assertFalse((destination / "qa/actions").exists())

            install_manifest = json.loads(
                (destination / "source/battle/install-manifest.json").read_text(
                    encoding="utf-8"
                )
            )
            installed_hashes = install_manifest["installedFileHashes"]
            self.assertEqual(
                installed_hashes["qa/battle/qc-summary.json"],
                MODULE.sha256_file(installed_qc_path),
            )
            self.assertIn(
                "qa/battle/actions/front_3quarter_sw/idle.gif",
                installed_hashes,
            )

            repeated = MODULE.install_bundle(
                _options(staging, destination, archive_mode="lean")
            )
            self.assertFalse(repeated["changed"])

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
            metadata = json.loads(
                (destination / "action-bundle-meta.json").read_text(encoding="utf-8")
            )
            self.assertEqual(metadata["battleViewMapping"], EXPECTED_BATTLE_VIEW_MAPPING)
            self.assertEqual(
                metadata["battleVisual"]["battleViewMapping"],
                EXPECTED_BATTLE_VIEW_MAPPING,
            )

    def test_install_repairs_legacy_false_and_string_battle_view_mapping(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            staging, _ = _materialize_staging(root, mounted=True)
            destination = root / "mounted-root"
            _write_json(
                destination / "action-bundle-meta.json",
                {
                    "schemaVersion": 1,
                    "mountFormId": "fixture_pet_v1",
                    "characterId": "novice_hunter_v1",
                    "runtimeEnabled": False,
                    "legacyMarker": "preserve-me",
                    "battleViewMapping": {
                        "ally": {
                            "view": "back_3quarter_ne",
                            "flipH": False,
                            "facing": "northeast",
                        },
                        "enemy": {
                            "view": "front_3quarter_sw",
                            "flipH": False,
                            "facing": "southwest",
                        },
                    },
                    "battleVisual": {
                        "battleViewMapping": {
                            "ally": "back_3quarter_ne",
                            "enemy": "front_3quarter_sw",
                        }
                    },
                },
            )

            repaired = MODULE.install_bundle(
                _options(staging, destination, mounted=True)
            )

            self.assertTrue(repaired["changed"])
            metadata = json.loads(
                (destination / "action-bundle-meta.json").read_text(encoding="utf-8")
            )
            self.assertEqual(metadata["legacyMarker"], "preserve-me")
            self.assertEqual(metadata["battleViewMapping"], EXPECTED_BATTLE_VIEW_MAPPING)
            self.assertEqual(
                metadata["battleVisual"]["battleViewMapping"],
                EXPECTED_BATTLE_VIEW_MAPPING,
            )

            repeated = MODULE.install_bundle(
                _options(staging, destination, mounted=True)
            )
            self.assertFalse(repeated["changed"])

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

    def test_down_hold_must_exactly_match_revive_start_in_both_views(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            staging, _ = _materialize_staging(root)
            action_root = staging / "views/back_3quarter_ne/revive"
            source_path = action_root / "source-frames/revive-1.png"
            runtime_path = action_root / "runtime-frames/revive-1.png"
            with Image.open(source_path) as image:
                changed_source = image.convert("RGBA").copy()
            ImageDraw.Draw(changed_source).rectangle(
                (246, 246, 254, 254),
                fill=(249, 237, 91, 255),
            )
            changed_runtime, _cleaned_fringe = BUILDER.derive_runtime_frame(
                changed_source,
                (255, 0, 255),
                30.0,
                96,
            )
            changed_source.save(source_path)
            changed_runtime.save(runtime_path)
            _refresh_action_integrity(action_root)

            with self.assertRaisesRegex(
                MODULE.BattleBundleError,
                "runtime back_3quarter_ne down-8 must exactly match revive-1 RGBA",
            ):
                MODULE.install_bundle(_options(staging, root / "asset-root"))
            self.assertFalse((root / "asset-root").exists())

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
            self.assertEqual(metadata["battleViewMapping"], EXPECTED_BATTLE_VIEW_MAPPING)
            self.assertEqual(
                metadata["battleVisual"]["battleViewMapping"],
                EXPECTED_BATTLE_VIEW_MAPPING,
            )

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
