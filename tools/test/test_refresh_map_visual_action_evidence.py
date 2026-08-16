from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


TOOL_PATH = Path(__file__).resolve().parents[1] / "refresh_map_visual_action_evidence.py"
SPEC = importlib.util.spec_from_file_location(
    "refresh_map_visual_action_evidence",
    TOOL_PATH,
)
assert SPEC is not None and SPEC.loader is not None
TOOL = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(TOOL)


class RefreshMapVisualActionEvidenceTest(unittest.TestCase):
    def test_safe_bundle_path_rejects_escape(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            with self.assertRaises(TOOL.ActionEvidenceError):
                TOOL._safe_bundle_path(root, "../outside", label="test")

    def test_raw_evidence_requires_two_distinct_hashed_jpegs(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            raw = root / "evidence" / "computer-use-actions" / "raw"
            raw.mkdir(parents=True)
            before = raw / "before.jpeg"
            after = raw / "after.jpeg"
            before.write_bytes(b"before")
            after.write_bytes(b"after")
            action = {
                "evidence": [
                    TOOL._file_ref(root, before),
                    TOOL._file_ref(root, after),
                ]
            }
            refs = TOOL._raw_evidence_refs(root, action, action_id="map_pointer")
            self.assertEqual(len(refs), 2)
            action["evidence"][1]["sha256"] = action["evidence"][0]["sha256"]
            with self.assertRaises(TOOL.ActionEvidenceError):
                TOOL._raw_evidence_refs(root, action, action_id="map_pointer")

    def test_validate_capture_pair_rejects_reused_wrong_variant(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            runtime = root / "evidence" / "runtime-actions" / "map_one"
            runtime.mkdir(parents=True)
            image = runtime / "pointer.png"
            header = (
                b"\x89PNG\r\n\x1a\n"
                + b"\x00\x00\x00\rIHDR"
                + (1280).to_bytes(4, "big")
                + (720).to_bytes(4, "big")
            )
            image.write_bytes(header + b"distinct")
            digest = TOOL._sha256(image)
            report = {
                "schemaVersion": 1,
                "reportType": "beastbound_map_visual_main_review_capture",
                "result": "PASS",
                "ok": True,
                "bundleId": "bundle_one",
                "mapId": "map_one",
                "mode": "idle",
                "captureVariant": "movement_path",
                "scene": TOOL.SCENE,
                "viewport": [1280, 720],
                "mapArtStatus": "owner_review_pending",
                "mapArtQaPreview": True,
                "defaultProfileIsolation": True,
                "normalPlayerHud": True,
                "accountAuthenticated": False,
                "profileSaveEnabled": False,
                "serverAccountSession": False,
                "networkRequestAttempted": False,
                "networkRequestsDisconnected": True,
                "errors": [],
                "playerCellChanged": False,
                "screenshotSha256": digest,
                "screenshotPath": "evidence/runtime-actions/map_one/pointer.png",
                "screenshot": {
                    "path": "evidence/runtime-actions/map_one/pointer.png",
                    "sha256": digest,
                },
            }
            (runtime / "pointer-capture.json").write_text(
                json.dumps(report),
                encoding="utf-8",
            )
            with self.assertRaises(TOOL.ActionEvidenceError):
                TOOL._validate_capture_pair(
                    root,
                    bundle_id="bundle_one",
                    map_id="map_one",
                    action_kind="pointer",
                )


if __name__ == "__main__":
    unittest.main()
