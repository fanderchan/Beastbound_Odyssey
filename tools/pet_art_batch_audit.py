#!/usr/bin/env python3
"""Audit Beastbound pet and integrated-mounted runtime art in one deterministic pass.

The tool is deliberately read-only.  It validates the data-driven v1 art
catalog, checks every registered runtime PNG, and writes machine-readable JSON
plus a compact Markdown review index.  Missing or incomplete assets belonging
to a disabled planned/in-production form are reported as pending work.  The
same defect on a runtime-enabled form is a blocking error and produces exit 1.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Any, Iterable

from PIL import Image, ImageOps, UnidentifiedImageError

from audit_pet_battle_catalog import _audit_tracked_source_derivation
import finalize_pet_identity_gate as identity_gate
from pet_identity_replay_contract import (
    CLOSED_REGISTRATION_LEGACY_PATH_BOUND_REPLAY_SHA256,
)
from sprite_alpha_despill import magenta_edge_metrics


SCHEMA_VERSION = 1
FUSION_CATALOG_SCHEMA_VERSION = 2
FUSION_CATALOG_ID = "pet_fusion_recipes_v2"
DEFAULT_FUSION_CATALOG_PATH = Path("client/godot/data/pet_fusion_recipes.json")
FUSION_ROLE_IDS = ("core", "resonance_one", "resonance_two")
FUSION_CATALOG_KEYS = {
    "schemaVersion",
    "catalogId",
    "runtimeEnabled",
    "disabledMessage",
    "rules",
    "geneProfiles",
    "recipes",
}
FUSION_RULE_KEYS = {
    "roleIds",
    "requiredGrowthModelVersion",
    "requiredRebirthCount",
    "minimumLevel",
    "maximumLevel",
    "baseActiveSkillIds",
    "specialActiveInheritanceChance",
    "passiveSourceWeights",
    "resultPassiveSkillCount",
    "materialNumericInheritance",
    "resultRideable",
    "additionalCostPolicy",
    "resultBindingPolicy",
    "unboundResultTradePolicy",
    "baseActiveSkillForgetPolicy",
    "inheritedSpecialActiveForgetPolicy",
    "postFusionTrainingPolicy",
}
FUSION_RECIPE_KEYS = {
    "recipeId",
    "targetFormId",
    "targetGrowthProfileId",
    "roleGeneRules",
    "result",
    "assetGate",
}
FUSION_ROLE_RULE_KEYS = {"allowedLineageIds", "allowedGeneProfileIds"}
FUSION_RESULT = {
    "level": 1,
    "rebirthCount": 1,
    "terminalPathId": "fusion_terminal_v1",
    "paidResetAllowed": False,
    "newInstanceRequired": True,
    "numericSource": "target_profile_only_v1",
    "rideable": False,
    "bindingPolicy": "bound_if_any_material_bound",
    "resultStatePolicy": "replace_active_else_core_state",
}
FUSION_ASSET_GATE_KEYS = {"status", "replacementPath"}
IDENTIFIER_PATTERN = re.compile(r"^[a-z][a-z0-9_]{1,95}$")
CANONICAL_DIRECTIONS = (
    "south",
    "southwest",
    "west",
    "northwest",
    "north",
    "northeast",
    "east",
    "southeast",
)
BATTLE_VIEWS = ("front_3quarter_sw", "back_3quarter_ne")
WORLD_ACTIONS = {"idle": 1, "walk": 4}
ALLOWED_STATUSES = {"planned", "in_production", "owner_review_pending", "approved"}
REQUIRED_FORM_FIELDS = (
    "formId",
    "displayName",
    "lineId",
    "subtypeId",
    "productionGroup",
    "artSkeletonId",
    "status",
    "runtimeEnabled",
    "rideableTarget",
    "supportedCharacterIds",
    "identityBrief",
    "pet",
)
REQUIRED_BUNDLE_FIELDS = ("root", "metadataPath", "identityPath", "ownershipPath", "promptPath")
FRAME_SIZE = (256, 256)
SAFE_EDGE_MARGIN = 4
ALPHA_THRESHOLD = 24
MAX_BASELINE_DRIFT_PX = 2
MAX_CENTER_DRIFT_PX = 12.0
SUPPORT_BAND_HEIGHT_PX = 18
CENTER_GATE_METRIC = "alpha_bounds_support_pair_consensus_v1"
MAX_ALPHA_HEIGHT_RATIO = 1.12
MAX_STRONG_MAGENTA_EDGE_RATIO = 0.02
SHA256_PATTERN = re.compile(r"^[0-9a-f]{64}$")
FORMAL_BATTLE_ARCHIVE_MODES = {"lean", "full"}
FORMAL_BATTLE_INSTALLER = "install_pet_battle_bundle.py"


@dataclass(frozen=True)
class BundleSpec:
    kind: str
    root: Path
    metadata_path: Path
    identity_path: Path
    ownership_path: Path
    prompt_path: Path
    character_id: str = ""


def _issue(code: str, message: str, path: str = "") -> dict[str, str]:
    result = {"code": code, "message": message}
    if path:
        result["path"] = path
    return result


def _is_sha256(value: Any) -> bool:
    return isinstance(value, str) and SHA256_PATTERN.fullmatch(value) is not None


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _safe_bundle_relative_path(root: Path, value: Any) -> Path | None:
    if not isinstance(value, str) or not value.strip():
        return None
    raw = value.strip()
    pure = PurePosixPath(raw)
    if (
        raw.startswith(("/", "\\"))
        or raw.startswith("res://")
        or "\\" in raw
        or pure.is_absolute()
        or ".." in pure.parts
    ):
        return None
    resolved_root = root.resolve(strict=False)
    resolved = (root / Path(*pure.parts)).resolve(strict=False)
    try:
        resolved.relative_to(resolved_root)
    except ValueError:
        return None
    return resolved


def _repo_relative(path: Path, repo_root: Path) -> str:
    try:
        return path.relative_to(repo_root).as_posix()
    except ValueError:
        return str(path)


def _is_non_empty(value: Any) -> bool:
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, (dict, list)):
        return bool(value)
    return value is not None


def _load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _catalog_exact_keys(
    value: Any,
    expected: set[str],
    *,
    label: str,
    path: Path,
    errors: list[dict[str, str]],
) -> bool:
    if not isinstance(value, dict):
        errors.append(
            _issue(
                "invalid_fusion_catalog_contract",
                f"{label} 必须是对象",
                str(path),
            )
        )
        return False
    actual = set(value)
    if actual != expected:
        errors.append(
            _issue(
                "invalid_fusion_catalog_contract",
                f"{label} 必须且只能包含 {sorted(expected)}，实际 {sorted(actual)}",
                str(path),
            )
        )
        return False
    return True


def _catalog_identifier(value: Any) -> str:
    normalized = value.strip() if isinstance(value, str) else ""
    return normalized if IDENTIFIER_PATTERN.fullmatch(normalized) else ""


def _catalog_identifier_set(
    value: Any,
    *,
    label: str,
    path: Path,
    errors: list[dict[str, str]],
) -> list[str]:
    if not isinstance(value, list) or not value:
        errors.append(
            _issue(
                "invalid_fusion_catalog_contract",
                f"{label} 必须是非空数组",
                str(path),
            )
        )
        return []
    normalized: list[str] = []
    for index, entry in enumerate(value):
        item = entry.strip() if isinstance(entry, str) else ""
        if item != "*" and not IDENTIFIER_PATTERN.fullmatch(item):
            errors.append(
                _issue(
                    "invalid_fusion_catalog_contract",
                    f"{label}[{index}] 必须是稳定标识或 *",
                    str(path),
                )
            )
            continue
        if item in normalized:
            errors.append(
                _issue(
                    "invalid_fusion_catalog_contract",
                    f"{label} 重复登记 {item}",
                    str(path),
                )
            )
            continue
        normalized.append(item)
    if "*" in normalized and normalized != ["*"]:
        errors.append(
            _issue(
                "invalid_fusion_catalog_contract",
                f"{label} 使用 * 时不得混入其他值",
                str(path),
            )
        )
    return normalized


def _declared_fusion_target_form_ids(
    fusion_catalog_path: Path,
) -> tuple[dict[str, str], list[dict[str, str]]]:
    try:
        document = _load_json(fusion_catalog_path)
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        return {}, [_issue(
            "fusion_catalog_read_failed",
            f"无法读取共享融合配方目录：{error}",
            str(fusion_catalog_path),
        )]
    if not isinstance(document, dict):
        return {}, [_issue(
            "invalid_fusion_catalog",
            "共享融合配方目录必须是 JSON 对象",
            str(fusion_catalog_path),
        )]

    errors: list[dict[str, str]] = []
    def add(code: str, message: str) -> None:
        errors.append(_issue(code, message, str(fusion_catalog_path)))

    _catalog_exact_keys(
        document,
        FUSION_CATALOG_KEYS,
        label="catalog",
        path=fusion_catalog_path,
        errors=errors,
    )
    if (
        document.get("schemaVersion") != FUSION_CATALOG_SCHEMA_VERSION
        or document.get("catalogId") != FUSION_CATALOG_ID
    ):
        add(
            "invalid_fusion_catalog_identity",
            "共享融合配方目录必须为 "
            f"schemaVersion={FUSION_CATALOG_SCHEMA_VERSION} / "
            f"catalogId={FUSION_CATALOG_ID}",
        )
    if type(document.get("runtimeEnabled")) is not bool:
        add("invalid_fusion_runtime_enabled", "runtimeEnabled 必须是布尔值")
    if not isinstance(document.get("disabledMessage"), str) or not document["disabledMessage"].strip():
        add("invalid_fusion_catalog_contract", "disabledMessage 必须是非空字符串")

    rules = document.get("rules")
    if _catalog_exact_keys(
        rules,
        FUSION_RULE_KEYS,
        label="catalog.rules",
        path=fusion_catalog_path,
        errors=errors,
    ):
        assert isinstance(rules, dict)
        if rules.get("roleIds") != list(FUSION_ROLE_IDS):
            add("invalid_fusion_catalog_contract", "rules.roleIds 必须严格为三种材料角色")
        if rules.get("resultRideable") is not False:
            add("invalid_fusion_catalog_contract", "rules.resultRideable 必须为 false")
    if not isinstance(document.get("geneProfiles"), list):
        add("invalid_fusion_catalog_contract", "geneProfiles 必须是数组")
    recipes = document.get("recipes")
    if not isinstance(recipes, list):
        add("invalid_fusion_recipes", "recipes 必须是数组")
        recipes = []
    if document.get("runtimeEnabled") is True and not recipes:
        add("invalid_fusion_catalog_contract", "已启用目录必须至少有一条正式配方")

    targets: dict[str, str] = {}
    recipe_ids: set[str] = set()
    for index, recipe in enumerate(recipes):
        label = f"catalog.recipes[{index}]"
        before = len(errors)
        if not _catalog_exact_keys(
            recipe,
            FUSION_RECIPE_KEYS,
            label=label,
            path=fusion_catalog_path,
            errors=errors,
        ):
            continue
        assert isinstance(recipe, dict)
        identifiers = {
            key: _catalog_identifier(recipe.get(key))
            for key in ("recipeId", "targetFormId", "targetGrowthProfileId")
        }
        for key, value in identifiers.items():
            if not value:
                add("invalid_fusion_recipe", f"{label}.{key} 必须是稳定 snake_case 标识")

        role_rules = recipe.get("roleGeneRules")
        if _catalog_exact_keys(
            role_rules,
            set(FUSION_ROLE_IDS),
            label=f"{label}.roleGeneRules",
            path=fusion_catalog_path,
            errors=errors,
        ):
            assert isinstance(role_rules, dict)
            for role_id in FUSION_ROLE_IDS:
                role_rule = role_rules.get(role_id)
                if not _catalog_exact_keys(
                    role_rule,
                    FUSION_ROLE_RULE_KEYS,
                    label=f"{label}.roleGeneRules.{role_id}",
                    path=fusion_catalog_path,
                    errors=errors,
                ):
                    continue
                assert isinstance(role_rule, dict)
                lineage_ids = _catalog_identifier_set(
                    role_rule.get("allowedLineageIds"),
                    label=f"{label}.roleGeneRules.{role_id}.allowedLineageIds",
                    path=fusion_catalog_path,
                    errors=errors,
                )
                gene_ids = _catalog_identifier_set(
                    role_rule.get("allowedGeneProfileIds"),
                    label=f"{label}.roleGeneRules.{role_id}.allowedGeneProfileIds",
                    path=fusion_catalog_path,
                    errors=errors,
                )
                lineage_wildcard = lineage_ids == ["*"]
                gene_wildcard = gene_ids == ["*"]
                if (lineage_wildcard or gene_wildcard) and role_id != "resonance_two":
                    add("invalid_fusion_recipe", f"{label}.{role_id} 不能使用通配符")
                if lineage_wildcard != gene_wildcard:
                    add("invalid_fusion_recipe", f"{label}.{role_id} 谱系/基因通配必须成对")

        result = recipe.get("result")
        if not _catalog_exact_keys(
            result,
            set(FUSION_RESULT),
            label=f"{label}.result",
            path=fusion_catalog_path,
            errors=errors,
        ) or result != FUSION_RESULT:
            add("invalid_fusion_recipe", f"{label}.result 不符合不可骑融合终局合同")

        asset_gate = recipe.get("assetGate")
        replacement_path = ""
        if _catalog_exact_keys(
            asset_gate,
            FUSION_ASSET_GATE_KEYS,
            label=f"{label}.assetGate",
            path=fusion_catalog_path,
            errors=errors,
        ):
            assert isinstance(asset_gate, dict)
            replacement_path = asset_gate.get("replacementPath", "")
            replacement_path = replacement_path.strip() if isinstance(replacement_path, str) else ""
            pure = PurePosixPath(replacement_path)
            if asset_gate.get("status") != "formal" or not replacement_path:
                add("invalid_fusion_recipe", f"{label}.assetGate 必须是 formal 且路径非空")
            elif (
                replacement_path.startswith(("/", "\\", "res://"))
                or pure.is_absolute()
                or ".." in pure.parts
            ):
                add("invalid_fusion_recipe", f"{label}.assetGate 路径不安全")

        recipe_id = identifiers["recipeId"]
        target_form_id = identifiers["targetFormId"]
        if recipe_id and recipe_id in recipe_ids:
            add("duplicate_fusion_recipe", f"重复 recipeId：{recipe_id}")
        if target_form_id and target_form_id in targets:
            add("duplicate_fusion_target", f"重复 targetFormId：{target_form_id}")
        if len(errors) == before:
            recipe_ids.add(recipe_id)
            targets[target_form_id] = replacement_path

    # The authority rejects an invalid document as a unit; never authorize the
    # valid-looking subset of a malformed v2 catalog.
    return ({}, errors) if errors else (targets, [])


def _validate_repo_relative_path(
    value: Any,
    *,
    label: str,
    repo_root: Path,
    form_result: dict[str, Any],
) -> Path | None:
    if not isinstance(value, str) or not value.strip():
        _add_schema_error(form_result, "invalid_repo_path", f"{label} 必须是非空 repo-relative 路径")
        return None
    raw = value.strip()
    pure = PurePosixPath(raw)
    if raw.startswith(("/", "\\")) or raw.startswith("res://") or pure.is_absolute() or ".." in pure.parts:
        _add_schema_error(form_result, "invalid_repo_path", f"{label} 不是安全的 repo-relative 路径：{raw}", raw)
        return None
    resolved = (repo_root / Path(*pure.parts)).resolve(strict=False)
    try:
        resolved.relative_to(repo_root)
    except ValueError:
        _add_schema_error(form_result, "invalid_repo_path", f"{label} 越出仓库根目录：{raw}", raw)
        return None
    return resolved


def _add_schema_error(
    form_result: dict[str, Any],
    code: str,
    message: str,
    path: str = "",
) -> None:
    form_result["errors"].append(_issue(code, message, path))


def _add_asset_issue(
    form_result: dict[str, Any],
    bundle_result: dict[str, Any],
    code: str,
    message: str,
    path: str = "",
) -> None:
    key = "errors" if bool(form_result.get("runtimeEnabled", False)) else "pending"
    entry = _issue(code, message, path)
    form_result[key].append(entry)
    bundle_result[key].append(entry.copy())


def _add_warning(
    form_result: dict[str, Any],
    bundle_result: dict[str, Any],
    code: str,
    message: str,
    path: str = "",
) -> None:
    entry = _issue(code, message, path)
    form_result["warnings"].append(entry)
    bundle_result["warnings"].append(entry.copy())


def _new_form_result(value: Any, index: int) -> dict[str, Any]:
    form = value if isinstance(value, dict) else {}
    return {
        "index": index,
        "formId": str(form.get("formId", "")).strip(),
        "displayName": str(form.get("displayName", "")).strip(),
        "lineId": str(form.get("lineId", "")).strip(),
        "subtypeId": str(form.get("subtypeId", "")).strip(),
        "productionGroup": str(form.get("productionGroup", "")).strip(),
        "artSkeletonId": str(form.get("artSkeletonId", "")).strip(),
        "status": str(form.get("status", "")).strip(),
        "runtimeEnabled": bool(form.get("runtimeEnabled", False)) if isinstance(form.get("runtimeEnabled"), bool) else False,
        "rideableTarget": bool(form.get("rideableTarget", False)) if isinstance(form.get("rideableTarget"), bool) else False,
        "supportedCharacterIds": form.get("supportedCharacterIds", []),
        "result": "unchecked",
        "pet": {},
        "mounted": {},
        "errors": [],
        "pending": [],
        "warnings": [],
    }


def _validate_form_schema(
    form_value: Any,
    form_result: dict[str, Any],
    *,
    default_character_id: str,
    fusion_target_roots: dict[str, str],
    repo_root: Path,
) -> tuple[BundleSpec | None, BundleSpec | None]:
    if not isinstance(form_value, dict):
        _add_schema_error(form_result, "invalid_form", "forms[] 项必须是对象")
        return None, None
    form = form_value
    for field in REQUIRED_FORM_FIELDS:
        if field not in form:
            _add_schema_error(form_result, "missing_form_field", f"缺少 form 字段：{field}")

    for field in ("formId", "displayName", "lineId", "subtypeId", "productionGroup", "artSkeletonId"):
        if not isinstance(form.get(field), str) or not form.get(field, "").strip():
            _add_schema_error(form_result, "invalid_form_field", f"{field} 必须是非空字符串")
    if form.get("status") not in ALLOWED_STATUSES:
        _add_schema_error(form_result, "invalid_form_status", f"status 无效：{form.get('status')!r}")
    if not isinstance(form.get("runtimeEnabled"), bool):
        _add_schema_error(form_result, "invalid_runtime_enabled", "runtimeEnabled 必须是布尔值")
    if not isinstance(form.get("rideableTarget"), bool):
        _add_schema_error(form_result, "invalid_rideable_target", "rideableTarget 必须是布尔值")
    if not _is_non_empty(form.get("identityBrief")):
        _add_schema_error(form_result, "invalid_identity_brief", "identityBrief 不能为空")
    supported = form.get("supportedCharacterIds")
    if not isinstance(supported, list) or any(not isinstance(value, str) or not value.strip() for value in supported):
        _add_schema_error(form_result, "invalid_supported_characters", "supportedCharacterIds 必须是非空字符串数组")
        supported = []
    elif len(set(supported)) != len(supported):
        _add_schema_error(form_result, "duplicate_supported_character", "supportedCharacterIds 不能重复")
    rideable_target = (
        form["rideableTarget"]
        if isinstance(form.get("rideableTarget"), bool)
        else True
    )
    if rideable_target and not supported:
        _add_schema_error(form_result, "missing_supported_character", "可骑目标至少需要一个 supportedCharacterIds")
    if rideable_target and default_character_id not in supported:
        _add_schema_error(
            form_result,
            "missing_default_character",
            f"可骑目标必须支持默认人物：{default_character_id}",
        )
    if not rideable_target and supported:
        _add_schema_error(
            form_result,
            "nonrideable_supported_character",
            "不可骑目标的 supportedCharacterIds 必须为空",
        )
    if not rideable_target and "mounted" in form:
        _add_schema_error(
            form_result,
            "nonrideable_mounted_bundle",
            "不可骑目标不能登记 mounted 资产包",
        )
    form_id = str(form.get("formId", "")).strip()
    if not rideable_target and form_id not in fusion_target_roots:
        _add_schema_error(
            form_result,
            "nonrideable_not_fusion_target",
            "不可骑目标必须匹配共享融合配方明确登记的 targetFormId",
        )
    if form.get("status") == "planned" and form.get("runtimeEnabled") is True:
        _add_schema_error(form_result, "planned_runtime_enabled", "planned form 不能直接 runtimeEnabled=true")
    if form.get("status") == "approved" and form.get("runtimeEnabled") is not True:
        _add_schema_error(form_result, "approved_runtime_disabled", "approved form 必须 runtimeEnabled=true")

    specs: list[BundleSpec | None] = []
    bundle_kinds = ("pet", "mounted") if rideable_target else ("pet",)
    for kind in bundle_kinds:
        bundle = form.get(kind)
        if not isinstance(bundle, dict):
            _add_schema_error(form_result, "invalid_bundle", f"{kind} 必须是对象")
            specs.append(None)
            continue
        for field in REQUIRED_BUNDLE_FIELDS:
            if field not in bundle:
                _add_schema_error(form_result, "missing_bundle_field", f"{kind} 缺少字段：{field}")
        paths: dict[str, Path | None] = {}
        for field in REQUIRED_BUNDLE_FIELDS:
            paths[field] = _validate_repo_relative_path(
                bundle.get(field),
                label=f"{kind}.{field}",
                repo_root=repo_root,
                form_result=form_result,
            )
        if any(path is None for path in paths.values()):
            specs.append(None)
            continue
        root = paths["root"]
        assert root is not None
        if (
            kind == "pet"
            and not rideable_target
            and form_id in fusion_target_roots
            and _repo_relative(root, repo_root) != fusion_target_roots[form_id]
        ):
            _add_schema_error(
                form_result,
                "fusion_asset_root_mismatch",
                "不可骑融合目标 pet.root 必须与正式配方 "
                "assetGate.replacementPath 完全一致",
                _repo_relative(root, repo_root),
            )
        for field in ("metadataPath", "identityPath", "ownershipPath", "promptPath"):
            path = paths[field]
            assert path is not None
            try:
                path.relative_to(root)
            except ValueError:
                _add_schema_error(
                    form_result,
                    "bundle_path_outside_root",
                    f"{kind}.{field} 必须位于 {kind}.root 内",
                    _repo_relative(path, repo_root),
                )
        specs.append(
            BundleSpec(
                kind=kind,
                root=root,
                metadata_path=paths["metadataPath"],  # type: ignore[arg-type]
                identity_path=paths["identityPath"],  # type: ignore[arg-type]
                ownership_path=paths["ownershipPath"],  # type: ignore[arg-type]
                prompt_path=paths["promptPath"],  # type: ignore[arg-type]
                character_id=default_character_id if kind == "mounted" else "",
            )
        )
    return specs[0], specs[1] if len(specs) > 1 else None


def _bundle_result(spec: BundleSpec, repo_root: Path) -> dict[str, Any]:
    return {
        "kind": spec.kind,
        "characterId": spec.character_id,
        "root": _repo_relative(spec.root, repo_root),
        "metadataPath": _repo_relative(spec.metadata_path, repo_root),
        "identityPath": _repo_relative(spec.identity_path, repo_root),
        "ownershipPath": _repo_relative(spec.ownership_path, repo_root),
        "promptPath": _repo_relative(spec.prompt_path, repo_root),
        "expectedPngCount": 0,
        "validatedPngCount": 0,
        "orphanPngs": [],
        "world": {"directions": {}, "idleUniqueCount": 0, "mirrorPairs": []},
        "battle": {"views": {}, "actions": {}},
        "evolution": {"expected": 0, "validated": 0, "view": "", "runtimeRoot": ""},
        "errors": [],
        "pending": [],
        "warnings": [],
    }


def _read_metadata(
    spec: BundleSpec,
    form_result: dict[str, Any],
    bundle_result: dict[str, Any],
    repo_root: Path,
) -> dict[str, Any] | None:
    rel = _repo_relative(spec.metadata_path, repo_root)
    if not spec.metadata_path.is_file():
        _add_asset_issue(form_result, bundle_result, "missing_metadata", "缺少动作 metadata", rel)
        return None
    try:
        value = _load_json(spec.metadata_path)
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        _add_asset_issue(form_result, bundle_result, "invalid_metadata", f"动作 metadata 无法解析：{error}", rel)
        return None
    if not isinstance(value, dict):
        _add_asset_issue(form_result, bundle_result, "invalid_metadata", "动作 metadata 必须是 JSON 对象", rel)
        return None
    return value


def _check_reference_files(
    spec: BundleSpec,
    form_result: dict[str, Any],
    bundle_result: dict[str, Any],
    repo_root: Path,
) -> None:
    for label, path in (
        ("identity lock", spec.identity_path),
        ("ownership", spec.ownership_path),
        ("prompt", spec.prompt_path),
    ):
        if not path.is_file():
            _add_asset_issue(
                form_result,
                bundle_result,
                "missing_reference",
                f"缺少 {label} 证据",
                _repo_relative(path, repo_root),
            )


class IdentityGateAuditError(RuntimeError):
    def __init__(self, code: str, message: str, path: Path | None = None):
        super().__init__(message)
        self.code = code
        self.path = path


def _identity_gate_claimed(
    spec: BundleSpec,
    metadata: dict[str, Any],
) -> bool:
    if spec.kind != "pet":
        return False
    evidence = metadata.get("evidence")
    gate = evidence.get("identityGateAudit") if isinstance(evidence, dict) else None
    if (
        metadata.get("productionScope") == "identity_key_pose_gate"
        or isinstance(gate, dict)
    ):
        return True
    source_meta_path = spec.root / "source/identity-board-source-meta.json"
    if not source_meta_path.is_file():
        return False
    try:
        value = _load_json(source_meta_path)
    except (OSError, UnicodeError, json.JSONDecodeError):
        return False
    return isinstance(value, dict) and value.get("schemaVersion") == 2


def _identity_load_json(path: Path, label: str) -> dict[str, Any]:
    try:
        value = _load_json(path)
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise IdentityGateAuditError(
            "invalid_identity_gate_json",
            f"{label} 无法解析：{error}",
            path,
        ) from error
    if not isinstance(value, dict):
        raise IdentityGateAuditError(
            "invalid_identity_gate_json",
            f"{label} 必须是 JSON 对象",
            path,
        )
    return value


def _accept_frozen_legacy_replay_digest(
    *,
    form_id: str,
    spec: BundleSpec,
    metadata: dict[str, Any],
    pipeline_audit: dict[str, Any],
    repo_root: Path,
) -> bool:
    """Validate one historical path-bound digest through its frozen manifest."""

    legacy_pair = CLOSED_REGISTRATION_LEGACY_PATH_BOUND_REPLAY_SHA256.get(
        form_id
    )
    if legacy_pair is None:
        return False
    evidence = metadata.get("evidence")
    gate = evidence.get("identityGateAudit") if isinstance(evidence, dict) else None
    stored_pipeline = (
        gate.get("pipelineMetadata") if isinstance(gate, dict) else None
    )
    if not isinstance(stored_pipeline, dict):
        return False
    legacy_source_sha, legacy_candidate_sha = legacy_pair
    if (
        stored_pipeline.get("metadataReplaySha256")
        != legacy_candidate_sha
        or "metadataReplayDigestContractVersion" in stored_pipeline
    ):
        return False

    manifest_path = (
        spec.root / "qa/release/closed-registration-manifest-v1.json"
    )
    if manifest_path.is_symlink() or not manifest_path.is_file():
        raise IdentityGateAuditError(
            "invalid_identity_gate_legacy_replay",
            "历史绝对路径回放摘要缺少冻结关闭登记清单",
            manifest_path,
        )
    manifest = _identity_load_json(manifest_path, "融合宠关闭登记清单")
    action_sha = identity_gate.sha256_file(spec.metadata_path)
    action_size = spec.metadata_path.stat().st_size
    pipeline_sha = pipeline_audit.get("sha256")
    expected_destination = spec.root.relative_to(repo_root).as_posix()
    expected_pipeline_path = (
        spec.root / "source/identity-board-pipeline-meta.json"
    ).relative_to(repo_root).as_posix()
    if (
        manifest.get("schemaVersion") != 1
        or manifest.get("manifestType")
        != "fusion_pet_closed_asset_copy_registration"
        or manifest.get("tool") != "register_fusion_pet_closed_assets.py"
        or manifest.get("formId") != form_id
        or manifest.get("destinationRoot") != expected_destination
    ):
        raise IdentityGateAuditError(
            "invalid_identity_gate_legacy_replay",
            "历史回放摘要的冻结关闭登记身份不匹配",
            manifest_path,
        )

    copied_files = manifest.get("copiedFiles")
    action_records = (
        [
            item
            for item in copied_files
            if isinstance(item, dict)
            and item.get("path") == "action-bundle-meta.json"
        ]
        if isinstance(copied_files, list)
        else []
    )
    integrity_updates = manifest.get("engineeringIntegrityUpdates")
    action_updates = (
        [
            item
            for item in integrity_updates
            if isinstance(item, dict)
            and item.get("path") == "action-bundle-meta.json"
        ]
        if isinstance(integrity_updates, list)
        else []
    )
    if len(action_records) != 1 or len(action_updates) != 1:
        raise IdentityGateAuditError(
            "invalid_identity_gate_legacy_replay",
            "历史回放摘要未被唯一 action 登记记录绑定",
            manifest_path,
        )
    if action_records[0] != {
        "path": "action-bundle-meta.json",
        "sha256": action_sha,
        "size": action_size,
    }:
        raise IdentityGateAuditError(
            "invalid_identity_gate_legacy_replay",
            "历史回放摘要的 action 文件登记已漂移",
            manifest_path,
        )

    action_update = action_updates[0]
    field_updates = action_update.get("fieldUpdates")
    replay_updates = (
        [
            item
            for item in field_updates
            if isinstance(item, dict)
            and item.get("field")
            == (
                "evidence.identityGateAudit.pipelineMetadata."
                "metadataReplaySha256"
            )
        ]
        if isinstance(field_updates, list)
        else []
    )
    if (
        len(replay_updates) != 1
        or replay_updates[0]
        != {
            "field": (
                "evidence.identityGateAudit.pipelineMetadata."
                "metadataReplaySha256"
            ),
            "digestKind": "pipeline_metadata_replay_sha256",
            "from": legacy_source_sha,
            "to": legacy_candidate_sha,
        }
        or action_update.get("candidateMetadataSha256") != action_sha
        or action_update.get("candidateMetadataSize") != action_size
        or action_update.get("boundFile")
        != {
            "path": expected_pipeline_path,
            "sha256": pipeline_sha,
        }
    ):
        raise IdentityGateAuditError(
            "invalid_identity_gate_legacy_replay",
            "历史回放摘要与冻结 action 变换证明不一致",
            manifest_path,
        )
    return True


def _first_json_subset_mismatch(
    actual: Any,
    expected: Any,
    path: str = "$",
) -> str | None:
    """Return the first immutable-subcontract mismatch, allowing dict additions."""

    if isinstance(expected, dict):
        if not isinstance(actual, dict):
            return f"{path} 必须是对象"
        for key, expected_child in expected.items():
            child_path = f"{path}.{key}"
            if key not in actual:
                return f"{child_path} 缺失"
            mismatch = _first_json_subset_mismatch(
                actual[key],
                expected_child,
                child_path,
            )
            if mismatch is not None:
                return mismatch
        return None
    if isinstance(expected, list):
        if not isinstance(actual, list):
            return f"{path} 必须是数组"
        if len(actual) != len(expected):
            return f"{path} 长度必须为 {len(expected)}，实际 {len(actual)}"
        for index, (actual_child, expected_child) in enumerate(
            zip(actual, expected, strict=True)
        ):
            mismatch = _first_json_subset_mismatch(
                actual_child,
                expected_child,
                f"{path}[{index}]",
            )
            if mismatch is not None:
                return mismatch
        return None
    if type(actual) is not type(expected) or actual != expected:
        return f"{path} 与冻结 identity 子合同不一致"
    return None


def _first_pending_lifecycle_violation(
    value: Any,
    path: str = "$",
) -> str | None:
    """Reject owner/release/runtime promotion hidden in extensible metadata."""

    if isinstance(value, dict):
        for key, child in value.items():
            normalized_key = re.sub(
                r"[^a-z0-9]",
                "",
                str(key).casefold(),
            )
            child_path = f"{path}.{key}"
            if normalized_key.endswith("runtimeenabled") and child is not False:
                return f"{child_path} 必须保持 false"
            if (
                (
                    normalized_key.endswith("approved")
                    or normalized_key.endswith("approvalgranted")
                    or normalized_key.endswith("releaseenabled")
                )
                and child is not False
            ):
                return f"{child_path} 必须保持 false"
            if (
                ("approv" in normalized_key or "release" in normalized_key)
                and child is True
            ):
                return f"{child_path} 不得声明批准或发布"
            if (
                "releaseattestation" in normalized_key
                and child not in (None, False, "", [], {})
            ):
                return f"{child_path} 不得提前写入发布证明"
            if isinstance(child, str):
                normalized_value = re.sub(
                    r"[^a-z0-9]",
                    "",
                    child.casefold(),
                )
                state_key = (
                    normalized_key.endswith("status")
                    or normalized_key.endswith("scope")
                    or normalized_key.endswith("state")
                    or normalized_key.endswith("gate")
                )
                negated_approval = (
                    "notapproved" in normalized_value
                    or "unapproved" in normalized_value
                )
                if state_key and (
                    (
                        "approved" in normalized_value
                        and not negated_approval
                    )
                    or "released" in normalized_value
                    or "runtimeenabled" in normalized_value
                    or normalized_value == "enabled"
                ):
                    return f"{child_path} 不得越过 owner/runtime 发布门禁"
                if (
                    "owner" in normalized_key
                    and normalized_value in {
                        "approved",
                        "ownerapproved",
                        "passed",
                        "true",
                    }
                ):
                    return f"{child_path} 不得冒充 owner 批准"
            violation = _first_pending_lifecycle_violation(
                child,
                child_path,
            )
            if violation is not None:
                return violation
        return None
    if isinstance(value, list):
        for index, child in enumerate(value):
            violation = _first_pending_lifecycle_violation(
                child,
                f"{path}[{index}]",
            )
            if violation is not None:
                return violation
    return None


def _audit_identity_gate_chain(
    spec: BundleSpec,
    *,
    form: dict[str, Any],
    metadata: dict[str, Any],
    repo_root: Path,
) -> None:
    form_id = str(form.get("formId", "")).strip()
    root = spec.root.resolve()
    raw_path = root / "source/identity-board-raw.png"
    archive_path = root / "source/identity-board-raw.webp"
    source_meta_path = root / "source/identity-board-source-meta.json"
    pipeline_path = root / "source/identity-board-pipeline-meta.json"
    qc_path = root / "qa/identity-key-pose-qc.json"
    board_path = root / "identity/identity-board-transparent.png"
    pose_paths = {
        pose: root / f"identity/{pose}.png"
        for pose in identity_gate.IDENTITY_POSES
    }
    required_paths = (
        raw_path,
        archive_path,
        source_meta_path,
        pipeline_path,
        qc_path,
        board_path,
        *pose_paths.values(),
    )
    for path in required_paths:
        if path.is_symlink() or not path.is_file():
            raise IdentityGateAuditError(
                "missing_identity_gate_chain_file",
                "schema-2 身份门证据链缺少普通文件",
                path,
            )

    previous_root = identity_gate.REPO_ROOT
    identity_gate.REPO_ROOT = repo_root.resolve()
    try:
        raw_audit = identity_gate.inspect_raw_source_png(raw_path)
        board_audit = identity_gate.inspect_transparent_png(
            board_path,
            identity_gate.IDENTITY_BOARD_SIZE,
            "transparent identity board",
        )
        board_audit["path"] = board_path.relative_to(root).as_posix()
        pose_audits: dict[str, dict[str, Any]] = {}
        for pose, path in pose_paths.items():
            audit = identity_gate.inspect_transparent_png(
                path,
                identity_gate.IDENTITY_POSE_SIZE,
                f"identity pose {pose}",
                safe_margin=identity_gate.MIN_SOURCE_SAFE_MARGIN,
            )
            audit["path"] = path.relative_to(root).as_posix()
            pose_audits[pose] = audit
        if len({
            pose_audits[pose]["canonicalRgbaSha256"]
            for pose in identity_gate.IDENTITY_POSES
        }) != len(identity_gate.IDENTITY_POSES):
            raise identity_gate.FinalizeError(
                "identity poses must have unique decoded RGBA content"
            )
        identity_gate.inspect_identity_board_composition(board_path, pose_paths)
        qc_audit = identity_gate.inspect_self_review_evidence(
            qc_path,
            form_id,
            root,
            board_audit,
            pose_audits,
        )
        with tempfile.TemporaryDirectory(
            prefix="beastbound-identity-audit-"
        ) as directory:
            pipeline_audit = identity_gate.inspect_pipeline_replay(
                pipeline_path,
                root,
                raw_path,
                board_path,
                pose_paths,
                Path(directory),
            )
        pipeline_audit["path"] = pipeline_path.relative_to(root).as_posix()
        if _accept_frozen_legacy_replay_digest(
            form_id=form_id,
            spec=spec,
            metadata=metadata,
            pipeline_audit=pipeline_audit,
            repo_root=repo_root,
        ):
            pipeline_audit.pop(
                "metadataReplayDigestContractVersion",
                None,
            )
            pipeline_audit["metadataReplaySha256"] = (
                metadata["evidence"]["identityGateAudit"][
                    "pipelineMetadata"
                ]["metadataReplaySha256"]
            )

        archive_decoded = identity_gate.decoded_rgba_sha256(archive_path)
        archive_canonical = identity_gate.canonical_rgba_sha256(archive_path)
        if (
            archive_decoded != raw_audit["decodedRgbaPixelSha256"]
            or archive_canonical != raw_audit["canonicalRgbaSha256"]
        ):
            raise identity_gate.FinalizeError(
                "lossless WebP archive does not preserve raw RGBA pixels"
            )
        source_meta = _identity_load_json(
            source_meta_path,
            "身份门来源账本",
        )
        expected_source_meta = {
            "schemaVersion": 2,
            "asset": f"{form_id}_identity_board",
            "generatorRecord": spec.ownership_path.relative_to(root).as_posix(),
            "originalGeneratedFilename": raw_path.name,
            "originalPngSize": raw_audit["pixelSize"],
            "originalPngSha256": raw_audit["fileSha256"],
            "decodedRgbaPixelSha256": raw_audit["decodedRgbaPixelSha256"],
            "canonicalRgbaSha256": raw_audit["canonicalRgbaSha256"],
            "archive": {
                "path": archive_path.relative_to(root).as_posix(),
                "format": "webp",
                "lossless": True,
                "sha256": identity_gate.sha256_file(archive_path),
                "decodedRgbaPixelSha256": archive_decoded,
                "canonicalRgbaSha256": archive_canonical,
            },
            "prompt": spec.prompt_path.relative_to(root).as_posix(),
            "promptSha256": identity_gate.sha256_file(spec.prompt_path),
            "identityLock": spec.identity_path.relative_to(root).as_posix(),
            "identityLockSha256": identity_gate.sha256_file(spec.identity_path),
            "ownership": spec.ownership_path.relative_to(root).as_posix(),
            "ownershipSha256": identity_gate.sha256_file(spec.ownership_path),
            "pipelineMetadata": pipeline_path.relative_to(root).as_posix(),
            "pipelineMetadataSha256": identity_gate.sha256_file(pipeline_path),
            "selfReview": qc_audit,
            "outputs": {
                "transparentBoard": board_path.relative_to(root).as_posix(),
                "transparentBoardSha256": board_audit["fileSha256"],
                "transparentBoardAudit": board_audit,
                "poses": pose_audits,
            },
        }
        if source_meta != expected_source_meta:
            raise IdentityGateAuditError(
                "invalid_identity_gate_source_meta",
                "schema-2 身份门来源账本与当前来源/流水线/QC/图像哈希链不一致",
                source_meta_path,
            )

        expected_metadata = {
            "schemaVersion": 1,
            "formId": form_id,
            "displayName": form.get("displayName"),
            "artStatus": "in_production",
            "productionScope": "identity_key_pose_gate",
            "runtimeEnabled": False,
            "rideableTarget": form.get("rideableTarget"),
            "runtimeFrameSize": [
                identity_gate.RUNTIME_FRAME_SIZE,
                identity_gate.RUNTIME_FRAME_SIZE,
            ],
            "views": list(BATTLE_VIEWS),
            "identity": {
                "status": "self_review_passed_owner_pending",
                "sourceFrameSize": list(identity_gate.IDENTITY_POSE_SIZE),
                "board": board_path.relative_to(root).as_posix(),
                "poses": {
                    pose: path.relative_to(root).as_posix()
                    for pose, path in pose_paths.items()
                },
            },
            "actions": identity_gate.action_metadata(),
            "worldVisual": {
                "status": "not_produced",
                "strategy": "independent_8",
                "runtimeMirroring": False,
                "directions": list(CANONICAL_DIRECTIONS),
                "actions": {
                    "idle": {
                        "frameCount": 1,
                        "fps": 4,
                        "loop": True,
                        "status": "not_produced",
                    },
                    "walk": {
                        "frameCount": 4,
                        "fps": 10,
                        "loop": True,
                        "status": "not_produced",
                    },
                },
            },
            "supportedMountedCharacterIds": form.get(
                "supportedCharacterIds",
                [],
            ),
            "sourceArchive": {
                "policy": "tracked_lossless_webp_with_original_sha256",
                "raw": archive_path.relative_to(root).as_posix(),
                "sourceMetadata": source_meta_path.relative_to(root).as_posix(),
                "pipelineMetadata": pipeline_path.relative_to(root).as_posix(),
                "prompt": spec.prompt_path.relative_to(root).as_posix(),
            },
            "evidence": {
                "identityBoard": board_path.relative_to(root).as_posix(),
                "identityBoardSha256": board_audit["fileSha256"],
                "identityGateAudit": {
                    "schemaVersion": 1,
                    "status": "self_review_passed_owner_review_pending",
                    "pipelineMetadata": pipeline_audit,
                    "selfReview": qc_audit,
                    "transparentBoard": board_audit,
                    "poses": pose_audits,
                },
            },
            "keyPoseReviewStatus": "owner_review_pending",
            "ownerReviewStatus": "pending",
            "notes": (
                "Identity and four key poses only. World and battle animation "
                "matrices are intentionally not produced in this gate."
            ),
        }
        expected_identity_contract = {
            key: expected_metadata[key]
            for key in (
                "schemaVersion",
                "formId",
                "displayName",
                "artStatus",
                "runtimeEnabled",
                "rideableTarget",
                "runtimeFrameSize",
                "views",
                "identity",
                "supportedMountedCharacterIds",
                "sourceArchive",
                "evidence",
                "keyPoseReviewStatus",
                "ownerReviewStatus",
            )
        }
        mismatch = _first_json_subset_mismatch(
            metadata,
            expected_identity_contract,
        )
        lifecycle_violation = _first_pending_lifecycle_violation(metadata)
        production_scope = metadata.get("productionScope")
        scope_normalized = (
            re.sub(
                r"[^a-z0-9]",
                "",
                production_scope.casefold(),
            )
            if isinstance(production_scope, str)
            else ""
        )
        advanced_scope_invalid = (
            production_scope != "identity_key_pose_gate"
            and not (
                "ownerreviewpending" in scope_normalized
                or "ownerpending" in scope_normalized
            )
        )
        initial_snapshot_drift = (
            production_scope == "identity_key_pose_gate"
            and metadata != expected_metadata
        )
        if (
            mismatch is not None
            or lifecycle_violation is not None
            or advanced_scope_invalid
            or initial_snapshot_drift
        ):
            detail = (
                mismatch
                or lifecycle_violation
                or (
                    "$.productionScope 必须是 identity_key_pose_gate，"
                    "或明确保持 owner pending 的后续生产范围"
                    if advanced_scope_invalid
                    else "identity-only 初始快照发生漂移"
                )
            )
            raise IdentityGateAuditError(
                "invalid_identity_gate_action_meta",
                (
                    "身份门动作元数据破坏重算后的 schema-2 identity "
                    f"子合同：{detail}"
                ),
                spec.metadata_path,
            )
    except IdentityGateAuditError:
        raise
    except (identity_gate.FinalizeError, OSError, ValueError) as error:
        raise IdentityGateAuditError(
            "invalid_identity_gate_chain",
            str(error),
            root,
        ) from error
    finally:
        identity_gate.REPO_ROOT = previous_root


def _add_identity_gate_error(
    form_result: dict[str, Any],
    bundle_result: dict[str, Any],
    error: IdentityGateAuditError,
    repo_root: Path,
) -> None:
    entry = _issue(
        error.code,
        str(error),
        _repo_relative(error.path, repo_root) if error.path is not None else "",
    )
    # A bundle declaring a passed schema-2 identity gate makes an integrity
    # claim, so drift blocks even while the runtime form remains disabled.
    form_result["errors"].append(entry)
    bundle_result["errors"].append(entry.copy())


def _possible_magenta_fringe_pixels(image: Image.Image) -> int:
    # Deliberately strict to avoid flagging legitimate red/purple creature art.
    # This catches visible remnants close to the pipeline's #ff00ff chroma key.
    pixels: Iterable[tuple[int, int, int, int]]
    if hasattr(image, "get_flattened_data"):
        pixels = image.get_flattened_data()  # type: ignore[assignment]
    else:  # Pillow < 12 compatibility.
        pixels = image.getdata()  # type: ignore[assignment]
    count = 0
    for red, green, blue, alpha in pixels:
        if (
            alpha >= ALPHA_THRESHOLD
            and red >= 220
            and blue >= 220
            and green <= 60
            and abs(red - blue) <= 35
        ):
            count += 1
    return count


def _support_center_x(
    rgba: Image.Image,
    bbox: tuple[int, int, int, int],
) -> float:
    """Measure the planted support center without following tails or horns.

    The historical full alpha-bounds center is useful diagnostic evidence but
    is not a reliable release anchor for a walk cycle: an independently drawn
    tail, horn, or reaching leg can move either horizontal extreme while the
    torso and feet remain planted.  Runtime world frames are fixed at 256 px,
    so the bottom 18 px of the visible subject is a stable support band.  A
    whole-frame horizontal slide still moves this weighted center exactly.
    """

    alpha = rgba.getchannel("A")
    left, top, right, bottom = bbox
    support_top = max(top, bottom - SUPPORT_BAND_HEIGHT_PX)
    pixels = alpha.load()
    weight = 0
    weighted_x = 0.0
    for y in range(support_top, bottom):
        for x in range(left, right):
            alpha_value = int(pixels[x, y])
            if alpha_value < ALPHA_THRESHOLD:
                continue
            weight += alpha_value
            weighted_x += (x + 0.5) * alpha_value
    if weight <= 0:
        return (left + right) / 2.0
    return weighted_x / weight


def _walk_motion_metrics(
    walk_metrics: list[dict[str, Any]],
) -> dict[str, Any]:
    bottoms = [int(entry["bottomExclusive"]) for entry in walk_metrics]
    bounds_centers = [float(entry["centerX"]) for entry in walk_metrics]
    support_centers = [
        float(entry["supportCenterX"]) for entry in walk_metrics
    ]
    heights = [int(entry["height"]) for entry in walk_metrics]
    consensus_drifts: list[float] = []
    for first in range(len(walk_metrics)):
        for second in range(first + 1, len(walk_metrics)):
            bounds_delta = bounds_centers[second] - bounds_centers[first]
            support_delta = support_centers[second] - support_centers[first]
            if bounds_delta * support_delta <= 0.0:
                consensus_drifts.append(0.0)
                continue
            consensus_drifts.append(
                min(abs(bounds_delta), abs(support_delta))
            )
    return {
        "baselineDriftPx": max(bottoms) - min(bottoms),
        # Preserve the historical diagnostic field for report consumers.  It
        # is intentionally no longer the release gate metric.
        "centerDriftPx": round(max(bounds_centers) - min(bounds_centers), 3),
        "supportCenterDriftPx": round(
            max(support_centers) - min(support_centers),
            3,
        ),
        "anchorConsensusDriftPx": round(
            max(consensus_drifts, default=0.0),
            3,
        ),
        "centerGateMetric": CENTER_GATE_METRIC,
        "supportBandHeightPx": SUPPORT_BAND_HEIGHT_PX,
        "alphaHeightRatio": round(max(heights) / max(1, min(heights)), 5),
    }


def _inspect_png(path: Path) -> tuple[dict[str, Any] | None, list[dict[str, str]]]:
    issues: list[dict[str, str]] = []
    try:
        with Image.open(path) as opened:
            source_format = opened.format
            source_mode = opened.mode
            opened.load()
            image = opened.copy()
    except (OSError, UnidentifiedImageError) as error:
        return None, [_issue("invalid_png", f"PNG 无法读取：{error}")]
    if source_format != "PNG":
        issues.append(_issue("invalid_png_format", f"文件格式不是 PNG：{source_format}"))
    if source_mode != "RGBA":
        issues.append(_issue("invalid_png_mode", f"PNG 必须为 RGBA，实际 {source_mode}"))
    rgba = image.convert("RGBA")
    if rgba.size != FRAME_SIZE:
        issues.append(_issue("invalid_png_size", f"运行帧必须为 256x256，实际 {rgba.size[0]}x{rgba.size[1]}"))
    bbox = rgba.getchannel("A").getbbox()
    if bbox is None:
        issues.append(_issue("empty_alpha", "PNG alpha 完全为空"))
        return {
            "sha256": hashlib.sha256(rgba.tobytes()).hexdigest(),
            "mirrorSha256": hashlib.sha256(ImageOps.mirror(rgba).tobytes()).hexdigest(),
            "alphaBbox": None,
            "magentaFringePixels": 0,
        }, issues
    if rgba.size == FRAME_SIZE and (
        bbox[0] < SAFE_EDGE_MARGIN
        or bbox[1] < SAFE_EDGE_MARGIN
        or bbox[2] > FRAME_SIZE[0] - SAFE_EDGE_MARGIN
        or bbox[3] > FRAME_SIZE[1] - SAFE_EDGE_MARGIN
    ):
        issues.append(_issue("unsafe_alpha_edge", f"可见像素触碰 {SAFE_EDGE_MARGIN}px 安全边：{list(bbox)}"))
    magenta_count = _possible_magenta_fringe_pixels(rgba)
    if magenta_count:
        issues.append(_issue("magenta_fringe", f"检测到 {magenta_count} 个疑似洋红残边像素"))
    edge_metrics = magenta_edge_metrics(rgba, ALPHA_THRESHOLD)
    strong_edge_count = int(edge_metrics["strongMagentaEdgePixels"])
    strong_edge_ratio = float(edge_metrics["strongMagentaEdgeRatio"])
    if (
        strong_edge_count > 0
        and strong_edge_ratio > MAX_STRONG_MAGENTA_EDGE_RATIO
    ):
        issues.append(
            _issue(
                "magenta_edge_contamination",
                "透明边缘强紫污染 "
                f"{strong_edge_count}/{edge_metrics['edgePixelCount']} "
                f"({strong_edge_ratio:.1%})，门槛 "
                f"{MAX_STRONG_MAGENTA_EDGE_RATIO:.0%}",
            )
        )
    return {
        "sha256": hashlib.sha256(rgba.tobytes()).hexdigest(),
        "mirrorSha256": hashlib.sha256(ImageOps.mirror(rgba).tobytes()).hexdigest(),
        "alphaBbox": list(bbox),
        "width": bbox[2] - bbox[0],
        "height": bbox[3] - bbox[1],
        "centerX": round((bbox[0] + bbox[2]) / 2.0, 3),
        "supportCenterX": round(_support_center_x(rgba, bbox), 3),
        "bottomExclusive": bbox[3],
        "magentaFringePixels": magenta_count,
        "transparentEdgePixels": edge_metrics["edgePixelCount"],
        "strongMagentaEdgePixels": strong_edge_count,
        "strongMagentaEdgeRatio": strong_edge_ratio,
    }, issues


def _validate_png(
    path: Path,
    *,
    form_result: dict[str, Any],
    bundle_result: dict[str, Any],
    repo_root: Path,
    cache: dict[Path, dict[str, Any] | None],
) -> dict[str, Any] | None:
    rel = _repo_relative(path, repo_root)
    if not path.is_file():
        _add_asset_issue(form_result, bundle_result, "missing_png", "缺少运行帧", rel)
        cache[path] = None
        return None
    if path in cache:
        return cache[path]
    metrics, issues = _inspect_png(path)
    for entry in issues:
        _add_asset_issue(form_result, bundle_result, entry["code"], entry["message"], rel)
    cache[path] = metrics
    if metrics is not None:
        bundle_result["validatedPngCount"] += 1
    return metrics


def _world_frame_path(spec: BundleSpec, direction: str, action: str, index: int) -> Path:
    return spec.root / "world" / "directions" / direction / action / f"{action}-{index}.png"


def _battle_frame_path(spec: BundleSpec, view: str, action: str, index: int) -> Path:
    return spec.root / "views" / view / action / f"{action}-{index}.png"


def _audit_world(
    spec: BundleSpec,
    *,
    form_result: dict[str, Any],
    bundle_result: dict[str, Any],
    repo_root: Path,
    cache: dict[Path, dict[str, Any] | None],
    expected_pngs: set[Path],
) -> None:
    idle_metrics: dict[str, dict[str, Any]] = {}
    for direction in CANONICAL_DIRECTIONS:
        direction_result: dict[str, Any] = {}
        walk_metrics: list[dict[str, Any]] = []
        for action, count in WORLD_ACTIONS.items():
            action_metrics: list[dict[str, Any]] = []
            for index in range(1, count + 1):
                path = _world_frame_path(spec, direction, action, index)
                expected_pngs.add(path)
                bundle_result["expectedPngCount"] += 1
                metrics = _validate_png(
                    path,
                    form_result=form_result,
                    bundle_result=bundle_result,
                    repo_root=repo_root,
                    cache=cache,
                )
                if metrics is not None:
                    action_metrics.append(metrics)
            direction_result[action] = {
                "expected": count,
                "validated": len(action_metrics),
                "unique": len({entry["sha256"] for entry in action_metrics}),
            }
            if action == "idle" and len(action_metrics) == 1:
                idle_metrics[direction] = action_metrics[0]
            if action == "walk":
                walk_metrics = action_metrics
        if len(walk_metrics) == WORLD_ACTIONS["walk"]:
            unique_walk = len({entry["sha256"] for entry in walk_metrics})
            if unique_walk != WORLD_ACTIONS["walk"]:
                _add_asset_issue(
                    form_result,
                    bundle_result,
                    "duplicate_walk_phase",
                    f"{direction} walk 四相不唯一：{unique_walk}/4",
                    _repo_relative(spec.root, repo_root),
                )
            bboxes = [entry.get("alphaBbox") for entry in walk_metrics]
            if all(bbox is not None for bbox in bboxes):
                motion = _walk_motion_metrics(walk_metrics)
                direction_result["motion"] = motion
                if motion["baselineDriftPx"] > MAX_BASELINE_DRIFT_PX:
                    _add_asset_issue(
                        form_result,
                        bundle_result,
                        "baseline_drift",
                        f"{direction} walk 脚底漂移 "
                        f"{motion['baselineDriftPx']}px，门槛 "
                        f"{MAX_BASELINE_DRIFT_PX}px",
                    )
                if motion["anchorConsensusDriftPx"] > MAX_CENTER_DRIFT_PX:
                    _add_asset_issue(
                        form_result,
                        bundle_result,
                        "center_drift",
                        f"{direction} walk 整体锚点同向漂移 "
                        f"{motion['anchorConsensusDriftPx']}px，门槛 "
                        f"{MAX_CENTER_DRIFT_PX}px（透明外接框 "
                        f"{motion['centerDriftPx']}px，底部支撑 "
                        f"{motion['supportCenterDriftPx']}px）",
                    )
                if motion["alphaHeightRatio"] > MAX_ALPHA_HEIGHT_RATIO:
                    _add_asset_issue(
                        form_result,
                        bundle_result,
                        "alpha_height_drift",
                        f"{direction} walk alpha 高度比 "
                        f"{motion['alphaHeightRatio']:.3f}，门槛 "
                        f"{MAX_ALPHA_HEIGHT_RATIO:.3f}",
                    )
        bundle_result["world"]["directions"][direction] = direction_result

    unique_idle = len({entry["sha256"] for entry in idle_metrics.values()})
    bundle_result["world"]["idleUniqueCount"] = unique_idle
    if len(idle_metrics) == len(CANONICAL_DIRECTIONS) and unique_idle != len(CANONICAL_DIRECTIONS):
        _add_asset_issue(
            form_result,
            bundle_result,
            "duplicate_world_direction",
            f"八方向 idle 不是 8 张唯一源图：{unique_idle}/8",
        )
    mirror_pairs: list[list[str]] = []
    directions = list(CANONICAL_DIRECTIONS)
    for first_index, first in enumerate(directions):
        first_metrics = idle_metrics.get(first)
        if first_metrics is None:
            continue
        for second in directions[first_index + 1 :]:
            second_metrics = idle_metrics.get(second)
            if second_metrics is None:
                continue
            if (
                first_metrics["sha256"] == second_metrics["mirrorSha256"]
                or first_metrics["mirrorSha256"] == second_metrics["sha256"]
            ):
                mirror_pairs.append([first, second])
                _add_asset_issue(
                    form_result,
                    bundle_result,
                    "mirrored_world_direction",
                    f"八方向存在水平镜像伪方向：{first}/{second}",
                )
    bundle_result["world"]["mirrorPairs"] = mirror_pairs


def _action_frame_counts(
    metadata: dict[str, Any],
    required_actions: list[str],
    *,
    form_result: dict[str, Any],
    bundle_result: dict[str, Any],
) -> dict[str, int]:
    actions = metadata.get("actions")
    if not isinstance(actions, dict):
        _add_asset_issue(form_result, bundle_result, "invalid_actions_metadata", "metadata.actions 必须是对象")
        return {}
    result: dict[str, int] = {}
    for action in required_actions:
        if action not in actions:
            _add_asset_issue(form_result, bundle_result, "missing_battle_action", f"metadata 缺少正式战斗动作：{action}")
    for action_value, action_meta in actions.items():
        action = str(action_value).strip()
        if not action or not isinstance(action_meta, dict):
            _add_asset_issue(form_result, bundle_result, "invalid_action_metadata", f"动作 metadata 无效：{action_value!r}")
            continue
        frame_count = action_meta.get("frameCount")
        if not isinstance(frame_count, int) or isinstance(frame_count, bool) or frame_count <= 0:
            _add_asset_issue(form_result, bundle_result, "invalid_action_frame_count", f"{action}.frameCount 必须为正整数")
            continue
        result[action] = frame_count
    return result


def _audit_battle(
    spec: BundleSpec,
    metadata: dict[str, Any],
    required_actions: list[str],
    *,
    form_result: dict[str, Any],
    bundle_result: dict[str, Any],
    repo_root: Path,
    cache: dict[Path, dict[str, Any] | None],
    expected_pngs: set[Path],
) -> None:
    metadata_views = metadata.get("views")
    if not isinstance(metadata_views, list) or metadata_views != list(BATTLE_VIEWS):
        _add_asset_issue(
            form_result,
            bundle_result,
            "invalid_battle_views",
            f"metadata.views 必须严格为 {list(BATTLE_VIEWS)}",
        )
    action_counts = _action_frame_counts(
        metadata,
        required_actions,
        form_result=form_result,
        bundle_result=bundle_result,
    )
    bundle_result["battle"]["actions"] = dict(sorted(action_counts.items()))
    for view in BATTLE_VIEWS:
        view_result = {"expected": 0, "validated": 0}
        for action, count in sorted(action_counts.items()):
            for index in range(1, count + 1):
                path = _battle_frame_path(spec, view, action, index)
                expected_pngs.add(path)
                bundle_result["expectedPngCount"] += 1
                view_result["expected"] += 1
                metrics = _validate_png(
                    path,
                    form_result=form_result,
                    bundle_result=bundle_result,
                    repo_root=repo_root,
                    cache=cache,
                )
                if metrics is not None:
                    view_result["validated"] += 1
        bundle_result["battle"]["views"][view] = view_result


def _audit_evolution(
    spec: BundleSpec,
    metadata: dict[str, Any],
    *,
    form_result: dict[str, Any],
    bundle_result: dict[str, Any],
    repo_root: Path,
    cache: dict[Path, dict[str, Any] | None],
    expected_pngs: set[Path],
) -> None:
    value = metadata.get("evolutionVisual")
    if value is None:
        return
    if not isinstance(value, dict):
        _add_asset_issue(
            form_result,
            bundle_result,
            "invalid_evolution_metadata",
            "metadata.evolutionVisual 必须是对象",
        )
        return
    view = str(value.get("view", "")).strip()
    frame_count = value.get("frameCount")
    runtime_root_value = value.get("runtimeRoot")
    if view not in BATTLE_VIEWS:
        _add_asset_issue(
            form_result,
            bundle_result,
            "invalid_evolution_view",
            f"evolutionVisual.view 必须属于 {list(BATTLE_VIEWS)}",
        )
    if (
        not isinstance(frame_count, int)
        or isinstance(frame_count, bool)
        or frame_count <= 0
    ):
        _add_asset_issue(
            form_result,
            bundle_result,
            "invalid_evolution_frame_count",
            "evolutionVisual.frameCount 必须为正整数",
        )
        return
    if (
        not isinstance(runtime_root_value, str)
        or not runtime_root_value.strip()
    ):
        _add_asset_issue(
            form_result,
            bundle_result,
            "invalid_evolution_runtime_root",
            "evolutionVisual.runtimeRoot 必须是非空 bundle-relative 路径",
        )
        return
    runtime_root_text = runtime_root_value.strip()
    pure_root = PurePosixPath(runtime_root_text)
    if (
        pure_root.is_absolute()
        or runtime_root_text.startswith(("/", "\\"))
        or ".." in pure_root.parts
    ):
        _add_asset_issue(
            form_result,
            bundle_result,
            "invalid_evolution_runtime_root",
            "evolutionVisual.runtimeRoot 不是安全的 bundle-relative 路径",
            runtime_root_text,
        )
        return
    runtime_root = (spec.root / Path(*pure_root.parts)).resolve(strict=False)
    try:
        runtime_root.relative_to(spec.root.resolve(strict=False))
    except ValueError:
        _add_asset_issue(
            form_result,
            bundle_result,
            "invalid_evolution_runtime_root",
            "evolutionVisual.runtimeRoot 越出 bundle 根目录",
            runtime_root_text,
        )
        return
    bundle_result["evolution"] = {
        "expected": frame_count,
        "validated": 0,
        "view": view,
        "runtimeRoot": runtime_root_text,
    }
    for index in range(1, frame_count + 1):
        path = runtime_root / f"evolution-{index}.png"
        expected_pngs.add(path)
        bundle_result["expectedPngCount"] += 1
        metrics = _validate_png(
            path,
            form_result=form_result,
            bundle_result=bundle_result,
            repo_root=repo_root,
            cache=cache,
        )
        if metrics is not None:
            bundle_result["evolution"]["validated"] += 1


def _audit_orphans(
    spec: BundleSpec,
    expected_pngs: set[Path],
    *,
    form_result: dict[str, Any],
    bundle_result: dict[str, Any],
    repo_root: Path,
) -> None:
    actual: set[Path] = set()
    for runtime_root in (spec.root / "world" / "directions", spec.root / "views"):
        if runtime_root.is_dir():
            actual.update(path.resolve() for path in runtime_root.rglob("*.png") if path.is_file())
    normalized_expected = {path.resolve() for path in expected_pngs}
    orphan_paths = sorted(actual - normalized_expected)
    bundle_result["orphanPngs"] = [_repo_relative(path, repo_root) for path in orphan_paths]
    for path in orphan_paths:
        _add_asset_issue(
            form_result,
            bundle_result,
            "orphan_runtime_png",
            "runtime 目录存在未被 metadata/合同登记的 PNG",
            _repo_relative(path, repo_root),
        )


def _audit_mounted_battle_source_readiness(
    spec: BundleSpec,
    metadata: dict[str, Any],
    required_actions: list[str],
    *,
    form_result: dict[str, Any],
    bundle_result: dict[str, Any],
    repo_root: Path,
) -> None:
    readiness = {
        "declared": False,
        "status": "not_declared",
        "archiveMode": "",
        "sourceFramesTracked": None,
        "bundleDigest": "",
        "sourceLedger": "",
        "installManifest": "source/battle/install-manifest.json",
        "expectedPromptCount": 0,
        "trackedPromptCount": 0,
        "expectedSourceFrameHashCount": 0,
        "validatedSourceFrameHashCount": 0,
        "installedFileCount": 0,
        "validatedSourceFileCount": 0,
        "linkedBundleDigests": {},
    }
    bundle_result["battle"]["sourceReadiness"] = readiness
    if spec.kind != "mounted":
        return
    battle_visual = metadata.get("battleVisual")
    if not isinstance(battle_visual, dict):
        return
    formally_declared = any(
        key in battle_visual
        for key in ("status", "bundleDigest", "qcSummary", "runtimeRoot")
    )
    if not formally_declared:
        return

    readiness["declared"] = True
    initial_issue_count = len(bundle_result["errors"]) + len(
        bundle_result["pending"]
    )

    def add(code: str, message: str, path: Path | str | None = None) -> None:
        rendered_path = ""
        if isinstance(path, Path):
            rendered_path = _repo_relative(path, repo_root)
        elif isinstance(path, str):
            rendered_path = path
        _add_asset_issue(
            form_result,
            bundle_result,
            code,
            message,
            rendered_path,
        )

    def load_json(path: Path, code: str, label: str) -> dict[str, Any] | None:
        if not path.is_file():
            add(code, f"缺少{label}", path)
            return None
        try:
            value = _load_json(path)
        except (OSError, UnicodeError, json.JSONDecodeError) as error:
            add(code, f"{label}无法解析：{error}", path)
            return None
        if not isinstance(value, dict):
            add(code, f"{label}必须是 JSON 对象", path)
            return None
        return value

    archive_mode = battle_visual.get("archiveMode")
    readiness["archiveMode"] = archive_mode if isinstance(archive_mode, str) else ""
    if archive_mode not in FORMAL_BATTLE_ARCHIVE_MODES:
        add(
            "invalid_battle_archive_mode",
            "正式骑乘战斗包 battleVisual.archiveMode 必须为 lean 或 full",
            spec.metadata_path,
        )
    tracks_source = battle_visual.get("sourceFramesTracked")
    readiness["sourceFramesTracked"] = (
        tracks_source if type(tracks_source) is bool else None
    )
    if type(tracks_source) is not bool or (
        archive_mode in FORMAL_BATTLE_ARCHIVE_MODES
        and tracks_source is not (archive_mode == "full")
    ):
        add(
            "invalid_battle_source_tracking",
            "full 必须 sourceFramesTracked=true，lean 必须为 false",
            spec.metadata_path,
        )

    linked_digests: dict[str, str] = {}
    metadata_digest = battle_visual.get("bundleDigest")
    if _is_sha256(metadata_digest):
        readiness["bundleDigest"] = metadata_digest
        linked_digests["metadata"] = metadata_digest
    else:
        add(
            "invalid_battle_bundle_digest",
            "正式骑乘战斗包缺少有效的 battleVisual.bundleDigest",
            spec.metadata_path,
        )

    source_ledger: dict[str, Any] | None = None
    source_ledger_path = _safe_bundle_relative_path(
        spec.root,
        battle_visual.get("sourceLedger"),
    )
    if source_ledger_path is None:
        add(
            "missing_battle_source_ledger",
            "正式骑乘战斗包缺少安全的 battleVisual.sourceLedger",
            spec.metadata_path,
        )
    else:
        readiness["sourceLedger"] = source_ledger_path.relative_to(
            spec.root.resolve(strict=False)
        ).as_posix()
        source_ledger = load_json(
            source_ledger_path,
            "missing_battle_source_ledger",
            "骑乘战斗来源 ledger",
        )

    qc_summary: dict[str, Any] | None = None
    qc_summary_path = _safe_bundle_relative_path(
        spec.root,
        battle_visual.get("qcSummary"),
    )
    if qc_summary_path is None:
        add(
            "missing_battle_qc_summary",
            "正式骑乘战斗包缺少安全的 battleVisual.qcSummary",
            spec.metadata_path,
        )
    else:
        qc_summary = load_json(
            qc_summary_path,
            "missing_battle_qc_summary",
            "骑乘战斗 QC 摘要",
        )
        if isinstance(qc_summary, dict) and _is_sha256(
            qc_summary.get("bundleDigest")
        ):
            linked_digests["qcSummary"] = qc_summary["bundleDigest"]

    # Legacy candidate ledgers are not accepted as the formal source ledger, but
    # their digest remains useful for exposing stale metadata instead of hiding it.
    source_archive = metadata.get("sourceArchive")
    legacy_ledger_path: Path | None = None
    if source_ledger is None and isinstance(source_archive, dict):
        legacy_ledger_path = _safe_bundle_relative_path(
            spec.root,
            source_archive.get("formalProductionLedger"),
        )
    if legacy_ledger_path is not None and legacy_ledger_path.is_file():
        try:
            legacy_ledger = _load_json(legacy_ledger_path)
        except (OSError, UnicodeError, json.JSONDecodeError):
            legacy_ledger = None
        if isinstance(legacy_ledger, dict) and _is_sha256(
            legacy_ledger.get("bundleDigest")
        ):
            linked_digests["legacyLedger"] = legacy_ledger["bundleDigest"]

    install_manifest_path = spec.root / "source/battle/install-manifest.json"
    install_manifest = load_json(
        install_manifest_path,
        "missing_battle_install_manifest",
        "骑乘战斗安装清单",
    )
    installed_hashes: dict[str, Any] = {}
    validated_hashes: dict[str, Any] = {}
    if install_manifest is not None:
        manifest_contract_errors: list[str] = []
        expected_identity = {
            "schemaVersion": 1,
            "tool": FORMAL_BATTLE_INSTALLER,
            "formId": str(metadata.get("mountFormId", "")).strip(),
            "kind": "mounted",
            "characterId": spec.character_id,
            "archiveMode": archive_mode,
            "runtimeEnabled": False,
            "ownerReviewStatus": "pending",
        }
        for field, expected in expected_identity.items():
            if install_manifest.get(field) != expected:
                manifest_contract_errors.append(
                    f"{field}={install_manifest.get(field)!r}（应为 {expected!r}）"
                )
        manifest_digest = install_manifest.get("bundleDigest")
        if _is_sha256(manifest_digest):
            linked_digests["installManifest"] = manifest_digest
        else:
            manifest_contract_errors.append("bundleDigest 无效")
        installed_value = install_manifest.get("installedFileHashes")
        validated_value = install_manifest.get("validatedSourceFileHashes")
        if isinstance(installed_value, dict) and installed_value:
            installed_hashes = installed_value
        else:
            manifest_contract_errors.append("installedFileHashes 为空或无效")
        if isinstance(validated_value, dict) and validated_value:
            validated_hashes = validated_value
        else:
            manifest_contract_errors.append(
                "validatedSourceFileHashes 为空或无效"
            )
        if manifest_contract_errors:
            add(
                "invalid_battle_install_manifest",
                "骑乘战斗安装清单合同不一致："
                + "；".join(manifest_contract_errors[:6]),
                install_manifest_path,
            )

    readiness["installedFileCount"] = len(installed_hashes)
    readiness["validatedSourceFileCount"] = len(validated_hashes)

    installed_hash_errors: list[str] = []
    for relative, expected_sha in installed_hashes.items():
        path = _safe_bundle_relative_path(spec.root, relative)
        if path is None or not _is_sha256(expected_sha):
            installed_hash_errors.append(str(relative))
            continue
        if not path.is_file():
            installed_hash_errors.append(f"{relative}（缺失）")
            continue
        try:
            actual_sha = _sha256_file(path)
        except OSError:
            installed_hash_errors.append(f"{relative}（不可读）")
            continue
        if actual_sha != expected_sha:
            installed_hash_errors.append(f"{relative}（哈希漂移）")
    if installed_hash_errors:
        add(
            "battle_installed_file_hash_mismatch",
            f"安装文件哈希不一致 {len(installed_hash_errors)} 项："
            + "、".join(installed_hash_errors[:5]),
            install_manifest_path,
        )

    invalid_validated_hashes = [
        str(relative)
        for relative, expected_sha in validated_hashes.items()
        if _safe_bundle_relative_path(spec.root, relative) is None
        or not _is_sha256(expected_sha)
    ]
    if invalid_validated_hashes:
        add(
            "invalid_validated_source_hashes",
            f"完整来源验证哈希表含 {len(invalid_validated_hashes)} 个无效条目："
            + "、".join(invalid_validated_hashes[:5]),
            install_manifest_path,
        )

    actions_meta = metadata.get("actions")
    expected_paths: dict[str, list[str]] = {
        "runtime": [],
        "prompt": [],
        "pipeline": [],
        "qc": [],
        "source": [],
    }
    for view in BATTLE_VIEWS:
        for action in required_actions:
            action_meta = (
                actions_meta.get(action)
                if isinstance(actions_meta, dict)
                else None
            )
            frame_count = (
                action_meta.get("frameCount")
                if isinstance(action_meta, dict)
                else 0
            )
            if not isinstance(frame_count, int) or frame_count <= 0:
                continue
            action_root = f"source/battle/{view}/{action}"
            expected_paths["prompt"].append(f"{action_root}/prompt-used.txt")
            expected_paths["pipeline"].append(f"{action_root}/pipeline-meta.json")
            expected_paths["qc"].append(f"{action_root}/qa.json")
            for index in range(1, frame_count + 1):
                expected_paths["runtime"].append(
                    f"views/{view}/{action}/{action}-{index}.png"
                )
                expected_paths["source"].append(
                    f"{action_root}/source-frames/{action}-{index}.png"
                )

    readiness["expectedPromptCount"] = len(expected_paths["prompt"])
    readiness["expectedSourceFrameHashCount"] = len(expected_paths["source"])
    readiness["validatedSourceFrameHashCount"] = sum(
        path in validated_hashes for path in expected_paths["source"]
    )

    missing_installed_entries: list[str] = []
    if installed_hashes:
        required_installed = (
            expected_paths["runtime"]
            + expected_paths["prompt"]
            + expected_paths["pipeline"]
            + expected_paths["qc"]
        )
        if readiness["sourceLedger"]:
            required_installed.append(readiness["sourceLedger"])
        if qc_summary_path is not None:
            required_installed.append(
                qc_summary_path.relative_to(
                    spec.root.resolve(strict=False)
                ).as_posix()
            )
        if archive_mode == "full":
            required_installed += expected_paths["source"]
        missing_installed_entries = sorted(
            path for path in set(required_installed) if path not in installed_hashes
        )
    if missing_installed_entries:
        add(
            "battle_install_manifest_incomplete",
            f"安装清单漏记 {len(missing_installed_entries)} 个正式文件："
            + "、".join(missing_installed_entries[:5]),
            install_manifest_path,
        )

    missing_validated_entries: list[str] = []
    if validated_hashes:
        required_validated = (
            expected_paths["source"]
            + expected_paths["prompt"]
            + expected_paths["pipeline"]
            + expected_paths["qc"]
        )
        missing_validated_entries = sorted(
            path for path in set(required_validated) if path not in validated_hashes
        )
    if missing_validated_entries:
        add(
            "validated_battle_source_manifest_incomplete",
            f"完整来源验证表漏记 {len(missing_validated_entries)} 个文件："
            + "、".join(missing_validated_entries[:5]),
            install_manifest_path,
        )

    raw_archive_errors: list[str] = []
    if validated_hashes:
        for view in BATTLE_VIEWS:
            for action in required_actions:
                action_root = f"source/battle/{view}/{action}"
                validated_raw = [
                    path
                    for path in validated_hashes
                    if path.startswith(f"{action_root}/raw-sheet-lossless.")
                ]
                if len(validated_raw) != 1:
                    raw_archive_errors.append(
                        f"{view}/{action}（完整验证原表 {len(validated_raw)} 份）"
                    )
                if f"{action_root}/source-meta.json" not in validated_hashes:
                    raw_archive_errors.append(f"{view}/{action}（缺 source-meta）")
                if archive_mode == "full" or action == "idle":
                    installed_raw = [
                        path
                        for path in installed_hashes
                        if path.startswith(f"{action_root}/raw-sheet-lossless.")
                    ]
                    if len(installed_raw) != 1:
                        raw_archive_errors.append(
                            f"{view}/{action}（安装原表 {len(installed_raw)} 份）"
                        )
                    if f"{action_root}/source-meta.json" not in installed_hashes:
                        raw_archive_errors.append(
                            f"{view}/{action}（安装包缺 source-meta）"
                        )
    if raw_archive_errors:
        add(
            "battle_lossless_source_archive_incomplete",
            f"无损生成表／来源元数据不完整 {len(raw_archive_errors)} 项："
            + "、".join(raw_archive_errors[:6]),
            install_manifest_path,
        )

    ledger_contract_errors: list[str] = []
    ledger_actions = (
        source_ledger.get("actions")
        if isinstance(source_ledger, dict)
        else None
    )
    if source_ledger is not None:
        expected_ledger_identity = {
            "schemaVersion": 1,
            "archiveMode": archive_mode,
            "formId": str(metadata.get("mountFormId", "")).strip(),
            "kind": "mounted",
            "characterId": spec.character_id,
            "fullSourceValidationRequiredBeforeInstall": True,
        }
        for field, expected in expected_ledger_identity.items():
            if source_ledger.get(field) != expected:
                ledger_contract_errors.append(field)
        for field in ("generator", "sourceOrigin", "ownership", "replacementPath"):
            if not _is_non_empty(source_ledger.get(field)):
                ledger_contract_errors.append(field)
        if not isinstance(ledger_actions, dict):
            ledger_contract_errors.append("actions")

    tracked_prompt_count = 0
    prompt_errors: list[str] = []
    provenance_hash_errors: list[str] = []
    for view in BATTLE_VIEWS:
        view_ledger = (
            ledger_actions.get(view)
            if isinstance(ledger_actions, dict)
            else None
        )
        for action in required_actions:
            action_meta = (
                actions_meta.get(action)
                if isinstance(actions_meta, dict)
                else None
            )
            frame_count = (
                action_meta.get("frameCount")
                if isinstance(action_meta, dict)
                else 0
            )
            if not isinstance(frame_count, int) or frame_count <= 0:
                continue
            label = f"{view}/{action}"
            action_ledger = (
                view_ledger.get(action)
                if isinstance(view_ledger, dict)
                else None
            )
            if source_ledger is not None and not isinstance(action_ledger, dict):
                ledger_contract_errors.append(label)
                action_ledger = None
            if isinstance(action_ledger, dict):
                expected_tracking = archive_mode == "full"
                if action_ledger.get("sourceFramesTracked") is not expected_tracking:
                    ledger_contract_errors.append(f"{label}.sourceFramesTracked")
                source_hashes = action_ledger.get("sourceFrameRgbaSha256")
                runtime_hashes = action_ledger.get("runtimeFrameRgbaSha256")
                if (
                    not isinstance(source_hashes, list)
                    or len(source_hashes) != frame_count
                    or any(not _is_sha256(value) for value in source_hashes)
                ):
                    ledger_contract_errors.append(f"{label}.sourceFrameRgbaSha256")
                if (
                    not isinstance(runtime_hashes, list)
                    or len(runtime_hashes) != frame_count
                    or any(not _is_sha256(value) for value in runtime_hashes)
                ):
                    ledger_contract_errors.append(f"{label}.runtimeFrameRgbaSha256")
                for field in ("promptSha256", "pipelineSha256", "qcSha256"):
                    if not _is_sha256(action_ledger.get(field)):
                        ledger_contract_errors.append(f"{label}.{field}")
                if (archive_mode == "full" or action == "idle") and (
                    action_ledger.get("representativeRawTracked") is not True
                ):
                    ledger_contract_errors.append(f"{label}.representativeRawTracked")

            action_root = spec.root / "source" / "battle" / view / action
            evidence_files = (
                ("promptSha256", action_root / "prompt-used.txt"),
                ("pipelineSha256", action_root / "pipeline-meta.json"),
                ("qcSha256", action_root / "qa.json"),
            )
            for field, path in evidence_files:
                if not path.is_file():
                    if field == "promptSha256":
                        prompt_errors.append(label)
                    else:
                        provenance_hash_errors.append(f"{label}/{path.name}（缺失）")
                    continue
                try:
                    actual_sha = _sha256_file(path)
                except OSError:
                    provenance_hash_errors.append(f"{label}/{path.name}（不可读）")
                    continue
                if field == "promptSha256":
                    try:
                        prompt_text = path.read_text(encoding="utf-8").strip()
                    except (OSError, UnicodeError):
                        prompt_text = ""
                    if len(prompt_text) < 40:
                        prompt_errors.append(f"{label}（内容过短）")
                    else:
                        tracked_prompt_count += 1
                if isinstance(action_ledger, dict) and (
                    action_ledger.get(field) != actual_sha
                ):
                    provenance_hash_errors.append(f"{label}/{path.name}（ledger 哈希漂移）")

    readiness["trackedPromptCount"] = tracked_prompt_count
    if prompt_errors:
        add(
            "missing_battle_action_prompts",
            f"逐动作 exact prompt 不完整 {len(prompt_errors)} 项："
            + "、".join(prompt_errors[:5]),
            spec.root / "source/battle",
        )
    if provenance_hash_errors:
        add(
            "battle_provenance_hash_mismatch",
            f"逐动作处理/QC 证据缺失或哈希不一致 {len(provenance_hash_errors)} 项："
            + "、".join(provenance_hash_errors[:5]),
            spec.root / "source/battle",
        )
    if ledger_contract_errors:
        add(
            "invalid_battle_source_ledger",
            f"骑乘战斗来源 ledger 合同不完整 {len(ledger_contract_errors)} 项："
            + "、".join(ledger_contract_errors[:8]),
            source_ledger_path or spec.metadata_path,
        )

    readiness["linkedBundleDigests"] = dict(sorted(linked_digests.items()))
    unique_digests = sorted(set(linked_digests.values()))
    if len(unique_digests) > 1:
        rendered = "，".join(
            f"{label}={digest[:12]}…"
            for label, digest in sorted(linked_digests.items())
        )
        add(
            "battle_bundle_digest_mismatch",
            "骑乘战斗 metadata／安装清单／QC／来源账本的 bundle digest 不一致："
            + rendered,
            spec.metadata_path,
        )

    final_issue_count = len(bundle_result["errors"]) + len(
        bundle_result["pending"]
    )
    if final_issue_count == initial_issue_count:
        readiness["status"] = "verified"
    elif bool(form_result.get("runtimeEnabled", False)):
        readiness["status"] = "failed"
    else:
        readiness["status"] = "pending"


def _audit_bundle(
    spec: BundleSpec,
    *,
    form: dict[str, Any],
    form_result: dict[str, Any],
    required_actions: list[str],
    default_character_id: str,
    repo_root: Path,
) -> dict[str, Any]:
    result = _bundle_result(spec, repo_root)
    if not spec.root.is_dir():
        _add_asset_issue(
            form_result,
            result,
            "missing_bundle_root",
            f"缺少 {spec.kind} 资产根目录",
            _repo_relative(spec.root, repo_root),
        )
        return result
    _check_reference_files(spec, form_result, result, repo_root)
    metadata = _read_metadata(spec, form_result, result, repo_root)
    if metadata is None:
        return result
    if _identity_gate_claimed(spec, metadata):
        catalog_status_mismatch = form.get("status") != "in_production"
        if catalog_status_mismatch:
            _add_identity_gate_error(
                form_result,
                result,
                IdentityGateAuditError(
                    "identity_gate_catalog_status_mismatch",
                    "声明 schema-2 身份门的 form 必须保持 status=in_production",
                    spec.metadata_path,
                ),
                repo_root,
            )
        try:
            _audit_identity_gate_chain(
                spec,
                form=form,
                metadata=metadata,
                repo_root=repo_root,
            )
            result["identityGate"] = {
                "declared": True,
                "schemaVersion": 2,
                "status": (
                    "failed"
                    if catalog_status_mismatch
                    else "verified"
                ),
            }
        except IdentityGateAuditError as error:
            result["identityGate"] = {
                "declared": True,
                "schemaVersion": 2,
                "status": "failed",
            }
            _add_identity_gate_error(
                form_result,
                result,
                error,
                repo_root,
            )
    runtime_size = metadata.get("runtimeFrameSize")
    if runtime_size != [FRAME_SIZE[0], FRAME_SIZE[1]]:
        _add_asset_issue(
            form_result,
            result,
            "invalid_runtime_frame_size",
            f"metadata.runtimeFrameSize 必须为 {list(FRAME_SIZE)}",
        )
    form_id = str(form.get("formId", "")).strip()
    if spec.kind == "pet":
        if str(metadata.get("formId", "")).strip() != form_id:
            _add_asset_issue(form_result, result, "metadata_form_mismatch", "pet metadata.formId 与 catalog 不一致")
    else:
        if str(metadata.get("mountFormId", "")).strip() != form_id:
            _add_asset_issue(form_result, result, "metadata_form_mismatch", "mounted metadata.mountFormId 与 catalog 不一致")
        if str(metadata.get("characterId", "")).strip() != default_character_id:
            _add_asset_issue(
                form_result,
                result,
                "metadata_character_mismatch",
                "mounted metadata.characterId 与 defaultCharacterId 不一致",
            )
    world_visual = metadata.get("worldVisual")
    if not isinstance(world_visual, dict):
        _add_asset_issue(form_result, result, "invalid_world_metadata", "metadata.worldVisual 必须是对象")
    else:
        if world_visual.get("directions") != list(CANONICAL_DIRECTIONS):
            _add_asset_issue(
                form_result,
                result,
                "invalid_world_directions",
                f"metadata.worldVisual.directions 必须严格为 {list(CANONICAL_DIRECTIONS)}",
            )
        if bool(world_visual.get("runtimeMirroring", True)):
            _add_asset_issue(form_result, result, "runtime_mirroring_enabled", "正式真八向禁止 runtimeMirroring")
        world_actions = world_visual.get("actions")
        if not isinstance(world_actions, dict):
            _add_asset_issue(form_result, result, "invalid_world_actions", "metadata.worldVisual.actions 必须是对象")
        else:
            for action, count in WORLD_ACTIONS.items():
                action_meta = world_actions.get(action)
                actual_count = action_meta.get("frameCount") if isinstance(action_meta, dict) else None
                if actual_count != count:
                    _add_asset_issue(
                        form_result,
                        result,
                        "invalid_world_frame_count",
                        f"world {action} 必须为 {count} 帧，实际 {actual_count!r}",
                    )
        if spec.kind == "mounted":
            if bool(world_visual.get("runtimeLayeredComposition", True)):
                _add_asset_issue(form_result, result, "layered_mount_enabled", "整体骑乘禁止 runtimeLayeredComposition")
            if world_visual.get("runtimeBodyLayerCount") != 1:
                _add_asset_issue(form_result, result, "invalid_mounted_body_layers", "整体骑乘 runtimeBodyLayerCount 必须为 1")

    cache: dict[Path, dict[str, Any] | None] = {}
    expected_pngs: set[Path] = set()
    _audit_world(
        spec,
        form_result=form_result,
        bundle_result=result,
        repo_root=repo_root,
        cache=cache,
        expected_pngs=expected_pngs,
    )
    _audit_battle(
        spec,
        metadata,
        required_actions,
        form_result=form_result,
        bundle_result=result,
        repo_root=repo_root,
        cache=cache,
        expected_pngs=expected_pngs,
    )
    _audit_mounted_battle_source_readiness(
        spec,
        metadata,
        required_actions,
        form_result=form_result,
        bundle_result=result,
        repo_root=repo_root,
    )
    if spec.kind == "pet":
        _audit_evolution(
            spec,
            metadata,
            form_result=form_result,
            bundle_result=result,
            repo_root=repo_root,
            cache=cache,
            expected_pngs=expected_pngs,
        )
    source_errors: list[str] = []
    tracked_source_count, canonical_derived_count = (
        _audit_tracked_source_derivation(
            spec.root,
            metadata,
            source_errors,
            kind=spec.kind,
            form_id=form_id,
            character_id=(
                default_character_id if spec.kind == "mounted" else None
            ),
        )
    )
    result["battle"]["trackedSourceFrameCount"] = tracked_source_count
    result["battle"][
        "canonicalDerivedRuntimeFrameCount"
    ] = canonical_derived_count
    for message in source_errors:
        _add_asset_issue(
            form_result,
            result,
            "invalid_full_source_archive",
            message,
            _repo_relative(spec.root, repo_root),
        )
    _audit_orphans(
        spec,
        expected_pngs,
        form_result=form_result,
        bundle_result=result,
        repo_root=repo_root,
    )
    return result


def _validate_catalog_header(catalog: Any) -> list[dict[str, str]]:
    errors: list[dict[str, str]] = []
    if not isinstance(catalog, dict):
        return [_issue("invalid_catalog", "pet_art_catalog 必须是 JSON 对象")]
    if catalog.get("schemaVersion") != SCHEMA_VERSION:
        errors.append(_issue("invalid_schema_version", f"schemaVersion 必须为 {SCHEMA_VERSION}"))
    default_character = catalog.get("defaultCharacterId")
    if not isinstance(default_character, str) or not default_character.strip():
        errors.append(_issue("invalid_default_character", "defaultCharacterId 必须是非空字符串"))
    if catalog.get("canonicalDirections") != list(CANONICAL_DIRECTIONS):
        errors.append(
            _issue("invalid_canonical_directions", f"canonicalDirections 必须严格为 {list(CANONICAL_DIRECTIONS)}")
        )
    if catalog.get("battleViews") != list(BATTLE_VIEWS):
        errors.append(_issue("invalid_battle_views", f"battleViews 必须严格为 {list(BATTLE_VIEWS)}"))
    if catalog.get("requiredWorldActions") != WORLD_ACTIONS:
        errors.append(_issue("invalid_world_actions", f"requiredWorldActions 必须严格为 {WORLD_ACTIONS}"))
    battle_actions = catalog.get("requiredBattleActions")
    if (
        not isinstance(battle_actions, list)
        or len(battle_actions) != 12
        or any(not isinstance(action, str) or not action.strip() for action in battle_actions)
        or len(set(battle_actions)) != len(battle_actions)
    ):
        errors.append(_issue("invalid_required_battle_actions", "requiredBattleActions 必须是 12 个唯一非空动作 ID"))
    if not isinstance(catalog.get("sourceArchivePolicy"), dict) or not catalog.get("sourceArchivePolicy"):
        errors.append(_issue("invalid_source_archive_policy", "sourceArchivePolicy 必须是非空对象"))
    forms = catalog.get("forms")
    if not isinstance(forms, list) or not forms:
        errors.append(_issue("invalid_forms", "forms 必须是非空数组"))
    return errors


def audit_catalog(
    catalog_path: Path,
    repo_root: Path,
    fusion_catalog_path: Path | None = None,
) -> dict[str, Any]:
    try:
        catalog = _load_json(catalog_path)
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        return {
            "schemaVersion": SCHEMA_VERSION,
            "catalogPath": _repo_relative(catalog_path, repo_root),
            "status": "failed",
            "summary": {"forms": 0, "ok": 0, "pending": 0, "failed": 0, "errors": 1, "warnings": 0},
            "catalogErrors": [_issue("catalog_read_failed", f"无法读取 catalog：{error}")],
            "forms": [],
        }

    catalog_errors = _validate_catalog_header(catalog)
    catalog_dict = catalog if isinstance(catalog, dict) else {}
    forms = catalog_dict.get("forms", []) if isinstance(catalog_dict.get("forms", []), list) else []
    default_character_id = str(catalog_dict.get("defaultCharacterId", "")).strip()
    required_actions_value = catalog_dict.get("requiredBattleActions", [])
    required_actions = [str(value).strip() for value in required_actions_value] if isinstance(required_actions_value, list) else []
    art_catalog_nonrideable_form_ids = sorted(
        str(form.get("formId", "")).strip()
        for form in forms
        if (
            isinstance(form, dict)
            and form.get("rideableTarget") is False
            and str(form.get("formId", "")).strip()
        )
    )
    fusion_target_roots: dict[str, str] = {}
    fusion_catalog_checked = bool(art_catalog_nonrideable_form_ids)
    resolved_fusion_catalog_path: Path | None = None
    if fusion_catalog_checked:
        resolved_fusion_catalog_path = (
            fusion_catalog_path
            if fusion_catalog_path is not None
            else repo_root / DEFAULT_FUSION_CATALOG_PATH
        )
        fusion_target_roots, fusion_errors = _declared_fusion_target_form_ids(
            resolved_fusion_catalog_path.resolve(strict=False)
        )
        catalog_errors.extend(fusion_errors)
    form_results = [_new_form_result(value, index) for index, value in enumerate(forms)]
    specs: list[tuple[BundleSpec | None, BundleSpec | None]] = []
    for form, form_result in zip(forms, form_results, strict=True):
        specs.append(
            _validate_form_schema(
                form,
                form_result,
                default_character_id=default_character_id,
                fusion_target_roots=fusion_target_roots,
                repo_root=repo_root,
            )
        )

    form_id_indices: dict[str, list[int]] = {}
    root_indices: dict[str, list[tuple[int, str]]] = {}
    metadata_indices: dict[str, list[tuple[int, str]]] = {}
    for index, (form_result, pair) in enumerate(zip(form_results, specs, strict=True)):
        form_id = str(form_result.get("formId", ""))
        if form_id:
            form_id_indices.setdefault(form_id, []).append(index)
        for spec in pair:
            if spec is None:
                continue
            root_indices.setdefault(str(spec.root), []).append((index, spec.kind))
            metadata_indices.setdefault(str(spec.metadata_path), []).append((index, spec.kind))
    for form_id, indices in form_id_indices.items():
        if len(indices) > 1:
            for index in indices:
                _add_schema_error(form_results[index], "duplicate_form_id", f"formId 重复登记：{form_id}")
    for label, groups in (("root", root_indices), ("metadataPath", metadata_indices)):
        for path, entries in groups.items():
            if len(entries) <= 1:
                continue
            rendered = ", ".join(f"{form_results[index]['formId']}:{kind}" for index, kind in entries)
            for index, kind in entries:
                _add_schema_error(
                    form_results[index],
                    "duplicate_bundle_registration",
                    f"{kind}.{label} 与其他 bundle 重复：{rendered}",
                    _repo_relative(Path(path), repo_root),
                )

    for form_value, form_result, (pet_spec, mounted_spec) in zip(forms, form_results, specs, strict=True):
        if not isinstance(form_value, dict):
            continue
        if pet_spec is not None:
            form_result["pet"] = _audit_bundle(
                pet_spec,
                form=form_value,
                form_result=form_result,
                required_actions=required_actions,
                default_character_id=default_character_id,
                repo_root=repo_root,
            )
        if mounted_spec is not None:
            form_result["mounted"] = _audit_bundle(
                mounted_spec,
                form=form_value,
                form_result=form_result,
                required_actions=required_actions,
                default_character_id=default_character_id,
                repo_root=repo_root,
            )
        if form_result["errors"]:
            form_result["result"] = "failed"
        elif form_result["pending"]:
            form_result["result"] = "pending"
        elif form_result["warnings"]:
            form_result["result"] = "ok_with_warnings"
        else:
            form_result["result"] = "ok"

    failed_forms = sum(result["result"] == "failed" for result in form_results)
    pending_forms = sum(result["result"] == "pending" for result in form_results)
    ok_forms = len(form_results) - failed_forms - pending_forms
    error_count = len(catalog_errors) + sum(len(result["errors"]) for result in form_results)
    warning_count = sum(len(result["warnings"]) for result in form_results)
    pending_count = sum(len(result["pending"]) for result in form_results)
    status = "failed" if error_count else ("pending" if pending_count else "ok")
    return {
        "schemaVersion": SCHEMA_VERSION,
        "catalogPath": _repo_relative(catalog_path, repo_root),
        "status": status,
        "summary": {
            "forms": len(form_results),
            "runtimeEnabled": sum(bool(result.get("runtimeEnabled")) for result in form_results),
            "ok": ok_forms,
            "pending": pending_forms,
            "failed": failed_forms,
            "errors": error_count,
            "pendingIssues": pending_count,
            "warnings": warning_count,
        },
        "catalogErrors": catalog_errors,
        "fusionAuthorization": {
            "catalogChecked": fusion_catalog_checked,
            "catalogPath": (
                _repo_relative(
                    resolved_fusion_catalog_path.resolve(strict=False),
                    repo_root,
                )
                if resolved_fusion_catalog_path is not None
                else ""
            ),
            "artCatalogNonrideableFormIds": art_catalog_nonrideable_form_ids,
            "formalRecipeTargetFormIds": sorted(fusion_target_roots),
            "matchedFormIds": sorted(
                set(art_catalog_nonrideable_form_ids)
                & set(fusion_target_roots)
            ),
            "reason": (
                "strict_v2_catalog_checked"
                if fusion_catalog_checked
                else "art_catalog_has_no_nonrideable_fusion_forms"
            ),
        },
        "forms": form_results,
    }


def _markdown_issues(entries: list[dict[str, str]], limit: int = 24) -> list[str]:
    lines: list[str] = []
    for entry in entries[:limit]:
        path = f" (`{entry['path']}`)" if entry.get("path") else ""
        lines.append(f"- `{entry['code']}`：{entry['message']}{path}")
    if len(entries) > limit:
        lines.append(f"- ……其余 {len(entries) - limit} 项见 JSON 报告。")
    return lines


def render_markdown(report: dict[str, Any]) -> str:
    summary = report.get("summary", {})
    fusion_authorization = report.get("fusionAuthorization", {})
    if fusion_authorization.get("catalogChecked"):
        fusion_line = (
            "- 融合不可骑授权：已严格检查 v2 目录；"
            f"art forms={len(fusion_authorization.get('artCatalogNonrideableFormIds', []))} "
            f"formal targets={len(fusion_authorization.get('formalRecipeTargetFormIds', []))} "
            f"matched={len(fusion_authorization.get('matchedFormIds', []))}"
        )
    else:
        fusion_line = (
            "- 融合不可骑授权：未检查；当前 art catalog "
            "没有登记不可骑融合 form，不能把本报告表述为融合目标美术已覆盖。"
        )
    lines = [
        "# 宠物美术批量静态审计",
        "",
        f"- 状态：`{report.get('status', 'failed')}`",
        f"- Catalog：`{report.get('catalogPath', '')}`",
        fusion_line,
        (
            "- 汇总：forms={forms} runtime={runtimeEnabled} ok={ok} pending={pending} "
            "failed={failed} errors={errors} pendingIssues={pendingIssues} warnings={warnings}"
        ).format(**{
            "forms": summary.get("forms", 0),
            "runtimeEnabled": summary.get("runtimeEnabled", 0),
            "ok": summary.get("ok", 0),
            "pending": summary.get("pending", 0),
            "failed": summary.get("failed", 0),
            "errors": summary.get("errors", 0),
            "pendingIssues": summary.get("pendingIssues", 0),
            "warnings": summary.get("warnings", 0),
        }),
        "",
        "| form | 名称 | status | runtime | result | errors | pending | warnings |",
        "| --- | --- | --- | ---: | --- | ---: | ---: | ---: |",
    ]
    for form in report.get("forms", []):
        lines.append(
            "| `{}` | {} | `{}` | {} | `{}` | {} | {} | {} |".format(
                form.get("formId", ""),
                str(form.get("displayName", "")).replace("|", "\\|"),
                form.get("status", ""),
                "yes" if form.get("runtimeEnabled") else "no",
                form.get("result", ""),
                len(form.get("errors", [])),
                len(form.get("pending", [])),
                len(form.get("warnings", [])),
            )
        )
    if report.get("catalogErrors"):
        lines.extend(["", "## Catalog 错误", ""])
        lines.extend(_markdown_issues(report["catalogErrors"]))
    for form in report.get("forms", []):
        if not (form.get("errors") or form.get("pending") or form.get("warnings")):
            continue
        lines.extend(["", f"## {form.get('displayName') or form.get('formId')}", ""])
        if form.get("errors"):
            lines.extend(["### 阻断", ""])
            lines.extend(_markdown_issues(form["errors"]))
        if form.get("pending"):
            lines.extend(["", "### Pending", ""])
            lines.extend(_markdown_issues(form["pending"]))
        if form.get("warnings"):
            lines.extend(["", "### Warnings", ""])
            lines.extend(_markdown_issues(form["warnings"]))
    lines.append("")
    return "\n".join(lines)


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--catalog",
        type=Path,
        default=Path("client/godot/data/pet_art_catalog.json"),
        help="v1 pet art catalog (default: client/godot/data/pet_art_catalog.json)",
    )
    parser.add_argument(
        "--repo-root",
        type=Path,
        default=Path(__file__).resolve().parents[1],
        help="repository root used to resolve catalog paths",
    )
    parser.add_argument(
        "--fusion-catalog",
        type=Path,
        default=DEFAULT_FUSION_CATALOG_PATH,
        help="shared pet fusion recipe catalog used to authorize nonrideable targets",
    )
    parser.add_argument("--json-out", type=Path, help="write the full JSON report")
    parser.add_argument("--markdown-out", type=Path, help="write the compact Markdown report")
    return parser.parse_args()


def main() -> int:
    args = _parse_args()
    repo_root = args.repo_root.resolve()
    catalog_path = args.catalog if args.catalog.is_absolute() else (repo_root / args.catalog)
    catalog_path = catalog_path.resolve(strict=False)
    fusion_catalog_path = (
        args.fusion_catalog
        if args.fusion_catalog.is_absolute()
        else repo_root / args.fusion_catalog
    )
    report = audit_catalog(
        catalog_path,
        repo_root,
        fusion_catalog_path.resolve(strict=False),
    )
    rendered_json = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    if args.json_out:
        output = args.json_out if args.json_out.is_absolute() else (repo_root / args.json_out)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(rendered_json, encoding="utf-8")
    else:
        sys.stdout.write(rendered_json)
    if args.markdown_out:
        output = args.markdown_out if args.markdown_out.is_absolute() else (repo_root / args.markdown_out)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(render_markdown(report), encoding="utf-8")
    summary = report.get("summary", {})
    print(
        "pet art batch audit: status={} forms={} runtime={} errors={} pending={} warnings={}".format(
            report.get("status", "failed"),
            summary.get("forms", 0),
            summary.get("runtimeEnabled", 0),
            summary.get("errors", 0),
            summary.get("pendingIssues", 0),
            summary.get("warnings", 0),
        ),
        file=sys.stderr,
    )
    return 1 if report.get("status") == "failed" else 0


if __name__ == "__main__":
    raise SystemExit(main())
