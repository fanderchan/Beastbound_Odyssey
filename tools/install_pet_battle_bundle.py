#!/usr/bin/env python3
"""Validate and atomically install a formal Beastbound battle-art bundle.

The tool consumes an already generated staging bundle.  It never creates art,
enables runtime use, or grants owner approval.  Validation always requires the
complete prompt, raw lossless archive, pipeline metadata, per-action QC, 512px
source frames, and deterministically derived 256px runtime frames.  Installation
can keep that full archive or write a repository-lean provenance ledger while
retaining every runtime frame and the evidence needed to audit the derivation.

Staging layout (all paths below are relative to ``--staging``)::

    bundle-manifest.json
    qa/contact-sheet.png
    qa/qc-summary.json
    qa/actions/<view>/<action>-contact.png
    qa/actions/<view>/<action>.gif
    views/<view>/<action>/
      source-frames/<action>-N.png
      runtime-frames/<action>-N.png
      raw-sheet-lossless.webp
      prompt-used.txt
      pipeline-meta.json
      source-meta.json
      qa.json

The destination is an isolated pet or mounted asset root.  Existing identity
and world files are preserved by building a complete replacement directory,
then swapping it into place with rollback protection.
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import os
import re
import secrets
import shutil
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Iterable

import numpy as np
from PIL import Image, UnidentifiedImageError


TOOLS_DIR = Path(__file__).resolve().parent
if str(TOOLS_DIR) not in sys.path:
    sys.path.insert(0, str(TOOLS_DIR))

from build_pet_art_bundle import derive_runtime_frame  # noqa: E402


TOOL_NAME = "install_pet_battle_bundle.py"
SCHEMA_VERSION = 1
SOURCE_FRAME_SIZE = 512
RUNTIME_FRAME_SIZE = 256
ALPHA_THRESHOLD = 8
FORM_ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9_]*$")
SHA256_PATTERN = re.compile(r"^[0-9a-f]{64}$")
ARCHIVE_MODES = ("full", "lean")

FORMAL_VIEWS = ("front_3quarter_sw", "back_3quarter_ne")
CANONICAL_BATTLE_VIEW_MAPPING: dict[str, dict[str, Any]] = {
    "enemy": {
        "view": "front_3quarter_sw",
        "flipH": True,
        "facing": "southeast",
    },
    "ally": {
        "view": "back_3quarter_ne",
        "flipH": True,
        "facing": "northwest",
    },
}
ACTION_SPECS: dict[str, tuple[int, int, bool]] = {
    "idle": (6, 8, True),
    "walk": (8, 10, True),
    "attack": (8, 12, False),
    "skill": (8, 12, False),
    "hurt": (6, 12, False),
    "defend": (6, 10, False),
    "dodge": (8, 12, False),
    "counter": (8, 12, False),
    "stagger": (8, 10, False),
    "knockaway": (8, 12, False),
    "down": (8, 10, False),
    "revive": (8, 10, False),
}


class BattleBundleError(RuntimeError):
    """A fail-closed validation or installation error."""


@dataclass(frozen=True)
class InstallOptions:
    staging: Path
    destination: Path
    form_id: str
    kind: str
    character_id: str | None = None
    dry_run: bool = False
    archive_mode: str = "full"


@dataclass(frozen=True)
class CopyEntry:
    source: Path
    destination_relative: Path
    sha256: str


@dataclass(frozen=True)
class GeneratedEntry:
    destination_relative: Path
    payload: bytes
    sha256: str


@dataclass
class ValidatedBundle:
    manifest: dict[str, Any]
    copies: list[CopyEntry]
    generated: list[GeneratedEntry]
    frame_hashes: dict[str, str]
    bundle_digest: str
    action_metadata: dict[str, Any]


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def sha256_bytes(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def rgba_hash(image: Image.Image) -> str:
    rgba = image.convert("RGBA")
    digest = hashlib.sha256()
    digest.update(f"{rgba.width}x{rgba.height}:RGBA\n".encode("ascii"))
    digest.update(rgba.tobytes())
    return digest.hexdigest()


def decoded_rgba_hash(path: Path) -> str:
    with Image.open(path) as image:
        return rgba_hash(image)


def _read_json(path: Path, label: str) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise BattleBundleError(f"invalid {label}: {path}: {exc}") from exc
    if not isinstance(value, dict):
        raise BattleBundleError(f"{label} must be a JSON object: {path}")
    return value


def _json_bytes(value: Any) -> bytes:
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n").encode(
        "utf-8"
    )


def _pretty_json_bytes(value: Any) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def _write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _require_safe_id(value: str, label: str) -> None:
    if not FORM_ID_PATTERN.fullmatch(value):
        raise BattleBundleError(f"invalid {label}: {value!r}")


def _safe_relative(root: Path, raw: Any, label: str) -> Path:
    if not isinstance(raw, str) or not raw.strip():
        raise BattleBundleError(f"{label} must be a non-empty relative path")
    relative = Path(raw)
    if relative.is_absolute() or ".." in relative.parts:
        raise BattleBundleError(f"{label} escapes staging root: {raw}")
    resolved_root = root.resolve()
    candidate = (root / relative).resolve()
    try:
        candidate.relative_to(resolved_root)
    except ValueError as exc:
        raise BattleBundleError(f"{label} escapes staging root: {raw}") from exc
    current = root
    for part in relative.parts:
        current = current / part
        if current.is_symlink():
            raise BattleBundleError(f"{label} may not traverse a symlink: {raw}")
    return candidate


def _require_file(path: Path, label: str) -> None:
    if not path.is_file() or path.is_symlink():
        raise BattleBundleError(f"missing or unsafe {label}: {path}")


def _require_sha(value: Any, label: str) -> str:
    if not isinstance(value, str) or not SHA256_PATTERN.fullmatch(value):
        raise BattleBundleError(f"{label} must be a lowercase sha256")
    return value


def _assert_hash(path: Path, expected: Any, label: str) -> str:
    expected_hash = _require_sha(expected, label)
    actual = sha256_file(path)
    if actual != expected_hash:
        raise BattleBundleError(f"{label} mismatch: expected {expected_hash}, got {actual}")
    return actual


def _scan_for_forbidden_state(value: Any, path: str = "manifest") -> None:
    """Reject any attempt to smuggle runtime or owner approval into staging JSON."""

    if isinstance(value, dict):
        for key, child in value.items():
            lower_key = str(key).lower()
            child_path = f"{path}.{key}"
            if lower_key == "runtimeenabled" and child is not False:
                raise BattleBundleError(f"{child_path} must be false")
            if "owner" in lower_key and "review" in lower_key:
                normalized = str(child).strip().lower().replace("-", "_")
                if normalized in {"approved", "owner_approved", "passed", "true"}:
                    raise BattleBundleError(f"{child_path} may not claim owner approval")
            _scan_for_forbidden_state(child, child_path)
    elif isinstance(value, list):
        for index, child in enumerate(value):
            _scan_for_forbidden_state(child, f"{path}[{index}]")


def _parse_hex_color(value: Any, label: str) -> tuple[int, int, int]:
    if not isinstance(value, str):
        raise BattleBundleError(f"{label} must be a hexadecimal color")
    text = value.strip().lstrip("#")
    if not re.fullmatch(r"[0-9A-Fa-f]{6}", text):
        raise BattleBundleError(f"{label} must be a six-digit hexadecimal color")
    return tuple(int(text[index : index + 2], 16) for index in (0, 2, 4))


def _visible_bbox(image: Image.Image, threshold: int = ALPHA_THRESHOLD) -> tuple[int, int, int, int] | None:
    alpha = np.asarray(image.getchannel("A"), dtype=np.uint8)
    ys, xs = np.nonzero(alpha >= threshold)
    if len(xs) == 0:
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def _validate_frame(path: Path, size: int, margin: int, label: str) -> Image.Image:
    try:
        with Image.open(path) as opened:
            if opened.format != "PNG":
                raise BattleBundleError(f"{label} must be PNG: {path}")
            if opened.mode != "RGBA":
                raise BattleBundleError(f"{label} must use explicit RGBA mode: {path}")
            image = opened.copy()
    except (OSError, UnidentifiedImageError) as exc:
        raise BattleBundleError(f"cannot decode {label}: {path}: {exc}") from exc
    if image.size != (size, size):
        raise BattleBundleError(f"{label} must be {size}x{size}, got {image.size}: {path}")
    alpha = np.asarray(image.getchannel("A"), dtype=np.uint8)
    if not np.any(alpha == 0) or not np.any(alpha >= ALPHA_THRESHOLD):
        raise BattleBundleError(f"{label} must contain transparent background and visible subject: {path}")
    bbox = _visible_bbox(image)
    assert bbox is not None
    x0, y0, x1, y1 = bbox
    if x0 < margin or y0 < margin or x1 > size - margin or y1 > size - margin:
        raise BattleBundleError(f"{label} violates {margin}px safety margin (bbox={bbox}): {path}")
    return image


def _clean_resampled_runtime(
    source: Image.Image,
    key: tuple[int, int, int],
    residual_distance: float,
    fringe_cleanup_alpha: int,
) -> Image.Image:
    runtime, _cleaned_fringe = derive_runtime_frame(
        source,
        key,
        residual_distance,
        fringe_cleanup_alpha,
    )
    return runtime


def _validate_manifest(options: InstallOptions) -> dict[str, Any]:
    _require_safe_id(options.form_id, "form id")
    if options.kind not in {"pet", "mounted"}:
        raise BattleBundleError("kind must be pet or mounted")
    if options.archive_mode not in ARCHIVE_MODES:
        raise BattleBundleError(f"archive mode must be one of {ARCHIVE_MODES}")
    if options.kind == "mounted":
        if not options.character_id:
            raise BattleBundleError("mounted bundles require --character")
        _require_safe_id(options.character_id, "character id")
    elif options.character_id:
        raise BattleBundleError("pet bundles may not declare --character")

    staging = options.staging.resolve()
    if not staging.is_dir() or staging.is_symlink():
        raise BattleBundleError(f"staging directory is missing or unsafe: {staging}")
    manifest_path = staging / "bundle-manifest.json"
    _require_file(manifest_path, "bundle manifest")
    manifest = _read_json(manifest_path, "bundle manifest")
    _scan_for_forbidden_state(manifest)

    if manifest.get("schemaVersion") != SCHEMA_VERSION:
        raise BattleBundleError("bundle manifest schemaVersion must be 1")
    if manifest.get("formId") != options.form_id:
        raise BattleBundleError("bundle manifest formId does not match --form")
    if manifest.get("kind") != options.kind:
        raise BattleBundleError("bundle manifest kind does not match --kind")
    if options.kind == "mounted" and manifest.get("characterId") != options.character_id:
        raise BattleBundleError("bundle manifest characterId does not match --character")
    if options.kind == "pet" and manifest.get("characterId") not in {None, ""}:
        raise BattleBundleError("pet bundle manifest may not contain characterId")
    _require_safe_id(str(manifest.get("bundleId", "")), "bundle id")
    if manifest.get("runtimeEnabled") is not False:
        raise BattleBundleError("bundle manifest runtimeEnabled must be false")
    if manifest.get("ownerReviewStatus") != "pending":
        raise BattleBundleError("bundle manifest ownerReviewStatus must be pending")
    if manifest.get("artStatus") not in {"in_production", "owner_review_pending"}:
        raise BattleBundleError("bundle manifest artStatus must remain in production or owner pending")
    if manifest.get("views") != list(FORMAL_VIEWS):
        raise BattleBundleError(f"bundle views must be exactly {list(FORMAL_VIEWS)}")

    declared_actions = manifest.get("actions")
    if not isinstance(declared_actions, dict) or list(declared_actions) != list(ACTION_SPECS):
        raise BattleBundleError("bundle actions must use the canonical 12-action order")
    for action, (frame_count, fps, loop) in ACTION_SPECS.items():
        expected = {"frameCount": frame_count, "fps": fps, "loop": loop}
        if declared_actions.get(action) != expected:
            raise BattleBundleError(f"action contract mismatch for {action}: expected {expected}")

    visual = manifest.get("visualContract")
    if not isinstance(visual, dict):
        raise BattleBundleError("visualContract must be an object")
    if visual.get("runtimeMirroring") is not False:
        raise BattleBundleError("visualContract.runtimeMirroring must be false")
    if options.kind == "mounted":
        if visual.get("integratedWholeFrame") is not True:
            raise BattleBundleError("mounted bundle must declare integratedWholeFrame=true")
        if visual.get("runtimeLayeredComposition") is not False:
            raise BattleBundleError("mounted bundle must declare runtimeLayeredComposition=false")
    elif visual.get("integratedWholeFrame") not in {False, None}:
        raise BattleBundleError("pet bundle may not declare integrated mounted composition")

    provenance = manifest.get("provenance")
    if not isinstance(provenance, dict):
        raise BattleBundleError("provenance must be an object")
    required_provenance = ("generator", "ownership", "sourceOrigin", "replacementPath")
    for field in required_provenance:
        value = provenance.get(field)
        if not isinstance(value, str) or len(value.strip()) < 8:
            raise BattleBundleError(f"provenance.{field} must be a meaningful string")
    if provenance.get("generator") != "OpenAI built-in image generation":
        raise BattleBundleError("provenance.generator must identify the approved built-in generator")

    review = manifest.get("review")
    if not isinstance(review, dict):
        raise BattleBundleError("review must be an object")
    if review.get("selfReviewStatus") != "passed":
        raise BattleBundleError("review.selfReviewStatus must be passed")
    if review.get("ownerReviewStatus") != "pending":
        raise BattleBundleError("review.ownerReviewStatus must be pending")
    return manifest


def _battle_qa_destination(raw: Any, label: str) -> Path:
    """Relocate staging QA paths beneath the installed ``qa/battle`` root.

    Production staging bundles historically use ``qa/actions/...`` while the
    installed bundle keeps all battle evidence beneath ``qa/battle``.  The
    installed QC document must name the installed path, not leak the staging
    layout into runtime-facing provenance.
    """

    if not isinstance(raw, str) or not raw.strip():
        raise BattleBundleError(f"{label} must be a non-empty relative path")
    relative = Path(raw)
    if relative.is_absolute() or ".." in relative.parts or not relative.parts:
        raise BattleBundleError(f"{label} must be a safe relative QA path")
    if relative.parts[:2] == ("qa", "battle"):
        return relative
    if relative.parts[0] != "qa":
        raise BattleBundleError(f"{label} must stay beneath the staging qa directory")
    return Path("qa/battle").joinpath(*relative.parts[1:])


def _validate_qa_image(path: Path, expected_format: str, label: str) -> int:
    try:
        with Image.open(path) as opened:
            if opened.format != expected_format:
                raise BattleBundleError(f"{label} must be {expected_format}: {path}")
            frame_count = getattr(opened, "n_frames", 1)
            opened.seek(frame_count - 1)
            opened.load()
    except (EOFError, OSError, UnidentifiedImageError) as exc:
        raise BattleBundleError(f"invalid {label}: {path}: {exc}") from exc
    return frame_count


def _validate_action_evidence(
    staging: Path,
    qc: dict[str, Any],
) -> tuple[list[CopyEntry], dict[str, Any]]:
    action_evidence = qc.get("actionEvidence")
    installed_qc = copy.deepcopy(qc)
    if action_evidence is None:
        return [], installed_qc
    if not isinstance(action_evidence, list):
        raise BattleBundleError("battle QC actionEvidence must be a list")

    expected_pairs = {
        (view, action) for view in FORMAL_VIEWS for action in ACTION_SPECS
    }
    seen_pairs: set[tuple[str, str]] = set()
    seen_destinations: set[Path] = set()
    copies: list[CopyEntry] = []
    rewritten: list[dict[str, Any]] = []
    for index, raw_evidence in enumerate(action_evidence):
        if not isinstance(raw_evidence, dict):
            raise BattleBundleError(f"battle QC actionEvidence[{index}] must be an object")
        evidence = copy.deepcopy(raw_evidence)
        view = evidence.get("view")
        action = evidence.get("action")
        if not isinstance(view, str) or not isinstance(action, str):
            raise BattleBundleError(
                f"battle QC actionEvidence[{index}] view/action must be strings"
            )
        pair = (view, action)
        if pair not in expected_pairs:
            raise BattleBundleError(
                f"battle QC actionEvidence[{index}] has invalid view/action: {pair}"
            )
        if pair in seen_pairs:
            raise BattleBundleError(f"battle QC actionEvidence duplicates {view}/{action}")
        seen_pairs.add(pair)
        expected_frames = ACTION_SPECS[action][0]
        if evidence.get("frameCount") != expected_frames:
            raise BattleBundleError(
                f"battle QC actionEvidence {view}/{action} frameCount must be {expected_frames}"
            )

        assets = (
            (
                "contactSheet",
                "contactSheetSha256",
                "PNG",
                Path("qa/battle/actions") / view / f"{action}-contact.png",
            ),
            (
                "gif",
                "gifSha256",
                "GIF",
                Path("qa/battle/actions") / view / f"{action}.gif",
            ),
        )
        for path_field, hash_field, image_format, expected_destination in assets:
            source = _safe_relative(
                staging,
                evidence.get(path_field),
                f"actionEvidence[{index}].{path_field}",
            )
            _require_file(source, f"{view}/{action} {path_field}")
            destination = _battle_qa_destination(
                evidence.get(path_field),
                f"actionEvidence[{index}].{path_field}",
            )
            if destination != expected_destination:
                raise BattleBundleError(
                    f"battle QC {view}/{action} {path_field} must install as "
                    f"{expected_destination.as_posix()}"
                )
            if destination in seen_destinations:
                raise BattleBundleError(f"battle QC evidence destination is duplicated: {destination}")
            seen_destinations.add(destination)
            digest = _assert_hash(
                source,
                evidence.get(hash_field),
                f"actionEvidence[{index}].{hash_field}",
            )
            decoded_frames = _validate_qa_image(
                source,
                image_format,
                f"{view}/{action} {path_field}",
            )
            if image_format == "GIF" and decoded_frames != expected_frames:
                raise BattleBundleError(
                    f"battle QC {view}/{action} gif must contain {expected_frames} frames"
                )
            copies.append(CopyEntry(source, destination, digest))
            evidence[path_field] = destination.as_posix()
        rewritten.append(evidence)

    missing = expected_pairs - seen_pairs
    if missing:
        summary = ", ".join(f"{view}/{action}" for view, action in sorted(missing))
        raise BattleBundleError(f"battle QC actionEvidence coverage is incomplete: {summary}")
    installed_qc["actionEvidence"] = rewritten
    return copies, installed_qc


def _validate_overall_qa(
    staging: Path,
    manifest: dict[str, Any],
) -> tuple[list[CopyEntry], list[GeneratedEntry]]:
    review = manifest["review"]
    contact = _safe_relative(staging, review.get("contactSheet"), "review.contactSheet")
    qc_path = _safe_relative(staging, review.get("qcSummary"), "review.qcSummary")
    _require_file(contact, "battle contact sheet")
    _require_file(qc_path, "battle QC summary")
    _assert_hash(contact, review.get("contactSheetSha256"), "review.contactSheetSha256")
    _assert_hash(qc_path, review.get("qcSummarySha256"), "review.qcSummarySha256")
    _validate_qa_image(contact, "PNG", "battle contact sheet")
    qc = _read_json(qc_path, "battle QC summary")
    _scan_for_forbidden_state(qc, "qcSummary")
    expected_frames = sum(value[0] for value in ACTION_SPECS.values()) * len(FORMAL_VIEWS)
    if qc.get("status") != "passed" or qc.get("errors") != []:
        raise BattleBundleError("battle QC summary must have status=passed and errors=[]")
    if qc.get("formId") != manifest["formId"] or qc.get("kind") != manifest["kind"]:
        raise BattleBundleError("battle QC summary identity does not match manifest")
    if qc.get("views") != list(FORMAL_VIEWS) or qc.get("actions") != list(ACTION_SPECS):
        raise BattleBundleError("battle QC summary coverage is incomplete")
    if qc.get("totalFrameCount") != expected_frames:
        raise BattleBundleError(f"battle QC totalFrameCount must be {expected_frames}")
    evidence_copies, installed_qc = _validate_action_evidence(staging, qc)
    qc_payload = _pretty_json_bytes(installed_qc)
    return (
        [
            CopyEntry(contact, Path("qa/battle/contact-sheet.png"), sha256_file(contact)),
            *evidence_copies,
        ],
        [
            GeneratedEntry(
                Path("qa/battle/qc-summary.json"),
                qc_payload,
                sha256_bytes(qc_payload),
            )
        ],
    )


def _validate_action(
    staging: Path,
    view: str,
    action: str,
    frame_count: int,
) -> tuple[list[CopyEntry], list[Image.Image], list[Image.Image], dict[str, str]]:
    action_root = staging / "views" / view / action
    if not action_root.is_dir() or action_root.is_symlink():
        raise BattleBundleError(f"missing action directory: views/{view}/{action}")
    source_meta_path = action_root / "source-meta.json"
    pipeline_path = action_root / "pipeline-meta.json"
    qa_path = action_root / "qa.json"
    for path, label in [
        (source_meta_path, "source metadata"),
        (pipeline_path, "pipeline metadata"),
        (qa_path, "action QC"),
    ]:
        _require_file(path, f"{view}/{action} {label}")
    source_meta = _read_json(source_meta_path, f"{view}/{action} source metadata")
    pipeline = _read_json(pipeline_path, f"{view}/{action} pipeline metadata")
    qa = _read_json(qa_path, f"{view}/{action} action QC")
    for name, value in (("sourceMeta", source_meta), ("pipeline", pipeline), ("actionQc", qa)):
        _scan_for_forbidden_state(value, f"{view}.{action}.{name}")

    if source_meta.get("schemaVersion") != 1:
        raise BattleBundleError(f"{view}/{action} source-meta schemaVersion must be 1")
    if source_meta.get("generator") != "OpenAI built-in image generation":
        raise BattleBundleError(f"{view}/{action} source-meta generator is invalid")
    raw_path = _safe_relative(action_root, source_meta.get("rawArchive"), f"{view}/{action} rawArchive")
    prompt_path = _safe_relative(action_root, source_meta.get("prompt"), f"{view}/{action} prompt")
    declared_pipeline = _safe_relative(
        action_root, source_meta.get("pipelineMetadata"), f"{view}/{action} pipelineMetadata"
    )
    declared_qc = _safe_relative(action_root, source_meta.get("qc"), f"{view}/{action} qc")
    if declared_pipeline != pipeline_path.resolve() or declared_qc != qa_path.resolve():
        raise BattleBundleError(f"{view}/{action} source-meta paths do not reference canonical files")
    if prompt_path != (action_root / "prompt-used.txt").resolve():
        raise BattleBundleError(f"{view}/{action} source-meta prompt must reference prompt-used.txt")
    if raw_path.parent != action_root.resolve() or raw_path.name not in {
        "raw-sheet-lossless.webp",
        "raw-sheet-lossless.png",
    }:
        raise BattleBundleError(
            f"{view}/{action} raw archive must be raw-sheet-lossless.webp or raw-sheet-lossless.png"
        )
    _require_file(raw_path, f"{view}/{action} raw lossless archive")
    _require_file(prompt_path, f"{view}/{action} prompt")
    if len(prompt_path.read_text(encoding="utf-8").strip()) < 40:
        raise BattleBundleError(f"{view}/{action} prompt is missing or too short")
    for path, key in [
        (raw_path, "rawArchiveSha256"),
        (prompt_path, "promptSha256"),
        (pipeline_path, "pipelineSha256"),
        (qa_path, "qcSha256"),
    ]:
        _assert_hash(path, source_meta.get(key), f"{view}/{action} {key}")
    raw_decoded = decoded_rgba_hash(raw_path)
    if raw_decoded != _require_sha(source_meta.get("rawDecodedRgbaSha256"), f"{view}/{action} rawDecodedRgbaSha256"):
        raise BattleBundleError(f"{view}/{action} raw decoded RGBA hash mismatch")
    original_decoded = _require_sha(
        source_meta.get("originalGeneratedDecodedRgbaSha256"),
        f"{view}/{action} originalGeneratedDecodedRgbaSha256",
    )
    if raw_decoded != original_decoded:
        raise BattleBundleError(f"{view}/{action} raw archive is not a lossless decoded copy of the generated input")
    original_hash = _require_sha(source_meta.get("originalGeneratedSha256"), f"{view}/{action} originalGeneratedSha256")

    if pipeline.get("schemaVersion") != 1 or pipeline.get("tool") != "build_pet_art_bundle.py":
        raise BattleBundleError(f"{view}/{action} pipeline must come from build_pet_art_bundle.py schema 1")
    if pipeline.get("inputSha256") != original_hash:
        raise BattleBundleError(f"{view}/{action} pipeline input hash does not match source provenance")
    if pipeline.get("sourceFrameSize") != SOURCE_FRAME_SIZE or pipeline.get("runtimeFrameSize") != RUNTIME_FRAME_SIZE:
        raise BattleBundleError(f"{view}/{action} pipeline frame sizes must be 512/256")
    slots = [f"{action}-{index}" for index in range(1, frame_count + 1)]
    if pipeline.get("slots") != slots:
        raise BattleBundleError(f"{view}/{action} pipeline slots must be {slots}")
    frame_meta = pipeline.get("frames")
    if not isinstance(frame_meta, list) or len(frame_meta) != frame_count:
        raise BattleBundleError(f"{view}/{action} pipeline frame metadata count mismatch")
    safe_margin = pipeline.get("safeMargin")
    source_margin = pipeline.get("effectiveSourceMargin")
    if not isinstance(safe_margin, int) or safe_margin < 4:
        raise BattleBundleError(f"{view}/{action} pipeline safeMargin must be at least 4")
    if not isinstance(source_margin, int) or source_margin < safe_margin:
        raise BattleBundleError(f"{view}/{action} pipeline effectiveSourceMargin is invalid")
    key = _parse_hex_color(pipeline.get("key"), f"{view}/{action} pipeline key")
    residual_distance = pipeline.get("residualMagentaDistance")
    fringe_alpha = pipeline.get("fringeCleanupAlpha")
    if not isinstance(residual_distance, (int, float)) or residual_distance < 0:
        raise BattleBundleError(f"{view}/{action} residualMagentaDistance is invalid")
    if not isinstance(fringe_alpha, int) or not 1 <= fringe_alpha <= 127:
        raise BattleBundleError(f"{view}/{action} fringeCleanupAlpha is invalid")

    if qa.get("schemaVersion") != 1 or qa.get("status") != "passed":
        raise BattleBundleError(f"{view}/{action} action QC must have schemaVersion=1 and status=passed")
    if qa.get("view") != view or qa.get("action") != action or qa.get("frameCount") != frame_count:
        raise BattleBundleError(f"{view}/{action} action QC identity/count mismatch")
    for field in ("errors", "emptyFrames", "duplicateFrames", "edgeTouchFrames", "identityDriftFrames"):
        if qa.get(field) != []:
            raise BattleBundleError(f"{view}/{action} action QC {field} must be []")

    copies: list[CopyEntry] = []
    source_images: list[Image.Image] = []
    runtime_images: list[Image.Image] = []
    hashes: dict[str, str] = {}
    seen_source: set[str] = set()
    seen_runtime: set[str] = set()
    for index, (slot, metadata) in enumerate(zip(slots, frame_meta, strict=True), start=1):
        if not isinstance(metadata, dict) or metadata.get("slot") != slot:
            raise BattleBundleError(f"{view}/{action} pipeline slot metadata mismatch at {index}")
        source_path = action_root / "source-frames" / f"{action}-{index}.png"
        runtime_path = action_root / "runtime-frames" / f"{action}-{index}.png"
        _require_file(source_path, f"{view}/{action} source frame {index}")
        _require_file(runtime_path, f"{view}/{action} runtime frame {index}")
        source_image = _validate_frame(source_path, SOURCE_FRAME_SIZE, source_margin, "source frame")
        runtime_image = _validate_frame(runtime_path, RUNTIME_FRAME_SIZE, safe_margin, "runtime frame")
        source_digest = rgba_hash(source_image)
        runtime_digest = rgba_hash(runtime_image)
        if source_digest != _require_sha(metadata.get("sourceRgbaSha256"), f"{view}/{action}/{slot} source hash"):
            raise BattleBundleError(f"{view}/{action}/{slot} source hash does not match pipeline")
        if runtime_digest != _require_sha(metadata.get("runtimeRgbaSha256"), f"{view}/{action}/{slot} runtime hash"):
            raise BattleBundleError(f"{view}/{action}/{slot} runtime hash does not match pipeline")
        if source_digest in seen_source or runtime_digest in seen_runtime:
            raise BattleBundleError(f"{view}/{action} contains duplicate frame content at {slot}")
        seen_source.add(source_digest)
        seen_runtime.add(runtime_digest)
        expected_runtime = _clean_resampled_runtime(source_image, key, float(residual_distance), fringe_alpha)
        if rgba_hash(expected_runtime) != runtime_digest:
            raise BattleBundleError(f"{view}/{action}/{slot} runtime is not deterministically derived from source")
        source_images.append(source_image)
        runtime_images.append(runtime_image)

        runtime_relative = Path("views") / view / action / f"{action}-{index}.png"
        source_relative = Path("source/battle") / view / action / "source-frames" / f"{action}-{index}.png"
        copies.extend(
            [
                CopyEntry(runtime_path, runtime_relative, sha256_file(runtime_path)),
                CopyEntry(source_path, source_relative, sha256_file(source_path)),
            ]
        )
        hashes[str(runtime_relative)] = sha256_file(runtime_path)
        hashes[str(source_relative)] = sha256_file(source_path)

    provenance_root = Path("source/battle") / view / action
    for source, name in [
        (raw_path, "raw-sheet-lossless" + raw_path.suffix.lower()),
        (prompt_path, "prompt-used.txt"),
        (pipeline_path, "pipeline-meta.json"),
        (source_meta_path, "source-meta.json"),
        (qa_path, "qa.json"),
    ]:
        relative = provenance_root / name
        copies.append(CopyEntry(source, relative, sha256_file(source)))
        hashes[str(relative)] = sha256_file(source)
    return copies, source_images, runtime_images, hashes


def _reject_mirrored_views(
    front: dict[str, list[Image.Image]],
    back: dict[str, list[Image.Image]],
) -> None:
    for action in ACTION_SPECS:
        for index, (front_image, back_image) in enumerate(zip(front[action], back[action], strict=True), start=1):
            if rgba_hash(front_image) == rgba_hash(back_image):
                raise BattleBundleError(
                    f"back_3quarter_ne/{action}-{index} duplicates front_3quarter_sw instead of an authored back view"
                )
            mirrored = front_image.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
            if rgba_hash(mirrored) == rgba_hash(back_image):
                raise BattleBundleError(
                    f"back_3quarter_ne/{action}-{index} is an exact mirror of front_3quarter_sw"
                )


def validate_down_revive_continuity(
    frame_images: dict[str, dict[str, list[Image.Image]]],
    *,
    frame_kind: str,
) -> None:
    """Require revive to begin from the exact held KO frame in both views."""

    for view in FORMAL_VIEWS:
        try:
            down_hold = frame_images[view]["down"][-1]
            revive_start = frame_images[view]["revive"][0]
        except (KeyError, IndexError) as exc:
            raise BattleBundleError(
                f"{frame_kind} {view} down/revive continuity frames are missing"
            ) from exc
        if rgba_hash(down_hold) != rgba_hash(revive_start):
            raise BattleBundleError(
                f"{frame_kind} {view} down-8 must exactly match revive-1 RGBA"
            )


def _bundle_digest(manifest: dict[str, Any], hashes: dict[str, str]) -> str:
    payload = {"manifest": manifest, "installedFileHashes": dict(sorted(hashes.items()))}
    return hashlib.sha256(_json_bytes(payload)).hexdigest()


def validate_bundle(options: InstallOptions) -> ValidatedBundle:
    manifest = _validate_manifest(options)
    staging = options.staging.resolve()
    copies, generated = _validate_overall_qa(staging, manifest)
    source_frame_images: dict[str, dict[str, list[Image.Image]]] = {
        view: {} for view in FORMAL_VIEWS
    }
    runtime_frame_images: dict[str, dict[str, list[Image.Image]]] = {
        view: {} for view in FORMAL_VIEWS
    }
    all_hashes = {str(entry.destination_relative): entry.sha256 for entry in copies}
    all_hashes.update(
        {str(entry.destination_relative): entry.sha256 for entry in generated}
    )
    for view in FORMAL_VIEWS:
        for action, (frame_count, _fps, _loop) in ACTION_SPECS.items():
            action_copies, source_images, runtime_images, action_hashes = _validate_action(
                staging, view, action, frame_count
            )
            copies.extend(action_copies)
            all_hashes.update(action_hashes)
            source_frame_images[view][action] = source_images
            runtime_frame_images[view][action] = runtime_images
    _reject_mirrored_views(
        runtime_frame_images[FORMAL_VIEWS[0]],
        runtime_frame_images[FORMAL_VIEWS[1]],
    )
    validate_down_revive_continuity(runtime_frame_images, frame_kind="runtime")
    validate_down_revive_continuity(source_frame_images, frame_kind="source")
    digest = _bundle_digest(manifest, all_hashes)
    action_metadata = {
        action: {
            "frameCount": frame_count,
            "fps": fps,
            "loop": loop,
            "status": "owner_review_pending",
        }
        for action, (frame_count, fps, loop) in ACTION_SPECS.items()
    }
    return ValidatedBundle(manifest, copies, generated, all_hashes, digest, action_metadata)


def _copies_for_archive_mode(validated: ValidatedBundle, archive_mode: str) -> list[CopyEntry]:
    if archive_mode == "full":
        return list(validated.copies)
    selected: list[CopyEntry] = []
    for entry in validated.copies:
        relative = entry.destination_relative
        parts = relative.parts
        if parts and parts[0] == "views":
            selected.append(entry)
            continue
        if len(parts) >= 2 and parts[:2] == ("qa", "battle"):
            selected.append(entry)
            continue
        if len(parts) < 5 or parts[:2] != ("source", "battle"):
            continue
        action = parts[3]
        name = parts[-1]
        if name in {"prompt-used.txt", "pipeline-meta.json", "qa.json"}:
            selected.append(entry)
        elif action == "idle" and (
            name == "source-meta.json" or name.startswith("raw-sheet-lossless.")
        ):
            # One lossless authored source sheet per independently generated view
            # remains in Git as a visual/provenance canary.  All other complete
            # source intermediates stay in the validated local production archive
            # and are represented by immutable hashes in source-ledger.json.
            selected.append(entry)
    return selected


def _lean_source_ledger(staging: Path, manifest: dict[str, Any]) -> dict[str, Any]:
    actions: dict[str, dict[str, Any]] = {}
    for view in FORMAL_VIEWS:
        view_actions: dict[str, Any] = {}
        for action in ACTION_SPECS:
            action_root = staging / "views" / view / action
            source_meta = _read_json(action_root / "source-meta.json", f"{view}/{action} source metadata")
            pipeline = _read_json(action_root / "pipeline-meta.json", f"{view}/{action} pipeline metadata")
            frame_meta = pipeline.get("frames")
            if not isinstance(frame_meta, list):
                raise BattleBundleError(f"{view}/{action} pipeline frame metadata is missing")
            view_actions[action] = {
                "originalGeneratedSha256": source_meta["originalGeneratedSha256"],
                "originalGeneratedDecodedRgbaSha256": source_meta[
                    "originalGeneratedDecodedRgbaSha256"
                ],
                "rawArchiveSha256": source_meta["rawArchiveSha256"],
                "rawDecodedRgbaSha256": source_meta["rawDecodedRgbaSha256"],
                "promptSha256": source_meta["promptSha256"],
                "pipelineSha256": source_meta["pipelineSha256"],
                "qcSha256": source_meta["qcSha256"],
                "sourceFrameRgbaSha256": [frame["sourceRgbaSha256"] for frame in frame_meta],
                "runtimeFrameRgbaSha256": [frame["runtimeRgbaSha256"] for frame in frame_meta],
                "representativeRawTracked": action == "idle",
                "sourceFramesTracked": False,
            }
        actions[view] = view_actions
    return {
        "schemaVersion": 1,
        "archiveMode": "lean",
        "formId": manifest["formId"],
        "kind": manifest["kind"],
        "characterId": manifest.get("characterId"),
        "generator": manifest["provenance"]["generator"],
        "sourceOrigin": manifest["provenance"]["sourceOrigin"],
        "ownership": manifest["provenance"]["ownership"],
        "replacementPath": manifest["provenance"]["replacementPath"],
        "fullSourceValidationRequiredBeforeInstall": True,
        "repositoryPolicy": (
            "Runtime frames and compact provenance are tracked. Reproducible 512px frame splits and "
            "duplicate clean/raw intermediates remain in the local production archive."
        ),
        "actions": actions,
    }


def _build_target_metadata(
    existing: dict[str, Any],
    options: InstallOptions,
    validated: ValidatedBundle,
) -> dict[str, Any]:
    result = copy.deepcopy(existing)
    _scan_for_forbidden_state(result, "destinationMetadata")
    if result.get("runtimeEnabled") not in {None, False}:
        raise BattleBundleError("destination metadata is runtime-enabled; use an isolated destination")
    identity_key = "formId" if options.kind == "pet" else "mountFormId"
    existing_identity = result.get(identity_key)
    if existing_identity not in {None, options.form_id}:
        raise BattleBundleError(f"destination metadata {identity_key} does not match --form")
    if options.kind == "mounted" and result.get("characterId") not in {None, options.character_id}:
        raise BattleBundleError("destination metadata characterId does not match --character")

    result.setdefault("schemaVersion", 1)
    result[identity_key] = options.form_id
    if options.kind == "mounted":
        result["characterId"] = options.character_id
    result["artStatus"] = "in_production"
    result["productionScope"] = "formal_battle_two_view_owner_review_pending"
    result["runtimeEnabled"] = False
    result["runtimeFrameSize"] = [RUNTIME_FRAME_SIZE, RUNTIME_FRAME_SIZE]
    result["views"] = list(FORMAL_VIEWS)
    result["actions"] = validated.action_metadata
    result["battleViewMapping"] = copy.deepcopy(CANONICAL_BATTLE_VIEW_MAPPING)
    result["battleVisual"] = {
        "status": "owner_review_pending",
        "kind": options.kind,
        "views": list(FORMAL_VIEWS),
        "battleViewMapping": copy.deepcopy(CANONICAL_BATTLE_VIEW_MAPPING),
        "actions": list(ACTION_SPECS),
        "sourceFrameSize": [SOURCE_FRAME_SIZE, SOURCE_FRAME_SIZE],
        "runtimeFrameSize": [RUNTIME_FRAME_SIZE, RUNTIME_FRAME_SIZE],
        "totalFrameCount": sum(value[0] for value in ACTION_SPECS.values()) * len(FORMAL_VIEWS),
        "runtimeMirroring": False,
        "integratedWholeFrame": options.kind == "mounted",
        "runtimeLayeredComposition": False,
        "runtimeEnabled": False,
        "bundleDigest": validated.bundle_digest,
        "archiveMode": options.archive_mode,
        "sourceFramesTracked": options.archive_mode == "full",
        "sourceRoot": "source/battle",
        "sourceLedger": "source/battle/source-ledger.json" if options.archive_mode == "lean" else "",
        "runtimeRoot": "views",
        "contactSheet": "qa/battle/contact-sheet.png",
        "qcSummary": "qa/battle/qc-summary.json",
    }
    result["ownerReviewStatus"] = "pending"
    return result


def _read_existing_metadata(destination: Path) -> dict[str, Any]:
    path = destination / "action-bundle-meta.json"
    if not path.exists():
        return {}
    if path.is_symlink():
        raise BattleBundleError("destination action-bundle-meta.json may not be a symlink")
    return _read_json(path, "destination action bundle metadata")


def _destination_has_symlink(destination: Path) -> bool:
    if destination.is_symlink():
        return True
    return destination.exists() and any(path.is_symlink() for path in destination.rglob("*"))


def _is_already_installed(
    destination: Path,
    validated: ValidatedBundle,
    expected_metadata: dict[str, Any],
    installed_hashes: dict[str, str],
    archive_mode: str,
) -> bool:
    install_manifest_path = destination / "source/battle/install-manifest.json"
    metadata_path = destination / "action-bundle-meta.json"
    if not install_manifest_path.is_file() or not metadata_path.is_file():
        return False
    install_manifest = _read_json(install_manifest_path, "installed battle manifest")
    if install_manifest.get("bundleDigest") != validated.bundle_digest:
        return False
    if install_manifest.get("archiveMode") != archive_mode:
        return False
    if install_manifest.get("validatedSourceFileHashes") != dict(
        sorted(validated.frame_hashes.items())
    ):
        return False
    if _read_json(metadata_path, "destination action bundle metadata") != expected_metadata:
        return False
    recorded_hashes = install_manifest.get("installedFileHashes")
    if recorded_hashes != dict(sorted(installed_hashes.items())):
        return False
    for relative, expected in recorded_hashes.items():
        path = destination / relative
        if not path.is_file() or path.is_symlink() or sha256_file(path) != expected:
            return False
    return True


def _atomic_swap(
    replacement: Path,
    destination: Path,
    after_backup: Callable[[], None] | None = None,
) -> None:
    backup = destination.parent / f".{destination.name}.backup-{secrets.token_hex(8)}"
    had_destination = destination.exists()
    try:
        if had_destination:
            os.rename(destination, backup)
        if after_backup is not None:
            after_backup()
        os.rename(replacement, destination)
    except BaseException:
        if destination.exists() and not had_destination:
            shutil.rmtree(destination, ignore_errors=True)
        if had_destination and backup.exists() and not destination.exists():
            os.rename(backup, destination)
        raise
    else:
        if backup.exists():
            shutil.rmtree(backup)


def install_bundle(
    options: InstallOptions,
    *,
    after_backup: Callable[[], None] | None = None,
) -> dict[str, Any]:
    validated = validate_bundle(options)
    selected_copies = _copies_for_archive_mode(validated, options.archive_mode)
    source_ledger = (
        _lean_source_ledger(options.staging.resolve(), validated.manifest)
        if options.archive_mode == "lean"
        else None
    )
    installed_hashes = {
        str(entry.destination_relative): entry.sha256 for entry in selected_copies
    }
    installed_hashes.update(
        {str(entry.destination_relative): entry.sha256 for entry in validated.generated}
    )
    if source_ledger is not None:
        installed_hashes["source/battle/source-ledger.json"] = sha256_bytes(
            _pretty_json_bytes(source_ledger)
        )
    destination = options.destination.resolve()
    staging = options.staging.resolve()
    if destination == staging or destination in staging.parents or staging in destination.parents:
        raise BattleBundleError("staging and destination must be isolated from each other")
    if _destination_has_symlink(destination):
        raise BattleBundleError("destination tree may not contain symlinks")
    destination.parent.mkdir(parents=True, exist_ok=True)
    existing = _read_existing_metadata(destination) if destination.exists() else {}
    expected_metadata = _build_target_metadata(existing, options, validated)
    already_installed = destination.exists() and _is_already_installed(
        destination,
        validated,
        expected_metadata,
        installed_hashes,
        options.archive_mode,
    )
    summary = {
        "status": "ok",
        "tool": TOOL_NAME,
        "schemaVersion": SCHEMA_VERSION,
        "formId": options.form_id,
        "kind": options.kind,
        "characterId": options.character_id,
        "views": list(FORMAL_VIEWS),
        "actions": list(ACTION_SPECS),
        "frameCount": sum(value[0] for value in ACTION_SPECS.values()) * len(FORMAL_VIEWS),
        "bundleDigest": validated.bundle_digest,
        "archiveMode": options.archive_mode,
        "trackedSourceFrames": options.archive_mode == "full",
        "installedFileCount": len(installed_hashes),
        "destination": str(destination),
        "dryRun": options.dry_run,
        "changed": not already_installed,
        "runtimeEnabled": False,
        "ownerReviewStatus": "pending",
    }
    if options.dry_run or already_installed:
        return summary

    replacement = Path(tempfile.mkdtemp(prefix=f".{destination.name}.install-", dir=destination.parent))
    try:
        if destination.exists():
            shutil.copytree(destination, replacement, dirs_exist_ok=True)
        battle_qa_root = replacement / "qa/battle"
        if battle_qa_root.exists():
            if battle_qa_root.is_symlink():
                raise BattleBundleError(f"refusing to replace symlink: {battle_qa_root}")
            shutil.rmtree(battle_qa_root)
        for view in FORMAL_VIEWS:
            for action in ACTION_SPECS:
                for relative in (
                    Path("views") / view / action,
                    Path("source/battle") / view / action,
                ):
                    target = replacement / relative
                    if target.exists():
                        if target.is_symlink():
                            raise BattleBundleError(f"refusing to replace symlink: {target}")
                        shutil.rmtree(target)
        for entry in selected_copies:
            target = replacement / entry.destination_relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(entry.source, target)
            if sha256_file(target) != entry.sha256:
                raise BattleBundleError(f"copy verification failed: {entry.destination_relative}")
        for entry in validated.generated:
            target = replacement / entry.destination_relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(entry.payload)
            if sha256_file(target) != entry.sha256:
                raise BattleBundleError(f"generated file verification failed: {entry.destination_relative}")
        if source_ledger is not None:
            ledger_path = replacement / "source/battle/source-ledger.json"
            _write_json(ledger_path, source_ledger)
            if sha256_file(ledger_path) != installed_hashes[str(ledger_path.relative_to(replacement))]:
                raise BattleBundleError("copy verification failed: source/battle/source-ledger.json")
        _write_json(replacement / "action-bundle-meta.json", expected_metadata)
        install_manifest = {
            "schemaVersion": 1,
            "tool": TOOL_NAME,
            "formId": options.form_id,
            "kind": options.kind,
            "characterId": options.character_id,
            "bundleDigest": validated.bundle_digest,
            "archiveMode": options.archive_mode,
            "installedFileHashes": dict(sorted(installed_hashes.items())),
            "validatedSourceFileHashes": dict(sorted(validated.frame_hashes.items())),
            "runtimeEnabled": False,
            "ownerReviewStatus": "pending",
        }
        _write_json(replacement / "source/battle/install-manifest.json", install_manifest)
        _atomic_swap(replacement, destination, after_backup)
    finally:
        if replacement.exists():
            shutil.rmtree(replacement, ignore_errors=True)
    return summary


def parse_args(argv: Iterable[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--staging", type=Path, required=True)
    parser.add_argument("--destination", type=Path, required=True)
    parser.add_argument("--form", required=True, dest="form_id")
    parser.add_argument("--kind", required=True, choices=("pet", "mounted"))
    parser.add_argument("--character", dest="character_id")
    parser.add_argument(
        "--archive-mode",
        choices=ARCHIVE_MODES,
        default="lean",
        help=(
            "lean validates the complete source bundle but tracks only runtime art and compact provenance; "
            "full also installs every 512px frame and raw sheet"
        ),
    )
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--json", action="store_true", dest="json_stdout")
    parser.add_argument("--json-out", type=Path)
    return parser.parse_args(argv)


def main(argv: Iterable[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        summary = install_bundle(
            InstallOptions(
                staging=args.staging,
                destination=args.destination,
                form_id=args.form_id,
                kind=args.kind,
                character_id=args.character_id,
                dry_run=args.dry_run,
                archive_mode=args.archive_mode,
            )
        )
    except (BattleBundleError, OSError, UnicodeError, UnidentifiedImageError) as exc:
        summary = {"status": "failed", "tool": TOOL_NAME, "error": str(exc)}
        if args.json_stdout:
            print(json.dumps(summary, ensure_ascii=False, sort_keys=True))
        else:
            print(f"error: {exc}")
        if args.json_out:
            _write_json(args.json_out, summary)
        return 1
    if args.json_stdout:
        print(json.dumps(summary, ensure_ascii=False, sort_keys=True))
    else:
        print(
            f"battle bundle {summary['status']}: {summary['formId']} {summary['kind']} "
            f"frames={summary['frameCount']} changed={str(summary['changed']).lower()} "
            f"archive={summary['archiveMode']} dry_run={str(summary['dryRun']).lower()} "
            "owner=pending runtime=false"
        )
    if args.json_out:
        _write_json(args.json_out, summary)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
