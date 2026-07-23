from __future__ import annotations

import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest import mock


TOOLS_DIR = Path(__file__).resolve().parents[1]
if str(TOOLS_DIR) not in sys.path:
    sys.path.insert(0, str(TOOLS_DIR))

import promote_map_visual_release as promotion  # noqa: E402
import run_map_visual_preexport_gate as preexport  # noqa: E402


class MapVisualPromotionTest(unittest.TestCase):
    def _fixture(self, root: Path) -> Path:
        godot_root = root / "client/godot"
        godot_root.mkdir(parents=True)
        (godot_root / "project.godot").write_text(
            "[application]\nconfig/name=\"fixture\"\n", encoding="utf-8"
        )
        (godot_root / "data").mkdir()
        (godot_root / "data/map_visual_catalog.json").write_text(
            json.dumps(
                {
                    "entries": [
                        {
                            "mapId": "fixture_map",
                            "bundleManifest": (
                                "res://assets/maps/fixture_map_visual_v1/"
                                "map-visual-bundle.json"
                            ),
                            "bindingPath": (
                                "res://assets/maps/fixture_map_visual_v1/"
                                "bindings/fixture_map.json"
                            ),
                        }
                    ]
                }
            )
            + "\n",
            encoding="utf-8",
        )
        (godot_root / "data/fixture_map.json").write_text(
            '{"mapId":"fixture_map"}\n', encoding="utf-8"
        )
        (godot_root / "scripts/world").mkdir(parents=True)
        (godot_root / "scripts/world/map_data_catalog.gd").write_text(
            'const MAP_PATHS := {"fixture_map": '
            '"res://data/fixture_map.json"}\n',
            encoding="utf-8",
        )
        bundle = (
            godot_root
            / "assets/maps/fixture_map_visual_v1"
        )
        (bundle / "evidence").mkdir(parents=True)
        (bundle / "bindings").mkdir()
        (bundle / "bindings/fixture_map.json").write_text(
            '{"mapId":"fixture_map"}\n', encoding="utf-8"
        )
        (bundle / "evidence/frozen.txt").write_text(
            "real frozen evidence\n", encoding="utf-8"
        )
        manifest = {
            "schemaVersion": 1,
            "bundleId": "fixture_map_visual_v1",
            "mapStyleId": "fixture_style_v1",
            "mapIds": ["fixture_map"],
            "status": "owner_review_pending",
            "ownerReviewStatus": "pending",
            "releaseApproved": False,
            "runtimeEnabled": False,
            "releaseAttestation": None,
            "tileSize": [80, 40],
            "catalogContractCheck": None,
            "source": {},
            "groundAtlas": None,
            "tiles": [],
            "objects": [],
            "mapBindings": [],
            "evidence": {"ownerAcceptance": None},
        }
        (bundle / promotion.MANIFEST_NAME).write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        return bundle

    def _fake_audit(self, manifest_path: Path) -> promotion.AuditSnapshot:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        godot_root = promotion._find_godot_root(manifest_path.parent)
        catalog = json.loads(
            (godot_root / "data/map_visual_catalog.json").read_text(
                encoding="utf-8"
            )
        )
        catalog_manifest = catalog["entries"][0]["bundleManifest"]
        self.assertEqual(
            (
                godot_root
                / catalog_manifest.removeprefix("res://")
            ).resolve(),
            manifest_path.resolve(),
        )
        files = ["evidence/frozen.txt"]
        missing = ["lifecycle_released_and_enabled"]
        if manifest.get("releaseAttestation") is None:
            missing.append("release_attestation")
        else:
            files.append(promotion.RELEASE_ATTESTATION_PATH)
        owner_ref = manifest.get("evidence", {}).get("ownerAcceptance")
        if owner_ref is None:
            missing.append("owner_acceptance")
        else:
            files.append(owner_ref["path"])
        released = (
            manifest.get("status") == "released"
            and manifest.get("ownerReviewStatus") == "approved"
            and manifest.get("releaseApproved") is True
            and manifest.get("runtimeEnabled") is True
        )
        if released:
            missing = []
        module = promotion._auditor_module()
        return promotion.AuditSnapshot(
            status="PASS",
            release_ready=released,
            missing_release_gates=tuple(sorted(missing)),
            errors=(),
            warnings=(),
            bundle_id=manifest["bundleId"],
            files_checked=tuple(sorted(files)),
            pngs_checked=0,
            jsons_checked=len(files),
            review_subject_sha256=module.manifest_review_subject_sha256(
                manifest
            ),
        )

    def test_candidate_is_two_phase_and_owner_files_come_from_auditor(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            bundle = self._fixture(Path(temporary))
            godot_root = Path(temporary) / "client/godot"
            self.assertEqual(
                promotion._find_godot_root(bundle), godot_root.resolve()
            )
            with mock.patch.object(
                promotion, "_audit_snapshot", side_effect=self._fake_audit
            ):
                candidate = promotion._prepare_candidate(
                    bundle,
                    reviewer="project-owner:test",
                    reviewed_at="2026-07-23T12:00:00Z",
                )
            self.assertEqual(
                candidate.approved_audit.missing_release_gates,
                promotion.APPROVED_GATES,
            )
            self.assertFalse(candidate.approved_audit.release_ready)
            self.assertTrue(candidate.released_audit.release_ready)
            self.assertEqual(candidate.released_audit.missing_release_gates, ())
            owner = json.loads(candidate.owner_acceptance_bytes)
            self.assertEqual(
                [value["path"] for value in owner["acceptedFiles"]],
                ["evidence/frozen.txt", promotion.RELEASE_ATTESTATION_PATH],
            )
            self.assertNotIn(
                promotion.OWNER_ACCEPTANCE_PATH,
                [value["path"] for value in owner["acceptedFiles"]],
            )
            self.assertEqual(
                list(godot_root.glob(".fixture_map_visual_v1-release-candidate-*")),
                [],
            )

    def test_release_summary_is_independent_of_lifecycle_and_self_reference(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            bundle = self._fixture(Path(temporary))
            manifest = json.loads(
                (bundle / promotion.MANIFEST_NAME).read_text(encoding="utf-8")
            )
            module = promotion._auditor_module()
            before = module.release_summary_hashes(manifest)
            manifest["status"] = "released"
            manifest["ownerReviewStatus"] = "approved"
            manifest["releaseApproved"] = True
            manifest["runtimeEnabled"] = True
            manifest["releaseAttestation"] = {
                "path": promotion.RELEASE_ATTESTATION_PATH,
                "sha256": "a" * 64,
            }
            manifest["evidence"]["ownerAcceptance"] = {
                "path": promotion.OWNER_ACCEPTANCE_PATH,
                "sha256": "b" * 64,
            }
            self.assertEqual(before, module.release_summary_hashes(manifest))

    def test_apply_uses_manifest_as_commit_point(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            bundle = self._fixture(Path(temporary))
            with mock.patch.object(
                promotion, "_audit_snapshot", side_effect=self._fake_audit
            ):
                candidate = promotion._prepare_candidate(
                    bundle,
                    reviewer="project-owner:test",
                    reviewed_at="2026-07-23T12:00:00Z",
                )
                promotion._atomic_apply(bundle, candidate)
            manifest = json.loads(
                (bundle / promotion.MANIFEST_NAME).read_text(encoding="utf-8")
            )
            self.assertEqual(manifest["status"], "released")
            self.assertTrue(manifest["releaseApproved"])
            self.assertTrue((bundle / promotion.OWNER_ACCEPTANCE_PATH).is_file())
            self.assertTrue((bundle / promotion.RELEASE_ATTESTATION_PATH).is_file())

    def test_partial_support_install_is_idempotently_resumable(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            bundle = self._fixture(Path(temporary))
            with mock.patch.object(
                promotion, "_audit_snapshot", side_effect=self._fake_audit
            ):
                candidate = promotion._prepare_candidate(
                    bundle,
                    reviewer="project-owner:test",
                    reviewed_at="2026-07-23T12:00:00Z",
                )

                def fail_after_attestation(stage: str) -> None:
                    if stage == "after_attestation_install":
                        raise promotion.PromotionError("fault injection")

                with self.assertRaises(promotion.PromotionError):
                    promotion._atomic_apply(
                        bundle,
                        candidate,
                        _fault_hook=fail_after_attestation,
                    )
                manifest = json.loads(
                    (bundle / promotion.MANIFEST_NAME).read_text(
                        encoding="utf-8"
                    )
                )
                self.assertEqual(manifest["status"], "owner_review_pending")
                self.assertTrue(
                    (bundle / promotion.RELEASE_ATTESTATION_PATH).is_file()
                )
                self.assertFalse(
                    (bundle / promotion.OWNER_ACCEPTANCE_PATH).exists()
                )

                promotion._atomic_apply(bundle, candidate)
            manifest = json.loads(
                (bundle / promotion.MANIFEST_NAME).read_text(encoding="utf-8")
            )
            self.assertEqual(manifest["status"], "released")
            self.assertTrue((bundle / promotion.OWNER_ACCEPTANCE_PATH).is_file())

    def test_failed_manifest_rollback_never_removes_support_files(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            bundle = self._fixture(Path(temporary))
            with mock.patch.object(
                promotion, "_audit_snapshot", side_effect=self._fake_audit
            ):
                candidate = promotion._prepare_candidate(
                    bundle,
                    reviewer="project-owner:test",
                    reviewed_at="2026-07-23T12:00:00Z",
                )

                def fail_after_manifest(stage: str) -> None:
                    if stage == "after_manifest_commit":
                        raise promotion.PromotionError("fault injection")

                with mock.patch.object(
                    promotion, "_restore_manifest", return_value=False
                ):
                    with self.assertRaisesRegex(
                        promotion.PromotionError, "回滚失败"
                    ):
                        promotion._atomic_apply(
                            bundle,
                            candidate,
                            _fault_hook=fail_after_manifest,
                        )
            manifest = json.loads(
                (bundle / promotion.MANIFEST_NAME).read_text(encoding="utf-8")
            )
            self.assertEqual(manifest["status"], "released")
            self.assertTrue(
                (bundle / promotion.RELEASE_ATTESTATION_PATH).is_file()
            )
            self.assertTrue((bundle / promotion.OWNER_ACCEPTANCE_PATH).is_file())


class MapVisualPreexportTest(unittest.TestCase):
    def _payload(self) -> dict[str, object]:
        return {
            "status": "PASS",
            "releaseReady": True,
            "missingReleaseGates": [],
            "errors": [],
        }

    def test_strict_three_condition_contract_passes(self) -> None:
        value = self._payload()
        self.assertIs(
            preexport._strict_audit_contract(
                value, returncode=0, stderr=""
            ),
            value,
        )

    def test_strict_contract_rejects_truthy_non_boolean(self) -> None:
        value = self._payload()
        value["releaseReady"] = 1
        with self.assertRaises(preexport.PreexportGateError):
            preexport._strict_audit_contract(
                value, returncode=0, stderr=""
            )

    def test_strict_contract_rejects_any_missing_gate(self) -> None:
        value = self._payload()
        value["missingReleaseGates"] = ["owner_acceptance"]
        with self.assertRaises(preexport.PreexportGateError):
            preexport._strict_audit_contract(
                value, returncode=0, stderr=""
            )

    def test_runner_rejects_non_json_stdout(self) -> None:
        def runner(*_args, **_kwargs):
            return subprocess.CompletedProcess(
                args=["auditor"],
                returncode=0,
                stdout="PASS\n",
                stderr="",
            )

        with self.assertRaises(preexport.PreexportGateError):
            preexport._run_auditor(Path("/tmp/bundle"), runner=runner)


if __name__ == "__main__":
    unittest.main()
