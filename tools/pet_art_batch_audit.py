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
import sys
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Any, Iterable

from PIL import Image, ImageOps, UnidentifiedImageError


SCHEMA_VERSION = 1
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
    "mounted",
)
REQUIRED_BUNDLE_FIELDS = ("root", "metadataPath", "identityPath", "ownershipPath", "promptPath")
FRAME_SIZE = (256, 256)
SAFE_EDGE_MARGIN = 4
ALPHA_THRESHOLD = 24
MAX_BASELINE_DRIFT_PX = 2
MAX_CENTER_DRIFT_PX = 12.0
MAX_ALPHA_HEIGHT_RATIO = 1.12


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
    if bool(form.get("rideableTarget", False)) and not supported:
        _add_schema_error(form_result, "missing_supported_character", "可骑目标至少需要一个 supportedCharacterIds")
    if bool(form.get("rideableTarget", False)) and default_character_id not in supported:
        _add_schema_error(
            form_result,
            "missing_default_character",
            f"可骑目标必须支持默认人物：{default_character_id}",
        )
    if form.get("status") == "planned" and form.get("runtimeEnabled") is True:
        _add_schema_error(form_result, "planned_runtime_enabled", "planned form 不能直接 runtimeEnabled=true")
    if form.get("status") == "approved" and form.get("runtimeEnabled") is not True:
        _add_schema_error(form_result, "approved_runtime_disabled", "approved form 必须 runtimeEnabled=true")

    specs: list[BundleSpec | None] = []
    for kind in ("pet", "mounted"):
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
    return specs[0], specs[1]


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
    return {
        "sha256": hashlib.sha256(rgba.tobytes()).hexdigest(),
        "mirrorSha256": hashlib.sha256(ImageOps.mirror(rgba).tobytes()).hexdigest(),
        "alphaBbox": list(bbox),
        "width": bbox[2] - bbox[0],
        "height": bbox[3] - bbox[1],
        "centerX": round((bbox[0] + bbox[2]) / 2.0, 3),
        "bottomExclusive": bbox[3],
        "magentaFringePixels": magenta_count,
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
                bottoms = [int(entry["bottomExclusive"]) for entry in walk_metrics]
                centers = [float(entry["centerX"]) for entry in walk_metrics]
                heights = [int(entry["height"]) for entry in walk_metrics]
                baseline_drift = max(bottoms) - min(bottoms)
                center_drift = round(max(centers) - min(centers), 3)
                height_ratio = round(max(heights) / max(1, min(heights)), 5)
                direction_result["motion"] = {
                    "baselineDriftPx": baseline_drift,
                    "centerDriftPx": center_drift,
                    "alphaHeightRatio": height_ratio,
                }
                if baseline_drift > MAX_BASELINE_DRIFT_PX:
                    _add_asset_issue(
                        form_result,
                        bundle_result,
                        "baseline_drift",
                        f"{direction} walk 脚底漂移 {baseline_drift}px，门槛 {MAX_BASELINE_DRIFT_PX}px",
                    )
                if center_drift > MAX_CENTER_DRIFT_PX:
                    _add_asset_issue(
                        form_result,
                        bundle_result,
                        "center_drift",
                        f"{direction} walk 中心漂移 {center_drift}px，门槛 {MAX_CENTER_DRIFT_PX}px",
                    )
                if height_ratio > MAX_ALPHA_HEIGHT_RATIO:
                    _add_asset_issue(
                        form_result,
                        bundle_result,
                        "alpha_height_drift",
                        f"{direction} walk alpha 高度比 {height_ratio:.3f}，门槛 {MAX_ALPHA_HEIGHT_RATIO:.3f}",
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


def audit_catalog(catalog_path: Path, repo_root: Path) -> dict[str, Any]:
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
    form_results = [_new_form_result(value, index) for index, value in enumerate(forms)]
    specs: list[tuple[BundleSpec | None, BundleSpec | None]] = []
    for form, form_result in zip(forms, form_results, strict=True):
        specs.append(
            _validate_form_schema(
                form,
                form_result,
                default_character_id=default_character_id,
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
    lines = [
        "# 宠物美术批量静态审计",
        "",
        f"- 状态：`{report.get('status', 'failed')}`",
        f"- Catalog：`{report.get('catalogPath', '')}`",
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
    parser.add_argument("--json-out", type=Path, help="write the full JSON report")
    parser.add_argument("--markdown-out", type=Path, help="write the compact Markdown report")
    return parser.parse_args()


def main() -> int:
    args = _parse_args()
    repo_root = args.repo_root.resolve()
    catalog_path = args.catalog if args.catalog.is_absolute() else (repo_root / args.catalog)
    catalog_path = catalog_path.resolve(strict=False)
    report = audit_catalog(catalog_path, repo_root)
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
