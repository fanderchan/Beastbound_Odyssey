#!/usr/bin/env python3
"""Tests for the read-only 34-form battle-art catalog audit."""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from PIL import Image


REPO_ROOT = Path(__file__).resolve().parents[2]
TOOL = REPO_ROOT / "tools" / "audit_pet_battle_catalog.py"
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


if __name__ == "__main__":
    unittest.main()
