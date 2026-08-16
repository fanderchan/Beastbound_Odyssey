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

    def test_same_map_action_screenshots_must_not_share_pixel_hash(self) -> None:
        digest = "a" * 64
        screenshots = [
            {"mapId": "solo_map", "image": {"sha256": digest}},
            {"mapId": "solo_map", "image": {"sha256": digest}},
            {"mapId": "second_map", "image": {"sha256": digest}},
        ]
        self.assertEqual(
            {("solo_map", digest)},
            AUDITOR.duplicate_runtime_screenshot_hashes(screenshots),
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


class GroundVisualContractTests(unittest.TestCase):
    def _audit(self, root: Path) -> AUDITOR.Audit:
        return AUDITOR.Audit(root / AUDITOR.MANIFEST_NAME, root)

    def test_legacy_ground_remains_valid_and_edge_falls_back_to_default(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            audit = self._audit(root)
            AUDITOR.validate_ground_visual_contract(
                audit,
                {"defaultTileId": "grass"},
                {"grass"},
                "ground",
            )
        self.assertEqual([], audit.errors)

    def test_valid_deterministic_visual_variants_pass(self) -> None:
        tiles = {"grass", "grass_b", "path", "path_b", "edge", "edge_b"}
        ground = {
            "defaultTileId": "grass",
            "edgeTileId": "edge",
            "edgePaddingCells": 8,
            "variantSeed": -2147483648,
            "variantClusterSize": 3,
            "tileVariants": {
                "grass": ["grass", "grass_b"],
                "path": ["path", "path_b"],
                "edge": ["edge", "edge_b"],
            },
        }
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            audit = self._audit(root)
            AUDITOR.validate_ground_visual_contract(audit, ground, tiles, "ground")
        self.assertEqual([], audit.errors)

    def test_invalid_optional_ground_fields_fail_closed(self) -> None:
        tiles = {"grass", "grass_b", "path", "path_b", "shared"}
        fixtures = {
            "unknown edge": {
                "defaultTileId": "grass",
                "edgeTileId": "missing",
            },
            "boolean seed": {
                "defaultTileId": "grass",
                "variantSeed": True,
            },
            "oversized seed": {
                "defaultTileId": "grass",
                "variantSeed": 2**31,
            },
            "cluster below range": {
                "defaultTileId": "grass",
                "variantClusterSize": 0,
            },
            "cluster above range": {
                "defaultTileId": "grass",
                "variantClusterSize": 9,
            },
            "unknown candidate": {
                "defaultTileId": "grass",
                "tileVariants": {"grass": ["grass", "missing"]},
            },
            "base omitted": {
                "defaultTileId": "grass",
                "tileVariants": {"grass": ["grass_b"]},
            },
            "duplicate candidate": {
                "defaultTileId": "grass",
                "tileVariants": {"grass": ["grass", "grass"]},
            },
            "crossed semantic base": {
                "defaultTileId": "grass",
                "tileVariants": {
                    "grass": ["grass", "path"],
                    "path": ["path", "path_b"],
                },
            },
            "candidate shared by pools": {
                "defaultTileId": "grass",
                "tileVariants": {
                    "grass": ["grass", "shared"],
                    "path": ["path", "shared"],
                },
            },
        }
        for label, ground in fixtures.items():
            with self.subTest(label=label), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                audit = self._audit(root)
                AUDITOR.validate_ground_visual_contract(audit, ground, tiles, "ground")
                self.assertNotEqual([], audit.errors)


class ObjectPlacementAnchorContractTests(unittest.TestCase):
    def _validate(
        self,
        cell: list[int],
        role: str,
        *,
        grid_size: list[int] | None = None,
        padding: int = 0,
    ) -> AUDITOR.Audit:
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        root = Path(temporary.name)
        audit = AUDITOR.Audit(root / AUDITOR.MANIFEST_NAME, root)
        AUDITOR.validate_object_anchor_cell(
            audit,
            cell,
            "placement.grid",
            grid_size,
            role,
            padding,
        )
        return audit

    def _validate_binding(
        self,
        role: str,
        cell: list[int],
        footprint: list[list[int]],
    ) -> AUDITOR.Audit:
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        root = Path(temporary.name)
        (root / "bindings").mkdir()
        binding = {
            "schemaVersion": 1,
            "bundleId": "test_bundle",
            "mapId": "test_map",
            "mapGridSize": [10, 8],
            "ground": {
                "defaultTileId": "grass",
                "edgePaddingCells": 2,
                "overrides": [],
            },
            "objectPlacements": [
                {
                    "instanceId": "tree_01",
                    "objectId": "tree",
                    "grid": cell,
                    "offset": [0, 0],
                    "mirrored": False,
                    "interactionLink": "test_link" if role == "interaction" else None,
                    "collisionFootprint": footprint,
                }
            ],
        }
        binding_path = root / "bindings" / "test_map.json"
        binding_path.write_text(
            json.dumps(binding, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        audit = AUDITOR.Audit(root / AUDITOR.MANIFEST_NAME, root)
        AUDITOR.validate_bindings(
            audit,
            [
                {
                    "mapId": "test_map",
                    "binding": {
                        "path": "bindings/test_map.json",
                        "sha256": hashlib.sha256(binding_path.read_bytes()).hexdigest(),
                    },
                }
            ],
            "test_bundle",
            {"test_map"},
            {"grass"},
            {"tree"},
            {"tree": role},
        )
        return audit

    def test_legacy_in_grid_anchor_remains_valid(self) -> None:
        self.assertEqual([], self._validate([3, 4], "blocking").errors)
        self.assertEqual(
            [],
            self._validate([9, 7], "interaction", grid_size=[10, 8]).errors,
        )

    def test_visual_only_roles_may_anchor_on_edge_skirt(self) -> None:
        for role in ("none", "decorative"):
            for cell in ([-2, 0], [0, -2], [11, 7], [9, 9], [-2, -2], [11, 9]):
                with self.subTest(role=role, cell=cell):
                    self.assertEqual(
                        [],
                        self._validate(
                            cell,
                            role,
                            grid_size=[10, 8],
                            padding=2,
                        ).errors,
                    )

        self.assertEqual(
            [],
            self._validate_binding("decorative", [-2, 9], []).errors,
        )

    def test_visual_only_anchor_outside_skirt_fails_closed(self) -> None:
        for cell in ([-3, 0], [0, -3], [12, 7], [9, 10]):
            with self.subTest(cell=cell):
                self.assertNotEqual(
                    [],
                    self._validate(
                        cell,
                        "decorative",
                        grid_size=[10, 8],
                        padding=2,
                    ).errors,
                )
        self.assertNotEqual(
            [],
            self._validate(
                [-1, 0],
                "none",
                grid_size=[10, 8],
                padding=0,
            ).errors,
        )
        self.assertNotEqual([], self._validate([-1, 0], "none").errors)

    def test_physical_roles_and_footprints_stay_inside_authoritative_grid(self) -> None:
        for role in ("blocking", "interaction"):
            with self.subTest(role=role):
                self.assertNotEqual(
                    [],
                    self._validate(
                        [-1, 0],
                        role,
                        grid_size=[10, 8],
                        padding=2,
                    ).errors,
                )
        for footprint in ([-1, 0], [10, 0], [0, 8]):
            with self.subTest(footprint=footprint), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                audit = AUDITOR.Audit(root / AUDITOR.MANIFEST_NAME, root)
                AUDITOR.validate_grid_cell(
                    audit,
                    footprint,
                    "placement.collisionFootprint[0]",
                    [10, 8],
                )
                self.assertNotEqual([], audit.errors)
        self.assertNotEqual(
            [],
            self._validate_binding("blocking", [-1, 0], [[0, 0]]).errors,
        )
        self.assertNotEqual(
            [],
            self._validate_binding("interaction", [10, 0], []).errors,
        )


class ReviewCatalogContractTests(unittest.TestCase):
    def _write_candidate(self, root: Path) -> tuple[dict, Path, Path, Path]:
        (root / "data").mkdir(parents=True)
        bundle_root = root / "assets" / "maps" / "candidate"
        (bundle_root / "bindings").mkdir(parents=True)
        manifest = sample_manifest()
        manifest_path = bundle_root / AUDITOR.MANIFEST_NAME
        binding_path = bundle_root / "bindings" / "solo_map.json"
        binding_path.write_text('{"mapId":"solo_map"}\n', encoding="utf-8")
        manifest_path.write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        catalog_path = root / "data" / "map_visual_review_catalog.json"
        catalog_path.write_text(
            json.dumps(
                {
                    "schemaVersion": 1,
                    "entries": [
                        {
                            "mapId": "solo_map",
                            "bundleManifest": (
                                "res://assets/maps/candidate/map-visual-bundle.json"
                            ),
                            "bindingPath": (
                                "res://assets/maps/candidate/bindings/solo_map.json"
                            ),
                        }
                    ],
                },
                ensure_ascii=False,
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
        (root / "project.godot").write_text("[application]\n", encoding="utf-8")
        return manifest, manifest_path, binding_path, catalog_path

    def test_pending_candidate_paths_and_lifecycle_pass(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            manifest, manifest_path, binding_path, catalog_path = self._write_candidate(root)
            audit = AUDITOR.Audit(manifest_path, manifest_path.parent)
            AUDITOR.validate_live_catalog_registration(
                audit,
                catalog_path,
                root,
                manifest,
                {"solo_map"},
                {"solo_map": hashlib.sha256(binding_path.read_bytes()).hexdigest()},
            )
        self.assertEqual([], audit.errors)

    def test_review_catalog_rejects_non_pending_lifecycle(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            manifest, manifest_path, binding_path, catalog_path = self._write_candidate(root)
            manifest.update(
                {
                    "status": "released",
                    "ownerReviewStatus": "approved",
                    "releaseApproved": True,
                    "runtimeEnabled": True,
                }
            )
            manifest_path.write_text(
                json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
            audit = AUDITOR.Audit(manifest_path, manifest_path.parent)
            AUDITOR.validate_live_catalog_registration(
                audit,
                catalog_path,
                root,
                manifest,
                {"solo_map"},
                {"solo_map": hashlib.sha256(binding_path.read_bytes()).hexdigest()},
            )
        self.assertTrue(any("reviewCatalog.lifecycle" in error for error in audit.errors))

    def test_pending_candidate_cannot_be_release_ready(self) -> None:
        manifest = sample_manifest()
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            audit = AUDITOR.Audit(root / AUDITOR.MANIFEST_NAME, root)
            AUDITOR.evaluate_release_readiness(audit, manifest, {"solo_map"})
        self.assertFalse(audit.release_ready)
        self.assertIn("lifecycle_released_and_enabled", audit.missing_release_gates)
        self.assertIn("release_attestation", audit.missing_release_gates)


if __name__ == "__main__":
    unittest.main()
