from __future__ import annotations

import copy
import hashlib
import json
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest import mock

from tools import promote_pet_fusion_runtime_release as promotion


SOURCE_REPO = Path(__file__).resolve().parents[2]


def json_bytes(value: object) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode()


def sha256(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


class PetFusionRuntimeReleasePromotionTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.repo_root = Path(self.temporary.name) / "repo"
        self.repo_root.mkdir(parents=True)
        for repo_path in (
            promotion.FUSION_CATALOG_PATH,
            promotion.ART_CATALOG_PATH,
            promotion.PRIOR_BODY_DECISION_PATH,
            Path("client/godot/export_presets.cfg"),
            promotion.SERVER_ATTESTATION_MODULE_PATH,
        ):
            self.copy_source(repo_path)
        for spec in promotion.FORM_SPECS:
            for repo_path in (
                spec.metadata_path,
                spec.portrait_metadata_path,
                spec.portrait_ownership_path,
                spec.portrait_master_path,
                spec.portrait_runtime_path,
                spec.pet_root
                / "source/portrait/headshot-chroma-eligibility-mask.png",
            ):
                self.copy_source(repo_path)
        self.main_reference = self.write_evidence(
            Path("docs/release_evidence/pet_fusion_main_owner_review_v1.json"),
            b'{"status":"owner_approved"}\n',
        )
        self.phase_reference = self.write_evidence(
            Path("docs/release_evidence/pet_fusion_release_scope_v1.md"),
            b"# frozen synthetic release scope\n",
        )
        validation = []
        for kind in promotion.VALIDATION_KINDS:
            reference = self.write_evidence(
                Path(f"docs/release_evidence/{kind}.json"),
                json_bytes({"kind": kind, "status": "passed"}),
            )
            validation.append({"kind": kind, "status": "passed", **reference})
        self.approval_path = Path(
            "docs/release_evidence/pet_fusion_runtime_release_input_v1.json"
        )
        approval = {
            "schemaVersion": 1,
            "recordType": promotion.APPROVAL_RECORD_TYPE,
            "reviewer": promotion.OWNER_ID,
            "decision": "approved",
            "recordedDecisionText": "批准当前首批融合候选正式开放。",
            "approvedAtUtc": "2026-08-17T08:00:00Z",
            "mainOwnerReview": self.main_reference,
            "phaseRecord": self.phase_reference,
            "portraitEvidence": [self.main_reference, self.phase_reference],
            "validationEvidence": validation,
        }
        self.write(self.approval_path, json_bytes(approval))

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def write(self, repo_path: Path, value: bytes) -> None:
        path = self.repo_root / repo_path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(value)

    def copy_source(self, repo_path: Path) -> None:
        target = self.repo_root / repo_path
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(SOURCE_REPO / repo_path, target)

    def write_evidence(self, repo_path: Path, value: bytes) -> dict[str, str]:
        self.write(repo_path, value)
        return {"path": repo_path.as_posix(), "sha256": sha256(value)}

    def prepare(self) -> promotion.PromotionCandidate:
        planning = promotion.prepare_candidate(
            self.repo_root,
            self.approval_path,
            trusted_hashes={},
            verify_closed=False,
            validate_server=False,
        )
        self.assertEqual(len(planning.blockers), 2)
        trusted = {
            form_id: frozenset({digest})
            for form_id, digest in planning.portrait_decision_sha256_by_form.items()
        }
        candidate = promotion.prepare_candidate(
            self.repo_root,
            self.approval_path,
            trusted_hashes=trusted,
            verify_closed=False,
            validate_server=False,
        )
        self.assertFalse(candidate.blockers)
        return candidate

    def snapshot(self, candidate: promotion.PromotionCandidate) -> dict[Path, bytes | None]:
        result: dict[Path, bytes | None] = {}
        for mutation in candidate.mutations:
            path = self.repo_root / mutation.repo_path
            result[mutation.repo_path] = path.read_bytes() if path.is_file() else None
        return result

    def assert_snapshot(
        self,
        candidate: promotion.PromotionCandidate,
        expected: dict[Path, bytes | None],
    ) -> None:
        for mutation in candidate.mutations:
            path = self.repo_root / mutation.repo_path
            value = path.read_bytes() if path.is_file() else None
            self.assertEqual(value, expected[mutation.repo_path], mutation.repo_path)

    def test_planning_requires_pinned_exact_portrait_decisions(self) -> None:
        candidate = promotion.prepare_candidate(
            self.repo_root,
            self.approval_path,
            trusted_hashes={},
            verify_closed=False,
            validate_server=False,
        )
        self.assertEqual(len(candidate.blockers), 2)
        self.assertTrue(
            all(
                "trusted portrait owner digest" in value
                for value in candidate.blockers
            )
        )
        with self.assertRaisesRegex(promotion.PromotionError, "candidate is blocked"):
            promotion.atomic_apply(candidate, post_validate=None)
        fusion = json.loads((self.repo_root / promotion.FUSION_CATALOG_PATH).read_text())
        self.assertFalse(fusion["runtimeEnabled"])

    def test_atomic_apply_rolls_back_every_byte_after_commit_point_fault(self) -> None:
        candidate = self.prepare()
        before = self.snapshot(candidate)

        def fault(label: str) -> None:
            if label == f"after:{promotion.FUSION_CATALOG_PATH.as_posix()}":
                raise RuntimeError("synthetic post-commit failure")

        with self.assertRaisesRegex(RuntimeError, "synthetic post-commit failure"):
            promotion.atomic_apply(
                candidate,
                post_validate=None,
                fault_hook=fault,
            )
        self.assert_snapshot(candidate, before)

    def test_atomic_apply_installs_support_before_open_catalog(self) -> None:
        candidate = self.prepare()
        observed: list[str] = []

        def observe(label: str) -> None:
            observed.append(label)
            if label != f"after:{promotion.FUSION_CATALOG_PATH.as_posix()}":
                fusion = json.loads(
                    (self.repo_root / promotion.FUSION_CATALOG_PATH).read_text()
                )
                self.assertFalse(fusion["runtimeEnabled"])

        promotion.atomic_apply(
            candidate,
            post_validate=lambda value: self.assertEqual(value, candidate),
            fault_hook=observe,
        )
        self.assertEqual(
            observed[-1],
            f"after:{promotion.FUSION_CATALOG_PATH.as_posix()}",
        )
        fusion = json.loads((self.repo_root / promotion.FUSION_CATALOG_PATH).read_text())
        art = json.loads((self.repo_root / promotion.ART_CATALOG_PATH).read_text())
        self.assertTrue(fusion["runtimeEnabled"])
        for spec in promotion.FORM_SPECS:
            decision = self.repo_root / spec.portrait_decision_path
            self.assertTrue(decision.is_file())
            metadata = json.loads((self.repo_root / spec.metadata_path).read_text())
            portrait = json.loads(
                (self.repo_root / spec.portrait_metadata_path).read_text()
            )
            art_form = next(
                form for form in art["forms"] if form["formId"] == spec.form_id
            )
            self.assertTrue(metadata["runtimeEnabled"])
            self.assertEqual(metadata["ownerReviewStatus"], "approved")
            self.assertEqual(
                metadata["productionScope"],
                promotion.RELEASE_PRODUCTION_SCOPE,
            )
            self.assertEqual(metadata["identity"]["status"], "approved")
            self.assertEqual(metadata["keyPoseReviewStatus"], "approved")
            self.assertEqual(metadata["notes"], promotion.RELEASE_NOTES)
            self.assertEqual(
                metadata["battleViewMapping"],
                promotion.BATTLE_VIEW_MAPPING,
            )
            self.assertEqual(
                metadata["battleVisual"]["battleViewMapping"],
                promotion.BATTLE_VIEW_MAPPING,
            )
            self.assertTrue(
                all(
                    action["status"] == "approved"
                    for action in metadata["actions"].values()
                )
            )
            self.assertEqual(portrait["ownerReview"]["status"], "approved")
            self.assertTrue(portrait["releaseGate"])
            self.assertEqual(art_form["status"], "approved")
            self.assertTrue(art_form["runtimeEnabled"])

    def test_export_contract_rejects_decision_below_gdignore(self) -> None:
        hidden_root = Path("client/godot/assets/pets/hidden/qa/portrait")
        self.write(hidden_root.parent / ".gdignore", b"ignored\n")
        hidden_spec = promotion.FormSpec(
            form_id="hidden",
            pet_root=hidden_root,
            battle_bundle_digest="0" * 64,
        )
        with mock.patch.object(promotion, "FORM_SPECS", (hidden_spec,)):
            with self.assertRaisesRegex(promotion.PromotionError, "hidden by .gdignore"):
                promotion.validate_export_contract(self.repo_root)

    def test_candidate_passes_authoritative_server_attestation_model(self) -> None:
        candidate = self.prepare()
        result = promotion.validate_server_candidate(candidate)
        self.assertTrue(result["releaseApproved"])
        self.assertTrue(result["runtimeEnabled"])
        self.assertTrue(result["playerEntryOpened"])
        self.assertEqual(
            result["attestationSha256"],
            candidate.runtime_attestation_sha256,
        )

    def test_approval_evidence_hash_drift_is_rejected(self) -> None:
        main_path = self.repo_root / self.main_reference["path"]
        main_path.write_bytes(b"drifted\n")
        with self.assertRaisesRegex(promotion.PromotionError, "sha256 drift"):
            promotion.prepare_candidate(
                self.repo_root,
                self.approval_path,
                trusted_hashes={},
                verify_closed=False,
                validate_server=False,
            )


if __name__ == "__main__":
    unittest.main()
