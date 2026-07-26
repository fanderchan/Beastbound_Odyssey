#!/usr/bin/env python3
"""Tests for the read-only 34-form battle-art catalog audit."""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from PIL import Image, ImageDraw


REPO_ROOT = Path(__file__).resolve().parents[2]
TOOL = REPO_ROOT / "tools" / "audit_pet_battle_catalog.py"
sys.path.insert(0, str(REPO_ROOT / "tools"))

from build_pet_art_bundle import derive_runtime_frame, rgba_hash  # noqa: E402


VIEWS = ("front_3quarter_sw", "back_3quarter_ne")
ACTIONS = {
    "idle": 6,
    "walk": 8,
    "attack": 8,
    "skill": 8,
    "hurt": 6,
    "defend": 6,
    "dodge": 8,
    "counter": 8,
    "stagger": 8,
    "knockaway": 8,
    "down": 8,
    "revive": 8,
}
MAPPING = {
    "enemy": {"view": "front_3quarter_sw", "flipH": True, "facing": "southeast"},
    "ally": {"view": "back_3quarter_ne", "flipH": True, "facing": "northwest"},
}


def _write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")


def _write_complete_bundle(root: Path, form_id: str) -> None:
    asset_root = root / "assets" / form_id
    _write_json(
        asset_root / "action-bundle-meta.json",
        {
            "formId": form_id,
            "battleViewMapping": MAPPING,
            "battleVisual": {"battleViewMapping": MAPPING},
        },
    )
    frame = Image.new("RGBA", (256, 256), (40, 80, 120, 255))
    for view in VIEWS:
        for action, frame_count in ACTIONS.items():
            action_root = asset_root / "views" / view / action
            action_root.mkdir(parents=True, exist_ok=True)
            for index in range(1, frame_count + 1):
                frame.save(action_root / f"{action}-{index}.png")


def _write_full_source_contract(root: Path, form_id: str) -> None:
    asset_root = root / "assets" / form_id
    metadata_path = asset_root / "action-bundle-meta.json"
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    metadata["battleVisual"].update(
        {
            "archiveMode": "full",
            "sourceFramesTracked": True,
            "sourceLedger": "source/battle/source-ledger.json",
        }
    )
    _write_json(metadata_path, metadata)

    actions: dict[str, dict[str, object]] = {}
    for view_index, view in enumerate(VIEWS):
        view_actions: dict[str, object] = {}
        for action_index, (action, frame_count) in enumerate(ACTIONS.items()):
            source_hashes: list[str] = []
            runtime_hashes: list[str] = []
            frame_records: list[dict[str, object]] = []
            for index in range(1, frame_count + 1):
                source = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
                visual_action_index = (
                    list(ACTIONS).index("down")
                    if action == "revive" and index == 1
                    else action_index
                )
                visual_index = 8 if action == "revive" and index == 1 else index
                left = 110 + view_index * 8 + visual_action_index
                top = 120 + visual_index
                ImageDraw.Draw(source).rectangle(
                    (left, top, left + 219, top + 209),
                    fill=(
                        40 + visual_action_index * 3,
                        90 + visual_index,
                        130 + view_index * 20,
                        255,
                    ),
                )
                runtime, _cleaned = derive_runtime_frame(
                    source,
                    (255, 0, 255),
                    30.0,
                    96,
                )
                source_path = (
                    asset_root
                    / "source/battle"
                    / view
                    / action
                    / "source-frames"
                    / f"{action}-{index}.png"
                )
                runtime_path = (
                    asset_root
                    / "views"
                    / view
                    / action
                    / f"{action}-{index}.png"
                )
                source_path.parent.mkdir(parents=True, exist_ok=True)
                runtime_path.parent.mkdir(parents=True, exist_ok=True)
                source.save(source_path)
                runtime.save(runtime_path)
                source_digest = rgba_hash(source)
                runtime_digest = rgba_hash(runtime)
                source_hashes.append(source_digest)
                runtime_hashes.append(runtime_digest)
                frame_records.append(
                    {
                        "slot": f"{action}-{index}",
                        "sourceRgbaSha256": source_digest,
                        "runtimeRgbaSha256": runtime_digest,
                    }
                )
            _write_json(
                asset_root
                / "source/battle"
                / view
                / action
                / "pipeline-meta.json",
                {
                    "key": "#FF00FF",
                    "residualMagentaDistance": 30.0,
                    "fringeCleanupAlpha": 96,
                    "frames": frame_records,
                },
            )
            view_actions[action] = {
                "sourceFramesTracked": True,
                "sourceFrameRgbaSha256": source_hashes,
                "runtimeFrameRgbaSha256": runtime_hashes,
            }
        actions[view] = view_actions
    _write_json(
        asset_root / "source/battle/source-ledger.json",
        {
            "schemaVersion": 1,
            "archiveMode": "full",
            "formId": form_id,
            "actions": actions,
        },
    )


class AuditPetBattleCatalogTests(unittest.TestCase):
    def test_reports_complete_and_incomplete_forms_without_mutation(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            _write_complete_bundle(root, "complete_pet")
            incomplete_root = root / "assets" / "incomplete_pet"
            _write_json(
                incomplete_root / "action-bundle-meta.json",
                {
                    "formId": "incomplete_pet",
                    "battleViewMapping": MAPPING,
                    "battleVisual": {"battleViewMapping": MAPPING},
                },
            )
            catalog = {
                "forms": [
                    {
                        "formId": "complete_pet",
                        "displayName": "完整宠",
                        "pet": {
                            "root": "assets/complete_pet",
                            "metadataPath": "assets/complete_pet/action-bundle-meta.json",
                        },
                    },
                    {
                        "formId": "incomplete_pet",
                        "displayName": "缺失宠",
                        "pet": {
                            "root": "assets/incomplete_pet",
                            "metadataPath": "assets/incomplete_pet/action-bundle-meta.json",
                        },
                    },
                ]
            }
            _write_json(root / "catalog.json", catalog)

            result = subprocess.run(
                [
                    sys.executable,
                    str(TOOL),
                    "--repo-root",
                    str(root),
                    "--catalog",
                    "catalog.json",
                    "--json",
                ],
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            report = json.loads(result.stdout)
            self.assertEqual(report["formCount"], 2)
            self.assertEqual(report["completeCount"], 1)
            self.assertEqual(report["forms"][0]["battleFrameCount"], 180)
            self.assertEqual(report["forms"][1]["battleFrameCount"], 0)

            gate = subprocess.run(
                [
                    sys.executable,
                    str(TOOL),
                    "--repo-root",
                    str(root),
                    "--catalog",
                    "catalog.json",
                    "--require-complete",
                ],
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertEqual(gate.returncode, 1)

    def test_selected_form_must_exist(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            _write_json(root / "catalog.json", {"forms": []})
            result = subprocess.run(
                [
                    sys.executable,
                    str(TOOL),
                    "--repo-root",
                    str(root),
                    "--catalog",
                    "catalog.json",
                    "--form",
                    "missing_pet",
                ],
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertEqual(result.returncode, 2)
            self.assertIn("catalog 不存在所选 formId", result.stderr)

    def test_down_hold_and_revive_start_must_match_in_each_runtime_view(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            _write_complete_bundle(root, "broken_continuity_pet")
            changed = Image.new("RGBA", (256, 256), (90, 40, 170, 255))
            changed.save(
                root
                / "assets/broken_continuity_pet/views/back_3quarter_ne/revive/revive-1.png"
            )
            _write_json(
                root / "catalog.json",
                {
                    "forms": [
                        {
                            "formId": "broken_continuity_pet",
                            "displayName": "连续性错误宠",
                            "pet": {"root": "assets/broken_continuity_pet"},
                        }
                    ]
                },
            )

            result = subprocess.run(
                [
                    sys.executable,
                    str(TOOL),
                    "--repo-root",
                    str(root),
                    "--catalog",
                    "catalog.json",
                    "--json",
                    "--require-complete",
                ],
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertEqual(result.returncode, 1, result.stderr)
            report = json.loads(result.stdout)
            self.assertFalse(report["forms"][0]["complete"])
            self.assertIn(
                "runtime back_3quarter_ne down-8 must exactly match revive-1 RGBA",
                report["forms"][0]["errors"],
            )

    def test_full_source_contract_rejects_runtime_only_overlay(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            form_id = "full_source_pet"
            _write_complete_bundle(root, form_id)
            _write_full_source_contract(root, form_id)
            _write_json(
                root / "catalog.json",
                {
                    "forms": [
                        {
                            "formId": form_id,
                            "displayName": "完整母版宠",
                            "pet": {"root": f"assets/{form_id}"},
                        }
                    ]
                },
            )

            passed = subprocess.run(
                [
                    sys.executable,
                    str(TOOL),
                    "--repo-root",
                    str(root),
                    "--catalog",
                    "catalog.json",
                    "--json",
                    "--require-complete",
                ],
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertEqual(passed.returncode, 0, passed.stderr)
            passed_report = json.loads(passed.stdout)
            self.assertEqual(
                passed_report["forms"][0]["trackedSourceFrameCount"],
                180,
            )
            self.assertEqual(
                passed_report["forms"][0]["canonicalDerivedRuntimeFrameCount"],
                180,
            )

            overlaid = Image.new("RGBA", (256, 256), (20, 30, 40, 255))
            overlaid.save(
                root
                / f"assets/{form_id}/views/front_3quarter_sw/attack/attack-1.png"
            )
            failed = subprocess.run(
                [
                    sys.executable,
                    str(TOOL),
                    "--repo-root",
                    str(root),
                    "--catalog",
                    "catalog.json",
                    "--json",
                    "--require-complete",
                ],
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertEqual(failed.returncode, 1, failed.stderr)
            errors = json.loads(failed.stdout)["forms"][0]["errors"]
            self.assertTrue(
                any(
                    "256 运行帧与 source ledger 不一致" in error
                    or "不是已归档 512 母版的规范派生" in error
                    for error in errors
                ),
                errors,
            )


if __name__ == "__main__":
    unittest.main()
