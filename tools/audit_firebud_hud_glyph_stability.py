#!/usr/bin/env python3
"""Audit Firebud task-HUD glyphs from self-contained pixels.

The Codex/Computer Use presentation stream may transport a later screenshot as
an incremental frame.  Showing several nearly identical frames in one tool
result can therefore make unchanged task-HUD pixels look absent even though the
PNG/JPEG on disk is complete.  This audit never judges a streamed preview.  It
decodes every source file (and every video frame) independently, checks four
fixed player-visible task-HUD regions, and builds one precomposed review board.

The module is also imported by the Firebud action, Computer Use, and owner-video
recorders so a future genuinely blank title/body/button fails closed.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import math
import os
import re
import subprocess
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping, Sequence

import numpy as np
from PIL import Image, ImageDraw, UnidentifiedImageError


REPO_ROOT = Path(__file__).resolve().parents[1]
EXPECTED_VIEWPORT = (1280, 720)
COMPUTER_USE_FRAME = (640, 392)
COMPUTER_USE_TITLE_BAR_HEIGHT = 32
TASK_HUD_CROP = (999, 121, 1205, 522)
VIDEO_CROP = (1020, 136, 1186, 472)
ACTION_KINDS = (
    "pointer",
    "movement_path",
    "warp",
    "collision",
    "occlusion",
)
MAP_IDS = ("firebud_training_yard", "firebud_village_gate")
SAFE_RUN_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")
DEFAULT_RUNTIME_ACTION_ROOT = Path(
    "client/godot/assets/maps/firebud_region_visual_v2/evidence/runtime-actions"
)
DEFAULT_COMPUTER_USE_ROOT = Path(
    "client/godot/assets/maps/firebud_region_visual_v2/evidence/"
    "computer-use-actions/raw"
)
DEFAULT_OUTPUT_ROOT = Path(".run/evidence/r1_w010")

# Coordinates are native 1280x720 pixels.  The regions deliberately avoid card
# borders where possible.  Edge energy is robust to CJK font antialiasing,
# Metal readback, H.264 4:2:0 conversion, and the half-resolution Computer Use
# JPEGs after normalization.  Thresholds sit well below the current weakest
# genuine capture while still rejecting a blank panel/title/button.
REGIONS: dict[str, dict[str, Any]] = {
    "tabs": {
        "rect": (1020, 136, 1186, 160),
        "minimumEdgeEnergy": 25_000,
        "meaning": "任务/组队页签字形",
    },
    "title": {
        "rect": (1020, 193, 1110, 218),
        "minimumEdgeEnergy": 15_000,
        "meaning": "任务追踪标题字形",
    },
    "body": {
        "rect": (1027, 225, 1175, 425),
        "minimumEdgeEnergy": 200_000,
        "meaning": "任务条目标题与正文",
    },
    "routeButton": {
        "rect": (1068, 453, 1138, 472),
        "minimumEdgeEnergy": 7_000,
        "meaning": "自动寻路按钮字形",
    },
}
REFERENCE_MAXIMUM_MEAN_ABSOLUTE_ERROR = 35.0
REFERENCE_MINIMUM_LUMINANCE_CORRELATION = 0.45


class HudGlyphAuditError(RuntimeError):
    """A self-contained Firebud HUD evidence source failed its contract."""


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace(
        "+00:00", "Z"
    )


def _default_run_id() -> str:
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")
    return f"firebud-hud-glyph-{timestamp}-{uuid.uuid4().hex[:8]}"


def _repo_relative(path: Path) -> str:
    try:
        return path.resolve().relative_to(REPO_ROOT).as_posix()
    except ValueError:
        return str(path.resolve())


def _sha256_bytes(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def _artifact(path: Path) -> dict[str, Any]:
    payload = path.read_bytes()
    return {
        "path": _repo_relative(path),
        "sha256": _sha256_bytes(payload),
        "bytes": len(payload),
    }


def _open_image(source: Path | bytes | bytearray | Image.Image) -> Image.Image:
    try:
        if isinstance(source, Image.Image):
            return source.convert("RGB")
        if isinstance(source, (bytes, bytearray)):
            with Image.open(io.BytesIO(bytes(source))) as opened:
                return opened.convert("RGB")
        with Image.open(Path(source)) as opened:
            return opened.convert("RGB")
    except (OSError, UnidentifiedImageError) as error:
        raise HudGlyphAuditError("HUD 字形证据图片无法解码") from error


def normalize_review_image(
    source: Path | bytes | bytearray | Image.Image,
) -> tuple[Image.Image, str]:
    """Return a self-contained 1280x720 viewport and its source format."""

    image = _open_image(source)
    if image.size == EXPECTED_VIEWPORT:
        return image, "native_1280x720"
    if image.size == COMPUTER_USE_FRAME:
        viewport = image.crop(
            (
                0,
                COMPUTER_USE_TITLE_BAR_HEIGHT,
                COMPUTER_USE_FRAME[0],
                COMPUTER_USE_FRAME[1],
            )
        )
        return (
            viewport.resize(EXPECTED_VIEWPORT, Image.Resampling.BILINEAR),
            "computer_use_640x392_titlebar_normalized",
        )
    raise HudGlyphAuditError(
        "HUD 字形证据尺寸不是 1280x720 或 Computer Use 640x392："
        f"{image.size}"
    )


def _edge_energy(rgb: np.ndarray) -> int:
    if rgb.ndim != 3 or rgb.shape[2] != 3 or min(rgb.shape[:2]) < 2:
        return 0
    pixels = rgb.astype(np.int32, copy=False)
    luminance = (
        pixels[:, :, 0] * 299
        + pixels[:, :, 1] * 587
        + pixels[:, :, 2] * 114
    ) // 1000
    return int(
        np.abs(np.diff(luminance, axis=0)).sum()
        + np.abs(np.diff(luminance, axis=1)).sum()
    )


def _luminance(rgb: np.ndarray) -> np.ndarray:
    pixels = rgb.astype(np.float32, copy=False)
    return (
        pixels[:, :, 0] * 0.299
        + pixels[:, :, 1] * 0.587
        + pixels[:, :, 2] * 0.114
    )


def _reference_comparison(
    rgb: np.ndarray,
    reference_rgb: np.ndarray,
) -> dict[str, Any]:
    regions: dict[str, dict[str, Any]] = {}
    for region_id, contract in REGIONS.items():
        x1, y1, x2, y2 = contract["rect"]
        current = _luminance(rgb[y1:y2, x1:x2])
        reference = _luminance(reference_rgb[y1:y2, x1:x2])
        mean_absolute_error = float(np.abs(current - reference).mean())
        current_flat = current.ravel()
        reference_flat = reference.ravel()
        if float(current_flat.std()) <= 1e-6 or float(reference_flat.std()) <= 1e-6:
            correlation = 1.0 if np.array_equal(current_flat, reference_flat) else 0.0
        else:
            correlation = float(np.corrcoef(current_flat, reference_flat)[0, 1])
        passed = (
            math.isfinite(correlation)
            and mean_absolute_error <= REFERENCE_MAXIMUM_MEAN_ABSOLUTE_ERROR
            and correlation >= REFERENCE_MINIMUM_LUMINANCE_CORRELATION
        )
        regions[region_id] = {
            "meanAbsoluteLuminanceError": round(mean_absolute_error, 4),
            "maximumMeanAbsoluteLuminanceError": (
                REFERENCE_MAXIMUM_MEAN_ABSOLUTE_ERROR
            ),
            "luminanceCorrelation": round(correlation, 6),
            "minimumLuminanceCorrelation": (
                REFERENCE_MINIMUM_LUMINANCE_CORRELATION
            ),
            "passed": passed,
        }
    return {
        "method": "normalized_region_luminance_mae_and_correlation",
        "passed": all(value["passed"] for value in regions.values()),
        "regions": regions,
    }


def _analyze_native_array(rgb: np.ndarray) -> dict[str, Any]:
    if tuple(reversed(rgb.shape[:2])) != EXPECTED_VIEWPORT:
        raise HudGlyphAuditError(
            f"HUD 字形像素数组尺寸错误：{tuple(reversed(rgb.shape[:2]))}"
        )
    region_results: dict[str, dict[str, Any]] = {}
    for region_id, contract in REGIONS.items():
        x1, y1, x2, y2 = contract["rect"]
        energy = _edge_energy(rgb[y1:y2, x1:x2])
        minimum = int(contract["minimumEdgeEnergy"])
        region_results[region_id] = {
            "edgeEnergy": energy,
            "minimumEdgeEnergy": minimum,
            "passed": energy >= minimum,
            "meaning": contract["meaning"],
        }
    task_crop = rgb[
        TASK_HUD_CROP[1] : TASK_HUD_CROP[3],
        TASK_HUD_CROP[0] : TASK_HUD_CROP[2],
    ]
    passed = all(bool(value["passed"]) for value in region_results.values())
    return {
        "status": "passed" if passed else "failed",
        "passed": passed,
        "regions": region_results,
        "taskHudDecodedRgbSha256": _sha256_bytes(task_crop.tobytes()),
        "taskHudSize": [TASK_HUD_CROP[2] - TASK_HUD_CROP[0], TASK_HUD_CROP[3] - TASK_HUD_CROP[1]],
    }


def analyze_image(
    source: Path | bytes | bytearray | Image.Image,
    *,
    label: str = "",
    require_task_hud: bool = True,
    reference: Path | bytes | bytearray | Image.Image | None = None,
    raise_on_failure: bool = True,
) -> dict[str, Any]:
    image, source_format = normalize_review_image(source)
    result: dict[str, Any] = {
        "label": str(label),
        "sourceFormat": source_format,
        "normalizedViewport": list(EXPECTED_VIEWPORT),
        "taskHudRequired": bool(require_task_hud),
    }
    if not require_task_hud:
        result.update(
            {
                "status": "not_applicable",
                "passed": True,
                "reason": "pointer action owns the full map panel instead of the task HUD",
            }
        )
        return result
    result.update(_analyze_native_array(np.asarray(image, dtype=np.uint8)))
    if reference is not None:
        reference_image, reference_format = normalize_review_image(reference)
        reference_result = _reference_comparison(
            np.asarray(image, dtype=np.uint8),
            np.asarray(reference_image, dtype=np.uint8),
        )
        reference_result["referenceFormat"] = reference_format
        result["referenceComparison"] = reference_result
        if not bool(reference_result["passed"]):
            result["status"] = "failed"
            result["passed"] = False
    if not bool(result["passed"]):
        failed = [
            region_id
            for region_id, value in result["regions"].items()
            if not bool(value["passed"])
        ]
        reference_failures = [
            region_id
            for region_id, value in result.get("referenceComparison", {})
            .get("regions", {})
            .items()
            if not bool(value["passed"])
        ]
        result["failedRegions"] = sorted(set(failed + reference_failures))
        if raise_on_failure:
            raise HudGlyphAuditError(
                "HUD 标题/正文/按钮像素不完整："
                f"{label or '<image>'} {result['failedRegions']}"
            )
    return result


def _video_relative_regions() -> dict[str, tuple[int, int, int, int]]:
    x0, y0, _x2, _y2 = VIDEO_CROP
    return {
        region_id: (
            int(contract["rect"][0]) - x0,
            int(contract["rect"][1]) - y0,
            int(contract["rect"][2]) - x0,
            int(contract["rect"][3]) - y0,
        )
        for region_id, contract in REGIONS.items()
    }


def analyze_video(
    ffmpeg: str,
    video_path: Path,
    *,
    expected_frame_count: int | None = None,
    environment: Mapping[str, str] | None = None,
) -> dict[str, Any]:
    """Decode and gate every task-HUD frame without materializing frame files."""

    video_path = Path(video_path).resolve()
    if not video_path.is_file():
        raise HudGlyphAuditError(f"HUD 连续帧视频不存在：{video_path}")
    x1, y1, x2, y2 = VIDEO_CROP
    width = x2 - x1
    height = y2 - y1
    frame_bytes = width * height * 3
    command = [
        str(ffmpeg),
        "-nostdin",
        "-v",
        "error",
        "-i",
        str(video_path),
        "-map",
        "0:v:0",
        "-vf",
        f"crop={width}:{height}:{x1}:{y1}",
        "-pix_fmt",
        "rgb24",
        "-f",
        "rawvideo",
        "-",
    ]
    process = subprocess.Popen(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        env=dict(environment) if environment is not None else None,
    )
    assert process.stdout is not None
    assert process.stderr is not None
    relative_regions = _video_relative_regions()
    minima = {region_id: math.inf for region_id in REGIONS}
    maxima = {region_id: 0 for region_id in REGIONS}
    first_failure: dict[str, Any] | None = None
    frame_count = 0
    stream_hash = hashlib.sha256()
    try:
        while True:
            payload = process.stdout.read(frame_bytes)
            if not payload:
                break
            if len(payload) != frame_bytes:
                raise HudGlyphAuditError(
                    f"HUD 连续帧 rawvideo 尾帧不完整：{len(payload)}/{frame_bytes}"
                )
            stream_hash.update(frame_count.to_bytes(8, "big"))
            stream_hash.update(payload)
            frame = np.frombuffer(payload, dtype=np.uint8).reshape(
                (height, width, 3)
            )
            failures: list[str] = []
            energies: dict[str, int] = {}
            for region_id, rect in relative_regions.items():
                rx1, ry1, rx2, ry2 = rect
                energy = _edge_energy(frame[ry1:ry2, rx1:rx2])
                energies[region_id] = energy
                minima[region_id] = min(float(minima[region_id]), energy)
                maxima[region_id] = max(int(maxima[region_id]), energy)
                if energy < int(REGIONS[region_id]["minimumEdgeEnergy"]):
                    failures.append(region_id)
            if failures and first_failure is None:
                first_failure = {
                    "frameIndex": frame_count,
                    "failedRegions": failures,
                    "edgeEnergy": energies,
                }
            frame_count += 1
    except BaseException:
        process.kill()
        process.wait()
        process.stdout.close()
        process.stderr.close()
        raise
    process.stdout.close()
    stderr = process.stderr.read().decode("utf-8", errors="replace").strip()
    process.stderr.close()
    return_code = process.wait()
    if return_code != 0:
        raise HudGlyphAuditError(
            "HUD 连续帧 ffmpeg 解码失败：" + (stderr or f"returncode={return_code}")
        )
    if frame_count <= 0:
        raise HudGlyphAuditError("HUD 连续帧视频没有解码出画面")
    if expected_frame_count is not None and frame_count != int(expected_frame_count):
        raise HudGlyphAuditError(
            f"HUD 连续帧数不一致：{frame_count}!={expected_frame_count}"
        )
    if first_failure is not None:
        raise HudGlyphAuditError(
            "HUD 连续视频出现空白标题/正文/按钮："
            + json.dumps(first_failure, ensure_ascii=False)
        )
    return {
        "status": "passed",
        "passed": True,
        "source": _repo_relative(video_path),
        "decodeMode": "every_video_frame_independent_rgb24_crop",
        "frameCount": frame_count,
        "passedFrameCount": frame_count,
        "consecutiveFrames": True,
        "firstFailure": None,
        "frameStreamSha256": stream_hash.hexdigest(),
        "regions": {
            region_id: {
                "minimumObservedEdgeEnergy": int(minima[region_id]),
                "maximumObservedEdgeEnergy": int(maxima[region_id]),
                "minimumRequiredEdgeEnergy": int(
                    REGIONS[region_id]["minimumEdgeEnergy"]
                ),
                "meaning": REGIONS[region_id]["meaning"],
                "passed": True,
            }
            for region_id in REGIONS
        },
    }


def build_task_hud_board(
    items: Sequence[Mapping[str, Any]],
    output_path: Path,
    *,
    columns: int = 4,
) -> dict[str, Any]:
    """Precompose independent task-HUD crops into one non-incremental bitmap."""

    if not items:
        raise HudGlyphAuditError("HUD 审片板没有输入")
    if columns < 1 or columns > 8:
        raise HudGlyphAuditError("HUD 审片板列数必须介于 1 与 8")
    crop_width = TASK_HUD_CROP[2] - TASK_HUD_CROP[0]
    crop_height = TASK_HUD_CROP[3] - TASK_HUD_CROP[1]
    label_height = 24
    padding = 8
    tile_width = crop_width + padding * 2
    tile_height = crop_height + label_height + padding * 2
    rows = math.ceil(len(items) / columns)
    board = Image.new(
        "RGB",
        (tile_width * columns, tile_height * rows),
        (24, 20, 16),
    )
    draw = ImageDraw.Draw(board)
    for index, item in enumerate(items):
        source = item.get("source")
        if not isinstance(source, (Path, bytes, bytearray, Image.Image)):
            raise HudGlyphAuditError("HUD 审片板 source 类型不受支持")
        image, _source_format = normalize_review_image(source)
        crop = image.crop(TASK_HUD_CROP)
        column = index % columns
        row = index // columns
        left = column * tile_width + padding
        top = row * tile_height + padding + label_height
        board.paste(crop, (left, top))
        label = str(item.get("label", f"frame-{index + 1}"))
        draw.text(
            (column * tile_width + padding, row * tile_height + padding + 4),
            label,
            fill=(240, 220, 180),
        )
    output_path.parent.mkdir(parents=True, exist_ok=True)
    board.save(output_path, format="PNG", optimize=False)
    return {
        **_artifact(output_path),
        "width": board.width,
        "height": board.height,
        "itemCount": len(items),
        "presentationMode": "single_precomposed_bitmap_no_incremental_frames",
    }


def build_task_hud_board_bytes(
    items: Sequence[Mapping[str, Any]],
    *,
    columns: int = 4,
) -> bytes:
    with io.BytesIO() as output:
        # Reuse the exact board layout without touching the filesystem.
        if not items:
            raise HudGlyphAuditError("HUD 审片板没有输入")
        if columns < 1 or columns > 8:
            raise HudGlyphAuditError("HUD 审片板列数必须介于 1 与 8")
        crop_width = TASK_HUD_CROP[2] - TASK_HUD_CROP[0]
        crop_height = TASK_HUD_CROP[3] - TASK_HUD_CROP[1]
        label_height = 24
        padding = 8
        tile_width = crop_width + padding * 2
        tile_height = crop_height + label_height + padding * 2
        rows = math.ceil(len(items) / columns)
        board = Image.new(
            "RGB",
            (tile_width * columns, tile_height * rows),
            (24, 20, 16),
        )
        draw = ImageDraw.Draw(board)
        for index, item in enumerate(items):
            source = item.get("source")
            if not isinstance(source, (Path, bytes, bytearray, Image.Image)):
                raise HudGlyphAuditError("HUD 审片板 source 类型不受支持")
            image, _source_format = normalize_review_image(source)
            column = index % columns
            row = index // columns
            left = column * tile_width + padding
            top = row * tile_height + padding + label_height
            board.paste(image.crop(TASK_HUD_CROP), (left, top))
            draw.text(
                (column * tile_width + padding, row * tile_height + padding + 4),
                str(item.get("label", f"frame-{index + 1}")),
                fill=(240, 220, 180),
            )
        board.save(output, format="PNG", optimize=False)
        return output.getvalue()


def _parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--runtime-action-root",
        type=Path,
        default=DEFAULT_RUNTIME_ACTION_ROOT,
    )
    parser.add_argument(
        "--computer-use-root",
        type=Path,
        default=DEFAULT_COMPUTER_USE_ROOT,
    )
    parser.add_argument("--video-run", type=Path, required=True)
    parser.add_argument("--output-root", type=Path, default=DEFAULT_OUTPUT_ROOT)
    parser.add_argument("--run-id", default="")
    parser.add_argument("--ffmpeg", default=os.environ.get("FFMPEG_BIN", "ffmpeg"))
    return parser.parse_args(argv)


def _resolve_repo_path(path: Path) -> Path:
    return path.resolve() if path.is_absolute() else (REPO_ROOT / path).resolve()


def audit(args: argparse.Namespace) -> tuple[Path, bool]:
    runtime_root = _resolve_repo_path(args.runtime_action_root)
    computer_use_root = _resolve_repo_path(args.computer_use_root)
    video_run = _resolve_repo_path(args.video_run)
    output_root = _resolve_repo_path(args.output_root)
    run_id = str(args.run_id).strip() or _default_run_id()
    if SAFE_RUN_ID.fullmatch(run_id) is None:
        raise HudGlyphAuditError("--run-id 含不安全字符")
    run_dir = output_root / run_id
    run_dir.mkdir(parents=True, exist_ok=False)

    stills: list[dict[str, Any]] = []
    runtime_by_action: dict[tuple[str, str], Path] = {}
    board_items: list[dict[str, Any]] = []
    for map_id in MAP_IDS:
        for action_kind in ACTION_KINDS:
            path = runtime_root / map_id / f"{action_kind}.png"
            if not path.is_file():
                raise HudGlyphAuditError(f"缺少 runtime action PNG：{path}")
            result = analyze_image(
                path,
                label=f"runtime:{map_id}:{action_kind}",
                raise_on_failure=False,
            )
            result["artifact"] = _artifact(path)
            stills.append(result)
            runtime_by_action[(map_id, action_kind)] = path
            board_items.append(
                {
                    "label": f"runtime {map_id} {action_kind}",
                    "source": path,
                }
            )

    computer_use: list[dict[str, Any]] = []
    for map_id in MAP_IDS:
        for action_kind in ACTION_KINDS:
            path = computer_use_root / f"{map_id}_{action_kind}-after.jpeg"
            if not path.is_file():
                raise HudGlyphAuditError(f"缺少 Computer Use after JPEG：{path}")
            require_task_hud = action_kind != "pointer"
            result = analyze_image(
                path,
                label=f"computer_use:{map_id}:{action_kind}:after",
                require_task_hud=require_task_hud,
                reference=(
                    runtime_by_action[(map_id, action_kind)]
                    if require_task_hud
                    else None
                ),
                raise_on_failure=False,
            )
            result["artifact"] = _artifact(path)
            computer_use.append(result)
            if require_task_hud:
                board_items.append(
                    {
                        "label": f"computer-use {map_id} {action_kind}",
                        "source": path,
                    }
                )

    video_results: list[dict[str, Any]] = []
    segment_root = video_run / "segments"
    for map_id in MAP_IDS:
        for mode in ("idle", "moving"):
            path = segment_root / f"{map_id}-{mode}.mp4"
            video_results.append(analyze_video(str(args.ffmpeg), path))

    board = build_task_hud_board(
        board_items,
        run_dir / "self-contained-hud-glyph-board.png",
    )
    runtime_failures = [
        value["label"] for value in stills if not bool(value["passed"])
    ]
    computer_use_failures = [
        value["label"] for value in computer_use if not bool(value["passed"])
    ]
    errors = [
        *(f"runtime image failed: {label}" for label in runtime_failures),
        *(
            f"computer use image failed: {label}"
            for label in computer_use_failures
        ),
    ]
    passed = not errors
    report = {
        "schemaVersion": 1,
        "reportType": "beastbound_firebud_hud_glyph_stability_audit",
        "generatedAtUtc": _utc_now(),
        "status": "passed" if passed else "failed",
        "result": "PASS" if passed else "FAIL",
        "rootCauseClassification": (
            "no_runtime_regression_detected_but_computer_use_source_frame_incomplete"
            if not runtime_failures and computer_use_failures
            else "no_missing_glyph_pixels_detected"
            if passed
            else "runtime_or_mixed_evidence_failure"
        ),
        "runtimeFontOrCanvasRegressionFound": bool(runtime_failures),
        "runtimeEvidenceFilesSelfContained": not runtime_failures,
        "computerUseEvidenceFilesSelfContained": not computer_use_failures,
        "presentationContract": (
            "judge decoded files independently or use the single precomposed board; "
            "never infer missing glyphs from sequential incremental previews"
        ),
        "runtimeActionImages": stills,
        "computerUseAfterImages": computer_use,
        "continuousVideos": video_results,
        "continuousFrameCount": sum(
            int(value["frameCount"]) for value in video_results
        ),
        "board": board,
        "errors": errors,
    }
    report_path = run_dir / "hud-glyph-stability.json"
    report_path.write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    retained = sorted(
        (path for path in run_dir.iterdir() if path.is_file()),
        key=lambda path: path.name,
    )
    manifest_path = run_dir / "SHA256SUMS"
    manifest_path.write_text(
        "".join(
            f"{_sha256_bytes(path.read_bytes())}  {path.name}\n"
            for path in retained
        ),
        encoding="utf-8",
    )
    return report_path, passed


def main(argv: Sequence[str] | None = None) -> int:
    args = _parse_args(argv)
    try:
        report_path, passed = audit(args)
    except (HudGlyphAuditError, FileExistsError, OSError, ValueError) as error:
        print(f"Firebud HUD glyph stability audit failed: {error}", file=sys.stderr)
        return 1
    if not passed:
        print(
            "Firebud HUD glyph stability audit: FAIL "
            f"report={_repo_relative(report_path)}",
            file=sys.stderr,
        )
        return 1
    print(
        "Firebud HUD glyph stability audit: PASS "
        f"report={_repo_relative(report_path)}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
