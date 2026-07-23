from __future__ import annotations

import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest


SCRIPT_PATH = Path(__file__).resolve().parents[1] / "scripts" / "audit_map_bundle.py"
SPEC = importlib.util.spec_from_file_location("audit_map_bundle", SCRIPT_PATH)
assert SPEC is not None and SPEC.loader is not None
AUDITOR = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = AUDITOR
SPEC.loader.exec_module(AUDITOR)


def sample_manifest() -> dict:
    return {
        "schemaVersion": 1,
        "bundleId": "solo_map_visual_v1",
        "mapStyleId": "solo_style_v1",
        "mapIds": ["solo_map"],
        "status": "owner_review_pending",
        "ownerReviewStatus": "pending",
        "releaseApproved": False,
        "runtimeEnabled": False,
        "tileSize": [80, 40],
        "catalogContractCheck": {
            "path": "evidence/catalog.json",
            "sha256": "1" * 64,
        },
        "source": {
            "origin": "AI-generated original",
            "owner": "Beastbound Odyssey project",
            "licenseBasis": "project-owned generated output",
        },
        "groundAtlas": {
            "path": "runtime/ground/atlas.png",
            "sha256": "2" * 64,
            "dimensions": [80, 40],
            "alphaMode": "mixed",
        },
        "tiles": [
            {"tileId": "grass", "rect": [0, 0, 80, 40], "role": "ground"}
        ],
        "objects": [],
        "mapBindings": [
            {
                "mapId": "solo_map",
                "binding": {
                    "path": "bindings/solo_map.json",
                    "sha256": "3" * 64,
                },
            }
        ],
        "evidence": {
            "dressedReference": {
                "path": "evidence/dressed.png",
                "sha256": "4" * 64,
            },
            "runtimeScreenshots": [],
            "ownerAcceptance": None,
        },
    }


def release_attestation(manifest: dict) -> dict:
    summaries = AUDITOR.release_summary_hashes(manifest)
    return {
        "schemaVersion": 1,
        "attestationType": AUDITOR.RELEASE_ATTESTATION_TYPE,
        "status": AUDITOR.RELEASE_ATTESTATION_STATUS,
        "bundleId": manifest["bundleId"],
        "mapStyleId": manifest["mapStyleId"],
        "mapIds": manifest["mapIds"],
        "manifest": {
            "path": AUDITOR.MANIFEST_NAME,
            "summarySha256": summaries["manifestSha256"],
        },
        "lifecycle": {
            "status": "released",
            "ownerReviewStatus": "approved",
            "releaseApproved": True,
            "runtimeEnabled": True,
        },
        "offlineAudit": {
            "status": "PASS",
            "releaseReady": True,
            "missingReleaseGates": [],
        },
        "summaries": {
            "evidenceSha256": summaries["evidenceSha256"],
            "assetSha256": summaries["assetSha256"],
            "bundleSha256": summaries["bundleSha256"],
        },
    }


class RuntimeScreenshotCoverageTests(unittest.TestCase):
    def test_three_unique_pairs_on_one_map_do_not_collapse_by_mode(self) -> None:
        coverage = {("solo_map", "idle"), ("solo_map", "moving")}
        self.assertTrue(
            AUDITOR.runtime_screenshot_coverage_complete(
                3,
                coverage,
                {"solo_map"},
            )
        )
        self.assertFalse(
            AUDITOR.runtime_screenshot_coverage_complete(
                2,
                coverage,
                {"solo_map"},
            )
        )

    def test_coverage_still_requires_every_map_and_idle_moving(self) -> None:
        self.assertFalse(
            AUDITOR.runtime_screenshot_coverage_complete(
                5,
                {("solo_map", "moving")},
                {"solo_map"},
            )
        )
        self.assertFalse(
            AUDITOR.runtime_screenshot_coverage_complete(
                5,
                {("solo_map", "idle"), ("solo_map", "moving")},
                {"solo_map", "second_map"},
            )
        )


class ReleaseAttestationTests(unittest.TestCase):
    def _write_attestation(
        self,
        root: Path,
        manifest: dict,
        attestation: dict,
    ) -> None:
        payload = (
            json.dumps(attestation, ensure_ascii=False, indent=2, sort_keys=True)
            + "\n"
        ).encode("utf-8")
        path = root / AUDITOR.RELEASE_ATTESTATION_NAME
        path.write_bytes(payload)
        manifest["releaseAttestation"] = {
            "path": AUDITOR.RELEASE_ATTESTATION_NAME,
            "sha256": hashlib.sha256(payload).hexdigest(),
        }

    def test_valid_non_circular_attestation_passes_and_owner_subject_binds_it(
        self,
    ) -> None:
        manifest = sample_manifest()
        summaries_before = AUDITOR.release_summary_hashes(manifest)
        owner_subject_before = AUDITOR.manifest_review_subject_sha256(manifest)
        attestation = release_attestation(manifest)
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            self._write_attestation(root, manifest, attestation)
            audit = AUDITOR.Audit(
                manifest_path=root / AUDITOR.MANIFEST_NAME,
                root=root,
            )
            key = AUDITOR.validate_release_attestation(
                audit,
                manifest,
                required=True,
            )
        self.assertEqual([], audit.errors)
        self.assertTrue(audit.release_attestation_valid)
        self.assertIsNotNone(key)
        self.assertEqual(
            summaries_before,
            AUDITOR.release_summary_hashes(manifest),
            "releaseAttestation must be excluded from its own summary",
        )
        self.assertNotEqual(
            owner_subject_before,
            AUDITOR.manifest_review_subject_sha256(manifest),
            "owner review subject must bind the attestation reference",
        )

    def test_attestation_summary_drift_fails(self) -> None:
        manifest = sample_manifest()
        attestation = release_attestation(manifest)
        attestation["summaries"]["assetSha256"] = "f" * 64
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            self._write_attestation(root, manifest, attestation)
            audit = AUDITOR.Audit(
                manifest_path=root / AUDITOR.MANIFEST_NAME,
                root=root,
            )
            AUDITOR.validate_release_attestation(
                audit,
                manifest,
                required=True,
            )
        self.assertFalse(audit.release_attestation_valid)
        self.assertTrue(
            any("assetSha256" in error for error in audit.errors),
            audit.errors,
        )

    def test_boolean_and_integer_type_confusion_fails_closed(self) -> None:
        mutations = {
            "boolean schemaVersion": lambda value: value.__setitem__(
                "schemaVersion",
                True,
            ),
            "integer releaseApproved": lambda value: value["lifecycle"].__setitem__(
                "releaseApproved",
                1,
            ),
            "integer runtimeEnabled": lambda value: value["lifecycle"].__setitem__(
                "runtimeEnabled",
                1,
            ),
            "integer releaseReady": lambda value: value["offlineAudit"].__setitem__(
                "releaseReady",
                1,
            ),
        }
        for label, mutate in mutations.items():
            with self.subTest(label=label):
                manifest = sample_manifest()
                attestation = release_attestation(manifest)
                mutate(attestation)
                with tempfile.TemporaryDirectory() as temporary:
                    root = Path(temporary)
                    self._write_attestation(root, manifest, attestation)
                    audit = AUDITOR.Audit(
                        manifest_path=root / AUDITOR.MANIFEST_NAME,
                        root=root,
                    )
                    AUDITOR.validate_release_attestation(
                        audit,
                        manifest,
                        required=True,
                    )
                self.assertFalse(audit.release_attestation_valid)
                self.assertNotEqual([], audit.errors)


if __name__ == "__main__":
    unittest.main()
