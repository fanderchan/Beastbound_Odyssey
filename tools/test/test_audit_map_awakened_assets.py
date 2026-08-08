#!/usr/bin/env python3

from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
TOOL_PATH = REPO_ROOT / "tools/audit_map_awakened_assets.py"
SPEC = importlib.util.spec_from_file_location("audit_map_awakened_assets", TOOL_PATH)
assert SPEC is not None and SPEC.loader is not None
TOOL = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = TOOL
SPEC.loader.exec_module(TOOL)


class MapAwakenedAssetAuditTest(unittest.TestCase):
    def _write_json(self, payload: object, name: str) -> Path:
        temp_dir = tempfile.TemporaryDirectory(prefix="beastbound-map-audit-")
        self.addCleanup(temp_dir.cleanup)
        path = Path(temp_dir.name) / name
        path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
        return path

    def test_repository_bundle_is_complete_byte_exact_and_frozen(self) -> None:
        report = TOOL.audit_repository_bundle()

        self.assertEqual(report["status"], "passed")
        self.assertEqual(report["contract"]["assetCount"], 1)
        self.assertEqual(report["contract"]["hotspotCount"], 9)
        self.assertEqual(report["contract"]["authorityNonGmRegionCount"], 9)
        self.assertEqual(report["contract"]["trackedForbiddenSidecarCount"], 0)
        self.assertEqual(report["asset"]["bytes"], 2_777_702)
        self.assertEqual((report["asset"]["width"], report["asset"]["height"]), (1568, 1003))
        self.assertEqual(report["asset"]["pixelFormat"], "RGB8")
        self.assertFalse(report["asset"]["hasAlpha"])
        self.assertTrue(report["hotspots"]["exactMatch"])
        self.assertEqual(
            set(report["hotspots"]["authorityRegionIds"]),
            set(report["hotspots"]["manifestHotspotIds"]),
        )
        self.assertEqual(report["visualAcceptance"]["status"], "owner_review_pending")
        self.assertFalse(report["visualAcceptance"]["screenshotAccepted"])

    def test_tampered_asset_hash_fails_closed(self) -> None:
        manifest = json.loads(TOOL.DEFAULT_MANIFEST_PATH.read_text(encoding="utf-8"))
        manifest["assets"][0]["sha256"] = "0" * 64
        manifest_path = self._write_json(manifest, "asset-manifest.json")

        with self.assertRaisesRegex(TOOL.AuditFailure, "asset sha256 mismatch"):
            TOOL.audit_bundle(manifest_path=manifest_path)

    def test_owner_acceptance_cannot_be_self_declared(self) -> None:
        manifest = json.loads(TOOL.DEFAULT_MANIFEST_PATH.read_text(encoding="utf-8"))
        manifest["ownerReviewStatus"] = "owner_review_accepted"
        manifest["assets"][0]["ownerReviewStatus"] = "owner_review_accepted"
        manifest_path = self._write_json(manifest, "asset-manifest.json")

        with self.assertRaisesRegex(TOOL.AuditFailure, "must remain owner_review_pending"):
            TOOL.audit_bundle(manifest_path=manifest_path)

    def test_hotspots_must_exactly_match_authority_non_gm_regions(self) -> None:
        manifest = json.loads(TOOL.DEFAULT_MANIFEST_PATH.read_text(encoding="utf-8"))
        manifest["normalizedHotspots"].pop("windglass_highlands")
        manifest["normalizedHotspots"]["gm_training_ground"] = [0.5, 0.5]
        manifest_path = self._write_json(manifest, "asset-manifest.json")

        with self.assertRaisesRegex(TOOL.AuditFailure, "must exactly match non-GM authority region IDs"):
            TOOL.audit_bundle(manifest_path=manifest_path)

    def test_authority_catalog_change_fails_closed(self) -> None:
        catalog = json.loads(TOOL.DEFAULT_REGION_CATALOG_PATH.read_text(encoding="utf-8"))
        catalog["regions"] = [
            region for region in catalog["regions"] if region.get("id") != "manor_ring"
        ]
        catalog_path = self._write_json(catalog, "map_regions.json")

        with self.assertRaisesRegex(TOOL.AuditFailure, "exactly 9 non-GM regions"):
            TOOL.audit_bundle(region_catalog_path=catalog_path)

    def test_missing_prompt_fails_closed(self) -> None:
        temp_dir = tempfile.TemporaryDirectory(prefix="beastbound-map-audit-")
        self.addCleanup(temp_dir.cleanup)
        missing_prompt = Path(temp_dir.name) / "missing-prompt.txt"

        with self.assertRaisesRegex(TOOL.AuditFailure, "missing required audit input"):
            TOOL.audit_bundle(prompt_path=missing_prompt)


if __name__ == "__main__":
    unittest.main()
