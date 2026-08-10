#!/usr/bin/env python3
"""Focused catalog and isolated-root tests for pet portrait auditing."""

from __future__ import annotations

import base64
import copy
import io
import json
import shutil
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest import mock

from PIL import Image, ImageDraw, PngImagePlugin


TOOLS_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TOOLS_DIR))

import audit_pet_portrait_catalog as audit  # noqa: E402
import build_pet_portrait as portrait  # noqa: E402


class PetPortraitCatalogAuditTests(unittest.TestCase):
    def setUp(self) -> None:
        self._codex_state = tempfile.TemporaryDirectory()
        self.codex_home = (
            Path(self._codex_state.name).resolve() / ".codex"
        )
        self.codex_home.mkdir(parents=True)
        patcher = mock.patch.object(
            portrait,
            "_canonical_codex_home",
            return_value=self.codex_home,
        )
        patcher.start()
        self.addCleanup(patcher.stop)
        self.addCleanup(self._codex_state.cleanup)

    def pet_root(
        self,
        repo_root: Path,
        form_id: str,
        asset_folder: str | None = None,
    ) -> Path:
        return (
            repo_root
            / "client/godot/assets/pets"
            / (asset_folder or form_id)
        )

    def write_catalog(
        self,
        repo_root: Path,
        entries: list[tuple[str, Path]],
        *,
        include_portrait: bool = True,
    ) -> Path:
        forms: list[dict[str, object]] = []
        for form_id, pet_root in entries:
            pet: dict[str, str] = {
                "root": pet_root.relative_to(repo_root).as_posix(),
                "metadataPath": (
                    pet_root / "action-bundle-meta.json"
                ).relative_to(repo_root).as_posix(),
                "identityPath": (
                    pet_root / "identity/identity-lock.md"
                ).relative_to(repo_root).as_posix(),
                "ownershipPath": (
                    pet_root / "identity/source-and-ownership.md"
                ).relative_to(repo_root).as_posix(),
                "promptPath": (
                    pet_root / "prompts/identity-board-v1.txt"
                ).relative_to(repo_root).as_posix(),
            }
            if include_portrait:
                pet["portraitPath"] = (
                    pet_root / portrait.RUNTIME_PATH
                ).relative_to(repo_root).as_posix()
            forms.append({"formId": form_id, "pet": pet})
        path = repo_root / audit.DEFAULT_CATALOG
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps(
                {"schemaVersion": 1, "forms": forms},
                ensure_ascii=False,
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
        return path

    def build_pet(
        self,
        repo_root: Path,
        form_id: str,
        *,
        isolated: bool,
        portrait_variant: int = 1,
        identity_variant: int | None = None,
        asset_folder: str | None = None,
        alpha_threshold: int = portrait.DEFAULT_ALPHA_THRESHOLD,
    ) -> Path:
        pet_root = self.pet_root(repo_root, form_id, asset_folder)
        identity_path = pet_root / "identity/front_3quarter_sw.png"
        identity_path.parent.mkdir(parents=True, exist_ok=True)
        identity_key = (
            portrait_variant + 13
            if identity_variant is None
            else identity_variant
        )
        identity = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
        identity_draw = ImageDraw.Draw(identity)
        identity_draw.polygon(
            (
                (256, 42 + identity_key % 13),
                (444, 424),
                (68, 424),
            ),
            fill=(
                (31 + identity_key * 19) % 220,
                (75 + identity_key * 23) % 220,
                (121 + identity_key * 29) % 220,
                255,
            ),
        )
        identity_draw.rectangle(
            (226, 150, 286, 380),
            fill=(20, 40 + identity_key % 120, 170, 255),
        )
        identity.save(identity_path, format="PNG")
        back_identity_path = (
            pet_root / "identity/back_3quarter_ne.png"
        )
        back_identity = Image.new(
            "RGBA",
            (512, 512),
            (0, 0, 0, 0),
        )
        back_draw = ImageDraw.Draw(back_identity)
        back_draw.ellipse(
            (92, 76, 420, 440),
            fill=(
                (77 + identity_key * 11) % 220,
                (43 + identity_key * 17) % 220,
                (139 + identity_key * 13) % 220,
                255,
            ),
        )
        back_identity.save(back_identity_path, format="PNG")

        identity_lock_path = pet_root / "identity/identity-lock.md"
        identity_lock_path.write_text(
            (
                f"# {form_id} identity lock\n\n"
                "The canonical silhouette, face, markings, palette, "
                "proportions, and asymmetric details are frozen for portrait "
                "identity binding and may not drift during this test.\n"
            ),
            encoding="utf-8",
        )
        identity_ownership_path = (
            pet_root / "identity/source-and-ownership.md"
        )
        identity_ownership_path.write_text(
            "Original test fixture identity; owner review pending.\n",
            encoding="utf-8",
        )
        identity_prompt_path = (
            pet_root / "prompts/identity-board-v1.txt"
        )
        identity_prompt_path.parent.mkdir(parents=True, exist_ok=True)
        identity_prompt_path.write_text(
            f"Original identity board prompt for {form_id}.\n",
            encoding="utf-8",
        )
        if isolated:
            isolated_prompt_path = pet_root / "prompts/identity.txt"
            isolated_prompt_path.write_text(
                f"Original isolated identity prompt for {form_id}.\n",
                encoding="utf-8",
            )
        pipeline_path = (
            pet_root / "source/identity-board-pipeline-meta.json"
        )
        pipeline_path.parent.mkdir(parents=True, exist_ok=True)
        identity_rgba_sha = portrait.rgba_hash(identity)
        back_rgba_sha = portrait.rgba_hash(back_identity)
        pipeline_path.write_text(
            json.dumps(
                {
                    "slots": [
                        "front_3quarter_sw",
                        "back_3quarter_ne",
                    ],
                    "frames": [
                        {
                            "slot": "front_3quarter_sw",
                            "sourceRgbaSha256": identity_rgba_sha,
                        },
                        {
                            "slot": "back_3quarter_ne",
                            "sourceRgbaSha256": back_rgba_sha,
                        },
                    ],
                },
                ensure_ascii=False,
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
        action_metadata: dict[str, object] = {
            "schemaVersion": 2,
            "formId": form_id,
            "identity": {
                "status": "self_review_passed_owner_pending",
                "identityLock": "identity/identity-lock.md",
                "poses": {
                    "front_3quarter_sw": (
                        "identity/front_3quarter_sw.png"
                    ),
                    "back_3quarter_ne": (
                        "identity/back_3quarter_ne.png"
                    ),
                },
            },
            "sourceArchive": {
                "pipelineMetadata": (
                    "source/identity-board-pipeline-meta.json"
                ),
            },
        }
        if isolated:
            action_metadata["evidence"] = {
                "identityGateAudit": {
                    "pipelineMetadata": {
                        "path": (
                            "source/identity-board-pipeline-meta.json"
                        ),
                        "sha256": portrait.sha256_file(pipeline_path),
                        "sources": {
                            "front_3quarter_sw": {
                                "canonicalRgbaSha256": identity_rgba_sha,
                            },
                        },
                    },
                },
            }
        (pet_root / "action-bundle-meta.json").write_text(
            json.dumps(
                action_metadata,
                ensure_ascii=False,
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )

        production = repo_root / ".run/portrait-source" / form_id
        production.mkdir(parents=True, exist_ok=True)
        source_path = production / "headshot.png"
        source = Image.new(
            "RGB",
            (portrait.MIN_SOURCE_SIZE, portrait.MIN_SOURCE_SIZE),
            portrait.DEFAULT_KEY,
        )
        draw = ImageDraw.Draw(source)
        body_color = (
            (83 + portrait_variant * 31) % 210,
            (54 + portrait_variant * 47) % 210,
            (38 + portrait_variant * 59) % 210,
        )
        eye_color = (
            (55 + portrait_variant * 17) % 230,
            (150 + portrait_variant * 19) % 230,
            (210 + portrait_variant * 23) % 230,
        )
        draw.rounded_rectangle(
            (176, 92, 848, 904),
            radius=200 + portrait_variant % 31,
            fill=body_color,
            outline=(180, 40, 180),
            width=2,
        )
        draw.ellipse((330, 286, 420, 376), fill=eye_color)
        draw.ellipse((604, 286, 694, 376), fill=eye_color)
        draw.polygon(
            ((512, 406), (454, 556), (570, 556)),
            fill=(234, 182, (52 + portrait_variant * 7) % 180),
        )
        png_info = PngImagePlugin.PngInfo()
        png_info.add_text("provenance", "OpenAI Media Service API")
        source.save(source_path, format="PNG", pnginfo=png_info)
        prompt_path = production / "prompt.txt"
        prompt_path.write_text(
            f"Dedicated independently authored {form_id} head-and-upper-body "
            "portrait on solid #FF00FF chroma. Never crop or derive it from "
            "full-body, identity, world, or battle artwork.\n",
            encoding="utf-8",
        )
        generation_id = (
            "call_"
            + portrait.sha256_bytes(form_id.encode("utf-8"))[:24]
        )
        session_id = "123e4567-e89b-42d3-a456-426614174000"
        generator_source = (
            self.codex_home
            / "generated_images"
            / session_id
            / f"{generation_id}.png"
        )
        generator_source.parent.mkdir(parents=True, exist_ok=True)
        generator_source.write_bytes(source_path.read_bytes())
        generation_result_path = production / "result.txt"
        generation_result_path.write_text(
            "\n".join(
                (
                    f"SelectedGeneratorResultPath: {generator_source}",
                    f"SelectedGeneratorResultId: {generation_id}",
                    "WorkspaceRawPath: "
                    f"{source_path.relative_to(repo_root).as_posix()}",
                    "SelectedOutputSha256: "
                    f"{portrait.sha256_file(source_path)}",
                    f"FormId: {form_id}",
                    "Generator: built_in_imagegen",
                    "",
                )
            ),
            encoding="utf-8",
        )
        catalog_path = repo_root / audit.DEFAULT_CATALOG
        if not catalog_path.is_file():
            catalog_path.parent.mkdir(parents=True, exist_ok=True)
            catalog_path.write_text(
                json.dumps(
                    {"schemaVersion": 1, "forms": []},
                    ensure_ascii=False,
                    indent=2,
                )
                + "\n",
                encoding="utf-8",
            )
        selected_sources_path = (
            repo_root / portrait.SELECTED_SOURCES_PATH
        )
        selected_sources_path.parent.mkdir(parents=True, exist_ok=True)
        selected_sources_path.write_text(
            json.dumps(
                {
                    "schemaVersion": 1,
                    "catalog": catalog_path.relative_to(
                        repo_root
                    ).as_posix(),
                    "entries": [
                        {
                            "formId": form_id,
                            "petRoot": pet_root.relative_to(
                                repo_root
                            ).as_posix(),
                            "input": source_path.relative_to(
                                repo_root
                            ).as_posix(),
                            "prompt": prompt_path.relative_to(
                                repo_root
                            ).as_posix(),
                            "result": generation_result_path.relative_to(
                                repo_root
                            ).as_posix(),
                            "generationId": generation_id,
                            "key": "FF00FF",
                            "isolated": isolated,
                        }
                    ],
                },
                ensure_ascii=False,
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
        transcript_path = (
            self.codex_home
            / "sessions/2026/07/29"
            / f"rollout-fixture-{session_id}.jsonl"
        )
        transcript_path.parent.mkdir(parents=True, exist_ok=True)
        transcript_records = [
            {
                "type": "session_meta",
                "payload": {"id": session_id},
            },
            {
                "type": "response_item",
                "payload": {
                    "type": "function_call",
                    "name": "imagegen",
                    "namespace": "image_gen",
                    "arguments": json.dumps(
                        {
                            "prompt": prompt_path.read_text(
                                encoding="utf-8"
                            ),
                            "referenced_image_paths": [
                                str(identity_path)
                            ],
                        }
                    ),
                    "call_id": generation_id,
                },
            },
            {
                "type": "event_msg",
                "payload": {
                    "type": "image_generation_end",
                    "call_id": generation_id,
                    "status": "completed",
                    "saved_path": str(generator_source),
                    "result": base64.b64encode(
                        generator_source.read_bytes()
                    ).decode("ascii"),
                },
            },
        ]
        transcript_path.write_text(
            "".join(
                json.dumps(record, separators=(",", ":")) + "\n"
                for record in transcript_records
            ),
            encoding="utf-8",
        )
        attestation_path = production / "generation-attestation.json"
        portrait.write_generation_attestation(
            portrait.GenerationAttestationOptions(
                repo_root=repo_root,
                pet_root=pet_root,
                form_id=form_id,
                input_path=source_path,
                identity_reference=identity_path,
                prompt_path=prompt_path,
                generation_result=generation_result_path,
                output_path=attestation_path,
                generation_id=generation_id,
                catalog_path=catalog_path,
                isolated=isolated,
            )
        )
        portrait.build_portrait(
            portrait.PortraitBuildOptions(
                repo_root=repo_root,
                pet_root=pet_root,
                form_id=form_id,
                input_path=source_path,
                identity_reference=identity_path,
                prompt_path=prompt_path,
                generation_attestation=attestation_path,
                generation_id=generation_id,
                catalog_path=catalog_path,
                isolated=isolated,
                alpha_threshold=alpha_threshold,
                write=True,
            )
        )
        return pet_root

    def audit_catalog(
        self,
        repo_root: Path,
        catalog: Path,
        *,
        count: int = 1,
    ) -> dict[str, object]:
        return audit.audit_portraits(
            repo_root=repo_root,
            catalog_path=catalog,
            expected_catalog_count=count,
            mode="catalog-only",
        )

    def write_owner_approval(
        self,
        repo_root: Path,
        pet_root: Path,
        form_id: str,
        *,
        owner_id: str = audit.TRUSTED_PROJECT_OWNER_ID,
        evidence_sha256: str | None = None,
    ) -> str:
        metadata_path = pet_root / portrait.METADATA_PATH
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        ownership_path = pet_root / portrait.OWNERSHIP_PATH
        ownership_text = ownership_path.read_text(encoding="utf-8")
        ownership_path.write_text(
            ownership_text.replace(
                "owner review status: `owner_review_pending`",
                "owner review status: `approved`",
            ),
            encoding="utf-8",
        )
        metadata["ownership"]["sha256"] = portrait.sha256_file(
            ownership_path
        )

        evidence_path = pet_root / portrait.CONTACT_SHEET_PATH
        evidence = {
            "path": evidence_path.relative_to(repo_root).as_posix(),
            "sha256": evidence_sha256
            if evidence_sha256 is not None
            else portrait.sha256_file(evidence_path),
        }
        decision_path = pet_root / portrait.OWNER_DECISION_PATH
        decision_path.parent.mkdir(parents=True, exist_ok=True)
        decision = {
            "schemaVersion": 2,
            "decisionType": "beastbound_pet_portrait_owner_approval",
            "ownerId": owner_id,
            "decision": "approved",
            "subject": {
                "kind": "shared_dedicated_headshot_v1",
                "formId": form_id,
                "petRoot": pet_root.relative_to(repo_root).as_posix(),
                "master": {
                    "path": (
                        pet_root / portrait.MASTER_PATH
                    ).relative_to(repo_root).as_posix(),
                    "sha256": portrait.sha256_file(
                        pet_root / portrait.MASTER_PATH
                    ),
                },
                "runtime": {
                    "path": (
                        pet_root / portrait.RUNTIME_PATH
                    ).relative_to(repo_root).as_posix(),
                    "sha256": portrait.sha256_file(
                        pet_root / portrait.RUNTIME_PATH
                    ),
                },
                "ownership": {
                    "path": ownership_path.relative_to(repo_root).as_posix(),
                    "sha256": portrait.sha256_file(ownership_path),
                },
            },
            "acceptedEvidence": [evidence],
            "reviewedAt": "2026-07-28T12:00:00+08:00",
        }
        decision_path.write_text(
            json.dumps(decision, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        decision_sha = portrait.sha256_file(decision_path)
        metadata["ownerReview"] = {
            "required": True,
            "status": "approved",
            "evidence": [evidence],
            "decision": {
                "path": decision_path.relative_to(repo_root).as_posix(),
                "sha256": decision_sha,
            },
        }
        metadata_path.write_text(
            json.dumps(metadata, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        return decision_sha

    def test_catalog_passes_with_explicit_portrait_and_replayable_evidence(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            repo_root = Path(temporary) / "repo"
            pet_root = self.pet_root(
                repo_root,
                "catalog_pet",
                "physical_catalog_asset",
            )
            catalog = self.write_catalog(
                repo_root,
                [("catalog_pet", pet_root)],
            )
            self.build_pet(
                repo_root,
                "catalog_pet",
                isolated=False,
                asset_folder="physical_catalog_asset",
            )
            result = self.audit_catalog(repo_root, catalog)
            self.assertEqual(result["status"], "ok", result["errors"])
            self.assertFalse(result["releaseGate"])
            self.assertFalse(result["semanticIndependenceVerified"])
            self.assertTrue(result["ownerDecisionRequired"])
            self.assertEqual(
                result["ownerDecisionStatus"],
                "owner_review_pending",
            )
            self.assertIn(
                "attestation snapshot",
                result["releaseGateReason"],
            )
            self.assertEqual(result["audited"], 1)
            self.assertEqual(
                result["entries"][0]["portraitPath"],
                (
                    "client/godot/assets/pets/physical_catalog_asset/"
                    "portrait/default.png"
                ),
            )
            self.assertGreaterEqual(
                result["entries"][0]["comparedPetRootImages"],
                1,
            )
            single_result = audit.audit_portrait_target(
                repo_root=repo_root,
                form_id="catalog_pet",
                pet_root=pet_root,
                source="catalog",
                catalog_path=catalog,
            )
            self.assertEqual(
                single_result["status"],
                "ok",
                single_result["errors"],
            )
            self.assertFalse(single_result["releaseGate"])
            self.assertFalse(
                single_result["semanticIndependenceVerified"]
            )
            self.assertTrue(single_result["ownerDecisionRequired"])
            self.assertEqual(
                single_result["ownerDecisionStatus"],
                "owner_review_pending",
            )

            output = io.StringIO()
            with redirect_stdout(output):
                exit_code = audit.main(
                    [
                        "--repo-root",
                        str(repo_root),
                        "--catalog",
                        str(catalog),
                        "--single-target",
                        f"catalog_pet={pet_root}",
                        "--single-source",
                        "catalog",
                    ]
                )
            self.assertEqual(exit_code, 0)
            cli_result = json.loads(output.getvalue())
            self.assertEqual(cli_result["status"], "ok")
            self.assertFalse(cli_result["releaseGate"])
            self.assertFalse(
                cli_result["semanticIndependenceVerified"]
            )
            self.assertTrue(cli_result["ownerDecisionRequired"])
            self.assertEqual(cli_result["audited"], 1)

    def test_portrait_metadata_rejects_top_level_approval_claim_injection(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            repo_root = Path(temporary) / "repo"
            pet_root = self.pet_root(repo_root, "top_claim_injection_pet")
            catalog = self.write_catalog(
                repo_root,
                [("top_claim_injection_pet", pet_root)],
            )
            self.build_pet(
                repo_root,
                "top_claim_injection_pet",
                isolated=False,
            )
            metadata_path = pet_root / portrait.METADATA_PATH
            metadata = json.loads(
                metadata_path.read_text(encoding="utf-8")
            )
            metadata["ownerApprovalStatus"] = "approved"
            metadata_path.write_text(
                json.dumps(metadata, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
            result = self.audit_catalog(repo_root, catalog)
            self.assertEqual(result["status"], "failed")
            self.assertTrue(
                any(
                    "portrait-meta 字段集合不符合固定 schema"
                    in error
                    and "ownerApprovalStatus" in error
                    for error in result["errors"]
                ),
                result["errors"],
            )

    def test_portrait_metadata_rejects_nested_release_and_copyright_claims(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            repo_root = Path(temporary) / "repo"
            pet_root = self.pet_root(
                repo_root,
                "nested_claim_injection_pet",
            )
            catalog = self.write_catalog(
                repo_root,
                [("nested_claim_injection_pet", pet_root)],
            )
            self.build_pet(
                repo_root,
                "nested_claim_injection_pet",
                isolated=False,
            )
            metadata_path = pet_root / portrait.METADATA_PATH
            metadata = json.loads(
                metadata_path.read_text(encoding="utf-8")
            )
            metadata["source"]["copyrightProvenance"] = "verified"
            metadata["independentCompositionEvidence"][
                "releaseGate"
            ] = "approved"
            metadata["independentCompositionEvidence"]["claimLimit"] = (
                "hash checks do not prove independence; copyright verified "
                "and releaseGate approved"
            )
            metadata_path.write_text(
                json.dumps(metadata, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
            result = self.audit_catalog(repo_root, catalog)
            self.assertEqual(result["status"], "failed")
            self.assertTrue(
                any(
                    "portrait-meta.source 字段集合不符合固定 schema"
                    in error
                    and "copyrightProvenance" in error
                    for error in result["errors"]
                ),
                result["errors"],
            )
            self.assertTrue(
                any(
                    "portrait-meta.independentCompositionEvidence "
                    "字段集合不符合固定 schema" in error
                    and "releaseGate" in error
                    for error in result["errors"]
                ),
                result["errors"],
            )
            self.assertTrue(
                any(
                    "independent composition claimLimit "
                    "必须精确保留自动证明边界" in error
                    for error in result["errors"]
                ),
                result["errors"],
            )

    def test_shared_uses_allows_future_consumers_beyond_baseline(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            repo_root = Path(temporary) / "repo"
            pet_root = self.pet_root(repo_root, "future_consumer_pet")
            catalog = self.write_catalog(
                repo_root,
                [("future_consumer_pet", pet_root)],
            )
            self.build_pet(
                repo_root,
                "future_consumer_pet",
                isolated=False,
            )
            metadata_path = pet_root / portrait.METADATA_PATH
            metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
            metadata["sharedUses"].append("future_market_card")
            metadata_path.write_text(
                json.dumps(metadata, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
            result = self.audit_catalog(repo_root, catalog)
            self.assertEqual(result["status"], "ok", result["errors"])

    def test_catalog_rejects_missing_explicit_portrait_path(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            repo_root = Path(temporary) / "repo"
            pet_root = self.pet_root(repo_root, "missing_path_pet")
            catalog = self.write_catalog(
                repo_root,
                [("missing_path_pet", pet_root)],
            )
            self.build_pet(
                repo_root,
                "missing_path_pet",
                isolated=False,
            )
            self.write_catalog(
                repo_root,
                [("missing_path_pet", pet_root)],
                include_portrait=False,
            )
            result = self.audit_catalog(repo_root, catalog)
            self.assertEqual(result["status"], "failed")
            self.assertTrue(
                any(
                    "portraitPath 必须显式声明" in error
                    for error in result["errors"]
                ),
                result["errors"],
            )

    def test_scaled_duplicate_anywhere_under_pet_root_fails(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            repo_root = Path(temporary) / "repo"
            pet_root = self.pet_root(repo_root, "scaled_duplicate_pet")
            catalog = self.write_catalog(
                repo_root,
                [("scaled_duplicate_pet", pet_root)],
            )
            self.build_pet(
                repo_root,
                "scaled_duplicate_pet",
                isolated=False,
            )
            duplicate = (
                pet_root / "source/formal-production/identity-board.png"
            )
            duplicate.parent.mkdir(parents=True, exist_ok=True)
            with Image.open(pet_root / portrait.RUNTIME_PATH) as runtime:
                runtime.resize((256, 256)).save(duplicate, format="PNG")
            result = self.audit_catalog(repo_root, catalog)
            self.assertEqual(result["status"], "failed")
            self.assertTrue(
                any(
                    "同图或缩放拷贝" in error
                    for error in result["errors"]
                ),
                result["errors"],
            )

    def test_runtime_hash_drift_fails_closed(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            repo_root = Path(temporary) / "repo"
            pet_root = self.pet_root(repo_root, "hash_drift_pet")
            catalog = self.write_catalog(
                repo_root,
                [("hash_drift_pet", pet_root)],
            )
            self.build_pet(
                repo_root,
                "hash_drift_pet",
                isolated=False,
            )
            runtime_path = pet_root / portrait.RUNTIME_PATH
            with Image.open(runtime_path) as opened:
                changed = opened.copy()
            changed.putpixel((256, 256), (255, 255, 255, 255))
            changed.save(runtime_path, format="PNG")
            result = self.audit_catalog(repo_root, catalog)
            self.assertEqual(result["status"], "failed")
            self.assertTrue(
                any(
                    "sha256 与文件不一致" in error
                    for error in result["errors"]
                ),
                result["errors"],
            )

    def test_original_generated_png_byte_drift_fails_closed(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            repo_root = Path(temporary) / "repo"
            pet_root = self.pet_root(repo_root, "original_png_drift_pet")
            catalog = self.write_catalog(
                repo_root,
                [("original_png_drift_pet", pet_root)],
            )
            self.build_pet(
                repo_root,
                "original_png_drift_pet",
                isolated=False,
            )
            original_path = (
                pet_root / portrait.ORIGINAL_GENERATED_PNG_PATH
            )
            with Image.open(original_path) as opened:
                changed = opened.convert("RGB")
            changed.putpixel((512, 512), (255, 255, 255))
            changed.save(original_path, format="PNG")
            result = self.audit_catalog(repo_root, catalog)
            self.assertEqual(result["status"], "failed")
            self.assertTrue(
                any(
                    "originalGeneratedPng.sha256 与文件不一致"
                    in error
                    for error in result["errors"]
                ),
                result["errors"],
            )

    def test_two_distinct_fusion_roots_pass_isolated_mode(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            repo_root = Path(temporary) / "repo"
            first = self.build_pet(
                repo_root,
                "fusion_pet_one",
                isolated=True,
                portrait_variant=2,
            )
            second = self.build_pet(
                repo_root,
                "fusion_pet_two",
                isolated=True,
                portrait_variant=9,
            )
            result = audit.audit_portraits(
                repo_root=repo_root,
                isolated_roots=(
                    ("fusion_pet_one", first.relative_to(repo_root)),
                    ("fusion_pet_two", second.relative_to(repo_root)),
                ),
                mode="isolated-only",
                expected_isolated_count=2,
            )
            self.assertEqual(result["status"], "ok", result["errors"])
            self.assertEqual(result["audited"], 2)
            single_result = audit.audit_portrait_target(
                repo_root=repo_root,
                form_id="fusion_pet_one",
                pet_root=first,
                source="isolated",
            )
            self.assertEqual(
                single_result["status"],
                "ok",
                single_result["errors"],
            )
            self.assertFalse(single_result["releaseGate"])

    def test_cross_form_identical_portraits_fail_even_with_unique_attestations(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            repo_root = Path(temporary) / "repo"
            first = self.build_pet(
                repo_root,
                "fusion_duplicate_one",
                isolated=True,
                portrait_variant=17,
                identity_variant=41,
            )
            second = self.build_pet(
                repo_root,
                "fusion_duplicate_two",
                isolated=True,
                portrait_variant=17,
                identity_variant=52,
            )
            result = audit.audit_portraits(
                repo_root=repo_root,
                isolated_roots=(
                    ("fusion_duplicate_one", first.relative_to(repo_root)),
                    ("fusion_duplicate_two", second.relative_to(repo_root)),
                ),
                mode="isolated-only",
            )
            self.assertEqual(result["status"], "failed")
            self.assertTrue(
                any(
                    "跨宠 portrait" in error or "跨宠 raw" in error
                    for error in result["errors"]
                ),
                result["errors"],
            )

    def test_default_combined_mode_cannot_be_weakened_below_36_plus_0(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            repo_root = Path(temporary) / "repo"
            pet_root = self.pet_root(repo_root, "one_catalog_pet")
            catalog = self.write_catalog(
                repo_root,
                [("one_catalog_pet", pet_root)],
            )
            self.build_pet(
                repo_root,
                "one_catalog_pet",
                isolated=False,
            )
            result = audit.audit_portraits(
                repo_root=repo_root,
                catalog_path=catalog,
                expected_catalog_count=1,
                expected_isolated_count=0,
            )
            self.assertEqual(result["status"], "failed")
            self.assertFalse(result["releaseGate"])
            self.assertFalse(result["semanticIndependenceVerified"])
            self.assertTrue(result["ownerDecisionRequired"])
            self.assertEqual(
                result["ownerDecisionStatus"],
                "owner_review_pending",
            )
            self.assertEqual(result["catalogExpected"], 36)
            self.assertEqual(result["isolatedExpected"], 0)
            self.assertTrue(
                any("应为 36" in error for error in result["errors"]),
                result["errors"],
            )

    def test_combined_36_plus_0_decoys_cannot_replace_authoritative_forms(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            repo_root = Path(temporary) / "repo"
            catalog_entries = [
                (
                    f"decoy_catalog_pet_{index:02d}",
                    self.pet_root(
                        repo_root,
                        f"decoy_catalog_pet_{index:02d}",
                    ),
                )
                for index in range(audit.DEFAULT_EXPECTED_CATALOG_COUNT)
            ]
            catalog = self.write_catalog(repo_root, catalog_entries)
            result = audit.audit_portraits(
                repo_root=repo_root,
                catalog_path=catalog,
                isolated_roots=(
                    (
                        "decoy_fusion_one",
                        Path(".run/decoy-fusion-one/pet-root"),
                    ),
                    (
                        "decoy_fusion_two",
                        Path(".run/decoy-fusion-two/pet-root"),
                    ),
                ),
            )
            self.assertEqual(result["catalogExpected"], 36)
            self.assertEqual(result["isolatedExpected"], 0)
            self.assertEqual(result["status"], "failed")
            self.assertTrue(
                any(
                    "combined 正式 catalog formId/root "
                    "必须严格等于内置权威映射" in error
                    for error in result["errors"]
                ),
                result["errors"],
            )
            self.assertTrue(
                any(
                    "combined isolated 融合宠 formId/root "
                    "必须严格等于内置权威映射" in error
                    for error in result["errors"]
                ),
                result["errors"],
            )

    def test_combined_integrity_audit_rejects_fake_catalog_path(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            repo_root = Path(temporary) / "repo"
            runtime_catalog = self.write_catalog(
                repo_root,
                [
                    (form_id, repo_root / relative_root)
                    for form_id, relative_root
                    in audit.AUTHORITATIVE_CATALOG_FORM_ROOTS
                ],
            )
            fake_catalog = repo_root / ".run/fake-catalog.json"
            fake_catalog.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(runtime_catalog, fake_catalog)
            result = audit.audit_portraits(
                repo_root=repo_root,
                catalog_path=fake_catalog,
                isolated_roots=audit.AUTHORITATIVE_ISOLATED_FORM_ROOTS,
            )
            self.assertEqual(result["status"], "failed")
            self.assertFalse(result["releaseGate"])
            self.assertFalse(result["semanticIndependenceVerified"])
            self.assertTrue(result["ownerDecisionRequired"])
            self.assertEqual(
                result["ownerDecisionStatus"],
                "owner_review_pending",
            )
            self.assertTrue(
                any(
                    "combined 完整性审计必须读取固定 runtime catalog"
                    in error
                    for error in result["errors"]
                ),
                result["errors"],
            )

    def test_combined_authoritative_form_id_with_wrong_root_fails(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            repo_root = Path(temporary) / "repo"
            entries = [
                (form_id, repo_root / relative_root)
                for form_id, relative_root
                in audit.AUTHORITATIVE_CATALOG_FORM_ROOTS
            ]
            first_form_id, _ = entries[0]
            entries[0] = (
                first_form_id,
                repo_root / "client/godot/assets/pets/root-substitution",
            )
            catalog = self.write_catalog(repo_root, entries)
            result = audit.audit_portraits(
                repo_root=repo_root,
                catalog_path=catalog,
                isolated_roots=tuple(
                    (form_id, root)
                    for form_id, root
                    in audit.AUTHORITATIVE_ISOLATED_FORM_ROOTS
                ),
            )
            self.assertEqual(result["status"], "failed")
            self.assertTrue(
                any(
                    f"combined 正式 catalog root 错误：{first_form_id}"
                    in error
                    for error in result["errors"]
                ),
                result["errors"],
            )

    def test_combined_fusion_form_ids_require_the_two_real_catalog_roots(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            repo_root = Path(temporary) / "repo"
            entries = [
                (form_id, repo_root / relative_root)
                for form_id, relative_root
                in audit.AUTHORITATIVE_CATALOG_FORM_ROOTS
            ]
            solar_form_id = "emberhorn_fusion_solar_crown_fire7_wind3"
            entries = [
                (
                    form_id,
                    (
                        repo_root / ".run/decoy-solar-root/pet-root"
                        if form_id == solar_form_id
                        else pet_root
                    ),
                )
                for form_id, pet_root in entries
            ]
            catalog = self.write_catalog(
                repo_root,
                entries,
            )
            result = audit.audit_portraits(
                repo_root=repo_root,
                catalog_path=catalog,
            )
            self.assertEqual(result["status"], "failed")
            self.assertTrue(
                any(
                    f"combined 正式 catalog root 错误：{solar_form_id}"
                    in error
                    for error in result["errors"]
                ),
                result["errors"],
            )

    def test_contact_sheet_must_replay_even_if_hash_record_is_rewritten(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            repo_root = Path(temporary) / "repo"
            pet_root = self.pet_root(repo_root, "contact_tamper_pet")
            catalog = self.write_catalog(
                repo_root,
                [("contact_tamper_pet", pet_root)],
            )
            self.build_pet(
                repo_root,
                "contact_tamper_pet",
                isolated=False,
            )
            contact_path = pet_root / portrait.CONTACT_SHEET_PATH
            with Image.open(contact_path) as opened:
                changed = opened.copy()
            changed.putpixel((1500, 1100), (255, 0, 0, 255))
            changed.save(contact_path, format="PNG")
            metadata_path = pet_root / portrait.METADATA_PATH
            metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
            with Image.open(contact_path) as opened:
                opened.load()
                record = metadata["evidence"]["contactSheet"]
                record["sha256"] = portrait.sha256_file(contact_path)
                record["rgbaSha256"] = portrait.rgba_hash(
                    opened.convert("RGBA")
                )
                record["width"] = opened.width
                record["height"] = opened.height
                record["mode"] = opened.mode
                record["format"] = opened.format
            metadata_path.write_text(
                json.dumps(metadata, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
            result = self.audit_catalog(repo_root, catalog)
            self.assertEqual(result["status"], "failed")
            self.assertTrue(
                any(
                    "contactSheet 无法从 1024 master 精确重放" in error
                    for error in result["errors"]
                ),
                result["errors"],
            )

    def test_approved_status_without_decision_and_ownership_truth_fails(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            repo_root = Path(temporary) / "repo"
            pet_root = self.pet_root(repo_root, "false_approval_pet")
            catalog = self.write_catalog(
                repo_root,
                [("false_approval_pet", pet_root)],
            )
            self.build_pet(
                repo_root,
                "false_approval_pet",
                isolated=False,
            )
            metadata_path = pet_root / portrait.METADATA_PATH
            metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
            metadata["ownerReview"]["status"] = "approved"
            metadata["ownerReview"]["evidencePaths"] = [
                (pet_root / portrait.CONTACT_SHEET_PATH)
                .relative_to(repo_root)
                .as_posix()
            ]
            metadata_path.write_text(
                json.dumps(metadata, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
            result = self.audit_catalog(repo_root, catalog)
            self.assertEqual(result["status"], "failed")
            self.assertTrue(
                any(
                    "ownership owner-review 状态不一致" in error
                    or "ownerDecision" in error
                    for error in result["errors"]
                ),
                result["errors"],
            )

    def test_pending_status_rejects_lingering_owner_decision_file(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            repo_root = Path(temporary) / "repo"
            pet_root = self.pet_root(repo_root, "pending_decision_pet")
            catalog = self.write_catalog(
                repo_root,
                [("pending_decision_pet", pet_root)],
            )
            self.build_pet(
                repo_root,
                "pending_decision_pet",
                isolated=False,
            )
            decision_path = pet_root / portrait.OWNER_DECISION_PATH
            decision_path.parent.mkdir(parents=True, exist_ok=True)
            decision_path.write_text("{}\n", encoding="utf-8")
            result = self.audit_catalog(repo_root, catalog)
            self.assertEqual(result["status"], "failed")
            self.assertTrue(
                any(
                    "owner_review_pending 不得遗留 owner-decision.json"
                    in error
                    for error in result["errors"]
                ),
                result["errors"],
            )

    def test_approved_status_passes_with_bound_decision_and_evidence(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            repo_root = Path(temporary) / "repo"
            pet_root = self.pet_root(repo_root, "approved_pet")
            catalog = self.write_catalog(
                repo_root,
                [("approved_pet", pet_root)],
            )
            self.build_pet(
                repo_root,
                "approved_pet",
                isolated=False,
            )
            decision_sha = self.write_owner_approval(
                repo_root,
                pet_root,
                "approved_pet",
            )
            with mock.patch.object(
                audit,
                "TRUSTED_OWNER_DECISION_SHA256_BY_FORM",
                {"approved_pet": frozenset({decision_sha})},
            ):
                result = self.audit_catalog(repo_root, catalog)
            self.assertEqual(result["status"], "ok", result["errors"])
            self.assertFalse(result["releaseGate"])
            self.assertFalse(result["semanticIndependenceVerified"])
            self.assertFalse(result["ownerDecisionRequired"])
            self.assertEqual(
                result["ownerDecisionStatus"],
                "approved",
            )
            self.assertEqual(
                result["entries"][0]["ownerReviewStatus"],
                "approved",
            )

    def test_exact_looking_self_approval_without_trust_anchor_fails(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            repo_root = Path(temporary) / "repo"
            pet_root = self.pet_root(repo_root, "self_approved_pet")
            catalog = self.write_catalog(
                repo_root,
                [("self_approved_pet", pet_root)],
            )
            self.build_pet(
                repo_root,
                "self_approved_pet",
                isolated=False,
            )
            self.write_owner_approval(
                repo_root,
                pet_root,
                "self_approved_pet",
            )
            result = self.audit_catalog(repo_root, catalog)
            self.assertEqual(result["status"], "failed")
            self.assertTrue(
                any(
                    "未登记为项目 owner 显式接受的可信摘要" in error
                    for error in result["errors"]
                ),
                result["errors"],
            )

    def test_approved_evidence_content_requires_matching_sha256(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            repo_root = Path(temporary) / "repo"
            pet_root = self.pet_root(repo_root, "evidence_hash_pet")
            catalog = self.write_catalog(
                repo_root,
                [("evidence_hash_pet", pet_root)],
            )
            self.build_pet(
                repo_root,
                "evidence_hash_pet",
                isolated=False,
            )
            decision_sha = self.write_owner_approval(
                repo_root,
                pet_root,
                "evidence_hash_pet",
                evidence_sha256="0" * 64,
            )
            with mock.patch.object(
                audit,
                "TRUSTED_OWNER_DECISION_SHA256_BY_FORM",
                {"evidence_hash_pet": frozenset({decision_sha})},
            ):
                result = self.audit_catalog(repo_root, catalog)
            self.assertEqual(result["status"], "failed")
            self.assertTrue(
                any(
                    ".sha256 与 evidence 内容不一致" in error
                    for error in result["errors"]
                ),
                result["errors"],
            )

    def test_approved_decision_requires_exact_project_owner_identity(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            repo_root = Path(temporary) / "repo"
            pet_root = self.pet_root(repo_root, "agent_approval_pet")
            catalog = self.write_catalog(
                repo_root,
                [("agent_approval_pet", pet_root)],
            )
            self.build_pet(
                repo_root,
                "agent_approval_pet",
                isolated=False,
            )
            decision_sha = self.write_owner_approval(
                repo_root,
                pet_root,
                "agent_approval_pet",
                owner_id="agent-self-approval",
            )
            with mock.patch.object(
                audit,
                "TRUSTED_OWNER_DECISION_SHA256_BY_FORM",
                {"agent_approval_pet": frozenset({decision_sha})},
            ):
                result = self.audit_catalog(repo_root, catalog)
            self.assertEqual(result["status"], "failed")
            self.assertTrue(
                any(
                    "ownerDecision.ownerId 与批准证据不一致" in error
                    for error in result["errors"]
                ),
                result["errors"],
            )

    def test_approved_decision_subject_must_bind_current_portrait(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            repo_root = Path(temporary) / "repo"
            pet_root = self.pet_root(repo_root, "subject_binding_pet")
            catalog = self.write_catalog(
                repo_root,
                [("subject_binding_pet", pet_root)],
            )
            self.build_pet(
                repo_root,
                "subject_binding_pet",
                isolated=False,
            )
            self.write_owner_approval(
                repo_root,
                pet_root,
                "subject_binding_pet",
            )
            decision_path = pet_root / portrait.OWNER_DECISION_PATH
            decision = json.loads(
                decision_path.read_text(encoding="utf-8")
            )
            decision["subject"]["formId"] = "another_pet"
            decision_path.write_text(
                json.dumps(decision, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
            decision_sha = portrait.sha256_file(decision_path)
            metadata_path = pet_root / portrait.METADATA_PATH
            metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
            metadata["ownerReview"]["decision"]["sha256"] = decision_sha
            metadata_path.write_text(
                json.dumps(metadata, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
            with mock.patch.object(
                audit,
                "TRUSTED_OWNER_DECISION_SHA256_BY_FORM",
                {"subject_binding_pet": frozenset({decision_sha})},
            ):
                result = self.audit_catalog(repo_root, catalog)
            self.assertEqual(result["status"], "failed")
            self.assertTrue(
                any(
                    "ownerDecision.subject 未绑定当前 "
                    "form/root/portrait" in error
                    for error in result["errors"]
                ),
                result["errors"],
            )

    def test_composition_audit_uses_fixed_alpha_eight_not_bundle_threshold(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            repo_root = Path(temporary) / "repo"
            pet_root = self.pet_root(repo_root, "alpha_threshold_pet")
            catalog = self.write_catalog(
                repo_root,
                [("alpha_threshold_pet", pet_root)],
            )
            self.build_pet(
                repo_root,
                "alpha_threshold_pet",
                isolated=False,
                alpha_threshold=127,
            )
            runtime_path = pet_root / portrait.RUNTIME_PATH
            with Image.open(runtime_path) as opened:
                runtime = opened.convert("RGBA")
            runtime.putpixel((40, 256), (255, 255, 255, 9))
            runtime.save(runtime_path, format="PNG")
            metadata_path = pet_root / portrait.METADATA_PATH
            metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
            runtime_record = metadata["assets"]["runtime"]
            runtime_record["sha256"] = portrait.sha256_file(runtime_path)
            runtime_record["rgbaSha256"] = portrait.rgba_hash(runtime)
            metadata_path.write_text(
                json.dumps(metadata, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
            result = self.audit_catalog(repo_root, catalog)
            self.assertEqual(result["status"], "failed")
            self.assertTrue(
                any(
                    "runtime composition 按固定 alpha>=8 审计失败" in error
                    for error in result["errors"]
                ),
                result["errors"],
            )

    def test_safe_margin_contract_cannot_claim_old_three_percent_threshold(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            repo_root = Path(temporary) / "repo"
            pet_root = self.pet_root(repo_root, "old_margin_claim_pet")
            catalog = self.write_catalog(
                repo_root,
                [("old_margin_claim_pet", pet_root)],
            )
            self.build_pet(
                repo_root,
                "old_margin_claim_pet",
                isolated=False,
            )
            metadata_path = pet_root / portrait.METADATA_PATH
            metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
            metadata["processing"]["safeMarginContract"] = {
                "version": 1,
                "minimumRatio": 0.03125,
                "rounding": "ceil",
                "masterPixels": 32,
                "runtimePixels": 16,
            }
            metadata_path.write_text(
                json.dumps(metadata, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
            result = self.audit_catalog(repo_root, catalog)
            self.assertEqual(result["status"], "failed")
            self.assertTrue(
                any(
                    "safeMarginContract 必须严格为 8% ceil 门槛" in error
                    for error in result["errors"]
                ),
                result["errors"],
            )

    def test_symlink_alias_under_pet_root_fails(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            temp_root = Path(temporary)
            repo_root = temp_root / "repo"
            pet_root = self.pet_root(repo_root, "symlink_pet")
            catalog = self.write_catalog(
                repo_root,
                [("symlink_pet", pet_root)],
            )
            self.build_pet(
                repo_root,
                "symlink_pet",
                isolated=False,
            )
            outside = temp_root / "outside.png"
            shutil.copy2(pet_root / portrait.RUNTIME_PATH, outside)
            alias = pet_root / "source/formal-production/alias.png"
            alias.parent.mkdir(parents=True, exist_ok=True)
            alias.symlink_to(outside)
            result = self.audit_catalog(repo_root, catalog)
            self.assertEqual(result["status"], "failed")
            self.assertTrue(
                any("符号链接" in error for error in result["errors"]),
                result["errors"],
            )

    def test_two_isolated_form_ids_cannot_alias_one_pet_root(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            repo_root = Path(temporary) / "repo"
            pet_root = self.build_pet(
                repo_root,
                "isolated_root_owner",
                isolated=True,
            )
            relative = pet_root.relative_to(repo_root)
            result = audit.audit_portraits(
                repo_root=repo_root,
                isolated_roots=(
                    ("isolated_root_owner", relative),
                    ("isolated_root_alias", relative),
                ),
                mode="isolated-only",
            )
            self.assertEqual(result["status"], "failed")
            self.assertTrue(
                any(
                    "跨来源重复 portrait petRoot" in error
                    for error in result["errors"]
                ),
                result["errors"],
            )

    def test_attestation_extra_field_fails_after_hash_record_rewrite(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            repo_root = Path(temporary) / "repo"
            pet_root = self.pet_root(repo_root, "attestation_tamper_pet")
            catalog = self.write_catalog(
                repo_root,
                [("attestation_tamper_pet", pet_root)],
            )
            self.build_pet(
                repo_root,
                "attestation_tamper_pet",
                isolated=False,
            )
            attestation_path = pet_root / portrait.ATTESTATION_PATH
            attestation = json.loads(
                attestation_path.read_text(encoding="utf-8")
            )
            attestation["untrustedClaim"] = True
            attestation_path.write_text(
                json.dumps(attestation, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
            metadata_path = pet_root / portrait.METADATA_PATH
            metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
            metadata["source"]["generationAttestation"][
                "sha256"
            ] = portrait.sha256_file(attestation_path)
            metadata_path.write_text(
                json.dumps(metadata, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
            result = self.audit_catalog(repo_root, catalog)
            self.assertEqual(result["status"], "failed")
            self.assertTrue(
                any(
                    "字段集合不符合严格 schema" in error
                    for error in result["errors"]
                ),
                result["errors"],
            )

    def test_request_argument_snapshot_rejects_release_claims_and_drift(
        self,
    ) -> None:
        cases = (
            (
                "automatic_approval",
                ("automaticApprovalEligible", True),
                "automaticApprovalEligible 必须为 false",
            ),
            (
                "nested_release_gate",
                ("releaseGate", "approved"),
                "requestArgumentBinding 字段集合不符合严格 schema",
            ),
            (
                "prompt_hash_drift",
                ("prompt.requestPromptUtf8Sha256", "0" * 64),
                "未绑定 portrait prompt metadata",
            ),
        )
        for case_name, (field, value), expected_error in cases:
            with self.subTest(case=case_name):
                with tempfile.TemporaryDirectory() as temporary:
                    repo_root = Path(temporary) / "repo"
                    form_id = f"request_snapshot_{case_name}_pet"
                    pet_root = self.pet_root(repo_root, form_id)
                    catalog = self.write_catalog(
                        repo_root,
                        [(form_id, pet_root)],
                    )
                    self.build_pet(
                        repo_root,
                        form_id,
                        isolated=False,
                    )
                    attestation_path = (
                        pet_root / portrait.ATTESTATION_PATH
                    )
                    attestation = json.loads(
                        attestation_path.read_text(encoding="utf-8")
                    )
                    binding = attestation[
                        "generationResultEvidence"
                    ]["transcriptEvidence"]["requestArgumentBinding"]
                    if field.startswith("prompt."):
                        binding["prompt"][field.removeprefix("prompt.")] = (
                            value
                        )
                    else:
                        binding[field] = value
                    attestation_path.write_text(
                        json.dumps(
                            attestation,
                            ensure_ascii=False,
                            indent=2,
                        )
                        + "\n",
                        encoding="utf-8",
                    )
                    metadata_path = pet_root / portrait.METADATA_PATH
                    metadata = json.loads(
                        metadata_path.read_text(encoding="utf-8")
                    )
                    metadata["source"]["generationAttestation"][
                        "sha256"
                    ] = portrait.sha256_file(attestation_path)
                    metadata_path.write_text(
                        json.dumps(
                            metadata,
                            ensure_ascii=False,
                            indent=2,
                        )
                        + "\n",
                        encoding="utf-8",
                    )
                    result = self.audit_catalog(repo_root, catalog)
                    self.assertEqual(result["status"], "failed")
                    self.assertTrue(
                        any(
                            expected_error in error
                            for error in result["errors"]
                        ),
                        result["errors"],
                    )

    def test_formal_fusion_relocation_lineage_replays_current_production(
        self,
    ) -> None:
        repo_root = Path(__file__).resolve().parents[2]
        form_id = "emberhorn_fusion_solar_crown_fire7_wind3"
        pet_root = repo_root / audit.FORMAL_IDENTITY_RELOCATION_ROOTS[
            form_id
        ]
        attestation = json.loads(
            (pet_root / portrait.ATTESTATION_PATH).read_text(
                encoding="utf-8"
            )
        )
        metadata = json.loads(
            (pet_root / portrait.METADATA_PATH).read_text(
                encoding="utf-8"
            )
        )
        errors: list[str] = []
        audit._check_request_argument_snapshot(
            value=attestation["generationResultEvidence"][
                "transcriptEvidence"
            ]["requestArgumentBinding"],
            generation_id=attestation["generationId"],
            form_id=form_id,
            repo_root=repo_root,
            identity_reference=metadata["identityReference"],
            prompt_record=metadata["prompt"],
            errors=errors,
            prefix=form_id,
        )
        self.assertEqual(errors, [])

    def test_formal_fusion_relocation_lineage_rejects_tamper_and_legacy_use(
        self,
    ) -> None:
        repo_root = Path(__file__).resolve().parents[2]
        form_id = "emberhorn_fusion_solar_crown_fire7_wind3"
        pet_root = repo_root / audit.FORMAL_IDENTITY_RELOCATION_ROOTS[
            form_id
        ]
        attestation = json.loads(
            (pet_root / portrait.ATTESTATION_PATH).read_text(
                encoding="utf-8"
            )
        )
        metadata = json.loads(
            (pet_root / portrait.METADATA_PATH).read_text(
                encoding="utf-8"
            )
        )
        baseline = attestation["generationResultEvidence"][
            "transcriptEvidence"
        ]["requestArgumentBinding"]
        cases = (
            (
                "extra_field",
                lambda binding: binding["referencedImages"][0][
                    "formalIdentityRelocation"
                ].__setitem__("releaseApproved", True),
                "字段集合不符合严格 schema",
            ),
            (
                "role",
                lambda binding: binding["referencedImages"][0].__setitem__(
                    "role",
                    "repository_reference",
                ),
                "role/matchesDeclaredIdentityReference 状态不一致",
            ),
            (
                "mode",
                lambda binding: binding["identityLineage"].__setitem__(
                    "mode",
                    "direct_declared_identity_reference",
                ),
                "formal relocation lineage 内容/role/mode 不一致",
            ),
            (
                "pipeline_hash",
                lambda binding: binding["referencedImages"][0][
                    "formalIdentityRelocation"
                ].__setitem__("pipelineMetadataSha256", "0" * 64),
                "attestation snapshot 与当前完整重放不一致",
            ),
            (
                "snapshot",
                lambda binding: binding["referencedImages"][0][
                    "formalIdentityRelocation"
                ].__setitem__("sourceSnapshotSha256", "0" * 64),
                "attestation snapshot 与当前完整重放不一致",
            ),
        )
        for case_name, mutate, expected_error in cases:
            with self.subTest(case=case_name):
                binding = copy.deepcopy(baseline)
                mutate(binding)
                errors: list[str] = []
                audit._check_request_argument_snapshot(
                    value=binding,
                    generation_id=attestation["generationId"],
                    form_id=form_id,
                    repo_root=repo_root,
                    identity_reference=metadata["identityReference"],
                    prompt_record=metadata["prompt"],
                    errors=errors,
                    prefix=form_id,
                )
                self.assertTrue(
                    any(expected_error in error for error in errors),
                    errors,
                )

        legacy_reference = copy.deepcopy(
            baseline["referencedImages"][0]
        )
        errors = []
        audit._check_request_reference_snapshot(
            value=legacy_reference,
            expected_index=0,
            form_id="legacy_pet",
            repo_root=repo_root,
            identity_reference=metadata["identityReference"],
            errors=errors,
            label="legacy_pet reference",
        )
        self.assertTrue(
            any(
                "legacy/non-fusion form 不得声明 formal relocation"
                in error
                for error in errors
            ),
            errors,
        )

    def test_exec_request_snapshot_is_never_a_production_candidate(
        self,
    ) -> None:
        errors: list[str] = []
        audit._check_request_argument_snapshot(
            value={
                "contract": "imagegen_request_arguments_binding_v1",
                "requestArgumentBindingVerified": False,
                "unverifiedReason": (
                    "exec_generation_has_no_direct_imagegen_function_call"
                ),
                "argumentsUtf8Sha256": None,
                "argumentsUtf8ByteLength": None,
                "argumentsCanonicalJsonSha256": None,
                "argumentKeys": [],
                "prompt": None,
                "documentedPrompt": {
                    "contract": (
                        "documented_prompt_not_request_binding_v1"
                    ),
                    "path": ".run/prompt.txt",
                    "fileSha256": "1" * 64,
                    "actualRequestPromptVerified": False,
                },
                "referenceMode": "unknown",
                "numLastImagesToInclude": None,
                "referencedImages": [],
                "identityLineage": {
                    "contract": "imagegen_request_identity_lineage_v1",
                    "verified": False,
                    "mode": "unavailable_exec_request_compatibility",
                    "predecessors": [],
                },
                "compatibilityMode": (
                    "historical_exec_no_direct_request_record_"
                    "owner_pending_v1"
                ),
                "automaticApprovalEligible": False,
                "currentReferencedImageContentBound": False,
                "historicalReferencedImageBytesVerified": False,
                "declaredIdentityReferenceIncluded": None,
                "claimLimit": "historical unverified exec snapshot",
            },
            generation_id=(
                "exec-51a1d98b-fcf7-4c75-bf24-43f7d8f1edbf"
            ),
            form_id="pet_rebirth_mm_stage2",
            repo_root=Path.cwd(),
            identity_reference={},
            prompt_record={},
            errors=errors,
            prefix="pet_rebirth_mm_stage2",
        )
        self.assertTrue(
            any(
                "任何 form 都不得进入 production candidate" in error
                for error in errors
            ),
            errors,
        )


if __name__ == "__main__":
    unittest.main()
