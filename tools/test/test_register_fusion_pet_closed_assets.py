#!/usr/bin/env python3
"""Contract tests for tools/register_fusion_pet_closed_assets.py."""

from __future__ import annotations

import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import sys
import tempfile
import unittest
from unittest import mock
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[2]
TOOL_PATH = REPO_ROOT / "tools/register_fusion_pet_closed_assets.py"
SPEC = importlib.util.spec_from_file_location(
    "register_fusion_pet_closed_assets",
    TOOL_PATH,
)
assert SPEC is not None and SPEC.loader is not None
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


def _sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _write_bytes(path: Path, payload: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(payload)


def _write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def _fixture_payload(form_id: str, relative: str) -> bytes:
    return f"fixture:{form_id}:{relative}\n".encode("utf-8")


def _materialize_pet_root(source_base: Path, spec: Any) -> Path:
    root = source_base / spec.source_slug / "pet-root"

    visual_paths = {
        *MODULE.IDENTITY_VISUAL_PATHS,
        *MODULE._expected_world_paths("world/directions"),
        *MODULE._expected_world_paths("source/world-frames"),
        *MODULE._expected_battle_paths(source=False),
        *MODULE._expected_battle_paths(source=True),
    }
    for relative in sorted(visual_paths):
        _write_bytes(root / relative, _fixture_payload(spec.form_id, relative))

    support_files = {
        "identity/identity-lock.md": b"identity lock\n",
        "identity/source-and-ownership.md": b"original fixture art\n",
        "prompts/identity.txt": b"fixture identity prompt\n",
        "qa/identity-key-pose-qc.json": b'{"status":"passed"}\n',
    }
    for relative, payload in support_files.items():
        _write_bytes(root / relative, payload)
    identity_raw = root / "source/identity-board-raw.png"
    _write_bytes(identity_raw, _fixture_payload(spec.form_id, identity_raw.name))
    _write_json(
        root / "source/identity-board-pipeline-meta.json",
        {
            "schemaVersion": 1,
            "tool": "build_pet_art_bundle.py",
            "input": MODULE._display_path(identity_raw),
            "inputSha256": _sha256_file(identity_raw),
        },
    )
    _write_json(
        root / "source/identity-board-source-meta.json",
        {
            "schemaVersion": 2,
            "pipelineMetadata": "source/identity-board-pipeline-meta.json",
            "pipelineMetadataSha256": _sha256_file(
                root / "source/identity-board-pipeline-meta.json"
            ),
        },
    )

    portrait_files = {
        "portrait/default.png": b"portrait runtime candidate\n",
        "portrait/portrait-meta.json": b'{"ownerReviewStatus":"pending"}\n',
        "portrait/source-and-ownership.md": b"portrait provenance\n",
        "source/portrait/headshot-master-1024.png": b"portrait source\n",
        "qa/portrait/contact-sheet.png": b"portrait review\n",
        "prompts/portrait-v1.txt": b"portrait prompt\n",
    }
    for relative, payload in portrait_files.items():
        _write_bytes(root / relative, payload)

    metadata = {
        "schemaVersion": 1,
        "formId": spec.form_id,
        "displayName": spec.display_name,
        "artStatus": "in_production",
        "runtimeEnabled": False,
        "rideableTarget": False,
        "supportedMountedCharacterIds": [],
        "ownerReviewStatus": "pending",
        "worldVisual": {
            "status": "owner_review_pending",
            "strategy": "independent_8",
            "runtimeMirroring": False,
            "runtimeMountedComposition": False,
            "totalFrameCount": 40,
            "directions": list(MODULE.WORLD_DIRECTIONS),
            "actions": {
                "idle": {
                    "frameCount": 1,
                    "fps": 4,
                    "loop": True,
                    "status": "owner_review_pending",
                },
                "walk": {
                    "frameCount": 4,
                    "fps": 10,
                    "loop": True,
                    "status": "owner_review_pending",
                },
            },
        },
        "battleVisual": {
            "status": "owner_review_pending",
            "kind": "pet",
            "views": list(MODULE.BATTLE_VIEWS),
            "totalFrameCount": 180,
            "runtimeMirroring": False,
            "integratedWholeFrame": False,
            "runtimeLayeredComposition": False,
            "runtimeEnabled": False,
            "bundleDigest": spec.battle_bundle_digest,
            "archiveMode": "full",
            "sourceFramesTracked": True,
        },
        "evidence": {
            "identityGateAudit": {
                "pipelineMetadata": {
                    "sha256": _sha256_file(
                        root / "source/identity-board-pipeline-meta.json"
                    ),
                    "metadataReplaySha256": (
                        MODULE._pipeline_metadata_replay_sha256(
                            (
                                root
                                / "source/identity-board-pipeline-meta.json"
                            ).read_bytes(),
                            raw_source=identity_raw,
                            label=f"{spec.form_id} fixture pipeline",
                        )
                    ),
                },
            },
        },
    }
    _write_json(root / "action-bundle-meta.json", metadata)

    battle_paths = {
        *MODULE._expected_battle_paths(source=False),
        *MODULE._expected_battle_paths(source=True),
    }
    installed_hashes = {
        relative: _sha256_file(root / relative) for relative in sorted(battle_paths)
    }
    _write_json(
        root / "source/battle/install-manifest.json",
        {
            "schemaVersion": 1,
            "tool": "install_pet_battle_bundle.py",
            "formId": spec.form_id,
            "kind": "pet",
            "characterId": None,
            "bundleDigest": spec.battle_bundle_digest,
            "archiveMode": "full",
            "installedFileHashes": installed_hashes,
            "runtimeEnabled": False,
            "ownerReviewStatus": "pending",
        },
    )
    return root


class ClosedFusionRegistrationTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_directory.cleanup)
        # macOS exposes /var as a symlink to /private/var; use the canonical
        # temporary root so the production path-safety rule remains strict.
        self.root = Path(self.temp_directory.name).resolve()
        self.source_base = self.root / "source"
        self.destination_base = self.root / "production/pets"
        for form_spec in MODULE.FORM_SPECS:
            _materialize_pet_root(self.source_base, form_spec)

        self.owner_video = self.root / "evidence/fusion-owner-review-1x.mp4"
        _write_bytes(self.owner_video, b"fixture merged 1x owner video\n")
        self.video_sha = _sha256_file(self.owner_video)
        self.owner_decision = self.root / "data/pet_fusion_visual_owner_decision_v1.json"
        _write_json(
            self.owner_decision,
            {
                "schemaVersion": 1,
                "decisionType": (
                    "beastbound_pet_fusion_full_nonrideable_visual_owner_decision"
                ),
                "decision": "approved",
                "reviewer": "project-owner:fander",
                "recordedDecisionText": "通过啊",
                "approvedScopes": list(MODULE.OWNER_APPROVED_SCOPES),
                "excludedScopes": list(MODULE.OWNER_EXCLUDED_SCOPES),
                "evidence": {
                    "mergedReviewVideo": {
                        "path": "fixture-owner-review-1x.mp4",
                        "sha256": self.video_sha,
                        "playbackSpeed": 1.0,
                    },
                    "forms": [
                        {
                            "formId": spec.form_id,
                            "battleBundleDigest": spec.battle_bundle_digest,
                        }
                        for spec in MODULE.FORM_SPECS
                    ],
                },
                "releaseApproved": False,
                "runtimeEnabled": False,
            },
        )
        self.owner_decision_sha = _sha256_file(self.owner_decision)

    def _options(self, *, write: bool) -> Any:
        return MODULE.RegistrationOptions(
            source_base=self.source_base,
            destination_base=self.destination_base,
            owner_decision=self.owner_decision,
            owner_video=self.owner_video,
            write=write,
        )

    def _run(self, *, write: bool, rename_no_clobber: Any = None) -> dict[str, Any]:
        with (
            mock.patch.object(
                MODULE,
                "OWNER_REVIEW_VIDEO_SHA256",
                self.video_sha,
            ),
            mock.patch.object(
                MODULE,
                "OWNER_DECISION_PATH",
                self.owner_decision,
            ),
            mock.patch.object(
                MODULE,
                "OWNER_DECISION_SHA256",
                self.owner_decision_sha,
            ),
            mock.patch.object(
                MODULE,
                "RECOVERY_BASE",
                self.root / ".run/recovery/fusion-pet-closed-registration",
            ),
        ):
            if rename_no_clobber is None:
                return MODULE.run_registration(self._options(write=write))
            return MODULE.run_registration(
                self._options(write=write),
                rename_no_clobber=rename_no_clobber,
            )

    def _prepare_candidates(self) -> tuple[Any, ...]:
        with (
            mock.patch.object(
                MODULE,
                "OWNER_REVIEW_VIDEO_SHA256",
                self.video_sha,
            ),
            mock.patch.object(
                MODULE,
                "OWNER_DECISION_PATH",
                self.owner_decision,
            ),
            mock.patch.object(
                MODULE,
                "OWNER_DECISION_SHA256",
                self.owner_decision_sha,
            ),
        ):
            return MODULE.prepare_registration(self._options(write=False))

    def _materialize_legacy_destinations(self) -> tuple[Any, ...]:
        candidates = self._prepare_candidates()
        for candidate in candidates:
            destination = candidate.destination_root
            destination.mkdir(parents=True)
            for record in candidate.copied_records:
                source = candidate.source_root / record.path
                target = destination / record.path
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(source, target)
            manifest = destination / MODULE.MANIFEST_RELATIVE
            manifest.parent.mkdir(parents=True, exist_ok=True)
            manifest.write_bytes(candidate.legacy_manifest_bytes)
            self.assertEqual(
                MODULE._actual_destination_records(destination),
                candidate.legacy_expected_records,
            )
        return candidates

    def _materialize_previous_destinations(self) -> tuple[Any, ...]:
        candidates = self._prepare_candidates()
        for candidate in candidates:
            destination = candidate.destination_root
            destination.mkdir(parents=True)
            transformed = {
                item.path: item for item in candidate.transformations
            }
            for record in candidate.previous_expected_records:
                if record.path == MODULE.MANIFEST_RELATIVE.as_posix():
                    continue
                target = destination / record.path
                target.parent.mkdir(parents=True, exist_ok=True)
                if record.path in candidate.previous_transformation_paths:
                    target.write_bytes(transformed[record.path].payload)
                else:
                    shutil.copy2(candidate.source_root / record.path, target)
            manifest = destination / MODULE.MANIFEST_RELATIVE
            manifest.parent.mkdir(parents=True, exist_ok=True)
            manifest.write_bytes(candidate.previous_manifest_bytes)
            self.assertEqual(
                MODULE._actual_destination_records(destination),
                candidate.previous_expected_records,
            )
        return candidates

    def test_write_registers_both_closed_bundles_and_is_idempotent(self) -> None:
        result = self._run(write=True)
        self.assertEqual(result["registrationState"], "registered")
        self.assertFalse(result["runtimeEnabled"])
        self.assertEqual(len(result["forms"]), 2)

        for spec in MODULE.FORM_SPECS:
            destination = self.destination_base / spec.form_id
            manifest_path = destination / MODULE.MANIFEST_RELATIVE
            self.assertTrue(manifest_path.is_file())
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            self.assertFalse(manifest["lifecycle"]["runtimeEnabled"])
            self.assertFalse(manifest["lifecycle"]["petArtCatalogEdited"])
            self.assertFalse(
                manifest["lifecycle"][
                    "ownerVisualDecisionApprovesThisEngineeringRegistration"
                ]
            )
            self.assertIn(
                "dedicated_pet_portrait",
                manifest["frozenOwnerApproval"]["excludedScope"],
            )
            self.assertIn(
                "production_art_catalog_registration",
                manifest["frozenOwnerApproval"]["excludedScope"],
            )
            self.assertIn(
                "fusion_runtime_release",
                manifest["frozenOwnerApproval"]["excludedScope"],
            )
            self.assertEqual(
                manifest["frozenOwnerApproval"]["phase371BattleBundleDigest"],
                spec.battle_bundle_digest,
            )
            self.assertEqual(len(manifest["ownerApprovedVisualFiles"]), 445)
            self.assertEqual(
                len(manifest["copiedFiles"]),
                len(manifest["ownerApprovedVisualFiles"])
                + len(manifest["engineeringSupportFiles"]),
            )
            relocation = manifest["engineeringRelocations"]
            self.assertEqual(len(relocation), 1)
            self.assertEqual(
                relocation[0]["path"],
                "source/identity-board-pipeline-meta.json",
            )
            pipeline_path = destination / relocation[0]["path"]
            pipeline = json.loads(pipeline_path.read_text(encoding="utf-8"))
            self.assertEqual(pipeline["input"], relocation[0]["to"])
            self.assertEqual(
                pipeline["inputSha256"],
                _sha256_file(destination / "source/identity-board-raw.png"),
            )
            self.assertEqual(
                _sha256_file(pipeline_path),
                relocation[0]["candidateMetadataSha256"],
            )
            source_pipeline = (
                self.source_base
                / spec.source_slug
                / "pet-root/source/identity-board-pipeline-meta.json"
            )
            self.assertEqual(
                _sha256_file(source_pipeline),
                relocation[0]["sourceMetadataSha256"],
            )
            self.assertNotEqual(
                relocation[0]["sourceMetadataSha256"],
                relocation[0]["candidateMetadataSha256"],
            )
            integrity_updates = manifest["engineeringIntegrityUpdates"]
            self.assertEqual(len(integrity_updates), 2)
            integrity_by_path = {
                update["path"]: update for update in integrity_updates
            }
            integrity = integrity_by_path[
                "source/identity-board-source-meta.json"
            ]
            self.assertEqual(
                integrity["path"],
                "source/identity-board-source-meta.json",
            )
            source_meta_path = destination / integrity["path"]
            source_meta = json.loads(source_meta_path.read_text(encoding="utf-8"))
            self.assertEqual(
                source_meta["pipelineMetadataSha256"],
                relocation[0]["candidateMetadataSha256"],
            )
            self.assertEqual(
                _sha256_file(source_meta_path),
                integrity["candidateMetadataSha256"],
            )
            self.assertEqual(
                integrity["boundFile"]["sha256"],
                relocation[0]["candidateMetadataSha256"],
            )
            action_integrity = integrity_by_path["action-bundle-meta.json"]
            self.assertEqual(
                action_integrity["field"],
                "evidence.identityGateAudit.pipelineMetadata.sha256",
            )
            self.assertEqual(
                [
                    update["field"]
                    for update in action_integrity["fieldUpdates"]
                ],
                [
                    "evidence.identityGateAudit.pipelineMetadata.sha256",
                    (
                        "evidence.identityGateAudit.pipelineMetadata."
                        "metadataReplaySha256"
                    ),
                ],
            )
            action_meta_path = destination / "action-bundle-meta.json"
            action_meta = json.loads(
                action_meta_path.read_text(encoding="utf-8")
            )
            self.assertEqual(
                action_meta["evidence"]["identityGateAudit"][
                    "pipelineMetadata"
                ]["sha256"],
                relocation[0]["candidateMetadataSha256"],
            )
            expected_replay_sha = MODULE._pipeline_metadata_replay_sha256(
                pipeline_path.read_bytes(),
                raw_source=(
                    destination / "source/identity-board-raw.png"
                ),
                label=f"{spec.form_id} registered pipeline",
            )
            self.assertEqual(
                action_meta["evidence"]["identityGateAudit"][
                    "pipelineMetadata"
                ]["metadataReplaySha256"],
                expected_replay_sha,
            )
            self.assertEqual(
                action_integrity["fieldUpdates"][1]["to"],
                expected_replay_sha,
            )
            self.assertEqual(
                _sha256_file(action_meta_path),
                action_integrity["candidateMetadataSha256"],
            )
            self.assertEqual(
                action_integrity["boundFile"]["sha256"],
                relocation[0]["candidateMetadataSha256"],
            )
            registration_snapshot = MODULE._sha256_bytes(
                MODULE._json_bytes(
                    [
                        *manifest["copiedFiles"],
                        *manifest["portrait"]["excludedFiles"],
                    ]
                )
            )
            self.assertEqual(
                manifest["sourceSnapshotSha256"],
                registration_snapshot,
            )
            self.assertNotEqual(
                manifest["isolatedSourceSnapshotSha256"],
                manifest["sourceSnapshotSha256"],
            )
            isolated_records = [
                dict(record) for record in manifest["copiedFiles"]
            ]
            isolated_by_path = {
                record["path"]: record for record in isolated_records
            }
            for transformation in (
                *manifest["engineeringRelocations"],
                *manifest["engineeringIntegrityUpdates"],
            ):
                source_record = isolated_by_path[transformation["path"]]
                source_record["sha256"] = transformation[
                    "sourceMetadataSha256"
                ]
                source_record["size"] = transformation["sourceMetadataSize"]
            isolated_snapshot = MODULE._sha256_bytes(
                MODULE._json_bytes(
                    [
                        *isolated_records,
                        *manifest["portrait"]["excludedFiles"],
                    ]
                )
            )
            self.assertEqual(
                manifest["isolatedSourceSnapshotSha256"],
                isolated_snapshot,
            )

        repeated = self._run(write=True)
        self.assertEqual(repeated["registrationState"], "already_registered")

    def test_previous_closed_registration_upgrades_to_full_hash_chain(self) -> None:
        candidates = self._materialize_previous_destinations()
        checked = self._run(write=False)
        self.assertEqual(checked["registrationState"], "upgrade_ready")
        for candidate in candidates:
            previous_action = json.loads(
                (
                    candidate.destination_root / "action-bundle-meta.json"
                ).read_text(encoding="utf-8")
            )
            pipeline = next(
                item
                for item in candidate.transformations
                if item.path
                == "source/identity-board-pipeline-meta.json"
            )
            self.assertEqual(
                previous_action["evidence"]["identityGateAudit"][
                    "pipelineMetadata"
                ]["sha256"],
                pipeline.source_sha256,
            )

        result = self._run(write=True)
        self.assertEqual(result["registrationState"], "upgraded")
        recovery = result["recovery"]
        self.assertEqual(recovery["status"], "completed")
        receipt_by_form = {
            form["formId"]: form for form in recovery["forms"]
        }
        for candidate in candidates:
            self.assertEqual(
                receipt_by_form[candidate.spec.form_id]["priorGeneration"],
                "closed_registration_v1",
            )
            self.assertEqual(
                MODULE._actual_destination_records(candidate.destination_root),
                candidate.expected_records,
            )
            action_update = next(
                item
                for item in candidate.transformations
                if item.path == "action-bundle-meta.json"
            )
            self.assertEqual(
                _sha256_file(
                    candidate.destination_root / "action-bundle-meta.json"
                ),
                action_update.candidate_sha256,
            )

    def test_recursive_hash_dependency_drift_is_refused(self) -> None:
        solar = MODULE.FORM_SPECS[0]
        root = (
            self.source_base / solar.source_slug / "pet-root"
        )
        qc_path = root / "qa/identity-key-pose-qc.json"
        qc = json.loads(qc_path.read_text(encoding="utf-8"))
        qc["unexpectedSourceMetaBinding"] = _sha256_file(
            root / "source/identity-board-source-meta.json"
        )
        _write_json(qc_path, qc)
        with self.assertRaisesRegex(
            MODULE.RegistrationError,
            "integrity dependency graph drift",
        ):
            self._run(write=False)

    def test_derived_replay_hash_dependency_drift_is_refused(self) -> None:
        solar = MODULE.FORM_SPECS[0]
        root = self.source_base / solar.source_slug / "pet-root"
        action = json.loads(
            (root / "action-bundle-meta.json").read_text(encoding="utf-8")
        )
        replay_sha = action["evidence"]["identityGateAudit"][
            "pipelineMetadata"
        ]["metadataReplaySha256"]
        qc_path = root / "qa/identity-key-pose-qc.json"
        qc = json.loads(qc_path.read_text(encoding="utf-8"))
        qc["unexpectedReplayDigestBinding"] = replay_sha
        _write_json(qc_path, qc)
        with self.assertRaisesRegex(
            MODULE.RegistrationError,
            "integrity dependency graph drift",
        ):
            self._run(write=False)

    def test_recursive_transforms_close_real_pet_art_batch_audit_fixture(
        self,
    ) -> None:
        from tools.test import test_pet_art_batch_audit as audit_fixture

        fixture_root = self.root / "pet-art-audit-repo"
        catalog = audit_fixture._read_fixture()
        form = catalog["forms"][0]
        isolated_prefix = ".run/isolated/fixture_pet"
        production_prefix = "client/godot/assets/pets/fixture_pet"
        for key, suffix in {
            "root": "",
            "metadataPath": "/action-bundle-meta.json",
            "identityPath": "/identity/identity-lock.md",
            "ownershipPath": "/identity/source-and-ownership.md",
            "promptPath": "/prompts/identity.txt",
        }.items():
            form["pet"][key] = f"{isolated_prefix}{suffix}"
        isolated_root = audit_fixture._materialize_schema2_identity_gate(
            fixture_root,
            catalog,
        )
        production_root = fixture_root / production_prefix
        source_records = tuple(
            sorted(
                (
                    MODULE._record(isolated_root, path)
                    for path in MODULE._scan_safe_tree(
                        isolated_root,
                        label="real audit fixture source",
                    )
                ),
                key=lambda record: record.path,
            )
        )
        spec = MODULE.FormSpec(
            source_slug="fixture",
            form_id=form["formId"],
            display_name=form["displayName"],
            battle_bundle_digest="f" * 64,
        )
        with mock.patch.object(MODULE, "REPO_ROOT", fixture_root):
            pipeline = MODULE._relocate_identity_pipeline_metadata(
                source_root=isolated_root,
                destination_root=production_root,
                spec=spec,
            )
            integrity = MODULE._build_recursive_integrity_transformations(
                source_root=isolated_root,
                destination_root=production_root,
                spec=spec,
                source_copied=source_records,
                pipeline_transformation=pipeline,
            )
        self.assertEqual(
            [item.path for item in integrity],
            [
                "source/identity-board-source-meta.json",
                "action-bundle-meta.json",
            ],
        )

        shutil.copytree(isolated_root, production_root)
        transformations = {
            item.path: item for item in (pipeline, *integrity)
        }
        for path in (
            "source/identity-board-pipeline-meta.json",
            "source/identity-board-source-meta.json",
        ):
            (production_root / path).write_bytes(
                transformations[path].payload
            )
        for key, value in tuple(form["pet"].items()):
            if isinstance(value, str) and value.startswith(isolated_prefix):
                form["pet"][key] = value.replace(
                    isolated_prefix,
                    production_prefix,
                    1,
                )
        fusion_catalog = audit_fixture._fusion_catalog_fixture(
            form["formId"]
        )
        fusion_catalog["recipes"][0]["assetGate"][
            "replacementPath"
        ] = production_prefix

        failed, failed_report = audit_fixture._run(
            fixture_root,
            catalog,
            fusion_catalog,
        )
        self.assertNotEqual(failed.returncode, 0)
        self.assertIn(
            "invalid_identity_gate_action_meta",
            audit_fixture._issue_codes(failed_report),
        )

        (production_root / "action-bundle-meta.json").write_bytes(
            transformations["action-bundle-meta.json"].payload
        )
        with mock.patch.object(
            audit_fixture.identity_finalizer,
            "REPO_ROOT",
            fixture_root,
        ):
            replay_audit = (
                audit_fixture.identity_finalizer.inspect_pipeline_replay(
                    production_root
                    / "source/identity-board-pipeline-meta.json",
                    production_root,
                    production_root / "source/identity-board-raw.png",
                    production_root
                    / "identity/identity-board-transparent.png",
                    {
                        pose: production_root / f"identity/{pose}.png"
                        for pose in (
                            audit_fixture.identity_finalizer.IDENTITY_POSES
                        )
                    },
                    fixture_root / "independent-replay-check",
                )
            )
        transformed_action = json.loads(
            (
                production_root / "action-bundle-meta.json"
            ).read_text(encoding="utf-8")
        )
        self.assertEqual(
            transformed_action["evidence"]["identityGateAudit"][
                "pipelineMetadata"
            ]["metadataReplaySha256"],
            replay_audit["metadataReplaySha256"],
        )
        completed, report = audit_fixture._run(
            fixture_root,
            catalog,
            fusion_catalog,
        )
        self.assertEqual(
            completed.returncode,
            0,
            f"{completed.stderr}\n{json.dumps(report, ensure_ascii=False, indent=2)}",
        )
        self.assertEqual(report["summary"]["errors"], 0)
        self.assertEqual(
            report["forms"][0]["pet"]["identityGate"]["status"],
            "verified",
        )

    def test_default_check_only_is_a_true_dry_run(self) -> None:
        result = self._run(write=False)
        self.assertEqual(result["mode"], "check_only")
        self.assertEqual(result["registrationState"], "ready")
        for spec in MODULE.FORM_SPECS:
            self.assertFalse((self.destination_base / spec.form_id).exists())

    def test_bundle_digest_and_owner_video_drift_fail_closed(self) -> None:
        solar = MODULE.FORM_SPECS[0]
        metadata_path = (
            self.source_base / solar.source_slug / "pet-root/action-bundle-meta.json"
        )
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        metadata["battleVisual"]["bundleDigest"] = "0" * 64
        _write_json(metadata_path, metadata)
        with self.assertRaisesRegex(MODULE.RegistrationError, "bundleDigest"):
            self._run(write=False)

        _materialize_pet_root(self.source_base, solar)
        _write_bytes(self.owner_video, b"drifted video bytes\n")
        with self.assertRaisesRegex(MODULE.RegistrationError, "video hash drift"):
            self._run(write=False)

    def test_tracked_owner_decision_hash_drift_fails_closed(self) -> None:
        decision = json.loads(self.owner_decision.read_text(encoding="utf-8"))
        decision["runtimeEnabled"] = True
        _write_json(self.owner_decision, decision)
        with self.assertRaisesRegex(MODULE.RegistrationError, "owner decision hash drift"):
            self._run(write=False)

    def test_portrait_artifacts_are_never_copied(self) -> None:
        self._run(write=True)
        for spec in MODULE.FORM_SPECS:
            destination = self.destination_base / spec.form_id
            self.assertFalse((destination / "portrait").exists())
            self.assertFalse((destination / "source/portrait").exists())
            self.assertFalse((destination / "qa/portrait").exists())
            self.assertFalse((destination / "prompts/portrait-v1.txt").exists())
            manifest = json.loads(
                (destination / MODULE.MANIFEST_RELATIVE).read_text(encoding="utf-8")
            )
            self.assertFalse(manifest["portrait"]["copied"])
            self.assertEqual(
                manifest["portrait"]["status"],
                "pending_formal_rebuild_and_owner_review",
            )
            excluded = {
                record["path"] for record in manifest["portrait"]["excludedFiles"]
            }
            self.assertIn("portrait/default.png", excluded)
            self.assertIn("source/portrait/headshot-master-1024.png", excluded)

    def test_existing_destination_conflict_is_refused_without_partial_install(self) -> None:
        conflict = self.destination_base / MODULE.FORM_SPECS[0].form_id
        _write_bytes(conflict / "foreign.txt", b"must survive\n")
        with self.assertRaisesRegex(MODULE.RegistrationError, "destination drift"):
            self._run(write=True)
        self.assertEqual((conflict / "foreign.txt").read_bytes(), b"must survive\n")
        self.assertFalse(
            (self.destination_base / MODULE.FORM_SPECS[1].form_id).exists()
        )

    def test_second_rename_failure_rolls_back_first_pet(self) -> None:
        call_count = 0

        def fail_second(source: Path, destination: Path) -> None:
            nonlocal call_count
            call_count += 1
            if call_count == 2:
                raise OSError("injected second rename failure")
            MODULE._rename_no_clobber(source, destination)

        with self.assertRaisesRegex(MODULE.RegistrationError, "dual-pet registration"):
            self._run(write=True, rename_no_clobber=fail_second)
        self.assertEqual(call_count, 2)
        for spec in MODULE.FORM_SPECS:
            self.assertFalse((self.destination_base / spec.form_id).exists())

    def test_legacy_exact_roots_upgrade_together_and_retain_recovery(self) -> None:
        candidates = self._materialize_legacy_destinations()
        sidecars: dict[str, tuple[Path, bytes]] = {}
        for candidate in candidates:
            sidecar = (
                candidate.destination_root
                / "identity/front_3quarter_sw.png.import"
            )
            payload = (
                f"generated import state:{candidate.spec.form_id}\n".encode("utf-8")
            )
            _write_bytes(sidecar, payload)
            sidecars[candidate.spec.form_id] = (sidecar.relative_to(
                candidate.destination_root
            ), payload)
        checked = self._run(write=False)
        self.assertEqual(checked["registrationState"], "upgrade_ready")
        self.assertTrue(
            all(
                form["existingGeneratedImportSidecars"] == 1
                for form in checked["forms"]
            )
        )

        result = self._run(write=True)
        self.assertEqual(result["registrationState"], "upgraded")
        recovery = result["recovery"]
        self.assertEqual(recovery["status"], "completed")
        recovery_root = Path(recovery["recoveryDirectory"])
        self.assertTrue(recovery_root.is_dir())
        self.assertTrue(Path(recovery["receiptPath"]).is_file())
        self.assertEqual(
            _sha256_file(Path(recovery["receiptPath"])),
            recovery["receiptSha256"],
        )
        receipt_by_form = {
            form["formId"]: form for form in recovery["forms"]
        }
        for candidate in candidates:
            destination = candidate.destination_root
            self.assertEqual(
                MODULE._actual_destination_records(
                    destination,
                    allowed_sidecar_bases=MODULE._candidate_sidecar_bases(
                        candidate
                    ),
                ),
                candidate.expected_records,
            )
            sidecar_relative, sidecar_payload = sidecars[candidate.spec.form_id]
            self.assertFalse((destination / sidecar_relative).exists())
            self.assertTrue(
                (
                    recovery_root
                    / "backup"
                    / candidate.spec.form_id
                    / MODULE.MANIFEST_RELATIVE
                ).is_file()
            )
            self.assertTrue(
                (
                    recovery_root
                    / "transaction/originals"
                    / candidate.spec.form_id
                    / MODULE.MANIFEST_RELATIVE
                ).is_file()
            )
            self.assertEqual(
                (
                    recovery_root
                    / "backup"
                    / candidate.spec.form_id
                    / sidecar_relative
                ).read_bytes(),
                sidecar_payload,
            )
            self.assertEqual(
                (
                    recovery_root
                    / "transaction/originals"
                    / candidate.spec.form_id
                    / sidecar_relative
                ).read_bytes(),
                sidecar_payload,
            )
            sidecar_evidence = receipt_by_form[candidate.spec.form_id][
                "generatedImportSidecars"
            ]
            self.assertEqual(sidecar_evidence["count"], 1)
            self.assertFalse(sidecar_evidence["productionCandidateCopied"])
            self.assertTrue(sidecar_evidence["retainedInRecovery"])
            self.assertEqual(
                sidecar_evidence["files"][0]["path"],
                sidecar_relative.as_posix(),
            )
            self.assertFalse((destination / "portrait").exists())

    def test_legacy_upgrade_second_new_rename_failure_restores_both(self) -> None:
        candidates = self._materialize_legacy_destinations()
        sidecars: dict[str, tuple[Path, bytes]] = {}
        for candidate in candidates:
            sidecar = (
                candidate.destination_root
                / "identity/front_3quarter_sw.png.import"
            )
            payload = (
                f"rollback import state:{candidate.spec.form_id}\n".encode("utf-8")
            )
            _write_bytes(sidecar, payload)
            sidecars[candidate.spec.form_id] = (
                sidecar.relative_to(candidate.destination_root),
                payload,
            )
        call_count = 0

        def fail_second(source: Path, destination: Path) -> None:
            nonlocal call_count
            call_count += 1
            if call_count == 2:
                raise OSError("injected legacy-upgrade rename failure")
            MODULE._rename_no_clobber(source, destination)

        with self.assertRaisesRegex(MODULE.RegistrationError, "rolled back"):
            self._run(write=True, rename_no_clobber=fail_second)
        self.assertEqual(call_count, 2)
        for candidate in candidates:
            self.assertEqual(
                MODULE._actual_destination_records(
                    candidate.destination_root,
                    allowed_sidecar_bases=MODULE._candidate_sidecar_bases(
                        candidate
                    ),
                ),
                candidate.legacy_expected_records,
            )
            sidecar_relative, sidecar_payload = sidecars[candidate.spec.form_id]
            self.assertEqual(
                (candidate.destination_root / sidecar_relative).read_bytes(),
                sidecar_payload,
            )
        recovery_roots = list(
            (self.root / ".run/recovery/fusion-pet-closed-registration").glob(
                "upgrade-*"
            )
        )
        self.assertEqual(len(recovery_roots), 1)
        receipt = json.loads(
            (recovery_roots[0] / "upgrade-receipt.json").read_text(encoding="utf-8")
        )
        self.assertEqual(receipt["status"], "rolled_back")
        for candidate in candidates:
            receipt_by_form = {
                form["formId"]: form for form in receipt["forms"]
            }
            evidence = receipt_by_form[candidate.spec.form_id][
                "generatedImportSidecars"
            ]
            self.assertEqual(evidence["count"], 1)
            sidecar_relative, sidecar_payload = sidecars[candidate.spec.form_id]
            self.assertTrue(
                (
                    recovery_roots[0]
                    / "backup"
                    / candidate.spec.form_id
                    / MODULE.MANIFEST_RELATIVE
                ).is_file()
            )
            self.assertEqual(
                (
                    recovery_roots[0]
                    / "backup"
                    / candidate.spec.form_id
                    / sidecar_relative
                ).read_bytes(),
                sidecar_payload,
            )

    def test_orphan_generated_import_sidecar_is_refused(self) -> None:
        self._materialize_legacy_destinations()
        destination = (
            self.destination_base / MODULE.FORM_SPECS[0].form_id
        )
        _write_bytes(destination / "identity/orphan.png.import", b"orphan\n")
        with self.assertRaisesRegex(
            MODULE.RegistrationError,
            "orphan or unregistered Godot .import sidecar",
        ):
            self._run(write=False)

    def test_uppercase_import_suffix_is_product_drift(self) -> None:
        self._materialize_legacy_destinations()
        destination = (
            self.destination_base / MODULE.FORM_SPECS[0].form_id
        )
        _write_bytes(
            destination / "identity/front_3quarter_sw.png.IMPORT",
            b"not a Godot sidecar\n",
        )
        with self.assertRaisesRegex(MODULE.RegistrationError, "destination drift"):
            self._run(write=False)

    def test_completed_receipt_write_failure_rolls_back_both_roots(self) -> None:
        candidates = self._materialize_previous_destinations()
        real_writer = MODULE._write_recovery_receipt

        def fail_completed_receipt(path: Path, value: dict[str, Any]) -> str:
            if value["status"] == "completed":
                raise OSError("injected completed-receipt write failure")
            return real_writer(path, value)

        with (
            mock.patch.object(
                MODULE,
                "_write_recovery_receipt",
                side_effect=fail_completed_receipt,
            ),
            self.assertRaisesRegex(MODULE.RegistrationError, "rolled back"),
        ):
            self._run(write=True)

        for candidate in candidates:
            self.assertEqual(
                MODULE._actual_destination_records(candidate.destination_root),
                candidate.previous_expected_records,
            )
        recovery_roots = list(
            (self.root / ".run/recovery/fusion-pet-closed-registration").glob(
                "upgrade-*"
            )
        )
        self.assertEqual(len(recovery_roots), 1)
        receipt = json.loads(
            (recovery_roots[0] / "upgrade-receipt.json").read_text(
                encoding="utf-8"
            )
        )
        self.assertEqual(receipt["status"], "rolled_back")
        self.assertIn("completed-receipt write failure", receipt["error"])
        for form in receipt["forms"]:
            self.assertTrue(form["retainedInRecovery"])
            backup = form["recoveryRetention"]["backup"]
            moved_original = form["recoveryRetention"]["movedOriginal"]
            self.assertTrue(backup["exists"])
            self.assertEqual(backup["kind"], "directory")
            self.assertRegex(backup["fileSetSha256"], r"^[0-9a-f]{64}$")
            self.assertFalse(moved_original["exists"])

    def test_source_symlink_is_rejected_before_any_write(self) -> None:
        solar = MODULE.FORM_SPECS[0]
        root = self.source_base / solar.source_slug / "pet-root"
        target = root / "identity/front_3quarter_sw.png"
        link = root / "identity/unsafe-link.png"
        link.symlink_to(target.name)
        with self.assertRaisesRegex(MODULE.RegistrationError, "unsafe file"):
            self._run(write=True)
        for spec in MODULE.FORM_SPECS:
            self.assertFalse((self.destination_base / spec.form_id).exists())

    def test_exact_destination_drift_is_refused_after_registration(self) -> None:
        self._run(write=True)
        destination = self.destination_base / MODULE.FORM_SPECS[0].form_id
        _write_bytes(destination / "identity/front_3quarter_sw.png", b"drift\n")
        with self.assertRaisesRegex(MODULE.RegistrationError, "destination drift"):
            self._run(write=False)


if __name__ == "__main__":
    unittest.main()
