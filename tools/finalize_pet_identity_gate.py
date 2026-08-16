#!/usr/bin/env python3
"""Finalize an existing pet identity-key-pose bundle without inventing art.

This tool is deliberately narrow: it validates a hash-bound 2x2 RGBA identity
board, four unique 512px poses, canonical builder metadata, and independent
self-review evidence before archiving the generated PNG as a lossless WebP.
It then writes the standard incomplete action manifest used by the owner-review
identity gate.  It never creates poses, enables runtime art, or marks owner
approval, and it refuses to overwrite an approved or runtime-enabled bundle.
"""

from __future__ import annotations

import argparse
from contextlib import contextmanager, nullcontext
from copy import deepcopy
import hashlib
import json
import math
import os
from pathlib import Path
import shutil
import sys
import tempfile
from typing import Any, Callable, Iterator

from PIL import Image

TOOLS_DIR = Path(__file__).resolve().parent
if str(TOOLS_DIR) not in sys.path:
    sys.path.insert(0, str(TOOLS_DIR))
import build_pet_art_bundle as pet_art_builder


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CATALOG = REPO_ROOT / "client/godot/data/pet_art_catalog.json"
IDENTITY_BOARD_SIZE = (1024, 1024)
IDENTITY_POSE_SIZE = (
    pet_art_builder.SOURCE_FRAME_SIZE,
    pet_art_builder.SOURCE_FRAME_SIZE,
)
RUNTIME_FRAME_SIZE = pet_art_builder.RUNTIME_FRAME_SIZE
MIN_RAW_SOURCE_EDGE = 512
MAX_RAW_SOURCE_PIXELS = 40_000_000
MAX_CONTACT_SHEET_PIXELS = 16_000_000
MIN_ALPHA_COVERAGE = 0.01
ALPHA_THRESHOLD = 8
MIN_SOURCE_SAFE_MARGIN = 4
PIPELINE_SCHEMA_VERSION = pet_art_builder.SCHEMA_VERSION
PIPELINE_TOOL = pet_art_builder.TOOL_NAME
PIPELINE_REPLAY_CONTRACT_VERSION = (
    pet_art_builder.REPLAY_CONTRACT_VERSION
)
METADATA_REPLAY_DIGEST_CONTRACT_VERSION = 2
SELF_REVIEW_SCHEMA_VERSION = 1
SELF_REVIEW_FILENAME = "identity-key-pose-qc.json"
IDENTITY_POSES = [
    "front_3quarter_sw",
    "back_3quarter_ne",
    "south",
    "west",
]

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

CANONICAL_DIRECTIONS = [
    "south",
    "southwest",
    "west",
    "northwest",
    "north",
    "northeast",
    "east",
    "southeast",
]


class FinalizeError(RuntimeError):
    """Raised when an identity bundle cannot be finalized safely."""


def display_path(path: Path) -> str:
    try:
        return str(path.relative_to(REPO_ROOT))
    except ValueError:
        return str(path)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def decoded_rgba_sha256(path: Path) -> str:
    with Image.open(path) as image:
        rgba = image.convert("RGBA")
        payload = rgba.tobytes()
    return hashlib.sha256(payload).hexdigest()


def canonical_rgba_sha256(path: Path) -> str:
    with Image.open(path) as image:
        rgba = image.convert("RGBA")
        digest = hashlib.sha256()
        digest.update(f"{rgba.width}x{rgba.height}:RGBA\n".encode("ascii"))
        digest.update(rgba.tobytes())
    return digest.hexdigest()


def inspect_raw_source_png(path: Path) -> dict[str, Any]:
    try:
        with Image.open(path) as image:
            if image.format != "PNG":
                raise FinalizeError(
                    f"raw identity source must decode as PNG: "
                    f"{display_path(path)}"
                )
            if image.mode not in {"RGB", "RGBA"}:
                raise FinalizeError(
                    f"raw identity source must use RGB or RGBA mode, got "
                    f"{image.mode}: {display_path(path)}"
                )
            if min(image.size) < MIN_RAW_SOURCE_EDGE:
                raise FinalizeError(
                    f"raw identity source must be at least "
                    f"{MIN_RAW_SOURCE_EDGE}px on both axes, got {image.size}: "
                    f"{display_path(path)}"
                )
            pixel_count = image.width * image.height
            if pixel_count > MAX_RAW_SOURCE_PIXELS:
                raise FinalizeError(
                    f"raw identity source exceeds {MAX_RAW_SOURCE_PIXELS} "
                    f"pixels, got {pixel_count}: {display_path(path)}"
                )
            image.load()
            size = [image.width, image.height]
            mode = image.mode
    except FinalizeError:
        raise
    except (OSError, ValueError) as exc:
        raise FinalizeError(
            f"cannot decode raw identity source: {display_path(path)}"
        ) from exc

    return {
        "format": "PNG",
        "mode": mode,
        "pixelSize": size,
        "fileSha256": sha256_file(path),
        "decodedRgbaPixelSha256": decoded_rgba_sha256(path),
        "canonicalRgbaSha256": canonical_rgba_sha256(path),
    }


def inspect_transparent_png(
    path: Path,
    expected_size: tuple[int, int],
    label: str,
    *,
    safe_margin: int = 0,
) -> dict[str, Any]:
    try:
        with Image.open(path) as image:
            image.load()
            relative_path = display_path(path)
            if image.format != "PNG":
                raise FinalizeError(
                    f"{label} must decode as PNG: {relative_path}"
                )
            if image.mode != "RGBA":
                raise FinalizeError(
                    f"{label} must use explicit RGBA mode, got "
                    f"{image.mode}: {relative_path}"
                )
            if image.size != expected_size:
                raise FinalizeError(
                    f"{label} must be {expected_size[0]}x{expected_size[1]}, "
                    f"got {image.width}x{image.height}: {relative_path}"
                )
            alpha_histogram = image.getchannel("A").histogram()
            transparent_pixels = alpha_histogram[0]
            partial_alpha_pixels = sum(alpha_histogram[1:255])
            opaque_pixels = alpha_histogram[255]
            alpha_positive_pixels = partial_alpha_pixels + opaque_pixels
            visible_pixels = sum(alpha_histogram[ALPHA_THRESHOLD:])
            total_pixels = image.width * image.height
            pixels = (
                image.get_flattened_data()
                if hasattr(image, "get_flattened_data")
                else image.getdata()
            )
            transparent_rgb_leak_pixels = sum(
                1
                for red, green, blue, alpha in pixels
                if alpha == 0 and (red != 0 or green != 0 or blue != 0)
            )
            visible_mask = image.getchannel("A").point(
                lambda value: 255 if value >= ALPHA_THRESHOLD else 0
            )
            visible_bbox = visible_mask.getbbox()
    except FinalizeError:
        raise
    except (OSError, ValueError) as exc:
        raise FinalizeError(
            f"cannot decode {label}: {display_path(path)}"
        ) from exc

    minimum_pixels = max(1, int(total_pixels * MIN_ALPHA_COVERAGE))
    if transparent_pixels < minimum_pixels:
        raise FinalizeError(
            f"{label} needs real transparent background coverage "
            f"(minimum {minimum_pixels}, got {transparent_pixels}): "
            f"{display_path(path)}"
        )
    if transparent_rgb_leak_pixels:
        raise FinalizeError(
            f"{label} has {transparent_rgb_leak_pixels} non-zero RGB pixels "
            f"under fully transparent alpha: {display_path(path)}"
        )
    if visible_pixels < minimum_pixels or visible_bbox is None:
        raise FinalizeError(
            f"{label} needs non-empty subject coverage "
            f"at alpha >= {ALPHA_THRESHOLD} "
            f"(minimum {minimum_pixels}, got {visible_pixels}): "
            f"{display_path(path)}"
        )
    if safe_margin:
        x0, y0, x1, y1 = visible_bbox
        if (
            x0 < safe_margin
            or y0 < safe_margin
            or x1 > expected_size[0] - safe_margin
            or y1 > expected_size[1] - safe_margin
        ):
            raise FinalizeError(
                f"{label} violates {safe_margin}px safety margin "
                f"(bbox={visible_bbox}): {display_path(path)}"
            )

    return {
        "format": "PNG",
        "mode": "RGBA",
        "pixelSize": [expected_size[0], expected_size[1]],
        "fileSha256": sha256_file(path),
        "decodedRgbaPixelSha256": decoded_rgba_sha256(path),
        "canonicalRgbaSha256": canonical_rgba_sha256(path),
        "transparentPixelCount": transparent_pixels,
        "partialAlphaPixelCount": partial_alpha_pixels,
        "opaquePixelCount": opaque_pixels,
        "alphaPositivePixelCount": alpha_positive_pixels,
        "visiblePixelCount": visible_pixels,
        "transparentRgbLeakPixelCount": transparent_rgb_leak_pixels,
        "visibleAlphaThreshold": ALPHA_THRESHOLD,
        "visibleBbox": list(visible_bbox),
        "safeMargin": safe_margin,
    }


def inspect_identity_board_composition(
    board_path: Path,
    pose_paths: dict[str, Path],
) -> None:
    with Image.open(board_path) as opened:
        board = opened.copy()
    expected = Image.new("RGBA", IDENTITY_BOARD_SIZE, (0, 0, 0, 0))
    for index, pose in enumerate(IDENTITY_POSES):
        with Image.open(pose_paths[pose]) as opened:
            pose_image = opened.copy()
        expected.paste(
            pose_image,
            ((index % 2) * IDENTITY_POSE_SIZE[0], (index // 2) * IDENTITY_POSE_SIZE[1]),
        )
    if board.tobytes() != expected.tobytes():
        raise FinalizeError(
            f"transparent identity board is not the exact 2x2 composition "
            f"of declared poses: {display_path(board_path)}"
        )


def load_pipeline_metadata(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as exc:
        raise FinalizeError(
            f"invalid pipeline metadata JSON: {display_path(path)}"
        ) from exc
    if not isinstance(payload, dict):
        raise FinalizeError(
            f"pipeline metadata must be a JSON object: "
            f"{display_path(path)}"
        )
    if (
        type(payload.get("schemaVersion")) is not int
        or payload["schemaVersion"] != PIPELINE_SCHEMA_VERSION
        or type(payload.get("tool")) is not str
        or payload["tool"] != PIPELINE_TOOL
        or type(payload.get("replayContractVersion")) is not int
        or payload["replayContractVersion"]
        != PIPELINE_REPLAY_CONTRACT_VERSION
    ):
        raise FinalizeError(
            f"pipeline metadata must come from {PIPELINE_TOOL} schema "
            f"{PIPELINE_SCHEMA_VERSION} with replay contract "
            f"{PIPELINE_REPLAY_CONTRACT_VERSION}: {display_path(path)}"
        )
    return payload


def normalized_pipeline_metadata(
    payload: dict[str, Any],
    raw_png: Path,
) -> dict[str, Any]:
    normalized = deepcopy(payload)
    normalized["input"] = str(raw_png.resolve())
    return normalized


def checkout_portable_pipeline_metadata_replay_sha256(
    replay_metadata: dict[str, Any],
    raw_png: Path,
) -> str:
    """Hash strict replay metadata without binding it to one checkout path."""

    resolved_raw = raw_png.resolve()
    try:
        portable_input = resolved_raw.relative_to(
            REPO_ROOT.resolve()
        ).as_posix()
    except ValueError as exc:
        raise FinalizeError(
            "pipeline replay input must stay under the repository root"
        ) from exc
    if replay_metadata.get("input") != str(resolved_raw):
        raise FinalizeError(
            "pipeline replay metadata input must match the resolved raw PNG"
        )
    portable_metadata = deepcopy(replay_metadata)
    portable_metadata["input"] = portable_input
    payload = (
        json.dumps(
            portable_metadata,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        )
        + "\n"
    ).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def strict_json_equal(left: Any, right: Any) -> bool:
    if type(left) is not type(right):
        return False
    if isinstance(left, dict):
        return (
            set(left) == set(right)
            and all(strict_json_equal(left[key], right[key]) for key in left)
        )
    if isinstance(left, list):
        return len(left) == len(right) and all(
            strict_json_equal(left_item, right_item)
            for left_item, right_item in zip(left, right, strict=True)
        )
    return left == right


def assert_same_rgba(
    expected_path: Path,
    actual_path: Path,
    label: str,
) -> None:
    try:
        with Image.open(expected_path) as expected_opened:
            expected = expected_opened.convert("RGBA")
            expected.load()
        with Image.open(actual_path) as actual_opened:
            actual = actual_opened.convert("RGBA")
            actual.load()
    except (OSError, ValueError) as exc:
        raise FinalizeError(f"cannot compare replayed {label}") from exc
    if expected.size != actual.size or expected.tobytes() != actual.tobytes():
        raise FinalizeError(
            f"builder replay mismatch for {label}: "
            f"{display_path(expected_path)}"
        )


def inspect_pipeline_replay(
    path: Path,
    root: Path,
    raw_png: Path,
    transparent_board: Path,
    pose_paths: dict[str, Path],
    transaction_root: Path,
) -> dict[str, Any]:
    payload = load_pipeline_metadata(path)
    pipeline_input_value = payload.get("input")
    if type(pipeline_input_value) is not str or not pipeline_input_value.strip():
        raise FinalizeError(
            f"pipeline metadata needs a non-empty input path: "
            f"{display_path(path)}"
        )
    pipeline_input = resolve_catalog_path(
        pipeline_input_value,
        "pipeline input",
        root=root,
        require_exists=True,
    )
    if pipeline_input != raw_png:
        raise FinalizeError(
            f"pipeline input must be the archived raw identity PNG: "
            f"{display_path(path)}"
        )
    if (
        type(payload.get("inputSha256")) is not str
        or payload["inputSha256"] != sha256_file(raw_png)
    ):
        raise FinalizeError(
            f"pipeline inputSha256 does not match raw identity PNG: "
            f"{display_path(path)}"
        )
    with Image.open(raw_png) as raw_image:
        raw_size = [raw_image.width, raw_image.height]
    if payload.get("inputSize") != raw_size:
        raise FinalizeError(
            f"pipeline inputSize does not match raw identity PNG: "
            f"{display_path(path)}"
        )
    frame_records_before_replay = payload.get("frames")
    if type(frame_records_before_replay) is list:
        for frame in frame_records_before_replay:
            if type(frame) is not dict:
                continue
            for residue_key in (
                "residualMagentaPixelsBeforeResize",
                "residualMagentaPixelsSource",
                "residualMagentaPixelsRuntime",
            ):
                residue = frame.get(residue_key)
                if type(residue) is not int or residue != 0:
                    raise FinalizeError(
                        f"pipeline has invalid or non-zero magenta residue "
                        f"at {residue_key}: {display_path(path)}"
                    )

    replay_dir = transaction_root / "builder-replay"
    try:
        options = pet_art_builder.options_from_metadata(
            payload,
            input_path=raw_png,
            output_dir=replay_dir,
        )
    except pet_art_builder.BundleBuildError as exc:
        raise FinalizeError(
            f"pipeline metadata cannot be replayed strictly: {exc}"
        ) from exc
    if (
        options.rows != 2
        or options.cols != 2
        or options.row_start != 0
        or options.row_count != 2
        or list(options.slots) != IDENTITY_POSES
        or options.anchor != "feet"
        or options.alpha_threshold != ALPHA_THRESHOLD
        or options.safe_margin < MIN_SOURCE_SAFE_MARGIN
    ):
        raise FinalizeError(
            "identity pipeline must select the complete 2x2 grid with the "
            "canonical pose order, feet anchor, alpha threshold, and margin"
        )
    try:
        replay_metadata = pet_art_builder.build_bundle(options)
    except pet_art_builder.BundleBuildError as exc:
        raise FinalizeError(f"identity pipeline replay failed: {exc}") from exc

    replay_pipeline_path = replay_dir / "pipeline-meta.json"
    replay_from_disk = load_pipeline_metadata(replay_pipeline_path)
    if not strict_json_equal(replay_from_disk, replay_metadata):
        raise FinalizeError("builder replay metadata differs from its disk manifest")

    frame_records = replay_metadata.get("frames")
    if (
        type(frame_records) is not list
        or len(frame_records) != len(IDENTITY_POSES)
        or not all(type(frame) is dict for frame in frame_records)
    ):
        raise FinalizeError("builder replay did not produce four frame records")
    declared_frames = payload.get("frames")
    if (
        type(declared_frames) is not list
        or len(declared_frames) != len(IDENTITY_POSES)
        or not all(type(frame) is dict for frame in declared_frames)
    ):
        raise FinalizeError("pipeline metadata must declare four frame objects")
    replay_sources: dict[str, dict[str, str]] = {}
    replay_runtimes: dict[str, dict[str, str]] = {}
    for pose, frame, declared_frame in zip(
        IDENTITY_POSES,
        frame_records,
        declared_frames,
        strict=True,
    ):
        source_path = replay_dir / "source-frames" / f"{pose}.png"
        runtime_path = replay_dir / "runtime-frames" / f"{pose}.png"
        require_file(source_path, f"replayed source pose {pose}")
        require_file(runtime_path, f"replayed runtime pose {pose}")
        source_hash = canonical_rgba_sha256(source_path)
        runtime_hash = canonical_rgba_sha256(runtime_path)
        if (
            frame.get("slot") != pose
            or frame.get("sourceRgbaSha256") != source_hash
            or frame.get("runtimeRgbaSha256") != runtime_hash
        ):
            raise FinalizeError(
                f"replayed source/runtime hash mapping is invalid for {pose}"
            )
        if declared_frame.get("slot") != pose:
            raise FinalizeError(f"pipeline frame slot mismatch for {pose}")
        if (
            declared_frame.get("sourceRgbaSha256") != source_hash
            or declared_frame.get("runtimeRgbaSha256") != runtime_hash
        ):
            raise FinalizeError(
                f"pipeline source/runtime hash mismatch for {pose}"
            )
        assert_same_rgba(
            pose_paths[pose],
            source_path,
            f"source pose {pose}",
        )
        replay_sources[pose] = {
            "path": f"source-frames/{pose}.png",
            "canonicalRgbaSha256": source_hash,
        }
        replay_runtimes[pose] = {
            "path": f"runtime-frames/{pose}.png",
            "canonicalRgbaSha256": runtime_hash,
        }

    replay_sheet = replay_dir / "sheet-transparent.png"
    replay_runtime_sheet = replay_dir / "sheet-runtime-transparent.png"
    require_file(replay_sheet, "replayed transparent sheet")
    require_file(replay_runtime_sheet, "replayed runtime transparent sheet")
    assert_same_rgba(
        transparent_board,
        replay_sheet,
        "1024px transparent sheet",
    )
    runtime_images: list[Image.Image] = []
    for pose in IDENTITY_POSES:
        with Image.open(
            replay_dir / "runtime-frames" / f"{pose}.png"
        ) as opened:
            runtime_image = opened.convert("RGBA")
            runtime_image.load()
        runtime_images.append(runtime_image)
    expected_runtime_sheet = pet_art_builder.compose_sheet(
        runtime_images,
        2,
        2,
        RUNTIME_FRAME_SIZE,
    )
    try:
        with Image.open(replay_runtime_sheet) as opened:
            actual_runtime_sheet = opened.convert("RGBA")
            actual_runtime_sheet.load()
        if (
            actual_runtime_sheet.size != expected_runtime_sheet.size
            or actual_runtime_sheet.tobytes()
            != expected_runtime_sheet.tobytes()
        ):
            raise FinalizeError(
                "replayed runtime sheet is not the exact 2x2 runtime mapping"
            )
    finally:
        expected_runtime_sheet.close()
        for image in runtime_images:
            image.close()

    if not strict_json_equal(
        normalized_pipeline_metadata(payload, raw_png),
        replay_metadata,
    ):
        raise FinalizeError(
            f"pipeline metadata is not fully equivalent to a real builder "
            f"replay: {display_path(path)}"
        )

    return {
        "sha256": sha256_file(path),
        "input": str(raw_png.relative_to(root)),
        "frameCount": len(frame_records),
        "tool": PIPELINE_TOOL,
        "schemaVersion": PIPELINE_SCHEMA_VERSION,
        "replayContractVersion": PIPELINE_REPLAY_CONTRACT_VERSION,
        "slots": IDENTITY_POSES,
        "sourceFrameSize": IDENTITY_POSE_SIZE[0],
        "runtimeFrameSize": RUNTIME_FRAME_SIZE,
        "safeMargin": options.safe_margin,
        "effectiveSourceMargin": replay_metadata["effectiveSourceMargin"],
        "metadataReplayDigestContractVersion": (
            METADATA_REPLAY_DIGEST_CONTRACT_VERSION
        ),
        "metadataReplaySha256": (
            checkout_portable_pipeline_metadata_replay_sha256(
                replay_metadata,
                raw_png,
            )
        ),
        "sources": replay_sources,
        "runtimes": replay_runtimes,
        "transparentSheetCanonicalRgbaSha256": canonical_rgba_sha256(
            replay_sheet
        ),
        "runtimeSheetCanonicalRgbaSha256": canonical_rgba_sha256(
            replay_runtime_sheet
        ),
    }


def inspect_self_review_evidence(
    path: Path,
    form_id: str,
    root: Path,
    board_audit: dict[str, Any],
    pose_audits: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as exc:
        raise FinalizeError(
            f"invalid identity self-review JSON: {display_path(path)}"
        ) from exc
    if not isinstance(payload, dict):
        raise FinalizeError(
            f"identity self-review must be a JSON object: "
            f"{display_path(path)}"
        )
    expected_header = {
        "schemaVersion": SELF_REVIEW_SCHEMA_VERSION,
        "formId": form_id,
        "reviewScope": "identity_key_pose_gate",
        "selfReviewStatus": "passed",
        "ownerReviewStatus": "pending",
        "runtimeEnabled": False,
        "errors": [],
    }
    expected_keys = {
        *expected_header,
        "identityBoard",
        "poses",
        "contactSheet",
    }
    if set(payload) != expected_keys:
        raise FinalizeError(
            f"identity self-review has unexpected or missing top-level "
            f"fields: {display_path(path)}"
        )
    for key, expected in expected_header.items():
        if type(payload.get(key)) is not type(expected) or payload[key] != expected:
            raise FinalizeError(
                f"identity self-review {key} must be {expected!r}: "
                f"{display_path(path)}"
            )

    expected_board = {
        "path": board_audit["path"],
        "fileSha256": board_audit["fileSha256"],
        "canonicalRgbaSha256": board_audit["canonicalRgbaSha256"],
    }
    if payload.get("identityBoard") != expected_board:
        raise FinalizeError(
            f"identity self-review board binding mismatch: "
            f"{display_path(path)}"
        )
    expected_poses = {
        pose: {
            "path": audit["path"],
            "fileSha256": audit["fileSha256"],
            "canonicalRgbaSha256": audit["canonicalRgbaSha256"],
        }
        for pose, audit in pose_audits.items()
    }
    if payload.get("poses") != expected_poses:
        raise FinalizeError(
            f"identity self-review pose binding mismatch: "
            f"{display_path(path)}"
        )

    contact_sheet = payload.get("contactSheet")
    if (
        type(contact_sheet) is not dict
        or set(contact_sheet) != {"path", "fileSha256"}
    ):
        raise FinalizeError(
            f"identity self-review needs exact contactSheet evidence: "
            f"{display_path(path)}"
        )
    contact_relative = contact_sheet.get("path")
    if not isinstance(contact_relative, str) or not contact_relative:
        raise FinalizeError(
            f"identity self-review contactSheet path is invalid: "
            f"{display_path(path)}"
        )
    contact_path = resolve_pet_relative_path(
        root,
        contact_relative,
        "identity self-review contact sheet",
        require_exists=True,
    )
    require_file(contact_path, "identity self-review contact sheet")
    try:
        with Image.open(contact_path) as image:
            if image.format != "PNG" or image.mode != "RGBA":
                raise FinalizeError(
                    f"identity self-review contactSheet must be RGBA PNG: "
                    f"{display_path(contact_path)}"
                )
            pixel_count = image.width * image.height
            if pixel_count > MAX_CONTACT_SHEET_PIXELS:
                raise FinalizeError(
                    f"identity self-review contactSheet exceeds "
                    f"{MAX_CONTACT_SHEET_PIXELS} pixels: "
                    f"{display_path(contact_path)}"
                )
            if image.size != IDENTITY_BOARD_SIZE:
                raise FinalizeError(
                    f"identity self-review contactSheet must be the exact "
                    f"{IDENTITY_BOARD_SIZE[0]}x{IDENTITY_BOARD_SIZE[1]} "
                    f"identity board: {display_path(contact_path)}"
                )
            image.load()
            contact_pixels = image.tobytes()
            contact_size = [image.width, image.height]
        with Image.open(root / board_audit["path"]) as board:
            board.load()
            board_pixels = board.tobytes()
        if contact_pixels != board_pixels:
            raise FinalizeError(
                f"identity self-review contactSheet is not pixel-bound to "
                f"the current identity board: {display_path(contact_path)}"
            )
    except FinalizeError:
        raise
    except (OSError, ValueError) as exc:
        raise FinalizeError(
            f"cannot decode identity self-review contactSheet: "
            f"{display_path(contact_path)}"
        ) from exc
    contact_hash = sha256_file(contact_path)
    if contact_sheet.get("fileSha256") != contact_hash:
        raise FinalizeError(
            f"identity self-review contactSheet hash mismatch: "
            f"{display_path(path)}"
        )
    return {
        "path": str(path.relative_to(root)),
        "sha256": sha256_file(path),
        "status": "passed",
        "contactSheet": {
            "path": contact_relative,
            "fileSha256": contact_hash,
            "pixelSize": contact_size,
        },
    }


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    encoded = json.dumps(payload, ensure_ascii=False, indent=2) + "\n"
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{path.name}.",
        suffix=".tmp",
        dir=path.parent,
    )
    temporary_path = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            handle.write(encoded)
            handle.flush()
            os.fsync(handle.fileno())
        temporary_path.replace(path)
    except Exception:
        temporary_path.unlink(missing_ok=True)
        raise


def reject_symlink_components(path: Path, anchor: Path, label: str) -> None:
    anchor = Path(os.path.abspath(anchor))
    path = Path(os.path.abspath(path))
    try:
        relative = path.relative_to(anchor)
    except ValueError as exc:
        raise FinalizeError(f"{label} escapes its allowed root: {path}") from exc
    current = anchor
    if current.is_symlink():
        raise FinalizeError(f"{label} uses a symlinked root: {anchor}")
    for part in relative.parts:
        current /= part
        if current.is_symlink():
            raise FinalizeError(
                f"{label} may not traverse a symlink: {display_path(current)}"
            )


def resolve_catalog_path(
    value: str,
    label: str,
    *,
    root: Path | None = None,
    require_exists: bool = False,
) -> Path:
    if type(value) is not str or not value.strip():
        raise FinalizeError(f"{label} must be a non-empty catalog path")
    candidate = Path(value)
    if not candidate.is_absolute():
        candidate = REPO_ROOT / candidate
    lexical = Path(os.path.abspath(candidate))
    allowed_root = REPO_ROOT if root is None else root
    try:
        lexical.relative_to(allowed_root)
    except ValueError as exc:
        raise FinalizeError(
            f"{label} escapes "
            f"{'repository' if root is None else 'pet root'}: {value}"
        ) from exc
    reject_symlink_components(lexical, allowed_root, label)
    resolved = lexical.resolve(strict=False)
    try:
        resolved.relative_to(allowed_root.resolve())
    except ValueError as exc:
        raise FinalizeError(
            f"{label} resolves outside "
            f"{'repository' if root is None else 'pet root'}: {value}"
        ) from exc
    if require_exists and not resolved.exists():
        raise FinalizeError(f"missing {label}: {display_path(resolved)}")
    return resolved


def resolve_pet_relative_path(
    root: Path,
    value: str,
    label: str,
    *,
    require_exists: bool = False,
) -> Path:
    if type(value) is not str or not value.strip():
        raise FinalizeError(f"{label} must be a non-empty pet-relative path")
    relative = Path(value)
    if relative.is_absolute() or ".." in relative.parts:
        raise FinalizeError(f"{label} must stay relative to pet root: {value}")
    return resolve_catalog_path(
        str(root / relative),
        label,
        root=root,
        require_exists=require_exists,
    )


def require_file(path: Path, label: str) -> None:
    if path.is_symlink() or not path.is_file():
        raise FinalizeError(f"missing regular {label}: {display_path(path)}")


def archive_lossless_webp(raw_png: Path, raw_webp: Path) -> tuple[str, str]:
    original_decoded = decoded_rgba_sha256(raw_png)
    with Image.open(raw_png) as image:
        image.convert("RGBA").save(
            raw_webp,
            format="WEBP",
            lossless=True,
            quality=100,
            method=6,
            exact=True,
        )
    archived_decoded = decoded_rgba_sha256(raw_webp)
    if archived_decoded != original_decoded:
        raw_webp.unlink(missing_ok=True)
        raise FinalizeError(
            f"lossless WebP decoded hash mismatch: {display_path(raw_png)}"
        )
    with raw_webp.open("rb") as handle:
        os.fsync(handle.fileno())
    return original_decoded, sha256_file(raw_webp)


FINALIZER_METADATA_KEYS = {
    "schemaVersion",
    "formId",
    "displayName",
    "artStatus",
    "productionScope",
    "runtimeEnabled",
    "rideableTarget",
    "runtimeFrameSize",
    "views",
    "identity",
    "actions",
    "worldVisual",
    "supportedMountedCharacterIds",
    "sourceArchive",
    "evidence",
    "keyPoseReviewStatus",
    "ownerReviewStatus",
    "notes",
}
PROTECTED_TRUE_KEYS = {
    "approved",
    "ownerapproved",
    "reviewapproved",
    "runtimeenabled",
    "runtimeready",
    "releaseenabled",
    "released",
    "releaseready",
    "productionready",
}
PROTECTED_STRING_MARKERS = {
    "approved",
    "owner_approved",
    "owner-approved",
    "review_approved",
    "review-approved",
    "runtime_enabled",
    "runtime-enabled",
    "runtime_ready",
    "runtime-ready",
    "release_enabled",
    "release-enabled",
    "release_ready",
    "release-ready",
    "released",
    "production_ready",
    "production-ready",
}
FORCE_PENDING_STATUSES = {
    "in_production",
    "not_produced",
    "owner_review_pending",
    "pending",
    "passed",
    "self_review_passed_owner_pending",
    "self_review_passed_owner_review_pending",
}


def normalized_json_key(value: str) -> str:
    return "".join(character for character in value.casefold() if character.isalnum())


def inspect_protected_state(
    value: Any,
    location: str = "$",
    *,
    require_pending_statuses: bool = False,
) -> None:
    if isinstance(value, dict):
        for key, child in value.items():
            if type(key) is not str or not key:
                raise FinalizeError(
                    f"existing metadata has a malformed key at {location}"
                )
            child_location = f"{location}.{key}"
            normalized_key = normalized_json_key(key)
            if "release" in normalized_key:
                raise FinalizeError(
                    f"existing metadata contains a release field at "
                    f"{child_location}"
                )
            if (
                "approv" in normalized_key
                and (type(child) is not bool or child is not False)
            ):
                raise FinalizeError(
                    f"existing metadata approval field must be explicit "
                    f"false at {child_location}"
                )
            if (
                "runtime" in normalized_key
                and type(child) is bool
                and child is not False
            ):
                raise FinalizeError(
                    f"existing metadata runtime flag must be explicit false "
                    f"at {child_location}"
                )
            if normalized_key in PROTECTED_TRUE_KEYS:
                if type(child) is not bool or child is not False:
                    raise FinalizeError(
                        f"existing metadata protected flag must be explicit "
                        f"false at {child_location}"
                    )
            if normalized_key.endswith("status") and type(child) is not str:
                raise FinalizeError(
                    f"existing metadata status must be a string at "
                    f"{child_location}"
                )
            if (
                require_pending_statuses
                and normalized_key.endswith("status")
                and child not in FORCE_PENDING_STATUSES
            ):
                raise FinalizeError(
                    f"--force may not overwrite non-pending status "
                    f"{child!r} at {child_location}"
                )
            inspect_protected_state(
                child,
                child_location,
                require_pending_statuses=require_pending_statuses,
            )
        return
    if isinstance(value, list):
        for index, child in enumerate(value):
            inspect_protected_state(
                child,
                f"{location}[{index}]",
                require_pending_statuses=require_pending_statuses,
            )
        return
    if type(value) not in {str, int, float, bool, type(None)}:
        raise FinalizeError(
            f"existing metadata has unsupported value type at {location}"
        )
    if type(value) is float and not math.isfinite(value):
        raise FinalizeError(
            f"existing metadata has a non-finite number at {location}"
        )
    if type(value) is str:
        lowered = value.casefold()
        if any(marker in lowered for marker in PROTECTED_STRING_MARKERS):
            raise FinalizeError(
                f"existing metadata contains an approved/runtime/release "
                f"marker at {location}"
            )


def has_exact_json_shape(candidate: Any, reference: Any) -> bool:
    if type(candidate) is not type(reference):
        return False
    if isinstance(candidate, dict):
        return (
            set(candidate) == set(reference)
            and all(
                has_exact_json_shape(candidate[key], reference[key])
                for key in candidate
            )
        )
    if isinstance(candidate, list):
        return len(candidate) == len(reference) and all(
            has_exact_json_shape(candidate_item, reference_item)
            for candidate_item, reference_item in zip(
                candidate,
                reference,
                strict=True,
            )
        )
    return True


def validate_force_metadata(
    payload: Any,
    form_id: str,
    *,
    expected_shape: dict[str, Any] | None = None,
) -> None:
    if type(payload) is not dict:
        raise FinalizeError(
            "existing metadata is not an object and may not be force-overwritten"
        )
    if set(payload) != FINALIZER_METADATA_KEYS:
        raise FinalizeError(
            "--force may not overwrite metadata whose top-level schema is "
            "not owned by this finalizer"
        )
    expected_scalars = {
        "schemaVersion": (int, 1),
        "formId": (str, form_id),
        "artStatus": (str, "in_production"),
        "productionScope": (str, "identity_key_pose_gate"),
        "runtimeEnabled": (bool, False),
        "ownerReviewStatus": (str, "pending"),
        "keyPoseReviewStatus": (str, "owner_review_pending"),
    }
    for key, (expected_type, expected_value) in expected_scalars.items():
        if type(payload.get(key)) is not expected_type or payload[key] != expected_value:
            raise FinalizeError(
                f"--force may not overwrite metadata whose {key} is not the "
                f"protected pending value"
            )
    if type(payload.get("rideableTarget")) is not bool:
        raise FinalizeError(
            "existing metadata rideableTarget is not an explicit boolean"
        )
    if type(payload.get("displayName")) is not str or not payload["displayName"]:
        raise FinalizeError("existing metadata displayName is malformed")
    expected_top_types = {
        "runtimeFrameSize": list,
        "views": list,
        "identity": dict,
        "actions": dict,
        "worldVisual": dict,
        "supportedMountedCharacterIds": list,
        "sourceArchive": dict,
        "evidence": dict,
        "notes": str,
    }
    for key, expected_type in expected_top_types.items():
        if type(payload.get(key)) is not expected_type:
            raise FinalizeError(
                f"--force may not overwrite metadata whose {key} has a "
                f"malformed type"
            )
    if (
        payload["runtimeFrameSize"]
        != [RUNTIME_FRAME_SIZE, RUNTIME_FRAME_SIZE]
        or not all(type(value) is int for value in payload["runtimeFrameSize"])
    ):
        raise FinalizeError(
            "--force may not overwrite metadata with malformed runtimeFrameSize"
        )
    if (
        payload["views"] != ["front_3quarter_sw", "back_3quarter_ne"]
        or not all(type(value) is str for value in payload["views"])
    ):
        raise FinalizeError(
            "--force may not overwrite metadata with malformed views"
        )
    if not all(
        type(value) is str and value
        for value in payload["supportedMountedCharacterIds"]
    ):
        raise FinalizeError(
            "--force may not overwrite malformed mounted character IDs"
        )
    inspect_protected_state(payload, require_pending_statuses=True)
    if expected_shape is not None and not has_exact_json_shape(
        payload,
        expected_shape,
    ):
        raise FinalizeError(
            "--force may not overwrite metadata whose nested schema differs "
            "from the current pending finalizer contract"
        )


def read_force_metadata(
    path: Path,
    form_id: str,
    *,
    expected_shape: dict[str, Any] | None = None,
) -> dict[str, Any]:
    require_file(path, "existing action metadata")
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as exc:
        raise FinalizeError(
            f"existing metadata is invalid and may not be "
            f"force-overwritten: {display_path(path)}"
        ) from exc
    validate_force_metadata(
        payload,
        form_id,
        expected_shape=expected_shape,
    )
    return payload


def capture_file_state(paths: list[Path]) -> dict[Path, str | None]:
    state: dict[Path, str | None] = {}
    for path in paths:
        if path.is_symlink():
            raise FinalizeError(
                f"protected output may not be a symlink: {display_path(path)}"
            )
        if path.exists():
            if not path.is_file():
                raise FinalizeError(
                    f"protected output is not a regular file: "
                    f"{display_path(path)}"
                )
            state[path] = sha256_file(path)
        else:
            state[path] = None
    return state


def verify_file_state(state: dict[Path, str | None]) -> None:
    for path, expected_hash in state.items():
        if path.is_symlink():
            raise FinalizeError(
                f"protected output became a symlink before commit: "
                f"{display_path(path)}"
            )
        if expected_hash is None:
            if path.exists():
                raise FinalizeError(
                    f"protected output appeared before commit: "
                    f"{display_path(path)}"
                )
            continue
        if not path.is_file() or sha256_file(path) != expected_hash:
            raise FinalizeError(
                f"protected output changed before commit: "
                f"{display_path(path)}"
            )


def capture_input_state(paths: list[Path]) -> dict[Path, str | None]:
    state = capture_file_state(paths)
    if any(value is None for value in state.values()):
        raise FinalizeError("identity gate input disappeared during validation")
    return state


def reject_path_aliases(inputs: list[Path], outputs: list[Path]) -> None:
    if len(set(inputs)) != len(inputs):
        raise FinalizeError("identity evidence inputs must use distinct paths")
    if len(set(outputs)) != len(outputs):
        raise FinalizeError("identity finalizer outputs must use distinct paths")
    overlap = set(inputs) & set(outputs)
    if overlap:
        raise FinalizeError(
            "identity evidence input aliases a finalizer output: "
            + ", ".join(display_path(path) for path in sorted(overlap))
        )

    seen_input_inodes: dict[tuple[int, int], Path] = {}
    for path in inputs:
        stat = path.stat()
        inode = (stat.st_dev, stat.st_ino)
        if inode in seen_input_inodes:
            raise FinalizeError(
                f"identity evidence inputs are hard-link aliases: "
                f"{display_path(seen_input_inodes[inode])}, "
                f"{display_path(path)}"
            )
        seen_input_inodes[inode] = path
    for path in outputs:
        if not path.exists():
            continue
        stat = path.stat()
        inode = (stat.st_dev, stat.st_ino)
        if inode in seen_input_inodes:
            raise FinalizeError(
                f"identity evidence input hard-links finalizer output: "
                f"{display_path(path)}"
            )


@contextmanager
def form_write_lock(root: Path) -> Iterator[None]:
    lock_path = root / ".identity-finalize.lock"
    if lock_path.is_symlink():
        raise FinalizeError(
            f"identity finalizer lock may not be a symlink: "
            f"{display_path(lock_path)}"
        )
    try:
        descriptor = os.open(
            lock_path,
            os.O_WRONLY | os.O_CREAT | os.O_EXCL,
            0o600,
        )
    except FileExistsError as exc:
        raise FinalizeError(
            f"another identity finalizer owns the form lock: "
            f"{display_path(lock_path)}"
        ) from exc
    lock_stat = os.fstat(descriptor)
    try:
        os.write(descriptor, f"{os.getpid()}\n".encode("ascii"))
        os.fsync(descriptor)
        yield
    finally:
        os.close(descriptor)
        try:
            current_stat = lock_path.lstat()
        except FileNotFoundError:
            current_stat = None
        if (
            current_stat is not None
            and current_stat.st_dev == lock_stat.st_dev
            and current_stat.st_ino == lock_stat.st_ino
        ):
            lock_path.unlink()


def _replace_output(source: Path, target: Path) -> None:
    os.replace(source, target)


def _install_output_no_clobber(source: Path, target: Path) -> None:
    os.link(source, target, follow_symlinks=False)


def fsync_directory(path: Path) -> None:
    descriptor = os.open(path, os.O_RDONLY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def commit_staged_outputs(
    transaction_root: Path,
    staged_outputs: dict[Path, Path],
    *,
    allowed_root: Path,
    precommit: Callable[[], None],
    validate_backup: Callable[[Path, Path], None],
) -> None:
    backup_root = transaction_root / "backup"
    backup_root.mkdir()
    precommit()
    install_attempts: list[tuple[Path, Path]] = []
    backups: dict[Path, Path] = {}
    try:
        for index, (target, staged) in enumerate(staged_outputs.items()):
            require_file(staged, f"staged output {target.name}")
            reject_symlink_components(
                target,
                allowed_root,
                f"identity output {target.name}",
            )
            target.parent.mkdir(parents=True, exist_ok=True)
            if target.exists():
                backup = backup_root / f"{index}-{target.name}"
                backups[target] = backup
                _replace_output(target, backup)
                validate_backup(target, backup)
            install_attempts.append((target, staged))
            _install_output_no_clobber(staged, target)
            fsync_directory(target.parent)
        for target, backup in backups.items():
            validate_backup(target, backup)
    except BaseException as install_error:
        rollback_errors: list[str] = []
        for target, staged in reversed(install_attempts):
            try:
                if (
                    target.exists()
                    and staged.exists()
                    and os.path.samefile(target, staged)
                ):
                    target.unlink()
            except OSError as exc:
                rollback_errors.append(f"remove {target}: {exc}")
        for target, backup in reversed(list(backups.items())):
            try:
                if target.exists():
                    # A no-clobber install never overwrites a concurrent
                    # writer.  Preserve that newer path instead of deleting
                    # it during rollback.
                    continue
                os.replace(backup, target)
                fsync_directory(target.parent)
            except OSError as exc:
                rollback_errors.append(f"restore {target}: {exc}")
        if rollback_errors:
            raise FinalizeError(
                "identity finalize commit failed and rollback was incomplete: "
                + "; ".join(rollback_errors)
            ) from install_error
        raise FinalizeError(
            "identity finalize commit failed; all outputs were rolled back"
        ) from install_error


def action_metadata() -> dict[str, Any]:
    return {
        action: {
            "frameCount": frame_count,
            "fps": fps,
            "loop": loop,
            "status": "not_produced",
        }
        for action, (frame_count, fps, loop) in ACTION_SPECS.items()
    }


def finalize_form(
    form: dict[str, Any],
    force: bool,
    *,
    check_only: bool = False,
) -> None:
    if type(form) is not dict:
        raise FinalizeError("catalog form must be an object")
    form_id = form.get("formId")
    display_name = form.get("displayName")
    pet = form.get("pet")
    if (
        type(form_id) is not str
        or not form_id
        or type(display_name) is not str
        or not display_name
        or type(pet) is not dict
    ):
        raise FinalizeError("catalog form is missing formId/displayName/pet")
    catalog_status = form.get("status")
    if (
        type(catalog_status) is not str
        or catalog_status != "in_production"
    ):
        raise FinalizeError(
            f"catalog form status must be exactly in_production: {form_id}"
        )
    if form.get("runtimeEnabled") is not False:
        raise FinalizeError(
            f"catalog form must explicitly set runtimeEnabled=false: {form_id}"
        )
    rideable_target = form.get("rideableTarget")
    if type(rideable_target) is not bool:
        raise FinalizeError(
            f"catalog form rideableTarget must be an explicit boolean: "
            f"{form_id}"
        )
    supported_character_ids = form.get("supportedCharacterIds", [])
    if (
        type(supported_character_ids) is not list
        or not all(
            type(character_id) is str and character_id
            for character_id in supported_character_ids
        )
    ):
        raise FinalizeError(
            f"catalog form has invalid supportedCharacterIds: {form_id}"
        )
    if rideable_target is False and (
        supported_character_ids or "mounted" in form
    ):
        raise FinalizeError(
            f"non-rideable form may not declare mounted art or supported "
            f"characters: {form_id}"
        )
    inspect_protected_state(form)

    root = resolve_catalog_path(pet.get("root"), "pet root")
    if not root.is_dir():
        raise FinalizeError(f"pet root is not a directory: {display_path(root)}")
    metadata_path = resolve_catalog_path(
        pet.get("metadataPath"),
        "pet metadataPath",
        root=root,
    )
    expected_metadata_path = resolve_pet_relative_path(
        root,
        "action-bundle-meta.json",
        "canonical pet metadataPath",
    )
    if metadata_path != expected_metadata_path:
        raise FinalizeError(
            f"pet metadataPath must be exactly "
            f"{display_path(expected_metadata_path)}"
        )
    identity_path = resolve_catalog_path(
        pet.get("identityPath"),
        "identity lock",
        root=root,
        require_exists=True,
    )
    ownership_path = resolve_catalog_path(
        pet.get("ownershipPath"),
        "ownership record",
        root=root,
        require_exists=True,
    )
    prompt_path = resolve_catalog_path(
        pet.get("promptPath"),
        "generation prompt",
        root=root,
        require_exists=True,
    )
    raw_png = resolve_pet_relative_path(
        root,
        "source/identity-board-raw.png",
        "raw identity PNG",
        require_exists=True,
    )
    raw_webp = resolve_pet_relative_path(
        root,
        "source/identity-board-raw.webp",
        "raw identity WebP output",
    )
    source_meta_path = resolve_pet_relative_path(
        root,
        "source/identity-board-source-meta.json",
        "identity source metadata output",
    )
    pipeline_meta_path = resolve_pet_relative_path(
        root,
        "source/identity-board-pipeline-meta.json",
        "pipeline metadata",
        require_exists=True,
    )
    self_review_path = resolve_pet_relative_path(
        root,
        f"qa/{SELF_REVIEW_FILENAME}",
        "identity self-review",
        require_exists=True,
    )
    transparent_board = resolve_pet_relative_path(
        root,
        "identity/identity-board-transparent.png",
        "transparent identity board",
        require_exists=True,
    )
    pose_paths = {
        pose: resolve_pet_relative_path(
            root,
            f"identity/{pose}.png",
            f"identity pose {pose}",
            require_exists=True,
        )
        for pose in IDENTITY_POSES
    }

    for path, label in [
        (identity_path, "identity lock"),
        (ownership_path, "ownership record"),
        (prompt_path, "generation prompt"),
        (raw_png, "raw identity PNG"),
        (pipeline_meta_path, "pipeline metadata"),
        (self_review_path, "identity self-review"),
        (transparent_board, "transparent identity board"),
    ]:
        require_file(path, label)
    for pose, pose_path in pose_paths.items():
        require_file(pose_path, f"identity pose {pose}")

    output_paths = [raw_webp, source_meta_path, metadata_path]
    lock_context = form_write_lock(root) if not check_only else nullcontext()
    with lock_context:
        output_state = capture_file_state(output_paths)
        existing_outputs = [
            path for path, digest in output_state.items() if digest is not None
        ]
        if not check_only:
            if existing_outputs and not force:
                raise FinalizeError(
                    f"identity outputs already exist (use --force): "
                    + ", ".join(display_path(path) for path in existing_outputs)
                )
            if force and existing_outputs:
                if len(existing_outputs) != len(output_paths):
                    raise FinalizeError(
                        "--force refuses an incomplete prior finalizer output set"
                    )
                read_force_metadata(metadata_path, form_id)

        base_inputs = [
            identity_path,
            ownership_path,
            prompt_path,
            raw_png,
            pipeline_meta_path,
            self_review_path,
            transparent_board,
            *pose_paths.values(),
        ]
        input_state = capture_input_state(base_inputs)
        transaction_parent: str | Path | None = root if not check_only else None
        transaction_root = Path(
            tempfile.mkdtemp(
                prefix=".identity-finalize-txn-",
                dir=transaction_parent,
            )
        )
        try:
            raw_source_audit = inspect_raw_source_png(raw_png)
            board_audit = inspect_transparent_png(
                transparent_board,
                IDENTITY_BOARD_SIZE,
                "transparent identity board",
            )
            board_audit["path"] = str(transparent_board.relative_to(root))
            pose_audits: dict[str, dict[str, Any]] = {}
            for pose, pose_path in pose_paths.items():
                pose_audit = inspect_transparent_png(
                    pose_path,
                    IDENTITY_POSE_SIZE,
                    f"identity pose {pose}",
                    safe_margin=MIN_SOURCE_SAFE_MARGIN,
                )
                pose_audit["path"] = str(pose_path.relative_to(root))
                pose_audits[pose] = pose_audit
            pose_hashes = [
                pose_audits[pose]["canonicalRgbaSha256"]
                for pose in IDENTITY_POSES
            ]
            if len(set(pose_hashes)) != len(pose_hashes):
                raise FinalizeError(
                    f"identity poses must have unique decoded RGBA content: "
                    f"{form_id}"
                )
            inspect_identity_board_composition(transparent_board, pose_paths)
            self_review_audit = inspect_self_review_evidence(
                self_review_path,
                form_id,
                root,
                board_audit,
                pose_audits,
            )
            contact_path = resolve_pet_relative_path(
                root,
                self_review_audit["contactSheet"]["path"],
                "identity self-review contact sheet",
                require_exists=True,
            )
            contact_hash = sha256_file(contact_path)
            if (
                contact_hash
                != self_review_audit["contactSheet"]["fileSha256"]
            ):
                raise FinalizeError(
                    "identity self-review contact sheet changed during "
                    "validation"
                )
            all_inputs = [*base_inputs, contact_path]
            reject_path_aliases(all_inputs, output_paths)
            input_state[contact_path] = contact_hash
            verify_file_state(input_state)

            pipeline_audit = inspect_pipeline_replay(
                pipeline_meta_path,
                root,
                raw_png,
                transparent_board,
                pose_paths,
                transaction_root,
            )
            pipeline_audit["path"] = str(pipeline_meta_path.relative_to(root))
            verify_file_state(input_state)
            if check_only:
                print(f"validated {form_id}: strict identity gate passed")
                return

            staged_root = transaction_root / "staged"
            staged_webp = staged_root / "source/identity-board-raw.webp"
            staged_source_meta = (
                staged_root / "source/identity-board-source-meta.json"
            )
            staged_metadata = staged_root / "action-bundle-meta.json"
            staged_webp.parent.mkdir(parents=True)
            decoded_hash, webp_hash = archive_lossless_webp(
                raw_png,
                staged_webp,
            )
            archived_canonical_hash = canonical_rgba_sha256(staged_webp)
            if (
                decoded_hash != raw_source_audit["decodedRgbaPixelSha256"]
                or archived_canonical_hash
                != raw_source_audit["canonicalRgbaSha256"]
            ):
                raise FinalizeError(
                    f"raw identity source changed during archive: "
                    f"{display_path(raw_png)}"
                )

            source_meta = {
                "schemaVersion": 2,
                "asset": f"{form_id}_identity_board",
                "generatorRecord": str(ownership_path.relative_to(root)),
                "originalGeneratedFilename": raw_png.name,
                "originalPngSize": raw_source_audit["pixelSize"],
                "originalPngSha256": raw_source_audit["fileSha256"],
                "decodedRgbaPixelSha256": decoded_hash,
                "canonicalRgbaSha256": raw_source_audit[
                    "canonicalRgbaSha256"
                ],
                "archive": {
                    "path": "source/identity-board-raw.webp",
                    "format": "webp",
                    "lossless": True,
                    "sha256": webp_hash,
                    "decodedRgbaPixelSha256": decoded_hash,
                    "canonicalRgbaSha256": archived_canonical_hash,
                },
                "prompt": str(prompt_path.relative_to(root)),
                "promptSha256": sha256_file(prompt_path),
                "identityLock": str(identity_path.relative_to(root)),
                "identityLockSha256": sha256_file(identity_path),
                "ownership": str(ownership_path.relative_to(root)),
                "ownershipSha256": sha256_file(ownership_path),
                "pipelineMetadata": str(pipeline_meta_path.relative_to(root)),
                "pipelineMetadataSha256": pipeline_audit["sha256"],
                "selfReview": self_review_audit,
                "outputs": {
                    "transparentBoard": (
                        "identity/identity-board-transparent.png"
                    ),
                    "transparentBoardSha256": board_audit["fileSha256"],
                    "transparentBoardAudit": board_audit,
                    "poses": pose_audits,
                },
            }
            write_json(staged_source_meta, source_meta)

            metadata = {
                "schemaVersion": 1,
                "formId": form_id,
                "displayName": display_name,
                "artStatus": "in_production",
                "productionScope": "identity_key_pose_gate",
                "runtimeEnabled": False,
                "rideableTarget": rideable_target,
                "runtimeFrameSize": [
                    RUNTIME_FRAME_SIZE,
                    RUNTIME_FRAME_SIZE,
                ],
                "views": ["front_3quarter_sw", "back_3quarter_ne"],
                "identity": {
                    "status": "self_review_passed_owner_pending",
                    "sourceFrameSize": list(IDENTITY_POSE_SIZE),
                    "board": "identity/identity-board-transparent.png",
                    "poses": {
                        pose: f"identity/{pose}.png"
                        for pose in IDENTITY_POSES
                    },
                },
                "actions": action_metadata(),
                "worldVisual": {
                    "status": "not_produced",
                    "strategy": "independent_8",
                    "runtimeMirroring": False,
                    "directions": CANONICAL_DIRECTIONS,
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
                "supportedMountedCharacterIds": list(
                    supported_character_ids
                ),
                "sourceArchive": {
                    "policy": "tracked_lossless_webp_with_original_sha256",
                    "raw": "source/identity-board-raw.webp",
                    "sourceMetadata": (
                        "source/identity-board-source-meta.json"
                    ),
                    "pipelineMetadata": (
                        "source/identity-board-pipeline-meta.json"
                    ),
                    "prompt": str(prompt_path.relative_to(root)),
                },
                "evidence": {
                    "identityBoard": (
                        "identity/identity-board-transparent.png"
                    ),
                    "identityBoardSha256": board_audit["fileSha256"],
                    "identityGateAudit": {
                        "schemaVersion": 1,
                        "status": (
                            "self_review_passed_owner_review_pending"
                        ),
                        "pipelineMetadata": pipeline_audit,
                        "selfReview": self_review_audit,
                        "transparentBoard": board_audit,
                        "poses": pose_audits,
                    },
                },
                "keyPoseReviewStatus": "owner_review_pending",
                "ownerReviewStatus": "pending",
                "notes": (
                    "Identity and four key poses only. World and battle "
                    "animation matrices are intentionally not produced in "
                    "this gate."
                ),
            }
            write_json(staged_metadata, metadata)

            def precommit() -> None:
                reject_path_aliases(all_inputs, output_paths)
                for protected_path in [
                    *input_state,
                    *output_state,
                    contact_path,
                ]:
                    reject_symlink_components(
                        protected_path,
                        root,
                        f"protected identity path {protected_path.name}",
                    )
                verify_file_state(input_state)
                verify_file_state(output_state)
                if force and output_state[metadata_path] is not None:
                    read_force_metadata(
                        metadata_path,
                        form_id,
                        expected_shape=metadata,
                    )

            def validate_backup(target: Path, backup: Path) -> None:
                expected_hash = output_state[target]
                if expected_hash is None or sha256_file(backup) != expected_hash:
                    if target == metadata_path:
                        read_force_metadata(
                            backup,
                            form_id,
                            expected_shape=metadata,
                        )
                    raise FinalizeError(
                        f"protected output changed during commit: "
                        f"{display_path(target)}"
                    )
                if target == metadata_path:
                    read_force_metadata(
                        backup,
                        form_id,
                        expected_shape=metadata,
                    )

            commit_staged_outputs(
                transaction_root,
                {
                    raw_webp: staged_webp,
                    source_meta_path: staged_source_meta,
                    metadata_path: staged_metadata,
                },
                allowed_root=root,
                precommit=precommit,
                validate_backup=validate_backup,
            )
        finally:
            shutil.rmtree(transaction_root, ignore_errors=True)
    print(f"finalized {form_id}: {display_path(metadata_path)}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--catalog", type=Path, default=DEFAULT_CATALOG)
    parser.add_argument("--form", action="append", required=True, dest="forms")
    parser.add_argument("--force", action="store_true")
    parser.add_argument(
        "--check-only",
        action="store_true",
        help="revalidate strict identity inputs without writing any files",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.force and args.check_only:
        raise FinalizeError("--force and --check-only cannot be used together")
    catalog_path = args.catalog.resolve()
    catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    forms = {
        str(form.get("formId", "")): form
        for form in catalog.get("forms", [])
        if isinstance(form, dict)
    }
    unknown = [form_id for form_id in args.forms if form_id not in forms]
    if unknown:
        raise FinalizeError(f"unknown catalog form(s): {', '.join(unknown)}")
    for form_id in args.forms:
        finalize_form(
            forms[form_id],
            args.force,
            check_only=args.check_only,
        )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (FinalizeError, json.JSONDecodeError, OSError) as exc:
        raise SystemExit(f"error: {exc}") from exc
