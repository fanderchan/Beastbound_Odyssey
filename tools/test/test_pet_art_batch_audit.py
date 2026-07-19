#!/usr/bin/env python3
"""Isolated contract tests for tools/pet_art_batch_audit.py."""

from __future__ import annotations

import copy
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw, ImageOps


REPO_ROOT = Path(__file__).resolve().parents[2]
AUDITOR = REPO_ROOT / "tools" / "pet_art_batch_audit.py"
CATALOG_FIXTURE = Path(__file__).parent / "fixtures" / "pet_art_batch_audit" / "catalog_v1.json"
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
VIEWS = ("front_3quarter_sw", "back_3quarter_ne")


def _read_fixture() -> dict[str, Any]:
    return json.loads(CATALOG_FIXTURE.read_text(encoding="utf-8"))


def _write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _frame(direction_index: int, phase_index: int, bundle_index: int) -> Image.Image:
    """Return a stable-bounds, asymmetric RGBA frame with a unique digest."""

    image = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    base_red = 40 + direction_index * 18
    base_green = 75 + bundle_index * 36
    base_blue = 90 + direction_index * 9
    draw.rounded_rectangle((54, 62, 174, 223), radius=20, fill=(base_red, base_green, base_blue, 255))
    # The left-side ear and direction-coded eye prevent accidental mirror equality.
    draw.polygon(((61, 78), (74, 43), (88, 78)), fill=(210, 145 + direction_index, 55, 255))
    draw.ellipse((80 + direction_index, 91, 92 + direction_index, 103), fill=(15, 22, 31, 255))
    # Motion phase changes only an interior marker, keeping baseline/center/height stable.
    marker_x = 91 + phase_index * 13
    draw.rectangle((marker_x, 171, marker_x + 7, 179), fill=(240, 225 - phase_index * 9, 70, 255))
    return image


def _battle_frame(view_index: int, action_index: int, bundle_index: int) -> Image.Image:
    image = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    red = 45 + (action_index * 13) % 160
    green = 75 + bundle_index * 40
    blue = 55 + view_index * 75
    draw.rounded_rectangle((58, 58, 180, 224), radius=24, fill=(red, green, blue, 255))
    draw.polygon(((67, 79), (79, 43), (94, 82)), fill=(226, 161, 66, 255))
    draw.rectangle((91 + action_index, 170, 101 + action_index, 180), fill=(244, 218, 77, 255))
    return image


def _bundle_metadata(catalog: dict[str, Any], *, mounted: bool) -> dict[str, Any]:
    form = catalog["forms"][0]
    actions = {
        action: {"frameCount": 1, "fps": 8, "loop": action in {"idle", "walk"}}
        for action in catalog["requiredBattleActions"]
    }
    result: dict[str, Any] = {
        "schemaVersion": 1,
        "runtimeFrameSize": [256, 256],
        "views": catalog["battleViews"],
        "actions": actions,
        "worldVisual": {
            "strategy": "ai_generated_integrated_independent_8" if mounted else "independent_8",
            "directions": catalog["canonicalDirections"],
            "runtimeMirroring": False,
            "actions": {
                "idle": {"frameCount": 1, "fps": 4, "loop": True},
                "walk": {"frameCount": 4, "fps": 10, "loop": True},
            },
        },
    }
    if mounted:
        result.update(
            {
                "mountFormId": form["formId"],
                "characterId": catalog["defaultCharacterId"],
            }
        )
        result["worldVisual"].update(
            {
                "runtimeLayeredComposition": False,
                "runtimeBodyLayerCount": 1,
            }
        )
    else:
        result["formId"] = form["formId"]
    return result


def _materialize_bundle(repo_root: Path, catalog: dict[str, Any], kind: str, bundle_index: int) -> None:
    bundle = catalog["forms"][0][kind]
    root = repo_root / bundle["root"]
    _write_json(repo_root / bundle["metadataPath"], _bundle_metadata(catalog, mounted=kind == "mounted"))
    for field in ("identityPath", "ownershipPath", "promptPath"):
        path = repo_root / bundle[field]
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(f"fixture {kind} {field}\n", encoding="utf-8")

    for direction_index, direction in enumerate(DIRECTIONS):
        idle = root / "world" / "directions" / direction / "idle" / "idle-1.png"
        idle.parent.mkdir(parents=True, exist_ok=True)
        _frame(direction_index, 0, bundle_index).save(idle)
        for phase in range(1, 5):
            walk = root / "world" / "directions" / direction / "walk" / f"walk-{phase}.png"
            walk.parent.mkdir(parents=True, exist_ok=True)
            _frame(direction_index, phase, bundle_index).save(walk)

    for view_index, view in enumerate(VIEWS):
        for action_index, action in enumerate(catalog["requiredBattleActions"]):
            frame = root / "views" / view / action / f"{action}-1.png"
            frame.parent.mkdir(parents=True, exist_ok=True)
            _battle_frame(view_index, action_index, bundle_index).save(frame)


def _materialize_all(repo_root: Path, catalog: dict[str, Any]) -> None:
    _materialize_bundle(repo_root, catalog, "pet", 0)
    _materialize_bundle(repo_root, catalog, "mounted", 1)


def _run(repo_root: Path, catalog: dict[str, Any]) -> tuple[subprocess.CompletedProcess[str], dict[str, Any]]:
    catalog_path = repo_root / "pet_art_catalog.json"
    report_path = repo_root / "report.json"
    markdown_path = repo_root / "report.md"
    _write_json(catalog_path, catalog)
    completed = subprocess.run(
        [
            sys.executable,
            str(AUDITOR),
            "--repo-root",
            str(repo_root),
            "--catalog",
            str(catalog_path),
            "--json-out",
            str(report_path),
            "--markdown-out",
            str(markdown_path),
        ],
        check=False,
        capture_output=True,
        text=True,
        timeout=30,
    )
    report = json.loads(report_path.read_text(encoding="utf-8"))
    return completed, report


def _issue_codes(report: dict[str, Any], key: str = "errors") -> list[str]:
    codes = [entry["code"] for entry in report.get("catalogErrors", [])] if key == "errors" else []
    for form in report.get("forms", []):
        codes.extend(entry["code"] for entry in form.get(key, []))
    return codes


class PetArtBatchAuditTest(unittest.TestCase):
    def test_complete_fixture_passes(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            catalog = _read_fixture()
            _materialize_all(root, catalog)
            completed, report = _run(root, catalog)

            self.assertEqual(completed.returncode, 0, completed.stderr)
            self.assertEqual(report["status"], "ok")
            self.assertEqual(report["summary"]["errors"], 0)
            self.assertEqual(report["forms"][0]["pet"]["expectedPngCount"], 64)
            self.assertEqual(report["forms"][0]["mounted"]["validatedPngCount"], 64)
            self.assertTrue((root / "report.md").is_file())

    def test_horizontal_mirror_fake_direction_blocks_runtime(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            catalog = _read_fixture()
            _materialize_all(root, catalog)
            pet_root = root / catalog["forms"][0]["pet"]["root"]
            east = pet_root / "world" / "directions" / "east" / "idle" / "idle-1.png"
            west = pet_root / "world" / "directions" / "west" / "idle" / "idle-1.png"
            with Image.open(east) as image:
                ImageOps.mirror(image.convert("RGBA")).save(west)

            completed, report = _run(root, catalog)
            self.assertEqual(completed.returncode, 1)
            self.assertIn("mirrored_world_direction", _issue_codes(report))

    def test_missing_runtime_frame_blocks(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            catalog = _read_fixture()
            _materialize_all(root, catalog)
            missing = (
                root
                / catalog["forms"][0]["pet"]["root"]
                / "world"
                / "directions"
                / "south"
                / "walk"
                / "walk-4.png"
            )
            missing.unlink()

            completed, report = _run(root, catalog)
            self.assertEqual(completed.returncode, 1)
            self.assertIn("missing_png", _issue_codes(report))

    def test_deep_magenta_transparent_edge_contamination_blocks(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            catalog = _read_fixture()
            _materialize_all(root, catalog)
            pet_root = root / catalog["forms"][0]["pet"]["root"]
            frame_path = pet_root / "views/front_3quarter_sw/idle/idle-1.png"
            with Image.open(frame_path) as opened:
                frame = opened.convert("RGBA")
            draw = ImageDraw.Draw(frame)
            draw.rounded_rectangle(
                (58, 58, 180, 224),
                radius=24,
                outline=(112, 4, 136, 220),
                width=2,
            )
            frame.save(frame_path)

            completed, report = _run(root, catalog)
            self.assertEqual(completed.returncode, 1)
            self.assertIn("magenta_edge_contamination", _issue_codes(report))

    def test_legitimate_solid_purple_subject_does_not_trigger_edge_spill_gate(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            catalog = _read_fixture()
            _materialize_all(root, catalog)
            pet_root = root / catalog["forms"][0]["pet"]["root"]
            frame_path = pet_root / "views/front_3quarter_sw/idle/idle-1.png"
            image = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
            ImageDraw.Draw(image).rounded_rectangle(
                (58, 58, 180, 224),
                radius=24,
                fill=(105, 34, 148, 255),
            )
            image.save(frame_path)

            completed, report = _run(root, catalog)
            self.assertEqual(completed.returncode, 0, completed.stderr)
            self.assertNotIn("magenta_edge_contamination", _issue_codes(report))

    def test_planned_missing_assets_are_pending_and_nonblocking(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            catalog = copy.deepcopy(_read_fixture())
            form = catalog["forms"][0]
            form["status"] = "planned"
            form["runtimeEnabled"] = False

            completed, report = _run(root, catalog)
            self.assertEqual(completed.returncode, 0, completed.stderr)
            self.assertEqual(report["status"], "pending")
            self.assertEqual(report["summary"]["errors"], 0)
            self.assertGreater(report["summary"]["pendingIssues"], 0)
            self.assertIn("missing_bundle_root", _issue_codes(report, "pending"))

    def test_runtime_missing_assets_block(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            catalog = _read_fixture()

            completed, report = _run(root, catalog)
            self.assertEqual(completed.returncode, 1)
            self.assertEqual(report["status"], "failed")
            self.assertIn("missing_bundle_root", _issue_codes(report))


if __name__ == "__main__":
    unittest.main()
