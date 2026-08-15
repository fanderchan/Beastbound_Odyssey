#!/usr/bin/env python3
"""Isolated contract tests for tools/pet_art_batch_audit.py."""

from __future__ import annotations

import copy
import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from typing import Any
from unittest import mock

from PIL import Image, ImageDraw, ImageOps


REPO_ROOT = Path(__file__).resolve().parents[2]
AUDITOR = REPO_ROOT / "tools" / "pet_art_batch_audit.py"
CATALOG_FIXTURE = Path(__file__).parent / "fixtures" / "pet_art_batch_audit" / "catalog_v1.json"
DIRECTIONS = (
    "south",
    "southwest",
    "west",
    "northwest",
    "north",
    "northeast",
    "east",
    "southeast",
)
VIEWS = ("front_3quarter_sw", "back_3quarter_ne")
sys.path.insert(0, str(REPO_ROOT / "tools"))

import pet_art_batch_audit as AUDIT_MODULE  # noqa: E402
from build_pet_art_bundle import derive_runtime_frame, rgba_hash  # noqa: E402
import finalize_pet_identity_gate as identity_finalizer  # noqa: E402
from install_pet_battle_bundle import (  # noqa: E402
    ACTION_SPECS,
    InstallOptions,
    ValidatedBundle,
    _build_target_metadata,
)


def _read_fixture() -> dict[str, Any]:
    return json.loads(CATALOG_FIXTURE.read_text(encoding="utf-8"))


def _fusion_catalog_fixture(target_form_id: str = "fixture_pet") -> dict[str, Any]:
    return {
        "schemaVersion": 2,
        "catalogId": "pet_fusion_recipes_v2",
        "runtimeEnabled": False,
        "disabledMessage": "测试夹具保持生产关闭。",
        "rules": {
            "roleIds": ["core", "resonance_one", "resonance_two"],
            "requiredGrowthModelVersion": "pet_growth_authority_v1",
            "requiredRebirthCount": 1,
            "minimumLevel": 131,
            "maximumLevel": 140,
            "baseActiveSkillIds": ["pet_attack", "pet_defend"],
            "specialActiveInheritanceChance": 0.5,
            "passiveSourceWeights": {
                "core": 0.4,
                "resonance_one": 0.3,
                "resonance_two": 0.3,
            },
            "resultPassiveSkillCount": 1,
            "materialNumericInheritance": False,
            "resultRideable": False,
            "additionalCostPolicy": "materials_only",
            "resultBindingPolicy": "bound_if_any_material_bound",
            "unboundResultTradePolicy": "eligible_when_pet_trading_available",
            "baseActiveSkillForgetPolicy": "forbidden",
            "inheritedSpecialActiveForgetPolicy": "double_confirm_irreversible",
            "postFusionTrainingPolicy": "empty_slots_only",
        },
        "geneProfiles": [
            {
                "geneProfileId": "fixture_core_gene_v1",
                "lineageId": "fixture_core",
                "formId": "fixture_core_form",
                "growthProfileId": "fixture_core_growth_v1",
                "materialClass": "ordinary",
                "specialActiveSkillId": "fixture_core_active",
                "passiveSkillId": "fixture_core_passive",
            },
            {
                "geneProfileId": "fixture_resonance_gene_v1",
                "lineageId": "fixture_resonance",
                "formId": "fixture_resonance_form",
                "growthProfileId": "fixture_resonance_growth_v1",
                "materialClass": "ordinary",
                "specialActiveSkillId": "fixture_resonance_active",
                "passiveSkillId": "fixture_resonance_passive",
            },
            {
                "geneProfileId": "fixture_resonance_two_gene_v1",
                "lineageId": "fixture_resonance_two",
                "formId": "fixture_resonance_two_form",
                "growthProfileId": "fixture_resonance_two_growth_v1",
                "materialClass": "ordinary",
                "specialActiveSkillId": "fixture_resonance_two_active",
                "passiveSkillId": "fixture_resonance_two_passive",
            },
        ],
        "recipes": [
            {
                "recipeId": "fixture_fusion_recipe_v1",
                "targetFormId": target_form_id,
                "targetGrowthProfileId": f"{target_form_id}_growth_v1",
                "roleGeneRules": {
                    "core": {
                        "allowedLineageIds": ["fixture_core"],
                        "allowedGeneProfileIds": ["fixture_core_gene_v1"],
                    },
                    "resonance_one": {
                        "allowedLineageIds": ["fixture_resonance"],
                        "allowedGeneProfileIds": ["fixture_resonance_gene_v1"],
                    },
                    "resonance_two": {
                        "allowedLineageIds": ["*"],
                        "allowedGeneProfileIds": ["*"],
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
                    "replacementPath": f"fixture_assets/pets/{target_form_id}",
                },
            }
        ],
    }


def _closed_fusion_catalog_fixture() -> dict[str, Any]:
    document = _fusion_catalog_fixture()
    document["recipes"] = []
    return document


def _write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _frame(direction_index: int, phase_index: int, bundle_index: int) -> Image.Image:
    """Return a stable-bounds, asymmetric RGBA frame with a unique digest."""

    image = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    base_red = 40 + direction_index * 18
    base_green = 75 + bundle_index * 36
    base_blue = 90 + direction_index * 9
    draw.rounded_rectangle((54, 62, 174, 223), radius=20, fill=(base_red, base_green, base_blue, 255))
    # The left-side ear and direction-coded eye prevent accidental mirror equality.
    draw.polygon(((61, 78), (74, 43), (88, 78)), fill=(210, 145 + direction_index, 55, 255))
    draw.ellipse((80 + direction_index, 91, 92 + direction_index, 103), fill=(15, 22, 31, 255))
    # Motion phase changes only an interior marker, keeping baseline/center/height stable.
    marker_x = 91 + phase_index * 13
    draw.rectangle((marker_x, 171, marker_x + 7, 179), fill=(240, 225 - phase_index * 9, 70, 255))
    return image


def _battle_frame(view_index: int, action_index: int, bundle_index: int) -> Image.Image:
    image = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    red = 45 + (action_index * 13) % 160
    green = 75 + bundle_index * 40
    blue = 55 + view_index * 75
    draw.rounded_rectangle((58, 58, 180, 224), radius=24, fill=(red, green, blue, 255))
    draw.polygon(((67, 79), (79, 43), (94, 82)), fill=(226, 161, 66, 255))
    draw.rectangle((91 + action_index, 170, 101 + action_index, 180), fill=(244, 218, 77, 255))
    return image


def _bundle_metadata(catalog: dict[str, Any], *, mounted: bool) -> dict[str, Any]:
    form = catalog["forms"][0]
    actions = {
        action: {"frameCount": 1, "fps": 8, "loop": action in {"idle", "walk"}}
        for action in catalog["requiredBattleActions"]
    }
    result: dict[str, Any] = {
        "schemaVersion": 1,
        "runtimeFrameSize": [256, 256],
        "views": catalog["battleViews"],
        "actions": actions,
        "worldVisual": {
            "strategy": "ai_generated_integrated_independent_8" if mounted else "independent_8",
            "directions": catalog["canonicalDirections"],
            "runtimeMirroring": False,
            "actions": {
                "idle": {"frameCount": 1, "fps": 4, "loop": True},
                "walk": {"frameCount": 4, "fps": 10, "loop": True},
            },
        },
    }
    if mounted:
        result.update(
            {
                "mountFormId": form["formId"],
                "characterId": catalog["defaultCharacterId"],
            }
        )
        result["worldVisual"].update(
            {
                "runtimeLayeredComposition": False,
                "runtimeBodyLayerCount": 1,
            }
        )
    else:
        result["formId"] = form["formId"]
    return result


def _materialize_bundle(repo_root: Path, catalog: dict[str, Any], kind: str, bundle_index: int) -> None:
    bundle = catalog["forms"][0][kind]
    root = repo_root / bundle["root"]
    _write_json(repo_root / bundle["metadataPath"], _bundle_metadata(catalog, mounted=kind == "mounted"))
    for field in ("identityPath", "ownershipPath", "promptPath"):
        path = repo_root / bundle[field]
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(f"fixture {kind} {field}\n", encoding="utf-8")

    for direction_index, direction in enumerate(DIRECTIONS):
        idle = root / "world" / "directions" / direction / "idle" / "idle-1.png"
        idle.parent.mkdir(parents=True, exist_ok=True)
        _frame(direction_index, 0, bundle_index).save(idle)
        for phase in range(1, 5):
            walk = root / "world" / "directions" / direction / "walk" / f"walk-{phase}.png"
            walk.parent.mkdir(parents=True, exist_ok=True)
            _frame(direction_index, phase, bundle_index).save(walk)

    for view_index, view in enumerate(VIEWS):
        for action_index, action in enumerate(catalog["requiredBattleActions"]):
            frame = root / "views" / view / action / f"{action}-1.png"
            frame.parent.mkdir(parents=True, exist_ok=True)
            _battle_frame(view_index, action_index, bundle_index).save(frame)


def _materialize_all(repo_root: Path, catalog: dict[str, Any]) -> None:
    _materialize_bundle(repo_root, catalog, "pet", 0)
    _materialize_bundle(repo_root, catalog, "mounted", 1)


def _build_schema2_identity_gate(
    repo_root: Path,
    catalog: dict[str, Any],
) -> Path:
    form = catalog["forms"][0]
    form["status"] = "in_production"
    form["runtimeEnabled"] = False
    form["rideableTarget"] = False
    form["supportedCharacterIds"] = []
    form.pop("mounted", None)
    _materialize_bundle(repo_root, catalog, "pet", 0)

    root = repo_root / form["pet"]["root"]
    identity = root / "identity"
    source = root / "source"
    qa = root / "qa"
    source.mkdir(parents=True, exist_ok=True)
    qa.mkdir(parents=True, exist_ok=True)
    raw_path = source / "identity-board-raw.png"
    raw = Image.new("RGB", (1024, 1024), (255, 0, 255))
    draw = ImageDraw.Draw(raw)
    pose_specs = {
        "front_3quarter_sw": ((92, 92, 382, 452), (180, 91, 40)),
        "back_3quarter_ne": ((104, 86, 404, 448), (44, 101, 174)),
        "south": ((112, 98, 396, 456), (61, 142, 75)),
        "west": ((88, 106, 408, 446), (130, 72, 164)),
    }
    for index, (_pose, (box, color)) in enumerate(pose_specs.items()):
        offset_x = (index % 2) * 512
        offset_y = (index // 2) * 512
        shifted = tuple(
            value + (offset_x if coordinate % 2 == 0 else offset_y)
            for coordinate, value in enumerate(box)
        )
        draw.rounded_rectangle(shifted, radius=24, fill=color)
        draw.rectangle(
            (
                shifted[0] + 20 + index * 8,
                shifted[1] + 32,
                shifted[0] + 42 + index * 8,
                shifted[1] + 54,
            ),
            fill=(238, 190, 72),
        )
    raw.save(raw_path)

    build_root = repo_root / "identity-builder-output"
    built = subprocess.run(
        [
            sys.executable,
            str(REPO_ROOT / "tools/build_pet_art_bundle.py"),
            "--input",
            str(raw_path),
            "--output-dir",
            str(build_root),
            "--rows",
            "2",
            "--cols",
            "2",
            "--slots",
            *identity_finalizer.IDENTITY_POSES,
            "--anchor",
            "feet",
            "--alpha-threshold",
            "8",
            "--safe-margin",
            "4",
        ],
        check=False,
        capture_output=True,
        text=True,
        timeout=30,
    )
    if built.returncode != 0:
        raise AssertionError(built.stderr or built.stdout)
    pose_paths = {
        pose: identity / f"{pose}.png"
        for pose in identity_finalizer.IDENTITY_POSES
    }
    for pose, path in pose_paths.items():
        path.write_bytes(
            (build_root / f"source-frames/{pose}.png").read_bytes()
        )
    board_path = identity / "identity-board-transparent.png"
    board_path.write_bytes(
        (build_root / "sheet-transparent.png").read_bytes()
    )
    pipeline_path = source / "identity-board-pipeline-meta.json"
    pipeline_path.write_bytes(
        (build_root / "pipeline-meta.json").read_bytes()
    )
    pipeline = json.loads(pipeline_path.read_text(encoding="utf-8"))
    pipeline["input"] = (
        f"{form['pet']['root']}/source/identity-board-raw.png"
    )
    _write_json(pipeline_path, pipeline)

    contact_path = qa / "identity-key-pose-contact-sheet.png"
    contact_path.write_bytes(board_path.read_bytes())
    _write_json(
        qa / "identity-key-pose-qc.json",
        {
            "schemaVersion": 1,
            "formId": form["formId"],
            "reviewScope": "identity_key_pose_gate",
            "selfReviewStatus": "passed",
            "ownerReviewStatus": "pending",
            "runtimeEnabled": False,
            "errors": [],
            "identityBoard": {
                "path": "identity/identity-board-transparent.png",
                "fileSha256": identity_finalizer.sha256_file(board_path),
                "canonicalRgbaSha256": (
                    identity_finalizer.canonical_rgba_sha256(board_path)
                ),
            },
            "poses": {
                pose: {
                    "path": f"identity/{pose}.png",
                    "fileSha256": identity_finalizer.sha256_file(path),
                    "canonicalRgbaSha256": (
                        identity_finalizer.canonical_rgba_sha256(path)
                    ),
                }
                for pose, path in pose_paths.items()
            },
            "contactSheet": {
                "path": "qa/identity-key-pose-contact-sheet.png",
                "fileSha256": identity_finalizer.sha256_file(contact_path),
            },
        },
    )
    (root / "action-bundle-meta.json").unlink()
    with mock.patch.object(identity_finalizer, "REPO_ROOT", repo_root):
        identity_finalizer.finalize_form(form, force=False)
    return root


def _materialize_schema2_identity_gate(
    repo_root: Path,
    catalog: dict[str, Any],
) -> Path:
    return _build_schema2_identity_gate(repo_root, catalog)


def _extend_schema2_identity_gate_with_battle(
    repo_root: Path,
    catalog: dict[str, Any],
    pet_root: Path,
) -> dict[str, Any]:
    metadata_path = pet_root / "action-bundle-meta.json"
    existing = json.loads(metadata_path.read_text(encoding="utf-8"))
    action_metadata = {
        action: {
            "frameCount": frame_count,
            "fps": fps,
            "loop": loop,
            "status": "owner_review_pending",
        }
        for action, (frame_count, fps, loop) in ACTION_SPECS.items()
    }
    options = InstallOptions(
        staging=repo_root / "battle-staging",
        destination=pet_root,
        form_id=catalog["forms"][0]["formId"],
        kind="pet",
        archive_mode="full",
    )
    validated = ValidatedBundle(
        manifest={},
        copies=[],
        generated=[],
        frame_hashes={},
        bundle_digest="a" * 64,
        action_metadata=action_metadata,
    )
    extended = _build_target_metadata(existing, options, validated)
    _write_json(metadata_path, extended)
    return extended


def _materialize_full_source_battle(
    repo_root: Path,
    catalog: dict[str, Any],
    kind: str,
) -> None:
    form = catalog["forms"][0]
    bundle = form[kind]
    root = repo_root / bundle["root"]
    metadata_path = repo_root / bundle["metadataPath"]
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    metadata["actions"] = {
        action: {
            "frameCount": frame_count,
            "fps": fps,
            "loop": loop,
        }
        for action, (frame_count, fps, loop) in ACTION_SPECS.items()
    }
    metadata["battleVisual"] = {
        "archiveMode": "full",
        "sourceFramesTracked": True,
        "sourceLedger": "source/battle/source-ledger.json",
    }
    _write_json(metadata_path, metadata)

    actions: dict[str, dict[str, object]] = {}
    down_holds: dict[str, Image.Image] = {}
    for view_index, view in enumerate(VIEWS):
        view_actions: dict[str, object] = {}
        for action_index, (action, (frame_count, _fps, _loop)) in enumerate(
            ACTION_SPECS.items()
        ):
            source_hashes: list[str] = []
            runtime_hashes: list[str] = []
            frame_records: list[dict[str, object]] = []
            for index in range(1, frame_count + 1):
                if action == "revive" and index == 1:
                    source = down_holds[view].copy()
                else:
                    source = Image.new(
                        "RGBA",
                        (512, 512),
                        (0, 0, 0, 0),
                    )
                    draw = ImageDraw.Draw(source)
                    left = 104 + view_index * 18 + action_index
                    top = 116 + index
                    draw.rounded_rectangle(
                        (left, top, left + 250, top + 252),
                        radius=38,
                        fill=(
                            35 + action_index * 7,
                            85 + index * 3,
                            120 + view_index * 40,
                            255,
                        ),
                    )
                    draw.rectangle(
                        (
                            left + 24 + index,
                            top + 31,
                            left + 42 + index,
                            top + 49,
                        ),
                        fill=(238, 190, 72, 255),
                    )
                if action == "down" and index == frame_count:
                    down_holds[view] = source.copy()
                runtime, _cleaned = derive_runtime_frame(
                    source,
                    (255, 0, 255),
                    30.0,
                    96,
                )
                source_path = (
                    root
                    / "source/battle"
                    / view
                    / action
                    / "source-frames"
                    / f"{action}-{index}.png"
                )
                runtime_path = (
                    root
                    / "views"
                    / view
                    / action
                    / f"{action}-{index}.png"
                )
                source_path.parent.mkdir(parents=True, exist_ok=True)
                runtime_path.parent.mkdir(parents=True, exist_ok=True)
                source.save(source_path)
                runtime.save(runtime_path)
                source_digest = rgba_hash(source)
                runtime_digest = rgba_hash(runtime)
                source_hashes.append(source_digest)
                runtime_hashes.append(runtime_digest)
                frame_records.append(
                    {
                        "slot": f"{action}-{index}",
                        "sourceRgbaSha256": source_digest,
                        "runtimeRgbaSha256": runtime_digest,
                    }
                )
            _write_json(
                root
                / "source/battle"
                / view
                / action
                / "pipeline-meta.json",
                {
                    "key": "#FF00FF",
                    "residualMagentaDistance": 30.0,
                    "fringeCleanupAlpha": 96,
                    "frames": frame_records,
                },
            )
            view_actions[action] = {
                "sourceFramesTracked": True,
                "sourceFrameRgbaSha256": source_hashes,
                "runtimeFrameRgbaSha256": runtime_hashes,
            }
        actions[view] = view_actions
    _write_json(
        root / "source/battle/source-ledger.json",
        {
            "schemaVersion": 1,
            "archiveMode": "full",
            "formId": form["formId"],
            "kind": kind,
            "characterId": (
                catalog["defaultCharacterId"] if kind == "mounted" else None
            ),
            "actions": actions,
        },
    )


def _fixture_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _materialize_mounted_lean_release_contract(
    repo_root: Path,
    catalog: dict[str, Any],
) -> Path:
    form = catalog["forms"][0]
    form["status"] = "owner_review_pending"
    form["runtimeEnabled"] = False
    bundle = form["mounted"]
    root = repo_root / bundle["root"]
    metadata_path = repo_root / bundle["metadataPath"]
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    bundle_digest = "a" * 64
    metadata["battleVisual"] = {
        "status": "owner_review_pending",
        "kind": "mounted",
        "bundleDigest": bundle_digest,
        "archiveMode": "lean",
        "sourceFramesTracked": False,
        "sourceLedger": "source/battle/source-ledger.json",
        "runtimeRoot": "views",
        "qcSummary": "qa/battle/qc-summary.json",
    }
    _write_json(metadata_path, metadata)

    installed_hashes: dict[str, str] = {}
    validated_hashes: dict[str, str] = {}
    ledger_actions: dict[str, dict[str, object]] = {}
    for view in VIEWS:
        view_actions: dict[str, object] = {}
        for action in catalog["requiredBattleActions"]:
            frame_count = metadata["actions"][action]["frameCount"]
            action_root = root / "source" / "battle" / view / action
            prompt = action_root / "prompt-used.txt"
            prompt.parent.mkdir(parents=True, exist_ok=True)
            prompt.write_text(
                f"Fixture exact mounted battle prompt for {view}/{action}; "
                "whole-frame rider and mount, no mirroring or layered composition.\n",
                encoding="utf-8",
            )
            pipeline = action_root / "pipeline-meta.json"
            qa = action_root / "qa.json"
            _write_json(pipeline, {"schemaVersion": 1, "action": action})
            _write_json(qa, {"schemaVersion": 1, "status": "passed"})
            evidence_paths = (prompt, pipeline, qa)
            for evidence_path in evidence_paths:
                relative = evidence_path.relative_to(root).as_posix()
                digest = _fixture_sha256(evidence_path)
                installed_hashes[relative] = digest
                validated_hashes[relative] = digest

            source_hashes: list[str] = []
            runtime_hashes: list[str] = []
            for index in range(1, frame_count + 1):
                source_relative = (
                    f"source/battle/{view}/{action}/source-frames/"
                    f"{action}-{index}.png"
                )
                runtime_relative = f"views/{view}/{action}/{action}-{index}.png"
                source_digest = hashlib.sha256(
                    source_relative.encode("utf-8")
                ).hexdigest()
                with Image.open(root / runtime_relative) as opened:
                    runtime_digest = rgba_hash(opened.convert("RGBA"))
                source_hashes.append(source_digest)
                runtime_hashes.append(runtime_digest)
                validated_hashes[source_relative] = source_digest
                installed_hashes[runtime_relative] = _fixture_sha256(
                    root / runtime_relative
                )

            raw_relative = f"source/battle/{view}/{action}/raw-sheet-lossless.png"
            source_meta_relative = f"source/battle/{view}/{action}/source-meta.json"
            validated_hashes[raw_relative] = hashlib.sha256(
                raw_relative.encode("utf-8")
            ).hexdigest()
            validated_hashes[source_meta_relative] = hashlib.sha256(
                source_meta_relative.encode("utf-8")
            ).hexdigest()
            if action == "idle":
                raw = root / raw_relative
                raw.parent.mkdir(parents=True, exist_ok=True)
                Image.new("RGB", (32, 32), (255, 0, 255)).save(raw)
                source_meta = root / source_meta_relative
                _write_json(
                    source_meta,
                    {"schemaVersion": 1, "sourceOrigin": "fixture"},
                )
                installed_hashes[raw_relative] = _fixture_sha256(raw)
                installed_hashes[source_meta_relative] = _fixture_sha256(
                    source_meta
                )
                validated_hashes[raw_relative] = installed_hashes[raw_relative]
                validated_hashes[source_meta_relative] = installed_hashes[
                    source_meta_relative
                ]

            view_actions[action] = {
                "originalGeneratedSha256": "1" * 64,
                "originalGeneratedDecodedRgbaSha256": "2" * 64,
                "rawArchiveSha256": "3" * 64,
                "rawDecodedRgbaSha256": "4" * 64,
                "promptSha256": _fixture_sha256(prompt),
                "pipelineSha256": _fixture_sha256(pipeline),
                "qcSha256": _fixture_sha256(qa),
                "sourceFrameRgbaSha256": source_hashes,
                "runtimeFrameRgbaSha256": runtime_hashes,
                "representativeRawTracked": action == "idle",
                "sourceFramesTracked": False,
            }
        ledger_actions[view] = view_actions

    qc_summary = root / "qa/battle/qc-summary.json"
    _write_json(
        qc_summary,
        {
            "schemaVersion": 1,
            "status": "passed",
            "ownerReviewStatus": "pending",
        },
    )
    installed_hashes[qc_summary.relative_to(root).as_posix()] = _fixture_sha256(
        qc_summary
    )
    validated_hashes[qc_summary.relative_to(root).as_posix()] = _fixture_sha256(
        qc_summary
    )

    source_ledger = root / "source/battle/source-ledger.json"
    _write_json(
        source_ledger,
        {
            "schemaVersion": 1,
            "archiveMode": "lean",
            "formId": form["formId"],
            "kind": "mounted",
            "characterId": catalog["defaultCharacterId"],
            "generator": "fixture generator",
            "sourceOrigin": "project-owned fixture generation",
            "ownership": "fixture project ownership",
            "replacementPath": "regenerate from fixture prompts",
            "fullSourceValidationRequiredBeforeInstall": True,
            "actions": ledger_actions,
        },
    )
    installed_hashes[source_ledger.relative_to(root).as_posix()] = _fixture_sha256(
        source_ledger
    )

    install_manifest = root / "source/battle/install-manifest.json"
    _write_json(
        install_manifest,
        {
            "schemaVersion": 1,
            "tool": "install_pet_battle_bundle.py",
            "formId": form["formId"],
            "kind": "mounted",
            "characterId": catalog["defaultCharacterId"],
            "bundleDigest": bundle_digest,
            "archiveMode": "lean",
            "installedFileHashes": dict(sorted(installed_hashes.items())),
            "validatedSourceFileHashes": dict(sorted(validated_hashes.items())),
            "runtimeEnabled": False,
            "ownerReviewStatus": "pending",
        },
    )
    return root


def _run(
    repo_root: Path,
    catalog: dict[str, Any],
    fusion_catalog: dict[str, Any] | None = None,
) -> tuple[subprocess.CompletedProcess[str], dict[str, Any]]:
    catalog_path = repo_root / "pet_art_catalog.json"
    fusion_catalog_path = repo_root / "pet_fusion_recipes.json"
    report_path = repo_root / "report.json"
    markdown_path = repo_root / "report.md"
    _write_json(catalog_path, catalog)
    command = [
        sys.executable,
        str(AUDITOR),
        "--repo-root",
        str(repo_root),
        "--catalog",
        str(catalog_path),
        "--json-out",
        str(report_path),
        "--markdown-out",
        str(markdown_path),
    ]
    if fusion_catalog is not None:
        _write_json(fusion_catalog_path, fusion_catalog)
        command.extend(["--fusion-catalog", str(fusion_catalog_path)])
    completed = subprocess.run(
        command,
        check=False,
        capture_output=True,
        text=True,
        timeout=30,
    )
    report = json.loads(report_path.read_text(encoding="utf-8"))
    return completed, report


def _issue_codes(report: dict[str, Any], key: str = "errors") -> list[str]:
    codes = [entry["code"] for entry in report.get("catalogErrors", [])] if key == "errors" else []
    for form in report.get("forms", []):
        codes.extend(entry["code"] for entry in form.get(key, []))
    return codes


class PetArtBatchAuditTest(unittest.TestCase):
    def test_walk_tail_extension_is_diagnostic_not_release_anchor_drift(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            catalog = _read_fixture()
            _materialize_all(root, catalog)
            pet_root = root / catalog["forms"][0]["pet"]["root"]
            tail_boxes = (
                (18, 118, 60, 130),
                (34, 118, 60, 130),
                (168, 118, 212, 130),
                (168, 118, 232, 130),
            )
            for phase, tail_box in enumerate(tail_boxes, start=1):
                path = (
                    pet_root
                    / "world/directions/south/walk"
                    / f"walk-{phase}.png"
                )
                with Image.open(path) as opened:
                    frame = opened.convert("RGBA")
                ImageDraw.Draw(frame).rectangle(
                    tail_box,
                    fill=(92, 126, 151, 255),
                )
                frame.save(path)

            completed, report = _run(root, catalog)

            self.assertEqual(completed.returncode, 0, completed.stderr)
            self.assertNotIn("center_drift", _issue_codes(report))
            motion = report["forms"][0]["pet"]["world"]["directions"][
                "south"
            ]["motion"]
            self.assertGreater(
                motion["centerDriftPx"],
                AUDIT_MODULE.MAX_CENTER_DRIFT_PX,
            )
            self.assertLessEqual(
                motion["supportCenterDriftPx"],
                AUDIT_MODULE.MAX_CENTER_DRIFT_PX,
            )
            self.assertLessEqual(
                motion["anchorConsensusDriftPx"],
                AUDIT_MODULE.MAX_CENTER_DRIFT_PX,
            )
            self.assertEqual(
                motion["centerGateMetric"],
                AUDIT_MODULE.CENTER_GATE_METRIC,
            )

    def test_walk_whole_subject_slide_still_fails_center_gate(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            catalog = _read_fixture()
            _materialize_all(root, catalog)
            pet_root = root / catalog["forms"][0]["pet"]["root"]
            path = pet_root / "world/directions/south/walk/walk-4.png"
            with Image.open(path) as opened:
                source = opened.convert("RGBA")
            shifted = Image.new("RGBA", source.size, (0, 0, 0, 0))
            shifted.alpha_composite(source, (18, 0))
            shifted.save(path)

            completed, report = _run(root, catalog)

            self.assertNotEqual(completed.returncode, 0)
            self.assertIn("center_drift", _issue_codes(report))
            motion = report["forms"][0]["pet"]["world"]["directions"][
                "south"
            ]["motion"]
            self.assertGreater(
                motion["anchorConsensusDriftPx"],
                AUDIT_MODULE.MAX_CENTER_DRIFT_PX,
            )

    def test_walk_alternating_feet_are_not_whole_subject_slide(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            catalog = _read_fixture()
            _materialize_all(root, catalog)
            pet_root = root / catalog["forms"][0]["pet"]["root"]
            foot_boxes = (
                (54, 206, 78, 223),
                (82, 206, 106, 223),
                (122, 206, 146, 223),
                (150, 206, 174, 223),
            )
            for phase, foot_box in enumerate(foot_boxes, start=1):
                path = (
                    pet_root
                    / "world/directions/south/walk"
                    / f"walk-{phase}.png"
                )
                with Image.open(path) as opened:
                    frame = opened.convert("RGBA")
                draw = ImageDraw.Draw(frame)
                draw.rectangle((54, 206, 174, 223), fill=(0, 0, 0, 0))
                draw.rectangle(foot_box, fill=(92, 126, 151, 255))
                frame.save(path)

            completed, report = _run(root, catalog)

            self.assertEqual(completed.returncode, 0, completed.stderr)
            self.assertNotIn("center_drift", _issue_codes(report))
            motion = report["forms"][0]["pet"]["world"]["directions"][
                "south"
            ]["motion"]
            self.assertGreater(
                motion["supportCenterDriftPx"],
                AUDIT_MODULE.MAX_CENTER_DRIFT_PX,
            )
            self.assertLessEqual(
                motion["anchorConsensusDriftPx"],
                AUDIT_MODULE.MAX_CENTER_DRIFT_PX,
            )

    def test_complete_fixture_passes(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            catalog = _read_fixture()
            _materialize_all(root, catalog)
            completed, report = _run(root, catalog)

            self.assertEqual(completed.returncode, 0, completed.stderr)
            self.assertEqual(report["status"], "ok")
            self.assertEqual(report["summary"]["errors"], 0)
            self.assertEqual(report["forms"][0]["pet"]["expectedPngCount"], 64)
            self.assertEqual(report["forms"][0]["mounted"]["validatedPngCount"], 64)
            self.assertTrue((root / "report.md").is_file())

    def test_nonrideable_pet_only_fixture_passes_without_mounted_bundle(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            catalog = _read_fixture()
            form = catalog["forms"][0]
            form["rideableTarget"] = False
            form["supportedCharacterIds"] = []
            form.pop("mounted")
            _materialize_bundle(root, catalog, "pet", 0)

            completed, report = _run(root, catalog, _fusion_catalog_fixture())

            self.assertEqual(completed.returncode, 0, completed.stderr)
            self.assertEqual(report["status"], "ok")
            self.assertEqual(report["summary"]["errors"], 0)
            self.assertEqual(report["forms"][0]["pet"]["validatedPngCount"], 64)
            self.assertEqual(report["forms"][0]["mounted"], {})
            self.assertEqual(
                report["fusionAuthorization"]["matchedFormIds"],
                ["fixture_pet"],
            )

    def test_closed_zero_recipe_v2_is_valid_but_authorizes_no_art_form(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            catalog = _read_fixture()
            form = catalog["forms"][0]
            form["rideableTarget"] = False
            form["supportedCharacterIds"] = []
            form.pop("mounted")
            _materialize_bundle(root, catalog, "pet", 0)

            completed, report = _run(
                root,
                catalog,
                _closed_fusion_catalog_fixture(),
            )

            self.assertNotEqual(completed.returncode, 0)
            self.assertEqual(report["catalogErrors"], [])
            self.assertIn("nonrideable_not_fusion_target", _issue_codes(report))
            self.assertTrue(
                report["fusionAuthorization"]["catalogChecked"],
            )
            self.assertEqual(
                report["fusionAuthorization"]["formalRecipeTargetFormIds"],
                [],
            )

    def test_malformed_v2_recipe_never_authorizes_nonrideable_art(self) -> None:
        mutations = (
            "missing_role",
            "missing_result_field",
            "nonformal_asset",
            "extra_role_field",
            "wrong_global_rule",
        )
        for mutation in mutations:
            with self.subTest(mutation=mutation), tempfile.TemporaryDirectory() as temp_dir:
                root = Path(temp_dir)
                catalog = _read_fixture()
                form = catalog["forms"][0]
                form["rideableTarget"] = False
                form["supportedCharacterIds"] = []
                form.pop("mounted")
                _materialize_bundle(root, catalog, "pet", 0)
                fusion = _fusion_catalog_fixture()
                recipe = fusion["recipes"][0]
                if mutation == "missing_role":
                    recipe["roleGeneRules"].pop("resonance_two")
                elif mutation == "missing_result_field":
                    recipe["result"].pop("numericSource")
                elif mutation == "nonformal_asset":
                    recipe["assetGate"]["status"] = "deferred"
                elif mutation == "extra_role_field":
                    recipe["roleGeneRules"]["core"]["weight"] = 1
                else:
                    fusion["rules"]["resultRideable"] = True

                completed, report = _run(root, catalog, fusion)

                self.assertNotEqual(completed.returncode, 0)
                self.assertTrue(report["catalogErrors"])
                self.assertEqual(
                    report["fusionAuthorization"]["formalRecipeTargetFormIds"],
                    [],
                )
                self.assertIn(
                    "nonrideable_not_fusion_target",
                    _issue_codes(report),
                )

    def test_report_does_not_claim_fusion_coverage_without_art_forms(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            catalog = _read_fixture()
            _materialize_all(root, catalog)

            completed, report = _run(
                root,
                catalog,
                _closed_fusion_catalog_fixture(),
            )

            self.assertEqual(completed.returncode, 0, completed.stderr)
            authorization = report["fusionAuthorization"]
            self.assertFalse(authorization["catalogChecked"])
            self.assertEqual(authorization["artCatalogNonrideableFormIds"], [])
            self.assertEqual(authorization["formalRecipeTargetFormIds"], [])
            markdown = (root / "report.md").read_text(encoding="utf-8")
            self.assertIn("不能把本报告表述为融合目标美术已覆盖", markdown)

    def test_legacy_v1_fusion_catalog_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            catalog = _read_fixture()
            form = catalog["forms"][0]
            form["rideableTarget"] = False
            form["supportedCharacterIds"] = []
            form.pop("mounted")
            _materialize_bundle(root, catalog, "pet", 0)
            legacy = _fusion_catalog_fixture()
            legacy["schemaVersion"] = 1
            legacy["catalogId"] = "pet_fusion_recipes_v1"

            completed, report = _run(root, catalog, legacy)

            self.assertNotEqual(completed.returncode, 0)
            self.assertIn("invalid_fusion_catalog_identity", _issue_codes(report))

    def test_schema2_identity_gate_chain_is_recomputed_and_verified(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir).resolve()
            catalog = _read_fixture()
            _materialize_schema2_identity_gate(root, catalog)

            completed, report = _run(
                root,
                catalog,
                _fusion_catalog_fixture(),
            )

            self.assertEqual(completed.returncode, 0, completed.stderr)
            self.assertEqual(report["summary"]["errors"], 0)
            self.assertEqual(
                report["forms"][0]["pet"]["identityGate"],
                {
                    "declared": True,
                    "schemaVersion": 2,
                    "status": "verified",
                },
            )

    def test_schema2_identity_gate_detects_action_meta_hash_drift(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir).resolve()
            catalog = _read_fixture()
            pet_root = _materialize_schema2_identity_gate(root, catalog)
            metadata_path = pet_root / "action-bundle-meta.json"
            metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
            metadata["evidence"]["identityBoardSha256"] = "0" * 64
            _write_json(metadata_path, metadata)

            completed, report = _run(
                root,
                catalog,
                _fusion_catalog_fixture(),
            )

            self.assertNotEqual(completed.returncode, 0)
            self.assertIn(
                "invalid_identity_gate_action_meta",
                _issue_codes(report),
            )

    def test_schema2_identity_gate_allows_formal_battle_metadata_extension(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir).resolve()
            catalog = _read_fixture()
            pet_root = _materialize_schema2_identity_gate(root, catalog)

            initial_completed, initial_report = _run(
                root,
                catalog,
                _fusion_catalog_fixture(),
            )
            self.assertEqual(
                initial_completed.returncode,
                0,
                initial_completed.stderr,
            )
            self.assertEqual(initial_report["summary"]["errors"], 0)

            extended = _extend_schema2_identity_gate_with_battle(
                root,
                catalog,
                pet_root,
            )
            completed, report = _run(
                root,
                catalog,
                _fusion_catalog_fixture(),
            )

            self.assertEqual(completed.returncode, 0, completed.stderr)
            self.assertEqual(report["summary"]["errors"], 0)
            self.assertEqual(
                report["forms"][0]["pet"]["identityGate"]["status"],
                "verified",
            )
            self.assertEqual(
                extended["productionScope"],
                "formal_battle_two_view_owner_review_pending",
            )
            self.assertEqual(
                extended["battleVisual"]["totalFrameCount"],
                180,
            )

    def test_schema2_identity_gate_rejects_identity_drift_after_battle_extension(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir).resolve()
            catalog = _read_fixture()
            pet_root = _materialize_schema2_identity_gate(root, catalog)
            metadata = _extend_schema2_identity_gate_with_battle(
                root,
                catalog,
                pet_root,
            )
            metadata["identity"]["poses"].pop("west")
            _write_json(pet_root / "action-bundle-meta.json", metadata)

            completed, report = _run(
                root,
                catalog,
                _fusion_catalog_fixture(),
            )

            self.assertNotEqual(completed.returncode, 0)
            self.assertIn(
                "invalid_identity_gate_action_meta",
                _issue_codes(report),
            )

    def test_schema2_identity_gate_rejects_owner_or_runtime_bypass_after_battle_extension(
        self,
    ) -> None:
        mutations = {
            "nested runtime enable": lambda metadata: metadata[
                "battleVisual"
            ].__setitem__("runtimeEnabled", True),
            "nested owner approval": lambda metadata: metadata[
                "battleVisual"
            ].__setitem__("status", "approved"),
        }
        for label, mutate in mutations.items():
            with self.subTest(label=label), tempfile.TemporaryDirectory() as temp_dir:
                root = Path(temp_dir).resolve()
                catalog = _read_fixture()
                pet_root = _materialize_schema2_identity_gate(root, catalog)
                metadata = _extend_schema2_identity_gate_with_battle(
                    root,
                    catalog,
                    pet_root,
                )
                mutate(metadata)
                _write_json(pet_root / "action-bundle-meta.json", metadata)

                completed, report = _run(
                    root,
                    catalog,
                    _fusion_catalog_fixture(),
                )

                self.assertNotEqual(completed.returncode, 0)
                self.assertIn(
                    "invalid_identity_gate_action_meta",
                    _issue_codes(report),
                )

    def test_schema2_identity_gate_detects_source_meta_hash_drift(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir).resolve()
            catalog = _read_fixture()
            pet_root = _materialize_schema2_identity_gate(root, catalog)
            source_meta_path = (
                pet_root / "source/identity-board-source-meta.json"
            )
            source_meta = json.loads(
                source_meta_path.read_text(encoding="utf-8")
            )
            source_meta["promptSha256"] = "0" * 64
            _write_json(source_meta_path, source_meta)

            completed, report = _run(
                root,
                catalog,
                _fusion_catalog_fixture(),
            )

            self.assertNotEqual(completed.returncode, 0)
            self.assertIn(
                "invalid_identity_gate_source_meta",
                _issue_codes(report),
            )

    def test_schema2_identity_gate_detects_pipeline_pose_hash_drift(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir).resolve()
            catalog = _read_fixture()
            pet_root = _materialize_schema2_identity_gate(root, catalog)
            pipeline_path = (
                pet_root / "source/identity-board-pipeline-meta.json"
            )
            pipeline = json.loads(pipeline_path.read_text(encoding="utf-8"))
            pipeline["frames"][1]["sourceRgbaSha256"] = "0" * 64
            _write_json(pipeline_path, pipeline)

            completed, report = _run(
                root,
                catalog,
                _fusion_catalog_fixture(),
            )

            self.assertNotEqual(completed.returncode, 0)
            self.assertIn(
                "invalid_identity_gate_chain",
                _issue_codes(report),
            )

    def test_schema2_identity_gate_detects_qc_hash_drift(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir).resolve()
            catalog = _read_fixture()
            pet_root = _materialize_schema2_identity_gate(root, catalog)
            qc_path = pet_root / "qa/identity-key-pose-qc.json"
            qc = json.loads(qc_path.read_text(encoding="utf-8"))
            qc["poses"]["south"]["fileSha256"] = "0" * 64
            _write_json(qc_path, qc)

            completed, report = _run(
                root,
                catalog,
                _fusion_catalog_fixture(),
            )

            self.assertNotEqual(completed.returncode, 0)
            self.assertIn(
                "invalid_identity_gate_chain",
                _issue_codes(report),
            )

    def test_schema2_identity_gate_detects_pose_and_board_content_drift(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir).resolve()
            catalog = _read_fixture()
            pet_root = _materialize_schema2_identity_gate(root, catalog)
            pose_path = pet_root / "identity/west.png"
            with Image.open(pose_path) as opened:
                pose = opened.convert("RGBA")
            pose.putpixel((256, 256), (21, 32, 43, 255))
            pose.save(pose_path)

            completed, report = _run(
                root,
                catalog,
                _fusion_catalog_fixture(),
            )

            self.assertNotEqual(completed.returncode, 0)
            self.assertIn(
                "invalid_identity_gate_chain",
                _issue_codes(report),
            )

    def test_schema2_identity_gate_cannot_be_skipped_by_catalog_status_drift(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir).resolve()
            catalog = _read_fixture()
            pet_root = _materialize_schema2_identity_gate(root, catalog)
            catalog["forms"][0]["status"] = "owner_review_pending"
            pose_path = pet_root / "identity/west.png"
            with Image.open(pose_path) as opened:
                pose = opened.convert("RGBA")
            pose.putpixel((256, 256), (21, 32, 43, 255))
            pose.save(pose_path)

            completed, report = _run(
                root,
                catalog,
                _fusion_catalog_fixture(),
            )

            self.assertNotEqual(completed.returncode, 0)
            codes = _issue_codes(report)
            self.assertIn("identity_gate_catalog_status_mismatch", codes)
            self.assertIn("invalid_identity_gate_chain", codes)
            self.assertEqual(
                report["forms"][0]["pet"]["identityGate"]["status"],
                "failed",
            )

    def test_nonrideable_form_rejects_mounted_registration(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            catalog = _read_fixture()
            form = catalog["forms"][0]
            form["rideableTarget"] = False
            form["supportedCharacterIds"] = []
            _materialize_all(root, catalog)

            completed, report = _run(root, catalog, _fusion_catalog_fixture())

            self.assertNotEqual(completed.returncode, 0)
            self.assertIn("nonrideable_mounted_bundle", _issue_codes(report))

    def test_missing_rideable_target_fails_closed(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            catalog = _read_fixture()
            catalog["forms"][0].pop("rideableTarget")
            _materialize_all(root, catalog)

            completed, report = _run(root, catalog)

            self.assertNotEqual(completed.returncode, 0)
            self.assertIn("missing_form_field", _issue_codes(report))
            self.assertIn("invalid_rideable_target", _issue_codes(report))

    def test_nonboolean_rideable_target_fails_closed(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            catalog = _read_fixture()
            catalog["forms"][0]["rideableTarget"] = "false"
            _materialize_all(root, catalog)

            completed, report = _run(root, catalog)

            self.assertNotEqual(completed.returncode, 0)
            self.assertIn("invalid_rideable_target", _issue_codes(report))

    def test_nonarray_supported_characters_fails_closed(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            catalog = _read_fixture()
            catalog["forms"][0]["supportedCharacterIds"] = "novice_hunter_v1"
            _materialize_all(root, catalog)

            completed, report = _run(root, catalog)

            self.assertNotEqual(completed.returncode, 0)
            self.assertIn("invalid_supported_characters", _issue_codes(report))

    def test_missing_supported_characters_fails_closed(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            catalog = _read_fixture()
            catalog["forms"][0].pop("supportedCharacterIds")
            _materialize_all(root, catalog)

            completed, report = _run(root, catalog)

            self.assertNotEqual(completed.returncode, 0)
            self.assertIn("missing_form_field", _issue_codes(report))
            self.assertIn("invalid_supported_characters", _issue_codes(report))

    def test_nonrideable_form_rejects_supported_characters(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            catalog = _read_fixture()
            form = catalog["forms"][0]
            form["rideableTarget"] = False
            form.pop("mounted")
            _materialize_bundle(root, catalog, "pet", 0)

            completed, report = _run(
                root,
                catalog,
                _fusion_catalog_fixture(),
            )

            self.assertNotEqual(completed.returncode, 0)
            self.assertIn("nonrideable_supported_character", _issue_codes(report))

    def test_rideable_form_rejects_missing_mounted_bundle(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            catalog = _read_fixture()
            catalog["forms"][0].pop("mounted")
            _materialize_bundle(root, catalog, "pet", 0)

            completed, report = _run(root, catalog)

            self.assertNotEqual(completed.returncode, 0)
            self.assertIn("invalid_bundle", _issue_codes(report))

    def test_nonfusion_form_cannot_disguise_itself_as_nonrideable(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            catalog = _read_fixture()
            form = catalog["forms"][0]
            form["rideableTarget"] = False
            form["supportedCharacterIds"] = []
            form.pop("mounted")
            _materialize_bundle(root, catalog, "pet", 0)

            completed, report = _run(
                root,
                catalog,
                _fusion_catalog_fixture("another_fusion_target"),
            )

            self.assertNotEqual(completed.returncode, 0)
            self.assertIn("nonrideable_not_fusion_target", _issue_codes(report))

    def test_registered_evolution_frames_are_runtime_assets_not_orphans(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            catalog = _read_fixture()
            _materialize_all(root, catalog)
            pet_bundle = catalog["forms"][0]["pet"]
            pet_root = root / pet_bundle["root"]
            metadata_path = root / pet_bundle["metadataPath"]
            metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
            metadata["evolutionVisual"] = {
                "view": "front_3quarter_sw",
                "frameCount": 12,
                "runtimeRoot": "views/front_3quarter_sw/evolution",
            }
            _write_json(metadata_path, metadata)
            for index in range(1, 13):
                frame_path = (
                    pet_root
                    / "views/front_3quarter_sw/evolution"
                    / f"evolution-{index}.png"
                )
                frame_path.parent.mkdir(parents=True, exist_ok=True)
                _battle_frame(0, index, 0).save(frame_path)

            completed, report = _run(root, catalog)

            self.assertEqual(completed.returncode, 0, completed.stderr)
            pet = report["forms"][0]["pet"]
            self.assertEqual(pet["evolution"]["expected"], 12)
            self.assertEqual(pet["evolution"]["validated"], 12)
            self.assertEqual(pet["orphanPngs"], [])

    def test_mounted_full_source_derivation_is_audited(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            catalog = _read_fixture()
            _materialize_all(root, catalog)
            _materialize_full_source_battle(root, catalog, "mounted")
            completed, report = _run(root, catalog)

            self.assertEqual(completed.returncode, 0, completed.stderr)
            mounted = report["forms"][0]["mounted"]["battle"]
            self.assertEqual(mounted["trackedSourceFrameCount"], 180)
            self.assertEqual(
                mounted["canonicalDerivedRuntimeFrameCount"],
                180,
            )

    def test_mounted_lean_release_source_contract_is_verified(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            catalog = _read_fixture()
            _materialize_all(root, catalog)
            _materialize_mounted_lean_release_contract(root, catalog)
            completed, report = _run(root, catalog)

            self.assertEqual(completed.returncode, 0, completed.stderr)
            readiness = report["forms"][0]["mounted"]["battle"][
                "sourceReadiness"
            ]
            self.assertTrue(readiness["declared"])
            self.assertEqual(readiness["status"], "verified")
            self.assertEqual(readiness["archiveMode"], "lean")
            self.assertEqual(readiness["trackedPromptCount"], 24)
            self.assertEqual(readiness["expectedPromptCount"], 24)
            self.assertEqual(readiness["validatedSourceFrameHashCount"], 24)
            self.assertEqual(readiness["expectedSourceFrameHashCount"], 24)

    def test_mounted_legacy_lean_candidate_reports_specific_source_gaps(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            catalog = _read_fixture()
            catalog["forms"][0]["runtimeEnabled"] = False
            _materialize_all(root, catalog)
            mounted = catalog["forms"][0]["mounted"]
            mounted_root = root / mounted["root"]
            metadata_path = root / mounted["metadataPath"]
            metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
            metadata["battleVisual"] = {
                "status": "owner_review_pending",
                "bundleDigest": "a" * 64,
                "archiveMode": "lean",
                "sourceFramesTracked": False,
                "runtimeRoot": "views",
                "qcSummary": "qa/battle/qc-summary.json",
            }
            metadata["sourceArchive"] = {
                "formalProductionLedger": (
                    "source/formal-production/source-ledger.json"
                )
            }
            _write_json(metadata_path, metadata)
            _write_json(
                mounted_root / "qa/battle/qc-summary.json",
                {"schemaVersion": 1, "bundleDigest": "b" * 64},
            )
            _write_json(
                mounted_root / "source/formal-production/source-ledger.json",
                {"schemaVersion": 1, "bundleDigest": "b" * 64},
            )

            completed, report = _run(root, catalog)

            self.assertEqual(completed.returncode, 0, completed.stderr)
            codes = _issue_codes(report, "pending")
            self.assertIn("missing_battle_source_ledger", codes)
            self.assertIn("missing_battle_install_manifest", codes)
            self.assertIn("missing_battle_action_prompts", codes)
            self.assertIn("battle_bundle_digest_mismatch", codes)
            readiness = report["forms"][0]["mounted"]["battle"][
                "sourceReadiness"
            ]
            self.assertEqual(readiness["status"], "pending")
            self.assertEqual(readiness["trackedPromptCount"], 0)
            self.assertEqual(
                set(readiness["linkedBundleDigests"]),
                {"legacyLedger", "metadata", "qcSummary"},
            )

    def test_mounted_source_gap_blocks_runtime_enabled_form(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            catalog = _read_fixture()
            _materialize_all(root, catalog)
            mounted = catalog["forms"][0]["mounted"]
            metadata_path = root / mounted["metadataPath"]
            metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
            metadata["battleVisual"] = {
                "status": "owner_review_pending",
                "bundleDigest": "a" * 64,
                "archiveMode": "lean",
                "sourceFramesTracked": False,
                "runtimeRoot": "views",
                "qcSummary": "qa/battle/qc-summary.json",
            }
            _write_json(metadata_path, metadata)
            _write_json(
                root / mounted["root"] / "qa/battle/qc-summary.json",
                {"schemaVersion": 1},
            )

            completed, report = _run(root, catalog)

            self.assertEqual(completed.returncode, 1)
            readiness = report["forms"][0]["mounted"]["battle"][
                "sourceReadiness"
            ]
            self.assertEqual(readiness["status"], "failed")
            self.assertIn("missing_battle_source_ledger", _issue_codes(report))

    def test_mounted_runtime_overlay_breaks_full_source_gate(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            catalog = _read_fixture()
            _materialize_all(root, catalog)
            _materialize_full_source_battle(root, catalog, "mounted")
            mounted_root = root / catalog["forms"][0]["mounted"]["root"]
            runtime = (
                mounted_root
                / "views/front_3quarter_sw/attack/attack-2.png"
            )
            with Image.open(runtime) as opened:
                changed = opened.convert("RGBA").copy()
            ImageDraw.Draw(changed).rectangle(
                (90, 90, 96, 96),
                fill=(255, 255, 255, 255),
            )
            changed.save(runtime)
            completed, report = _run(root, catalog)

            self.assertEqual(completed.returncode, 1)
            self.assertIn(
                "invalid_full_source_archive",
                _issue_codes(report),
            )

    def test_horizontal_mirror_fake_direction_blocks_runtime(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            catalog = _read_fixture()
            _materialize_all(root, catalog)
            pet_root = root / catalog["forms"][0]["pet"]["root"]
            east = pet_root / "world" / "directions" / "east" / "idle" / "idle-1.png"
            west = pet_root / "world" / "directions" / "west" / "idle" / "idle-1.png"
            with Image.open(east) as image:
                ImageOps.mirror(image.convert("RGBA")).save(west)

            completed, report = _run(root, catalog)
            self.assertEqual(completed.returncode, 1)
            self.assertIn("mirrored_world_direction", _issue_codes(report))

    def test_missing_runtime_frame_blocks(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            catalog = _read_fixture()
            _materialize_all(root, catalog)
            missing = (
                root
                / catalog["forms"][0]["pet"]["root"]
                / "world"
                / "directions"
                / "south"
                / "walk"
                / "walk-4.png"
            )
            missing.unlink()

            completed, report = _run(root, catalog)
            self.assertEqual(completed.returncode, 1)
            self.assertIn("missing_png", _issue_codes(report))

    def test_deep_magenta_transparent_edge_contamination_blocks(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            catalog = _read_fixture()
            _materialize_all(root, catalog)
            pet_root = root / catalog["forms"][0]["pet"]["root"]
            frame_path = pet_root / "views/front_3quarter_sw/idle/idle-1.png"
            with Image.open(frame_path) as opened:
                frame = opened.convert("RGBA")
            draw = ImageDraw.Draw(frame)
            draw.rounded_rectangle(
                (58, 58, 180, 224),
                radius=24,
                outline=(240, 4, 244, 220),
                width=2,
            )
            frame.save(frame_path)

            completed, report = _run(root, catalog)
            self.assertEqual(completed.returncode, 1)
            self.assertIn("magenta_edge_contamination", _issue_codes(report))

    def test_legitimate_solid_purple_subject_does_not_trigger_edge_spill_gate(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            catalog = _read_fixture()
            _materialize_all(root, catalog)
            pet_root = root / catalog["forms"][0]["pet"]["root"]
            frame_path = pet_root / "views/front_3quarter_sw/idle/idle-1.png"
            image = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
            ImageDraw.Draw(image).rounded_rectangle(
                (58, 58, 180, 224),
                radius=24,
                fill=(105, 34, 148, 255),
            )
            image.save(frame_path)

            completed, report = _run(root, catalog)
            self.assertEqual(completed.returncode, 0, completed.stderr)
            self.assertNotIn("magenta_edge_contamination", _issue_codes(report))

    def test_legitimate_contrasting_purple_rim_does_not_trigger_edge_spill_gate(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            catalog = _read_fixture()
            _materialize_all(root, catalog)
            pet_root = root / catalog["forms"][0]["pet"]["root"]
            frame_path = pet_root / "views/front_3quarter_sw/idle/idle-1.png"
            image = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
            draw = ImageDraw.Draw(image)
            draw.rounded_rectangle((58, 58, 180, 224), radius=24, fill=(112, 67, 31, 255))
            draw.rounded_rectangle(
                (57, 57, 181, 225),
                radius=25,
                outline=(105, 34, 148, 220),
                width=2,
            )
            image.save(frame_path)

            completed, report = _run(root, catalog)
            self.assertEqual(completed.returncode, 0, completed.stderr)
            self.assertNotIn("magenta_edge_contamination", _issue_codes(report))

    def test_less_than_twelve_near_key_pixels_still_fail_when_ratio_exceeds_two_percent(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            catalog = _read_fixture()
            _materialize_all(root, catalog)
            pet_root = root / catalog["forms"][0]["pet"]["root"]
            frame_path = pet_root / "views/front_3quarter_sw/idle/idle-1.png"
            image = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
            draw = ImageDraw.Draw(image)
            draw.rectangle((120, 120, 125, 125), fill=(112, 67, 31, 255))
            for x, y in ((120, 120), (121, 120), (122, 120), (123, 120)):
                image.putpixel((x, y), (240, 4, 244, 220))
            image.save(frame_path)

            completed, report = _run(root, catalog)
            self.assertEqual(completed.returncode, 1)
            self.assertIn("magenta_edge_contamination", _issue_codes(report))

    def test_planned_missing_assets_are_pending_and_nonblocking(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            catalog = copy.deepcopy(_read_fixture())
            form = catalog["forms"][0]
            form["status"] = "planned"
            form["runtimeEnabled"] = False

            completed, report = _run(root, catalog)
            self.assertEqual(completed.returncode, 0, completed.stderr)
            self.assertEqual(report["status"], "pending")
            self.assertEqual(report["summary"]["errors"], 0)
            self.assertGreater(report["summary"]["pendingIssues"], 0)
            self.assertIn("missing_bundle_root", _issue_codes(report, "pending"))

    def test_runtime_missing_assets_block(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            catalog = _read_fixture()

            completed, report = _run(root, catalog)
            self.assertEqual(completed.returncode, 1)
            self.assertEqual(report["status"], "failed")
            self.assertIn("missing_bundle_root", _issue_codes(report))


if __name__ == "__main__":
    unittest.main()
