#!/usr/bin/env python3
"""Isolated tests for tools/world_semantic_approval.py."""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[2]
TOOL = REPO_ROOT / "tools" / "world_semantic_approval.py"
DIRECTIONS = (
    "south",
    "southwest",
    "west",
    "northwest",
    "north",
    "northeast",
    "east",
    "southeast",
)
ACTIONS = {"idle": 1, "walk": 4}
FORM_ID = "fixture_form"
CHARACTER_ROOT = Path("assets/characters/fixture")
PET_ROOT = Path("assets/pets/fixture")
MOUNTED_ROOT = Path("assets/mounted/fixture")


def _write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _materialize_world(root: Path, *, salt: str) -> None:
    for direction in DIRECTIONS:
        for action, count in ACTIONS.items():
            for index in range(1, count + 1):
                path = root / "world" / "directions" / direction / action / f"{action}-{index}.png"
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(f"fixture:{salt}:{direction}:{action}:{index}\n".encode())


def _materialize_fixture(repo_root: Path) -> tuple[Path, Path]:
    catalog_path = repo_root / "catalog.json"
    manifest_path = repo_root / "approval.json"
    _write_json(
        catalog_path,
        {
            "defaultCharacterId": "fixture_character_v1",
            "forms": [
                {
                    "formId": FORM_ID,
                    "pet": {"root": PET_ROOT.as_posix()},
                    "mounted": {"root": MOUNTED_ROOT.as_posix()},
                }
            ],
        },
    )
    _materialize_world(repo_root / CHARACTER_ROOT, salt="character")
    _materialize_world(repo_root / PET_ROOT, salt="pet")
    _materialize_world(repo_root / MOUNTED_ROOT, salt="mounted")
    return catalog_path, manifest_path


def _create_command(repo_root: Path, catalog_path: Path, manifest_path: Path) -> list[str]:
    return [
        sys.executable,
        str(TOOL),
        "create",
        "--repo-root",
        str(repo_root),
        "--catalog",
        str(catalog_path),
        "--character-root",
        CHARACTER_ROOT.as_posix(),
        "--manifest",
        str(manifest_path),
        "--form-id",
        FORM_ID,
        "--reviewer",
        "fixture visual reviewer",
        "--evidence",
        "evidence/fixture-review.mp4",
    ]


def _verify(
    repo_root: Path,
    catalog_path: Path,
    manifest_path: Path,
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [
            sys.executable,
            str(TOOL),
            "verify",
            "--repo-root",
            str(repo_root),
            "--manifest",
            str(manifest_path),
            "--catalog",
            str(catalog_path),
            "--character-root",
            CHARACTER_ROOT.as_posix(),
            "--form-id",
            FORM_ID,
        ],
        check=False,
        capture_output=True,
        text=True,
        timeout=30,
    )


class WorldSemanticApprovalTest(unittest.TestCase):
    def test_create_requires_explicit_visual_review_confirmation(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            catalog_path, manifest_path = _materialize_fixture(root)
            completed = subprocess.run(
                _create_command(root, catalog_path, manifest_path),
                check=False,
                capture_output=True,
                text=True,
                timeout=30,
            )

            self.assertEqual(completed.returncode, 1)
            self.assertIn("--confirm-visual-direction-review", completed.stderr)
            self.assertFalse(manifest_path.exists())

    def test_confirmed_manifest_freezes_character_pet_and_mounted_40_frame_sets(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            catalog_path, manifest_path = _materialize_fixture(root)
            completed = subprocess.run(
                _create_command(root, catalog_path, manifest_path)
                + ["--confirm-visual-direction-review"],
                check=False,
                capture_output=True,
                text=True,
                timeout=30,
            )
            self.assertEqual(completed.returncode, 0, completed.stderr)
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            self.assertEqual(manifest["semanticDirectionReview"], "passed_by_visual_audit")
            self.assertEqual(manifest["ownerReview"], "pending")
            self.assertFalse(manifest["automaticDirectionRecognition"])
            self.assertEqual(manifest["bundleCount"], 3)
            self.assertEqual(manifest["frameCount"], 120)
            self.assertTrue(all(bundle["frameCount"] == 40 for bundle in manifest["bundles"]))

            verified = _verify(root, catalog_path, manifest_path)
            self.assertEqual(verified.returncode, 0, verified.stdout + verified.stderr)
            report = json.loads(verified.stdout)
            self.assertEqual(report["status"], "ok")
            self.assertEqual(report["checkedFrames"], 120)

    def test_modified_reviewed_frame_fails_hash_gate(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            catalog_path, manifest_path = _materialize_fixture(root)
            created = subprocess.run(
                _create_command(root, catalog_path, manifest_path)
                + ["--confirm-visual-direction-review"],
                check=False,
                capture_output=True,
                text=True,
                timeout=30,
            )
            self.assertEqual(created.returncode, 0, created.stderr)
            changed = root / MOUNTED_ROOT / "world/directions/northwest/walk/walk-3.png"
            changed.write_bytes(changed.read_bytes() + b"drift")

            verified = _verify(root, catalog_path, manifest_path)
            self.assertEqual(verified.returncode, 1)
            report = json.loads(verified.stdout)
            self.assertEqual(report["status"], "failed")
            self.assertTrue(any("帧哈希漂移" in error for error in report["errors"]))

    def test_extra_world_png_fails_exact_collection_gate(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            catalog_path, manifest_path = _materialize_fixture(root)
            created = subprocess.run(
                _create_command(root, catalog_path, manifest_path)
                + ["--confirm-visual-direction-review"],
                check=False,
                capture_output=True,
                text=True,
                timeout=30,
            )
            self.assertEqual(created.returncode, 0, created.stderr)
            extra = root / PET_ROOT / "world/directions/north/walk/walk-5.png"
            extra.write_bytes(b"unapproved extra frame\n")

            verified = _verify(root, catalog_path, manifest_path)
            self.assertEqual(verified.returncode, 1)
            report = json.loads(verified.stdout)
            self.assertTrue(any("规范外 world PNG" in error for error in report["errors"]))

    def test_manifest_cannot_claim_automatic_direction_recognition(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            catalog_path, manifest_path = _materialize_fixture(root)
            created = subprocess.run(
                _create_command(root, catalog_path, manifest_path)
                + ["--confirm-visual-direction-review"],
                check=False,
                capture_output=True,
                text=True,
                timeout=30,
            )
            self.assertEqual(created.returncode, 0, created.stderr)
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            manifest["automaticDirectionRecognition"] = True
            _write_json(manifest_path, manifest)

            verified = _verify(root, catalog_path, manifest_path)
            self.assertEqual(verified.returncode, 1)
            report = json.loads(verified.stdout)
            self.assertTrue(any("automaticDirectionRecognition" in error for error in report["errors"]))


if __name__ == "__main__":
    unittest.main()
