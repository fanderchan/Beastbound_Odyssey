#!/usr/bin/env python3
"""Contract tests for tools/verify_pet_fusion_closed_release.py."""

from __future__ import annotations

from contextlib import contextmanager, redirect_stdout
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest import mock
from typing import Any, Iterator


REPO_ROOT = Path(__file__).resolve().parents[2]
TOOL_PATH = REPO_ROOT / "tools/verify_pet_fusion_closed_release.py"
SPEC = importlib.util.spec_from_file_location(
    "verify_pet_fusion_closed_release",
    TOOL_PATH,
)
assert SPEC is not None and SPEC.loader is not None
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


def _write_bytes(path: Path, payload: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(payload)


def _write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(MODULE._json_bytes(value))


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _pipeline_replay_sha(payload: bytes, *, raw_source: Path) -> str:
    value = json.loads(payload.decode("utf-8"))
    value["input"] = str(raw_source.resolve())
    replay_payload = (
        json.dumps(
            value,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        )
        + "\n"
    ).encode("utf-8")
    return hashlib.sha256(replay_payload).hexdigest()


def _record(root: Path, relative: str) -> dict[str, Any]:
    path = root / relative
    return {
        "path": relative,
        "sha256": _sha256(path),
        "size": path.stat().st_size,
    }


def _refresh_manifest_snapshots(manifest: dict[str, Any]) -> None:
    manifest["sourceSnapshotSha256"] = MODULE._sha256_bytes(
        MODULE._json_bytes(
            [
                *manifest["copiedFiles"],
                *manifest["portrait"]["excludedFiles"],
            ]
        )
    )
    source_records = {
        item["path"]: {
            "path": item["path"],
            "sha256": item["sourceMetadataSha256"],
            "size": item["sourceMetadataSize"],
        }
        for item in [
            *manifest["engineeringRelocations"],
            *manifest["engineeringIntegrityUpdates"],
        ]
    }
    isolated_copied = [
        source_records.get(record["path"], record)
        for record in manifest["copiedFiles"]
    ]
    manifest["isolatedSourceSnapshotSha256"] = MODULE._sha256_bytes(
        MODULE._json_bytes(
            [
                *isolated_copied,
                *manifest["portrait"]["excludedFiles"],
            ]
        )
    )


def _refresh_action_transformation(
    root: Path,
    manifest: dict[str, Any],
    *,
    replay_source: bool = True,
) -> None:
    action_relative = "action-bundle-meta.json"
    action_payload = (root / action_relative).read_bytes()
    action_text = action_payload.decode("utf-8")
    action_update = next(
        item
        for item in manifest["engineeringIntegrityUpdates"]
        if item["path"] == action_relative
    )
    if replay_source:
        source_text = action_text
        for field_update in action_update["fieldUpdates"]:
            source_token = json.dumps(field_update["from"], ensure_ascii=False)
            candidate_token = json.dumps(field_update["to"], ensure_ascii=False)
            if source_text.count(candidate_token) != 1:
                raise AssertionError(
                    f"fixture action token count drift: {field_update['field']}"
                )
            source_text = source_text.replace(candidate_token, source_token, 1)
        source_payload = source_text.encode("utf-8")
        action_update["sourceMetadataSha256"] = hashlib.sha256(
            source_payload
        ).hexdigest()
        action_update["sourceMetadataSize"] = len(source_payload)
    action_update["candidateMetadataSha256"] = hashlib.sha256(
        action_payload
    ).hexdigest()
    action_update["candidateMetadataSize"] = len(action_payload)
    replacement = _record(root, action_relative)
    for collection_name in (
        "copiedFiles",
        "ownerApprovedVisualFiles",
        "engineeringSupportFiles",
    ):
        for index, record in enumerate(manifest[collection_name]):
            if record["path"] == action_relative:
                manifest[collection_name][index] = replacement
    _refresh_manifest_snapshots(manifest)


def _fixture_art_form(spec: Any) -> dict[str, Any]:
    root = spec.root_relative.as_posix()
    return {
        "formId": spec.form_id,
        "displayName": spec.display_name,
        "lineId": "emberhorn",
        "subtypeId": spec.subtype_id,
        "productionGroup": spec.production_group,
        "artSkeletonId": spec.art_skeleton_id,
        "status": "in_production",
        "runtimeEnabled": False,
        "rideableTarget": False,
        "supportedCharacterIds": [],
        "identityBrief": spec.identity_brief,
        "pet": {
            "root": root,
            "portraitPath": f"{root}/portrait/default.png",
            "metadataPath": f"{root}/action-bundle-meta.json",
            "identityPath": f"{root}/identity/identity-lock.md",
            "ownershipPath": f"{root}/identity/source-and-ownership.md",
            "promptPath": f"{root}/prompts/identity.txt",
        },
    }


def _fixture_recipe(spec: Any) -> dict[str, Any]:
    emberhorn_genes = [
        "fusion_gene_emberhorn_red_v1",
        "fusion_gene_emberhorn_ash_v1",
        "fusion_gene_emberhorn_gale_v1",
    ]
    mossback_genes = [
        "fusion_gene_mossback_marsh_v1",
        "fusion_gene_mossback_sunbaked_v1",
    ]
    is_solar = spec.form_id == "emberhorn_fusion_solar_crown_fire7_wind3"
    resonance_one_genes = emberhorn_genes if is_solar else mossback_genes
    return {
        "recipeId": spec.recipe_id,
        "targetFormId": spec.form_id,
        "targetGrowthProfileId": spec.growth_profile_id,
        "roleGeneRules": {
            "core": {
                "allowedLineageIds": ["emberhorn"],
                "allowedGeneProfileIds": emberhorn_genes,
            },
            "resonance_one": {
                "allowedLineageIds": ["emberhorn" if is_solar else "mossback"],
                "allowedGeneProfileIds": resonance_one_genes,
            },
            "resonance_two": {
                "allowedLineageIds": ["emberhorn", "mossback"],
                "allowedGeneProfileIds": [*emberhorn_genes, *mossback_genes],
            },
        },
        "result": {
            "level": 1,
            "rebirthCount": 1,
            "terminalPathId": "fusion_terminal_v1",
            "paidResetAllowed": False,
            "newInstanceRequired": True,
            "numericSource": "target_profile_only_v1",
            "rideable": False,
            "bindingPolicy": "bound_if_any_material_bound",
            "resultStatePolicy": "replace_active_else_core_state",
        },
        "assetGate": {
            "status": "formal",
            "replacementPath": spec.root_relative.as_posix(),
        },
    }


def _fixture_auxiliary_portrait_references(
    spec: Any,
) -> list[dict[str, Any]]:
    if spec.form_id != "emberhorn_fusion_solar_crown_fire7_wind3":
        return []
    return [
        {
            "index": 1,
            "pathLabel": (
                ".codex/generated_images/"
                "019fa946-616c-7dd0-ab02-17e6356c5aea/"
                "call_dxUvn2b9rpdSJAXgbT8G5Mp3.png"
            ),
            "role": "codex_generated_iteration_reference",
            "matchesDeclaredIdentityReference": False,
            "currentFileSha256": (
                "3fa0d3e3443895b0a89466b92797412b0311d6fb94f71cba2087115146bd1a88"
            ),
            "currentFileByteLength": 1972736,
            "currentFileWidth": 1254,
            "currentFileHeight": 1254,
            "currentFileFormat": "PNG",
            "currentFileMode": "RGB",
            "historicalRequestBytesVerified": False,
        }
    ]


class ClosedFusionReleaseVerifierTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name).resolve()

        phase_path = self.root / MODULE.PHASE_RECORD_RELATIVE
        _write_bytes(phase_path, b"fixture frozen owner phase record\n")
        self.phase_sha = _sha256(phase_path)
        with mock.patch.object(
            MODULE,
            "PHASE_RECORD_SHA256",
            self.phase_sha,
        ):
            owner_decision = MODULE._expected_owner_decision()
        owner_path = self.root / MODULE.OWNER_DECISION_RELATIVE
        _write_json(owner_path, owner_decision)
        self.owner_sha = _sha256(owner_path)

        self._write_art_catalog()
        self._write_fusion_catalog()
        for spec in MODULE.FORM_SPECS:
            self._write_form_root(spec)
        self.expected_replay_sha = {}
        for spec in MODULE.FORM_SPECS:
            manifest = json.loads(
                (self.root / spec.manifest_relative).read_text(
                    encoding="utf-8"
                )
            )
            replay_update = manifest["engineeringIntegrityUpdates"][1][
                "fieldUpdates"
            ][1]
            self.expected_replay_sha[spec.form_id] = (
                replay_update["from"],
                replay_update["to"],
            )
        self.art_slice_sha = self._art_slice_sha()
        self.fusion_slice_sha = self._fusion_slice_sha()

    def _write_art_catalog(self) -> None:
        _write_json(
            self.root / MODULE.ART_CATALOG_RELATIVE,
            {
                "schemaVersion": 1,
                "defaultCharacterId": "fixture_character",
                "forms": [
                    _fixture_art_form(MODULE.FORM_SPECS[1]),
                    _fixture_art_form(MODULE.FORM_SPECS[0]),
                ],
            },
        )

    @staticmethod
    def _gene_profile(gene_id: str) -> dict[str, Any]:
        return {
            "geneProfileId": gene_id,
            "lineageId": "mossback" if "mossback" in gene_id else "emberhorn",
            "materialClass": "ordinary",
        }

    def _write_fusion_catalog(self) -> None:
        _write_json(
            self.root / MODULE.FUSION_CATALOG_RELATIVE,
            {
                "schemaVersion": 2,
                "catalogId": "pet_fusion_recipes_v2",
                "runtimeEnabled": False,
                "disabledMessage": "fixture closed",
                "rules": {"resultRideable": False},
                "geneProfiles": [
                    self._gene_profile(gene_id)
                    for gene_id in reversed(MODULE.ALL_GENE_IDS)
                ],
                "recipes": [
                    _fixture_recipe(spec) for spec in MODULE.FORM_SPECS
                ],
            },
        )

    def _write_form_root(self, spec: Any) -> None:
        root = self.root / spec.root_relative
        source_root = (
            f".run/p1_4e_fusion_full_pack/{spec.source_slug}/pet-root"
        )
        destination_root = spec.root_relative.as_posix()
        raw_payload = f"fixture raw identity board {spec.form_id}\n".encode("utf-8")
        raw_sha = hashlib.sha256(raw_payload).hexdigest()
        source_pipeline_payload = MODULE._json_bytes(
            {
                "input": f"{source_root}/source/identity-board-raw.png",
                "inputSha256": raw_sha,
            }
        )
        candidate_pipeline_payload = MODULE._json_bytes(
            {
                "input": f"{destination_root}/source/identity-board-raw.png",
                "inputSha256": raw_sha,
            }
        )
        source_pipeline_sha = hashlib.sha256(source_pipeline_payload).hexdigest()
        candidate_pipeline_sha = hashlib.sha256(
            candidate_pipeline_payload
        ).hexdigest()
        source_pipeline_replay_sha = _pipeline_replay_sha(
            source_pipeline_payload,
            raw_source=(
                self.root
                / source_root
                / "source/identity-board-raw.png"
            ),
        )
        candidate_pipeline_replay_sha = _pipeline_replay_sha(
            candidate_pipeline_payload,
            raw_source=root / "source/identity-board-raw.png",
        )
        source_meta_payload = MODULE._json_bytes(
            {
                "pipelineMetadata": "source/identity-board-pipeline-meta.json",
                "pipelineMetadataSha256": source_pipeline_sha,
            }
        )
        candidate_meta_payload = MODULE._json_bytes(
            {
                "pipelineMetadata": "source/identity-board-pipeline-meta.json",
                "pipelineMetadataSha256": candidate_pipeline_sha,
            }
        )
        source_action_payload = MODULE._json_bytes(
            {
                "formId": spec.form_id,
                "runtimeEnabled": False,
                "rideableTarget": False,
                "ownerReviewStatus": "pending",
                "evidence": {
                    "identityGateAudit": {
                        "pipelineMetadata": {
                            "sha256": source_pipeline_sha,
                            "metadataReplaySha256": source_pipeline_replay_sha,
                        }
                    }
                },
            }
        )
        candidate_action_text = source_action_payload.decode("utf-8")
        for source_value, candidate_value in (
            (source_pipeline_sha, candidate_pipeline_sha),
            (source_pipeline_replay_sha, candidate_pipeline_replay_sha),
        ):
            source_token = json.dumps(source_value, ensure_ascii=False)
            candidate_token = json.dumps(candidate_value, ensure_ascii=False)
            self.assertEqual(candidate_action_text.count(source_token), 1)
            candidate_action_text = candidate_action_text.replace(
                source_token,
                candidate_token,
                1,
            )
        candidate_action_payload = candidate_action_text.encode("utf-8")
        copied_payloads = {
            "action-bundle-meta.json": candidate_action_payload,
            "identity/front_3quarter_sw.png": (
                f"fixture owner visual {spec.form_id}\n".encode("utf-8")
            ),
            "identity/identity-lock.md": (
                f"fixture engineering support {spec.form_id}\n".encode("utf-8")
            ),
            "identity/source-and-ownership.md": (
                f"fixture identity ownership {spec.form_id}\n".encode("utf-8")
            ),
            "prompts/identity.txt": (
                f"fixture identity prompt {spec.form_id}\n".encode("utf-8")
            ),
            "source/identity-board-pipeline-meta.json": (
                candidate_pipeline_payload
            ),
            "source/identity-board-raw.png": raw_payload,
            "source/identity-board-source-meta.json": candidate_meta_payload,
        }
        for relative, payload in copied_payloads.items():
            _write_bytes(root / relative, payload)
        copied = sorted(
            (_record(root, relative) for relative in copied_payloads),
            key=lambda item: item["path"],
        )
        owner_visual = [
            record
            for record in copied
            if record["path"] == "identity/front_3quarter_sw.png"
        ]
        engineering = [
            record
            for record in copied
            if record["path"] != "identity/front_3quarter_sw.png"
        ]
        excluded_payload = (
            f"excluded portrait fixture {spec.form_id}\n".encode("utf-8")
        )
        excluded = [
            {
                "path": "portrait/default.png",
                "sha256": hashlib.sha256(excluded_payload).hexdigest(),
                "size": len(excluded_payload),
            }
        ]
        manifest = {
            "schemaVersion": 1,
            "manifestType": "fusion_pet_closed_asset_copy_registration",
            "tool": "register_fusion_pet_closed_assets.py",
            "formId": spec.form_id,
            "displayName": spec.display_name,
            "sourceRoot": source_root,
            "destinationRoot": destination_root,
            "lifecycle": MODULE._expected_manifest_lifecycle(),
            "frozenOwnerApproval": {
                "ownerDecision": {
                    "path": MODULE.OWNER_DECISION_RELATIVE.as_posix(),
                    "sha256": self.owner_sha,
                },
                "ownerReviewVideo": {
                    "path": MODULE.OWNER_REVIEW_VIDEO_RELATIVE,
                    "sha256": MODULE.OWNER_REVIEW_VIDEO_SHA256,
                    "playbackSpeed": "1.00x",
                },
                "scope": list(MODULE.OWNER_APPROVED_SCOPES),
                "excludedScope": list(MODULE.OWNER_EXCLUDED_SCOPES),
                "phase371BattleBundleDigest": spec.battle_bundle_digest,
            },
            "validatedMatrices": {
                "identityVisualFiles": 5,
                "worldRuntimeFrames": 40,
                "worldSourceFrames": 40,
                "battleRuntimeFrames": 180,
                "battleSourceFrames": 180,
                "mountedFiles": 0,
            },
            "portrait": {
                "status": "pending_formal_rebuild_and_owner_review",
                "builder": "build_pet_portrait",
                "copied": False,
                "excludedFiles": excluded,
            },
            "sourceSnapshotSha256": MODULE._sha256_bytes(
                MODULE._json_bytes([*copied, *excluded])
            ),
            "copiedFiles": copied,
            "ownerApprovedVisualFiles": owner_visual,
            "engineeringSupportFiles": engineering,
            "engineeringRelocations": [
                {
                    "path": "source/identity-board-pipeline-meta.json",
                    "field": "input",
                    "from": f"{source_root}/source/identity-board-raw.png",
                    "to": f"{destination_root}/source/identity-board-raw.png",
                    "sourceMetadataSha256": source_pipeline_sha,
                    "sourceMetadataSize": len(source_pipeline_payload),
                    "candidateMetadataSha256": candidate_pipeline_sha,
                    "candidateMetadataSize": len(candidate_pipeline_payload),
                    "inputAsset": {
                        "path": (
                            f"{destination_root}/source/identity-board-raw.png"
                        ),
                        "sha256": raw_sha,
                    },
                }
            ],
            "engineeringIntegrityUpdates": [
                {
                    "path": "source/identity-board-source-meta.json",
                    "field": "pipelineMetadataSha256",
                    "from": source_pipeline_sha,
                    "to": candidate_pipeline_sha,
                    "fieldUpdates": [
                        {
                            "field": "pipelineMetadataSha256",
                            "digestKind": "file_sha256",
                            "from": source_pipeline_sha,
                            "to": candidate_pipeline_sha,
                        }
                    ],
                    "sourceMetadataSha256": hashlib.sha256(
                        source_meta_payload
                    ).hexdigest(),
                    "sourceMetadataSize": len(source_meta_payload),
                    "candidateMetadataSha256": hashlib.sha256(
                        candidate_meta_payload
                    ).hexdigest(),
                    "candidateMetadataSize": len(candidate_meta_payload),
                    "boundFile": {
                        "path": (
                            f"{destination_root}/source/"
                            "identity-board-pipeline-meta.json"
                        ),
                        "sha256": candidate_pipeline_sha,
                    },
                },
                {
                    "path": "action-bundle-meta.json",
                    "field": (
                        "evidence.identityGateAudit.pipelineMetadata.sha256"
                    ),
                    "from": source_pipeline_sha,
                    "to": candidate_pipeline_sha,
                    "fieldUpdates": [
                        {
                            "field": (
                                "evidence.identityGateAudit."
                                "pipelineMetadata.sha256"
                            ),
                            "digestKind": "file_sha256",
                            "from": source_pipeline_sha,
                            "to": candidate_pipeline_sha,
                        },
                        {
                            "field": (
                                "evidence.identityGateAudit.pipelineMetadata."
                                "metadataReplaySha256"
                            ),
                            "digestKind": (
                                "pipeline_metadata_replay_sha256"
                            ),
                            "from": source_pipeline_replay_sha,
                            "to": candidate_pipeline_replay_sha,
                        },
                    ],
                    "sourceMetadataSha256": hashlib.sha256(
                        source_action_payload
                    ).hexdigest(),
                    "sourceMetadataSize": len(source_action_payload),
                    "candidateMetadataSha256": hashlib.sha256(
                        candidate_action_payload
                    ).hexdigest(),
                    "candidateMetadataSize": len(candidate_action_payload),
                    "boundFile": {
                        "path": (
                            f"{destination_root}/source/"
                            "identity-board-pipeline-meta.json"
                        ),
                        "sha256": candidate_pipeline_sha,
                    },
                },
            ],
        }
        isolated_copied = [
            (
                {
                    "path": record["path"],
                    "sha256": source_pipeline_sha,
                    "size": len(source_pipeline_payload),
                }
                if record["path"]
                == "source/identity-board-pipeline-meta.json"
                else {
                    "path": record["path"],
                    "sha256": hashlib.sha256(source_meta_payload).hexdigest(),
                    "size": len(source_meta_payload),
                }
                if record["path"] == "source/identity-board-source-meta.json"
                else {
                    "path": record["path"],
                    "sha256": hashlib.sha256(source_action_payload).hexdigest(),
                    "size": len(source_action_payload),
                }
                if record["path"] == "action-bundle-meta.json"
                else record
            )
            for record in copied
        ]
        manifest["isolatedSourceSnapshotSha256"] = MODULE._sha256_bytes(
            MODULE._json_bytes([*isolated_copied, *excluded])
        )
        _write_json(root / MODULE.MANIFEST_RELATIVE, manifest)
        self._write_portrait(spec, root)

    def _write_portrait(self, spec: Any, root: Path) -> None:
        payloads = {
            "portrait/default.png": b"fixture runtime portrait\n",
            "portrait/source-and-ownership.md": b"fixture portrait ownership\n",
            "prompts/portrait-v1.txt": b"fixture portrait prompt\n",
            MODULE.QA_IMPORT_ISOLATION_CONTROL_PATH: (
                MODULE.QA_IMPORT_ISOLATION_CONTROL_BYTES
            ),
            "qa/portrait/contact-sheet.png": b"fixture portrait contact sheet\n",
            "source/portrait/headshot-alpha-mask.png": b"fixture alpha mask\n",
            "source/portrait/headshot-chroma-eligibility-mask.png": (
                b"fixture eligibility mask\n"
            ),
            "source/portrait/headshot-master-1024.png": b"fixture master\n",
            "source/portrait/headshot-original-generated.png": (
                b"fixture generated source\n"
            ),
            "source/portrait/headshot-raw-lossless.webp": b"fixture lossless\n",
        }
        for relative, payload in payloads.items():
            _write_bytes(root / relative, payload)
        identity_relative = "identity/front_3quarter_sw.png"
        identity_path = root / identity_relative
        identity_repository_path = (
            spec.root_relative / identity_relative
        ).as_posix()
        manifest_path = root / MODULE.MANIFEST_RELATIVE
        manifest_sha = _sha256(manifest_path)
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        integrity_by_path = {
            item["path"]: item
            for item in manifest["engineeringIntegrityUpdates"]
        }
        relocation = {
            "contract": "fusion_pet_formal_identity_relocation_v1",
            "formId": spec.form_id,
            "manifestPath": spec.manifest_relative.as_posix(),
            "manifestSha256": manifest_sha,
            "sourceRoot": (
                f".run/p1_4e_fusion_full_pack/{spec.source_slug}/pet-root"
            ),
            "destinationRoot": spec.root_relative.as_posix(),
            "identityRelativePath": identity_relative,
            "identitySha256": _sha256(identity_path),
            "identityByteLength": identity_path.stat().st_size,
            "ownerDecisionPath": MODULE.OWNER_DECISION_RELATIVE.as_posix(),
            "ownerDecisionSha256": self.owner_sha,
            "pipelineMetadataSha256": manifest[
                "engineeringRelocations"
            ][0]["candidateMetadataSha256"],
            "sourceMetadataSha256": integrity_by_path[
                "source/identity-board-source-meta.json"
            ]["candidateMetadataSha256"],
            "actionMetadataSha256": integrity_by_path[
                "action-bundle-meta.json"
            ]["candidateMetadataSha256"],
            "sourceSnapshotSha256": manifest["sourceSnapshotSha256"],
            "isolatedSourceSnapshotSha256": manifest[
                "isolatedSourceSnapshotSha256"
            ],
            "engineeringTransformCount": 3,
            "runtimeEnabled": False,
            "playerEntryOpened": False,
            "portraitOwnerApprovalExcluded": True,
        }
        action_path = root / "action-bundle-meta.json"
        lock_path = root / "identity/identity-lock.md"
        pipeline_path = root / "source/identity-board-pipeline-meta.json"
        ownership_path = root / "identity/source-and-ownership.md"
        prompt_path = root / "prompts/identity.txt"
        generation_path = root / "source/portrait/generation-attestation.json"
        _write_json(
            generation_path,
            {
                "schemaVersion": 3,
                "generator": "fixture",
                "compositionClaim": "dedicated_headshot",
                "independentlyAuthoredClaim": True,
                "semanticIndependenceVerified": False,
                "ownerReviewStatus": "owner_review_pending",
                "fullBodyCropAllowed": False,
                "releaseGate": False,
                "claimLimit": "fixture pending owner review",
                "identityReferencePath": identity_repository_path,
                "identityReferenceSha256": _sha256(identity_path),
                "identityEvidence": {
                    "contract": "pet_identity_bundle_binding_v1",
                    "bindingMode": "metadata_pose",
                    "formId": spec.form_id,
                    "bundleMetadataPath": (
                        spec.root_relative / "action-bundle-meta.json"
                    ).as_posix(),
                    "bundleMetadataSha256": _sha256(action_path),
                    "identityLockPath": (
                        spec.root_relative / "identity/identity-lock.md"
                    ).as_posix(),
                    "identityLockSha256": _sha256(lock_path),
                    "identityStatus": "self_review_passed_owner_pending",
                    "referenceRole": "front_3quarter_sw",
                    "referencePath": identity_repository_path,
                    "referenceSha256": _sha256(identity_path),
                    "pipelineMetadataPath": (
                        spec.root_relative
                        / "source/identity-board-pipeline-meta.json"
                    ).as_posix(),
                    "pipelineMetadataSha256": _sha256(pipeline_path),
                    "pipelinePixelHashVerified": True,
                    "currentReferencePixelBindingVerified": True,
                    "compatibilityLedger": None,
                    "catalogEvidence": {
                        "path": MODULE.ART_CATALOG_RELATIVE.as_posix(),
                        "formIdentitySliceSha256": (
                            MODULE._canonical_json_sha256(
                                _fixture_art_form(spec)
                            )
                        ),
                        "ownershipPath": (
                            spec.root_relative
                            / "identity/source-and-ownership.md"
                        ).as_posix(),
                        "ownershipSha256": _sha256(ownership_path),
                        "promptPath": (
                            spec.root_relative / "prompts/identity.txt"
                        ).as_posix(),
                        "promptSha256": _sha256(prompt_path),
                    },
                },
                "generationResultEvidence": {
                    "transcriptEvidence": {
                        "requestArgumentBinding": {
                            "requestArgumentBindingVerified": True,
                            "declaredIdentityReferenceIncluded": True,
                            "automaticApprovalEligible": False,
                            "currentReferencedImageContentBound": True,
                            "historicalReferencedImageBytesVerified": False,
                            "identityLineage": {
                                "contract": (
                                    "imagegen_request_identity_lineage_v1"
                                ),
                                "verified": True,
                                "mode": (
                                    "relocated_direct_declared_identity_reference"
                                ),
                                "predecessors": [],
                                "formalRelocations": [relocation],
                            },
                            "referencedImages": [
                                {
                                    "index": 0,
                                    "pathLabel": (
                                        "repository:.run/"
                                        "p1_4e_fusion_full_pack/"
                                        f"{spec.source_slug}/pet-root/"
                                        "identity/front_3quarter_sw.png"
                                    ),
                                    "role": (
                                        "relocated_declared_identity_reference"
                                    ),
                                    "matchesDeclaredIdentityReference": False,
                                    "currentFileSha256": _sha256(identity_path),
                                    "currentFileByteLength": (
                                        identity_path.stat().st_size
                                    ),
                                    "currentFileWidth": 512,
                                    "currentFileHeight": 512,
                                    "currentFileFormat": "PNG",
                                    "currentFileMode": "RGBA",
                                    "historicalRequestBytesVerified": False,
                                    "formalIdentityRelocation": relocation,
                                },
                                *_fixture_auxiliary_portrait_references(
                                    spec
                                ),
                            ],
                        }
                    }
                },
            },
        )

        def asset(relative: str) -> dict[str, str]:
            return {
                "path": (spec.root_relative / relative).as_posix(),
                "sha256": _sha256(root / relative),
            }

        _write_json(
            root / "portrait/portrait-meta.json",
            {
                "schemaVersion": 1,
                "tool": "build_pet_portrait.py",
                "formId": spec.form_id,
                "capability": "shared_dedicated_headshot_v1",
                "independentlyAuthoredClaim": True,
                "independentAuthorshipClaimTrust": "untrusted_claim",
                "semanticIndependenceVerified": False,
                "fullBodyCropAllowed": False,
                "releaseGate": False,
                "claimLimit": "fixture pending owner review",
                "identityReference": asset(identity_relative),
                "catalogBinding": {
                    "mode": "pet_art_catalog_explicit",
                    "catalogPath": MODULE.ART_CATALOG_RELATIVE.as_posix(),
                    "petRoot": spec.root_relative.as_posix(),
                },
                "source": {
                    "generationAttestation": asset(
                        "source/portrait/generation-attestation.json"
                    )
                },
                "assets": {
                    "originalGeneratedPng": asset(
                        "source/portrait/headshot-original-generated.png"
                    ),
                    "rawLossless": asset(
                        "source/portrait/headshot-raw-lossless.webp"
                    ),
                    "master": asset(
                        "source/portrait/headshot-master-1024.png"
                    ),
                    "runtime": asset("portrait/default.png"),
                    "eligibilityMask": asset(
                        "source/portrait/headshot-chroma-eligibility-mask.png"
                    ),
                    "alphaMask": asset(
                        "source/portrait/headshot-alpha-mask.png"
                    ),
                },
                "ownership": asset("portrait/source-and-ownership.md"),
                "prompt": asset("prompts/portrait-v1.txt"),
                "evidence": {
                    "contactSheet": asset("qa/portrait/contact-sheet.png")
                },
                "ownerReview": {
                    "required": True,
                    "status": "owner_review_pending",
                    "evidencePaths": [],
                },
            },
        )

    def _art_slice_sha(self) -> str:
        catalog = json.loads(
            (self.root / MODULE.ART_CATALOG_RELATIVE).read_text(encoding="utf-8")
        )
        value = {key: item for key, item in catalog.items() if key != "forms"}
        value["forms"] = sorted(
            catalog["forms"],
            key=lambda item: item["formId"],
        )
        return MODULE._canonical_json_sha256(value)

    def _fusion_slice_sha(self) -> str:
        catalog = json.loads(
            (self.root / MODULE.FUSION_CATALOG_RELATIVE).read_text(
                encoding="utf-8"
            )
        )
        value = {
            key: item
            for key, item in catalog.items()
            if key not in {"geneProfiles", "recipes"}
        }
        value["geneProfiles"] = sorted(
            catalog["geneProfiles"],
            key=lambda item: item["geneProfileId"],
        )
        value["recipes"] = sorted(
            catalog["recipes"],
            key=lambda item: item["recipeId"],
        )
        return MODULE._canonical_json_sha256(value)

    @contextmanager
    def _contract(self) -> Iterator[None]:
        with (
            mock.patch.object(MODULE, "OWNER_DECISION_SHA256", self.owner_sha),
            mock.patch.object(
                MODULE,
                "PHASE_RECORD_SHA256",
                self.phase_sha,
            ),
            mock.patch.object(
                MODULE,
                "EXPECTED_ART_CATALOG_SLICE_SHA256",
                self.art_slice_sha,
            ),
            mock.patch.object(
                MODULE,
                "EXPECTED_FUSION_CATALOG_SLICE_SHA256",
                self.fusion_slice_sha,
            ),
            mock.patch.object(
                MODULE,
                "EXPECTED_PIPELINE_REPLAY_SHA256",
                self.expected_replay_sha,
            ),
            mock.patch.object(MODULE, "EXPECTED_COPIED_FILE_COUNT", 8),
            mock.patch.object(
                MODULE,
                "EXPECTED_OWNER_APPROVED_VISUAL_FILE_COUNT",
                1,
            ),
            mock.patch.object(
                MODULE,
                "EXPECTED_ENGINEERING_SUPPORT_FILE_COUNT",
                7,
            ),
            mock.patch.object(
                MODULE,
                "EXPECTED_EXCLUDED_PORTRAIT_FILE_COUNT",
                1,
            ),
            mock.patch.object(
                MODULE,
                "EXPECTED_OWNER_VISUAL_PATHS",
                frozenset({"identity/front_3quarter_sw.png"}),
            ),
            mock.patch.object(
                MODULE,
                "EXPECTED_ENGINEERING_SUPPORT_PATHS",
                frozenset(
                    {
                        "action-bundle-meta.json",
                        "identity/identity-lock.md",
                        "identity/source-and-ownership.md",
                        "prompts/identity.txt",
                        "source/identity-board-pipeline-meta.json",
                        "source/identity-board-raw.png",
                        "source/identity-board-source-meta.json",
                    }
                ),
            ),
            mock.patch.object(
                MODULE,
                "EXPECTED_EXCLUDED_PORTRAIT_PATHS",
                frozenset({"portrait/default.png"}),
            ),
            mock.patch.object(
                MODULE,
                "_validate_git_index_inventory",
                return_value=True,
            ),
            mock.patch.object(
                MODULE,
                "_validate_git_index_authorities",
                return_value=True,
            ),
        ):
            yield

    def _verify(self, json_out: Path | None = None) -> dict[str, Any]:
        with self._contract():
            return MODULE.run(repo_root=self.root, json_out=json_out)

    def test_valid_state_reports_closed_gates_and_current_manifest_hashes(
        self,
    ) -> None:
        report = self._verify()
        self.assertEqual(report["status"], "PASS")
        self.assertTrue(report["closedRegistrationVerified"])
        self.assertFalse(report["releaseApproved"])
        self.assertFalse(report["runtimeEnabled"])
        self.assertFalse(report["playerEntryOpened"])
        self.assertFalse(report["portraitReleaseGate"])
        self.assertTrue(report["gitIndexAuthorityVerified"])
        self.assertEqual(report["summary"]["formsVerified"], 2)
        self.assertEqual(report["summary"]["copiedFilesVerified"], 16)
        self.assertEqual(report["summary"]["portraitFilesVerified"], 22)
        self.assertEqual(
            report["summary"]["qaImportIsolationControlsVerified"],
            2,
        )
        for form, spec in zip(report["forms"], MODULE.FORM_SPECS):
            self.assertEqual(form["formId"], spec.form_id)
            self.assertEqual(
                form["registrationManifest"]["sha256"],
                _sha256(self.root / spec.manifest_relative),
            )
            self.assertEqual(form["portrait"]["status"], "owner_review_pending")
            self.assertFalse(form["portrait"]["releaseGate"])
            self.assertEqual(
                form["qaImportIsolationControl"],
                {
                    "path": MODULE.QA_IMPORT_ISOLATION_CONTROL_PATH,
                    "sha256": MODULE.QA_IMPORT_ISOLATION_CONTROL_SHA256,
                    "size": MODULE.QA_IMPORT_ISOLATION_CONTROL_SIZE,
                    "gitTracked": True,
                },
            )

    def test_checkout_relocation_preserves_frozen_replay_evidence(self) -> None:
        original_root = self.root
        relocated_root = original_root.with_name(
            f"{original_root.name}-relocated"
        )
        shutil.copytree(original_root, relocated_root)
        self.addCleanup(shutil.rmtree, relocated_root, True)
        self.root = relocated_root

        report = self._verify()

        self.assertEqual(report["status"], "PASS")
        self.assertTrue(report["closedRegistrationVerified"])

    def test_coordinated_candidate_replay_digest_tamper_cannot_rewrite_source(
        self,
    ) -> None:
        spec = MODULE.FORM_SPECS[0]
        root = self.root / spec.root_relative
        manifest_path = self.root / spec.manifest_relative
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        replay_update = manifest["engineeringIntegrityUpdates"][1][
            "fieldUpdates"
        ][1]
        frozen_replay_sha = (
            replay_update["from"],
            replay_update["to"],
        )
        forged_candidate_replay = "1" * 64
        replay_update["to"] = forged_candidate_replay

        action_path = root / "action-bundle-meta.json"
        action = json.loads(action_path.read_text(encoding="utf-8"))
        action["evidence"]["identityGateAudit"]["pipelineMetadata"][
            "metadataReplaySha256"
        ] = forged_candidate_replay
        _write_json(action_path, action)
        _refresh_action_transformation(
            root,
            manifest,
            replay_source=False,
        )
        copied_map = {
            record["path"]: record
            for record in manifest["copiedFiles"]
        }

        with (
            mock.patch.object(
                MODULE,
                "EXPECTED_PIPELINE_REPLAY_SHA256",
                {spec.form_id: frozen_replay_sha},
            ),
            self.assertRaisesRegex(
                MODULE.VerificationError,
                "action metadata replay update drift",
            ),
        ):
            MODULE._validate_engineering_transformations(
                self.root,
                root,
                spec,
                manifest,
                copied_map,
            )

    def test_json_out_is_no_clobber_json_only_and_confined_to_audit(self) -> None:
        report = self._verify(Path(".run/audit/fusion-closed.json"))
        output = self.root / report["jsonOut"]
        self.assertTrue(output.is_file())
        stored = json.loads(output.read_text(encoding="utf-8"))
        self.assertEqual(stored["status"], "PASS")
        self.assertNotIn("jsonOut", stored)
        original_payload = output.read_bytes()
        with self.assertRaisesRegex(MODULE.VerificationError, "refuses to overwrite"):
            self._verify(Path(".run/audit/fusion-closed.json"))
        self.assertEqual(output.read_bytes(), original_payload)
        with self.assertRaisesRegex(MODULE.VerificationError, "must stay under"):
            self._verify(Path("client/godot/data/forbidden-report.json"))
        with self.assertRaisesRegex(MODULE.VerificationError, "must stay under"):
            self._verify(Path(".run/evidence/frozen-proof.json"))
        with self.assertRaisesRegex(MODULE.VerificationError, r"\.json filename"):
            self._verify(Path(".run/audit/frozen-proof.mp4"))

        external = self.root / "external-output"
        external.mkdir()
        symlink_parent = self.root / ".run/audit/symlink-parent"
        symlink_parent.symlink_to(external, target_is_directory=True)
        with self.assertRaisesRegex(MODULE.VerificationError, "may not traverse"):
            self._verify(Path(".run/audit/symlink-parent/report.json"))

        external_target = external / "do-not-overwrite.json"
        external_target.write_bytes(b"frozen external evidence\n")
        target_symlink = self.root / ".run/audit/target-link.json"
        target_symlink.symlink_to(external_target)
        with self.assertRaisesRegex(MODULE.VerificationError, "refuses to overwrite"):
            self._verify(Path(".run/audit/target-link.json"))
        self.assertEqual(
            external_target.read_bytes(),
            b"frozen external evidence\n",
        )

        race_parent = self.root / ".run/audit/race-parent"
        race_parent.mkdir()
        race_output = MODULE._secure_report_path(
            self.root,
            Path(".run/audit/race-parent/report.json"),
        )
        preserved_parent = self.root / ".run/audit/race-parent-preserved"
        race_parent.rename(preserved_parent)
        race_external = self.root / "race-external"
        race_external.mkdir()
        race_parent.symlink_to(race_external, target_is_directory=True)
        with self.assertRaisesRegex(
            MODULE.VerificationError,
            "cannot write generated report",
        ):
            MODULE._write_report(
                self.root,
                race_output,
                b'{"status":"PASS"}\n',
            )
        self.assertFalse((race_external / "report.json").exists())

    def test_owner_decision_tamper_or_duplicate_json_key_fails_closed(self) -> None:
        owner_path = self.root / MODULE.OWNER_DECISION_RELATIVE
        owner = json.loads(owner_path.read_text(encoding="utf-8"))
        owner["runtimeEnabled"] = True
        _write_json(owner_path, owner)
        with self.assertRaisesRegex(MODULE.VerificationError, "owner decision SHA"):
            self._verify()

        with mock.patch.object(MODULE, "PHASE_RECORD_SHA256", self.phase_sha):
            _write_json(owner_path, MODULE._expected_owner_decision())
        art_path = self.root / MODULE.ART_CATALOG_RELATIVE
        text = art_path.read_text(encoding="utf-8")
        text = text.replace(
            '"schemaVersion": 1,',
            '"schemaVersion": 1,\n  "schemaVersion": 1,',
            1,
        )
        art_path.write_text(text, encoding="utf-8")
        with self.assertRaisesRegex(MODULE.VerificationError, "duplicate JSON key"):
            self._verify()

    def test_missing_root_or_manifest_fails_closed(self) -> None:
        spec = MODULE.FORM_SPECS[0]
        root = self.root / spec.root_relative
        moved = root.with_name(f"{root.name}.missing")
        root.rename(moved)
        with self.assertRaisesRegex(MODULE.VerificationError, "production root"):
            self._verify()

    def test_manifest_missing_and_internal_closed_flags_fail_closed(self) -> None:
        spec = MODULE.FORM_SPECS[0]
        manifest_path = self.root / spec.manifest_relative
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest["lifecycle"]["playerEntryOpened"] = True
        _write_json(manifest_path, manifest)
        with self.assertRaisesRegex(MODULE.VerificationError, "lifecycle"):
            self._verify()
        manifest_path.unlink()
        with self.assertRaisesRegex(MODULE.VerificationError, "registration manifest"):
            self._verify()

    def test_copied_file_tamper_and_manifest_partition_tamper_fail_closed(self) -> None:
        spec = MODULE.FORM_SPECS[0]
        root = self.root / spec.root_relative
        copied_path = root / "identity/front_3quarter_sw.png"
        original = copied_path.read_bytes()
        _write_bytes(copied_path, b"tampered visual\n")
        with self.assertRaisesRegex(MODULE.VerificationError, "copiedFiles drift"):
            self._verify()
        _write_bytes(copied_path, original)

        manifest_path = root / MODULE.MANIFEST_RELATIVE
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest["engineeringSupportFiles"][0] = manifest[
            "ownerApprovedVisualFiles"
        ][0]
        _write_json(manifest_path, manifest)
        with self.assertRaisesRegex(MODULE.VerificationError, "partitions overlap"):
            self._verify()

    def test_equal_count_partition_swap_and_excluded_path_swap_fail_closed(
        self,
    ) -> None:
        spec = MODULE.FORM_SPECS[0]
        manifest_path = self.root / spec.manifest_relative
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest["ownerApprovedVisualFiles"][0], manifest[
            "engineeringSupportFiles"
        ][0] = (
            manifest["engineeringSupportFiles"][0],
            manifest["ownerApprovedVisualFiles"][0],
        )
        _write_json(manifest_path, manifest)
        with self.assertRaisesRegex(
            MODULE.VerificationError,
            "ownerApprovedVisualFiles path set drift",
        ):
            self._verify()

        self._write_form_root(spec)
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest["portrait"]["excludedFiles"][0]["path"] = (
            "portrait/forged-default.png"
        )
        _refresh_manifest_snapshots(manifest)
        _write_json(manifest_path, manifest)
        with self.assertRaisesRegex(
            MODULE.VerificationError,
            "excludedFiles path set drift",
        ):
            self._verify()

        self._write_form_root(spec)
        root = self.root / spec.root_relative
        old_path = "identity/identity-lock.md"
        forged_path = "identity/forged-support.md"
        (root / old_path).unlink()
        _write_bytes(root / forged_path, b"forged engineering support\n")
        forged_record = _record(root, forged_path)
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        for collection_name in ("copiedFiles", "engineeringSupportFiles"):
            manifest[collection_name] = sorted(
                [
                    forged_record if item["path"] == old_path else item
                    for item in manifest[collection_name]
                ],
                key=lambda item: item["path"],
            )
        _refresh_manifest_snapshots(manifest)
        _write_json(manifest_path, manifest)
        with self.assertRaisesRegex(
            MODULE.VerificationError,
            "engineeringSupportFiles path set drift",
        ):
            self._verify()

    def test_path_traversal_extra_file_and_mounted_art_fail_closed(self) -> None:
        spec = MODULE.FORM_SPECS[0]
        root = self.root / spec.root_relative
        manifest_path = root / MODULE.MANIFEST_RELATIVE
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest["copiedFiles"][0]["path"] = "../escape"
        _write_json(manifest_path, manifest)
        with self.assertRaisesRegex(MODULE.VerificationError, "safe relative path"):
            self._verify()

        self._write_form_root(spec)
        _write_bytes(root / "unexpected.txt", b"unexpected product file\n")
        with self.assertRaisesRegex(
            MODULE.VerificationError,
            "production root inventory drift",
        ):
            self._verify()
        (root / "unexpected.txt").unlink()

        art_path = self.root / MODULE.ART_CATALOG_RELATIVE
        art = json.loads(art_path.read_text(encoding="utf-8"))
        art["forms"][0]["mounted"] = {"root": "forbidden"}
        _write_json(art_path, art)
        with self.assertRaisesRegex(MODULE.VerificationError, "pet art catalog"):
            self._verify()

    def test_untracked_import_sidecar_is_ignored(self) -> None:
        spec = MODULE.FORM_SPECS[0]
        root = self.root / spec.root_relative
        _write_bytes(root / "portrait/default.png.import", b"derived sidecar\n")
        self.assertEqual(self._verify()["status"], "PASS")

    def test_art_or_fusion_runtime_enable_and_extra_recipe_fail_closed(self) -> None:
        art_path = self.root / MODULE.ART_CATALOG_RELATIVE
        art = json.loads(art_path.read_text(encoding="utf-8"))
        art["forms"][0]["runtimeEnabled"] = True
        _write_json(art_path, art)
        with self.assertRaisesRegex(MODULE.VerificationError, "pet art catalog"):
            self._verify()

        self._write_art_catalog()
        fusion_path = self.root / MODULE.FUSION_CATALOG_RELATIVE
        fusion = json.loads(fusion_path.read_text(encoding="utf-8"))
        fusion["runtimeEnabled"] = True
        _write_json(fusion_path, fusion)
        with self.assertRaisesRegex(MODULE.VerificationError, "runtimeEnabled"):
            self._verify()

        self._write_fusion_catalog()
        fusion = json.loads(fusion_path.read_text(encoding="utf-8"))
        extra = dict(fusion["recipes"][0])
        extra["recipeId"] = "forged_extra_recipe"
        fusion["recipes"].append(extra)
        _write_json(fusion_path, fusion)
        with self.assertRaisesRegex(MODULE.VerificationError, "exactly the two"):
            self._verify()

    def test_non_target_catalog_alias_to_frozen_root_fails_closed(self) -> None:
        art_path = self.root / MODULE.ART_CATALOG_RELATIVE
        art = json.loads(art_path.read_text(encoding="utf-8"))
        target_root = MODULE.FORM_SPECS[0].root_relative.as_posix()
        art["forms"].append(
            {
                "formId": "runtime_alias",
                "runtimeEnabled": True,
                "pet": {
                    "root": "client/godot/assets/pets/unrelated",
                    "portraitPath": f"{target_root}/portrait/default.png",
                },
            }
        )
        _write_json(art_path, art)
        with self.assertRaisesRegex(
            MODULE.VerificationError,
            "aliases a frozen fusion production contract",
        ):
            self._verify()

        self._write_art_catalog()
        art = json.loads(art_path.read_text(encoding="utf-8"))
        art["runtimeAliases"] = {
            "fusionPortrait": f"{target_root}/portrait/default.png"
        }
        _write_json(art_path, art)
        with self.assertRaisesRegex(
            MODULE.VerificationError,
            "outside its exact target form",
        ):
            self._verify()

        self._write_art_catalog()
        art = json.loads(art_path.read_text(encoding="utf-8"))
        art["forms"].append(
            {
                "formId": "case_variant_runtime_alias",
                "pet": {
                    "root": target_root.upper(),
                },
            }
        )
        _write_json(art_path, art)
        with self.assertRaisesRegex(
            MODULE.VerificationError,
            "aliases a frozen fusion production contract",
        ):
            self._verify()

        self._write_art_catalog()
        art = json.loads(art_path.read_text(encoding="utf-8"))
        art["forms"].append(
            {
                "formId": "res_runtime_alias",
                "pet": {
                    "portraitPath": (
                        "res://assets/pets/"
                        f"{MODULE.FORM_SPECS[0].form_id}/portrait/default.png"
                    )
                },
            }
        )
        _write_json(art_path, art)
        with self.assertRaisesRegex(
            MODULE.VerificationError,
            "outside its exact target form",
        ):
            self._verify()

    def test_all_copied_json_reject_duplicate_keys_and_open_flags(self) -> None:
        spec = MODULE.FORM_SPECS[0]
        root = self.root / spec.root_relative
        metadata_path = root / "action-bundle-meta.json"
        metadata_path.write_text(
            '{"formId":"%s","runtimeEnabled":false,'
            '"runtimeEnabled":false,"rideableTarget":false,'
            '"ownerReviewStatus":"pending"}\n' % spec.form_id,
            encoding="utf-8",
        )
        manifest_path = root / MODULE.MANIFEST_RELATIVE
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        _refresh_action_transformation(
            root,
            manifest,
            replay_source=False,
        )
        _write_json(manifest_path, manifest)
        with self.assertRaisesRegex(MODULE.VerificationError, "duplicate JSON key"):
            self._verify()

        self._write_form_root(spec)
        metadata_path = root / "action-bundle-meta.json"
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        metadata["nestedRelease"] = {"playerEntryOpened": True}
        _write_json(metadata_path, metadata)
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        _refresh_action_transformation(root, manifest)
        _write_json(manifest_path, manifest)
        with self.assertRaisesRegex(MODULE.VerificationError, "playerEntryOpened"):
            self._verify()

    def test_dual_snapshot_and_relocation_source_replay_fail_closed(self) -> None:
        spec = MODULE.FORM_SPECS[0]
        manifest_path = self.root / spec.manifest_relative
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest["isolatedSourceSnapshotSha256"] = "0" * 64
        _write_json(manifest_path, manifest)
        with self.assertRaisesRegex(
            MODULE.VerificationError,
            "isolatedSourceSnapshotSha256",
        ):
            self._verify()

        self._write_form_root(spec)
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        forged_source_sha = "0" * 64
        manifest["engineeringRelocations"][0][
            "sourceMetadataSha256"
        ] = forged_source_sha
        manifest["engineeringIntegrityUpdates"][0]["from"] = forged_source_sha
        _refresh_manifest_snapshots(manifest)
        _write_json(manifest_path, manifest)
        with self.assertRaisesRegex(
            MODULE.VerificationError,
            "cannot replay the declared isolated-source bytes",
        ):
            self._verify()

    def test_frozen_manifest_and_transformation_key_order_is_enforced(
        self,
    ) -> None:
        spec = MODULE.FORM_SPECS[0]
        manifest_path = self.root / spec.manifest_relative
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        reordered = {
            "isolatedSourceSnapshotSha256": manifest[
                "isolatedSourceSnapshotSha256"
            ],
            **{
                key: value
                for key, value in manifest.items()
                if key != "isolatedSourceSnapshotSha256"
            },
        }
        _write_json(manifest_path, reordered)
        with self.assertRaisesRegex(MODULE.VerificationError, "key order drift"):
            self._verify()

        self._write_form_root(spec)
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        action_update = manifest["engineeringIntegrityUpdates"][1]
        manifest["engineeringIntegrityUpdates"][1] = {
            key: action_update[key]
            for key in (
                "path",
                "field",
                "from",
                "to",
                "sourceMetadataSha256",
                "fieldUpdates",
                "sourceMetadataSize",
                "candidateMetadataSha256",
                "candidateMetadataSize",
                "boundFile",
            )
        }
        _write_json(manifest_path, manifest)
        with self.assertRaisesRegex(MODULE.VerificationError, "key order drift"):
            self._verify()

        self._write_form_root(spec)
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        first = manifest["copiedFiles"][0]
        manifest["copiedFiles"][0] = {
            "size": first["size"],
            "sha256": first["sha256"],
            "path": first["path"],
        }
        _refresh_manifest_snapshots(manifest)
        _write_json(manifest_path, manifest)
        with self.assertRaisesRegex(MODULE.VerificationError, "key order drift"):
            self._verify()

    def test_coordinated_action_metadata_runtime_enable_still_fails(self) -> None:
        spec = MODULE.FORM_SPECS[0]
        root = self.root / spec.root_relative
        metadata_path = root / "action-bundle-meta.json"
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        metadata["runtimeEnabled"] = True
        _write_json(metadata_path, metadata)

        # Simulate an attacker refreshing every manifest record and its
        # snapshot. Semantic validation must still reject the opened switch.
        manifest_path = root / MODULE.MANIFEST_RELATIVE
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        _refresh_action_transformation(root, manifest)
        _write_json(manifest_path, manifest)
        with self.assertRaisesRegex(
            MODULE.VerificationError,
            "runtimeEnabled",
        ):
            self._verify()

    def test_portrait_absence_or_partial_inventory_fails_closed(self) -> None:
        spec = MODULE.FORM_SPECS[0]
        root = self.root / spec.root_relative
        for relative in MODULE.PORTRAIT_FILE_PATHS:
            (root / relative).unlink()
        with self.assertRaisesRegex(
            MODULE.VerificationError,
            "production root inventory drift",
        ):
            self._verify()

        _write_bytes(root / "portrait/default.png", b"partial portrait\n")
        with self.assertRaisesRegex(
            MODULE.VerificationError,
            "production root inventory drift",
        ):
            self._verify()

        self._write_form_root(spec)
        _write_bytes(
            root / "portrait/source-and-ownership.md",
            b"tampered portrait ownership\n",
        )
        with self.assertRaisesRegex(
            MODULE.VerificationError,
            "portrait ownership SHA",
        ):
            self._verify()

    def test_qa_import_isolation_control_is_exact_and_not_a_portrait_artifact(
        self,
    ) -> None:
        spec = MODULE.FORM_SPECS[0]
        root = self.root / spec.root_relative
        control_path = root / MODULE.QA_IMPORT_ISOLATION_CONTROL_PATH

        report = self._verify()
        form_report = report["forms"][0]
        self.assertEqual(len(form_report["portrait"]["files"]), 11)
        self.assertNotIn(
            MODULE.QA_IMPORT_ISOLATION_CONTROL_PATH,
            {
                record["path"]
                for record in form_report["portrait"]["files"]
            },
        )
        self.assertEqual(
            form_report["qaImportIsolationControl"]["sha256"],
            MODULE.QA_IMPORT_ISOLATION_CONTROL_SHA256,
        )

        control_path.unlink()
        with self.assertRaisesRegex(
            MODULE.VerificationError,
            "missing .*portrait QA import isolation control",
        ):
            self._verify()

        _write_bytes(
            control_path,
            b"# Portrait QA evidence; included in Godot runtime imports!!\n",
        )
        self.assertEqual(
            control_path.stat().st_size,
            MODULE.QA_IMPORT_ISOLATION_CONTROL_SIZE,
        )
        with self.assertRaisesRegex(
            MODULE.VerificationError,
            "portrait QA import isolation control drift",
        ):
            self._verify()

        _write_bytes(
            control_path,
            MODULE.QA_IMPORT_ISOLATION_CONTROL_BYTES,
        )
        _write_bytes(
            root / "qa/portrait/unregistered-isolation-control.txt",
            b"extra unregistered QA import control\n",
        )
        with self.assertRaisesRegex(
            MODULE.VerificationError,
            "production root inventory drift",
        ):
            self._verify()

    def test_portrait_approval_or_semantic_claim_fails_closed(self) -> None:
        spec = MODULE.FORM_SPECS[0]
        root = self.root / spec.root_relative
        metadata_path = root / "portrait/portrait-meta.json"
        original = json.loads(metadata_path.read_text(encoding="utf-8"))

        approved = json.loads(json.dumps(original))
        approved["ownerReview"]["status"] = "approved"
        _write_json(metadata_path, approved)
        with self.assertRaisesRegex(MODULE.VerificationError, "owner_review_pending"):
            self._verify()

        semantic = json.loads(json.dumps(original))
        semantic["semanticIndependenceVerified"] = True
        _write_json(metadata_path, semantic)
        with self.assertRaisesRegex(
            MODULE.VerificationError,
            "semanticIndependenceVerified",
        ):
            self._verify()

    def test_portrait_and_generation_nested_open_flags_fail_closed(self) -> None:
        spec = MODULE.FORM_SPECS[0]
        root = self.root / spec.root_relative
        metadata_path = root / "portrait/portrait-meta.json"
        generation_path = (
            root / "source/portrait/generation-attestation.json"
        )
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        del metadata["releaseGate"]
        _write_json(metadata_path, metadata)
        with self.assertRaisesRegex(MODULE.VerificationError, "releaseGate"):
            self._verify()

        self._write_form_root(spec)
        generation_text = generation_path.read_text(encoding="utf-8")
        generation_text = generation_text.replace(
            '"schemaVersion": 3,',
            '"schemaVersion": 3,\n  "schemaVersion": 3,',
            1,
        )
        generation_path.write_text(generation_text, encoding="utf-8")
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        metadata["source"]["generationAttestation"]["sha256"] = _sha256(
            generation_path
        )
        _write_json(metadata_path, metadata)
        with self.assertRaisesRegex(MODULE.VerificationError, "duplicate JSON key"):
            self._verify()

        self._write_form_root(spec)
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        metadata["nestedRelease"] = {"releaseApproved": True}
        _write_json(metadata_path, metadata)
        with self.assertRaisesRegex(MODULE.VerificationError, "releaseApproved"):
            self._verify()

        self._write_form_root(spec)
        generation = json.loads(generation_path.read_text(encoding="utf-8"))
        generation["nestedRuntime"] = {"runtimeEnabled": True}
        _write_json(generation_path, generation)
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        metadata["source"]["generationAttestation"]["sha256"] = _sha256(
            generation_path
        )
        _write_json(metadata_path, metadata)
        with self.assertRaisesRegex(MODULE.VerificationError, "runtimeEnabled"):
            self._verify()

        self._write_form_root(spec)
        generation = json.loads(generation_path.read_text(encoding="utf-8"))
        del generation["releaseGate"]
        _write_json(generation_path, generation)
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        metadata["source"]["generationAttestation"]["sha256"] = _sha256(
            generation_path
        )
        _write_json(metadata_path, metadata)
        with self.assertRaisesRegex(MODULE.VerificationError, "releaseGate"):
            self._verify()

        self._write_form_root(spec)
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        metadata["ownerApproved"] = True
        _write_json(metadata_path, metadata)
        with self.assertRaisesRegex(MODULE.VerificationError, "ownerApproved"):
            self._verify()

        self._write_form_root(spec)
        generation = json.loads(generation_path.read_text(encoding="utf-8"))
        generation["productionApproved"] = True
        _write_json(generation_path, generation)
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        metadata["source"]["generationAttestation"]["sha256"] = _sha256(
            generation_path
        )
        _write_json(metadata_path, metadata)
        with self.assertRaisesRegex(
            MODULE.VerificationError,
            "productionApproved",
        ):
            self._verify()

    def test_portrait_referenced_images_provenance_is_exact(self) -> None:
        spec = MODULE.FORM_SPECS[1]
        root = self.root / spec.root_relative
        generation_path = (
            root / "source/portrait/generation-attestation.json"
        )
        metadata_path = root / "portrait/portrait-meta.json"
        generation = json.loads(generation_path.read_text(encoding="utf-8"))
        request = generation["generationResultEvidence"][
            "transcriptEvidence"
        ]["requestArgumentBinding"]
        request["referencedImages"].append(
            {
                "index": 1,
                "pathLabel": "unbound-benign-reference.png",
                "role": "codex_generated_iteration_reference",
                "matchesDeclaredIdentityReference": False,
                "currentFileSha256": "a" * 64,
                "currentFileByteLength": 1,
                "currentFileWidth": 1,
                "currentFileHeight": 1,
                "currentFileFormat": "PNG",
                "currentFileMode": "RGBA",
                "historicalRequestBytesVerified": False,
            }
        )
        _write_json(generation_path, generation)
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        metadata["source"]["generationAttestation"]["sha256"] = _sha256(
            generation_path
        )
        _write_json(metadata_path, metadata)
        with self.assertRaisesRegex(
            MODULE.VerificationError,
            "referencedImages provenance drift",
        ):
            self._verify()

    def test_portrait_lineage_rejects_stale_action_or_manifest_binding(self) -> None:
        spec = MODULE.FORM_SPECS[0]
        root = self.root / spec.root_relative
        action_path = root / "action-bundle-meta.json"
        action = json.loads(action_path.read_text(encoding="utf-8"))
        action["closedRegistrationNote"] = "harmless byte drift"
        _write_json(action_path, action)
        manifest_path = root / MODULE.MANIFEST_RELATIVE
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        _refresh_action_transformation(root, manifest)
        _write_json(manifest_path, manifest)
        with self.assertRaisesRegex(
            MODULE.VerificationError,
            "identityEvidence.bundleMetadataSha256 drift",
        ):
            self._verify()

        self._write_form_root(spec)
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest_path.write_text(
            json.dumps(
                manifest,
                ensure_ascii=False,
                separators=(",", ":"),
            ),
            encoding="utf-8",
        )
        with self.assertRaisesRegex(
            MODULE.VerificationError,
            "identityLineage.formalRelocations drift",
        ):
            self._verify()

    def test_optional_run_evidence_absence_is_portable_but_drift_fails(self) -> None:
        self.assertEqual(self._verify()["status"], "PASS")
        video_path = self.root / MODULE.OWNER_REVIEW_VIDEO_RELATIVE
        _write_bytes(video_path, b"wrong optional local evidence\n")
        with self.assertRaisesRegex(
            MODULE.VerificationError,
            "optional local owner evidence SHA drift",
        ):
            self._verify()

    def test_cli_failure_is_machine_json_on_stdout(self) -> None:
        output = io.StringIO()
        with (
            mock.patch.object(
                MODULE,
                "run",
                side_effect=MODULE.VerificationError("fixture failure"),
            ),
            redirect_stdout(output),
        ):
            result = MODULE.main([])
        self.assertEqual(result, 1)
        self.assertEqual(
            json.loads(output.getvalue()),
            {"status": "FAIL", "error": "fixture failure"},
        )

    def test_git_index_is_required_and_detects_unstaged_or_import_drift(
        self,
    ) -> None:
        spec = MODULE.FORM_SPECS[0]
        root = self.root / spec.root_relative
        expected_paths = {
            record["path"]
            for record in MODULE._scan_files(
                root,
                label="fixture production root",
            )
        }
        with self.assertRaisesRegex(
            MODULE.VerificationError,
            "requires a Git working tree",
        ):
            MODULE._validate_git_index_inventory(
                self.root,
                spec.root_relative,
                expected_paths,
            )
        with self.assertRaisesRegex(
            MODULE.VerificationError,
            "requires a Git working tree",
        ):
            MODULE._validate_git_index_authorities(
                self.root,
                (MODULE.OWNER_DECISION_RELATIVE,),
            )

        subprocess.run(
            ["git", "init", "-q", str(self.root)],
            check=True,
            capture_output=True,
        )
        subprocess.run(
            ["git", "-C", str(self.root), "add", "--", spec.root_relative],
            check=True,
            capture_output=True,
        )
        subprocess.run(
            [
                "git",
                "-C",
                str(self.root),
                "add",
                "--",
                MODULE.OWNER_DECISION_RELATIVE,
            ],
            check=True,
            capture_output=True,
        )
        self.assertTrue(
            MODULE._validate_git_index_authorities(
                self.root,
                (MODULE.OWNER_DECISION_RELATIVE,),
            )
        )
        owner_path = self.root / MODULE.OWNER_DECISION_RELATIVE
        owner_payload = owner_path.read_bytes()
        owner_path.write_bytes(owner_payload + b"\n")
        with self.assertRaisesRegex(
            MODULE.VerificationError,
            "authority input working bytes differ",
        ):
            MODULE._validate_git_index_authorities(
                self.root,
                (MODULE.OWNER_DECISION_RELATIVE,),
            )
        owner_path.write_bytes(owner_payload)
        subprocess.run(
            [
                "git",
                "-C",
                str(self.root),
                "add",
                "--",
                MODULE.OWNER_DECISION_RELATIVE,
            ],
            check=True,
            capture_output=True,
        )
        self.assertTrue(
            MODULE._validate_git_index_inventory(
                self.root,
                spec.root_relative,
                expected_paths,
            )
        )

        tracked_path = root / "identity/front_3quarter_sw.png"
        tracked_path.write_bytes(b"unstaged drift\n")
        with self.assertRaisesRegex(
            MODULE.VerificationError,
            "working bytes differ",
        ):
            MODULE._validate_git_index_inventory(
                self.root,
                spec.root_relative,
                expected_paths,
            )
        subprocess.run(
            ["git", "-C", str(self.root), "add", "--", tracked_path],
            check=True,
            capture_output=True,
        )
        self.assertTrue(
            MODULE._validate_git_index_inventory(
                self.root,
                spec.root_relative,
                expected_paths,
            )
        )

        indexed_payload = tracked_path.read_bytes()
        subprocess.run(
            [
                "git",
                "-C",
                str(self.root),
                "update-index",
                "--assume-unchanged",
                "--",
                tracked_path.relative_to(self.root),
            ],
            check=True,
            capture_output=True,
        )
        tracked_path.write_bytes(b"X" * len(indexed_payload))
        git_diff = subprocess.run(
            [
                "git",
                "-C",
                str(self.root),
                "diff",
                "--quiet",
                "--",
                tracked_path.relative_to(self.root),
            ],
            check=False,
        )
        self.assertEqual(git_diff.returncode, 0)
        with self.assertRaisesRegex(
            MODULE.VerificationError,
            "working bytes differ",
        ):
            MODULE._validate_git_index_inventory(
                self.root,
                spec.root_relative,
                expected_paths,
            )
        subprocess.run(
            [
                "git",
                "-C",
                str(self.root),
                "update-index",
                "--no-assume-unchanged",
                "--",
                tracked_path.relative_to(self.root),
            ],
            check=True,
            capture_output=True,
        )
        tracked_path.write_bytes(indexed_payload)

        control_path = root / MODULE.QA_IMPORT_ISOLATION_CONTROL_PATH
        subprocess.run(
            [
                "git",
                "-C",
                str(self.root),
                "rm",
                "--cached",
                "--",
                control_path.relative_to(self.root),
            ],
            check=True,
            capture_output=True,
        )
        with self.assertRaisesRegex(
            MODULE.VerificationError,
            (
                "Git index inventory drift: .*"
                + re.escape(MODULE.QA_IMPORT_ISOLATION_CONTROL_PATH)
            ),
        ):
            MODULE._validate_git_index_inventory(
                self.root,
                spec.root_relative,
                expected_paths,
            )
        subprocess.run(
            ["git", "-C", str(self.root), "add", "--", control_path],
            check=True,
            capture_output=True,
        )
        self.assertTrue(
            MODULE._validate_git_index_inventory(
                self.root,
                spec.root_relative,
                expected_paths,
            )
        )

        import_path = root / "portrait/default.png.import"
        import_path.write_bytes(b"tracked derived state\n")
        subprocess.run(
            ["git", "-C", str(self.root), "add", "-f", "--", import_path],
            check=True,
            capture_output=True,
        )
        with self.assertRaisesRegex(
            MODULE.VerificationError,
            r"tracked generated \.import",
        ):
            MODULE._validate_git_index_inventory(
                self.root,
                spec.root_relative,
                expected_paths,
            )


@unittest.skipUnless(
    os.environ.get("BEASTBOUND_RUN_FUSION_CLOSED_REAL_INTEGRATION") == "1",
    "set BEASTBOUND_RUN_FUSION_CLOSED_REAL_INTEGRATION=1 for repository proof",
)
class ClosedFusionReleaseRealRepositoryIntegrationTest(unittest.TestCase):
    def test_real_repository_closed_contract(self) -> None:
        report = MODULE.run(repo_root=REPO_ROOT)
        self.assertEqual(report["status"], "PASS")
        self.assertTrue(report["closedRegistrationVerified"])
        self.assertEqual(report["summary"]["formsVerified"], 2)
        self.assertEqual(report["summary"]["portraitFilesVerified"], 22)
        self.assertEqual(
            report["summary"]["qaImportIsolationControlsVerified"],
            2,
        )
        self.assertTrue(
            all(
                form["gitIndexInventoryVerified"]
                and form["qaImportIsolationControl"]["gitTracked"]
                for form in report["forms"]
            )
        )


if __name__ == "__main__":
    unittest.main()
