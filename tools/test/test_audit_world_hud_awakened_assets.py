#!/usr/bin/env python3

from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
TOOL_PATH = REPO_ROOT / "tools/audit_world_hud_awakened_assets.py"
SPEC = importlib.util.spec_from_file_location("audit_world_hud_awakened_assets", TOOL_PATH)
assert SPEC is not None and SPEC.loader is not None
TOOL = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = TOOL
SPEC.loader.exec_module(TOOL)


class WorldHudAwakenedAssetAuditTest(unittest.TestCase):
    def test_repository_bundle_is_complete_and_byte_exact(self) -> None:
        report = TOOL.audit_bundle()

        self.assertEqual(report["status"], "passed")
        self.assertEqual(report["contract"]["iconCount"], 33)
        self.assertEqual(report["contract"]["sourceCount"], 33)
        self.assertEqual(report["contract"]["runtimeCount"], 33)
        self.assertEqual(report["contract"]["manifestAssetCount"], 66)
        self.assertEqual(report["contract"]["topIconCount"], 7)
        self.assertEqual(report["contract"]["eventIconCount"], 12)
        self.assertEqual(report["contract"]["trackedForbiddenSidecarCount"], 0)
        self.assertEqual(report["runtimeReferences"]["activeIconCount"], 30)
        self.assertEqual(
            report["runtimeReferences"]["reservedIconIds"],
            ["event_equipment", "event_mailbox", "event_market"],
        )
        self.assertEqual(len(report["files"]), 33)
        self.assertTrue(all("source" in pair and "runtime" in pair for pair in report["files"]))

    def test_tampered_manifest_hash_fails_closed(self) -> None:
        manifest = json.loads(TOOL.DEFAULT_PACKAGE_ROOT.joinpath("asset-manifest.json").read_text(encoding="utf-8"))
        manifest["assets"][0]["sha256"] = "0" * 64

        with tempfile.TemporaryDirectory(prefix="beastbound-world-hud-audit-") as temp_dir:
            manifest_path = Path(temp_dir) / "asset-manifest.json"
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
            with self.assertRaisesRegex(TOOL.AuditFailure, "sha256 mismatch"):
                TOOL.audit_bundle(manifest_path=manifest_path)

    def test_missing_pair_record_fails_closed(self) -> None:
        manifest = json.loads(TOOL.DEFAULT_PACKAGE_ROOT.joinpath("asset-manifest.json").read_text(encoding="utf-8"))
        manifest["assets"] = [
            record
            for record in manifest["assets"]
            if record.get("assetId") != "event_market_runtime"
        ]

        with tempfile.TemporaryDirectory(prefix="beastbound-world-hud-audit-") as temp_dir:
            manifest_path = Path(temp_dir) / "asset-manifest.json"
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
            with self.assertRaisesRegex(TOOL.AuditFailure, "manifest asset coverage mismatch"):
                TOOL.audit_bundle(manifest_path=manifest_path)

    def test_undeclared_runtime_literal_fails_closed(self) -> None:
        skin = TOOL.DEFAULT_SKIN_PATH.read_text(encoding="utf-8")
        skin += '\nconst QA_UNDECLARED := ICON_ROOT + "/not_in_manifest.png"\n'

        with tempfile.TemporaryDirectory(prefix="beastbound-world-hud-audit-") as temp_dir:
            skin_path = Path(temp_dir) / "world_hud_awakened_visual_skin.gd"
            skin_path.write_text(skin, encoding="utf-8")
            with self.assertRaisesRegex(TOOL.AuditFailure, "references undeclared icons"):
                TOOL.audit_bundle(skin_path=skin_path)


if __name__ == "__main__":
    unittest.main()
