#!/usr/bin/env python3
"""Audit a Beastbound audio bundle without third-party Python packages."""

from __future__ import annotations

import argparse
from array import array
import hashlib
import json
import math
from pathlib import Path
import sys
import wave


AUDITOR_VERSION = "2.0.1"
PEAK_LIMIT_DBFS = -1.0
SILENCE_FLOOR_DBFS = -60.0
DC_ABSOLUTE_LIMIT = 0.001
LOOP_BOUNDARY_DELTA_LIMIT = 0.002
LOOP_WINDOW_RMS_DELTA_DB_LIMIT = 1.0


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[4]


def _default_bundle_root() -> Path:
    return _repo_root() / "client/godot/assets/audio/beastbound_audio_v1"


def _read_json(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def _write_json(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    path.write_text(text, encoding="utf-8")


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _linear_to_db(value: float) -> float:
    return 20.0 * math.log10(max(value, 1e-12))


def _load_wav(path: Path) -> tuple[dict, array]:
    with wave.open(str(path), "rb") as handle:
        channels = handle.getnchannels()
        sample_width = handle.getsampwidth()
        sample_rate = handle.getframerate()
        frame_count = handle.getnframes()
        compression = handle.getcomptype()
        payload = handle.readframes(frame_count)
    if sample_width != 2:
        raise ValueError(f"{path}: expected PCM16, got {sample_width * 8} bit")
    samples = array("h")
    samples.frombytes(payload)
    if sys.byteorder != "little":
        samples.byteswap()
    return (
        {
            "channels": channels,
            "compression": compression,
            "frameCount": frame_count,
            "sampleRate": sample_rate,
            "sampleWidthBits": sample_width * 8,
        },
        samples,
    )


def _signal_metrics(metadata: dict, samples: array, loop: bool) -> dict:
    normalized = [value / 32768.0 for value in samples]
    peak = max((abs(value) for value in normalized), default=0.0)
    mean = sum(normalized) / max(1, len(normalized))
    rms = math.sqrt(
        sum(value * value for value in normalized) / max(1, len(normalized))
    )
    zero_crossings = 0
    previous = normalized[0] if normalized else 0.0
    for value in normalized[1:]:
        if (previous < 0.0 <= value) or (previous >= 0.0 > value):
            zero_crossings += 1
        previous = value
    duration = metadata["frameCount"] / metadata["sampleRate"]
    metrics = {
        **metadata,
        "dcOffset": round(mean, 8),
        "durationSeconds": round(duration, 6),
        "peakDbfs": round(_linear_to_db(peak), 3),
        "rmsDbfs": round(_linear_to_db(rms), 3),
        "zeroCrossingsPerSecond": round(zero_crossings / max(duration, 1e-9), 3),
    }
    if loop:
        channels = metadata["channels"]
        first_frame = [
            normalized[channel] for channel in range(min(channels, len(normalized)))
        ]
        final_frame = [
            normalized[len(normalized) - channels + channel]
            for channel in range(channels)
        ]
        boundary_delta = max(
            (
                abs(final_frame[channel] - first_frame[channel])
                for channel in range(channels)
            ),
            default=0.0,
        )
        window_frames = min(
            metadata["frameCount"] // 4,
            max(1, int(metadata["sampleRate"] * 0.020)),
        )
        window_samples = window_frames * channels
        first_window = normalized[:window_samples]
        final_window = normalized[-window_samples:]
        first_rms = math.sqrt(
            sum(value * value for value in first_window)
            / max(1, len(first_window))
        )
        final_rms = math.sqrt(
            sum(value * value for value in final_window)
            / max(1, len(final_window))
        )
        window_delta_db = abs(
            _linear_to_db(max(first_rms, 1e-12))
            - _linear_to_db(max(final_rms, 1e-12))
        )
        metrics["loop"] = {
            "boundarySampleDelta": round(boundary_delta, 8),
            "threeBoundaryMaxDelta": round(boundary_delta, 8),
            "windowMilliseconds": 20,
            "windowRmsDeltaDb": round(window_delta_db, 3),
        }
    return metrics


def _failure(failures: list[dict], code: str, detail: str) -> None:
    failures.append({"code": code, "detail": detail})


def _confined_path(base: Path, relative_value: str) -> Path | None:
    relative = Path(str(relative_value))
    if relative.is_absolute():
        return None
    resolved_base = base.resolve()
    resolved = (resolved_base / relative).resolve()
    if not resolved.is_relative_to(resolved_base):
        return None
    return resolved


def _spec_sources(spec: dict) -> dict[str, dict]:
    raw_sources = spec.get("sources", [])
    if isinstance(raw_sources, dict):
        raw_sources = [
            {"sourceId": source_id, **source}
            for source_id, source in raw_sources.items()
        ]
    if not isinstance(raw_sources, list):
        return {}
    result: dict[str, dict] = {}
    for source in raw_sources:
        source_id = str(source.get("sourceId", ""))
        if source_id:
            result[source_id] = source
    return result


def _referenced_source_ids(spec: dict) -> set[str]:
    result: set[str] = set()
    for asset in [*spec.get("music", []), *spec.get("sfx", [])]:
        project_copy = asset.get("projectCopy", {})
        if isinstance(project_copy, str):
            source_id = project_copy.strip()
            if source_id:
                result.add(source_id)
        elif isinstance(project_copy, dict):
            source_id = str(project_copy.get("sourceId", "")).strip()
            if source_id:
                result.add(source_id)
        for layer in asset.get("layers", []):
            if not isinstance(layer, dict):
                continue
            source_id = str(layer.get("sourceId", "")).strip()
            if source_id:
                result.add(source_id)
    return result


def _audit_source_records(
    *,
    bundle_root: Path,
    project_root: Path,
    spec: dict,
    provenance: dict,
    failures: list[dict],
) -> set[str]:
    source_specs = _spec_sources(spec)
    source_records = provenance.get("sourceRecords", [])
    if not isinstance(source_records, list) or not source_records:
        _failure(
            failures,
            "missing_source_records",
            "FFmpeg layered bundle requires sourceRecords",
        )
        return set()
    records_by_id: dict[str, dict] = {}
    for record in source_records:
        source_id = str(record.get("sourceId", ""))
        if not source_id or source_id in records_by_id:
            _failure(
                failures,
                "duplicate_source_record",
                f"invalid or duplicate sourceId: {source_id!r}",
            )
            continue
        records_by_id[source_id] = record
        for field in (
            "sourceType",
            "author",
            "licenseName",
            "licenseUrl",
            "sourceSha256",
            "expectedSha256",
        ):
            if not str(record.get(field, "")).strip():
                _failure(
                    failures,
                    "source_record_field",
                    f"{source_id}: missing {field}",
                )
        if "://" not in str(record.get("licenseUrl", "")):
            _failure(
                failures,
                "source_license_url",
                f"{source_id}: invalid licenseUrl",
            )

        path_kind = str(record.get("pathKind", ""))
        if path_kind == "bundle":
            path_value = str(record.get("sourcePath", ""))
            source_path = _confined_path(bundle_root, path_value)
        elif path_kind == "project":
            path_value = str(record.get("projectPath", ""))
            source_path = _confined_path(project_root, path_value)
        else:
            source_path = None
        if source_path is None:
            _failure(
                failures,
                "source_path",
                f"{source_id}: invalid {path_kind or 'pathKind'}",
            )
        elif not source_path.is_file():
            _failure(
                failures,
                "missing_source_asset",
                f"{source_id}: {source_path}",
            )
        else:
            actual_hash = _sha256_file(source_path)
            if actual_hash != record.get("sourceSha256"):
                _failure(
                    failures,
                    "source_hash_mismatch",
                    f"{source_id}: current source differs from provenance",
                )
            if actual_hash != record.get("expectedSha256"):
                _failure(
                    failures,
                    "source_expected_hash",
                    f"{source_id}: current source differs from expectedSha256",
                )

        source_spec = source_specs.get(source_id)
        if source_spec is None:
            _failure(
                failures,
                "source_spec_record",
                f"{source_id}: missing from spec.sources",
            )
            continue
        for field in (
            "sourceType",
            "author",
            "licenseName",
            "licenseUrl",
            "expectedSha256",
        ):
            if str(record.get(field, "")) != str(source_spec.get(field, "")):
                _failure(
                    failures,
                    "source_record_drift",
                    f"{source_id}: {field} differs from spec",
                )
        if (
            path_kind == "bundle"
            and str(record.get("sourcePath", ""))
            != str(source_spec.get("sourcePath", ""))
        ):
            _failure(
                failures,
                "source_record_drift",
                f"{source_id}: sourcePath differs from spec",
            )
        if (
            path_kind == "project"
            and str(record.get("projectPath", ""))
            != str(source_spec.get("projectPath", ""))
        ):
            _failure(
                failures,
                "source_record_drift",
                f"{source_id}: projectPath differs from spec",
            )
    missing_records = sorted(set(source_specs) - set(records_by_id))
    extra_records = sorted(set(records_by_id) - set(source_specs))
    if missing_records:
        _failure(
            failures,
            "missing_source_records",
            ", ".join(missing_records),
        )
    if extra_records:
        _failure(
            failures,
            "unexpected_source_records",
            ", ".join(extra_records),
        )
    return set(records_by_id)


def audit_bundle(
    bundle_root: Path,
    *,
    write_report: bool = True,
    project_root: Path | None = None,
) -> dict:
    bundle_root = Path(bundle_root).resolve()
    project_root = (
        Path(project_root).resolve()
        if project_root is not None
        else _repo_root()
    )
    spec = _read_json(bundle_root / "source/spec.json")
    provenance = _read_json(bundle_root / "source/provenance.json")
    catalog = _read_json(bundle_root / "audio-cues.json")
    failures: list[dict] = []
    asset_metrics: dict[str, dict] = {}
    expected_review_state = "owner_listening_pending"
    for document_name, document in (
        ("spec", spec),
        ("provenance", provenance),
        ("catalog", catalog),
    ):
        if document.get("reviewState") != expected_review_state:
            _failure(
                failures,
                "review_state",
                (
                    f"{document_name}: expected {expected_review_state}, "
                    f"got {document.get('reviewState')}"
                ),
            )

    spec_path = bundle_root / "source/spec.json"
    if provenance.get("sourceSpecificationSha256") != _sha256_file(spec_path):
        _failure(
            failures,
            "source_spec_hash",
            "source/spec.json differs from provenance",
        )
    generator_info = provenance.get("generator", {})
    generator_relative_path = generator_info.get("implementation", "")
    generator_path = _repo_root() / generator_relative_path
    if not generator_path.is_file():
        _failure(
            failures,
            "generator_path",
            f"missing generator: {generator_relative_path}",
        )
    elif generator_info.get("implementationSha256") != _sha256_file(generator_path):
        _failure(
            failures,
            "generator_hash",
            "generator implementation differs from provenance",
        )
    is_layered_bundle = (
        str(generator_relative_path).endswith("build_cc0_audio_bundle.py")
        or int(provenance.get("schemaVersion", 1)) >= 2
    )
    source_record_ids: set[str] = set()
    if is_layered_bundle:
        if int(generator_info.get("ffmpegMajor", 0)) != 8:
            _failure(
                failures,
                "ffmpeg_version",
                f"expected FFmpeg 8, got {generator_info.get('ffmpegVersion')}",
            )
        source_record_ids = _audit_source_records(
            bundle_root=bundle_root,
            project_root=project_root,
            spec=spec,
            provenance=provenance,
            failures=failures,
        )
        referenced_source_ids = _referenced_source_ids(spec)
        unused_source_ids = sorted(
            source_record_ids - referenced_source_ids
        )
        unknown_source_ids = sorted(
            referenced_source_ids - source_record_ids
        )
        if unused_source_ids:
            _failure(
                failures,
                "unused_source",
                ", ".join(unused_source_ids),
            )
        if unknown_source_ids:
            _failure(
                failures,
                "unknown_source_reference",
                ", ".join(unknown_source_ids),
            )

    bundle_id = str(spec.get("bundleId", ""))
    if bundle_root.name != bundle_id:
        _failure(
            failures,
            "bundle_directory",
            f"directory={bundle_root.name} bundleId={bundle_id}",
        )
    for document_name, document in (
        ("provenance", provenance),
        ("catalog", catalog),
    ):
        if document.get("bundleId") != bundle_id:
            _failure(
                failures,
                "bundle_id",
                (
                    f"{document_name}: expected {bundle_id}, "
                    f"got {document.get('bundleId')}"
                ),
            )

    expected_contexts = {"town", "wilderness", "cave", "battle_normal"}
    present_contexts = set(catalog.get("contexts", {}))
    if present_contexts != expected_contexts:
        _failure(
            failures,
            "context_coverage",
            f"expected {sorted(expected_contexts)}, got {sorted(present_contexts)}",
        )

    required_cues = set(spec["requiredCanonicalCues"])
    catalog_cues = set(catalog.get("cues", {}))
    missing_cues = sorted(required_cues - catalog_cues)
    extra_cues = sorted(catalog_cues - required_cues)
    if missing_cues:
        _failure(failures, "missing_cues", ", ".join(missing_cues))
    if extra_cues:
        _failure(failures, "unexpected_cues", ", ".join(extra_cues))

    ledger_by_asset = {
        entry["assetId"]: entry for entry in provenance.get("ledger", [])
    }
    source_by_cue = {
        asset["cueId"]: asset
        for asset in [*spec.get("music", []), *spec.get("sfx", [])]
    }
    expected_runtime_paths: set[Path] = set()
    music_features: dict[str, tuple[float, float, float]] = {}
    peak_limit = 10.0 ** (PEAK_LIMIT_DBFS / 20.0)

    for cue_id, cue in sorted(catalog.get("cues", {}).items()):
        if cue_id.startswith("music."):
            expected_bus = "Music"
        elif cue_id.startswith("combat."):
            expected_bus = "Combat"
        elif cue_id.startswith("creature."):
            expected_bus = "Pet"
        elif cue_id.startswith("ui."):
            expected_bus = "UI"
        else:
            expected_bus = "SFX"
        if cue.get("bus") != expected_bus:
            _failure(
                failures,
                "bus_binding",
                f"{cue_id}: expected {expected_bus}, got {cue.get('bus')}",
            )
        prefix = f"res://assets/audio/{bundle_id}/"
        runtime_path = str(cue["path"])
        if not runtime_path.startswith(prefix):
            _failure(failures, "invalid_resource_path", f"{cue_id}: {runtime_path}")
            continue
        relative_path = Path(runtime_path[len(prefix) :])
        expected_runtime_paths.add(relative_path)
        absolute_path = bundle_root / relative_path
        if not absolute_path.is_file():
            _failure(failures, "missing_runtime_asset", f"{cue_id}: {relative_path}")
            continue
        try:
            metadata, samples = _load_wav(absolute_path)
        except (ValueError, wave.Error) as error:
            _failure(failures, "invalid_wav", str(error))
            continue
        metrics = _signal_metrics(metadata, samples, bool(cue["loop"]))
        metrics["sha256"] = _sha256_file(absolute_path)
        asset_metrics[cue_id] = metrics

        expected_channels = 2 if cue["role"] == "music" else 1
        if metadata["sampleRate"] != 48000:
            _failure(
                failures,
                "sample_rate",
                f"{cue_id}: {metadata['sampleRate']} Hz",
            )
        if metadata["channels"] != expected_channels:
            _failure(
                failures,
                "channels",
                f"{cue_id}: expected {expected_channels}, got {metadata['channels']}",
            )
        if metadata["compression"] != "NONE":
            _failure(
                failures,
                "compression",
                f"{cue_id}: expected PCM, got {metadata['compression']}",
            )
        peak = 10.0 ** (metrics["peakDbfs"] / 20.0)
        if peak > peak_limit + 1e-6:
            _failure(
                failures,
                "clipping_headroom",
                f"{cue_id}: {metrics['peakDbfs']} dBFS exceeds {PEAK_LIMIT_DBFS}",
            )
        if metrics["rmsDbfs"] < SILENCE_FLOOR_DBFS:
            _failure(
                failures,
                "silence",
                f"{cue_id}: RMS {metrics['rmsDbfs']} dBFS",
            )
        if abs(metrics["dcOffset"]) > DC_ABSOLUTE_LIMIT:
            _failure(
                failures,
                "dc_offset",
                f"{cue_id}: absolute DC {abs(metrics['dcOffset'])}",
            )
        if cue["loop"]:
            loop_metrics = metrics["loop"]
            if loop_metrics["boundarySampleDelta"] > LOOP_BOUNDARY_DELTA_LIMIT:
                _failure(
                    failures,
                    "loop_boundary",
                    (
                        f"{cue_id}: sample delta "
                        f"{loop_metrics['boundarySampleDelta']}"
                    ),
                )
            if (
                loop_metrics["windowRmsDeltaDb"]
                > LOOP_WINDOW_RMS_DELTA_DB_LIMIT
            ):
                _failure(
                    failures,
                    "loop_window",
                    (
                        f"{cue_id}: edge-window RMS delta "
                        f"{loop_metrics['windowRmsDeltaDb']} dB"
                    ),
                )
            music_features[cue_id] = (
                metrics["rmsDbfs"],
                metrics["zeroCrossingsPerSecond"],
                metrics["durationSeconds"],
            )

        asset_id = cue["assetId"]
        ledger = ledger_by_asset.get(asset_id)
        if ledger is None:
            _failure(failures, "missing_ledger", f"{cue_id}: {asset_id}")
        else:
            if ledger.get("runtimeSha256") != metrics["sha256"]:
                _failure(
                    failures,
                    "hash_mismatch",
                    f"{cue_id}: runtime hash differs from provenance",
                )
            if ledger.get("cueIds") != [cue_id]:
                _failure(
                    failures,
                    "ledger_cue_binding",
                    f"{asset_id}: {ledger.get('cueIds')}",
                )
            if ledger.get("durationFrames") != metadata["frameCount"]:
                _failure(
                    failures,
                    "ledger_duration",
                    (
                        f"{cue_id}: ledger={ledger.get('durationFrames')} "
                        f"wav={metadata['frameCount']}"
                    ),
                )
            if is_layered_bundle:
                ledger_source_ids = ledger.get("sourceIds", [])
                if (
                    not isinstance(ledger_source_ids, list)
                    or not ledger_source_ids
                ):
                    _failure(
                        failures,
                        "ledger_source_ids",
                        f"{asset_id}: missing sourceIds",
                    )
                else:
                    unknown_source_ids = sorted(
                        set(str(value) for value in ledger_source_ids)
                        - source_record_ids
                    )
                    if unknown_source_ids:
                        _failure(
                            failures,
                            "ledger_source_ids",
                            (
                                f"{asset_id}: unknown sourceIds "
                                + ", ".join(unknown_source_ids)
                            ),
                        )
            source_asset = source_by_cue.get(cue_id)
            if source_asset is None:
                _failure(failures, "source_asset", f"{cue_id}: missing from spec")
            else:
                source_fragment = json.dumps(
                    source_asset,
                    ensure_ascii=False,
                    sort_keys=True,
                    separators=(",", ":"),
                ).encode("utf-8")
                expected_fragment_hash = _sha256_bytes(source_fragment)
                if (
                    ledger.get("sourceSpecificationFragmentSha256")
                    != expected_fragment_hash
                ):
                    _failure(
                        failures,
                        "source_fragment_hash",
                        f"{cue_id}: source fragment differs from provenance",
                    )

    actual_runtime_paths = {
        path.relative_to(bundle_root)
        for path in (bundle_root / "runtime").rglob("*.wav")
        if path.is_file()
    }
    orphan_paths = sorted(
        path.as_posix() for path in actual_runtime_paths - expected_runtime_paths
    )
    if orphan_paths:
        _failure(failures, "orphan_assets", ", ".join(orphan_paths))
    if len(ledger_by_asset) != len(catalog_cues):
        _failure(
            failures,
            "ledger_count",
            f"ledger={len(ledger_by_asset)} cues={len(catalog_cues)}",
        )

    music_cues = sorted(music_features)
    for left_index, left_id in enumerate(music_cues):
        for right_id in music_cues[left_index + 1 :]:
            left = music_features[left_id]
            right = music_features[right_id]
            feature_distance = (
                abs(left[0] - right[0])
                + abs(left[1] - right[1]) / 100.0
                + abs(left[2] - right[2])
            )
            if feature_distance < 0.25:
                _failure(
                    failures,
                    "music_distinguishability",
                    f"{left_id} and {right_id} feature distance {feature_distance:.3f}",
                )

    context_cues = set(catalog.get("contexts", {}).values())
    if context_cues != {
        "music.town",
        "music.wilderness",
        "music.cave",
        "music.battle_normal",
    }:
        _failure(
            failures,
            "context_binding",
            f"unexpected context cue set: {sorted(context_cues)}",
        )

    report = {
        "assetCount": len(asset_metrics),
        "assets": asset_metrics,
        "auditor": {
            "implementation": (
                ".agents/skills/design-beastbound-audio/scripts/"
                "audit_audio_bundle.py"
            ),
            "version": AUDITOR_VERSION,
        },
        "bundleId": spec["bundleId"],
        "failures": failures,
        "freezeTimestampUtc": spec["freezeTimestampUtc"],
        "gates": {
            "dcAbsoluteLimit": DC_ABSOLUTE_LIMIT,
            "loopBoundaryDeltaLimit": LOOP_BOUNDARY_DELTA_LIMIT,
            "loopWindowRmsDeltaDbLimit": LOOP_WINDOW_RMS_DELTA_DB_LIMIT,
            "peakLimitDbfs": PEAK_LIMIT_DBFS,
            "silenceFloorDbfs": SILENCE_FLOOR_DBFS,
        },
        "ownerListeningState": spec["reviewState"],
        "status": "pass" if not failures else "fail",
    }
    if write_report:
        _write_json(bundle_root / "audit-report.json", report)
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--bundle",
        type=Path,
        default=_default_bundle_root(),
        help="audio bundle root",
    )
    parser.add_argument(
        "--no-write-report",
        action="store_true",
        help="audit without replacing audit-report.json",
    )
    args = parser.parse_args()
    report = audit_bundle(args.bundle, write_report=not args.no_write_report)
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))
    return 0 if report["status"] == "pass" else 1


if __name__ == "__main__":
    raise SystemExit(main())
