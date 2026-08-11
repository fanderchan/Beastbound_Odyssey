#!/usr/bin/env python3
"""Build Ember Spark's reviewed six-frame world gait from frozen inputs."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw


BUNDLE_ROOT = Path(__file__).resolve().parents[2]
SOURCE_WORLD = BUNDLE_ROOT / "source" / "world"
RUNTIME_WORLD = BUNDLE_ROOT / "world" / "directions"
QA_ROOT = BUNDLE_ROOT / "qa"

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
SELECTIONS = {
    "south": ("g1", "c1", "c3", "g2", "c4", "c2"),
    "southwest": ("g1", "c2", "c8", "g5", "c4", "c5"),
    "west": ("g1", "c1", "c3", "g5", "c4", "c2"),
    "northwest": ("g1", "c1", "c3", "g5", "c6", "c5"),
    "north": ("g1", "c1", "c2", "g4", "c4", "c3"),
    "northeast": ("g1", "c4", "c3", "g5", "c8", "c6"),
    "east": ("g1", "c4", "c3", "g5", "c8", "c5"),
    "southeast": ("g1", "c3", "c2", "g5", "c6", "c5"),
}


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _aggregate_sha256(paths: list[Path]) -> str:
    digest = hashlib.sha256()
    for path in sorted(paths, key=lambda value: value.relative_to(BUNDLE_ROOT).as_posix()):
        relative = path.relative_to(BUNDLE_ROOT).as_posix()
        digest.update(f"{relative}\t{_sha256(path)}\n".encode("utf-8"))
    return digest.hexdigest()


def _load_rgba(path: Path) -> Image.Image:
    with Image.open(path) as opened:
        opened.load()
        image = opened.convert("RGBA")
    if image.size != (512, 512):
        raise ValueError(f"selected input must be 512x512: {path} -> {image.size}")
    return image


def _clean_key_magenta(image: Image.Image) -> Image.Image:
    cleaned: list[tuple[int, int, int, int]] = []
    pixels = (
        image.get_flattened_data()
        if hasattr(image, "get_flattened_data")
        else image.getdata()
    )
    for red, green, blue, alpha in pixels:
        is_key = red >= 185 and blue >= 135 and green <= 95 and red + blue >= 390
        cleaned.append((0, 0, 0, 0) if is_key else (red, green, blue, alpha))
    result = Image.new("RGBA", image.size)
    result.putdata(cleaned)
    return result


def _alpha_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    bbox = image.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("empty-alpha gait input")
    return bbox


def _alpha_aware_resize(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    # Pillow's RGBa mode stores premultiplied color, preventing transparent-edge
    # key colors from bleeding into runtime sprites during Lanczos resampling.
    return image.convert("RGBa").resize(size, Image.Resampling.LANCZOS).convert("RGBA")


def _normalize_cycle(frames: list[Image.Image]) -> list[Image.Image]:
    cleaned = [_clean_key_magenta(frame) for frame in frames]
    boxes = [_alpha_bbox(frame) for frame in cleaned]
    heights = sorted(box[3] - box[1] for box in boxes)
    target_height = round((heights[2] + heights[3]) / 2)
    target_bottom = 478
    normalized: list[Image.Image] = []
    for frame, bbox in zip(cleaned, boxes, strict=True):
        crop = frame.crop(bbox)
        width = max(1, round(crop.width * target_height / max(1, crop.height)))
        resized = _alpha_aware_resize(crop, (width, target_height))
        canvas = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
        canvas.alpha_composite(resized, (round((512 - width) / 2), target_bottom - target_height))
        normalized.append(canvas)
    return normalized


def _selected_inputs(direction: str) -> list[Path]:
    root = SOURCE_WORLD / direction / "gait_v3_inputs"
    return [
        root / f"walk-{phase}-{token}.png"
        for phase, token in enumerate(SELECTIONS[direction], start=1)
    ]


def _save_frames() -> tuple[list[Path], list[Path], list[Path]]:
    input_paths: list[Path] = []
    source_paths: list[Path] = []
    runtime_paths: list[Path] = []
    for direction in DIRECTIONS:
        selected = _selected_inputs(direction)
        input_paths.extend(selected)
        frames = _normalize_cycle([_load_rgba(path) for path in selected])
        source_target = SOURCE_WORLD / direction / "frames" / "walk"
        runtime_target = RUNTIME_WORLD / direction / "walk"
        source_target.mkdir(parents=True, exist_ok=True)
        runtime_target.mkdir(parents=True, exist_ok=True)
        for phase, frame in enumerate(frames, start=1):
            source_path = source_target / f"walk-{phase}.png"
            runtime_path = runtime_target / f"walk-{phase}.png"
            frame.save(source_path, optimize=True)
            _alpha_aware_resize(frame, (256, 256)).save(runtime_path, optimize=True)
            source_paths.append(source_path)
            runtime_paths.append(runtime_path)
    return input_paths, source_paths, runtime_paths


def _contact_sheet(source_paths: list[Path]) -> Path:
    width, cell_height = 1280, 190
    canvas = Image.new("RGBA", (width, cell_height * len(DIRECTIONS)), (38, 31, 28, 255))
    draw = ImageDraw.Draw(canvas)
    for row, direction in enumerate(DIRECTIONS):
        y = row * cell_height
        draw.rectangle((0, y, width - 1, y + cell_height - 1), outline=(116, 82, 52, 255), width=2)
        draw.text((10, y + 10), direction, fill=(255, 225, 171, 255))
        direction_paths = [path for path in source_paths if f"/world/{direction}/" in path.as_posix()]
        for phase, path in enumerate(direction_paths, start=1):
            frame = _load_rgba(path)
            preview = _alpha_aware_resize(frame, (176, 176))
            x = 128 + (phase - 1) * 190
            canvas.alpha_composite(preview, (x, y + 7))
            draw.text((x + 6, y + 8), str(phase), fill=(230, 235, 230, 255))
    output = QA_ROOT / "world-walk-gait-v3-contact.png"
    output.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(output, optimize=True)
    return output


def _frame_metrics(paths: list[Path]) -> tuple[dict[str, dict[str, float | int]], int, int]:
    metrics: dict[str, dict[str, float | int]] = {}
    edge_touches = 0
    maximum_baseline_drift = 0
    for direction in DIRECTIONS:
        direction_paths = [path for path in paths if direction in path.parts]
        boxes = []
        for path in direction_paths:
            image = _load_runtime_or_source(path)
            bbox = _alpha_bbox(image)
            boxes.append(bbox)
            if bbox[0] <= 0 or bbox[1] <= 0 or bbox[2] >= image.width or bbox[3] >= image.height:
                edge_touches += 1
        bottoms = [box[3] for box in boxes]
        centers = [(box[0] + box[2]) / 2 for box in boxes]
        heights = [box[3] - box[1] for box in boxes]
        baseline_drift = max(bottoms) - min(bottoms)
        maximum_baseline_drift = max(maximum_baseline_drift, baseline_drift)
        metrics[direction] = {
            "baselineBottomExclusiveMin": min(bottoms),
            "baselineBottomExclusiveMax": max(bottoms),
            "baselineDriftPx": baseline_drift,
            "centerDriftPx": round(max(centers) - min(centers), 3),
            "alphaHeightRatio": round(max(heights) / min(heights), 5),
        }
    return metrics, edge_touches, maximum_baseline_drift


def _load_runtime_or_source(path: Path) -> Image.Image:
    with Image.open(path) as opened:
        opened.load()
        return opened.convert("RGBA")


def _duplicate_and_mirror_counts(paths: list[Path]) -> tuple[int, int]:
    decoded: list[tuple[Path, Image.Image, str]] = []
    for path in paths:
        image = _load_runtime_or_source(path)
        digest = hashlib.sha256(image.tobytes()).hexdigest()
        decoded.append((path, image, digest))
    duplicate_count = len(decoded) - len({digest for _, _, digest in decoded})
    mirror_count = 0
    for left_index, (left_path, left_image, _) in enumerate(decoded):
        left_direction = next(direction for direction in DIRECTIONS if direction in left_path.parts)
        mirrored = left_image.transpose(Image.Transpose.FLIP_LEFT_RIGHT).tobytes()
        for right_path, right_image, _ in decoded[left_index + 1 :]:
            right_direction = next(direction for direction in DIRECTIONS if direction in right_path.parts)
            if left_direction != right_direction and mirrored == right_image.tobytes():
                mirror_count += 1
    return duplicate_count, mirror_count


def main() -> None:
    input_paths, source_paths, runtime_paths = _save_frames()
    contact = _contact_sheet(source_paths)
    source_metrics, source_edge_touches, source_baseline_drift = _frame_metrics(source_paths)
    runtime_metrics, runtime_edge_touches, runtime_baseline_drift = _frame_metrics(runtime_paths)
    source_duplicates, source_mirrors = _duplicate_and_mirror_counts(source_paths)
    runtime_duplicates, runtime_mirrors = _duplicate_and_mirror_counts(runtime_paths)
    errors: list[str] = []
    if source_edge_touches or runtime_edge_touches:
        errors.append("alpha touches a canvas edge")
    if source_baseline_drift > 1 or runtime_baseline_drift > 1:
        errors.append("within-direction baseline drift exceeds 1 px")
    if source_duplicates or runtime_duplicates:
        errors.append("exact duplicate walk frames detected")
    if source_mirrors or runtime_mirrors:
        errors.append("exact cross-direction horizontal mirror detected")
    report = {
        "schemaVersion": 1,
        "characterId": "ember_spark_v1",
        "repairId": "ember_spark_world_gait_v3",
        "status": "passed" if not errors else "failed",
        "contract": {"directions": 8, "walkFramesPerDirection": 6, "runtimeFps": 9},
        "counts": {"selectedInputs": len(input_paths), "sourceWalkFrames": len(source_paths), "runtimeWalkFrames": len(runtime_paths)},
        "sets": {
            "selectedInputsSha256": _aggregate_sha256(input_paths),
            "sourceFramesSha256": _aggregate_sha256(source_paths),
            "runtimeFramesSha256": _aggregate_sha256(runtime_paths),
            "contactSheetSha256": _sha256(contact),
        },
        "gates": {
            "sourceEdgeTouches": source_edge_touches,
            "runtimeEdgeTouches": runtime_edge_touches,
            "sourceExactDuplicates": source_duplicates,
            "runtimeExactDuplicates": runtime_duplicates,
            "sourceExactCrossDirectionMirrors": source_mirrors,
            "runtimeExactCrossDirectionMirrors": runtime_mirrors,
            "sourceMaximumBaselineDriftPx": source_baseline_drift,
            "runtimeMaximumBaselineDriftPx": runtime_baseline_drift,
        },
        "sourceDirectionMetrics": source_metrics,
        "runtimeDirectionMetrics": runtime_metrics,
        "errors": errors,
    }
    report_path = QA_ROOT / "world-walk-gait-v3-build-report.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if errors:
        raise SystemExit("; ".join(errors))
    print(report_path)


if __name__ == "__main__":
    main()
