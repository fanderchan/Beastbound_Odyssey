#!/usr/bin/env python3
"""Focused positive/negative tests for tools/build_pet_portrait.py."""

from __future__ import annotations

import io
import base64
import hashlib
import json
import os
import re
import shutil
import sys
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from unittest import mock

import numpy as np
from PIL import Image, ImageDraw, PngImagePlugin


TOOLS_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TOOLS_DIR))

import build_pet_portrait as portrait  # noqa: E402


class PetPortraitBuilderTests(unittest.TestCase):
    def setUp(self) -> None:
        self._codex_state = tempfile.TemporaryDirectory(dir=Path.home())
        self.codex_home = Path(self._codex_state.name) / ".codex"
        self.codex_home.mkdir(parents=True)
        patcher = mock.patch.object(
            portrait,
            "_canonical_codex_home",
            return_value=self.codex_home,
        )
        patcher.start()
        self.addCleanup(patcher.stop)
        self.addCleanup(self._codex_state.cleanup)

    def _write_catalog(
        self,
        repo_root: Path,
        form_id: str,
        pet_root: Path,
    ) -> Path:
        path = repo_root / portrait.DEFAULT_CATALOG_PATH
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps(
                {
                    "schemaVersion": 1,
                    "forms": [
                        {
                            "formId": form_id,
                            "pet": {
                                "root": pet_root.relative_to(
                                    repo_root
                                ).as_posix(),
                                "metadataPath": (
                                    pet_root / "action-bundle-meta.json"
                                ).relative_to(repo_root).as_posix(),
                                "identityPath": (
                                    pet_root / "identity/identity-lock.md"
                                ).relative_to(repo_root).as_posix(),
                                "ownershipPath": (
                                    pet_root / "source-and-ownership.md"
                                ).relative_to(repo_root).as_posix(),
                                "promptPath": (
                                    pet_root / "prompts/identity-board-v1.txt"
                                ).relative_to(repo_root).as_posix(),
                                "portraitPath": (
                                    pet_root / portrait.RUNTIME_PATH
                                )
                                .relative_to(repo_root)
                                .as_posix(),
                            },
                        }
                    ],
                },
                ensure_ascii=False,
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
        return path

    def _generation_result_path(
        self,
        options: portrait.PortraitBuildOptions,
    ) -> Path:
        return options.input_path.parent / "result.txt"

    def _sync_generation_evidence(
        self,
        options: portrait.PortraitBuildOptions,
    ) -> None:
        if portrait.OPENAI_C2PA_MARKER not in options.input_path.read_bytes():
            with Image.open(options.input_path) as opened:
                rewritten = opened.copy()
            png_info = PngImagePlugin.PngInfo()
            png_info.add_text(
                "provenance",
                "OpenAI Media Service API",
            )
            rewritten.save(
                options.input_path,
                format="PNG",
                pnginfo=png_info,
            )
        result_path = self._generation_result_path(options)
        fields = portrait._parse_generation_result_fields(
            result_path.read_bytes()
        )
        source = Path(
            portrait._one_generation_result_value(
                fields,
                ("generatorresultpath",),
                "generator source",
            )
        )
        source.write_bytes(options.input_path.read_bytes())
        lines = result_path.read_text(encoding="utf-8").splitlines()
        lines = [
            (
                f"sha256: {portrait.sha256_file(options.input_path)}"
                if line.startswith("sha256:")
                else line
            )
            for line in lines
        ]
        result_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
        session_id = source.parent.name
        transcript = next(
            (self.codex_home / "sessions").glob(
                f"*/*/*/rollout-*-{session_id}.jsonl"
            )
        )
        call = {
            "type": "response_item",
            "payload": {
                "type": "function_call",
                "name": "imagegen",
                "namespace": "image_gen",
                "arguments": json.dumps(
                    {
                        "prompt": options.prompt_path.read_text(
                            encoding="utf-8"
                        ),
                        "referenced_image_paths": [
                            str(options.identity_reference)
                        ],
                    }
                ),
                "call_id": options.generation_id,
            },
        }
        event = {
            "type": "event_msg",
            "payload": {
                "type": "image_generation_end",
                "call_id": options.generation_id,
                "status": "completed",
                "saved_path": str(source),
                "result": base64.b64encode(source.read_bytes()).decode(
                    "ascii"
                ),
            },
        }
        records = [
            {
                "type": "session_meta",
                "payload": {
                    "id": session_id,
                    "session_id": session_id,
                },
            },
            call,
            event,
        ]
        transcript.write_text(
            "".join(
                json.dumps(record, separators=(",", ":")) + "\n"
                for record in records
            ),
            encoding="utf-8",
        )

    def _rewrite_attestation(
        self,
        options: portrait.PortraitBuildOptions,
    ) -> None:
        if options.generation_attestation.exists():
            options.generation_attestation.unlink()
        pipeline_path = (
            options.pet_root
            / "source/identity-board-pipeline-meta.json"
        )
        pipeline = json.loads(pipeline_path.read_text(encoding="utf-8"))
        with Image.open(options.identity_reference) as opened:
            identity_hash = portrait.rgba_hash(opened.convert("RGBA"))
        for frame in pipeline["frames"]:
            if frame.get("slot") == "front_3quarter_sw":
                frame["sourceRgbaSha256"] = identity_hash
        pipeline_path.write_text(
            json.dumps(pipeline, indent=2) + "\n",
            encoding="utf-8",
        )
        if options.isolated:
            action_path = options.pet_root / "action-bundle-meta.json"
            action = json.loads(action_path.read_text(encoding="utf-8"))
            gate = action["evidence"]["identityGateAudit"][
                "pipelineMetadata"
            ]
            gate["sha256"] = portrait.sha256_file(pipeline_path)
            gate["sources"]["front_3quarter_sw"][
                "canonicalRgbaSha256"
            ] = identity_hash
            action_path.write_text(
                json.dumps(action, indent=2) + "\n",
                encoding="utf-8",
            )
        self._sync_generation_evidence(options)
        portrait.write_generation_attestation(
            portrait.GenerationAttestationOptions(
                repo_root=options.repo_root,
                pet_root=options.pet_root,
                form_id=options.form_id,
                input_path=options.input_path,
                identity_reference=options.identity_reference,
                prompt_path=options.prompt_path,
                generation_result=self._generation_result_path(options),
                output_path=options.generation_attestation,
                generation_id=options.generation_id,
                catalog_path=options.catalog_path,
                isolated=options.isolated,
                key=options.key,
            )
        )

    def _transcript_records(
        self,
        options: portrait.PortraitBuildOptions,
    ) -> tuple[Path, list[dict[str, object]], Path]:
        fields = portrait._parse_generation_result_fields(
            self._generation_result_path(options).read_bytes()
        )
        source = Path(
            portrait._one_generation_result_value(
                fields,
                ("generatorresultpath",),
                "generator source",
            )
        )
        transcript = next(
            (self.codex_home / "sessions").glob(
                f"*/*/*/rollout-*-{source.parent.name}.jsonl"
            )
        )
        records = [
            json.loads(line)
            for line in transcript.read_text(
                encoding="utf-8"
            ).splitlines()
        ]
        return transcript, records, source

    def _write_transcript_records(
        self,
        transcript: Path,
        records: list[dict[str, object]],
    ) -> None:
        transcript.write_text(
            "".join(
                json.dumps(record, separators=(",", ":")) + "\n"
                for record in records
            ),
            encoding="utf-8",
        )

    def _write_generation_attestation(
        self,
        options: portrait.PortraitBuildOptions,
        *,
        generation_id: str | None = None,
    ) -> dict[str, object]:
        return portrait.write_generation_attestation(
            portrait.GenerationAttestationOptions(
                repo_root=options.repo_root,
                pet_root=options.pet_root,
                form_id=options.form_id,
                input_path=options.input_path,
                identity_reference=options.identity_reference,
                prompt_path=options.prompt_path,
                generation_result=self._generation_result_path(options),
                output_path=options.generation_attestation,
                generation_id=generation_id or options.generation_id,
                catalog_path=options.catalog_path,
                isolated=options.isolated,
                key=options.key,
            )
        )

    def fixture(
        self,
        root: Path,
        *,
        form_id: str = "fixture_pet",
        asset_folder: str | None = None,
        contaminated_edge: bool = True,
        isolated: bool = False,
        alpha_threshold: int = portrait.DEFAULT_ALPHA_THRESHOLD,
    ) -> portrait.PortraitBuildOptions:
        repo_root = root / "repo"
        pet_root = (
            repo_root
            / "client/godot/assets/pets"
            / (asset_folder or form_id)
        )
        identity_path = pet_root / "identity/front_3quarter_sw.png"
        identity_path.parent.mkdir(parents=True, exist_ok=True)
        identity = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
        identity_draw = ImageDraw.Draw(identity)
        identity_draw.polygon(
            ((256, 54), (432, 430), (80, 430)),
            fill=(45, 102, 178, 255),
        )
        identity_draw.rectangle(
            (220, 128, 292, 380),
            fill=(20, 62, 140, 255),
        )
        identity.save(identity_path, format="PNG")
        back_path = pet_root / "identity/back_3quarter_ne.png"
        identity.transpose(Image.Transpose.FLIP_LEFT_RIGHT).save(
            back_path,
            format="PNG",
        )
        identity_lock = pet_root / "identity/identity-lock.md"
        identity_lock.write_text(
            "# Identity Lock\n\n"
            + "The canonical front three-quarter identity is frozen. " * 5,
            encoding="utf-8",
        )
        (pet_root / "source-and-ownership.md").write_text(
            "# Source and ownership\n\nProject-directed test fixture identity.\n",
            encoding="utf-8",
        )
        identity_prompt = pet_root / "prompts/identity-board-v1.txt"
        identity_prompt.parent.mkdir(parents=True, exist_ok=True)
        identity_prompt.write_text(
            "Create the canonical identity board.\n",
            encoding="utf-8",
        )
        pipeline_path = (
            pet_root / "source/identity-board-pipeline-meta.json"
        )
        pipeline_path.parent.mkdir(parents=True, exist_ok=True)
        pipeline_path.write_text(
            json.dumps(
                {
                    "schemaVersion": 1,
                    "tool": "fixture",
                    "slots": [
                        "front_3quarter_sw",
                        "back_3quarter_ne",
                    ],
                    "frames": [
                        {
                            "slot": "front_3quarter_sw",
                            "sourceRgbaSha256": portrait.rgba_hash(
                                identity
                            ),
                        },
                        {
                            "slot": "back_3quarter_ne",
                            "sourceRgbaSha256": portrait.rgba_hash(
                                identity.transpose(
                                    Image.Transpose.FLIP_LEFT_RIGHT
                                )
                            ),
                        },
                    ],
                },
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
        action_meta: dict[str, object] = {
            "schemaVersion": 1,
            "formId": form_id,
            "artStatus": "owner_review_pending",
            "ownerReviewStatus": "pending",
            "identity": {
                "status": "self_review_passed_owner_pending",
                "identityLock": "identity/identity-lock.md",
                "poses": {
                    "front_3quarter_sw": (
                        "identity/front_3quarter_sw.png"
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
            action_meta["evidence"] = {
                "identityGateAudit": {
                    "pipelineMetadata": {
                        "path": (
                            "source/identity-board-pipeline-meta.json"
                        ),
                        "sha256": portrait.sha256_file(pipeline_path),
                        "sources": {
                            "front_3quarter_sw": {
                                "canonicalRgbaSha256": portrait.rgba_hash(
                                    identity
                                )
                            }
                        },
                    }
                }
            }
            isolated_ownership = (
                pet_root / "identity/source-and-ownership.md"
            )
            isolated_ownership.write_text(
                "# Isolated identity ownership\n\nFixture evidence.\n",
                encoding="utf-8",
            )
            isolated_prompt = pet_root / "prompts/identity.txt"
            isolated_prompt.write_text(
                "Create isolated identity.\n",
                encoding="utf-8",
            )
        (pet_root / "action-bundle-meta.json").write_text(
            json.dumps(action_meta, indent=2) + "\n",
            encoding="utf-8",
        )

        production = repo_root / ".run/portrait-source" / form_id
        production.mkdir(parents=True, exist_ok=True)
        input_path = production / "headshot-chroma.png"
        source = Image.new(
            "RGB",
            (portrait.MIN_SOURCE_SIZE, portrait.MIN_SOURCE_SIZE),
            portrait.DEFAULT_KEY,
        )
        draw = ImageDraw.Draw(source)
        edge = (
            (180, 40, 180)
            if contaminated_edge
            else (117, 72, 38)
        )
        draw.rounded_rectangle(
            (180, 96, 844, 900),
            radius=210,
            fill=(117, 72, 38),
            outline=edge,
            width=2,
        )
        draw.ellipse((340, 300, 420, 380), fill=(35, 204, 72))
        draw.ellipse((604, 300, 684, 380), fill=(35, 204, 72))
        draw.polygon(
            ((512, 410), (455, 550), (569, 550)),
            fill=(235, 184, 74),
        )
        png_info = PngImagePlugin.PngInfo()
        png_info.add_text(
            "provenance",
            "OpenAI Media Service API",
        )
        source.save(input_path, format="PNG", pnginfo=png_info)

        prompt_path = production / "prompt.txt"
        prompt_path.write_text(
            "Dedicated independently authored head-and-upper-body pet "
            "portrait on a solid #FF00FF chroma background. Never crop or "
            "derive it from full-body, world, battle, or identity artwork.\n",
            encoding="utf-8",
        )
        attestation_path = production / "generation-attestation.json"
        catalog_path = repo_root / portrait.DEFAULT_CATALOG_PATH
        if not isolated:
            catalog_path = self._write_catalog(repo_root, form_id, pet_root)
        else:
            catalog_path.parent.mkdir(parents=True, exist_ok=True)
            catalog_path.write_text(
                json.dumps(
                    {"schemaVersion": 1, "forms": []},
                    indent=2,
                )
                + "\n",
                encoding="utf-8",
            )
        generation_id = (
            "call_"
            + hashlib.sha256(form_id.encode()).hexdigest()[:24]
        )
        session_id = "123e4567-e89b-42d3-a456-426614174000"
        generator_source = (
            self.codex_home
            / "generated_images"
            / session_id
            / f"{generation_id}.png"
        )
        generator_source.parent.mkdir(parents=True, exist_ok=True)
        generator_source.write_bytes(input_path.read_bytes())
        transcript = (
            self.codex_home
            / "sessions/2026/07/29"
            / f"rollout-fixture-{session_id}.jsonl"
        )
        transcript.parent.mkdir(parents=True, exist_ok=True)
        transcript.write_text("", encoding="utf-8")
        result_path = production / "result.txt"
        result_path.write_text(
            "\n".join(
                (
                    f"formId: {form_id}",
                    "generator: built-in imagegen",
                    f"generatorCallId: {generation_id}",
                    f"generatorResultPath: {generator_source}",
                    "workspaceRawPath: "
                    + input_path.relative_to(repo_root).as_posix(),
                    f"sha256: {portrait.sha256_file(input_path)}",
                )
            )
            + "\n",
            encoding="utf-8",
        )
        selection_path = repo_root / portrait.SELECTED_SOURCES_PATH
        selection_path.parent.mkdir(parents=True, exist_ok=True)
        selection_path.write_text(
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
                            "input": input_path.relative_to(
                                repo_root
                            ).as_posix(),
                            "prompt": prompt_path.relative_to(
                                repo_root
                            ).as_posix(),
                            "result": result_path.relative_to(
                                repo_root
                            ).as_posix(),
                            "generationId": generation_id,
                            "key": "FF00FF",
                            "isolated": isolated,
                        }
                    ],
                },
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
        options = portrait.PortraitBuildOptions(
            repo_root=repo_root,
            pet_root=pet_root,
            form_id=form_id,
            input_path=input_path,
            identity_reference=identity_path,
            prompt_path=prompt_path,
            generation_attestation=attestation_path,
            generation_id=generation_id,
            catalog_path=catalog_path,
            isolated=isolated,
            alpha_threshold=alpha_threshold,
        )
        self._rewrite_attestation(options)
        return options

    def _formal_relocation_fixture(
        self,
        options: portrait.PortraitBuildOptions,
    ) -> tuple[Path, Path, Path]:
        """Build one hermetic final-schema closed-registration fixture."""

        if options.generation_attestation.exists():
            options.generation_attestation.unlink()
        source_root = (
            options.repo_root
            / ".run/formal-relocation-source"
            / options.form_id
            / "pet-root"
        )
        source_root.mkdir(parents=True, exist_ok=True)

        transcript, records, _ = self._transcript_records(options)
        call = records[1]["payload"]
        assert isinstance(call, dict)

        owner_visual_paths = (
            portrait._closed_registration_expected_owner_visual_paths()
        )
        visual_buffer = io.BytesIO()
        Image.new("RGBA", (8, 8), (43, 97, 151, 255)).save(
            visual_buffer,
            format="PNG",
        )
        visual_fixture_bytes = visual_buffer.getvalue()
        for relative in sorted(owner_visual_paths):
            destination = options.pet_root / relative
            if not destination.exists():
                destination.parent.mkdir(parents=True, exist_ok=True)
                destination.write_bytes(visual_fixture_bytes)

        source_raw = (
            source_root / portrait.CLOSED_REGISTRATION_IDENTITY_RAW_PATH
        )
        destination_raw = (
            options.pet_root
            / portrait.CLOSED_REGISTRATION_IDENTITY_RAW_PATH
        )
        source_raw.parent.mkdir(parents=True, exist_ok=True)
        destination_raw.parent.mkdir(parents=True, exist_ok=True)
        source_raw.write_bytes(visual_fixture_bytes)
        destination_raw.write_bytes(source_raw.read_bytes())
        raw_sha = portrait.sha256_file(source_raw)

        destination_pipeline = (
            options.pet_root
            / portrait.CLOSED_REGISTRATION_PIPELINE_PATH
        )
        pipeline = json.loads(
            destination_pipeline.read_text(encoding="utf-8")
        )
        old_input = source_raw.relative_to(
            options.repo_root
        ).as_posix()
        new_input = destination_raw.relative_to(
            options.repo_root
        ).as_posix()
        pipeline["input"] = old_input
        pipeline["inputSha256"] = raw_sha
        source_pipeline_bytes = (
            json.dumps(pipeline, indent=2) + "\n"
        ).encode("utf-8")
        old_input_token = json.dumps(old_input)
        new_input_token = json.dumps(new_input)
        self.assertEqual(
            source_pipeline_bytes.decode("utf-8").count(old_input_token),
            1,
        )
        candidate_pipeline_bytes = (
            source_pipeline_bytes.decode("utf-8").replace(
                old_input_token,
                new_input_token,
                1,
            )
        ).encode("utf-8")
        source_pipeline_sha = hashlib.sha256(
            source_pipeline_bytes
        ).hexdigest()
        candidate_pipeline_sha = hashlib.sha256(
            candidate_pipeline_bytes
        ).hexdigest()
        destination_pipeline.write_bytes(candidate_pipeline_bytes)

        def replay_sha(payload: bytes, raw_path: Path) -> str:
            value = json.loads(payload.decode("utf-8"))
            value["input"] = str(raw_path.resolve())
            replay = (
                json.dumps(
                    value,
                    ensure_ascii=False,
                    sort_keys=True,
                    separators=(",", ":"),
                )
                + "\n"
            ).encode("utf-8")
            return hashlib.sha256(replay).hexdigest()

        source_replay_sha = replay_sha(
            source_pipeline_bytes,
            source_raw,
        )
        candidate_replay_sha = replay_sha(
            candidate_pipeline_bytes,
            destination_raw,
        )

        source_meta = {
            "schemaVersion": 1,
            "pipelineMetadataSha256": source_pipeline_sha,
        }
        source_meta_bytes = (
            json.dumps(source_meta, indent=2) + "\n"
        ).encode("utf-8")
        candidate_source_meta_bytes = source_meta_bytes.replace(
            source_pipeline_sha.encode("ascii"),
            candidate_pipeline_sha.encode("ascii"),
            1,
        )
        destination_source_meta = (
            options.pet_root
            / portrait.CLOSED_REGISTRATION_SOURCE_META_PATH
        )
        destination_source_meta.parent.mkdir(parents=True, exist_ok=True)
        destination_source_meta.write_bytes(candidate_source_meta_bytes)

        action_path = (
            options.pet_root
            / portrait.CLOSED_REGISTRATION_ACTION_META_PATH
        )
        action = json.loads(action_path.read_text(encoding="utf-8"))
        action.update(
            {
                "displayName": "Fixture Fusion Pet",
                "runtimeEnabled": False,
                "rideableTarget": False,
                "ownerReviewStatus": "pending",
                "supportedMountedCharacterIds": [],
            }
        )
        action["evidence"] = {
            "identityGateAudit": {
                "pipelineMetadata": {
                    "sha256": source_pipeline_sha,
                    "metadataReplaySha256": source_replay_sha,
                }
            }
        }
        source_action_bytes = (
            json.dumps(action, indent=2) + "\n"
        ).encode("utf-8")
        candidate_action_bytes = source_action_bytes
        candidate_action_bytes = candidate_action_bytes.replace(
            source_pipeline_sha.encode("ascii"),
            candidate_pipeline_sha.encode("ascii"),
            1,
        )
        candidate_action_bytes = candidate_action_bytes.replace(
            source_replay_sha.encode("ascii"),
            candidate_replay_sha.encode("ascii"),
            1,
        )
        action_path.write_bytes(candidate_action_bytes)

        destination_files = [
            path
            for path in options.pet_root.rglob("*")
            if path.is_file()
            and not path.name.endswith(".import")
            and path
            != (
                options.pet_root
                / portrait.CLOSED_REGISTRATION_MANIFEST_PATH
            )
        ]
        engineering_paths = {
            path.relative_to(options.pet_root).as_posix()
            for path in destination_files
            if path.relative_to(options.pet_root).as_posix()
            not in owner_visual_paths
        }
        filler_index = 0
        while len(engineering_paths) < 230:
            relative = f"qa/engineering/fixture-{filler_index:03d}.bin"
            filler_index += 1
            if relative in engineering_paths:
                continue
            path = options.pet_root / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(f"engineering {relative}\n".encode("utf-8"))
            engineering_paths.add(relative)
        self.assertEqual(len(engineering_paths), 230)

        copied_paths = sorted(owner_visual_paths | engineering_paths)
        self.assertEqual(len(copied_paths), 675)
        for relative in copied_paths:
            destination = options.pet_root / relative
            source = source_root / relative
            source.parent.mkdir(parents=True, exist_ok=True)
            if relative == portrait.CLOSED_REGISTRATION_PIPELINE_PATH:
                source.write_bytes(source_pipeline_bytes)
            elif relative == portrait.CLOSED_REGISTRATION_SOURCE_META_PATH:
                source.write_bytes(source_meta_bytes)
            elif relative == portrait.CLOSED_REGISTRATION_ACTION_META_PATH:
                source.write_bytes(source_action_bytes)
            else:
                source.write_bytes(destination.read_bytes())

        relative_identity = Path("identity/front_3quarter_sw.png")
        historical_identity = source_root / relative_identity
        arguments = json.loads(call["arguments"])
        arguments["referenced_image_paths"] = [
            str(historical_identity)
        ]
        call["arguments"] = json.dumps(arguments)
        self._write_transcript_records(transcript, records)

        excluded_records: list[dict[str, object]] = []
        for relative in sorted(
            portrait.CLOSED_REGISTRATION_PORTRAIT_EXCLUDED_PATHS
        ):
            path = source_root / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(f"excluded {relative}\n".encode("utf-8"))
            excluded_records.append(
                {
                    "path": relative,
                    "sha256": portrait.sha256_file(path),
                    "size": path.stat().st_size,
                }
            )

        def file_record(root: Path, relative: str) -> dict[str, object]:
            path = root / relative
            return {
                "path": relative,
                "sha256": portrait.sha256_file(path),
                "size": path.stat().st_size,
            }

        copied_records = [
            file_record(options.pet_root, relative)
            for relative in copied_paths
        ]
        copied_by_path = {
            record["path"]: record for record in copied_records
        }
        owner_records = [
            copied_by_path[relative]
            for relative in sorted(owner_visual_paths)
        ]
        engineering_records = [
            copied_by_path[relative]
            for relative in sorted(engineering_paths)
        ]

        battle_digest = "1" * 64
        owner_decision_path = (
            options.repo_root
            / "client/godot/data/test-fusion-owner-decision.json"
        )
        owner_decision_path.parent.mkdir(parents=True, exist_ok=True)
        owner_decision = {
            "schemaVersion": 1,
            "decisionType": (
                "beastbound_pet_fusion_full_nonrideable_visual_owner_decision"
            ),
            "decision": "approved",
            "reviewer": "project-owner:fander",
            "approvedScopes": list(
                portrait.CLOSED_REGISTRATION_APPROVED_SCOPES
            ),
            "excludedScopes": list(
                portrait.CLOSED_REGISTRATION_EXCLUDED_SCOPES
            ),
            "evidence": {
                "forms": [
                    {
                        "formId": options.form_id,
                        "battleBundleDigest": battle_digest,
                    }
                ]
            },
            "releaseApproved": False,
            "runtimeEnabled": False,
        }
        owner_decision_path.write_text(
            json.dumps(owner_decision, indent=2) + "\n",
            encoding="utf-8",
        )
        owner_video_path = (
            options.repo_root / ".run/fixture-owner-review.mp4"
        )
        owner_video_path.parent.mkdir(parents=True, exist_ok=True)
        owner_video_path.write_bytes(b"fixture owner review video\n")

        relocation = {
            "path": portrait.CLOSED_REGISTRATION_PIPELINE_PATH,
            "field": "input",
            "from": old_input,
            "to": new_input,
            "sourceMetadataSha256": source_pipeline_sha,
            "sourceMetadataSize": len(source_pipeline_bytes),
            "candidateMetadataSha256": candidate_pipeline_sha,
            "candidateMetadataSize": len(candidate_pipeline_bytes),
            "inputAsset": {
                "path": new_input,
                "sha256": raw_sha,
            },
        }
        source_integrity = {
            "path": portrait.CLOSED_REGISTRATION_SOURCE_META_PATH,
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
                source_meta_bytes
            ).hexdigest(),
            "sourceMetadataSize": len(source_meta_bytes),
            "candidateMetadataSha256": hashlib.sha256(
                candidate_source_meta_bytes
            ).hexdigest(),
            "candidateMetadataSize": len(candidate_source_meta_bytes),
            "boundFile": {
                "path": (
                    options.pet_root
                    / portrait.CLOSED_REGISTRATION_PIPELINE_PATH
                )
                .relative_to(options.repo_root)
                .as_posix(),
                "sha256": candidate_pipeline_sha,
            },
        }
        action_integrity = {
            "path": portrait.CLOSED_REGISTRATION_ACTION_META_PATH,
            "field": (
                "evidence.identityGateAudit.pipelineMetadata.sha256"
            ),
            "from": source_pipeline_sha,
            "to": candidate_pipeline_sha,
            "fieldUpdates": [
                {
                    "field": (
                        "evidence.identityGateAudit.pipelineMetadata.sha256"
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
                    "from": source_replay_sha,
                    "to": candidate_replay_sha,
                },
            ],
            "sourceMetadataSha256": hashlib.sha256(
                source_action_bytes
            ).hexdigest(),
            "sourceMetadataSize": len(source_action_bytes),
            "candidateMetadataSha256": hashlib.sha256(
                candidate_action_bytes
            ).hexdigest(),
            "candidateMetadataSize": len(candidate_action_bytes),
            "boundFile": {
                "path": (
                    options.pet_root
                    / portrait.CLOSED_REGISTRATION_PIPELINE_PATH
                )
                .relative_to(options.repo_root)
                .as_posix(),
                "sha256": candidate_pipeline_sha,
            },
        }
        isolated_records = [dict(record) for record in copied_records]
        isolated_by_path = {
            record["path"]: record for record in isolated_records
        }
        for update in (
            relocation,
            source_integrity,
            action_integrity,
        ):
            isolated_by_path[update["path"]]["sha256"] = update[
                "sourceMetadataSha256"
            ]
            isolated_by_path[update["path"]]["size"] = update[
                "sourceMetadataSize"
            ]
        final_snapshot = hashlib.sha256(
            portrait._closed_registration_json_bytes(
                [*copied_records, *excluded_records]
            )
        ).hexdigest()
        isolated_snapshot = hashlib.sha256(
            portrait._closed_registration_json_bytes(
                [*isolated_records, *excluded_records]
            )
        ).hexdigest()

        manifest = {
            "schemaVersion": 1,
            "manifestType": "fusion_pet_closed_asset_copy_registration",
            "tool": "register_fusion_pet_closed_assets.py",
            "formId": options.form_id,
            "displayName": "Fixture Fusion Pet",
            "sourceRoot": source_root.relative_to(
                options.repo_root
            ).as_posix(),
            "destinationRoot": options.pet_root.relative_to(
                options.repo_root
            ).as_posix(),
            "lifecycle": {
                "registrationStatus": "engineering_closed_asset_copy",
                "runtimeEnabled": False,
                "rideable": False,
                "petArtCatalogEdited": False,
                "fusionRecipeCatalogEdited": False,
                "playerEntryOpened": False,
                "ownerVisualDecisionApprovesThisEngineeringRegistration": (
                    False
                ),
            },
            "frozenOwnerApproval": {
                "ownerDecision": {
                    "path": owner_decision_path.relative_to(
                        options.repo_root
                    ).as_posix(),
                    "sha256": portrait.sha256_file(owner_decision_path),
                },
                "ownerReviewVideo": {
                    "path": owner_video_path.relative_to(
                        options.repo_root
                    ).as_posix(),
                    "sha256": portrait.sha256_file(owner_video_path),
                    "playbackSpeed": "1.00x",
                },
                "scope": list(
                    portrait.CLOSED_REGISTRATION_APPROVED_SCOPES
                ),
                "excludedScope": list(
                    portrait.CLOSED_REGISTRATION_EXCLUDED_SCOPES
                ),
                "phase371BattleBundleDigest": battle_digest,
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
                "excludedFiles": excluded_records,
            },
            "sourceSnapshotSha256": final_snapshot,
            "copiedFiles": copied_records,
            "ownerApprovedVisualFiles": owner_records,
            "engineeringSupportFiles": engineering_records,
            "engineeringRelocations": [relocation],
            "engineeringIntegrityUpdates": [
                source_integrity,
                action_integrity,
            ],
            "isolatedSourceSnapshotSha256": isolated_snapshot,
        }
        manifest_path = (
            options.pet_root
            / portrait.CLOSED_REGISTRATION_MANIFEST_PATH
        )
        manifest_path.parent.mkdir(parents=True, exist_ok=True)
        manifest_path.write_bytes(
            portrait._closed_registration_json_bytes(manifest)
        )
        return historical_identity, manifest_path, owner_decision_path

    def test_dry_run_validates_but_writes_nothing(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            options = self.fixture(Path(temporary))
            metadata = portrait.build_portrait(options)
            attestation = json.loads(
                options.generation_attestation.read_text(encoding="utf-8")
            )
            transcript = attestation["generationResultEvidence"][
                "transcriptEvidence"
            ]
            self.assertEqual(
                transcript["contract"],
                "codex_imagegen_rollout_event_binding_v2",
            )
            request = transcript["requestArgumentBinding"]
            self.assertTrue(request["requestArgumentBindingVerified"])
            self.assertEqual(request["referenceMode"], "explicit_paths")
            self.assertTrue(
                request["declaredIdentityReferenceIncluded"]
            )
            self.assertFalse(
                request["historicalReferencedImageBytesVerified"]
            )
            self.assertEqual(
                request["prompt"]["selectedPromptRelation"],
                "selected_prompt_exact_ignoring_terminal_newlines_v1",
            )
            self.assertEqual(
                request["referencedImages"][0]["role"],
                "declared_identity_reference",
            )
            self.assertEqual(metadata["formId"], "fixture_pet")
            self.assertFalse(metadata["releaseGate"])
            self.assertFalse(attestation["releaseGate"])
            self.assertEqual(
                metadata["assets"]["runtime"]["width"],
                portrait.RUNTIME_SIZE,
            )
            self.assertFalse(
                (options.pet_root / portrait.RUNTIME_PATH).exists()
            )
            self.assertGreater(
                metadata["processing"]["alphaMatte"]["despill"][
                    "changedPixelCount"
                ],
                0,
            )
            self.assertEqual(
                metadata["processing"]["alphaMatte"]["despill"][
                    "alphaPixelsChanged"
                ],
                0,
            )
            self.assertFalse(
                metadata["processing"]["duplicateGuard"]["semanticProof"]
            )

    def test_formal_identity_relocation_is_attested_but_owner_pending(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            options = self.fixture(
                Path(temporary),
                form_id="fixture_fusion_pet",
            )
            _, manifest_path, _ = self._formal_relocation_fixture(options)

            attestation = self._write_generation_attestation(options)
            request = attestation["generationResultEvidence"][
                "transcriptEvidence"
            ]["requestArgumentBinding"]
            self.assertTrue(request["declaredIdentityReferenceIncluded"])
            self.assertEqual(
                request["identityLineage"]["mode"],
                "relocated_direct_declared_identity_reference",
            )
            reference = request["referencedImages"][0]
            self.assertEqual(
                reference["role"],
                "relocated_declared_identity_reference",
            )
            self.assertFalse(
                reference["matchesDeclaredIdentityReference"]
            )
            relocation = reference["formalIdentityRelocation"]
            self.assertEqual(
                relocation["contract"],
                "fusion_pet_formal_identity_relocation_v1",
            )
            self.assertEqual(
                relocation["manifestSha256"],
                portrait.sha256_file(manifest_path),
            )
            manifest = json.loads(
                manifest_path.read_text(encoding="utf-8")
            )
            self.assertEqual(
                relocation["pipelineMetadataSha256"],
                manifest["engineeringRelocations"][0][
                    "candidateMetadataSha256"
                ],
            )
            self.assertEqual(
                relocation["actionMetadataSha256"],
                manifest["engineeringIntegrityUpdates"][1][
                    "candidateMetadataSha256"
                ],
            )
            self.assertEqual(
                relocation["sourceSnapshotSha256"],
                manifest["sourceSnapshotSha256"],
            )
            self.assertEqual(
                relocation["isolatedSourceSnapshotSha256"],
                manifest["isolatedSourceSnapshotSha256"],
            )
            self.assertEqual(relocation["engineeringTransformCount"], 3)
            self.assertFalse(relocation["runtimeEnabled"])
            self.assertFalse(relocation["playerEntryOpened"])
            self.assertTrue(
                relocation["portraitOwnerApprovalExcluded"]
            )
            self.assertEqual(
                request["identityLineage"]["formalRelocations"],
                [relocation],
            )
            self.assertFalse(attestation["semanticIndependenceVerified"])
            self.assertFalse(attestation["releaseGate"])
            self.assertEqual(
                attestation["ownerReviewStatus"],
                "owner_review_pending",
            )
            portrait.build_portrait(options)

    def test_formal_identity_relocation_requires_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            options = self.fixture(
                Path(temporary),
                form_id="fixture_fusion_pet",
            )
            _, manifest_path, _ = self._formal_relocation_fixture(options)
            manifest_path.unlink()
            with self.assertRaisesRegex(
                portrait.PortraitBuildError,
                "未直接引用 declared identity",
            ):
                self._write_generation_attestation(options)

    def test_formal_identity_relocation_rejects_manifest_tamper(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            options = self.fixture(
                Path(temporary),
                form_id="fixture_fusion_pet",
            )
            _, manifest_path, _ = self._formal_relocation_fixture(options)
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            manifest["copiedFiles"][0]["sha256"] = "0" * 64
            manifest_path.write_text(
                json.dumps(manifest, indent=2) + "\n",
                encoding="utf-8",
            )
            with self.assertRaisesRegex(
                portrait.PortraitBuildError,
                "record 未逐字段复用 copied|SHA/size",
            ):
                self._write_generation_attestation(options)

    def test_formal_identity_relocation_rejects_manifest_key_order_drift(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            options = self.fixture(
                Path(temporary),
                form_id="fixture_fusion_pet",
            )
            _, manifest_path, _ = self._formal_relocation_fixture(options)
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            reordered = {
                "manifestType": manifest.pop("manifestType"),
                **manifest,
            }
            manifest_path.write_bytes(
                portrait._closed_registration_json_bytes(reordered)
            )
            with self.assertRaisesRegex(
                portrait.PortraitBuildError,
                "顶层字段顺序或集合漂移",
            ):
                self._write_generation_attestation(options)

    def test_formal_identity_relocation_requires_complete_integrity_chain(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            options = self.fixture(
                Path(temporary),
                form_id="fixture_fusion_pet",
            )
            _, manifest_path, _ = self._formal_relocation_fixture(options)
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            manifest["engineeringIntegrityUpdates"].pop()
            manifest_path.write_bytes(
                portrait._closed_registration_json_bytes(manifest)
            )
            with self.assertRaisesRegex(
                portrait.PortraitBuildError,
                "engineeringIntegrityUpdates 必须恰为 2",
            ):
                self._write_generation_attestation(options)

    def test_formal_identity_relocation_requires_action_replay_update(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            options = self.fixture(
                Path(temporary),
                form_id="fixture_fusion_pet",
            )
            _, manifest_path, _ = self._formal_relocation_fixture(options)
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            manifest["engineeringIntegrityUpdates"][1][
                "fieldUpdates"
            ].pop()
            manifest_path.write_bytes(
                portrait._closed_registration_json_bytes(manifest)
            )
            with self.assertRaisesRegex(
                portrait.PortraitBuildError,
                "integrity fieldUpdates 漂移",
            ):
                self._write_generation_attestation(options)

    def test_formal_identity_relocation_rejects_replay_digest_tamper(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            options = self.fixture(
                Path(temporary),
                form_id="fixture_fusion_pet",
            )
            _, manifest_path, _ = self._formal_relocation_fixture(options)
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            manifest["engineeringIntegrityUpdates"][1][
                "fieldUpdates"
            ][1]["to"] = "0" * 64
            manifest_path.write_bytes(
                portrait._closed_registration_json_bytes(manifest)
            )
            with self.assertRaisesRegex(
                portrait.PortraitBuildError,
                "integrity fieldUpdates 漂移",
            ):
                self._write_generation_attestation(options)

    def test_formal_identity_relocation_rejects_final_snapshot_tamper(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            options = self.fixture(
                Path(temporary),
                form_id="fixture_fusion_pet",
            )
            _, manifest_path, _ = self._formal_relocation_fixture(options)
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            manifest["sourceSnapshotSha256"] = "0" * 64
            manifest_path.write_bytes(
                portrait._closed_registration_json_bytes(manifest)
            )
            with self.assertRaisesRegex(
                portrait.PortraitBuildError,
                "final sourceSnapshot 重放失败",
            ):
                self._write_generation_attestation(options)

    def test_formal_identity_relocation_rejects_isolated_snapshot_tamper(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            options = self.fixture(
                Path(temporary),
                form_id="fixture_fusion_pet",
            )
            _, manifest_path, _ = self._formal_relocation_fixture(options)
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            manifest["isolatedSourceSnapshotSha256"] = "0" * 64
            manifest_path.write_bytes(
                portrait._closed_registration_json_bytes(manifest)
            )
            with self.assertRaisesRegex(
                portrait.PortraitBuildError,
                "isolatedSourceSnapshot 重放失败",
            ):
                self._write_generation_attestation(options)

    def test_formal_identity_relocation_rejects_partition_drift(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            options = self.fixture(
                Path(temporary),
                form_id="fixture_fusion_pet",
            )
            _, manifest_path, _ = self._formal_relocation_fixture(options)
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            moved = manifest["ownerApprovedVisualFiles"].pop()
            manifest["engineeringSupportFiles"].append(moved)
            manifest["engineeringSupportFiles"].sort(
                key=lambda record: record["path"]
            )
            manifest_path.write_bytes(
                portrait._closed_registration_json_bytes(manifest)
            )
            with self.assertRaisesRegex(
                portrait.PortraitBuildError,
                "精确分区漂移",
            ):
                self._write_generation_attestation(options)

    def test_formal_identity_relocation_rejects_unknown_product_file(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            options = self.fixture(
                Path(temporary),
                form_id="fixture_fusion_pet",
            )
            self._formal_relocation_fixture(options)
            rogue = options.pet_root / "qa/engineering/rogue.bin"
            rogue.write_bytes(b"rogue\n")
            with self.assertRaisesRegex(
                portrait.PortraitBuildError,
                "formal destination tree完整树与登记清单漂移",
            ):
                self._write_generation_attestation(options)

    def test_formal_identity_relocation_rejects_unknown_directory(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            options = self.fixture(
                Path(temporary),
                form_id="fixture_fusion_pet",
            )
            self._formal_relocation_fixture(options)
            (options.pet_root / "rogue-empty-directory").mkdir()
            with self.assertRaisesRegex(
                portrait.PortraitBuildError,
                "包含未登记目录",
            ):
                self._write_generation_attestation(options)

    def test_formal_identity_relocation_rejects_orphan_import(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            options = self.fixture(
                Path(temporary),
                form_id="fixture_fusion_pet",
            )
            self._formal_relocation_fixture(options)
            orphan = (
                options.pet_root / "qa/engineering/orphan.png.import"
            )
            orphan.write_bytes(b"import\n")
            with self.assertRaisesRegex(
                portrait.PortraitBuildError,
                "孤立或未登记 .import",
            ):
                self._write_generation_attestation(options)

    def test_formal_identity_relocation_accepts_registered_import_sidecar(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            options = self.fixture(
                Path(temporary),
                form_id="fixture_fusion_pet",
            )
            _, manifest_path, _ = self._formal_relocation_fixture(options)
            sidecar = Path(
                str(options.identity_reference) + ".import"
            )
            sidecar.write_bytes(b"valid generated import sidecar\n")
            attestation = self._write_generation_attestation(options)
            relocation = attestation["generationResultEvidence"][
                "transcriptEvidence"
            ]["requestArgumentBinding"]["referencedImages"][0][
                "formalIdentityRelocation"
            ]
            self.assertEqual(
                relocation["manifestSha256"],
                portrait.sha256_file(manifest_path),
            )

    def test_formal_identity_relocation_keeps_portrait_owner_pending(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            options = self.fixture(
                Path(temporary),
                form_id="fixture_fusion_pet",
            )
            _, manifest_path, _ = self._formal_relocation_fixture(options)
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            manifest["portrait"]["status"] = "owner_approved"
            manifest_path.write_bytes(
                portrait._closed_registration_json_bytes(manifest)
            )
            with self.assertRaisesRegex(
                portrait.PortraitBuildError,
                "portrait 排除状态漂移",
            ):
                self._write_generation_attestation(options)

    def test_formal_identity_relocation_rejects_wrong_form(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            options = self.fixture(
                Path(temporary),
                form_id="fixture_fusion_pet",
            )
            _, manifest_path, _ = self._formal_relocation_fixture(options)
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            manifest["formId"] = "different_fusion_pet"
            manifest_path.write_text(
                json.dumps(manifest, indent=2) + "\n",
                encoding="utf-8",
            )
            with self.assertRaisesRegex(
                portrait.PortraitBuildError,
                "formId 与正式 form 不一致",
            ):
                self._write_generation_attestation(options)

    def test_formal_identity_relocation_rejects_open_runtime(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            options = self.fixture(
                Path(temporary),
                form_id="fixture_fusion_pet",
            )
            _, manifest_path, _ = self._formal_relocation_fixture(options)
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            manifest["lifecycle"]["runtimeEnabled"] = True
            manifest_path.write_text(
                json.dumps(manifest, indent=2) + "\n",
                encoding="utf-8",
            )
            with self.assertRaisesRegex(
                portrait.PortraitBuildError,
                "lifecycle 未保持严格关闭",
            ):
                self._write_generation_attestation(options)

    def test_formal_identity_relocation_rejects_byte_mismatch(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            options = self.fixture(
                Path(temporary),
                form_id="fixture_fusion_pet",
            )
            historical_identity, _, _ = self._formal_relocation_fixture(
                options
            )
            historical_identity.write_bytes(
                historical_identity.read_bytes() + b"drift"
            )
            with self.assertRaisesRegex(
                portrait.PortraitBuildError,
                "isolated source tree完整树与登记清单漂移|"
                "旧/新 identity 当前字节不一致",
            ):
                self._write_generation_attestation(options)

    def test_catalog_can_bind_form_id_to_different_asset_folder(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            options = self.fixture(
                Path(temporary),
                form_id="logical_form",
                asset_folder="physical_asset_folder",
            )
            metadata = portrait.build_portrait(options)
            self.assertEqual(metadata["formId"], "logical_form")
            self.assertEqual(
                metadata["catalogBinding"]["petRoot"],
                "client/godot/assets/pets/physical_asset_folder",
            )

    def test_write_outputs_complete_contract_and_premultiplied_runtime(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            options = self.fixture(Path(temporary))
            options = portrait.PortraitBuildOptions(
                **{**options.__dict__, "write": True}
            )
            metadata = portrait.build_portrait(options)

            for relative in portrait.OUTPUT_PATHS:
                self.assertTrue(
                    (options.pet_root / relative).is_file(),
                    relative,
                )
            self.assertEqual(
                (
                    options.pet_root
                    / portrait.QA_GODOT_IGNORE_PATH
                ).read_bytes(),
                portrait.QA_GODOT_IGNORE_BYTES,
            )
            self.assertEqual(
                (
                    options.pet_root
                    / portrait.ORIGINAL_GENERATED_PNG_PATH
                ).read_bytes(),
                options.input_path.read_bytes(),
            )
            with Image.open(options.pet_root / portrait.MASTER_PATH) as master:
                self.assertEqual(master.size, (1024, 1024))
                self.assertEqual(master.mode, "RGBA")
                self.assertEqual(master.getpixel((0, 0))[3], 0)
                expected_runtime = portrait.resize_rgba_premultiplied(
                    master,
                    (512, 512),
                    resample_mode=portrait.PREMULTIPLIED_LANCZOS,
                )
            with Image.open(options.pet_root / portrait.RUNTIME_PATH) as runtime:
                runtime.load()
                self.assertEqual(runtime.size, (512, 512))
                self.assertEqual(runtime.mode, "RGBA")
                self.assertEqual(
                    portrait.rgba_hash(runtime),
                    portrait.rgba_hash(expected_runtime),
                )
            with Image.open(
                options.pet_root / portrait.ELIGIBILITY_MASK_PATH
            ) as mask:
                self.assertEqual(mask.mode, "L")
                self.assertGreater(np.count_nonzero(np.asarray(mask)), 0)
            stored = json.loads(
                (options.pet_root / portrait.METADATA_PATH).read_text(
                    encoding="utf-8"
                )
            )
            self.assertEqual(stored, metadata)
            self.assertEqual(
                stored["ownerReview"]["status"],
                "owner_review_pending",
            )
            self.assertEqual(stored["ownerReview"]["evidencePaths"], [])
            self.assertEqual(
                stored["source"]["generationAttestation"]["generationId"],
                options.generation_id,
            )

    def test_same_operation_despill_is_mask_bounded_and_alpha_stable(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            options = self.fixture(Path(temporary))
            with Image.open(options.input_path) as opened:
                source = opened.copy()
            cleaned, eligibility, _, metadata = portrait._matte_chroma(
                source,
                key=options.key,
                transparent_distance=options.transparent_distance,
                opaque_distance=options.opaque_distance,
                alpha_threshold=options.alpha_threshold,
            )
            rgba = np.asarray(source.convert("RGBA"), dtype=np.uint8).copy()
            rgb = rgba[:, :, :3].astype(np.float32)
            key = np.asarray(options.key, dtype=np.float32)
            distance = np.sqrt(np.sum(np.square(rgb - key), axis=2))
            candidate = distance < options.opaque_distance
            matte = np.ones(distance.shape, dtype=np.float32)
            span = options.opaque_distance - options.transparent_distance
            matte[candidate] = np.clip(
                (distance[candidate] - options.transparent_distance) / span,
                0.0,
                1.0,
            )
            alpha = np.rint(matte * 255.0).astype(np.uint8)
            alpha[alpha < options.alpha_threshold] = 0
            rgba[:, :, 3] = alpha
            rgba[alpha == 0, :3] = 0
            after = np.asarray(cleaned, dtype=np.uint8)
            changed = np.any(rgba[:, :, :3] != after[:, :, :3], axis=2)
            self.assertGreater(np.count_nonzero(changed), 0)
            self.assertEqual(np.count_nonzero(changed & ~eligibility), 0)
            self.assertTrue(np.array_equal(rgba[:, :, 3], after[:, :, 3]))
            self.assertEqual(
                metadata["despill"]["changedPixelCount"],
                int(np.count_nonzero(changed)),
            )

    def test_existing_output_is_permanently_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            options = self.fixture(Path(temporary))
            write = portrait.PortraitBuildOptions(
                **{**options.__dict__, "write": True}
            )
            portrait.build_portrait(write)
            runtime_path = write.pet_root / portrait.RUNTIME_PATH
            before = runtime_path.read_bytes()
            with self.assertRaisesRegex(
                portrait.PortraitBuildError,
                "永久拒绝覆盖",
            ):
                portrait.build_portrait(write)
            self.assertEqual(runtime_path.read_bytes(), before)
            self.assertNotIn("replace", portrait.PortraitBuildOptions.__dataclass_fields__)

    def test_late_created_sentinel_is_never_clobbered(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            options = self.fixture(Path(temporary))
            write = portrait.PortraitBuildOptions(
                **{**options.__dict__, "write": True}
            )
            original_link = os.link
            calls = 0
            sentinel = write.pet_root / portrait.OUTPUT_PATHS[0]

            def racing_link(
                source: Path,
                target: Path,
                *args: object,
                **kwargs: object,
            ) -> None:
                nonlocal calls
                calls += 1
                if calls == 1:
                    sentinel.parent.mkdir(parents=True, exist_ok=True)
                    sentinel.write_bytes(b"SENTINEL")
                original_link(source, target, *args, **kwargs)

            with mock.patch.object(
                portrait.os,
                "link",
                side_effect=racing_link,
            ):
                with self.assertRaisesRegex(
                    portrait.PortraitBuildError,
                    "拒绝覆盖",
                ):
                    portrait.build_portrait(write)
            self.assertEqual(sentinel.read_bytes(), b"SENTINEL")
            for relative in portrait.OUTPUT_PATHS[1:]:
                self.assertFalse((write.pet_root / relative).exists())

    def test_mid_commit_failure_rolls_back_every_installed_file(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            options = self.fixture(Path(temporary))
            write = portrait.PortraitBuildOptions(
                **{**options.__dict__, "write": True}
            )
            original_link = os.link
            calls = 0

            def flaky_link(
                source: Path,
                target: Path,
                *args: object,
                **kwargs: object,
            ) -> None:
                nonlocal calls
                calls += 1
                if calls == 4:
                    raise OSError("injected install failure")
                original_link(source, target, *args, **kwargs)

            with mock.patch.object(
                portrait.os,
                "link",
                side_effect=flaky_link,
            ):
                with self.assertRaisesRegex(
                    OSError,
                    "injected install failure",
                ):
                    portrait.build_portrait(write)
            for relative in portrait.OUTPUT_PATHS:
                self.assertFalse((write.pet_root / relative).exists(), relative)

    def test_catalog_binding_mismatch_fails(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            options = self.fixture(Path(temporary))
            catalog = json.loads(
                options.catalog_path.read_text(encoding="utf-8")
            )
            catalog["forms"][0]["pet"]["root"] = (
                "client/godot/assets/pets/other_root"
            )
            options.catalog_path.write_text(
                json.dumps(catalog) + "\n",
                encoding="utf-8",
            )
            with self.assertRaisesRegex(
                portrait.PortraitBuildError,
                "映射不一致",
            ):
                portrait.build_portrait(options)

    def test_isolated_mode_cannot_bypass_existing_catalog_mapping(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            options = self.fixture(Path(temporary))
            isolated = portrait.PortraitBuildOptions(
                **{**options.__dict__, "isolated": True}
            )
            with self.assertRaisesRegex(
                portrait.PortraitBuildError,
                "不能绕过已存在的 formal catalog",
            ):
                portrait.build_portrait(isolated)

    def test_generation_attestation_hash_drift_fails(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            options = self.fixture(Path(temporary))
            with Image.open(options.input_path) as opened:
                changed = opened.copy()
            changed.putpixel((512, 512), (7, 8, 9))
            changed.save(options.input_path, format="PNG")
            with self.assertRaisesRegex(
                portrait.PortraitBuildError,
                "selected output SHA-256|attestation.*绑定不一致",
            ):
                portrait.build_portrait(options)

    def test_attestation_writer_rejects_post_validation_input_mutation(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            options = self.fixture(Path(temporary))
            options.generation_attestation.unlink()
            original_identity_validation = (
                portrait._validate_identity_evidence
            )
            mutated = False

            def validate_identity_then_mutate_input(
                **kwargs: object,
            ) -> dict[str, object]:
                nonlocal mutated
                evidence = original_identity_validation(**kwargs)
                with Image.open(options.input_path) as opened:
                    changed = opened.convert("RGB")
                changed.putpixel((512, 512), (12, 34, 56))
                png_info = PngImagePlugin.PngInfo()
                png_info.add_text(
                    "provenance",
                    "OpenAI Media Service API",
                )
                changed.save(
                    options.input_path,
                    format="PNG",
                    pnginfo=png_info,
                )
                mutated = True
                return evidence

            with mock.patch.object(
                portrait,
                "_validate_identity_evidence",
                side_effect=validate_identity_then_mutate_input,
            ):
                with self.assertRaisesRegex(
                    portrait.PortraitBuildError,
                    "chroma 原图在入口 snapshot 后发生漂移",
                ):
                    self._write_generation_attestation(options)
            self.assertTrue(mutated)
            self.assertFalse(options.generation_attestation.exists())

    def test_build_rejects_post_attestation_input_mutation(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            options = self.fixture(Path(temporary))
            write = portrait.PortraitBuildOptions(
                **{**options.__dict__, "write": True}
            )
            original_prompt_payload = portrait._installed_prompt_payload
            mutated = False

            def prompt_payload_then_mutate_input(
                **kwargs: object,
            ) -> tuple[bytes, dict[str, object]]:
                nonlocal mutated
                payload = original_prompt_payload(**kwargs)
                with Image.open(options.input_path) as opened:
                    changed = opened.convert("RGB")
                changed.putpixel((512, 512), (91, 82, 73))
                png_info = PngImagePlugin.PngInfo()
                png_info.add_text(
                    "provenance",
                    "OpenAI Media Service API",
                )
                changed.save(
                    options.input_path,
                    format="PNG",
                    pnginfo=png_info,
                )
                mutated = True
                return payload

            with mock.patch.object(
                portrait,
                "_installed_prompt_payload",
                side_effect=prompt_payload_then_mutate_input,
            ):
                with self.assertRaisesRegex(
                    portrait.PortraitBuildError,
                    "chroma 原图在入口 snapshot 后发生漂移",
                ):
                    portrait.build_portrait(write)
            self.assertTrue(mutated)
            for relative in portrait.OUTPUT_PATHS:
                self.assertFalse((options.pet_root / relative).exists())
            self.assertFalse(
                (
                    options.pet_root
                    / portrait.INSTALL_TRANSACTION_PATH
                ).exists()
            )

    def test_prompt_must_explicitly_forbid_full_body_crop(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            options = self.fixture(Path(temporary))
            options.prompt_path.write_text(
                "Dedicated independently authored headshot portrait on "
                "solid chroma.\n",
                encoding="utf-8",
            )
            with self.assertRaisesRegex(
                portrait.PortraitBuildError,
                "明确禁止从全身图裁切",
            ):
                portrait.write_generation_attestation(
                    portrait.GenerationAttestationOptions(
                        repo_root=options.repo_root,
                        pet_root=options.pet_root,
                        form_id=options.form_id,
                        input_path=options.input_path,
                        identity_reference=options.identity_reference,
                        prompt_path=options.prompt_path,
                        generation_result=self._generation_result_path(
                            options
                        ),
                        output_path=(
                            options.input_path.parent / "invalid-prompt.json"
                        ),
                        generation_id=options.generation_id,
                        catalog_path=options.catalog_path,
                    )
                )
            with self.assertRaisesRegex(
                portrait.PortraitBuildError,
                "明确禁止从全身图裁切",
            ):
                portrait.build_portrait(options)

    def test_prompt_contract_accepts_real_structured_no_crop_phrasings(
        self,
    ) -> None:
        coordinated = (
            "Create one dedicated square pet head portrait. "
            "Do not redesign, recolor, add, remove, or crop any creature "
            "feature. No full-body pose."
        )
        ordered_negative_verbs = (
            "Create one dedicated square pet head portrait. "
            "Do not paste, crop, zoom, resize, trace, reframe, copy, "
            "extract, or mechanically transform either source image."
        )
        long_constraints_list = (
            "Create a dedicated head-and-upper-chest portrait. No full body. "
            "Constraints: Preserve the approved identity. "
            "No text, UI frame, badge, logo, watermark, cast shadow, speed "
            "FX, wings, lightning, horns, crystals, head leaves, extra "
            "plates, extra ears, extra tusks, cropped parts, edge-touching, "
            "photorealism, generic wolf/cat/pig, or chibi deformation."
        )
        avoid_list = (
            "Dedicated reusable pet portrait. "
            "Avoid: oversized bust, edge contact, cropped parts, full body."
        )
        avoid_list_with_source_before_crop = (
            "Dedicated independently drawn pet portrait, not a crop, "
            "zoom, trace, reframe, pasted excerpt, or reuse of the full-body "
            "reference. "
            "Avoid: full body, paws, legs, tail; cropped ears or markings."
        )
        self.assertTrue(
            portrait._prompt_declares_dedicated_no_crop(coordinated)
        )
        self.assertTrue(
            portrait._prompt_declares_dedicated_no_crop(
                ordered_negative_verbs
            )
        )
        self.assertTrue(
            portrait._prompt_declares_dedicated_no_crop(
                long_constraints_list
            )
        )
        self.assertTrue(
            portrait._prompt_declares_dedicated_no_crop(avoid_list)
        )
        self.assertTrue(
            portrait._prompt_declares_dedicated_no_crop(
                avoid_list_with_source_before_crop
            )
        )

    def test_prompt_contract_accepts_article_in_direct_no_crop_phrase(
        self,
    ) -> None:
        cases = (
            (
                "Create one dedicated pet head portrait. This is a framing "
                "correction, never a crop, zoom, trace, or asset extraction."
            ),
            (
                "Create one dedicated head-and-upper-chest portrait, never "
                "a crop, resize, trace, or reuse of the full-body art."
            ),
            (
                "Dedicated reusable portrait without a crop or trace from "
                "the identity board."
            ),
        )
        for prompt in cases:
            with self.subTest(prompt=prompt):
                self.assertTrue(
                    portrait._prompt_declares_dedicated_no_crop(prompt)
                )

    def test_prompt_contract_rejects_distant_or_cross_clause_no_crop(
        self,
    ) -> None:
        cases = (
            (
                "Dedicated head portrait. Constraints: No text, UI, or "
                "watermark. Crop the creature after rendering."
            ),
            (
                "Dedicated pet portrait. No redesign is requested in this "
                "discussion because the source may later be cropped."
            ),
            (
                "Dedicated headshot. Do not change the lighting, but crop "
                "any feature that touches the edge."
            ),
            (
                "Dedicated portrait. This is never merely a reference that "
                "might later require a crop during unrelated documentation."
            ),
            (
                "Dedicated pet portrait. Never crop from full body. "
                "No text, crop and reuse the identity board for the final "
                "portrait."
            ),
            (
                "Dedicated pet portrait. Never crop from full body. "
                "Negative prompt: no crop. Crop from the identity board."
            ),
            (
                "Dedicated pet portrait. Never crop from full body. "
                "Reframe the identity board into this portrait."
            ),
            (
                "Dedicated pet portrait. Never crop from full body. "
                "Zoom the identity board into this portrait."
            ),
            (
                "Dedicated pet portrait. Never crop from full body. "
                "Resize the identity board into this portrait."
            ),
            (
                "Dedicated pet portrait. Never crop from full body. "
                "Paste the identity board into this portrait."
            ),
        )
        for prompt in cases:
            with self.subTest(prompt=prompt):
                self.assertFalse(
                    portrait._prompt_declares_dedicated_no_crop(prompt)
                )

    def test_affirmative_derivation_bypass_fails_full_gate(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            options = self.fixture(Path(temporary))
            options.prompt_path.write_text(
                "Dedicated pet portrait. Never crop from full body. "
                "No text, crop and reuse the identity board for the final "
                "portrait.\n",
                encoding="utf-8",
            )
            with self.assertRaisesRegex(
                portrait.PortraitBuildError,
                "明确禁止从全身图裁切",
            ):
                portrait.write_generation_attestation(
                    portrait.GenerationAttestationOptions(
                        repo_root=options.repo_root,
                        pet_root=options.pet_root,
                        form_id=options.form_id,
                        input_path=options.input_path,
                        identity_reference=options.identity_reference,
                        prompt_path=options.prompt_path,
                        generation_result=self._generation_result_path(
                            options
                        ),
                        output_path=(
                            options.input_path.parent
                            / "affirmative-derivation.json"
                        ),
                        generation_id=options.generation_id,
                        catalog_path=options.catalog_path,
                    )
                )
            with self.assertRaisesRegex(
                portrait.PortraitBuildError,
                "明确禁止从全身图裁切",
            ):
                portrait.build_portrait(options)

    def test_source_smaller_than_1024_fails_even_with_valid_attestation(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            options = self.fixture(Path(temporary))
            with Image.open(options.input_path) as opened:
                smaller = opened.resize((512, 512))
            smaller.save(options.input_path, format="PNG")
            writer_output = options.input_path.parent / "small-source.json"
            with self.assertRaisesRegex(
                portrait.PortraitBuildError,
                "每边至少 1024",
            ):
                portrait.write_generation_attestation(
                    portrait.GenerationAttestationOptions(
                        repo_root=options.repo_root,
                        pet_root=options.pet_root,
                        form_id=options.form_id,
                        input_path=options.input_path,
                        identity_reference=options.identity_reference,
                        prompt_path=options.prompt_path,
                        generation_result=self._generation_result_path(
                            options
                        ),
                        output_path=writer_output,
                        generation_id=options.generation_id,
                        catalog_path=options.catalog_path,
                    )
                )
            attestation = json.loads(
                options.generation_attestation.read_text(encoding="utf-8")
            )
            with Image.open(options.input_path) as opened:
                opened.load()
                attestation["sourceInputRgbaSha256"] = portrait.rgba_hash(
                    opened.convert("RGBA")
                )
            attestation["sourceInputSha256"] = portrait.sha256_file(
                options.input_path
            )
            options.generation_attestation.write_text(
                json.dumps(attestation, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
            with self.assertRaisesRegex(
                portrait.PortraitBuildError,
                "每边至少 1024",
            ):
                portrait.build_portrait(options)

    def test_attestation_writer_cli_is_atomic_and_never_overwrites(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            options = self.fixture(Path(temporary))
            existing = options.generation_attestation
            before = existing.read_bytes()
            with self.assertRaisesRegex(
                portrait.PortraitBuildError,
                "永久拒绝覆盖",
            ):
                portrait.write_generation_attestation(
                    portrait.GenerationAttestationOptions(
                        repo_root=options.repo_root,
                        pet_root=options.pet_root,
                        form_id=options.form_id,
                        input_path=options.input_path,
                        identity_reference=options.identity_reference,
                        prompt_path=options.prompt_path,
                        generation_result=self._generation_result_path(
                            options
                        ),
                        output_path=existing,
                        generation_id=options.generation_id,
                        catalog_path=options.catalog_path,
                    )
                )
            self.assertEqual(existing.read_bytes(), before)

            race_output = (
                existing.parent / "race/generation-attestation.json"
            )
            original_link = os.link
            raced = False

            def race_attestation_link(
                source: object,
                target: object,
                *args: object,
                **kwargs: object,
            ) -> None:
                nonlocal raced
                if not raced:
                    raced = True
                    target_fd = os.open(
                        target,
                        os.O_WRONLY | os.O_CREAT | os.O_EXCL,
                        0o600,
                        dir_fd=kwargs["dst_dir_fd"],
                    )
                    with os.fdopen(target_fd, "wb") as handle:
                        handle.write(b"LATE-SENTINEL")
                original_link(source, target, *args, **kwargs)

            with mock.patch.object(
                portrait.os,
                "link",
                side_effect=race_attestation_link,
            ):
                with self.assertRaisesRegex(
                    portrait.PortraitBuildError,
                    "并发创建",
                ):
                    portrait.write_generation_attestation(
                        portrait.GenerationAttestationOptions(
                            repo_root=options.repo_root,
                            pet_root=options.pet_root,
                            form_id=options.form_id,
                            input_path=options.input_path,
                            identity_reference=options.identity_reference,
                            prompt_path=options.prompt_path,
                            generation_result=self._generation_result_path(
                                options
                            ),
                            output_path=race_output,
                            generation_id=options.generation_id,
                            catalog_path=options.catalog_path,
                        )
                    )
            self.assertEqual(race_output.read_bytes(), b"LATE-SENTINEL")

            with self.assertRaisesRegex(
                portrait.PortraitBuildError,
                "只能写入仓库 .run/",
            ):
                portrait.write_generation_attestation(
                    portrait.GenerationAttestationOptions(
                        repo_root=options.repo_root,
                        pet_root=options.pet_root,
                        form_id=options.form_id,
                        input_path=options.input_path,
                        identity_reference=options.identity_reference,
                        prompt_path=options.prompt_path,
                        generation_result=self._generation_result_path(
                            options
                        ),
                        output_path=options.repo_root / "unsafe.json",
                        generation_id=options.generation_id,
                        catalog_path=options.catalog_path,
                    )
                )

            cli_output = existing.parent / "cli-attestation.json"
            stdout = io.StringIO()
            with redirect_stdout(stdout):
                return_code = portrait.main(
                    [
                        "--repo-root",
                        str(options.repo_root),
                        "--pet-root",
                        str(options.pet_root),
                        "--form-id",
                        options.form_id,
                        "--input",
                        str(options.input_path),
                        "--identity-reference",
                        str(options.identity_reference),
                        "--prompt-file",
                        str(options.prompt_path),
                        "--generation-result",
                        str(self._generation_result_path(options)),
                        "--create-generation-attestation",
                        str(cli_output),
                        "--generation-id",
                        options.generation_id,
                        "--catalog",
                        str(options.catalog_path),
                    ]
                )
            self.assertEqual(return_code, 0)
            self.assertTrue(cli_output.is_file())
            result = json.loads(stdout.getvalue())
            self.assertEqual(result["mode"], "generation_attestation_write")

            stderr = io.StringIO()
            with redirect_stderr(stderr), self.assertRaises(SystemExit) as raised:
                portrait.main(
                    [
                        "--repo-root",
                        str(options.repo_root),
                        "--pet-root",
                        str(options.pet_root),
                        "--form-id",
                        options.form_id,
                        "--input",
                        str(options.input_path),
                        "--identity-reference",
                        str(options.identity_reference),
                        "--prompt-file",
                        str(options.prompt_path),
                        "--generation-result",
                        str(self._generation_result_path(options)),
                        "--create-generation-attestation",
                        str(cli_output),
                        "--generation-id",
                        options.generation_id,
                        "--catalog",
                        str(options.catalog_path),
                    ]
                )
            self.assertEqual(raised.exception.code, 2)
            self.assertIn("拒绝覆盖", stderr.getvalue())

    def test_auxiliary_writers_pin_parent_fd_across_ancestor_swap(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            options = self.fixture(root)
            options.generation_attestation.unlink()
            output = (
                options.repo_root
                / ".run/fd-race/generation-attestation.json"
            )
            run_root = options.repo_root / ".run"
            held_run_root = options.repo_root / ".run-held"
            outside_run_root = root / "outside-run"
            outside_run_root.mkdir()
            original_token_hex = portrait.secrets.token_hex
            swapped = False

            def swap_run_ancestor(length: int) -> str:
                nonlocal swapped
                if not swapped:
                    swapped = True
                    run_root.rename(held_run_root)
                    run_root.symlink_to(
                        outside_run_root,
                        target_is_directory=True,
                    )
                return original_token_hex(length)

            try:
                with mock.patch.object(
                    portrait.secrets,
                    "token_hex",
                    side_effect=swap_run_ancestor,
                ):
                    with self.assertRaisesRegex(
                        portrait.PortraitBuildError,
                        "父目录已被移走或替换|安全目录",
                    ):
                        portrait.write_generation_attestation(
                            portrait.GenerationAttestationOptions(
                                repo_root=options.repo_root,
                                pet_root=options.pet_root,
                                form_id=options.form_id,
                                input_path=options.input_path,
                                identity_reference=(
                                    options.identity_reference
                                ),
                                prompt_path=options.prompt_path,
                                generation_result=(
                                    self._generation_result_path(options)
                                ),
                                output_path=output,
                                generation_id=options.generation_id,
                                catalog_path=options.catalog_path,
                            )
                        )
                self.assertEqual(
                    [path for path in outside_run_root.rglob("*")],
                    [],
                )
                self.assertFalse(
                    (
                        held_run_root
                        / "fd-race/generation-attestation.json"
                    ).exists()
                )
            finally:
                if run_root.is_symlink():
                    run_root.unlink()
                if held_run_root.exists():
                    held_run_root.rename(run_root)
            self.assertFalse(output.exists())

        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            options = self.fixture(
                root,
                form_id="wuli_normal_orange_fire10",
            )
            pipeline_path = (
                options.pet_root
                / "source/identity-board-pipeline-meta.json"
            )
            pipeline = json.loads(
                pipeline_path.read_text(encoding="utf-8")
            )
            pipeline["frames"][0].pop("sourceRgbaSha256")
            pipeline_path.write_text(
                json.dumps(pipeline, indent=2) + "\n",
                encoding="utf-8",
            )
            source_root = options.pet_root / "source"
            held_source_root = options.pet_root / "source-held"
            outside_source_root = root / "outside-source"
            outside_source_root.mkdir()
            original_token_hex = portrait.secrets.token_hex
            swapped = False

            def swap_source_ancestor(length: int) -> str:
                nonlocal swapped
                if not swapped:
                    swapped = True
                    source_root.rename(held_source_root)
                    source_root.symlink_to(
                        outside_source_root,
                        target_is_directory=True,
                    )
                return original_token_hex(length)

            try:
                with mock.patch.object(
                    portrait.secrets,
                    "token_hex",
                    side_effect=swap_source_ancestor,
                ):
                    with self.assertRaisesRegex(
                        portrait.PortraitBuildError,
                        "父目录已被移走或替换|安全目录",
                    ):
                        portrait.write_identity_freeze_ledger(
                            portrait.IdentityFreezeLedgerOptions(
                                repo_root=options.repo_root,
                                pet_root=options.pet_root,
                                form_id=options.form_id,
                                identity_reference=(
                                    options.identity_reference
                                ),
                                catalog_path=options.catalog_path,
                            )
                        )
                self.assertEqual(
                    [path for path in outside_source_root.rglob("*")],
                    [],
                )
                self.assertFalse(
                    (
                        held_source_root
                        / "portrait"
                        / portrait.IDENTITY_FREEZE_LEDGER_PATH.name
                    ).exists()
                )
            finally:
                if source_root.is_symlink():
                    source_root.unlink()
                if held_source_root.exists():
                    held_source_root.rename(source_root)
            self.assertFalse(
                (
                    options.pet_root
                    / portrait.IDENTITY_FREEZE_LEDGER_PATH
                ).exists()
            )

    def test_auxiliary_writers_reject_ordinary_output_parent_replacement(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            options = self.fixture(root)
            options.generation_attestation.unlink()
            output = (
                options.repo_root
                / ".run/ordinary-output/generation-attestation.json"
            )
            run_root = options.repo_root / ".run"
            held_run_root = options.repo_root / ".run-held"
            original_assert = portrait._assert_absolute_directory_binding
            swapped = False

            def replace_run_after_entry_pin(
                path: Path,
                pinned_fd: int,
                *,
                label: str,
            ) -> None:
                nonlocal swapped
                if (
                    not swapped
                    and label == "generation attestation repo root"
                ):
                    swapped = True
                    run_root.rename(held_run_root)
                    (run_root / "ordinary-output").mkdir(
                        parents=True
                    )
                original_assert(path, pinned_fd, label=label)

            try:
                with mock.patch.object(
                    portrait,
                    "_assert_absolute_directory_binding",
                    side_effect=replace_run_after_entry_pin,
                ):
                    with self.assertRaisesRegex(
                        portrait.PortraitBuildError,
                        "父目录 inode 漂移|父目录已被移走或替换",
                    ):
                        portrait.write_generation_attestation(
                            portrait.GenerationAttestationOptions(
                                repo_root=options.repo_root,
                                pet_root=options.pet_root,
                                form_id=options.form_id,
                                input_path=options.input_path,
                                identity_reference=(
                                    options.identity_reference
                                ),
                                prompt_path=options.prompt_path,
                                generation_result=(
                                    self._generation_result_path(options)
                                ),
                                output_path=output,
                                generation_id=options.generation_id,
                                catalog_path=options.catalog_path,
                            )
                        )
                self.assertTrue(swapped)
                self.assertFalse(output.exists())
                self.assertFalse(
                    (
                        held_run_root
                        / "ordinary-output/generation-attestation.json"
                    ).exists()
                )
            finally:
                if run_root.exists():
                    shutil.rmtree(run_root)
                if held_run_root.exists():
                    held_run_root.rename(run_root)

        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            options = self.fixture(
                root,
                form_id="wuli_normal_orange_fire10",
            )
            source_root = options.pet_root / "source"
            held_source_root = options.pet_root / "source-held"
            original_assert = portrait._assert_absolute_directory_binding
            swapped = False

            def replace_source_after_entry_pin(
                path: Path,
                pinned_fd: int,
                *,
                label: str,
            ) -> None:
                nonlocal swapped
                if (
                    not swapped
                    and label == "identity ledger repo root"
                ):
                    swapped = True
                    source_root.rename(held_source_root)
                    (source_root / "portrait").mkdir(parents=True)
                original_assert(path, pinned_fd, label=label)

            try:
                with mock.patch.object(
                    portrait,
                    "_assert_absolute_directory_binding",
                    side_effect=replace_source_after_entry_pin,
                ):
                    with self.assertRaisesRegex(
                        portrait.PortraitBuildError,
                        "父目录 inode 漂移|父目录已被移走或替换",
                    ):
                        portrait.write_identity_freeze_ledger(
                            portrait.IdentityFreezeLedgerOptions(
                                repo_root=options.repo_root,
                                pet_root=options.pet_root,
                                form_id=options.form_id,
                                identity_reference=(
                                    options.identity_reference
                                ),
                                catalog_path=options.catalog_path,
                            )
                        )
                self.assertTrue(swapped)
                self.assertFalse(
                    (
                        source_root
                        / "portrait"
                        / portrait.IDENTITY_FREEZE_LEDGER_PATH.name
                    ).exists()
                )
                self.assertFalse(
                    (
                        held_source_root
                        / "portrait"
                        / portrait.IDENTITY_FREEZE_LEDGER_PATH.name
                    ).exists()
                )
            finally:
                if source_root.exists():
                    shutil.rmtree(source_root)
                if held_source_root.exists():
                    held_source_root.rename(source_root)

    def test_auxiliary_writers_rollback_after_ordinary_post_publish_replacement(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            options = self.fixture(root)
            options.generation_attestation.unlink()
            output = (
                options.repo_root
                / ".run/ordinary-post/generation-attestation.json"
            )
            run_root = options.repo_root / ".run"
            held_run_root = options.repo_root / ".run-held"
            original_token_hex = portrait.secrets.token_hex
            swapped = False

            def replace_run_during_publish(length: int) -> str:
                nonlocal swapped
                if not swapped:
                    swapped = True
                    run_root.rename(held_run_root)
                    (run_root / "ordinary-post").mkdir(parents=True)
                return original_token_hex(length)

            try:
                with mock.patch.object(
                    portrait.secrets,
                    "token_hex",
                    side_effect=replace_run_during_publish,
                ):
                    with self.assertRaisesRegex(
                        portrait.PortraitBuildError,
                        "父目录 inode 漂移|父目录已被移走或替换",
                    ):
                        portrait.write_generation_attestation(
                            portrait.GenerationAttestationOptions(
                                repo_root=options.repo_root,
                                pet_root=options.pet_root,
                                form_id=options.form_id,
                                input_path=options.input_path,
                                identity_reference=(
                                    options.identity_reference
                                ),
                                prompt_path=options.prompt_path,
                                generation_result=(
                                    self._generation_result_path(options)
                                ),
                                output_path=output,
                                generation_id=options.generation_id,
                                catalog_path=options.catalog_path,
                            )
                        )
                self.assertTrue(swapped)
                self.assertFalse(output.exists())
                self.assertFalse(
                    (
                        held_run_root
                        / "ordinary-post/generation-attestation.json"
                    ).exists()
                )
            finally:
                if run_root.exists():
                    shutil.rmtree(run_root)
                if held_run_root.exists():
                    held_run_root.rename(run_root)

        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            options = self.fixture(
                root,
                form_id="wuli_normal_orange_fire10",
            )
            source_root = options.pet_root / "source"
            held_source_root = options.pet_root / "source-held"
            original_token_hex = portrait.secrets.token_hex
            swapped = False

            def replace_source_during_publish(length: int) -> str:
                nonlocal swapped
                if not swapped:
                    swapped = True
                    source_root.rename(held_source_root)
                    (source_root / "portrait").mkdir(parents=True)
                return original_token_hex(length)

            try:
                with mock.patch.object(
                    portrait.secrets,
                    "token_hex",
                    side_effect=replace_source_during_publish,
                ):
                    with self.assertRaisesRegex(
                        portrait.PortraitBuildError,
                        "父目录 inode 漂移|父目录已被移走或替换",
                    ):
                        portrait.write_identity_freeze_ledger(
                            portrait.IdentityFreezeLedgerOptions(
                                repo_root=options.repo_root,
                                pet_root=options.pet_root,
                                form_id=options.form_id,
                                identity_reference=(
                                    options.identity_reference
                                ),
                                catalog_path=options.catalog_path,
                            )
                        )
                self.assertTrue(swapped)
                self.assertFalse(
                    (
                        source_root
                        / "portrait"
                        / portrait.IDENTITY_FREEZE_LEDGER_PATH.name
                    ).exists()
                )
                self.assertFalse(
                    (
                        held_source_root
                        / "portrait"
                        / portrait.IDENTITY_FREEZE_LEDGER_PATH.name
                    ).exists()
                )
            finally:
                if source_root.exists():
                    shutil.rmtree(source_root)
                if held_source_root.exists():
                    held_source_root.rename(source_root)

    def test_build_pins_pet_root_before_validation(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            options = self.fixture(Path(temporary))
            write = portrait.PortraitBuildOptions(
                **{**options.__dict__, "write": True}
            )
            pet_root = options.pet_root
            held_pet_root = pet_root.with_name(f"{pet_root.name}-held")
            original_validate = portrait.validate_options
            swapped = False

            def validate_then_replace(
                candidate: portrait.PortraitBuildOptions,
            ) -> portrait.PortraitBuildOptions:
                nonlocal swapped
                normalized = original_validate(candidate)
                pet_root.rename(held_pet_root)
                shutil.copytree(held_pet_root, pet_root)
                swapped = True
                return normalized

            try:
                with mock.patch.object(
                    portrait,
                    "validate_options",
                    side_effect=validate_then_replace,
                ):
                    with self.assertRaisesRegex(
                        portrait.PortraitBuildError,
                        "pet root inode 已被替换",
                    ):
                        portrait.build_portrait(write)
                self.assertTrue(swapped)
                for relative in portrait.OUTPUT_PATHS:
                    self.assertFalse((pet_root / relative).exists())
                    self.assertFalse(
                        (held_pet_root / relative).exists()
                    )
            finally:
                if pet_root.exists():
                    shutil.rmtree(pet_root)
                if held_pet_root.exists():
                    held_pet_root.rename(pet_root)

    def test_visible_subject_must_keep_four_edge_safe_margin(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            options = self.fixture(Path(temporary))
            with Image.open(options.input_path) as opened:
                changed = opened.copy()
            ImageDraw.Draw(changed).ellipse(
                (8, 480, 28, 500),
                fill=(40, 120, 220),
            )
            changed.save(options.input_path, format="PNG")
            self._rewrite_attestation(options)
            with self.assertRaisesRegex(
                portrait.PortraitBuildError,
                "四边安全距不足",
            ):
                portrait.build_portrait(options)

    def test_eight_percent_edge_margin_exact_boundary_passes_and_minus_one_fails(
        self,
    ) -> None:
        self.assertEqual(portrait.MIN_EDGE_MARGIN_RATIO, 0.08)
        self.assertEqual(portrait.MIN_MASTER_EDGE_MARGIN, 82)
        self.assertEqual(portrait.MIN_RUNTIME_EDGE_MARGIN, 41)
        for size, minimum_margin in (
            (portrait.MASTER_SIZE, portrait.MIN_MASTER_EDGE_MARGIN),
            (portrait.RUNTIME_SIZE, portrait.MIN_RUNTIME_EDGE_MARGIN),
        ):
            with self.subTest(size=size, case="exact"):
                exact = Image.new("RGBA", (size, size), (0, 0, 0, 0))
                ImageDraw.Draw(exact).rectangle(
                    (
                        minimum_margin,
                        minimum_margin,
                        size - minimum_margin - 1,
                        size - minimum_margin - 1,
                    ),
                    fill=(80, 140, 220, 255),
                )
                metrics = portrait.image_composition_metrics(
                    exact,
                    minimum_edge_margin=minimum_margin,
                )
                self.assertEqual(
                    metrics["edgeMargins"],
                    {
                        "left": minimum_margin,
                        "top": minimum_margin,
                        "right": minimum_margin,
                        "bottom": minimum_margin,
                    },
                )
            with self.subTest(size=size, case="minus_one"):
                too_close = Image.new(
                    "RGBA",
                    (size, size),
                    (0, 0, 0, 0),
                )
                ImageDraw.Draw(too_close).rectangle(
                    (
                        minimum_margin - 1,
                        minimum_margin,
                        size - minimum_margin - 1,
                        size - minimum_margin - 1,
                    ),
                    fill=(80, 140, 220, 255),
                )
                with self.assertRaisesRegex(
                    portrait.PortraitBuildError,
                    "四边安全距不足",
                ):
                    portrait.image_composition_metrics(
                        too_close,
                        minimum_edge_margin=minimum_margin,
                    )

    def test_repainted_identity_scaled_copy_fails(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            options = self.fixture(Path(temporary))
            with Image.open(options.input_path) as opened:
                source = opened.copy()
            cleaned, _, _, _ = portrait._matte_chroma(
                source,
                key=options.key,
                transparent_distance=options.transparent_distance,
                opaque_distance=options.opaque_distance,
                alpha_threshold=options.alpha_threshold,
            )
            cleaned.save(options.identity_reference, format="PNG")
            self._rewrite_attestation(options)
            with self.assertRaisesRegex(
                portrait.PortraitBuildError,
                "同图或缩放拷贝",
            ):
                portrait.build_portrait(options)

    def test_fake_generated_images_root_and_superseded_result_fail(self) -> None:
        with tempfile.TemporaryDirectory(dir=Path.home()) as temporary:
            options = self.fixture(Path(temporary))
            attestation = options.generation_attestation
            attestation.unlink()
            result_path = self._generation_result_path(options)
            fake_root = (
                Path(temporary)
                / "fake/.codex/generated_images"
                / "123e4567-e89b-42d3-a456-426614174000"
            )
            fake_root.mkdir(parents=True)
            fake_source = fake_root / f"{options.generation_id}.png"
            fake_source.write_bytes(options.input_path.read_bytes())
            result_text = result_path.read_text(encoding="utf-8")
            result_text = re.sub(
                r"^generatorResultPath:.*$",
                f"generatorResultPath: {fake_source}",
                result_text,
                flags=re.MULTILINE,
            )
            result_path.write_text(result_text, encoding="utf-8")
            with self.assertRaisesRegex(
                portrait.PortraitBuildError,
                "真实 Path.home|canonical",
            ):
                portrait.write_generation_attestation(
                    portrait.GenerationAttestationOptions(
                        repo_root=options.repo_root,
                        pet_root=options.pet_root,
                        form_id=options.form_id,
                        input_path=options.input_path,
                        identity_reference=options.identity_reference,
                        prompt_path=options.prompt_path,
                        generation_result=result_path,
                        output_path=attestation,
                        generation_id=options.generation_id,
                        catalog_path=options.catalog_path,
                    )
                )

        with tempfile.TemporaryDirectory() as temporary:
            options = self.fixture(Path(temporary))
            options.generation_attestation.unlink()
            selected = self._generation_result_path(options)
            superseded = selected.with_name("result-old.txt")
            superseded.write_bytes(selected.read_bytes())
            with self.assertRaisesRegex(
                portrait.PortraitBuildError,
                "最终选择不一致",
            ):
                portrait.write_generation_attestation(
                    portrait.GenerationAttestationOptions(
                        repo_root=options.repo_root,
                        pet_root=options.pet_root,
                        form_id=options.form_id,
                        input_path=options.input_path,
                        identity_reference=options.identity_reference,
                        prompt_path=options.prompt_path,
                        generation_result=superseded,
                        output_path=options.generation_attestation,
                        generation_id=options.generation_id,
                        catalog_path=options.catalog_path,
                    )
                )

    def test_spoofed_or_tampered_transcript_fails_closed(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            options = self.fixture(Path(temporary))
            options.generation_attestation.unlink()
            source_fields = portrait._parse_generation_result_fields(
                self._generation_result_path(options).read_bytes()
            )
            source = Path(
                portrait._one_generation_result_value(
                    source_fields,
                    ("generatorresultpath",),
                    "generator source",
                )
            )
            transcript = next(
                (self.codex_home / "sessions").glob(
                    f"*/*/*/rollout-*-{source.parent.name}.jsonl"
                )
            )
            spoof = [
                {
                    "type": "session_meta",
                    "payload": {"id": source.parent.name},
                },
                {
                    "type": "response_item",
                    "payload": {
                        "type": "message",
                        "text": (
                            options.generation_id
                            + " image_generation_end completed"
                        ),
                    },
                },
            ]
            transcript.write_text(
                "".join(json.dumps(item) + "\n" for item in spoof),
                encoding="utf-8",
            )
            with self.assertRaisesRegex(
                portrait.PortraitBuildError,
                "image_generation_end",
            ):
                portrait.write_generation_attestation(
                    portrait.GenerationAttestationOptions(
                        repo_root=options.repo_root,
                        pet_root=options.pet_root,
                        form_id=options.form_id,
                        input_path=options.input_path,
                        identity_reference=options.identity_reference,
                        prompt_path=options.prompt_path,
                        generation_result=self._generation_result_path(
                            options
                        ),
                        output_path=options.generation_attestation,
                        generation_id=options.generation_id,
                        catalog_path=options.catalog_path,
                    )
                )

            self._sync_generation_evidence(options)
            records = [
                json.loads(line)
                for line in transcript.read_text(
                    encoding="utf-8"
                ).splitlines()
            ]
            records[-1]["payload"]["result"] = base64.b64encode(
                b"not-the-cache-png"
            ).decode("ascii")
            transcript.write_text(
                "".join(json.dumps(item) + "\n" for item in records),
                encoding="utf-8",
            )
            with self.assertRaisesRegex(
                portrait.PortraitBuildError,
                "不是逐字节同一输出",
            ):
                portrait.write_generation_attestation(
                    portrait.GenerationAttestationOptions(
                        repo_root=options.repo_root,
                        pet_root=options.pet_root,
                        form_id=options.form_id,
                        input_path=options.input_path,
                        identity_reference=options.identity_reference,
                        prompt_path=options.prompt_path,
                        generation_result=self._generation_result_path(
                            options
                        ),
                        output_path=options.generation_attestation,
                        generation_id=options.generation_id,
                        catalog_path=options.catalog_path,
                    )
                )

    def test_direct_request_arguments_are_strict_json(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            options = self.fixture(Path(temporary))
            options.generation_attestation.unlink()
            transcript, records, _ = self._transcript_records(options)
            call = records[1]["payload"]
            assert isinstance(call, dict)
            original_arguments = call["arguments"]
            assert isinstance(original_arguments, str)

            cases = (
                ("{", "严格 JSON"),
                (
                    '{"prompt":"a","prompt":"b",'
                    '"referenced_image_paths":["/tmp/a.png"]}',
                    "重复字段",
                ),
                (
                    json.dumps(
                        {
                            "prompt": options.prompt_path.read_text(
                                encoding="utf-8"
                            ),
                            "referenced_image_paths": [
                                str(options.identity_reference)
                            ],
                            "post_hoc_claim": True,
                        }
                    ),
                    "未知字段",
                ),
            )
            for arguments, message in cases:
                with self.subTest(message=message):
                    call["arguments"] = arguments
                    self._write_transcript_records(transcript, records)
                    with self.assertRaisesRegex(
                        portrait.PortraitBuildError,
                        message,
                    ):
                        self._write_generation_attestation(options)
            call["arguments"] = original_arguments
            self._write_transcript_records(transcript, records)

    def test_post_hoc_unrelated_prompt_cannot_replace_request_prompt(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            options = self.fixture(Path(temporary))
            options.generation_attestation.unlink()
            options.prompt_path.write_text(
                "Dedicated portrait for another unrelated creature. "
                "Never crop or derive it from full-body art.\n",
                encoding="utf-8",
            )
            with self.assertRaisesRegex(
                portrait.PortraitBuildError,
                "selected prompt 与真实 ImageGen request prompt 不一致",
            ):
                self._write_generation_attestation(options)

    def test_multi_round_prompt_requires_explicit_actual_request_file(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            options = self.fixture(Path(temporary))
            options.generation_attestation.unlink()
            transcript, records, _ = self._transcript_records(options)
            call = records[1]["payload"]
            assert isinstance(call, dict)
            arguments = json.loads(call["arguments"])
            actual_prompt = arguments["prompt"]
            options.prompt_path.write_text(
                "Historical first-round notes that are not the selected "
                "request. Dedicated portrait; never crop full-body art.\n"
                "\n--- actual selected request ---\n\n"
                + actual_prompt,
                encoding="utf-8",
            )
            with self.assertRaisesRegex(
                portrait.PortraitBuildError,
                "actualRequestPrompt",
            ):
                self._write_generation_attestation(options)

            actual_path = (
                options.prompt_path.parent / "actual-request-prompt.txt"
            )
            actual_path.write_text(actual_prompt + "\n", encoding="utf-8")
            selection_path = (
                options.repo_root / portrait.SELECTED_SOURCES_PATH
            )
            selection = json.loads(
                selection_path.read_text(encoding="utf-8")
            )
            selection["entries"][0]["actualRequestPrompt"] = (
                actual_path.relative_to(options.repo_root).as_posix()
            )
            selection_path.write_text(
                json.dumps(selection, indent=2) + "\n",
                encoding="utf-8",
            )
            attestation = self._write_generation_attestation(options)
            request = attestation["generationResultEvidence"][
                "transcriptEvidence"
            ]["requestArgumentBinding"]
            self.assertEqual(
                request["prompt"]["selectedPromptRelation"],
                "explicit_actual_request_prompt_file_v1",
            )
            self.assertEqual(
                request["prompt"]["requestPromptSourcePath"],
                actual_path.relative_to(options.repo_root).as_posix(),
            )

            actual_path.write_text(
                "Dedicated unrelated portrait. Never crop full-body art.\n",
                encoding="utf-8",
            )
            with self.assertRaisesRegex(
                portrait.PortraitBuildError,
                "actualRequestPrompt 未逐字绑定",
            ):
                portrait.build_portrait(options)

    def test_request_references_bind_every_current_file_truthfully(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            options = self.fixture(Path(temporary))
            options.generation_attestation.unlink()
            transcript, records, _ = self._transcript_records(options)
            workspace_reference = (
                options.repo_root
                / ".run/portrait-source/iteration-reference.png"
            )
            workspace_reference.parent.mkdir(parents=True, exist_ok=True)
            workspace_reference.write_bytes(
                options.identity_reference.read_bytes()
            )
            cache_reference = (
                self.codex_home
                / "generated_images"
                / "123e4567-e89b-42d3-a456-426614174111"
                / "call_123456789012345678901234.png"
            )
            cache_reference.parent.mkdir(parents=True, exist_ok=True)
            cache_reference.write_bytes(
                options.identity_reference.read_bytes()
            )
            call = records[1]["payload"]
            assert isinstance(call, dict)
            arguments = json.loads(call["arguments"])
            arguments["referenced_image_paths"] = [
                str(options.identity_reference),
                str(workspace_reference),
                str(cache_reference),
            ]
            call["arguments"] = json.dumps(arguments)
            self._write_transcript_records(transcript, records)

            attestation = self._write_generation_attestation(options)
            request = attestation["generationResultEvidence"][
                "transcriptEvidence"
            ]["requestArgumentBinding"]
            references = request["referencedImages"]
            self.assertEqual(len(references), 3)
            self.assertEqual(
                [record["role"] for record in references],
                [
                    "declared_identity_reference",
                    "workspace_iteration_reference",
                    "codex_generated_iteration_reference",
                ],
            )
            self.assertTrue(
                all(
                    not record["historicalRequestBytesVerified"]
                    for record in references
                )
            )
            self.assertTrue(
                all(
                    not record["pathLabel"].startswith("/")
                    for record in references
                )
            )

            workspace_reference.write_bytes(b"changed-after-attestation")
            with self.assertRaisesRegex(
                portrait.PortraitBuildError,
                "不可解码|binding 不一致",
            ):
                portrait.build_portrait(options)

    def test_conversation_history_request_is_not_misreported_as_paths(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            options = self.fixture(
                Path(temporary),
                form_id="driftfox_highland_wind9_earth1",
            )
            options.generation_attestation.unlink()
            selection_path = (
                options.repo_root / portrait.SELECTED_SOURCES_PATH
            )
            selection = json.loads(
                selection_path.read_text(encoding="utf-8")
            )
            selection["entries"][0]["requestArgumentCompatibility"] = (
                "historical_conversation_image_request_owner_pending_v1"
            )
            selection_path.write_text(
                json.dumps(selection, indent=2) + "\n",
                encoding="utf-8",
            )
            transcript, records, _ = self._transcript_records(options)
            call = records[1]["payload"]
            assert isinstance(call, dict)
            arguments = json.loads(call["arguments"])
            arguments.pop("referenced_image_paths")
            arguments["num_last_images_to_include"] = 1
            call["arguments"] = json.dumps(arguments)
            self._write_transcript_records(transcript, records)

            attestation = self._write_generation_attestation(options)
            request = attestation["generationResultEvidence"][
                "transcriptEvidence"
            ]["requestArgumentBinding"]
            self.assertEqual(
                request["referenceMode"],
                "conversation_history",
            )
            self.assertEqual(request["numLastImagesToInclude"], 1)
            self.assertEqual(request["referencedImages"], [])
            self.assertFalse(
                request["currentReferencedImageContentBound"]
            )
            self.assertIsNone(
                request["declaredIdentityReferenceIncluded"]
            )

    def test_exec_generation_has_no_production_compatibility_allowlist(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            options = self.fixture(
                Path(temporary),
                form_id="pet_rebirth_mm_stage2",
            )
            options.generation_attestation.unlink()
            transcript, records, source = self._transcript_records(options)
            exec_id = "exec-51a1d98b-fcf7-4c75-bf24-43f7d8f1edbf"
            exec_source = source.with_name(f"{exec_id}.png")
            source.rename(exec_source)

            result_path = self._generation_result_path(options)
            result_text = result_path.read_text(encoding="utf-8")
            result_path.write_text(
                result_text.replace(
                    options.generation_id,
                    exec_id,
                ).replace(str(source), str(exec_source)),
                encoding="utf-8",
            )
            selection_path = (
                options.repo_root / portrait.SELECTED_SOURCES_PATH
            )
            selection = json.loads(
                selection_path.read_text(encoding="utf-8")
            )
            selection["entries"][0]["generationId"] = exec_id
            selection_path.write_text(
                json.dumps(selection, indent=2) + "\n",
                encoding="utf-8",
            )
            event = records[-1]
            event_payload = event["payload"]
            assert isinstance(event_payload, dict)
            event_payload["call_id"] = exec_id
            event_payload["saved_path"] = str(exec_source)
            self._write_transcript_records(
                transcript,
                [records[0], event],
            )

            with self.assertRaisesRegex(
                portrait.PortraitBuildError,
                "显式历史兼容声明",
            ):
                self._write_generation_attestation(
                    options,
                    generation_id=exec_id,
                )
            selection["entries"][0]["requestArgumentCompatibility"] = (
                "historical_exec_no_direct_request_record_owner_pending_v1"
            )
            selection_path.write_text(
                json.dumps(selection, indent=2) + "\n",
                encoding="utf-8",
            )
            with self.assertRaisesRegex(
                portrait.PortraitBuildError,
                "显式历史兼容声明",
            ):
                self._write_generation_attestation(
                    options,
                    generation_id=exec_id,
                )

    def test_identity_front_pose_and_isolated_gate_are_strict(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            options = self.fixture(Path(temporary))
            options.generation_attestation.unlink()
            arbitrary = options.pet_root / "identity/arbitrary.png"
            arbitrary.write_bytes(options.identity_reference.read_bytes())
            transcript, records, _ = self._transcript_records(options)
            request = records[1]["payload"]
            assert isinstance(request, dict)
            arguments = json.loads(request["arguments"])
            arguments["referenced_image_paths"] = [str(arbitrary)]
            request["arguments"] = json.dumps(arguments)
            self._write_transcript_records(transcript, records)
            with self.assertRaisesRegex(
                portrait.PortraitBuildError,
                "canonical identity pose|front_3quarter",
            ):
                portrait.write_generation_attestation(
                    portrait.GenerationAttestationOptions(
                        repo_root=options.repo_root,
                        pet_root=options.pet_root,
                        form_id=options.form_id,
                        input_path=options.input_path,
                        identity_reference=arbitrary,
                        prompt_path=options.prompt_path,
                        generation_result=self._generation_result_path(
                            options
                        ),
                        output_path=options.generation_attestation,
                        generation_id=options.generation_id,
                        catalog_path=options.catalog_path,
                    )
                )

        with tempfile.TemporaryDirectory() as temporary:
            options = self.fixture(
                Path(temporary),
                form_id="isolated_fixture",
                isolated=True,
            )
            options.generation_attestation.unlink()
            action_path = options.pet_root / "action-bundle-meta.json"
            action = json.loads(action_path.read_text(encoding="utf-8"))
            action["evidence"]["identityGateAudit"]["pipelineMetadata"][
                "sources"
            ]["front_3quarter_sw"]["canonicalRgbaSha256"] = "0" * 64
            action_path.write_text(
                json.dumps(action, indent=2) + "\n",
                encoding="utf-8",
            )
            with self.assertRaisesRegex(
                portrait.PortraitBuildError,
                "三方一致",
            ):
                portrait.write_generation_attestation(
                    portrait.GenerationAttestationOptions(
                        repo_root=options.repo_root,
                        pet_root=options.pet_root,
                        form_id=options.form_id,
                        input_path=options.input_path,
                        identity_reference=options.identity_reference,
                        prompt_path=options.prompt_path,
                        generation_result=self._generation_result_path(
                            options
                        ),
                        output_path=options.generation_attestation,
                        generation_id=options.generation_id,
                        catalog_path=options.catalog_path,
                        isolated=True,
                    )
                )

    def test_legacy_identity_ledger_is_honest_and_fail_closed(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            options = self.fixture(
                Path(temporary),
                form_id="wuli_normal_orange_fire10",
            )
            options.generation_attestation.unlink()
            pipeline_path = (
                options.pet_root
                / "source/identity-board-pipeline-meta.json"
            )
            pipeline = json.loads(
                pipeline_path.read_text(encoding="utf-8")
            )
            pipeline["frames"][0].pop("sourceRgbaSha256")
            pipeline_path.write_text(
                json.dumps(pipeline, indent=2) + "\n",
                encoding="utf-8",
            )
            ledger = portrait.write_identity_freeze_ledger(
                portrait.IdentityFreezeLedgerOptions(
                    repo_root=options.repo_root,
                    pet_root=options.pet_root,
                    form_id=options.form_id,
                    identity_reference=options.identity_reference,
                    catalog_path=options.catalog_path,
                )
            )
            self.assertFalse(
                ledger["claims"]["historicalPipelineReplayVerified"]
            )
            self.assertFalse(
                ledger["claims"]["ownerApprovalGrantedByLedger"]
            )
            self._sync_generation_evidence(options)
            attestation = portrait.write_generation_attestation(
                portrait.GenerationAttestationOptions(
                    repo_root=options.repo_root,
                    pet_root=options.pet_root,
                    form_id=options.form_id,
                    input_path=options.input_path,
                    identity_reference=options.identity_reference,
                    prompt_path=options.prompt_path,
                    generation_result=self._generation_result_path(options),
                    output_path=options.generation_attestation,
                    generation_id=options.generation_id,
                    catalog_path=options.catalog_path,
                )
            )
            identity = attestation["identityEvidence"]
            self.assertFalse(identity["pipelinePixelHashVerified"])
            self.assertTrue(
                identity["currentReferencePixelBindingVerified"]
            )
            self.assertEqual(
                identity["compatibilityLedger"]["trustLevel"],
                "catalog_bound_legacy_freeze",
            )

    def test_fixed_composition_alpha_threshold_and_prompt_contradiction(self) -> None:
        image = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
        ImageDraw.Draw(image).rectangle(
            (20, 20, 107, 107),
            fill=(10, 20, 30, 255),
        )
        with self.assertRaisesRegex(
            portrait.PortraitBuildError,
            "固定为 alpha>=8",
        ):
            portrait.image_composition_metrics(
                image,
                minimum_edge_margin=10,
                alpha_threshold=1,
            )
        self.assertFalse(
            portrait._prompt_declares_dedicated_no_crop(
                "Dedicated pet portrait. Never crop from the full body. "
                "Crop and reuse the identity board for the final portrait."
            )
        )

    def test_staging_unlink_failure_leaks_no_output_or_marker(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            options = self.fixture(Path(temporary))
            write = portrait.PortraitBuildOptions(
                **{**options.__dict__, "write": True}
            )
            original_unlink = os.unlink
            injected = False

            def flaky_unlink(
                path: object,
                *args: object,
                **kwargs: object,
            ) -> None:
                nonlocal injected
                if (
                    not injected
                    and kwargs.get("dir_fd") is not None
                    and path in {
                        relative.name
                        for relative in portrait.OUTPUT_PATHS
                    }
                ):
                    injected = True
                    raise OSError("injected staging unlink failure")
                original_unlink(path, *args, **kwargs)

            with mock.patch.object(
                portrait.os,
                "unlink",
                side_effect=flaky_unlink,
            ):
                with self.assertRaisesRegex(
                    OSError,
                    "injected staging unlink failure",
                ):
                    portrait.build_portrait(write)
            for relative in portrait.OUTPUT_PATHS:
                self.assertFalse((write.pet_root / relative).exists())
            self.assertFalse(
                (write.pet_root / portrait.INSTALL_TRANSACTION_PATH).exists()
            )

    def test_install_pins_pet_and_staging_fds_across_ancestor_swap(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            options = self.fixture(root)
            write = portrait.PortraitBuildOptions(
                **{**options.__dict__, "write": True}
            )
            client_root = options.repo_root / "client"
            held_client_root = options.repo_root / "client-held"
            outside_client_root = root / "outside-client"
            outside_pet_root = (
                outside_client_root
                / "godot/assets/pets"
                / options.form_id
            )
            outside_pet_root.mkdir(parents=True)
            original_marker = (
                portrait._write_install_transaction_marker_from_fd
            )
            original_unlink = os.unlink
            swapped = False
            restored = False

            def marker_then_swap(
                pet_root_fd: int,
                pet_root: Path,
                transaction: dict[str, object],
            ) -> None:
                nonlocal swapped
                original_marker(
                    pet_root_fd,
                    pet_root,
                    transaction,
                )
                client_root.rename(held_client_root)
                client_root.symlink_to(
                    outside_client_root,
                    target_is_directory=True,
                )
                swapped = True

            def restore_before_final_source_unlink(
                path: object,
                *args: object,
                **kwargs: object,
            ) -> None:
                nonlocal restored
                if (
                    swapped
                    and not restored
                    and path == portrait.METADATA_PATH.name
                    and kwargs.get("dir_fd") is not None
                ):
                    client_root.unlink()
                    held_client_root.rename(client_root)
                    restored = True
                original_unlink(path, *args, **kwargs)

            try:
                with (
                    mock.patch.object(
                        portrait,
                        "_write_install_transaction_marker_from_fd",
                        side_effect=marker_then_swap,
                    ),
                    mock.patch.object(
                        portrait.os,
                        "unlink",
                        side_effect=restore_before_final_source_unlink,
                    ),
                ):
                    portrait.build_portrait(write)
            finally:
                if client_root.is_symlink():
                    client_root.unlink()
                if held_client_root.exists():
                    held_client_root.rename(client_root)
            self.assertTrue(restored)
            self.assertEqual(
                [path for path in outside_pet_root.rglob("*")],
                [],
            )
            for relative in portrait.OUTPUT_PATHS:
                self.assertTrue(
                    (options.pet_root / relative).is_file(),
                    relative,
                )
            self.assertFalse(
                (options.pet_root / portrait.INSTALL_TRANSACTION_PATH).exists()
            )

    def test_install_rejects_ordinary_output_parent_split(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            options = self.fixture(Path(temporary))
            write = portrait.PortraitBuildOptions(
                **{**options.__dict__, "write": True}
            )
            source_root = options.pet_root / "source"
            held_source_root = options.pet_root / "source-held"
            original_unlink = portrait.os.unlink
            swapped = False

            def split_after_first_target_link(
                path: object,
                *args: object,
                **kwargs: object,
            ) -> None:
                nonlocal swapped
                if (
                    not swapped
                    and path
                    == portrait.ORIGINAL_GENERATED_PNG_PATH.name
                    and kwargs.get("dir_fd") is not None
                ):
                    swapped = True
                    source_root.rename(held_source_root)
                    (source_root / "portrait").mkdir(parents=True)
                original_unlink(path, *args, **kwargs)

            try:
                with mock.patch.object(
                    portrait.os,
                    "unlink",
                    side_effect=split_after_first_target_link,
                ):
                    with self.assertRaisesRegex(
                        portrait.PortraitBuildError,
                        "父目录 inode 漂移|父目录已被移走或替换",
                    ):
                        portrait.build_portrait(write)
                self.assertTrue(swapped)
                self.assertEqual(
                    list((source_root / "portrait").iterdir()),
                    [],
                )
                self.assertFalse(
                    (
                        held_source_root
                        / "portrait"
                        / portrait.ORIGINAL_GENERATED_PNG_PATH.name
                    ).exists()
                )
                for relative in portrait.OUTPUT_PATHS:
                    if relative.parts[0] != "source":
                        self.assertFalse(
                            (options.pet_root / relative).exists()
                        )
                self.assertFalse(
                    (
                        options.pet_root
                        / portrait.INSTALL_TRANSACTION_PATH
                    ).exists()
                )
            finally:
                if source_root.exists():
                    shutil.rmtree(source_root)
                if held_source_root.exists():
                    held_source_root.rename(source_root)

    def test_install_rollback_never_deletes_replacement_victim(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            options = self.fixture(Path(temporary))
            write = portrait.PortraitBuildOptions(
                **{**options.__dict__, "write": True}
            )
            source_root = options.pet_root / "source"
            held_source_root = options.pet_root / "source-held"
            replacement_target = (
                source_root / portrait.ORIGINAL_GENERATED_PNG_PATH.relative_to(
                    "source"
                )
            )
            original_unlink = portrait.os.unlink
            injected = False

            def replace_then_fail_staging_unlink(
                path: object,
                *args: object,
                **kwargs: object,
            ) -> None:
                nonlocal injected
                if (
                    not injected
                    and path
                    == portrait.ORIGINAL_GENERATED_PNG_PATH.name
                    and kwargs.get("dir_fd") is not None
                ):
                    injected = True
                    source_root.rename(held_source_root)
                    replacement_target.parent.mkdir(parents=True)
                    replacement_target.write_bytes(b"UNRELATED")
                    raise OSError("injected post-link failure")
                original_unlink(path, *args, **kwargs)

            try:
                with mock.patch.object(
                    portrait.os,
                    "unlink",
                    side_effect=replace_then_fail_staging_unlink,
                ):
                    with self.assertRaisesRegex(
                        OSError,
                        "injected post-link failure",
                    ):
                        portrait.build_portrait(write)
                self.assertTrue(injected)
                self.assertEqual(
                    replacement_target.read_bytes(),
                    b"UNRELATED",
                )
                self.assertFalse(
                    (
                        held_source_root
                        / portrait.ORIGINAL_GENERATED_PNG_PATH.relative_to(
                            "source"
                        )
                    ).exists()
                )
                self.assertFalse(
                    (
                        options.pet_root
                        / portrait.INSTALL_TRANSACTION_PATH
                    ).exists()
                )
            finally:
                if source_root.exists():
                    shutil.rmtree(source_root)
                if held_source_root.exists():
                    held_source_root.rename(source_root)

    def test_post_link_verification_failure_rolls_back_first_output(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            options = self.fixture(Path(temporary))
            write = portrait.PortraitBuildOptions(
                **{**options.__dict__, "write": True}
            )
            original_sha = portrait._sha256_cached_file
            injected = False

            def fail_first_target_hash(
                pinned: dict[Path, int],
                relative: Path,
                *,
                display_root: Path,
            ) -> str:
                nonlocal injected
                if (
                    not injected
                    and display_root == options.pet_root.resolve()
                    and relative == portrait.OUTPUT_PATHS[0]
                ):
                    injected = True
                    raise OSError("injected post-link hash failure")
                return original_sha(
                    pinned,
                    relative,
                    display_root=display_root,
                )

            with mock.patch.object(
                portrait,
                "_sha256_cached_file",
                side_effect=fail_first_target_hash,
            ):
                with self.assertRaisesRegex(
                    OSError,
                    "injected post-link hash failure",
                ):
                    portrait.build_portrait(write)
            self.assertTrue(injected)
            for relative in portrait.OUTPUT_PATHS:
                self.assertFalse((options.pet_root / relative).exists())
            self.assertFalse(
                (
                    options.pet_root
                    / portrait.INSTALL_TRANSACTION_PATH
                ).exists()
            )

    def test_recovery_never_deletes_ordinary_replacement_victim(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            options = self.fixture(root)
            staging = root / "staging"
            for index, relative in enumerate(portrait.OUTPUT_PATHS):
                path = staging / relative
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(f"fixture-output-{index}".encode())
            transaction = portrait._portrait_install_transaction(
                staging,
                options,
            )
            portrait._write_install_transaction_marker(
                options.pet_root,
                transaction,
            )
            original_target = (
                options.pet_root / portrait.ORIGINAL_GENERATED_PNG_PATH
            )
            original_target.parent.mkdir(parents=True, exist_ok=True)
            original_target.write_bytes(
                (
                    staging / portrait.ORIGINAL_GENERATED_PNG_PATH
                ).read_bytes()
            )
            source_root = options.pet_root / "source"
            held_source_root = options.pet_root / "source-held"
            replacement_target = (
                source_root / portrait.ORIGINAL_GENERATED_PNG_PATH.relative_to(
                    "source"
                )
            )
            original_unlink_cached = portrait._unlink_cached_file
            swapped = False

            def replace_before_recovery_unlink(
                pinned: dict[Path, int],
                relative: Path,
                *,
                display_root: Path,
            ) -> None:
                nonlocal swapped
                if (
                    not swapped
                    and relative
                    == portrait.ORIGINAL_GENERATED_PNG_PATH
                ):
                    swapped = True
                    source_root.rename(held_source_root)
                    replacement_target.parent.mkdir(parents=True)
                    replacement_target.write_bytes(b"UNRELATED")
                original_unlink_cached(
                    pinned,
                    relative,
                    display_root=display_root,
                )

            try:
                with mock.patch.object(
                    portrait,
                    "_unlink_cached_file",
                    side_effect=replace_before_recovery_unlink,
                ):
                    with self.assertRaisesRegex(
                        portrait.PortraitBuildError,
                        "父目录 inode 漂移|父目录已被移走或替换",
                    ):
                        portrait._recover_incomplete_install(
                            staging,
                            options,
                            transaction,
                        )
                self.assertTrue(swapped)
                self.assertEqual(
                    replacement_target.read_bytes(),
                    b"UNRELATED",
                )
                self.assertFalse(
                    (
                        held_source_root
                        / portrait.ORIGINAL_GENERATED_PNG_PATH.relative_to(
                            "source"
                        )
                    ).exists()
                )
                self.assertTrue(
                    (
                        options.pet_root
                        / portrait.INSTALL_TRANSACTION_PATH
                    ).is_file()
                )
            finally:
                if source_root.exists():
                    shutil.rmtree(source_root)
                if held_source_root.exists():
                    held_source_root.rename(source_root)

    def test_install_final_marker_read_window_cannot_split_tree(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            options = self.fixture(Path(temporary))
            write = portrait.PortraitBuildOptions(
                **{**options.__dict__, "write": True}
            )
            source_root = options.pet_root / "source"
            held_source_root = options.pet_root / "source-held"
            original_read_marker = portrait._read_relative_json_object
            swapped = False

            def read_marker_then_replace_source(
                root_fd: int,
                relative: Path,
                *,
                display_root: Path,
                label: str,
            ) -> dict[str, object]:
                nonlocal swapped
                value = original_read_marker(
                    root_fd,
                    relative,
                    display_root=display_root,
                    label=label,
                )
                if (
                    not swapped
                    and relative == portrait.INSTALL_TRANSACTION_PATH
                ):
                    swapped = True
                    source_root.rename(held_source_root)
                    (source_root / "portrait").mkdir(parents=True)
                return value

            try:
                with mock.patch.object(
                    portrait,
                    "_read_relative_json_object",
                    side_effect=read_marker_then_replace_source,
                ):
                    with self.assertRaisesRegex(
                        portrait.PortraitBuildError,
                        "portrait target final.*父目录",
                    ):
                        portrait.build_portrait(write)
                self.assertTrue(swapped)
                self.assertEqual(
                    list((source_root / "portrait").iterdir()),
                    [],
                )
                for relative in portrait.OUTPUT_PATHS:
                    if relative.parts[0] == "source":
                        target = (
                            held_source_root
                            / relative.relative_to("source")
                        )
                    else:
                        target = options.pet_root / relative
                    self.assertFalse(target.exists(), relative)
                self.assertFalse(
                    (
                        options.pet_root
                        / portrait.INSTALL_TRANSACTION_PATH
                    ).exists()
                )
            finally:
                if source_root.exists():
                    shutil.rmtree(source_root)
                if held_source_root.exists():
                    held_source_root.rename(source_root)

    def test_install_final_marker_unlink_window_cannot_split_tree(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            options = self.fixture(Path(temporary))
            write = portrait.PortraitBuildOptions(
                **{**options.__dict__, "write": True}
            )
            source_root = options.pet_root / "source"
            held_source_root = options.pet_root / "source-held"
            original_unlink_relative = portrait._unlink_relative_from_fd
            swapped = False

            def unlink_marker_then_replace_source(
                root_fd: int,
                relative: Path,
                *,
                display_root: Path,
            ) -> None:
                nonlocal swapped
                original_unlink_relative(
                    root_fd,
                    relative,
                    display_root=display_root,
                )
                if (
                    not swapped
                    and relative == portrait.INSTALL_TRANSACTION_PATH
                ):
                    swapped = True
                    source_root.rename(held_source_root)
                    (source_root / "portrait").mkdir(parents=True)

            try:
                with mock.patch.object(
                    portrait,
                    "_unlink_relative_from_fd",
                    side_effect=unlink_marker_then_replace_source,
                ):
                    with self.assertRaisesRegex(
                        portrait.PortraitBuildError,
                        "portrait target final.*父目录",
                    ):
                        portrait.build_portrait(write)
                self.assertTrue(swapped)
                self.assertEqual(
                    list((source_root / "portrait").iterdir()),
                    [],
                )
                for relative in portrait.OUTPUT_PATHS:
                    if relative.parts[0] == "source":
                        target = (
                            held_source_root
                            / relative.relative_to("source")
                        )
                    else:
                        target = options.pet_root / relative
                    self.assertFalse(target.exists(), relative)
                self.assertFalse(
                    (
                        options.pet_root
                        / portrait.INSTALL_TRANSACTION_PATH
                    ).exists()
                )
            finally:
                if source_root.exists():
                    shutil.rmtree(source_root)
                if held_source_root.exists():
                    held_source_root.rename(source_root)

    def test_install_final_windows_reject_whole_root_replacement(
        self,
    ) -> None:
        for root_kind in ("pet", "repo"):
            for attack_window in ("marker_read", "marker_unlink"):
                with self.subTest(
                    root_kind=root_kind,
                    attack_window=attack_window,
                ), tempfile.TemporaryDirectory() as temporary:
                    options = self.fixture(Path(temporary))
                    write = portrait.PortraitBuildOptions(
                        **{**options.__dict__, "write": True}
                    )
                    attacked_root = (
                        options.pet_root
                        if root_kind == "pet"
                        else options.repo_root
                    )
                    held_root = attacked_root.with_name(
                        f"{attacked_root.name}-held"
                    )
                    pet_below_attacked = options.pet_root.relative_to(
                        attacked_root
                    )
                    held_pet_root = held_root / pet_below_attacked
                    original_read_marker = (
                        portrait._read_relative_json_object
                    )
                    original_unlink_relative = (
                        portrait._unlink_relative_from_fd
                    )
                    swapped = False

                    def replace_whole_root() -> None:
                        nonlocal swapped
                        attacked_root.rename(held_root)
                        attacked_root.mkdir()
                        swapped = True

                    def marker_read_hook(
                        root_fd: int,
                        relative: Path,
                        *,
                        display_root: Path,
                        label: str,
                    ) -> dict[str, object]:
                        value = original_read_marker(
                            root_fd,
                            relative,
                            display_root=display_root,
                            label=label,
                        )
                        if (
                            not swapped
                            and relative
                            == portrait.INSTALL_TRANSACTION_PATH
                        ):
                            replace_whole_root()
                        return value

                    def marker_unlink_hook(
                        root_fd: int,
                        relative: Path,
                        *,
                        display_root: Path,
                    ) -> None:
                        original_unlink_relative(
                            root_fd,
                            relative,
                            display_root=display_root,
                        )
                        if (
                            not swapped
                            and relative
                            == portrait.INSTALL_TRANSACTION_PATH
                        ):
                            replace_whole_root()

                    patch_target = (
                        "_read_relative_json_object"
                        if attack_window == "marker_read"
                        else "_unlink_relative_from_fd"
                    )
                    patch_side_effect = (
                        marker_read_hook
                        if attack_window == "marker_read"
                        else marker_unlink_hook
                    )
                    try:
                        with mock.patch.object(
                            portrait,
                            patch_target,
                            side_effect=patch_side_effect,
                        ):
                            with self.assertRaisesRegex(
                                portrait.PortraitBuildError,
                                (
                                    "portrait install "
                                    f"{root_kind} root final inode "
                                    "已被替换"
                                ),
                            ):
                                portrait.build_portrait(write)
                        self.assertTrue(swapped)
                        self.assertEqual(
                            list(attacked_root.rglob("*")),
                            [],
                        )
                        for relative in portrait.OUTPUT_PATHS:
                            self.assertFalse(
                                (held_pet_root / relative).exists(),
                                relative,
                            )
                        self.assertFalse(
                            (
                                held_pet_root
                                / portrait.INSTALL_TRANSACTION_PATH
                            ).exists()
                        )
                    finally:
                        if attacked_root.exists():
                            shutil.rmtree(attacked_root)
                        if held_root.exists():
                            held_root.rename(attacked_root)

    def test_install_rejects_staging_name_replacement_without_touching_victim(
        self,
    ) -> None:
        for replacement_kind in ("empty", "nonempty"):
            with self.subTest(
                replacement_kind=replacement_kind,
            ), tempfile.TemporaryDirectory() as temporary:
                options = self.fixture(Path(temporary))
                write = portrait.PortraitBuildOptions(
                    **{**options.__dict__, "write": True}
                )
                staging_parent = options.pet_root.parent
                original_read_marker = (
                    portrait._read_relative_json_object
                )
                staging_path: Path | None = None
                held_staging_path: Path | None = None
                replacement_sentinel: Path | None = None

                def read_marker_then_replace_staging(
                    root_fd: int,
                    relative: Path,
                    *,
                    display_root: Path,
                    label: str,
                ) -> dict[str, object]:
                    nonlocal staging_path
                    nonlocal held_staging_path
                    nonlocal replacement_sentinel
                    value = original_read_marker(
                        root_fd,
                        relative,
                        display_root=display_root,
                        label=label,
                    )
                    if (
                        staging_path is None
                        and relative == portrait.INSTALL_TRANSACTION_PATH
                    ):
                        candidates = list(
                            staging_parent.glob(
                                f".portrait-{options.form_id}-*"
                            )
                        )
                        self.assertEqual(len(candidates), 1)
                        staging_path = candidates[0]
                        held_staging_path = staging_path.with_name(
                            f"{staging_path.name}-held"
                        )
                        staging_path.rename(held_staging_path)
                        staging_path.mkdir()
                        if replacement_kind == "nonempty":
                            replacement_sentinel = (
                                staging_path / "UNRELATED"
                            )
                            replacement_sentinel.write_bytes(
                                b"UNRELATED"
                            )
                    return value

                with mock.patch.object(
                    portrait,
                    "_read_relative_json_object",
                    side_effect=read_marker_then_replace_staging,
                ):
                    with self.assertRaisesRegex(
                        portrait.PortraitBuildError,
                        "portrait install staging root final inode 已被替换",
                    ):
                        portrait.build_portrait(write)
                self.assertIsNotNone(staging_path)
                self.assertIsNotNone(held_staging_path)
                assert staging_path is not None
                assert held_staging_path is not None
                self.assertTrue(staging_path.is_dir())
                if replacement_kind == "nonempty":
                    assert replacement_sentinel is not None
                    self.assertEqual(
                        replacement_sentinel.read_bytes(),
                        b"UNRELATED",
                    )
                else:
                    self.assertEqual(list(staging_path.iterdir()), [])
                self.assertTrue(held_staging_path.is_dir())
                self.assertEqual(list(held_staging_path.iterdir()), [])
                for relative in portrait.OUTPUT_PATHS:
                    self.assertFalse(
                        (options.pet_root / relative).exists(),
                        relative,
                    )
                self.assertFalse(
                    (
                        options.pet_root
                        / portrait.INSTALL_TRANSACTION_PATH
                    ).exists()
                )

    def test_absolute_directory_open_rejects_intermediate_symlink(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            canonical_root = Path(temporary).resolve()
            outside = canonical_root / "outside"
            outside.mkdir()
            (outside / "pet").mkdir()
            linked = canonical_root / "linked"
            linked.symlink_to(outside, target_is_directory=True)
            with self.assertRaisesRegex(
                portrait.PortraitBuildError,
                "祖先包含符号链接|安全目录",
            ):
                portrait._open_absolute_directory(linked / "pet")

    def test_symlink_output_parent_cannot_redirect_install(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            options = self.fixture(root)
            outside = root / "outside"
            outside.mkdir()
            portrait_parent = options.pet_root / "source/portrait"
            portrait_parent.symlink_to(outside, target_is_directory=True)
            write = portrait.PortraitBuildOptions(
                **{**options.__dict__, "write": True}
            )
            with self.assertRaisesRegex(
                portrait.PortraitBuildError,
                "符号链接|安全目录",
            ):
                portrait.build_portrait(write)
            self.assertEqual(list(outside.iterdir()), [])
            self.assertFalse(
                (write.pet_root / portrait.INSTALL_TRANSACTION_PATH).exists()
            )

    def test_interrupted_transaction_recovers_only_exact_recorded_bytes(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            options = self.fixture(root)
            staging = root / "staging"
            for index, relative in enumerate(portrait.OUTPUT_PATHS):
                path = staging / relative
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(f"fixture-output-{index}".encode())
            transaction = portrait._portrait_install_transaction(
                staging,
                options,
            )
            portrait._write_install_transaction_marker(
                options.pet_root,
                transaction,
            )
            for relative in portrait.OUTPUT_PATHS[:4]:
                target = options.pet_root / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes((staging / relative).read_bytes())
            portrait._recover_incomplete_install(
                staging,
                options,
                transaction,
            )
            for relative in portrait.OUTPUT_PATHS:
                self.assertFalse((options.pet_root / relative).exists())
            self.assertFalse(
                (
                    options.pet_root
                    / portrait.INSTALL_TRANSACTION_PATH
                ).exists()
            )

    def test_input_outside_repo_and_symlink_are_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            options = self.fixture(root)
            outside = root / "outside.png"
            outside.write_bytes(options.input_path.read_bytes())
            outside_options = portrait.PortraitBuildOptions(
                **{**options.__dict__, "input_path": outside}
            )
            with self.assertRaisesRegex(
                portrait.PortraitBuildError,
                "必须位于仓库内",
            ):
                portrait.build_portrait(outside_options)

            link = options.input_path.parent / "input-link.png"
            link.symlink_to(options.input_path)
            linked = portrait.PortraitBuildOptions(
                **{**options.__dict__, "input_path": link}
            )
            with self.assertRaisesRegex(
                portrait.PortraitBuildError,
                "符号链接",
            ):
                portrait.build_portrait(linked)


if __name__ == "__main__":
    unittest.main()
